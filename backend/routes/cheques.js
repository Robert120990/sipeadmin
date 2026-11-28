const express = require('express');
const router = express.Router();
const { getDb, getExternalDb, withTransaction } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { CHEQUE_APPROVAL_THRESHOLD_USD, createAndNotifyApprovalRequest } = require('../services/telegramFinanceApprovalService');
const { formatDateYMD, formatDisplayDMY, getElSalvadorTodayYMD } = require('../utils/dateSv');
const {
    parseStrictPositiveAmount,
    parseStrictNonNegativeAmount,
    parseStrictDBDate,
    getLiveAccountCheckbookSummary,
    consumeTalonarioNumber,
    isDateInClosedPeriod,
    recordBankAudit,
    beginIdempotentRequest,
    saveIdempotentResponse,
    emitBankUpdate
} = require('../services/bancosIntegrityService');

const chequeViewPerms = [
    'manage_cheques',
    '/dashboard/bancos/cheques',
    '/dashboard/bancos/cheques-contado',
    '/dashboard/bancos/reportes/cheques-fecha',
    '/dashboard/bancos/reportes/impresion-cheques',
    '/dashboard/bancos/reportes/saldos-chequera',
    '/dashboard/bancos/cuentas'
];

const chequeManagePerms = [
    'manage_cheques',
    '/dashboard/bancos/cheques'
];

const contadoPerms = [
    'manage_cheques_contado',
    '/dashboard/bancos/cheques-contado'
];

const cuentaResumenPerms = [
    ...chequeViewPerms,
    ...contadoPerms,
    '/dashboard/bancos/movimientos',
    'manage_movimientos'
];

const chequePrintPerms = [
    'manage_cheques',
    '/dashboard/bancos/cheques',
    '/dashboard/bancos/reportes/impresion-cheques',
    '/dashboard/bancos/impresion-cheques',
    '/dashboard/bancos/cheques-contado',
    'manage_cheques_contado'
];

const toDisplayDate = (dateVal) => {
    const formatted = formatDisplayDMY(dateVal);
    return formatted || null;
};

const toDBDate = (dateStr) => formatDateYMD(dateStr);

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
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)) return;
        throw err;
    }
}

