const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const toDisplayDate = (dateVal) => {
    if (!dateVal) return null;
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

const toDBDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
};

// --- Cuentas Bancarias ---
router.get('/catalogos', authenticateToken, async (req, res) => {
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
        res.status(500).json({ message: 'Error al cargar catálogos', error: error.message });
    }
});

router.get('/cuentas', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query(
            'SELECT c.id as corr, e.codigo as id_empresa, b.codigo as cod_banco, t.codigo as cod_tipo, ' +
            'c.numero, c.nombre, c.cod_cta, IF(c.activa, "S", "N") as activa, c.orden, ' +
            'e.nombre as empresa_nombre, b.descripcion as banco_nombre, t.descripcion as tipo_nombre ' +
            'FROM cuentas_bancarias c ' +
            'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
            'LEFT JOIN bancos b ON c.banco_id = b.id ' +
            'LEFT JOIN tipos_cuenta_bancaria t ON c.tipo_cuenta_id = t.id ' +
            'ORDER BY c.orden ASC, c.nombre ASC'
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar cuentas', error: error.message });
    }
});

router.post('/cuentas', authenticateToken, async (req, res) => {
    const { id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, orden } = req.body;
    try {
        const db = getDb();

        const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
        if (empRows.length === 0) return res.status(400).json({ message: 'Empresa no encontrada' });
        const empresaId = empRows[0].id;

        const [banRows] = await db.query('SELECT id FROM bancos WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_banco]);
        const bancoId = banRows.length > 0 ? banRows[0].id : null;

        const [tipRows] = await db.query('SELECT id FROM tipos_cuenta_bancaria WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_tipo]);
        const tipoCuentaId = tipRows.length > 0 ? tipRows[0].id : null;

        const [result] = await db.query(
            'INSERT INTO cuentas_bancarias (empresa_id, numero, nombre, banco_id, tipo_cuenta_id, cod_cta, activa, orden) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)',
            [empresaId, numero, nombre, bancoId, tipoCuentaId, cod_cta, orden || 0]
        );
        res.status(201).json({ message: 'Cuenta creada exitosamente', id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear cuenta', error: error.message });
    }
});

router.put('/cuentas/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, activa, orden } = req.body;
    try {
        const db = getDb();

        const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
        if (empRows.length === 0) return res.status(400).json({ message: 'Empresa no encontrada' });
        const empresaId = empRows[0].id;

        const [banRows] = await db.query('SELECT id FROM bancos WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_banco]);
        const bancoId = banRows.length > 0 ? banRows[0].id : null;

        const [tipRows] = await db.query('SELECT id FROM tipos_cuenta_bancaria WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_tipo]);
        const tipoCuentaId = tipRows.length > 0 ? tipRows[0].id : null;

        const activaBool = activa === 'S' ? 1 : 0;
        await db.query(
            'UPDATE cuentas_bancarias SET empresa_id = ?, numero = ?, nombre = ?, banco_id = ?, tipo_cuenta_id = ?, cod_cta = ?, activa = ?, orden = ? WHERE id = ?',
            [empresaId, numero, nombre, bancoId, tipoCuentaId, cod_cta, activaBool, orden || 0, id]
        );
        res.json({ message: 'Cuenta actualizada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar cuenta', error: error.message });
    }
});

router.delete('/cuentas/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('UPDATE cuentas_bancarias SET activa = FALSE WHERE id = ?', [id]);
        res.json({ message: 'Cuenta desactivada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al desactivar cuenta', error: error.message });
    }
});

// --- Movimientos Bancarios ---
router.get('/movimientos/catalogos', authenticateToken, async (req, res) => {
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
                    'ORDER BY c.nombre ASC',
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
                'ORDER BY c.nombre ASC'
            );
        }

        res.json({ cuentas, remesas, empresas });
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar catálogos de movimientos', error: error.message });
    }
});

