'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createE2eHarness } = require('./helpers/e2eHarness.helper');
const {
    VALID_WEBP_BUFFER,
    VALID_WEBP_DATA_URL,
    VALID_PDF_DATA_URL,
    makeSizedValidWebpDataUrl,
    withMockBrowserDomForCompressor
} = require('./helpers/fixtures.helper');

const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend/src');

describe('Tier 3 — Pairwise Cross-Feature & Cross-Module Interactions', () => {
    const harness = createE2eHarness();

    before(async () => {
        await harness.start();
    });

    after(async () => {
        await harness.stop();
    });

    beforeEach(() => {
        harness.reset();
    });

    it('T3-01: Cheques Contado cross-empresa -> Saldos/Chip en Vivo -> Kardex (EN_TRANSITO -> CONCILIADO)', async () => {
        const { getSaldosBancosData, getSaldosChequeraData, clearQueryCache } = require('../services/telegramDataService');

        const genRes = await harness.request('POST', '/api/cheques/contado/generar', {
            userId: 2,
            body: {
                llave: 'SOL-CONT-001',
                estacion_solicitud: '02',
                cuenta_bancaria_id: 1,
                cheque_num: '5055',
                fecha: '2026-10-28',
                valor: 350.00,
                a_nombre: 'DISTRIBUIDORA PETROLEO S.A. DE C.V.',
                concepto: 'LUBRICANTES'
            }
        });
        assert.equal(genRes.status, 200);

        // Chip en vivo refleja deducción inmediata en chequera (1525 - 350 = 1175) y nuevo último # 5055
        const chipRes = await harness.request('GET', '/api/cheques/cuenta-resumen/1', { userId: 2 });
        assert.equal(chipRes.status, 200);
        assert.equal(Number(chipRes.data.saldo_chequera), 1175);
        assert.equal(chipRes.data.ultimo_numero_cheque, '5055');

        // telegramDataService refleja chequera 1175+500=1675 y conciliado libros intacto (1700+500=2200)
        clearQueryCache();
        const salBancoBefore = await getSaldosBancosData();
        const salCheqBefore = await getSaldosChequeraData();
        assert.equal(salBancoBefore.total, 2200);
        assert.equal(salCheqBefore.total, 1675);

        // En Kardex aparece EN_TRANSITO
        const kardexBefore = await harness.request(
            'GET',
            '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&estado=EN_TRANSITO',
            { userId: 3 }
        );
        assert.equal(kardexBefore.status, 200);
        const chkLine = kardexBefore.data.items.find((i) => i.documento === '5055');
        assert.ok(chkLine);
        assert.equal(chkLine.estado_conciliacion, 'EN_TRANSITO');

        // Conciliar el cheque -> pasa a CONCILIADO en Kardex y reduce saldo_conciliado_libros en 350
        const applyRes = await harness.request('POST', '/api/bancos/conciliacion/aplicar', {
            userId: 2,
            body: { items: [{ id: chkLine.id, origen_tipo: 'CK' }], accion: 'CONCILIAR', fecha_aplicado: '2026-10-29' }
        });
        assert.equal(applyRes.status, 200);

        clearQueryCache();
        const salBancoAfter = await getSaldosBancosData();
        assert.equal(salBancoAfter.total, 1850); // 2200 - 350

        const kardexConc = await harness.request(
            'GET',
            '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&estado=CONCILIADOS',
            { userId: 3 }
        );
        assert.ok(kardexConc.data.items.some((i) => i.documento === '5055' && i.estado_conciliacion === 'CONCILIADO'));
    });

    it('T3-02: Movimientos Bancarios con captura HMAC -> visible y descargable desde Conciliación Bancaria', async () => {
        const movRes = await harness.request('POST', '/api/bancos/movimientos', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                fecha: '2026-10-27',
                documento: 'DEP-777',
                concepto: 'REMESA CAJA CON FOTO',
                monto: 250.00,
                cod_remesa: 'RM',
                tipo: 'ABONO',
                comprobante: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'boleta_777.webp', nota: 'Voucher banco' }
            }
        });
        assert.equal(movRes.status, 201);

        const concRes = await harness.request(
            'GET',
            '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31',
            { userId: 3 }
        );
        assert.equal(concRes.status, 200);
        const pend = concRes.data.pendientes.find((p) => p.documento === 'DEP-777');
        assert.ok(pend);
        const signedUrl = pend.comprobante_signed_url || pend.signed_url || pend.comprobante_url;
        assert.ok(signedUrl && signedUrl.includes('sig='), 'Conciliación debe exponer URL firmada para comprobante de movimiento');

        const anonFetch = await harness.request('GET', signedUrl, { token: null });
        assert.equal(anonFetch.status, 200);
        assert.deepEqual(anonFetch.buffer, VALID_WEBP_BUFFER);
    });

    it('T3-03: Round-trip completo receiptCompressor.js -> Control Pagos Abono -> Conciliación CONTROL PAGOS Signed URL -> HTTP 200', async () => {
        const compressor = await import(pathToFileURL(path.join(FRONTEND_ROOT, 'utils/receiptCompressor.js')).href);
        let compressed;
        await withMockBrowserDomForCompressor(async () => {
            compressed = await compressor.compressReceiptFile({ name: 'image.png', type: 'image/png', size: 2048 });
        });
        assert.match(compressed.nombre_original, /^captura_\d{8}_\d{6}\.webp$/);

        const abonoRes = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
            userId: 2,
            body: {
                tipo_operacion: 'CXP',
                metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1,
                beneficiario: 'AES EL SALVADOR',
                referencia_doc: 'TRF-E2E-1',
                fecha_pago: '2026-10-26',
                monto: 450.00,
                comprobantes: [{
                    data_url: compressed.data_url,
                    nombre_original: compressed.nombre_original,
                    ancho: compressed.ancho,
                    alto: compressed.alto,
                    nota: 'Pegado Ctrl+V'
                }]
            }
        });
        assert.equal(abonoRes.status, 201);

        const concRes = await harness.request(
            'GET',
            '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31',
            { userId: 3 }
        );
        assert.equal(concRes.status, 200);
        const sug = concRes.data.sugerencias_control_pagos.find((s) => s.referencia_doc === 'TRF-E2E-1');
        assert.ok(sug);
        assert.match(sug.comprobante_url, /^\/api\/uploads\/pagos\/.+\?exp=\d+&sig=[a-f0-9]{64}$/);

        const anonGet = await harness.request('GET', sug.comprobante_url, { token: null });
        assert.equal(anonGet.status, 200);
        assert.deepEqual(anonGet.buffer, VALID_WEBP_BUFFER);
    });

    it('T3-04: Control de Pagos vincular-control-pago <-> Movimientos Delete Guard (409) <-> Desconciliar revierte abono a PENDIENTE', async () => {
        const abRes = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
            userId: 2,
            body: {
                tipo_operacion: 'CXP',
                metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1,
                beneficiario: 'PROVEEDOR',
                referencia_doc: 'TRF-LINK-1',
                fecha_pago: '2026-11-05',
                monto: 300.00
            }
        });
        assert.equal(abRes.status, 201);
        const abonoId = abRes.data.abono_id;

        const linkRes = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
            userId: 2,
            body: { abono_id: abonoId, cuenta_bancaria_id: 1, fecha_aplicado: '2026-11-05', accion: 'CREAR_Y_CONCILIAR' }
        });
        assert.equal(linkRes.status, 200);
        const movId = linkRes.data.movimiento_bancario_id;
        assert.ok(movId > 0);

        // No puede eliminarse directamente desde Movimientos por doble protección (conciliado + vinculado a Control de Pagos) -> 409
        const delMov = await harness.request('DELETE', `/api/bancos/movimientos/${movId}`, { userId: 2 });
        assert.equal(delMov.status, 409);

        // Desconciliar desde Conciliación libera el movimiento y revierte el abono a PENDIENTE
        const unapply = await harness.request('POST', '/api/bancos/conciliacion/aplicar', {
            userId: 2,
            body: { items: [{ id: movId, origen_tipo: 'MOV' }], accion: 'DESCONCILIAR' }
        });
        assert.equal(unapply.status, 200);
        const abRow = harness.mockDb.getState().recordatorios_pagos_abonos.find((a) => Number(a.id) === Number(abonoId));
        assert.equal(abRow.estado_conciliacion, 'PENDIENTE');
    });

    it('T3-05: Tareas adjuntos + MiBot Telegram multimedia + Callback mibot:validar sincroniza estado completada y conserva adjuntos', async () => {
        const { handleMibotCallbackQuery } = require('../services/mibotNotifierService');

        const tRes = await harness.request('POST', '/api/tasks', {
            userId: 1,
            body: { titulo: 'Inspección Tanques', fecha_vencimiento: '2026-11-30', assigned_to: 6 }
        });
        const taskId = tRes.data.task.id;

        const attRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
            userId: 1,
            body: {
                attachments: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'tanque.webp', nota: 'Nivel' },
                    { data_url: VALID_PDF_DATA_URL, nombre_original: 'ficha.pdf', nota: 'Ficha' }
                ]
            }
        });
        assert.equal(attRes.status, 201);

        const mibotRes = await harness.request('POST', '/api/telegram/mibot/programaciones', {
            userId: 1,
            body: {
                tipo: 'TAREA',
                titulo: 'Validar tanque',
                mensaje: 'Revisar nivel y ficha',
                task_id: taskId,
                destinatario_ids: [2],
                enviar_ahora: true,
                incluir_adjuntos: true
            }
        });
        assert.equal(mibotRes.status, 201);
        const destId = mibotRes.data.programacion.destinatarios[0].id;
        assert.equal(harness.telegramSpy.byMethod('sendPhoto').length, 1);
        assert.equal(harness.telegramSpy.byMethod('sendDocument').length, 1);

        // Simular callback Telegram mibot:validar del destinatario autorizado (tgUser id 2 -> user_id 6)
        const tgUser = harness.mockDb.getState().telegram_usuarios.find((u) => Number(u.id) === 2);
        const handled = await handleMibotCallbackQuery({
            db: harness.mockDb.pool,
            cq: {
                id: 'cq-e2e-1',
                data: `mibot:validar:${destId}`,
                from: { id: 1006 },
                message: { chat: { id: 1006 }, message_id: 1001 }
            },
            tgUser,
            transport: {
                answerCallbackQuery: async () => true,
                editMessageReplyMarkup: async () => true,
                sendTelegramMessage: async () => ({ message_id: 1002 })
            }
        });
        assert.equal(handled, true);

        const detail = await harness.request('GET', `/api/tasks/${taskId}`, { userId: 1 });
        assert.equal(detail.status, 200);
        assert.equal(detail.data.estado, 'completada');
        assert.equal(detail.data.attachments.length, 2);
        assert.ok(detail.data.comments.some((c) => c.comentario.includes('MiBot Telegram')));
    });

    it('T3-06: autoLogMiddleware registra en bitacora_logs escrituras 2xx de Control de Pagos (omitiendo base64) y NO registra errores 4xx', async () => {
        const largeWebpDataUrl = makeSizedValidWebpDataUrl(1024);

        // 1. Escritura válida con base64 (>500 chars) en Control de Pagos
        const pagoRes = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
            userId: 2,
            body: { comprobantes: [{ data_url: largeWebpDataUrl, nombre_original: 'audit.webp', nota: 'Test bitácora' }] }
        });
        assert.equal(pagoRes.status, 201);

        // 2. Error 4xx intencional -> NO debe escribirse en bitacora_logs
        const failCheque = await harness.request('POST', '/api/cheques', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha: '2026-02-30', cheque: '9999', valor: 10 }
        });
        assert.equal(failCheque.status, 400);

        await harness.flushAuditLog();
        const logs = harness.mockDb.getState().bitacora_logs;
        assert.equal(logs.some((l) => l.entidad.includes('cheques') && String(l.detalles || '').includes('9999')), false);

        const pagoLog = logs.find((l) => l.entidad.includes('recordatorios') && l.accion === 'CREATE');
        assert.ok(pagoLog, 'Debe registrar la escritura de comprobantes en recordatorios');
        assert.match(pagoLog.detalles, /\[archivo adjunto omitido/);
        assert.doesNotMatch(pagoLog.detalles, /data:image\/webp;base64,/);
    });

    it('T3-06b: autoLogMiddleware registra Tasks + Attachments omitiendo base64 al implementar M4', async () => {
        const largeWebpDataUrl = makeSizedValidWebpDataUrl(1024);

        const tRes = await harness.request('POST', '/api/tasks', {
            userId: 1,
            body: { titulo: 'Tarea Auditada', fecha_vencimiento: '2026-11-30', assigned_to: 6 }
        });
        assert.equal(tRes.status, 201);
        const taskId = tRes.data.task.id;

        const attRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
            userId: 1,
            body: { data_url: largeWebpDataUrl, nombre_original: 'ev_audit.webp' }
        });
        assert.equal(attRes.status, 201);
        const attId = attRes.data.attachments[0].id;

        const delAtt = await harness.request('DELETE', `/api/tasks/attachments/${attId}`, { userId: 1 });
        assert.equal(delAtt.status, 200);

        await harness.flushAuditLog();
        const logs = harness.mockDb.getState().bitacora_logs;

        const taskAttLog = logs.find((l) => l.entidad.includes('tasks.attachments') && l.accion === 'CREATE');
        assert.ok(taskAttLog);
        assert.match(taskAttLog.detalles, /\[archivo adjunto omitido/);
        assert.doesNotMatch(taskAttLog.detalles, /data:image\/webp;base64,/);

        const delLog = logs.find((l) => l.entidad.includes('tasks.attachments') && l.accion === 'DELETE');
        assert.ok(delLog);
    });

    it('T3-07: Consistencia exacta entre computeAccountReconciliationSummary, Kardex, Aging y Conciliación tras anular cheque y emitir reservado', async () => {
        const { computeAccountReconciliationSummary } = require('../services/bancosIntegrityService');

        const chkRes = await harness.request('POST', '/api/cheques', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                fecha: '2026-10-25',
                cheque: '5070',
                valor: 400,
                a_nombre: 'PROVEEDOR Z',
                concepto: 'PAGO Z'
            }
        });
        assert.equal(chkRes.status, 201);

        // Anular cheque 5070
        const voidRes = await harness.request('PUT', `/api/cheques/${chkRes.data.id}`, {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                fecha: '2026-10-25',
                cheque: '5070',
                valor: 0,
                a_nombre: 'ANULADO',
                concepto: 'ANULADO',
                cheque_anulado: true
            }
        });
        assert.equal(voidRes.status, 200);

        const summary = await computeAccountReconciliationSummary(harness.mockDb.pool, 1, '2026-10-31');
        const kardex = await harness.request(
            'GET',
            '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&estado=TODOS',
            { userId: 3 }
        );
        const conc = await harness.request(
            'GET',
            '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31',
            { userId: 3 }
        );

        assert.equal(summary.saldo_chequera, 1525);
        assert.equal(Number(kardex.data.totales.saldo_final_periodo), summary.saldo_chequera);
        assert.equal(Number(conc.data.resumen.saldo_conciliado_libros), summary.saldo_conciliado_libros);
        assert.equal(Number(conc.data.aging_cheques.total_monto), summary.cheques_en_transito);
    });
});
