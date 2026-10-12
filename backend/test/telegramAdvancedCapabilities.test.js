const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const dbModule = require('../db');
const consultasModule = require('../routes/consultas');
const {
    transcribeTelegramVoice,
    userConversationContext,
    getUserConversationContext,
    setUserConversationContext,
    clearUserConversationContext,
    pendingAlertJustifications,
    getDiscrepancyInlineMarkup,
    formatDiscrepancyAlertMessage,
    formatFeedbackListMessage,
    handleIncomingMessage,
    handleCallbackQuery,
    parseNaturalLanguageQuery,
    parseSpanishPeriodOrDate,
    shiftDate,
    findStationById,
    findFuelByKey,
    broadcastDiscrepancyAlerts
} = require('../services/telegramBotService');

describe('OpenClaw Telegram Bot - Advanced Capabilities', () => {
    let originalAxiosPost;
    let originalAxiosGet;
    let originalGeminiKey;
    let originalPoolQuery;
    let originalGetConsolidado;
    let sentMessages = [];
    let answeredCallbacks = [];

    beforeEach(() => {
        sentMessages = [];
        answeredCallbacks = [];
        originalAxiosPost = axios.post;
        originalAxiosGet = axios.get;
        originalGeminiKey = process.env.GEMINI_API_KEY;
        originalGetConsolidado = consultasModule.getConsolidadoVentasData;

        consultasModule.getConsolidadoVentasData = async () => ({
            estaciones: [
                {
                    id: '008',
                    id_empresa: '008',
                    empresa: 'Puma Costa del Sol',
                    total_venta: 15400,
                    venta: 15400,
                    galones: 4500,
                    galonaje: 4500,
                    diesel: 2000,
                    regular: 1500,
                    super: 1000,
                    ion_diesel: 0
                }
            ],
            resumen_cierre: [
                {
                    estacion: 'Puma Costa del Sol',
                    estacion_id: '008',
                    branch_id: '008',
                    diferencia: -35.0,
                    dif: -35.0,
                    total_venta: 15400
                }
            ],
            cortes_tienda: [
                {
                    empresa: 'Super 7 Costa del Sol',
                    tienda_nombre: 'Super 7 Costa del Sol',
                    estacion_id: '008',
                    branch_id: '008',
                    venta: 1200,
                    gastos: 50,
                    dif: -12.0
                }
            ],
            tiendas: [
                {
                    empresa: 'Super 7 Costa del Sol',
                    venta: 1200,
                    gastos: 50
                }
            ],
            mermas: []
        });

        const pool = dbModule.getDb();
        if (pool) {
            originalPoolQuery = pool.query;
            pool.query = async (sql, params = []) => {
                const sqlStr = String(sql).toLowerCase();

                // telegram_config
                if (sqlStr.includes('telegram_config')) {
                    return [[{ bot_token: 'MOCK_TOKEN', is_active: 1 }]];
                }

                // telegram_usuarios lookup
                if (sqlStr.includes('from telegram_usuarios') && sqlStr.includes('where telegram_user_id')) {
                    const uid = String(params[0] || '12345');
                    const isAdminUser = uid === '999999' || uid === 'admin_user';
                    return [[{
                        id: 1,
                        telegram_user_id: uid,
                        telegram_username: isAdminUser ? '@admin_boss' : '@station_mgr',
                        first_name: isAdminUser ? 'Don Admin' : 'Gerente Puma',
                        last_name: 'SIPE',
                        activo: 1,
                        permiso_ventas: 1,
                        permiso_bancos: 1,
                        permiso_chequera: 1,
                        permiso_alertas: 1,
                        is_admin: isAdminUser ? 1 : 0
                    }]];
                }

                // update telegram_usuarios
                if (sqlStr.includes('update telegram_usuarios')) {
                    return [{ affectedRows: 1 }];
                }

                // telegram_feedback list
                if (sqlStr.includes('from telegram_feedback')) {
                    return [[
                        {
                            id: 101,
                            telegram_user_id: '12345',
                            telegram_username: '@station_mgr',
                            first_name: 'Gerente Puma',
                            calificacion: 'UTIL',
                            consulta_original: 'cuanto vendio costa del sol ayer',
                            comentario_mejora: 'Excelente desglose',
                            estado: 'COMPLETADO',
                            created_at: new Date('2026-10-12T10:00:00Z')
                        },
                        {
                            id: 102,
                            telegram_user_id: '67890',
                            telegram_username: '@auditor_pista',
                            first_name: 'Auditor Turno',
                            calificacion: 'NO_UTIL',
                            consulta_original: 'diferencia en miraflores',
                            comentario_mejora: 'Faltó ver detalle de mangueras',
                            estado: 'ABIERTO',
                            created_at: new Date('2026-10-12T11:00:00Z')
                        }
                    ]];
                }

                // bitacora_logs or telegram_consultas insert
                if (sqlStr.includes('insert into bitacora_logs') || sqlStr.includes('insert into telegram_consultas')) {
                    return [{ insertId: 999 }];
                }

                return [[]];
            };
        }

        axios.post = async (url, data) => {
            const urlStr = String(url);
            if (urlStr.includes('/sendMessage')) {
                sentMessages.push(data);
                return { data: { ok: true, result: { message_id: Math.floor(Math.random() * 10000) } } };
            }
            if (urlStr.includes('/answerCallbackQuery')) {
                answeredCallbacks.push(data);
                return { data: { ok: true } };
            }
            if (urlStr.includes('/editMessageReplyMarkup')) {
                return { data: { ok: true } };
            }
            return { data: { ok: true } };
        };

        axios.get = async (url) => {
            const urlStr = String(url);
            if (urlStr.includes('/getFile')) {
                return { data: { ok: true, result: { file_path: 'voice/sample_audio.oga' } } };
            }
            if (urlStr.includes('/file/bot')) {
                return { data: Buffer.from('FAKE_OGG_AUDIO_CONTENT') };
            }
            return { data: { ok: true } };
        };
    });

    afterEach(() => {
        if (originalAxiosPost) axios.post = originalAxiosPost;
        if (originalAxiosGet) axios.get = originalAxiosGet;
        if (originalPoolQuery) {
            const pool = dbModule.getDb();
            if (pool) pool.query = originalPoolQuery;
        }
        if (originalGetConsolidado) {
            consultasModule.getConsolidadoVentasData = originalGetConsolidado;
        }
        process.env.GEMINI_API_KEY = originalGeminiKey;
        pendingAlertJustifications.clear();
    });

    // =========================================================================
    // 1. CAPABILITY 1: Voice Note Support (Audio-to-Text)
    // =========================================================================
    describe('1. Voice Note Support (Audio-to-Text)', () => {
        it('transcribeTelegramVoice debe rechazar buffers vacíos o inválidos', async () => {
            await assert.rejects(
                async () => transcribeTelegramVoice(null),
                /Buffer de audio inválido o vacío/
            );
            await assert.rejects(
                async () => transcribeTelegramVoice(Buffer.from('')),
                /Buffer de audio inválido o vacío/
            );
        });

        it('transcribeTelegramVoice debe alertar si GEMINI_API_KEY no está configurada', async () => {
            delete process.env.GEMINI_API_KEY;
            const testBuf = Buffer.from('AUDIO_TEST_DATA');
            await assert.rejects(
                async () => transcribeTelegramVoice(testBuf),
                /GEMINI_API_KEY no configurado en el servidor/
            );
        });

        it('transcribeTelegramVoice debe invocar Gemini 2.0 Flash y retornar la transcripción', async () => {
            process.env.GEMINI_API_KEY = 'test-gemini-key-12345';
            const genaiModule = require('@google/genai');
            const originalGoogleGenAI = genaiModule.GoogleGenAI;

            let capturedModel = null;
            let capturedPrompt = null;
            let capturedMime = null;

            genaiModule.GoogleGenAI = class MockGoogleGenAI {
                constructor({ apiKey }) {
                    assert.strictEqual(apiKey, 'test-gemini-key-12345');
                    this.models = {
                        generateContent: async ({ model, contents }) => {
                            capturedModel = model;
                            capturedPrompt = contents[0];
                            capturedMime = contents[1]?.inlineData?.mimeType;
                            return { text: 'cuanto vendio miraflores el dia de ayer' };
                        }
                    };
                }
            };

            try {
                const sampleAudio = Buffer.from('VOICE_AUDIO_STREAM_BINARY');
                const text = await transcribeTelegramVoice(sampleAudio, 'audio/ogg');
                assert.strictEqual(text, 'cuanto vendio miraflores el dia de ayer');
                assert.strictEqual(capturedModel, 'gemini-2.0-flash');
                assert.ok(capturedPrompt.includes('español salvadoreño formal'));
                assert.strictEqual(capturedMime, 'audio/ogg');
            } finally {
                genaiModule.GoogleGenAI = originalGoogleGenAI;
            }
        });

        it('handleIncomingMessage con nota de voz debe enviar aviso temporal y formatear respuesta con prefijo 🎙️', async () => {
            process.env.GEMINI_API_KEY = 'test-gemini-key';
            const genaiModule = require('@google/genai');
            const originalGoogleGenAI = genaiModule.GoogleGenAI;

            genaiModule.GoogleGenAI = class MockGoogleGenAI {
                constructor() {
                    this.models = {
                        generateContent: async () => ({ text: 'ventas de costa del sol' })
                    };
                }
            };

            try {
                const voiceMsg = {
                    message_id: 111,
                    from: { id: 12345, first_name: 'Gerente Puma' },
                    chat: { id: 12345 },
                    voice: {
                        file_id: 'voice_file_abc123',
                        mime_type: 'audio/ogg',
                        duration: 3
                    }
                };

                await handleIncomingMessage(voiceMsg);

                // Debe haberse enviado el mensaje temporal de escucha
                assert.ok(
                    sentMessages.some(m => m.text.includes('⏳ Escuchando y transcribiendo nota de voz...')),
                    'Debe enviar aviso temporal de escucha'
                );

                // Debe haberse procesado la consulta transcrita incluyendo el prefijo de voz
                const responseWithVoice = sentMessages.find(m => m.text.includes('🎙️') && m.text.includes('Costa del Sol'));
                assert.ok(responseWithVoice, 'Debe incluir respuesta final con el prefijo de voz formateado');
                assert.ok(responseWithVoice.text.includes('«ventas de costa del sol»'), 'Debe incluir texto transcrito entre comillas');
            } finally {
                genaiModule.GoogleGenAI = originalGoogleGenAI;
            }
        });

        it('handleIncomingMessage con nota de voz debe avisar con cordialidad si GEMINI_API_KEY falta', async () => {
            delete process.env.GEMINI_API_KEY;

            const voiceMsg = {
                message_id: 112,
                from: { id: 12345, first_name: 'Gerente' },
                chat: { id: 12345 },
                voice: { file_id: 'voice_no_key' }
            };

            await handleIncomingMessage(voiceMsg);

            const notConfiguredMsg = sentMessages.find(m => m.text.includes('Servicio de voz no disponible'));
            assert.ok(notConfiguredMsg, 'Debe informar que el servicio de voz no está configurado');
        });
    });

    // =========================================================================
    // 2. CAPABILITY 2: Multi-turn Conversational Context Memory
    // =========================================================================
    describe('2. Multi-turn Conversational Context Memory', () => {
        const testUserId = 'test_mgr_404';

        beforeEach(() => {
            clearUserConversationContext(testUserId);
        });

        it('userConversationContext, findStationById y findFuelByKey deben estar correctamente expuestos y operativos', () => {
            assert.ok(userConversationContext instanceof Map, 'userConversationContext debe ser una instancia de Map');
            const station = findStationById('008');
            assert.ok(station);
            assert.strictEqual(station.id, '008');
            assert.strictEqual(station.name, 'Puma Costa del Sol');

            const fuel = findFuelByKey('diesel');
            assert.ok(fuel);
            assert.strictEqual(fuel.key, 'diesel');
            assert.strictEqual(fuel.label, 'Diesel');
        });

        it('setUserConversationContext y getUserConversationContext deben almacenar y recuperar datos respetando TTL', () => {
            setUserConversationContext(testUserId, {
                lastStationId: '008',
                lastStationName: 'Puma Costa del Sol',
                lastDate: '2026-10-12',
                lastProduct: 'diesel',
                lastTopic: 'ventas_estacion',
                query: 'cuanto vendio diesel costa del sol'
            });

            const ctx = getUserConversationContext(testUserId);
            assert.ok(ctx);
            assert.strictEqual(ctx.lastStationId, '008');
            assert.strictEqual(ctx.lastStationName, 'Puma Costa del Sol');
            assert.strictEqual(ctx.lastDate, '2026-10-12');
            assert.strictEqual(ctx.lastProduct, 'diesel');
            assert.strictEqual(ctx.history.length, 1);
            assert.strictEqual(ctx.history[0].query, 'cuanto vendio diesel costa del sol');

            // Verificar expiración TTL (> 20 min)
            ctx.updatedAt = Date.now() - (21 * 60 * 1000);
            assert.strictEqual(getUserConversationContext(testUserId), null);
        });

        it('clearUserConversationContext debe limpiar la memoria del usuario', () => {
            setUserConversationContext(testUserId, { lastStationId: '002' });
            assert.ok(getUserConversationContext(testUserId));

            clearUserConversationContext(testUserId);
            assert.strictEqual(getUserConversationContext(testUserId), null);
        });

        it('shiftDate debe calcular fechas hacia atrás y adelante correctamente', () => {
            assert.strictEqual(shiftDate('2026-10-12', -1), '2026-10-11');
            assert.strictEqual(shiftDate('2026-10-01', -1), '2026-09-30');
            assert.strictEqual(shiftDate('2026-01-01', -1), '2025-12-31');
            assert.strictEqual(shiftDate('2026-10-12', -2), '2026-10-10');
            assert.strictEqual(shiftDate('2026-10-12', 1), '2026-10-13');
        });

        // 6 Follow-up Queries Patterns:
        it('Follow-up 1 (¿Y el día anterior? / ¿Y ayer? / ¿Y anteayer?): preserva estación y producto, mueve fecha hacia atrás', () => {
            const initialContext = {
                lastStationId: '008',
                lastStationName: 'Puma Costa del Sol',
                lastDate: '2026-10-12',
                lastProduct: 'diesel'
            };

            // "¿Y el día anterior?"
            const res1 = parseNaturalLanguageQuery('¿Y el día anterior?', initialContext);
            assert.strictEqual(res1.targetDate, '2026-10-11');
            assert.strictEqual(res1.matchedStation?.id, '008');
            assert.strictEqual(res1.matchedFuel?.key, 'diesel');

            // "¿Y ayer?"
            const res2 = parseNaturalLanguageQuery('¿Y ayer?', initialContext);
            assert.strictEqual(res2.targetDate, '2026-10-11');
            assert.strictEqual(res2.matchedStation?.id, '008');

            // "¿Y anteayer?"
            const res3 = parseNaturalLanguageQuery('¿Y anteayer?', initialContext);
            assert.strictEqual(res3.targetDate, '2026-10-10');
            assert.strictEqual(res3.matchedStation?.id, '008');
        });

        it('Follow-up 2 (¿Y en Costa del Sol? / ¿Y Miraflores?): preserva fecha y producto, cambia estación', () => {
            const initialContext = {
                lastStationId: '002', // Puma Miraflores
                lastStationName: 'Puma Miraflores',
                lastDate: '2026-10-12',
                lastProduct: 'diesel'
            };

            const res = parseNaturalLanguageQuery('¿Y en Costa del Sol?', initialContext);
            assert.strictEqual(res.matchedStation?.id, '008');
            assert.strictEqual(res.targetDate, '2026-10-12');
            assert.strictEqual(res.matchedFuel?.key, 'diesel');

            const res2 = parseNaturalLanguageQuery('¿Y Miraflores?', { lastDate: '2026-10-09' });
            assert.strictEqual(res2.matchedStation?.id, '002');
            assert.strictEqual(res2.targetDate, '2026-10-09');
        });

        it('Follow-up 3 (¿Y de diésel cuánto fue? / ¿Y regular? / ¿Y super?): preserva estación y fecha, filtra producto', () => {
            const initialContext = {
                lastStationId: '008',
                lastStationName: 'Puma Costa del Sol',
                lastDate: '2026-10-12'
            };

            const resDiesel = parseNaturalLanguageQuery('¿Y de diésel cuánto fue?', initialContext);
            assert.strictEqual(resDiesel.matchedFuel?.key, 'diesel');
            assert.strictEqual(resDiesel.matchedStation?.id, '008');
            assert.strictEqual(resDiesel.targetDate, '2026-10-12');

            const resRegular = parseNaturalLanguageQuery('¿Y regular?', initialContext);
            assert.strictEqual(resRegular.matchedFuel?.key, 'regular');
            assert.strictEqual(resRegular.matchedStation?.id, '008');
            assert.strictEqual(resRegular.targetDate, '2026-10-12');

            const resSuper = parseNaturalLanguageQuery('¿Y super?', initialContext);
            assert.strictEqual(resSuper.matchedFuel?.key, 'super');
            assert.strictEqual(resSuper.matchedStation?.id, '008');
            assert.strictEqual(resSuper.targetDate, '2026-10-12');
        });

        it('Follow-up 4 (¿A qué horas vendió más? / ¿Horas pico?): preserva estación y fecha, activa horas pico', () => {
            const initialContext = {
                lastStationId: '006', // Shell Chalchuapa
                lastStationName: 'Shell Chalchuapa',
                lastDate: '2026-10-11'
            };

            const res = parseNaturalLanguageQuery('¿A qué horas vendió más?', initialContext);
            assert.strictEqual(res.isHourlyPeak, true);
            assert.strictEqual(res.matchedStation?.id, '006');
            assert.strictEqual(res.targetDate, '2026-10-11');

            const res2 = parseNaturalLanguageQuery('¿Horas pico?', initialContext);
            assert.strictEqual(res2.isHourlyPeak, true);
            assert.strictEqual(res2.matchedStation?.id, '006');
        });

        it('Follow-up 5 (¿Y las tiendas?): preserva fecha y estación, analiza cortes de conveniencia', () => {
            const initialContext = {
                lastStationId: '008',
                lastStationName: 'Puma Costa del Sol',
                lastDate: '2026-10-12'
            };

            const res = parseNaturalLanguageQuery('¿Y las tiendas?', initialContext);
            assert.strictEqual(res.isTiendas, true);
            assert.strictEqual(res.matchedStation?.id, '008');
            assert.strictEqual(res.targetDate, '2026-10-12');
        });

        it('Follow-up 6 (¿Y el ahorro solar?): preserva fecha, analiza reportes de paneles y baterías', () => {
            const initialContext = {
                lastDate: '2026-10-10'
            };

            const res = parseNaturalLanguageQuery('¿Y el ahorro solar?', initialContext);
            assert.strictEqual(res.isSolar, true);
            assert.strictEqual(res.targetDate, '2026-10-10');
        });

        it('Comandos /start, /menu, /cancelar deben limpiar el contexto conversacional', async () => {
            const uid = 12345;
            setUserConversationContext(uid, {
                lastStationId: '008',
                lastDate: '2026-10-12'
            });
            assert.ok(getUserConversationContext(uid));

            // Enviar /menu
            await handleIncomingMessage({
                message_id: 301,
                from: { id: uid, first_name: 'Gerente' },
                chat: { id: uid },
                text: '/menu'
            });

            assert.strictEqual(getUserConversationContext(uid), null, 'Contexto debe haberse reseteado tras /menu');
        });
    });

    // =========================================================================
    // 3. CAPABILITY 3: Interactive Discrepancy Alerts with Quick Action Buttons
    // =========================================================================
    describe('3. Interactive Discrepancy Alerts with Quick Action Buttons', () => {
        it('getDiscrepancyInlineMarkup debe generar los 4 botones de acción requeridos', () => {
            const markup = getDiscrepancyInlineMarkup('2026-10-12', '008');
            assert.ok(markup.inline_keyboard);
            assert.strictEqual(markup.inline_keyboard.length, 2);

            // Fila 1
            const row1 = markup.inline_keyboard[0];
            assert.strictEqual(row1[0].text, '🔍 Ver Detalle');
            assert.strictEqual(row1[0].callback_data, 'alert_dtl:2026-10-12:008');
            assert.strictEqual(row1[1].text, '🏷️ Justificar');
            assert.strictEqual(row1[1].callback_data, 'alert_just:2026-10-12:008');

            // Fila 2
            const row2 = markup.inline_keyboard[1];
            assert.strictEqual(row2[0].text, '🔄 Re-verificar');
            assert.strictEqual(row2[0].callback_data, 'alert_recheck:2026-10-12:008');
            assert.strictEqual(row2[1].text, '📊 Resumen del Día');
            assert.strictEqual(row2[1].callback_data, 'alert_sum:2026-10-12');
        });

        it('formatDiscrepancyAlertMessage con withMarkup=true debe retornar objeto con text y reply_markup', () => {
            const res = formatDiscrepancyAlertMessage({
                effectiveDate: '2026-10-12',
                pistaDiscrepancies: [{ estacion: 'Puma Costa del Sol', diferencia: -35.0, estacion_id: '008' }],
                tiendaDiscrepancies: [],
                mermasAnomalas: []
            }, { withMarkup: true });

            assert.ok(typeof res === 'object');
            assert.ok(res.text.includes('🚨 <b>ALERTA GERENCIAL DE DISCREPANCIAS</b>'));
            assert.ok(res.reply_markup.inline_keyboard);
            assert.strictEqual(res.reply_markup.inline_keyboard[0][0].callback_data, 'alert_dtl:2026-10-12:008');
        });

        it('broadcastDiscrepancyAlerts debe incluir el teclado interactivo en el envío', async () => {
            const dirtyData = {
                resumen_cierre: [{ estacion: 'Puma Costa del Sol', diferencia: -45.00, estacion_id: '008' }],
                cortes_tienda: [],
                mermas: []
            };
            const mockUsers = [{
                id: 1,
                telegram_user_id: '777001',
                first_name: 'Director Operaciones',
                activo: 1,
                permiso_alertas: 1
            }];

            await broadcastDiscrepancyAlerts('2026-10-12', { data: dirtyData, users: mockUsers });

            const sentAlert = sentMessages.find(m => m.chat_id === '777001' && m.text.includes('ALERTA GERENCIAL'));
            assert.ok(sentAlert, 'Debe haber enviado la alerta');
            assert.ok(sentAlert.reply_markup, 'Debe haber adjuntado reply_markup');
            assert.strictEqual(sentAlert.reply_markup.inline_keyboard[0][0].text, '🔍 Ver Detalle');
        });

        it('handleCallbackQuery: alert_dtl debe responder con desglose de la estación', async () => {
            const cq = {
                id: 'cq_1001',
                data: 'alert_dtl:2026-10-12:008',
                from: { id: 12345, first_name: 'Gerente' },
                message: { chat: { id: 12345 }, message_id: 501 }
            };

            await handleCallbackQuery(cq);

            assert.ok(answeredCallbacks.some(c => c.callback_query_id === 'cq_1001'));
            const detailMsg = sentMessages.find(m => m.text.includes('Detalle Operativo de Auditoría'));
            assert.ok(detailMsg, 'Debe enviar el detalle operativo');
            assert.ok(detailMsg.text.includes('Puma Costa del Sol') || detailMsg.text.includes('008'));
        });

        it('handleCallbackQuery: alert_just debe iniciar justificación interactiva y registrar el motivo', async () => {
            const uid = 12345;
            const cq = {
                id: 'cq_1002',
                data: 'alert_just:2026-10-12:008',
                from: { id: uid, first_name: 'Gerente Puma' },
                message: { chat: { id: uid }, message_id: 502 }
            };

            await handleCallbackQuery(cq);

            // Debe registrar en pendingAlertJustifications
            assert.ok(pendingAlertJustifications.has(String(uid)));
            const pendingEntry = pendingAlertJustifications.get(String(uid));
            assert.strictEqual(pendingEntry.stationId, '008');
            assert.strictEqual(pendingEntry.date, '2026-10-12');

            // Debe enviar el prompt solicitando la justificación
            const promptMsg = sentMessages.find(m => m.text.includes('Justificación de Descuadre'));
            assert.ok(promptMsg);

            // El usuario responde con el motivo en el siguiente mensaje
            await handleIncomingMessage({
                message_id: 503,
                from: { id: uid, first_name: 'Gerente Puma' },
                chat: { id: uid },
                text: 'Se debió a calibración programada de medidores de diésel autorizada por gerencia.'
            });

            // La justificación debe haber sido guardada y el estado limpiado
            assert.strictEqual(pendingAlertJustifications.has(String(uid)), false);

            const ackMsg = sentMessages.find(m => m.text.includes('Justificación Registrada Exitosamente'));
            assert.ok(ackMsg, 'Debe enviar confirmación de justificación registrada');
            assert.ok(ackMsg.text.includes('calibración programada de medidores'));
        });

        it('handleIncomingMessage: usuario puede abortar justificación con /cancelar', async () => {
            const uid = 12345;
            pendingAlertJustifications.set(String(uid), {
                date: '2026-10-12',
                stationId: '008',
                timestamp: Date.now()
            });

            await handleIncomingMessage({
                message_id: 504,
                from: { id: uid, first_name: 'Gerente' },
                chat: { id: uid },
                text: '/cancelar'
            });

            assert.strictEqual(pendingAlertJustifications.has(String(uid)), false);
            const cancelAck = sentMessages.find(m => m.text.includes('Justificación cancelada'));
            assert.ok(cancelAck);
        });

        it('handleCallbackQuery: alert_recheck debe verificar estado de cuadre en tiempo real', async () => {
            const cq = {
                id: 'cq_1003',
                data: 'alert_recheck:2026-10-12:008',
                from: { id: 12345 },
                message: { chat: { id: 12345 }, message_id: 505 }
            };

            await handleCallbackQuery(cq);

            assert.ok(answeredCallbacks.some(c => c.callback_query_id === 'cq_1003'));
            const recheckMsg = sentMessages.find(m => m.text.includes('Re-verificación de Cuadre en Tiempo Real'));
            assert.ok(recheckMsg, 'Debe responder con la verificación en tiempo real');
        });

        it('handleCallbackQuery: alert_sum debe cargar el resumen global del día auditado', async () => {
            const cq = {
                id: 'cq_1004',
                data: 'alert_sum:2026-10-12',
                from: { id: 12345 },
                message: { chat: { id: 12345 }, message_id: 506 }
            };

            await handleCallbackQuery(cq);

            assert.ok(answeredCallbacks.some(c => c.callback_query_id === 'cq_1004'));
            const sumMsg = sentMessages.find(m => m.text.includes('VENTAS'));
            assert.ok(sumMsg, 'Debe enviar el reporte de ventas del día');
        });
    });

    // =========================================================================
    // 4. CAPABILITY 4: Suggestions Command & Relative Business Periods
    // =========================================================================
    describe('4. Suggestions Command & Relative Business Periods', () => {
        const fixedRefDate = new Date('2026-10-12T12:00:00Z'); // Lunes 12 de Octubre 2026

        it('parseSpanishPeriodOrDate debe resolver "esta semana" correctamente', () => {
            const res = parseSpanishPeriodOrDate('ventas de esta semana', fixedRefDate);
            assert.ok(res);
            assert.strictEqual(res.type, 'range');
            assert.strictEqual(res.periodo, 'esta_semana');
            assert.strictEqual(res.startDate, '2026-10-12'); // Lunes
            assert.strictEqual(res.endDate, '2026-10-18');   // Domingo
        });

        it('parseSpanishPeriodOrDate debe resolver "semana pasada" correctamente', () => {
            const res = parseSpanishPeriodOrDate('cuanto vendimos la semana pasada', fixedRefDate);
            assert.ok(res);
            assert.strictEqual(res.type, 'range');
            assert.strictEqual(res.periodo, 'semana_pasada');
            assert.strictEqual(res.startDate, '2026-10-05'); // Lunes anterior
            assert.strictEqual(res.endDate, '2026-10-11');   // Domingo anterior
        });

        it('parseSpanishPeriodOrDate debe resolver "quincena pasada" según el día del mes', () => {
            // Caso A: día <= 15 (ej. 12 de octubre -> quincena pasada es 16-30 de septiembre)
            const refEarly = new Date('2026-10-12T12:00:00Z');
            const resEarly = parseSpanishPeriodOrDate('quincena pasada', refEarly);
            assert.ok(resEarly);
            assert.strictEqual(resEarly.type, 'range');
            assert.strictEqual(resEarly.startDate, '2026-09-16');
            assert.strictEqual(resEarly.endDate, '2026-09-30');

            // Caso B: día > 15 (ej. 25 de octubre -> quincena pasada es 1-15 de octubre)
            const refLate = new Date('2026-10-25T12:00:00Z');
            const resLate = parseSpanishPeriodOrDate('quincena pasada', refLate);
            assert.ok(resLate);
            assert.strictEqual(resLate.type, 'range');
            assert.strictEqual(resLate.startDate, '2026-10-01');
            assert.strictEqual(resLate.endDate, '2026-10-15');
        });

        it('parseSpanishPeriodOrDate debe resolver "últimos 7 días" y "últimos 3 días"', () => {
            const res7 = parseSpanishPeriodOrDate('ventas ultimos 7 dias', fixedRefDate);
            assert.ok(res7);
            assert.strictEqual(res7.days, 7);
            assert.strictEqual(res7.startDate, '2026-10-05');
            assert.strictEqual(res7.endDate, '2026-10-12');

            const res3 = parseSpanishPeriodOrDate('ultimos 3 dias', fixedRefDate);
            assert.ok(res3);
            assert.strictEqual(res3.days, 3);
            assert.strictEqual(res3.startDate, '2026-10-09');
            assert.strictEqual(res3.endDate, '2026-10-12');
        });

        it('formatFeedbackListMessage debe formatear adecuadamente lista vacía y con elementos', () => {
            // Vacía
            const emptyMsg = formatFeedbackListMessage([]);
            assert.ok(emptyMsg.includes('No hay sugerencias registradas'));

            // Con elementos
            const mockList = [
                {
                    first_name: 'Carlos Gerente',
                    calificacion: 'UTIL',
                    estado: 'COMPLETADO',
                    consulta_original: 'ventas del fin de semana',
                    comentario_mejora: 'Agregar comparación con meta'
                }
            ];
            const listMsg = formatFeedbackListMessage(mockList);
            assert.ok(listMsg.includes('Carlos Gerente'));
            assert.ok(listMsg.includes('👍 Útil'));
            assert.ok(listMsg.includes('🟢 Completado'));
            assert.ok(listMsg.includes('ventas del fin de semana'));
            assert.ok(listMsg.includes('Agregar comparación con meta'));
        });

        it('/sugerencias debe restringir acceso a usuarios sin rol de administrador', async () => {
            // Usuario normal no-admin
            await handleIncomingMessage({
                message_id: 601,
                from: { id: 12345, first_name: 'Operador' },
                chat: { id: 12345 },
                text: '/sugerencias'
            });

            const deniedMsg = sentMessages.find(m => m.text.includes('Acceso Restringido'));
            assert.ok(deniedMsg, 'Debe denegar acceso a no administradores');
        });

        it('/sugerencias debe mostrar el listado a administradores autorizados', async () => {
            // Usuario admin
            await handleIncomingMessage({
                message_id: 602,
                from: { id: 999999, first_name: 'Don Admin' },
                chat: { id: 999999 },
                text: '/sugerencias'
            });

            const listMsg = sentMessages.find(m => m.text.includes('ÚLTIMAS 5 SUGERENCIAS Y FEEDBACK'));
            assert.ok(listMsg, 'Debe desplegar la lista de sugerencias a directores administradores');
            assert.ok(listMsg.text.includes('Gerente Puma'));
        });
    });
});
