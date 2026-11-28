const express = require('express');
const path = require('path');
const router = express.Router();
const { getDb, withTransaction } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { signUploadUrl } = require('../utils/uploadSigner');
const { formatDateYMD, formatDisplayDMY, getElSalvadorTodayYMD } = require('../utils/dateSv');
const {
    round2,
    parseStrictPositiveAmount,
    parseStrictFiniteAmount,
    parseStrictDBDate,
    normalizeMovementDirection,
    computeMovementFingerprint,
    computeAccountReconciliationSummary,
    classifyCheckAging,
    summarizeChecksAging,
    isDateInClosedPeriod,
    recordBankAudit,
    beginIdempotentRequest,
    saveIdempotentResponse,
    canApproveReapertura,
    canCloseConciliacion,
    canEditMontoConciliacion,
    getReaperturaApproverIds,
    notifyReaperturaEvent,
    generateNextTransferCode,
    emitBankUpdate
} = require('../services/bancosIntegrityService');
const {
    parseAndMatchBankStatement,
    extractBankStatementWithGemini,
    applyClassificationRules,
    validateClassificationRulePattern
} = require('../services/bankStatementParserService');
const { ensureRecordatoriosPagosTables } = require('../services/recordatoriosPagosService');

const toDisplayDate = (dateVal) => {
    const formatted = formatDisplayDMY(dateVal);
    return formatted || null;
};

const withRetry = async (fn, retries = 2) => {
    try {
        return await fn();
    } catch (err) {
        if ((err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ETIMEDOUT') && retries > 0) {
            console.warn(`[CONCILIACION] Retrying DB query due to ${err.code}...`);
            await new Promise(r => setTimeout(r, 200));
            return await withRetry(fn, retries - 1);
        }
        throw err;
    }
};

const conciliacionViewPerms = [
    'view_conciliacion_bancaria',
    'manage_conciliacion_bancaria',
    '/dashboard/bancos/conciliacion',
    'manage_movimientos',
    '/dashboard/bancos/movimientos'
];

const conciliacionManagePerms = [
    'manage_conciliacion_bancaria',
    '/dashboard/bancos/conciliacion'
];

const conciliacionReglasViewPerms = [
    ...conciliacionViewPerms,
    'manage_conciliacion_reglas'
];

const conciliacionReglasManagePerms = [
    ...conciliacionManagePerms,
    'manage_conciliacion_reglas'
];

const isNoSuchTableError = (err) => Boolean(err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146));

const TRANSFER_KEYWORD_RE = /\b(TRANSFER|TRANSF|T365|TRANSFER365|TRASLADO|ENTRE CUENTAS|CTA PROPIA|CUENTA PROPIA|TFB\d+)\b/i;

function getRowDirectionValue(row) {
    if (!row) return 'ABONO';
    if (Number(row.cargo || 0) > 0 && Number(row.abono || 0) === 0) return 'CARGO';
    if (Number(row.abono || 0) > 0 && Number(row.cargo || 0) === 0) return 'ABONO';
    const rawTipo = String(row.tipo || '').trim().toUpperCase();
    return rawTipo === 'CARGO' ? 'CARGO' : 'ABONO';
}

function getYmdDayDiffLocal(ymdA, ymdB) {
    if (!ymdA || !ymdB) return 999;
    const tA = new Date(`${ymdA}T12:00:00Z`).getTime();
    const tB = new Date(`${ymdB}T12:00:00Z`).getTime();
    if (!Number.isFinite(tA) || !Number.isFinite(tB)) return 999;
    return Math.round(Math.abs(tA - tB) / (24 * 3600 * 1000));
}

async function loadTransferCounterpartsByGroups(dbOrConn, groupIds = [], excludeCuentaId = null) {
    const cleanGroups = [...new Set((groupIds || []).map(g => String(g || '').trim()).filter(Boolean))];
    const map = new Map();
    if (cleanGroups.length === 0) return map;
    try {
        const params = [...cleanGroups];
        let excludeSql = '';
        if (excludeCuentaId) {
            excludeSql = ' AND mb.cuenta_bancaria_id != ?';
            params.push(Number(excludeCuentaId));
        }
        const [rows] = await withRetry(() => dbOrConn.query(
            `SELECT mb.id, mb.transfer_group_id, mb.cuenta_bancaria_id, mb.empresa_id,
                    mb.fecha, mb.fecha_aplicado, mb.documento, mb.concepto,
                    mb.monto, mb.cargo, mb.abono,
                    cb.numero AS numero_cuenta, cb.nombre AS cuenta_nombre,
                    b.descripcion AS banco_nombre,
                    e.codigo AS empresa_codigo, e.nombre AS empresa_nombre
             FROM movimientos_bancarios mb
             LEFT JOIN cuentas_bancarias cb ON mb.cuenta_bancaria_id = cb.id
             LEFT JOIN bancos b ON cb.banco_id = b.id
             LEFT JOIN empresas e ON mb.empresa_id = e.id
             WHERE mb.transfer_group_id IN (${cleanGroups.map(() => '?').join(',')})
               AND mb.deleted_at IS NULL${excludeSql}`,
            params
        ));
        for (const r of (rows || [])) {
            const gid = String(r.transfer_group_id || '').trim();
            if (!gid || map.has(gid)) continue;
            map.set(gid, {
                id: Number(r.id),
                transfer_group_id: gid,
                cuenta_bancaria_id: Number(r.cuenta_bancaria_id || 0),
                empresa_id: Number(r.empresa_id || 0),
                empresa_codigo: r.empresa_codigo || '',
                empresa_nombre: r.empresa_nombre || '',
                banco_nombre: r.banco_nombre || '',
                numero_cuenta: r.numero_cuenta || '',
                cuenta_nombre: r.cuenta_nombre || '',
                documento: r.documento || '',
                concepto: r.concepto || '',
                monto: Number(r.monto || r.cargo || r.abono || 0),
                cargo: Number(r.cargo || 0),
                abono: Number(r.abono || 0),
                direccion: getRowDirectionValue(r),
                fecha: r.fecha,
                fecha_ymd: parseStrictDBDate(r.fecha),
                fecha_display: toDisplayDate(r.fecha),
                fecha_aplicado: r.fecha_aplicado || null,
                fecha_aplicado_ymd: r.fecha_aplicado ? parseStrictDBDate(r.fecha_aplicado) : null,
                fecha_aplicado_display: r.fecha_aplicado ? toDisplayDate(r.fecha_aplicado) : null,
                conciliado: Boolean(r.fecha_aplicado)
            });
        }
    } catch (_) {
        // Fallback seguro ante mocks parciales
    }
    return map;
}

function findMirrorTransferSuggestions({ cuentaId, cuentaEmpresaId, localMovs = [], otherMovs = [] }) {
    const unlinkedLocal = (localMovs || []).filter(m => m && m.origen_tipo === 'MOV' && !m.transfer_group_id);
    const unlinkedOther = (otherMovs || []).filter(m =>
        m && !m.transfer_group_id && !m.deleted_at && Number(m.cuenta_bancaria_id) !== Number(cuentaId)
    );
    if (unlinkedLocal.length === 0 || unlinkedOther.length === 0) return [];

    const normDoc = (v) => String(v || '').trim().replace(/^0+/, '').toUpperCase();
    const digitsOnly = (v) => String(v || '').replace(/\D+/g, '');
    const usedOtherIds = new Set();
    const suggestions = [];

    for (const local of unlinkedLocal) {
        const lDir = getRowDirectionValue(local);
        const oppDir = lDir === 'CARGO' ? 'ABONO' : 'CARGO';
        const lMonto = Number(local.monto_display || local.monto || local.cargo || local.abono || 0);
        if (lMonto <= 0) continue;
        const lYmd = local.fecha_ymd || parseStrictDBDate(local.fecha);
        const lDoc = normDoc(local.documento);
        const lConcepto = String(local.concepto || '').toUpperCase();
        const lDigits = digitsOnly(lConcepto);
        const lHasKw = TRANSFER_KEYWORD_RE.test(lConcepto);

        const candidates = [];
        for (const other of unlinkedOther) {
            if (usedOtherIds.has(Number(other.id))) continue;
            const oDir = getRowDirectionValue(other);
            if (oDir !== oppDir) continue;
            const oMonto = Number(other.monto || other.cargo || other.abono || 0);
            if (Math.abs(oMonto - lMonto) >= 0.01) continue;
            const oYmd = parseStrictDBDate(other.fecha);
            const diffDays = getYmdDayDiffLocal(lYmd, oYmd);
            if (diffDays > 5) continue;

            let score = 0;
            const reasons = [];
            const oDoc = normDoc(other.documento);
            if (lDoc && oDoc && lDoc === oDoc) {
                score += 50;
                reasons.push(`misma ref #${other.documento}`);
            }
            const oDigits = digitsOnly(other.numero_cuenta);
            if (oDigits.length >= 6 && lDigits.includes(oDigits)) {
                score += 35;
                reasons.push(`menciona cta #${other.numero_cuenta}`);
            }
            const oConcepto = String(other.concepto || '').toUpperCase();
            if (lHasKw || TRANSFER_KEYWORD_RE.test(oConcepto)) {
                score += 20;
                reasons.push('concepto de transferencia');
            }
            if (diffDays === 0) {
                score += 15;
                reasons.push('misma fecha');
            } else if (diffDays <= 2) {
                score += 8;
                reasons.push(`fecha ±${diffDays}d`);
            }

            if (score >= 15) {
                candidates.push({ other, score, diffDays, reasons });
            }
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.score - a.score || a.diffDays - b.diffDays);
            const best = candidates[0];
            const cp = best.other;
            usedOtherIds.add(Number(cp.id));
            const cpYmd = parseStrictDBDate(cp.fecha);
            suggestions.push({
                movimiento_local_id: Number(local.id),
                movimiento_local_fecha_ymd: lYmd,
                movimiento_local_fecha_display: local.fecha_display || toDisplayDate(local.fecha),
                movimiento_local_documento: local.documento || '',
                movimiento_local_concepto: local.concepto || '',
                movimiento_local_direccion: lDir,
                movimiento_local_conciliado: Boolean(local.fecha_aplicado),
                movimiento_contraparte_id: Number(cp.id),
                cuenta_contraparte_id: Number(cp.cuenta_bancaria_id),
                empresa_id: Number(cp.empresa_id || 0),
                empresa_codigo: cp.empresa_codigo || '',
                empresa_nombre: cp.empresa_nombre || '',
                banco_nombre: cp.banco_nombre || '',
                numero_cuenta: cp.numero_cuenta || '',
                cuenta_nombre: cp.cuenta_nombre || '',
                intercompany: Boolean(cuentaEmpresaId && cp.empresa_id && Number(cp.empresa_id) !== Number(cuentaEmpresaId)),
                contraparte_fecha_ymd: cpYmd,
                contraparte_fecha_display: toDisplayDate(cp.fecha),
                contraparte_fecha_aplicado_display: cp.fecha_aplicado ? toDisplayDate(cp.fecha_aplicado) : null,
                contraparte_documento: cp.documento || '',
                contraparte_concepto: cp.concepto || '',
                contraparte_direccion: getRowDirectionValue(cp),
                contraparte_conciliado: Boolean(cp.fecha_aplicado),
                monto: lMonto,
                confianza: best.score >= 40 ? 'ALTA' : 'MEDIA',
                motivo: best.reasons.join(' · ')
            });
        }
    }

    return suggestions;
}

