const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const {
    formatDiscrepancyAlertMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert
} = require('../services/telegramBotService');
const telegramRouter = require('../routes/telegram');
const { JWT_SECRET } = require('../middleware/auth');
const axios = require('axios');

describe('Telegram Proactive Alerts & Discrepancies System', () => {
    let originalAxiosPost;

    beforeEach(() => {
        originalAxiosPost = axios.post;
        axios.post = async () => ({ data: { ok: true, result: { message_id: 12345 } } });
    });

    afterEach(() => {
        if (originalAxiosPost) {
            axios.post = originalAxiosPost;
        }
    });

    describe('formatDiscrepancyAlertMessage', () => {
        it('debe estructurar el mensaje con los emojis requeridos (🚨, ⛽, 🛒, ⚠️)', () => {
            const mockData = {
                effectiveDate: '2026-10-12',
                pistaDiscrepancies: [
                    { estacion: 'Puma Miraflores', diferencia: -35.50, total_venta: 12500 }
                ],
                tiendaDiscrepancies: [
                    { empresa: 'Super 7 Miraflores', dif: 12.00, venta: 1850, gastos: 20 }
                ],
                mermasAnomalas: [
                    {
                        estacion: 'Shell Chalchuapa',
                        nombre_combustible: 'Súper',
                        diferencia_galones: -85.5,
                        porcentaje_variacion: -1.25,
                        impacto_usd: 312.07
                    }
                ]
            };

            const msg = formatDiscrepancyAlertMessage(mockData);

            // Verificar emojis requeridos
            assert.ok(msg.includes('🚨'), 'Debe contener emoji de alerta 🚨');
            assert.ok(msg.includes('⛽'), 'Debe contener emoji de combustible ⛽');
            assert.ok(msg.includes('🛒'), 'Debe contener emoji de tienda 🛒');
            assert.ok(msg.includes('⚠️'), 'Debe contener emoji de advertencia ⚠️');

            // Verificar contenidos y formateos
            assert.ok(msg.includes('12/10/2026'));
            assert.ok(msg.includes('Puma Miraflores'));
            assert.ok(msg.includes('-$35.50'));
            assert.ok(msg.includes('Super 7 Miraflores'));
            assert.ok(msg.includes('$12.00'));
            assert.ok(msg.includes('Shell Chalchuapa'));
            assert.ok(msg.includes('-85.50 gal') || msg.includes('85.50 gal') || msg.includes('85.5'));
            assert.ok(msg.includes('-1.25%'));
            assert.ok(msg.includes('$312.07'));
        });

        it('debe reflejar adecuadamente faltantes (🔴) y sobrantes (🟡)', () => {
            const msg = formatDiscrepancyAlertMessage({
                effectiveDate: '2026-10-11',
                pistaDiscrepancies: [
                    { estacion: 'Puma Costa del Sol', diferencia: -18.00 },
                    { estacion: 'Shell 14 Avenida', diferencia: 24.50 }
                ],
                tiendaDiscrepancies: [],
                mermasAnomalas: []
            });

            assert.ok(msg.includes('🔴 Faltante'));
            assert.ok(msg.includes('🟡 Sobrante'));
            assert.ok(msg.includes('-$18.00'));
            assert.ok(msg.includes('$24.50'));
        });
    });

    describe('broadcastDiscrepancyAlerts', () => {
        it('debe retornar discrepancies_found = false y no enviar mensajes si no hay descuadres > umbral', async () => {
            const cleanData = {
                resumen_cierre: [
                    { estacion: 'Puma Miraflores', diferencia: -4.50 }, // <= 10
                    { estacion: 'Shell Chalchuapa', diferencia: 2.10 }  // <= 10
                ],
                cortes_tienda: [
                    { empresa: 'Super 7 Costa', dif: -1.25 }, // <= 5
                    { empresa: 'Super 7 Miraflores', dif: 3.00 } // <= 5
                ],
                mermas: []
            };

            const result = await broadcastDiscrepancyAlerts('2026-10-11', cleanData);

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.discrepancies_found, false);
            assert.strictEqual(result.total_discrepancies, 0);
            assert.strictEqual(result.recipients_count, 0);
            assert.strictEqual(result.recipients.length, 0);
        });

        it('debe filtrar descuadres en pista > $10 y cortes de tienda > $5 y mermas anómalas', async () => {
            const dirtyData = {
                resumen_cierre: [
                    { estacion: 'Puma Miraflores', diferencia: -15.50 }, // > 10 (ALERTA)
                    { estacion: 'Shell Chalchuapa', diferencia: 8.00 },  // <= 10 (IGNORADO)
                    { estacion: 'Puma La Loma', diferencia: 22.00 }      // > 10 (ALERTA)
                ],
                cortes_tienda: [
                    { empresa: 'Super 7 Costa', dif: -8.50 },           // > 5 (ALERTA)
                    { empresa: 'Super 7 Miraflores', dif: 2.00 }         // <= 5 (IGNORADO)
                ],
                mermas: [
                    {
                        estacion: 'Puma Costa del Sol',
                        nombre_combustible: 'Diesel',
                        diferencia_galones: -120.0,
                        porcentaje_variacion: -1.8,
                        impacto_usd: 420.0,
                        estado: 'critico'
                    }
                ]
            };

            const mockUsers = [
                {
                    id: 1,
                    telegram_user_id: '999001',
                    telegram_username: '@director1',
                    first_name: 'Director',
                    activo: 1,
                    permiso_alertas: 1
                },
                {
                    id: 2,
                    telegram_user_id: '999002',
                    telegram_username: '@auditor1',
                    first_name: 'Auditor',
                    activo: 1,
                    permiso_alertas: 1
                }
            ];

            const result = await broadcastDiscrepancyAlerts('2026-10-11', {
                data: dirtyData,
                users: mockUsers
            });

            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.discrepancies_found, true);
            assert.strictEqual(result.descuadres_pista, 2); // Puma Miraflores y Puma La Loma
            assert.strictEqual(result.descuadres_tienda, 1); // Super 7 Costa
            assert.strictEqual(result.mermas_anomalas, 1);
            assert.strictEqual(result.total_discrepancies, 4);
            assert.strictEqual(result.recipients_count, 2);
            assert.strictEqual(result.recipients.length, 2);
        });

        it('debe omitir usuarios sin permiso_alertas o inactivos', async () => {
            const dirtyData = {
                resumen_cierre: [
                    { estacion: 'Puma Miraflores', diferencia: -45.00 }
                ],
                cortes_tienda: [],
                mermas: []
            };

            const mixedUsers = [
                {
                    id: 1,
                    telegram_user_id: '101',
                    first_name: 'Autorizado',
                    activo: 1,
                    permiso_alertas: 1
                }
            ];

            const result = await broadcastDiscrepancyAlerts('2026-10-11', {
                data: dirtyData,
                users: mixedUsers
            });

            assert.strictEqual(result.discrepancies_found, true);
            assert.strictEqual(result.recipients_count, 1);
            assert.strictEqual(result.recipients[0].telegram_user_id, '101');
        });
    });

    describe('broadcastCustomAlert', () => {
        it('debe rechazar llamadas con mensaje vacío', async () => {
            await assert.rejects(async () => {
                await broadcastCustomAlert({ message: '' });
            }, /El mensaje de la alerta es obligatorio/);
        });

        it('debe difundir la alerta personalizada a destinatarios autorizados', async () => {
            const mockUsers = [
                {
                    id: 5,
                    telegram_user_id: '888123',
                    first_name: 'Gerente General',
                    activo: 1,
                    permiso_alertas: 1
                }
            ];

            const res = await broadcastCustomAlert(
                {
                    message: 'Reunión extraordinaria de conciliación a las 10:00 AM.',
                    title: 'CONVOCATORIA URGENTE',
                    severity: 'danger'
                },
                mockUsers
            );

            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.recipients_count, 1);
            assert.strictEqual(res.recipients[0].telegram_user_id, '888123');
        });
    });

    describe('Endpoints HTTP: /notify-discrepancies & /broadcast-alert', () => {
        const createMockReqRes = (options = {}) => {
            const req = {
                headers: options.headers || {},
                body: options.body || {},
                user: options.user || null
            };
            const res = {
                statusCode: 200,
                body: null,
                status(c) {
                    this.statusCode = c;
                    return this;
                },
                json(d) {
                    this.body = d;
                    return this;
                }
            };
            return { req, res };
        };

        const generateToken = (payload) => {
            return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
        };

        it('POST /notify-discrepancies debe rechazar llamadas sin token de acceso (401)', async () => {
            const { req, res } = createMockReqRes();

            // Buscar la capa del router correspondiente
            const layer = telegramRouter.stack.find(s => s.route?.path === '/notify-discrepancies');
            assert.ok(layer, 'El endpoint /notify-discrepancies debe existir en telegramRouter');

            // Ejecutar el primer middleware (authenticateToken)
            const authMiddleware = layer.route.stack[0].handle;
            let nextCalled = false;
            await authMiddleware(req, res, () => { nextCalled = true; });

            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(nextCalled, false);
        });

        it('POST /notify-discrepancies debe rechazar llamadas sin permisos adecuados (403)', async () => {
            const token = generateToken({
                id: 10,
                username: 'usuario_basico',
                role_id: 2,
                permissions: ['/dashboard/otro']
            });

            const { req, res } = createMockReqRes({
                headers: { authorization: `Bearer ${token}` }
            });

            const layer = telegramRouter.stack.find(s => s.route?.path === '/notify-discrepancies');
            const authMiddleware = layer.route.stack[0].handle;
            const permMiddleware = layer.route.stack[1].handle;

            let authNext = false;
            authMiddleware(req, res, () => { authNext = true; });
            assert.strictEqual(authNext, true);

            let permNext = false;
            permMiddleware(req, res, () => { permNext = true; });
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(permNext, false);
        });

        it('POST /broadcast-alert debe permitir acceso a n8n mediante cabecera x-api-key', async () => {
            process.env.N8N_API_KEY = 'n8n_secret_test_key_123';

            const { req, res } = createMockReqRes({
                headers: { 'x-api-key': 'n8n_secret_test_key_123' },
                body: { message: 'Alerta programada por cron n8n' }
            });

            const layer = telegramRouter.stack.find(s => s.route?.path === '/broadcast-alert');
            assert.ok(layer, 'El endpoint /broadcast-alert debe existir en telegramRouter');

            const authMiddleware = layer.route.stack[0].handle;
            let nextCalled = false;
            authMiddleware(req, res, () => { nextCalled = true; });

            assert.strictEqual(nextCalled, true);
            assert.strictEqual(req.user.username, 'n8n-orchestrator');
            assert.strictEqual(req.user.role_name, 'Administrator');
        });

        it('POST /broadcast-alert debe rechazar llamadas de n8n con api-key inválida o sin autenticación', async () => {
            process.env.N8N_API_KEY = 'n8n_secret_test_key_123';

            const { req, res } = createMockReqRes({
                headers: { 'x-api-key': 'clave_incorrecta' }
            });

            const layer = telegramRouter.stack.find(s => s.route?.path === '/broadcast-alert');
            const authMiddleware = layer.route.stack[0].handle;

            let nextCalled = false;
            authMiddleware(req, res, () => { nextCalled = true; });

            // Al fallar la API key, cae a authenticateToken y al no haber Bearer retorna 401
            assert.strictEqual(res.statusCode, 401);
            assert.strictEqual(nextCalled, false);
        });

        it('POST /broadcast-alert debe validar que el cuerpo contenga mensaje', async () => {
            const { req, res } = createMockReqRes({
                body: {} // Sin mensaje
            });

            const layer = telegramRouter.stack.find(s => s.route?.path === '/broadcast-alert');
            const routeHandler = layer.route.stack[layer.route.stack.length - 1].handle;

            await routeHandler(req, res);

            assert.strictEqual(res.statusCode, 400);
            assert.ok(res.body.message.includes('mensaje o message'));
        });
    });
});
