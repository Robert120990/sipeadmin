const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const {
    getBotStatus,
    testTelegramConnection,
    restartTelegramBot,
    initTelegramBot,
    stopTelegramBot,
    sendTelegramMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert,
    getFeedbackStats,
    getFeedbackList,
    handleIncomingMessage,
    handleCallbackQuery,
    setTelegramWebhook,
    deleteTelegramWebhook,
    getTelegramWebhookInfo
} = require('../services/telegramBotService');
const {
    getHealthDiagnostics,
    getErrors,
    clearErrors
} = require('../services/telegramAuditorService');

const telegramPerms = [
    '/dashboard/seguridad/telegram',
    'manage_telegram'
];

const safeCompareSecret = (a, b) => {
    if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * POST /api/telegram/webhook
 * Endpoint público de alta velocidad para recepción de updates de Telegram vía Webhook HTTPS (<40ms).
 * Responde inmediatamente con HTTP 200 y despacha el procesamiento de forma asíncrona.
 */
router.post('/webhook', (req, res) => {
    // Verificación de secret token con comparación constante en tiempo
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && !safeCompareSecret(String(secretHeader || ''), String(expectedSecret))) {
        return res.status(403).json({ error: 'Secret token inválido' });
    }

    // 1. Inmediata respuesta HTTP 200 OK (< 5ms) para cumplir el SLA de Telegram (<40ms)
    res.sendStatus(200);

    // 2. Despacho asíncrono no bloqueante
    const update = req.body;
    if (!update || typeof update !== 'object') {
        return;
    }

    setImmediate(async () => {
        try {
            if (update.message) {
                await handleIncomingMessage(update.message);
            } else if (update.callback_query) {
                await handleCallbackQuery(update.callback_query);
            }
        } catch (err) {
            console.error('[Telegram Webhook] Error procesando update asíncrono:', err.message);
        }
    });
});

/**
 * POST /api/telegram/webhook/set
 * Configurar Webhook HTTPS en Telegram API
 */
router.post('/webhook/set', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const { webhook_url, url, secret_token, max_connections, drop_pending_updates } = req.body || {};
        const targetUrl = webhook_url || url;
        if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('https://')) {
            return res.status(400).json({
                ok: false,
                message: 'La URL del webhook debe ser una URL HTTPS válida (ej. https://dominio.com/api/telegram/webhook).'
            });
        }

        const result = await setTelegramWebhook({
            url: targetUrl,
            secret_token,
            max_connections,
            drop_pending_updates
        });

        res.json({
            ok: true,
            message: 'Webhook configurado correctamente en Telegram API',
            result
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al configurar Telegram Webhook');
    }
});

/**
 * POST /api/telegram/webhook/delete
 * Eliminar Webhook de Telegram y volver a modo sondeo/polling
 */
router.post('/webhook/delete', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const { drop_pending_updates } = req.body || {};
        const result = await deleteTelegramWebhook({ drop_pending_updates: Boolean(drop_pending_updates) });
        res.json({
            ok: true,
            message: 'Webhook eliminado correctamente de Telegram API',
            result
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar Telegram Webhook');
    }
});

/**
 * GET /api/telegram/webhook/info
 * Consultar estado actual del Webhook en Telegram API
 */
router.get('/webhook/info', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const info = await getTelegramWebhookInfo();
        res.json({
            ok: true,
            info
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener información del Telegram Webhook');
    }
});

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
 * Función auxiliar para enmascarar token sensible
 */
const maskToken = (token) => {
    if (!token || typeof token !== 'string') return '';
    const trimmed = token.trim();
    if (trimmed.length <= 12) return '••••••••';
    return trimmed.substring(0, 8) + '••••••••' + trimmed.substring(trimmed.length - 4);
};

/**
 * GET /api/telegram/config
 * Obtener configuración actual del bot (token enmascarado para seguridad)
 */
