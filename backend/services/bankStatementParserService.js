const crypto = require('crypto');

const CONCEPTOS_SUGERIDOS = [
    'LIQUIDACION APP PUMA PRIS',
    'REMESA CUENTA CORRIENTE SERSAPROSA',
    'TRANSFERENCIA POR TRANSFER365',
    'LIQUIDACION VERSATEC FLOTA',
    'PAGO DE PRESTAMO',
    'PAGO MINISTERIO DE HACIENDA',
    'CHEQUES COMPENSACION',
    'ARRENDAMIENTO ATM',
    'NOTA DE DEBITO X PLANILLA',
    'INTERESES',
    'COMPRA DE CHEQUERA',
    'IMPUESTO POR LIQUIDEZ'
];

const MONTH_NAME_MAP = {
    ENE: 1, JAN: 1, ENERO: 1, JANUARY: 1,
    FEB: 2, FEBRERO: 2, FEBRUARY: 2,
    MAR: 3, MARZO: 3, MARCH: 3,
    ABR: 4, APR: 4, ABRIL: 4, APRIL: 4,
    MAY: 5, MAYO: 5,
    JUN: 6, JUNIO: 6, JUNE: 6,
    JUL: 7, JULIO: 7, JULY: 7,
    AGO: 8, AUG: 8, AGOSTO: 8, AUGUST: 8,
    SEP: 9, SEPT: 9, SET: 9, SEPTIEMBRE: 9, SEPTEMBER: 9,
    OCT: 10, OCTUBRE: 10, OCTOBER: 10,
    NOV: 11, NOVIEMBRE: 11, NOVEMBER: 11,
    DIC: 12, DEC: 12, DICIEMBRE: 12, DECEMBER: 12
};

const BANK_PROFILES = {
    PROMERICA: {
        dateHeaders: ['fecha', 'fec. mov', 'fecha mov', 'fecha transaccion', 'fecha valor'],
        docHeaders: ['referencia', 'ref', 'documento', 'no. doc', 'comprobante', 'numero', 'cheque'],
        descHeaders: ['descripcion', 'concepto', 'detalle', 'movimiento'],
        debitHeaders: ['debito', 'débito', 'cargo', 'cargos', 'retiro', 'retiros', 'salida'],
        creditHeaders: ['credito', 'crédito', 'abono', 'abonos', 'deposito', 'depósito', 'entrada'],
        amountHeaders: ['monto', 'valor', 'importe'],
        balanceHeaders: ['saldo', 'balance', 'saldo disponible']
    },
    BAC: {
        dateHeaders: ['fecha', 'date', 'fecha posteo', 'fecha transaccion'],
        docHeaders: ['referencia', 'no. referencia', 'documento', 'cheque', 'numero'],
        descHeaders: ['descripcion', 'descripción', 'concepto', 'detalle'],
        debitHeaders: ['debitos', 'débitos', 'debito', 'débito', 'cargo', 'retiro'],
        creditHeaders: ['creditos', 'créditos', 'credito', 'crédito', 'abono', 'deposito'],
        amountHeaders: ['monto', 'valor'],
        balanceHeaders: ['saldo', 'balance']
    },
    AGRICOLA: {
        dateHeaders: ['fecha', 'fecha operacion', 'fecha movimiento'],
        docHeaders: ['referencia', 'comprobante', 'documento', 'numero', 'cheque'],
        descHeaders: ['concepto', 'descripcion', 'detalle'],
        debitHeaders: ['cargo', 'cargos', 'debito', 'débito', 'retiro'],
        creditHeaders: ['abono', 'abonos', 'credito', 'crédito', 'deposito'],
        amountHeaders: ['monto', 'valor'],
        balanceHeaders: ['saldo', 'saldo actual']
    },
    DAVIVIENDA: {
        dateHeaders: ['fecha', 'fecha transaccion', 'fecha movimiento'],
        docHeaders: ['documento', 'referencia', 'cheque', 'no. documento'],
        descHeaders: ['descripcion', 'concepto', 'transaccion', 'detalle'],
        debitHeaders: ['debito', 'débito', 'cargos', 'cargo', 'retiros'],
        creditHeaders: ['credito', 'crédito', 'abonos', 'abono', 'depositos'],
        amountHeaders: ['valor', 'monto'],
        balanceHeaders: ['saldo']
    },
    CUSCATLAN: {
        dateHeaders: ['fecha', 'fecha transaccion', 'fecha contable'],
        docHeaders: ['referencia', 'numero documento', 'documento', 'cheque'],
        descHeaders: ['descripcion', 'concepto', 'detalle'],
        debitHeaders: ['debito', 'débito', 'cargo', 'retiro'],
        creditHeaders: ['credito', 'crédito', 'abono', 'deposito'],
        amountHeaders: ['monto', 'valor'],
        balanceHeaders: ['saldo']
    },
    HIPOTECARIO: {
        dateHeaders: ['fecha', 'fecha movimiento'],
        docHeaders: ['comprobante', 'referencia', 'documento', 'cheque'],
        descHeaders: ['concepto', 'descripcion', 'detalle'],
        debitHeaders: ['cargo', 'debito', 'débito', 'retiro'],
        creditHeaders: ['abono', 'credito', 'crédito', 'deposito'],
        amountHeaders: ['monto', 'valor'],
        balanceHeaders: ['saldo']
    },
    ATLANTIDA: {
        dateHeaders: ['fecha', 'fecha transaccion'],
        docHeaders: ['referencia', 'documento', 'no. doc', 'cheque'],
        descHeaders: ['descripcion', 'concepto', 'detalle'],
        debitHeaders: ['debito', 'débito', 'cargo', 'retiro'],
        creditHeaders: ['credito', 'crédito', 'abono', 'deposito'],
        amountHeaders: ['monto', 'valor'],
        balanceHeaders: ['saldo']
    },
    ABANK: {
        dateHeaders: ['fecha', 'fecha movimiento'],
        docHeaders: ['referencia', 'documento', 'numero'],
        descHeaders: ['descripcion', 'concepto', 'detalle'],
        debitHeaders: ['debito', 'débito', 'cargo'],
        creditHeaders: ['credito', 'crédito', 'abono'],
        amountHeaders: ['monto', 'valor'],
        balanceHeaders: ['saldo']
    }
};

