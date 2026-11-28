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
 * Teclado interactivo principal para Telegram (no persistente para no ocupar pantalla fija)
 */
const getMainReplyKeyboard = () => {
    return {
        keyboard: [
            [{ text: '⛽ Ventas de Hoy' }, { text: '⛽ Ventas de Ayer' }],
            [{ text: '📊 Precios Competencia' }, { text: '🚨 Alertas en Estaciones' }],
            [{ text: '🏦 Saldo en Banco' }, { text: '🧾 Saldo en Chequera' }],
            [{ text: '☀️ Paneles Solares' }, { text: '🏛️ Andelsa (sys)' }],
            [{ text: '📋 Tareas & Agenda' }, { text: '💳 Control de Pagos' }],
            [{ text: 'ℹ️ Mi Perfil' }, { text: '❓ Ayuda' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
        is_persistent: false
    };
};

/**
 * Oculta/remueve el teclado fijo inferior en el cliente de Telegram del usuario
 */
const getHideReplyKeyboard = () => ({
    remove_keyboard: true
});

/**
 * Menú principal interactivo en pantalla dentro de la conversación (Inline Keyboard)
 * con botón para ocultar/colapsar el menú sin ocupar el teclado inferior.
 */
const getMainInlineMenuMarkup = () => ({
    inline_keyboard: [
        [
            { text: '⛽ Ventas de Hoy', callback_data: 'menu_act:ventas_hoy' },
            { text: '⛽ Ventas de Ayer', callback_data: 'menu_act:ventas_ayer' }
        ],
        [
            { text: '📊 Precios Competencia', callback_data: 'menu_act:competencia' },
            { text: '🚨 Alertas en Estaciones', callback_data: 'menu_act:alertas' }
        ],
        [
            { text: '🏦 Saldo en Banco', callback_data: 'menu_act:bancos' },
            { text: '🧾 Saldo en Chequera', callback_data: 'menu_act:chequera' }
        ],
        [
            { text: '☀️ Paneles Solares', callback_data: 'menu_act:solar' },
            { text: '🏛️ Andelsa (sys)', callback_data: 'menu_act:andelsa' }
        ],
        [
            { text: '📋 Tareas & Agenda', callback_data: 'menu_act:tareas' },
            { text: '💳 Control de Pagos', callback_data: 'menu_act:pagos' }
        ],
        [
            { text: 'ℹ️ Mi Perfil', callback_data: 'menu_act:perfil' },
            { text: '❓ Ayuda', callback_data: 'menu_act:ayuda' }
        ],
        [
            { text: '🙈 Ocultar menú', callback_data: 'menu_act:hide' }
        ]
    ]
});

/**
 * Estado colapsado del menú inline dentro de la conversación (1 botón discreto para volver a mostrarlo)
 */
const getCollapsedInlineMenuMarkup = () => ({
    inline_keyboard: [
        [{ text: '📋 Mostrar menú', callback_data: 'menu_act:show' }]
    ]
});

/**
 * Registra la lista oficial de comandos slash (/) en Telegram Bot API (best-effort)
 */
const setTelegramBotCommands = async (commands = []) => {
    try {
        const { token } = await getBotToken();
        if (!token || !Array.isArray(commands) || commands.length === 0) return false;
        await axios.post(`${TELEGRAM_API_BASE}${token}/setMyCommands`, { commands }, { timeout: 10000 });
        return true;
    } catch (err) {
        console.warn('[TelegramBot] Aviso registrando setMyCommands:', redactSecrets(err.message));
        return false;
    }
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
 * Enviar mensaje a un chat de Telegram retornando detalle de resultado/error
 * (con fragmentación automática <= 4000 chars y fallback seguro a texto plano).
 */
const sendTelegramMessageDetailed = async (chatId, text, replyMarkup = null) => {
    const { token, isActive } = await getBotToken();
    if (!token) {
        return {
            ok: false,
            result: null,
            error: isActive === false
                ? 'El bot de Telegram está desactivado en Configuración de Telegram.'
                : 'Token de Telegram no configurado en el servidor.',
            statusCode: null
        };
    }

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
            const tgDescription = err.response?.data?.description ? String(err.response.data.description) : '';
            const statusCode = err.response?.status || null;
            if (tgDescription.includes('can\'t parse entities')) {
                const plainText = chunkText.replace(/<[^>]*>?/gm, '');
                delete payload.parse_mode;
                payload.text = plainText;
                try {
                    const fallbackRes = await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
                    lastResult = fallbackRes.data?.result || null;
                } catch (fbErr) {
                    const fbDesc = fbErr.response?.data?.description || redactSecrets(fbErr.message);
                    console.error('[TelegramBot] Error enviando mensaje plano fallback:', redactSecrets(fbDesc));
                    return {
                        ok: false,
                        result: null,
                        error: redactSecrets(fbDesc),
                        statusCode: fbErr.response?.status || null
                    };
                }
            } else {
                const detailErr = tgDescription || redactSecrets(err.message);
                console.error('[TelegramBot] Error enviando mensaje a chat:', chatId, redactSecrets(detailErr));
                return {
                    ok: false,
                    result: null,
                    error: redactSecrets(detailErr),
                    statusCode
                };
            }
        }
    }

    return { ok: Boolean(lastResult), result: lastResult, error: null, statusCode: 200 };
};

/**
 * Enviar mensaje a un chat de Telegram (con fragmentación automática <= 4000 chars y fallback seguro)
 */
const sendTelegramMessage = async (chatId, text, replyMarkup = null) => {
    const detailed = await sendTelegramMessageDetailed(chatId, text, replyMarkup);
    return detailed.ok ? detailed.result : null;
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
 * Detecta el MIME type de una imagen por extensión o firma mágica (soporta WebP, GIF, JPEG, PNG)
 */
const detectImageMimeType = (filename = '', buffer = null) => {
    const ext = String(filename || '').trim().toLowerCase();
    if (ext.endsWith('.webp')) return 'image/webp';
    if (ext.endsWith('.gif')) return 'image/gif';
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg';
    if (ext.endsWith('.png')) return 'image/png';

    if (Buffer.isBuffer(buffer) && buffer.length >= 12) {
        if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
            return 'image/webp';
        }
        const head6 = buffer.subarray(0, 6).toString('ascii');
        if (head6 === 'GIF87a' || head6 === 'GIF89a') {
            return 'image/gif';
        }
    }
    if (Buffer.isBuffer(buffer) && buffer.length >= 4) {
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            return 'image/png';
        }
        if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
            return 'image/jpeg';
        }
    }
    return 'image/png';
};