router.get('/config', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const [rows] = await db.query('SELECT bot_token, gemini_api_key, bot_username, bot_first_name, is_active, last_poll_at, updated_at FROM telegram_config WHERE id = 1 LIMIT 1');
        const config = rows && rows.length > 0 ? rows[0] : null;
        const currentToken = config?.bot_token || process.env.TELEGRAM_BOT_TOKEN || '';
        const currentGeminiKey = config?.gemini_api_key || process.env.GEMINI_API_KEY || '';

        res.json({
            ok: true,
            has_token: Boolean(currentToken),
            masked_token: maskToken(currentToken),
            has_gemini_key: Boolean(currentGeminiKey && currentGeminiKey.trim().length > 10),
            masked_gemini_key: maskToken(currentGeminiKey),
            bot_username: config?.bot_username || null,
            bot_first_name: config?.bot_first_name || null,
            is_active: config ? Boolean(config.is_active) : true,
            last_poll_at: config?.last_poll_at || null,
            updated_at: config?.updated_at || null
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener configuración de Telegram');
    }
});

/**
 * PUT /api/telegram/config
 * Actualizar token del bot de Telegram y/o clave de Gemini API, verificar conexión y reiniciar servicio
 */
router.put('/config', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const { bot_token, gemini_api_key, is_active } = req.body;

        if ((!bot_token || typeof bot_token !== 'string' || bot_token.trim().length < 15) &&
            (!gemini_api_key || typeof gemini_api_key !== 'string' || gemini_api_key.trim().length < 10) &&
            is_active === undefined) {
            return res.status(400).json({ message: 'Debes proporcionar un token de Telegram o una clave de Gemini válidos' });
        }

        let verifiedBot = null;
        const isActiveValue = is_active !== undefined ? (is_active ? 1 : 0) : 1;

        // 1. Si se actualiza bot_token, probarlo de inmediato
        if (bot_token && typeof bot_token === 'string' && bot_token.trim().length >= 15) {
            const cleanToken = bot_token.trim();
            try {
                verifiedBot = await testTelegramConnection(cleanToken);
            } catch (connErr) {
                return res.status(400).json({
                    message: `El token fue rechazado por la API de Telegram: ${connErr.message || 'Error de autenticación'}`
                });
            }

            if (gemini_api_key && gemini_api_key.trim().length >= 10) {
                await db.query(`
                    INSERT INTO telegram_config (id, bot_token, gemini_api_key, bot_username, bot_first_name, is_active, updated_at)
                    VALUES (1, ?, ?, ?, ?, ?, NOW())
                    ON DUPLICATE KEY UPDATE
                        bot_token = VALUES(bot_token),
                        gemini_api_key = VALUES(gemini_api_key),
                        bot_username = VALUES(bot_username),
                        bot_first_name = VALUES(bot_first_name),
                        is_active = VALUES(is_active),
                        updated_at = NOW()
                `, [
                    cleanToken,
                    gemini_api_key.trim(),
                    verifiedBot?.username || 'SIPE_IA_BOT',
                    verifiedBot?.first_name || 'SIPE_BOT',
                    isActiveValue
                ]);
            } else {
                await db.query(`
                    INSERT INTO telegram_config (id, bot_token, bot_username, bot_first_name, is_active, updated_at)
                    VALUES (1, ?, ?, ?, ?, NOW())
                    ON DUPLICATE KEY UPDATE
                        bot_token = VALUES(bot_token),
                        bot_username = VALUES(bot_username),
                        bot_first_name = VALUES(bot_first_name),
                        is_active = VALUES(is_active),
                        updated_at = NOW()
                `, [
                    cleanToken,
                    verifiedBot?.username || 'SIPE_IA_BOT',
                    verifiedBot?.first_name || 'SIPE_BOT',
                    isActiveValue
                ]);
            }

            await restartTelegramBot();
        } else if (gemini_api_key && gemini_api_key.trim().length >= 10) {
            // Solo se actualiza la clave de Gemini
            await db.query(`
                INSERT INTO telegram_config (id, gemini_api_key, is_active, updated_at)
                VALUES (1, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    gemini_api_key = VALUES(gemini_api_key),
                    is_active = VALUES(is_active),
                    updated_at = NOW()
            `, [
                gemini_api_key.trim(),
                isActiveValue
            ]);
        } else if (is_active !== undefined) {
            await db.query(`
                UPDATE telegram_config SET is_active = ?, updated_at = NOW() WHERE id = 1
            `, [isActiveValue]);
        }

        const updatedStatus = await getBotStatus();

        res.json({
            ok: true,
            message: 'Configuración actualizada exitosamente.',
            bot: verifiedBot,
            status: updatedStatus
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar configuración de Telegram');
    }
});

