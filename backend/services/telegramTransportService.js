const axios = require('axios');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const DEFAULT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const runtimeState = {
    isPollingActive: false,
    lastPollAt: null,
    currentOffset: 0,
    botInfo: null,
    lastDbPollUpdate: 0
};

/**
 * Obtener token activo desde base de datos o variable de entorno
 */
const getBotToken = async () => {
    try {
        const db = getDb();
        if (db) {
            const [rows] = await db.query('SELECT bot_token, is_active FROM telegram_config WHERE id = 1 LIMIT 1');
            if (rows && rows.length > 0 && rows[0].bot_token) {
                return {
                    token: rows[0].bot_token.trim(),
                    isActive: Boolean(rows[0].is_active)
                };
            }
        }
    } catch (e) {
        // Base de datos puede estar iniciando
    }
    return {
        token: (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TOKEN).trim(),
        isActive: true
    };
};

/**
 * Teclado interactivo principal para Telegram
 */
const getMainReplyKeyboard = () => {
    return {
        keyboard: [
            [{ text: '⛽ Ventas de Hoy' }, { text: '⛽ Ventas de Ayer' }],
            [{ text: '📊 Precios Competencia' }, { text: '🚨 Alertas en Estaciones' }],
            [{ text: '🏦 Saldo en Banco' }, { text: '🧾 Saldo en Chequera' }],
            [{ text: '☀️ Paneles Solares' }, { text: '🏛️ Andelsa (sys)' }],
            [{ text: 'ℹ️ Mi Perfil' }, { text: '❓ Ayuda' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
};

/**
 * Comprobar conexión con la API de Telegram (getMe)
 */
const testTelegramConnection = async (customToken = null) => {
    const token = customToken || (await getBotToken()).token;
    if (!token) throw new Error('Token de Telegram no configurado');
    const res = await axios.get(`${TELEGRAM_API_BASE}${token}/getMe`, { timeout: 10000 });
    if (res.data?.ok) {
        runtimeState.botInfo = res.data.result;
        return res.data.result;
    }
    throw new Error('Respuesta inválida de Telegram API');
};

/**
 * Enviar mensaje a un chat de Telegram
 */
const sendTelegramMessage = async (chatId, text, replyMarkup = null) => {
    const { token } = await getBotToken();
    if (!token) return null;

    const payload = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };

    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }

    try {
        const res = await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
        return res.data?.result || null;
    } catch (err) {
        // Si falló por formato HTML, intentar enviar como texto plano
        if (err.response?.data?.description?.includes('can\'t parse entities')) {
            const plainText = text.replace(/<[^>]*>?/gm, '');
            delete payload.parse_mode;
            payload.text = plainText;
            try {
                const fallbackRes = await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
                return fallbackRes.data?.result || null;
            } catch (fbErr) {
                console.error('[TelegramBot] Error enviando mensaje plano fallback:', fbErr.message);
                return null;
            }
        } else {
            console.error('[TelegramBot] Error enviando mensaje a chat:', chatId, err.message);
            return null;
        }
    }
};

/**
 * Enviar acción de chat a Telegram (ej. 'typing', 'upload_document') de forma no bloqueante
 */
const sendChatAction = async (chatId, action = 'typing') => {
    try {
        const { token } = await getBotToken();
        if (!token) return { ok: false, error: 'Token de Telegram no configurado' };
        await axios.post(`${TELEGRAM_API_BASE}${token}/sendChatAction`, {
            chat_id: chatId,
            action
        }, { timeout: 3000 });
        return { ok: true, result: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
};

/**
 * Enviar un documento (ej. reporte PDF tamaño Carta) a un chat de Telegram
 */
const sendTelegramDocument = async (chatId, fileBuffer, filename = 'Reporte_SIPE.pdf', caption = '') => {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
        throw new Error('Buffer de documento inválido o vacío');
    }

    const { token } = await getBotToken();
    if (!token) return null;

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    if (caption) {
        formData.append('caption', String(caption));
        formData.append('parse_mode', 'HTML');
    }
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('document', blob, filename);

    // Propiedades descriptivas adjuntas para inspección y pruebas
    formData.chat_id = chatId;
    formData.caption = caption;
    formData.parse_mode = 'HTML';
    formData.filename = filename;
    formData.fileBuffer = fileBuffer;

    try {
        const res = await axios.post(`${TELEGRAM_API_BASE}${token}/sendDocument`, formData, {
            timeout: 30000
        });
        return res.data?.result || res.data || null;
    } catch (err) {
        console.error('[TelegramBot] Error enviando documento a chat:', chatId, err.message);
        return null;
    }
};

/**
 * Configurar webhook HTTPS para Telegram Bot API
 */
const setTelegramWebhook = async (options) => {
    const { token } = await getBotToken();
    if (!token) throw new Error('Token de Telegram no configurado');
    const url = typeof options === 'string' ? options : options?.url;
    const payload = {
        url,
        drop_pending_updates: options?.drop_pending_updates !== undefined ? Boolean(options.drop_pending_updates) : false,
        allowed_updates: ['message', 'callback_query']
    };
    if (options && typeof options === 'object') {
        if (options.secret_token) payload.secret_token = options.secret_token;
        if (options.max_connections) payload.max_connections = options.max_connections;
    }
    const res = await axios.post(`${TELEGRAM_API_BASE}${token}/setWebhook`, payload, { timeout: 10000 });
    return res.data;
};

/**
 * Eliminar webhook configurado en Telegram Bot API
 */
const deleteTelegramWebhook = async (options = {}) => {
    const { token } = await getBotToken();
    if (!token) throw new Error('Token de Telegram no configurado');
    const payload = {
        drop_pending_updates: Boolean(options?.drop_pending_updates)
    };
    const res = await axios.post(`${TELEGRAM_API_BASE}${token}/deleteWebhook`, payload, { timeout: 10000 });
    return res.data;
};

/**
 * Consultar información del webhook en Telegram Bot API
 */
const getTelegramWebhookInfo = async () => {
    const { token } = await getBotToken();
    if (!token) throw new Error('Token de Telegram no configurado');
    const res = await axios.get(`${TELEGRAM_API_BASE}${token}/getWebhookInfo`, { timeout: 10000 });
    return res.data;
};

/**
 * Responder a un callback query de Telegram (evita spinner en botón y muestra toast)
 */
const answerCallbackQuery = async (callbackQueryId, text = '', showAlert = false) => {
    try {
        const { token } = await getBotToken();
        if (!token) return;
        await axios.post(`${TELEGRAM_API_BASE}${token}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            text,
            show_alert: showAlert
        }, { timeout: 10000 });
    } catch (err) {
        console.warn('[TelegramBot] Error en answerCallbackQuery:', err.message);
    }
};

/**
 * Modificar el teclado inline de un mensaje existente
 */
const editMessageReplyMarkup = async (chatId, messageId, replyMarkup = null) => {
    try {
        const { token } = await getBotToken();
        if (!token) return;
        await axios.post(`${TELEGRAM_API_BASE}${token}/editMessageReplyMarkup`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: replyMarkup || { inline_keyboard: [] }
        }, { timeout: 10000 });
    } catch (err) {
        console.warn('[TelegramBot] Error en editMessageReplyMarkup:', err.message);
    }
};

/**
 * Obtener estado para la API web
 */
const getBotStatus = async () => {
    const { token, isActive } = await getBotToken();
    let isConnected = false;
    let details = runtimeState.botInfo;

    try {
        if (token) {
            details = await testTelegramConnection(token);
            isConnected = true;
        }
    } catch (e) {
        isConnected = false;
    }

    return {
        isConnected,
        isPolling: runtimeState.isPollingActive,
        isActive,
        lastPollAt: runtimeState.lastPollAt,
        bot: details || {
            id: null,
            username: 'SIPE_IA_BOT',
            first_name: 'SIPE_BOT'
        }
    };
};

module.exports = {
    TELEGRAM_API_BASE,
    DEFAULT_TOKEN,
    runtimeState,
    getBotToken,
    getMainReplyKeyboard,
    testTelegramConnection,
    sendTelegramMessage,
    sendChatAction,
    sendTelegramDocument,
    setTelegramWebhook,
    deleteTelegramWebhook,
    getTelegramWebhookInfo,
    answerCallbackQuery,
    editMessageReplyMarkup,
    getBotStatus
};
