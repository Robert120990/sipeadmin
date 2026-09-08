const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { getExternalDb } = require('./db');

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

async function syncDGEHM() {
    writeLog('=== INICIANDO SINCRONIZACIÓN DIRECTA DGEHM -> BD ===');
    writeLog('1. Conectando al portal oficial de DGEHM...');
    
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = 'https://sinapp.dgehm.gob.sv/DRHM/estadisticas.aspx?uid=2';
    
    const res1 = await axios.get(url, {
        httpsAgent: agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 30000
    });

    const rawCookies = res1.headers['set-cookie'];
    const cookies = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
    const match = res1.data.match(/"ExportUrlBase":"([^"]+)"/);
    if (!match) throw new Error('No se encontró el ExportUrlBase en la página de DGEHM');

    const exportUrl = 'https://sinapp.dgehm.gob.sv' + match[1].replace(/\\u0026/g, '&') + 'CSV';
    writeLog('2. Descargando reporte oficial en formato CSV...');
    
    const res2 = await axios.get(exportUrl, {
        httpsAgent: agent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Cookie': cookies,
            'Referer': url
        },
        timeout: 45000
    });

    const csvText = String(res2.data || '');
    const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
    writeLog(`3. Reporte descargado exitosamente: ${lines.length} líneas.`);

    const parseLine = (line) => {
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

    const parsedRows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        if (cols.length < 14) continue;
        parsedRows.push({
            estacion: cols[2],
            modificacion: cols[3],
            super_c: cols[4],
            regular_c: cols[5],
            ion_c: cols[7],
            diesel_c: cols[8],
            super_a: cols[9],
            regular_a: cols[10],
            ion_a: cols[12],
            diesel_a: cols[13]
        });
    }

    writeLog(`4. Estaciones parseadas de DGEHM: ${parsedRows.length}`);
    const externalDb = await getExternalDb();
    const [mappedStations] = await externalDb.query('SELECT competencia FROM web_estaciones_competencia');

    const norm = str => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    const mappedMap = new Map();
    mappedStations.forEach(m => {
        mappedMap.set(norm(m.competencia), m.competencia);
    });

    const matchedRows = [];
    const seenStations = new Set();
    parsedRows.forEach(row => {
        const nName = norm(row.estacion);
        if (mappedMap.has(nName)) {
            const dbName = mappedMap.get(nName);
            if (!seenStations.has(dbName)) {
                seenStations.add(dbName);
                matchedRows.push({
                    estacion: dbName,
                    modificacion: row.modificacion,
                    super_c: row.super_c,
                    regular_c: row.regular_c,
                    ion_c: row.ion_c,
                    diesel_c: row.diesel_c,
                    super_a: row.super_a,
                    regular_a: row.regular_a,
                    ion_a: row.ion_a,
                    diesel_a: row.diesel_a
                });
            }
        }
    });

    writeLog(`5. Estaciones coincidentes en catálogo local: ${matchedRows.length} de ${mappedStations.length}`);
    if (matchedRows.length === 0) {
        throw new Error('No se encontraron coincidencias de nombres entre DGEHM y la base de datos');
    }

    const cleanNum = (val) => {
        const s = String(val || '');
        const cleaned = s.replace(/[^0-9.-]/g, '');
        const n = Number(cleaned);
        return isNaN(n) ? 0 : n;
    };

    const today = new Date().toISOString().split('T')[0];
    const conn = await externalDb.getConnection();
    await conn.beginTransaction();
    try {
        // 1. Update snapshot
        await conn.query('DELETE FROM web_precios_competencia');
        const insertSql = 'INSERT INTO web_precios_competencia (estacion, modificacion, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a) VALUES ?';
        const values = matchedRows.map(r => [
            r.estacion, r.modificacion,
            cleanNum(r.super_c), cleanNum(r.regular_c), cleanNum(r.ion_c), cleanNum(r.diesel_c),
            cleanNum(r.super_a), cleanNum(r.regular_a), cleanNum(r.ion_a), cleanNum(r.diesel_a)
        ]);
        await conn.query(insertSql, [values]);

        // 2. Update historical table
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
                    diesel_a = VALUES(diesel_a)
            `, [
                r.estacion, r.modificacion, today,
                cleanNum(r.super_c), cleanNum(r.regular_c), cleanNum(r.ion_c), cleanNum(r.diesel_c),
                cleanNum(r.super_a), cleanNum(r.regular_a), cleanNum(r.ion_a), cleanNum(r.diesel_a)
            ]);
        }

        await conn.commit();
        writeLog(`✅ ¡ÉXITO! Se actualizaron correctamente ${matchedRows.length} estaciones en snapshot e historial.`);
        return { success: true, count: matchedRows.length, total: mappedStations.length };
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

module.exports = syncDGEHM;
