const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseNaturalLanguageQuery } = require('../services/telegramTextAndDates');
const {
    normalizeScheduleDatetime,
    dbDatetimeToSvSql,
    formatDisplayDateTimeSv,
    getMibotProgramacionById,
    rescheduleMibotProgramacion,
    cancelMibotProgramacion
} = require('../services/mibotNotifierService');
const {
    pendingEventWizards,
    lastScheduledEventByUser,
    extractDateAndTimeFromSpanish,
    parseScheduleEventInput,
    startEventScheduleWizard,
    handleActiveProductivityWizardMessage,
    handleProductivityCallbackQuery,
    handleRescheduleEventNaturalLanguage
} = require('../services/telegramProductivityService');

/**
 * Pool MySQL en memoria que simula el comportamiento real de mysql2 con timezone:'Z'
 * (devolviendo objetos Date UTC cuyos campos UTC representan la hora local almacenada en DATETIME).
 */
function createRealisticMibotMockDb({ users = [], tgUsers = [], programaciones = [], destinatarios = [] } = {}) {
    const progs = programaciones.map(p => ({ ...p }));
    const dests = destinatarios.map(d => ({ ...d }));
    let nextProgId = progs.reduce((m, p) => Math.max(m, Number(p.id || 0)), 0) + 1;
    let nextDestId = dests.reduce((m, d) => Math.max(m, Number(d.id || 0)), 0) + 1;

    const toMysql2UtcDate = (sqlStr) => {
        if (!sqlStr || sqlStr instanceof Date) return sqlStr;
        const m = String(sqlStr).match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/);
        if (!m) return sqlStr;
        return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
    };

    const db = {
        _state: { progs, dests },
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
                return [users.map(u => {
                    const tg = tgUsers.find(t => Number(t.user_id) === Number(u.id) && Number(t.activo) === 1);
                    return {
                        user_id: u.id,
                        username: u.username,
                        sipe_nombre: u.nombre,
                        status: 'active',
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
                })];
            }

            if (/FROM telegram_usuarios WHERE activo = 1 AND user_id IS NULL/i.test(q)) {
                return [tgUsers.filter(t => Number(t.activo) === 1 && !t.user_id)];
            }

            if (/FROM telegram_usuarios tu/i.test(q) && /WHERE tu\.id IN/i.test(q)) {
                const set = new Set(params.map(Number));
                return [tgUsers.filter(t => set.has(Number(t.id)) && Number(t.activo) === 1)];
            }

            if (/^INSERT INTO mibot_programaciones\b/i.test(q)) {
                const id = nextProgId++;
                progs.push({
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
                    // Simula lectura real de mysql2 (timezone:'Z'): Date con los componentes locales en UTC
                    programado_para: toMysql2UtcDate(params[9]),
                    proximo_envio_at: toMysql2UtcDate(params[10]),
                    frecuencia: params[11],
                    estado: 'PROGRAMADO',
                    ultimo_envio_at: null,
                    total_envios: 0,
                    created_by_user_id: params[12],
                    created_by_name: params[13],
                    task_id: params[14] || null
                });
                return [{ insertId: id, affectedRows: 1 }];
            }

            if (/^INSERT INTO mibot_programaciones_destinatarios\b/i.test(q)) {
                const id = nextDestId++;
                dests.push({
                    id,
                    programacion_id: Number(params[0]),
                    telegram_usuario_id: Number(params[1]),
                    telegram_user_id: String(params[2]),
                    nombre_destinatario: params[3],
                    cargo: params[4],
                    estado_entrega: 'PENDIENTE',
                    enviado_at: null,
                    respondido_at: null,
                    pospuesto_hasta: null
                });
                return [{ insertId: id, affectedRows: 1 }];
            }

            if (/^SELECT \* FROM mibot_programaciones WHERE id = \?/i.test(q)) {
                return [progs.filter(p => Number(p.id) === Number(params[0])).map(p => ({ ...p }))];
            }

            if (/^SELECT \* FROM mibot_programaciones_destinatarios WHERE programacion_id = \?/i.test(q)) {
                return [dests.filter(d => Number(d.programacion_id) === Number(params[0])).map(d => ({ ...d }))];
            }

            if (/^SELECT p\.id FROM mibot_programaciones p WHERE p\.estado IN/i.test(q)) {
                const active = progs
                    .filter(p => ['PROGRAMADO', 'ENVIADO'].includes(p.estado))
                    .sort((a, b) => b.id - a.id);
                return [active.slice(0, 1).map(p => ({ id: p.id }))];
            }

            if (/^UPDATE mibot_programaciones SET programado_para = \?, proximo_envio_at = \?, estado = 'PROGRAMADO' WHERE id = \?/i.test(q)) {
                const row = progs.find(p => Number(p.id) === Number(params[2]));
                if (row) {
                    row.programado_para = toMysql2UtcDate(params[0]);
                    row.proximo_envio_at = toMysql2UtcDate(params[1]);
                    row.estado = 'PROGRAMADO';
                }
                return [{ affectedRows: row ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones SET estado = 'CANCELADO', proximo_envio_at = NULL WHERE id = \?/i.test(q)) {
                const row = progs.find(p => Number(p.id) === Number(params[0]));
                if (row) {
                    row.estado = 'CANCELADO';
                    row.proximo_envio_at = null;
                }
                return [{ affectedRows: row ? 1 : 0 }];
            }

            if (/^UPDATE mibot_programaciones_destinatarios SET estado_entrega = 'PENDIENTE'/i.test(q)) {
                return [{ affectedRows: 0 }];
            }

            return [[]];
        }
    };
    return db;
}

