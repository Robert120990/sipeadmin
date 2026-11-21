const fs = require('fs');
const zlib = require('zlib');
const solarEnergyService = require('./solarEnergyService');
const { getFlujoCajaProyectado } = require('./cashflowForecast');
const { getFlashEjecutivo } = require('./executiveFlashService');
const {
    getConsolidadoVentas,
    getSaldosBancosData,
    getPagosProgramadosData
} = require('./telegramDataService');
const {
    getGeminiApiKeyCandidates,
    isGeminiApiKeyInvalidError
} = require('./telegramGeminiService');
const {
    sendTelegramMessage,
    sendChatAction,
    sendTelegramPhoto,
    sendTelegramAudio
} = require('./telegramTransportService');
const {
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    getDateStr,
    normalizeText
} = require('./telegramTextAndDates');

const GEMINI_TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];

/**
 * Envuelve audio PCM crudo (ej. 24kHz mono 16-bit de Gemini TTS) en un encabezado RIFF/WAVE estándar.
 * Si el buffer ya incluye cabecera RIFF/WAVE válida, lo preserva sin duplicar encabezados.
 */
function ensureWavBuffer(rawBuffer, mimeType = 'audio/wav', defaultSampleRate = 24000, channels = 1, bitsPerSample = 16) {
    if (!rawBuffer || !Buffer.isBuffer(rawBuffer) || rawBuffer.length === 0) {
        throw new Error('Buffer de audio vacío');
    }

    const rateMatch = String(mimeType || '').match(/rate\s*=\s*(\d+)/i);
    const sampleRate = rateMatch ? (parseInt(rateMatch[1], 10) || defaultSampleRate) : defaultSampleRate;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);

    const isAlreadyWav = rawBuffer.length >= 12 &&
        rawBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        rawBuffer.subarray(8, 12).toString('ascii') === 'WAVE';

    if (isAlreadyWav) {
        const dataBytes = Math.max(0, rawBuffer.length - 44);
        const durationSeconds = Math.max(1, Math.round(dataBytes / Math.max(1, byteRate)));
        return {
            buffer: rawBuffer,
            mimeType: 'audio/wav',
            sampleRate,
            durationSeconds
        };
    }

    const header = Buffer.alloc(44);
    const blockAlign = channels * (bitsPerSample / 8);
    const dataSize = rawBuffer.length;

    header.write('RIFF', 0, 4, 'ascii');
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8, 4, 'ascii');
    header.write('fmt ', 12, 4, 'ascii');
    header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
    header.writeUInt16LE(1, 20);  // AudioFormat = 1 (PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36, 4, 'ascii');
    header.writeUInt32LE(dataSize, 40);

    const wavBuffer = Buffer.concat([header, rawBuffer]);
    const durationSeconds = Math.max(1, Math.round(dataSize / Math.max(1, byteRate)));

    return {
        buffer: wavBuffer,
        mimeType: 'audio/wav',
        sampleRate,
        durationSeconds
    };
}

function fmtUsdSpoken(val) {
    const n = Math.round(Number(val || 0));
    return `${n.toLocaleString('en-US')} dólares`;
}

/**
 * Redacta el guión hablado ejecutivo estrictamente acotado a los permisos del usuario.
 */
