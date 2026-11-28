'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { registerHooks } = require('node:module');
const { pathToFileURL } = require('node:url');
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createE2eHarness } = require('./helpers/e2eHarness.helper');
const {
    VALID_WEBP_BUFFER,
    VALID_WEBP_DATA_URL,
    VALID_PNG_DATA_URL,
    VALID_PDF_BUFFER,
    VALID_PDF_DATA_URL,
    withMockBrowserDomForCompressor
} = require('./helpers/fixtures.helper');

const FRONTEND_ROOT = path.resolve(__dirname, '../../frontend/src');

describe('Tier 1 — Opaque-Box Feature Coverage (R2–R7, F2–F29)', () => {
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
    // AREA 1: R2 Bancos Fase A (F2–F6)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Area 1 — R2 Bancos Fase A (F2–F6)', () => {
        it('F2 (R2.1): Check Designer formats & printer calibration CRUD persist Letter dimensions and offset_x/offset_y', async () => {
            const listRes = await harness.request('GET', '/api/check-designer/formats', { userId: 5 });
            assert.equal(listRes.status, 200);
            assert.ok(Array.isArray(listRes.data) && listRes.data.length >= 1);

            const createFmt = await harness.request('POST', '/api/check-designer/formats', {
                userId: 1,
                body: {
                    name: 'Davivienda Carta E2E',
                    banco_id: 2,
                    description: 'Formato Carta Oficial',
                    width: 215.9,
                    height: 279.4,
                    orientation: 'portrait',
                    printer_name: 'Epson L3150',
                    design_json: { fields: [{ id: 'f1', tipo: 'beneficiario', x: 20, y: 30 }] }
                }
            });
            assert.equal(createFmt.status, 201);
            assert.ok(createFmt.data.id > 0);

            const calRes = await harness.request('POST', '/api/check-designer/calibrations', {
                userId: 1,
                body: { printer_name: 'Epson L3150', offset_x: 3.5, offset_y: -2.0, scale: 1.0 }
            });
            assert.equal(calRes.status, 201);

            const cals = await harness.request('GET', '/api/check-designer/calibrations', { userId: 5 });
            assert.equal(cals.status, 200);
            const savedCal = cals.data.find((c) => c.printer_name === 'Epson L3150');
            assert.ok(savedCal);
            assert.equal(Number(savedCal.offset_x), 3.5);
            assert.equal(Number(savedCal.offset_y), -2.0);
            assert.equal(Number(savedCal.scale), 1.0);
        });

        it('F2 (R2.1): PrintEngine ejecuta printCheck/printBatch aplicando offset_x/offset_y en mm con scale===1 y Cheques.jsx usa CheckPdfService + ReportPreviewModal', async () => {
            const capturedHtml = [];
            const prevWindow = global.window;
            const prevAlert = global.alert;
            const hook = registerHooks({
                resolve(specifier, context, nextResolve) {
                    if (specifier === './DesignerService' && context.parentURL && context.parentURL.includes('/PrintEngine.js')) {
                        return {
                            shortCircuit: true,
                            url: 'data:text/javascript,' + encodeURIComponent(
                                'export default { async getCalibrations() { return globalThis.__E2E_PRINT_CALIBRATIONS__ || []; } };'
                            )
                        };
                    }
                    return nextResolve(specifier, context);
                }
            });

            try {
                globalThis.__E2E_PRINT_CALIBRATIONS__ = [
                    { printer_name: 'Epson L3150', offset_x: 3.5, offset_y: -2.0, scale: 1.0 }
                ];
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
                const formato = { name: 'Promerica Carta', width: 215.9, height: 279.4 };
                const campos = [
                    { tipo: 'beneficiario', x: 30, y: 40, ancho: 120, alto: 20, visible: true }
                ];
                const datos = { numero_cheque: '5001', beneficiario: 'PROVEEDOR E2E' };

                await PrintEngine.printCheck(formato, campos, datos, 'Epson L3150');
                await PrintEngine.printBatch(formato, campos, [datos, { ...datos, numero_cheque: '5002' }], 'Epson L3150');

                assert.equal(capturedHtml.length, 2, 'printCheck y printBatch deben generar sus documentos HTML');
                for (const [idx, html] of capturedHtml.entries()) {
                    const contentRule = html.match(/\.content\s*\{[\s\S]*?\}/);
                    assert.ok(contentRule, `Documento #${idx + 1} debe definir la regla CSS .content`);
                    assert.match(
                        contentRule[0],
                        /translate\(\s*3\.5\s*mm\s*,\s*-2(?:\.0+)?\s*mm\s*\)/i,
                        `PrintEngine documento #${idx + 1} debe aplicar translate(3.5mm, -2mm) cuando scale === 1`
                    );
                }
            } finally {
                hook.deregister();
                delete globalThis.__E2E_PRINT_CALIBRATIONS__;
                global.window = prevWindow;
                global.alert = prevAlert;
            }

            const chequesSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'pages/Cheques.jsx'), 'utf8');
            assert.match(chequesSrc, /CheckPdfService/, 'Cheques.jsx debe usar CheckPdfService');
            assert.match(chequesSrc, /ReportPreviewModal/, 'Cheques.jsx debe usar ReportPreviewModal');
        });

        it('F3 (R2.2): Gestión completa de cheques — reservado, contado, anulación preservando originales y re-edición de anulado', async () => {
            const createRes = await harness.request('POST', '/api/cheques', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-11-10',
                    cheque: '5010',
                    valor: 275.50,
                    a_nombre: 'PROVEEDOR ALFA',
                    concepto: 'COMPRA INSUMOS',
                    es_reservado: false,
                    es_pago_contado: true
                }
            });
            assert.equal(createRes.status, 201);
            const chkId = createRes.data.id;

            const reservedRes = await harness.request('POST', '/api/cheques', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-11-11',
                    cheque: '5011',
                    valor: 0,
                    a_nombre: 'RESERVADO',
                    concepto: 'ESPACIO RESERVADO',
                    es_reservado: true
                }
            });
            assert.equal(reservedRes.status, 201);

            const voidRes = await harness.request('PUT', `/api/cheques/${chkId}`, {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-11-10',
                    cheque: '5010',
                    valor: 0,
                    a_nombre: 'ANULADO',
                    concepto: 'ANULADO POR ERROR',
                    cheque_anulado: true
                }
            });
            assert.equal(voidRes.status, 200);

            // Editar un cheque ya anulado debe preservar los campos *_original iniciales
            const reEditVoid = await harness.request('PUT', `/api/cheques/${chkId}`, {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-11-10',
                    cheque: '5010',
                    valor: 0,
                    a_nombre: 'ANULADO',
                    concepto: 'ANULADO - NOTA ACTUALIZADA',
                    cheque_anulado: true
                }
            });
            assert.equal(reEditVoid.status, 200);

            const listRes = await harness.request('GET', '/api/cheques?cuenta_bancaria_id=1', { userId: 2 });
            assert.equal(listRes.status, 200);
            const voided = listRes.data.find((c) => Number(c.id) === Number(chkId));
            assert.ok(voided);
            assert.equal(Number(voided.valor_original), 275.50);
            assert.equal(voided.beneficiario_original, 'PROVEEDOR ALFA');
            assert.equal(voided.concepto_original, 'COMPRA INSUMOS');
        });

        it('F4 (R2.3): Cheques de Contado permite pago cross-empresa (estacion_solicitud != cuenta empresa) y guarda nombre de proveedor', async () => {
            // Solicitud SOL-CONT-001 pertenece a empresa/estación '02', se paga con cuenta 1 (empresa '01')
            const genRes = await harness.request('POST', '/api/cheques/contado/generar', {
                userId: 2,
                body: {
                    llave: 'SOL-CONT-001',
                    estacion_solicitud: '02',
                    cuenta_bancaria_id: 1,
                    cheque_num: '5020',
                    fecha: '2026-11-15',
                    valor: 350.00,
                    a_nombre: 'DISTRIBUIDORA PETROLEO S.A. DE C.V.',
                    concepto: 'COMPRA LUBRICANTES CONTADO'
                }
            });
            assert.equal(genRes.status, 200);
            assert.ok(genRes.data.llaveCheque);

            const chkInDb = harness.mockDb.getState().cheques.find((c) => c.cheque === '5020');
            assert.ok(chkInDb);
            assert.equal(Number(chkInDb.empresa_id), 1); // Empresa de la cuenta pagadora
            assert.equal(Number(chkInDb.es_pago_contado), 1);

            const solUpdated = harness.mockDb.getState().solicitud_chq_contado.find((s) => s.llave === 'SOL-CONT-001');
            assert.equal(solUpdated.num_cheque, '5020');

            // Marcar emitido SOL-CONT-002 registrando en bancos usando nombre real del proveedor (no cod_proveedor)
            const emitRes = await harness.request('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                body: {
                    llave: 'SOL-CONT-002',
                    estacion_solicitud: '02',
                    id_empresa: '02',
                    cheque_num: '5021',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true
                }
            });
            assert.equal(emitRes.status, 200);
            const emittedChk = harness.mockDb.getState().cheques.find((c) => c.cheque === '5021');
            assert.ok(emittedChk);
            assert.equal(emittedChk.a_nombre, 'DISTRIBUIDORA PETROLEO S.A. DE C.V.');
            assert.notEqual(emittedChk.a_nombre, 'PROV01');
        });

        it('F5 (R2.4): Cuentas Bancarias, registro de bancos, useConfirm() y cuentaUtils sortCuentas estricto', async () => {
            const createBank = await harness.request('POST', '/api/bancos/entidades-banco', {
                userId: 1,
                body: { descripcion: 'BANCO AGRICOLA', codigo: '03', todas_empresas: true }
            });
            assert.equal(createBank.status, 201);

            const createCta = await harness.request('POST', '/api/bancos/cuentas', {
                userId: 1,
                body: {
                    id_empresa: '01',
                    numero: '111222333',
                    nombre: 'CUENTA RESERVA',
                    cod_banco: '03',
                    cod_tipo: '01',
                    saldo_inicial: 2500.75,
                    fecha_saldo_inicial: '2026-11-01'
                }
            });
            assert.equal(createCta.status, 201);

            const listCtas = await harness.request('GET', '/api/bancos/cuentas', { userId: 2 });
            assert.equal(listCtas.status, 200);
            const nueva = listCtas.data.find((c) => c.numero === '111222333');
            assert.ok(nueva);
            assert.equal(Number(nueva.saldo_inicial), 2500.75);

            const cuentaUtils = await import(pathToFileURL(path.join(FRONTEND_ROOT, 'utils/cuentaUtils.js')).href);
            // Pasar lista en orden inverso para verificar orden estricto: banco ASC, luego numero ASC
            const sorted = cuentaUtils.sortCuentas(listCtas.data.slice().reverse());
            assert.equal(sorted.length, 3);
            assert.equal(sorted[0].numero, '111222333'); // BANCO AGRICOLA
            assert.equal(sorted[1].numero, '2000012345'); // BANCO PROMERICA
            assert.equal(sorted[2].numero, '3000098765'); // BANCO PROMERICA
            const label = cuentaUtils.formatCuentaLabel(nueva);
            assert.match(label, /\[BANCO AGRICOLA\] CUENTA RESERVA - \(111222333\)/);

            const cuentasSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'pages/CuentasBancarias.jsx'), 'utf8');
            assert.match(cuentasSrc, /useConfirm/, 'CuentasBancarias.jsx debe usar useConfirm() en lugar de modal ad-hoc');
            assert.doesNotMatch(cuentasSrc, /showConfirmModal/, 'CuentasBancarias.jsx debe retirar showConfirmModal');
        });

        it('F5 (R2.4): Edición de bancos y PUT/DELETE completos en tipos_cuenta y tipos_remesas', async () => {
            const createBank = await harness.request('POST', '/api/bancos/entidades-banco', {
                userId: 1,
                body: { descripcion: 'BANCO AGRICOLA', codigo: '03', todas_empresas: true }
            });
            assert.equal(createBank.status, 201);

            const editBank = await harness.request('PUT', '/api/bancos/entidades-banco/03', {
                userId: 1,
                body: { descripcion: 'BANCO AGRICOLA EL SALVADOR' }
            });
            assert.equal(editBank.status, 200);

            const createTipoCta = await harness.request('POST', '/api/bancos/tipos-cuenta', {
                userId: 1,
                body: { id_empresa: '01', codigo: '03', descripcion: 'MONETARIA' }
            });
            assert.equal(createTipoCta.status, 201);
            const tipoCtaCod = createTipoCta.data.codigo;
            assert.ok(tipoCtaCod);

            const updTipoCta = await harness.request('PUT', `/api/bancos/tipos-cuenta/${tipoCtaCod}`, {
                userId: 1,
                body: { descripcion: 'MONETARIA EMPRESARIAL' }
            });
            assert.equal(updTipoCta.status, 200);

            const delTipoCta = await harness.request('DELETE', `/api/bancos/tipos-cuenta/${tipoCtaCod}`, { userId: 1 });
            assert.equal(delTipoCta.status, 200);

            const createTipoRem = await harness.request('POST', '/api/bancos/tipos-remesas', {
                userId: 1,
                body: { id_empresa: '01', codigo: 'DP', descripcion: 'DEPOSITO EXPRESS' }
            });
            assert.equal(createTipoRem.status, 201);
            const tipoRemCod = createTipoRem.data.codigo;
            assert.ok(tipoRemCod);

            const updTipoRem = await harness.request('PUT', `/api/bancos/tipos-remesas/${tipoRemCod}`, {
                userId: 1,
                body: { codigo: 'DP', descripcion: 'DEPOSITO EXPRESS ACTUALIZADO' }
            });
            assert.equal(updTipoRem.status, 200);

            const delTipoRem = await harness.request('DELETE', `/api/bancos/tipos-remesas/${tipoRemCod}`, { userId: 1 });
            assert.equal(delTipoRem.status, 200);
        });

        it('F6 (R2.5): telegramDataService y cashflowForecast reutilizan computeAccountReconciliationSummary diferenciando banco vs chequera', async () => {
            const { getSaldosBancosData, getSaldosChequeraData } = require('../services/telegramDataService');
            const { getFlujoCajaProyectado } = require('../services/cashflowForecast');

            // Seed cuenta 1: saldo_inicial=1000, abonos=700 (conciliados), cargo=25 (en transito), cheque=150 (en transito)
            // Cuenta 2: saldo_inicial=500, sin movimientos ni cheques
            // Total chequera = 1525 + 500 = 2025; Total conciliado libros = 1700 + 500 = 2200
            const bancosData = await getSaldosBancosData();
            const chequeraData = await getSaldosChequeraData();
            const cashflow = await getFlujoCajaProyectado(30);

            assert.equal(bancosData.fuente, 'local_conciliacion');
            assert.equal(bancosData.total, 2200);
            assert.equal(chequeraData.total, 2025);
            assert.notEqual(bancosData.total, chequeraData.total);

            const cta1Banco = bancosData.cuentas.find((c) => String(c.num_cta || c.numero) === '2000012345');
            assert.ok(cta1Banco);
            assert.equal(cta1Banco.saldo_conciliado_libros, 1700);
            assert.equal(cta1Banco.saldo_chequera, 1525);

            assert.equal(cashflow.kpi.fuente_saldos, 'local_conciliacion');
            assert.equal(cashflow.kpi.saldo_conciliado_libros, 2200);
            assert.equal(cashflow.kpi.saldo_chequera, 2025);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // AREA 2: R3 Tesorería & Kardex (F7–F9)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Area 2 — R3 Reportes Tesorería, Kardex y Aging (F7–F9)', () => {
        it('F7 (R3.1): Reportes nativos Saldos en Bancos y Saldos en Chequera retornan 7 columnas + totales + filtros', async () => {
            const resBancos = await harness.request(
                'GET',
                '/api/consultas/saldos-bancos?fecha_corte=2026-10-31&empresa=01',
                { userId: 3 }
            );
            assert.equal(resBancos.status, 200);
            const rows = Array.isArray(resBancos.data) ? resBancos.data : (resBancos.data.cuentas || resBancos.data.rows || []);
            assert.ok(rows.length >= 1);
            const cta1 = rows.find((r) => String(r.numero || r.cuenta_numero) === '2000012345');
            assert.ok(cta1);
            assert.equal(Number(cta1.saldo_inicial), 1000);
            assert.equal(Number(cta1.saldo_chequera), 1525);
            assert.equal(Number(cta1.saldo_conciliado_libros ?? cta1.saldo_banco_conciliado), 1700);
            assert.ok(cta1.cargos_cheques_en_transito !== undefined);
            assert.ok(cta1.abonos_en_transito !== undefined);
            assert.ok(cta1.estado_periodo !== undefined);
            assert.ok('ultima_validacion' in cta1);

            const resCheq = await harness.request(
                'GET',
                '/api/consultas/saldos-chequera?fecha_corte=2026-10-31&comparativo=true',
                { userId: 3 }
            );
            assert.equal(resCheq.status, 200);
            const cheqRows = Array.isArray(resCheq.data) ? resCheq.data : (resCheq.data.cuentas || resCheq.data.rows || []);
            assert.ok(cheqRows.length >= 2, 'saldos-chequera nativo debe listar las 2 cuentas activas');
            const cta1Cheq = cheqRows.find((r) => String(r.numero || r.cuenta_numero) === '2000012345');
            assert.ok(cta1Cheq, 'saldos-chequera debe retornar la cuenta 2000012345 con columnas nativas');
            assert.equal(Number(cta1Cheq.saldo_inicial), 1000);
            assert.equal(Number(cta1Cheq.saldo_chequera), 1525);
            assert.equal(Number(cta1Cheq.saldo_conciliado_libros ?? cta1Cheq.saldo_banco_conciliado), 1700);
            const totCheq = resCheq.data?.totales?.saldo_chequera ?? cheqRows.reduce((s, r) => s + Number(r.saldo_chequera || 0), 0);
            const totLibros = resCheq.data?.totales?.saldo_conciliado_libros ?? cheqRows.reduce((s, r) => s + Number(r.saldo_conciliado_libros ?? r.saldo_banco_conciliado ?? 0), 0);
            assert.equal(Number(totCheq), 2025);
            assert.equal(Number(totLibros), 2200);
        });

        it('F8 (R3.2): Libro Auxiliar / Kardex Bancario combina movimientos y cheques con Saldo Inicial y Saldo Corrido exacto', async () => {
            const res = await harness.request(
                'GET',
                '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&estado=TODOS&page=1&limit=50',
                { userId: 3 }
            );
            assert.equal(res.status, 200);
            assert.equal(Number(res.data.totales.saldo_inicial_periodo), 1000);
            assert.equal(Number(res.data.totales.saldo_final_periodo), 1525);
            assert.ok(Array.isArray(res.data.items) && res.data.items.length === 4);

            // Verificar orden cronológico y saldo corrido línea por línea:
            // 1) +500 -> 1500; 2) -25 -> 1475; 3) +200 -> 1675; 4) cheque 5001 -150 -> 1525 (reservado 5002 excluido)
            assert.equal(Number(res.data.items[0].saldo_corrido), 1500);
            assert.equal(Number(res.data.items[1].saldo_corrido), 1475);
            assert.equal(Number(res.data.items[2].saldo_corrido), 1675);
            assert.equal(Number(res.data.items[3].saldo_corrido), 1525);

            const resTransito = await harness.request(
                'GET',
                '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&estado=EN_TRANSITO',
                { userId: 3 }
            );
            assert.equal(resTransito.status, 200);
            assert.equal(resTransito.data.items.length, 2);
        });

        it('F8 (R3.2): Kardex soporta paginación real y cálculo previo al rango desde', async () => {
            const resPage1 = await harness.request(
                'GET',
                '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-15&hasta=2026-10-31&page=1&limit=2',
                { userId: 3 }
            );
            assert.equal(resPage1.status, 200);
            // Movimiento del 2026-10-10 (+500) ya está incluido en saldo_inicial_periodo = 1500
            assert.equal(Number(resPage1.data.totales.saldo_inicial_periodo), 1500);
            assert.equal(resPage1.data.items.length, 2);
            assert.equal(resPage1.data.pagination.total, 3);
            assert.equal(resPage1.data.pagination.total_pages, 2);
        });

        it('F9 (R3.3): Aging de Cheques clasifica 0-30, 31-90, 91-180 y >180 días excluyendo cobrados, no emitidos y eliminados', async () => {
            const st = harness.mockDb.getState();
            st.cheques.push(
                { id: 21, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-15', cheque_anulado: 0, cheque: '5031', valor: 100, a_nombre: 'A', fecha_aplicado: null, concepto: '0-30', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 },
                { id: 22, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-08-20', cheque_anulado: 0, cheque: '5032', valor: 200, a_nombre: 'B', fecha_aplicado: null, concepto: '31-90', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 },
                { id: 23, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-06-01', cheque_anulado: 0, cheque: '5033', valor: 300, a_nombre: 'C', fecha_aplicado: null, concepto: '91-180', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 },
                { id: 24, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-03-01', cheque_anulado: 0, cheque: '5034', valor: 400, a_nombre: 'D', fecha_aplicado: null, concepto: '>180', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 },
                // Excluidos: cobrado (fecha_aplicado != null), fue_noemitido, deleted_at
                { id: 25, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-12', cheque_anulado: 0, cheque: '5035', valor: 500, a_nombre: 'E', fecha_aplicado: '2026-10-25', concepto: 'COBRADO', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 },
                { id: 26, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-03-05', cheque_anulado: 0, cheque: '5036', valor: 600, a_nombre: 'F', fecha_aplicado: null, concepto: 'NO EMITIDO', es_reservado: 0, fue_noemitido: 1, deleted_at: null, version: 1 },
                { id: 27, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-03-06', cheque_anulado: 0, cheque: '5037', valor: 700, a_nombre: 'G', fecha_aplicado: null, concepto: 'ELIMINADO', es_reservado: 0, fue_noemitido: 0, deleted_at: '2026-10-20', version: 1 }
            );
            // Ajustar fecha_saldo_inicial para incluir el histórico en conciliación
            st.cuentas_bancarias[0].fecha_saldo_inicial = '2026-01-01';

            const concRes = await harness.request(
                'GET',
                '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-01-01&hasta=2026-10-31',
                { userId: 3 }
            );
            assert.equal(concRes.status, 200);
            assert.ok(concRes.data.aging_cheques, 'GET /conciliacion/data debe exponer aging_cheques');
            assert.equal(concRes.data.aging_cheques.buckets['0-30'].count, 2); // cheque 5001 (20 oct) + 5031 (15 oct); excluye 5035 cobrado
            assert.equal(concRes.data.aging_cheques.buckets['31-90'].count, 1);
            assert.equal(concRes.data.aging_cheques.buckets['91-180'].count, 1);
            assert.equal(concRes.data.aging_cheques.buckets['>180'].count, 1); // excluye 5036 noemitido y 5037 deleted_at
            assert.equal(Number(concRes.data.aging_cheques.caducos_monto), 400);
        });

        it('F7+F9 (R3.1+R3.3): Modo comparativo de Saldos no falla si externalDb está fuera de línea y entrega saldos nativos completos', async () => {
            harness.mockDb.getState().externalDbOffline = true;
            const res = await harness.request(
                'GET',
                '/api/consultas/saldos-bancos?fecha_corte=2026-10-31&comparativo=true',
                { userId: 3 }
            );
            assert.equal(res.status, 200);
            const rows = Array.isArray(res.data) ? res.data : (res.data.cuentas || res.data.rows || []);
            assert.ok(rows.length >= 2, 'Debe retornar filas nativas de db_sipe_admin aunque externalDb esté offline');
            const cta1 = rows.find((r) => String(r.numero || r.cuenta_numero) === '2000012345');
            assert.ok(cta1);
            assert.equal(Number(cta1.saldo_inicial), 1000);
            assert.equal(Number(cta1.saldo_chequera), 1525);
            assert.equal(Number(cta1.saldo_conciliado_libros ?? cta1.saldo_banco_conciliado), 1700);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // AREA 3: R4 Bancos Avanzado (F10–F12)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Area 3 — R4 Chequeras, Conciliación IA/Reglas/Cruces y Centinela (F10–F12)', () => {
        it('F10 (R4.1): Control de Chequeras/Talonarios y auto-avance de siguiente_correlativo con alerta de stock bajo', async () => {
            const createTal = await harness.request('POST', '/api/bancos/chequeras', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    serie: 'SERIE-A',
                    desde: 6001,
                    hasta: 6003,
                    alerta_stock_bajo: 2
                }
            });
            assert.equal(createTal.status, 201);
            const talId = createTal.data.id;

            const chkRes = await harness.request('POST', '/api/cheques', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-11-12',
                    cheque: '6001',
                    valor: 80,
                    a_nombre: 'PROVEEDOR TALONARIO',
                    concepto: 'PRUEBA TALONARIO',
                    chequera_id: talId
                }
            });
            assert.equal(chkRes.status, 201);
            assert.equal(Number(chkRes.data.chequera_id), Number(talId));
            assert.ok(chkRes.data.talonario_alerta);
            assert.equal(chkRes.data.talonario_alerta.restantes, 2);

            const listTal = await harness.request('GET', '/api/bancos/chequeras?cuenta_bancaria_id=1', { userId: 2 });
            assert.equal(listTal.status, 200);
            const updatedTal = listTal.data.find((t) => Number(t.id) === Number(talId));
            assert.equal(Number(updatedTal.siguiente_correlativo), 6002);
        });

        it('F10 (R4.1): Auditoría de impresión registra impreso_at, impreso_por, veces_impreso y advierte en reimpresión', async () => {
            const firstPrint = await harness.request('POST', '/api/cheques/10/registrar-impresion', { userId: 5 });
            assert.equal(firstPrint.status, 200);
            assert.equal(firstPrint.data.veces_impreso, 1);
            assert.equal(firstPrint.data.es_reimpresion, false);
            assert.equal(firstPrint.data.advertencia_reimpresion, null);

            const secondPrint = await harness.request('POST', '/api/cheques/10/registrar-impresion', { userId: 5 });
            assert.equal(secondPrint.status, 200);
            assert.equal(secondPrint.data.veces_impreso, 2);
            assert.equal(secondPrint.data.es_reimpresion, true);
            assert.ok(secondPrint.data.advertencia_reimpresion);

            const loteRes = await harness.request('POST', '/api/cheques/registrar-impresion-lote', {
                userId: 5,
                body: { ids: [10] }
            });
            assert.equal(loteRes.status, 200);
            assert.equal(loteRes.data.tiene_reimpresiones, true);
        });

        it('F11 (R4.2): Reglas de autoclasificación (CRUD completo POST/PUT/DELETE) e importación PDF vía Gemini en Conciliación', async () => {
            const ruleRes = await harness.request('POST', '/api/bancos/conciliacion/reglas', {
                userId: 2,
                body: {
                    banco_codigo: '01',
                    cuenta_bancaria_id: 1,
                    nombre: 'Comisión POS',
                    patron: 'COMISION POS',
                    tipo_match: 'CONTAINS',
                    tipo_movimiento: 'CARGO',
                    tipo_remesa_id: 2,
                    concepto_limpio: 'COMISION TERMINAL POS',
                    cod_cta: '510301',
                    prioridad: 10
                }
            });
            assert.equal(ruleRes.status, 201);
            const ruleId = ruleRes.data.id;
            assert.ok(ruleId > 0);

            const updRule = await harness.request('PUT', `/api/bancos/conciliacion/reglas/${ruleId}`, {
                userId: 2,
                body: {
                    banco_codigo: '01',
                    cuenta_bancaria_id: 1,
                    nombre: 'Comisión POS Actualizada',
                    patron: 'COMISION POS',
                    tipo_match: 'CONTAINS',
                    tipo_movimiento: 'CARGO',
                    tipo_remesa_id: 2,
                    concepto_limpio: 'COMISION TERMINAL POS',
                    cod_cta: '510302',
                    prioridad: 5
                }
            });
            assert.equal(updRule.status, 200);

            const tempRule = await harness.request('POST', '/api/bancos/conciliacion/reglas', {
                userId: 2,
                body: {
                    banco_codigo: '01',
                    cuenta_bancaria_id: 1,
                    nombre: 'Regla Temporal',
                    patron: 'TEMPORAL',
                    tipo_match: 'CONTAINS',
                    tipo_movimiento: 'AMBOS'
                }
            });
            assert.equal(tempRule.status, 201);
            const delRule = await harness.request('DELETE', `/api/bancos/conciliacion/reglas/${tempRule.data.id}`, { userId: 2 });
            assert.equal(delRule.status, 200);

            const listRules = await harness.request('GET', '/api/bancos/conciliacion/reglas', { userId: 2 });
            assert.equal(listRules.status, 200);
            const rulesArr = Array.isArray(listRules.data) ? listRules.data : (listRules.data.reglas || []);
            assert.ok(rulesArr.some((r) => Number(r.id) === Number(ruleId) && r.cod_cta === '510302'));
            assert.equal(rulesArr.some((r) => Number(r.id) === Number(tempRule.data.id)), false);

            harness.geminiSpy.setHandler(async () => {
                const payload = JSON.stringify({
                    banco_detectado: 'PROMERICA',
                    transacciones: [
                        {
                            fecha: '2026-10-28',
                            documento: 'POS-991',
                            descripcion: 'CARGO COMISION POS OCTUBRE',
                            cargo: 18.50,
                            abono: 0,
                            saldo: 1681.50
                        }
                    ]
                });
                return { text: payload, candidates: [{ content: { parts: [{ text: payload }] } }] };
            });

            const pdfParseRes = await harness.request('POST', '/api/bancos/conciliacion/parse-extracto-pdf', {
                userId: 2,
                body: {
                    cuenta_id: 1,
                    data_url: VALID_PDF_DATA_URL,
                    nombre_original: 'estado_octubre.pdf'
                }
            });
            assert.equal(pdfParseRes.status, 200);
            assert.ok(Array.isArray(pdfParseRes.data.transacciones) && pdfParseRes.data.transacciones.length === 1);
            assert.equal(pdfParseRes.data.transacciones[0].cod_cta, '510302');
            assert.equal(pdfParseRes.data.transacciones[0].concepto_limpio || pdfParseRes.data.transacciones[0].concepto, 'COMISION TERMINAL POS');
        });

        it('F11 (R4.2): Cruce N-a-1 y 1-a-N concilian múltiples documentos y DELETE /cruces/:id revierte conciliación', async () => {
            const st = harness.mockDb.getState();
            st.cheques.push(
                { id: 31, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-21', cheque_anulado: 0, cheque: '5041', valor: 100.00, a_nombre: 'PROV A', fecha_aplicado: null, concepto: 'LOTE 1', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 },
                { id: 32, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-21', cheque_anulado: 0, cheque: '5042', valor: 200.00, a_nombre: 'PROV B', fecha_aplicado: null, concepto: 'LOTE 2', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 },
                { id: 33, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-23', cheque_anulado: 0, cheque: '5043', valor: 300.00, a_nombre: 'PROV C', fecha_aplicado: null, concepto: 'PARCIAL 1A2', es_reservado: 0, fue_noemitido: 0, deleted_at: null, version: 1 }
            );
            st.movimientos_bancarios.push(
                {
                    id: 301, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-22', fecha_aplicado: null,
                    documento: 'LOTE-300', concepto: 'CARGO MULTIPLE CHEQUES', monto: 300.00, cargo: 300.00, abono: 0,
                    tipo_remesa_id: 2, cod_cta: '110201', es_contabilizado: 0, deleted_at: null, version: 1, fingerprint: 'fp-lote-300'
                },
                {
                    id: 302, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-23', fecha_aplicado: null,
                    documento: 'PART-120', concepto: 'CARGO PARCIAL 1', monto: 120.00, cargo: 120.00, abono: 0,
                    tipo_remesa_id: 2, cod_cta: '110201', es_contabilizado: 0, deleted_at: null, version: 1, fingerprint: 'fp-part-120'
                },
                {
                    id: 303, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-23', fecha_aplicado: null,
                    documento: 'PART-180', concepto: 'CARGO PARCIAL 2', monto: 180.00, cargo: 180.00, abono: 0,
                    tipo_remesa_id: 2, cod_cta: '110201', es_contabilizado: 0, deleted_at: null, version: 1, fingerprint: 'fp-part-180'
                }
            );

            // 1) N_A_1: 2 cheques ($100 + $200) contra 1 movimiento ($300)
            const cruceRes = await harness.request('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: 'N_A_1',
                    fecha_aplicado: '2026-10-22',
                    libros_items: [
                        { id: 31, origen_tipo: 'CK' },
                        { id: 32, origen_tipo: 'CK' }
                    ],
                    banco_items: [
                        { id: 301, origen_tipo: 'MOV' }
                    ],
                    notas: 'Cruce 2 cheques vs 1 cargo bancario'
                }
            });
            assert.equal(cruceRes.status, 201);
            const c31 = st.cheques.find((c) => c.id === 31);
            const c32 = st.cheques.find((c) => c.id === 32);
            assert.equal(c31.fecha_aplicado, '2026-10-22');
            assert.equal(c32.fecha_aplicado, '2026-10-22');

            // 2) 1_A_N: 1 cheque ($300) contra 2 cargos bancarios ($120 + $180) y luego reversión DELETE /cruces/:id
            const cruce1aN = await harness.request('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: '1_A_N',
                    fecha_aplicado: '2026-10-23',
                    libros_items: [
                        { id: 33, origen_tipo: 'CK' }
                    ],
                    banco_items: [
                        { id: 302, origen_tipo: 'MOV' },
                        { id: 303, origen_tipo: 'MOV' }
                    ],
                    notas: 'Cruce 1 cheque vs 2 cargos parciales'
                }
            });
            assert.equal(cruce1aN.status, 201);
            const cruceId = cruce1aN.data.id || cruce1aN.data.cruce?.id;
            assert.ok(cruceId > 0);
            assert.equal(st.cheques.find((c) => c.id === 33).fecha_aplicado, '2026-10-23');
            assert.equal(st.movimientos_bancarios.find((m) => m.id === 302).fecha_aplicado, '2026-10-23');
            assert.equal(st.movimientos_bancarios.find((m) => m.id === 303).fecha_aplicado, '2026-10-23');

            const revRes = await harness.request('DELETE', `/api/bancos/conciliacion/cruces/${cruceId}`, { userId: 2 });
            assert.equal(revRes.status, 200);
            assert.equal(st.cheques.find((c) => c.id === 33).fecha_aplicado, null);
            assert.equal(st.movimientos_bancarios.find((m) => m.id === 302).fecha_aplicado, null);
            assert.equal(st.movimientos_bancarios.find((m) => m.id === 303).fecha_aplicado, null);
        });

        it('F12 (R4.3): Centinela Bancario detecta sobregiros, cheques >150/>180d, cuentas >7d sin validar y remesas >48h y despacha alertas SIPE + Telegram', async () => {
            const { runProactiveSentinelDispatch, evaluateSentinelAlerts } = require('../services/telegramSentinelService');
            const st = harness.mockDb.getState();
            // Crear sobregiro en cuenta 2 (saldo_inicial = 500, emitimos cheque 700 -> saldo_chequera = -200)
            st.cheques.push({
                id: 41, empresa_id: 2, cuenta_bancaria_id: 2, fecha: '2026-11-20',
                cheque_anulado: 0, cheque: '7001', valor: 700.00, a_nombre: 'SOBREGIRO',
                fecha_aplicado: null, concepto: 'CHEQUE SOBREGIRO', es_reservado: 0,
                fue_noemitido: 0, deleted_at: null, version: 1
            });
            // Cheque >180 días en cuenta 1
            st.cheques.push({
                id: 42, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-04-01',
                cheque_anulado: 0, cheque: '4900', valor: 90.00, a_nombre: 'CADUCO',
                fecha_aplicado: null, concepto: 'CHEQUE VIEJO', es_reservado: 0,
                fue_noemitido: 0, deleted_at: null, version: 1
            });
            st.cuentas_bancarias[0].fecha_saldo_inicial = '2026-01-01';

            const sentMsgs = [];
            const res = await runProactiveSentinelDispatch({
                db: harness.mockDb.pool,
                externalDb: harness.mockDb.externalPool,
                accountingDb: harness.mockDb.accountingPool,
                todayOverride: '2026-11-27',
                slotKey: 'e2e_test',
                sendTelegramFn: async (chatId, html, markup) => {
                    sentMsgs.push({ chatId, html, markup });
                    return { message_id: 8001 };
                }
            });

            assert.equal(res.dispatched, true);
            assert.ok(res.result.hasAlerts);
            assert.ok(res.result.alertKeys.some((k) => /SOBREGIRO/i.test(k)));
            assert.ok(res.result.alertKeys.some((k) => /CADUC|CHEQUE/i.test(k)));
            assert.ok(res.result.alertKeys.some((k) => /VALIDA|SIN_VALIDAR/i.test(k)));
            assert.ok(sentMsgs.length >= 1);
            assert.ok(st.notifications.length >= 1);

            // Verificar detección de remesas >48h hábiles en Sentinel
            const remRes = await evaluateSentinelAlerts({
                db: harness.mockDb.pool,
                externalDb: harness.mockDb.externalPool,
                accountingDb: harness.mockDb.accountingPool,
                todayOverride: '2026-11-27',
                overrides: {
                    transitoData: {
                        resumen: { efectivo_en_transito_48h_usd: 450, vales_sin_facturar_72h_usd: 0 },
                        remesas_en_transito: [
                            { estacion: 'Puma Miraflores', fecha_turno: '2026-11-24', dias_transito: 3, pendiente_conciliar_usd: 450, severidad: 'critico' }
                        ],
                        vales_pendientes_72h: []
                    }
                }
            });
            assert.equal(remRes.hasAlerts, true);
            assert.ok(remRes.alertKeys.includes('REMESAS_48H'));
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // AREA 4: R5 Velocidad Operativa Bancos (F13–F18)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Area 4 — R5 Transferencias, Chip en Vivo, Comprobantes Movimientos y Flujo UX (F13–F18)', () => {
        it('F13 (R5.1): Transferencia directa inter-empresa crea par débito/crédito con mismo transfer_group_id', async () => {
            const trRes = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: {
                    is_transferencia: true,
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 2,
                    fecha: '2026-11-20',
                    documento: 'TRF-INT-01',
                    concepto: 'FONDEO ESTACION NORTE',
                    monto: 400.00
                }
            });
            assert.equal(trRes.status, 201);
            assert.ok(trRes.data.debit_id > 0);
            assert.ok(trRes.data.credit_id > 0);
            assert.ok(trRes.data.transfer_group_id);

            const st = harness.mockDb.getState();
            const deb = st.movimientos_bancarios.find((m) => m.id === trRes.data.debit_id);
            const cred = st.movimientos_bancarios.find((m) => m.id === trRes.data.credit_id);
            assert.equal(deb.cargo, 400);
            assert.equal(cred.abono, 400);
            assert.equal(deb.transfer_group_id, cred.transfer_group_id);
            assert.equal(deb.empresa_id, 1);
            assert.equal(cred.empresa_id, 2);
        });

        it('F14 (R5.2): Chip en vivo retorna saldo_chequera, ultimo_numero_cheque, siguiente_correlativo y talonario_activo', async () => {
            const chipRes = await harness.request('GET', '/api/cheques/cuenta-resumen/1', { userId: 2 });
            assert.equal(chipRes.status, 200);
            assert.equal(Number(chipRes.data.cuenta_id), 1);
            assert.equal(Number(chipRes.data.saldo_chequera), 1525);
            assert.equal(chipRes.data.ultimo_numero_cheque, '5002');
            assert.equal(chipRes.data.siguiente_correlativo, '5003');
        });

        it('F15 (R5.3): Movimientos Bancarios soporta adjuntar captura WebP firmada con HMAC y OCR IA opcional', async () => {
            const ocrRes = await harness.request('POST', '/api/bancos/movimientos/analizar-comprobante', {
                userId: 2,
                body: { data_url: VALID_PNG_DATA_URL, nombre_original: 'boleta.png' }
            });
            assert.equal(ocrRes.status, 200);
            assert.equal(ocrRes.data.ok, true);
            assert.ok(ocrRes.data.analisis);

            const createRes = await harness.request('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-11-22',
                    documento: 'DEP-900',
                    concepto: 'REMESA CON CAPTURA',
                    monto: 325.00,
                    cod_remesa: 'RM',
                    tipo: 'ABONO',
                    comprobante: {
                        data_url: VALID_WEBP_DATA_URL,
                        nombre_original: 'remesa_900.webp',
                        nota: 'Boleta agencia'
                    }
                }
            });
            assert.equal(createRes.status, 201);
            assert.ok(createRes.data.comprobante_signed_url || createRes.data.signed_url);

            const signedUrl = createRes.data.comprobante_signed_url || createRes.data.signed_url;
            const dlRes = await harness.request('GET', signedUrl, { token: null });
            assert.equal(dlRes.status, 200);
            assert.deepEqual(dlRes.buffer, VALID_WEBP_BUFFER);
        });

        it('F16–F17 (R5.4–R5.5): Filtros por rango de periodo y deep-link cuenta_bancaria_id funcionan en Movimientos, Cheques y Reportes', async () => {
            const movsRes = await harness.request(
                'GET',
                '/api/bancos/movimientos?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-16',
                { userId: 2 }
            );
            assert.equal(movsRes.status, 200);
            assert.equal(movsRes.data.length, 2);

            const chksRes = await harness.request(
                'GET',
                '/api/cheques/reporte-fecha?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&excluir_reservados=true',
                { userId: 2 }
            );
            assert.equal(chksRes.status, 200);
            assert.equal(chksRes.data.length, 1);
            assert.equal(chksRes.data[0].cheque, '5001');
        });

        it('F18 (R5.6): Conciliación expone los 3 bloques exactos (Saldo Banco, Tránsito, Saldo Conciliado en Libros) y Diferencia $0.00', async () => {
            const concRes = await harness.request(
                'GET',
                '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31',
                { userId: 3 }
            );
            assert.equal(concRes.status, 200);
            const r = concRes.data.resumen;
            assert.equal(r.saldo_chequera, 1525);
            assert.equal(r.abonos_en_transito, 0);
            assert.equal(r.cargos_cheques_en_transito, 175);
            assert.equal(r.saldo_conciliado_libros, 1700);
            assert.equal(r.diferencia, 0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // AREA 5: R6 Control de Pagos Capturas y UX (F19–F25)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Area 5 — R6 Control de Pagos Capturas y Conciliación Signing (F19–F25)', () => {
        it('F19 (R6.1): Conciliación firma comprobante_url de Control de Pagos con HMAC para descarga anónima sin HTTP 401', async () => {
            const fileUrl = harness.writeTempProtectedFile('pagos', 'pago_500_e2e.webp', VALID_WEBP_BUFFER);
            const st = harness.mockDb.getState();
            st.recordatorios_pagos_abonos.push({
                id: 1501, vencimiento_id: 500, recordatorio_id: 100, ubicacion: 'ANDELSA CENTRAL',
                descripcion_ref: 'PAGO ENERGIA ELECTRICA', tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1, cuenta_label: '[BANCO PROMERICA] CUENTA OPERATIVA - (2000012345)',
                beneficiario: 'AES EL SALVADOR', referencia_doc: 'TRF-500', fecha_pago: '2026-10-25',
                monto: 400.00, notas: 'Abono inicial', movimiento_bancario_id: null,
                estado_conciliacion: 'PENDIENTE', created_by: 'admin_e2e'
            });
            st.recordatorios_pagos_comprobantes.push({
                id: 1601, vencimiento_id: 500, abono_id: 1501, nombre_original: 'captura_luz.webp',
                archivo_url: fileUrl, mime_type: 'image/webp', tamano_bytes: VALID_WEBP_BUFFER.length,
                nota: 'Recibo AES', uploaded_by: 'admin_e2e'
            });

            const concRes = await harness.request(
                'GET',
                '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31',
                { userId: 3 }
            );
            assert.equal(concRes.status, 200);
            assert.equal(concRes.data.sugerencias_control_pagos.length, 1);
            const signedUrl = concRes.data.sugerencias_control_pagos[0].comprobante_url;
            assert.match(signedUrl, new RegExp(`^${fileUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?exp=\\d+&sig=[a-f0-9]{64}$`));

            const getImg = await harness.request('GET', signedUrl, { token: null });
            assert.equal(getImg.status, 200);
            assert.deepEqual(getImg.buffer, VALID_WEBP_BUFFER);
        });

        it('F20 (R6.2): Crear nueva operación de pago con capturas adjuntas (pendiente y pagado al registrar)', async () => {
            const createPaidRes = await harness.request('POST', '/api/operaciones/recordatorios', {
                userId: 2,
                body: {
                    descripcion: 'FACTURA INTERNET FIBRA',
                    id_ubicacion: 1,
                    iniciar: '2026-11-20',
                    activo: true,
                    monto: 185.00,
                    repetir: 1,
                    repetir_desc: 'VEZ',
                    forma_pago: 'TRANSFERENCIA',
                    pagado: true,
                    fecPago: '2026-11-20',
                    formaPago2: 'TRANSFERENCIA',
                    pago_detalle: {
                        tipo_operacion: 'GASTO',
                        metodo_pago: 'TRANSFERENCIA',
                        cuenta_bancaria_id: 1,
                        beneficiario: 'CLARO EMPRESAS',
                        referencia_doc: 'CL-9988'
                    },
                    comprobantes: [
                        { data_url: VALID_WEBP_DATA_URL, nombre_original: 'captura_20261120_090000.webp', nota: 'Voucher Claro' }
                    ]
                }
            });
            assert.equal(createPaidRes.status, 200);
            assert.equal(createPaidRes.data.success, true);
            assert.ok(createPaidRes.data.first_vencimiento_id > 0);
            assert.ok(createPaidRes.data.abono_id > 0);
            assert.equal(createPaidRes.data.comprobantes.length, 1);

            const detailRes = await harness.request(
                'GET',
                `/api/operaciones/recordatorios/vencimiento/${createPaidRes.data.first_vencimiento_id}/detalle`,
                { userId: 2 }
            );
            assert.equal(detailRes.status, 200);
            assert.equal(detailRes.data.resumen.estado_pago, 'CANCELADO');
            assert.equal(detailRes.data.comprobantes.length, 1);
            assert.equal(detailRes.data.comprobantes[0].nota, 'Voucher Claro');
            assert.match(detailRes.data.comprobantes[0].signed_url, /\?exp=\d+&sig=[a-f0-9]{64}$/);
        });

        it('F21–F22 (R6.3–R6.4): Subida directa de comprobantes y Solo Preasignar (PATCH meta) preservan capturas sin alterar abonos', async () => {
            const compRes = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/comprobantes', {
                userId: 2,
                body: {
                    comprobantes: [
                        { data_url: VALID_PDF_DATA_URL, nombre_original: 'cotizacion_energia.pdf', nota: 'Cotización previa' }
                    ]
                }
            });
            assert.equal(compRes.status, 201);
            assert.equal(compRes.data.comprobantes.length, 1);

            const metaRes = await harness.request('PATCH', '/api/operaciones/recordatorios/vencimiento/500/meta', {
                userId: 2,
                body: {
                    tipo_operacion: 'GASTO',
                    metodo_pago_preferido: 'TRANSFERENCIA',
                    cuenta_bancaria_id: 1,
                    cuenta_label: '[BANCO PROMERICA] CUENTA OPERATIVA - (2000012345)',
                    notas_control: 'Preasignado desde test E2E'
                }
            });
            assert.equal(metaRes.status, 200);
            assert.equal(metaRes.data.detail.meta.tipo_operacion, 'GASTO');
            assert.equal(metaRes.data.detail.abonos.length, 0);
            assert.equal(metaRes.data.detail.comprobantes.length, 1);
            assert.equal(metaRes.data.detail.comprobantes[0].nota, 'Cotización previa');
        });

        it('F23 (R6.5): OCR IA analiza comprobante y empareja cuenta bancaria del catálogo sin fallar', async () => {
            const ocrRes = await harness.request('POST', '/api/operaciones/recordatorios/analizar-comprobante', {
                userId: 2,
                body: {
                    data_url: VALID_PNG_DATA_URL,
                    nombre_original: 'transferencia.png',
                    contexto: { descripcion: 'PAGO ENERGIA ELECTRICA', ubicacion: 'ANDELSA CENTRAL' }
                }
            });
            assert.equal(ocrRes.status, 200);
            assert.equal(ocrRes.data.ok, true);
            assert.equal(ocrRes.data.analisis.monto, 400);
            assert.equal(ocrRes.data.analisis.cuenta_bancaria_id, 1);
            assert.equal(ocrRes.data.analisis.referencia_doc, 'TRF-889911');
        });

        it('F24 (R6.6): receiptCompressor.js normaliza nombres genéricos (image.png, clipboard.png, blob) a captura_YYYYMMDD_HHMMSS.webp', async () => {
            const compressor = await import(pathToFileURL(path.join(FRONTEND_ROOT, 'utils/receiptCompressor.js')).href);
            await withMockBrowserDomForCompressor(async () => {
                const img1 = await compressor.compressReceiptFile({ name: 'image.png', type: 'image/png', size: 1024 });
                assert.match(img1.nombre_original, /^captura_\d{8}_\d{6}\.(webp|jpg)$/);
                assert.ok(img1.data_url.startsWith('data:image/'));
                assert.ok(img1.compressed_size > 0);
                assert.ok(img1.tamano_bytes > 0);

                const img2 = await compressor.compressReceiptFile({ name: 'clipboard.png', type: 'image/png', size: 1024 });
                assert.match(img2.nombre_original, /^captura_\d{8}_\d{6}\.(webp|jpg)$/);

                const pdf1 = await compressor.compressReceiptFile({ name: 'dte_factura.pdf', type: 'application/pdf', size: VALID_PDF_BUFFER.length });
                assert.equal(pdf1.nombre_original, 'dte_factura.pdf');
                assert.equal(pdf1.mime_type, 'application/pdf');
            });
        });

        it('F25 (R6.7): Ciclo abono parcial -> cancelación y retiro de modal legado isPagoModalOpen en ControlRecordatorios.jsx', async () => {
            const ab1 = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                userId: 2,
                body: {
                    tipo_operacion: 'CXP',
                    metodo_pago: 'TRANSFERENCIA',
                    cuenta_bancaria_id: 1,
                    fecha_pago: '2026-11-18',
                    monto: 400.00,
                    comprobantes: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'abono1.webp', nota: 'Cuota 1' }]
                }
            });
            assert.equal(ab1.status, 201);
            assert.equal(ab1.data.detail.resumen.estado_pago, 'PARCIAL');
            assert.equal(ab1.data.detail.resumen.saldo_pendiente, 600);

            const ab2 = await harness.request('POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                userId: 2,
                body: {
                    tipo_operacion: 'CXP',
                    metodo_pago: 'TRANSFERENCIA',
                    cuenta_bancaria_id: 1,
                    fecha_pago: '2026-11-25',
                    monto: 600.00
                }
            });
            assert.equal(ab2.status, 201);
            assert.equal(ab2.data.detail.resumen.estado_pago, 'CANCELADO');
            assert.equal(ab2.data.detail.resumen.saldo_pendiente, 0);

            const ctrlSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'pages/ControlRecordatorios.jsx'), 'utf8');
            assert.doesNotMatch(ctrlSrc, /isPagoModalOpen/, 'ControlRecordatorios.jsx debe retirar el modal legado isPagoModalOpen');
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // AREA 6: R7 Tareas Capturas + MiBot (F26–F29)
    // ─────────────────────────────────────────────────────────────────────────
    describe('Area 6 — R7 Tareas Capturas + MiBot Media (F26–F29)', () => {
        it('F26 (R7.1): Crear tarea y adjuntar capturas WebP/PDF genera signed_url y attachments_count', async () => {
            const createTask = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: {
                    titulo: 'Revisión Bombas Estación Norte',
                    descripcion: 'Verificar sellos e indicadores',
                    fecha_vencimiento: '2026-11-30',
                    prioridad: 'alta',
                    assigned_to: 6
                }
            });
            assert.equal(createTask.status, 201);
            const taskId = createTask.data.task.id;

            const upRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 6,
                body: {
                    attachments: [
                        { data_url: VALID_WEBP_DATA_URL, nombre_original: 'captura_20261127_100000.webp', nota: 'Bomba 1 OK' },
                        { data_url: VALID_PDF_DATA_URL, nombre_original: 'reporte_sellos.pdf', nota: 'Acta técnica' }
                    ]
                }
            });
            assert.equal(upRes.status, 201);
            assert.equal(upRes.data.attachments.length, 2);
            assert.match(upRes.data.attachments[0].archivo_url, /^\/api\/uploads\/tareas\//);
            assert.match(upRes.data.attachments[0].signed_url, /\?exp=\d+&sig=[a-f0-9]{64}$/);

            const listRes = await harness.request('GET', '/api/tasks', { userId: 1 });
            assert.equal(listRes.status, 200);
            const listed = listRes.data.find((t) => Number(t.id) === Number(taskId));
            assert.equal(Number(listed.attachments_count), 2);
        });

        it('F26 (R7.1): Servir archivos bajo /api/uploads/tareas/ con firma HMAC o JWT Bearer', async () => {
            const createTask = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea Firma Upload', fecha_vencimiento: '2026-11-30', assigned_to: 1 }
            });
            const taskId = createTask.data.task.id;

            const upRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'evidencia.webp' }
            });
            assert.equal(upRes.status, 201);
            const att = upRes.data.attachments[0];

            const anonSigned = await harness.request('GET', att.signed_url, { token: null });
            assert.equal(anonSigned.status, 200);
            assert.deepEqual(anonSigned.buffer, VALID_WEBP_BUFFER);

            const bearerRaw = await harness.request('GET', att.archivo_url, { userId: 1 });
            assert.equal(bearerRaw.status, 200);
        });

        it('F26 (R7.1): Eliminar adjunto borra el registro de BD y el archivo físico en uploads/tareas', async () => {
            const createTask = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea Eliminar Adjunto', fecha_vencimiento: '2026-11-30', assigned_to: 6 }
            });
            const taskId = createTask.data.task.id;
            const upRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 6,
                body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'temporal.webp' }
            });
            assert.equal(upRes.status, 201);
            const att = upRes.data.attachments[0];
            const diskPath = path.join(__dirname, '..', att.archivo_url.replace('/api/', ''));
            assert.equal(fs.existsSync(diskPath), true);

            const delRes = await harness.request('DELETE', `/api/tasks/attachments/${att.id}`, { userId: 6 });
            assert.equal(delRes.status, 200);
            assert.equal(fs.existsSync(diskPath), false);

            const detail = await harness.request('GET', `/api/tasks/${taskId}`, { userId: 1 });
            assert.equal(detail.status, 200);
            assert.equal(detail.data.attachments.length, 0);
        });

        it('F26 (R7.1): Adjunto puede vincularse opcionalmente a un comentario (comment_id)', async () => {
            const createTask = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea con Comentario y Evidencia', fecha_vencimiento: '2026-11-30', assigned_to: 6 }
            });
            const taskId = createTask.data.task.id;

            const cmtRes = await harness.request('POST', `/api/tasks/${taskId}/comments`, {
                userId: 1,
                body: { comentario: 'Adjunto evidencia del cierre' }
            });
            assert.equal(cmtRes.status, 201);
            const commentId = cmtRes.data.comment.id;

            const upRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: { data_url: VALID_WEBP_DATA_URL, nombre_original: 'cierre.webp', comment_id: commentId }
            });
            assert.equal(upRes.status, 201);
            assert.equal(Number(upRes.data.attachments[0].comment_id), Number(commentId));

            const detail = await harness.request('GET', `/api/tasks/${taskId}`, { userId: 1 });
            assert.equal(Number(detail.data.attachments[0].comment_id), Number(commentId));
        });

        it('F29 (R7.4): MiBot envía adjuntos de la tarea por Telegram usando sendPhoto (WebP) y sendDocument (PDF)', async () => {
            const createTask = await harness.request('POST', '/api/tasks', {
                userId: 1,
                body: { titulo: 'Tarea MiBot Multimedia', fecha_vencimiento: '2026-11-30', assigned_to: 6 }
            });
            const taskId = createTask.data.task.id;

            const upRes = await harness.request('POST', `/api/tasks/${taskId}/attachments`, {
                userId: 1,
                body: {
                    attachments: [
                        { data_url: VALID_WEBP_DATA_URL, nombre_original: 'foto_bomba.webp', nota: 'Foto' },
                        { data_url: VALID_PDF_DATA_URL, nombre_original: 'manual.pdf', nota: 'PDF' }
                    ]
                }
            });
            assert.equal(upRes.status, 201);

            const mibotRes = await harness.request('POST', '/api/telegram/mibot/programaciones', {
                userId: 1,
                body: {
                    tipo: 'TAREA',
                    titulo: 'Revisar evidencia adjunta',
                    mensaje: 'Por favor revisar foto y PDF adjuntos',
                    task_id: taskId,
                    destinatario_ids: [2],
                    enviar_ahora: true,
                    incluir_adjuntos: true
                }
            });
            assert.equal(mibotRes.status, 201);
            assert.equal(mibotRes.data.delivery_status, 'sent');

            const msgCalls = harness.telegramSpy.byMethod('sendMessage');
            const photoCalls = harness.telegramSpy.byMethod('sendPhoto');
            const docCalls = harness.telegramSpy.byMethod('sendDocument');
            assert.ok(msgCalls.length >= 1);
            assert.equal(photoCalls.length, 1);
            assert.equal(photoCalls[0].mimeType, 'image/webp');
            assert.equal(docCalls.length, 1);
            assert.equal(docCalls[0].mimeType, 'application/pdf');
        });

        it('F27–F28 (R7.2–R7.3): Tareas.jsx y MibotProgramarModal.jsx integran ReceiptViewerModal, compressReceiptFile y envío de adjuntos', () => {
            const tareasSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'pages/Tareas.jsx'), 'utf8');
            assert.match(tareasSrc, /ReceiptViewerModal/);
            assert.match(tareasSrc, /compressReceiptFile/);
            assert.match(tareasSrc, /attachments_count/);

            const mibotModalSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'components/MibotProgramarModal.jsx'), 'utf8');
            assert.match(mibotModalSrc, /incluir_adjuntos|attachment_ids/);
        });
    });
});
