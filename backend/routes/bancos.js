const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { getDb, withTransaction } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { formatDateYMD, formatDisplayDMY, getElSalvadorTodayYMD } = require('../utils/dateSv');
const {
    parseStrictPositiveAmount,
    parseStrictFiniteAmount,
    parseStrictDBDate,
    normalizeMovementDirection,
    computeMovementFingerprint,
    isDateInClosedPeriod,
    recordBankAudit,
    beginIdempotentRequest,
    saveIdempotentResponse,
    emitBankUpdate
} = require('../services/bancosIntegrityService');

const toDisplayDate = (dateVal) => {
    const formatted = formatDisplayDMY(dateVal);
    return formatted || null;
};

const toDBDate = (dateStr) => formatDateYMD(dateStr);

const getIdempotencyKey = (req) => {
    const hdr = req.headers?.['x-idempotency-key'] || req.headers?.['idempotency-key'];
    return typeof hdr === 'string' && hdr.trim() ? hdr.trim().slice(0, 128) : null;
};

const bancosViewPerms = [
    '/dashboard/bancos/cuentas',
    '/dashboard/bancos/movimientos',
    '/dashboard/bancos/conciliacion',
    '/dashboard/bancos/cheques',
    '/dashboard/bancos/check-designer',
    '/dashboard/bancos/reportes/saldos-bancos',
    '/dashboard/bancos/reportes/saldos-chequera',
    '/dashboard/operaciones/pedidos',
    '/dashboard/rrhh/planillas',
    'manage_cuentas',
    'manage_movimientos',
    'manage_conciliacion_bancaria',
    'view_conciliacion_bancaria',
    'manage_cheques',
    'manage_pedidos',
    'view_rrhh_planillas'
];

const cuentasManagePerms = [
    '/dashboard/bancos/cuentas',
    'manage_cuentas'
];

const movimientosViewPerms = [
    '/dashboard/bancos/movimientos',
    '/dashboard/bancos/conciliacion',
    '/dashboard/bancos/reportes/movimientos-fecha',
    'manage_movimientos',
    'manage_conciliacion_bancaria',
    'view_conciliacion_bancaria'
];

const movimientosManagePerms = [
    '/dashboard/bancos/movimientos',
    'manage_movimientos'
];

