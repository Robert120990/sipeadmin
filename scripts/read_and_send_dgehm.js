#!/usr/bin/env node
/**
 * SIPE Admin - Lector y Emisor Remoto de Precios de Competencia (Servidor 169.58.207.115)
 * 1. Lee los precios desde DGEHM oficial (primario) o espejo JSON SINAPP (fallback automático)
 * 2. Envía vía API HTTP protegida (/upload) a admin.sipesv.com, con respaldo transaccional MySQL
 *    hacia db_sipe_admin usando variables de entorno (.env).
 */

const https = require('https');

const ADMIN_BASE_URL = process.env.SIPE_ADMIN_URL || 'https://admin.sipesv.com';
const API_KEY = process.env.SYNC_API_KEY || process.env.PORTAL_SYNC_API_KEY || '';

function loadMysql2() {
    const candidates = [
        'mysql2/promise',
        '/home/rsboosted/SIPEWEBgas/server/node_modules/mysql2/promise',
        require('path').resolve(__dirname, '../backend/node_modules/mysql2/promise')
    ];
    for (const mod of candidates) {
        try {
            return require(mod);
        } catch (_e) {
            // try next
        }
    }
    throw new Error('Módulo mysql2/promise no disponible para conexión de respaldo');
}

function httpRequest(urlStr, { method = 'GET', headers = {}, body = null, timeout = 15000, rejectUnauthorized = true } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
        const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            ...headers
        };
        if (payload) {
            reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = https.request({
            hostname: u.hostname,
            port: u.port || 443,
            path: u.pathname + u.search,
            method,
            headers: reqHeaders,
            family: 4,
            rejectUnauthorized
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                resolve({ status: res.statusCode, headers: res.headers, text });
            });
        });

        req.setTimeout(timeout, () => {
            req.destroy(new Error(`Timeout of ${timeout}ms exceeded (${u.hostname})`));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

const cleanNum = (val) => {
    if (val === null || val === undefined) return 0;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
};

const formatIsoToDgehmDate = (isoStr) => {
    if (!isoStr) return '';
    const [datePart, timePart] = String(isoStr).split('T');
    if (datePart && timePart) {
        const [yyyy, mm, dd] = datePart.split('-');
        const [hhRaw, min = '00', sec = '00'] = timePart.split(':');
        let hours = parseInt(hhRaw, 10);
        const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
        hours = hours % 12 || 12;
        return `${dd}/${mm}/${yyyy} ${String(hours).padStart(2, '0')}:${min}:${sec.slice(0, 2)} ${ampm}`;
    }
    return String(isoStr);
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

async function readPrimaryDgehm() {
    const url = 'https://sinapp.dgehm.gob.sv/DRHM/estadisticas.aspx?uid=2';
    const res1 = await httpRequest(url, { timeout: 10000, rejectUnauthorized: false });
    if (res1.status !== 200) throw new Error(`HTTP ${res1.status} en DGEHM`);

    const rawCookies = res1.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
    const match = res1.text.match(/"ExportUrlBase":"([^"]+)"/);
    if (!match) {
        if (res1.text.includes('192.168.1.6') || res1.text.includes('No es posible conectar')) {
            throw new Error('Servidor interno DGEHM (192.168.1.6:80) caído');
        }
        throw new Error('ExportUrlBase no disponible en DGEHM');
    }

    const exportUrl = 'https://sinapp.dgehm.gob.sv' + match[1].replace(/\\u0026/g, '&') + 'CSV';
    const res2 = await httpRequest(exportUrl, {
        timeout: 25000,
        rejectUnauthorized: false,
        headers: { Cookie: cookies, Referer: url }
    });

    const lines = res2.text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length <= 1) throw new Error('CSV de DGEHM vacío');

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length < 14) continue;
        rows.push({
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
    return { source: 'DGEHM_OFICIAL', rows };
}

async function readMirrorSinappApi() {
    const allItems = [];
    const first = await httpRequest('https://gasolinasv.com/api/gasolineras?page=0&size=100', { timeout: 12000 });
    if (first.status !== 200) throw new Error(`HTTP ${first.status} en espejo SINAPP`);
    const firstJson = JSON.parse(first.text);
    allItems.push(...(firstJson.content || []));
    const totalPages = Math.min(20, parseInt(firstJson.totalPages, 10) || 1);

    for (let p = 1; p < totalPages; p++) {
        const resPage = await httpRequest(`https://gasolinasv.com/api/gasolineras?page=${p}&size=100`, { timeout: 12000 });
        if (resPage.status === 200) {
            const pageJson = JSON.parse(resPage.text);
            allItems.push(...(pageJson.content || []));
        }
    }

    if (allItems.length === 0) throw new Error('Espejo SINAPP devolvió 0 estaciones');

    const rows = allItems.map(item => {
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

    return { source: 'GASOLINASV_API', rows };
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

function matchStations(feedRows, mappedStations, existingSnap = []) {
    const existingMap = new Map(existingSnap.map(r => [normExact(r.estacion), r]));
    const sourceExact = new Map();
    const sourceFuzzy = new Map();
    for (const r of feedRows) {
        const ne = normExact(r.estacion);
        const nf = normFuzzy(r.estacion);
        if (ne && !sourceExact.has(ne)) sourceExact.set(ne, r);
        if (nf && !sourceFuzzy.has(nf)) sourceFuzzy.set(nf, r);
    }

    const matched = [];
    const seen = new Set();
    for (const m of mappedStations) {
        const dbName = (m.competencia || '').trim();
        if (!dbName || seen.has(dbName)) continue;
        const ne = normExact(dbName);
        const aliasTarget = STATION_ALIASES[ne] || null;
        const src = sourceExact.get(ne)
            || (aliasTarget ? sourceExact.get(aliasTarget) : null)
            || sourceFuzzy.get(normFuzzy(dbName));
        if (!src) continue;
        seen.add(dbName);
        const prev = existingMap.get(normExact(dbName));
        const sameMod = prev && normExact(prev.modificacion) === normExact(src.modificacion);
        matched.push({
            estacion: dbName,
            modificacion: src.modificacion,
            super_c: src.super_c,
            regular_c: src.regular_c,
            ion_c: src.ion_c || (sameMod ? cleanNum(prev.ion_c) : 0),
            diesel_c: src.diesel_c,
            super_a: src.super_a,
            regular_a: src.regular_a,
            ion_a: src.ion_a || (sameMod ? cleanNum(prev.ion_a) : 0),
            diesel_a: src.diesel_a
        });
    }
    return matched;
}

async function syncViaDirectDb(feed) {
    if (!process.env.DB_HOST || !process.env.DB_USER) {
        throw new Error('Variables DB_HOST / DB_USER no definidas en .env para respaldo directo');
    }
    const mysql = loadMysql2();
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'db_sipe_admin',
        connectTimeout: 10000
    });

    try {
        const [mappedStations] = await conn.query('SELECT competencia FROM web_estaciones_competencia');
        const [existingSnap] = await conn.query('SELECT * FROM web_precios_competencia').catch(() => [[]]);
        const matched = matchStations(feed.rows, mappedStations, existingSnap);
        if (matched.length === 0) {
            throw new Error('0 estaciones homologadas contra web_estaciones_competencia');
        }

        const today = new Date().toISOString().split('T')[0];
        await conn.beginTransaction();
        try {
            await conn.query('DELETE FROM web_precios_competencia');
            const values = matched.map(r => [
                r.estacion, r.modificacion,
                r.super_c, r.regular_c, r.ion_c, r.diesel_c,
                r.super_a, r.regular_a, r.ion_a, r.diesel_a
            ]);
            await conn.query(
                'INSERT INTO web_precios_competencia (estacion, modificacion, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a) VALUES ?',
                [values]
            );

            for (const r of matched) {
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
            return { transport: 'DIRECT_DB_SYNC', sentMatched: matched.length };
        } catch (txErr) {
            await conn.rollback();
            throw txErr;
        }
    } finally {
        await conn.end();
    }
}

async function main() {
    // 1. Leer datos desde GasolinaSV API (primario rápido) o DGEHM oficial (respaldo)
    let feed;
    try {
        feed = await readMirrorSinappApi();
    } catch (err) {
        console.log(`[FALLBACK] GasolinaSV API no disponible (${err.message}). Intentando portal DGEHM...`);
        feed = await readPrimaryDgehm();
    }

    // 2. Intentar envío por API HTTP hacia admin.sipesv.com; si retorna 401/5xx usar respaldo DB directo
    try {
        const catRes = await httpRequest(`${ADMIN_BASE_URL}/api/consultas/estaciones/precios-competencia/estaciones`, {
            headers: { 'x-api-key': API_KEY },
            timeout: 12000
        });
        if (catRes.status !== 200) {
            throw new Error(`HTTP ${catRes.status} en catálogo`);
        }
        const mappedStations = JSON.parse(catRes.text);
        const matched = matchStations(feed.rows, mappedStations, []);
        if (matched.length === 0) {
            throw new Error('0 estaciones homologadas contra catálogo API');
        }

        const uploadRes = await httpRequest(`${ADMIN_BASE_URL}/api/consultas/estaciones/precios-competencia/upload`, {
            method: 'POST',
            headers: { 'x-api-key': API_KEY },
            body: { data: matched, source: `169.58.207.115:${feed.source}` },
            timeout: 20000
        });
        if (uploadRes.status !== 200) {
            throw new Error(`HTTP ${uploadRes.status} en /upload`);
        }

        console.log(JSON.stringify({
            success: true,
            transport: 'HTTP_API_UPLOAD',
            source: feed.source,
            fetchedTotal: feed.rows.length,
            sentMatched: matched.length
        }));
        return;
    } catch (apiErr) {
        console.log(`[TRANSPORT_FALLBACK] API HTTP no disponible (${apiErr.message}). Sincronizando hacia db_sipe_admin...`);
        const dbResult = await syncViaDirectDb(feed);
        console.log(JSON.stringify({
            success: true,
            ...dbResult,
            source: feed.source,
            fetchedTotal: feed.rows.length
        }));
    }
}

main().catch(err => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
});
