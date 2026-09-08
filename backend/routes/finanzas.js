const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// --- Helper Functions ---
let tablesEnsured = false;
const ensureFinanzasTables = async (db) => {
    if (tablesEnsured) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS prestamos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                banco_id INT NULL,
                cuenta_bancaria_id INT NULL,
                numero_prestamo VARCHAR(50) NOT NULL UNIQUE,
                descripcion VARCHAR(255) NOT NULL,
                monto_original DECIMAL(14,2) NOT NULL,
                tasa_interes_anual DECIMAL(6,3) NOT NULL,
                plazo_meses INT NOT NULL,
                frecuencia_pago VARCHAR(20) DEFAULT 'mensual',
                fecha_inicio DATE NOT NULL,
                fecha_primer_pago DATE NOT NULL,
                cuota_calculada DECIMAL(14,2) NOT NULL,
                seguro_tipo VARCHAR(30) DEFAULT 'ninguno',
                seguro_valor DECIMAL(10,4) DEFAULT 0,
                seguro_cuota DECIMAL(10,2) DEFAULT 0,
                ahorro_tipo VARCHAR(30) DEFAULT 'ninguno',
                ahorro_valor DECIMAL(10,4) DEFAULT 0,
                ahorro_cuota DECIMAL(10,2) DEFAULT 0,
                cuota_total DECIMAL(14,2) DEFAULT 0,
                comision_tipo VARCHAR(30) DEFAULT 'none',
                comision_valor DECIMAL(10,4) DEFAULT 0,
                comision_monto DECIMAL(14,2) DEFAULT 0,
                monto_neto_desembolsado DECIMAL(14,2) DEFAULT 0,
                dias_gracia INT DEFAULT 0,
                estado VARCHAR(20) DEFAULT 'activo',
                notas TEXT,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_empresa_estado (empresa_id, estado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        try { await db.query("ALTER TABLE prestamos ADD COLUMN comision_tipo VARCHAR(30) DEFAULT 'none'"); } catch(e) { /* column exists */ }
        try { await db.query("ALTER TABLE prestamos ADD COLUMN comision_valor DECIMAL(10,4) DEFAULT 0"); } catch(e) { /* column exists */ }
        try { await db.query("ALTER TABLE prestamos ADD COLUMN comision_monto DECIMAL(14,2) DEFAULT 0"); } catch(e) { /* column exists */ }
        try { await db.query("ALTER TABLE prestamos ADD COLUMN monto_neto_desembolsado DECIMAL(14,2) DEFAULT 0"); } catch(e) { /* column exists */ }

        await db.query(`
            CREATE TABLE IF NOT EXISTS prestamos_pagos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                prestamo_id INT NOT NULL,
                numero_cuota INT NULL,
                fecha_pago DATE NOT NULL,
                tipo_pago ENUM('regular', 'capital_extra', 'cancelacion_total') DEFAULT 'regular',
                monto_total DECIMAL(14,2) NOT NULL,
                monto_capital DECIMAL(14,2) NOT NULL,
                monto_interes DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                monto_seguro DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                monto_ahorro DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                monto_otros DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                saldo_restante DECIMAL(14,2) NOT NULL,
                numero_comprobante VARCHAR(50) NULL,
                cuenta_origen_id INT NULL,
                notas TEXT,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_prestamo_fecha (prestamo_id, fecha_pago)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS finanzas_proyectos_inversion (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                nombre_proyecto VARCHAR(150) NOT NULL,
                descripcion TEXT,
                categoria VARCHAR(50) DEFAULT 'general',
                inversion_inicial DECIMAL(14,2) NOT NULL,
                tasa_descuento DECIMAL(6,3) NOT NULL DEFAULT 10.000,
                plazo_anios INT NOT NULL DEFAULT 5,
                valor_residual DECIMAL(14,2) DEFAULT 0.00,
                roi_estimado DECIMAL(8,2) DEFAULT 0.00,
                vpn_estimado DECIMAL(14,2) DEFAULT 0.00,
                tir_estimada DECIMAL(8,2) NULL,
                payback_meses DECIMAL(8,2) DEFAULT 0.00,
                payback_descontado_meses DECIMAL(8,2) DEFAULT 0.00,
                relacion_bc DECIMAL(8,2) DEFAULT 0.00,
                flujos_json JSON NULL,
                estado VARCHAR(30) DEFAULT 'evaluacion',
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_proyecto_empresa (empresa_id, estado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS finanzas_planes_mantenimiento (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                nombre_activo VARCHAR(150) NOT NULL,
                tipo_activo VARCHAR(80) NOT NULL,
                costo_estimado DECIMAL(14,2) NOT NULL,
                tipo_gasto VARCHAR(30) DEFAULT 'preventivo',
                frecuencia VARCHAR(30) DEFAULT 'anual',
                fecha_programada DATE NOT NULL,
                fecha_ejecutada DATE NULL,
                responsable VARCHAR(120) NULL,
                proveedor VARCHAR(150) NULL,
                criticidad VARCHAR(20) DEFAULT 'media',
                estado VARCHAR(30) DEFAULT 'programado',
                notas TEXT NULL,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_mantenimiento_empresa (empresa_id, estado, fecha_programada)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        try {
            const [cols] = await db.query("SHOW COLUMNS FROM prestamos LIKE 'seguro_tipo'");
            if (cols.length === 0) {
                await db.query(`
                    ALTER TABLE prestamos
                    ADD COLUMN seguro_tipo VARCHAR(30) DEFAULT 'ninguno',
                    ADD COLUMN seguro_valor DECIMAL(10,4) DEFAULT 0,
                    ADD COLUMN seguro_cuota DECIMAL(10,2) DEFAULT 0,
                    ADD COLUMN ahorro_tipo VARCHAR(30) DEFAULT 'ninguno',
                    ADD COLUMN ahorro_valor DECIMAL(10,4) DEFAULT 0,
                    ADD COLUMN ahorro_cuota DECIMAL(10,2) DEFAULT 0,
                    ADD COLUMN cuota_total DECIMAL(14,2) DEFAULT 0
                `);
            }
            const [pCols] = await db.query("SHOW COLUMNS FROM prestamos_pagos LIKE 'monto_seguro'");
            if (pCols.length === 0) {
                await db.query(`
                    ALTER TABLE prestamos_pagos
                    ADD COLUMN monto_seguro DECIMAL(14,2) DEFAULT 0.00 AFTER monto_interes,
                    ADD COLUMN monto_ahorro DECIMAL(14,2) DEFAULT 0.00 AFTER monto_seguro
                `);
            }
        } catch (colErr) {
            console.warn('Migration columns check in finanzas:', colErr.message);
        }

        tablesEnsured = true;
    } catch (err) {
        console.error('ensureFinanzasTables error:', err);
    }
};

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
        await ensureFinanzasTables(db);
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
        await ensureFinanzasTables(db);
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
                seguro_tipo: r.seguro_tipo || 'ninguno',
                seguro_valor: parseFloat(r.seguro_valor || 0),
                seguro_cuota: parseFloat(r.seguro_cuota || 0),
                ahorro_tipo: r.ahorro_tipo || 'ninguno',
                ahorro_valor: parseFloat(r.ahorro_valor || 0),
                ahorro_cuota: parseFloat(r.ahorro_cuota || 0),
                cuota_total: parseFloat(r.cuota_total || r.cuota_calculada),
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
        await ensureFinanzasTables(db);
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
            seguro_tipo: prestamo.seguro_tipo || 'ninguno',
            seguro_valor: parseFloat(prestamo.seguro_valor || 0),
            seguro_cuota: parseFloat(prestamo.seguro_cuota || 0),
            ahorro_tipo: prestamo.ahorro_tipo || 'ninguno',
            ahorro_valor: parseFloat(prestamo.ahorro_valor || 0),
            ahorro_cuota: parseFloat(prestamo.ahorro_cuota || 0),
            cuota_total: parseFloat(prestamo.cuota_total || prestamo.cuota_calculada),
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
                monto_seguro: parseFloat(p.monto_seguro || 0),
                monto_ahorro: parseFloat(p.monto_ahorro || 0),
                monto_otros: parseFloat(p.monto_otros || 0),
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
        seguro_tipo = 'ninguno',
        seguro_valor = 0,
        seguro_cuota = 0,
        ahorro_tipo = 'ninguno',
        ahorro_valor = 0,
        ahorro_cuota = 0,
        cuota_total = 0,
        comision_tipo = 'none',
        comision_valor = 0,
        comision_monto = 0,
        monto_neto_desembolsado = 0,
        dias_gracia = 0,
        notas
    } = req.body;

    if (!empresa_id || !numero_prestamo || !descripcion || !monto_original || !tasa_interes_anual || !plazo_meses || !fecha_inicio || !fecha_primer_pago) {
        return res.status(400).json({ message: 'Todos los campos obligatorios deben ser completados' });
    }

    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const cuota = parseFloat(cuota_calculada) || calculatePMT(monto_original, tasa_interes_anual, plazo_meses, frecuencia_pago);
        const segCuota = parseFloat(seguro_cuota) || 0;
        const ahorrCuota = parseFloat(ahorro_cuota) || 0;
        const totalCuota = parseFloat(cuota_total) || Math.round((cuota + segCuota + ahorrCuota) * 100) / 100;
        const P = parseFloat(monto_original);
        const comVal = parseFloat(comision_valor || 0);
        let comMonto = parseFloat(comision_monto || 0);
        if (comMonto === 0 && comision_tipo === 'percent' && comVal > 0) {
            comMonto = Math.round((P * (comVal / 100)) * 100) / 100;
        } else if (comMonto === 0 && comision_tipo === 'fixed' && comVal > 0) {
            comMonto = Math.round(comVal * 100) / 100;
        }
        const neto = parseFloat(monto_neto_desembolsado) || Math.max(0, P - comMonto);

        const [result] = await db.query(`
            INSERT INTO prestamos (
                empresa_id, banco_id, cuenta_bancaria_id, numero_prestamo, descripcion,
                monto_original, tasa_interes_anual, plazo_meses, frecuencia_pago,
                fecha_inicio, fecha_primer_pago, cuota_calculada,
                seguro_tipo, seguro_valor, seguro_cuota,
                ahorro_tipo, ahorro_valor, ahorro_cuota, cuota_total,
                comision_tipo, comision_valor, comision_monto, monto_neto_desembolsado,
                dias_gracia, estado, notas, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?)
        `, [
            empresa_id,
            banco_id || null,
            cuenta_bancaria_id || null,
            numero_prestamo.trim().toUpperCase(),
            descripcion.trim().toUpperCase(),
            P,
            parseFloat(tasa_interes_anual),
            parseInt(plazo_meses, 10),
            frecuencia_pago,
            fecha_inicio,
            fecha_primer_pago,
            cuota,
            seguro_tipo,
            parseFloat(seguro_valor || 0),
            segCuota,
            ahorro_tipo,
            parseFloat(ahorro_valor || 0),
            ahorrCuota,
            totalCuota,
            comision_tipo,
            comVal,
            comMonto,
            neto,
            parseInt(dias_gracia || 0, 10),
            notas || null,
            req.user?.id || null
        ]);

        res.status(201).json({ message: 'Préstamo registrado exitosamente', id: result.insertId, cuota_calculada: cuota, cuota_total: totalCuota });
    } catch (error) {
        console.error('Error creating prestamo:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: `El número de préstamo "${numero_prestamo}" ya se encuentra registrado`, error: error.message });
        }
        res.status(500).json({ message: 'Error al registrar préstamo: ' + error.message, error: error.message });
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
        seguro_tipo,
        seguro_valor,
        seguro_cuota,
        ahorro_tipo,
        ahorro_valor,
        ahorro_cuota,
        cuota_total,
        comision_tipo,
        comision_valor,
        comision_monto,
        monto_neto_desembolsado,
        dias_gracia,
        estado,
        notas
    } = req.body;

    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const cuota = parseFloat(cuota_calculada) || calculatePMT(monto_original, tasa_interes_anual, plazo_meses, frecuencia_pago);
        const segCuota = parseFloat(seguro_cuota) || 0;
        const ahorrCuota = parseFloat(ahorro_cuota) || 0;
        const totalCuota = parseFloat(cuota_total) || Math.round((cuota + segCuota + ahorrCuota) * 100) / 100;
        const P = parseFloat(monto_original);
        const comVal = parseFloat(comision_valor || 0);
        let comMonto = parseFloat(comision_monto || 0);
        if (comMonto === 0 && comision_tipo === 'percent' && comVal > 0) {
            comMonto = Math.round((P * (comVal / 100)) * 100) / 100;
        } else if (comMonto === 0 && comision_tipo === 'fixed' && comVal > 0) {
            comMonto = Math.round(comVal * 100) / 100;
        }
        const neto = parseFloat(monto_neto_desembolsado) || Math.max(0, P - comMonto);

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
                seguro_tipo = ?,
                seguro_valor = ?,
                seguro_cuota = ?,
                ahorro_tipo = ?,
                ahorro_valor = ?,
                ahorro_cuota = ?,
                cuota_total = ?,
                comision_tipo = ?,
                comision_valor = ?,
                comision_monto = ?,
                monto_neto_desembolsado = ?,
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
            seguro_tipo || 'ninguno',
            parseFloat(seguro_valor || 0),
            segCuota,
            ahorro_tipo || 'ninguno',
            parseFloat(ahorro_valor || 0),
            ahorrCuota,
            totalCuota,
            comision_tipo || 'none',
            comVal,
            comMonto,
            neto,
            parseInt(dias_gracia || 0, 10),
            estado || 'activo',
            notas || null,
            id
        ]);

        res.json({ message: 'Préstamo actualizado exitosamente' });
    } catch (error) {
        console.error('Error updating prestamo:', error);
        res.status(500).json({ message: 'Error al actualizar préstamo: ' + error.message, error: error.message });
    }
});

// --- DELETE /prestamos/:id ---
router.delete('/prestamos/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
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
        res.status(500).json({ message: 'Error al eliminar préstamo: ' + error.message, error: error.message });
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
        monto_seguro = 0,
        monto_ahorro = 0,
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
        await ensureFinanzasTables(db);
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
                monto_total, monto_capital, monto_interes, monto_seguro, monto_ahorro, monto_otros,
                saldo_restante, numero_comprobante, cuenta_origen_id,
                notas, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            numero_cuota || null,
            fecha_pago,
            tipo_pago,
            parseFloat(monto_total),
            capitalAbonado,
            parseFloat(monto_interes || 0),
            parseFloat(monto_seguro || 0),
            parseFloat(monto_ahorro || 0),
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

// ==========================================
// --- PROYECTOS DE INVERSIÓN Y RENTABILIDAD ---
// ==========================================

// GET /proyectos
router.get('/proyectos', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const { empresa_id, estado } = req.query;

        let query = `
            SELECT p.*, e.nombre AS empresa_nombre
            FROM finanzas_proyectos_inversion p
            LEFT JOIN empresas e ON p.empresa_id = e.id
            WHERE 1=1
        `;
        const params = [];

        if (empresa_id) {
            query += ' AND p.empresa_id = ?';
            params.push(empresa_id);
        }
        if (estado) {
            query += ' AND p.estado = ?';
            params.push(estado);
        }

        query += ' ORDER BY p.created_at DESC';

        const [rows] = await db.query(query, params);
        res.json(rows.map(r => ({
            ...r,
            inversion_inicial: parseFloat(r.inversion_inicial || 0),
            tasa_descuento: parseFloat(r.tasa_descuento || 0),
            valor_residual: parseFloat(r.valor_residual || 0),
            roi_estimado: parseFloat(r.roi_estimado || 0),
            vpn_estimado: parseFloat(r.vpn_estimado || 0),
            tir_estimada: r.tir_estimada !== null && r.tir_estimada !== undefined ? parseFloat(r.tir_estimada) : null,
            payback_meses: parseFloat(r.payback_meses || 0),
            payback_descontado_meses: parseFloat(r.payback_descontado_meses || 0),
            relacion_bc: parseFloat(r.relacion_bc || 0),
            flujos_json: typeof r.flujos_json === 'string' ? JSON.parse(r.flujos_json) : (r.flujos_json || [])
        })));
    } catch (error) {
        console.error('Error fetching proyectos:', error);
        res.status(500).json({ message: 'Error al obtener proyectos de inversión', error: error.message });
    }
});

// GET /proyectos/:id
router.get('/proyectos/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const { id } = req.params;

        const [rows] = await db.query(`
            SELECT p.*, e.nombre AS empresa_nombre
            FROM finanzas_proyectos_inversion p
            LEFT JOIN empresas e ON p.empresa_id = e.id
            WHERE p.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Proyecto no encontrado' });
        }

        const r = rows[0];
        res.json({
            ...r,
            inversion_inicial: parseFloat(r.inversion_inicial || 0),
            tasa_descuento: parseFloat(r.tasa_descuento || 0),
            valor_residual: parseFloat(r.valor_residual || 0),
            roi_estimado: parseFloat(r.roi_estimado || 0),
            vpn_estimado: parseFloat(r.vpn_estimado || 0),
            tir_estimada: r.tir_estimada !== null && r.tir_estimada !== undefined ? parseFloat(r.tir_estimada) : null,
            payback_meses: parseFloat(r.payback_meses || 0),
            payback_descontado_meses: parseFloat(r.payback_descontado_meses || 0),
            relacion_bc: parseFloat(r.relacion_bc || 0),
            flujos_json: typeof r.flujos_json === 'string' ? JSON.parse(r.flujos_json) : (r.flujos_json || [])
        });
    } catch (error) {
        console.error('Error fetching proyecto:', error);
        res.status(500).json({ message: 'Error al obtener detalle del proyecto', error: error.message });
    }
});

