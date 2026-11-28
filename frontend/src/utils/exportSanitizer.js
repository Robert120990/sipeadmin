/**
 * Spreadsheet export sanitization helpers to prevent CSV/Excel Formula Injection (CWE-1236).
 * Prefixes formula-triggering string cells with a leading apostrophe (') so Excel, LibreOffice,
 * and Google Sheets evaluate them strictly as literal text while preserving numbers, booleans,
 * null/undefined, and benign strings untouched.
 */

const FORMULA_TRIGGER_RE = /^[\t\r\n ]*[=+\-@]/;

/**
 * Sanitizes a single cell value before writing it into a spreadsheet worksheet.
 *
 * @param {*} value
 * @returns {*}
 */
export function sanitizeSpreadsheetCell(value) {
    if (typeof value === 'string' && FORMULA_TRIGGER_RE.test(value)) {
        return `'${value}`;
    }
    return value;
}

/**
 * Sanitizes an array of spreadsheet rows (objects or arrays) without mutating the input.
 *
 * @param {Array<Object|Array>} rows
 * @returns {Array<Object|Array>}
 */
export function sanitizeSpreadsheetRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
        if (Array.isArray(row)) {
            return row.map(sanitizeSpreadsheetCell);
        }
        if (row && typeof row === 'object') {
            const sanitized = {};
            for (const [key, val] of Object.entries(row)) {
                sanitized[key] = sanitizeSpreadsheetCell(val);
            }
            return sanitized;
        }
        return sanitizeSpreadsheetCell(row);
    });
}
