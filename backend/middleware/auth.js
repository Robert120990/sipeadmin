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
const deletedUsers = new Set();
const userAuthCache = new Map();
const USER_AUTH_CACHE_TTL_MS = 15 * 1000;
let lastSyncTime = 0;
const SYNC_INTERVAL_MS = 60 * 1000;

const invalidateUserAuthCache = (userId) => {
    if (!userId) return;
    userAuthCache.delete(Number(userId));
};

const invalidateRoleAuthCache = (roleId = null) => {
    if (!roleId) {
        userAuthCache.clear();
        return;
    }
    const targetRoleId = Number(roleId);
    for (const [uid, entry] of userAuthCache.entries()) {
        if (Number(entry.role_id) === targetRoleId) {
            userAuthCache.delete(uid);
        }
    }
};

const syncRevokedUsersFromDb = async () => {
    try {
        const { getDbIfReady } = require('../db');
        const db = typeof getDbIfReady === 'function' ? getDbIfReady() : null;
        if (!db) return;
        const [rows] = await db.query('SELECT id, status FROM users');
        if (Array.isArray(rows)) {
            rows.forEach((r) => {
                const uid = Number(r.id);
                if (r.status === 'inactive') {
                    revokedUsers.add(uid);
                } else if (r.status === 'active' && !deletedUsers.has(uid)) {
                    revokedUsers.delete(uid);
                }
            });
        }
        lastSyncTime = Date.now();
    } catch (_) {
        // Silently skip if DB not initialized or in isolated test
    }
};

// Attempt initial sync on startup
if (process.env.NODE_ENV !== 'test') {
    const initSyncTimer = setTimeout(() => {
        syncRevokedUsersFromDb();
    }, 2000);
    if (initSyncTimer && typeof initSyncTimer.unref === 'function') initSyncTimer.unref();
}

const revokeUser = (userId, isDeleted = false) => {
    if (!userId) return;
    const uid = Number(userId);
    revokedUsers.add(uid);
    if (isDeleted) {
        deletedUsers.add(uid);
    }
    invalidateUserAuthCache(uid);
};

const restoreUser = (userId) => {
    if (!userId) return;
    const uid = Number(userId);
    deletedUsers.delete(uid);
    revokedUsers.delete(uid);
    invalidateUserAuthCache(uid);
};

const isUserRevoked = (userId) => {
    return revokedUsers.has(Number(userId));
};

const fetchLiveUserAuthState = async (db, userId) => {
    const uid = Number(userId);
    const now = Date.now();
    const cached = userAuthCache.get(uid);
    if (cached && cached.expiresAt > now) {
        return cached;
    }

    let userRows;
    try {
        [userRows] = await db.query(
            'SELECT u.id, u.username, u.nombre, u.status, u.role_id, u.token_version, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ? LIMIT 1',
            [uid]
        );
    } catch (err) {
        if (err && err.code === 'ER_BAD_FIELD_ERROR') {
            [userRows] = await db.query(
                'SELECT u.id, u.username, u.nombre, u.status, u.role_id, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ? LIMIT 1',
                [uid]
            );
        } else {
            throw err;
        }
    }

    if (!Array.isArray(userRows) || userRows.length === 0) {
        return null;
    }

    const row = userRows[0];
    let permissions = [];
    if (row.role_id) {
        const [permRows] = await db.query(
            'SELECT p.name FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?',
            [row.role_id]
        );
        permissions = Array.isArray(permRows) ? permRows.map(p => p.name) : [];
    }

    const state = {
        id: row.id,
        username: row.username,
        nombre: row.nombre,
        status: row.status,
        role_id: row.role_id,
        role_name: row.role_name,
        token_version: Number(row.token_version || 1),
        permissions,
        expiresAt: now + USER_AUTH_CACHE_TTL_MS
    };
    userAuthCache.set(uid, state);
    return state;
};

const resolveLiveUserAuthState = async (decodedUser) => {
    if (!decodedUser) {
        return { ok: false, statusCode: 401, message: 'Token inválido o expirado' };
    }
    if (decodedUser.status === 'inactive' || isUserRevoked(decodedUser.id)) {
        return { ok: false, statusCode: 403, message: 'Usuario inactivo o suspendido' };
    }

    const { getDbIfReady } = require('../db');
    const db = typeof getDbIfReady === 'function' ? getDbIfReady() : null;
    if (!db || !decodedUser.id) {
        return { ok: true, user: decodedUser };
    }

    try {
        const live = await fetchLiveUserAuthState(db, decodedUser.id);
        if (!live) {
            revokeUser(decodedUser.id, true);
            return { ok: false, statusCode: 401, message: 'Usuario no encontrado o sesión inválida' };
        }
        if (live.status !== 'active') {
            revokeUser(decodedUser.id);
            return { ok: false, statusCode: 403, message: 'Usuario inactivo o suspendido' };
        }

        const dbTv = Number(live.token_version || 1);
        const tokenTv = decodedUser.tv !== undefined && decodedUser.tv !== null ? Number(decodedUser.tv) : null;
        if ((tokenTv !== null && tokenTv !== dbTv) || (tokenTv === null && dbTv > 1)) {
            return { ok: false, statusCode: 401, message: 'Sesión invalidada por cambio de contraseña o rol. Inicie sesión nuevamente.' };
        }

        return {
            ok: true,
            user: {
                ...decodedUser,
                username: live.username || decodedUser.username,
                nombre: live.nombre !== undefined ? live.nombre : decodedUser.nombre,
                role: live.role_name,
                role_name: live.role_name,
                role_id: live.role_id,
                permissions: live.permissions,
                status: live.status,
                tv: dbTv
            }
        };
    } catch (err) {
        console.warn('[Auth] Fallback a validación stateless por error temporal de BD:', err.message);
        return { ok: true, user: decodedUser };
    }
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

        const { getDbIfReady } = require('../db');
        const db = typeof getDbIfReady === 'function' ? getDbIfReady() : null;
        if (!db || !user.id) {
            req.user = user;
            return next();
        }

        resolveLiveUserAuthState(user)
            .then((result) => {
                if (!result.ok) {
                    return res.status(result.statusCode || 401).json({ message: result.message });
                }
                req.user = result.user;
                return next();
            })
            .catch(() => {
                req.user = user;
                return next();
            });
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
    syncRevokedUsersFromDb,
    resolveLiveUserAuthState,
    invalidateUserAuthCache,
    invalidateRoleAuthCache
};