/**
 * Detecta el MIME type de un documento por extensión o firma mágica
 */
const detectDocumentMimeType = (filename = '', buffer = null) => {
    const ext = String(filename || '').trim().toLowerCase();
    if (ext.endsWith('.pdf')) return 'application/pdf';
    if (ext.endsWith('.webp')) return 'image/webp';
    if (ext.endsWith('.gif')) return 'image/gif';
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg';
    if (ext.endsWith('.png')) return 'image/png';
    if (ext.endsWith('.txt')) return 'text/plain';
    if (ext.endsWith('.csv')) return 'text/csv';
    if (ext.endsWith('.json')) return 'application/json';
    if (ext.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext.endsWith('.zip')) return 'application/zip';

    if (Buffer.isBuffer(buffer) && buffer.length >= 5) {
        if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
        if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
            return 'image/webp';
        }
        const head6 = buffer.length >= 6 ? buffer.subarray(0, 6).toString('ascii') : '';
        if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'image/gif';
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'image/png';
        if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
    }
    return 'application/octet-stream';
};

/**
 * Trunca un caption de Telegram a <= 1020 chars evitando cortar a mitad de una etiqueta HTML
 */
const truncateTelegramCaption = (caption = '', maxLen = 1020) => {
    if (!caption) return '';
    const str = String(caption);
    const safeMax = Math.max(1, Math.min(1024, Number(maxLen) || 1020));
    if (str.length <= safeMax) return str;

    let cut = str.slice(0, safeMax);
    let closingSuffix = '';
    const tagRegex = /<\/?([a-zA-Z0-9-]+)(?:\s[^>]*)?>/g;
    const entityAtStartRegex = /^&(?:[a-zA-Z]{2,10}|#\d{1,7}|#x[0-9a-fA-F]{1,6});/;

    // Bucle acotado: cut solo decrece hasta caber junto con todas las etiquetas de cierre pendientes
    for (let iter = 0; iter <= safeMax; iter += 1) {
        const lastOpen = cut.lastIndexOf('<');
        const lastClose = cut.lastIndexOf('>');
        if (lastOpen > lastClose) {
            cut = cut.slice(0, lastOpen);
        }

        // Evitar partir entidades HTML (&amp;, &lt;, &#123;, etc.) al final del corte
        const lastAmp = cut.lastIndexOf('&');
        if (lastAmp !== -1 && !cut.slice(lastAmp).includes(';')) {
            const entityMatch = entityAtStartRegex.exec(str.slice(lastAmp));
            if (entityMatch && lastAmp + entityMatch[0].length > cut.length) {
                cut = cut.slice(0, lastAmp);
            }
        }

        const tagStack = [];
        tagRegex.lastIndex = 0;
        let m;
        while ((m = tagRegex.exec(cut)) !== null) {
            const full = m[0];
            const tagName = m[1].toLowerCase();
            if (full.startsWith('</')) {
                const idx = tagStack.lastIndexOf(tagName);
                if (idx !== -1) tagStack.splice(idx, 1);
            } else if (!full.endsWith('/>')) {
                tagStack.push(tagName);
            }
        }

        closingSuffix = tagStack.slice().reverse().map((t) => `</${t}>`).join('');
        if (cut.length + closingSuffix.length <= safeMax) {
            break;
        }

        const nextLen = Math.max(0, safeMax - closingSuffix.length);
        if (nextLen >= cut.length) {
            cut = cut.slice(0, Math.max(0, cut.length - 1));
        } else {
            cut = cut.slice(0, nextLen);
        }
    }

    if (!closingSuffix) {
        return cut.trimEnd();
    }
    return `${cut.trimEnd()}${closingSuffix}`;
};

/**
 * Enviar un documento (ej. reporte PDF tamaño Carta o adjunto) a un chat de Telegram
 */
const sendTelegramDocument = async (chatId, fileBuffer, filename = 'Reporte_SIPE.pdf', caption = '', replyMarkup = null) => {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
        throw new Error('Buffer de documento inválido o vacío');
    }

    const { token } = await getBotToken();
    if (!token) return null;

    const safeFilename = filename || 'Reporte_SIPE.pdf';
    const mimeType = detectDocumentMimeType(safeFilename, fileBuffer);
    const safeCaption = truncateTelegramCaption(caption, 1020);

    const buildForm = (useHtml) => {
        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        if (safeCaption) {
            const cap = useHtml ? safeCaption : safeCaption.replace(/<[^>]*>?/gm, '');
            formData.append('caption', cap);
            if (useHtml) formData.append('parse_mode', 'HTML');
        }
        if (replyMarkup && typeof replyMarkup === 'object') {
            formData.append('reply_markup', JSON.stringify(replyMarkup));
        }
        const blob = new Blob([fileBuffer], { type: mimeType });
        formData.append('document', blob, safeFilename);

        // Propiedades descriptivas adjuntas para inspección y pruebas
        formData.chat_id = chatId;
        formData.caption = safeCaption;
        formData.parse_mode = useHtml ? 'HTML' : null;
        formData.filename = safeFilename;
        formData.mimeType = mimeType;
        formData.fileBuffer = fileBuffer;
        formData.reply_markup = replyMarkup || null;
        return formData;
    };

    try {
        const res = await axios.post(`${TELEGRAM_API_BASE}${token}/sendDocument`, buildForm(true), {
            timeout: 30000
        });
        return res.data?.result || res.data || null;
    } catch (err) {
        if (err.response?.data?.description?.includes("can't parse entities") && safeCaption) {
            try {
                const fbRes = await axios.post(`${TELEGRAM_API_BASE}${token}/sendDocument`, buildForm(false), {
                    timeout: 30000
                });
                return fbRes.data?.result || fbRes.data || null;
            } catch (fbErr) {
                console.error('[TelegramBot] Error enviando documento fallback:', redactSecrets(fbErr.message));
                return null;
            }
        }
        console.error('[TelegramBot] Error enviando documento a chat:', chatId, redactSecrets(err.message));
        return null;
    }
};