const canManageConciliacionReglas = (user) => {
    if (!user) return false;
    const roleLower = String(user.role || '').toLowerCase();
    if (Number(user.role_id) === 1 || ['admin', 'administrator', 'administrador', 'super admin', 'superadmin', 'super administrador'].includes(roleLower)) {
        return true;
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    return perms.includes('manage_conciliacion_reglas') ||
        perms.includes('manage_conciliacion_bancaria') ||
        perms.includes('/dashboard/bancos/conciliacion');
};

const getIdempotencyKey = (req) => {
    const hdr = req.headers?.['x-idempotency-key'] || req.headers?.['idempotency-key'];
    return typeof hdr === 'string' && hdr.trim() ? hdr.trim().slice(0, 128) : null;
};

async function cleanupPendingIdempotency(conn, key, scope) {
    const cleanKey = typeof key === 'string' ? key.trim().slice(0, 128) : '';
    if (!cleanKey) return;
    try {
        await conn.query(
            'DELETE FROM bancos_idempotency_keys WHERE idempotency_key = ? AND scope = ? AND status_code IS NULL',
            [cleanKey, String(scope).slice(0, 80)]
        );
    } catch (err) {
        if (isNoSuchTableError(err)) return;
        throw err;
    }
}

function formatSignedMovComprobante(row) {
    if (!row) return null;
    const rawUrl = row.archivo_url ? String(row.archivo_url).split('?')[0] : null;
    let parsedOcr = row.ocr_json || null;
    if (typeof parsedOcr === 'string') {
        try { parsedOcr = JSON.parse(parsedOcr); } catch (_) { parsedOcr = null; }
    }
    return {
        ...row,
        id: row.id !== null && row.id !== undefined ? Number(row.id) : null,
        movimiento_id: row.movimiento_id !== undefined ? Number(row.movimiento_id) : undefined,
        archivo_url: rawUrl,
        signed_url: rawUrl ? signUploadUrl(rawUrl) : null,
        tamano_bytes: Number(row.tamano_bytes || 0),
        ocr_json: parsedOcr
    };
}

async function loadStatementMatchingContext(db, cuentaId) {
    const [[cuenta]] = await withRetry(() => db.query(
        `SELECT cb.id, cb.empresa_id, cb.banco_id, cb.activa, b.codigo as banco_codigo, b.descripcion as banco_nombre
         FROM cuentas_bancarias cb
         LEFT JOIN bancos b ON cb.banco_id = b.id
         WHERE cb.id = ? LIMIT 1`,
        [cuentaId]
    ));
    if (!cuenta) return null;

    const [movPendientes] = await withRetry(() => db.query(
        'SELECT id, "MOV" as origen_tipo, documento, concepto, monto, cargo, abono, fecha, transfer_group_id ' +
        'FROM movimientos_bancarios ' +
        'WHERE cuenta_bancaria_id = ? AND deleted_at IS NULL AND fecha_aplicado IS NULL',
        [cuentaId]
    ));

    const [chkPendientes] = await withRetry(() => db.query(
        'SELECT id, "CK" as origen_tipo, cheque as documento, concepto, valor as monto, valor as cargo, 0 as abono, fecha, a_nombre as beneficiario ' +
        'FROM cheques ' +
        'WHERE cuenta_bancaria_id = ? AND deleted_at IS NULL AND fecha_aplicado IS NULL ' +
        'AND cheque_anulado = FALSE AND fue_noemitido = FALSE AND es_reservado = FALSE',
        [cuentaId]
    ));

    const [movConciliados] = await withRetry(() => db.query(
        'SELECT id, "MOV" as origen_tipo, documento, concepto, monto, cargo, abono, fecha, fecha_aplicado, transfer_group_id ' +
        'FROM movimientos_bancarios ' +
        'WHERE cuenta_bancaria_id = ? AND deleted_at IS NULL AND fecha_aplicado IS NOT NULL ' +
        'AND fecha >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)',
        [cuentaId]
    ));

    const [chkConciliados] = await withRetry(() => db.query(
        'SELECT id, "CK" as origen_tipo, cheque as documento, concepto, valor as monto, valor as cargo, 0 as abono, fecha, fecha_aplicado, a_nombre as beneficiario ' +
        'FROM cheques ' +
        'WHERE cuenta_bancaria_id = ? AND deleted_at IS NULL AND fecha_aplicado IS NOT NULL ' +
        'AND cheque_anulado = FALSE AND fue_noemitido = FALSE AND es_reservado = FALSE ' +
        'AND fecha >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)',
        [cuentaId]
    ));

    let rules = [];
    try {
        const [ruleRows] = await withRetry(() => db.query(
            'SELECT * FROM conciliacion_reglas_clasificacion WHERE activo = 1 ORDER BY prioridad ASC, id ASC'
        ));
        rules = ruleRows || [];
    } catch (errRules) {
        if (!isNoSuchTableError(errRules)) throw errRules;
    }

    let allTiposRemesas = [];
    try {
        const [trRows] = await withRetry(() => db.query(
            'SELECT id, empresa_id, codigo, descripcion FROM tipos_remesas ORDER BY id ASC'
        ));
        allTiposRemesas = trRows || [];
    } catch (errTr) {
        if (!isNoSuchTableError(errTr)) throw errTr;
    }
    const tiposRemesas = allTiposRemesas.filter((tr) => Number(tr.empresa_id) === Number(cuenta.empresa_id));

    let otrasCuentasInternas = [];
    let movimientosOtrasCuentas = [];
    const localTransferGroups = new Set(
        [...(movPendientes || []), ...(movConciliados || [])]
            .map(m => String(m.transfer_group_id || '').trim())
            .filter(Boolean)
    );
    const transferCounterpartsByGroup = await loadTransferCounterpartsByGroups(db, [...localTransferGroups], cuentaId);

    try {
        const [ctaRows] = await withRetry(() => db.query(
            `SELECT cb.id, cb.empresa_id, cb.numero, cb.nombre,
                    b.descripcion AS banco_nombre, e.codigo AS empresa_codigo, e.nombre AS empresa_nombre
             FROM cuentas_bancarias cb
             LEFT JOIN bancos b ON cb.banco_id = b.id
             LEFT JOIN empresas e ON cb.empresa_id = e.id
             WHERE cb.activa = TRUE AND cb.id != ?`,
            [cuentaId]
        ));
        otrasCuentasInternas = ctaRows || [];
    } catch (_) {
        otrasCuentasInternas = [];
    }

    try {
        const [otherMovRows] = await withRetry(() => db.query(
            `SELECT mb.id, mb.empresa_id, mb.cuenta_bancaria_id, mb.fecha, mb.fecha_aplicado,
                    mb.documento, mb.concepto, mb.monto, mb.cargo, mb.abono, mb.transfer_group_id,
                    cb.numero AS numero_cuenta, cb.nombre AS cuenta_nombre,
                    b.descripcion AS banco_nombre, e.codigo AS empresa_codigo, e.nombre AS empresa_nombre
             FROM movimientos_bancarios mb
             LEFT JOIN cuentas_bancarias cb ON mb.cuenta_bancaria_id = cb.id
             LEFT JOIN bancos b ON cb.banco_id = b.id
             LEFT JOIN empresas e ON mb.empresa_id = e.id
             WHERE mb.cuenta_bancaria_id != ?
               AND mb.deleted_at IS NULL
               AND mb.fecha >= DATE_SUB(CURDATE(), INTERVAL 120 DAY)
             ORDER BY mb.fecha DESC, mb.id DESC
             LIMIT 500`,
            [cuentaId]
        ));
        movimientosOtrasCuentas = (otherMovRows || []).map(r => ({
            ...r,
            paired_with_current_account: Boolean(r.transfer_group_id && localTransferGroups.has(String(r.transfer_group_id).trim()))
        }));
    } catch (_) {
        movimientosOtrasCuentas = [];
    }

    return {
        cuenta,
        pendientes: [...(movPendientes || []), ...(chkPendientes || [])],
        conciliadosExistentes: [...(movConciliados || []), ...(chkConciliados || [])],
        rules,
        tiposRemesas: tiposRemesas.length > 0 ? tiposRemesas : allTiposRemesas,
        allTiposRemesas,
        otrasCuentasInternas,
        movimientosOtrasCuentas,
        transferCounterpartsByGroup
    };
}

// ── 1. Catálogos para la pantalla ─────────────────────────────────────────────
router.get('/catalogos', authenticateToken, requirePermission(conciliacionViewPerms), async (req, res) => {
    try {
        const db = getDb();
        const [empresas] = await withRetry(() => db.query('SELECT id, codigo, nombre FROM empresas ORDER BY nombre'));
        const [cuentas] = await withRetry(() => db.query(
            'SELECT cb.id, cb.empresa_id, e.codigo as empresa_codigo, e.nombre as empresa_nombre, ' +
            'cb.banco_id, b.codigo as banco_codigo, b.descripcion as banco_nombre, ' +
            'cb.numero, cb.nombre, cb.cod_cta, cb.orden, cb.saldo_inicial, cb.fecha_saldo_inicial ' +
            'FROM cuentas_bancarias cb ' +
            'LEFT JOIN empresas e ON cb.empresa_id = e.id ' +
            'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
            'WHERE cb.activa = TRUE ' +
            'ORDER BY b.descripcion ASC, cb.numero ASC'
        ));
        const [tiposRemesas] = await withRetry(() => db.query(
            'SELECT id, empresa_id, codigo, descripcion FROM tipos_remesas ORDER BY id ASC'
        ));
        res.json({
            empresas,
            cuentas,
            tipos_remesas: tiposRemesas,
            permissions: {
                can_close_periodo: canCloseConciliacion(req.user),
                can_approve_reapertura: canApproveReapertura(req.user),
                can_edit_monto: canEditMontoConciliacion(req.user),
                can_manage_reglas: canManageConciliacionReglas(req.user)
            }
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar catálogos');
    }
});

// ── 2. Datos Principales de Conciliación ─────────────────────────────────────
router.get('/data', authenticateToken, requirePermission(conciliacionViewPerms), async (req, res) => {
    const { cuenta_id, desde, hasta } = req.query;
    const cuentaId = parseInt(cuenta_id, 10);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
        return res.status(400).json({ message: 'Debe especificar un ID de cuenta bancaria válido.' });
    }

    const dbDesde = desde ? parseStrictDBDate(desde) : '2000-01-01';
    const dbHasta = hasta ? parseStrictDBDate(hasta) : '2099-12-31';
    if ((desde && !dbDesde) || (hasta && !dbHasta)) {
        return res.status(400).json({ message: 'El rango de fechas indicado no es válido (use YYYY-MM-DD).' });
    }
    if (dbDesde > dbHasta) {
        return res.status(400).json({ message: 'La fecha inicial no puede ser mayor que la fecha final.' });
    }

    try {
        const db = getDb();

        const [[cuenta]] = await withRetry(() => db.query(
            'SELECT cb.*, e.codigo as empresa_codigo, e.nombre as empresa_nombre, ' +
            'b.codigo as banco_codigo, b.descripcion as banco_nombre ' +
            'FROM cuentas_bancarias cb ' +
            'LEFT JOIN empresas e ON cb.empresa_id = e.id ' +
            'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
            'WHERE cb.id = ?',
            [cuentaId]
        ));

        if (!cuenta) {
            return res.status(404).json({ message: 'Cuenta bancaria no encontrada.' });
        }

        const fechaSaldoInicial = cuenta.fecha_saldo_inicial ? parseStrictDBDate(cuenta.fecha_saldo_inicial) : null;

        // 2. Última validación registrada para la cuenta
        let ultimaValidacion = null;
        try {
            const [valRows] = await withRetry(() => db.query(
                'SELECT * FROM validaciones_saldo_banco WHERE cuenta_bancaria_id = ? ORDER BY fecha_validacion DESC, id DESC LIMIT 1',
                [cuentaId]
            ));
            ultimaValidacion = valRows[0] || null;
        } catch (e) {
            console.warn('validaciones_saldo_banco query warning:', e.message);
        }

        // 3. Movimientos bancarios APLICADOS (Conciliados)
        const movAplParams = [cuentaId, dbDesde, dbHasta];
        let movFloorSql = '';
        if (fechaSaldoInicial) {
            movFloorSql = ' AND m.fecha >= ?';
            movAplParams.push(fechaSaldoInicial);
        }
        const [movimientosAplicadosRows] = await withRetry(() => db.query(
            'SELECT m.id, "MOV" as origen_tipo, m.tipo_remesa_id, tr.codigo as tipo_doc, ' +
            'm.fecha, m.fecha_aplicado, m.documento, m.concepto, "" as beneficiario, ' +
            'm.monto, m.cargo, m.abono, m.num_partida, m.cod_cta, m.es_contabilizado, m.version, m.comprobante_url, m.transfer_group_id ' +
            'FROM movimientos_bancarios m ' +
            'LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id ' +
            'WHERE m.cuenta_bancaria_id = ? ' +
            'AND m.deleted_at IS NULL ' +
            'AND m.fecha_aplicado IS NOT NULL ' +
            `AND m.fecha_aplicado BETWEEN ? AND ?${movFloorSql} ` +
            'ORDER BY m.fecha_aplicado DESC, m.id DESC',
            movAplParams
        ));

        // 4. Cheques APLICADOS (Cobrados) — excluyendo anulados, no emitidos y reservados
        const chkAplParams = [cuentaId, dbDesde, dbHasta];
        let chkFloorSql = '';
        if (fechaSaldoInicial) {
            chkFloorSql = ' AND ch.fecha >= ?';
            chkAplParams.push(fechaSaldoInicial);
        }
        const [chequesAplicadosRows] = await withRetry(() => db.query(
            'SELECT ch.id, "CK" as origen_tipo, "CH" as tipo_doc, ' +
            'ch.fecha, ch.fecha_aplicado, ch.cheque as documento, ch.concepto, ch.a_nombre as beneficiario, ' +
            'ch.valor as monto, ch.valor as cargo, 0 as abono, ch.num_partida, "" as cod_cta, ch.es_contabilizado, ch.version ' +
            'FROM cheques ch ' +
            'WHERE ch.cuenta_bancaria_id = ? ' +
            'AND ch.deleted_at IS NULL ' +
            'AND ch.fecha_aplicado IS NOT NULL ' +
            'AND ch.cheque_anulado = FALSE AND ch.fue_noemitido = FALSE AND ch.es_reservado = FALSE ' +
            `AND ch.fecha_aplicado BETWEEN ? AND ?${chkFloorSql} ` +
            'ORDER BY ch.fecha_aplicado DESC, ch.id DESC',
            chkAplParams
        ));

        // 5. Movimientos bancarios PENDIENTES (Sin fecha aplicado o posterior al rango)
        const movPendParams = [cuentaId, dbHasta, dbHasta];
        if (fechaSaldoInicial) movPendParams.push(fechaSaldoInicial);
        const [movimientosPendientesRows] = await withRetry(() => db.query(
            'SELECT m.id, "MOV" as origen_tipo, tr.codigo as tipo_doc, ' +
            'm.fecha, m.fecha_aplicado, m.documento, m.concepto, "" as beneficiario, ' +
            'm.monto, m.cargo, m.abono, m.num_partida, m.cod_cta, m.es_contabilizado, m.version, m.comprobante_url, m.transfer_group_id ' +
            'FROM movimientos_bancarios m ' +
            'LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id ' +
            'WHERE m.cuenta_bancaria_id = ? ' +
            'AND m.deleted_at IS NULL ' +
            'AND (m.fecha_aplicado IS NULL OR m.fecha_aplicado > ?) ' +
            `AND m.fecha <= ?${movFloorSql} ` +
            'ORDER BY m.fecha DESC, m.id DESC',
            movPendParams
        ));

        // 6. Cheques PENDIENTES (En tránsito / No cobrados)
        const chkPendParams = [cuentaId, dbHasta, dbHasta];
        if (fechaSaldoInicial) chkPendParams.push(fechaSaldoInicial);
        const [chequesPendientesRows] = await withRetry(() => db.query(
            'SELECT ch.id, "CK" as origen_tipo, "CH" as tipo_doc, ' +
            'ch.fecha, ch.fecha_aplicado, ch.cheque as documento, ch.concepto, ch.a_nombre as beneficiario, ' +
            'ch.valor as monto, ch.valor as cargo, 0 as abono, ch.num_partida, "" as cod_cta, ch.es_contabilizado, ch.version ' +
            'FROM cheques ch ' +
            'WHERE ch.cuenta_bancaria_id = ? ' +
            'AND ch.deleted_at IS NULL ' +
            'AND (ch.fecha_aplicado IS NULL OR ch.fecha_aplicado > ?) ' +
            `AND ch.fecha <= ?${chkFloorSql} ` +
            'AND ch.cheque_anulado = FALSE AND ch.fue_noemitido = FALSE AND ch.es_reservado = FALSE ' +
            'ORDER BY ch.fecha DESC, ch.id DESC',
            chkPendParams
        ));

        // 6.1 R5.3 Comprobantes firmados para movimientos bancarios
        const allMovIds = [...new Set(
            [...(movimientosAplicadosRows || []), ...(movimientosPendientesRows || [])]
                .map(r => Number(r.id))
                .filter(id => Number.isInteger(id) && id > 0)
        )];
        const movComprobantesMap = new Map();
        if (allMovIds.length > 0) {
            try {
                const [compRows] = await withRetry(() => db.query(
                    `SELECT id, movimiento_id, nombre_original, archivo_url, mime_type, tamano_bytes, ancho, alto, nota, ocr_json, uploaded_by, uploaded_by_name, created_at
                     FROM movimientos_bancarios_comprobantes
                     WHERE movimiento_id IN (${allMovIds.map(() => '?').join(',')})
                     ORDER BY created_at DESC, id DESC`,
                    allMovIds
                ));
                for (const row of (compRows || [])) {
                    const mid = Number(row.movimiento_id);
                    if (!movComprobantesMap.has(mid)) movComprobantesMap.set(mid, []);
                    movComprobantesMap.get(mid).push(formatSignedMovComprobante(row));
                }
            } catch (errMovComp) {
                if (!isNoSuchTableError(errMovComp)) throw errMovComp;
            }
        }

        const attachMovementReceipts = (r) => {
            if (r.origen_tipo !== 'MOV') {
                return {
                    comprobante_url: null,
                    signed_url: null,
                    comprobante_signed_url: null,
                    comprobantes_count: 0,
                    comprobantes: []
                };
            }
            const existing = (movComprobantesMap.get(Number(r.id)) || []).slice();
            if (existing.length === 0 && r.comprobante_url) {
                const rawUrl = String(r.comprobante_url).split('?')[0];
                const signed = rawUrl ? signUploadUrl(rawUrl) : null;
                if (rawUrl) {
                    existing.push({
                        id: null,
                        movimiento_id: Number(r.id),
                        nombre_original: path.basename(rawUrl),
                        archivo_url: rawUrl,
                        signed_url: signed,
                        mime_type: null,
                        tamano_bytes: 0,
                        nota: null,
                        ocr_json: null,
                        created_at: null
                    });
                }
            }
            const rawPrimary = r.comprobante_url ? String(r.comprobante_url).split('?')[0] : null;
            const primarySigned = existing[0]?.signed_url || (rawPrimary ? signUploadUrl(rawPrimary) : null);
            return {
                comprobante_url: primarySigned,
                signed_url: primarySigned,
                comprobante_signed_url: primarySigned,
                comprobantes_count: existing.length,
                comprobantes: existing
            };
        };

        // 6.2 R4.2 Cruces agrupados activos para la cuenta
        let crucesActivos = [];
        const activeCruceByEntityKey = new Map();
        try {
            const [cruceRows] = await withRetry(() => db.query(
                `SELECT * FROM conciliacion_cruces
                 WHERE cuenta_bancaria_id = ? AND estado = 'ACTIVO'
                 ORDER BY fecha_aplicado DESC, id DESC`,
                [cuentaId]
            ));
            const filteredCruces = (cruceRows || []).filter(
                (c) => Number(c.cuenta_bancaria_id) === cuentaId && String(c.estado || '').toUpperCase() === 'ACTIVO'
            );
            if (filteredCruces.length > 0) {
                const cruceIds = filteredCruces.map((c) => Number(c.id));
                const [itemRows] = await withRetry(() => db.query(
                    `SELECT * FROM conciliacion_cruce_items
                     WHERE cruce_id IN (${cruceIds.map(() => '?').join(',')})
                     ORDER BY id ASC`,
                    cruceIds
                ));
                const itemsByCruce = new Map();
                for (const it of (itemRows || [])) {
                    const cid = Number(it.cruce_id);
                    if (!cruceIds.includes(cid)) continue;
                    if (!itemsByCruce.has(cid)) itemsByCruce.set(cid, []);
                    itemsByCruce.get(cid).push(it);
                }
                crucesActivos = filteredCruces.map((c) => {
                    const items = itemsByCruce.get(Number(c.id)) || [];
                    for (const it of items) {
                        if ((it.origen_tipo === 'MOV' || it.origen_tipo === 'CK') && it.entidad_id) {
                            activeCruceByEntityKey.set(`${it.origen_tipo}_${it.entidad_id}`, {
                                cruce_id: Number(c.id),
                                tipo_cruce: c.tipo_cruce
                            });
                        }
                    }
                    return {
                        ...c,
                        monto_total: Number(c.monto_total || 0),
                        fecha_aplicado_ymd: parseStrictDBDate(c.fecha_aplicado),
                        fecha_aplicado_display: toDisplayDate(c.fecha_aplicado),
                        items
                    };
                });
            }
        } catch (errCruces) {
            if (!isNoSuchTableError(errCruces)) throw errCruces;
        }

        const allTransferGroupIds = [...new Set(
            [...(movimientosAplicadosRows || []), ...(movimientosPendientesRows || [])]
                .map(r => String(r.transfer_group_id || '').trim())
                .filter(Boolean)
        )];
        const transferCounterpartsMap = await loadTransferCounterpartsByGroups(db, allTransferGroupIds, cuentaId);
        const buildTransferRowMeta = (r) => {
            if (r.origen_tipo !== 'MOV' || !r.transfer_group_id) {
                return {
                    transfer_group_id: null,
                    es_transferencia_interna: false,
                    transfer_contraparte: null
                };
            }
            const gid = String(r.transfer_group_id).trim();
            const cp = transferCounterpartsMap.get(gid) || null;
            return {
                transfer_group_id: gid,
                es_transferencia_interna: true,
                transfer_contraparte: cp ? {
                    ...cp,
                    intercompany: Boolean(cp.empresa_id && cuenta.empresa_id && Number(cp.empresa_id) !== Number(cuenta.empresa_id))
                } : null
            };
        };

        const movimientosConciliados = [...movimientosAplicadosRows, ...chequesAplicadosRows]
            .sort((a, b) => new Date(b.fecha_aplicado) - new Date(a.fecha_aplicado) || b.id - a.id)
            .map(r => {
                const key = `${r.origen_tipo}_${r.id}`;
                const cruceMeta = activeCruceByEntityKey.get(key) || null;
                return {
                    ...r,
                    ...attachMovementReceipts(r),
                    ...buildTransferRowMeta(r),
                    key,
                    tipo: r.tipo_doc || (r.origen_tipo === 'CK' ? 'CH' : (Number(r.abono) > 0 ? 'RM' : 'NC')),
                    fecha_ymd: parseStrictDBDate(r.fecha),
                    fecha_aplicado_ymd: parseStrictDBDate(r.fecha_aplicado),
                    fecha_display: toDisplayDate(r.fecha),
                    fecha_aplicado_display: toDisplayDate(r.fecha_aplicado),
                    monto_display: Number(r.monto || r.cargo || r.abono || 0),
                    es_contabilizado: Boolean(r.es_contabilizado),
                    cruce_id: cruceMeta ? cruceMeta.cruce_id : null,
                    cruce_tipo: cruceMeta ? cruceMeta.tipo_cruce : null
                };
            });

        // 6.3 R3.3 Antigüedad de cheques en circulación (Aging)
        const agingRefDate = hasta ? dbHasta : getElSalvadorTodayYMD();
        const chequesPendingForAging = (chequesPendientesRows || []).filter(
            (ch) => !ch.fecha_aplicado || parseStrictDBDate(ch.fecha_aplicado) > dbHasta
        );
        const agingSummary = summarizeChecksAging(chequesPendingForAging, agingRefDate);

        const pendientes = [...movimientosPendientesRows, ...chequesPendientesRows]
            .sort((a, b) => new Date(b.fecha) - new Date(a.fecha) || b.id - a.id)
            .map(r => ({
                ...r,
                ...attachMovementReceipts(r),
                ...buildTransferRowMeta(r),
                ...(r.origen_tipo === 'CK' ? classifyCheckAging(r.fecha, agingRefDate) : {}),
                key: `${r.origen_tipo}_${r.id}`,
                tipo: r.tipo_doc || (r.origen_tipo === 'CK' ? 'CH' : (Number(r.abono) > 0 ? 'RM' : 'NC')),
                fecha_ymd: parseStrictDBDate(r.fecha),
                fecha_aplicado_ymd: parseStrictDBDate(r.fecha_aplicado),
                fecha_display: toDisplayDate(r.fecha),
                fecha_aplicado_display: toDisplayDate(r.fecha_aplicado),
                monto_display: Number(r.monto || r.cargo || r.abono || 0),
                es_contabilizado: Boolean(r.es_contabilizado)
            }));

        // 7. Cálculo oficial de Saldos (Chequera + Tránsitos + Saldo Conciliado en Libros)
        const summary = await withRetry(() => computeAccountReconciliationSummary(db, cuentaId, dbHasta));

        const saldoBanco = ultimaValidacion ? Number(ultimaValidacion.monto_banco) : summary.saldo_conciliado_libros;
        const diferencia = round2(saldoBanco - summary.saldo_conciliado_libros);
        const diferenciaVsChequera = round2(saldoBanco - summary.saldo_chequera);

        // 7.1 Estado de períodos cerrados y solicitudes de reapertura pendientes
        let periodoCerradoHasta = null;
        let periodosRecientes = [];
        let solicitudesPendientes = [];
        try {
            const [perRows] = await withRetry(() => db.query(
                `SELECT id, cuenta_bancaria_id, fecha_corte, estado, saldo_banco, saldo_chequera,
                        saldo_conciliado_libros, abonos_en_transito, cargos_cheques_en_transito,
                        diferencia, cerrado_por_nombre, cerrado_at, reabierto_por_nombre, reabierto_at, motivo_reapertura
                 FROM conciliacion_periodos
                 WHERE cuenta_bancaria_id = ?
                 ORDER BY fecha_corte DESC
                 LIMIT 24`,
                [cuentaId]
            ));
            periodosRecientes = (perRows || []).map(p => ({
                ...p,
                fecha_corte_ymd: parseStrictDBDate(p.fecha_corte),
                fecha_corte_display: toDisplayDate(p.fecha_corte)
            }));
            const closedLatest = periodosRecientes.find(p => p.estado === 'CERRADO');
            periodoCerradoHasta = closedLatest ? closedLatest.fecha_corte_ymd : null;

            const [reqRows] = await withRetry(() => db.query(
                `SELECT s.*, p.estado AS periodo_estado
                 FROM conciliacion_reapertura_solicitudes s
                 LEFT JOIN conciliacion_periodos p ON s.periodo_id = p.id
                 WHERE s.cuenta_bancaria_id = ? AND s.estado = 'PENDIENTE'
                 ORDER BY s.solicitado_at DESC`,
                [cuentaId]
            ));
            solicitudesPendientes = (reqRows || []).map(s => ({
                ...s,
                fecha_corte_ymd: parseStrictDBDate(s.fecha_corte),
                fecha_corte_display: toDisplayDate(s.fecha_corte)
            }));
        } catch (_errPer) {
            periodoCerradoHasta = null;
            periodosRecientes = [];
            solicitudesPendientes = [];
        }

        // 8. Sugerencias desde Control de Pagos
        let sugerenciasControlPagos = [];
        try {
            const [abRows] = await withRetry(() => db.query(
                `SELECT a.id, a.vencimiento_id, a.recordatorio_id, a.ubicacion, a.descripcion_ref,
                        a.tipo_operacion, a.metodo_pago, a.cuenta_bancaria_id, a.cuenta_label,
                        a.beneficiario, a.referencia_doc, a.fecha_pago, a.monto, a.notas, a.estado_conciliacion,
                        a.created_by
                 FROM recordatorios_pagos_abonos a
                 WHERE a.cuenta_bancaria_id = ?
                   AND a.estado_conciliacion = 'PENDIENTE'
                   AND a.fecha_pago <= ?
                 ORDER BY a.fecha_pago DESC, a.id DESC
                 LIMIT 100`,
                [cuentaId, dbHasta]
            ));

            const venIds = [...new Set(
                (abRows || [])
                    .map(ab => Number(ab.vencimiento_id))
                    .filter(id => Number.isInteger(id) && id > 0)
            )];
            let pagoCompRows = [];
            if (venIds.length > 0) {
                try {
                    const [cRows] = await withRetry(() => db.query(
                        `SELECT id, vencimiento_id, abono_id, nombre_original, archivo_url, mime_type, tamano_bytes, ancho, alto, nota, uploaded_by, created_at
                         FROM recordatorios_pagos_comprobantes
                         WHERE vencimiento_id IN (${venIds.map(() => '?').join(',')})
                         ORDER BY created_at DESC, id DESC`,
                        venIds
                    ));
                    pagoCompRows = cRows || [];
                } catch (errPagoComp) {
                    if (!isNoSuchTableError(errPagoComp)) throw errPagoComp;
                }
            }

            const allCandidates = [...pendientes, ...movimientosConciliados];
            sugerenciasControlPagos = (abRows || []).map(ab => {
                const abMonto = Number(ab.monto || 0);
                const abYmd = formatDateYMD(ab.fecha_pago);
                const abTime = abYmd ? new Date(abYmd + 'T12:00:00Z').getTime() : 0;
                const abRef = String(ab.referencia_doc || '').trim().toLowerCase();

                const suggestedMatch = allCandidates.find(m => {
                    const mMonto = Number(m.monto_display || m.monto || 0);
                    if (Math.abs(mMonto - abMonto) > 0.05) return false;
                    if (abRef && String(m.documento || '').toLowerCase().includes(abRef)) return true;
                    const mYmd = formatDateYMD(m.fecha);
                    const mDate = mYmd ? new Date(mYmd + 'T12:00:00Z').getTime() : 0;
                    return Math.abs(mDate - abTime) <= 7 * 24 * 3600 * 1000;
                }) || null;

                const matchedComps = pagoCompRows
                    .filter(c =>
                        Number(c.vencimiento_id) === Number(ab.vencimiento_id) &&
                        (c.abono_id === null || c.abono_id === undefined || Number(c.abono_id) === Number(ab.id))
                    )
                    .map(c => {
                        const rawUrl = c.archivo_url ? String(c.archivo_url).split('?')[0] : null;
                        return {
                            ...c,
                            archivo_url: rawUrl,
                            signed_url: rawUrl ? signUploadUrl(rawUrl) : null
                        };
                    });

                if (matchedComps.length === 0 && ab.comprobante_url) {
                    const rawFallback = String(ab.comprobante_url).split('?')[0];
                    if (rawFallback) {
                        matchedComps.push({
                            id: null,
                            vencimiento_id: Number(ab.vencimiento_id),
                            abono_id: Number(ab.id),
                            nombre_original: path.basename(rawFallback),
                            archivo_url: rawFallback,
                            signed_url: signUploadUrl(rawFallback),
                            mime_type: null,
                            tamano_bytes: 0,
                            nota: null,
                            created_at: null
                        });
                    }
                }

                const primarySigned = matchedComps[0]?.signed_url || null;
                const finalCount = matchedComps.length > 0 ? matchedComps.length : Number(ab.comprobantes_count || 0);

                return {
                    ...ab,
                    monto: abMonto,
                    fecha_pago_display: toDisplayDate(ab.fecha_pago),
                    comprobante_url: primarySigned,
                    signed_url: primarySigned,
                    comprobantes_count: finalCount,
                    comprobantes: matchedComps,
                    suggested_match: suggestedMatch ? {
                        id: suggestedMatch.id,
                        origen_tipo: suggestedMatch.origen_tipo,
                        documento: suggestedMatch.documento,
                        concepto: suggestedMatch.concepto,
                        fecha_display: suggestedMatch.fecha_display,
                        monto_display: suggestedMatch.monto_display,
                        ya_conciliado: Boolean(suggestedMatch.fecha_aplicado)
                    } : null
                };
            });
        } catch (_errSug) {
            sugerenciasControlPagos = [];
        }

        // 9. Identificación de Transferencias Internas (Vinculadas + Sugerencias de Espejos)
        let sugerenciasEspejo = [];
        try {
            const unlinkedLocalMovs = [...movimientosConciliados, ...pendientes]
                .filter(r => r.origen_tipo === 'MOV' && !r.transfer_group_id);
            if (unlinkedLocalMovs.length > 0) {
                const dateWindowMin = unlinkedLocalMovs.reduce((minD, m) => (!minD || (m.fecha_ymd && m.fecha_ymd < minD) ? m.fecha_ymd : minD), null) || dbDesde;
                const dateWindowMax = unlinkedLocalMovs.reduce((maxD, m) => (!maxD || (m.fecha_ymd && m.fecha_ymd > maxD) ? m.fecha_ymd : maxD), null) || dbHasta;
                const [otherUnlinkedRows] = await withRetry(() => db.query(
                    `SELECT mb.id, mb.empresa_id, mb.cuenta_bancaria_id, mb.fecha, mb.fecha_aplicado,
                            mb.documento, mb.concepto, mb.monto, mb.cargo, mb.abono, mb.transfer_group_id,
                            cb.numero AS numero_cuenta, cb.nombre AS cuenta_nombre,
                            b.descripcion AS banco_nombre, e.codigo AS empresa_codigo, e.nombre AS empresa_nombre
                     FROM movimientos_bancarios mb
                     LEFT JOIN cuentas_bancarias cb ON mb.cuenta_bancaria_id = cb.id
                     LEFT JOIN bancos b ON cb.banco_id = b.id
                     LEFT JOIN empresas e ON mb.empresa_id = e.id
                     WHERE mb.transfer_group_id IS NULL
                       AND mb.deleted_at IS NULL
                       AND mb.cuenta_bancaria_id != ?
                       AND mb.fecha BETWEEN DATE_SUB(?, INTERVAL 5 DAY) AND DATE_ADD(?, INTERVAL 5 DAY)
                     ORDER BY mb.fecha DESC, mb.id DESC
                     LIMIT 300`,
                    [cuentaId, dateWindowMin, dateWindowMax]
                ));
                sugerenciasEspejo = findMirrorTransferSuggestions({
                    cuentaId,
                    cuentaEmpresaId: cuenta.empresa_id,
                    localMovs: unlinkedLocalMovs,
                    otherMovs: otherUnlinkedRows || []
                });
            }
        } catch (_) {
            sugerenciasEspejo = [];
        }

        const vinculadasInternas = [...movimientosConciliados, ...pendientes]
            .filter(r => r.es_transferencia_interna)
            .map(r => {
                const localConc = Boolean(r.fecha_aplicado);
                const cpConc = Boolean(r.transfer_contraparte?.conciliado);
                let estadoSimetria = 'AMBAS_PENDIENTES';
                if (localConc && cpConc) estadoSimetria = 'AMBAS_CONCILIADAS';
                else if (localConc && !cpConc) estadoSimetria = 'FALTA_CONTRAPARTE';
                else if (!localConc && cpConc) estadoSimetria = 'FALTA_ACTUAL';
                return {
                    id: Number(r.id),
                    origen_tipo: 'MOV',
                    transfer_group_id: r.transfer_group_id,
                    fecha_ymd: r.fecha_ymd,
                    fecha_display: r.fecha_display,
                    fecha_aplicado_ymd: r.fecha_aplicado_ymd,
                    fecha_aplicado_display: r.fecha_aplicado_display,
                    conciliado: localConc,
                    documento: r.documento || '',
                    concepto: r.concepto || '',
                    direccion: Number(r.cargo || 0) > 0 ? 'CARGO' : 'ABONO',
                    monto: Number(r.monto_display || r.monto || 0),
                    transfer_contraparte: r.transfer_contraparte || null,
                    simetrica: localConc && cpConc,
                    estado_simetria: estadoSimetria,
                    signed_url: r.signed_url || r.comprobante_url || null,
                    comprobantes_count: r.comprobantes_count || 0
                };
            });

        const transferenciasInternas = {
            vinculadas: vinculadasInternas,
            sugerencias_espejo: sugerenciasEspejo,
            total_vinculadas: vinculadasInternas.length,
            total_asimetricas: vinculadasInternas.filter(v => v.estado_simetria === 'FALTA_ACTUAL' || v.estado_simetria === 'FALTA_CONTRAPARTE').length,
            total_sugerencias_espejo: sugerenciasEspejo.length
        };

        res.json({
            cuenta,
            movimientos_conciliados: movimientosConciliados,
            pendientes,
            sugerencias_control_pagos: sugerenciasControlPagos,
            periodos_recientes: periodosRecientes,
            solicitudes_reapertura_pendientes: solicitudesPendientes,
            aging_resumen: agingSummary,
            aging_cheques: agingSummary,
            cruces_activos: crucesActivos,
            transferencias_internas: transferenciasInternas,
            resumen: {
                saldo_banco: saldoBanco,
                saldo_chequera: summary.saldo_chequera,
                saldo_conciliado_libros: summary.saldo_conciliado_libros,
                abonos_en_transito: summary.abonos_en_transito,
                cargos_en_transito: summary.cargos_en_transito,
                cheques_en_transito: summary.cheques_en_transito,
                cargos_cheques_en_transito: summary.cargos_cheques_en_transito,
                saldo_inicial: summary.saldo_inicial,
                fecha_saldo_inicial: summary.fecha_saldo_inicial,
                cheques_reservados_count: summary.cheques_reservados_count,
                cheques_reservados_monto: summary.cheques_reservados_monto,
                diferencia,
                diferencia_vs_chequera: diferenciaVsChequera,
                periodo_cerrado_hasta: periodoCerradoHasta,
                aging_resumen: agingSummary,
                ultima_validacion: ultimaValidacion ? {
                    id: ultimaValidacion.id,
                    fecha_validacion: ultimaValidacion.fecha_validacion,
                    fecha_corte: parseStrictDBDate(ultimaValidacion.fecha_corte),
                    monto_banco: Number(ultimaValidacion.monto_banco),
                    saldo_chequera: Number(ultimaValidacion.saldo_chequera),
                    saldo_conciliado_libros: Number(ultimaValidacion.saldo_conciliado_libros || ultimaValidacion.saldo_chequera || 0),
                    diferencia: Number(ultimaValidacion.diferencia),
                    notas: ultimaValidacion.notas
                } : null
            }
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar conciliación');
    }
});

// ── 3. Aplicar o Desconciliar Masivamente ────────────────────────────────────
router.post('/aplicar', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const { items, fecha_aplicado, accion, cuenta_bancaria_id } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Debe seleccionar al menos un documento.' });
    }
    if (items.length > 500) {
        return res.status(400).json({ message: 'Máximo 500 documentos por lote de conciliación.' });
    }

    const esConciliar = accion !== 'DESCONCILIAR';
    const defaultDbFecha = esConciliar ? parseStrictDBDate(fecha_aplicado || getElSalvadorTodayYMD()) : null;
    if (esConciliar && !defaultDbFecha) {
        return res.status(400).json({ message: 'La fecha de aplicación enviada no es válida (use YYYY-MM-DD).' });
    }

    const expectedCuentaId = cuenta_bancaria_id ? parseInt(cuenta_bancaria_id, 10) : null;
    const normalizedItems = [];
    for (const raw of items) {
        const id = parseInt(raw?.id, 10);
        const tipo = String(raw?.origen_tipo || raw?.tipo || '').toUpperCase();
        if (!Number.isInteger(id) || id <= 0 || (tipo !== 'MOV' && tipo !== 'CK')) {
            return res.status(400).json({ message: 'Uno o más documentos seleccionados tienen identificador o tipo inválido.' });
        }
        let itemFecha = defaultDbFecha;
        if (esConciliar && raw?.fecha_aplicado) {
            itemFecha = parseStrictDBDate(raw.fecha_aplicado);
            if (!itemFecha) {
                return res.status(400).json({ message: `Fecha de aplicación inválida para documento #${id}.` });
            }
        }
        normalizedItems.push({ id, tipo, fecha_aplicado: itemFecha });
    }

    const idempotencyKey = getIdempotencyKey(req);

    try {
        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'conciliacion_aplicar',
                    userId: req.user?.id,
                    payload: { items: normalizedItems, accion: esConciliar ? 'CONCILIAR' : 'DESCONCILIAR' }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            const abortTx = async (errorStatus, errorBody) => {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'conciliacion_aplicar');
                return { errorStatus, errorBody };
            };

            const movItems = normalizedItems.filter(i => i.tipo === 'MOV');
            const chkItems = normalizedItems.filter(i => i.tipo === 'CK');
            const movIds = [...new Set(movItems.map(i => i.id))];
            const chkIds = [...new Set(chkItems.map(i => i.id))];

            const foundAccounts = new Set();
            const datesToVerifyByAccount = new Map();
            const addDateCheck = (ctaId, d) => {
                if (!d) return;
                if (!datesToVerifyByAccount.has(ctaId)) datesToVerifyByAccount.set(ctaId, []);
                datesToVerifyByAccount.get(ctaId).push(d);
            };

            let movRows = [];
            if (movIds.length > 0) {
                const [rows] = await conn.query(
                    `SELECT id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, deleted_at
                     FROM movimientos_bancarios WHERE id IN (${movIds.map(() => '?').join(',')}) FOR UPDATE`,
                    movIds
                );
                movRows = rows || [];
                if (movRows.length !== movIds.length) {
                    return abortTx(404, { message: 'Uno o más movimientos bancarios no existen.' });
                }
                for (const m of movRows) {
                    if (m.deleted_at) {
                        return abortTx(409, { message: `El movimiento #${m.id} fue eliminado y no puede modificarse.` });
                    }
                    foundAccounts.add(Number(m.cuenta_bancaria_id));
                    const targetItem = movItems.find(x => x.id === m.id);
                    addDateCheck(Number(m.cuenta_bancaria_id), m.fecha_aplicado);
                    if (esConciliar) addDateCheck(Number(m.cuenta_bancaria_id), targetItem?.fecha_aplicado);
                }
            }

            let chkRows = [];
            if (chkIds.length > 0) {
                const [rows] = await conn.query(
                    `SELECT id, cuenta_bancaria_id, fecha, fecha_aplicado, cheque, concepto, valor, cheque_anulado, fue_noemitido, es_reservado, deleted_at
                     FROM cheques WHERE id IN (${chkIds.map(() => '?').join(',')}) FOR UPDATE`,
                    chkIds
                );
                chkRows = rows || [];
                if (chkRows.length !== chkIds.length) {
                    return abortTx(404, { message: 'Uno o más cheques no existen.' });
                }
                for (const ch of chkRows) {
                    if (ch.deleted_at) {
                        return abortTx(409, { message: `El cheque #${ch.cheque || ch.id} fue eliminado y no puede modificarse.` });
                    }
                    if (ch.cheque_anulado || ch.fue_noemitido || ch.es_reservado) {
                        return abortTx(409, { message: `El cheque #${ch.cheque || ch.id} está anulado, reservado o no emitido.` });
                    }
                    foundAccounts.add(Number(ch.cuenta_bancaria_id));
                    const targetItem = chkItems.find(x => x.id === ch.id);
                    addDateCheck(Number(ch.cuenta_bancaria_id), ch.fecha_aplicado);
                    if (esConciliar) addDateCheck(Number(ch.cuenta_bancaria_id), targetItem?.fecha_aplicado);
                }
            }

            if (foundAccounts.size > 1) {
                return abortTx(400, { message: 'Todos los documentos del lote deben pertenecer a la misma cuenta bancaria.' });
            }
            const targetCuentaId = [...foundAccounts][0];
            if (expectedCuentaId && targetCuentaId !== expectedCuentaId) {
                return abortTx(403, { message: 'Los documentos no pertenecen a la cuenta bancaria seleccionada.' });
            }

            // Verificar si algún documento pertenece a un cruce agrupado ACTIVO antes de conciliar o desconciliar
            try {
                const [activeCruces] = await conn.query(
                    `SELECT id FROM conciliacion_cruces WHERE cuenta_bancaria_id = ? AND estado = 'ACTIVO'`,
                    [targetCuentaId]
                );
                const validActiveCruces = (activeCruces || []).filter(
                    (c) => Number(c.cuenta_bancaria_id ?? targetCuentaId) === targetCuentaId &&
                        String(c.estado || 'ACTIVO').toUpperCase() === 'ACTIVO'
                );
                const activeCruceIds = validActiveCruces.map((c) => Number(c.id));
                if (activeCruceIds.length > 0) {
                    const [cruceItems] = await conn.query(
                        `SELECT id, cruce_id, origen_tipo, entidad_id FROM conciliacion_cruce_items WHERE cruce_id IN (${activeCruceIds.map(() => '?').join(',')})`,
                        activeCruceIds
                    );
                    const activeCruceIdSet = new Set(activeCruceIds);
                    const movIdSet = new Set(movIds.map(Number));
                    const chkIdSet = new Set(chkIds.map(Number));
                    const conflictingItem = (cruceItems || []).find((ci) =>
                        activeCruceIdSet.has(Number(ci.cruce_id)) &&
                        ((ci.origen_tipo === 'MOV' && movIdSet.has(Number(ci.entidad_id))) ||
                         (ci.origen_tipo === 'CK' && chkIdSet.has(Number(ci.entidad_id))))
                    );
                    if (conflictingItem) {
                        return abortTx(409, {
                            message: `El documento ${conflictingItem.origen_tipo} #${conflictingItem.entidad_id} pertenece al cruce agrupado activo #${conflictingItem.cruce_id}. Debe gestionar o desconciliar el cruce completo.`,
                            cruce_id: Number(conflictingItem.cruce_id)
                        });
                    }
                }
            } catch (errCruceGuard) {
                if (!isNoSuchTableError(errCruceGuard)) throw errCruceGuard;
            }

            if (esConciliar) {
                for (const m of movRows) {
                    if (m.fecha_aplicado) {
                        return abortTx(409, {
                            message: `El movimiento #${m.id} ya se encuentra conciliado (${toDisplayDate(m.fecha_aplicado)}). Desconcilie primero antes de re-aplicar.`
                        });
                    }
                }
                for (const ch of chkRows) {
                    if (ch.fecha_aplicado) {
                        return abortTx(409, {
                            message: `El cheque #${ch.cheque || ch.id} ya se encuentra conciliado (${toDisplayDate(ch.fecha_aplicado)}). Desconcilie primero antes de re-aplicar.`
                        });
                    }
                }
            }

            // Verificar período cerrado
            const lockCheck = await isDateInClosedPeriod(conn, targetCuentaId, datesToVerifyByAccount.get(targetCuentaId) || []);
            if (lockCheck.closed) {
                return abortTx(423, {
                    message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para modificar movimientos en fecha ${toDisplayDate(lockCheck.offendingDate)}.`,
                    locked_until: lockCheck.lockedDate,
                    periodo_id: lockCheck.periodo?.id
                });
            }

            let actualizados = 0;
            if (esConciliar) {
                for (const item of movItems) {
                    const [upd] = await conn.query(
                        'UPDATE movimientos_bancarios SET fecha_aplicado = ?, conciliado_by = ?, conciliado_at = NOW(), version = version + 1 WHERE id = ? AND deleted_at IS NULL',
                        [item.fecha_aplicado, req.user?.id || null, item.id]
                    );
                    actualizados += Number(upd.affectedRows || 0);
                }
                for (const item of chkItems) {
                    const [upd] = await conn.query(
                        'UPDATE cheques SET fecha_aplicado = ?, conciliado_by = ?, conciliado_at = NOW(), version = version + 1 WHERE id = ? AND deleted_at IS NULL',
                        [item.fecha_aplicado, req.user?.id || null, item.id]
                    );
                    actualizados += Number(upd.affectedRows || 0);
                }
            } else {
                if (movIds.length > 0) {
                    const [upd] = await conn.query(
                        `UPDATE movimientos_bancarios SET fecha_aplicado = NULL, conciliado_by = NULL, conciliado_at = NULL, version = version + 1 WHERE id IN (${movIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
                        movIds
                    );
                    actualizados += Number(upd.affectedRows || 0);
                    // Revertir estado_conciliacion en recordatorios_pagos_abonos vinculados si existen
                    try {
                        await conn.query(
                            `UPDATE recordatorios_pagos_abonos SET estado_conciliacion = 'PENDIENTE', movimiento_bancario_id = NULL WHERE movimiento_bancario_id IN (${movIds.map(() => '?').join(',')}) AND estado_conciliacion = 'CONCILIADO'`,
                            movIds
                        );
                    } catch (_) { /* tabla opcional */ }
                }
                if (chkIds.length > 0) {
                    const [upd] = await conn.query(
                        `UPDATE cheques SET fecha_aplicado = NULL, conciliado_by = NULL, conciliado_at = NULL, version = version + 1 WHERE id IN (${chkIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
                        chkIds
                    );
                    actualizados += Number(upd.affectedRows || 0);
                    try {
                        await conn.query(
                            `UPDATE recordatorios_pagos_abonos SET estado_conciliacion = 'PENDIENTE', cheque_id = NULL WHERE cheque_id IN (${chkIds.map(() => '?').join(',')}) AND estado_conciliacion = 'CONCILIADO'`,
                            chkIds
                        );
                    } catch (_) { /* tabla opcional */ }
                }
            }

            await recordBankAudit(conn, {
                cuentaBancariaId: targetCuentaId,
                entidad: 'conciliacion_lote',
                entidadId: `${movIds.length}M_${chkIds.length}C`,
                accion: esConciliar ? 'CONCILIAR' : 'DESCONCILIAR',
                user: req.user,
                ipAddress: req.ip,
                before: {
                    movimientos: movRows.map(m => ({ id: m.id, fecha_aplicado: parseStrictDBDate(m.fecha_aplicado), monto: Number(m.monto) })),
                    cheques: chkRows.map(c => ({ id: c.id, fecha_aplicado: parseStrictDBDate(c.fecha_aplicado), valor: Number(c.valor) }))
                },
                after: {
                    fecha_aplicado: defaultDbFecha,
                    items: normalizedItems,
                    actualizados
                }
            });

            const body = {
                message: esConciliar
                    ? `Se conciliaron ${actualizados} documento(s) con fecha ${toDisplayDate(defaultDbFecha)}.`
                    : `Se desconciliaron ${actualizados} documento(s) exitosamente.`,
                actualizados,
                cuenta_bancaria_id: targetCuentaId
            };

            if (idempotencyKey) {
                await saveIdempotentResponse(conn, {
                    key: idempotencyKey,
                    scope: 'conciliacion_aplicar',
                    statusCode: 200,
                    responseBody: body
                });
            }

            return { statusCode: 200, body, targetCuentaId, actualizados };
        });

        if (txResult.conflict) {
            return res.status(409).json({ message: 'Solicitud duplicada en proceso. Espere unos segundos.' });
        }
        if (txResult.replayed) {
            return res.status(txResult.statusCode).json(txResult.body);
        }
        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: txResult.targetCuentaId,
            count: txResult.actualizados,
            accion: esConciliar ? 'CONCILIAR' : 'DESCONCILIAR',
            actor_user_id: req.user?.id || null
        });

        res.json(txResult.body);
    } catch (error) {
        sendSafeError(res, error, 'Error al aplicar cambios en conciliación');
    }
});

// ── 4. Registrar Validación de Saldo en Banco (y Cierre Opcional de Período) ──
router.post('/validar-saldo', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const {
        cuenta_bancaria_id,
        monto_banco,
        fecha_corte,
        hasta,
        notas,
        cerrar_periodo = false,
        confirmar_con_diferencia = false
    } = req.body || {};

    const cuentaId = parseInt(cuenta_bancaria_id, 10);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
        return res.status(400).json({ message: 'Cuenta bancaria requerida.' });
    }

    const montoBancoNum = parseStrictFiniteAmount(monto_banco);
    if (montoBancoNum === null) {
        return res.status(400).json({ message: 'El saldo en banco ingresado no es válido.' });
    }

    const dbFechaCorte = parseStrictDBDate(fecha_corte || hasta || getElSalvadorTodayYMD());
    if (!dbFechaCorte) {
        return res.status(400).json({ message: 'La fecha de corte no es válida.' });
    }

    if (cerrar_periodo && !canCloseConciliacion(req.user)) {
        return res.status(403).json({ message: 'No cuenta con permisos para cerrar períodos de conciliación.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            if (cerrar_periodo) {
                const [[ctaLock]] = await conn.query(
                    'SELECT id FROM cuentas_bancarias WHERE id = ? FOR UPDATE',
                    [cuentaId]
                );
                if (!ctaLock) {
                    return { errorStatus: 404, errorBody: { message: 'Cuenta bancaria no encontrada.' } };
                }
            }

            const summary = await computeAccountReconciliationSummary(conn, cuentaId, dbFechaCorte);
            if (!summary) {
                return { errorStatus: 404, errorBody: { message: 'Cuenta bancaria no encontrada.' } };
            }

            if (cerrar_periodo) {
                const [existingPeriodos] = await conn.query(
                    'SELECT id, fecha_corte, estado FROM conciliacion_periodos WHERE cuenta_bancaria_id = ? FOR UPDATE',
                    [cuentaId]
                );
                const blockingPeriodo = (existingPeriodos || []).find((p) => {
                    if (p.estado !== 'CERRADO') return false;
                    const pFecha = parseStrictDBDate(p.fecha_corte);
                    return pFecha && pFecha >= dbFechaCorte;
                });
                if (blockingPeriodo) {
                    return {
                        errorStatus: 409,
                        errorBody: {
                            message: `Ya existe un período cerrado hasta el ${toDisplayDate(blockingPeriodo.fecha_corte)} que cubre la fecha solicitada (${toDisplayDate(dbFechaCorte)}). Debe solicitar y aprobar la reapertura primero.`
                        }
                    };
                }
            }

            const diferenciaReal = round2(montoBancoNum - summary.saldo_conciliado_libros);
            if (cerrar_periodo && Math.abs(diferenciaReal) >= 0.01 && !confirmar_con_diferencia) {
                return {
                    errorStatus: 400,
                    errorBody: {
                        message: `Existe una diferencia de $${diferenciaReal.toFixed(2)} respecto al saldo conciliado en libros. Confirme explícitamente si desea cerrar con diferencia.`,
                        requires_confirmation: true,
                        diferencia: diferenciaReal
                    }
                };
            }

            const snapshotObj = {
                ...summary,
                monto_banco: montoBancoNum,
                diferencia: diferenciaReal,
                fecha_corte: dbFechaCorte
            };

            const [result] = await conn.query(
                `INSERT INTO validaciones_saldo_banco
                    (cuenta_bancaria_id, fecha_validacion, fecha_corte, monto_banco, saldo_chequera,
                     saldo_conciliado_libros, abonos_en_transito, cargos_cheques_en_transito,
                     diferencia, notas, snapshot_json, created_by)
                 VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    cuentaId,
                    dbFechaCorte,
                    montoBancoNum,
                    summary.saldo_chequera,
                    summary.saldo_conciliado_libros,
                    summary.abonos_en_transito,
                    summary.cargos_cheques_en_transito,
                    diferenciaReal,
                    String(notas || '').slice(0, 1000),
                    JSON.stringify(snapshotObj),
                    req.user?.id || null
                ]
            );

            let periodoRow = null;
            if (cerrar_periodo) {
                const actorName = req.user?.nombre || req.user?.username || 'Usuario';
                await conn.query(
                    `INSERT INTO conciliacion_periodos
                        (cuenta_bancaria_id, fecha_corte, estado, saldo_banco, saldo_chequera,
                         saldo_conciliado_libros, abonos_en_transito, cargos_cheques_en_transito,
                         diferencia, snapshot_json, notas, cerrado_by, cerrado_por_nombre, cerrado_at)
                     VALUES (?, ?, 'CERRADO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE
                        estado = 'CERRADO',
                        saldo_banco = VALUES(saldo_banco),
                        saldo_chequera = VALUES(saldo_chequera),
                        saldo_conciliado_libros = VALUES(saldo_conciliado_libros),
                        abonos_en_transito = VALUES(abonos_en_transito),
                        cargos_cheques_en_transito = VALUES(cargos_cheques_en_transito),
                        diferencia = VALUES(diferencia),
                        snapshot_json = VALUES(snapshot_json),
                        notas = VALUES(notas),
                        cerrado_by = VALUES(cerrado_by),
                        cerrado_por_nombre = VALUES(cerrado_por_nombre),
                        cerrado_at = NOW()`,
                    [
                        cuentaId,
                        dbFechaCorte,
                        montoBancoNum,
                        summary.saldo_chequera,
                        summary.saldo_conciliado_libros,
                        summary.abonos_en_transito,
                        summary.cargos_cheques_en_transito,
                        diferenciaReal,
                        JSON.stringify(snapshotObj),
                        String(notas || '').slice(0, 1000),
                        req.user?.id || null,
                        String(actorName).slice(0, 150)
                    ]
                );

                const [[pSaved]] = await conn.query(
                    'SELECT * FROM conciliacion_periodos WHERE cuenta_bancaria_id = ? AND fecha_corte = ? LIMIT 1',
                    [cuentaId, dbFechaCorte]
                );
                periodoRow = pSaved || null;
            }

            const [[saved]] = await conn.query('SELECT * FROM validaciones_saldo_banco WHERE id = ?', [result.insertId]);

            await recordBankAudit(conn, {
                cuentaBancariaId: cuentaId,
                entidad: cerrar_periodo ? 'conciliacion_periodo' : 'validacion_saldo',
                entidadId: cerrar_periodo ? (periodoRow?.id || dbFechaCorte) : result.insertId,
                accion: cerrar_periodo ? 'VALIDAR_Y_CERRAR_PERIODO' : 'VALIDAR_SALDO',
                user: req.user,
                ipAddress: req.ip,
                after: snapshotObj
            });

            return { saved, periodoRow, summary, diferenciaReal };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: cuentaId,
            accion: cerrar_periodo ? 'PERIODO_CERRADO' : 'VALIDAR_SALDO',
            actor_user_id: req.user?.id || null
        });

        res.json({
            message: cerrar_periodo
                ? `Validación guardada y período cerrado al ${toDisplayDate(dbFechaCorte)}.`
                : 'Validación de saldo guardada exitosamente (recalculada en servidor).',
            validacion: txResult.saved,
            periodo: txResult.periodoRow,
            resumen_recalculado: {
                ...txResult.summary,
                monto_banco: montoBancoNum,
                diferencia: txResult.diferenciaReal
            }
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al guardar validación');
    }
});

// ── 5. Parser y Auto-Matcher de Extractos Bancarios (CSV/TSV + Gemini PDF/Img)
router.post('/parse-extracto', express.json({ limit: '20mb' }), authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const { cuenta_id, cuenta_bancaria_id, raw_data, banco_formato } = req.body || {};
    const cuentaId = parseInt(cuenta_id || cuenta_bancaria_id, 10);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0 || !raw_data) {
        return res.status(400).json({ message: 'Faltan datos requeridos (cuenta válida y datos de extracto).' });
    }

    try {
        const db = getDb();
        const ctx = await loadStatementMatchingContext(db, cuentaId);
        if (!ctx) {
            return res.status(404).json({ message: 'Cuenta bancaria no encontrada.' });
        }

        const parsed = parseAndMatchBankStatement({
            rawData: raw_data,
            bancoFormato: banco_formato || 'AUTO',
            pendientes: ctx.pendientes,
            conciliadosExistentes: ctx.conciliadosExistentes,
            rules: ctx.rules,
            tiposRemesas: ctx.tiposRemesas,
            allTiposRemesas: ctx.allTiposRemesas,
            cuentaId,
            empresaId: ctx.cuenta.empresa_id,
            bancoCodigo: ctx.cuenta.banco_codigo,
            otrasCuentasInternas: ctx.otrasCuentasInternas,
            movimientosOtrasCuentas: ctx.movimientosOtrasCuentas,
            transferCounterpartsByGroup: ctx.transferCounterpartsByGroup
        });

        let extractoYaImportado = null;
        try {
            const [impRows] = await withRetry(() => db.query(
                `SELECT id, created_at, total_filas, creados_count, conciliados_count
                 FROM conciliacion_importaciones
                 WHERE cuenta_bancaria_id = ? AND file_hash = ?
                 ORDER BY id DESC LIMIT 1`,
                [cuentaId, parsed.file_hash]
            ));
            if (impRows && impRows.length > 0) {
                extractoYaImportado = impRows[0];
            }
        } catch (_) { /* ignore */ }

        res.json({
            ...parsed,
            extracto_ya_importado: extractoYaImportado
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al parsear extracto bancario');
    }
});

async function handleParseMultimodalStatement(req, res) {
    const {
        cuenta_id,
        cuenta_bancaria_id,
        data_url,
        base64,
        file_base64,
        mime_type,
        mimeType,
        files,
        pages,
        archivos,
        banco_formato,
        archivo_nombre,
        nombre_original
    } = req.body || {};

    const cuentaId = parseInt(cuenta_id || cuenta_bancaria_id, 10);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
        return res.status(400).json({ message: 'Debe especificar una cuenta bancaria válida.' });
    }

    try {
        const db = getDb();
        const ctx = await loadStatementMatchingContext(db, cuentaId);
        if (!ctx) {
            return res.status(404).json({ message: 'Cuenta bancaria no encontrada.' });
        }

        const parsed = await extractBankStatementWithGemini({
            files,
            pages,
            archivos,
            data_url,
            base64,
            file_base64,
            mime_type,
            mimeType,
            bancoFormato: banco_formato || 'AUTO',
            pendientes: ctx.pendientes,
            conciliadosExistentes: ctx.conciliadosExistentes,
            rules: ctx.rules,
            tiposRemesas: ctx.tiposRemesas,
            allTiposRemesas: ctx.allTiposRemesas,
            cuentaId,
            empresaId: ctx.cuenta.empresa_id,
            bancoCodigo: ctx.cuenta.banco_codigo,
            otrasCuentasInternas: ctx.otrasCuentasInternas,
            movimientosOtrasCuentas: ctx.movimientosOtrasCuentas,
            transferCounterpartsByGroup: ctx.transferCounterpartsByGroup
        });

        let extractoYaImportado = null;
        try {
            const [impRows] = await withRetry(() => db.query(
                `SELECT id, created_at, total_filas, creados_count, conciliados_count
                 FROM conciliacion_importaciones
                 WHERE cuenta_bancaria_id = ? AND file_hash = ?
                 ORDER BY id DESC LIMIT 1`,
                [cuentaId, parsed.file_hash]
            ));
            if (impRows && impRows.length > 0) {
                extractoYaImportado = impRows[0];
            }
        } catch (_) { /* ignore */ }

        res.json({
            ...parsed,
            archivo_nombre: archivo_nombre || nombre_original || null,
            extracto_ya_importado: extractoYaImportado
        });
    } catch (error) {
        if (error && Number(error.statusCode) >= 400 && Number(error.statusCode) < 500) {
            return res.status(Number(error.statusCode)).json({ message: error.message });
        }
        if (error && Number(error.statusCode) === 502) {
            return res.status(502).json({ message: error.message });
        }
        sendSafeError(res, error, 'Error al analizar estado de cuenta con IA');
    }
}

router.post('/parse-extracto-pdf', express.json({ limit: '20mb' }), authenticateToken, requirePermission(conciliacionManagePerms), handleParseMultimodalStatement);
router.post('/importar-pdf', express.json({ limit: '20mb' }), authenticateToken, requirePermission(conciliacionManagePerms), handleParseMultimodalStatement);

// ── 5.1. Crear Movimiento y Conciliar Directamente ─────────────────────────
router.post('/crear-y-aplicar', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const {
        cuenta_bancaria_id,
        fecha,
        fecha_aplicado,
        documento,
        concepto,
        monto,
        tipo,
        tipo_remesa_codigo,
        tipo_remesa_id,
        num_partida,
        cod_cta,
        aplicar_inmediatamente,
        permitir_duplicado = false
    } = req.body || {};

    const cuentaId = parseInt(cuenta_bancaria_id, 10);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
        return res.status(400).json({ message: 'Cuenta bancaria requerida.' });
    }

    const montoNum = parseStrictPositiveAmount(monto);
    if (montoNum === null) {
        return res.status(400).json({ message: 'El monto debe ser un valor numérico mayor a $0.00.' });
    }

    const dbFecha = fecha ? parseStrictDBDate(fecha) : getElSalvadorTodayYMD();
    if (!dbFecha) {
        return res.status(400).json({ message: 'La fecha de emisión no es válida.' });
    }

    const aplicarNow = aplicar_inmediatamente !== false;
    const dbFechaAplicado = aplicarNow ? parseStrictDBDate(fecha_aplicado || dbFecha) : null;
    if (aplicarNow && !dbFechaAplicado) {
        return res.status(400).json({ message: 'La fecha de aplicación no es válida.' });
    }

    const direction = normalizeMovementDirection({
        tipo,
        codRemesa: tipo_remesa_codigo,
        descripcion: concepto
    });
    const cargo = direction === 'CARGO' ? montoNum : 0;
    const abono = direction === 'ABONO' ? montoNum : 0;
    const cleanConcepto = String(concepto || '').trim().toUpperCase().slice(0, 255);
    if (!cleanConcepto) {
        return res.status(400).json({ message: 'El concepto es requerido.' });
    }
    const cleanDocumento = String(documento || '').trim().slice(0, 100);
    const fingerprint = computeMovementFingerprint({
        cuentaBancariaId: cuentaId,
        fecha: dbFecha,
        documento: cleanDocumento,
        cargo,
        abono,
        concepto: cleanConcepto
    });

    const idempotencyKey = getIdempotencyKey(req);

    try {
        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'conciliacion_crear_y_aplicar',
                    userId: req.user?.id,
                    payload: { cuentaId, dbFecha, dbFechaAplicado, cleanDocumento, cleanConcepto, montoNum, direction }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            const abortTx = async (errorStatus, errorBody) => {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'conciliacion_crear_y_aplicar');
                return { errorStatus, errorBody };
            };

            const [[cuenta]] = await conn.query(
                'SELECT id, empresa_id, activa FROM cuentas_bancarias WHERE id = ? LIMIT 1',
                [cuentaId]
            );
            if (!cuenta) {
                return abortTx(404, { message: 'Cuenta bancaria no encontrada.' });
            }
            if (!cuenta.activa) {
                return abortTx(409, { message: 'La cuenta bancaria se encuentra inactiva.' });
            }

            const lockCheck = await isDateInClosedPeriod(conn, cuentaId, [dbFecha, dbFechaAplicado]);
            if (lockCheck.closed) {
                return abortTx(423, {
                    message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para registrar en fecha ${toDisplayDate(lockCheck.offendingDate)}.`,
                    locked_until: lockCheck.lockedDate,
                    periodo_id: lockCheck.periodo?.id
                });
            }

            if (!permitir_duplicado) {
                const [dupRows] = await conn.query(
                    `SELECT id, fecha, documento, monto, concepto
                     FROM movimientos_bancarios
                     WHERE cuenta_bancaria_id = ? AND deleted_at IS NULL AND fingerprint = ?
                     LIMIT 1 FOR UPDATE`,
                    [cuentaId, fingerprint]
                );
                if (dupRows && dupRows.length > 0) {
                    return abortTx(409, {
                        message: `Ya existe un movimiento idéntico registrado (#${dupRows[0].id} · ${toDisplayDate(dupRows[0].fecha)} · $${Number(dupRows[0].monto).toFixed(2)}).`,
                        duplicate_of: dupRows[0]
                    });
                }
            }

            let remesaId = tipo_remesa_id ? parseInt(tipo_remesa_id, 10) || null : null;
            if (!remesaId && tipo_remesa_codigo) {
                const [remRows] = await conn.query(
                    'SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ? LIMIT 1',
                    [cuenta.empresa_id, tipo_remesa_codigo]
                );
                if (remRows.length > 0) {
                    remesaId = remRows[0].id;
                } else {
                    const [anyRem] = await conn.query(
                        'SELECT id FROM tipos_remesas WHERE codigo = ? LIMIT 1',
                        [tipo_remesa_codigo]
                    );
                    if (anyRem.length > 0) remesaId = anyRem[0].id;
                }
            }

            const [result] = await conn.query(
                `INSERT INTO movimientos_bancarios
                    (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                     monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                     created_by, conciliado_by, conciliado_at, fingerprint, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    cuenta.empresa_id,
                    cuentaId,
                    dbFecha,
                    dbFechaAplicado,
                    cleanDocumento,
                    cleanConcepto,
                    montoNum,
                    cargo,
                    abono,
                    remesaId,
                    cod_cta || null,
                    num_partida || null,
                    req.user?.id || null,
                    dbFechaAplicado ? (req.user?.id || null) : null,
                    dbFechaAplicado ? new Date() : null,
                    fingerprint
                ]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: cuentaId,
                entidad: 'movimientos_bancarios',
                entidadId: result.insertId,
                accion: 'CREAR_CONCILIACION',
                user: req.user,
                ipAddress: req.ip,
                after: {
                    id: result.insertId,
                    fecha: dbFecha,
                    fecha_aplicado: dbFechaAplicado,
                    documento: cleanDocumento,
                    concepto: cleanConcepto,
                    monto: montoNum,
                    cargo,
                    abono
                }
            });

            const body = {
                message: dbFechaAplicado
                    ? 'Movimiento registrado y conciliado exitosamente'
                    : 'Movimiento registrado como pendiente',
                id: result.insertId,
                fecha_aplicado: dbFechaAplicado
            };

            if (idempotencyKey) {
                await saveIdempotentResponse(conn, {
                    key: idempotencyKey,
                    scope: 'conciliacion_crear_y_aplicar',
                    statusCode: 201,
                    responseBody: body
                });
            }

            return { statusCode: 201, body };
        });

        if (txResult.conflict) {
            return res.status(409).json({ message: 'Solicitud duplicada en proceso. Espere unos segundos.' });
        }
        if (txResult.replayed) {
            return res.status(txResult.statusCode).json(txResult.body);
        }
        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: cuentaId,
            id: txResult.body.id,
            accion: 'CREAR',
            actor_user_id: req.user?.id || null
        });

        res.status(201).json(txResult.body);
    } catch (error) {
        sendSafeError(res, error, 'Error al registrar movimiento');
    }
});

// ── 5.2. Crear y Aplicar Movimientos Masivamente (100% Atómico) ──────────────
router.post('/crear-masivo-y-aplicar', express.json({ limit: '20mb' }), authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const {
        cuenta_bancaria_id,
        items = [],
        coincidencias_a_aplicar = [],
        fecha_aplicado_general,
        aplicar_inmediatamente = true,
        omitir_duplicados = true,
        file_hash = null,
        archivo_nombre = null,
        banco_formato = 'AUTO',
        saldo_final_extracto = null
    } = req.body || {};

    const cuentaId = parseInt(cuenta_bancaria_id, 10);
    const itemsArr = Array.isArray(items) ? items : [];
    const coincArr = Array.isArray(coincidencias_a_aplicar) ? coincidencias_a_aplicar : [];

    if (!Number.isInteger(cuentaId) || cuentaId <= 0 || (itemsArr.length === 0 && coincArr.length === 0)) {
        return res.status(400).json({ message: 'Debe especificar la cuenta bancaria y al menos un movimiento o coincidencia.' });
    }
    if (itemsArr.length + coincArr.length > 2000) {
        return res.status(400).json({ message: 'El lote supera el límite máximo permitido de 2,000 filas.' });
    }

    const aplicarNow = aplicar_inmediatamente !== false;
    const generalFechaApl = fecha_aplicado_general ? parseStrictDBDate(fecha_aplicado_general) : getElSalvadorTodayYMD();
    if (aplicarNow && fecha_aplicado_general && !generalFechaApl) {
        return res.status(400).json({ message: 'La fecha de aplicación general no es válida.' });
    }

    // Pre-validación estricta de todas las filas antes de tocar la base de datos
    const validationErrors = [];
    const preparedItems = [];
    for (let idx = 0; idx < itemsArr.length; idx++) {
        const item = itemsArr[idx] || {};
        const montoNum = parseStrictPositiveAmount(item.monto);
        if (montoNum === null) {
            validationErrors.push(`Fila #${idx + 1}: monto inválido (${item.monto}).`);
            continue;
        }
        const dbFecha = parseStrictDBDate(item.fecha_ymd || item.fecha);
        if (!dbFecha) {
            validationErrors.push(`Fila #${idx + 1}: fecha inválida (${item.fecha}).`);
            continue;
        }
        const dbFechaApl = aplicarNow
            ? parseStrictDBDate(item.fecha_aplicado || dbFecha || generalFechaApl)
            : null;
        if (aplicarNow && !dbFechaApl) {
            validationErrors.push(`Fila #${idx + 1}: fecha de aplicación inválida.`);
            continue;
        }
        const direction = normalizeMovementDirection({
            tipo: item.tipo,
            codRemesa: item.tipo_remesa_codigo,
            descripcion: item.descripcion || item.concepto
        });
        const cargo = direction === 'CARGO' ? montoNum : 0;
        const abono = direction === 'ABONO' ? montoNum : 0;
        const tipoCodigo = item.tipo_remesa_codigo || (direction === 'CARGO' ? 'NC' : 'RM');
        const rawTipoRemesaId = item.tipo_remesa_id ? parseInt(item.tipo_remesa_id, 10) || null : null;
        const cleanCodCta = item.cod_cta ? String(item.cod_cta).trim().slice(0, 50) : null;
        const cleanNumPartida = item.num_partida ? String(item.num_partida).trim().slice(0, 50) : null;
        const cleanDoc = String(item.documento || '').trim().slice(0, 100);
        const cleanConcepto = String(item.concepto_limpio || item.descripcion || item.concepto || `${tipoCodigo} EXTRACTO`).trim().toUpperCase().slice(0, 255);
        const fingerprint = computeMovementFingerprint({
            cuentaBancariaId: cuentaId,
            fecha: dbFecha,
            documento: cleanDoc,
            cargo,
            abono,
            concepto: cleanConcepto
        });

        preparedItems.push({
            idx,
            dbFecha,
            dbFechaApl,
            cleanDoc,
            cleanConcepto,
            cleanCodCta,
            cleanNumPartida,
            rawTipoRemesaId,
            montoNum,
            cargo,
            abono,
            tipoCodigo,
            fingerprint
        });
    }

    const preparedCoincidencias = [];
    for (let idx = 0; idx < coincArr.length; idx++) {
        const c = coincArr[idx] || {};
        const id = parseInt(c.id, 10);
        const tipo = String(c.origen_tipo || c.tipo || '').toUpperCase();
        const fApl = parseStrictDBDate(c.fecha_aplicado || generalFechaApl);
        if (!Number.isInteger(id) || id <= 0 || (tipo !== 'MOV' && tipo !== 'CK') || !fApl) {
            validationErrors.push(`Coincidencia #${idx + 1}: datos inválidos.`);
            continue;
        }
        preparedCoincidencias.push({ id, tipo, fecha_aplicado: fApl });
    }

    if (validationErrors.length > 0) {
        return res.status(400).json({
            message: `El lote contiene ${validationErrors.length} fila(s) con errores y no fue procesado.`,
            errors: validationErrors.slice(0, 25)
        });
    }

    const idempotencyKey = getIdempotencyKey(req);

    try {
        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'conciliacion_crear_masivo',
                    userId: req.user?.id,
                    payload: { cuentaId, file_hash, itemsCount: preparedItems.length, coincCount: preparedCoincidencias.length }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            const abortTx = async (errorStatus, errorBody) => {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'conciliacion_crear_masivo');
                return { errorStatus, errorBody };
            };

            const [[cuenta]] = await conn.query(
                'SELECT id, empresa_id, activa FROM cuentas_bancarias WHERE id = ? LIMIT 1',
                [cuentaId]
            );
            if (!cuenta) {
                return abortTx(404, { message: 'Cuenta bancaria no encontrada.' });
            }
            if (!cuenta.activa) {
                return abortTx(409, { message: 'La cuenta bancaria se encuentra inactiva.' });
            }

            // Validar fechas contra período cerrado antes de insertar nada
            const allDates = [
                ...preparedItems.flatMap(i => [i.dbFecha, i.dbFechaApl]),
                ...preparedCoincidencias.map(c => c.fecha_aplicado)
            ];
            const lockCheck = await isDateInClosedPeriod(conn, cuentaId, allDates);
            if (lockCheck.closed) {
                return abortTx(423, {
                    message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. El lote incluye la fecha ${toDisplayDate(lockCheck.offendingDate)}. Solicite reapertura primero.`,
                    locked_until: lockCheck.lockedDate,
                    periodo_id: lockCheck.periodo?.id
                });
            }

            // 1. Aplicar coincidencias dentro de la misma transacción
            let conciliadosCount = 0;
            const movCoinc = preparedCoincidencias.filter(c => c.tipo === 'MOV');
            const chkCoinc = preparedCoincidencias.filter(c => c.tipo === 'CK');

            if (movCoinc.length > 0) {
                const movIds = movCoinc.map(c => c.id);
                const [existingMovs] = await conn.query(
                    `SELECT id, cuenta_bancaria_id, fecha_aplicado, deleted_at FROM movimientos_bancarios WHERE id IN (${movIds.map(() => '?').join(',')}) FOR UPDATE`,
                    movIds
                );
                if (existingMovs.length !== new Set(movIds).size) {
                    return abortTx(404, { message: 'Una o más coincidencias de movimientos no existen.' });
                }
                for (const m of existingMovs) {
                    if (Number(m.cuenta_bancaria_id) !== cuentaId || m.deleted_at) {
                        return abortTx(409, { message: `El movimiento #${m.id} no pertenece a la cuenta o fue eliminado.` });
                    }
                }
                for (const mc of movCoinc) {
                    const [u] = await conn.query(
                        'UPDATE movimientos_bancarios SET fecha_aplicado = ?, conciliado_by = ?, conciliado_at = NOW(), version = version + 1 WHERE id = ? AND deleted_at IS NULL',
                        [mc.fecha_aplicado, req.user?.id || null, mc.id]
                    );
                    conciliadosCount += Number(u.affectedRows || 0);
                }
            }

            if (chkCoinc.length > 0) {
                const chkIds = chkCoinc.map(c => c.id);
                const [existingChks] = await conn.query(
                    `SELECT id, cuenta_bancaria_id, cheque_anulado, fue_noemitido, es_reservado, deleted_at FROM cheques WHERE id IN (${chkIds.map(() => '?').join(',')}) FOR UPDATE`,
                    chkIds
                );
                if (existingChks.length !== new Set(chkIds).size) {
                    return abortTx(404, { message: 'Una o más coincidencias de cheques no existen.' });
                }
                for (const ch of existingChks) {
                    if (Number(ch.cuenta_bancaria_id) !== cuentaId || ch.deleted_at || ch.cheque_anulado || ch.fue_noemitido || ch.es_reservado) {
                        return abortTx(409, { message: `El cheque #${ch.id} no es conciliable.` });
                    }
                }
                for (const cc of chkCoinc) {
                    const [u] = await conn.query(
                        'UPDATE cheques SET fecha_aplicado = ?, conciliado_by = ?, conciliado_at = NOW(), version = version + 1 WHERE id = ? AND deleted_at IS NULL',
                        [cc.fecha_aplicado, req.user?.id || null, cc.id]
                    );
                    conciliadosCount += Number(u.affectedRows || 0);
                }
            }

            // 2. Verificar duplicados por fingerprint contra BD y dentro del mismo lote
            const existingFingerprints = new Set();
            if (preparedItems.length > 0) {
                const fps = [...new Set(preparedItems.map(p => p.fingerprint))];
                const [dupRows] = await conn.query(
                    `SELECT fingerprint FROM movimientos_bancarios WHERE cuenta_bancaria_id = ? AND deleted_at IS NULL AND fingerprint IN (${fps.map(() => '?').join(',')}) FOR UPDATE`,
                    [cuentaId, ...fps]
                );
                for (const d of (dupRows || [])) {
                    if (d.fingerprint) existingFingerprints.add(d.fingerprint);
                }
            }

            const [tiposRemesas] = await conn.query(
                'SELECT id, codigo FROM tipos_remesas WHERE empresa_id = ?',
                [cuenta.empresa_id]
            );
            const remesaMap = new Map();
            const companyRemesaIds = new Set();
            tiposRemesas.forEach(tr => {
                remesaMap.set(String(tr.codigo || '').toUpperCase(), Number(tr.id));
                companyRemesaIds.add(Number(tr.id));
            });

            // Si algún item trae tipo_remesa_id de otra empresa (ej. regla global), resolver por código en la empresa de la cuenta
            const foreignRemesaCodeMap = new Map();
            const unknownRemesaIds = [...new Set(
                preparedItems
                    .map(i => i.rawTipoRemesaId)
                    .filter(id => id && !companyRemesaIds.has(id))
            )];
            if (unknownRemesaIds.length > 0) {
                const [allTrRows] = await conn.query(
                    `SELECT id, codigo FROM tipos_remesas WHERE id IN (${unknownRemesaIds.map(() => '?').join(',')})`,
                    unknownRemesaIds
                );
                for (const tr of (allTrRows || [])) {
                    foreignRemesaCodeMap.set(Number(tr.id), String(tr.codigo || '').toUpperCase());
                }
            }

            // 3. Registrar cabecera de importación
            const [batchRes] = await conn.query(
                `INSERT INTO conciliacion_importaciones
                    (cuenta_bancaria_id, banco_formato, file_hash, archivo_nombre, total_filas,
                     creados_count, conciliados_count, duplicados_omitidos, saldo_final_extracto, created_by)
                 VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
                [
                    cuentaId,
                    String(banco_formato || 'AUTO').slice(0, 40),
                    String(file_hash || 'MANUAL').slice(0, 64),
                    archivo_nombre ? String(archivo_nombre).slice(0, 255) : null,
                    preparedItems.length + preparedCoincidencias.length,
                    saldo_final_extracto !== null && saldo_final_extracto !== undefined ? parseStrictFiniteAmount(saldo_final_extracto) : null,
                    req.user?.id || null
                ]
            );
            const batchId = batchRes.insertId;

            let creadosCount = 0;
            let duplicadosOmitidos = 0;
            const seenBatchFps = new Set();

            for (const item of preparedItems) {
                const isDup = existingFingerprints.has(item.fingerprint) || seenBatchFps.has(item.fingerprint);
                if (isDup) {
                    if (!omitir_duplicados) {
                        throw Object.assign(new Error(`Movimiento duplicado en fila #${item.idx + 1}: ${item.cleanConcepto} ($${item.montoNum.toFixed(2)})`), { status: 409 });
                    }
                    duplicadosOmitidos++;
                    continue;
                }
                seenBatchFps.add(item.fingerprint);

                let remesaId = null;
                if (item.rawTipoRemesaId && companyRemesaIds.has(item.rawTipoRemesaId)) {
                    remesaId = item.rawTipoRemesaId;
                } else if (item.rawTipoRemesaId && foreignRemesaCodeMap.has(item.rawTipoRemesaId)) {
                    remesaId = remesaMap.get(foreignRemesaCodeMap.get(item.rawTipoRemesaId)) || null;
                }
                if (!remesaId) {
                    remesaId = remesaMap.get(String(item.tipoCodigo || '').toUpperCase()) || null;
                }

                await conn.query(
                    `INSERT INTO movimientos_bancarios
                        (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                         monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                         created_by, conciliado_by, conciliado_at, import_batch_id, fingerprint, version)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [
                        cuenta.empresa_id,
                        cuentaId,
                        item.dbFecha,
                        item.dbFechaApl,
                        item.cleanDoc,
                        item.cleanConcepto,
                        item.montoNum,
                        item.cargo,
                        item.abono,
                        remesaId,
                        item.cleanCodCta,
                        item.cleanNumPartida,
                        req.user?.id || null,
                        item.dbFechaApl ? (req.user?.id || null) : null,
                        item.dbFechaApl ? new Date() : null,
                        batchId,
                        item.fingerprint
                    ]
                );
                creadosCount++;
            }

            await conn.query(
                `UPDATE conciliacion_importaciones
                 SET creados_count = ?, conciliados_count = ?, duplicados_omitidos = ?
                 WHERE id = ?`,
                [creadosCount, conciliadosCount, duplicadosOmitidos, batchId]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: cuentaId,
                entidad: 'conciliacion_importacion',
                entidadId: batchId,
                accion: 'IMPORTAR_LOTE_EXTRACTO',
                user: req.user,
                ipAddress: req.ip,
                after: {
                    batch_id: batchId,
                    creados: creadosCount,
                    conciliados: conciliadosCount,
                    duplicados_omitidos: duplicadosOmitidos,
                    file_hash
                }
            });

            const body = {
                message: `Lote procesado atómicamente: ${creadosCount} creado(s), ${conciliadosCount} conciliado(s)${duplicadosOmitidos > 0 ? `, ${duplicadosOmitidos} duplicado(s) omitido(s)` : ''}.`,
                creados: creadosCount,
                conciliados: conciliadosCount,
                duplicados_omitidos: duplicadosOmitidos,
                import_batch_id: batchId
            };

            if (idempotencyKey) {
                await saveIdempotentResponse(conn, {
                    key: idempotencyKey,
                    scope: 'conciliacion_crear_masivo',
                    statusCode: 200,
                    responseBody: body
                });
            }

            return { statusCode: 200, body };
        });

        if (txResult.conflict) {
            return res.status(409).json({ message: 'Importación duplicada en proceso. Espere unos segundos.' });
        }
        if (txResult.replayed) {
            return res.status(txResult.statusCode).json(txResult.body);
        }
        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: cuentaId,
            count: (txResult.body.creados || 0) + (txResult.body.conciliados || 0),
            accion: 'CREAR_MASIVO',
            actor_user_id: req.user?.id || null
        });

        res.json(txResult.body);
    } catch (error) {
        if (error.status === 409) {
            return res.status(409).json({ message: error.message });
        }
        sendSafeError(res, error, 'Error al procesar movimientos en lote');
    }
});

// ── 6. Edición Controlada de Movimiento ──────────────────────────────────────
router.put('/movimiento/:id', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de registro inválido.' });
    }

    const { concepto, documento, fecha, monto, origen_tipo, version } = req.body || {};
    const isCheque = String(origen_tipo || '').toUpperCase() === 'CK';
    const tienePermisoMonto = canEditMontoConciliacion(req.user);

    try {
        const txResult = await withTransaction(async (conn) => {
            if (isCheque) {
                const [[chk]] = await conn.query('SELECT * FROM cheques WHERE id = ? FOR UPDATE', [id]);
                if (!chk || chk.deleted_at) {
                    return { errorStatus: 404, errorBody: { message: 'Cheque no encontrado' } };
                }
                if (chk.es_contabilizado) {
                    return { errorStatus: 409, errorBody: { message: 'Este cheque ya está contabilizado y no puede editarse.' } };
                }
                if (version !== undefined && Number(version) !== Number(chk.version || 1)) {
                    return { errorStatus: 409, errorBody: { message: 'El cheque fue modificado por otro usuario. Recargue los datos.' } };
                }

                let nuevoMonto = Number(chk.valor);
                if (monto !== undefined && round2(monto) !== round2(chk.valor)) {
                    if (!tienePermisoMonto) {
                        return { errorStatus: 403, errorBody: { message: 'No tienes autorización para modificar el monto de un cheque.' } };
                    }
                    const parsed = parseStrictPositiveAmount(monto);
                    if (parsed === null) {
                        return { errorStatus: 400, errorBody: { message: 'El monto debe ser mayor a $0.00.' } };
                    }
                    nuevoMonto = parsed;
                }

                const dbFecha = fecha !== undefined ? parseStrictDBDate(fecha) : parseStrictDBDate(chk.fecha);
                if (!dbFecha) {
                    return { errorStatus: 400, errorBody: { message: 'Fecha inválida.' } };
                }

                const lockCheck = await isDateInClosedPeriod(conn, chk.cuenta_bancaria_id, [chk.fecha, dbFecha, chk.fecha_aplicado]);
                if (lockCheck.closed) {
                    return {
                        errorStatus: 423,
                        errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para editar este cheque.` }
                    };
                }

                const newConcepto = concepto !== undefined ? String(concepto).trim().toUpperCase().slice(0, 255) : (chk.concepto || '');
                const newDoc = documento !== undefined ? String(documento).trim().slice(0, 20) : (chk.cheque || '');

                await conn.query(
                    'UPDATE cheques SET concepto = ?, cheque = ?, fecha = ?, valor = ?, updated_by = ?, version = version + 1 WHERE id = ?',
                    [newConcepto, newDoc, dbFecha, nuevoMonto, req.user?.id || null, id]
                );

                await recordBankAudit(conn, {
                    cuentaBancariaId: chk.cuenta_bancaria_id,
                    entidad: 'cheques',
                    entidadId: id,
                    accion: 'UPDATE_CONCILIACION',
                    user: req.user,
                    ipAddress: req.ip,
                    before: { concepto: chk.concepto, cheque: chk.cheque, fecha: parseStrictDBDate(chk.fecha), valor: Number(chk.valor) },
                    after: { concepto: newConcepto, cheque: newDoc, fecha: dbFecha, valor: nuevoMonto }
                });

                return { cuentaId: chk.cuenta_bancaria_id };
            }

            const [[mov]] = await conn.query('SELECT * FROM movimientos_bancarios WHERE id = ? FOR UPDATE', [id]);
            if (!mov || mov.deleted_at) {
                return { errorStatus: 404, errorBody: { message: 'Movimiento no encontrado' } };
            }
            if (mov.es_contabilizado) {
                return { errorStatus: 409, errorBody: { message: 'Este movimiento ya está contabilizado y no puede editarse.' } };
            }
            if (version !== undefined && Number(version) !== Number(mov.version || 1)) {
                return { errorStatus: 409, errorBody: { message: 'El movimiento fue modificado por otro usuario. Recargue los datos.' } };
            }

            let nuevoMonto = Number(mov.monto);
            if (monto !== undefined && round2(monto) !== round2(mov.monto)) {
                if (!tienePermisoMonto) {
                    return { errorStatus: 403, errorBody: { message: 'No tienes autorización para modificar el monto de un movimiento bancario.' } };
                }
                const parsed = parseStrictPositiveAmount(monto);
                if (parsed === null) {
                    return { errorStatus: 400, errorBody: { message: 'El monto debe ser mayor a $0.00.' } };
                }
                nuevoMonto = parsed;
            }

            const dbFecha = fecha !== undefined ? parseStrictDBDate(fecha) : parseStrictDBDate(mov.fecha);
            if (!dbFecha) {
                return { errorStatus: 400, errorBody: { message: 'Fecha inválida.' } };
            }

            const lockCheck = await isDateInClosedPeriod(conn, mov.cuenta_bancaria_id, [mov.fecha, dbFecha, mov.fecha_aplicado]);
            if (lockCheck.closed) {
                return {
                    errorStatus: 423,
                    errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para editar este movimiento.` }
                };
            }

            const esCargo = Number(mov.cargo) > 0;
            const nuevoCargo = esCargo ? nuevoMonto : 0;
            const nuevoAbono = !esCargo ? nuevoMonto : 0;
            const newConcepto = concepto !== undefined ? String(concepto).trim().toUpperCase().slice(0, 255) : (mov.concepto || '');
            const newDoc = documento !== undefined ? String(documento).trim().slice(0, 100) : (mov.documento || '');
            const newFp = computeMovementFingerprint({
                cuentaBancariaId: mov.cuenta_bancaria_id,
                fecha: dbFecha,
                documento: newDoc,
                cargo: nuevoCargo,
                abono: nuevoAbono,
                concepto: newConcepto
            });

            await conn.query(
                'UPDATE movimientos_bancarios SET concepto = ?, documento = ?, fecha = ?, monto = ?, cargo = ?, abono = ?, fingerprint = ?, updated_by = ?, version = version + 1 WHERE id = ?',
                [newConcepto, newDoc, dbFecha, nuevoMonto, nuevoCargo, nuevoAbono, newFp, req.user?.id || null, id]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: mov.cuenta_bancaria_id,
                entidad: 'movimientos_bancarios',
                entidadId: id,
                accion: 'UPDATE_CONCILIACION',
                user: req.user,
                ipAddress: req.ip,
                before: { concepto: mov.concepto, documento: mov.documento, fecha: parseStrictDBDate(mov.fecha), monto: Number(mov.monto), cargo: Number(mov.cargo), abono: Number(mov.abono) },
                after: { concepto: newConcepto, documento: newDoc, fecha: dbFecha, monto: nuevoMonto, cargo: nuevoCargo, abono: nuevoAbono }
            });

            return { cuentaId: mov.cuenta_bancaria_id };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: txResult.cuentaId,
            id,
            accion: 'EDITAR',
            actor_user_id: req.user?.id || null
        });

        res.json({ message: 'Registro actualizado correctamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar registro');
    }
});

// ── 7. Vincular o Crear y Conciliar Sugerencia de Control de Pagos ───────────
router.post('/vincular-control-pago', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const {
        abono_id,
        accion = 'VINCULAR', // 'VINCULAR' | 'CREAR_Y_CONCILIAR' | 'DESCARTAR'
        movimiento_bancario_id = null,
        origen_tipo = 'MOV',
        fecha_aplicado = null
    } = req.body || {};

    const parsedAbonoId = parseInt(abono_id, 10);
    if (!Number.isInteger(parsedAbonoId) || parsedAbonoId <= 0) {
        return res.status(400).json({ message: 'Debe indicar el ID del pago de Control de Pagos.' });
    }

    if (!['VINCULAR', 'CREAR_Y_CONCILIAR', 'DESCARTAR'].includes(accion)) {
        return res.status(400).json({ message: 'Acción no válida.' });
    }

    try {
        await ensureRecordatoriosPagosTables(getDb());
        const txResult = await withTransaction(async (conn) => {
            const [[abono]] = await conn.query(
                'SELECT * FROM recordatorios_pagos_abonos WHERE id = ? LIMIT 1 FOR UPDATE',
                [parsedAbonoId]
            );
            if (!abono) {
                return { errorStatus: 404, errorBody: { message: 'Registro de pago no encontrado.' } };
            }
            if (abono.estado_conciliacion !== 'PENDIENTE') {
                return { errorStatus: 409, errorBody: { message: `Este pago ya fue procesado con estado ${abono.estado_conciliacion}.` } };
            }

            if (accion === 'DESCARTAR') {
                await conn.query(
                    "UPDATE recordatorios_pagos_abonos SET estado_conciliacion = 'NO_APLICA' WHERE id = ?",
                    [parsedAbonoId]
                );
                await recordBankAudit(conn, {
                    cuentaBancariaId: abono.cuenta_bancaria_id || null,
                    entidad: 'control_pagos_abono',
                    entidadId: parsedAbonoId,
                    accion: 'DESCARTAR_CONTROL_PAGO',
                    user: req.user,
                    ipAddress: req.ip,
                    before: { estado_conciliacion: abono.estado_conciliacion },
                    after: { estado_conciliacion: 'NO_APLICA' }
                });
                return {
                    cuentaId: abono.cuenta_bancaria_id,
                    body: { success: true, message: 'Sugerencia descartada de conciliación.' }
                };
            }

            const dbFechaAplicado = parseStrictDBDate(fecha_aplicado || abono.fecha_pago || getElSalvadorTodayYMD());
            if (!dbFechaAplicado) {
                return { errorStatus: 400, errorBody: { message: 'Fecha de aplicación inválida.' } };
            }

            if (accion === 'VINCULAR') {
                const targetId = movimiento_bancario_id ? parseInt(movimiento_bancario_id, 10) || null : null;
                if (!targetId) {
                    return { errorStatus: 400, errorBody: { message: 'Debe indicar el documento bancario a vincular.' } };
                }
                const abonoMonto = round2(abono.monto || 0);

                let linkedMovId = null;
                let linkedChkId = null;
                if (origen_tipo === 'CK') {
                    const [[chk]] = await conn.query(
                        'SELECT id, cuenta_bancaria_id, valor, fecha_aplicado, cheque_anulado, fue_noemitido, es_reservado, deleted_at FROM cheques WHERE id = ? FOR UPDATE',
                        [targetId]
                    );
                    if (!chk || chk.deleted_at || chk.cheque_anulado || chk.fue_noemitido || chk.es_reservado) {
                        return { errorStatus: 404, errorBody: { message: 'Cheque destino no encontrado o no conciliable.' } };
                    }
                    if (abono.cuenta_bancaria_id && Number(chk.cuenta_bancaria_id) !== Number(abono.cuenta_bancaria_id)) {
                        return { errorStatus: 403, errorBody: { message: 'El cheque no pertenece a la misma cuenta bancaria del pago.' } };
                    }
                    const chkMonto = round2(chk.valor || 0);
                    if (Math.abs(chkMonto - abonoMonto) > 0.01) {
                        return { errorStatus: 400, errorBody: { message: `El monto del cheque ($${chkMonto.toFixed(2)}) no coincide con el monto del pago ($${abonoMonto.toFixed(2)}).` } };
                    }
                    const [linkedAbonos] = await conn.query(
                        'SELECT id, estado_conciliacion FROM recordatorios_pagos_abonos WHERE cheque_id = ? FOR UPDATE',
                        [targetId]
                    );
                    const conflictAbono = (linkedAbonos || []).find(
                        (a) => a.estado_conciliacion === 'CONCILIADO' && Number(a.id) !== parsedAbonoId
                    );
                    if (conflictAbono) {
                        return { errorStatus: 409, errorBody: { message: `El cheque #${targetId} ya se encuentra vinculado al pago conciliado #${conflictAbono.id}.` } };
                    }
                    const lockCheck = await isDateInClosedPeriod(conn, chk.cuenta_bancaria_id, [chk.fecha_aplicado || dbFechaAplicado]);
                    if (lockCheck.closed) {
                        return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}.` } };
                    }
                    if (!chk.fecha_aplicado) {
                        await conn.query(
                            'UPDATE cheques SET fecha_aplicado = ?, conciliado_by = ?, conciliado_at = NOW(), version = version + 1 WHERE id = ?',
                            [dbFechaAplicado, req.user?.id || null, targetId]
                        );
                    }
                    linkedChkId = targetId;
                } else {
                    const [[mov]] = await conn.query(
                        'SELECT id, cuenta_bancaria_id, monto, cargo, abono, fecha_aplicado, deleted_at FROM movimientos_bancarios WHERE id = ? FOR UPDATE',
                        [targetId]
                    );
                    if (!mov || mov.deleted_at) {
                        return { errorStatus: 404, errorBody: { message: 'Movimiento bancario destino no encontrado.' } };
                    }
                    if (abono.cuenta_bancaria_id && Number(mov.cuenta_bancaria_id) !== Number(abono.cuenta_bancaria_id)) {
                        return { errorStatus: 403, errorBody: { message: 'El movimiento no pertenece a la misma cuenta bancaria del pago.' } };
                    }
                    const movMonto = round2(mov.monto || mov.cargo || mov.abono || 0);
                    if (Math.abs(movMonto - abonoMonto) > 0.01) {
                        return { errorStatus: 400, errorBody: { message: `El monto del movimiento ($${movMonto.toFixed(2)}) no coincide con el monto del pago ($${abonoMonto.toFixed(2)}).` } };
                    }
                    const [linkedAbonos] = await conn.query(
                        'SELECT id, estado_conciliacion FROM recordatorios_pagos_abonos WHERE movimiento_bancario_id = ? FOR UPDATE',
                        [targetId]
                    );
                    const conflictAbono = (linkedAbonos || []).find(
                        (a) => a.estado_conciliacion === 'CONCILIADO' && Number(a.id) !== parsedAbonoId
                    );
                    if (conflictAbono) {
                        return { errorStatus: 409, errorBody: { message: `El movimiento bancario #${targetId} ya se encuentra vinculado al pago conciliado #${conflictAbono.id}.` } };
                    }
                    const lockCheck = await isDateInClosedPeriod(conn, mov.cuenta_bancaria_id, [mov.fecha_aplicado || dbFechaAplicado]);
                    if (lockCheck.closed) {
                        return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}.` } };
                    }
                    if (!mov.fecha_aplicado) {
                        await conn.query(
                            'UPDATE movimientos_bancarios SET fecha_aplicado = ?, conciliado_by = ?, conciliado_at = NOW(), version = version + 1 WHERE id = ?',
                            [dbFechaAplicado, req.user?.id || null, targetId]
                        );
                    }
                    linkedMovId = targetId;
                }

                await conn.query(
                    "UPDATE recordatorios_pagos_abonos SET estado_conciliacion = 'CONCILIADO', movimiento_bancario_id = ?, cheque_id = ? WHERE id = ?",
                    [linkedMovId, linkedChkId, parsedAbonoId]
                );

                await recordBankAudit(conn, {
                    cuentaBancariaId: abono.cuenta_bancaria_id,
                    entidad: 'control_pagos_abono',
                    entidadId: parsedAbonoId,
                    accion: 'VINCULAR_CONTROL_PAGO',
                    user: req.user,
                    ipAddress: req.ip,
                    after: { origen_tipo, target_id: targetId, movimiento_bancario_id: linkedMovId, cheque_id: linkedChkId, fecha_aplicado: dbFechaAplicado }
                });

                return {
                    cuentaId: abono.cuenta_bancaria_id,
                    body: { success: true, message: 'Pago de Control de Pagos vinculado y conciliado.' }
                };
            }

            // CREAR_Y_CONCILIAR
            if (!abono.cuenta_bancaria_id) {
                return { errorStatus: 400, errorBody: { message: 'El pago no tiene cuenta bancaria asociada.' } };
            }
            const [[cuenta]] = await conn.query(
                'SELECT id, empresa_id, cod_cta, activa FROM cuentas_bancarias WHERE id = ? LIMIT 1',
                [abono.cuenta_bancaria_id]
            );
            if (!cuenta || !cuenta.activa) {
                return { errorStatus: 404, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva.' } };
            }

            const monto = parseStrictPositiveAmount(abono.monto);
            if (monto === null) {
                return { errorStatus: 400, errorBody: { message: 'El monto del pago es inválido.' } };
            }

            const fechaMov = parseStrictDBDate(abono.fecha_pago) || getElSalvadorTodayYMD();
            const lockCheck = await isDateInClosedPeriod(conn, cuenta.id, [fechaMov, dbFechaAplicado]);
            if (lockCheck.closed) {
                return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}.` } };
            }

            const isIngreso = abono.tipo_operacion === 'CXC';
            const cargo = isIngreso ? 0 : monto;
            const abonoVal = isIngreso ? monto : 0;
            const documento = String(abono.referencia_doc || `CP-${abono.vencimiento_id}-${abono.id}`).slice(0, 100);
            const concepto = `[CONTROL PAGOS · ${abono.metodo_pago}] ${abono.descripcion_ref || ''}${abono.beneficiario ? ` · A FAVOR DE: ${abono.beneficiario}` : ''}${abono.ubicacion ? ` (${abono.ubicacion})` : ''}${abono.notas ? ` - ${abono.notas}` : ''}`
                .toUpperCase()
                .slice(0, 255);

            const tipoCodigo = isIngreso ? 'NA' : 'TR';
            const [remRows] = await conn.query(
                'SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ? LIMIT 1',
                [cuenta.empresa_id, tipoCodigo]
            );
            const remesaId = remRows?.[0]?.id || null;
            const fingerprint = computeMovementFingerprint({
                cuentaBancariaId: cuenta.id,
                fecha: fechaMov,
                documento,
                cargo,
                abono: abonoVal,
                concepto
            });

            const [ins] = await conn.query(
                `INSERT INTO movimientos_bancarios
                    (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                     monto, cargo, abono, tipo_remesa_id, cod_cta, es_contabilizado,
                     created_by, conciliado_by, conciliado_at, fingerprint, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NOW(), ?, 1)`,
                [
                    cuenta.empresa_id,
                    cuenta.id,
                    fechaMov,
                    dbFechaAplicado,
                    documento,
                    concepto,
                    monto,
                    cargo,
                    abonoVal,
                    remesaId,
                    cuenta.cod_cta || '',
                    req.user?.id || null,
                    req.user?.id || null,
                    fingerprint
                ]
            );

            await conn.query(
                "UPDATE recordatorios_pagos_abonos SET estado_conciliacion = 'CONCILIADO', movimiento_bancario_id = ?, cheque_id = NULL WHERE id = ?",
                [ins.insertId, parsedAbonoId]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: cuenta.id,
                entidad: 'control_pagos_abono',
                entidadId: parsedAbonoId,
                accion: 'CREAR_Y_CONCILIAR_CONTROL_PAGO',
                user: req.user,
                ipAddress: req.ip,
                after: { movimiento_bancario_id: ins.insertId, monto, fecha: fechaMov, fecha_aplicado: dbFechaAplicado }
            });

            return {
                cuentaId: cuenta.id,
                body: {
                    success: true,
                    message: 'Movimiento bancario creado y conciliado desde Control de Pagos.',
                    movimiento_bancario_id: ins.insertId
                }
            };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: txResult.cuentaId,
            accion: 'CONTROL_PAGO',
            actor_user_id: req.user?.id || null
        });

        res.json(txResult.body);
    } catch (error) {
        sendSafeError(res, error, 'Error al conciliar pago desde Control de Pagos');
    }
});

