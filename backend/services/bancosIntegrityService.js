const crypto = require('crypto');
const { formatDateYMD, getElSalvadorTodayYMD } = require('../utils/dateSv');
const { isAdminUser } = require('../middleware/auth');

/**
 * Redondeo monetario exacto a 2 decimales evitando ruido de coma flotante.
 */
function round2(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Parsea un monto monetario estricto (> 0). Retorna null si es inválido, <= 0 o no finito.
 */
function parseStrictPositiveAmount(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'string') {
        const cleaned = val.trim().replace(/[$,\s]/g, '');
        if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
        const num = Number(cleaned);
        if (!Number.isFinite(num) || num <= 0) return null;
        return round2(num);
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return null;
    return round2(num);
}

/**
 * Parsea un monto monetario no negativo (>= 0). Retorna null si es inválido, < 0 o no finito.
 */
function parseStrictNonNegativeAmount(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'string') {
        const cleaned = val.trim().replace(/[$,\s]/g, '');
        if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
        const num = Number(cleaned);
        if (!Number.isFinite(num) || num < 0) return null;
        return round2(num);
    }
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0) return null;
    return round2(num);
}

/**
 * Parsea un monto monetario finito cualquiera (permite negativos para sobregiros).
 */
function parseStrictFiniteAmount(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'string') {
        const cleaned = val.trim().replace(/[$,\s]/g, '');
        if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
        const num = Number(cleaned);
        if (!Number.isFinite(num)) return null;
        return round2(num);
    }
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return round2(num);
}

/**
 * Valida que una terna (year, month, day) corresponda a una fecha real del calendario gregoriano.
 */
function isValidCalendarYMD(y, m, d) {
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() + 1 === m &&
        dt.getUTCDate() === d
    );
}

/**
 * Parsea estrictamente una fecha hacia formato YYYY-MM-DD validando calendario real.
 * Rechaza fechas imposibles como 2026-02-30 o 2026-25-08.
 */
