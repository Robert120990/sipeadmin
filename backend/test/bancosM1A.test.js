const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const dbModule = require('../db');
const { JWT_SECRET, invalidateUserAuthCache, restoreUser } = require('../middleware/auth');
const {
    PROTECTED_UPLOAD_DIRS,
    signUploadUrl,
    guardProtectedUploadsMiddleware
} = require('../utils/uploadSigner');
const {
    parseStrictDBDate,
    computeAccountReconciliationSummary,
    classifyCheckAging,
    summarizeChecksAging,
    getLiveAccountCheckbookSummary,
    consumeTalonarioNumber,
    computeAccountLedgerKardex
} = require('../services/bancosIntegrityService');
const telegramDataService = require('../services/telegramDataService');
const { getFlujoCajaProyectado } = require('../services/cashflowForecast');

function createM1AMockDb() {
    const createInitialState = () => ({
        seq: {
            cheques: 50,
            movimientos_bancarios: 50,
            chequeras: 10,
            bancos_auditoria_detalle: 100
        },
        missingChequerasTable: false,
        externalDbThrows: false,
        users: [
            { id: 1, username: 'admin_m1a', nombre: 'Admin M1A', status: 'active', role_id: 1, role_name: 'Administrator', token_version: 1 },
            { id: 2, username: 'cheques_op', nombre: 'Operador Cheques', status: 'active', role_id: 2, role_name: 'Contador', token_version: 1 },
            { id: 3, username: 'movs_op', nombre: 'Operador Movs', status: 'active', role_id: 3, role_name: 'Auxiliar', token_version: 1 },
            { id: 4, username: 'sin_perm', nombre: 'Sin Permisos', status: 'active', role_id: 4, role_name: 'Invitado', token_version: 1 },
            { id: 5, username: 'impresor_m1a', nombre: 'Auxiliar Impresión', status: 'active', role_id: 5, role_name: 'Caja', token_version: 1 }
        ],
        rolePermissions: {
            1: ['manage_cheques', 'manage_movimientos', 'manage_cheques_contado', 'manage_check_designer', 'manage_chequeras'],
            2: ['manage_cheques', 'manage_cheques_contado', '/dashboard/bancos/cheques'],
            3: ['manage_movimientos', '/dashboard/bancos/movimientos'],
            4: ['view_dashboard'],
            5: ['/dashboard/bancos/reportes/impresion-cheques', 'manage_check_designer']
        },
        empresas: [
            { id: 1, codigo: '001', nombre: 'CORPORATIVO SIPE S.A. DE C.V.' },
            { id: 2, codigo: '002', nombre: 'ESTACION MIRAFLORES' }
        ],
        bancos: [
            { id: 1, empresa_id: 1, codigo: '01', descripcion: 'BANCO PROMERICA' },
            { id: 2, empresa_id: 1, codigo: '02', descripcion: 'BANCO AGRICOLA' }
        ],
        tipos_remesas: [
            { id: 1, empresa_id: 1, codigo: 'RM', descripcion: 'REMESA' },
            { id: 2, empresa_id: 1, codigo: 'NC', descripcion: 'NOTA DE CARGO' }
        ],
        cuentas_bancarias: [
            {
                id: 1,
                empresa_id: 1,
                banco_id: 1,
                tipo_cuenta_id: 1,
                numero: '100-001-99',
                nombre: 'CUENTA PRINCIPAL',
                activa: 1,
                orden: 1,
                saldo_inicial: 1000.00,
                fecha_saldo_inicial: '2026-10-01'
            },
            {
                id: 2,
                empresa_id: 1,
                banco_id: 2,
                tipo_cuenta_id: 1,
                numero: '200-002-88',
                nombre: 'CUENTA ZERO PAD',
                activa: 1,
                orden: 2,
                saldo_inicial: 500.00,
                fecha_saldo_inicial: '2026-10-01'
            }
        ],
        chequeras: [
            {
                id: 1,
                cuenta_bancaria_id: 1,
                serie: 'A',
                desde: 5001,
                hasta: 5015,
                siguiente_correlativo: 5005,
                alerta_stock_bajo: 10,
                activo: 1
            }
        ],
        movimientos_bancarios: [
            {
                id: 1,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-09-25',
                fecha_aplicado: '2026-09-25',
                documento: 'PRE-FLOOR',
                concepto: 'MOV ANTES DE SALDO INICIAL',
                monto: 9999.00,
                cargo: 0,
                abono: 9999.00,
                tipo_remesa_id: 1,
                cod_cta: '110201',
                num_partida: null,
                es_contabilizado: 0,
                comprobante_url: null,
                deleted_at: null
            },
            {
                id: 2,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-05',
                fecha_aplicado: '2026-10-05',
                documento: 'REM-001',
                concepto: 'DEPOSITO INICIAL OCT',
                monto: 800.00,
                cargo: 0,
                abono: 800.00,
                tipo_remesa_id: 1,
                cod_cta: '110201',
                num_partida: 'P-01',
                es_contabilizado: 1,
                comprobante_url: '/api/uploads/movimientos/rem001.webp',
                deleted_at: null
            },
            {
                id: 3,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-12',
                fecha_aplicado: null,
                documento: 'REM-002',
                concepto: 'DEPOSITO EN TRANSITO',
                monto: 300.00,
                cargo: 0,
                abono: 300.00,
                tipo_remesa_id: 1,
                cod_cta: '110201',
                num_partida: null,
                es_contabilizado: 0,
                comprobante_url: null,
                deleted_at: null
            },
            {
                id: 4,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-14',
                fecha_aplicado: '2026-10-14',
                documento: 'NC-010',
                concepto: 'COMISION MANEJO',
                monto: 50.00,
                cargo: 50.00,
                abono: 0,
                tipo_remesa_id: 2,
                cod_cta: '510101',
                num_partida: null,
                es_contabilizado: 0,
                comprobante_url: null,
                deleted_at: null
            }
        ],
        cheques: [
            {
                id: 10,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                llave: 'CHQ00000000000000010',
                fecha: '2026-10-10',
                cheque_anulado: 0,
                cheque: '5001',
                valor: 200.00,
                a_nombre: 'PROVEEDOR ALFA',
                fecha_aplicado: '2026-10-11',
                concepto: 'COMPRA SUMINISTROS',
                es_reservado: 0,
                es_pago_contado: 0,
                fue_noemitido: 0,
                num_partida: 'P-02',
                es_contabilizado: 0,
                deleted_at: null,
                valor_original: null,
                beneficiario_original: null,
                concepto_original: null,
                chequera_id: 1,
                impreso_at: null,
                impreso_por: null,
                veces_impreso: 0,
                version: 1
            },
            {
                id: 11,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                llave: 'CHQ00000000000000011',
                fecha: '2026-10-18',
                cheque_anulado: 0,
                cheque: '5004',
                valor: 150.00,
                a_nombre: 'PROVEEDOR BETA',
                fecha_aplicado: null,
                concepto: 'PAGO EN TRANSITO',
                es_reservado: 0,
                es_pago_contado: 0,
                fue_noemitido: 0,
                num_partida: null,
                es_contabilizado: 0,
                deleted_at: null,
                valor_original: null,
                beneficiario_original: null,
                concepto_original: null,
                chequera_id: 1,
                impreso_at: null,
                impreso_por: null,
                veces_impreso: 0,
                version: 1
            },
            {
                id: 12,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                llave: 'CHQ00000000000000012',
                fecha: '2026-10-19',
                cheque_anulado: 1,
                cheque: '5003',
                valor: 0,
                a_nombre: 'ANULADO',
                fecha_aplicado: null,
                concepto: 'ANULADO POR ERROR',
                es_reservado: 0,
                es_pago_contado: 0,
                fue_noemitido: 0,
                num_partida: null,
                es_contabilizado: 0,
                deleted_at: null,
                valor_original: 75.00,
                beneficiario_original: 'BENEFICIARIO ORIGINAL',
                concepto_original: 'CONCEPTO ORIGINAL',
                chequera_id: 1,
                impreso_at: null,
                impreso_por: null,
                veces_impreso: 0,
                version: 1
            },
            {
                id: 13,
                empresa_id: 1,
                cuenta_bancaria_id: 2,
                llave: 'CHQ00000000000000013',
                fecha: '2026-10-15',
                cheque_anulado: 0,
                cheque: '0009',
                valor: 100.00,
                a_nombre: 'PROVEEDOR PADDING',
                fecha_aplicado: null,
                concepto: 'TEST ZERO PADDING',
                es_reservado: 0,
                es_pago_contado: 0,
                fue_noemitido: 0,
                num_partida: null,
                es_contabilizado: 0,
                deleted_at: null,
                valor_original: null,
                beneficiario_original: null,
                concepto_original: null,
                chequera_id: null,
                impreso_at: null,
                impreso_por: null,
                veces_impreso: 0,
                version: 1
            }
        ],
        check_format: [
            {
                id: 1,
                name: 'Promerica Carta',
                description: 'Formato carta',
                banco_id: 1,
                banco_nombre: 'BANCO PROMERICA',
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
                design_json: '{"elements":[{"id":"payee","x":25}]}',
                created_at: '2026-10-01',
                updated_at: '2026-10-01'
            }
        ],
        solicitud_chq_contado: [
            {
                llave: 'SOL-002-1',
                id_empresa: '002',
                fecha: '2026-10-20',
                cod_proveedor: 'PROV-77',
                monto: 275.50,
                num_cheque: '',
                llave_cheque: ''
            },
            {
                llave: 'SOL-002-2',
                id_empresa: '002',
                fecha: '2026-10-21',
                cod_proveedor: 'PROV-88',
                monto: 410.00,
                num_cheque: '',
                llave_cheque: ''
            }
        ],
        proveedores: [
            { id_empresa: '002', codigo: 'PROV-77', nombre: 'DISTRIBUIDORA DEL SUR S.A.' },
            { id_empresa: '002', codigo: 'PROV-88', nombre: 'TRANSPORTES EL SALVADOR LTDA.' }
        ],
        bancos_auditoria_detalle: [],
        bancos_idempotency_keys: [],
        conciliacion_periodos: []
    });

    let state = createInitialState();
    const reset = () => { state = createInitialState(); };
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
            const perms = state.rolePermissions[Number(params[0])] || [];
            return [perms.map(name => ({ name }))];
        }

        // Idempotency
        if (sqlLower.startsWith('insert into bancos_idempotency_keys')) {
            const [key, scope, userId, reqHash] = params;
            const dup = state.bancos_idempotency_keys.find(r => r.idempotency_key === key && r.scope === scope);
            if (dup) {
                const err = new Error('Duplicate idempotency key');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            state.bancos_idempotency_keys.push({
                idempotency_key: key, scope, user_id: userId, request_hash: reqHash,
                status_code: null, response_json: null
            });
            return [{ affectedRows: 1 }];
        }
        if (sqlLower.startsWith('select ') && sqlLower.includes('from bancos_idempotency_keys where idempotency_key = ?')) {
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
        if (sqlLower.startsWith('delete from bancos_idempotency_keys')) {
            const [key, scope] = params;
            const before = state.bancos_idempotency_keys.length;
            state.bancos_idempotency_keys = state.bancos_idempotency_keys.filter(
                r => !(r.idempotency_key === key && r.scope === scope && r.status_code === null)
            );
            return [{ affectedRows: before - state.bancos_idempotency_keys.length }];
        }

        // Audit
        if (sqlLower.startsWith('insert into bancos_auditoria_detalle')) {
            const id = ++state.seq.bancos_auditoria_detalle;
            const [cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address, motivo, before_json, after_json, metadata_json] = params;
            state.bancos_auditoria_detalle.push({
                id, cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address, motivo,
                before_json, after_json, metadata_json
            });
            return [{ insertId: id, affectedRows: 1 }];
        }

        // Closed period check
        if (sqlLower.includes('from conciliacion_periodos where cuenta_bancaria_id = ?')) {
            const rows = state.conciliacion_periodos
                .filter(p => Number(p.cuenta_bancaria_id) === Number(params[0]) && p.estado === 'CERRADO')
                .sort((a, b) => String(b.fecha_corte).localeCompare(String(a.fecha_corte)));
            return [rows.slice(0, 1)];
        }

        // Empresas & Cuentas
        if (sqlLower.includes('from empresas where codigo = ?')) {
            return [state.empresas.filter(e => e.codigo === params[0])];
        }
        if (sqlLower.includes('from cuentas_bancarias cb inner join empresas e')) {
            const [empCode, num] = params;
            const emp = state.empresas.find(e => e.codigo === empCode);
            const c = emp ? state.cuentas_bancarias.find(x => Number(x.empresa_id) === Number(emp.id) && x.numero === num) : null;
            return [c ? [{ id: c.id }] : []];
        }
        if (sqlLower.includes('from cuentas_bancarias c left join bancos b left join empresas e') ||
            (sqlLower.includes('from cuentas_bancarias c') && sqlLower.includes('left join empresas e'))) {
            const rows = state.cuentas_bancarias
                .filter(c => c.activa)
                .map(c => {
                    const b = state.bancos.find(x => Number(x.id) === Number(c.banco_id));
                    const e = state.empresas.find(x => Number(x.id) === Number(c.empresa_id));
                    return {
                        id: c.id,
                        numero: c.numero,
                        nombre: c.nombre,
                        empresa_id: c.empresa_id,
                        empresa_codigo: e?.codigo || '',
                        empresa: e?.nombre || '',
                        banco: b?.descripcion || 'Banco'
                    };
                });
            return [rows];
        }
        if (sqlLower === 'select id from cuentas_bancarias where activa = 1') {
            return [state.cuentas_bancarias.filter(c => c.activa).map(c => ({ id: c.id }))];
        }
        if (sqlLower.includes('from cuentas_bancarias where id = ?')) {
            const cta = state.cuentas_bancarias.find(c => Number(c.id) === Number(params[0]) && (!sqlLower.includes('activa = true') || c.activa));
            return [cta ? [cta] : []];
        }
        if (sqlLower.includes('from cuentas_bancarias where empresa_id = ? and numero = ?')) {
            const cta = state.cuentas_bancarias.find(c => Number(c.empresa_id) === Number(params[0]) && c.numero === params[1] && c.activa);
            return [cta ? [cta] : []];
        }

        // Chequeras
        if (sqlLower.includes('from chequeras')) {
            if (state.missingChequerasTable) {
                const err = new Error("Table 'chequeras' doesn't exist");
                err.code = 'ER_NO_SUCH_TABLE';
                err.errno = 1146;
                throw err;
            }
            if (sqlLower.includes('where id = ? and cuenta_bancaria_id = ?')) {
                const [id, ctaId] = params;
                return [state.chequeras.filter(t => Number(t.id) === Number(id) && Number(t.cuenta_bancaria_id) === Number(ctaId) && t.activo)];
            }
            if (sqlLower.includes('between desde and hasta')) {
                const [ctaId, numInt] = params;
                return [state.chequeras.filter(t => Number(t.cuenta_bancaria_id) === Number(ctaId) && t.activo && Number(numInt) >= Number(t.desde) && Number(numInt) <= Number(t.hasta))];
            }
            const ctaId = Number(params[0]);
            const rows = state.chequeras
                .filter(t => Number(t.cuenta_bancaria_id) === ctaId && t.activo)
                .sort((a, b) => {
                    const aValid = Number(a.siguiente_correlativo) <= Number(a.hasta) ? 1 : 0;
                    const bValid = Number(b.siguiente_correlativo) <= Number(b.hasta) ? 1 : 0;
                    if (bValid !== aValid) return bValid - aValid;
                    return a.id - b.id;
                });
            return [rows.slice(0, 1)];
        }
        if (sqlLower.startsWith('update chequeras set siguiente_correlativo = ? where id = ?')) {
            if (state.missingChequerasTable) {
                const err = new Error("Table 'chequeras' doesn't exist");
                err.code = 'ER_NO_SUCH_TABLE';
                err.errno = 1146;
                throw err;
            }
            const [sig, id] = params;
            const t = state.chequeras.find(x => Number(x.id) === Number(id));
            if (t) t.siguiente_correlativo = Number(sig);
            return [{ affectedRows: t ? 1 : 0 }];
        }

        // Aggregation queries for computeAccountReconciliationSummary
        if (sqlLower.includes('as total_abonos_libros') && sqlLower.includes('from movimientos_bancarios')) {
            const [hastaA, hastaB, cuentaId, hastaLimit, floorDate] = params;
            const rows = state.movimientos_bancarios.filter(m =>
                Number(m.cuenta_bancaria_id) === Number(cuentaId) &&
                !m.deleted_at &&
                m.fecha <= hastaLimit &&
                (!floorDate || m.fecha >= floorDate)
            );
            return [[{
                total_abonos_libros: rows.reduce((s, m) => s + Number(m.abono || 0), 0),
                total_cargos_libros: rows.reduce((s, m) => s + Number(m.cargo || 0), 0),
                abonos_en_transito: rows.filter(m => !m.fecha_aplicado || m.fecha_aplicado > hastaA).reduce((s, m) => s + Number(m.abono || 0), 0),
                cargos_en_transito: rows.filter(m => !m.fecha_aplicado || m.fecha_aplicado > hastaB).reduce((s, m) => s + Number(m.cargo || 0), 0)
            }]];
        }
        if (sqlLower.includes('as total_cheques_libros') && sqlLower.includes('from cheques')) {
            const [hastaA, cuentaId, hastaLimit, floorDate] = params;
            const rows = state.cheques.filter(c =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                c.fecha <= hastaLimit &&
                (!floorDate || c.fecha >= floorDate)
            );
            return [[{
                total_cheques_libros: rows.reduce((s, c) => s + Number(c.valor || 0), 0),
                cheques_en_transito: rows.filter(c => !c.fecha_aplicado || c.fecha_aplicado > hastaA).reduce((s, c) => s + Number(c.valor || 0), 0)
            }]];
        }
        if (sqlLower.includes('cheques_reservados_count') && sqlLower.includes('from cheques')) {
            const [cuentaId, hastaLimit, floorDate] = params;
            const rows = state.cheques.filter(c =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && c.es_reservado &&
                c.fecha <= hastaLimit &&
                (!floorDate || c.fecha >= floorDate)
            );
            return [[{
                cheques_reservados_count: rows.length,
                cheques_reservados_monto: rows.reduce((s, c) => s + Number(c.valor || 0), 0)
            }]];
        }

        // Kardex prior & range queries
        if (sqlLower.includes('as sum_abono') && sqlLower.includes('from movimientos_bancarios')) {
            const [cuentaId, upperBound, floorDate] = params;
            const isLe = sqlLower.includes('fecha <= ?');
            const rows = state.movimientos_bancarios.filter(m =>
                Number(m.cuenta_bancaria_id) === Number(cuentaId) &&
                !m.deleted_at &&
                (isLe ? m.fecha <= upperBound : m.fecha < upperBound) &&
                (!floorDate || m.fecha >= floorDate)
            );
            return [[{
                sum_abono: rows.reduce((s, m) => s + Number(m.abono || 0), 0),
                sum_cargo: rows.reduce((s, m) => s + Number(m.cargo || 0), 0)
            }]];
        }
        if (sqlLower.includes('as sum_valor') && sqlLower.includes('from cheques')) {
            const [cuentaId, upperBound, floorDate] = params;
            const isLe = sqlLower.includes('fecha <= ?');
            const rows = state.cheques.filter(c =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                (isLe ? c.fecha <= upperBound : c.fecha < upperBound) &&
                (!floorDate || c.fecha >= floorDate)
            );
            return [[{
                sum_valor: rows.reduce((s, c) => s + Number(c.valor || 0), 0)
            }]];
        }
        if (sqlLower.includes('from movimientos_bancarios m left join tipos_remesas tr')) {
            const [cuentaId, desde, hasta] = params;
            const rows = state.movimientos_bancarios
                .filter(m => Number(m.cuenta_bancaria_id) === Number(cuentaId) && !m.deleted_at && m.fecha >= desde && m.fecha <= hasta)
                .map(m => {
                    const tr = state.tipos_remesas.find(t => Number(t.id) === Number(m.tipo_remesa_id));
                    return { ...m, cod_remesa: tr?.codigo || null, tipo_remesa_desc: tr?.descripcion || null };
                });
            return [rows];
        }
        if (sqlLower.includes('from cheques ch where ch.cuenta_bancaria_id = ?') && sqlLower.includes('between ? and ?')) {
            const [cuentaId, desde, hasta] = params;
            const rows = state.cheques.filter(c =>
                Number(c.cuenta_bancaria_id) === Number(cuentaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                c.fecha >= desde && c.fecha <= hasta
            );
            return [rows];
        }

        // Live account checkbook highest numeric cheque
        if (sqlLower.includes("cheque regexp '^[0-9]+$'")) {
            const ctaId = Number(params[0]);
            const rows = state.cheques
                .filter(c => Number(c.cuenta_bancaria_id) === ctaId && !c.deleted_at && c.cheque && /^\d+$/.test(String(c.cheque).trim()))
                .sort((a, b) => {
                    const diff = parseInt(String(b.cheque).trim(), 10) - parseInt(String(a.cheque).trim(), 10);
                    return diff !== 0 ? diff : (b.id - a.id);
                });
            return [rows.slice(0, 1).map(c => ({ cheque: c.cheque }))];
        }
        if (sqlLower.includes('select cheque from cheques where cuenta_bancaria_id = ?')) {
            const ctaId = Number(params[0]);
            const rows = state.cheques
                .filter(c => Number(c.cuenta_bancaria_id) === ctaId && !c.deleted_at && c.cheque && String(c.cheque).trim() !== '')
                .sort((a, b) => b.id - a.id);
            return [rows.slice(0, 1).map(c => ({ cheque: c.cheque }))];
        }

        // Cheques route queries
        if (sqlLower.startsWith('select count(*) as total from cheques ch')) {
            let rows = state.cheques.filter(c => !c.deleted_at);
            if (sqlLower.includes('ch.cuenta_bancaria_id = ?')) {
                const idx = sqlLower.includes('e.codigo = ?') ? 1 : 0;
                rows = rows.filter(c => Number(c.cuenta_bancaria_id) === Number(params[idx]));
            }
            return [[{ total: rows.length }]];
        }
        if (sqlLower.includes('from cheques ch left join empresas e') && sqlLower.includes('left join users u_imp')) {
            const rows = state.cheques
                .filter(c => !c.deleted_at)
                .map(c => {
                    const emp = state.empresas.find(e => Number(e.id) === Number(c.empresa_id));
                    const cta = state.cuentas_bancarias.find(x => Number(x.id) === Number(c.cuenta_bancaria_id));
                    const bco = state.bancos.find(b => Number(b.id) === Number(cta?.banco_id));
                    const impUser = state.users.find(u => Number(u.id) === Number(c.impreso_por));
                    return {
                        ...c,
                        id_empresa: emp?.codigo || '',
                        empresa_nombre: emp?.nombre || '',
                        numero_cuenta: cta?.numero || '',
                        cuenta_nombre: cta?.nombre || '',
                        banco_id: bco?.id || null,
                        banco_nombre: bco?.descripcion || '',
                        es_contabilizado: c.es_contabilizado ? 'S' : 'N',
                        impreso_por_nombre: impUser?.nombre || null
                    };
                });
            return [rows];
        }
        if (sqlLower.includes('from cheques where cuenta_bancaria_id = ? and cheque = ?')) {
            const [ctaId, chkNum] = params;
            return [state.cheques.filter(c => Number(c.cuenta_bancaria_id) === Number(ctaId) && String(c.cheque) === String(chkNum) && !c.deleted_at && !c.cheque_anulado)];
        }
        if (sqlLower.startsWith('insert into cheques')) {
            const id = ++state.seq.cheques;
            const isContadoInsert = sqlLower.includes('es_pago_contado, es_contabilizado, created_by, version) values (?, ?, ?, ?, ?, ?, ?, ?, 1, 0');
            if (isContadoInsert) {
                const [empresa_id, cuenta_bancaria_id, llave, fecha, cheque, valor, a_nombre, concepto, created_by] = params;
                state.cheques.push({
                    id, empresa_id, cuenta_bancaria_id: Number(cuenta_bancaria_id), llave, fecha: ymd(fecha),
                    cheque_anulado: 0, cheque, valor: Number(valor), a_nombre, fecha_aplicado: null,
                    concepto, es_reservado: 0, es_pago_contado: 1, fue_noemitido: 0, es_contabilizado: 0,
                    deleted_at: null, created_by, chequera_id: null, impreso_at: null, impreso_por: null, veces_impreso: 0, version: 1
                });
            } else {
                const [empresa_id, cuenta_bancaria_id, llave, fecha, cheque_anulado, cheque, valor, a_nombre, fecha_aplicado, concepto, es_reservado, es_pago_contado, fue_noemitido, num_partida, created_by] = params;
                state.cheques.push({
                    id, empresa_id, cuenta_bancaria_id: Number(cuenta_bancaria_id), llave, fecha: ymd(fecha),
                    cheque_anulado: Boolean(cheque_anulado), cheque, valor: Number(valor), a_nombre,
                    fecha_aplicado: ymd(fecha_aplicado), concepto, es_reservado, es_pago_contado, fue_noemitido,
                    num_partida, es_contabilizado: 0, deleted_at: null, created_by, chequera_id: null,
                    impreso_at: null, impreso_por: null, veces_impreso: 0, version: 1
                });
            }
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update cheques set llave = ?, chequera_id = ? where id = ?')) {
            const [llave, chequera_id, id] = params;
            const c = state.cheques.find(x => Number(x.id) === Number(id));
            if (c) {
                c.llave = llave;
                c.chequera_id = chequera_id;
            }
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (sqlLower.includes('from cheques where id in (')) {
            const ids = params.map(Number);
            return [state.cheques.filter(c => ids.includes(Number(c.id)) && !c.deleted_at)];
        }
        if (sqlLower.includes('from cheques where id = ?')) {
            return [state.cheques.filter(c => Number(c.id) === Number(params[0]))];
        }
        if (sqlLower.startsWith('update cheques set impreso_at = now(), impreso_por = ?, veces_impreso = coalesce(veces_impreso, 0) + 1 where id = ?')) {
            const [userId, id] = params;
            const c = state.cheques.find(x => Number(x.id) === Number(id));
            if (c) {
                c.impreso_at = new Date().toISOString();
                c.impreso_por = userId;
                c.veces_impreso = Number(c.veces_impreso || 0) + 1;
            }
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (sqlLower.startsWith('select impreso_at from cheques where id = ?')) {
            const c = state.cheques.find(x => Number(x.id) === Number(params[0]));
            return [c ? [{ impreso_at: c.impreso_at }] : []];
        }

        // Check designer
        if (sqlLower.includes('from check_format cf')) {
            return [state.check_format];
        }

        // External DB queries (solicitud_chq_contado + SP fallback)
        if (sqlLower.startsWith('call sp_saldo_en_bancos') || sqlLower.startsWith('call sp_saldo_en_chequera')) {
            if (state.externalDbThrows) throw new Error('External DB unreachable');
            return [[[]]];
        }
        if (sqlLower.includes('from solicitud_chq_contado a left join proveedores b')) {
            const [llave, , estacion] = params;
            const rows = state.solicitud_chq_contado
                .filter(s => s.llave.trim() === String(llave).trim() && s.id_empresa === estacion)
                .map(s => {
                    const prov = state.proveedores.find(p => p.id_empresa === s.id_empresa && p.codigo === s.cod_proveedor);
                    return { ...s, proveedor_nombre: prov?.nombre || '' };
                });
            return [rows];
        }
        if (sqlLower.includes('from solicitud_chq_contado where')) {
            const [llave, , estacion] = params;
            const rows = state.solicitud_chq_contado.filter(s => s.llave.trim() === String(llave).trim() && s.id_empresa === estacion);
            return [rows];
        }
        if (sqlLower.startsWith('update solicitud_chq_contado set num_cheque = ?')) {
            const [numCheque, llaveCheque, llave, , estacion] = params;
            const s = state.solicitud_chq_contado.find(x => x.llave.trim() === String(llave).trim() && x.id_empresa === estacion);
            if (s) {
                s.num_cheque = numCheque;
                s.llave_cheque = llaveCheque || s.llave_cheque;
            }
            return [{ affectedRows: s ? 1 : 0 }];
        }

        // Forecast external fallback queries
        if (sqlLower.includes('from gas_station_closeouts') || sqlLower.includes('from pos_shifts') ||
            sqlLower.includes('from prestamos') || sqlLower.includes('from purchase_quedans') ||
            sqlLower.includes('from finanzas_planes_mantenimiento') || sqlLower.includes('from portal_pedidos') ||
            sqlLower.includes('from web_rc_recordatorios_vencimientos') || sqlLower.includes('from rh_planillas')) {
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
                rollback: async () => { state = JSON.parse(snapshot); },
                release: () => {}
            };
        }
    };

    return {
        pool,
        reset,
        getState: () => state
    };
}

function makeRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    return res;
}

describe('M1A — Core Schema, Signing, Integrity Engine, Services & Cheques Routes', () => {
    describe('1. Antigüedad de Cheques (classifyCheckAging & summarizeChecksAging)', () => {
        it('clasifica límites exactos 0, 30, 31, 90, 91, 150, 180, 181 y fechas inválidas/futuras', () => {
            const ref = '2026-10-31';

            const d0 = classifyCheckAging('2026-10-31', ref);
            assert.equal(d0.dias, 0);
            assert.equal(d0.dias_circulacion, 0);
            assert.equal(d0.bucket, '0-30');
            assert.equal(d0.aging_bucket, '0-30');
            assert.equal(d0.por_caducar, false);
            assert.equal(d0.caduco, false);

            const d30 = classifyCheckAging('2026-10-01', ref);
            assert.equal(d30.dias, 30);
            assert.equal(d30.bucket, '0-30');

            const d31 = classifyCheckAging('2026-09-30', ref);
            assert.equal(d31.dias, 31);
            assert.equal(d31.bucket, '31-90');

            const d90 = classifyCheckAging('2026-08-02', ref);
            assert.equal(d90.dias, 90);
            assert.equal(d90.bucket, '31-90');

            const d91 = classifyCheckAging('2026-08-01', ref);
            assert.equal(d91.dias, 91);
            assert.equal(d91.bucket, '91-180');
            assert.equal(d91.por_caducar, false);

            const d150 = classifyCheckAging('2026-06-03', ref);
            assert.equal(d150.dias, 150);
            assert.equal(d150.bucket, '91-180');
            assert.equal(d150.por_caducar, true);
            assert.equal(d150.caduco, false);

            const d180 = classifyCheckAging('2026-05-04', ref);
            assert.equal(d180.dias, 180);
            assert.equal(d180.bucket, '91-180');
            assert.equal(d180.por_caducar, true);
            assert.equal(d180.caduco, false);

            const d181 = classifyCheckAging('2026-05-03', ref);
            assert.equal(d181.dias, 181);
            assert.equal(d181.bucket, '>180');
            assert.equal(d181.por_caducar, false);
            assert.equal(d181.caduco, true);

            const postDated = classifyCheckAging('2026-11-15', ref);
            assert.equal(postDated.dias, 0);
            assert.equal(postDated.bucket, '0-30');

            const invalid = classifyCheckAging('2026-02-30', ref);
            assert.equal(invalid.dias, null);
            assert.equal(invalid.bucket, 'SIN_FECHA');
            assert.equal(invalid.por_caducar, false);
            assert.equal(invalid.caduco, false);
        });

        it('summarizeChecksAging excluye anulados/reservados/no emitidos/eliminados y acumula buckets correctamente', () => {
            const summary = summarizeChecksAging([
                { id: 1, fecha: '2026-10-20', valor: 100 }, // 0-30 (11d)
                { id: 2, fecha: '2026-09-01', valor: 250 }, // 31-90 (60d)
                { id: 3, fecha: '2026-06-01', valor: 400 }, // 91-180 por caducar (152d)
                { id: 4, fecha: '2026-04-01', valor: 500 }, // >180 caduco (213d)
                { id: 5, fecha: '2026-04-01', valor: 999, cheque_anulado: 1 },
                { id: 6, fecha: '2026-04-01', valor: 888, es_reservado: 1 },
                { id: 7, fecha: '2026-04-01', valor: 777, fue_noemitido: 1 },
                { id: 8, fecha: '2026-04-01', valor: 666, deleted_at: '2026-10-05' }
            ], '2026-10-31');

            assert.equal(summary.total_cheques, 4);
            assert.equal(summary.total_monto, 1250);
            assert.equal(summary.buckets['0-30'].count, 1);
            assert.equal(summary.buckets['0-30'].total_monto, 100);
            assert.equal(summary.buckets['31-90'].count, 1);
            assert.equal(summary.buckets['91-180'].count, 1);
            assert.equal(summary.buckets['>180'].count, 1);
            assert.equal(summary.por_caducar_count, 1);
            assert.equal(summary.por_caducar_monto, 400);
            assert.equal(summary.caducos_count, 1);
            assert.equal(summary.caducos_monto, 500);
            assert.equal(summary.buckets_list.length, 4);
        });
    });

    describe('2. Kardex Unificado y Resumen en Vivo de Chequera', () => {
        const mockDb = createM1AMockDb();

        beforeEach(() => {
            mockDb.reset();
        });

        it('computeAccountLedgerKardex calcula saldo inicial, saldo corrido y cuadra con computeAccountReconciliationSummary', async () => {
            const hasta = '2026-10-31';
            const recon = await computeAccountReconciliationSummary(mockDb.pool, 1, hasta);
            const kardex = await computeAccountLedgerKardex(mockDb.pool, {
                cuentaId: 1,
                desde: '2026-10-01',
                hasta,
                estado: 'TODOS'
            });

            // Movimiento 1 (2026-09-25) está antes de fecha_saldo_inicial (2026-10-01) -> ignorado
            assert.equal(kardex.totales.saldo_inicial_periodo, 1000);
            // Movimientos en rango: +800 (Oct 5), -200 (Chk Oct 10), +300 (Oct 12), -50 (Oct 14), -150 (Chk Oct 18) => 1700
            assert.equal(kardex.totales.saldo_final_periodo, recon.saldo_chequera);
            assert.equal(kardex.totales.saldo_final_periodo, 1700);
            assert.equal(kardex.items.length, 5);
            assert.deepEqual(
                kardex.items.map(i => i.saldo_corrido),
                [1800, 1600, 1900, 1850, 1700]
            );

            // Saldo inicial parcial (desde 2026-10-12 incluye +800 -200 = 1600)
            const partialKardex = await computeAccountLedgerKardex(mockDb.pool, {
                cuentaId: 1,
                desde: '2026-10-12',
                hasta,
                estado: 'TODOS'
            });
            assert.equal(partialKardex.totales.saldo_inicial_periodo, 1600);
            assert.equal(partialKardex.totales.saldo_final_periodo, 1700);

            // Filtro CONCILIADOS vs EN_TRANSITO + search + paginación vs exportAll
            const soloTransito = await computeAccountLedgerKardex(mockDb.pool, {
                cuentaId: 1,
                desde: '2026-10-01',
                hasta,
                estado: 'EN_TRANSITO'
            });
            assert.equal(soloTransito.items.length, 2);
            assert.ok(soloTransito.items.every(i => i.estado_conciliacion === 'EN_TRANSITO'));

            const searched = await computeAccountLedgerKardex(mockDb.pool, {
                cuentaId: 1,
                desde: '2026-10-01',
                hasta,
                search: 'BETA'
            });
            assert.equal(searched.items.length, 1);
            assert.equal(searched.items[0].documento, '5004');

            const page1 = await computeAccountLedgerKardex(mockDb.pool, {
                cuentaId: 1,
                desde: '2026-10-01',
                hasta,
                page: 1,
                limit: 2
            });
            assert.equal(page1.items.length, 2);
            assert.equal(page1.pagination.total, 5);
            assert.equal(page1.pagination.total_pages, 3);

            const exported = await computeAccountLedgerKardex(mockDb.pool, {
                cuentaId: 1,
                desde: '2026-10-01',
                hasta,
                limit: 2,
                exportAll: true
            });
            assert.equal(exported.items.length, 5);
            assert.equal(exported.pagination.export_all, true);
        });

        it('getLiveAccountCheckbookSummary soporta talonario activo, agotado, zero-padding y ER_NO_SUCH_TABLE', async () => {
            // Cuenta 1 con talonario activo (5005..5015)
            const s1 = await getLiveAccountCheckbookSummary(mockDb.pool, 1);
            assert.equal(s1.cuenta_id, 1);
            assert.equal(s1.saldo_chequera, 1700);
            assert.equal(s1.saldo_conciliado_libros, 1550);
            assert.equal(s1.ultimo_numero_cheque, '5004');
            assert.equal(s1.siguiente_correlativo, '5005');
            assert.equal(s1.talonario_activo.stock_bajo, false);
            assert.equal(s1.talonario_activo.restantes, 11);

            // Talonario agotado -> fallback al último cheque + 1
            mockDb.getState().chequeras[0].siguiente_correlativo = 5016;
            const s1Exhausted = await getLiveAccountCheckbookSummary(mockDb.pool, 1);
            assert.equal(s1Exhausted.talonario_activo.agotado, true);
            assert.equal(s1Exhausted.siguiente_correlativo, '5005');

            // Cuenta 2 sin talonario y con cheque '0009' -> preserva zero-padding '0010'
            const s2 = await getLiveAccountCheckbookSummary(mockDb.pool, 2);
            assert.equal(s2.ultimo_numero_cheque, '0009');
            assert.equal(s2.siguiente_correlativo, '0010');
            assert.equal(s2.talonario_activo, null);

            // Simular tabla chequeras faltante (ER_NO_SUCH_TABLE)
            mockDb.getState().missingChequerasTable = true;
            const sNoTable = await getLiveAccountCheckbookSummary(mockDb.pool, 1);
            assert.equal(sNoTable.talonario_activo, null);
            assert.equal(sNoTable.siguiente_correlativo, '5005');

            const conn = await mockDb.pool.getConnection();
            const consumeNoTable = await consumeTalonarioNumber(conn, { cuentaBancariaId: 1, chequeNumero: '5005' });
            assert.equal(consumeNoTable.chequeraId, null);
            assert.equal(consumeNoTable.talonarioAlerta, null);
            conn.release();
        });
    });

    describe('3. Protección de Uploads HMAC (uploadSigner.js)', () => {
        it('protege pagos, bancos, movimientos y tareas incluso ante evasiones de encoding, manteniendo tickets público', () => {
            assert.ok(PROTECTED_UPLOAD_DIRS.has('pagos'));
            assert.ok(PROTECTED_UPLOAD_DIRS.has('bancos'));
            assert.ok(PROTECTED_UPLOAD_DIRS.has('movimientos'));
            assert.ok(PROTECTED_UPLOAD_DIRS.has('tareas'));
            assert.equal(PROTECTED_UPLOAD_DIRS.has('tickets'), false);

            const blockedPaths = [
                '/bancos/estado.pdf',
                '/movimientos/voucher.webp',
                '/tareas/evidencia.webp',
                '/pagos/recibo.webp',
                '/%62ancos/estado.pdf',
                '/MoViMiEnToS/voucher.webp',
                '//./tareas/evidencia.webp'
            ];

            for (const testPath of blockedPaths) {
                const req = { baseUrl: '/api/uploads', path: testPath, query: {}, headers: {} };
                const res = makeRes();
                let nextCalled = false;
                guardProtectedUploadsMiddleware(req, res, () => { nextCalled = true; });
                assert.equal(nextCalled, false, `Debió bloquear ${testPath}`);
                assert.equal(res.statusCode, 401, `Debió retornar 401 para ${testPath}`);
            }

            // Con firma HMAC válida permite acceso
            for (const dir of ['pagos', 'bancos', 'movimientos', 'tareas']) {
                const signed = signUploadUrl(`/api/uploads/${dir}/doc.webp`, 300);
                const parsed = new URL(`https://admin.sipesv.com${signed}`);
                const req = {
                    baseUrl: '/api/uploads',
                    path: `/${dir}/doc.webp`,
                    query: { exp: parsed.searchParams.get('exp'), sig: parsed.searchParams.get('sig') },
                    headers: {}
                };
                const res = makeRes();
                let nextCalled = false;
                guardProtectedUploadsMiddleware(req, res, () => { nextCalled = true; });
                assert.equal(nextCalled, true, `Debió permitir ${dir} firmado`);
                assert.equal(res.statusCode, 200);
            }

            // /tickets sigue siendo público
            const reqTickets = { baseUrl: '/api/uploads', path: '/tickets/captura.png', query: {}, headers: {} };
            const resTickets = makeRes();
            let nextTickets = false;
            guardProtectedUploadsMiddleware(reqTickets, resTickets, () => { nextTickets = true; });
            assert.equal(nextTickets, true);
        });
    });

    describe('4. Alineación de Saldos en Servicios (telegramDataService & cashflowForecast)', () => {
        const mockDb = createM1AMockDb();
        let origGetDb;
        let origGetExternalDb;
        let origGetAccountingDb;
        let origWithRetry;

        before(() => {
            origGetDb = dbModule.getDb;
            origGetExternalDb = dbModule.getExternalDb;
            origGetAccountingDb = dbModule.getAccountingDb;
            origWithRetry = dbModule.withRetry;

            dbModule.getDb = () => mockDb.pool;
            dbModule.getExternalDb = async () => {
                if (mockDb.getState().externalDbThrows) throw new Error('External DB down');
                return mockDb.pool;
            };
            dbModule.getAccountingDb = async () => mockDb.pool;
            dbModule.withRetry = async (fn) => fn();
        });

        after(() => {
            dbModule.getDb = origGetDb;
            dbModule.getExternalDb = origGetExternalDb;
            dbModule.getAccountingDb = origGetAccountingDb;
            dbModule.withRetry = origWithRetry;
            telegramDataService.clearQueryCache();
        });

        beforeEach(() => {
            mockDb.reset();
            telegramDataService.clearQueryCache();
        });

        it('diferencia saldo_conciliado_libros vs saldo_chequera y sobrevive si externalDb falla', async () => {
            mockDb.getState().externalDbThrows = true;

            const bancosData = await telegramDataService.getSaldosBancosData();
            const chequeraData = await telegramDataService.getSaldosChequeraData();

            // Cuenta 1: chequera = 1700, conciliado = 1550; Cuenta 2: chequera = 400, conciliado = 500
            assert.equal(bancosData.fuente, 'local_conciliacion');
            assert.equal(bancosData.total, 2050);
            assert.equal(bancosData.total_conciliado_libros, 2050);
            assert.equal(bancosData.total_saldo_chequera, 2100);
            assert.equal(bancosData.total_cheques_en_transito, 250);
            assert.equal(bancosData.total_abonos_en_transito, 300);

            const cta1Banco = bancosData.cuentas.find(c => c.cuenta_bancaria_id === 1);
            assert.equal(cta1Banco.saldo, 1550);
            assert.equal(cta1Banco.saldo_conciliado_libros, 1550);
            assert.equal(cta1Banco.saldo_chequera, 1700);
            assert.equal(cta1Banco.empresa, 'CORPORATIVO SIPE S.A. DE C.V.');
            assert.equal(cta1Banco.numero, '100-001-99');

            assert.equal(chequeraData.fuente, 'local_conciliacion');
            assert.equal(chequeraData.total, 2100);
            const cta1Cheq = chequeraData.cuentas.find(c => c.cuenta_bancaria_id === 1);
            assert.equal(cta1Cheq.saldo, 1700);
            assert.equal(cta1Cheq.saldo_chequera, 1700);
            assert.equal(cta1Cheq.saldo_conciliado_libros, 1550);

            const forecast = await getFlujoCajaProyectado(30);
            assert.equal(forecast.kpi.fuente_saldos, 'local_conciliacion');
            assert.equal(forecast.kpi.saldo_inicial_bancos, 2100);
            assert.equal(forecast.kpi.saldo_chequera, 2100);
            assert.equal(forecast.kpi.saldo_conciliado_libros, 2050);
            assert.equal(forecast.kpi.cheques_en_transito, 250);
            assert.equal(forecast.kpi.abonos_en_transito, 300);
        });
    });

    describe('5. Integración HTTP: cheques.js & checkDesigner.js', () => {
        const mockDb = createM1AMockDb();
        let origGetDb;
        let origGetDbIfReady;
        let origGetExternalDb;
        let origWithTransaction;
        let server;
        let baseUrl;

        const signToken = (userId) => jwt.sign({ id: userId, role: 'User', token_version: 1 }, JWT_SECRET, { expiresIn: '1h' });

        const requestJson = async (method, urlPath, { userId = 1, body = undefined, headers = {} } = {}) => {
            const res = await fetch(`${baseUrl}${urlPath}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${signToken(userId)}`,
                    ...headers
                },
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
            const data = await res.json().catch(() => null);
            return { status: res.status, data, headers: res.headers };
        };

        before(async () => {
            origGetDb = dbModule.getDb;
            origGetDbIfReady = dbModule.getDbIfReady;
            origGetExternalDb = dbModule.getExternalDb;
            origWithTransaction = dbModule.withTransaction;

            dbModule.getDb = () => mockDb.pool;
            dbModule.getDbIfReady = () => mockDb.pool;
            dbModule.getExternalDb = async () => {
                if (mockDb.getState().externalDbThrows) throw new Error('External DB down');
                return mockDb.pool;
            };
            dbModule.withTransaction = async (cb) => {
                const conn = await mockDb.pool.getConnection();
                try {
                    await conn.beginTransaction();
                    const r = await cb(conn);
                    await conn.commit();
                    return r;
                } catch (err) {
                    await conn.rollback();
                    throw err;
                } finally {
                    conn.release();
                }
            };

            for (const rel of ['../routes/cheques', '../routes/checkDesigner']) {
                delete require.cache[require.resolve(rel)];
            }

            const app = express();
            app.use(express.json());
            app.use((req, _res, next) => {
                req.io = { to: () => ({ emit: () => {} }) };
                next();
            });
            app.use('/api/cheques', require('../routes/cheques'));
            app.use('/api/check-designer', require('../routes/checkDesigner'));

            server = http.createServer(app);
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            baseUrl = `http://127.0.0.1:${server.address().port}`;
        });

        after(async () => {
            if (server) await new Promise((resolve) => server.close(resolve));
            dbModule.getDb = origGetDb;
            dbModule.getDbIfReady = origGetDbIfReady;
            dbModule.getExternalDb = origGetExternalDb;
            dbModule.withTransaction = origWithTransaction;
        });

        beforeEach(() => {
            mockDb.reset();
            [1, 2, 3, 4, 5].forEach(id => {
                restoreUser(id);
                invalidateUserAuthCache(id);
            });
        });

        it('GET /api/cheques incluye campos originales y auditoría de impresión, y /cuenta-resumen aplica RBAC correcto', async () => {
            const listRes = await requestJson('GET', '/api/cheques', { userId: 2 });
            assert.equal(listRes.status, 200);
            const voided = listRes.data.find(c => Number(c.id) === 12);
            assert.equal(voided.beneficiario_original, 'BENEFICIARIO ORIGINAL');
            assert.equal(voided.concepto_original, 'CONCEPTO ORIGINAL');
            assert.equal(voided.veces_impreso, 0);

            // Cheques, Movimientos y Contado pueden consultar /cuenta-resumen; usuario sin permiso recibe 403
            const rCheques = await requestJson('GET', '/api/cheques/cuenta-resumen/1', { userId: 2 });
            assert.equal(rCheques.status, 200);
            assert.equal(rCheques.data.siguiente_correlativo, '5005');

            const rMovs = await requestJson('GET', '/api/cheques/cuenta-resumen?id_empresa=001&numero_cuenta=100-001-99', { userId: 3 });
            assert.equal(rMovs.status, 200);
            assert.equal(rMovs.data.cuenta_id, 1);

            const rDenied = await requestJson('GET', '/api/cheques/cuenta-resumen/1', { userId: 4 });
            assert.equal(rDenied.status, 403);
        });

        it('POST /api/cheques avanza talonario y retorna talonario_alerta cuando el stock es bajo', async () => {
            // Talonario actual: desde 5001, hasta 5015, siguiente 5005, alerta <= 10.
            // Emitiendo 5005 -> nuevo siguiente 5006 -> restantes = 5015 - 5006 + 1 = 10 -> dispara alerta!
            const createRes = await requestJson('POST', '/api/cheques', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-22',
                    cheque: '5005',
                    valor: 320,
                    a_nombre: 'PROVEEDOR TALONARIO',
                    concepto: 'PRUEBA TALONARIO'
                }
            });
            assert.equal(createRes.status, 201);
            assert.equal(createRes.data.chequera_id, 1);
            assert.ok(createRes.data.talonario_alerta);
            assert.equal(createRes.data.talonario_alerta.restantes, 10);
            assert.equal(mockDb.getState().chequeras[0].siguiente_correlativo, 5006);
        });

        it('POST /registrar-impresion-lote y /:id/registrar-impresion auditan impresión y advierten reimpresión', async () => {
            // Primera impresión individual en cheque 10
            const print1 = await requestJson('POST', '/api/cheques/10/registrar-impresion', { userId: 5 });
            assert.equal(print1.status, 200);
            assert.equal(print1.data.veces_impreso, 1);
            assert.equal(print1.data.es_reimpresion, false);
            assert.equal(print1.data.advertencia_reimpresion, null);

            // Impresión en lote de [10, 11] (10 es reimpresión #2, 11 es 1ra impresión; ruta no eclipsada por /:id)
            const loteRes = await requestJson('POST', '/api/cheques/registrar-impresion-lote', {
                userId: 5,
                body: { ids: [10, 11], formato_id: 1 }
            });
            assert.equal(loteRes.status, 200);
            assert.equal(loteRes.data.total_registrados, 2);
            assert.equal(loteRes.data.tiene_reimpresiones, true);
            assert.equal(loteRes.data.reimpresiones_count, 1);
            assert.ok(loteRes.data.advertencia_reimpresion.includes('#5001'));

            const auditActions = mockDb.getState().bancos_auditoria_detalle.map(a => a.accion);
            assert.ok(auditActions.includes('PRINT_CHEQUE'));
            assert.ok(auditActions.includes('REPRINT_CHEQUE'));
        });

        it('POST /contado/generar permite pago cross-empresa y POST /contado/marcar-emitido guarda nombre real del proveedor', async () => {
            // Solicitud de estación 002 pagada con cuenta 1 de empresa 001 -> no retorna 404
            const genRes = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                body: {
                    llave: 'SOL-002-1',
                    estacion_solicitud: '002',
                    cuenta_bancaria_id: 1,
                    cheque_num: '5006',
                    fecha: '2026-10-23',
                    valor: 275.50,
                    a_nombre: 'DISTRIBUIDORA DEL SUR S.A.',
                    concepto: 'PAGO CONTADO'
                }
            });
            assert.equal(genRes.status, 200);
            assert.ok(genRes.data.llaveCheque);
            assert.equal(mockDb.getState().solicitud_chq_contado[0].num_cheque, '5006');
            const createdGen = mockDb.getState().cheques.find(c => c.cheque === '5006');
            assert.equal(createdGen.empresa_id, 1);

            // Marcar emitido con idempotencia, empresa dueña de cuenta_bancaria_id=1 (empresa 1), y nombre real desde proveedores
            const idemKey = 'idem-contado-marcar-1';
            const markRes = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                headers: { 'X-Idempotency-Key': idemKey },
                body: {
                    llave: 'SOL-002-2',
                    estacion_solicitud: '002',
                    cheque_num: '5007',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true
                }
            });
            assert.equal(markRes.status, 200);
            assert.equal(markRes.data.success, true);

            const createdMark = mockDb.getState().cheques.find(c => c.cheque === '5007');
            assert.equal(createdMark.empresa_id, 1);
            assert.equal(createdMark.a_nombre, 'TRANSPORTES EL SALVADOR LTDA.');

            // Replay idempotente
            const replayRes = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                headers: { 'X-Idempotency-Key': idemKey },
                body: {
                    llave: 'SOL-002-2',
                    estacion_solicitud: '002',
                    cheque_num: '5007',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true
                }
            });
            assert.equal(replayRes.status, 200);
            assert.equal(replayRes.data.llaveCheque, markRes.data.llaveCheque);

            // Solicitud inexistente retorna 404
            const missingRes = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                body: { llave: 'NO-EXISTE', estacion_solicitud: '002', cheque_num: '5099' }
            });
            assert.equal(missingRes.status, 404);
        });

        it('POST /contado/generar repite respuesta 200 con X-Idempotency-Key sin duplicar cheques y rechaza 409 con otra clave o sin clave', async () => {
            const genKey = 'idem-contado-generar-1';
            const payload = {
                llave: 'SOL-002-1',
                estacion_solicitud: '002',
                cuenta_bancaria_id: 1,
                cheque_num: '5006',
                fecha: '2026-10-23',
                valor: 275.50,
                a_nombre: 'DISTRIBUIDORA DEL SUR S.A.',
                concepto: 'PAGO CONTADO IDEM'
            };

            const firstRes = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': genKey },
                body: payload
            });
            assert.equal(firstRes.status, 200);
            assert.ok(firstRes.data.llaveCheque);
            assert.equal(mockDb.getState().solicitud_chq_contado[0].num_cheque, '5006');
            assert.equal(mockDb.getState().cheques.filter(c => c.cheque === '5006').length, 1);

            // Reintento inmediato con el mismo X-Idempotency-Key -> replay 200 sin 409 ni duplicados
            const retryRes = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': genKey },
                body: payload
            });
            assert.equal(retryRes.status, 200);
            assert.equal(retryRes.data.llaveCheque, firstRes.data.llaveCheque);
            assert.equal(retryRes.data.id, firstRes.data.id);
            assert.equal(mockDb.getState().cheques.filter(c => c.cheque === '5006').length, 1);

            // Petición con diferente X-Idempotency-Key sobre la solicitud ya asignada -> 409
            const diffKeyRes = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'idem-contado-generar-other' },
                body: { ...payload, cheque_num: '5007' }
            });
            assert.equal(diffKeyRes.status, 409);

            // Petición sin X-Idempotency-Key sobre la solicitud ya asignada -> 409
            const noKeyRes = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                body: { ...payload, cheque_num: '5008' }
            });
            assert.equal(noKeyRes.status, 409);
            assert.equal(mockDb.getState().cheques.filter(c => ['5006', '5007', '5008'].includes(c.cheque)).length, 1);
        });

        it('POST /contado/marcar-emitido y /contado/generar sanean a_nombre solo espacios y hacen fallback a cod_proveedor', async () => {
            // Proveedor con nombre en blanco ('   ') + a_nombre solo espacios ('   ') -> debe guardar cod_proveedor ('PROV-77')
            mockDb.getState().proveedores[0].nombre = '   ';
            const markBlankRes = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                body: {
                    llave: 'SOL-002-1',
                    estacion_solicitud: '002',
                    cheque_num: '5009',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true,
                    a_nombre: '   '
                }
            });
            assert.equal(markBlankRes.status, 200);
            const chqBlank = mockDb.getState().cheques.find(c => c.cheque === '5009');
            assert.equal(chqBlank.a_nombre, 'PROV-77');

            // Proveedor con nombre null + a_nombre solo espacios ('   ') -> debe guardar cod_proveedor ('PROV-88')
            mockDb.getState().proveedores[1].nombre = null;
            const markNullRes = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                body: {
                    llave: 'SOL-002-2',
                    estacion_solicitud: '002',
                    cheque_num: '5010',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true,
                    a_nombre: '   '
                }
            });
            assert.equal(markNullRes.status, 200);
            const chqNull = mockDb.getState().cheques.find(c => c.cheque === '5010');
            assert.equal(chqNull.a_nombre, 'PROV-88');

            // Solicitud nueva en /contado/generar con a_nombre solo espacios no almacena espacios en blanco
            mockDb.getState().solicitud_chq_contado.push({
                llave: 'SOL-002-3',
                id_empresa: '002',
                fecha: '2026-10-24',
                cod_proveedor: 'PROV-99',
                monto: 150.00,
                num_cheque: '',
                llave_cheque: ''
            });
            const genBlankRes = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                body: {
                    llave: 'SOL-002-3',
                    estacion_solicitud: '002',
                    cuenta_bancaria_id: 1,
                    cheque_num: '5011',
                    fecha: '2026-10-24',
                    valor: 150.00,
                    a_nombre: '   ',
                    concepto: 'PAGO CONTADO'
                }
            });
            assert.equal(genBlankRes.status, 200);
            const chqGenBlank = mockDb.getState().cheques.find(c => c.cheque === '5011');
            assert.equal(chqGenBlank.a_nombre, '');
        });

        it('limpia claves de idempotencia pendientes tras errores (400/404/409/423) y permite reintentar con el mismo X-Idempotency-Key en los 3 endpoints', async () => {
            // 1) POST /api/cheques: 400 (cuenta inactiva/inexistente) -> retry 201 con misma clave
            const postKey400 = 'idem-post-recover-400';
            const postFail400 = await requestJson('POST', '/api/cheques', {
                userId: 2,
                headers: { 'X-Idempotency-Key': postKey400 },
                body: {
                    cuenta_bancaria_id: 999,
                    fecha: '2026-10-25',
                    cheque: '5020',
                    valor: 125.00,
                    a_nombre: 'BENEFICIARIO RETRY',
                    concepto: 'RETRY 400'
                }
            });
            assert.equal(postFail400.status, 400);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === postKey400).length, 0);

            const postRetryOk = await requestJson('POST', '/api/cheques', {
                userId: 2,
                headers: { 'X-Idempotency-Key': postKey400 },
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-25',
                    cheque: '5020',
                    valor: 125.00,
                    a_nombre: 'BENEFICIARIO RETRY',
                    concepto: 'RETRY 400'
                }
            });
            assert.equal(postRetryOk.status, 201);
            assert.ok(postRetryOk.data.llave);

            // POST /api/cheques: 423 (período cerrado) y 409 (cheque duplicado) -> cleanup y retry 201
            mockDb.getState().conciliacion_periodos.push({
                id: 1,
                cuenta_bancaria_id: 1,
                fecha_corte: '2026-10-26',
                estado: 'CERRADO'
            });
            const postKey423 = 'idem-post-recover-423';
            const postFail423 = await requestJson('POST', '/api/cheques', {
                userId: 2,
                headers: { 'X-Idempotency-Key': postKey423 },
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-25',
                    cheque: '5021',
                    valor: 80.00,
                    a_nombre: 'BENEFICIARIO 423',
                    concepto: 'RETRY 423'
                }
            });
            assert.equal(postFail423.status, 423);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === postKey423).length, 0);
            mockDb.getState().conciliacion_periodos = [];

            const postKey409 = 'idem-post-recover-409';
            const postFail409 = await requestJson('POST', '/api/cheques', {
                userId: 2,
                headers: { 'X-Idempotency-Key': postKey409 },
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-27',
                    cheque: '5020',
                    valor: 80.00,
                    a_nombre: 'BENEFICIARIO 409',
                    concepto: 'RETRY 409'
                }
            });
            assert.equal(postFail409.status, 409);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === postKey409).length, 0);

            const postRetryAfter409 = await requestJson('POST', '/api/cheques', {
                userId: 2,
                headers: { 'X-Idempotency-Key': postKey409 },
                body: {
                    cuenta_bancaria_id: 1,
                    fecha: '2026-10-27',
                    cheque: '5022',
                    valor: 80.00,
                    a_nombre: 'BENEFICIARIO 409',
                    concepto: 'RETRY 409'
                }
            });
            assert.equal(postRetryAfter409.status, 201);

            // 2) POST /api/cheques/contado/generar: 404 (solicitud inexistente) y 400 (cuenta inactiva) -> retry 200 con misma clave
            const genKey404 = 'idem-gen-recover-404';
            const genFail404 = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': genKey404 },
                body: {
                    llave: 'SOL-NO-EXISTE',
                    estacion_solicitud: '002',
                    cuenta_bancaria_id: 1,
                    cheque_num: '5023',
                    fecha: '2026-10-27',
                    valor: 275.50,
                    a_nombre: 'PROVEEDOR CONTADO',
                    concepto: 'PAGO CONTADO'
                }
            });
            assert.equal(genFail404.status, 404);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === genKey404).length, 0);

            const genRetryAfter404 = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': genKey404 },
                body: {
                    llave: 'SOL-002-1',
                    estacion_solicitud: '002',
                    cuenta_bancaria_id: 999,
                    cheque_num: '5023',
                    fecha: '2026-10-27',
                    valor: 275.50,
                    a_nombre: 'PROVEEDOR CONTADO',
                    concepto: 'PAGO CONTADO'
                }
            });
            assert.equal(genRetryAfter404.status, 400);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === genKey404).length, 0);

            const genRetryOk = await requestJson('POST', '/api/cheques/contado/generar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': genKey404 },
                body: {
                    llave: 'SOL-002-1',
                    estacion_solicitud: '002',
                    cuenta_bancaria_id: 1,
                    cheque_num: '5023',
                    fecha: '2026-10-27',
                    valor: 275.50,
                    a_nombre: 'PROVEEDOR CONTADO',
                    concepto: 'PAGO CONTADO'
                }
            });
            assert.equal(genRetryOk.status, 200);
            assert.ok(genRetryOk.data.llaveCheque);

            // 3) POST /api/cheques/contado/marcar-emitido: 404 -> 400 -> 423 -> 409 -> retry 200 con misma clave, y replay 200 incluso si externalDb falla
            const markKey = 'idem-marcar-recover-all';
            const markFail404 = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                headers: { 'X-Idempotency-Key': markKey },
                body: {
                    llave: 'SOL-INEXISTENTE',
                    estacion_solicitud: '002',
                    cheque_num: '5024',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true
                }
            });
            assert.equal(markFail404.status, 404);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === markKey).length, 0);

            const markFail400 = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                headers: { 'X-Idempotency-Key': markKey },
                body: {
                    llave: 'SOL-002-2',
                    estacion_solicitud: '002',
                    cheque_num: '5024',
                    cuenta_bancaria_id: 999,
                    registrar_en_bancos: true
                }
            });
            assert.equal(markFail400.status, 400);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === markKey).length, 0);

            mockDb.getState().conciliacion_periodos.push({
                id: 2,
                cuenta_bancaria_id: 1,
                fecha_corte: '2026-10-31',
                estado: 'CERRADO'
            });
            const markFail423 = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                headers: { 'X-Idempotency-Key': markKey },
                body: {
                    llave: 'SOL-002-2',
                    estacion_solicitud: '002',
                    cheque_num: '5024',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true
                }
            });
            assert.equal(markFail423.status, 423);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === markKey).length, 0);
            mockDb.getState().conciliacion_periodos = [];

            const markFail409 = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                headers: { 'X-Idempotency-Key': markKey },
                body: {
                    llave: 'SOL-002-2',
                    estacion_solicitud: '002',
                    cheque_num: '5023',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true
                }
            });
            assert.equal(markFail409.status, 409);
            assert.equal(mockDb.getState().bancos_idempotency_keys.filter(r => r.idempotency_key === markKey).length, 0);

            const markRetryOk = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                headers: { 'X-Idempotency-Key': markKey },
                body: {
                    llave: 'SOL-002-2',
                    estacion_solicitud: '002',
                    cheque_num: '5024',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true
                }
            });
            assert.equal(markRetryOk.status, 200);
            assert.equal(markRetryOk.data.success, true);
            assert.ok(markRetryOk.data.llaveCheque);

            // Simular caída de externalDb en el replay idempotente -> debe responder 200 desde bancos_idempotency_keys
            mockDb.getState().externalDbThrows = true;
            const markReplayWhenExternalDown = await requestJson('POST', '/api/cheques/contado/marcar-emitido', {
                userId: 2,
                headers: { 'X-Idempotency-Key': markKey },
                body: {
                    llave: 'SOL-002-2',
                    estacion_solicitud: '002',
                    cheque_num: '5024',
                    cuenta_bancaria_id: 1,
                    registrar_en_bancos: true
                }
            });
            assert.equal(markReplayWhenExternalDown.status, 200);
            assert.equal(markReplayWhenExternalDown.data.llaveCheque, markRetryOk.data.llaveCheque);
            assert.equal(mockDb.getState().cheques.filter(c => c.cheque === '5024').length, 1);
        });

        it('GET /api/check-designer/formats parsea design_json y conserva RBAC', async () => {
            const res = await requestJson('GET', '/api/check-designer/formats', { userId: 5 });
            assert.equal(res.status, 200);
            assert.equal(typeof res.data[0].design_json, 'object');
            assert.equal(res.data[0].design_json.elements[0].id, 'payee');
        });
    });

    describe('6. Contratos Estáticos en server.js y db.js', () => {
        it('server.js mantiene prefijos de 20MB, aiLimiter y Socket.io perm_bancos actualizados', () => {
            const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
            for (const prefix of [
                "'/api/operaciones/recordatorios'",
                "'/api/bancos/movimientos'",
                "'/api/bancos/cheques'",
                "'/api/cheques'",
                "'/api/bancos/conciliacion/importar-pdf'",
                "'/api/bancos/conciliacion/parse-extracto-pdf'"
            ]) {
                assert.ok(serverSrc.includes(prefix), `Falta prefijo ${prefix} en server.js`);
            }
            assert.ok(serverSrc.includes("app.use('/api/bancos/movimientos/analizar-comprobante', aiLimiter)"));
            assert.ok(serverSrc.includes("app.use('/api/bancos/conciliacion/parse-extracto-pdf', aiLimiter)"));
            assert.ok(serverSrc.includes("app.use('/api/bancos/conciliacion/importar-pdf', aiLimiter)"));
            assert.ok(serverSrc.includes("'manage_chequeras'"));
        });

        it('db.js declara tablas F2/F3, columnas de impresión y permisos en permissionsList y bancosPerms', () => {
            const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
            for (const token of [
                'CREATE TABLE IF NOT EXISTS chequeras',
                'CREATE TABLE IF NOT EXISTS conciliacion_reglas_clasificacion',
                'CREATE TABLE IF NOT EXISTS conciliacion_cruces',
                'CREATE TABLE IF NOT EXISTS conciliacion_cruce_items',
                'CREATE TABLE IF NOT EXISTS movimientos_bancarios_comprobantes',
                "'impreso_at'",
                "'impreso_por'",
                "'veces_impreso'",
                "'chequera_id'",
                "'comprobante_url'",
                "'manage_chequeras'",
                "'manage_conciliacion_reglas'",
                "'manage_cheques_contado'",
                "'manage_check_designer'"
            ]) {
                assert.ok(dbSrc.includes(token), `Falta ${token} en db.js`);
            }
        });
    });
});
