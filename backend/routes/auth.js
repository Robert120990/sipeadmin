const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser, invalidateUserAuthCache, invalidateRoleAuthCache } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

const isRoleRowAdmin = (roleRow) => {
    if (!roleRow) return false;
    return isAdminUser({ role_id: roleRow.id, role_name: roleRow.name });
};

/**
 * Valida la contraseña enviada en creación o actualización de usuario.
 * Evita contraseñas compuestas solo por espacios o con espacios accidentales al inicio/final.
 */
const validatePasswordInput = (password, { required = false } = {}) => {
    if (!required && (password === undefined || password === null || password === '')) {
        return { shouldUpdate: false, error: null };
    }
    if (typeof password !== 'string' || !password.trim()) {
        return { shouldUpdate: false, error: 'La contraseña debe tener al menos 8 caracteres válidos.' };
    }
    if (password !== password.trim()) {
        return { shouldUpdate: false, error: 'La contraseña no debe tener espacios al inicio ni al final.' };
    }
    if (password.length < 8) {
        return { shouldUpdate: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
    }
    return { shouldUpdate: true, value: password, error: null };
};

/**
 * Busca un usuario activo o inactivo por nombre de usuario (case-insensitive)
 * o, si el identificador parece correo electrónico, por correo único.
 */
const findLoginUser = async (db, identifier, queryRunner = (sql, params) => db.query(sql, params)) => {
    const cleanIdentifier = String(identifier || '').trim();
    if (!cleanIdentifier) return null;

    const baseSelect = `
        SELECT u.*, r.name as role_name 
        FROM users u 
        LEFT JOIN roles r ON u.role_id = r.id
    `;

    const [byUsername] = await queryRunner(
        `${baseSelect} WHERE LOWER(u.username) = LOWER(?) LIMIT 2`,
        [cleanIdentifier]
    );
    if (byUsername.length === 1) return byUsername[0];
    if (byUsername.length > 1) {
        const exact = byUsername.find(row => row.username === cleanIdentifier);
        return exact || byUsername[0];
    }

    if (cleanIdentifier.includes('@')) {
        const [byEmail] = await queryRunner(
            `${baseSelect} WHERE LOWER(u.email) = LOWER(?) LIMIT 2`,
            [cleanIdentifier]
        );
        if (byEmail.length === 1) return byEmail[0];
    }

    return null;
};

const withRetry = async (fn, retries = 2) => {
    try {
        return await fn();
    } catch (err) {
        if ((err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ETIMEDOUT') && retries > 0) {
            console.warn(`[AUTH] Retrying DB query due to ${err.code}...`);
            await new Promise(r => setTimeout(r, 200));
            return await withRetry(fn, retries - 1);
        }
        throw err;
    }
};

// --- Login ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || typeof username !== 'string' || !username.trim() || !password || typeof password !== 'string') {
        return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
    }
    const cleanUsername = username.trim();
    try {
        const db = getDb();
        const user = await findLoginUser(db, cleanUsername, (sql, params) => withRetry(() => db.query(sql, params)));

        if (!user) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        if (user.status !== 'active') {
            return res.status(403).json({ message: 'Usuario inactivo. Contacte al administrador.' });
        }

        if (!user.password || typeof user.password !== 'string') {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // Asegurar que un usuario activo no quede bloqueado por caché obsoleta en memoria
        restoreUser(user.id);

        // Fetch permissions
        const [perms] = await withRetry(() => db.query('SELECT p.name FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?', [user.role_id]));
        const permissions = perms.map(p => p.name);
        const tokenVersion = Number(user.token_version || 1);

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role_name, role_id: user.role_id, permissions, status: user.status, tv: tokenVersion }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, nombre: user.nombre, email: user.email || null, role: user.role_name, role_id: user.role_id, permissions, status: user.status } });
    } catch (error) {
        sendSafeError(res, error, 'Error al iniciar sesión');
    }
});

