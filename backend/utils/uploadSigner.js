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
 * Normaliza y decodifica una ruta de /api/uploads/ para prevenir evasiones por encoding
 * (%70agos, pagos%2f, //pagos, /./pagos, backslashes o path traversal).
 */
function normalizeUploadSubpath(rawSubpath = '') {
    let decoded = String(rawSubpath || '').split('?')[0];
    try {
        // Decodificar hasta 2 veces para atrapar double-encoding (%2570agos)
        for (let i = 0; i < 2; i++) {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
        }
    } catch (_) {
        return null;
    }
    const slashed = decoded.replace(/\\/g, '/');
    const parts = slashed.split('/').filter((seg) => seg && seg !== '.');
    if (parts.some((seg) => seg === '..')) {
        return null;
    }
    return '/' + parts.join('/');
}

function verifyProtectedUploadAccess(req, res, next, normalizedPath) {
    if (!normalizedPath) {
        return res.status(400).json({ message: 'Ruta de archivo inválida' });
    }

    const exp = req.query?.exp;
    const sig = req.query?.sig;
    if (exp && sig && verifySignedUploadUrl(normalizedPath, exp, sig)) {
        return next();
    }

    if (req.headers && req.headers.authorization) {
        return authenticateToken(req, res, next);
    }

    return res.status(401).json({
        message: 'Comprobante protegido: enlace expirado, firma inválida o autenticación requerida'
    });
}

/**
 * Middleware para /api/uploads/pagos:
 * Permite acceso con firma HMAC temporal válida (?exp=...&sig=...) O token JWT Bearer válido.
 */
function requireSignedOrAuthenticatedUpload(req, res, next) {
    const rawPath = (req.baseUrl || req.path)
        ? `${req.baseUrl || ''}${req.path || ''}`
        : (req.originalUrl || '');
    const normalized = normalizeUploadSubpath(rawPath);
    return verifyProtectedUploadAccess(req, res, next, normalized);
}

/**
 * Guard global para montar ANTES de express.static('/api/uploads'):
 * Garantiza que ninguna variante codificada (/api/uploads/%70agos/..., //pagos/..., /./pagos/...)
 * pueda evadir la protección de /api/uploads/pagos.
 * No muta propiedades de req (compatible con Express 5 donde req.path es solo lectura).
 */
function guardProtectedUploadsMiddleware(req, res, next) {
    const normalizedSub = normalizeUploadSubpath(req.path || '');
    if (normalizedSub === null) {
        return res.status(400).json({ message: 'Ruta de archivo inválida' });
    }
    const firstSegment = normalizedSub.split('/').filter(Boolean)[0] || '';
    if (firstSegment.toLowerCase() === 'pagos') {
        const canonicalFullPath = normalizeUploadSubpath(`/api/uploads${normalizedSub}`);
        return verifyProtectedUploadAccess(req, res, next, canonicalFullPath);
    }
    return next();
}

module.exports = {
    DEFAULT_SIGN_TTL_SECONDS,
    signUploadUrl,
    verifySignedUploadUrl,
    normalizeUploadSubpath,
    requireSignedOrAuthenticatedUpload,
    guardProtectedUploadsMiddleware
};
