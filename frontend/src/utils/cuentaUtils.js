/**
 * Utility functions for bank accounts (formatting and sorting).
 */

/**
 * Returns the standardized label for bank account selectors:
 * [banco] nombre de la cuenta - (numero de cuenta)
 *
 * @param {Object} c - Account object
 * @returns {string} Formatted label
 */
export function formatCuentaLabel(c) {
    if (!c) return '';
    const banco = (c.banco_nombre || c.banco || 'BANCO').trim();
    const nombre = (c.nombre || c.cuenta_nombre || '').trim();
    const numero = (c.numero || c.numero_cuenta || '').trim();
    return `[${banco}] ${nombre} - (${numero})`;
}

/**
 * Sorts account list by bank name ASC, then account number ASC.
 *
 * @param {Array<Object>} cuentas - List of accounts
 * @returns {Array<Object>} Sorted list of accounts
 */
export function sortCuentas(cuentas) {
    if (!Array.isArray(cuentas)) return [];
    return [...cuentas].sort((a, b) => {
        const bancoA = (a.banco_nombre || a.banco || '').trim().toLowerCase();
        const bancoB = (b.banco_nombre || b.banco || '').trim().toLowerCase();
        const compBanco = bancoA.localeCompare(bancoB, undefined, { numeric: true });
        if (compBanco !== 0) return compBanco;

        const numA = (a.numero || a.numero_cuenta || '').trim().toLowerCase();
        const numB = (b.numero || b.numero_cuenta || '').trim().toLowerCase();
        return numA.localeCompare(numB, undefined, { numeric: true });
    });
}
