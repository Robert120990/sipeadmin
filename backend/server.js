const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const axios = require('axios');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { GoogleGenAI } = require('@google/genai');
const { initDB } = require('./db');

const path = require('path');
dotenv.config(); // Standard config works better across environments

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

app.use(cors());
app.use(express.json());

// Global connection caching
let db;
let externalPools = {}; 
const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });
const apiAxios = axios.create({ httpAgent: keepAliveAgent, httpsAgent: keepAliveHttpsAgent });

// Initialize database and start server
const dbPromise = initDB().then(pool => {
    db = pool;
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
    return pool;
});
// Note: We don't catch here globally, we let the middleware or the process handle it.

// Vercel Serverless lazy DB initialization middleware
app.use(async (req, res, next) => {
    if (!db) {
        try {
            await dbPromise;
        } catch (error) {
            console.error('SERVER INIT ERROR:', error.message);
            return res.status(500).json({ 
                message: 'Database initialization failed.',
                error: error.message,
                hint: 'Check DATABASE_URL in Vercel environment variables. Ensure the database allows external connections and the URL format is correct (mysql://user:pass@host:port/db).'
            });
        }
    }
    next();
});

app.get('/api/debug-ping', (req, res) => res.json({ message: 'pong' }));
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

// --- Operaciones Routes (Recortatorios Dashboard) ---
// --- Operaciones Routes (Recortatorios Dashboard) ---
app.get('/api/dashboard/vencimientos', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const now = new Date();
        const toDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        
        console.log(`DASHBOARD: fetching pendings < ${toDate}`);

        const query = `
            SELECT c.descripcion as ubicacion, b.descripcion, a.vencimiento as vence, b.monto, a.id, b.id as id_recordatorio
            FROM web_rc_recordatorios_vencimientos a 
            INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id 
            INNER JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id 
            WHERE a.vencimiento < ? 
            AND a.estado = 'P' AND b.activo = 1
            ORDER BY a.vencimiento DESC
        `;
        const [rows] = await externalDb.query(query, [toDate]);
        console.log(`DASHBOARD: found ${rows.length} records`);
        res.json(rows);
    } catch (error) { 
        console.error('SERVER ERROR IN DASHBOARD:', error);
        res.status(500).json({ message: 'Error' }); 
    }
});



// --- Operaciones Routes (Pedidos de Combustible) ---

app.get('/api/operaciones/estaciones', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden");
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching estaciones' }); }
});

app.get('/api/operaciones/pedidos/datos-tanque/:id_empresa/:fecha', authenticateToken, async (req, res) => {
    try {
        const { id_empresa, fecha } = req.params;
        const externalDb = await getExternalDb();

        const maxFechaQ = `SELECT MAX(fecha) as last_date FROM lecturas_tanque WHERE id_empresa = ? AND fecha <= ?`;
        const [maxRows] = await externalDb.query(maxFechaQ, [id_empresa, fecha]);
        
        let targetDate = fecha;
        if (maxRows.length && maxRows[0].last_date) {
            targetDate = maxRows[0].last_date;
            if (targetDate instanceof Date) { targetDate = targetDate.toISOString().split('T')[0]; }
        }
        
        const query = `
            SELECT b.id_producto AS id_tanque, sum(b.lectura) as lectura, sum(c.capacidad) as capacidad, sum(c.galones_reserva) as reserva, if(c.tipo_combustible='M','I',c.tipo_combustible) as tipo_combustible 
            FROM lecturas_tanque a 
            INNER JOIN detalle_lecturas_tanque b ON a.id = b.id_lectura AND a.id_empresa=b.id_empresa 
            INNER JOIN tanques c ON b.codigo_producto = c.id AND b.id_empresa=c.id_empresa 
            WHERE a.id_empresa = ? AND a.fecha = ? AND a.turno = (SELECT MAX(x.turno) FROM lecturas_tanque x WHERE x.id_empresa=a.id_empresa AND x.fecha=a.fecha) 
            GROUP BY tipo_combustible
        `;
        const [rows] = await externalDb.query(query, [id_empresa, targetDate]);
        res.json({ fecha: targetDate, inventario: rows });
    } catch (error) { res.status(500).json({ message: 'Error fetching datos-tanque' }); }
});

app.get('/api/operaciones/pedidos/promedios/:id_empresa/:fecha', authenticateToken, async (req, res) => {
    try {
        const { id_empresa, fecha } = req.params;
        const externalDb = await getExternalDb();
        const query = `
           SELECT IF(a.id_empresa = '004' AND a.codigo_producto = '0007','I', LEFT(a.nom_producto,1)) AS tipo_combustible,
                  SUM(a.total)/7 as promedio
           FROM cierre_turno_lecturas a 
           INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa=b.id_empresa 
           WHERE a.id_empresa = ? AND STR_TO_DATE(b.fecha_turno,'%d/%m/%Y') BETWEEN DATE_SUB(?, INTERVAL 7 DAY) AND ?
           GROUP BY codigo_producto, a.id_empresa
        `;
        const [rows] = await externalDb.query(query, [id_empresa, fecha, fecha]);
        
        const agg = { D: 0, R: 0, S: 0, I: 0 };
        rows.forEach(r => {
            if (['D', 'R', 'S', 'I'].includes(r.tipo_combustible)) {
                agg[r.tipo_combustible] += Number(r.promedio || 0);
            }
        });
        
        res.json(agg);
    } catch (error) { res.status(500).json({ message: 'Error fetching promedios' }); }
});

