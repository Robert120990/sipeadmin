/**
 * Evaluador seguro de expresiones matemáticas y comerciales para CommandPalette (Ctrl + K)
 * Soporta:
 * - Operaciones básicas: +, -, *, /, (), ^, x, X, ×, ÷
 * - Prefijo o sufijo '=': '=278+177+75' o '278+177+75='
 * - Multiplicación implícita: '2(5+3)' -> 16
 * - Porcentajes aplicados en árbol sintáctico: "100 + 13%" -> 113, "(200+300) + 13%" -> 565, "250 - 15%" -> 212.50, "500 * 13%" -> 65
 * - Desglose comercial automático (4 recuadros: + IVA 13%, IVA (13%), NETO (SIN IVA), IVA DESGLOSADO)
 */

export const evaluateSafeMathNumeric = (rawInput) => {
    if (!rawInput || typeof rawInput !== 'string') return null;
    let str = rawInput.trim();
    const hadEqualSign = str.startsWith('=') || str.endsWith('=');
    if (str.startsWith('=')) str = str.slice(1).trim();
    if (str.endsWith('=')) str = str.slice(0, -1).trim();
    str = str.replace(/\$/g, '').trim();
    if (!str || !/\d/.test(str)) return null;

    // Whitelist estricta: solo dígitos, espacios, puntos/comas decimales y operadores válidos
    if (!/^[0-9\s.,+*^xX×÷/%()-]+$/.test(str)) return null;

    // Debe contener al menos un operador/paréntesis o haber incluido '='
    if (!/[+*^xX×÷/%()-]/.test(str) && !hadEqualSign) return null;

    // Si termina en un operador binario incompleto (ej: '15 +') o '(' incompleto, esperar al siguiente número
    if (/[+*^xX×÷/-]\s*$/.test(str) || /\(\s*$/.test(str)) return null;

    // Normalizar operadores de multiplicación y división
    str = str.replace(/[xX×]/g, '*').replace(/÷/g, '/');

    // Manejo inteligente de comas y puntos:
    if (str.includes(',') && str.includes('.')) {
        str = str.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');
        if (str.includes(',')) return null;
    } else if (/(\d),(?=\d{3},)/.test(str)) {
        str = str.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');
    } else {
        str = str.replace(/(\d+),(\d+)/g, '$1.$2');
    }

    const rawTokens = [];
    let i = 0;
    while (i < str.length) {
        const ch = str[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (/[0-9.]/.test(ch)) {
            let numStr = '';
            let dotCount = 0;
            while (i < str.length && /[0-9.]/.test(str[i])) {
                if (str[i] === '.') dotCount++;
                if (dotCount > 1) return null;
                numStr += str[i];
                i++;
            }
            if (numStr === '.' || numStr.endsWith('.')) return null;
            const num = Number(numStr);
            if (!Number.isFinite(num)) return null;
            rawTokens.push({ type: 'number', value: num });
            continue;
        }
        if ('+-*/^%()'.includes(ch)) {
            rawTokens.push({ type: 'operator', value: ch });
            i++;
            continue;
        }
        return null;
    }

    if (rawTokens.length === 0) return null;

    const tokens = [];
    for (let idx = 0; idx < rawTokens.length; idx++) {
        const curr = rawTokens[idx];
        const prev = tokens[tokens.length - 1];
        if (prev) {
            const prevIsValueEnd =
                prev.type === 'number' ||
                prev.value === ')' ||
                prev.value === '%';
            const currIsParenStart = curr.value === '(';
            const prevIsCloseOrPct = prev.value === ')' || prev.value === '%';
            const currIsNumber = curr.type === 'number';

            if ((prevIsValueEnd && currIsParenStart) || (prevIsCloseOrPct && currIsNumber)) {
                tokens.push({ type: 'operator', value: '*' });
            }
        }
        tokens.push(curr);
    }

    const numberCount = tokens.filter((t) => t.type === 'number').length;
    const hasPercent = tokens.some((t) => t.value === '%');
    if (!hadEqualSign && numberCount < 2 && !hasPercent) return null;

    let pos = 0;
    const peek = () => tokens[pos];
    const consume = () => tokens[pos++];

    const parsePrimary = () => {
        if (!peek()) return null;
        if (peek().value === '(') {
            consume();
            const val = parseExpression();
            if (val === null) return null;
            if (!peek() || peek().value !== ')') return null;
            consume();
            let resultVal = val;
            let isPercent = false;
            while (peek() && peek().value === '%') {
                consume();
                resultVal = resultVal / 100;
                isPercent = true;
            }
            return { value: resultVal, isPercent };
        }
        if (peek().type === 'number') {
            let val = consume().value;
            let isPercent = false;
            while (peek() && peek().value === '%') {
                consume();
                val = val / 100;
                isPercent = true;
            }
            return { value: val, isPercent };
        }
        return null;
    };

    const parsePower = () => {
        const base = parsePrimary();
        if (!base) return null;
        if (peek() && peek().value === '^') {
            consume();
            const exp = parseFactor();
            if (!exp) return null;
            return { value: Math.pow(base.value, exp.value), isPercent: false };
        }
        return base;
    };

    const parseFactor = () => {
        if (!peek()) return null;
        if (peek().value === '+') {
            consume();
            return parseFactor();
        }
        if (peek().value === '-') {
            consume();
            const factor = parseFactor();
            return factor ? { value: -factor.value, isPercent: factor.isPercent } : null;
        }
        return parsePower();
    };

    const parseTerm = () => {
        let left = parseFactor();
        if (!left) return null;
        while (peek() && (peek().value === '*' || peek().value === '/')) {
            const op = consume().value;
            const right = parseFactor();
            if (!right) return null;
            if (op === '/') {
                if (right.value === 0) return null;
                left = { value: left.value / right.value, isPercent: false };
            } else {
                left = { value: left.value * right.value, isPercent: false };
            }
        }
        return left;
    };

    const parseExpression = () => {
        const first = parseTerm();
        if (!first) return null;
        let total = first.value;
        let leftAllPercent = first.isPercent;

        while (peek() && (peek().value === '+' || peek().value === '-')) {
            const op = consume().value;
            const right = parseTerm();
            if (!right) return null;

            if (right.isPercent && !leftAllPercent) {
                const delta = total * right.value;
                total = op === '+' ? total + delta : total - delta;
            } else {
                total = op === '+' ? total + right.value : total - right.value;
                if (!right.isPercent) leftAllPercent = false;
            }
        }
        return total;
    };

    const result = parseExpression();
    if (result === null || pos !== tokens.length) return null;
    if (!Number.isFinite(result) || Number.isNaN(result)) return null;

    return Math.round(result * 1000000) / 1000000;
};

export const evaluateSafeMath = (rawInput) => {
    const result = evaluateSafeMathNumeric(rawInput);
    if (result === null) return null;

    let expr = String(rawInput || '').trim();
    if (expr.startsWith('=')) expr = expr.slice(1).trim();
    if (expr.endsWith('=')) expr = expr.slice(0, -1).trim();

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
};

export const copyTextToClipboard = async (text) => {
    const str = String(text ?? '');
    if (!str) return false;

    if (navigator?.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(str);
            return true;
        } catch {
            // Continuar con fallback si falla en contexto no seguro (HTTP LAN)
        }
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = str;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return copied;
    } catch {
        return false;
    }
};