/**
 * Enviar una imagen (WebP/PNG/JPEG/GIF, ej. capturas o gráficas ejecutivas) a un chat de Telegram
 */
const sendTelegramPhoto = async (chatId, imageBuffer, caption = '', replyMarkup = null, filename = 'Grafica_SIPE.png') => {
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        throw new Error('Buffer de imagen inválido o vacío');
    }

    const { token } = await getBotToken();
    if (!token) return null;

    const safeFilename = filename || 'Grafica_SIPE.png';
    const mimeType = detectImageMimeType(safeFilename, imageBuffer);
    const safeCaption = truncateTelegramCaption(caption, 1020);

    const buildForm = (useHtml) => {
        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        if (safeCaption) {
            const cap = useHtml ? safeCaption : safeCaption.replace(/<[^>]*>?/gm, '');
            formData.append('caption', cap);
            if (useHtml) formData.append('parse_mode', 'HTML');
        }
        if (replyMarkup && typeof replyMarkup === 'object') {
            formData.append('reply_markup', JSON.stringify(replyMarkup));
        }
        const blob = new Blob([imageBuffer], { type: mimeType });
        formData.append('photo', blob, safeFilename);

        formData.chat_id = chatId;
        formData.caption = safeCaption;
        formData.parse_mode = useHtml ? 'HTML' : null;
        formData.filename = safeFilename;
        formData.mimeType = mimeType;
        formData.fileBuffer = imageBuffer;
        formData.reply_markup = replyMarkup || null;
        return formData;
    };

    try {
        const res = await axios.post(`${TELEGRAM_API_BASE}${token}/sendPhoto`, buildForm(true), {
            timeout: 30000
        });
        return res.data?.result || res.data || null;
    } catch (err) {
        if (err.response?.data?.description?.includes("can't parse entities") && safeCaption) {
            try {
                const fbRes = await axios.post(`${TELEGRAM_API_BASE}${token}/sendPhoto`, buildForm(false), {
                    timeout: 30000
                });
                return fbRes.data?.result || fbRes.data || null;
            } catch (fbErr) {
                console.error('[TelegramBot] Error enviando foto fallback:', redactSecrets(fbErr.message));
                return null;
            }
        }
        console.error('[TelegramBot] Error enviando foto a chat:', chatId, redactSecrets(err.message));
        return null;
    }
};