app.get('/api/operaciones/pedidos/programados/:id_estacion/:fecha', authenticateToken, async (req, res) => {
    try {
        const { id_estacion, fecha } = req.params;
        const externalDb = await getExternalDb();
        const query = `
            SELECT fecha, numero, diesel, regular, super, iondiesel,
                   IFNULL(id_carrier_local, id_transportista) as id_transportista,
                   IFNULL(id_tanker_local, id_calibracion_diesel) as id_calibracion_diesel,
                   id as id_pedido
            FROM web_pedidos_temp 
            WHERE id_estacion = ? AND fecha > ? ORDER BY fecha
        `;
        const [rows] = await externalDb.query(query, [id_estacion, fecha]);
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching pedidos programados' }); }
});

app.post('/api/operaciones/pedidos/agregar', authenticateToken, async (req, res) => {
    try {
        const { id_pedido, id_estacion, fecha, id_transportista, diesel, regular, super: s, iondiesel, id_calibracion_diesel, id_calibracion_regular, id_calibracion_super, id_calibracion_ion } = req.body;
        const externalDb = await getExternalDb();
        if (id_pedido) {
            await externalDb.query(`UPDATE web_pedidos_temp SET fecha=?, id_carrier_local=?, diesel=?, regular=?, super=?, iondiesel=?, id_tanker_local=? WHERE id=?`, 
                [fecha, id_transportista, diesel || 0, regular || 0, s || 0, iondiesel || 0, id_calibracion_diesel || null, id_pedido]);
        } else {
            await externalDb.query(`INSERT INTO web_pedidos_temp (id_estacion, fecha, id_carrier_local, diesel, regular, super, iondiesel, id_tanker_local) VALUES (?,?,?,?,?,?,?,?)`, 
                [id_estacion, fecha, id_transportista, diesel || 0, regular || 0, s || 0, iondiesel || 0, id_calibracion_diesel || null]);
        }
        res.json({ success: true, message: 'Pedido Guardado!' });
    } catch (error) { res.status(500).json({ message: 'Error agregando pedido' }); }
});

app.delete('/api/operaciones/pedidos/anular/:id', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [ex] = await externalDb.query("SELECT count(id_origen) as cont FROM web_pedidos WHERE id_origen = ?", [req.params.id]);
        if (ex[0].cont > 0) return res.status(400).json({ message: "Pedido Confirmado. No Puede Anular." });
        
        await externalDb.query("DELETE FROM web_pedidos_temp WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Pedido Anulado' });
    } catch (error) { res.status(500).json({ message: 'Error anulando pedido' }); }
});

