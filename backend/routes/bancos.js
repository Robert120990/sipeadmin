const express = require('express');
const router = express.Router();
const { getExternalDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// --- Cuentas Bancarias ---
router.get('/catalogos', authenticateToken, async (req, res) => {
    const { id_empresa } = req.query;
    try {
        const externalDb = await getExternalDb();
        const [empresas] = await externalDb.query('SELECT TRIM(id) as id, nombre FROM empresas_mayores ORDER BY nombre');
        
        let bancos = [];
        let tipos = [];

        if (id_empresa) {
            [bancos] = await externalDb.query('SELECT TRIM(id) as id, descripcion FROM bancos WHERE id_empresa = ? ORDER BY descripcion', [id_empresa]);
            [tipos] = await externalDb.query('SELECT TRIM(id) as id, descripcion FROM tipos_cuenta_bancaria WHERE id_empresa = ? ORDER BY descripcion', [id_empresa]);
        }

        res.json({ empresas, bancos, tipos });
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar catálogos', error: error.message });
    }
});

router.get('/cuentas', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query(
            'SELECT c.*, e.nombre as empresa_nombre, b.descripcion as banco_nombre, t.descripcion as tipo_nombre ' +
            'FROM cuentas_bancarias c ' +
            'LEFT JOIN empresas_mayores e ON TRIM(c.id_empresa) = TRIM(e.id) ' +
            'LEFT JOIN bancos b ON TRIM(c.cod_banco) = TRIM(b.id) AND TRIM(c.id_empresa) = TRIM(b.id_empresa) ' +
            'LEFT JOIN tipos_cuenta_bancaria t ON TRIM(c.cod_tipo) = TRIM(t.id) AND TRIM(c.id_empresa) = TRIM(t.id_empresa) ' +
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
        const externalDb = await getExternalDb();
        await externalDb.query(
            'INSERT INTO cuentas_bancarias (id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, activa, orden) VALUES (?, ?, ?, ?, ?, ?, "S", ?)',
            [id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, orden || 0]
        );
        res.status(201).json({ message: 'Cuenta creada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al crear cuenta', error: error.message });
    }
});

router.put('/cuentas/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, activa, orden } = req.body;
    try {
        const externalDb = await getExternalDb();
        await externalDb.query(
            'UPDATE cuentas_bancarias SET id_empresa = ?, numero = ?, nombre = ?, cod_banco = ?, cod_tipo = ?, cod_cta = ?, activa = ?, orden = ? WHERE corr = ?',
            [id_empresa, numero, nombre, cod_banco, cod_tipo, cod_cta, activa, orden || 0, id]
        );
        res.json({ message: 'Cuenta actualizada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar cuenta', error: error.message });
    }
});

router.delete('/cuentas/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const externalDb = await getExternalDb();
        await externalDb.query('UPDATE cuentas_bancarias SET activa = "N" WHERE corr = ?', [id]);
        res.json({ message: 'Cuenta desactivada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al desactivar cuenta', error: error.message });
    }
});

// --- Movimientos Bancarios ---
router.get('/movimientos/catalogos', authenticateToken, async (req, res) => {
    const { id_empresa } = req.query;
    try {
        const externalDb = await getExternalDb();
        
        const [cuentas] = await externalDb.query(
            'SELECT c.*, e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
            'FROM cuentas_bancarias c ' +
            'LEFT JOIN empresas_mayores e ON TRIM(c.id_empresa) = TRIM(e.id) ' +
            'LEFT JOIN bancos b ON TRIM(c.cod_banco) = TRIM(b.id) AND TRIM(c.id_empresa) = TRIM(b.id_empresa) ' +
            'WHERE c.activa = "S" ' +
            (id_empresa ? ' AND c.id_empresa = ?' : '') +
            ' ORDER BY c.nombre ASC',
            id_empresa ? [id_empresa] : []
        );

        let remesas = [];
        let destinos = [];
        let empresas = [];

        [empresas] = await externalDb.query('SELECT TRIM(id) as id, nombre FROM empresas_mayores ORDER BY nombre');

        if (id_empresa) {
            [remesas] = await externalDb.query('SELECT TRIM(id) as id, descripcion FROM tipos_remesas WHERE id_empresa = ? ORDER BY id', [id_empresa]);
            [destinos] = await externalDb.query('SELECT TRIM(id) as id, descripcion FROM destinos_cheques WHERE id_empresa = ? ORDER BY id', [id_empresa]);
        }

        res.json({ cuentas, remesas, destinos, empresas });
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar catálogos de movimientos', error: error.message });
    }
});

