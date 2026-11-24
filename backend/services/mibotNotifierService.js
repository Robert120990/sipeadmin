const cron = require('node-cron');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);
const { escapeHtml } = require('./telegramTextAndDates');
const {
    sendTelegramMessage,
    answerCallbackQuery,
    editMessageReplyMarkup
} = require('./telegramTransportService');

const MIBOT_TIMEZONE = 'America/El_Salvador';

let realtimeIo = null;
function setRealtimeIo(ioInstance) {
    if (ioInstance) realtimeIo = ioInstance;
}
function getRealtimeIo() {
    return realtimeIo;
}

const MIBOT_TIPOS = ['RECORDATORIO_PAGO', 'TAREA', 'VALIDACION', 'REUNION'];
const MIBOT_FRECUENCIAS = ['UNA_VEZ', 'DIARIO_HASTA_PAGAR', 'DIARIO', 'SEMANAL'];
const MIBOT_ESTADOS = ['PROGRAMADO', 'ENVIADO', 'COMPLETADO', 'CANCELADO'];

const TIPO_META = {
    RECORDATORIO_PAGO: {
        emoji: '💳',
        label: 'Recordatorio de Pago',
        capabilityField: 'mibot_pagos',
        vistoBtn: '✅ Enterado',
        validarBtn: '💳 Ya gestionado / Pagado'
    },
    TAREA: {
        emoji: '📋',
        label: 'Tarea Asignada',
        capabilityField: 'mibot_tareas',
        vistoBtn: '👀 En proceso',
        validarBtn: '✔️ Tarea completada'
    },
    VALIDACION: {
        emoji: '✅',
        label: 'Validación de Actividad',
        capabilityField: 'mibot_validaciones',
        vistoBtn: '👀 En revisión',
        validarBtn: '✔️ Actividad validada'
    },
    REUNION: {
        emoji: '📅',
        label: 'Recordatorio de Reunión',
        capabilityField: 'mibot_reuniones',
        vistoBtn: '👀 Visto',
        validarBtn: '✅ Confirmo asistencia'
    }
};

const FRECUENCIA_LABELS = {
    UNA_VEZ: 'Una sola vez',
    DIARIO_HASTA_PAGAR: 'Diario hasta cancelar pago',
    DIARIO: 'Todos los días',
    SEMANAL: 'Cada semana'
};

const pad2 = (n) => String(Math.trunc(Number(n) || 0)).padStart(2, '0');

/**
 * Obtiene la fecha/hora actual en zona horaria America/El_Salvador (UTC-6, sin horario de verano)
 */
function getElSalvadorNowParts(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: MIBOT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });
    const parts = {};
    for (const p of fmt.formatToParts(d)) {
        if (p.type !== 'literal') parts[p.type] = p.value;
    }
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour === '24' ? '0' : parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second)
    };
}

function getElSalvadorNowSql(date = new Date()) {
    const p = getElSalvadorNowParts(date);
    return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/**
 * Normaliza una fecha/hora de programación a formato SQL local de El Salvador: 'YYYY-MM-DD HH:mm:ss'
 */
function normalizeScheduleDatetime(input, fallbackDate = new Date()) {
    if (!input) return getElSalvadorNowSql(fallbackDate);

    if (input instanceof Date && !Number.isNaN(input.getTime())) {
        return getElSalvadorNowSql(input);
    }

    const raw = String(input).trim();
    if (!raw) return getElSalvadorNowSql(fallbackDate);

    // Formato local explícito: 'YYYY-MM-DDTHH:mm' o 'YYYY-MM-DD HH:mm(:ss)?'
    const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (localMatch) {
        const [, y, m, d, hh, mm, ss = '00'] = localMatch;
        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    }

    // Solo fecha: 'YYYY-MM-DD' -> default 08:00:00 AM El Salvador
    const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]} 08:00:00`;
    }

    // ISO con Z u offset explícito -> convertir a hora El Salvador
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return getElSalvadorNowSql(parsed);
    }

    return null;
}

/**
 * Convierte un valor DATETIME leído desde MySQL (donde el pool mysql2 usa timezone: 'Z')
 * a string SQL local de El Salvador ('YYYY-MM-DD HH:mm:ss') preservando la hora de reloj
 * almacenada en BD sin restar 6 horas por doble conversión UTC -> America/El_Salvador.
 */
function dbDatetimeToSvSql(val) {
    if (!val) return null;
    if (val instanceof Date && !Number.isNaN(val.getTime())) {
        return `${val.getUTCFullYear()}-${pad2(val.getUTCMonth() + 1)}-${pad2(val.getUTCDate())} ${pad2(val.getUTCHours())}:${pad2(val.getUTCMinutes())}:${pad2(val.getUTCSeconds())}`;
    }
    const raw = String(val).trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?Z?$/);
    if (match) {
        const [, y, m, d, hh, mm, ss = '00'] = match;
        return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    }
    return normalizeScheduleDatetime(raw);
}

/**
 * Suma minutos exactos a un timestamp SQL local de El Salvador sin depender de la TZ del host
 */
function addMinutesToSvSql(sqlDatetime, minutes = 60) {
    const normalized = normalizeScheduleDatetime(sqlDatetime);
    if (!normalized) return null;
    const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return null;
    const ms = Date.UTC(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6])
    ) + (Number(minutes) || 0) * 60 * 1000;
    const next = new Date(ms);
    return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())} ${pad2(next.getUTCHours())}:${pad2(next.getUTCMinutes())}:${pad2(next.getUTCSeconds())}`;
}

/**
 * Calcula la siguiente fecha/hora de ejecución para programaciones recurrentes
 */
function computeNextScheduleSql(currentSql, frecuencia, nowSql = null) {
    const freq = String(frecuencia || 'UNA_VEZ').toUpperCase();
    if (freq === 'UNA_VEZ') return null;

    const stepMinutes = freq === 'SEMANAL' ? 7 * 24 * 60 : 24 * 60;
    const refNow = normalizeScheduleDatetime(nowSql) || getElSalvadorNowSql();
    let candidate = normalizeScheduleDatetime(currentSql) || refNow;

    let guard = 0;
    do {
        candidate = addMinutesToSvSql(candidate, stepMinutes);
        guard += 1;
    } while (candidate && candidate <= refNow && guard < 400);

    return candidate;
}

