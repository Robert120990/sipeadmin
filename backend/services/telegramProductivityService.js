const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);

const {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    normalizeText,
    shiftDate,
    parseSpanishDateText,
    SPANISH_MONTH_NAMES
} = require('./telegramTextAndDates');

const recordatoriosPagosService = require('./recordatoriosPagosService');

const {
    MIBOT_TIPOS,
    TIPO_META,
    FRECUENCIA_LABELS,
    getElSalvadorNowSql,
    addMinutesToSvSql,
    formatDisplayDateTimeSv,
    createMibotProgramacion,
    getRealtimeIo
} = require('./mibotNotifierService');

const getSvToday = () => getElSalvadorNowSql().slice(0, 10);

const {
    sendTelegramMessage,
    answerCallbackQuery,
    editMessageReplyMarkup,
    sendChatAction,
    getMainReplyKeyboard
} = require('./telegramTransportService');

const WIZARD_TTL_MS = 30 * 60 * 1000;
const pendingTaskWizards = new Map();
const pendingEventWizards = new Map();

const PRIORIDAD_META = {
    urgente: { label: 'URGENTE', emoji: '🔥' },
    alta: { label: 'ALTA', emoji: '🟠' },
    media: { label: 'MEDIA', emoji: '🔵' },
    baja: { label: 'BAJA', emoji: '⚪' }
};

const WEEKDAY_INDEX = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6
};

const NAME_STOP_TOKENS = new Set([
    'de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'o', 'a', 'en', 'por',
    'para', 'con', 'sin', 'que', 'una', 'uno', 'san', 'sipe', 'admin', 'bot'
]);

function getActiveWizard(map, telegramUserId) {
    if (!telegramUserId) return null;
    const key = String(telegramUserId);
    const entry = map.get(key);
    if (!entry) return null;
    if (Date.now() - (entry.updatedAt || entry.timestamp || 0) > WIZARD_TTL_MS) {
        map.delete(key);
        return null;
    }
    return entry;
}

function clearProductivityWizards(telegramUserId) {
    if (!telegramUserId) return;
    const key = String(telegramUserId);
    pendingTaskWizards.delete(key);
    pendingEventWizards.delete(key);
}

function pruneWizardMap(map, maxEntries = 500, nowMs = Date.now()) {
    let removed = 0;
    for (const [key, entry] of map.entries()) {
        const ts = entry?.updatedAt || entry?.timestamp || 0;
        if (nowMs - ts > WIZARD_TTL_MS) {
            map.delete(key);
            removed += 1;
        }
    }
    const cap = Math.max(1, Number(maxEntries) || 500);
    while (map.size > cap) {
        const oldestKey = map.keys().next().value;
        if (oldestKey === undefined) break;
        map.delete(oldestKey);
        removed += 1;
    }
    return removed;
}

function pruneProductivityWizards(maxEntries = 500) {
    const now = Date.now();
    return (
        pruneWizardMap(pendingTaskWizards, maxEntries, now) +
        pruneWizardMap(pendingEventWizards, maxEntries, now)
    );
}

function formatShortDM(ymd) {
    const clean = String(ymd || '').slice(0, 10);
    const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}` : clean;
}

function format12HourTime(hhmm) {
    if (!hhmm) return '';
    const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return String(hhmm);
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${min} ${ap}`;
}

/**
 * Resuelve candidatos activos de colaboración (usuarios SIPE + usuarios Telegram)
 */
async function resolveCollaboratorCandidates(db) {
    if (!db) return [];
    const byUserId = new Map();
    const tgOnly = [];

    try {
        const [rows] = await db.query(`
            SELECT
                u.id AS user_id,
                u.username,
                u.nombre AS sipe_nombre,
                u.status,
                r.name AS role_name,
                tu.id AS telegram_usuario_id,
                tu.telegram_user_id,
                tu.telegram_username,
                tu.first_name,
                tu.last_name,
                tu.cargo,
                tu.recibir_mibot,
                tu.activo AS tg_activo
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN telegram_usuarios tu ON tu.user_id = u.id AND tu.activo = 1
            WHERE u.status = 'active' OR u.status IS NULL
            ORDER BY COALESCE(NULLIF(TRIM(u.nombre), ''), u.username) ASC,
                     COALESCE(tu.recibir_mibot, 0) DESC,
                     tu.id ASC
        `);

        for (const row of (rows || [])) {
            const uid = Number(row.user_id);
            if (!Number.isFinite(uid) || uid <= 0) continue;
            const tgFull = `${row.first_name || ''} ${row.last_name || ''}`.trim();
            const displayName = String(row.sipe_nombre || tgFull || row.username || `Usuario #${uid}`).trim();
            const candidate = {
                key: `u_${uid}`,
                user_id: uid,
                telegram_usuario_id: row.telegram_usuario_id ? Number(row.telegram_usuario_id) : null,
                telegram_user_id: row.telegram_user_id ? String(row.telegram_user_id) : null,
                nombre: displayName,
                username: row.username || null,
                telegram_username: row.telegram_username || null,
                role_name: row.role_name || null,
                cargo: row.cargo || row.role_name || null,
                has_telegram: Boolean(row.telegram_usuario_id && row.telegram_user_id),
                recibir_mibot: Boolean(row.telegram_usuario_id ? (row.recibir_mibot ?? 1) : false),
                telegramOnly: false
            };

            const existing = byUserId.get(uid);
            if (!existing || (!existing.has_telegram && candidate.has_telegram)) {
                byUserId.set(uid, candidate);
            }
        }
    } catch (err) {
        console.warn('[TelegramProductivity] Error cargando usuarios SIPE:', err.message);
    }

    try {
        const [unlinkedRows] = await db.query(`
            SELECT id, telegram_user_id, telegram_username, first_name, last_name, cargo, recibir_mibot
            FROM telegram_usuarios
            WHERE activo = 1 AND user_id IS NULL
            ORDER BY COALESCE(NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''), telegram_username) ASC
        `);

        for (const r of (unlinkedRows || [])) {
            const tgId = Number(r.id);
            const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.telegram_username || `Telegram #${tgId}`;
            tgOnly.push({
                key: `tg_${tgId}`,
                user_id: null,
                telegram_usuario_id: tgId,
                telegram_user_id: String(r.telegram_user_id),
                nombre: fullName,
                username: null,
                telegram_username: r.telegram_username || null,
                role_name: null,
                cargo: r.cargo || 'Telegram',
                has_telegram: true,
                recibir_mibot: Boolean(r.recibir_mibot ?? 1),
                telegramOnly: true
            });
        }
    } catch (err) {
        console.warn('[TelegramProductivity] Error cargando usuarios solo Telegram:', err.message);
    }

    return [...byUserId.values(), ...tgOnly];
}

/**
 * Extrae hora (HH:mm) y fecha (YYYY-MM-DD) de texto en español sin depender de timezone del host
 */
function extractDateAndTimeFromSpanish(rawText = '', referenceNowSv = null) {
    const refNow = referenceNowSv || getElSalvadorNowSql();
    const todaySv = String(refNow).slice(0, 10);
    const curHour = Number(String(refNow).slice(11, 13)) || 8;
    const curMin = Number(String(refNow).slice(14, 16)) || 0;
    const norm = normalizeText(rawText);
    const rawForTime = String(rawText || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    let timeHHMM = null;
    let timeExplicit = false;

    // 1. Detección de hora explícita (ej. "10:30 am", "a las 3 pm", "15:00", "a las 8 de la manana")
    const timeRegexes = [
        /\b(?:a\s+las?|para\s+las?|alas)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.\s*m\.?|p\.\s*m\.?)\b/i,
        /\b(?:a\s+las?|a\s+la|para\s+las?|alas)\s*(\d{1,2})(?::(\d{2}))?\s*(?:de\s+la\s+(manana|tarde|noche)|hrs?|horas?)?\b/i,
        /\b(\d{1,2}):(\d{2})\s*(?:hrs?|horas?)?\b/i
    ];

    for (const re of timeRegexes) {
        const m = rawForTime.match(re);
        if (m) {
            let h = parseInt(m[1], 10);
            const min = m[2] ? parseInt(m[2], 10) : 0;
            const period = (m[3] || '').toLowerCase().replace(/\./g, '').trim();
            if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
                if (period.startsWith('pm') || period === 'tarde' || period === 'noche') {
                    if (h < 12) h += 12;
                } else if (period.startsWith('am') || period === 'manana') {
                    if (h === 12) h = 0;
                } else if (!m[2] && h >= 1 && h <= 6) {
                    // "a las 3" normalmente es 3:00 PM en horario laboral
                    h += 12;
                }
                timeHHMM = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
                timeExplicit = true;
                break;
            }
        }
    }

    // 2. Detección de fecha explícita (evitando confundir "de la manana" con "mañana")
    const normWithoutPeriodOfDay = norm.replace(/\b(?:de|por|en)\s+la\s+manana\b/gi, ' ');
    let targetDate = null;
    let dateExplicit = false;

    if (/\bpasado\s+manana\b/i.test(normWithoutPeriodOfDay)) {
        targetDate = shiftDate(todaySv, 2);
        dateExplicit = true;
    } else if (/\bmanana\b/i.test(normWithoutPeriodOfDay)) {
        targetDate = shiftDate(todaySv, 1);
        dateExplicit = true;
    } else if (/\b(?:para\s+)?hoy\b/i.test(normWithoutPeriodOfDay)) {
        targetDate = todaySv;
        dateExplicit = true;
    } else {
        const inDaysMatch = normWithoutPeriodOfDay.match(/\ben\s+(\d{1,2})\s+dias?\b/i);
        if (inDaysMatch) {
            targetDate = shiftDate(todaySv, Math.min(90, Math.max(1, parseInt(inDaysMatch[1], 10))));
            dateExplicit = true;
        } else {
            const explicitSpanDate = parseSpanishDateText(rawText, todaySv);
            if (explicitSpanDate) {
                targetDate = explicitSpanDate;
                dateExplicit = true;
            } else {
                const weekdayMatch = normWithoutPeriodOfDay.match(/\b(?:el\s+|este\s+|proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/i);
                if (weekdayMatch) {
                    const targetDow = WEEKDAY_INDEX[weekdayMatch[1].toLowerCase()];
                    const [yy, mm, dd] = todaySv.split('-').map(Number);
                    const curDow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
                    let delta = (targetDow - curDow + 7) % 7;
                    if (delta === 0 || /\bproximo\b/i.test(weekdayMatch[0])) {
                        delta = delta === 0 ? 7 : delta;
                    }
                    targetDate = shiftDate(todaySv, delta);
                    dateExplicit = true;
                }
            }
        }
    }

    if (!dateExplicit) {
        if (timeExplicit) {
            const [th, tm] = timeHHMM.split(':').map(Number);
            const isLaterToday = th > curHour || (th === curHour && tm > curMin + 5);
            targetDate = isLaterToday ? todaySv : shiftDate(todaySv, 1);
        } else {
            targetDate = shiftDate(todaySv, 1);
        }
    }

    return {
        todaySv,
        targetDate,
        dateExplicit,
        timeHHMM: timeHHMM || null,
        timeExplicit
    };
}

/**
 * Busca candidatos que coincidan con un segmento textual de nombres
 */
function buildCandidateSearchTokens(candidate) {
    const tokens = [];
    const rawNames = [
        candidate.nombre,
        candidate.username,
        candidate.telegram_username ? String(candidate.telegram_username).replace(/^@/, '') : null
    ].filter(Boolean);

    const fullNorm = normalizeText(candidate.nombre || '');
    if (fullNorm) tokens.push({ value: fullNorm, weight: fullNorm.length + 10 });

    for (const src of rawNames) {
        const clean = normalizeText(src);
        for (const tok of clean.split(/\s+/)) {
            if (tok.length >= 3 && !NAME_STOP_TOKENS.has(tok)) {
                tokens.push({ value: tok, weight: tok.length });
            }
        }
    }

    // Eliminar duplicados preservando mayor peso
    const unique = new Map();
    for (const t of tokens) {
        if (!unique.has(t.value) || unique.get(t.value) < t.weight) {
            unique.set(t.value, t.weight);
        }
    }
    return [...unique.entries()].map(([value, weight]) => ({ value, weight }));
}

function matchSingleCandidateSegment(segment, candidates = []) {
    const normSeg = normalizeText(segment).replace(/^@+/, '').trim();
    if (!normSeg || normSeg.length < 3) return null;

    let best = null;
    let bestScore = 0;

    for (const cand of candidates) {
        const candTokens = buildCandidateSearchTokens(cand);
        const fullNorm = normalizeText(cand.nombre || '');
        if (fullNorm && normSeg === fullNorm) {
            return cand;
        }
        for (const tok of candTokens) {
            if (normSeg === tok.value) {
                const score = tok.weight + 20;
                if (score > bestScore) {
                    bestScore = score;
                    best = cand;
                }
            } else if (normSeg.includes(tok.value) && tok.value.length >= 4) {
                const score = tok.weight;
                if (score > bestScore) {
                    bestScore = score;
                    best = cand;
                }
            }
        }
    }

    return best;
}

function splitAndMatchCandidates(chunkText, candidates = []) {
    const parts = String(chunkText || '')
        .split(/\s*(?:,|;|\by\b|\be\b)\s*/i)
        .map(s => s.trim())
        .filter(Boolean);

    const matched = [];
    const seenKeys = new Set();
    let unmatchedCount = 0;

    for (const part of parts) {
        const found = matchSingleCandidateSegment(part, candidates);
        if (found) {
            if (!seenKeys.has(found.key)) {
                seenKeys.add(found.key);
                matched.push(found);
            }
        } else {
            unmatchedCount += 1;
        }
    }

    return { matched, unmatchedCount };
}

/**
 * Limpia frases de fecha, hora, prioridad y conectores del título extraído
 */
function cleanExtractedTitle(rawBody = '') {
    let text = String(rawBody || '').trim();
    text = text
        .replace(/^[:\-\s]+/, '')
        .replace(/^(?:de|que|sobre)\s+(?=[a-zA-ZáéíóúñÁÉÍÓÚÑ])/i, '')
        .replace(/^para\s+(?=[a-zA-ZáéíóúñÁÉÍÓÚÑ]+(?:ar|er|ir)\b)/i, '')
        .replace(/\b(?:con\s+prioridad\s+|prioridad\s+)?(?:urgente|alta|alta\s+prioridad|prioridad\s+alta|media|baja)\b/gi, ' ')
        .replace(/\b(?:para\s+)?(?:pasado\s+manana|pasado\s+mañana|mañana|manana|hoy)\b/gi, ' ')
        .replace(/\b(?:para\s+)?(?:el|este|pr[oó]ximo)\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi, ' ')
        .replace(/\ben\s+\d{1,2}\s+d[ií]as?\b/gi, ' ')
        .replace(/\b(?:para\s+el\s+)?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/gi, ' ')
        .replace(/\b(?:para\s+el\s+)?\d{1,2}\s+de\s+[a-záéíóú]+(?:\s+(?:de|del)\s+\d{4})?\b/gi, ' ')
        .replace(/\b(?:a\s+las?|para\s+las?|a\s+la)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?\s*m\.?|p\.?\s*m\.?|de\s+la\s+(?:mañana|manana|tarde|noche)|hrs?|horas?)?\b/gi, ' ')
        .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?\s*m\.?|p\.?\s*m\.?)\b/gi, ' ')
        .replace(/\b(?:todos\s+los\s+d[ií]as|diario|diariamente|cada\s+semana|semanal(?:mente)?|una\s+sola\s+vez)\b/gi, ' ')
        .replace(/\s+(?:el|la|para|con|por|en|a)\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    return text;
}

