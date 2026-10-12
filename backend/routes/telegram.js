const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const {
    getBotStatus,
    testTelegramConnection,
    restartTelegramBot,
    initTelegramBot,
    stopTelegramBot,
    sendTelegramMessage
} = require('../services/telegramBotService');

const telegramPerms = [
    '/dashboard/seguridad/telegram',
    'manage_telegram'
];

/**
 * GET /api/telegram/status
 * Estado de conectividad y sondeo del bot
 */
router.get('/status', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const status = await getBotStatus();
        res.json(status);
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener estado de Telegram Bot');
    }
});

/**
 * POST /api/telegram/test-connection
 * Probar conexión con Telegram API (getMe)
 */
router.post('/test-connection', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const result = await testTelegramConnection();
        res.json({ ok: true, result });
    } catch (error) {
        sendSafeError(res, error, 'Error al probar conexión con Telegram: ' + error.message);
    }
});

/**
 * POST /api/telegram/restart-bot
 * Reiniciar el ciclo de polling
 */
router.post('/restart-bot', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        await restartTelegramBot();
        const status = await getBotStatus();
        res.json({ ok: true, message: 'Servicio de Telegram reiniciado correctamente', status });
    } catch (error) {
        sendSafeError(res, error, 'Error al reiniciar Telegram Bot');
    }
});

/**
 * POST /api/telegram/toggle-active
 * Pausar o reanudar el sondeo del bot
 */
router.post('/toggle-active', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const [rows] = await db.query('SELECT is_active FROM telegram_config WHERE id = 1');
        const currentActive = rows.length > 0 ? Boolean(rows[0].is_active) : true;
        const newActive = !currentActive;

        await db.query('UPDATE telegram_config SET is_active = ? WHERE id = 1', [newActive ? 1 : 0]);

        if (newActive) {
            await initTelegramBot();
        } else {
            stopTelegramBot();
        }

        res.json({ ok: true, is_active: newActive });
    } catch (error) {
        sendSafeError(res, error, 'Error al alternar estado del bot');
    }
});

/**
 * GET /api/telegram/users
 * Lista de usuarios autorizados y pendientes
 */
router.get('/users', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const [users] = await db.query(`
            SELECT id, telegram_user_id, telegram_username, first_name, last_name,
                   user_id, activo, permiso_ventas, permiso_saldos_banco, 
                   permiso_saldos_chequera, permiso_alertas, notas,
                   last_interaction, created_at, updated_at
            FROM telegram_usuarios
            ORDER BY activo ASC, created_at DESC
        `);

        const summary = {
            total: users.length,
            activos: users.filter(u => u.activo === 1).length,
            pendientes: users.filter(u => u.activo === 0 && (u.notas || '').includes('Solicitud')).length,
            inactivos: users.filter(u => u.activo === 0).length
        };

        res.json({ users, summary });
    } catch (error) {
        sendSafeError(res, error, 'Error al listar usuarios de Telegram');
    }
});

/**
 * POST /api/telegram/users
 * Registrar o aprobar manualmente un usuario de Telegram
 */
router.post('/users', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    const {
        telegram_user_id,
        telegram_username,
        first_name,
        last_name,
        activo,
        permiso_ventas,
        permiso_saldos_banco,
        permiso_saldos_chequera,
        permiso_alertas,
        notas
    } = req.body;

    if (!telegram_user_id) {
        return res.status(400).json({ message: 'El ID de usuario de Telegram es obligatorio.' });
    }

    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const cleanUid = String(telegram_user_id).trim();
        const username = telegram_username ? (telegram_username.startsWith('@') ? telegram_username : `@${telegram_username}`) : null;

        await db.query(`
            INSERT INTO telegram_usuarios 
            (telegram_user_id, telegram_username, first_name, last_name, activo, permiso_ventas, permiso_saldos_banco, permiso_saldos_chequera, permiso_alertas, notas, last_interaction)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
            telegram_username = VALUES(telegram_username),
            first_name = VALUES(first_name),
            last_name = VALUES(last_name),
            activo = VALUES(activo),
            permiso_ventas = VALUES(permiso_ventas),
            permiso_saldos_banco = VALUES(permiso_saldos_banco),
            permiso_saldos_chequera = VALUES(permiso_saldos_chequera),
            permiso_alertas = VALUES(permiso_alertas),
            notas = VALUES(notas)
        `, [
            cleanUid,
            username,
            first_name || '',
            last_name || '',
            activo !== undefined ? (activo ? 1 : 0) : 1,
            permiso_ventas !== undefined ? (permiso_ventas ? 1 : 0) : 1,
            permiso_saldos_banco !== undefined ? (permiso_saldos_banco ? 1 : 0) : 1,
            permiso_saldos_chequera !== undefined ? (permiso_saldos_chequera ? 1 : 0) : 1,
            permiso_alertas !== undefined ? (permiso_alertas ? 1 : 0) : 1,
            notas || ''
        ]);

        // Si fue activado, enviar notificación de bienvenida al usuario vía Telegram
        if (activo) {
            sendTelegramMessage(
                cleanUid,
                `🎉 ¡<b>Felicidades ${first_name || ''}</b>! Tu cuenta de Telegram ha sido <b>aprobada y autorizada</b> para realizar consultas en <b>SIPE Admin</b>.\n\nEscribe <b>/menu</b> para comenzar a consultar.`
            ).catch(e => console.warn('Aviso de activación no entregado:', e.message));
        }

        res.json({ ok: true, message: 'Usuario de Telegram guardado exitosamente.' });
    } catch (error) {
        sendSafeError(res, error, 'Error al guardar usuario de Telegram');
    }
});

