const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const aiRouter = require('../routes/ai');
const { JWT_SECRET } = require('../middleware/auth');

describe('AI Gateway & Solar-Andelsa Consolidated Endpoint Tests', () => {
    let originalAxiosPost;
    let originalAiGatewayKey;

    beforeEach(() => {
        originalAxiosPost = axios.post;
        originalAiGatewayKey = process.env.AI_GATEWAY_KEY;
        axios.post = async () => ({ data: { ok: true, result: { message_id: 999 } } });
    });

    afterEach(() => {
        if (originalAxiosPost) {
            axios.post = originalAxiosPost;
        }
        if (originalAiGatewayKey === undefined) {
            delete process.env.AI_GATEWAY_KEY;
        } else {
            process.env.AI_GATEWAY_KEY = originalAiGatewayKey;
        }
    });

    const createMockReqRes = (options = {}) => {
        const req = {
            headers: options.headers || {},
            body: options.body || {},
            query: options.query || {},
            user: options.user || null
        };
        const res = {
            statusCode: 200,
            body: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.body = payload;
                return this;
            }
        };
        return { req, res };
    };

    const getRouteLayer = (path, method = 'get') => {
        return aiRouter.stack.find(
            s => s.route?.path === path && s.route?.methods?.[method.toLowerCase()]
        );
    };

    describe('1. Middleware authenticateAiRequest', () => {
        it('debe permitir acceso con cabecera x-api-key válida', () => {
            process.env.AI_GATEWAY_KEY = 'test-gateway-key-2026';
            const { req, res } = createMockReqRes({
                headers: { 'x-api-key': 'test-gateway-key-2026' }
            });

            let nextCalled = false;
            aiRouter.authenticateAiRequest(req, res, () => {
                nextCalled = true;
            });

            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
            assert.ok(req.user);
            assert.strictEqual(req.user.isApiKey, true);
        });

        it('debe permitir acceso con token JWT Bearer válido', () => {
            const token = jwt.sign(
                { id: 1, username: 'admin', role_id: 1, role: 'Administrator', status: 'active' },
                JWT_SECRET,
                { expiresIn: '1h' }
            );
            const { req, res } = createMockReqRes({
                headers: { authorization: `Bearer ${token}` }
            });

            let nextCalled = false;
            aiRouter.authenticateAiRequest(req, res, () => {
                nextCalled = true;
            });

            assert.strictEqual(nextCalled, true);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(req.user.username, 'admin');
        });

        it('debe rechazar (401) peticiones sin token ni x-api-key válida', () => {
            const { req, res } = createMockReqRes({
                headers: { 'x-api-key': 'clave-invalida' }
            });

            let nextCalled = false;
            aiRouter.authenticateAiRequest(req, res, () => {
                nextCalled = true;
            });

            assert.strictEqual(nextCalled, false);
            assert.strictEqual(res.statusCode, 401);
        });
    });

    describe('2. GET /schema-context', () => {
        it('debe existir en el router y retornar entidades operativas, instalaciones solares, Andelsa y salud', async () => {
            const layer = getRouteLayer('/schema-context', 'get');
            assert.ok(layer, 'La ruta GET /schema-context debe estar registrada');

            const { req, res } = createMockReqRes({
                headers: { 'x-api-key': 'sipe-ai-gateway-2026' }
            });

            const handler = layer.route.stack[layer.route.stack.length - 1].handle;
            await handler(req, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.ok(Array.isArray(res.body.KNOWN_STATIONS));
            assert.ok(res.body.KNOWN_STATIONS.length >= 5);
            assert.ok(Array.isArray(res.body.KNOWN_FUELS));
            assert.ok(Array.isArray(res.body.KNOWN_BANKS));

            // Verificar instalaciones solares
            assert.ok(res.body.solarInstallations);
            assert.strictEqual(res.body.solarInstallations.resumen.potencia_total_kwp, 95);
            assert.strictEqual(res.body.solarInstallations.resumen.capacidad_total_bateria_kwh, 60);

            // Verificar metadatos de Andelsa (company_id: 9)
            assert.ok(res.body.andelsa);
            assert.strictEqual(res.body.andelsa.company_id, 9);
            assert.ok(Array.isArray(res.body.andelsa.modules));
            assert.ok(res.body.andelsa.modules.includes('inventarios'));
            assert.ok(res.body.andelsa.modules.includes('cuentas_por_cobrar'));

            // Verificar diagnóstico de salud
            assert.ok(res.body.health);
            assert.ok(['healthy', 'degraded', 'critical'].includes(res.body.health.status));
        });
    });

    describe('3. POST /query (Ventas, Solar y Andelsa)', () => {
        it('debe retornar 400 si no se envía query ni prompt', async () => {
            const layer = getRouteLayer('/query', 'post');
            assert.ok(layer, 'La ruta POST /query debe estar registrada');

            const { req, res } = createMockReqRes({ body: {} });
            const handler = layer.route.stack[layer.route.stack.length - 1].handle;
            await handler(req, res);

            assert.strictEqual(res.statusCode, 400);
            assert.strictEqual(res.body.ok, false);
        });

        it('debe resolver consultas de ventas y ranking retornando estructura rica completa', async () => {
            const { req, res } = createMockReqRes({
                body: { query: '¿Cuál estación vendió más ayer?' }
            });

            await aiRouter.handleAiQuery(req, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.strictEqual(res.body.query, '¿Cuál estación vendió más ayer?');
            assert.strictEqual(res.body.intent, 'ventas');
            assert.ok(res.body.replyHtml.includes('<b>'));
            assert.ok(res.body.replyText.length > 0);
            assert.ok(!res.body.replyText.includes('<b>'));
            assert.ok(Array.isArray(res.body.kpis));
            assert.ok(res.body.kpis.length >= 3);
            assert.ok(res.body.tableData);
            assert.ok(Array.isArray(res.body.tableData.columns));
            assert.ok(Array.isArray(res.body.tableData.rows));
            assert.ok(res.body.tableData.rows.length > 0);
            assert.ok(Array.isArray(res.body.suggestions));
            assert.strictEqual(typeof res.body.latencyMs, 'number');
        });

        it('debe resolver consultas de energía solar y baterías sin montos en $0.00', async () => {
            const { req, res } = createMockReqRes({
                body: { prompt: 'Ahorro solar de ayer en Andelsa' }
            });

            await aiRouter.handleAiQuery(req, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.strictEqual(res.body.intent, 'solar');
            assert.ok(!res.body.replyHtml.includes('$0.00'), 'El reporte solar no debe mostrar $0.00');
            assert.ok(res.body.replyHtml.includes('Andelsa'));
            assert.ok(Array.isArray(res.body.kpis));
            assert.ok(res.body.kpis.some(k => k.label.includes('Ahorro')));
            assert.strictEqual(res.body.tableData.rows.length, 1);
            assert.strictEqual(res.body.tableData.rows[0][0], 'Andelsa');
        });

        it('debe resolver consultas administrativas y financieras de Andelsa (resumen, inventario y CXC)', async () => {
            // 3.1 Resumen financiero Andelsa
            const { req: reqFin, res: resFin } = createMockReqRes({
                body: { query: 'Resumen financiero de Andelsa' }
            });
            await aiRouter.handleAiQuery(reqFin, resFin);
            assert.strictEqual(resFin.statusCode, 200);
            assert.strictEqual(resFin.body.ok, true);
            assert.strictEqual(resFin.body.intent, 'andelsa');
            assert.ok(resFin.body.replyHtml.includes('ANDELSA'));
            assert.ok(resFin.body.kpis.length >= 3);
            assert.ok(resFin.body.tableData.rows.length >= 4);

            // 3.2 Inventario Andelsa
            const { req: reqInv, res: resInv } = createMockReqRes({
                body: { query: 'Inventario y stock de Andelsa' }
            });
            await aiRouter.handleAiQuery(reqInv, resInv);
            assert.strictEqual(resInv.body.intent, 'andelsa');
            assert.ok(resInv.body.replyHtml.includes('INVENTARIO ANDELSA'));
            assert.ok(resInv.body.tableData.rows.length > 0);

            // 3.3 Cuentas por cobrar Andelsa
            const { req: reqCxc, res: resCxc } = createMockReqRes({
                body: { query: 'Cuentas por cobrar CXC de Andelsa' }
            });
            await aiRouter.handleAiQuery(reqCxc, resCxc);
            assert.strictEqual(resCxc.body.intent, 'andelsa');
            assert.ok(resCxc.body.replyHtml.includes('CUENTAS POR COBRAR'));
            assert.ok(resCxc.body.tableData.rows.length > 0);
        });
    });

    describe('4. POST /webhooks/trigger', () => {
        it('debe disparar custom_alert correctamente', async () => {
            const { req, res } = createMockReqRes({
                body: {
                    event: 'custom_alert',
                    title: 'Prueba Gateway AI',
                    message: 'Notificación de prueba desde AI Gateway',
                    customUsers: []
                }
            });

            await aiRouter.handleWebhooksTrigger(req, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.strictEqual(res.body.event, 'custom_alert');
        });

        it('debe disparar discrepancy_check correctamente', async () => {
            const { req, res } = createMockReqRes({
                body: {
                    event: 'discrepancy_check',
                    fecha: '2026-10-12',
                    customData: { resumen_cierre: [], cortes_tienda: [], mermas: [] },
                    customUsers: []
                }
            });

            await aiRouter.handleWebhooksTrigger(req, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.strictEqual(res.body.event, 'discrepancy_check');
        });
    });

    describe('5. GET /solar-andelsa/dashboard', () => {
        it('debe estar protegido con authenticateToken y retornar datos consolidados de Solar + Andelsa en paralelo', async () => {
            const layer = getRouteLayer('/solar-andelsa/dashboard', 'get');
            assert.ok(layer, 'La ruta GET /solar-andelsa/dashboard debe estar registrada');

            const { req, res } = createMockReqRes({
                query: {
                    fecha: '2026-10-12',
                    year: '2026',
                    month: '10',
                    startDate: '2026-10-01',
                    endDate: '2026-10-12'
                }
            });

            await aiRouter.handleSolarAndelsaDashboard(req, res);

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.ok(res.body.timestamp);

            // Bloque Solar
            const { solar } = res.body;
            assert.ok(solar, 'Debe incluir bloque solar');
            assert.ok(Array.isArray(solar.instalaciones));
            assert.strictEqual(solar.resumen.potencia_total_kwp, 95);
            assert.ok(solar.estadoActual);
            assert.ok(solar.ahorroDiario);
            assert.ok(solar.ahorroDiario.total_ahorro_usd > 0);
            assert.ok(solar.ahorroMensual);
            assert.ok(solar.ahorroMensual.total_ahorro_usd > 0);
            assert.ok(solar.ahorroRango);
            assert.ok(solar.ahorroRango.total_ahorro_usd > 0);

            // Bloque Andelsa
            const { andelsa } = res.body;
            assert.ok(andelsa, 'Debe incluir bloque andelsa');
            assert.strictEqual(andelsa.company_id, 9);
            assert.ok(andelsa.finanzasResumen);
            assert.ok(andelsa.finanzasResumen.facturacion_total_usd > 0);
            assert.ok(andelsa.inventarios);
            assert.ok(Array.isArray(andelsa.inventarios.items));
            assert.ok(andelsa.costos);
            assert.ok(Array.isArray(andelsa.costos.items));
            assert.ok(andelsa.ventasPorCliente);
            assert.ok(Array.isArray(andelsa.ventasPorCliente.ranking));
            assert.ok(andelsa.ventasPorProducto);
            assert.ok(Array.isArray(andelsa.ventasPorProducto.ranking));
            assert.ok(andelsa.cuentasPorCobrar);
            assert.ok(Array.isArray(andelsa.cuentasPorCobrar.clientes_deudores));
        });
    });
});