app.post('/api/operaciones/pedidos/confirmar', authenticateToken, async (req, res) => {
    try {
        const { id_pedido, numero, id_estacion, forma_pago, costo_d, costo_s, costo_r, costo_i } = req.body;
        const externalDb = await getExternalDb();
        
        const [exCheck] = await externalDb.query("SELECT count(id_origen) as cont FROM web_pedidos WHERE id_origen = ?", [id_pedido]);
        if (exCheck[0].cont > 0) return res.status(400).json({ message: "Pedido Confirmado. No Puede Volver a Confirmar." });
        
        const [tempReq] = await externalDb.query("SELECT * FROM web_pedidos_temp WHERE id = ?", [id_pedido]);
        if (!tempReq.length) return res.status(404).json({ message: "Pedido temporal no encontrado." });
        
        const p = tempReq[0];
        const nTotal = Number(p.diesel || 0) + Number(p.regular || 0) + Number(p.super || 0) + Number(p.iondiesel || 0);
        const pipa = nTotal >= 8000 ? 8000 : 4000;
        const fleteCol = nTotal >= 8000 ? "pipa8000" : "pipa4000";
        
        let flete = 0.0;
        try {
            // Revert fallback to legacy id_transportista logic for Fletes as required by WCF constraints
            const [fRows] = await externalDb.query(`SELECT ${fleteCol} as cost FROM web_fletes WHERE id_estacion = ? AND id_transportista = ?`, [id_estacion, p.id_transportista || p.id_carrier_local]);
            if (fRows.length) flete = fRows[0].cost || 0;
        } catch(e) {}
        
        const cDate = p.fecha instanceof Date ? p.fecha.toISOString().split('T')[0] : p.fecha;
        
        const connection = await externalDb.getConnection();
        await connection.beginTransaction();
        try {
            const [exNum] = await connection.query("SELECT count(numero) as c FROM web_pedidos WHERE numero = ?", [numero]);
            if (exNum[0].c > 0) {
                await connection.query("UPDATE web_pedidos SET p_diesel = p_diesel + ?, p_regular = p_regular + ?, p_super = p_super + ?, p_ion = p_ion + ?, compartido = ? WHERE numero = ?", 
                    [p.diesel, p.regular, p.super, p.iondiesel, nTotal, numero]);
            } else {
                await connection.query(`INSERT INTO web_pedidos (fecha, numero, id_estacion, forma_pago, p_diesel, p_regular, p_super, p_ion, id_carrier_local, id_tanker_local, flete, pipa, costo_d, costo_s, costo_r, costo_i, id_origen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
                    [cDate, numero, id_estacion, forma_pago, p.diesel, p.regular, p.super, p.iondiesel, p.id_carrier_local, p.id_tanker_local, flete, pipa, costo_d || 0, costo_s || 0, costo_r || 0, costo_i || 0, id_pedido]);
            }
            await connection.query("UPDATE web_pedidos_temp SET numero = ? WHERE id = ?", [numero, id_pedido]);
            await connection.commit();
            res.json({ success: true, message: 'Pedido Confirmado y Creado!' });
        } catch(errTransaction) {
            await connection.rollback();
            throw errTransaction;
        } finally {
            connection.release();
        }
    } catch (error) { res.status(500).json({ message: 'Error al confirmar pedido: ' + error.message }); }
});



// ================= RECORDATORIOS / PAGOS =================

app.get('/api/operaciones/recordatorios/ubicaciones', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT id, descripcion FROM web_rc_ubicaciones ORDER BY descripcion");
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching ubicaciones' }); }
});

app.get('/api/operaciones/recordatorios', authenticateToken, async (req, res) => {
    try {
        const { desde, hasta, estado, id_recordatorio } = req.query; 
        const externalDb = await getExternalDb();
        
        let statusFilter = "a.estado IN ('P', 'C')";
        if (estado === 'P') statusFilter = "a.estado = 'P'";
        else if (estado === 'C') statusFilter = "a.estado = 'C'";

        let query = `
            SELECT c.descripcion as ubicacion, b.descripcion, a.vencimiento as vence, b.forma_pago as observacion, 
                   a.forma_pago, b.monto, IF(a.estado = 'P','PENDIENTE','CANCELADO') as estado, a.fecha_cancelacion, a.id, b.id as id_recordatorio
            FROM web_rc_recordatorios_vencimientos a 
            INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id 
            INNER JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id 
            WHERE 1=1 
        `;
        
        const params = [];
        if (id_recordatorio) {
            query += " AND b.id = ? ";
            params.push(id_recordatorio);
        } else {
            query += ` AND b.activo = 1 AND ${statusFilter} AND a.vencimiento BETWEEN ? AND ? `;
            params.push(desde, hasta);
        }

        query += " ORDER BY a.vencimiento ";
        
        const [rows] = await externalDb.query(query, params);
        res.json(rows);
    } catch (error) { 
        console.error('Error fetching recordatorios:', error);
        res.status(500).json({ message: 'Error fetching recordatorios' }); 
    }
});



app.get('/api/operaciones/recordatorios/:id', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT * FROM web_rc_recordatorios WHERE id = ?", [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
        
        const [pagados] = await externalDb.query("SELECT COUNT(*) as cont FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = ? AND estado = 'C'", [req.params.id]);
        res.json({ recordatorio: rows[0], pagados: pagados[0].cont });
    } catch (error) { res.status(500).json({ message: 'Error fetching recordatorio detail' }); }
});

app.get('/api/operaciones/recordatorios/parents/buscar', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const query = `
            SELECT b.id, b.descripcion, b.iniciar as fecha_inicio, c.descripcion as ubicacion, 
                   b.monto, b.forma_pago as observacion, b.repetir as cuotas, b.repetir_desc, IF(b.activo=1,'SI','NO') as activo
            FROM web_rc_recordatorios b 
            LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id 
            ORDER BY b.iniciar DESC
        `;
        const [rows] = await externalDb.query(query);
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching parent recordatorios' }); }
});

app.post('/api/operaciones/recordatorios', authenticateToken, async (req, res) => {
    try {
        const { id, descripcion, id_ubicacion, iniciar, activo, monto, repetir, repetir_desc, forma_pago, pagado, fecPago, formaPago2 } = req.body;
        const externalDb = await getExternalDb();
        const connection = await externalDb.getConnection();
        await connection.beginTransaction();
        
        try {
            let recordatorioId = id;
            if (id) {
                await connection.query(`UPDATE web_rc_recordatorios SET descripcion=?, id_ubicacion=?, iniciar=?, monto=?, repetir=?, repetir_desc=?, activo=?, forma_pago=? WHERE id=?`, 
                    [descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo ? 1 : 0, forma_pago, id]);
            } else {
                const [result] = await connection.query(`INSERT INTO web_rc_recordatorios (descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo, forma_pago) VALUES (?,?,?,?,?,?,?,?)`, 
                    [descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo ? 1 : 0, forma_pago]);
                recordatorioId = result.insertId;
            }

            await connection.query("DELETE FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = ?", [recordatorioId]);
            
            for (let n = 1; n <= repetir; n++) {
                let dFecha = new Date(iniciar + 'T12:00:00'); // Midday prevents TZ shifting
                let isPagado = false;
                
                if (repetir_desc === 'VEZ') {
                    if (pagado) isPagado = true;
                } else if (repetir_desc === 'DIAS') {
                    if (n > 1) dFecha.setDate(dFecha.getDate() + (n * repetir)); 
                } else if (repetir_desc === 'MES') {
                    if (n > 1) dFecha.setMonth(dFecha.getMonth() + (n - 1));
                } else if (repetir_desc === 'AÑO' || repetir_desc === 'ANO') { 
                    if (n > 1) dFecha.setFullYear(dFecha.getFullYear() + n); 
                }
                
                const formattedDate = dFecha.toISOString().split('T')[0];
                
                if (isPagado) {
                    await connection.query("INSERT INTO web_rc_recordatorios_vencimientos (id_recordatorio, vencimiento, estado, fecha_cancelacion, forma_pago) VALUES (?, ?, 'C', ?, ?)", 
                        [recordatorioId, formattedDate, fecPago, formaPago2]);
                } else {
                    await connection.query("INSERT INTO web_rc_recordatorios_vencimientos (id_recordatorio, vencimiento, estado, fecha_cancelacion, forma_pago) VALUES (?, ?, 'P', NULL, '')", 
                        [recordatorioId, formattedDate]);
                }
            }
            
            await connection.commit();
            res.json({ success: true, message: 'Recordatorio Guardado!' });
        } catch(errTx) {
            await connection.rollback();
            throw errTx;
        } finally {
            connection.release();
        }
    } catch (error) { res.status(500).json({ message: 'Error saving recordatorio: ' + error.message }); }
});

app.put('/api/operaciones/recordatorios/pagar/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { forma_pago, fecha_cancelacion } = req.body;
        const externalDb = await getExternalDb();
        await externalDb.query("UPDATE web_rc_recordatorios_vencimientos SET estado = 'C', fecha_cancelacion = ?, forma_pago = ? WHERE id = ?", [fecha_cancelacion, forma_pago, id]);
        res.json({ success: true, message: 'Pago Realizado!' });
    } catch (error) { res.status(500).json({ message: 'Error marking paid' }); }
});

app.delete('/api/operaciones/recordatorios/vencimiento/:id', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        await externalDb.query("DELETE FROM web_rc_recordatorios_vencimientos WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Recordatorio Eliminado!' });
    } catch (error) { res.status(500).json({ message: 'Error deleting vencimiento' }); }
});


// Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length === 0) return res.status(400).json({ message: 'User not found' });

        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ message: 'Invalid password' });

        const [permsRows] = await db.query(
            'SELECT p.name FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?', 
            [user.role_id]
        );
        const permissions = permsRows.map(p => p.name);

        const token = jwt.sign({ id: user.id, username: user.username, nombre: user.nombre, role_id: user.role_id, permissions }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, user: { id: user.id, username: user.username, nombre: user.nombre, email: user.email, role_id: user.role_id, permissions } });
    } catch (error) {
        console.error('LOGIN ERROR:', error);
        res.status(500).json({ message: 'Server error', error: error.message, detail: error.code });
    }
});

// User Management Routes
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
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

app.post('/api/users', authenticateToken, async (req, res) => {
    const { username, nombre, email, password, role_id } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, nombre, email, password, role_id) VALUES (?, ?, ?, ?, ?)', [username, nombre || null, email || null, hashedPassword, role_id]);
        res.status(201).json({ message: 'User created' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { username, nombre, email, password, status, role_id } = req.body;
    try {
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

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/users/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
        res.json({ message: 'User status updated' });
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

// --- Email Configuration Routes ---
app.get('/api/config/email', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM email_configs ORDER BY created_at DESC LIMIT 1');
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/config/email', authenticateToken, async (req, res) => {
    const { host, port, secure, user, password, from_address } = req.body;
    try {
        const [existing] = await db.query('SELECT id FROM email_configs LIMIT 1');
        if (existing.length > 0) {
            await db.query(
                'UPDATE email_configs SET host = ?, port = ?, secure = ?, user = ?, password = ?, from_address = ? WHERE id = ?',
                [host, port || 587, secure || false, user, password, from_address, existing[0].id]
            );
        } else {
            await db.query(
                'INSERT INTO email_configs (host, port, secure, user, password, from_address) VALUES (?, ?, ?, ?, ?, ?)',
                [host, port || 587, secure || false, user, password, from_address]
            );
        }
        res.json({ message: 'Configuración guardada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: `Error guardando: ${error.message}` });
    }
});

app.post('/api/config/email/test', authenticateToken, async (req, res) => {
    const { host, port, secure, user, password, from_address, to_email } = req.body;
    try {
        const transporter = nodemailer.createTransport({
            host,
            port: port || 587,
            secure: Boolean(secure),
            auth: { user, pass: password },
            tls: { rejectUnauthorized: false }
        });

        await transporter.verify();

        await transporter.sendMail({
            from: `"${from_address}" <${user}>`,
            to: to_email,
            subject: 'Prueba de Conexión SMTP - SIPE Admin',
            text: '¡Felicidades! La configuración funciona correctamente.',
            html: '<b>¡Felicidades!</b> La configuración SMTP funciona correctamente.'
        });

        res.json({ message: 'Conexión exitosa y correo enviado' });
    } catch (error) {
        res.status(400).json({ message: `Error SMTP: ${error.message}` });
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
    const baseUrl = 'http://207.244.251.167:8041/WSdatos_consolidados.svc';
    
    try {
        const externalDb = await getExternalDb();
        
        // Fetch station list once for all sub-sections
        const [stations] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden");
        
        // --- LOCAL GetVentasTienda Logic ---
        const cInicio = new Date(date);
        cInicio.setDate(cInicio.getDate() - 15);
        const cInicioStr = cInicio.toISOString().split('T')[0];
        
        const sqlTiendas = `
            SELECT b.fecha, a.id_empresa, a.titulo, 
                   SUM(IF(b.fecha = ?, IFNULL(b.monto, 0.0), 0.0)) as monto, 
                   AVG(IFNULL(b.monto, 0.0)) as promedio 
            FROM web_consolidado a 
            LEFT JOIN ventas_tienda b ON a.id_empresa = b.id_empresa AND b.fecha BETWEEN ? AND ?
            WHERE a.grupo = 'TIENDA' 
            GROUP BY a.id_empresa 
            ORDER BY a.orden
        `;
        const [tiendasRows] = await externalDb.query(sqlTiendas, [date, cInicioStr, date]);
        const tiendasLocal = tiendasRows.map(row => ({
            fecha: date,
            empresa: row.titulo,
            venta: Number(row.monto || 0),
            promedio: Number(row.promedio || 0)
        }));

        // --- LOCAL GetVentasEstacion Logic ---
        const sqlEstaciones = `
            SELECT a.titulo, 
                   IFNULL(SUM(IF(d.clasificacion = 'D', b.total, 0.0)), 0.0) as diesel, 
                   IFNULL(SUM(IF(d.clasificacion = 'R', b.total, 0.0)), 0.0) as regular, 
                   IFNULL(SUM(IF(d.clasificacion = 'S', b.total, 0.0)), 0.0) as super, 
                   IFNULL(SUM(IF(d.clasificacion = 'I', b.total, 0.0)), 0.0) as ion, 
                   IFNULL(SUM(b.total), 0.0) as galonaje, 
                   IFNULL(SUM(b.total * b.precio), 0.0) as monto, 
                   COUNT(DISTINCT c.turno) as turnos, 
                   a.id_empresa 
            FROM web_consolidado a 
            LEFT JOIN cierre_turno_lecturas b ON a.id_empresa = b.id_empresa 
            INNER JOIN cfg_combustibles d ON b.id_empresa = d.id_empresa AND b.id_producto = d.id_producto 
            INNER JOIN cierre_turno c ON b.id_cierre_turno = c.id AND b.id_empresa = c.id_empresa 
                  AND c.fecha_turno = DATE_FORMAT(?, '%d/%m/%Y') 
            WHERE a.grupo = 'ESTACION' 
            GROUP BY a.id_empresa 
            ORDER BY a.orden
        `;
        const [estacionesRows] = await externalDb.query(sqlEstaciones, [date]);
        const estacionesLocal = estacionesRows.map(row => ({
            empresa: row.titulo,
            diesel: Number(row.diesel || 0),
            regular: Number(row.regular || 0),
            super: Number(row.super || 0),
            ion: Number(row.ion || 0),
            galonaje: Number(row.galonaje || 0),
            venta: Number(row.monto || 0)
        }));

        // --- LOCAL GetMargenesEstacion Logic ---
        const sqlMargenes = `
            SELECT a.id_empresa, a.titulo, 
                   SUM(IFNULL(IF(b.clasificacion = 'D' AND b.tipo = 'A', c.precio, 0.0), 0.0)) as diesel_a, 
                   SUM(IFNULL(IF(b.clasificacion = 'R' AND b.tipo = 'A', c.precio, 0.0), 0.0)) as regular_a, 
                   SUM(IFNULL(IF(b.clasificacion = 'S' AND b.tipo = 'A', c.precio, 0.0), 0.0)) as super_a, 
                   SUM(IFNULL(IF(b.clasificacion = 'D' AND b.tipo = 'F', c.precio, 0.0), 0.0)) as diesel_c, 
                   SUM(IFNULL(IF(b.clasificacion = 'R' AND b.tipo = 'F', c.precio, 0.0), 0.0)) as regular_c, 
                   SUM(IFNULL(IF(b.clasificacion = 'S' AND b.tipo = 'F', c.precio, 0.0), 0.0)) as super_c, 
                   SUM(IFNULL(IF(b.clasificacion = 'I', c.precio, 0.0), 0.0)) as ion_diesel, 
                   SUM(IFNULL(IF(b.clasificacion = 'D' AND b.tipo = 'M', c.precio, 0.0), 0.0)) as master 
            FROM web_consolidado a 
            LEFT JOIN cfg_combustibles b ON a.id_empresa = b.id_empresa 
            LEFT JOIN ( 
                 SELECT a.id_empresa, a.id_producto, a.codigo_producto, a.nom_producto, precio 
                 FROM cierre_turno_lecturas a 
                 INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa = b.id_empresa 
                 WHERE STR_TO_DATE(b.fecha_turno, '%d/%m/%Y') = ? 
                   AND b.turno = (SELECT MAX(x.turno) FROM cierre_turno x WHERE x.id_empresa = b.id_empresa AND x.fecha_turno = b.fecha_turno) 
                 GROUP BY codigo_producto, a.id_empresa 
            ) c ON b.id_empresa = c.id_empresa AND b.codigo = c.codigo_producto 
            WHERE a.grupo = 'ESTACION' 
            GROUP BY id_empresa 
            ORDER BY orden
        `;
        const [margenesRows] = await externalDb.query(sqlMargenes, [date]);
        
        // Fetch latest costs for all stations to avoid N+1 queries
        const [costsRows] = await externalDb.query(`
            SELECT id_empresa, cod_producto, costo 
            FROM combustibles_costos 
            WHERE id IN (
                SELECT MAX(id) FROM combustibles_costos GROUP BY id_empresa, cod_producto
            )
        `);
        const costsMap = {};
        costsRows.forEach(row => {
            if (!costsMap[row.id_empresa]) costsMap[row.id_empresa] = {};
            costsMap[row.id_empresa][row.cod_producto] = Number(row.costo || 0);
        });

        const margenesLocal = margenesRows.map(row => {
            const getC = (prod) => (costsMap[row.id_empresa] && costsMap[row.id_empresa][prod]) || 0;
            const cD = getC('DIESEL'), cR = getC('REGULAR'), cS = getC('SUPER'), cI = getC('IONDIESEL');
            
            return {
                empresa: row.titulo,
                margen_da: Number(row.diesel_a || 0) - cD,
                margen_ra: Number(row.regular_a || 0) - cR,
                margen_sa: Number(row.super_a || 0) - cS,
                margen_dc: Number(row.diesel_c || 0) - cD,
                margen_rc: Number(row.regular_c || 0) - cR,
                margen_sc: Number(row.super_c || 0) - cS,
                margen_io: Number(row.ion_diesel || 0) - cI,
                margen_master: Number(row.master || 0) - cD
            };
        });

        // --- LOCAL GetInventario Logic ---
        const cDesde = new Date(date);
        cDesde.setDate(cDesde.getDate() - 6);
        const cDesdeStr = cDesde.toISOString().split('T')[0];

        const [lecturasRows, promediosRows] = await Promise.all([
            externalDb.query(`
                SELECT b.lectura, c.galones_reserva, IF(c.tipo_combustible='M','I',c.tipo_combustible) as tipo_combustible, a.id_empresa 
                FROM lecturas_tanque a 
                INNER JOIN detalle_lecturas_tanque b ON a.id = b.id_lectura AND a.id_empresa = b.id_empresa 
                INNER JOIN tanques c ON b.codigo_producto = c.id AND b.id_empresa = c.id_empresa 
                WHERE a.fecha = ? AND a.turno = (SELECT MAX(x.turno) FROM lecturas_tanque x WHERE x.id_empresa = a.id_empresa AND x.fecha = a.fecha)
            `, [date]),
            externalDb.query(`
                SELECT a.id_empresa, IF(a.id_empresa = '004' AND a.codigo_producto = '0007','I', LEFT(a.nom_producto,1)) AS tipo_combustible,
                       SUM(a.total) as total_7d
                FROM cierre_turno_lecturas a 
                INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa = b.id_empresa 
                WHERE STR_TO_DATE(b.fecha_turno, '%d/%m/%Y') BETWEEN ? AND ? 
                GROUP BY a.id_empresa, tipo_combustible
            `, [cDesdeStr, date])
        ]);

        const lecturas = lecturasRows[0];
        const promedios = promediosRows[0];

        const inventarioLocal = stations.map(s => {
            const id = s.id_empresa;
            
            const getInv = (tipo) => lecturas
                .filter(l => l.id_empresa === id && l.tipo_combustible === tipo)
                .reduce((acc, curr) => acc + (Number(curr.lectura || 0) - Number(curr.galones_reserva || 0)), 0);
            
            const nD = getInv('D'), nR = getInv('R'), nS = getInv('S'), nI = getInv('I');

            const getProm = (tipo) => {
                const row = promedios.find(p => p.id_empresa === id && p.tipo_combustible === tipo);
                return (Number(row?.total_7d || 0) / 7);
            };
            const pD = getProm('D'), pR = getProm('R'), pS = getProm('S'), pI = getProm('I');

            return {
                empresa: s.titulo,
                diesel: nD,
                regular: nR,
                super: nS,
                iondiesel: nI,
                duracion_diesel: pD > 0 ? Math.round((nD / pD) * 10) / 10 : 0,
                duracion_regular: pR > 0 ? Math.round((nR / pR) * 10) / 10 : 0,
                duracion_super: pS > 0 ? Math.round((nS / pS) * 10) / 10 : 0,
                duracion_ion: pI > 0 ? Math.round((nI / pI) * 10) / 10 : 0
            };
        });

        res.json({
            tiendas: tiendasLocal,
            estaciones: estacionesLocal,
            margenes: margenesLocal,
            inventario: inventarioLocal
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching external API' });
    }
});

app.get('/api/ventas/lubricantes/:start/:end', authenticateToken, async (req, res) => {
    const { start, end } = req.params;
    
    try {
        const externalDb = await getExternalDb();
        const sql = `
            SELECT a.id_empresa, a.titulo, IFNULL(SUM(b.precio_total), 0.0) as monto 
            FROM web_consolidado a 
            LEFT JOIN inventario_lubricantes b ON a.id_empresa = b.id_empresa 
                 AND STR_TO_DATE(b.fecha_turno, '%d/%m/%Y') BETWEEN ? AND ? 
            WHERE a.grupo = 'ESTACION' 
            GROUP BY id_empresa 
            ORDER BY a.orden
        `;
        const [rows] = await externalDb.query(sql, [start, end]);
        const mapped = rows.map(r => ({
            empresa: r.titulo,
            venta: Number(r.monto || 0)
        }));
        res.json(mapped);
    } catch (error) {
        console.error('LUBRICANTES ERROR:', error);
        res.status(500).json({ message: 'Error fetching Lubricantes locally' });
    }
});

app.get('/api/ventas/resumen-cierre/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    
    try {
        const externalDb = await getExternalDb();
        const sql = `
            SELECT x.titulo AS estacion,
                   (SELECT IFNULL(SUM(b.total_descuento),0.0) FROM cierre_turno a INNER JOIN cierre_turno_credito b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS creditos,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_cupones b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS cupones,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_cheques b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS cheques,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_tarjeta b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS tarjetas,
                   (SELECT IFNULL(SUM(b.efectivo),0.0) + IFNULL(SUM(b.monedas),0.0) + IFNULL(SUM(b.transferencia),0.0) FROM cierre_turno a INNER JOIN cierre_turno_remesa b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS remesas,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_gastos b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS gastos,
                   (SELECT IFNULL(SUM(precio_total),0.0) FROM inventario_lubricantes WHERE id_empresa=x.id_empresa AND STR_TO_DATE(fecha_turno,'%d/%m/%Y')=?) AS lubricantes,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_anticipos b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS anticipos,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_pagos b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS pagos,
                   (SELECT IFNULL(SUM(b.valor*b.cantidad),0.0) FROM cierre_turno a INNER JOIN cierre_turno_descuentos b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS descuentos,
                   (SELECT IFNULL(SUM(b.monto),0.0) FROM cierre_turno a INNER JOIN cierre_turno_lecturas b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE STR_TO_DATE(a.fecha_turno,'%d/%m/%Y') = ? AND a.id_empresa = x.id_empresa) AS total_venta,
                   x.id_empresa 
            FROM web_consolidado x 
            WHERE x.grupo = 'ESTACION' 
            ORDER BY x.titulo
        `;
        const params = Array(11).fill(date);
        const [rows] = await externalDb.query(sql, params);
        
        const mapped = rows.map(r => {
            const monto = Number(r.creditos) + Number(r.cupones) + Number(r.cheques) + Number(r.tarjetas) + Number(r.remesas) + Number(r.gastos) + Number(r.anticipos) + Number(r.pagos) + Number(r.descuentos);
            const venta = Number(r.total_venta) + Number(r.lubricantes);
            const suma = Math.round(monto * 100) / 100;
            const tot_venta = Math.round(venta * 100) / 100;
            
            return {
                empresa: r.estacion,
                credito: Number(r.creditos),
                cupones: Number(r.cupones),
                cheques: Number(r.cheques),
                tarjetas: Number(r.tarjetas),
                remesas: Number(r.remesas),
                gastos: Number(r.gastos),
                lubricantes: Number(r.lubricantes),
                anticipos: Number(r.anticipos),
                pagos: Number(r.pagos),
                descuentos: Number(r.descuentos),
                suma,
                tot_venta,
                diferencia: Math.round((suma - tot_venta) * 100) / 100
            };
        });
        
        res.json(mapped);
    } catch (error) {
        console.error('RESUMEN ERROR:', error);
        res.status(500).json({ message: 'Error fetching Resumen Cierre locally' });
    }
});

app.get('/api/ventas/precios-estacion/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    
    try {
        const externalDb = await getExternalDb();
        const sql = `
            select a.id_empresa,a.titulo,
                   sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'A',c.precio,0.0),0.0)) as diesel_a,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'A',c.precio,0.0),0.0)) as regular_a,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'A',c.precio,0.0),0.0)) as super_a,
                   sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'F',c.precio,0.0),0.0)) as diesel_c,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'F',c.precio,0.0),0.0)) as regular_c,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'F',c.precio,0.0),0.0)) as super_c,
                   sum(ifnull(if(b.clasificacion = 'I',c.precio,0.0),0.0)) as ion_diesel,sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'M',c.precio,0.0),0.0)) as master 
            from web_consolidado a 
            left join cfg_combustibles b on a.id_empresa = b.id_empresa 
            left join ( 
                 SELECT a.id_empresa,a.id_producto,
                        a.codigo_producto,a.nom_producto,precio 
                 FROM cierre_turno_lecturas a 
                 INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa=b.id_empresa 
                 WHERE str_to_date(b.fecha_turno,'%d/%m/%Y') = ? AND b.turno = (SELECT MAX(x.turno) FROM cierre_turno x WHERE x.id_empresa=b.id_empresa AND x.fecha_turno=b.fecha_turno) 
                 GROUP BY codigo_producto,a.id_empresa order by id_empresa,codigo_producto) c on b.id_empresa = c.id_empresa and b.codigo = c.codigo_producto 
            where a.grupo = 'ESTACION' group by id_empresa order by orden
        `;
        const [rows] = await externalDb.query(sql, [date]);
        const mapped = rows.map(r => ({
            empresa: r.titulo,
            diesel_a: Number(r.diesel_a),
            regular_a: Number(r.regular_a),
            super_a: Number(r.super_a),
            diesel_c: Number(r.diesel_c),
            regular_c: Number(r.regular_c),
            super_c: Number(r.super_c),
            ion_diesel: Number(r.ion_diesel),
            master: Number(r.master)
        }));
        res.json(mapped);
    } catch (error) {
        console.error('PRECIOS ERROR:', error);
        res.status(500).json({ message: 'Error fetching Precios locally' });
    }
});

// --- Consultas Routes (External Database) ---
const getExternalDb = async () => {
    const [configs] = await db.query('SELECT * FROM external_configs ORDER BY created_at DESC LIMIT 1');
    if (configs.length === 0) throw new Error('No hay configuración de base de datos externa. Configúrala primero.');
    
    const config = configs[0];
    const poolKey = `${config.host}:${config.port || 3306}:${config.database_name}:${config.user}`;
    
    let externalDb = externalPools[poolKey];
    if (!externalDb) {
        const mysql = require('mysql2/promise');
        externalDb = mysql.createPool({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database_name,
            port: config.port || 3306,
            connectionLimit: 10
        });
        externalPools[poolKey] = externalDb;
    }
    return externalDb;
};

app.get('/api/consultas/diferencias-combustible/:desde/:hasta', authenticateToken, async (req, res) => {
    const { desde, hasta } = req.params;
    try {
        const externalDb = await getExternalDb();
        
        const sql1 = `
            select x.id_empresa, a.titulo as estacion, z.clasificacion as tipo, 
                   0.0 as inicial, 0.0 as recargas, sum(y.total) as venta, 
                   0.0 as final, 0.0 as suma, 0.0 as diferencia 
            from cierre_turno x 
            inner join cierre_turno_lecturas y on x.id_empresa = y.id_empresa and x.id = y.id_cierre_turno 
            inner join cfg_combustibles z on y.id_empresa = z.id_empresa and y.id_producto = z.id_producto 
            inner join web_consolidado a on x.id_empresa = a.id_empresa 
            where STR_TO_DATE(x.fecha_turno, '%d/%m/%Y') between ? and ? 
            and a.grupo = 'ESTACION' 
            group by x.id_empresa, a.titulo, z.clasificacion, a.orden
            order by a.orden, z.clasificacion
        `;
        const [dt_result] = await externalDb.query(sql1, [desde, hasta]);

        const sql2 = `
            select a.id_empresa,a.fecha,a.turno,c.tipo_combustible,sum(b.anterior) as anterior,sum(b.recarga) as recarga,sum(b.lectura) as lectura 
            from lecturas_tanque a 
            inner join detalle_lecturas_tanque b on a.id_empresa = b.id_empresa and a.id = b.id_lectura 
            inner join tanques c on a.id_empresa = c.id_empresa and b.codigo_producto = c.id 
            where a.fecha between ? and ? 
            group by id_empresa,tipo_combustible,fecha,turno 
            order by id_empresa,fecha,turno
        `;
        const [dt_movi] = await externalDb.query(sql2, [desde, hasta]);

        const listado_final = dt_result.map(fila => {
            let inicial = 0.0;
            let recargas = 0.0;
            let final = 0.0;

            const FindRow = dt_movi.filter(m => String(m.id_empresa) === String(fila.id_empresa) && String(m.tipo_combustible) === String(fila.tipo));
            
            if (FindRow.length > 0) {
                inicial = Number(FindRow[0].anterior) || 0.0;
                final = Number(FindRow[FindRow.length - 1].lectura) || 0.0;
            }

            recargas = FindRow.reduce((sum, current) => sum + (Number(current.recarga) || 0), 0);
            
            const venta = Number(fila.venta) || 0.0;
            const suma = inicial + recargas - venta;
            const diferencia = final - suma;

            return {
                empresa: fila.estacion,
                combustible: fila.tipo,
                inicial: inicial,
                recargas: recargas,
                venta: venta,
                final: final,
                suma: suma,
                diferencia: diferencia
            };
        });

        res.json(listado_final);
    } catch (error) {
        console.error('Error in diferencias-combustible:', error);
        res.status(500).json({ 
            message: 'Error procesando consulta externa de combustible',
            details: error.message 
        });
    }
});

app.get('/api/consultas/:type', authenticateToken, async (req, res) => {
    const { type } = req.params;
    try {
        const externalDb = await getExternalDb();

        const today = new Date().toISOString().split('T')[0];
        let results;
        if (type === 'saldos-bancos') {
            [results] = await externalDb.query('CALL sp_saldo_en_bancos(?)', [today]);
        } else if (type === 'saldos-chequera') {
            [results] = await externalDb.query('CALL sp_saldo_en_chequera(?)', [today]);
        } else {
            return res.status(404).json({ message: 'Consulta no encontrada' });
        }
        
        // MySQL stored procedures return an array where [0] is the result set
        res.json(results[0] || []);
    } catch (error) {
        console.error('Error in consultas SP:', error);
        res.status(500).json({ message: `Error ejecutando SP: ${error.message}` });
    }
});

// Roles and Permissions Routes
app.get('/api/roles', authenticateToken, async (req, res) => {
    try {
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

app.post('/api/roles', authenticateToken, async (req, res) => {
    const { name, description, permissions } = req.body;
    try {
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

app.put('/api/roles/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, description, permissions } = req.body;
    try {
        await db.query('UPDATE roles SET name = ?, description = ? WHERE id = ?', [name, description, id]);
        
        if (permissions) {
            await db.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
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
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'El rol ya existe' });
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/roles/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM roles WHERE id = ?', [id]);
        res.json({ message: 'Rol eliminado' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({message: 'No puede eliminarse porque tiene usuarios asignados'});
        res.status(500).json({ message: 'Server error' });
    }
});

// --- AI Agent Route ---
app.post('/api/ai/pagos/chat', authenticateToken, async (req, res) => {
    try {
        const { prompt, context } = req.body;
        console.log("AI Agent Prompt:", prompt);
        console.log("GEMINI_API_KEY status:", process.env.GEMINI_API_KEY ? "CONFIGURED (starts with " + process.env.GEMINI_API_KEY.substring(0, 4) + ")" : "MISSING");

        if (!process.env.GEMINI_API_KEY) {
            return res.status(400).json({ error: "Falta configurar GEMINI_API_KEY en el backend." });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const todayStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        const systemInstruction = `Eres un asistente financiero y operativo experto del sistema SIPE Admin, enfocado en el "Control de Múltiples Pagos y Recordatorios".