async function validateAccountCompanyMatch(conn, accountEmpresaId, requestedEmpresaRef) {
    if (requestedEmpresaRef === undefined || requestedEmpresaRef === null) return { ok: true };
    const cleanRef = String(requestedEmpresaRef).trim();
    if (!cleanRef) return { ok: true };

    let [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ? LIMIT 1', [cleanRef]);
    if ((!empRows || empRows.length === 0) && /^\d+$/.test(cleanRef)) {
        [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ? OR id = ? LIMIT 1', [cleanRef, Number(cleanRef)]);
    }
    if (!empRows || empRows.length === 0) {
        return {
            ok: false,
            message: 'La empresa indicada no existe o no coincide con la cuenta bancaria seleccionada.'
        };
    }
    if (Number(empRows[0].id) !== Number(accountEmpresaId)) {
        return {
            ok: false,
            message: 'La cuenta bancaria seleccionada no pertenece a la empresa indicada.'
        };
    }
    return { ok: true };
}

router.get('/catalogos', authenticateToken, requirePermission(chequeViewPerms), async (req, res) => {
    try {
        const db = getDb();
        const [empresas] = await db.query('SELECT codigo as id, nombre FROM empresas ORDER BY nombre');

        let cuentas = [];

        const { id_empresa } = req.query;
        if (id_empresa) {
            const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
            if (empRows.length > 0) {
                const empresaId = empRows[0].id;
                [cuentas] = await db.query(
                    'SELECT c.id as corr, e.codigo as id_empresa, c.numero, c.nombre, ' +
                    'e.nombre as empresa_nombre, b.descripcion as banco_nombre, c.banco_id ' +
                    'FROM cuentas_bancarias c ' +
                    'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
                    'LEFT JOIN bancos b ON c.banco_id = b.id ' +
                    'WHERE c.activa = TRUE AND c.empresa_id = ? ' +
                    'ORDER BY b.descripcion ASC, c.numero ASC',
                    [empresaId]
                );
            }
        } else {
            [cuentas] = await db.query(
                'SELECT c.id as corr, e.codigo as id_empresa, c.numero, c.nombre, ' +
                'e.nombre as empresa_nombre, b.descripcion as banco_nombre, c.banco_id ' +
                'FROM cuentas_bancarias c ' +
                'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
                'LEFT JOIN bancos b ON c.banco_id = b.id ' +
                'WHERE c.activa = TRUE ' +
                'ORDER BY b.descripcion ASC, c.numero ASC'
            );
        }

        res.json({ empresas, cuentas });
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar catálogos');
    }
});

router.get('/rango', authenticateToken, requirePermission(chequeViewPerms), async (req, res) => {
    const { cuenta_bancaria_id, desde_cheque, hasta_cheque } = req.query;
    try {
        if (!cuenta_bancaria_id || desde_cheque === undefined || hasta_cheque === undefined) {
            return res.status(400).json({ message: 'Se requiere cuenta_bancaria_id, desde_cheque y hasta_cheque' });
        }

        const db = getDb();
        const query = `
            SELECT ch.id, ch.llave, e.codigo as id_empresa, cb.id as cuenta_bancaria_id, cb.numero as numero_cuenta, cb.nombre as cuenta_nombre,
                   b.id as banco_id, b.descripcion as banco_nombre, e.nombre as empresa_nombre,
                   ch.fecha, ch.cheque_anulado, ch.cheque, ch.valor, ch.valor_original, ch.a_nombre, ch.fecha_aplicado, ch.concepto,
                   ch.beneficiario_original, ch.concepto_original, ch.chequera_id,
                   ch.impreso_at, ch.impreso_por, COALESCE(ch.veces_impreso, 0) as veces_impreso, u_imp.nombre as impreso_por_nombre,
                   ch.es_reservado, ch.es_pago_contado, ch.fue_noemitido, ch.num_partida,
                   IF(ch.es_contabilizado, 'S', 'N') as es_contabilizado
            FROM cheques ch
            LEFT JOIN empresas e ON ch.empresa_id = e.id
            LEFT JOIN cuentas_bancarias cb ON ch.cuenta_bancaria_id = cb.id
            LEFT JOIN bancos b ON cb.banco_id = b.id
            LEFT JOIN users u_imp ON ch.impreso_por = u_imp.id
            WHERE ch.cuenta_bancaria_id = ?
              AND ch.deleted_at IS NULL
              AND CAST(ch.cheque AS UNSIGNED) BETWEEN ? AND ?
            ORDER BY CAST(ch.cheque AS UNSIGNED) ASC, ch.id ASC
        `;

        const [rows] = await db.query(query, [cuenta_bancaria_id, Number(desde_cheque), Number(hasta_cheque)]);

        const formatted = rows.map(r => ({
            ...r,
            fecha: toDisplayDate(r.fecha),
            fecha_aplicado: toDisplayDate(r.fecha_aplicado)
        }));

        res.json(formatted);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar cheques por rango');
    }
});

router.get('/reporte-fecha', authenticateToken, requirePermission(chequeViewPerms), async (req, res) => {
    const { cuenta_bancaria_id, desde, hasta, excluir_anulados, excluir_reservados } = req.query;
    try {
        if (!cuenta_bancaria_id || !desde || !hasta) {
            return res.status(400).json({ message: 'Se requiere cuenta_bancaria_id, desde y hasta' });
        }

        const db = getDb();
        let query = `
            SELECT ch.id, ch.llave, e.codigo as id_empresa, cb.id as cuenta_bancaria_id, cb.numero as numero_cuenta, cb.nombre as cuenta_nombre,
                   b.id as banco_id, b.descripcion as banco_nombre, e.nombre as empresa_nombre,
                   ch.fecha, ch.cheque_anulado, ch.cheque, ch.valor, ch.valor_original, ch.a_nombre, ch.fecha_aplicado, ch.concepto,
                   ch.beneficiario_original, ch.concepto_original, ch.chequera_id,
                   ch.impreso_at, ch.impreso_por, COALESCE(ch.veces_impreso, 0) as veces_impreso, u_imp.nombre as impreso_por_nombre,
                   ch.es_reservado, ch.es_pago_contado, ch.fue_noemitido, ch.num_partida,
                   IF(ch.es_contabilizado, 'S', 'N') as es_contabilizado
            FROM cheques ch
            LEFT JOIN empresas e ON ch.empresa_id = e.id
            LEFT JOIN cuentas_bancarias cb ON ch.cuenta_bancaria_id = cb.id
            LEFT JOIN bancos b ON cb.banco_id = b.id
            LEFT JOIN users u_imp ON ch.impreso_por = u_imp.id
            WHERE ch.cuenta_bancaria_id = ?
              AND ch.deleted_at IS NULL
              AND ch.fecha BETWEEN ? AND ?
        `;
        const params = [cuenta_bancaria_id, desde, hasta];

        if (excluir_anulados === 'true' || excluir_anulados === true) {
            query += ' AND ch.cheque_anulado = FALSE';
        }

        if (excluir_reservados === 'true' || excluir_reservados === true) {
            query += ' AND ch.es_reservado = FALSE';
        }

        query += ' ORDER BY ch.fecha ASC, CAST(ch.cheque AS UNSIGNED) ASC, ch.id ASC';

        const [rows] = await db.query(query, params);

        const formatted = rows.map(r => ({
            ...r,
            fecha: toDisplayDate(r.fecha),
            fecha_raw: r.fecha ? toDBDate(r.fecha) : '',
            fecha_aplicado: toDisplayDate(r.fecha_aplicado)
        }));

        res.json(formatted);
    } catch (error) {
        sendSafeError(res, error, 'Error al generar reporte de cheques por fecha');
    }
});

router.get('/', authenticateToken, requirePermission(chequeViewPerms), async (req, res) => {
    const { id_empresa, numero_cuenta, cuenta_bancaria_id, desde, hasta, limit, page } = req.query;
    try {
        const db = getDb();
        let whereSql = 'WHERE ch.deleted_at IS NULL ';
        const params = [];

        if (id_empresa) {
            whereSql += ' AND e.codigo = ?';
            params.push(id_empresa);
        }
        if (cuenta_bancaria_id) {
            whereSql += ' AND ch.cuenta_bancaria_id = ?';
            params.push(parseInt(cuenta_bancaria_id, 10));
        } else if (numero_cuenta) {
            whereSql += ' AND cb.numero = ?';
            params.push(numero_cuenta);
        }
        if (desde && hasta) {
            whereSql += ' AND ch.fecha BETWEEN ? AND ?';
            params.push(desde, hasta);
        }

        const safeLimit = Math.min(2000, Math.max(1, parseInt(limit, 10) || 1000));
        const safePage = Math.max(1, parseInt(page, 10) || 1);
        const offset = (safePage - 1) * safeLimit;

        const baseJoins =
            'FROM cheques ch ' +
            'LEFT JOIN empresas e ON ch.empresa_id = e.id ' +
            'LEFT JOIN cuentas_bancarias cb ON ch.cuenta_bancaria_id = cb.id ' +
            'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
            'LEFT JOIN users u_imp ON ch.impreso_por = u_imp.id ';

        const [[countRow]] = await db.query(`SELECT COUNT(*) as total ${baseJoins} ${whereSql}`, params);
        const total = Number(countRow?.total || 0);

        const selectSql =
            'SELECT ch.id, ch.llave, ch.cuenta_bancaria_id, e.codigo as id_empresa, cb.numero as numero_cuenta, cb.nombre as cuenta_nombre, ' +
            'b.id as banco_id, ch.fecha, ch.cheque_anulado, ch.cheque, ch.valor, ch.valor_original, ch.a_nombre, ch.fecha_aplicado, ch.concepto, ' +
            'ch.beneficiario_original, ch.concepto_original, ch.chequera_id, ' +
            'ch.impreso_at, ch.impreso_por, COALESCE(ch.veces_impreso, 0) as veces_impreso, u_imp.nombre as impreso_por_nombre, ' +
            'ch.es_reservado, ch.es_pago_contado, ch.fue_noemitido, ch.num_partida, ch.version, ' +
            'IF(ch.es_contabilizado, "S", "N") as es_contabilizado, ' +
            'e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
            `${baseJoins} ${whereSql} ORDER BY ch.fecha DESC, ch.id DESC LIMIT ? OFFSET ?`;

        const [rows] = await db.query(selectSql, [...params, safeLimit, offset]);

        const formatted = rows.map(r => ({
            ...r,
            fecha: toDisplayDate(r.fecha),
            fecha_aplicado: toDisplayDate(r.fecha_aplicado)
        }));

        res.setHeader('X-Total-Count', String(total));
        res.setHeader('X-Truncated', total > offset + rows.length ? 'true' : 'false');
        res.json(formatted);
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar cheques');
    }
});

const handleCuentaResumen = async (req, res) => {
    try {
        const db = getDb();
        let cuentaId = parseInt(req.params.cuentaId || req.query.cuenta_bancaria_id, 10);

        if ((!Number.isInteger(cuentaId) || cuentaId <= 0) && req.query.id_empresa && req.query.numero_cuenta) {
            const [ctaRows] = await db.query(
                `SELECT cb.id
                 FROM cuentas_bancarias cb
                 INNER JOIN empresas e ON cb.empresa_id = e.id
                 WHERE e.codigo = ? AND cb.numero = ?
                 LIMIT 1`,
                [String(req.query.id_empresa).trim(), String(req.query.numero_cuenta).trim()]
            );
            if (ctaRows && ctaRows.length > 0) {
                cuentaId = Number(ctaRows[0].id);
            }
        }

        if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
            return res.status(400).json({ message: 'Se requiere cuenta_bancaria_id o id_empresa + numero_cuenta válido.' });
        }

        const summary = await getLiveAccountCheckbookSummary(db, cuentaId, {
            hasta: req.query.hasta || null
        });
        if (!summary) {
            return res.status(404).json({ message: 'Cuenta bancaria no encontrada.' });
        }

        return res.json(summary);
    } catch (error) {
        return sendSafeError(res, error, 'Error al consultar resumen en vivo de la cuenta');
    }
};

router.get('/cuenta-resumen', authenticateToken, requirePermission(cuentaResumenPerms), handleCuentaResumen);
router.get('/cuenta-resumen/:cuentaId', authenticateToken, requirePermission(cuentaResumenPerms), handleCuentaResumen);

router.post('/registrar-impresion-lote', authenticateToken, requirePermission(chequePrintPerms), async (req, res) => {
    const rawIds = Array.isArray(req.body?.ids)
        ? req.body.ids
        : (Array.isArray(req.body?.cheque_ids) ? req.body.cheque_ids : []);
    const ids = [...new Set(rawIds.map(v => parseInt(v, 10)).filter(v => Number.isInteger(v) && v > 0))];

    if (ids.length === 0 || ids.length > 500) {
        return res.status(400).json({ message: 'Debe enviar entre 1 y 500 IDs de cheques válidos para registrar impresión.' });
    }

    const { formato_id = null, printer_name = null } = req.body || {};

    try {
        const txResult = await withTransaction(async (conn) => {
            const ph = ids.map(() => '?').join(',');
            const [rows] = await conn.query(
                `SELECT id, cuenta_bancaria_id, cheque, llave, cheque_anulado, deleted_at,
                        impreso_at, impreso_por, COALESCE(veces_impreso, 0) as veces_impreso
                 FROM cheques
                 WHERE id IN (${ph}) AND deleted_at IS NULL
                 FOR UPDATE`,
                ids
            );

            if (!rows || rows.length === 0) {
                return { errorStatus: 404, errorBody: { message: 'No se encontraron cheques válidos para registrar impresión.' } };
            }

            const nowIso = new Date().toISOString();
            const userId = req.user?.id || null;
            const userName = req.user?.nombre || req.user?.username || null;
            const resultados = [];
            const affectedAccounts = new Set();

            for (const row of rows) {
                const prevVeces = Number(row.veces_impreso || 0);
                const esReimpresion = prevVeces > 0;
                const newVeces = prevVeces + 1;

                await conn.query(
                    'UPDATE cheques SET impreso_at = NOW(), impreso_por = ?, veces_impreso = COALESCE(veces_impreso, 0) + 1 WHERE id = ?',
                    [userId, row.id]
                );

                await recordBankAudit(conn, {
                    cuentaBancariaId: row.cuenta_bancaria_id,
                    entidad: 'cheques',
                    entidadId: row.id,
                    accion: esReimpresion ? 'REPRINT_CHEQUE' : 'PRINT_CHEQUE',
                    user: req.user,
                    ipAddress: req.ip,
                    before: { veces_impreso: prevVeces, impreso_at: row.impreso_at || null },
                    after: { veces_impreso: newVeces, impreso_at: nowIso, impreso_por: userId },
                    metadata: { formato_id, printer_name, lote: true }
                });

                if (row.cuenta_bancaria_id) {
                    affectedAccounts.add(Number(row.cuenta_bancaria_id));
                }

                resultados.push({
                    id: Number(row.id),
                    cheque: row.cheque,
                    llave: row.llave,
                    impreso_at: nowIso,
                    impreso_por: userId,
                    impreso_por_nombre: userName,
                    veces_impreso: newVeces,
                    es_reimpresion: esReimpresion
                });
            }

            const reimpresos = resultados.filter(r => r.es_reimpresion);
            return {
                affectedAccounts: [...affectedAccounts],
                body: {
                    total_registrados: resultados.length,
                    tiene_reimpresiones: reimpresos.length > 0,
                    reimpresiones_count: reimpresos.length,
                    advertencia_reimpresion: reimpresos.length > 0
                        ? `${reimpresos.length} cheque(s) ya habían sido impresos anteriormente: ${reimpresos.map(r => `#${r.cheque}`).join(', ')}.`
                        : null,
                    resultados
                }
            };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        for (const ctaId of txResult.affectedAccounts) {
            emitBankUpdate(req.io, 'cheques_updated', { cuenta_bancaria_id: ctaId });
        }

        return res.json(txResult.body);
    } catch (error) {
        return sendSafeError(res, error, 'Error al registrar impresión en lote');
    }
});

router.post('/', authenticateToken, requirePermission(chequeManagePerms), async (req, res) => {
    const {
        id_empresa, empresa_id, numero_cuenta, cuenta_bancaria_id, fecha, fecha_aplicado, cheque, valor,
        a_nombre, concepto,
        cheque_anulado, es_reservado, es_pago_contado, fue_noemitido, num_partida, chequera_id
    } = req.body || {};

    const esAnulado = Boolean(cheque_anulado);
    const esReservado = Boolean(es_reservado);
    const fueNoEmitido = Boolean(fue_noemitido);
    const esActivo = !esAnulado && !esReservado && !fueNoEmitido;

    const valorNum = esActivo
        ? parseStrictPositiveAmount(valor)
        : (valor === '' || valor === null || valor === undefined ? 0 : parseStrictNonNegativeAmount(valor));

    if (valorNum === null) {
        return res.status(400).json({
            message: esActivo
                ? 'El valor del cheque debe ser mayor a $0.00'
                : 'El valor del cheque no puede ser negativo ni inválido'
        });
    }

    const dbFecha = parseStrictDBDate(fecha || getElSalvadorTodayYMD());
    if (!dbFecha) {
        return res.status(400).json({ message: 'La fecha del cheque no es válida.' });
    }
    const dbFechaAplicado = fecha_aplicado ? parseStrictDBDate(fecha_aplicado) : null;
    if (fecha_aplicado && !dbFechaAplicado) {
        return res.status(400).json({ message: 'La fecha de aplicación del cheque no es válida.' });
    }

    const cleanCheque = String(cheque || '').trim().slice(0, 20);
    if (!cleanCheque) {
        return res.status(400).json({ message: 'El número de cheque es requerido.' });
    }

    const idempotencyKey = getIdempotencyKey(req);

    try {
        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'cheques_create',
                    userId: req.user?.id,
                    payload: { id_empresa, numero_cuenta, cuenta_bancaria_id, cleanCheque, valorNum, dbFecha }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            let empresaId = null;
            let cuentaBancariaId = null;
            let numCuentaFinal = numero_cuenta || '';

            if (cuenta_bancaria_id) {
                const [ctaRows] = await conn.query('SELECT id, empresa_id, numero FROM cuentas_bancarias WHERE id = ? AND activa = TRUE', [cuenta_bancaria_id]);
                if (ctaRows.length === 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_create');
                    return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                }
                for (const reqEmpRef of [empresa_id, id_empresa]) {
                    const companyMatch = await validateAccountCompanyMatch(conn, ctaRows[0].empresa_id, reqEmpRef);
                    if (!companyMatch.ok) {
                        await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_create');
                        return { errorStatus: 400, errorBody: { message: companyMatch.message } };
                    }
                }
                cuentaBancariaId = ctaRows[0].id;
                empresaId = ctaRows[0].empresa_id;
                numCuentaFinal = ctaRows[0].numero;
            } else {
                const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
                if (empRows.length === 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_create');
                    return { errorStatus: 400, errorBody: { message: 'Empresa no encontrada' } };
                }
                empresaId = empRows[0].id;

                const [cuentaRows] = await conn.query(
                    'SELECT id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ? AND activa = TRUE',
                    [empresaId, numero_cuenta]
                );
                if (cuentaRows.length === 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_create');
                    return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                }
                cuentaBancariaId = cuentaRows[0].id;
            }

            const lockCheck = await isDateInClosedPeriod(conn, cuentaBancariaId, [dbFecha, dbFechaAplicado]);
            if (lockCheck.closed) {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_create');
                return {
                    errorStatus: 423,
                    errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para registrar cheques en esa fecha.` }
                };
            }

            // Bloquear número de cheque duplicado activo en la misma cuenta
            if (!esAnulado) {
                const [dupRows] = await conn.query(
                    'SELECT id, fecha, a_nombre, valor FROM cheques WHERE cuenta_bancaria_id = ? AND cheque = ? AND deleted_at IS NULL AND cheque_anulado = FALSE LIMIT 1 FOR UPDATE',
                    [cuentaBancariaId, cleanCheque]
                );
                if (dupRows && dupRows.length > 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_create');
                    return {
                        errorStatus: 409,
                        errorBody: { message: `El cheque #${cleanCheque} ya existe activo en esta cuenta bancaria (${toDisplayDate(dupRows[0].fecha)} · $${Number(dupRows[0].valor).toFixed(2)}).` }
                    };
                }
            }

            const tempLlave = `TMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
            const cleanConcepto = String(concepto || '').trim().toUpperCase().slice(0, 255);
            const cleanNombre = String(a_nombre || '').trim().slice(0, 150);

            const [result] = await conn.query(
                `INSERT INTO cheques
                    (empresa_id, cuenta_bancaria_id, llave, fecha, cheque_anulado, cheque, valor, a_nombre,
                     fecha_aplicado, concepto, es_reservado, es_pago_contado, fue_noemitido, num_partida,
                     created_by, conciliado_by, conciliado_at, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    empresaId, cuentaBancariaId, tempLlave, dbFecha, esAnulado ? 1 : 0, cleanCheque, valorNum, cleanNombre,
                    dbFechaAplicado, cleanConcepto, esReservado ? 1 : 0, es_pago_contado ? 1 : 0, fueNoEmitido ? 1 : 0, num_partida || null,
                    req.user?.id || null, dbFechaAplicado ? (req.user?.id || null) : null, dbFechaAplicado ? new Date() : null
                ]
            );

            const nuevaLlave = 'CHQ' + String(result.insertId).padStart(17, '0');
            const talonarioRes = await consumeTalonarioNumber(conn, {
                cuentaBancariaId,
                chequeNumero: cleanCheque,
                chequeraId: chequera_id || null
            });
            try {
                await conn.query('UPDATE cheques SET llave = ?, chequera_id = ? WHERE id = ?', [
                    nuevaLlave,
                    talonarioRes.chequeraId || null,
                    result.insertId
                ]);
            } catch (updErr) {
                if (updErr && (updErr.code === 'ER_BAD_FIELD_ERROR' || updErr.errno === 1054)) {
                    await conn.query('UPDATE cheques SET llave = ? WHERE id = ?', [nuevaLlave, result.insertId]);
                } else {
                    throw updErr;
                }
            }

            await recordBankAudit(conn, {
                cuentaBancariaId,
                entidad: 'cheques',
                entidadId: result.insertId,
                accion: 'CREATE',
                user: req.user,
                ipAddress: req.ip,
                after: {
                    id: result.insertId,
                    llave: nuevaLlave,
                    cheque: cleanCheque,
                    fecha: dbFecha,
                    valor: valorNum,
                    a_nombre: cleanNombre,
                    chequera_id: talonarioRes.chequeraId || null
                }
            });

            const body = {
                message: 'Cheque registrado exitosamente',
                llave: nuevaLlave,
                id: result.insertId,
                chequera_id: talonarioRes.chequeraId || null,
                talonario_alerta: talonarioRes.talonarioAlerta || null
            };
            if (idempotencyKey) {
                await saveIdempotentResponse(conn, { key: idempotencyKey, scope: 'cheques_create', statusCode: 201, responseBody: body });
            }

            return {
                statusCode: 201,
                body,
                cuentaBancariaId,
                numCuentaFinal,
                cleanNombre,
                cleanConcepto,
                llave: nuevaLlave,
                insertId: result.insertId
            };
        });

        if (txResult.conflict) {
            return res.status(409).json({ message: 'Registro de cheque duplicado en proceso.' });
        }
        if (txResult.replayed) {
            return res.status(txResult.statusCode).json(txResult.body);
        }
        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'cheques_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id: txResult.insertId });
        emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id: txResult.insertId });

        res.status(201).json(txResult.body);

        if (!esAnulado && !esReservado && !fueNoEmitido && valorNum >= CHEQUE_APPROVAL_THRESHOLD_USD) {
            const db = getDb();
            createAndNotifyApprovalRequest({
                db,
                tipo: 'CHEQUE',
                entidadId: txResult.insertId,
                titulo: `Cheque #${cleanCheque || txResult.llave}`,
                resumen: `A favor de ${txResult.cleanNombre || 'Beneficiario'} — ${txResult.cleanConcepto.slice(0, 120)}`,
                montoUsd: valorNum,
                empresaNombre: id_empresa,
                requestedByUser: req.user,
                metadata: {
                    cheque_id: txResult.insertId,
                    llave: txResult.llave,
                    cheque: cleanCheque,
                    numero_cuenta: txResult.numCuentaFinal,
                    a_nombre: txResult.cleanNombre,
                    fecha: dbFecha
                },
                io: req.io
            }).catch(err => console.warn('[Cheques][TgApproval]:', err.message));
        }
    } catch (error) {
        sendSafeError(res, error, 'Error al registrar cheque');
    }
});