function inferTaskCategory(rawText = '', defaultCat = 'Operaciones') {
    const norm = normalizeText(rawText);
    if (/\b(pago|pagos|banco|bancos|cheque|cheques|transferencia|factura|facturas|abono|contab|concilia|cxp|cxc|impuesto|iva|alcaldia)\b/i.test(norm)) {
        return 'Finanzas';
    }
    if (/\b(reparar|mantenimiento|bomba|dispensador|tanque|electric|planta|inversor|panel|solar|bateria|fuga|pintura)\b/i.test(norm)) {
        return 'Mantenimiento';
    }
    if (/\b(rrhh|empleado|planilla|contrato|permiso|cumpleanos|isss|afp|vacaciones)\b/i.test(norm)) {
        return 'Administrativo';
    }
    if (/\b(sistema|bot|telegram|servidor|internet|red|correo|pos|software)\b/i.test(norm)) {
        return 'Sistemas';
    }
    return defaultCat;
}

function inferPriority(rawText = '') {
    const norm = normalizeText(rawText);
    if (/\b(urgente|inmediato|inmediata|ya mismo|emergencia|critico|critica)\b/i.test(norm)) return 'urgente';
    if (/\b(prioridad alta|alta prioridad|muy importante|alta)\b/i.test(norm)) return 'alta';
    if (/\b(prioridad baja|baja prioridad|cuando pueda|baja)\b/i.test(norm)) return 'baja';
    return 'media';
}

/**
 * Parsea un comando o frase natural para asignar una tarea a 1 o más colaboradores.
 * Ej: "Asignar tarea a Raul y Corina revisar arqueo de Miraflores mañana 10am urgente"
 */
function parseMultiUserTaskInput(rawText = '', candidates = [], referenceNowSv = null) {
    const raw = String(rawText || '').trim();
    const { targetDate, dateExplicit, timeHHMM, timeExplicit } = extractDateAndTimeFromSpanish(raw, referenceNowSv);
    const prioridad = inferPriority(raw);
    const categoria = inferTaskCategory(raw, 'Operaciones');

    // Quitar prefijo de comando, verbo introductorio y sustantivo de tarea
    let remainder = raw
        .replace(/^\/?(?:asignar(?:_?tarea)?|nueva_?tarea|crear_?tarea)\s*/i, '')
        .replace(/^(?:por\s+favor\s+)?(?:asigna(?:le|les|me)?|asignar|crea(?:r)?|manda(?:le|r)?|pon(?:le|er)?)\s+/i, '')
        .replace(/^(?:una\s+|la\s+|estas?\s+)?(?:nueva\s+)?(?:tarea|tareas|actividad|actividades)\s+/i, '')
        .trim();

    let assignees = [];
    let bodyText = remainder;

    // Caso A: Separador explícito con ":" después de los destinatarios
    const colonMatch = remainder.match(/^(?:(?:a|para)\s+)?([^:\n]{2,140}):\s*(.+)$/i);
    if (colonMatch) {
        const res = splitAndMatchCandidates(colonMatch[1], candidates);
        if (res.matched.length > 0 && res.unmatchedCount === 0) {
            assignees = res.matched;
            bodyText = colonMatch[2].trim();
        }
    }

    // Caso B: Análisis token por token (con o sin preposición "a"/"para" previa)
    if (assignees.length === 0) {
        const afterPreposition = remainder.replace(/^(?:a|para)\s+/i, '').trim();
        const words = afterPreposition.split(/\s+/);
        const picked = [];
        const seen = new Set();
        let idx = 0;

        while (idx < words.length) {
            const rawWord = words[idx];
            const cleanWord = rawWord.replace(/[,:;]+$/, '');
            const normWord = normalizeText(cleanWord);

            // Conectores permitidos entre nombres siempre que siga otro nombre válido
            if (['y', 'e', 'con'].includes(normWord) && idx + 1 < words.length) {
                const nextClean = words[idx + 1].replace(/[,:;]+$/, '');
                if (matchSingleCandidateSegment(nextClean, candidates)) {
                    idx += 1;
                    continue;
                }
            }

            // Intentar coincidencia de 2 palabras (nombre + apellido) primero
            if (idx + 1 < words.length) {
                const twoWords = `${cleanWord} ${words[idx + 1].replace(/[,:;]+$/, '')}`;
                const twoNorm = normalizeText(twoWords);
                const fullMatch = candidates.find(c => normalizeText(c.nombre) === twoNorm);
                if (fullMatch) {
                    if (!seen.has(fullMatch.key)) {
                        seen.add(fullMatch.key);
                        picked.push(fullMatch);
                    }
                    idx += 2;
                    continue;
                }
            }

            const oneMatch = matchSingleCandidateSegment(cleanWord, candidates);
            if (oneMatch) {
                if (!seen.has(oneMatch.key)) {
                    seen.add(oneMatch.key);
                    picked.push(oneMatch);
                }
                idx += 1;
                if (rawWord.endsWith(':')) break;
                continue;
            }
            break;
        }

        if (picked.length > 0) {
            assignees = picked;
            bodyText = words.slice(idx).join(' ').trim();
        }
    }

    const titulo = cleanExtractedTitle(bodyText);

    return {
        assignees,
        titulo,
        descripcion: raw,
        fecha_vencimiento: targetDate,
        hora_limite: timeHHMM || '17:00',
        dateExplicit,
        timeExplicit,
        prioridad,
        categoria,
        isComplete: assignees.length > 0 && titulo.length >= 3
    };
}

/**
 * Construye una notificación en systema + Socket.io idéntica a POST /api/tasks
 */
async function emitSystemTaskNotification({ db, io, assignedToUserId, createdByUserId, creatorName, task, mibotStatusLabel = null }) {
    if (!db || !assignedToUserId || !task) return null;

    const notificationData = {
        taskId: Number(task.id),
        titulo: task.titulo,
        descripcion: task.descripcion || '',
        categoria: task.categoria || 'General',
        priority: task.prioridad || 'media',
        prioridad: task.prioridad || 'media',
        fecha_vencimiento: task.fecha_vencimiento,
        hora_limite: task.hora_limite || null,
        assigned_to: Number(assignedToUserId),
        assigned_user_name: task.assigned_user_name || 'Colaborador',
        created_by: Number(createdByUserId || assignedToUserId),
        created_user_name: creatorName || 'Telegram SIPE',
        mibot_status_label: mibotStatusLabel,
        link: '/dashboard/operaciones/tareas'
    };

    const title = 'Nueva Tarea / Actividad Asignada';
    const message = `${creatorName || 'Telegram SIPE'} te ha asignado: "${task.titulo}"`;

    let insertId = null;
    try {
        const [ins] = await db.query(
            `INSERT INTO notifications (user_id, type, title, message, data)
             VALUES (?, 'task_assigned', ?, ?, ?)`,
            [Number(assignedToUserId), title, message, JSON.stringify(notificationData)]
        );
        insertId = ins?.insertId || null;
    } catch (err) {
        console.warn('[TelegramProductivity] Error insertando notificación:', err.message);
    }

    const notification = {
        id: insertId,
        user_id: Number(assignedToUserId),
        type: 'task_assigned',
        title,
        message,
        data: notificationData,
        is_read: false,
        created_at: new Date().toISOString()
    };

    const activeIo = io || getRealtimeIo();
    if (activeIo) {
        try {
            activeIo.to(`user_${Number(assignedToUserId)}`).emit('notification:new', notification);
        } catch (_) {
            // Ignorar error de emisión individual
        }
    }

    return { notification, notificationData };
}

/**
 * Resuelve el actor SIPE (created_by INT NOT NULL en tasks) para asignaciones desde Telegram
 */
async function resolveActorSipeUserId(db, creatorTgUser, fallbackUserId = null) {
    if (creatorTgUser?.user_id) return Number(creatorTgUser.user_id);
    if (fallbackUserId) return Number(fallbackUserId);
    if (db) {
        try {
            const [rows] = await db.query(
                `SELECT id FROM users WHERE status = 'active' OR status IS NULL ORDER BY role_id ASC, id ASC LIMIT 1`
            );
            if (rows && rows[0]?.id) return Number(rows[0].id);
        } catch (_) {
            // Fallback seguro
        }
    }
    return 1;
}

/**
 * Crea tareas en `tasks` (1 fila por colaborador SIPE), programa/envía por MiBot Telegram
 * y emite tarjetas informativas en el sistema SIPE Admin.
 */
async function createMultiUserTasksFromTelegram({
    db,
    externalDb = null,
    io = null,
    creatorTgUser = null,
    creatorEffPerms = {},
    assignees = [],
    titulo = '',
    descripcion = '',
    fecha_vencimiento = null,
    hora_limite = '17:00',
    prioridad = 'media',
    categoria = 'Operaciones',
    enviar_ahora = true,
    programado_para = null,
    sendTelegramFn = sendTelegramMessage
}) {
    if (!db) throw new Error('Base de datos no disponible');
    const cleanTitle = String(titulo || '').trim().slice(0, 190).toUpperCase();
    if (cleanTitle.length < 3) {
        const err = new Error('El título de la tarea debe tener al menos 3 caracteres.');
        err.code = 'INVALID_TITLE';
        throw err;
    }

    const list = Array.isArray(assignees) ? assignees.filter(Boolean) : [];
    if (list.length === 0) {
        const err = new Error('Debe seleccionar al menos un colaborador para asignar la tarea.');
        err.code = 'NO_ASSIGNEES';
        throw err;
    }

    const creatorSipeId = creatorTgUser?.user_id ? Number(creatorTgUser.user_id) : null;
    const isAssigningToOthers = list.some(a => !creatorSipeId || Number(a.user_id) !== creatorSipeId);
    const canManageTeamTasks = Boolean(creatorEffPerms?.tareas || creatorEffPerms?.isAdmin);

    if (isAssigningToOthers && !canManageTeamTasks) {
        const err = new Error('No tienes permiso para asignar tareas a otros colaboradores.');
        err.code = 'PERMISSION_DENIED';
        throw err;
    }

    const creatorName = String(
        creatorEffPerms?.linkedUser?.nombre ||
        `${creatorTgUser?.first_name || ''} ${creatorTgUser?.last_name || ''}`.trim() ||
        creatorTgUser?.telegram_username ||
        'Telegram SIPE'
    ).trim();

    const safeDueDate = fecha_vencimiento || shiftDate(getSvToday(), 1);
    const safeHora = hora_limite || '17:00';
    const safePrio = PRIORIDAD_META[prioridad] ? prioridad : 'media';
    const safeCat = String(categoria || 'Operaciones').slice(0, 50);

    const activeIo = io || getRealtimeIo();
    const firstSipeAssignee = list.find(a => Number(a.user_id) > 0);
    const createdByInt = await resolveActorSipeUserId(db, creatorTgUser, firstSipeAssignee?.user_id || null);

    const createdTasks = [];
    const mibotResults = [];
    let telegramSentCount = 0;
    let telegramTotalCount = 0;

    const allNamesLabel = list.map(a => a.nombre).join(', ');
    const teamSuffix = list.length > 1
        ? `\n👥 Equipo co-asignado (${list.length}): ${allNamesLabel}`
        : '';

    const actorUserForMibot = {
        id: createdByInt,
        nombre: creatorName,
        username: creatorEffPerms?.linkedUser?.username || creatorTgUser?.telegram_username || 'telegram'
    };

    const sipeAssignees = list.filter(a => Number(a.user_id) > 0);
    const telegramOnlyAssignees = list.filter(a => !a.user_id && a.telegram_usuario_id);

    for (const assignee of sipeAssignees) {
        const taskDesc = (descripcion ? String(descripcion).trim() : `Asignado desde Telegram por ${creatorName}.`) +
            (list.length > 1 ? `\n\n[Equipo asignado: ${allNamesLabel}]` : '');

        const [res] = await db.query(
            `INSERT INTO tasks (
                titulo, descripcion, tipo_plazo, fecha_inicio, fecha_vencimiento,
                hora_limite, prioridad, estado, categoria, assigned_to, created_by, checklist
            ) VALUES (?, ?, 'dia_especifico', NULL, ?, ?, ?, 'pendiente', ?, ?, ?, '[]')`,
            [cleanTitle, taskDesc, safeDueDate, safeHora, safePrio, safeCat, Number(assignee.user_id), createdByInt]
        );
        const newTaskId = Number(res.insertId);

        const taskObj = {
            id: newTaskId,
            titulo: cleanTitle,
            descripcion: taskDesc,
            tipo_plazo: 'dia_especifico',
            fecha_inicio: null,
            fecha_vencimiento: safeDueDate,
            hora_limite: safeHora,
            prioridad: safePrio,
            estado: 'pendiente',
            categoria: safeCat,
            assigned_to: Number(assignee.user_id),
            assigned_user_name: assignee.nombre,
            created_by: createdByInt,
            created_user_name: creatorName,
            checklist: []
        };

        let mibotRes = null;
        let mibotStatusLabel = null;
        if (assignee.telegram_usuario_id && assignee.recibir_mibot !== false) {
            try {
                const prioLabel = PRIORIDAD_META[safePrio].label;
                const mibotMsg = [
                    descripcion ? String(descripcion).trim() : `Se te ha asignado la actividad "${cleanTitle}".`,
                    `Prioridad: ${prioLabel} · Categoría: ${safeCat} · Plazo: ${safeDueDate} (${format12HourTime(safeHora)})`,
                    teamSuffix.trim()
                ].filter(Boolean).join('\n');

                mibotRes = await createMibotProgramacion({
                    db,
                    externalDb,
                    payload: {
                        tipo: 'TAREA',
                        titulo: `Tarea #${newTaskId}: ${cleanTitle}`.slice(0, 180),
                        mensaje: mibotMsg,
                        task_id: newTaskId,
                        ubicacion: safeCat,
                        fecha_vencimiento: safeDueDate,
                        destinatario_ids: [Number(assignee.telegram_usuario_id)],
                        enviar_ahora: Boolean(enviar_ahora),
                        programado_para: enviar_ahora ? undefined : (programado_para || `${safeDueDate} 08:00:00`),
                        frecuencia: 'UNA_VEZ',
                        prioridad: safePrio
                    },
                    actorUser: actorUserForMibot,
                    sendTelegramFn,
                    io: activeIo,
                    skipSystemNotification: true
                });

                mibotResults.push(mibotRes);
                if (mibotRes?.dispatch) {
                    telegramSentCount += Number(mibotRes.dispatch.sent || 0);
                    telegramTotalCount += Number(mibotRes.dispatch.total || 0);
                    mibotStatusLabel = `Enviado por Telegram (${mibotRes.dispatch.sent}/${mibotRes.dispatch.total}) a ${assignee.nombre}`;
                } else if (mibotRes?.programacion) {
                    telegramTotalCount += 1;
                    mibotStatusLabel = `Programado en MiBot Telegram para ${assignee.nombre}`;
                }
            } catch (mibotErr) {
                console.warn(`[TelegramProductivity] Aviso enviando MiBot para tarea #${newTaskId}:`, mibotErr.message);
            }
        }

        const notifInfo = await emitSystemTaskNotification({
            db,
            io: activeIo,
            assignedToUserId: assignee.user_id,
            createdByUserId: createdByInt,
            creatorName,
            task: taskObj,
            mibotStatusLabel
        });

        if (activeIo) {
            try {
                activeIo.emit('tasks:changed', { action: 'created', task: taskObj, source: 'telegram_bot' });
                activeIo.emit('tasks:assigned_card', {
                    task: taskObj,
                    mibot: mibotRes ? { programacion: mibotRes.programacion, dispatch: mibotRes.dispatch, label: mibotStatusLabel } : null,
                    notificationData: notifInfo?.notificationData || null
                });
            } catch (_) {
                // Socket no crítico
            }
        }

        createdTasks.push(taskObj);
    }

    // Colaboradores vinculados solo por Telegram (sin usuario web SIPE)
    if (telegramOnlyAssignees.length > 0) {
        const destIds = telegramOnlyAssignees.map(a => Number(a.telegram_usuario_id)).filter(Boolean);
        if (destIds.length > 0) {
            try {
                const mibotMsg = [
                    descripcion ? String(descripcion).trim() : `Se te ha asignado la actividad "${cleanTitle}".`,
                    `Prioridad: ${PRIORIDAD_META[safePrio].label} · Categoría: ${safeCat} · Plazo: ${safeDueDate} (${format12HourTime(safeHora)})`,
                    teamSuffix.trim()
                ].filter(Boolean).join('\n');

                const tgOnlyRes = await createMibotProgramacion({
                    db,
                    externalDb,
                    payload: {
                        tipo: 'TAREA',
                        titulo: cleanTitle.slice(0, 180),
                        mensaje: mibotMsg,
                        ubicacion: safeCat,
                        fecha_vencimiento: safeDueDate,
                        destinatario_ids: destIds,
                        enviar_ahora: Boolean(enviar_ahora),
                        programado_para: enviar_ahora ? undefined : (programado_para || `${safeDueDate} 08:00:00`),
                        frecuencia: 'UNA_VEZ',
                        prioridad: safePrio
                    },
                    actorUser: actorUserForMibot,
                    sendTelegramFn,
                    io: activeIo,
                    skipSystemNotification: true
                });
                mibotResults.push(tgOnlyRes);
                if (tgOnlyRes?.dispatch) {
                    telegramSentCount += Number(tgOnlyRes.dispatch.sent || 0);
                    telegramTotalCount += Number(tgOnlyRes.dispatch.total || 0);
                } else {
                    telegramTotalCount += destIds.length;
                }
            } catch (tgErr) {
                console.warn('[TelegramProductivity] Aviso enviando MiBot a usuarios solo-Telegram:', tgErr.message);
            }
        }
    }

    return {
        createdTasks,
        mibotResults,
        telegramSentCount,
        telegramTotalCount,
        assigneesSummary: list.map(a => ({
            nombre: a.nombre,
            has_sipe: Boolean(a.user_id),
            has_telegram: Boolean(a.telegram_usuario_id)
        }))
    };
}