function round2(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeHeader(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s./#-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Parsea texto CSV o TSV detectando un delimitador consistente para todo el archivo
 * y respetando comillas dobles escapadas y saltos de línea dentro de celdas.
 */
function parseDelimitedRows(text) {
    if (!text || typeof text !== 'string') return [];
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Detectar delimitador predominante fuera de comillas en las primeras 10 líneas
    const sampleLines = cleanText.split('\n').filter(l => l.trim()).slice(0, 10);
    const counts = { '\t': 0, ';': 0, ',': 0 };
    for (const line of sampleLines) {
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') inQ = !inQ;
            else if (!inQ && Object.prototype.hasOwnProperty.call(counts, ch)) {
                counts[ch]++;
            }
        }
    }

    let delimiter = ',';
    if (counts['\t'] > 0 && counts['\t'] >= counts[';'] && counts['\t'] >= counts[',']) {
        delimiter = '\t';
    } else if (counts[';'] > counts[',']) {
        delimiter = ';';
    }

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            currentRow.push(currentCell.trim().replace(/^"+|"+$/g, ''));
            currentCell = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentCell.trim().replace(/^"+|"+$/g, ''));
            if (currentRow.some(c => c !== '')) {
                rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += (inQuotes && char === '\n') ? ' ' : char;
        }
    }

    if (currentCell !== '' || currentRow.length > 0) {
        currentRow.push(currentCell.trim().replace(/^"+|"+$/g, ''));
        if (currentRow.some(c => c !== '')) {
            rows.push(currentRow);
        }
    }

    return rows;
}

/**
 * Parsea montos bancarios soportando:
 * - Símbolos de moneda ($, USD, US$)
 * - Paréntesis contables: (1,250.00) -> -1250
 * - Signo al final: 1,250.00- -> -1250
 * - Formato europeo: 1.250,00 -> 1250
 * - Sufijos DB/DR/CR -> retorna { amount, hint }
 */
