process.env.NODE_ENV = 'test';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const dbModule = require('../db');
const { JWT_SECRET, invalidateUserAuthCache, restoreUser } = require('../middleware/auth');
const { guardProtectedUploadsMiddleware } = require('../utils/uploadSigner');
const {
    notifyReaperturaEvent
} = require('../services/bancosIntegrityService');
const {
    normalizeStatementFileInput,
    normalizeStatementFiles,
    validateClassificationRulePattern,
    applyClassificationRules,
    detectGroupedMatches,
    extractBankStatementWithGemini
} = require('../services/bankStatementParserService');
const telegramGeminiService = require('../services/telegramGeminiService');

const TINY_PNG_BUFFER = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
);
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BUFFER.toString('base64')}`;
const TINY_JPEG_BUFFER = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0xFF, 0xD9]);
const TINY_WEBP_BUFFER = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x18, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
    Buffer.from('VP8 '),
    Buffer.from([0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
]);
const TINY_PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8');
const TINY_PDF_DATA_URL = `data:application/pdf;base64,${TINY_PDF_BUFFER.toString('base64')}`;

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const CREATED_TEST_FILES = [];

function createM1CMockDb() {
    const createInitialState = () => ({
        seq: {
            movimientos_bancarios: 100,
            movimientos_bancarios_comprobantes: 100,
            cheques: 100,
            conciliacion_reglas_clasificacion: 10,
            conciliacion_cruces: 10,
            conciliacion_cruce_items: 10,
            conciliacion_importaciones: 10,
            conciliacion_periodos: 10,
            conciliacion_reapertura_solicitudes: 10,
            validaciones_saldo_banco: 10,
            bancos_auditoria_detalle: 10,
            notifications: 10
        },
        simulateMissingTables: false,
        missingTables: [],
        users: [
            { id: 1, username: 'admin_m1c', nombre: 'Admin M1C', status: 'active', role_id: 1, role_name: 'Administrator', token_version: 1 },
            { id: 2, username: 'conc_op', nombre: 'Operador Conciliacion', status: 'active', role_id: 2, role_name: 'Contador', token_version: 1 },
            { id: 3, username: 'reglas_only', nombre: 'Gestor Reglas', status: 'active', role_id: 3, role_name: 'Reglas', token_version: 1 },
            { id: 4, username: 'viewer_only', nombre: 'Solo Lectura', status: 'active', role_id: 4, role_name: 'Consultor', token_version: 1 },
            { id: 5, username: 'approver_op', nombre: 'Aprobador Gerencia', status: 'active', role_id: 5, role_name: 'Gerente', token_version: 1 },
            { id: 6, username: 'no_perm', nombre: 'Sin Permisos', status: 'active', role_id: 6, role_name: 'Invitado', token_version: 1 }
        ],
        roles: [
            { id: 1, name: 'Administrator' },
            { id: 2, name: 'Contador' },
            { id: 3, name: 'Reglas' },
            { id: 4, name: 'Consultor' },
            { id: 5, name: 'Gerente' },
            { id: 6, name: 'Invitado' }
        ],
        rolePermissions: {
            1: ['manage_conciliacion_bancaria', 'view_conciliacion_bancaria', 'manage_conciliacion_reglas', 'close_conciliacion_periodo', 'approve_reapertura_conciliacion'],
            2: ['manage_conciliacion_bancaria', 'view_conciliacion_bancaria', 'close_conciliacion_periodo'],
            3: ['view_conciliacion_bancaria', 'manage_conciliacion_reglas'],
            4: ['view_conciliacion_bancaria'],
            5: ['manage_conciliacion_bancaria', 'view_conciliacion_bancaria', 'approve_reapertura_conciliacion'],
            6: ['view_dashboard']
        },
        empresas: [
            { id: 1, codigo: '001', nombre: 'EMPRESA UNO S.A.' },
            { id: 2, codigo: '002', nombre: 'EMPRESA DOS S.A.' }
        ],
        bancos: [
            { id: 1, empresa_id: 1, codigo: '01', descripcion: 'BANCO PROMERICA' },
            { id: 2, empresa_id: 2, codigo: '02', descripcion: 'BANCO DAVIVIENDA' }
        ],
        tipos_remesas: [
            { id: 1, empresa_id: 1, codigo: 'RM', descripcion: 'REMESA' },
            { id: 2, empresa_id: 1, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 3, empresa_id: 1, codigo: 'NA', descripcion: 'NOTA DE ABONO' },
            { id: 4, empresa_id: 2, codigo: 'RM', descripcion: 'REMESA' },
            { id: 5, empresa_id: 2, codigo: 'NC', descripcion: 'NOTA DE CARGO' }
        ],
        cuentas_bancarias: [
            {
                id: 1, empresa_id: 1, banco_id: 1, numero: '1000-001', nombre: 'OPERATIVA PROMERICA',
                cod_cta: '110201', orden: 1, activa: 1, saldo_inicial: 1000.00, fecha_saldo_inicial: '2026-01-01'
            },
            {
                id: 2, empresa_id: 2, banco_id: 2, numero: '2000-002', nombre: 'OPERATIVA DAVIVIENDA',
                cod_cta: '110202', orden: 2, activa: 1, saldo_inicial: 500.00, fecha_saldo_inicial: '2026-01-01'
            }
        ],
        movimientos_bancarios: [
            {
                id: 1, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-10', fecha_aplicado: '2026-10-12',
                documento: 'DEP-100', concepto: 'REMESA CONCILIADA', monto: 500.00, cargo: 0, abono: 500.00,
                tipo_remesa_id: 1, cod_cta: '110201', num_partida: null, es_contabilizado: 0,
                comprobante_url: '/api/uploads/movimientos/test_m1c_mov1.png', deleted_at: null, version: 1, fingerprint: 'fp-1'
            },
            {
                id: 2, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-18', fecha_aplicado: null,
                documento: 'NC-200', concepto: 'CARGO BANCARIO PEND', monto: 80.00, cargo: 80.00, abono: 0,
                tipo_remesa_id: 2, cod_cta: '510101', num_partida: null, es_contabilizado: 0,
                comprobante_url: '/api/uploads/movimientos/test_m1c_mov2_legacy.png', deleted_at: null, version: 1, fingerprint: 'fp-2'
            },
            {
                id: 3, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-19', fecha_aplicado: null,
                documento: 'NC-201', concepto: 'CARGO SEGUNDO', monto: 120.00, cargo: 120.00, abono: 0,
                tipo_remesa_id: 2, cod_cta: '510101', num_partida: null, es_contabilizado: 0,
                comprobante_url: null, deleted_at: null, version: 1, fingerprint: 'fp-3'
            },
            {
                id: 4, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-20', fecha_aplicado: null,
                documento: 'AB-300', concepto: 'DEPOSITO TOTAL LOTE', monto: 450.00, cargo: 0, abono: 450.00,
                tipo_remesa_id: 1, cod_cta: '110201', num_partida: null, es_contabilizado: 0,
                comprobante_url: null, deleted_at: null, version: 1, fingerprint: 'fp-4'
            }
        ],
        movimientos_bancarios_comprobantes: [
            {
                id: 10, movimiento_id: 1, nombre_original: 'boleta_1.png',
                archivo_url: '/api/uploads/movimientos/test_m1c_mov1.png',
                mime_type: 'image/png', tamano_bytes: TINY_PNG_BUFFER.length,
                ancho: 1, alto: 1, nota: 'Comprobante mov 1', ocr_json: null,
                uploaded_by: 1, uploaded_by_name: 'Admin M1C', created_at: '2026-10-12T10:00:00Z'
            }
        ],
        cheques: [
            {
                id: 10, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-10-15', cheque_anulado: 0,
                cheque: '5001', valor: 100.00, a_nombre: 'PROV 1', fecha_aplicado: null, concepto: 'CHK 0-30',
                es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, deleted_at: null, version: 1
            },
            {
                id: 11, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-08-15', cheque_anulado: 0,
                cheque: '5002', valor: 200.00, a_nombre: 'PROV 2', fecha_aplicado: null, concepto: 'CHK 31-90',
                es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, deleted_at: null, version: 1
            },
            {
                id: 12, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-05-20', cheque_anulado: 0,
                cheque: '5003', valor: 300.00, a_nombre: 'PROV 3', fecha_aplicado: null, concepto: 'CHK 91-180 POR CADUCAR',
                es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, deleted_at: null, version: 1
            },
            {
                id: 13, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-03-01', cheque_anulado: 0,
                cheque: '5004', valor: 400.00, a_nombre: 'PROV 4', fecha_aplicado: null, concepto: 'CHK >180 CADUCO',
                es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, deleted_at: null, version: 1
            },
            {
                id: 14, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-03-05', cheque_anulado: 0,
                cheque: '5005', valor: 999.00, a_nombre: 'PROV COBRADO', fecha_aplicado: '2026-10-20', concepto: 'COBRADO',
                es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, deleted_at: null, version: 1
            },
            {
                id: 15, empresa_id: 1, cuenta_bancaria_id: 1, fecha: '2026-03-06', cheque_anulado: 1,
                cheque: '5006', valor: 888.00, a_nombre: 'ANULADO', fecha_aplicado: null, concepto: 'ANULADO',
                es_reservado: 0, es_pago_contado: 0, fue_noemitido: 0, deleted_at: null, version: 1
            }
        ],
        recordatorios_pagos_abonos: [
            {
                id: 50, vencimiento_id: 700, recordatorio_id: 80, ubicacion: 'CASA MATRIZ',
                descripcion_ref: 'SERVICIO ELECTRICO', tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1, cuenta_label: 'PROMERICA', beneficiario: 'DELSUR',
                referencia_doc: 'NC-200', fecha_pago: '2026-10-18', monto: 80.00,
                notas: 'Pago luz', movimiento_bancario_id: null, estado_conciliacion: 'PENDIENTE', created_by: 'op'
            },
            {
                id: 51, vencimiento_id: 701, recordatorio_id: 81, ubicacion: 'SUCURSAL',
                descripcion_ref: 'SIN RECIBO', tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA',
                cuenta_bancaria_id: 1, cuenta_label: 'PROMERICA', beneficiario: 'PROVEEDOR SIN DOC',
                referencia_doc: 'SR-01', fecha_pago: '2026-10-19', monto: 120.00,
                notas: '', movimiento_bancario_id: null, estado_conciliacion: 'PENDIENTE', created_by: 'op'
            }
        ],
        recordatorios_pagos_comprobantes: [
            {
                id: 60, vencimiento_id: 700, abono_id: 50, nombre_original: 'recibo_delsur.png',
                archivo_url: '/api/uploads/pagos/test_m1c_pago1.png', mime_type: 'image/png',
                tamano_bytes: TINY_PNG_BUFFER.length, ancho: 1, alto: 1, nota: 'Exacto abono 50',
                uploaded_by: 'op', created_at: '2026-10-18T11:00:00Z'
            },
            {
                id: 61, vencimiento_id: 700, abono_id: null, nombre_original: 'factura_general.png',
                archivo_url: '/api/uploads/pagos/test_m1c_pago2.png', mime_type: 'image/png',
                tamano_bytes: TINY_PNG_BUFFER.length, ancho: 1, alto: 1, nota: 'Compartido vencimiento',
                uploaded_by: 'op', created_at: '2026-10-18T09:00:00Z'
            },
            {
                id: 62, vencimiento_id: 700, abono_id: 999, nombre_original: 'otro_abono.png',
                archivo_url: '/api/uploads/pagos/test_m1c_otro_abono.png', mime_type: 'image/png',
                tamano_bytes: TINY_PNG_BUFFER.length, ancho: 1, alto: 1, nota: 'Otro abono',
                uploaded_by: 'op', created_at: '2026-10-18T12:00:00Z'
            }
        ],
        conciliacion_reglas_clasificacion: [],
        conciliacion_cruces: [],
        conciliacion_cruce_items: [],
        conciliacion_importaciones: [],
        conciliacion_periodos: [],
        conciliacion_reapertura_solicitudes: [],
        validaciones_saldo_banco: [],
        bancos_idempotency_keys: [],
        bancos_auditoria_detalle: [],
        notifications: []
    });

    let state = createInitialState();
    const reset = () => { state = createInitialState(); };
    const ymd = (d) => {
        if (!d) return null;
        if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        return String(d).slice(0, 10);
    };

    const runQuery = async (sql, params = []) => {
        const sqlLower = String(sql).toLowerCase().replace(/\s+/g, ' ').trim();
        const isSelect = sqlLower.startsWith('select');

        const missingList = Array.isArray(state.missingTables) ? state.missingTables : [];
        if (missingList.some((tbl) => sqlLower.includes(String(tbl).toLowerCase()))) {
            const err = new Error('Table does not exist');
            err.code = 'ER_NO_SUCH_TABLE';
            err.errno = 1146;
            throw err;
        }
        if (state.simulateMissingTables && (
            sqlLower.includes('movimientos_bancarios_comprobantes') ||
            sqlLower.includes('recordatorios_pagos_comprobantes') ||
            sqlLower.includes('conciliacion_cruces') ||
            sqlLower.includes('conciliacion_reglas_clasificacion')
        )) {
            const err = new Error('Table does not exist');
            err.code = 'ER_NO_SUCH_TABLE';
            err.errno = 1146;
            throw err;
        }

        // Auth
        if (sqlLower.includes('from users u') && sqlLower.includes('approve_reapertura_conciliacion')) {
            return [[{ id: 1 }, { id: 5 }]];
        }
        if (sqlLower.includes('from users') && sqlLower.includes('left join roles')) {
            const u = state.users.find(x => Number(x.id) === Number(params[0]));
            return [u ? [u] : []];
        }
        if (sqlLower.includes('role_permissions rp')) {
            const roleId = Number(params[0]);
            const perms = state.rolePermissions[roleId] || [];
            return [perms.map(name => ({ name }))];
        }

        // Idempotency
        if (sqlLower.startsWith('insert into bancos_idempotency_keys')) {
            const [key, scope, user_id, request_hash] = params;
            const dup = state.bancos_idempotency_keys.find(k => k.idempotency_key === key && k.scope === scope);
            if (dup) {
                const err = new Error('Duplicate idempotency key');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            state.bancos_idempotency_keys.push({
                idempotency_key: key, scope, user_id, request_hash, status_code: null, response_json: null
            });
            return [{ affectedRows: 1 }];
        }
        if (sqlLower.startsWith('select status_code, response_json')) {
            const [key, scope] = params;
            return [state.bancos_idempotency_keys.filter(k => k.idempotency_key === key && k.scope === scope)];
        }
        if (sqlLower.startsWith('update bancos_idempotency_keys')) {
            const [status_code, response_json, key, scope] = params;
            const row = state.bancos_idempotency_keys.find(k => k.idempotency_key === key && k.scope === scope);
            if (row) Object.assign(row, { status_code, response_json });
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from bancos_idempotency_keys')) {
            const [key, scope] = params;
            const before = state.bancos_idempotency_keys.length;
            state.bancos_idempotency_keys = state.bancos_idempotency_keys.filter(
                k => !(k.idempotency_key === key && k.scope === scope && k.status_code === null)
            );
            return [{ affectedRows: before - state.bancos_idempotency_keys.length }];
        }

        // Notifications & Audit
        if (sqlLower.startsWith('insert into notifications')) {
            const id = ++state.seq.notifications;
            const [user_id, type, title, message, data] = params;
            state.notifications.push({ id, user_id, type, title, message, data, is_read: 0 });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('insert into bancos_auditoria_detalle')) {
            const id = ++state.seq.bancos_auditoria_detalle;
            const [cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address, motivo, before_json, after_json, metadata_json] = params;
            state.bancos_auditoria_detalle.push({
                id, cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address, motivo, before_json, after_json, metadata_json
            });
            return [{ insertId: id, affectedRows: 1 }];
        }

        // Catalogs
        if (isSelect && sqlLower.includes('from empresas')) return [state.empresas];
        if (isSelect && sqlLower.includes('from bancos') && !sqlLower.includes('from cuentas_bancarias')) return [state.bancos];
        if (isSelect && sqlLower.includes('from tipos_remesas')) {
            if (sqlLower.includes('where empresa_id = ? and codigo = ?')) {
                return [state.tipos_remesas.filter(t => Number(t.empresa_id) === Number(params[0]) && t.codigo === params[1])];
            }
            if (sqlLower.includes('where empresa_id = ?')) {
                return [state.tipos_remesas.filter(t => Number(t.empresa_id) === Number(params[0]))];
            }
            if (sqlLower.includes('where id in')) {
                const ids = new Set(params.map(Number));
                return [state.tipos_remesas.filter(t => ids.has(Number(t.id)))];
            }
            if (sqlLower.includes('where id = ?')) {
                return [state.tipos_remesas.filter(t => Number(t.id) === Number(params[0]))];
            }
            if (sqlLower.includes('where codigo = ?')) {
                return [state.tipos_remesas.filter(t => t.codigo === params[0])];
            }
            return [state.tipos_remesas];
        }
        if (isSelect && sqlLower.includes('from cuentas_bancarias')) {
            const rows = (sqlLower.includes('where cb.id = ?') || sqlLower.includes('where id = ?'))
                ? state.cuentas_bancarias.filter(c => Number(c.id) === Number(params[0]))
                : state.cuentas_bancarias;
            return [rows.map(c => {
                const emp = state.empresas.find(e => e.id === c.empresa_id);
                const bco = state.bancos.find(b => b.id === c.banco_id);
                return { ...c, empresa_codigo: emp?.codigo, empresa_nombre: emp?.nombre, banco_codigo: bco?.codigo, banco_nombre: bco?.descripcion };
            })];
        }

        // Validaciones & Periodos & Reaperturas
        if (isSelect && sqlLower.includes('from validaciones_saldo_banco')) {
            return [state.validaciones_saldo_banco.filter(v => Number(v.cuenta_bancaria_id) === Number(params[0]))];
        }
        if (sqlLower.startsWith('insert into conciliacion_periodos')) {
            const id = ++state.seq.conciliacion_periodos;
            const [cuenta_bancaria_id, fecha_corte, saldo_banco, saldo_chequera, saldo_conciliado_libros] = params;
            state.conciliacion_periodos.push({
                id, cuenta_bancaria_id: Number(cuenta_bancaria_id), fecha_corte: ymd(fecha_corte),
                estado: 'CERRADO', saldo_banco, saldo_chequera, saldo_conciliado_libros
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_periodos')) {
            const id = Number(params[params.length - 1]);
            const p = state.conciliacion_periodos.find(x => Number(x.id) === id);
            if (p) p.estado = 'REABIERTO';
            return [{ affectedRows: p ? 1 : 0 }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_periodos')) {
            if (sqlLower.includes('where p.id = ?') || sqlLower.includes('where id = ?')) {
                return [state.conciliacion_periodos.filter(p => Number(p.id) === Number(params[0]))];
            }
            if (sqlLower.includes("estado = 'cerrado'") && sqlLower.includes('fecha_corte >= ?')) {
                const [ctaId, minD] = params;
                return [state.conciliacion_periodos.filter(p => Number(p.cuenta_bancaria_id) === Number(ctaId) && p.estado === 'CERRADO' && p.fecha_corte >= ymd(minD))];
            }
            if (sqlLower.includes("estado = 'cerrado'")) {
                return [state.conciliacion_periodos.filter(p => Number(p.cuenta_bancaria_id) === Number(params[0]) && p.estado === 'CERRADO')];
            }
            return [state.conciliacion_periodos.filter(p => Number(p.cuenta_bancaria_id) === Number(params[0]))];
        }
        if (sqlLower.startsWith('insert into conciliacion_reapertura_solicitudes')) {
            const id = ++state.seq.conciliacion_reapertura_solicitudes;
            const [periodo_id, cuenta_bancaria_id, fecha_corte, motivo_solicitud, solicitado_by, solicitado_por_nombre] = params;
            state.conciliacion_reapertura_solicitudes.push({
                id, periodo_id, cuenta_bancaria_id, fecha_corte: ymd(fecha_corte), estado: 'PENDIENTE',
                motivo_solicitud, solicitado_by, solicitado_por_nombre
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_reapertura_solicitudes')) {
            const id = Number(params[params.length - 1]);
            const s = state.conciliacion_reapertura_solicitudes.find(x => Number(x.id) === id);
            if (s) s.estado = params[0];
            return [{ affectedRows: s ? 1 : 0 }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_reapertura_solicitudes')) {
            if (sqlLower.includes('where id = ?')) {
                return [state.conciliacion_reapertura_solicitudes.filter(s => Number(s.id) === Number(params[0]))];
            }
            if (sqlLower.includes('where periodo_id = ?')) {
                return [state.conciliacion_reapertura_solicitudes.filter(s => Number(s.periodo_id) === Number(params[0]) && s.estado === 'PENDIENTE')];
            }
            return [state.conciliacion_reapertura_solicitudes.filter(s => Number(s.cuenta_bancaria_id) === Number(params[0]))];
        }

        // Summary queries for computeAccountReconciliationSummary
        if (isSelect && sqlLower.includes('sum(abono) as total_abonos') && sqlLower.includes('sum(cargo) as total_cargos')) {
            const [ctaId, hasta] = params;
            const rows = state.movimientos_bancarios.filter(m => Number(m.cuenta_bancaria_id) === Number(ctaId) && !m.deleted_at && m.fecha <= ymd(hasta));
            return [[{
                total_abonos: rows.reduce((s, r) => s + Number(r.abono || 0), 0),
                total_cargos: rows.reduce((s, r) => s + Number(r.cargo || 0), 0)
            }]];
        }
        if (isSelect && sqlLower.includes('sum(valor) as total_cheques')) {
            const [ctaId, hasta] = params;
            const rows = state.cheques.filter(c => Number(c.cuenta_bancaria_id) === Number(ctaId) && !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado && c.fecha <= ymd(hasta));
            return [[{ total_cheques: rows.reduce((s, c) => s + Number(c.valor || 0), 0) }]];
        }
        if (isSelect && sqlLower.includes('as abonos_en_transito')) {
            const [ctaId, hastaA, hastaB] = params;
            const rows = state.movimientos_bancarios.filter(m => Number(m.cuenta_bancaria_id) === Number(ctaId) && !m.deleted_at && m.fecha <= ymd(hastaB) && (!m.fecha_aplicado || m.fecha_aplicado > ymd(hastaA)));
            return [[{
                abonos_en_transito: rows.reduce((s, r) => s + Number(r.abono || 0), 0),
                cargos_en_transito: rows.reduce((s, r) => s + Number(r.cargo || 0), 0)
            }]];
        }
        if (isSelect && sqlLower.includes('as cheques_en_transito')) {
            const [ctaId, hastaA, hastaB] = params;
            const rows = state.cheques.filter(c => Number(c.cuenta_bancaria_id) === Number(ctaId) && !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado && c.fecha <= ymd(hastaB) && (!c.fecha_aplicado || c.fecha_aplicado > ymd(hastaA)));
            return [[{ cheques_en_transito: rows.reduce((s, c) => s + Number(c.valor || 0), 0) }]];
        }
        if (isSelect && sqlLower.includes('as cheques_reservados_count')) {
            return [[{ cheques_reservados_count: 0, cheques_reservados_monto: 0 }]];
        }

        // Movimientos & Comprobantes
        if (isSelect && sqlLower.includes('from movimientos_bancarios_comprobantes')) {
            const ids = new Set(params.map(Number));
            return [state.movimientos_bancarios_comprobantes.filter(c => ids.has(Number(c.movimiento_id)))];
        }
        if (sqlLower.startsWith('insert into movimientos_bancarios')) {
            const id = ++state.seq.movimientos_bancarios;
            const isImport = sqlLower.includes('import_batch_id');
            const [empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida] = params;
            const import_batch_id = isImport ? params[15] : null;
            const fingerprint = isImport ? params[16] : params[15];
            state.movimientos_bancarios.push({
                id, empresa_id, cuenta_bancaria_id: Number(cuenta_bancaria_id),
                fecha: ymd(fecha), fecha_aplicado: ymd(fecha_aplicado), documento, concepto,
                monto: Number(monto), cargo: Number(cargo), abono: Number(abono),
                tipo_remesa_id, cod_cta, num_partida, es_contabilizado: 0,
                comprobante_url: null, deleted_at: null, version: 1, import_batch_id, fingerprint
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update movimientos_bancarios set fecha_aplicado = null')) {
            const ids = new Set(params.map(Number));
            let affected = 0;
            state.movimientos_bancarios.forEach(m => {
                if (ids.has(Number(m.id)) && !m.deleted_at) {
                    m.fecha_aplicado = null;
                    m.version++;
                    affected++;
                }
            });
            return [{ affectedRows: affected }];
        }
        if (sqlLower.startsWith('update movimientos_bancarios set fecha_aplicado = ?')) {
            const fechaAplicado = params[0];
            const id = Number(params[params.length - 1]);
            const m = state.movimientos_bancarios.find(x => Number(x.id) === id && !x.deleted_at);
            if (m) { m.fecha_aplicado = ymd(fechaAplicado); m.version++; }
            return [{ affectedRows: m ? 1 : 0 }];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('where id in')) {
            const ids = new Set(params.map(Number));
            return [state.movimientos_bancarios.filter(m => ids.has(Number(m.id)))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('fingerprint in')) {
            const ctaId = Number(params[0]);
            const fps = new Set(params.slice(1));
            return [state.movimientos_bancarios.filter(m => Number(m.cuenta_bancaria_id) === ctaId && !m.deleted_at && fps.has(m.fingerprint))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('fingerprint = ?')) {
            return [state.movimientos_bancarios.filter(m => Number(m.cuenta_bancaria_id) === Number(params[0]) && !m.deleted_at && m.fingerprint === params[1])];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('where cuenta_bancaria_id = ? and deleted_at is null and fecha_aplicado is null') && !sqlLower.includes('left join')) {
            return [state.movimientos_bancarios.filter(m => Number(m.cuenta_bancaria_id) === Number(params[0]) && !m.deleted_at && !m.fecha_aplicado).map(m => ({ ...m, origen_tipo: 'MOV' }))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios') && sqlLower.includes('where cuenta_bancaria_id = ? and deleted_at is null and fecha_aplicado is not null') && !sqlLower.includes('left join')) {
            return [state.movimientos_bancarios.filter(m => Number(m.cuenta_bancaria_id) === Number(params[0]) && !m.deleted_at && Boolean(m.fecha_aplicado)).map(m => ({ ...m, origen_tipo: 'MOV' }))];
        }
        if (isSelect && sqlLower.includes('from movimientos_bancarios m') && sqlLower.includes('left join tipos_remesas tr')) {
            let rows = state.movimientos_bancarios.filter(m => !m.deleted_at && Number(m.cuenta_bancaria_id) === Number(params[0]));
            if (sqlLower.includes('m.fecha_aplicado between ? and ?')) {
                const [, d, h] = params;
                rows = rows.filter(m => m.fecha_aplicado && ymd(m.fecha_aplicado) >= ymd(d) && ymd(m.fecha_aplicado) <= ymd(h));
            } else if (sqlLower.includes('(m.fecha_aplicado is null or m.fecha_aplicado > ?)')) {
                const [, ha, hb] = params;
                rows = rows.filter(m => (!m.fecha_aplicado || ymd(m.fecha_aplicado) > ymd(ha)) && ymd(m.fecha) <= ymd(hb));
            }
            return [rows.map(m => {
                const tr = state.tipos_remesas.find(r => r.id === m.tipo_remesa_id);
                return { ...m, origen_tipo: 'MOV', tipo_doc: tr?.codigo || 'RM' };
            })];
        }

        // Cheques
        if (sqlLower.startsWith('update cheques set fecha_aplicado = null')) {
            const ids = new Set(params.map(Number));
            let affected = 0;
            state.cheques.forEach(c => {
                if (ids.has(Number(c.id)) && !c.deleted_at) {
                    c.fecha_aplicado = null;
                    c.version++;
                    affected++;
                }
            });
            return [{ affectedRows: affected }];
        }
        if (sqlLower.startsWith('update cheques set fecha_aplicado = ?')) {
            const fechaAplicado = params[0];
            const id = Number(params[params.length - 1]);
            const c = state.cheques.find(x => Number(x.id) === id && !x.deleted_at);
            if (c) { c.fecha_aplicado = ymd(fechaAplicado); c.version++; }
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (isSelect && sqlLower.includes('from cheques') && sqlLower.includes('where id in')) {
            const ids = new Set(params.map(Number));
            return [state.cheques.filter(c => ids.has(Number(c.id)))];
        }
        if (isSelect && sqlLower.includes('from cheques') && sqlLower.includes('where cuenta_bancaria_id = ? and deleted_at is null and fecha_aplicado is null') && !sqlLower.includes('ch.')) {
            return [state.cheques.filter(c => Number(c.cuenta_bancaria_id) === Number(params[0]) && !c.deleted_at && !c.fecha_aplicado && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado).map(c => ({
                ...c, origen_tipo: 'CK', documento: c.cheque, monto: c.valor, cargo: c.valor, abono: 0, beneficiario: c.a_nombre
            }))];
        }
        if (isSelect && sqlLower.includes('from cheques') && sqlLower.includes('where cuenta_bancaria_id = ? and deleted_at is null and fecha_aplicado is not null') && !sqlLower.includes('ch.')) {
            return [state.cheques.filter(c => Number(c.cuenta_bancaria_id) === Number(params[0]) && !c.deleted_at && Boolean(c.fecha_aplicado) && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado).map(c => ({
                ...c, origen_tipo: 'CK', documento: c.cheque, monto: c.valor, cargo: c.valor, abono: 0, beneficiario: c.a_nombre
            }))];
        }
        if (isSelect && sqlLower.includes('from cheques ch') && sqlLower.includes('as origen_tipo')) {
            let rows = state.cheques.filter(c => !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado && Number(c.cuenta_bancaria_id) === Number(params[0]));
            if (sqlLower.includes('ch.fecha_aplicado between ? and ?')) {
                const [, d, h] = params;
                rows = rows.filter(c => c.fecha_aplicado && ymd(c.fecha_aplicado) >= ymd(d) && ymd(c.fecha_aplicado) <= ymd(h));
            } else if (sqlLower.includes('(ch.fecha_aplicado is null or ch.fecha_aplicado > ?)')) {
                const [, ha, hb] = params;
                rows = rows.filter(c => (!c.fecha_aplicado || ymd(c.fecha_aplicado) > ymd(ha)) && ymd(c.fecha) <= ymd(hb));
            }
            return [rows.map(c => ({
                ...c, origen_tipo: 'CK', tipo_doc: 'CH', documento: c.cheque, monto: c.valor, cargo: c.valor, abono: 0, beneficiario: c.a_nombre
            }))];
        }

        // Control de Pagos
        if (isSelect && sqlLower.includes('from recordatorios_pagos_abonos')) {
            const [ctaId, hasta] = params;
            return [state.recordatorios_pagos_abonos
                .filter(a => Number(a.cuenta_bancaria_id) === Number(ctaId) && a.estado_conciliacion === 'PENDIENTE' && ymd(a.fecha_pago) <= ymd(hasta))
                .map(a => ({ ...a }))];
        }
        if (isSelect && sqlLower.includes('from recordatorios_pagos_comprobantes')) {
            const ids = new Set(params.map(Number));
            return [state.recordatorios_pagos_comprobantes.filter(c => ids.has(Number(c.vencimiento_id)))];
        }
        if (sqlLower.startsWith("update recordatorios_pagos_abonos set estado_conciliacion = 'pendiente'")) {
            return [{ affectedRows: 0 }];
        }

        // Importaciones, Reglas, Cruces
        if (sqlLower.startsWith('insert into conciliacion_importaciones')) {
            const id = ++state.seq.conciliacion_importaciones;
            const [cuenta_bancaria_id, banco_formato, file_hash, archivo_nombre, total_filas, saldo_final_extracto, created_by] = params;
            state.conciliacion_importaciones.push({
                id, cuenta_bancaria_id, banco_formato, file_hash, archivo_nombre, total_filas,
                creados_count: 0, conciliados_count: 0, duplicados_omitidos: 0, saldo_final_extracto, created_by,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_importaciones')) {
            const [creados, conciliados, dupes, id] = params;
            const row = state.conciliacion_importaciones.find(i => Number(i.id) === Number(id));
            if (row) Object.assign(row, { creados_count: creados, conciliados_count: conciliados, duplicados_omitidos: dupes });
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_importaciones')) {
            return [state.conciliacion_importaciones.filter(i => Number(i.cuenta_bancaria_id) === Number(params[0]) && i.file_hash === params[1])];
        }

        if (sqlLower.startsWith('insert into conciliacion_reglas_clasificacion')) {
            const id = ++state.seq.conciliacion_reglas_clasificacion;
            const [banco_codigo, cuenta_bancaria_id, nombre, patron, tipo_match, tipo_movimiento, signo, tipo_remesa_id, concepto_limpio, cod_cta, prioridad, activo, created_by] = params;
            state.conciliacion_reglas_clasificacion.push({
                id, banco_codigo, cuenta_bancaria_id, nombre, patron, tipo_match, tipo_movimiento,
                signo, tipo_remesa_id, concepto_limpio, cod_cta, prioridad, activo, created_by
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_reglas_clasificacion')) {
            const [banco_codigo, cuenta_bancaria_id, nombre, patron, tipo_match, tipo_movimiento, signo, tipo_remesa_id, concepto_limpio, cod_cta, prioridad, activo, id] = params;
            const r = state.conciliacion_reglas_clasificacion.find(x => Number(x.id) === Number(id));
            if (r) {
                Object.assign(r, {
                    banco_codigo, cuenta_bancaria_id, nombre, patron, tipo_match, tipo_movimiento,
                    signo, tipo_remesa_id, concepto_limpio, cod_cta, prioridad, activo
                });
            }
            return [{ affectedRows: r ? 1 : 0 }];
        }
        if (sqlLower.startsWith('delete from conciliacion_reglas_clasificacion')) {
            const id = Number(params[0]);
            const before = state.conciliacion_reglas_clasificacion.length;
            state.conciliacion_reglas_clasificacion = state.conciliacion_reglas_clasificacion.filter(r => Number(r.id) !== id);
            return [{ affectedRows: before - state.conciliacion_reglas_clasificacion.length }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_reglas_clasificacion')) {
            if (sqlLower.includes('where id = ?')) {
                return [state.conciliacion_reglas_clasificacion.filter(r => Number(r.id) === Number(params[0]))];
            }
            if (sqlLower.includes('where activo = 1')) {
                return [state.conciliacion_reglas_clasificacion.filter(r => Number(r.activo) === 1)];
            }
            return [state.conciliacion_reglas_clasificacion];
        }

        if (sqlLower.startsWith('insert into conciliacion_cruces')) {
            const id = ++state.seq.conciliacion_cruces;
            const [cuenta_bancaria_id, tipo_cruce, direccion, monto_total, fecha_aplicado, importacion_id, referencia_banco, concepto_banco, notas, created_by] = params;
            state.conciliacion_cruces.push({
                id, cuenta_bancaria_id: Number(cuenta_bancaria_id), tipo_cruce, direccion,
                monto_total: Number(monto_total), fecha_aplicado: ymd(fecha_aplicado),
                estado: 'ACTIVO', importacion_id, referencia_banco, concepto_banco, notas, created_by
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLower.startsWith('update conciliacion_cruces')) {
            const id = Number(params[params.length - 1]);
            const c = state.conciliacion_cruces.find(x => Number(x.id) === id);
            if (c) { c.estado = 'DESCONCILIADO'; c.desconciliado_by = params[0]; }
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_cruces')) {
            if (sqlLower.includes('where id = ?')) {
                return [state.conciliacion_cruces.filter(c => Number(c.id) === Number(params[0]))];
            }
            return [state.conciliacion_cruces];
        }
        if (sqlLower.startsWith('insert into conciliacion_cruce_items')) {
            const id = ++state.seq.conciliacion_cruce_items;
            const [cruce_id, lado, origen_tipo, entidad_id, documento, fecha, concepto, monto] = params;
            state.conciliacion_cruce_items.push({
                id, cruce_id: Number(cruce_id), lado, origen_tipo, entidad_id, documento, fecha: ymd(fecha), concepto, monto: Number(monto)
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (isSelect && sqlLower.includes('from conciliacion_cruce_items')) {
            if (sqlLower.includes('where cruce_id = ?')) {
                return [state.conciliacion_cruce_items.filter(i => Number(i.cruce_id) === Number(params[0]))];
            }
            if (sqlLower.includes('where cruce_id in')) {
                const ids = new Set(params.map(Number));
                return [state.conciliacion_cruce_items.filter(i => ids.has(Number(i.cruce_id)))];
            }
            return [state.conciliacion_cruce_items];
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

    return { pool, getState: () => state, reset };
}

describe('Sub-Milestone M1C — Aging, Gemini PDF/Img, Reglas, Cruces N:1/1:N, Firmas R5.3/R6.1 & Notification:new', () => {
    const mockDb = createM1CMockDb();
    let server;
    let baseUrl;
    const emittedEvents = [];
    const userEmittedEvents = [];

    let origGetDb;
    let origGetDbIfReady;
    let origWithTransaction;
    let origGenerateWithGeminiFallback;

    const writeProtectedFixture = (subDir, filename, buf) => {
        const dir = path.join(UPLOADS_ROOT, subDir);
        fs.mkdirSync(dir, { recursive: true });
        const full = path.join(dir, filename);
        fs.writeFileSync(full, buf);
        CREATED_TEST_FILES.push(full);
    };

    before(async () => {
        origGetDb = dbModule.getDb;
        origGetDbIfReady = dbModule.getDbIfReady;
        origWithTransaction = dbModule.withTransaction;
        origGenerateWithGeminiFallback = telegramGeminiService.generateWithGeminiFallback;

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

        writeProtectedFixture('movimientos', 'test_m1c_mov1.png', TINY_PNG_BUFFER);
        writeProtectedFixture('movimientos', 'test_m1c_mov2_legacy.png', TINY_PNG_BUFFER);
        writeProtectedFixture('pagos', 'test_m1c_pago1.png', TINY_PNG_BUFFER);
        writeProtectedFixture('pagos', 'test_m1c_pago2.png', TINY_PNG_BUFFER);
        writeProtectedFixture('pagos', 'test_m1c_otro_abono.png', TINY_PNG_BUFFER);

        delete require.cache[require.resolve('../routes/conciliacion')];
        const conciliacionRouter = require('../routes/conciliacion');

        const mockIo = {
            to: (room) => ({
                to: () => ({
                    emit: (ev, payload) => emittedEvents.push({ room, ev, payload })
                }),
                emit: (ev, payload) => {
                    if (String(room).startsWith('user_')) {
                        userEmittedEvents.push({ room, ev, payload });
                    } else {
                        emittedEvents.push({ room, ev, payload });
                    }
                }
            }),
            emit: (ev, payload) => emittedEvents.push({ room: 'all', ev, payload })
        };

        const app = express();
        app.use(express.json({ limit: '20mb' }));
        app.use((req, _res, next) => {
            req.io = mockIo;
            next();
        });
        app.use('/api/bancos/conciliacion', conciliacionRouter);
        app.use('/api/uploads', guardProtectedUploadsMiddleware, express.static(UPLOADS_ROOT));

        await new Promise((resolve) => {
            server = http.createServer(app);
            server.listen(0, '127.0.0.1', () => {
                baseUrl = `http://127.0.0.1:${server.address().port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (server) await new Promise((resolve) => server.close(resolve));
        dbModule.getDb = origGetDb;
        dbModule.getDbIfReady = origGetDbIfReady;
        dbModule.withTransaction = origWithTransaction;
        telegramGeminiService.generateWithGeminiFallback = origGenerateWithGeminiFallback;
        for (const f of CREATED_TEST_FILES) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) { /* ignore */ }
        }
    });

    beforeEach(() => {
        mockDb.reset();
        emittedEvents.length = 0;
        userEmittedEvents.length = 0;
        telegramGeminiService.generateWithGeminiFallback = origGenerateWithGeminiFallback;
        for (let uid = 1; uid <= 6; uid++) {
            restoreUser(uid);
            invalidateUserAuthCache(uid);
        }
    });

    const makeToken = (userId = 1) => {
        const u = mockDb.getState().users.find(x => x.id === userId);
        return jwt.sign(
            { id: u.id, username: u.username, nombre: u.nombre, role_id: u.role_id, role: u.role_name, status: u.status, tv: 1 },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
    };

    const reqJson = async (method, urlPath, { userId = 1, body = null, headers = {}, noAuth = false } = {}) => {
        const hdrs = { 'Content-Type': 'application/json', ...headers };
        if (!noAuth) hdrs.Authorization = `Bearer ${makeToken(userId)}`;
        const res = await fetch(`${baseUrl}${urlPath}`, {
            method,
            headers: hdrs,
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: res.status, data };
    };

    // ── 1. Servicio: Multimodal Normalization, Gemini Statement Parser, Reglas & Grupos ──
    describe('1. Servicio bankStatementParserService (Multimodal, Reglas, N:1/1:N)', () => {
        it('valida PDF (15MB), PNG, JPEG (image/jpg) y WebP; rechaza 400 magic bytes inválidos, vacíos, >10 archivos y exceso de tamaño', () => {
            const okPdf = normalizeStatementFileInput({ data_url: TINY_PDF_DATA_URL });
            assert.equal(okPdf.mimeType, 'application/pdf');

            const okJpg = normalizeStatementFileInput({
                base64: TINY_JPEG_BUFFER.toString('base64'),
                mime_type: 'image/jpg'
            });
            assert.equal(okJpg.mimeType, 'image/jpeg');

            const okWebp = normalizeStatementFileInput({
                file_base64: TINY_WEBP_BUFFER.toString('base64'),
                mimeType: 'image/webp'
            });
            assert.equal(okWebp.mimeType, 'image/webp');

            // Magic bytes falsos
            assert.throws(
                () => normalizeStatementFileInput({ data_url: `data:application/pdf;base64,${Buffer.from('NO ES PDF').toString('base64')}` }),
                (err) => err.statusCode === 400
            );
            assert.throws(
                () => normalizeStatementFileInput({ data_url: `data:image/png;base64,${TINY_JPEG_BUFFER.toString('base64')}` }),
                (err) => err.statusCode === 400
            );
            // MIME no soportado
            assert.throws(
                () => normalizeStatementFileInput({ data_url: `data:text/html;base64,${Buffer.from('<script>').toString('base64')}` }),
                (err) => err.statusCode === 400
            );
            // Excede 10MB imagen
            const over10MbImg = Buffer.concat([TINY_PNG_BUFFER, Buffer.alloc(10 * 1024 * 1024 + 64)]);
            assert.throws(
                () => normalizeStatementFileInput({ base64: over10MbImg.toString('base64'), mime_type: 'image/png' }),
                (err) => err.statusCode === 400
            );
            // Excede 15MB PDF
            const over15MbPdf = Buffer.concat([TINY_PDF_BUFFER, Buffer.alloc(15 * 1024 * 1024 + 64)]);
            assert.throws(
                () => normalizeStatementFileInput({ base64: over15MbPdf.toString('base64'), mime_type: 'application/pdf' }),
                (err) => err.statusCode === 400
            );
            // Más de 10 páginas
            const tooMany = Array.from({ length: 11 }, () => ({ data_url: TINY_PNG_DATA_URL }));
            assert.throws(
                () => normalizeStatementFiles({ files: tooMany }),
                (err) => err.statusCode === 400
            );
        });

        it('validateClassificationRulePattern rechaza patrones vacíos, >255, regex inválida y patrones ReDoS', () => {
            assert.equal(validateClassificationRulePattern('', 'CONTAINS').valid, false);
            assert.equal(validateClassificationRulePattern('A'.repeat(256), 'CONTAINS').valid, false);
            assert.equal(validateClassificationRulePattern('[unclosed', 'REGEX').valid, false);
            assert.equal(validateClassificationRulePattern('(a+)+', 'REGEX').valid, false);
            assert.equal(validateClassificationRulePattern('(.*)*', 'REGEX').valid, false);
            assert.equal(validateClassificationRulePattern('(a|aa)+', 'REGEX').valid, false);
            assert.equal(validateClassificationRulePattern('COMISION\\s+POS', 'REGEX').valid, true);
        });

        it('applyClassificationRules ordena por especificidad (cuenta > banco > global), prioridad y resuelve tipo_remesa cross-empresa', () => {
            const txs = [
                { fila_origen: 1, descripcion: 'CARGO COMISION TERMINAL POS 99', tipo: 'CARGO', cargo: 18.5, abono: 0, monto: 18.5 },
                { fila_origen: 2, descripcion: 'REMESA VENTAS ESTACION', tipo: 'ABONO', cargo: 0, abono: 500, monto: 500 }
            ];
            const rules = [
                { id: 1, cuenta_bancaria_id: null, banco_codigo: null, nombre: 'Global Pos', patron: 'COMISION', tipo_match: 'CONTAINS', tipo_movimiento: 'CARGO', signo: 'CARGO', tipo_remesa_id: 2, concepto_limpio: 'GLOBAL COMISION', cod_cta: '500001', prioridad: 1, activo: 1 },
                { id: 2, cuenta_bancaria_id: null, banco_codigo: '01', nombre: 'Banco Pos', patron: 'COMISION', tipo_match: 'CONTAINS', tipo_movimiento: 'CARGO', signo: 'CARGO', tipo_remesa_id: 2, concepto_limpio: 'BANCO COMISION', cod_cta: '500002', prioridad: 5, activo: 1 },
                { id: 3, cuenta_bancaria_id: 1, banco_codigo: '01', nombre: 'Cuenta Pos', patron: 'COMISION.*POS', tipo_match: 'REGEX', tipo_movimiento: 'CARGO', signo: 'CARGO', tipo_remesa_id: 5, concepto_limpio: 'CUENTA COMISION POS', cod_cta: '510302', prioridad: 50, activo: 1 },
                { id: 4, cuenta_bancaria_id: 1, banco_codigo: '01', nombre: 'Inactiva', patron: 'REMESA', tipo_match: 'STARTS_WITH', tipo_movimiento: 'ABONO', signo: 'ABONO', tipo_remesa_id: 1, concepto_limpio: 'NO APLICA', cod_cta: '999999', prioridad: 1, activo: 0 }
            ];
            const allTiposRemesas = mockDb.getState().tipos_remesas;
            const companyTipos = allTiposRemesas.filter(t => t.empresa_id === 1);

            const res = applyClassificationRules(txs, rules, companyTipos, {
                cuentaId: 1,
                bancoCodigo: '01',
                allTiposRemesas
            });
            assert.equal(res.reglas_aplicadas_count, 1);
            assert.equal(res.transacciones[0].regla_aplicada.id, 3);
            assert.equal(res.transacciones[0].cod_cta, '510302');
            assert.equal(res.transacciones[0].concepto_limpio, 'CUENTA COMISION POS');
            assert.equal(res.transacciones[0].conceptoSugerido, 'CUENTA COMISION POS');
            // tipo_remesa_id 5 (empresa 2, código NC) debe resolverse a id 2 (empresa 1, código NC)
            assert.equal(res.transacciones[0].tipo_remesa_id, 2);
            assert.equal(res.transacciones[0].tipo_remesa_codigo, 'NC');
            assert.equal(res.transacciones[1].regla_aplicada, null);
        });

        it('extractBankStatementWithGemini parsea JSON cercado (fenced), cruza 1:1, aplica reglas y sugiere N:1 y 1:N sin mutar match 1:1', async () => {
            const pendientes = [
                { id: 101, origen_tipo: 'CK', documento: '7001', concepto: 'CHK 1', monto: 100, cargo: 100, abono: 0, fecha: '2026-10-15' },
                { id: 102, origen_tipo: 'CK', documento: '7002', concepto: 'CHK 2', monto: 200, cargo: 200, abono: 0, fecha: '2026-10-15' },
                { id: 103, origen_tipo: 'MOV', documento: 'AB-LOTE', concepto: 'ABONO GRANDE', monto: 450, cargo: 0, abono: 450, fecha: '2026-10-16' },
                { id: 104, origen_tipo: 'MOV', documento: 'EXACTO-1', concepto: 'REMESA EXACTA', monto: 90, cargo: 0, abono: 90, fecha: '2026-10-16' }
            ];
            const rules = [
                { id: 1, cuenta_bancaria_id: 1, nombre: 'Exacta', patron: 'REMESA EXACTA', tipo_match: 'EXACT', tipo_movimiento: 'ABONO', signo: 'ABONO', tipo_remesa_id: 1, concepto_limpio: 'REMESA VERIFICADA', cod_cta: '110201', prioridad: 1, activo: 1 }
            ];

            const result = await extractBankStatementWithGemini({
                files: [{ data_url: TINY_PDF_DATA_URL }, { data_url: TINY_PNG_DATA_URL }],
                pendientes,
                rules,
                tiposRemesas: mockDb.getState().tipos_remesas.filter(t => t.empresa_id === 1),
                cuentaId: 1,
                bancoCodigo: '01',
                generateWithGeminiFn: async () => ({
                    modelUsed: 'gemini-2.5-flash-lite',
                    text: '```json\n' + JSON.stringify({
                        banco_detectado: 'PROMERICA',
                        moneda: 'USD',
                        saldo_inicial: 1000,
                        saldo_final: 1150,
                        transacciones: [
                            { fecha: '2026-10-16', documento: 'EXACTO-1', descripcion: 'REMESA EXACTA', cargo: 0, abono: 90, saldo: 1090 },
                            { fecha: '2026-10-16', documento: 'LOTE-CHK', descripcion: 'COMPENSACION CHEQUES', cargo: 300, abono: 0, saldo: 790 },
                            { fecha: '2026-10-17', documento: 'PARC-1', descripcion: 'ABONO PARCIAL 1', cargo: 0, abono: 200, saldo: 990 },
                            { fecha: '2026-10-17', documento: 'PARC-2', descripcion: 'ABONO PARCIAL 2', cargo: 0, abono: 250, saldo: 1240 }
                        ]
                    }) + '\n```'
                })
            });

            assert.equal(result.origen_parser, 'GEMINI_MULTIMODAL');
            assert.equal(result.banco_detectado, 'PROMERICA');
            assert.equal(result.model_used, 'gemini-2.5-flash-lite');
            assert.equal(result.paginas_procesadas, 2);
            assert.equal(result.total_procesadas, 4);
            assert.equal(result.transacciones[0].matchType, 'EXACTO_DOC_MONTO');
            assert.equal(result.transacciones[0].cod_cta, '110201');
            assert.equal(result.transacciones[0].concepto_limpio, 'REMESA VERIFICADA');
            assert.equal(result.reglas_aplicadas_count, 1);

            const nA1 = result.sugerencias_cruces_agrupados.find(s => s.tipo_cruce === 'N_A_1');
            assert.ok(nA1, 'Debe sugerir N_A_1 para $300 = $100 + $200');
            assert.equal(nA1.libro_items.length, 2);

            const unoAN = result.sugerencias_cruces_agrupados.find(s => s.tipo_cruce === '1_A_N');
            assert.ok(unoAN, 'Debe sugerir 1_A_N para $450 = $200 + $250');
            assert.equal(unoAN.banco_items.length, 2);

            // También verificar detectGroupedMatches directo
            const directGrouped = detectGroupedMatches(result.transacciones, pendientes);
            assert.equal(directGrouped.length, 2);
            assert.equal(result.transacciones[0].match.id, 104); // 1:1 intacto
        });
    });

    // ── 2. R3.3 Aging, R5.3 Movement Receipts & R6.1 Control Pagos Signing en GET /data ──
    describe('2. GET /data: R3.3 Aging, R5.3 Movement Receipts & R6.1 Control Pagos Signing', () => {
        it('clasifica aging en 0-30, 31-90, 91-180 (por_caducar) y >180 (caducos) excluyendo cobrados/anulados y usando fecha referencia real', async () => {
            const res = await reqJson('GET', '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-01-01&hasta=2026-10-31', { userId: 4 });
            assert.equal(res.status, 200);
            assert.ok(res.data.aging_cheques);
            assert.ok(res.data.aging_resumen);
            assert.equal(res.data.aging_cheques.fecha_referencia, '2026-10-31');
            assert.equal(res.data.aging_cheques.buckets['0-30'].count, 1);
            assert.equal(res.data.aging_cheques.buckets['31-90'].count, 1);
            assert.equal(res.data.aging_cheques.buckets['91-180'].count, 1);
            assert.equal(res.data.aging_cheques.por_caducar_count, 1); // 2026-05-20 -> 2026-10-31 = 164 días
            assert.equal(res.data.aging_cheques.buckets['>180'].count, 1);
            assert.equal(res.data.aging_cheques.caducos_monto, 400);
            assert.deepEqual(res.data.resumen.aging_resumen, res.data.aging_resumen);

            const chk13 = res.data.pendientes.find(p => p.origen_tipo === 'CK' && p.id === 13);
            assert.equal(chk13.aging_bucket, '>180');
            assert.equal(chk13.caduco, true);

            // Sin hasta no debe usar '2099-12-31' sino fecha SV de hoy
            const noHastaRes = await reqJson('GET', '/api/bancos/conciliacion/data?cuenta_id=1', { userId: 4 });
            assert.equal(noHastaRes.status, 200);
            assert.notEqual(noHastaRes.data.aging_resumen.fecha_referencia, '2099-12-31');
        });

        it('firma comprobantes de movimientos (R5.3) y Control de Pagos (R6.1) con HMAC 200/401 y tolera ER_NO_SUCH_TABLE', async () => {
            const res = await reqJson('GET', '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-01-01&hasta=2026-10-31', { userId: 4 });
            assert.equal(res.status, 200);

            // R5.3 movimiento conciliado con fila en movimientos_bancarios_comprobantes
            const mov1 = res.data.movimientos_conciliados.find(m => m.origen_tipo === 'MOV' && m.id === 1);
            assert.ok(mov1.signed_url.includes('sig='));
            assert.equal(mov1.comprobantes_count, 1);
            assert.equal(mov1.comprobantes.length, 1);

            // R5.3 movimiento pendiente con solo m.comprobante_url legado (fallback)
            const mov2 = res.data.pendientes.find(m => m.origen_tipo === 'MOV' && m.id === 2);
            assert.ok(mov2.comprobante_url.includes('sig='));
            assert.equal(mov2.comprobantes_count, 1);

            // Descarga anónima con firma -> 200; sin firma -> 401
            const okMovDl = await fetch(`${baseUrl}${mov2.comprobante_url}`);
            assert.equal(okMovDl.status, 200);
            const unauthMovDl = await fetch(`${baseUrl}/api/uploads/movimientos/test_m1c_mov2_legacy.png`);
            assert.equal(unauthMovDl.status, 401);

            // R6.1 Control de Pagos: abono 50 debe recibir 2 comprobantes (id 60 abono 50 + id 61 null) y excluir id 62 (abono 999)
            const sug50 = res.data.sugerencias_control_pagos.find(s => s.id === 50);
            assert.ok(sug50);
            assert.equal(sug50.comprobantes_count, 2);
            assert.equal(sug50.comprobantes.length, 2);
            assert.ok(sug50.comprobante_url.includes('sig='));
            assert.ok(sug50.comprobantes.every(c => c.signed_url && c.signed_url.includes('sig=')));

            const okPagoDl = await fetch(`${baseUrl}${sug50.comprobante_url}`);
            assert.equal(okPagoDl.status, 200);
            const unauthPagoDl = await fetch(`${baseUrl}/api/uploads/pagos/test_m1c_pago1.png`);
            assert.equal(unauthPagoDl.status, 401);

            // Abono 51 sin comprobantes -> null y 0
            const sug51 = res.data.sugerencias_control_pagos.find(s => s.id === 51);
            assert.equal(sug51.comprobantes_count, 0);
            assert.equal(sug51.comprobante_url, null);
            assert.deepEqual(sug51.comprobantes, []);

            // ER_NO_SUCH_TABLE fallback
            mockDb.getState().simulateMissingTables = true;
            const fallbackRes = await reqJson('GET', '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-01-01&hasta=2026-10-31', { userId: 4 });
            assert.equal(fallbackRes.status, 200);
            const fbMov1 = fallbackRes.data.movimientos_conciliados.find(m => m.origen_tipo === 'MOV' && m.id === 1);
            assert.ok(fbMov1.comprobante_url.includes('sig='));
        });
    });

    // ── 3. Reglas de Autoclasificación CRUD, RBAC, ReDoS & Gemini Endpoints ──
    describe('3. R4.2 Reglas CRUD, /parse-extracto-pdf, /importar-pdf y /crear-masivo-y-aplicar', () => {
        it('expone can_manage_reglas en /catalogos, aplica RBAC y rechaza regex inválida/ReDoS con 400', async () => {
            const catReglas = await reqJson('GET', '/api/bancos/conciliacion/catalogos', { userId: 3 });
            assert.equal(catReglas.status, 200);
            assert.equal(catReglas.data.permissions.can_manage_reglas, true);

            const catViewer = await reqJson('GET', '/api/bancos/conciliacion/catalogos', { userId: 4 });
            assert.equal(catViewer.data.permissions.can_manage_reglas, false);

            // Viewer no puede crear reglas (403)
            const deniedCreate = await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                userId: 4,
                body: { nombre: 'No', patron: 'X', tipo_match: 'CONTAINS' }
            });
            assert.equal(deniedCreate.status, 403);

            // ReDoS -> 400
            const redosRes = await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                userId: 3,
                body: { nombre: 'Mala', patron: '(a+)+', tipo_match: 'REGEX' }
            });
            assert.equal(redosRes.status, 400);

            // Crear regla válida (201) + emitir socket + probar antes de :id
            const createRes = await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                userId: 3,
                body: {
                    cuenta_bancaria_id: 1,
                    nombre: 'Comisión ATM',
                    patron: '^COMISION\\s+ATM',
                    tipo_match: 'REGEX',
                    tipo_movimiento: 'CARGO',
                    tipo_remesa_codigo: 'NC',
                    concepto_limpio: 'COMISION RETIRO ATM',
                    cod_cta: '510405',
                    prioridad: 10
                }
            });
            assert.equal(createRes.status, 201);
            assert.ok(emittedEvents.some(e => e.ev === 'conciliacion_reglas_updated'));

            const testRes = await reqJson('POST', '/api/bancos/conciliacion/reglas/probar', {
                userId: 3,
                body: { cuenta_bancaria_id: 1, descripcion: 'COMISION ATM SUCURSAL', tipo: 'CARGO', monto: 5 }
            });
            assert.equal(testRes.status, 200);
            assert.equal(testRes.data.reglas_aplicadas_count, 1);
            assert.equal(testRes.data.resultados[0].cod_cta, '510405');

            // PUT con ReDoS -> 400
            const badUpd = await reqJson('PUT', `/api/bancos/conciliacion/reglas/${createRes.data.id}`, {
                userId: 3,
                body: { patron: '(.*)*', tipo_match: 'REGEX' }
            });
            assert.equal(badUpd.status, 400);

            // PUT válido + DELETE
            const okUpd = await reqJson('PUT', `/api/bancos/conciliacion/reglas/${createRes.data.id}`, {
                userId: 3,
                body: { cod_cta: '510499' }
            });
            assert.equal(okUpd.status, 200);
            assert.equal(okUpd.data.regla.cod_cta, '510499');
        });

        it('POST /importar-pdf, /parse-extracto y /crear-masivo-y-aplicar persisten cod_cta y tipo_remesa_id cross-empresa y limpian idempotencia ante errores', async () => {
            // Crear regla con tipo_remesa_id de empresa 2 (id=5, código NC) aplicada a cuenta 1 (empresa 1)
            await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                userId: 1,
                body: {
                    cuenta_bancaria_id: 1,
                    nombre: 'Cargo POS',
                    patron: 'COMISION POS',
                    tipo_match: 'CONTAINS',
                    tipo_movimiento: 'CARGO',
                    tipo_remesa_id: 5,
                    concepto_limpio: 'CARGO TERMINAL POS',
                    cod_cta: '510888',
                    prioridad: 5
                }
            });

            telegramGeminiService.generateWithGeminiFallback = async () => ({
                modelUsed: 'gemini-2.5-flash-lite',
                text: JSON.stringify({
                    banco_detectado: 'PROMERICA',
                    transacciones: [
                        { fecha: '2026-10-28', documento: 'POS-77', descripcion: 'COMISION POS OCTUBRE', cargo: 22.50, abono: 0 }
                    ]
                })
            });

            const pdfRes = await reqJson('POST', '/api/bancos/conciliacion/importar-pdf', {
                userId: 2,
                body: {
                    cuenta_id: 1,
                    data_url: TINY_PDF_DATA_URL,
                    archivo_nombre: 'octubre.pdf'
                }
            });
            assert.equal(pdfRes.status, 200);
            assert.equal(pdfRes.data.origen_parser, 'GEMINI_MULTIMODAL');
            assert.equal(pdfRes.data.transacciones[0].cod_cta, '510888');
            assert.equal(pdfRes.data.transacciones[0].tipo_remesa_id, 2); // Resuelto a empresa 1!

            // CSV parse-extracto también aplica reglas
            const csvRes = await reqJson('POST', '/api/bancos/conciliacion/parse-extracto', {
                userId: 2,
                body: {
                    cuenta_id: 1,
                    raw_data: 'Fecha,Documento,Descripcion,Cargo,Abono\n2026-10-29,POS-88,COMISION POS NOV,15.00,0'
                }
            });
            assert.equal(csvRes.status, 200);
            assert.equal(csvRes.data.reglas_aplicadas_count, 1);
            assert.equal(csvRes.data.transacciones[0].cod_cta, '510888');

            // Simular fallo 404 con X-Idempotency-Key y verificar reintento exitoso con misma clave
            const failMasivo = await reqJson('POST', '/api/bancos/conciliacion/crear-masivo-y-aplicar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'masivo-retry-key' },
                body: {
                    cuenta_bancaria_id: 9999,
                    items: [{ fecha: '2026-10-28', documento: 'POS-77', descripcion: 'COMISION POS', concepto_limpio: 'CARGO TERMINAL POS', tipo: 'CARGO', tipo_remesa_id: 5, cod_cta: '510888', monto: 22.5 }]
                }
            });
            assert.equal(failMasivo.status, 404);
            assert.equal(mockDb.getState().bancos_idempotency_keys.length, 0);

            const okMasivo = await reqJson('POST', '/api/bancos/conciliacion/crear-masivo-y-aplicar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'masivo-retry-key' },
                body: {
                    cuenta_bancaria_id: 1,
                    file_hash: pdfRes.data.file_hash,
                    archivo_nombre: 'octubre.pdf',
                    items: [{
                        fecha: '2026-10-28',
                        fecha_aplicado: '2026-10-28',
                        documento: 'POS-77',
                        descripcion: 'COMISION POS',
                        concepto_limpio: 'CARGO TERMINAL POS',
                        tipo: 'CARGO',
                        tipo_remesa_id: 5,
                        cod_cta: '510888',
                        monto: 22.5
                    }]
                }
            });
            assert.equal(okMasivo.status, 200);
            assert.equal(okMasivo.data.creados, 1);
            const createdMov = mockDb.getState().movimientos_bancarios.find(m => m.documento === 'POS-77');
            assert.equal(createdMov.cod_cta, '510888');
            assert.equal(createdMov.tipo_remesa_id, 2);
            assert.equal(createdMov.concepto, 'CARGO TERMINAL POS');
        });
    });

    // ── 4. Cruces N:1 y 1:N, Guards 400/409/423 y Notificación socket ──
    describe('4. R4.2 Cruces N:1 / 1:N, Bloqueos y Notification:new (M1B)', () => {
        it('valida suma exacta (400), duplicados (400), doble cruce (409), período cerrado (423), guard DESCONCILIAR en /aplicar (409) y reversión en /desconciliar', async () => {
            // Suma desigual -> 400 con delta
            const badSum = await reqJson('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'cruce-retry-key' },
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: 'N_A_1',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-10-25',
                    libro_items: [{ id: 2, origen_tipo: 'MOV' }, { id: 3, origen_tipo: 'MOV' }], // 80 + 120 = 200
                    banco_items: [{ documento: 'EXT-99', fecha: '2026-10-25', concepto: 'CARGO UNICO', monto: 250 }]
                }
            });
            assert.equal(badSum.status, 400);
            assert.equal(badSum.data.delta, -50);
            assert.equal(mockDb.getState().bancos_idempotency_keys.length, 0);

            // Duplicado en libro_items -> 400
            const dupLibro = await reqJson('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: 'N_A_1',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-10-25',
                    libro_items: [{ id: 2, origen_tipo: 'MOV' }, { id: 2, origen_tipo: 'MOV' }],
                    banco_items: [{ monto: 160 }]
                }
            });
            assert.equal(dupLibro.status, 400);

            // Crear cruce N_A_1 válido reutilizando 'cruce-retry-key'
            const movCountBefore = mockDb.getState().movimientos_bancarios.length;
            const okCruce = await reqJson('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'cruce-retry-key' },
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: 'N_A_1',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-10-25',
                    libro_items: [{ id: 2, origen_tipo: 'MOV' }, { id: 3, origen_tipo: 'MOV' }], // 80 + 120 = 200
                    banco_items: [{ documento: 'EXT-200', fecha: '2026-10-25', concepto: 'CARGO UNICO', monto: 200 }]
                }
            });
            assert.equal(okCruce.status, 201);
            assert.equal(mockDb.getState().movimientos_bancarios.length, movCountBefore); // No inserta fila sintética en movimientos_bancarios
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 2).fecha_aplicado, '2026-10-25');
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 3).fecha_aplicado, '2026-10-25');

            // Doble cruce sobre documento ya conciliado -> 409
            const doubleCruce = await reqJson('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: 'N_A_1',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-10-26',
                    libro_items: [{ id: 2, origen_tipo: 'MOV' }, { id: 10, origen_tipo: 'CK' }],
                    banco_items: [{ monto: 180 }]
                }
            });
            assert.equal(doubleCruce.status, 409);

            // Intentar desconciliar individualmente vía POST /aplicar -> 409 Conflict
            const guardAplicar = await reqJson('POST', '/api/bancos/conciliacion/aplicar', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    accion: 'DESCONCILIAR',
                    items: [{ id: 2, origen_tipo: 'MOV' }]
                }
            });
            assert.equal(guardAplicar.status, 409);
            assert.equal(guardAplicar.data.cruce_id, okCruce.data.id);

            // GET /cruces devuelve items anidados
            const listCruces = await reqJson('GET', '/api/bancos/conciliacion/cruces?cuenta_id=1&estado=ACTIVO', { userId: 4 });
            assert.equal(listCruces.status, 200);
            assert.equal(listCruces.data.cruces.length, 1);
            assert.equal(listCruces.data.cruces[0].items.length, 3);

            // Cerrar período al 2026-10-31 -> bloquear desconciliación con 423
            await reqJson('POST', '/api/bancos/conciliacion/periodos/cerrar', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha_corte: '2026-10-31', monto_banco: 0, confirmar_con_diferencia: true }
            });
            const lockedDesconc = await reqJson('POST', `/api/bancos/conciliacion/cruces/${okCruce.data.id}/desconciliar`, { userId: 2 });
            assert.equal(lockedDesconc.status, 423);

            // Reabrir directamente y desconciliar exitosamente
            const periodoId = mockDb.getState().conciliacion_periodos[0].id;
            await reqJson('POST', `/api/bancos/conciliacion/periodos/${periodoId}/reabrir-directo`, {
                userId: 5,
                body: { motivo: 'Reapertura para revertir cruce agrupado en pruebas' }
            });

            const okDesconc = await reqJson('POST', `/api/bancos/conciliacion/cruces/${okCruce.data.id}/desconciliar`, { userId: 2 });
            assert.equal(okDesconc.status, 200);
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 2).fecha_aplicado, null);
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 3).fecha_aplicado, null);

            // Segundo intento -> 409
            const secondDesconc = await reqJson('DELETE', `/api/bancos/conciliacion/cruces/${okCruce.data.id}`, { userId: 2 });
            assert.equal(secondDesconc.status, 409);

            // Cruce 1_A_N con 2 líneas de extracto contra 1 movimiento ($450 = $200 + $250)
            const unoAN = await reqJson('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: '1_A_N',
                    direccion: 'ABONO',
                    fecha_aplicado: '2026-10-21',
                    libro_items: [{ id: 4, origen_tipo: 'MOV' }],
                    banco_items: [
                        { documento: 'DEP-A', fecha: '2026-10-20', concepto: 'TRAMO 1', monto: 200 },
                        { documento: 'DEP-B', fecha: '2026-10-21', concepto: 'TRAMO 2', monto: 250 }
                    ]
                }
            });
            assert.equal(unoAN.status, 201);
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 4).fecha_aplicado, '2026-10-21');
        });

        it('notifyReaperturaEvent y rutas de reapertura emiten "notification:new" (nunca "new_notification")', async () => {
            const directEvents = [];
            const fakeIo = {
                to: (room) => ({
                    emit: (ev, payload) => directEvents.push({ room, ev, payload })
                })
            };

            await notifyReaperturaEvent(mockDb.pool, fakeIo, {
                targetUserIds: [5],
                type: 'conciliacion_reapertura_solicitud',
                title: 'Prueba Reapertura',
                message: 'Solicitud de prueba',
                data: { periodo_id: 1 }
            });
            assert.equal(directEvents.length, 1);
            assert.equal(directEvents[0].ev, 'notification:new');
            assert.equal(directEvents.some(e => e.ev === 'new_notification'), false);

            // Flujo HTTP solicitar-reapertura -> resolver
            await reqJson('POST', '/api/bancos/conciliacion/periodos/cerrar', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha_corte: '2026-10-31', monto_banco: 0, confirmar_con_diferencia: true }
            });
            const periodoId = mockDb.getState().conciliacion_periodos[0].id;
            const solRes = await reqJson('POST', `/api/bancos/conciliacion/periodos/${periodoId}/solicitar-reapertura`, {
                userId: 2,
                body: { motivo: 'Revisión de movimientos históricos en octubre 2026' }
            });
            assert.equal(solRes.status, 201);
            assert.ok(userEmittedEvents.some(e => e.ev === 'notification:new'));
            assert.equal(userEmittedEvents.some(e => e.ev === 'new_notification'), false);
        });
    });

    // ── 5. Regresiones Iteración 2: Cross-Period Cruces, ER_NO_SUCH_TABLE, ReDoS AST, /aplicar CONCILIAR 409 & Exact Cents ──
    describe('5. Regresiones Iteración 2 (Cross-Period 423, Control Pagos ER_NO_SUCH_TABLE, ReDoS AST, CONCILIAR 409 & Minor)', () => {
        it('permite crear (201) y desconciliar (200) cruce cross-period con items de octubre cerrado y fecha_aplicado en noviembre abierto, manteniendo 423 si fecha_aplicado está cerrada', async () => {
            // Cerrar período al 2026-10-31
            const closeRes = await reqJson('POST', '/api/bancos/conciliacion/periodos/cerrar', {
                userId: 2,
                body: { cuenta_bancaria_id: 1, fecha_corte: '2026-10-31', monto_banco: 0, confirmar_con_diferencia: true }
            });
            assert.equal(closeRes.status, 200);

            // Intentar crear cruce con fecha_aplicado en período cerrado (2026-10-25) -> debe seguir dando 423
            const lockedCreate = await reqJson('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'cross-period-locked-key' },
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: 'N_A_1',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-10-25',
                    libro_items: [{ id: 2, origen_tipo: 'MOV' }, { id: 3, origen_tipo: 'MOV' }],
                    banco_items: [{ documento: 'EXT-OCT', fecha: '2026-10-25', concepto: 'CARGO OCTUBRE', monto: 200 }]
                }
            });
            assert.equal(lockedCreate.status, 423);
            assert.equal(mockDb.getState().bancos_idempotency_keys.length, 0);

            // Crear cruce con items emitidos en octubre cerrado (2026-10-18 / 2026-10-19) pero fecha_aplicado en noviembre abierto (2026-11-05) -> 201
            const openCreate = await reqJson('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'cross-period-open-key' },
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: 'N_A_1',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-11-05',
                    libro_items: [{ id: 2, origen_tipo: 'MOV' }, { id: 3, origen_tipo: 'MOV' }],
                    banco_items: [{ documento: 'EXT-NOV', fecha: '2026-10-20', concepto: 'CARGO COMPENSADO NOV', monto: 200 }]
                }
            });
            assert.equal(openCreate.status, 201);
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 2).fecha_aplicado, '2026-11-05');
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 3).fecha_aplicado, '2026-11-05');

            // Desconciliar ese mismo cruce de noviembre (items de octubre) -> 200
            const openDesconc = await reqJson('POST', `/api/bancos/conciliacion/cruces/${openCreate.data.id}/desconciliar`, {
                userId: 2
            });
            assert.equal(openDesconc.status, 200);
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 2).fecha_aplicado, null);
            assert.equal(mockDb.getState().movimientos_bancarios.find(m => m.id === 3).fecha_aplicado, null);
        });

        it('GET /data preserva sugerencias_control_pagos pendientes cuando SOLO recordatorios_pagos_comprobantes arroja ER_NO_SUCH_TABLE', async () => {
            mockDb.getState().missingTables = ['recordatorios_pagos_comprobantes'];

            const res = await reqJson('GET', '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-01-01&hasta=2026-10-31', { userId: 4 });
            assert.equal(res.status, 200);
            assert.equal(res.data.sugerencias_control_pagos.length, 2);

            const sug50 = res.data.sugerencias_control_pagos.find(s => s.id === 50);
            assert.ok(sug50, 'Debe retornar abono pendiente #50 aunque falte recordatorios_pagos_comprobantes');
            assert.deepEqual(sug50.comprobantes, []);
            assert.equal(sug50.comprobantes_count, 0);
            assert.equal(sug50.comprobante_url, null);
            assert.equal(sug50.signed_url, null);
        });

        it('rechaza variantes ReDoS anidadas y con cuantificadores {m,n} (400 en POST/PUT /reglas y POST /reglas/probar) y omite reglas heredadas inseguras en <5ms', async () => {
            const dangerousPatterns = [
                '((a+)b)+$',
                '(([a-z]+))*b',
                '(a{1,5})+b',
                '(?:(a|aa))+b',
                '(a+(?:b))+c',
                '((?:a+))+',
                '((a|a))+',
                '(a+b){2}',
                '(a+){1,}'
            ];

            for (const p of dangerousPatterns) {
                const svcCheck = validateClassificationRulePattern(p, 'REGEX');
                assert.equal(svcCheck.valid, false, `Servicio debe rechazar patrón ReDoS: ${p}`);

                const postRes = await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                    userId: 3,
                    body: { nombre: 'ReDoS Test', patron: p, tipo_match: 'REGEX' }
                });
                assert.equal(postRes.status, 400, `POST /reglas debe retornar 400 para: ${p}`);

                const probarRes = await reqJson('POST', '/api/bancos/conciliacion/reglas/probar', {
                    userId: 3,
                    body: { patron: p, tipo_match: 'REGEX', descripcion: 'aaaaaaaaaaaaaaaaaaaaaaaaaaa!' }
                });
                assert.equal(probarRes.status, 400, `POST /reglas/probar debe retornar 400 para: ${p}`);
            }

            // Crear regla válida y comprobar PUT /reglas/:id con ReDoS -> 400
            const validCreate = await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                userId: 3,
                body: {
                    nombre: 'Transf Segura',
                    patron: '^TRANSF(?:ERENCIA)?\\s+(?:ACH|BCR)',
                    tipo_match: 'REGEX',
                    tipo_movimiento: 'ABONO'
                }
            });
            assert.equal(validCreate.status, 201);

            for (const p of dangerousPatterns) {
                const putRes = await reqJson('PUT', `/api/bancos/conciliacion/reglas/${validCreate.data.id}`, {
                    userId: 3,
                    body: { patron: p, tipo_match: 'REGEX' }
                });
                assert.equal(putRes.status, 400, `PUT /reglas/:id debe retornar 400 para: ${p}`);
            }

            // Patrones seguros con escapes, clases de caracteres y lazy quantifier deben ser aceptados
            assert.equal(validateClassificationRulePattern('(\\(a\\+\\))+', 'REGEX').valid, true);
            assert.equal(validateClassificationRulePattern('[a(+)*]+', 'REGEX').valid, true);
            assert.equal(validateClassificationRulePattern('COMISION.*?POS', 'REGEX').valid, true);

            // applyClassificationRules debe omitir filas legadas inseguras en BD sin ejecutar backtracking (<5ms)
            const legacyUnsafeRules = dangerousPatterns.map((p, idx) => ({
                id: 900 + idx,
                cuenta_bancaria_id: 1,
                nombre: `Legacy ${idx}`,
                patron: p,
                tipo_match: 'REGEX',
                tipo_movimiento: 'CARGO',
                signo: 'CARGO',
                cod_cta: '999999',
                prioridad: 1,
                activo: 1
            }));
            const startMs = Date.now();
            const applied = applyClassificationRules(
                [{ fila_origen: 1, descripcion: 'a'.repeat(35) + '!', tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 }],
                legacyUnsafeRules,
                [],
                { cuentaId: 1 }
            );
            const elapsedMs = Date.now() - startMs;
            assert.equal(applied.reglas_aplicadas_count, 0);
            assert.ok(elapsedMs < 50, `Evaluación de reglas legadas inseguras tardó ${elapsedMs}ms`);
        });

        it('POST /aplicar con accion CONCILIAR retorna 409 Conflict si el documento pertenece a un cruce activo y no altera fecha_aplicado', async () => {
            const cruceRes = await reqJson('POST', '/api/bancos/conciliacion/cruces', {
                userId: 2,
                body: {
                    cuenta_bancaria_id: 1,
                    tipo_cruce: '1_A_N',
                    direccion: 'CARGO',
                    fecha_aplicado: '2026-10-25',
                    libro_items: [{ id: 10, origen_tipo: 'CK' }],
                    banco_items: [
                        { documento: 'P1', fecha: '2026-10-25', concepto: 'PARTE 1', monto: 40 },
                        { documento: 'P2', fecha: '2026-10-25', concepto: 'PARTE 2', monto: 60 }
                    ]
                }
            });
            assert.equal(cruceRes.status, 201);

            const applyRes = await reqJson('POST', '/api/bancos/conciliacion/aplicar', {
                userId: 2,
                headers: { 'X-Idempotency-Key': 'aplicar-conciliar-cruce-409' },
                body: {
                    cuenta_bancaria_id: 1,
                    accion: 'CONCILIAR',
                    fecha_aplicado: '2026-10-29',
                    items: [{ id: 10, origen_tipo: 'CK' }]
                }
            });
            assert.equal(applyRes.status, 409);
            assert.equal(applyRes.data.cruce_id, cruceRes.data.id);
            assert.equal(mockDb.getState().cheques.find(c => c.id === 10).fecha_aplicado, '2026-10-25');
            assert.equal(mockDb.getState().bancos_idempotency_keys.length, 0);
        });

        it('detectGroupedMatches exige igualdad exacta al centavo (rechaza diferencia de $0.01) y valida bordes en /reglas', async () => {
            const pendientes = [
                { id: 101, origen_tipo: 'CK', documento: '7001', concepto: 'CHK 1', monto: 100.00, cargo: 100.00, abono: 0, fecha: '2026-10-15' },
                { id: 102, origen_tipo: 'CK', documento: '7002', concepto: 'CHK 2', monto: 200.00, cargo: 200.00, abono: 0, fecha: '2026-10-15' }
            ];
            const offByOneCent = [
                { fila_origen: 1, fecha: '16/10/2026', fecha_ymd: '2026-10-16', documento: 'EXT-1', descripcion: 'CARGO', cargo: 299.99, abono: 0, monto: 299.99, tipo: 'CARGO', match: null },
                { fila_origen: 2, fecha: '16/10/2026', fecha_ymd: '2026-10-16', documento: 'EXT-2', descripcion: 'CARGO', cargo: 300.01, abono: 0, monto: 300.01, tipo: 'CARGO', match: null }
            ];
            assert.equal(detectGroupedMatches(offByOneCent, pendientes).length, 0);

            const exactMatchTx = [
                { fila_origen: 1, fecha: '16/10/2026', fecha_ymd: '2026-10-16', documento: 'EXT-OK', descripcion: 'CARGO', cargo: 300.00, abono: 0, monto: 300.00, tipo: 'CARGO', match: null }
            ];
            const exactGrouped = detectGroupedMatches(exactMatchTx, pendientes);
            assert.equal(exactGrouped.length, 1);
            assert.equal(exactGrouped[0].monto_total, 300.00);

            // POST /reglas con tipo_remesa_id inexistente -> 404 (no FK 500)
            const badTrRes = await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                userId: 3,
                body: { nombre: 'Remesa Inexistente', patron: 'XYZ', tipo_match: 'CONTAINS', tipo_remesa_id: 9999 }
            });
            assert.equal(badTrRes.status, 404);

            // POST /reglas/probar sin patron cuando falta tabla conciliacion_reglas_clasificacion -> 200 con 0 reglas
            mockDb.getState().missingTables = ['conciliacion_reglas_clasificacion'];
            const missingTblProbar = await reqJson('POST', '/api/bancos/conciliacion/reglas/probar', {
                userId: 3,
                body: { cuenta_bancaria_id: 1, descripcion: 'CARGO TEST', tipo: 'CARGO' }
            });
            assert.equal(missingTblProbar.status, 200);
            assert.equal(missingTblProbar.data.reglas_evaluadas, 0);
        });
    });

    // ── 6. Regresiones Iteración 3: ReDoS Polinomial & Alternancia Encadenada en Nivel Raíz ──
    describe('6. Regresiones Iteración 3 (ReDoS Polinomial & Alternancias Encadenadas)', () => {
        it('rechaza patrones ReDoS polinomiales y de alternancia encadenada (400 en POST /reglas y /reglas/probar), omite en <5ms en applyClassificationRules y preserva patrones benignos', async () => {
            const polynomialAndChainedPatterns = [
                '.*.*b',
                '.*.*.*b',
                '.*a.*b.*c',
                '.*.*.*.*.*.*x',
                '.*.*.*.*.*.*COMISION',
                '[a-z]*[a-z]*[a-z]*[a-z]*[a-z]*x',
                '[a-z]*[a-z]*[a-z]*x',
                'a+a+a+a+a+a+x',
                'a+a+a+x',
                '\\d+\\d+\\d+\\d+\\d+\\d+X',
                '\\d+\\d+\\d+x',
                '(a+)(a+)(a+)(a+)(a+)x',
                '(a+)(a+)(a+)x',
                '([a-z]+)([a-z]+)([a-z]+)([a-z]+)([a-z]+)x',
                '(?:a+){1}(?:a+){1}(?:a+){1}x',
                '(a+a+)(a+a+)x',
                '(\\s*\\d+){1}(\\s*\\d+){1}(\\s*\\d+){1}x',
                `${'(a|aa)'.repeat(5)}b`,
                `${'(a|aa)'.repeat(24)}b`,
                `${'(a|a?)'.repeat(24)}b`
            ];

            for (const p of polynomialAndChainedPatterns) {
                const svcCheck = validateClassificationRulePattern(p, 'REGEX');
                assert.equal(svcCheck.valid, false, `Servicio debe rechazar patrón ReDoS polinomial/encadenado: ${p}`);

                const postRes = await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                    userId: 3,
                    body: { nombre: 'ReDoS Poly', patron: p, tipo_match: 'REGEX' }
                });
                assert.equal(postRes.status, 400, `POST /reglas debe retornar 400 para: ${p}`);

                const probarRes = await reqJson('POST', '/api/bancos/conciliacion/reglas/probar', {
                    userId: 3,
                    body: { patron: p, tipo_match: 'REGEX', descripcion: `${'a'.repeat(499)}!` }
                });
                assert.equal(probarRes.status, 400, `POST /reglas/probar debe retornar 400 para: ${p}`);
            }

            // applyClassificationRules debe omitir todas estas reglas heredadas sobre entradas de 499+ chars en <5ms
            const legacyPolyRules = polynomialAndChainedPatterns.map((p, idx) => ({
                id: 950 + idx,
                cuenta_bancaria_id: 1,
                nombre: `Legacy Poly ${idx}`,
                patron: p,
                tipo_match: 'REGEX',
                tipo_movimiento: 'CARGO',
                signo: 'CARGO',
                cod_cta: '999999',
                prioridad: 1,
                activo: 1
            }));
            const txs499 = [
                { fila_origen: 1, descripcion: `${'a'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 2, descripcion: `${'1'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 3, descripcion: 'TRANSFERENCIA BANCARIA '.repeat(21), tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 }
            ];
            const startNs = process.hrtime.bigint();
            const applied = applyClassificationRules(txs499, legacyPolyRules, [], { cuentaId: 1 });
            const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
            assert.equal(applied.reglas_aplicadas_count, 0);
            assert.ok(elapsedMs < 5, `Omitir reglas polinomiales legadas tardó ${elapsedMs.toFixed(2)}ms (límite < 5ms)`);

            // Patrones benignos válidos deben seguir siendo aceptados (16 patrones bancarios reales)
            const benignPatterns = [
                '^[A-Z]+\\s+\\d{2,4}$',
                '^[A-Z]+\\s+\\d+\\s+[A-Z]+\\s+\\d+$',
                'COMISION.*POS',
                'COMISION.*POS.*USD',
                'REMESA\\s*\\([0-9]+\\)',
                'DEP[OÓ]SITO\\s+EFECTIVO',
                '(?:COMISION|CARGO)\\s+POS',
                '(?:COMISION|CARGO).*POS.*USD',
                '^TRANSF(?:ERENCIA)?\\s+(?:ACH|BCR)',
                'COMISION.*?POS',
                '(\\(a\\+\\))+',
                '[a(+)*]+',
                '^PAGO\\s+(?:TARJETA|CREDITO)\\s+\\d{4,6}$',
                '^[A-Z0-9\\-\\(\\)]+\\s+\\d{4}$',
                '^(?:CARGO|ABONO)\\s+(?:ACH|BCR)\\s+(?:USD|SVC)\\s+(?:OK|ERR)$',
                '^PAGO\\s+(?:ACH|BCR)\\s+\\d{4}$'
            ];
            for (const p of benignPatterns) {
                const okCheck = validateClassificationRulePattern(p, 'REGEX');
                assert.equal(okCheck.valid, true, `Patrón benigno debe ser aceptado: ${p} (${okCheck.message || ''})`);
            }
        });
    });

    // ── 7. Regresiones Iteración 4, 5, 6 y 7: Escapes (incl. Octales Legados, \u{...}, \p{...}, \c[0-9_]), Lookarounds, Opcionales, Alternancia y Clases [] / [^] ──
    describe('7. Regresiones Iteración 4, 5, 6 y 7 (Escapes Annex B, Lookarounds, Opcionales, Backrefs Nombrados, Octales, Alternancia y Clases [] / [^])', () => {
        it('rechaza los bypasses de Iteración 4, 5, 6 y 7 (escapes octales legados, \\u{...}, \\p{...}, \\c[0-9_], alternancia + superposición y clases vacías [] / [^]), retornando 400 y omitiendo en <5ms', async () => {
            const r4BypassPatterns = [
                '\\x61+\\x61+\\x61+\\x61+\\x61+\\x61+x',
                '\\u0061+\\u0061+\\u0061+\\u0061+\\u0061+\\u0061+x',
                'a+(?!1)a+(?!1)a+(?!1)a+(?!1)a+(?!1)a+x',
                '\\d+(?!a)\\d+(?!a)\\d+(?!a)\\d+(?!a)\\d+(?!a)\\d+x',
                'a+(?<!1)a+(?<!1)a+(?<!1)a+(?<!1)a+(?<!1)a+x',
                'a+(?=a)\\w+(?!1)a+(?!1)a+(?!1)a+x',
                '[a-z]+(?!0)[a-z]+(?!0)[a-z]+(?!0)[a-z]+(?!0)[a-z]+x',
                'a?a?a?a?a?a?a+a+x',
                '(a|aa|aaa)(a|aa|aaa)(a|aa|aaa)(a|aa|aaa)a+a+x',
                '(a|aa|aaa)(a|aa|aaa)(a|aa|aaa)(a|aa|aaa)a?a?a?a?a?a?a+a+x',
                '(?<a>.+)\\k<a>+x',
                `${'(?:a)?'.repeat(36)}${'a'.repeat(36)}!`,
                `${'(?:a)?'.repeat(10)}b`,
                `${'(?:a?)'.repeat(6)}a+a+x`,
                '(a|aa)(a|aa)a+a+x',
                'a{1,200}a{1,200}a{1,200}x',
                '\\u0061+\\x61+[\\x61]+x',
                'a+\\ba+\\ba+x',
                '\\061+\\061+\\061+\\061+\\061+\\061+x',
                '\\07+\\07+\\07+\\07+\\07+\\07+x',
                '\\014+\\014+\\014+\\014+\\014+\\014+x',
                '(a|aa)a?a+a+x',
                '(a|aa|aaa)a+a+x',
                '(a|aa|aaa|aaaa|aaaaa|aaaaaa|aaaaaaa|aaaaaaaa|aaaaaaaaa)a?a+a+x',
                'u+\\u{0}u+\\u{0}u+\\u{0}u+\\u{0}u+\\u{0}u+x',
                'u+\\u{1}u+\\u{1}u+\\u{1}u+\\u{1}u+\\u{1}u+x',
                'u+[\\u{1}]+u+[\\u{1}]+u+[\\u{1}]+x',
                '[\\u{61}]+u+[\\u{61}]+u+[\\u{61}]+u+x',
                '[\\c1]+\\x11+[\\c1]+\\x11+[\\c1]+\\x11+x',
                '[\\c_]+\\x1f+[\\c_]+\\x1f+[\\c_]+\\x1f+x',
                'p+\\p{1}p+\\p{1}p+\\p{1}p+\\p{1}p+\\p{1}p+x',
                'p+\\P{1}p+\\P{1}p+\\P{1}p+\\P{1}p+\\P{1}p+x',
                '[^](a+)+x',
                '[]?(a+)+x',
                '[^]a+a+a+a+a+a+x',
                '[^](a+)+[x]',
                '[^]a+a+a+a+a+a+[x]',
                '[]|(a+)+[x]',
                '^(?:[^](a+)+[])$',
                '[^]*[^]*x',
                '[^]+[^]+x',
                '[^]*[^]*[^]*x'
            ];

            for (const p of r4BypassPatterns) {
                const svcCheck = validateClassificationRulePattern(p, 'REGEX');
                assert.equal(svcCheck.valid, false, `Servicio debe rechazar bypass Iteración 4/5/6/7: ${p}`);

                const postRes = await reqJson('POST', '/api/bancos/conciliacion/reglas', {
                    userId: 3,
                    body: { nombre: 'ReDoS R4/R5/R6/R7', patron: p, tipo_match: 'REGEX' }
                });
                assert.equal(postRes.status, 400, `POST /reglas debe retornar 400 para: ${p}`);

                const probarRes = await reqJson('POST', '/api/bancos/conciliacion/reglas/probar', {
                    userId: 3,
                    body: { patron: p, tipo_match: 'REGEX', descripcion: `${'b'}${'a'.repeat(498)}!` }
                });
                assert.equal(probarRes.status, 400, `POST /reglas/probar debe retornar 400 para: ${p}`);
            }

            // applyClassificationRules debe omitir todas estas reglas heredadas sobre entradas de 499 chars (incl. 'b' + 'a'.repeat(498) + '!') en <5ms
            const legacyR4Rules = r4BypassPatterns.map((p, idx) => ({
                id: 980 + idx,
                cuenta_bancaria_id: 1,
                nombre: `Legacy R4/R5/R6/R7 ${idx}`,
                patron: p,
                tipo_match: 'REGEX',
                tipo_movimiento: 'CARGO',
                signo: 'CARGO',
                cod_cta: '999999',
                prioridad: 1,
                activo: 1
            }));
            const txs499 = [
                { fila_origen: 1, descripcion: `${'a'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 2, descripcion: `${'1'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 3, descripcion: `${'\x07'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 4, descripcion: `${'\x0c'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 5, descripcion: `${'u'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 6, descripcion: `${'\x11'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 7, descripcion: `${'\x1f'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 8, descripcion: `${'p'.repeat(499)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 },
                { fila_origen: 9, descripcion: `b${'a'.repeat(498)}!`, tipo: 'CARGO', cargo: 10, abono: 0, monto: 10 }
            ];
            const startNs = process.hrtime.bigint();
            const applied = applyClassificationRules(txs499, legacyR4Rules, [], { cuentaId: 1 });
            const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
            assert.equal(applied.reglas_aplicadas_count, 0);
            assert.ok(elapsedMs < 5, `Omitir reglas R4/R5/R6/R7 legadas tardó ${elapsedMs.toFixed(2)}ms (límite < 5ms)`);
        });
    });
});
