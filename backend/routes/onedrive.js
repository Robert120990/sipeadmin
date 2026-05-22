const express = require('express');
const router = express.Router();
const puppeteer = require('puppeteer');
const { authenticateToken } = require('../middleware/auth');

const getShareLink = () => process.env.ONEDRIVE_SHARE_LINK || '';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const parseRelativeDate = (str) => {
    if (!str) return null;
    const lower = str.toLowerCase().replace('í', 'i').replace('á', 'a').replace('é', 'e').replace('ó', 'o');
    const now = new Date();
    const match = lower.match(/hace\s+(\d+)\s+(hora|minuto|dia|segundo|semana|mes)/);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    if (unit.startsWith('minuto')) now.setMinutes(now.getMinutes() - num);
    else if (unit.startsWith('hora')) now.setHours(now.getHours() - num);
    else if (unit.startsWith('dia')) now.setDate(now.getDate() - num);
    else if (unit.startsWith('semana')) now.setDate(now.getDate() - num * 7);
    else if (unit.startsWith('mes')) now.setMonth(now.getMonth() - num);
    else if (unit.startsWith('segundo')) now.setSeconds(now.getSeconds() - num);
    return now;
};

const scrapeItems = async (page) => {
    return await page.evaluate(() => {
        const result = [];
        document.querySelectorAll('[role="row"]').forEach((row) => {
            const cells = row.querySelectorAll('[role="gridcell"]');
            if (cells.length < 4) return;
            const iconCell = cells[1]?.textContent?.trim() || '';
            const isFolder = iconCell.includes('\uE716');
            const rawName = cells[2]?.innerText?.trim() || '';
            const date = cells[3]?.innerText?.trim() || '';
            const size = cells[4]?.innerText?.trim() || '';
            if (rawName && rawName.length > 1 && rawName !== 'Nombre') {
                result.push({ name: rawName, date, size, isFolder });
            }
        });
        return result;
    });
};

const navigateIntoFolder = async (page, folderName) => {
    const cells = await page.$$('[role="gridcell"]');
    for (const cell of cells) {
        const text = await cell.evaluate(el => el.innerText?.trim()?.substring(0, 80));
        if (text.startsWith(folderName)) {
            const box = await cell.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await sleep(300);
                await page.keyboard.press('Enter');
                await sleep(5000);
                return true;
            }
        }
    }
    return false;
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
        console.log('Folders:', folders.length);

        const carpetas = [];

        for (const folder of folders) {
            try {
                const cleanFolderName = folder.name.replace(/\n/g, ' ').trim();
                const navigated = await navigateIntoFolder(page, cleanFolderName);

                if (navigated) {
                    const subItems = await scrapeItems(page);
                    const files = subItems.filter(i => !i.isFolder);

                    if (files.length > 0) {
                        files.sort((a, b) => {
                            const da = parseRelativeDate(a.date);
                            const db = parseRelativeDate(b.date);
                            return (db?.getTime() || 0) - (da?.getTime() || 0);
                        });
                        const latest = files[0];
                        const fecha = parseRelativeDate(latest.date);
                        const antiguedad = fecha ? Math.floor((Date.now() - fecha.getTime()) / 86400000) : null;
                        carpetas.push({
                            carpeta: cleanFolderName,
                            archivo: latest.name.replace(/[\uE000-\uF8FF]/g, '').trim(),
                            fecha: fecha ? fecha.toISOString() : null,
                            antiguedad
                        });
                    } else {
                        carpetas.push({ carpeta: cleanFolderName, archivo: '(vacia)', fecha: null, antiguedad: null });
                    }

                    await page.goBack();
                    await sleep(3000);
                } else {
                    carpetas.push({ carpeta: cleanFolderName, archivo: '(sin acceso)', fecha: null, antiguedad: null });
                }
            } catch (e) {
                console.log('Error in folder', folder.name, ':', e.message);
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
