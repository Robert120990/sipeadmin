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

        if (user.status === 'inactive' || isUserRevoked(user.id)) {
            return res.status(403).json({ message: 'Usuario inactivo o suspendido' });
        }

        req.user = user;
        next();
    });
};

/**
 * Middleware para validar que el usuario cuente con un permiso específico
 * Los administradores (role_id === 1) siempre tienen acceso
 */
const requirePermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Usuario no autenticado' });
        }
        if (req.user.role_id === 1 || req.user.role === 'Administrator' || req.user.role_name === 'Administrator') {
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
 */
const requireRole = (allowedRoles) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Usuario no autenticado' });
        }

        const isAllowed = roles.some(r => {
            if (typeof r === 'number') return req.user.role_id === r;
            return req.user.role === r || req.user.role_name === r || (r === 'Administrator' && req.user.role_id === 1);
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
    JWT_SECRET,
    revokeUser,
    restoreUser,
    isUserRevoked
};