Hoy es ${todayStr} (formato DD/MM/YYYY).
El usuario te dará una petición en lenguaje natural. Tú recibirás el "context" que es un arreglo con TODOS los datos actuales que el usuario ve en pantalla.
Tu objetivo es analizar lo que pide y devolver UN ÚNICO OBJETO JSON ESTRICTO con la acción que el frontend debe ejecutar.

INSTRUCCIONES DE ACCIÓN:
Si el usuario saluda, pregunta resúmenes o dudas generales que no requieren filtrar o pagar en la tabla interactiva, usa "action": "NONE". Y respóndele en "reply" dando los datos que extrajiste de la tabla.
Si el usuario quiere ver o buscar facturas específicas, de fechas específicas (ej. "hoy"), proveedores, o deudas de una empresa, usa "action": "FILTER" y llena "action_params" con las claves "ubicacion" (la empresa sugerida), "descripcion" (el concepto o la fecha exacta DD/MM/YYYY) y "estado" ('P', 'C' o 'ALL'). Manda la fecha en "descripcion" si el usuario pide búsquedas de tiempo.
Si el usuario quiere pagar o marcar como pagado algo específico, usa "action": "PAY" y pon el "id_recordatorio" numérico exacto que encontraste en el context matchando la orden.

DEBES RESPONDER ÚNICAMENTE EN UN JSON VÁLIDO CON ESTA ESTRUCTURA:
{
    "reply": "Tu mensaje amigable y humano respondiendo al usuario basado fuertemente en su contexto.",
    "action": "NONE" | "FILTER" | "PAY",
    "action_params": {
        "ubicacion": "", 
        "descripcion": "", 
        "estado": "ALL", 
        "id_recordatorio": null 
    }
}`;

        const cleanContext = (context || []).map(c => ({
            id_recordatorio: c.id_recordatorio,
            ubicacion: c.ubicacion, 
            descripcion: c.descripcion, 
            monto: c.monto, 
            estado: c.estado, 
            vence: c.vence 
        }));

        const userMessage = `CONTEXTO DE DATOS ACTUALES: ${JSON.stringify(cleanContext)}\n\nCOMANDO DEL USUARIO: ${prompt}`;

        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: userMessage }] }],
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json"
            }
        });

        let rawText = "";
        try {
            if (result.text) {
                rawText = result.text;
            } else if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
                rawText = result.candidates[0].content.parts[0].text;
            } else {
                throw new Error("Estructura de respuesta de IA no reconocida.");
            }
        } catch (e) {
            console.error("Error extrayendo texto de la IA:", e);
            throw new Error("No se pudo extraer una respuesta válida de la IA.");
        }

        if (rawText.startsWith('```json')) {
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        try {
            const parsed = JSON.parse(rawText);
            res.json(parsed);
        } catch (parseError) {
            console.error("Error parsing AI JSON:", rawText);
            res.json({
                reply: "Lo siento, tuve un problema interno al procesar la respuesta. Aquí tienes el mensaje crudo: " + rawText,
                action: "NONE"
            });
        }

    } catch (error) {
        console.error("AI Agent Error:", error);
        
        let userMessage = "No se pudo procesar la solicitud con Inteligencia Artificial.";
        if (error.status === 429 || error.message?.includes('429')) {
            userMessage = "Se ha alcanzado el límite de peticiones (Rate Limit) de la API de Google Gemini. Por favor, espera un momento o revisa tu cuota en Google AI Studio.";
        } else if (error.status === 404 || error.message?.includes('404')) {
            userMessage = "El modelo de IA especificado no fue encontrado (404).";
        }

        res.status(500).json({ 
            error: userMessage,
            details: error.message 
        });
    }
});