router.post('/:id/registrar-impresion', authenticateToken, requirePermission(chequePrintPerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de cheque inválido.' });
    }
    const { formato_id = null, printer_name = null } = req.body || {};

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[existing]] = await conn.query(
                `SELECT id, cuenta_bancaria_id, cheque, llave, deleted_at,
                        impreso_at, impreso_por, COALESCE(veces_impreso, 0) as veces_impreso
                 FROM cheques
                 WHERE id = ?
                 FOR UPDATE`,
                [id]
            );
            if (!existing || existing.deleted_at) {
                return { errorStatus: 404, errorBody: { message: 'Cheque no encontrado.' } };
            }

            const prevVeces = Number(existing.veces_impreso || 0);
            const esReimpresion = prevVeces > 0;
            const newVeces = prevVeces + 1;
            const userId = req.user?.id || null;
            const userName = req.user?.nombre || req.user?.username || null;

            await conn.query(
                'UPDATE cheques SET impreso_at = NOW(), impreso_por = ?, veces_impreso = COALESCE(veces_impreso, 0) + 1 WHERE id = ?',
                [userId, id]
            );

            const [[updated]] = await conn.query('SELECT impreso_at FROM cheques WHERE id = ?', [id]);
            const impresoAt = updated?.impreso_at || new Date().toISOString();

            await recordBankAudit(conn, {
                cuentaBancariaId: existing.cuenta_bancaria_id,
                entidad: 'cheques',
                entidadId: id,
                accion: esReimpresion ? 'REPRINT_CHEQUE' : 'PRINT_CHEQUE',
                user: req.user,
                ipAddress: req.ip,
                before: { veces_impreso: prevVeces, impreso_at: existing.impreso_at || null },
                after: { veces_impreso: newVeces, impreso_at: impresoAt, impreso_por: userId },
                metadata: { formato_id, printer_name }
            });

            return {
                cuentaBancariaId: existing.cuenta_bancaria_id,
                body: {
                    id,
                    cheque: existing.cheque,
                    impreso_at: impresoAt,
                    impreso_por: userId,
                    impreso_por_nombre: userName,
                    veces_impreso: newVeces,
                    es_reimpresion: esReimpresion,
                    advertencia_reimpresion: esReimpresion
                        ? `Este cheque ya había sido impreso ${prevVeces} ${prevVeces === 1 ? 'vez' : 'veces'} anteriormente. Se registró la reimpresión #${newVeces}.`
                        : null
                }
            };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'cheques_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });
        return res.json(txResult.body);
    } catch (error) {
        return sendSafeError(res, error, 'Error al registrar impresión del cheque');
    }
});