function parseBankAmount(cell) {
    if (cell === null || cell === undefined) return null;
    if (typeof cell === 'number') {
        return Number.isFinite(cell) ? { amount: round2(cell), hint: cell < 0 ? 'CARGO' : null } : null;
    }

    let raw = String(cell).trim();
    if (!raw || raw === '-' || raw === '--' || raw === '—') return null;

    let hint = null;
    if (/\b(DB|DR|DEB|CARGO)\b/i.test(raw)) {
        hint = 'CARGO';
        raw = raw.replace(/\b(DB|DR|DEB|CARGO)\b/gi, '').trim();
    } else if (/\b(CR|CRED|ABONO)\b/i.test(raw)) {
        hint = 'ABONO';
        raw = raw.replace(/\b(CR|CRED|ABONO)\b/gi, '').trim();
    }

    let isNegative = false;
    if (/^\(.*\)$/.test(raw)) {
        isNegative = true;
        raw = raw.slice(1, -1).trim();
    }
    if (raw.endsWith('-')) {
        isNegative = true;
        raw = raw.slice(0, -1).trim();
    }
    if (raw.startsWith('-')) {
        isNegative = true;
        raw = raw.slice(1).trim();
    } else if (raw.startsWith('+')) {
        raw = raw.slice(1).trim();
    }

    raw = raw.replace(/^(US\$|\$|USD)/i, '').replace(/\s+/g, '');
    if (!raw) return null;

    // Detectar formato numérico (US 1,234.56 vs EU 1.234,56)
    if (/^\d{1,3}(\.\d{3})+(,\d{1,4})$/.test(raw)) {
        raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (/^\d+(,\d{1,2})$/.test(raw) && !raw.includes('.')) {
        raw = raw.replace(',', '.');
    } else {
        raw = raw.replace(/,/g, '');
    }

    if (!/^\d+(\.\d+)?$/.test(raw)) return null;
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;

    const signed = isNegative ? -round2(num) : round2(num);
    if (signed < 0 && !hint) hint = 'CARGO';
    return { amount: signed, hint };
}

function isValidYMD(y, m, d) {
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
    if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}

function formatYMDParts(y, m, d) {
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Infiere si la columna de fechas usa formato MM/DD/YYYY (ej. bancos con export US) o DD/MM/YYYY.
 */
function detectDateOrderMDY(rows, dateColIdx) {
    if (dateColIdx === null || dateColIdx === undefined || dateColIdx < 0) return false;
    let dmyEvidence = 0;
    let mdyEvidence = 0;
    for (const row of rows) {
        const val = String(row[dateColIdx] || '').trim();
        const m = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
        if (!m) continue;
        const p1 = Number(m[1]);
        const p2 = Number(m[2]);
        if (p1 > 12 && p2 <= 12) dmyEvidence++;
        else if (p2 > 12 && p1 <= 12) mdyEvidence++;
    }
    return mdyEvidence > dmyEvidence;
}

/**
 * Parsea una fecha bancaria (ISO, DD/MM/YYYY, MM/DD/YYYY, DD-MMM-YYYY, o serial Excel 30000..65000).
 * Retorna YYYY-MM-DD y display DD/MM/YYYY o null si no es fecha válida.
 */
function parseBankDate(cell, preferMDY = false) {
    if (cell === null || cell === undefined) return null;
    if (cell instanceof Date) {
        if (isNaN(cell.getTime())) return null;
        const y = cell.getUTCFullYear();
        const m = cell.getUTCMonth() + 1;
        const d = cell.getUTCDate();
        if (!isValidYMD(y, m, d)) return null;
        return {
            ymd: formatYMDParts(y, m, d),
            display: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
        };
    }

    const raw = String(cell).trim();
    if (!raw) return null;

    // Serial numérico de Excel (1982 - 2077 aprox: 30000 - 65000)
    if (/^\d{5}(\.\d+)?$/.test(raw)) {
        const serial = Math.floor(Number(raw));
        if (serial >= 30000 && serial <= 65000) {
            const utcDays = serial - 25569; // 1970-01-01 = 25569 en epoch Excel (con bug 1900)
            const dt = new Date(utcDays * 86400 * 1000);
            const y = dt.getUTCFullYear();
            const m = dt.getUTCMonth() + 1;
            const d = dt.getUTCDate();
            if (isValidYMD(y, m, d)) {
                return {
                    ymd: formatYMDParts(y, m, d),
                    display: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
                };
            }
        }
    }

    // ISO YYYY-MM-DD (con hora opcional)
    const iso = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s].*)?$/);
    if (iso) {
        const y = Number(iso[1]);
        const m = Number(iso[2]);
        const d = Number(iso[3]);
        if (isValidYMD(y, m, d)) {
            return {
                ymd: formatYMDParts(y, m, d),
                display: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
            };
        }
        return null;
    }

    // Mes con texto: 15/ENE/2026, 15-Aug-26, 15 ENE 2026
    const textMonth = raw.match(/^(\d{1,2})[\s/-]([a-zA-ZáéíóúÁÉÍÓÚ]{3,12})[\s/-](\d{2,4})(?:\s.*)?$/);
    if (textMonth) {
        const d = Number(textMonth[1]);
        const monKey = textMonth[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const m = MONTH_NAME_MAP[monKey];
        const yRaw = textMonth[3];
        const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
        if (m && isValidYMD(y, m, d)) {
            return {
                ymd: formatYMDParts(y, m, d),
                display: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
            };
        }
    }

    // DD/MM/YYYY o MM/DD/YYYY (con hora opcional)
    const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+\d{1,2}:\d{2}.*)?$/);
    if (slash) {
        const p1 = Number(slash[1]);
        const p2 = Number(slash[2]);
        const yRaw = slash[3];
        const y = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
        let d = p1;
        let m = p2;
        if (preferMDY && p1 <= 12 && p2 <= 31) {
            m = p1;
            d = p2;
        } else if (p2 > 12 && p1 <= 12) {
            m = p1;
            d = p2;
        }
        if (isValidYMD(y, m, d)) {
            return {
                ymd: formatYMDParts(y, m, d),
                display: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
            };
        }
    }

    return null;
}

/**
 * Detecta la fila de encabezados y el mapeo de columnas según perfil bancario y nombres reales.
 */