// --- Bancos y Cuentas Bancarias (External Database) ---
app.get('/api/bancos/catalogos', authenticateToken, async (req, res) => {
    const { id_empresa } = req.query;
    try {
        const externalDb = await getExternalDb();
        const [empresas] = await externalDb.query('SELECT TRIM(id) as id, nombre FROM empresas_mayores ORDER BY nombre');
        
        let bancos = [];
        let tipos = [];
        
        if (id_empresa) {
            [bancos] = await externalDb.query('SELECT TRIM(id) as id, descripcion FROM bancos WHERE id_empresa = ? ORDER BY descripcion', [id_empresa]);
            [tipos] = await externalDb.query('SELECT TRIM(id) as id, descripcion FROM tipos_cuenta_bancaria WHERE id_empresa = ? ORDER BY descripcion', [id_empresa]);
        }
        
        res.json({ bancos, empresas, tipos });
    } catch (error) {
        console.error('CATALOGOS BANCOS ERROR:', error);
        res.status(500).json({ message: 'Error al cargar catálogos bancarios', error: error.message });
    }
});

app.get('/api/bancos/cuentas', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query(`
            SELECT c.corr, TRIM(c.numero) as numero, c.nombre, TRIM(c.id_empresa) as id_empresa, 
                   TRIM(c.cod_banco) as cod_banco, TRIM(c.cod_tipo) as cod_tipo, TRIM(c.cod_cta) as cod_cta, c.activa,
                   e.nombre as empresa_nombre, b.descripcion as banco_nombre, t.descripcion as tipo_nombre
            FROM cuentas_bancarias c
            LEFT JOIN empresas_mayores e ON TRIM(c.id_empresa) = TRIM(e.id)
            LEFT JOIN bancos b ON TRIM(c.cod_banco) = TRIM(b.id) AND TRIM(c.id_empresa) = TRIM(b.id_empresa)
            LEFT JOIN tipos_cuenta_bancaria t ON TRIM(c.cod_tipo) = TRIM(t.id) AND TRIM(c.id_empresa) = TRIM(t.id_empresa)
            ORDER BY c.corr DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('CUENTAS BANCARIAS ERROR:', error);
        res.status(500).json({ message: 'Error al cargar cuentas bancarias', error: error.message });
    }
});

app.post('/api/bancos/cuentas', authenticateToken, async (req, res) => {
    const { id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta } = req.body;
    try {
        const externalDb = await getExternalDb();
        await externalDb.query(
            'INSERT INTO cuentas_bancarias (id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, activa) VALUES (?, ?, ?, ?, ?, ?, "S")',
            [id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta]
        );
        res.status(201).json({ message: 'Cuenta creada con éxito' });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear cuenta', error: error.message });
    }
});

app.put('/api/bancos/cuentas/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, activa } = req.body;
    try {
        const externalDb = await getExternalDb();
        await externalDb.query(
            'UPDATE cuentas_bancarias SET id_empresa = ?, numero = ?, nombre = ?, cod_banco = ?, cod_tipo = ?, cod_cta = ?, activa = ? WHERE corr = ?',
            [id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, activa || 'S', id]
        );
        res.json({ message: 'Cuenta actualizada' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar cuenta', error: error.message });
    }
});

app.delete('/api/bancos/cuentas/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const externalDb = await getExternalDb();
        // Logical delete
        await externalDb.query('UPDATE cuentas_bancarias SET activa = "N" WHERE corr = ?', [id]);
        res.json({ message: 'Cuenta desactivada' });
    } catch (error) {
        res.status(500).json({ message: 'Error al desactivar cuenta', error: error.message });
    }
});

module.exports = app;
