const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');

const getShareLink = () => process.env.ONEDRIVE_SHARE_LINK || '';

const resolveAndGetChildren = async (shortUrl, folderPath) => {
    const firstRes = await axios.get(shortUrl, {
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
        timeout: 10000
    });
    const redirUrl = firstRes.headers.location;
    if (!redirUrl) throw new Error('No redirect from short link');

    const secondRes = await axios.get(redirUrl, {
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
        timeout: 10000
    });
    const finalUrl = secondRes.headers.location || redirUrl;

    const residMatch = finalUrl.match(/[?&]resid=([^&]+)/);
    if (!residMatch) {
        const body = secondRes.data || '';
        const metaMatch = body.match(/resid=([^&"\s]+)/);
        if (!metaMatch) throw new Error('No se pudo extraer resid');
        return fetchViaResid(metaMatch[1], folderPath);
    }
    return fetchViaResid(residMatch[1], folderPath);
};

const fetchViaResid = async (resid, folderPath) => {
    const [driveId, itemId] = resid.split('!');
    if (!driveId || !itemId) throw new Error('resid invalido: ' + resid);
    const baseUrl = `https://api.onedrive.com/v1.0/drives/${driveId}/items/${itemId}`;
    const url = folderPath ? `${baseUrl}:${folderPath}:/children` : `${baseUrl}/children`;
    const res = await axios.get(url, { timeout: 15000 });
    return res.data.value || [];
};

router.get('/onedrive/estado', authenticateToken, async (req, res) => {
    try {
        const shareLink = getShareLink();
        if (!shareLink) {
            return res.status(400).json({ message: 'ONEDRIVE_SHARE_LINK no configurado en .env' });
        }

        const subfolders = await resolveAndGetChildren(shareLink, '');
        if (subfolders.length === 0) {
            return res.json([]);
        }

        const carpetas = [];
        for (const folder of subfolders) {
            if (!folder.folder) continue;
            const path = '/' + folder.name;
            const files = await resolveAndGetChildren(shareLink, path);
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