router.put('/:id', authenticateToken, requirePermission(chequeManagePerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de cheque inválido.' });
    }

    const {
        id_empresa, empresa_id, numero_cuenta, cuenta_bancaria_id, fecha, fecha_aplicado, cheque, valor,
        a_nombre, concepto,
        cheque_anulado, es_reservado, es_pago_contado, fue_noemitido, num_partida, version
    } = req.body || {};

    const esAnulado = Boolean(cheque_anulado);
    const esReservado = Boolean(es_reservado);
    const fueNoEmitido = Boolean(fue_noemitido);
    const esActivo = !esAnulado && !esReservado && !fueNoEmitido;

    const valorNum = esActivo
        ? parseStrictPositiveAmount(valor)
        : (valor === '' || valor === null || valor === undefined ? 0 : parseStrictNonNegativeAmount(valor));

    if (valorNum === null) {
        return res.status(400).json({
            message: esActivo
                ? 'El valor del cheque debe ser mayor a $0.00'
                : 'El valor del cheque no puede ser negativo ni inválido'
        });
    }

    const dbFecha = parseStrictDBDate(fecha);
    if (!dbFecha) {
        return res.status(400).json({ message: 'La fecha del cheque no es válida.' });
    }
    const dbFechaAplicado = fecha_aplicado ? parseStrictDBDate(fecha_aplicado) : null;
    if (fecha_aplicado && !dbFechaAplicado) {
        return res.status(400).json({ message: 'La fecha de aplicación del cheque no es válida.' });
    }

    const cleanCheque = String(cheque || '').trim().slice(0, 20);
    if (!cleanCheque) {
        return res.status(400).json({ message: 'El número de cheque es requerido.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[existing]] = await conn.query('SELECT * FROM cheques WHERE id = ? FOR UPDATE', [id]);
            if (!existing || existing.deleted_at) {
                return { errorStatus: 404, errorBody: { message: 'Cheque no encontrado.' } };
            }
            if (existing.es_contabilizado) {
                return { errorStatus: 409, errorBody: { message: 'No se puede editar un cheque contabilizado.' } };
            }
            if (existing.fecha_aplicado) {
                return { errorStatus: 409, errorBody: { message: 'Este cheque ya fue conciliado. Desconcilie primero en Conciliación Bancaria antes de editar.' } };
            }
            if (version !== undefined && Number(version) !== Number(existing.version || 1)) {
                return { errorStatus: 409, errorBody: { message: 'El cheque fue modificado por otro usuario. Recargue la lista.' } };
            }

            let empresaId = existing.empresa_id;
            let cuentaBancariaId = existing.cuenta_bancaria_id;
            let resolvedAccountEmpresaId = existing.empresa_id;

            if (cuenta_bancaria_id) {
                const [ctaRows] = await conn.query('SELECT id, empresa_id FROM cuentas_bancarias WHERE id = ? AND activa = TRUE', [cuenta_bancaria_id]);
                if (ctaRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                cuentaBancariaId = ctaRows[0].id;
                empresaId = ctaRows[0].empresa_id;
                resolvedAccountEmpresaId = ctaRows[0].empresa_id;
            } else if (id_empresa && numero_cuenta) {
                const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
                if (empRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Empresa no encontrada' } };
                empresaId = empRows[0].id;

                const [cuentaRows] = await conn.query(
                    'SELECT id, empresa_id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ? AND activa = TRUE',
                    [empresaId, numero_cuenta]
                );
                if (cuentaRows.length === 0) {
                    return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                }
                cuentaBancariaId = cuentaRows[0].id;
                resolvedAccountEmpresaId = cuentaRows[0].empresa_id ?? empresaId;
            } else if (existing.cuenta_bancaria_id) {
                const [ctaRows] = await conn.query('SELECT id, empresa_id FROM cuentas_bancarias WHERE id = ? LIMIT 1', [existing.cuenta_bancaria_id]);
                if (ctaRows && ctaRows.length > 0 && ctaRows[0].empresa_id) {
                    resolvedAccountEmpresaId = ctaRows[0].empresa_id;
                }
            }

            for (const reqEmpRef of [empresa_id, id_empresa]) {
                const companyMatch = await validateAccountCompanyMatch(conn, resolvedAccountEmpresaId, reqEmpRef);
                if (!companyMatch.ok) {
                    return { errorStatus: 400, errorBody: { message: companyMatch.message } };
                }
            }

            const lockOld = await isDateInClosedPeriod(conn, existing.cuenta_bancaria_id, [existing.fecha, existing.fecha_aplicado]);
            if (lockOld.closed) {
                return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockOld.lockedDate)}. Solicite reapertura.` } };
            }
            const lockNew = await isDateInClosedPeriod(conn, cuentaBancariaId, [dbFecha, dbFechaAplicado]);
            if (lockNew.closed) {
                return { errorStatus: 423, errorBody: { message: `Período destino cerrado hasta ${toDisplayDate(lockNew.lockedDate)}.` } };
            }

            if (!esAnulado) {
                const [dupRows] = await conn.query(
                    'SELECT id FROM cheques WHERE cuenta_bancaria_id = ? AND cheque = ? AND id != ? AND deleted_at IS NULL AND cheque_anulado = FALSE LIMIT 1 FOR UPDATE',
                    [cuentaBancariaId, cleanCheque, id]
                );
                if (dupRows && dupRows.length > 0) {
                    return { errorStatus: 409, errorBody: { message: `Ya existe otro cheque activo #${cleanCheque} en esta cuenta.` } };
                }
            }

            // Preservar valores originales al transicionar hacia anulado
            const transitioningToVoid = esAnulado && !existing.cheque_anulado;
            const valorOrig = transitioningToVoid ? Number(existing.valor || 0) : existing.valor_original;
            const benefOrig = transitioningToVoid ? (existing.a_nombre || '') : existing.beneficiario_original;
            const concOrig = transitioningToVoid ? (existing.concepto || '') : existing.concepto_original;
            const anuladoBy = transitioningToVoid ? (req.user?.id || null) : (esAnulado ? existing.anulado_by : null);
            const anuladoAt = transitioningToVoid ? new Date() : (esAnulado ? existing.anulado_at : null);

            const cleanConcepto = String(concepto || '').trim().toUpperCase().slice(0, 255);
            const cleanNombre = String(a_nombre || '').trim().slice(0, 150);

            await conn.query(
                `UPDATE cheques
                 SET empresa_id = ?, cuenta_bancaria_id = ?, fecha = ?, cheque_anulado = ?, cheque = ?,
                     valor = ?, a_nombre = ?, fecha_aplicado = ?, concepto = ?,
                     es_reservado = ?, es_pago_contado = ?, fue_noemitido = ?, num_partida = ?,
                     valor_original = ?, beneficiario_original = ?, concepto_original = ?,
                     anulado_by = ?, anulado_at = ?, updated_by = ?, version = version + 1
                 WHERE id = ?`,
                [
                    empresaId, cuentaBancariaId, dbFecha, esAnulado ? 1 : 0, cleanCheque,
                    valorNum, cleanNombre, dbFechaAplicado, cleanConcepto,
                    esReservado ? 1 : 0, es_pago_contado ? 1 : 0, fueNoEmitido ? 1 : 0, num_partida || null,
                    valorOrig, benefOrig, concOrig, anuladoBy, anuladoAt, req.user?.id || null, id
                ]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId,
                entidad: 'cheques',
                entidadId: id,
                accion: transitioningToVoid ? 'VOID_CHEQUE' : 'UPDATE',
                user: req.user,
                ipAddress: req.ip,
                before: {
                    cheque: existing.cheque,
                    fecha: toDBDate(existing.fecha),
                    valor: Number(existing.valor),
                    a_nombre: existing.a_nombre,
                    cheque_anulado: Boolean(existing.cheque_anulado)
                },
                after: {
                    cheque: cleanCheque,
                    fecha: dbFecha,
                    valor: valorNum,
                    a_nombre: cleanNombre,
                    cheque_anulado: esAnulado
                }
            });

            return { cuentaBancariaId };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'cheques_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });
        emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });

        res.json({ message: 'Cheque actualizado exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar cheque');
    }
});

