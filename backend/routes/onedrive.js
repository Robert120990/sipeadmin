const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const { authenticateToken } = require('../middleware/auth');

const getShareLink = () => process.env.ONEDRIVE_SHARE_LINK || '';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const cleanName = (text) => {
    return (text || '').replace(/[\uE000-\uF8FF]/g, '').replace(/Compartido/g, '').trim();
};

const parseDate = (str) => {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length === 3) {
        return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
    return new Date(str);
};

const scrapeItems = async (page) => {
    return await page.evaluate(() => {
        const result = [];
        document.querySelectorAll('[role="row"]').forEach((row) => {
            const cells = row.querySelectorAll('[role="gridcell"]');
            if (cells.length < 4) return;
            const iconCellText = cells[1]?.textContent?.trim() || '';
            const isFolder = iconCellText.startsWith('\uE716') || iconCellText.includes('folder');
            const rawName = cells[2]?.innerText?.trim() || '';
            const date = cells[3]?.innerText?.trim() || '';
            const size = cells[4]?.innerText?.trim() || '';
            if (rawName && rawName !== 'Nombre' && rawName.length > 1) {
                result.push({ name: rawName, date, size, isFolder });
            }
        });
        return result;
    });
};

router.get('/onedrive/estado', authenticateToken, async (req, res) => {
    let browser = null;
    try {
        const shareLink = getShareLink();
        if (!shareLink) {
            return res.status(400).json({ message: 'ONEDRIVE_SHARE_LINK no configurado en .env' });
        }

        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

        await page.goto(shareLink, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(5000);

        const rootItems = await scrapeItems(page);
        const folders = rootItems.filter(i => i.isFolder);
        console.log('Folders found:', folders.length);

        const carpetas = [];

        for (const folder of folders) {
            try {
                const rows = await page.$$('[role="row"]');
                let targetRow = null;
                for (const row of rows) {
                    const text = await row.evaluate(el => el.innerText);
                    if (text.includes(folder.name)) {
                        targetRow = row;
                        break;
                    }
                }

                if (targetRow) {
                    await targetRow.click({ clickCount: 2 });
                    await sleep(5000);

                    const subItems = await scrapeItems(page);
                    const files = subItems.filter(i => !i.isFolder);

                    if (files.length > 0) {
                        files.sort((a, b) => {
                            const da = parseDate(a.date);
                            const db = parseDate(b.date);
                            return (db?.getTime() || 0) - (da?.getTime() || 0);
                        });
                        const latest = files[0];
                        const fecha = parseDate(latest.date);
                        const antiguedad = fecha ? Math.floor((Date.now() - fecha.getTime()) / 86400000) : null;
                        carpetas.push({
                            carpeta: folder.name,
                            archivo: latest.name,
                            fecha: fecha ? fecha.toISOString() : null,
                            antiguedad
                        });
                    } else {
                        carpetas.push({ carpeta: folder.name, archivo: '(vacia)', fecha: null, antiguedad: null });
                    }

                    await page.goBack();
                    await sleep(3000);
                } else {
                    carpetas.push({ carpeta: folder.name, archivo: '(sin acceso)', fecha: null, antiguedad: null });
                }
            } catch (e) {
                console.log('Error processing folder', folder.name, ':', e.message);
                carpetas.push({ carpeta: folder.name, archivo: '(error)', fecha: null, antiguedad: null });
                try { await page.goBack(); await sleep(2000); } catch {}
            }
        }

        res.json(carpetas);
    } catch (error) {
        console.error('OneDrive error:', error.message);
        res.status(500).json({ message: 'Error al consultar OneDrive' });
    } finally {
        if (browser) await browser.close();
    }
});

module.exports = router;
