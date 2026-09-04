const axios = require('axios');
const https = require('https');
const dotenv = require('dotenv');
const { getExternalDb } = require('./db');

dotenv.config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function syncDGEHM() {
    console.log('--- Sincronizador Directo DGEHM -> BD ---');
    console.log('1. Conectando al portal de DGEHM...');
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = 'https://sinapp.dgehm.gob.sv/DRHM/estadisticas.aspx?uid=2';
    
    const res1 = await axios.get(url, {
        httpsAgent: agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 25000
    });

    const rawCookies = res1.headers['set-cookie'];
    const cookies = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
    const match = res1.data.match(/"ExportUrlBase":"([^"]+)"/);
    if (!match) throw new Error('No se encontró el ExportUrlBase en la página de DGEHM');

    const exportUrl = 'https://sinapp.dgehm.gob.sv' + match[1].replace(/\\u0026/g, '&') + 'CSV';
    console.log('2. Descargando reporte oficial en CSV...');
    const res2 = await axios.get(exportUrl, {
        httpsAgent: agent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Cookie': cookies,
            'Referer': url
        },
        timeout: 35000
    });

    const csvText = String(res2.data || '');
    const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
    console.log(`3. Reporte recibido: ${lines.length} líneas.`);

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

    console.log(`4. Estaciones parseadas de DGEHM: ${parsedRows.length}`);
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

    console.log(`5. Estaciones coincidentes configuradas en BD: ${matchedRows.length}`);
    if (matchedRows.length === 0) {
        throw new Error('No se encontraron coincidencias de nombres entre DGEHM y la base de datos');
    }

    const cleanNum = (val) => {
        const s = String(val || '');
        const cleaned = s.replace(/[^0-9.-]/g, '');
        const n = Number(cleaned);
        return isNaN(n) ? 0 : n;
    };

    const conn = await externalDb.getConnection();
    await conn.beginTransaction();
    try {
        await conn.query('DELETE FROM web_precios_competencia');
        const insertSql = 'INSERT INTO web_precios_competencia (estacion, modificacion, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a) VALUES ?';
        const values = matchedRows.map(r => [
            r.estacion, r.modificacion,
            cleanNum(r.super_c), cleanNum(r.regular_c), cleanNum(r.ion_c), cleanNum(r.diesel_c),
            cleanNum(r.super_a), cleanNum(r.regular_a), cleanNum(r.ion_a), cleanNum(r.diesel_a)
        ]);
        await conn.query(insertSql, [values]);
        await conn.commit();
        console.log(`✅ ¡ÉXITO! Se actualizaron los precios de ${matchedRows.length} estaciones en la base de datos.`);
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
            console.error('❌ Error en sincronización:', err.message);
            process.exit(1);
        });
}

module.exports = syncDGEHM;
