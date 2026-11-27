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

const toDisplayDate = (dateVal) => {
    const formatted = formatDisplayDMY(dateVal);
    return formatted || null;
};

const toDBDate = (dateStr) => formatDateYMD(dateStr);

const getIdempotencyKey = (req) => {
    const hdr = req.headers?.['x-idempotency-key'] || req.headers?.['idempotency-key'];
    return typeof hdr === 'string' && hdr.trim() ? hdr.trim().slice(0, 128) : null;
};

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
                   ch.fecha, ch.cheque_anulado, ch.cheque, ch.valor, ch.a_nombre, ch.fecha_aplicado, ch.concepto,
                   ch.es_reservado, ch.es_pago_contado, ch.fue_noemitido, ch.num_partida,
                   IF(ch.es_contabilizado, 'S', 'N') as es_contabilizado
            FROM cheques ch
            LEFT JOIN empresas e ON ch.empresa_id = e.id
            LEFT JOIN cuentas_bancarias cb ON ch.cuenta_bancaria_id = cb.id
            LEFT JOIN bancos b ON cb.banco_id = b.id
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
                   ch.fecha, ch.cheque_anulado, ch.cheque, ch.valor, ch.a_nombre, ch.fecha_aplicado, ch.concepto,
                   ch.es_reservado, ch.es_pago_contado, ch.fue_noemitido, ch.num_partida,
                   IF(ch.es_contabilizado, 'S', 'N') as es_contabilizado
            FROM cheques ch
            LEFT JOIN empresas e ON ch.empresa_id = e.id
            LEFT JOIN cuentas_bancarias cb ON ch.cuenta_bancaria_id = cb.id
            LEFT JOIN bancos b ON cb.banco_id = b.id
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
            'LEFT JOIN bancos b ON cb.banco_id = b.id ';

        const [[countRow]] = await db.query(`SELECT COUNT(*) as total ${baseJoins} ${whereSql}`, params);
        const total = Number(countRow?.total || 0);

        const selectSql =
            'SELECT ch.id, ch.llave, ch.cuenta_bancaria_id, e.codigo as id_empresa, cb.numero as numero_cuenta, cb.nombre as cuenta_nombre, ' +
            'b.id as banco_id, ch.fecha, ch.cheque_anulado, ch.cheque, ch.valor, ch.valor_original, ch.a_nombre, ch.fecha_aplicado, ch.concepto, ' +
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