router.get('/movimientos', authenticateToken, async (req, res) => {
    const { id_empresa, numero_cuenta, desde, hasta } = req.query;
    try {
        const db = getDb();
        let query = 'SELECT m.id, e.codigo as id_empresa, cb.numero as numero_cuenta, ' +
                    'm.fecha, m.fecha_aplicado, m.documento, m.concepto, m.monto, m.cargo, m.abono, ' +
                    'tr.codigo as cod_remesa, m.cod_cta, m.num_partida, ' +
                    'IF(m.es_contabilizado, "S", "N") as es_contabilizado, ' +
                    'e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
                    'FROM movimientos_bancarios m ' +
                    'LEFT JOIN empresas e ON m.empresa_id = e.id ' +
                    'LEFT JOIN cuentas_bancarias cb ON m.cuenta_bancaria_id = cb.id ' +
                    'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
                    'LEFT JOIN tipos_remesas tr ON m.tipo_remesa_id = tr.id ' +
                    'WHERE 1=1 ';
        const params = [];

        if (id_empresa) {
            query += ' AND e.codigo = ?';
            params.push(id_empresa);
        }
        if (numero_cuenta) {
            query += ' AND cb.numero = ?';
            params.push(numero_cuenta);
        }
        if (desde && hasta) {
            query += ' AND m.fecha BETWEEN ? AND ?';
            params.push(desde, hasta);
        }

        query += ' ORDER BY m.id DESC LIMIT 500';
        const [rows] = await db.query(query, params);

        const formatted = rows.map(r => ({
            ...r,
            llave: String(r.id),
            fecha: toDisplayDate(r.fecha),
            fecha_aplicado: toDisplayDate(r.fecha_aplicado)
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar movimientos bancarios', error: error.message });
    }
});

router.post('/movimientos', authenticateToken, async (req, res) => {
    const {
        id_empresa, numero_cuenta, numero_cuenta_debitar, numero_cuenta_acreditar,
        fecha, fecha_aplicado, documento, concepto,
        monto, tipo, cod_remesa, cod_cta, num_partida, is_transferencia
    } = req.body;

    const db = getDb();
    const isTransfer = is_transferencia || cod_remesa === 'TR' || cod_remesa === 'TRANSFERENCIA' || (numero_cuenta_debitar && numero_cuenta_acreditar);

    try {
        const dbFecha = toDBDate(fecha);
        const dbFechaAplicado = toDBDate(fecha_aplicado);
        const parsedMonto = parseFloat(monto) || 0;

        if (parsedMonto <= 0) {
            return res.status(400).json({ message: 'El monto de la transacción debe ser mayor a 0' });
        }

        // ── CASO A: TRANSFERENCIA ENTRE CUENTAS (DEBITAR Y ACREDITAR) ──
        if (isTransfer) {
            const ctaDebitarNum = numero_cuenta_debitar || numero_cuenta;
            const ctaAcreditarNum = numero_cuenta_acreditar;

            if (!ctaDebitarNum || !ctaAcreditarNum) {
                return res.status(400).json({ message: 'Debe especificar tanto la Cuenta a Debitar como la Cuenta a Acreditar' });
            }

            if (ctaDebitarNum === ctaAcreditarNum) {
                return res.status(400).json({ message: 'La Cuenta a Debitar y la Cuenta a Acreditar no pueden ser la misma' });
            }

            // Buscar cuentas
            const [cuentasDebito] = await db.query(
                'SELECT c.id, c.numero, c.nombre, c.empresa_id, e.codigo as empresa_codigo, b.descripcion as banco_nombre ' +
                'FROM cuentas_bancarias c ' +
                'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
                'LEFT JOIN bancos b ON c.banco_id = b.id ' +
                'WHERE c.numero = ? AND c.activa = TRUE',
                [ctaDebitarNum]
            );
            if (cuentasDebito.length === 0) {
                return res.status(400).json({ message: `Cuenta a debitar (${ctaDebitarNum}) no encontrada o inactiva` });
            }
            const ctaDeb = cuentasDebito[0];

            const [cuentasCredito] = await db.query(
                'SELECT c.id, c.numero, c.nombre, c.empresa_id, e.codigo as empresa_codigo, b.descripcion as banco_nombre ' +
                'FROM cuentas_bancarias c ' +
                'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
                'LEFT JOIN bancos b ON c.banco_id = b.id ' +
                'WHERE c.numero = ? AND c.activa = TRUE',
                [ctaAcreditarNum]
            );
            if (cuentasCredito.length === 0) {
                return res.status(400).json({ message: `Cuenta a acreditar (${ctaAcreditarNum}) no encontrada o inactiva` });
            }
            const ctaCred = cuentasCredito[0];

            // Buscar tipos de remesa para cada empresa
            const [remDeb] = await db.query(
                'SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo IN ("TR", "NC") ORDER BY (codigo = "TR") DESC LIMIT 1',
                [ctaDeb.empresa_id]
            );
            const tipoRemDebId = remDeb.length > 0 ? remDeb[0].id : null;

            const [remCred] = await db.query(
                'SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo IN ("TR", "NA") ORDER BY (codigo = "TR") DESC LIMIT 1',
                [ctaCred.empresa_id]
            );
            const tipoRemCredId = remCred.length > 0 ? remCred[0].id : null;

            // Formatear conceptos
            const conceptoBase = (concepto || '').trim().toUpperCase();
            const conceptoDebito = conceptoBase || `TRANSFERENCIA A ${ctaCred.banco_nombre || ''} #${ctaCred.numero} ${ctaCred.nombre || ''}`.trim();
            const conceptoCredito = conceptoBase || `TRANSFERENCIA DE ${ctaDeb.banco_nombre || ''} #${ctaDeb.numero} ${ctaDeb.nombre || ''}`.trim();

            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                // 1. Movimiento Débito (CARGO / Salida)
                const [resDeb] = await connection.query(
                    'INSERT INTO movimientos_bancarios (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [ctaDeb.empresa_id, ctaDeb.id, dbFecha, dbFechaAplicado, documento || '', conceptoDebito, parsedMonto, parsedMonto, 0, tipoRemDebId, cod_cta || null, num_partida || null]
                );

                // 2. Movimiento Crédito (ABONO / Entrada)
                const [resCred] = await connection.query(
                    'INSERT INTO movimientos_bancarios (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [ctaCred.empresa_id, ctaCred.id, dbFecha, dbFechaAplicado, documento || '', conceptoCredito, parsedMonto, 0, parsedMonto, tipoRemCredId, cod_cta || null, num_partida || null]
                );

                await connection.commit();

                if (req.io) {
                    req.io.emit('movimientos_updated', { debit_id: resDeb.insertId, credit_id: resCred.insertId });
                    req.io.emit('conciliacion_updated', { fecha: dbFecha });
                }

                return res.status(201).json({
                    message: 'Transferencia entre cuentas registrada exitosamente',
                    debit_id: resDeb.insertId,
                    credit_id: resCred.insertId
                });
            } catch (txErr) {
                await connection.rollback();
                throw txErr;
            } finally {
                connection.release();
            }
        }

        // ── CASO B: MOVIMIENTO BANCARIO ESTÁNDAR ──
        const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
        if (empRows.length === 0) return res.status(400).json({ message: 'Empresa no encontrada' });
        const empresaId = empRows[0].id;

        const [cuentaRows] = await db.query(
            'SELECT id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ? AND activa = TRUE',
            [empresaId, numero_cuenta]
        );
        if (cuentaRows.length === 0) {
            return res.status(400).json({ message: 'Cuenta bancaria no encontrada o inactiva' });
        }
        const cuentaBancariaId = cuentaRows[0].id;

        let tipoRemesaId = null;
        if (cod_remesa) {
            const [remRows] = await db.query('SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_remesa]);
            tipoRemesaId = remRows.length > 0 ? remRows[0].id : null;
        }

        const cargo = tipo === 'CARGO' ? parsedMonto : 0;
        const abono = tipo === 'ABONO' ? parsedMonto : 0;

        const [result] = await db.query(
            'INSERT INTO movimientos_bancarios (empresa_id, cuenta_bancaria_id, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, tipo_remesa_id, cod_cta, num_partida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [empresaId, cuentaBancariaId, dbFecha, dbFechaAplicado, documento || '', (concepto || '').toUpperCase(), parsedMonto, cargo, abono, tipoRemesaId, cod_cta || null, num_partida || null]
        );

        if (req.io) {
            req.io.emit('movimientos_updated', { id: result.insertId });
            req.io.emit('conciliacion_updated', { fecha: dbFecha });
        }

        res.status(201).json({ message: 'Movimiento registrado exitosamente', id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar movimiento', error: error.message });
    }
});

router.put('/movimientos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const {
        id_empresa, numero_cuenta, fecha, fecha_aplicado, documento, concepto,
        monto, tipo, cod_remesa, cod_cta, num_partida
    } = req.body;

    const cargo = tipo === 'CARGO' ? monto : 0;
    const abono = tipo === 'ABONO' ? monto : 0;

    try {
        const db = getDb();

        const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
        if (empRows.length === 0) return res.status(400).json({ message: 'Empresa no encontrada' });
        const empresaId = empRows[0].id;

        const [cuentaRows] = await db.query(
            'SELECT id FROM cuentas_bancarias WHERE empresa_id = ? AND numero = ? AND activa = TRUE',
            [empresaId, numero_cuenta]
        );
        if (cuentaRows.length === 0) {
            return res.status(400).json({ message: 'Cuenta bancaria no encontrada o inactiva' });
        }
        const cuentaBancariaId = cuentaRows[0].id;

        let tipoRemesaId = null;
        if (cod_remesa) {
            const [remRows] = await db.query('SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ?', [empresaId, cod_remesa]);
            tipoRemesaId = remRows.length > 0 ? remRows[0].id : null;
        }

        const dbFecha = toDBDate(fecha);
        const dbFechaAplicado = toDBDate(fecha_aplicado);

        await db.query(
            'UPDATE movimientos_bancarios ' +
            'SET empresa_id = ?, cuenta_bancaria_id = ?, fecha = ?, fecha_aplicado = ?, documento = ?, ' +
            '    concepto = ?, monto = ?, cargo = ?, abono = ?, tipo_remesa_id = ?, ' +
            '    cod_cta = ?, num_partida = ? ' +
            'WHERE id = ?',
            [empresaId, cuentaBancariaId, dbFecha, dbFechaAplicado, documento || '', (concepto || '').toUpperCase(), monto, cargo, abono, tipoRemesaId, cod_cta || null, num_partida || null, id]
        );
        res.json({ message: 'Movimiento actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar movimiento', error: error.message });
    }
});

router.delete('/movimientos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM movimientos_bancarios WHERE id = ?', [id]);
        res.json({ message: 'Movimiento eliminado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar movimiento', error: error.message });
    }
});

module.exports = router;