// ── 8. Períodos Cerrados, Solicitudes de Reapertura y Auditoría ──────────────
router.get('/periodos', authenticateToken, requirePermission(conciliacionViewPerms), async (req, res) => {
    const { cuenta_id, all } = req.query;
    try {
        const db = getDb();
        let periodos = [];
        if (cuenta_id) {
            const [rows] = await withRetry(() => db.query(
                `SELECT p.*, cb.numero as cuenta_numero, cb.nombre as cuenta_nombre, b.descripcion as banco_nombre
                 FROM conciliacion_periodos p
                 JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
                 LEFT JOIN bancos b ON cb.banco_id = b.id
                 WHERE p.cuenta_bancaria_id = ?
                 ORDER BY p.fecha_corte DESC
                 LIMIT 50`,
                [parseInt(cuenta_id, 10)]
            ));
            periodos = rows.map(p => ({ ...p, fecha_corte_display: toDisplayDate(p.fecha_corte) }));
        }

        let solicitudesQuery = `
            SELECT s.*, cb.numero as cuenta_numero, cb.nombre as cuenta_nombre, b.descripcion as banco_nombre
            FROM conciliacion_reapertura_solicitudes s
            JOIN cuentas_bancarias cb ON s.cuenta_bancaria_id = cb.id
            LEFT JOIN bancos b ON cb.banco_id = b.id
            WHERE 1=1
        `;
        const params = [];
        if (cuenta_id && all !== '1') {
            solicitudesQuery += ' AND s.cuenta_bancaria_id = ?';
            params.push(parseInt(cuenta_id, 10));
        } else if (all === '1' && !canApproveReapertura(req.user)) {
            return res.status(403).json({ message: 'No autorizado para listar solicitudes globales.' });
        }
        solicitudesQuery += ' ORDER BY FIELD(s.estado, "PENDIENTE", "APROBADA", "RECHAZADA", "CANCELADA"), s.solicitado_at DESC LIMIT 100';

        const [solRows] = await withRetry(() => db.query(solicitudesQuery, params));
        const solicitudes = solRows.map(s => ({ ...s, fecha_corte_display: toDisplayDate(s.fecha_corte) }));

        res.json({
            periodos,
            solicitudes,
            can_approve_reapertura: canApproveReapertura(req.user),
            can_close_periodo: canCloseConciliacion(req.user)
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar períodos de conciliación');
    }
});

router.post('/periodos/cerrar', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    if (!canCloseConciliacion(req.user)) {
        return res.status(403).json({ message: 'No cuenta con permisos para cerrar períodos de conciliación.' });
    }
    const { cuenta_bancaria_id, fecha_corte, monto_banco, notas, confirmar_con_diferencia = false } = req.body || {};
    const cuentaId = parseInt(cuenta_bancaria_id, 10);
    const dbFechaCorte = parseStrictDBDate(fecha_corte);
    const montoBancoNum = parseStrictFiniteAmount(monto_banco);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0 || !dbFechaCorte || montoBancoNum === null) {
        return res.status(400).json({ message: 'Se requiere cuenta bancaria, fecha de corte válida y saldo en banco válido.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[ctaLock]] = await conn.query(
                'SELECT id FROM cuentas_bancarias WHERE id = ? FOR UPDATE',
                [cuentaId]
            );
            if (!ctaLock) {
                return { errorStatus: 404, errorBody: { message: 'Cuenta bancaria no encontrada.' } };
            }

            const [existingPeriodos] = await conn.query(
                'SELECT id, fecha_corte, estado FROM conciliacion_periodos WHERE cuenta_bancaria_id = ? FOR UPDATE',
                [cuentaId]
            );
            const blockingPeriodo = (existingPeriodos || []).find((p) => {
                if (p.estado !== 'CERRADO') return false;
                const pFecha = parseStrictDBDate(p.fecha_corte);
                return pFecha && pFecha >= dbFechaCorte;
            });
            if (blockingPeriodo) {
                return {
                    errorStatus: 409,
                    errorBody: {
                        message: `Ya existe un período cerrado hasta el ${toDisplayDate(blockingPeriodo.fecha_corte)} que cubre la fecha solicitada (${toDisplayDate(dbFechaCorte)}). Debe solicitar y aprobar la reapertura primero.`
                    }
                };
            }

            const summary = await computeAccountReconciliationSummary(conn, cuentaId, dbFechaCorte);
            if (!summary) {
                return { errorStatus: 404, errorBody: { message: 'Cuenta bancaria no encontrada.' } };
            }
            const diferenciaReal = round2(montoBancoNum - summary.saldo_conciliado_libros);
            if (Math.abs(diferenciaReal) >= 0.01 && !confirmar_con_diferencia) {
                return {
                    errorStatus: 400,
                    errorBody: {
                        message: `Diferencia pendiente de $${diferenciaReal.toFixed(2)}. Confirme explícitamente si desea cerrar el período.`,
                        requires_confirmation: true,
                        diferencia: diferenciaReal
                    }
                };
            }

            const snapshotObj = { ...summary, monto_banco: montoBancoNum, diferencia: diferenciaReal, fecha_corte: dbFechaCorte };
            const actorName = req.user?.nombre || req.user?.username || 'Usuario';

            await conn.query(
                `INSERT INTO conciliacion_periodos
                    (cuenta_bancaria_id, fecha_corte, estado, saldo_banco, saldo_chequera,
                     saldo_conciliado_libros, abonos_en_transito, cargos_cheques_en_transito,
                     diferencia, snapshot_json, notas, cerrado_by, cerrado_por_nombre, cerrado_at)
                 VALUES (?, ?, 'CERRADO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                    estado = 'CERRADO',
                    saldo_banco = VALUES(saldo_banco),
                    saldo_chequera = VALUES(saldo_chequera),
                    saldo_conciliado_libros = VALUES(saldo_conciliado_libros),
                    abonos_en_transito = VALUES(abonos_en_transito),
                    cargos_cheques_en_transito = VALUES(cargos_cheques_en_transito),
                    diferencia = VALUES(diferencia),
                    snapshot_json = VALUES(snapshot_json),
                    notas = VALUES(notas),
                    cerrado_by = VALUES(cerrado_by),
                    cerrado_por_nombre = VALUES(cerrado_por_nombre),
                    cerrado_at = NOW()`,
                [
                    cuentaId, dbFechaCorte, montoBancoNum, summary.saldo_chequera,
                    summary.saldo_conciliado_libros, summary.abonos_en_transito,
                    summary.cargos_cheques_en_transito, diferenciaReal,
                    JSON.stringify(snapshotObj), String(notas || '').slice(0, 1000),
                    req.user?.id || null, String(actorName).slice(0, 150)
                ]
            );

            const [[periodo]] = await conn.query(
                'SELECT * FROM conciliacion_periodos WHERE cuenta_bancaria_id = ? AND fecha_corte = ? LIMIT 1',
                [cuentaId, dbFechaCorte]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: cuentaId,
                entidad: 'conciliacion_periodo',
                entidadId: periodo.id,
                accion: 'CERRAR_PERIODO',
                user: req.user,
                ipAddress: req.ip,
                after: snapshotObj
            });

            return { periodo };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: cuentaId,
            accion: 'PERIODO_CERRADO',
            actor_user_id: req.user?.id || null
        });

        res.json({
            message: `Período cerrado exitosamente hasta el ${toDisplayDate(dbFechaCorte)}.`,
            periodo: txResult.periodo
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al cerrar período de conciliación');
    }
});

