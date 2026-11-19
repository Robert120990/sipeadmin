const axios = require('axios');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const DEFAULT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const runtimeState = {
    isPollingActive: false,
    pollingGeneration: 0,
    lastPollAt: null,
    currentOffset: 0,
    botInfo: null,
    lastDbPollUpdate: 0
};

/**
 * Redactar secretos (tokens de Telegram / claves de API) antes de registrar logs o errores
 */
const redactSecrets = (text = '') => {
    return String(text || '')
        .replace(/bot\d+:[A-Za-z0-9_-]{20,}/g, 'bot[REDACTED]')
        .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,55}\b/g, '[REDACTED_TELEGRAM_TOKEN]')
        .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GEMINI_KEY]');
};

let tokenCache = { dbRef: null, value: null, expiresAt: 0 };

const invalidateBotTokenCache = () => {
    tokenCache = { dbRef: null, value: null, expiresAt: 0 };
};

/**
 * Obtener token activo desde base de datos o variable de entorno (con caché breve por pool)
 */
const getBotToken = async () => {
    try {
        const db = getDb();
        const now = Date.now();
        if (db && tokenCache.dbRef === db && tokenCache.value && now < tokenCache.expiresAt) {
            return tokenCache.value;
        }
        if (db) {
            const [rows] = await db.query('SELECT bot_token, is_active FROM telegram_config WHERE id = 1 LIMIT 1');
            if (rows && rows.length > 0 && rows[0].bot_token) {
                const resolved = {
                    token: rows[0].bot_token.trim(),
                    isActive: Boolean(rows[0].is_active)
                };
                tokenCache = { dbRef: db, value: resolved, expiresAt: now + 20000 };
                return resolved;
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
 * Fragmentar mensajes extensos respetando el límite de 4096 caracteres de Telegram
 */
const splitTelegramMessageChunks = (rawText, maxLen = 4000) => {
    const str = String(rawText || '');
    if (str.length <= maxLen) return [str];
    const chunks = [];
    let remaining = str;
    while (remaining.length > maxLen) {
        let splitIdx = remaining.lastIndexOf('\n', maxLen);
        if (splitIdx < Math.floor(maxLen * 0.4)) {
            splitIdx = remaining.lastIndexOf(' ', maxLen);
        }
        if (splitIdx <= 0) splitIdx = maxLen;
        chunks.push(remaining.slice(0, splitIdx).trimEnd());
        remaining = remaining.slice(splitIdx).trimStart();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
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
 * Enviar mensaje a un chat de Telegram (con fragmentación automática <= 4000 chars y fallback seguro)
 */
const sendTelegramMessage = async (chatId, text, replyMarkup = null) => {
    const { token } = await getBotToken();
    if (!token) return null;

    const chunks = splitTelegramMessageChunks(text, 4000);
    let lastResult = null;

    for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const isLast = i === chunks.length - 1;
        const payload = {
            chat_id: chatId,
            text: chunkText,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        };

        if (isLast && replyMarkup) {
            payload.reply_markup = replyMarkup;
        }

        try {
            const res = await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
            lastResult = res.data?.result || null;
        } catch (err) {
            if (err.response?.data?.description?.includes('can\'t parse entities')) {
                const plainText = chunkText.replace(/<[^>]*>?/gm, '');
                delete payload.parse_mode;
                payload.text = plainText;
                try {
                    const fallbackRes = await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
                    lastResult = fallbackRes.data?.result || null;
                } catch (fbErr) {
                    console.error('[TelegramBot] Error enviando mensaje plano fallback:', redactSecrets(fbErr.message));
                    return null;
                }
            } else {
                console.error('[TelegramBot] Error enviando mensaje a chat:', chatId, redactSecrets(err.message));
                return null;
            }
        }
    }

    return lastResult;
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
        return { ok: false, error: redactSecrets(err.message) };
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

    const safeCaption = caption ? String(caption).slice(0, 1020) : '';
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    if (safeCaption) {
        formData.append('caption', safeCaption);
        formData.append('parse_mode', 'HTML');
    }
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('document', blob, filename);

    // Propiedades descriptivas adjuntas para inspección y pruebas
    formData.chat_id = chatId;
    formData.caption = safeCaption;
    formData.parse_mode = 'HTML';
    formData.filename = filename;
    formData.fileBuffer = fileBuffer;

    try {
        const res = await axios.post(`${TELEGRAM_API_BASE}${token}/sendDocument`, formData, {
            timeout: 30000
        });
        return res.data?.result || res.data || null;
    } catch (err) {
        console.error('[TelegramBot] Error enviando documento a chat:', chatId, redactSecrets(err.message));
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
        console.warn('[TelegramBot] Error en answerCallbackQuery:', redactSecrets(err.message));
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
        console.warn('[TelegramBot] Error en editMessageReplyMarkup:', redactSecrets(err.message));
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
    redactSecrets,
    invalidateBotTokenCache,
    splitTelegramMessageChunks,
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
