const crypto = require('crypto');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const DEFAULT_SIGN_TTL_SECONDS = 6 * 60 * 60; // 6 horas
const PROTECTED_UPLOAD_DIRS = new Set(['pagos', 'bancos', 'movimientos', 'tareas']);

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
        if (!cleanPath.startsWith('/api/uploads/') || cleanPath.includes('..') || cleanPath.includes('\0')) {
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
    if (decoded.includes('\0')) {
        return null;
    }
    try {
        // Decodificar hasta 2 veces para atrapar double-encoding (%2570agos)
        for (let i = 0; i < 2; i++) {
            const next = decodeURIComponent(decoded);
            if (next.includes('\0')) {
                return null;
            }
            if (next === decoded) break;
            decoded = next;
        }
    } catch (_) {
        return null;
    }
    if (decoded.includes('\0')) {
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
 * Middleware para carpetas protegidas bajo /api/uploads/{pagos,bancos,movimientos,tareas}:
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
 * Garantiza que ninguna variante codificada (/api/uploads/%70agos/..., //bancos/..., /./tareas/...)
 * pueda evadir la protección de las carpetas en PROTECTED_UPLOAD_DIRS.
 * No muta propiedades de req (compatible con Express 5 donde req.path es solo lectura).
 */
function guardProtectedUploadsMiddleware(req, res, next) {
    const normalizedSub = normalizeUploadSubpath(req.path || '');
    if (normalizedSub === null) {
        return res.status(400).json({ message: 'Ruta de archivo inválida' });
    }
    const firstSegment = normalizedSub.split('/').filter(Boolean)[0] || '';
    if (PROTECTED_UPLOAD_DIRS.has(firstSegment.toLowerCase())) {
        const canonicalFullPath = normalizeUploadSubpath(`/api/uploads${normalizedSub}`);
        return verifyProtectedUploadAccess(req, res, next, canonicalFullPath);
    }
    return next();
}

module.exports = {
    DEFAULT_SIGN_TTL_SECONDS,
    PROTECTED_UPLOAD_DIRS,
    signUploadUrl,
    verifySignedUploadUrl,
    normalizeUploadSubpath,
    requireSignedOrAuthenticatedUpload,
    guardProtectedUploadsMiddleware
};