/**
 * POST /api/telegram/test-gemini
 * Probar conectividad y validez de la clave de Gemini API
 */
router.post('/test-gemini', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    const startTime = Date.now();
    try {
        let apiKey = req.body?.gemini_api_key;
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
            const { getGeminiApiKey } = require('../services/telegramBotService');
            apiKey = await getGeminiApiKey();
        }

        if (!apiKey) {
            return res.status(400).json({
                ok: false,
                message: 'No se ha proporcionado ni se encuentra configurada ninguna clave de Gemini API'
            });
        }

        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

        let modelUsed = 'gemini-2.0-flash';
        let response = null;
        try {
            response = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: 'Responde únicamente con la palabra OK.'
            });
        } catch (e2) {
            modelUsed = 'gemini-1.5-flash';
            response = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
                contents: 'Responde únicamente con la palabra OK.'
            });
        }

        const latencyMs = Date.now() - startTime;
        const text = response?.text || '';

        res.json({
            ok: true,
            model: modelUsed,
            latencyMs,
            reply: text.trim(),
            message: `Conexión con Gemini AI exitosa (${modelUsed}, latencia: ${latencyMs}ms)`
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            latencyMs: Date.now() - startTime,
            message: `Error al probar Gemini API: ${error.message || 'Clave inválida o sin cuota'}`
        });
    }
});

/**
 * GET /api/telegram/system-users
 * Lista de usuarios del sistema SIPE Admin con sus roles y permisos para vinculación
 */
router.get('/system-users', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const [users] = await db.query(`
            SELECT u.id, u.username, u.nombre, u.email, u.status, u.role_id, r.name as role_name,
                   GROUP_CONCAT(p.name) as permissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE u.status = 'active' OR u.status IS NULL
            GROUP BY u.id
            ORDER BY u.nombre ASC, u.username ASC
        `);

        const formatted = users.map(u => {
            const isAdmin = u.role_name === 'Administrator';
            const perms = (u.permissions || '').split(',');
            return {
                id: u.id,
                username: u.username,
                nombre: u.nombre || u.username,
                email: u.email || '',
                role_id: u.role_id,
                role_name: u.role_name || 'Sin Rol',
                status: u.status || 'active',
                permissions: {
                    ventas: isAdmin || perms.includes('/dashboard/consultas/estaciones/ventas'),
                    saldos_banco: isAdmin || perms.includes('/dashboard/bancos/reportes/saldos-bancos') || perms.includes('/dashboard/bancos/cuentas') || perms.includes('/dashboard/bancos/movimientos'),
                    saldos_chequera: isAdmin || perms.includes('/dashboard/bancos/reportes/saldos-chequera') || perms.includes('/dashboard/bancos/cheques'),
                    alertas: isAdmin || perms.includes('/dashboard/consultas/estaciones/diferencias-combustible') || perms.includes('/dashboard/consultas/estaciones/resumen-cierre')
                }
            };
        });

        res.json(formatted);
    } catch (error) {
        sendSafeError(res, error, 'Error al listar usuarios del sistema');
    }
});

/**
 * GET /api/telegram/users
 * Lista de usuarios autorizados y pendientes con datos vinculados de SIPE Admin
 */
