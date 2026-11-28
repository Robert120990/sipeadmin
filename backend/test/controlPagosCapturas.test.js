const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const dbModule = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const { guardProtectedUploadsMiddleware } = require('../utils/uploadSigner');
const recordatoriosPagosService = require('../services/recordatoriosPagosService');

// DataURLs válidos mínimos con firmas mágicas reales
const VALID_WEBP_B64 = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x14, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
    Buffer.from('VP8 '),
    Buffer.from([0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
]).toString('base64');
const VALID_WEBP_DATA_URL = `data:image/webp;base64,${VALID_WEBP_B64}`;

const VALID_PDF_B64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'ascii').toString('base64');
const VALID_PDF_DATA_URL = `data:application/pdf;base64,${VALID_PDF_B64}`;

const INVALID_MAGIC_WEBP_DATA_URL = `data:image/webp;base64,${Buffer.from('FAKE_WEBP_PAYLOAD').toString('base64')}`;

function createMockExternalDb() {
    let nextRecId = 100;
    let nextVenId = 500;
    let failNextCommit = false;
    const ubicaciones = [
        { id: 1, descripcion: 'ANDELSA' },
        { id: 2, descripcion: 'MIRAFLORES' }
    ];
    const recordatorios = [];
    const vencimientos = [];

    const runQuery = async (sql, params = []) => {
        const q = String(sql || '').replace(/\s+/g, ' ').trim();

        if (/^SELECT descripcion FROM web_rc_ubicaciones WHERE id = \?/i.test(q)) {
            const row = ubicaciones.find(u => Number(u.id) === Number(params[0]));
            return [row ? [row] : []];
        }

        if (/^INSERT INTO web_rc_recordatorios\b/i.test(q)) {
            const id = ++nextRecId;
            recordatorios.push({
                id,
                descripcion: params[0],
                id_ubicacion: Number(params[1]),
                iniciar: params[2],
                monto: Number(params[3]),
                repetir: Number(params[4]),
                repetir_desc: params[5],
                activo: Number(params[6]),
                forma_pago: params[7]
            });
            return [{ insertId: id }];
        }

        if (/^UPDATE web_rc_recordatorios SET descripcion=/i.test(q)) {
            const id = Number(params[8]);
            const rec = recordatorios.find(r => r.id === id);
            if (rec) {
                rec.descripcion = params[0];
                rec.id_ubicacion = Number(params[1]);
                rec.iniciar = params[2];
                rec.monto = Number(params[3]);
                rec.repetir = Number(params[4]);
                rec.repetir_desc = params[5];
                rec.activo = Number(params[6]);
                rec.forma_pago = params[7];
            }
            return [{ affectedRows: rec ? 1 : 0 }];
        }

        if (/^SELECT id, estado FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = \?/i.test(q)) {
            const rows = vencimientos.filter(v => v.id_recordatorio === Number(params[0]))
                .map(v => ({ id: v.id, estado: v.estado }));
            return [rows];
        }

        if (/^DELETE FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = \?/i.test(q)) {
            const rid = Number(params[0]);
            for (let i = vencimientos.length - 1; i >= 0; i--) {
                if (vencimientos[i].id_recordatorio === rid) vencimientos.splice(i, 1);
            }
            return [{ affectedRows: 1 }];
        }

        if (/^DELETE FROM web_rc_recordatorios_vencimientos WHERE id = \?/i.test(q)) {
            const vid = Number(params[0]);
            const idx = vencimientos.findIndex(v => v.id === vid);
            if (idx >= 0) vencimientos.splice(idx, 1);
            return [{ affectedRows: idx >= 0 ? 1 : 0 }];
        }

        if (/^INSERT INTO web_rc_recordatorios_vencimientos\b/i.test(q)) {
            const id = ++nextVenId;
            const isPaid = /VALUES\s*\(\?,\s*\?,\s*'C'/i.test(q);
            vencimientos.push({
                id,
                id_recordatorio: Number(params[0]),
                vencimiento: params[1],
                estado: isPaid ? 'C' : 'P',
                fecha_cancelacion: isPaid ? params[2] : null,
                forma_pago: isPaid ? (params[3] || '') : ''
            });
            return [{ insertId: id }];
        }

        if (/^SELECT id FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = \? ORDER BY/i.test(q)) {
            const matches = vencimientos.filter(v => v.id_recordatorio === Number(params[0]))
                .sort((a, b) => String(a.vencimiento).localeCompare(String(b.vencimiento)) || a.id - b.id);
            return [matches.length ? [{ id: matches[0].id }] : []];
        }

        if (/^SELECT id FROM web_rc_recordatorios_vencimientos WHERE id = \? LIMIT 1/i.test(q)) {
            const v = vencimientos.find(x => x.id === Number(params[0]));
            return [v ? [{ id: v.id }] : []];
        }

        if (/^SELECT id, id_recordatorio FROM web_rc_recordatorios_vencimientos WHERE id = \? LIMIT 1/i.test(q)) {
            const v = vencimientos.find(x => x.id === Number(params[0]));
            return [v ? [{ id: v.id, id_recordatorio: v.id_recordatorio }] : []];
        }

        if (/FROM web_rc_recordatorios_vencimientos a INNER JOIN web_rc_recordatorios b/i.test(q) && /WHERE a\.id = \?/i.test(q)) {
            const v = vencimientos.find(x => x.id === Number(params[0]));
            if (!v) return [[]];
            const b = recordatorios.find(r => r.id === v.id_recordatorio);
            if (!b) return [[]];
            const c = ubicaciones.find(u => u.id === b.id_ubicacion);
            return [[{
                id: v.id,
                id_recordatorio: v.id_recordatorio,
                vencimiento: v.vencimiento,
                vence: v.vencimiento,
                legacy_estado: v.estado,
                estado: v.estado === 'P' ? 'PENDIENTE' : 'CANCELADO',
                fecha_cancelacion: v.fecha_cancelacion,
                forma_pago: v.forma_pago,
                descripcion: b.descripcion,
                monto: b.monto,
                id_ubicacion: b.id_ubicacion,
                observacion: b.forma_pago,
                ubicacion: c?.descripcion || ''
            }]];
        }

        if (/^UPDATE web_rc_recordatorios_vencimientos SET estado = \?, fecha_cancelacion = \?, forma_pago = \? WHERE id = \?/i.test(q)) {
            const v = vencimientos.find(x => x.id === Number(params[3]));
            if (v) {
                v.estado = params[0];
                v.fecha_cancelacion = params[1];
                v.forma_pago = params[2];
            }
            return [{ affectedRows: v ? 1 : 0 }];
        }

        if (/^UPDATE web_rc_recordatorios_vencimientos SET forma_pago = \? WHERE id = \?/i.test(q)) {
            const v = vencimientos.find(x => x.id === Number(params[1]));
            if (v) v.forma_pago = params[0];
            return [{ affectedRows: v ? 1 : 0 }];
        }

        if (/^UPDATE web_rc_recordatorios_vencimientos SET estado = 'P', fecha_cancelacion = NULL WHERE id = \?/i.test(q)) {
            const v = vencimientos.find(x => x.id === Number(params[0]));
            if (v) {
                v.estado = 'P';
                v.fecha_cancelacion = null;
            }
            return [{ affectedRows: v ? 1 : 0 }];
        }

        if (/^SELECT c\.descripcion as ubicacion/i.test(q)) {
            const rows = vencimientos.map(v => {
                const b = recordatorios.find(r => r.id === v.id_recordatorio) || {};
                const c = ubicaciones.find(u => u.id === b.id_ubicacion) || {};
                return {
                    ubicacion: c.descripcion || '',
                    id_ubicacion: b.id_ubicacion,
                    descripcion: b.descripcion,
                    vence: v.vencimiento,
                    observacion: b.forma_pago,
                    forma_pago: v.forma_pago,
                    monto: b.monto,
                    estado: v.estado === 'P' ? 'PENDIENTE' : 'CANCELADO',
                    fecha_cancelacion: v.fecha_cancelacion,
                    id: v.id,
                    id_recordatorio: b.id
                };
            });
            return [rows];
        }

        return [[]];
    };

    return {
        reset: () => {
            nextRecId = 100;
            nextVenId = 500;
            failNextCommit = false;
            recordatorios.length = 0;
            vencimientos.length = 0;
        },
        setFailNextCommit: (val = true) => {
            failNextCommit = Boolean(val);
        },
        getState: () => ({ recordatorios, vencimientos }),
        query: runQuery,
        getConnection: async () => {
            let snapshot = null;
            return {
                beginTransaction: async () => {
                    snapshot = {
                        recordatorios: JSON.parse(JSON.stringify(recordatorios)),
                        vencimientos: JSON.parse(JSON.stringify(vencimientos))
                    };
                },
                commit: async () => {
                    if (failNextCommit) {
                        failNextCommit = false;
                        throw new Error('Simulated externalDb commit failure');
                    }
                    snapshot = null;
                },
                rollback: async () => {
                    if (snapshot) {
                        recordatorios.length = 0;
                        recordatorios.push(...snapshot.recordatorios);
                        vencimientos.length = 0;
                        vencimientos.push(...snapshot.vencimientos);
                        snapshot = null;
                    }
                },
                release: () => {},
                query: runQuery
            };
        }
    };
}

function createMockDb() {
    let nextAbonoId = 1;
    let nextCompId = 1;
    let compInsertAttempt = 0;
    let failOnCompInsertAttempt = null;
    const metaMap = new Map();
    const abonos = [];
    const comprobantes = [];

    const query = async (sql, params = []) => {
        const q = String(sql || '').replace(/\s+/g, ' ').trim();

        if (/^(?:CREATE TABLE|ALTER TABLE)/i.test(q)) {
            return [{ affectedRows: 0 }];
        }
        if (/INFORMATION_SCHEMA\.COLUMNS/i.test(q)) {
            return [[{ COLUMN_NAME: 'beneficiario' }]];
        }

        if (/^INSERT INTO recordatorios_vencimientos_meta\b/i.test(q)) {
            const venId = Number(params[0]);
            const prev = metaMap.get(venId) || {};
            metaMap.set(venId, {
                vencimiento_id: venId,
                recordatorio_id: Number(params[1]),
                tipo_operacion: params[2],
                metodo_pago_preferido: params[3] !== null && params[3] !== undefined ? params[3] : (prev.metodo_pago_preferido || null),
                cuenta_bancaria_id: params[4] !== null && params[4] !== undefined ? params[4] : (prev.cuenta_bancaria_id ?? null),
                cuenta_label: params[5] !== null && params[5] !== undefined ? params[5] : (prev.cuenta_label ?? null),
                tarjeta_ref: params[6] !== null && params[6] !== undefined ? params[6] : (prev.tarjeta_ref ?? null),
                notas_control: params[7] !== null && params[7] !== undefined ? params[7] : (prev.notas_control ?? null),
                updated_by: params[8],
                updated_at: new Date().toISOString()
            });
            return [{ affectedRows: 1 }];
        }

        if (/^SELECT \* FROM recordatorios_vencimientos_meta WHERE vencimiento_id = \?/i.test(q)) {
            const m = metaMap.get(Number(params[0]));
            return [m ? [m] : []];
        }

        if (/^SELECT vencimiento_id FROM recordatorios_vencimientos_meta WHERE vencimiento_id IN/i.test(q)) {
            const ids = params.map(Number);
            const matches = ids.filter(id => metaMap.has(id)).map(id => ({ vencimiento_id: id }));
            return [matches];
        }

        if (/^UPDATE recordatorios_vencimientos_meta SET vencimiento_id = \? WHERE vencimiento_id = \?/i.test(q)) {
            const newId = Number(params[0]);
            const oldId = Number(params[1]);
            if (metaMap.has(oldId)) {
                const row = { ...metaMap.get(oldId), vencimiento_id: newId };
                metaMap.delete(oldId);
                metaMap.set(newId, row);
            }
            return [{ affectedRows: 1 }];
        }

        if (/^DELETE FROM recordatorios_vencimientos_meta WHERE vencimiento_id IN/i.test(q)) {
            params.map(Number).forEach(id => metaMap.delete(id));
            return [{ affectedRows: 1 }];
        }

        if (/^DELETE FROM recordatorios_vencimientos_meta WHERE vencimiento_id = \?/i.test(q)) {
            metaMap.delete(Number(params[0]));
            return [{ affectedRows: 1 }];
        }

        if (/^SELECT vencimiento_id, tipo_operacion.*FROM recordatorios_vencimientos_meta WHERE vencimiento_id IN/i.test(q)) {
            const ids = new Set(params.map(Number));
            return [Array.from(metaMap.values()).filter(m => ids.has(m.vencimiento_id))];
        }

        if (/^INSERT INTO recordatorios_pagos_abonos\b/i.test(q)) {
            const id = nextAbonoId++;
            abonos.push({
                id,
                vencimiento_id: Number(params[0]),
                recordatorio_id: Number(params[1]),
                ubicacion: params[2],
                descripcion_ref: params[3],
                tipo_operacion: params[4],
                metodo_pago: params[5],
                cuenta_bancaria_id: params[6],
                cuenta_label: params[7],
                tarjeta_ref: params[8],
                beneficiario: params[9],
                referencia_doc: params[10],
                fecha_pago: params[11],
                monto: Number(params[12]),
                notas: params[13],
                estado_conciliacion: params[14],
                created_by: params[15],
                created_at: new Date().toISOString()
            });
            return [{ insertId: id }];
        }

        if (/^SELECT COUNT\(\*\) AS (cnt|c) FROM recordatorios_pagos_abonos WHERE vencimiento_id IN/i.test(q)) {
            const ids = new Set(params.map(Number));
            const cnt = abonos.filter(a => ids.has(a.vencimiento_id)).length;
            const alias = /AS cnt/i.test(q) ? 'cnt' : 'c';
            return [[{ [alias]: cnt }]];
        }

        if (/^SELECT COUNT\(\*\) AS c FROM recordatorios_pagos_abonos WHERE vencimiento_id = \?/i.test(q)) {
            const cnt = abonos.filter(a => a.vencimiento_id === Number(params[0])).length;
            return [[{ c: cnt }]];
        }

        if (/^SELECT \* FROM recordatorios_pagos_abonos WHERE id = \?/i.test(q)) {
            const row = abonos.find(a => a.id === Number(params[0]));
            return [row ? [row] : []];
        }

        if (/^SELECT \* FROM recordatorios_pagos_abonos WHERE vencimiento_id = \?/i.test(q)) {
            return [abonos.filter(a => a.vencimiento_id === Number(params[0]))];
        }

        if (/FROM recordatorios_pagos_abonos a LEFT JOIN cuentas_bancarias/i.test(q)) {
            return [abonos.filter(a => a.vencimiento_id === Number(params[0]))];
        }

        if (/FROM recordatorios_pagos_abonos WHERE vencimiento_id IN/i.test(q)) {
            const ids = new Set(params.map(Number));
            return [abonos.filter(a => ids.has(a.vencimiento_id))];
        }

        if (/^DELETE FROM recordatorios_pagos_abonos WHERE id = \?/i.test(q)) {
            const idx = abonos.findIndex(a => a.id === Number(params[0]));
            if (idx >= 0) abonos.splice(idx, 1);
            return [{ affectedRows: idx >= 0 ? 1 : 0 }];
        }

        if (/^DELETE FROM recordatorios_pagos_abonos WHERE vencimiento_id = \?/i.test(q)) {
            const vid = Number(params[0]);
            for (let i = abonos.length - 1; i >= 0; i--) {
                if (abonos[i].vencimiento_id === vid) abonos.splice(i, 1);
            }
            return [{ affectedRows: 1 }];
        }

        if (/^INSERT INTO recordatorios_pagos_comprobantes\b/i.test(q)) {
            compInsertAttempt += 1;
            if (failOnCompInsertAttempt !== null && compInsertAttempt === failOnCompInsertAttempt) {
                failOnCompInsertAttempt = null;
                throw new Error('Simulated DB failure inserting comprobante');
            }
            const id = nextCompId++;
            comprobantes.push({
                id,
                vencimiento_id: Number(params[0]),
                abono_id: params[1] ? Number(params[1]) : null,
                nombre_original: params[2],
                archivo_url: params[3],
                mime_type: params[4],
                tamano_bytes: Number(params[5]),
                ancho: params[6],
                alto: params[7],
                nota: params[8],
                uploaded_by: params[9],
                created_at: new Date().toISOString()
            });
            return [{ insertId: id }];
        }

        if (/^SELECT \* FROM recordatorios_pagos_comprobantes WHERE vencimiento_id = \?/i.test(q)) {
            return [comprobantes.filter(c => c.vencimiento_id === Number(params[0]))];
        }

        if (/^SELECT \* FROM recordatorios_pagos_comprobantes WHERE id = \?/i.test(q)) {
            const row = comprobantes.find(c => c.id === Number(params[0]));
            return [row ? [row] : []];
        }

        if (/^SELECT archivo_url FROM recordatorios_pagos_comprobantes WHERE vencimiento_id = \?/i.test(q)) {
            return [comprobantes.filter(c => c.vencimiento_id === Number(params[0])).map(c => ({ archivo_url: c.archivo_url }))];
        }

        if (/^SELECT vencimiento_id, COUNT\(\*\) AS total FROM recordatorios_pagos_comprobantes WHERE vencimiento_id IN/i.test(q)) {
            const ids = new Set(params.map(Number));
            const counts = new Map();
            comprobantes.forEach(c => {
                if (ids.has(c.vencimiento_id)) {
                    counts.set(c.vencimiento_id, (counts.get(c.vencimiento_id) || 0) + 1);
                }
            });
            return [Array.from(counts.entries()).map(([vencimiento_id, total]) => ({ vencimiento_id, total }))];
        }

        if (/^UPDATE recordatorios_pagos_comprobantes SET vencimiento_id = \? WHERE vencimiento_id IN/i.test(q)) {
            const newVenId = Number(params[0]);
            const oldIds = new Set(params.slice(1).map(Number));
            comprobantes.forEach(c => {
                if (oldIds.has(c.vencimiento_id)) c.vencimiento_id = newVenId;
            });
            return [{ affectedRows: 1 }];
        }

        if (/^UPDATE recordatorios_pagos_comprobantes SET nota = \? WHERE id = \?/i.test(q)) {
            const comp = comprobantes.find(c => c.id === Number(params[1]));
            if (comp) comp.nota = params[0];
            return [{ affectedRows: comp ? 1 : 0 }];
        }

        if (/^UPDATE recordatorios_pagos_comprobantes SET abono_id = NULL WHERE abono_id = \?/i.test(q)) {
            const aid = Number(params[0]);
            comprobantes.forEach(c => {
                if (c.abono_id === aid) c.abono_id = null;
            });
            return [{ affectedRows: 1 }];
        }

        if (/^DELETE FROM recordatorios_pagos_comprobantes WHERE id = \?/i.test(q)) {
            const idx = comprobantes.findIndex(c => c.id === Number(params[0]));
            if (idx >= 0) comprobantes.splice(idx, 1);
            return [{ affectedRows: idx >= 0 ? 1 : 0 }];
        }

        if (/^DELETE FROM recordatorios_pagos_comprobantes WHERE vencimiento_id = \?/i.test(q)) {
            const vid = Number(params[0]);
            for (let i = comprobantes.length - 1; i >= 0; i--) {
                if (comprobantes[i].vencimiento_id === vid) comprobantes.splice(i, 1);
            }
            return [{ affectedRows: 1 }];
        }

        return [[]];
    };

    return {
        reset: () => {
            nextAbonoId = 1;
            nextCompId = 1;
            compInsertAttempt = 0;
            failOnCompInsertAttempt = null;
            metaMap.clear();
            abonos.length = 0;
            comprobantes.length = 0;
        },
        setFailOnNextComprobanteInsert: (attemptNumber = 1) => {
            compInsertAttempt = 0;
            failOnCompInsertAttempt = attemptNumber;
        },
        getState: () => ({ metaMap, abonos, comprobantes }),
        query
    };
}

describe('Control de Pagos — Capturas, Creación con Comprobantes, CANCELADO y Seguridad', () => {
    const mockDb = createMockDb();
    const mockExternalDb = createMockExternalDb();
    const createdDiskFiles = new Set();

    let originalGetDb;
    let originalGetDbIfReady;
    let originalGetExternalDb;
    let server;
    let baseUrl;

    const makeToken = (overrides = {}) => jwt.sign(
        {
            id: 10,
            username: 'contador_test',
            role_id: 2,
            role: 'Usuario',
            permissions: ['manage_recordatorios', '/dashboard/operaciones/recordatorios'],
            status: 'active',
            ...overrides
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const requestJson = async (method, urlPath, { token = makeToken(), body = null } = {}) => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${baseUrl}${urlPath}`, {
            method,
            headers,
            body: body !== null ? JSON.stringify(body) : undefined
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, data };
    };

    const trackReceiptFiles = (items = []) => {
        for (const item of items) {
            if (item?.archivo_url) createdDiskFiles.add(item.archivo_url);
        }
    };

    before(async () => {
        originalGetDb = dbModule.getDb;
        originalGetDbIfReady = dbModule.getDbIfReady;
        originalGetExternalDb = dbModule.getExternalDb;

        dbModule.getDb = () => mockDb;
        dbModule.getDbIfReady = () => null;
        dbModule.getExternalDb = async () => mockExternalDb;

        delete require.cache[require.resolve('../routes/operaciones')];
        const operacionesRouter = require('../routes/operaciones');

        const app = express();
        app.use(express.json({ limit: '20mb' }));
        app.use('/api/uploads', guardProtectedUploadsMiddleware, express.static(path.join(__dirname, '..', 'uploads')));
        app.use('/api', operacionesRouter);

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    after(async () => {
        for (const archivoUrl of createdDiskFiles) {
            recordatoriosPagosService.deleteReceiptFile(archivoUrl);
        }
        createdDiskFiles.clear();

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        dbModule.getDb = originalGetDb;
        dbModule.getDbIfReady = originalGetDbIfReady;
        dbModule.getExternalDb = originalGetExternalDb;
        delete require.cache[require.resolve('../routes/operaciones')];
    });

    beforeEach(() => {
        mockDb.reset();
        mockExternalDb.reset();
    });

    it('R6.6: normalizeReceiptFileName renombra capturas genéricas de portapapeles/blob y preserva nombres reales', async () => {
        const { normalizeReceiptFileName } = await import('../../frontend/src/utils/receiptCompressor.js');
        const fixedDate = new Date(2026, 10, 27, 14, 5, 9);

        assert.equal(normalizeReceiptFileName('image.png', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('image.jpg', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('image.jpeg', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('image.webp', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('image.gif', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('image.bmp', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('clipboard.png', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('blob', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('blob:http://localhost/123', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName('', 'webp', fixedDate), 'captura_20261127_140509.webp');
        assert.equal(normalizeReceiptFileName(null, 'pdf', fixedDate), 'captura_20261127_140509.pdf');

        assert.equal(normalizeReceiptFileName('image.2026.png', 'webp', fixedDate), 'image.2026.webp');
        assert.equal(normalizeReceiptFileName('factura_123.png', 'webp', fixedDate), 'factura_123.webp');
        assert.equal(normalizeReceiptFileName('dte_puma.v2.jpg', 'webp', fixedDate), 'dte_puma.v2.webp');
        assert.equal(normalizeReceiptFileName('comprobante_bac.pdf', 'pdf', fixedDate), 'comprobante_bac.pdf');
    });

    it('R6.2: POST /operaciones/recordatorios pendiente (VEZ) guarda comprobantes WebP y PDF con nota y signed_url', async () => {
        const res = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Factura Energía AES',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 250.5,
                repetir: 1,
                repetir_desc: 'VEZ',
                forma_pago: 'BAC ANDELSA',
                pagado: false,
                comprobantes: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'captura_20261127_100000.webp', ancho: 800, alto: 600, nota: 'Transferencia 1' },
                    { data_url: VALID_PDF_DATA_URL, nombre_original: 'dte_aes.pdf', nota: 'DTE oficial' }
                ]
            }
        });

        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
        assert.ok(res.data.recordatorio_id > 0);
        assert.ok(res.data.first_vencimiento_id > 0);
        assert.equal(res.data.abono_id, null);
        assert.equal(res.data.comprobantes.length, 2);
        trackReceiptFiles(res.data.comprobantes);

        assert.equal(res.data.comprobantes[0].nota, 'Transferencia 1');
        assert.equal(res.data.comprobantes[1].nota, 'DTE oficial');
        assert.ok(res.data.comprobantes[0].signed_url.includes('sig='));

        const detRes = await requestJson('GET', `/api/operaciones/recordatorios/vencimiento/${res.data.first_vencimiento_id}/detalle`);
        assert.equal(detRes.status, 200);
        assert.equal(detRes.data.resumen.estado_pago, 'PENDIENTE');
        assert.equal(detRes.data.comprobantes.length, 2);
        assert.equal(detRes.data.comprobantes[0].abono_id, null);
    });

    it('R6.2: POST /operaciones/recordatorios recurrente (repetir=3, MES) adjunta comprobantes a cuota #1 y genera 3 vencimientos', async () => {
        const res = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Alquiler Mensual',
                id_ubicacion: 2,
                iniciar: '2026-11-01',
                activo: true,
                monto: 1200,
                repetir: 3,
                repetir_desc: 'MES',
                forma_pago: 'TRANSFERENCIA',
                pagado: false,
                comprobantes: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'contrato_cuota1.webp', nota: 'Cuota noviembre' }
                ]
            }
        });

        assert.equal(res.status, 200);
        assert.equal(res.data.comprobantes.length, 1);
        trackReceiptFiles(res.data.comprobantes);

        const extState = mockExternalDb.getState();
        const vens = extState.vencimientos.filter(v => v.id_recordatorio === res.data.recordatorio_id);
        assert.equal(vens.length, 3);
        assert.equal(vens[0].id, res.data.first_vencimiento_id);
        assert.ok(vens.every(v => v.estado === 'P'));

        const dbState = mockDb.getState();
        assert.equal(dbState.comprobantes.length, 1);
        assert.equal(dbState.comprobantes[0].vencimiento_id, res.data.first_vencimiento_id);
    });

    it('R6.2: POST /operaciones/recordatorios con pagado=true (incluso fecPago vacío) crea CANCELADO + abono + meta + comprobante vinculado', async () => {
        const res = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Compra Repuesto Pista',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 85.75,
                repetir: 1,
                repetir_desc: 'VEZ',
                forma_pago: 'BAC ANDELSA',
                pagado: true,
                fecPago: '',
                formaPago2: '[BAC] ANDELSA - (201002367)',
                pago_detalle: {
                    tipo_operacion: 'CXP',
                    metodo_pago: 'TRANSFERENCIA',
                    cuenta_bancaria_id: 14,
                    cuenta_label: '[BAC] ANDELSA - (201002367)',
                    beneficiario: 'Repuestos SV',
                    referencia_doc: 'TRF-8812'
                },
                comprobantes: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'captura_20261127_101010.webp', nota: 'Voucher pagado' }
                ]
            }
        });

        assert.equal(res.status, 200);
        assert.ok(res.data.abono_id > 0);
        assert.equal(res.data.comprobantes.length, 1);
        trackReceiptFiles(res.data.comprobantes);

        const extVen = mockExternalDb.getState().vencimientos.find(v => v.id === res.data.first_vencimiento_id);
        assert.equal(extVen.estado, 'C');
        assert.match(String(extVen.fecha_cancelacion), /^\d{4}-\d{2}-\d{2}$/);

        const detRes = await requestJson('GET', `/api/operaciones/recordatorios/vencimiento/${res.data.first_vencimiento_id}/detalle`);
        assert.equal(detRes.status, 200);
        assert.equal(detRes.data.resumen.estado_pago, 'CANCELADO');
        assert.equal(detRes.data.resumen.saldo_pendiente, 0);
        assert.equal(detRes.data.abonos.length, 1);
        assert.equal(detRes.data.abonos[0].beneficiario, 'Repuestos SV');
        assert.equal(detRes.data.abonos[0].estado_conciliacion, 'PENDIENTE');
        assert.equal(detRes.data.comprobantes[0].abono_id, res.data.abono_id);
        assert.ok(detRes.data.comprobantes[0].signed_url.includes('sig='));
    });

    it('R6.3 & R6.6: Subir comprobantes en vencimiento CANCELADO + editar nota con PATCH .../comprobantes/:id conserva estado CANCELADO', async () => {
        const createRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Servicio Internet',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 60,
                repetir: 1,
                repetir_desc: 'VEZ',
                pagado: true,
                fecPago: '2026-11-27',
                formaPago2: 'EFECTIVO'
            }
        });
        assert.equal(createRes.status, 200);
        const venId = createRes.data.first_vencimiento_id;

        const upRes = await requestJson('POST', `/api/operaciones/recordatorios/vencimiento/${venId}/comprobantes`, {
            body: {
                abono_id: null,
                comprobantes: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'captura_20261127_120000.webp', nota: 'Nota inicial' }
                ]
            }
        });
        assert.equal(upRes.status, 201);
        trackReceiptFiles(upRes.data.comprobantes);
        assert.equal(upRes.data.detail.resumen.estado_pago, 'CANCELADO');
        assert.equal(upRes.data.detail.comprobantes.length, 1);
        assert.equal(upRes.data.detail.comprobantes[0].nota, 'Nota inicial');

        const compId = upRes.data.comprobantes[0].id;
        const patchNota = await requestJson('PATCH', `/api/operaciones/recordatorios/comprobantes/${compId}`, {
            body: { nota: 'Nota actualizada post-cierre' }
        });
        assert.equal(patchNota.status, 200);
        assert.equal(patchNota.data.detail.comprobantes[0].nota, 'Nota actualizada post-cierre');
        assert.equal(patchNota.data.detail.resumen.estado_pago, 'CANCELADO');
    });

    it('R6.4: Flujo "Solo Preasignar" (PATCH .../meta + POST .../comprobantes) guarda clasificación y comprobantes pendientes', async () => {
        const createRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Mantenimiento Dispensadores',
                id_ubicacion: 1,
                iniciar: '2026-11-28',
                activo: true,
                monto: 400,
                repetir: 1,
                repetir_desc: 'VEZ',
                pagado: false
            }
        });
        const venId = createRes.data.first_vencimiento_id;

        const metaRes = await requestJson('PATCH', `/api/operaciones/recordatorios/vencimiento/${venId}/meta`, {
            body: {
                tipo_operacion: 'GASTO',
                metodo_pago_preferido: 'TRANSFERENCIA',
                cuenta_bancaria_id: 7,
                cuenta_label: '[BAC] ANDELSA - (201002367)'
            }
        });
        assert.equal(metaRes.status, 200);

        const compRes = await requestJson('POST', `/api/operaciones/recordatorios/vencimiento/${venId}/comprobantes`, {
            body: {
                abono_id: null,
                comprobantes: [
                    { data_url: VALID_PDF_DATA_URL, nombre_original: 'cotizacion_aprobada.pdf', nota: 'Preasignado' }
                ]
            }
        });
        assert.equal(compRes.status, 201);
        trackReceiptFiles(compRes.data.comprobantes);
        assert.equal(compRes.data.detail.meta.tipo_operacion, 'GASTO');
        assert.equal(compRes.data.detail.comprobantes.length, 1);
        assert.equal(compRes.data.detail.resumen.estado_pago, 'PENDIENTE');
    });

    it('R6.2: Editar un recordatorio pendiente conserva y reasigna comprobantes y meta al nuevo primer vencimiento sin dejar huérfanos', async () => {
        const createRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Seguro Flota',
                id_ubicacion: 1,
                iniciar: '2026-12-01',
                activo: true,
                monto: 500,
                repetir: 1,
                repetir_desc: 'VEZ',
                pagado: false,
                comprobantes: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'poliza.webp', nota: 'Póliza adjunta' }
                ]
            }
        });
        trackReceiptFiles(createRes.data.comprobantes);
        const recId = createRes.data.recordatorio_id;
        const oldVenId = createRes.data.first_vencimiento_id;

        const editRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                id: recId,
                descripcion: 'Seguro Flota Actualizado',
                id_ubicacion: 1,
                iniciar: '2026-12-05',
                activo: true,
                monto: 550,
                repetir: 1,
                repetir_desc: 'VEZ',
                forma_pago: 'CHEQUE'
            }
        });
        assert.equal(editRes.status, 200);
        const newVenId = editRes.data.first_vencimiento_id;
        assert.notEqual(newVenId, oldVenId);

        const detRes = await requestJson('GET', `/api/operaciones/recordatorios/vencimiento/${newVenId}/detalle`);
        assert.equal(detRes.status, 200);
        assert.equal(detRes.data.comprobantes.length, 1);
        assert.equal(detRes.data.comprobantes[0].nota, 'Póliza adjunta');
    });

    it('Seguridad, validación de magic bytes, RBAC, HMAC uploads y limpieza física en disco', async () => {
        // 1. Magic bytes inválidos -> 400 y sin registros huérfanos
        const badMagicRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Archivo Malicioso',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 100,
                repetir: 1,
                repetir_desc: 'VEZ',
                comprobantes: [
                    { data_url: INVALID_MAGIC_WEBP_DATA_URL, nombre_original: 'fake.webp' }
                ]
            }
        });
        assert.equal(badMagicRes.status, 400);
        assert.equal(mockExternalDb.getState().recordatorios.length, 0);
        assert.equal(mockDb.getState().comprobantes.length, 0);

        // 2. Sin JWT -> 401
        const unauthRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            token: null,
            body: { descripcion: 'Test', id_ubicacion: 1, iniciar: '2026-11-27', monto: 10, repetir: 1, repetir_desc: 'VEZ' }
        });
        assert.equal(unauthRes.status, 401);

        // 3. Sin permiso manage_recordatorios -> 403
        const noPermToken = makeToken({ permissions: ['view_dashboard'] });
        const forbiddenRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            token: noPermToken,
            body: { descripcion: 'Test', id_ubicacion: 1, iniciar: '2026-11-27', monto: 10, repetir: 1, repetir_desc: 'VEZ' }
        });
        assert.equal(forbiddenRes.status, 403);

        // 4. Upload válido + verificación HMAC en /api/uploads/pagos/
        const okRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Test Upload HMAC',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 50,
                repetir: 1,
                repetir_desc: 'VEZ',
                comprobantes: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'hmac_test.webp' }]
            }
        });
        assert.equal(okRes.status, 200);
        const comp = okRes.data.comprobantes[0];
        trackReceiptFiles([comp]);

        // Sin firma ni token -> 401
        const rawPathRes = await fetch(`${baseUrl}${comp.archivo_url}`);
        assert.equal(rawPathRes.status, 401);

        // Con firma HMAC válida -> 200
        const signedPathRes = await fetch(`${baseUrl}${comp.signed_url}`);
        assert.equal(signedPathRes.status, 200);

        // Eliminar comprobante limpia archivo físico del disco
        const filename = path.basename(comp.archivo_url);
        const diskPath = path.join(__dirname, '..', 'uploads', 'pagos', filename);
        assert.equal(fs.existsSync(diskPath), true);

        const delCompRes = await requestJson('DELETE', `/api/operaciones/recordatorios/comprobantes/${comp.id}`);
        assert.equal(delCompRes.status, 200);
        assert.equal(fs.existsSync(diskPath), false);
    });

    it('Remediación: validación temprana HTTP 400 en POST /operaciones/recordatorios (monto negativo/no numérico e iniciar inválido)', async () => {
        const negRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Monto Negativo',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: -50,
                repetir: 1,
                repetir_desc: 'VEZ'
            }
        });
        assert.equal(negRes.status, 400);
        assert.equal(mockExternalDb.getState().recordatorios.length, 0);

        const nanRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Monto Texto',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 'abc',
                repetir: 1,
                repetir_desc: 'VEZ'
            }
        });
        assert.equal(nanRes.status, 400);
        assert.equal(mockExternalDb.getState().recordatorios.length, 0);

        const emptyDateRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Fecha Vacía',
                id_ubicacion: 1,
                iniciar: '',
                activo: true,
                monto: 100,
                repetir: 1,
                repetir_desc: 'VEZ'
            }
        });
        assert.equal(emptyDateRes.status, 400);
        assert.equal(mockExternalDb.getState().recordatorios.length, 0);

        const badDateRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Fecha Inválida',
                id_ubicacion: 1,
                iniciar: '2026-02-31',
                activo: true,
                monto: 100,
                repetir: 1,
                repetir_desc: 'VEZ'
            }
        });
        assert.equal(badDateRes.status, 400);
        assert.equal(mockExternalDb.getState().recordatorios.length, 0);
    });

    it('Remediación: POST .../abonos rechaza magic bytes falsos con 400 (0 abonos huérfanos) y limpia archivos/filas si falla BD', async () => {
        const createRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Proveedor Prueba Abono',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 150,
                repetir: 1,
                repetir_desc: 'VEZ',
                pagado: false
            }
        });
        assert.equal(createRes.status, 200);
        const venId = createRes.data.first_vencimiento_id;

        const spoofRes = await requestJson('POST', `/api/operaciones/recordatorios/vencimiento/${venId}/abonos`, {
            body: {
                monto: 50,
                fecha_pago: '2026-11-27',
                comprobantes: [{ data_url: INVALID_MAGIC_WEBP_DATA_URL, nombre_original: 'spoof.webp' }]
            }
        });
        assert.equal(spoofRes.status, 400);
        assert.equal(mockDb.getState().abonos.length, 0);
        assert.equal(mockDb.getState().comprobantes.length, 0);
        assert.equal(mockExternalDb.getState().vencimientos.find(v => v.id === venId).estado, 'P');

        // Fallo en el 2do INSERT de comprobante -> debe limpiar el archivo escrito del 1er comprobante y el abono parcial
        const uploadsDir = path.join(__dirname, '..', 'uploads', 'pagos');
        const beforeFiles = fs.existsSync(uploadsDir) ? new Set(fs.readdirSync(uploadsDir)) : new Set();

        mockDb.setFailOnNextComprobanteInsert(2);
        const failWriteRes = await requestJson('POST', `/api/operaciones/recordatorios/vencimiento/${venId}/abonos`, {
            body: {
                monto: 75,
                fecha_pago: '2026-11-27',
                comprobantes: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'comp1.webp' },
                    { data_url: VALID_PDF_DATA_URL, nombre_original: 'comp2.pdf' }
                ]
            }
        });
        assert.equal(failWriteRes.status, 500);
        assert.equal(mockDb.getState().abonos.length, 0);
        assert.equal(mockDb.getState().comprobantes.length, 0);

        const afterFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
        const leaked = afterFiles.filter(f => !beforeFiles.has(f));
        assert.equal(leaked.length, 0, `Archivos filtrados en disco tras fallo en abono: ${leaked.join(', ')}`);
    });

    it('Remediación: atomicidad cross-DB en edición y limpieza de disco/BD en creación + fallback forma_pago', async () => {
        // 1. Edición: fallo en externalDb.commit() NO debe mutar recordatorios_pagos_comprobantes ni meta en db
        const baseRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Renta Bodega',
                id_ubicacion: 1,
                iniciar: '2026-12-01',
                activo: true,
                monto: 300,
                repetir: 1,
                repetir_desc: 'VEZ',
                pagado: false,
                pago_detalle: { tipo_operacion: 'GASTO', cuenta_label: '[BAC] ANDELSA' },
                comprobantes: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'renta.webp' }]
            }
        });
        assert.equal(baseRes.status, 200);
        trackReceiptFiles(baseRes.data.comprobantes);
        const recId = baseRes.data.recordatorio_id;
        const oldVenId = baseRes.data.first_vencimiento_id;

        mockExternalDb.setFailNextCommit(true);
        const failEditRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                id: recId,
                descripcion: 'Renta Bodega Editada',
                id_ubicacion: 1,
                iniciar: '2026-12-10',
                activo: true,
                monto: 350,
                repetir: 1,
                repetir_desc: 'VEZ'
            }
        });
        assert.equal(failEditRes.status, 500);
        assert.equal(mockExternalDb.getState().vencimientos[0].id, oldVenId);
        assert.equal(mockDb.getState().comprobantes[0].vencimiento_id, oldVenId);
        assert.equal(mockDb.getState().metaMap.has(oldVenId), true);

        // 2. Creación: fallo en 2do comprobante en db debe limpiar archivos de disco, comprobantes y abono parcial
        const uploadsDir = path.join(__dirname, '..', 'uploads', 'pagos');
        const beforeFiles = fs.existsSync(uploadsDir) ? new Set(fs.readdirSync(uploadsDir)) : new Set();

        mockDb.setFailOnNextComprobanteInsert(2);
        const failCreateRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Compra Fallida',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 90,
                repetir: 1,
                repetir_desc: 'VEZ',
                pagado: true,
                fecPago: '2026-11-27',
                pago_detalle: { tipo_operacion: 'CXP', cuenta_bancaria_id: 14, cuenta_label: '[BAC] ANDELSA - (201002367)' },
                comprobantes: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'c1.webp' },
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'c2.webp' }
                ]
            }
        });
        assert.equal(failCreateRes.status, 500);
        assert.equal(mockDb.getState().abonos.length, 0);
        // Solo debe quedar el comprobante de baseRes
        assert.equal(mockDb.getState().comprobantes.length, 1);
        assert.equal(mockDb.getState().comprobantes[0].vencimiento_id, oldVenId);

        const afterFiles = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
        const leaked = afterFiles.filter(f => !beforeFiles.has(f));
        assert.equal(leaked.length, 0, `Archivos filtrados en disco tras fallo en creación: ${leaked.join(', ')}`);

        // 3. Fallback forma_pago cuando isPaidCreation y formaPago2 viene vacío pero pago_detalle.cuenta_label tiene valor
        const fallbackRes = await requestJson('POST', '/api/operaciones/recordatorios', {
            body: {
                descripcion: 'Pago con Fallback',
                id_ubicacion: 1,
                iniciar: '2026-11-27',
                activo: true,
                monto: 45,
                repetir: 1,
                repetir_desc: 'VEZ',
                pagado: true,
                fecPago: '2026-11-27',
                formaPago2: '',
                pago_detalle: { tipo_operacion: 'CXP', cuenta_bancaria_id: 14, cuenta_label: '[BAC] ANDELSA - (201002367)' }
            }
        });
        assert.equal(fallbackRes.status, 200);
        const createdVen = mockExternalDb.getState().vencimientos.find(v => v.id === fallbackRes.data.first_vencimiento_id);
        assert.equal(createdVen.forma_pago, '[BAC] ANDELSA - (201002367)');
    });
});
