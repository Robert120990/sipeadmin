const express = require('express');
const router = express.Router();
const { getDb, getExternalDb } = require('../db');
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

router.get('/catalogos', authenticateToken, async (req, res) => {
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
                    'e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
                    'FROM cuentas_bancarias c ' +
                    'LEFT JOIN empresas e ON c.empresa_id = e.id ' +
                    'LEFT JOIN bancos b ON c.banco_id = b.id ' +
                    'WHERE c.activa = TRUE AND c.empresa_id = ? ' +
                    'ORDER BY c.nombre ASC',
                    [empresaId]
                );
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

        res.json({ empresas, cuentas });
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar catálogos', error: error.message });
    }
});

router.get('/', authenticateToken, async (req, res) => {
    const { id_empresa, numero_cuenta, desde, hasta } = req.query;
    try {
        const db = getDb();
        let query = 'SELECT ch.id, ch.llave, e.codigo as id_empresa, cb.numero as numero_cuenta, ' +
                    'ch.fecha, ch.cheque_anulado, ' +
                    'ch.cheque, ch.valor, ch.a_nombre, ch.fecha_aplicado, ch.concepto, ' +
                    'ch.es_reservado, ch.es_pago_contado, ch.fue_noemitido, ch.num_partida, ' +
                    'IF(ch.es_contabilizado, "S", "N") as es_contabilizado, ' +
                    'e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
                    'FROM cheques ch ' +
                    'LEFT JOIN empresas e ON ch.empresa_id = e.id ' +
                    'LEFT JOIN cuentas_bancarias cb ON ch.cuenta_bancaria_id = cb.id ' +
                    'LEFT JOIN bancos b ON cb.banco_id = b.id ' +
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
            query += ' AND ch.fecha BETWEEN ? AND ?';
            params.push(desde, hasta);
        }

        query += ' ORDER BY ch.id DESC LIMIT 500';
        const [rows] = await db.query(query, params);

        const formatted = rows.map(r => ({
            ...r,
            fecha: toDisplayDate(r.fecha),
            fecha_aplicado: toDisplayDate(r.fecha_aplicado)
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar cheques', error: error.message });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    const {
        id_empresa, numero_cuenta, fecha, fecha_aplicado, cheque, valor,
        a_nombre, concepto,
        cheque_anulado, es_reservado, es_pago_contado, fue_noemitido, num_partida
    } = req.body;

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

        const [maxRow] = await db.query('SELECT MAX(id) as max_id FROM cheques');
        const nextNum = (maxRow[0].max_id || 0) + 1;
        const llave = 'CHQ' + nextNum.toString().padStart(17, '0');

        const dbFecha = toDBDate(fecha);
        const dbFechaAplicado = toDBDate(fecha_aplicado);

        const [result] = await db.query(
            'INSERT INTO cheques (empresa_id, cuenta_bancaria_id, llave, fecha, cheque_anulado, cheque, valor, a_nombre, fecha_aplicado, concepto, es_reservado, es_pago_contado, fue_noemitido, num_partida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [empresaId, cuentaBancariaId, llave, dbFecha, cheque_anulado ? 1 : 0, cheque || '', valor || 0, a_nombre || '', dbFechaAplicado, (concepto || '').toUpperCase(), es_reservado ? 1 : 0, es_pago_contado ? 1 : 0, fue_noemitido ? 1 : 0, num_partida || null]
        );
        res.status(201).json({ message: 'Cheque registrado exitosamente', llave, id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar cheque', error: error.message });
    }
});

router.put('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const {
        id_empresa, numero_cuenta, fecha, fecha_aplicado, cheque, valor,
        a_nombre, concepto,
        cheque_anulado, es_reservado, es_pago_contado, fue_noemitido, num_partida
    } = req.body;

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

        const dbFecha = toDBDate(fecha);
        const dbFechaAplicado = toDBDate(fecha_aplicado);

        await db.query(
            'UPDATE cheques SET empresa_id = ?, cuenta_bancaria_id = ?, ' +
            'fecha = ?, cheque_anulado = ?, cheque = ?, valor = ?, a_nombre = ?, fecha_aplicado = ?, ' +
            'concepto = ?, es_reservado = ?, es_pago_contado = ?, fue_noemitido = ?, num_partida = ? ' +
            'WHERE id = ?',
            [empresaId, cuentaBancariaId, dbFecha, cheque_anulado ? 1 : 0, cheque || '', valor || 0, a_nombre || '', dbFechaAplicado, (concepto || '').toUpperCase(), es_reservado ? 1 : 0, es_pago_contado ? 1 : 0, fue_noemitido ? 1 : 0, num_partida || null, id]
        );
        res.json({ message: 'Cheque actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar cheque', error: error.message });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM cheques WHERE id = ?', [id]);
        res.json({ message: 'Cheque eliminado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar cheque', error: error.message });
    }
});