function formatDisplayDateTimeSv(sqlDatetime) {
    if (!sqlDatetime) return '—';
    const norm = normalizeScheduleDatetime(sqlDatetime);
    if (!norm) return String(sqlDatetime);
    const m = norm.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (!m) return norm;
    const hour24 = Number(m[4]);
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${m[3]}/${m[2]}/${m[1]} ${pad2(hour12)}:${m[5]} ${suffix}`;
}

function formatMoney(amount) {
    const n = Number(amount || 0);
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateOnlyDMY(val) {
    if (!val) return '—';
    const s = val instanceof Date ? val.toISOString().slice(0, 10) : String(val).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

// Cache de inicialización de esquema por instancia de pool
const schemaInitPromises = new WeakMap();

/**
 * Asegura de forma idempotente las columnas MiBot en telegram_usuarios y las tablas
 * mibot_programaciones y mibot_programaciones_destinatarios.
 */
async function ensureMibotSchema(db) {
    if (!db) return;
    if (schemaInitPromises.has(db)) {
        return schemaInitPromises.get(db);
    }

    const initPromise = (async () => {
        try {
            // 1. Extender telegram_usuarios con campos de MiBot Personal y Cargo
            const [cols] = await db.query(
                `SELECT COLUMN_NAME
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'telegram_usuarios'`
            );
            const existingCols = new Set((cols || []).map(c => String(c.COLUMN_NAME || '').toLowerCase()));

            const alterSpecs = [
                { col: 'cargo', sql: 'ALTER TABLE telegram_usuarios ADD COLUMN cargo VARCHAR(120) NULL AFTER last_name' },
                { col: 'recibir_mibot', sql: 'ALTER TABLE telegram_usuarios ADD COLUMN recibir_mibot TINYINT(1) NOT NULL DEFAULT 1 AFTER permiso_alertas' },
                { col: 'mibot_pagos', sql: 'ALTER TABLE telegram_usuarios ADD COLUMN mibot_pagos TINYINT(1) NOT NULL DEFAULT 1 AFTER recibir_mibot' },
                { col: 'mibot_tareas', sql: 'ALTER TABLE telegram_usuarios ADD COLUMN mibot_tareas TINYINT(1) NOT NULL DEFAULT 1 AFTER mibot_pagos' },
                { col: 'mibot_validaciones', sql: 'ALTER TABLE telegram_usuarios ADD COLUMN mibot_validaciones TINYINT(1) NOT NULL DEFAULT 1 AFTER mibot_tareas' },
                { col: 'mibot_reuniones', sql: 'ALTER TABLE telegram_usuarios ADD COLUMN mibot_reuniones TINYINT(1) NOT NULL DEFAULT 1 AFTER mibot_validaciones' }
            ];

            for (const spec of alterSpecs) {
                if (!existingCols.has(spec.col)) {
                    try {
                        await db.query(spec.sql);
                    } catch (alterErr) {
                        if (!/Duplicate column/i.test(String(alterErr.message || ''))) {
                            console.warn(`[MiBot] Aviso agregando columna ${spec.col}:`, alterErr.message);
                        }
                    }
                }
            }
        } catch (colErr) {
            console.warn('[MiBot] No se pudo inspeccionar columnas de telegram_usuarios:', colErr.message);
        }

        // 2. Tabla principal de programaciones MiBot
        await db.query(`
            CREATE TABLE IF NOT EXISTS mibot_programaciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tipo VARCHAR(32) NOT NULL DEFAULT 'RECORDATORIO_PAGO',
                titulo VARCHAR(180) NOT NULL,
                mensaje TEXT NOT NULL,
                vencimiento_id INT NULL,
                recordatorio_id INT NULL,
                task_id INT NULL,
                ubicacion VARCHAR(120) NULL,
                monto_total DECIMAL(14,2) NULL,
                monto_pendiente DECIMAL(14,2) NULL,
                fecha_vencimiento DATE NULL,
                programado_para DATETIME NOT NULL,
                proximo_envio_at DATETIME NULL,
                frecuencia VARCHAR(32) NOT NULL DEFAULT 'UNA_VEZ',
                estado VARCHAR(24) NOT NULL DEFAULT 'PROGRAMADO',
                ultimo_envio_at DATETIME NULL,
                total_envios INT NOT NULL DEFAULT 0,
                created_by_user_id INT NULL,
                created_by_name VARCHAR(120) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mibot_prog_estado_prox (estado, proximo_envio_at),
                INDEX idx_mibot_prog_ven (vencimiento_id, estado),
                INDEX idx_mibot_prog_task (task_id, estado),
                INDEX idx_mibot_prog_tipo (tipo)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        try {
            const [progCols] = await db.query(
                `SELECT COLUMN_NAME
                 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mibot_programaciones'`
            );
            const progColSet = new Set((progCols || []).map(c => String(c.COLUMN_NAME || '').toLowerCase()));
            if (!progColSet.has('task_id')) {
                await db.query('ALTER TABLE mibot_programaciones ADD COLUMN task_id INT NULL AFTER recordatorio_id');
                await db.query('ALTER TABLE mibot_programaciones ADD INDEX idx_mibot_prog_task (task_id, estado)').catch(() => {});
            }
        } catch (progColErr) {
            if (!/Duplicate column/i.test(String(progColErr.message || ''))) {
                console.warn('[MiBot] Aviso verificando task_id en mibot_programaciones:', progColErr.message);
            }
        }

        // 3. Tabla de destinatarios individuales por programación
        await db.query(`
            CREATE TABLE IF NOT EXISTS mibot_programaciones_destinatarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                programacion_id INT NOT NULL,
                telegram_usuario_id INT NOT NULL,
                telegram_user_id VARCHAR(64) NOT NULL,
                nombre_destinatario VARCHAR(150) NOT NULL,
                cargo VARCHAR(120) NULL,
                estado_entrega VARCHAR(24) NOT NULL DEFAULT 'PENDIENTE',
                enviado_at DATETIME NULL,
                respondido_at DATETIME NULL,
                pospuesto_hasta DATETIME NULL,
                respuesta_nota VARCHAR(255) NULL,
                telegram_message_id BIGINT NULL,
                error_msg VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_mibot_prog_user (programacion_id, telegram_usuario_id),
                INDEX idx_mibot_dest_prog (programacion_id),
                INDEX idx_mibot_dest_tg (telegram_user_id),
                INDEX idx_mibot_dest_posp (estado_entrega, pospuesto_hasta),
                CONSTRAINT fk_mibot_dest_prog
                    FOREIGN KEY (programacion_id) REFERENCES mibot_programaciones(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    })().catch((err) => {
        schemaInitPromises.delete(db);
        throw err;
    });

    schemaInitPromises.set(db, initPromise);
    return initPromise;
}

/**
 * Construye el nombre completo legible de un usuario de Telegram
 */
function resolveRecipientDisplayName(row = {}) {
    const tgFull = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    if (tgFull) return tgFull;
    if (row.sipe_nombre) return String(row.sipe_nombre).trim();
    if (row.telegram_username) return String(row.telegram_username).trim();
    return `Usuario #${row.id || row.telegram_user_id || ''}`;
}

/**
 * Formatea un mensaje personal de Telegram enviado por MiBot a un destinatario específico
 */
function formatMibotPersonalMessage({
    programacion,
    destinatario,
    otrosDestinatarios = [],
    paymentLiveStatus = null,
    isSnoozeFollowup = false
}) {
    const tipo = MIBOT_TIPOS.includes(programacion?.tipo) ? programacion.tipo : 'RECORDATORIO_PAGO';
    const meta = TIPO_META[tipo] || TIPO_META.RECORDATORIO_PAGO;

    const nombre = escapeHtml(destinatario?.nombre_destinatario || 'Equipo SIPE');
    const cargoStr = destinatario?.cargo ? ` <i>(${escapeHtml(destinatario.cargo)})</i>` : '';
    const titulo = escapeHtml(programacion?.titulo || meta.label);
    const cuerpo = escapeHtml(programacion?.mensaje || '');

    const lines = [];
    lines.push(`🤖 <b>MiBot SIPE · ${meta.emoji} ${meta.label}</b>`);
    if (isSnoozeFollowup) {
        lines.push(`⏰ <i>Recordatorio pospuesto (1 hora después)</i>`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`👋 Hola <b>${nombre}</b>${cargoStr},`);
    lines.push('');
    lines.push(`📌 <b>${titulo}</b>`);
    if (cuerpo) {
        lines.push(cuerpo);
    }

    // Contexto financiero en tiempo real si está vinculado a Control de Pagos o contexto de Tarea/Actividad
    const isTaskContext = Boolean(programacion?.task_id) ||
        (['TAREA', 'VALIDACION', 'REUNION'].includes(tipo) && !programacion?.vencimiento_id && (programacion?.monto_pendiente === null || programacion?.monto_pendiente === undefined));

    const hasPaymentInfo = !isTaskContext && Boolean(
        programacion?.vencimiento_id ||
        programacion?.ubicacion ||
        (programacion?.monto_pendiente !== null && programacion?.monto_pendiente !== undefined)
    );

    if (isTaskContext && (programacion?.task_id || programacion?.ubicacion || programacion?.fecha_vencimiento)) {
        lines.push('');
        lines.push(`📋 <b>Detalle de Tarea / Actividad:</b>`);
        if (programacion.task_id) {
            lines.push(`• <b>Tarea en SIPE Admin:</b> #${Number(programacion.task_id)}`);
        }
        if (programacion.ubicacion) {
            lines.push(`• <b>Categoría / Área:</b> ${escapeHtml(programacion.ubicacion)}`);
        }
        if (programacion.fecha_vencimiento) {
            lines.push(`• <b>Fecha Límite:</b> ${escapeHtml(formatDateOnlyDMY(programacion.fecha_vencimiento))}`);
        }
    } else if (hasPaymentInfo) {
        lines.push('');
        lines.push(`💼 <b>Detalle de Control de Pagos:</b>`);
        if (programacion.ubicacion) {
            lines.push(`• <b>Ubicación:</b> ${escapeHtml(programacion.ubicacion)}`);
        }
        if (programacion.fecha_vencimiento) {
            lines.push(`• <b>Vencimiento:</b> ${escapeHtml(formatDateOnlyDMY(programacion.fecha_vencimiento))}`);
        }
        const liveTotal = paymentLiveStatus?.montoTotal ?? programacion.monto_total;
        const liveSaldo = paymentLiveStatus?.saldoPendiente ?? programacion.monto_pendiente;
        const livePagado = paymentLiveStatus?.montoPagado;
        if (liveTotal !== null && liveTotal !== undefined && Number(liveTotal) > 0) {
            lines.push(`• <b>Monto total:</b> ${formatMoney(liveTotal)}`);
        }
        if (livePagado !== null && livePagado !== undefined && Number(livePagado) > 0) {
            lines.push(`• <b>Abonado:</b> ${formatMoney(livePagado)}`);
        }
        if (liveSaldo !== null && liveSaldo !== undefined) {
            lines.push(`• <b>Saldo pendiente:</b> <b>${formatMoney(liveSaldo)}</b>`);
        }
    }

    // Lista de co-participantes notificados personalmente
    const otherNames = (otrosDestinatarios || [])
        .map(o => {
            const n = escapeHtml(o.nombre_destinatario || '');
            return o.cargo ? `${n} (${escapeHtml(o.cargo)})` : n;
        })
        .filter(Boolean);

    if (otherNames.length > 0) {
        lines.push('');
        lines.push(`👥 <b>También notificados (${otherNames.length}):</b> ${otherNames.join(', ')}`);
    }

    lines.push('');
    const freqLabel = FRECUENCIA_LABELS[programacion?.frecuencia] || 'Una sola vez';
    const metaFooter = [`🗓️ ${formatDisplayDateTimeSv(programacion?.programado_para)}`];
    if (programacion?.frecuencia && programacion.frecuencia !== 'UNA_VEZ') {
        metaFooter.push(`🔁 ${freqLabel}`);
    }
    if (programacion?.created_by_name) {
        metaFooter.push(`👤 Por: ${escapeHtml(programacion.created_by_name)}`);
    }
    lines.push(`<i>${metaFooter.join('  ·  ')}</i>`);
    lines.push('');
    lines.push(`<i>Responde usando los botones de abajo para confirmar recepción o validar la actividad:</i>`);

    return lines.join('\n');
}

/**
 * Construye el teclado inline interactivo para que cada usuario responda personalmente en Telegram
 */
function buildMibotInlineKeyboard(destinatarioId, tipo = 'RECORDATORIO_PAGO') {
    const meta = TIPO_META[tipo] || TIPO_META.RECORDATORIO_PAGO;
    const idNum = Number(destinatarioId);
    return {
        inline_keyboard: [
            [
                { text: meta.vistoBtn, callback_data: `mibot:visto:${idNum}` },
                { text: meta.validarBtn, callback_data: `mibot:validar:${idNum}` }
            ],
            [
                { text: '⏰ Recordar en 1 hora', callback_data: `mibot:posponer:${idNum}` }
            ]
        ]
    };
}

/**
 * Consulta en vivo el estado del pago vinculado en Control de Pagos para auto-detener
 * recordatorios repetitivos si ya se canceló al 100%, o actualizar el saldo real si tuvo abonos parciales.
 */
async function checkLinkedPaymentStatus(db, externalDb, vencimientoId) {
    const vid = Number(vencimientoId);
    if (!Number.isFinite(vid) || vid <= 0) return null;

    let montoTotal = null;
    let legacyEstado = null;
    let ubicacion = null;
    let descripcion = null;
    let fechaVencimiento = null;
    let recordatorioId = null;

    if (externalDb) {
        try {
            const [venRows] = await externalDb.query(
                `SELECT a.id, a.id_recordatorio, a.vencimiento, a.estado,
                        b.descripcion, b.monto, c.descripcion AS ubicacion
                 FROM web_rc_recordatorios_vencimientos a
                 INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
                 LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
                 WHERE a.id = ?
                 LIMIT 1`,
                [vid]
            );
            if (venRows && venRows.length > 0) {
                const v = venRows[0];
                montoTotal = Number(v.monto || 0);
                legacyEstado = String(v.estado || 'P').toUpperCase();
                ubicacion = v.ubicacion || null;
                descripcion = v.descripcion || null;
                fechaVencimiento = v.vencimiento ? String(v.vencimiento).slice(0, 10) : null;
                recordatorioId = v.id_recordatorio ? Number(v.id_recordatorio) : null;
            }
        } catch (err) {
            console.warn('[MiBot] No se pudo consultar vencimiento externo:', err.message);
        }
    }

    let montoPagado = 0;
    let abonosCount = 0;
    if (db) {
        try {
            const [abRows] = await db.query(
                `SELECT COUNT(*) AS cnt, COALESCE(SUM(monto), 0) AS total_pagado
                 FROM recordatorios_pagos_abonos
                 WHERE vencimiento_id = ?`,
                [vid]
            );
            if (abRows && abRows.length > 0) {
                abonosCount = Number(abRows[0].cnt || 0);
                montoPagado = Math.round(Number(abRows[0].total_pagado || 0) * 100) / 100;
            }
        } catch (_) {
            // Tabla de abonos podría no existir aún en entornos mínimos
        }
    }

    if (montoTotal === null && abonosCount === 0) return null;

    const total = Number(montoTotal || 0);
    const isPaidLegacy = legacyEstado === 'C' || legacyEstado === 'CANCELADO';
    let effectivePaid = montoPagado;
    if (abonosCount === 0 && isPaidLegacy) {
        effectivePaid = total;
    }
    const saldoPendiente = Math.max(0, Math.round((total - effectivePaid) * 100) / 100);
    const isPaid = total > 0 ? (saldoPendiente <= 0.005 || (abonosCount === 0 && isPaidLegacy)) : isPaidLegacy;

    return {
        exists: true,
        isPaid,
        montoTotal: total,
        montoPagado: effectivePaid,
        saldoPendiente,
        ubicacion,
        descripcion,
        fechaVencimiento,
        recordatorioId
    };
}

/**
 * Obtiene usuarios registrados y autorizados de Telegram elegibles para recibir mensajes de MiBot
 */
async function getEligibleMibotRecipients(db, { tipo = null, includeAllActive = false } = {}) {
    await ensureMibotSchema(db);
    const [rows] = await db.query(`
        SELECT tu.id, tu.telegram_user_id, tu.telegram_username, tu.first_name, tu.last_name,
               tu.cargo, tu.user_id, tu.activo,
               tu.recibir_mibot, tu.mibot_pagos, tu.mibot_tareas, tu.mibot_validaciones, tu.mibot_reuniones,
               tu.notas, u.nombre AS sipe_nombre, r.name AS sipe_role_name
        FROM telegram_usuarios tu
        LEFT JOIN users u ON tu.user_id = u.id
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE tu.activo = 1
        ORDER BY COALESCE(NULLIF(TRIM(CONCAT(COALESCE(tu.first_name, ''), ' ', COALESCE(tu.last_name, ''))), ''), u.nombre, tu.telegram_username) ASC
    `);

    const capField = tipo && TIPO_META[tipo] ? TIPO_META[tipo].capabilityField : null;

    return (rows || [])
        .map(r => ({
            id: Number(r.id),
            telegram_user_id: String(r.telegram_user_id),
            telegram_username: r.telegram_username || null,
            first_name: r.first_name || '',
            last_name: r.last_name || '',
            nombre_completo: resolveRecipientDisplayName(r),
            cargo: r.cargo || r.sipe_role_name || null,
            cargo_custom: r.cargo || '',
            user_id: r.user_id ? Number(r.user_id) : null,
            sipe_nombre: r.sipe_nombre || null,
            sipe_role_name: r.sipe_role_name || null,
            recibir_mibot: Boolean(r.recibir_mibot ?? 1),
            mibot_pagos: Boolean(r.mibot_pagos ?? 1),
            mibot_tareas: Boolean(r.mibot_tareas ?? 1),
            mibot_validaciones: Boolean(r.mibot_validaciones ?? 1),
            mibot_reuniones: Boolean(r.mibot_reuniones ?? 1),
            apto_para_tipo: Boolean(r.recibir_mibot ?? 1) && (!capField || Boolean(r[capField] ?? 1))
        }))
        .filter(u => includeAllActive || u.recibir_mibot);
}

/**
 * Carga una programación por ID con todos sus destinatarios y resumen de entrega
 */
async function getMibotProgramacionById(db, programacionId) {
    await ensureMibotSchema(db);
    const id = Number(programacionId);
    if (!Number.isFinite(id) || id <= 0) return null;

    const [progRows] = await db.query(
        'SELECT * FROM mibot_programaciones WHERE id = ? LIMIT 1',
        [id]
    );
    if (!progRows || progRows.length === 0) return null;

    const [destRows] = await db.query(
        `SELECT * FROM mibot_programaciones_destinatarios
         WHERE programacion_id = ?
         ORDER BY nombre_destinatario ASC, id ASC`,
        [id]
    );

    return hydrateProgramacionRow(progRows[0], destRows || []);
}

function hydrateProgramacionRow(prog, destRows = []) {
    const counts = {
        total: destRows.length,
        pendientes: 0,
        enviados: 0,
        vistos: 0,
        validados: 0,
        pospuestos: 0,
        errores: 0
    };

    for (const d of destRows) {
        const est = String(d.estado_entrega || 'PENDIENTE').toUpperCase();
        if (est === 'PENDIENTE') counts.pendientes += 1;
        else if (est === 'ENVIADO') counts.enviados += 1;
        else if (est === 'VISTO') counts.vistos += 1;
        else if (est === 'VALIDADO') counts.validados += 1;
        else if (est === 'POSPUESTO') counts.pospuestos += 1;
        else if (est === 'ERROR') counts.errores += 1;
    }

    return {
        ...prog,
        id: Number(prog.id),
        vencimiento_id: prog.vencimiento_id ? Number(prog.vencimiento_id) : null,
        recordatorio_id: prog.recordatorio_id ? Number(prog.recordatorio_id) : null,
        task_id: prog.task_id ? Number(prog.task_id) : null,
        monto_total: prog.monto_total !== null && prog.monto_total !== undefined ? Number(prog.monto_total) : null,
        monto_pendiente: prog.monto_pendiente !== null && prog.monto_pendiente !== undefined ? Number(prog.monto_pendiente) : null,
        programado_para: dbDatetimeToSvSql(prog.programado_para),
        proximo_envio_at: dbDatetimeToSvSql(prog.proximo_envio_at),
        ultimo_envio_at: dbDatetimeToSvSql(prog.ultimo_envio_at),
        total_envios: Number(prog.total_envios || 0),
        destinatarios: destRows.map(d => ({
            ...d,
            id: Number(d.id),
            programacion_id: Number(d.programacion_id),
            telegram_usuario_id: Number(d.telegram_usuario_id),
            enviado_at: dbDatetimeToSvSql(d.enviado_at),
            respondido_at: dbDatetimeToSvSql(d.respondido_at),
            pospuesto_hasta: dbDatetimeToSvSql(d.pospuesto_hasta)
        })),
        resumen_entrega: counts
    };
}

/**
 * Verifica si el actor tiene permiso (fail-closed) para modificar/cancelar una programación MiBot
 */
function canActorModifyProgramacion(prog, { actorTgUserId = null, actorSipeUserId = null, isAdmin = false } = {}) {
    if (!prog) return false;
    if (isAdmin) return true;
    if (actorSipeUserId && prog.created_by_user_id && Number(prog.created_by_user_id) === Number(actorSipeUserId)) {
        return true;
    }
    if (actorTgUserId && Array.isArray(prog.destinatarios)) {
        if (prog.destinatarios.some(d => String(d.telegram_user_id) === String(actorTgUserId))) {
            return true;
        }
    }
    return false;
}

/**
 * Reprograma fecha/hora de una programación MiBot existente (fail-closed)
 */
async function rescheduleMibotProgramacion({
    db,
    programacionId,
    programadoPara,
    actorTgUserId = null,
    actorSipeUserId = null,
    isAdmin = false
}) {
    await ensureMibotSchema(db);
    const id = Number(programacionId);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('ID de programación MiBot inválido.');
        err.status = 400;
        throw err;
    }

    const normalizedWhen = normalizeScheduleDatetime(programadoPara);
    if (!normalizedWhen) {
        const err = new Error('Fecha/hora de reprogramación inválida.');
        err.status = 400;
        throw err;
    }

    const existing = await getMibotProgramacionById(db, id);
    if (!existing) {
        const err = new Error('Recordatorio o evento MiBot no encontrado.');
        err.status = 404;
        throw err;
    }

    if (!canActorModifyProgramacion(existing, { actorTgUserId, actorSipeUserId, isAdmin })) {
        const err = new Error('No tienes permiso para modificar la fecha u hora de este recordatorio.');
        err.status = 403;
        throw err;
    }

    if (String(existing.estado || '').toUpperCase() === 'CANCELADO') {
        const err = new Error('Este recordatorio ya fue cancelado y no se puede reprogramar.');
        err.status = 400;
        throw err;
    }

    await db.query(
        `UPDATE mibot_programaciones
         SET programado_para = ?, proximo_envio_at = ?, estado = 'PROGRAMADO'
         WHERE id = ?`,
        [normalizedWhen, normalizedWhen, id]
    );

    await db.query(
        `UPDATE mibot_programaciones_destinatarios
         SET estado_entrega = 'PENDIENTE', pospuesto_hasta = NULL, error_msg = NULL
         WHERE programacion_id = ? AND estado_entrega IN ('POSPUESTO', 'ERROR')`,
        [id]
    ).catch(() => {});

    return await getMibotProgramacionById(db, id);
}

/**
 * Cancela una programación MiBot existente (fail-closed)
 */
async function cancelMibotProgramacion({
    db,
    programacionId,
    actorTgUserId = null,
    actorSipeUserId = null,
    isAdmin = false
}) {
    await ensureMibotSchema(db);
    const id = Number(programacionId);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('ID de programación MiBot inválido.');
        err.status = 400;
        throw err;
    }

    const existing = await getMibotProgramacionById(db, id);
    if (!existing) {
        const err = new Error('Recordatorio o evento MiBot no encontrado.');
        err.status = 404;
        throw err;
    }

    if (!canActorModifyProgramacion(existing, { actorTgUserId, actorSipeUserId, isAdmin })) {
        const err = new Error('No tienes permiso para cancelar este recordatorio.');
        err.status = 403;
        throw err;
    }

    await db.query(
        `UPDATE mibot_programaciones
         SET estado = 'CANCELADO', proximo_envio_at = NULL
         WHERE id = ?`,
        [id]
    );

    return await getMibotProgramacionById(db, id);
}

