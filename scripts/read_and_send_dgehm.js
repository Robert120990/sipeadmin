#!/usr/bin/env node
/**
 * SIPE Admin - Lector y Emisor Remoto de Precios de Competencia (Servidor 169.58.207.115)
 * 1. Obtiene el catálogo de estaciones monitoreadas desde admin.sipesv.com
 * 2. Lee los precios desde DGEHM oficial (primario) o espejo JSON SINAPP (fallback automático)
 * 3. Filtra, homologa y envía los datos procesados a admin.sipesv.com (/upload)
 */

const https = require('https');

const ADMIN_BASE_URL = process.env.SIPE_ADMIN_URL || 'https://admin.sipesv.com';
const API_KEY = process.env.SYNC_API_KEY || process.env.PORTAL_SYNC_API_KEY || 'sipe_orchestrator_2026_secure_token';

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

    return { source: 'DGEHM_MIRROR_API', rows };
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

async function main() {
    // 1. Obtener estaciones monitoreadas desde SIPE Admin
    const catRes = await httpRequest(`${ADMIN_BASE_URL}/api/consultas/estaciones/precios-competencia/estaciones`, {
        headers: { 'x-api-key': API_KEY },
        timeout: 15000
    });
    if (catRes.status !== 200) {
        throw new Error(`Error obteniendo catálogo de estaciones (HTTP ${catRes.status}): ${catRes.text}`);
    }
    const mappedStations = JSON.parse(catRes.text);

    // 2. Leer datos desde DGEHM primario o espejo SINAPP
    let feed;
    try {
        feed = await readPrimaryDgehm();
    } catch (err) {
        console.log(`[FALLBACK] Primario no accesible (${err.message}). Leyendo desde espejo SINAPP API...`);
        feed = await readMirrorSinappApi();
    }

    // 3. Homologar estaciones
    const sourceExact = new Map();
    const sourceFuzzy = new Map();
    for (const r of feed.rows) {
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
        const src = sourceExact.get(normExact(dbName)) || sourceFuzzy.get(normFuzzy(dbName));
        if (!src) continue;
        seen.add(dbName);
        matched.push({
            estacion: dbName,
            modificacion: src.modificacion,
            super_c: src.super_c,
            regular_c: src.regular_c,
            ion_c: src.ion_c,
            diesel_c: src.diesel_c,
            super_a: src.super_a,
            regular_a: src.regular_a,
            ion_a: src.ion_a,
            diesel_a: src.diesel_a
        });
    }

    if (matched.length === 0) {
        throw new Error('0 estaciones homologadas contra el catálogo de SIPE Admin');
    }

    // 4. Enviar datos listos a SIPE Admin (/upload)
    const uploadRes = await httpRequest(`${ADMIN_BASE_URL}/api/consultas/estaciones/precios-competencia/upload`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY },
        body: { data: matched, source: `169.58.207.115:${feed.source}` },
        timeout: 20000
    });

    if (uploadRes.status !== 200) {
        throw new Error(`Error enviando datos a SIPE Admin (HTTP ${uploadRes.status}): ${uploadRes.text}`);
    }

    console.log(JSON.stringify({
        success: true,
        source: feed.source,
        fetchedTotal: feed.rows.length,
        sentMatched: matched.length,
        serverResponse: JSON.parse(uploadRes.text)
    }));
}

main().catch(err => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
});
