const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const dbModule = require('../db');
const { JWT_SECRET, invalidateUserAuthCache, restoreUser } = require('../middleware/auth');
const { parseAndMatchBankStatement } = require('../services/bankStatementParserService');

function createTransferenciasMockDb() {
    const createInitialState = () => ({
        seq: {
            movimientos_bancarios: 200,
            bancos_auditoria_detalle: 100
        },
        users: [
            { id: 1, username: 'admin_tf', nombre: 'Admin TF', status: 'active', role_id: 1, role_name: 'Administrator', token_version: 1 },
            { id: 2, username: 'ops_tf', nombre: 'Operador Bancos', status: 'active', role_id: 2, role_name: 'Contador', token_version: 1 },
            { id: 3, username: 'viewer_tf', nombre: 'Sin Permisos', status: 'active', role_id: 3, role_name: 'Invitado', token_version: 1 }
        ],
        rolePermissions: {
            1: ['/dashboard/bancos/transferencias', '/dashboard/bancos/conciliacion', 'manage_movimientos', 'manage_conciliacion_bancaria'],
            2: ['/dashboard/bancos/transferencias', '/dashboard/bancos/conciliacion', 'manage_movimientos', 'manage_conciliacion_bancaria'],
            3: ['view_dashboard']
        },
        empresas: [
            { id: 1, codigo: '001', nombre: 'SIPE INVERSIONES S.A. DE C.V.' },
            { id: 2, codigo: '002', nombre: 'ESTACION SAN MARTIN S.A. DE C.V.' }
        ],
        bancos: [
            { id: 1, empresa_id: 1, codigo: 'PROMERICA', descripcion: 'BANCO PROMERICA' },
            { id: 2, empresa_id: 2, codigo: 'AGRICOLA', descripcion: 'BANCO AGRICOLA' }
        ],
        tipos_remesas: [
            { id: 1, empresa_id: 1, codigo: 'TR', descripcion: 'TRANSFERENCIA' },
            { id: 2, empresa_id: 1, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 3, empresa_id: 1, codigo: 'NA', descripcion: 'NOTA DE ABONO' },
            { id: 4, empresa_id: 2, codigo: 'TR', descripcion: 'TRANSFERENCIA' },
            { id: 5, empresa_id: 2, codigo: 'NC', descripcion: 'NOTA DE CARGO' },
            { id: 6, empresa_id: 2, codigo: 'NA', descripcion: 'NOTA DE ABONO' }
        ],
        cuentas_bancarias: [
            {
                id: 1,
                empresa_id: 1,
                banco_id: 1,
                tipo_cuenta_id: 1,
                numero: '200010551100',
                nombre: 'CUENTA CORRIENTE CORPORATIVA',
                activa: 1,
                orden: 1,
                saldo_inicial: 10000,
                fecha_saldo_inicial: '2026-01-01'
            },
            {
                id: 2,
                empresa_id: 2,
                banco_id: 2,
                tipo_cuenta_id: 1,
                numero: '5010998877',
                nombre: 'OPERACIONES SAN MARTIN',
                activa: 1,
                orden: 2,
                saldo_inicial: 5000,
                fecha_saldo_inicial: '2026-01-01'
            },
            {
                id: 3,
                empresa_id: 1,
                banco_id: 2,
                tipo_cuenta_id: 1,
                numero: '5010112233',
                nombre: 'CUENTA RESERVA SIPE',
                activa: 1,
                orden: 3,
                saldo_inicial: 3000,
                fecha_saldo_inicial: '2026-01-01'
            }
        ],
        movimientos_bancarios: [
            {
                id: 10,
                empresa_id: 1,
                cuenta_bancaria_id: 1,
                fecha: '2026-10-15',
                fecha_aplicado: null,
                documento: 'MIR-990',
                concepto: 'TRASLADO A ESTACION SAN MARTIN 5010998877',
                monto: 1250.00,
                cargo: 1250.00,
                abono: 0,
                tipo_remesa_id: 1,
                cod_cta: null,
                num_partida: null,
                es_contabilizado: 0,
                transfer_group_id: null,
                comprobante_url: null,
                fingerprint: 'fp_10',
                version: 1,
                deleted_at: null
            },
            {
                id: 11,
                empresa_id: 2,
                cuenta_bancaria_id: 2,
                fecha: '2026-10-15',
                fecha_aplicado: '2026-10-15',
                documento: 'MIR-990',
                concepto: 'TRANSFERENCIA RECIBIDA DESDE CORPORATIVA',
                monto: 1250.00,
                cargo: 0,
                abono: 1250.00,
                tipo_remesa_id: 4,
                cod_cta: null,
                num_partida: null,
                es_contabilizado: 0,
                transfer_group_id: null,
                comprobante_url: null,
                fingerprint: 'fp_11',
                version: 1,
                deleted_at: null
            }
        ],
        cheques: [],
        conciliacion_periodos: [],
        conciliacion_reapertura_solicitudes: [],
        validaciones_saldo_banco: [],
        bancos_idempotency_keys: [],
        bancos_auditoria_detalle: [],
        conciliacion_cruces: [],
        conciliacion_cruce_items: [],
        conciliacion_reglas_clasificacion: [],
        conciliacion_importaciones: [],
        movimientos_bancarios_comprobantes: []
    });

    let state = createInitialState();

    const enrichAccount = (c) => {
        const emp = state.empresas.find(e => e.id === c.empresa_id) || {};
        const bco = state.bancos.find(b => b.id === c.banco_id) || {};
        return {
            ...c,
            empresa_codigo: emp.codigo || '001',
            empresa_nombre: emp.nombre || '',
            banco_codigo: bco.codigo || 'PROMERICA',
            banco_nombre: bco.descripcion || 'BANCO'
        };
    };

    const query = async (sql, params = []) => {
        const s = String(sql || '').replace(/\s+/g, ' ').trim();
        const sl = s.toLowerCase();

        // Auth queries
        if (sl.includes('from users') && (sl.includes('where u.id = ?') || sl.includes('where id = ?'))) {
            const u = state.users.find(x => x.id === Number(params[0]));
            if (!u) return [[]];
            return [[{
                id: u.id, username: u.username, nombre: u.nombre, status: u.status,
                role_id: u.role_id, role_name: u.role_name, role: u.role_name, token_version: u.token_version
            }]];
        }
        if (sl.includes('join role_permissions rp') || sl.includes('from role_permissions rp')) {
            const roleId = Number(params[0]);
            return [(state.rolePermissions[roleId] || []).map(name => ({ name }))];
        }

        // Idempotency
        if (sl.startsWith('insert into bancos_idempotency_keys')) {
            const [key, scope, userId, reqHash] = params;
            const existing = state.bancos_idempotency_keys.find(k => k.idempotency_key === key && k.scope === scope);
            if (existing) {
                const err = new Error('Duplicate key');
                err.code = 'ER_DUP_ENTRY';
                throw err;
            }
            state.bancos_idempotency_keys.push({ idempotency_key: key, scope, user_id: userId, request_hash: reqHash, status_code: null, response_json: null });
            return [{ insertId: 1 }];
        }
        if (sl.includes('from bancos_idempotency_keys where idempotency_key = ? and scope = ?')) {
            const [key, scope] = params;
            return [state.bancos_idempotency_keys.filter(k => k.idempotency_key === key && k.scope === scope)];
        }
        if (sl.startsWith('update bancos_idempotency_keys set status_code = ?')) {
            const [code, respJson, key, scope] = params;
            const row = state.bancos_idempotency_keys.find(k => k.idempotency_key === key && k.scope === scope);
            if (row) { row.status_code = code; row.response_json = respJson; }
            return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sl.startsWith('delete from bancos_idempotency_keys')) {
            const [key, scope] = params;
            state.bancos_idempotency_keys = state.bancos_idempotency_keys.filter(k => !(k.idempotency_key === key && k.scope === scope && k.status_code === null));
            return [{ affectedRows: 1 }];
        }

        // Correlativo generation / validation
        if (sl.startsWith("select transfer_group_id from movimientos_bancarios where transfer_group_id like 'tfb%'")) {
            const rows = state.movimientos_bancarios
                .filter(m => m.transfer_group_id && /^TFB/i.test(m.transfer_group_id))
                .map(m => ({ transfer_group_id: m.transfer_group_id }));
            return [rows];
        }
        if (sl.startsWith('select id from movimientos_bancarios where transfer_group_id = ?')) {
            const code = String(params[0] || '').trim();
            const checkDeleted = sl.includes('deleted_at is null');
            const rows = state.movimientos_bancarios.filter(m =>
                m.transfer_group_id === code && (!checkDeleted || !m.deleted_at)
            );
            return [rows.map(r => ({ id: r.id }))];
        }

        // Closed period check
        if (sl.includes('from conciliacion_periodos') && sl.includes("estado = 'cerrado'")) {
            const ctaId = Number(params[0]);
            const rows = state.conciliacion_periodos
                .filter(p => p.cuenta_bancaria_id === ctaId && p.estado === 'CERRADO')
                .sort((a, b) => b.fecha_corte.localeCompare(a.fecha_corte));
            return [rows];
        }
        if (sl.includes('from conciliacion_periodos') && sl.includes('where cuenta_bancaria_id = ?')) {
            const ctaId = Number(params[0]);
            return [state.conciliacion_periodos.filter(p => p.cuenta_bancaria_id === ctaId)];
        }

        // Accounts
        if (sl.includes('from cuentas_bancarias') && sl.includes('where c.id = ? and c.activa = true')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(params[0]) && x.activa);
            return [c ? [enrichAccount(c)] : []];
        }
        if (sl.includes('from cuentas_bancarias') && sl.includes('where c.id = ? limit 1')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(params[0]));
            return [c ? [enrichAccount(c)] : []];
        }
        if (sl.includes('from cuentas_bancarias cb') && sl.includes('where cb.id = ?')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(params[0]));
            return [c ? [enrichAccount(c)] : []];
        }
        if (sl.includes('from cuentas_bancarias cb') && sl.includes('where cb.activa = true and cb.id != ?')) {
            const excl = Number(params[0]);
            return [state.cuentas_bancarias.filter(x => x.activa && x.id !== excl).map(enrichAccount)];
        }
        if (sl.includes('from cuentas_bancarias where id = ? limit 1')) {
            const c = state.cuentas_bancarias.find(x => x.id === Number(params[0]));
            return [c ? [c] : []];
        }

        // Tipos remesas
        if (sl.includes('from tipos_remesas') && sl.includes('where empresa_id = ?')) {
            const empId = Number(params[0]);
            const rows = state.tipos_remesas.filter(tr => tr.empresa_id === empId && (params.slice(1).length === 0 || params.slice(1).includes(tr.codigo)));
            return [rows];
        }

        // Balances aggregates
        if (sl.includes('from movimientos_bancarios') && sl.includes('sum(abono)')) {
            const ctaId = Number(params[0]);
            const list = state.movimientos_bancarios.filter(m => m.cuenta_bancaria_id === ctaId && !m.deleted_at);
            const sumAbono = list.reduce((acc, r) => acc + Number(r.abono || 0), 0);
            const sumCargo = list.reduce((acc, r) => acc + Number(r.cargo || 0), 0);
            return [[{
                sum_abono: sumAbono, sum_cargo: sumCargo,
                abonos_en_transito: list.filter(m => !m.fecha_aplicado).reduce((acc, r) => acc + Number(r.abono || 0), 0),
                cargos_en_transito: list.filter(m => !m.fecha_aplicado).reduce((acc, r) => acc + Number(r.cargo || 0), 0),
                total_abonos_libros: sumAbono, total_cargos_libros: sumCargo
            }]];
        }
        if (sl.includes('from cheques') && sl.includes('sum(valor)')) {
            return [[{ total_cheques_libros: 0, cheques_en_transito: 0, sum_valor: 0, reservados_count: 0, reservados_monto: 0 }]];
        }

        // Transferencias endpoints
        if (sl.includes('from movimientos_bancarios mb') && sl.includes('where mb.transfer_group_id is not null')) {
            const rows = state.movimientos_bancarios
                .filter(m => m.transfer_group_id && !m.deleted_at)
                .map(m => {
                    const c = enrichAccount(state.cuentas_bancarias.find(x => x.id === m.cuenta_bancaria_id) || {});
                    return {
                        ...m,
                        empresa_codigo: c.empresa_codigo,
                        empresa_nombre: c.empresa_nombre,
                        numero_cuenta: c.numero,
                        cuenta_nombre: c.nombre,
                        banco_nombre: c.banco_nombre
                    };
                });
            return [rows];
        }
        if (sl.startsWith('select * from movimientos_bancarios where transfer_group_id = ?')) {
            const gid = String(params[0] || '');
            return [state.movimientos_bancarios.filter(m => m.transfer_group_id === gid && !m.deleted_at)];
        }
        if (sl.startsWith('update movimientos_bancarios set deleted_at = now()') && sl.includes('where transfer_group_id = ?')) {
            const [deletedBy, motivo, gid] = params;
            let count = 0;
            for (const m of state.movimientos_bancarios) {
                if (m.transfer_group_id === gid && !m.deleted_at) {
                    m.deleted_at = '2026-10-20 12:00:00';
                    m.deleted_by = deletedBy;
                    m.motivo_eliminacion = motivo;
                    m.version++;
                    count++;
                }
            }
            return [{ affectedRows: count }];
        }

        // Conciliacion counterparts & unlinked other-account mirrors
        if (sl.includes('from movimientos_bancarios mb') && sl.includes('where mb.transfer_group_id in')) {
            const excludeCta = sl.includes('mb.cuenta_bancaria_id != ?') ? Number(params[params.length - 1]) : null;
            const gids = new Set((excludeCta ? params.slice(0, -1) : params).map(String));
            const rows = state.movimientos_bancarios
                .filter(m => !m.deleted_at && m.transfer_group_id && gids.has(String(m.transfer_group_id)) && (!excludeCta || m.cuenta_bancaria_id !== excludeCta))
                .map(m => {
                    const c = enrichAccount(state.cuentas_bancarias.find(x => x.id === m.cuenta_bancaria_id) || {});
                    return {
                        ...m,
                        numero_cuenta: c.numero,
                        cuenta_nombre: c.nombre,
                        banco_nombre: c.banco_nombre,
                        empresa_codigo: c.empresa_codigo,
                        empresa_nombre: c.empresa_nombre
                    };
                });
            return [rows];
        }
        if (sl.includes('from movimientos_bancarios mb') && sl.includes('where mb.transfer_group_id is null') && sl.includes('mb.cuenta_bancaria_id != ?')) {
            const ctaId = Number(params[0]);
            const rows = state.movimientos_bancarios
                .filter(m => !m.deleted_at && !m.transfer_group_id && m.cuenta_bancaria_id !== ctaId)
                .map(m => {
                    const c = enrichAccount(state.cuentas_bancarias.find(x => x.id === m.cuenta_bancaria_id) || {});
                    return {
                        ...m,
                        numero_cuenta: c.numero,
                        cuenta_nombre: c.nombre,
                        banco_nombre: c.banco_nombre,
                        empresa_codigo: c.empresa_codigo,
                        empresa_nombre: c.empresa_nombre
                    };
                });
            return [rows];
        }

        // Conciliacion GET /data rows
        if (sl.includes('from movimientos_bancarios m left join tipos_remesas tr')) {
            const ctaId = Number(params[0]);
            if (sl.includes('and m.fecha_aplicado is not null')) {
                return [state.movimientos_bancarios.filter(m => m.cuenta_bancaria_id === ctaId && !m.deleted_at && m.fecha_aplicado).map(m => ({ ...m, origen_tipo: 'MOV', tipo_doc: 'TR' }))];
            }
            if (sl.includes('(m.fecha_aplicado is null or m.fecha_aplicado > ?)')) {
                return [state.movimientos_bancarios.filter(m => m.cuenta_bancaria_id === ctaId && !m.deleted_at && !m.fecha_aplicado).map(m => ({ ...m, origen_tipo: 'MOV', tipo_doc: 'TR' }))];
            }
        }
        if (sl.includes('from cheques ch')) {
            return [[]];
        }

        // Vincular / INSERT / UPDATE movimientos_bancarios
        if (sl.startsWith('insert into movimientos_bancarios')) {
            const id = ++state.seq.movimientos_bancarios;
            const [empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto] = params;
            const isDeb = sl.includes('values (?, ?, ?, ?, ?, ?, ?, ?, 0,');
            const val7 = Number(params[7] || 0);
            const cargo = isDeb ? val7 : 0;
            const abono = isDeb ? 0 : val7;
            const tipo_remesa_id = params[8] || null;
            const cod_cta = params[9] || null;
            const num_partida = params[10] || null;
            const transfer_group_id = params[14] || null;
            const fingerprint = params[15] || null;
            state.movimientos_bancarios.push({
                id,
                empresa_id: Number(empresa_id),
                cuenta_bancaria_id: Number(cuenta_bancaria_id),
                fecha,
                fecha_aplicado: fecha_aplicado || null,
                documento,
                concepto,
                monto: Number(monto),
                cargo,
                abono,
                tipo_remesa_id,
                cod_cta,
                num_partida,
                es_contabilizado: 0,
                transfer_group_id,
                comprobante_url: null,
                fingerprint,
                version: 1,
                deleted_at: null
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (sl.startsWith('select * from movimientos_bancarios where id in')) {
            const ids = params.map(Number);
            return [state.movimientos_bancarios.filter(m => ids.includes(Number(m.id)))];
        }
        if (sl.startsWith('select * from movimientos_bancarios where id = ?')) {
            return [state.movimientos_bancarios.filter(m => Number(m.id) === Number(params[0]))];
        }
        if (sl.startsWith('update movimientos_bancarios set transfer_group_id = ?')) {
            const tg = params[0];
            const updatedBy = params[1];
            const ids = params.slice(2).map(Number);
            let aff = 0;
            for (const m of state.movimientos_bancarios) {
                if (ids.includes(Number(m.id)) && !m.deleted_at) {
                    m.transfer_group_id = tg;
                    m.updated_by = updatedBy;
                    m.version++;
                    aff++;
                }
            }
            return [{ affectedRows: aff }];
        }

        if (sl.startsWith('insert into bancos_auditoria_detalle')) {
            state.bancos_auditoria_detalle.push({ id: ++state.seq.bancos_auditoria_detalle, params });
            return [{ insertId: state.seq.bancos_auditoria_detalle }];
        }

        return [[]];
    };

    const pool = {
        query,
        getConnection: async () => {
            const snapshot = JSON.stringify(state);
            return {
                query,
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {
                    const restored = JSON.parse(snapshot);
                    Object.keys(restored).forEach(k => { state[k] = restored[k]; });
                },
                release: () => {}
            };
        }
    };

    return {
        pool,
        getState: () => state,
        reset: () => { state = createInitialState(); }
    };
}

describe('Transferencias Internas e Identificación en Conciliación Bancaria', () => {
    let mockDb;
    let origGetDb;
    let origGetDbIfReady;
    let origWithTransaction;
    let server;
    let baseUrl;

    const makeToken = (userId = 2) => jwt.sign(
        { id: userId, role_id: userId === 1 ? 1 : (userId === 2 ? 2 : 3), token_version: 1, tv: 1 },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const reqJson = async (method, urlPath, { body = null, userId = 2, headers = {} } = {}) => {
        const res = await fetch(`${baseUrl}${urlPath}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${makeToken(userId)}`,
                ...headers
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    };

    before(async () => {
        mockDb = createTransferenciasMockDb();
        origGetDb = dbModule.getDb;
        origGetDbIfReady = dbModule.getDbIfReady;
        origWithTransaction = dbModule.withTransaction;

        dbModule.getDb = () => mockDb.pool;
        dbModule.getDbIfReady = () => mockDb.pool;
        dbModule.withTransaction = async (cb) => {
            const conn = await mockDb.pool.getConnection();
            await conn.beginTransaction();
            try {
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

        delete require.cache[require.resolve('../routes/bancos')];
        delete require.cache[require.resolve('../routes/conciliacion')];
        const bancosRouter = require('../routes/bancos');
        const conciliacionRouter = require('../routes/conciliacion');

        const app = express();
        app.use(express.json({ limit: '5mb' }));
        app.use((req, _res, next) => {
            req.io = { to: () => ({ to: () => ({ emit: () => {} }) }) };
            next();
        });
        app.use('/api/bancos/conciliacion', conciliacionRouter);
        app.use('/api/bancos', bancosRouter);

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
        [1, 2, 3].forEach(id => { invalidateUserAuthCache(id); restoreUser(id); });
    });

    beforeEach(() => {
        mockDb.reset();
        [1, 2, 3].forEach(id => { invalidateUserAuthCache(id); restoreUser(id); });
    });

    describe('1. Correlativo TFB, Registro Dual, Consulta Agrupada y Eliminación Segura', () => {
        it('GET /siguiente-correlativo genera TFB000000000001 e incrementa tras registrar transferencia', async () => {
            const first = await reqJson('GET', '/api/bancos/transferencias/siguiente-correlativo');
            assert.equal(first.status, 200);
            assert.equal(first.data.codigo_transferencia, 'TFB000000000001');

            const createRes = await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 2,
                    fecha: '2026-10-20',
                    concepto: 'MOVIMIENTO POR TRANSFERENCIA BANCARIA',
                    concepto_detalle: 'FONDEO COMBUSTIBLE',
                    documento: 'T365-881',
                    monto: 1500,
                    tipo_partida: 'DIARIO',
                    num_partida: '0042',
                    cod_cta: '1102-05'
                },
                headers: { 'X-Idempotency-Key': 'tf-idem-001' }
            });
            assert.equal(createRes.status, 201);
            assert.equal(createRes.data.transfer_group_id, 'TFB000000000001');
            assert.equal(createRes.data.codigo_transferencia, 'TFB000000000001');
            assert.equal(createRes.data.intercompany, true);

            // Replay idempotente
            const replay = await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 2,
                    fecha: '2026-10-20',
                    concepto: 'MOVIMIENTO POR TRANSFERENCIA BANCARIA',
                    concepto_detalle: 'FONDEO COMBUSTIBLE',
                    documento: 'T365-881',
                    monto: 1500,
                    tipo_partida: 'DIARIO',
                    num_partida: '0042',
                    cod_cta: '1102-05'
                },
                headers: { 'X-Idempotency-Key': 'tf-idem-001' }
            });
            assert.equal(replay.status, 201);
            assert.equal(replay.data.transfer_group_id, 'TFB000000000001');

            const nextCor = await reqJson('GET', '/api/bancos/transferencias/siguiente-correlativo');
            assert.equal(nextCor.status, 200);
            assert.equal(nextCor.data.codigo_transferencia, 'TFB000000000002');
        });

        it('GET /transferencias agrupa ambas patas, calcula resumen y filtra por interempresa y estado', async () => {
            await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 2,
                    fecha: '2026-10-21',
                    monto: 800,
                    documento: 'REF-INTER'
                }
            });
            await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 3,
                    fecha: '2026-10-22',
                    fecha_aplicado: '2026-10-22',
                    monto: 400,
                    documento: 'REF-MISMA'
                }
            });

            const listAll = await reqJson('GET', '/api/bancos/transferencias');
            assert.equal(listAll.status, 200);
            assert.equal(listAll.data.transferencias.length, 2);
            assert.equal(listAll.data.resumen.total_transferencias, 2);
            assert.equal(listAll.data.resumen.interempresa_count, 1);
            assert.equal(listAll.data.resumen.ambas_conciliadas, 1);
            assert.equal(listAll.data.resumen.ambas_pendientes, 1);

            const onlyInter = await reqJson('GET', '/api/bancos/transferencias?solo_interempresa=true');
            assert.equal(onlyInter.status, 200);
            assert.equal(onlyInter.data.transferencias.length, 1);
            assert.equal(onlyInter.data.transferencias[0].documento, 'REF-INTER');
        });

        it('Rechaza correlativo duplicado (409), misma cuenta (400), período cerrado (423) y usuario sin permiso (403)', async () => {
            const unauth = await reqJson('GET', '/api/bancos/transferencias', { userId: 3 });
            assert.equal(unauth.status, 403);

            const sameAcc = await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 1,
                    fecha: '2026-10-20',
                    monto: 100
                }
            });
            assert.equal(sameAcc.status, 400);

            const create1 = await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 3,
                    fecha: '2026-10-20',
                    monto: 200,
                    codigo_transferencia: 'TFB000000000500'
                }
            });
            assert.equal(create1.status, 201);

            const dupCode = await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 3,
                    fecha: '2026-10-20',
                    monto: 200,
                    codigo_transferencia: 'TFB000000000500'
                }
            });
            assert.equal(dupCode.status, 409);

            mockDb.getState().conciliacion_periodos.push({
                id: 1, cuenta_bancaria_id: 2, fecha_corte: '2026-10-31', estado: 'CERRADO'
            });
            const lockedRes = await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 2,
                    fecha: '2026-10-25',
                    monto: 300
                }
            });
            assert.equal(lockedRes.status, 423);
        });

        it('DELETE /transferencias/:groupId elimina ambas patas cuando está pendiente y bloquea (409) si está conciliada', async () => {
            const pendRes = await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 3,
                    fecha: '2026-10-20',
                    monto: 350
                }
            });
            const pendCode = pendRes.data.transfer_group_id;

            const delOk = await reqJson('DELETE', `/api/bancos/transferencias/${pendCode}`);
            assert.equal(delOk.status, 200);
            const activeWithCode = mockDb.getState().movimientos_bancarios.filter(m => m.transfer_group_id === pendCode && !m.deleted_at);
            assert.equal(activeWithCode.length, 0);

            const concRes = await reqJson('POST', '/api/bancos/transferencias', {
                body: {
                    cuenta_debitar_id: 1,
                    cuenta_acreditar_id: 3,
                    fecha: '2026-10-20',
                    fecha_aplicado: '2026-10-20',
                    monto: 450
                }
            });
            const delBlocked = await reqJson('DELETE', `/api/bancos/transferencias/${concRes.data.transfer_group_id}`);
            assert.equal(delBlocked.status, 409);
        });
    });

    describe('2. Identificación en Extractos Bancarios y Conciliación Bancaria', () => {
        it('parseAndMatchBankStatement detecta VINCULADA, ESPEJO_OTRA_CUENTA y NUMERO_CUENTA_INTERNA', () => {
            const parsed = parseAndMatchBankStatement({
                rawData: [
                    ['FECHA', 'DOCUMENTO', 'DESCRIPCION', 'DEBITO', 'CREDITO'],
                    ['20/10/2026', 'TF-100', 'TRANSFERENCIA ENTRE CUENTAS', '600.00', '0'],
                    ['15/10/2026', 'EXT-88', 'TRANSFER365 REMITIDA A CTA 5010998877', '1250.00', '0'],
                    ['25/10/2026', 'EXT-99', 'TRANSFERENCIA A CUENTA PROPIA 5010112233', '900.00', '0']
                ],
                pendientes: [
                    {
                        id: 501,
                        origen_tipo: 'MOV',
                        documento: 'TF-100',
                        concepto: 'TRASLADO A SAN MARTIN',
                        monto: 600,
                        cargo: 600,
                        abono: 0,
                        fecha: '2026-10-20',
                        transfer_group_id: 'TFB000000000010'
                    }
                ],
                cuentaId: 1,
                empresaId: 1,
                otrasCuentasInternas: [
                    { id: 2, empresa_id: 2, empresa_codigo: '002', empresa_nombre: 'ESTACION SAN MARTIN S.A. DE C.V.', banco_nombre: 'BANCO AGRICOLA', numero: '5010998877', nombre: 'OPERACIONES SAN MARTIN' },
                    { id: 3, empresa_id: 1, empresa_codigo: '001', empresa_nombre: 'SIPE INVERSIONES S.A. DE C.V.', banco_nombre: 'BANCO AGRICOLA', numero: '5010112233', nombre: 'CUENTA RESERVA SIPE' }
                ],
                movimientosOtrasCuentas: [
                    {
                        id: 11,
                        cuenta_bancaria_id: 2,
                        empresa_id: 2,
                        empresa_codigo: '002',
                        empresa_nombre: 'ESTACION SAN MARTIN S.A. DE C.V.',
                        banco_nombre: 'BANCO AGRICOLA',
                        numero_cuenta: '5010998877',
                        cuenta_nombre: 'OPERACIONES SAN MARTIN',
                        fecha: '2026-10-15',
                        fecha_aplicado: '2026-10-15',
                        documento: 'MIR-990',
                        concepto: 'TRANSFERENCIA RECIBIDA DESDE CORPORATIVA',
                        monto: 1250,
                        cargo: 0,
                        abono: 1250,
                        transfer_group_id: null
                    }
                ],
                transferCounterpartsByGroup: new Map([
                    ['TFB000000000010', {
                        id: 502,
                        cuenta_bancaria_id: 2,
                        empresa_id: 2,
                        empresa_codigo: '002',
                        empresa_nombre: 'ESTACION SAN MARTIN S.A. DE C.V.',
                        banco_nombre: 'BANCO AGRICOLA',
                        numero_cuenta: '5010998877',
                        cuenta_nombre: 'OPERACIONES SAN MARTIN',
                        documento: 'TF-100',
                        fecha: '2026-10-20',
                        fecha_aplicado: null
                    }]
                ])
            });

            assert.equal(parsed.resumen_extracto.transferencias_internas_detectadas, 3);

            const r1 = parsed.transacciones[0];
            assert.equal(r1.transferencia_interna_detectada?.tipo, 'VINCULADA');
            assert.equal(r1.match?.es_transferencia_interna, true);
            assert.equal(r1.match?.transfer_group_id, 'TFB000000000010');

            const r2 = parsed.transacciones[1];
            assert.equal(r2.transferencia_interna_detectada?.tipo, 'ESPEJO_OTRA_CUENTA');
            assert.equal(r2.transferencia_interna_detectada?.movimiento_espejo_id, 11);
            assert.equal(r2.transferencia_interna_detectada?.intercompany, true);
            assert.equal(r2.tipo_remesa_codigo, 'TR');

            const r3 = parsed.transacciones[2];
            assert.equal(r3.transferencia_interna_detectada?.tipo, 'NUMERO_CUENTA_INTERNA');
            assert.equal(r3.transferencia_interna_detectada?.cuenta_contraparte_id, 3);
            assert.equal(r3.transferencia_interna_detectada?.intercompany, false);
            assert.equal(r3.tipo_remesa_codigo, 'TR');
        });

        it('GET /conciliacion/data devuelve transferencias_internas y sugiere espejos sin vincular; POST /vincular-transferencia-interna enlaza los 3 modos', async () => {
            // Al inicio existen mov #10 (cta 1 CARGO $1250) y mov #11 (cta 2 ABONO $1250) sin transfer_group_id
            const initialData = await reqJson('GET', '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31');
            assert.equal(initialData.status, 200);
            assert.ok(initialData.data.transferencias_internas);
            assert.equal(initialData.data.transferencias_internas.total_sugerencias_espejo, 1);
            assert.equal(initialData.data.transferencias_internas.sugerencias_espejo[0].movimiento_local_id, 10);
            assert.equal(initialData.data.transferencias_internas.sugerencias_espejo[0].movimiento_contraparte_id, 11);

            // Modo 1: VINCULAR_EXISTENTES
            const linkRes = await reqJson('POST', '/api/bancos/conciliacion/vincular-transferencia-interna', {
                body: {
                    modo: 'VINCULAR_EXISTENTES',
                    cuenta_bancaria_id: 1,
                    movimiento_id: 10,
                    movimiento_contraparte_id: 11
                }
            });
            assert.equal(linkRes.status, 200);
            assert.ok(linkRes.data.transfer_group_id.startsWith('TFB'));

            const afterLink = await reqJson('GET', '/api/bancos/conciliacion/data?cuenta_id=1&desde=2026-10-01&hasta=2026-10-31');
            assert.equal(afterLink.status, 200);
            assert.equal(afterLink.data.transferencias_internas.total_sugerencias_espejo, 0);
            assert.equal(afterLink.data.transferencias_internas.total_vinculadas, 1);
            assert.equal(afterLink.data.transferencias_internas.total_asimetricas, 1);
            const mov10 = afterLink.data.pendientes.find(p => p.origen_tipo === 'MOV' && p.id === 10);
            assert.equal(mov10.es_transferencia_interna, true);
            assert.equal(mov10.transfer_contraparte.cuenta_bancaria_id, 2);
            assert.equal(mov10.transfer_contraparte.conciliado, true);

            // Modo 2: CREAR_Y_VINCULAR_ESPEJO
            mockDb.getState().movimientos_bancarios.push({
                id: 55,
                empresa_id: 2,
                cuenta_bancaria_id: 2,
                fecha: '2026-10-24',
                fecha_aplicado: null,
                documento: 'ESP-55',
                concepto: 'TRASLADO DESDE SIPE',
                monto: 777,
                cargo: 0,
                abono: 777,
                tipo_remesa_id: 4,
                es_contabilizado: 0,
                transfer_group_id: null,
                version: 1,
                deleted_at: null
            });
            const mirrorRes = await reqJson('POST', '/api/bancos/conciliacion/vincular-transferencia-interna', {
                body: {
                    modo: 'CREAR_Y_VINCULAR_ESPEJO',
                    cuenta_bancaria_id: 1,
                    movimiento_contraparte_id: 55,
                    fecha: '2026-10-24',
                    fecha_aplicado: '2026-10-24',
                    documento: 'ESP-55',
                    concepto: 'TRANSFERENCIA HACIA SAN MARTIN'
                }
            });
            assert.equal(mirrorRes.status, 201);
            const createdLocal = mockDb.getState().movimientos_bancarios.find(m => m.id === mirrorRes.data.movimiento_id);
            const updatedCp = mockDb.getState().movimientos_bancarios.find(m => m.id === 55);
            assert.equal(createdLocal.cargo, 777);
            assert.equal(createdLocal.transfer_group_id, updatedCp.transfer_group_id);

            // Modo 3: CREAR_PAR_COMPLETO
            const pairRes = await reqJson('POST', '/api/bancos/conciliacion/vincular-transferencia-interna', {
                body: {
                    modo: 'CREAR_PAR_COMPLETO',
                    cuenta_bancaria_id: 1,
                    cuenta_contraparte_id: 3,
                    direccion_actual: 'CARGO',
                    fecha: '2026-10-26',
                    fecha_aplicado: '2026-10-26',
                    monto: 900,
                    concepto: 'TRANSFERENCIA HACIA CUENTA RESERVA'
                }
            });
            assert.equal(pairRes.status, 201);
            const debLeg = mockDb.getState().movimientos_bancarios.find(m => m.id === pairRes.data.debit_id);
            const credLeg = mockDb.getState().movimientos_bancarios.find(m => m.id === pairRes.data.credit_id);
            assert.equal(debLeg.fecha_aplicado, '2026-10-26');
            assert.equal(credLeg.fecha_aplicado, null);
            assert.equal(debLeg.transfer_group_id, credLeg.transfer_group_id);
        });
    });

    describe('3. Verificación Estructural y Estándares UI/Responsive Frontend', () => {
        it('Registra ruta, navegación, lazyPages y cumple estándares AGENTS.md en TransferenciasBancarias y ConciliacionBancaria', () => {
            const root = path.join(__dirname, '..', '..');
            const navSrc = fs.readFileSync(path.join(root, 'frontend/src/config/navigation.js'), 'utf8');
            const regSrc = fs.readFileSync(path.join(root, 'frontend/src/config/routeRegistry.jsx'), 'utf8');
            const lazySrc = fs.readFileSync(path.join(root, 'frontend/src/pages/lazyPages.js'), 'utf8');
            const storSrc = fs.readFileSync(path.join(root, 'frontend/src/utils/bancosNavStorage.js'), 'utf8');
            const tfSrc = fs.readFileSync(path.join(root, 'frontend/src/pages/TransferenciasBancarias.jsx'), 'utf8');
            const concSrc = fs.readFileSync(path.join(root, 'frontend/src/pages/ConciliacionBancaria.jsx'), 'utf8');

            assert.ok(navSrc.includes("'/dashboard/bancos/transferencias'"));
            assert.ok(lazySrc.includes('TransferenciasBancarias'));
            assert.ok(regSrc.includes("defineRoute('bancos/transferencias'"));
            assert.ok(regSrc.includes("'/dashboard/bancos/transferencias'"));
            assert.ok(storSrc.includes("transferencias: '/dashboard/bancos/transferencias'"));

            assert.ok(tfSrc.includes('formatCuentaLabel'));
            assert.ok(tfSrc.includes('sortCuentas'));
            assert.ok(tfSrc.includes('ReportPreviewModal'));
            assert.ok(tfSrc.includes('ReceiptViewerModal'));
            assert.ok(tfSrc.includes('useConfirm'));
            assert.ok(tfSrc.includes('sanitizeSpreadsheetRows'));
            assert.ok(tfSrc.includes('table-responsive'));
            assert.ok(tfSrc.includes('form-grid'));
            assert.equal(tfSrc.includes('window.print('), false);

            assert.ok(concSrc.includes("setActiveTab('TRANSFERENCIAS')"));
            assert.ok(concSrc.includes('/bancos/conciliacion/vincular-transferencia-interna'));
            assert.ok(concSrc.includes('es_transferencia_interna'));
            assert.ok(concSrc.includes('transferencia_interna_detectada'));
        });
    });
});