function formatMultiTaskCreationResultMessage(result, details = {}) {
    const tasks = result?.createdTasks || [];
    const titulo = escapeHtml(details.titulo || tasks[0]?.titulo || 'TAREA');
    const dueLabel = toDisplayDate(details.fecha_vencimiento || tasks[0]?.fecha_vencimiento || getSvToday());
    const horaLabel = format12HourTime(details.hora_limite || tasks[0]?.hora_limite || '17:00');
    const prioMeta = PRIORIDAD_META[details.prioridad || tasks[0]?.prioridad || 'media'] || PRIORIDAD_META.media;

    const lines = [
        `✅ <b>TAREA${tasks.length > 1 ? 'S' : ''} ASIGNADA${tasks.length > 1 ? 'S' : ''} EN SIPE ADMIN</b>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `📌 <b>${titulo}</b>`,
        `• ${prioMeta.emoji} <b>Prioridad:</b> ${prioMeta.label}  ·  🗂️ <b>Categoría:</b> ${escapeHtml(details.categoria || tasks[0]?.categoria || 'Operaciones')}`,
        `• 📅 <b>Plazo:</b> ${dueLabel}${horaLabel ? ` (${horaLabel})` : ''}`
    ];

    if (tasks.length > 0) {
        lines.push('');
        lines.push(`👥 <b>Colaboradores asignados (${tasks.length}):</b>`);
        tasks.forEach(t => {
            lines.push(`• <b>#${t.id}</b> — ${escapeHtml(t.assigned_user_name)} <i>(Tarjeta SIPE emitida)</i>`);
        });
    }

    const tgOnly = (result?.assigneesSummary || []).filter(a => !a.has_sipe && a.has_telegram);
    if (tgOnly.length > 0) {
        lines.push(`• 🤖 <i>Notificados vía Telegram: ${tgOnly.map(a => escapeHtml(a.nombre)).join(', ')}</i>`);
    }

    lines.push('');
    lines.push(`🤖 <b>MiBot Telegram:</b> ${result.telegramSentCount}/${result.telegramTotalCount} notificación(es) personal(es) despachada(s).`);
    lines.push(`<i>Cada colaborador recibió su tarjeta informativa en SIPE Admin y botones de confirmación en Telegram.</i>`);

    return lines.join('\n');
}

/**
 * Construye el teclado multi-selección para el asistente interactivo de asignación de tareas
 */
function buildTaskWizardStep1Markup(wizard) {
    const candidates = wizard?.candidates || [];
    const selectedSet = new Set(wizard?.selectedKeys || []);
    const rows = [];

    for (let i = 0; i < candidates.length && i < 16; i += 2) {
        const row = [];
        for (const cand of [candidates[i], candidates[i + 1]]) {
            if (!cand) continue;
            const checked = selectedSet.has(cand.key);
            const tgMark = cand.has_telegram ? '🤖' : '🖥️';
            const shortName = String(cand.nombre || 'Usuario').slice(0, 18);
            row.push({
                text: `${checked ? '✅' : '⬜'} ${shortName} ${tgMark}`,
                callback_data: `tg_tsk:wt:${cand.key}`
            });
        }
        rows.push(row);
    }

    rows.push([
        { text: `➡️ Siguiente (${selectedSet.size} selec.)`, callback_data: 'tg_tsk:wn' },
        { text: '❌ Cancelar', callback_data: 'tg_tsk:wcancel' }
    ]);

    return { inline_keyboard: rows };
}

function formatTaskWizardStep1Text(wizard) {
    const selectedSet = new Set(wizard?.selectedKeys || []);
    const selectedNames = (wizard?.candidates || [])
        .filter(c => selectedSet.has(c.key))
        .map(c => escapeHtml(c.nombre));

    const lines = [
        `📋 <b>ASISTENTE DE ASIGNACIÓN DE TAREAS (PASO 1/3)</b>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `Selecciona uno o varios colaboradores (toca para marcar/desmarcar):`,
        ``,
        `👥 <b>Seleccionados (${selectedNames.length}):</b> ${selectedNames.length > 0 ? selectedNames.join(', ') : '<i>Ninguno todavía</i>'}`,
        `<i>🤖 = Tiene Telegram vinculado · 🖥️ = Solo tablero web SIPE Admin</i>`
    ];
    return lines.join('\n');
}

function formatTaskWizardConfirmText(wizard) {
    const selectedSet = new Set(wizard?.selectedKeys || []);
    const selectedNames = (wizard?.candidates || [])
        .filter(c => selectedSet.has(c.key))
        .map(c => escapeHtml(c.nombre));
    const prioMeta = PRIORIDAD_META[wizard.prioridad || 'media'] || PRIORIDAD_META.media;

    return [
        `📋 <b>CONFIRMAR TAREA MULTI-USUARIO (PASO 3/3)</b>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `📌 <b>Título:</b> ${escapeHtml(wizard.titulo)}`,
        `👥 <b>Para (${selectedNames.length}):</b> ${selectedNames.join(', ')}`,
        `${prioMeta.emoji} <b>Prioridad:</b> ${prioMeta.label}`,
        `📅 <b>Plazo:</b> ${toDisplayDate(wizard.fecha_vencimiento)} (${format12HourTime(wizard.hora_limite || '17:00')})`,
        ``,
        `<i>Ajusta prioridad/fecha si deseas y presiona Confirmar:</i>`
    ].join('\n');
}

function buildTaskWizardConfirmMarkup() {
    return {
        inline_keyboard: [
            [
                { text: '🔥 Urgente', callback_data: 'tg_tsk:wp:urgente' },
                { text: '🟠 Alta', callback_data: 'tg_tsk:wp:alta' },
                { text: '🔵 Media', callback_data: 'tg_tsk:wp:media' },
                { text: '⚪ Baja', callback_data: 'tg_tsk:wp:baja' }
            ],
            [
                { text: '📅 Hoy', callback_data: 'tg_tsk:wd:0' },
                { text: '📅 Mañana', callback_data: 'tg_tsk:wd:1' },
                { text: '📅 +3 Días', callback_data: 'tg_tsk:wd:3' },
                { text: '📅 +7 Días', callback_data: 'tg_tsk:wd:7' }
            ],
            [
                { text: '✅ Crear y Notificar Ya', callback_data: 'tg_tsk:wgo:now' },
                { text: '❌ Cancelar', callback_data: 'tg_tsk:wcancel' }
            ]
        ]
    };
}

async function startTaskAssignmentWizard({ db, chatId, tgUser, effPerms, transport }) {
    const sendFn = transport?.sendTelegramMessage || sendTelegramMessage;
    const keyboard = transport?.getMainReplyKeyboard ? transport.getMainReplyKeyboard() : getMainReplyKeyboard();

    let candidates = await resolveCollaboratorCandidates(db);
    if (!effPerms?.tareas && !effPerms?.isAdmin) {
        // Sin permiso de gestión de equipo solo puede auto-asignarse
        const ownId = tgUser?.user_id ? Number(tgUser.user_id) : null;
        candidates = candidates.filter(c => ownId && c.user_id === ownId);
        if (candidates.length === 0) {
            await sendFn(chatId, '⚠️ Tu cuenta no tiene permiso para asignar tareas a otros colaboradores ni un usuario SIPE vinculado.', keyboard);
            return;
        }
    }

    const wizard = {
        step: 'SELECT_USERS',
        candidates,
        selectedKeys: [],
        titulo: '',
        descripcion: '',
        prioridad: 'media',
        fecha_vencimiento: shiftDate(getSvToday(), 1),
        hora_limite: '17:00',
        categoria: 'Operaciones',
        updatedAt: Date.now()
    };

    pendingTaskWizards.set(String(tgUser.telegram_user_id), wizard);
    await sendFn(chatId, formatTaskWizardStep1Text(wizard), buildTaskWizardStep1Markup(wizard));
}

/**
 * Consulta tareas propias, de equipo o vencidas desde `tasks`
 */
async function getTasksSummaryData({
    db,
    sipeUserId = null,
    canManageTeam = false,
    scope = 'mine',
    filterPersonQuery = null,
    referenceDate = null
}) {
    const today = referenceDate || getSvToday();
    if (!db) {
        return { scope, today, tasks: [], kpis: { total: 0, pendientes: 0, en_proceso: 0, vencidas: 0 }, canManageTeam };
    }

    let effScope = scope;
    if ((effScope === 'team' || filterPersonQuery) && !canManageTeam) {
        effScope = 'mine';
    }

    const where = ["t.estado NOT IN ('completada', 'cancelada')"];
    const params = [];

    if (effScope === 'mine') {
        if (!sipeUserId) {
            return { scope: effScope, today, tasks: [], kpis: { total: 0, pendientes: 0, en_proceso: 0, vencidas: 0 }, canManageTeam };
        }
        where.push('(t.assigned_to = ? OR t.created_by = ?)');
        params.push(Number(sipeUserId), Number(sipeUserId));
    } else if (effScope === 'overdue') {
        where.push('t.fecha_vencimiento < ?');
        params.push(today);
        if (!canManageTeam && sipeUserId) {
            where.push('(t.assigned_to = ? OR t.created_by = ?)');
            params.push(Number(sipeUserId), Number(sipeUserId));
        }
    }

    if (filterPersonQuery && canManageTeam) {
        const q = `%${String(filterPersonQuery).trim()}%`;
        where.push('(u1.nombre LIKE ? OR u1.username LIKE ?)');
        params.push(q, q);
    }

    const [rows] = await db.query(
        `SELECT t.id, t.titulo, t.prioridad, t.estado, t.categoria,
                t.assigned_to, t.created_by,
                DATE_FORMAT(t.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                TIME_FORMAT(t.hora_limite, '%H:%i') AS hora_limite,
                COALESCE(u1.nombre, u1.username, 'Sin asignar') AS assigned_user_name,
                COALESCE(u2.nombre, u2.username, 'SIPE') AS created_user_name
         FROM tasks t
         LEFT JOIN users u1 ON t.assigned_to = u1.id
         LEFT JOIN users u2 ON t.created_by = u2.id
         WHERE ${where.join(' AND ')}
         ORDER BY
            CASE WHEN t.fecha_vencimiento < ? THEN 0 ELSE 1 END ASC,
            FIELD(t.prioridad, 'urgente', 'alta', 'media', 'baja') ASC,
            t.fecha_vencimiento ASC,
            t.id DESC
         LIMIT 25`,
        [...params, today]
    );

    const tasks = rows || [];
    const kpis = {
        total: tasks.length,
        pendientes: tasks.filter(t => t.estado === 'pendiente').length,
        en_proceso: tasks.filter(t => t.estado === 'en_proceso').length,
        en_revision: tasks.filter(t => t.estado === 'en_revision').length,
        vencidas: tasks.filter(t => t.fecha_vencimiento && t.fecha_vencimiento < today).length
    };

    return {
        scope: effScope,
        today,
        filterPersonQuery,
        tasks,
        kpis,
        canManageTeam,
        sipeUserId
    };
}

