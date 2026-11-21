const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseNaturalLanguageQuery } = require('../services/telegramTextAndDates');
const { formatPagosProgramadosMessage } = require('../services/telegramFormatters');
const {
    processMorningAgendaDigest
} = require('../services/mibotNotifierService');
const {
    pendingTaskWizards,
    pendingEventWizards,
    parseMultiUserTaskInput,
    createMultiUserTasksFromTelegram,
    startTaskAssignmentWizard,
    getEventosProgramadosData,
    parseScheduleEventInput,
    parseControlPagosQuery,
    getControlPagosDetailedData,
    formatControlPagosMessage,
    getCumpleanosData,
    formatCumpleanosMessage,
    handleActiveProductivityWizardMessage,
    handleProductivityCallbackQuery
} = require('../services/telegramProductivityService');

function createMockProductivityDb({
    users = [],
    tgUsers = [],
    abonos = [],
    meta = [],
    existingTasks = [],
    existingMibotProgs = [],
    existingMibotDests = [],
    existingDigestLogs = []
} = {}) {
    const tasks = [...existingTasks];
    const notifications = [];
    const taskComments = [];
    const programaciones = [...existingMibotProgs];
    const destinatarios = [...existingMibotDests];
    const digestLogs = [...existingDigestLogs];
    let nextTaskId = tasks.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1;
    let nextNotifId = 1;
    let nextProgId = programaciones.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1;
    let nextDestId = destinatarios.reduce((m, d) => Math.max(m, d.id || 0), 0) + 1;

    const db = {
        _state: { tasks, notifications, taskComments, programaciones, destinatarios, digestLogs },
        async query(sql, params = []) {
            const q = String(sql).replace(/\s+/g, ' ').trim();

            if (/^SELECT COLUMN_NAME FROM INFORMATION_SCHEMA\.COLUMNS/i.test(q)) {
                return [[
                    { COLUMN_NAME: 'cargo' },
                    { COLUMN_NAME: 'recibir_mibot' },
                    { COLUMN_NAME: 'mibot_pagos' },
                    { COLUMN_NAME: 'mibot_tareas' },
                    { COLUMN_NAME: 'mibot_validaciones' },
                    { COLUMN_NAME: 'mibot_reuniones' },
                    { COLUMN_NAME: 'task_id' }
                ]];
            }

            if (/^CREATE TABLE IF NOT EXISTS/i.test(q) || /^ALTER TABLE/i.test(q)) {
                return [{ affectedRows: 0 }];
            }

            if (/FROM users u LEFT JOIN roles r/i.test(q) && /LEFT JOIN telegram_usuarios tu/i.test(q)) {
                const rows = users.map(u => {
                    const tg = tgUsers.find(t => Number(t.user_id) === Number(u.id) && Number(t.activo) === 1);
                    return {
                        user_id: u.id,
                        username: u.username,
                        sipe_nombre: u.nombre,
                        status: u.status || 'active',
                        role_name: u.role_name || 'Operador',
                        telegram_usuario_id: tg ? tg.id : null,
                        telegram_user_id: tg ? tg.telegram_user_id : null,
                        telegram_username: tg ? tg.telegram_username : null,
                        first_name: tg ? tg.first_name : null,
                        last_name: tg ? tg.last_name : null,
                        cargo: tg ? tg.cargo : null,
                        recibir_mibot: tg ? (tg.recibir_mibot ?? 1) : null,
                        tg_activo: tg ? tg.activo : null
                    };
                });
                return [rows];
            }

            if (/FROM telegram_usuarios WHERE activo = 1 AND user_id IS NULL/i.test(q)) {
                return [tgUsers.filter(t => Number(t.activo) === 1 && !t.user_id)];
            }

            if (/FROM telegram_usuarios tu/i.test(q) && /WHERE tu\.id IN/i.test(q)) {
                const set = new Set(params.map(Number));
                return [tgUsers.filter(t => set.has(Number(t.id)) && Number(t.activo) === 1)];
            }

            if (/FROM telegram_usuarios tu/i.test(q) && /mibot_daily_digest_log/i.test(q)) {
                const today = params[0];
                const eligible = tgUsers.filter(t => {
                    const already = digestLogs.some(l => Number(l.telegram_usuario_id) === Number(t.id) && l.digest_date === today);
                    return Number(t.activo) === 1 && Number(t.recibir_mibot ?? 1) === 1 && !already;
                }).map(t => {
                    const su = users.find(u => Number(u.id) === Number(t.user_id));
                    return {
                        ...t,
                        sipe_nombre: su?.nombre || null,
                        role_id: su?.role_id || 2,
                        role_name: su?.role_name || 'Operador'
                    };
                });
                return [eligible];
            }

            if (/^INSERT IGNORE INTO mibot_daily_digest_log/i.test(q)) {
                const exists = digestLogs.some(l => Number(l.telegram_usuario_id) === Number(params[0]) && l.digest_date === params[1]);
                if (!exists) {
                    digestLogs.push({ telegram_usuario_id: Number(params[0]), digest_date: params[1], items_count: params[2] });
                }
                return [{ affectedRows: exists ? 0 : 1 }];
            }

            if (/^INSERT INTO tasks\b/i.test(q)) {
                const id = nextTaskId++;
                tasks.push({
                    id,
                    titulo: params[0],
                    descripcion: params[1],
                    fecha_vencimiento: params[2],
                    hora_limite: params[3],
                    prioridad: params[4],
                    estado: 'pendiente',
                    categoria: params[5],
                    assigned_to: Number(params[6]),
                    created_by: Number(params[7])
                });
                return [{ insertId: id, affectedRows: 1 }];
            }

            if (/^SELECT id, titulo, assigned_to, created_by, estado FROM tasks WHERE id = \?/i.test(q)) {
                return [tasks.filter(t => Number(t.id) === Number(params[0]))];
            }

            if (/^SELECT id, titulo, prioridad, DATE_FORMAT\(fecha_vencimiento/i.test(q) && /FROM tasks/i.test(q)) {
                const uid = Number(params[0]);
                const today = params[1];
                return [tasks.filter(t => Number(t.assigned_to) === uid && !['completada', 'cancelada'].includes(t.estado) && t.fecha_vencimiento <= today)];
            }

            if (/FROM tasks t/i.test(q) && /LEFT JOIN users u/i.test(q)) {
                const mapped = tasks
                    .filter(t => !['completada', 'cancelada'].includes(t.estado))
                    .map(t => {
                        const u1 = users.find(u => Number(u.id) === Number(t.assigned_to));
                        return { ...t, assigned_user_name: u1?.nombre || 'Colaborador' };
                    });
                return [mapped];
            }

            if (/^UPDATE tasks SET estado = \?/i.test(q)) {
                const nextEstado = params[0];
                const tid = Number(params[1]);
                const row = tasks.find(t => Number(t.id) === tid);
                if (row) row.estado = nextEstado;
                return [{ affectedRows: row ? 1 : 0 }];
            }

            if (/^INSERT INTO task_comments\b/i.test(q)) {
                taskComments.push({ task_id: params[0], user_id: params[1], comentario: params[2] });
                return [{ insertId: taskComments.length, affectedRows: 1 }];
            }

            if (/^INSERT INTO notifications\b/i.test(q)) {
                const id = nextNotifId++;
                notifications.push({
                    id,
                    user_id: Number(params[0]),
                    type: 'task_assigned',
                    title: params[1],
                    message: params[2],
                    data: JSON.parse(params[3])
                });
                return [{ insertId: id, affectedRows: 1 }];
            }

            if (/^INSERT INTO mibot_programaciones\b/i.test(q)) {
                const id = nextProgId++;
                programaciones.push({
                    id,
                    tipo: params[0],
                    titulo: params[1],
                    mensaje: params[2],
                    vencimiento_id: params[3],
                    recordatorio_id: params[4],
                    ubicacion: params[5],
                    monto_total: params[6],
                    monto_pendiente: params[7],
                    fecha_vencimiento: params[8],
                    programado_para: params[9],
                    proximo_envio_at: params[10],
                    frecuencia: params[11],
                    estado: 'PROGRAMADO',
                    created_by_user_id: params[12],
                    created_by_name: params[13],
                    task_id: params[14] || null
                });
                return [{ insertId: id, affectedRows: 1 }];
            }

            if (/^INSERT INTO mibot_programaciones_destinatarios\b/i.test(q)) {
                const id = nextDestId++;
                destinatarios.push({
                    id,
                    programacion_id: Number(params[0]),
                    telegram_usuario_id: Number(params[1]),
                    telegram_user_id: String(params[2]),
                    nombre_destinatario: params[3],
                    cargo: params[4],
                    estado_entrega: 'PENDIENTE'
                });
                return [{ insertId: id, affectedRows: 1 }];
            }

            if (/^SELECT \* FROM mibot_programaciones WHERE id = \?/i.test(q)) {
                return [programaciones.filter(p => Number(p.id) === Number(params[0]))];
            }

            if (/^SELECT \* FROM mibot_programaciones_destinatarios WHERE programacion_id = \?/i.test(q)) {
                return [destinatarios.filter(d => Number(d.programacion_id) === Number(params[0]))];
            }

            if (/^UPDATE mibot_programaciones_destinatarios SET estado_entrega = 'ENVIADO'/i.test(q)) {
                const d = destinatarios.find(x => Number(x.id) === Number(params[2]));
                if (d) d.estado_entrega = 'ENVIADO';
                return [{ affectedRows: d ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones SET estado = \?, ultimo_envio_at = \?/i.test(q)) {
                const p = programaciones.find(x => Number(x.id) === Number(params[3]));
                if (p) p.estado = params[0];
                return [{ affectedRows: p ? 1 : 0 }];
            }

            if (/FROM mibot_programaciones p/i.test(q)) {
                return [programaciones.map(p => ({ ...p, fecha_prog: p.proximo_envio_at || p.programado_para }))];
            }

            if (/FROM mibot_programaciones_destinatarios d INNER JOIN mibot_programaciones p/i.test(q)) {
                const tgRowId = Number(params[0]);
                const targetDay = params[1];
                const rows = destinatarios
                    .filter(d => Number(d.telegram_usuario_id) === tgRowId)
                    .map(d => {
                        const p = programaciones.find(x => Number(x.id) === Number(d.programacion_id));
                        return p ? { ...p, fecha_prog: p.proximo_envio_at || p.programado_para } : null;
                    })
                    .filter(p => p && String(p.fecha_prog).slice(0, 10) === targetDay);
                return [rows];
            }

            if (/FROM recordatorios_pagos_abonos/i.test(q)) {
                return [abonos];
            }
            if (/FROM recordatorios_pagos_comprobantes/i.test(q)) {
                return [[]];
            }
            if (/FROM recordatorios_vencimientos_meta/i.test(q)) {
                return [meta];
            }
            if (/SELECT vencimiento_id, SUM/i.test(q)) {
                return [[]];
            }

            return [[]];
        }
    };
    return db;
}

describe('Telegram Productividad: Tareas Multi-Usuario, Eventos, Control de Pagos y Cumpleaños', () => {
    const sampleCandidates = [
        { key: 'u_1', user_id: 1, telegram_usuario_id: 10, telegram_user_id: '1651970576', nombre: 'Raul Sosa', username: 'rsosa', has_telegram: true, recibir_mibot: true },
        { key: 'u_2', user_id: 2, telegram_usuario_id: 11, telegram_user_id: '7937148374', nombre: 'Corina Mendoza', username: 'cmendoza', has_telegram: true, recibir_mibot: true },
        { key: 'u_3', user_id: 3, telegram_usuario_id: null, telegram_user_id: null, nombre: 'Marcela Diaz', username: 'mdiaz', has_telegram: false, recibir_mibot: false }
    ];

    it('1. Parsea asignación de tarea a múltiples usuarios en lenguaje natural y voz', () => {
        const res = parseMultiUserTaskInput(
            'Asignar tarea a Raul y Corina revisar arqueo de Miraflores mañana 10am urgente',
            sampleCandidates,
            '2026-11-20 09:00:00'
        );

        assert.equal(res.isComplete, true);
        assert.equal(res.assignees.length, 2);
        assert.deepEqual(res.assignees.map(a => a.user_id), [1, 2]);
        assert.equal(res.prioridad, 'urgente');
        assert.equal(res.fecha_vencimiento, '2026-11-21');
        assert.equal(res.hora_limite, '10:00');
        assert.match(res.titulo, /revisar arqueo de Miraflores/i);

        const resColon = parseMultiUserTaskInput(
            '/asignar Corina, Marcela: verificar facturas Puma 15:30 prioridad alta',
            sampleCandidates,
            '2026-11-20 09:00:00'
        );
        assert.equal(resColon.isComplete, true);
        assert.deepEqual(resColon.assignees.map(a => a.user_id), [2, 3]);
        assert.equal(resColon.prioridad, 'alta');
        assert.equal(resColon.categoria, 'Finanzas');
        assert.equal(resColon.hora_limite, '15:30');
    });

    it('2. Crea N tareas, emite tarjetas informativas Socket.io, despacha MiBot y aplica fail-closed en permisos', async () => {
        const tgUsers = [
            { id: 10, user_id: 1, telegram_user_id: '1651970576', first_name: 'Raul', last_name: 'Sosa', activo: 1, recibir_mibot: 1 },
            { id: 11, user_id: 2, telegram_user_id: '7937148374', first_name: 'Corina', last_name: 'Mendoza', activo: 1, recibir_mibot: 1 }
        ];
        const mockDb = createMockProductivityDb({
            users: [
                { id: 1, nombre: 'Raul Sosa', username: 'rsosa', role_id: 1 },
                { id: 2, nombre: 'Corina Mendoza', username: 'cmendoza', role_id: 2 }
            ],
            tgUsers
        });

        // Bloqueo fail-closed si no tiene permiso de tareas e intenta asignar a otro usuario
        await assert.rejects(
            () => createMultiUserTasksFromTelegram({
                db: mockDb,
                creatorTgUser: tgUsers[1],
                creatorEffPerms: { isAdmin: false, tareas: false, linkedUser: { id: 2, nombre: 'Corina' } },
                assignees: [sampleCandidates[0]],
                titulo: 'AUDITAR CAJA CHICA'
            }),
            /permiso/i
        );

        const emittedEvents = [];
        const sentTelegram = [];
        const fakeIo = {
            to(room) {
                return { emit: (evt, payload) => emittedEvents.push({ room, evt, payload }) };
            },
            emit(evt, payload) {
                emittedEvents.push({ room: 'global', evt, payload });
            }
        };

        const result = await createMultiUserTasksFromTelegram({
            db: mockDb,
            io: fakeIo,
            creatorTgUser: tgUsers[0],
            creatorEffPerms: { isAdmin: true, tareas: true, linkedUser: { id: 1, nombre: 'Raul Sosa', username: 'rsosa' } },
            assignees: sampleCandidates, // 3 colaboradores (2 con Telegram, 1 solo web)
            titulo: 'REVISAR ARQUEO MIRAFLORES',
            fecha_vencimiento: '2026-11-21',
            hora_limite: '10:00',
            prioridad: 'urgente',
            categoria: 'Operaciones',
            enviar_ahora: true,
            sendTelegramFn: async (chatId, html) => {
                sentTelegram.push({ chatId, html });
                return { message_id: 500 + sentTelegram.length };
            }
        });

        assert.equal(result.createdTasks.length, 3);
        assert.equal(mockDb._state.tasks.length, 3);
        assert.equal(mockDb._state.notifications.length, 3);
        assert.equal(result.telegramSentCount, 2);
        assert.equal(sentTelegram.length, 2);
        assert.match(sentTelegram[0].html, /Equipo co-asignado \(3\)/);
        assert.ok(emittedEvents.some(e => e.room === 'user_2' && e.evt === 'notification:new'));
        assert.ok(emittedEvents.some(e => e.evt === 'tasks:assigned_card'));
        assert.ok(emittedEvents.some(e => e.evt === 'tasks:changed'));

        // Probar callback completar tarea (fail-closed para tercero no dueño, y éxito para asignado)
        const answers = [];
        await handleProductivityCallbackQuery({
            db: mockDb,
            io: fakeIo,
            cq: { id: 'cq1', data: 'tg_tsk:d:2', from: { id: 9999 }, message: { chat: { id: 9999 }, message_id: 10 } },
            tgUser: { id: 99, user_id: 99, telegram_user_id: '9999', activo: 1 },
            effPerms: { isAdmin: false, tareas: false },
            transport: {
                answerCallbackQuery: async (_id, text) => answers.push(text),
                sendTelegramMessage: async () => ({ message_id: 1 }),
                editMessageReplyMarkup: async () => {}
            }
        });
        assert.match(answers[0], /No tienes permiso/i);

        await handleProductivityCallbackQuery({
            db: mockDb,
            io: fakeIo,
            cq: { id: 'cq2', data: 'tg_tsk:d:2', from: { id: 7937148374 }, message: { chat: { id: 7937148374 }, message_id: 11 } },
            tgUser: tgUsers[1],
            effPerms: { isAdmin: false, tareas: false, linkedUser: { id: 2, nombre: 'Corina Mendoza' } },
            transport: {
                answerCallbackQuery: async (_id, text) => answers.push(text),
                sendTelegramMessage: async () => ({ message_id: 2 }),
                editMessageReplyMarkup: async () => {}
            }
        });
        const task2 = mockDb._state.tasks.find(t => t.id === 2);
        assert.equal(task2.estado, 'completada');
        assert.equal(mockDb._state.taskComments.length, 1);
    });

    it('3. Flujo de asistente interactivo multi-selección para asignar tarea paso a paso', async () => {
        const tgUser = { id: 10, user_id: 1, telegram_user_id: '1651970576', first_name: 'Raul', activo: 1 };
        const mockDb = createMockProductivityDb({
            users: [
                { id: 1, nombre: 'Raul Sosa', username: 'rsosa', role_id: 1 },
                { id: 2, nombre: 'Corina Mendoza', username: 'cmendoza', role_id: 2 }
            ],
            tgUsers: [tgUser, { id: 11, user_id: 2, telegram_user_id: '7937148374', first_name: 'Corina', activo: 1, recibir_mibot: 1 }]
        });

        const outgoing = [];
        const transport = {
            sendTelegramMessage: async (_cid, html, markup) => {
                outgoing.push({ html, markup });
                return { message_id: outgoing.length };
            },
            answerCallbackQuery: async () => {},
            editMessageReplyMarkup: async () => {},
            getMainReplyKeyboard: () => ({ keyboard: [] })
        };

        await startTaskAssignmentWizard({
            db: mockDb,
            chatId: '1651970576',
            tgUser,
            effPerms: { isAdmin: true, tareas: true },
            transport
        });
        assert.ok(pendingTaskWizards.has('1651970576'));

        await handleProductivityCallbackQuery({
            db: mockDb,
            cq: { id: 'w1', data: 'tg_tsk:wt:u_1', message: { chat: { id: '1651970576' }, message_id: 1 } },
            tgUser,
            effPerms: { isAdmin: true, tareas: true },
            transport
        });
        await handleProductivityCallbackQuery({
            db: mockDb,
            cq: { id: 'w2', data: 'tg_tsk:wt:u_2', message: { chat: { id: '1651970576' }, message_id: 1 } },
            tgUser,
            effPerms: { isAdmin: true, tareas: true },
            transport
        });
        await handleProductivityCallbackQuery({
            db: mockDb,
            cq: { id: 'w3', data: 'tg_tsk:wn', message: { chat: { id: '1651970576' }, message_id: 1 } },
            tgUser,
            effPerms: { isAdmin: true, tareas: true },
            transport
        });

        const handledStep2 = await handleActiveProductivityWizardMessage({
            db: mockDb,
            rawText: 'Auditar remesas pendientes mañana 9am urgente',
            chatId: '1651970576',
            user: tgUser,
            effectivePerms: { isAdmin: true, tareas: true, linkedUser: { id: 1, nombre: 'Raul Sosa' } },
            transport
        });
        assert.equal(handledStep2, true);

        await handleProductivityCallbackQuery({
            db: mockDb,
            cq: { id: 'w4', data: 'tg_tsk:wgo:now', message: { chat: { id: '1651970576' }, message_id: 2 } },
            tgUser,
            effPerms: { isAdmin: true, tareas: true, linkedUser: { id: 1, nombre: 'Raul Sosa' } },
            transport
        });

        assert.equal(pendingTaskWizards.has('1651970576'), false);
        assert.equal(mockDb._state.tasks.length, 2);
        assert.equal(mockDb._state.tasks[0].prioridad, 'urgente');
    });

    it('4. Agenda unificada y programación de eventos MiBot respetando permisos de Control de Pagos', async () => {
        const parsedEvt = parseScheduleEventInput(
            'Agendar reunión con Raul y Corina mañana a las 10am sobre presupuesto anual',
            sampleCandidates,
            10,
            '2026-11-20 09:00:00'
        );
        assert.equal(parsedEvt.isComplete, true);
        assert.equal(parsedEvt.tipo, 'REUNION');
        assert.equal(parsedEvt.programado_para, '2026-11-21 10:00:00');
        assert.deepEqual(parsedEvt.participants.map(p => p.telegram_usuario_id), [10, 11]);

        const parsedSelf = parseScheduleEventInput(
            'Recuérdame hoy a las 4pm validar transferencias diario',
            sampleCandidates,
            10,
            '2026-11-20 09:00:00'
        );
        assert.equal(parsedSelf.isComplete, true);
        assert.equal(parsedSelf.frecuencia, 'DIARIO');
        assert.equal(parsedSelf.programado_para, '2026-11-20 16:00:00');

        const mockDb = createMockProductivityDb({
            users: [{ id: 1, nombre: 'Raul Sosa' }],
            existingTasks: [{ id: 5, titulo: 'REVISION INVENTARIO', prioridad: 'alta', estado: 'pendiente', fecha_vencimiento: '2026-11-21', hora_limite: '14:00', assigned_to: 1, created_by: 1 }],
            existingMibotProgs: [{ id: 1, tipo: 'REUNION', titulo: 'Junta Directiva', frecuencia: 'UNA_VEZ', estado: 'PROGRAMADO', proximo_envio_at: '2026-11-21 10:00:00', programado_para: '2026-11-21 10:00:00' }]
        });
        const mockExtDb = {
            async query() {
                return [[{ id: 100, id_recordatorio: 50, ubicacion: 'COSTA DEL SOL', descripcion: 'Pago Alquiler', vence: '2026-11-21', monto: 2500, estado: 'PENDIENTE' }]];
            }
        };
        const mockAccDb = {
            async query() {
                return [[{ nombre: 'Maria Lopez', dia: 22, mes: 11, anio_nac: 1995, empresa: 'SIPE', departamento: 'Pista' }]];
            }
        };

        const agendaNoPagos = await getEventosProgramadosData({
            db: mockDb,
            externalDb: mockExtDb,
            accountingDb: mockAccDb,
            telegramUserId: '1651970576',
            sipeUserId: 1,
            range: 'semana',
            includeControlPagos: false,
            includeTeam: true,
            referenceDate: '2026-11-20'
        });
        assert.equal(agendaNoPagos.mibotEvents.length, 1);
        assert.equal(agendaNoPagos.tasksEvents.length, 1);
        assert.equal(agendaNoPagos.paymentEvents.length, 0);
        assert.equal(agendaNoPagos.birthdays.length, 1);

        const agendaWithPagos = await getEventosProgramadosData({
            db: mockDb,
            externalDb: mockExtDb,
            accountingDb: mockAccDb,
            telegramUserId: '1651970576',
            sipeUserId: 1,
            range: 'semana',
            includeControlPagos: true,
            includeTeam: true,
            referenceDate: '2026-11-20'
        });
        assert.equal(agendaWithPagos.paymentEvents.length, 1);
        assert.equal(agendaWithPagos.paymentEvents[0].saldo_pendiente, 2500);
    });

    it('5. Control de Pagos enriquece abonos parciales, calcula saldo real y filtra por estado/ubicación/concepto', async () => {
        const qPartial = parseControlPagosQuery('Cuales son los pagos parciales de Miraflores');
        assert.equal(qPartial.filterMode, 'parciales');
        assert.equal(qPartial.ubicacionFilter, 'MIRAFLORES');

        const qConcept = parseControlPagosQuery('Ya se pago energia electrica');
        assert.equal(qConcept.filterMode, 'cancelados');
        assert.match(qConcept.searchTerm, /energia electrica/i);

        const mockDb = createMockProductivityDb({
            abonos: [
                { vencimiento_id: 201, id: 1, tipo_operacion: 'CXP', metodo_pago: 'TRANSFERENCIA', cuenta_bancaria_id: 1, fecha_pago: '2026-11-18', monto: 400, estado_conciliacion: 'PENDIENTE' }
            ]
        });
        const mockExtDb = {
            async query() {
                return [[
                    { id: 201, id_recordatorio: 10, ubicacion: 'MIRAFLORES', descripcion: 'Proveedor Huevos Frescos', vence: '2026-11-19', monto: 1000, estado: 'PENDIENTE', fecha_cancelacion: null },
                    { id: 202, id_recordatorio: 11, ubicacion: 'COSTA DEL SOL', descripcion: 'Energía Eléctrica DELSUR', vence: '2026-11-20', monto: 850, estado: 'CANCELADO', fecha_cancelacion: '2026-11-20' },
                    { id: 203, id_recordatorio: 12, ubicacion: 'LA LOMA', descripcion: 'Alcaldía Municipal', vence: '2026-11-23', monto: 300, estado: 'PENDIENTE', fecha_cancelacion: null }
                ]];
            }
        };

        const dataParciales = await getControlPagosDetailedData({
            db: mockDb,
            externalDb: mockExtDb,
            filterMode: 'parciales',
            referenceDate: '2026-11-20'
        });

        assert.equal(dataParciales.cantidad_parciales, 1);
        assert.equal(dataParciales.pagos.length, 1);
        assert.equal(dataParciales.pagos[0].estado_pago, 'PARCIAL');
        assert.equal(dataParciales.pagos[0].monto_pagado, 400);
        assert.equal(dataParciales.pagos[0].saldo_pendiente, 600);
        assert.equal(dataParciales.total_saldo_pendiente_usd, 900); // 600 + 300 activos

        const html = formatControlPagosMessage(dataParciales);
        assert.match(html, /\$600\.00/);
        assert.match(html, /Abonado: \$400\.00 \/ \$1,000\.00/);

        // Retrocompatibilidad con formatPagosProgramadosMessage
        const legacyHtml = formatPagosProgramadosMessage(dataParciales);
        assert.match(legacyHtml, /CONTROL DE PAGOS PROGRAMADOS Y VENCIMIENTOS/);
    });

    it('6. Cumpleaños del personal soporta filtros hoy, semana (incluyendo cruce de año) y mes', async () => {
        const mockAccDb = {
            async query() {
                return [[
                    { nombre: 'Ana Perez', dia: 31, mes: 12, anio_nac: 1990, empresa: 'Estación Costa', departamento: 'Pista' },
                    { nombre: 'Luis Gomez', dia: 2, mes: 1, anio_nac: 1988, empresa: 'Andelsa', departamento: 'Planta' },
                    { nombre: 'Carlos Ruiz', dia: 15, mes: 6, anio_nac: 1992, empresa: 'SIPE', departamento: 'Admin' }
                ]];
            }
        };

        const bWeek = await getCumpleanosData({
            accountingDb: mockAccDb,
            scope: 'semana',
            referenceDate: '2026-12-30'
        });
        assert.equal(bWeek.cumpleaneros.length, 2);
        assert.equal(bWeek.cumpleaneros[0].nombre, 'Ana Perez');
        assert.equal(bWeek.cumpleaneros[1].nombre, 'Luis Gomez');

        const html = formatCumpleanosMessage(bWeek);
        assert.match(html, /Ana Perez/);
        assert.match(html, /Luis Gomez/);
    });

    it('7. Digest matutino proactivo envía 1 resumen consolidado y no duplica en el mismo día', async () => {
        const mockDb = createMockProductivityDb({
            users: [{ id: 1, nombre: 'Raul Sosa', role_id: 1, role_name: 'Administrator' }],
            tgUsers: [{ id: 10, user_id: 1, telegram_user_id: '1651970576', first_name: 'Raul', last_name: 'Sosa', activo: 1, recibir_mibot: 1, mibot_tareas: 1, mibot_pagos: 1, permiso_saldos_banco: 1 }],
            existingTasks: [{ id: 12, titulo: 'REVISAR CONCILIACION', prioridad: 'alta', estado: 'pendiente', fecha_vencimiento: '2026-11-20', hora_limite: '11:00', assigned_to: 1, created_by: 1 }],
            existingMibotProgs: [{ id: 4, tipo: 'REUNION', titulo: 'Comité Semanal', proximo_envio_at: '2026-11-20 09:00:00', programado_para: '2026-11-20 09:00:00' }],
            existingMibotDests: [{ id: 40, programacion_id: 4, telegram_usuario_id: 10, telegram_user_id: '1651970576', nombre_destinatario: 'Raul Sosa' }]
        });
        const mockExtDb = {
            async query() {
                return [[{ cnt: 2, total: 1200 }]];
            }
        };
        const sent = [];
        const firstRun = await processMorningAgendaDigest({
            db: mockDb,
            externalDb: mockExtDb,
            nowSqlOverride: '2026-11-20 07:30:00',
            sendTelegramFn: async (chatId, html) => {
                sent.push({ chatId, html });
                return { message_id: 901 };
            }
        });
        assert.equal(firstRun.sent, 1);
        assert.match(sent[0].html, /REVISAR CONCILIACION/);
        assert.match(sent[0].html, /Comité Semanal/);
        assert.match(sent[0].html, /\$1,200\.00/);

        // Segunda corrida el mismo día no debe reenviar
        const secondRun = await processMorningAgendaDigest({
            db: mockDb,
            externalDb: mockExtDb,
            nowSqlOverride: '2026-11-20 07:35:00',
            sendTelegramFn: async (chatId, html) => {
                sent.push({ chatId, html });
                return { message_id: 902 };
            }
        });
        assert.equal(secondRun.sent, 0);
        assert.equal(sent.length, 1);
    });

    it('8. NLU activa intents nuevos y preserva sin regresión todas las consultas existentes', () => {
        const pAssign = parseNaturalLanguageQuery('Asignar tarea a Corina y Raul revisar tanques solares de Costa del Sol mañana');
        assert.equal(pAssign.isAsignarTarea, true);
        assert.equal(pAssign.isSolar, false);
        assert.equal(pAssign.isTanques, false);

        const pAgenda = parseNaturalLanguageQuery('Cuales son los eventos programados de esta semana');
        assert.equal(pAgenda.isEventosAgenda, true);

        const pAgendar = parseNaturalLanguageQuery('Recuerdame mañana a las 8am revisar precios competencia');
        assert.equal(pAgendar.isAgendarEvento, true);
        assert.equal(pAgendar.isCompetencia, false);

        const pBday = parseNaturalLanguageQuery('Quien cumple años esta semana');
        assert.equal(pBday.isCumpleanos, true);

        const pPagos = parseNaturalLanguageQuery('Pagos vencidos en control de pagos de Miraflores');
        assert.equal(pPagos.isPagosProgramados, true);

        // No regresión en intents históricos
        const pComp = parseNaturalLanguageQuery('Precios de la competencia en Miraflores');
        assert.equal(pComp.isCompetencia, true);
        assert.equal(pComp.isAsignarTarea, false);

        const pAndelsaCxc = parseNaturalLanguageQuery('Cuentas por cobrar de Andelsa');
        assert.equal(pAndelsaCxc.isAndelsaCxc, true);
        assert.equal(pAndelsaCxc.isPagosProgramados, false);

        const pCheq = parseNaturalLanguageQuery('Saldo en chequera de Raul Sosa');
        assert.equal(pCheq.isChequera, true);
        assert.equal(pCheq.isAsignarTarea, false);
    });

    it('9. Limpia wizards temporales tras la prueba', () => {
        pendingTaskWizards.clear();
        pendingEventWizards.clear();
        assert.equal(pendingTaskWizards.size, 0);
        assert.equal(pendingEventWizards.size, 0);
    });
});