/**
 * Busca la programación MiBot activa más reciente creada por o dirigida al usuario
 */
async function getLatestEditableMibotProgramacionForUser(db, { telegramUserId = null, sipeUserId = null } = {}) {
    if (!db || (!telegramUserId && !sipeUserId)) return null;
    await ensureMibotSchema(db);

    const conditions = [];
    const params = [];
    if (sipeUserId) {
        conditions.push('p.created_by_user_id = ?');
        params.push(Number(sipeUserId));
    }
    if (telegramUserId) {
        conditions.push(`EXISTS (
            SELECT 1 FROM mibot_programaciones_destinatarios md
            WHERE md.programacion_id = p.id AND md.telegram_user_id = ?
        )`);
        params.push(String(telegramUserId));
    }
    if (conditions.length === 0) return null;

    const [rows] = await db.query(
        `SELECT p.id
         FROM mibot_programaciones p
         WHERE p.estado IN ('PROGRAMADO', 'ENVIADO')
           AND (${conditions.join(' OR ')})
         ORDER BY p.id DESC
         LIMIT 1`,
        params
    );
    if (!rows || rows.length === 0) return null;
    return await getMibotProgramacionById(db, rows[0].id);
}

/**
 * Lista programaciones MiBot filtrables por vencimiento, tarea, tipo y estado
 */
