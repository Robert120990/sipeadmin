const axios = require('axios');
const { getDb, getExternalDb, getAccountingDb } = require('../db');
const salesHourlyService = require('./salesHourlyService');
const solarEnergyService = require('./solarEnergyService');

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const DEFAULT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8852249993:AAHs51t4kIGqXfdEl8epRL0Le08PTZ52qu0';

let isPollingActive = false;
let lastPollAt = null;
let currentOffset = 0;
let botInfo = null;

/**
 * Mapeo oficial de nombres amigables de bancos
 */
const BANK_NAME_MAP = {
    'AGRICOLA': 'Banco Agrícola',
    'PROMERICA': 'Banco Promerica',
    'DAVIVIENDA': 'Banco Davivienda',
    'HIPOTECARIO': 'Banco Hipotecario',
    'ATLANTIDA': 'Banco Atlántida',
    'BANCO AZUL': 'Banco Azul',
    'CONSTELACION': 'Constelación',
    'FOMENTO AGROPECUARIO': 'Banco de Fomento Agropecuario',
    'CUSCATLAN': 'Banco Cuscatlán',
    'AMERICA CENTRAL': 'BAC Credomatic',
    'BAC': 'BAC Credomatic'
};

/**
 * Obtener token activo desde base de datos o variable de entorno
 */
const getBotToken = async () => {
    try {
        const db = getDb();
        if (db) {
            const [rows] = await db.query('SELECT bot_token, is_active FROM telegram_config WHERE id = 1 LIMIT 1');
            if (rows && rows.length > 0 && rows[0].bot_token) {
                return {
                    token: rows[0].bot_token.trim(),
                    isActive: Boolean(rows[0].is_active)
                };
            }
        }
    } catch (e) {
        // Base de datos puede estar iniciando
    }
    return {
        token: (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TOKEN).trim(),
        isActive: true
    };
};

/**
 * Escape de caracteres especiales para Telegram HTML mode
 */
