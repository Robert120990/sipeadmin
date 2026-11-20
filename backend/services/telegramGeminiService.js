const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr
} = require('./telegramTextAndDates');

/**
 * Sanitizar y validar una clave de API de Gemini, descartando valores placeholder o malformados
 */
const sanitizeGeminiApiKey = (rawKey) => {
    if (!rawKey || typeof rawKey !== 'string') return null;
    let key = rawKey.trim()
        .replace(/^GEMINI_API_KEY\s*=\s*/i, '')
        .replace(/^GOOGLE_API_KEY\s*=\s*/i, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();

    if (!key || key.length < 10) return null;

    const lower = key.toLowerCase();
    if (
        lower === 'your_gemini_api_key_here' ||
        lower === 'your_api_key_here' ||
        lower === 'tu_api_key_aqui' ||
        lower === 'tu_gemini_api_key' ||
        lower === 'placeholder' ||
        lower === 'null' ||
        lower === 'undefined' ||
        lower === 'none' ||
        lower.startsWith('your_') ||
        lower.includes('api_key_here') ||
        lower.includes('tu_clave_aqui')
    ) {
        return null;
    }

    return key;
};

const ensuredTelegramSchemaPools = new WeakSet();

/**
 * Asegurar que la tabla telegram_config tenga las columnas necesarias en MySQL 8.0+
 * (Auto-reparación en caliente si la migración previa falló por sintaxis IF NOT EXISTS de MariaDB)
 */
const ensureTelegramConfigSchema = async (db) => {
    if (!db || typeof db.query !== 'function') return;
    if (ensuredTelegramSchemaPools.has(db)) return;
    ensuredTelegramSchemaPools.add(db);

    try {
        await db.query("ALTER TABLE telegram_config MODIFY COLUMN bot_token VARCHAR(255) NOT NULL DEFAULT ''");
    } catch (_) {
        // Ignorar si ya está aplicado o es un mock de test
    }
    try {
        await db.query('ALTER TABLE telegram_config ADD COLUMN gemini_api_key VARCHAR(255) NULL');
    } catch (_) {
        // Ignorar ER_DUP_FIELDNAME (1060) si la columna ya existe
    }
    try {
        await db.query('ALTER TABLE telegram_config ADD COLUMN openclaw_url VARCHAR(255) NULL');
    } catch (_) {
        // Ignorar ER_DUP_FIELDNAME (1060) si la columna ya existe
    }
};

const isRunningNodeTests = () => {
    return Boolean(
        process.env.NODE_TEST_CONTEXT ||
        (Array.isArray(process.execArgv) && process.execArgv.some(arg => String(arg).includes('--test'))) ||
        (Array.isArray(process.argv) && process.argv.some(arg => String(arg).includes('.test.js')))
    );
};

let cachedSiblingEnvKeys = null;

/**
 * Buscar claves de Gemini configuradas en servicios hermanos del mismo VPS (ej. SIPEWEBgas / nova-saas)
 */
const getSiblingEnvGeminiKeys = () => {
    if (isRunningNodeTests()) return [];
    if (Array.isArray(cachedSiblingEnvKeys)) return cachedSiblingEnvKeys;

    const foundKeys = [];
    try {
        const fs = require('fs');
        const path = require('path');
        const candidatePaths = [
            path.resolve(__dirname, '../.env'),
            '/opt/nova-saas/server/.env',
            '/var/www/SIPEWEBgas/server/.env',
            '/var/www/nova-saas/server/.env',
            '/home/sistemas/SIPEWEBgas/server/.env',
            '/var/www/sipeadmin/backend/.env',
            '/home/sistemas/sipeadmin/backend/.env'
        ];

        for (const envPath of candidatePaths) {
            try {
                if (!fs.existsSync(envPath)) continue;
                const content = fs.readFileSync(envPath, 'utf8');
                const lines = content.split(/\r?\n/);
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) continue;
                    const match = trimmed.match(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.+)$/i);
                    if (match && match[1]) {
                        const clean = sanitizeGeminiApiKey(match[1]);
                        if (clean && !foundKeys.includes(clean)) {
                            foundKeys.push(clean);
                        }
                    }
                }
            } catch (_) {
                // Ignorar archivos sin permisos de lectura
            }
        }
    } catch (_) {
        // Ignorar errores de FS
    }

    cachedSiblingEnvKeys = foundKeys;
    return foundKeys;
};

