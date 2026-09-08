const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// --- Helper Functions ---
const calculatePMT = (principal, annualRate, termMonths, frequency = 'mensual') => {
    const P = parseFloat(principal);
    const rate = parseFloat(annualRate);
    const nMonths = parseInt(termMonths, 10);
    if (!P || P <= 0 || !rate || rate <= 0 || !nMonths || nMonths <= 0) return 0;

    let periodsPerYear = 12;
    let totalPeriods = nMonths;
    if (frequency === 'quincenal') {
        periodsPerYear = 24;
        totalPeriods = Math.round(nMonths * 2);
    } else if (frequency === 'semanal') {
        periodsPerYear = 52;
        totalPeriods = Math.round(nMonths * 4.3333);
    }

    const r = (rate / 100) / periodsPerYear;
    const pmt = (P * r * Math.pow(1 + r, totalPeriods)) / (Math.pow(1 + r, totalPeriods) - 1);
    return Math.round(pmt * 100) / 100;
};

// --- GET /catalogos ---
router.get('/catalogos', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [empresas] = await db.query('SELECT id, codigo, nombre FROM empresas ORDER BY nombre ASC');
        const [bancos] = await db.query('SELECT id, empresa_id, codigo, descripcion FROM bancos ORDER BY descripcion ASC');
        const [cuentas] = await db.query(`
            SELECT c.id, c.empresa_id, c.banco_id, c.numero, c.nombre, b.descripcion as banco_nombre
            FROM cuentas_bancarias c
            LEFT JOIN bancos b ON c.banco_id = b.id
            WHERE c.activa = TRUE
            ORDER BY c.nombre ASC
        `);

        res.json({ empresas, bancos, cuentas });
    } catch (error) {
        console.error('Error fetching finanzas catalogos:', error);
        res.status(500).json({ message: 'Error al obtener catálogos', error: error.message });
    }
});

