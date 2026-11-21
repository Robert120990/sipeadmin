const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const invalidateConfigCache = (...args) => dbModule.invalidateConfigCache(...args);
const { authenticateToken, requireRole } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

const maskConfigPassword = (row) => {
    if (!row || typeof row !== 'object') return {};
    const { password, ...rest } = row;
    return {
        ...rest,
        password: '',
        has_password: Boolean(password)
    };
};

const hasHeaderInjection = (val) => typeof val === 'string' && /[\r\n]/.test(val);

const parseValidPort = (rawPort, fallbackPort) => {
    if (rawPort === undefined || rawPort === null || rawPort === '') return fallbackPort;
    const parsed = parseInt(rawPort, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) return null;
    return parsed;
};

const saveExternalDbConfig = async (req, res, { type, successMessage, errorMessage }) => {
    const { host, user, password, database_name, port } = req.body || {};
    const cleanHost = typeof host === 'string' ? host.trim() : '';
    const cleanUser = typeof user === 'string' ? user.trim() : '';
    const cleanDb = typeof database_name === 'string' ? database_name.trim() : '';
    const cleanPort = parseValidPort(port, 3306);

    if (!cleanHost || !cleanUser || !cleanDb) {
        return res.status(400).json({ message: 'Host, usuario y nombre de base de datos son obligatorios.' });
    }
    if (!cleanPort) {
        return res.status(400).json({ message: 'El puerto debe ser un número válido entre 1 y 65535.' });
    }

    try {
        const db = getDb();
        const [existing] = await db.query('SELECT id, password FROM external_configs WHERE type = ? ORDER BY created_at DESC LIMIT 1', [type]);
        const effectivePassword = (password !== undefined && password !== null && String(password) !== '')
            ? password
            : (existing[0]?.password || '');

        const mysql = require('mysql2/promise');
        const testConn = await mysql.createConnection({
            host: cleanHost,
            user: cleanUser,
            password: effectivePassword,
            database: cleanDb,
            port: cleanPort,
            connectTimeout: 8000
        });
        await testConn.end();

        if (existing.length > 0) {
            await db.query(
                'UPDATE external_configs SET host = ?, user = ?, password = ?, database_name = ?, port = ? WHERE id = ?',
                [cleanHost, cleanUser, effectivePassword, cleanDb, cleanPort, existing[0].id]
            );
        } else {
            await db.query(
                'INSERT INTO external_configs (host, user, password, database_name, port, type) VALUES (?, ?, ?, ?, ?, ?)',
                [cleanHost, cleanUser, effectivePassword, cleanDb, cleanPort, type]
            );
        }
        invalidateConfigCache(type);
        res.json({ message: successMessage });
    } catch (error) {
        sendSafeError(res, error, errorMessage, 400);
    }
};

// --- External Database Configuration ---
router.get('/config', authenticateToken, requireRole('Administrator'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
        res.json(maskConfigPassword(rows[0]));
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar configuración');
    }
});

router.post('/config', authenticateToken, requireRole('Administrator'), (req, res) => (
    saveExternalDbConfig(req, res, {
        type: 'main',
        successMessage: 'Configuración guardada y conexión exitosa',
        errorMessage: 'Error al guardar configuración de base de datos principal'
    })
));

// --- Accounting Database Configuration ---
router.get('/accounting-config', authenticateToken, requireRole('Administrator'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM external_configs WHERE type = 'accounting' ORDER BY created_at DESC LIMIT 1");
        res.json(maskConfigPassword(rows[0]));
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar configuración de contabilidad');
    }
});

router.post('/accounting-config', authenticateToken, requireRole('Administrator'), (req, res) => (
    saveExternalDbConfig(req, res, {
        type: 'accounting',
        successMessage: 'Configuración de contabilidad guardada y probada exitosamente',
        errorMessage: 'Error al conectar con la base de datos de contabilidad'
    })
));

// --- Email Configuration ---
router.get('/config/email', authenticateToken, requireRole('Administrator'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query("SELECT * FROM email_configs ORDER BY created_at DESC LIMIT 1");
        res.json(maskConfigPassword(rows[0]));
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar configuración de email');
    }
});