router.post('/periodos/:id/solicitar-reapertura', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const periodoId = parseInt(req.params.id, 10);
    const motivo = String(req.body?.motivo || '').trim();
    if (!Number.isInteger(periodoId) || periodoId <= 0) {
        return res.status(400).json({ message: 'ID de período inválido.' });
    }
    if (motivo.length < 10) {
        return res.status(400).json({ message: 'Debe indicar un motivo detallado de al menos 10 caracteres.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[periodo]] = await conn.query(
                `SELECT p.*, cb.numero as cuenta_numero, cb.nombre as cuenta_nombre, b.descripcion as banco_nombre
                 FROM conciliacion_periodos p
                 JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
                 LEFT JOIN bancos b ON cb.banco_id = b.id
                 WHERE p.id = ? FOR UPDATE`,
                [periodoId]
            );
            if (!periodo) {
                return { errorStatus: 404, errorBody: { message: 'Período de conciliación no encontrado.' } };
            }
            if (periodo.estado !== 'CERRADO') {
                return { errorStatus: 409, errorBody: { message: 'Este período ya se encuentra abierto.' } };
            }

            const [existingPend] = await conn.query(
                "SELECT id FROM conciliacion_reapertura_solicitudes WHERE periodo_id = ? AND estado = 'PENDIENTE' LIMIT 1 FOR UPDATE",
                [periodoId]
            );
            if (existingPend && existingPend.length > 0) {
                return { errorStatus: 409, errorBody: { message: 'Ya existe una solicitud de reapertura pendiente para este período.' } };
            }

            const solicitanteNombre = req.user?.nombre || req.user?.username || 'Usuario';
            const fechaCorteYmd = parseStrictDBDate(periodo.fecha_corte);
            const [ins] = await conn.query(
                `INSERT INTO conciliacion_reapertura_solicitudes
                    (periodo_id, cuenta_bancaria_id, fecha_corte, estado, motivo_solicitud, solicitado_by, solicitado_por_nombre, solicitado_at)
                 VALUES (?, ?, ?, 'PENDIENTE', ?, ?, ?, NOW())`,
                [periodoId, periodo.cuenta_bancaria_id, fechaCorteYmd, motivo.slice(0, 1000), req.user?.id || 0, String(solicitanteNombre).slice(0, 150)]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: periodo.cuenta_bancaria_id,
                entidad: 'conciliacion_reapertura',
                entidadId: ins.insertId,
                accion: 'SOLICITAR_REAPERTURA',
                user: req.user,
                ipAddress: req.ip,
                motivo: motivo.slice(0, 255),
                after: { periodo_id: periodoId, fecha_corte: fechaCorteYmd, estado: 'PENDIENTE' }
            });

            return {
                solicitudId: ins.insertId,
                periodo,
                fechaCorteDisplay: toDisplayDate(fechaCorteYmd),
                solicitanteNombre
            };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        // Notificar a Admins y usuarios con approve_reapertura_conciliacion
        try {
            const db = getDb();
            const approvers = await getReaperturaApproverIds(db);
            await notifyReaperturaEvent(db, req.io, {
                targetUserIds: approvers,
                type: 'conciliacion_reapertura_solicitud',
                title: 'Solicitud de Reapertura de Conciliación',
                message: `${txResult.solicitanteNombre} solicita reabrir el período cerrado al ${txResult.fechaCorteDisplay} (${txResult.periodo.banco_nombre || ''} ${txResult.periodo.cuenta_numero}). Motivo: ${motivo.slice(0, 160)}`,
                data: {
                    solicitud_id: txResult.solicitudId,
                    periodo_id: periodoId,
                    cuenta_bancaria_id: txResult.periodo.cuenta_bancaria_id,
                    path: '/dashboard/bancos/conciliacion'
                }
            });
        } catch (_) { /* notificación no bloqueante */ }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: txResult.periodo.cuenta_bancaria_id,
            accion: 'REAPERTURA_SOLICITADA',
            actor_user_id: req.user?.id || null
        });

        res.status(201).json({
            message: 'Solicitud de reapertura enviada a los administradores y usuarios autorizados.',
            solicitud_id: txResult.solicitudId
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al solicitar reapertura de período');
    }
});