router.get('/users', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const [users] = await db.query(`
            SELECT tu.id, tu.telegram_user_id, tu.telegram_username, tu.first_name, tu.last_name,
                   tu.user_id, tu.activo, tu.permiso_ventas, tu.permiso_saldos_banco, 
                   tu.permiso_saldos_chequera, tu.permiso_alertas, tu.notas,
                   tu.last_interaction, tu.created_at, tu.updated_at,
                   u.nombre as sipe_nombre, u.username as sipe_username, u.email as sipe_email,
                   u.status as sipe_status, r.name as sipe_role_name,
                   GROUP_CONCAT(p.name) as sipe_permissions
            FROM telegram_usuarios tu
            LEFT JOIN users u ON tu.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            GROUP BY tu.id
            ORDER BY tu.activo ASC, tu.created_at DESC
        `);

        const enhancedUsers = users.map(u => {
            const isLinked = Boolean(u.user_id && u.sipe_nombre);
            let effectiveVentas = Boolean(u.permiso_ventas);
            let effectiveBancos = Boolean(u.permiso_saldos_banco);
            let effectiveChequera = Boolean(u.permiso_saldos_chequera);
            let effectiveAlertas = Boolean(u.permiso_alertas);

            if (isLinked) {
                const isAdmin = u.sipe_role_name === 'Administrator';
                const perms = (u.sipe_permissions || '').split(',');
                effectiveVentas = isAdmin || perms.includes('/dashboard/consultas/estaciones/ventas');
                effectiveBancos = isAdmin || perms.includes('/dashboard/bancos/reportes/saldos-bancos') || perms.includes('/dashboard/bancos/cuentas') || perms.includes('/dashboard/bancos/movimientos');
                effectiveChequera = isAdmin || perms.includes('/dashboard/bancos/reportes/saldos-chequera') || perms.includes('/dashboard/bancos/cheques');
                effectiveAlertas = isAdmin || perms.includes('/dashboard/consultas/estaciones/diferencias-combustible') || perms.includes('/dashboard/consultas/estaciones/resumen-cierre');
            }

            return {
                ...u,
                is_linked: isLinked,
                effective_permissions: {
                    ventas: effectiveVentas,
                    saldos_banco: effectiveBancos,
                    saldos_chequera: effectiveChequera,
                    alertas: effectiveAlertas
                }
            };
        });

        const summary = {
            total: enhancedUsers.length,
            activos: enhancedUsers.filter(u => u.activo === 1).length,
            vinculados: enhancedUsers.filter(u => u.is_linked).length,
            pendientes: enhancedUsers.filter(u => u.activo === 0 && (u.notas || '').includes('Solicitud')).length,
            inactivos: enhancedUsers.filter(u => u.activo === 0).length
        };

        res.json({ users: enhancedUsers, summary });
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
        user_id,
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
        const targetUserId = user_id ? parseInt(user_id, 10) : null;

        await db.query(`
            INSERT INTO telegram_usuarios 
            (telegram_user_id, telegram_username, first_name, last_name, user_id, activo, permiso_ventas, permiso_saldos_banco, permiso_saldos_chequera, permiso_alertas, notas, last_interaction)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
            telegram_username = VALUES(telegram_username),
            first_name = VALUES(first_name),
            last_name = VALUES(last_name),
            user_id = VALUES(user_id),
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
            targetUserId,
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
        user_id,
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
        const resolvedUserId = user_id !== undefined ? (user_id ? parseInt(user_id, 10) : null) : currentUser.user_id;

        await db.query(`
            UPDATE telegram_usuarios SET
                telegram_username = ?,
                first_name = ?,
                last_name = ?,
                user_id = ?,
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
            resolvedUserId,
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
 * POST /api/telegram/users/:id/link
 * Vincular o desvincular un usuario de Telegram con un usuario de SIPE Admin
 */
router.post('/users/:id/link', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    const { id } = req.params;
    const { user_id, sync_permissions } = req.body;

    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        const targetUserId = user_id ? parseInt(user_id, 10) : null;

        if (targetUserId) {
            const [users] = await db.query(`
                SELECT u.id, u.nombre, u.username, r.name as role_name,
                       GROUP_CONCAT(p.name) as permissions
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                LEFT JOIN permissions p ON rp.permission_id = p.id
                WHERE u.id = ?
                GROUP BY u.id
            `, [targetUserId]);

            if (!users || users.length === 0) {
                return res.status(404).json({ message: 'El usuario de SIPE Admin seleccionado no existe.' });
            }

            const su = users[0];
            const isAdmin = su.role_name === 'Administrator';
            const perms = (su.permissions || '').split(',');

            const pVentas = (isAdmin || perms.includes('/dashboard/consultas/estaciones/ventas')) ? 1 : 0;
            const pBancos = (isAdmin || perms.includes('/dashboard/bancos/reportes/saldos-bancos') || perms.includes('/dashboard/bancos/cuentas') || perms.includes('/dashboard/bancos/movimientos')) ? 1 : 0;
            const pChequera = (isAdmin || perms.includes('/dashboard/bancos/reportes/saldos-chequera') || perms.includes('/dashboard/bancos/cheques')) ? 1 : 0;
            const pAlertas = (isAdmin || perms.includes('/dashboard/consultas/estaciones/diferencias-combustible') || perms.includes('/dashboard/consultas/estaciones/resumen-cierre')) ? 1 : 0;

            if (sync_permissions !== false) {
                await db.query(`
                    UPDATE telegram_usuarios SET
                        user_id = ?,
                        permiso_ventas = ?,
                        permiso_saldos_banco = ?,
                        permiso_saldos_chequera = ?,
                        permiso_alertas = ?,
                        updated_at = NOW()
                    WHERE id = ?
                `, [targetUserId, pVentas, pBancos, pChequera, pAlertas, id]);
            } else {
                await db.query(`
                    UPDATE telegram_usuarios SET
                        user_id = ?,
                        updated_at = NOW()
                    WHERE id = ?
                `, [targetUserId, id]);
            }

            return res.json({
                ok: true,
                message: `Usuario de Telegram vinculado exitosamente a "${su.nombre || su.username}" (${su.role_name}).`
            });
        } else {
            await db.query('UPDATE telegram_usuarios SET user_id = NULL, updated_at = NOW() WHERE id = ?', [id]);
            return res.json({ ok: true, message: 'Usuario de Telegram desvinculado de SIPE Admin.' });
        }
    } catch (error) {
        sendSafeError(res, error, 'Error al vincular usuario de Telegram');
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

/**
 * Middleware para validar acceso de n8n (vía cabecera x-api-key o x-n8n-token) o administrador vía JWT
 */
const authenticateN8nOrAdmin = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.headers['x-n8n-key'] || req.headers['x-n8n-token'];
    const validKeys = [
        process.env.N8N_API_KEY,
        process.env.INTERNAL_API_KEY,
        process.env.TELEGRAM_API_KEY,
        process.env.TELEGRAM_BROADCAST_KEY
    ].filter(Boolean);

    if (apiKey && validKeys.some(k => safeCompareSecret(String(apiKey), String(k)))) {
        req.user = {
            id: 0,
            username: 'n8n-orchestrator',
            role_name: 'Administrator',
            role_id: 1,
            permissions: telegramPerms
        };
        return next();
    }

    return authenticateToken(req, res, () => {
        requirePermission(telegramPerms)(req, res, next);
    });
};

/**
 * POST /api/telegram/notify-discrepancies
 * Dispara la revisión y notificación de discrepancias (puede recibir { fecha }).
 * Protegido con authenticateToken y requirePermission(telegramPerms).
 */
router.post('/notify-discrepancies', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    try {
        const { fecha } = req.body || {};
        const result = await broadcastDiscrepancyAlerts(fecha || null);
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al procesar alertas de discrepancias');
    }
});

/**
 * POST /api/telegram/broadcast-alert
 * Permite a n8n o administradores enviar una alerta broadcast personalizada a todos los directores con permiso de alertas.
 */
router.post('/broadcast-alert', authenticateN8nOrAdmin, async (req, res) => {
    const { mensaje, message, titulo, title, severidad, severity } = req.body || {};
    const textToSend = mensaje || message;
    if (!textToSend || !String(textToSend).trim()) {
        return res.status(400).json({ message: 'El mensaje de la alerta es obligatorio (campo mensaje o message).' });
    }

    try {
        const result = await broadcastCustomAlert({
            message: String(textToSend).trim(),
            title: titulo || title,
            severity: severidad || severity || 'alerta'
        });
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al emitir alerta broadcast');
    }
});

/**
 * GET /api/telegram/feedback/stats
 * Obtener métricas y KPI de satisfacción del bot de Telegram
 */
router.get('/feedback/stats', authenticateN8nOrAdmin, async (req, res) => {
    try {
        const stats = await getFeedbackStats();
        res.json({ ok: true, stats });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener estadísticas de retroalimentación');
    }
});

/**
 * GET /api/telegram/feedback
 * Listar registros de retroalimentación y sugerencias de mejora continua
 */
router.get('/feedback', authenticateN8nOrAdmin, async (req, res) => {
    try {
        const { limit = 50, offset = 0, estado, calificacion } = req.query;
        const feedbacks = await getFeedbackList({
            limit: Number(limit) || 50,
            offset: Number(offset) || 0,
            estado: estado || null,
            calificacion: calificacion || null
        });
        res.json({ ok: true, feedbacks });
    } catch (error) {
        sendSafeError(res, error, 'Error al listar registros de retroalimentación');
    }
});

/**
 * PATCH /api/telegram/feedback/:id/revisar
 * Marcar una retroalimentación como revisada con notas de resolución
 */
router.patch('/feedback/:id/revisar', authenticateToken, requirePermission(telegramPerms), async (req, res) => {
    const feedbackId = parseInt(req.params.id, 10);
    if (!feedbackId) {
        return res.status(400).json({ message: 'ID de feedback inválido' });
    }

    const { notas, notas_resolucion } = req.body || {};
    const finalNotas = notas || notas_resolucion || null;

    try {
        const db = getDb();
        if (!db) return res.status(500).json({ message: 'Base de datos no inicializada' });

        await db.query(
            `UPDATE telegram_feedback 
             SET estado = 'REVISADO', notas_resolucion = ?, revisado_por = ?, revisado_at = NOW(), updated_at = NOW() 
             WHERE id = ?`,
            [finalNotas, req.user?.id || null, feedbackId]
        );

        res.json({ ok: true, message: 'Retroalimentación marcada como revisada exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar estado de retroalimentación');
    }
});

/**
 * GET /api/telegram/audit/health
 * Diagnóstico consolidado de salud, infraestructura, conectividad y métricas operativas
 */
router.get('/audit/health', authenticateN8nOrAdmin, async (req, res) => {
    try {
        const diagnostics = await getHealthDiagnostics();
        res.json({ ok: true, ...diagnostics, diagnostics });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener diagnóstico de salud de Telegram');
    }
});

/**
 * GET /api/telegram/audit/errors
 * Listado de eventos y errores forenses almacenados en el buffer circular
 */
router.get('/audit/errors', authenticateN8nOrAdmin, async (req, res) => {
    try {
        const { limit = 50, type } = req.query;
        const errors = getErrors({ limit: Number(limit) || 50, type });
        res.json({ ok: true, count: errors.length, errors });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener registros de errores forenses');
    }
});

/**
 * POST /api/telegram/audit/clear-errors
 * Limpia el buffer de errores forenses en memoria
 */
router.post('/audit/clear-errors', authenticateN8nOrAdmin, async (req, res) => {
    try {
        const result = clearErrors();
        res.json({ ok: true, message: 'Buffer de errores forenses limpiado exitosamente', ...result });
    } catch (error) {
        sendSafeError(res, error, 'Error al limpiar buffer de errores forenses');
    }
});

router.authenticateN8nOrAdmin = authenticateN8nOrAdmin;
router.maskToken = maskToken;

module.exports = router;