// POST /proyectos
router.post('/proyectos', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const {
            empresa_id,
            nombre_proyecto,
            descripcion,
            categoria,
            inversion_inicial,
            tasa_descuento,
            plazo_anios,
            valor_residual,
            roi_estimado,
            vpn_estimado,
            tir_estimada,
            payback_meses,
            payback_descontado_meses,
            relacion_bc,
            flujos_json,
            estado
        } = req.body;

        if (!empresa_id || !nombre_proyecto || !inversion_inicial) {
            return res.status(400).json({ message: 'Empresa, nombre de proyecto e inversión inicial son requeridos' });
        }

        const flujosStr = typeof flujos_json === 'object' ? JSON.stringify(flujos_json) : (flujos_json || '[]');

        const [result] = await db.query(`
            INSERT INTO finanzas_proyectos_inversion (
                empresa_id, nombre_proyecto, descripcion, categoria,
                inversion_inicial, tasa_descuento, plazo_anios, valor_residual,
                roi_estimado, vpn_estimado, tir_estimada, payback_meses,
                payback_descontado_meses, relacion_bc, flujos_json, estado, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            empresa_id,
            nombre_proyecto,
            descripcion || null,
            categoria || 'general',
            parseFloat(inversion_inicial),
            parseFloat(tasa_descuento || 10),
            parseInt(plazo_anios || 5, 10),
            parseFloat(valor_residual || 0),
            parseFloat(roi_estimado || 0),
            parseFloat(vpn_estimado || 0),
            tir_estimada !== null && tir_estimada !== undefined && tir_estimada !== '' ? parseFloat(tir_estimada) : null,
            parseFloat(payback_meses || 0),
            parseFloat(payback_descontado_meses || 0),
            parseFloat(relacion_bc || 0),
            flujosStr,
            estado || 'evaluacion',
            req.user?.id || null
        ]);

        res.status(201).json({ id: result.insertId, message: 'Proyecto registrado exitosamente' });
    } catch (error) {
        console.error('Error saving proyecto:', error);
        res.status(500).json({ message: 'Error al registrar proyecto de inversión', error: error.message });
    }
});

// PUT /proyectos/:id
router.put('/proyectos/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const { id } = req.params;
        const {
            empresa_id,
            nombre_proyecto,
            descripcion,
            categoria,
            inversion_inicial,
            tasa_descuento,
            plazo_anios,
            valor_residual,
            roi_estimado,
            vpn_estimado,
            tir_estimada,
            payback_meses,
            payback_descontado_meses,
            relacion_bc,
            flujos_json,
            estado
        } = req.body;

        const flujosStr = typeof flujos_json === 'object' ? JSON.stringify(flujos_json) : (flujos_json || '[]');

        await db.query(`
            UPDATE finanzas_proyectos_inversion SET
                empresa_id = ?,
                nombre_proyecto = ?,
                descripcion = ?,
                categoria = ?,
                inversion_inicial = ?,
                tasa_descuento = ?,
                plazo_anios = ?,
                valor_residual = ?,
                roi_estimado = ?,
                vpn_estimado = ?,
                tir_estimada = ?,
                payback_meses = ?,
                payback_descontado_meses = ?,
                relacion_bc = ?,
                flujos_json = ?,
                estado = ?
            WHERE id = ?
        `, [
            empresa_id,
            nombre_proyecto,
            descripcion || null,
            categoria || 'general',
            parseFloat(inversion_inicial),
            parseFloat(tasa_descuento || 10),
            parseInt(plazo_anios || 5, 10),
            parseFloat(valor_residual || 0),
            parseFloat(roi_estimado || 0),
            parseFloat(vpn_estimado || 0),
            tir_estimada !== null && tir_estimada !== undefined && tir_estimada !== '' ? parseFloat(tir_estimada) : null,
            parseFloat(payback_meses || 0),
            parseFloat(payback_descontado_meses || 0),
            parseFloat(relacion_bc || 0),
            flujosStr,
            estado || 'evaluacion',
            id
        ]);

        res.json({ message: 'Proyecto actualizado exitosamente' });
    } catch (error) {
        console.error('Error updating proyecto:', error);
        res.status(500).json({ message: 'Error al actualizar proyecto', error: error.message });
    }
});

// DELETE /proyectos/:id
router.delete('/proyectos/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const { id } = req.params;
        await db.query('DELETE FROM finanzas_proyectos_inversion WHERE id = ?', [id]);
        res.json({ message: 'Proyecto eliminado exitosamente' });
    } catch (error) {
        console.error('Error deleting proyecto:', error);
        res.status(500).json({ message: 'Error al eliminar proyecto', error: error.message });
    }
});

// ==========================================
// --- PLANES DE MANTENIMIENTO (CapEx vs OpEx) ---
// ==========================================

// GET /mantenimiento
router.get('/mantenimiento', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const { empresa_id, estado, tipo_gasto } = req.query;

        let query = `
            SELECT m.*, e.nombre AS empresa_nombre
            FROM finanzas_planes_mantenimiento m
            LEFT JOIN empresas e ON m.empresa_id = e.id
            WHERE 1=1
        `;
        const params = [];

        if (empresa_id) {
            query += ' AND m.empresa_id = ?';
            params.push(empresa_id);
        }
        if (estado) {
            query += ' AND m.estado = ?';
            params.push(estado);
        }
        if (tipo_gasto) {
            query += ' AND m.tipo_gasto = ?';
            params.push(tipo_gasto);
        }

        query += ' ORDER BY m.fecha_programada ASC';

        const [rows] = await db.query(query, params);
        res.json(rows.map(r => ({
            ...r,
            costo_estimado: parseFloat(r.costo_estimado || 0)
        })));
    } catch (error) {
        console.error('Error fetching mantenimiento:', error);
        res.status(500).json({ message: 'Error al obtener planes de mantenimiento', error: error.message });
    }
});

// POST /mantenimiento
router.post('/mantenimiento', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const {
            empresa_id,
            nombre_activo,
            tipo_activo,
            costo_estimado,
            tipo_gasto,
            frecuencia,
            fecha_programada,
            responsable,
            proveedor,
            criticidad,
            estado,
            notas
        } = req.body;

        if (!empresa_id || !nombre_activo || !costo_estimado || !fecha_programada) {
            return res.status(400).json({ message: 'Empresa, activo, costo y fecha programada son requeridos' });
        }

        const [result] = await db.query(`
            INSERT INTO finanzas_planes_mantenimiento (
                empresa_id, nombre_activo, tipo_activo, costo_estimado,
                tipo_gasto, frecuencia, fecha_programada, responsable,
                proveedor, criticidad, estado, notas, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            empresa_id,
            nombre_activo,
            tipo_activo || 'General',
            parseFloat(costo_estimado),
            tipo_gasto || 'preventivo',
            frecuencia || 'anual',
            fecha_programada,
            responsable || null,
            proveedor || null,
            criticidad || 'media',
            estado || 'programado',
            notas || null,
            req.user?.id || null
        ]);

        res.status(201).json({ id: result.insertId, message: 'Plan de mantenimiento registrado exitosamente' });
    } catch (error) {
        console.error('Error saving mantenimiento:', error);
        res.status(500).json({ message: 'Error al registrar mantenimiento', error: error.message });
    }
});

