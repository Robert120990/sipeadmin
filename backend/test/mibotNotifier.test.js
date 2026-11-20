const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeScheduleDatetime,
    addMinutesToSvSql,
    computeNextScheduleSql,
    formatDisplayDateTimeSv,
    formatMibotPersonalMessage,
    buildMibotInlineKeyboard,
    createMibotProgramacion,
    dispatchMibotProgramacion,
    handleMibotCallbackQuery,
    processDueMibotSchedules,
    getActiveMibotCountsByVencimientos
} = require('../services/mibotNotifierService');

/**
 * Pool MySQL en memoria simulando las tablas de MiBot para pruebas unitarias deterministas
 */
function createMockMibotDb({ tgUsers = [], abonos = [] } = {}) {
    const programaciones = [];
    const destinatarios = [];
    let nextProgId = 1;
    let nextDestId = 1;

    const db = {
        _state: { programaciones, destinatarios },
        async query(sql, params = []) {
            const q = String(sql).replace(/\s+/g, ' ').trim();

            if (/^SELECT COLUMN_NAME FROM INFORMATION_SCHEMA\.COLUMNS/i.test(q)) {
                return [[
                    { COLUMN_NAME: 'cargo' },
                    { COLUMN_NAME: 'recibir_mibot' },
                    { COLUMN_NAME: 'mibot_pagos' },
                    { COLUMN_NAME: 'mibot_tareas' },
                    { COLUMN_NAME: 'mibot_validaciones' },
                    { COLUMN_NAME: 'mibot_reuniones' }
                ]];
            }

            if (/^CREATE TABLE IF NOT EXISTS/i.test(q) || /^ALTER TABLE/i.test(q)) {
                return [{ affectedRows: 0 }];
            }

            if (/FROM telegram_usuarios tu/i.test(q) && /WHERE tu\.id IN/i.test(q)) {
                const idSet = new Set(params.map(Number));
                const matched = tgUsers.filter(u => idSet.has(Number(u.id)) && Number(u.activo) === 1);
                return [matched];
            }

            if (/FROM recordatorios_pagos_abonos/i.test(q)) {
                const vid = Number(params[0]);
                const rows = abonos.filter(a => Number(a.vencimiento_id) === vid);
                const total = rows.reduce((s, a) => s + Number(a.monto || 0), 0);
                return [[{ cnt: rows.length, total_pagado: total }]];
            }

            if (/^INSERT INTO mibot_programaciones\b/i.test(q)) {
                const id = nextProgId++;
                const row = {
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
                    ultimo_envio_at: null,
                    total_envios: 0,
                    created_by_user_id: params[12],
                    created_by_name: params[13]
                };
                programaciones.push(row);
                return [{ insertId: id, affectedRows: 1 }];
            }

            if (/^INSERT INTO mibot_programaciones_destinatarios\b/i.test(q)) {
                const id = nextDestId++;
                const row = {
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
                };
                destinatarios.push(row);
                return [{ insertId: id, affectedRows: 1 }];
            }

            if (/^SELECT \* FROM mibot_programaciones WHERE id = \?/i.test(q)) {
                const found = programaciones.filter(p => Number(p.id) === Number(params[0]));
                return [found.map(x => ({ ...x }))];
            }

            if (/^SELECT \* FROM mibot_programaciones_destinatarios WHERE programacion_id = \?/i.test(q)) {
                const found = destinatarios
                    .filter(d => Number(d.programacion_id) === Number(params[0]))
                    .sort((a, b) => a.nombre_destinatario.localeCompare(b.nombre_destinatario));
                return [found.map(x => ({ ...x }))];
            }

            if (/^SELECT d\.\*, p\.tipo, p\.titulo, p\.frecuencia, p\.estado AS prog_estado FROM mibot_programaciones_destinatarios d/i.test(q)) {
                const dest = destinatarios.find(d => Number(d.id) === Number(params[0]));
                if (!dest) return [[]];
                const prog = programaciones.find(p => Number(p.id) === Number(dest.programacion_id));
                if (!prog) return [[]];
                return [[{
                    ...dest,
                    tipo: prog.tipo,
                    titulo: prog.titulo,
                    frecuencia: prog.frecuencia,
                    prog_estado: prog.estado
                }]];
            }

            if (/^SELECT COUNT\(\*\) AS cnt FROM mibot_programaciones_destinatarios WHERE programacion_id = \? AND estado_entrega <> 'VALIDADO'/i.test(q)) {
                const pid = Number(params[0]);
                const cnt = destinatarios.filter(d => Number(d.programacion_id) === pid && d.estado_entrega !== 'VALIDADO').length;
                return [[{ cnt }]];
            }

            if (/^UPDATE mibot_programaciones_destinatarios SET estado_entrega = 'ENVIADO'/i.test(q)) {
                const d = destinatarios.find(x => Number(x.id) === Number(params[2]));
                if (d) {
                    d.estado_entrega = 'ENVIADO';
                    d.enviado_at = params[0];
                    d.pospuesto_hasta = null;
                    d.telegram_message_id = params[1];
                    d.error_msg = null;
                }
                return [{ affectedRows: d ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones_destinatarios SET estado_entrega = 'ERROR'/i.test(q)) {
                const d = destinatarios.find(x => Number(x.id) === Number(params[params.length - 1]));
                if (d) {
                    d.estado_entrega = 'ERROR';
                    d.pospuesto_hasta = null;
                    d.error_msg = params.length > 1 ? params[0] : 'error';
                }
                return [{ affectedRows: d ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones_destinatarios SET estado_entrega = \?, respondido_at = \?, pospuesto_hasta = \?, respuesta_nota = \? WHERE id = \?/i.test(q)) {
                const d = destinatarios.find(x => Number(x.id) === Number(params[4]));
                if (d) {
                    d.estado_entrega = params[0];
                    d.respondido_at = params[1];
                    d.pospuesto_hasta = params[2];
                    d.respuesta_nota = params[3];
                }
                return [{ affectedRows: d ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones SET estado = 'COMPLETADO', monto_pendiente = 0, proximo_envio_at = NULL WHERE id = \?/i.test(q)) {
                const p = programaciones.find(x => Number(x.id) === Number(params[0]));
                if (p) {
                    p.estado = 'COMPLETADO';
                    p.monto_pendiente = 0;
                    p.proximo_envio_at = null;
                }
                return [{ affectedRows: p ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones SET estado = 'COMPLETADO', proximo_envio_at = NULL WHERE id = \?/i.test(q)) {
                const p = programaciones.find(x => Number(x.id) === Number(params[0]));
                if (p) {
                    p.estado = 'COMPLETADO';
                    p.proximo_envio_at = null;
                }
                return [{ affectedRows: p ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones SET monto_pendiente = \? WHERE id = \?/i.test(q)) {
                const p = programaciones.find(x => Number(x.id) === Number(params[1]));
                if (p) p.monto_pendiente = params[0];
                return [{ affectedRows: p ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones SET estado = \?, ultimo_envio_at = \?, proximo_envio_at = \?, total_envios = total_envios \+ 1 WHERE id = \?/i.test(q)) {
                const p = programaciones.find(x => Number(x.id) === Number(params[3]));
                if (p) {
                    p.estado = params[0];
                    p.ultimo_envio_at = params[1];
                    p.proximo_envio_at = params[2];
                    p.total_envios = Number(p.total_envios || 0) + 1;
                }
                return [{ affectedRows: p ? 1 : 0 }];
            }

            if (/^SELECT id FROM mibot_programaciones WHERE estado = 'PROGRAMADO'/i.test(q)) {
                const nowSv = params[0];
                const due = programaciones
                    .filter(p => p.estado === 'PROGRAMADO' && p.proximo_envio_at && p.proximo_envio_at <= nowSv)
                    .map(p => ({ id: p.id }));
                return [due];
            }

            if (/^SELECT d\.id AS dest_id, d\.programacion_id FROM mibot_programaciones_destinatarios d/i.test(q)) {
                const nowSv = params[0];
                const snoozed = destinatarios
                    .filter(d => {
                        const parent = programaciones.find(p => Number(p.id) === Number(d.programacion_id));
                        return d.estado_entrega === 'POSPUESTO' && d.pospuesto_hasta && d.pospuesto_hasta <= nowSv && parent && parent.estado !== 'CANCELADO';
                    })
                    .map(d => ({ dest_id: d.id, programacion_id: d.programacion_id }));
                return [snoozed];
            }

            if (/^SELECT vencimiento_id, SUM\(CASE WHEN estado = 'PROGRAMADO'/i.test(q)) {
                const idSet = new Set(params.map(Number));
                const grouped = new Map();
                for (const p of programaciones) {
                    if (p.vencimiento_id && idSet.has(Number(p.vencimiento_id)) && p.estado !== 'CANCELADO') {
                        const vid = Number(p.vencimiento_id);
                        const cur = grouped.get(vid) || { vencimiento_id: vid, programados: 0, total: 0 };
                        if (p.estado === 'PROGRAMADO') cur.programados += 1;
                        cur.total += 1;
                        grouped.set(vid, cur);
                    }
                }
                return [[...grouped.values()]];
            }

            throw new Error(`Consulta SQL no simulada en prueba MiBot: ${q}`);
        }
    };

    return db;
}

function createMockExternalDb(vencimientos = []) {
    return {
        async query(sql, params = []) {
            if (/FROM web_rc_recordatorios_vencimientos/i.test(sql)) {
                const vid = Number(params[0]);
                const found = vencimientos.filter(v => Number(v.id) === vid);
                return [found];
            }
            return [[]];
        }
    };
}

test('MiBot helpers de fecha/hora en zona America/El_Salvador y recurrencia', () => {
    assert.equal(normalizeScheduleDatetime('2026-11-21T09:30'), '2026-11-21 09:30:00');
    assert.equal(normalizeScheduleDatetime('2026-11-21'), '2026-11-21 08:00:00');
    assert.equal(addMinutesToSvSql('2026-11-21 23:30:00', 60), '2026-11-22 00:30:00');
    assert.equal(computeNextScheduleSql('2026-11-21 08:00:00', 'UNA_VEZ', '2026-11-21 08:05:00'), null);
    assert.equal(computeNextScheduleSql('2026-11-21 08:00:00', 'DIARIO_HASTA_PAGAR', '2026-11-21 08:05:00'), '2026-11-22 08:00:00');
    assert.equal(computeNextScheduleSql('2026-11-21 08:00:00', 'SEMANAL', '2026-11-21 08:05:00'), '2026-11-28 08:00:00');
    assert.equal(formatDisplayDateTimeSv('2026-11-21 15:05:00'), '21/11/2026 03:05 PM');
});

test('formatMibotPersonalMessage personaliza saludo, cargo, co-notificados y escapa HTML', () => {
    const html = formatMibotPersonalMessage({
        programacion: {
            tipo: 'REUNION',
            titulo: 'Reunión Gerencial <Q4> & Presupuesto',
            mensaje: 'Revisaremos metas y flujo de caja en sala principal.',
            programado_para: '2026-11-22 10:00:00',
            frecuencia: 'UNA_VEZ',
            created_by_name: 'Administración'
        },
        destinatario: {
            id: 10,
            nombre_destinatario: 'Raul Sosa',
            cargo: 'Gerente General'
        },
        otrosDestinatarios: [
            { nombre_destinatario: 'Corina Sosa', cargo: 'Dirección' },
            { nombre_destinatario: 'Marcela Sosa', cargo: null }
        ]
    });

    assert.match(html, /Hola <b>Raul Sosa<\/b> <i>\(Gerente General\)<\/i>/);
    assert.match(html, /Reunión Gerencial &lt;Q4&gt; &amp; Presupuesto/);
    assert.match(html, /También notificados \(2\):<\/b> Corina Sosa \(Dirección\), Marcela Sosa/);
    assert.doesNotMatch(html, /<Q4>/);

    const kb = buildMibotInlineKeyboard(10, 'REUNION');
    assert.equal(kb.inline_keyboard[0][0].callback_data, 'mibot:visto:10');
    assert.equal(kb.inline_keyboard[0][1].callback_data, 'mibot:validar:10');
    assert.equal(kb.inline_keyboard[1][0].callback_data, 'mibot:posponer:10');
});

test('createMibotProgramacion envía 3 mensajes personales individuales (Raul, Corina y Marcela Sosa)', async () => {
    const tgUsers = [
        { id: 1, telegram_user_id: '1001', first_name: 'Raul', last_name: 'Sosa', cargo: 'Gerente General', activo: 1, recibir_mibot: 1 },
        { id: 2, telegram_user_id: '1002', first_name: 'Corina', last_name: 'Sosa', cargo: 'Directora', activo: 1, recibir_mibot: 1 },
        { id: 3, telegram_user_id: '1003', first_name: 'Marcela', last_name: 'Sosa', cargo: 'Administración', activo: 1, recibir_mibot: 1 }
    ];
    const db = createMockMibotDb({ tgUsers });
    const sentMessages = [];

    const mockSend = async (chatId, html, replyMarkup) => {
        sentMessages.push({ chatId, html, replyMarkup });
        return { message_id: 500 + sentMessages.length };
    };

    const result = await createMibotProgramacion({
        db,
        payload: {
            tipo: 'REUNION',
            titulo: 'Reunión Directiva Mensual',
            mensaje: 'Nos reunimos a las 10:00 AM para revisar resultados.',
            destinatario_ids: [1, 2, 3],
            enviar_ahora: true,
            frecuencia: 'UNA_VEZ'
        },
        actorUser: { id: 9, nombre: 'Sistema SIPE' },
        sendTelegramFn: mockSend
    });

    assert.equal(sentMessages.length, 3);
    assert.equal(result.dispatch.sent, 3);
    assert.equal(result.dispatch.failed, 0);
    assert.equal(result.programacion.estado, 'ENVIADO');

    const raulMsg = sentMessages.find(m => m.chatId === '1001');
    const corinaMsg = sentMessages.find(m => m.chatId === '1002');
    const marcelaMsg = sentMessages.find(m => m.chatId === '1003');

    assert.ok(raulMsg && corinaMsg && marcelaMsg);
    assert.match(raulMsg.html, /Hola <b>Raul Sosa<\/b> <i>\(Gerente General\)<\/i>/);
    assert.match(raulMsg.html, /Corina Sosa/);
    assert.match(raulMsg.html, /Marcela Sosa/);
    assert.match(corinaMsg.html, /Hola <b>Corina Sosa<\/b>/);
    assert.match(marcelaMsg.html, /Hola <b>Marcela Sosa<\/b>/);
});

test('DIARIO_HASTA_PAGAR se auto-completa cuando el pago vinculado llega a 100% CANCELADO', async () => {
    const tgUsers = [
        { id: 1, telegram_user_id: '1001', first_name: 'Raul', last_name: 'Sosa', cargo: 'Gerente General', activo: 1, recibir_mibot: 1 }
    ];
    const abonos = [{ vencimiento_id: 77, monto: 500 }];
    const db = createMockMibotDb({ tgUsers, abonos });
    const externalDb = createMockExternalDb([
        { id: 77, id_recordatorio: 12, vencimiento: '2026-11-25', estado: 'P', descripcion: 'Pago Eléctrico', monto: 1000, ubicacion: 'ANDELSA' }
    ]);

    const sent = [];
    const mockSend = async (chatId, html) => {
        sent.push({ chatId, html });
        return { message_id: 901 };
    };

    const created = await createMibotProgramacion({
        db,
        externalDb,
        payload: {
            tipo: 'RECORDATORIO_PAGO',
            titulo: 'Saldo parcial pendiente: Pago Eléctrico',
            mensaje: 'Falta cancelar el 50% restante.',
            vencimiento_id: 77,
            destinatario_ids: [1],
            programado_para: '2026-11-21 08:00:00',
            frecuencia: 'DIARIO_HASTA_PAGAR'
        },
        actorUser: { id: 1, nombre: 'Admin' },
        sendTelegramFn: mockSend
    });

    // Verifica conteo activo para Control de Pagos
    const counts = await getActiveMibotCountsByVencimientos(db, [77]);
    assert.equal(counts.get(77).programados, 1);

    // 1er ciclo cron con saldo parcial ($500 pendiente) -> envía y reprograma para mañana
    const run1 = await processDueMibotSchedules({
        db,
        externalDb,
        sendTelegramFn: mockSend,
        nowSqlOverride: '2026-11-21 08:05:00'
    });
    assert.equal(run1.processed, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0].html, /\$500\.00/);
    assert.equal(db._state.programaciones[0].estado, 'PROGRAMADO');
    assert.equal(db._state.programaciones[0].proximo_envio_at, '2026-11-22 08:00:00');

    // Ahora se cancela el otro $500 -> en el 2do ciclo cron MiBot auto-completa y NO molesta al usuario
    abonos.push({ vencimiento_id: 77, monto: 500 });
    const run2 = await processDueMibotSchedules({
        db,
        externalDb,
        sendTelegramFn: mockSend,
        nowSqlOverride: '2026-11-22 08:05:00'
    });
    assert.equal(run2.processed, 1);
    assert.equal(sent.length, 1); // Sin envío adicional
    assert.equal(db._state.programaciones[0].estado, 'COMPLETADO');
    assert.equal(created.programacion.vencimiento_id, 77);
});

test('handleMibotCallbackQuery aplica fail-closed por propietario, confirma validación y soporta posponer 1h', async () => {
    const tgUsers = [
        { id: 1, telegram_user_id: '1001', first_name: 'Raul', last_name: 'Sosa', cargo: 'Gerente General', activo: 1, recibir_mibot: 1 },
        { id: 2, telegram_user_id: '1002', first_name: 'Corina', last_name: 'Sosa', cargo: 'Directora', activo: 1, recibir_mibot: 1 }
    ];
    const db = createMockMibotDb({ tgUsers });
    const sent = [];
    const mockSend = async (chatId, html) => {
        sent.push({ chatId, html });
        return { message_id: 700 + sent.length };
    };

    const created = await createMibotProgramacion({
        db,
        payload: {
            tipo: 'VALIDACION',
            titulo: 'Validar cierre bancario',
            mensaje: 'Confirmar que el depósito ya se reflejó.',
            destinatario_ids: [1, 2],
            enviar_ahora: true,
            frecuencia: 'UNA_VEZ'
        },
        sendTelegramFn: mockSend
    });

    const destRaul = created.programacion.destinatarios.find(d => d.telegram_user_id === '1001');
    const destCorina = created.programacion.destinatarios.find(d => d.telegram_user_id === '1002');
    const answers = [];
    const edits = [];
    const transport = {
        answerCallbackQuery: async (id, text) => answers.push({ id, text }),
        editMessageReplyMarkup: async (chatId, msgId, markup) => edits.push({ chatId, msgId, markup }),
        sendTelegramMessage: mockSend
    };

    // Intento no autorizado: usuario 1002 intenta validar botón de usuario 1001 -> bloqueado fail-closed
    await handleMibotCallbackQuery({
        db,
        cq: { id: 'cq-bad', data: `mibot:validar:${destRaul.id}`, from: { id: 1002 }, message: { chat: { id: 1002 }, message_id: 1 } },
        tgUser: { id: 2, telegram_user_id: '1002', activo: 1 },
        transport
    });
    assert.match(answers[0].text, /pertenece a otro usuario/i);
    assert.equal(db._state.destinatarios.find(d => d.id === destRaul.id).estado_entrega, 'ENVIADO');

    // Raul pospone 1 hora
    await handleMibotCallbackQuery({
        db,
        cq: { id: 'cq-snooze', data: `mibot:posponer:${destRaul.id}`, from: { id: 1001 }, message: { chat: { id: 1001 }, message_id: 701 } },
        tgUser: { id: 1, telegram_user_id: '1001', activo: 1 },
        transport
    });
    const raulState = db._state.destinatarios.find(d => d.id === destRaul.id);
    assert.equal(raulState.estado_entrega, 'POSPUESTO');
    assert.ok(raulState.pospuesto_hasta);

    // Cuando vence el pospuesto, el scheduler re-envía SOLO a Raul
    const beforeCount = sent.length;
    const snoozeRun = await processDueMibotSchedules({
        db,
        sendTelegramFn: mockSend,
        nowSqlOverride: '2099-01-01 00:00:00'
    });
    assert.equal(snoozeRun.snoozedProcessed, 1);
    assert.equal(sent.length, beforeCount + 1);
    assert.equal(sent[sent.length - 1].chatId, '1001');
    assert.match(sent[sent.length - 1].html, /Recordatorio pospuesto/);

    // Ambos validan -> la programación UNA_VEZ pasa a COMPLETADO
    await handleMibotCallbackQuery({
        db,
        cq: { id: 'cq-val-1', data: `mibot:validar:${destRaul.id}`, from: { id: 1001 }, message: { chat: { id: 1001 }, message_id: 701 } },
        tgUser: { id: 1, telegram_user_id: '1001', activo: 1 },
        transport
    });
    assert.equal(db._state.programaciones[0].estado, 'ENVIADO');

    await handleMibotCallbackQuery({
        db,
        cq: { id: 'cq-val-2', data: `mibot:validar:${destCorina.id}`, from: { id: 1002 }, message: { chat: { id: 1002 }, message_id: 702 } },
        tgUser: { id: 2, telegram_user_id: '1002', activo: 1 },
        transport
    });
    assert.equal(db._state.programaciones[0].estado, 'COMPLETADO');
    assert.ok(edits.length >= 3);
});

test('dispatchMibotProgramacion reporta error limpio si un destinatario falla sin detener a los demás', async () => {
    const tgUsers = [
        { id: 1, telegram_user_id: '1001', first_name: 'Raul', last_name: 'Sosa', activo: 1, recibir_mibot: 1 },
        { id: 2, telegram_user_id: '1002', first_name: 'Corina', last_name: 'Sosa', activo: 1, recibir_mibot: 1 }
    ];
    const db = createMockMibotDb({ tgUsers });

    const created = await createMibotProgramacion({
        db,
        payload: {
            tipo: 'TAREA',
            titulo: 'Enviar estados financieros',
            mensaje: 'Favor subir cierre antes de las 4 PM.',
            destinatario_ids: [1, 2],
            programado_para: '2026-11-21 09:00:00'
        }
    });

    const dispatchRes = await dispatchMibotProgramacion({
        db,
        programacionId: created.programacion.id,
        sendTelegramFn: async (chatId) => {
            if (chatId === '1002') throw new Error('Forbidden: bot was blocked by the user');
            return { message_id: 888 };
        }
    });

    assert.equal(dispatchRes.sent, 1);
    assert.equal(dispatchRes.failed, 1);
    const d1 = db._state.destinatarios.find(d => d.telegram_user_id === '1001');
    const d2 = db._state.destinatarios.find(d => d.telegram_user_id === '1002');
    assert.equal(d1.estado_entrega, 'ENVIADO');
    assert.equal(d2.estado_entrega, 'ERROR');
    assert.match(d2.error_msg, /blocked by the user/i);
});