// --- Verify Token ---
router.get('/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// --- Users Management & Directory ---
router.get('/users', authenticateToken, requirePermission(['/dashboard/users', 'manage_users', '/dashboard/operaciones/tareas', 'manage_tasks']), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query(`
            SELECT u.id, u.username, u.nombre, u.email, u.status, u.role_id, u.created_at, r.name as role_name 
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id
        `);
        res.json(rows);
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener usuarios');
    }
});

router.post('/users', authenticateToken, requirePermission(['/dashboard/users', 'manage_users']), async (req, res) => {
    const { username, nombre, email, password, role_id, status } = req.body || {};
    if (!username || typeof username !== 'string' || !username.trim()) {
        return res.status(400).json({ message: 'El nombre de usuario es requerido.' });
    }
    const cleanUsername = username.trim();

    if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
        return res.status(400).json({ message: 'El nombre completo es requerido.' });
    }
    const cleanNombre = nombre.trim();

    const passwordCheck = validatePasswordInput(password, { required: true });
    if (passwordCheck.error) {
        return res.status(400).json({ message: passwordCheck.error });
    }

    if (role_id === undefined || role_id === null || role_id === '') {
        return res.status(400).json({ message: 'Debe seleccionar un rol para el usuario.' });
    }
    const cleanRoleId = parseInt(role_id, 10);
    if (isNaN(cleanRoleId)) {
        return res.status(400).json({ message: 'El rol seleccionado no es válido.' });
    }

    const cleanEmail = (email && typeof email === 'string' && email.trim()) ? email.trim() : null;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ message: 'El formato del correo electrónico no es válido.' });
    }
    const cleanStatus = status === 'inactive' ? 'inactive' : 'active';

    try {
        const db = getDb();
        const [roleRows] = await db.query('SELECT id, name FROM roles WHERE id = ?', [cleanRoleId]);
        if (roleRows.length === 0) {
            return res.status(400).json({ message: 'El rol seleccionado no existe en el sistema.' });
        }

        if (!isAdminUser(req.user) && (cleanRoleId === 1 || isRoleRowAdmin(roleRows[0]))) {
            return res.status(403).json({ message: 'Solo un Administrador puede asignar el rol de Administrador.' });
        }

        const hashedPassword = await bcrypt.hash(passwordCheck.value, 10);
        await db.query(
            'INSERT INTO users (username, nombre, email, password, role_id, status) VALUES (?, ?, ?, ?, ?, ?)',
            [cleanUsername, cleanNombre, cleanEmail, hashedPassword, cleanRoleId, cleanStatus]
        );
        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El nombre de usuario ya existe' });
        sendSafeError(res, error, 'Error al crear usuario');
    }
});