// --- GET /prestamos ---
router.get('/prestamos', authenticateToken, async (req, res) => {
    const { empresa_id, estado, search } = req.query;
    try {
        const db = getDb();
        let query = `
            SELECT 
                p.*,
                e.nombre AS empresa_nombre,
                e.codigo AS empresa_codigo,
                b.descripcion AS banco_nombre,
                cb.numero AS cuenta_numero,
                cb.nombre AS cuenta_nombre,
                COALESCE(SUM(pp.monto_capital), 0) AS total_capital_pagado,
                COALESCE(SUM(pp.monto_interes), 0) AS total_interes_pagado,
                COALESCE(SUM(pp.monto_total), 0) AS total_pagado,
                COUNT(pp.id) AS pagos_realizados_count,
                MAX(pp.fecha_pago) AS ultimo_pago_fecha,
                (p.monto_original - COALESCE(SUM(pp.monto_capital), 0)) AS saldo_actual
            FROM prestamos p
            LEFT JOIN empresas e ON p.empresa_id = e.id
            LEFT JOIN bancos b ON p.banco_id = b.id
            LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
            LEFT JOIN prestamos_pagos pp ON p.id = pp.prestamo_id
            WHERE 1=1
        `;

        const params = [];

        if (empresa_id) {
            query += ' AND p.empresa_id = ?';
            params.push(empresa_id);
        }

        if (estado && estado !== 'todos') {
            query += ' AND p.estado = ?';
            params.push(estado);
        }

        if (search) {
            query += ' AND (p.numero_prestamo LIKE ? OR p.descripcion LIKE ? OR b.descripcion LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        query += ' GROUP BY p.id ORDER BY p.fecha_inicio DESC, p.id DESC';

        const [rows] = await db.query(query, params);

        // Process rows and determine estimated next due date
        const formatted = rows.map(r => {
            const saldo = Math.max(0, parseFloat(r.saldo_actual) || 0);
            return {
                ...r,
                monto_original: parseFloat(r.monto_original),
                tasa_interes_anual: parseFloat(r.tasa_interes_anual),
                cuota_calculada: parseFloat(r.cuota_calculada),
                total_capital_pagado: parseFloat(r.total_capital_pagado),
                total_interes_pagado: parseFloat(r.total_interes_pagado),
                total_pagado: parseFloat(r.total_pagado),
                saldo_actual: saldo,
                porcentaje_amortizado: r.monto_original > 0 
                    ? Math.min(100, Math.round(((r.monto_original - saldo) / r.monto_original) * 10000) / 100) 
                    : 0
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error('Error fetching prestamos:', error);
        res.status(500).json({ message: 'Error al listar préstamos', error: error.message });
    }
});

// --- GET /prestamos/:id ---
router.get('/prestamos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        const [rows] = await db.query(`
            SELECT 
                p.*,
                e.nombre AS empresa_nombre,
                e.codigo AS empresa_codigo,
                b.descripcion AS banco_nombre,
                cb.numero AS cuenta_numero,
                cb.nombre AS cuenta_nombre
            FROM prestamos p
            LEFT JOIN empresas e ON p.empresa_id = e.id
            LEFT JOIN bancos b ON p.banco_id = b.id
            LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
            WHERE p.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Préstamo no encontrado' });
        }

        const prestamo = rows[0];

        // Fetch payments
        const [pagos] = await db.query(`
            SELECT 
                pp.*,
                cb.numero AS cuenta_origen_numero,
                cb.nombre AS cuenta_origen_nombre,
                u.nombre AS usuario_registro
            FROM prestamos_pagos pp
            LEFT JOIN cuentas_bancarias cb ON pp.cuenta_origen_id = cb.id
            LEFT JOIN users u ON pp.created_by = u.id
            WHERE pp.prestamo_id = ?
            ORDER BY pp.fecha_pago ASC, pp.id ASC
        `, [id]);

        // Aggregate numbers
        const totalCapitalPagado = pagos.reduce((acc, p) => acc + parseFloat(p.monto_capital || 0), 0);
        const totalInteresPagado = pagos.reduce((acc, p) => acc + parseFloat(p.monto_interes || 0), 0);
        const totalPagado = pagos.reduce((acc, p) => acc + parseFloat(p.monto_total || 0), 0);
        const saldoActual = Math.max(0, parseFloat(prestamo.monto_original) - totalCapitalPagado);

        res.json({
            ...prestamo,
            monto_original: parseFloat(prestamo.monto_original),
            tasa_interes_anual: parseFloat(prestamo.tasa_interes_anual),
            cuota_calculada: parseFloat(prestamo.cuota_calculada),
            total_capital_pagado: totalCapitalPagado,
            total_interes_pagado: totalInteresPagado,
            total_pagado: totalPagado,
            saldo_actual: saldoActual,
            porcentaje_amortizado: prestamo.monto_original > 0 
                ? Math.min(100, Math.round(((prestamo.monto_original - saldoActual) / prestamo.monto_original) * 10000) / 100) 
                : 0,
            pagos: pagos.map(p => ({
                ...p,
                monto_total: parseFloat(p.monto_total),
                monto_capital: parseFloat(p.monto_capital),
                monto_interes: parseFloat(p.monto_interes),
                monto_otros: parseFloat(p.monto_otros),
                saldo_restante: parseFloat(p.saldo_restante)
            }))
        });
    } catch (error) {
        console.error('Error fetching prestamo detail:', error);
        res.status(500).json({ message: 'Error al obtener detalle del préstamo', error: error.message });
    }
});

// --- POST /prestamos ---
router.post('/prestamos', authenticateToken, async (req, res) => {
    const {
        empresa_id,
        banco_id,
        cuenta_bancaria_id,
        numero_prestamo,
        descripcion,
        monto_original,
        tasa_interes_anual,
        plazo_meses,
        frecuencia_pago = 'mensual',
        fecha_inicio,
        fecha_primer_pago,
        cuota_calculada,
        dias_gracia = 0,
        notas
    } = req.body;

    if (!empresa_id || !numero_prestamo || !descripcion || !monto_original || !tasa_interes_anual || !plazo_meses || !fecha_inicio || !fecha_primer_pago) {
        return res.status(400).json({ message: 'Todos los campos obligatorios deben ser completados' });
    }

    try {
        const db = getDb();
        const cuota = parseFloat(cuota_calculada) || calculatePMT(monto_original, tasa_interes_anual, plazo_meses, frecuencia_pago);

        const [result] = await db.query(`
            INSERT INTO prestamos (
                empresa_id, banco_id, cuenta_bancaria_id, numero_prestamo, descripcion,
                monto_original, tasa_interes_anual, plazo_meses, frecuencia_pago,
                fecha_inicio, fecha_primer_pago, cuota_calculada, dias_gracia,
                estado, notas, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?)
        `, [
            empresa_id,
            banco_id || null,
            cuenta_bancaria_id || null,
            numero_prestamo.trim().toUpperCase(),
            descripcion.trim().toUpperCase(),
            parseFloat(monto_original),
            parseFloat(tasa_interes_anual),
            parseInt(plazo_meses, 10),
            frecuencia_pago,
            fecha_inicio,
            fecha_primer_pago,
            cuota,
            parseInt(dias_gracia || 0, 10),
            notas || null,
            req.user?.id || null
        ]);

        res.status(201).json({ message: 'Préstamo registrado exitosamente', id: result.insertId, cuota_calculada: cuota });
    } catch (error) {
        console.error('Error creating prestamo:', error);
        res.status(500).json({ message: 'Error al registrar préstamo', error: error.message });
    }
});

// --- PUT /prestamos/:id ---
router.put('/prestamos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const {
        empresa_id,
        banco_id,
        cuenta_bancaria_id,
        numero_prestamo,
        descripcion,
        monto_original,
        tasa_interes_anual,
        plazo_meses,
        frecuencia_pago,
        fecha_inicio,
        fecha_primer_pago,
        cuota_calculada,
        dias_gracia,
        estado,
        notas
    } = req.body;

    try {
        const db = getDb();
        const cuota = parseFloat(cuota_calculada) || calculatePMT(monto_original, tasa_interes_anual, plazo_meses, frecuencia_pago);

        await db.query(`
            UPDATE prestamos SET
                empresa_id = ?,
                banco_id = ?,
                cuenta_bancaria_id = ?,
                numero_prestamo = ?,
                descripcion = ?,
                monto_original = ?,
                tasa_interes_anual = ?,
                plazo_meses = ?,
                frecuencia_pago = ?,
                fecha_inicio = ?,
                fecha_primer_pago = ?,
                cuota_calculada = ?,
                dias_gracia = ?,
                estado = ?,
                notas = ?
            WHERE id = ?
        `, [
            empresa_id,
            banco_id || null,
            cuenta_bancaria_id || null,
            numero_prestamo ? numero_prestamo.trim().toUpperCase() : '',
            descripcion ? descripcion.trim().toUpperCase() : '',
            parseFloat(monto_original),
            parseFloat(tasa_interes_anual),
            parseInt(plazo_meses, 10),
            frecuencia_pago || 'mensual',
            fecha_inicio,
            fecha_primer_pago,
            cuota,
            parseInt(dias_gracia || 0, 10),
            estado || 'activo',
            notas || null,
            id
        ]);

        res.json({ message: 'Préstamo actualizado exitosamente' });
    } catch (error) {
        console.error('Error updating prestamo:', error);
        res.status(500).json({ message: 'Error al actualizar préstamo', error: error.message });
    }
});

