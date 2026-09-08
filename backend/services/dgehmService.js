// Globals only used inside puppeteer page.evaluate() (browser context)
/* global $find */

const path = require('path');
const fs = require('fs');

// Lazy puppeteer loader (supports local and Vercel serverless)
let _puppeteer = null;
const getPuppeteer = async () => {
    if (!_puppeteer) {
        if (process.env.VERCEL) {
            const chromium = require('@sparticuz/chromium');
            const puppeteerCore = await import('puppeteer-core');
            _puppeteer = { puppeteer: puppeteerCore.default || puppeteerCore, chromium };
        } else {
            _puppeteer = await import('puppeteer');
            _puppeteer = _puppeteer.default || _puppeteer;
        }
    }
    return _puppeteer;
};

const normalizeName = (str) => {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const cleanNum = (val) => {
    if (val === null || val === undefined) return 0;
    const s = String(val).trim();
    if (!s) return 0;
    const cleaned = s.replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
};

/**
 * Scrape current fuel prices from DGEHM official portal.
 */
const fetchDgehmPrices = async () => {
    let browser = null;
    const downloadDir = path.resolve(__dirname, '../tmp_dgehm_downloads');
    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    try {
        const pup = await getPuppeteer();
        const launchOpts = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions'
            ]
        };

        if (process.env.VERCEL) {
            launchOpts.executablePath = await pup.chromium.executablePath();
            launchOpts.args = [...launchOpts.args, ...pup.chromium.args];
            browser = await pup.puppeteer.launch(launchOpts);
        } else {
            browser = await pup.launch(launchOpts);
        }

        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(30000);

        // Block media and fonts to speed up load
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                // Keep styles for dev express if needed, but reportviewer works without external images
                if (type === 'image' || type === 'media' || type === 'font') {
                    req.abort();
                    return;
                }
            }
            req.continue();
        });

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadDir
        });

        console.log('[DGEHM] Navigating to http://sinapp.dgehm.gob.sv/drhm/estadisticas.aspx?uid=2 ...');
        await page.goto('http://sinapp.dgehm.gob.sv/drhm/estadisticas.aspx?uid=2', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for ReportViewer to initialize
        await page.waitForFunction(() => {
            return typeof $find === 'function' && !!$find('ctl00_ContentPlaceHolder1_rvw_reportvw');
        }, { timeout: 15000 }).catch(() => null);

        // Small grace period
        await new Promise(r => setTimeout(r, 2000));

        // Clean existing files in downloadDir before triggering export
        for (const file of fs.readdirSync(downloadDir)) {
            try { 
                fs.unlinkSync(path.join(downloadDir, file)); 
            } catch (cleanupErr) {
                // Ignore cleanup error
            }
        }

        console.log('[DGEHM] Triggering ReportViewer CSV export...');
        await page.evaluate(() => {
            const rv = $find('ctl00_ContentPlaceHolder1_rvw_reportvw');
            if (rv && typeof rv.exportReport === 'function') {
                rv.exportReport('CSV');
            }
        });

        // Wait for CSV file download
        let downloadedFile = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const files = fs.readdirSync(downloadDir);
            const csv = files.find(f => f.endsWith('.csv') && !f.endsWith('.crdownload'));
            if (csv) {
                downloadedFile = path.join(downloadDir, csv);
                break;
            }
        }

        if (!downloadedFile) {
            throw new Error('Tiempo de espera agotado al descargar el reporte de la DGEHM.');
        }

        const csvContent = fs.readFileSync(downloadedFile, 'utf8');
        // Clean up file
        try { 
            fs.unlinkSync(downloadedFile); 
        } catch (unlinkErr) {
            // Ignore file unlink error
        }

        const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length <= 1) {
            throw new Error('El reporte descargado de la DGEHM está vacío.');
        }

        const results = [];
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
            if (parts.length < 4) continue;

            const zona = parts[0] || '';
            const departamento = parts[1] || '';
            const estacion = parts[2] || '';
            const modificacion = parts[3] || '';

            if (!estacion || !modificacion) continue;

            results.push({
                zona,
                departamento,
                estacion,
                modificacion,
                super_c: cleanNum(parts[4]),
                regular_c: cleanNum(parts[5]),
                ion_c: cleanNum(parts[7]),
                diesel_c: cleanNum(parts[8]),
                super_a: cleanNum(parts[9]),
                regular_a: cleanNum(parts[10]),
                ion_a: cleanNum(parts[12]),
                diesel_a: cleanNum(parts[13])
            });
        }

        console.log(`[DGEHM] Successfully parsed ${results.length} stations from DGEHM.`);
        return results;
    } finally {
        if (browser) {
            try { 
                await browser.close(); 
            } catch (closeErr) {
                // Ignore browser close error
            }
        }
    }
};