// PUT /mantenimiento/:id
router.put('/mantenimiento/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const { id } = req.params;
        const {
            empresa_id,
            nombre_activo,
            tipo_activo,
            costo_estimado,
            tipo_gasto,
            frecuencia,
            fecha_programada,
            fecha_ejecutada,
            responsable,
            proveedor,
            criticidad,
            estado,
            notas
        } = req.body;

        await db.query(`
            UPDATE finanzas_planes_mantenimiento SET
                empresa_id = ?,
                nombre_activo = ?,
                tipo_activo = ?,
                costo_estimado = ?,
                tipo_gasto = ?,
                frecuencia = ?,
                fecha_programada = ?,
                fecha_ejecutada = ?,
                responsable = ?,
                proveedor = ?,
                criticidad = ?,
                estado = ?,
                notas = ?
            WHERE id = ?
        `, [
            empresa_id,
            nombre_activo,
            tipo_activo || 'General',
            parseFloat(costo_estimado),
            tipo_gasto || 'preventivo',
            frecuencia || 'anual',
            fecha_programada,
            fecha_ejecutada || null,
            responsable || null,
            proveedor || null,
            criticidad || 'media',
            estado || 'programado',
            notas || null,
            id
        ]);

        res.json({ message: 'Mantenimiento actualizado exitosamente' });
    } catch (error) {
        console.error('Error updating mantenimiento:', error);
        res.status(500).json({ message: 'Error al actualizar mantenimiento', error: error.message });
    }
});