function detectHeaderAndColumns(rows, bancoFormato = 'AUTO') {
    const profileKey = String(bancoFormato || 'AUTO').toUpperCase();
    const profile = BANK_PROFILES[profileKey] || null;

    const genericDate = ['fecha', 'date', 'fec', 'dia', 'fecha mov', 'fecha valor', 'fecha transaccion', 'fecha operacion'];
    const genericDoc = ['documento', 'referencia', 'ref', 'comprobante', 'cheque', 'numero', 'no. doc', 'no. referencia', 'doc', 'nro'];
    const genericDesc = ['descripcion', 'concepto', 'detalle', 'movimiento', 'narrativa', 'transaccion', 'glosa'];
    const genericDebit = ['debito', 'debitos', 'debe', 'cargo', 'cargos', 'retiro', 'retiros', 'salida', 'salidas', 'egreso'];
    const genericCredit = ['credito', 'creditos', 'haber', 'abono', 'abonos', 'deposito', 'depositos', 'entrada', 'entradas', 'ingreso'];
    const genericAmount = ['monto', 'valor', 'importe', 'total'];
    const genericType = ['tipo', 'd/c', 'dc', 'naturaleza', 'signo', 'operacion'];
    const genericBalance = ['saldo', 'balance', 'saldo disponible', 'saldo actual'];

    const matchAny = (normCell, candidates) => {
        if (!normCell) return false;
        return candidates.some(c => normCell === c || normCell.includes(c));
    };

    let headerRowIndex = -1;
    let bestScore = 0;
    let bestCols = null;

    const scanLimit = Math.min(rows.length, 25);
    for (let r = 0; r < scanLimit; r++) {
        const row = rows[r];
        if (!Array.isArray(row) || row.length < 2) continue;

        const cols = {
            fecha: null,
            documento: null,
            descripcion: null,
            cargo: null,
            abono: null,
            monto: null,
            tipo: null,
            saldo: null
        };
        let score = 0;

        for (let c = 0; c < row.length; c++) {
            const norm = normalizeHeader(row[c]);
            if (!norm) continue;

            if (cols.fecha === null && matchAny(norm, profile?.dateHeaders ? [...profile.dateHeaders, ...genericDate] : genericDate)) {
                cols.fecha = c;
                score += 2;
            } else if (cols.cargo === null && matchAny(norm, profile?.debitHeaders ? [...profile.debitHeaders, ...genericDebit] : genericDebit)) {
                cols.cargo = c;
                score += 2;
            } else if (cols.abono === null && matchAny(norm, profile?.creditHeaders ? [...profile.creditHeaders, ...genericCredit] : genericCredit)) {
                cols.abono = c;
                score += 2;
            } else if (cols.saldo === null && matchAny(norm, profile?.balanceHeaders ? [...profile.balanceHeaders, ...genericBalance] : genericBalance)) {
                cols.saldo = c;
                score += 2;
            } else if (cols.doc === undefined && cols.documento === null && matchAny(norm, profile?.docHeaders ? [...profile.docHeaders, ...genericDoc] : genericDoc)) {
                cols.documento = c;
                score += 2;
            } else if (cols.descripcion === null && matchAny(norm, profile?.descHeaders ? [...profile.descHeaders, ...genericDesc] : genericDesc)) {
                cols.descripcion = c;
                score += 2;
            } else if (cols.monto === null && matchAny(norm, profile?.amountHeaders ? [...profile.amountHeaders, ...genericAmount] : genericAmount)) {
                cols.monto = c;
                score += 2;
            } else if (cols.tipo === null && matchAny(norm, genericType)) {
                cols.tipo = c;
                score += 1;
            }
        }

        if (score > bestScore && cols.fecha !== null && (cols.cargo !== null || cols.abono !== null || cols.monto !== null || cols.descripcion !== null)) {
            bestScore = score;
            headerRowIndex = r;
            bestCols = cols;
        }
    }

    if (headerRowIndex >= 0 && bestCols) {
        return {
            hasHeaders: true,
            headerRowIndex,
            columns: bestCols
        };
    }

    return {
        hasHeaders: false,
        headerRowIndex: -1,
        columns: null
    };
}

/**
 * Determina si una celda numérica tiene formato monetario explícito (decimales, símbolo $, comas o paréntesis).
 */
function looksLikeMoneyToken(cell) {
    const s = String(cell || '').trim();
    if (!s) return false;
    return /[$(),]|\.\d{2}$/.test(s);
}

/**
 * Clasifica dirección CARGO / ABONO a partir de descripción si no viene columna separada Débito/Crédito.
 */
function inferDirectionFromDescription(descUpper) {
    if (
        descUpper.includes('TRANSFERENCIA ENVIADA') ||
        descUpper.includes('TRANSFERENCIA SALIENTE') ||
        descUpper.includes('RETIRO') ||
        descUpper.includes('CHEQUE') ||
        descUpper.includes('CHQ') ||
        descUpper.includes('COMPENSACION') ||
        descUpper.includes('PAGO DE PRESTAMO') ||
        descUpper.includes('PAGO MINISTERIO') ||
        descUpper.includes('PAGO ') ||
        descUpper.includes('DEBITO') ||
        descUpper.includes('DÉBITO') ||
        descUpper.includes('NOTA DE CARGO') ||
        descUpper.includes('CARGO') ||
        descUpper.includes('COMISION') ||
        descUpper.includes('COMISIÓN') ||
        descUpper.includes('IMPUESTO') ||
        descUpper.includes('COMPRA DE CHEQUERA') ||
        descUpper.includes('ARRENDAMIENTO') ||
        descUpper.includes('COBRADO')
    ) {
        if (descUpper.includes('DEVOLUCION DE COMISION') || descUpper.includes('REVERSO DE CARGO') || descUpper.includes('INTERESES GANADOS') || descUpper.includes('INTERESES A FAVOR')) {
            return 'ABONO';
        }
        return 'CARGO';
    }
    if (
        descUpper.includes('REMESA') ||
        descUpper.includes('ABONO') ||
        descUpper.includes('DEPOSITO') ||
        descUpper.includes('DEPÓSITO') ||
        descUpper.includes('TRANSFERENCIA RECIBIDA') ||
        descUpper.includes('ENTRANTE') ||
        descUpper.includes('LIQUIDACION') ||
        descUpper.includes('LIQUIDACIÓN') ||
        descUpper.includes('INTERESES GANADOS') ||
        descUpper.includes('INTERESES A FAVOR')
    ) {
        return 'ABONO';
    }
    return null;
}

/**
 * Verifica aritmética de saldos si el extracto incluye columna de saldo acumulado.
 * Detecta orden cronológico ascendente o descendente y corrige signos si una transacción
 * tiene saldo previo y actual consistentes.
 */