// --- DELETE /prestamos/:id ---
router.delete('/prestamos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        // Check if has payments
        const [pagos] = await db.query('SELECT id FROM prestamos_pagos WHERE prestamo_id = ?', [id]);
        if (pagos.length > 0) {
            // Update state to cancelado rather than hard delete if has history
            await db.query('UPDATE prestamos SET estado = "cancelado" WHERE id = ?', [id]);
            return res.json({ message: 'Préstamo marcado como cancelado debido a pagos registrados' });
        }

        await db.query('DELETE FROM prestamos WHERE id = ?', [id]);
        res.json({ message: 'Préstamo eliminado exitosamente' });
    } catch (error) {
        console.error('Error deleting prestamo:', error);
        res.status(500).json({ message: 'Error al eliminar préstamo', error: error.message });
    }
});

// --- POST /prestamos/:id/pagos ---
router.post('/prestamos/:id/pagos', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const {
        numero_cuota,
        fecha_pago,
        tipo_pago = 'cuota_regular',
        monto_total,
        monto_capital,
        monto_interes = 0,
        monto_otros = 0,
        numero_comprobante,
        cuenta_origen_id,
        notas
    } = req.body;

    if (!fecha_pago || !monto_total || parseFloat(monto_total) <= 0 || !monto_capital || parseFloat(monto_capital) <= 0) {
        return res.status(400).json({ message: 'Debe ingresar fecha y montos válidos de pago y capital' });
    }

    try {
        const db = getDb();
        const [pRows] = await db.query('SELECT * FROM prestamos WHERE id = ?', [id]);
        if (pRows.length === 0) return res.status(404).json({ message: 'Préstamo no encontrado' });
        const prestamo = pRows[0];

        // Get current capital paid so far
        const [sumRows] = await db.query('SELECT COALESCE(SUM(monto_capital), 0) as pagado FROM prestamos_pagos WHERE prestamo_id = ?', [id]);
        const capitalPagadoAnterior = parseFloat(sumRows[0].pagado || 0);
        const saldoAnterior = Math.max(0, parseFloat(prestamo.monto_original) - capitalPagadoAnterior);

        const capitalAbonado = parseFloat(monto_capital);
        const nuevoSaldo = Math.max(0, Math.round((saldoAnterior - capitalAbonado) * 100) / 100);

        const [result] = await db.query(`
            INSERT INTO prestamos_pagos (
                prestamo_id, numero_cuota, fecha_pago, tipo_pago,
                monto_total, monto_capital, monto_interes, monto_otros,
                saldo_restante, numero_comprobante, cuenta_origen_id,
                notas, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            numero_cuota || null,
            fecha_pago,
            tipo_pago,
            parseFloat(monto_total),
            capitalAbonado,
            parseFloat(monto_interes || 0),
            parseFloat(monto_otros || 0),
            nuevoSaldo,
            numero_comprobante ? numero_comprobante.trim().toUpperCase() : null,
            cuenta_origen_id || null,
            notas || null,
            req.user?.id || null
        ]);

        // If loan is settled, update status
        if (nuevoSaldo <= 0.05) {
            await db.query('UPDATE prestamos SET estado = "pagado" WHERE id = ?', [id]);
        }

        res.status(201).json({
            message: 'Pago registrado exitosamente',
            id: result.insertId,
            saldo_restante: nuevoSaldo,
            liquidado: nuevoSaldo <= 0.05
        });
    } catch (error) {
        console.error('Error creating pago:', error);
        res.status(500).json({ message: 'Error al registrar pago', error: error.message });
    }
});

// --- DELETE /pagos/:pagoId ---
router.delete('/pagos/:pagoId', authenticateToken, async (req, res) => {
    const { pagoId } = req.params;
    try {
        const db = getDb();
        const [pagoRows] = await db.query('SELECT prestamo_id FROM prestamos_pagos WHERE id = ?', [pagoId]);
        if (pagoRows.length === 0) return res.status(404).json({ message: 'Pago no encontrado' });
        const prestamoId = pagoRows[0].prestamo_id;

        await db.query('DELETE FROM prestamos_pagos WHERE id = ?', [pagoId]);

        // Check if balance still has unpaid balance, restore to activo
        const [pRows] = await db.query('SELECT monto_original FROM prestamos WHERE id = ?', [prestamoId]);
        if (pRows.length > 0) {
            const [sumRows] = await db.query('SELECT COALESCE(SUM(monto_capital), 0) as pagado FROM prestamos_pagos WHERE prestamo_id = ?', [prestamoId]);
            const saldo = parseFloat(pRows[0].monto_original) - parseFloat(sumRows[0].pagado);
            if (saldo > 0.05) {
                await db.query('UPDATE prestamos SET estado = "activo" WHERE id = ?', [prestamoId]);
            }
        }

        res.json({ message: 'Pago revertido exitosamente' });
    } catch (error) {
        console.error('Error deleting pago:', error);
        res.status(500).json({ message: 'Error al revertir pago', error: error.message });
    }
});

// --- GET /resumen ---
router.get('/resumen', authenticateToken, async (req, res) => {
    try {
        const db = getDb();

        // 1. Overall stats
        const [statsRows] = await db.query(`
            SELECT 
                COUNT(*) AS total_prestamos,
                SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END) AS prestamos_activos,
                SUM(CASE WHEN estado = 'pagado' THEN 1 ELSE 0 END) AS prestamos_pagados,
                COALESCE(SUM(monto_original), 0) AS total_monto_contratado,
                COALESCE(SUM(CASE WHEN estado = 'activo' THEN cuota_calculada ELSE 0 END), 0) AS cuota_mensual_total
            FROM prestamos
            WHERE estado != 'cancelado'
        `);

        // 2. Payments aggregate
        const [paymentsRows] = await db.query(`
            SELECT 
                COALESCE(SUM(pp.monto_capital), 0) AS total_capital_amortizado,
                COALESCE(SUM(pp.monto_interes), 0) AS total_interes_pagado
            FROM prestamos_pagos pp
            INNER JOIN prestamos p ON pp.prestamo_id = p.id
            WHERE p.estado != 'cancelado'
        `);

        const totalContratado = parseFloat(statsRows[0].total_monto_contratado || 0);
        const totalAmortizado = parseFloat(paymentsRows[0].total_capital_amortizado || 0);
        const totalInteres = parseFloat(paymentsRows[0].total_interes_pagado || 0);
        const saldoTotal = Math.max(0, totalContratado - totalAmortizado);

        // 3. Debt by Company
        const [byCompany] = await db.query(`
            SELECT 
                e.id,
                e.nombre AS empresa_nombre,
                e.codigo AS empresa_codigo,
                COUNT(p.id) AS cantidad_prestamos,
                COALESCE(SUM(p.monto_original), 0) AS monto_original,
                COALESCE(SUM(pp.monto_capital), 0) AS capital_pagado,
                (COALESCE(SUM(p.monto_original), 0) - COALESCE(SUM(pp.monto_capital), 0)) AS saldo_deudor
            FROM prestamos p
            INNER JOIN empresas e ON p.empresa_id = e.id
            LEFT JOIN prestamos_pagos pp ON p.id = pp.prestamo_id
            WHERE p.estado = 'activo'
            GROUP BY e.id, e.nombre, e.codigo
            ORDER BY saldo_deudor DESC
        `);

        // 4. Debt by Bank
        const [byBank] = await db.query(`
            SELECT 
                COALESCE(b.id, 0) as banco_id,
                COALESCE(b.descripcion, 'SIN BANCO / OTROS') AS banco_nombre,
                COUNT(p.id) AS cantidad_prestamos,
                COALESCE(SUM(p.monto_original), 0) AS monto_original,
                (COALESCE(SUM(p.monto_original), 0) - COALESCE(SUM(pp.monto_capital), 0)) AS saldo_deudor
            FROM prestamos p
            LEFT JOIN bancos b ON p.banco_id = b.id
            LEFT JOIN prestamos_pagos pp ON p.id = pp.prestamo_id
            WHERE p.estado = 'activo'
            GROUP BY b.id, b.descripcion
            ORDER BY saldo_deudor DESC
        `);

        // 5. Active loans list with current balance and next due date
        const [activeLoans] = await db.query(`
            SELECT 
                p.id,
                p.numero_prestamo,
                p.descripcion,
                p.cuota_calculada,
                p.fecha_primer_pago,
                p.monto_original,
                e.nombre AS empresa_nombre,
                b.descripcion AS banco_nombre,
                (p.monto_original - COALESCE(SUM(pp.monto_capital), 0)) AS saldo_actual,
                MAX(pp.fecha_pago) AS ultimo_pago
            FROM prestamos p
            LEFT JOIN empresas e ON p.empresa_id = e.id
            LEFT JOIN bancos b ON p.banco_id = b.id
            LEFT JOIN prestamos_pagos pp ON p.id = pp.prestamo_id
            WHERE p.estado = 'activo'
            GROUP BY p.id
            ORDER BY p.cuota_calculada DESC
        `);

        res.json({
            kpi: {
                total_prestamos: statsRows[0].total_prestamos,
                prestamos_activos: statsRows[0].prestamos_activos,
                prestamos_pagados: statsRows[0].prestamos_pagados,
                total_monto_contratado: totalContratado,
                total_capital_amortizado: totalAmortizado,
                total_interes_pagado: totalInteres,
                saldo_total_pendiente: saldoTotal,
                cuota_mensual_total: parseFloat(statsRows[0].cuota_mensual_total || 0)
            },
            por_empresa: byCompany.map(c => ({
                ...c,
                monto_original: parseFloat(c.monto_original),
                capital_pagado: parseFloat(c.capital_pagado),
                saldo_deudor: Math.max(0, parseFloat(c.saldo_deudor))
            })),
            por_banco: byBank.map(b => ({
                ...b,
                monto_original: parseFloat(b.monto_original),
                saldo_deudor: Math.max(0, parseFloat(b.saldo_deudor))
            })),
            prestamos_activos: activeLoans.map(l => ({
                ...l,
                cuota_calculada: parseFloat(l.cuota_calculada),
                saldo_actual: Math.max(0, parseFloat(l.saldo_actual))
            }))
        });
    } catch (error) {
        console.error('Error fetching finanzas resumen:', error);
        res.status(500).json({ message: 'Error al obtener resumen de finanzas', error: error.message });
    }
});

module.exports = router;