/**
 * Actualizar la clave de Gemini en memoria del proceso cuando se guarda desde la UI
 */
const setRuntimeGeminiApiKey = (rawKey) => {
    const clean = sanitizeGeminiApiKey(rawKey);
    if (clean && !isRunningNodeTests()) {
        process.env.GEMINI_API_KEY = clean;
    }
    return clean;
};

/**
 * Obtener lista priorizada de claves candidatas de Gemini API
 * (1. Base de datos telegram_config, 2. Variables de entorno, 3. Servicios hermanos en VPS)
 */
const getGeminiApiKeyCandidates = async () => {
    const candidates = [];
    const addCandidate = (raw) => {
        const clean = sanitizeGeminiApiKey(raw);
        if (clean && !candidates.includes(clean)) {
            candidates.push(clean);
        }
    };

    try {
        const db = getDb();
        if (db && typeof db.query === 'function') {
            try {
                const [rows] = await db.query('SELECT gemini_api_key FROM telegram_config WHERE id = 1 LIMIT 1');
                if (rows && rows.length > 0 && rows[0].gemini_api_key) {
                    addCandidate(rows[0].gemini_api_key);
                }
            } catch (dbErr) {
                if (dbErr && (dbErr.code === 'ER_BAD_FIELD_ERROR' || String(dbErr.message || '').includes('gemini_api_key'))) {
                    await ensureTelegramConfigSchema(db);
                }
            }
        }
    } catch (_) {
        // Base de datos ocupada o no disponible en pruebas
    }

    addCandidate(process.env.GEMINI_API_KEY);
    addCandidate(process.env.GOOGLE_API_KEY);

    for (const siblingKey of getSiblingEnvGeminiKeys()) {
        addCandidate(siblingKey);
    }

    return candidates;
};

/**
 * Obtener clave principal de Gemini API (desde tabla telegram_config, variable de entorno o fallback VPS)
 */
const getGeminiApiKey = async () => {
    const candidates = await getGeminiApiKeyCandidates();
    return candidates.length > 0 ? candidates[0] : null;
};

/**
 * Sanitizar el tipo MIME de audio para la API de Gemini
 * Telegram envía notas de voz con parámetros como 'audio/ogg; codecs=opus', 'audio/oga' o 'audio/opus'
 * Gemini API requiere un MIME type estricto y limpio sin parámetros (ej. 'audio/ogg', 'audio/mp3')
 */
const sanitizeAudioMimeType = (rawMime = '') => {
    let clean = (rawMime || 'audio/ogg').split(';')[0].trim().toLowerCase();
    if (clean === 'audio/oga' || clean === 'audio/opus' || clean === 'audio/x-opus') {
        clean = 'audio/ogg';
    }
    if (clean === 'audio/mp4' || clean === 'audio/m4a' || clean === 'audio/x-m4a') {
        clean = 'audio/mp4';
    }
    if (clean === 'audio/mpeg' || clean === 'audio/mp3') {
        clean = 'audio/mp3';
    }
    if (clean === 'audio/wav' || clean === 'audio/x-wav') {
        clean = 'audio/wav';
    }
    return clean || 'audio/ogg';
};

const GEMINI_FALLBACK_MODELS = [
    'gemini-3.8-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-flash'
];

const isGeminiApiKeyInvalidError = (err) => {
    const msg = String(err?.message || err || '');
    return /(API_KEY_INVALID|API key not valid|API key expired|INVALID_ARGUMENT.*API key|key not valid)/i.test(msg);
};

/**
 * Consulta con Gemini API (GenAI) si está configurado en el servidor
 */