function verifyBalanceChain(transactions) {
    const withSaldo = transactions.filter(t => Number.isFinite(t.saldo) && t.saldo !== null);
    if (withSaldo.length < 2) {
        return {
            verificada: false,
            orden: 'DESCONOCIDO',
            inconsistencias: 0,
            saldo_inicial_extracto: null,
            saldo_final_extracto: withSaldo.length === 1 ? round2(withSaldo[0].saldo) : null
        };
    }

    // Evaluar orden ascendente (top = antiguo, bottom = reciente) vs descendente (top = reciente, bottom = antiguo)
    let ascMatches = 0;
    let descMatches = 0;
    for (let i = 1; i < transactions.length; i++) {
        const prev = transactions[i - 1];
        const curr = transactions[i];
        if (prev.saldo === null || curr.saldo === null) continue;

        const ascCargo = Math.abs((prev.saldo - curr.monto) - curr.saldo) < 0.02;
        const ascAbono = Math.abs((prev.saldo + curr.monto) - curr.saldo) < 0.02;
        if (ascCargo || ascAbono) ascMatches++;

        const descCargo = Math.abs((curr.saldo - prev.monto) - prev.saldo) < 0.02;
        const descAbono = Math.abs((curr.saldo + prev.monto) - prev.saldo) < 0.02;
        if (descCargo || descAbono) descMatches++;
    }

    const isAsc = ascMatches >= descMatches;
    const orden = ascMatches === 0 && descMatches === 0 ? 'NO_DETERMINADO' : (isAsc ? 'ASCENDENTE' : 'DESCENDENTE');
    let inconsistencias = 0;

    if (orden !== 'NO_DETERMINADO') {
        const startIdx = isAsc ? 1 : 0;
        const endIdx = isAsc ? transactions.length : transactions.length - 1;

        for (let i = startIdx; i < endIdx; i++) {
            const older = isAsc ? transactions[i - 1] : transactions[i + 1];
            const newer = isAsc ? transactions[i] : transactions[i];
            if (older.saldo === null || newer.saldo === null) continue;

            const delta = round2(newer.saldo - older.saldo);
            if (Math.abs(Math.abs(delta) - newer.monto) < 0.02) {
                const expectedTipo = delta < 0 ? 'CARGO' : 'ABONO';
                if (newer.tipo !== expectedTipo && !newer.direccion_explicita_columna) {
                    newer.tipo = expectedTipo;
                    newer.cargo = expectedTipo === 'CARGO' ? newer.monto : 0;
                    newer.abono = expectedTipo === 'ABONO' ? newer.monto : 0;
                    newer.tipo_remesa_codigo = expectedTipo === 'CARGO'
                        ? (newer.descripcion.includes('CHEQUE') ? 'CH' : 'NC')
                        : (newer.descripcion.includes('REMESA') ? 'RM' : 'NA');
                    newer.corregido_por_saldo = true;
                } else if (newer.tipo !== expectedTipo) {
                    newer.alerta_saldo = true;
                    inconsistencias++;
                }
            } else if (newer.monto > 0) {
                newer.alerta_saldo = true;
                inconsistencias++;
            }
        }
    }

    const firstWithSaldo = transactions.find(t => t.saldo !== null);
    const lastWithSaldo = [...transactions].reverse().find(t => t.saldo !== null);

    let saldoInicialExtracto = null;
    let saldoFinalExtracto = null;
    if (firstWithSaldo && lastWithSaldo) {
        if (orden === 'DESCENDENTE') {
            saldoFinalExtracto = round2(firstWithSaldo.saldo);
            saldoInicialExtracto = round2(
                lastWithSaldo.saldo + (lastWithSaldo.tipo === 'CARGO' ? lastWithSaldo.monto : -lastWithSaldo.monto)
            );
        } else {
            saldoFinalExtracto = round2(lastWithSaldo.saldo);
            saldoInicialExtracto = round2(
                firstWithSaldo.saldo + (firstWithSaldo.tipo === 'CARGO' ? firstWithSaldo.monto : -firstWithSaldo.monto)
            );
        }
    }

    return {
        verificada: orden !== 'NO_DETERMINADO',
        orden,
        inconsistencias,
        saldo_inicial_extracto: saldoInicialExtracto,
        saldo_final_extracto: saldoFinalExtracto
    };
}

/**
 * Parsea un extracto bancario y ejecuta cruce determinístico 1-a-1 contra pendientes y detección
 * de duplicados contra movimientos/cheques ya conciliados.
 */