function formatTasksMessage(data) {
    const scopeTitles = {
        mine: 'MIS TAREAS Y ACTIVIDADES ACTIVAS',
        team: data?.filterPersonQuery ? `TAREAS DE ${String(data.filterPersonQuery).toUpperCase()}` : 'TAREAS ACTIVAS DEL EQUIPO',
        overdue: 'TAREAS VENCIDAS / ATRASADAS'
    };
    const title = scopeTitles[data?.scope] || 'TAREAS Y ACTIVIDADES';
    const tasks = data?.tasks || [];
    const k = data?.kpis || {};

    const lines = [
        `📋 <b>${escapeHtml(title)}</b>`,
        `📅 <b>Corte:</b> ${toDisplayDate(data?.today || getSvToday())}`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `📊 <b>Activas:</b> <code>${k.total || 0}</code>  ·  ⏳ Pendientes: <code>${k.pendientes || 0}</code>  ·  ⚙️ En Proceso: <code>${k.en_proceso || 0}</code>${k.vencidas > 0 ? `  ·  🔴 Vencidas: <b>${k.vencidas}</b>` : ''}`,
        ``
    ];

    if (tasks.length === 0) {
        lines.push(`✅ <i>No hay tareas pendientes en esta vista. Puedes asignar una nueva con /asignar.</i>`);
        lines.push('');
        lines.push(`<i>SIPE Admin • Tablero de Tareas</i>`);
        return lines.join('\n');
    }

    tasks.slice(0, 10).forEach((t) => {
        const prio = PRIORIDAD_META[t.prioridad] || PRIORIDAD_META.media;
        const isOver = t.fecha_vencimiento && t.fecha_vencimiento < (data.today || getSvToday());
        const dueBadge = isOver
            ? `🔴 Atrasada (${toDisplayDate(t.fecha_vencimiento)})`
            : `📅 ${toDisplayDate(t.fecha_vencimiento)}${t.hora_limite ? ` ${format12HourTime(t.hora_limite)}` : ''}`;
        const stateIcon = t.estado === 'en_proceso' ? '⚙️' : (t.estado === 'en_revision' ? '🔎' : '⏳');
        lines.push(`${stateIcon} <b>#${t.id} ${escapeHtml(t.titulo)}</b>`);
        lines.push(`   └ ${prio.emoji} ${prio.label} · 👤 ${escapeHtml(t.assigned_user_name)} · ${dueBadge}`);
    });

    if (tasks.length > 10) {
        lines.push(`\n<i>... y ${tasks.length - 10} tarea(s) más visibles en el tablero web.</i>`);
    }

    lines.push('');
    lines.push(`<i>Usa los botones inferiores para iniciar, completar o asignar nuevas tareas.</i>`);
    return lines.join('\n');
}

function getTasksInlineMarkup(data) {
    const canManageTeam = Boolean(data?.canManageTeam);
    const sipeUserId = data?.sipeUserId ? Number(data.sipeUserId) : null;
    const tasks = data?.tasks || [];

    const keyboard = [
        [
            { text: '👤 Mis Tareas', callback_data: 'tg_tsk:l:mine' },
            ...(canManageTeam ? [{ text: '👥 Equipo', callback_data: 'tg_tsk:l:team' }] : []),
            { text: '🔴 Vencidas', callback_data: 'tg_tsk:l:over' }
        ]
    ];

    // Botones de acción rápida sobre las primeras 3 tareas que el usuario puede gestionar
    const actionable = tasks
        .filter(t => canManageTeam || (sipeUserId && Number(t.assigned_to) === sipeUserId))
        .slice(0, 3);

    for (const t of actionable) {
        const row = [];
        if (t.estado === 'pendiente') {
            row.push({ text: `▶ Iniciar #${t.id}`, callback_data: `tg_tsk:s:${t.id}` });
        }
        row.push({ text: `✔️ Completar #${t.id}`, callback_data: `tg_tsk:d:${t.id}` });
        keyboard.push(row);
    }

    keyboard.push([
        { text: '➕ Asignar Tarea', callback_data: 'tg_tsk:new' },
        { text: '🗓️ Ver Agenda', callback_data: 'tg_evt:r:semana' }
    ]);

    return { inline_keyboard: keyboard };
}

/**
 * Agenda unificada de eventos programados:
 * MiBot (reuniones/tareas/pagos/validaciones) + Tasks + Control de Pagos + Cumpleaños RH
 */
async function getEventosProgramadosData({
    db,
    externalDb = null,
    accountingDb = null,
    telegramUserId = null,
    sipeUserId = null,
    range = 'semana',
    includeControlPagos = false,
    includeTeam = false,
    referenceDate = null
}) {
    const today = referenceDate || getSvToday();
    let startDate = today;
    let endDate = shiftDate(today, 7);
    let rangeLabel = 'Próximos 7 Días';

    if (range === 'hoy') {
        endDate = today;
        rangeLabel = `Hoy (${toDisplayDate(today)})`;
    } else if (range === 'manana') {
        startDate = shiftDate(today, 1);
        endDate = startDate;
        rangeLabel = `Mañana (${toDisplayDate(startDate)})`;
    } else if (range === 'mes') {
        endDate = shiftDate(today, 30);
        rangeLabel = 'Próximos 30 Días';
    }

    // 1. Eventos MiBot
    const mibotPromise = (async () => {
        if (!db) return [];
        const params = [endDate];
        let userFilter = '';
        if (!includeTeam && telegramUserId) {
            userFilter = `AND EXISTS (
                SELECT 1 FROM mibot_programaciones_destinatarios md
                WHERE md.programacion_id = p.id AND md.telegram_user_id = ?
            )`;
            params.push(String(telegramUserId));
        }
        const [rows] = await db.query(
            `SELECT p.id, p.tipo, p.titulo, p.ubicacion, p.frecuencia, p.estado, p.monto_pendiente,
                    DATE_FORMAT(COALESCE(p.proximo_envio_at, p.programado_para), '%Y-%m-%d %H:%i:%s') AS fecha_prog
             FROM mibot_programaciones p
             WHERE p.estado IN ('PROGRAMADO', 'ENVIADO')
               AND DATE(COALESCE(p.proximo_envio_at, p.programado_para)) <= ?
               ${userFilter}
             ORDER BY COALESCE(p.proximo_envio_at, p.programado_para) ASC
             LIMIT 12`,
            params
        );
        return rows || [];
    })().catch(() => []);

    // 2. Tareas con vencimiento en la ventana (o atrasadas si es hoy/semana)
    const tasksPromise = (async () => {
        if (!db) return [];
        const where = ["t.estado NOT IN ('completada', 'cancelada')", 't.fecha_vencimiento <= ?'];
        const params = [endDate];
        if (!includeTeam) {
            if (!sipeUserId) return [];
            where.push('(t.assigned_to = ? OR t.created_by = ?)');
            params.push(Number(sipeUserId), Number(sipeUserId));
        }
        const [rows] = await db.query(
            `SELECT t.id, t.titulo, t.prioridad, t.estado,
                    DATE_FORMAT(t.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                    TIME_FORMAT(t.hora_limite, '%H:%i') AS hora_limite,
                    COALESCE(u.nombre, u.username, 'Colaborador') AS assigned_user_name
             FROM tasks t
             LEFT JOIN users u ON t.assigned_to = u.id
             WHERE ${where.join(' AND ')}
             ORDER BY t.fecha_vencimiento ASC, t.id DESC
             LIMIT 10`,
            params
        );
        return rows || [];
    })().catch(() => []);

    // 3. Control de Pagos (si autorizado)
    const pagosPromise = (async () => {
        if (!includeControlPagos || !externalDb) return [];
        const [rows] = await externalDb.query(
            `SELECT c.descripcion AS ubicacion, b.id_ubicacion, b.descripcion,
                    DATE_FORMAT(a.vencimiento, '%Y-%m-%d') AS vence,
                    b.forma_pago AS observacion, a.forma_pago, b.monto,
                    IF(a.estado = 'P', 'PENDIENTE', 'CANCELADO') AS estado,
                    DATE_FORMAT(a.fecha_cancelacion, '%Y-%m-%d') AS fecha_cancelacion,
                    a.id, b.id AS id_recordatorio
             FROM web_rc_recordatorios_vencimientos a
             INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
             LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
             WHERE b.activo = 1 AND a.estado = 'P' AND a.vencimiento <= ?
             ORDER BY a.vencimiento ASC
             LIMIT 20`,
            [endDate]
        );
        if (db && rows && rows.length > 0) {
            return await recordatoriosPagosService.enrichRecordatoriosList(db, rows);
        }
        return rows || [];
    })().catch(() => []);

    // 4. Cumpleaños en la ventana
    const bdayRange = range === 'hoy' ? 'hoy' : (range === 'mes' ? 'mes' : 'semana');
    const birthdaysPromise = getCumpleanosData({ accountingDb, scope: bdayRange, referenceDate: today })
        .then(r => r.cumpleaneros || [])
        .catch(() => []);

    const [mibotEvents, tasksEvents, paymentEvents, birthdays] = await Promise.all([
        mibotPromise,
        tasksPromise,
        pagosPromise,
        birthdaysPromise
    ]);

    const pendingPagos = (paymentEvents || []).filter(p => p.estado_pago !== 'CANCELADO');
    const totalCount = mibotEvents.length + tasksEvents.length + pendingPagos.length + birthdays.length;

    return {
        range,
        rangeLabel,
        today,
        startDate,
        endDate,
        mibotEvents,
        tasksEvents,
        paymentEvents: pendingPagos,
        birthdays,
        totalCount
    };
}

function formatEventosProgramadosMessage(data) {
    const mibot = data?.mibotEvents || [];
    const tasks = data?.tasksEvents || [];
    const pagos = data?.paymentEvents || [];
    const bdays = data?.birthdays || [];

    const lines = [
        `🗓️ <b>AGENDA Y EVENTOS PROGRAMADOS</b>`,
        `📆 <b>Horizonte:</b> ${escapeHtml(data?.rangeLabel || 'Próximos 7 Días')}`,
        `━━━━━━━━━━━━━━━━━━━━━`
    ];

    if (Number(data?.totalCount || 0) === 0) {
        lines.push('');
        lines.push(`✅ <i>No tienes eventos, reuniones, tareas ni pagos programados en este período.</i>`);
        lines.push(`<i>Puedes programar uno nuevo con /agendar o el botón inferior.</i>`);
        return lines.join('\n');
    }

    if (mibot.length > 0) {
        lines.push('');
        lines.push(`🤖 <b>EVENTOS Y RECORDATORIOS MIBOT (${mibot.length}):</b>`);
        mibot.slice(0, 8).forEach(ev => {
            const meta = TIPO_META[ev.tipo] || TIPO_META.RECORDATORIO_PAGO;
            const when = formatDisplayDateTimeSv(ev.fecha_prog);
            lines.push(`• ${meta.emoji} <b>${escapeHtml(ev.titulo)}</b>`);
            lines.push(`   └ <i>${meta.label} · ${when}${ev.frecuencia && ev.frecuencia !== 'UNA_VEZ' ? ` · 🔁 ${FRECUENCIA_LABELS[ev.frecuencia] || ev.frecuencia}` : ''}</i>`);
        });
    }

    if (tasks.length > 0) {
        lines.push('');
        lines.push(`📋 <b>TAREAS CON PLAZO (${tasks.length}):</b>`);
        tasks.slice(0, 7).forEach(t => {
            const over = t.fecha_vencimiento < (data.today || getSvToday());
            const icon = over ? '🔴' : '📌';
            lines.push(`• ${icon} <b>#${t.id} ${escapeHtml(t.titulo)}</b> — ${toDisplayDate(t.fecha_vencimiento)}${t.hora_limite ? ` ${format12HourTime(t.hora_limite)}` : ''} <i>(${escapeHtml(t.assigned_user_name)})</i>`);
        });
    }

    if (pagos.length > 0) {
        const sumPagos = pagos.reduce((s, p) => s + Number(p.saldo_pendiente ?? p.monto ?? 0), 0);
        lines.push('');
        lines.push(`💳 <b>VENCIMIENTOS CONTROL DE PAGOS (${pagos.length} · ${moneyFmt(sumPagos)}):</b>`);
        pagos.slice(0, 6).forEach(p => {
            const saldo = Number(p.saldo_pendiente ?? p.monto ?? 0);
            const over = p.vence < (data.today || getSvToday());
            lines.push(`• ${over ? '🔴' : '🟡'} <b>${escapeHtml(p.descripcion)}</b>${p.ubicacion ? ` (${escapeHtml(p.ubicacion)})` : ''}: <b>${moneyFmt(saldo)}</b> — Vence ${formatShortDM(p.vence)}`);
        });
    }

    if (bdays.length > 0) {
        lines.push('');
        lines.push(`🎂 <b>CUMPLEAÑOS DEL EQUIPO (${bdays.length}):</b>`);
        bdays.slice(0, 5).forEach(b => {
            const when = b.dias_restantes === 0 ? '🎉 ¡HOY!' : (b.dias_restantes === 1 ? 'Mañana' : b.fecha_celebracion_corta);
            lines.push(`• 🎈 <b>${escapeHtml(b.nombre)}</b> (${when}) — <i>${escapeHtml(b.empresa || '')}</i>`);
        });
    }

    lines.push('');
    lines.push(`<i>SIPE Admin • Agenda Inteligente</i>`);
    return lines.join('\n');
}

function getEventosInlineMarkup(activeRange = 'semana') {
    const mark = (r, lbl) => (activeRange === r ? `• ${lbl} •` : lbl);
    return {
        inline_keyboard: [
            [
                { text: mark('hoy', '📅 Hoy'), callback_data: 'tg_evt:r:hoy' },
                { text: mark('semana', '📆 7 Días'), callback_data: 'tg_evt:r:semana' },
                { text: mark('mes', '🗓️ 30 Días'), callback_data: 'tg_evt:r:mes' }
            ],
            [
                { text: '➕ Agendar Evento / Reunión', callback_data: 'tg_evt:new' },
                { text: '🎂 Cumpleaños', callback_data: 'tg_bday:semana' }
            ]
        ]
    };
}

/**
 * Parsea un comando/frase para agendar un evento, reunión o recordatorio en MiBot
 */
