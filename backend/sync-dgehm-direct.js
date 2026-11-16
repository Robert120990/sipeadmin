const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const { getDb } = require('./db');

const logFile = path.join(__dirname, 'logs', 'dgehm_sync.log');
const ensureLogDir = () => {
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const writeLog = (msg) => {
    ensureLogDir();
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    process.stdout.write(line);
    try {
        fs.appendFileSync(logFile, line, 'utf8');
    } catch (e) {
        console.error('Error writing to log file:', e.message);
    }
};

const cleanNum = (val) => {
    if (val === null || val === undefined) return 0;
    const s = String(val);
    const cleaned = s.replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
};

const formatIsoToDgehmDate = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
    hours = hours % 12 || 12;
    const hh = String(hours).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${sec} ${ampm}`;
};

const parseCsvLine = (line) => {
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === ',' && !inQuotes) { cols.push(cur.trim()); cur = ''; }
        else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
};

async function fetchPrimaryDgehm() {
    const agent = new https.Agent({ rejectUnauthorized: false, family: 4 });
    const url = 'https://sinapp.dgehm.gob.sv/DRHM/estadisticas.aspx?uid=2';

    const res1 = await axios.get(url, {
        httpsAgent: agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 10000
    });

    const rawCookies = res1.headers['set-cookie'];
    const cookies = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
    const htmlBody = String(res1.data || '');
    const match = htmlBody.match(/"ExportUrlBase":"([^"]+)"/);
    if (!match) {
        if (htmlBody.includes('No es posible conectar con el servidor remoto') || htmlBody.includes('192.168.1.6')) {
            throw new Error('El portal oficial DGEHM presenta caída interna en su servidor de reportes (192.168.1.6:80)');
        }
        throw new Error('No se encontró ExportUrlBase en la página de DGEHM');
    }

    const exportUrl = 'https://sinapp.dgehm.gob.sv' + match[1].replace(/\\u0026/g, '&') + 'CSV';
    const res2 = await axios.get(exportUrl, {
        httpsAgent: agent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Cookie': cookies,
            'Referer': url
        },
        timeout: 30000
    });

    const csvText = String(res2.data || '');
    const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length <= 1) {
        throw new Error('El reporte CSV de DGEHM vino vacío');
    }

    const parsedRows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 14) continue;
        parsedRows.push({
            estacion: cols[2],
            modificacion: cols[3],
            super_c: cleanNum(cols[4]),
            regular_c: cleanNum(cols[5]),
            ion_c: cleanNum(cols[7]),
            diesel_c: cleanNum(cols[8]),
            super_a: cleanNum(cols[9]),
            regular_a: cleanNum(cols[10]),
            ion_a: cleanNum(cols[12]),
            diesel_a: cleanNum(cols[13])
        });
    }

    return { rows: parsedRows, source: 'DGEHM_OFICIAL' };
}

async function fetchMirrorGasolinaSv() {
    const agent = new https.Agent({ family: 4 });
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
    const allItems = [];

    const first = await axios.get('https://gasolinasv.com/api/gasolineras?page=0&size=100', {
        httpsAgent: agent,
        headers,
        timeout: 12000
    });
    const firstContent = Array.isArray(first.data?.content) ? first.data.content : [];
    allItems.push(...firstContent);
    const totalPages = Math.min(20, parseInt(first.data?.totalPages, 10) || 1);

    for (let p = 1; p < totalPages; p++) {
        const resPage = await axios.get(`https://gasolinasv.com/api/gasolineras?page=${p}&size=100`, {
            httpsAgent: agent,
            headers,
            timeout: 12000
        });
        if (Array.isArray(resPage.data?.content)) {
            allItems.push(...resPage.data.content);
        }
    }

    if (allItems.length === 0) {
        throw new Error('La API espejo no devolvió estaciones');
    }

    const parsedRows = allItems.map(item => {
        const up = item.ultimoPrecio || {};
        return {
            estacion: item.estacion || '',
            modificacion: formatIsoToDgehmDate(up.fechaReporte),
            super_c: cleanNum(up.especialSc),
            regular_c: cleanNum(up.regularSc),
            ion_c: cleanNum(up.ionDieselSc),
            diesel_c: cleanNum(up.dieselLSSc ?? up.dieselSc),
            super_a: cleanNum(up.especialAuto),
            regular_a: cleanNum(up.regularAuto),
            ion_a: cleanNum(up.ionDieselAuto),
            diesel_a: cleanNum(up.dieselLSAuto ?? up.dieselAuto)
        };
    }).filter(r => r.estacion);

    return { rows: parsedRows, source: 'GASOLINASV_API' };
}

async function fetchAllFuelPricesWithFallback(logger = writeLog) {
    try {
        logger('1. Consultando API integrada de GasolinaSV (datos SINAPP/DGEHM)...');
        return await fetchMirrorGasolinaSv();
    } catch (mirrorErr) {
        logger(`⚠️ GasolinaSV no disponible (${mirrorErr.message}). Intentando portal primario DGEHM...`);
        return await fetchPrimaryDgehm();
    }
}