router.delete('/:id', authenticateToken, requirePermission(chequeManagePerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de cheque inválido.' });
    }
    const motivo = String(req.body?.motivo || req.query?.motivo || 'Eliminación solicitada por usuario').trim().slice(0, 255);

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[existing]] = await conn.query('SELECT * FROM cheques WHERE id = ? FOR UPDATE', [id]);
            if (!existing || existing.deleted_at) {
                return { errorStatus: 404, errorBody: { message: 'Cheque no encontrado.' } };
            }
            if (existing.es_contabilizado) {
                return { errorStatus: 409, errorBody: { message: 'No se puede eliminar un cheque contabilizado.' } };
            }
            if (existing.fecha_aplicado) {
                return { errorStatus: 409, errorBody: { message: 'No se puede eliminar un cheque conciliado. Desconcilie primero en Conciliación Bancaria.' } };
            }

            const lockCheck = await isDateInClosedPeriod(conn, existing.cuenta_bancaria_id, [existing.fecha, existing.fecha_aplicado]);
            if (lockCheck.closed) {
                return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para eliminar.` } };
            }

            await conn.query(
                'UPDATE cheques SET deleted_at = NOW(), deleted_by = ?, motivo_eliminacion = ?, version = version + 1 WHERE id = ?',
                [req.user?.id || null, motivo, id]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: existing.cuenta_bancaria_id,
                entidad: 'cheques',
                entidadId: id,
                accion: 'SOFT_DELETE',
                user: req.user,
                ipAddress: req.ip,
                motivo,
                before: {
                    id: existing.id,
                    llave: existing.llave,
                    cheque: existing.cheque,
                    fecha: toDBDate(existing.fecha),
                    valor: Number(existing.valor),
                    a_nombre: existing.a_nombre,
                    concepto: existing.concepto
                }
            });

            return { cuentaBancariaId: existing.cuenta_bancaria_id };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'cheques_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });
        emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });

        res.json({ message: 'Cheque eliminado exitosamente (respaldado en auditoría)' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar cheque');
    }
});

router.get('/contado/estaciones', authenticateToken, requirePermission(contadoPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query(
            "SELECT id, nombre FROM empresas WHERE id <> '001' AND activa = 'S' ORDER BY id"
        );
        res.json(rows);
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar estaciones');
    }
});

router.get('/contado/cuentas', authenticateToken, requirePermission(contadoPerms), async (req, res) => {
    try {
        const db = getDb();
        const [cuentas] = await db.query(
            'SELECT c.id as corr, c.numero, c.nombre, b.descripcion as banco, ' +
            'e.nombre as empresa_nombre, e.codigo as empresa_codigo ' +
            'FROM cuentas_bancarias c ' +
            'INNER JOIN bancos b ON c.banco_id = b.id ' +
            'INNER JOIN empresas e ON c.empresa_id = e.id ' +
            'WHERE c.activa = TRUE ' +
            'ORDER BY c.orden ASC'
        );
        res.json(cuentas);
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar cuentas');
    }
});

// Solo lectura pura: ya NO ejecuta mutaciones silenciosas sobre externalDb
router.get('/contado/solicitudes', authenticateToken, requirePermission(contadoPerms), async (req, res) => {
    try {
        const { estacion, pendientes } = req.query;
        if (!estacion) return res.status(400).json({ message: 'Falta parametro estacion' });

        const externalDb = await getExternalDb();
        const db = getDb();

        let query = `SELECT a.llave, a.fecha, a.cod_proveedor, COALESCE(b.nombre,'') as nombre,
                     a.monto, a.fecha_entrega, a.num_ccf, a.num_cheque,
                     a.llave_cheque, a.cod_destino, a.tipo_destino, a.id_rubro,
                     COALESCE(d.descripcion,'') as nom_rubro,
                     LEFT(a.tipo_destino,1) as tipo_destino2
                     FROM solicitud_chq_contado a
                     LEFT JOIN proveedores b ON a.id_empresa = b.id_empresa AND a.cod_proveedor = b.codigo
                     LEFT JOIN flc_rubros d ON a.id_rubro = d.id
                     WHERE a.id_empresa = ?`;
        const params = [estacion];

        if (pendientes === '1') {
            query += " AND TRIM(COALESCE(a.num_cheque,'')) = ''";
        }

        query += " ORDER BY a.fecha, b.nombre";
        const [rows] = await externalDb.query(query, params);

        let chequesLocal = [];
        try {
            const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [estacion]);
            if (empRows.length > 0) {
                const [chqRows] = await db.query(`
                    SELECT ch.id, ch.llave, ch.cheque, ch.fecha, ch.valor, ch.a_nombre, cb.numero as numero_cuenta, b.descripcion as banco_nombre
                    FROM cheques ch
                    LEFT JOIN cuentas_bancarias cb ON ch.cuenta_bancaria_id = cb.id
                    LEFT JOIN bancos b ON cb.banco_id = b.id
                    WHERE ch.empresa_id = ? AND ch.deleted_at IS NULL AND ch.cheque_anulado = FALSE
                `, [empRows[0].id]);
                chequesLocal = chqRows || [];
            }
        } catch (e) {
            console.warn('[contado/solicitudes] Note checking local cheques:', e.message);
        }

        const formatted = rows.map(r => {
            const numCheque = (r.num_cheque || '').trim();
            const llaveCheque = (r.llave_cheque || '').trim();
            let suggestedCheque = null;

            if (!numCheque && chequesLocal.length > 0) {
                let match = null;
                if (llaveCheque) {
                    match = chequesLocal.find(c => c.llave === llaveCheque);
                }
                if (!match) {
                    const rMonto = Number(r.monto || 0);
                    const rFecha = r.fecha ? toDBDate(r.fecha) : '';
                    const rNombre = (r.nombre || '').trim().toLowerCase();

                    match = chequesLocal.find(c => {
                        const cMonto = Number(c.valor || 0);
                        if (Math.abs(cMonto - rMonto) > 0.01) return false;
                        const cFecha = c.fecha ? toDBDate(c.fecha) : '';
                        const cNombre = (c.a_nombre || '').trim().toLowerCase();

                        if (rNombre && cNombre && (rNombre.includes(cNombre) || cNombre.includes(rNombre))) return true;
                        if (rFecha && cFecha && rFecha === cFecha) return true;
                        return false;
                    });
                }

                if (match && match.cheque) {
                    suggestedCheque = {
                        cheque: String(match.cheque).trim(),
                        llave: match.llave,
                        banco: match.banco_nombre || '',
                        numero_cuenta: match.numero_cuenta || ''
                    };
                }
            }

            return {
                ...r,
                monto: Number(r.monto || 0),
                num_cheque: numCheque,
                llave_cheque: llaveCheque,
                num_ccf: r.num_ccf || '',
                fecha_entrega: r.fecha_entrega || '',
                matched_local: Boolean(suggestedCheque),
                suggested_cheque: suggestedCheque
            };
        });

        res.json(formatted);
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar solicitudes de cheques');
    }
});

router.post('/contado/generar', authenticateToken, requirePermission(contadoPerms), async (req, res) => {
    const {
        llave,
        estacion_solicitud,
        id_empresa,
        cuenta_bancaria_id,
        numero_cuenta,
        cheque_num,
        fecha,
        valor,
        a_nombre,
        concepto,
        chequera_id
    } = req.body || {};

    const estacionSol = String(estacion_solicitud || id_empresa || '').trim();
    const hasCuentaRef = Boolean(cuenta_bancaria_id) || Boolean((id_empresa || estacionSol) && numero_cuenta);

    if (!llave || !estacionSol || !hasCuentaRef || !cheque_num || !String(cheque_num).trim()) {
        return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    const valorNum = parseStrictPositiveAmount(valor);
    if (valorNum === null) {
        return res.status(400).json({ message: 'El monto del cheque debe ser mayor a $0.00' });
    }
    const dbFecha = parseStrictDBDate(fecha || getElSalvadorTodayYMD());
    if (!dbFecha) {
        return res.status(400).json({ message: 'Fecha inválida.' });
    }
    const cleanCheque = String(cheque_num).trim().slice(0, 20);
    const idempotencyKey = getIdempotencyKey(req);

    try {
        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'cheques_contado_generar',
                    userId: req.user?.id,
                    payload: { llave, estacionSol, cuenta_bancaria_id, id_empresa, numero_cuenta, cleanCheque }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            const externalDb = await getExternalDb();

            // Verificar en sistema externo si la solicitud ya tiene cheque emitido usando estacion_solicitud
            const [solRows] = await externalDb.query(
                'SELECT num_cheque FROM solicitud_chq_contado WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ? LIMIT 1',
                [llave, llave, estacionSol]
            );
            if (!solRows || solRows.length === 0) {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_generar');
                return { errorStatus: 404, errorBody: { message: 'Solicitud de contado no encontrada.' } };
            }
            if (solRows[0].num_cheque && String(solRows[0].num_cheque).trim() !== '') {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_generar');
                return { errorStatus: 409, errorBody: { message: `Esta solicitud ya tiene asignado el cheque #${String(solRows[0].num_cheque).trim()}.` } };
            }

            let empresaId = null;
            let cuentaBancariaId = null;

            if (cuenta_bancaria_id) {
                const [ctaRows] = await conn.query(
                    'SELECT id, empresa_id, numero FROM cuentas_bancarias WHERE id = ? AND activa = TRUE',
                    [cuenta_bancaria_id]
                );
                if (ctaRows.length === 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_generar');
                    return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                }
                cuentaBancariaId = ctaRows[0].id;
                empresaId = ctaRows[0].empresa_id;
            } else {
                const empCode = String(id_empresa || estacionSol).trim();
                const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [empCode]);
                if (empRows.length === 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_generar');
                    return { errorStatus: 400, errorBody: { message: 'Empresa no encontrada' } };
                }
                empresaId = empRows[0].id;

                const [cuentaRows] = await conn.query(
                    'SELECT id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ? AND activa = TRUE',
                    [empresaId, numero_cuenta]
                );
                if (cuentaRows.length === 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_generar');
                    return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                }
                cuentaBancariaId = cuentaRows[0].id;
            }

            const lockCheck = await isDateInClosedPeriod(conn, cuentaBancariaId, [dbFecha]);
            if (lockCheck.closed) {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_generar');
                return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}.` } };
            }

            const [dupRows] = await conn.query(
                'SELECT id FROM cheques WHERE cuenta_bancaria_id = ? AND cheque = ? AND deleted_at IS NULL AND cheque_anulado = FALSE LIMIT 1 FOR UPDATE',
                [cuentaBancariaId, cleanCheque]
            );
            if (dupRows && dupRows.length > 0) {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_generar');
                return { errorStatus: 409, errorBody: { message: `El cheque #${cleanCheque} ya existe activo en esta cuenta.` } };
            }

            const nombreBeneficiario = a_nombre ? String(a_nombre).trim().slice(0, 150) : '';
            const cleanConcepto = String(concepto || 'PAGO A PROVEEDOR (CONTADO)').trim().toUpperCase().slice(0, 255) || 'PAGO A PROVEEDOR (CONTADO)';

            const tempLlave = `TMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
            const [insRes] = await conn.query(
                `INSERT INTO cheques
                    (empresa_id, cuenta_bancaria_id, llave, fecha, cheque, valor, a_nombre, concepto,
                     es_pago_contado, es_contabilizado, created_by, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 1)`,
                [empresaId, cuentaBancariaId, tempLlave, dbFecha, cleanCheque, valorNum, nombreBeneficiario, cleanConcepto, req.user?.id || null]
            );
            const llaveCheque = 'CHQ' + String(insRes.insertId).padStart(17, '0');
            const talonarioRes = await consumeTalonarioNumber(conn, {
                cuentaBancariaId,
                chequeNumero: cleanCheque,
                chequeraId: chequera_id || null
            });
            try {
                await conn.query('UPDATE cheques SET llave = ?, chequera_id = ? WHERE id = ?', [
                    llaveCheque,
                    talonarioRes.chequeraId || null,
                    insRes.insertId
                ]);
            } catch (updErr) {
                if (updErr && (updErr.code === 'ER_BAD_FIELD_ERROR' || updErr.errno === 1054)) {
                    await conn.query('UPDATE cheques SET llave = ? WHERE id = ?', [llaveCheque, insRes.insertId]);
                } else {
                    throw updErr;
                }
            }

            // Actualizar BD externa ANTES de hacer commit local; si falla, hace rollback automático del cheque local
            await externalDb.query(
                "UPDATE solicitud_chq_contado SET num_cheque = ?, llave_cheque = ? WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ?",
                [cleanCheque, llaveCheque, llave, llave, estacionSol]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId,
                entidad: 'cheques',
                entidadId: insRes.insertId,
                accion: 'CREATE_CONTADO',
                user: req.user,
                ipAddress: req.ip,
                after: {
                    id: insRes.insertId,
                    llave: llaveCheque,
                    cheque: cleanCheque,
                    valor: valorNum,
                    solicitud_llave: llave,
                    estacion_solicitud: estacionSol,
                    chequera_id: talonarioRes.chequeraId || null
                }
            });

            const body = {
                message: 'Cheque generado exitosamente',
                llaveCheque,
                id: insRes.insertId,
                chequera_id: talonarioRes.chequeraId || null,
                talonario_alerta: talonarioRes.talonarioAlerta || null
            };
            if (idempotencyKey) {
                await saveIdempotentResponse(conn, { key: idempotencyKey, scope: 'cheques_contado_generar', statusCode: 200, responseBody: body });
            }

            return { statusCode: 200, body, cuentaBancariaId, chequeId: insRes.insertId };
        });

        if (txResult.conflict) return res.status(409).json({ message: 'Solicitud duplicada en proceso.' });
        if (txResult.replayed) return res.status(txResult.statusCode).json(txResult.body);
        if (txResult.errorStatus) return res.status(txResult.errorStatus).json(txResult.errorBody);

        emitBankUpdate(req.io, 'cheques_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id: txResult.chequeId });
        emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id: txResult.chequeId });

        res.json(txResult.body);
    } catch (error) {
        sendSafeError(res, error, 'Error al generar cheque');
    }
});

// Marcar solicitud como ya emitida directamente asignando el número de cheque
router.post('/contado/marcar-emitido', authenticateToken, requirePermission(contadoPerms), async (req, res) => {
    try {
        const {
            llave,
            estacion_solicitud,
            id_empresa,
            cheque_num,
            cuenta_bancaria_id,
            registrar_en_bancos,
            a_nombre,
            chequera_id
        } = req.body || {};
        const estacionSol = String(estacion_solicitud || id_empresa || '').trim();
        if (!llave || !estacionSol || !cheque_num || !String(cheque_num).trim()) {
            return res.status(400).json({ message: 'Se requiere la llave de solicitud, estación y número de cheque' });
        }
        if (registrar_en_bancos && (!cuenta_bancaria_id || !String(cuenta_bancaria_id).trim())) {
            return res.status(400).json({ message: 'Debe seleccionar una cuenta bancaria para registrar el cheque en Bancos.' });
        }

        const cleanCheque = String(cheque_num).trim().slice(0, 20);
        const idempotencyKey = getIdempotencyKey(req);

        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'cheques_contado_marcar_emitido',
                    userId: req.user?.id,
                    payload: { llave, estacionSol, cleanCheque, cuenta_bancaria_id, registrar_en_bancos: Boolean(registrar_en_bancos) }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            const externalDb = await getExternalDb();

            const [solRows] = await externalDb.query(
                `SELECT a.*, COALESCE(b.nombre, '') AS proveedor_nombre
                 FROM solicitud_chq_contado a
                 LEFT JOIN proveedores b ON a.id_empresa = b.id_empresa AND a.cod_proveedor = b.codigo
                 WHERE (a.llave = ? OR TRIM(a.llave) = TRIM(?)) AND a.id_empresa = ?
                 LIMIT 1`,
                [llave, llave, estacionSol]
            );
            if (!solRows || solRows.length === 0) {
                await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_marcar_emitido');
                return { errorStatus: 404, errorBody: { message: 'Solicitud de contado no encontrada.' } };
            }
            const s = solRows[0];

            let llaveCheque = null;
            let cuentaIdUsed = null;
            let talonarioRes = { chequeraId: null, talonarioAlerta: null };

            if (registrar_en_bancos && cuenta_bancaria_id) {
                const [ctaRows] = await conn.query(
                    'SELECT id, empresa_id FROM cuentas_bancarias WHERE id = ? AND activa = TRUE',
                    [cuenta_bancaria_id]
                );
                if (!ctaRows || ctaRows.length === 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_marcar_emitido');
                    return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                }
                const cuentaId = ctaRows[0].id;
                const empresaId = ctaRows[0].empresa_id;

                const dbFecha = parseStrictDBDate(s.fecha) || getElSalvadorTodayYMD();
                const lockCheck = await isDateInClosedPeriod(conn, cuentaId, [dbFecha]);
                if (lockCheck.closed) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_marcar_emitido');
                    return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}.` } };
                }
                const [dupRows] = await conn.query(
                    'SELECT id FROM cheques WHERE cuenta_bancaria_id = ? AND cheque = ? AND deleted_at IS NULL AND cheque_anulado = FALSE LIMIT 1 FOR UPDATE',
                    [cuentaId, cleanCheque]
                );
                if (dupRows && dupRows.length > 0) {
                    await cleanupPendingIdempotency(conn, idempotencyKey, 'cheques_contado_marcar_emitido');
                    return { errorStatus: 409, errorBody: { message: `El cheque #${cleanCheque} ya existe activo en esta cuenta.` } };
                }

                const nombreProveedor = s.proveedor_nombre ? String(s.proveedor_nombre).trim() : '';
                const nombreManual = a_nombre ? String(a_nombre).trim() : '';
                const codProveedor = s.cod_proveedor ? String(s.cod_proveedor).trim() : '';
                const nombreBeneficiario = (nombreProveedor || nombreManual || codProveedor || '').slice(0, 150);

                const tempLlave = `TMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
                const [insRes] = await conn.query(
                    `INSERT INTO cheques
                        (empresa_id, cuenta_bancaria_id, llave, fecha, cheque, valor, a_nombre, concepto,
                         es_pago_contado, es_contabilizado, created_by, version)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 1)`,
                    [empresaId, cuentaId, tempLlave, dbFecha, cleanCheque, Number(s.monto) || 0, nombreBeneficiario, 'PAGO A PROVEEDOR (CONTADO)', req.user?.id || null]
                );
                llaveCheque = 'CHQ' + String(insRes.insertId).padStart(17, '0');
                talonarioRes = await consumeTalonarioNumber(conn, {
                    cuentaBancariaId: cuentaId,
                    chequeNumero: cleanCheque,
                    chequeraId: chequera_id || null
                });
                try {
                    await conn.query('UPDATE cheques SET llave = ?, chequera_id = ? WHERE id = ?', [
                        llaveCheque,
                        talonarioRes.chequeraId || null,
                        insRes.insertId
                    ]);
                } catch (updErr) {
                    if (updErr && (updErr.code === 'ER_BAD_FIELD_ERROR' || updErr.errno === 1054)) {
                        await conn.query('UPDATE cheques SET llave = ? WHERE id = ?', [llaveCheque, insRes.insertId]);
                    } else {
                        throw updErr;
                    }
                }
                cuentaIdUsed = cuentaId;

                await recordBankAudit(conn, {
                    cuentaBancariaId: cuentaId,
                    entidad: 'cheques',
                    entidadId: insRes.insertId,
                    accion: 'MARCAR_EMITIDO_CONTADO',
                    user: req.user,
                    ipAddress: req.ip,
                    after: {
                        id: insRes.insertId,
                        llave: llaveCheque,
                        cheque: cleanCheque,
                        a_nombre: nombreBeneficiario,
                        solicitud_llave: llave,
                        estacion_solicitud: estacionSol,
                        chequera_id: talonarioRes.chequeraId || null
                    }
                });
            }

            await externalDb.query(
                "UPDATE solicitud_chq_contado SET num_cheque = ?, llave_cheque = COALESCE(?, llave_cheque) WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ?",
                [cleanCheque, llaveCheque, llave, llave, estacionSol]
            );

            const body = {
                success: true,
                message: `Solicitud marcada exitosamente con el cheque #${cleanCheque}`,
                llaveCheque,
                chequera_id: talonarioRes.chequeraId || null,
                talonario_alerta: talonarioRes.talonarioAlerta || null
            };
            if (idempotencyKey) {
                await saveIdempotentResponse(conn, { key: idempotencyKey, scope: 'cheques_contado_marcar_emitido', statusCode: 200, responseBody: body });
            }

            return { statusCode: 200, cuentaIdUsed, body };
        });

        if (txResult.conflict) {
            return res.status(409).json({ message: 'Solicitud duplicada en proceso.' });
        }
        if (txResult.replayed) {
            return res.status(txResult.statusCode).json(txResult.body);
        }
        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        if (txResult.cuentaIdUsed) {
            emitBankUpdate(req.io, 'cheques_updated', { cuenta_bancaria_id: txResult.cuentaIdUsed });
            emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: txResult.cuentaIdUsed });
        }

        res.json(txResult.body);
    } catch (error) {
        sendSafeError(res, error, 'Error al marcar cheque como emitido');
    }
});

