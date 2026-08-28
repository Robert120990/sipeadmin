const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

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
        const [rows] = await withRetry(() => db.query('SELECT u.*, r.name as role_name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.username = ?', [username]));
        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.status === 'inactive') {
            return res.status(403).json({ message: 'User is inactive' });
        }

        // Fetch permissions
        const [perms] = await withRetry(() => db.query('SELECT p.name FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?', [user.role_id]));
        const permissions = perms.map(p => p.name);

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role_name, role_id: user.role_id, permissions }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { id: user.id, username: user.username, nombre: user.nombre, role: user.role_name, role_id: user.role_id, permissions } });
    } catch (error) {
        console.error('LOGIN ERROR:', error);
        const isConnError = error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || error.code === 'ER_ACCESS_DENIED';
        const detail = isConnError
            ? 'No se pudo conectar a la base de datos. Verifica las credenciales en Vercel (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).'
            : error.message;
        res.status(500).json({ message: detail, error: error.message });
    }
});

// --- User Management ---
router.get('/users', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query(`
            SELECT u.id, u.username, u.nombre, u.email, u.status, r.name as role_name, u.created_at
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/users', authenticateToken, async (req, res) => {
    const { username, nombre, email, password, role_id } = req.body;
    try {
        const db = getDb();
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, nombre, email, password, role_id) VALUES (?, ?, ?, ?, ?)', [username, nombre || null, email || null, hashedPassword, role_id]);
        res.status(201).json({ message: 'User created' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { username, nombre, email, password, status, role_id } = req.body;
    try {
        const db = getDb();
        let query = 'UPDATE users SET status = ?, role_id = ?, nombre = ?, email = ?';
        let params = [status, role_id, nombre || null, email || null];

        if (username) {
            query += ', username = ?';
            params.push(username);
        }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(id);

        await db.query(query, params);
        res.json({ message: 'User updated' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/users/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const db = getDb();
        await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'User status updated' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Roles Management ---
router.get('/roles', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [roles] = await db.query('SELECT * FROM roles');
        for (let role of roles) {
            const [perms] = await db.query('SELECT p.name FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?', [role.id]);
            role.permissions = perms.map(p => p.name);
        }
        res.json(roles);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/roles', authenticateToken, async (req, res) => {
    const { name, description, permissions } = req.body;
    try {
        const db = getDb();
        const [result] = await db.query('INSERT INTO roles (name, description) VALUES (?, ?)', [name, description]);
        const roleId = result.insertId;
        
        if (permissions && permissions.length > 0) {
            for (const permName of permissions) {
                await db.query('INSERT IGNORE INTO permissions (name) VALUES (?)', [permName]);
                const [[perm]] = await db.query('SELECT id FROM permissions WHERE name = ?', [permName]);
                if (perm) {
                    await db.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, perm.id]);
                }
            }
        }
        res.status(201).json({ message: 'Rol creado exitosamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El rol ya existe' });
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/roles/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    try {
        const db = getDb();
        await db.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description, id]);
        await db.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
        
        if (permissions && permissions.length > 0) {
            for (const permName of permissions) {
                await db.query('INSERT IGNORE INTO permissions (name) VALUES (?)', [permName]);
                const [[perm]] = await db.query('SELECT id FROM permissions WHERE name = ?', [permName]);
                if (perm) {
                    await db.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [id, perm.id]);
                }
            }
        }
        res.json({ message: 'Rol actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/roles/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM roles WHERE id = ?', [id]);
        res.json({ message: 'Rol eliminado' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({message: 'No puede eliminarse porque tiene usuarios asignados'});
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
