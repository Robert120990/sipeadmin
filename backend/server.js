const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { initDB } = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

app.use(cors());
app.use(express.json());

let db;

// Initialize database and start server
const dbPromise = initDB().then(pool => {
    db = pool;
    if (process.env.NODE_ENV !== 'production') {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
}).catch(err => {
    console.error('Failed to initialize database:', err);
});

// Vercel Serverless lazy DB initialization middleware
app.use(async (req, res, next) => {
    if (!db) {
        try {
            await dbPromise;
        } catch (error) {
            return res.status(500).json({ message: 'Database initialization failed. Check DATABASE_URL in Vercel.' });
        }
    }
    next();
});

// Middleware for authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Missing token' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) return res.status(400).json({ message: 'User not found' });

        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ message: 'Invalid password' });

        const token = jwt.sign({ id: user.id, username: user.username, role_id: user.role_id }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { id: user.id, username: user.username, role_id: user.role_id } });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// User Management Routes
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT u.id, u.username, u.status, r.name as role_name, u.created_at
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/users', authenticateToken, async (req, res) => {
    const { username, password, role_id } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)', [username, hashedPassword, role_id]);
        res.status(201).json({ message: 'User created' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { username, password, status, role_id } = req.body;
    try {
        let query = 'UPDATE users SET status = ?, role_id = ?';
        let params = [status, role_id];

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

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// External Database Configuration Routes
app.get('/api/config', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM external_configs ORDER BY created_at DESC LIMIT 1');
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/config', authenticateToken, async (req, res) => {
    const { host, user, password, database_name, port } = req.body;
    try {
        // Test connection first
        const mysql = require('mysql2/promise');
        const testConn = await mysql.createConnection({ host, user, password, database: database_name, port: port || 3306 });
        await testConn.end();

        // Save if successful
        const [existing] = await db.query('SELECT id FROM external_configs LIMIT 1');
        if (existing.length > 0) {
            await db.query(
                'UPDATE external_configs SET host = ?, user = ?, password = ?, database_name = ?, port = ? WHERE id = ?',
                [host, user, password, database_name, port || 3306, existing[0].id]
            );
        } else {
            await db.query(
                'INSERT INTO external_configs (host, user, password, database_name, port) VALUES (?, ?, ?, ?, ?)',
                [host, user, password, database_name, port || 3306]
            );
        }
        res.json({ message: 'Configuración guardada y conexión exitosa' });
    } catch (error) {
        res.status(400).json({ message: `Error de conexión: ${error.message}` });
    }
});

// --- Carriers (Transportistas) Routes ---
app.get('/api/carriers', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM carriers ORDER BY id DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/carriers', authenticateToken, async (req, res) => {
    const { code, description } = req.body;
    try {
        await db.query('INSERT INTO carriers (code, description) VALUES (?, ?)', [code, description]);
        res.status(201).json({ message: 'Transportista creado' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El código ya existe' });
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/carriers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { code, description } = req.body;
    try {
        await db.query('UPDATE carriers SET code = ?, description = ? WHERE id = ?', [code, description, id]);
        res.json({ message: 'Transportista actualizado' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El código ya existe' });
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/carriers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM carriers WHERE id = ?', [id]);
        res.json({ message: 'Transportista eliminado' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({message: 'No puede eliminarse porque tiene pipas asociadas'});
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Tankers (Pipas) Routes ---
app.get('/api/tankers', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT t.*, c.code as carrier_code, c.description as carrier_desc 
            FROM tankers t 
            LEFT JOIN carriers c ON t.carrier_id = c.id
            ORDER BY t.id DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/tankers', authenticateToken, async (req, res) => {
    const { code, carrier_id, compartments } = req.body;
    try {
        await db.query('INSERT INTO tankers (code, carrier_id, compartments) VALUES (?, ?, ?)', [code, carrier_id, JSON.stringify(compartments)]);
        res.status(201).json({ message: 'Pipa creada' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El código ya existe' });
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/tankers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { code, carrier_id, compartments } = req.body;
    try {
        await db.query('UPDATE tankers SET code = ?, carrier_id = ?, compartments = ? WHERE id = ?', [code, carrier_id, JSON.stringify(compartments), id]);
        res.json({ message: 'Pipa actualizada' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El código ya existe' });
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/tankers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM tankers WHERE id = ?', [id]);
        res.json({ message: 'Pipa eliminada' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Ventas Estaciones Proxy ---
app.get('/api/ventas/consolidado/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    const axios = require('axios');
    const baseUrl = 'http://207.244.251.167:8041/WSdatos_consolidados.svc';
    
    try {
        const [tiendas, estaciones, margenes, inventario] = await Promise.all([
            axios.get(`${baseUrl}/GetVentasTienda/${date}`),
            axios.get(`${baseUrl}/GetVentasEstacion/${date}`),
            axios.get(`${baseUrl}/GetMargenesEstacion/${date}`),
            axios.get(`${baseUrl}/GetInventario/${date}`)
        ]);

        res.json({
            tiendas: tiendas.data || [],
            estaciones: estaciones.data || [],
            margenes: margenes.data || [],
            inventario: inventario.data || []
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching external API' });
    }
});

app.get('/api/ventas/lubricantes/:start/:end', authenticateToken, async (req, res) => {
    const { start, end } = req.params;
    const axios = require('axios');
    const baseUrl = 'http://207.244.251.167:8041/WSdatos_consolidados.svc';
    
    try {
        const response = await axios.get(`${baseUrl}/GetVtaLubricantes/${start}/${end}`);
        res.json(response.data || []);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching Lubricantes API' });
    }
});

// --- Consultas Routes (External Database) ---
app.get('/api/consultas/:type', authenticateToken, async (req, res) => {
    const { type } = req.params;
    try {
        const [configs] = await db.query('SELECT * FROM external_configs ORDER BY created_at DESC LIMIT 1');
        if (configs.length === 0) {
            return res.status(400).json({ message: 'No hay configuración de base de datos externa. Configúrala primero.' });
        }
        
        const config = configs[0];
        const mysql = require('mysql2/promise');
        const externalDb = await mysql.createConnection({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database_name,
            port: config.port || 3306
        });

        const today = new Date().toISOString().split('T')[0];
        let results;
        if (type === 'saldos-bancos') {
            [results] = await externalDb.query('CALL sp_saldo_en_bancos(?)', [today]);
        } else if (type === 'saldos-chequera') {
            [results] = await externalDb.query('CALL sp_saldo_en_chequera(?)', [today]);
        } else {
            return res.status(404).json({ message: 'Consulta no encontrada' });
        }

        await externalDb.end();
        
        // MySQL stored procedures return an array where [0] is the result set
        res.json(results[0] || []);
    } catch (error) {
        res.status(500).json({ message: `Error ejecutando SP: ${error.message}` });
    }
});

// Roles and Permissions Routes
app.get('/api/roles', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM roles');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/permissions', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM permissions');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = app;