router.post('/config/email', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { host, port, secure, user, password, from_address, office_email } = req.body || {};
    const cleanHost = typeof host === 'string' ? host.trim() : '';
    const cleanUser = typeof user === 'string' ? user.trim() : '';
    const cleanFrom = typeof from_address === 'string' ? from_address.trim() : '';
    const cleanOffice = (office_email && typeof office_email === 'string' && office_email.trim()) ? office_email.trim() : null;
    const cleanPort = parseValidPort(port, 587);

    if (!cleanHost || !cleanUser || !cleanFrom) {
        return res.status(400).json({ message: 'Servidor SMTP, usuario y nombre de remitente son obligatorios.' });
    }
    if (!cleanPort) {
        return res.status(400).json({ message: 'El puerto SMTP debe ser un número válido entre 1 y 65535.' });
    }
    if ([cleanHost, cleanUser, cleanFrom, cleanOffice].some(hasHeaderInjection)) {
        return res.status(400).json({ message: 'Los campos de configuración de correo contienen caracteres no permitidos.' });
    }

    try {
        const db = getDb();
        const [existing] = await db.query("SELECT id, password FROM email_configs ORDER BY created_at DESC LIMIT 1");
        const effectivePassword = (password !== undefined && password !== null && String(password) !== '')
            ? password
            : (existing[0]?.password || '');

        if (existing.length > 0) {
            await db.query(
                "UPDATE email_configs SET host = ?, port = ?, secure = ?, user = ?, password = ?, from_address = ?, office_email = ? WHERE id = ?",
                [cleanHost, cleanPort, Boolean(secure), cleanUser, effectivePassword, cleanFrom, cleanOffice, existing[0].id]
            );
        } else {
            await db.query(
                "INSERT INTO email_configs (host, port, secure, user, password, from_address, office_email) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [cleanHost, cleanPort, Boolean(secure), cleanUser, effectivePassword, cleanFrom, cleanOffice]
            );
        }
        res.json({ message: 'Configuración de email guardada exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al guardar configuración de email');
    }
});

router.post('/config/email/test', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { host, port, secure, user, password, from_address, to_email, office_email } = req.body || {};
    const cleanHost = typeof host === 'string' ? host.trim() : '';
    const cleanUser = typeof user === 'string' ? user.trim() : '';
    const cleanFrom = typeof from_address === 'string' ? from_address.trim() : 'SIPE Admin';
    const recipient = String(to_email || office_email || '').trim();
    const cleanPort = parseValidPort(port, 587);

    if (!cleanHost || !cleanUser) {
        return res.status(400).json({ message: 'Servidor SMTP y usuario son obligatorios para la prueba.' });
    }
    if (!cleanPort) {
        return res.status(400).json({ message: 'El puerto SMTP debe ser un número válido entre 1 y 65535.' });
    }
    if (!recipient) {
        return res.status(400).json({ message: 'Debe proporcionar un correo destinatario o configurar el correo de oficina.' });
    }
    if ([cleanHost, cleanUser, cleanFrom, recipient].some(hasHeaderInjection)) {
        return res.status(400).json({ message: 'Los campos de correo contienen caracteres no permitidos.' });
    }
    try {
        const db = getDb();
        let effectivePassword = password;
        if (effectivePassword === undefined || effectivePassword === null || String(effectivePassword) === '') {
            const [existing] = await db.query("SELECT password FROM email_configs ORDER BY created_at DESC LIMIT 1");
            effectivePassword = existing[0]?.password || '';
        }

        const transporter = nodemailer.createTransport({
            host: cleanHost,
            port: cleanPort,
            secure: Boolean(secure),
            auth: { user: cleanUser, pass: effectivePassword },
            tls: { rejectUnauthorized: process.env.SMTP_ALLOW_SELF_SIGNED === 'true' ? false : true }
        });

        await transporter.verify();

        await transporter.sendMail({
            from: `"${cleanFrom}" <${cleanUser}>`,
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

// --- Trigger Birthday Report on Demand ---
const { sendBirthdayNotification } = require('../services/birthdayNotifier');

router.post('/config/email/birthday-report-now', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { customRecipient, forceSendEmpty, sampleDate } = req.body;
    try {
        let targetDate = new Date();
        if (sampleDate) {
            targetDate = new Date(sampleDate);
        }
        const result = await sendBirthdayNotification({
            customRecipient,
            forceSendEmpty: forceSendEmpty !== undefined ? Boolean(forceSendEmpty) : true,
            targetDate
        });
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al procesar el envío del informe de cumpleañeros', 500);
    }
});

// --- Trigger Payment Reminder on Demand ---
const { sendPaymentReminderNotification } = require('../services/paymentNotifier');

router.post('/config/email/payment-reminder-now', authenticateToken, requireRole('Administrator'), async (req, res) => {
    const { customRecipient, forceSendEmpty, sampleDate } = req.body;
    try {
        let targetDate = new Date();
        if (sampleDate) {
            targetDate = new Date(sampleDate);
        }
        const result = await sendPaymentReminderNotification({
            customRecipient,
            forceSendEmpty: forceSendEmpty !== undefined ? Boolean(forceSendEmpty) : true,
            targetDate
        });
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al procesar el envío del recordatorio de pagos', 500);
    }
});

module.exports = router;