// Desvincular cheque y devolver solicitud a estado pendiente
router.post('/contado/desvincular', authenticateToken, requirePermission(contadoPerms), async (req, res) => {
    try {
        const { llave, id_empresa } = req.body;
        if (!llave || !id_empresa) {
            return res.status(400).json({ message: 'Se requiere la llave de solicitud y estación' });
        }

        const externalDb = await getExternalDb();
        await externalDb.query(
            "UPDATE solicitud_chq_contado SET num_cheque = NULL, llave_cheque = NULL WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ?",
            [llave, llave, id_empresa]
        );

        res.json({ success: true, message: 'Solicitud devuelta a estado pendiente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al desvincular cheque');
    }
});

// Sincronizar masivamente solicitudes pendientes con cheques ya emitidos en el libro de bancos
router.post('/contado/sincronizar-emitidos', authenticateToken, requirePermission(contadoPerms), async (req, res) => {
    try {
        const { estacion } = req.body;
        if (!estacion) return res.status(400).json({ message: 'Falta parametro estacion' });

        const externalDb = await getExternalDb();
        const db = getDb();

        const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [estacion]);
        if (empRows.length === 0) {
            return res.json({ syncedCount: 0, message: 'No se encontró la empresa localmente' });
        }
        const empresaId = empRows[0].id;

        const [chequesLocal] = await db.query(`
            SELECT ch.id, ch.llave, ch.cheque, ch.fecha, ch.valor, ch.a_nombre
            FROM cheques ch
            WHERE ch.empresa_id = ? AND ch.deleted_at IS NULL AND ch.cheque_anulado = FALSE
        `, [empresaId]);

        const [solicitudes] = await externalDb.query(`
            SELECT a.llave, a.fecha, a.cod_proveedor, COALESCE(b.nombre,'') as nombre,
                   a.monto, a.num_cheque, a.llave_cheque
            FROM solicitud_chq_contado a
            LEFT JOIN proveedores b ON a.id_empresa = b.id_empresa AND a.cod_proveedor = b.codigo
            WHERE a.id_empresa = ? AND TRIM(COALESCE(a.num_cheque,'')) = ''
        `, [estacion]);

        let syncedCount = 0;
        for (const sol of solicitudes) {
            const rMonto = Number(sol.monto || 0);
            const rFecha = sol.fecha ? toDBDate(sol.fecha) : '';
            const rNombre = (sol.nombre || '').trim().toLowerCase();

            const match = chequesLocal.find(c => {
                const cMonto = Number(c.valor || 0);
                if (Math.abs(cMonto - rMonto) > 0.01) return false;
                const cFecha = c.fecha ? toDBDate(c.fecha) : '';
                const cNombre = (c.a_nombre || '').trim().toLowerCase();

                if (rNombre && cNombre && (rNombre.includes(cNombre) || cNombre.includes(rNombre))) return true;
                if (rFecha && cFecha && rFecha === cFecha) return true;
                return false;
            });

            if (match && match.cheque) {
                await externalDb.query(
                    "UPDATE solicitud_chq_contado SET num_cheque = ?, llave_cheque = ? WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ?",
                    [String(match.cheque).trim(), match.llave, sol.llave, sol.llave, estacion]
                );
                syncedCount++;
            }
        }

        res.json({
            success: true,
            syncedCount,
            message: syncedCount > 0
                ? `Se detectaron y sincronizaron ${syncedCount} cheques ya emitidos.`
                : 'No se encontraron más cheques coincidentes pendientes de vincular.'
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al sincronizar cheques emitidos');
    }
});

module.exports = router;