function parseScheduleEventInput(rawText = '', candidates = [], selfTgUserId = null, referenceNowSv = null) {
    const raw = String(rawText || '').trim();
    const norm = normalizeText(raw);
    const { targetDate, dateExplicit, timeHHMM, timeExplicit } = extractDateAndTimeFromSpanish(raw, referenceNowSv);

    let tipo = 'REUNION';
    if (/\b(reunion|reuniones|junta|llamada|cita|comite|sesion)\b/i.test(norm)) {
        tipo = 'REUNION';
    } else if (/\b(validar|validacion|aprobar|revisar|verificar)\b/i.test(norm) && !/\b(reunion|junta)\b/i.test(norm)) {
        tipo = 'VALIDACION';
    } else if (/\b(pagar|pago|abono|abonar|factura|control de pagos)\b/i.test(norm) && !/\b(reunion|junta)\b/i.test(norm)) {
        tipo = 'RECORDATORIO_PAGO';
    } else if (/^\/?recordatorio|recuerdame/i.test(norm)) {
        tipo = 'TAREA';
    }

    let frecuencia = 'UNA_VEZ';
    if (/\b(todos\s+los\s+dias|diario|diariamente|cada\s+dia)\b/i.test(norm)) {
        frecuencia = 'DIARIO';
    } else if (/\b(cada\s+semana|semanal|semanalmente|todos\s+los\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/i.test(norm)) {
        frecuencia = 'SEMANAL';
    }

    // Buscar participantes mencionados después de "con" o "a"
    const participants = [];
    const seen = new Set();
    const withMatch = raw.match(/\b(?:con|para)\s+([a-záéíóúñÁÉÍÓÚÑ\s,@]+?)(?=\s+(?:hoy|mañana|manana|pasado|el|este|pr[oó]ximo|a\s+las|para|sobre|de|:)|\s*$)/i);
    if (withMatch) {
        const res = splitAndMatchCandidates(withMatch[1], candidates);
        for (const c of res.matched) {
            if (c.telegram_usuario_id && !seen.has(c.telegram_usuario_id)) {
                seen.add(c.telegram_usuario_id);
                participants.push(c);
            }
        }
    }

    // Siempre incluir al usuario creador en recordatorios personales o reuniones si no especificó otros
    if (selfTgUserId) {
        const selfCand = candidates.find(c => Number(c.telegram_usuario_id) === Number(selfTgUserId));
        if (selfCand && (participants.length === 0 || /\b(recuerdame|recordarme|reunion|junta)\b/i.test(norm))) {
            if (!seen.has(selfCand.telegram_usuario_id)) {
                seen.add(selfCand.telegram_usuario_id);
                participants.unshift(selfCand);
            }
        }
    }

    // Limpiar título
    let body = raw
        .replace(/^\/?(?:agendar|reunion|recordatorio|evento)\s*/i, '')
        .replace(/^(?:recuerdame|recuérdame|agenda(?:r|me)?|programa(?:r|me)?)\s*(?:que\s+|de\s+)?/i, '')
        .replace(/^(?:una\s+|un\s+)?(?:reuni[oó]n|junta|evento|recordatorio|aviso)\s*/i, '')
        .replace(/\bcon\s+[a-záéíóúñÁÉÍÓÚÑ,\s]+?(?=\s+(?:hoy|mañana|manana|sobre|de|a\s+las|el|este|pr[oó]ximo)|:|$)/i, ' ')
        .trim();

    body = cleanExtractedTitle(body);
    if (body && body.length > 1) {
        body = body.charAt(0).toUpperCase() + body.slice(1);
    }

    const programadoPara = `${targetDate} ${timeHHMM || '08:00'}:00`;

    return {
        tipo,
        titulo: body,
        frecuencia,
        programado_para: programadoPara,
        targetDate,
        hora: timeHHMM || '08:00',
        dateExplicit,
        timeExplicit,
        participants,
        isComplete: body.length >= 3 && participants.length > 0
    };
}

async function startEventScheduleWizard({ db, chatId, tgUser, defaultTipo = 'REUNION', transport }) {
    const sendFn = transport?.sendTelegramMessage || sendTelegramMessage;
    const allCandidates = await resolveCollaboratorCandidates(db);
    const tgCandidates = allCandidates.filter(c => c.has_telegram && c.telegram_usuario_id && c.recibir_mibot);

    const preSelected = [];
    const self = tgCandidates.find(c => Number(c.telegram_usuario_id) === Number(tgUser.id));
    if (self) preSelected.push(Number(self.telegram_usuario_id));

    const wizard = {
        step: 'SELECT_DETAILS',
        tipo: MIBOT_TIPOS.includes(defaultTipo) ? defaultTipo : 'REUNION',
        frecuencia: 'UNA_VEZ',
        candidates: tgCandidates,
        selectedTgIds: preSelected,
        titulo: '',
        programado_para: `${shiftDate(getSvToday(), 1)} 09:00:00`,
        updatedAt: Date.now()
    };

    pendingEventWizards.set(String(tgUser.telegram_user_id), wizard);
    await sendFn(chatId, formatEventWizardText(wizard), buildEventWizardMarkup(wizard));
}

function formatEventWizardText(wizard) {
    const meta = TIPO_META[wizard.tipo] || TIPO_META.REUNION;
    const selSet = new Set((wizard.selectedTgIds || []).map(Number));
    const names = (wizard.candidates || [])
        .filter(c => selSet.has(Number(c.telegram_usuario_id)))
        .map(c => escapeHtml(c.nombre));

    return [
        `🗓️ <b>PROGRAMAR RECORDATORIO / EVENTO MIBOT</b>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `• <b>Tipo:</b> ${meta.emoji} ${meta.label}`,
        `• <b>Participantes (${names.length}):</b> ${names.length > 0 ? names.join(', ') : '<i>Selecciona al menos uno</i>'}`,
        `• <b>Frecuencia:</b> 🔁 ${FRECUENCIA_LABELS[wizard.frecuencia] || 'Una sola vez'}`,
        ``,
        `📝 <i>Ahora escribe el asunto y opcionalmente fecha/hora (ej: "Junta de cierre de mes mañana 10am") o ajusta tipo/participantes abajo:</i>`
    ].join('\n');
}

function buildEventWizardMarkup(wizard) {
    const rows = [
        [
            { text: wizard.tipo === 'REUNION' ? '✅ 📅 Reunión' : '📅 Reunión', callback_data: 'tg_evt:wt:REUNION' },
            { text: wizard.tipo === 'TAREA' ? '✅ 📋 Recordatorio' : '📋 Recordatorio', callback_data: 'tg_evt:wt:TAREA' },
            { text: wizard.tipo === 'VALIDACION' ? '✅ ✔️ Validación' : '✔️ Validación', callback_data: 'tg_evt:wt:VALIDACION' }
        ],
        [
            { text: wizard.frecuencia === 'UNA_VEZ' ? '✅ 1 Vez' : '1 Vez', callback_data: 'tg_evt:wf:UNA_VEZ' },
            { text: wizard.frecuencia === 'DIARIO' ? '✅ Diario' : 'Diario', callback_data: 'tg_evt:wf:DIARIO' },
            { text: wizard.frecuencia === 'SEMANAL' ? '✅ Semanal' : 'Semanal', callback_data: 'tg_evt:wf:SEMANAL' }
        ]
    ];

    const cands = (wizard.candidates || []).slice(0, 8);
    const selSet = new Set((wizard.selectedTgIds || []).map(Number));
    for (let i = 0; i < cands.length; i += 2) {
        const pair = [];
        for (const c of [cands[i], cands[i + 1]]) {
            if (!c) continue;
            const checked = selSet.has(Number(c.telegram_usuario_id));
            pair.push({
                text: `${checked ? '✅' : '⬜'} ${String(c.nombre).slice(0, 18)}`,
                callback_data: `tg_evt:wu:${c.telegram_usuario_id}`
            });
        }
        rows.push(pair);
    }

    rows.push([{ text: '❌ Cancelar', callback_data: 'tg_evt:wcancel' }]);
    return { inline_keyboard: rows };
}

/**
 * CONTROL DE PAGOS ENRIQUECIDO (externalDb solo lectura + abonos/meta de db_sipe_admin)
 */
function parseControlPagosQuery(rawText = '', parsed = {}) {
    const norm = normalizeText(rawText);
    let filterMode = 'resumen';

    if (/\b(vencido|vencidos|atrasado|atrasados|en\s+mora|morosos?)\b/i.test(norm)) {
        filterMode = 'vencidos';
    } else if (/\b(de\s+hoy|para\s+hoy|vencen\s+hoy|toca\s+hoy)\b/i.test(norm)) {
        filterMode = 'hoy';
    } else if (/\b(esta\s+semana|proximos?\s+7|proxima\s+semana|la\s+semana)\b/i.test(norm)) {
        filterMode = 'semana';
    } else if (/\b(parcial|parciales|abono|abonos|abonado|abonados|a\s+medias)\b/i.test(norm)) {
        filterMode = 'parciales';
    } else if (/\b(cancelado|cancelados|ya\s+(?:se\s+)?pago|ya\s+pagados?|pagados?|se\s+pago)\b/i.test(norm)) {
        filterMode = 'cancelados';
    } else if (parsed?.isMonthly || /\b(este\s+mes|del\s+mes)\b/i.test(norm)) {
        filterMode = 'mes';
    }

    let ubicacionFilter = null;
    if (parsed?.matchedStation) {
        ubicacionFilter = parsed.matchedStation.name.split(' ')[0];
        if (parsed.matchedStation.id === '008') ubicacionFilter = 'COSTA DEL SOL';
        if (parsed.matchedStation.id === '002') ubicacionFilter = 'MIRAFLORES';
        if (parsed.matchedStation.id === '006') ubicacionFilter = 'CHALCHUAPA';
        if (parsed.matchedStation.id === '014') ubicacionFilter = 'LOMA';
        if (parsed.matchedStation.id === '015') ubicacionFilter = '14';
        if (parsed.matchedStation.id === '016') ubicacionFilter = 'POLIEDRO';
        if (parsed.matchedStation.id === 'ANDELSA') ubicacionFilter = 'ANDELSA';
    } else if (/\bmiraflores\b/i.test(norm)) {
        ubicacionFilter = 'MIRAFLORES';
    } else if (/\b(?:costa\s+del\s+sol|costa)\b/i.test(norm)) {
        ubicacionFilter = 'COSTA DEL SOL';
    } else if (/\bchalchuapa\b/i.test(norm)) {
        ubicacionFilter = 'CHALCHUAPA';
    } else if (/\b(?:la\s+loma|san\s+martin)\b/i.test(norm)) {
        ubicacionFilter = 'LOMA';
    } else if (/\b(?:14\s+avenida|14ta)\b/i.test(norm)) {
        ubicacionFilter = '14';
    } else if (/\b(?:poliedro|opico)\b/i.test(norm)) {
        ubicacionFilter = 'POLIEDRO';
    } else if (/\bandelsa\b/i.test(norm)) {
        ubicacionFilter = 'ANDELSA';
    } else if (/\boficina\b/i.test(norm)) {
        ubicacionFilter = 'OFICINA';
    }

    // Extraer posible concepto específico ("pagos de huevos", "ya se pago energia electrica", etc.)
    let cleaned = norm
        .replace(/^\/?(?:pagos|controlpagos|control_pagos)\b/gi, ' ')
        .replace(/\b(?:cuales|cual|son|los|las|el|la|de|del|en|por|para|con|hay|tenemos|tienen|vienen|tocan|debemos|falta|cuanto|control\s+de\s+pagos?|control|pagos?\s+programados?|pagos?\s+pendientes?|recordatorios?\s+de\s+pagos?|vencimientos?\s+de\s+pagos?|pagos?|proximos?|vencidos?|vencido|atrasados?|atrasado|hoy|esta\s+semana|este\s+mes|mes|parciales?|parcial|cancelados?|cancelado|ya\s+se\s+pago|se\s+pago|pagado|pagados|estado\s+de|saldo\s+de)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (ubicacionFilter) {
        const normUbi = normalizeText(ubicacionFilter);
        cleaned = cleaned.replace(new RegExp(`\\b(?:${normUbi.split(/\s+/).join('|')}|san\\s+martin)\\b`, 'gi'), ' ').replace(/\s+/g, ' ').trim();
    }
    if (parsed?.isMonthly && parsed?.targetMonth) {
        const mName = normalizeText(SPANISH_MONTH_NAMES[parsed.targetMonth] || '');
        if (mName) cleaned = cleaned.replace(new RegExp(`\\b${mName}\\b`, 'gi'), ' ').trim();
        cleaned = cleaned.replace(/\b20\d{2}\b/g, ' ').trim();
    }

    const searchTerm = cleaned.length >= 3 ? cleaned : null;

    let startDate = parsed?.startDate || null;
    let endDate = parsed?.endDate || null;
    if (!startDate && parsed?.isMonthly && parsed?.targetYear && parsed?.targetMonth) {
        const y = parsed.targetYear;
        const m = String(parsed.targetMonth).padStart(2, '0');
        const lastDay = new Date(Date.UTC(y, parsed.targetMonth, 0)).getUTCDate();
        startDate = `${y}-${m}-01`;
        endDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    }

    return {
        filterMode,
        ubicacionFilter,
        searchTerm,
        startDate,
        endDate
    };
}

/**
 * Consulta y enriquece Control de Pagos con abonos parciales y saldos pendientes reales
 */
async function getControlPagosDetailedData({
    db = null,
    externalDb = null,
    filterMode = 'resumen',
    ubicacionFilter = null,
    searchTerm = null,
    startDate = null,
    endDate = null,
    referenceDate = null,
    limit = 200
} = {}) {
    const dbConn = db !== undefined ? db : getDb();
    const extConn = externalDb !== undefined ? externalDb : await getExternalDb().catch(() => null);
    const today = referenceDate || getSvToday();
    const next7 = shiftDate(today, 7);

    let rawRows = [];
    if (extConn) {
        try {
            const where = ['b.activo = 1'];
            const params = [];

            if (startDate && endDate) {
                where.push('a.vencimiento BETWEEN ? AND ?');
                params.push(startDate, endDate);
            } else if (filterMode === 'cancelados') {
                where.push('a.vencimiento >= DATE_SUB(?, INTERVAL 90 DAY)');
                params.push(today);
            } else if (searchTerm) {
                where.push('a.vencimiento >= DATE_SUB(?, INTERVAL 180 DAY)');
                params.push(today);
            } else {
                where.push('a.vencimiento >= DATE_SUB(?, INTERVAL 60 DAY)');
                where.push('a.vencimiento <= DATE_ADD(?, INTERVAL 45 DAY)');
                params.push(today, today);
            }

            if (filterMode !== 'cancelados' && !searchTerm && filterMode !== 'mes') {
                where.push("a.estado = 'P'");
            }

            params.push(Math.min(300, Math.max(20, Number(limit) || 200)));

            const [rows] = await extConn.query(
                `SELECT
                    c.descripcion AS ubicacion,
                    b.id_ubicacion,
                    b.descripcion,
                    DATE_FORMAT(a.vencimiento, '%Y-%m-%d') AS vence,
                    b.forma_pago AS observacion,
                    a.forma_pago,
                    b.monto,
                    IF(a.estado = 'P', 'PENDIENTE', 'CANCELADO') AS estado,
                    DATE_FORMAT(a.fecha_cancelacion, '%Y-%m-%d') AS fecha_cancelacion,
                    a.id,
                    b.id AS id_recordatorio
                 FROM web_rc_recordatorios_vencimientos a
                 INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
                 LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
                 WHERE ${where.join(' AND ')}
                 ORDER BY a.vencimiento ASC, b.monto DESC
                 LIMIT ?`,
                params
            );
            rawRows = rows || [];
        } catch (errExt) {
            console.warn('[TelegramProductivity] Error consultando Control de Pagos:', errExt.message);
        }
    }

    let enriched = rawRows;
    if (dbConn && rawRows.length > 0) {
        try {
            enriched = await recordatoriosPagosService.enrichRecordatoriosList(dbConn, rawRows);
        } catch (enrichErr) {
            console.warn('[TelegramProductivity] Aviso enriqueciendo Control de Pagos:', enrichErr.message);
        }
    }

    // Normalizar estructura de fila
    let normalizedRows = enriched.map(r => {
        const montoTotal = Number(r.monto || 0);
        const montoPagado = Number(r.monto_pagado || 0);
        const isLegacyCancel = String(r.estado || '').toUpperCase() === 'CANCELADO' || String(r.estado || '').toUpperCase() === 'C';
        const estadoPago = r.estado_pago || (isLegacyCancel ? 'CANCELADO' : (montoPagado > 0 ? 'PARCIAL' : 'PENDIENTE'));
        const saldoPendiente = r.saldo_pendiente !== undefined
            ? Number(r.saldo_pendiente)
            : (estadoPago === 'CANCELADO' ? 0 : Math.max(0, Math.round((montoTotal - montoPagado) * 100) / 100));

        return {
            id: Number(r.id),
            id_recordatorio: Number(r.id_recordatorio || 0),
            descripcion: String(r.descripcion || 'Pago Programado').trim(),
            ubicacion: r.ubicacion ? String(r.ubicacion).trim() : null,
            fecha_vencimiento: r.vence || r.fecha_vencimiento || today,
            fecha_cancelacion: r.fecha_cancelacion || null,
            monto: Math.round(montoTotal * 100) / 100,
            monto_pagado: Math.round(montoPagado * 100) / 100,
            saldo_pendiente: Math.round(saldoPendiente * 100) / 100,
            porcentaje_pagado: Number(r.porcentaje_pagado || (montoTotal > 0 ? Math.round((montoPagado / montoTotal) * 100) : 0)),
            estado_pago: estadoPago,
            tipo_operacion: r.tipo_operacion || 'CXP',
            forma_pago: r.forma_pago || r.observacion || null,
            abonos_count: Number(r.abonos_count || 0),
            comprobantes_count: Number(r.comprobantes_count || 0),
            mibot_avisos_count: Number(r.mibot_avisos_count || 0),
            origen: 'Control de Pagos'
        };
    });

    // Aplicar filtro por ubicación / texto antes de calcular los subgrupos del ámbito
    if (ubicacionFilter) {
        const normUbi = normalizeText(ubicacionFilter);
        normalizedRows = normalizedRows.filter(r =>
            normalizeText(r.ubicacion || '').includes(normUbi) ||
            normalizeText(r.descripcion || '').includes(normUbi)
        );
    }

    if (searchTerm) {
        const tokens = normalizeText(searchTerm).split(/\s+/).filter(t => t.length >= 2);
        if (tokens.length > 0) {
            normalizedRows = normalizedRows.filter(r => {
                const hay = normalizeText(`${r.descripcion} ${r.ubicacion || ''} ${r.forma_pago || ''}`);
                return tokens.every(tok => hay.includes(tok));
            });
        }
    }

    const activeRows = normalizedRows.filter(r => r.estado_pago !== 'CANCELADO');
    const vencidos = activeRows.filter(r => r.fecha_vencimiento < today);
    const hoy = activeRows.filter(r => r.fecha_vencimiento === today);
    const vencidosOHoy = activeRows.filter(r => r.fecha_vencimiento <= today);
    const proximos7Dias = activeRows.filter(r => r.fecha_vencimiento > today && r.fecha_vencimiento <= next7);
    const posteriores = activeRows.filter(r => r.fecha_vencimiento > next7);
    const parciales = activeRows.filter(r => r.estado_pago === 'PARCIAL');
    const cancelados = normalizedRows.filter(r => r.estado_pago === 'CANCELADO');

    // Lista visible según filterMode
    let itemsVisible = activeRows;
    if (filterMode === 'vencidos') itemsVisible = vencidos;
    else if (filterMode === 'hoy') itemsVisible = hoy;
    else if (filterMode === 'semana') itemsVisible = [...vencidosOHoy, ...proximos7Dias];
    else if (filterMode === 'parciales') itemsVisible = parciales;
    else if (filterMode === 'cancelados') itemsVisible = cancelados;
    else if (filterMode === 'mes' || searchTerm) itemsVisible = normalizedRows;

    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const totalSaldoPendienteUsd = round2(activeRows.reduce((s, r) => s + r.saldo_pendiente, 0));
    const totalAbonadoUsd = round2(normalizedRows.reduce((s, r) => s + r.monto_pagado, 0));
    const totalVencidosUsd = round2(vencidos.reduce((s, r) => s + r.saldo_pendiente, 0));
    const totalHoyUsd = round2(hoy.reduce((s, r) => s + r.saldo_pendiente, 0));
    const totalUrgenteUsd = round2(vencidosOHoy.reduce((s, r) => s + r.saldo_pendiente, 0));
    const totalParcialesUsd = round2(parciales.reduce((s, r) => s + r.saldo_pendiente, 0));
    const totalCanceladosUsd = round2(cancelados.reduce((s, r) => s + r.monto, 0));

    return {
        fecha_consulta: today,
        filterMode,
        ubicacionFilter,
        searchTerm,
        startDate,
        endDate,
        total_pendiente_usd: totalSaldoPendienteUsd,
        total_saldo_pendiente_usd: totalSaldoPendienteUsd,
        total_abonado_usd: totalAbonadoUsd,
        total_urgente_usd: totalUrgenteUsd,
        total_vencidos_usd: totalVencidosUsd,
        total_hoy_usd: totalHoyUsd,
        total_parciales_saldo_usd: totalParcialesUsd,
        total_cancelados_usd: totalCanceladosUsd,
        cantidad_total: activeRows.length,
        cantidad_vencidos: vencidos.length,
        cantidad_hoy: hoy.length,
        cantidad_urgentes: vencidosOHoy.length,
        cantidad_proximos_7d: proximos7Dias.length,
        cantidad_parciales: parciales.length,
        cantidad_cancelados: cancelados.length,
        vencidos,
        hoy,
        vencidos_o_hoy: vencidosOHoy,
        proximos_7_dias: proximos7Dias,
        posteriores,
        parciales,
        cancelados,
        pagos: itemsVisible
    };
}

function formatPaymentLineItem(p, today) {
    const ubi = p.ubicacion ? ` <i>(${escapeHtml(p.ubicacion)})</i>` : '';
    const tipoTag = p.tipo_operacion && p.tipo_operacion !== 'CXP' ? ` [${escapeHtml(p.tipo_operacion)}]` : '';
    const over = p.estado_pago !== 'CANCELADO' && p.fecha_vencimiento < today;
    const icon = p.estado_pago === 'CANCELADO' ? '✅' : (p.estado_pago === 'PARCIAL' ? '🟡' : (over ? '🔴' : '📌'));

    if (p.estado_pago === 'CANCELADO') {
        const paidDate = p.fecha_cancelacion ? ` el ${toDisplayDate(p.fecha_cancelacion)}` : '';
        return `${icon} <b>${escapeHtml(p.descripcion)}</b>${ubi}${tipoTag}\n   └ <b>${moneyFmt(p.monto)}</b> · <i>Cancelado${paidDate} (Vencía ${formatShortDM(p.fecha_vencimiento)})</i>`;
    }
    if (p.estado_pago === 'PARCIAL') {
        return `${icon} <b>${escapeHtml(p.descripcion)}</b>${ubi}${tipoTag}\n   └ Saldo: <b>${moneyFmt(p.saldo_pendiente)}</b> (Abonado: ${moneyFmt(p.monto_pagado)} / ${moneyFmt(p.monto)} · ${p.porcentaje_pagado}%) · Vence ${formatShortDM(p.fecha_vencimiento)}`;
    }
    return `${icon} <b>${escapeHtml(p.descripcion)}</b>${ubi}${tipoTag}\n   └ <b>${moneyFmt(p.saldo_pendiente)}</b> · Vence: <code>${toDisplayDate(p.fecha_vencimiento)}</code>${over ? ' <b>(VENCIDO)</b>' : ''}`;
}

function formatControlPagosMessage(data) {
    const today = data?.fecha_consulta || getSvToday();
    const mode = data?.filterMode || 'resumen';
    const modeTitles = {
        resumen: 'CONTROL DE PAGOS • RESUMEN GENERAL',
        vencidos: 'CONTROL DE PAGOS • COMPROMISOS VENCIDOS',
        hoy: 'CONTROL DE PAGOS • VENCIMIENTOS DE HOY',
        semana: 'CONTROL DE PAGOS • PRÓXIMOS 7 DÍAS',
        parciales: 'CONTROL DE PAGOS • CON ABONOS PARCIALES',
        cancelados: 'CONTROL DE PAGOS • PAGOS CANCELADOS',
        mes: 'CONTROL DE PAGOS • REPORTE DEL PERÍODO'
    };

    const lines = [
        `💳 <b>${modeTitles[mode] || modeTitles.resumen}</b>`,
        `📅 <b>Corte:</b> ${toDisplayDate(today)}`
    ];
    if (data?.ubicacionFilter) {
        lines.push(`📍 <b>Ubicación:</b> ${escapeHtml(data.ubicacionFilter)}`);
    }
    if (data?.searchTerm) {
        lines.push(`🔎 <b>Búsqueda:</b> «${escapeHtml(data.searchTerm)}»`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`💰 <b>Saldo Pendiente Total:</b> <b>${moneyFmt(data?.total_saldo_pendiente_usd || 0)}</b> (<code>${data?.cantidad_total || 0} activos</code>)`);

    if (Number(data?.total_abonado_usd || 0) > 0) {
        lines.push(`💵 <b>Total Abonado en Vista:</b> <code>${moneyFmt(data.total_abonado_usd)}</code>`);
    }
    if (Number(data?.cantidad_vencidos || 0) > 0) {
        lines.push(`🔴 <b>Vencidos:</b> <b>${moneyFmt(data.total_vencidos_usd || 0)}</b> (${data.cantidad_vencidos})`);
    }
    if (Number(data?.cantidad_hoy || 0) > 0) {
        lines.push(`📅 <b>Para Hoy:</b> <b>${moneyFmt(data.total_hoy_usd || 0)}</b> (${data.cantidad_hoy})`);
    }
    if (Number(data?.cantidad_parciales || 0) > 0) {
        lines.push(`🟡 <b>Pagos Parciales:</b> ${data.cantidad_parciales} (Saldo: <code>${moneyFmt(data.total_parciales_saldo_usd || 0)}</code>)`);
    }
    lines.push('');

    const items = data?.pagos || [];
    if (items.length === 0) {
        lines.push(`✅ <i>No se encontraron registros para los filtros seleccionados en Control de Pagos.</i>`);
        lines.push('');
        lines.push(`<i>SIPE Admin • Tesorería y Control de Pagos</i>`);
        return lines.join('\n');
    }

    if (mode === 'resumen' && !data?.searchTerm) {
        const grupos = [
            { title: '🔴 VENCIDOS', rows: data.vencidos || [], limit: 6 },
            { title: '📅 PARA HOY', rows: data.hoy || [], limit: 5 },
            { title: '📆 PRÓXIMOS 7 DÍAS', rows: data.proximos_7_dias || [], limit: 6 }
        ];
        let printedAny = false;
        for (const g of grupos) {
            if (g.rows.length > 0) {
                printedAny = true;
                lines.push(`<b>${g.title} (${g.rows.length}):</b>`);
                g.rows.slice(0, g.limit).forEach(p => lines.push(formatPaymentLineItem(p, today)));
                lines.push('');
            }
        }
        if (!printedAny && (data.posteriores || []).length > 0) {
            lines.push(`<b>🟢 PROGRAMADOS POSTERIORES (${data.posteriores.length}):</b>`);
            data.posteriores.slice(0, 8).forEach(p => lines.push(formatPaymentLineItem(p, today)));
            lines.push('');
        }
    } else {
        lines.push(`📋 <b>Detalle (${items.length}):</b>`);
        items.slice(0, 12).forEach(p => lines.push(formatPaymentLineItem(p, today)));
        if (items.length > 12) {
            lines.push(`<i>... y ${items.length - 12} compromiso(s) más en el panel web de Control de Pagos.</i>`);
        }
        lines.push('');
    }

    lines.push(`<i>SIPE Admin • Control de Pagos (con abonos y saldos en vivo)</i>`);
    return lines.join('\n');
}

function getControlPagosInlineMarkup(data) {
    const active = data?.filterMode || 'resumen';
    const mark = (k, lbl) => (active === k ? `• ${lbl} •` : lbl);
    const rows = [
        [
            { text: mark('vencidos', '🔴 Vencidos'), callback_data: 'tg_pago:f:vencidos' },
            { text: mark('hoy', '📅 Hoy'), callback_data: 'tg_pago:f:hoy' },
            { text: mark('semana', '📆 7 Días'), callback_data: 'tg_pago:f:semana' }
        ],
        [
            { text: mark('parciales', '🟡 Parciales'), callback_data: 'tg_pago:f:parciales' },
            { text: mark('cancelados', '✅ Cancelados'), callback_data: 'tg_pago:f:cancelados' },
            { text: mark('resumen', '📊 Resumen'), callback_data: 'tg_pago:f:resumen' }
        ]
    ];

    const firstPending = (data?.pagos || []).find(p => p.estado_pago !== 'CANCELADO' && p.id > 0);
    if (firstPending) {
        const shortDesc = String(firstPending.descripcion || 'Pago').slice(0, 24);
        rows.push([
            { text: `🔔 Programar Aviso MiBot: ${shortDesc}`, callback_data: `tg_pago:rm:${firstPending.id}` }
        ]);
    }

    return { inline_keyboard: rows };
}

/**
 * Cumpleaños del personal desde accountingDb (rh_empleados, solo lectura)
 */
async function getCumpleanosData({
    accountingDb = null,
    scope = 'semana',
    targetMonth = null,
    referenceDate = null
} = {}) {
    const conn = accountingDb !== undefined ? accountingDb : await getAccountingDb().catch(() => null);
    const today = referenceDate || getSvToday();
    const [tY, tM, tD] = today.split('-').map(Number);
    const monthFilter = targetMonth ? Number(targetMonth) : tM;

    if (!conn) {
        return { scope, today, targetMonth: monthFilter, cumpleaneros: [] };
    }

    let rows = [];
    try {
        const [dbRows] = await conn.query(
            `SELECT
                CONCAT(TRIM(e.nombres), ' ', TRIM(e.apellidos)) AS nombre,
                DAY(e.fecha_nacimiento) AS dia,
                MONTH(e.fecha_nacimiento) AS mes,
                YEAR(e.fecha_nacimiento) AS anio_nac,
                COALESCE(c.razon_social, '') AS empresa,
                COALESCE(d.descripcion, 'General') AS departamento
             FROM rh_empleados e
             INNER JOIN companies c ON e.company_id = c.id
             LEFT JOIN rh_departamentos d ON e.departamento_personal_id = d.id
             WHERE e.es_activo = 1 AND e.fecha_nacimiento IS NOT NULL
             ORDER BY MONTH(e.fecha_nacimiento) ASC, DAY(e.fecha_nacimiento) ASC, e.apellidos ASC`
        );
        rows = dbRows || [];
    } catch (err) {
        console.warn('[TelegramProductivity] Error consultando cumpleaños:', err.message);
        return { scope, today, targetMonth: monthFilter, cumpleaneros: [] };
    }

    const todayMs = Date.UTC(tY, tM - 1, tD);
    const matches = [];

    for (const r of rows) {
        const m = Number(r.mes);
        const d = Number(r.dia);
        if (!m || !d) continue;

        let celYear = tY;
        let celMs = Date.UTC(celYear, m - 1, d);
        if (celMs < todayMs) {
            celYear += 1;
            celMs = Date.UTC(celYear, m - 1, d);
        }
        const diffDays = Math.round((celMs - todayMs) / (1000 * 60 * 60 * 24));

        const include =
            (scope === 'hoy' && m === tM && d === tD) ||
            (scope === 'semana' && diffDays >= 0 && diffDays <= 7) ||
            (scope === 'mes' && m === monthFilter);

        if (include) {
            const edadCumple = r.anio_nac ? (celYear - Number(r.anio_nac)) : null;
            matches.push({
                nombre: String(r.nombre || '').trim(),
                dia: d,
                mes: m,
                fecha_celebracion_corta: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
                dias_restantes: scope === 'mes' && m === monthFilter ? (m === tM && d >= tD ? d - tD : diffDays) : diffDays,
                edad: edadCumple && edadCumple > 0 && edadCumple < 110 ? edadCumple : null,
                empresa: String(r.empresa || '').trim(),
                departamento: String(r.departamento || 'General').trim()
            });
        }
    }

    matches.sort((a, b) => a.mes - b.mes || a.dia - b.dia || a.nombre.localeCompare(b.nombre));
    if (scope === 'semana') {
        matches.sort((a, b) => a.dias_restantes - b.dias_restantes);
    }

    return {
        scope,
        today,
        targetMonth: monthFilter,
        cumpleaneros: matches
    };
}

function formatCumpleanosMessage(data) {
    const scope = data?.scope || 'semana';
    const list = data?.cumpleaneros || [];
    const headerScope = scope === 'hoy'
        ? `HOY (${toDisplayDate(data?.today || getSvToday())})`
        : (scope === 'mes' ? `MES DE ${(SPANISH_MONTH_NAMES[data?.targetMonth] || 'ESTE MES').toUpperCase()}` : 'PRÓXIMOS 7 DÍAS');

    const lines = [
        `🎂 <b>CUMPLEAÑOS DEL PERSONAL • ${escapeHtml(headerScope)}</b>`,
        `━━━━━━━━━━━━━━━━━━━━━`
    ];

    if (list.length === 0) {
        lines.push('');
        lines.push(`ℹ️ <i>No se registran cumpleaños de colaboradores activos en este período.</i>`);
        lines.push('');
        lines.push(`<i>SIPE Admin • Talento Humano</i>`);
        return lines.join('\n');
    }

    lines.push(`🎉 <b>Total celebraciones:</b> <code>${list.length}</code>`);
    lines.push('');

    list.slice(0, 18).forEach(b => {
        const badge = b.dias_restantes === 0
            ? '🥳 ¡HOY!'
            : (b.dias_restantes === 1 ? '🎂 Mañana' : `📅 ${b.fecha_celebracion_corta}`);
        const emp = b.empresa ? ` · ${escapeHtml(b.empresa)}` : '';
        lines.push(`• ${badge} — <b>${escapeHtml(b.nombre)}</b>`);
        lines.push(`   └ <i>${escapeHtml(b.departamento)}${emp}</i>`);
    });

    if (list.length > 18) {
        lines.push(`\n<i>... y ${list.length - 18} cumpleaños más en el mes.</i>`);
    }

    lines.push('');
    lines.push(`<i>SIPE Admin • Gestión de Personal</i>`);
    return lines.join('\n');
}

function getCumpleanosInlineMarkup(activeScope = 'semana') {
    const mark = (s, lbl) => (activeScope === s ? `• ${lbl} •` : lbl);
    return {
        inline_keyboard: [
            [
                { text: mark('hoy', '🥳 Hoy'), callback_data: 'tg_bday:hoy' },
                { text: mark('semana', '🎂 7 Días'), callback_data: 'tg_bday:semana' },
                { text: mark('mes', '🗓️ Este Mes'), callback_data: 'tg_bday:mes' }
            ],
            [
                { text: '🗓️ Ver Agenda Completa', callback_data: 'tg_evt:r:semana' }
            ]
        ]
    };
}

/**
 * Intercepta texto libre o nota de voz cuando un usuario está dentro de un wizard activo
 */
async function handleActiveProductivityWizardMessage({ db, externalDb, io, rawText, chatId, user, effectivePerms, voicePrefix = '', transport = {} }) {
    const tgUserIdStr = String(user?.telegram_user_id || '');
    const sendFn = transport.sendTelegramMessage || sendTelegramMessage;
    const keyboard = transport.getMainReplyKeyboard ? transport.getMainReplyKeyboard() : getMainReplyKeyboard();
    const cleanLower = String(rawText || '').toLowerCase().replace(/^[/\s]+/, '');

    // 1. Wizard de Asignación de Tareas
    const taskWiz = getActiveWizard(pendingTaskWizards, tgUserIdStr);
    if (taskWiz) {
        if (['cancelar', 'salir', 'menu', 'start', 'inicio'].includes(cleanLower)) {
            pendingTaskWizards.delete(tgUserIdStr);
            if (cleanLower === 'cancelar' || cleanLower === 'salir') {
                await sendFn(chatId, `${voicePrefix}👌 Asistente de creación de tarea cancelado.`, keyboard);
                return true;
            }
            return false; // dejar que /menu o /start continúen
        }

        if (taskWiz.step === 'ENTER_TITLE') {
            const parsedDetails = extractDateAndTimeFromSpanish(rawText);
            const tituloClean = cleanExtractedTitle(rawText);
            if (tituloClean.length < 3) {
                await sendFn(chatId, `${voicePrefix}⚠️ El título es muy corto. Escribe claramente qué actividad deben realizar los colaboradores (o envía /cancelar).`, keyboard);
                return true;
            }
            taskWiz.step = 'CONFIRM';
            taskWiz.titulo = tituloClean.toUpperCase();
            taskWiz.descripcion = rawText;
            if (parsedDetails.dateExplicit) taskWiz.fecha_vencimiento = parsedDetails.targetDate;
            if (parsedDetails.timeExplicit) taskWiz.hora_limite = parsedDetails.timeHHMM;
            taskWiz.prioridad = inferPriority(rawText);
            taskWiz.categoria = inferTaskCategory(rawText, 'Operaciones');
            taskWiz.updatedAt = Date.now();
            await sendFn(chatId, voicePrefix + formatTaskWizardConfirmText(taskWiz), buildTaskWizardConfirmMarkup());
            return true;
        }
    }

    // 2. Wizard de Programación de Evento / Reunión / Recordatorio
    const evtWiz = getActiveWizard(pendingEventWizards, tgUserIdStr);
    if (evtWiz) {
        if (['cancelar', 'salir', 'menu', 'start', 'inicio'].includes(cleanLower)) {
            pendingEventWizards.delete(tgUserIdStr);
            if (cleanLower === 'cancelar' || cleanLower === 'salir') {
                await sendFn(chatId, `${voicePrefix}👌 Asistente de programación de evento cancelado.`, keyboard);
                return true;
            }
            return false;
        }

        const selSet = new Set((evtWiz.selectedTgIds || []).map(Number));
        if (selSet.size === 0) {
            await sendFn(chatId, `${voicePrefix}⚠️ Selecciona primero al menos un participante arriba antes de escribir el asunto.`, buildEventWizardMarkup(evtWiz));
            return true;
        }

        const parsedEvt = parseScheduleEventInput(rawText, evtWiz.candidates || [], user.id);
        const titulo = parsedEvt.titulo || cleanExtractedTitle(rawText);
        if (!titulo || titulo.length < 3) {
            await sendFn(chatId, `${voicePrefix}⚠️ Indícame el motivo o asunto del recordatorio/reunión (por ejemplo: <i>"Revisar cierre mañana 10am"</i>).`, buildEventWizardMarkup(evtWiz));
            return true;
        }

        const actorUser = {
            id: effectivePerms?.linkedUser?.id || user?.user_id || 1,
            nombre: effectivePerms?.linkedUser?.nombre || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Telegram',
            username: effectivePerms?.linkedUser?.username || user.telegram_username || 'telegram'
        };

        try {
            const created = await createMibotProgramacion({
                db,
                externalDb,
                payload: {
                    tipo: evtWiz.tipo,
                    titulo: titulo.slice(0, 175),
                    mensaje: String(rawText).trim(),
                    destinatario_ids: [...selSet],
                    enviar_ahora: false,
                    programado_para: parsedEvt.programado_para,
                    frecuencia: evtWiz.frecuencia
                },
                actorUser,
                sendTelegramFn: sendFn,
                io: io || getRealtimeIo(),
                skipSystemNotification: true
            });
            pendingEventWizards.delete(tgUserIdStr);
            const prog = created.programacion;
            const meta = TIPO_META[prog.tipo] || TIPO_META.REUNION;
            const destNames = (prog.destinatarios || []).map(d => escapeHtml(d.nombre_destinatario)).join(', ');
            const okMsg = [
                `✅ <b>${meta.emoji} RECORDATORIO PROGRAMADO EN MIBOT</b>`,
                `━━━━━━━━━━━━━━━━━━━━━`,
                `📌 <b>${escapeHtml(prog.titulo)}</b>`,
                `• 🗓️ <b>Fecha / Hora:</b> ${formatDisplayDateTimeSv(prog.programado_para)}`,
                `• 🔁 <b>Frecuencia:</b> ${FRECUENCIA_LABELS[prog.frecuencia] || prog.frecuencia}`,
                `• 👥 <b>Destinatarios:</b> ${destNames}`,
                ``,
                `<i>MiBot notificará personalmente a cada participante en la fecha y hora programada.</i>`
            ].join('\n');
            await sendFn(chatId, voicePrefix + okMsg, getEventosInlineMarkup('semana'));
        } catch (evtErr) {
            await sendFn(chatId, `${voicePrefix}❌ No se pudo programar el evento: ${escapeHtml(evtErr.message)}`, keyboard);
        }
        return true;
    }

    return false;
}

/**
 * Maneja callbacks fail-closed para tg_tsk:*, tg_evt:*, tg_pago:*, tg_bday:*
 */
async function handleProductivityCallbackQuery({
    db,
    externalDb = null,
    accountingDb = null,
    io = null,
    cq,
    tgUser,
    effPerms,
    transport = {}
}) {
    const data = String(cq?.data || '').trim();
    if (
        !data.startsWith('tg_tsk:') &&
        !data.startsWith('tg_evt:') &&
        !data.startsWith('tg_pago:') &&
        !data.startsWith('tg_bday:')
    ) {
        return false;
    }

    const answerFn = transport.answerCallbackQuery || answerCallbackQuery;
    const editMarkupFn = transport.editMessageReplyMarkup || editMessageReplyMarkup;
    const sendFn = transport.sendTelegramMessage || sendTelegramMessage;
    const sendActionFn = transport.sendChatAction || sendChatAction;
    const keyboard = transport.getMainReplyKeyboard ? transport.getMainReplyKeyboard() : getMainReplyKeyboard();

    const chatId = cq.message?.chat?.id || tgUser?.telegram_user_id;
    const messageId = cq.message?.message_id;
    const tgUserIdStr = String(tgUser?.telegram_user_id || '');
    const sipeUserId = effPerms?.linkedUser?.id ? Number(effPerms.linkedUser.id) : (tgUser?.user_id ? Number(tgUser.user_id) : null);
    const canManageTeam = Boolean(effPerms?.tareas || effPerms?.isAdmin);
    const canControlPagos = Boolean(effPerms?.control_pagos || effPerms?.saldos_banco || effPerms?.isAdmin);
    const canCumpleanos = Boolean(effPerms?.cumpleanos ?? (effPerms?.ventas || effPerms?.alertas || effPerms?.isAdmin));

    // 1. CALLBACKS DE TAREAS (tg_tsk:*)
    if (data.startsWith('tg_tsk:')) {
        if (data === 'tg_tsk:new') {
            await answerFn(cq.id, 'Abriendo asistente de asignación...');
            await startTaskAssignmentWizard({ db, chatId, tgUser, effPerms, transport });
            return true;
        }

        if (data === 'tg_tsk:wcancel') {
            pendingTaskWizards.delete(tgUserIdStr);
            await answerFn(cq.id, 'Asistente cancelado');
            if (chatId && messageId) {
                await editMarkupFn(chatId, messageId, { inline_keyboard: [[{ text: '❌ Asignación cancelada', callback_data: 'noop' }]] });
            }
            return true;
        }

        if (data.startsWith('tg_tsk:wt:')) {
            const wiz = getActiveWizard(pendingTaskWizards, tgUserIdStr);
            if (!wiz) {
                await answerFn(cq.id, '⌛ Sesión expirada. Envía /asignar para iniciar de nuevo.');
                return true;
            }
            const key = data.slice('tg_tsk:wt:'.length);
            const set = new Set(wiz.selectedKeys || []);
            if (set.has(key)) set.delete(key);
            else set.add(key);
            wiz.selectedKeys = [...set];
            wiz.updatedAt = Date.now();
            await answerFn(cq.id, `${wiz.selectedKeys.length} colaborador(es) seleccionado(s)`);
            if (chatId && messageId) {
                await editMarkupFn(chatId, messageId, buildTaskWizardStep1Markup(wiz));
            }
            return true;
        }

        if (data === 'tg_tsk:wn') {
            const wiz = getActiveWizard(pendingTaskWizards, tgUserIdStr);
            if (!wiz) {
                await answerFn(cq.id, '⌛ Sesión expirada. Envía /asignar para iniciar de nuevo.');
                return true;
            }
            if (!wiz.selectedKeys || wiz.selectedKeys.length === 0) {
                await answerFn(cq.id, '⚠️ Selecciona al menos 1 colaborador primero.');
                return true;
            }
            wiz.step = 'ENTER_TITLE';
            wiz.updatedAt = Date.now();
            const names = wiz.candidates.filter(c => wiz.selectedKeys.includes(c.key)).map(c => escapeHtml(c.nombre)).join(', ');
            await answerFn(cq.id, 'Escribe el título de la tarea');
            await sendFn(
                chatId,
                `✍️ <b>PASO 2/3 — DESCRIPCIÓN DE LA TAREA</b>\n\n` +
                `👥 <b>Para:</b> ${names}\n\n` +
                `Escribe (o envía nota de voz con) el título y fecha/hora límite.\n` +
                `<i>Ejemplo: "Revisar arqueo de Miraflores mañana 10am urgente"</i>\n` +
                `<i>(Envía /cancelar para salir)</i>`,
                keyboard
            );
            return true;
        }

        if (data.startsWith('tg_tsk:wp:')) {
            const wiz = getActiveWizard(pendingTaskWizards, tgUserIdStr);
            if (!wiz) {
                await answerFn(cq.id, '⌛ Sesión expirada.');
                return true;
            }
            const pr = data.split(':')[2];
            if (PRIORIDAD_META[pr]) wiz.prioridad = pr;
            wiz.updatedAt = Date.now();
            await answerFn(cq.id, `Prioridad: ${PRIORIDAD_META[wiz.prioridad].label}`);
            await sendFn(chatId, formatTaskWizardConfirmText(wiz), buildTaskWizardConfirmMarkup());
            return true;
        }

        if (data.startsWith('tg_tsk:wd:')) {
            const wiz = getActiveWizard(pendingTaskWizards, tgUserIdStr);
            if (!wiz) {
                await answerFn(cq.id, '⌛ Sesión expirada.');
                return true;
            }
            const days = parseInt(data.split(':')[2], 10) || 0;
            wiz.fecha_vencimiento = shiftDate(getSvToday(), days);
            wiz.updatedAt = Date.now();
            await answerFn(cq.id, `Fecha límite: ${toDisplayDate(wiz.fecha_vencimiento)}`);
            await sendFn(chatId, formatTaskWizardConfirmText(wiz), buildTaskWizardConfirmMarkup());
            return true;
        }

        if (data.startsWith('tg_tsk:wgo:')) {
            const wiz = getActiveWizard(pendingTaskWizards, tgUserIdStr);
            if (!wiz || !wiz.titulo) {
                await answerFn(cq.id, '⌛ Sesión expirada. Envía /asignar nuevamente.');
                return true;
            }
            const sendMode = data.split(':')[2];
            const chosen = (wiz.candidates || []).filter(c => (wiz.selectedKeys || []).includes(c.key));
            pendingTaskWizards.delete(tgUserIdStr);

            await answerFn(cq.id, '⏳ Creando y notificando tareas...');
            try {
                const res = await createMultiUserTasksFromTelegram({
                    db,
                    externalDb,
                    io,
                    creatorTgUser: tgUser,
                    creatorEffPerms: effPerms,
                    assignees: chosen,
                    titulo: wiz.titulo,
                    descripcion: wiz.descripcion,
                    fecha_vencimiento: wiz.fecha_vencimiento,
                    hora_limite: wiz.hora_limite,
                    prioridad: wiz.prioridad,
                    categoria: wiz.categoria,
                    enviar_ahora: sendMode === 'now',
                    sendTelegramFn: sendFn
                });
                if (chatId && messageId) {
                    await editMarkupFn(chatId, messageId, { inline_keyboard: [[{ text: '✅ Tarea asignada y notificada', callback_data: 'noop' }]] });
                }
                await sendFn(chatId, formatMultiTaskCreationResultMessage(res, wiz), keyboard);
            } catch (createErr) {
                await sendFn(chatId, `❌ ${escapeHtml(createErr.message)}`, keyboard);
            }
            return true;
        }

        // Listar tareas (mine | team | over)
        if (data.startsWith('tg_tsk:l:')) {
            const reqScope = data.split(':')[2] || 'mine';
            const normScope = reqScope === 'over' ? 'overdue' : reqScope;
            if (normScope === 'team' && !canManageTeam) {
                await answerFn(cq.id, '⛔ Sin permiso para ver tareas de todo el equipo.');
                return true;
            }
            await answerFn(cq.id, 'Actualizando tareas...');
            const listData = await getTasksSummaryData({ db, sipeUserId, canManageTeam, scope: normScope });
            await sendFn(chatId, formatTasksMessage(listData), getTasksInlineMarkup(listData));
            return true;
        }

        // Cambiar estado rápido: Iniciar (s) o Completar (d)
        if (data.startsWith('tg_tsk:s:') || data.startsWith('tg_tsk:d:')) {
            const [, actionCode, rawTaskId] = data.split(':');
            const taskId = parseInt(rawTaskId, 10);
            if (!taskId) {
                await answerFn(cq.id, '⚠️ ID de tarea inválido.');
                return true;
            }
            const [tRows] = await db.query('SELECT id, titulo, assigned_to, created_by, estado FROM tasks WHERE id = ? LIMIT 1', [taskId]);
            if (!tRows || tRows.length === 0) {
                await answerFn(cq.id, 'Tarea no encontrada.');
                return true;
            }
            const tRow = tRows[0];
            const isOwner = sipeUserId && (Number(tRow.assigned_to) === sipeUserId || Number(tRow.created_by) === sipeUserId);
            if (!canManageTeam && !isOwner) {
                await answerFn(cq.id, '⛔ No tienes permiso para modificar esta tarea.');
                return true;
            }

            const nextEstado = actionCode === 'd' ? 'completada' : 'en_proceso';
            const extraSql = nextEstado === 'completada' ? ', completada_en = NOW()' : '';
            await db.query(`UPDATE tasks SET estado = ?${extraSql} WHERE id = ?`, [nextEstado, taskId]);

            const actorName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || tgUser.telegram_username || 'Telegram';
            const commentActorId = sipeUserId || Number(tRow.assigned_to);
            if (commentActorId) {
                const commentText = nextEstado === 'completada'
                    ? `✔️ [Bot Telegram] ${actorName} marcó la tarea como completada.`
                    : `▶ [Bot Telegram] ${actorName} inició la tarea (En Proceso).`;
                await db.query('INSERT INTO task_comments (task_id, user_id, comentario) VALUES (?, ?, ?)', [taskId, commentActorId, commentText]).catch(() => {});
            }

            const activeIo = io || getRealtimeIo();
            if (activeIo) {
                activeIo.emit('tasks:changed', { action: 'status_changed', taskId, estado: nextEstado, source: 'telegram_bot' });
            }

            await answerFn(cq.id, nextEstado === 'completada' ? `✔️ Tarea #${taskId} completada` : `▶ Tarea #${taskId} en proceso`);
            const refreshed = await getTasksSummaryData({ db, sipeUserId, canManageTeam, scope: 'mine' });
            await sendFn(chatId, formatTasksMessage(refreshed), getTasksInlineMarkup(refreshed));
            return true;
        }
    }

    // 2. CALLBACKS DE AGENDA Y EVENTOS (tg_evt:*)
    if (data.startsWith('tg_evt:')) {
        if (data === 'tg_evt:new') {
            await answerFn(cq.id, 'Abriendo asistente de eventos...');
            await startEventScheduleWizard({ db, chatId, tgUser, defaultTipo: 'REUNION', transport });
            return true;
        }

        if (data === 'tg_evt:wcancel') {
            pendingEventWizards.delete(tgUserIdStr);
            await answerFn(cq.id, 'Programación cancelada');
            if (chatId && messageId) {
                await editMarkupFn(chatId, messageId, { inline_keyboard: [[{ text: '❌ Programación cancelada', callback_data: 'noop' }]] });
            }
            return true;
        }

        if (data.startsWith('tg_evt:wt:')) {
            const wiz = getActiveWizard(pendingEventWizards, tgUserIdStr);
            if (!wiz) {
                await answerFn(cq.id, '⌛ Sesión expirada. Envía /agendar.');
                return true;
            }
            const nextTipo = data.split(':')[2];
            if (MIBOT_TIPOS.includes(nextTipo)) wiz.tipo = nextTipo;
            wiz.updatedAt = Date.now();
            await answerFn(cq.id, `Tipo: ${TIPO_META[wiz.tipo]?.label || wiz.tipo}`);
            if (chatId && messageId) {
                await editMarkupFn(chatId, messageId, buildEventWizardMarkup(wiz));
            }
            return true;
        }

        if (data.startsWith('tg_evt:wf:')) {
            const wiz = getActiveWizard(pendingEventWizards, tgUserIdStr);
            if (!wiz) {
                await answerFn(cq.id, '⌛ Sesión expirada. Envía /agendar.');
                return true;
            }
            const freq = data.split(':')[2];
            if (FRECUENCIA_LABELS[freq]) wiz.frecuencia = freq;
            wiz.updatedAt = Date.now();
            await answerFn(cq.id, `Frecuencia: ${FRECUENCIA_LABELS[wiz.frecuencia]}`);
            if (chatId && messageId) {
                await editMarkupFn(chatId, messageId, buildEventWizardMarkup(wiz));
            }
            return true;
        }

        if (data.startsWith('tg_evt:wu:')) {
            const wiz = getActiveWizard(pendingEventWizards, tgUserIdStr);
            if (!wiz) {
                await answerFn(cq.id, '⌛ Sesión expirada. Envía /agendar.');
                return true;
            }
            const tgRowId = parseInt(data.split(':')[2], 10);
            const set = new Set((wiz.selectedTgIds || []).map(Number));
            if (set.has(tgRowId)) set.delete(tgRowId);
            else set.add(tgRowId);
            wiz.selectedTgIds = [...set];
            wiz.updatedAt = Date.now();
            await answerFn(cq.id, `${wiz.selectedTgIds.length} participante(s)`);
            if (chatId && messageId) {
                await editMarkupFn(chatId, messageId, buildEventWizardMarkup(wiz));
            }
            return true;
        }

        if (data.startsWith('tg_evt:r:')) {
            const reqRange = data.split(':')[2] || 'semana';
            await answerFn(cq.id, 'Consultando agenda...');
            sendActionFn(chatId, 'typing').catch(() => {});
            const agendaData = await getEventosProgramadosData({
                db,
                externalDb,
                accountingDb,
                telegramUserId: tgUser.telegram_user_id,
                sipeUserId,
                range: reqRange,
                includeControlPagos: canControlPagos,
                includeTeam: canManageTeam
            });
            await sendFn(chatId, formatEventosProgramadosMessage(agendaData), getEventosInlineMarkup(reqRange));
            return true;
        }
    }

    // 3. CALLBACKS DE CONTROL DE PAGOS (tg_pago:*)
    if (data.startsWith('tg_pago:')) {
        if (!canControlPagos) {
            await answerFn(cq.id, '⛔ No tienes permiso asignado para consultar Control de Pagos.');
            return true;
        }

        if (data.startsWith('tg_pago:f:')) {
            const fMode = data.split(':')[2] || 'resumen';
            await answerFn(cq.id, 'Consultando Control de Pagos...');
            sendActionFn(chatId, 'typing').catch(() => {});
            const pagosData = await getControlPagosDetailedData({
                db,
                externalDb,
                filterMode: fMode
            });
            await sendFn(chatId, formatControlPagosMessage(pagosData), getControlPagosInlineMarkup(pagosData));
            return true;
        }

        if (data.startsWith('tg_pago:rm:')) {
            const venId = parseInt(data.split(':')[2], 10);
            if (!venId || !tgUser?.id) {
                await answerFn(cq.id, '⚠️ Vencimiento inválido.');
                return true;
            }
            await answerFn(cq.id, '🔔 Programando recordatorio MiBot...');
            try {
                const today = getSvToday();
                const nowSv = getElSalvadorNowSql();
                const ext = externalDb || await getExternalDb().catch(() => null);
                let progTitulo = `Recordatorio de Pago #${venId}`;
                let venceStr = shiftDate(today, 1);
                if (ext) {
                    const [vRows] = await ext.query(
                        `SELECT a.vencimiento, b.descripcion, c.descripcion AS ubicacion, b.monto
                         FROM web_rc_recordatorios_vencimientos a
                         INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
                         LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
                         WHERE a.id = ? LIMIT 1`,
                        [venId]
                    );
                    if (vRows && vRows[0]) {
                        progTitulo = `Pago: ${vRows[0].descripcion}`.slice(0, 175);
                        if (vRows[0].vencimiento) venceStr = String(vRows[0].vencimiento).slice(0, 10);
                    }
                }
                const targetSchedule = venceStr <= today
                    ? addMinutesToSvSql(nowSv, 120)
                    : `${venceStr} 08:00:00`;

                const actorUser = {
                    id: sipeUserId || null,
                    nombre: effPerms?.linkedUser?.nombre || `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || 'Telegram',
                    username: effPerms?.linkedUser?.username || tgUser.telegram_username || 'telegram'
                };
                const res = await createMibotProgramacion({
                    db,
                    externalDb: ext,
                    payload: {
                        tipo: 'RECORDATORIO_PAGO',
                        titulo: progTitulo,
                        mensaje: `Recordatorio programado desde Control de Pagos en Telegram para validar o gestionar este compromiso.`,
                        vencimiento_id: venId,
                        destinatario_ids: [Number(tgUser.id)],
                        enviar_ahora: false,
                        programado_para: targetSchedule,
                        frecuencia: 'DIARIO_HASTA_PAGAR'
                    },
                    actorUser,
                    sendTelegramFn: sendFn,
                    io: io || getRealtimeIo(),
                    skipSystemNotification: true
                });

                const prog = res.programacion;
                await sendFn(
                    chatId,
                    `🔔 <b>Recordatorio de Pago Programado en MiBot</b>\n\n` +
                    `💳 <b>${escapeHtml(prog.titulo)}</b>\n` +
                    `• 🗓️ <b>Próximo aviso:</b> ${formatDisplayDateTimeSv(prog.proximo_envio_at || prog.programado_para)}\n` +
                    `• 🔁 <b>Frecuencia:</b> Diario hasta cancelar pago`,
                    getControlPagosInlineMarkup({ filterMode: 'resumen', pagos: [] })
                );
            } catch (rmErr) {
                await sendFn(chatId, `❌ No se pudo programar el recordatorio: ${escapeHtml(rmErr.message)}`, keyboard);
            }
            return true;
        }
    }

    // 4. CALLBACKS DE CUMPLEAÑOS (tg_bday:*)
    if (data.startsWith('tg_bday:')) {
        if (!canCumpleanos) {
            await answerFn(cq.id, '⛔ Sin permiso para consultar cumpleaños del personal.');
            return true;
        }
        const scope = data.split(':')[1] || 'semana';
        await answerFn(cq.id, 'Consultando cumpleaños...');
        const bData = await getCumpleanosData({ accountingDb, scope });
        await sendFn(chatId, formatCumpleanosMessage(bData), getCumpleanosInlineMarkup(scope));
        return true;
    }

    return false;
}

module.exports = {
    pendingTaskWizards,
    pendingEventWizards,
    clearProductivityWizards,
    pruneProductivityWizards,
    resolveCollaboratorCandidates,
    extractDateAndTimeFromSpanish,
    parseMultiUserTaskInput,
    createMultiUserTasksFromTelegram,
    formatMultiTaskCreationResultMessage,
    startTaskAssignmentWizard,
    getTasksSummaryData,
    formatTasksMessage,
    getTasksInlineMarkup,
    getEventosProgramadosData,
    formatEventosProgramadosMessage,
    getEventosInlineMarkup,
    parseScheduleEventInput,
    startEventScheduleWizard,
    parseControlPagosQuery,
    getControlPagosDetailedData,
    formatControlPagosMessage,
    getControlPagosInlineMarkup,
    getCumpleanosData,
    formatCumpleanosMessage,
    getCumpleanosInlineMarkup,
    handleActiveProductivityWizardMessage,
    handleProductivityCallbackQuery
};