/**
 * PUT /api/telegram/users/:id
 * Actualizar permisos y estado de un usuario
 */
router.put('/users/:id', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    const { id } = req.params;
    const {
        telegram_username,
        first_name,
        last_name,
        activo,
        permiso_ventas,
        permiso_saldos_banco,
        permiso_saldos_chequera,
        permiso_alertas,
        notas
    } = req.body;

    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const [currRows] = await db.query('SELECT * FROM telegram_usuarios WHERE id = ?', [id]);
        if (!currRows || currRows.length === 0) {
            return res.status(404).json({ message: 'Usuario de Telegram no encontrado.' });
        }
        const currentUser = currRows[0];

        const username = telegram_username ? (telegram_username.startsWith('@') ? telegram_username : `@${telegram_username}`) : currentUser.telegram_username;

        await db.query(`
            UPDATE telegram_usuarios SET
                telegram_username = ?,
                first_name = ?,
                last_name = ?,
                activo = ?,
                permiso_ventas = ?,
                permiso_saldos_banco = ?,
                permiso_saldos_chequera = ?,
                permiso_alertas = ?,
                notas = ?
            WHERE id = ?
        `, [
            username,
            first_name !== undefined ? first_name : currentUser.first_name,
            last_name !== undefined ? last_name : currentUser.last_name,
            activo !== undefined ? (activo ? 1 : 0) : currentUser.activo,
            permiso_ventas !== undefined ? (permiso_ventas ? 1 : 0) : currentUser.permiso_ventas,
            permiso_saldos_banco !== undefined ? (permiso_saldos_banco ? 1 : 0) : currentUser.permiso_saldos_banco,
            permiso_saldos_chequera !== undefined ? (permiso_saldos_chequera ? 1 : 0) : currentUser.permiso_saldos_chequera,
            permiso_alertas !== undefined ? (permiso_alertas ? 1 : 0) : currentUser.permiso_alertas,
            notas !== undefined ? notas : currentUser.notas,
            id
        ]);

        // Si cambió de inactivo a activo, enviar aviso por Telegram
        if (!currentUser.activo && activo) {
            sendTelegramMessage(
                currentUser.telegram_user_id,
                `🎉 ¡<b>Hola ${currentUser.first_name || ''}</b>! Tu cuenta de Telegram ha sido <b>activada</b> en <b>SIPE Admin</b>.\n\nEscribe <b>/menu</b> para consultar ventas, saldos o alertas.`
            ).catch(e => console.warn('Aviso no entregado:', e.message));
        }

        res.json({ ok: true, message: 'Usuario actualizado exitosamente.' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar usuario de Telegram');
    }
});

/**
 * DELETE /api/telegram/users/:id
 * Eliminar acceso de usuario de Telegram
 */
router.delete('/users/:id', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const [userRows] = await db.query('SELECT telegram_user_id, first_name FROM telegram_usuarios WHERE id = ?', [id]);
        if (userRows.length > 0) {
            const user = userRows[0];
            sendTelegramMessage(
                user.telegram_user_id,
                `🔒 Tu acceso para consultas de <b>SIPE Admin</b> ha sido revocado por un administrador.`
            ).catch(() => {});
        }

        await db.query('DELETE FROM telegram_usuarios WHERE id = ?', [id]);
        res.json({ ok: true, message: 'Usuario de Telegram eliminado correctamente.' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar usuario de Telegram');
    }
});

/**
 * GET /api/telegram/bitacora
 * Consultas recientes ejecutadas vía Telegram
 */
router.get('/bitacora', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const [rows] = await db.query(`
            SELECT b.id, b.telegram_user_id, b.comando, b.consulta, b.autorizado, b.created_at,
                   u.first_name, u.last_name, u.telegram_username
            FROM telegram_bitacora b
            LEFT JOIN telegram_usuarios u ON b.telegram_user_id = u.telegram_user_id
            ORDER BY b.id DESC
            LIMIT 100
        `);

        res.json(rows || []);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar bitácora de Telegram');
    }
});

/**
 * POST /api/telegram/send-test-message
 * Enviar mensaje de prueba a un ID específico
 */
router.post('/send-test-message', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    const { telegram_user_id, message } = req.body;
    if (!telegram_user_id || !message) {
        return res.status(400).json({ message: 'telegram_user_id y message son requeridos.' });
    }

    try {
        await sendTelegramMessage(telegram_user_id, `🔔 <b>Mensaje de Prueba desde SIPE Admin:</b>\n\n${message}`);
        res.json({ ok: true, message: 'Mensaje de prueba enviado con éxito.' });
    } catch (error) {
        sendSafeError(res, error, 'Error enviando mensaje de prueba: ' + error.message);
    }
});

module.exports = router;
