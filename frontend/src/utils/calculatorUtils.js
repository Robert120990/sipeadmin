/**
 * Evaluador seguro de expresiones matemáticas y comerciales para CommandPalette (Ctrl + K)
 * Soporta:
 * - Operaciones básicas: +, -, *, /, (), ^
 * - Porcentajes aplicados: "100 + 13%" -> 113, "250 - 15%" -> 212.50, "500 * 13%" -> 65
 * - Desglose comercial automático (Neto sin IVA 13%, IVA 13%, Total con IVA 13%)
 */

export const evaluateSafeMath = (rawInput) => {
    if (!rawInput || typeof rawInput !== 'string') return null;

    let expr = rawInput.trim();
    if (expr.startsWith('=')) expr = expr.slice(1).trim();
    if (!expr) return null;

    // Normalizar símbolos comunes: x/X por *, coma decimal si no es separador de miles
    const normalized = expr
        .replace(/\$/g, '')
        .replace(/\s+/g, '')
        .replace(/[xX×]/g, '*')
        .replace(/÷/g, '/');

    // Solo permitir dígitos, operadores matemáticos, punto, coma, paréntesis y %
    if (!/^[0-9+\-*/().%^,]+$/.test(normalized)) return null;

    // Debe contener al menos un operador o empezar con '=' en el input original para considerarse cálculo
    const hasOperator = /[+\-*/%^()]/.test(normalized);
    const forcedByEquals = rawInput.trim().startsWith('=');
    if (!hasOperator && !forcedByEquals) return null;

    // Limpiar comas usadas como separadores de miles (ej: 1,500.50 -> 1500.50)
    let cleanExpr = normalized.replace(/,/g, '');

    try {
        // Transformar sumas/restas porcentuales: A + B% => A * (1 + B/100), A - B% => A * (1 - B/100)
        cleanExpr = cleanExpr.replace(
            /(\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)%/g,
            (_, base, op, pct) => `(${base}*(1${op}(${pct}/100)))`
        );

        // Transformar multiplicación/división o porcentajes sueltos: B% => (B/100)
        cleanExpr = cleanExpr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

        // Potencia ^ a **
        cleanExpr = cleanExpr.replace(/\^/g, '**');

        // Validación final estricta antes de evaluar
        if (!/^[0-9+\-*/().]+$/.test(cleanExpr)) return null;

        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${cleanExpr});`)();

        if (typeof result !== 'number' || !Number.isFinite(result) || Number.isNaN(result)) {
            return null;
        }

        const rounded = Math.round((result + Number.EPSILON) * 10000) / 10000;
        const formatted = rounded.toLocaleString('en-US', {
            minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
            maximumFractionDigits: 4
        });

        const currency = rounded.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        // Cálculos comerciales rápidos (El Salvador IVA 13%)
        const iva13 = Math.round((rounded * 0.13 + Number.EPSILON) * 100) / 100;
        const plusIva = Math.round((rounded * 1.13 + Number.EPSILON) * 100) / 100;
        const netFromIncluded = Math.round(((rounded / 1.13) + Number.EPSILON) * 100) / 100;
        const ivaFromIncluded = Math.round(((rounded - netFromIncluded) + Number.EPSILON) * 100) / 100;

        return {
            expression: expr,
            raw: rounded,
            formatted,
            currency,
            commercial: {
                plusIva: plusIva.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                iva13: iva13.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                netFromIncluded: netFromIncluded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                ivaFromIncluded: ivaFromIncluded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            }
        };
    } catch {
        return null;
    }
};
