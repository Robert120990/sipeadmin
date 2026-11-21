process.env.NODE_ENV = 'test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    sendTelegramPhoto,
    sendTelegramAudio
} = require('../services/telegramTransportService');

const {
    analyzeTelegramImageReceipt
} = require('../services/telegramGeminiService');

const {
    pendingReceiptPayments,
    clearPendingReceiptPayments,
    findMatchingPendingVencimientos,
    prepareReceiptPaymentDraft,
    applyReceiptDraftToVencimiento,
    handleReceiptPaymentCallback
} = require('../services/telegramReceiptPaymentService');

const recordatoriosPagosService = require('../services/recordatoriosPagosService');

const {
    evaluateSentinelAlerts,
    formatSentinelMessage,
    runProactiveSentinelDispatch
} = require('../services/telegramSentinelService');

const {
    ensureWavBuffer,
    buildExecutiveAudioScript,
    buildAndSendExecutiveAudio,
    renderExecutiveChartPng,
    buildAndSendTopicChart
} = require('../services/telegramMediaInsightsService');

const {
    getFlujoResumenData,
    formatFlujoMessage,
    getPrestamosResumenData,
    formatPrestamosMessage,
    getCreditosResumenData,
    formatCreditosMessage,
    canUserApproveFinancialOp,
    createAndNotifyApprovalRequest,
    resolveApprovalAction
} = require('../services/telegramFinanceApprovalService');

const {
    parseNaturalLanguageQuery,
    getDateStr,
    shiftDate
} = require('../services/telegramTextAndDates');

const SYNTH_OWNER_ID = '999000201';
const SYNTH_OTHER_ID = '999000202';
const SYNTH_UNAUTH_ID = '999000203';

// Firma PNG válida de 1x1 para probar guardado real en recordatorios_pagos_comprobantes
const TINY_PNG_BUFFER = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
);

function createReceiptMockDbs() {
    const state = {
        abonos: [],
        comprobantes: [],
        metas: [],
        bitacora: [],
        tgBitacora: [],
        externalVencimientos: [
            {
                id: 501,
                id_recordatorio: 70,
                descripcion: 'PUMA ENERGY EL SALVADOR FAC-88412',
                monto: 12500.00,
                ubicacion: 'Costa del Sol',
                vence: getDateStr(1),
                forma_pago: 'BAC #2367',
                observacion: 'Compra cisterna FAC-88412',
                estado: 'P',
                fecha_cancelacion: null
            },
            {
                id: 502,
                id_recordatorio: 71,
                descripcion: 'ANDA AGUA POTABLE MIRAFLORES',
                monto: 280.50,
                ubicacion: 'Miraflores',
                vence: getDateStr(5),
                forma_pago: 'Promerica',
                observacion: 'Servicio mensual',
                estado: 'P',
                fecha_cancelacion: null
            }
        ],
        cuentas: [
            {
                raw_id: 594,
                id: 594,
                numero: '201002367',
                nombre: 'ANDELSA BAC CTA CTE',
                banco_nombre: 'BAC Credomatic',
                empresa_nombre: 'ANDELSA'
            }
        ]
    };

    const db = {
        query: async (sql, params = []) => {
            const s = String(sql).trim();
            if (/CREATE TABLE IF NOT EXISTS/i.test(s) || /INFORMATION_SCHEMA\.COLUMNS/i.test(s)) {
                return [[{ COLUMN_NAME: 'beneficiario' }], []];
            }
            if (/FROM recordatorios_pagos_abonos WHERE vencimiento_id IN/i.test(s)) {
                return [state.abonos.filter(a => params.includes(Number(a.vencimiento_id))), []];
            }
            if (/FROM recordatorios_pagos_abonos WHERE vencimiento_id = \? ORDER BY/i.test(s)) {
                return [state.abonos.filter(a => Number(a.vencimiento_id) === Number(params[0])), []];
            }
            if (/SELECT COALESCE\(SUM\(monto\), 0\) AS total_pagado FROM recordatorios_pagos_abonos/i.test(s)) {
                const total = state.abonos
                    .filter(a => Number(a.vencimiento_id) === Number(params[0]))
                    .reduce((acc, a) => acc + Number(a.monto || 0), 0);
                return [[{ total_pagado: total }], []];
            }
            if (/FROM recordatorios_pagos_comprobantes WHERE vencimiento_id IN/i.test(s)) {
                return [[], []];
            }
            if (/FROM recordatorios_vencimientos_meta WHERE vencimiento_id IN/i.test(s)) {
                return [state.metas.filter(m => params.includes(Number(m.vencimiento_id))), []];
            }
            if (/FROM cuentas_bancarias/i.test(s)) {
                return [state.cuentas, []];
            }
            if (/INSERT INTO recordatorios_pagos_abonos/i.test(s)) {
                const id = state.abonos.length + 1;
                state.abonos.push({
                    id,
                    vencimiento_id: params[0],
                    recordatorio_id: params[1],
                    ubicacion: params[2],
                    descripcion_ref: params[3],
                    tipo_operacion: params[4],
                    metodo_pago: params[5],
                    cuenta_bancaria_id: params[6],
                    cuenta_label: params[7],
                    tarjeta_ref: params[8],
                    beneficiario: params[9],
                    referencia_doc: params[10],
                    fecha_pago: params[11],
                    monto: params[12],
                    notas: params[13],
                    estado_conciliacion: params[14],
                    created_by: params[15]
                });
                return [{ insertId: id }, []];
            }
            if (/INSERT INTO recordatorios_vencimientos_meta/i.test(s)) {
                state.metas.push({
                    vencimiento_id: params[0],
                    recordatorio_id: params[1],
                    tipo_operacion: params[2],
                    metodo_pago_preferido: params[3],
                    cuenta_bancaria_id: params[4],
                    cuenta_label: params[5]
                });
                return [{ affectedRows: 1 }, []];
            }
            if (/INSERT INTO recordatorios_pagos_comprobantes/i.test(s)) {
                const id = state.comprobantes.length + 1;
                state.comprobantes.push({ id, vencimiento_id: params[0], abono_id: params[1], archivo_url: params[3] });
                return [{ insertId: id }, []];
            }
            if (/INSERT INTO bitacora_logs/i.test(s)) {
                state.bitacora.push({ accion: 'CREATE_ABONO_TELEGRAM', entityId: params[2] });
                return [{ insertId: state.bitacora.length }, []];
            }
            if (/INSERT INTO telegram_bitacora/i.test(s)) {
                state.tgBitacora.push({ user: params[0], cmd: params[1], msg: params[2] });
                return [{ insertId: state.tgBitacora.length }, []];
            }
            return [[], []];
        }
    };

    const externalDb = {
        query: async (sql, params = []) => {
            const s = String(sql).trim();
            if (/FROM web_rc_recordatorios_vencimientos a/i.test(s) && /WHERE a\.id = \?/i.test(s)) {
                const row = state.externalVencimientos.find(v => Number(v.id) === Number(params[0]));
                return [row ? [row] : [], []];
            }
            if (/FROM web_rc_recordatorios_vencimientos a/i.test(s)) {
                return [state.externalVencimientos.filter(v => v.estado === 'P'), []];
            }
            if (/UPDATE web_rc_recordatorios_vencimientos/i.test(s)) {
                const row = state.externalVencimientos.find(v => Number(v.id) === Number(params[3]));
                if (row) {
                    row.estado = params[0];
                    row.fecha_cancelacion = params[1];
                    row.forma_pago = params[2];
                }
                return [{ affectedRows: row ? 1 : 0 }, []];
            }
            return [[], []];
        }
    };

    return { db, externalDb, state };
}

