const { getDb } = require('../db');

function logAction(db, req, accion, entidad, entidadId, detalles) {
    setImmediate(async () => {
        try {
            const userId = req.user?.id || null;
            const username = req.user?.username || 'unknown';
            const ipAddress = req.ip || req.connection?.remoteAddress || null;

            await db.query(
                `INSERT INTO bitacora_logs (user_id, username, accion, entidad, entidad_id, detalles, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, username, accion, entidad, entidadId, detalles, ipAddress]
            );
        } catch (err) {
            console.error('Error writing to bitacora:', err.message);
        }
    });
}

const SENSITIVE_KEY_REGEX = /^(pass(word)?|token|secret|key|apiKey|authorization|pin|cvv|credentials)$/i;

function sanitizeData(data, depth = 0) {
    if (!data || depth > 5) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
        return data.map(item => sanitizeData(item, depth + 1));
    }

    const sanitized = {};
    for (const [k, v] of Object.entries(data)) {
        if (SENSITIVE_KEY_REGEX.test(k) || k.toLowerCase().includes('password') || k.toLowerCase().includes('secret')) {
            sanitized[k] = '***';
        } else if (v && typeof v === 'object') {
            sanitized[k] = sanitizeData(v, depth + 1);
        } else {
            sanitized[k] = v;
        }
    }
    return sanitized;
}

const MAX_DETAILS_LENGTH = 20000;
const DEBUG_BITACORA = process.env.DEBUG_BITACORA === 'true';

function autoLogMiddleware() {
    return (req, res, next) => {
        if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();

        if (DEBUG_BITACORA) {
            console.log(`[BITACORA] Middleware reached: ${req.method} ${req.path}`);
        }

        res.on('finish', () => {
            if (DEBUG_BITACORA) {
                console.log(`[BITACORA] Finish event: ${req.method} ${req.path} status=${res.statusCode} user=${req.user?.id || 'none'} db=${!!getDb()}`);
            }

            if (!req.user) return;
            if (res.statusCode < 200 || res.statusCode >= 300) return;

            const db = getDb();
            if (!db) return;

            const pathParts = req.path.replace(/^\/api\//, '').split('/');
            const entidad = pathParts.filter(p => !/^\d+$/.test(p)).join('.') || 'unknown';

            let entidadId = null;
            const numericParts = pathParts.filter(p => /^\d+$/.test(p));
            if (numericParts.length > 0) {
                entidadId = numericParts[numericParts.length - 1];
            }

            const lastSegment = pathParts[pathParts.length - 1];
            if (lastSegment && /^\d+$/.test(lastSegment)) {
                entidadId = lastSegment;
            }

            let accion;
            switch (req.method) {
                case 'POST': accion = 'CREATE'; break;
                case 'PUT': accion = 'UPDATE'; break;
                case 'PATCH': accion = 'UPDATE'; break;
                case 'DELETE': accion = 'DELETE'; break;
                default: accion = 'OTHER';
            }

            let detalles = null;
            if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
                try {
                    let payloadToSanitize = req.body;
                    if (Array.isArray(req.body) && req.body.length > 50) {
                        payloadToSanitize = {
                            _tipo: 'Arreglo masivo',
                            total_elementos: req.body.length,
                            muestra: req.body.slice(0, 5)
                        };
                    } else if (req.body.data && Array.isArray(req.body.data) && req.body.data.length > 50) {
                        payloadToSanitize = {
                            ...req.body,
                            data: {
                                _tipo: 'Arreglo masivo',
                                total_elementos: req.body.data.length,
                                muestra: req.body.data.slice(0, 5)
                            }
                        };
                    }

                    const sanitized = sanitizeData(payloadToSanitize);
                    let str = JSON.stringify(sanitized);
                    if (str.length > MAX_DETAILS_LENGTH) {
                        str = str.slice(0, MAX_DETAILS_LENGTH) + '... [truncado por longitud]';
                    }
                    detalles = str;
                } catch {
                    detalles = null;
                }
            }

            if (DEBUG_BITACORA) {
                console.log(`[BITACORA] Logging: user=${req.user?.username} action=${accion} entity=${entidad} id=${entidadId}`);
            }
            logAction(db, req, accion, entidad, entidadId, detalles);
        });

        next();
    };
}

module.exports = { logAction, autoLogMiddleware, sanitizeData };