router.post('/reaperturas/:solicitudId/resolver', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    if (!canApproveReapertura(req.user)) {
        return res.status(403).json({ message: 'Solo administradores o usuarios designados pueden aprobar o rechazar reaperturas.' });
    }

    const solicitudId = parseInt(req.params.solicitudId, 10);
    const decision = String(req.body?.decision || '').trim().toUpperCase();
    const comentario = String(req.body?.comentario || '').trim();
    if (!Number.isInteger(solicitudId) || solicitudId <= 0) {
        return res.status(400).json({ message: 'ID de solicitud inválido.' });
    }
    if (decision !== 'APROBAR' && decision !== 'RECHAZAR') {
        return res.status(400).json({ message: 'La decisión debe ser APROBAR o RECHAZAR.' });
    }
    if (decision === 'RECHAZAR' && comentario.length < 5) {
        return res.status(400).json({ message: 'Debe ingresar un comentario explicando el rechazo.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[sol]] = await conn.query(
                'SELECT * FROM conciliacion_reapertura_solicitudes WHERE id = ? FOR UPDATE',
                [solicitudId]
            );
            if (!sol) {
                return { errorStatus: 404, errorBody: { message: 'Solicitud de reapertura no encontrada.' } };
            }
            if (sol.estado !== 'PENDIENTE') {
                return { errorStatus: 409, errorBody: { message: `La solicitud ya fue resuelta como ${sol.estado}.` } };
            }

            const [[periodo]] = await conn.query(
                'SELECT * FROM conciliacion_periodos WHERE id = ? FOR UPDATE',
                [sol.periodo_id]
            );
            if (!periodo) {
                return { errorStatus: 404, errorBody: { message: 'Período asociado no encontrado.' } };
            }

            const resolverNombre = req.user?.nombre || req.user?.username || 'Administrador';
            const nuevoEstadoSol = decision === 'APROBAR' ? 'APROBADA' : 'RECHAZADA';

            await conn.query(
                `UPDATE conciliacion_reapertura_solicitudes
                 SET estado = ?, resuelto_by = ?, resuelto_por_nombre = ?, resuelto_at = NOW(), comentario_resolucion = ?
                 WHERE id = ?`,
                [nuevoEstadoSol, req.user?.id || null, String(resolverNombre).slice(0, 150), comentario.slice(0, 1000) || null, solicitudId]
            );

            if (decision === 'APROBAR') {
                await conn.query(
                    `UPDATE conciliacion_periodos
                     SET estado = 'REABIERTO', reabierto_by = ?, reabierto_por_nombre = ?, reabierto_at = NOW(),
                         motivo_reapertura = ?
                     WHERE id = ?`,
                    [
                        req.user?.id || null,
                        String(resolverNombre).slice(0, 150),
                        `${sol.motivo_solicitud}${comentario ? ' | Respuesta: ' + comentario : ''}`.slice(0, 1000),
                        periodo.id
                    ]
                );
            }

            await recordBankAudit(conn, {
                cuentaBancariaId: sol.cuenta_bancaria_id,
                entidad: 'conciliacion_reapertura',
                entidadId: solicitudId,
                accion: decision === 'APROBAR' ? 'APROBAR_REAPERTURA' : 'RECHAZAR_REAPERTURA',
                user: req.user,
                ipAddress: req.ip,
                motivo: comentario || sol.motivo_solicitud,
                before: { solicitud_estado: sol.estado, periodo_estado: periodo.estado },
                after: { solicitud_estado: nuevoEstadoSol, periodo_estado: decision === 'APROBAR' ? 'REABIERTO' : periodo.estado }
            });

            return { sol, periodo, nuevoEstadoSol, resolverNombre };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        // Notificar al usuario solicitante
        try {
            if (txResult.sol.solicitado_by) {
                const db = getDb();
                const fechaDisplay = toDisplayDate(txResult.sol.fecha_corte);
                await notifyReaperturaEvent(db, req.io, {
                    targetUserIds: [txResult.sol.solicitado_by],
                    type: 'conciliacion_reapertura_resolucion',
                    title: txResult.nuevoEstadoSol === 'APROBADA' ? 'Reapertura de Conciliación Aprobada' : 'Reapertura de Conciliación Rechazada',
                    message: `${txResult.resolverNombre} ${txResult.nuevoEstadoSol === 'APROBADA' ? 'aprobó' : 'rechazó'} tu solicitud para el corte ${fechaDisplay}.${comentario ? ' Nota: ' + comentario : ''}`,
                    data: {
                        solicitud_id: solicitudId,
                        periodo_id: txResult.periodo.id,
                        cuenta_bancaria_id: txResult.sol.cuenta_bancaria_id,
                        decision: txResult.nuevoEstadoSol,
                        path: '/dashboard/bancos/conciliacion'
                    }
                });
            }
        } catch (_) { /* ignore */ }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: txResult.sol.cuenta_bancaria_id,
            accion: txResult.nuevoEstadoSol === 'APROBADA' ? 'PERIODO_REABIERTO' : 'REAPERTURA_RECHAZADA',
            actor_user_id: req.user?.id || null
        });

        res.json({
            message: txResult.nuevoEstadoSol === 'APROBADA'
                ? 'Reapertura aprobada. El período quedó habilitado para ajustes.'
                : 'Solicitud rechazada.',
            estado: txResult.nuevoEstadoSol
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al resolver solicitud de reapertura');
    }
});