router.put('/users/:id', authenticateToken, requirePermission(['/dashboard/users', 'manage_users']), async (req, res) => {
    const { id } = req.params;
    const targetId = parseInt(id, 10);
    if (isNaN(targetId)) {
        return res.status(400).json({ message: 'ID de usuario inválido.' });
    }
    const { username, nombre, email, password, status, role_id } = req.body || {};
    const passwordCheck = validatePasswordInput(password, { required: false });
    if (passwordCheck.error) {
        return res.status(400).json({ message: passwordCheck.error });
    }
    if (status && !['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Estado inválido. Debe ser "active" o "inactive".' });
    }
    if (Number(req.user.id) === targetId && status === 'inactive') {
        return res.status(400).json({ message: 'No puedes desactivar tu propio usuario.' });
    }

    const cleanEmail = email !== undefined
        ? ((email && typeof email === 'string' && email.trim()) ? email.trim() : null)
        : undefined;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ message: 'El formato del correo electrónico no es válido.' });
    }

    let cleanRoleId = undefined;
    if (role_id !== undefined && role_id !== null && role_id !== '') {
        cleanRoleId = parseInt(role_id, 10);
        if (isNaN(cleanRoleId)) {
            return res.status(400).json({ message: 'El rol seleccionado no es válido.' });
        }
        if (Number(req.user.id) === targetId && req.user.role_id !== undefined && cleanRoleId !== Number(req.user.role_id)) {
            return res.status(400).json({ message: 'No puedes cambiar tu propio rol desde esta pantalla.' });
        }
    }

    try {
        const db = getDb();
        const [targetRows] = await db.query(
            'SELECT u.id, u.role_id, u.status, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?',
            [targetId]
        );
        if (targetRows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        const existingUser = targetRows[0];

        if (!isAdminUser(req.user) && isRoleRowAdmin({ id: existingUser.role_id, name: existingUser.role_name })) {
            return res.status(403).json({ message: 'Solo un Administrador puede modificar una cuenta de Administrador.' });
        }

        if (cleanRoleId !== undefined) {
            const [roleRows] = await db.query('SELECT id, name FROM roles WHERE id = ?', [cleanRoleId]);
            if (roleRows.length === 0) {
                return res.status(400).json({ message: 'El rol seleccionado no existe en el sistema.' });
            }
            if (!isAdminUser(req.user) && (cleanRoleId === 1 || isRoleRowAdmin(roleRows[0]))) {
                return res.status(403).json({ message: 'Solo un Administrador puede asignar el rol de Administrador.' });
            }
        }

        const roleChanged = cleanRoleId !== undefined && cleanRoleId !== Number(existingUser.role_id);
        const shouldBumpTokenVersion = Boolean(passwordCheck.shouldUpdate || roleChanged || status === 'inactive');

        let query = 'UPDATE users SET status = COALESCE(?, status)';
        let params = [status || null];

        if (cleanRoleId !== undefined) {
            query += ', role_id = ?';
            params.push(cleanRoleId);
        }
        if (nombre !== undefined) {
            query += ', nombre = ?';
            params.push((nombre && typeof nombre === 'string' && nombre.trim()) ? nombre.trim() : null);
        }
        if (cleanEmail !== undefined) {
            query += ', email = ?';
            params.push(cleanEmail);
        }
        if (username && typeof username === 'string' && username.trim()) {
            query += ', username = ?';
            params.push(username.trim());
        }
        if (passwordCheck.shouldUpdate) {
            const hashedPassword = await bcrypt.hash(passwordCheck.value, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }
        if (shouldBumpTokenVersion) {
            query += ', token_version = COALESCE(token_version, 1) + 1';
        }

        query += ' WHERE id = ?';
        params.push(targetId);

        let updateResult;
        try {
            [updateResult] = await db.query(query, params);
        } catch (err) {
            if (err && err.code === 'ER_BAD_FIELD_ERROR' && shouldBumpTokenVersion) {
                const fallbackQuery = query.replace(', token_version = COALESCE(token_version, 1) + 1', '');
                [updateResult] = await db.query(fallbackQuery, params);
            } else {
                throw err;
            }
        }

        if (updateResult && updateResult.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        if (status === 'inactive') {
            revokeUser(targetId);
            if (req.io && typeof req.io.in === 'function') {
                req.io.in(`user_${targetId}`).disconnectSockets(true);
            }
        } else if (status === 'active') {
            restoreUser(targetId);
        } else {
            invalidateUserAuthCache(targetId);
            if (shouldBumpTokenVersion && req.io && typeof req.io.in === 'function') {
                req.io.in(`user_${targetId}`).disconnectSockets(true);
            }
        }
        res.json({
            message: passwordCheck.shouldUpdate
                ? 'Usuario y contraseña actualizados exitosamente'
                : 'Usuario actualizado exitosamente',
            passwordUpdated: passwordCheck.shouldUpdate,
            sessionsInvalidated: shouldBumpTokenVersion
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El nombre de usuario ya existe' });
        sendSafeError(res, error, 'Error al actualizar usuario');
    }
});

router.delete('/users/:id', authenticateToken, requirePermission(['/dashboard/users', 'manage_users']), async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        if (Number(req.user.id) === parseInt(id, 10)) {
            return res.status(400).json({ message: 'No puedes eliminar tu propio usuario' });
        }
        if (!isAdminUser(req.user)) {
            const [targetRows] = await db.query(
                'SELECT u.role_id, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?',
                [id]
            );
            if (targetRows.length > 0 && isRoleRowAdmin({ id: targetRows[0].role_id, name: targetRows[0].role_name })) {
                return res.status(403).json({ message: 'Solo un Administrador puede eliminar una cuenta de Administrador.' });
            }
        }
        const [delRes] = await db.query('DELETE FROM users WHERE id = ?', [id]);
        if (delRes && delRes.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        revokeUser(id, true);
        if (req.io && typeof req.io.in === 'function') {
            req.io.in(`user_${id}`).disconnectSockets(true);
        }
        res.json({ message: 'Usuario eliminado exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar usuario');
    }
});

router.put('/users/:id/status', authenticateToken, requirePermission(['/dashboard/users', 'manage_users']), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status || !['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Estado inválido. Debe ser "active" o "inactive".' });
    }
    if (Number(req.user.id) === parseInt(id, 10) && status === 'inactive') {
        return res.status(400).json({ message: 'No puedes desactivar tu propio usuario' });
    }
    try {
        const db = getDb();
        if (!isAdminUser(req.user)) {
            const [targetRows] = await db.query(
                'SELECT u.role_id, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?',
                [id]
            );
            if (targetRows.length > 0 && isRoleRowAdmin({ id: targetRows[0].role_id, name: targetRows[0].role_name })) {
                return res.status(403).json({ message: 'Solo un Administrador puede modificar el estado de un Administrador.' });
            }
        }
        let statusUpdateRes;
        if (status === 'inactive') {
            try {
                [statusUpdateRes] = await db.query('UPDATE users SET status = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?', [status, id]);
            } catch (err) {
                if (err && err.code === 'ER_BAD_FIELD_ERROR') {
                    [statusUpdateRes] = await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
                } else {
                    throw err;
                }
            }
            revokeUser(id);
            if (req.io && typeof req.io.in === 'function') {
                req.io.in(`user_${id}`).disconnectSockets(true);
            }
        } else {
            [statusUpdateRes] = await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
            restoreUser(id);
        }
        if (statusUpdateRes && statusUpdateRes.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        res.json({ message: 'Estado del usuario actualizado' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar estado');
    }
});

// --- Roles Management ---
router.get('/roles', authenticateToken, requirePermission(['/dashboard/users', 'manage_users', 'manage_roles', '/dashboard/permissions']), async (req, res) => {
    try {
        const db = getDb();
        const [roles] = await db.query('SELECT * FROM roles ORDER BY id ASC');
        if (roles.length > 0) {
            const roleIds = roles.map(r => r.id);
            const [perms] = await db.query(
                `SELECT rp.role_id, p.name 
                 FROM permissions p 
                 JOIN role_permissions rp ON p.id = rp.permission_id 
                 WHERE rp.role_id IN (?)`,
                [roleIds]
            );
            const permsByRole = {};
            for (const p of perms) {
                if (!permsByRole[p.role_id]) permsByRole[p.role_id] = [];
                permsByRole[p.role_id].push(p.name);
            }
            for (const role of roles) {
                role.permissions = permsByRole[role.id] || [];
            }
        }
        res.json(roles);
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener roles');
    }
});

router.post('/roles', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { name, description, permissions } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) {
        return res.status(400).json({ message: 'El nombre del rol es requerido.' });
    }
    const cleanDesc = typeof description === 'string' ? description.trim() : '';

    const db = getDb();
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query('INSERT INTO roles (name, description) VALUES (?, ?)', [cleanName, cleanDesc]);
        const roleId = result.insertId;

        const cleanPerms = Array.isArray(permissions)
            ? [...new Set(permissions.map(p => (typeof p === 'string' ? p.trim() : '')).filter(Boolean))]
            : [];
        if (cleanPerms.length > 0) {
            await conn.query('INSERT IGNORE INTO permissions (name) VALUES ?', [cleanPerms.map(p => [p])]);
            const [permRows] = await conn.query('SELECT id FROM permissions WHERE name IN (?)', [cleanPerms]);
            if (permRows.length > 0) {
                const rolePermValues = permRows.map(p => [roleId, p.id]);
                await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ?', [rolePermValues]);
            }
        }
        await conn.commit();
        res.status(201).json({ message: 'Rol creado exitosamente', id: roleId });
    } catch (error) {
        await conn.rollback().catch(() => {});
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El rol ya existe' });
        sendSafeError(res, error, 'Error al crear rol');
    } finally {
        conn.release();
    }
});