const askGeminiAssistant = async (prompt, dataContext) => {
    const candidates = await getGeminiApiKeyCandidates();
    if (candidates.length === 0) return null;

    const { GoogleGenAI } = require('@google/genai');
    const systemInstruction = `Eres el asistente gerencial de SIPE Admin para estaciones de servicio de combustible en El Salvador.
Responde de forma ejecutiva, concisa, cálida y directa en español salvadoreño formal.
Usa viñetas limpias y negritas en HTML para Telegram (<b>texto</b>, <code>código</code>).
Si te preguntan comparaciones o análisis, apóyate en el contexto de datos reales proporcionado.`;

    for (const apiKey of candidates) {
        const ai = new GoogleGenAI({ apiKey });
        for (const modelName of GEMINI_FALLBACK_MODELS) {
            try {
                const result = await ai.models.generateContent({
                    model: modelName,
                    contents: [{
                        role: 'user',
                        parts: [{ text: `CONTEXTO OPERATIVO REAL: ${JSON.stringify(dataContext)}\n\nPREGUNTA DEL USUARIO: ${prompt}` }]
                    }],
                    config: { systemInstruction }
                });

                const reply = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;
                if (reply) return reply.trim();
            } catch (e) {
                console.warn(`[TelegramBot] Gemini fallback error (${modelName}):`, e.message);
                if (isGeminiApiKeyInvalidError(e)) break;
            }
        }
    }
    return null;
};

/**
 * Transcribir nota de voz de Telegram a texto utilizando Gemini (@google/genai)
 * Soporta rotación automática de claves candidatas y modelos de respaldo
 */
const transcribeTelegramVoice = async (audioBuffer, mimeType = 'audio/ogg') => {
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
        throw new Error('Buffer de audio inválido o vacío');
    }

    const candidates = await getGeminiApiKeyCandidates();
    if (candidates.length === 0) {
        throw new Error('GEMINI_API_KEY no configurado en el servidor ni en telegram_config');
    }

    const { GoogleGenAI } = require('@google/genai');
    const cleanMime = sanitizeAudioMimeType(mimeType);
    const base64Audio = audioBuffer.toString('base64');
    const prompt = 'Transcribe exactamente el siguiente mensaje de voz en español salvadoreño formal, sin añadir notas explicativas, etiquetas ni comentarios adicionales, únicamente el texto que dijo el usuario.';

    let lastErr = null;
    for (const apiKey of candidates) {
        const ai = new GoogleGenAI({ apiKey });
        for (const modelName of GEMINI_FALLBACK_MODELS) {
            try {
                const payload = {
                    model: modelName,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: cleanMime,
                                        data: base64Audio
                                    }
                                }
                            ]
                        }
                    ]
                };
                const response = await ai.models.generateContent(payload);
                const text = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
                return text ? text.trim() : '';
            } catch (err) {
                lastErr = err;
                console.warn(`[TelegramBot] Fallo transcripción con ${modelName}:`, err.message);
                if (isGeminiApiKeyInvalidError(err)) {
                    break;
                }
            }
        }
    }

    throw lastErr || new Error('No fue posible transcribir la nota de voz con Gemini API');
};

/**
 * Analizar imagen de comprobante bancario, remesa, cheque o factura mediante Gemini Vision OCR
 */
