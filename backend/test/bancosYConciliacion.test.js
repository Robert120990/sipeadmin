const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const dbModule = require('../db');
const { JWT_SECRET, invalidateUserAuthCache, restoreUser } = require('../middleware/auth');
const {
    parseStrictPositiveAmount,
    parseStrictNonNegativeAmount,
    parseStrictFiniteAmount,
    parseStrictDBDate,
    normalizeMovementDirection,
    computeMovementFingerprint,
    computeAccountReconciliationSummary,
    isDateInClosedPeriod
} = require('../services/bancosIntegrityService');
const {
    parseDelimitedRows,
    parseBankAmount,
    parseBankDate,
    detectDateOrderMDY,
    verifyBalanceChain,
    parseAndMatchBankStatement
} = require('../services/bankStatementParserService');

// ─────────────────────────────────────────────────────────────────────────────
// Stateful In-Memory Transactional DB Mock para Pruebas de Rutas Bancarias
// ─────────────────────────────────────────────────────────────────────────────
function createStatefulBankMockDb() {
    const createInitialState = () => ({
        seq: {
            empresas: 10,
            bancos: 10,
            cuentas_bancarias: 10,
            tipos_remesas: 10,
            movimientos_bancarios: 100,
            cheques: 200,
            validaciones_saldo_banco: 300,
            conciliacion_periodos: 400,
            conciliacion_reapertura_solicitudes: 500,
            conciliacion_importaciones: 600,
            bancos_auditoria_detalle: 700,
            notifications: 800
        },
        users: [
            { id: 1, username: 'admin_test', nombre: 'Admin Test', status: 'active', role_id: 1, role_name: 'Administrator', token_version: 1 },
            { id: 2, username: 'operador', nombre: 'Operador Bancos', status: 'active', role_id: 2, role_name: 'Contador', token_version: 1 },
            { id: 3, username: 'consulta', nombre: 'Solo Consulta', status: 'active', role_id: 3, role_name: 'Auditor', token_version: 1 },
            { id: 4, username: 'aprobador', nombre: 'Jefe Autorizador', status: 'active', role_id: 4, role_name: 'Gerente', token_version: 1 },
            { id: 5, username: 'impresor', nombre: 'Auxiliar Cheques', status: 'active', role_id: 5, role_name: 'Caja', token_version: 1 }
        ],
        rolePermissions: {
            1: ['manage_conciliacion_bancaria', 'close_conciliacion_periodo', 'approve_reapertura_conciliacion', 'edit_monto_conciliacion', 'manage_cuentas', 'manage_movimientos', 'manage_cheques', 'manage_check_designer'],
            2: ['manage_conciliacion_bancaria', 'close_conciliacion_periodo', 'manage_movimientos', 'manage_cheques', 'manage_cuentas'],
            3: ['view_conciliacion_bancaria'],
            4: ['manage_conciliacion_bancaria', 'approve_reapertura_conciliacion', 'edit_monto_conciliacion'],
            5: ['/dashboard/bancos/reportes/impresion-cheques']
        },
        empresas: [
            { id: 1, codigo: '01', nombre: 'SIPE S.A. DE C.V.' }
        ],
        bancos: [
            { id: 1, empresa_id: 1, codigo: '01', descripcion: 'BANCO PROMERICA' }
        ],
        tipos_remesas: [
            { id: 1, empresa_id: 1, codigo: 'RM', descripcion: 'REMESA' },
            { id: 2, empresa_id: 1, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 3, empresa_id: 1, codigo: 'NA', descripcion: 'NOTA DE ABONO' },
            { id: 4, empresa_id: 1, codigo: 'TR', descripcion: 'TRANSFERENCIA' }
        ],
        cuentas_bancarias: [
            {
                id: 1,
                empresa_id: 1,
                banco_id: 1,
                tipo_cuenta_id: 1,
                numero: '2000012345',
                nombre: 'CUENTA OPERATIVA',
                cod_cta: '110201',
                orden: 1,
                activa: 1,
                saldo_inicial: 1000.00,
                fecha_saldo_inicial: '2026-10-01'
            }
        ],
        movimientos_bancarios: [
            {
                id: 1,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-10',
                fecha_aplicado: '2026-10-10',
                documento: 'REM-100',
                concepto: 'DEPOSITO VENTAS',
                monto: 500.00,
                cargo: 0,
                abono: 500.00,
                tipo_remesa_id: 1,
                cod_cta: '110201',
                num_partida: null,
                es_contabilizado: 0,
                deleted_at: null,
                version: 1,
                fingerprint: computeMovementFingerprint({
                    cuentaBancariaId: 1,
                    fecha: '2026-10-10',
                    documento: 'REM-100',
                    cargo: 0,
                    abono: 500.00,
                    concepto: 'DEPOSITO VENTAS'
                })
            },
            {
                id: 2,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-15',
                fecha_aplicado: null,
                documento: 'NC-50',
                concepto: 'COMISION BANCARIA',
                monto: 25.00,
                cargo: 25.00,
                abono: 0,
                tipo_remesa_id: 2,
                cod_cta: '110201',
                num_partida: null,
                es_contabilizado: 0,
                deleted_at: null,
                version: 1,
                fingerprint: 'fp-2'
            },
            {
                id: 3,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-18',
                fecha_aplicado: '2026-10-18',
                documento: 'REM-CONT',
                concepto: 'DEPOSITO CONTABILIZADO',
                monto: 200.00,
                cargo: 0,
                abono: 200.00,
                tipo_remesa_id: 1,
                cod_cta: '110201',
                num_partida: 'P-99',
                es_contabilizado: 1,
                deleted_at: null,
                version: 1,
                fingerprint: 'fp-3'
            }
        ],
        cheques: [
            {
                id: 10,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-20',
                cheque_anulado: 0,
                cheque: '5001',
                valor: 150.00,
                a_nombre: 'PROVEEDOR UNO',
                fecha_aplicado: null,
                concepto: 'COMPRA MATERIALES',
                es_reservado: 0,
                es_pago_contado: 0,
                fue_noemitido: 0,
                num_partida: null,
                es_contabilizado: 0,
                deleted_at: null,
                valor_original: null,
                beneficiario_original: null,
                concepto_original: null,
                anulado_by: null,
                anulado_at: null,
                version: 1
            },
            {
                id: 11,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-22',
                cheque_anulado: 0,
                cheque: '5002',
                valor: 999.00,
                a_nombre: 'RESERVA CONTROLADA',
                fecha_aplicado: null,
                concepto: 'CHEQUE RESERVADO',
                es_reservado: 1,
                es_pago_contado: 0,
                fue_noemitido: 0,
                num_partida: null,
                es_contabilizado: 0,
                deleted_at: null,
                version: 1
            }
        ],
        validaciones_saldo_banco: [],
        conciliacion_periodos: [],
        conciliacion_reapertura_solicitudes: [],
        conciliacion_importaciones: [],
        bancos_auditoria_detalle: [],
        bancos_idempotency_keys: [],
        check_format: [
            {
                id: 1,
                name: 'Promerica Carta',
                description: 'Formato carta',
                banco_id: 1,
                width: 215.9,
                height: 279.4,
                orientation: 'portrait',
                margin_top: 0,
                margin_right: 0,
                margin_bottom: 0,
                margin_left: 0,
                resolution: 300,
                printer_name: 'Default',
                is_active: 1,
                design_json: '{}',
                created_at: '2026-10-01',
                updated_at: '2026-10-01'
            }
        ],
        notifications: [],
        failOnSecondImportInsert: false,
        importInsertCounter: 0
    });

    let state = createInitialState();

    const reset = () => {
        state = createInitialState();
    };

    const ymd = (d) => parseStrictDBDate(d) || (d ? String(d).slice(0, 10) : null);

    const runQuery = async (sqlRaw, params = []) => {
        const sql = sqlRaw.replace(/\s+/g, ' ').trim();
        const sqlLower = sql.toLowerCase();

        // Auth queries
        if (sqlLower.includes('from users u left join roles r')) {
            const u = state.users.find(x => Number(x.id) === Number(params[0]));
            return [u ? [u] : []];
        }
        if (sqlLower.includes('from permissions p join role_permissions rp')) {
            const roleId = Number(params[0]);
            const perms = state.rolePermissions[roleId] || [];
            return [perms.map(name => ({ name }))];
        }
        if (sqlLower.includes('from role_permissions rp join users u')) {
            const approvers = state.users.filter(u =>
                (state.rolePermissions[u.role_id] || []).includes('approve_reapertura_conciliacion')
            );
            return [approvers.map(u => ({ id: u.id }))];
        }
        if (sqlLower.includes('from users u left join roles r on u.role_id = r.id where u.status')) {
            return [state.users.filter(u => u.role_id === 1).map(u => ({ id: u.id }))];
        }
        if (sqlLower.startsWith('insert into notifications')) {
            const id = ++state.seq.notifications;
            state.notifications.push({ id, params });
            return [{ insertId: id, affectedRows: 1 }];
        }

        // Idempotency table
        if (sqlLower.startsWith('insert into bancos_idempotency_keys')) {
            const [key, scope, userId, reqHash] = params;
            const dup = state.bancos_idempotency_keys.find(r => r.idempotency_key === key && r.scope === scope);
            if (dup) {
                const err = new Error('Duplicate idempotency key');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            state.bancos_idempotency_keys.push({
                idempotency_key: key,
                scope,
                user_id: userId,
                request_hash: reqHash,
                status_code: null,
                response_json: null
            });
            return [{ affectedRows: 1 }];
        }
        if (sqlLower.includes('from bancos_idempotency_keys where idempotency_key = ?')) {
            const [key, scope] = params;
            const row = state.bancos_idempotency_keys.find(r => r.idempotency_key === key && r.scope === scope);
            return [row ? [row] : []];
        }
        if (sqlLower.startsWith('update bancos_idempotency_keys set status_code = ?')) {
            const [statusCode, responseJson, key, scope] = params;
            const row = state.bancos_idempotency_keys.find(r => r.idempotency_key === key && r.scope === scope);
            if (row) {
                row.status_code = statusCode;
                row.response_json = responseJson;
            }
            return [{ affectedRows: row ? 1 : 0 }];
        }

        // Audit table
        if (sqlLower.startsWith('insert into bancos_auditoria_detalle')) {
            const id = ++state.seq.bancos_auditoria_detalle;
            const [cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address, motivo, before_json, after_json, metadata_json] = params;
            state.bancos_auditoria_detalle.push({
                id, cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address, motivo,
                before_json, after_json, metadata_json, created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }

        // Periodos
        if (sqlLower.includes('from conciliacion_periodos where cuenta_bancaria_id = ? and estado = \'cerrado\'')) {
            const cuentaId = Number(params[0]);
            const rows = state.conciliacion_periodos
                .filter(p => Number(p.cuenta_bancaria_id) === cuentaId && p.estado === 'CERRADO')
                .sort((a, b) => String(b.fecha_corte).localeCompare(String(a.fecha_corte)));
            return [rows.slice(0, 1)];
        }
        if (sqlLower.includes('from conciliacion_periodos') && sqlLower.includes('where cuenta_bancaria_id = ? and fecha_corte = ?')) {
            const [cuentaId, fechaCorte] = params;
            return [state.conciliacion_periodos.filter(p => Number(p.cuenta_bancaria_id) === Number(cuentaId) && ymd(p.fecha_corte) === ymd(fechaCorte))];
        }
        if (sqlLower.includes('select p.*, cb.numero as cuenta_numero') && sqlLower.includes('from conciliacion_periodos p')) {
            const id = Number(params[0]);
            const p = state.conciliacion_periodos.find(x => Number(x.id) === id);
            if (!p) return [[]];
            const cta = state.cuentas_bancarias.find(c => Number(c.id) === Number(p.cuenta_bancaria_id));
            const bco = state.bancos.find(b => Number(b.id) === Number(cta?.banco_id));
            return [[{ ...p, cuenta_numero: cta?.numero, cuenta_nombre: cta?.nombre, banco_nombre: bco?.descripcion }]];
        }
        if (sqlLower.includes('from conciliacion_periodos where id = ?')) {
            const id = Number(params[0]);
            return [state.conciliacion_periodos.filter(p => Number(p.id) === id)];
        }
        if (sqlLower.startsWith('insert into conciliacion_periodos')) {
            const [cuentaId, fechaCorte, saldoBanco, saldoCheq, saldoLibros, abonosTrans, cargosTrans, dif, snap, notas, cerradoBy, cerradoNombre] = params;
            const existing = state.conciliacion_periodos.find(p => Number(p.cuenta_bancaria_id) === Number(cuentaId) && ymd(p.fecha_corte) === ymd(fechaCorte));
            if (existing) {
                Object.assign(existing, {
                    estado: 'CERRADO', saldo_banco: saldoBanco, saldo_chequera: saldoCheq,
                    saldo_conciliado_libros: saldoLibros, abonos_en_transito: abonosTrans,
                    cargos_cheques_en_transito: cargosTrans, diferencia: dif,
                    snapshot_json: snap, notas, cerrado_by: cerradoBy, cerrado_por_nombre: cerradoNombre,
                    cerrado_at: new Date().toISOString()
                });
                return [{ insertId: existing.id, affectedRows: 1 }];
            }
            const id = ++state.seq.conciliacion_periodos;
            state.conciliacion_periodos.push({
                id, cuenta_bancaria_id: Number(cuentaId), fecha_corte: ymd(fechaCorte), estado: 'CERRADO',
                saldo_banco: saldoBanco, saldo_chequera: saldoCheq, saldo_conciliado_libros: saldoLibros,
                abonos_en_transito: abonosTrans, cargos_cheques_en_transito: cargosTrans, diferencia: dif,
                snapshot_json: snap, notas, cerrado_by: cerradoBy, cerrado_por_nombre: cerradoNombre,
                cerrado_at: new Date().toISOString(), reabierto_by: null, reabierto_por_nombre: null, reabierto_at: null
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_periodos set estado = \'reabierto\'')) {
            const [reabiertoBy, reabiertoNombre, motivo, id] = params;
            const p = state.conciliacion_periodos.find(x => Number(x.id) === Number(id));
            if (p) {
                p.estado = 'REABIERTO';
                p.reabierto_by = reabiertoBy;
                p.reabierto_por_nombre = reabiertoNombre;
                p.motivo_reapertura = motivo;
                p.reabierto_at = new Date().toISOString();
            }
            return [{ affectedRows: p ? 1 : 0 }];
        }

        // Solicitudes de reapertura
        if (sqlLower.includes('from conciliacion_reapertura_solicitudes where periodo_id = ? and estado = \'pendiente\'')) {
            const periodoId = Number(params[0]);
            return [state.conciliacion_reapertura_solicitudes.filter(s => Number(s.periodo_id) === periodoId && s.estado === 'PENDIENTE')];
        }
        if (sqlLower.startsWith('insert into conciliacion_reapertura_solicitudes')) {
            const [periodoId, cuentaId, fechaCorte, motivo, solBy, solNombre] = params;
            const id = ++state.seq.conciliacion_reapertura_solicitudes;
            state.conciliacion_reapertura_solicitudes.push({
                id, periodo_id: Number(periodoId), cuenta_bancaria_id: Number(cuentaId), fecha_corte: ymd(fechaCorte),
                estado: 'PENDIENTE', motivo_solicitud: motivo, solicitado_by: solBy, solicitado_por_nombre: solNombre,
                solicitado_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.includes('from conciliacion_reapertura_solicitudes where id = ?')) {
            const id = Number(params[0]);
            return [state.conciliacion_reapertura_solicitudes.filter(s => Number(s.id) === id)];
        }
        if (sqlLower.startsWith('update conciliacion_reapertura_solicitudes set estado = ?')) {
            const [estado, resBy, resNombre, comentario, id] = params;
            const sol = state.conciliacion_reapertura_solicitudes.find(s => Number(s.id) === Number(id));
            if (sol) {
                sol.estado = estado;
                sol.resuelto_by = resBy;
                sol.resuelto_por_nombre = resNombre;
                sol.comentario_resolucion = comentario;
                sol.resuelto_at = new Date().toISOString();
            }
            return [{ affectedRows: sol ? 1 : 0 }];
        }

        // Validaciones saldo
        if (sqlLower.startsWith('insert into validaciones_saldo_banco')) {
            const id = ++state.seq.validaciones_saldo_banco;
            const [cuentaId, fechaCorte, montoBanco, saldoCheq, saldoLibros, abonosTrans, cargosTrans, dif, notas, snap, createdBy] = params;
            state.validaciones_saldo_banco.push({
                id, cuenta_bancaria_id: Number(cuentaId), fecha_validacion: new Date().toISOString(),
                fecha_corte: fechaCorte, monto_banco: montoBanco, saldo_chequera: saldoCheq,
                saldo_conciliado_libros: saldoLibros, abonos_en_transito: abonosTrans,
                cargos_cheques_en_transito: cargosTrans, diferencia: dif, notas, snapshot_json: snap, created_by: createdBy
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.includes('from validaciones_saldo_banco where id = ?')) {
            return [state.validaciones_saldo_banco.filter(v => Number(v.id) === Number(params[0]))];
        }

        // Cuentas bancarias
        if (sqlLower.includes('from cuentas_bancarias cb') && sqlLower.includes('where cb.id = ?')) {
            const cta = state.cuentas_bancarias.find(c => Number(c.id) === Number(params[0]));
            if (!cta) return [[]];
            const emp = state.empresas.find(e => Number(e.id) === Number(cta.empresa_id));
            const bco = state.bancos.find(b => Number(b.id) === Number(cta.banco_id));
            return [[{
                ...cta,
                empresa_codigo: emp?.codigo || '01',
                empresa_nombre: emp?.nombre || 'SIPE S.A. DE C.V.',
                banco_codigo: bco?.codigo || '01',
                banco_nombre: bco?.descripcion || 'BANCO PROMERICA'
            }]];
        }
        if (sqlLower.includes('from cuentas_bancarias where id = ?')) {
            const cta = state.cuentas_bancarias.find(c => Number(c.id) === Number(params[0]) && (!sqlLower.includes('activa = true') || c.activa));
            return [cta ? [cta] : []];
        }
        if (sqlLower.includes('from empresas where codigo = ?')) {
            return [state.empresas.filter(e => e.codigo === params[0])];
        }
        if (sqlLower.includes('from tipos_remesas where empresa_id = ? and codigo = ?')) {
            return [state.tipos_remesas.filter(r => Number(r.empresa_id) === Number(params[0]) && r.codigo === params[1])];
        }
        if (sqlLower.includes('from tipos_remesas where empresa_id = ?')) {
            return [state.tipos_remesas.filter(r => Number(r.empresa_id) === Number(params[0]))];
        }

        // Summary aggregation queries for computeAccountReconciliationSummary
        if (sqlLower.includes('sum(abono)') && sqlLower.includes('from movimientos_bancarios')) {
            const [dbHastaA, dbHastaB, cuentaId, dbHastaC, floorDate] = params;
            const movs = state.movimientos_bancarios.filter(m =>
                Number(m.cuenta_bancaria_id) === Number(cuentaId) &&
                !m.deleted_at &&
                ymd(m.fecha) <= ymd(dbHastaC) &&
                (!floorDate || ymd(m.fecha) >= ymd(floorDate))
            );
            return [[{
                total_abonos_libros: movs.reduce((s, m) => s + Number(m.abono || 0), 0),
                total_cargos_libros: movs.reduce((s, m) => s + Number(m.cargo || 0), 0),
                abonos_en_transito: movs.filter(m => !m.fecha_aplicado || ymd(m.fecha_aplicado) > ymd(dbHastaA)).reduce((s, m) => s + Number(m.abono || 0), 0),
                cargos_en_transito: movs.filter(m => !m.fecha_aplicado || ymd(m.fecha_aplicado) > ymd(dbHastaB)).reduce((s, m) => s + Number(m.cargo || 0), 0)
            }]];
        }
        if (sqlLower.includes('total_cheques_libros') && sqlLower.includes('from cheques')) {
            const [dbHastaA, cuentaId, dbHastaB, floorDate] = params;
            const chks = state.cheques.filter(c =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                ymd(c.fecha) <= ymd(dbHastaB) &&
                (!floorDate || ymd(c.fecha) >= ymd(floorDate))
            );
            return [[{
                total_cheques_libros: chks.reduce((s, c) => s + Number(c.valor || 0), 0),
                cheques_en_transito: chks.filter(c => !c.fecha_aplicado || ymd(c.fecha_aplicado) > ymd(dbHastaA)).reduce((s, c) => s + Number(c.valor || 0), 0)
            }]];
        }
        if (sqlLower.includes('cheques_reservados_count') && sqlLower.includes('from cheques')) {
            const [cuentaId, dbHasta, floorDate] = params;
            const res = state.cheques.filter(c =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && c.es_reservado &&
                ymd(c.fecha) <= ymd(dbHasta) &&
                (!floorDate || ymd(c.fecha) >= ymd(floorDate))
            );
            return [[{
                cheques_reservados_count: res.length,
                cheques_reservados_monto: res.reduce((s, c) => s + Number(c.valor || 0), 0)
            }]];
        }

        // Movimientos CRUD & conciliacion lookups
        if (sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('where id in')) {
            const ids = params.map(Number);
            return [state.movimientos_bancarios.filter(m => ids.includes(Number(m.id)))];
        }
        if (sqlLower.includes('from cheques') && sqlLower.includes('where id in')) {
            const ids = params.map(Number);
            return [state.cheques.filter(c => ids.includes(Number(c.id)))];
        }
        if (sqlLower.includes('from movimientos_bancarios where id = ?')) {
            return [state.movimientos_bancarios.filter(m => Number(m.id) === Number(params[0]))];
        }
        if (sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('fingerprint in')) {
            const cuentaId = Number(params[0]);
            const fps = params.slice(1);
            return [state.movimientos_bancarios.filter(m => Number(m.cuenta_bancaria_id) === cuentaId && !m.deleted_at && fps.includes(m.fingerprint))];
        }
        if (sqlLower.startsWith('insert into conciliacion_importaciones')) {
            const id = ++state.seq.conciliacion_importaciones;
            const [cuentaId, bancoFmt, fileHash, totalFilas, saldoFinal, createdBy] = params;
            state.conciliacion_importaciones.push({
                id, cuenta_bancaria_id: Number(cuentaId), banco_formato: bancoFmt, file_hash: fileHash,
                total_filas: totalFilas, creados_count: 0, conciliados_count: 0, duplicados_omitidos: 0,
                saldo_final_extracto: saldoFinal, created_by: createdBy
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_importaciones')) {
            const [creados, conciliados, dupes, id] = params;
            const imp = state.conciliacion_importaciones.find(x => Number(x.id) === Number(id));
            if (imp) Object.assign(imp, { creados_count: creados, conciliados_count: conciliados, duplicados_omitidos: dupes });
            return [{ affectedRows: imp ? 1 : 0 }];
        }
        if (sqlLower.startsWith('insert into movimientos_bancarios')) {
            if (state.failOnSecondImportInsert) {
                state.importInsertCounter++;
                if (state.importInsertCounter >= 2) {
                    throw new Error('Simulated DB error mid-batch');
                }
            }
            const id = ++state.seq.movimientos_bancarios;
            const isImport = sqlLower.includes('import_batch_id');
            const [
                empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                monto, cargo, abono, tipo_remesa_id
            ] = params;
            const fingerprint = isImport ? params[16] : params[15];
            state.movimientos_bancarios.push({
                id, empresa_id, cuenta_bancaria_id: Number(cuenta_bancaria_id),
                fecha: ymd(fecha), fecha_aplicado: ymd(fecha_aplicado),
                documento, concepto, monto: Number(monto), cargo: Number(cargo), abono: Number(abono),
                tipo_remesa_id, cod_cta: null, num_partida: null, es_contabilizado: 0,
                deleted_at: null, version: 1, fingerprint,
                import_batch_id: isImport ? params[15] : null
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update movimientos_bancarios set fecha_aplicado = ?')) {
            if (sqlLower.includes('where id in')) {
                const ids = params.map(Number);
                let affected = 0;
                state.movimientos_bancarios.forEach(m => {
                    if (ids.includes(Number(m.id)) && !m.deleted_at) {
                        m.fecha_aplicado = null;
                        m.version++;
                        affected++;
                    }
                });
                return [{ affectedRows: affected }];
            }
            const fechaAplicado = params[0];
            const id = params[params.length - 1];
            const m = state.movimientos_bancarios.find(x => Number(x.id) === Number(id) && !x.deleted_at);
            if (m) {
                m.fecha_aplicado = ymd(fechaAplicado);
                m.version++;
            }
            return [{ affectedRows: m ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update movimientos_bancarios set monto = ?')) {
            const [monto, cargo, abono] = params;
            const id = params[params.length - 1];
            const m = state.movimientos_bancarios.find(x => Number(x.id) === Number(id));
            if (m) Object.assign(m, { monto, cargo, abono, version: m.version + 1 });
            return [{ affectedRows: m ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update movimientos_bancarios set deleted_at = now()')) {
            const id = params[params.length - 1];
            const m = state.movimientos_bancarios.find(x => Number(x.id) === Number(id));
            if (m) m.deleted_at = new Date().toISOString();
            return [{ affectedRows: m ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update movimientos_bancarios set')) {
            const id = params[params.length - 1];
            const m = state.movimientos_bancarios.find(x => Number(x.id) === Number(id));
            if (m) m.version++;
            return [{ affectedRows: m ? 1 : 0 }];
        }

        // Cheques lookups & updates
        if (sqlLower.includes('from cheques where id = ?')) {
            return [state.cheques.filter(c => Number(c.id) === Number(params[0]))];
        }
        if (sqlLower.includes('from cheques where cuenta_bancaria_id = ? and cheque = ?')) {
            const [cuentaId, chequeNum, excludeId] = params;
            const dups = state.cheques.filter(c =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                String(c.cheque) === String(chequeNum) &&
                !c.deleted_at &&
                !c.cheque_anulado &&
                (params.length < 3 || Number(c.id) !== Number(excludeId))
            );
            return [dups];
        }
        if (sqlLower.startsWith('insert into cheques')) {
            const id = ++state.seq.cheques;
            const [empresa_id, cuenta_bancaria_id, fecha, cheque_anulado, cheque, valor, a_nombre, fecha_aplicado, concepto] = params;
            state.cheques.push({
                id, empresa_id, cuenta_bancaria_id: Number(cuenta_bancaria_id),
                fecha: ymd(fecha), cheque_anulado: Boolean(cheque_anulado), cheque, valor: Number(valor),
                a_nombre, fecha_aplicado: ymd(fecha_aplicado), concepto,
                es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, es_contabilizado: 0, deleted_at: null, version: 1
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update cheques set fecha_aplicado = ?')) {
            if (sqlLower.includes('where id in')) {
                const ids = params.map(Number);
                let affected = 0;
                state.cheques.forEach(c => {
                    if (ids.includes(Number(c.id)) && !c.deleted_at) {
                        c.fecha_aplicado = null;
                        c.version++;
                        affected++;
                    }
                });
                return [{ affectedRows: affected }];
            }
            const fechaAplicado = params[0];
            const id = params[params.length - 1];
            const c = state.cheques.find(x => Number(x.id) === Number(id) && !x.deleted_at);
            if (c) {
                c.fecha_aplicado = ymd(fechaAplicado);
                c.version++;
            }
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update cheques set empresa_id = ?')) {
            const [
                empresa_id, cuenta_bancaria_id, fecha, cheque_anulado, cheque, valor, a_nombre,
                fecha_aplicado, concepto, es_reservado, es_pago_contado, fue_noemitido, num_partida,
                valor_original, beneficiario_original, concepto_original, anulado_by, anulado_at
            ] = params;
            const id = params[params.length - 1];
            const c = state.cheques.find(x => Number(x.id) === Number(id));
            if (c) {
                Object.assign(c, {
                    empresa_id, cuenta_bancaria_id: Number(cuenta_bancaria_id), fecha: ymd(fecha),
                    cheque_anulado, cheque, valor, a_nombre, fecha_aplicado: ymd(fecha_aplicado),
                    concepto, es_reservado, es_pago_contado, fue_noemitido, num_partida,
                    valor_original, beneficiario_original, concepto_original, anulado_by, anulado_at,
                    version: c.version + 1
                });
            }
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (sqlLower.startsWith('update cheques set deleted_at = now()')) {
            const id = params[params.length - 1];
            const c = state.cheques.find(x => Number(x.id) === Number(id));
            if (c) c.deleted_at = new Date().toISOString();
            return [{ affectedRows: c ? 1 : 0 }];
        }

        // Check Designer
        if (sqlLower.includes('from check_format cf')) {
            return [state.check_format];
        }

        // Conciliacion GET /data queries
        if (sqlLower.includes('from movimientos_bancarios m') && sqlLower.includes('left join tipos_remesas tr')) {
            return [state.movimientos_bancarios.filter(m => !m.deleted_at && Number(m.cuenta_bancaria_id) === Number(params[0])).map(m => ({
                ...m, origen_tipo: 'MOV', banco_nombre: 'BANCO PROMERICA', cuenta_numero: '2000012345',
                cuenta_nombre: 'CUENTA OPERATIVA', tipo_doc: 'RM'
            }))];
        }
        if (sqlLower.includes('from cheques ch') && sqlLower.includes('as origen_tipo')) {
            return [state.cheques.filter(c => !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado && Number(c.cuenta_bancaria_id) === Number(params[0])).map(c => ({
                ...c, origen_tipo: 'CK', tipo_doc: 'CH', documento: c.cheque, monto: c.valor, cargo: c.valor, abono: 0,
                beneficiario: c.a_nombre
            }))];
        }
        if (sqlLower.includes('from validaciones_saldo_banco v')) {
            return [state.validaciones_saldo_banco.filter(v => Number(v.cuenta_bancaria_id) === Number(params[0]))];
        }
        if (sqlLower.includes('from conciliacion_reapertura_solicitudes s')) {
            return [state.conciliacion_reapertura_solicitudes.filter(s => Number(s.cuenta_bancaria_id) === Number(params[0]))];
        }
        if (sqlLower.includes('from recordatorios_pagos_abonos')) {
            return [[]];
        }
        if (sqlLower.includes('from banks_placeholder')) {
            return [[]];
        }

        return [[]];
    };

    const pool = {
        query: runQuery,
        getConnection: async () => {
            const snapshot = JSON.stringify(state);
            return {
                query: runQuery,
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {
                    const restored = JSON.parse(snapshot);
                    Object.keys(restored).forEach(k => { state[k] = restored[k]; });
                },
                release: () => {}
            };
        },
        end: async () => {}
    };

    return {
        pool,
        getState: () => state,
        reset
    };
}

describe('Módulo de Bancos, Cheques y Conciliación Bancaria — Suite Completa', () => {
    describe('1. Servicios de Integridad Financiera (bancosIntegrityService)', () => {
        it('valida fechas calendario estrictas y rechaza fechas imposibles', () => {
            assert.equal(parseStrictDBDate('2026-11-27'), '2026-11-27');
            assert.equal(parseStrictDBDate('27/11/2026'), '2026-11-27');
            assert.equal(parseStrictDBDate('2024-02-29'), '2024-02-29'); // año bisiesto válido
            assert.equal(parseStrictDBDate('2026-02-30'), null);         // febrero 30 imposible
            assert.equal(parseStrictDBDate('2025-02-29'), null);         // 2025 no es bisiesto
            assert.equal(parseStrictDBDate('2026-13-01'), null);         // mes 13 imposible
        });

        it('valida montos estrictos positivos, no negativos y finitos', () => {
            assert.equal(parseStrictPositiveAmount('125.556'), 125.56);
            assert.equal(parseStrictPositiveAmount(0), null);
            assert.equal(parseStrictPositiveAmount(-10), null);
            assert.equal(parseStrictPositiveAmount(NaN), null);
            assert.equal(parseStrictNonNegativeAmount(0), 0);
            assert.equal(parseStrictNonNegativeAmount(-0.01), null);
            assert.equal(parseStrictFiniteAmount('-450.25'), -450.25);
        });

        it('normaliza dirección contable CARGO vs ABONO respetando TR explícito', () => {
            assert.equal(normalizeMovementDirection({ codRemesa: 'NC', tipo: 'ABONO' }), 'CARGO');
            assert.equal(normalizeMovementDirection({ codRemesa: 'CH' }), 'CARGO');
            assert.equal(normalizeMovementDirection({ codRemesa: '02' }), 'CARGO');
            assert.equal(normalizeMovementDirection({ codRemesa: 'RM', tipo: 'CARGO' }), 'ABONO');
            assert.equal(normalizeMovementDirection({ codRemesa: 'NA' }), 'ABONO');
            assert.equal(normalizeMovementDirection({ codRemesa: '01' }), 'ABONO');
            assert.equal(normalizeMovementDirection({ codRemesa: 'TR', tipo: 'CARGO' }), 'CARGO');
            assert.equal(normalizeMovementDirection({ codRemesa: 'TR', tipo: 'ABONO' }), 'ABONO');
            assert.equal(normalizeMovementDirection({ codRemesa: 'TR', descripcion: 'TRANSFERENCIA A PROVEEDOR' }), 'CARGO');
        });

        it('genera huella SHA-256 determinística normalizada', () => {
            const fp1 = computeMovementFingerprint({
                cuentaBancariaId: 5, fecha: '2026-11-01', documento: ' doc-10 ', cargo: 0, abono: 150, concepto: '  deposito   caja '
            });
            const fp2 = computeMovementFingerprint({
                cuentaBancariaId: 5, fecha: '01/11/2026', documento: 'DOC-10', cargo: 0, abono: 150.0, concepto: 'DEPOSITO CAJA'
            });
            assert.equal(fp1, fp2);
            assert.equal(fp1.length, 64);
        });

        it('calcula ecuación oficial de conciliación excluyendo reservados, anulados y borrados', async () => {
            const mock = createStatefulBankMockDb();
            const summary = await computeAccountReconciliationSummary(mock.pool, 1, '2026-10-31');
            // saldo_inicial = 1000
            // abonos = 500 + 200 = 700 (ambos conciliados)
            // cargos = 25 (en transito)
            // cheques = 150 (cheque 5001 en transito; cheque 5002 reservado EXCLUIDO)
            // saldo_chequera = 1000 + 700 - 25 - 150 = 1525
            // saldo_conciliado_libros = 1525 - 0 + (25 + 150) = 1700
            assert.equal(summary.saldo_inicial, 1000);
            assert.equal(summary.total_abonos_libros, 700);
            assert.equal(summary.total_cargos_libros, 25);
            assert.equal(summary.total_cheques_libros, 150);
            assert.equal(summary.saldo_chequera, 1525);
            assert.equal(summary.cargos_cheques_en_transito, 175);
            assert.equal(summary.saldo_conciliado_libros, 1700);
            assert.equal(summary.cheques_reservados_count, 1);
            assert.equal(summary.cheques_reservados_monto, 999);
        });

        it('detecta períodos cerrados e ignora períodos reabiertos', async () => {
            const mock = createStatefulBankMockDb();
            const st = mock.getState();
            st.conciliacion_periodos.push({ id: 401, cuenta_bancaria_id: 1, fecha_corte: '2026-10-31', estado: 'CERRADO' });

            const lockedHit = await isDateInClosedPeriod(mock.pool, 1, ['2026-11-05', '2026-10-25']);
            assert.equal(lockedHit.closed, true);
            assert.equal(lockedHit.offendingDate, '2026-10-25');

            const openHit = await isDateInClosedPeriod(mock.pool, 1, ['2026-11-01']);
            assert.equal(openHit.closed, false);

            st.conciliacion_periodos[0].estado = 'REABIERTO';
            const reopenedHit = await isDateInClosedPeriod(mock.pool, 1, ['2026-10-15']);
            assert.equal(reopenedHit.closed, false);
        });
    });

    describe('2. Parser de Extractos y Conciliación 1-a-1 (bankStatementParserService)', () => {
        it('parsea CSV/TSV con celdas multilínea entrecomilladas sin corromper filas', () => {
            const raw = 'Fecha,Documento,Concepto,Cargo,Abono,Saldo\n"01/11/2026","REF-1","PAGO DE\nSERVICIOS","","1,250.50","2,250.50"';
            const rows = parseDelimitedRows(raw);
            assert.equal(rows.length, 2);
            assert.equal(rows[1][2], 'PAGO DE SERVICIOS');
            assert.equal(rows[1][4], '1,250.50');
        });

        it('interpreta números negativos con paréntesis, formato europeo y fechas seriales Excel', () => {
            assert.deepEqual(parseBankAmount('(1,250.00)'), { amount: -1250, hint: 'CARGO' });
            assert.deepEqual(parseBankAmount('1.250,75'), { amount: 1250.75, hint: null });
            assert.deepEqual(parseBankDate('46234'), { ymd: '2026-07-31', display: '31/07/2026' });
            assert.equal(detectDateOrderMDY([['11/25/2026'], ['11/26/2026']], 0), true);
            assert.equal(detectDateOrderMDY([['25/11/2026'], ['26/11/2026']], 0), false);
        });

        it('reconoce columnas Debe/Haber y no confunde enteros >= 1000 con montos sin encabezados', () => {
            const raw = [
                'Fecha,Referencia,Descripcion,Debe,Haber',
                '01/11/2026,10500,REMESA VENTAS,0.00,1050.00'
            ].join('\n');
            const parsed = parseAndMatchBankStatement({
                rawData: raw,
                bancoFormato: 'AUTO',
                pendientes: [],
                conciliadosExistentes: []
            });
            assert.equal(parsed.transacciones.length, 1);
            assert.equal(parsed.transacciones[0].documento, '10500');
            assert.equal(parsed.transacciones[0].abono, 1050);
            assert.equal(parsed.transacciones[0].cargo, 0);

            // Sin encabezados (CSV entrecomillado RFC-4180): documento alfanumérico + monto monetario
            const headerless = parseAndMatchBankStatement({
                rawData: '01/11/2026,REF-10500,REMESA ESTACION,"$1,050.00","$2,050.00"',
                bancoFormato: 'AUTO',
                pendientes: [],
                conciliadosExistentes: []
            });
            assert.equal(headerless.transacciones.length, 1);
            assert.equal(headerless.transacciones[0].documento, 'REF-10500');
            assert.equal(headerless.transacciones[0].monto, 1050);
        });

        it('verifica cadena de saldos ascendente y descendente detectando descuadres', () => {
            const chainOk = verifyBalanceChain([
                { fecha: '2026-11-01', descripcion: 'SALDO INICIAL MOV', tipo: 'ABONO', monto: 500, cargo: 0, abono: 500, saldo: 1500, direccion_explicita_columna: true },
                { fecha: '2026-11-02', descripcion: 'COMISION', tipo: 'CARGO', monto: 200, cargo: 200, abono: 0, saldo: 1300, direccion_explicita_columna: true }
            ]);
            assert.equal(chainOk.verificada, true);
            assert.equal(chainOk.orden, 'ASCENDENTE');
            assert.equal(chainOk.inconsistencias, 0);

            const chainBad = verifyBalanceChain([
                { fecha: '2026-11-01', descripcion: 'REMESA 1', tipo: 'ABONO', monto: 500, cargo: 0, abono: 500, saldo: 1000, direccion_explicita_columna: true },
                { fecha: '2026-11-02', descripcion: 'REMESA 2', tipo: 'ABONO', monto: 500, cargo: 0, abono: 500, saldo: 1500, direccion_explicita_columna: true },
                { fecha: '2026-11-03', descripcion: 'COMISION ALTERADA', tipo: 'CARGO', monto: 200, cargo: 200, abono: 0, saldo: 1400, direccion_explicita_columna: true }
            ]);
            assert.equal(chainBad.orden, 'ASCENDENTE');
            assert.equal(chainBad.inconsistencias, 1);
        });

        it('realiza matching estricto 1-a-1 respetando dirección CARGO vs ABONO y detecta duplicados ya conciliados', () => {
            const raw = [
                'Fecha,Documento,Descripcion,Cargo,Abono',
                '20/10/2026,5001,COBRO CHEQUE 5001,150.00,0.00',
                '21/10/2026,5001,DEPOSITO MISMO REF NO DEBE EMPAREJAR CON CHEQUE,0.00,150.00',
                '22/10/2026,5003,CHEQUE CON DIFERENCIA MONTO,210.00,0.00',
                '10/10/2026,REM-100,DEPOSITO VENTAS,0.00,500.00'
            ].join('\n');

            const result = parseAndMatchBankStatement({
                rawData: raw,
                bancoFormato: 'AUTO',
                pendientes: [
                    { id: 10, origen_tipo: 'CK', documento: '5001', concepto: 'PROVEEDOR UNO', monto: 150, cargo: 150, abono: 0, fecha: '2026-10-20' },
                    { id: 12, origen_tipo: 'CK', documento: '5003', concepto: 'PROVEEDOR TRES', monto: 200, cargo: 200, abono: 0, fecha: '2026-10-22' }
                ],
                conciliadosExistentes: [
                    { id: 1, origen_tipo: 'MOV', documento: 'REM-100', concepto: 'DEPOSITO VENTAS', monto: 500, cargo: 0, abono: 500, fecha: '2026-10-10', fecha_aplicado: '2026-10-10' }
                ]
            });

            assert.equal(result.transacciones[0].matchType, 'EXACTO_DOC_MONTO');
            assert.equal(result.transacciones[0].auto_conciliable, true);
            assert.equal(result.transacciones[0].match.id, 10);
            assert.equal(result.transacciones[1].matchType, 'NINGUNO'); // mismo documento y monto pero ABONO vs CARGO -> no concilia erróneamente
            assert.equal(result.transacciones[2].matchType, 'ALERTA_DIFERENCIA_MONTO');
            assert.equal(result.transacciones[2].auto_conciliable, false);
            assert.equal(result.transacciones[3].matchType, 'YA_CONCILIADO');
            assert.equal(result.transacciones[3].es_duplicado_probable, true);
        });
    });

    describe('3. Rutas HTTP: RBAC, Bloqueos, Períodos, Reaperturas, Idempotencia y Rollback', () => {
        const mockDb = createStatefulBankMockDb();
        let originalGetDb;
        let originalGetDbIfReady;
        let originalWithTransaction;
        let server;
        let baseUrl;

        const makeToken = (user) => jwt.sign(
            { id: user.id, username: user.username, role_id: user.role_id, role: user.role_name, status: 'active' },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        const requestJson = async (method, urlPath, { userId = 1, body = null, headers = {} } = {}) => {
            const stateUser = mockDb.getState().users.find(u => u.id === userId);
            const token = makeToken(stateUser);
            const res = await fetch(`${baseUrl}${urlPath}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    ...headers
                },
                body: body !== null ? JSON.stringify(body) : undefined
            });
            const data = await res.json().catch(() => ({}));
            return { status: res.status, data, headers: res.headers };
        };

        before(async () => {
            originalGetDb = dbModule.getDb;
            originalGetDbIfReady = dbModule.getDbIfReady;
            originalWithTransaction = dbModule.withTransaction;

            dbModule.getDb = () => mockDb.pool;
            dbModule.getDbIfReady = () => mockDb.pool;
            dbModule.withTransaction = async (cb) => {
                const conn = await mockDb.pool.getConnection();
                try {
                    await conn.beginTransaction();
                    const res = await cb(conn);
                    await conn.commit();
                    return res;
                } catch (err) {
                    await conn.rollback();
                    throw err;
                } finally {
                    conn.release();
                }
            };

            const routeModules = [
                '../routes/conciliacion',
                '../routes/bancos',
                '../routes/cheques',
                '../routes/checkDesigner'
            ];
            for (const rel of routeModules) {
                delete require.cache[require.resolve(rel)];
            }

            const app = express();
            app.use(express.json());
            app.use((req, _res, next) => {
                req.io = { to: () => ({ emit: () => {} }) };
                next();
            });
            app.use('/api/bancos/conciliacion', require('../routes/conciliacion'));
            app.use('/api/bancos/cheques', require('../routes/cheques'));
            app.use('/api/bancos', require('../routes/bancos'));
            app.use('/api/check-designer', require('../routes/checkDesigner'));

            server = http.createServer(app);
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            const addr = server.address();
            baseUrl = `http://127.0.0.1:${addr.port}`;
        });

        after(async () => {
            if (server) {
                await new Promise((resolve) => server.close(resolve));
            }
            dbModule.getDb = originalGetDb;
            dbModule.getDbIfReady = originalGetDbIfReady;
            dbModule.withTransaction = originalWithTransaction;
        });

        beforeEach(() => {
            mockDb.reset();
            [1, 2, 3, 4, 5].forEach(id => {
                restoreUser(id);
                invalidateUserAuthCache(id);
            });
        });

        it('aplica RBAC estricto: lectura vs mutación, edición de monto y permiso de impresion-cheques en check-designer', async () => {
            // Usuario solo consulta (user 3: view_conciliacion_bancaria)
            const readRes = await requestJson('GET', '/api/bancos/conciliacion/data?cuenta_id=1&hasta=2026-10-31', { userId: 3 });
            assert.equal(readRes.status, 200);
            assert.equal(readRes.data.resumen.saldo_conciliado_libros, 1700);

            const writeDenied = await requestJson('POST', '/api/bancos/conciliacion/aplicar', {
                userId: 3,
                body: { items: [{ id: 2, origen_tipo: 'MOV' }], accion: 'CONCILIAR', fecha_aplicado: '2026-10-31' }
            });
            assert.equal(writeDenied.status, 403);

            // Operador (user 2) sin edit_monto_conciliacion NO puede alterar monto
            const editMontoDenied = await requestJson('PUT', '/api/bancos/conciliacion/movimiento/2', {
                userId: 2,
                body: { monto: 99 }
            });
            assert.equal(editMontoDenied.status, 403);

            // Auxiliar Impresión (user 5) SÍ puede leer check-designer/formats; Solo Consulta (user 3) recibe 403
            const designerAllowed = await requestJson('GET', '/api/check-designer/formats', { userId: 5 });
            assert.equal(designerAllowed.status, 200);
            const designerDenied = await requestJson('GET', '/api/check-designer/formats', { userId: 3 });
            assert.equal(designerDenied.status, 403);
        });

        it('bloquea con 409 edición/eliminación de movimientos conciliados o contabilizados y cheques duplicados', async () => {
            // Movimiento 1 ya conciliado (fecha_aplicado = 2026-10-10)
            const delConc = await requestJson('DELETE', '/api/bancos/movimientos/1', { userId: 2 });
            assert.equal(delConc.status, 409);

            // Movimiento 3 contabilizado
            const editCont = await requestJson('PUT', '/api/bancos/movimientos/3', {
                userId: 2,
                body: { fecha: '2026-10-18', concepto: 'CAMBIO', monto: 200 }
            });
            assert.equal(editCont.status, 409);

            // Cheque duplicado #5001 activo en cuenta 1
            const dupChk = await requestJson('POST', '/api/bancos/cheques', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-25',
                    cheque: '5001',
                    valor: 120,
                    a_nombre: 'OTRO',
                    concepto: 'PRUEBA DUPLICADO'
                }
            });
            assert.equal(dupChk.status, 409);
        });

        it('preserva montos y beneficiario original al anular cheque y registra auditoría VOID_CHEQUE', async () => {
            const voidRes = await requestJson('PUT', '/api/bancos/cheques/10', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-20',
                    cheque: '5001',
                    valor: 0,
                    a_nombre: 'ANULADO',
                    concepto: 'ANULADO POR ERROR',
                    cheque_anulado: true
                }
            });
            assert.equal(voidRes.status, 200);

            const chk = mockDb.getState().cheques.find(c => c.id === 10);
            assert.equal(chk.valor_original, 150);
            assert.equal(chk.beneficiario_original, 'PROVEEDOR UNO');
            assert.equal(chk.concepto_original, 'COMPRA MATERIALES');
            assert.ok(mockDb.getState().bancos_auditoria_detalle.some(a => a.accion === 'VOID_CHEQUE' && a.entidad_id === '10'));
        });

        it('cierra período, bloquea con 423 retroactivos (permitiendo compensar cheque anterior en mes abierto) y ejecuta flujo completo de solicitud y aprobación de reapertura', async () => {
            // 1. Validar y cerrar período al 2026-10-31 (saldo_conciliado_libros = 1700.00)
            const closeRes = await requestJson('POST', '/api/bancos/conciliacion/validar-saldo', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha_corte: '2026-10-31',
                    monto_banco: 1700.00,
                    cerrar_periodo: true,
                    notas: 'Cierre octubre exacto'
                }
            });
            assert.equal(closeRes.status, 200);
            const periodoId = closeRes.data.periodo.id;
            assert.equal(closeRes.data.periodo.estado, 'CERRADO');

            // 2. Intentar registrar movimiento en octubre cerrado -> 423 Locked
            const blockedMov = await requestJson('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-28',
                    documento: 'MOV-LOCK',
                    concepto: 'INTENTO EN CERRADO',
                    monto: 50,
                    cod_remesa: 'RM',
                    tipo: 'ABONO'
                }
            });
            assert.equal(blockedMov.status, 423);

            // 3. Intentar conciliar cheque de oct (5001) en oct cerrado -> 423
            const blockedClear = await requestJson('POST', '/api/bancos/conciliacion/aplicar', {
                userId: 2,
                body: { items: [{ id: 10, origen_tipo: 'CK' }], accion: 'CONCILIAR', fecha_aplicado: '2026-10-29' }
            });
            assert.equal(blockedClear.status, 423);

            // 4. Conciliar cheque emitido en oct (5001) cuando se cobra en nov ABIERTO -> 200 OK
            const openMonthClear = await requestJson('POST', '/api/bancos/conciliacion/aplicar', {
                userId: 2,
                body: { items: [{ id: 10, origen_tipo: 'CK' }], accion: 'CONCILIAR', fecha_aplicado: '2026-11-05' }
            });
            assert.equal(openMonthClear.status, 200);

            // 5. Operador solicita reapertura de octubre
            const reqReopen = await requestJson('POST', `/api/bancos/conciliacion/periodos/${periodoId}/solicitar-reapertura`, {
                userId: 2,
                body: { motivo: 'Se requiere registrar nota de crédito omitida de octubre 2026' }
            });
            assert.equal(reqReopen.status, 201);
            const solicitudId = reqReopen.data.solicitud_id;

            // 6. Operador sin approve_reapertura_conciliacion NO puede auto-aprobar (403)
            const selfApproveDenied = await requestJson('POST', `/api/bancos/conciliacion/reaperturas/${solicitudId}/resolver`, {
                userId: 2,
                body: { decision: 'APROBAR', comentario: 'Autoaprobación indebida' }
            });
            assert.equal(selfApproveDenied.status, 403);

            // 7. Usuario designado (user 4 con approve_reapertura_conciliacion) aprueba
            const approveRes = await requestJson('POST', `/api/bancos/conciliacion/reaperturas/${solicitudId}/resolver`, {
                userId: 4,
                body: { decision: 'APROBAR', comentario: 'Autorizado por gerencia' }
            });
            assert.equal(approveRes.status, 200);
            assert.equal(mockDb.getState().conciliacion_periodos.find(p => p.id === periodoId).estado, 'REABIERTO');
            assert.ok(mockDb.getState().bancos_auditoria_detalle.some(a => a.accion === 'APROBAR_REAPERTURA'));

            // 8. Ahora el movimiento en octubre SÍ procede -> 201
            const afterReopenMov = await requestJson('POST', '/api/bancos/movimientos', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-28',
                    documento: 'NC-OCT',
                    concepto: 'NOTA CREDITO REAPERTURA',
                    monto: 40,
                    cod_remesa: 'NA',
                    tipo: 'ABONO'
                }
            });
            assert.equal(afterReopenMov.status, 201);
        });

        it('garantiza idempotencia con X-Idempotency-Key sin duplicar registros', async () => {
            const payload = {
                cuenta_bancaria_id: 1,
                fecha: '2026-11-02',
                documento: 'REM-IDEM-1',
                concepto: 'REMESA IDEMPOTENTE',
                monto: 300,
                cod_remesa: 'RM',
                tipo: 'ABONO'
            };
            const first = await requestJson('POST', '/api/bancos/movimientos', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'idem-key-mov-001' },
                body: payload
            });
            assert.equal(first.status, 201);
            const countAfterFirst = mockDb.getState().movimientos_bancarios.length;

            const replay = await requestJson('POST', '/api/bancos/movimientos', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'idem-key-mov-001' },
                body: payload
            });
            assert.equal(replay.status, 201);
            assert.equal(replay.data.id, first.data.id);
            assert.equal(mockDb.getState().movimientos_bancarios.length, countAfterFirst);
        });

        it('revierte atómicamente todo el lote masivo de conciliación si ocurre error a mitad del batch', async () => {
            const stateBefore = mockDb.getState();
            const initialMovCount = stateBefore.movimientos_bancarios.length;
            const chk10Before = stateBefore.cheques.find(c => c.id === 10).fecha_aplicado;
            stateBefore.failOnSecondImportInsert = true;

            const res = await requestJson('POST', '/api/bancos/conciliacion/crear-masivo-y-aplicar', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    banco_formato: 'PROMERICA',
                    file_hash: 'hash-atomic-test',
                    coincidencias_a_aplicar: [
                        { id: 10, origen_tipo: 'CK', fecha_aplicado: '2026-11-02' }
                    ],
                    items: [
                        { fecha: '2026-11-01', fecha_aplicado: '2026-11-01', documento: 'IMP-1', concepto: 'FILA 1', tipo: 'ABONO', tipo_remesa_codigo: 'RM', monto: 100 },
                        { fecha: '2026-11-02', fecha_aplicado: '2026-11-02', documento: 'IMP-2', concepto: 'FILA 2 FAIL', tipo: 'CARGO', tipo_remesa_codigo: 'NC', monto: 50 }
                    ]
                }
            });

            assert.equal(res.status, 500);
            assert.equal(mockDb.getState().movimientos_bancarios.length, initialMovCount);
            assert.equal(mockDb.getState().cheques.find(c => c.id === 10).fecha_aplicado, chk10Before);
            assert.equal(mockDb.getState().conciliacion_importaciones.length, 0);
        });
    });
});