function parseStrictDBDate(dateStr) {
    if (dateStr === null || dateStr === undefined || dateStr === '') return null;
    if (dateStr instanceof Date) {
        if (isNaN(dateStr.getTime())) return null;
        const ymd = formatDateYMD(dateStr);
        if (!ymd) return null;
        const [y, m, d] = ymd.split('-').map(Number);
        return isValidCalendarYMD(y, m, d) ? ymd : null;
    }

    const str = String(dateStr).trim();
    if (!str) return null;

    // ISO YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss...
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (isoMatch) {
        const y = Number(isoMatch[1]);
        const m = Number(isoMatch[2]);
        const d = Number(isoMatch[3]);
        if (!isValidCalendarYMD(y, m, d)) return null;
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // DD/MM/YYYY o DD/MM/YY o DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    if (dmyMatch) {
        const d = Number(dmyMatch[1]);
        const m = Number(dmyMatch[2]);
        const rawY = dmyMatch[3];
        const y = rawY.length === 2 ? 2000 + Number(rawY) : Number(rawY);
        if (!isValidCalendarYMD(y, m, d)) return null;
        return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    return null;
}

/**
 * Fuente única de verdad para dirección contable de movimientos bancarios (CARGO vs ABONO).
 * - Códigos de débito: NC, ND, CH, 02
 * - Códigos de crédito: RM, NA, 01, 03
 * - Transferencia (TR / TRANSFERENCIA): respeta estrictamente el `tipo` explícito ('CARGO' | 'ABONO')
 */
function normalizeMovementDirection({ tipo, codRemesa, cod_remesa, descripcion } = {}) {
    const cod = String(codRemesa || cod_remesa || '').trim().toUpperCase();
    const rawTipo = String(tipo || '').trim().toUpperCase();

    if (cod === 'NC' || cod === 'ND' || cod === 'CH' || cod === '02') {
        return 'CARGO';
    }
    if (cod === 'RM' || cod === 'NA' || cod === '01' || cod === '03') {
        return 'ABONO';
    }

    if (cod === 'TR' || cod === 'TRANSFERENCIA' || cod === '04') {
        if (rawTipo === 'CARGO' || rawTipo === 'ABONO') return rawTipo;
        const descUp = String(descripcion || '').toUpperCase();
        if (descUp.includes('TRANSFERENCIA A ') || descUp.includes('DEBITO') || descUp.includes('SALIDA')) {
            return 'CARGO';
        }
        return 'ABONO';
    }

    if (rawTipo === 'CARGO' || rawTipo === 'ABONO') {
        return rawTipo;
    }

    const descUp = String(descripcion || '').toUpperCase();
    if (descUp.includes('CARGO') || descUp.includes('DEBITO') || descUp.includes('CHEQUE')) {
        return 'CARGO';
    }
    return 'ABONO';
}

/**
 * Calcula huella determinística SHA-256 para detectar duplicados de movimientos bancarios.
 */
function computeMovementFingerprint({ cuentaBancariaId, fecha, documento, cargo, abono, concepto }) {
    const cta = String(Number(cuentaBancariaId) || 0);
    const f = parseStrictDBDate(fecha) || String(fecha || '').trim().slice(0, 10);
    const doc = String(documento || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const c = round2(cargo || 0).toFixed(2);
    const a = round2(abono || 0).toFixed(2);
    const conc = String(concepto || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 140);
    const raw = `${cta}|${f}|${doc}|${c}|${a}|${conc}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Calcula el resumen contable y de conciliación completo de una cuenta bancaria hasta `dbHasta`.
 * Fórmula oficial:
 *   saldo_chequera = saldo_inicial + total_abonos_libros - total_cargos_libros - total_cheques_libros
 *   saldo_conciliado_libros = saldo_chequera - abonos_en_transito + (cargos_en_transito + cheques_en_transito)
 */
async function computeAccountReconciliationSummary(dbOrConn, cuentaId, dbHasta) {
    const [[cta]] = await dbOrConn.query(
        'SELECT id, saldo_inicial, fecha_saldo_inicial FROM cuentas_bancarias WHERE id = ? LIMIT 1',
        [cuentaId]
    );
    if (!cta) {
        return null;
    }

    const saldoInicial = round2(cta.saldo_inicial || 0);
    const fechaSaldoInicial = cta.fecha_saldo_inicial ? parseStrictDBDate(cta.fecha_saldo_inicial) : null;

    const movParams = [dbHasta, dbHasta, cuentaId, dbHasta];
    let movDateFloorSql = '';
    if (fechaSaldoInicial) {
        movDateFloorSql = ' AND fecha >= ?';
        movParams.push(fechaSaldoInicial);
    }

    const [[movAgg]] = await dbOrConn.query(
        `SELECT
            COALESCE(SUM(abono), 0) AS total_abonos_libros,
            COALESCE(SUM(cargo), 0) AS total_cargos_libros,
            COALESCE(SUM(CASE WHEN fecha_aplicado IS NULL OR fecha_aplicado > ? THEN abono ELSE 0 END), 0) AS abonos_en_transito,
            COALESCE(SUM(CASE WHEN fecha_aplicado IS NULL OR fecha_aplicado > ? THEN cargo ELSE 0 END), 0) AS cargos_en_transito
         FROM movimientos_bancarios
         WHERE cuenta_bancaria_id = ?
           AND deleted_at IS NULL
           AND fecha <= ?${movDateFloorSql}`,
        movParams
    );

    const chkParams = [dbHasta, cuentaId, dbHasta];
    let chkDateFloorSql = '';
    if (fechaSaldoInicial) {
        chkDateFloorSql = ' AND fecha >= ?';
        chkParams.push(fechaSaldoInicial);
    }

    const [[chkAgg]] = await dbOrConn.query(
        `SELECT
            COALESCE(SUM(valor), 0) AS total_cheques_libros,
            COALESCE(SUM(CASE WHEN fecha_aplicado IS NULL OR fecha_aplicado > ? THEN valor ELSE 0 END), 0) AS cheques_en_transito
         FROM cheques
         WHERE cuenta_bancaria_id = ?
           AND deleted_at IS NULL
           AND cheque_anulado = FALSE
           AND fue_noemitido = FALSE
           AND es_reservado = FALSE
           AND fecha <= ?${chkDateFloorSql}`,
        chkParams
    );

    const resParams = [cuentaId, dbHasta];
    let resDateFloorSql = '';
    if (fechaSaldoInicial) {
        resDateFloorSql = ' AND fecha >= ?';
        resParams.push(fechaSaldoInicial);
    }

    const [[resAgg]] = await dbOrConn.query(
        `SELECT
            COUNT(*) AS cheques_reservados_count,
            COALESCE(SUM(valor), 0) AS cheques_reservados_monto
         FROM cheques
         WHERE cuenta_bancaria_id = ?
           AND deleted_at IS NULL
           AND cheque_anulado = FALSE
           AND fue_noemitido = FALSE
           AND es_reservado = TRUE
           AND fecha <= ?${resDateFloorSql}`,
        resParams
    );

    const totalAbonosLibros = round2(movAgg?.total_abonos_libros || 0);
    const totalCargosLibros = round2(movAgg?.total_cargos_libros || 0);
    const totalChequesLibros = round2(chkAgg?.total_cheques_libros || 0);

    const abonosEnTransito = round2(movAgg?.abonos_en_transito || 0);
    const cargosEnTransito = round2(movAgg?.cargos_en_transito || 0);
    const chequesEnTransito = round2(chkAgg?.cheques_en_transito || 0);
    const cargosChequesEnTransito = round2(cargosEnTransito + chequesEnTransito);

    const saldoChequera = round2(saldoInicial + totalAbonosLibros - totalCargosLibros - totalChequesLibros);
    const saldoConciliadoLibros = round2(saldoChequera - abonosEnTransito + cargosChequesEnTransito);

    return {
        saldo_inicial: saldoInicial,
        fecha_saldo_inicial: fechaSaldoInicial,
        total_abonos_libros: totalAbonosLibros,
        total_cargos_libros: totalCargosLibros,
        total_cheques_libros: totalChequesLibros,
        saldo_chequera: saldoChequera,
        abonos_en_transito: abonosEnTransito,
        cargos_en_transito: cargosEnTransito,
        cheques_en_transito: chequesEnTransito,
        cargos_cheques_en_transito: cargosChequesEnTransito,
        saldo_conciliado_libros: saldoConciliadoLibros,
        cheques_reservados_count: Number(resAgg?.cheques_reservados_count || 0),
        cheques_reservados_monto: round2(resAgg?.cheques_reservados_monto || 0)
    };
}

function parseYmdUtcMs(ymd) {
    const clean = parseStrictDBDate(ymd);
    if (!clean) return null;
    const [y, m, d] = clean.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
}

const AGING_BUCKETS_META = [
    { key: '0-30', label: '0-30 días' },
    { key: '31-90', label: '31-90 días' },
    { key: '91-180', label: '91-180 días' },
    { key: '>180', label: '>180 días (Caducos)' }
];

/**
 * Clasifica la antigüedad de un cheque en circulación respecto a `fechaReferencia` (hoy SV por defecto).
 * Buckets oficiales: '0-30', '31-90', '91-180', '>180'.
 */
function classifyCheckAging(fechaEmision, fechaReferencia = null) {
    const emiYmd = parseStrictDBDate(fechaEmision);
    const refYmd = parseStrictDBDate(fechaReferencia) || getElSalvadorTodayYMD();

    if (!emiYmd) {
        return {
            dias_circulacion: null,
            dias: null,
            aging_bucket: 'SIN_FECHA',
            bucket: 'SIN_FECHA',
            label: 'Sin fecha',
            severity: 'normal',
            por_caducar: false,
            caduco: false
        };
    }

    const emiMs = parseYmdUtcMs(emiYmd);
    const refMs = parseYmdUtcMs(refYmd);
    const rawDias = Math.floor((refMs - emiMs) / 86400000);
    const dias = Math.max(0, rawDias);

    let bucket = '0-30';
    let label = '0-30 días';
    let severity = 'normal';
    let porCaducar = false;
    let caduco = false;

    if (dias <= 30) {
        bucket = '0-30';
        label = '0-30 días';
        severity = 'normal';
    } else if (dias <= 90) {
        bucket = '31-90';
        label = '31-90 días';
        severity = 'info';
    } else if (dias <= 180) {
        bucket = '91-180';
        label = '91-180 días';
        porCaducar = dias >= 150;
        severity = porCaducar ? 'warning_expiring' : 'warning';
    } else {
        bucket = '>180';
        label = '>180 días (Caducos)';
        caduco = true;
        severity = 'danger';
    }

    return {
        dias_circulacion: dias,
        dias,
        aging_bucket: bucket,
        bucket,
        label,
        severity,
        por_caducar: porCaducar,
        caduco
    };
}

/**
 * Resume la antigüedad de una lista de cheques válidos en circulación, excluyendo anulados/no emitidos/reservados/eliminados.
 */
function summarizeChecksAging(cheques = [], fechaReferencia = null) {
    const refYmd = parseStrictDBDate(fechaReferencia) || getElSalvadorTodayYMD();
    const buckets = {};
    for (const meta of AGING_BUCKETS_META) {
        buckets[meta.key] = { count: 0, total_monto: 0, label: meta.label };
    }

    let totalCheques = 0;
    let totalMonto = 0;
    let porCaducarCount = 0;
    let porCaducarMonto = 0;
    let caducosCount = 0;
    let caducosMonto = 0;

    for (const ch of (Array.isArray(cheques) ? cheques : [])) {
        if (!ch) continue;
        if (Boolean(ch.cheque_anulado) || Boolean(ch.fue_noemitido) || Boolean(ch.es_reservado) || Boolean(ch.deleted_at)) {
            continue;
        }
        const monto = round2(ch.valor ?? ch.monto ?? ch.cargo ?? 0);
        const aging = classifyCheckAging(ch.fecha, refYmd);

        totalCheques += 1;
        totalMonto = round2(totalMonto + monto);

        if (buckets[aging.bucket]) {
            buckets[aging.bucket].count += 1;
            buckets[aging.bucket].total_monto = round2(buckets[aging.bucket].total_monto + monto);
        }

        if (aging.por_caducar) {
            porCaducarCount += 1;
            porCaducarMonto = round2(porCaducarMonto + monto);
        }
        if (aging.caduco) {
            caducosCount += 1;
            caducosMonto = round2(caducosMonto + monto);
        }
    }

    const bucketsList = AGING_BUCKETS_META.map(meta => ({
        bucket: meta.key,
        label: meta.label,
        count: buckets[meta.key].count,
        total_monto: buckets[meta.key].total_monto
    }));

    return {
        fecha_referencia: refYmd,
        total_cheques: totalCheques,
        total_monto: totalMonto,
        por_caducar_count: porCaducarCount,
        por_caducar_monto: porCaducarMonto,
        caducos_count: caducosCount,
        caducos_monto: caducosMonto,
        buckets,
        buckets_list: bucketsList
    };
}

/**
 * Obtiene resumen en vivo de saldo en chequera, saldo conciliado en libros, último cheque y talonario activo.
 */
async function getLiveAccountCheckbookSummary(dbOrConn, cuentaId, options = {}) {
    const id = parseInt(cuentaId, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }

    const dbHasta = parseStrictDBDate(options?.hasta) || '2099-12-31';
    const summary = await computeAccountReconciliationSummary(dbOrConn, id, dbHasta);
    if (!summary) {
        return null;
    }

    let ultimoNumeroCheque = null;
    let nextFromChecks = null;

    const [numRows] = await dbOrConn.query(
        `SELECT cheque
         FROM cheques
         WHERE cuenta_bancaria_id = ?
           AND deleted_at IS NULL
           AND cheque IS NOT NULL
           AND TRIM(cheque) <> ''
           AND cheque REGEXP '^[0-9]+$'
         ORDER BY CAST(TRIM(cheque) AS UNSIGNED) DESC, id DESC
         LIMIT 1`,
        [id]
    );

    if (numRows && numRows.length > 0 && numRows[0].cheque !== null && numRows[0].cheque !== undefined) {
        const raw = String(numRows[0].cheque).trim();
        if (raw) {
            ultimoNumeroCheque = raw;
            if (/^\d+$/.test(raw)) {
                const nextInt = parseInt(raw, 10) + 1;
                nextFromChecks = raw.startsWith('0') && String(nextInt).length <= raw.length
                    ? String(nextInt).padStart(raw.length, '0')
                    : String(nextInt);
            }
        }
    } else {
        const [anyRows] = await dbOrConn.query(
            `SELECT cheque
             FROM cheques
             WHERE cuenta_bancaria_id = ?
               AND deleted_at IS NULL
               AND cheque IS NOT NULL
               AND TRIM(cheque) <> ''
             ORDER BY id DESC
             LIMIT 1`,
            [id]
        );
        if (anyRows && anyRows.length > 0 && anyRows[0].cheque) {
            ultimoNumeroCheque = String(anyRows[0].cheque).trim() || null;
        }
    }

    let talonarioActivo = null;
    try {
        const [talRows] = await dbOrConn.query(
            `SELECT id, cuenta_bancaria_id, serie, desde, hasta, siguiente_correlativo, alerta_stock_bajo, activo
             FROM chequeras
             WHERE cuenta_bancaria_id = ? AND activo = 1
             ORDER BY (siguiente_correlativo <= hasta) DESC, id ASC
             LIMIT 1`,
            [id]
        );
        if (talRows && talRows.length > 0) {
            const t = talRows[0];
            const desde = Number(t.desde);
            const hastaNum = Number(t.hasta);
            const sigNum = Number(t.siguiente_correlativo);
            const alertaThreshold = Number(t.alerta_stock_bajo ?? 10);
            const restantes = sigNum > hastaNum ? 0 : Math.max(0, hastaNum - sigNum + 1);
            const agotado = sigNum > hastaNum || restantes === 0;
            const stockBajo = restantes <= alertaThreshold;
            talonarioActivo = {
                id: Number(t.id),
                serie: t.serie || '',
                desde,
                hasta: hastaNum,
                siguiente_correlativo: sigNum,
                alerta_stock_bajo: alertaThreshold,
                disponibles: restantes,
                restantes,
                agotado,
                stock_bajo: stockBajo
            };
        }
    } catch (err) {
        if (!err || (err.code !== 'ER_NO_SUCH_TABLE' && err.errno !== 1146)) {
            throw err;
        }
    }

    let siguienteCorrelativo = nextFromChecks;
    if (talonarioActivo && !talonarioActivo.agotado) {
        const rawTal = String(talonarioActivo.siguiente_correlativo);
        if (ultimoNumeroCheque && /^\d+$/.test(ultimoNumeroCheque) && ultimoNumeroCheque.startsWith('0') && rawTal.length < ultimoNumeroCheque.length) {
            siguienteCorrelativo = rawTal.padStart(ultimoNumeroCheque.length, '0');
        } else {
            siguienteCorrelativo = rawTal;
        }
    }

    return {
        cuenta_id: id,
        saldo_chequera: summary.saldo_chequera,
        saldo_conciliado_libros: summary.saldo_conciliado_libros,
        ultimo_numero_cheque: ultimoNumeroCheque,
        siguiente_correlativo: siguienteCorrelativo,
        talonario_activo: talonarioActivo
    };
}

/**
 * Avanza atómicamente el correlativo de la chequera/talonario activo al emitir un cheque dentro de una transacción.
 */
async function consumeTalonarioNumber(conn, { cuentaBancariaId, chequeNumero, chequeraId = null }) {
    const rawNum = String(chequeNumero || '').trim();
    if (!/^\d+$/.test(rawNum)) {
        return { chequeraId: null, talonarioAlerta: null };
    }
    const numInt = parseInt(rawNum, 10);

    try {
        let rows = [];
        if (chequeraId) {
            [rows] = await conn.query(
                `SELECT id, serie, desde, hasta, siguiente_correlativo, alerta_stock_bajo
                 FROM chequeras
                 WHERE id = ? AND cuenta_bancaria_id = ? AND activo = 1
                 LIMIT 1
                 FOR UPDATE`,
                [chequeraId, cuentaBancariaId]
            );
        } else {
            [rows] = await conn.query(
                `SELECT id, serie, desde, hasta, siguiente_correlativo, alerta_stock_bajo
                 FROM chequeras
                 WHERE cuenta_bancaria_id = ? AND activo = 1 AND ? BETWEEN desde AND hasta
                 ORDER BY id ASC
                 LIMIT 1
                 FOR UPDATE`,
                [cuentaBancariaId, numInt]
            );
        }

        if (!rows || rows.length === 0) {
            return { chequeraId: null, talonarioAlerta: null };
        }

        const row = rows[0];
        const desde = Number(row.desde);
        const hasta = Number(row.hasta);
        if (numInt < desde || numInt > hasta) {
            return { chequeraId: null, talonarioAlerta: null };
        }

        const newNext = Math.max(Number(row.siguiente_correlativo), numInt + 1);
        await conn.query(
            'UPDATE chequeras SET siguiente_correlativo = ? WHERE id = ?',
            [newNext, row.id]
        );

        const restantes = newNext > hasta ? 0 : Math.max(0, hasta - newNext + 1);
        const threshold = Number(row.alerta_stock_bajo ?? 10);
        const talonarioAlerta = restantes <= threshold
            ? {
                chequera_id: Number(row.id),
                serie: row.serie || '',
                restantes,
                hasta,
                agotado: restantes === 0
            }
            : null;

        return { chequeraId: Number(row.id), talonarioAlerta };
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)) {
            return { chequeraId: null, talonarioAlerta: null };
        }
        throw err;
    }
}

/**
 * Genera el Libro Auxiliar Unificado (Kardex Bancario) combinando movimientos_bancarios y cheques válidos
 * cronológicamente con Saldo Inicial del período y Saldo Corrido línea por línea.
 */
async function computeAccountLedgerKardex(dbOrConn, options = {}) {
    const targetCuentaId = parseInt(options.cuentaId ?? options.cuenta_bancaria_id, 10);
    if (!Number.isInteger(targetCuentaId) || targetCuentaId <= 0) {
        return null;
    }

    const [[cta]] = await dbOrConn.query(
        'SELECT id, empresa_id, numero, nombre, saldo_inicial, fecha_saldo_inicial FROM cuentas_bancarias WHERE id = ? LIMIT 1',
        [targetCuentaId]
    );
    if (!cta) {
        return null;
    }

    const dbHasta = parseStrictDBDate(options.hasta) || getElSalvadorTodayYMD();
    const rawDesde = parseStrictDBDate(options.desde) || '2000-01-01';
    const floorDate = cta.fecha_saldo_inicial ? parseStrictDBDate(cta.fecha_saldo_inicial) : null;
    const effectiveDesde = floorDate && rawDesde < floorDate ? floorDate : rawDesde;

    const priorUpperBound = effectiveDesde <= dbHasta ? effectiveDesde : dbHasta;
    const priorOp = effectiveDesde <= dbHasta ? '<' : '<=';

    const priorMovParams = [targetCuentaId, priorUpperBound];
    let priorMovFloorSql = '';
    if (floorDate) {
        priorMovFloorSql = ' AND fecha >= ?';
        priorMovParams.push(floorDate);
    }
    const [[priorMovAgg]] = await dbOrConn.query(
        `SELECT COALESCE(SUM(abono), 0) AS sum_abono, COALESCE(SUM(cargo), 0) AS sum_cargo
         FROM movimientos_bancarios
         WHERE cuenta_bancaria_id = ?
           AND deleted_at IS NULL
           AND fecha ${priorOp} ?${priorMovFloorSql}`,
        priorMovParams
    );

    const priorChkParams = [targetCuentaId, priorUpperBound];
    let priorChkFloorSql = '';
    if (floorDate) {
        priorChkFloorSql = ' AND fecha >= ?';
        priorChkParams.push(floorDate);
    }
    const [[priorChkAgg]] = await dbOrConn.query(
        `SELECT COALESCE(SUM(valor), 0) AS sum_valor
         FROM cheques
         WHERE cuenta_bancaria_id = ?
           AND deleted_at IS NULL
           AND cheque_anulado = FALSE
           AND fue_noemitido = FALSE
           AND es_reservado = FALSE
           AND fecha ${priorOp} ?${priorChkFloorSql}`,
        priorChkParams
    );

    const saldoInicialPeriodo = round2(
        round2(cta.saldo_inicial || 0) +
        round2(priorMovAgg?.sum_abono || 0) -
        round2(priorMovAgg?.sum_cargo || 0) -
        round2(priorChkAgg?.sum_valor || 0)
    );

    let movRows = [];
    let chkRows = [];
    if (effectiveDesde <= dbHasta) {
        [movRows] = await dbOrConn.query(
            `SELECT m.id, m.fecha, m.fecha_aplicado, m.documento, m.concepto, m.cargo, m.abono, m.monto,
                    m.tipo_remesa_id, m.cod_cta, m.num_partida, m.es_contabilizado, m.comprobante_url,
                    tr.codigo AS cod_remesa, tr.descripcion AS tipo_remesa_desc
             FROM movimientos_bancarios m
             LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id
             WHERE m.cuenta_bancaria_id = ?
               AND m.deleted_at IS NULL
               AND m.fecha BETWEEN ? AND ?
             ORDER BY m.fecha ASC, m.id ASC`,
            [targetCuentaId, effectiveDesde, dbHasta]
        );

        [chkRows] = await dbOrConn.query(
            `SELECT ch.id, ch.fecha, ch.fecha_aplicado, ch.cheque, ch.valor, ch.a_nombre, ch.concepto,
                    ch.num_partida, ch.es_contabilizado, ch.es_pago_contado, ch.llave
             FROM cheques ch
             WHERE ch.cuenta_bancaria_id = ?
               AND ch.deleted_at IS NULL
               AND ch.cheque_anulado = FALSE
               AND ch.fue_noemitido = FALSE
               AND ch.es_reservado = FALSE
               AND ch.fecha BETWEEN ? AND ?
             ORDER BY ch.fecha ASC, ch.id ASC`,
            [targetCuentaId, effectiveDesde, dbHasta]
        );
    }

    const combined = [
        ...(movRows || []).map(m => ({
            origen_tipo: 'MOV',
            id: Number(m.id),
            fecha: parseStrictDBDate(m.fecha),
            fecha_aplicado: m.fecha_aplicado ? parseStrictDBDate(m.fecha_aplicado) : null,
            documento: m.documento || '',
            concepto: m.concepto || '',
            beneficiario: null,
            cod_remesa: m.cod_remesa || null,
            tipo_remesa_desc: m.tipo_remesa_desc || null,
            num_partida: m.num_partida || null,
            cod_cta: m.cod_cta || null,
            abono: round2(m.abono || 0),
            cargo: round2(m.cargo || 0),
            comprobante_url: m.comprobante_url || null,
            es_contabilizado: Boolean(m.es_contabilizado)
        })),
        ...(chkRows || []).map(c => ({
            origen_tipo: 'CK',
            id: Number(c.id),
            fecha: parseStrictDBDate(c.fecha),
            fecha_aplicado: c.fecha_aplicado ? parseStrictDBDate(c.fecha_aplicado) : null,
            documento: c.cheque ? String(c.cheque) : (c.llave || ''),
            concepto: c.concepto || '',
            beneficiario: c.a_nombre || '',
            cod_remesa: 'CK',
            tipo_remesa_desc: 'CHEQUE',
            num_partida: c.num_partida || null,
            cod_cta: null,
            abono: 0,
            cargo: round2(c.valor || 0),
            comprobante_url: null,
            es_contabilizado: Boolean(c.es_contabilizado)
        }))
    ];

    combined.sort((a, b) => {
        const dateCmp = String(a.fecha || '').localeCompare(String(b.fecha || ''));
        if (dateCmp !== 0) return dateCmp;
        const typeOrderA = a.origen_tipo === 'MOV' ? 0 : 1;
        const typeOrderB = b.origen_tipo === 'MOV' ? 0 : 1;
        if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
        return a.id - b.id;
    });

    let running = saldoInicialPeriodo;
    const withRunning = combined.map(item => {
        running = round2(running + item.abono - item.cargo);
        const conciliado = Boolean(item.fecha_aplicado && item.fecha_aplicado <= dbHasta);
        return {
            ...item,
            conciliado,
            estado_conciliacion: conciliado ? 'CONCILIADO' : 'EN_TRANSITO',
            saldo_corrido: running
        };
    });

    const estadoRaw = String(options.estado || 'TODOS').trim().toUpperCase();
    const estadoNorm = estadoRaw === 'CONCILIADO' ? 'CONCILIADOS' : estadoRaw;
    const searchNorm = String(options.search || '').trim().toLowerCase();

    const filtered = withRunning.filter(item => {
        if (estadoNorm === 'CONCILIADOS') {
            if (!item.conciliado) return false;
        } else if (estadoNorm === 'EN_TRANSITO') {
            if (item.conciliado) return false;
        }
        if (searchNorm) {
            const haystack = [
                item.documento,
                item.concepto,
                item.beneficiario,
                item.num_partida,
                item.cod_remesa
            ].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(searchNorm)) return false;
        }
        return true;
    });

    const totalAbonos = round2(withRunning.reduce((s, r) => s + r.abono, 0));
    const totalCargos = round2(withRunning.reduce((s, r) => s + r.cargo, 0));
    const netoPeriodo = round2(totalAbonos - totalCargos);
    const saldoFinalPeriodo = running;

    const hasActiveFilter = estadoNorm !== 'TODOS' || Boolean(searchNorm);
    const filteredAbonos = round2(filtered.reduce((s, r) => s + r.abono, 0));
    const filteredCargos = round2(filtered.reduce((s, r) => s + r.cargo, 0));
    const filteredNeto = round2(filteredAbonos - filteredCargos);

    const total = filtered.length;
    const exportAll = Boolean(options.exportAll);
    const safeLimit = Math.min(2000, Math.max(1, parseInt(options.limit, 10) || 100));
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const safePage = Math.min(totalPages, Math.max(1, parseInt(options.page, 10) || 1));

    const items = exportAll
        ? filtered
        : filtered.slice((safePage - 1) * safeLimit, safePage * safeLimit);

    return {
        cuenta: {
            id: Number(cta.id),
            empresa_id: Number(cta.empresa_id),
            numero: cta.numero || '',
            nombre: cta.nombre || '',
            saldo_inicial: round2(cta.saldo_inicial || 0),
            fecha_saldo_inicial: floorDate
        },
        periodo: {
            desde: effectiveDesde,
            hasta: dbHasta,
            estado: estadoNorm
        },
        items,
        totales: {
            saldo_inicial_periodo: saldoInicialPeriodo,
            total_abonos: totalAbonos,
            total_cargos: totalCargos,
            neto_periodo: netoPeriodo,
            saldo_final_periodo: saldoFinalPeriodo
        },
        totales_filtrados: hasActiveFilter ? {
            total_abonos: filteredAbonos,
            total_cargos: filteredCargos,
            neto_periodo: filteredNeto,
            cantidad_items: total
        } : null,
        pagination: {
            page: exportAll ? 1 : safePage,
            limit: exportAll ? total : safeLimit,
            total,
            total_pages: exportAll ? 1 : totalPages,
            export_all: exportAll
        }
    };
}

/**
 * Verifica si alguna de las fechas indicadas pertenece a un período cerrado (estado = 'CERRADO').
 */
async function isDateInClosedPeriod(conn, cuentaId, datesArray = []) {
    let rows = [];
    try {
        [rows] = await conn.query(
            `SELECT id, cuenta_bancaria_id, fecha_corte, estado, cerrado_por_nombre, cerrado_at
             FROM conciliacion_periodos
             WHERE cuenta_bancaria_id = ? AND estado = 'CERRADO'
             ORDER BY fecha_corte DESC
             LIMIT 1`,
            [cuentaId]
        );
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)) {
            return { closed: false, periodo: null, lockedDate: null };
        }
        throw err;
    }

    if (!rows || rows.length === 0) {
        return { closed: false, periodo: null, lockedDate: null };
    }

    const periodo = rows[0];
    const lockedDate = parseStrictDBDate(periodo.fecha_corte);
    if (!lockedDate) {
        return { closed: false, periodo: null, lockedDate: null };
    }

    const validDates = (Array.isArray(datesArray) ? datesArray : [datesArray])
        .map(d => parseStrictDBDate(d))
        .filter(Boolean);

    const hitDate = validDates.find(d => d <= lockedDate);
    if (hitDate) {
        return { closed: true, periodo, lockedDate, offendingDate: hitDate };
    }

    return { closed: false, periodo, lockedDate };
}

/**
 * Registra un evento detallado before/after en `bancos_auditoria_detalle` dentro de la transacción activa.
 */
async function recordBankAudit(conn, {
    cuentaBancariaId = null,
    entidad,
    entidadId = null,
    accion,
    user = null,
    ipAddress = null,
    motivo = null,
    before = null,
    after = null,
    metadata = null
}) {
    const userId = user?.id || null;
    const username = user?.username || user?.nombre || 'sistema';
    try {
        await conn.query(
            `INSERT INTO bancos_auditoria_detalle
                (cuenta_bancaria_id, entidad, entidad_id, accion, user_id, username, ip_address, motivo, before_json, after_json, metadata_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                cuentaBancariaId ? Number(cuentaBancariaId) : null,
                String(entidad || 'bancos').slice(0, 60),
                entidadId !== null && entidadId !== undefined ? String(entidadId).slice(0, 64) : null,
                String(accion || 'UPDATE').slice(0, 50),
                userId,
                String(username).slice(0, 100),
                ipAddress ? String(ipAddress).slice(0, 45) : null,
                motivo ? String(motivo).slice(0, 255) : null,
                before !== null && before !== undefined ? JSON.stringify(before) : null,
                after !== null && after !== undefined ? JSON.stringify(after) : null,
                metadata !== null && metadata !== undefined ? JSON.stringify(metadata) : null
            ]
        );
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)) {
            console.warn('[BancosIntegrity] bancos_auditoria_detalle aún no existe; omitiendo auditoría detallada en esta BD.');
            return;
        }
        throw err;
    }
}

