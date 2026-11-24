/**
 * Cliente HTTP liviano para el modelo local optimizado de SIPE Admin (Ollama + sipe-nlu basado en Qwen 2.5 3B)
 * alojado en el servidor de automatizaciones (rsboosted / 169.58.207.115).
 *
 * Actúa como respaldo automático ante límites de cuota (429) o caída de Gemini API,
 * y como clasificador estructurado NLU para frases coloquiales en español salvadoreño.
 * Cero dependencias externas (usa fetch nativo de Node.js).
 */

const ALLOWED_LOCAL_INTENTS = new Set([
    'agendar_evento',
    'cambiar_hora_evento',
    'consultar_ventas',
    'consultar_bancos',
    'consultar_chequera',
    'consultar_competencia',
    'consultar_tanques',
    'consultar_solar',
    'consultar_pagos',
    'consultar_tareas',
    'consultar_agenda',
    'consultar_alertas',
    'consultar_andelsa',
    'conversacional'
]);

const ALLOWED_STATION_IDS = new Set(['002', '006', '008', '014', '015', '016', 'ANDELSA']);

function getLocalLlmConfig() {
    const url = String(process.env.LOCAL_LLM_URL || '').trim().replace(/\/+$/, '');
    const apiKey = String(process.env.LOCAL_LLM_API_KEY || '').trim();
    const model = String(process.env.LOCAL_LLM_MODEL || 'sipe-nlu').trim() || 'sipe-nlu';
    const enabledFlag = String(process.env.LOCAL_LLM_ENABLED || 'true').trim().toLowerCase();
    const enabled = enabledFlag !== 'false' && enabledFlag !== '0' && Boolean(url);
    const timeoutMs = Math.min(60000, Math.max(3000, parseInt(process.env.LOCAL_LLM_TIMEOUT_MS, 10) || 22000));
    return {
        enabled,
        url,
        apiKey,
        model,
        timeoutMs
    };
}

function isLocalLlmConfigured() {
    const cfg = getLocalLlmConfig();
    return Boolean(cfg.enabled && cfg.url);
}

/**
 * Detecta si los contenidos de estilo Gemini incluyen partes multimedia (audio, imagen, PDF)
 * que el modelo de solo texto qwen2.5:3b no debe intentar procesar.
 */