async function listMibotProgramaciones(db, { vencimientoId = null, taskId = null, estado = null, tipo = null, limit = 100 } = {}) {
    await ensureMibotSchema(db);

    const where = [];
    const params = [];

    if (vencimientoId) {
        where.push('vencimiento_id = ?');
        params.push(Number(vencimientoId));
    }
    if (taskId) {
        where.push('task_id = ?');
        params.push(Number(taskId));
    }
    if (estado && estado !== 'ALL' && MIBOT_ESTADOS.includes(String(estado).toUpperCase())) {
        where.push('estado = ?');
        params.push(String(estado).toUpperCase());
    }
    if (tipo && tipo !== 'ALL' && MIBOT_TIPOS.includes(String(tipo).toUpperCase())) {
        where.push('tipo = ?');
        params.push(String(tipo).toUpperCase());
    }

    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const [progRows] = await db.query(
        `SELECT * FROM mibot_programaciones
         ${whereSql}
         ORDER BY FIELD(estado, 'PROGRAMADO', 'ENVIADO', 'COMPLETADO', 'CANCELADO'),
                  COALESCE(proximo_envio_at, programado_para) DESC,
                  id DESC
         LIMIT ?`,
        [...params, safeLimit]
    );

    if (!progRows || progRows.length === 0) return [];

    const ids = progRows.map(p => Number(p.id));
    const placeholders = ids.map(() => '?').join(',');
    const [destRows] = await db.query(
        `SELECT * FROM mibot_programaciones_destinatarios
         WHERE programacion_id IN (${placeholders})
         ORDER BY nombre_destinatario ASC, id ASC`,
        ids
    );

    const destByProg = new Map();
    for (const d of (destRows || [])) {
        const pid = Number(d.programacion_id);
        if (!destByProg.has(pid)) destByProg.set(pid, []);
        destByProg.get(pid).push(d);
    }

    return progRows.map(p => hydrateProgramacionRow(p, destByProg.get(Number(p.id)) || []));
}

/**
 * Crea una nueva programación MiBot (para 1 o múltiples usuarios registrados en Telegram)
 * y opcionalmente la despacha de inmediato y/o crea la tarea vinculada en el tablero de Tareas.
 */