/**
 * Inicia una petición idempotente dentro de una transacción usando `bancos_idempotency_keys`.
 */
async function beginIdempotentRequest(conn, { key, scope, userId = null, payload = null }) {
    const cleanKey = String(key || '').trim().slice(0, 128);
    if (!cleanKey) return { active: false };

    const reqHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(payload || {}))
        .digest('hex');

    try {
        await conn.query(
            `INSERT INTO bancos_idempotency_keys (idempotency_key, scope, user_id, request_hash, status_code, response_json)
             VALUES (?, ?, ?, ?, NULL, NULL)`,
            [cleanKey, String(scope).slice(0, 80), userId || null, reqHash]
        );
        return { active: true, key: cleanKey, scope: String(scope).slice(0, 80), replayed: false, conflict: false };
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') {
            const [rows] = await conn.query(
                `SELECT status_code, response_json, request_hash
                 FROM bancos_idempotency_keys
                 WHERE idempotency_key = ? AND scope = ?
                 FOR UPDATE`,
                [cleanKey, String(scope).slice(0, 80)]
            );
            const existing = rows?.[0];
            if (existing && existing.status_code !== null) {
                const parsedResp = typeof existing.response_json === 'string'
                    ? JSON.parse(existing.response_json)
                    : (existing.response_json || {});
                return {
                    active: true,
                    key: cleanKey,
                    replayed: true,
                    conflict: false,
                    statusCode: Number(existing.status_code || 200),
                    responseBody: parsedResp
                };
            }
            return { active: true, key: cleanKey, replayed: false, conflict: true };
        }
        throw err;
    }
}

