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
const { computeAccountReconciliationSummary } = require('../services/bancosIntegrityService');
const telegramGeminiService = require('../services/telegramGeminiService');
const telegramSentinelService = require('../services/telegramSentinelService');

const TINY_PNG_BUFFER = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
);
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BUFFER.toString('base64')}`;
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const MOVIMIENTOS_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'movimientos');

function createM1BMockDb() {
    const createInitialState = () => ({
        seq: {
            bancos: 20,
            tipos_cuenta_bancaria: 20,
            tipos_remesas: 20,
            chequeras: 20,
            movimientos_bancarios: 50,
            movimientos_bancarios_comprobantes: 20,
            cheques: 50,
            validaciones_saldo_banco: 20,
            conciliacion_periodos: 20,
            notifications: 20,
            telegram_sentinel_log: 20,
            bancos_auditoria_detalle: 100
        },
        externalDbThrows: false,
        externalDbNull: false,
        externalSpBancos: [
            { num_cta: '100-001-99', nom_banco: 'BANCO PROMERICA', saldo: 1400.00 },
            { num_cta: '200-002-88', nom_banco: 'BANCO AGRICOLA', saldo: 450.00 }
        ],
        externalSpChequera: [
            { num_cta: '100-001-99', nom_banco: 'BANCO PROMERICA', saldo: 1220.00 },
            { num_cta: '200-002-88', nom_banco: 'BANCO AGRICOLA', saldo: 450.00 }
        ],
        users: [
            { id: 1, username: 'admin_m1b', nombre: 'Admin M1B', status: 'active', role_id: 1, role_name: 'Administrator', token_version: 1 },
            { id: 2, username: 'bancos_op', nombre: 'Operador Bancos', status: 'active', role_id: 2, role_name: 'Contador', token_version: 1 },
            { id: 3, username: 'consulta_op', nombre: 'Consulta Saldos', status: 'active', role_id: 3, role_name: 'Consultor', token_version: 1 },
            { id: 4, username: 'sin_perm', nombre: 'Invitado', status: 'active', role_id: 4, role_name: 'Invitado', token_version: 1 },
            { id: 5, username: 'inactivo_bancos', nombre: 'Usuario Inactivo', status: 'inactive', role_id: 2, role_name: 'Contador', token_version: 1 }
        ],
        roles: [
            { id: 1, name: 'Administrator' },
            { id: 2, name: 'Contador' },
            { id: 3, name: 'Consultor' },
            { id: 4, name: 'Invitado' }
        ],
        rolePermissions: {
            1: ['manage_cuentas', 'manage_movimientos', 'manage_cheques', 'manage_chequeras', 'manage_conciliacion_bancaria', '/dashboard/bancos/reportes/saldos-bancos'],
            2: ['manage_cuentas', 'manage_movimientos', 'manage_cheques', 'manage_chequeras', 'view_conciliacion_bancaria', '/dashboard/bancos/movimientos', '/dashboard/bancos/cuentas'],
            3: ['/dashboard/bancos/reportes/saldos-bancos', '/dashboard/bancos/reportes/saldos-chequera', 'view_conciliacion_bancaria'],
            4: ['view_dashboard']
        },
        telegram_usuarios: [
            { id: 10, user_id: 1, telegram_user_id: '888000101', nombre: 'Admin TG', activo: 1, permiso_alertas: 1, permiso_saldos_banco: 1 },
            { id: 11, user_id: 4, telegram_user_id: '888000102', nombre: 'Sin Perm TG', activo: 1, permiso_alertas: 0, permiso_saldos_banco: 0 },
            { id: 12, user_id: 2, telegram_user_id: '888000103', nombre: 'Inactivo TG', activo: 0, permiso_alertas: 1, permiso_saldos_banco: 1 }
        ],
        empresas: [
            { id: 1, codigo: '001', nombre: 'CORPORATIVO SIPE S.A. DE C.V.' },
            { id: 2, codigo: '002', nombre: 'ESTACION MIRAFLORES' }
        ],
        bancos: [
            { id: 1, empresa_id: 1, codigo: '01', descripcion: 'BANCO PROMERICA' },
            { id: 2, empresa_id: 2, codigo: '01', descripcion: 'BANCO PROMERICA' },
            { id: 3, empresa_id: 1, codigo: '02', descripcion: 'BANCO AGRICOLA' },
            { id: 4, empresa_id: 2, codigo: '02', descripcion: 'BANCO AGRICOLA' }
        ],
        tipos_cuenta_bancaria: [
            { id: 1, empresa_id: 1, codigo: '01', descripcion: 'CUENTA CORRIENTE' },
            { id: 2, empresa_id: 2, codigo: '01', descripcion: 'CUENTA CORRIENTE' }
        ],
        tipos_remesas: [
            { id: 1, empresa_id: 1, codigo: 'RM', descripcion: 'REMESA' },
            { id: 2, empresa_id: 1, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 3, empresa_id: 1, codigo: 'TR', descripcion: 'TRANSFERENCIA' },
            { id: 4, empresa_id: 2, codigo: 'RM', descripcion: 'REMESA' },
            { id: 5, empresa_id: 2, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 6, empresa_id: 2, codigo: 'TR', descripcion: 'TRANSFERENCIA' }
        ],
        cuentas_bancarias: [
            {
                id: 1,
                empresa_id: 1,
                banco_id: 1,
                tipo_cuenta_id: 1,
                numero: '100-001-99',
                nombre: 'CTA OPERATIVA CORPO',
                cod_cta: '110201',
                activa: 1,
                orden: 1,
                saldo_inicial: 1000.00,
                fecha_saldo_inicial: '2026-10-01'
            },
            {
                id: 2,
                empresa_id: 2,
                banco_id: 4,
                tipo_cuenta_id: 2,
                numero: '200-002-88',
                nombre: 'CTA MIRAFLORES',
                cod_cta: '110202',
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
                desde: 1001,
                hasta: 1020,
                siguiente_correlativo: 1015,
                alerta_stock_bajo: 10,
                activo: 1,
                notas: 'Talonario principal'
            }
        ],
        movimientos_bancarios: [
            {
                id: 1,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-09-15',
                fecha_aplicado: '2026-09-15',
                documento: 'PRE-FLOOR',
                concepto: 'MOV ANTES DE SALDO INICIAL',
                monto: 5000.00,
                cargo: 0,
                abono: 5000.00,
                tipo_remesa_id: 1,
                cod_cta: '110201',
                num_partida: null,
                es_contabilizado: 0,
                comprobante_url: null,
                transfer_group_id: null,
                version: 1,
                deleted_at: null
            },
            {
                id: 2,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-05',
                fecha_aplicado: '2026-10-06',
                documento: 'DEP-100',
                concepto: 'DEPOSITO CONCILIADO',
                monto: 400.00,
                cargo: 0,
                abono: 400.00,
                tipo_remesa_id: 1,
                cod_cta: '110201',
                num_partida: 'P-1',
                es_contabilizado: 0,
                comprobante_url: '/api/uploads/movimientos/sample_legacy.webp',
                transfer_group_id: null,
                version: 1,
                deleted_at: null
            },
            {
                id: 3,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-12',
                fecha_aplicado: null,
                documento: 'DEP-TRANSITO',
                concepto: 'DEPOSITO EN TRANSITO',
                monto: 150.00,
                cargo: 0,
                abono: 150.00,
                tipo_remesa_id: 1,
                cod_cta: null,
                num_partida: null,
                es_contabilizado: 0,
                comprobante_url: null,
                transfer_group_id: null,
                version: 1,
                deleted_at: null
            },
            {
                id: 4,
                empresa_id: 2,
                cuenta_bancaria_id: 2,
                fecha: '2026-10-10',
                fecha_aplicado: '2026-10-10',
                documento: 'CARGO-50',
                concepto: 'COMISION BANCARIA',
                monto: 50.00,
                cargo: 50.00,
                abono: 0,
                tipo_remesa_id: 5,
                cod_cta: null,
                num_partida: null,
                es_contabilizado: 0,
                comprobante_url: null,
                transfer_group_id: null,
                version: 1,
                deleted_at: null
            }
        ],
        movimientos_bancarios_comprobantes: [],
        cheques: [
            {
                id: 1,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                chequera_id: 1,
                llave: '1-1010',
                fecha: '2026-10-08',
                fecha_aplicado: null,
                cheque: '1010',
                valor: 200.00,
                a_nombre: 'PROVEEDOR ALPHA',
                concepto: 'PAGO SERVICIOS',
                cheque_anulado: 0,
                fue_noemitido: 0,
                es_reservado: 0,
                es_contabilizado: 0,
                es_pago_contado: 0,
                num_partida: null,
                deleted_at: null
            },
            {
                id: 2,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                chequera_id: 1,
                llave: '1-1011',
                fecha: '2026-04-01',
                fecha_aplicado: null,
                cheque: '1011',
                valor: 300.00,
                a_nombre: 'PROVEEDOR ANTIGUO',
                concepto: 'ANTES FLOOR PERO NO',
                cheque_anulado: 0,
                fue_noemitido: 0,
                es_reservado: 0,
                es_contabilizado: 0,
                es_pago_contado: 0,
                num_partida: null,
                deleted_at: null
            },
            {
                id: 3,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                chequera_id: 1,
                llave: '1-1012',
                fecha: '2026-10-14',
                fecha_aplicado: null,
                cheque: '1012',
                valor: 130.00,
                a_nombre: 'PROVEEDOR RECIENTE',
                concepto: 'COMPRA INSUMOS',
                cheque_anulado: 0,
                fue_noemitido: 0,
                es_reservado: 0,
                es_contabilizado: 0,
                es_pago_contado: 0,
                num_partida: null,
                deleted_at: null
            },
            {
                id: 4,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                chequera_id: 1,
                llave: '1-1013',
                fecha: '2026-10-14',
                fecha_aplicado: null,
                cheque: '1013',
                valor: 999.00,
                a_nombre: 'ANULADO',
                concepto: 'ANULADO',
                cheque_anulado: 1,
                fue_noemitido: 0,
                es_reservado: 0,
                es_contabilizado: 0,
                es_pago_contado: 0,
                num_partida: null,
                deleted_at: null
            }
        ],
        validaciones_saldo_banco: [
            {
                id: 1,
                cuenta_bancaria_id: 1,
                fecha_validacion: '2026-11-20',
                fecha_corte: '2026-11-20',
                monto_banco: 1400.00,
                saldo_chequera: 1220.00,
                saldo_conciliado_libros: 1400.00,
                diferencia: 0.00,
                notas: 'Validación reciente'
            },
            {
                id: 2,
                cuenta_bancaria_id: 2,
                fecha_validacion: '2026-11-01',
                fecha_corte: '2026-11-01',
                monto_banco: 450.00,
                saldo_chequera: 450.00,
                saldo_conciliado_libros: 450.00,
                diferencia: 0.00,
                notas: 'Validación antigua (>7 días)'
            }
        ],
        conciliacion_periodos: [
            {
                id: 1,
                cuenta_bancaria_id: 1,
                fecha_corte: '2026-10-31',
                estado: 'CERRADO',
                cerrado_por_nombre: 'Admin',
                cerrado_at: '2026-11-01'
            },
            {
                id: 2,
                cuenta_bancaria_id: 2,
                fecha_corte: '2026-10-31',
                estado: 'REABIERTO',
                cerrado_por_nombre: 'Admin',
                reabierto_por_nombre: 'Admin'
            }
        ],
        conciliacion_reglas_clasificacion: [],
        bancos_idempotency_keys: [],
        bancos_auditoria_detalle: [],
        notifications: [],
        telegram_sentinel_log: []
    });

    let state = createInitialState();

    const expandInParams = (sql, params) => {
        // Basic helper for IN (?) array expansion in mock queries
        let idx = 0;
        const outParams = [];
        const newSql = sql.replace(/\?/g, () => {
            const val = params[idx++];
            if (Array.isArray(val)) {
                outParams.push(...val);
                return val.map(() => '?').join(',');
            }
            outParams.push(val);
            return '?';
        });
        return { sql: newSql, params: outParams };
    };

    const runQuery = async (rawSql, rawParams = []) => {
        const sql = String(rawSql || '').replace(/\s+/g, ' ').trim();
        const sqlLow = sql.toLowerCase();

        // Auth middleware
        if (sqlLow.startsWith('select id, status from users')) {
            return [state.users.map(u => ({ id: u.id, status: u.status }))];
        }
        if (sqlLow.includes('from users u left join roles r on u.role_id = r.id where u.id = ?')) {
            const uid = Number(rawParams[0]);
            const u = state.users.find(x => x.id === uid);
            return [u ? [{ ...u }] : []];
        }
        if (sqlLow.includes('from permissions p join role_permissions rp') && sqlLow.includes('where rp.role_id = ?')) {
            const rid = Number(rawParams[0]);
            const perms = state.rolePermissions[rid] || [];
            return [perms.map(name => ({ name }))];
        }
        if (sqlLow.startsWith('select name from roles where id =')) {
            const rid = Number(rawParams[0]);
            const r = state.roles.find(x => x.id === rid);
            return [r ? [{ name: r.name }] : []];
        }

        // DDL / Schema creation
        if (sqlLow.startsWith('create table if not exists telegram_sentinel_log')) {
            return [{ affectedRows: 0 }];
        }

        // Idempotency
        if (sqlLow.startsWith('select ') && sqlLow.includes('from bancos_idempotency_keys')) {
            const [key, scope] = rawParams;
            const found = state.bancos_idempotency_keys.find(r => r.idempotency_key === key && r.scope === scope);
            return [found ? [{ ...found }] : []];
        }
        if (sqlLow.startsWith('insert into bancos_idempotency_keys')) {
            const [key, scope, userId, hash] = rawParams;
            const exists = state.bancos_idempotency_keys.some(r => r.idempotency_key === key && r.scope === scope);
            if (exists) {
                const dupErr = new Error('Duplicate entry');
                dupErr.code = 'ER_DUP_ENTRY';
                throw dupErr;
            }
            state.bancos_idempotency_keys.push({
                idempotency_key: key,
                scope,
                user_id: userId,
                request_hash: hash,
                status_code: null,
                response_json: null
            });
            return [{ affectedRows: 1 }];
        }
        if (sqlLow.startsWith('update bancos_idempotency_keys set status_code =')) {
            const [statusCode, respJson, key, scope] = rawParams;
            const row = state.bancos_idempotency_keys.find(r => r.idempotency_key === key && r.scope === scope);
            if (row) {
                row.status_code = statusCode;
                row.response_json = respJson;
            }
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sqlLow.startsWith('delete from bancos_idempotency_keys where idempotency_key = ? and scope = ? and status_code is null')) {
            const [key, scope] = rawParams;
            const before = state.bancos_idempotency_keys.length;
            state.bancos_idempotency_keys = state.bancos_idempotency_keys.filter(
                r => !(r.idempotency_key === key && r.scope === scope && (r.status_code === null || r.status_code === undefined))
            );
            return [{ affectedRows: before - state.bancos_idempotency_keys.length }];
        }

        // Audit insert
        if (sqlLow.startsWith('insert into bancos_auditoria_detalle')) {
            const id = ++state.seq.bancos_auditoria_detalle;
            state.bancos_auditoria_detalle.push({ id, rawParams });
            return [{ insertId: id, affectedRows: 1 }];
        }

        // Empresas
        if (sqlLow.startsWith('select id, codigo, nombre from empresas')) {
            if (sqlLow.includes('where codigo = ? or id = ?')) {
                const v = rawParams[0];
                const rows = state.empresas.filter(e => String(e.codigo) === String(v) || Number(e.id) === Number(v));
                return [rows.map(e => ({ ...e }))];
            }
            return [state.empresas.map(e => ({ ...e }))];
        }
        if (sqlLow.startsWith('select id from empresas where codigo = ? or id = ?')) {
            const v = rawParams[0];
            const rows = state.empresas.filter(e => String(e.codigo) === String(v) || Number(e.id) === Number(v));
            return [rows.map(e => ({ id: e.id }))];
        }
        if (sqlLow.startsWith('select id from empresas where codigo = ?')) {
            const rows = state.empresas.filter(e => String(e.codigo) === String(rawParams[0]));
            return [rows.map(e => ({ id: e.id }))];
        }
        if (sqlLow.startsWith('select codigo as id, nombre from empresas')) {
            return [state.empresas.map(e => ({ id: e.codigo, nombre: e.nombre }))];
        }

        // Bancos catalog
        if (sqlLow.includes('from bancos') && sqlLow.includes('for update')) {
            const codigo = String(rawParams[0]);
            const empId = rawParams.length > 1 ? Number(rawParams[1]) : null;
            const rows = state.bancos.filter(b => String(b.codigo) === codigo && (!empId || Number(b.empresa_id) === empId));
            return [rows.map(r => ({ ...r }))];
        }
        if (sqlLow.startsWith('select id, codigo, descripcion from bancos where empresa_id in')) {
            const empIds = Array.isArray(rawParams[0]) ? rawParams[0].map(Number) : [Number(rawParams[0])];
            const descUp = String(rawParams[1]).toUpperCase();
            const exclCodigo = String(rawParams[2]);
            const rows = state.bancos.filter(b =>
                empIds.includes(Number(b.empresa_id)) &&
                String(b.descripcion).toUpperCase() === descUp &&
                String(b.codigo) !== exclCodigo
            );
            return [rows.map(r => ({ ...r }))];
        }
        if (sqlLow.startsWith('update bancos set descripcion = ? where codigo = ?')) {
            const desc = rawParams[0];
            const codigo = String(rawParams[1]);
            const empId = rawParams.length > 2 ? Number(rawParams[2]) : null;
            let count = 0;
            for (const b of state.bancos) {
                if (String(b.codigo) === codigo && (!empId || Number(b.empresa_id) === empId)) {
                    b.descripcion = desc;
                    count++;
                }
            }
            return [{ affectedRows: count }];
        }

        // tipos_cuenta_bancaria
        if (sqlLow.includes('from tipos_cuenta_bancaria t') && sqlLow.includes('join empresas e')) {
            if (sqlLow.includes('where t.empresa_id = ?')) {
                const empId = Number(rawParams[0]);
                const emp = state.empresas.find(e => e.id === empId);
                return [state.tipos_cuenta_bancaria.filter(t => t.empresa_id === empId).map(t => ({
                    codigo: t.codigo,
                    descripcion: t.descripcion,
                    empresas_count: 1,
                    empresas_nombres: emp?.nombre || ''
                }))];
            }
            const byKey = new Map();
            for (const t of state.tipos_cuenta_bancaria) {
                const k = `${t.codigo}|${t.descripcion}`;
                const emp = state.empresas.find(e => e.id === t.empresa_id);
                if (!byKey.has(k)) byKey.set(k, { codigo: t.codigo, descripcion: t.descripcion, emps: new Set(), names: [] });
                byKey.get(k).emps.add(t.empresa_id);
                if (emp) byKey.get(k).names.push(emp.nombre);
            }
            return [[...byKey.values()].map(g => ({
                codigo: g.codigo,
                descripcion: g.descripcion,
                empresas_count: g.emps.size,
                empresas_nombres: g.names.join(', ')
            }))];
        }
        if (sqlLow.startsWith('select max(cast(codigo as unsigned)) as max_cod from tipos_cuenta_bancaria')) {
            const nums = state.tipos_cuenta_bancaria.map(t => (/^\d+$/.test(t.codigo) ? Number(t.codigo) : 0));
            return [[{ max_cod: nums.length ? Math.max(...nums) : 0 }]];
        }
        if (sqlLow.startsWith('select id from tipos_cuenta_bancaria where empresa_id = ? and codigo = ?')) {
            return [state.tipos_cuenta_bancaria.filter(t => t.empresa_id === Number(rawParams[0]) && t.codigo === String(rawParams[1])).map(t => ({ id: t.id }))];
        }
        if (sqlLow.startsWith('select id from tipos_cuenta_bancaria where empresa_id = ? and upper(descripcion) = ?')) {
            return [state.tipos_cuenta_bancaria.filter(t => t.empresa_id === Number(rawParams[0]) && t.descripcion.toUpperCase() === String(rawParams[1]).toUpperCase()).map(t => ({ id: t.id }))];
        }
        if (sqlLow.startsWith('insert into tipos_cuenta_bancaria')) {
            const id = ++state.seq.tipos_cuenta_bancaria;
            state.tipos_cuenta_bancaria.push({ id, empresa_id: Number(rawParams[0]), codigo: String(rawParams[1]), descripcion: String(rawParams[2]) });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLow.includes('from tipos_cuenta_bancaria where codigo = ?') && sqlLow.includes('for update')) {
            const codigo = String(rawParams[0]);
            const empId = rawParams.length > 1 ? Number(rawParams[1]) : null;
            return [state.tipos_cuenta_bancaria.filter(t => t.codigo === codigo && (!empId || t.empresa_id === empId)).map(t => ({ ...t }))];
        }
        if (sqlLow.startsWith('select id from tipos_cuenta_bancaria where empresa_id in')) {
            const empIds = (Array.isArray(rawParams[0]) ? rawParams[0] : [rawParams[0]]).map(Number);
            const desc = String(rawParams[1]).toUpperCase();
            const excl = String(rawParams[2]);
            return [state.tipos_cuenta_bancaria.filter(t => empIds.includes(t.empresa_id) && t.descripcion.toUpperCase() === desc && t.codigo !== excl).map(t => ({ id: t.id }))];
        }
        if (sqlLow.startsWith('update tipos_cuenta_bancaria set descripcion = ?')) {
            const desc = rawParams[0];
            const codigo = String(rawParams[1]);
            const empId = rawParams.length > 2 ? Number(rawParams[2]) : null;
            let cnt = 0;
            for (const t of state.tipos_cuenta_bancaria) {
                if (t.codigo === codigo && (!empId || t.empresa_id === empId)) { t.descripcion = desc; cnt++; }
            }
            return [{ affectedRows: cnt }];
        }
        if (sqlLow.includes('from cuentas_bancarias cb inner join tipos_cuenta_bancaria t on cb.tipo_cuenta_id = t.id where t.codigo = ?')) {
            const codigo = String(rawParams[0]);
            const tipoIds = new Set(state.tipos_cuenta_bancaria.filter(t => t.codigo === codigo).map(t => t.id));
            const cnt = state.cuentas_bancarias.filter(c => tipoIds.has(c.tipo_cuenta_id)).length;
            return [[{ cnt }]];
        }
        if (sqlLow.startsWith('delete from tipos_cuenta_bancaria where codigo = ?')) {
            const codigo = String(rawParams[0]);
            const before = state.tipos_cuenta_bancaria.length;
            state.tipos_cuenta_bancaria = state.tipos_cuenta_bancaria.filter(t => t.codigo !== codigo);
            return [{ affectedRows: before - state.tipos_cuenta_bancaria.length }];
        }

        // tipos_remesas
        if (sqlLow.includes('from tipos_remesas t') && sqlLow.includes('join empresas e')) {
            if (sqlLow.includes('where t.empresa_id = ?')) {
                const empId = Number(rawParams[0]);
                const emp = state.empresas.find(e => e.id === empId);
                return [state.tipos_remesas.filter(t => t.empresa_id === empId).map(t => ({
                    codigo: t.codigo,
                    descripcion: t.descripcion,
                    empresas_count: 1,
                    empresas_nombres: emp?.nombre || ''
                }))];
            }
            const byKey = new Map();
            for (const t of state.tipos_remesas) {
                const k = `${t.codigo}|${t.descripcion}`;
                const emp = state.empresas.find(e => e.id === t.empresa_id);
                if (!byKey.has(k)) byKey.set(k, { codigo: t.codigo, descripcion: t.descripcion, emps: new Set(), names: [] });
                byKey.get(k).emps.add(t.empresa_id);
                if (emp) byKey.get(k).names.push(emp.nombre);
            }
            return [[...byKey.values()].map(g => ({
                codigo: g.codigo,
                descripcion: g.descripcion,
                empresas_count: g.emps.size,
                empresas_nombres: g.names.join(', ')
            }))];
        }
        if (sqlLow.startsWith('select max(cast(codigo as unsigned)) as max_cod from tipos_remesas')) {
            const nums = state.tipos_remesas.map(t => (/^\d+$/.test(t.codigo) ? Number(t.codigo) : 0));
            return [[{ max_cod: nums.length ? Math.max(...nums) : 0 }]];
        }
        if (sqlLow.startsWith('select id from tipos_remesas where empresa_id = ? and codigo = ?')) {
            return [state.tipos_remesas.filter(t => t.empresa_id === Number(rawParams[0]) && t.codigo === String(rawParams[1])).map(t => ({ id: t.id }))];
        }
        if (sqlLow.startsWith('select id from tipos_remesas where empresa_id = ? and codigo in')) {
            const empId = Number(rawParams[0]);
            const match = state.tipos_remesas.filter(t => t.empresa_id === empId && ['TR', 'NC', 'NA'].includes(t.codigo));
            match.sort((a, b) => (b.codigo === 'TR' ? 1 : 0) - (a.codigo === 'TR' ? 1 : 0));
            return [match.slice(0, 1).map(t => ({ id: t.id }))];
        }
        if (sqlLow.startsWith('select id from tipos_remesas where empresa_id = ? and upper(descripcion) = ?')) {
            return [state.tipos_remesas.filter(t => t.empresa_id === Number(rawParams[0]) && t.descripcion.toUpperCase() === String(rawParams[1]).toUpperCase()).map(t => ({ id: t.id }))];
        }
        if (sqlLow.startsWith('insert into tipos_remesas')) {
            const id = ++state.seq.tipos_remesas;
            state.tipos_remesas.push({ id, empresa_id: Number(rawParams[0]), codigo: String(rawParams[1]), descripcion: String(rawParams[2]) });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLow.includes('from tipos_remesas where upper(codigo) = ?') && sqlLow.includes('for update')) {
            const codigoUp = String(rawParams[0]).toUpperCase();
            const empId = rawParams.length > 1 ? Number(rawParams[1]) : null;
            return [state.tipos_remesas.filter(t => t.codigo.toUpperCase() === codigoUp && (!empId || t.empresa_id === empId)).map(t => ({ ...t }))];
        }
        if (sqlLow.startsWith('select id from tipos_remesas where empresa_id in')) {
            const empIds = (Array.isArray(rawParams[0]) ? rawParams[0] : [rawParams[0]]).map(Number);
            const desc = String(rawParams[1]).toUpperCase();
            const excl = String(rawParams[2]);
            return [state.tipos_remesas.filter(t => empIds.includes(t.empresa_id) && t.descripcion.toUpperCase() === desc && t.codigo !== excl).map(t => ({ id: t.id }))];
        }
        if (sqlLow.startsWith('update tipos_remesas set descripcion = ?')) {
            const desc = rawParams[0];
            const codigo = String(rawParams[1]);
            const empId = rawParams.length > 2 ? Number(rawParams[2]) : null;
            let cnt = 0;
            for (const t of state.tipos_remesas) {
                if (t.codigo === codigo && (!empId || t.empresa_id === empId)) { t.descripcion = desc; cnt++; }
            }
            return [{ affectedRows: cnt }];
        }
        if (sqlLow.startsWith('select count(*) as cnt from movimientos_bancarios where tipo_remesa_id in')) {
            const ids = (Array.isArray(rawParams[0]) ? rawParams[0] : [rawParams[0]]).map(Number);
            const cnt = state.movimientos_bancarios.filter(m => ids.includes(Number(m.tipo_remesa_id))).length;
            return [[{ cnt }]];
        }
        if (sqlLow.startsWith('select count(*) as cnt from conciliacion_reglas_clasificacion where tipo_remesa_id in')) {
            const ids = (Array.isArray(rawParams[0]) ? rawParams[0] : [rawParams[0]]).map(Number);
            const cnt = state.conciliacion_reglas_clasificacion.filter(r => ids.includes(Number(r.tipo_remesa_id))).length;
            return [[{ cnt }]];
        }
        if (sqlLow.startsWith('delete from tipos_remesas where codigo = ?')) {
            const codigo = String(rawParams[0]);
            const before = state.tipos_remesas.length;
            state.tipos_remesas = state.tipos_remesas.filter(t => t.codigo !== codigo);
            return [{ affectedRows: before - state.tipos_remesas.length }];
        }

        // cuentas_bancarias
        if (sqlLow.startsWith('select id, saldo_inicial, fecha_saldo_inicial from cuentas_bancarias where id = ?')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(rawParams[0]));
            return [c ? [{ id: c.id, saldo_inicial: c.saldo_inicial, fecha_saldo_inicial: c.fecha_saldo_inicial }] : []];
        }
        if (sqlLow.startsWith('select id, empresa_id, numero, nombre, saldo_inicial, fecha_saldo_inicial from cuentas_bancarias where id = ?')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(rawParams[0]));
            return [c ? [{ ...c }] : []];
        }
        if (sqlLow.startsWith('select id, activa, numero, nombre from cuentas_bancarias where id = ?')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(rawParams[0]));
            return [c ? [{ id: c.id, activa: c.activa, numero: c.numero, nombre: c.nombre }] : []];
        }
        if (sqlLow.startsWith('select id, empresa_id from cuentas_bancarias where id = ? and activa = true')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(rawParams[0]) && Boolean(x.activa));
            return [c ? [{ id: c.id, empresa_id: c.empresa_id }] : []];
        }
        if (sqlLow.includes('from cuentas_bancarias c') && sqlLow.includes('where c.id = ? and c.activa = true')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(rawParams[0]) && Boolean(x.activa));
            if (!c) return [[]];
            const e = state.empresas.find(x => x.id === c.empresa_id);
            const b = state.bancos.find(x => x.id === c.banco_id);
            return [[{
                id: c.id, numero: c.numero, nombre: c.nombre, empresa_id: c.empresa_id,
                empresa_codigo: e?.codigo || '', empresa_nombre: e?.nombre || '', banco_nombre: b?.descripcion || ''
            }]];
        }
        if (sqlLow.startsWith('select id from cuentas_bancarias where numero = ?')) {
            const numero = String(rawParams[0]);
            const onlyActive = sqlLow.includes('activa = true');
            const matches = state.cuentas_bancarias.filter(x => x.numero === numero && (!onlyActive || Boolean(x.activa)));
            const lim = sqlLow.includes('limit 2') ? 2 : 1;
            return [matches.slice(0, lim).map(c => ({ id: c.id }))];
        }
        if (sqlLow.includes('from cuentas_bancarias cb') && sqlLow.includes('where cb.numero = ?')) {
            const numero = String(rawParams[0]);
            const empParam = rawParams[1];
            const matches = state.cuentas_bancarias.filter(c => {
                if (c.numero !== numero) return false;
                const e = state.empresas.find(x => x.id === c.empresa_id);
                return e && (String(e.codigo) === String(empParam) || Number(e.id) === Number(empParam));
            });
            const lim = sqlLow.includes('limit 2') ? 2 : 1;
            return [matches.slice(0, lim).map(c => ({ id: c.id }))];
        }
        if (sqlLow.includes('from cuentas_bancarias c') && sqlLow.includes('where c.numero = ?')) {
            const numero = String(rawParams[0]);
            const matches = state.cuentas_bancarias.filter(x => x.numero === numero && Boolean(x.activa));
            if (sqlLow.includes('(e.codigo = ? or e.id = ?)')) {
                const empParam = rawParams[1];
                const filtered = matches.filter(c => {
                    const e = state.empresas.find(x => x.id === c.empresa_id);
                    return e && (String(e.codigo) === String(empParam) || Number(e.id) === Number(empParam));
                });
                return [filtered.map(c => {
                    const e = state.empresas.find(x => x.id === c.empresa_id);
                    const b = state.bancos.find(x => x.id === c.banco_id);
                    return { id: c.id, numero: c.numero, nombre: c.nombre, empresa_id: c.empresa_id, empresa_codigo: e?.codigo || '', empresa_nombre: e?.nombre || '', banco_nombre: b?.descripcion || '' };
                })];
            }
            const lim = sqlLow.includes('limit 2') ? 2 : 1;
            return [matches.slice(0, lim).map(c => {
                const e = state.empresas.find(x => x.id === c.empresa_id);
                const b = state.bancos.find(x => x.id === c.banco_id);
                return { id: c.id, numero: c.numero, nombre: c.nombre, empresa_id: c.empresa_id, empresa_codigo: e?.codigo || '', empresa_nombre: e?.nombre || '', banco_nombre: b?.descripcion || '' };
            })];
        }
        if (sqlLow.includes('from cuentas_bancarias c') && sqlLow.includes('c.id as raw_id')) {
            return [state.cuentas_bancarias.filter(c => Boolean(c.activa)).map(c => {
                const e = state.empresas.find(x => x.id === c.empresa_id);
                const b = state.bancos.find(x => x.id === c.banco_id);
                return { raw_id: c.id, numero: c.numero, nombre: c.nombre, banco_nombre: b?.descripcion || 'BANCO', empresa_nombre: e?.nombre || '' };
            })];
        }
        if (sqlLow.includes('from cuentas_bancarias cb') && (sqlLow.includes('cb.saldo_inicial') || sqlLow.includes('cb.fecha_saldo_inicial'))) {
            let rows = state.cuentas_bancarias.map(cb => {
                const e = state.empresas.find(x => x.id === cb.empresa_id);
                const b = state.bancos.find(x => x.id === cb.banco_id);
                const t = state.tipos_cuenta_bancaria.find(x => x.id === cb.tipo_cuenta_id);
                return {
                    ...cb,
                    empresa_codigo: e?.codigo || '',
                    empresa_nombre: e?.nombre || '',
                    banco_codigo: b?.codigo || '',
                    banco_nombre: b?.descripcion || 'Banco',
                    tipo_cuenta_nombre: t?.descripcion || ''
                };
            });
            let pIdx = 0;
            if (sqlLow.includes('cb.activa = true') || sqlLow.includes('cb.activa = 1')) {
                rows = rows.filter(r => Boolean(r.activa));
            }
            if (sqlLow.includes('(e.id = ? or e.codigo = ?)')) {
                const ev = rawParams[pIdx++]; pIdx++;
                rows = rows.filter(r => Number(r.empresa_id) === Number(ev) || String(r.empresa_codigo) === String(ev));
            }
            if (sqlLow.includes('(b.id = ? or b.codigo = ?)')) {
                const bv = rawParams[pIdx++]; pIdx++;
                rows = rows.filter(r => Number(r.banco_id) === Number(bv) || String(r.banco_codigo) === String(bv));
            }
            if (sqlLow.includes('cb.id = ?')) {
                const cid = Number(rawParams[pIdx++]);
                rows = rows.filter(r => Number(r.id) === cid);
            }
            rows.sort((a, b) => a.banco_nombre.localeCompare(b.banco_nombre) || a.numero.localeCompare(b.numero));
            return [rows];
        }

        // Chequeras
        if (sqlLow.includes('from chequeras chq inner join cuentas_bancarias cb')) {
            let rows = [...state.chequeras];
            let pIdx = 0;
            if (sqlLow.includes('chq.cuenta_bancaria_id = ?')) {
                const cid = Number(rawParams[pIdx++]);
                rows = rows.filter(r => r.cuenta_bancaria_id === cid);
            }
            if (sqlLow.includes('(e.codigo = ? or e.id = ?)')) {
                const ev = rawParams[pIdx++]; pIdx++;
                rows = rows.filter(r => {
                    const cb = state.cuentas_bancarias.find(c => c.id === r.cuenta_bancaria_id);
                    const e = cb && state.empresas.find(emp => emp.id === cb.empresa_id);
                    return e && (String(e.codigo) === String(ev) || Number(e.id) === Number(ev));
                });
            }
            if (sqlLow.includes('chq.activo = ?')) {
                const act = Number(rawParams[pIdx++]);
                rows = rows.filter(r => Number(r.activo ? 1 : 0) === act);
            }
            return [rows.map(r => {
                const cb = state.cuentas_bancarias.find(c => c.id === r.cuenta_bancaria_id);
                const e = cb && state.empresas.find(emp => emp.id === cb.empresa_id);
                const b = cb && state.bancos.find(ban => ban.id === cb.banco_id);
                return {
                    ...r,
                    numero_cuenta: cb?.numero || '',
                    cuenta_nombre: cb?.nombre || '',
                    id_empresa: e?.codigo || '',
                    empresa_nombre: e?.nombre || '',
                    cod_banco: b?.codigo || '',
                    banco_nombre: b?.descripcion || ''
                };
            })];
        }
        if (sqlLow.includes('from chequeras where cuenta_bancaria_id = ? and activo = 1') && sqlLow.includes('not (hasta < ? or desde > ?)')) {
            const ctaId = Number(rawParams[0]);
            let pIdx = 1;
            const exclId = sqlLow.includes('and id <> ?') ? Number(rawParams[pIdx++]) : null;
            const desde = Number(rawParams[pIdx++]);
            const hasta = Number(rawParams[pIdx++]);
            const ov = state.chequeras.filter(c =>
                c.cuenta_bancaria_id === ctaId &&
                Boolean(c.activo) &&
                (!exclId || c.id !== exclId) &&
                !(c.hasta < desde || c.desde > hasta)
            );
            return [ov.map(c => ({ ...c }))];
        }
        if (sqlLow.includes('from chequeras where cuenta_bancaria_id = ? and activo = 1')) {
            const ctaId = Number(rawParams[0]);
            const rows = state.chequeras.filter(c => c.cuenta_bancaria_id === ctaId && Boolean(c.activo));
            return [rows.map(c => ({ ...c }))];
        }
        if (sqlLow.startsWith('insert into chequeras')) {
            const id = ++state.seq.chequeras;
            const [ctaId, serie, desde, hasta, sig, alerta, activo, notas, createdBy] = rawParams;
            state.chequeras.push({
                id,
                cuenta_bancaria_id: Number(ctaId),
                serie,
                desde: Number(desde),
                hasta: Number(hasta),
                siguiente_correlativo: Number(sig),
                alerta_stock_bajo: Number(alerta),
                activo: Number(activo),
                notas,
                created_by: createdBy
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLow.startsWith('select * from chequeras where id = ?')) {
            const id = Number(rawParams[0]);
            const found = state.chequeras.find(c => c.id === id);
            return [found ? [{ ...found }] : []];
        }
        if (sqlLow.startsWith('update chequeras set serie = ?')) {
            const [serie, desde, hasta, sig, alerta, activo, notas, id] = rawParams;
            const row = state.chequeras.find(c => c.id === Number(id));
            if (row) {
                Object.assign(row, {
                    serie,
                    desde: Number(desde),
                    hasta: Number(hasta),
                    siguiente_correlativo: Number(sig),
                    alerta_stock_bajo: Number(alerta),
                    activo: Number(activo),
                    notas
                });
            }
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sqlLow.startsWith('select count(*) as cnt from cheques where chequera_id = ?')) {
            const id = Number(rawParams[0]);
            const cnt = state.cheques.filter(c => Number(c.chequera_id) === id && !c.deleted_at).length;
            return [[{ cnt }]];
        }
        if (sqlLow.startsWith('update chequeras set activo = 0 where id = ?')) {
            const row = state.chequeras.find(c => c.id === Number(rawParams[0]));
            if (row) row.activo = 0;
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sqlLow.startsWith('delete from chequeras where id = ?')) {
            const before = state.chequeras.length;
            state.chequeras = state.chequeras.filter(c => c.id !== Number(rawParams[0]));
            return [{ affectedRows: before - state.chequeras.length }];
        }

        // Conciliacion periodos
        if (sqlLow.includes('from conciliacion_periodos') && sqlLow.includes("estado = 'cerrado'")) {
            const ctaId = Number(rawParams[0]);
            const rows = state.conciliacion_periodos
                .filter(p => p.cuenta_bancaria_id === ctaId && p.estado === 'CERRADO')
                .sort((a, b) => String(b.fecha_corte).localeCompare(String(a.fecha_corte)));
            return [rows.slice(0, 1).map(p => ({ ...p }))];
        }
        if (sqlLow.includes('from conciliacion_periodos') && sqlLow.includes('where cuenta_bancaria_id in')) {
            const expanded = expandInParams(sql, rawParams);
            const ids = new Set(expanded.params.map(Number));
            const rows = state.conciliacion_periodos
                .filter(p => ids.has(Number(p.cuenta_bancaria_id)))
                .sort((a, b) => String(b.fecha_corte).localeCompare(String(a.fecha_corte)) || b.id - a.id);
            return [rows.map(p => ({ ...p }))];
        }

        // Validaciones saldo banco
        if (sqlLow.includes('from validaciones_saldo_banco') && sqlLow.includes('where cuenta_bancaria_id in')) {
            const expanded = expandInParams(sql, rawParams);
            const ids = new Set(expanded.params.map(Number));
            const rows = state.validaciones_saldo_banco
                .filter(v => ids.has(Number(v.cuenta_bancaria_id)))
                .sort((a, b) => String(b.fecha_validacion).localeCompare(String(a.fecha_validacion)) || b.id - a.id);
            return [rows.map(v => ({ ...v }))];
        }
        if (sqlLow.includes('max(fecha_validacion) as ultima_validacion from validaciones_saldo_banco')) {
            const byCta = new Map();
            for (const v of state.validaciones_saldo_banco) {
                const prev = byCta.get(v.cuenta_bancaria_id);
                if (!prev || v.fecha_validacion > prev) byCta.set(v.cuenta_bancaria_id, v.fecha_validacion);
            }
            return [[...byCta.entries()].map(([cuenta_bancaria_id, ultima_validacion]) => ({ cuenta_bancaria_id, ultima_validacion }))];
        }

        // Movimientos aggregation for computeAccountReconciliationSummary & Kardex
        if (sqlLow.includes('total_abonos_libros') && sqlLow.includes('from movimientos_bancarios')) {
            const [hasta1, , ctaId, hasta3, floorDate] = rawParams;
            const rows = state.movimientos_bancarios.filter(m =>
                m.cuenta_bancaria_id === Number(ctaId) &&
                !m.deleted_at &&
                m.fecha <= hasta3 &&
                (!floorDate || m.fecha >= floorDate)
            );
            const sum = (arr, fn) => arr.reduce((s, r) => s + Number(fn(r) || 0), 0);
            return [[{
                total_abonos_libros: sum(rows, r => r.abono),
                total_cargos_libros: sum(rows, r => r.cargo),
                abonos_en_transito: sum(rows.filter(r => !r.fecha_aplicado || r.fecha_aplicado > hasta1), r => r.abono),
                cargos_en_transito: sum(rows.filter(r => !r.fecha_aplicado || r.fecha_aplicado > hasta1), r => r.cargo)
            }]];
        }
        if (sqlLow.includes('as sum_abono') && sqlLow.includes('from movimientos_bancarios')) {
            const [ctaId, upper, floorDate] = rawParams;
            const isStrictLt = sqlLow.includes('fecha < ?');
            const rows = state.movimientos_bancarios.filter(m =>
                m.cuenta_bancaria_id === Number(ctaId) &&
                !m.deleted_at &&
                (isStrictLt ? m.fecha < upper : m.fecha <= upper) &&
                (!floorDate || m.fecha >= floorDate)
            );
            return [[{
                sum_abono: rows.reduce((s, r) => s + Number(r.abono || 0), 0),
                sum_cargo: rows.reduce((s, r) => s + Number(r.cargo || 0), 0)
            }]];
        }
        if (sqlLow.includes('from movimientos_bancarios m') && sqlLow.includes('where m.cuenta_bancaria_id = ?') && sqlLow.includes('m.fecha between ? and ?')) {
            const [ctaId, desde, hasta] = rawParams;
            const rows = state.movimientos_bancarios
                .filter(m => m.cuenta_bancaria_id === Number(ctaId) && !m.deleted_at && m.fecha >= desde && m.fecha <= hasta)
                .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
                .map(m => {
                    const tr = state.tipos_remesas.find(t => t.id === m.tipo_remesa_id);
                    return { ...m, cod_remesa: tr?.codigo || null, tipo_remesa_desc: tr?.descripcion || null };
                });
            return [rows];
        }

        // Movimientos list & reporte-fecha
        if (sqlLow.includes('select count(*) as total from movimientos_bancarios m')) {
            return [[{ total: state.movimientos_bancarios.filter(m => !m.deleted_at).length }]];
        }
        if (sqlLow.includes('from movimientos_bancarios m') && sqlLow.includes('comprobantes_count')) {
            let rows = state.movimientos_bancarios.filter(m => !m.deleted_at);
            let pIdx = 0;
            if (sqlLow.includes('m.cuenta_bancaria_id = ?')) {
                const ctaId = Number(rawParams[pIdx++]);
                rows = rows.filter(m => m.cuenta_bancaria_id === ctaId);
            } else if (sqlLow.includes('cb.numero = ?')) {
                const num = String(rawParams[pIdx++]);
                rows = rows.filter(m => {
                    const cb = state.cuentas_bancarias.find(x => x.id === m.cuenta_bancaria_id);
                    return cb && cb.numero === num;
                });
                if (sqlLow.includes('(e.id = ? or e.codigo = ?)')) {
                    const empParam = rawParams[pIdx++]; pIdx++;
                    rows = rows.filter(m => {
                        const e = state.empresas.find(x => x.id === m.empresa_id);
                        return e && (Number(e.id) === Number(empParam) || String(e.codigo) === String(empParam));
                    });
                }
            }
            if (sqlLow.includes('m.fecha between ? and ?')) {
                const desde = rawParams[pIdx++];
                const hasta = rawParams[pIdx++];
                if (desde && hasta) rows = rows.filter(m => m.fecha >= desde && m.fecha <= hasta);
            }
            return [rows.map(m => {
                const e = state.empresas.find(x => x.id === m.empresa_id);
                const cb = state.cuentas_bancarias.find(x => x.id === m.cuenta_bancaria_id);
                const b = cb && state.bancos.find(x => x.id === cb.banco_id);
                const tr = state.tipos_remesas.find(x => x.id === m.tipo_remesa_id);
                const cnt = state.movimientos_bancarios_comprobantes.filter(c => c.movimiento_id === m.id).length;
                return {
                    ...m,
                    id_empresa: e?.codigo || '',
                    empresa_nombre: e?.nombre || '',
                    numero_cuenta: cb?.numero || '',
                    cuenta_nombre: cb?.nombre || '',
                    banco_id: b?.id || null,
                    banco_nombre: b?.descripcion || '',
                    cod_remesa: tr?.codigo || null,
                    remesa_descripcion: tr?.descripcion || null,
                    comprobantes_count: cnt,
                    es_contabilizado: m.es_contabilizado ? 'S' : 'N'
                };
            })];
        }

        // Insert / Update movimientos_bancarios
        if (sqlLow.startsWith('insert into movimientos_bancarios ')) {
            const id = ++state.seq.movimientos_bancarios;
            const isTransferInsert = rawParams.length === 17;
            if (isTransferInsert) {
                const [empId, ctaId, fecha, fechaApl, doc, conc, monto, thirdNum, tipoRemId, codCta, numPart, createdBy, , , tgId, fp] = rawParams;
                const isDebit = sqlLow.includes('0, ?, ?, ?') && !sqlLow.includes(', 0, ?,');
                const cargo = isDebit ? Number(thirdNum) : 0;
                const abono = isDebit ? 0 : Number(thirdNum);
                state.movimientos_bancarios.push({
                    id, empresa_id: empId, cuenta_bancaria_id: ctaId, fecha, fecha_aplicado: fechaApl,
                    documento: doc, concepto: conc, monto: Number(monto), cargo, abono,
                    tipo_remesa_id: tipoRemId, cod_cta: codCta, num_partida: numPart,
                    created_by: createdBy, transfer_group_id: tgId, fingerprint: fp,
                    comprobante_url: null, version: 1, deleted_at: null
                });
            } else {
                const [empId, ctaId, fecha, fechaApl, doc, conc, monto, cargo, abono, tipoRemId, codCta, numPart, createdBy, , , fp] = rawParams;
                state.movimientos_bancarios.push({
                    id, empresa_id: empId, cuenta_bancaria_id: ctaId, fecha, fecha_aplicado: fechaApl,
                    documento: doc, concepto: conc, monto: Number(monto), cargo: Number(cargo), abono: Number(abono),
                    tipo_remesa_id: tipoRemId, cod_cta: codCta, num_partida: numPart,
                    created_by: createdBy, transfer_group_id: null, fingerprint: fp,
                    comprobante_url: null, version: 1, deleted_at: null
                });
            }
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLow.startsWith('update movimientos_bancarios set comprobante_url = ? where id in')) {
            const url = rawParams[0];
            const ids = (Array.isArray(rawParams[1]) ? rawParams[1] : rawParams.slice(1)).map(Number);
            for (const m of state.movimientos_bancarios) {
                if (ids.includes(m.id)) m.comprobante_url = url;
            }
            return [{ affectedRows: ids.length }];
        }
        if (sqlLow.startsWith('update movimientos_bancarios set comprobante_url = ? where id = ?')) {
            const m = state.movimientos_bancarios.find(x => x.id === Number(rawParams[1]));
            if (m) m.comprobante_url = rawParams[0];
            return [{ affectedRows: m ? 1 : 0 }];
        }
        if (sqlLow.startsWith('select id, comprobante_url, deleted_at from movimientos_bancarios where id = ?')) {
            const m = state.movimientos_bancarios.find(x => x.id === Number(rawParams[0]));
            return [m ? [{ id: m.id, comprobante_url: m.comprobante_url, deleted_at: m.deleted_at }] : []];
        }
        if (sqlLow.startsWith('select id, cuenta_bancaria_id, fecha, fecha_aplicado, comprobante_url, deleted_at from movimientos_bancarios where id = ?')) {
            const m = state.movimientos_bancarios.find(x => x.id === Number(rawParams[0]));
            return [m ? [{ ...m }] : []];
        }
        if (sqlLow.startsWith('select count(*) as cnt from movimientos_bancarios where comprobante_url = ?')) {
            const cnt = state.movimientos_bancarios.filter(m => m.comprobante_url === rawParams[0]).length;
            return [[{ cnt }]];
        }

        // Comprobantes table
        if (sqlLow.startsWith('insert into movimientos_bancarios_comprobantes')) {
            const id = ++state.seq.movimientos_bancarios_comprobantes;
            const [movId, nombre, url, mime, bytes, ancho, alto, nota, ocrJson, upBy, upName] = rawParams;
            state.movimientos_bancarios_comprobantes.push({
                id, movimiento_id: Number(movId), nombre_original: nombre, archivo_url: url,
                mime_type: mime, tamano_bytes: Number(bytes), ancho, alto, nota,
                ocr_json: ocrJson, uploaded_by: upBy, uploaded_by_name: upName,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLow.includes('from movimientos_bancarios_comprobantes') && sqlLow.includes('where movimiento_id = ?')) {
            const movId = Number(rawParams[0]);
            const rows = state.movimientos_bancarios_comprobantes
                .filter(c => c.movimiento_id === movId)
                .sort((a, b) => b.id - a.id);
            return [rows.map(r => ({ ...r }))];
        }
        if (sqlLow.startsWith('select * from movimientos_bancarios_comprobantes where id = ?')) {
            const c = state.movimientos_bancarios_comprobantes.find(x => x.id === Number(rawParams[0]));
            return [c ? [{ ...c }] : []];
        }
        if (sqlLow.startsWith('update movimientos_bancarios_comprobantes set nota = ? where id = ?')) {
            const c = state.movimientos_bancarios_comprobantes.find(x => x.id === Number(rawParams[1]));
            if (c) c.nota = rawParams[0];
            return [{ affectedRows: c ? 1 : 0 }];
        }
        if (sqlLow.includes('from movimientos_bancarios_comprobantes mbc left join movimientos_bancarios m')) {
            const c = state.movimientos_bancarios_comprobantes.find(x => x.id === Number(rawParams[0]));
            if (!c) return [[]];
            const m = state.movimientos_bancarios.find(x => x.id === c.movimiento_id);
            if (!m) return [[{ ...c, cuenta_bancaria_id: null, fecha: null, fecha_aplicado: null, deleted_at: null }]];
            return [[{
                ...c,
                cuenta_bancaria_id: m.cuenta_bancaria_id,
                fecha: m.fecha,
                fecha_aplicado: m.fecha_aplicado,
                deleted_at: m.deleted_at
            }]];
        }
        if (sqlLow.includes('from movimientos_bancarios_comprobantes c inner join movimientos_bancarios m')) {
            const c = state.movimientos_bancarios_comprobantes.find(x => x.id === Number(rawParams[0]));
            if (!c) return [[]];
            const m = state.movimientos_bancarios.find(x => x.id === c.movimiento_id);
            if (!m) return [[]];
            return [[{
                ...c,
                cuenta_bancaria_id: m.cuenta_bancaria_id,
                fecha: m.fecha,
                fecha_aplicado: m.fecha_aplicado,
                mov_deleted_at: m.deleted_at
            }]];
        }
        if (sqlLow.startsWith('delete from movimientos_bancarios_comprobantes where id = ?')) {
            const before = state.movimientos_bancarios_comprobantes.length;
            state.movimientos_bancarios_comprobantes = state.movimientos_bancarios_comprobantes.filter(c => c.id !== Number(rawParams[0]));
            return [{ affectedRows: before - state.movimientos_bancarios_comprobantes.length }];
        }
        if (sqlLow.startsWith('select count(*) as cnt from movimientos_bancarios_comprobantes where archivo_url = ?')) {
            const cnt = state.movimientos_bancarios_comprobantes.filter(c => c.archivo_url === rawParams[0]).length;
            return [[{ cnt }]];
        }

        // Cheques aggregations & queries
        if (sqlLow.includes('total_cheques_libros') && sqlLow.includes('from cheques')) {
            const [hasta1, ctaId, hasta2, floorDate] = rawParams;
            const rows = state.cheques.filter(c =>
                c.cuenta_bancaria_id === Number(ctaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                c.fecha <= hasta2 &&
                (!floorDate || c.fecha >= floorDate)
            );
            return [[{
                total_cheques_libros: rows.reduce((s, r) => s + Number(r.valor || 0), 0),
                cheques_en_transito: rows.filter(r => !r.fecha_aplicado || r.fecha_aplicado > hasta1).reduce((s, r) => s + Number(r.valor || 0), 0)
            }]];
        }
        if (sqlLow.includes('cheques_reservados_count') && sqlLow.includes('from cheques')) {
            const [ctaId, hasta, floorDate] = rawParams;
            const rows = state.cheques.filter(c =>
                c.cuenta_bancaria_id === Number(ctaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && Boolean(c.es_reservado) &&
                c.fecha <= hasta &&
                (!floorDate || c.fecha >= floorDate)
            );
            return [[{
                cheques_reservados_count: rows.length,
                cheques_reservados_monto: rows.reduce((s, r) => s + Number(r.valor || 0), 0)
            }]];
        }
        if (sqlLow.includes('select coalesce(sum(valor), 0) as sum_valor from cheques')) {
            const [ctaId, upper, floorDate] = rawParams;
            const isStrictLt = sqlLow.includes('fecha < ?');
            const rows = state.cheques.filter(c =>
                c.cuenta_bancaria_id === Number(ctaId) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                (isStrictLt ? c.fecha < upper : c.fecha <= upper) &&
                (!floorDate || c.fecha >= floorDate)
            );
            return [[{ sum_valor: rows.reduce((s, r) => s + Number(r.valor || 0), 0) }]];
        }
        if (sqlLow.includes('from cheques ch') && sqlLow.includes('ch.fecha between ? and ?')) {
            const [ctaId, desde, hasta] = rawParams;
            const rows = state.cheques
                .filter(c => c.cuenta_bancaria_id === Number(ctaId) && !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado && c.fecha >= desde && c.fecha <= hasta)
                .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
            return [rows];
        }
        if (sqlLow.includes('from cheques ch') && sqlLow.includes('ch.cuenta_bancaria_id in')) {
            const expanded = expandInParams(sql, rawParams);
            const n = expanded.params.length;
            const fechaCorte1 = expanded.params[n - 2];
            const fechaCorte2 = expanded.params[n - 1];
            const ids = new Set(expanded.params.slice(0, n - 2).map(Number));
            const rows = state.cheques.filter(c =>
                ids.has(Number(c.cuenta_bancaria_id)) &&
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                c.fecha <= fechaCorte1 &&
                (!c.fecha_aplicado || c.fecha_aplicado > fechaCorte2)
            );
            return [rows.map(c => ({ ...c }))];
        }
        if (sqlLow.includes('from cheques ch inner join cuentas_bancarias cb')) {
            const today = rawParams[0];
            const rows = state.cheques.filter(c =>
                !c.deleted_at && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado &&
                !c.fecha_aplicado && c.fecha <= today
            ).map(c => {
                const cb = state.cuentas_bancarias.find(x => x.id === c.cuenta_bancaria_id);
                const b = cb && state.bancos.find(x => x.id === cb.banco_id);
                const e = cb && state.empresas.find(x => x.id === cb.empresa_id);
                return {
                    ...c,
                    cuenta_numero: cb?.numero || '',
                    cuenta_nombre: cb?.nombre || '',
                    fecha_saldo_inicial: cb?.fecha_saldo_inicial || null,
                    banco_nombre: b?.descripcion || 'Banco',
                    empresa_nombre: e?.nombre || '',
                    activa: cb?.activa ?? 0
                };
            }).filter(r => Boolean(r.activa));
            return [rows];
        }
        if (sqlLow.startsWith('select cheque from cheques where cuenta_bancaria_id = ?')) {
            const ctaId = Number(rawParams[0]);
            const rows = state.cheques
                .filter(c => c.cuenta_bancaria_id === ctaId && !c.deleted_at && c.cheque)
                .sort((a, b) => Number(b.cheque) - Number(a.cheque));
            return [rows.slice(0, 1).map(c => ({ cheque: c.cheque }))];
        }

        // Sentinel & Notifications
        if (sqlLow.startsWith('insert ignore into telegram_sentinel_log')) {
            const [sKey, aDate, severity, summary] = rawParams;
            const exists = state.telegram_sentinel_log.some(r => r.sentinel_key === sKey && r.alert_date === aDate);
            if (exists) return [{ affectedRows: 0 }];
            const id = ++state.seq.telegram_sentinel_log;
            state.telegram_sentinel_log.push({ id, sentinel_key: sKey, alert_date: aDate, severity, summary, recipients_count: 0 });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLow.startsWith('update telegram_sentinel_log set recipients_count = ?')) {
            const [cnt, sKey, aDate] = rawParams;
            const row = state.telegram_sentinel_log.find(r => r.sentinel_key === sKey && r.alert_date === aDate);
            if (row) row.recipients_count = Number(cnt);
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sqlLow.includes('from users u left join roles r') && sqlLow.includes("coalesce(u.status, 'active') = 'active'")) {
            const rows = [];
            for (const u of state.users) {
                if ((u.status || 'active') !== 'active') continue;
                const perms = state.rolePermissions[u.role_id] || [];
                if (perms.length === 0) {
                    rows.push({ id: u.id, username: u.username, nombre: u.nombre, status: u.status, role_id: u.role_id, role_name: u.role_name, permission_name: null });
                } else {
                    for (const p of perms) {
                        rows.push({ id: u.id, username: u.username, nombre: u.nombre, status: u.status, role_id: u.role_id, role_name: u.role_name, permission_name: p });
                    }
                }
            }
            return [rows];
        }
        if (sqlLow.startsWith('insert into notifications')) {
            const id = ++state.seq.notifications;
            const typeLiteralMatch = sql.match(/'([a-z0-9_]+)'/i);
            const [userId, title, message, data] = rawParams;
            const type = typeLiteralMatch ? typeLiteralMatch[1] : 'bank_sentinel_alert';
            state.notifications.push({ id, user_id: Number(userId), type, title, message, data, is_read: 0, created_at: new Date().toISOString() });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sqlLow.includes('from telegram_usuarios tu')) {
            const rows = state.telegram_usuarios
                .filter(tu => Number(tu.activo) === 1)
                .map(tu => {
                    const u = state.users.find(x => x.id === tu.user_id);
                    const perms = u ? (state.rolePermissions[u.role_id] || []) : [];
                    return {
                        ...tu,
                        sipe_status: u?.status || 'active',
                        sipe_role_id: u?.role_id || null,
                        sipe_role_name: u?.role_name || null,
                        sipe_permissions: perms.join(',')
                    };
                });
            return [rows];
        }
        if (sqlLow.includes('from role_permissions rp inner join permissions p')) {
            const ids = (Array.isArray(rawParams[0]) ? rawParams[0] : rawParams).map(Number);
            const rows = [];
            for (const rid of ids) {
                for (const p of (state.rolePermissions[rid] || [])) {
                    rows.push({ role_id: rid, name: p });
                }
            }
            return [rows];
        }

        throw new Error(`[MockDB M1B] Unhandled SQL: ${sql}`);
    };

    const pool = {
        query: runQuery,
        getConnection: async () => {
            let snapshot = null;
            return {
                query: runQuery,
                beginTransaction: async () => {
                    snapshot = JSON.stringify(state);
                },
                commit: async () => {
                    snapshot = null;
                },
                rollback: async () => {
                    if (snapshot) state = JSON.parse(snapshot);
                    snapshot = null;
                },
                release: () => {}
            };
        }
    };

    const externalPool = {
        query: async (rawSql) => {
            if (state.externalDbThrows) {
                throw new Error('ECONNREFUSED external legacy DB');
            }
            const sqlLow = String(rawSql || '').toLowerCase();
            if (sqlLow.includes('sp_saldo_en_bancos')) return [[state.externalSpBancos]];
            if (sqlLow.includes('sp_saldo_en_chequera')) return [[state.externalSpChequera]];
            return [[]];
        }
    };

    return {
        pool,
        externalPool,
        getState: () => state,
        reset: () => {
            state = createInitialState();
        }
    };
}

function makeToken(userId, role = 'User') {
    return jwt.sign({ id: userId, role, token_version: 1 }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Sub-Milestone M1B: Bancos CRUD, Kardex, Consultas Nativas, Transferencias, Comprobantes & Centinela Bancario', () => {
    let mockDb;
    let server;
    let baseUrl;
    let emittedBankEvents = [];
    const createdFilesToCleanup = new Set();

    let origGetDb;
    let origGetDbIfReady;
    let origGetExternalDb;
    let origWithTransaction;
    let origWithRetry;
    let origGetGeminiKeys;
    let origGenerateGeminiFallback;

    before(async () => {
        mockDb = createM1BMockDb();

        origGetDb = dbModule.getDb;
        origGetDbIfReady = dbModule.getDbIfReady;
        origGetExternalDb = dbModule.getExternalDb;
        origWithTransaction = dbModule.withTransaction;
        origWithRetry = dbModule.withRetry;
        origGetGeminiKeys = telegramGeminiService.getGeminiApiKeyCandidates;
        origGenerateGeminiFallback = telegramGeminiService.generateWithGeminiFallback;

        dbModule.getDb = () => mockDb.pool;
        dbModule.getDbIfReady = () => mockDb.pool;
        dbModule.getExternalDb = async () => (mockDb.getState().externalDbNull ? null : mockDb.externalPool);
        dbModule.withRetry = async (fn) => fn();
        dbModule.withTransaction = async (callback) => {
            const conn = await mockDb.pool.getConnection();
            try {
                await conn.beginTransaction();
                const res = await callback(conn);
                await conn.commit();
                return res;
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }
        };

        const bancosRoutes = require('../routes/bancos');
        const consultasRoutes = require('../routes/consultas');

        const app = express();
        app.use(express.json({ limit: '20mb' }));
        app.use((req, _res, next) => {
            req.io = {
                to: (room) => ({
                    emit: (ev, payload) => emittedBankEvents.push({ room, ev, payload })
                })
            };
            next();
        });
        app.use('/api/bancos', bancosRoutes);
        app.use('/api', consultasRoutes);
        app.use('/api/uploads', guardProtectedUploadsMiddleware);
        app.use('/api/uploads', express.static(UPLOADS_ROOT, { dotfiles: 'deny', index: false }));

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    after(async () => {
        dbModule.getDb = origGetDb;
        dbModule.getDbIfReady = origGetDbIfReady;
        dbModule.getExternalDb = origGetExternalDb;
        dbModule.withTransaction = origWithTransaction;
        dbModule.withRetry = origWithRetry;
        telegramGeminiService.getGeminiApiKeyCandidates = origGetGeminiKeys;
        telegramGeminiService.generateWithGeminiFallback = origGenerateGeminiFallback;

        for (const fPath of createdFilesToCleanup) {
            try {
                if (fs.existsSync(fPath)) fs.unlinkSync(fPath);
            } catch (_) { /* noop */ }
        }
        await new Promise((resolve) => server.close(resolve));
    });

    beforeEach(() => {
        mockDb.reset();
        emittedBankEvents = [];
        for (const u of [1, 2, 3, 4, 5]) {
            restoreUser(u);
            invalidateUserAuthCache(u);
        }
    });

    async function apiCall(method, urlPath, { userId = 1, body = null, headers = {} } = {}) {
        const reqHeaders = { ...headers };
        if (userId !== null) {
            reqHeaders.Authorization = `Bearer ${makeToken(userId, userId === 1 ? 'Administrator' : 'User')}`;
        }
        if (body !== null && !reqHeaders['Content-Type']) {
            reqHeaders['Content-Type'] = 'application/json';
        }
        const res = await fetch(`${baseUrl}${urlPath}`, {
            method,
            headers: reqHeaders,
            body: body !== null ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch (_) { data = text; }
        return { status: res.status, headers: res.headers, data };
    }

    it('R2.4: PUT /entidades-banco/:codigo y CRUD completo de tipos-cuenta y tipos-remesas con guard FK 409', async () => {
        // RBAC check
        const unauth = await apiCall('PUT', '/api/bancos/entidades-banco/01', { userId: null, body: { descripcion: 'X' } });
        assert.strictEqual(unauth.status, 401);
        const forbid = await apiCall('PUT', '/api/bancos/entidades-banco/01', { userId: 4, body: { descripcion: 'X' } });
        assert.strictEqual(forbid.status, 403);

        // 404 bank not found & 409 duplicate name
        const bank404 = await apiCall('PUT', '/api/bancos/entidades-banco/99', { userId: 1, body: { descripcion: 'OTRO BANCO' } });
        assert.strictEqual(bank404.status, 404);
        const bankDup = await apiCall('PUT', '/api/bancos/entidades-banco/01', { userId: 1, body: { descripcion: 'BANCO AGRICOLA' } });
        assert.strictEqual(bankDup.status, 409);

        const bankOk = await apiCall('PUT', '/api/bancos/entidades-banco/01', { userId: 1, body: { descripcion: 'Banco Promerica SV' } });
        assert.strictEqual(bankOk.status, 200);
        assert.strictEqual(bankOk.data.descripcion, 'BANCO PROMERICA SV');
        assert.strictEqual(bankOk.data.updatedCount, 2);

        // tipos-cuenta CRUD
        const tcList = await apiCall('GET', '/api/bancos/tipos-cuenta', { userId: 2 });
        assert.strictEqual(tcList.status, 200);
        assert.strictEqual(tcList.data.nextCodigo, '02');

        const tcCreate = await apiCall('POST', '/api/bancos/tipos-cuenta', { userId: 2, body: { descripcion: 'Cuenta Ahorro' } });
        assert.strictEqual(tcCreate.status, 201);
        assert.strictEqual(tcCreate.data.codigo, '02');

        const tcUpdate = await apiCall('PUT', '/api/bancos/tipos-cuenta/02', { userId: 2, body: { descripcion: 'Cuenta de Ahorros' } });
        assert.strictEqual(tcUpdate.status, 200);
        assert.strictEqual(tcUpdate.data.descripcion, 'CUENTA DE AHORROS');

        // Delete referenced tipo-cuenta -> 409
        const tcDelInUse = await apiCall('DELETE', '/api/bancos/tipos-cuenta/01', { userId: 2 });
        assert.strictEqual(tcDelInUse.status, 409);

        // Delete unreferenced tipo-cuenta -> 200
        const tcDelOk = await apiCall('DELETE', '/api/bancos/tipos-cuenta/02', { userId: 2 });
        assert.strictEqual(tcDelOk.status, 200);

        // tipos-remesas CRUD + soft-deleted FK check
        const trCreate = await apiCall('POST', '/api/bancos/tipos-remesas', { userId: 2, body: { codigo: 'ACH', descripcion: 'Pago ACH' } });
        assert.strictEqual(trCreate.status, 201);

        const trUpdate = await apiCall('PUT', '/api/bancos/tipos-remesas/ACH', { userId: 2, body: { descripcion: 'Transferencia ACH' } });
        assert.strictEqual(trUpdate.status, 200);

        const trDelInUse = await apiCall('DELETE', '/api/bancos/tipos-remesas/RM', { userId: 2 });
        assert.strictEqual(trDelInUse.status, 409);

        const trDelOk = await apiCall('DELETE', '/api/bancos/tipos-remesas/ACH', { userId: 2 });
        assert.strictEqual(trDelOk.status, 200);
    });

    it('R4.1: GET /cuentas/:id/resumen y CRUD chequeras (traslape 409, PUT, DELETE vs DEACTIVATE)', async () => {
        const resResumen = await apiCall('GET', '/api/bancos/cuentas/1/resumen?hasta=2026-10-31', { userId: 2 });
        assert.strictEqual(resResumen.status, 200);
        assert.strictEqual(resResumen.data.cuenta_id, 1);
        assert.strictEqual(resResumen.data.saldo_chequera, 1220); // 1000 + 400 + 150 - 200 - 130 (excludes pre-floor #2 and anulado #4)
        assert.strictEqual(resResumen.data.ultimo_numero_cheque, '1013');
        assert.strictEqual(resResumen.data.siguiente_correlativo, '1015');
        assert.strictEqual(resResumen.data.talonario_activo.disponibles, 6);
        assert.strictEqual(resResumen.data.talonario_activo.stock_bajo, true);

        const res404 = await apiCall('GET', '/api/bancos/cuentas/999/resumen', { userId: 2 });
        assert.strictEqual(res404.status, 404);

        const listChq = await apiCall('GET', '/api/bancos/chequeras?cuenta_bancaria_id=1', { userId: 2 });
        assert.strictEqual(listChq.status, 200);
        assert.strictEqual(listChq.data.length, 1);
        assert.strictEqual(listChq.data[0].disponibles, 6);

        // Overlap 409
        const ovRes = await apiCall('POST', '/api/bancos/chequeras', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, serie: 'B', desde: 1010, hasta: 1050 }
        });
        assert.strictEqual(ovRes.status, 409);

        // Valid new checkbook
        const okCreate = await apiCall('POST', '/api/bancos/chequeras', {
            userId: 2,
            body: { cuenta_bancaria_id: 1, serie: 'B', desde: 1021, hasta: 1050, alerta_stock_bajo: 5 }
        });
        assert.strictEqual(okCreate.status, 201);
        const newChqId = okCreate.data.id;
        assert.strictEqual(okCreate.data.disponibles, 30);
        assert.strictEqual(okCreate.data.stock_bajo, false);

        // Update checkbook
        const updRes = await apiCall('PUT', `/api/bancos/chequeras/${newChqId}`, {
            userId: 2,
            body: { siguiente_correlativo: 1048 }
        });
        assert.strictEqual(updRes.status, 200);
        assert.strictEqual(updRes.data.disponibles, 3);
        assert.strictEqual(updRes.data.stock_bajo, true);

        // Delete unlinked checkbook -> hard delete
        const delUnused = await apiCall('DELETE', `/api/bancos/chequeras/${newChqId}`, { userId: 2 });
        assert.strictEqual(delUnused.status, 200);
        assert.strictEqual(delUnused.data.action, 'deleted');

        // Delete linked checkbook #1 -> soft deactivate
        const delLinked = await apiCall('DELETE', '/api/bancos/chequeras/1', { userId: 2 });
        assert.strictEqual(delLinked.status, 200);
        assert.strictEqual(delLinked.data.action, 'deactivated');
        const chq1 = mockDb.getState().chequeras.find(c => c.id === 1);
        assert.strictEqual(chq1.activo, 0);
    });

    it('R3.2: GET /movimientos/kardex con saldo corrido, filtros, paginación y URLs firmadas, preservando /reporte-fecha', async () => {
        const kardexAll = await apiCall('GET', '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&export=true', { userId: 2 });
        assert.strictEqual(kardexAll.status, 200);
        assert.strictEqual(kardexAll.data.totales.saldo_inicial_periodo, 1000);
        assert.strictEqual(kardexAll.data.totales.saldo_final_periodo, 1220);
        assert.strictEqual(kardexAll.data.items.length, 4); // 2 movs + 2 valid cheques post-floor (excludes anulado #4, pre-floor mov #1 and chk #2)

        // Verify signed comprobante_url on movement #2
        const mov2Item = kardexAll.data.items.find(i => i.origen_tipo === 'MOV' && i.id === 2);
        assert.ok(mov2Item.comprobante_url.includes('exp=') && mov2Item.comprobante_url.includes('sig='));
        assert.strictEqual(mov2Item.conciliado, true);

        // Filter EN_TRANSITO
        const kardexTransit = await apiCall('GET', '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31&estado=EN_TRANSITO&limit=2&page=1', { userId: 2 });
        assert.strictEqual(kardexTransit.status, 200);
        assert.strictEqual(kardexTransit.data.pagination.total, 3);
        assert.strictEqual(kardexTransit.data.pagination.total_pages, 2);
        assert.strictEqual(kardexTransit.data.items.length, 2);

        // Invalid date -> 400
        const badDate = await apiCall('GET', '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-02-30', { userId: 2 });
        assert.strictEqual(badDate.status, 400);

        // Inverted range (desde > hasta) -> 400 on both /kardex and /reporte-fecha
        const invKardex = await apiCall('GET', '/api/bancos/movimientos/kardex?cuenta_bancaria_id=1&desde=2026-11-20&hasta=2026-11-01', { userId: 2 });
        assert.strictEqual(invKardex.status, 400);

        const invRep = await apiCall('GET', '/api/bancos/movimientos/reporte-fecha?cuenta_bancaria_id=1&desde=2026-11-20&hasta=2026-11-01', { userId: 2 });
        assert.strictEqual(invRep.status, 400);

        // Backward-compatible flat array on /reporte-fecha
        const legacyRep = await apiCall('GET', '/api/bancos/movimientos/reporte-fecha?cuenta_bancaria_id=1&desde=2026-10-01&hasta=2026-10-31', { userId: 2 });
        assert.strictEqual(legacyRep.status, 200);
        assert.ok(Array.isArray(legacyRep.data));
        assert.strictEqual(legacyRep.data.length, 2);
        assert.ok(legacyRep.data[0].signed_url.includes('sig='));
    });

    it('R5.1 & R5.3: Transferencia inter-empresa atómica, limpieza de idempotencia ante error, comprobantes HMAC y OCR mockeado', async () => {
        // 1. Idempotency retry after closed-period validation error (423 -> cleanup -> retry valid date -> 201)
        const idemKey = 'idem-m1b-interco-1';
        const lockedAttempt = await apiCall('POST', '/api/bancos/movimientos/transferencia', {
            userId: 2,
            headers: { 'X-Idempotency-Key': idemKey },
            body: {
                cuenta_debitar_id: 1,
                cuenta_acreditar_id: 2,
                fecha: '2026-10-20', // cuenta 1 locked until 2026-10-31
                documento: 'TR-9001',
                monto: 250.00
            }
        });
        assert.strictEqual(lockedAttempt.status, 423);
        assert.strictEqual(mockDb.getState().bancos_idempotency_keys.length, 0);

        // Retry with same idempotency key on open date + attached receipt -> 201 intercompany
        const trOk = await apiCall('POST', '/api/bancos/movimientos/transferencia', {
            userId: 2,
            headers: { 'X-Idempotency-Key': idemKey },
            body: {
                cuenta_debitar_id: 1,
                cuenta_acreditar_id: 2,
                fecha: '2026-11-10',
                documento: 'TR-9001',
                monto: 250.00,
                comprobante: {
                    data_url: TINY_PNG_DATA_URL,
                    nombre_original: 'transfer_interco.png',
                    nota: 'Soporte intercompany'
                }
            }
        });
        assert.strictEqual(trOk.status, 201);
        assert.strictEqual(trOk.data.intercompany, true);
        assert.strictEqual(trOk.data.empresa_debitar_id, 1);
        assert.strictEqual(trOk.data.empresa_acreditar_id, 2);
        assert.ok(trOk.data.comprobante_url.includes('/api/uploads/movimientos/'));
        assert.ok(trOk.data.comprobante_url.includes('sig='));

        // Verify physical file exists & HMAC guard returns 401 unsigned vs 200 signed
        const rawArchivoUrl = trOk.data.comprobantes[0].archivo_url;
        const physicalPath = path.join(MOVIMIENTOS_UPLOADS_DIR, path.basename(rawArchivoUrl));
        createdFilesToCleanup.add(physicalPath);
        assert.strictEqual(fs.existsSync(physicalPath), true);

        const unsignedFetch = await fetch(`${baseUrl}${rawArchivoUrl}`);
        assert.strictEqual(unsignedFetch.status, 401);
        const signedFetch = await fetch(`${baseUrl}${trOk.data.comprobante_url}`);
        assert.strictEqual(signedFetch.status, 200);

        // Verify idempotent replay returns same 201 body without inserting duplicates
        const replayRes = await apiCall('POST', '/api/bancos/movimientos/transferencia', {
            userId: 2,
            headers: { 'X-Idempotency-Key': idemKey },
            body: {
                cuenta_debitar_id: 1,
                cuenta_acreditar_id: 2,
                fecha: '2026-11-10',
                documento: 'TR-9001',
                monto: 250.00
            }
        });
        assert.strictEqual(replayRes.status, 201);
        assert.strictEqual(replayRes.data.debit_id, trOk.data.debit_id);
        assert.strictEqual(replayRes.data.credit_id, trOk.data.credit_id);

        // Verify both debit and credit legs share the receipt; deleting debit leg's comprobante keeps physical file for credit leg!
        const debComps = await apiCall('GET', `/api/bancos/movimientos/${trOk.data.debit_id}/comprobantes`, { userId: 2 });
        assert.strictEqual(debComps.status, 200);
        assert.strictEqual(debComps.data.comprobantes.length, 1);

        const credComps = await apiCall('GET', `/api/bancos/movimientos/${trOk.data.credit_id}/comprobantes`, { userId: 2 });
        assert.strictEqual(credComps.status, 200);
        assert.strictEqual(credComps.data.comprobantes.length, 1);

        // OCR AI endpoint (mocking Gemini) using saved archivo_url
        telegramGeminiService.getGeminiApiKeyCandidates = async () => ['fake-gemini-key'];
        telegramGeminiService.generateWithGeminiFallback = async () => ({
            text: JSON.stringify({
                tipo_documento: 'Transferencia Bancaria',
                metodo_pago: 'TRANSFERENCIA',
                monto_usd: 250.00,
                fecha: '2026-11-10',
                banco_origen: 'BANCO PROMERICA',
                cuenta_origen: '100-001-99',
                beneficiario: 'ESTACION MIRAFLORES',
                referencia: 'TR-9001',
                concepto: 'TRASLADO FONDOS',
                confianza: 'alta'
            }),
            response: {}
        });

        const ocrRes = await apiCall('POST', '/api/bancos/movimientos/analizar-comprobante', {
            userId: 2,
            body: { archivo_url: rawArchivoUrl }
        });
        assert.strictEqual(ocrRes.status, 200);
        assert.strictEqual(ocrRes.data.ok, true);
        assert.strictEqual(ocrRes.data.analisis.monto, 250);
        assert.strictEqual(ocrRes.data.analisis.fecha, '2026-11-10');
        assert.strictEqual(ocrRes.data.analisis.documento, 'TR-9001');
        assert.strictEqual(ocrRes.data.analisis.cod_remesa_sugerido, 'TR');
        assert.strictEqual(ocrRes.data.analisis.cuenta_bancaria_id, 1);

        // Path traversal rejected
        const badPathOcr = await apiCall('POST', '/api/bancos/movimientos/analizar-comprobante', {
            userId: 2,
            body: { archivo_url: '/api/uploads/movimientos/../../secret.txt' }
        });
        assert.strictEqual(badPathOcr.status, 400);

        // Delete debit leg's comprobante -> physical file stays because credit leg still references it
        const delDebComp = await apiCall('DELETE', `/api/bancos/movimientos/comprobantes/${debComps.data.comprobantes[0].id}`, { userId: 2 });
        assert.strictEqual(delDebComp.status, 200);
        assert.strictEqual(fs.existsSync(physicalPath), true);

        // Delete credit leg's comprobante -> now physical file is unlinked!
        const delCredComp = await apiCall('DELETE', `/api/bancos/movimientos/comprobantes/${credComps.data.comprobantes[0].id}`, { userId: 2 });
        assert.strictEqual(delCredComp.status, 200);
        assert.strictEqual(fs.existsSync(physicalPath), false);

        // 2. Standard POST /movimientos idempotency cleanup on 423 + retry + POST/PATCH /:id/comprobantes + GET /movimientos signed_url + direct data_url OCR
        const stdKey = 'idem-m1b-std-1';
        const stdLocked = await apiCall('POST', '/api/bancos/movimientos', {
            userId: 2,
            headers: { 'X-Idempotency-Key': stdKey },
            body: {
                cuenta_bancaria_id: 1,
                fecha: '2026-10-25',
                documento: 'DEP-LOCKED',
                concepto: 'DEPOSITO EN PERIODO CERRADO',
                monto: 100.00,
                cod_remesa: 'RM'
            }
        });
        assert.strictEqual(stdLocked.status, 423);

        const stdOk = await apiCall('POST', '/api/bancos/movimientos', {
            userId: 2,
            headers: { 'X-Idempotency-Key': stdKey },
            body: {
                cuenta_bancaria_id: 1,
                fecha: '2026-11-12',
                documento: 'DEP-OPEN-1',
                concepto: 'DEPOSITO CON COMPROBANTE',
                monto: 325.50,
                cod_remesa: 'RM'
            }
        });
        assert.strictEqual(stdOk.status, 201);
        const stdMovId = stdOk.data.id;

        const addComp = await apiCall('POST', `/api/bancos/movimientos/${stdMovId}/comprobantes`, {
            userId: 2,
            body: {
                comprobantes: [
                    { data_url: TINY_PNG_DATA_URL, nombre_original: 'boleta_rm.png', nota: 'Inicial' }
                ]
            }
        });
        assert.strictEqual(addComp.status, 201);
        assert.strictEqual(addComp.data.comprobantes.length, 1);
        const compId = addComp.data.comprobantes[0].id;
        const stdPhysical = path.join(MOVIMIENTOS_UPLOADS_DIR, path.basename(addComp.data.comprobantes[0].archivo_url));
        createdFilesToCleanup.add(stdPhysical);

        const patchNote = await apiCall('PATCH', `/api/bancos/movimientos/comprobantes/${compId}`, {
            userId: 2,
            body: { nota: 'Boleta verificada' }
        });
        assert.strictEqual(patchNote.status, 200);
        assert.strictEqual(patchNote.data.comprobante.nota, 'Boleta verificada');

        const listMovs = await apiCall('GET', '/api/bancos/movimientos?cuenta_bancaria_id=1', { userId: 2 });
        assert.strictEqual(listMovs.status, 200);
        const foundStd = listMovs.data.find(m => m.id === stdMovId);
        assert.ok(foundStd.signed_url.includes('sig='));
        assert.strictEqual(foundStd.comprobantes_count, 1);

        // OCR direct data_url
        telegramGeminiService.generateWithGeminiFallback = async () => ({
            text: JSON.stringify({
                tipo_documento: 'Depósito Bancario',
                metodo_pago: 'DEPOSITO',
                monto_usd: 325.50,
                fecha: '2026-11-12',
                banco_origen: 'BANCO PROMERICA',
                cuenta_origen: '100-001-99',
                referencia: 'DEP-OPEN-1',
                concepto: 'REMESA ESTACION',
                confianza: 'alta'
            }),
            response: {}
        });
        const ocrDirect = await apiCall('POST', '/api/bancos/movimientos/analizar-comprobante', {
            userId: 2,
            body: { data_url: TINY_PNG_DATA_URL, nombre_original: 'boleta_rm.png' }
        });
        assert.strictEqual(ocrDirect.status, 200);
        assert.strictEqual(ocrDirect.data.analisis.cod_remesa_sugerido, 'RM');
        assert.strictEqual(ocrDirect.data.analisis.direccion, 'ABONO');

        // Clean up uploaded receipt via DELETE endpoint
        const delStdComp = await apiCall('DELETE', `/api/bancos/movimientos/comprobantes/${compId}`, { userId: 2 });
        assert.strictEqual(delStdComp.status, 200);
        assert.strictEqual(fs.existsSync(stdPhysical), false);
    });

    it('R3.1 & R3.3: GET /consultas/:type nativo (saldos-bancos, saldos-chequera, antiguedad-cheques) y fallback seguro externalDb', async () => {
        const forbid = await apiCall('GET', '/api/consultas/saldos-bancos', { userId: 4 });
        assert.strictEqual(forbid.status, 403);

        const badDate = await apiCall('GET', '/api/consultas/saldos-bancos?fecha_corte=2026-02-29', { userId: 3 });
        assert.strictEqual(badDate.status, 400);

        const unknownType = await apiCall('GET', '/api/consultas/desconocido', { userId: 3 });
        assert.strictEqual(unknownType.status, 404);

        // Native saldos-bancos + comparativo=true with externalDb failing -> still HTTP 200!
        mockDb.getState().externalDbThrows = true;
        const sbRes = await apiCall('GET', '/api/consultas/saldos-bancos?fecha_corte=2026-11-25&comparativo=true', { userId: 3 });
        assert.strictEqual(sbRes.status, 200);
        assert.strictEqual(sbRes.data.fuente, 'db_sipe_admin');
        assert.strictEqual(sbRes.data.cuentas.length, 2);
        assert.strictEqual(sbRes.data.comparativo.solicitado, true);
        assert.strictEqual(sbRes.data.comparativo.disponible, false);
        assert.ok(sbRes.data.comparativo.error.includes('ECONNREFUSED'));

        const cta1Summary = await computeAccountReconciliationSummary(mockDb.pool, 1, '2026-11-25');
        const cta1Row = sbRes.data.cuentas.find(c => c.id === 1);
        assert.strictEqual(cta1Row.saldo_chequera, cta1Summary.saldo_chequera);
        assert.strictEqual(cta1Row.saldo_conciliado_libros, cta1Summary.saldo_conciliado_libros);
        assert.strictEqual(cta1Row.estado_periodo, 'ABIERTO'); // closed until 2026-10-31 < 2026-11-25
        assert.strictEqual(cta1Row.ultima_validacion_fecha, '2026-11-20');
        assert.strictEqual(cta1Row.dias_sin_validar, 5);

        // Closed period when fecha_corte <= 2026-10-31
        const octRes = await apiCall('GET', '/api/consultas/saldos-chequera?fecha_corte=2026-10-31&empresa_id=001', { userId: 3 });
        assert.strictEqual(octRes.status, 200);
        assert.strictEqual(octRes.data.cuentas.length, 1);
        assert.strictEqual(octRes.data.cuentas[0].estado_periodo, 'CERRADO');
        assert.strictEqual(octRes.data.cuentas[0].saldo, octRes.data.cuentas[0].saldo_chequera);

        // Working comparativo=true + ?empresa= alias + new_saldo / saldo_chequera SP column fallbacks
        mockDb.getState().externalDbThrows = false;
        mockDb.getState().externalSpBancos = [
            { num_cta: '100-001-99', nom_banco: 'BANCO PROMERICA', new_saldo: 1400.00 },
            { num_cta: '200-002-88', nom_banco: 'BANCO AGRICOLA', new_saldo: 450.00 }
        ];
        mockDb.getState().externalSpChequera = [
            { num_cta: '100-001-99', nom_banco: 'BANCO PROMERICA', saldo_chequera: 1220.00 },
            { num_cta: '200-002-88', nom_banco: 'BANCO AGRICOLA', saldo_chequera: 450.00 }
        ];
        const compOk = await apiCall('GET', '/api/consultas/saldos-bancos?fecha_corte=2026-11-25&empresa=001&comparativo=true', { userId: 3 });
        assert.strictEqual(compOk.status, 200);
        assert.strictEqual(compOk.data.cuentas.length, 1);
        assert.strictEqual(compOk.data.cuentas[0].empresa_codigo, '001');
        assert.strictEqual(compOk.data.comparativo.disponible, true);
        assert.strictEqual(compOk.data.comparativo.fuente, 'sp_saldo_en_bancos');
        assert.strictEqual(compOk.data.comparativo.filas.length, 2);
        assert.strictEqual(compOk.data.cuentas[0].comparativo_sp.saldo_sp, 1400);

        const compCheqOk = await apiCall('GET', '/api/consultas/saldos-chequera?fecha_corte=2026-11-25&empresa=001&comparativo=true', { userId: 3 });
        assert.strictEqual(compCheqOk.status, 200);
        assert.strictEqual(compCheqOk.data.cuentas.length, 1);
        assert.strictEqual(compCheqOk.data.cuentas[0].comparativo_sp.saldo_sp, 1220);

        // Aging buckets & antiguedad-cheques
        // As of 2027-04-15: #1 (2026-10-08 -> 189d >180), #3 (2026-10-14 -> 183d >180),
        // #10 (2026-10-02 -> 195d >180), #11 (2026-11-10 -> 156d -> 91-180 por_caducar).
        mockDb.getState().cheques.push(
            {
                id: 10,
                empresa_id: 2,
                cuenta_bancaria_id: 2,
                llave: '2-100',
                fecha: '2026-10-02',
                fecha_aplicado: null,
                cheque: '2001',
                valor: 75.00,
                a_nombre: 'CADUCO TEST',
                concepto: 'OLD CHECK',
                cheque_anulado: 0,
                fue_noemitido: 0,
                es_reservado: 0,
                deleted_at: null
            },
            {
                id: 11,
                empresa_id: 2,
                cuenta_bancaria_id: 2,
                llave: '2-101',
                fecha: '2026-11-10',
                fecha_aplicado: null,
                cheque: '2002',
                valor: 90.00,
                a_nombre: 'POR CADUCAR TEST',
                concepto: 'EXPIRING CHECK',
                cheque_anulado: 0,
                fue_noemitido: 0,
                es_reservado: 0,
                deleted_at: null
            }
        );
        const agingRes = await apiCall('GET', '/api/consultas/antiguedad-cheques?fecha_corte=2027-04-15', { userId: 3 });
        assert.strictEqual(agingRes.status, 200);
        assert.strictEqual(agingRes.data.aging_resumen.caducos_count, 3);
        assert.strictEqual(agingRes.data.aging_resumen.por_caducar_count, 1);
        assert.strictEqual(agingRes.data.aging_resumen.buckets['>180'].count, 3);
        assert.strictEqual(agingRes.data.aging_resumen.buckets['91-180'].count, 1);
    });

    it('R4.3: Centinela Bancario evalúa las 4 reglas (incluyendo días hábiles), emite notification:new, inserta notifications, envía Telegram y deduplica', async () => {
        // 1. Business-day weekend rule verification
        // Friday 2026-11-20 -> Monday 2026-11-23 = 1 business day (must NOT trigger >48h hábiles)
        assert.strictEqual(telegramSentinelService.countBusinessDaysBetween('2026-11-20', '2026-11-23'), 1);
        // Thursday 2026-11-19 -> Monday 2026-11-23 = 2 business days (MUST trigger >48h hábiles)
        assert.strictEqual(telegramSentinelService.countBusinessDaysBetween('2026-11-19', '2026-11-23'), 2);

        const fridayCheck = await telegramSentinelService.evaluateBankSentinelChecks({
            db: mockDb.pool,
            todayOverride: '2026-11-23',
            overrides: {
                cuentasRows: [],
                remesasSinAcreditar: [
                    { estacion: 'Estación Viernes', codigo_estacion: '002', fecha_turno: '2026-11-20', pendiente_conciliar_usd: 800 }
                ]
            }
        });
        assert.strictEqual(fridayCheck.remesas_48h_habiles.length, 0);

        // 2. Full runBankSentinelChecks with all 4 triggers active:
        //    - Thursday closeout checked on Monday (>= 2 biz days)
        //    - Expiring check (160d) and expired check (190d)
        //    - Overdraft account (saldo_chequera < 0)
        //    - Unvalidated >7d account (#2 last validated 2026-11-01 vs 2026-11-23 = 22d)
        const state = mockDb.getState();
        // Add overdraft movement on cuenta 2 (-600 cargo -> saldo_chequera = 500 - 50 - 600 = -150)
        state.movimientos_bancarios.push({
            id: 20,
            empresa_id: 2,
            cuenta_bancaria_id: 2,
            fecha: '2026-11-15',
            fecha_aplicado: null,
            documento: 'SOBREGIRO-1',
            concepto: 'CARGO FUERTE',
            monto: 600,
            cargo: 600,
            abono: 0,
            tipo_remesa_id: 5,
            deleted_at: null
        });
        // Add expiring (2026-06-16 -> 160d on 2026-11-23) and expired (2026-05-17 -> 190d on 2026-11-23) checks on cuenta 2 (set floor earlier for test)
        state.cuentas_bancarias[1].fecha_saldo_inicial = '2026-01-01';
        state.cheques.push(
            {
                id: 20, empresa_id: 2, cuenta_bancaria_id: 2, fecha: '2026-06-16', fecha_aplicado: null,
                cheque: '2020', valor: 100, a_nombre: 'POR CADUCAR', cheque_anulado: 0, fue_noemitido: 0, es_reservado: 0, deleted_at: null
            },
            {
                id: 21, empresa_id: 2, cuenta_bancaria_id: 2, fecha: '2026-05-17', fecha_aplicado: null,
                cheque: '2021', valor: 200, a_nombre: 'CADUCO', cheque_anulado: 0, fue_noemitido: 0, es_reservado: 0, deleted_at: null
            }
        );

        const socketEmits = [];
        const tgSent = [];
        const mockIo = {
            to: (room) => ({
                emit: (eventName, payload) => socketEmits.push({ room, eventName, payload })
            })
        };

        const run1 = await telegramSentinelService.runBankSentinelChecks({
            db: mockDb.pool,
            io: mockIo,
            todayOverride: '2026-11-23',
            slotKey: 'morning',
            overrides: {
                remesasSinAcreditar: [
                    { estacion: 'Estación Jueves', codigo_estacion: '002', fecha_turno: '2026-11-19', pendiente_conciliar_usd: 1200 },
                    { estacion: 'Estación Viernes', codigo_estacion: '003', fecha_turno: '2026-11-20', pendiente_conciliar_usd: 900 }
                ]
            },
            sendTelegramFn: async (chatId, text, markup) => tgSent.push({ chatId, text, markup })
        });

        assert.strictEqual(run1.dispatched, true);
        assert.strictEqual(run1.evaluation.counts.remesas_48h_habiles, 1);
        assert.strictEqual(run1.evaluation.counts.cheques_por_caducar, 1);
        assert.strictEqual(run1.evaluation.counts.cheques_caducos, 1);
        assert.strictEqual(run1.evaluation.counts.sobregiros, 1);
        assert.strictEqual(run1.evaluation.counts.cuentas_sin_validar, 1); // only cuenta 2 (22d > 7d); cuenta 1 is 3d <= 7d

        // In-app notifications: ONLY active authorized users (#1, #2, #3), NEVER #4 (no perm) or #5 (inactive)
        assert.strictEqual(state.notifications.length, 3);
        const notifiedUserIds = state.notifications.map(n => n.user_id).sort((a, b) => a - b);
        assert.deepStrictEqual(notifiedUserIds, [1, 2, 3]);
        assert.ok(state.notifications.every(n => n.type === 'bank_sentinel_alert'));

        // Socket.io MUST emit 'notification:new' (NOT 'new_notification')
        assert.strictEqual(socketEmits.length, 3);
        assert.ok(socketEmits.every(e => e.eventName === 'notification:new'));
        assert.deepStrictEqual(socketEmits.map(e => e.room).sort(), ['user_1', 'user_2', 'user_3']);

        // Telegram sent ONLY to active authorized telegram_usuarios (#10)
        assert.strictEqual(tgSent.length, 1);
        assert.strictEqual(tgSent[0].chatId, '888000101');
        assert.ok(tgSent[0].text.includes('CENTINELA BANCARIO'));

        // 3. Second run same day -> deduplicated (0 notifications, 0 telegrams)
        const run2 = await telegramSentinelService.runBankSentinelChecks({
            db: mockDb.pool,
            io: mockIo,
            todayOverride: '2026-11-23',
            slotKey: 'afternoon',
            overrides: {
                remesasSinAcreditar: [
                    { estacion: 'Estación Jueves', codigo_estacion: '002', fecha_turno: '2026-11-19', pendiente_conciliar_usd: 1200 }
                ]
            },
            sendTelegramFn: async (chatId, text, markup) => tgSent.push({ chatId, text, markup })
        });
        assert.strictEqual(run2.dispatched, false);
        assert.strictEqual(run2.reason, 'deduplicated');
        assert.strictEqual(state.notifications.length, 3);
        assert.strictEqual(socketEmits.length, 3);
        assert.strictEqual(tgSent.length, 1);

        // 4. New finding later same day dispatches ONLY the new finding
        state.cheques.push({
            id: 22, empresa_id: 2, cuenta_bancaria_id: 2, fecha: '2026-05-01', fecha_aplicado: null,
            cheque: '2022', valor: 350, a_nombre: 'NUEVO CADUCO', cheque_anulado: 0, fue_noemitido: 0, es_reservado: 0, deleted_at: null
        });
        const run3 = await telegramSentinelService.runBankSentinelChecks({
            db: mockDb.pool,
            io: mockIo,
            todayOverride: '2026-11-23',
            slotKey: 'bank_periodic',
            overrides: { remesasSinAcreditar: [] },
            sendTelegramFn: async (chatId, text, markup) => tgSent.push({ chatId, text, markup })
        });
        assert.strictEqual(run3.dispatched, true);
        assert.strictEqual(run3.newAlertsCount, 1);
        assert.strictEqual(run3.newAlerts[0].category, 'CHEQUE_CADUCO');
        assert.strictEqual(tgSent.length, 2);
    });

    it('Regresión Iter 2: 409 en numero_cuenta ambiguo, OCR DEPOSITO sin falso POS, PATCH comprobante 423/audit y reporte-fecha 400', async () => {
        const state = mockDb.getState();
        // Agregar misma numeración de cuenta en dos empresas distintas ('DUP-555')
        state.cuentas_bancarias.push(
            {
                id: 3,
                empresa_id: 1,
                banco_id: 1,
                tipo_cuenta_id: 1,
                numero: 'DUP-555',
                nombre: 'DUP EMPRESA 1',
                cod_cta: '110203',
                activa: 1,
                orden: 3,
                saldo_inicial: 300.00,
                fecha_saldo_inicial: '2026-10-01'
            },
            {
                id: 4,
                empresa_id: 2,
                banco_id: 2,
                tipo_cuenta_id: 2,
                numero: 'DUP-555',
                nombre: 'DUP EMPRESA 2',
                cod_cta: '110204',
                activa: 1,
                orden: 4,
                saldo_inicial: 400.00,
                fecha_saldo_inicial: '2026-10-01'
            }
        );

        // 1. Ambiguous numero_cuenta in POST /movimientos/transferencia -> 409 & cleanup idempotency key so retry succeeds 201
        const ambigIdemKey = 'idem-ambig-tr-1';
        const ambigTr = await apiCall('POST', '/api/bancos/movimientos/transferencia', {
            userId: 2,
            headers: { 'X-Idempotency-Key': ambigIdemKey },
            body: {
                numero_cuenta_debitar: 'DUP-555',
                numero_cuenta_acreditar: '200-002-88',
                fecha: '2026-11-20',
                monto: 25
            }
        });
        assert.strictEqual(ambigTr.status, 409);
        assert.strictEqual(state.bancos_idempotency_keys.length, 0);

        const resolvedTr = await apiCall('POST', '/api/bancos/movimientos/transferencia', {
            userId: 2,
            headers: { 'X-Idempotency-Key': ambigIdemKey },
            body: {
                id_empresa_debitar: '001',
                numero_cuenta_debitar: 'DUP-555',
                numero_cuenta_acreditar: '200-002-88',
                fecha: '2026-11-20',
                monto: 25
            }
        });
        assert.strictEqual(resolvedTr.status, 201);
        assert.strictEqual(resolvedTr.data.empresa_debitar_id, 1);
        assert.strictEqual(resolvedTr.data.empresa_acreditar_id, 2);

        // 2. Ambiguous numero_cuenta in single-leg POST /movimientos -> 409, retry with id_empresa -> 201
        const ambigMovKey = 'idem-ambig-mov-1';
        const ambigMov = await apiCall('POST', '/api/bancos/movimientos', {
            userId: 2,
            headers: { 'X-Idempotency-Key': ambigMovKey },
            body: {
                numero_cuenta: 'DUP-555',
                fecha: '2026-11-20',
                documento: 'DEP-AMB',
                concepto: 'DEPOSITO AMBIGUO',
                monto: 50,
                cod_remesa: 'RM'
            }
        });
        assert.strictEqual(ambigMov.status, 409);
        assert.strictEqual(state.bancos_idempotency_keys.find(k => k.idempotency_key === ambigMovKey), undefined);

        const resolvedMov = await apiCall('POST', '/api/bancos/movimientos', {
            userId: 2,
            headers: { 'X-Idempotency-Key': ambigMovKey },
            body: {
                id_empresa: 2,
                numero_cuenta: 'DUP-555',
                fecha: '2026-11-20',
                documento: 'DEP-AMB',
                concepto: 'DEPOSITO DESAMBIGUADO',
                monto: 50,
                cod_remesa: 'RM'
            }
        });
        assert.strictEqual(resolvedMov.status, 201);

        // 3. Ambiguous numero_cuenta in GET /movimientos/kardex & GET /movimientos/reporte-fecha -> 409 without id_empresa, 200 with id_empresa
        const ambigKardex = await apiCall('GET', '/api/bancos/movimientos/kardex?numero_cuenta=DUP-555', { userId: 2 });
        assert.strictEqual(ambigKardex.status, 409);

        const okKardex = await apiCall('GET', '/api/bancos/movimientos/kardex?numero_cuenta=DUP-555&id_empresa=002', { userId: 2 });
        assert.strictEqual(okKardex.status, 200);
        assert.strictEqual(okKardex.data.cuenta.id, 4);

        const ambigRep = await apiCall('GET', '/api/bancos/movimientos/reporte-fecha?numero_cuenta=DUP-555&desde=2026-11-01&hasta=2026-11-30', { userId: 2 });
        assert.strictEqual(ambigRep.status, 409);

        const okRep = await apiCall('GET', '/api/bancos/movimientos/reporte-fecha?numero_cuenta=DUP-555&id_empresa=002&desde=2026-11-01&hasta=2026-11-30', { userId: 2 });
        assert.strictEqual(okRep.status, 200);
        assert.strictEqual(okRep.data.length, 1);
        assert.strictEqual(okRep.data[0].cuenta_bancaria_id, 4);

        // 4. GET /movimientos/reporte-fecha rejects invalid calendar dates with 400
        const badRepDate = await apiCall('GET', '/api/bancos/movimientos/reporte-fecha?cuenta_bancaria_id=1&desde=2026-02-30&hasta=2026-03-01', { userId: 2 });
        assert.strictEqual(badRepDate.status, 400);

        // 5. POST /movimientos/analizar-comprobante must NOT misclassify DEPOSITO as TARJETA_CREDITO via 'POS' substring
        telegramGeminiService.getGeminiApiKeyCandidates = async () => ['fake-gemini-key'];
        telegramGeminiService.generateWithGeminiFallback = async () => ({
            text: JSON.stringify({
                tipo_documento: 'Boleta Bancaria',
                metodo_pago: 'DEPOSITO',
                monto_usd: 450,
                fecha: '2026-11-18',
                banco_origen: 'BANCO PROMERICA',
                cuenta_origen: '100-001-99',
                referencia: 'BOL-450',
                concepto: 'DEPOSITO DIARIO'
            }),
            response: {}
        });
        const ocrBoleta = await apiCall('POST', '/api/bancos/movimientos/analizar-comprobante', {
            userId: 2,
            body: { data_url: TINY_PNG_DATA_URL, nombre_original: 'boleta_bancaria.png' }
        });
        assert.strictEqual(ocrBoleta.status, 200);
        assert.strictEqual(ocrBoleta.data.analisis.metodo_pago, 'DEPOSITO');
        assert.strictEqual(ocrBoleta.data.analisis.cod_remesa_sugerido, 'RM');
        assert.strictEqual(ocrBoleta.data.analisis.direccion, 'ABONO');
        assert.strictEqual(ocrBoleta.data.analisis.cuenta_bancaria_id, 1);

        // 6. PATCH /movimientos/comprobantes/:comprobanteId enforces closed period (423) and audits open updates (UPDATE_COMPROBANTE_NOTA)
        // Movement #2 has fecha '2026-10-05' on cuenta 1 (closed until '2026-10-31')
        state.movimientos_bancarios_comprobantes.push({
            id: 99,
            movimiento_id: 2,
            nombre_original: 'locked_comp.png',
            archivo_url: '/api/uploads/movimientos/locked_comp.png',
            mime_type: 'image/png',
            tamano_bytes: 100,
            nota: 'Antes',
            ocr_json: null
        });
        const lockedPatch = await apiCall('PATCH', '/api/bancos/movimientos/comprobantes/99', {
            userId: 2,
            body: { nota: 'Intento en periodo cerrado' }
        });
        assert.strictEqual(lockedPatch.status, 423);

        // Open movement #300 on cuenta 1 ('2026-11-15' > '2026-10-31') -> 200 + audit
        state.movimientos_bancarios.push({
            id: 300,
            empresa_id: 1,
            cuenta_bancaria_id: 1,
            fecha: '2026-11-15',
            fecha_aplicado: null,
            documento: 'OPEN-300',
            concepto: 'MOV ABIERTO',
            monto: 75,
            cargo: 0,
            abono: 75,
            tipo_remesa_id: 1,
            deleted_at: null
        });
        state.movimientos_bancarios_comprobantes.push({
            id: 100,
            movimiento_id: 300,
            nombre_original: 'open_comp.png',
            archivo_url: '/api/uploads/movimientos/open_comp.png',
            mime_type: 'image/png',
            tamano_bytes: 100,
            nota: 'Antes',
            ocr_json: null
        });
        const openPatch = await apiCall('PATCH', '/api/bancos/movimientos/comprobantes/100', {
            userId: 2,
            body: { nota: 'Nota actualizada' }
        });
        assert.strictEqual(openPatch.status, 200);
        assert.strictEqual(openPatch.data.comprobante.nota, 'Nota actualizada');
        assert.ok(state.bancos_auditoria_detalle.some(a => a.rawParams?.[3] === 'UPDATE_COMPROBANTE_NOTA'));
    });

    it('R4.3 Bridge: evaluateSentinelAlerts y runProactiveSentinelDispatch integran Centinela Bancario, notificaciones SIPE y deduplicación segura', async () => {
        const state = mockDb.getState();
        // Provocar sobregiro en cuenta 2 (saldo_inicial = 500, mov #4 = -50 -> +cargo 600 -> -150) y cheque caduco (>180d)
        state.movimientos_bancarios.push({
            id: 25,
            empresa_id: 2,
            cuenta_bancaria_id: 2,
            fecha: '2026-11-15',
            fecha_aplicado: null,
            documento: 'SOBREGIRO-BRIDGE',
            concepto: 'CARGO BRIDGE',
            monto: 600,
            cargo: 600,
            abono: 0,
            tipo_remesa_id: 5,
            deleted_at: null
        });
        state.cuentas_bancarias[1].fecha_saldo_inicial = '2026-01-01';
        state.cheques.push({
            id: 25,
            empresa_id: 2,
            cuenta_bancaria_id: 2,
            fecha: '2026-05-01',
            fecha_aplicado: null,
            cheque: '2025',
            valor: 200,
            a_nombre: 'CADUCO BRIDGE',
            cheque_anulado: 0,
            fue_noemitido: 0,
            es_reservado: 0,
            deleted_at: null
        });

        const socketEmits = [];
        const tgMsgs = [];
        const mockIo = {
            to: (room) => ({
                emit: (eventName, payload) => socketEmits.push({ room, eventName, payload })
            })
        };

        // 1. runProactiveSentinelDispatch integra alertas bancarias, in-app notifications, Socket.io y Telegram
        const dispatch1 = await telegramSentinelService.runProactiveSentinelDispatch({
            db: mockDb.pool,
            externalDb: mockDb.externalPool,
            io: mockIo,
            todayOverride: '2026-11-23',
            slotKey: 'bridge_slot',
            sendTelegramFn: async (chatId, html, markup) => tgMsgs.push({ chatId, html, markup })
        });

        assert.strictEqual(dispatch1.dispatched, true);
        assert.strictEqual(dispatch1.result.hasAlerts, true);
        assert.strictEqual(dispatch1.result.severity, 'critico');
        assert.ok(dispatch1.result.alertKeys.includes('SOBREGIRO_CHEQUERA'));
        assert.ok(dispatch1.result.alertKeys.includes('CHEQUE_CADUCO'));
        assert.ok(dispatch1.result.alertKeys.includes('CUENTA_SIN_VALIDAR_7D'));
        assert.ok(dispatch1.result.bancos_centinela?.hasAlerts);

        // Mensaje Telegram incluye sección CENTINELA BANCARIO
        assert.strictEqual(tgMsgs.length, 1);
        assert.ok(tgMsgs[0].html.includes('CENTINELA BANCARIO'));

        // Notificaciones in-app y Socket.io emitidas solo para usuarios autorizados (#1, #2, #3)
        assert.strictEqual(dispatch1.inAppNotifiedCount, 3);
        assert.strictEqual(state.notifications.length, 3);
        assert.ok(state.notifications.every(n => n.type === 'bank_sentinel_alert'));
        assert.strictEqual(socketEmits.length, 3);
        assert.ok(socketEmits.every(e => e.eventName === 'notification:new'));

        // 2. Segunda corrida con mismo slotKey es deduplicada
        const dispatch2 = await telegramSentinelService.runProactiveSentinelDispatch({
            db: mockDb.pool,
            externalDb: mockDb.externalPool,
            io: mockIo,
            todayOverride: '2026-11-23',
            slotKey: 'bridge_slot',
            sendTelegramFn: async (chatId, html, markup) => tgMsgs.push({ chatId, html, markup })
        });
        assert.strictEqual(dispatch2.dispatched, false);
        assert.strictEqual(dispatch2.reason, 'deduplicated');

        // 3. runBankSentinelChecks posterior en el mismo día tampoco duplica notificaciones ni Telegram
        const bankRun = await telegramSentinelService.runBankSentinelChecks({
            db: mockDb.pool,
            externalDb: mockDb.externalPool,
            io: mockIo,
            todayOverride: '2026-11-23',
            slotKey: 'bank_periodic',
            overrides: { remesasSinAcreditar: [] },
            sendTelegramFn: async (chatId, html, markup) => tgMsgs.push({ chatId, html, markup })
        });
        assert.strictEqual(bankRun.dispatched, false);
        assert.strictEqual(bankRun.reason, 'deduplicated');
        assert.strictEqual(state.notifications.length, 3);
        assert.strictEqual(tgMsgs.length, 1);

        // 4. Seguridad cuando tablas bancarias faltan/lanzan ER_NO_SUCH_TABLE
        const missingBankTablesDb = {
            query: async (sql) => {
                const s = String(sql);
                if (/FROM cuentas_bancarias|FROM cheques|FROM validaciones_saldo_banco/i.test(s)) {
                    const err = new Error('Table does not exist');
                    err.code = 'ER_NO_SUCH_TABLE';
                    throw err;
                }
                return [[], []];
            }
        };
        const safeEval = await telegramSentinelService.evaluateSentinelAlerts({
            db: missingBankTablesDb,
            todayOverride: '2026-11-23',
            overrides: {
                bancosData: { total: 50000, cuentas: [{ banco: 'BAC', cuenta: 'Op', saldo: 50000 }] },
                pagosData: [],
                prestamosRows: [],
                transitoData: { resumen: {}, remesas_en_transito: [], vales_pendientes_72h: [] }
            }
        });
        assert.strictEqual(safeEval.hasAlerts, false);
        assert.strictEqual(safeEval.severity, 'ok');
    });
});
