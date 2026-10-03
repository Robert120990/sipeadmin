/**
 * Utilidades centralizadas de formato para el frontend de SIPE Admin
 * - Garantiza consistencia visual en importes monetarios ($X,XXX.XX)
 * - Números con separadores de miles y decimales estándar
 * - Porcentajes y fechas homogéneas
 */

/**
 * Formatea un valor numérico a moneda USD ($1,234.56)
 * @param {number|string|null|undefined} val Valor a formatear
 * @param {object} options Opciones de Intl.NumberFormat
 * @returns {string} Texto formateado
 */
export function moneyFmt(val, options = {}) {
    if (val === null || val === undefined || val === '') return '$0.00';
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return '$0.00';

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options
    }).format(num);
}

/**
 * Formatea un valor numérico general con separadores de miles (1,234.50)
 * @param {number|string|null|undefined} val Valor a formatear
 * @param {number} decimals Cantidad de decimales (por defecto 2)
 * @returns {string}
 */
export function numFmt(val, decimals = 2) {
    if (val === null || val === undefined || val === '') return '0.00';
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return '0.00';

    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

/**
 * Formatea un valor numérico a porcentaje (12.50%)
 * @param {number|string|null|undefined} val Valor (ej. 12.5 o 0.125)
 * @param {boolean} isDecimal Si true, multiplica por 100
 * @param {number} decimals Cantidad de decimales
 * @returns {string}
 */
export function pctFmt(val, isDecimal = false, decimals = 2) {
    if (val === null || val === undefined || val === '') return '0.00%';
    let num = typeof val === 'number' ? val : parseFloat(val);
    if (isNaN(num)) return '0.00%';
    if (isDecimal) num = num * 100;

    return `${num.toFixed(decimals)}%`;
}

/**
 * Trunca un texto a longitud máxima agregando elipsis
 * @param {string} text Texto a truncar
 * @param {number} maxLen Longitud máxima
 * @returns {string}
 */
export function truncate(text, maxLen = 30) {
    if (!text) return '';
    const str = String(text).trim();
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
}

export default {
    moneyFmt,
    numFmt,
    pctFmt,
    truncate
};