router.post('/periodos/:id/reabrir-directo', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    if (!canApproveReapertura(req.user)) {
        return res.status(403).json({ message: 'Solo administradores o usuarios designados pueden reabrir períodos directamente.' });
    }

    const periodoId = parseInt(req.params.id, 10);
    const motivo = String(req.body?.motivo || '').trim();
    if (!Number.isInteger(periodoId) || periodoId <= 0) {
        return res.status(400).json({ message: 'ID de período inválido.' });
    }
    if (motivo.length < 10) {
        return res.status(400).json({ message: 'Debe indicar un motivo de al menos 10 caracteres para reabrir el período.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[periodo]] = await conn.query('SELECT * FROM conciliacion_periodos WHERE id = ? FOR UPDATE', [periodoId]);
            if (!periodo) {
                return { errorStatus: 404, errorBody: { message: 'Período no encontrado.' } };
            }
            if (periodo.estado !== 'CERRADO') {
                return { errorStatus: 409, errorBody: { message: 'El período ya se encuentra abierto.' } };
            }

            const resolverNombre = req.user?.nombre || req.user?.username || 'Administrador';
            await conn.query(
                `UPDATE conciliacion_periodos
                 SET estado = 'REABIERTO', reabierto_by = ?, reabierto_por_nombre = ?, reabierto_at = NOW(), motivo_reapertura = ?
                 WHERE id = ?`,
                [req.user?.id || null, String(resolverNombre).slice(0, 150), motivo.slice(0, 1000), periodoId]
            );

            await conn.query(
                `UPDATE conciliacion_reapertura_solicitudes
                 SET estado = 'APROBADA', resuelto_by = ?, resuelto_por_nombre = ?, resuelto_at = NOW(), comentario_resolucion = 'Reapertura directa autorizada'
                 WHERE periodo_id = ? AND estado = 'PENDIENTE'`,
                [req.user?.id || null, String(resolverNombre).slice(0, 150), periodoId]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: periodo.cuenta_bancaria_id,
                entidad: 'conciliacion_periodo',
                entidadId: periodoId,
                accion: 'REABRIR_DIRECTO',
                user: req.user,
                ipAddress: req.ip,
                motivo: motivo.slice(0, 255),
                before: { estado: periodo.estado },
                after: { estado: 'REABIERTO' }
            });

            return { periodo };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: txResult.periodo.cuenta_bancaria_id,
            accion: 'PERIODO_REABIERTO',
            actor_user_id: req.user?.id || null
        });

        res.json({ message: 'Período reabierto exitosamente.' });
    } catch (error) {
        sendSafeError(res, error, 'Error al reabrir período');
    }
});