const normExact = str => (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const normFuzzy = str => normExact(str)
    .replace(/\b(ESTACION DE SERVICIO|E S|GASOLINERA|DE|LA|EL|LOS|LAS)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STATION_ALIASES = {
    'PUMA PARADOR DE DON PACUN': 'PUMA PARADOR DON PACUN',
    'PUMA IZALCO': 'PUMA PEREGRINO IZALCO',
    'TEXACO GASOLINERA TAZUMAL': 'E S TAZUMAL',
    'ALBA TAZUMAL': 'E S TAZUMAL',
    'TEXACO PANAMERICANA': 'TEXACO ILOPANGO',
    'UNO ILOPANGO': 'UNO SAN BARTOLO'
};

function matchStationsToCatalog(parsedRows, mappedStations, existingSnapshotRows = []) {
    const existingByNorm = new Map();
    for (const ex of existingSnapshotRows) {
        existingByNorm.set(normExact(ex.estacion), ex);
    }

    const sourceExactMap = new Map();
    const sourceFuzzyMap = new Map();
    for (const row of parsedRows) {
        const ne = normExact(row.estacion);
        const nf = normFuzzy(row.estacion);
        if (ne && !sourceExactMap.has(ne)) sourceExactMap.set(ne, row);
        if (nf && !sourceFuzzyMap.has(nf)) sourceFuzzyMap.set(nf, row);
    }

    const matchedRows = [];
    const seenDbNames = new Set();

    for (const m of mappedStations) {
        const dbName = (m.competencia || '').trim();
        if (!dbName || seenDbNames.has(dbName)) continue;

        const ne = normExact(dbName);
        const aliasTarget = STATION_ALIASES[ne] || null;
        const nf = normFuzzy(dbName);
        const src = sourceExactMap.get(ne)
            || (aliasTarget ? sourceExactMap.get(aliasTarget) : null)
            || (nf ? sourceFuzzyMap.get(nf) : null);
        if (!src) continue;

        seenDbNames.add(dbName);
        const prev = existingByNorm.get(ne);
        const sameMod = prev && normExact(prev.modificacion) === normExact(src.modificacion);

        matchedRows.push({
            estacion: dbName,
            modificacion: src.modificacion,
            super_c: cleanNum(src.super_c),
            regular_c: cleanNum(src.regular_c),
            ion_c: cleanNum(src.ion_c) || (sameMod ? cleanNum(prev.ion_c) : 0),
            diesel_c: cleanNum(src.diesel_c),
            super_a: cleanNum(src.super_a),
            regular_a: cleanNum(src.regular_a),
            ion_a: cleanNum(src.ion_a) || (sameMod ? cleanNum(prev.ion_a) : 0),
            diesel_a: cleanNum(src.diesel_a)
        });
    }

    return matchedRows;
}

async function syncDGEHM(io = null) {
    writeLog('=== INICIANDO SINCRONIZACIÓN DGEHM -> BD ===');
    const { rows: parsedRows, source } = await fetchAllFuelPricesWithFallback(writeLog);
    writeLog(`2. Estaciones obtenidas (${source}): ${parsedRows.length}`);

    const localDb = await getDb();
    const [mappedStations] = await localDb.query('SELECT competencia FROM web_estaciones_competencia');
    const [existingSnap] = await localDb.query('SELECT * FROM web_precios_competencia').catch(() => [[]]);

    const matchedRows = matchStationsToCatalog(parsedRows, mappedStations, existingSnap);
    writeLog(`3. Estaciones coincidentes en catálogo local: ${matchedRows.length} de ${mappedStations.length}`);
    if (matchedRows.length === 0) {
        throw new Error('No se encontraron coincidencias de nombres entre DGEHM y la base de datos');
    }

    const today = new Date().toISOString().split('T')[0];
    const conn = await localDb.getConnection();
    await conn.beginTransaction();
    try {
        await conn.query('DELETE FROM web_precios_competencia');
        const insertSql = 'INSERT INTO web_precios_competencia (estacion, modificacion, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a) VALUES ?';
        const values = matchedRows.map(r => [
            r.estacion, r.modificacion,
            r.super_c, r.regular_c, r.ion_c, r.diesel_c,
            r.super_a, r.regular_a, r.ion_a, r.diesel_a
        ]);
        await conn.query(insertSql, [values]);

        for (const r of matchedRows) {
            await conn.query(`
                INSERT INTO web_precios_competencia_historial 
                (estacion, modificacion, fecha_registro, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    modificacion = VALUES(modificacion),
                    super_c = VALUES(super_c),
                    regular_c = VALUES(regular_c),
                    ion_c = VALUES(ion_c),
                    diesel_c = VALUES(diesel_c),
                    super_a = VALUES(super_a),
                    regular_a = VALUES(regular_a),
                    ion_a = VALUES(ion_a),
                    diesel_a = VALUES(diesel_a),
                    created_at = CURRENT_TIMESTAMP
            `, [
                r.estacion, r.modificacion, today,
                r.super_c, r.regular_c, r.ion_c, r.diesel_c,
                r.super_a, r.regular_a, r.ion_a, r.diesel_a
            ]);
        }

        await conn.commit();
        writeLog(`✅ ¡ÉXITO! Se actualizaron correctamente ${matchedRows.length} estaciones (${source}).`);
        if (io) {
            try {
                io.emit('precios_competencia_updated', {
                    timestamp: new Date().toISOString(),
                    count: matchedRows.length,
                    total: mappedStations.length,
                    totalConfigured: mappedStations.length,
                    totalDGEHM: parsedRows.length,
                    source
                });
            } catch (ioErr) {
                writeLog(`⚠️ Error emitiendo evento socket: ${ioErr.message}`);
            }
        }
        return {
            success: true,
            source,
            count: matchedRows.length,
            total: mappedStations.length,
            totalConfigured: mappedStations.length,
            totalDGEHM: parsedRows.length,
            timestamp: new Date().toISOString()
        };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

if (require.main === module) {
    syncDGEHM()
        .then(() => process.exit(0))
        .catch(err => {
            writeLog(`❌ Error en sincronización: ${err.message}`);
            process.exit(1);
        });
}

syncDGEHM.fetchAllFuelPricesWithFallback = fetchAllFuelPricesWithFallback;
syncDGEHM.matchStationsToCatalog = matchStationsToCatalog;

module.exports = syncDGEHM;
