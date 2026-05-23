const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// ── In-memory cache (10 min TTL) ─────────────────────────────────────────────
let cachedResult = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let fetchInProgress = false;

const getShareLink = () => process.env.ONEDRIVE_SHARE_LINK || '';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Lazy puppeteer — only loaded when the route is actually called
let _puppeteer = null;
const getPuppeteer = async () => {
    if (!_puppeteer) {
        if (process.env.VERCEL) {
            const chromium = require('@sparticuz/chromium');
            const puppeteer = require('puppeteer-core');
            _puppeteer = { puppeteer, chromium };
        } else {
            _puppeteer = await import('puppeteer');
            _puppeteer = _puppeteer.default || _puppeteer;
        }
    }
    return _puppeteer;
};

// ── Date parsing (robust) ────────────────────────────────────────────────────

const parseRelativeDate = (str) => {
    if (!str) return null;
    const lower = str.toLowerCase().trim()
        .replace(/[íáéóúñ]/g, (c) => ({ 'í': 'i', 'á': 'a', 'é': 'e', 'ó': 'o', 'ú': 'u', 'ñ': 'n' })[c] || c);
    const now = new Date();

    // "Hace unos segundos" / "Hace un momento" / "Justo ahora"
    if (/justo ahora|hace unos segundos|hace un momento|unos segundos/i.test(lower)) {
        return new Date(now.getTime() - 30000);
    }

    // "Ayer"
    if (lower === 'ayer') return new Date(now.getTime() - 86400000);

    // "Hoy" 
    if (lower === 'hoy') return new Date(now);

    // "Hace X unidad(es)" with number words and digits
    const wordNums = {
        una: 1, un: 1, unas: 2, unos: 2, pocas: 2, pocos: 2,
        dos: 2, tres: 3, cuatro: 4, cinco: 5,
        seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
        once: 11, doce: 12
    };

    const relMatch = lower.match(/hace\s+(\d+|[a-z]+)\s+(hora|minuto|dia|segundo|semana|mes|ano)/);
    if (relMatch) {
        const rawNum = relMatch[1];
        const num = wordNums[rawNum] || parseInt(rawNum);
        if (isNaN(num)) return null;
        const unit = relMatch[2];
        const d = new Date(now);
        if (unit.startsWith('segundo')) d.setSeconds(d.getSeconds() - num);
        else if (unit.startsWith('minuto')) d.setMinutes(d.getMinutes() - num);
        else if (unit.startsWith('hora')) d.setHours(d.getHours() - num);
        else if (unit.startsWith('dia')) d.setDate(d.getDate() - num);
        else if (unit.startsWith('semana')) d.setDate(d.getDate() - num * 7);
        else if (unit.startsWith('mes')) d.setMonth(d.getMonth() - num);
        else if (unit.startsWith('ano')) d.setFullYear(d.getFullYear() - num);
        return d;
    }

    // Absolute date: dd/mm/yyyy
    const dateSlash = lower.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateSlash) {
        return new Date(Number(dateSlash[3]), Number(dateSlash[2]) - 1, Number(dateSlash[1]));
    }

    // Absolute date: mm/dd/yyyy or yyyy-mm-dd
    const dateISO = lower.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dateISO) {
        return new Date(Number(dateISO[1]), Number(dateISO[2]) - 1, Number(dateISO[3]));
    }

    // Date with month name in Spanish: "22 de may. de 2026", "22 may 2026"
    const months = {
        ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
        jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11
    };
    const spanishDate = lower.match(/(\d{1,2})\s+(?:de\s+)?([a-z]{3})\.?\s+(?:de\s+)?(\d{4})/);
    if (spanishDate) {
        const month = months[spanishDate[2]];
        if (month !== undefined) {
            return new Date(Number(spanishDate[3]), month, Number(spanishDate[1]));
        }
    }

    return null;
};

/**
 * Extract a date from a backup file name.
 * Common patterns: backup_2026-05-22.sql, DB_20260522_010000.bak, etc.
 */
