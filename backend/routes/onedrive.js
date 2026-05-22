const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');

const getShareLink = () => process.env.ONEDRIVE_SHARE_LINK || '';

const encodeShareToken = (url) => {
    return Buffer.from(url, 'utf8').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const resolveShareUrl = async (shortUrl) => {
    const res1 = await axios.get(shortUrl, {
        maxRedirects: 0,
        validateStatus: () => true,
        timeout: 10000
    });
    console.log('Short link response status:', res1.status);
    console.log('Location header:', res1.headers.location?.substring(0, 120));

    let redir = res1.headers.location;
    if (!redir) {
        const body = String(res1.data || '').substring(0, 500);
        console.log('Response body (first 500):', body);
        throw new Error('No redirect Location from short link (status ' + res1.status + ')');
    }

    if (redir.includes('login.live.com')) {
        throw new Error('El link requiere autenticacion. Usa la URL canonica (abre el link en el navegador y copia la URL final).');
    }

    return redir;
};

const listViaShares = async (shareUrl, folderPath) => {
    const encoded = encodeShareToken(shareUrl);
    const base = `https://api.onedrive.com/v1.0/shares/u!${encoded}/root`;
    const url = folderPath ? `${base}:${folderPath}:/children` : `${base}/children`;
    const res = await axios.get(url, { timeout: 15000 });
    return res.data.value || [];
};

router.get('/onedrive/estado', authenticateToken, async (req, res) => {
    try {
        const shareLink = getShareLink();
        if (!shareLink) {
            return res.status(400).json({ message: 'ONEDRIVE_SHARE_LINK no configurado en .env' });
        }

        const resolvedUrl = await resolveShareUrl(shareLink);
        console.log('Resolved share URL:', resolvedUrl);

        const subfolders = await listViaShares(resolvedUrl, '');
        if (subfolders.length === 0) {
            return res.json([]);
        }

        const carpetas = [];
        for (const folder of subfolders) {
            if (!folder.folder) continue;
            const path = '/' + folder.name;
            const files = await listViaShares(resolvedUrl, path);
            if (files.length > 0) {
                const sorted = files.sort((a, b) =>
                    new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime)
                );
                const latest = sorted[0];
                const fecha = new Date(latest.lastModifiedDateTime);
                const antiguedad = Math.floor((Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24));
                carpetas.push({
                    carpeta: folder.name,
                    archivo: latest.name,
                    fecha: fecha.toISOString(),
                    antiguedad
                });
            } else {
                carpetas.push({
                    carpeta: folder.name,
                    archivo: '(vacia)',
                    fecha: null,
                    antiguedad: null
                });
            }
        }

        res.json(carpetas);
    } catch (error) {
        console.error('OneDrive error:', error.response?.status, error.response?.data || error.message);
        res.status(500).json({ message: 'Error al consultar OneDrive' });
    }
});

module.exports = router;
