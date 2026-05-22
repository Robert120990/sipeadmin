const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');

const getShareLink = () => process.env.ONEDRIVE_SHARE_LINK || '';

const encodeShareToken = (url) => {
    return Buffer.from(url).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const listChildren = async (shareUrl, folderPath) => {
    const encoded = encodeShareToken(shareUrl);
    const baseUrl = `https://api.onedrive.com/v1.0/shares/u!${encoded}/root`;
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

        const subfolders = await listChildren(shareLink, '');
        if (subfolders.length === 0) {
            return res.json([]);
        }

        const carpetas = [];
        for (const folder of subfolders) {
            if (!folder.folder) continue;
            const path = '/' + folder.name;
            const files = await listChildren(shareLink, path);
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
