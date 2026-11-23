/**
 * Utilidades centralizadas de fechas para zona horaria oficial America/El_Salvador (UTC-6)
 * y normalización segura de objetos Date devueltos por mysql2 (timezone: 'Z').
 */

const SV_TIMEZONE = 'America/El_Salvador';

/**
 * Devuelve la fecha actual YYYY-MM-DD en zona horaria America/El_Salvador.
 * Evita que after-6PM SV (00:00 UTC) las consultas salten al día siguiente.
 */
function getElSalvadorTodayYMD(now = new Date()) {
    const dt = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: SV_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(dt);
}

/**
 * Normaliza un valor DATE/DATETIME de MySQL (Date UTC o string ISO / DD/MM/YYYY)
 * a formato YYYY-MM-DD sin corrimiento de zona horaria ni split('T') roto en Date.toString().
 */
function formatDateYMD(val) {
    if (!val) return null;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(val).trim();
    if (!str) return null;
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
    return null;
}

/**
 * Suma o resta días calendario sobre una fecha YYYY-MM-DD en UTC mediodía (inmune a DST/TZ).
 */
function addDaysYMD(ymd, deltaDays = 0) {
    const clean = formatDateYMD(ymd);
    if (!clean) return null;
    const [y, m, d] = clean.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + Number(deltaDays || 0), 12, 0, 0));
    return dt.toISOString().slice(0, 10);
}

/**
 * Formatea una fecha a DD/MM/YYYY sin aplicar desplazamientos locales sobre fechas UTC.
 */
function formatDisplayDMY(val) {
    const ymd = formatDateYMD(val);
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
}

module.exports = {
    SV_TIMEZONE,
    getElSalvadorTodayYMD,
    formatDateYMD,
    addDaysYMD,
    formatDisplayDMY
};