/**
 * Synchronize DGEHM prices with database (updates snapshot and appends history).
 */
const syncDgehmWithDatabase = async (externalDb) => {
    const rawData = await fetchDgehmPrices();
    if (!rawData || rawData.length === 0) {
        throw new Error('No se obtuvieron datos de la DGEHM.');
    }

    // Get configured competitor stations from DB
    const [dbEstaciones] = await externalDb.query('SELECT competencia, id_estacion FROM web_estaciones_competencia');
    
    // Map normalized names
    const dbMap = new Map();
    for (const e of dbEstaciones) {
        const exact = (e.competencia || '').trim();
        const norm = normalizeName(exact);
        dbMap.set(norm, exact);
    }

    // Match DGEHM rows
    const matchedRows = [];
    const matchedDbNames = new Set();

    for (const item of rawData) {
        const norm = normalizeName(item.estacion);
        let matchedName = null;

        if (dbMap.has(norm)) {
            matchedName = dbMap.get(norm);
        } else {
            // Fuzzy/keyword match for slight variations (e.g. without "DE")
            const itemWords = norm.split(' ').filter(w => w.length > 2 && !['estacion', 'servicio', 'gasolinera', 'de', 'la', 'el', 'los', 'las'].includes(w));
            for (const [dbNorm, dbExact] of dbMap.entries()) {
                if (matchedDbNames.has(dbExact)) continue;
                const dbWords = dbNorm.split(' ').filter(w => w.length > 2 && !['estacion', 'servicio', 'gasolinera', 'de', 'la', 'el', 'los', 'las'].includes(w));
                if (itemWords.length > 0 && dbWords.length > 0 && itemWords.join(' ') === dbWords.join(' ')) {
                    matchedName = dbExact;
                    break;
                }
            }
        }

        if (matchedName) {
            matchedDbNames.add(matchedName);
            matchedRows.push({
                estacion: matchedName,
                modificacion: item.modificacion,
                super_c: item.super_c,
                regular_c: item.regular_c,
                ion_c: item.ion_c,
                diesel_c: item.diesel_c,
                super_a: item.super_a,
                regular_a: item.regular_a,
                ion_a: item.ion_a,
                diesel_a: item.diesel_a
            });
        }
    }

    if (matchedRows.length === 0) {
        throw new Error('No se encontraron coincidencias entre las estaciones de la DGEHM y el catálogo local.');
    }

    const today = new Date().toISOString().split('T')[0];
    const conn = await externalDb.getConnection();
    await conn.beginTransaction();

    try {
        // 1. Update current snapshot
        await conn.query('DELETE FROM web_precios_competencia');
        const insertSql = 'INSERT INTO web_precios_competencia (estacion, modificacion, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a) VALUES ?';
        const snapshotValues = matchedRows.map(r => [
            r.estacion, r.modificacion, r.super_c, r.regular_c, r.ion_c, r.diesel_c,
            r.super_a, r.regular_a, r.ion_a, r.diesel_a
        ]);
        await conn.query(insertSql, [snapshotValues]);

        // 2. Insert into history table
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
                r.super_c, r.regular_c, r.ion_c, r.diesel_c,
                r.super_a, r.regular_a, r.ion_a, r.diesel_a
            ]);
        }

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    return {
        success: true,
        count: matchedRows.length,
        totalConfigured: dbEstaciones.length,
        totalDgehm: rawData.length,
        fechaSincronizacion: new Date().toISOString(),
        matchedRows
    };
};

module.exports = {
    fetchDgehmPrices,
    syncDgehmWithDatabase,
    normalizeName,
    cleanNum
};
