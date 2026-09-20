const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { authenticateToken, requirePermission, requireRole, JWT_SECRET, revokeUser, restoreUser } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

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
    const { username, password } = req.body;
    try {
        const db = getDb();
        const [rows] = await withRetry(() => db.query(`
            SELECT u.*, r.name as role_name 
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id 
            WHERE u.username = ?
        `, [username]));

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const user = rows[0];
        if (user.status !== 'active') {
            return res.status(403).json({ message: 'Usuario inactivo. Contacte al administrador.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // Fetch permissions
        const [perms] = await withRetry(() => db.query('SELECT p.name FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?', [user.role_id]));
        const permissions = perms.map(p => p.name);

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role_name, role_id: user.role_id, permissions, status: user.status }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, nombre: user.nombre, role: user.role_name, role_id: user.role_id, permissions, status: user.status } });
    } catch (error) {
        sendSafeError(res, error, 'Error al iniciar sesión');
    }
});

// --- Verify Token ---
router.get('/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// --- Users Management ---
router.get('/users', authenticateToken, requirePermission('/dashboard/users'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query(`
            SELECT u.id, u.username, u.nombre, u.email, u.status, u.role_id, r.name as role_name 
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id
        `);
        res.json(rows);
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener usuarios');
    }
});

router.post('/users', authenticateToken, requirePermission('/dashboard/users'), async (req, res) => {
    const { username, nombre, email, password, role_id } = req.body;
    if (!username || typeof username !== 'string' || !username.trim()) {
        return res.status(400).json({ message: 'El nombre de usuario es requerido.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
    }
    try {
        const db = getDb();
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, nombre, email, password, role_id) VALUES (?, ?, ?, ?, ?)', [username.trim(), nombre || null, email || null, hashedPassword, role_id]);
        res.status(201).json({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El nombre de usuario ya existe' });
        sendSafeError(res, error, 'Error al crear usuario');
    }
});

router.put('/users/:id', authenticateToken, requirePermission('/dashboard/users'), async (req, res) => {
    const { id } = req.params;
    const { username, nombre, email, password, status, role_id } = req.body;
    if (password !== undefined && password !== null && password !== '') {
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
        }
    }
    if (status && !['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Estado inválido. Debe ser "active" o "inactive".' });
    }
    try {
        const db = getDb();
        let query = 'UPDATE users SET status = ?, role_id = ?, nombre = ?, email = ?';
        let params = [status, role_id, nombre || null, email || null];

        if (username) {
            query += ', username = ?';
            params.push(username.trim());
        }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await db.query(query, params);
        if (status === 'inactive') {
            revokeUser(id);
        } else if (status === 'active') {
            restoreUser(id);
        }
        res.json({ message: 'Usuario actualizado exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar usuario');
    }
});

router.delete('/users/:id', authenticateToken, requirePermission('/dashboard/users'), async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        if (req.user.id === parseInt(id)) {
            return res.status(400).json({ message: 'No puedes eliminar tu propio usuario' });
        }
        await db.query('DELETE FROM users WHERE id = ?', [id]);
        revokeUser(id);
        res.json({ message: 'Usuario eliminado exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar usuario');
    }
});

router.put('/users/:id/status', authenticateToken, requirePermission('/dashboard/users'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Estado inválido. Debe ser "active" o "inactive".' });
    }
    try {
        const db = getDb();
        await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        if (status === 'inactive') {
            revokeUser(id);
        } else if (status === 'active') {
            restoreUser(id);
        }
        res.json({ message: 'User status updated' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar estado');
    }
});

// --- Roles Management ---
router.get('/roles', authenticateToken, requireRole('Administrator'), async (req, res) => {
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
    const { name, description, permissions } = req.body;
    const db = getDb();
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query('INSERT INTO roles (name, description) VALUES (?, ?)', [name, description]);
        const roleId = result.insertId;

        const cleanPerms = Array.isArray(permissions) ? [...new Set(permissions.filter(Boolean))] : [];
        if (cleanPerms.length > 0) {
            await conn.query('INSERT IGNORE INTO permissions (name) VALUES ?', [cleanPerms.map(p => [p])]);
            const [permRows] = await conn.query('SELECT id FROM permissions WHERE name IN (?)', [cleanPerms]);
            if (permRows.length > 0) {
                const rolePermValues = permRows.map(p => [roleId, p.id]);
                await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ?', [rolePermValues]);
            }
        }
        await conn.commit();
        res.status(201).json({ message: 'Rol creado exitosamente' });
    } catch (error) {
        await conn.rollback();
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El rol ya existe' });
        sendSafeError(res, error, 'Error al crear rol');
    } finally {
        conn.release();
    }
});

router.put('/roles/:id', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    const db = getDb();
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description, id]);
        await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);

        const cleanPerms = Array.isArray(permissions) ? [...new Set(permissions.filter(Boolean))] : [];
        if (cleanPerms.length > 0) {
            await conn.query('INSERT IGNORE INTO permissions (name) VALUES ?', [cleanPerms.map(p => [p])]);
            const [permRows] = await conn.query('SELECT id FROM permissions WHERE name IN (?)', [cleanPerms]);
            if (permRows.length > 0) {
                const rolePermValues = permRows.map(p => [id, p.id]);
                await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ?', [rolePermValues]);
            }
        }
        await conn.commit();
        res.json({ message: 'Rol actualizado exitosamente' });
    } catch (error) {
        await conn.rollback();
        sendSafeError(res, error, 'Error al actualizar rol');
    } finally {
        conn.release();
    }
});

router.delete('/roles/:id', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM roles WHERE id = ?', [id]);
        res.json({ message: 'Rol eliminado' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ message: 'No puede eliminarse porque tiene usuarios asignados' });
        sendSafeError(res, error, 'Error al eliminar rol');
    }
});

module.exports = router;