const escapeHtml = (text) => {
    if (!text && text !== 0) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

/**
 * Formateador de moneda en USD
 */
const moneyFmt = (val) => {
    const num = Number(val || 0);
    const isNeg = num < 0;
    const abs = Math.abs(num);
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (isNeg ? '-' : '') + '$' + formatted;
};

/**
 * Formateador de números (galonaje, cantidades)
 */
const numFmt = (val) => {
    const num = Number(val || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Convertir YYYY-MM-DD a DD/MM/YYYY
 */
const toDisplayDate = (ymd) => {
    if (!ymd) return '';
    const parts = ymd.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return ymd;
};

/**
 * Obtener fecha YYYY-MM-DD con desplazamiento en días
 */
const getDateStr = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Normalizar texto eliminando tildes y caracteres especiales
 */
const normalizeText = (str) => {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[¿?¡!,.;:()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Escapar caracteres especiales para expresiones regulares
 */
const escapeRegex = (s) => (s || '').replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

/**
 * Mapeo de meses en español y sus abreviaciones estándar
 */
const SPANISH_MONTHS = {
    'enero': 1, 'ene': 1,
    'febrero': 2, 'feb': 2,
    'marzo': 3, 'mar': 3,
    'abril': 4, 'abr': 4,
    'mayo': 5, 'may': 5,
    'junio': 6, 'jun': 6,
    'julio': 7, 'jul': 7,
    'agosto': 8, 'ago': 8,
    'septiembre': 9, 'setiembre': 9, 'sep': 9, 'sept': 9, 'set': 9,
    'octubre': 10, 'oct': 10,
    'noviembre': 11, 'nov': 11,
    'diciembre': 12, 'dic': 12
};

/**
 * Formatear YYYY-MM-DD validando existencia en calendario
 */
const formatYMD = (y, m, d) => {
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day > daysInMonth) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Parser semántico completo de fechas en español natural:
 * Reconoce '5 de octubre', '15 de septiembre', '05 de oct', 'el dia 5', 'el dia de ayer',
 * formatos numéricos, etc., asociando el año correspondiente (por defecto año actual 2026).
 */
const parseSpanishDateText = (text, ref = 2026) => {
    if (!text || typeof text !== 'string') return null;

    let refDate = new Date();
    let defaultYear = 2026;
    if (ref instanceof Date && !isNaN(ref.getTime())) {
        refDate = ref;
        defaultYear = ref.getFullYear();
    } else if (typeof ref === 'number' && ref > 1900 && ref < 3000) {
        defaultYear = ref;
        refDate.setFullYear(ref);
    } else {
        defaultYear = refDate.getFullYear() || 2026;
    }
    const defaultMonth = refDate.getMonth() + 1;
    const normalized = normalizeText(text);

    // 1. Expresiones relativas en español
    if (/\b(el dia de hoy|hoy)\b/.test(normalized)) {
        const d = new Date(refDate);
        return formatYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (/\b(el dia de ayer|ayer)\b/.test(normalized)) {
        const d = new Date(refDate);
        d.setDate(d.getDate() - 1);
        return formatYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    if (/\b(anteayer|antier|el dia de anteayer)\b/.test(normalized)) {
        const d = new Date(refDate);
        d.setDate(d.getDate() - 2);
        return formatYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }

    // 2. Patrón día + mes + año opcional: '5 de octubre', '15 de septiembre', '05 de oct', 'el dia 5 de octubre del 2025'
    const dayMonthRegex = /\b(?:el\s+)?(?:dia\s+)?([0-3]?[0-9])\s*(?:de|\/|-)\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|set|oct|nov|dic)(?:\s*(?:de|del|\/|-)?\s*(\d{4}))?\b/i;
    const dmMatch = normalized.match(dayMonthRegex);
    if (dmMatch) {
        const day = parseInt(dmMatch[1], 10);
        const month = SPANISH_MONTHS[dmMatch[2].toLowerCase()];
        const year = dmMatch[3] ? parseInt(dmMatch[3], 10) : defaultYear;
        const res = formatYMD(year, month, day);
        if (res) return res;
    }

    // 3. Patrón mes + día + año opcional: 'octubre 5', 'octubre 5 de 2026'
    const monthDayRegex = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|set|oct|nov|dic)\s+(?:dia\s+|el\s+)?([0-3]?[0-9])(?:\s*(?:de|del|\/|-)?\s*(\d{4}))?\b/i;
    const mdMatch = normalized.match(monthDayRegex);
    if (mdMatch) {
        const month = SPANISH_MONTHS[mdMatch[1].toLowerCase()];
        const day = parseInt(mdMatch[2], 10);
        const year = mdMatch[3] ? parseInt(mdMatch[3], 10) : defaultYear;
        const res = formatYMD(year, month, day);
        if (res) return res;
    }

    // 4. Patrón 'el dia X' o 'dia X' (sin mes especificado -> mes actual y año actual)
    const dayOnlyRegex = /\b(?:el\s+)?dia\s+([0-3]?[0-9])\b/i;
    const dMatch = normalized.match(dayOnlyRegex);
    if (dMatch) {
        const day = parseInt(dMatch[1], 10);
        const res = formatYMD(defaultYear, defaultMonth, day);
        if (res) return res;
    }

    // 5. Formatos numéricos directos: YYYY-MM-DD o DD/MM/YYYY o DD-MM-YYYY
    const isoMatch = normalized.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
    if (isoMatch) {
        return formatYMD(isoMatch[1], isoMatch[2], isoMatch[3]);
    }
    const dmyMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
    if (dmyMatch) {
        return formatYMD(dmyMatch[3], dmyMatch[2], dmyMatch[1]);
    }

    return null;
};

const SPANISH_MONTH_NAMES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Parsea un periodo (mes completo, rango de fechas) o una fecha individual en lenguaje natural
 */
const parseSpanishPeriodOrDate = (text, ref = 2026) => {
    if (!text || typeof text !== 'string') return null;
    const normalized = normalizeText(text);

    // 1. Detección de rangos de fechas: 'del 1 al 10 de octubre', 'entre el 5 y 15 de septiembre'
    const rangeRegex = /\b(?:del|desde|entre)\s+(?:el\s+)?([0-3]?[0-9])\s*(?:al|a|y|hasta)\s*(?:el\s+)?([0-3]?[0-9])\s*(?:de|\/|-)\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|set|oct|nov|dic)(?:\s*(?:de|del|\/|-)?\s*(\d{4}))?\b/i;
    const rangeMatch = normalized.match(rangeRegex);
    if (rangeMatch) {
        const startDay = parseInt(rangeMatch[1], 10);
        const endDay = parseInt(rangeMatch[2], 10);
        const month = SPANISH_MONTHS[rangeMatch[3].toLowerCase()];
        const year = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : (typeof ref === 'number' ? ref : 2026);
        return {
            type: 'range',
            startDate: formatYMD(year, month, startDay),
            endDate: formatYMD(year, month, endDay),
            year,
            month,
            label: `Del ${startDay} al ${endDay} de ${SPANISH_MONTH_NAMES[month]} ${year}`
        };
    }

    // 2. Detección de mes completo:
    // Cuidado: solo tratar como mes si NO hay un número de día antes o después
    const hasDayNumber = /\b([0-3]?[0-9])\s*(?:de|\/|-)\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|set|oct|nov|dic)\b/i.test(normalized) ||
                         /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|set|oct|nov|dic)\s+(?:dia\s+|el\s+)?([0-3]?[0-9])\b/i.test(normalized);

    if (!hasDayNumber) {
        const monthRegex = /\b(?:mes\s+(?:de\s+)?|mensual\s+(?:de\s+)?|del\s+mes\s+de\s+|ventas\s+(?:de|en)\s+|en\s+|de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b(?:\s*(?:de|del|\/|-)?\s*(\d{4}))?/i;
        const mMatch = normalized.match(monthRegex);
        if (mMatch && mMatch[1]) {
            const month = SPANISH_MONTHS[mMatch[1].toLowerCase()];
            if (month) {
                const year = mMatch[2] ? parseInt(mMatch[2], 10) : (typeof ref === 'number' ? ref : 2026);
                const lastDay = new Date(year, month, 0).getDate();
                return {
                    type: 'month',
                    year,
                    month,
                    startDate: formatYMD(year, month, 1),
                    endDate: formatYMD(year, month, lastDay),
                    periodo: `${year}-${String(month).padStart(2, '0')}`,
                    label: `${SPANISH_MONTH_NAMES[month]} ${year}`
                };
            }
        }

        // 'este mes', 'mes actual', 'mes en curso', 'del mes'
        if (/\b(este\s+mes|mes\s+actual|mes\s+en\s+curso|del\s+mes)\b/i.test(normalized)) {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth() + 1;
            const lastDay = new Date(y, m, 0).getDate();
            return {
                type: 'month',
                year: y,
                month: m,
                startDate: formatYMD(y, m, 1),
                endDate: formatYMD(y, m, lastDay),
                periodo: `${y}-${String(m).padStart(2, '0')}`,
                label: `${SPANISH_MONTH_NAMES[m]} ${y}`
            };
        }

        // 'mes pasado', 'mes anterior'
        if (/\b(mes\s+pasado|mes\s+anterior)\b/i.test(normalized)) {
            const now = new Date();
            let y = now.getFullYear();
            let m = now.getMonth();
            if (m === 0) { m = 12; y -= 1; }
            const lastDay = new Date(y, m, 0).getDate();
            return {
                type: 'month',
                year: y,
                month: m,
                startDate: formatYMD(y, m, 1),
                endDate: formatYMD(y, m, lastDay),
                periodo: `${y}-${String(m).padStart(2, '0')}`,
                label: `${SPANISH_MONTH_NAMES[m]} ${y}`
            };
        }
    }

    // 3. Fallback a fecha individual
    const single = parseSpanishDateText(text, ref);
    if (single) {
        return {
            type: 'single',
            date: single,
            label: toDisplayDate(single)
        };
    }

    return null;
};

/**
 * Normalizar fecha enviada por el usuario (admite YYYY-MM-DD, DD/MM/YYYY o lenguaje natural)
 */
const parseUserDate = (input) => {
    if (!input) return null;
    const clean = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const match = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    return parseSpanishDateText(clean);
};

/**
 * Teclado interactivo principal para Telegram
 */
const getMainReplyKeyboard = () => {
    return {
        keyboard: [
            [{ text: '⛽ Ventas de Hoy' }, { text: '⛽ Ventas de Ayer' }],
            [{ text: '🏦 Saldo en Banco' }, { text: '🧾 Saldo en Chequera' }],
            [{ text: '🚨 Alertas en Estaciones' }, { text: 'ℹ️ Mi Perfil' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
};

/**
 * Comprobar conexión con la API de Telegram (getMe)
 */
const testTelegramConnection = async (customToken = null) => {
    const token = customToken || (await getBotToken()).token;
    if (!token) throw new Error('Token de Telegram no configurado');
    const res = await axios.get(`${TELEGRAM_API_BASE}${token}/getMe`, { timeout: 10000 });
    if (res.data?.ok) {
        botInfo = res.data.result;
        return res.data.result;
    }
    throw new Error('Respuesta inválida de Telegram API');
};

/**
 * Enviar mensaje a un chat de Telegram
 */
const sendTelegramMessage = async (chatId, text, replyMarkup = null) => {
    const { token } = await getBotToken();
    if (!token) return;

    const payload = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };

    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }

    try {
        await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
    } catch (err) {
        // Si falló por formato HTML, intentar enviar como texto plano
        if (err.response?.data?.description?.includes('can\'t parse entities')) {
            const plainText = text.replace(/<[^>]*>?/gm, '');
            delete payload.parse_mode;
            payload.text = plainText;
            await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
        } else {
            console.error('[TelegramBot] Error enviando mensaje a chat:', chatId, err.message);
        }
    }
};

/**
 * Verificar o registrar usuario en telegram_usuarios
 */
const resolveTelegramUser = async (from) => {
    const db = getDb();
    if (!db) return null;

    const telegramUserId = String(from.id);
    const username = from.username ? `@${from.username}` : null;
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';

    try {
        const [rows] = await db.query(
            'SELECT * FROM telegram_usuarios WHERE telegram_user_id = ? LIMIT 1',
            [telegramUserId]
        );

        if (rows && rows.length > 0) {
            const user = rows[0];
            // Actualizar datos de perfil e interacción
            await db.query(
                `UPDATE telegram_usuarios 
                 SET telegram_username = ?, first_name = ?, last_name = ?, last_interaction = NOW() 
                 WHERE id = ?`,
                [username, firstName, lastName, user.id]
            );
            return { ...user, telegram_username: username, first_name: firstName, last_name: lastName };
        }

        // Intentar autovinculación inteligente con usuario de SIPE si coincide nombre o username
        let matchedUserId = null;
        try {
            const fullName = `${firstName} ${lastName}`.trim();
            const cleanUser = (username || '').replace(/^@/, '').trim();
            const [matchedUsers] = await db.query(`
                SELECT id, nombre, username, email FROM users 
                WHERE (LOWER(TRIM(nombre)) = LOWER(TRIM(?)) AND ? != '')
                   OR (LOWER(TRIM(username)) = LOWER(TRIM(?)) AND ? != '')
                LIMIT 1
            `, [fullName, fullName, cleanUser, cleanUser]);
            if (matchedUsers && matchedUsers.length > 0) {
                matchedUserId = matchedUsers[0].id;
            }
        } catch (_) {
            // Silenciosamente continuar sin vinculación automática
        }

        // Si no existe, insertar con activo = 0 para aprobación administrativa
        const [insertRes] = await db.query(
            `INSERT INTO telegram_usuarios 
             (telegram_user_id, telegram_username, first_name, last_name, user_id, activo, permiso_ventas, permiso_saldos_banco, permiso_saldos_chequera, permiso_alertas, notas, last_interaction)
             VALUES (?, ?, ?, ?, ?, 0, 1, 1, 1, 1, 'Solicitud automática desde Telegram', NOW())`,
            [telegramUserId, username, firstName, lastName, matchedUserId]
        );

        return {
            id: insertRes.insertId,
            telegram_user_id: telegramUserId,
            telegram_username: username,
            first_name: firstName,
            last_name: lastName,
            user_id: matchedUserId,
            activo: 0,
            permiso_ventas: 1,
            permiso_saldos_banco: 1,
            permiso_saldos_chequera: 1,
            permiso_alertas: 1
        };
    } catch (err) {
        console.error('[TelegramBot] Error resolviendo usuario:', err.message);
        return null;
    }
};

/**
 * Resolver permisos efectivos del usuario de Telegram.
 * Si está vinculado a un usuario de SIPE Admin (user_id),
 * hereda dinámicamente sus permisos de acuerdo con su rol y accesos configurados.
 */
const getUserEffectivePermissions = async (user) => {
    if (!user) {
        return {
            isLinked: false,
            linkedUser: null,
            inactiveInSipe: false,
            ventas: false,
            saldos_banco: false,
            saldos_chequera: false,
            alertas: false
        };
    }

    if (!user.user_id) {
        return {
            isLinked: false,
            linkedUser: null,
            inactiveInSipe: false,
            ventas: Boolean(user.permiso_ventas),
            saldos_banco: Boolean(user.permiso_saldos_banco),
            saldos_chequera: Boolean(user.permiso_saldos_chequera),
            alertas: Boolean(user.permiso_alertas)
        };
    }

    const db = getDb();
    if (!db) {
        return {
            isLinked: true,
            linkedUser: null,
            inactiveInSipe: false,
            ventas: Boolean(user.permiso_ventas),
            saldos_banco: Boolean(user.permiso_saldos_banco),
            saldos_chequera: Boolean(user.permiso_saldos_chequera),
            alertas: Boolean(user.permiso_alertas)
        };
    }

    try {
        const [rows] = await db.query(`
            SELECT u.id, u.username, u.nombre, u.email, u.status, r.name as role_name,
                   GROUP_CONCAT(p.name) as permissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE u.id = ?
            GROUP BY u.id
        `, [user.user_id]);

        if (!rows || rows.length === 0) {
            return {
                isLinked: false,
                linkedUser: null,
                inactiveInSipe: false,
                ventas: Boolean(user.permiso_ventas),
                saldos_banco: Boolean(user.permiso_saldos_banco),
                saldos_chequera: Boolean(user.permiso_saldos_chequera),
                alertas: Boolean(user.permiso_alertas)
            };
        }

        const su = rows[0];
        if (su.status && su.status !== 'active') {
            return {
                isLinked: true,
                linkedUser: su,
                inactiveInSipe: true,
                ventas: false,
                saldos_banco: false,
                saldos_chequera: false,
                alertas: false
            };
        }

        const isAdmin = su.role_name === 'Administrator';
        const permsList = (su.permissions || '').split(',');

        const hasVentas = isAdmin || permsList.includes('/dashboard/consultas/estaciones/ventas');
        const hasBancos = isAdmin || permsList.includes('/dashboard/bancos/reportes/saldos-bancos') || permsList.includes('/dashboard/bancos/cuentas') || permsList.includes('/dashboard/bancos/movimientos');
        const hasChequera = isAdmin || permsList.includes('/dashboard/bancos/reportes/saldos-chequera') || permsList.includes('/dashboard/bancos/cheques');
        const hasAlertas = isAdmin || permsList.includes('/dashboard/consultas/estaciones/diferencias-combustible') || permsList.includes('/dashboard/consultas/estaciones/resumen-cierre');

        return {
            isLinked: true,
            linkedUser: su,
            inactiveInSipe: false,
            ventas: hasVentas,
            saldos_banco: hasBancos,
            saldos_chequera: hasChequera,
            alertas: hasAlertas
        };
    } catch (err) {
        console.error('[TelegramBot] Error resolviendo permisos heredados:', err.message);
        return {
            isLinked: true,
            linkedUser: null,
            inactiveInSipe: false,
            ventas: Boolean(user.permiso_ventas),
            saldos_banco: Boolean(user.permiso_saldos_banco),
            saldos_chequera: Boolean(user.permiso_saldos_chequera),
            alertas: Boolean(user.permiso_alertas)
        };
    }
};

/**
 * Registrar en bitácora de consultas de Telegram
 */
const logTelegramQuery = async (telegramUserId, comando, consulta, autorizado = 1) => {
    try {
        const db = getDb();
        if (!db) return;
        await db.query(
            'INSERT INTO telegram_bitacora (telegram_user_id, comando, consulta, autorizado) VALUES (?, ?, ?, ?)',
            [String(telegramUserId), String(comando).slice(0, 100), String(consulta || '').slice(0, 250), autorizado ? 1 : 0]
        );
    } catch (e) {
        console.warn('[TelegramBot] No se pudo guardar bitácora de telegram:', e.message);
    }
};

/**
 * Consulta de Saldos en Bancos (sp_saldo_en_bancos con fallback)
 */
const getSaldosBancosData = async () => {
    const today = getDateStr(0);
    let bancosDetalle = [];
    let totalBancos = 0;

    try {
        const externalDb = await getExternalDb();
        if (externalDb) {
            const [spResults] = await externalDb.query('CALL sp_saldo_en_bancos(?)', [today]);
            const rows = spResults && spResults[0] ? spResults[0] : [];

            bancosDetalle = rows
                .filter(r => Number(r.new_saldo || r.saldo || 0) > 0)
                .map(r => {
                    const raw = (r.nom_banco || '').replace(/^A\s*-\s*/, '').trim();
                    const parts = raw.split(/\s*-\s*/);
                    const bancoKey = parts[0]?.trim() || 'Banco';
                    const banco = BANK_NAME_MAP[bancoKey] || bancoKey;
                    const cuentaDesc = parts.slice(1).join(' - ')?.trim() || r.num_cta || '';
                    const saldo = Number(r.new_saldo || r.saldo || 0);
                    return {
                        banco,
                        cuenta: r.num_cta ? (cuentaDesc ? `${cuentaDesc} (${r.num_cta})` : r.num_cta) : cuentaDesc,
                        saldo
                    };
                })
                .sort((a, b) => b.saldo - a.saldo);

            if (bancosDetalle.length > 0) {
                totalBancos = bancosDetalle.reduce((sum, b) => sum + b.saldo, 0);
                return { total: totalBancos, cuentas: bancosDetalle, fecha: today, fuente: 'sp_saldo_en_bancos' };
            }
        }
    } catch (err) {
        console.warn('[TelegramBot] Error en sp_saldo_en_bancos, ejecutando fallback local:', err.message);
    }

    // Fallback a cuentas locales
    try {
        const db = getDb();
        if (db) {
            const [bRows] = await db.query(`
                SELECT b.descripcion as banco, c.nombre as cuenta_desc, c.numero as cuenta,
                       COALESCE(SUM(m.abono - m.cargo), 0) as saldo
                FROM cuentas_bancarias c
                LEFT JOIN bancos b ON c.banco_id = b.id
                LEFT JOIN movimientos_bancarios m ON c.id = m.cuenta_bancaria_id
                WHERE c.activa = 1
                GROUP BY c.id, b.descripcion, c.nombre, c.numero
                HAVING saldo > 0
                ORDER BY saldo DESC
            `);
            bancosDetalle = (bRows || []).map(r => ({
                banco: r.banco || 'Banco',
                cuenta: r.cuenta ? `${r.cuenta_desc || ''} (${r.cuenta})`.trim() : (r.cuenta_desc || 'Cuenta'),
                saldo: Number(r.saldo || 0)
            }));
            totalBancos = bancosDetalle.reduce((sum, b) => sum + b.saldo, 0);
        }
    } catch (localErr) {
        console.warn('[TelegramBot] Error en fallback local de bancos:', localErr.message);
    }

    return { total: totalBancos, cuentas: bancosDetalle, fecha: today, fuente: 'local' };
};

/**
 * Consulta de Saldos en Chequera (sp_saldo_en_chequera con fallback)
 */
const getSaldosChequeraData = async () => {
    const today = getDateStr(0);
    let chequerasDetalle = [];
    let totalChequera = 0;

    try {
        const externalDb = await getExternalDb();
        if (externalDb) {
            const [spResults] = await externalDb.query('CALL sp_saldo_en_chequera(?)', [today]);
            const rows = spResults && spResults[0] ? spResults[0] : [];

            chequerasDetalle = rows
                .filter(r => Number(r.new_saldo ?? r.saldo_chequera ?? r.saldo ?? r.monto ?? 0) !== 0)
                .map(r => {
                    const raw = (r.nom_banco || r.banco || '').replace(/^A\s*-\s*/, '').trim();
                    const parts = raw.split(/\s*-\s*/);
                    const bancoKey = parts[0]?.trim() || 'Banco';
                    const banco = BANK_NAME_MAP[bancoKey] || bancoKey;
                    const numCta = r.num_cta || r.numero || r.cuenta || '';
                    const cuentaDesc = parts.slice(1).join(' - ')?.trim() || numCta;
                    const saldo = Number(r.new_saldo ?? r.saldo_chequera ?? r.saldo ?? r.monto ?? 0);
                    return {
                        banco,
                        cuenta: numCta ? (cuentaDesc ? `${cuentaDesc} (${numCta})` : numCta) : cuentaDesc,
                        saldo
                    };
                })
                .sort((a, b) => b.saldo - a.saldo);

            if (chequerasDetalle.length > 0) {
                totalChequera = chequerasDetalle.reduce((sum, c) => sum + c.saldo, 0);
                return { total: totalChequera, cuentas: chequerasDetalle, fecha: today, fuente: 'sp_saldo_en_chequera' };
            }
        }
    } catch (err) {
        console.warn('[TelegramBot] Error en sp_saldo_en_chequera, ejecutando fallback:', err.message);
    }

    // Fallback a validaciones_saldo_banco o movimientos de cuentas
    try {
        const db = getDb();
        if (db) {
            const [rows] = await db.query(`
                SELECT b.descripcion as banco, c.nombre as cuenta_desc, c.numero as cuenta,
                       v.saldo_chequera as saldo
                FROM validaciones_saldo_banco v
                INNER JOIN (
                    SELECT cuenta_bancaria_id, MAX(id) as max_id 
                    FROM validaciones_saldo_banco 
                    GROUP BY cuenta_bancaria_id
                ) latest ON v.id = latest.max_id
                INNER JOIN cuentas_bancarias c ON v.cuenta_bancaria_id = c.id
                LEFT JOIN bancos b ON c.banco_id = b.id
                WHERE c.activa = 1
                ORDER BY v.saldo_chequera DESC
            `);
            chequerasDetalle = (rows || []).map(r => ({
                banco: r.banco || 'Banco',
                cuenta: `${r.cuenta_desc || ''} (${r.cuenta})`.trim(),
                saldo: Number(r.saldo || 0)
            }));
            totalChequera = chequerasDetalle.reduce((sum, c) => sum + c.saldo, 0);
        }
    } catch (e) {
        console.warn('[TelegramBot] Error en fallback de chequeras:', e.message);
    }

    return { total: totalChequera, cuentas: chequerasDetalle, fecha: today, fuente: 'local' };
};

/**
 * Consulta de Ventas Consolidadas y Alertas
 */
const getConsolidadoVentas = async (date) => {
    const { getConsolidadoVentasData } = require('../routes/consultas');
    if (!getConsolidadoVentasData) {
        throw new Error('Módulo de consolidado de ventas no disponible');
    }
    return await getConsolidadoVentasData(date);
};

/**
 * Formatear mensaje de Resumen de Ventas
 */
const formatVentasMessage = (data, date) => {
    const estaciones = data?.estaciones || [];
    const tiendas = data?.tiendas || [];

    let totalDiesel = 0;
    let totalRegular = 0;
    let totalSuper = 0;
    let totalIon = 0;
    let totalGalones = 0;
    let totalVentaCombustible = 0;

    estaciones.forEach(e => {
        totalDiesel += Number(e.diesel || 0);
        totalRegular += Number(e.regular || 0);
        totalSuper += Number(e.super || 0);
        totalIon += Number(e.ion || 0);
        totalGalones += Number(e.galonaje || 0);
        totalVentaCombustible += Number(e.venta || 0);
    });

    const totalVentaTiendas = tiendas.reduce((acc, t) => acc + Number(t.venta || 0), 0);
    const totalGlobal = totalVentaCombustible + totalVentaTiendas;

    let msg = `⛽ <b>VENTAS DE ESTACIONES Y TIENDAS</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `📊 <b>RESUMEN CONSOLIDADO:</b>\n`;
    msg += `• <b>Galonaje Total:</b> <code>${numFmt(totalGalones)} gal</code>\n`;
    msg += `  ├ 🛢️ <b>Diesel:</b> ${numFmt(totalDiesel)} gal\n`;
    msg += `  ├ 🟢 <b>Regular:</b> ${numFmt(totalRegular)} gal\n`;
    msg += `  ├ 🔴 <b>Súper:</b> ${numFmt(totalSuper)} gal\n`;
    if (totalIon > 0) {
        msg += `  ├ ⚡ <b>Ion Diesel:</b> ${numFmt(totalIon)} gal\n`;
    }
    msg += `• <b>Venta Combustible:</b> <code>${moneyFmt(totalVentaCombustible)}</code>\n`;
    msg += `• <b>Venta Tiendas:</b> <code>${moneyFmt(totalVentaTiendas)}</code>\n`;
    msg += `• 💰 <b>VENTA TOTAL:</b> <b>${moneyFmt(totalGlobal)}</b>\n\n`;

    if (estaciones.length > 0) {
        msg += `🏪 <b>DETALLE POR ESTACIÓN:</b>\n`;
        estaciones.forEach((e, idx) => {
            const gal = numFmt(e.galonaje || 0);
            const vta = moneyFmt(e.venta || 0);
            msg += `${idx + 1}. <b>${escapeHtml(e.empresa || e.titulo || 'Estación')}</b>\n`;
            msg += `   └ ⛽ ${gal} gal | 💵 ${vta}\n`;
        });
        msg += `\n`;
    }

    if (tiendas.length > 0) {
        msg += `🛒 <b>VENTAS EN TIENDAS (CORTES):</b>\n`;
        tiendas.forEach((t) => {
            const vta = moneyFmt(t.venta || 0);
            msg += `• <b>${escapeHtml(t.empresa || 'Tienda')}:</b> ${vta}\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Dirección Estratégica</i>`;
    return msg;
};

/**
 * Formatear mensaje de Saldos en Bancos
 */
const formatBancosMessage = (data) => {
    let msg = `🏦 <b>SALDOS CONSOLIDADOS EN BANCOS</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(data.fecha)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 <b>SALDO TOTAL EN BANCOS:</b>\n`;
    msg += `<b>${moneyFmt(data.total)}</b>\n\n`;

    if (!data.cuentas || data.cuentas.length === 0) {
        msg += `<i>No se encontraron cuentas bancarias con saldo positivo para la fecha.</i>\n`;
    } else {
        msg += `📋 <b>DETALLE POR CUENTA:</b>\n`;
        // Agrupar por banco
        const porBanco = {};
        data.cuentas.forEach(c => {
            const b = c.banco || 'Otros';
            if (!porBanco[b]) porBanco[b] = [];
            porBanco[b].push(c);
        });

        Object.keys(porBanco).forEach(banco => {
            const subtotal = porBanco[banco].reduce((sum, item) => sum + item.saldo, 0);
            msg += `🏛️ <b>${escapeHtml(banco)}</b> (<i>${moneyFmt(subtotal)}</i>)\n`;
            porBanco[banco].forEach(item => {
                msg += `   └ ${escapeHtml(item.cuenta)}: <code>${moneyFmt(item.saldo)}</code>\n`;
            });
            msg += `\n`;
        });
    }

    msg += `<i>Fuente: ${data.fuente === 'sp_saldo_en_bancos' ? 'Conciliación Bancaria' : 'Catálogo Local'}</i>`;
    return msg;
};

/**
 * Formatear mensaje de Saldos en Chequera
 */
const formatChequeraMessage = (data) => {
    let msg = `🧾 <b>SALDOS EN CHEQUERA</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(data.fecha)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 <b>TOTAL EN CHEQUERAS:</b>\n`;
    msg += `<b>${moneyFmt(data.total)}</b>\n\n`;

    if (!data.cuentas || data.cuentas.length === 0) {
        msg += `<i>No se registraron cuentas de chequera con movimiento activo.</i>\n`;
    } else {
        msg += `📋 <b>DETALLE POR CUENTA DE CHEQUES:</b>\n`;
        data.cuentas.forEach((c, idx) => {
            msg += `${idx + 1}. <b>${escapeHtml(c.banco)}</b>\n`;
            msg += `   └ ${escapeHtml(c.cuenta)}: <code>${moneyFmt(c.saldo)}</code>\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Control de Tesorería</i>`;
    return msg;
};

/**
 * Formatear mensaje de Alertas Operativas y Auditoría
 */
const formatAlertasMessage = (data, date) => {
    const auditoria = data?.auditoria || {};
    const totalAlertas = Number(auditoria.total_alertas || 0);

    let msg = `🚨 <b>ALERTAS Y AUDITORÍA EN ESTACIONES</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (totalAlertas === 0) {
        msg += `✅ <b>AUDITORÍA EN ORDEN</b>\n`;
        msg += `No se detectaron descuadres ni anomalías operativas para esta fecha:\n`;
        msg += `• Cierres de pista cuadrados correctamente\n`;
        msg += `• Tiendas sin descuadres de corte\n`;
        msg += `• Sin gastos operativos anómalos reportados\n`;
        msg += `• Galonajes consistentes con ventas\n\n`;
        msg += `<i>Todas las estaciones operaron bajo parámetros normales.</i>`;
        return msg;
    }

    msg += `⚠️ <b>TOTAL ALERTAS DETECTADAS: ${totalAlertas}</b>\n\n`;

    // 1. Descuadres en Pista
    const resumenCierre = data?.resumen_cierre || [];
    const difPista = resumenCierre.filter(r => Math.abs(Number(r.diferencia || 0)) > 0.05);
    if (difPista.length > 0) {
        msg += `⛽ <b>Descuadres en Pista (Cierre Turno):</b>\n`;
        difPista.forEach(r => {
            const dif = Number(r.diferencia || 0);
            const icon = dif < 0 ? '🔴' : '🟡';
            msg += `• ${icon} <b>${escapeHtml(r.estacion || r.empresa || 'Estación')}:</b> Dif. ${moneyFmt(dif)}\n`;
        });
        msg += `\n`;
    }

    // 2. Descuadres en Tienda
    const cortesTienda = data?.cortes_tienda || [];
    const difTiendas = cortesTienda.filter(t => Math.abs(Number(t.dif || 0)) > 0.01);
    if (difTiendas.length > 0) {
        msg += `🛒 <b>Descuadres en Cortes de Tienda:</b>\n`;
        difTiendas.forEach(t => {
            const dif = Number(t.dif || 0);
            const icon = dif < 0 ? '🔴' : '🟡';
            msg += `• ${icon} <b>${escapeHtml(t.empresa || 'Tienda')}:</b> Dif. ${moneyFmt(dif)}\n`;
        });
        msg += `\n`;
    }

    // 3. Gastos en Tienda
    const gTiendas = cortesTienda.filter(t => Number(t.gastos || 0) > 0);
    if (gTiendas.length > 0) {
        msg += `💸 <b>Gastos Reportados en Tiendas:</b>\n`;
        gTiendas.forEach(t => {
            msg += `• <b>${escapeHtml(t.empresa || 'Tienda')}:</b> ${moneyFmt(t.gastos)}\n`;
        });
        msg += `\n`;
    }

    // 4. Incongruencias de Galonaje
    const estaciones = data?.estaciones || [];
    const incongGal = estaciones.filter(e => (Number(e.galonaje || 0) === 0 && Number(e.venta || 0) > 0) || (Number(e.galonaje || 0) > 0 && Number(e.venta || 0) === 0));
    if (incongGal.length > 0) {
        msg += `⚠️ <b>Incongruencias Galonaje / Venta:</b>\n`;
        incongGal.forEach(e => {
            msg += `• <b>${escapeHtml(e.empresa || 'Estación')}:</b> ${numFmt(e.galonaje)} gal vs ${moneyFmt(e.venta)}\n`;
        });
        msg += `\n`;
    }

    msg += `<i>Ver detalle completo en SIPE Admin &gt; Consultas &gt; Resumen de Ventas</i>`;
    return msg;
};

/**
 * Formatear perfil del usuario
 */
const formatProfileMessage = (user, effectivePerms = null) => {
    const perms = effectivePerms || {
        isLinked: false,
        linkedUser: null,
        ventas: Boolean(user.permiso_ventas),
        saldos_banco: Boolean(user.permiso_saldos_banco),
        saldos_chequera: Boolean(user.permiso_saldos_chequera),
        alertas: Boolean(user.permiso_alertas)
    };

    let msg = `👤 <b>PERFIL DE USUARIO TELEGRAM</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `• <b>Nombre:</b> ${escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'No especificado')}\n`;
    msg += `• <b>Usuario:</b> ${escapeHtml(user.telegram_username || 'Sin @username')}\n`;
    msg += `• <b>ID Telegram:</b> <code>${escapeHtml(user.telegram_user_id)}</code>\n`;
    msg += `• <b>Estado:</b> ${user.activo ? '🟢 <b>Activo / Autorizado</b>' : '🔴 <b>Inactivo</b>'}\n`;

    if (perms.isLinked && perms.linkedUser) {
        msg += `• <b>Usuario SIPE Admin:</b> 🏢 <b>${escapeHtml(perms.linkedUser.nombre || perms.linkedUser.username)}</b>\n`;
        msg += `• <b>Rol en SIPE:</b> 🛡️ <i>${escapeHtml(perms.linkedUser.role_name || 'Usuario')}</i>\n`;
        msg += `• <b>Modo de Permisos:</b> 🔄 <i>Heredados de SIPE Admin</i>\n\n`;
    } else {
        msg += `• <b>Usuario SIPE:</b> ⚠️ <i>Sin vincular (Permisos manuales)</i>\n\n`;
    }

    msg += `🔑 <b>PERMISOS DE CONSULTA ACTIVOS:</b>\n`;
    msg += `${perms.ventas ? '✅' : '❌'} <b>Ventas de Estaciones</b>\n`;
    msg += `${perms.saldos_banco ? '✅' : '❌'} <b>Saldo en Bancos</b>\n`;
    msg += `${perms.saldos_chequera ? '✅' : '❌'} <b>Saldo en Chequera</b>\n`;
    msg += `${perms.alertas ? '✅' : '❌'} <b>Alertas en Estaciones</b>\n\n`;
    msg += `<i>Administrado desde SIPE Admin (Seguridad &gt; Usuarios de Telegram)</i>`;
    return msg;
};


const KNOWN_STATIONS = [
    {
        id: '008',
        name: 'Puma Costa del Sol',
        keywords: ['costa del sol', 'costa', 'la costa', 'puma costa', 'super 7 costa', '008'],
        tiendaKey: 'costa'
    },
    {
        id: '002',
        name: 'Puma Miraflores',
        keywords: ['miraflores', 'puma miraflores', 'e-market miraflores', '002'],
        tiendaKey: 'miraflores'
    },
    {
        id: '006',
        name: 'Shell Chalchuapa',
        keywords: ['chalchuapa', 'shell chalchuapa', 'e-market chalchuapa', '006'],
        tiendaKey: 'chalchuapa'
    },
    {
        id: '014',
        name: 'Puma La Loma (San Martín)',
        keywords: ['la loma', 'san martin', 'san martín', 'loma', 'puma la loma', 'puma san martin', '014'],
        tiendaKey: 'san martin'
    },
    {
        id: '015',
        name: 'Shell 14 Avenida',
        keywords: ['14 avenida', '14 ave', 'catorce avenida', 'shell 14', '015'],
        tiendaKey: '14'
    }
];

const KNOWN_FUELS = [
    { key: 'ion', label: 'Ion Diesel', icon: '⚡', keywords: ['ion diesel', 'ion-diesel', 'ion'] },
    { key: 'diesel', label: 'Diesel', icon: '🛢️', keywords: ['diesel', 'diésel'] },
    { key: 'regular', label: 'Regular', icon: '🟢', keywords: ['regular', 'gasolina regular'] },
    { key: 'super', label: 'Súper', icon: '🔴', keywords: ['super', 'súper', 'gasolina super', 'gasolina súper'] }
];

const KNOWN_BANKS = [
    { key: 'AGRICOLA', label: 'Banco Agrícola', keywords: ['agricola', 'agrícola', 'banco agricola'] },
    { key: 'PROMERICA', label: 'Banco Promerica', keywords: ['promerica', 'banco promerica'] },
    { key: 'DAVIVIENDA', label: 'Banco Davivienda', keywords: ['davivienda', 'banco davivienda'] },
    { key: 'HIPOTECARIO', label: 'Banco Hipotecario', keywords: ['hipotecario', 'banco hipotecario'] },
    { key: 'ATLANTIDA', label: 'Banco Atlántida', keywords: ['atlantida', 'atlántida', 'banco atlantida'] },
    { key: 'CUSCATLAN', label: 'Banco Cuscatlán', keywords: ['cuscatlan', 'cuscatlán', 'banco cuscatlan'] },
    { key: 'BAC', label: 'BAC Credomatic', keywords: ['bac', 'credomatic', 'america central'] },
    { key: 'AZUL', label: 'Banco Azul', keywords: ['azul', 'banco azul'] }
];

/**
 * Analizador semántico de lenguaje natural para consultas específicas
 */
const parseNaturalLanguageQuery = (rawText) => {
    if (!rawText) return null;
    const normalized = normalizeText(rawText);

    // 1. Detección de periodo o fecha en español natural
    const period = parseSpanishPeriodOrDate(rawText);
    let targetDate = getDateStr(-1); // Ayer por defecto (cierres consolidados)
    let isRange = false;
    let startDate = null;
    let endDate = null;
    let isMonthly = false;
    let targetMonth = null;
    let targetYear = null;
    let targetPeriod = null;

    if (period) {
        if (period.type === 'month') {
            isMonthly = true;
            targetMonth = period.month;
            targetYear = period.year;
            targetPeriod = period.periodo;
            startDate = period.startDate;
            endDate = period.endDate;
            targetDate = period.endDate;
        } else if (period.type === 'range') {
            isRange = true;
            startDate = period.startDate;
            endDate = period.endDate;
            targetDate = period.endDate;
        } else if (period.type === 'single') {
            targetDate = period.date;
        }
    } else {
        const naturalDate = parseSpanishDateText(rawText);
        if (naturalDate) targetDate = naturalDate;
    }

    // 2. Detección de estación con límites de palabra estricta (priorizando frases más largas)
    let matchedStation = null;
    const stationCandidates = [];
    for (const st of KNOWN_STATIONS) {
        for (const kw of st.keywords) {
            stationCandidates.push({ station: st, normKw: normalizeText(kw) });
        }
    }
    stationCandidates.sort((a, b) => b.normKw.length - a.normKw.length);
    for (const cand of stationCandidates) {
        const escaped = escapeRegex(cand.normKw);
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalized)) {
            matchedStation = cand.station;
            break;
        }
    }

    // 3. Detección de combustible con límites de palabra estricta (\bion\b)
    // PROHIBIDO usar normalized.includes(normKw) sin word boundary para evitar colisiones (ej: 'estacion' contiene 'ion')
    // Las frases compuestas ('ion diesel') se evalúan antes de términos individuales ('diesel', 'ion')
    let matchedFuel = null;
    const fuelCandidates = [];
    for (const f of KNOWN_FUELS) {
        for (const kw of f.keywords) {
            fuelCandidates.push({ fuel: f, normKw: normalizeText(kw) });
        }
    }
    fuelCandidates.sort((a, b) => b.normKw.length - a.normKw.length);
    for (const cand of fuelCandidates) {
        const escaped = escapeRegex(cand.normKw);
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalized)) {
            matchedFuel = cand.fuel;
            break;
        }
    }

    // 4. Detección de banco con límites de palabra estricta (priorizando nombres completos)
    let matchedBank = null;
    const bankCandidates = [];
    for (const b of KNOWN_BANKS) {
        for (const kw of b.keywords) {
            bankCandidates.push({ bank: b, normKw: normalizeText(kw) });
        }
    }
    bankCandidates.sort((a, b) => b.normKw.length - a.normKw.length);
    for (const cand of bankCandidates) {
        const escaped = escapeRegex(cand.normKw);
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalized)) {
            matchedBank = cand.bank;
            break;
        }
    }

    // 5. Detección de rankings o comparativas
    const isRanking = /\b(cual|quien|que estacion|estacion que|estaciones que)\b.*(mas|menos|mayor|menor|lider|top|primer)/.test(normalized) ||
                      /\b(top ventas|ranking|mayor venta|mas vendio|menos vendio)\b/.test(normalized);

    // 6. Detección de tiendas de conveniencia
    const isTiendas = /\b(tienda|tiendas|conveniencia|cortes|corte|e-market|super 7|pedregal)\b/.test(normalized);

    // 7. Detección de auditoría / descuadres
    const isAlertas = /\b(descuadre|descuadres|diferencia|diferencias|alerta|alertas|anomalia|anomalias|merma|mermas|faltante|sobrante|cuadrado)\b/.test(normalized);

    // 8. Detección de consultas de energía solar / batería
    const isSolar = /\b(solar|solares|panel|paneles|fotovoltaic[oa]s?|bateria|baterias|inversor|autonomia|kwh|kwp|ahorro solar|energia solar)\b/i.test(normalized);

    // 9. Detección de consultas de horas pico / horario de ventas
    const isHourlyPeak = /\b(a que hora[s]?|hora[s]? pico|horas de mayor venta|momento de mayor venta|horario[s]? de venta|hora con mas venta|pico[s]? de venta|mayor cantidad de venta)\b/i.test(normalized) ||
                         (/\b(hora|horas|horario)\b/i.test(normalized) && /\b(venta|ventas|pico|mayor|mas)\b/i.test(normalized));

    return {
        normalized,
        targetDate,
        matchedStation,
        matchedFuel,
        matchedBank,
        isRanking,
        isTiendas,
        isAlertas,
        isSolar,
        isEnergy: isSolar,
        isHourlyPeak,
        isHorasPico: isHourlyPeak,
        isRange,
        isRango: isRange,
        startDate,
        endDate,
        dateRange: isRange ? { start: startDate, end: endDate } : null,
        isMonthly,
        isMensual: isMonthly,
        targetMonth,
        targetYear,
        targetPeriod
    };
};

/**
 * Formatear respuesta de estación específica
 */
const formatSpecificStationMessage = (st, fuel, date, tienda) => {
    let msg = `⛽ <b>${escapeHtml(st.empresa)}</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (fuel) {
        const gal = Number(st[fuel.key] || 0);
        msg += `${fuel.icon} <b>Venta de ${fuel.label}:</b> <code>${numFmt(gal)} gal</code>\n\n`;
        msg += `📊 <b>Resumen General de la Estación:</b>\n`;
    } else {
        msg += `📊 <b>Desglose de Combustibles:</b>\n`;
    }

    msg += `• 🛢️ <b>Diesel:</b> ${numFmt(st.diesel)} gal\n`;
    msg += `• 🟢 <b>Regular:</b> ${numFmt(st.regular)} gal\n`;
    msg += `• 🔴 <b>Súper:</b> ${numFmt(st.super)} gal\n`;
    if (Number(st.ion || 0) > 0) {
        msg += `• ⚡ <b>Ion Diesel:</b> ${numFmt(st.ion)} gal\n`;
    }
    msg += `• ⛽ <b>Galonaje Total:</b> <code>${numFmt(st.galonaje)} gal</code>\n`;
    msg += `• 💰 <b>Venta en Pista:</b> <b>${moneyFmt(st.venta)}</b>\n`;

    if (tienda && Number(tienda.venta || 0) > 0) {
        msg += `• 🛒 <b>Venta Tienda (${escapeHtml(tienda.empresa)}):</b> ${moneyFmt(tienda.venta)}\n`;
        msg += `• 💵 <b>Total Estación + Tienda:</b> <b>${moneyFmt(Number(st.venta || 0) + Number(tienda.venta || 0))}</b>\n`;
    }

    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear venta total de un combustible específico entre todas las estaciones
 */
const formatProductTotalMessage = (data, fuel, date) => {
    const estaciones = data?.estaciones || [];
    const totalGal = estaciones.reduce((acc, e) => acc + Number(e[fuel.key] || 0), 0);

    let msg = `${fuel.icon} <b>VENTA TOTAL DE ${fuel.label.toUpperCase()}</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `• <b>Total Consolidado:</b> <code>${numFmt(totalGal)} gal</code>\n\n`;
    msg += `🏪 <b>Desglose por Estación:</b>\n`;
    estaciones.forEach((e, idx) => {
        msg += `${idx + 1}. <b>${escapeHtml(e.empresa)}:</b> ${numFmt(e[fuel.key] || 0)} gal\n`;
    });
    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear ranking de estaciones (por venta en pista, galonaje total o combustible específico)
 */
const formatRankingMessage = (data, date, metric = 'venta', fuel = null) => {
    const estaciones = [...(data?.estaciones || [])];
    if (fuel && fuel.key) {
        estaciones.sort((a, b) => Number(b[fuel.key] || 0) - Number(a[fuel.key] || 0));
    } else if (metric === 'galonaje') {
        estaciones.sort((a, b) => Number(b.galonaje || 0) - Number(a.galonaje || 0));
    } else {
        estaciones.sort((a, b) => Number(b.venta || 0) - Number(a.venta || 0));
    }

    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
    let msg = fuel
        ? `🏆 <b>RANKING DE VENTA DE ${escapeHtml(fuel.label.toUpperCase())} POR ESTACIÓN</b>\n`
        : `🏆 <b>RANKING DE VENTAS POR ESTACIÓN</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    estaciones.forEach((e, idx) => {
        const medal = medals[idx] || `${idx + 1}.`;
        if (fuel && fuel.key) {
            msg += `${medal} <b>${escapeHtml(e.empresa)}:</b> <code>${numFmt(e[fuel.key] || 0)} gal</code>\n`;
        } else {
            msg += `${medal} <b>${escapeHtml(e.empresa)}:</b> <b>${moneyFmt(e.venta)}</b> (<code>${numFmt(e.galonaje)} gal</code>)\n`;
        }
    });
    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear consulta específica de un banco
 */
const formatSpecificBankMessage = (data, bank) => {
    const cuentas = (data?.cuentas || []).filter(c => {
        const norm = normalizeText(c.banco);
        return bank.keywords.some(kw => norm.includes(normalizeText(kw)));
    });
    const totalBanco = cuentas.reduce((sum, c) => sum + Number(c.saldo || 0), 0);

    let msg = `🏛️ <b>${escapeHtml(bank.label)}</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(data.fecha)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 <b>Saldo Total en el Banco:</b> <b>${moneyFmt(totalBanco)}</b>\n\n`;

    if (cuentas.length === 0) {
        msg += `<i>No se registraron cuentas con saldo positivo en este banco.</i>\n`;
    } else {
        msg += `📋 <b>Cuentas Asociadas:</b>\n`;
        cuentas.forEach((c, idx) => {
            msg += `${idx + 1}. ${escapeHtml(c.cuenta)}: <code>${moneyFmt(c.saldo)}</code>\n`;
        });
    }
    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear consulta de tiendas
 */
const formatTiendasMessage = (data, date) => {
    const tiendas = data?.tiendas || [];
    const totalTiendas = tiendas.reduce((sum, t) => sum + Number(t.venta || 0), 0);

    let msg = `🛒 <b>VENTAS EN TIENDAS DE CONVENIENCIA</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 <b>Venta Total Tiendas:</b> <b>${moneyFmt(totalTiendas)}</b>\n\n`;
    if (tiendas.length === 0) {
        msg += `<i>No se registraron cortes de tienda para esta fecha.</i>\n`;
    } else {
        tiendas.forEach((t, idx) => {
            msg += `${idx + 1}. <b>${escapeHtml(t.empresa)}:</b> <code>${moneyFmt(t.venta)}</code>\n`;
        });
    }
    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear reporte de ventas consolidadas mensuales
 */
const formatVentasMensualMessage = (data, year, month) => {
    const monthNum = Number(month);
    const monthLabel = SPANISH_MONTH_NAMES[monthNum] || `Mes ${month}`;
    const tot = data?.totales || {};
    const estaciones = data?.estaciones || [];
    const tiendas = data?.tiendas || [];

    let msg = `📅 <b>VENTAS CONSOLIDADAS • ${monthLabel.toUpperCase()} ${year}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⛽ <b>Total Galonaje Red:</b> <code>${numFmt(tot.galonaje || 0)} gal</code>\n`;
    msg += `💰 <b>Venta Combustible:</b> <b>${moneyFmt(tot.venta_estacion || tot.venta || 0)}</b>\n`;
    if (Number(tot.venta_tienda || 0) > 0) {
        msg += `🛒 <b>Venta Tiendas:</b> ${moneyFmt(tot.venta_tienda || 0)}\n`;
        msg += `💵 <b>Venta Total Red:</b> <b>${moneyFmt(tot.venta_total || 0)}</b>\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    // Ranking de Estaciones por Galonaje y Venta
    msg += `🏆 <b>Resumen por Gasolinera (${monthLabel} ${year}):</b>\n`;
    const sorted = [...estaciones].sort((a, b) => Number(b.galonaje || 0) - Number(a.galonaje || 0));
    sorted.forEach((e, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📍';
        const vTot = Number(e.venta_estacion || e.venta || 0);
        msg += `${medal} <b>${escapeHtml(e.empresa)}:</b>\n`;
        msg += `   • Galonaje: <code>${numFmt(e.galonaje || 0)} gal</code>\n`;
        msg += `   • Venta Pista: <b>${moneyFmt(vTot)}</b>\n`;
        msg += `   • 🛢️ ${numFmt(e.diesel || 0)} | 🟢 ${numFmt(e.regular || 0)} | 🔴 ${numFmt(e.super || 0)}${Number(e.ion || 0) > 0 ? ` | ⚡ ${numFmt(e.ion)}` : ''}\n`;
    });

    if (tiendas.length > 0) {
        msg += `\n🛒 <b>Ventas en Tiendas de Conveniencia:</b>\n`;
        tiendas.forEach((t) => {
            msg += `• <b>${escapeHtml(t.empresa)}:</b> ${moneyFmt(t.venta || 0)}\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Reporte Mensual Consolidado</i>`;
    return msg;
};

/**
 * Formatear reporte de ventas por rango de fechas
 */
const formatVentasRangoMessage = (data, startDate, endDate, label = null) => {
    const tot = data?.totales || {};
    const estaciones = data?.estaciones || [];
    const tiendas = data?.tiendas || [];
    const rangeLabel = label || `Del ${toDisplayDate(startDate)} al ${toDisplayDate(endDate)}`;

    let msg = `📅 <b>VENTAS POR RANGO DE FECHAS</b>\n`;
    msg += `🗓️ <b>Período:</b> ${escapeHtml(rangeLabel)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⛽ <b>Total Galonaje Red:</b> <code>${numFmt(tot.galonaje || 0)} gal</code>\n`;
    msg += `💰 <b>Venta Combustible:</b> <b>${moneyFmt(tot.venta_estacion || tot.venta || 0)}</b>\n`;
    if (Number(tot.venta_tienda || 0) > 0) {
        msg += `🛒 <b>Venta Tiendas:</b> ${moneyFmt(tot.venta_tienda || 0)}\n`;
        msg += `💵 <b>Venta Total Red:</b> <b>${moneyFmt(tot.venta_total || ((tot.venta_estacion || 0) + (tot.venta_tienda || 0)))}</b>\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (estaciones.length > 0) {
        msg += `🏆 <b>Resumen por Gasolinera:</b>\n`;
        const sorted = [...estaciones].sort((a, b) => Number(b.galonaje || 0) - Number(a.galonaje || 0));
        sorted.forEach((e, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📍';
            const vTot = Number(e.venta_estacion || e.venta || 0);
            msg += `${medal} <b>${escapeHtml(e.empresa)}:</b>\n`;
            msg += `   • Galonaje: <code>${numFmt(e.galonaje || 0)} gal</code> | Venta: <b>${moneyFmt(vTot)}</b>\n`;
            msg += `   • 🛢️ ${numFmt(e.diesel || 0)} | 🟢 ${numFmt(e.regular || 0)} | 🔴 ${numFmt(e.super || 0)}${Number(e.ion || 0) > 0 ? ` | ⚡ ${numFmt(e.ion)}` : ''}\n`;
        });
    }

    if (tiendas.length > 0) {
        msg += `\n🛒 <b>Ventas en Tiendas:</b>\n`;
        tiendas.forEach((t) => {
            msg += `• <b>${escapeHtml(t.empresa)}:</b> ${moneyFmt(t.venta || 0)}\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Consulta por Rango</i>`;
    return msg;
};

/**
 * Formatear reporte de análisis de horas pico de venta
 */
const formatHorasPicoMessage = (peakData, targetPeriodLabel) => {
    let msg = `⏰ <b>ANÁLISIS DE HORAS PICO DE VENTA</b>\n`;
    msg += `📅 <b>Período:</b> ${escapeHtml(targetPeriodLabel || 'Consolidado')}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    msg += `🥇 <b>Hora Pico Principal:</b> <code>${peakData?.hora_pico || '17:00 - 18:00'}</code>\n`;
    msg += `💰 <b>Venta en Hora Pico:</b> <b>${moneyFmt(peakData?.venta_hora_pico || 0)}</b> (${Number(peakData?.pct_hora_pico || 0).toFixed(1)}% del día)\n`;
    msg += `🧾 <b>Transacciones en Pico:</b> <code>${Math.round(peakData?.transacciones_hora_pico || 0).toLocaleString('en-US')} tickets</code>\n`;
    msg += `📊 <b>Ticket Promedio:</b> ${moneyFmt(peakData?.ticket_promedio_pico || 0)}\n\n`;

    if (Array.isArray(peakData?.top_3_horas) && peakData.top_3_horas.length > 0) {
        msg += `🔥 <b>Top 3 Horas con Mayor Venta:</b>\n`;
        const medals = ['1️⃣', '2️⃣', '3️⃣'];
        peakData.top_3_horas.forEach((h, idx) => {
            msg += `${medals[idx]} <b>${h.franja}:</b> ${moneyFmt(h.total_venta)} (${Math.round(h.transacciones || 0).toLocaleString('en-US')} tickets • ${Number(h.porcentaje_total || 0).toFixed(1)}%)\n`;
        });
        msg += `\n`;
    }

    if (peakData?.distribucion_franjas) {
        msg += `🕒 <b>Distribución por Franjas Horarias:</b>\n`;
        const f = peakData.distribucion_franjas;
        if (f.manana) msg += `• ☀️ <b>Mañana (06:00 - 12:00):</b> ${moneyFmt(f.manana.total_venta)} (${Number(f.manana.porcentaje_total || 0).toFixed(1)}%)\n`;
        if (f.mediodia) msg += `• 🌤️ <b>Mediodía/Tarde (12:00 - 18:00):</b> ${moneyFmt(f.mediodia.total_venta)} (${Number(f.mediodia.porcentaje_total || 0).toFixed(1)}%)\n`;
        if (f.noche) msg += `• 🌙 <b>Noche (18:00 - 24:00):</b> ${moneyFmt(f.noche.total_venta)} (${Number(f.noche.porcentaje_total || 0).toFixed(1)}%)\n`;
        if (f.madrugada) msg += `• 🌅 <b>Madrugada (00:00 - 06:00):</b> ${moneyFmt(f.madrugada.total_venta)} (${Number(f.madrugada.porcentaje_total || 0).toFixed(1)}%)\n`;
    }

    msg += `\n💵 <b>Venta Total Acumulada:</b> <b>${moneyFmt(peakData?.total_venta || 0)}</b> (<code>${Math.round(peakData?.total_transacciones || 0).toLocaleString('en-US')} tickets</code>)\n`;
    msg += `<i>SIPE Admin • Análisis Horario de Flujo</i>`;
    return msg;
};

/**
 * Formatear reporte de energía solar y baterías
 */
const formatSolarEnergyMessage = (solarData, tipo = 'diario', periodoLabel = null) => {
    let msg = `☀️ <b>SISTEMA SOLAR FOTOVOLTAICO Y BATERÍAS</b>\n`;
    if (periodoLabel) {
        msg += `📅 <b>Período:</b> ${escapeHtml(periodoLabel)}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (tipo === 'estado_actual') {
        msg += `⚡ <b>Estado en Tiempo Real:</b>\n`;
        msg += `• ☀️ <b>Capacidad Solar Total:</b> <code>${solarData?.potencia_total_kwp || 80.0} kWp</code> (2 estaciones)\n`;
        msg += `• 🔋 <b>Capacidad BESS Total:</b> <code>${solarData?.capacidad_bateria_total_kwh || 60.0} kWh</code> (Miraflores)\n`;
        msg += `• 🔌 <b>Potencia Instantánea Estimada:</b> <code>${solarData?.potencia_actual_estimada_kw || 0.0} kW</code>\n`;
        msg += `• 🔋 <b>Estado de Carga Batería (SoC):</b> <b>${solarData?.bateria_promedio_soc_pct || 85.0}%</b>\n`;
        msg += `• ⏱️ <b>Autonomía Cargas Críticas:</b> <code>${solarData?.horas_autonomia_estimadas || 9.3} hrs</code>\n\n`;

        msg += `📍 <b>Ubicaciones con Instalación:</b>\n`;
        (solarData?.instalaciones || []).forEach(inst => {
            const hasBat = inst.tiene_baterias === 1;
            msg += `• <b>${escapeHtml(inst.estacion_nombre)}:</b>\n`;
            msg += `   Paneles: <code>${inst.potencia_kwp} kWp</code>`;
            if (hasBat) {
                msg += ` | Batería: <code>${inst.capacidad_bateria_kwh} kWh</code> (SoC: <b>${inst.bateria_soc_pct}%</b>)\n`;
                msg += `   Autonomía: <code>${inst.horas_autonomia} hrs</code> (${inst.bateria_estado})\n`;
            } else {
                msg += ` | Sistema On-Grid (sin batería)\n`;
            }
        });
    } else {
        const tituloAhorro = tipo === 'mensual' ? 'Ahorro Mensual Acumulado' : tipo === 'rango' ? 'Ahorro en Rango Acumulado' : 'Ahorro Diario';
        msg += `💰 <b>${tituloAhorro}:</b> <b>${moneyFmt(solarData?.total_ahorro_usd || 0)}</b>\n`;
        msg += `⚡ <b>Generación Solar:</b> <code>${numFmt(solarData?.total_generacion_kwh || 0)} kWh</code>\n`;
        msg += `🔄 <b>Autoconsumo Directo:</b> <code>${numFmt(solarData?.total_autoconsumo_kwh || 0)} kWh</code>\n`;
        if (Number(solarData?.total_bateria_descarga_kwh || 0) > 0) {
            msg += `🔋 <b>Aporte de Batería:</b> <code>${numFmt(solarData?.total_bateria_descarga_kwh || 0)} kWh</code>\n`;
        }
        msg += `🌱 <b>CO₂ Evitado:</b> <code>${numFmt(solarData?.total_co2_evitado_kg || 0)} kg</code>\n\n`;

        if (Array.isArray(solarData?.estaciones) && solarData.estaciones.length > 0) {
            msg += `📍 <b>Desglose por Ubicación:</b>\n`;
            solarData.estaciones.forEach(est => {
                const batDesc = est.bateria_descarga_kwh > 0 ? ` | 🔋 ${numFmt(est.bateria_descarga_kwh)} kWh` : (est.tiene_baterias ? ` | 🔋 SoC ${est.bateria_soc_pct}%` : '');
                msg += `• <b>${escapeHtml(est.estacion_nombre)}</b> (${est.potencia_kwp} kWp):\n`;
                msg += `   Ahorro: <b>${moneyFmt(est.ahorro_usd)}</b> | Gen: <code>${numFmt(est.generacion_kwh)} kWh</code>${batDesc}\n`;
            });
        }

        if (solarData?.bateria_miraflores_soc_pct !== undefined) {
            msg += `\n🔋 <b>Batería Miraflores (60 kWh):</b> SoC actual <b>${solarData.bateria_miraflores_soc_pct}%</b> (<code>${solarData.horas_autonomia_miraflores || 9.3} hrs</code> autonomía cargas críticas)\n`;
        }
    }

    msg += `\n<i>SIPE Admin • Eficiencia Energética & Sostenibilidad</i>`;
    return msg;
};

/**
 * Mensaje de orientación cuando la consulta libre no coincide con una entidad conocida
 */
const formatIntelligentGuidanceMessage = () => {
    let msg = `❓ No pude identificar con certeza tu consulta específica.\n\n`;
    msg += `💡 <b>Preguntas que puedes hacerme directamente:</b>\n`;
    msg += `• ⛽ <b>Por estación y producto:</b>\n`;
    msg += `   <i>"¿Cuánto diesel vendió Costa del Sol?"</i>\n`;
    msg += `   <i>"Ventas de Miraflores"</i>\n`;
    msg += `   <i>"¿Cuánto vendió San Martín ayer?"</i>\n`;
    msg += `• 🛢️ <b>Por combustible global:</b>\n`;
    msg += `   <i>"¿Cuánto diesel se vendió en total ayer?"</i>\n`;
    msg += `   <i>"Venta total de regular"</i>\n`;
    msg += `• 🏆 <b>Rankings y comparativas:</b>\n`;
    msg += `   <i>"¿Cuál estación vendió más ayer?"</i>\n`;
    msg += `• 🛒 <b>Tiendas de conveniencia:</b>\n`;
    msg += `   <i>"¿Cuánto vendieron las tiendas?"</i>\n`;
    msg += `   <i>"Ventas de E-Market"</i>\n`;
    msg += `• 🏦 <b>Bancos específicos:</b>\n`;
    msg += `   <i>"¿Cuánto tenemos en Promerica?"</i>\n`;
    msg += `   <i>"Saldo de Banco Agrícola"</i>\n`;
    msg += `• 🚨 <b>Auditoría:</b>\n`;
    msg += `   <i>"¿Hubo algún descuadre ayer?"</i>\n\n`;
    msg += `<i>O pulsa los botones del menú inferior para consultar los resúmenes consolidados.</i>`;
    return msg;
};

/**
 * Consulta con Gemini API (GenAI) si está configurado en el servidor
 */
const askGeminiAssistant = async (prompt, dataContext) => {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const systemInstruction = `Eres el asistente gerencial de SIPE Admin para estaciones de servicio de combustible en El Salvador.
Responde de forma ejecutiva, concisa, cálida y directa en español salvadoreño formal.
Usa viñetas limpias y negritas en HTML para Telegram (<b>texto</b>, <code>código</code>).
Si te preguntan comparaciones o análisis, apóyate en el contexto de datos reales proporcionado.`;

        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{
                role: 'user',
                parts: [{ text: `CONTEXTO OPERATIVO REAL: ${JSON.stringify(dataContext)}\n\nPREGUNTA DEL USUARIO: ${prompt}` }]
            }],
            config: { systemInstruction }
        });

        const reply = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;
        return reply ? reply.trim() : null;
    } catch (e) {
        console.warn('[TelegramBot] Gemini fallback error:', e.message);
        return null;
    }
};

/**
 * Despachador inteligente de lenguaje natural
 */
const handleSmartNaturalLanguageQuery = async (user, rawText, chatId, effectivePerms, keyboard) => {
    const parsed = parseNaturalLanguageQuery(rawText);
    if (!parsed) return false;

    // 0.1 Consulta de Energía Solar y Baterías (Paneles, Ahorro, Estado de Batería, Autonomía)
    if (parsed.isSolar) {
        if (!effectivePerms.ventas && !effectivePerms.alertas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar datos de energía solar.', keyboard);
            return true;
        }

        const norm = parsed.normalized;
        const wantsRealtime = /\b(estado|actual|tiempo real|ahorita|bateria|baterias|soc|autonomia|carga)\b/i.test(norm) &&
                              !/\b(ahorro|mes|mensual|ayer|dia|rango|total)\b/i.test(norm);

        if (wantsRealtime) {
            await sendTelegramMessage(chatId, `⏳ Consultando estado en tiempo real de paneles y batería...`);
            try {
                const solarData = await solarEnergyService.getSolarEstadoActual();
                const msg = formatSolarEnergyMessage(solarData, 'estado_actual');
                await logTelegramQuery(user.telegram_user_id, rawText, 'Solar Estado Actual', 1);
                await sendTelegramMessage(chatId, msg, keyboard);
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en consulta solar estado actual:', err);
                await sendTelegramMessage(chatId, '❌ Error al consultar estado de energía solar: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isMonthly) {
            const y = parsed.targetYear || 2026;
            const m = parsed.targetMonth || 10;
            const monthLabel = `${SPANISH_MONTH_NAMES[m]} ${y}`;
            await sendTelegramMessage(chatId, `⏳ Calculando ahorro solar acumulado de ${monthLabel}...`);
            try {
                const solarData = await solarEnergyService.getSolarAhorroMensual(y, m);
                const msg = formatSolarEnergyMessage(solarData, 'mensual', monthLabel);
                await logTelegramQuery(user.telegram_user_id, rawText, `Solar Mensual ${y}-${m}`, 1);
                await sendTelegramMessage(chatId, msg, keyboard);
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en consulta solar mensual:', err);
                await sendTelegramMessage(chatId, '❌ Error al calcular ahorro solar mensual: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isRange) {
            const rangeLabel = `Del ${toDisplayDate(parsed.startDate)} al ${toDisplayDate(parsed.endDate)}`;
            await sendTelegramMessage(chatId, `⏳ Calculando ahorro solar ${rangeLabel}...`);
            try {
                const solarData = await solarEnergyService.getSolarAhorroRango(parsed.startDate, parsed.endDate);
                const msg = formatSolarEnergyMessage(solarData, 'rango', rangeLabel);
                await logTelegramQuery(user.telegram_user_id, rawText, `Solar Rango ${parsed.startDate} a ${parsed.endDate}`, 1);
                await sendTelegramMessage(chatId, msg, keyboard);
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en consulta solar rango:', err);
                await sendTelegramMessage(chatId, '❌ Error al calcular ahorro solar por rango: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        // Por defecto: Ahorro Diario (de la fecha indicada o ayer)
        const targetDate = parsed.targetDate;
        await sendTelegramMessage(chatId, `⏳ Consultando ahorro de paneles solares del ${toDisplayDate(targetDate)}...`);
        try {
            const solarData = await solarEnergyService.getSolarAhorroDiario(targetDate);
            const msg = formatSolarEnergyMessage(solarData, 'diario', toDisplayDate(targetDate));
            await logTelegramQuery(user.telegram_user_id, rawText, `Solar Diario ${targetDate}`, 1);
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta solar diaria:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar ahorro solar: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.2 Consulta de Horas Pico de Venta / Horarios de Mayor Flujo
    if (parsed.isHourlyPeak) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar análisis de ventas por hora.', keyboard);
            return true;
        }

        const branchId = parsed.matchedStation ? (parsed.matchedStation.saas_branch_id || parsed.matchedStation.branch_id || null) : null;
        const stationSuffix = parsed.matchedStation ? ` en ${parsed.matchedStation.name}` : ' en la red';

        if (parsed.isRange) {
            const rangeLabel = `Del ${toDisplayDate(parsed.startDate)} al ${toDisplayDate(parsed.endDate)}${stationSuffix}`;
            await sendTelegramMessage(chatId, `⏳ Analizando horas pico ${rangeLabel}...`);
            try {
                const peakData = await salesHourlyService.getHorasPicoRango(parsed.startDate, parsed.endDate, branchId);
                const msg = formatHorasPicoMessage(peakData, rangeLabel, true);
                await logTelegramQuery(user.telegram_user_id, rawText, `Horas Pico Rango ${parsed.startDate} a ${parsed.endDate}`, 1);
                await sendTelegramMessage(chatId, msg, keyboard);
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en horas pico rango:', err);
                await sendTelegramMessage(chatId, '❌ Error al analizar horas pico: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isMonthly) {
            const y = parsed.targetYear || 2026;
            const m = parsed.targetMonth || 10;
            const monthLabel = `${SPANISH_MONTH_NAMES[m]} ${y}${stationSuffix}`;
            await sendTelegramMessage(chatId, `⏳ Analizando horas pico del mes de ${monthLabel}...`);
            try {
                const peakData = await salesHourlyService.getHorasPicoRango(parsed.startDate, parsed.endDate, branchId);
                const msg = formatHorasPicoMessage(peakData, monthLabel, true);
                await logTelegramQuery(user.telegram_user_id, rawText, `Horas Pico Mes ${y}-${m}`, 1);
                await sendTelegramMessage(chatId, msg, keyboard);
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en horas pico mensual:', err);
                await sendTelegramMessage(chatId, '❌ Error al analizar horas pico mensuales: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        // Por defecto: Horas pico del día objetivo (ayer o fecha específica)
        const targetDate = parsed.targetDate;
        const dateLabel = `${toDisplayDate(targetDate)}${stationSuffix}`;
        await sendTelegramMessage(chatId, `⏳ Analizando momentos de mayor venta del ${dateLabel}...`);
        try {
            const peakData = await salesHourlyService.getHorasPicoVentas(targetDate, branchId);
            const msg = formatHorasPicoMessage(peakData, dateLabel, false);
            await logTelegramQuery(user.telegram_user_id, rawText, `Horas Pico ${targetDate}`, 1);
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en horas pico diario:', err);
            await sendTelegramMessage(chatId, '❌ Error al analizar horas pico: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.3 Consulta de Ventas Mensuales Consolidadas (ej. 'resumen de ventas por gasolinera mes de octubre')
    if (parsed.isMonthly) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas consolidadas.', keyboard);
            return true;
        }

        const y = parsed.targetYear || 2026;
        const m = parsed.targetMonth || 10;
        const monthLabel = `${SPANISH_MONTH_NAMES[m]} ${y}`;
        await sendTelegramMessage(chatId, `⏳ Generando resumen mensual consolidado de ${monthLabel}...`);
        try {
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const { getResumenMensualData } = require('../routes/consultas');
            const data = await getResumenMensualData(externalDb, y, m, accountingDb);
            const msg = formatVentasMensualMessage(data, y, m);
            await logTelegramQuery(user.telegram_user_id, rawText, `Ventas Mensual ${y}-${m}`, 1);
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ventas mensual:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar el resumen mensual: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.4 Consulta de Ventas por Rango de Fechas (ej. 'ventas del 1 al 10 de octubre')
    if (parsed.isRange) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas por rango.', keyboard);
            return true;
        }

        const rangeLabel = `Del ${toDisplayDate(parsed.startDate)} al ${toDisplayDate(parsed.endDate)}`;
        await sendTelegramMessage(chatId, `⏳ Consultando ventas en rango ${rangeLabel}...`);
        try {
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const { getResumenRangoVentasData } = require('../routes/consultas');
            const data = await getResumenRangoVentasData(externalDb, parsed.startDate, parsed.endDate, accountingDb);
            const msg = formatVentasRangoMessage(data, parsed.startDate, parsed.endDate, rangeLabel);
            await logTelegramQuery(user.telegram_user_id, rawText, `Ventas Rango ${parsed.startDate} a ${parsed.endDate}`, 1);
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ventas por rango:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar el rango de fechas: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 1. Consulta de Rankings / Comparativas (PRIORIDAD ALTA: evaluada ANTES de combustibles globales)
    if (parsed.isRanking) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar rankings de ventas.', keyboard);
            return true;
        }

        await sendTelegramMessage(chatId, `⏳ Calculando ranking de estaciones...`);
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const metric = parsed.normalized.includes('galon') || parsed.normalized.includes('galones') ? 'galonaje' : 'venta';
            const msg = formatRankingMessage(data, parsed.targetDate, metric, parsed.matchedFuel);
            await logTelegramQuery(user.telegram_user_id, rawText, `Ranking ${metric}${parsed.matchedFuel ? ` (${parsed.matchedFuel.key})` : ''}`, 1);
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ranking:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al generar ranking: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 2. Consulta de Estación Específica (con o sin combustible)
    if (parsed.matchedStation) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de estaciones.', keyboard);
            return true;
        }

        await sendTelegramMessage(chatId, `⏳ Consultando datos de ${parsed.matchedStation.name}...`);
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const estaciones = data?.estaciones || [];
            const st = estaciones.find(e => 
                e.id_empresa === parsed.matchedStation.id || 
                normalizeText(e.empresa).includes(normalizeText(parsed.matchedStation.name)) ||
                parsed.matchedStation.keywords.some(kw => normalizeText(e.empresa).includes(normalizeText(kw)))
            );

            if (!st) {
                await sendTelegramMessage(chatId, `⚠️ No se encontraron registros de ventas para ${parsed.matchedStation.name} en la fecha ${toDisplayDate(parsed.targetDate)}.`, keyboard);
                return true;
            }

            const tiendas = data?.tiendas || [];
            const tienda = tiendas.find(t => normalizeText(t.empresa).includes(parsed.matchedStation.tiendaKey));

            const msg = formatSpecificStationMessage(st, parsed.matchedFuel, parsed.targetDate, tienda);
            await logTelegramQuery(user.telegram_user_id, rawText, `Estación: ${st.empresa}`, 1);
            try {
                const { learnAlias } = require('./conversationalAiService');
                learnAlias('station', parsed.matchedStation.id, rawText).catch(() => {});
            } catch (aliasErr) {
                // Aprendizaje opcional
            }
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de estación específica:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al procesar la consulta: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 3. Consulta de Combustible Global (sin estación específica)
    if (parsed.matchedFuel && !parsed.matchedStation) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de combustible.', keyboard);
            return true;
        }

        await sendTelegramMessage(chatId, `⏳ Calculando total de ${parsed.matchedFuel.label}...`);
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const msg = formatProductTotalMessage(data, parsed.matchedFuel, parsed.targetDate);
            await logTelegramQuery(user.telegram_user_id, rawText, `Total: ${parsed.matchedFuel.label}`, 1);
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de combustible global:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al calcular el total: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 4. Consulta de Banco Específico
    if (parsed.matchedBank) {
        if (!effectivePerms.saldos_banco) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar saldos bancarios.', keyboard);
            return true;
        }

        await sendTelegramMessage(chatId, `⏳ Consultando cuentas de ${parsed.matchedBank.label}...`);
        try {
            const data = await getSaldosBancosData();
            const msg = formatSpecificBankMessage(data, parsed.matchedBank);
            await logTelegramQuery(user.telegram_user_id, rawText, `Banco: ${parsed.matchedBank.label}`, 1);
            try {
                const { learnAlias } = require('./conversationalAiService');
                learnAlias('bank', parsed.matchedBank.key, rawText).catch(() => {});
            } catch (aliasErr) {
                // Aprendizaje opcional
            }
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de banco específico:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar el banco: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 5. Consulta de Tiendas
    if (parsed.isTiendas) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de tiendas.', keyboard);
            return true;
        }

        await sendTelegramMessage(chatId, `⏳ Consultando cortes de tiendas...`);
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const msg = formatTiendasMessage(data, parsed.targetDate);
            await logTelegramQuery(user.telegram_user_id, rawText, 'Tiendas cortes', 1);
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de tiendas:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar tiendas: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 6. Consulta de Alertas / Auditoría
    if (parsed.isAlertas) {
        if (!effectivePerms.alertas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar alertas operativas.', keyboard);
            return true;
        }

        await sendTelegramMessage(chatId, `⏳ Analizando auditoría y descuadres del ${toDisplayDate(parsed.targetDate)}...`);
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const msg = formatAlertasMessage(data, parsed.targetDate);
            await logTelegramQuery(user.telegram_user_id, rawText, 'Alertas auditoría', 1);
            await sendTelegramMessage(chatId, msg, keyboard);
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de alertas:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar alertas: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 7. Si Gemini API está activo, intentar respuesta generativa
    if (process.env.GEMINI_API_KEY) {
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const aiReply = await askGeminiAssistant(rawText, {
                fecha: parsed.targetDate,
                resumen: {
                    total_galones: (data.estaciones || []).reduce((s, e) => s + Number(e.galonaje || 0), 0),
                    total_venta: (data.estaciones || []).reduce((s, e) => s + Number(e.venta || 0), 0)
                },
                estaciones: data.estaciones,
                tiendas: data.tiendas
            });

            if (aiReply) {
                await logTelegramQuery(user.telegram_user_id, rawText, 'Respuesta Gemini AI', 1);
                await sendTelegramMessage(chatId, aiReply, keyboard);
                return true;
            }
        } catch (_) {
            // Continuar con sugerencias
        }
    }

    return false;
};

/**
 * Mensaje de Ayuda
 */
const formatHelpMessage = () => {
    let msg = `🤖 <b>ASISTENTE DE CONSULTAS SIPE ADMIN</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Puedes usar los botones del teclado o enviar los siguientes comandos:\n\n`;
    msg += `⛽ <b>/ventas</b> - Ventas de ayer (o escribe <i>/ventas YYYY-MM-DD</i> para otra fecha)\n`;
    msg += `⛽ <b>Ventas de Hoy</b> - Consultar ventas del día actual\n`;
    msg += `⛽ <b>Ventas de Ayer</b> - Consultar ventas cerradas de ayer\n`;
    msg += `🏦 <b>/bancos</b> - Saldos consolidados en cuentas de bancos\n`;
    msg += `🧾 <b>/chequera</b> - Saldos disponibles en cuentas de cheques\n`;
    msg += `🚨 <b>/alertas</b> - Descuadres de pista, cortes y gastos de tiendas\n`;
    msg += `ℹ️ <b>/perfil</b> o <b>/id</b> - Ver tu ID y permisos asignados\n`;
    msg += `❓ <b>/ayuda</b> - Ver esta guía de comandos\n\n`;
    msg += `💡 <b>¡También puedes hacerme preguntas específicas en texto libre!</b>\n`;
    msg += `• <i>"¿Cuánto diesel vendió Costa del Sol?"</i>\n`;
    msg += `• <i>"Ventas de Miraflores"</i>\n`;
    msg += `• <i>"¿Cuál estación vendió más ayer?"</i>\n`;
    msg += `• <i>"¿Cuánto tenemos en Promerica?"</i>\n`;
    msg += `• <i>"¿Cuánto vendieron las tiendas?"</i>\n`;
    msg += `• <i>"¿Hubo algún descuadre ayer?"</i>\n\n`;
    msg += `<i>Acceso restringido a usuarios autorizados por el Administrador.</i>`;
    return msg;
};

/**
 * Procesar un mensaje entrante de Telegram
 */
const handleIncomingMessage = async (msg) => {
    if (!msg || !msg.chat || !msg.from) return;

    const chatId = msg.chat.id;
    const rawText = (msg.text || '').trim();
    if (!rawText) return;

    // 1. Resolver usuario en la base de datos
    const user = await resolveTelegramUser(msg.from);
    if (!user) {
        await sendTelegramMessage(chatId, '⚠️ Error interno del sistema al identificar usuario.');
        return;
    }

    // 2. Verificar si está autorizado (activo = 1)
    if (!user.activo) {
        await logTelegramQuery(user.telegram_user_id, rawText, 'Acceso denegado (usuario inactivo)', 0);
        const name = escapeHtml(user.first_name || 'Usuario');
        const notAuthMsg = `⛔ <b>Acceso no autorizado</b>\n\n` +
            `Hola <b>${name}</b>.\n` +
            `Tu ID de Telegram es: <code>${escapeHtml(user.telegram_user_id)}</code>.\n\n` +
            `Tu cuenta aún no tiene permisos para realizar consultas en <b>SIPE Admin</b>.\n` +
            `Se ha registrado tu solicitud para que un administrador del sistema habilite tu acceso desde el panel web (<i>Seguridad &gt; Usuarios de Telegram</i>).`;
        await sendTelegramMessage(chatId, notAuthMsg);
        return;
    }

    // 2.1 Resolver permisos efectivos (heredados de SIPE o manuales)
    const effectivePerms = await getUserEffectivePermissions(user);

    // Si está vinculado pero su cuenta en SIPE Admin está inactiva
    if (effectivePerms.inactiveInSipe) {
        await logTelegramQuery(user.telegram_user_id, rawText, 'Acceso suspendido (usuario SIPE inactivo)', 0);
        const name = escapeHtml(user.first_name || 'Usuario');
        const inactiveMsg = `⛔ <b>Acceso Suspendido</b>\n\n` +
            `Hola <b>${name}</b>.\n` +
            `Tu cuenta de Telegram está vinculada al usuario de SIPE Admin <b>${escapeHtml(effectivePerms.linkedUser?.nombre || '')}</b>, el cual se encuentra actualmente <b>inactivo</b> en el sistema.\n` +
            `Por favor contacta a un Administrador para reactivar tu cuenta.`;
        await sendTelegramMessage(chatId, inactiveMsg);
        return;
    }

    const keyboard = getMainReplyKeyboard();
    const cleanLower = rawText.toLowerCase().replace(/^[/\s]+/, '');

    // Comandos de Saludo / Inicio
    if (cleanLower === 'start' || cleanLower === 'menu' || cleanLower === 'hola' || cleanLower === 'inicio') {
        await logTelegramQuery(user.telegram_user_id, '/start', 'Menú principal', 1);
        const name = escapeHtml(user.first_name || 'Usuario');
        const welcome = `👋 ¡Hola <b>${name}</b>!\n` +
            `Bienvenido al asistente de consultas gerenciales de <b>SIPE Admin</b>.\n\n` +
            `Usa los botones inferiores para consultar información en tiempo real:`;
        await sendTelegramMessage(chatId, welcome, keyboard);
        return;
    }

    // Comandos de Perfil / ID
    if (cleanLower === 'perfil' || cleanLower === 'id' || cleanLower === 'mi_id' || cleanLower.includes('mi perfil')) {
        await logTelegramQuery(user.telegram_user_id, '/perfil', 'Consulta de perfil', 1);
        await sendTelegramMessage(chatId, formatProfileMessage(user, effectivePerms), keyboard);
        return;
    }

    // Comandos de Ayuda
    if (cleanLower === 'ayuda' || cleanLower === 'help') {
        await logTelegramQuery(user.telegram_user_id, '/ayuda', 'Consulta de ayuda', 1);
        await sendTelegramMessage(chatId, formatHelpMessage(), keyboard);
        return;
    }

    // 1. Intentar resolver consultas estructuradas de lenguaje natural (Ventas mensuales/rango, Horas pico, Solar/baterías, Estaciones, Combustibles, Bancos, Rankings, Tiendas, Auditoría)
    const handledNlu = await handleSmartNaturalLanguageQuery(user, rawText, chatId, effectivePerms, keyboard);
    if (handledNlu) return;

    // 2. Si no es una consulta estructurada directa, atender mediante el Agente Conversacional IA (con memoria contextual y datos en vivo de SIPE)
    try {
        const { askConversationalAgent } = require('./conversationalAiService');
        const aiResponse = await askConversationalAgent({ user, prompt: rawText, chatId, effectivePerms });
        if (aiResponse) {
            await logTelegramQuery(user.telegram_user_id, rawText, 'Conversación Asistente IA', 1);
            await sendTelegramMessage(chatId, aiResponse, keyboard);
            return;
        }
    } catch (aiErr) {
        console.warn('[TelegramBot] Agente conversacional no disponible:', aiErr.message);
    }

    // 3. CONSULTA: SALDO EN BANCO
    if (cleanLower.includes('saldo en banco') || cleanLower === 'bancos' || cleanLower === 'banco' || cleanLower === 'saldos') {
        if (!effectivePerms.saldos_banco) {
            await logTelegramQuery(user.telegram_user_id, 'bancos', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar saldos en bancos.', keyboard);
            return;
        }

        await sendTelegramMessage(chatId, '⏳ Consultando saldos consolidados en bancos...');
        try {
            const data = await getSaldosBancosData();
            await logTelegramQuery(user.telegram_user_id, 'bancos', `Total: ${data.total}`, 1);
            await sendTelegramMessage(chatId, formatBancosMessage(data), keyboard);
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de bancos:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar saldos bancarios: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 4. CONSULTA: SALDO EN CHEQUERA
    if (cleanLower.includes('saldo en chequera') || cleanLower === 'chequera' || cleanLower === 'cheques' || cleanLower === 'saldo_chequera') {
        if (!effectivePerms.saldos_chequera) {
            await logTelegramQuery(user.telegram_user_id, 'chequera', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar saldos en chequera.', keyboard);
            return;
        }

        await sendTelegramMessage(chatId, '⏳ Consultando saldos en chequeras...');
        try {
            const data = await getSaldosChequeraData();
            await logTelegramQuery(user.telegram_user_id, 'chequera', `Total: ${data.total}`, 1);
            await sendTelegramMessage(chatId, formatChequeraMessage(data), keyboard);
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de chequera:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar saldos en chequeras: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 5. CONSULTA: ALERTAS EN ESTACIONES
    if (cleanLower.includes('alertas') || cleanLower.includes('descuadres') || cleanLower.includes('auditoria')) {
        if (!effectivePerms.alertas) {
            await logTelegramQuery(user.telegram_user_id, 'alertas', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar alertas operativas.', keyboard);
            return;
        }

        // Determinar fecha (por defecto ayer, o la indicada)
        const targetDate = parseSpanishDateText(rawText) || getDateStr(-1);

        await sendTelegramMessage(chatId, `⏳ Analizando auditoría y descuadres del ${toDisplayDate(targetDate)}...`);
        try {
            const data = await getConsolidadoVentas(targetDate);
            await logTelegramQuery(user.telegram_user_id, 'alertas', `Fecha: ${targetDate}`, 1);
            await sendTelegramMessage(chatId, formatAlertasMessage(data, targetDate), keyboard);
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de alertas:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar alertas operativas: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 6. CONSULTA: VENTAS DE ESTACIONES
    if (cleanLower.includes('ventas') || cleanLower.includes('venta') || cleanLower.includes('combustible')) {
        if (!effectivePerms.ventas) {
            await logTelegramQuery(user.telegram_user_id, 'ventas', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de estaciones.', keyboard);
            return;
        }

        const targetDate = parseSpanishDateText(rawText) || getDateStr(-1); // Ventas cerradas de ayer por defecto

        await sendTelegramMessage(chatId, `⏳ Consultando consolidado de ventas del ${toDisplayDate(targetDate)}...`);
        try {
            const data = await getConsolidadoVentas(targetDate);
            await logTelegramQuery(user.telegram_user_id, 'ventas', `Fecha: ${targetDate}`, 1);
            await sendTelegramMessage(chatId, formatVentasMessage(data, targetDate), keyboard);
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ventas:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar las ventas: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // Mensaje no reconocido - enviar orientación inteligente
    await logTelegramQuery(user.telegram_user_id, rawText, 'Comando no reconocido', 1);
    await sendTelegramMessage(
        chatId,
        formatIntelligentGuidanceMessage(),
        keyboard
    );
};

/**
 * Ciclo principal de Long Polling para Telegram Bot
 */
const runPollingLoop = async () => {
    while (isPollingActive) {
        try {
            const { token, isActive } = await getBotToken();
            if (!isActive || !token) {
                console.log('[TelegramBot] Bot en pausa o sin token. Esperando 10 segundos...');
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }

            lastPollAt = new Date();

            // Actualizar timestamp en base de datos cada cierto tiempo
            try {
                const db = getDb();
                if (db) {
                    await db.query('UPDATE telegram_config SET last_poll_at = NOW() WHERE id = 1');
                }
            } catch (_) {
                // Silenciosamente ignorar fallo de actualización de timestamp en polling
            }

            const res = await axios.get(`${TELEGRAM_API_BASE}${token}/getUpdates`, {
                params: {
                    offset: currentOffset,
                    timeout: 20
                },
                timeout: 30000
            });

            if (res.data?.ok && Array.isArray(res.data.result)) {
                const updates = res.data.result;
                for (const update of updates) {
                    currentOffset = update.update_id + 1;
                    if (update.message) {
                        // Procesar de manera asíncrona sin bloquear la recepción
                        handleIncomingMessage(update.message).catch(err => {
                            console.error('[TelegramBot] Error procesando mensaje:', err.message);
                        });
                    }
                }
            }
        } catch (err) {
            // Manejar errores típicos de polling
            if (err.response?.status === 409) {
                console.warn('[TelegramBot] 409 Conflict: Otra instancia está realizando polling. Reintentando en 6s...');
                await new Promise(r => setTimeout(r, 6000));
            } else if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
                // Timeout de conexión normal de long polling, continuar
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.warn('[TelegramBot] Error en ciclo de polling:', err.message);
                await new Promise(r => setTimeout(r, 4000));
            }
        }
    }
    console.log('[TelegramBot] Long Polling detenido.');
};

/**
 * Iniciar el servicio de Telegram Bot
 */
const initTelegramBot = async () => {
    if (isPollingActive) {
        console.log('[TelegramBot] Polling ya se encuentra activo.');
        return;
    }

    try {
        const { token, isActive } = await getBotToken();
        if (!isActive) {
            console.log('[TelegramBot] Bot configurado como inactivo en base de datos.');
            return;
        }

        // Testear bot con getMe
        try {
            botInfo = await testTelegramConnection(token);
            console.log(`[TelegramBot] Conectado exitosamente: @${botInfo.username} (${botInfo.first_name})`);

            const db = getDb();
            if (db) {
                await db.query(
                    'UPDATE telegram_config SET bot_username = ?, bot_first_name = ?, last_poll_at = NOW() WHERE id = 1',
                    [botInfo.username || 'SIPE_IA_BOT', botInfo.first_name || 'SIPE_BOT']
                );
            }
        } catch (connErr) {
            console.warn('[TelegramBot] Advertencia: no se pudo verificar getMe de inmediato:', connErr.message);
        }

        isPollingActive = true;
        runPollingLoop().catch(e => console.error('[TelegramBot] Fallo crítico en polling loop:', e));
    } catch (e) {
        console.error('[TelegramBot] Error al inicializar bot:', e.message);
    }
};

/**
 * Detener el servicio de polling
 */
const stopTelegramBot = () => {
    isPollingActive = false;
};

/**
 * Reiniciar el servicio
 */
const restartTelegramBot = async () => {
    stopTelegramBot();
    await new Promise(r => setTimeout(r, 1000));
    await initTelegramBot();
};

/**
 * Obtener estado para la API web
 */
const getBotStatus = async () => {
    const { token, isActive } = await getBotToken();
    let isConnected = false;
    let details = botInfo;

    try {
        if (token) {
            details = await testTelegramConnection(token);
            isConnected = true;
        }
    } catch (e) {
        isConnected = false;
    }

    return {
        isConnected,
        isPolling: isPollingActive,
        isActive,
        lastPollAt,
        bot: details || {
            id: 8852249993,
            username: 'SIPE_IA_BOT',
            first_name: 'SIPE_BOT'
        }
    };
};

/**
 * Formatear mensaje de Alerta Gerencial Urgente de Discrepancias
 */
const formatDiscrepancyAlertMessage = ({ effectiveDate, pistaDiscrepancies = [], tiendaDiscrepancies = [], mermasAnomalas = [] }) => {
    let msg = `🚨 <b>ALERTA GERENCIAL DE DISCREPANCIAS</b>\n`;
    msg += `📅 <b>Fecha Auditada:</b> ${toDisplayDate(effectiveDate)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const totalDescuadres = pistaDiscrepancies.length + tiendaDiscrepancies.length + mermasAnomalas.length;
    msg += `⚠️ <b>Se detectaron ${totalDescuadres} discrepancia(s) que superan los umbrales de control:</b>\n\n`;

    // 1. Descuadres en Pista (diferencia > $10)
    if (pistaDiscrepancies.length > 0) {
        msg += `⛽ <b>Descuadres en Pista (&gt;$10.00):</b>\n`;
        pistaDiscrepancies.forEach(p => {
            const dif = Number(p.diferencia !== undefined ? p.diferencia : (p.dif || 0));
            const icon = dif < 0 ? '🔴 Faltante' : '🟡 Sobrante';
            const estName = escapeHtml(p.estacion || p.empresa || p.titulo || 'Estación');
            msg += `• ⚠️ <b>${estName}</b>\n`;
            msg += `   └ ${icon}: <code>${moneyFmt(dif)}</code>`;
            if (p.total_venta || p.venta) {
                msg += ` | Venta: ${moneyFmt(p.total_venta || p.venta)}`;
            }
            msg += `\n`;
        });
        msg += `\n`;
    }

    // 2. Descuadres en Cortes de Tienda (diferencia > $5)
    if (tiendaDiscrepancies.length > 0) {
        msg += `🛒 <b>Descuadres en Cortes de Tienda (&gt;$5.00):</b>\n`;
        tiendaDiscrepancies.forEach(t => {
            const dif = Number(t.dif !== undefined ? t.dif : (t.diferencia || 0));
            const icon = dif < 0 ? '🔴 Faltante' : '🟡 Sobrante';
            const tiendaName = escapeHtml(t.empresa || t.tienda_nombre || t.titulo || 'Tienda');
            msg += `• ⚠️ <b>${tiendaName}</b>\n`;
            msg += `   └ ${icon}: <code>${moneyFmt(dif)}</code>`;
            if (t.venta) {
                msg += ` | Venta: ${moneyFmt(t.venta)}`;
            }
            if (t.gastos && Number(t.gastos) > 0) {
                msg += ` | Gastos: ${moneyFmt(t.gastos)}`;
            }
            msg += `\n`;
        });
        msg += `\n`;
    }

    // 3. Mermas Anómalas / Variaciones
    if (mermasAnomalas.length > 0) {
        msg += `⚠️ <b>Mermas Anómalas / Variaciones de Galonaje:</b>\n`;
        mermasAnomalas.forEach(m => {
            const estName = escapeHtml(m.estacion || m.empresa || m.titulo || 'Estación');
            const prod = escapeHtml(m.nombre_combustible || m.producto || m.tipo_combustible || 'Combustible');
            msg += `• ⚠️ <b>${estName} - ${prod}</b>\n`;
            const difGal = m.diferencia_galones !== undefined ? `${numFmt(m.diferencia_galones)} gal` : '';
            const pct = m.porcentaje_variacion !== undefined ? `(${numFmt(m.porcentaje_variacion)}%)` : '';
            const imp = m.impacto_usd ? ` | Impacto: <code>${moneyFmt(m.impacto_usd)}</code>` : '';
            msg += `   └ Variación: ${difGal} ${pct}${imp}\n`;
        });
        msg += `\n`;
    }

    msg += `🚨 <i>Notificación automática gerencial emitida por SIPE Admin.</i>\n`;
    msg += `<i>Por favor verificar cierres y cuadres de caja correspondientes.</i>`;
    return msg;
};

/**
 * Difusión Proactiva de Alertas de Discrepancias
 * Analiza consolidado de ventas, filtra descuadres >$10 en pista, >$5 en tiendas o mermas anómalas
 * y lo envía vía Telegram a todos los directores autorizados (activo = 1 y permiso_alertas = 1).
 */
const broadcastDiscrepancyAlerts = async (targetDate = null, customDataOrOptions = null) => {
    const effectiveDate = targetDate ? (parseUserDate(targetDate) || targetDate) : getDateStr(-1);

    let data = null;
    let customUsers = null;

    if (customDataOrOptions) {
        if (customDataOrOptions.resumen_cierre || customDataOrOptions.cortes_tienda || customDataOrOptions.estaciones) {
            data = customDataOrOptions;
        } else if (customDataOrOptions.data) {
            data = customDataOrOptions.data;
            customUsers = customDataOrOptions.users || customDataOrOptions.recipients;
        } else if (Array.isArray(customDataOrOptions)) {
            customUsers = customDataOrOptions;
        }
    }

    if (!data) {
        data = await getConsolidadoVentas(effectiveDate);
    }

    // 1. Filtrar descuadres en pista (diferencia > $10)
    const pistaDiscrepancies = (data?.resumen_cierre || []).filter(r => {
        const dif = Math.abs(Number(r.diferencia !== undefined ? r.diferencia : (r.dif || 0)));
        return dif > 10;
    });

    // 2. Filtrar descuadres en cortes de tienda (diferencia > $5)
    const tiendaDiscrepancies = (data?.cortes_tienda || []).filter(t => {
        const dif = Math.abs(Number(t.dif !== undefined ? t.dif : (t.diferencia || 0)));
        return dif > 5;
    });

    // 3. Filtrar mermas anómalas
    let mermasAnomalas = [];
    if (Array.isArray(data?.mermas)) {
        mermasAnomalas = data.mermas.filter(m => 
            m.estado === 'critico' || 
            Math.abs(Number(m.porcentaje_variacion || 0)) > 0.50 || 
            Math.abs(Number(m.diferencia_galones || 0)) > 50 ||
            Math.abs(Number(m.impacto_usd || 0)) > 50
        );
    } else {
        try {
            const { getAuditoriaMermas } = require('./fuelIntelligence');
            if (typeof getAuditoriaMermas === 'function') {
                const mData = await getAuditoriaMermas(effectiveDate, effectiveDate);
                if (mData && Array.isArray(mData.auditorias)) {
                    mermasAnomalas = mData.auditorias.filter(m => 
                        m.estado === 'critico' || 
                        Math.abs(Number(m.porcentaje_variacion || 0)) > 0.50 || 
                        Math.abs(Number(m.diferencia_galones || 0)) > 50 ||
                        Math.abs(Number(m.impacto_usd || 0)) > 50
                    );
                }
            }
        } catch (_) {
            // Silencioso en caso de entorno sin BD de combustibles
        }
    }

    const totalDiscrepancies = pistaDiscrepancies.length + tiendaDiscrepancies.length + mermasAnomalas.length;

    // Si no existen discrepancias, no emitir alertas a usuarios
    if (totalDiscrepancies === 0) {
        return {
            ok: true,
            fecha: effectiveDate,
            discrepancies_found: false,
            total_discrepancies: 0,
            descuadres_pista: 0,
            descuadres_tienda: 0,
            mermas_anomalas: 0,
            recipients_count: 0,
            recipients: [],
            message: 'No se detectaron descuadres ni mermas anómalas superiores a los umbrales para la fecha auditada.'
        };
    }

    // Obtener usuarios autorizados con activo = 1 y permiso_alertas = 1
    let authorizedUsers = customUsers || [];
    if (!customUsers) {
        const db = getDb();
        if (db) {
            try {
                const [users] = await db.query(`
                    SELECT tu.*, u.status as sipe_status, r.name as sipe_role_name,
                           GROUP_CONCAT(p.name) as sipe_permissions
                    FROM telegram_usuarios tu
                    LEFT JOIN users u ON tu.user_id = u.id
                    LEFT JOIN roles r ON u.role_id = r.id
                    LEFT JOIN role_permissions rp ON r.id = rp.role_id
                    LEFT JOIN permissions p ON rp.permission_id = p.id
                    WHERE tu.activo = 1
                    GROUP BY tu.id
                `);
                authorizedUsers = (users || []).filter(u => {
                    if (u.user_id && u.sipe_status === 'inactive') return false;
                    if (Number(u.permiso_alertas) === 1) return true;
                    if (u.user_id && (u.sipe_role_name === 'Administrator' || u.sipe_role_name === 'Super Administrator')) return true;
                    const perms = (u.sipe_permissions || '').split(',');
                    return perms.includes('/dashboard/consultas/estaciones/diferencias-combustible') ||
                           perms.includes('/dashboard/consultas/estaciones/resumen-cierre');
                });
            } catch (dbErr) {
                try {
                    const [simpleUsers] = await db.query(
                        'SELECT * FROM telegram_usuarios WHERE activo = 1 AND permiso_alertas = 1'
                    );
                    authorizedUsers = simpleUsers || [];
                } catch (sErr) {
                    console.warn('[TelegramBot] Error consultando telegram_usuarios:', sErr.message);
                }
            }
        }
    }

    const alertMessage = formatDiscrepancyAlertMessage({
        effectiveDate,
        pistaDiscrepancies,
        tiendaDiscrepancies,
        mermasAnomalas
    });

    const sendResults = [];
    for (const user of authorizedUsers) {
        try {
            await sendTelegramMessage(user.telegram_user_id, alertMessage);
            await logTelegramQuery(
                user.telegram_user_id,
                'BROADCAST_DISCREPANCY_ALERT',
                `Alerta discrepancias ${effectiveDate}: ${pistaDiscrepancies.length} pista, ${tiendaDiscrepancies.length} tienda`,
                1
            );
            sendResults.push({
                telegram_user_id: user.telegram_user_id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username,
                status: 'sent'
            });
        } catch (err) {
            console.error(`[TelegramBot] Error al enviar alerta a chat ${user.telegram_user_id}:`, err.message);
            sendResults.push({
                telegram_user_id: user.telegram_user_id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username,
                status: 'failed',
                error: err.message
            });
        }
    }

    if (authorizedUsers.length === 0) {
        await logTelegramQuery(
            'SYSTEM',
            'BROADCAST_DISCREPANCY_ALERT',
            `Discrepancias detectadas (${effectiveDate}) sin destinatarios con permiso_alertas activo`,
            0
        );
    }

    return {
        ok: true,
        fecha: effectiveDate,
        discrepancies_found: true,
        total_discrepancies: totalDiscrepancies,
        descuadres_pista: pistaDiscrepancies.length,
        descuadres_tienda: tiendaDiscrepancies.length,
        mermas_anomalas: mermasAnomalas.length,
        recipients_count: authorizedUsers.length,
        recipients: sendResults,
        details: {
            pista: pistaDiscrepancies.map(p => ({
                estacion: p.estacion || p.empresa || p.titulo || 'Estación',
                diferencia: Number(p.diferencia !== undefined ? p.diferencia : (p.dif || 0))
            })),
            tienda: tiendaDiscrepancies.map(t => ({
                empresa: t.empresa || t.tienda_nombre || t.titulo || 'Tienda',
                diferencia: Number(t.dif !== undefined ? t.dif : (t.diferencia || 0))
            })),
            mermas: mermasAnomalas.map(m => ({
                estacion: m.estacion || m.empresa || m.titulo || 'Estación',
                producto: m.nombre_combustible || m.producto || m.tipo_combustible || 'Combustible',
                diferencia_galones: m.diferencia_galones,
                porcentaje_variacion: m.porcentaje_variacion
            }))
        }
    };
};

/**
 * Difusión de Alerta Gerencial Personalizada (Para n8n o Administradores)
 */
const broadcastCustomAlert = async ({ message, title = null, severity = 'alerta' }, customUsers = null) => {
    if (!message || !String(message).trim()) {
        throw new Error('El mensaje de la alerta es obligatorio');
    }

    let authorizedUsers = customUsers || [];
    if (!customUsers) {
        const db = getDb();
        if (db) {
            try {
                const [users] = await db.query(`
                    SELECT tu.*, u.status as sipe_status, r.name as sipe_role_name,
                           GROUP_CONCAT(p.name) as sipe_permissions
                    FROM telegram_usuarios tu
                    LEFT JOIN users u ON tu.user_id = u.id
                    LEFT JOIN roles r ON u.role_id = r.id
                    LEFT JOIN role_permissions rp ON r.id = rp.role_id
                    LEFT JOIN permissions p ON rp.permission_id = p.id
                    WHERE tu.activo = 1
                    GROUP BY tu.id
                `);
                authorizedUsers = (users || []).filter(u => {
                    if (u.user_id && u.sipe_status === 'inactive') return false;
                    if (Number(u.permiso_alertas) === 1) return true;
                    if (u.user_id && (u.sipe_role_name === 'Administrator' || u.sipe_role_name === 'Super Administrator')) return true;
                    const perms = (u.sipe_permissions || '').split(',');
                    return perms.includes('/dashboard/consultas/estaciones/diferencias-combustible') ||
                           perms.includes('/dashboard/consultas/estaciones/resumen-cierre');
                });
            } catch (dbErr) {
                try {
                    const [simpleUsers] = await db.query(
                        'SELECT * FROM telegram_usuarios WHERE activo = 1 AND permiso_alertas = 1'
                    );
                    authorizedUsers = simpleUsers || [];
                } catch (sErr) {
                    console.warn('[TelegramBot] Error consultando telegram_usuarios:', sErr.message);
                }
            }
        }
    }

    const sevIcon = severity === 'danger' || severity === 'critico' ? '🚨' : (severity === 'info' ? 'ℹ️' : '⚠️');
    const headerTitle = title ? escapeHtml(title) : 'COMUNICADO GERENCIAL SIPE';

    let formattedMsg = `${sevIcon} <b>${headerTitle}</b>\n`;
    formattedMsg += `📅 <b>Fecha:</b> ${toDisplayDate(getDateStr(0))}\n`;
    formattedMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    formattedMsg += `${escapeHtml(message)}\n\n`;
    formattedMsg += `<i>Mensaje emitido vía SIPE Automation</i>`;

    const sendResults = [];
    for (const user of authorizedUsers) {
        try {
            await sendTelegramMessage(user.telegram_user_id, formattedMsg);
            await logTelegramQuery(
                user.telegram_user_id,
                'BROADCAST_CUSTOM_ALERT',
                message.slice(0, 200),
                1
            );
            sendResults.push({
                telegram_user_id: user.telegram_user_id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username,
                status: 'sent'
            });
        } catch (err) {
            sendResults.push({
                telegram_user_id: user.telegram_user_id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username,
                status: 'failed',
                error: err.message
            });
        }
    }

    if (authorizedUsers.length === 0) {
        await logTelegramQuery(
            'SYSTEM',
            'BROADCAST_CUSTOM_ALERT',
            `Alerta broadcast emitida sin destinatarios con permiso_alertas activo: ${message.slice(0, 100)}`,
            0
        );
    }

    return {
        ok: true,
        recipients_count: authorizedUsers.length,
        recipients: sendResults,
        message: 'Alerta broadcast procesada con éxito'
    };
};

module.exports = {
    initTelegramBot,
    stopTelegramBot,
    restartTelegramBot,
    getBotStatus,
    testTelegramConnection,
    sendTelegramMessage,
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatProfileMessage,
    formatHelpMessage,
    getUserEffectivePermissions,
    parseUserDate,
    parseSpanishDateText,
    parseSpanishPeriodOrDate,
    SPANISH_MONTH_NAMES,
    moneyFmt,
    numFmt,
    normalizeText,
    parseNaturalLanguageQuery,
    formatSpecificStationMessage,
    formatProductTotalMessage,
    formatRankingMessage,
    formatSpecificBankMessage,
    formatTiendasMessage,
    formatVentasMensualMessage,
    formatVentasRangoMessage,
    formatHorasPicoMessage,
    formatSolarEnergyMessage,
    formatIntelligentGuidanceMessage,
    handleSmartNaturalLanguageQuery,
    formatDiscrepancyAlertMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert,
    getConsolidadoVentas,
    getSaldosBancosData,
    getSaldosChequeraData,
    KNOWN_STATIONS,
    KNOWN_FUELS,
    KNOWN_BANKS
};