async function createMibotProgramacion({
    db,
    externalDb = null,
    payload = {},
    actorUser = null,
    sendTelegramFn = sendTelegramMessage,
    io = null,
    skipSystemNotification = false
}) {
    await ensureMibotSchema(db);

    const tipo = String(payload.tipo || 'RECORDATORIO_PAGO').trim().toUpperCase();
    if (!MIBOT_TIPOS.includes(tipo)) {
        const err = new Error(`Tipo de aviso MiBot inválido. Permitidos: ${MIBOT_TIPOS.join(', ')}`);
        err.status = 400;
        throw err;
    }

    const titulo = String(payload.titulo || '').trim().slice(0, 180);
    if (titulo.length < 3) {
        const err = new Error('El título del aviso MiBot debe tener al menos 3 caracteres.');
        err.status = 400;
        throw err;
    }

    const mensaje = String(payload.mensaje || '').trim().slice(0, 2000);
    if (mensaje.length < 2) {
        const err = new Error('El mensaje del aviso MiBot es obligatorio.');
        err.status = 400;
        throw err;
    }

    const frecuenciaRaw = String(payload.frecuencia || 'UNA_VEZ').trim().toUpperCase();
    const frecuencia = MIBOT_FRECUENCIAS.includes(frecuenciaRaw) ? frecuenciaRaw : 'UNA_VEZ';

    const rawDestIds = Array.isArray(payload.destinatario_ids) ? payload.destinatario_ids : [];
    const uniqueDestIds = [...new Set(rawDestIds.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0))];
    if (uniqueDestIds.length === 0) {
        const err = new Error('Debes seleccionar al menos un usuario registrado en Telegram para enviar el aviso.');
        err.status = 400;
        throw err;
    }

    const placeholders = uniqueDestIds.map(() => '?').join(',');
    const [tgUsers] = await db.query(
        `SELECT tu.id, tu.user_id, tu.telegram_user_id, tu.telegram_username, tu.first_name, tu.last_name,
                tu.cargo, tu.activo, tu.recibir_mibot, u.nombre AS sipe_nombre, r.name AS sipe_role_name
         FROM telegram_usuarios tu
         LEFT JOIN users u ON tu.user_id = u.id
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE tu.id IN (${placeholders}) AND tu.activo = 1`,
        uniqueDestIds
    );

    const eligibleUsers = (tgUsers || []).filter(u => Boolean(u.recibir_mibot ?? 1));
    if (eligibleUsers.length === 0) {
        const err = new Error('Ninguno de los usuarios seleccionados está activo y habilitado para MiBot en Telegram.');
        err.status = 400;
        throw err;
    }

    const enviarAhora = Boolean(payload.enviar_ahora);
    const nowSv = getElSalvadorNowSql();
    const programadoPara = enviarAhora
        ? nowSv
        : normalizeScheduleDatetime(payload.programado_para);

    if (!programadoPara) {
        const err = new Error('Fecha y hora de programación inválida. Usa el formato AAAA-MM-DD HH:mm.');
        err.status = 400;
        throw err;
    }

    const vencimientoId = payload.vencimiento_id ? parseInt(payload.vencimiento_id, 10) : null;
    let recordatorioId = payload.recordatorio_id ? parseInt(payload.recordatorio_id, 10) : null;
    let taskId = payload.task_id ? parseInt(payload.task_id, 10) : null;
    let ubicacion = payload.ubicacion ? String(payload.ubicacion).trim().slice(0, 120) : null;
    let montoTotal = payload.monto_total !== undefined && payload.monto_total !== null && payload.monto_total !== ''
        ? Number(payload.monto_total) : null;
    let montoPendiente = payload.monto_pendiente !== undefined && payload.monto_pendiente !== null && payload.monto_pendiente !== ''
        ? Number(payload.monto_pendiente) : null;
    let fechaVencimiento = payload.fecha_vencimiento ? String(payload.fecha_vencimiento).slice(0, 10) : null;

    if (vencimientoId) {
        const liveStatus = await checkLinkedPaymentStatus(db, externalDb, vencimientoId);
        if (liveStatus) {
            recordatorioId = recordatorioId || liveStatus.recordatorioId;
            ubicacion = ubicacion || liveStatus.ubicacion;
            montoTotal = montoTotal !== null ? montoTotal : liveStatus.montoTotal;
            montoPendiente = liveStatus.saldoPendiente;
            fechaVencimiento = fechaVencimiento || liveStatus.fechaVencimiento;
        }
    }

    const createdByUserId = actorUser?.id ? Number(actorUser.id) : null;
    const createdByName = String(actorUser?.nombre || actorUser?.username || 'SIPE Admin').trim().slice(0, 120);

    // Si es una Tarea, Validación o Reunión agendada desde MiBot y solicita crear tarea en el tablero de Tareas
    let autoCreatedTask = null;
    const shouldCreateSystemTask = !taskId && !vencimientoId &&
        Boolean(payload.crear_tarea_sistema) &&
        ['TAREA', 'VALIDACION', 'REUNION'].includes(tipo);

    if (shouldCreateSystemTask) {
        try {
            const firstLinkedUser = eligibleUsers.find(u => Number(u.user_id) > 0);
            const assignedUserId = payload.assigned_to
                ? Number(payload.assigned_to)
                : (firstLinkedUser?.user_id ? Number(firstLinkedUser.user_id) : (createdByUserId || 1));
            const taskDueDate = fechaVencimiento || String(programadoPara).slice(0, 10);
            const taskHora = payload.hora_limite || String(programadoPara).slice(11, 16) || '17:00';
            const taskPrioridad = ['baja', 'media', 'alta', 'urgente'].includes(String(payload.prioridad || '').toLowerCase())
                ? String(payload.prioridad).toLowerCase()
                : 'media';
            const taskCategoria = ubicacion || payload.categoria || (tipo === 'REUNION' ? 'General' : 'Operaciones');
            const cleanTaskTitle = titulo.replace(/^(?:Nueva Tarea Asignada|Tarea|Validación de Actividad|Recordatorio de Reunión)\s*:\s*/i, '').trim().toUpperCase() || titulo.toUpperCase();

            const [tRes] = await db.query(
                `INSERT INTO tasks
                    (titulo, descripcion, tipo_plazo, fecha_vencimiento, hora_limite, prioridad, estado, categoria, assigned_to, created_by, checklist)
                 VALUES (?, ?, 'dia_especifico', ?, ?, ?, 'pendiente', ?, ?, ?, '[]')`,
                [cleanTaskTitle, mensaje, taskDueDate, taskHora, taskPrioridad, taskCategoria, assignedUserId, createdByUserId || assignedUserId]
            );
            taskId = Number(tRes.insertId);
            fechaVencimiento = fechaVencimiento || taskDueDate;
            ubicacion = ubicacion || taskCategoria;

            const [tRows] = await db.query(
                `SELECT t.*,
                        DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                        DATE_FORMAT(t.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                        COALESCE(u1.nombre, u1.username) AS assigned_user_name,
                        COALESCE(u2.nombre, u2.username) AS created_user_name
                 FROM tasks t
                 LEFT JOIN users u1 ON t.assigned_to = u1.id
                 LEFT JOIN users u2 ON t.created_by = u2.id
                 WHERE t.id = ?`,
                [taskId]
            );
            if (tRows && tRows[0]) {
                autoCreatedTask = { ...tRows[0], checklist: [] };
            }
        } catch (taskErr) {
            console.warn('[MiBot] Aviso creando tarea vinculada en tasks:', taskErr.message);
        }
    }

    const [insertRes] = await db.query(
        `INSERT INTO mibot_programaciones
            (tipo, titulo, mensaje, vencimiento_id, recordatorio_id, ubicacion, monto_total, monto_pendiente,
             fecha_vencimiento, programado_para, proximo_envio_at, frecuencia, estado,
             created_by_user_id, created_by_name, task_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROGRAMADO', ?, ?, ?)`,
        [
            tipo,
            titulo,
            mensaje,
            vencimientoId || null,
            recordatorioId || null,
            ubicacion,
            Number.isFinite(montoTotal) ? montoTotal : null,
            Number.isFinite(montoPendiente) ? montoPendiente : null,
            fechaVencimiento,
            programadoPara,
            programadoPara,
            frecuencia,
            createdByUserId,
            createdByName,
            taskId || null
        ]
    );

    const programacionId = insertRes.insertId;

    for (const u of eligibleUsers) {
        await db.query(
            `INSERT INTO mibot_programaciones_destinatarios
                (programacion_id, telegram_usuario_id, telegram_user_id, nombre_destinatario, cargo, estado_entrega)
             VALUES (?, ?, ?, ?, ?, 'PENDIENTE')`,
            [
                programacionId,
                Number(u.id),
                String(u.telegram_user_id),
                resolveRecipientDisplayName(u).slice(0, 150),
                (u.cargo || u.sipe_role_name || null) ? String(u.cargo || u.sipe_role_name).slice(0, 120) : null
            ]
        );
    }

    let dispatchResult = null;
    if (enviarAhora) {
        dispatchResult = await dispatchMibotProgramacion({
            db,
            externalDb,
            programacionId,
            sendTelegramFn,
            isAutomaticCron: false
        });
    }

    const fullProgramacion = await getMibotProgramacionById(db, programacionId);

    // Emitir eventos de actualización de tablero y tarjeta informativa en sistema para destinatarios vinculados
    if (!skipSystemNotification && ['TAREA', 'VALIDACION', 'REUNION'].includes(tipo)) {
        try {
            const notifiedUserIds = new Set();
            const recipientNames = eligibleUsers.map(u => resolveRecipientDisplayName(u)).join(', ');
            for (const u of eligibleUsers) {
                const targetSipeUserId = u.user_id ? Number(u.user_id) : null;
                if (targetSipeUserId && !notifiedUserIds.has(targetSipeUserId)) {
                    notifiedUserIds.add(targetSipeUserId);
                    const notifTitle = tipo === 'REUNION'
                        ? 'Nueva Reunión Agendada (MiBot)'
                        : tipo === 'VALIDACION'
                            ? 'Actividad Asignada para Validación'
                            : 'Nueva Tarea / Actividad Asignada';
                    const notifData = {
                        taskId: taskId || null,
                        programacionId,
                        tipo,
                        titulo,
                        descripcion: mensaje,
                        categoria: ubicacion || 'Operaciones',
                        priority: payload.prioridad || 'media',
                        fecha_vencimiento: fechaVencimiento || String(programadoPara).slice(0, 10),
                        hora_limite: String(programadoPara).slice(11, 16),
                        created_user_name: createdByName,
                        assigned_user_name: resolveRecipientDisplayName(u),
                        mibot_status_label: enviarAhora ? `Enviado por Telegram a ${recipientNames}` : `Programado en MiBot (${formatDisplayDateTimeSv(programadoPara)})`,
                        link: '/dashboard/operaciones/tareas'
                    };
                    const [nRes] = await db.query(
                        `INSERT INTO notifications (user_id, type, title, message, data)
                         VALUES (?, 'task_assigned', ?, ?, ?)`,
                        [
                            targetSipeUserId,
                            notifTitle,
                            `${createdByName} te asignó vía MiBot: "${titulo}"`,
                            JSON.stringify(notifData)
                        ]
                    );
                    if (io) {
                        io.to(`user_${targetSipeUserId}`).emit('notification:new', {
                            id: nRes.insertId,
                            user_id: targetSipeUserId,
                            type: 'task_assigned',
                            title: notifTitle,
                            message: `${createdByName} te asignó vía MiBot: "${titulo}"`,
                            data: notifData,
                            is_read: false,
                            created_at: new Date().toISOString()
                        });
                    }
                }
            }
            if (io) {
                if (autoCreatedTask) {
                    io.emit('tasks:changed', { action: 'created', task: autoCreatedTask });
                } else if (taskId) {
                    io.emit('tasks:changed', { action: 'mibot_scheduled', taskId, programacion: fullProgramacion });
                }
            }
        } catch (notifErr) {
            console.warn('[MiBot] Aviso enviando notificación en sistema:', notifErr.message);
        }
    }

    return {
        programacion: fullProgramacion,
        dispatch: dispatchResult,
        task: autoCreatedTask
    };
}

/**
 * Envía mensajes personales individuales vía Telegram a los destinatarios de una programación MiBot
 */
async function dispatchMibotProgramacion({
    db,
    externalDb = null,
    programacionId,
    sendTelegramFn = sendTelegramMessage,
    onlyDestinatarioIds = null,
    isSnoozeFollowup = false,
    isAutomaticCron = false,
    nowSqlOverride = null
}) {
    await ensureMibotSchema(db);
    const prog = await getMibotProgramacionById(db, programacionId);
    if (!prog) {
        const err = new Error('Programación MiBot no encontrada.');
        err.status = 404;
        throw err;
    }

    if (prog.estado === 'CANCELADO' && isAutomaticCron) {
        return { skipped: true, reason: 'CANCELADO', sent: 0, failed: 0 };
    }

    // Verificar en vivo estado de pago vinculado si aplica
    let livePaymentStatus = null;
    if (prog.vencimiento_id) {
        livePaymentStatus = await checkLinkedPaymentStatus(db, externalDb, prog.vencimiento_id);
        if (livePaymentStatus) {
            if (isAutomaticCron && prog.frecuencia === 'DIARIO_HASTA_PAGAR' && livePaymentStatus.isPaid) {
                await db.query(
                    `UPDATE mibot_programaciones
                     SET estado = 'COMPLETADO', monto_pendiente = 0, proximo_envio_at = NULL
                     WHERE id = ?`,
                    [prog.id]
                );
                return { skipped: true, reason: 'PAGO_YA_CANCELADO', sent: 0, failed: 0 };
            }
            if (livePaymentStatus.saldoPendiente !== prog.monto_pendiente) {
                await db.query(
                    'UPDATE mibot_programaciones SET monto_pendiente = ? WHERE id = ?',
                    [livePaymentStatus.saldoPendiente, prog.id]
                );
                prog.monto_pendiente = livePaymentStatus.saldoPendiente;
            }
        }
    }

    const allDests = prog.destinatarios || [];
    const targetIdsSet = Array.isArray(onlyDestinatarioIds) && onlyDestinatarioIds.length > 0
        ? new Set(onlyDestinatarioIds.map(Number))
        : null;
    const targetDests = targetIdsSet
        ? allDests.filter(d => targetIdsSet.has(Number(d.id)))
        : allDests;

    const nowSv = nowSqlOverride || getElSalvadorNowSql();
    let sent = 0;
    let failed = 0;

    for (const dest of targetDests) {
        const others = allDests.filter(o => Number(o.id) !== Number(dest.id));
        const htmlText = formatMibotPersonalMessage({
            programacion: prog,
            destinatario: dest,
            otrosDestinatarios: others,
            paymentLiveStatus: livePaymentStatus,
            isSnoozeFollowup
        });
        const keyboard = buildMibotInlineKeyboard(dest.id, prog.tipo);

        try {
            const tgRes = await sendTelegramFn(dest.telegram_user_id, htmlText, keyboard);
            if (tgRes) {
                const msgId = tgRes.message_id ? Number(tgRes.message_id) : null;
                await db.query(
                    `UPDATE mibot_programaciones_destinatarios
                     SET estado_entrega = 'ENVIADO',
                         enviado_at = ?,
                         pospuesto_hasta = NULL,
                         telegram_message_id = ?,
                         error_msg = NULL
                     WHERE id = ?`,
                    [nowSv, msgId, dest.id]
                );
                sent += 1;
            } else {
                await db.query(
                    `UPDATE mibot_programaciones_destinatarios
                     SET estado_entrega = 'ERROR',
                         pospuesto_hasta = NULL,
                         error_msg = 'Telegram no confirmó entrega (verifique chat ID o bot activo)'
                     WHERE id = ?`,
                    [dest.id]
                );
                failed += 1;
            }
        } catch (sendErr) {
            await db.query(
                `UPDATE mibot_programaciones_destinatarios
                 SET estado_entrega = 'ERROR',
                     pospuesto_hasta = NULL,
                     error_msg = ?
                 WHERE id = ?`,
                [String(sendErr.message || 'Error enviando mensaje').slice(0, 240), dest.id]
            );
            failed += 1;
        }
    }

    // Actualizar estado y próxima ejecución en la programación principal (si no fue solo snooze individual)
    if (!isSnoozeFollowup) {
        const nextRun = computeNextScheduleSql(prog.proximo_envio_at || prog.programado_para || nowSv, prog.frecuencia, nowSv);
        const nextEstado = nextRun ? 'PROGRAMADO' : 'ENVIADO';
        await db.query(
            `UPDATE mibot_programaciones
             SET estado = ?,
                 ultimo_envio_at = ?,
                 proximo_envio_at = ?,
                 total_envios = total_envios + 1
             WHERE id = ?`,
            [nextEstado, nowSv, nextRun, prog.id]
        );
    }

    return {
        skipped: false,
        programacion_id: prog.id,
        total: targetDests.length,
        sent,
        failed
    };
}

