const crypto = require('crypto');
const { formatDateYMD } = require('../utils/dateSv');
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
 * - Códigos de débito: NC, CH, 02
 * - Códigos de crédito: RM, NA, 01, 03
 * - Transferencia (TR / TRANSFERENCIA): respeta estrictamente el `tipo` explícito ('CARGO' | 'ABONO')
 */
function normalizeMovementDirection({ tipo, codRemesa, cod_remesa, descripcion } = {}) {
    const cod = String(codRemesa || cod_remesa || '').trim().toUpperCase();
    const rawTipo = String(tipo || '').trim().toUpperCase();

    if (cod === 'NC' || cod === 'CH' || cod === '02') {
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
 * Crea notificaciones en BD y emite `new_notification` por Socket.io a cada usuario destinatario.
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
                io.to(`user_${uid}`).emit('new_notification', {
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
    isDateInClosedPeriod,
    recordBankAudit,
    beginIdempotentRequest,
    saveIdempotentResponse,
    canApproveReapertura,
    canCloseConciliacion,
    canEditMontoConciliacion,
    getReaperturaApproverIds,
    notifyReaperturaEvent,
    emitBankUpdate
};