router.get('/auditoria', authenticateToken, requirePermission(conciliacionViewPerms), async (req, res) => {
    const cuentaId = req.query.cuenta_id ? parseInt(req.query.cuenta_id, 10) : null;
    const limit = Math.min(200, Math.max(10, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    try {
        const db = getDb();
        let where = 'WHERE 1=1';
        const params = [];
        if (cuentaId) {
            where += ' AND cuenta_bancaria_id = ?';
            params.push(cuentaId);
        }

        const [[countRow]] = await withRetry(() => db.query(`SELECT COUNT(*) AS total FROM bancos_auditoria_detalle ${where}`, params));
        const [rows] = await withRetry(() => db.query(
            `SELECT * FROM bancos_auditoria_detalle ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        ));

        res.json({
            total: Number(countRow?.total || 0),
            items: (rows || []).map(r => ({
                ...r,
                before_json: typeof r.before_json === 'string' ? JSON.parse(r.before_json) : r.before_json,
                after_json: typeof r.after_json === 'string' ? JSON.parse(r.after_json) : r.after_json,
                metadata_json: typeof r.metadata_json === 'string' ? JSON.parse(r.metadata_json) : r.metadata_json
            }))
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar auditoría bancaria');
    }
});

// ── 9. Reglas de Autoclasificación (R4.2) ────────────────────────────────────
router.get('/reglas', authenticateToken, requirePermission(conciliacionReglasViewPerms), async (req, res) => {
    const cuentaFilter = req.query.cuenta_bancaria_id || req.query.cuenta_id
        ? parseInt(req.query.cuenta_bancaria_id || req.query.cuenta_id, 10)
        : null;
    const bancoFilter = req.query.banco_codigo ? String(req.query.banco_codigo).trim().toUpperCase() : null;
    const activoParam = req.query.activo !== undefined ? String(req.query.activo).trim().toLowerCase() : null;

    try {
        const db = getDb();
        let rawRules = [];
        try {
            const [rows] = await withRetry(() => db.query(
                'SELECT * FROM conciliacion_reglas_clasificacion ORDER BY prioridad ASC, id ASC'
            ));
            rawRules = rows || [];
        } catch (errRules) {
            if (!isNoSuchTableError(errRules)) throw errRules;
        }

        let cuentas = [];
        let bancos = [];
        let tiposRemesas = [];
        try {
            const [cRows] = await withRetry(() => db.query('SELECT id, banco_id, numero, nombre FROM cuentas_bancarias'));
            cuentas = cRows || [];
            const [bRows] = await withRetry(() => db.query('SELECT id, codigo, descripcion FROM bancos'));
            bancos = bRows || [];
            const [trRows] = await withRetry(() => db.query('SELECT id, empresa_id, codigo, descripcion FROM tipos_remesas'));
            tiposRemesas = trRows || [];
        } catch (_) { /* catálogos opcionales */ }

        const cuentaMap = new Map(cuentas.map((c) => [Number(c.id), c]));
        const bancoByCode = new Map(bancos.map((b) => [String(b.codigo || '').toUpperCase(), b]));
        const bancoById = new Map(bancos.map((b) => [Number(b.id), b]));
        const remesaMap = new Map(tiposRemesas.map((tr) => [Number(tr.id), tr]));

        let filtered = rawRules.slice();
        if (Number.isInteger(cuentaFilter) && cuentaFilter > 0) {
            filtered = filtered.filter((r) => Number(r.cuenta_bancaria_id) === cuentaFilter);
        }
        if (bancoFilter) {
            filtered = filtered.filter((r) => String(r.banco_codigo || '').trim().toUpperCase() === bancoFilter);
        }
        if (activoParam === '1' || activoParam === 'true') {
            filtered = filtered.filter((r) => Number(r.activo) === 1);
        } else if (activoParam === '0' || activoParam === 'false') {
            filtered = filtered.filter((r) => Number(r.activo) === 0);
        }

        const enriched = filtered.map((r) => {
            const cta = r.cuenta_bancaria_id ? cuentaMap.get(Number(r.cuenta_bancaria_id)) : null;
            const bco = (cta && bancoById.get(Number(cta.banco_id))) ||
                (r.banco_codigo ? bancoByCode.get(String(r.banco_codigo).toUpperCase()) : null);
            const tr = r.tipo_remesa_id ? remesaMap.get(Number(r.tipo_remesa_id)) : null;
            return {
                ...r,
                id: Number(r.id),
                cuenta_bancaria_id: r.cuenta_bancaria_id ? Number(r.cuenta_bancaria_id) : null,
                tipo_remesa_id: r.tipo_remesa_id ? Number(r.tipo_remesa_id) : null,
                prioridad: Number(r.prioridad ?? 100),
                activo: Number(r.activo ?? 1),
                cuenta_numero: cta?.numero || null,
                cuenta_nombre: cta?.nombre || null,
                banco_nombre: bco?.descripcion || null,
                tipo_remesa_codigo: tr?.codigo || null,
                tipo_remesa_descripcion: tr?.descripcion || null
            };
        });

        res.json({ reglas: enriched, total: enriched.length });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar reglas de autoclasificación');
    }
});

router.post('/reglas/probar', authenticateToken, requirePermission(conciliacionReglasManagePerms), async (req, res) => {
    const body = req.body || {};
    const cuentaId = body.cuenta_bancaria_id || body.cuenta_id ? parseInt(body.cuenta_bancaria_id || body.cuenta_id, 10) : null;
    const bancoCodigo = body.banco_codigo ? String(body.banco_codigo).trim().toUpperCase() : null;

    let rulesToEvaluate = [];
    if (body.patron !== undefined) {
        const check = validateClassificationRulePattern(body.patron, body.tipo_match || 'CONTAINS');
        if (!check.valid) {
            return res.status(400).json({ message: check.message });
        }
        const tipoMov = String(body.tipo_movimiento || 'AMBOS').toUpperCase();
        const signo = String(body.signo || (tipoMov === 'AMBOS' ? 'CUALQUIERA' : tipoMov)).toUpperCase();
        rulesToEvaluate = [{
            id: 0,
            nombre: String(body.nombre || 'Prueba'),
            patron: check.patron,
            tipo_match: check.tipo_match,
            tipo_movimiento: tipoMov,
            signo,
            tipo_remesa_id: body.tipo_remesa_id ? parseInt(body.tipo_remesa_id, 10) || null : null,
            tipo_remesa_codigo: body.tipo_remesa_codigo || null,
            concepto_limpio: body.concepto_limpio || null,
            cod_cta: body.cod_cta || null,
            prioridad: 1,
            activo: 1,
            cuenta_bancaria_id: cuentaId,
            banco_codigo: bancoCodigo
        }];
    }

    try {
        const db = getDb();
        let resolvedBancoCodigo = bancoCodigo;
        let empresaId = null;
        if (cuentaId) {
            const [[cta]] = await withRetry(() => db.query(
                'SELECT cb.id, cb.empresa_id, b.codigo as banco_codigo FROM cuentas_bancarias cb LEFT JOIN bancos b ON cb.banco_id = b.id WHERE cb.id = ? LIMIT 1',
                [cuentaId]
            ));
            if (cta) {
                empresaId = cta.empresa_id;
                if (!resolvedBancoCodigo && cta.banco_codigo) {
                    resolvedBancoCodigo = String(cta.banco_codigo).toUpperCase();
                }
            }
        }

        if (rulesToEvaluate.length === 0) {
            try {
                const [rows] = await withRetry(() => db.query(
                    'SELECT * FROM conciliacion_reglas_clasificacion WHERE activo = 1 ORDER BY prioridad ASC, id ASC'
                ));
                rulesToEvaluate = rows || [];
            } catch (errRules) {
                if (!isNoSuchTableError(errRules)) throw errRules;
                rulesToEvaluate = [];
            }
        }

        const [allTrRows] = await withRetry(() => db.query('SELECT id, empresa_id, codigo, descripcion FROM tipos_remesas'));
        const allTiposRemesas = allTrRows || [];
        const tiposRemesas = empresaId
            ? allTiposRemesas.filter((tr) => Number(tr.empresa_id) === Number(empresaId))
            : allTiposRemesas;

        const rawSamples = Array.isArray(body.items)
            ? body.items
            : (Array.isArray(body.descripciones)
                ? body.descripciones.map((d) => (typeof d === 'string' ? { descripcion: d, tipo: body.tipo || 'CARGO' } : d))
                : [{ descripcion: body.descripcion || '', tipo: body.tipo || 'CARGO', monto: body.monto || 100 }]);

        const sampleTxs = rawSamples.map((s, idx) => ({
            fila_origen: idx + 1,
            descripcion: String(s?.descripcion || s?.concepto || '').trim().toUpperCase(),
            tipo: String(s?.tipo || (Number(s?.cargo || 0) > 0 ? 'CARGO' : 'ABONO')).toUpperCase(),
            monto: Number(s?.monto || 0)
        }));

        const applied = applyClassificationRules(sampleTxs, rulesToEvaluate, tiposRemesas, {
            cuentaId,
            bancoCodigo: resolvedBancoCodigo,
            allTiposRemesas
        });

        res.json({
            resultados: applied.transacciones,
            reglas_aplicadas_count: applied.reglas_aplicadas_count,
            reglas_evaluadas: rulesToEvaluate.length
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al probar reglas de autoclasificación');
    }
});

async function validateAndNormalizeReglaPayload(conn, body, existing = null) {
    const nombre = String(body.nombre !== undefined ? body.nombre : (existing?.nombre || '')).trim().slice(0, 120);
    if (!nombre) {
        return { errorStatus: 400, errorBody: { message: 'El nombre de la regla es requerido.' } };
    }

    const patron = body.patron !== undefined ? body.patron : existing?.patron;
    const tipoMatch = body.tipo_match !== undefined ? body.tipo_match : (existing?.tipo_match || 'CONTAINS');
    const patternCheck = validateClassificationRulePattern(patron, tipoMatch);
    if (!patternCheck.valid) {
        return { errorStatus: 400, errorBody: { message: patternCheck.message } };
    }

    let tipoMov = body.tipo_movimiento !== undefined
        ? String(body.tipo_movimiento || 'AMBOS').trim().toUpperCase()
        : null;
    let signo = body.signo !== undefined
        ? String(body.signo || 'CUALQUIERA').trim().toUpperCase()
        : null;

    if (!tipoMov && signo) {
        tipoMov = signo === 'CUALQUIERA' ? 'AMBOS' : signo;
    } else if (!tipoMov) {
        tipoMov = String(existing?.tipo_movimiento || 'AMBOS').toUpperCase();
    }
    if (!signo) {
        signo = tipoMov === 'AMBOS' ? 'CUALQUIERA' : tipoMov;
    }

    if (!['CARGO', 'ABONO', 'AMBOS'].includes(tipoMov)) {
        return { errorStatus: 400, errorBody: { message: 'tipo_movimiento inválido (CARGO, ABONO, AMBOS).' } };
    }
    if (!['CARGO', 'ABONO', 'CUALQUIERA'].includes(signo)) {
        return { errorStatus: 400, errorBody: { message: 'signo inválido (CARGO, ABONO, CUALQUIERA).' } };
    }

    const rawCuentaId = body.cuenta_bancaria_id !== undefined ? body.cuenta_bancaria_id : existing?.cuenta_bancaria_id;
    const cuentaBancariaId = rawCuentaId !== null && rawCuentaId !== undefined && rawCuentaId !== ''
        ? parseInt(rawCuentaId, 10)
        : null;
    if (rawCuentaId !== null && rawCuentaId !== undefined && rawCuentaId !== '' && (!Number.isInteger(cuentaBancariaId) || cuentaBancariaId <= 0)) {
        return { errorStatus: 400, errorBody: { message: 'cuenta_bancaria_id inválido.' } };
    }

    let cuentaEmpresaId = null;
    if (cuentaBancariaId) {
        const [[cta]] = await conn.query('SELECT id, empresa_id FROM cuentas_bancarias WHERE id = ? LIMIT 1', [cuentaBancariaId]);
        if (!cta) {
            return { errorStatus: 404, errorBody: { message: 'La cuenta bancaria especificada no existe.' } };
        }
        cuentaEmpresaId = cta.empresa_id;
    }

    const rawBancoCod = body.banco_codigo !== undefined ? body.banco_codigo : existing?.banco_codigo;
    const bancoCodigo = rawBancoCod ? String(rawBancoCod).trim().toUpperCase().slice(0, 50) : null;

    let tipoRemesaId = null;
    const rawTrId = body.tipo_remesa_id !== undefined ? body.tipo_remesa_id : existing?.tipo_remesa_id;
    if (rawTrId !== null && rawTrId !== undefined && rawTrId !== '') {
        const parsedTr = parseInt(rawTrId, 10);
        if (!Number.isInteger(parsedTr) || parsedTr <= 0) {
            return { errorStatus: 400, errorBody: { message: 'tipo_remesa_id inválido.' } };
        }
        try {
            const [[trExists]] = await conn.query('SELECT id FROM tipos_remesas WHERE id = ? LIMIT 1', [parsedTr]);
            if (!trExists) {
                return { errorStatus: 404, errorBody: { message: 'El tipo de remesa especificado no existe.' } };
            }
        } catch (errTr) {
            if (!isNoSuchTableError(errTr)) throw errTr;
        }
        tipoRemesaId = parsedTr;
    } else if (body.tipo_remesa_codigo) {
        const code = String(body.tipo_remesa_codigo).trim().toUpperCase();
        const [trRows] = cuentaEmpresaId
            ? await conn.query('SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ? LIMIT 1', [cuentaEmpresaId, code])
            : await conn.query('SELECT id FROM tipos_remesas WHERE codigo = ? LIMIT 1', [code]);
        if (trRows && trRows.length > 0) {
            tipoRemesaId = Number(trRows[0].id);
        }
    }

    const rawConcepto = body.concepto_limpio !== undefined ? body.concepto_limpio : existing?.concepto_limpio;
    const conceptoLimpio = rawConcepto ? String(rawConcepto).trim().toUpperCase().slice(0, 255) : null;

    const rawCodCta = body.cod_cta !== undefined ? body.cod_cta : existing?.cod_cta;
    const codCta = rawCodCta ? String(rawCodCta).trim().slice(0, 50) : null;

    const rawPrioridad = body.prioridad !== undefined ? body.prioridad : (existing?.prioridad ?? 100);
    const prioridad = parseInt(rawPrioridad, 10);
    if (!Number.isInteger(prioridad) || prioridad < 0 || prioridad > 99999) {
        return { errorStatus: 400, errorBody: { message: 'prioridad debe ser un entero entre 0 y 99999.' } };
    }

    const rawActivo = body.activo !== undefined ? body.activo : (existing?.activo ?? 1);
    const activo = (rawActivo === false || Number(rawActivo) === 0 || String(rawActivo) === 'false') ? 0 : 1;

    return {
        data: {
            banco_codigo: bancoCodigo,
            cuenta_bancaria_id: cuentaBancariaId,
            nombre,
            patron: patternCheck.patron,
            tipo_match: patternCheck.tipo_match,
            tipo_movimiento: tipoMov,
            signo,
            tipo_remesa_id: tipoRemesaId,
            concepto_limpio: conceptoLimpio,
            cod_cta: codCta,
            prioridad,
            activo
        }
    };
}

router.post('/reglas', authenticateToken, requirePermission(conciliacionReglasManagePerms), async (req, res) => {
    try {
        const txResult = await withTransaction(async (conn) => {
            const validated = await validateAndNormalizeReglaPayload(conn, req.body || {});
            if (validated.errorStatus) return validated;
            const d = validated.data;

            const [ins] = await conn.query(
                `INSERT INTO conciliacion_reglas_clasificacion
                    (banco_codigo, cuenta_bancaria_id, nombre, patron, tipo_match, tipo_movimiento,
                     signo, tipo_remesa_id, concepto_limpio, cod_cta, prioridad, activo, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    d.banco_codigo,
                    d.cuenta_bancaria_id,
                    d.nombre,
                    d.patron,
                    d.tipo_match,
                    d.tipo_movimiento,
                    d.signo,
                    d.tipo_remesa_id,
                    d.concepto_limpio,
                    d.cod_cta,
                    d.prioridad,
                    d.activo,
                    req.user?.id || null
                ]
            );

            const [[saved]] = await conn.query(
                'SELECT * FROM conciliacion_reglas_clasificacion WHERE id = ?',
                [ins.insertId]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: d.cuenta_bancaria_id,
                entidad: 'conciliacion_reglas',
                entidadId: ins.insertId,
                accion: 'CREATE_REGLA',
                user: req.user,
                ipAddress: req.ip,
                after: d
            });

            return { id: ins.insertId, regla: saved || { id: ins.insertId, ...d } };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_reglas_updated', {
            id: txResult.id,
            accion: 'CREATE',
            actor_user_id: req.user?.id || null
        });

        res.status(201).json({
            id: txResult.id,
            message: 'Regla de autoclasificación creada exitosamente.',
            regla: txResult.regla
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al crear regla de autoclasificación');
    }
});

router.put('/reglas/:id', authenticateToken, requirePermission(conciliacionReglasManagePerms), async (req, res) => {
    const ruleId = parseInt(req.params.id, 10);
    if (!Number.isInteger(ruleId) || ruleId <= 0) {
        return res.status(400).json({ message: 'ID de regla inválido.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[existing]] = await conn.query(
                'SELECT * FROM conciliacion_reglas_clasificacion WHERE id = ? FOR UPDATE',
                [ruleId]
            );
            if (!existing) {
                return { errorStatus: 404, errorBody: { message: 'Regla de autoclasificación no encontrada.' } };
            }

            const validated = await validateAndNormalizeReglaPayload(conn, req.body || {}, existing);
            if (validated.errorStatus) return validated;
            const d = validated.data;

            await conn.query(
                `UPDATE conciliacion_reglas_clasificacion
                 SET banco_codigo = ?, cuenta_bancaria_id = ?, nombre = ?, patron = ?, tipo_match = ?,
                     tipo_movimiento = ?, signo = ?, tipo_remesa_id = ?, concepto_limpio = ?,
                     cod_cta = ?, prioridad = ?, activo = ?
                 WHERE id = ?`,
                [
                    d.banco_codigo,
                    d.cuenta_bancaria_id,
                    d.nombre,
                    d.patron,
                    d.tipo_match,
                    d.tipo_movimiento,
                    d.signo,
                    d.tipo_remesa_id,
                    d.concepto_limpio,
                    d.cod_cta,
                    d.prioridad,
                    d.activo,
                    ruleId
                ]
            );

            const [[updated]] = await conn.query(
                'SELECT * FROM conciliacion_reglas_clasificacion WHERE id = ?',
                [ruleId]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: d.cuenta_bancaria_id,
                entidad: 'conciliacion_reglas',
                entidadId: ruleId,
                accion: 'UPDATE_REGLA',
                user: req.user,
                ipAddress: req.ip,
                before: existing,
                after: d
            });

            return { id: ruleId, regla: updated || { id: ruleId, ...d } };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_reglas_updated', {
            id: ruleId,
            accion: 'UPDATE',
            actor_user_id: req.user?.id || null
        });

        res.json({
            id: ruleId,
            message: 'Regla de autoclasificación actualizada exitosamente.',
            regla: txResult.regla
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar regla de autoclasificación');
    }
});

router.delete('/reglas/:id', authenticateToken, requirePermission(conciliacionReglasManagePerms), async (req, res) => {
    const ruleId = parseInt(req.params.id, 10);
    if (!Number.isInteger(ruleId) || ruleId <= 0) {
        return res.status(400).json({ message: 'ID de regla inválido.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[existing]] = await conn.query(
                'SELECT * FROM conciliacion_reglas_clasificacion WHERE id = ? FOR UPDATE',
                [ruleId]
            );
            if (!existing) {
                return { errorStatus: 404, errorBody: { message: 'Regla de autoclasificación no encontrada.' } };
            }

            await conn.query('DELETE FROM conciliacion_reglas_clasificacion WHERE id = ?', [ruleId]);

            await recordBankAudit(conn, {
                cuentaBancariaId: existing.cuenta_bancaria_id || null,
                entidad: 'conciliacion_reglas',
                entidadId: ruleId,
                accion: 'DELETE_REGLA',
                user: req.user,
                ipAddress: req.ip,
                before: existing
            });

            return { id: ruleId };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_reglas_updated', {
            id: ruleId,
            accion: 'DELETE',
            actor_user_id: req.user?.id || null
        });

        res.json({ message: 'Regla eliminada exitosamente.', id: ruleId });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar regla de autoclasificación');
    }
});

// ── 10. Cruces Agrupados N-a-1 / 1-a-N / N-a-M (R4.2) ────────────────────────
router.get('/cruces', authenticateToken, requirePermission(conciliacionViewPerms), async (req, res) => {
    const cuentaFilter = req.query.cuenta_id || req.query.cuenta_bancaria_id
        ? parseInt(req.query.cuenta_id || req.query.cuenta_bancaria_id, 10)
        : null;
    const estadoFilter = req.query.estado ? String(req.query.estado).trim().toUpperCase() : null;

    try {
        const db = getDb();
        let cruces = [];
        let items = [];
        try {
            const [cRows] = await withRetry(() => db.query(
                'SELECT * FROM conciliacion_cruces ORDER BY fecha_aplicado DESC, id DESC'
            ));
            cruces = cRows || [];
            if (cruces.length > 0) {
                const [iRows] = await withRetry(() => db.query(
                    'SELECT * FROM conciliacion_cruce_items ORDER BY id ASC'
                ));
                items = iRows || [];
            }
        } catch (errCruces) {
            if (!isNoSuchTableError(errCruces)) throw errCruces;
        }

        if (Number.isInteger(cuentaFilter) && cuentaFilter > 0) {
            cruces = cruces.filter((c) => Number(c.cuenta_bancaria_id) === cuentaFilter);
        }
        if (estadoFilter && estadoFilter !== 'TODOS') {
            cruces = cruces.filter((c) => String(c.estado || '').toUpperCase() === estadoFilter);
        }

        const itemsByCruce = new Map();
        for (const it of items) {
            const cid = Number(it.cruce_id);
            if (!itemsByCruce.has(cid)) itemsByCruce.set(cid, []);
            itemsByCruce.get(cid).push({
                ...it,
                monto: Number(it.monto || 0),
                fecha_ymd: parseStrictDBDate(it.fecha),
                fecha_display: toDisplayDate(it.fecha)
            });
        }

        const enriched = cruces.map((c) => ({
            ...c,
            id: Number(c.id),
            cuenta_bancaria_id: Number(c.cuenta_bancaria_id),
            monto_total: Number(c.monto_total || 0),
            fecha_aplicado_ymd: parseStrictDBDate(c.fecha_aplicado),
            fecha_aplicado_display: toDisplayDate(c.fecha_aplicado),
            items: itemsByCruce.get(Number(c.id)) || []
        }));

        res.json({ cruces: enriched, total: enriched.length });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar cruces agrupados');
    }
});

router.post('/cruces', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const body = req.body || {};
    const cuentaId = parseInt(body.cuenta_bancaria_id || body.cuenta_id, 10);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
        return res.status(400).json({ message: 'Debe especificar una cuenta bancaria válida.' });
    }

    const tipoCruce = String(body.tipo_cruce || 'N_A_1').trim().toUpperCase();
    if (!['N_A_1', '1_A_N', 'N_A_M'].includes(tipoCruce)) {
        return res.status(400).json({ message: 'tipo_cruce inválido (use N_A_1, 1_A_N o N_A_M).' });
    }

    const explicitDireccion = body.direccion ? String(body.direccion).trim().toUpperCase() : null;
    if (explicitDireccion && explicitDireccion !== 'CARGO' && explicitDireccion !== 'ABONO') {
        return res.status(400).json({ message: 'direccion inválida (use CARGO o ABONO).' });
    }

    const dbFechaAplicado = parseStrictDBDate(body.fecha_aplicado || getElSalvadorTodayYMD());
    if (!dbFechaAplicado) {
        return res.status(400).json({ message: 'La fecha de aplicación del cruce no es válida.' });
    }

    const rawLibro = Array.isArray(body.libro_items)
        ? body.libro_items
        : (Array.isArray(body.libros_items) ? body.libros_items : []);
    let rawBanco = Array.isArray(body.banco_items) ? body.banco_items.slice() : [];

    if (tipoCruce === 'N_A_1' && rawBanco.length === 0 && (body.monto_banco !== undefined || body.referencia_banco)) {
        rawBanco = [{
            origen_tipo: 'EXTRACTO',
            documento: body.referencia_banco || null,
            fecha: dbFechaAplicado,
            concepto: body.concepto_banco || body.notas || 'MOVIMIENTO BANCARIO AGRUPADO',
            monto: body.monto_banco
        }];
    }

    if (rawLibro.length === 0 || rawBanco.length === 0) {
        return res.status(400).json({ message: 'Debe seleccionar elementos en libros y en banco para crear el cruce.' });
    }

    if (tipoCruce === 'N_A_1' && (rawLibro.length < 2 || rawBanco.length !== 1)) {
        return res.status(400).json({ message: 'Un cruce N_A_1 requiere al menos 2 registros en libros y exactamente 1 movimiento bancario.' });
    }
    if (tipoCruce === '1_A_N' && (rawLibro.length !== 1 || rawBanco.length < 2)) {
        return res.status(400).json({ message: 'Un cruce 1_A_N requiere exactamente 1 registro en libros y al menos 2 movimientos bancarios.' });
    }

    const libroItems = [];
    const seenEntityKeys = new Set();
    for (const raw of rawLibro) {
        const id = parseInt(raw?.id, 10);
        const origenTipo = String(raw?.origen_tipo || raw?.tipo || '').trim().toUpperCase();
        if (!Number.isInteger(id) || id <= 0 || (origenTipo !== 'MOV' && origenTipo !== 'CK')) {
            return res.status(400).json({ message: 'Todos los elementos de libro_items deben tener id válido y origen_tipo MOV o CK.' });
        }
        const key = `${origenTipo}_${id}`;
        if (seenEntityKeys.has(key)) {
            return res.status(400).json({ message: `Elemento duplicado en libro_items (${origenTipo} #${id}).` });
        }
        seenEntityKeys.add(key);
        libroItems.push({ id, origen_tipo: origenTipo });
    }

    const bancoItems = [];
    for (const raw of rawBanco) {
        const origenTipo = String(raw?.origen_tipo || (raw?.id ? '' : 'EXTRACTO')).trim().toUpperCase();
        const rawId = raw?.id !== undefined && raw?.id !== null ? parseInt(raw.id, 10) : null;
        if ((origenTipo === 'MOV' || origenTipo === 'CK') && Number.isInteger(rawId) && rawId > 0) {
            const key = `${origenTipo}_${rawId}`;
            if (seenEntityKeys.has(key)) {
                return res.status(400).json({ message: `Elemento duplicado entre lados del cruce (${origenTipo} #${rawId}).` });
            }
            seenEntityKeys.add(key);
            bancoItems.push({ isDbEntity: true, id: rawId, origen_tipo: origenTipo });
        } else {
            const montoNum = parseStrictPositiveAmount(raw?.monto);
            if (montoNum === null) {
                return res.status(400).json({ message: 'Todos los elementos de extracto en banco_items deben tener un monto mayor a $0.00.' });
            }
            const fechaItem = raw?.fecha_ymd || raw?.fecha ? parseStrictDBDate(raw.fecha_ymd || raw.fecha) : dbFechaAplicado;
            if (!fechaItem) {
                return res.status(400).json({ message: 'Fecha inválida en banco_items.' });
            }
            bancoItems.push({
                isDbEntity: false,
                origen_tipo: 'EXTRACTO',
                documento: raw?.documento ? String(raw.documento).trim().slice(0, 100) : null,
                fecha: fechaItem,
                concepto: String(raw?.concepto || raw?.descripcion || body.concepto_banco || 'EXTRACTO BANCARIO').trim().toUpperCase().slice(0, 255),
                monto: montoNum
            });
        }
    }

    const idempotencyKey = getIdempotencyKey(req);

    try {
        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'conciliacion_cruces_create',
                    userId: req.user?.id,
                    payload: { cuentaId, tipoCruce, explicitDireccion, dbFechaAplicado, libroItems, bancoItems }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            const abortTx = async (errorStatus, errorBody) => {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'conciliacion_cruces_create');
                return { errorStatus, errorBody };
            };

            const [[cuenta]] = await conn.query(
                'SELECT id, activa FROM cuentas_bancarias WHERE id = ? LIMIT 1',
                [cuentaId]
            );
            if (!cuenta) {
                return abortTx(404, { message: 'Cuenta bancaria no encontrada.' });
            }
            if (!cuenta.activa) {
                return abortTx(409, { message: 'La cuenta bancaria se encuentra inactiva.' });
            }

            const dbEntitiesAll = [
                ...libroItems.map((x) => ({ ...x, lado: 'LIBRO' })),
                ...bancoItems.filter((x) => x.isDbEntity).map((x) => ({ ...x, lado: 'BANCO' }))
            ];
            const movIds = dbEntitiesAll.filter((x) => x.origen_tipo === 'MOV').map((x) => x.id);
            const chkIds = dbEntitiesAll.filter((x) => x.origen_tipo === 'CK').map((x) => x.id);

            const movMap = new Map();
            if (movIds.length > 0) {
                const [rows] = await conn.query(
                    `SELECT id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, deleted_at
                     FROM movimientos_bancarios WHERE id IN (${movIds.map(() => '?').join(',')}) FOR UPDATE`,
                    movIds
                );
                if ((rows || []).length !== movIds.length) {
                    return abortTx(404, { message: 'Uno o más movimientos bancarios del cruce no existen.' });
                }
                for (const m of rows) {
                    if (m.deleted_at) {
                        return abortTx(409, { message: `El movimiento #${m.id} fue eliminado.` });
                    }
                    if (Number(m.cuenta_bancaria_id) !== cuentaId) {
                        return abortTx(409, { message: `El movimiento #${m.id} no pertenece a la cuenta seleccionada.` });
                    }
                    if (m.fecha_aplicado) {
                        return abortTx(409, { message: `El movimiento #${m.id} ya se encuentra conciliado.` });
                    }
                    movMap.set(Number(m.id), m);
                }
            }

            const chkMap = new Map();
            if (chkIds.length > 0) {
                const [rows] = await conn.query(
                    `SELECT id, cuenta_bancaria_id, fecha, fecha_aplicado, cheque, concepto, valor, cheque_anulado, fue_noemitido, es_reservado, deleted_at
                     FROM cheques WHERE id IN (${chkIds.map(() => '?').join(',')}) FOR UPDATE`,
                    chkIds
                );
                if ((rows || []).length !== chkIds.length) {
                    return abortTx(404, { message: 'Uno o más cheques del cruce no existen.' });
                }
                for (const ch of rows) {
                    if (ch.deleted_at || ch.cheque_anulado || ch.fue_noemitido || ch.es_reservado) {
                        return abortTx(409, { message: `El cheque #${ch.cheque || ch.id} está anulado, reservado, eliminado o no emitido.` });
                    }
                    if (Number(ch.cuenta_bancaria_id) !== cuentaId) {
                        return abortTx(409, { message: `El cheque #${ch.cheque || ch.id} no pertenece a la cuenta seleccionada.` });
                    }
                    if (ch.fecha_aplicado) {
                        return abortTx(409, { message: `El cheque #${ch.cheque || ch.id} ya se encuentra conciliado.` });
                    }
                    chkMap.set(Number(ch.id), ch);
                }
            }

            // Verificar que ningún item esté ya en otro cruce ACTIVO
            const [activeCruces] = await conn.query(
                "SELECT id, cuenta_bancaria_id, estado FROM conciliacion_cruces WHERE cuenta_bancaria_id = ? AND estado = 'ACTIVO'",
                [cuentaId]
            );
            const activeIds = (activeCruces || [])
                .filter((c) => Number(c.cuenta_bancaria_id) === cuentaId && String(c.estado || '').toUpperCase() === 'ACTIVO')
                .map((c) => Number(c.id));
            if (activeIds.length > 0) {
                const [activeItems] = await conn.query(
                    `SELECT id, cruce_id, origen_tipo, entidad_id FROM conciliacion_cruce_items WHERE cruce_id IN (${activeIds.map(() => '?').join(',')})`,
                    activeIds
                );
                const activeIdSet = new Set(activeIds);
                for (const ci of (activeItems || [])) {
                    if (!activeIdSet.has(Number(ci.cruce_id))) continue;
                    const hit = dbEntitiesAll.find((e) => e.origen_tipo === ci.origen_tipo && Number(e.id) === Number(ci.entidad_id));
                    if (hit) {
                        return abortTx(409, {
                            message: `El documento ${hit.origen_tipo} #${hit.id} ya pertenece al cruce activo #${ci.cruce_id}.`,
                            cruce_id: Number(ci.cruce_id)
                        });
                    }
                }
            }

            // Verificar dirección consistente y sumar totales exactos
            const resolveEntityMeta = (item) => {
                if (item.origen_tipo === 'CK') {
                    const ch = chkMap.get(item.id);
                    return {
                        dir: 'CARGO',
                        monto: round2(ch.valor),
                        documento: String(ch.cheque || ''),
                        fecha: parseStrictDBDate(ch.fecha),
                        concepto: String(ch.concepto || '').slice(0, 255)
                    };
                }
                const m = movMap.get(item.id);
                const dir = Number(m.cargo || 0) > 0 ? 'CARGO' : 'ABONO';
                return {
                    dir,
                    monto: round2(m.monto || m.cargo || m.abono || 0),
                    documento: String(m.documento || ''),
                    fecha: parseStrictDBDate(m.fecha),
                    concepto: String(m.concepto || '').slice(0, 255)
                };
            };

            const firstLibroMeta = resolveEntityMeta(libroItems[0]);
            const resolvedDireccion = explicitDireccion || firstLibroMeta.dir;

            const itemsToInsert = [];

            let sumLibro = 0;
            for (const li of libroItems) {
                const meta = resolveEntityMeta(li);
                if (meta.dir !== resolvedDireccion) {
                    return abortTx(400, {
                        message: `Dirección incompatible: se esperaba ${resolvedDireccion} pero ${li.origen_tipo} #${li.id} es ${meta.dir}.`
                    });
                }
                sumLibro = round2(sumLibro + meta.monto);
                itemsToInsert.push({
                    lado: 'LIBRO',
                    origen_tipo: li.origen_tipo,
                    entidad_id: li.id,
                    documento: meta.documento,
                    fecha: meta.fecha,
                    concepto: meta.concepto,
                    monto: meta.monto
                });
            }

            let sumBanco = 0;
            for (const bi of bancoItems) {
                if (bi.isDbEntity) {
                    const meta = resolveEntityMeta(bi);
                    if (meta.dir !== resolvedDireccion) {
                        return abortTx(400, {
                            message: `Dirección incompatible en banco_items: se esperaba ${resolvedDireccion} pero ${bi.origen_tipo} #${bi.id} es ${meta.dir}.`
                        });
                    }
                    sumBanco = round2(sumBanco + meta.monto);
                    itemsToInsert.push({
                        lado: 'BANCO',
                        origen_tipo: bi.origen_tipo,
                        entidad_id: bi.id,
                        documento: meta.documento,
                        fecha: meta.fecha,
                        concepto: meta.concepto,
                        monto: meta.monto
                    });
                } else {
                    sumBanco = round2(sumBanco + bi.monto);
                    itemsToInsert.push({
                        lado: 'BANCO',
                        origen_tipo: 'EXTRACTO',
                        entidad_id: null,
                        documento: bi.documento,
                        fecha: bi.fecha,
                        concepto: bi.concepto,
                        monto: bi.monto
                    });
                }
            }

            const delta = round2(sumLibro - sumBanco);
            if (Math.abs(delta) > 0.005) {
                return abortTx(400, {
                    message: `Los montos del cruce agrupado no cuadran: Libros $${sumLibro.toFixed(2)} vs Banco $${sumBanco.toFixed(2)} (diferencia $${delta.toFixed(2)}).`,
                    sum_libro: sumLibro,
                    sum_banco: sumBanco,
                    delta
                });
            }

            // Verificar período cerrado únicamente contra la fecha de aplicación del cruce
            const lockCheck = await isDateInClosedPeriod(conn, cuentaId, [dbFechaAplicado]);
            if (lockCheck.closed) {
                return abortTx(423, {
                    message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para aplicar cruces en fecha ${toDisplayDate(lockCheck.offendingDate)}.`,
                    locked_until: lockCheck.lockedDate,
                    periodo_id: lockCheck.periodo?.id
                });
            }

            const firstBanco = itemsToInsert.find((x) => x.lado === 'BANCO');
            const refBanco = body.referencia_banco
                ? String(body.referencia_banco).trim().slice(0, 120)
                : (firstBanco?.documento ? String(firstBanco.documento).slice(0, 120) : null);
            const concBanco = body.concepto_banco
                ? String(body.concepto_banco).trim().slice(0, 255)
                : (firstBanco?.concepto ? String(firstBanco.concepto).slice(0, 255) : null);
            const notas = body.notas ? String(body.notas).trim().slice(0, 255) : null;
            const importacionId = body.importacion_id ? parseInt(body.importacion_id, 10) || null : null;

            const [cruceRes] = await conn.query(
                `INSERT INTO conciliacion_cruces
                    (cuenta_bancaria_id, tipo_cruce, direccion, monto_total, fecha_aplicado, estado,
                     importacion_id, referencia_banco, concepto_banco, notas, created_by)
                 VALUES (?, ?, ?, ?, ?, 'ACTIVO', ?, ?, ?, ?, ?)`,
                [
                    cuentaId,
                    tipoCruce,
                    resolvedDireccion,
                    sumLibro,
                    dbFechaAplicado,
                    importacionId,
                    refBanco,
                    concBanco,
                    notas,
                    req.user?.id || null
                ]
            );
            const cruceId = cruceRes.insertId;

            for (const it of itemsToInsert) {
                await conn.query(
                    `INSERT INTO conciliacion_cruce_items
                        (cruce_id, lado, origen_tipo, entidad_id, documento, fecha, concepto, monto)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        cruceId,
                        it.lado,
                        it.origen_tipo,
                        it.entidad_id,
                        it.documento,
                        it.fecha,
                        it.concepto,
                        it.monto
                    ]
                );
            }

            if (movIds.length > 0) {
                for (const mid of movIds) {
                    await conn.query(
                        'UPDATE movimientos_bancarios SET fecha_aplicado = ?, conciliado_by = ?, conciliado_at = NOW(), version = version + 1 WHERE id = ? AND deleted_at IS NULL',
                        [dbFechaAplicado, req.user?.id || null, mid]
                    );
                }
            }
            if (chkIds.length > 0) {
                for (const cid of chkIds) {
                    await conn.query(
                        'UPDATE cheques SET fecha_aplicado = ?, conciliado_by = ?, conciliado_at = NOW(), version = version + 1 WHERE id = ? AND deleted_at IS NULL',
                        [dbFechaAplicado, req.user?.id || null, cid]
                    );
                }
            }

            const [[cruceRow]] = await conn.query('SELECT * FROM conciliacion_cruces WHERE id = ?', [cruceId]);

            await recordBankAudit(conn, {
                cuentaBancariaId: cuentaId,
                entidad: 'conciliacion_cruces',
                entidadId: cruceId,
                accion: 'CREAR_CRUCE_AGRUPADO',
                user: req.user,
                ipAddress: req.ip,
                after: {
                    cruce_id: cruceId,
                    tipo_cruce: tipoCruce,
                    direccion: resolvedDireccion,
                    monto_total: sumLibro,
                    fecha_aplicado: dbFechaAplicado,
                    items: itemsToInsert
                }
            });

            const respBody = {
                id: cruceId,
                message: `Cruce agrupado ${tipoCruce} registrado por $${sumLibro.toFixed(2)}.`,
                cruce: cruceRow || {
                    id: cruceId,
                    cuenta_bancaria_id: cuentaId,
                    tipo_cruce: tipoCruce,
                    direccion: resolvedDireccion,
                    monto_total: sumLibro,
                    fecha_aplicado: dbFechaAplicado,
                    estado: 'ACTIVO'
                },
                items: itemsToInsert
            };

            if (idempotencyKey) {
                await saveIdempotentResponse(conn, {
                    key: idempotencyKey,
                    scope: 'conciliacion_cruces_create',
                    statusCode: 201,
                    responseBody: respBody
                });
            }

            return { statusCode: 201, body: respBody, cuentaId };
        });

        if (txResult.conflict) {
            return res.status(409).json({ message: 'Solicitud duplicada en proceso. Espere unos segundos.' });
        }
        if (txResult.replayed) {
            return res.status(txResult.statusCode).json(txResult.body);
        }
        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: txResult.cuentaId,
            accion: 'CRUCE_AGRUPADO',
            cruce_id: txResult.body.id,
            actor_user_id: req.user?.id || null
        });

        res.status(201).json(txResult.body);
    } catch (error) {
        sendSafeError(res, error, 'Error al registrar cruce agrupado');
    }
});