/**
 * Procesa clicks de usuarios en los botones inline de mensajes MiBot en Telegram (fail-closed)
 * callback_data formato: 'mibot:<accion>:<destinatarioId>'
 */
async function handleMibotCallbackQuery({
    db,
    cq,
    tgUser,
    transport = { answerCallbackQuery, editMessageReplyMarkup, sendTelegramMessage }
}) {
    if (!cq || !cq.data || !String(cq.data).startsWith('mibot:')) {
        return false;
    }

    const answerFn = transport.answerCallbackQuery || answerCallbackQuery;
    const editMarkupFn = transport.editMessageReplyMarkup || editMessageReplyMarkup;

    const fromId = cq.from ? String(cq.from.id) : null;
    if (!db || !fromId || !tgUser || !tgUser.activo) {
        await answerFn(cq.id, '⛔ Tu cuenta de Telegram no está autorizada.');
        return true;
    }

    const parts = String(cq.data).trim().split(':');
    if (parts.length !== 3) {
        await answerFn(cq.id, '⚠️ Acción de MiBot no reconocida.');
        return true;
    }

    const action = parts[1];
    const destId = parseInt(parts[2], 10);
    if (!['visto', 'validar', 'posponer'].includes(action) || !Number.isFinite(destId) || destId <= 0) {
        await answerFn(cq.id, '⚠️ Parámetros de acción inválidos.');
        return true;
    }

    await ensureMibotSchema(db);

    const [destRows] = await db.query(
        `SELECT d.*, p.tipo, p.titulo, p.frecuencia, p.estado AS prog_estado, p.task_id
         FROM mibot_programaciones_destinatarios d
         INNER JOIN mibot_programaciones p ON d.programacion_id = p.id
         WHERE d.id = ?
         LIMIT 1`,
        [destId]
    );

    if (!destRows || destRows.length === 0) {
        await answerFn(cq.id, 'Este recordatorio ya no existe o fue eliminado.');
        return true;
    }

    const dest = destRows[0];
    // Verificación estricta de propietario (fail-closed)
    if (String(dest.telegram_user_id) !== fromId) {
        await answerFn(cq.id, '⛔ Este recordatorio pertenece a otro usuario.');
        return true;
    }

    const nowSv = getElSalvadorNowSql();
    const chatId = cq.message?.chat?.id || fromId;
    const messageId = cq.message?.message_id;

    let newEstadoEntrega = 'VISTO';
    let pospuestoHasta = null;
    let nota = null;
    let toastMsg = '✅ Confirmación registrada en SIPE Admin.';
    let buttonBadge = '✅ Enterado / Confirmado';

    if (action === 'visto') {
        newEstadoEntrega = 'VISTO';
        nota = 'Confirmado visto desde Telegram';
        toastMsg = '👀 ¡Listo! Se registró que recibiste el aviso.';
        buttonBadge = `👀 Visto · ${formatDisplayDateTimeSv(nowSv)}`;
    } else if (action === 'validar') {
        newEstadoEntrega = 'VALIDADO';
        nota = dest.tipo === 'REUNION'
            ? 'Asistencia confirmada desde Telegram'
            : 'Actividad / pago validado desde Telegram';
        toastMsg = dest.tipo === 'REUNION'
            ? '✅ ¡Asistencia confirmada! Gracias.'
            : '✔️ ¡Validación registrada en SIPE Admin!';
        buttonBadge = dest.tipo === 'REUNION'
            ? `✅ Asistencia confirmada · ${formatDisplayDateTimeSv(nowSv)}`
            : `✔️ Validado · ${formatDisplayDateTimeSv(nowSv)}`;
    } else if (action === 'posponer') {
        newEstadoEntrega = 'POSPUESTO';
        pospuestoHasta = addMinutesToSvSql(nowSv, 60);
        nota = `Pospuesto 1 hora (re-envío ${formatDisplayDateTimeSv(pospuestoHasta)})`;
        toastMsg = '⏰ Te lo volveré a recordar en 1 hora.';
        buttonBadge = `⏰ Pospuesto hasta ${formatDisplayDateTimeSv(pospuestoHasta)}`;
    }

    await db.query(
        `UPDATE mibot_programaciones_destinatarios
         SET estado_entrega = ?,
             respondido_at = ?,
             pospuesto_hasta = ?,
             respuesta_nota = ?
         WHERE id = ?`,
        [newEstadoEntrega, nowSv, pospuestoHasta, nota, destId]
    );

    // Si todos los destinatarios de una programación UNA_VEZ ya validaron, marcarla COMPLETADO
    if (newEstadoEntrega === 'VALIDADO' && dest.frecuencia === 'UNA_VEZ' && dest.prog_estado !== 'CANCELADO') {
        const [pendingOthers] = await db.query(
            `SELECT COUNT(*) AS cnt
             FROM mibot_programaciones_destinatarios
             WHERE programacion_id = ? AND estado_entrega <> 'VALIDADO'`,
            [dest.programacion_id]
        );
        if (Number(pendingOthers?.[0]?.cnt || 0) === 0) {
            await db.query(
                `UPDATE mibot_programaciones
                 SET estado = 'COMPLETADO', proximo_envio_at = NULL
                 WHERE id = ?`,
                [dest.programacion_id]
            );
        }
    }

    // Sincronización bidireccional con Tablero de Tareas si está vinculado a task_id
    if (dest.task_id) {
        try {
            const linkedTaskId = Number(dest.task_id);
            const actorUserId = tgUser?.user_id ? Number(tgUser.user_id) : null;
            const actorName = dest.nombre_destinatario || tgUser?.first_name || 'Colaborador Telegram';
            if (newEstadoEntrega === 'VISTO') {
                await db.query(
                    `UPDATE tasks SET estado = 'en_proceso' WHERE id = ? AND estado = 'pendiente'`,
                    [linkedTaskId]
                );
                if (actorUserId) {
                    await db.query(
                        `INSERT INTO task_comments (task_id, user_id, comentario)
                         VALUES (?, ?, ?)`,
                        [linkedTaskId, actorUserId, `👀 [MiBot Telegram] ${actorName} confirmó de recibido la tarea desde Telegram.`]
                    ).catch(() => {});
                }
            } else if (newEstadoEntrega === 'VALIDADO') {
                await db.query(
                    `UPDATE tasks SET estado = 'completada', completada_en = NOW() WHERE id = ? AND estado <> 'completada'`,
                    [linkedTaskId]
                );
                if (actorUserId) {
                    await db.query(
                        `INSERT INTO task_comments (task_id, user_id, comentario)
                         VALUES (?, ?, ?)`,
                        [linkedTaskId, actorUserId, `✔️ [MiBot Telegram] ${actorName} validó y completó la actividad desde Telegram.`]
                    ).catch(() => {});
                }
            }
            if (realtimeIo && (newEstadoEntrega === 'VISTO' || newEstadoEntrega === 'VALIDADO')) {
                realtimeIo.emit('tasks:changed', {
                    action: 'updated',
                    taskId: linkedTaskId,
                    source: 'telegram_mibot'
                });
            }
        } catch (syncTaskErr) {
            console.warn('[MiBot] Aviso sincronizando estado de tarea desde Telegram:', syncTaskErr.message);
        }
    }

    await answerFn(cq.id, toastMsg);

    if (chatId && messageId) {
        const updatedMarkup = action === 'visto'
            ? {
                inline_keyboard: [
                    [{ text: buttonBadge, callback_data: 'noop' }],
                    [
                        { text: (TIPO_META[dest.tipo] || TIPO_META.RECORDATORIO_PAGO).validarBtn, callback_data: `mibot:validar:${destId}` },
                        { text: '⏰ Recordar en 1h', callback_data: `mibot:posponer:${destId}` }
                    ]
                ]
            }
            : {
                inline_keyboard: [
                    [{ text: buttonBadge, callback_data: 'noop' }]
                ]
            };
        await editMarkupFn(chatId, messageId, updatedMarkup);
    }

    return true;
}

/**
 * Formatea el resumen personal de avisos/reuniones/tareas MiBot para un usuario en Telegram (/mibot)
 */