function buildExecutiveAudioScript({
    flashData = null,
    ventasData = null,
    bancosData = null,
    pagosData = null,
    effectivePerms = {},
    userName = 'Director',
    targetDate = null
} = {}) {
    const canVentas = Boolean(effectivePerms.ventas || effectivePerms.isAdmin);
    const canBancos = Boolean(effectivePerms.saldos_banco || effectivePerms.isAdmin);
    const canPagos = Boolean(effectivePerms.control_pagos || effectivePerms.saldos_banco || effectivePerms.isAdmin);
    const canAlertas = Boolean(effectivePerms.alertas || effectivePerms.ventas || effectivePerms.isAdmin);

    const fechaDisplay = toDisplayDate(targetDate || getDateStr(-1));
    const cleanName = String(userName || '').replace(/[^\p{L}\p{N}\s.-]/gu, '').trim() || 'estimado usuario';
    const parts = [
        `Buenos días, ${cleanName}. Este es tu resumen ejecutivo de SIPE Admin con corte al ${fechaDisplay}.`
    ];

    if (canVentas) {
        let totalGal = 0;
        let totalVta = 0;
        if (ventasData && Array.isArray(ventasData.estaciones)) {
            totalGal = ventasData.estaciones.reduce((s, e) => s + Number(e.galonaje || 0), 0);
            totalVta += ventasData.estaciones.reduce((s, e) => s + Number(e.venta || 0), 0);
            totalVta += (ventasData.tiendas || []).reduce((s, t) => s + Number(t.venta || 0), 0);
        } else if (flashData?.ventas_ayer) {
            totalGal = Number(flashData.ventas_ayer.total_galones || 0);
            totalVta = Number(flashData.ventas_ayer.total_dolares || 0);
        }
        parts.push(
            `En operaciones comerciales, la red registró ventas consolidadas de ${fmtUsdSpoken(totalVta)} con un despacho de ${Math.round(totalGal).toLocaleString('en-US')} galones.`
        );
    }

    if (canBancos && bancosData) {
        const totalB = Number(bancosData.total || 0);
        const cuentasCnt = Array.isArray(bancosData.cuentas) ? bancosData.cuentas.length : 0;
        parts.push(
            `En tesorería, el saldo disponible consolidado en bancos asciende a ${fmtUsdSpoken(totalB)} distribuidos en ${cuentasCnt} cuentas activas.`
        );
    }

    if (canPagos && pagosData) {
        const urgentes = Array.isArray(pagosData.vencidos_o_hoy) ? pagosData.vencidos_o_hoy.length : 0;
        const totalUrg = Number(pagosData.total_urgente_usd || 0);
        const totalPend = Number(pagosData.total_saldo_pendiente_usd || pagosData.total_pendiente_usd || 0);
        if (urgentes > 0) {
            parts.push(
                `En control de pagos hay ${urgentes} compromisos vencidos o para hoy por ${fmtUsdSpoken(totalUrg)}, de un saldo pendiente total de ${fmtUsdSpoken(totalPend)}.`
            );
        } else {
            parts.push(
                `En control de pagos no se registran compromisos vencidos para hoy; el saldo pendiente programado es de ${fmtUsdSpoken(totalPend)}.`
            );
        }
    }

    const tanquesCriticos = Number(
        flashData?.kpi?.emergencias_reales_count ??
        flashData?.kpi?.tanques_criticos_count ??
        flashData?.abastecimiento?.tanques_criticos ??
        0
    );
    if (canAlertas && tanquesCriticos > 0) {
        parts.push(
            `Atención operativa: se reportan ${tanquesCriticos} tanques en nivel crítico que requieren revisión de pedidos.`
        );
    }

    parts.push('Para más detalles gráficos o financieros puedes solicitar gráfica o flujo desde este chat.');

    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1100);
}

/**
 * Sintetiza audio WAV usando Gemini 3.8 Flash TTS (`@google/genai`).
 */
async function synthesizeSpeechWavWithGemini(scriptText, { voiceName = 'Kore' } = {}) {
    const cleanText = String(scriptText || '').trim();
    if (!cleanText) throw new Error('El texto del guión de audio está vacío');

    const candidates = await getGeminiApiKeyCandidates();
    if (!candidates || candidates.length === 0) {
        throw new Error('GEMINI_API_KEY no configurado para síntesis de voz');
    }

    const { GoogleGenAI } = require('@google/genai');
    let lastErr = null;

    for (const apiKey of candidates) {
        const ai = new GoogleGenAI({ apiKey });
        for (const modelName of GEMINI_TTS_MODELS) {
            try {
                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    text: `Lee el siguiente reporte ejecutivo en español con tono profesional, claro y pausado:\n\n${cleanText}`
                                }
                            ]
                        }
                    ],
                    config: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: { voiceName }
                            }
                        }
                    }
                });

                const parts = response?.candidates?.[0]?.content?.parts || [];
                const audioPart = parts.find(p => p?.inlineData?.data && String(p.inlineData.mimeType || '').startsWith('audio/')) ||
                    parts.find(p => p?.inlineData?.data);

                if (audioPart?.inlineData?.data) {
                    const rawBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
                    if (rawBuffer.length > 0) {
                        return ensureWavBuffer(rawBuffer, audioPart.inlineData.mimeType || 'audio/l16;codec=pcm;rate=24000');
                    }
                }
            } catch (err) {
                lastErr = err;
                console.warn(`[TelegramAudioTTS] Fallo modelo ${modelName}:`, err.message);
                if (isGeminiApiKeyInvalidError(err)) break;
            }
        }
    }

    throw lastErr || new Error('Gemini TTS no devolvió audio válido');
}

