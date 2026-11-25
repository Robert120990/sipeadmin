const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const dbModule = require('../db');
const aiRouter = require('../routes/ai');
const {
    getMainReplyKeyboard,
    getHideReplyKeyboard,
    getMainInlineMenuMarkup,
    getCollapsedInlineMenuMarkup,
    parseNaturalLanguageQuery,
    getPreciosCompetenciaData,
    formatPreciosCompetenciaMessage,
    getCompetenciaInlineMarkup,
    calcPriceDiff,
    extractCompetitorBrand,
    handleSmartNaturalLanguageQuery,
    handleCallbackQuery,
    buildAndSendTopicPdf,
    clearQueryCache,
    clearUserConversationContext,
    getUserConversationContext
} = require('../services/telegramBotService');

const SAMPLE_COMPETENCIA_ROWS = [
    {
        id_estacion: '002',
        titulo: 'Puma Miraflores',
        estacion: 'PUMA MIRAFLORES',
        modificacion: '13/11/2026',
        super_c: 3.94,
        regular_c: 3.69,
        ion_c: 0,
        diesel_c: 3.49,
        super_a: 3.85,
        regular_a: 3.60,
        ion_a: 0,
        diesel_a: 3.40,
        es_propia: 1
    },
    {
        id_estacion: '002',
        titulo: 'Puma Miraflores',
        estacion: 'TEXACO LOS HEROES',
        modificacion: '13/11/2026',
        super_c: 3.95,
        regular_c: 3.70,
        ion_c: 0,
        diesel_c: 3.46,
        super_a: 3.86,
        regular_a: 3.61,
        ion_a: 0,
        diesel_a: 3.37, // -$0.03 vs Puma Miraflores
        es_propia: 0
    },
    {
        id_estacion: '002',
        titulo: 'Puma Miraflores',
        estacion: 'UNO BULEVAR',
        modificacion: '13/11/2026',
        super_c: 3.96,
        regular_c: 3.71,
        ion_c: 0,
        diesel_c: 3.51,
        super_a: 3.87,
        regular_a: 3.62,
        ion_a: 0,
        diesel_a: 3.42,
        es_propia: 0
    },
    {
        id_estacion: '006',
        titulo: 'Shell Chalchuapa',
        estacion: 'SHELL CHALCHUAPA',
        modificacion: '13/11/2026',
        super_c: 3.98,
        regular_c: 3.73,
        ion_c: 0,
        diesel_c: 3.53,
        super_a: 3.89,
        regular_a: 3.64,
        ion_a: 0,
        diesel_a: 3.44,
        es_propia: 1
    },
    {
        id_estacion: '006',
        titulo: 'Shell Chalchuapa',
        estacion: 'DLC CHALCHUAPA',
        modificacion: '13/11/2026',
        super_c: 3.96,
        regular_c: 3.71,
        ion_c: 0,
        diesel_c: 3.53,
        super_a: 3.87, // -$0.02 vs Shell Chalchuapa
        regular_a: 3.64,
        ion_a: 0,
        diesel_a: 3.44,
        es_propia: 0
    }
];