router.put('/roles/:id', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { id } = req.params;
    const roleIdNum = parseInt(id, 10);
    if (isNaN(roleIdNum)) {
        return res.status(400).json({ message: 'ID de rol inválido.' });
    }
    const { name, description, permissions } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) {
        return res.status(400).json({ message: 'El nombre del rol es requerido.' });
    }
    const cleanDesc = typeof description === 'string' ? description.trim() : '';

    const db = getDb();
    const conn = await db.getConnection();
    try {
        const [existingRoles] = await conn.query('SELECT id, name FROM roles WHERE id = ?', [roleIdNum]);
        if (existingRoles.length === 0) {
            return res.status(404).json({ message: 'Rol no encontrado.' });
        }
        const currentRole = existingRoles[0];
        if (isRoleRowAdmin(currentRole) && cleanName !== currentRole.name) {
            return res.status(400).json({ message: 'No se puede renombrar un rol administrativo principal.' });
        }

        await conn.beginTransaction();
        await conn.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [cleanName, cleanDesc, roleIdNum]);
        await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleIdNum]);

        const cleanPerms = Array.isArray(permissions)
            ? [...new Set(permissions.map(p => (typeof p === 'string' ? p.trim() : '')).filter(Boolean))]
            : [];
        if (cleanPerms.length > 0) {
            await conn.query('INSERT IGNORE INTO permissions (name) VALUES ?', [cleanPerms.map(p => [p])]);
            const [permRows] = await conn.query('SELECT id FROM permissions WHERE name IN (?)', [cleanPerms]);
            if (permRows.length > 0) {
                const rolePermValues = permRows.map(p => [roleIdNum, p.id]);
                await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ?', [rolePermValues]);
            }
        }
        await conn.commit();
        invalidateRoleAuthCache(roleIdNum);
        res.json({ message: 'Rol actualizado exitosamente' });
    } catch (error) {
        await conn.rollback().catch(() => {});
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Ya existe otro rol con ese nombre.' });
        sendSafeError(res, error, 'Error al actualizar rol');
    } finally {
        conn.release();
    }
});

router.delete('/roles/:id', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { id } = req.params;
    const roleIdNum = parseInt(id, 10);
    if (isNaN(roleIdNum)) {
        return res.status(400).json({ message: 'ID de rol inválido.' });
    }
    try {
        const db = getDb();
        const [existingRoles] = await db.query('SELECT id, name FROM roles WHERE id = ?', [roleIdNum]);
        if (existingRoles.length === 0) {
            return res.status(404).json({ message: 'Rol no encontrado.' });
        }
        if (isRoleRowAdmin(existingRoles[0])) {
            return res.status(400).json({ message: 'No se puede eliminar un rol administrativo principal.' });
        }

        await db.query('DELETE FROM roles WHERE id = ?', [roleIdNum]);
        invalidateRoleAuthCache(roleIdNum);
        res.json({ message: 'Rol eliminado' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ message: 'No puede eliminarse porque tiene usuarios asignados' });
        sendSafeError(res, error, 'Error al eliminar rol');
    }
});

router._helpers = { findLoginUser, validatePasswordInput };

module.exports = router;
