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

function autoLogMiddleware() {
    return (req, res, next) => {
        if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();

        console.log(`[BITACORA] Middleware reached: ${req.method} ${req.path}`);

        res.on('finish', () => {
            console.log(`[BITACORA] Finish event: ${req.method} ${req.path} status=${res.statusCode} user=${req.user?.id || 'none'} db=${!!getDb()}`);

            if (!req.user) { console.log('[BITACORA] Skipping: no req.user'); return; }
            if (res.statusCode < 200 || res.statusCode >= 300) { console.log('[BITACORA] Skipping: status not 2xx'); return; }

            const db = getDb();
            if (!db) { console.log('[BITACORA] Skipping: no db'); return; }

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
                    const sanitized = { ...req.body };
                    if (sanitized.password) sanitized.password = '***';
                    if (sanitized.token) sanitized.token = '***';
                    detalles = JSON.stringify(sanitized);
                } catch (e) {
                    detalles = null;
                }
            }

            console.log(`[BITACORA] Logging: user=${req.user?.username} action=${accion} entity=${entidad} id=${entidadId}`);
            logAction(db, req, accion, entidad, entidadId, detalles);
        });

        next();
    };
}

module.exports = { logAction, autoLogMiddleware };