async function saveIdempotentResponse(conn, { key, scope, statusCode = 200, responseBody = {} }) {
    if (!key) return;
    await conn.query(
        `UPDATE bancos_idempotency_keys
         SET status_code = ?, response_json = ?
         WHERE idempotency_key = ? AND scope = ?`,
        [statusCode, JSON.stringify(responseBody), String(key).slice(0, 128), String(scope).slice(0, 80)]
    );
}

function canApproveReapertura(user) {
    if (!user) return false;
    if (isAdminUser(user)) return true;
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    return perms.includes('approve_reapertura_conciliacion');
}

function canCloseConciliacion(user) {
    if (!user) return false;
    if (isAdminUser(user)) return true;
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    return (
        perms.includes('close_conciliacion_periodo') ||
        perms.includes('manage_conciliacion_bancaria') ||
        perms.includes('/dashboard/bancos/conciliacion')
    );
}

function canEditMontoConciliacion(user) {
    if (!user) return false;
    if (isAdminUser(user)) return true;
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    return perms.includes('edit_monto_conciliacion');
}

/**
 * Obtiene los IDs de usuarios activos que son administradores o tienen permiso `approve_reapertura_conciliacion`.
 */
async function getReaperturaApproverIds(db) {
    const [rows] = await db.query(`
        SELECT DISTINCT u.id
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN role_permissions rp ON r.id = rp.role_id
        LEFT JOIN permissions p ON rp.permission_id = p.id
        WHERE u.status = 'active'
          AND (
              u.role_id = 1
              OR LOWER(COALESCE(r.name, '')) IN ('admin', 'administrator', 'administrador', 'super admin', 'superadmin', 'super administrador')
              OR p.name = 'approve_reapertura_conciliacion'
          )
    `);
    return (rows || []).map(r => Number(r.id)).filter(id => Number.isInteger(id) && id > 0);
}