const parseDateFromFileName = (name) => {
    if (!name) return null;

    // Pattern: yyyy-mm-dd or yyyy_mm_dd
    const isoMatch = name.match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    if (isoMatch) {
        const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        if (!isNaN(d.getTime())) return d;
    }

    // Pattern: yyyymmdd
    const compactMatch = name.match(/(\d{4})(\d{2})(\d{2})/);
    if (compactMatch) {
        const y = Number(compactMatch[1]);
        const m = Number(compactMatch[2]);
        const day = Number(compactMatch[3]);
        if (y > 2000 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
            return new Date(y, m - 1, day);
        }
    }

    return null;
};

// ── Puppeteer helpers (optimized) ────────────────────────────────────────────

const waitForRows = async (page, timeoutMs = 10000) => {
    try {
        await page.waitForSelector('[role="row"]', { timeout: timeoutMs });
        // Small extra wait for DOM to stabilize
        await sleep(800);
    } catch {
        // Timeout - rows may not exist (empty folder)
    }
};

const scrollToLoadAll = async (page) => {
    let prevCount = 0;
    for (let i = 0; i < 30; i++) {
        // Try keyboard PageDown first (works with virtualized lists)
        await page.keyboard.press('PageDown');
        await sleep(400);

        // Also try scrolling the most likely container
        await page.evaluate(() => {
            const sel = '[data-automationid="DetailsList"]';
            const el = document.querySelector(sel);
            if (el) {
                const parent = el.parentElement;
                if (parent) parent.scrollTop = parent.scrollHeight;
            }
            window.scrollTo(0, document.body.scrollHeight);
        });

        const count = await page.evaluate(() => document.querySelectorAll('[role="row"]').length);
        if (count === prevCount && i > 3) break;
        prevCount = count;
    }
};

const scrapeItems = async (page) => {
    await scrollToLoadAll(page);
    return await page.evaluate(() => {
        const result = [];
        document.querySelectorAll('[role="row"]').forEach((row) => {
            const cells = row.querySelectorAll('[role="gridcell"]');
            if (cells.length < 4) return;
            const iconCell = cells[1]?.textContent?.trim() || '';
            const isFolder = iconCell.includes('\uE716');
            const rawName = (cells[2]?.innerText?.trim() || '').replace(/[\uE000-\uF8FF]/g, '').trim();
            const date = cells[3]?.innerText?.trim() || '';
            if (rawName && rawName.length > 1 && rawName !== 'Nombre') {
                result.push({ name: rawName, date, isFolder });
            }
        });
        return result;
    });
};

const navigateIntoFolder = async (page, folderName) => {
    const cells = await page.$$('[role="gridcell"]');
    const cleanCellText = (t) => (t || '').replace(/[\uE000-\uF8FF]/g, '').trim().substring(0, 80);
    for (const cell of cells) {
        const text = cleanCellText(await cell.evaluate(el => el.innerText));
        if (text.startsWith(folderName)) {
            const box = await cell.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await sleep(200);
                await page.keyboard.press('Enter');
                // Wait for navigation to complete (wait for rows or timeout)
                await waitForRows(page, 8000);
                return true;
            }
        }
    }
    return false;
};

/**
 * Determine the best (most recent) file from a list.
 * Uses multiple strategies: parsed display date, date from filename, DOM position.
 */
const findLatestFile = (files) => {
    if (files.length === 0) return null;

    // Strategy 1: Parse display dates and sort
    const withParsedDates = files.map(f => ({
        ...f,
        parsedDate: parseRelativeDate(f.date),
        fileNameDate: parseDateFromFileName(f.name)
    }));

    // Try display dates first
    const withDisplayDate = withParsedDates.filter(f => f.parsedDate);
    if (withDisplayDate.length > 0) {
        withDisplayDate.sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime());
        const latest = withDisplayDate[0];
        return {
            name: latest.name,
            fecha: latest.parsedDate,
            antiguedad: Math.floor((Date.now() - latest.parsedDate.getTime()) / 86400000)
        };
    }

    // Strategy 2: Parse dates from file names
    const withFileDate = withParsedDates.filter(f => f.fileNameDate);
    if (withFileDate.length > 0) {
        withFileDate.sort((a, b) => b.fileNameDate.getTime() - a.fileNameDate.getTime());
        const latest = withFileDate[0];
        return {
            name: latest.name,
            fecha: latest.fileNameDate,
            antiguedad: Math.floor((Date.now() - latest.fileNameDate.getTime()) / 86400000)
        };
    }

    // Strategy 3: Take the first file (OneDrive default sort is usually by date desc)
    const first = files[0];
    return {
        name: first.name,
        fecha: null,
        antiguedad: null
    };
};