router.get('/movimientos', authenticateToken, async (req, res) => {
    const { id_empresa, numero_cuenta, desde, hasta } = req.query;
    try {
        const externalDb = await getExternalDb();
        let query = 'SELECT m.*, e.nombre as empresa_nombre, b.descripcion as banco_nombre ' +
                    'FROM movimientos_bancarios m ' +
                    'LEFT JOIN empresas_mayores e ON TRIM(m.id_empresa) = TRIM(e.id) ' +
                    'LEFT JOIN cuentas_bancarias c ON TRIM(m.numero_cuenta) = TRIM(c.numero) AND TRIM(m.id_empresa) = TRIM(c.id_empresa) ' +
                    'LEFT JOIN bancos b ON TRIM(c.cod_banco) = TRIM(b.id) AND TRIM(c.id_empresa) = TRIM(b.id_empresa) ' +
                    'WHERE 1=1 ';
        const params = [];

        if (id_empresa) {
            query += ' AND m.id_empresa = ?';
            params.push(id_empresa);
        }
        if (numero_cuenta) {
            query += ' AND m.numero_cuenta = ?';
            params.push(numero_cuenta);
        }
        if (desde && hasta) {
            query += ' AND STR_TO_DATE(m.fecha, "%d/%m/%Y") BETWEEN STR_TO_DATE(?, "%Y-%m-%d") AND STR_TO_DATE(?, "%Y-%m-%d")';
            params.push(desde, hasta);
        }

        query += ' ORDER BY m.id DESC LIMIT 500';
        const [rows] = await externalDb.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar movimientos bancarios', error: error.message });
    }
});

router.post('/movimientos', authenticateToken, async (req, res) => {
    const { 
        id_empresa, numero_cuenta, fecha, fecha_aplicado, documento, concepto, 
        monto, tipo, cod_remesa, tipo_destino, cod_cta 
    } = req.body;
    
    const cargo = tipo === 'CARGO' ? monto : 0;
    const abono = tipo === 'ABONO' ? monto : 0;

    try {
        const externalDb = await getExternalDb();
        
        const [maxRow] = await externalDb.query('SELECT MAX(CAST(SUBSTRING(llave, 4) AS UNSIGNED)) as max_num FROM movimientos_bancarios WHERE llave REGEXP "^[A-Z]{3}[0-9]+"');
        const nextNum = (maxRow[0].max_num || 0) + 1;
        const llave = 'WEB' + nextNum.toString().padStart(17, '0');

        const formatDate = (dateStr) => {
            if (!dateStr) return null;
            const d = new Date(dateStr + 'T12:00:00');
            return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        };

        const formattedDate = formatDate(fecha);
        const formattedFechaAplicado = formatDate(fecha_aplicado);

        await externalDb.query(
            'INSERT INTO movimientos_bancarios (id_empresa, numero_cuenta, fecha, fecha_aplicado, documento, concepto, monto, cargo, abono, cod_remesa, tipo_destino, cod_cta, llave) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id_empresa, numero_cuenta, formattedDate, formattedFechaAplicado, documento || '', (concepto || '').toUpperCase(), monto, cargo, abono, cod_remesa || null, tipo_destino || null, cod_cta || null, llave]
        );
        res.status(201).json({ message: 'Movimiento registrado exitosamente', llave });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar movimiento', error: error.message });
    }
});

router.put('/movimientos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { 
        id_empresa, numero_cuenta, fecha, fecha_aplicado, documento, concepto, 
        monto, tipo, cod_remesa, tipo_destino, cod_cta 
    } = req.body;

    const cargo = tipo === 'CARGO' ? monto : 0;
    const abono = tipo === 'ABONO' ? monto : 0;

    try {
        const externalDb = await getExternalDb();
        
        const formatDate = (dateStr) => {
            if (!dateStr) return null;
            const d = new Date(dateStr + 'T12:00:00');
            return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        };

        const formattedDate = formatDate(fecha);
        const formattedFechaAplicado = formatDate(fecha_aplicado);

        await externalDb.query(
            'UPDATE movimientos_bancarios ' +
            'SET id_empresa = ?, numero_cuenta = ?, fecha = ?, fecha_aplicado = ?, documento = ?, ' +
            '    concepto = ?, monto = ?, cargo = ?, abono = ?, cod_remesa = ?, ' +
            '    tipo_destino = ?, cod_cta = ? ' +
            'WHERE id = ?',
            [id_empresa, numero_cuenta, formattedDate, formattedFechaAplicado, documento || '', (concepto || '').toUpperCase(), monto, cargo, abono, cod_remesa || null, tipo_destino || null, cod_cta || null, id]
        );
        res.json({ message: 'Movimiento actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar movimiento', error: error.message });
    }
});

router.delete('/movimientos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const externalDb = await getExternalDb();
        await externalDb.query('DELETE FROM movimientos_bancarios WHERE id = ?', [id]);
        res.json({ message: 'Movimiento eliminado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al eliminar movimiento', error: error.message });
    }
});

module.exports = router;