router.post('/', authenticateToken, requirePermission(chequeManagePerms), async (req, res) => {
    const {
        id_empresa, numero_cuenta, cuenta_bancaria_id, fecha, fecha_aplicado, cheque, valor,
        a_nombre, concepto,
        cheque_anulado, es_reservado, es_pago_contado, fue_noemitido, num_partida
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
                if (ctaRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                cuentaBancariaId = ctaRows[0].id;
                empresaId = ctaRows[0].empresa_id;
                numCuentaFinal = ctaRows[0].numero;
            } else {
                const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
                if (empRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Empresa no encontrada' } };
                empresaId = empRows[0].id;

                const [cuentaRows] = await conn.query(
                    'SELECT id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ? AND activa = TRUE',
                    [empresaId, numero_cuenta]
                );
                if (cuentaRows.length === 0) {
                    return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                }
                cuentaBancariaId = cuentaRows[0].id;
            }

            const lockCheck = await isDateInClosedPeriod(conn, cuentaBancariaId, [dbFecha, dbFechaAplicado]);
            if (lockCheck.closed) {
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
            await conn.query('UPDATE cheques SET llave = ? WHERE id = ?', [nuevaLlave, result.insertId]);

            await recordBankAudit(conn, {
                cuentaBancariaId,
                entidad: 'cheques',
                entidadId: result.insertId,
                accion: 'CREATE',
                user: req.user,
                ipAddress: req.ip,
                after: { id: result.insertId, llave: nuevaLlave, cheque: cleanCheque, fecha: dbFecha, valor: valorNum, a_nombre: cleanNombre }
            });

            const body = { message: 'Cheque registrado exitosamente', llave: nuevaLlave, id: result.insertId };
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

router.put('/:id', authenticateToken, requirePermission(chequeManagePerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de cheque inválido.' });
    }

    const {
        id_empresa, numero_cuenta, cuenta_bancaria_id, fecha, fecha_aplicado, cheque, valor,
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

            if (cuenta_bancaria_id) {
                const [ctaRows] = await conn.query('SELECT id, empresa_id FROM cuentas_bancarias WHERE id = ? AND activa = TRUE', [cuenta_bancaria_id]);
                if (ctaRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                cuentaBancariaId = ctaRows[0].id;
                empresaId = ctaRows[0].empresa_id;
            } else if (id_empresa && numero_cuenta) {
                const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
                if (empRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Empresa no encontrada' } };
                empresaId = empRows[0].id;

                const [cuentaRows] = await conn.query(
                    'SELECT id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ? AND activa = TRUE',
                    [empresaId, numero_cuenta]
                );
                if (cuentaRows.length === 0) {
                    return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                }
                cuentaBancariaId = cuentaRows[0].id;
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
    const { llave, id_empresa, numero_cuenta, cheque_num, fecha, valor, a_nombre, concepto } = req.body || {};
    if (!llave || !id_empresa || !numero_cuenta || !cheque_num || !String(cheque_num).trim()) {
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
        const externalDb = await getExternalDb();

        // Verificar en sistema externo si la solicitud ya tiene cheque emitido
        const [solRows] = await externalDb.query(
            'SELECT num_cheque FROM solicitud_chq_contado WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ? LIMIT 1',
            [llave, llave, id_empresa]
        );
        if (!solRows || solRows.length === 0) {
            return res.status(404).json({ message: 'Solicitud de contado no encontrada.' });
        }
        if (solRows[0].num_cheque && String(solRows[0].num_cheque).trim() !== '') {
            return res.status(409).json({ message: `Esta solicitud ya tiene asignado el cheque #${String(solRows[0].num_cheque).trim()}.` });
        }

        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'cheques_contado_generar',
                    userId: req.user?.id,
                    payload: { llave, id_empresa, numero_cuenta, cleanCheque }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
            if (empRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Empresa no encontrada' } };
            const empresaId = empRows[0].id;

            const [cuentaRows] = await conn.query(
                'SELECT id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ? AND activa = TRUE',
                [empresaId, numero_cuenta]
            );
            if (cuentaRows.length === 0) {
                return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
            }
            const cuentaBancariaId = cuentaRows[0].id;

            const lockCheck = await isDateInClosedPeriod(conn, cuentaBancariaId, [dbFecha]);
            if (lockCheck.closed) {
                return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}.` } };
            }

            const [dupRows] = await conn.query(
                'SELECT id FROM cheques WHERE cuenta_bancaria_id = ? AND cheque = ? AND deleted_at IS NULL AND cheque_anulado = FALSE LIMIT 1 FOR UPDATE',
                [cuentaBancariaId, cleanCheque]
            );
            if (dupRows && dupRows.length > 0) {
                return { errorStatus: 409, errorBody: { message: `El cheque #${cleanCheque} ya existe activo en esta cuenta.` } };
            }

            const tempLlave = `TMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
            const [insRes] = await conn.query(
                `INSERT INTO cheques
                    (empresa_id, cuenta_bancaria_id, llave, fecha, cheque, valor, a_nombre, concepto,
                     es_pago_contado, es_contabilizado, created_by, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 1)`,
                [empresaId, cuentaBancariaId, tempLlave, dbFecha, cleanCheque, valorNum, a_nombre || '', (concepto || 'PAGO A PROVEEDOR (CONTADO)').toUpperCase().slice(0, 255), req.user?.id || null]
            );
            const llaveCheque = 'CHQ' + String(insRes.insertId).padStart(17, '0');
            await conn.query('UPDATE cheques SET llave = ? WHERE id = ?', [llaveCheque, insRes.insertId]);

            // Actualizar BD externa ANTES de hacer commit local; si falla, hace rollback automático del cheque local
            await externalDb.query(
                "UPDATE solicitud_chq_contado SET num_cheque = ?, llave_cheque = ? WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ?",
                [cleanCheque, llaveCheque, llave, llave, id_empresa]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId,
                entidad: 'cheques',
                entidadId: insRes.insertId,
                accion: 'CREATE_CONTADO',
                user: req.user,
                ipAddress: req.ip,
                after: { id: insRes.insertId, llave: llaveCheque, cheque: cleanCheque, valor: valorNum, solicitud_llave: llave }
            });

            const body = { message: 'Cheque generado exitosamente', llaveCheque };
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
        const { llave, id_empresa, cheque_num, cuenta_bancaria_id, registrar_en_bancos } = req.body || {};
        if (!llave || !id_empresa || !cheque_num || !String(cheque_num).trim()) {
            return res.status(400).json({ message: 'Se requiere la llave de solicitud, estación y número de cheque' });
        }

        const cleanCheque = String(cheque_num).trim().slice(0, 20);
        const externalDb = await getExternalDb();

        const txResult = await withTransaction(async (conn) => {
            let llaveCheque = null;
            let cuentaIdUsed = null;

            if (registrar_en_bancos && cuenta_bancaria_id) {
                const [solRows] = await externalDb.query(
                    "SELECT * FROM solicitud_chq_contado WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ? LIMIT 1",
                    [llave, llave, id_empresa]
                );
                if (solRows.length > 0) {
                    const s = solRows[0];
                    const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
                    const empresaId = empRows[0]?.id;
                    if (empresaId) {
                        const dbFecha = parseStrictDBDate(s.fecha) || getElSalvadorTodayYMD();
                        const lockCheck = await isDateInClosedPeriod(conn, cuenta_bancaria_id, [dbFecha]);
                        if (lockCheck.closed) {
                            return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}.` } };
                        }
                        const [dupRows] = await conn.query(
                            'SELECT id FROM cheques WHERE cuenta_bancaria_id = ? AND cheque = ? AND deleted_at IS NULL AND cheque_anulado = FALSE LIMIT 1 FOR UPDATE',
                            [cuenta_bancaria_id, cleanCheque]
                        );
                        if (dupRows && dupRows.length > 0) {
                            return { errorStatus: 409, errorBody: { message: `El cheque #${cleanCheque} ya existe activo en esta cuenta.` } };
                        }

                        const tempLlave = `TMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
                        const [insRes] = await conn.query(
                            `INSERT INTO cheques
                                (empresa_id, cuenta_bancaria_id, llave, fecha, cheque, valor, a_nombre, concepto,
                                 es_pago_contado, es_contabilizado, created_by, version)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 1)`,
                            [empresaId, cuenta_bancaria_id, tempLlave, dbFecha, cleanCheque, Number(s.monto) || 0, s.cod_proveedor || '', 'PAGO A PROVEEDOR (CONTADO)', req.user?.id || null]
                        );
                        llaveCheque = 'CHQ' + String(insRes.insertId).padStart(17, '0');
                        await conn.query('UPDATE cheques SET llave = ? WHERE id = ?', [llaveCheque, insRes.insertId]);
                        cuentaIdUsed = cuenta_bancaria_id;

                        await recordBankAudit(conn, {
                            cuentaBancariaId: cuenta_bancaria_id,
                            entidad: 'cheques',
                            entidadId: insRes.insertId,
                            accion: 'MARCAR_EMITIDO_CONTADO',
                            user: req.user,
                            ipAddress: req.ip,
                            after: { id: insRes.insertId, llave: llaveCheque, cheque: cleanCheque, solicitud_llave: llave }
                        });
                    }
                }
            }

            await externalDb.query(
                "UPDATE solicitud_chq_contado SET num_cheque = ?, llave_cheque = COALESCE(?, llave_cheque) WHERE (llave = ? OR TRIM(llave) = TRIM(?)) AND id_empresa = ?",
                [cleanCheque, llaveCheque, llave, llave, id_empresa]
            );

            return { cuentaIdUsed };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        if (txResult.cuentaIdUsed) {
            emitBankUpdate(req.io, 'cheques_updated', { cuenta_bancaria_id: txResult.cuentaIdUsed });
            emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: txResult.cuentaIdUsed });
        }

        res.json({ success: true, message: `Solicitud marcada exitosamente con el cheque #${cleanCheque}` });
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
