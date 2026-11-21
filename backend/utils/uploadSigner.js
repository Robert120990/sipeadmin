const crypto = require('crypto');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const DEFAULT_SIGN_TTL_SECONDS = 6 * 60 * 60; // 6 horas

/**
 * Genera una firma HMAC-SHA256 con expiración para servir archivos de /api/uploads/
 * sin exponer rutas de comprobantes de forma pública.
 * Preserva el path limpio sin firma para almacenamiento en BD.
 */
function signUploadUrl(archivoUrl = '', ttlSeconds = DEFAULT_SIGN_TTL_SECONDS) {
    if (!archivoUrl) return archivoUrl;
    const cleanPath = String(archivoUrl).split('?')[0];
    if (!cleanPath.startsWith('/api/uploads/')) {
        return archivoUrl;
    }
    const ttl = Math.max(60, parseInt(ttlSeconds, 10) || DEFAULT_SIGN_TTL_SECONDS);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const sig = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${cleanPath}:${exp}`)
        .digest('hex');
    return `${cleanPath}?exp=${exp}&sig=${sig}`;
}

/**
 * Valida en tiempo constante una firma HMAC-SHA256 + timestamp de expiración.
 */
function verifySignedUploadUrl(rawPath = '', expRaw = '', sigRaw = '') {
    try {
        const cleanPath = String(rawPath || '').split('?')[0];
        if (!cleanPath.startsWith('/api/uploads/') || cleanPath.includes('..')) {
            return false;
        }
        const exp = Number(expRaw);
        if (!Number.isInteger(exp) || exp <= 0) {
            return false;
        }
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec > exp) {
            return false;
        }
        const expectedHex = crypto
            .createHmac('sha256', JWT_SECRET)
            .update(`${cleanPath}:${exp}`)
            .digest('hex');
        const actualBuf = Buffer.from(String(sigRaw || ''), 'utf8');
        const expectedBuf = Buffer.from(expectedHex, 'utf8');
        if (actualBuf.length !== expectedBuf.length) {
            return false;
        }
        return crypto.timingSafeEqual(actualBuf, expectedBuf);
    } catch (_) {
        return false;
    }
}

/**
 * Middleware para /api/uploads/pagos:
 * Permite acceso con firma HMAC temporal válida (?exp=...&sig=...) O token JWT Bearer válido.
 */
function requireSignedOrAuthenticatedUpload(req, res, next) {
    const rawPath = (req.baseUrl || req.path)
        ? `${req.baseUrl || ''}${req.path || ''}`
        : (req.originalUrl || '');
    const cleanPath = String(rawPath).split('?')[0];

    const exp = req.query?.exp;
    const sig = req.query?.sig;
    if (exp && sig && verifySignedUploadUrl(cleanPath, exp, sig)) {
        return next();
    }

    if (req.headers && req.headers.authorization) {
        return authenticateToken(req, res, next);
    }

    return res.status(401).json({
        message: 'Comprobante protegido: enlace expirado, firma inválida o autenticación requerida'
    });
}

module.exports = {
    DEFAULT_SIGN_TTL_SECONDS,
    signUploadUrl,
    verifySignedUploadUrl,
    requireSignedOrAuthenticatedUpload
};