describe('Telegram Bot & AI Gateway — Precios de la Competencia (DGEHM)', () => {
    let originalAxiosPost;
    let originalGetDb;
    let originalBotToken;
    let sentMessages;
    let sentDocuments;
    let callbackAnswers;

    beforeEach(() => {
        sentMessages = [];
        sentDocuments = [];
        callbackAnswers = [];
        originalAxiosPost = axios.post;
        originalGetDb = dbModule.getDb;
        originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
        process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token-competencia';
        clearQueryCache();
        clearUserConversationContext('777001');

        axios.post = async (url, payload) => {
            if (url.includes('/sendMessage')) {
                sentMessages.push(payload);
                return { data: { ok: true, result: { message_id: 100 + sentMessages.length } } };
            }
            if (url.includes('/sendDocument')) {
                sentDocuments.push(payload);
                return { data: { ok: true, result: { message_id: 200 + sentDocuments.length } } };
            }
            if (url.includes('/answerCallbackQuery')) {
                callbackAnswers.push(payload);
                return { data: { ok: true, result: true } };
            }
            return { data: { ok: true, result: true } };
        };
    });

    afterEach(() => {
        axios.post = originalAxiosPost;
        dbModule.getDb = originalGetDb;
        if (originalBotToken === undefined) {
            delete process.env.TELEGRAM_BOT_TOKEN;
        } else {
            process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
        }
        clearQueryCache();
    });

    describe('1. Teclado Principal e Interfaz de Botones', () => {
        it('debe incluir el botón "📊 Precios Competencia" en getMainReplyKeyboard()', () => {
            const kb = getMainReplyKeyboard();
            assert.ok(kb && Array.isArray(kb.keyboard));
            assert.strictEqual(kb.is_persistent, false, 'No debe quedar anclado permanentemente en pantalla');
            assert.strictEqual(kb.one_time_keyboard, true, 'Debe ocultarse al usarse');
            const allLabels = kb.keyboard.flat().map(btn => btn.text);
            assert.ok(allLabels.includes('📊 Precios Competencia'), 'Debe incluir botón 📊 Precios Competencia');
            assert.ok(allLabels.includes('❓ Ayuda'), 'Debe conservar botón de Ayuda');

            const hideKb = getHideReplyKeyboard();
            assert.deepStrictEqual(hideKb, { remove_keyboard: true });

            const inlineMenu = getMainInlineMenuMarkup();
            const inlineCbs = inlineMenu.inline_keyboard.flat().map(b => b.callback_data);
            assert.ok(inlineCbs.includes('menu_act:ventas_hoy'));
            assert.ok(inlineCbs.includes('menu_act:pagos'));
            assert.ok(inlineCbs.includes('menu_act:hide'));

            const collapsed = getCollapsedInlineMenuMarkup();
            assert.strictEqual(collapsed.inline_keyboard[0][0].callback_data, 'menu_act:show');
        });

        it('getCompetenciaInlineMarkup debe generar botones interactivos por estación, filtro y PDF', () => {
            const markup = getCompetenciaInlineMarkup('002');
            const callbacks = markup.inline_keyboard.flat().map(b => b.callback_data);
            assert.ok(callbacks.includes('comp_cheaper'));
            assert.ok(callbacks.includes('comp_all'));
            assert.ok(callbacks.includes('comp_st:002'));
            assert.ok(callbacks.includes('comp_st:016'));
            assert.ok(callbacks.includes('comp_sync'));
            assert.ok(callbacks.includes('pdf_rep:competencia'));

            const mirafloresBtn = markup.inline_keyboard.flat().find(b => b.callback_data === 'comp_st:002');
            assert.ok(mirafloresBtn.text.includes('✅'), 'Debe marcar con check la estación seleccionada');
        });
    });

    describe('2. NLU Semántico y Prevención de Colisiones', () => {
        it('debe reconocer solicitudes naturales y comandos de precios de la competencia', () => {
            const queries = [
                'revisar los precios de la competencia',
                '📊 Precios Competencia',
                '/competencia',
                '/precios',
                '/dgehm',
                '¿Cómo están los precios de la competencia hoy?',
                'comparar precios del mercado',
                'diferencia de precios con la competencia'
            ];

            for (const q of queries) {
                const parsed = parseNaturalLanguageQuery(q);
                assert.strictEqual(parsed.isCompetencia, true, `Fallo al detectar isCompetencia en: "${q}"`);
                assert.strictEqual(parsed.isAlertas, false, `No debe colisionar con isAlertas en: "${q}"`);
                assert.strictEqual(parsed.isRanking, false, `No debe colisionar con isRanking en: "${q}"`);
            }
        });

        it('debe detectar consultas por combustible más barato sin colisionar con ranking de ventas', () => {
            const parsed = parseNaturalLanguageQuery('¿Quién tiene más barato el diésel?');
            assert.strictEqual(parsed.isCompetencia, true);
            assert.strictEqual(parsed.onlyCheaper, true);
            assert.strictEqual(parsed.isRanking, false);
            assert.strictEqual(parsed.matchedFuel?.key, 'diesel');
        });

        it('debe detectar estación específica (incluyendo Shell Poliedro 016) y marcas competidoras', () => {
            const pMira = parseNaturalLanguageQuery('precios de competencia en Miraflores');
            assert.strictEqual(pMira.isCompetencia, true);
            assert.strictEqual(pMira.matchedStation?.id, '002');

            const pPoli = parseNaturalLanguageQuery('precios de competencia en Poliedro');
            assert.strictEqual(pPoli.isCompetencia, true);
            assert.strictEqual(pPoli.matchedStation?.id, '016');

            const pTexaco = parseNaturalLanguageQuery('precios de Texaco');
            assert.strictEqual(pTexaco.isCompetencia, true);
            assert.strictEqual(pTexaco.matchedCompetitorBrand, 'Texaco');

            const pUno = parseNaturalLanguageQuery('precios de gasolinera Uno');
            assert.strictEqual(pUno.isCompetencia, true);
            assert.strictEqual(pUno.matchedCompetitorBrand, 'Uno');
        });

        it('NO debe generar falsos positivos con el artículo "uno", alertas operativas ni costos de Andelsa', () => {
            const pAlert = parseNaturalLanguageQuery('uno de los cierres tuvo descuadre ayer');
            assert.strictEqual(pAlert.isCompetencia, false);
            assert.strictEqual(pAlert.isAlertas, true);

            const pAndelsa = parseNaturalLanguageQuery('costo y margen de productos de Andelsa');
            assert.strictEqual(pAndelsa.isCompetencia, false);
            assert.strictEqual(pAndelsa.isAndelsaCostos, true);
        });

        it('debe mantener contexto multi-turno en competencia y permitir cambiar a ventas explícitas', () => {
            const ctx = { lastTopic: 'competencia', lastStationId: '002', lastStationName: 'Puma Miraflores' };

            const fStation = parseNaturalLanguageQuery('¿Y en Chalchuapa?', ctx);
            assert.strictEqual(fStation.isCompetencia, true);
            assert.strictEqual(fStation.matchedStation?.id, '006');

            const fFuel = parseNaturalLanguageQuery('¿Y de regular?', ctx);
            assert.strictEqual(fFuel.isCompetencia, true);
            assert.strictEqual(fFuel.matchedFuel?.key, 'regular');
            assert.strictEqual(fFuel.matchedStation?.id, '002');

            const fSales = parseNaturalLanguageQuery('¿Cuánto vendió Miraflores ayer?', ctx);
            assert.strictEqual(fSales.isCompetencia, false);
            assert.strictEqual(fSales.matchedStation?.id, '002');
        });
    });

    describe('3. Cálculo de Diferenciales, Agrupación y Formateadores', () => {
        it('calcPriceDiff y extractCompetitorBrand deben clasificar con exactitud', () => {
            const dCheaper = calcPriceDiff(3.37, 3.40);
            assert.strictEqual(dCheaper.diff, -0.03);
            assert.strictEqual(dCheaper.formatted, '-$0.03');
            assert.strictEqual(dCheaper.icon, '🔻');

            const dHigher = calcPriceDiff(3.87, 3.85);
            assert.strictEqual(dHigher.diff, 0.02);
            assert.strictEqual(dHigher.formatted, '+$0.02');
            assert.strictEqual(dHigher.icon, '🔺');

            assert.strictEqual(extractCompetitorBrand('TEXACO LOS HEROES'), 'Texaco');
            assert.strictEqual(extractCompetitorBrand('ESTACION UNO BULEVAR'), 'Uno');
            assert.strictEqual(extractCompetitorBrand('DLC CHALCHUAPA'), 'DLC');
        });

        it('getPreciosCompetenciaData debe agrupar por zona, detectar propias y listar competidores más baratos', async () => {
            const data = await getPreciosCompetenciaData({
                customRows: SAMPLE_COMPETENCIA_ROWS,
                ultimaValidacion: '2026-11-13T12:00:00Z'
            });

            assert.strictEqual(data.totalMonitoreadas, 5);
            assert.strictEqual(data.totalCompetidores, 3);
            assert.strictEqual(data.totalZonas, 2);
            assert.strictEqual(data.competidoresMasBaratos.length, 2);

            const texaco = data.competidoresMasBaratos.find(c => c.estacion === 'TEXACO LOS HEROES');
            assert.ok(texaco);
            assert.strictEqual(texaco.cheaperFuels[0].fuel, 'Diésel');
            assert.strictEqual(texaco.cheaperFuels[0].formatted, '-$0.03');
        });

        it('formatPreciosCompetenciaMessage debe renderizar vistas global, estación, más baratos, marca, combustible y vacío (< 3700 chars)', async () => {
            const data = await getPreciosCompetenciaData({ customRows: SAMPLE_COMPETENCIA_ROWS });

            const globalMsg = formatPreciosCompetenciaMessage(data);
            assert.ok(globalMsg.includes('PRECIOS DE LA COMPETENCIA (DGEHM)'));
            assert.ok(globalMsg.includes('Puma Miraflores'));
            assert.ok(globalMsg.length < 3700);

            const stationMsg = formatPreciosCompetenciaMessage(data, { station: '002' });
            assert.ok(stationMsg.includes('PUMA MIRAFLORES'));
            assert.ok(stationMsg.includes('TEXACO LOS HEROES'));
            assert.ok(stationMsg.includes('-$0.03'));

            const cheaperMsg = formatPreciosCompetenciaMessage(data, { onlyCheaper: true });
            assert.ok(cheaperMsg.includes('COMPETIDORES CON PRECIO MENOR A SIPE'));
            assert.ok(cheaperMsg.includes('TEXACO LOS HEROES'));
            assert.ok(cheaperMsg.includes('DLC CHALCHUAPA'));
            assert.ok(!cheaperMsg.includes('UNO BULEVAR'));

            const brandMsg = formatPreciosCompetenciaMessage(data, { brand: 'Texaco' });
            assert.ok(brandMsg.includes('MARCA TEXACO'));
            assert.ok(brandMsg.includes('TEXACO LOS HEROES'));

            const fuelMsg = formatPreciosCompetenciaMessage(data, { fuel: 'diesel' });
            assert.ok(fuelMsg.includes('COMPARATIVO DE PRECIOS • DIESEL'));
            assert.ok(fuelMsg.includes('$3.37'));

            const emptyMsg = formatPreciosCompetenciaMessage({ rows: [], zonas: [] });
            assert.ok(emptyMsg.includes('Sincronizar DGEHM'));
        });
    });

    describe('4. Despachador de Bot, Callbacks, Permisos y Reporte PDF Tamaño Carta', () => {
        it('handleSmartNaturalLanguageQuery debe responder con precios y guardar contexto multi-turno', async () => {
            dbModule.getDb = () => ({
                query: async (sql) => {
                    if (sql.includes('web_precios_competencia_historial')) {
                        return [[{ ultima_validacion: '2026-11-13T14:00:00Z' }]];
                    }
                    if (sql.includes('web_precios_competencia')) {
                        return [SAMPLE_COMPETENCIA_ROWS];
                    }
                    return [[]];
                }
            });

            const user = { telegram_user_id: '777001', first_name: 'Raul', activo: 1 };
            const perms = { ventas: true, precios_competencia: true };
            const handled = await handleSmartNaturalLanguageQuery(
                user,
                'revisar los precios de la competencia en Miraflores',
                777001,
                perms,
                getMainReplyKeyboard()
            );

            assert.strictEqual(handled, true);
            assert.strictEqual(sentMessages.length, 1);
            assert.ok(sentMessages[0].text.includes('PRECIOS DE COMPETENCIA • PUMA MIRAFLORES'));
            assert.ok(sentMessages[0].text.includes('TEXACO LOS HEROES'));

            const savedCtx = getUserConversationContext('777001');
            assert.strictEqual(savedCtx.lastTopic, 'competencia');
            assert.strictEqual(savedCtx.lastStationId, '002');
        });

        it('handleSmartNaturalLanguageQuery debe denegar acceso si el usuario no tiene permiso de precios_competencia', async () => {
            const user = { telegram_user_id: '777002', first_name: 'Invitado', activo: 1 };
            const perms = { ventas: false, alertas: false, precios_competencia: false };
            const handled = await handleSmartNaturalLanguageQuery(
                user,
                'revisar los precios de la competencia',
                777002,
                perms,
                getMainReplyKeyboard()
            );

            assert.strictEqual(handled, true);
            assert.strictEqual(sentMessages.length, 1);
            assert.ok(sentMessages[0].text.includes('No tienes permiso asignado para consultar precios de la competencia'));
        });

        it('handleCallbackQuery debe responder a comp_cheaper y comp_st:006 para usuarios autorizados', async () => {
            dbModule.getDb = () => ({
                query: async (sql) => {
                    if (sql.includes('FROM telegram_usuarios')) {
                        return [[{ id: 1, telegram_user_id: '777001', activo: 1, permiso_ventas: 1, user_id: null }]];
                    }
                    if (sql.includes('web_precios_competencia_historial')) {
                        return [[{ ultima_validacion: '2026-11-13T14:00:00Z' }]];
                    }
                    if (sql.includes('web_precios_competencia')) {
                        return [SAMPLE_COMPETENCIA_ROWS];
                    }
                    return [[]];
                }
            });

            await handleCallbackQuery({
                id: 'cq-1',
                data: 'comp_cheaper',
                from: { id: 777001, first_name: 'Raul' },
                message: { chat: { id: 777001 }, message_id: 50 }
            });

            assert.strictEqual(sentMessages.length, 1);
            assert.ok(sentMessages[0].text.includes('COMPETIDORES CON PRECIO MENOR A SIPE'));

            await handleCallbackQuery({
                id: 'cq-2',
                data: 'comp_st:006',
                from: { id: 777001, first_name: 'Raul' },
                message: { chat: { id: 777001 }, message_id: 51 }
            });

            assert.strictEqual(sentMessages.length, 2);
            assert.ok(sentMessages[1].text.includes('SHELL CHALCHUAPA'));
        });

        it('handleCallbackQuery menu_act:open muestra el menú inline en pantalla y /ocultar quita teclado inferior', async () => {
            dbModule.getDb = () => ({
                query: async (sql) => {
                    if (sql.includes('FROM telegram_usuarios')) {
                        return [[{ id: 1, telegram_user_id: '777001', activo: 1, permiso_ventas: 1, user_id: null }]];
                    }
                    return [[]];
                }
            });

            await handleCallbackQuery({
                id: 'cq-menu-open',
                data: 'menu_act:open',
                from: { id: 777001, first_name: 'Raul' },
                message: { chat: { id: 777001 }, message_id: 52 }
            });

            assert.strictEqual(sentMessages.length, 1);
            assert.ok(sentMessages[0].text.includes('Menú Principal'));
            assert.ok(Array.isArray(sentMessages[0].reply_markup?.inline_keyboard));
            assert.ok(sentMessages[0].reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'menu_act:hide'));
        });

        it('buildAndSendTopicPdf("competencia") debe generar y enviar un documento PDF válido en tamaño Carta (Letter)', async () => {
            dbModule.getDb = () => ({
                query: async (sql) => {
                    if (sql.includes('web_precios_competencia')) {
                        return [SAMPLE_COMPETENCIA_ROWS];
                    }
                    return [[]];
                }
            });

            await buildAndSendTopicPdf(777001, 'competencia');
            assert.strictEqual(sentDocuments.length, 1);
            const docPayload = sentDocuments[0];
            assert.ok(docPayload.filename.startsWith('Reporte_Precios_Competencia_'));
            assert.ok(Buffer.isBuffer(docPayload.fileBuffer));
            const pdfHeader = docPayload.fileBuffer.subarray(0, 5).toString('ascii');
            assert.strictEqual(pdfHeader, '%PDF-');
            const pdfRawStr = docPayload.fileBuffer.toString('latin1');
            assert.ok(pdfRawStr.includes('612') && pdfRawStr.includes('792'), 'El PDF debe ser tamaño Carta (612 x 792 pt)');
        });
    });

    describe('5. AI Gateway POST /api/ai/query — Precios de Competencia', () => {
        it('debe resolver "revisar los precios de la competencia" con intent precios_competencia, KPIs y tabla', async () => {
            dbModule.getDb = () => ({
                query: async (sql) => {
                    if (sql.includes('web_precios_competencia')) {
                        return [SAMPLE_COMPETENCIA_ROWS];
                    }
                    return [[]];
                }
            });

            const req = {
                headers: { 'x-api-key': 'sipe-ai-gateway-2026' },
                body: { query: 'revisar los precios de la competencia' },
                user: { id: 1, username: 'admin', role: 'Administrator', isApiKey: true }
            };
            const res = {
                statusCode: 200,
                body: null,
                status(code) { this.statusCode = code; return this; },
                json(payload) { this.body = payload; return this; }
            };

            await aiRouter.handleAiQuery(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.ok, true);
            assert.strictEqual(res.body.intent, 'precios_competencia');
            assert.ok(res.body.replyHtml.includes('PRECIOS DE LA COMPETENCIA'));
            assert.strictEqual(res.body.kpis.length, 4);
            assert.ok(Array.isArray(res.body.tableData.rows));
            assert.strictEqual(res.body.tableData.rows.length, 5);
        });

        it('debe retornar 403 en POST /api/ai/query si el usuario carece de permisos de competencia', async () => {
            const req = {
                headers: {},
                body: { query: 'revisar los precios de la competencia' },
                user: { id: 99, username: 'operador_limitado', role: 'Operator', permissions: ['/dashboard/bancos/cheques'] }
            };
            const res = {
                statusCode: 200,
                body: null,
                status(code) { this.statusCode = code; return this; },
                json(payload) { this.body = payload; return this; }
            };

            await aiRouter.handleAiQuery(req, res);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.ok, false);
        });
    });
});
