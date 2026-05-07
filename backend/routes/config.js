const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// --- External Database Configuration ---
router.get('/config', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
        res.json(rows[0] || {});
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/config', authenticateToken, async (req, res) => {
    const { host, user, password, database_name, port } = req.body;
    try {
        const db = getDb();
        const mysql = require('mysql2/promise');
        const testConn = await mysql.createConnection({ host, user, password, database: database_name, port: port || 3306 });
        await testConn.end();

        const [existing] = await db.query("SELECT id FROM external_configs WHERE type = 'main' LIMIT 1");
        if (existing.length > 0) {
            await db.query(
                "UPDATE external_configs SET host = ?, user = ?, password = ?, database_name = ?, port = ? WHERE id = ?",
                [host, user, password, database_name, port || 3306, existing[0].id]
            );
        } else {
            await db.query(
                "INSERT INTO external_configs (host, user, password, database_name, port, type) VALUES (?, ?, ?, ?, ?, 'main')",
                [host, user, password, database_name, port || 3306]
            );
        }
        res.json({ message: 'Configuración guardada y conexión exitosa' });
    } catch (error) {
        res.status(400).json({ message: `Error de conexión: ${error.message}` });
    }
});

// --- Accounting Database Configuration ---
router.get('/accounting-config', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM external_configs WHERE type = 'accounting' ORDER BY created_at DESC LIMIT 1");
        res.json(rows[0] || {});
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/accounting-config', authenticateToken, async (req, res) => {
    const { host, user, password, database_name, port } = req.body;
    try {
        const db = getDb();
        const mysql = require('mysql2/promise');
        const testConn = await mysql.createConnection({ host, user, password, database: database_name, port: port || 3306 });
        await testConn.end();

        const [existing] = await db.query("SELECT id FROM external_configs WHERE type = 'accounting' LIMIT 1");
        if (existing.length > 0) {
            await db.query("UPDATE external_configs SET host = ?, user = ?, password = ?, database_name = ?, port = ? WHERE id = ?", [host, user, password, database_name, port || 3306, existing[0].id]);
        } else {
            await db.query("INSERT INTO external_configs (host, user, password, database_name, port, type) VALUES (?, ?, ?, ?, ?, 'accounting')", [host, user, password, database_name, port || 3306]);
        }
        res.json({ message: 'Configuración de contabilidad guardada' });
    } catch (error) { res.status(400).json({ message: `Error de conexión contabilidad: ${error.message}` }); }
});

// --- Email Configuration ---
router.get('/config/email', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM email_configs ORDER BY created_at DESC LIMIT 1");
        res.json(rows[0] || {});
    } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.post('/config/email', authenticateToken, async (req, res) => {
    const { host, port, secure, user, password, from_address } = req.body;
    try {
        const db = getDb();
        const [existing] = await db.query("SELECT id FROM email_configs LIMIT 1");
        if (existing.length > 0) {
            await db.query("UPDATE email_configs SET host = ?, port = ?, secure = ?, user = ?, password = ?, from_address = ? WHERE id = ?", [host, port, secure, user, password, from_address, existing[0].id]);
        } else {
            await db.query("INSERT INTO email_configs (host, port, secure, user, password, from_address) VALUES (?, ?, ?, ?, ?, ?)", [host, port, secure, user, password, from_address]);
        }
        res.json({ message: 'Configuración de email guardada' });
    } catch (error) { res.status(500).json({ message: 'Error al guardar configuración de email' }); }
});

router.post('/config/email/test', authenticateToken, async (req, res) => {
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

module.exports = router;