/**
 * Crea notificaciones en BD y emite `notification:new` por Socket.io a cada usuario destinatario.
 */
async function notifyReaperturaEvent(db, io, { targetUserIds = [], type, title, message, data = {} }) {
    const uniqueIds = [...new Set((targetUserIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
    if (uniqueIds.length === 0) return;

    const jsonData = JSON.stringify(data || {});
    for (const uid of uniqueIds) {
        try {
            const [res] = await db.query(
                `INSERT INTO notifications (user_id, type, title, message, data, is_read)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [uid, String(type || 'conciliacion_reapertura').slice(0, 50), String(title).slice(0, 255), String(message), jsonData]
            );
            if (io && typeof io.to === 'function') {
                io.to(`user_${uid}`).emit('notification:new', {
                    id: res.insertId,
                    user_id: uid,
                    type,
                    title,
                    message,
                    data,
                    is_read: false,
                    created_at: new Date().toISOString()
                });
            }
        } catch (err) {
            console.warn('[BancosIntegrity] Error enviando notificación de reapertura:', err.message);
        }
    }
}

/**
 * Formatea un número correlativo de transferencia interna: TFB000000000001
 */
function formatTransferCode(num) {
    const safeNum = Number.isFinite(Number(num)) && Number(num) > 0 ? Math.floor(Number(num)) : 1;
    return `TFB${String(safeNum).padStart(12, '0')}`;
}

/**
 * Genera el siguiente correlativo único TFB para transferencias internas entre cuentas.
 */
async function generateNextTransferCode(dbOrConn) {
    let maxSeq = 0;
    try {
        const [rows] = await dbOrConn.query(
            `SELECT transfer_group_id
             FROM movimientos_bancarios
             WHERE transfer_group_id LIKE 'TFB%'
             ORDER BY LENGTH(transfer_group_id) DESC, transfer_group_id DESC
             LIMIT 25`
        );
        for (const r of (rows || [])) {
            const m = String(r.transfer_group_id || '').trim().match(/^TFB(\d+)$/i);
            if (m) {
                const n = parseInt(m[1], 10);
                if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
            }
        }
    } catch (_) {
        // Fallback seguro si no existe tabla/columna
    }

    const baseSeq = maxSeq + 1;
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = formatTransferCode(baseSeq + attempt);
        try {
            const [dup] = await dbOrConn.query(
                'SELECT id FROM movimientos_bancarios WHERE transfer_group_id = ? LIMIT 1',
                [candidate]
            );
            if (!dup || dup.length === 0) {
                return candidate;
            }
        } catch (_) {
            return candidate;
        }
    }
    return `TFB${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/**
 * Valida un correlativo manual de transferencia interna y verifica unicidad.
 */
async function validateManualTransferCode(conn, rawCode) {
    const clean = String(rawCode || '').trim().toUpperCase();
    if (!clean) return { ok: true, code: null };
    if (!/^[A-Z0-9_-]{3,40}$/.test(clean)) {
        return {
            ok: false,
            status: 400,
            message: 'El correlativo de transferencia debe tener entre 3 y 40 caracteres alfanuméricos (- o _).'
        };
    }
    const [existing] = await conn.query(
        'SELECT id FROM movimientos_bancarios WHERE transfer_group_id = ? AND deleted_at IS NULL LIMIT 1',
        [clean]
    );
    if (existing && existing.length > 0) {
        return {
            ok: false,
            status: 409,
            message: `El correlativo de transferencia ${clean} ya se encuentra registrado.`
        };
    }
    return { ok: true, code: clean };
}

/**
 * Emite actualización en tiempo real únicamente a las salas autorizadas de Bancos y Admin.
 */
function emitBankUpdate(io, eventName, payload = {}) {
    if (!io) return;
    try {
        if (typeof io.to === 'function') {
            io.to('role_admin').to('perm_bancos').emit(eventName, payload);
        } else if (typeof io.emit === 'function') {
            io.emit(eventName, payload);
        }
    } catch (_) {
        // Ignorar errores de socket no crítico
    }
}

module.exports = {
    round2,
    parseStrictPositiveAmount,
    parseStrictNonNegativeAmount,
    parseStrictFiniteAmount,
    isValidCalendarYMD,
    parseStrictDBDate,
    normalizeMovementDirection,
    computeMovementFingerprint,
    computeAccountReconciliationSummary,
    classifyCheckAging,
    summarizeChecksAging,
    getLiveAccountCheckbookSummary,
    consumeTalonarioNumber,
    computeAccountLedgerKardex,
    isDateInClosedPeriod,
    recordBankAudit,
    beginIdempotentRequest,
    saveIdempotentResponse,
    canApproveReapertura,
    canCloseConciliacion,
    canEditMontoConciliacion,
    getReaperturaApproverIds,
    notifyReaperturaEvent,
    formatTransferCode,
    generateNextTransferCode,
    validateManualTransferCode,
    emitBankUpdate
};
