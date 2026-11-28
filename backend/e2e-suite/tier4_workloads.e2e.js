'use strict';

const fs = require('node:fs');
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
    makeLargeString,
    withMockBrowserDomForCompressor
} = require('./helpers/fixtures.helper');

const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend/src');

describe('Tier 4 — Real-World Multi-Step End-to-End Workloads', () => {
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

    it('Workload 1: Ciclo Completo de Tesorería — Chequeras, Cheques de Contado Multi-Empresa, Impresión y Kardex', async () => {
        // 1. Registrar chequera en cuenta 1 (empresa 01)
        const talRes = await harness.request('POST', '/api/bancos/chequeras', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, serie: 'W1', desde: 8001, hasta: 8003, alerta_stock_bajo: 2 }
        });
        assert.equal(talRes.status, 201);
        const talId = talRes.data.id;

        // 2. Consultar chip en vivo -> debe sugerir 8001 y saldo 1525
        const chip1 = await harness.request('GET', '/api/cheques/cuenta-resumen/1', { userId: 2 });
        assert.equal(chip1.status, 200);
        assert.equal(chip1.data.siguiente_correlativo, '8001');
        assert.equal(Number(chip1.data.saldo_chequera), 1525);

        // 3. Emitir cheque normal 8001 desde chequera
        const chk1 = await harness.request('POST', '/api/cheques', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                fecha: '2026-10-25',
                cheque: '8001',
                valor: 125.00,
                a_nombre: 'PROVEEDOR TESORERIA',
                concepto: 'PAGO SERVICIO',
                chequera_id: talId
            }
        });
        assert.equal(chk1.status, 201);

        // 4. Emitir cheque de contado cross-empresa (solicitud empresa '02' pagada desde cuenta 1 empresa '01') usando siguiente correlativo 8002
        const chip2 = await harness.request('GET', '/api/cheques/cuenta-resumen/1', { userId: 2 });
        assert.equal(chip2.data.siguiente_correlativo, '8002');
        assert.equal(Number(chip2.data.saldo_chequera), 1400);

        const contadoRes = await harness.request('POST', '/api/cheques/contado/generar', {
            userId: 2,
            body: {
                llave: 'SOL-CONT-001',
                estacion_solicitud: '02',
                cuenta_bancaria_id: 1,
                cheque_num: '8002',
                fecha: '2026-10-26',
                valor: 350.00,
                a_nombre: 'DISTRIBUIDORA PETROLEO S.A. DE C.V.',
                concepto: 'LUBRICANTES'
            }
        });
        assert.equal(contadoRes.status, 200);

        // 5. Registrar impresión y reimpresión
        const print1 = await harness.request('POST', `/api/cheques/${chk1.data.id}/registrar-impresion`, { userId: 5 });
        assert.equal(print1.status, 200);
        assert.equal(print1.data.es_reimpresion, false);

        const print2 = await harness.request('POST', `/api/cheques/${chk1.data.id}/registrar-impresion`, { userId: 5 });
        assert.equal(print2.status, 200);
        assert.equal(print2.data.es_reimpresion, true);
        assert.ok(print2.data.advertencia_reimpresion);

        // 6. Verificar Kardex con Saldo Corrido final exacto (1525 - 125 - 350 = 1050)
        const kardex = await harness.request(
            'GET',
            '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&estado=TODOS',
            { userId: 3 }
        );
        assert.equal(kardex.status, 200);
        assert.equal(Number(kardex.data.totales.saldo_final_periodo), 1050);
    });

    it('Workload 2: Conciliación Bancaria Integral — IA PDF, Reglas, Cruce N:1, Comprobante HMAC y Cierre de Período', async () => {
        const st = harness.mockDb.getState();
        // Dos cheques pendientes para cruce N:1 ($100 + $200 = $300)
        st.cheques.push(
            { id: 71, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-22', cheque_anulado: 0, cheque: '5101', valor: 100, a_nombre: 'P1', fecha_aplicado: null, concepto: 'LOTE', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 },
            { id: 72, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-22', cheque_anulado: 0, cheque: '5102', valor: 200, a_nombre: 'P2', fecha_aplicado: null, concepto: 'LOTE', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 }
        );

        // 1. Configurar regla de autoclasificación
        const ruleRes = await harness.request('POST', '/api/bancos/conciliacion/reglas', {
            userId: 2,
            body: {
                banco_codigo: '01',
                cuenta_bancaria_id: 1,
                nombre: 'Cargo Manejo Cuenta',
                patron: 'MANEJO DE CUENTA',
                tipo_match: 'CONTAINS',
                tipo_movimiento: 'CARGO',
                tipo_remesa_id: 2,
                concepto_limpio: 'CARGO MANEJO BANCARIO',
                cod_cta: '510101',
                prioridad: 5
            }
        });
        assert.equal(ruleRes.status, 201);

        // 2. Importar extracto PDF vía Gemini (simulado)
        harness.geminiSpy.setHandler(async () => {
            const data = JSON.stringify({
                banco_detectado: 'PROMERICA',
                transacciones: [
                    { fecha: '2026-10-28', documento: 'MAN-01', descripcion: 'COBRO MANEJO DE CUENTA OCT', cargo: 15.00, abono: 0, saldo: 1385.00 }
                ]
            });
            return { text: data, candidates: [{ content: { parts: [{ text: data }] } }] };
        });

        const pdfRes = await harness.request('POST', '/api/bancos/conciliacion/parse-extracto-pdf', {
            userId: 2,
            body: { cuenta_id: 1, data_url: VALID_PDF_DATA_URL, nombre_original: 'extracto_oct.pdf' }
        });
        assert.equal(pdfRes.status, 200);
        const tx = pdfRes.data.transacciones[0];
        assert.equal(tx.cod_cta, '510101');

        // 3. Confirmar movimiento del extracto con crear-masivo-y-aplicar
        const batchRes = await harness.request('POST', '/api/bancos/conciliacion/crear-masivo-y-aplicar', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                banco_formato: 'PROMERICA',
                file_hash: pdfRes.data.file_hash || 'hash-w2',
                items: [{
                    fecha: '2026-10-28',
                    fecha_aplicado: '2026-10-28',
                    documento: tx.documento,
                    concepto: tx.concepto_limpio || tx.descripcion,
                    tipo: 'CARGO',
                    tipo_remesa_codigo: 'NC',
                    cod_cta: tx.cod_cta,
                    monto: 15.00
                }]
            }
        });
        assert.equal(batchRes.status, 200);

        // 4. Registrar movimiento adicional con comprobante WebP HMAC y conciliarlo junto a cruce N:1
        const movFoto = await harness.request('POST', '/api/bancos/movimientos', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                fecha: '2026-10-29',
                documento: 'LOTE-300',
                concepto: 'CARGO MULTIPLE CHEQUES',
                monto: 300.00,
                cod_remesa: 'NC',
                tipo: 'CARGO',
                comprobante: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'lote_300.webp', nota: 'Detalle lote' }
            }
        });
        assert.equal(movFoto.status, 201);

        const cruceRes = await harness.request('POST', '/api/bancos/conciliacion/cruces', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                tipo_cruce: 'N_A_1',
                fecha_aplicado: '2026-10-29',
                libros_items: [
                    { id: 71, origen_tipo: 'CK' },
                    { id: 72, origen_tipo: 'CK' }
                ],
                banco_items: [{ id: movFoto.data.id, origen_tipo: 'MOV' }]
            }
        });
        assert.equal(cruceRes.status, 201);

        // 5. Verificar resumen 3 bloques y cerrar período con diferencia $0.00
        const concData = await harness.request('GET', '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31', { userId: 3 });
        assert.equal(concData.status, 200);
        const targetSaldoBanco = concData.data.resumen.saldo_conciliado_libros;

        const closeRes = await harness.request('POST', '/api/bancos/conciliacion/validar-saldo', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                fecha_corte: '2026-10-31',
                monto_banco: targetSaldoBanco,
                cerrar_periodo: true,
                notas: 'Cierre Workload 2 cuadrado'
            }
        });
        assert.equal(closeRes.status, 200);
        assert.equal(closeRes.data.periodo.estado, 'CERRADO');
        assert.equal(closeRes.data.resumen_recalculado.diferencia, 0);
    });

    it('Workload 3: Transferencia Inter-Empresa + Centinela Bancario + Reportes Nativos de Saldos', async () => {
        const { runProactiveSentinelDispatch } = require('../services/telegramSentinelService');

        // 1. Transferencia de cuenta 1 (empresa 01) hacia cuenta 2 (empresa 02) por $1,600 -> genera sobregiro en cuenta 1 (1525 - 1600 = -75)
        const trRes = await harness.request('POST', '/api/bancos/movimientos', {
            userId: 2,
            body: {
                is_transferencia: true,
                cuenta_debitar_id: 1,
                cuenta_acreditar_id: 2,
                fecha: '2026-11-20',
                documento: 'TRF-W3',
                concepto: 'TRASLADO INTEREMPRESA',
                monto: 1600.00
            }
        });
        assert.equal(trRes.status, 201);

        // 2. Consultar reporte nativo de Saldos en Bancos y Chequera
        const saldosRes = await harness.request('GET', '/api/consultas/saldos-bancos?fecha_corte=2026-11-27', { userId: 3 });
        assert.equal(saldosRes.status, 200);
        const rows = Array.isArray(saldosRes.data) ? saldosRes.data : (saldosRes.data.cuentas || saldosRes.data.rows || []);
        const c1 = rows.find((r) => String(r.numero || r.cuenta_numero) === '2000012345');
        const c2 = rows.find((r) => String(r.numero || r.cuenta_numero) === '3000098765');
        assert.equal(Number(c1.saldo_chequera), -75);
        assert.equal(Number(c2.saldo_chequera), 2100);

        // 3. Ejecutar Centinela Proactivo -> detecta sobregiro y falta de validación (>7d), envía Telegram + notificación SIPE y deduplica en 2ª corrida
        const sentTelegram = [];
        const run1 = await runProactiveSentinelDispatch({
            db: harness.mockDb.pool,
            externalDb: harness.mockDb.externalPool,
            accountingDb: harness.mockDb.accountingPool,
            todayOverride: '2026-11-27',
            slotKey: 'w3_slot',
            sendTelegramFn: async (chatId, html) => {
                sentTelegram.push({ chatId, html });
                return { message_id: 9001 };
            }
        });
        assert.equal(run1.dispatched, true);
        assert.ok(run1.result.alertKeys.some((k) => /SOBREGIRO/i.test(k)));
        assert.ok(sentTelegram.length >= 1);

        const run2 = await runProactiveSentinelDispatch({
            db: harness.mockDb.pool,
            externalDb: harness.mockDb.externalPool,
            accountingDb: harness.mockDb.accountingPool,
            todayOverride: '2026-11-27',
            slotKey: 'w3_slot',
            sendTelegramFn: async (chatId, html) => {
                sentTelegram.push({ chatId, html });
                return { message_id: 9002 };
            }
        });
        assert.equal(run2.dispatched, false);
        assert.equal(run2.reason, 'deduplicated');
    });

    it('Workload 4: Ciclo de Vida Control de Pagos (Nueva Operación -> Preasignar -> Parcial -> CANCELADO -> Conciliación Signed URL)', async () => {
        // 1. Crear operación nueva con PDF cotización adjunto
        const createOp = await harness.request('POST', '/api/operaciones/recordatorios', {
            userId: 2,
            body: {
                descripcion: 'MANTENIMIENTO DISPENSADORES',
                id_ubicacion: 2,
                iniciar: '2026-11-10',
                activo: true,
                monto: 1000.00,
                repetir: 1,
                repetir_desc: 'VEZ',
                forma_pago: 'TRANSFERENCIA',
                comprobantes: [{ data_url: VALID_PDF_DATA_URL, nombre_original: 'cotizacion_w4.pdf', nota: 'Cotización inicial' }]
            }
        });
        assert.equal(createOp.status, 200);
        const venId = createOp.data.first_vencimiento_id;

        // 2. Solo Preasignar (meta) + subir 2ª captura
        const preRes = await harness.request('PATCH', `/api/operaciones/recordatorios/vencimiento/${venId}/meta`, {
            userId: 2,
            body: { tipo_operacion: 'GASTO', metodo_pago_preferido: 'TRANSFERENCIA', cuenta_bancaria_id: 1, notas_control: 'Aprobado Gerencia' }
        });
        assert.equal(preRes.status, 200);

        const comp2 = await harness.request('POST', `/api/operaciones/recordatorios/vencimiento/${venId}/comprobantes`, {
            userId: 2,
            body: { comprobantes: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'orden_compra.webp', nota: 'OC #44' }] }
        });
        assert.equal(comp2.status, 201);

        // 3. Abono parcial ($400) usando receiptCompressor
        const compressor = await import(pathToFileURL(path.join(FRONTEND_ROOT, 'utils/receiptCompressor.js')).href);
        let compImg;
        await withMockBrowserDomForCompressor(async () => {
            compImg = await compressor.compressReceiptFile({ name: 'image.png', type: 'image/png', size: 1500 });
        });

        const ab1 = await harness.request('POST', `/api/operaciones/recordatorios/vencimiento/${venId}/abonos`, {
            userId: 2,
            body: {
                tipo_operacion: 'GASTO',
                metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1,
                beneficiario: 'TECNICOS UNIDOS',
                referencia_doc: 'TRF-W4-1',
                fecha_pago: '2026-11-12',
                monto: 400.00,
                comprobantes: [{ data_url: compImg.data_url, nombre_original: compImg.nombre_original, nota: 'Anticipo 40%' }]
            }
        });
        assert.equal(ab1.status, 201);
        assert.equal(ab1.data.detail.resumen.estado_pago, 'PARCIAL');

        // 4. Abono final ($600 -> CANCELADO 100%)
        const ab2 = await harness.request('POST', `/api/operaciones/recordatorios/vencimiento/${venId}/abonos`, {
            userId: 2,
            body: {
                tipo_operacion: 'GASTO',
                metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1,
                beneficiario: 'TECNICOS UNIDOS',
                referencia_doc: 'TRF-W4-2',
                fecha_pago: '2026-11-15',
                monto: 600.00,
                comprobantes: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'finiquito.webp', nota: 'Finiquito 60%' }]
            }
        });
        assert.equal(ab2.status, 201);
        assert.equal(ab2.data.detail.resumen.estado_pago, 'CANCELADO');

        // 5. Subir captura adicional estando CANCELADO ($0.00)
        const postCancelComp = await harness.request('POST', `/api/operaciones/recordatorios/vencimiento/${venId}/comprobantes`, {
            userId: 2,
            body: { comprobantes: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'factura_final.webp', nota: 'DTE final' }] }
        });
        assert.equal(postCancelComp.status, 201);
        assert.equal(postCancelComp.data.detail.comprobantes.length, 5);

        // 6. Consultar Conciliación -> ambas sugerencias tienen comprobante_url firmada descargable (200) y vincular
        const concData = await harness.request('GET', '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-11-01&hasta=2026-11-30', { userId: 3 });
        assert.equal(concData.status, 200);
        const sugs = concData.data.sugerencias_control_pagos.filter((s) => Number(s.vencimiento_id) === Number(venId));
        assert.equal(sugs.length, 2);

        for (const s of sugs) {
            assert.match(s.comprobante_url, /\?exp=\d+&sig=[a-f0-9]{64}$/);
            const dl = await harness.request('GET', s.comprobante_url, { token: null });
            assert.equal(dl.status, 200);
            const vinc = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
                userId: 2,
                body: { abono_id: s.id, cuenta_bancaria_id: 1, fecha_aplicado: s.fecha_pago, accion: 'CREAR_Y_CONCILIAR' }
            });
            assert.equal(vinc.status, 200);
        }

        await harness.flushAuditLog();
        assert.ok(harness.mockDb.getState().bitacora_logs.length >= 6);
    });

    it('Workload 5: Gestión de Tareas con Evidencias WebP/PDF, Comentarios, Visor HMAC, MiBot Telegram y Limpieza', async () => {
        const { handleMibotCallbackQuery } = require('../services/mibotNotifierService');

        // 1. Admin crea tarea multi-asignado
        const tCreate = await harness.request('POST', '/api/tasks', {
            userId: 1,
            body: {
                titulo: 'Auditoría Nocturna Estación',
                descripcion: 'Adjuntar fotos de medidores y reporte PDF',
                fecha_vencimiento: '2026-11-30',
                prioridad: 'urgente',
                assigned_to: 6,
                assigned_to_ids: [5],
                checklist: [{ id: 1, texto: 'Tomar foto medidor', done: false }]
            }
        });
        assert.equal(tCreate.status, 201);
        assert.equal(tCreate.data.count, 2);
        const taskId = tCreate.data.tasks[0].id;

        // 2. Colaborador sube WebP + PDF, comenta y sube evidencia ligada al comentario
        const up1 = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
            userId: 6,
            body: {
                attachments: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'medidor.webp', nota: 'Medidor principal' },
                    { data_url: VALID_PDF_DATA_URL, nombre_original: 'acta.pdf', nota: 'Acta firmada' }
                ]
            }
        });
        assert.equal(up1.status, 201);

        const cmt = await harness.request('POST', `/api/tasks/${taskId}/comments`, {
            userId: 6,
            body: { comentario: 'Adjunto evidencia adicional de cierre' }
        });
        assert.equal(cmt.status, 201);

        const up2 = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
            userId: 6,
            body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'cierre.webp', comment_id: cmt.data.comment.id }
        });
        assert.equal(up2.status, 201);

        // 3. Verificar listado y detalle con URLs firmadas
        const listRes = await harness.request('GET', '/api/tasks', { userId: 1 });
        const listed = listRes.data.find((t) => Number(t.id) === Number(taskId));
        assert.equal(Number(listed.attachments_count), 3);

        const detail = await harness.request('GET', `/api/tasks/${taskId}`, { userId: 1 });
        const rawUrl = detail.data.attachments[0].archivo_url;
        const signedUrl = detail.data.attachments[0].signed_url;
        assert.equal((await harness.request('GET', rawUrl, { token: null })).status, 401);
        const okDl = await harness.request('GET', signedUrl, { token: null });
        assert.equal(okDl.status, 200);
        assert.deepEqual(okDl.buffer, VALID_WEBP_BUFFER);

        // 4. Despachar por MiBot Telegram
        const mibot = await harness.request('POST', '/api/telegram/mibot/programaciones', {
            userId: 1,
            body: {
                tipo: 'TAREA',
                titulo: 'Revisión urgente',
                mensaje: 'Revisar evidencias',
                task_id: taskId,
                destinatario_ids: [2],
                enviar_ahora: true,
                incluir_adjuntos: true
            }
        });
        assert.equal(mibot.status, 201);
        assert.equal(harness.telegramSpy.byMethod('sendPhoto').length, 2);
        assert.equal(harness.telegramSpy.byMethod('sendDocument').length, 1);

        // 5. Callbacks visto -> validar -> completa tarea
        const destId = mibot.data.programacion.destinatarios[0].id;
        const tgUser = harness.mockDb.getState().telegram_usuarios.find((u) => Number(u.id) === 2);
        const transport = {
            answerCallbackQuery: async () => true,
            editMessageReplyMarkup: async () => true,
            sendTelegramMessage: async () => ({ message_id: 99 })
        };
        await handleMibotCallbackQuery({
            db: harness.mockDb.pool,
            cq: { id: 'c1', data: `mibot:visto:${destId}`, from: { id: 1006 }, message: { chat: { id: 1006 }, message_id: 10 } },
            tgUser,
            transport
        });
        assert.equal(harness.mockDb.getState().tasks.find((t) => Number(t.id) === Number(taskId)).estado, 'en_proceso');

        await handleMibotCallbackQuery({
            db: harness.mockDb.pool,
            cq: { id: 'c2', data: `mibot:validar:${destId}`, from: { id: 1006 }, message: { chat: { id: 1006 }, message_id: 10 } },
            tgUser,
            transport
        });
        assert.equal(harness.mockDb.getState().tasks.find((t) => Number(t.id) === Number(taskId)).estado, 'completada');

        // 6. Eliminar 1 adjunto y validar limpieza física + bitácora
        const delId = up2.data.attachments[0].id;
        const diskPath = path.join(__dirname, '..', up2.data.attachments[0].archivo_url.replace('/api/', ''));
        assert.equal(fs.existsSync(diskPath), true);
        const delRes = await harness.request('DELETE', `/api/tasks/attachments/${delId}`, { userId: 1 });
        assert.equal(delRes.status, 200);
        assert.equal(fs.existsSync(diskPath), false);

        await harness.flushAuditLog();
        assert.ok(harness.mockDb.getState().bitacora_logs.some((l) => l.accion === 'DELETE' && l.entidad.includes('tasks.attachments')));
    });

    it('Workload 6: Auditoría Cross-Módulo de Seguridad (HMAC 4 Dirs, Límites 20MB/1MB, RBAC y Bitácora)', async () => {
        const { signUploadUrl } = require('../utils/uploadSigner');

        // 1. Verificar protección HMAC en los 4 directorios (pagos, tareas, bancos, movimientos)
        for (const dir of ['pagos', 'tareas', 'bancos', 'movimientos']) {
            const p = harness.writeTempProtectedFile(dir, `sec_${dir}.webp`, VALID_WEBP_BUFFER);
            assert.equal((await harness.request('GET', p, { token: null })).status, 401);
            assert.equal((await harness.request('GET', signUploadUrl(p, 120), { token: null })).status, 200);
        }

        // 2. Verificar whitelist 20MB vs límite 1MB
        const prefixes = harness.readServerLargePayloadPrefixes();
        for (const expected of ['/api/tasks', '/api/operaciones/recordatorios', '/api/bancos/movimientos']) {
            assert.ok(prefixes.includes(expected), `server.js debe incluir ${expected} en largePayloadPrefixes`);
        }

        const tRes = await harness.request('POST', '/api/tasks', {
            userId: 1,
            body: { titulo: 'Security Audit Task', fecha_vencimiento: '2026-11-30', assigned_to: 1 }
        });
        const bigOk = await harness.request('POST', `/api/tasks/${tRes.data.task.id}/attachments`, {
            userId: 1,
            body: { data_url: makeSizedValidWebpDataUrl(1.2 * 1024 * 1024), nombre_original: 'big.webp' }
        });
        assert.equal(bigOk.status, 201);

        const bigRejected = await harness.request('POST', '/api/notifications/999/read', {
            userId: 1,
            body: { junk: makeLargeString(1.5 * 1024 * 1024) }
        });
        assert.equal(bigRejected.status, 413);

        // 3. RBAC estricto across Bancos, Control de Pagos & Tareas
        assert.equal((await harness.request('POST', '/api/cheques', { userId: 6, body: {} })).status, 403);
        assert.equal((await harness.request('POST', '/api/operaciones/recordatorios', { userId: 6, body: {} })).status, 403);
        assert.equal((await harness.request('POST', '/api/tasks', { userId: 6, body: {} })).status, 403);

        // 4. Bitácora automática redacta base64 y no registra 4xx/413
        await harness.flushAuditLog();
        const logs = harness.mockDb.getState().bitacora_logs;
        const attAudit = logs.find((l) => l.entidad.includes('tasks.attachments') && l.accion === 'CREATE');
        assert.ok(attAudit);
        assert.match(attAudit.detalles, /\[archivo adjunto omitido/);
        assert.doesNotMatch(attAudit.detalles, /data:image\/webp;base64,/);
        assert.equal(logs.some((l) => l.entidad.includes('notifications')), false);
    });
});