// ── Route ────────────────────────────────────────────────────────────────────

router.get('/onedrive/estado', authenticateToken, async (req, res) => {
    // Check cache first (unless force refresh)
    const forceRefresh = req.query.force === '1';
    if (!forceRefresh && cachedResult && (Date.now() - cacheTimestamp) < CACHE_TTL_MS) {
        console.log('[OneDrive] Serving from cache');
        return res.json(cachedResult);
    }

    // If a fetch is already in progress, return cache or wait
    if (fetchInProgress) {
        if (cachedResult) {
            console.log('[OneDrive] Fetch in progress, returning stale cache');
            return res.json(cachedResult);
        }
    }

    let browser = null;
    fetchInProgress = true;

    try {
        const shareLink = getShareLink();
        if (!shareLink) {
            fetchInProgress = false;
            return res.status(400).json({ message: 'ONEDRIVE_SHARE_LINK no configurado en .env' });
        }

        console.time('[OneDrive] Total scrape time');

        const pup = await getPuppeteer();
        const launchOpts = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-gpu', '--disable-extensions', '--disable-images']
        };
        if (process.env.VERCEL) {
            launchOpts.executablePath = await pup.chromium.executablePath();
            launchOpts.args = [...launchOpts.args, ...pup.chromium.args];
            browser = await pup.puppeteer.launch(launchOpts);
        } else {
            browser = await pup.launch(launchOpts);
        }
        const page = await browser.newPage();

        // Block images and fonts to speed up loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'font', 'media'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

        await page.goto(shareLink, { waitUntil: 'networkidle2', timeout: 30000 });
        await waitForRows(page, 10000);

        const rootItems = await scrapeItems(page);
        const folders = rootItems.filter(i => i.isFolder);
        console.log(`[OneDrive] Found ${folders.length} folders`);

        const carpetas = [];

        for (const folder of folders) {
            try {
                const cleanFolderName = folder.name.replace(/\n/g, ' ').replace(/[\uE000-\uF8FF]/g, '').trim();
                console.log(`[OneDrive] Checking folder: ${cleanFolderName}`);
                const navigated = await navigateIntoFolder(page, cleanFolderName);

                if (navigated) {
                    const subItems = await scrapeItems(page);
                    const files = subItems.filter(i => !i.isFolder);

                    if (files.length > 0) {
                        const latest = findLatestFile(files);
                        carpetas.push({
                            carpeta: cleanFolderName,
                            archivo: latest.name.replace(/[\uE000-\uF8FF]/g, '').trim(),
                            fecha: latest.fecha ? latest.fecha.toISOString() : null,
                            antiguedad: latest.antiguedad
                        });
                    } else {
                        carpetas.push({ carpeta: cleanFolderName, archivo: '(vacia)', fecha: null, antiguedad: null });
                    }

                    await page.goBack({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
                    await waitForRows(page, 8000);
                } else {
                    carpetas.push({ carpeta: cleanFolderName, archivo: '(sin acceso)', fecha: null, antiguedad: null });
                }
            } catch (e) {
                console.log('[OneDrive] Error in folder', folder.name, ':', e.message);
                carpetas.push({ carpeta: folder.name, archivo: '(error)', fecha: null, antiguedad: null });
                try {
                    await page.goBack({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {});
                    await waitForRows(page, 5000);
                } catch {}
            }
        }

        console.timeEnd('[OneDrive] Total scrape time');

        // Update cache
        cachedResult = carpetas;
        cacheTimestamp = Date.now();

        res.json(carpetas);
    } catch (error) {
        console.error('[OneDrive] Error:', error.message);

        // If we have stale cache, return it
        if (cachedResult) {
            console.log('[OneDrive] Returning stale cache due to error');
            return res.json(cachedResult);
        }

        res.status(500).json({ message: 'Error al consultar OneDrive', detail: error.message });
    } finally {
        fetchInProgress = false;
        if (browser) await browser.close();
    }
});

module.exports = router;