const analyzeTelegramImageReceipt = async (imageBuffer, mimeType = 'image/jpeg', caption = '') => {
    if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
        throw new Error('Buffer de imagen inválido o vacío');
    }

    const candidates = await getGeminiApiKeyCandidates();
    if (candidates.length === 0) {
        throw new Error('GEMINI_API_KEY no configurado en el servidor ni en telegram_config');
    }

    const { GoogleGenAI } = require('@google/genai');
    const cleanImageMime = ((mimeType || 'image/jpeg').split(';')[0].trim().toLowerCase()) || 'image/jpeg';
    const base64Image = imageBuffer.toString('base64');

    const prompt = `Analiza la siguiente imagen de un comprobante bancario, transferencia, remesa, cheque o factura comercial de El Salvador.${caption ? ` Nota del usuario: "${caption}".` : ''}
Extrae los datos y responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura exacta:
{
  "tipo_documento": "Comprobante de Transferencia | Remesa Bancaria | Cheque | Factura Comercial | Comprobante Fiscal | Recibo",
  "banco": "Nombre del banco o institución emisora",
  "monto_usd": 0.00,
  "fecha": "YYYY-MM-DD",
  "referencia": "Número de referencia, autorización o documento",
  "cuenta_destino": "Número de cuenta destino o referencia de cuenta",
  "beneficiario": "Nombre del beneficiario, proveedor o empresa",
  "concepto": "Concepto o descripción de la transacción",
  "observaciones": "Observación ejecutiva breve sobre la validez y legibilidad del documento"
}`;

    let response = null;
    let lastErr = null;
    for (const apiKey of candidates) {
        const ai = new GoogleGenAI({ apiKey });
        for (const modelName of GEMINI_FALLBACK_MODELS) {
            try {
                const payload = {
                    model: modelName,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType: cleanImageMime,
                                        data: base64Image
                                    }
                                }
                            ]
                        }
                    ]
                };
                response = await ai.models.generateContent(payload);
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                console.warn(`[TelegramBot] Fallo análisis de imagen con ${modelName}:`, err.message);
                if (isGeminiApiKeyInvalidError(err)) {
                    break;
                }
            }
        }
        if (response) break;
    }

    if (!response) {
        throw lastErr || new Error('No fue posible analizar la imagen con Gemini Vision');
    }

    const rawReply = (response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    const cleanedJsonStr = rawReply
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    let parsedObj = null;
    try {
        parsedObj = JSON.parse(cleanedJsonStr);
    } catch (_) {
        const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                parsedObj = JSON.parse(jsonMatch[0]);
            } catch (_e) {
                parsedObj = null;
            }
        }
    }

    if (!parsedObj || typeof parsedObj !== 'object') {
        return {
            tipo_documento: 'Comprobante / Documento',
            banco: 'No especificado',
            monto_usd: 0,
            fecha: getDateStr(0),
            referencia: 'S/N',
            cuenta_destino: '',
            beneficiario: '',
            concepto: caption || 'Documento procesado por IA',
            observaciones: rawReply || 'Imagen analizada sin estructura JSON estándar'
        };
    }

    const rawMonto = parsedObj.monto_usd ?? parsedObj.monto ?? 0;
    const cleanMonto = typeof rawMonto === 'number'
        ? rawMonto
        : Number(String(rawMonto).replace(/[^0-9.-]+/g, '')) || 0;

    return {
        tipo_documento: parsedObj.tipo_documento || 'Comprobante Bancario',
        banco: parsedObj.banco || 'No especificado',
        monto_usd: cleanMonto,
        fecha: parsedObj.fecha || getDateStr(0),
        referencia: parsedObj.referencia ? String(parsedObj.referencia).trim() : '',
        cuenta_destino: parsedObj.cuenta_destino || '',
        beneficiario: parsedObj.beneficiario || '',
        concepto: parsedObj.concepto || caption || '',
        observaciones: parsedObj.observaciones || ''
    };
};

/**
 * Verificar si un comprobante extraído por OCR ya existe registrado en movimientos_bancarios de SIPE Admin
 */
const verifyReceiptInBankMovements = async ({ monto_usd, referencia, fecha } = {}) => {
    try {
        const db = getDb();
        if (!db || typeof db.query !== 'function') {
            return { checked: false, found: false, movement: null };
        }

        const cleanRef = referencia && referencia !== 'S/N' ? String(referencia).trim() : '';
        const numMonto = Number(monto_usd || 0);

        if (!cleanRef && numMonto <= 0) {
            return { checked: true, found: false, movement: null };
        }

        let rows = [];
        try {
            const [resRows] = await db.query(
                `SELECT m.*, c.nombre as cuenta_nombre, c.numero as cuenta_numero, b.descripcion as banco_nombre
                 FROM movimientos_bancarios m
                 LEFT JOIN cuentas_bancarias c ON m.cuenta_bancaria_id = c.id
                 LEFT JOIN bancos b ON c.banco_id = b.id
                 WHERE (
                     (? != '' AND (m.referencia = ? OR m.concepto LIKE ?))
                     OR (? > 0 AND (ABS(COALESCE(m.abono, 0) - ?) < 0.05 OR ABS(COALESCE(m.cargo, 0) - ?) < 0.05))
                 )
                 ORDER BY m.fecha DESC, m.id DESC
                 LIMIT 1`,
                [cleanRef, cleanRef, `%${cleanRef}%`, numMonto, numMonto, numMonto]
            );
            rows = resRows || [];
        } catch (_) {
            const [fallbackRows] = await db.query(
                'SELECT * FROM movimientos_bancarios WHERE referencia = ? LIMIT 1',
                [cleanRef || '___NONE___']
            );
            rows = fallbackRows || [];
        }

        if (rows && rows.length > 0) {
            return {
                checked: true,
                found: true,
                movement: rows[0],
                fecha_consulta: fecha || null
            };
        }

        return { checked: true, found: false, movement: null };
    } catch (err) {
        console.warn('[TelegramBot] Error verificando comprobante en movimientos_bancarios:', err.message);
        return { checked: false, found: false, movement: null };
    }
};

