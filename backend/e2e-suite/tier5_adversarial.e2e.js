'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createE2eHarness, UPLOADS_DIR } = require('./helpers/e2eHarness.helper');
const {
    VALID_WEBP_BUFFER,
    VALID_WEBP_DATA_URL,
    SPOOFED_WEBP_WITH_PNG_BYTES,
    HTML_DATA_URL,
    SVG_DATA_URL
} = require('./helpers/fixtures.helper');

const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend/src');

describe('Tier 5 — Adversarial Security, Concurrency, Financial Invariants & Rollback Hardening', () => {
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
    // T5-01 (Vector 1): Concurrency & Race Conditions
    // ─────────────────────────────────────────────────────────────────────────
    it('T5-01: serializa carreras concurrentes en cheques (201+409), cruces (201+409), aplicar (200+409), abonos (201+409) + PUT sobrepago, y DELETE task attachments (200+404)', async () => {
        // 1. Concurrent POST /api/cheques con mismo número 888111
        const [chkA, chkB] = await Promise.all([
            harness.request('POST', '/api/cheques', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha: '2026-11-10', cheque: '888111', valor: 100, a_nombre: 'RACE A', concepto: 'CARRERA' }
            }),
            harness.request('POST', '/api/cheques', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha: '2026-11-10', cheque: '888111', valor: 100, a_nombre: 'RACE B', concepto: 'CARRERA' }
            })
        ]);
        assert.deepEqual([chkA.status, chkB.status].sort((a, b) => a - b), [201, 409]);
        const active888111 = harness.mockDb.getState().cheques.filter((c) => c.cheque === '888111' && !c.deleted_at && !c.cheque_anulado);
        assert.equal(active888111.length, 1);

        // 2. Concurrent POST /api/bancos/conciliacion/cruces sobre mismo MOV #2 ($25)
        const [cruceA, cruceB] = await Promise.all([
            harness.request('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: '1_A_N',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-11-12',
                    libro_items: [{ id: 2, origen_tipo: 'MOV' }],
                    banco_items: [{ monto: 10 }, { monto: 15 }]
                }
            }),
            harness.request('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: '1_A_N',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-11-13',
                    libro_items: [{ id: 2, origen_tipo: 'MOV' }],
                    banco_items: [{ monto: 12 }, { monto: 13 }]
                }
            })
        ]);
        assert.deepEqual([cruceA.status, cruceB.status].sort((a, b) => a - b), [201, 409]);

        // 3. Concurrent POST /api/bancos/conciliacion/aplicar sobre nuevo MOV #101 -> 200 + 409 preservando primera fecha_aplicado
        const st = harness.mockDb.getState();
        st.movimientos_bancarios.push({
            id: 101, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-11-14', fecha_aplicado: null,
            documento: 'MOV-RACE', concepto: 'RACE APLICAR', monto: 75, cargo: 75, abono: 0,
            tipo_remesa_id: 2, deleted_at: null, version: 1, fingerprint: 'fp-race-101'
        });
        const [appA, appB] = await Promise.all([
            harness.request('POST', '/api/bancos/conciliacion/aplicar', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, accion: 'CONCILIAR', fecha_aplicado: '2026-11-18', items: [{ id: 101, origen_tipo: 'MOV' }] }
            }),
            harness.request('POST', '/api/bancos/conciliacion/aplicar', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, accion: 'CONCILIAR', fecha_aplicado: '2026-11-19', items: [{ id: 101, origen_tipo: 'MOV' }] }
            })
        ]);
        assert.deepEqual([appA.status, appB.status].sort((a, b) => a - b), [200, 409]);
        const mov101 = st.movimientos_bancarios.find((m) => m.id === 101);
        assert.equal(mov101.fecha_aplicado, appA.status === 200 ? '2026-11-18' : '2026-11-19');

        // 4. Concurrent POST /api/operaciones/recordatorios/vencimiento/500/abonos ($800 + $800 sobre $1,000) + PUT sobrepago
        const [abA, abB] = await Promise.all([
            harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                userId: 2,
                body: { tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA', cuenta_bancaria_id: 1, fecha_pago: '2026-11-10', monto: 800 }
            }),
            harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                userId: 2,
                body: { tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA', cuenta_bancaria_id: 1, fecha_pago: '2026-11-10', monto: 800 }
            })
        ]);
        assert.deepEqual([abA.status, abB.status].sort((a, b) => a - b), [201, 409]);
        const abonosVen500 = st.recordatorios_pagos_abonos.filter((a) => Number(a.vencimiento_id) === 500);
        const abonosSum = abonosVen500.reduce((s, a) => s + Number(a.monto || 0), 0);
        assert.equal(abonosVen500.length, 1);
        assert.ok(abonosSum <= 1000, `La suma de abonos (${abonosSum}) no debe exceder $1000`);

        const createdAbonoId = abonosVen500[0].id;
        const putOverpay = await harness.request('PUT', `/api/operaciones/recordatorios/abonos/${createdAbonoId}`, {
            userId: 2,
            body: { monto: 2500 }
        });
        assert.equal(putOverpay.status, 409);
        assert.equal(abonosVen500[0].monto, 800);

        // 5. Concurrent DELETE /api/tasks/attachments/:id -> 200 + 404 y limpieza refcount-safe
        const taskRes = await harness.request('POST', '/api/tasks', {
            userId: 1,
            body: { titulo: 'Tarea Race Delete', fecha_vencimiento: '2026-11-30', assigned_to: 1 }
        });
        assert.equal(taskRes.status, 201);
        const taskId = taskRes.data.task.id;

        const attRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
            userId: 1,
            body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'race_del.webp' }
        });
        assert.equal(attRes.status, 201);
        const att = attRes.data.attachments[0];
        const diskPath = path.join(UPLOADS_DIR, 'tareas', path.basename(att.archivo_url));
        assert.equal(fs.existsSync(diskPath), true);

        const [delA, delB] = await Promise.all([
            harness.request('DELETE', `/api/tasks/attachments/${att.id}`, { userId: 1 }),
            harness.request('DELETE', `/api/tasks/attachments/${att.id}`, { userId: 1 })
        ]);
        assert.deepEqual([delA.status, delB.status].sort((a, b) => a - b), [200, 404]);
        assert.equal(fs.existsSync(diskPath), false);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // T5-02 (Vector 2): Float & Cent Invariants
    // ─────────────────────────────────────────────────────────────────────────
    it('T5-02: preserva invariantes de centavos en cruces (0.10+0.20=0.30 vs 0.01 diff), detectGroupedMatches, computePaymentBalance (99.994) y Kardex filtrado', async () => {
        const { detectGroupedMatches } = require('../services/bankStatementParserService');
        const { computePaymentBalance } = require('../services/recordatoriosPagosService');

        const st = harness.mockDb.getState();
        st.movimientos_bancarios.push(
            { id: 111, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-21', fecha_aplicado: null, documento: 'C1', concepto: 'CENT 1', monto: 0.10, cargo: 0.10, abono: 0, tipo_remesa_id: 2, deleted_at: null, version: 1, fingerprint: 'fp-c1' },
            { id: 112, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-21', fecha_aplicado: null, documento: 'C2', concepto: 'CENT 2', monto: 0.20, cargo: 0.20, abono: 0, tipo_remesa_id: 2, deleted_at: null, version: 1, fingerprint: 'fp-c2' },
            { id: 113, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-21', fecha_aplicado: null, documento: 'C3', concepto: 'CENT 100', monto: 100.00, cargo: 100.00, abono: 0, tipo_remesa_id: 2, deleted_at: null, version: 1, fingerprint: 'fp-c3' }
        );

        // 0.10 + 0.20 === 0.30 -> 201
        const exactCentCruce = await harness.request('POST', '/api/bancos/conciliacion/cruces', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                tipo_cruce: 'N_A_1',
                direccion: 'CARGO',
                fecha_aplicado: '2026-10-22',
                libro_items: [{ id: 111, origen_tipo: 'MOV' }, { id: 112, origen_tipo: 'MOV' }],
                banco_items: [{ monto: 0.30, documento: 'EXT-30' }]
            }
        });
        assert.equal(exactCentCruce.status, 201);

        // 100.00 vs 100.01 -> 400
        const oneCentOff = await harness.request('POST', '/api/bancos/conciliacion/cruces', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1,
                tipo_cruce: '1_A_N',
                direccion: 'CARGO',
                fecha_aplicado: '2026-10-22',
                libro_items: [{ id: 113, origen_tipo: 'MOV' }],
                banco_items: [{ monto: 50.00 }, { monto: 50.01 }]
            }
        });
        assert.equal(oneCentOff.status, 400);

        // detectGroupedMatches con 0.10 + 0.20 = 0.30
        const pendientesFloat = [
            { id: 201, origen_tipo: 'CK', documento: 'F1', concepto: 'A', monto: 0.10, cargo: 0.10, abono: 0, fecha: '2026-10-20' },
            { id: 202, origen_tipo: 'CK', documento: 'F2', concepto: 'B', monto: 0.20, cargo: 0.20, abono: 0, fecha: '2026-10-20' }
        ];
        const groupedOk = detectGroupedMatches(
            [{ fila_origen: 1, fecha: '21/10/2026', fecha_ymd: '2026-10-21', documento: 'E30', descripcion: 'CARGO', cargo: 0.30, abono: 0, monto: 0.30, tipo: 'CARGO', match: null }],
            pendientesFloat
        );
        assert.equal(groupedOk.length, 1);
        assert.equal(groupedOk[0].monto_total, 0.30);

        // computePaymentBalance cent boundary: 99.994 on 100 -> PARCIAL with porcentaje_pagado < 100
        const bal = computePaymentBalance(100, [{ monto: 99.994, fecha_pago: '2026-11-10' }], 'P');
        assert.equal(bal.estado_pago, 'PARCIAL');
        assert.equal(bal.saldo_pendiente, 0.01);
        assert.ok(bal.porcentaje_pagado <= 99.99 && bal.porcentaje_pagado < 100, `porcentaje_pagado=${bal.porcentaje_pagado} debe ser < 100 cuando saldo_pendiente > 0`);

        // Kardex filtrado preserva saldo_inicial_periodo + neto_periodo === saldo_final_periodo y expone totales_filtrados
        const kardexTransit = await harness.request(
            'GET',
            '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&estado=EN_TRANSITO',
            { userId: 3 }
        );
        assert.equal(kardexTransit.status, 200);
        const totT = kardexTransit.data.totales;
        assert.equal(
            Math.round((totT.saldo_inicial_periodo + totT.neto_periodo) * 100) / 100,
            Math.round(totT.saldo_final_periodo * 100) / 100
        );
        assert.ok(kardexTransit.data.totales_filtrados);
        assert.equal(kardexTransit.data.totales_filtrados.cantidad_items, kardexTransit.data.items.length);

        const kardexSearch = await harness.request(
            'GET',
            '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&search=COMISION',
            { userId: 3 }
        );
        assert.equal(kardexSearch.status, 200);
        const totS = kardexSearch.data.totales;
        assert.equal(
            Math.round((totS.saldo_inicial_periodo + totS.neto_periodo) * 100) / 100,
            Math.round(totS.saldo_final_periodo * 100) / 100
        );
        assert.ok(kardexSearch.data.totales_filtrados);
        assert.equal(kardexSearch.data.totales_filtrados.total_cargos, 25);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // T5-03 (Vector 3): Exhaustive Period Locks (423) & Closure Immutability
    // ─────────────────────────────────────────────────────────────────────────
    it('T5-03: bloquea con 423 los 18 endpoints mutantes sobre período cerrado al 2026-11-15 y rechaza re-cierre/retro-cierre sobre CERRADO', async () => {
        const st = harness.mockDb.getState();

        // Seed movimientos, comprobante, cheque y cruce dentro del período que se va a cerrar (<= 2026-11-15)
        st.movimientos_bancarios.push(
            {
                id: 121, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-11-10', fecha_aplicado: null,
                documento: 'MOV-LOCK-121', concepto: 'MOV PENDIENTE', monto: 50, cargo: 50, abono: 0,
                tipo_remesa_id: 2, es_contabilizado: 0, deleted_at: null, version: 1, fingerprint: 'fp-121'
            },
            {
                id: 122, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-11-11', fecha_aplicado: '2026-11-12',
                documento: 'MOV-CRUCE-122', concepto: 'EN CRUCE', monto: 60, cargo: 60, abono: 0,
                tipo_remesa_id: 2, es_contabilizado: 0, deleted_at: null, version: 1, fingerprint: 'fp-122'
            }
        );
        st.movimientos_bancarios_comprobantes.push({
            id: 120, movimiento_id: 121, nombre_original: 'comp121.webp',
            archivo_url: '/api/uploads/movimientos/comp121.webp', mime_type: 'image/webp',
            tamano_bytes: 100, nota: 'Original', uploaded_by: 2
        });
        st.cheques.push({
            id: 120, empresa_id: 1, cuenta_bancaria_id: 1, llave: 'CHQ-120', fecha: '2026-11-10',
            cheque_anulado: 0, cheque: '5120', valor: 80, a_nombre: 'PROV LOCK', fecha_aplicado: null,
            concepto: 'CHQ LOCK', es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, es_contabilizado: 0,
            deleted_at: null, version: 1
        });
        st.conciliacion_cruces.push({
            id: 675, cuenta_bancaria_id: 1, tipo_cruce: '1_A_N', direccion: 'CARGO',
            monto_total: 60, fecha_aplicado: '2026-11-12', estado: 'ACTIVO'
        });
        st.conciliacion_cruce_items.push(
            { id: 695, cruce_id: 675, lado: 'LIBRO', origen_tipo: 'MOV', entidad_id: 122, monto: 60 }
        );

        // Cerrar período al 2026-11-15
        const closeRes = await harness.request('POST', '/api/bancos/conciliacion/periodos/cerrar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha_corte: '2026-11-15', monto_banco: 0, confirmar_con_diferencia: true, notas: 'Cierre T5-03' }
        });
        assert.equal(closeRes.status, 200);

        // Re-cerrar misma fecha 2026-11-15 o retro-cerrar 2026-11-10 sobre período ya CERRADO -> 409 (sin sobrescribir!)
        const reClose = await harness.request('POST', '/api/bancos/conciliacion/periodos/cerrar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha_corte: '2026-11-15', monto_banco: 9999, confirmar_con_diferencia: true }
        });
        assert.equal(reClose.status, 409);

        const backDateClose = await harness.request('POST', '/api/bancos/conciliacion/periodos/cerrar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha_corte: '2026-11-10', monto_banco: 0, confirmar_con_diferencia: true }
        });
        assert.equal(backDateClose.status, 409);

        // Cerrar fecha POSTERIOR 2026-11-30 SÍ debe funcionar -> 200
        const laterClose = await harness.request('POST', '/api/bancos/conciliacion/periodos/cerrar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha_corte: '2026-11-30', monto_banco: 0, confirmar_con_diferencia: true }
        });
        assert.equal(laterClose.status, 200);

        // Ahora verificar 423 en TODOS los endpoints mutantes dentro del período cerrado (<= 2026-11-15)
        const rPostMov = await harness.request('POST', '/api/bancos/movimientos', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha: '2026-11-10', documento: 'M-L1', concepto: 'LOCK', monto: 10, cod_remesa: 'RM', tipo: 'ABONO' }
        });
        assert.equal(rPostMov.status, 423);

        const rPutMov = await harness.request('PUT', '/api/bancos/movimientos/121', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha: '2026-11-10', documento: 'M-L1', concepto: 'EDIT', monto: 50, tipo: 'CARGO' }
        });
        assert.equal(rPutMov.status, 423);

        const rDelMov = await harness.request('DELETE', '/api/bancos/movimientos/121', { userId: 2 });
        assert.equal(rDelMov.status, 423);

        const rTransfer = await harness.request('POST', '/api/bancos/movimientos/transferencia', {
            userId: 2,
            body: { cuenta_debitar_id: 1, cuenta_acreditar_id: 2, fecha: '2026-11-10', monto: 25 }
        });
        assert.equal(rTransfer.status, 423);

        const rPostComp = await harness.request('POST', '/api/bancos/movimientos/121/comprobantes', {
            userId: 2,
            body: { comprobantes: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'lock.webp' }] }
        });
        assert.equal(rPostComp.status, 423);

        const rPatchComp = await harness.request('PATCH', '/api/bancos/movimientos/comprobantes/120', {
            userId: 2,
            body: { nota: 'Edit lock' }
        });
        assert.equal(rPatchComp.status, 423);

        const rDelComp = await harness.request('DELETE', '/api/bancos/movimientos/comprobantes/120', { userId: 2 });
        assert.equal(rDelComp.status, 423);

        const rAplicar = await harness.request('POST', '/api/bancos/conciliacion/aplicar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, accion: 'CONCILIAR', fecha_aplicado: '2026-11-10', items: [{ id: 121, origen_tipo: 'MOV' }] }
        });
        assert.equal(rAplicar.status, 423);

        const rCrearAplicar = await harness.request('POST', '/api/bancos/conciliacion/crear-y-aplicar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha: '2026-11-10', fecha_aplicado: '2026-11-10', documento: 'CA-1', concepto: 'LOCK', monto: 10, tipo: 'ABONO' }
        });
        assert.equal(rCrearAplicar.status, 423);

        const rMasivo = await harness.request('POST', '/api/bancos/conciliacion/crear-masivo-y-aplicar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, items: [{ fecha: '2026-11-10', fecha_aplicado: '2026-11-10', documento: 'MA-1', concepto: 'LOCK', monto: 10, tipo: 'ABONO' }] }
        });
        assert.equal(rMasivo.status, 423);

        const rEditConcMov = await harness.request('PUT', '/api/bancos/conciliacion/movimiento/121', {
            userId: 4, // tiene edit_monto_conciliacion
            body: { origen_tipo: 'MOV', monto: 55 }
        });
        assert.equal(rEditConcMov.status, 423);

        const rCruces = await harness.request('POST', '/api/bancos/conciliacion/cruces', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1, tipo_cruce: 'N_A_1', direccion: 'CARGO', fecha_aplicado: '2026-11-10',
                libro_items: [{ id: 121, origen_tipo: 'MOV' }, { id: 120, origen_tipo: 'CK' }],
                banco_items: [{ monto: 130 }]
            }
        });
        assert.equal(rCruces.status, 423);

        const rDelCruce = await harness.request('DELETE', '/api/bancos/conciliacion/cruces/675', { userId: 2 });
        assert.equal(rDelCruce.status, 423);

        const rDesconcCruce = await harness.request('POST', '/api/bancos/conciliacion/cruces/675/desconciliar', { userId: 2 });
        assert.equal(rDesconcCruce.status, 423);

        const rPostChk = await harness.request('POST', '/api/cheques', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha: '2026-11-10', cheque: '5991', valor: 10, a_nombre: 'X', concepto: 'Y' }
        });
        assert.equal(rPostChk.status, 423);

        const rPutChk = await harness.request('PUT', '/api/cheques/120', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, fecha: '2026-11-10', cheque: '5120', valor: 80, a_nombre: 'X', concepto: 'EDIT' }
        });
        assert.equal(rPutChk.status, 423);

        const rDelChk = await harness.request('DELETE', '/api/cheques/120', { userId: 2 });
        assert.equal(rDelChk.status, 423);

        const rContado = await harness.request('POST', '/api/cheques/contado/generar', {
            userId: 2,
            body: {
                llave: 'SOL-CONT-001', estacion_solicitud: '02', cuenta_bancaria_id: 1,
                cheque_num: '5992', fecha: '2026-11-10', valor: 350, a_nombre: 'PROV', concepto: 'LOCK'
            }
        });
        assert.equal(rContado.status, 423);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // T5-04 (Vector 4): Cross-Company Isolation
    // ─────────────────────────────────────────────────────────────────────────
    it('T5-04: rechaza mismatch id_empresa + cuenta_bancaria_id en cheques, movimientos, kardex, aplicar y cruces, preservando R2.3 contado cross-empresa', async () => {
        // cuenta_bancaria_id: 1 pertenece a empresa 1 (codigo '01'), empresa '02' tiene id: 2
        const chkMismatch = await harness.request('POST', '/api/cheques', {
            userId: 2,
            body: { id_empresa: '02', cuenta_bancaria_id: 1, fecha: '2026-11-20', cheque: '5701', valor: 50, a_nombre: 'A', concepto: 'B' }
        });
        assert.ok([400, 409].includes(chkMismatch.status));

        const chkPutMismatch = await harness.request('PUT', '/api/cheques/10', {
            userId: 2,
            body: { empresa_id: 2, cuenta_bancaria_id: 1, fecha: '2026-10-20', cheque: '5001', valor: 150, a_nombre: 'PROVEEDOR UNO', concepto: 'EDIT' }
        });
        assert.ok([400, 409].includes(chkPutMismatch.status));

        const chkPutNoCtaMismatch = await harness.request('PUT', '/api/cheques/10', {
            userId: 2,
            body: { id_empresa: '02', fecha: '2026-10-20', cheque: '5001', valor: 150, a_nombre: 'PROVEEDOR UNO', concepto: 'EDIT' }
        });
        assert.equal(chkPutNoCtaMismatch.status, 400);

        const movPutNoCtaMismatch = await harness.request('PUT', '/api/bancos/movimientos/2', {
            userId: 2,
            body: { id_empresa: '02', fecha: '2026-10-15', documento: 'NC-50', concepto: 'COMISION BANCARIA', monto: 25, cod_remesa: 'NC', tipo: 'CARGO' }
        });
        assert.equal(movPutNoCtaMismatch.status, 400);

        const chkPutConflictingEmpresa = await harness.request('PUT', '/api/cheques/10', {
            userId: 2,
            body: { empresa_id: 1, id_empresa: '02', fecha: '2026-10-20', cheque: '5001', valor: 150, a_nombre: 'PROVEEDOR UNO', concepto: 'EDIT' }
        });
        assert.equal(chkPutConflictingEmpresa.status, 400);

        const movPutConflictingEmpresa = await harness.request('PUT', '/api/bancos/movimientos/2', {
            userId: 2,
            body: { empresa_id: 1, id_empresa: '02', fecha: '2026-10-15', documento: 'NC-50', concepto: 'COMISION BANCARIA', monto: 25, cod_remesa: 'NC', tipo: 'CARGO' }
        });
        assert.equal(movPutConflictingEmpresa.status, 400);

        const movMismatch = await harness.request('POST', '/api/bancos/movimientos', {
            userId: 2,
            body: { id_empresa: '02', cuenta_bancaria_id: 1, fecha: '2026-11-20', documento: 'XM-1', concepto: 'CROSS', monto: 50, cod_remesa: 'RM', tipo: 'ABONO' }
        });
        assert.ok([400, 409].includes(movMismatch.status));

        const kardexMismatch = await harness.request(
            'GET',
            '/api/bancos/movimientos/kardex?id_empresa=02&cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31',
            { userId: 3 }
        );
        assert.ok([400, 409].includes(kardexMismatch.status));

        // Cross-account aplicar (403) y cruces (409)
        const aplicarCrossAcc = await harness.request('POST', '/api/bancos/conciliacion/aplicar', {
            userId: 2,
            body: { cuenta_bancaria_id: 2, accion: 'CONCILIAR', fecha_aplicado: '2026-11-20', items: [{ id: 2, origen_tipo: 'MOV' }] }
        });
        assert.equal(aplicarCrossAcc.status, 403);

        const st = harness.mockDb.getState();
        st.movimientos_bancarios.push({
            id: 130, empresa_id: 2, cuenta_bancaria_id: 2, fecha: '2026-10-22', fecha_aplicado: null,
            documento: 'CTA2-1', concepto: 'OTRA CTA', monto: 25, cargo: 25, abono: 0,
            tipo_remesa_id: 6, deleted_at: null, version: 1, fingerprint: 'fp-130'
        });
        const cruceCrossAcc = await harness.request('POST', '/api/bancos/conciliacion/cruces', {
            userId: 2,
            body: {
                cuenta_bancaria_id: 1, tipo_cruce: 'N_A_1', direccion: 'CARGO', fecha_aplicado: '2026-10-25',
                libro_items: [{ id: 2, origen_tipo: 'MOV' }, { id: 130, origen_tipo: 'MOV' }],
                banco_items: [{ monto: 50 }]
            }
        });
        assert.equal(cruceCrossAcc.status, 409);

        // Preservar R2.3 cross-empresa en POST /api/cheques/contado/generar (estacion_solicitud '02' pagado desde cuenta 1 empresa '01')
        const contadoOk = await harness.request('POST', '/api/cheques/contado/generar', {
            userId: 2,
            body: {
                llave: 'SOL-CONT-001', estacion_solicitud: '02', cuenta_bancaria_id: 1,
                cheque_num: '5702', fecha: '2026-11-20', valor: 350,
                a_nombre: 'DISTRIBUIDORA PETROLEO S.A. DE C.V.', concepto: 'R2.3 CROSS'
            }
        });
        assert.equal(contadoOk.status, 200);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // T5-05 (Vector 5): HMAC Tampering, Traversal, Null-Byte & Magic Bytes
    // ─────────────────────────────────────────────────────────────────────────
    it('T5-05: bloquea HMAC expirado/alterado/cruzado, traversal %252e%252e, null-byte %00 en normalizeUploadSubpath, magic bytes falsos y deleteReceiptFile traversal', async () => {
        const { signUploadUrl, normalizeUploadSubpath } = require('../utils/uploadSigner');
        const { deleteReceiptFile, PAGOS_UPLOADS_DIR } = require('../services/recordatoriosPagosService');

        const filePagos = harness.writeTempProtectedFile('pagos', 't5_secret.webp', VALID_WEBP_BUFFER);
        const fileTareas = harness.writeTempProtectedFile('tareas', 't5_other.webp', VALID_WEBP_BUFFER);
        const signedPagos = signUploadUrl(filePagos, 300);

        // 1. Expired exp -> 401
        const pastExp = Math.floor(Date.now() / 1000) - 30;
        const sigOnly = signedPagos.split('sig=')[1];
        const expiredRes = await harness.request('GET', `${filePagos}?exp=${pastExp}&sig=${sigOnly}`, { token: null });
        assert.equal(expiredRes.status, 401);

        // 2. 1-bit flipped sig -> 401
        const lastChar = sigOnly.slice(-1);
        const flippedChar = lastChar === '0' ? '1' : '0';
        const flippedSig = `${sigOnly.slice(0, -1)}${flippedChar}`;
        const tamperedRes = await harness.request('GET', `${signedPagos.split('sig=')[0]}sig=${flippedSig}`, { token: null });
        assert.equal(tamperedRes.status, 401);

        // 3. Cross-dir signed URL -> 401
        const crossDirRes = await harness.request('GET', `${fileTareas}?${signedPagos.split('?')[1]}`, { token: null });
        assert.equal(crossDirRes.status, 401);

        // 4. Double-encoded traversal %252e%252e -> 400
        const travDouble = await harness.rawGet('/api/uploads/pagos/%252e%252e/secret.webp');
        assert.ok([400, 401].includes(travDouble.status));

        // 5. Null-byte %00 / %2500 / \0 -> normalizeUploadSubpath returns null & HTTP returns 400
        assert.equal(normalizeUploadSubpath('/api/uploads/pagos/%00/secret.webp'), null);
        assert.equal(normalizeUploadSubpath('/api/uploads/pagos/%2500/secret.webp'), null);
        assert.equal(normalizeUploadSubpath('/api/uploads/pagos/\0secret.webp'), null);
        const nullByteRes = await harness.rawGet('/api/uploads/pagos/%00/secret.webp');
        assert.equal(nullByteRes.status, 400);

        // 6. Spoofed PNG-as-WebP, SVG, HTML -> 400 en Pagos, Tareas y Movimientos
        const tRes = await harness.request('POST', '/api/tasks', {
            userId: 1,
            body: { titulo: 'T5 Spoof', fecha_vencimiento: '2026-11-30', assigned_to: 1 }
        });
        const taskId = tRes.data.task.id;

        for (const badDataUrl of [SPOOFED_WEBP_WITH_PNG_BYTES, SVG_DATA_URL, HTML_DATA_URL]) {
            const pRes = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
                userId: 2,
                body: { comprobantes: [{ data_url: badDataUrl, nombre_original: 'spoof.webp' }] }
            });
            assert.equal(pRes.status, 400);

            const taRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { data_url: badDataUrl, nombre_original: 'spoof.webp' }
            });
            assert.equal(taRes.status, 400);

            const mvRes = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1, fecha: '2026-11-22', documento: 'SP-1',
                    concepto: 'SPOOF', monto: 10, cod_remesa: 'RM', tipo: 'ABONO',
                    comprobante: { data_url: badDataUrl, nombre_original: 'spoof.webp' }
                }
            });
            assert.equal(mvRes.status, 400);
        }

        // 7. deleteReceiptFile sibling-directory traversal safety
        const siblingDir = fs.mkdtempSync(path.join(path.dirname(PAGOS_UPLOADS_DIR), 'pagos_sibling_'));
        const victimPath = path.join(siblingDir, 'victim.webp');
        fs.writeFileSync(victimPath, VALID_WEBP_BUFFER);
        try {
            deleteReceiptFile(`../${path.basename(siblingDir)}/victim.webp`);
            deleteReceiptFile(`/api/uploads/pagos/../${path.basename(siblingDir)}/victim.webp`);
            assert.equal(fs.existsSync(victimPath), true);
        } finally {
            fs.rmSync(siblingDir, { recursive: true, force: true });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // T5-06 (Vector 6): Formula Injection, PrintEngine XSS & Telegram HTML Escaping
    // ─────────────────────────────────────────────────────────────────────────
    it('T5-06: neutraliza formula injection en SheetJS exports (5 páginas), escapa HTML en PrintEngine y en formatters de Sentinel/MiBot', async () => {
        // 1. exportSanitizer.js + cobertura en las 5 páginas frontend
        const { sanitizeSpreadsheetCell, sanitizeSpreadsheetRows } = await import(
            pathToFileURL(path.join(FRONTEND_ROOT, 'utils/exportSanitizer.js')).href
        );

        assert.equal(sanitizeSpreadsheetCell("=CMD|' /C calc'!A0"), "'=CMD|' /C calc'!A0");
        assert.equal(sanitizeSpreadsheetCell('+1+1'), "'+1+1");
        assert.equal(sanitizeSpreadsheetCell('-2+3'), "'-2+3");
        assert.equal(sanitizeSpreadsheetCell('@SUM(1+1)'), "'@SUM(1+1)");
        assert.equal(sanitizeSpreadsheetCell('\t=1+1'), "'\t=1+1");
        assert.equal(sanitizeSpreadsheetCell('PROVEEDOR NORMAL'), 'PROVEEDOR NORMAL');
        assert.equal(sanitizeSpreadsheetCell(123.45), 123.45);
        assert.equal(sanitizeSpreadsheetCell(null), null);

        const rawRows = [{ concepto: '=1+1', proveedor: '@EXEC', monto: 50 }];
        const sanitized = sanitizeSpreadsheetRows(rawRows);
        assert.equal(sanitized[0].concepto, "'=1+1");
        assert.equal(sanitized[0].proveedor, "'@EXEC");
        assert.equal(sanitized[0].monto, 50);
        assert.equal(rawRows[0].concepto, '=1+1');

        const pagesToVerify = [
            'pages/Consultas.jsx',
            'pages/ReporteMovimientosFecha.jsx',
            'pages/ReporteChequesFecha.jsx',
            'pages/ConciliacionBancaria.jsx',
            'pages/Tareas.jsx',
            'pages/MovimientosBancarios.jsx',
            'pages/ControlRecordatorios.jsx'
        ];
        for (const rel of pagesToVerify) {
            const src = fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
            assert.match(src, /exportSanitizer/, `${rel} debe importar exportSanitizer`);
            assert.match(src, /sanitizeSpreadsheet(?:Rows|Cell)\(/, `${rel} debe sanitizar filas/celdas antes de XLSX.utils.json_to_sheet`);
        }

        // 2. PrintEngine.js HTML escaping & CSS sanitization
        const capturedHtml = [];
        const prevWindow = global.window;
        const prevAlert = global.alert;
        const hook = registerHooks({
            resolve(specifier, context, nextResolve) {
                if (specifier === './DesignerService' && context.parentURL && context.parentURL.includes('/PrintEngine.js')) {
                    return {
                        shortCircuit: true,
                        url: 'data:text/javascript,' + encodeURIComponent(
                            'export default { async getCalibrations() { return []; } };'
                        )
                    };
                }
                return nextResolve(specifier, context);
            }
        });
        try {
            global.alert = () => {};
            global.window = {
                open() {
                    return {
                        document: {
                            open() {},
                            write(html) { capturedHtml.push(String(html)); },
                            close() {}
                        }
                    };
                }
            };
            const printEngineMod = await import(
                `${pathToFileURL(path.join(FRONTEND_ROOT, 'modules/check-designer/services/PrintEngine.js')).href}?t=${Date.now()}`
            );
            const PrintEngine = printEngineMod.default;
            await PrintEngine.printCheck(
                { name: 'Test', width: 215.9, height: 279.4 },
                [{ tipo: 'beneficiario', x: 10, y: 10, ancho: 100, alto: 20, visible: true, fontFamily: 'Arial; position: fixed' }],
                { beneficiario: '<script>alert(1)</script><img src=x onerror=alert(1)> & "XSS"' },
                'Default'
            );
            assert.equal(capturedHtml.length, 1);
            assert.doesNotMatch(capturedHtml[0], /<script>alert\(1\)<\/script>/i);
            assert.match(capturedHtml[0], /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
            assert.doesNotMatch(capturedHtml[0], /position:\s*fixed/i);
        } finally {
            hook.deregister();
            global.window = prevWindow;
            global.alert = prevAlert;
        }

        // 3. Telegram HTML escaping en Sentinel y MiBot
        const { formatBankSentinelMessage } = require('../services/telegramSentinelService');
        const { formatMibotPersonalMessage, formatMibotAttachmentCaption } = require('../services/mibotNotifierService');

        const xssPayload = '<script>alert(1)</script> <a href="https://evil.test">click</a> & "test"';
        const sentinelHtml = formatBankSentinelMessage({
            fecha: '2026-11-27',
            severity: 'critico',
            alertItems: [{ category: 'SOBREGIROS', severity: 'critico', summary: xssPayload }]
        });
        assert.doesNotMatch(sentinelHtml, /<script>|<a href=/i);
        assert.match(sentinelHtml, /&lt;script&gt;/);
        assert.match(sentinelHtml, /&amp; &quot;test&quot;/);

        const mibotHtml = formatMibotPersonalMessage({
            programacion: { tipo: 'TAREA', titulo: xssPayload, mensaje: xssPayload, task_id: 99, ubicacion: xssPayload },
            destinatario: { nombre_destinatario: xssPayload, cargo: xssPayload }
        });
        assert.doesNotMatch(mibotHtml, /<script>|<a href=/i);
        assert.match(mibotHtml, /&lt;script&gt;/);

        const captionHtml = formatMibotAttachmentCaption(
            { task_id: 99 },
            { nombre_original: xssPayload, nota: xssPayload }
        );
        assert.doesNotMatch(captionHtml, /<script>|<a href=/i);
        assert.match(captionHtml, /&lt;script&gt;/);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // T5-07 (Vector 7): ReDoS AST Validator & Execution Budget
    // ─────────────────────────────────────────────────────────────────────────
    it('T5-07: rechaza patrones ReDoS exponenciales y polinomiales adyacentes en AST y los omite en <50ms sobre 2000 chars', async () => {
        const {
            validateClassificationRulePattern,
            applyClassificationRules
        } = require('../services/bankStatementParserService');

        const redosPatterns = [
            '(a+)+b',
            '(a+){2,}b',
            '([a-z]+)*$',
            '(?=(a+))\\1b',
            '[^x]*[^x]*y',
            '[a-z]*[a-z]*y',
            '\\d*\\d*x',
            '.*.*x',
            '[^x]*a[^x]*y',
            '.*a.*y',
            '([^x]*)(?:a|b)([^x]*)y',
            '[^x]*ab[^x]*y',
            '.*ab.*y',
            '.*aa.*y',
            '.*(ab).*y',
            '\\w*ab\\w*y',
            '.*a{1}b{1}.*y',
            '.*(a)(b).*y',
            '.*(?:a)(?:b).*y',
            '[^x]*a{2}[^x]*y',
            '(?:.*ab.*|z)y',
            '(.*ab.*|z)y',
            '(?:[^x]*ab[^x]*|z)y',
            '(?:.*ab.*|)y',
            '(?:.*ab.*|z)(?=y)',
            '.*ab.*(y|^)',
            '.*ab.*(?:y|^)',
            '.*(?=.*ab.*)',
            '.*(?=.*z)',
            '[a-z]*(?=[a-z]*z)',
            '\\w*(?=\\w*z)',
            '.*(?:(?=.*ab.*)|z)',
            '.*(?=.*ab.*)y',
            '.*(?:(?=.*ab.*)|z)y'
        ];

        for (const p of redosPatterns) {
            const check = validateClassificationRulePattern(p, 'REGEX');
            assert.equal(check.valid, false, `AST validator debe rechazar: ${p}`);

            const httpRes = await harness.request('POST', '/api/bancos/conciliacion/reglas', {
                userId: 2,
                body: { nombre: 'Bad ReDoS', patron: p, tipo_match: 'REGEX' }
            });
            assert.equal(httpRes.status, 400, `POST /reglas debe rechazar con 400: ${p}`);
        }

        // Reglas legadas maliciosas en BD deben omitirse en <50ms sobre entrada de 2000 chars
        const legacyRules = redosPatterns.map((p, idx) => ({
            id: 700 + idx,
            cuenta_bancaria_id: 1,
            nombre: `ReDoS ${idx}`,
            patron: p,
            tipo_match: 'REGEX',
            tipo_movimiento: 'CARGO',
            signo: 'CARGO',
            cod_cta: '510000',
            prioridad: 1,
            activo: 1
        }));
        const stressTxs = [
            { fila_origen: 1, descripcion: `${'a'.repeat(2000)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
            { fila_origen: 2, descripcion: `${'1'.repeat(2000)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
            { fila_origen: 3, descripcion: `${'ab'.repeat(1000)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 }
        ];
        const t0 = process.hrtime.bigint();
        const applied = applyClassificationRules(stressTxs, legacyRules, [], { cuentaId: 1 });
        const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
        assert.equal(applied.reglas_aplicadas_count, 0);
        assert.ok(elapsedMs < 50, `Budget excedido: ${elapsedMs.toFixed(2)}ms`);

        // Patrones seguros reales siguen siendo aceptados
        assert.equal(validateClassificationRulePattern('COMISION.*POS', 'REGEX').valid, true);
        assert.equal(validateClassificationRulePattern('COMISION.*POS.*USD', 'REGEX').valid, true);
        assert.equal(validateClassificationRulePattern('(?:ACH|BCR).*TRANSFER', 'REGEX').valid, true);
        assert.equal(validateClassificationRulePattern('(?:COMISION|CARGO).*POS.*USD', 'REGEX').valid, true);
        assert.equal(validateClassificationRulePattern('.*ab.*', 'REGEX').valid, true);
        assert.equal(validateClassificationRulePattern('^[A-Z]+\\s+\\d{2,4}$', 'REGEX').valid, true);
        assert.equal(validateClassificationRulePattern('^(?=.*TRANSFER)(?=.*USD).*', 'REGEX').valid, true);
        assert.equal(validateClassificationRulePattern('^(?=.*COMISION)(?!.*REVERSO).*', 'REGEX').valid, true);
        assert.equal(validateClassificationRulePattern('(?=.*ACH).*TRANSFER', 'REGEX').valid, true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // T5-08 (Vector 8): Partial Rollback, Orphan Cleanup, POS Normalization & vincular-control-pago
    // ─────────────────────────────────────────────────────────────────────────
    it('T5-08: preserva archivo si falla DELETE BD en comprobantes, limpia huérfanos en TX fallida, normaliza POS->TARJETA_CREDITO y blinda vincular-control-pago', async () => {
        const {
            normalizeMetodoPago,
            matchExtractedReceiptToCatalog
        } = require('../services/recordatoriosPagosService');

        // 1. DELETE /api/operaciones/recordatorios/comprobantes/:compId con fallo simulado en DB DELETE -> 500 y archivo intacto en disco
        const fileUrl = harness.writeTempProtectedFile('pagos', 'keep_on_db_fail.webp', VALID_WEBP_BUFFER);
        const diskFile = path.join(UPLOADS_DIR, 'pagos', path.basename(fileUrl));
        const st = harness.mockDb.getState();
        st.recordatorios_pagos_comprobantes.push({
            id: 1699, vencimiento_id: 500, abono_id: null, nombre_original: 'keep.webp',
            archivo_url: fileUrl, mime_type: 'image/webp', tamano_bytes: VALID_WEBP_BUFFER.length,
            nota: 'Debe sobrevivir fallo BD', uploaded_by: 'op'
        });

        const origQuery = harness.mockDb.pool.query;
        const origGetConn = harness.mockDb.pool.getConnection;
        harness.mockDb.pool.query = async (sql, params) => {
            if (/delete from recordatorios_pagos_comprobantes/i.test(String(sql || ''))) {
                throw new Error('SIMULATED_DB_FAILURE_ON_DELETE');
            }
            return origQuery(sql, params);
        };
        harness.mockDb.pool.getConnection = async () => {
            const conn = await origGetConn();
            const connQuery = conn.query;
            conn.query = async (sql, params) => {
                if (/delete from recordatorios_pagos_comprobantes/i.test(String(sql || ''))) {
                    throw new Error('SIMULATED_DB_FAILURE_ON_DELETE');
                }
                return connQuery(sql, params);
            };
            return conn;
        };
        try {
            const failDel = await harness.request('DELETE', '/api/operaciones/recordatorios/comprobantes/1699', { userId: 2 });
            assert.equal(failDel.status, 500);
            assert.equal(fs.existsSync(diskFile), true, 'El archivo físico NO debe eliminarse si falla el DELETE en BD');
            assert.ok(st.recordatorios_pagos_comprobantes.some((c) => Number(c.id) === 1699));
        } finally {
            harness.mockDb.pool.query = origQuery;
            harness.mockDb.pool.getConnection = origGetConn;
        }

        // 2. Rollback TX en POST /api/tasks/:id/attachments y POST /api/bancos/movimientos deja 0 archivos huérfanos en disco
        const tRes = await harness.request('POST', '/api/tasks', {
            userId: 1,
            body: { titulo: 'TX Orphan Check', fecha_vencimiento: '2026-11-30', assigned_to: 1 }
        });
        const taskId = tRes.data.task.id;
        const writtenPaths = [];
        const origWriteFileSync = fs.writeFileSync;
        const uploadsRootPrefix = path.resolve(UPLOADS_DIR) + path.sep;
        fs.writeFileSync = (filePath, ...rest) => {
            const resolved = path.resolve(String(filePath));
            if (resolved.startsWith(uploadsRootPrefix)) {
                writtenPaths.push(resolved);
            }
            return origWriteFileSync.call(fs, filePath, ...rest);
        };

        harness.mockDb.pool.getConnection = async () => {
            const conn = await origGetConn();
            const connQuery = conn.query;
            conn.query = async (sql, params) => {
                if (/^insert into task_attachments/i.test(String(sql || '').trim()) ||
                    /^insert into movimientos_bancarios_comprobantes/i.test(String(sql || '').trim())) {
                    throw new Error('SIMULATED_ATTACHMENT_TX_FAILURE');
                }
                return connQuery(sql, params);
            };
            return conn;
        };
        try {
            const failTaskAtt = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'orphan_task.webp' }
            });
            assert.equal(failTaskAtt.status, 500);

            const failMovAtt = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1, fecha: '2026-11-22', documento: 'ORPH-1',
                    concepto: 'ORPHAN CHECK', monto: 50, cod_remesa: 'RM', tipo: 'ABONO',
                    comprobante: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'orphan_mov.webp' }
                }
            });
            assert.equal(failMovAtt.status, 500);
        } finally {
            fs.writeFileSync = origWriteFileSync;
            harness.mockDb.pool.getConnection = origGetConn;
        }

        assert.equal(writtenPaths.length, 2, 'Deben capturarse exactamente 2 archivos escritos antes del fallo TX');
        assert.ok(writtenPaths.some((p) => p.startsWith(path.resolve(UPLOADS_DIR, 'tareas') + path.sep)));
        assert.ok(writtenPaths.some((p) => p.startsWith(path.resolve(UPLOADS_DIR, 'movimientos') + path.sep)));
        for (const p of writtenPaths) {
            assert.equal(fs.existsSync(p), false, `Archivo huérfano no eliminado tras rollback TX: ${p}`);
        }

        // 3. Normalización POS -> TARJETA_CREDITO consistente con matchExtractedReceiptToCatalog
        for (const label of ['POS', 'TERMINAL POS', 'VOUCHER POS', 'PAGO EN POS']) {
            assert.equal(normalizeMetodoPago(label), 'TARJETA_CREDITO');
            const ocrMatch = matchExtractedReceiptToCatalog({ tipo_documento: label, metodo_pago: label, monto_usd: 20 }, []);
            assert.equal(ocrMatch.metodo_pago, 'TARJETA_CREDITO');
        }
        assert.equal(normalizeMetodoPago('DEPOSITO'), 'DEPOSITO');

        // 4. POST /conciliacion/vincular-control-pago (VINCULAR) rechaza monto desigual y doble vinculación
        st.movimientos_bancarios.push({
            id: 150, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-11-20', fecha_aplicado: null,
            documento: 'MOV-100', concepto: 'PAGO EXACTO', monto: 100, cargo: 100, abono: 0,
            tipo_remesa_id: 2, deleted_at: null, version: 1, fingerprint: 'fp-150'
        });
        st.recordatorios_pagos_abonos.push(
            {
                id: 1551, vencimiento_id: 500, recordatorio_id: 100, ubicacion: 'ANDELSA',
                descripcion_ref: 'PARCIAL 50', tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1, monto: 50, fecha_pago: '2026-11-20', estado_conciliacion: 'PENDIENTE',
                movimiento_bancario_id: null
            },
            {
                id: 1552, vencimiento_id: 500, recordatorio_id: 100, ubicacion: 'ANDELSA',
                descripcion_ref: 'EXACTO 100 A', tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1, monto: 100, fecha_pago: '2026-11-20', estado_conciliacion: 'PENDIENTE',
                movimiento_bancario_id: null
            },
            {
                id: 1553, vencimiento_id: 500, recordatorio_id: 100, ubicacion: 'ANDELSA',
                descripcion_ref: 'DUPLICADO 100 B', tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1, monto: 100, fecha_pago: '2026-11-20', estado_conciliacion: 'PENDIENTE',
                movimiento_bancario_id: null
            }
        );

        const mismatchLink = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
            userId: 2,
            body: { abono_id: 1551, accion: 'VINCULAR', movimiento_bancario_id: 150, origen_tipo: 'MOV', fecha_aplicado: '2026-11-20' }
        });
        assert.ok([400, 409].includes(mismatchLink.status));

        const okLink = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
            userId: 2,
            body: { abono_id: 1552, accion: 'VINCULAR', movimiento_bancario_id: 150, origen_tipo: 'MOV', fecha_aplicado: '2026-11-20' }
        });
        assert.equal(okLink.status, 200);

        const dupLink = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
            userId: 2,
            body: { abono_id: 1553, accion: 'VINCULAR', movimiento_bancario_id: 150, origen_tipo: 'MOV', fecha_aplicado: '2026-11-20' }
        });
        assert.equal(dupLink.status, 409);

        // 5. POST /conciliacion/vincular-control-pago (VINCULAR) también bloquea doble vinculación sobre origen_tipo='CK'
        st.cheques.push({
            id: 251, empresa_id: 1, cuenta_bancaria_id: 1, llave: 'CHQ-251', fecha: '2026-11-20',
            cheque_anulado: 0, cheque: '5251', valor: 100, a_nombre: 'PROV CK', fecha_aplicado: null,
            concepto: 'PAGO CK', es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, es_contabilizado: 0,
            deleted_at: null, version: 1
        });
        st.recordatorios_pagos_abonos.push(
            {
                id: 1554, vencimiento_id: 500, recordatorio_id: 100, ubicacion: 'ANDELSA',
                descripcion_ref: 'CK EXACTO 100 A', tipo_operacion: 'CXP', metodo_pago: 'CHEQUE',
                cuenta_bancaria_id: 1, monto: 100, fecha_pago: '2026-11-20', estado_conciliacion: 'PENDIENTE',
                movimiento_bancario_id: null, cheque_id: null
            },
            {
                id: 1555, vencimiento_id: 500, recordatorio_id: 100, ubicacion: 'ANDELSA',
                descripcion_ref: 'CK DUPLICADO 100 B', tipo_operacion: 'CXP', metodo_pago: 'CHEQUE',
                cuenta_bancaria_id: 1, monto: 100, fecha_pago: '2026-11-20', estado_conciliacion: 'PENDIENTE',
                movimiento_bancario_id: null, cheque_id: null
            }
        );

        const ckLink1 = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
            userId: 2,
            body: { abono_id: 1554, accion: 'VINCULAR', movimiento_bancario_id: 251, origen_tipo: 'CK', fecha_aplicado: '2026-11-20' }
        });
        assert.equal(ckLink1.status, 200);

        const ckLink2 = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
            userId: 2,
            body: { abono_id: 1555, accion: 'VINCULAR', movimiento_bancario_id: 251, origen_tipo: 'CK', fecha_aplicado: '2026-11-20' }
        });
        assert.equal(ckLink2.status, 409);

        // 6. Desconciliar CK 251 limpia cheque_id = null & PENDIENTE; CREAR_Y_CONCILIAR limpia cheque_id = null;
        //    re-vincular CK 251 a abono 1555 -> 200; desconciliar CK 251 luego no corrompe abono 1554 (MOV)
        const ckDesconc1 = await harness.request('POST', '/api/bancos/conciliacion/aplicar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, accion: 'DESCONCILIAR', items: [{ id: 251, origen_tipo: 'CK' }] }
        });
        assert.equal(ckDesconc1.status, 200);
        const ab1554AfterDesconc = st.recordatorios_pagos_abonos.find((a) => Number(a.id) === 1554);
        assert.equal(ab1554AfterDesconc.estado_conciliacion, 'PENDIENTE');
        assert.equal(ab1554AfterDesconc.cheque_id, null);
        assert.equal(ab1554AfterDesconc.movimiento_bancario_id, null);

        const crearYConc = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
            userId: 2,
            body: { abono_id: 1554, accion: 'CREAR_Y_CONCILIAR', fecha_aplicado: '2026-11-20' }
        });
        assert.equal(crearYConc.status, 200);
        const createdMovId = Number(crearYConc.data.movimiento_bancario_id);
        assert.ok(createdMovId > 0);
        const ab1554AfterCrear = st.recordatorios_pagos_abonos.find((a) => Number(a.id) === 1554);
        assert.equal(ab1554AfterCrear.estado_conciliacion, 'CONCILIADO');
        assert.equal(Number(ab1554AfterCrear.movimiento_bancario_id), createdMovId);
        assert.equal(ab1554AfterCrear.cheque_id, null);

        const ckReLink = await harness.request('POST', '/api/bancos/conciliacion/vincular-control-pago', {
            userId: 2,
            body: { abono_id: 1555, accion: 'VINCULAR', movimiento_bancario_id: 251, origen_tipo: 'CK', fecha_aplicado: '2026-11-20' }
        });
        assert.equal(ckReLink.status, 200);
        const ab1555AfterReLink = st.recordatorios_pagos_abonos.find((a) => Number(a.id) === 1555);
        assert.equal(ab1555AfterReLink.estado_conciliacion, 'CONCILIADO');
        assert.equal(Number(ab1555AfterReLink.cheque_id), 251);

        const ckDesconc2 = await harness.request('POST', '/api/bancos/conciliacion/aplicar', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, accion: 'DESCONCILIAR', items: [{ id: 251, origen_tipo: 'CK' }] }
        });
        assert.equal(ckDesconc2.status, 200);
        const ab1555AfterDesconc = st.recordatorios_pagos_abonos.find((a) => Number(a.id) === 1555);
        assert.equal(ab1555AfterDesconc.estado_conciliacion, 'PENDIENTE');
        assert.equal(ab1555AfterDesconc.cheque_id, null);

        // El abono 1554 conciliado por MOV no debe verse afectado al desconciliar CK 251
        const ab1554Final = st.recordatorios_pagos_abonos.find((a) => Number(a.id) === 1554);
        assert.equal(ab1554Final.estado_conciliacion, 'CONCILIADO');
        assert.equal(Number(ab1554Final.movimiento_bancario_id), createdMovId);
        assert.equal(ab1554Final.cheque_id, null);
    });
});