router.get('/contado/estaciones', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query(
            "SELECT id, nombre FROM empresas WHERE id <> '001' AND activa = 'S' ORDER BY id"
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar estaciones' });
    }
});

router.get('/contado/cuentas', authenticateToken, async (req, res) => {
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
        res.status(500).json({ message: 'Error al cargar cuentas' });
    }
});

router.get('/contado/solicitudes', authenticateToken, async (req, res) => {
    try {
        const { estacion, pendientes } = req.query;
        if (!estacion) return res.status(400).json({ message: 'Falta parametro estacion' });

        const externalDb = await getExternalDb();
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

        const formatted = rows.map(r => ({
            ...r,
            monto: Number(r.monto || 0),
            num_cheque: r.num_cheque || '',
            num_ccf: r.num_ccf || '',
            fecha_entrega: r.fecha_entrega || ''
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar solicitudes' });
    }
});

router.post('/contado/generar', authenticateToken, async (req, res) => {
    try {
        const { llave, id_empresa, numero_cuenta, cheque_num, fecha, valor, a_nombre, concepto } = req.body;
        if (!llave || !id_empresa || !numero_cuenta || !cheque_num) {
            return res.status(400).json({ message: 'Faltan campos obligatorios' });
        }

        const db = getDb();

        const [empRows] = await db.query('SELECT id FROM empresas WHERE codigo = ?', [id_empresa]);
        if (empRows.length === 0) return res.status(400).json({ message: 'Empresa no encontrada' });
        const empresaId = empRows[0].id;

        const [cuentaRows] = await db.query(
            'SELECT id FROM cuentas_bancarias WHERE numero = ? AND activa = TRUE',
            [numero_cuenta]
        );
        if (cuentaRows.length === 0) {
            return res.status(400).json({ message: 'Cuenta bancaria no encontrada o inactiva' });
        }
        const cuentaBancariaId = cuentaRows[0].id;

        const [maxRow] = await db.query('SELECT MAX(id) as max_id FROM cheques');
        const nextNum = (maxRow[0].max_id || 0) + 1;
        const llaveCheque = 'CHQ' + nextNum.toString().padStart(17, '0');

        const dbFecha = toDBDate(fecha) || new Date().toISOString().split('T')[0];

        await db.query(
            'INSERT INTO cheques (empresa_id, cuenta_bancaria_id, llave, fecha, cheque, valor, a_nombre, concepto, es_pago_contado, es_contabilizado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)',
            [empresaId, cuentaBancariaId, llaveCheque, dbFecha, cheque_num, Number(valor) || 0, a_nombre || '', (concepto || 'PAGO A PROVEEDOR (CONTADO)').toUpperCase()]
        );

        const externalDb = await getExternalDb();
        await externalDb.query(
            "UPDATE solicitud_chq_contado SET num_cheque = ?, llave_cheque = ? WHERE llave = ?",
            [cheque_num, llaveCheque, llave]
        );

        res.json({ message: 'Cheque generado exitosamente', llaveCheque });
    } catch (error) {
        res.status(500).json({ message: 'Error al generar cheque', error: error.message });
    }
});

module.exports = router;
