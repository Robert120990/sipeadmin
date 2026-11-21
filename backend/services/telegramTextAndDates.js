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
const EL_SALVADOR_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

const getDateStr = (offsetDays = 0) => {
    const parts = EL_SALVADOR_DATE_FMT.formatToParts(new Date());
    const map = {};
    for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
    }
    const utcDate = new Date(Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day) + (Number(offsetDays) || 0)
    ));
    const year = utcDate.getUTCFullYear();
    const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getUTCDate()).padStart(2, '0');
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
 * Desplazar una fecha YYYY-MM-DD en N días (soporta números negativos para retroceder)
 */
const shiftDate = (ymd, offsetDays = -1) => {
    if (!ymd || typeof ymd !== 'string') return getDateStr(offsetDays);
    const parts = ymd.split('-');
    if (parts.length !== 3) return getDateStr(offsetDays);
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + offsetDays);
    return formatYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
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
    const normalized = normalizeText(text);

    // 0. Detección de periodos relativos especiales solicitados por usuarios

    // 0.a "esta semana", "semana actual", "de esta semana"
    if (/\b(esta\s+semana|semana\s+actual|de\s+esta\s+semana)\b/i.test(normalized)) {
        const dayOfWeek = (refDate.getDay() + 6) % 7; // Lunes = 0, ..., Domingo = 6
        const monday = new Date(refDate);
        monday.setDate(monday.getDate() - dayOfWeek);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        const startDate = formatYMD(monday.getFullYear(), monday.getMonth() + 1, monday.getDate());
        const endDate = formatYMD(sunday.getFullYear(), sunday.getMonth() + 1, sunday.getDate());
        return {
            type: 'range',
            startDate,
            endDate,
            label: `Esta semana (${toDisplayDate(startDate)} al ${toDisplayDate(endDate)})`,
            periodo: 'esta_semana'
        };
    }

    // 0.b "semana pasada", "semana anterior", "la semana pasada"
    if (/\b(semana\s+pasada|semana\s+anterior|la\s+semana\s+pasada)\b/i.test(normalized)) {
        const dayOfWeek = (refDate.getDay() + 6) % 7;
        const lastMonday = new Date(refDate);
        lastMonday.setDate(lastMonday.getDate() - dayOfWeek - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastSunday.getDate() + 6);
        const startDate = formatYMD(lastMonday.getFullYear(), lastMonday.getMonth() + 1, lastMonday.getDate());
        const endDate = formatYMD(lastSunday.getFullYear(), lastSunday.getMonth() + 1, lastSunday.getDate());
        return {
            type: 'range',
            startDate,
            endDate,
            label: `Semana pasada (${toDisplayDate(startDate)} al ${toDisplayDate(endDate)})`,
            periodo: 'semana_pasada'
        };
    }

    // 0.c "quincena pasada", "quincena anterior", "la quincena pasada"
    if (/\b(quincena\s+pasada|quincena\s+anterior|la\s+quincena\s+pasada)\b/i.test(normalized)) {
        const day = refDate.getDate();
        let startDate, endDate, qLabel;
        if (day <= 15) {
            let prevM = refDate.getMonth();
            let y = refDate.getFullYear();
            if (prevM === 0) { prevM = 12; y -= 1; }
            const lastDay = new Date(y, prevM, 0).getDate();
            startDate = formatYMD(y, prevM, 16);
            endDate = formatYMD(y, prevM, lastDay);
            qLabel = `2ª Quincena de ${SPANISH_MONTH_NAMES[prevM]} ${y}`;
        } else {
            const y = refDate.getFullYear();
            const m = refDate.getMonth() + 1;
            startDate = formatYMD(y, m, 1);
            endDate = formatYMD(y, m, 15);
            qLabel = `1ª Quincena de ${SPANISH_MONTH_NAMES[m]} ${y}`;
        }
        return {
            type: 'range',
            startDate,
            endDate,
            label: `Quincena pasada: ${qLabel}`,
            periodo: 'quincena_pasada'
        };
    }

    // 0.d "últimos 7 días", "últimos 3 días", "últimos X días"
    const ultimosMatch = normalized.match(/\b(?:ultimos|ultimas)\s+([0-9]+|tres|siete)\s+dias?\b/i);
    if (ultimosMatch) {
        let numDays = parseInt(ultimosMatch[1], 10);
        if (ultimosMatch[1].toLowerCase() === 'tres') numDays = 3;
        if (ultimosMatch[1].toLowerCase() === 'siete') numDays = 7;
        if (!isNaN(numDays) && numDays > 0) {
            const endD = new Date(refDate);
            const startD = new Date(refDate);
            startD.setDate(startD.getDate() - numDays);
            const startDate = formatYMD(startD.getFullYear(), startD.getMonth() + 1, startD.getDate());
            const endDate = formatYMD(endD.getFullYear(), endD.getMonth() + 1, endD.getDate());
            return {
                type: 'range',
                startDate,
                endDate,
                days: numDays,
                label: `Últimos ${numDays} días (${toDisplayDate(startDate)} al ${toDisplayDate(endDate)})`,
                periodo: `ultimos_${numDays}_dias`
            };
        }
    }

    // 1. Detección de rangos de fechas: 'del 1 al 10 de octubre', 'entre el 5 y 15 de septiembre'
    const rangeRegex = /\b(?:del|desde|entre)\s+(?:el\s+)?([0-3]?[0-9])\s*(?:al|a|y|hasta)\s*(?:el\s+)?([0-3]?[0-9])\s*(?:de|\/|-)\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|set|oct|nov|dic)(?:\s*(?:de|del|\/|-)?\s*(\d{4}))?\b/i;
    const rangeMatch = normalized.match(rangeRegex);
    if (rangeMatch) {
        const startDay = parseInt(rangeMatch[1], 10);
        const endDay = parseInt(rangeMatch[2], 10);
        const month = SPANISH_MONTHS[rangeMatch[3].toLowerCase()];
        const year = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : defaultYear;
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
                const year = mMatch[2] ? parseInt(mMatch[2], 10) : defaultYear;
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
            const y = refDate.getFullYear();
            const m = refDate.getMonth() + 1;
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
            let y = refDate.getFullYear();
            let m = refDate.getMonth();
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

const KNOWN_STATIONS = [
    {
        id: 'ANDELSA',
        branch_id: 9,
        saas_branch_id: 9,
        name: 'Andelsa',
        keywords: ['andelsa', 'planta andelsa', 'empresa andelsa', '009', 'andelsa s.a.'],
        tiendaKey: 'andelsa'
    },
    {
        id: '014',
        branch_id: 1,
        saas_branch_id: 1,
        name: 'San Martín (La Loma)',
        keywords: ['la loma', 'san martin', 'san martín', 'loma', 'puma la loma', 'puma san martin', '014', 'san martin la loma'],
        tiendaKey: 'san martin'
    },
    {
        id: '008',
        branch_id: 8,
        saas_branch_id: 8,
        name: 'Puma Costa del Sol',
        keywords: ['costa del sol', 'costa', 'la costa', 'puma costa', 'super 7 costa', '008'],
        tiendaKey: 'costa'
    },
    {
        id: '002',
        branch_id: 4,
        saas_branch_id: 4,
        name: 'Puma Miraflores',
        keywords: ['miraflores', 'puma miraflores', 'e-market miraflores', '002'],
        tiendaKey: 'miraflores'
    },
    {
        id: '006',
        branch_id: 3,
        saas_branch_id: 3,
        name: 'Shell Chalchuapa',
        keywords: ['chalchuapa', 'shell chalchuapa', 'e-market chalchuapa', '006'],
        tiendaKey: 'chalchuapa'
    },
    {
        id: '015',
        branch_id: 2,
        saas_branch_id: 2,
        name: 'Shell 14 Avenida',
        keywords: ['14 avenida', '14 ave', 'catorce avenida', 'shell 14', '015'],
        tiendaKey: '14'
    },
    {
        id: '016',
        branch_id: 12,
        saas_branch_id: 12,
        name: 'Shell Poliedro',
        keywords: ['poliedro', 'shell poliedro', '016'],
        tiendaKey: 'poliedro'
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
    { key: 'AZUL', label: 'Banco Azul', keywords: ['azul', 'banco azul'] },
    { key: 'CITIBANK', label: 'Citibank / Scotiabank', keywords: ['citibank', 'citi', 'scotiabank'] },
    { key: 'CONSTELACION', label: 'Constelación', keywords: ['constelacion', 'constelación'] },
    { key: 'FOMENTO AGROPECUARIO', label: 'Banco de Fomento Agropecuario (BFA)', keywords: ['fomento agropecuario', 'banco de fomento', 'bfa'] }
];

/**
 * Contribuyentes, titulares y alias de cuentas bancarias / chequeras
 */
const KNOWN_ACCOUNT_HOLDERS = [
    { key: 'INVERSIONES LIL', label: 'Inversiones LIL, S.A. de C.V.', keywords: ['inversiones lil', 'inv lil', 'lil'] },
    { key: 'INVERSIONES CMR', label: 'Inversiones CMR, S.A. de C.V.', keywords: ['inversiones cmr', 'inv cmr', 'cmr'] },
    { key: 'ANDELSA', label: 'Andelsa, S.A. de C.V.', keywords: ['andelsa'] },
    { key: 'RAUL SOSA', label: 'Raúl R. Sosa / RRS', keywords: ['raul sosa', 'raul r sosa', 'sosa castellanos', 'raul rafael', 'rrs'] },
    { key: 'CORINA DE SOSA', label: 'Corina M. de Sosa', keywords: ['corina de sosa', 'corina m de sosa', 'corina sosa', 'corina'] },
    { key: 'CDH', label: 'CDH / LIOF', keywords: ['liof-cdh', 'liof cdh', 'liof', 'cdh'] },
    { key: 'VENDING', label: 'Vending RRS', keywords: ['vending'] },
    { key: 'CERRO VERDE', label: 'E-Market Cerro Verde', keywords: ['cerro verde'] },
    { key: 'RABIDA', label: 'RS Clásica Rábida', keywords: ['rabida', 'rábida'] },
    { key: 'EL DESVIO', label: 'El Desvío', keywords: ['el desvio', 'desvio', 'desvío'] }
];

/**
 * Catálogo de líneas y categorías de tiendas de conveniencia (Super 7 / E-Market)
 */
const KNOWN_STORE_LINES = [
    {
        key: 'CIGARROS',
        label: 'Cigarros y Cigarrillos',
        icon: '🚬',
        dbMatchers: ['CIGARRILLOS', 'CIGARROS', 'TABACO', 'VUSE', 'WAKA', 'MARLBORO', 'PALL MALL'],
        keywords: ['cigarros', 'cigarrillos', 'cigarro', 'cigarrillo', 'tabaco', 'vapes', 'vape', 'vuse', 'waka', 'marlboro', 'pall mall']
    },
    {
        key: 'CERVEZAS',
        label: 'Cervezas',
        icon: '🍺',
        dbMatchers: ['CERVEZA', 'CERVEZAS'],
        keywords: ['cervezas', 'cerveza', 'pilsener', 'golden', 'corona', 'suprema', 'regia', 'modelo', 'heineken']
    },
    {
        key: 'LICORES',
        label: 'Licores',
        icon: '🥃',
        dbMatchers: ['LICOR', 'LICORES'],
        keywords: ['licores', 'licor', 'ron', 'whisky', 'vodka', 'tequila']
    },
    {
        key: 'BEBIDAS',
        label: 'Bebidas y Refrescos',
        icon: '🥤',
        dbMatchers: ['BEBIDAS', 'BEBIDA FRIA', 'BEBIDAS FRIAS', 'BEBIDAS NO ALCOHOLICAS', 'BEBIDAS LOCALES'],
        keywords: ['bebidas', 'bebida fria', 'bebidas frias', 'bebidas no alcoholicas', 'gaseosas', 'gaseosa', 'sodas', 'soda', 'refrescos', 'refresco']
    },
    {
        key: 'CAFE',
        label: 'Café y Bebidas Calientes',
        icon: '☕',
        dbMatchers: ['CAFÉ CAPUCCINO', 'CAFÉ HELADO', 'CAFÉ NEGRO', 'CAFE CAPUCCINO', 'CAFE HELADO', 'CAFE NEGRO', 'BEBIDAS CALIENTES'],
        keywords: ['cafe', 'cafes', 'capuccino', 'cappuccino', 'cafe helado', 'cafe negro', 'bebidas calientes']
    },
    {
        key: 'AGUA',
        label: 'Agua Embotellada',
        icon: '💧',
        dbMatchers: ['AGUA', 'AGUAS'],
        keywords: ['agua', 'aguas', 'agua embotellada', 'alpina', 'cristal']
    },
    {
        key: 'ENERGIZANTES',
        label: 'Energizantes',
        icon: '⚡',
        dbMatchers: ['ENERGIZANTES'],
        keywords: ['energizantes', 'energizante', 'raptor', 'red bull', 'monster', 'amper', 'vive 100']
    },
    {
        key: 'JUGOS',
        label: 'Jugos y Frescos',
        icon: '🧃',
        dbMatchers: ['JUGOS', 'JUGOS Y LICUADOS', 'FRESCOS NATURALES'],
        keywords: ['jugos', 'jugo', 'frescos naturales']
    },
    {
        key: 'COMIDA',
        label: 'Comida Preparada y Rápida',
        icon: '🌭',
        dbMatchers: ['COMIDA', 'COMIDA RAPIDA', 'COMIDA PREPARADA', 'COMIDA PREPARADA EM TIENDA', 'COMIDA CONGELADA', 'COMIDA RAPIDA EMPACADA', 'POLLO EMPANIZADO'],
        keywords: ['comida', 'comida rapida', 'comida preparada', 'hot dog', 'hotdog', 'nachos', 'sandwich', 'alimentos']
    },
    {
        key: 'BOQUITAS',
        label: 'Boquitas y Snacks',
        icon: '🥨',
        dbMatchers: ['BOQUITAS', 'BOQUITAS SALADAS', 'BOQUITAS DULCE', 'BOQUITAS & GOLOSINAS', 'OTRAS BOQUITAS', 'GOLOSINAS'],
        keywords: ['boquitas', 'boquita', 'snacks', 'snack', 'churros', 'boquitas saladas', 'golosinas']
    },
    {
        key: 'DULCES',
        label: 'Dulces, Chocolates y Galletas',
        icon: '🍫',
        dbMatchers: ['DULCES', 'DULCES & CHOCOLATES', 'CHOCOLATES', 'GALLETAS', 'CHICLES', 'CHICHLES'],
        keywords: ['dulces', 'chocolates', 'chocolate', 'galletas', 'galleta', 'chicles', 'chicle']
    },
    {
        key: 'RECARGAS',
        label: 'Recargas y Paquetes Móviles',
        icon: '📱',
        dbMatchers: ['RECARGAS', 'RECARGAS TIGO', 'RECARGAR TIGO', 'RECARGAS CLARO', 'RECARGAS DIGICEL', 'PAQUETES MOVILES', 'SALDO PREPAGO'],
        keywords: ['recargas', 'recarga', 'saldo prepago', 'paquetes moviles', 'prepago']
    },
    {
        key: 'HIELO_FROZEN',
        label: 'Hielo, Frozen y Helados',
        icon: '🧊',
        dbMatchers: ['HIELO', 'FROZEN', 'HELADOS EMPACADOS', 'HELADOS Y SORBETES', 'NEVERIA & SARITA', 'NEVERIA & SARITAS'],
        keywords: ['hielo', 'frozen', 'helados', 'helado', 'sorbetes', 'sorbete', 'sarita']
    },
    {
        key: 'PAN_LACTEOS',
        label: 'Panadería y Lácteos',
        icon: '🥐',
        dbMatchers: ['PAN', 'PANADERIA', 'PAN EMPACADO', 'PAN VARIEDAD', 'PAN E-MARKET', 'LACTEOS', 'LECHE', 'OTROS LACTEOS', 'LECHES Y CHOCOLATINAS', 'QUESO PARTIDO'],
        keywords: ['pan', 'panaderia', 'lacteos', 'leche', 'queso']
    },
    {
        key: 'ABARROTES',
        label: 'Abarrotes y Mercadería General',
        icon: '🛒',
        dbMatchers: ['ABARROTES COMESTIBLES', 'ABARROTES NO COMESTIBLES', 'ABARROTES PERECEDEROS', 'MERCADERIA EN GENERAL', 'GRANOS BASICOS', 'PRODUCTOS ENLATADOS'],
        keywords: ['abarrotes', 'mercaderia en general', 'granos basicos', 'enlatados']
    },
    {
        key: 'CUIDADO_SALUD',
        label: 'Cuidado Personal y Medicinas',
        icon: '💊',
        dbMatchers: ['CUIDADO PERSONAL', 'CIUDADO PERSONAL', 'CUIDADO SALUD Y BELLEZA', 'MEDICINAS', 'PRESERVATIVOS', 'COSMETICOS', 'COSMETICA', 'BRONCEADORES'],
        keywords: ['cuidado personal', 'medicinas', 'medicina', 'farmacia', 'preservativos', 'cosmeticos']
    },
    {
        key: 'LUBRICANTES',
        label: 'Lubricantes y Accesorios',
        icon: '🛢️',
        dbMatchers: ['LUBRICANTES', 'ACEITES Y GRASAS', 'ACCESORIOS', 'BATERIAS'],
        keywords: ['lubricantes', 'lubricante', 'aceites y grasas']
    }
];

/**
 * Resolver el ID interno de una estación a partir de su nombre o texto
 */
const resolveStationId = (name) => {
    if (!name) return '008';
    const norm = normalizeText(name);
    for (const st of KNOWN_STATIONS) {
        for (const kw of st.keywords) {
            if (norm.includes(normalizeText(kw))) return st.id;
        }
    }
    return '008';
};

/**
 * Buscar una estación conocida por su ID, branch_id o nombre/keyword
 */
const findStationById = (id) => {
    if (!id) return null;
    const clean = String(id).trim().toLowerCase();
    return KNOWN_STATIONS.find(s => 
        s.id.toLowerCase() === clean || 
        String(s.saas_branch_id || '').toLowerCase() === clean ||
        String(s.branch_id || '').toLowerCase() === clean ||
        normalizeText(s.name).toLowerCase() === clean ||
        normalizeText(s.name).includes(clean) ||
        clean.includes(normalizeText(s.name)) ||
        s.keywords.some(kw => normalizeText(kw) === clean || clean.includes(normalizeText(kw)))
    ) || null;
};

/**
 * Buscar un combustible conocido por su clave, nombre o keyword
 */
const findFuelByKey = (key) => {
    if (!key) return null;
    const clean = String(key).trim().toLowerCase();
    return KNOWN_FUELS.find(f => 
        f.key.toLowerCase() === clean || 
        normalizeText(f.label).toLowerCase() === clean ||
        normalizeText(f.key).toLowerCase() === clean ||
        f.keywords.some(kw => normalizeText(kw) === clean)
    ) || null;
};

/**
 * Analizador semántico de lenguaje natural para consultas específicas con soporte de memoria de contexto multi-turno
 */
const parseNaturalLanguageQuery = (rawText, userContext = null) => {
    if (!rawText) return null;
    const rawTrimmed = String(rawText || '').trim();
    const rawLower = rawTrimmed.toLowerCase();
    const normalized = normalizeText(rawText);

    // 0. Detección temprana de Intents de Productividad (Tareas, Agenda, Cumpleaños) para aislar de ventas/competencia
    const isAsignarTarea =
        /^\/?(?:asignar(?:_?tarea)?|nueva_?tarea|crear_?tarea)\b/i.test(rawLower) ||
        /\b(?:asigna(?:le|les|me)?|asignar|pon(?:le|les|er)?|manda(?:le|les)?|crea(?:r|le)?)\s+(?:una\s+|la\s+|estas?\s+)?(?:nueva\s+)?(?:tarea|tareas|actividad|pendiente)\b/i.test(normalized) ||
        /\b(?:asignale|asignales|asignar)\s+(?:a|para)\s+[a-z0-9@]+\b/i.test(normalized);

    const isAgendarEvento = !isAsignarTarea && (
        /^\/?(?:agendar|reunion|recordatorio)\b/i.test(rawLower) ||
        /\b(?:recuerdame|recordarme|programa(?:r|me)?|agenda(?:r|me)?|agendar)\s+(?:una?\s+)?(?:reunion|junta|llamada|cita|evento|recordatorio|aviso)\b/i.test(normalized) ||
        /\b(?:recuerdame|recordarme)\s+(?:que\s+|de\s+|el\s+|hoy|manana|a\s+las|[a-z]{3,})\b/i.test(normalized)
    );

    const isConsultaTareas = !isAsignarTarea && !isAgendarEvento && (
        /^\/?(?:tareas|mistareas|mis_?tareas)\b/i.test(rawLower) ||
        /\b(?:mis\s+tareas|tareas\s+pendientes|tareas\s+vencidas|tareas\s+atrasadas|tareas\s+activas|tareas\s+del\s+equipo|que\s+tareas\s+(?:tengo|tiene|tenemos|hay)|cuales\s+son\s+(?:mis|las)\s+tareas|estado\s+de\s+(?:mis\s+|las\s+)?tareas|tareas\s+de\s+[a-z0-9]+)\b/i.test(normalized)
    );

    const isEventosAgenda = !isAsignarTarea && !isAgendarEvento && !isConsultaTareas && (
        /^\/?(?:agenda|eventos)\b/i.test(rawLower) ||
        /\b(?:eventos?\s+programados?|agenda\s+(?:de\s+hoy|de\s+manana|de\s+esta\s+semana|semanal|del\s+mes|completa|mibot)?|que\s+eventos?\s+(?:hay|tengo|tenemos|vienen)|que\s+reuniones?\s+(?:hay|tengo|tenemos)|proximas?\s+reuniones?|proximos?\s+eventos?|mis\s+eventos?|mis\s+reuniones?|mis\s+recordatorios?|mis\s+avisos?)\b/i.test(normalized)
    );

    const isCumpleanos = !isAsignarTarea && !isAgendarEvento && (
        /^\/?cumplea(?:nos|ños)\b/i.test(rawLower) ||
        /\b(?:cumpleanos|cumple\s+anos|quien\s+cumple|quienes\s+cumplen|cumpleaneros?|cumple\s+hoy|cumple\s+esta\s+semana|cumple\s+este\s+mes)\b/i.test(normalized)
    );

    const isProductivityCommand = isAsignarTarea || isAgendarEvento || isConsultaTareas || isEventosAgenda || isCumpleanos;

    // 0.1 Detección temprana de Pagos Programados / Control de Pagos (antes de Solar/Competencia/Andelsa)
    const isAndelsaCxcWords = /\b(?:cuentas?\s+por\s+cobrar|cxc|clientes?\s+andelsa|cartera\s+de\s+clientes?)\b/i.test(normalized);
    const isPagosProgramados = !isProductivityCommand && !isAndelsaCxcWords && (
        /^\/?(?:pagos|controlpagos|control_?pagos)\b/i.test(rawLower) ||
        /\b(pagos?\s+programados?|pagos?\s+pendientes?|pagos?\s+vencidos?|pagos?\s+atrasados?|pagos?\s+parciales?|pagos?\s+cancelados?|pagos?\s+de\s+(?:hoy|esta\s+semana|este\s+mes)|cuales\s+son\s+los\s+pagos?|que\s+pagos?\s+(?:hay|tenemos|vienen|tocan)|recordatorios?\s+de\s+pagos?|control\s+de\s+pagos?|vencimientos?\s+de\s+pagos?|proximos?\s+pagos?|cuanto\s+(?:debemos|falta\s+(?:por\s+)?pagar)\s+en\s+(?:control\s+de\s+)?pagos?|ya\s+se\s+pago\s+[a-z0-9]+)\b/i.test(normalized) ||
        (/\bpagos?\s+de\s+(?!tarjetas?\b|clientes?\b)[a-z0-9]{3,}\b/i.test(normalized) && !/\b(banco|bancos|chequera|cheques?|remesa|remesas|planilla|venta|ventas)\b/i.test(normalized))
    );

    // 1. Detección de periodo o fecha en español natural
    const period = parseSpanishPeriodOrDate(rawText);
    let hasExplicitDateOrPeriod = false;
    let targetDate = getDateStr(-1); // Ayer por defecto (cierres consolidados)
    let isRange = false;
    let startDate = null;
    let endDate = null;
    let isMonthly = false;
    let targetMonth = null;
    let targetYear = null;
    let targetPeriod = null;

    if (period) {
        hasExplicitDateOrPeriod = true;
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
        if (naturalDate) {
            hasExplicitDateOrPeriod = true;
            targetDate = naturalDate;
        }
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

    // 4.1 Detección de contribuyente / titular de cuenta bancaria o chequera (ej. Inversiones LIL, Raúl Sosa, Corina, CDH, CMR)
    let matchedAccountHolder = null;
    const holderCandidates = [];
    for (const h of KNOWN_ACCOUNT_HOLDERS) {
        for (const kw of h.keywords) {
            holderCandidates.push({ holder: h, normKw: normalizeText(kw) });
        }
    }
    holderCandidates.sort((a, b) => b.normKw.length - a.normKw.length);
    for (const cand of holderCandidates) {
        const escaped = escapeRegex(cand.normKw);
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalized)) {
            matchedAccountHolder = cand.holder;
            break;
        }
    }

    // 4.2 Detección de número o código de cuenta específica (ej. '#1724', 'cuenta 1724', '6203016201724')
    let matchedAccountNumber = null;
    const hashAccMatch = String(rawText || '').match(/#(\d{3,16})\b/);
    const wordAccMatch = normalized.match(/\b(?:cuenta|cta|chequera|numero)\s+(?:no\s+|num\s+)?([0-9-]{3,18})\b/i);
    if (hashAccMatch) {
        matchedAccountNumber = hashAccMatch[1];
    } else if (wordAccMatch && !/^(202[0-9])$/.test(wordAccMatch[1])) {
        matchedAccountNumber = wordAccMatch[1];
    }

    // 5. Detección de tiendas de conveniencia y líneas de productos de tienda (cigarros, cervezas, café, comida, etc.)
    const isTiendas = /\b(tienda|tiendas|conveniencia|cortes|corte|e-market|emarket|super 7|super7|pedregal)\b/.test(normalized);

    let matchedStoreLine = null;
    const lineCandidates = [];
    for (const ln of KNOWN_STORE_LINES) {
        for (const kw of ln.keywords) {
            lineCandidates.push({ line: ln, normKw: normalizeText(kw) });
        }
    }
    lineCandidates.sort((a, b) => b.normKw.length - a.normKw.length);
    for (const cand of lineCandidates) {
        const escaped = escapeRegex(cand.normKw);
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalized)) {
            matchedStoreLine = cand.line;
            break;
        }
    }

    // 5.1 Detección explícita de "hoy" para distinguir turnos en curso vs cierres históricos
    const isExplicitToday = /\b(hoy|el\s+dia\s+de\s+hoy|ahorita|llevamos\s+hoy|vendido\s+hoy)\b/i.test(normalized);

    // 6. Detección de consultas de energía solar / batería (evitando colisión con autonomía de tanques de combustible)
    const hasExplicitTankNoun = /\b(tanques?|cisternas?|pipas?|ullage)\b/i.test(normalized);
    const hasFuelTankContext = hasExplicitTankNoun || /\b(combustible|gasolina|diesel|regular|super|ion|galon(?:es|aje)?|descargas?|stock\s+de\s+combustible|nivel\s+de\s+combustible)\b/i.test(normalized);
    const isSolar = !isProductivityCommand && !isPagosProgramados && !hasExplicitTankNoun && (
        /\b(solar|solares|panel|paneles|fotovoltaic[oa]s?|bateria|baterias|bess|inversor|kwh|kwp|ahorro\s+solar|energia\s+solar)\b/i.test(normalized) ||
        (/\bautonomia\b/i.test(normalized) && !hasFuelTankContext && /\b(electrica|energia|respaldo|apagon|luz|carga)\b/i.test(normalized))
    );

    // 7. Detección de consultas de horas pico / horario de ventas
    const isHourlyPeak = !isProductivityCommand && !isPagosProgramados && (
        /\b(a que hora[s]?|hora[s]? pico|horas de mayor venta|momento de mayor venta|horario[s]? de venta|hora con mas venta|pico[s]? de venta|mayor cantidad de venta)\b/i.test(normalized) ||
        (/\b(hora|horas|horario)\b/i.test(normalized) && /\b(venta|ventas|pico|mayor|mas)\b/i.test(normalized))
    );

    // 7.1 Detección de Día de Mayor / Menor Venta del Mes, Rango o Día de la Semana
    // Ej. "En mes de octubre que dia fue el de mayor venta?", "Que dia de la semana vendió mas miraflores"
    const isPeakDay = !isProductivityCommand && !isPagosProgramados && !isHourlyPeak && !isSolar && !hasExplicitTankNoun && (
        /\b(que\s+dia|cual\s+dia|cual\s+fue\s+el\s+dia|dia\s+de\s+la\s+semana|dias?\s+de\s+la\s+semana|dias?\s+de\s+mayor|dias?\s+de\s+menor|dia\s+con\s+mas|dia\s+con\s+menos|mejor\s+dia|peor\s+dia|dia\s+record|dia\s+pico|dia\s+que\s+mas|dia\s+que\s+menos)\b/i.test(normalized) &&
        /\b(venta|ventas|vendio|vendieron|mayor|menor|mas|menos|mejor|peor|record|pico|galon(?:es|aje)?)\b/i.test(normalized)
    );
    const peakDayOrder = /\b(menor|menos|peor|baja|minima)\b/i.test(normalized) ? 'ASC' : 'DESC';

    // 8. Detección de consultas administrativas y financieras de Andelsa / Nova SaaS (sys.sipesv.com)
    const hasExplicitBankOrChequeraWords = /\b(chequera|chequeras|cheques?\s+disponibles?|saldo\s+en\s+chequeras?|cuentas?\s+de\s+cheques?|saldos?\s+(?:en\s+|de\s+)?bancos?|saldos?\s+bancarios?|cuentas?\s+bancarias?)\b/i.test(normalized);
    const isAndelsaMention = /\b(andelsa|planta andelsa|empresa andelsa)\b/i.test(normalized) ||
                             (matchedStation && matchedStation.id === 'ANDELSA');
    const isSysSaasMention = /\b(sys\.sipesv|sistema saas|nova saas|saas)\b/i.test(normalized);
    const isAndelsaRelated = !isProductivityCommand && !isPagosProgramados && (isAndelsaMention || isSysSaasMention) && !hasExplicitBankOrChequeraWords;

    const isAndelsaInventario = isAndelsaRelated && /\b(inventario|inventarios|stock|existencia|existencias|kardex|almacen)\b/i.test(normalized);
    const isAndelsaCostos = isAndelsaRelated && /\b(costo|costos|margen|margenes|utilidad|ganancia)\b/i.test(normalized);
    const isAndelsaCxc = isAndelsaRelated && /\b(cxc|cuentas por cobrar|cuenta por cobrar|por cobrar|cartera|morosidad|mora|deuda|deudores|creditos?)\b/i.test(normalized);
    const isAndelsaVentasCliente = isAndelsaRelated && /\b(cliente|clientes)\b/i.test(normalized) && (/\b(venta|ventas|facturacion|facturado)\b/i.test(normalized) || !isAndelsaCxc);
    const isAndelsaVentasProducto = isAndelsaRelated && /\b(producto|productos|items?|articulos?)\b/i.test(normalized) && /\b(venta|ventas|mas vendido|vendidos|desplazamiento)\b/i.test(normalized);
    const isAndelsaFinanzasResumen = isAndelsaRelated && !isSolar && !isAndelsaInventario && !isAndelsaCostos && !isAndelsaCxc && !isAndelsaVentasCliente && !isAndelsaVentasProducto && !matchedFuel && (
        /\b(finanzas|financiero|resumen|kpi|metricas|balance|estado general|general)\b/i.test(normalized) ||
        /\b(andelsa)\b/i.test(normalized)
    );

    // 8.1 Nuevos Intents Ejecutivos Deterministas: Tanques, Pedidos Puma, Rentabilidad EBITDA, Tránsito/Vales y Chequera
    let isPedidosPuma = !isProductivityCommand && !isAndelsaRelated && !isPagosProgramados && (
        /\b(pedidos?\s+puma|ordenes?\s+puma|portal\s+puma|pedidos?\s+de\s+combustible|pipas?\s+en\s+(?:ruta|transito|camino)|cisternas?\s+en\s+(?:ruta|transito|camino)|pedidos?\s+retenidos?|ordenes?\s+retenidas?|estado\s+de\s+(?:los\s+)?pedidos?|que\s+pedidos?\s+hay|pipas?\s+pendientes?|pedidos?\s+programados?)\b/i.test(normalized)
    );

    let isTanques = !isProductivityCommand && !isPagosProgramados && !isAndelsaRelated && !isSolar && !isPedidosPuma && (
        /\b(tanques?|nivel\s+de\s+combustible|niveles\s+de\s+combustible|inventario\s+de\s+combustible|inventario\s+en\s+tanques?|stock\s+de\s+combustible|stock\s+en\s+tanques?|ullage|espacio\s+vacio|capacidad\s+de\s+descarga|quiebre\s+de\s+stock|falta\s+combustible|urge\s+pedir|emergencia\s+de\s+combustible)\b/i.test(normalized) ||
        (/\bautonomia\b/i.test(normalized) && !isSolar)
    );

    let isTransitoVales = !isProductivityCommand && !isPagosProgramados && !isAndelsaRelated && (
        /\b(dinero\s+en\s+transito|efectivo\s+en\s+transito|remesas?\s+en\s+transito|remesas?\s+pendientes?|remesas?\s+sin\s+abonar|vales?\s+sin\s+facturar|vales?\s+pendientes?|creditos?\s+sin\s+dte|creditos?\s+sin\s+facturar|vales?\s+vencidos?)\b/i.test(normalized)
    );

    let isChequera = !isProductivityCommand && !isPagosProgramados && /\b(chequera|chequeras|cheques?\s+disponibles?|saldos?\s+(?:en\s+|de\s+)?chequeras?|cuentas?\s+de\s+cheques?)\b/i.test(normalized);
    const hasAccountFilterIntent = !isProductivityCommand && !isPagosProgramados && !isTransitoVales && !isAndelsaCxc && (Boolean(matchedAccountHolder) || Boolean(matchedAccountNumber)) &&
        /\b(saldos?|cuentas?|bancos?|chequeras?|cheques?|disponible)\b/i.test(normalized);
    const isBancosGlobal = !isProductivityCommand && !isPagosProgramados && !isChequera && !isTransitoVales && !isAndelsaRelated && (
        (!matchedBank && /\b(saldos?\s+(?:en\s+|de\s+)?bancos?|saldos?\s+bancarios?|cuentas?\s+bancarias?|cuanto\s+(?:dinero\s+)?hay\s+en\s+(?:los\s+|las\s+)?(?:bancos?|cuentas?)|cuanto\s+tenemos\s+en\s+(?:los\s+|las\s+)?(?:bancos?|cuentas?)|disponible\s+en\s+bancos?|total\s+en\s+bancos?|liquidez\s+bancaria)\b/i.test(normalized)) ||
        (hasAccountFilterIntent && !matchedBank)
    );

    // 8.2 Detección de Venta de Tienda por Línea / Producto o Detalle de Tienda de Estación Específica
    // Ej. "Vent cigarros la loma", "Detalle venta de tienda la loma", "ventas por linea super 7 costa del sol"
    const isTiendaLinea = !isProductivityCommand && !isPagosProgramados && !isAndelsaRelated && !isChequera && !isBancosGlobal && !matchedBank && (
        Boolean(matchedStoreLine) ||
        (isTiendas && Boolean(matchedStation)) ||
        (isTiendas && /\b(detalle|desglose|linea|lineas|categoria|categorias|rubro|rubros|producto|productos)\b/i.test(normalized))
    );

    // 9. Detección de Precios de la Competencia (DGEHM) y Marcas Competidoras
    let matchedCompetitorBrand = null;
    if (/\b(texaco)\b/i.test(normalized)) {
        matchedCompetitorBrand = 'Texaco';
    } else if (/\b(dlc)\b/i.test(normalized)) {
        matchedCompetitorBrand = 'DLC';
    } else if (/\b(gasolineras?\s+uno|estacion\s+uno|marca\s+uno|precios?\s+(?:de\s+)?uno|competencia\s+uno|terra\s+uno)\b/i.test(normalized)) {
        matchedCompetitorBrand = 'Uno';
    } else if (!matchedStation && /\b(marca\s+puma|competidores?\s+puma|gasolineras?\s+puma)\b/i.test(normalized)) {
        matchedCompetitorBrand = 'Puma';
    } else if (!matchedStation && /\b(marca\s+shell|competidores?\s+shell|gasolineras?\s+shell)\b/i.test(normalized)) {
        matchedCompetitorBrand = 'Shell';
    }

    const hasExplicitCompetenciaWord = /\b(competencia|competidores|competidor|dgehm|precios?\s+competencia|precios?\s+de\s+(?:la\s+)?competencia|precios?\s+del?\s+mercado|comparativo\s+de\s+precios|comparar\s+precios|monitoreo\s+de\s+precios)\b/i.test(normalized);
    const hasAuditCashWords = /\b(descuadre|descuadres|merma|mermas|faltante|sobrante|cuadrado|cierre|cierres)\b/i.test(normalized);
    const hasFuelPriceIntent = !isProductivityCommand && !isPagosProgramados && !isAndelsaRelated && !isSolar && !isTanques && !isPedidosPuma && !matchedBank && !hasAuditCashWords && (
        /\b(precios?|tarifas?|a\s+como\s+esta|a\s+como\s+tienen|cuanto\s+cuesta|cuanto\s+vale)\b/i.test(normalized) ||
        /\b(mas\s+barat[oa]s?|mas\s+car[oa]s?|menor\s+precio|mayor\s+precio|mejor\s+precio|precios?\s+bajos?)\b/i.test(normalized)
    );
    const hasCompetitorBrandIntent = !isProductivityCommand && !isPagosProgramados && !isAndelsaRelated && !matchedBank && Boolean(matchedCompetitorBrand) &&
        !/\b(bancos?|chequera|cheques?|saldo)\b/i.test(normalized);

    let isCompetencia = !isProductivityCommand && !isPagosProgramados && (hasExplicitCompetenciaWord || hasFuelPriceIntent || hasCompetitorBrandIntent);
    const onlyCheaper = /\b(mas\s+barat[oa]s?|menor\s+precio|precios?\s+mas\s+bajos?|abajo\s+de\s+nosotros|debajo\s+de\s+nosotros|mejor\s+precio|solo\s+barat[oa]s?)\b/i.test(normalized);
    const competenciaServiceType = /\b(servicio\s+completo|completo|full\s+service)\b/i.test(normalized)
        ? 'SC'
        : (/\b(autoservicio|auto\s+servicio)\b/i.test(normalized) ? 'AS' : 'ALL');

    let isRentabilidad = !isProductivityCommand && !isPagosProgramados && !isAndelsaRelated && !isCompetencia && (
        /\b(rentabilidad|ebitda|margen\s+neto|margen\s+operativo|margen\s+bruto|utilidad\s+operativa|utilidad\s+por\s+estacion|ganancia\s+por\s+estacion|estado\s+de\s+resultados|p&l)\b/i.test(normalized)
    );

    // 9.5 Nuevos Intents Ejecutivos: Centinela, Audio TTS, Gráficas PNG, Flujo de Caja, Préstamos, Créditos y Aprobaciones
    const isCentinela = !isProductivityCommand && !isPagosProgramados && (
        /\b(centinela|liquidez\s+72h?|riesgo\s+de\s+liquidez|alerta\s+de\s+liquidez|auditoria\s+de\s+liquidez|liquidez\s+vs\s+compromisos)\b/i.test(normalized)
    );
    const isAudioResumen = !isProductivityCommand && !isPagosProgramados && (
        /\b(resumen\s+en\s+audio|nota\s+de\s+voz\s+ejecutiva|mandame\s+(?:un\s+)?audio|enviame\s+(?:un\s+)?audio|dame\s+(?:un\s+)?audio|resumen\s+hablado|briefing\s+de\s+voz)\b/i.test(normalized)
    );
    const isGrafica = !isProductivityCommand && !isPagosProgramados && (
        /\b(grafica|grafico|chart|muestrame\s+la\s+grafica|enviame\s+la\s+grafica)\b/i.test(normalized)
    );
    let graficaTopic = 'ventas';
    if (isGrafica) {
        if (/\b(bancos?|saldos?\s+bancarios?)\b/i.test(normalized)) graficaTopic = 'bancos';
        else if (/\b(flujo|caja|cashflow|liquidez)\b/i.test(normalized)) graficaTopic = 'flujo';
        else if (/\b(solar|paneles|energia|bateria)\b/i.test(normalized)) graficaTopic = 'solar';
    }
    const isFlujoCaja = !isProductivityCommand && !isPagosProgramados && !isGrafica && (
        /\b(flujo\s+de\s+caja|cashflow|proyeccion\s+de\s+(?:caja|liquidez|efectivo)|brecha\s+de\s+liquidez)\b/i.test(normalized)
    );
    const flujoHorizon = /\b60\b/.test(normalized) ? 60 : 30;
    const isPrestamos = !isProductivityCommand && !isPagosProgramados && !isAndelsaRelated && !isFlujoCaja && (
        /\b(prestamos?|amortizacion(?:es)?|cuotas?\s+de\s+prestamos?|deuda\s+bancaria|saldos?\s+de\s+prestamos?)\b/i.test(normalized)
    );
    const isCreditosFlota = !isProductivityCommand && !isPagosProgramados && !isAndelsaRelated && (
        /\b(creditos?\s+(?:de\s+)?flotas?|riesgo\s+de\s+credito|morosidad\s+(?:de\s+)?flotas?|cartera\s+de\s+flotas?|clientes?\s+en\s+mora)\b/i.test(normalized)
    );
    const isAprobaciones = !isProductivityCommand && !isPagosProgramados && (
        /\b(aprobaciones?\s+pendientes?|cheques?\s+por\s+aprobar|planillas?\s+por\s+aprobar|bandeja\s+de\s+aprobaciones?)\b/i.test(normalized)
    );
    const hasNewFinanceOrMediaIntent = isCentinela || isAudioResumen || isGrafica || isFlujoCaja || isPrestamos || isCreditosFlota || isAprobaciones;

    // 10. Detección de auditoría / descuadres (excluyendo consultas de diferencia de precios de competencia)
    const isAlertas = !isProductivityCommand && !isPagosProgramados && !isCompetencia && !isTransitoVales && !hasNewFinanceOrMediaIntent && /\b(descuadre|descuadres|diferencia|diferencias|alerta|alertas|anomalia|anomalias|merma|mermas|faltante|sobrante|cuadrado)\b/.test(normalized);

    // 11. Detección de rankings o comparativas de ventas (excluyendo comparativas de precios, tanques o rentabilidad)
    const isRanking = !isProductivityCommand && !isPagosProgramados && !isCompetencia && !isTanques && !isRentabilidad && !hasNewFinanceOrMediaIntent && (
        /\b(cual|quien|que estacion|estacion que|estaciones que)\b.*(mas|menos|mayor|menor|lider|top|primer)/.test(normalized) ||
        /\b(top ventas|ranking|mayor venta|mas vendio|menos vendio)\b/.test(normalized)
    );

    // RESOLUCIÓN DE CONTEXTO CONVERSACIONAL MULTI-TURNO
    if (userContext && !isProductivityCommand && !isPagosProgramados) {
        const wantsGlobalScope = /\b(toda\s+la\s+red|todas\s+las\s+estaciones|en\s+general|global|red\s+completa|todas)\b/i.test(normalized);
        const mentionsExplicitSalesWords = /\b(venta|ventas|vendio|vendieron|galon|galones|galonaje|cierre|cierres|chequera|bancos?|saldo)\b/i.test(normalized);

        // 0. Seguimiento conversacional de Precios de Competencia ("¿Y en Chalchuapa?", "¿Y regular?", "¿Solo los más baratos?")
        if (
            userContext.lastTopic === 'competencia' &&
            !isSolar &&
            !isHourlyPeak &&
            !isAndelsaRelated &&
            !isAlertas &&
            !isTiendas &&
            !matchedBank &&
            !mentionsExplicitSalesWords &&
            (matchedStation || matchedFuel || matchedCompetitorBrand || onlyCheaper || /\b(servicio\s+completo|autoservicio|resumen|red|todos?)\b/i.test(normalized))
        ) {
            isCompetencia = true;
            if (!matchedStation && userContext.lastStationId && !wantsGlobalScope && (matchedFuel || onlyCheaper || /\b(servicio\s+completo|autoservicio)\b/i.test(normalized))) {
                matchedStation = findStationById(userContext.lastStationId);
            }
        } else if (isCompetencia && !matchedStation && userContext.lastStationId && /\b(ahi|alli|esa\s+estacion|misma\s+estacion)\b/i.test(normalized)) {
            matchedStation = findStationById(userContext.lastStationId);
        }

        // a. Pregunta de seguimiento de fecha: "¿Y el día anterior?", "¿Y ayer?", "¿Y anteayer?"
        const isPrevDayFollowUp = /\b(y\s+el\s+dia\s+anterior|el\s+dia\s+anterior|dia\s+anterior|un\s+dia\s+antes|y\s+ayer|y\s+el\s+de\s+ayer|y\s+el\s+dia\s+de\s+ayer)\b/i.test(normalized) || (/^(y\s+)?ayer$/i.test(normalized));
        const isAnteayerFollowUp = /\b(y\s+anteayer|y\s+antier|anteayer|antier)\b/i.test(normalized);

        if (!isCompetencia && userContext.lastDate && (isPrevDayFollowUp || isAnteayerFollowUp)) {
            const offset = isAnteayerFollowUp ? -2 : -1;
            targetDate = shiftDate(userContext.lastDate, offset);
            hasExplicitDateOrPeriod = true;

            if (!matchedStation && userContext.lastStationId) {
                matchedStation = findStationById(userContext.lastStationId);
            }
            if (!matchedFuel && userContext.lastProduct) {
                matchedFuel = findFuelByKey(userContext.lastProduct);
            }
        }

        // b. Pregunta de seguimiento de estación: "¿Y en Costa del Sol?", "¿Y Miraflores?"
        if (!isCompetencia && matchedStation && !hasExplicitDateOrPeriod) {
            if (userContext.lastDate) {
                targetDate = userContext.lastDate;
            }
            if (userContext.lastPeriod && userContext.lastTopic === 'ventas_mensual') {
                isMonthly = true;
                targetMonth = userContext.lastMonth;
                targetYear = userContext.lastYear;
                targetPeriod = userContext.lastPeriod;
            }
            if (!matchedFuel && userContext.lastProduct) {
                matchedFuel = findFuelByKey(userContext.lastProduct);
            }
        }

        // c. Pregunta de seguimiento de combustible: "¿Y de diésel cuánto fue?", "¿Y regular?", "¿Y super?"
        if (!isCompetencia && matchedFuel && !matchedStation && userContext.lastStationId) {
            matchedStation = findStationById(userContext.lastStationId);
            if (!hasExplicitDateOrPeriod && userContext.lastDate) {
                targetDate = userContext.lastDate;
            }
        }

        // d. Pregunta de seguimiento de horas pico: "¿A qué horas vendió más?", "¿Horas pico?"
        if (isHourlyPeak) {
            if (!matchedStation && userContext.lastStationId) {
                matchedStation = findStationById(userContext.lastStationId);
            }
            if (!hasExplicitDateOrPeriod && userContext.lastDate) {
                targetDate = userContext.lastDate;
            }
        }

        // e. Pregunta de seguimiento de tiendas: "¿Y las tiendas?"
        if (isTiendas) {
            if (!hasExplicitDateOrPeriod && userContext.lastDate) {
                targetDate = userContext.lastDate;
            }
            if (!matchedStation && userContext.lastStationId) {
                matchedStation = findStationById(userContext.lastStationId);
            }
        }

        // f. Pregunta de seguimiento solar: "¿Y el ahorro solar?"
        if (isSolar) {
            if (!hasExplicitDateOrPeriod && userContext.lastDate) {
                targetDate = userContext.lastDate;
            }
        }

        // g. Seguimiento de Tanques / Pedidos / Rentabilidad cuando el usuario cambia solo estación o combustible ("¿Y en Miraflores?")
        if (
            userContext.lastTopic === 'tanques' &&
            !isCompetencia && !isSolar && !isHourlyPeak && !isAndelsaRelated && !isAlertas && !isTiendas && !matchedBank &&
            !/\b(venta|ventas|vendio|vendieron|cierre|cierres|chequera|bancos?|saldo)\b/i.test(normalized) &&
            (matchedStation || matchedFuel)
        ) {
            isTanques = true;
            if (!matchedStation && userContext.lastStationId) {
                matchedStation = findStationById(userContext.lastStationId);
            }
        }
    }

    return {
        normalized,
        targetDate,
        isExplicitToday,
        matchedStation,
        matchedFuel,
        matchedBank,
        matchedAccountHolder,
        matchedAccountNumber,
        hasAccountFilterIntent,
        matchedStoreLine,
        isTiendaLinea,
        isPeakDay,
        peakDayOrder,
        isPagosProgramados,
        isAsignarTarea,
        isConsultaTareas,
        isAgendarEvento,
        isEventosAgenda,
        isCumpleanos,
        matchedCompetitorBrand,
        isCompetencia,
        onlyCheaper,
        competenciaServiceType,
        isTanques,
        isPedidosPuma,
        isRentabilidad,
        isTransitoVales,
        isChequera,
        isBancosGlobal,
        isRanking,
        isTiendas,
        isAlertas,
        isSolar,
        isEnergy: isSolar,
        isHourlyPeak,
        isHorasPico: isHourlyPeak,
        isAndelsaRelated,
        isAndelsaInventario,
        isAndelsaCostos,
        isAndelsaCxc,
        isAndelsaVentasCliente,
        isAndelsaVentasProducto,
        isAndelsaFinanzasResumen,
        isRange,
        isRango: isRange,
        startDate,
        endDate,
        dateRange: isRange ? { start: startDate, end: endDate } : null,
        isMonthly,
        isMensual: isMonthly,
        targetMonth,
        targetYear,
        targetPeriod,
        isCentinela,
        isAudioResumen,
        isGrafica,
        graficaTopic,
        isFlujoCaja,
        flujoHorizon,
        isPrestamos,
        isCreditosFlota,
        isAprobaciones
    };
};

module.exports = {
    BANK_NAME_MAP,
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    getDateStr,
    normalizeText,
    escapeRegex,
    SPANISH_MONTHS,
    formatYMD,
    shiftDate,
    parseSpanishDateText,
    SPANISH_MONTH_NAMES,
    parseSpanishPeriodOrDate,
    parseUserDate,
    KNOWN_STATIONS,
    KNOWN_FUELS,
    KNOWN_BANKS,
    KNOWN_ACCOUNT_HOLDERS,
    KNOWN_STORE_LINES,
    resolveStationId,
    findStationById,
    findFuelByKey,
    parseNaturalLanguageQuery
};
