const jwt = require('jsonwebtoken');

if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET) {
        throw new Error('FATAL: JWT_SECRET environment variable must be set in production.');
    }
    if (process.env.JWT_SECRET.length < 32) {
        console.warn('[Security Notice] JWT_SECRET is recommended to be at least 32 characters long for maximum entropy.');
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'sipeadmin_dev_jwt_secret_change_in_production';

const revokedUsers = new Set();
let lastSyncTime = 0;
const SYNC_INTERVAL_MS = 60 * 1000;

const syncRevokedUsersFromDb = async () => {
    try {
        const { getDb } = require('../db');
        const db = getDb();
        if (!db) return;
        const [rows] = await db.query("SELECT id FROM users WHERE status = 'inactive'");
        if (Array.isArray(rows)) {
            rows.forEach(r => revokedUsers.add(Number(r.id)));
        }
        lastSyncTime = Date.now();
    } catch (_) {
        // Silently skip if DB not initialized or in isolated test
    }
};

// Attempt initial sync on startup
setTimeout(() => {
    syncRevokedUsersFromDb();
}, 2000);

const revokeUser = (userId) => {
    if (userId) revokedUsers.add(Number(userId));
};

const restoreUser = (userId) => {
    if (userId) revokedUsers.delete(Number(userId));
};

const isUserRevoked = (userId) => {
    return revokedUsers.has(Number(userId));
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Token de acceso requerido' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(401).json({ message: 'Token inválido o expirado' });

        // Periodically refresh inactive users list in background
        if (Date.now() - lastSyncTime > SYNC_INTERVAL_MS) {
            syncRevokedUsersFromDb();
        }

        if (user.status === 'inactive' || isUserRevoked(user.id)) {
            return res.status(403).json({ message: 'Usuario inactivo o suspendido' });
        }

        req.user = user;
        next();
    });
};

const isAdminUser = (user) => {
    if (!user) return false;
    if (Number(user.role_id) === 1) return true;
    const role = String(user.role || user.role_name || '').trim().toLowerCase();
    return /^(admin|administrator|administrador|super\s*admin|super\s*administrador)$/i.test(role);
};

/**
 * Middleware para validar que el usuario cuente con un permiso específico
 * Los administradores y super administradores siempre tienen acceso total
 */
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Usuario no autenticado' });
        }
        if (isAdminUser(req.user)) {
            return next();
        }

        const userPerms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
        const required = Array.isArray(permission) ? permission : [permission];
        const hasPerm = required.some(p => userPerms.includes(p));

        if (hasPerm) {
            return next();
        }

        return res.status(403).json({ 
            message: 'Acceso denegado: no cuenta con los permisos necesarios para realizar esta acción.' 
        });
    };
};

/**
 * Middleware para validar que el usuario tenga un rol específico
 * Los administradores y super administradores siempre son autorizados para roles de administrador
 */
const requireRole = (allowedRoles) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Usuario no autenticado' });
        }

        if (isAdminUser(req.user)) {
            return next();
        }

        const isAllowed = roles.some(r => {
            if (typeof r === 'number') return Number(req.user.role_id) === r;
            const rLower = String(r).trim().toLowerCase();
            const userRole = String(req.user.role || req.user.role_name || '').trim().toLowerCase();
            return userRole === rLower || (rLower === 'administrator' && isAdminUser(req.user));
        });

        if (isAllowed) {
            return next();
        }

        return res.status(403).json({ 
            message: 'Acceso denegado: su rol no tiene autorización para acceder a este recurso.' 
        });
    };
};

module.exports = { 
    authenticateToken, 
    requirePermission, 
    requireRole, 
    isAdminUser,
    JWT_SECRET,
    revokeUser,
    restoreUser,
    isUserRevoked,
    syncRevokedUsersFromDb
};