// --- Cuentas Bancarias ---
router.get('/catalogos', authenticateToken, requirePermission(bancosViewPerms), async (req, res) => {
    const { id_empresa } = req.query;
    try {
        const db = getDb();
        const [empresas] = await db.query('SELECT codigo as id, nombre FROM empresas ORDER BY nombre');

        let bancos = [];
        let tipos = [];

        if (id_empresa) {
            const [empresaRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
            if (empresaRows.length > 0) {
                const empresaId = empresaRows[0].id;
                [bancos] = await db.query('SELECT codigo as id, descripcion FROM bancos WHERE empresa_id = ? ORDER BY descripcion', [empresaId]);
                [tipos] = await db.query('SELECT codigo as id, descripcion FROM tipos_cuenta_bancaria WHERE empresa_id = ? ORDER BY descripcion', [empresaId]);
            }
        }

        res.json({ empresas, bancos, tipos });
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar catálogos');
    }
});

// --- Gestión de Entidades Bancarias (Bancos) ---
router.get('/entidades-banco', authenticateToken, requirePermission(bancosViewPerms), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query(`
            SELECT 
                b.codigo, 
                b.descripcion, 
                COUNT(DISTINCT b.empresa_id) as empresas_count,
                GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre SEPARATOR ', ') as empresas_nombres
            FROM bancos b
            JOIN empresas e ON b.empresa_id = e.id
            GROUP BY b.codigo, b.descripcion
            ORDER BY b.descripcion ASC
        `);

        const [maxRow] = await db.query(`
            SELECT MAX(CAST(codigo AS UNSIGNED)) as max_cod 
            FROM bancos 
            WHERE codigo REGEXP '^[0-9]+$'
        `);
        const nextNum = (maxRow[0]?.max_cod || 0) + 1;
        const nextCodigo = String(nextNum).padStart(2, '0');

        res.json({
            bancos: rows,
            nextCodigo
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener lista de bancos');
    }
});

router.post('/entidades-banco', authenticateToken, requirePermission(cuentasManagePerms), async (req, res) => {
    const { descripcion, codigo, id_empresa, todas_empresas = true } = req.body;
    try {
        if (!descripcion || !descripcion.trim()) {
            return res.status(400).json({ message: 'El nombre o descripción del banco es requerido' });
        }

        const db = getDb();
        const cleanDesc = descripcion.trim().toUpperCase();

        let bankCode = (codigo || '').trim();
        if (!bankCode) {
            const [maxRow] = await db.query(`
                SELECT MAX(CAST(codigo AS UNSIGNED)) as max_cod 
                FROM bancos 
                WHERE codigo REGEXP '^[0-9]+$'
            `);
            const nextNum = (maxRow[0]?.max_cod || 0) + 1;
            bankCode = String(nextNum).padStart(2, '0');
        } else if (/^\d+$/.test(bankCode) && bankCode.length === 1) {
            bankCode = bankCode.padStart(2, '0');
        }

        let targetEmpresas = [];
        if (todas_empresas) {
            const [allEmp] = await db.query('SELECT id, codigo, nombre FROM empresas ORDER BY id');
            targetEmpresas = allEmp;
        } else {
            if (!id_empresa) {
                return res.status(400).json({ message: 'Debe especificar una empresa o seleccionar todas las empresas' });
            }
            const [empRows] = await db.query('SELECT id, codigo, nombre FROM empresas WHERE codigo = ? OR id = ?', [id_empresa, id_empresa]);
            if (empRows.length === 0) {
                return res.status(400).json({ message: 'Empresa no encontrada' });
            }
            targetEmpresas = empRows;
        }

        let insertedCount = 0;
        for (const emp of targetEmpresas) {
            const [existingCode] = await db.query('SELECT id FROM bancos WHERE empresa_id = ? AND codigo = ?', [emp.id, bankCode]);
            if (existingCode.length > 0) continue;
            const [existingDesc] = await db.query('SELECT id FROM bancos WHERE empresa_id = ? AND UPPER(descripcion) = ?', [emp.id, cleanDesc]);
            if (existingDesc.length > 0) continue;

            await db.query(
                'INSERT INTO bancos (empresa_id, codigo, descripcion) VALUES (?, ?, ?)',
                [emp.id, bankCode, cleanDesc]
            );
            insertedCount++;
        }

        if (insertedCount === 0) {
            return res.status(400).json({ message: `El banco '${cleanDesc}' o código '${bankCode}' ya se encuentra registrado para las empresas seleccionadas.` });
        }

        res.status(201).json({
            message: `Banco '${cleanDesc}' registrado exitosamente en ${insertedCount} empresa(s)`,
            codigo: bankCode,
            descripcion: cleanDesc,
            insertedCount
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al registrar el banco');
    }
});

router.get('/cuentas', authenticateToken, requirePermission(bancosViewPerms), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query(
            'SELECT c.id as corr, e.codigo as id_empresa, b.codigo as cod_banco, t.codigo as cod_tipo, ' +
            'c.numero, c.nombre, c.cod_cta, IF(c.activa, "S", "N") as activa, c.orden, ' +
            'c.saldo_inicial, c.fecha_saldo_inicial, ' +
            'e.nombre as empresa_nombre, b.descripcion as banco_nombre, t.descripcion as tipo_nombre ' +
            'FROM cuentas_bancarias c ' +
            'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
            'LEFT JOIN bancos b ON c.banco_id = b.id ' +
            'LEFT JOIN tipos_cuenta_bancaria t ON c.tipo_cuenta_id = t.id ' +
            'ORDER BY c.orden ASC, c.nombre ASC'
        );
        res.json(rows.map(r => ({
            ...r,
            saldo_inicial: Number(r.saldo_inicial || 0),
            fecha_saldo_inicial: r.fecha_saldo_inicial ? toDBDate(r.fecha_saldo_inicial) : null
        })));
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar cuentas');
    }
});

router.post('/cuentas', authenticateToken, requirePermission(cuentasManagePerms), async (req, res) => {
    const { id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, orden, saldo_inicial, fecha_saldo_inicial } = req.body || {};
    const cleanNum = String(numero || '').trim();
    const cleanNombre = String(nombre || '').trim();
    if (!id_empresa || !cleanNum || !cleanNombre) {
        return res.status(400).json({ message: 'Empresa, número de cuenta y nombre son requeridos.' });
    }

    const saldoIniNum = (saldo_inicial === undefined || saldo_inicial === null || saldo_inicial === '')
        ? 0
        : parseStrictFiniteAmount(saldo_inicial);
    if (saldoIniNum === null) {
        return res.status(400).json({ message: 'El saldo inicial debe ser un valor numérico válido.' });
    }
    const fechaIniDb = fecha_saldo_inicial ? parseStrictDBDate(fecha_saldo_inicial) : null;
    if (fecha_saldo_inicial && !fechaIniDb) {
        return res.status(400).json({ message: 'La fecha de saldo inicial no es válida.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
            if (empRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Empresa no encontrada' } };
            const empresaId = empRows[0].id;

            const [banRows] = await conn.query('SELECT id FROM bancos WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_banco]);
            if (banRows.length === 0) {
                return { errorStatus: 400, errorBody: { message: 'Banco no válido o no registrado para esta empresa.' } };
            }
            const bancoId = banRows[0].id;

            const [tipRows] = await conn.query('SELECT id FROM tipos_cuenta_bancaria WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_tipo]);
            if (tipRows.length === 0) {
                return { errorStatus: 400, errorBody: { message: 'Tipo de cuenta bancaria no válido.' } };
            }
            const tipoCuentaId = tipRows[0].id;

            const [result] = await conn.query(
                'INSERT INTO cuentas_bancarias (empresa_id, numero, nombre, banco_id, tipo_cuenta_id, cod_cta, activa, orden, saldo_inicial, fecha_saldo_inicial) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)',
                [empresaId, cleanNum, cleanNombre, bancoId, tipoCuentaId, cod_cta || null, Number(orden) || 0, saldoIniNum, fechaIniDb]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: result.insertId,
                entidad: 'cuentas_bancarias',
                entidadId: result.insertId,
                accion: 'CREATE',
                user: req.user,
                ipAddress: req.ip,
                after: { empresa_id: empresaId, numero: cleanNum, nombre: cleanNombre, saldo_inicial: saldoIniNum, fecha_saldo_inicial: fechaIniDb }
            });

            return { id: result.insertId };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'cuentas_updated', { cuenta_bancaria_id: txResult.id });
        res.status(201).json({ message: 'Cuenta creada exitosamente', id: txResult.id });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Ya existe una cuenta con ese número para esta empresa.' });
        }
        sendSafeError(res, error, 'Error al crear cuenta');
    }
});

router.put('/cuentas/:id', authenticateToken, requirePermission(cuentasManagePerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de cuenta inválido.' });
    }

    const { id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, activa, orden, saldo_inicial, fecha_saldo_inicial } = req.body || {};
    const cleanNum = String(numero || '').trim();
    const cleanNombre = String(nombre || '').trim();
    if (!id_empresa || !cleanNum || !cleanNombre) {
        return res.status(400).json({ message: 'Empresa, número de cuenta y nombre son requeridos.' });
    }

    const saldoIniNum = (saldo_inicial === undefined || saldo_inicial === null || saldo_inicial === '')
        ? undefined
        : parseStrictFiniteAmount(saldo_inicial);
    if (saldo_inicial !== undefined && saldo_inicial !== null && saldo_inicial !== '' && saldoIniNum === null) {
        return res.status(400).json({ message: 'El saldo inicial debe ser un valor numérico válido.' });
    }
    const fechaIniDb = fecha_saldo_inicial ? parseStrictDBDate(fecha_saldo_inicial) : null;
    if (fecha_saldo_inicial && !fechaIniDb) {
        return res.status(400).json({ message: 'La fecha de saldo inicial no es válida.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[existing]] = await conn.query('SELECT * FROM cuentas_bancarias WHERE id = ? FOR UPDATE', [id]);
            if (!existing) {
                return { errorStatus: 404, errorBody: { message: 'Cuenta bancaria no encontrada.' } };
            }

            const [empRows] = await conn.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
            if (empRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Empresa no encontrada' } };
            const empresaId = empRows[0].id;

            if (Number(existing.empresa_id) !== Number(empresaId)) {
                const [[movCount]] = await conn.query(
                    'SELECT COUNT(*) AS cnt FROM movimientos_bancarios WHERE cuenta_bancaria_id = ? AND deleted_at IS NULL',
                    [id]
                );
                const [[chkCount]] = await conn.query(
                    'SELECT COUNT(*) AS cnt FROM cheques WHERE cuenta_bancaria_id = ? AND deleted_at IS NULL',
                    [id]
                );
                if (Number(movCount?.cnt || 0) > 0 || Number(chkCount?.cnt || 0) > 0) {
                    return { errorStatus: 409, errorBody: { message: 'No se puede cambiar la empresa de una cuenta que ya tiene movimientos o cheques registrados.' } };
                }
            }

            const [banRows] = await conn.query('SELECT id FROM bancos WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_banco]);
            if (banRows.length === 0) {
                return { errorStatus: 400, errorBody: { message: 'Banco no válido o no registrado para esta empresa.' } };
            }
            const bancoId = banRows[0].id;

            const [tipRows] = await conn.query('SELECT id FROM tipos_cuenta_bancaria WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_tipo]);
            if (tipRows.length === 0) {
                return { errorStatus: 400, errorBody: { message: 'Tipo de cuenta bancaria no válido.' } };
            }
            const tipoCuentaId = tipRows[0].id;

            const activaBool = activa === 'S' || activa === true || activa === 1 ? 1 : 0;
            const nextSaldoIni = saldoIniNum !== undefined ? saldoIniNum : Number(existing.saldo_inicial || 0);
            const nextFechaIni = fecha_saldo_inicial !== undefined ? fechaIniDb : (existing.fecha_saldo_inicial ? toDBDate(existing.fecha_saldo_inicial) : null);

            await conn.query(
                'UPDATE cuentas_bancarias SET empresa_id = ?, numero = ?, nombre = ?, banco_id = ?, tipo_cuenta_id = ?, cod_cta = ?, activa = ?, orden = ?, saldo_inicial = ?, fecha_saldo_inicial = ? WHERE id = ?',
                [empresaId, cleanNum, cleanNombre, bancoId, tipoCuentaId, cod_cta || null, activaBool, Number(orden) || 0, nextSaldoIni, nextFechaIni, id]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: id,
                entidad: 'cuentas_bancarias',
                entidadId: id,
                accion: 'UPDATE',
                user: req.user,
                ipAddress: req.ip,
                before: { numero: existing.numero, nombre: existing.nombre, activa: existing.activa, saldo_inicial: Number(existing.saldo_inicial || 0) },
                after: { numero: cleanNum, nombre: cleanNombre, activa: activaBool, saldo_inicial: nextSaldoIni, fecha_saldo_inicial: nextFechaIni }
            });

            return { ok: true };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'cuentas_updated', { cuenta_bancaria_id: id });
        res.json({ message: 'Cuenta actualizada exitosamente' });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Ya existe una cuenta con ese número para esta empresa.' });
        }
        sendSafeError(res, error, 'Error al actualizar cuenta');
    }
});

router.delete('/cuentas/:id', authenticateToken, requirePermission(cuentasManagePerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de cuenta inválido.' });
    }
    try {
        await withTransaction(async (conn) => {
            const [[existing]] = await conn.query('SELECT id, activa, numero, nombre FROM cuentas_bancarias WHERE id = ? FOR UPDATE', [id]);
            if (!existing) return;
            await conn.query('UPDATE cuentas_bancarias SET activa = FALSE WHERE id = ?', [id]);
            await recordBankAudit(conn, {
                cuentaBancariaId: id,
                entidad: 'cuentas_bancarias',
                entidadId: id,
                accion: 'DEACTIVATE',
                user: req.user,
                ipAddress: req.ip,
                before: { activa: existing.activa },
                after: { activa: 0 }
            });
        });
        emitBankUpdate(req.io, 'cuentas_updated', { cuenta_bancaria_id: id });
        res.json({ message: 'Cuenta desactivada exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al desactivar cuenta');
    }
});

// --- Movimientos Bancarios ---
router.get('/movimientos/catalogos', authenticateToken, requirePermission(movimientosViewPerms), async (req, res) => {
    const { id_empresa } = req.query;
    try {
        const db = getDb();
        const [empresas] = await db.query('SELECT codigo as id, nombre FROM empresas ORDER BY nombre');

        let cuentas = [];
        let remesas = [];

        if (id_empresa) {
            const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
            if (empRows.length > 0) {
                const empresaId = empRows[0].id;
                [cuentas] = await db.query(
                    'SELECT c.id as corr, e.codigo as id_empresa, c.numero, c.nombre, ' +
                    'e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
                    'FROM cuentas_bancarias c ' +
                    'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
                    'LEFT JOIN bancos b ON c.banco_id = b.id ' +
                    'WHERE c.activa = TRUE AND c.empresa_id = ? ' +
                    'ORDER BY b.descripcion ASC, c.numero ASC',
                    [empresaId]
                );
                [remesas] = await db.query('SELECT codigo as id, descripcion FROM tipos_remesas WHERE empresa_id = ? ORDER BY id', [empresaId]);
            }
        } else {
            [cuentas] = await db.query(
                'SELECT c.id as corr, e.codigo as id_empresa, c.numero, c.nombre, ' +
                'e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
                'FROM cuentas_bancarias c ' +
                'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
                'LEFT JOIN bancos b ON c.banco_id = b.id ' +
                'WHERE c.activa = TRUE ' +
                'ORDER BY b.descripcion ASC, c.numero ASC'
            );
        }

        res.json({ cuentas, remesas, empresas });
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar catálogos de movimientos');
    }
});

router.get('/movimientos', authenticateToken, requirePermission(movimientosViewPerms), async (req, res) => {
    const { id_empresa, numero_cuenta, cuenta_bancaria_id, desde, hasta, limit, page } = req.query;
    try {
        const db = getDb();
        let whereSql = 'WHERE m.deleted_at IS NULL ';
        const params = [];

        if (id_empresa) {
            whereSql += ' AND e.codigo = ?';
            params.push(id_empresa);
        }
        if (cuenta_bancaria_id) {
            whereSql += ' AND m.cuenta_bancaria_id = ?';
            params.push(parseInt(cuenta_bancaria_id, 10));
        } else if (numero_cuenta) {
            whereSql += ' AND cb.numero = ?';
            params.push(numero_cuenta);
        }
        if (desde && hasta) {
            whereSql += ' AND m.fecha BETWEEN ? AND ?';
            params.push(desde, hasta);
        }

        const safeLimit = Math.min(2000, Math.max(1, parseInt(limit, 10) || 1000));
        const safePage = Math.max(1, parseInt(page, 10) || 1);
        const offset = (safePage - 1) * safeLimit;

        const baseJoins =
            'FROM movimientos_bancarios m ' +
            'LEFT JOIN empresas e ON m.empresa_id = e.id ' +
            'LEFT JOIN cuentas_bancarias cb ON m.cuenta_bancaria_id = cb.id ' +
            'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
            'LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id ';

        const [[countRow]] = await db.query(`SELECT COUNT(*) as total ${baseJoins} ${whereSql}`, params);
        const total = Number(countRow?.total || 0);

        const selectSql =
            'SELECT m.id, m.cuenta_bancaria_id, e.codigo as id_empresa, cb.numero as numero_cuenta, cb.nombre as cuenta_nombre, ' +
            'm.fecha, m.fecha_aplicado, m.documento, m.concepto, m.monto, m.cargo, m.abono, ' +
            'tr.codigo as cod_remesa, m.cod_cta, m.num_partida, m.version, m.transfer_group_id, ' +
            'IF(m.es_contabilizado, "S", "N") as es_contabilizado, ' +
            'e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
            `${baseJoins} ${whereSql} ORDER BY m.fecha DESC, m.id DESC LIMIT ? OFFSET ?`;

        const [rows] = await db.query(selectSql, [...params, safeLimit, offset]);

        const formatted = rows.map(r => ({
            ...r,
            llave: String(r.id),
            tipo: Number(r.cargo || 0) > 0 ? 'CARGO' : 'ABONO',
            fecha: toDisplayDate(r.fecha),
            fecha_aplicado: toDisplayDate(r.fecha_aplicado)
        }));

        res.setHeader('X-Total-Count', String(total));
        res.setHeader('X-Truncated', total > offset + rows.length ? 'true' : 'false');
        res.json(formatted);
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar movimientos bancarios');
    }
});

router.get('/movimientos/reporte-fecha', authenticateToken, requirePermission(movimientosViewPerms), async (req, res) => {
    const { cuenta_bancaria_id, numero_cuenta, desde, hasta, tipo } = req.query;
    try {
        if ((!cuenta_bancaria_id && !numero_cuenta) || !desde || !hasta) {
            return res.status(400).json({ message: 'Se requiere cuenta bancaria (cuenta_bancaria_id o numero_cuenta), desde y hasta' });
        }

        const db = getDb();
        let query = `
            SELECT m.id, e.codigo as id_empresa, cb.id as cuenta_bancaria_id, cb.numero as numero_cuenta, cb.nombre as cuenta_nombre,
                   b.id as banco_id, b.descripcion as banco_nombre, e.nombre as empresa_nombre,
                   m.fecha, m.fecha_aplicado, m.documento, m.concepto, m.monto, m.cargo, m.abono,
                   tr.codigo as cod_remesa, tr.descripcion as remesa_descripcion,
                   m.cod_cta, m.num_partida,
                   IF(m.es_contabilizado, 'S', 'N') as es_contabilizado
            FROM movimientos_bancarios m
            LEFT JOIN empresas e ON m.empresa_id = e.id
            LEFT JOIN cuentas_bancarias cb ON m.cuenta_bancaria_id = cb.id
            LEFT JOIN bancos b ON cb.banco_id = b.id
            LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id
            WHERE m.deleted_at IS NULL
        `;
        const params = [];

        if (cuenta_bancaria_id) {
            query += ' AND m.cuenta_bancaria_id = ?';
            params.push(cuenta_bancaria_id);
        } else if (numero_cuenta) {
            query += ' AND cb.numero = ?';
            params.push(numero_cuenta);
        }

        query += ' AND m.fecha BETWEEN ? AND ?';
        params.push(desde, hasta);

        if (tipo === 'CARGOS') {
            query += ' AND m.cargo > 0';
        } else if (tipo === 'ABONOS') {
            query += ' AND m.abono > 0';
        }

        query += ' ORDER BY m.fecha ASC, m.id ASC';

        const [rows] = await db.query(query, params);

        const formatted = rows.map(r => ({
            ...r,
            llave: String(r.id),
            fecha: toDisplayDate(r.fecha),
            fecha_raw: r.fecha ? toDBDate(r.fecha) : '',
            fecha_aplicado: toDisplayDate(r.fecha_aplicado)
        }));

        res.json(formatted);
    } catch (error) {
        sendSafeError(res, error, 'Error al generar reporte de movimientos por fecha');
    }
});

router.post('/movimientos', authenticateToken, requirePermission(movimientosManagePerms), async (req, res) => {
    const {
        id_empresa, numero_cuenta, cuenta_bancaria_id,
        numero_cuenta_debitar, numero_cuenta_acreditar,
        cuenta_debitar_id, cuenta_acreditar_id,
        fecha, fecha_aplicado, documento, concepto,
        monto, tipo, cod_remesa, cod_cta, num_partida, is_transferencia
    } = req.body || {};

    const isTransfer = is_transferencia || cod_remesa === 'TR' || cod_remesa === 'TRANSFERENCIA' || ((numero_cuenta_debitar || cuenta_debitar_id) && (numero_cuenta_acreditar || cuenta_acreditar_id));
    const parsedMonto = parseStrictPositiveAmount(monto);
    if (parsedMonto === null) {
        return res.status(400).json({ message: 'El monto de la transacción debe ser mayor a $0.00' });
    }

    const dbFecha = parseStrictDBDate(fecha || getElSalvadorTodayYMD());
    if (!dbFecha) {
        return res.status(400).json({ message: 'La fecha del movimiento no es válida.' });
    }
    const dbFechaAplicado = fecha_aplicado ? parseStrictDBDate(fecha_aplicado) : null;
    if (fecha_aplicado && !dbFechaAplicado) {
        return res.status(400).json({ message: 'La fecha de aplicación no es válida.' });
    }

    const idempotencyKey = getIdempotencyKey(req);

    try {
        const txResult = await withTransaction(async (conn) => {
            if (idempotencyKey) {
                const idem = await beginIdempotentRequest(conn, {
                    key: idempotencyKey,
                    scope: 'bancos_movimientos_create',
                    userId: req.user?.id,
                    payload: { id_empresa, numero_cuenta, cuenta_bancaria_id, numero_cuenta_debitar, numero_cuenta_acreditar, dbFecha, documento, parsedMonto, cod_remesa }
                });
                if (idem.replayed) return { replayed: true, statusCode: idem.statusCode, body: idem.responseBody };
                if (idem.conflict) return { conflict: true };
            }

            // ── CASO A: TRANSFERENCIA ENTRE CUENTAS (DEBITAR Y ACREDITAR) ──
            if (isTransfer) {
                const ctaDebitarNum = numero_cuenta_debitar || numero_cuenta;
                const ctaAcreditarNum = numero_cuenta_acreditar;

                if ((!ctaDebitarNum && !cuenta_debitar_id) || (!ctaAcreditarNum && !cuenta_acreditar_id)) {
                    return { errorStatus: 400, errorBody: { message: 'Debe especificar tanto la Cuenta a Debitar como la Cuenta a Acreditar' } };
                }

                const [cuentasDebito] = cuenta_debitar_id
                    ? await conn.query(
                        'SELECT c.id, c.numero, c.nombre, c.empresa_id, e.codigo as empresa_codigo, b.descripcion as banco_nombre ' +
                        'FROM cuentas_bancarias c LEFT JOIN empresas e ON c.empresa_id = e.id LEFT JOIN bancos b ON c.banco_id = b.id ' +
                        'WHERE c.id = ? AND c.activa = TRUE',
                        [cuenta_debitar_id]
                    )
                    : await conn.query(
                        'SELECT c.id, c.numero, c.nombre, c.empresa_id, e.codigo as empresa_codigo, b.descripcion as banco_nombre ' +
                        'FROM cuentas_bancarias c LEFT JOIN empresas e ON c.empresa_id = e.id LEFT JOIN bancos b ON c.banco_id = b.id ' +
                        'WHERE c.numero = ? AND c.activa = TRUE ORDER BY (e.codigo = ?) DESC LIMIT 1',
                        [ctaDebitarNum, id_empresa || '']
                    );
                if (cuentasDebito.length === 0) {
                    return { errorStatus: 400, errorBody: { message: `Cuenta a debitar (${ctaDebitarNum || cuenta_debitar_id}) no encontrada o inactiva` } };
                }
                const ctaDeb = cuentasDebito[0];

                const [cuentasCredito] = cuenta_acreditar_id
                    ? await conn.query(
                        'SELECT c.id, c.numero, c.nombre, c.empresa_id, e.codigo as empresa_codigo, b.descripcion as banco_nombre ' +
                        'FROM cuentas_bancarias c LEFT JOIN empresas e ON c.empresa_id = e.id LEFT JOIN bancos b ON c.banco_id = b.id ' +
                        'WHERE c.id = ? AND c.activa = TRUE',
                        [cuenta_acreditar_id]
                    )
                    : await conn.query(
                        'SELECT c.id, c.numero, c.nombre, c.empresa_id, e.codigo as empresa_codigo, b.descripcion as banco_nombre ' +
                        'FROM cuentas_bancarias c LEFT JOIN empresas e ON c.empresa_id = e.id LEFT JOIN bancos b ON c.banco_id = b.id ' +
                        'WHERE c.numero = ? AND c.activa = TRUE ORDER BY (e.codigo = ?) DESC LIMIT 1',
                        [ctaAcreditarNum, id_empresa || '']
                    );
                if (cuentasCredito.length === 0) {
                    return { errorStatus: 400, errorBody: { message: `Cuenta a acreditar (${ctaAcreditarNum || cuenta_acreditar_id}) no encontrada o inactiva` } };
                }
                const ctaCred = cuentasCredito[0];

                if (Number(ctaDeb.id) === Number(ctaCred.id)) {
                    return { errorStatus: 400, errorBody: { message: 'La Cuenta a Debitar y la Cuenta a Acreditar no pueden ser la misma' } };
                }

                const lockDeb = await isDateInClosedPeriod(conn, ctaDeb.id, [dbFecha, dbFechaAplicado]);
                if (lockDeb.closed) {
                    return { errorStatus: 423, errorBody: { message: `La cuenta a debitar tiene período cerrado hasta ${toDisplayDate(lockDeb.lockedDate)}.` } };
                }
                const lockCred = await isDateInClosedPeriod(conn, ctaCred.id, [dbFecha, dbFechaAplicado]);
                if (lockCred.closed) {
                    return { errorStatus: 423, errorBody: { message: `La cuenta a acreditar tiene período cerrado hasta ${toDisplayDate(lockCred.lockedDate)}.` } };
                }

                const [remDeb] = await conn.query(
                    'SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo IN ("TR", "NC") ORDER BY (codigo = "TR") DESC LIMIT 1',
                    [ctaDeb.empresa_id]
                );
                const tipoRemDebId = remDeb.length > 0 ? remDeb[0].id : null;

                const [remCred] = await conn.query(
                    'SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo IN ("TR", "NA") ORDER BY (codigo = "TR") DESC LIMIT 1',
                    [ctaCred.empresa_id]
                );
                const tipoRemCredId = remCred.length > 0 ? remCred[0].id : null;

                const conceptoBase = String(concepto || '').trim().toUpperCase().slice(0, 255);
                const conceptoDebito = (conceptoBase || `TRANSFERENCIA A ${ctaCred.banco_nombre || ''} #${ctaCred.numero} ${ctaCred.nombre || ''}`.trim()).slice(0, 255);
                const conceptoCredito = (conceptoBase || `TRANSFERENCIA DE ${ctaDeb.banco_nombre || ''} #${ctaDeb.numero} ${ctaDeb.nombre || ''}`.trim()).slice(0, 255);
                const cleanDoc = String(documento || '').trim().slice(0, 100);
                const transferGroupId = crypto.randomUUID();
                const fpDeb = computeMovementFingerprint({ cuentaBancariaId: ctaDeb.id, fecha: dbFecha, documento: cleanDoc, cargo: parsedMonto, abono: 0, concepto: conceptoDebito });
                const fpCred = computeMovementFingerprint({ cuentaBancariaId: ctaCred.id, fecha: dbFecha, documento: cleanDoc, cargo: 0, abono: parsedMonto, concepto: conceptoCredito });

                const [resDeb] = await conn.query(
                    `INSERT INTO movimientos_bancarios
                        (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                         monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                         created_by, conciliado_by, conciliado_at, transfer_group_id, fingerprint, version)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [ctaDeb.empresa_id, ctaDeb.id, dbFecha, dbFechaAplicado, cleanDoc, conceptoDebito, parsedMonto, parsedMonto, tipoRemDebId, cod_cta || null, num_partida || null, req.user?.id || null, dbFechaAplicado ? (req.user?.id || null) : null, dbFechaAplicado ? new Date() : null, transferGroupId, fpDeb]
                );

                const [resCred] = await conn.query(
                    `INSERT INTO movimientos_bancarios
                        (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                         monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                         created_by, conciliado_by, conciliado_at, transfer_group_id, fingerprint, version)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [ctaCred.empresa_id, ctaCred.id, dbFecha, dbFechaAplicado, cleanDoc, conceptoCredito, parsedMonto, parsedMonto, tipoRemCredId, cod_cta || null, num_partida || null, req.user?.id || null, dbFechaAplicado ? (req.user?.id || null) : null, dbFechaAplicado ? new Date() : null, transferGroupId, fpCred]
                );

                await recordBankAudit(conn, {
                    cuentaBancariaId: ctaDeb.id,
                    entidad: 'movimientos_bancarios',
                    entidadId: resDeb.insertId,
                    accion: 'CREATE_TRANSFER_DEBIT',
                    user: req.user,
                    ipAddress: req.ip,
                    after: { id: resDeb.insertId, transfer_group_id: transferGroupId, cargo: parsedMonto, fecha: dbFecha }
                });
                await recordBankAudit(conn, {
                    cuentaBancariaId: ctaCred.id,
                    entidad: 'movimientos_bancarios',
                    entidadId: resCred.insertId,
                    accion: 'CREATE_TRANSFER_CREDIT',
                    user: req.user,
                    ipAddress: req.ip,
                    after: { id: resCred.insertId, transfer_group_id: transferGroupId, abono: parsedMonto, fecha: dbFecha }
                });

                const body = {
                    message: 'Transferencia entre cuentas registrada exitosamente',
                    debit_id: resDeb.insertId,
                    credit_id: resCred.insertId,
                    transfer_group_id: transferGroupId
                };

                if (idempotencyKey) {
                    await saveIdempotentResponse(conn, { key: idempotencyKey, scope: 'bancos_movimientos_create', statusCode: 201, responseBody: body });
                }

                return { statusCode: 201, body, cuentaIds: [ctaDeb.id, ctaCred.id] };
            }

            // ── CASO B: MOVIMIENTO BANCARIO ESTÁNDAR ──
            let empresaId = null;
            let cuentaBancariaId = null;

            if (cuenta_bancaria_id) {
                const [ctaRows] = await conn.query('SELECT id, empresa_id FROM cuentas_bancarias WHERE id = ? AND activa = TRUE', [cuenta_bancaria_id]);
                if (ctaRows.length === 0) return { errorStatus: 400, errorBody: { message: 'Cuenta bancaria no encontrada o inactiva' } };
                cuentaBancariaId = ctaRows[0].id;
                empresaId = ctaRows[0].empresa_id;
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
                    errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para registrar en esa fecha.` }
                };
            }

            let tipoRemesaId = null;
            if (cod_remesa) {
                const [remRows] = await conn.query('SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_remesa]);
                tipoRemesaId = remRows.length > 0 ? remRows[0].id : null;
            }

            const direction = normalizeMovementDirection({ tipo, codRemesa: cod_remesa, descripcion: concepto });
            const cargo = direction === 'CARGO' ? parsedMonto : 0;
            const abono = direction === 'ABONO' ? parsedMonto : 0;
            const cleanConcepto = String(concepto || '').trim().toUpperCase().slice(0, 255);
            const cleanDoc = String(documento || '').trim().slice(0, 100);
            const fp = computeMovementFingerprint({ cuentaBancariaId, fecha: dbFecha, documento: cleanDoc, cargo, abono, concepto: cleanConcepto });

            const [result] = await conn.query(
                `INSERT INTO movimientos_bancarios
                    (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
                     monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida,
                     created_by, conciliado_by, conciliado_at, fingerprint, version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    empresaId, cuentaBancariaId, dbFecha, dbFechaAplicado, cleanDoc, cleanConcepto,
                    parsedMonto, cargo, abono, tipoRemesaId, cod_cta || null, num_partida || null,
                    req.user?.id || null, dbFechaAplicado ? (req.user?.id || null) : null, dbFechaAplicado ? new Date() : null, fp
                ]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId,
                entidad: 'movimientos_bancarios',
                entidadId: result.insertId,
                accion: 'CREATE',
                user: req.user,
                ipAddress: req.ip,
                after: { id: result.insertId, fecha: dbFecha, fecha_aplicado: dbFechaAplicado, documento: cleanDoc, monto: parsedMonto, cargo, abono }
            });

            const body = { message: 'Movimiento registrado exitosamente', id: result.insertId };
            if (idempotencyKey) {
                await saveIdempotentResponse(conn, { key: idempotencyKey, scope: 'bancos_movimientos_create', statusCode: 201, responseBody: body });
            }

            return { statusCode: 201, body, cuentaIds: [cuentaBancariaId] };
        });

        if (txResult.conflict) {
            return res.status(409).json({ message: 'Registro duplicado en proceso. Espere unos segundos.' });
        }
        if (txResult.replayed) {
            return res.status(txResult.statusCode).json(txResult.body);
        }
        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        for (const ctaId of (txResult.cuentaIds || [])) {
            emitBankUpdate(req.io, 'movimientos_updated', { cuenta_bancaria_id: ctaId });
            emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: ctaId, fecha: dbFecha });
        }

        res.status(201).json(txResult.body);
    } catch (error) {
        sendSafeError(res, error, 'Error al registrar movimiento');
    }
});

router.put('/movimientos/:id', authenticateToken, requirePermission(movimientosManagePerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de movimiento inválido.' });
    }

    const {
        id_empresa, numero_cuenta, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto,
        monto, tipo, cod_remesa, cod_cta, num_partida, version
    } = req.body || {};

    const numericMonto = parseStrictPositiveAmount(monto);
    if (numericMonto === null) {
        return res.status(400).json({ message: 'El monto debe ser mayor a $0.00' });
    }

    const dbFecha = parseStrictDBDate(fecha);
    if (!dbFecha) {
        return res.status(400).json({ message: 'La fecha del movimiento no es válida.' });
    }
    const dbFechaAplicado = fecha_aplicado ? parseStrictDBDate(fecha_aplicado) : null;
    if (fecha_aplicado && !dbFechaAplicado) {
        return res.status(400).json({ message: 'La fecha de aplicación no es válida.' });
    }

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[existing]] = await conn.query('SELECT * FROM movimientos_bancarios WHERE id = ? FOR UPDATE', [id]);
            if (!existing || existing.deleted_at) {
                return { errorStatus: 404, errorBody: { message: 'Movimiento bancario no encontrado.' } };
            }
            if (existing.es_contabilizado) {
                return { errorStatus: 409, errorBody: { message: 'No se puede editar un movimiento ya contabilizado.' } };
            }
            if (existing.fecha_aplicado) {
                return { errorStatus: 409, errorBody: { message: 'Este movimiento ya fue conciliado. Desconcilie primero en Conciliación Bancaria antes de editar.' } };
            }
            if (version !== undefined && Number(version) !== Number(existing.version || 1)) {
                return { errorStatus: 409, errorBody: { message: 'El movimiento fue modificado por otro usuario. Recargue la lista.' } };
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
                return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockOld.lockedDate)}. Solicite reapertura para editar.` } };
            }
            const lockNew = await isDateInClosedPeriod(conn, cuentaBancariaId, [dbFecha, dbFechaAplicado]);
            if (lockNew.closed) {
                return { errorStatus: 423, errorBody: { message: `Período destino cerrado hasta ${toDisplayDate(lockNew.lockedDate)}.` } };
            }

            let tipoRemesaId = existing.tipo_remesa_id;
            if (cod_remesa !== undefined) {
                if (cod_remesa) {
                    const [remRows] = await conn.query('SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_remesa]);
                    tipoRemesaId = remRows.length > 0 ? remRows[0].id : null;
                } else {
                    tipoRemesaId = null;
                }
            }

            const direction = normalizeMovementDirection({
                tipo: tipo || (Number(existing.cargo) > 0 ? 'CARGO' : 'ABONO'),
                codRemesa: cod_remesa,
                descripcion: concepto
            });
            const cargo = direction === 'CARGO' ? numericMonto : 0;
            const abono = direction === 'ABONO' ? numericMonto : 0;
            const cleanDoc = String(documento || '').trim().slice(0, 100);
            const cleanConcepto = String(concepto || '').trim().toUpperCase().slice(0, 255);
            const fp = computeMovementFingerprint({ cuentaBancariaId, fecha: dbFecha, documento: cleanDoc, cargo, abono, concepto: cleanConcepto });

            await conn.query(
                'UPDATE movimientos_bancarios ' +
                'SET empresa_id = ?, cuenta_bancaria_id = ?, fecha = ?, fecha_aplicado = ?, documento = ?, ' +
                '    concepto = ?, monto = ?, cargo = ?, abono = ?, tipo_remesa_id = ?, ' +
                '    cod_cta = ?, num_partida = ?, fingerprint = ?, updated_by = ?, version = version + 1 ' +
                'WHERE id = ?',
                [
                    empresaId, cuentaBancariaId, dbFecha, dbFechaAplicado, cleanDoc,
                    cleanConcepto, numericMonto, cargo, abono, tipoRemesaId,
                    cod_cta || null, num_partida || null, fp, req.user?.id || null, id
                ]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId,
                entidad: 'movimientos_bancarios',
                entidadId: id,
                accion: 'UPDATE',
                user: req.user,
                ipAddress: req.ip,
                before: {
                    cuenta_bancaria_id: existing.cuenta_bancaria_id,
                    fecha: toDBDate(existing.fecha),
                    documento: existing.documento,
                    concepto: existing.concepto,
                    monto: Number(existing.monto),
                    cargo: Number(existing.cargo),
                    abono: Number(existing.abono)
                },
                after: {
                    cuenta_bancaria_id: cuentaBancariaId,
                    fecha: dbFecha,
                    documento: cleanDoc,
                    concepto: cleanConcepto,
                    monto: numericMonto,
                    cargo,
                    abono
                }
            });

            return { cuentaBancariaId };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'movimientos_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });
        emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });

        res.json({ message: 'Movimiento actualizado exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar movimiento');
    }
});

router.delete('/movimientos/:id', authenticateToken, requirePermission(movimientosManagePerms), async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de movimiento inválido.' });
    }
    const motivo = String(req.body?.motivo || req.query?.motivo || 'Eliminación solicitada por usuario').trim().slice(0, 255);

    try {
        const txResult = await withTransaction(async (conn) => {
            const [[existing]] = await conn.query('SELECT * FROM movimientos_bancarios WHERE id = ? FOR UPDATE', [id]);
            if (!existing || existing.deleted_at) {
                return { errorStatus: 404, errorBody: { message: 'Movimiento bancario no encontrado.' } };
            }
            if (existing.es_contabilizado) {
                return { errorStatus: 409, errorBody: { message: 'No se puede eliminar un movimiento contabilizado.' } };
            }
            if (existing.fecha_aplicado) {
                return { errorStatus: 409, errorBody: { message: 'No se puede eliminar un movimiento conciliado. Desconcilie primero en Conciliación Bancaria.' } };
            }

            const lockCheck = await isDateInClosedPeriod(conn, existing.cuenta_bancaria_id, [existing.fecha, existing.fecha_aplicado]);
            if (lockCheck.closed) {
                return { errorStatus: 423, errorBody: { message: `Período cerrado hasta ${toDisplayDate(lockCheck.lockedDate)}. Solicite reapertura para eliminar.` } };
            }

            // Verificar referencias activas en otros módulos
            try {
                const [rhRows] = await conn.query('SELECT id FROM rh_planilla_pagos WHERE movimiento_bancario_id = ? LIMIT 1', [id]);
                if (rhRows && rhRows.length > 0) {
                    return { errorStatus: 409, errorBody: { message: 'Movimiento vinculado a un pago de Planilla RRHH. Anúlelo desde el módulo de Planillas.' } };
                }
            } catch (_) { /* tabla opcional */ }

            try {
                const [pedRows] = await conn.query('SELECT numero_orden FROM portal_pedidos WHERE movimiento_bancario_id = ? LIMIT 1', [id]);
                if (pedRows && pedRows.length > 0) {
                    return { errorStatus: 409, errorBody: { message: `Movimiento vinculado al Pedido #${pedRows[0].numero_orden}. Desvincúlelo desde Pedidos Combustible.` } };
                }
            } catch (_) { /* tabla opcional */ }

            try {
                const [abRows] = await conn.query("SELECT id FROM recordatorios_pagos_abonos WHERE movimiento_bancario_id = ? AND estado_conciliacion = 'CONCILIADO' LIMIT 1", [id]);
                if (abRows && abRows.length > 0) {
                    return { errorStatus: 409, errorBody: { message: 'Movimiento vinculado a un pago de Control de Pagos.' } };
                }
            } catch (_) { /* tabla opcional */ }

            await conn.query(
                'UPDATE movimientos_bancarios SET deleted_at = NOW(), deleted_by = ?, motivo_eliminacion = ?, version = version + 1 WHERE id = ?',
                [req.user?.id || null, motivo, id]
            );

            await recordBankAudit(conn, {
                cuentaBancariaId: existing.cuenta_bancaria_id,
                entidad: 'movimientos_bancarios',
                entidadId: id,
                accion: 'SOFT_DELETE',
                user: req.user,
                ipAddress: req.ip,
                motivo,
                before: {
                    id: existing.id,
                    fecha: toDBDate(existing.fecha),
                    documento: existing.documento,
                    concepto: existing.concepto,
                    monto: Number(existing.monto),
                    cargo: Number(existing.cargo),
                    abono: Number(existing.abono),
                    transfer_group_id: existing.transfer_group_id || null
                }
            });

            return { cuentaBancariaId: existing.cuenta_bancaria_id };
        });

        if (txResult.errorStatus) {
            return res.status(txResult.errorStatus).json(txResult.errorBody);
        }

        emitBankUpdate(req.io, 'movimientos_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });
        emitBankUpdate(req.io, 'conciliacion_updated', { cuenta_bancaria_id: txResult.cuentaBancariaId, id });

        res.json({ message: 'Movimiento eliminado exitosamente (respaldado en auditoría)' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar movimiento');
    }
});

module.exports = router;
