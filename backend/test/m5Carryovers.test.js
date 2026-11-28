const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

const dbModule = require('../db');
const { JWT_SECRET, invalidateUserAuthCache, restoreUser } = require('../middleware/auth');
const { normalizeMetodoPago, matchExtractedReceiptToCatalog } = require('../services/recordatoriosPagosService');

function makeToken(userId) {
    return jwt.sign({ id: userId, token_version: 1 }, JWT_SECRET, { expiresIn: '1h' });
}

async function httpRequest(baseUrl, method, urlPath, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${urlPath}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
}

describe('M5 Carryovers & Bitacora Sub-Router Entity Logging', () => {
    describe('(a) bitacora.js autoLogMiddleware() across sub-mounted Express routers', () => {
        let server;
        let baseUrl;
        let origGetDb;
        let autoLogMw;
        const bitacoraLogs = [];

        before(async () => {
            origGetDb = dbModule.getDb;
            dbModule.getDb = () => ({
                query: async (sql, params = []) => {
                    if (/INSERT INTO bitacora_logs/i.test(sql)) {
                        bitacoraLogs.push({
                            user_id: params[0],
                            username: params[1],
                            accion: params[2],
                            entidad: params[3],
                            entidad_id: params[4],
                            detalles: params[5],
                            ip_address: params[6]
                        });
                        return [{ insertId: bitacoraLogs.length }];
                    }
                    return [[]];
                }
            });
            delete require.cache[require.resolve('../middleware/bitacora')];
            autoLogMw = require('../middleware/bitacora').autoLogMiddleware;

            const app = express();
            app.use(express.json());
            app.use((req, _res, next) => {
                req.user = { id: 1, username: 'admin_test' };
                next();
            });
            app.use(autoLogMw());

            const tasksRouter = express.Router();
            tasksRouter.post('/', (_req, res) => res.status(201).json({ ok: true }));
            tasksRouter.post('/:id/attachments', (_req, res) => res.status(201).json({ ok: true }));
            tasksRouter.delete('/attachments/:attachmentId', (_req, res) => res.status(200).json({ ok: true }));

            const chequesRouter = express.Router();
            chequesRouter.post('/', (_req, res) => res.status(201).json({ ok: true }));

            const bancosRouter = express.Router();
            bancosRouter.post('/movimientos', (_req, res) => res.status(201).json({ ok: true }));

            app.use('/api/tasks', tasksRouter);
            app.use('/api/cheques', chequesRouter);
            app.use('/api/bancos', bancosRouter);

            server = http.createServer(app);
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            baseUrl = `http://127.0.0.1:${server.address().port}`;
        });

        after(async () => {
            if (server) await new Promise((resolve) => server.close(resolve));
            dbModule.getDb = origGetDb;
            delete require.cache[require.resolve('../middleware/bitacora')];
        });

        beforeEach(() => {
            bitacoraLogs.length = 0;
        });

        it('logs exact entidad across sub-mounted routers (/api/tasks, /api/tasks/:id/attachments, /api/cheques, /api/bancos/movimientos)', async () => {
            assert.equal((await httpRequest(baseUrl, 'POST', '/api/tasks', { body: { titulo: 'T1' } })).status, 201);
            assert.equal((await httpRequest(baseUrl, 'POST', '/api/tasks/1001/attachments?foo=bar', { body: { nota: 'ev' } })).status, 201);
            assert.equal((await httpRequest(baseUrl, 'DELETE', '/api/tasks/attachments/55')).status, 200);
            assert.equal((await httpRequest(baseUrl, 'POST', '/api/cheques', { body: { cheque: '5001' } })).status, 201);
            assert.equal((await httpRequest(baseUrl, 'POST', '/api/bancos/movimientos', { body: { monto: 100 } })).status, 201);

            // Allow setImmediate inside logAction to flush
            await new Promise((resolve) => setTimeout(resolve, 25));

            assert.equal(bitacoraLogs.length, 5);
            assert.deepEqual(
                bitacoraLogs.map((l) => ({ accion: l.accion, entidad: l.entidad, entidad_id: l.entidad_id })),
                [
                    { accion: 'CREATE', entidad: 'tasks', entidad_id: null },
                    { accion: 'CREATE', entidad: 'tasks.attachments', entidad_id: '1001' },
                    { accion: 'DELETE', entidad: 'tasks.attachments', entidad_id: '55' },
                    { accion: 'CREATE', entidad: 'cheques', entidad_id: null },
                    { accion: 'CREATE', entidad: 'bancos.movimientos', entidad_id: null }
                ]
            );
        });

        it('preserves compatibility with mocked unit req objects that only provide req.path', async () => {
            const mw = autoLogMw();
            let finishCb = null;
            const req = {
                method: 'POST',
                path: '/api/tasks/77/attachments',
                user: { id: 9, username: 'unit_mock' },
                body: { nota: 'unit' },
                ip: '127.0.0.1'
            };
            const res = {
                statusCode: 201,
                on: (ev, cb) => {
                    if (ev === 'finish') finishCb = cb;
                }
            };
            let nextCalled = false;
            mw(req, res, () => { nextCalled = true; });
            assert.equal(nextCalled, true);
            assert.equal(typeof finishCb, 'function');
            finishCb();

            await new Promise((resolve) => setTimeout(resolve, 25));
            assert.equal(bitacoraLogs.length, 1);
            assert.equal(bitacoraLogs[0].entidad, 'tasks.attachments');
            assert.equal(bitacoraLogs[0].entidad_id, '77');
            assert.equal(bitacoraLogs[0].accion, 'CREATE');
        });
    });

    describe('(b) & (d) cheques/operaciones routes validation', () => {
        let server;
        let baseUrl;
        let origGetDb;
        let origGetDbIfReady;
        let origGetExternalDb;
        let origWithTransaction;
        let solicitudes;
        let recordatorios;
        let vencimientos;
        let abonos;

        const createRouteMockPool = () => {
            const queryFn = async (sql, params = []) => {
                const q = String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();

                if (q.includes('from users u left join roles r') && q.includes('where u.id = ?')) {
                    return [[{ id: 1, username: 'admin_m5', nombre: 'Admin M5', status: 'active', role_id: 1, role_name: 'Administrator', token_version: 1 }]];
                }
                if (q.includes('from permissions p join role_permissions rp')) {
                    return [[{ name: 'manage_cheques' }, { name: 'manage_cheques_contado' }, { name: 'manage_recordatorios' }]];
                }
                if (/^(?:create table|alter table|show columns|show index)/.test(q)) {
                    if (q.startsWith('show columns')) return [[{ Field: 'id' }]];
                    return [{ affectedRows: 0 }];
                }
                if (q.includes('from information_schema.columns')) {
                    return [[{ COLUMN_NAME: 'beneficiario' }]];
                }

                // Cheques contado mock
                if (q.includes('from solicitud_chq_contado')) {
                    return [solicitudes.filter((s) => s.llave === params[0] && s.id_empresa === params[2])];
                }
                if (q.startsWith('update solicitud_chq_contado set num_cheque = ?')) {
                    const [numCheque, llaveCheque, llave, , estacion] = params;
                    const sol = solicitudes.find((s) => s.llave === llave && s.id_empresa === estacion);
                    if (sol) {
                        sol.num_cheque = numCheque;
                        sol.llave_cheque = llaveCheque || sol.llave_cheque;
                    }
                    return [{ affectedRows: sol ? 1 : 0 }];
                }

                // Operaciones recordatorios mock
                if (q.startsWith('select descripcion from web_rc_ubicaciones where id = ?')) {
                    return [[{ descripcion: 'ESTACION CENTRAL' }]];
                }
                if (q.startsWith('insert into web_rc_recordatorios ')) {
                    const id = 100 + recordatorios.length + 1;
                    recordatorios.push({ id, descripcion: params[0], monto: Number(params[3]) });
                    return [{ insertId: id }];
                }
                if (q.startsWith('insert into web_rc_recordatorios_vencimientos')) {
                    const id = 500 + vencimientos.length + 1;
                    vencimientos.push({ id, id_recordatorio: Number(params[0]), vencimiento: params[1], estado: q.includes("'c'") ? 'C' : 'P' });
                    return [{ insertId: id }];
                }
                if (q.includes('from recordatorios_pagos_abonos where id = ?')) {
                    return [abonos.filter((a) => Number(a.id) === Number(params[0]))];
                }
                if (q.includes('from web_rc_recordatorios_vencimientos a')) {
                    return [vencimientos.filter((v) => Number(v.id) === Number(params[0]))];
                }
                return [[]];
            };

            return {
                query: queryFn,
                getConnection: async () => ({
                    query: queryFn,
                    beginTransaction: async () => {},
                    commit: async () => {},
                    rollback: async () => {},
                    release: () => {}
                })
            };
        };

        before(async () => {
            origGetDb = dbModule.getDb;
            origGetDbIfReady = dbModule.getDbIfReady;
            origGetExternalDb = dbModule.getExternalDb;
            origWithTransaction = dbModule.withTransaction;

            const mockPool = createRouteMockPool();
            dbModule.getDb = () => mockPool;
            dbModule.getDbIfReady = () => mockPool;
            dbModule.getExternalDb = async () => mockPool;
            dbModule.withTransaction = async (cb) => {
                const conn = await mockPool.getConnection();
                try {
                    return await cb(conn);
                } finally {
                    conn.release();
                }
            };

            for (const rel of ['../routes/cheques', '../routes/operaciones']) {
                delete require.cache[require.resolve(rel)];
            }

            const app = express();
            app.use(express.json());
            app.use((req, _res, next) => {
                req.io = { to: () => ({ emit: () => {} }) };
                next();
            });
            app.use('/api/cheques', require('../routes/cheques'));
            app.use('/api', require('../routes/operaciones'));

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
            for (const rel of ['../routes/cheques', '../routes/operaciones']) {
                delete require.cache[require.resolve(rel)];
            }
        });

        beforeEach(() => {
            restoreUser(1);
            invalidateUserAuthCache(1);
            solicitudes = [
                { llave: 'SOL-CONT-1', id_empresa: '01', fecha: '2026-11-20', cod_proveedor: 'P01', monto: 250, num_cheque: '', llave_cheque: null, concepto: 'COMPRA' }
            ];
            recordatorios = [];
            vencimientos = [{ id: 500, id_recordatorio: 100, vencimiento: '2026-11-25', estado: 'P' }];
            abonos = [{ id: 1, vencimiento_id: 500, tipo_operacion: 'GASTO', metodo_pago: 'TRANSFERENCIA', cuenta_bancaria_id: 1, fecha_pago: '2026-11-20', monto: 100, estado_conciliacion: 'PENDIENTE' }];
        });

        it('(b) POST /api/cheques/contado/marcar-emitido returns 400 when registrar_en_bancos is truthy and cuenta_bancaria_id is missing', async () => {
            const token = makeToken(1);

            const missingRes = await httpRequest(baseUrl, 'POST', '/api/cheques/contado/marcar-emitido', {
                token,
                body: {
                    llave: 'SOL-CONT-1',
                    estacion_solicitud: '01',
                    cheque_num: '8001',
                    registrar_en_bancos: true
                }
            });
            assert.equal(missingRes.status, 400);
            assert.match(missingRes.data.message, /cuenta bancaria/i);

            const nullRes = await httpRequest(baseUrl, 'POST', '/api/cheques/contado/marcar-emitido', {
                token,
                body: {
                    llave: 'SOL-CONT-1',
                    estacion_solicitud: '01',
                    cheque_num: '8001',
                    registrar_en_bancos: true,
                    cuenta_bancaria_id: null
                }
            });
            assert.equal(nullRes.status, 400);

            const blankRes = await httpRequest(baseUrl, 'POST', '/api/cheques/contado/marcar-emitido', {
                token,
                body: {
                    llave: 'SOL-CONT-1',
                    estacion_solicitud: '01',
                    cheque_num: '8001',
                    registrar_en_bancos: true,
                    cuenta_bancaria_id: '   '
                }
            });
            assert.equal(blankRes.status, 400);

            // Without registrar_en_bancos, marking still succeeds
            const okNoBank = await httpRequest(baseUrl, 'POST', '/api/cheques/contado/marcar-emitido', {
                token,
                body: {
                    llave: 'SOL-CONT-1',
                    estacion_solicitud: '01',
                    cheque_num: '8001',
                    registrar_en_bancos: false
                }
            });
            assert.equal(okNoBank.status, 200);
            assert.equal(okNoBank.data.success, true);
        });

        it('(d) POST /api/operaciones/recordatorios rejects impossible fecPago (2026-02-31) with 400 while preserving empty fecPago fallback', async () => {
            const token = makeToken(1);

            const badDate = await httpRequest(baseUrl, 'POST', '/api/operaciones/recordatorios', {
                token,
                body: {
                    descripcion: 'PAGO PRUEBA FECHA',
                    id_ubicacion: 1,
                    iniciar: '2026-11-20',
                    monto: 120,
                    repetir: 1,
                    repetir_desc: 'VEZ',
                    pagado: true,
                    fecPago: '2026-02-31'
                }
            });
            assert.equal(badDate.status, 400);
            assert.match(badDate.data.message, /fecha de pago/i);

            const malformedDate = await httpRequest(baseUrl, 'POST', '/api/operaciones/recordatorios', {
                token,
                body: {
                    descripcion: 'PAGO PRUEBA FECHA',
                    id_ubicacion: 1,
                    iniciar: '2026-11-20',
                    monto: 120,
                    repetir: 1,
                    repetir_desc: 'VEZ',
                    pagado: true,
                    fecPago: 'not-a-date'
                }
            });
            assert.equal(malformedDate.status, 400);

            const emptyFallback = await httpRequest(baseUrl, 'POST', '/api/operaciones/recordatorios', {
                token,
                body: {
                    descripcion: 'PAGO CON FALLBACK HOY',
                    id_ubicacion: 1,
                    iniciar: '2026-11-20',
                    monto: 120,
                    repetir: 1,
                    repetir_desc: 'VEZ',
                    pagado: true,
                    fecPago: ''
                }
            });
            assert.equal(emptyFallback.status, 200);
        });

        it('(d) POST/PUT abonos rejects impossible fecha_pago (2026-02-31) and malformed strings with 400', async () => {
            const token = makeToken(1);

            const postBad = await httpRequest(baseUrl, 'POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                token,
                body: {
                    tipo_operacion: 'GASTO',
                    metodo_pago: 'TRANSFERENCIA',
                    monto: 50,
                    fecha_pago: '2026-02-31'
                }
            });
            assert.equal(postBad.status, 400);
            assert.match(postBad.data.message, /fecha de pago/i);

            const postMalformed = await httpRequest(baseUrl, 'POST', '/api/operaciones/recordatorios/vencimiento/500/abonos', {
                token,
                body: {
                    tipo_operacion: 'GASTO',
                    metodo_pago: 'TRANSFERENCIA',
                    monto: 50,
                    fecha_pago: 'invalid-date'
                }
            });
            assert.equal(postMalformed.status, 400);

            const putBad = await httpRequest(baseUrl, 'PUT', '/api/operaciones/recordatorios/abonos/1', {
                token,
                body: {
                    monto: 100,
                    fecha_pago: '2026-02-31'
                }
            });
            assert.equal(putBad.status, 400);
            assert.match(putBad.data.message, /fecha de pago/i);
        });
    });

    describe('(c) recordatoriosPagosService POS word-boundary classification', () => {
        it('classifies DEPOSITO cleanly without matching POS inside DEPOSITO, while matching standalone POS', () => {
            const depositoRes = matchExtractedReceiptToCatalog({
                metodo_pago: 'DEPOSITO',
                tipo_documento: 'COMPROBANTE DE DEPOSITO',
                monto_usd: 300
            }, []);
            assert.equal(depositoRes.metodo_pago, 'DEPOSITO');

            const posStandalone = matchExtractedReceiptToCatalog({
                metodo_pago: 'POS',
                tipo_documento: 'VOUCHER',
                monto_usd: 85.5
            }, []);
            assert.equal(posStandalone.metodo_pago, 'TARJETA_CREDITO');

            const posPhrase = matchExtractedReceiptToCatalog({
                metodo_pago: 'PAGO EN TERMINAL POS',
                monto_usd: 42
            }, []);
            assert.equal(posPhrase.metodo_pago, 'TARJETA_CREDITO');
        });

        it('classifies DEPOSITO EN EFECTIVO, BOLETA DE DEPOSITO EN EFECTIVO, and REMESA EN EFECTIVO as DEPOSITO while preserving standalone EFECTIVO', () => {
            assert.equal(normalizeMetodoPago('DEPOSITO EN EFECTIVO'), 'DEPOSITO');
            assert.equal(normalizeMetodoPago('BOLETA DE DEPOSITO EN EFECTIVO'), 'DEPOSITO');
            assert.equal(normalizeMetodoPago('REMESA EN EFECTIVO'), 'DEPOSITO');
            assert.equal(normalizeMetodoPago('EFECTIVO'), 'EFECTIVO');
            assert.equal(normalizeMetodoPago('CAJA'), 'EFECTIVO');
            assert.equal(normalizeMetodoPago('CASH'), 'EFECTIVO');
            assert.equal(normalizeMetodoPago('TRANSFERENCIA'), 'TRANSFERENCIA');
            assert.equal(normalizeMetodoPago('CHEQUE #123'), 'CHEQUE');

            const depEfectivo = matchExtractedReceiptToCatalog({
                metodo_pago: 'DEPOSITO EN EFECTIVO',
                monto_usd: 100
            }, []);
            assert.equal(depEfectivo.metodo_pago, 'DEPOSITO');

            const boletaDepEfectivo = matchExtractedReceiptToCatalog({
                metodo_pago: 'DEPOSITO',
                tipo_documento: 'BOLETA DE DEPOSITO EN EFECTIVO',
                monto_usd: 100
            }, []);
            assert.equal(boletaDepEfectivo.metodo_pago, 'DEPOSITO');

            const remesaEfectivo = matchExtractedReceiptToCatalog({
                metodo_pago: 'REMESA EN EFECTIVO',
                monto_usd: 100
            }, []);
            assert.equal(remesaEfectivo.metodo_pago, 'DEPOSITO');

            const soloEfectivo = matchExtractedReceiptToCatalog({
                metodo_pago: 'EFECTIVO',
                monto_usd: 100
            }, []);
            assert.equal(soloEfectivo.metodo_pago, 'EFECTIVO');

            const cajaChica = matchExtractedReceiptToCatalog({
                metodo_pago: 'CAJA CHICA',
                tipo_documento: 'RECIBO DE CAJA',
                monto_usd: 40
            }, []);
            assert.equal(cajaChica.metodo_pago, 'EFECTIVO');
        });
    });

    describe('(e) bancos.js manage_chequeras-only read access vs write denial', () => {
        let server;
        let baseUrl;
        let origGetDb;
        let origGetDbIfReady;
        let origWithTransaction;

        before(async () => {
            origGetDb = dbModule.getDb;
            origGetDbIfReady = dbModule.getDbIfReady;
            origWithTransaction = dbModule.withTransaction;

            const queryFn = async (sql, params = []) => {
                const q = String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();

                if (q.includes('from users u left join roles r') && q.includes('where u.id = ?')) {
                    return [[{
                        id: 2,
                        username: 'operador_chequeras',
                        nombre: 'Operador Chequeras',
                        status: 'active',
                        role_id: 2,
                        role_name: 'Operador',
                        token_version: 1
                    }]];
                }
                if (q.includes('from permissions p join role_permissions rp')) {
                    return [[{ name: 'manage_chequeras' }]];
                }
                if (/^(?:create table|alter table|show columns|show index)/.test(q)) {
                    if (q.startsWith('show columns')) return [[{ Field: 'id' }]];
                    return [{ affectedRows: 0 }];
                }
                if (q.includes('from empresas order by nombre')) {
                    return [[{ id: '01', nombre: 'SIPE CENTRAL' }]];
                }
                if (q.includes('from cuentas_bancarias c')) {
                    return [[{
                        corr: 1,
                        id_empresa: '01',
                        cod_banco: '01',
                        cod_tipo: '01',
                        numero: '0011223344',
                        nombre: 'Cuenta Operativa',
                        cod_cta: '1101-01',
                        activa: 'S',
                        orden: 1,
                        saldo_inicial: 1000,
                        fecha_saldo_inicial: '2026-01-01',
                        empresa_nombre: 'SIPE CENTRAL',
                        banco_nombre: 'BAC',
                        tipo_nombre: 'CORRIENTE'
                    }]];
                }
                if (q.includes('from cuentas_bancarias where id = ?')) {
                    return [Number(params[0]) === 1 ? [{ id: 1, saldo_inicial: 1000, fecha_saldo_inicial: '2026-01-01' }] : []];
                }
                if (q.includes('from movimientos_bancarios')) {
                    return [[{ total_abonos_libros: 0, total_cargos_libros: 0, abonos_en_transito: 0, cargos_en_transito: 0 }]];
                }
                if (q.includes('from cheques') && q.includes('total_cheques_libros')) {
                    return [[{ total_cheques_libros: 0, cheques_en_transito: 0 }]];
                }
                if (q.includes('from cheques') && q.includes('cheques_reservados_count')) {
                    return [[{ cheques_reservados_count: 0, cheques_reservados_monto: 0 }]];
                }
                if (q.includes('from cheques')) {
                    return [[]];
                }
                if (q.includes('from chequeras')) {
                    return [[]];
                }
                return [[]];
            };

            const mockPool = {
                query: queryFn,
                getConnection: async () => ({
                    query: queryFn,
                    beginTransaction: async () => {},
                    commit: async () => {},
                    rollback: async () => {},
                    release: () => {}
                })
            };

            dbModule.getDb = () => mockPool;
            dbModule.getDbIfReady = () => mockPool;
            dbModule.withTransaction = async (cb) => {
                const conn = await mockPool.getConnection();
                try {
                    return await cb(conn);
                } finally {
                    conn.release();
                }
            };

            delete require.cache[require.resolve('../routes/bancos')];

            const app = express();
            app.use(express.json());
            app.use((req, _res, next) => {
                req.io = { to: () => ({ emit: () => {} }) };
                next();
            });
            app.use('/api/bancos', require('../routes/bancos'));

            server = http.createServer(app);
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            baseUrl = `http://127.0.0.1:${server.address().port}`;
        });

        after(async () => {
            if (server) await new Promise((resolve) => server.close(resolve));
            dbModule.getDb = origGetDb;
            dbModule.getDbIfReady = origGetDbIfReady;
            dbModule.withTransaction = origWithTransaction;
            delete require.cache[require.resolve('../routes/bancos')];
        });

        beforeEach(() => {
            restoreUser(2);
            invalidateUserAuthCache(2);
        });

        it('allows non-admin user with only manage_chequeras on read endpoints required by CuentasBancarias and denies writes with 403', async () => {
            const token = makeToken(2);

            const cuentasRes = await httpRequest(baseUrl, 'GET', '/api/bancos/cuentas', { token });
            assert.equal(cuentasRes.status, 200);
            assert.ok(Array.isArray(cuentasRes.data));
            assert.equal(cuentasRes.data[0].numero, '0011223344');

            const catalogosRes = await httpRequest(baseUrl, 'GET', '/api/bancos/catalogos', { token });
            assert.equal(catalogosRes.status, 200);
            assert.ok(Array.isArray(catalogosRes.data.empresas));

            const resumenRes = await httpRequest(baseUrl, 'GET', '/api/bancos/cuentas/1/resumen', { token });
            assert.equal(resumenRes.status, 200);
            assert.equal(resumenRes.data.saldo_chequera, 1000);

            const chequerasRes = await httpRequest(baseUrl, 'GET', '/api/bancos/chequeras', { token });
            assert.equal(chequerasRes.status, 200);
            assert.ok(Array.isArray(chequerasRes.data));

            const postCuentaRes = await httpRequest(baseUrl, 'POST', '/api/bancos/cuentas', {
                token,
                body: { id_empresa: '01', numero: '9999', nombre: 'No Autorizada' }
            });
            assert.equal(postCuentaRes.status, 403);

            const postMovRes = await httpRequest(baseUrl, 'POST', '/api/bancos/movimientos', {
                token,
                body: { cuenta_bancaria_id: 1, monto: 50 }
            });
            assert.equal(postMovRes.status, 403);

            const getMovRes = await httpRequest(baseUrl, 'GET', '/api/bancos/movimientos', { token });
            assert.equal(getMovRes.status, 403);
        });
    });
});
