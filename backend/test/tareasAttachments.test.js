const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const dbModule = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const { guardProtectedUploadsMiddleware } = require('../utils/uploadSigner');
const telegramTransport = require('../services/telegramTransportService');
const mibotNotifier = require('../services/mibotNotifierService');

const {
    TAREAS_UPLOADS_DIR,
    parseTaskAttachmentDataUrl,
    unlinkTaskAttachmentFile,
    createMibotProgramacion,
    dispatchMibotProgramacion,
    processDueMibotSchedules
} = mibotNotifier;

// Valid binary payloads + DataURLs
const VALID_WEBP_BUFFER = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x1a, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x56, 0x50, 0x38, 0x20,
    0x0e, 0x00, 0x00, 0x00,
    0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00
]);
const VALID_PNG_BUFFER = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
]);
const VALID_JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const VALID_GIF_BUFFER = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'binary');
const VALID_PDF_BUFFER = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'ascii');

const VALID_WEBP_DATA_URL = `data:image/webp;base64,${VALID_WEBP_BUFFER.toString('base64')}`;
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_BUFFER.toString('base64')}`;
const VALID_JPEG_DATA_URL = `data:image/jpeg;base64,${VALID_JPEG_BUFFER.toString('base64')}`;
const VALID_PDF_DATA_URL = `data:application/pdf;base64,${VALID_PDF_BUFFER.toString('base64')}`;

function createTasksMockDb() {
    const state = {
        users: [
            { id: 1, username: 'admin', nombre: 'Admin SIPE', role_id: 1, role_name: 'Administrator', status: 'active' },
            { id: 10, username: 'creador', nombre: 'Carlos Creador', role_id: 2, role_name: 'Supervisor', status: 'active' },
            { id: 20, username: 'asignado1', nombre: 'Ana Asignada', role_id: 3, role_name: 'Operador', status: 'active' },
            { id: 21, username: 'asignado2', nombre: 'Luis Asignado', role_id: 3, role_name: 'Operador', status: 'active' },
            { id: 30, username: 'ajeno', nombre: 'Pedro Ajeno', role_id: 3, role_name: 'Operador', status: 'active' }
        ],
        telegram_usuarios: [
            {
                id: 101,
                user_id: 20,
                telegram_user_id: '55500020',
                telegram_username: '@ana_sipe',
                first_name: 'Ana',
                last_name: 'Asignada',
                cargo: 'Operadora',
                activo: 1,
                recibir_mibot: 1,
                mibot_tareas: 1,
                mibot_validaciones: 1,
                mibot_reuniones: 1,
                sipe_nombre: 'Ana Asignada',
                sipe_role_name: 'Operador'
            }
        ],
        tasks: [],
        task_comments: [],
        task_attachments: [],
        mibot_programaciones: [],
        mibot_programaciones_destinatarios: [],
        notifications: [],
        seq: { tasks: 0, task_comments: 0, task_attachments: 0, mibot_programaciones: 0, mibot_programaciones_destinatarios: 0, notifications: 0 },
        failNextTaskAttachmentInsert: false
    };

    const reset = () => {
        state.tasks = [];
        state.task_comments = [];
        state.task_attachments = [];
        state.mibot_programaciones = [];
        state.mibot_programaciones_destinatarios = [];
        state.notifications = [];
        state.seq = { tasks: 0, task_comments: 0, task_attachments: 0, mibot_programaciones: 0, mibot_programaciones_destinatarios: 0, notifications: 0 };
        state.failNextTaskAttachmentInsert = false;
    };

    const runQuery = async (sql, params = []) => {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        const ql = q.toLowerCase();

        if (ql.startsWith('create table') || ql.startsWith('alter table')) {
            return [{ affectedRows: 0 }];
        }
        if (ql.includes('from information_schema.columns')) {
            if (ql.includes("table_name = 'task_attachments'")) {
                return [[{ COLUMN_NAME: 'es_evidencia_cumplimiento' }]];
            }
            return [[
                { COLUMN_NAME: 'cargo' },
                { COLUMN_NAME: 'recibir_mibot' },
                { COLUMN_NAME: 'mibot_pagos' },
                { COLUMN_NAME: 'mibot_tareas' },
                { COLUMN_NAME: 'mibot_validaciones' },
                { COLUMN_NAME: 'mibot_reuniones' },
                { COLUMN_NAME: 'task_id' },
                { COLUMN_NAME: 'incluir_adjuntos' },
                { COLUMN_NAME: 'attachment_ids_json' }
            ]];
        }

        if (ql.startsWith('insert into notifications')) {
            const id = ++state.seq.notifications;
            state.notifications.push({ id, user_id: params[0], type: params[1], title: params[2], message: params[3], data: params[4] });
            return [{ insertId: id, affectedRows: 1 }];
        }

        if (ql.startsWith('insert into tasks')) {
            const id = ++state.seq.tasks;
            const [titulo, descripcion, tipo_plazo, fecha_inicio, fecha_vencimiento, hora_limite, prioridad, categoria, assigned_to, created_by, checklist] = params;
            state.tasks.push({
                id, titulo, descripcion, tipo_plazo, fecha_inicio, fecha_vencimiento, hora_limite,
                prioridad, estado: 'pendiente', categoria, assigned_to: Number(assigned_to),
                created_by: Number(created_by), checklist: checklist || '[]', orden: 0,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }

        if (ql.startsWith('delete from tasks')) {
            const id = Number(params[0]);
            const before = state.tasks.length;
            state.tasks = state.tasks.filter(t => Number(t.id) !== id);
            state.task_comments = state.task_comments.filter(c => Number(c.task_id) !== id);
            state.task_attachments = state.task_attachments.filter(a => Number(a.task_id) !== id);
            return [{ affectedRows: before - state.tasks.length }];
        }

        if (ql.startsWith('insert into task_comments')) {
            const id = ++state.seq.task_comments;
            const [task_id, user_id, comentario] = params;
            state.task_comments.push({
                id, task_id: Number(task_id), user_id: Number(user_id), comentario,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }

        if (ql.startsWith('insert into task_attachments')) {
            if (state.failNextTaskAttachmentInsert) {
                state.failNextTaskAttachmentInsert = false;
                throw new Error('Simulated DB attachment insert failure');
            }
            const id = ++state.seq.task_attachments;
            const [task_id, comment_id, nombre_original, archivo_url, mime_type, tamano_bytes, ancho, alto, nota, uploaded_by, uploaded_by_name] = params;
            state.task_attachments.push({
                id,
                task_id: Number(task_id),
                comment_id: comment_id ? Number(comment_id) : null,
                nombre_original,
                archivo_url,
                mime_type,
                tamano_bytes: Number(tamano_bytes || 0),
                ancho: ancho || null,
                alto: alto || null,
                nota: nota || null,
                es_evidencia_cumplimiento: 0,
                uploaded_by: uploaded_by ? Number(uploaded_by) : null,
                uploaded_by_name: uploaded_by_name || null,
                created_at: new Date().toISOString()
            });
            return [{ insertId: id, affectedRows: 1 }];
        }

        if (ql.startsWith('update task_attachments set es_evidencia_cumplimiento = ? where id = ?')) {
            const att = state.task_attachments.find(a => Number(a.id) === Number(params[1]));
            if (att) att.es_evidencia_cumplimiento = Number(params[0]) ? 1 : 0;
            return [{ affectedRows: att ? 1 : 0 }];
        }

        if (ql.startsWith('update task_attachments set nota = ?, es_evidencia_cumplimiento = ? where id = ?')) {
            const att = state.task_attachments.find(a => Number(a.id) === Number(params[2]));
            if (att) {
                att.nota = params[0];
                att.es_evidencia_cumplimiento = Number(params[1]) ? 1 : 0;
            }
            return [{ affectedRows: att ? 1 : 0 }];
        }

        if (ql.startsWith('delete from task_attachments where id = ?')) {
            const id = Number(params[0]);
            const before = state.task_attachments.length;
            state.task_attachments = state.task_attachments.filter(a => Number(a.id) !== id);
            return [{ affectedRows: before - state.task_attachments.length }];
        }

        if (ql.startsWith('select count(*) as cnt from task_attachments where archivo_url = ?')) {
            const url = String(params[0] || '');
            const cnt = state.task_attachments.filter(a => a.archivo_url === url).length;
            return [[{ cnt }]];
        }

        if (ql.startsWith('select') && ql.includes('from task_attachments') && !ql.includes('from tasks t')) {
            if (ql.includes('where id = ?')) {
                return [state.task_attachments.filter(a => Number(a.id) === Number(params[0])).map(x => ({ ...x }))];
            }
            if (ql.includes('where task_id = ?')) {
                return [state.task_attachments.filter(a => Number(a.task_id) === Number(params[0])).map(x => ({ ...x }))];
            }
            if (ql.includes('where task_id in')) {
                const idSet = new Set(params.map(Number));
                return [state.task_attachments.filter(a => idSet.has(Number(a.task_id))).map(x => ({ ...x }))];
            }
            return [state.task_attachments.map(x => ({ ...x }))];
        }

        if (ql.startsWith('select') && ql.includes('from task_comments')) {
            if (ql.includes('where id = ? and task_id = ?')) {
                return [state.task_comments.filter(c => Number(c.id) === Number(params[0]) && Number(c.task_id) === Number(params[1]))];
            }
            if (ql.includes('where tc.id = ?')) {
                const c = state.task_comments.find(x => Number(x.id) === Number(params[0]));
                if (!c) return [[]];
                const u = state.users.find(usr => Number(usr.id) === Number(c.user_id));
                return [[{ ...c, user_name: u?.nombre || u?.username || '', username: u?.username || '' }]];
            }
            if (ql.includes('where tc.task_id = ?')) {
                const rows = state.task_comments
                    .filter(c => Number(c.task_id) === Number(params[0]))
                    .map(c => {
                        const u = state.users.find(usr => Number(usr.id) === Number(c.user_id));
                        return { ...c, user_name: u?.nombre || u?.username || '', username: u?.username || '' };
                    });
                return [rows];
            }
        }

        if (ql.startsWith('select') && ql.includes('from tasks t')) {
            if (ql.includes('where t.id = ?')) {
                const t = state.tasks.find(x => Number(x.id) === Number(params[0]));
                if (!t) return [[]];
                const u1 = state.users.find(u => Number(u.id) === Number(t.assigned_to));
                const u2 = state.users.find(u => Number(u.id) === Number(t.created_by));
                return [[{
                    ...t,
                    assigned_user_name: u1?.nombre || u1?.username || null,
                    assigned_username: u1?.username || null,
                    created_user_name: u2?.nombre || u2?.username || null,
                    created_username: u2?.username || null
                }]];
            }
            let rows = state.tasks.slice();
            if (ql.includes('(t.assigned_to = ? or t.created_by = ?)')) {
                const uid = Number(params[0]);
                rows = rows.filter(t => Number(t.assigned_to) === uid || Number(t.created_by) === uid);
            }
            return [rows.map(t => {
                const u1 = state.users.find(u => Number(u.id) === Number(t.assigned_to));
                const u2 = state.users.find(u => Number(u.id) === Number(t.created_by));
                return {
                    ...t,
                    assigned_user_name: u1?.nombre || u1?.username || null,
                    assigned_username: u1?.username || null,
                    created_user_name: u2?.nombre || u2?.username || null,
                    comments_count: state.task_comments.filter(c => Number(c.task_id) === Number(t.id)).length,
                    attachments_count: state.task_attachments.filter(a => Number(a.task_id) === Number(t.id)).length
                };
            })];
        }

        if (ql.startsWith('select') && ql.includes('from tasks where id = ?')) {
            return [state.tasks.filter(t => Number(t.id) === Number(params[0])).map(x => ({ ...x }))];
        }

        // MiBot queries
        if (ql.includes('from telegram_usuarios tu') && ql.includes('where tu.id in')) {
            const idSet = new Set(params.map(Number));
            return [state.telegram_usuarios.filter(u => idSet.has(Number(u.id)) && Number(u.activo) === 1)];
        }
        if (ql.startsWith('insert into mibot_programaciones ')) {
            const id = ++state.seq.mibot_programaciones;
            const [
                tipo, titulo, mensaje, vencimiento_id, recordatorio_id, ubicacion,
                monto_total, monto_pendiente, fecha_vencimiento, programado_para,
                proximo_envio_at, frecuencia, created_by_user_id, created_by_name, task_id
            ] = params;
            state.mibot_programaciones.push({
                id, tipo, titulo, mensaje, vencimiento_id, recordatorio_id, ubicacion,
                monto_total, monto_pendiente, fecha_vencimiento, programado_para,
                proximo_envio_at, frecuencia, estado: 'PROGRAMADO', ultimo_envio_at: null,
                total_envios: 0, created_by_user_id, created_by_name,
                task_id: task_id ? Number(task_id) : null,
                incluir_adjuntos: 0,
                attachment_ids_json: null
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (ql.startsWith('update mibot_programaciones set incluir_adjuntos = ?, attachment_ids_json = ? where id = ?')) {
            const p = state.mibot_programaciones.find(x => Number(x.id) === Number(params[2]));
            if (p) {
                p.incluir_adjuntos = Number(params[0]) ? 1 : 0;
                p.attachment_ids_json = params[1];
            }
            return [{ affectedRows: p ? 1 : 0 }];
        }
        if (ql.startsWith('insert into mibot_programaciones_destinatarios')) {
            const id = ++state.seq.mibot_programaciones_destinatarios;
            state.mibot_programaciones_destinatarios.push({
                id,
                programacion_id: Number(params[0]),
                telegram_usuario_id: Number(params[1]),
                telegram_user_id: String(params[2]),
                nombre_destinatario: params[3],
                cargo: params[4],
                estado_entrega: 'PENDIENTE',
                enviado_at: null,
                respondido_at: null,
                pospuesto_hasta: null,
                respuesta_nota: null,
                telegram_message_id: null,
                error_msg: null
            });
            return [{ insertId: id, affectedRows: 1 }];
        }
        if (ql.startsWith('update mibot_programaciones_destinatarios set estado_entrega')) {
            const d = state.mibot_programaciones_destinatarios.find(x => Number(x.id) === Number(params[params.length - 1]));
            if (d) {
                d.estado_entrega = ql.includes("'enviado'") ? 'ENVIADO' : 'ERROR';
            }
            return [{ affectedRows: d ? 1 : 0 }];
        }
        if (ql.startsWith('update mibot_programaciones set estado = ?')) {
            const p = state.mibot_programaciones.find(x => Number(x.id) === Number(params[params.length - 1]));
            if (p) {
                p.estado = params[0];
                p.ultimo_envio_at = params[1];
                p.proximo_envio_at = params[2];
                p.total_envios = Number(p.total_envios || 0) + 1;
            }
            return [{ affectedRows: p ? 1 : 0 }];
        }
        if (ql.startsWith('select id from mibot_programaciones where estado =')) {
            const nowSv = String(params[0]);
            const rows = state.mibot_programaciones
                .filter(p => p.estado === 'PROGRAMADO' && p.proximo_envio_at && p.proximo_envio_at <= nowSv)
                .map(p => ({ id: p.id }));
            return [rows];
        }
        if (ql.includes('from mibot_programaciones_destinatarios d inner join mibot_programaciones p')) {
            return [[]];
        }
        if (ql.startsWith('select * from mibot_programaciones_destinatarios where programacion_id = ?')) {
            return [state.mibot_programaciones_destinatarios.filter(d => Number(d.programacion_id) === Number(params[0])).map(x => ({ ...x }))];
        }
        if (ql.startsWith('select * from mibot_programaciones_destinatarios where programacion_id in')) {
            const ids = new Set(params.map(Number));
            return [state.mibot_programaciones_destinatarios.filter(d => ids.has(Number(d.programacion_id))).map(x => ({ ...x }))];
        }
        if (ql.startsWith('select * from mibot_programaciones where id = ?')) {
            return [state.mibot_programaciones.filter(p => Number(p.id) === Number(params[0])).map(x => ({ ...x }))];
        }
        if (ql.includes('from mibot_programaciones') && ql.includes('where task_id in')) {
            const ids = new Set(params.map(Number));
            return [state.mibot_programaciones.filter(p => p.task_id && ids.has(Number(p.task_id)) && p.estado !== 'CANCELADO').map(x => ({ ...x }))];
        }
        if (ql.includes('from mibot_programaciones')) {
            let rows = state.mibot_programaciones.slice();
            if (ql.includes('task_id = ?')) rows = rows.filter(p => Number(p.task_id) === Number(params[0]));
            return [rows.map(x => ({ ...x }))];
        }

        return [[]];
    };

    const pool = {
        state,
        reset,
        query: runQuery,
        getConnection: async () => {
            const snapshot = JSON.stringify({
                tasks: state.tasks,
                task_comments: state.task_comments,
                task_attachments: state.task_attachments,
                seq: state.seq
            });
            return {
                query: runQuery,
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {
                    const restored = JSON.parse(snapshot);
                    state.tasks = restored.tasks;
                    state.task_comments = restored.task_comments;
                    state.task_attachments = restored.task_attachments;
                    state.seq = restored.seq;
                },
                release: () => {}
            };
        }
    };

    return pool;
}

describe('Tareas — Adjuntos, Evidencias, Seguridad HMAC y MiBot Media (R7.1-R7.4)', () => {
    const mockDb = createTasksMockDb();
    const createdDiskUrls = new Set();

    let originalGetDb;
    let originalGetDbIfReady;
    let originalGetExternalDb;
    let server;
    let baseUrl;

    const makeToken = (userOverrides = {}) => jwt.sign(
        {
            id: 10,
            username: 'creador',
            nombre: 'Carlos Creador',
            role_id: 2,
            role: 'Supervisor',
            permissions: ['manage_tasks', '/dashboard/operaciones/tareas'],
            status: 'active',
            ...userOverrides
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const reqJson = async (method, urlPath, { token = makeToken(), body = null } = {}) => {
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

    const trackAttachments = (atts = []) => {
        for (const a of (atts || [])) {
            if (a?.archivo_url) createdDiskUrls.add(a.archivo_url);
        }
    };

    before(async () => {
        originalGetDb = dbModule.getDb;
        originalGetDbIfReady = dbModule.getDbIfReady;
        originalGetExternalDb = dbModule.getExternalDb;

        dbModule.getDb = () => mockDb;
        dbModule.getDbIfReady = () => null;
        dbModule.getExternalDb = async () => null;

        delete require.cache[require.resolve('../routes/tasks')];
        const tasksRouter = require('../routes/tasks');

        const app = express();
        app.use(express.json({ limit: '20mb' }));
        app.use('/api/uploads', guardProtectedUploadsMiddleware, express.static(path.join(__dirname, '..', 'uploads')));
        app.use('/api/tasks', tasksRouter);

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    after(async () => {
        for (const url of createdDiskUrls) {
            unlinkTaskAttachmentFile(url);
        }
        createdDiskUrls.clear();

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        dbModule.getDb = originalGetDb;
        dbModule.getDbIfReady = originalGetDbIfReady;
        dbModule.getExternalDb = originalGetExternalDb;
        delete require.cache[require.resolve('../routes/tasks')];
    });

    beforeEach(() => {
        mockDb.reset();
    });

    it('R7.1: parseTaskAttachmentDataUrl valida firmas mágicas y rechaza spoofed/oversized/unsupported', () => {
        const webp = parseTaskAttachmentDataUrl(VALID_WEBP_DATA_URL);
        assert.equal(webp.mimeType, 'image/webp');
        assert.equal(webp.ext, 'webp');

        const png = parseTaskAttachmentDataUrl(VALID_PNG_DATA_URL);
        assert.equal(png.mimeType, 'image/png');

        const jpg = parseTaskAttachmentDataUrl(VALID_JPEG_DATA_URL);
        assert.equal(jpg.mimeType, 'image/jpeg');

        const pdf = parseTaskAttachmentDataUrl(VALID_PDF_DATA_URL);
        assert.equal(pdf.mimeType, 'application/pdf');

        // Spoofed WebP (text disguised as image/webp)
        const spoofedWebp = `data:image/webp;base64,${Buffer.from('NOT_A_WEBP_FILE').toString('base64')}`;
        assert.throws(() => parseTaskAttachmentDataUrl(spoofedWebp), /WebP no tiene una firma válida/i);

        // Spoofed PDF
        const spoofedPdf = `data:application/pdf;base64,${Buffer.from('<html>alert(1)</html>').toString('base64')}`;
        assert.throws(() => parseTaskAttachmentDataUrl(spoofedPdf), /PDF no tiene una firma válida/i);

        // Unsupported MIME (SVG XSS vector)
        const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`;
        assert.throws(() => parseTaskAttachmentDataUrl(svgDataUrl), /no soportado/i);

        // Oversized image (> 5 MB)
        const bigWebpHeader = Buffer.concat([VALID_WEBP_BUFFER, Buffer.alloc(5 * 1024 * 1024 + 64, 0)]);
        assert.throws(
            () => parseTaskAttachmentDataUrl(`data:image/webp;base64,${bigWebpHeader.toString('base64')}`),
            /supera el límite de 5 MB/i
        );
    });

    it('R7.1: POST /api/tasks con attachments[] guarda en disco, expone signed_url, attachments_count y protege /api/uploads/tareas/', async () => {
        // Unauthenticated blocked
        const unauth = await reqJson('GET', '/api/tasks', { token: null });
        assert.equal(unauth.status, 401);

        const createRes = await reqJson('POST', '/api/tasks', {
            body: {
                titulo: 'Inspección de surtidores',
                descripcion: 'Validar mangueras y extintores',
                fecha_vencimiento: '2026-12-01',
                assigned_to: 20,
                attachments: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'captura_20261127_101500.webp', ancho: 800, alto: 600, nota: 'Foto inicial' },
                    { data_url: VALID_PDF_DATA_URL, nombre_original: 'checklist.pdf', nota: 'Formato oficial' }
                ]
            }
        });
        assert.equal(createRes.status, 201);
        const taskId = createRes.data.task.id;
        assert.equal(createRes.data.task.attachments_count, 2);
        trackAttachments(createRes.data.task.attachments);

        // GET /api/tasks includes attachments_count
        const listRes = await reqJson('GET', '/api/tasks');
        assert.equal(listRes.status, 200);
        const listed = listRes.data.find(t => Number(t.id) === Number(taskId));
        assert.equal(listed.attachments_count, 2);

        // GET /api/tasks/:id returns attachments with signed_url and uploaded_by_name
        const detailRes = await reqJson('GET', `/api/tasks/${taskId}`);
        assert.equal(detailRes.status, 200);
        assert.equal(detailRes.data.attachments.length, 2);
        const firstAtt = detailRes.data.attachments[0];
        assert.ok(firstAtt.archivo_url.startsWith('/api/uploads/tareas/'));
        assert.ok(firstAtt.signed_url.includes('sig='));
        assert.equal(firstAtt.uploaded_by_name, 'Carlos Creador');

        // Unsigned direct GET on /api/uploads/tareas/* returns 401
        const unsignedFetch = await fetch(`${baseUrl}${firstAtt.archivo_url}`);
        assert.equal(unsignedFetch.status, 401);

        // Signed URL returns 200 with exact WebP bytes
        const signedFetch = await fetch(`${baseUrl}${firstAtt.signed_url}`);
        assert.equal(signedFetch.status, 200);
        const fetchedBuf = Buffer.from(await signedFetch.arrayBuffer());
        assert.deepEqual(fetchedBuf, VALID_WEBP_BUFFER);

        // Path-traversal check
        assert.equal(unlinkTaskAttachmentFile('/api/uploads/tareas/../../server.js'), false);
        assert.equal(unlinkTaskAttachmentFile('/api/uploads/pagos/archivo.webp'), false);
    });

    it('R7.1: Rollback transaccional limpia archivos del disco ante fallo en BD (0 archivos huérfanos)', async () => {
        const filesBefore = fs.existsSync(TAREAS_UPLOADS_DIR) ? fs.readdirSync(TAREAS_UPLOADS_DIR) : [];
        mockDb.state.failNextTaskAttachmentInsert = true;

        const failRes = await reqJson('POST', '/api/tasks', {
            body: {
                titulo: 'Tarea que fallará en attachment',
                fecha_vencimiento: '2026-12-01',
                assigned_to: 20,
                attachments: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'rollback_test.webp' }]
            }
        });
        assert.equal(failRes.status, 500);
        assert.equal(mockDb.state.tasks.length, 0);
        assert.equal(mockDb.state.task_attachments.length, 0);

        const filesAfter = fs.existsSync(TAREAS_UPLOADS_DIR) ? fs.readdirSync(TAREAS_UPLOADS_DIR) : [];
        assert.deepEqual(filesAfter, filesBefore);
    });

    it('R7.1: Autorización granular, comentarios con evidencia (sin taskPerms), PATCH nota y DELETE refcount-safe', async () => {
        const assigneeToken = makeToken({ id: 20, username: 'asignado1', nombre: 'Ana Asignada', role_id: 3, role: 'Operador', permissions: [] });
        const outsiderToken = makeToken({ id: 30, username: 'ajeno', nombre: 'Pedro Ajeno', role_id: 3, role: 'Operador', permissions: [] });

        // Multi-assignee creation shares 1 physical file across 2 tasks
        const multiRes = await reqJson('POST', '/api/tasks', {
            body: {
                titulo: 'Actividad compartida',
                fecha_vencimiento: '2026-12-05',
                assigned_to: 20,
                assigned_to_ids: [21],
                attachments: [{ data_url: VALID_PNG_DATA_URL, nombre_original: 'guia_compartida.png', nota: 'Guía base' }]
            }
        });
        assert.equal(multiRes.status, 201);
        assert.equal(multiRes.data.tasks.length, 2);
        const task1 = multiRes.data.tasks[0];
        const task2 = multiRes.data.tasks[1];
        const sharedUrl = task1.attachments[0].archivo_url;
        assert.equal(sharedUrl, task2.attachments[0].archivo_url);
        trackAttachments([task1.attachments[0]]);

        const diskName = path.basename(sharedUrl);
        const diskPath = path.join(TAREAS_UPLOADS_DIR, diskName);
        assert.equal(fs.existsSync(diskPath), true);

        // Outsider blocked with 403
        const outsiderGet = await reqJson('GET', `/api/tasks/${task1.id}/attachments`, { token: outsiderToken });
        assert.equal(outsiderGet.status, 403);
        const outsiderComment = await reqJson('POST', `/api/tasks/${task1.id}/comments`, {
            token: outsiderToken,
            body: { comentario: 'Intruso' }
        });
        assert.equal(outsiderComment.status, 403);

        // Nonexistent task comment returns 404
        const notFoundComment = await reqJson('POST', '/api/tasks/99999/comments', {
            body: { comentario: 'No existe' }
        });
        assert.equal(notFoundComment.status, 404);

        // Assignee without taskPerms posts comment with empty text + fulfillment evidence attachment
        const evRes = await reqJson('POST', `/api/tasks/${task1.id}/comments`, {
            token: assigneeToken,
            body: {
                comentario: '',
                es_evidencia_cumplimiento: true,
                attachments: [{ data_url: VALID_WEBP_DATA_URL, nombre_original: 'evidencia_ana.webp', nota: 'Trabajo completado' }]
            }
        });
        assert.equal(evRes.status, 201);
        assert.equal(evRes.data.comment.comentario, '📎 Evidencia adjunta');
        assert.equal(evRes.data.attachments.length, 1);
        assert.equal(evRes.data.attachments[0].es_evidencia_cumplimiento, true);
        const evAttId = evRes.data.attachments[0].id;
        trackAttachments(evRes.data.attachments);

        // PATCH /api/tasks/attachments/:attachmentId works (not shadowed by /:id)
        const patchOwn = await reqJson('PATCH', `/api/tasks/attachments/${evAttId}`, {
            token: assigneeToken,
            body: { nota: 'Nota editada por Ana' }
        });
        assert.equal(patchOwn.status, 200);
        assert.equal(patchOwn.data.attachment.nota, 'Nota editada por Ana');

        // Assignee CANNOT modify or delete creator's attachment (403)
        const creatorAttIdOnTask1 = task1.attachments[0].id;
        const patchForbidden = await reqJson('PATCH', `/api/tasks/attachments/${creatorAttIdOnTask1}`, {
            token: assigneeToken,
            body: { nota: 'No permitido' }
        });
        assert.equal(patchForbidden.status, 403);
        const delForbidden = await reqJson('DELETE', `/api/tasks/attachments/${creatorAttIdOnTask1}`, {
            token: assigneeToken
        });
        assert.equal(delForbidden.status, 403);

        // comment_id validation across tasks returns 400
        const badCommentLink = await reqJson('POST', `/api/tasks/${task2.id}/attachments`, {
            body: {
                comment_id: evRes.data.comment.id,
                data_url: VALID_JPEG_DATA_URL,
                nombre_original: 'bad_link.jpg'
            }
        });
        assert.equal(badCommentLink.status, 400);

        // Refcount-safe delete: deleting task1 removes task1's attachments, keeps shared file while task2 references it
        const delTask1 = await reqJson('DELETE', `/api/tasks/${task1.id}`);
        assert.equal(delTask1.status, 200);
        assert.equal(fs.existsSync(diskPath), true, 'El archivo compartido debe permanecer en disco mientras task2 lo referencie');

        // Deleting task2's attachment drops refcount to 0 and unlinks physical file
        const delShared2 = await reqJson('DELETE', `/api/tasks/attachments/${task2.attachments[0].id}`);
        assert.equal(delShared2.status, 200);
        assert.equal(fs.existsSync(diskPath), false, 'El archivo físico debe eliminarse cuando refcount llega a 0');
    });

    it('R7.4: sendTelegramPhoto soporta .webp/.gif y sendTelegramDocument detecta MIME, trunca HTML seguro y hace fallback', async () => {
        const originalPost = axios.post;
        const originalEnvToken = process.env.TELEGRAM_BOT_TOKEN;
        process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token-123';

        const calls = [];
        let failEntitiesOnce = true;

        axios.post = async (url, formData) => {
            calls.push({ url, formData });
            if (url.endsWith('/sendDocument') && failEntitiesOnce) {
                failEntitiesOnce = false;
                const err = new Error('Bad Request: can\'t parse entities');
                err.response = { data: { description: "Bad Request: can't parse entities: Unclosed start tag" } };
                throw err;
            }
            return { data: { ok: true, result: { message_id: 777 } } };
        };

        try {
            const webpRes = await telegramTransport.sendTelegramPhoto('1001', VALID_WEBP_BUFFER, 'Captura <b>WebP</b>', null, 'captura.webp');
            assert.equal(webpRes.message_id, 777);
            assert.equal(calls[0].formData.mimeType, 'image/webp');

            const gifRes = await telegramTransport.sendTelegramPhoto('1001', VALID_GIF_BUFFER, 'GIF test', null, 'anim.gif');
            assert.equal(gifRes.message_id, 777);
            assert.equal(calls[1].formData.mimeType, 'image/gif');

            const longHtml = `<b>Encabezado</b> ${'x'.repeat(1050)} <i>cola</i>`;
            const docRes = await telegramTransport.sendTelegramDocument('1001', VALID_PDF_BUFFER, 'evidencia.pdf', longHtml);
            assert.equal(docRes.message_id, 777);
            // Retry happened (2 sendDocument calls: HTML -> plain text fallback)
            const docCalls = calls.filter(c => c.url.endsWith('/sendDocument'));
            assert.equal(docCalls.length, 2);
            assert.equal(docCalls[0].formData.mimeType, 'application/pdf');
            assert.ok(docCalls[0].formData.caption.length <= 1020);
            assert.equal(docCalls[1].formData.parse_mode, null);
        } finally {
            axios.post = originalPost;
            if (originalEnvToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
            else process.env.TELEGRAM_BOT_TOKEN = originalEnvToken;
        }
    });

    it('R7.4: mibotNotifierService envía media en modo inmediato, programado, >1020 chars y tolera ENOENT sin abortar', async () => {
        // Crear tarea con 2 adjuntos reales (WebP + PDF)
        const createRes = await reqJson('POST', '/api/tasks', {
            body: {
                titulo: 'Auditoría de Caja y Facturas',
                descripcion: 'Revisar soporte adjunto',
                fecha_vencimiento: '2026-12-10',
                assigned_to: 20,
                attachments: [
                    { data_url: VALID_WEBP_DATA_URL, nombre_original: 'cierre_caja.webp', nota: 'Voucher principal' },
                    { data_url: VALID_PDF_DATA_URL, nombre_original: 'respaldo.pdf', nota: 'DTE adjunto' }
                ]
            }
        });
        assert.equal(createRes.status, 201);
        const task = createRes.data.task;
        trackAttachments(task.attachments);
        const attWebp = task.attachments[0];
        const attPdf = task.attachments[1];

        // 1) Inmediato con 1 imagen y texto corto -> 1 sola llamada sendPhotoFn con teclado
        const photoCalls1 = [];
        const docCalls1 = [];
        const textCalls1 = [];
        const immediateSingle = await createMibotProgramacion({
            db: mockDb,
            payload: {
                tipo: 'TAREA',
                titulo: 'Revisar voucher',
                mensaje: 'Favor validar este comprobante.',
                task_id: task.id,
                destinatario_ids: [101],
                enviar_ahora: true,
                incluir_adjuntos: true,
                attachment_ids: [attWebp.id]
            },
            actorUser: { id: 10, nombre: 'Carlos Creador' },
            sendTelegramFn: async (chatId, html, kb) => {
                textCalls1.push({ chatId, html, kb });
                return { message_id: 10 };
            },
            sendPhotoFn: async (chatId, buf, cap, kb, fname) => {
                photoCalls1.push({ chatId, buf, cap, kb, fname });
                return { message_id: 11 };
            },
            sendDocumentFn: async (chatId, buf, fname, cap) => {
                docCalls1.push({ chatId, buf, fname, cap });
                return { message_id: 12 };
            },
            skipSystemNotification: true
        });
        assert.equal(immediateSingle.dispatch.sent, 1);
        assert.equal(photoCalls1.length, 1);
        assert.equal(textCalls1.length, 0);
        assert.equal(photoCalls1[0].fname, 'cierre_caja.webp');
        assert.ok(photoCalls1[0].kb && Array.isArray(photoCalls1[0].kb.inline_keyboard));

        // 2) Programado (enviar_ahora: false) con WebP + PDF -> despachado después por processDueMibotSchedules
        const schedRes = await createMibotProgramacion({
            db: mockDb,
            payload: {
                tipo: 'TAREA',
                titulo: 'Revisión completa',
                mensaje: 'Detalle extenso '.repeat(80), // > 1020 chars
                task_id: task.id,
                destinatario_ids: [101],
                enviar_ahora: false,
                programado_para: '2026-11-27 09:00:00',
                incluir_adjuntos: true,
                attachment_ids: [attWebp.id, attPdf.id]
            },
            actorUser: { id: 10, nombre: 'Carlos Creador' },
            skipSystemNotification: true
        });
        assert.equal(schedRes.programacion.incluir_adjuntos, true);
        assert.deepEqual(schedRes.programacion.attachment_ids, [attWebp.id, attPdf.id]);

        const photoCalls2 = [];
        const docCalls2 = [];
        const textCalls2 = [];
        const dueRes = await processDueMibotSchedules({
            db: mockDb,
            nowSqlOverride: '2026-11-27 09:05:00',
            sendTelegramFn: async (chatId, html, kb) => {
                textCalls2.push({ chatId, html, kb });
                return { message_id: 20 };
            },
            sendPhotoFn: async (chatId, buf, cap, kb, fname) => {
                photoCalls2.push({ chatId, buf, cap, kb, fname });
                return { message_id: 21 };
            },
            sendDocumentFn: async (chatId, buf, fname, cap) => {
                docCalls2.push({ chatId, buf, fname, cap });
                return { message_id: 22 };
            }
        });
        assert.equal(dueRes.processed, 1);
        assert.equal(textCalls2.length, 1);
        assert.equal(photoCalls2.length, 1);
        assert.equal(docCalls2.length, 1);
        assert.equal(docCalls2[0].fname, 'respaldo.pdf');

        // 3) Resiliencia ENOENT: eliminar archivo WebP del disco sin tocar BD, verificar que texto y PDF se siguen enviando
        unlinkTaskAttachmentFile(attWebp.archivo_url);
        const photoCalls3 = [];
        const docCalls3 = [];
        const textCalls3 = [];
        const enoentDispatch = await dispatchMibotProgramacion({
            db: mockDb,
            programacionId: schedRes.programacion.id,
            sendTelegramFn: async (chatId, html, kb) => {
                textCalls3.push({ chatId, html, kb });
                return { message_id: 30 };
            },
            sendPhotoFn: async (chatId, buf, cap, kb, fname) => {
                photoCalls3.push({ chatId, buf, cap, kb, fname });
                return { message_id: 31 };
            },
            sendDocumentFn: async (chatId, buf, fname, cap) => {
                docCalls3.push({ chatId, buf, fname, cap });
                return { message_id: 32 };
            },
            emitSystemNotif: false
        });
        assert.equal(enoentDispatch.sent, 1);
        assert.equal(textCalls3.length, 1);
        assert.equal(photoCalls3.length, 0);
        assert.equal(docCalls3.length, 1);
    });

    it('R7.4: truncateTelegramCaption cierra etiquetas HTML anidadas en LIFO sin romper bordes ni exceder maxLen', () => {
        const { truncateTelegramCaption } = telegramTransport;

        const assertBalancedTelegramHtml = (html, maxLen) => {
            assert.ok(html.length <= maxLen, `Excede maxLen=${maxLen}: len=${html.length}`);
            assert.ok(html.lastIndexOf('<') <= html.lastIndexOf('>'), `Quedó '<' sin cerrar en: ${html.slice(-30)}`);
            const stack = [];
            const re = /<\/?([a-zA-Z0-9-]+)(?:\s[^>]*)?>/g;
            let match;
            while ((match = re.exec(html)) !== null) {
                const full = match[0];
                const tag = match[1].toLowerCase();
                if (full.startsWith('</')) {
                    assert.equal(stack.pop(), tag, `Cierre HTML desbalanceado para </${tag}> en: ${html.slice(-40)}`);
                } else if (!full.endsWith('/>')) {
                    stack.push(tag);
                }
            }
            assert.deepEqual(stack, [], `Etiquetas abiertas sin cerrar: ${stack.join(', ')}`);
        };

        // 1) Reproducción exacta reportada en R1: 2 etiquetas anidadas en límite 1020
        const nested2 = `<b><i>${'x'.repeat(1014)}</i></b>`;
        const out2 = truncateTelegramCaption(nested2, 1020);
        assertBalancedTelegramHtml(out2, 1020);
        assert.ok(out2.endsWith('</i></b>'));
        assert.equal(out2.length, 1020);

        // 2) 3 niveles anidados
        const nested3 = `<b><i><code>${'x'.repeat(1020)}</code></i></b>`;
        const out3 = truncateTelegramCaption(nested3, 1020);
        assertBalancedTelegramHtml(out3, 1020);
        assert.ok(out3.endsWith('</code></i></b>'));
        assert.equal(out3.length, 1020);

        // 3) Enlace con atributos + negrita
        const anchorNested = `<a href="https://admin.sipesv.com/dashboard/operaciones/tareas?id=42"><b>${'y'.repeat(1010)}</b></a>`;
        const outAnchor = truncateTelegramCaption(anchorNested, 1020);
        assertBalancedTelegramHtml(outAnchor, 1020);
        assert.ok(outAnchor.endsWith('</b></a>'));

        // 4) Corte que al encoger para etiquetas de cierre cae en medio de un <a href="...">
        const midTagCut = `<b><i>${'x'.repeat(1000)}<a href="https://example.com/very/long/path">link</a></i></b>`;
        const outMidTag = truncateTelegramCaption(midTagCut, 1040);
        assertBalancedTelegramHtml(outMidTag, 1040);
        assert.ok(!outMidTag.includes('<a '), 'Debe descartar el <a parcial en vez de dejar HTML roto');
        assert.ok(outMidTag.endsWith('</i></b>'));

        // 5) Corte que cae en medio de una entidad HTML (&amp;)
        const midEntity = `<b>${'z'.repeat(1010)}&amp;</b>`;
        const outEntity = truncateTelegramCaption(midEntity, 1020);
        assertBalancedTelegramHtml(outEntity, 1020);
        assert.ok(!outEntity.endsWith('&am</b>'), 'No debe dejar entidad HTML truncada');
        assert.ok(outEntity.endsWith('</b>'));

        // 6) maxLen menor que la longitud combinada de etiquetas apertura + cierre
        const tiny5 = truncateTelegramCaption('<b><i>hello</i></b>', 5);
        assertBalancedTelegramHtml(tiny5, 5);
        assert.equal(tiny5, '');

        const tiny10 = truncateTelegramCaption('<b><i>hello</i></b>', 10);
        assertBalancedTelegramHtml(tiny10, 10);

        // 7) Si ya cabe en maxLen no altera el texto
        const fits = '<b><i>Corto</i></b>';
        assert.equal(truncateTelegramCaption(fits, 1020), fits);
    });
});