function parseAndMatchBankStatement({
    rawData,
    bancoFormato = 'AUTO',
    pendientes = [],
    conciliadosExistentes = []
}) {
    let rows = [];
    let rawForHash = '';
    if (Array.isArray(rawData)) {
        rows = rawData;
        rawForHash = JSON.stringify(rawData);
    } else if (typeof rawData === 'string') {
        rows = parseDelimitedRows(rawData);
        rawForHash = rawData;
    }

    const fileHash = crypto.createHash('sha256').update(rawForHash || '').digest('hex');
    const detection = detectHeaderAndColumns(rows, bancoFormato);
    const dataRows = detection.hasHeaders ? rows.slice(detection.headerRowIndex + 1) : rows;
    const preferMDY = detection.hasHeaders && detection.columns?.fecha !== null
        ? detectDateOrderMDY(dataRows, detection.columns.fecha)
        : detectDateOrderMDY(dataRows, 0);

    const parsedTransactions = [];
    const filasDescartadas = [];

    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
        const row = dataRows[rIdx];
        const sourceLine = (detection.hasHeaders ? detection.headerRowIndex + 2 : 1) + rIdx;
        if (!Array.isArray(row) || row.every(c => String(c || '').trim() === '')) continue;

        const firstCellLower = String(row[0] || '').toLowerCase().trim();
        if (
            firstCellLower.startsWith('saldo anterior') ||
            firstCellLower.startsWith('saldo inicial') ||
            firstCellLower.startsWith('total ') ||
            firstCellLower === 'totales' ||
            firstCellLower.includes('usuario:') ||
            firstCellLower.includes('fecha de generacion')
        ) {
            filasDescartadas.push({ fila: sourceLine, motivo: 'Fila de resumen o encabezado', contenido: row.join(' | ').slice(0, 120) });
            continue;
        }

        let fechaObj = null;
        let documento = '';
        let descripcion = '';
        let cargo = 0;
        let abono = 0;
        let monto = 0;
        let saldo = null;
        let explicitColDirection = false;
        let explicitTypeHint = null;

        if (detection.hasHeaders && detection.columns) {
            const cols = detection.columns;
            fechaObj = cols.fecha !== null ? parseBankDate(row[cols.fecha], preferMDY) : null;
            if (cols.documento !== null) {
                documento = String(row[cols.documento] || '').trim().replace(/^#/, '');
            }
            if (cols.descripcion !== null) {
                descripcion = String(row[cols.descripcion] || '').trim();
            }
            if (cols.cargo !== null) {
                const pCargo = parseBankAmount(row[cols.cargo]);
                if (pCargo && Math.abs(pCargo.amount) > 0) {
                    cargo = Math.abs(pCargo.amount);
                    explicitColDirection = true;
                }
            }
            if (cols.abono !== null) {
                const pAbono = parseBankAmount(row[cols.abono]);
                if (pAbono && Math.abs(pAbono.amount) > 0) {
                    abono = Math.abs(pAbono.amount);
                    explicitColDirection = true;
                }
            }
            if (cols.monto !== null && cargo === 0 && abono === 0) {
                const pMonto = parseBankAmount(row[cols.monto]);
                if (pMonto && Math.abs(pMonto.amount) > 0) {
                    if (pMonto.amount < 0 || pMonto.hint === 'CARGO') {
                        cargo = Math.abs(pMonto.amount);
                        explicitColDirection = true;
                    } else if (pMonto.hint === 'ABONO') {
                        abono = Math.abs(pMonto.amount);
                        explicitColDirection = true;
                    } else {
                        monto = Math.abs(pMonto.amount);
                    }
                }
            }
            if (cols.tipo !== null) {
                const tipoCell = String(row[cols.tipo] || '').trim().toUpperCase();
                if (/^(D|DB|DR|DEB|DEBITO|DÉBITO|CARGO|C|-)$/i.test(tipoCell)) {
                    explicitTypeHint = 'CARGO';
                    explicitColDirection = true;
                } else if (/^(C|CR|CRED|CREDITO|CRÉDITO|ABONO|A|\+)$/i.test(tipoCell)) {
                    explicitTypeHint = 'ABONO';
                    explicitColDirection = true;
                }
            }
            if (cols.saldo !== null) {
                const pSaldo = parseBankAmount(row[cols.saldo]);
                if (pSaldo !== null) saldo = pSaldo.amount;
            }
        } else {
            // Modo heurístico sin encabezados: evitar confundir montos >= 1000 con documentos
            const numericCandidates = [];
            for (let i = 0; i < row.length; i++) {
                const cell = String(row[i] || '').trim();
                if (!cell) continue;

                if (!fechaObj) {
                    const maybeDate = parseBankDate(cell, preferMDY);
                    if (maybeDate) {
                        fechaObj = maybeDate;
                        continue;
                    }
                }

                // Documento alfanumérico o entero sin decimales/$ ni comas (y no al final como monto)
                if (!documento && !looksLikeMoneyToken(cell) && /^(?:#?[A-Z]{0,4}\d{4,14}|[A-Z0-9-]{4,14})$/i.test(cell) && !/^\d+\.\d+$/.test(cell)) {
                    // Si estamos en las últimas 2 columnas y parece un monto entero sin decimales, evaluarlo primero como monto si aún no hay monto
                    const remainingCols = row.slice(i + 1).filter(x => String(x || '').trim() !== '');
                    const looksMoreLikeDoc = remainingCols.length >= 1 || cell.startsWith('#') || /[A-Za-z-]/.test(cell) || cell.length >= 7;
                    if (looksMoreLikeDoc) {
                        documento = cell.replace(/^#/, '');
                        continue;
                    }
                }

                const parsedAmt = parseBankAmount(cell);
                if (parsedAmt !== null && !/^[A-Za-z]/.test(cell)) {
                    numericCandidates.push({ index: i, ...parsedAmt });
                    continue;
                }

                if (cell.length > 2) {
                    descripcion = descripcion ? `${descripcion} ${cell}` : cell;
                }
            }

            // Asignar montos de numericCandidates evitando confundir el último saldo con el monto
            if (numericCandidates.length === 1) {
                const c0 = numericCandidates[0];
                if (c0.amount < 0 || c0.hint === 'CARGO') {
                    cargo = Math.abs(c0.amount);
                    explicitColDirection = true;
                } else {
                    monto = Math.abs(c0.amount);
                }
            } else if (numericCandidates.length === 2) {
                const [c0, c1] = numericCandidates;
                // Usualmente [monto, saldo] o [cargo, abono]
                if ((c0.amount === 0 && c1.amount !== 0) || (c1.amount === 0 && c0.amount !== 0)) {
                    cargo = Math.abs(c0.amount);
                    abono = Math.abs(c1.amount);
                    explicitColDirection = true;
                } else {
                    if (c0.amount < 0 || c0.hint === 'CARGO') {
                        cargo = Math.abs(c0.amount);
                        explicitColDirection = true;
                    } else {
                        monto = Math.abs(c0.amount);
                    }
                    saldo = c1.amount;
                }
            } else if (numericCandidates.length >= 3) {
                const last = numericCandidates[numericCandidates.length - 1];
                const prev1 = numericCandidates[numericCandidates.length - 2];
                const prev2 = numericCandidates[numericCandidates.length - 3];
                saldo = last.amount;
                if (prev2.amount !== 0 && prev1.amount === 0) {
                    cargo = Math.abs(prev2.amount);
                    explicitColDirection = true;
                } else if (prev1.amount !== 0 && prev2.amount === 0) {
                    abono = Math.abs(prev1.amount);
                    explicitColDirection = true;
                } else if (prev2.amount > 0 && prev1.amount > 0) {
                    // Ambos > 0: probablemente [monto_o_doc, monto, saldo] -> tomar prev1 como monto
                    monto = Math.abs(prev1.amount);
                } else {
                    monto = Math.abs(prev2.amount || prev1.amount);
                }
            }
        }

        if (explicitTypeHint === 'CARGO' && monto > 0) {
            cargo = monto;
            abono = 0;
        } else if (explicitTypeHint === 'ABONO' && monto > 0) {
            abono = monto;
            cargo = 0;
        }

        if (cargo > 0 && abono === 0) {
            monto = cargo;
        } else if (abono > 0 && cargo === 0) {
            monto = abono;
        } else if (cargo > 0 && abono > 0) {
            // Fila anómala con valor tanto en cargo como abono
            monto = Math.abs(abono - cargo);
        }

        if (!fechaObj) {
            filasDescartadas.push({ fila: sourceLine, motivo: 'Sin fecha válida reconocible', contenido: row.join(' | ').slice(0, 120) });
            continue;
        }
        if (monto <= 0) {
            filasDescartadas.push({ fila: sourceLine, motivo: 'Monto igual a $0.00 o no numérico', contenido: row.join(' | ').slice(0, 120) });
            continue;
        }

        const descUpper = (descripcion || '').toUpperCase().trim();
        let tipo = 'ABONO';
        if (cargo > 0 && abono === 0) {
            tipo = 'CARGO';
        } else if (abono > 0 && cargo === 0) {
            tipo = 'ABONO';
        } else {
            tipo = inferDirectionFromDescription(descUpper) || 'ABONO';
        }

        let tipoRemesaCodigo = tipo === 'CARGO' ? 'NC' : 'RM';
        if (descUpper.includes('CHEQUE') || descUpper.includes('CHQ') || descUpper.includes('CAMARA')) {
            tipoRemesaCodigo = 'CH';
        } else if (tipo === 'CARGO') {
            tipoRemesaCodigo = 'NC';
        } else if (descUpper.includes('REMESA')) {
            tipoRemesaCodigo = 'RM';
        } else {
            tipoRemesaCodigo = 'NA';
        }

        parsedTransactions.push({
            fila_origen: sourceLine,
            fecha: fechaObj.display,
            fecha_ymd: fechaObj.ymd,
            documento,
            descripcion: descUpper,
            monto: round2(monto),
            cargo: tipo === 'CARGO' ? round2(monto) : 0,
            abono: tipo === 'ABONO' ? round2(monto) : 0,
            tipo,
            tipo_remesa_codigo: tipoRemesaCodigo,
            saldo,
            direccion_explicita_columna: explicitColDirection
        });
    }

    // Verificar cadena de saldos si existe
    const balanceCheck = verifyBalanceChain(parsedTransactions);

    // Cruce 1-a-1 contra pendientes y detección de duplicados contra conciliadosExistentes
    const usedPendingKeys = new Set();
    const normDoc = (v) => String(v || '').trim().replace(/^0+/, '').toUpperCase();
    const getPendingDir = (p) => (p.origen_tipo === 'CK' || Number(p.cargo || 0) > 0) ? 'CARGO' : 'ABONO';
    const getPendingDateYMD = (p) => {
        if (!p.fecha) return null;
        if (p.fecha instanceof Date && !isNaN(p.fecha.getTime())) {
            return p.fecha.toISOString().slice(0, 10);
        }
        const s = String(p.fecha).trim().slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    };
    const daysDiff = (ymdA, ymdB) => {
        if (!ymdA || !ymdB) return 999;
        const a = new Date(`${ymdA}T12:00:00Z`).getTime();
        const b = new Date(`${ymdB}T12:00:00Z`).getTime();
        return Math.abs(Math.round((a - b) / 86400000));
    };

    const enriched = parsedTransactions.map(tx => {
        const txDoc = normDoc(tx.documento);
        const txDir = tx.tipo;

        // 0. Verificar si ya existe conciliado (anti-duplicado por re-importación)
        const alreadyConciliated = conciliadosExistentes.find(c => {
            if (getPendingDir(c) !== txDir) return false;
            if (Math.abs(Number(c.monto || 0) - tx.monto) >= 0.01) return false;
            const cDoc = normDoc(c.documento);
            if (txDoc && cDoc && txDoc === cDoc) return true;
            const cYmd = getPendingDateYMD(c);
            return cYmd === tx.fecha_ymd;
        });

        let match = null;
        let matchType = 'NINGUNO';
        let autoConciliable = false;
        let diferenciaMonto = 0;

        if (alreadyConciliated) {
            matchType = 'YA_CONCILIADO';
            match = {
                id: alreadyConciliated.id,
                origen_tipo: alreadyConciliated.origen_tipo,
                documento: alreadyConciliated.documento,
                concepto: alreadyConciliated.concepto,
                beneficiario: alreadyConciliated.beneficiario || '',
                monto: Number(alreadyConciliated.monto || 0),
                fecha: parseBankDate(alreadyConciliated.fecha)?.display || '',
                ya_conciliado: true
            };
        } else {
            const available = pendientes.filter(p => !usedPendingKeys.has(`${p.origen_tipo}_${p.id}`) && getPendingDir(p) === txDir);

            // 1. Exacto por documento y monto (±0.01) + misma dirección
            if (txDoc) {
                match = available.find(p => normDoc(p.documento) === txDoc && Math.abs(Number(p.monto || 0) - tx.monto) < 0.01) || null;
                if (match) {
                    matchType = 'EXACTO_DOC_MONTO';
                    autoConciliable = true;
                }
            }

            // 2. Exacto por fecha cercana (±2 días) y monto único + misma dirección
            if (!match) {
                const byDateAmt = available.filter(p =>
                    Math.abs(Number(p.monto || 0) - tx.monto) < 0.01 &&
                    daysDiff(getPendingDateYMD(p), tx.fecha_ymd) <= 2
                );
                if (byDateAmt.length === 1) {
                    match = byDateAmt[0];
                    matchType = 'EXACTO_FECHA_MONTO_UNICO';
                    autoConciliable = true;
                }
            }

            // 3. Sugerido por monto único en toda la lista (requiere confirmación visual)
            if (!match) {
                const byAmt = available.filter(p => Math.abs(Number(p.monto || 0) - tx.monto) < 0.01);
                if (byAmt.length === 1) {
                    match = byAmt[0];
                    matchType = 'SUGERIDO_MONTO_UNICO';
                    autoConciliable = false;
                }
            }

            // 4. Alerta por mismo documento pero monto distinto (NO auto-conciliable)
            if (!match && txDoc) {
                const docDiffAmt = available.find(p => normDoc(p.documento) === txDoc);
                if (docDiffAmt) {
                    match = docDiffAmt;
                    matchType = 'ALERTA_DIFERENCIA_MONTO';
                    autoConciliable = false;
                    diferenciaMonto = round2(tx.monto - Number(docDiffAmt.monto || 0));
                }
            }

            if (match && matchType !== 'ALERTA_DIFERENCIA_MONTO') {
                usedPendingKeys.add(`${match.origen_tipo}_${match.id}`);
            }
        }

        const conceptoSugerido = CONCEPTOS_SUGERIDOS.find(cs =>
            tx.descripcion.includes(cs) ||
            (match && match.concepto && String(match.concepto).toUpperCase().includes(cs))
        ) || '';

        return {
            ...tx,
            documento: tx.documento || (match && matchType !== 'YA_CONCILIADO' ? match.documento : ''),
            descripcion: tx.descripcion || (match ? String(match.concepto || '').toUpperCase() : ''),
            conceptoSugerido,
            match: match ? {
                id: match.id,
                origen_tipo: match.origen_tipo,
                documento: match.documento,
                concepto: match.concepto,
                beneficiario: match.beneficiario || '',
                monto: Number(match.monto || 0),
                fecha: parseBankDate(match.fecha)?.display || '',
                ya_conciliado: matchType === 'YA_CONCILIADO'
            } : null,
            matchType,
            auto_conciliable: autoConciliable,
            es_duplicado_probable: matchType === 'YA_CONCILIADO',
            diferencia_monto: diferenciaMonto
        };
    });

    const totalCargos = round2(enriched.reduce((s, t) => s + (t.cargo || 0), 0));
    const totalAbonos = round2(enriched.reduce((s, t) => s + (t.abono || 0), 0));

    return {
        banco_formato: String(bancoFormato || 'AUTO').toUpperCase(),
        file_hash: fileHash,
        total_procesadas: enriched.length,
        columnas_detectadas: detection.hasHeaders ? {
            fila_encabezado: detection.headerRowIndex + 1,
            ...detection.columns
        } : null,
        prefer_mdy: preferMDY,
        transacciones: enriched,
        filas_descartadas: filasDescartadas,
        resumen_extracto: {
            total_filas: enriched.length,
            total_cargos: totalCargos,
            total_abonos: totalAbonos,
            neto: round2(totalAbonos - totalCargos),
            exactos_auto: enriched.filter(t => t.auto_conciliable).length,
            sugeridos_revision: enriched.filter(t => t.match && !t.auto_conciliable && !t.es_duplicado_probable && t.matchType !== 'ALERTA_DIFERENCIA_MONTO').length,
            alertas_diferencia: enriched.filter(t => t.matchType === 'ALERTA_DIFERENCIA_MONTO').length,
            duplicados_probables: enriched.filter(t => t.es_duplicado_probable).length,
            nuevos_sin_cruce: enriched.filter(t => !t.match).length,
            descartadas_count: filasDescartadas.length,
            balance_chain: balanceCheck
        },
        conceptos_sugeridos: CONCEPTOS_SUGERIDOS
    };
}

module.exports = {
    CONCEPTOS_SUGERIDOS,
    parseDelimitedRows,
    parseBankAmount,
    parseBankDate,
    detectDateOrderMDY,
    detectHeaderAndColumns,
    verifyBalanceChain,
    parseAndMatchBankStatement
};