// DELETE /mantenimiento/:id
router.delete('/mantenimiento/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const { id } = req.params;
        await db.query('DELETE FROM finanzas_planes_mantenimiento WHERE id = ?', [id]);
        res.json({ message: 'Registro de mantenimiento eliminado exitosamente' });
    } catch (error) {
        console.error('Error deleting mantenimiento:', error);
        res.status(500).json({ message: 'Error al eliminar mantenimiento', error: error.message });
    }
});

// ==========================================
// --- CONSEJERO FINANCIERO Y PROYECCIONES IA ---
// ==========================================

// POST /asesor-ia
router.post('/asesor-ia', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureFinanzasTables(db);
        const { prompt, proyecto_id, empresa_id } = req.body;

        // 1. Obtener préstamos activos
        let loanQuery = `
            SELECT 
                p.id, p.empresa_id, e.nombre AS empresa_nombre,
                p.numero_prestamo, p.descripcion,
                p.monto_original, p.tasa_interes_anual, p.plazo_meses,
                p.cuota_calculada, p.cuota_total,
                (p.monto_original - COALESCE(SUM(pp.monto_capital), 0)) AS saldo_actual,
                COALESCE(SUM(pp.monto_interes), 0) AS interes_pagado
            FROM prestamos p
            LEFT JOIN empresas e ON p.empresa_id = e.id
            LEFT JOIN prestamos_pagos pp ON p.id = pp.prestamo_id
            WHERE p.estado = 'activo'
        `;
        const loanParams = [];
        if (empresa_id) {
            loanQuery += ' AND p.empresa_id = ?';
            loanParams.push(empresa_id);
        }
        loanQuery += ' GROUP BY p.id';
        const [activeLoans] = await db.query(loanQuery, loanParams);

        // 2. Obtener proyectos de inversión
        let projectQuery = `
            SELECT p.*, e.nombre AS empresa_nombre
            FROM finanzas_proyectos_inversion p
            LEFT JOIN empresas e ON p.empresa_id = e.id
            WHERE 1=1
        `;
        const projParams = [];
        if (empresa_id) {
            projectQuery += ' AND p.empresa_id = ?';
            projParams.push(empresa_id);
        }
        if (proyecto_id) {
            projectQuery += ' AND p.id = ?';
            projParams.push(proyecto_id);
        }
        projectQuery += ' ORDER BY p.created_at DESC LIMIT 10';
        const [projects] = await db.query(projectQuery, projParams);

        // 3. Obtener mantenimientos programados próximos
        let mantQuery = `
            SELECT m.*, e.nombre AS empresa_nombre
            FROM finanzas_planes_mantenimiento m
            LEFT JOIN empresas e ON m.empresa_id = e.id
            WHERE m.estado IN ('programado', 'en_proceso')
        `;
        const mantParams = [];
        if (empresa_id) {
            mantQuery += ' AND m.empresa_id = ?';
            mantParams.push(empresa_id);
        }
        mantQuery += ' ORDER BY m.fecha_programada ASC LIMIT 15';
        const [maintenances] = await db.query(mantQuery, mantParams);

        // Consolidación de métricas de deuda
        const totalSaldoDeuda = activeLoans.reduce((sum, l) => sum + Math.max(0, parseFloat(l.saldo_actual || 0)), 0);
        const totalCuotaMensual = activeLoans.reduce((sum, l) => sum + parseFloat(l.cuota_total || l.cuota_calculada || 0), 0);
        
        let weightedRateSum = 0;
        activeLoans.forEach(l => {
            const saldo = Math.max(0, parseFloat(l.saldo_actual || 0));
            weightedRateSum += saldo * (parseFloat(l.tasa_interes_anual || 0));
        });
        const tasaPromedioPonderadaDeuda = totalSaldoDeuda > 0 ? (weightedRateSum / totalSaldoDeuda) : 0;

        // Presupuesto mantenimiento
        const totalPresupuestoMant = maintenances.reduce((sum, m) => sum + parseFloat(m.costo_estimado || 0), 0);
        const proyectosRentables = projects.filter(p => parseFloat(p.vpn_estimado || 0) > 0);

        const financialContext = {
            total_prestamos_activos: activeLoans.length,
            saldo_total_deuda: Math.round(totalSaldoDeuda * 100) / 100,
            cuota_mensual_total: Math.round(totalCuotaMensual * 100) / 100,
            tasa_ponderada_deuda_anual: +(tasaPromedioPonderadaDeuda).toFixed(2),
            prestamos: activeLoans.map(l => ({
                id: l.id,
                empresa: l.empresa_nombre,
                codigo: l.numero_prestamo,
                descripcion: l.descripcion,
                saldo_actual: Math.round(parseFloat(l.saldo_actual || 0)),
                tasa_interes: parseFloat(l.tasa_interes_anual),
                cuota_mensual: parseFloat(l.cuota_total || l.cuota_calculada)
            })),
            proyectos: projects.map(p => ({
                id: p.id,
                nombre: p.nombre_proyecto,
                empresa: p.empresa_nombre,
                inversion: parseFloat(p.inversion_inicial),
                tasa_descuento: parseFloat(p.tasa_descuento),
                vpn: parseFloat(p.vpn_estimado),
                tir: p.tir_estimada !== null && p.tir_estimada !== undefined ? parseFloat(p.tir_estimada) : null,
                roi: parseFloat(p.roi_estimado),
                payback_meses: parseFloat(p.payback_meses),
                estado: p.estado
            })),
            mantenimiento_proximo: {
                total_comprometido: Math.round(totalPresupuestoMant * 100) / 100,
                cantidad_eventos: maintenances.length,
                detalles: maintenances.slice(0, 5).map(m => ({
                    activo: m.nombre_activo,
                    costo: parseFloat(m.costo_estimado),
                    fecha: m.fecha_programada,
                    criticidad: m.criticidad
                }))
            }
        };

        // Si hay API KEY de Gemini disponible
        if (process.env.GEMINI_API_KEY) {
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const systemInstruction = `Eres el Director Financiero Corporativo (CFO) y Asesor Estratégico Senior del Grupo Empresarial SIPE (estaciones de servicio de combustible, transporte de hidrocarburos e inversiones).
Tu misión es emitir diagnósticos de alto rigor financiero, evaluar rentabilidad (VPN, TIR, ROI, Payback), arbitraje de capital (prepagar deuda bancaria vs financiar nuevos proyectos), y planes de mantenimiento.
Responde de manera estructurada, ejecutiva, con números exactos y recomendaciones prioritarias.

FORMATO DE RESPUESTA JSON ESTRICTO:
{
    "diagnostico": "Resumen ejecutivo del estado financiero actual del grupo/empresa.",
    "salud_financiera": "Optima | Buena | Precaucion | Critica",
    "arbitraje_deuda_vs_inversion": {
        "tasa_deuda_referencia": "${tasaPromedioPonderadaDeuda.toFixed(2)}%",
        "tir_promedio_proyectos": "...",
        "recomendacion_estrategica": "Recomienda con claridad si conviene prepagar préstamos para ahorrar intereses o ejecutar proyectos con TIR superior."
    },
    "alertas_riesgo": ["Alerta 1", "Alerta 2"],
    "recomendaciones_prioritarias": [
        { "titulo": "...", "detalle": "...", "impacto": "Alto | Medio | Inmediato" }
    ],
    "analisis_proyeccion": "Proyección a 12-36 meses considerando flujo para cuotas bancarias y mantenimiento.",
    "reply_markdown": "Respuesta detallada y profesional en Markdown con tablas o viñetas para que el usuario la lea con total claridad."
}`;

                const userPromptText = prompt
                    ? `CONSULTA ESPECÍFICA DEL USUARIO: ${prompt}\n\nDATOS FINANCIEROS Y OPERATIVOS EN SISTEMA:\n${JSON.stringify(financialContext)}`
                    : `Realiza un diagnóstico integral de salud financiera, arbitraje de deuda vs proyectos y recomendaciones para la gerencia general.\n\nDATOS FINANCIEROS Y OPERATIVOS EN SISTEMA:\n${JSON.stringify(financialContext)}`;

                const result = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: [{ role: 'user', parts: [{ text: userPromptText }] }],
                    config: {
                        systemInstruction,
                        responseMimeType: "application/json"
                    }
                });

                let rawText = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
                if (rawText.startsWith('```json')) {
                    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                }

                const parsed = JSON.parse(rawText);
                return res.json({
                    success: true,
                    fuente: 'gemini-2.0-flash',
                    contexto_base: financialContext,
                    data: parsed
                });
            } catch (aiErr) {
                console.warn('Gemini Finanzas call failed, falling back to heuristic engine:', aiErr.message);
            }
        }

        // --- MOTOR HEURÍSTICO / MATEMÁTICO DE CONTINGENCIA (Fallback Offline) ---
        const bestProject = projects.reduce((best, p) => (!best || (p.tir_estimada || 0) > (best.tir_estimada || 0)) ? p : best, null);
        const bestTIR = bestProject?.tir_estimada || 0;
        const spreadArbitraje = bestTIR - tasaPromedioPonderadaDeuda;

        let recomendacionArbitraje = "";
        if (spreadArbitraje > 5) {
            recomendacionArbitraje = `La TIR del mejor proyecto (${bestProject?.nombre_proyecto || 'Nuevo Proyecto'}: ${bestTIR}%) supera por ${spreadArbitraje.toFixed(2)}% el costo de la deuda bancaria (${tasaPromedioPonderadaDeuda.toFixed(2)}%). Conviene priorizar la ejecución del proyecto ya que genera mayor valor que el ahorro por prepagar préstamos.`;
        } else if (spreadArbitraje > 0) {
            recomendacionArbitraje = `El rendimiento del proyecto (${bestTIR}%) es moderadamente superior al costo financiero (${tasaPromedioPonderadaDeuda.toFixed(2)}%). Considera una estrategia mixta: amortización parcial de deuda cara y avance por fases en la inversión.`;
        } else {
            recomendacionArbitraje = `El costo promedio de la deuda bancaria (${tasaPromedioPonderadaDeuda.toFixed(2)}%) es mayor o igual a los retornos proyectados. Se recomienda amortizar extraordinariamente el capital de los préstamos más caros para blindar la liquidez.`;
        }

        const fallbackResponse = {
            diagnostico: `El grupo gestiona una deuda activa total de $${totalSaldoDeuda.toLocaleString('en-US', { minimumFractionDigits: 2 })} distribuida en ${activeLoans.length} préstamo(s), con una carga mensual de $${totalCuotaMensual.toLocaleString('en-US', { minimumFractionDigits: 2 })} y un costo ponderado del ${tasaPromedioPonderadaDeuda.toFixed(2)}% anual. Existen ${projects.length} proyecto(s) evaluados y compromisos de mantenimiento por $${totalPresupuestoMant.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
            salud_financiera: totalSaldoDeuda === 0 ? "Optima" : (totalCuotaMensual > 0 && spreadArbitraje >= 0 ? "Buena" : "Precaucion"),
            arbitraje_deuda_vs_inversion: {
                tasa_deuda_referencia: `${tasaPromedioPonderadaDeuda.toFixed(2)}%`,
                tir_promedio_proyectos: bestProject ? `${bestTIR}% (${bestProject.nombre_proyecto})` : "N/A",
                recomendacion_estrategica: recomendacionArbitraje
            },
            alertas_riesgo: [
                totalPresupuestoMant > 15000 ? `Compromiso significativo de mantenimiento preventivo ($${totalPresupuestoMant.toLocaleString('en-US')}) programado en el corto plazo.` : null,
                totalSaldoDeuda > 0 ? `Carga mensual recurrente de servicio de deuda por $${totalCuotaMensual.toLocaleString('en-US')}.` : null,
                projects.some(p => (p.vpn_estimado || 0) < 0) ? 'Existen proyectos con VPN negativo que deben ser replanteados o descartados.' : null
            ].filter(Boolean),
            recomendaciones_prioritarias: [
                {
                    titulo: "Optimización de Estructura de Capital",
                    detalle: recomendacionArbitraje,
                    impacto: "Alto"
                },
                {
                    titulo: "Programación de Fondos de Mantenimiento",
                    detalle: `Asegurar provisión anticipada de $${totalPresupuestoMant.toLocaleString('en-US')} para mantenimientos críticos sin afectar el capital de trabajo de combustible.`,
                    impacto: "Medio"
                },
                {
                    titulo: "Seguimiento a Proyectos Rentables",
                    detalle: proyectosRentables.length > 0 ? `Monitorear el inicio de ${proyectosRentables.map(p => p.nombre_proyecto).join(', ')} para consolidar flujos positivos.` : "Formular proyectos de expansión o eficiencia energética con VPN positivo.",
                    impacto: "Inmediato"
                }
            ],
            analisis_proyeccion: `Con la estructura actual, el flujo operativo debe cubrir primeramente los $${(totalCuotaMensual * 12).toLocaleString('en-US')} anuales de cuotas bancarias más $${totalPresupuestoMant.toLocaleString('en-US')} de mantenimiento programado. Los proyectos aprobados tienen un potencial de retorno acumulado que reforzará la rentabilidad sobre activos.`,
            reply_markdown: `### Diagnóstico Financiero Ejecutivo
- **Saldo Total de Deuda Activa:** $${totalSaldoDeuda.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- **Costo Financiero Ponderado (Tasa Anual):** ${tasaPromedioPonderadaDeuda.toFixed(2)}%
- **Servicio Mensual de Deuda:** $${totalCuotaMensual.toLocaleString('en-US', { minimumFractionDigits: 2 })}
- **Mantenimiento Comprometido:** $${totalPresupuestoMant.toLocaleString('en-US', { minimumFractionDigits: 2 })}

#### Análisis de Arbitraje Financiero:
${recomendacionArbitraje}

#### Próximos Pasos Recomendados:
1. **Prioridad 1:** Gestionar la liquidez operativa mensual asegurando la cobertura de cuotas de deuda.
2. **Prioridad 2:** ${proyectosRentables.length > 0 ? `Ejecutar proyecto prioritario "${bestProject?.nombre_proyecto || 'En evaluación'}" (TIR: ${bestTIR}%, VPN: $${bestProject?.vpn_estimado?.toLocaleString('en-US') || 0}).` : 'Evaluar alternativas de inversión que superen la tasa de corte corporativa.'}
3. **Prioridad 3:** Coordinar con operaciones la ventana de ejecución de mantenimientos preventivos para evitar paros no programados.`
        };

        return res.json({
            success: true,
            fuente: 'motor-heuristico-financiero',
            contexto_base: financialContext,
            data: fallbackResponse
        });
    } catch (error) {
        console.error('Error in asesor-ia:', error);
        res.status(500).json({ message: 'Error al procesar asesoría financiera con IA', error: error.message });
    }
});

module.exports = router;