/**
 * Construye y envía el briefing ejecutivo en nota de audio (con fallback limpio a texto).
 */
async function buildAndSendExecutiveAudio({
    chatId,
    user = {},
    effectivePerms = {},
    targetDate = null,
    transport = {},
    synthesizeFn = null,
    dataProviders = {}
} = {}) {
    const sendMsgFn = transport.sendTelegramMessage || sendTelegramMessage;
    const sendActFn = transport.sendChatAction || sendChatAction;
    const sendAudioFn = transport.sendTelegramAudio || sendTelegramAudio;

    const canAny = Boolean(
        effectivePerms.isAdmin ||
        effectivePerms.ventas ||
        effectivePerms.saldos_banco ||
        effectivePerms.control_pagos ||
        effectivePerms.alertas
    );
    if (!canAny) {
        await sendMsgFn(chatId, '⚠️ No tienes permisos asignados para generar resúmenes ejecutivos.');
        return { ok: false, reason: 'forbidden' };
    }

    const effDate = targetDate || getDateStr(-1);
    const canVentas = Boolean(effectivePerms.ventas || effectivePerms.isAdmin);
    const canBancos = Boolean(effectivePerms.saldos_banco || effectivePerms.isAdmin);
    const canPagos = Boolean(effectivePerms.control_pagos || effectivePerms.saldos_banco || effectivePerms.isAdmin);
    const canFlash = Boolean(effectivePerms.ventas || effectivePerms.alertas || effectivePerms.isAdmin);

    sendActFn(chatId, 'upload_voice').catch(() => {});

    const fetchVentas = dataProviders.getConsolidadoVentas || getConsolidadoVentas;
    const fetchBancos = dataProviders.getSaldosBancosData || getSaldosBancosData;
    const fetchPagos = dataProviders.getPagosProgramadosData || getPagosProgramadosData;
    const fetchFlash = dataProviders.getFlashEjecutivo || getFlashEjecutivo;

    const [ventasRes, bancosRes, pagosRes, flashRes] = await Promise.allSettled([
        canVentas ? fetchVentas(effDate) : Promise.resolve(null),
        canBancos ? fetchBancos() : Promise.resolve(null),
        canPagos ? fetchPagos({ filterMode: 'resumen' }) : Promise.resolve(null),
        canFlash ? fetchFlash() : Promise.resolve(null)
    ]);

    const ventasData = ventasRes.status === 'fulfilled' ? ventasRes.value : null;
    const bancosData = bancosRes.status === 'fulfilled' ? bancosRes.value : null;
    const pagosData = pagosRes.status === 'fulfilled' ? pagosRes.value : null;
    const flashData = flashRes.status === 'fulfilled' ? flashRes.value : null;

    const userName = effectivePerms?.linkedUser?.nombre || user?.first_name || 'Director';
    const scriptText = buildExecutiveAudioScript({
        flashData,
        ventasData,
        bancosData,
        pagosData,
        effectivePerms,
        userName,
        targetDate: effDate
    });

    const quickMarkup = {
        inline_keyboard: [
            [
                ...(canVentas ? [{ text: '📊 Gráfica Ventas', callback_data: 'tg_chr:ventas' }] : []),
                ...(canBancos ? [{ text: '📈 Flujo 30d', callback_data: 'tg_fin:flujo:30' }] : []),
                ...((effectivePerms.alertas || canBancos || effectivePerms.isAdmin) ? [{ text: '🛡️ Centinela', callback_data: 'tg_sent:refresh' }] : [])
            ]
        ]
    };

    try {
        const ttsExecutor = synthesizeFn || synthesizeSpeechWavWithGemini;
        const wavResult = await ttsExecutor(scriptText);
        const caption = `🎧 <b>Resumen Ejecutivo SIPE</b> (${toDisplayDate(effDate)})\n<i>Generado con IA Gemini Voz</i>`;
        await sendAudioFn(chatId, wavResult.buffer, {
            caption,
            title: `Resumen Ejecutivo ${toDisplayDate(effDate)}`,
            performer: 'SIPE Admin IA',
            filename: `Resumen_Ejecutivo_SIPE_${effDate}.wav`,
            mimeType: 'audio/wav',
            duration: wavResult.durationSeconds,
            replyMarkup: quickMarkup.inline_keyboard[0].length > 0 ? quickMarkup : null
        });
        return { ok: true, mode: 'audio', durationSeconds: wavResult.durationSeconds, scriptText };
    } catch (ttsErr) {
        console.warn('[TelegramAudioTTS] Fallback a texto limpio:', ttsErr.message);
        const fallbackMsg = `🎧 <b>RESUMEN EJECUTIVO SIPE (${toDisplayDate(effDate)})</b>\n` +
            `<i>(Audio TTS temporalmente no disponible; resumen en texto)</i>\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `${escapeHtml(scriptText)}`;
        await sendMsgFn(chatId, fallbackMsg, quickMarkup.inline_keyboard[0].length > 0 ? quickMarkup : null);
        return { ok: true, mode: 'text_fallback', error: ttsErr.message, scriptText };
    }
}

// =========================================================================
// MOTOR DE GRÁFICAS VISUALES PNG (HTML/SVG → PUPPETEER RETINA O PNG PURO NODE)
// =========================================================================

const CHART_PALETTE = ['#38bdf8', '#22c55e', '#f59e0b', '#a855f7', '#fb7185', '#14b8a6', '#60a5fa'];

const BITMAP_FONT_5X7 = {
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
    '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
    '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
    '3': [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
    '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
    '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
    '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
    '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
    '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
    'A': [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    'B': [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
    'C': [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
    'D': [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
    'E': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
    'F': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
    'G': [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
    'H': [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    'I': [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
    'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
    'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
    'M': [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
    'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    'O': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    'P': [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
    'Q': [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
    'R': [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
    'S': [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
    'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
    'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
    'X': [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
    'Y': [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
    'Z': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
    '$': [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
    '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
    ',': [0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x08],
    ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
    '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
    '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
    '%': [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03],
    '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
    ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08]
};

function hexToRgba(hex, alpha = 255) {
    const clean = String(hex || '#38bdf8').replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) || 56;
    const g = parseInt(clean.slice(2, 4), 16) || 189;
    const b = parseInt(clean.slice(4, 6), 16) || 248;
    return [r, g, b, alpha];
}

let crcTable = null;
function crc32(buf) {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodeRgbaToPng(width, height, pixels) {
    const rawStride = 1 + width * 4;
    const raw = Buffer.alloc(rawStride * height);
    for (let y = 0; y < height; y++) {
        const rowStart = y * rawStride;
        raw[rowStart] = 0; // filter None
        pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const compressed = zlib.deflateSync(raw);
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return Buffer.concat([
        sig,
        makePngChunk('IHDR', ihdr),
        makePngChunk('IDAT', compressed),
        makePngChunk('IEND', Buffer.alloc(0))
    ]);
}

/**
 * Rasteriza una gráfica ejecutiva en PNG puro en Node.js (cero dependencias nativas).
 */
function renderFallbackChartPng(chartSpec = {}) {
    const width = 800;
    const height = 460;
    const pixels = Buffer.alloc(width * height * 4);

    const fillRect = (rx, ry, rw, rh, rgba) => {
        const x0 = Math.max(0, Math.floor(rx));
        const y0 = Math.max(0, Math.floor(ry));
        const x1 = Math.min(width, Math.floor(rx + rw));
        const y1 = Math.min(height, Math.floor(ry + rh));
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const idx = (y * width + x) * 4;
                pixels[idx] = rgba[0];
                pixels[idx + 1] = rgba[1];
                pixels[idx + 2] = rgba[2];
                pixels[idx + 3] = rgba[3];
            }
        }
    };

    const drawText = (text, startX, startY, scale, rgba) => {
        const ascii = normalizeText(String(text || '')).toUpperCase();
        let cursorX = startX;
        for (let i = 0; i < ascii.length; i++) {
            const ch = BITMAP_FONT_5X7[ascii[i]] || BITMAP_FONT_5X7[' '];
            for (let row = 0; row < 7; row++) {
                const bits = ch[row];
                for (let col = 0; col < 5; col++) {
                    if (bits & (1 << (4 - col))) {
                        fillRect(cursorX + col * scale, startY + row * scale, scale, scale, rgba);
                    }
                }
            }
            cursorX += 6 * scale;
            if (cursorX > width - 20) break;
        }
    };

    // Fondo oscuro ejecutivo
    fillRect(0, 0, width, height, [15, 23, 42, 255]);
    // Banda superior
    fillRect(0, 0, width, 74, [30, 41, 59, 255]);
    fillRect(0, 72, width, 2, [56, 189, 248, 255]);

    drawText(chartSpec.title || 'GRAFICA EJECUTIVA SIPE', 24, 18, 2, [248, 250, 252, 255]);
    drawText(chartSpec.subtitle || 'SIPE ADMIN', 24, 44, 1, [148, 163, 184, 255]);

    const items = Array.isArray(chartSpec.items) ? chartSpec.items.slice(0, 8) : [];
    const maxVal = Math.max(1, ...items.map(it => Math.abs(Number(it.value || 0))));

    let rowY = 104;
    const rowStep = items.length > 0 ? Math.min(44, Math.floor(310 / items.length)) : 40;
    const barAreaX = 250;
    const barMaxW = 390;

    if (items.length === 0) {
        drawText('SIN DATOS DISPONIBLES PARA EL PERIODO', 24, 140, 2, [148, 163, 184, 255]);
    } else {
        items.forEach((it, idx) => {
            const val = Number(it.value || 0);
            const barW = Math.max(4, Math.round((Math.abs(val) / maxVal) * barMaxW));
            const colorHex = it.color || CHART_PALETTE[idx % CHART_PALETTE.length];
            const rgba = hexToRgba(val < 0 ? '#ef4444' : colorHex);

            drawText(String(it.label || '').slice(0, 22), 24, rowY + 6, 1, [226, 232, 240, 255]);
            fillRect(barAreaX, rowY + 2, barMaxW, 18, [30, 41, 59, 255]);
            fillRect(barAreaX, rowY + 2, barW, 18, rgba);
            drawText(it.valueLabel || moneyFmt(val), barAreaX + barMaxW + 14, rowY + 6, 1, [248, 250, 252, 255]);

            rowY += rowStep;
        });
    }

    drawText('SIPE ADMIN - DIRECCION ESTRATEGICA', 24, height - 24, 1, [100, 116, 139, 255]);
    return encodeRgbaToPng(width, height, pixels);
}

/**
 * Construye el HTML5 + SVG ejecutivo autocontenido para rasterización Retina con Puppeteer.
 */
function buildChartSvgHtml(chartSpec = {}) {
    const title = escapeHtml(chartSpec.title || 'Gráfica Ejecutiva SIPE');
    const subtitle = escapeHtml(chartSpec.subtitle || 'SIPE Admin • Dirección Estratégica');
    const kpis = Array.isArray(chartSpec.kpis) ? chartSpec.kpis.slice(0, 3) : [];
    const items = Array.isArray(chartSpec.items) ? chartSpec.items.slice(0, 8) : [];
    const maxVal = Math.max(1, ...items.map(it => Math.abs(Number(it.value || 0))));

    const kpisHtml = kpis.map(k => `
        <div class="kpi">
            <div class="kpi-label">${escapeHtml(k.label || '')}</div>
            <div class="kpi-val">${escapeHtml(k.value || '')}</div>
        </div>
    `).join('');

    const svgRows = items.map((it, idx) => {
        const y = idx * 42 + 12;
        const val = Number(it.value || 0);
        const w = Math.max(8, Math.round((Math.abs(val) / maxVal) * 430));
        const fill = val < 0 ? '#ef4444' : (it.color || CHART_PALETTE[idx % CHART_PALETTE.length]);
        const label = escapeHtml(String(it.label || '').slice(0, 26));
        const valLabel = escapeHtml(it.valueLabel || moneyFmt(val));
        return `
            <g transform="translate(0, ${y})">
                <text x="0" y="18" fill="#e2e8f0" font-size="13" font-weight="600">${label}</text>
                <rect x="215" y="4" width="430" height="20" rx="6" fill="#1e293b"/>
                <rect x="215" y="4" width="${w}" height="20" rx="6" fill="${fill}"/>
                <text x="660" y="19" fill="#f8fafc" font-size="13" font-weight="700">${valLabel}</text>
            </g>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
  body { margin: 0; width: 960px; height: 560px; background: linear-gradient(135deg, #0f172a 0%, #172554 100%); color: #f8fafc; padding: 28px 34px; display: flex; flex-direction: column; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #38bdf8; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 11px; letter-spacing: 1.5px; color: #38bdf8; font-weight: 700; text-transform: uppercase; }
  .title { font-size: 22px; font-weight: 800; margin-top: 4px; color: #ffffff; }
  .subtitle { font-size: 13px; color: #94a3b8; margin-top: 2px; }
  .kpis { display: flex; gap: 12px; margin-bottom: 16px; }
  .kpi { flex: 1; background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 10px; padding: 10px 14px; }
  .kpi-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
  .kpi-val { font-size: 18px; font-weight: 800; color: #38bdf8; margin-top: 4px; }
  .chart-box { flex: 1; background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 12px; padding: 14px 18px; }
  .footer { margin-top: 10px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">SIPE Admin • Suite Analítica Ejecutiva</div>
      <div class="title">${title}</div>
      <div class="subtitle">${subtitle}</div>
    </div>
  </div>
  ${kpisHtml ? `<div class="kpis">${kpisHtml}</div>` : ''}
  <div class="chart-box">
    <svg width="860" height="340" viewBox="0 0 860 340">
      ${items.length > 0 ? svgRows : '<text x="20" y="60" fill="#94a3b8" font-size="16">Sin datos disponibles</text>'}
    </svg>
  </div>
  <div class="footer">
    <span>SIPE Admin • Bot Gerencial Telegram</span>
    <span>Generado ${escapeHtml(toDisplayDate(getDateStr(0)))}</span>
  </div>
</body>
</html>`;
}

/**
 * Renderiza una gráfica en buffer PNG. Usa PNG nativo en pruebas y Puppeteer Retina con fallback en producción.
 */
async function renderExecutiveChartPng(chartSpec = {}, options = {}) {
    const preferFallback = options.preferFallback !== undefined
        ? Boolean(options.preferFallback)
        : (process.env.NODE_ENV === 'test');

    if (preferFallback) {
        return renderFallbackChartPng(chartSpec);
    }

    let browser = null;
    try {
        const puppeteer = require('puppeteer');
        const baseArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
        const knownPaths = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
        let execPath = null;
        if (process.platform === 'linux') {
            execPath = knownPaths.find(p => fs.existsSync(p)) || null;
        }
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: baseArgs,
                ...(execPath ? { executablePath: execPath } : {})
            });
        } catch (_stdErr) {
            const chromium = require('@sparticuz/chromium');
            const cPath = await chromium.executablePath();
            browser = await puppeteer.launch({
                headless: true,
                executablePath: cPath,
                args: Array.from(new Set([...(chromium.args || []), ...baseArgs]))
            });
        }

        const page = await browser.newPage();
        await page.setViewport({ width: 960, height: 560, deviceScaleFactor: 2 });
        await page.setContent(buildChartSvgHtml(chartSpec), { waitUntil: 'load', timeout: 12000 });
        const png = await page.screenshot({ type: 'png' });
        return Buffer.isBuffer(png) ? png : Buffer.from(png);
    } catch (pupErr) {
        console.warn('[TelegramCharts] Puppeteer fallback a PNG nativo:', pupErr.message);
        return renderFallbackChartPng(chartSpec);
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) { /* noop */ }
        }
    }
}

function getChartTopicInlineMarkup(activeTopic = 'ventas') {
    const mark = (key, label) => (activeTopic === key ? `✅ ${label}` : label);
    return {
        inline_keyboard: [
            [
                { text: mark('ventas', '⛽ Ventas'), callback_data: 'tg_chr:ventas' },
                { text: mark('bancos', '🏦 Bancos'), callback_data: 'tg_chr:bancos' }
            ],
            [
                { text: mark('flujo', '📈 Flujo 30d'), callback_data: 'tg_chr:flujo' },
                { text: mark('solar', '☀️ Solar'), callback_data: 'tg_chr:solar' }
            ]
        ]
    };
}

/**
 * Construye y envía una gráfica PNG ejecutiva para `ventas`, `bancos`, `flujo` o `solar`.
 */
async function buildAndSendTopicChart({
    chatId,
    topic = 'ventas',
    targetDate = null,
    effectivePerms = {},
    transport = {},
    dataProviders = {},
    renderOptions = {}
} = {}) {
    const sendMsgFn = transport.sendTelegramMessage || sendTelegramMessage;
    const sendActFn = transport.sendChatAction || sendChatAction;
    const sendPhotoFn = transport.sendTelegramPhoto || sendTelegramPhoto;

    const cleanTopic = ['ventas', 'bancos', 'flujo', 'solar'].includes(String(topic || '').toLowerCase())
        ? String(topic).toLowerCase()
        : 'ventas';

    const allowed = (
        (cleanTopic === 'ventas' && (effectivePerms.ventas || effectivePerms.isAdmin)) ||
        (cleanTopic === 'bancos' && (effectivePerms.saldos_banco || effectivePerms.isAdmin)) ||
        (cleanTopic === 'flujo' && (effectivePerms.saldos_banco || effectivePerms.control_pagos || effectivePerms.isAdmin)) ||
        (cleanTopic === 'solar' && (effectivePerms.ventas || effectivePerms.alertas || effectivePerms.isAdmin))
    );

    if (!allowed) {
        await sendMsgFn(chatId, `⚠️ No tienes permiso asignado para ver gráficas de ${escapeHtml(cleanTopic)}.`);
        return { ok: false, reason: 'forbidden', topic: cleanTopic };
    }

    sendActFn(chatId, 'upload_photo').catch(() => {});
    const effDate = targetDate || getDateStr(-1);
    let chartSpec = null;
    let caption = '';

    if (cleanTopic === 'ventas') {
        const fetchVentas = dataProviders.getConsolidadoVentas || getConsolidadoVentas;
        const data = await fetchVentas(effDate);
        const estaciones = [...(data?.estaciones || [])].sort((a, b) => Number(b.venta || 0) - Number(a.venta || 0));
        const totalVta = estaciones.reduce((s, e) => s + Number(e.venta || 0), 0) +
            (data?.tiendas || []).reduce((s, t) => s + Number(t.venta || 0), 0);
        const totalGal = estaciones.reduce((s, e) => s + Number(e.galonaje || 0), 0);
        chartSpec = {
            topic: 'ventas',
            title: `VENTAS POR ESTACIÓN (${toDisplayDate(effDate)})`,
            subtitle: 'Combustible despachado y ventas cerradas',
            kpis: [
                { label: 'Venta Total Red', value: moneyFmt(totalVta) },
                { label: 'Galonaje', value: `${numFmt(totalGal)} gal` },
                { label: 'Estaciones', value: String(estaciones.length) }
            ],
            items: estaciones.slice(0, 8).map(e => ({
                label: e.empresa || e.titulo || 'Estación',
                value: Number(e.venta || 0),
                valueLabel: `${moneyFmt(e.venta || 0)} (${Math.round(Number(e.galonaje || 0))}g)`
            }))
        };
        caption = `⛽ <b>Gráfica de Ventas por Estación</b> (${toDisplayDate(effDate)})\n💰 Total consolidado: <b>${moneyFmt(totalVta)}</b> · <code>${numFmt(totalGal)} gal</code>`;
    } else if (cleanTopic === 'bancos') {
        const fetchBancos = dataProviders.getSaldosBancosData || getSaldosBancosData;
        const data = await fetchBancos();
        const porBanco = new Map();
        for (const c of (data?.cuentas || [])) {
            const b = c.banco || 'Otros';
            porBanco.set(b, (porBanco.get(b) || 0) + Number(c.saldo || 0));
        }
        const sortedBanks = [...porBanco.entries()]
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
        chartSpec = {
            topic: 'bancos',
            title: `SALDOS CONSOLIDADOS POR BANCO (${toDisplayDate(data?.fecha || getDateStr(0))})`,
            subtitle: 'Disponibilidad bancaria activa',
            kpis: [
                { label: 'Total en Bancos', value: moneyFmt(data?.total || 0) },
                { label: 'Instituciones', value: String(sortedBanks.length) },
                { label: 'Cuentas Activas', value: String((data?.cuentas || []).length) }
            ],
            items: sortedBanks.slice(0, 8).map(b => ({
                label: b.label,
                value: b.value,
                valueLabel: moneyFmt(b.value)
            }))
        };
        caption = `🏦 <b>Distribución de Saldos en Bancos</b>\n💰 Total disponible: <b>${moneyFmt(data?.total || 0)}</b>`;
    } else if (cleanTopic === 'flujo') {
        const fetchFlujo = dataProviders.getFlujoCajaProyectado || getFlujoCajaProyectado;
        const data = await fetchFlujo(30);
        const timeline = Array.isArray(data?.timeline) ? data.timeline : [];
        const checkpoints = timeline.filter((_, idx) => idx === 0 || (idx + 1) % 5 === 0).slice(0, 7);
        const kpi = data?.kpi || {};
        chartSpec = {
            topic: 'flujo',
            title: 'PROYECCIÓN DE FLUJO DE CAJA A 30 DÍAS',
            subtitle: `Salud: ${kpi.salud_flujo || 'SALUDABLE'} • Mínimo proyectado: ${moneyFmt(kpi.saldo_minimo_proyectado || 0)}`,
            kpis: [
                { label: 'Bancos Hoy', value: moneyFmt(kpi.saldo_inicial_bancos || 0) },
                { label: 'Mínimo 30d', value: moneyFmt(kpi.saldo_minimo_proyectado || 0) },
                { label: 'Días en Déficit', value: String(kpi.dias_con_deficit || 0) }
            ],
            items: checkpoints.map(d => ({
                label: `Día ${d.dia_indice} (${toDisplayDate(d.fecha).slice(0, 5)})`,
                value: Number(d.saldo_final_proyectado || 0),
                valueLabel: moneyFmt(d.saldo_final_proyectado || 0)
            }))
        };
        caption = `📈 <b>Proyección de Flujo de Caja (30 días)</b>\n• Estado: <b>${escapeHtml(kpi.salud_flujo || 'SALUDABLE')}</b> | Saldo mínimo: <code>${moneyFmt(kpi.saldo_minimo_proyectado || 0)}</code>`;
    } else {
        const fetchSolar = dataProviders.getSolarAhorroDiario || solarEnergyService.getSolarAhorroDiario;
        const solar = await fetchSolar(effDate, null);
        const estaciones = Array.isArray(solar?.estaciones) ? solar.estaciones : (solar?.desglose_por_estacion || []);
        chartSpec = {
            topic: 'solar',
            title: `GENERACIÓN Y AHORRO SOLAR (${toDisplayDate(solar?.fecha || effDate)})`,
            subtitle: `CO2 evitado: ${numFmt(solar?.co2_evitado_total_kg || 0)} kg`,
            kpis: [
                { label: 'Generación Total', value: `${numFmt(solar?.generacion_total_kwh || 0)} kWh` },
                { label: 'Ahorro USD', value: moneyFmt(solar?.ahorro_total_usd || 0) },
                { label: 'Instalaciones', value: String(estaciones.length) }
            ],
            items: estaciones.slice(0, 6).map(e => ({
                label: e.estacion_nombre || 'Planta Solar',
                value: Number(e.generacion_kwh || 0),
                valueLabel: `${numFmt(e.generacion_kwh || 0)} kWh (${moneyFmt(e.ahorro_usd || 0)})`
            }))
        };
        caption = `☀️ <b>Gráfica de Generación Solar</b> (${toDisplayDate(solar?.fecha || effDate)})\n⚡ ${numFmt(solar?.generacion_total_kwh || 0)} kWh | 💰 Ahorro: <b>${moneyFmt(solar?.ahorro_total_usd || 0)}</b>`;
    }

    const pngBuffer = await renderExecutiveChartPng(chartSpec, renderOptions);
    await sendPhotoFn(
        chatId,
        pngBuffer,
        caption,
        getChartTopicInlineMarkup(cleanTopic),
        `Grafica_${cleanTopic}_${effDate}.png`
    );

    return { ok: true, topic: cleanTopic, bytes: pngBuffer.length };
}

module.exports = {
    GEMINI_TTS_MODELS,
    ensureWavBuffer,
    buildExecutiveAudioScript,
    synthesizeSpeechWavWithGemini,
    buildAndSendExecutiveAudio,
    buildChartSvgHtml,
    renderFallbackChartPng,
    renderExecutiveChartPng,
    getChartTopicInlineMarkup,
    buildAndSendTopicChart
};