describe('Suite Ejecutiva Bot Telegram (4 Módulos)', () => {
    it('Módulo 1: coincide comprobante OCR (incluyendo PDF), crea borrador y aplica abono 1-tap con archivo físico y limpieza', async () => {
        clearPendingReceiptPayments();
        const { db, externalDb, state } = createReceiptMockDbs();
        const analysis = {
            tipo_documento: 'Comprobante de Transferencia',
            metodo_pago: 'TRANSFERENCIA',
            banco: 'BAC Credomatic',
            banco_origen: 'BAC',
            cuenta_origen: '201002367',
            monto_usd: 12500.00,
            fecha: getDateStr(0),
            referencia: 'FAC-88412',
            beneficiario: 'Puma Energy El Salvador',
            concepto: 'Cancelación factura 88412'
        };

        const matches = await findMatchingPendingVencimientos({ db, externalDb, analysis });
        assert.ok(matches.length >= 1, 'Debe encontrar el vencimiento pendiente #501');
        assert.strictEqual(matches[0].id, 501);
        assert.ok(matches[0].score >= 80);

        const adminPerms = { isAdmin: false, control_pagos: true, saldos_banco: true, linkedUser: { id: 10, username: 'admin' } };
        const noPerm = { isAdmin: false, control_pagos: false, saldos_banco: false };

        // Usuario sin permiso no recibe borrador
        const deniedDraft = await prepareReceiptPaymentDraft({
            db,
            externalDb,
            user: { telegram_user_id: SYNTH_UNAUTH_ID },
            effectivePerms: noPerm,
            fileBuffer: TINY_PNG_BUFFER,
            mimeType: 'image/png',
            fileName: 'comp.png',
            analysis
        });
        assert.strictEqual(deniedDraft.draftId, null);

        // Usuario autorizado obtiene borrador y botones
        const draftRes = await prepareReceiptPaymentDraft({
            db,
            externalDb,
            user: { telegram_user_id: SYNTH_OWNER_ID, first_name: 'Gerente' },
            effectivePerms: adminPerms,
            fileBuffer: TINY_PNG_BUFFER,
            mimeType: 'image/png',
            fileName: 'comp_puma.png',
            analysis
        });
        assert.ok(draftRes.draftId);
        assert.ok(draftRes.sectionHtml.includes('PUMA ENERGY EL SALVADOR'));
        assert.strictEqual(draftRes.resolvedAccount.cuenta_bancaria_id, 594);
        assert.strictEqual(draftRes.inlineMarkup.inline_keyboard[0][0].callback_data, `tg_rcp:ok:${draftRes.draftId}:501`);

        // Aislamiento por dueño: otro usuario no puede aplicar este borrador
        const draft = pendingReceiptPayments.get(draftRes.draftId);
        const notOwnerRes = await applyReceiptDraftToVencimiento({
            db,
            externalDb,
            draft,
            vencimientoId: 501,
            tgUser: { telegram_user_id: SYNTH_OTHER_ID },
            effPerms: adminPerms
        });
        assert.strictEqual(notOwnerRes.ok, false);
        assert.strictEqual(notOwnerRes.status, 'not_owner');

        // Confirmación vía callback tg_rcp:ok: por el dueño autorizado
        const sentMessages = [];
        const answers = [];
        const editedMarkups = [];
        const mockTransport = {
            sendTelegramMessage: async (chatId, text, markup) => sentMessages.push({ chatId, text, markup }),
            answerCallbackQuery: async (id, text) => answers.push({ id, text }),
            editMessageReplyMarkup: async (chatId, msgId, markup) => editedMarkups.push({ chatId, msgId, markup }),
            getMainReplyKeyboard: () => ({ keyboard: [] })
        };

        let createdArchivoUrl = null;
        try {
            const handled = await handleReceiptPaymentCallback({
                db,
                externalDb,
                cq: {
                    id: 'cb-1',
                    from: { id: Number(SYNTH_OWNER_ID) },
                    data: `tg_rcp:ok:${draftRes.draftId}:501`,
                    message: { chat: { id: Number(SYNTH_OWNER_ID) }, message_id: 901 }
                },
                tgUser: { telegram_user_id: SYNTH_OWNER_ID, first_name: 'Gerente', user_id: 10 },
                effPerms: adminPerms,
                transport: mockTransport
            });

            assert.strictEqual(handled, true);
            assert.strictEqual(state.abonos.length, 1);
            assert.strictEqual(Number(state.abonos[0].monto), 12500);
            assert.strictEqual(state.abonos[0].cuenta_bancaria_id, 594);
            assert.strictEqual(state.comprobantes.length, 1);
            createdArchivoUrl = state.comprobantes[0].archivo_url;
            assert.ok(createdArchivoUrl.startsWith('/api/uploads/pagos/'));
            assert.strictEqual(state.externalVencimientos[0].estado, 'C');
            assert.strictEqual(editedMarkups.length, 1);
            assert.ok(sentMessages[0].text.includes('CANCELADO (100% liquidado)'));

            // Protección contra doble clic después de aplicarse
            const dupRes = await applyReceiptDraftToVencimiento({
                db,
                externalDb,
                draft,
                vencimientoId: 501,
                tgUser: { telegram_user_id: SYNTH_OWNER_ID },
                effPerms: adminPerms
            });
            assert.strictEqual(dupRes.ok, false);
            assert.strictEqual(dupRes.status, 'already_applied');
        } finally {
            if (createdArchivoUrl) {
                recordatoriosPagosService.deleteReceiptFile(createdArchivoUrl);
            }
            clearPendingReceiptPayments();
        }
    });

    it('Módulo 1b: analyzeTelegramImageReceipt soporta application/pdf sin romper campos existentes', async () => {
        process.env.GEMINI_API_KEY = 'AIzaSyFakeExecutiveSuiteKey123456';
        const genaiModule = require('@google/genai');
        const originalGoogleGenAI = genaiModule.GoogleGenAI;
        let capturedMime = null;

        genaiModule.GoogleGenAI = class MockPdfGenAI {
            constructor() {
                this.models = {
                    generateContent: async (payload) => {
                        capturedMime = payload.contents[0].parts[1].inlineData.mimeType;
                        return {
                            text: JSON.stringify({
                                tipo_documento: 'Factura Comercial',
                                metodo_pago: 'TRANSFERENCIA',
                                banco: 'Banco Promerica',
                                banco_origen: 'Promerica',
                                cuenta_origen: '4455',
                                monto_usd: 420.75,
                                fecha: '2026-11-20',
                                referencia: 'DTE-00912',
                                cuenta_destino: '9988',
                                beneficiario: 'Energía del Sur',
                                concepto: 'Servicio eléctrico',
                                observaciones: 'Legible'
                            })
                        };
                    }
                };
            }
        };

        try {
            const res = await analyzeTelegramImageReceipt(Buffer.from('%PDF-1.4\n%test'), 'application/pdf', 'Factura luz');
            assert.strictEqual(capturedMime, 'application/pdf');
            assert.strictEqual(res.banco, 'Banco Promerica');
            assert.strictEqual(res.monto_usd, 420.75);
            assert.strictEqual(res.metodo_pago, 'TRANSFERENCIA');
            assert.strictEqual(res.cuenta_origen, '4455');
        } finally {
            genaiModule.GoogleGenAI = originalGoogleGenAI;
        }
    });

    it('Módulo 2: Centinela 24/7 detecta brecha de liquidez, déficit por cuenta, remesas >48h y deduplica envíos', async () => {
        const sentLog = new Set();
        const delivered = [];
        const todayStr = '2026-11-20';

        const mockDb = {
            query: async (sql, params = []) => {
                const s = String(sql).trim();
                if (/CREATE TABLE IF NOT EXISTS telegram_sentinel_log/i.test(s)) return [[], []];
                if (/INSERT IGNORE INTO telegram_sentinel_log/i.test(s)) {
                    const dedupKey = `${params[0]}:${params[1]}`;
                    if (sentLog.has(dedupKey)) return [{ affectedRows: 0 }, []];
                    sentLog.add(dedupKey);
                    return [{ affectedRows: 1 }, []];
                }
                if (/UPDATE telegram_sentinel_log SET recipients_count/i.test(s)) return [{ affectedRows: 1 }, []];
                if (/FROM telegram_usuarios tu/i.test(s)) {
                    return [[
                        {
                            id: 1,
                            telegram_user_id: SYNTH_OWNER_ID,
                            user_id: 1,
                            activo: 1,
                            permiso_alertas: 1,
                            permiso_saldos_banco: 1,
                            sipe_status: 'active',
                            sipe_role_id: 2,
                            sipe_role_name: 'Gerencia',
                            sipe_permissions: '/dashboard/bancos/reportes/saldos-bancos'
                        },
                        {
                            id: 2,
                            telegram_user_id: SYNTH_UNAUTH_ID,
                            user_id: 99,
                            activo: 1,
                            permiso_alertas: 1,
                            permiso_saldos_banco: 0,
                            sipe_status: 'active',
                            sipe_role_id: 5,
                            sipe_role_name: 'Vendedor',
                            sipe_permissions: '/dashboard/consultas/estaciones/ventas'
                        }
                    ], []];
                }
                if (/FROM role_permissions rp/i.test(s)) return [[], []];
                return [[], []];
            }
        };

        const overridesCrit = {
            bancosData: {
                total: 15000,
                cuentas: [
                    { banco: 'BAC Credomatic', cuenta: 'Cuenta Operativa (2367)', num_cta: '201002367', saldo: 5000 },
                    { banco: 'Banco Promerica', cuenta: 'Cuenta Ahorro (9910)', num_cta: '9910', saldo: 10000 }
                ]
            },
            pagosData: [
                {
                    id: 101,
                    descripcion: 'Cisterna Puma Combustibles',
                    fecha_vencimiento: todayStr,
                    saldo_pendiente: 18500,
                    tipo_operacion: 'CXP',
                    cuenta_bancaria_id: null,
                    cuenta_label: '201002367'
                }
            ],
            prestamosRows: [
                { id: 1, numero_prestamo: 'PR-10', descripcion: 'Préstamo Hipotecario', cuota: 3500, dia_pago: 21 }
            ],
            transitoData: {
                resumen: {
                    efectivo_en_transito_48h_usd: 4200,
                    vales_sin_facturar_72h_usd: 650,
                    partidas_transito_count: 1,
                    vales_sin_facturar_count: 1
                },
                remesas_en_transito: [
                    { estacion: 'Puma Miraflores', fecha_turno: shiftDate(todayStr, -3), dias_transito: 3, pendiente_conciliar_usd: 4200, severidad: 'critico' }
                ],
                vales_pendientes_72h: [
                    { estacion: 'Puma Costa del Sol', cliente: 'Flota ABC', monto_usd: 650, dias_antiguedad: 4 }
                ]
            }
        };

        const evalRes = await evaluateSentinelAlerts({
            db: mockDb,
            todayOverride: todayStr,
            overrides: overridesCrit
        });

        assert.strictEqual(evalRes.hasAlerts, true);
        assert.strictEqual(evalRes.severity, 'critico');
        assert.strictEqual(evalRes.liquidez.brecha_global_usd, 7000);
        assert.strictEqual(evalRes.liquidez.cuentas_con_deficit.length, 1);
        assert.strictEqual(evalRes.liquidez.cuentas_con_deficit[0].deficit, 13500);
        assert.strictEqual(evalRes.transito.remesas_criticas_count, 1);

        const html = formatSentinelMessage(evalRes);
        assert.ok(html.includes('CENTINELA 24/7'));
        assert.ok(html.includes('Puma Miraflores'));

        // Despacho proactivo #1: solo al usuario autorizado con bancos + alertas
        const d1 = await runProactiveSentinelDispatch({
            db: mockDb,
            todayOverride: todayStr,
            slotKey: 'morning',
            overrides: overridesCrit,
            sendTelegramFn: async (chatId, text, markup) => delivered.push({ chatId, text, markup })
        });
        assert.strictEqual(d1.dispatched, true);
        assert.strictEqual(d1.sentCount, 1);
        assert.strictEqual(delivered[0].chatId, SYNTH_OWNER_ID);

        // Despacho proactivo #2 mismo día + slot: deduplicado (0 envíos adicionales)
        const d2 = await runProactiveSentinelDispatch({
            db: mockDb,
            todayOverride: todayStr,
            slotKey: 'morning',
            overrides: overridesCrit,
            sendTelegramFn: async (chatId, text, markup) => delivered.push({ chatId, text, markup })
        });
        assert.strictEqual(d2.dispatched, false);
        assert.strictEqual(d2.reason, 'deduplicated');
        assert.strictEqual(delivered.length, 1);

        // Escenario sano -> hasAlerts = false
        const healthyRes = await evaluateSentinelAlerts({
            db: mockDb,
            todayOverride: todayStr,
            overrides: {
                bancosData: { total: 200000, cuentas: [{ banco: 'BAC', cuenta: 'Op', saldo: 200000 }] },
                pagosData: [],
                prestamosRows: [],
                transitoData: { resumen: {}, remesas_en_transito: [], vales_pendientes_72h: [] }
            }
        });
        assert.strictEqual(healthyRes.hasAlerts, false);
        assert.strictEqual(healthyRes.severity, 'ok');
    });

    it('Módulo 3: Audio TTS (Gemini 3.8 WAV) y Gráficas PNG cumplen permisos, fallback y cabeceras binarias', async () => {
        // 1. ensureWavBuffer agrega cabecera RIFF/WAVE a PCM crudo y no la duplica si ya existe
        const rawPcm = Buffer.alloc(4800, 0x11);
        const wav1 = ensureWavBuffer(rawPcm, 'audio/l16;codec=pcm;rate=24000');
        assert.strictEqual(wav1.buffer.subarray(0, 4).toString('ascii'), 'RIFF');
        assert.strictEqual(wav1.buffer.subarray(8, 12).toString('ascii'), 'WAVE');
        assert.strictEqual(wav1.buffer.length, 44 + rawPcm.length);

        const wav2 = ensureWavBuffer(wav1.buffer, 'audio/wav');
        assert.strictEqual(wav2.buffer.length, wav1.buffer.length);

        // 2. Guión hablado respeta permisos (usuario solo ventas no recibe saldo bancario)
        const scriptVentasOnly = buildExecutiveAudioScript({
            ventasData: { estaciones: [{ empresa: 'Miraflores', galonaje: 4500, venta: 16200 }], tiendas: [{ venta: 1800 }] },
            bancosData: { total: 987654, cuentas: [{ saldo: 987654 }] },
            effectivePerms: { ventas: true, saldos_banco: false, control_pagos: false, isAdmin: false },
            userName: 'Supervisor'
        });
        assert.ok(scriptVentasOnly.includes('18,000') || scriptVentasOnly.includes('4,500'));
        assert.ok(!scriptVentasOnly.includes('987,654'));

        // 3. Envío de Audio + Fallback limpio cuando TTS falla
        const audioCalls = [];
        const msgCalls = [];
        const providers = {
            getConsolidadoVentas: async () => ({ estaciones: [{ empresa: 'Miraflores', galonaje: 4000, venta: 14000 }], tiendas: [] }),
            getSaldosBancosData: async () => ({ total: 55000, cuentas: [{ banco: 'BAC', saldo: 55000 }] }),
            getPagosProgramadosData: async () => ({ vencidos_o_hoy: [], total_saldo_pendiente_usd: 8000 }),
            getFlashEjecutivo: async () => ({ kpi: { emergencias_reales_count: 1 } })
        };

        const resAudio = await buildAndSendExecutiveAudio({
            chatId: SYNTH_OWNER_ID,
            user: { first_name: 'Raul' },
            effectivePerms: { isAdmin: true },
            targetDate: '2026-11-20',
            dataProviders: providers,
            synthesizeFn: async () => ensureWavBuffer(Buffer.alloc(2400)),
            transport: {
                sendChatAction: async () => {},
                sendTelegramMessage: async (c, t, m) => msgCalls.push({ c, t, m }),
                sendTelegramAudio: async (c, buf, opts) => audioCalls.push({ c, buf, opts })
            }
        });
        assert.strictEqual(resAudio.ok, true);
        assert.strictEqual(resAudio.mode, 'audio');
        assert.strictEqual(audioCalls.length, 1);
        assert.strictEqual(audioCalls[0].buf.subarray(0, 4).toString('ascii'), 'RIFF');

        const resFallback = await buildAndSendExecutiveAudio({
            chatId: SYNTH_OWNER_ID,
            user: { first_name: 'Raul' },
            effectivePerms: { ventas: true },
            targetDate: '2026-11-20',
            dataProviders: providers,
            synthesizeFn: async () => { throw new Error('Quota TTS'); },
            transport: {
                sendChatAction: async () => {},
                sendTelegramMessage: async (c, t, m) => msgCalls.push({ c, t, m }),
                sendTelegramAudio: async (c, buf, opts) => audioCalls.push({ c, buf, opts })
            }
        });
        assert.strictEqual(resFallback.ok, true);
        assert.strictEqual(resFallback.mode, 'text_fallback');
        assert.ok(msgCalls.some(m => m.t.includes('RESUMEN EJECUTIVO SIPE')));

        // 4. Gráficas PNG válidas para los 4 temas + bloqueo fail-closed por permiso
        const pngHeader = '89504e470d0a1a0a';
        const samplePng = await renderExecutiveChartPng({
            title: 'VENTAS DE ESTACIONES',
            items: [{ label: 'Costa del Sol', value: 19500 }]
        });
        assert.strictEqual(samplePng.subarray(0, 8).toString('hex'), pngHeader);

        const photoCalls = [];
        const deniedPhotos = [];
        const chartProviders = {
            getConsolidadoVentas: async () => ({ estaciones: [{ empresa: 'Costa del Sol', venta: 19500, galonaje: 5000 }], tiendas: [] }),
            getSaldosBancosData: async () => ({ total: 95000, cuentas: [{ banco: 'BAC', saldo: 95000 }] }),
            getFlujoCajaProyectado: async () => ({ kpi: { salud_flujo: 'SALUDABLE', saldo_inicial_bancos: 95000, saldo_minimo_proyectado: 62000, dias_con_deficit: 0 }, timeline: [{ dia_indice: 1, fecha: '2026-11-21', saldo_final_proyectado: 90000 }] }),
            getSolarAhorroDiario: async () => ({ fecha: '2026-11-20', generacion_total_kwh: 310, ahorro_total_usd: 55.8, co2_evitado_total_kg: 119, estaciones: [{ estacion_nombre: 'Andelsa', generacion_kwh: 190, ahorro_usd: 34.2 }] })
        };

        for (const topic of ['ventas', 'bancos', 'flujo', 'solar']) {
            const chartRes = await buildAndSendTopicChart({
                chatId: SYNTH_OWNER_ID,
                topic,
                targetDate: '2026-11-20',
                effectivePerms: { isAdmin: true },
                dataProviders: chartProviders,
                transport: {
                    sendChatAction: async () => {},
                    sendTelegramMessage: async (c, t) => deniedPhotos.push({ c, t }),
                    sendTelegramPhoto: async (c, buf, cap, mk, fn) => photoCalls.push({ c, buf, cap, mk, fn })
                }
            });
            assert.strictEqual(chartRes.ok, true);
        }
        assert.strictEqual(photoCalls.length, 4);
        photoCalls.forEach(p => {
            assert.strictEqual(p.buf.subarray(0, 8).toString('hex'), pngHeader);
        });

        const deniedChart = await buildAndSendTopicChart({
            chatId: SYNTH_UNAUTH_ID,
            topic: 'bancos',
            effectivePerms: { ventas: true, saldos_banco: false, isAdmin: false },
            dataProviders: chartProviders,
            transport: {
                sendChatAction: async () => {},
                sendTelegramMessage: async (c, t) => deniedPhotos.push({ c, t }),
                sendTelegramPhoto: async () => { throw new Error('No debe enviar foto'); }
            }
        });
        assert.strictEqual(deniedChart.ok, false);
        assert.strictEqual(deniedChart.reason, 'forbidden');
        assert.ok(deniedPhotos[0].t.includes('No tienes permiso'));

        // Verifica exportaciones de transporte sendTelegramPhoto y sendTelegramAudio
        assert.strictEqual(typeof sendTelegramPhoto, 'function');
        assert.strictEqual(typeof sendTelegramAudio, 'function');
    });

    it('Módulo 4: /flujo, /prestamos, /creditos, aprobaciones gerenciales atómicas y no-regresión NLU', async () => {
        // 1. Consultas financieras (/flujo, /prestamos, /creditos)
        const flujoData = await getFlujoResumenData({
            horizon: 30,
            forecastFn: async (h) => ({
                horizonte_dias: h,
                fecha_generacion: '2026-11-20',
                kpi: {
                    salud_flujo: 'SALUDABLE',
                    saldo_inicial_bancos: 120000,
                    total_ingresos_proyectados: 450000,
                    total_egresos_proyectados: 410000,
                    saldo_minimo_proyectado: 82000,
                    fecha_saldo_minimo: '2026-12-05',
                    dias_con_deficit: 0
                },
                brechas_liquidez: [],
                recomendaciones: [{ detalle: 'Flujo estable en el horizonte.' }]
            })
        });
        const flujoHtml = formatFlujoMessage(flujoData);
        assert.ok(flujoHtml.includes('FLUJO DE CAJA PROYECTADO (30 DÍAS)'));
        assert.ok(flujoHtml.includes('$120,000.00'));

        const mockAprDbState = {
            approvals: [],
            cheques: [{ id: 88, es_reservado: 0, concepto: 'PAGO PROVEEDOR' }],
            bitacora: [],
            notifications: [],
            emitted: []
        };

        const mockFinanceDb = {
            query: async (sql, params = []) => {
                const s = String(sql).trim();
                if (/CREATE TABLE IF NOT EXISTS telegram_aprobaciones/i.test(s)) return [[], []];
                if (/FROM prestamos p/i.test(s)) {
                    return [[{
                        id: 1,
                        numero_prestamo: 'PRE-2026-01',
                        descripcion: 'Línea Capital',
                        estado: 'activo',
                        monto_original: 100000,
                        saldo_actual: 75000,
                        cuota_total: 4200,
                        dia_pago: 15,
                        empresa_nombre: 'Inversiones LIL',
                        banco_nombre: 'Banco Agrícola'
                    }], []];
                }
                if (/FROM telegram_usuarios tu/i.test(s)) {
                    return [[
                        {
                            id: 1,
                            telegram_user_id: SYNTH_OWNER_ID,
                            user_id: 1,
                            activo: 1,
                            sipe_status: 'active',
                            sipe_role_id: 1,
                            sipe_role_name: 'Administrator',
                            sipe_permissions: ''
                        },
                        {
                            id: 2,
                            telegram_user_id: SYNTH_UNAUTH_ID,
                            user_id: 20,
                            activo: 1,
                            sipe_status: 'active',
                            sipe_role_id: 5,
                            sipe_role_name: 'Vendedor',
                            sipe_permissions: '/dashboard/consultas/estaciones/ventas'
                        }
                    ], []];
                }
                if (/FROM role_permissions rp/i.test(s)) return [[], []];
                if (/INSERT INTO telegram_aprobaciones/i.test(s)) {
                    const id = mockAprDbState.approvals.length + 1;
                    mockAprDbState.approvals.push({
                        id,
                        tipo: params[0],
                        entidad_id: params[1],
                        titulo: params[2],
                        resumen: params[3],
                        monto_usd: params[4],
                        empresa_nombre: params[5],
                        solicitado_por_user_id: params[6],
                        solicitado_por_nombre: params[7],
                        estado: 'PENDIENTE'
                    });
                    return [{ insertId: id }, []];
                }
                if (/SELECT \* FROM telegram_aprobaciones WHERE id = \?/i.test(s)) {
                    const row = mockAprDbState.approvals.find(a => Number(a.id) === Number(params[0]));
                    return [row ? [{ ...row }] : [], []];
                }
                if (/UPDATE telegram_aprobaciones\s+SET estado = \?/i.test(s)) {
                    const id = Number(params[4]);
                    const row = mockAprDbState.approvals.find(a => Number(a.id) === id && a.estado === 'PENDIENTE');
                    if (!row) return [{ affectedRows: 0 }, []];
                    row.estado = params[0];
                    row.resuelto_por_telegram_id = params[1];
                    row.resuelto_por_user_id = params[2];
                    row.resuelto_por_nombre = params[3];
                    return [{ affectedRows: 1 }, []];
                }
                if (/UPDATE cheques/i.test(s)) {
                    const ch = mockAprDbState.cheques.find(c => Number(c.id) === Number(params[0]));
                    if (ch) {
                        ch.es_reservado = 1;
                        ch.concepto = `[DETENIDO GERENCIA TG] ${ch.concepto}`;
                    }
                    return [{ affectedRows: ch ? 1 : 0 }, []];
                }
                if (/INSERT INTO bitacora_logs/i.test(s)) {
                    mockAprDbState.bitacora.push({ accion: params[2], entidadId: params[3] });
                    return [{ insertId: 1 }, []];
                }
                if (/INSERT INTO notifications/i.test(s)) {
                    mockAprDbState.notifications.push({ user_id: params[0], title: params[2] });
                    return [{ insertId: 1 }, []];
                }
                return [[], []];
            }
        };

        const prestData = await getPrestamosResumenData({ db: mockFinanceDb, estado: 'activo' });
        assert.strictEqual(prestData.saldo_total_usd, 75000);
        assert.ok(formatPrestamosMessage(prestData).includes('PRE-2026-01'));

        const credData = await getCreditosResumenData({
            filter: 'critico',
            creditRiskFn: async () => ({
                resumen_cartera: { fecha_corte: '2026-11-20', total_cartera_activa_usd: 45000, total_saldo_vencido_usd: 12000, porcentaje_morosidad: 27, clientes_criticos_para_bloqueo: 1, total_clientes_analizados: 2 },
                clientes: [
                    { cliente: 'Transporte Alfa', saldo_pendiente: 12000, porcentaje_utilizado: 98, dias_mora: 12, nivel_riesgo: 'critico' },
                    { cliente: 'Flota Beta', saldo_pendiente: 33000, porcentaje_utilizado: 40, dias_mora: 0, nivel_riesgo: 'bajo' }
                ]
            })
        });
        assert.strictEqual(credData.clientes.length, 1);
        assert.ok(formatCreditosMessage(credData).includes('Transporte Alfa'));

        // 2. Aprobaciones gerenciales: fail-closed + retención de cheque + inmutabilidad atómica
        assert.strictEqual(canUserApproveFinancialOp({ isAdmin: true }), true);
        assert.strictEqual(canUserApproveFinancialOp({ isAdmin: false, linkedUser: { role_name: 'Gerencia' } }), true);
        assert.strictEqual(canUserApproveFinancialOp({ isAdmin: false, linkedUser: { role_name: 'Vendedor' }, sipePermissions: [] }), false);

        const approverMsgs = [];
        const createdApr = await createAndNotifyApprovalRequest({
            db: mockFinanceDb,
            tipo: 'CHEQUE',
            entidadId: 88,
            titulo: 'Cheque #4021',
            resumen: 'Pago cisterna urgente',
            montoUsd: 14500,
            empresaNombre: 'ANDELSA',
            requestedByUser: { id: 15, nombre: 'Contabilidad' },
            sendTelegramFn: async (chatId, text, markup) => approverMsgs.push({ chatId, text, markup })
        });
        assert.strictEqual(createdApr.ok, true);
        assert.strictEqual(createdApr.sentCount, 1);
        assert.strictEqual(approverMsgs[0].chatId, SYNTH_OWNER_ID);
        assert.strictEqual(approverMsgs[0].markup.inline_keyboard[0][1].callback_data, `tg_apr:hold:${createdApr.id}`);

        // Vendedor sin rol Gerencia no puede detener ni aprobar
        const deniedApr = await resolveApprovalAction({
            db: mockFinanceDb,
            approvalId: createdApr.id,
            decision: 'DETENIDO',
            tgUser: { telegram_user_id: SYNTH_UNAUTH_ID },
            effPerms: { isAdmin: false, linkedUser: { role_name: 'Vendedor' }, sipePermissions: [] }
        });
        assert.strictEqual(deniedApr.ok, false);
        assert.strictEqual(deniedApr.status, 'forbidden');

        // Administrador detiene el cheque -> cheque flagged + notificación Socket.io
        const mockIo = {
            to: (room) => ({
                emit: (evt, payload) => mockAprDbState.emitted.push({ room, evt, payload })
            })
        };
        const heldRes = await resolveApprovalAction({
            db: mockFinanceDb,
            approvalId: createdApr.id,
            decision: 'DETENIDO',
            tgUser: { telegram_user_id: SYNTH_OWNER_ID, first_name: 'Raul Sosa', user_id: 1 },
            effPerms: { isAdmin: true, linkedUser: { id: 1, nombre: 'Raul Sosa', username: 'rsosa', role_name: 'Administrator' } },
            io: mockIo
        });
        assert.strictEqual(heldRes.ok, true);
        assert.strictEqual(heldRes.chequeFlagged, true);
        assert.strictEqual(mockAprDbState.cheques[0].es_reservado, 1);
        assert.strictEqual(mockAprDbState.emitted.length, 1);
        assert.strictEqual(mockAprDbState.emitted[0].room, 'user_15');

        // Doble resolución atómica rechazada
        const doubleResolve = await resolveApprovalAction({
            db: mockFinanceDb,
            approvalId: createdApr.id,
            decision: 'APROBADO',
            tgUser: { telegram_user_id: SYNTH_OWNER_ID },
            effPerms: { isAdmin: true }
        });
        assert.strictEqual(doubleResolve.ok, false);
        assert.strictEqual(doubleResolve.status, 'already_resolved');

        // 3. No-regresión NLU para nuevos y antiguos intents
        assert.strictEqual(parseNaturalLanguageQuery('Centinela de liquidez 72h').isCentinela, true);
        assert.strictEqual(parseNaturalLanguageQuery('Mándame un resumen en audio').isAudioResumen, true);
        const pGraf = parseNaturalLanguageQuery('Muéstrame la gráfica de bancos');
        assert.strictEqual(pGraf.isGrafica, true);
        assert.strictEqual(pGraf.graficaTopic, 'bancos');
        const pFlujo = parseNaturalLanguageQuery('Flujo de caja a 60 días');
        assert.strictEqual(pFlujo.isFlujoCaja, true);
        assert.strictEqual(pFlujo.flujoHorizon, 60);
        assert.strictEqual(parseNaturalLanguageQuery('Saldo de préstamos bancarios').isPrestamos, true);
        assert.strictEqual(parseNaturalLanguageQuery('Créditos de flotas en mora').isCreditosFlota, true);
        assert.strictEqual(parseNaturalLanguageQuery('Bandeja de aprobaciones pendientes').isAprobaciones, true);

        // Frases previas clave siguen intactas
        const pComp = parseNaturalLanguageQuery('Precios de la competencia');
        assert.strictEqual(pComp.isCompetencia, true);
        assert.strictEqual(pComp.isGrafica, false);
        const pPagos = parseNaturalLanguageQuery('Pagos vencidos en control de pagos de Miraflores');
        assert.strictEqual(pPagos.isPagosProgramados, true);
        assert.strictEqual(pPagos.isPrestamos, false);
        const pAndelsa = parseNaturalLanguageQuery('Cuentas por cobrar de Andelsa');
        assert.strictEqual(pAndelsa.isAndelsaCxc, true);
        assert.strictEqual(pAndelsa.isCreditosFlota, false);
        const pProm = parseNaturalLanguageQuery('¿Cuánto tenemos en Promerica?');
        assert.strictEqual(pProm.matchedBank?.key, 'PROMERICA');
        assert.strictEqual(pProm.isFlujoCaja, false);
    });
});
