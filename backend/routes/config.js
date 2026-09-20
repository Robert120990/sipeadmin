const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { getDb } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

// --- External Database Configuration ---
router.get('/config', authenticateToken, requireRole('Administrator'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
        res.json(rows[0] || {});
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar configuración');
    }
});

router.post('/config', authenticateToken, requireRole('Administrator'), async (req, res) => {
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
        sendSafeError(res, error, 'Error al guardar configuración de base de datos principal', 400);
    }
});

// --- Accounting Database Configuration ---
router.get('/accounting-config', authenticateToken, requireRole('Administrator'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM external_configs WHERE type = 'accounting' ORDER BY created_at DESC LIMIT 1");
        res.json(rows[0] || {});
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar configuración de contabilidad');
    }
});

router.post('/accounting-config', authenticateToken, requireRole('Administrator'), async (req, res) => {
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
        res.json({ message: 'Configuración de contabilidad guardada y probada exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al conectar con la base de datos de contabilidad', 400);
    }
});

// --- Email Configuration ---
router.get('/config/email', authenticateToken, requireRole('Administrator'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM email_configs ORDER BY created_at DESC LIMIT 1");
        res.json(rows[0] || {});
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar configuración de email');
    }
});

router.post('/config/email', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { host, port, secure, user, password, from_address, office_email } = req.body;
    try {
        const db = getDb();
        const [existing] = await db.query("SELECT id FROM email_configs LIMIT 1");
        if (existing.length > 0) {
            await db.query(
                "UPDATE email_configs SET host = ?, port = ?, secure = ?, user = ?, password = ?, from_address = ?, office_email = ? WHERE id = ?",
                [host, port, secure, user, password, from_address, office_email || null, existing[0].id]
            );
        } else {
            await db.query(
                "INSERT INTO email_configs (host, port, secure, user, password, from_address, office_email) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [host, port, secure, user, password, from_address, office_email || null]
            );
        }
        res.json({ message: 'Configuración de email guardada exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al guardar configuración de email');
    }
});

router.post('/config/email/test', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { host, port, secure, user, password, from_address, to_email, office_email } = req.body;
    const recipient = to_email || office_email;
    if (!recipient) {
        return res.status(400).json({ message: 'Debe proporcionar un correo destinatario o configurar el correo de oficina.' });
    }
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
            to: recipient,
            subject: 'Prueba de Conexión SMTP - SIPE Admin',
            text: '¡Felicidades! La configuración funciona correctamente.',
            html: '<b>¡Felicidades!</b> La configuración SMTP funciona correctamente.'
        });

        res.json({ message: `Conexión exitosa y correo enviado a ${recipient}` });
    } catch (error) {
        sendSafeError(res, error, 'Fallo en la prueba de conexión SMTP', 400);
    }
});

module.exports = router;