async function formatUserPersonalMibotInbox(db, telegramUserId, displayName = '') {
    await ensureMibotSchema(db);
    const [rows] = await db.query(
        `SELECT p.id, p.tipo, p.titulo, p.ubicacion, p.monto_pendiente, p.programado_para,
                p.proximo_envio_at, p.frecuencia, p.estado,
                d.id AS dest_id, d.estado_entrega, d.pospuesto_hasta
         FROM mibot_programaciones_destinatarios d
         INNER JOIN mibot_programaciones p ON d.programacion_id = p.id
         WHERE d.telegram_user_id = ?
           AND p.estado IN ('PROGRAMADO', 'ENVIADO')
         ORDER BY COALESCE(p.proximo_envio_at, p.programado_para) ASC
         LIMIT 12`,
        [String(telegramUserId)]
    );

    const safeName = escapeHtml(displayName || 'Usuario');
    if (!rows || rows.length === 0) {
        return `🤖 <b>MiBot SIPE · Tus Avisos Personales</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `👋 Hola <b>${safeName}</b>, no tienes recordatorios de pagos, tareas, validaciones ni reuniones pendientes en este momento.`;
    }

    const lines = [
        `🤖 <b>MiBot SIPE · Tus Avisos Personales (${rows.length})</b>`,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `👋 Hola <b>${safeName}</b>, estos son tus pendientes activos:\n`
    ];

    rows.forEach((r, idx) => {
        const meta = TIPO_META[r.tipo] || TIPO_META.RECORDATORIO_PAGO;
        const when = formatDisplayDateTimeSv(dbDatetimeToSvSql(r.proximo_envio_at || r.programado_para));
        const montoTxt = r.monto_pendiente !== null && r.monto_pendiente !== undefined && Number(r.monto_pendiente) > 0
            ? ` · Saldo: <b>${formatMoney(r.monto_pendiente)}</b>`
            : '';
        lines.push(`${idx + 1}. ${meta.emoji} <b>${escapeHtml(r.titulo)}</b>`);
        lines.push(`   <i>${meta.label} · ${when}${montoTxt} · Estado: ${escapeHtml(r.estado_entrega)}</i>`);
    });

    return lines.join('\n');
}

/**
 * Devuelve conteo de avisos MiBot activos (PROGRAMADO / ENVIADO) agrupados por vencimiento_id
 */
async function getActiveMibotCountsByVencimientos(db, vencimientoIds = []) {
    const map = new Map();
    if (!db || !Array.isArray(vencimientoIds) || vencimientoIds.length === 0) return map;
    try {
        await ensureMibotSchema(db);
        const cleanIds = [...new Set(vencimientoIds.map(Number).filter(n => Number.isFinite(n) && n > 0))];
        if (cleanIds.length === 0) return map;
        const placeholders = cleanIds.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT vencimiento_id,
                    SUM(CASE WHEN estado = 'PROGRAMADO' THEN 1 ELSE 0 END) AS programados,
                    COUNT(*) AS total
             FROM mibot_programaciones
             WHERE vencimiento_id IN (${placeholders}) AND estado <> 'CANCELADO'
             GROUP BY vencimiento_id`,
            cleanIds
        );
        for (const r of (rows || [])) {
            map.set(Number(r.vencimiento_id), {
                programados: Number(r.programados || 0),
                total: Number(r.total || 0)
            });
        }
    } catch (_) {
        // Defensivo: nunca bloquear la lista principal de Control de Pagos
    }
    return map;
}

/**
 * Devuelve resumen de programaciones y estados de entrega MiBot agrupados por task_id
 */
async function getActiveMibotSummaryByTaskIds(db, taskIds = []) {
    const map = new Map();
    if (!db || !Array.isArray(taskIds) || taskIds.length === 0) return map;
    try {
        await ensureMibotSchema(db);
        const cleanIds = [...new Set(taskIds.map(Number).filter(n => Number.isFinite(n) && n > 0))];
        if (cleanIds.length === 0) return map;
        const placeholders = cleanIds.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT p.id AS programacion_id, p.task_id, p.tipo, p.estado AS prog_estado,
                    p.programado_para, p.proximo_envio_at, p.frecuencia, p.total_envios,
                    d.id AS dest_id, d.telegram_usuario_id, d.nombre_destinatario, d.cargo,
                    d.estado_entrega, d.enviado_at, d.respondido_at
             FROM mibot_programaciones p
             LEFT JOIN mibot_programaciones_destinatarios d ON d.programacion_id = p.id
             WHERE p.task_id IN (${placeholders}) AND p.estado <> 'CANCELADO'
             ORDER BY p.id DESC, d.id ASC`,
            cleanIds
        );

        for (const r of (rows || [])) {
            const tid = Number(r.task_id);
            if (!map.has(tid)) {
                map.set(tid, {
                    has_mibot: true,
                    programacion_id: Number(r.programacion_id),
                    tipo: r.tipo,
                    ultimo_estado: r.prog_estado,
                    proximo_envio_at: dbDatetimeToSvSql(r.proximo_envio_at || r.programado_para),
                    frecuencia: r.frecuencia,
                    total_envios: Number(r.total_envios || 0),
                    programaciones_ids: new Set([Number(r.programacion_id)]),
                    destinatarios: []
                });
            } else {
                map.get(tid).programaciones_ids.add(Number(r.programacion_id));
            }
            const entry = map.get(tid);
            if (r.dest_id && !entry.destinatarios.some(d => d.id === Number(r.dest_id))) {
                entry.destinatarios.push({
                    id: Number(r.dest_id),
                    programacion_id: Number(r.programacion_id),
                    telegram_usuario_id: Number(r.telegram_usuario_id),
                    nombre_destinatario: r.nombre_destinatario,
                    cargo: r.cargo,
                    estado_entrega: r.estado_entrega,
                    enviado_at: dbDatetimeToSvSql(r.enviado_at),
                    respondido_at: dbDatetimeToSvSql(r.respondido_at)
                });
            }
        }

        for (const [tid, entry] of map.entries()) {
            entry.programaciones_count = entry.programaciones_ids.size;
            delete entry.programaciones_ids;
            map.set(tid, entry);
        }
    } catch (_) {
        // Defensivo: nunca bloquear la lista principal de Tareas
    }
    return map;
}

/**
 * Revisa y despacha programaciones vencidas + recordatorios pospuestos (1h)
 */
async function processDueMibotSchedules({
    db = null,
    externalDb = undefined,
    sendTelegramFn = sendTelegramMessage,
    nowSqlOverride = null
} = {}) {
    const conn = db || getDb();
    if (!conn) return { processed: 0, snoozedProcessed: 0 };
    const extConn = externalDb !== undefined ? externalDb : await Promise.resolve(getExternalDb()).catch(() => null);

    await ensureMibotSchema(conn);
    const nowSv = nowSqlOverride || getElSalvadorNowSql();

    // 1. Programaciones cuyo próximo envío ya llegó
    const [dueRows] = await conn.query(
        `SELECT id FROM mibot_programaciones
         WHERE estado = 'PROGRAMADO'
           AND proximo_envio_at IS NOT NULL
           AND proximo_envio_at <= ?
         ORDER BY proximo_envio_at ASC
         LIMIT 25`,
        [nowSv]
    );

    let processed = 0;
    for (const row of (dueRows || [])) {
        try {
            await dispatchMibotProgramacion({
                db: conn,
                externalDb: extConn,
                programacionId: row.id,
                sendTelegramFn,
                isAutomaticCron: true,
                nowSqlOverride: nowSv
            });
            processed += 1;
        } catch (err) {
            console.error(`[MiBot Scheduler] Error despachando programación #${row.id}:`, err.message);
        }
    }

    // 2. Destinatarios individuales que presionaron "⏰ Recordar en 1 hora"
    const [snoozeRows] = await conn.query(
        `SELECT d.id AS dest_id, d.programacion_id
         FROM mibot_programaciones_destinatarios d
         INNER JOIN mibot_programaciones p ON d.programacion_id = p.id
         WHERE d.estado_entrega = 'POSPUESTO'
           AND d.pospuesto_hasta IS NOT NULL
           AND d.pospuesto_hasta <= ?
           AND p.estado <> 'CANCELADO'
         ORDER BY d.pospuesto_hasta ASC
         LIMIT 25`,
        [nowSv]
    );

    let snoozedProcessed = 0;
    for (const sr of (snoozeRows || [])) {
        try {
            await dispatchMibotProgramacion({
                db: conn,
                externalDb: extConn,
                programacionId: sr.programacion_id,
                sendTelegramFn,
                onlyDestinatarioIds: [sr.dest_id],
                isSnoozeFollowup: true,
                isAutomaticCron: true,
                nowSqlOverride: nowSv
            });
            snoozedProcessed += 1;
        } catch (err) {
            console.error(`[MiBot Scheduler] Error re-enviando pospuesto dest #${sr.dest_id}:`, err.message);
        }
    }

    return { processed, snoozedProcessed };
}

let mibotCronTask = null;
let isMibotTickRunning = false;
let mibotDigestCronTask = null;
let isMibotDigestRunning = false;
const digestTableInitPromises = new WeakMap();

/**
 * Asegura la tabla idempotente de control de envíos del resumen matutino de agenda
 */