function hasNonTextGeminiParts(contents) {
    if (!Array.isArray(contents)) return false;
    for (const item of contents) {
        if (!item || typeof item !== 'object') continue;
        if (item.inlineData || item.fileData) return true;
        if (Array.isArray(item.parts)) {
            for (const part of item.parts) {
                if (part && typeof part === 'object' && (part.inlineData || part.fileData)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Convierte `contents` de formato @google/genai a mensajes `messages` de Ollama /api/chat
 */
function convertGeminiContentsToOllamaMessages(contents, systemInstruction = '') {
    const messages = [];
    const sys = String(systemInstruction || '').trim();
    if (sys) {
        messages.push({ role: 'system', content: sys });
    }

    if (typeof contents === 'string') {
        const clean = contents.trim();
        if (clean) messages.push({ role: 'user', content: clean });
        return messages;
    }

    if (Array.isArray(contents)) {
        for (const entry of contents) {
            if (typeof entry === 'string') {
                const clean = entry.trim();
                if (clean) messages.push({ role: 'user', content: clean });
                continue;
            }
            if (!entry || typeof entry !== 'object') continue;

            if (Array.isArray(entry.parts)) {
                const textPieces = entry.parts
                    .map(p => (typeof p === 'string' ? p : (p && typeof p.text === 'string' ? p.text : '')))
                    .filter(Boolean);
                const joined = textPieces.join('\n').trim();
                if (!joined) continue;
                const role = entry.role === 'model' || entry.role === 'assistant'
                    ? 'assistant'
                    : (entry.role === 'system' ? 'system' : 'user');
                messages.push({ role, content: joined });
            } else if (typeof entry.text === 'string' && entry.text.trim()) {
                const role = entry.role === 'model' || entry.role === 'assistant' ? 'assistant' : 'user';
                messages.push({ role, content: entry.text.trim() });
            }
        }
    }

    return messages;
}

/**
 * Invoca el endpoint autenticado de Ollama (`sipe-nlu`) con timeout estricto
 */
async function generateWithLocalLlm({
    contents,
    systemInstruction = '',
    jsonMode = false,
    temperature = 0.15,
    maxTokens = 520,
    timeoutMs = null,
    model = null,
    logPrefix = '[LocalLLM]',
    fetchImpl = null
} = {}) {
    const cfg = getLocalLlmConfig();
    if (!cfg.enabled || !cfg.url) return null;
    if (hasNonTextGeminiParts(contents)) return null;

    const messages = convertGeminiContentsToOllamaMessages(contents, systemInstruction);
    if (messages.length === 0) return null;

    const usedModel = model || cfg.model;
    const effectiveTimeout = timeoutMs || cfg.timeoutMs;
    const fetchFn = fetchImpl || global.fetch;
    if (typeof fetchFn !== 'function') return null;

    const headers = {
        'Content-Type': 'application/json'
    };
    if (cfg.apiKey) {
        headers['X-SIPE-LLM-Key'] = cfg.apiKey;
        headers.Authorization = `Bearer ${cfg.apiKey}`;
    }

    const body = {
        model: usedModel,
        messages,
        stream: false,
        keep_alive: '15m',
        options: {
            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.15,
            num_predict: Math.min(1024, Math.max(64, Number(maxTokens) || 520))
        }
    };
    if (jsonMode) {
        body.format = 'json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);
    const startedAt = Date.now();

    try {
        const res = await fetchFn(`${cfg.url}/api/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });

        if (!res.ok) {
            const errTxt = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 180)}`);
        }

        const data = await res.json();
        const rawText = String(data?.message?.content || data?.response || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .trim();

        if (!rawText) return null;

        return {
            response: data,
            text: rawText,
            modelUsed: `local:${usedModel}`,
            isLocalFallback: true,
            durationMs: Date.now() - startedAt
        };
    } catch (err) {
        console.warn(`${logPrefix} Error consultando modelo local (${usedModel}):`, err.message);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Clasifica una frase libre en español salvadoreño a una intención estructurada de SIPE Admin
 * usando el modelo local optimizado `sipe-nlu`.
 */
async function classifyNaturalIntentWithLocalLlm(rawText = '', referenceNowSv = null, options = {}) {
    const cleanText = String(rawText || '').trim();
    if (cleanText.length < 3) return null;
    if (!isLocalLlmConfigured()) return null;

    const nowRef = referenceNowSv || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const prompt = [
        `Fecha/hora actual en El Salvador (UTC-6): ${nowRef}`,
        `Clasifica el siguiente mensaje de un usuario de SIPE Admin en JSON estricto:`,
        `{"intent":"agendar_evento|cambiar_hora_evento|consultar_ventas|consultar_bancos|consultar_chequera|consultar_competencia|consultar_tanques|consultar_solar|consultar_pagos|consultar_tareas|consultar_agenda|consultar_alertas|consultar_andelsa|conversacional","confidence":0.0,"stationId":"002|006|008|014|015|016|ANDELSA|null","date":"YYYY-MM-DD|null","time":"HH:mm|null","title":"string|null","frecuencia":"UNA_VEZ|DIARIO|SEMANAL|null"}`,
        `Mensaje: "${cleanText.replace(/"/g, '\\"')}"`
    ].join('\n');

    const res = await generateWithLocalLlm({
        contents: prompt,
        jsonMode: true,
        temperature: 0.05,
        maxTokens: 220,
        timeoutMs: options.timeoutMs || 10000,
        logPrefix: '[LocalLLM-NLU]',
        fetchImpl: options.fetchImpl
    });

    if (!res || !res.text) return null;

    try {
        const cleanedJson = res.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleanedJson);
        if (!parsed || typeof parsed !== 'object') return null;

        const intent = ALLOWED_LOCAL_INTENTS.has(String(parsed.intent || '').trim())
            ? String(parsed.intent).trim()
            : 'conversacional';
        const confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));
        const stationRaw = parsed.stationId ? String(parsed.stationId).trim().toUpperCase() : null;
        const stationId = stationRaw && ALLOWED_STATION_IDS.has(stationRaw) ? stationRaw : null;
        const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date.trim())
            ? parsed.date.trim()
            : null;
        const time = typeof parsed.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.time.trim())
            ? parsed.time.trim()
            : null;
        const title = typeof parsed.title === 'string' && parsed.title.trim().length >= 2
            ? parsed.title.trim().slice(0, 175)
            : null;
        const freqRaw = parsed.frecuencia ? String(parsed.frecuencia).trim().toUpperCase() : null;
        const frecuencia = ['UNA_VEZ', 'DIARIO', 'SEMANAL'].includes(freqRaw) ? freqRaw : null;

        return {
            intent,
            confidence,
            stationId,
            date,
            time,
            title,
            frecuencia,
            modelUsed: res.modelUsed,
            durationMs: res.durationMs
        };
    } catch (_) {
        return null;
    }
}

/**
 * Verifica salud y disponibilidad del modelo local `sipe-nlu` en rsboosted
 */
async function checkLocalLlmHealth({ fetchImpl = null, timeoutMs = 4000 } = {}) {
    const cfg = getLocalLlmConfig();
    const base = {
        configured: Boolean(cfg.url),
        enabled: cfg.enabled,
        reachable: false,
        model: cfg.model,
        modelAvailable: false,
        latencyMs: null
    };
    if (!cfg.enabled || !cfg.url) return base;

    const fetchFn = fetchImpl || global.fetch;
    if (typeof fetchFn !== 'function') return base;

    const headers = {};
    if (cfg.apiKey) {
        headers['X-SIPE-LLM-Key'] = cfg.apiKey;
        headers.Authorization = `Bearer ${cfg.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
        const res = await fetchFn(`${cfg.url}/api/tags`, {
            method: 'GET',
            headers,
            signal: controller.signal
        });
        const latencyMs = Date.now() - startedAt;
        if (!res.ok) {
            return { ...base, latencyMs };
        }
        const data = await res.json();
        const models = Array.isArray(data?.models) ? data.models : [];
        const modelAvailable = models.some(m => {
            const name = String(m?.name || '');
            return name === cfg.model || name.startsWith(`${cfg.model}:`);
        });
        return {
            ...base,
            reachable: true,
            modelAvailable,
            latencyMs
        };
    } catch (_) {
        return { ...base, latencyMs: Date.now() - startedAt };
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    ALLOWED_LOCAL_INTENTS,
    ALLOWED_STATION_IDS,
    getLocalLlmConfig,
    isLocalLlmConfigured,
    hasNonTextGeminiParts,
    convertGeminiContentsToOllamaMessages,
    generateWithLocalLlm,
    classifyNaturalIntentWithLocalLlm,
    checkLocalLlmHealth
};