/**
 * Formatear en HTML ejecutivo el resultado del análisis OCR del comprobante y su conciliación en SIPE
 */
const formatReceiptAnalysisMessage = (analysis = {}, verification = null) => {
    const tipoDoc = escapeHtml(analysis.tipo_documento || 'Comprobante Bancario / Factura');
    const banco = escapeHtml(analysis.banco || 'No especificado');
    const monto = Number(analysis.monto_usd || 0);
    const fechaStr = analysis.fecha ? toDisplayDate(analysis.fecha) : 'No especificada';
    const refStr = escapeHtml(analysis.referencia || 'S/N');

    let msg = `📸 <b>ANÁLISIS DE COMPROBANTE / DOCUMENTO (IA VISION)</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `🧾 <b>Tipo de Documento:</b> <b>${tipoDoc}</b>\n`;
    msg += `🏦 <b>Banco / Emisor:</b> ${banco}\n`;
    msg += `💵 <b>Monto Detectado:</b> <b>${moneyFmt(monto)}</b>\n`;
    msg += `📅 <b>Fecha Operación:</b> <code>${escapeHtml(fechaStr)}</code>\n`;
    msg += `🧾 <b>Referencia / Doc:</b> <code>${refStr}</code>\n`;

    if (analysis.cuenta_destino) {
        msg += `🏦 <b>Cuenta Destino:</b> <code>${escapeHtml(analysis.cuenta_destino)}</code>\n`;
    }
    if (analysis.beneficiario) {
        msg += `👤 <b>Beneficiario / Proveedor:</b> ${escapeHtml(analysis.beneficiario)}\n`;
    }
    if (analysis.concepto) {
        msg += `📝 <b>Concepto:</b> ${escapeHtml(analysis.concepto)}\n`;
    }
    if (analysis.observaciones) {
        msg += `💡 <b>Observaciones IA:</b> <i>${escapeHtml(analysis.observaciones)}</i>\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🔎 <b>VERIFICACIÓN EN TESORERÍA (SIPE ADMIN):</b>\n`;

    if (verification && verification.found && verification.movement) {
        const mov = verification.movement;
        const movMonto = Number(mov.abono || mov.cargo || mov.monto || monto);
        const movCuenta = escapeHtml(mov.cuenta_nombre || mov.cuenta_numero || mov.banco_nombre || 'Cuenta Bancaria SIPE');
        const movRef = escapeHtml(mov.referencia || mov.documento || analysis.referencia || 'S/N');
        msg += `✅ <b>Estado:</b> <b>CONCILIADO / REGISTRADO EN MOVIMIENTOS BANCARIOS</b>\n`;
        msg += `   • <b>Cuenta:</b> ${movCuenta}\n`;
        msg += `   • <b>Referencia en Libros:</b> <code>${movRef}</code>\n`;
        msg += `   • <b>Importe Registrado:</b> <code>${moneyFmt(movMonto)}</code>\n`;
    } else {
        msg += `⚠️ <b>Estado:</b> <b>PENDIENTE DE REGISTRO / NO ENCONTRADO EN LIBROS</b>\n`;
        msg += `   • No se localizó coincidencia en <code>movimientos_bancarios</code> para la referencia <code>${refStr}</code>.\n`;
        msg += `   • <i>Acción sugerida:</i> Verificar aplicación en el módulo de <b>Bancos &gt; Movimientos Bancarios</b> de SIPE Admin.\n`;
    }

    msg += `\n<i>SIPE Admin • Auditoría Inteligente por Visión Artificial</i>`;
    return msg;
};

module.exports = {
    sanitizeGeminiApiKey,
    ensureTelegramConfigSchema,
    getSiblingEnvGeminiKeys,
    setRuntimeGeminiApiKey,
    getGeminiApiKeyCandidates,
    getGeminiApiKey,
    sanitizeAudioMimeType,
    GEMINI_FALLBACK_MODELS,
    isGeminiApiKeyInvalidError,
    askGeminiAssistant,
    transcribeTelegramVoice,
    analyzeTelegramImageReceipt,
    verifyReceiptInBankMovements,
    formatReceiptAnalysisMessage
};