async function ensureMibotDigestTable(db) {
    if (!db) return;
    if (digestTableInitPromises.has(db)) {
        return digestTableInitPromises.get(db);
    }
    const p = db.query(`
        CREATE TABLE IF NOT EXISTS mibot_daily_digest_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            telegram_usuario_id INT NOT NULL,
            digest_date DATE NOT NULL,
            items_count INT NOT NULL DEFAULT 0,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_mibot_digest_user_day (telegram_usuario_id, digest_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((err) => {
        digestTableInitPromises.delete(db);
        throw err;
    });
    digestTableInitPromises.set(db, p);
    return p;
}

/**
 * Envía un resumen matutino proactivo (1 vez por día y usuario, deduplicado) con tareas pendientes,
 * eventos programados del día y alertas de Control de Pagos (si el usuario tiene acceso).
 */
async function processMorningAgendaDigest({
    db = null,
    externalDb = undefined,
    sendTelegramFn = sendTelegramMessage,
    nowSqlOverride = null
} = {}) {
    const conn = db || getDb();
    if (!conn) return { sent: 0, skipped: 0 };
    const extConn = externalDb !== undefined ? externalDb : await Promise.resolve(getExternalDb()).catch(() => null);

    await ensureMibotSchema(conn);
    await ensureMibotDigestTable(conn);

    const nowSv = nowSqlOverride || getElSalvadorNowSql();
    const todaySv = String(nowSv).slice(0, 10);

    const [candidates] = await conn.query(
        `SELECT tu.id, tu.telegram_user_id, tu.first_name, tu.last_name, tu.user_id,
                tu.permiso_saldos_banco, tu.mibot_pagos, tu.mibot_tareas, tu.mibot_reuniones,
                u.nombre AS sipe_nombre, u.role_id, r.name AS role_name
         FROM telegram_usuarios tu
         LEFT JOIN users u ON tu.user_id = u.id
         LEFT JOIN roles r ON u.role_id = r.id
         LEFT JOIN mibot_daily_digest_log dl
                ON dl.telegram_usuario_id = tu.id AND dl.digest_date = ?
         WHERE tu.activo = 1
           AND COALESCE(tu.recibir_mibot, 1) = 1
           AND dl.id IS NULL
           AND (u.id IS NULL OR u.status = 'active' OR u.status IS NULL)`,
        [todaySv]
    );

    if (!candidates || candidates.length === 0) {
        return { sent: 0, skipped: 0 };
    }

    // Precargar resumen de pagos vencidos / de hoy una sola vez para usuarios con permiso de pagos
    let pagosDueSummary = null;
    if (extConn) {
        try {
            const [pRows] = await extConn.query(
                `SELECT COUNT(*) AS cnt, COALESCE(SUM(b.monto), 0) AS total
                 FROM web_rc_recordatorios_vencimientos a
                 INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
                 WHERE b.activo = 1 AND a.estado = 'P' AND a.vencimiento <= ?`,
                [todaySv]
            );
            pagosDueSummary = {
                cnt: Number(pRows?.[0]?.cnt || 0),
                total: Number(pRows?.[0]?.total || 0)
            };
        } catch (_) {
            pagosDueSummary = null;
        }
    }

    let sent = 0;
    let skipped = 0;

    for (const user of candidates) {
        try {
            const userTasks = [];
            if (user.user_id && Boolean(user.mibot_tareas ?? 1)) {
                const [tRows] = await conn.query(
                    `SELECT id, titulo, prioridad,
                            DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                            TIME_FORMAT(hora_limite, '%H:%i') AS hora_limite
                     FROM tasks
                     WHERE assigned_to = ?
                       AND estado NOT IN ('completada', 'cancelada')
                       AND fecha_vencimiento <= ?
                     ORDER BY fecha_vencimiento ASC, id DESC
                     LIMIT 6`,
                    [user.user_id, todaySv]
                );
                userTasks.push(...(tRows || []));
            }

            const [evtRows] = await conn.query(
                `SELECT p.id, p.tipo, p.titulo,
                        COALESCE(p.proximo_envio_at, p.programado_para) AS fecha_prog
                 FROM mibot_programaciones_destinatarios d
                 INNER JOIN mibot_programaciones p ON d.programacion_id = p.id
                 WHERE d.telegram_usuario_id = ?
                   AND p.estado IN ('PROGRAMADO', 'ENVIADO')
                   AND DATE(COALESCE(p.proximo_envio_at, p.programado_para)) = ?
                 ORDER BY COALESCE(p.proximo_envio_at, p.programado_para) ASC
                 LIMIT 6`,
                [user.id, todaySv]
            );

            const canPagosDigest = Boolean(user.mibot_pagos ?? 1) && (
                Number(user.role_id) === 1 ||
                user.role_name === 'Administrator' ||
                user.role_name === 'Super Administrator' ||
                Boolean(user.permiso_saldos_banco)
            );
            const hasPagos = canPagosDigest && pagosDueSummary && pagosDueSummary.cnt > 0;
            const totalItems = userTasks.length + (evtRows?.length || 0) + (hasPagos ? 1 : 0);

            if (totalItems === 0) {
                skipped += 1;
                continue;
            }

            const nombre = escapeHtml(
                `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.sipe_nombre || 'Equipo SIPE'
            );
            const lines = [
                `☀️ <b>Buenos días, ${nombre} · Agenda del Día (${formatDateOnlyDMY(todaySv)})</b>`,
                `━━━━━━━━━━━━━━━━━━━━━`
            ];

            if (userTasks.length > 0) {
                lines.push('');
                lines.push(`📋 <b>Tareas pendientes para hoy o atrasadas (${userTasks.length}):</b>`);
                userTasks.forEach((t) => {
                    const due = t.fecha_vencimiento < todaySv ? `🔴 Atrasada (${formatDateOnlyDMY(t.fecha_vencimiento)})` : `📅 Hoy${t.hora_limite ? ` ${t.hora_limite}` : ''}`;
                    lines.push(`• <b>#${t.id}</b> ${escapeHtml(t.titulo)} — <i>${due}</i>`);
                });
            }

            if (evtRows && evtRows.length > 0) {
                lines.push('');
                lines.push(`🗓️ <b>Eventos y recordatorios MiBot de hoy (${evtRows.length}):</b>`);
                evtRows.forEach((ev) => {
                    const meta = TIPO_META[ev.tipo] || TIPO_META.RECORDATORIO_PAGO;
                    lines.push(`• ${meta.emoji} <b>${escapeHtml(ev.titulo)}</b> — <i>${formatDisplayDateTimeSv(dbDatetimeToSvSql(ev.fecha_prog))}</i>`);
                });
            }

            if (hasPagos) {
                lines.push('');
                lines.push(`💳 <b>Control de Pagos:</b> <code>${pagosDueSummary.cnt}</code> compromiso(s) vencidos o de hoy por <b>${formatMoney(pagosDueSummary.total)}</b>.`);
            }

            lines.push('');
            lines.push(`<i>Usa los botones rápidos o escribe /tareas, /agenda o /pagos para gestionar tus pendientes.</i>`);

            const markup = {
                inline_keyboard: [
                    [
                        { text: '📋 Ver Mis Tareas', callback_data: 'tg_tsk:l:mine' },
                        { text: '🗓️ Agenda Hoy', callback_data: 'tg_evt:r:hoy' }
                    ],
                    ...(hasPagos ? [[{ text: '💳 Control de Pagos', callback_data: 'tg_pago:f:hoy' }]] : [])
                ]
            };

            const res = await sendTelegramFn(user.telegram_user_id, lines.join('\n'), markup);
            if (res) {
                await conn.query(
                    `INSERT IGNORE INTO mibot_daily_digest_log (telegram_usuario_id, digest_date, items_count)
                     VALUES (?, ?, ?)`,
                    [user.id, todaySv, totalItems]
                );
                sent += 1;
            } else {
                skipped += 1;
            }
        } catch (userErr) {
            console.warn(`[MiBot Digest] Aviso preparando digest para usuario #${user.id}:`, userErr.message);
            skipped += 1;
        }
    }

    return { sent, skipped };
}

/**
 * Inicializa el planificador automático de MiBot (se ejecuta cada minuto)
 */
function initMibotScheduler(io = null) {
    if (io) setRealtimeIo(io);
    if (mibotCronTask) return mibotCronTask;

    const db = getDb();
    if (db) {
        ensureMibotSchema(db).catch(err =>
            console.warn('[MiBot] Aviso inicializando esquema MiBot:', err.message)
        );
    }

    console.log('[MiBot] Planificador personal de Telegram inicializado (verificación cada minuto, zona America/El_Salvador).');

    mibotCronTask = cron.schedule('* * * * *', async () => {
        if (isMibotTickRunning) return;
        isMibotTickRunning = true;
        try {
            const result = await processDueMibotSchedules();
            if (result.processed > 0 || result.snoozedProcessed > 0) {
                console.log(`[MiBot] Despachados: ${result.processed} programación(es), ${result.snoozedProcessed} pospuesto(s).`);
            }
        } catch (err) {
            console.error('[MiBot] Error en ciclo del planificador:', err.message);
        } finally {
            isMibotTickRunning = false;
        }
    });

    if (!mibotDigestCronTask) {
        mibotDigestCronTask = cron.schedule('30 7 * * *', async () => {
            if (isMibotDigestRunning) return;
            isMibotDigestRunning = true;
            try {
                const res = await processMorningAgendaDigest();
                if (res.sent > 0) {
                    console.log(`[MiBot Digest] Resumen matutino enviado a ${res.sent} usuario(s).`);
                }
            } catch (err) {
                console.error('[MiBot Digest] Error enviando resumen matutino:', err.message);
            } finally {
                isMibotDigestRunning = false;
            }
        }, { timezone: MIBOT_TIMEZONE });
    }

    return mibotCronTask;
}

/**
 * Detiene los cron jobs de MiBot para un cierre elegante del servidor.
 */
function stopMibotScheduler() {
    if (mibotCronTask && typeof mibotCronTask.stop === 'function') {
        mibotCronTask.stop();
    }
    mibotCronTask = null;

    if (mibotDigestCronTask && typeof mibotDigestCronTask.stop === 'function') {
        mibotDigestCronTask.stop();
    }
    mibotDigestCronTask = null;
}

module.exports = {
    MIBOT_TIMEZONE,
    MIBOT_TIPOS,
    MIBOT_FRECUENCIAS,
    MIBOT_ESTADOS,
    TIPO_META,
    FRECUENCIA_LABELS,
    setRealtimeIo,
    getRealtimeIo,
    getElSalvadorNowParts,
    getElSalvadorNowSql,
    normalizeScheduleDatetime,
    dbDatetimeToSvSql,
    addMinutesToSvSql,
    computeNextScheduleSql,
    formatDisplayDateTimeSv,
    ensureMibotSchema,
    ensureMibotDigestTable,
    resolveRecipientDisplayName,
    formatMibotPersonalMessage,
    buildMibotInlineKeyboard,
    checkLinkedPaymentStatus,
    getEligibleMibotRecipients,
    getMibotProgramacionById,
    listMibotProgramaciones,
    createMibotProgramacion,
    rescheduleMibotProgramacion,
    cancelMibotProgramacion,
    getLatestEditableMibotProgramacionForUser,
    dispatchMibotProgramacion,
    handleMibotCallbackQuery,
    formatUserPersonalMibotInbox,
    getActiveMibotCountsByVencimientos,
    getActiveMibotSummaryByTaskIds,
    processDueMibotSchedules,
    processMorningAgendaDigest,
    initMibotScheduler,
    stopMibotScheduler
};