describe('MiBot Timezone Fix, Hora Personalizada y Entrenamiento NLU en Español', () => {
    const REF_NOW = '2026-11-24 10:30:00'; // Martes 24/11/2026 10:30 AM El Salvador

    it('1. Corrige el bug de -6 horas al leer DATETIME de MySQL (timezone: Z)', async () => {
        // MySQL guarda '2026-11-25 08:00:00'; mysql2 con timezone:'Z' devuelve Date('2026-11-25T08:00:00.000Z')
        const mysql2Date = new Date('2026-11-25T08:00:00.000Z');
        assert.equal(dbDatetimeToSvSql(mysql2Date), '2026-11-25 08:00:00');
        assert.equal(formatDisplayDateTimeSv(dbDatetimeToSvSql(mysql2Date)), '25/11/2026 08:00 AM');

        // Instante real UTC sigue convirtiéndose a El Salvador (UTC-6) con normalizeScheduleDatetime
        assert.equal(normalizeScheduleDatetime(new Date('2026-11-25T14:00:00.000Z')), '2026-11-25 08:00:00');

        const mockDb = createRealisticMibotMockDb({
            programaciones: [{
                id: 50,
                tipo: 'REUNION',
                titulo: 'Reunión Bancovi',
                mensaje: 'Reunión Bancovi',
                programado_para: new Date('2026-11-25T08:00:00.000Z'),
                proximo_envio_at: new Date('2026-11-25T08:00:00.000Z'),
                frecuencia: 'UNA_VEZ',
                estado: 'PROGRAMADO',
                created_by_user_id: 1
            }]
        });

        const loaded = await getMibotProgramacionById(mockDb, 50);
        assert.equal(loaded.programado_para, '2026-11-25 08:00:00');
        assert.equal(formatDisplayDateTimeSv(loaded.programado_para), '25/11/2026 08:00 AM');
    });

    it('2. Entiende expresiones naturales ricas de fecha y hora en español', () => {
        // Relativas
        const r30 = extractDateAndTimeFromSpanish('avísame en 30 minutos revisar caja', REF_NOW);
        assert.equal(r30.timeExplicit, true);
        assert.equal(r30.dateExplicit, true);
        assert.equal(r30.targetDate, '2026-11-24');
        assert.equal(r30.timeHHMM, '11:00');

        const rHalf = extractDateAndTimeFromSpanish('en media hora llamar al banco', REF_NOW);
        assert.equal(rHalf.timeHHMM, '11:00');

        const r2h = extractDateAndTimeFromSpanish('en 2 horas y media', REF_NOW);
        assert.equal(r2h.timeHHMM, '13:00');

        const r1h15 = extractDateAndTimeFromSpanish('dentro de 1h15', REF_NOW);
        assert.equal(r1h15.timeHHMM, '11:45');

        // Coloquiales
        const mediodia = extractDateAndTimeFromSpanish('mañana al mediodía', REF_NOW);
        assert.equal(mediodia.targetDate, '2026-11-25');
        assert.equal(mediodia.timeHHMM, '12:00');

        const yMedia = extractDateAndTimeFromSpanish('hoy a las 2 y media', REF_NOW);
        assert.equal(yMedia.targetDate, '2026-11-24');
        assert.equal(yMedia.timeHHMM, '14:30');

        const yCuarto = extractDateAndTimeFromSpanish('el viernes a las 10 y cuarto', REF_NOW);
        assert.equal(yCuarto.targetDate, '2026-11-27');
        assert.equal(yCuarto.timeHHMM, '10:15');

        const menosCuarto = extractDateAndTimeFromSpanish('mañana 4 menos cuarto de la tarde', REF_NOW);
        assert.equal(menosCuarto.targetDate, '2026-11-25');
        assert.equal(menosCuarto.timeHHMM, '15:45');

        const hFormat = extractDateAndTimeFromSpanish('25/11 14h30', REF_NOW);
        assert.equal(hFormat.targetDate, '2026-11-25');
        assert.equal(hFormat.timeHHMM, '14:30');

        const dotPm = extractDateAndTimeFromSpanish('hoy 2.30 pm', REF_NOW);
        assert.equal(dotPm.targetDate, '2026-11-24');
        assert.equal(dotPm.timeHHMM, '14:30');

        const bareDay = extractDateAndTimeFromSpanish('el 28 a las 3 de la tarde', REF_NOW);
        assert.equal(bareDay.targetDate, '2026-11-28');
        assert.equal(bareDay.timeHHMM, '15:00');

        const tardeHint = extractDateAndTimeFromSpanish('mañana por la tarde', REF_NOW);
        assert.equal(tardeHint.targetDate, '2026-11-25');
        assert.equal(tardeHint.timeHHMM, '14:00');
        assert.equal(tardeHint.timeExplicit, true);

        // Hora digitada directa (allowBareHour: true vs false)
        const bare3 = extractDateAndTimeFromSpanish('3', REF_NOW, { allowBareHour: true });
        assert.equal(bare3.timeExplicit, true);
        assert.equal(bare3.timeHHMM, '15:00');

        const bare1445 = extractDateAndTimeFromSpanish('mañana 14 45', REF_NOW, { allowBareHour: true });
        assert.equal(bare1445.targetDate, '2026-11-25');
        assert.equal(bare1445.timeHHMM, '14:45');

        const noFalseBare = extractDateAndTimeFromSpanish('revisar 3 facturas', REF_NOW, { allowBareHour: false });
        assert.equal(noFalseBare.timeExplicit, false);
    });

    it('3. Preserva "Reunión Bancovi" y clasifica intents NLU de agendar y cambiar hora sin regresiones', () => {
        const candidates = [
            { key: 'u_1', user_id: 1, telegram_usuario_id: 10, telegram_user_id: '1001', nombre: 'Raul Sosa', has_telegram: true, recibir_mibot: true },
            { key: 'u_2', user_id: 2, telegram_usuario_id: 11, telegram_user_id: '1002', nombre: 'Cory', has_telegram: true, recibir_mibot: true },
            { key: 'u_3', user_id: 3, telegram_usuario_id: 12, telegram_user_id: '1003', nombre: 'Marcela Sosa', has_telegram: true, recibir_mibot: true }
        ];

        const pBancovi = parseScheduleEventInput('Reunión Bancovi', candidates, 10, REF_NOW);
        assert.equal(pBancovi.titulo, 'Reunión Bancovi');
        assert.equal(pBancovi.timeExplicit, false);

        const pConBancovi = parseScheduleEventInput('Reunión con Bancovi mañana 2:30 pm', candidates, 10, REF_NOW);
        assert.equal(pConBancovi.titulo, 'Reunión con Bancovi');
        assert.equal(pConBancovi.timeExplicit, true);
        assert.equal(pConBancovi.programado_para, '2026-11-25 14:30:00');

        const pAvisame = parseScheduleEventInput('Avísame en 45 minutos llamar al banco', candidates, 10, REF_NOW);
        assert.equal(pAvisame.titulo, 'Llamar al banco');
        assert.equal(pAvisame.programado_para, '2026-11-24 11:15:00');

        // Intents NLU nuevos
        assert.equal(parseNaturalLanguageQuery('Cambiar la hora').isCambiarHoraEvento, true);
        assert.equal(parseNaturalLanguageQuery('Cambiar la hora a las 2:30 pm').isCambiarHoraEvento, true);
        assert.equal(parseNaturalLanguageQuery('Cámbiala a las 4 pm').isCambiarHoraEvento, true);
        assert.equal(parseNaturalLanguageQuery('Mejor mañana a las 10am').isCambiarHoraEvento, true);
        assert.equal(parseNaturalLanguageQuery('Reprogramar para el viernes a mediodía').isCambiarHoraEvento, true);

        assert.equal(parseNaturalLanguageQuery('Avísame en 30 minutos llamar al banco').isAgendarEvento, true);
        assert.equal(parseNaturalLanguageQuery('Ponme un recordatorio el viernes a mediodía revisar cierre').isAgendarEvento, true);
        assert.equal(parseNaturalLanguageQuery('Tengo una reunión Bancovi mañana a las 3 y media').isAgendarEvento, true);
        assert.equal(parseNaturalLanguageQuery('No me dejes olvidar pagar luz hoy 4pm').isAgendarEvento, true);

        // Cero regresiones en consultas operativas y agenda
        const pVentasHora = parseNaturalLanguageQuery('Ventas por hora de ayer en Costa del Sol');
        assert.equal(pVentasHora.isCambiarHoraEvento, false);
        assert.equal(pVentasHora.isAgendarEvento, false);

        const pQueReu = parseNaturalLanguageQuery('Que reuniones tengo esta semana');
        assert.equal(pQueReu.isAgendarEvento, false);
        assert.equal(pQueReu.isEventosAgenda, true);
    });

    it('4. Asistente en 2 pasos pide fecha/hora cuando falta, acepta hora digitada y permite reprogramar/cancelar', async () => {
        pendingEventWizards.clear();
        lastScheduledEventByUser.clear();

        const raul = { id: 10, user_id: 1, telegram_user_id: '55501', first_name: 'Raul', last_name: 'Sosa', activo: 1, recibir_mibot: 1 };
        const cory = { id: 11, user_id: 2, telegram_user_id: '55502', first_name: 'Cory', last_name: '', activo: 1, recibir_mibot: 1 };
        const marcela = { id: 12, user_id: 3, telegram_user_id: '55503', first_name: 'Marcela', last_name: 'Sosa', activo: 1, recibir_mibot: 1 };
        const mockDb = createRealisticMibotMockDb({
            users: [
                { id: 1, nombre: 'Raul Sosa', username: 'rsosa', role_name: 'Administrator' },
                { id: 2, nombre: 'Cory', username: 'cory', role_name: 'Dirección' },
                { id: 3, nombre: 'Marcela Sosa', username: 'msosa', role_name: 'Finanzas' }
            ],
            tgUsers: [raul, cory, marcela]
        });

        const sent = [];
        const answers = [];
        const transport = {
            sendTelegramMessage: async (cid, html, markup) => {
                sent.push({ chatId: String(cid), html, markup });
                return { message_id: sent.length };
            },
            answerCallbackQuery: async (_id, text) => answers.push(text),
            editMessageReplyMarkup: async () => {},
            getMainReplyKeyboard: () => ({ keyboard: [] })
        };
        const effPerms = { isAdmin: true, tareas: true, linkedUser: { id: 1, nombre: 'Raul Sosa', username: 'rsosa' } };

        // 1) Abrir wizard y seleccionar a Cory y Marcela
        await startEventScheduleWizard({ db: mockDb, chatId: '55501', tgUser: raul, defaultTipo: 'REUNION', transport });
        const wiz = pendingEventWizards.get('55501');
        wiz.selectedTgIds = [11, 12];

        // 2) Usuario escribe solo "Reunión Bancovi" (sin hora) -> NO guarda a las 08:00, pasa a ENTER_DATETIME
        const handledStep1 = await handleActiveProductivityWizardMessage({
            db: mockDb,
            rawText: 'Reunión Bancovi',
            chatId: '55501',
            user: raul,
            effectivePerms: effPerms,
            transport,
            referenceNowSv: REF_NOW,
            skipAiFallback: true
        });
        assert.equal(handledStep1, true);
        assert.equal(mockDb._state.progs.length, 0);
        assert.equal(pendingEventWizards.get('55501')?.step, 'ENTER_DATETIME');
        assert.match(sent[sent.length - 1].html, /QUÉ DÍA Y A QUÉ HORA/i);
        assert.match(sent[sent.length - 1].html, /Reunión Bancovi/);

        // 3) Usuario digita fecha y hora exacta: "mañana 2:30 pm"
        const handledStep2 = await handleActiveProductivityWizardMessage({
            db: mockDb,
            rawText: 'mañana 2:30 pm',
            chatId: '55501',
            user: raul,
            effectivePerms: effPerms,
            transport,
            referenceNowSv: REF_NOW,
            skipAiFallback: true
        });
        assert.equal(handledStep2, true);
        assert.equal(pendingEventWizards.has('55501'), false);
        assert.equal(mockDb._state.progs.length, 1);

        const confirmMsg = sent[sent.length - 1];
        assert.match(confirmMsg.html, /Reunión Bancovi/);
        // Verifica que muestra 02:30 PM exacto (sin desfase -6h de mysql2 Date!)
        assert.match(confirmMsg.html, /25\/11\/2026 02:30 PM/);
        const firstRowCallbacks = confirmMsg.markup.inline_keyboard[0].map(b => b.callback_data);
        assert.deepEqual(firstRowCallbacks, ['tg_evt:re:1', 'tg_evt:del:1']);

        // 4) Usuario dice "Cambiar la hora" (escenario exacto de la captura!) -> abre paso RESCHEDULE_TIME
        await handleRescheduleEventNaturalLanguage({
            db: mockDb,
            rawText: 'Cambiar la hora',
            chatId: '55501',
            user: raul,
            effectivePerms: effPerms,
            transport,
            referenceNowSv: REF_NOW,
            skipAiFallback: true
        });
        assert.equal(pendingEventWizards.get('55501')?.step, 'RESCHEDULE_TIME');
        assert.match(sent[sent.length - 1].html, /CAMBIAR FECHA \/ HORA/i);

        // 5) Usuario digita solo la nueva hora "3:45 pm" -> conserva fecha 25/11/2026 y actualiza a 03:45 PM
        await handleActiveProductivityWizardMessage({
            db: mockDb,
            rawText: '3:45 pm',
            chatId: '55501',
            user: raul,
            effectivePerms: effPerms,
            transport,
            referenceNowSv: REF_NOW,
            skipAiFallback: true
        });
        assert.equal(pendingEventWizards.has('55501'), false);
        assert.match(sent[sent.length - 1].html, /25\/11\/2026 03:45 PM/);

        // 6) Cambio de hora en 1 solo mensaje natural ("Mejor el viernes a las 10 y cuarto")
        await handleRescheduleEventNaturalLanguage({
            db: mockDb,
            rawText: 'Mejor el viernes a las 10 y cuarto',
            chatId: '55501',
            user: raul,
            effectivePerms: effPerms,
            transport,
            referenceNowSv: REF_NOW,
            skipAiFallback: true
        });
        assert.match(sent[sent.length - 1].html, /27\/11\/2026 10:15 AM/);

        // 7) Seguridad fail-closed: usuario tercero no autorizado no puede editar ni cancelar
        const intruder = { id: 99, user_id: 99, telegram_user_id: '99999', first_name: 'Externo', activo: 1 };
        await handleProductivityCallbackQuery({
            db: mockDb,
            cq: { id: 'cq_unauth', data: 'tg_evt:re:1', message: { chat: { id: '99999' }, message_id: 5 } },
            tgUser: intruder,
            effPerms: { isAdmin: false, tareas: false, linkedUser: { id: 99 } },
            transport
        });
        assert.match(answers[answers.length - 1], /No tienes permiso/i);

        await assert.rejects(
            () => rescheduleMibotProgramacion({
                db: mockDb,
                programacionId: 1,
                programadoPara: '2026-11-28 09:00:00',
                actorTgUserId: '99999',
                actorSipeUserId: 99,
                isAdmin: false
            }),
            /permiso/i
        );

        // 8) Cancelar evento con botón inline por su creador
        await handleProductivityCallbackQuery({
            db: mockDb,
            cq: { id: 'cq_del', data: 'tg_evt:del:1', message: { chat: { id: '55501' }, message_id: 6 } },
            tgUser: raul,
            effPerms,
            transport
        });
        const afterCancel = await getMibotProgramacionById(mockDb, 1);
        assert.equal(afterCancel.estado, 'CANCELADO');
        assert.equal(afterCancel.proximo_envio_at, null);

        // Validar que no se puede reprogramar un evento ya cancelado
        await assert.rejects(
            () => rescheduleMibotProgramacion({
                db: mockDb,
                programacionId: 1,
                programadoPara: '2026-11-29 10:00:00',
                actorTgUserId: '55501',
                actorSipeUserId: 1,
                isAdmin: true
            }),
            /cancelado/i
        );
        await assert.doesNotReject(() => cancelMibotProgramacion({
            db: mockDb,
            programacionId: 1,
            actorTgUserId: '55501',
            actorSipeUserId: 1,
            isAdmin: true
        }));

        pendingEventWizards.clear();
        lastScheduledEventByUser.clear();
    });
});
