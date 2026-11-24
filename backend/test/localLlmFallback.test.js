const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
    isLocalLlmConfigured,
    hasNonTextGeminiParts,
    convertGeminiContentsToOllamaMessages,
    sanitizeTelegramHtmlOutput,
    generateWithLocalLlm,
    classifyNaturalIntentWithLocalLlm,
    checkLocalLlmHealth
} = require('../services/localLlmFallbackService');
const { generateWithGeminiFallback } = require('../services/telegramGeminiService');

const savedEnv = {
    LOCAL_LLM_URL: process.env.LOCAL_LLM_URL,
    LOCAL_LLM_API_KEY: process.env.LOCAL_LLM_API_KEY,
    LOCAL_LLM_MODEL: process.env.LOCAL_LLM_MODEL,
    LOCAL_LLM_ENABLED: process.env.LOCAL_LLM_ENABLED,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
};

afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

describe('Local LLM Fallback Service (Ollama + sipe-nlu en rsboosted)', () => {
    it('1. Convierte correctamente contents estilo Gemini a mensajes de Ollama /api/chat', () => {
        const msgs = convertGeminiContentsToOllamaMessages(
            [
                { role: 'user', parts: [{ text: '¿Cómo estuvo la playa ayer?' }] },
                { role: 'model', parts: [{ text: 'Puma Costa del Sol vendió $12,450.' }] },
                { role: 'user', parts: [{ text: '¿Y de regular?' }] }
            ],
            'Eres SIPE NLU.'
        );

        assert.equal(msgs.length, 4);
        assert.deepEqual(msgs[0], { role: 'system', content: 'Eres SIPE NLU.' });
        assert.deepEqual(msgs[1], { role: 'user', content: '¿Cómo estuvo la playa ayer?' });
        assert.deepEqual(msgs[2], { role: 'assistant', content: 'Puma Costa del Sol vendió $12,450.' });
        assert.deepEqual(msgs[3], { role: 'user', content: '¿Y de regular?' });
    });

    it('2. Detecta contenido multimedia (audio/imagen) para no enviarlo al modelo de solo texto', () => {
        assert.equal(hasNonTextGeminiParts([{ role: 'user', parts: [{ text: 'hola' }] }]), false);
        assert.equal(hasNonTextGeminiParts([{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/ogg', data: 'abc' } }] }]), true);
        assert.equal(hasNonTextGeminiParts([{ inlineData: { mimeType: 'image/jpeg', data: 'xyz' } }]), true);
    });

    it('3. Envía cabeceras de autenticación, soporta JSON y limpia etiquetas <think>', async () => {
        process.env.LOCAL_LLM_URL = 'http://169.58.207.115:11435';
        process.env.LOCAL_LLM_API_KEY = 'secret_test_key_123';
        process.env.LOCAL_LLM_MODEL = 'sipe-nlu';
        process.env.LOCAL_LLM_ENABLED = 'true';

        assert.equal(isLocalLlmConfigured(), true);

        let capturedUrl = null;
        let capturedOpts = null;
        const fakeFetch = async (url, opts) => {
            capturedUrl = url;
            capturedOpts = opts;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    message: {
                        role: 'assistant',
                        content: '<think>razonamiento interno</think><b>Puma Costa del Sol</b> cerró estable.'
                    }
                })
            };
        };

        const res = await generateWithLocalLlm({
            contents: 'Resumen rápido de Costa del Sol',
            systemInstruction: 'Responde en HTML.',
            jsonMode: true,
            fetchImpl: fakeFetch
        });

        assert.equal(capturedUrl, 'http://169.58.207.115:11435/api/chat');
        assert.equal(capturedOpts.headers['X-SIPE-LLM-Key'], 'secret_test_key_123');
        assert.equal(capturedOpts.headers.Authorization, 'Bearer secret_test_key_123');
        const payload = JSON.parse(capturedOpts.body);
        assert.equal(payload.model, 'sipe-nlu');
        assert.equal(payload.format, 'json');
        assert.equal(payload.stream, false);
        assert.equal(res.modelUsed, 'local:sipe-nlu');
        assert.equal(res.isLocalFallback, true);
        assert.equal(res.text, '<b>Puma Costa del Sol</b> cerró estable.');
    });

    it('4. Clasifica intenciones coloquiales salvadoreñas validando listas blancas estrictas', async () => {
        process.env.LOCAL_LLM_URL = 'http://169.58.207.115:11435';
        process.env.LOCAL_LLM_ENABLED = 'true';

        const fakeFetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                message: {
                    content: JSON.stringify({
                        intent: 'agendar_evento',
                        confidence: 0.94,
                        stationId: '008',
                        date: '2026-11-26',
                        time: '12:00',
                        title: 'Hablar con Bancovi',
                        frecuencia: 'UNA_VEZ'
                    })
                }
            })
        });

        const parsed = await classifyNaturalIntentWithLocalLlm(
            'ey avisame pasado mañana tipo almuerzo que hable con Bancovi sobre la playa',
            '2026-11-24 11:00:00',
            { fetchImpl: fakeFetch }
        );

        assert.equal(parsed.intent, 'agendar_evento');
        assert.equal(parsed.stationId, '008');
        assert.equal(parsed.date, '2026-11-26');
        assert.equal(parsed.time, '12:00');
        assert.equal(parsed.title, 'Hablar con Bancovi');
        assert.equal(parsed.frecuencia, 'UNA_VEZ');

        // Rechaza valores fuera de whitelist (sanitización estricta)
        const maliciousFetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                message: {
                    content: JSON.stringify({
                        intent: 'DROP_TABLE',
                        confidence: 5,
                        stationId: '999_FAKE',
                        date: 'mañana',
                        time: '99:99',
                        frecuencia: 'CADA_SEGUNDO'
                    })
                }
            })
        });
        const sanitized = await classifyNaturalIntentWithLocalLlm('hola', '2026-11-24 11:00:00', { fetchImpl: maliciousFetch });
        assert.equal(sanitized.intent, 'conversacional');
        assert.equal(sanitized.confidence, 1);
        assert.equal(sanitized.stationId, null);
        assert.equal(sanitized.date, null);
        assert.equal(sanitized.time, null);
        assert.equal(sanitized.frecuencia, null);
    });

    it('5. generateWithGeminiFallback activa respaldo local si Gemini falla y bloquea fallback en audio/imagen', async () => {
        process.env.LOCAL_LLM_URL = 'http://169.58.207.115:11435';
        process.env.LOCAL_LLM_MODEL = 'sipe-nlu';
        process.env.LOCAL_LLM_ENABLED = 'true';
        delete process.env.GEMINI_API_KEY;

        let localCalls = 0;
        const fakeLocalFetch = async () => {
            localCalls += 1;
            return {
                ok: true,
                status: 200,
                json: async () => ({ message: { content: 'Respuesta de respaldo sipe-nlu' } })
            };
        };

        // Caso A: solo texto sin clave/cuota Gemini -> activa fallback local
        const textRes = await generateWithGeminiFallback({
            contents: [{ role: 'user', parts: [{ text: '¿Cuánto vendimos ayer?' }] }],
            models: [],
            logPrefix: '[TestFallback]',
            localFetchImpl: fakeLocalFetch
        });
        assert.equal(localCalls, 1);
        assert.equal(textRes.modelUsed, 'local:sipe-nlu');
        assert.equal(textRes.text, 'Respuesta de respaldo sipe-nlu');

        // Caso B: contenido multimedia (audio) -> NO debe llamar al modelo de solo texto
        const audioRes = await generateWithGeminiFallback({
            contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/ogg', data: 'AAA' } }] }],
            models: [],
            logPrefix: '[TestFallbackAudio]',
            localFetchImpl: fakeLocalFetch
        });
        assert.equal(localCalls, 1);
        assert.equal(audioRes, null);
    });

    it('6. checkLocalLlmHealth verifica conectividad y presencia del modelo sipe-nlu', async () => {
        process.env.LOCAL_LLM_URL = 'http://169.58.207.115:11435';
        process.env.LOCAL_LLM_MODEL = 'sipe-nlu';
        process.env.LOCAL_LLM_ENABLED = 'true';

        const health = await checkLocalLlmHealth({
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    models: [{ name: 'sipe-nlu:latest' }, { name: 'qwen2.5:3b' }]
                })
            })
        });
        assert.equal(health.configured, true);
        assert.equal(health.reachable, true);
        assert.equal(health.modelAvailable, true);
        assert.equal(health.model, 'sipe-nlu');

        // Sanitización HTML Telegram (elimina <br>, <p>, <table>, **markdown**)
        const sanitizedHtml = sanitizeTelegramHtmlOutput('<table><tr><td><b>Andelsa</b></td><td>55 kWp</td></tr><tr><td>**La Loma**</td><td>40 kWp</td></tr></table><br><p>Total: 95 kWp</p>');
        assert.equal(sanitizedHtml.includes('<table'), false);
        assert.equal(sanitizedHtml.includes('<td'), false);
        assert.equal(sanitizedHtml.includes('<br>'), false);
        assert.equal(sanitizedHtml.includes('<p>'), false);
        assert.equal(sanitizedHtml.includes('<b>Andelsa</b> · 55 kWp'), true);
        assert.equal(sanitizedHtml.includes('<b>La Loma</b> · 40 kWp'), true);
    });
});