async function handleDesconciliarCruce(req, res) {
    const cruceId = parseInt(req.params.id, 10);
    if (!Number.isInteger(cruceId) || cruceId <= 0) {
        return res.status(400).json({ message: 'ID de cruce inválido.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[cruce]] = await conn.query(
                'SELECT * FROM conciliacion_cruces WHERE id = ? FOR UPDATE',
                [cruceId]
            );
            if (!cruce) {
                return { errorStatus: 404, errorBody: { message: 'Cruce agrupado no encontrado.' } };
            }
            if (String(cruce.estado || '').toUpperCase() !== 'ACTIVO') {
                return { errorStatus: 409, errorBody: { message: 'El cruce ya fue desconciliado previamente.' } };
            }

            const [items] = await conn.query(
                'SELECT * FROM conciliacion_cruce_items WHERE cruce_id = ?',
                [cruceId]
            );

            const datesToVerify = [parseStrictDBDate(cruce.fecha_aplicado)].filter(Boolean);

            const lockCheck = await isDateInClosedPeriod(conn, cruce.cuenta_bancaria_id, datesToVerify);
            if (lockCheck.closed) {
                return {
                    errorStatus: 423,
                    errorBody: {
                        message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para desconciliar este cruce.`,
                        locked_until: lockCheck.lockedDate,
                        periodo_id: lockCheck.periodo?.id
                    }
                };
            }

            await conn.query(
                `UPDATE conciliacion_cruces
                 SET estado = 'DESCONCILIADO', desconciliado_by = ?, desconciliado_at = NOW()
                 WHERE id = ?`,
                [req.user?.id || null, cruceId]
            );

            const movIds = [...new Set((items || []).filter((i) => i.origen_tipo === 'MOV' && i.entidad_id).map((i) => Number(i.entidad_id)))];
            const chkIds = [...new Set((items || []).filter((i) => i.origen_tipo === 'CK' && i.entidad_id).map((i) => Number(i.entidad_id)))];

            if (movIds.length > 0) {
                await conn.query(
                    `UPDATE movimientos_bancarios
                     SET fecha_aplicado = NULL, conciliado_by = NULL, conciliado_at = NULL, version = version + 1
                     WHERE id IN (${movIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
                    movIds
                );
                try {
                    await conn.query(
                        `UPDATE recordatorios_pagos_abonos
                         SET estado_conciliacion = 'PENDIENTE', movimiento_bancario_id = NULL
                         WHERE movimiento_bancario_id IN (${movIds.map(() => '?').join(',')}) AND estado_conciliacion = 'CONCILIADO'`,
                        movIds
                    );
                } catch (_) { /* tabla opcional */ }
            }

            if (chkIds.length > 0) {
                await conn.query(
                    `UPDATE cheques
                     SET fecha_aplicado = NULL, conciliado_by = NULL, conciliado_at = NULL, version = version + 1
                     WHERE id IN (${chkIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
                    chkIds
                );
                try {
                    await conn.query(
                        `UPDATE recordatorios_pagos_abonos
                         SET estado_conciliacion = 'PENDIENTE', cheque_id = NULL
                         WHERE cheque_id IN (${chkIds.map(() => '?').join(',')}) AND estado_conciliacion = 'CONCILIADO'`,
                        chkIds
                    );
                } catch (_) { /* tabla opcional */ }
            }

            await recordBankAudit(conn, {
                cuentaBancariaId: cruce.cuenta_bancaria_id,
                entidad: 'conciliacion_cruces',
                entidadId: cruceId,
                accion: 'DESCONCILIAR_CRUCE',
                user: req.user,
                ipAddress: req.ip,
                before: { estado: cruce.estado, fecha_aplicado: parseStrictDBDate(cruce.fecha_aplicado), movIds, chkIds },
                after: { estado: 'DESCONCILIADO' }
            });

            return {
                id: cruceId,
                cuentaId: cruce.cuenta_bancaria_id,
                movIds,
                chkIds
            };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'conciliacion_updated', {
            cuenta_bancaria_id: txResult.cuentaId,
            accion: 'DESCONCILIAR_CRUCE',
            cruce_id: cruceId,
            actor_user_id: req.user?.id || null
        });

        res.json({
            message: 'Cruce agrupado desconciliado y documentos revertidos a pendientes.',
            id: cruceId,
            estado: 'DESCONCILIADO'
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al desconciliar cruce agrupado');
    }
}

router.post('/cruces/:id/desconciliar', authenticateToken, requirePermission(conciliacionManagePerms), handleDesconciliarCruce);
router.delete('/cruces/:id', authenticateToken, requirePermission(conciliacionManagePerms), handleDesconciliarCruce);

// ── 9. Identificar / Vincular Transferencias Internas desde Conciliación ────
router.post('/vincular-transferencia-interna', authenticateToken, requirePermission(conciliacionManagePerms), async (req, res) => {
    const {
        modo = 'VINCULAR_EXISTENTES',
        cuenta_bancaria_id,
        movimiento_id,
        movimiento_contraparte_id,
        cuenta_contraparte_id,
        direccion_actual,
        fecha,
        fecha_aplicado,
        documento,
        concepto,
        monto,
        cod_cta,
        num_partida,
        aplicar_inmediatamente = true,
        aplicar_contraparte = false
    } = req.body || {};

    const cleanModo = String(modo || 'VINCULAR_EXISTENTES').trim().toUpperCase();
    if (!['VINCULAR_EXISTENTES', 'CREAR_Y_VINCULAR_ESPEJO', 'CREAR_PAR_COMPLETO'].includes(cleanModo)) {
        return res.status(400).json({ message: 'Modo de vinculación de transferencia interna no válido.' });
    }

    const cuentaId = parseInt(cuenta_bancaria_id, 10);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
        return res.status(400).json({ message: 'Debe especificar una cuenta bancaria válida.' });
    }

    const idempotencyKey = getIdempotencyKey(req);
    const idempotencyScope = 'conciliacion_vincular_transferencia';

    try {
        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: idempotencyScope,
                    userId: req.user?.id,
                    payload: {
                        modo: cleanModo,
                        cuentaId,
                        movimiento_id,
                        movimiento_contraparte_id,
                        cuenta_contraparte_id,
                        direccion_actual,
                        fecha,
                        fecha_aplicado,
                        documento,
                        monto
                    }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            const abortTx = async (errorStatus, message) => {
                await cleanupPendingIdempotency(conn, idempotencyKey, idempotencyScope);
                return { errorStatus, errorBody: { message } };
            };

            const resolveTrId = async (empId, dir) => {
                const codes = dir === 'CARGO' ? ['TR', 'NC'] : ['TR', 'NA'];
                const [trRows] = await conn.query(
                    `SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo IN (?, ?) ORDER BY (codigo = 'TR') DESC LIMIT 1`,
                    [empId, codes[0], codes[1]]
                );
                return trRows && trRows.length > 0 ? trRows[0].id : null;
            };

            if (cleanModo === 'VINCULAR_EXISTENTES') {
                const movId = parseInt(movimiento_id, 10);
                const cpId = parseInt(movimiento_contraparte_id, 10);
                if (!Number.isInteger(movId) || movId <= 0 || !Number.isInteger(cpId) || cpId <= 0) {
                    return abortTx(400, 'Debe especificar ambos IDs de movimiento para vincular la transferencia interna.');
                }
                if (movId === cpId) {
                    return abortTx(400, 'No puede vincular un movimiento consigo mismo.');
                }

                const orderedIds = [movId, cpId].sort((a, b) => a - b);
                const [lockedRows] = await conn.query(
                    `SELECT * FROM movimientos_bancarios WHERE id IN (?, ?) FOR UPDATE`,
                    orderedIds
                );
                const localMov = (lockedRows || []).find(r => Number(r.id) === movId);
                const cpMov = (lockedRows || []).find(r => Number(r.id) === cpId);
                if (!localMov || localMov.deleted_at || !cpMov || cpMov.deleted_at) {
                    return abortTx(404, 'Uno o ambos movimientos no existen o fueron eliminados.');
                }
                if (Number(localMov.cuenta_bancaria_id) !== cuentaId) {
                    return abortTx(403, 'El movimiento local no pertenece a la cuenta bancaria seleccionada.');
                }
                if (Number(localMov.cuenta_bancaria_id) === Number(cpMov.cuenta_bancaria_id)) {
                    return abortTx(400, 'Los movimientos espejo deben pertenecer a cuentas bancarias distintas.');
                }
                if (localMov.transfer_group_id || cpMov.transfer_group_id) {
                    return abortTx(409, 'Al menos uno de los movimientos ya está vinculado a otra transferencia interna.');
                }

                const dirLocal = getRowDirectionValue(localMov);
                const dirCp = getRowDirectionValue(cpMov);
                if (dirLocal === dirCp) {
                    return abortTx(400, 'Los movimientos de una transferencia interna deben tener dirección opuesta (CARGO vs ABONO).');
                }
                const montoLocal = Number(localMov.monto || localMov.cargo || localMov.abono || 0);
                const montoCp = Number(cpMov.monto || cpMov.cargo || cpMov.abono || 0);
                if (Math.abs(montoLocal - montoCp) >= 0.01) {
                    return abortTx(400, `Los montos no coinciden ($${montoLocal.toFixed(2)} vs $${montoCp.toFixed(2)}).`);
                }

                const lockLocal = await isDateInClosedPeriod(conn, localMov.cuenta_bancaria_id, [localMov.fecha, localMov.fecha_aplicado]);
                if (lockLocal.closed) {
                    return abortTx(423, `Período cerrado hasta ${toDisplayDate(lockLocal.lockedDate)} en la cuenta actual.`);
                }
                const lockCp = await isDateInClosedPeriod(conn, cpMov.cuenta_bancaria_id, [cpMov.fecha, cpMov.fecha_aplicado]);
                if (lockCp.closed) {
                    return abortTx(423, `Período cerrado hasta ${toDisplayDate(lockCp.lockedDate)} en la cuenta contraparte.`);
                }

                const transferGroupId = await generateNextTransferCode(conn);
                await conn.query(
                    'UPDATE movimientos_bancarios SET transfer_group_id = ?, updated_by = ?, version = version + 1 WHERE id IN (?, ?) AND deleted_at IS NULL',
                    [transferGroupId, req.user?.id || null, movId, cpId]
                );

                await recordBankAudit(conn, {
                    cuentaBancariaId: localMov.cuenta_bancaria_id,
                    entidad: 'movimientos_bancarios',
                    entidadId: movId,
                    accion: 'LINK_INTERNAL_TRANSFER',
                    user: req.user,
                    ipAddress: req.ip,
                    after: { id: movId, counterpart_id: cpId, transfer_group_id: transferGroupId }
                });
                await recordBankAudit(conn, {
                    cuentaBancariaId: cpMov.cuenta_bancaria_id,
                    entidad: 'movimientos_bancarios',
                    entidadId: cpId,
                    accion: 'LINK_INTERNAL_TRANSFER',
                    user: req.user,
                    ipAddress: req.ip,
                    after: { id: cpId, counterpart_id: movId, transfer_group_id: transferGroupId }
                });

                const body = {
                    message: `Transferencia interna vinculada (${transferGroupId}).`,
                    modo: cleanModo,
                    transfer_group_id: transferGroupId,
                    movimiento_id: movId,
                    movimiento_contraparte_id: cpId
                };
                if (idempotencyKey) {
                    await saveIdempotentResponse(conn, { key: idempotencyKey, scope: idempotencyScope, statusCode: 200, responseBody: body });
                }
                return {
                    statusCode: 200,
                    body,
                    cuentaIds: [Number(localMov.cuenta_bancaria_id), Number(cpMov.cuenta_bancaria_id)]
                };
            }

            if (cleanModo === 'CREAR_Y_VINCULAR_ESPEJO') {
                const cpId = parseInt(movimiento_contraparte_id, 10);
                if (!Number.isInteger(cpId) || cpId <= 0) {
                    return abortTx(400, 'Debe especificar el movimiento espejo existente en la otra cuenta.');
                }

                const [[ctaActual]] = await conn.query(
                    'SELECT c.id, c.empresa_id, c.numero, c.nombre, c.activa, e.nombre AS empresa_nombre, b.descripcion AS banco_nombre FROM cuentas_bancarias c LEFT JOIN empresas e ON c.empresa_id = e.id LEFT JOIN bancos b ON c.banco_id = b.id WHERE c.id = ? LIMIT 1',
                    [cuentaId]
                );
                if (!ctaActual || !ctaActual.activa) {
                    return abortTx(404, 'Cuenta bancaria actual no encontrada o inactiva.');
                }

                const [[cpMov]] = await conn.query('SELECT * FROM movimientos_bancarios WHERE id = ? FOR UPDATE', [cpId]);
                if (!cpMov || cpMov.deleted_at) {
                    return abortTx(404, 'Movimiento espejo en contraparte no encontrado o eliminado.');
                }
                if (Number(cpMov.cuenta_bancaria_id) === cuentaId) {
                    return abortTx(400, 'El movimiento espejo pertenece a la misma cuenta bancaria.');
                }
                if (cpMov.transfer_group_id) {
                    return abortTx(409, `El movimiento espejo #${cpId} ya pertenece a la transferencia ${cpMov.transfer_group_id}.`);
                }

                const cpDir = getRowDirectionValue(cpMov);
                const localDir = cpDir === 'CARGO' ? 'ABONO' : 'CARGO';
                const montoExacto = round2(Number(cpMov.monto || cpMov.cargo || cpMov.abono || 0));
                if (montoExacto <= 0) {
                    return abortTx(400, 'El monto del movimiento espejo no es válido.');
                }

                const dbFecha = parseStrictDBDate(fecha || cpMov.fecha || getElSalvadorTodayYMD());
                if (!dbFecha) {
                    return abortTx(400, 'La fecha del movimiento no es válida.');
                }
                const aplicarNow = aplicar_inmediatamente !== false;
                const dbFechaAplicado = aplicarNow ? parseStrictDBDate(fecha_aplicado || dbFecha) : null;
                if (aplicarNow && !dbFechaAplicado) {
                    return abortTx(400, 'La fecha de aplicación no es válida.');
                }

                const lockLocal = await isDateInClosedPeriod(conn, cuentaId, [dbFecha, dbFechaAplicado]);
                if (lockLocal.closed) {
                    return abortTx(423, `Período cerrado hasta ${toDisplayDate(lockLocal.lockedDate)} en la cuenta actual.`);
                }
                const lockCp = await isDateInClosedPeriod(conn, cpMov.cuenta_bancaria_id, [cpMov.fecha, cpMov.fecha_aplicado]);
                if (lockCp.closed) {
                    return abortTx(423, `Período cerrado hasta ${toDisplayDate(lockCp.lockedDate)} en la cuenta contraparte.`);
                }

                const transferGroupId = await generateNextTransferCode(conn);
                const cleanDoc = (String(documento || cpMov.documento || '').trim() || transferGroupId).slice(0, 100);
                const cleanConcepto = (String(concepto || '').trim().toUpperCase() || `TRANSFERENCIA ${localDir === 'CARGO' ? 'A' : 'DE'} CTA ESPEJO #${cpMov.id}`).slice(0, 255);
                const cargo = localDir === 'CARGO' ? montoExacto : 0;
                const abono = localDir === 'ABONO' ? montoExacto : 0;
                const trId = await resolveTrId(ctaActual.empresa_id, localDir);
                const fp = computeMovementFingerprint({ cuentaBancariaId: cuentaId, fecha: dbFecha, documento: cleanDoc, cargo, abono, concepto: cleanConcepto });

                const debVal = localDir === 'CARGO' ? montoExacto : 0;
                const credVal = localDir === 'ABONO' ? montoExacto : 0;
                const [ins] = localDir === 'CARGO'
                    ? await conn.query(
                        `INSERT INTO movimientos_bancarios
                            (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                             monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                             created_by, conciliado_by, conciliado_at, transfer_group_id, fingerprint, version)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                        [ctaActual.empresa_id, cuentaId, dbFecha, dbFechaAplicado, cleanDoc, cleanConcepto, montoExacto, debVal, trId, cod_cta || null, num_partida || null, req.user?.id || null, dbFechaAplicado ? (req.user?.id || null) : null, dbFechaAplicado ? new Date() : null, transferGroupId, fp]
                    )
                    : await conn.query(
                        `INSERT INTO movimientos_bancarios
                            (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                             monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                             created_by, conciliado_by, conciliado_at, transfer_group_id, fingerprint, version)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                        [ctaActual.empresa_id, cuentaId, dbFecha, dbFechaAplicado, cleanDoc, cleanConcepto, montoExacto, credVal, trId, cod_cta || null, num_partida || null, req.user?.id || null, dbFechaAplicado ? (req.user?.id || null) : null, dbFechaAplicado ? new Date() : null, transferGroupId, fp]
                    );

                await conn.query(
                    'UPDATE movimientos_bancarios SET transfer_group_id = ?, updated_by = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL',
                    [transferGroupId, req.user?.id || null, cpId]
                );

                await recordBankAudit(conn, {
                    cuentaBancariaId: cuentaId,
                    entidad: 'movimientos_bancarios',
                    entidadId: ins.insertId,
                    accion: 'CREATE_AND_LINK_MIRROR_TRANSFER',
                    user: req.user,
                    ipAddress: req.ip,
                    after: { id: ins.insertId, counterpart_id: cpId, transfer_group_id: transferGroupId, monto: montoExacto }
                });
                await recordBankAudit(conn, {
                    cuentaBancariaId: cpMov.cuenta_bancaria_id,
                    entidad: 'movimientos_bancarios',
                    entidadId: cpId,
                    accion: 'LINK_INTERNAL_TRANSFER',
                    user: req.user,
                    ipAddress: req.ip,
                    after: { id: cpId, counterpart_id: ins.insertId, transfer_group_id: transferGroupId }
                });

                const body = {
                    message: `Movimiento creado, conciliado y vinculado como transferencia interna ${transferGroupId}.`,
                    modo: cleanModo,
                    transfer_group_id: transferGroupId,
                    movimiento_id: ins.insertId,
                    movimiento_contraparte_id: cpId
                };
                if (idempotencyKey) {
                    await saveIdempotentResponse(conn, { key: idempotencyKey, scope: idempotencyScope, statusCode: 201, responseBody: body });
                }
                return {
                    statusCode: 201,
                    body,
                    cuentaIds: [cuentaId, Number(cpMov.cuenta_bancaria_id)]
                };
            }

            // CREAR_PAR_COMPLETO
            const cpCuentaId = parseInt(cuenta_contraparte_id, 10);
            if (!Number.isInteger(cpCuentaId) || cpCuentaId <= 0 || cpCuentaId === cuentaId) {
                return abortTx(400, 'Debe especificar una cuenta bancaria contraparte distinta y válida.');
            }
            const parsedMonto = parseStrictPositiveAmount(monto);
            if (parsedMonto === null) {
                return abortTx(400, 'El monto de la transferencia debe ser mayor a $0.00.');
            }
            const dirActual = String(direccion_actual || 'CARGO').trim().toUpperCase() === 'ABONO' ? 'ABONO' : 'CARGO';
            const dbFecha = parseStrictDBDate(fecha || getElSalvadorTodayYMD());
            if (!dbFecha) {
                return abortTx(400, 'La fecha de la transferencia no es válida.');
            }
            const aplicarNow = aplicar_inmediatamente !== false;
            const dbFechaAplActual = aplicarNow ? parseStrictDBDate(fecha_aplicado || dbFecha) : null;
            if (aplicarNow && !dbFechaAplActual) {
                return abortTx(400, 'La fecha de aplicación no es válida.');
            }
            const dbFechaAplCp = aplicar_contraparte ? (dbFechaAplActual || dbFecha) : null;

            const [[ctaActual]] = await conn.query(
                'SELECT c.id, c.empresa_id, c.numero, c.nombre, c.activa, e.nombre AS empresa_nombre, b.descripcion AS banco_nombre FROM cuentas_bancarias c LEFT JOIN empresas e ON c.empresa_id = e.id LEFT JOIN bancos b ON c.banco_id = b.id WHERE c.id = ? LIMIT 1',
                [cuentaId]
            );
            const [[ctaCp]] = await conn.query(
                'SELECT c.id, c.empresa_id, c.numero, c.nombre, c.activa, e.nombre AS empresa_nombre, b.descripcion AS banco_nombre FROM cuentas_bancarias c LEFT JOIN empresas e ON c.empresa_id = e.id LEFT JOIN bancos b ON c.banco_id = b.id WHERE c.id = ? LIMIT 1',
                [cpCuentaId]
            );
            if (!ctaActual || !ctaActual.activa || !ctaCp || !ctaCp.activa) {
                return abortTx(404, 'Una o ambas cuentas bancarias no existen o están inactivas.');
            }

            const ctaDeb = dirActual === 'CARGO' ? ctaActual : ctaCp;
            const ctaCred = dirActual === 'CARGO' ? ctaCp : ctaActual;
            const fechaAplDeb = dirActual === 'CARGO' ? dbFechaAplActual : dbFechaAplCp;
            const fechaAplCred = dirActual === 'ABONO' ? dbFechaAplActual : dbFechaAplCp;

            const lockDeb = await isDateInClosedPeriod(conn, ctaDeb.id, [dbFecha, fechaAplDeb]);
            if (lockDeb.closed) {
                return abortTx(423, `Período cerrado hasta ${toDisplayDate(lockDeb.lockedDate)} en la cuenta origen.`);
            }
            const lockCred = await isDateInClosedPeriod(conn, ctaCred.id, [dbFecha, fechaAplCred]);
            if (lockCred.closed) {
                return abortTx(423, `Período cerrado hasta ${toDisplayDate(lockCred.lockedDate)} en la cuenta destino.`);
            }

            const transferGroupId = await generateNextTransferCode(conn);
            const cleanDoc = (String(documento || '').trim() || transferGroupId).slice(0, 100);
            const intercompany = Number(ctaDeb.empresa_id) !== Number(ctaCred.empresa_id);
            const baseConcept = String(concepto || '').trim().toUpperCase();
            const conceptoDeb = (baseConcept || `TRANSFERENCIA A ${ctaCred.banco_nombre || ''} #${ctaCred.numero}`).slice(0, 255);
            const conceptoCred = (baseConcept || `TRANSFERENCIA DE ${ctaDeb.banco_nombre || ''} #${ctaDeb.numero}`).slice(0, 255);
            const trDebId = await resolveTrId(ctaDeb.empresa_id, 'CARGO');
            const trCredId = await resolveTrId(ctaCred.empresa_id, 'ABONO');
            const fpDeb = computeMovementFingerprint({ cuentaBancariaId: ctaDeb.id, fecha: dbFecha, documento: cleanDoc, cargo: parsedMonto, abono: 0, concepto: conceptoDeb });
            const fpCred = computeMovementFingerprint({ cuentaBancariaId: ctaCred.id, fecha: dbFecha, documento: cleanDoc, cargo: 0, abono: parsedMonto, concepto: conceptoCred });

            const [resDeb] = await conn.query(
                `INSERT INTO movimientos_bancarios
                    (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                     monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                     created_by, conciliado_by, conciliado_at, transfer_group_id, fingerprint, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [ctaDeb.empresa_id, ctaDeb.id, dbFecha, fechaAplDeb, cleanDoc, conceptoDeb, parsedMonto, parsedMonto, trDebId, cod_cta || null, num_partida || null, req.user?.id || null, fechaAplDeb ? (req.user?.id || null) : null, fechaAplDeb ? new Date() : null, transferGroupId, fpDeb]
            );
            const [resCred] = await conn.query(
                `INSERT INTO movimientos_bancarios
                    (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                     monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                     created_by, conciliado_by, conciliado_at, transfer_group_id, fingerprint, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [ctaCred.empresa_id, ctaCred.id, dbFecha, fechaAplCred, cleanDoc, conceptoCred, parsedMonto, parsedMonto, trCredId, cod_cta || null, num_partida || null, req.user?.id || null, fechaAplCred ? (req.user?.id || null) : null, fechaAplCred ? new Date() : null, transferGroupId, fpCred]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: ctaDeb.id,
                entidad: 'movimientos_bancarios',
                entidadId: resDeb.insertId,
                accion: 'CREATE_TRANSFER_DEBIT',
                user: req.user,
                ipAddress: req.ip,
                after: { id: resDeb.insertId, transfer_group_id: transferGroupId, intercompany, cargo: parsedMonto, fecha: dbFecha }
            });
            await recordBankAudit(conn, {
                cuentaBancariaId: ctaCred.id,
                entidad: 'movimientos_bancarios',
                entidadId: resCred.insertId,
                accion: 'CREATE_TRANSFER_CREDIT',
                user: req.user,
                ipAddress: req.ip,
                after: { id: resCred.insertId, transfer_group_id: transferGroupId, intercompany, abono: parsedMonto, fecha: dbFecha }
            });

            const body = {
                message: `Transferencia interna ${transferGroupId} creada y aplicada en cuenta actual.`,
                modo: cleanModo,
                transfer_group_id: transferGroupId,
                debit_id: resDeb.insertId,
                credit_id: resCred.insertId,
                intercompany
            };
            if (idempotencyKey) {
                await saveIdempotentResponse(conn, { key: idempotencyKey, scope: idempotencyScope, statusCode: 201, responseBody: body });
            }
            return {
                statusCode: 201,
                body,
                cuentaIds: [Number(ctaDeb.id), Number(ctaCred.id)]
            };
        });

        if (txResult.conflict) {
            return res.status(409).json({ message: 'Solicitud duplicada en proceso. Espere unos segundos.' });
        }
        if (txResult.replayed) {
            return res.status(txResult.statusCode).json(txResult.body);
        }
        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        for (const ctaId of (txResult.cuentaIds || [])) {
            emitBankUpdate(req.io, 'movimientos_updated', { cuenta_bancaria_id: ctaId, transfer_group_id: txResult.body?.transfer_group_id });
            emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: ctaId, transfer_group_id: txResult.body?.transfer_group_id });
        }

        res.status(txResult.statusCode || 200).json(txResult.body);
    } catch (error) {
        sendSafeError(res, error, 'Error al vincular transferencia interna');
    }
});

module.exports = router;
