export function parseDateOnly(str) {
    if (!str) return null;
    const [datePart] = str.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { year: y, month: m, day: d };
}

export function dateFromParts({ year, month, day }) {
    return new Date(year, month - 1, day);
}

export function formatDateDisplay(str, options = { day: 'numeric', month: 'long' }) {
    const parts = parseDateOnly(str);
    if (!parts) return '';
    const d = dateFromParts(parts);
    return d.toLocaleDateString('es-ES', options);
}

export function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function isBirthdayToday(str) {
    const parts = parseDateOnly(str);
    if (!parts) return false;
    const today = new Date();
    return parts.month === today.getMonth() + 1 && parts.day === today.getDate();
}

export function dateOnlyToDate(str) {
    const parts = parseDateOnly(str);
    if (!parts) return null;
    return dateFromParts(parts);
}

export function isSameDay(dateStr1, dateStr2) {
    const p1 = parseDateOnly(dateStr1);
    const p2 = parseDateOnly(dateStr2);
    if (!p1 || !p2) return false;
    return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day;
}

export function isTodayOrPast(dateStr) {
    const parts = parseDateOnly(dateStr);
    if (!parts) return false;
    const d = dateFromParts(parts);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d <= today;
}

export function daysFromNow(dateStr) {
    const parts = parseDateOnly(dateStr);
    if (!parts) return Infinity;
    const d = dateFromParts(parts);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
}