/**
 * Enviar una nota de audio (WAV/MP3/OGG, ej. resumen ejecutivo TTS) a un chat de Telegram
 */
const sendTelegramAudio = async (chatId, audioBuffer, options = {}) => {
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
        throw new Error('Buffer de audio inválido o vacío');
    }

    const { token } = await getBotToken();
    if (!token) return null;

    const {
        caption = '',
        title = 'Resumen Ejecutivo SIPE',
        performer = 'SIPE Admin IA',
        filename = 'Resumen_SIPE.wav',
        mimeType = 'audio/wav',
        duration = null,
        replyMarkup = null
    } = options || {};

    const safeCaption = caption ? String(caption).slice(0, 1020) : '';
    const buildForm = (useHtml) => {
        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        if (safeCaption) {
            const cap = useHtml ? safeCaption : safeCaption.replace(/<[^>]*>?/gm, '');
            formData.append('caption', cap);
            if (useHtml) formData.append('parse_mode', 'HTML');
        }
        if (title) formData.append('title', String(title).slice(0, 120));
        if (performer) formData.append('performer', String(performer).slice(0, 120));
        const intDuration = parseInt(duration, 10);
        if (Number.isFinite(intDuration) && intDuration > 0) {
            formData.append('duration', String(intDuration));
        }
        if (replyMarkup && typeof replyMarkup === 'object') {
            formData.append('reply_markup', JSON.stringify(replyMarkup));
        }
        const blob = new Blob([audioBuffer], { type: mimeType || 'audio/wav' });
        formData.append('audio', blob, filename || 'Resumen_SIPE.wav');

        formData.chat_id = chatId;
        formData.caption = safeCaption;
        formData.title = title;
        formData.performer = performer;
        formData.filename = filename || 'Resumen_SIPE.wav';
        formData.mimeType = mimeType || 'audio/wav';
        formData.duration = Number.isFinite(intDuration) && intDuration > 0 ? intDuration : null;
        formData.fileBuffer = audioBuffer;
        formData.reply_markup = replyMarkup || null;
        return formData;
    };

    try {
        const res = await axios.post(`${TELEGRAM_API_BASE}${token}/sendAudio`, buildForm(true), {
            timeout: 45000
        });
        return res.data?.result || res.data || null;
    } catch (err) {
        if (err.response?.data?.description?.includes("can't parse entities") && safeCaption) {
            try {
                const fbRes = await axios.post(`${TELEGRAM_API_BASE}${token}/sendAudio`, buildForm(false), {
                    timeout: 45000
                });
                return fbRes.data?.result || fbRes.data || null;
            } catch (fbErr) {
                console.error('[TelegramBot] Error enviando audio fallback:', redactSecrets(fbErr.message));
                return null;
            }
        }
        console.error('[TelegramBot] Error enviando audio a chat:', chatId, redactSecrets(err.message));
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
    getHideReplyKeyboard,
    getMainInlineMenuMarkup,
    getCollapsedInlineMenuMarkup,
    testTelegramConnection,
    sendTelegramMessage,
    sendTelegramMessageDetailed,
    sendChatAction,
    detectImageMimeType,
    detectDocumentMimeType,
    truncateTelegramCaption,
    sendTelegramDocument,
    sendTelegramPhoto,
    sendTelegramAudio,
    setTelegramWebhook,
    deleteTelegramWebhook,
    getTelegramWebhookInfo,
    answerCallbackQuery,
    editMessageReplyMarkup,
    setTelegramBotCommands,
    getBotStatus
};
