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
    SPOOFED_WEBP_WITH_PNG_BYTES,
    SPOOFED_PDF_WITH_TEXT,
    HTML_DATA_URL,
    SVG_DATA_URL,
    EMPTY_WEBP_DATA_URL,
    makeSizedValidWebpDataUrl,
    makeSizedValidPdfDataUrl,
    makeLargeString,
    withMockBrowserDomForCompressor
} = require('./helpers/fixtures.helper');

const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend/src');

describe('Tier 2 — Boundary Value Analysis, Negative Cases, RBAC & Adversarial Security', () => {
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

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Bancos, Cheques, Chequeras, Kardex, Transferencias & Aging Boundaries
    // ─────────────────────────────────────────────────────────────────────────
    describe('1. Bancos, Cheques, Chequeras, Aging & Transferencias Boundaries', () => {
        it('rechaza fechas calendario imposibles, montos <=0, duplicados 409, versión obsoleta 409 y período cerrado 423', async () => {
            const badDate = await harness.request('POST', '/api/cheques', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha: '2026-02-30', cheque: '5090', valor: 50, a_nombre: 'X', concepto: 'Y' }
            });
            assert.equal(badDate.status, 400);

            const zeroVal = await harness.request('POST', '/api/cheques', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha: '2026-11-01', cheque: '5091', valor: 0, a_nombre: 'X', concepto: 'Y' }
            });
            assert.equal(zeroVal.status, 400);

            const dupChk = await harness.request('POST', '/api/cheques', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha: '2026-11-01', cheque: '5001', valor: 50, a_nombre: 'X', concepto: 'Y' }
            });
            assert.equal(dupChk.status, 409);

            const staleVer = await harness.request('PUT', '/api/cheques/10', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha: '2026-10-20', cheque: '5001', valor: 150, a_nombre: 'PROVEEDOR UNO', concepto: 'EDIT', version: 99 }
            });
            assert.equal(staleVer.status, 409);

            harness.mockDb.getState().conciliacion_periodos.push({
                id: 401, cuenta_bancaria_id: 1, fecha_corte: '2026-10-31', estado: 'CERRADO'
            });
            const lockedMov = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha: '2026-10-30', documento: 'M-LOCK', concepto: 'BLOQ', monto: 20, cod_remesa: 'RM', tipo: 'ABONO' }
            });
            assert.equal(lockedMov.status, 423);
        });

        it('clasifica límites exactos de Aging (30, 31, 90, 91, 150, 180, 181 días) y excluye anulados/reservados', () => {
            const { classifyCheckAging, summarizeChecksAging } = require('../services/bancosIntegrityService');
            const ref = '2026-11-30';
            // Exactamente 30 días -> 0-30
            assert.equal(classifyCheckAging('2026-10-31', ref).bucket, '0-30');
            // Exactamente 31 días -> 31-90
            assert.equal(classifyCheckAging('2026-10-30', ref).bucket, '31-90');
            // Exactamente 90 días -> 31-90
            assert.equal(classifyCheckAging('2026-09-01', ref).bucket, '31-90');
            // Exactamente 91 días -> 91-180
            assert.equal(classifyCheckAging('2026-08-31', ref).bucket, '91-180');
            // Exactamente 150 días -> 91-180 con por_caducar=true
            const d150 = classifyCheckAging('2026-07-03', ref);
            assert.equal(d150.bucket, '91-180');
            assert.equal(d150.por_caducar, true);
            // Exactamente 180 días -> 91-180 (caduco=false)
            const d180 = classifyCheckAging('2026-06-03', ref);
            assert.equal(d180.bucket, '91-180');
            assert.equal(d180.caduco, false);
            // Exactamente 181 días -> >180 (caduco=true)
            const d181 = classifyCheckAging('2026-06-02', ref);
            assert.equal(d181.bucket, '>180');
            assert.equal(d181.caduco, true);

            const sum = summarizeChecksAging([
                { fecha: '2026-10-31', valor: 100, cheque_anulado: 0, es_reservado: 0, fue_noemitido: 0, deleted_at: null },
                { fecha: '2026-06-02', valor: 200, cheque_anulado: 1, es_reservado: 0, fue_noemitido: 0, deleted_at: null }, // anulado excluido
                { fecha: '2026-06-02', valor: 300, cheque_anulado: 0, es_reservado: 1, fue_noemitido: 0, deleted_at: null }, // reservado excluido
                { fecha: '2026-06-02', valor: 400, cheque_anulado: 0, es_reservado: 0, fue_noemitido: 1, deleted_at: null }, // no emitido excluido
                { fecha: '2026-06-02', valor: 500, cheque_anulado: 0, es_reservado: 0, fue_noemitido: 0, deleted_at: '2026-10-01' } // eliminado excluido
            ], ref);
            assert.equal(sum.total_cheques, 1);
            assert.equal(sum.total_monto, 100);
        });

        it('rechaza talonarios con rango invertido (400) o traslapado (409) y cuenta-resumen inexistente (404)', async () => {
            const badRange = await harness.request('POST', '/api/bancos/chequeras', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, serie: 'B', desde: 7010, hasta: 7000 }
            });
            assert.equal(badRange.status, 400);

            const okTal = await harness.request('POST', '/api/bancos/chequeras', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, serie: 'B', desde: 7001, hasta: 7050 }
            });
            assert.equal(okTal.status, 201);

            const overlapTal = await harness.request('POST', '/api/bancos/chequeras', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, serie: 'C', desde: 7040, hasta: 7080 }
            });
            assert.equal(overlapTal.status, 409);

            const notFoundResumen = await harness.request('GET', '/api/cheques/cuenta-resumen/99999', { userId: 2 });
            assert.equal(notFoundResumen.status, 404);
        });

        it('rechaza transferencias a misma cuenta (400), con cuenta destino cerrada (423 rollback atómico) y reproduce idempotencia', async () => {
            const sameAcc = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: { is_transferencia: true, cuenta_debitar_id: 1, cuenta_acreditar_id: 1, fecha: '2026-11-10', monto: 100 }
            });
            assert.equal(sameAcc.status, 400);

            harness.mockDb.getState().conciliacion_periodos.push({
                id: 402, cuenta_bancaria_id: 2, fecha_corte: '2026-11-30', estado: 'CERRADO'
            });
            const beforeCount = harness.mockDb.getState().movimientos_bancarios.length;
            const lockedDest = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: { is_transferencia: true, cuenta_debitar_id: 1, cuenta_acreditar_id: 2, fecha: '2026-11-10', monto: 100 }
            });
            assert.equal(lockedDest.status, 423);
            assert.equal(harness.mockDb.getState().movimientos_bancarios.length, beforeCount);

            // Idempotency replay
            harness.mockDb.getState().conciliacion_periodos = [];
            const payload = { is_transferencia: true, cuenta_debitar_id: 1, cuenta_acreditar_id: 2, fecha: '2026-11-12', documento: 'TR-IDEM', monto: 150 };
            const first = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2, headers: { 'X-Idempotency-Key': 'e2e-tr-001' }, body: payload
            });
            assert.equal(first.status, 201);
            const replay = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2, headers: { 'X-Idempotency-Key': 'e2e-tr-001' }, body: payload
            });
            assert.equal(replay.status, 201);
            assert.equal(replay.data.transfer_group_id, first.data.transfer_group_id);
        });

        it('valida Kardex rango inválido (400), cruce N:1 con suma desigual (400/409) y RBAC solo consulta (403)', async () => {
            const badKardex = await harness.request(
                'GET',
                '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-11-20&hasta=2026-11-01',
                { userId: 3 }
            );
            assert.equal(badKardex.status, 400);

            const writeDenied = await harness.request('POST', '/api/bancos/chequeras', {
                userId: 3,
                body: { cuenta_bancaria_id: 1, serie: 'Z', desde: 1, hasta: 10 }
            });
            assert.equal(writeDenied.status, 403);

            const closeDiff = await harness.request('POST', '/api/bancos/conciliacion/validar-saldo', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha_corte: '2026-10-31', monto_banco: 9999, cerrar_periodo: true }
            });
            assert.equal(closeDiff.status, 400);
            assert.equal(closeDiff.data.requires_confirmation, true);

            // Cruce N:1 con diferencia de montos -> debe rechazarse
            const st = harness.mockDb.getState();
            st.movimientos_bancarios.push({
                id: 350, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-25', fecha_aplicado: null,
                documento: 'M-350', concepto: 'CARGO', monto: 500, cargo: 500, abono: 0,
                tipo_remesa_id: 2, deleted_at: null, version: 1, fingerprint: 'fp-350'
            });
            const mismatchCruce = await harness.request('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: 'N_A_1',
                    fecha_aplicado: '2026-10-25',
                    libros_items: [{ id: 10, origen_tipo: 'CK' }], // valor 150 != 500
                    banco_items: [{ id: 350, origen_tipo: 'MOV' }]
                }
            });
            assert.ok([400, 409].includes(mismatchCruce.status));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Upload Security Guard & Evasion across All 4 Protected Directories
    // ─────────────────────────────────────────────────────────────────────────
    describe('2. HMAC Upload Guard & Anti-Evasion (pagos, tareas, bancos, movimientos)', () => {
        it('bloquea con 401 acceso anónimo, firmas alteradas, expiradas o intercambiadas en los 4 directorios protegidos', async () => {
            const { signUploadUrl } = require('../utils/uploadSigner');
            const dirs = ['pagos', 'tareas', 'bancos', 'movimientos'];

            for (const dir of dirs) {
                const rawPath = harness.writeTempProtectedFile(dir, `secret_${dir}.webp`, VALID_WEBP_BUFFER);
                const anon = await harness.request('GET', rawPath, { token: null });
                assert.equal(anon.status, 401, `${dir} debe rechazar acceso anónimo con 401`);

                const signed = signUploadUrl(rawPath, 300);
                const badSig = signed.slice(0, -4) + '0000';
                const tampered = await harness.request('GET', badSig, { token: null });
                assert.equal(tampered.status, 401, `${dir} debe rechazar firma alterada`);

                const pastExp = Math.floor(Date.now() / 1000) - 60;
                const sigParam = signed.split('sig=')[1];
                const expired = await harness.request('GET', `${rawPath}?exp=${pastExp}&sig=${sigParam}`, { token: null });
                assert.equal(expired.status, 401, `${dir} debe rechazar enlace expirado`);
            }

            // Intercambio de firma de archivo A sobre archivo B
            const pathA = harness.writeTempProtectedFile('tareas', 'fileA.webp', VALID_WEBP_BUFFER);
            const pathB = harness.writeTempProtectedFile('tareas', 'fileB.webp', VALID_WEBP_BUFFER);
            const signedA = signUploadUrl(pathA, 300);
            const queryA = signedA.split('?')[1];
            const swapped = await harness.request('GET', `${pathB}?${queryA}`, { token: null });
            assert.equal(swapped.status, 401);
        });

        it('bloquea evasiones por URI-encoding, doble-encoding, slashes y path traversal (401/400) y tolera signUploadUrl(null)', async () => {
            const { signUploadUrl } = require('../utils/uploadSigner');
            assert.equal(signUploadUrl(null), null);
            assert.equal(signUploadUrl(''), '');
            assert.equal(signUploadUrl('/other/public.png'), '/other/public.png');

            harness.writeTempProtectedFile('tareas', 'evasion.webp', VALID_WEBP_BUFFER);
            harness.writeTempProtectedFile('pagos', 'evasion.webp', VALID_WEBP_BUFFER);
            harness.writeTempProtectedFile('bancos', 'evasion.webp', VALID_WEBP_BUFFER);
            harness.writeTempProtectedFile('movimientos', 'evasion.webp', VALID_WEBP_BUFFER);

            const encodedUrls = [
                '/api/uploads/%74areas/evasion.webp',
                '/api/uploads/%2570agos/evasion.webp',
                '/api/uploads//bancos/evasion.webp',
                '/api/uploads/tareas%2fevasion.webp'
            ];
            for (const url of encodedUrls) {
                const res = await harness.request('GET', url, { token: null });
                assert.equal(res.status, 401, `Evasión ${url} debe devolver 401`);
            }

            // /./ y %2e%2e deben enviarse por socket TCP crudo (rawGet) para evitar que WHATWG fetch() normalice antes de llegar a Express
            const dotSegmentRes = await harness.rawGet('/api/uploads/./MOVIMIENTOS/evasion.webp');
            assert.equal(dotSegmentRes.status, 401, 'Evasión /./MOVIMIENTOS/ debe devolver 401');

            const trav1 = await harness.rawGet('/api/uploads/tareas/../.env');
            assert.equal(trav1.status, 400);
            const trav2 = await harness.rawGet('/api/uploads/pagos/%2e%2e/secret.txt');
            assert.equal(trav2.status, 400);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Payload Size Boundaries (20MB vs 1MB), Magic Bytes & Compressor Limits
    // ─────────────────────────────────────────────────────────────────────────
    describe('3. Límites de Payload (20MB/1MB), Magic Bytes y Tamaño de Archivos', () => {
        it('permite >1MB y rechaza >20MB con 413 en ruta whitelisted (/api/operaciones/recordatorios), y rechaza >1MB con 413 en rutas no whitelisted', async () => {
            const prefixes = harness.readServerLargePayloadPrefixes();
            assert.ok(prefixes.includes('/api/operaciones/recordatorios'));

            const payload15Mb = makeSizedValidWebpDataUrl(1.2 * 1024 * 1024); // ~1.6MB base64 JSON
            const upPago = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
                userId: 2,
                body: { comprobantes: [{ data_url: payload15Mb, nombre_original: 'grande_pago.webp' }] }
            });
            assert.equal(upPago.status, 201);

            const nonWhitelisted = await harness.request('POST', '/api/notifications/999/read', {
                userId: 1,
                body: { bloat: makeLargeString(1.5 * 1024 * 1024) }
            });
            assert.equal(nonWhitelisted.status, 413);

            // >20MB debe devolver 413 incluso en rutas whitelisted (20MB limit)
            const over20MbWhitelisted = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
                userId: 2,
                body: { bloat: makeLargeString(21 * 1024 * 1024) }
            });
            assert.equal(over20MbWhitelisted.status, 413);
        });

        it('permite >1MB en /api/tasks y registra /api/bancos/movimientos en server.js largePayloadPrefixes', async () => {
            const prefixes = harness.readServerLargePayloadPrefixes();
            assert.ok(prefixes.includes('/api/tasks'), 'server.js largePayloadPrefixes debe incluir /api/tasks');
            assert.ok(prefixes.includes('/api/bancos/movimientos'));

            const taskRes = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea Payload >1MB', fecha_vencimiento: '2026-11-30', assigned_to: 1 }
            });
            const taskId = taskRes.data.task.id;

            const payload15Mb = makeSizedValidWebpDataUrl(1.2 * 1024 * 1024);
            const upTask = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { data_url: payload15Mb, nombre_original: 'grande.webp' }
            });
            assert.equal(upTask.status, 201);
        });

        it('rechaza con 400 MIME inválidos, magic bytes falsificados y archivos vacíos en Pagos', async () => {
            const badPayloads = [
                SPOOFED_WEBP_WITH_PNG_BYTES,
                SPOOFED_PDF_WITH_TEXT,
                HTML_DATA_URL,
                SVG_DATA_URL,
                EMPTY_WEBP_DATA_URL
            ];

            for (const badUrl of badPayloads) {
                const resPago = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
                    userId: 2,
                    body: { comprobantes: [{ data_url: badUrl, nombre_original: 'malicioso.webp' }] }
                });
                assert.equal(resPago.status, 400, 'Control de Pagos debe rechazar magic bytes/MIME inválido');
            }
        });

        it('rechaza con 400 MIME inválidos, magic bytes falsificados y archivos vacíos en Movimientos y Tareas', async () => {
            const taskRes = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea Magic Bytes', fecha_vencimiento: '2026-11-30', assigned_to: 1 }
            });
            const taskId = taskRes.data.task.id;

            const badPayloads = [
                SPOOFED_WEBP_WITH_PNG_BYTES,
                SPOOFED_PDF_WITH_TEXT,
                HTML_DATA_URL,
                SVG_DATA_URL,
                EMPTY_WEBP_DATA_URL
            ];

            for (const badUrl of badPayloads) {
                const resTask = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                    userId: 1,
                    body: { data_url: badUrl, nombre_original: 'malicioso.webp' }
                });
                assert.equal(resTask.status, 400, 'Tareas debe rechazar magic bytes/MIME inválido');

                const resMov = await harness.request('POST', '/api/bancos/movimientos', {
                    userId: 2,
                    body: {
                        cuenta_bancaria_id: 1, fecha: '2026-11-22', documento: 'BAD-1',
                        concepto: 'TEST BAD', monto: 10, cod_remesa: 'RM', tipo: 'ABONO',
                        comprobante: { data_url: badUrl, nombre_original: 'malo.webp' }
                    }
                });
                assert.equal(resMov.status, 400, 'Movimientos debe rechazar magic bytes/MIME inválido');
            }
        });

        it('rechaza imágenes >5MB y PDFs >10MB en Pagos, y receiptCompressor rechaza PDFs >8MB o tipos inválidos', async () => {
            const img6Mb = makeSizedValidWebpDataUrl(5.2 * 1024 * 1024);
            const resImg = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
                userId: 2,
                body: { comprobantes: [{ data_url: img6Mb, nombre_original: 'gigante.webp' }] }
            });
            assert.equal(resImg.status, 400);

            const pdf11Mb = makeSizedValidPdfDataUrl(10.2 * 1024 * 1024);
            const resPdf = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
                userId: 2,
                body: { comprobantes: [{ data_url: pdf11Mb, nombre_original: 'gigante.pdf' }] }
            });
            assert.equal(resPdf.status, 400);

            const compressor = await import(pathToFileURL(path.join(FRONTEND_ROOT, 'utils/receiptCompressor.js')).href);
            await withMockBrowserDomForCompressor(async () => {
                await assert.rejects(
                    () => compressor.compressReceiptFile({ name: 'pesado.pdf', type: 'application/pdf', size: 9 * 1024 * 1024 }),
                    /8 MB/i
                );
                await assert.rejects(() => compressor.compressReceiptFile(null), /seleccionó ningún archivo/i);
                await assert.rejects(
                    () => compressor.compressReceiptFile({ name: 'texto.txt', type: 'text/plain', size: 50 }),
                    /no soportado/i
                );
            });
        });

        it('rechaza imágenes >5MB y PDFs >10MB en backend para Tareas y Movimientos', async () => {
            const img6Mb = makeSizedValidWebpDataUrl(5.2 * 1024 * 1024);
            const pdf11Mb = makeSizedValidPdfDataUrl(10.2 * 1024 * 1024);

            const taskRes = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea Límites Archivo', fecha_vencimiento: '2026-11-30', assigned_to: 1 }
            });
            const taskId = taskRes.data.task.id;

            const resTaskImg = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { data_url: img6Mb, nombre_original: 'gigante_tarea.webp' }
            });
            assert.equal(resTaskImg.status, 400, 'Tareas debe rechazar imagen >5MB con 400');

            const resTaskPdf = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { data_url: pdf11Mb, nombre_original: 'gigante_tarea.pdf' }
            });
            assert.equal(resTaskPdf.status, 400, 'Tareas debe rechazar PDF >10MB con 400');

            const resMovImg = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1, fecha: '2026-11-22', documento: 'BIG-1',
                    concepto: 'IMG GIGANTE', monto: 10, cod_remesa: 'RM', tipo: 'ABONO',
                    comprobante: { data_url: img6Mb, nombre_original: 'gigante_mov.webp' }
                }
            });
            assert.equal(resMovImg.status, 400, 'Movimientos debe rechazar imagen >5MB con 400');

            const resMovPdf = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1, fecha: '2026-11-22', documento: 'BIG-2',
                    concepto: 'PDF GIGANTE', monto: 10, cod_remesa: 'RM', tipo: 'ABONO',
                    comprobante: { data_url: pdf11Mb, nombre_original: 'gigante_mov.pdf' }
                }
            });
            assert.equal(resMovPdf.status, 400, 'Movimientos debe rechazar PDF >10MB con 400');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Control de Pagos CANCELADO ($0.00), Guards UI & Truncation
    // ─────────────────────────────────────────────────────────────────────────
    describe('4. Control de Pagos CANCELADO ($0.00), Truncamiento y Guards de Modales', () => {
        it('permite adjuntar capturas en estado CANCELADO ($0.00) sin alterar saldo y rechaza abono $0.00; trunca nota >255 chars', async () => {
            // Cancelar vencimiento 500 por completo ($1000)
            const payFull = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                userId: 2,
                body: { tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA', cuenta_bancaria_id: 1, fecha_pago: '2026-11-25', monto: 1000 }
            });
            assert.equal(payFull.status, 201);
            assert.equal(payFull.data.detail.resumen.estado_pago, 'CANCELADO');

            // Intentar abono $0.00 -> 400
            const zeroAbono = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                userId: 2,
                body: { tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA', cuenta_bancaria_id: 1, fecha_pago: '2026-11-26', monto: 0 }
            });
            assert.equal(zeroAbono.status, 400);

            // Subir captura directa estando CANCELADO -> 201 con nota > 255 chars truncada
            const longNote = 'A'.repeat(320);
            const postComp = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
                userId: 2,
                body: {
                    comprobantes: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'extra_cancelado.webp', nota: longNote }]
                }
            });
            assert.equal(postComp.status, 201);
            assert.equal(postComp.data.detail.resumen.estado_pago, 'CANCELADO');
            assert.equal(postComp.data.detail.resumen.monto_pagado, 1000);
            assert.equal(postComp.data.detail.comprobantes[0].nota.length, 255);
        });

        it('Conciliación CONTROL PAGOS tolera abonos sin comprobantes (comprobante_url=null, comprobantes_count=0)', async () => {
            const abNoReceipt = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                userId: 2,
                body: {
                    tipo_operacion: 'CXP',
                    metodo_pago: 'TRANSFERENCIA',
                    cuenta_bancaria_id: 1,
                    beneficiario: 'SIN RECIBO S.A.',
                    referencia_doc: 'SIN-REC-01',
                    fecha_pago: '2026-10-24',
                    monto: 125.00
                }
            });
            assert.equal(abNoReceipt.status, 201);

            const concRes = await harness.request(
                'GET',
                '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31',
                { userId: 3 }
            );
            assert.equal(concRes.status, 200);
            const sug = concRes.data.sugerencias_control_pagos.find((s) => s.referencia_doc === 'SIN-REC-01');
            assert.ok(sug);
            assert.equal(sug.comprobantes_count, 0);
            assert.equal(sug.comprobante_url, null);
        });

        it('ControlPagosModal.jsx protege paste bajo modales, maneja CANCELADO sin pérdida, guarda pendingReceipts en Solo Preasignar y respeta campos editados ante OCR', () => {
            const modalSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'components/ControlPagosModal.jsx'), 'utf8');

            const pasteEffectMatch = modalSrc.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]{0,1200}addEventListener\(['"]paste['"][\s\S]{0,300}\},\s*\[[^\]]*\]\)/);
            assert.ok(pasteEffectMatch, 'Debe existir el listener useEffect de paste en ControlPagosModal.jsx');
            assert.match(pasteEffectMatch[0], /viewerOpen/, 'El listener de paste debe chequear viewerOpen');
            assert.match(pasteEffectMatch[0], /mibotOpen/, 'El listener de paste debe chequear mibotOpen');

            assert.match(modalSrc, /handleSaveMetaOnly[\s\S]{0,1200}pendingReceipts/, 'Solo Preasignar debe persistir pendingReceipts');

            const applyOcrMatch = modalSrc.match(/const\s+applyOcrAnalysisToForm\s*=\s*useCallback\([\s\S]{0,5500}return\s*\{\s*filledFields,\s*skippedFields\s*\};/);
            assert.ok(applyOcrMatch, 'Debe existir applyOcrAnalysisToForm en ControlPagosModal.jsx');
            assert.match(applyOcrMatch[0], /dirtyFieldsRef|dirtyFields|editedFields/, 'applyOcrAnalysisToForm debe verificar campos editados manualmente');
            assert.match(applyOcrMatch[0], /isEmpty/, 'applyOcrAnalysisToForm debe verificar campos vacíos antes de sobrescribir');

            const processFilesMatch = modalSrc.match(/const\s+handleProcessFiles\s*=[\s\S]{0,3500}finally\s*\{/);
            assert.ok(processFilesMatch, 'Debe existir handleProcessFiles en ControlPagosModal.jsx');
            assert.match(processFilesMatch[0], /isFullyPaid[\s\S]{0,900}\/comprobantes/, 'CANCELADO (isFullyPaid) debe subir capturas inmediatamente a /comprobantes');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Tasks RBAC, 404/400 & MiBot Resilience
    // ─────────────────────────────────────────────────────────────────────────
    describe('5. Tasks RBAC, 404/400 y Resiliencia de Adjuntos MiBot', () => {
        it('aplica 401 sin token, 403 entre colaboradores no propietarios y 404/400 en IDs o payloads inválidos', async () => {
            const noAuth = await harness.request('GET', '/api/tasks', { token: null });
            assert.equal(noAuth.status, 401);

            // Admin crea tarea asignada a user 5 (impresor)
            const tRes = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea Privada', fecha_vencimiento: '2026-11-30', assigned_to: 5 }
            });
            const taskId = tRes.data.task.id;

            // User 6 (sin manage_tasks y no es creador/asignado) recibe 403 al ver o adjuntar
            const forbiddenGet = await harness.request('GET', `/api/tasks/${taskId}`, { userId: 6 });
            assert.equal(forbiddenGet.status, 403);

            const forbiddenAttach = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 6,
                body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'intruso.webp' }
            });
            assert.equal(forbiddenAttach.status, 403);

            // 404 en tarea o adjunto inexistente, 400 en cuerpo vacío
            const notFoundTask = await harness.request('POST', '/api/tasks/999999/attachments', {
                userId: 1,
                body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'x.webp' }
            });
            assert.equal(notFoundTask.status, 404);

            const notFoundAtt = await harness.request('DELETE', '/api/tasks/attachments/999999', { userId: 1 });
            assert.equal(notFoundAtt.status, 404);

            const emptyAtt = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { attachments: [] }
            });
            assert.equal(emptyAtt.status, 400);
        });

        it('aplica 403 RBAC al intentar eliminar adjunto real de otra tarea (DELETE /api/tasks/attachments/:realId)', async () => {
            const tRes = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea RBAC Delete Adjunto', fecha_vencimiento: '2026-11-30', assigned_to: 5 }
            });
            assert.equal(tRes.status, 201);
            const taskId = tRes.data.task.id;

            const attRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'protegido.webp' }
            });
            assert.equal(attRes.status, 201);
            const realId = attRes.data.attachments[0].id;

            // Colaborador no asignado ni creador recibe 403
            const forbiddenDel = await harness.request('DELETE', `/api/tasks/attachments/${realId}`, { userId: 6 });
            assert.equal(forbiddenDel.status, 403);

            // Propietario/admin sí puede eliminar (200)
            const okDel = await harness.request('DELETE', `/api/tasks/attachments/${realId}`, { userId: 1 });
            assert.equal(okDel.status, 200);
        });

        it('sendTelegramPhoto valida buffer no vacío y MIME WebP', async () => {
            const { sendTelegramPhoto } = require('../services/telegramTransportService');
            await assert.rejects(() => sendTelegramPhoto('1001', Buffer.alloc(0), 'x', null, 'a.webp'), /inválido o vacío/i);

            await sendTelegramPhoto('1001', VALID_WEBP_BUFFER, 'Foto WebP', null, 'captura.webp');
            const photos = harness.telegramSpy.byMethod('sendPhoto');
            assert.equal(photos.length, 1);
            assert.equal(photos[0].mimeType, 'image/webp');
        });

        it('MiBot maneja archivo físico faltante sin abortar entrega de adjunto hermano válido ni mensaje HTML', async () => {
            // Tarea con 1 adjunto faltante en disco Y 1 adjunto hermano válido -> MiBot debe enviar mensaje + adjunto válido sin abortar el bucle
            const tRes = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea Archivo Perdido + Hermano Válido', fecha_vencimiento: '2026-11-30', assigned_to: 6 }
            });
            const taskId = tRes.data.task.id;
            const validSibUrl = harness.writeTempProtectedFile('tareas', 'sib_valido.webp', VALID_WEBP_BUFFER);
            harness.mockDb.getState().task_attachments.push(
                {
                    id: 9991, task_id: taskId, comment_id: null, nombre_original: 'fantasma.webp',
                    archivo_url: '/api/uploads/tareas/no_existe_en_disco.webp', mime_type: 'image/webp',
                    tamano_bytes: 100, nota: 'Missing', uploaded_by: 1, uploaded_by_name: 'Admin'
                },
                {
                    id: 9992, task_id: taskId, comment_id: null, nombre_original: 'sib_valido.webp',
                    archivo_url: validSibUrl, mime_type: 'image/webp',
                    tamano_bytes: VALID_WEBP_BUFFER.length, nota: 'Valid sibling', uploaded_by: 1, uploaded_by_name: 'Admin'
                }
            );

            const mibotRes = await harness.request('POST', '/api/telegram/mibot/programaciones', {
                userId: 1,
                body: {
                    tipo: 'TAREA',
                    titulo: 'Alerta resiliente',
                    mensaje: 'Mensaje y adjunto hermano deben enviarse aunque falte un archivo',
                    task_id: taskId,
                    destinatario_ids: [2],
                    enviar_ahora: true,
                    incluir_adjuntos: true
                }
            });
            assert.equal(mibotRes.status, 201);
            assert.equal(mibotRes.data.delivery_status, 'sent');
            const msgCalls = harness.telegramSpy.byMethod('sendMessage');
            const sibPhotos = harness.telegramSpy.byMethod('sendPhoto');
            assert.equal(sibPhotos.length, 1, 'MiBot debe entregar el adjunto hermano válido aunque el primero falte (ENOENT)');
            assert.deepEqual(sibPhotos[0].fileBuffer, VALID_WEBP_BUFFER);
            if (msgCalls.length >= 1) {
                assert.equal(msgCalls.length, 1);
                assert.match(msgCalls[0].text, /Mensaje y adjunto hermano deben enviarse/);
                assert.ok(msgCalls[0].replyMarkup?.inline_keyboard?.length >= 1);
            } else {
                // Con 1 sola imagen <= 1020 chars tras omitir ENOENT, MiBot entrega mensaje HTML + teclado en sendPhoto
                assert.match(sibPhotos[0].caption || '', /Mensaje y adjunto hermano deben enviarse/);
                assert.ok(sibPhotos[0].replyMarkup?.inline_keyboard?.length >= 1);
            }
        });
    });
});
