const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const router = require('../routes/telegram');

const {
    sendChatAction,
    queryMemoryCache,
    getCachedQuery,
    setCachedQuery,
    clearQueryCache,
    setTelegramWebhook,
    deleteTelegramWebhook,
    getTelegramWebhookInfo
} = require('../services/telegramBotService');

const {
    solarMemoryCache,
    getCachedSolar,
    setCachedSolar,
    clearSolarCache
} = require('../services/solarEnergyService');

const {
    saasMemoryCache,
    getCachedSaas,
    setCachedSaas,
    clearSaasCache
} = require('../services/sysSaasService');

describe('Telegram Performance, Latency & High-Speed Architecture Tests', () => {
    let originalAxiosPost;
    let originalAxiosGet;
    let originalEnvToken;
    let originalPoolQuery;

    beforeEach(() => {
        originalAxiosPost = axios.post;
        originalAxiosGet = axios.get;
        originalEnvToken = process.env.TELEGRAM_BOT_TOKEN;
        process.env.TELEGRAM_BOT_TOKEN = '123456789:ABCDefghIJKlmNoPQRsTUVwxyZ';

        const pool = require('../db').getDb();
        if (pool) {
            originalPoolQuery = pool.query;
            pool.query = async (sql) => {
                const sqlStr = String(sql).toLowerCase();
                if (sqlStr.includes('telegram_config')) {
                    return [[{ bot_token: '123456789:ABCDefghIJKlmNoPQRsTUVwxyZ', is_active: 1 }]];
                }
                return [[]];
            };
        }

        clearQueryCache();
        clearSolarCache();
        clearSaasCache();
    });

    afterEach(() => {
        if (originalAxiosPost) axios.post = originalAxiosPost;
        if (originalAxiosGet) axios.get = originalAxiosGet;
        if (originalEnvToken !== undefined) {
            process.env.TELEGRAM_BOT_TOKEN = originalEnvToken;
        } else {
            delete process.env.TELEGRAM_BOT_TOKEN;
        }

        const pool = require('../db').getDb();
        if (pool && originalPoolQuery) {
            pool.query = originalPoolQuery;
        }

        clearQueryCache();
        clearSolarCache();
        clearSaasCache();
    });

    // =========================================================================
    // 1. sendChatAction Tests
    // =========================================================================
    describe('1. Non-Blocking sendChatAction (Typing Indicator)', () => {
        it('debe invocar sendChatAction con chat_id, action typing y timeout de 3000ms', async () => {
            let capturedUrl = null;
            let capturedData = null;
            let capturedConfig = null;

            axios.post = async (url, data, config) => {
                capturedUrl = url;
                capturedData = data;
                capturedConfig = config;
                return { data: { ok: true, result: true } };
            };

            const result = await sendChatAction(987654321, 'typing');

            assert.strictEqual(result.ok, true);
            assert.ok(capturedUrl.includes('/sendChatAction'), 'La URL debe contener sendChatAction');
            assert.strictEqual(capturedData.chat_id, 987654321);
            assert.strictEqual(capturedData.action, 'typing');
            assert.strictEqual(capturedConfig.timeout, 3000, 'El timeout de axios debe ser de 3000ms');
        });

        it('debe permitir acciones personalizadas como upload_document o find_location', async () => {
            let capturedData = null;
            axios.post = async (url, data) => {
                capturedData = data;
                return { data: { ok: true, result: true } };
            };

            await sendChatAction(12345, 'upload_document');
            assert.strictEqual(capturedData.action, 'upload_document');
        });

        it('debe manejar errores de red o timeout elegantemente sin lanzar excepciones no controladas', async () => {
            axios.post = async () => {
                const err = new Error('Connection timed out');
                err.code = 'ECONNABORTED';
                throw err;
            };

            const result = await sendChatAction(12345, 'typing');
            assert.strictEqual(result.ok, false);
            assert.ok(result.error, 'Debe incluir la descripción del error');
            assert.ok(result.error.includes('timed out'));
        });
    });

    // =========================================================================
    // 2. RAM Cache: queryMemoryCache (Telegram Bot Service)
    // =========================================================================
    describe('2. In-Memory RAM Cache (queryMemoryCache)', () => {
        it('debe almacenar y recuperar datos instantáneamente de memoria', () => {
            const sampleData = { ventas: 12500.50, transacciones: 180 };
            setCachedQuery('ventas:hoy:test', sampleData, 30000);

            const cached = getCachedQuery('ventas:hoy:test');
            assert.deepStrictEqual(cached, sampleData);
        });

        it('debe retornar null cuando un elemento ha expirado su TTL', async () => {
            setCachedQuery('expiring_key', { data: 'test' }, 20); // 20ms TTL

            const immediate = getCachedQuery('expiring_key');
            assert.ok(immediate !== null, 'Inmediatamente debe existir');

            // Esperar a que expire el TTL
            await new Promise(r => setTimeout(r, 40));

            const expired = getCachedQuery('expiring_key');
            assert.strictEqual(expired, null, 'Tras el TTL debe retornar null');
            assert.strictEqual(queryMemoryCache.has('expiring_key'), false, 'La clave expirada debe ser eliminada');
        });

        it('debe auto-limpiar cuando se supera el límite de 300 elementos (FIFO pruning)', () => {
            clearQueryCache();

            // Insertar 310 elementos
            for (let i = 1; i <= 310; i++) {
                setCachedQuery(`key_${i}`, { value: i }, 60000);
            }

            assert.strictEqual(queryMemoryCache.size, 300, 'El tamaño del caché no debe exceder 300');
            // Los primeros 10 deben haber sido podados (FIFO)
            assert.strictEqual(getCachedQuery('key_1'), null);
            assert.strictEqual(getCachedQuery('key_10'), null);
            // Los más recientes deben existir
            assert.deepStrictEqual(getCachedQuery('key_310'), { value: 310 });
        });

        it('clearQueryCache debe vaciar completamente el caché', () => {
            setCachedQuery('k1', 'v1');
            setCachedQuery('k2', 'v2');
            assert.strictEqual(queryMemoryCache.size, 2);

            clearQueryCache();
            assert.strictEqual(queryMemoryCache.size, 0);
            assert.strictEqual(getCachedQuery('k1'), null);
        });
    });

    // =========================================================================
    // 3. Solar & Andelsa SaaS Cache Tests
    // =========================================================================
    describe('3. Solar & Andelsa SaaS RAM Caches', () => {
        it('solarMemoryCache debe almacenar y expirar correctamente según su TTL', async () => {
            clearSolarCache();
            const solarData = { ahorro_diario_usd: 124.50, autogeneracion_kwh: 780 };
            setCachedSolar('solar:ahorro:test', solarData, 30);

            const cached = getCachedSolar('solar:ahorro:test');
            assert.deepStrictEqual(cached, solarData);

            await new Promise(r => setTimeout(r, 50));
            assert.strictEqual(getCachedSolar('solar:ahorro:test'), null);
            assert.strictEqual(solarMemoryCache.size, 0);
        });

        it('saasMemoryCache debe almacenar y limpiar el caché correctamente', () => {
            clearSaasCache();
            const andelsaData = { facturacion_total_usd: 95000, clientes: 25 };
            setCachedSaas('andelsa:resumen:test', andelsaData, 45000);

            const cached = getCachedSaas('andelsa:resumen:test');
            assert.deepStrictEqual(cached, andelsaData);

            clearSaasCache();
            assert.strictEqual(getCachedSaas('andelsa:resumen:test'), null);
            assert.strictEqual(saasMemoryCache.size, 0);
        });
    });

    // =========================================================================
    // 4. Latency Benchmark Tests (<5ms RAM hit SLA)
    // =========================================================================
    describe('4. Latency Benchmark (<5ms SLA)', () => {
        it('la lectura desde queryMemoryCache debe tardar menos de 5ms por operación', () => {
            setCachedQuery('perf_test_key', { stations: Array(10).fill({ name: 'Estación Central', total: 4500 }) }, 30000);

            const start = performance.now();
            const result = getCachedQuery('perf_test_key');
            const duration = performance.now() - start;

            assert.ok(result !== null);
            assert.ok(duration < 5, `La lectura en memoria tardó ${duration.toFixed(3)}ms, superando el límite de 5ms`);
        });

        it('1,000 lecturas en RAM caché deben completarse en menos de 50ms (<0.05ms promedio)', () => {
            for (let i = 0; i < 100; i++) {
                setCachedQuery(`bench_${i}`, { index: i }, 60000);
            }

            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                const key = `bench_${i % 100}`;
                const data = getCachedQuery(key);
                assert.ok(data !== null);
            }
            const totalDuration = performance.now() - start;

            assert.ok(totalDuration < 50, `1,000 lecturas tardaron ${totalDuration.toFixed(2)}ms, debe ser <50ms`);
        });
    });

    // =========================================================================
    // 5. Telegram Webhook Endpoints & Fast Response (<40ms)
    // =========================================================================
    describe('5. Webhook Endpoints & High-Speed Handler (<40ms)', () => {
        const createMockReqRes = (body = {}, headers = {}) => {
            const req = {
                body,
                headers,
                params: {},
                query: {}
            };
            const res = {
                statusCode: 200,
                sentStatus: null,
                body: null,
                sendStatus(code) {
                    this.sentStatus = code;
                    this.statusCode = code;
                    return this;
                },
                status(code) {
                    this.statusCode = code;
                    return this;
                },
                json(data) {
                    this.body = data;
                    return this;
                }
            };
            return { req, res };
        };

        it('POST /webhook debe responder inmediatamente HTTP 200 en <40ms', async () => {
            // Localizar el handler registrado para POST /webhook
            const webhookLayer = router.stack.find(
                layer => layer.route && layer.route.path === '/webhook' && layer.route.methods.post
            );
            assert.ok(webhookLayer, 'La ruta POST /webhook debe estar registrada en el router');

            const handler = webhookLayer.route.stack[0].handle;
            const updatePayload = {
                update_id: 10001,
                message: {
                    message_id: 55,
                    from: { id: 12345, first_name: 'Carlos' },
                    chat: { id: 12345, type: 'private' },
                    text: '/menu'
                }
            };

            const { req, res } = createMockReqRes(updatePayload);

            const start = performance.now();
            handler(req, res);
            const duration = performance.now() - start;

            assert.strictEqual(res.sentStatus, 200, 'Debe responder HTTP 200 OK inmediatamente');
            assert.ok(duration < 40, `El handler respondió en ${duration.toFixed(3)}ms, superando los 40ms de SLA`);
        });

        it('POST /webhook con secret token configurado debe validar x-telegram-bot-api-secret-token', () => {
            const oldSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
            process.env.TELEGRAM_WEBHOOK_SECRET = 'super-secret-token-xyz';

            try {
                const webhookLayer = router.stack.find(
                    layer => layer.route && layer.route.path === '/webhook' && layer.route.methods.post
                );
                const handler = webhookLayer.route.stack[0].handle;

                // 1. Token inválido -> 403 Forbidden
                const { req: badReq, res: badRes } = createMockReqRes({ update_id: 10002 }, { 'x-telegram-bot-api-secret-token': 'wrong-token' });
                handler(badReq, badRes);
                assert.strictEqual(badRes.statusCode, 403);
                assert.deepStrictEqual(badRes.body, { error: 'Secret token inválido' });

                // 2. Token correcto -> 200 OK
                const { req: goodReq, res: goodRes } = createMockReqRes({ update_id: 10003 }, { 'x-telegram-bot-api-secret-token': 'super-secret-token-xyz' });
                handler(goodReq, goodRes);
                assert.strictEqual(goodRes.sentStatus, 200);
            } finally {
                if (oldSecret !== undefined) {
                    process.env.TELEGRAM_WEBHOOK_SECRET = oldSecret;
                } else {
                    delete process.env.TELEGRAM_WEBHOOK_SECRET;
                }
            }
        });

        it('setTelegramWebhook debe enviar parámetros correctos a Telegram Bot API', async () => {
            let capturedUrl = null;
            let capturedData = null;

            axios.post = async (url, data) => {
                capturedUrl = url;
                capturedData = data;
                return { data: { ok: true, result: true, description: 'Webhook was set' } };
            };

            const result = await setTelegramWebhook({
                url: 'https://sipe.empresa.com/api/telegram/webhook',
                max_connections: 50,
                secret_token: 'test-secret'
            });

            assert.strictEqual(result.ok, true);
            assert.ok(capturedUrl.includes('/setWebhook'));
            assert.strictEqual(capturedData.url, 'https://sipe.empresa.com/api/telegram/webhook');
            assert.strictEqual(capturedData.max_connections, 50);
            assert.strictEqual(capturedData.secret_token, 'test-secret');
        });

        it('deleteTelegramWebhook debe enviar drop_pending_updates a Telegram API', async () => {
            let capturedData = null;

            axios.post = async (url, data) => {
                capturedData = data;
                return { data: { ok: true, result: true, description: 'Webhook was deleted' } };
            };

            const result = await deleteTelegramWebhook({ drop_pending_updates: true });
            assert.strictEqual(result.ok, true);
            assert.strictEqual(capturedData.drop_pending_updates, true);
        });

        it('getTelegramWebhookInfo debe consultar getWebhookInfo en Telegram API', async () => {
            let capturedUrl = null;

            axios.get = async (url) => {
                capturedUrl = url;
                return {
                    data: {
                        ok: true,
                        result: {
                            url: 'https://sipe.empresa.com/api/telegram/webhook',
                            has_custom_certificate: false,
                            pending_update_count: 0
                        }
                    }
                };
            };

            const result = await getTelegramWebhookInfo();
            assert.strictEqual(result.ok, true);
            assert.ok(capturedUrl.includes('/getWebhookInfo'));
            assert.strictEqual(result.result.url, 'https://sipe.empresa.com/api/telegram/webhook');
        });
    });
});
