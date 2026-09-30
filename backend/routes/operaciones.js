const express = require('express');
const router = express.Router();
const { getDb, getExternalDb, withRetry } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const energyLatamService = require('../services/energyLatamService');

// --- Dashboard / Vencimientos ---
router.get('/dashboard/vencimientos', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const now = new Date();
        const toDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        
        const query = `
            SELECT c.descripcion as ubicacion, b.descripcion, a.vencimiento as vence, b.monto, a.id, b.id as id_recordatorio
            FROM web_rc_recordatorios_vencimientos a 
            INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id 
            INNER JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id 
            WHERE a.vencimiento < ? 
            AND a.estado = 'P' AND b.activo = 1
            ORDER BY a.vencimiento DESC
        `;
        const [rows] = await externalDb.query(query, [toDate]);
        res.json(rows);
    } catch (error) { 
        console.error('SERVER ERROR IN DASHBOARD:', error);
        res.status(500).json({ message: 'Error' }); 
    }
});

// --- Pedidos de Combustible ---
router.get('/operaciones/estaciones', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden");
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching estaciones' }); }
});

router.get('/operaciones/fecha-servidor', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT MAX(fecha) as fecha_servidor FROM lecturas_tanque");
        res.json({ fecha_servidor: rows[0]?.fecha_servidor || null });
    } catch (error) { res.status(500).json({ message: 'Error fetching fecha servidor' }); }
});

router.get('/operaciones/fecha-servidor-global', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT CURDATE() as fecha_actual, DATE_SUB(CURDATE(), INTERVAL 1 DAY) as fecha_ayer");
        let fechaActual = rows[0]?.fecha_actual;
        let fechaAyer = rows[0]?.fecha_ayer;
        if (fechaActual instanceof Date) { fechaActual = fechaActual.toISOString().split('T')[0]; }
        if (fechaAyer instanceof Date) { fechaAyer = fechaAyer.toISOString().split('T')[0]; }
        res.json({ fecha_actual: fechaActual, fecha_ayer: fechaAyer });
    } catch (error) { res.status(500).json({ message: 'Error fetching global server date' }); }
});

router.get('/operaciones/pedidos/datos-tanque/:id_empresa/:fecha', authenticateToken, async (req, res) => {
    try {
        const { id_empresa, fecha } = req.params;
        const externalDb = await getExternalDb();
        const maxFechaQ = `SELECT MAX(fecha) as last_date FROM lecturas_tanque WHERE id_empresa = ? AND fecha <= ?`;
        const [maxRows] = await externalDb.query(maxFechaQ, [id_empresa, fecha]);
        let targetDate = fecha;
        if (maxRows.length && maxRows[0].last_date) {
            targetDate = maxRows[0].last_date;
            if (targetDate instanceof Date) { targetDate = targetDate.toISOString().split('T')[0]; }
        }
        const query = `
            SELECT b.id_producto AS id_tanque, sum(b.lectura) as lectura, sum(c.capacidad) as capacidad, sum(c.galones_reserva) as reserva, if(c.tipo_combustible='M','I',c.tipo_combustible) as tipo_combustible 
            FROM lecturas_tanque a 
            INNER JOIN (
                SELECT id_empresa, fecha, MAX(turno) as max_turno 
                FROM lecturas_tanque 
                WHERE id_empresa = ? AND fecha = ?
                GROUP BY id_empresa, fecha
            ) m ON a.id_empresa = m.id_empresa AND a.fecha = m.fecha AND a.turno = m.max_turno
            INNER JOIN detalle_lecturas_tanque b ON a.id = b.id_lectura AND a.id_empresa=b.id_empresa 
            INNER JOIN tanques c ON b.codigo_producto = c.id AND b.id_empresa=c.id_empresa 
            WHERE a.id_empresa = ? AND a.fecha = ?
            GROUP BY tipo_combustible
        `;
        const [rows] = await externalDb.query(query, [id_empresa, targetDate, id_empresa, targetDate]);
        res.json({ fecha: fecha, inventario: rows });
    } catch (error) { res.status(500).json({ message: 'Error fetching datos-tanque' }); }
});

router.get('/operaciones/pedidos/promedios/:id_empresa/:fecha', authenticateToken, async (req, res) => {
    try {
        const { id_empresa, fecha } = req.params;
        const externalDb = await getExternalDb();
        const dates = [];
        const baseDate = new Date(fecha + 'T12:00:00');
        for (let i = 0; i < 7; i++) {
            const d = new Date(baseDate);
            d.setDate(d.getDate() - i);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            dates.push(`${day}/${month}/${year}`);
        }
        const query = `
           SELECT IF(a.id_empresa = '004' AND a.codigo_producto = '0007','I', LEFT(a.nom_producto,1)) AS tipo_combustible,
                  SUM(a.total)/7 as promedio
           FROM cierre_turno_lecturas a 
           INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa=b.id_empresa 
           WHERE a.id_empresa = ? AND b.fecha_turno IN (?)
           GROUP BY codigo_producto, a.id_empresa
        `;
        const [rows] = await externalDb.query(query, [id_empresa, dates]);
        const agg = { D: 0, R: 0, S: 0, I: 0 };
        rows.forEach(r => {
            if (['D', 'R', 'S', 'I'].includes(r.tipo_combustible)) {
                agg[r.tipo_combustible] += Number(r.promedio || 0);
            }
        });
        res.json(agg);
    } catch (error) { res.status(500).json({ message: 'Error fetching promedios' }); }
});

router.get('/operaciones/pedidos/programados/:id_estacion/:fecha', authenticateToken, async (req, res) => {
    try {
        const { id_estacion, fecha } = req.params;
        const externalDb = await getExternalDb();
        const query = `
            SELECT fecha, numero, diesel, regular, super, iondiesel,
                   IFNULL(id_carrier_local, id_transportista) as id_transportista,
                   IFNULL(id_tanker_local, id_calibracion_diesel) as id_calibracion_diesel,
                   id as id_pedido
            FROM web_pedidos_temp 
            WHERE id_estacion = ? AND fecha > ? ORDER BY fecha
        `;
        const [rows] = await externalDb.query(query, [id_estacion, fecha]);
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching pedidos programados' }); }
});

router.post('/operaciones/pedidos/agregar', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { id_pedido, id_estacion, fecha, id_transportista, diesel, regular, super: s, iondiesel, id_calibracion_diesel } = req.body;
        const externalDb = await getExternalDb();
        if (id_pedido) {
            await externalDb.query(`UPDATE web_pedidos_temp SET fecha=?, id_carrier_local=?, diesel=?, regular=?, super=?, iondiesel=?, id_tanker_local=? WHERE id=?`, 
                [fecha, id_transportista, diesel || 0, regular || 0, s || 0, iondiesel || 0, id_calibracion_diesel || null, id_pedido]);
        } else {
            await externalDb.query(`INSERT INTO web_pedidos_temp (id_estacion, fecha, id_carrier_local, diesel, regular, super, iondiesel, id_tanker_local) VALUES (?,?,?,?,?,?,?,?)`, 
                [id_estacion, fecha, id_transportista, diesel || 0, regular || 0, s || 0, iondiesel || 0, id_calibracion_diesel || null]);
        }
        res.json({ success: true, message: 'Pedido Guardado!' });
    } catch (error) { sendSafeError(res, error, 'Error agregando pedido'); }
});

router.delete('/operaciones/pedidos/anular/:id', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [ex] = await externalDb.query("SELECT count(id_origen) as cont FROM web_pedidos WHERE id_origen = ?", [req.params.id]);
        if (ex[0].cont > 0) return res.status(400).json({ message: "Pedido Confirmado. No Puede Anular." });
        await externalDb.query("DELETE FROM web_pedidos_temp WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Pedido Anulado' });
    } catch (error) { sendSafeError(res, error, 'Error anulando pedido'); }
});

router.post('/operaciones/pedidos/confirmar', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { id_pedido, numero, id_estacion, forma_pago, costo_d, costo_s, costo_r, costo_i } = req.body;
        const externalDb = await getExternalDb();
        const [exCheck] = await externalDb.query("SELECT count(id_origen) as cont FROM web_pedidos WHERE id_origen = ?", [id_pedido]);
        if (exCheck[0].cont > 0) return res.status(400).json({ message: "Pedido Confirmado. No Puede Volver a Confirmar." });
        const [tempReq] = await externalDb.query("SELECT * FROM web_pedidos_temp WHERE id = ?", [id_pedido]);
        if (!tempReq.length) return res.status(404).json({ message: "Pedido temporal no encontrado." });
        const p = tempReq[0];
        const nTotal = Number(p.diesel || 0) + Number(p.regular || 0) + Number(p.super || 0) + Number(p.iondiesel || 0);
        const pipa = nTotal >= 8000 ? 8000 : 4000;
        const fleteCol = nTotal >= 8000 ? "pipa8000" : "pipa4000";
        let flete = 0.0;
        try {
            const [fRows] = await externalDb.query(`SELECT ${fleteCol} as cost FROM web_fletes WHERE id_estacion = ? AND id_transportista = ?`, [id_estacion, p.id_transportista || p.id_carrier_local]);
            if (fRows.length) flete = fRows[0].cost || 0;
        } catch(e) { /* flete lookup is optional */ }
        const cDate = p.fecha instanceof Date ? p.fecha.toISOString().split('T')[0] : p.fecha;
        const connection = await externalDb.getConnection();
        await connection.beginTransaction();
        try {
            const [exNum] = await connection.query("SELECT count(numero) as c FROM web_pedidos WHERE numero = ?", [numero]);
            if (exNum[0].c > 0) {
                await connection.query("UPDATE web_pedidos SET p_diesel = p_diesel + ?, p_regular = p_regular + ?, p_super = p_super + ?, p_ion = p_ion + ?, compartido = ? WHERE numero = ?", 
                    [p.diesel, p.regular, p.super, p.iondiesel, nTotal, numero]);
            } else {
                await connection.query(`INSERT INTO web_pedidos (fecha, numero, id_estacion, forma_pago, p_diesel, p_regular, p_super, p_ion, id_carrier_local, id_tanker_local, flete, pipa, costo_d, costo_s, costo_r, costo_i, id_origen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
                    [cDate, numero, id_estacion, forma_pago, p.diesel, p.regular, p.super, p.iondiesel, p.id_carrier_local, p.id_tanker_local, flete, pipa, costo_d || 0, costo_s || 0, costo_r || 0, costo_i || 0, id_pedido]);
            }
            await connection.query("UPDATE web_pedidos_temp SET numero = ? WHERE id = ?", [numero, id_pedido]);
            await connection.commit();
            res.json({ success: true, message: 'Pedido Confirmado y Creado!' });
        } catch(errTransaction) {
            await connection.rollback();
            throw errTransaction;
        } finally {
            connection.release();
        }
    } catch (error) { sendSafeError(res, error, 'Error al confirmar pedido'); }
});

// --- RECORDATORIOS / PAGOS ---
router.get('/operaciones/recordatorios/ubicaciones', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT id, descripcion FROM web_rc_ubicaciones ORDER BY descripcion");
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching ubicaciones' }); }
});

router.get('/operaciones/recordatorios', authenticateToken, async (req, res) => {
    try {
        const { desde, hasta, estado, id_recordatorio } = req.query; 
        const externalDb = await getExternalDb();
        let statusFilter = "a.estado IN ('P', 'C')";
        if (estado === 'P') statusFilter = "a.estado = 'P'";
        else if (estado === 'C') statusFilter = "a.estado = 'C'";
        let query = `
            SELECT c.descripcion as ubicacion, b.descripcion, a.vencimiento as vence, b.forma_pago as observacion, 
                   a.forma_pago, b.monto, IF(a.estado = 'P','PENDIENTE','CANCELADO') as estado, a.fecha_cancelacion, a.id, b.id as id_recordatorio
            FROM web_rc_recordatorios_vencimientos a 
            INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id 
            INNER JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id 
            WHERE 1=1 
        `;
        const params = [];
        if (id_recordatorio) {
            query += " AND b.id = ? ";
            params.push(id_recordatorio);
        } else {
            query += ` AND b.activo = 1 AND ${statusFilter} AND a.vencimiento BETWEEN ? AND ? `;
            params.push(desde, hasta);
        }
        query += " ORDER BY a.vencimiento ";
        const [rows] = await externalDb.query(query, params);
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching recordatorios' }); }
});

router.get('/operaciones/recordatorios/:id', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT * FROM web_rc_recordatorios WHERE id = ?", [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
        const [pagados] = await externalDb.query("SELECT COUNT(*) as cont FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = ? AND estado = 'C'", [req.params.id]);
        res.json({ recordatorio: rows[0], pagados: pagados[0].cont });
    } catch (error) { res.status(500).json({ message: 'Error fetching recordatorio detail' }); }
});

router.get('/operaciones/recordatorios/parents/buscar', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const query = `
            SELECT b.id, b.descripcion, b.iniciar as fecha_inicio, c.descripcion as ubicacion, 
                   b.monto, b.forma_pago as observacion, b.repetir as cuotas, b.repetir_desc, IF(b.activo=1,'SI','NO') as activo
            FROM web_rc_recordatorios b 
            LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id 
            ORDER BY b.iniciar DESC
        `;
        const [rows] = await externalDb.query(query);
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching parent recordatorios' }); }
});

function calculateRecurringDate(iniciarStr, n, repetirDesc) {
    const cleanStr = String(iniciarStr).split('T')[0];
    const [yStr, mStr, dStr] = cleanStr.split('-');
    const startYear = parseInt(yStr, 10);
    const startMonth = parseInt(mStr, 10); // 1 - 12
    const startDay = parseInt(dStr, 10);   // 1 - 31

    if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay)) {
        return cleanStr;
    }

    const desc = String(repetirDesc || '').toUpperCase().trim();

    if (desc === 'VEZ' || n === 1) {
        return `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    }

    if (desc === 'MES' || desc === 'MESES') {
        const totalMonths = (startYear * 12) + (startMonth - 1) + (n - 1);
        const targetYear = Math.floor(totalMonths / 12);
        const targetMonth = (totalMonths % 12) + 1; // 1 - 12
        // Last day of targetMonth in targetYear using UTC
        const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
        const targetDay = Math.min(startDay, daysInTargetMonth);
        return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    }

    if (desc === 'AÑO' || desc === 'ANO' || desc === 'AÑOS' || desc === 'ANOS') {
        const targetYear = startYear + (n - 1);
        const targetMonth = startMonth;
        const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
        const targetDay = Math.min(startDay, daysInTargetMonth);
        return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    }

    if (desc === 'DIAS' || desc === 'DÍAS') {
        const d = new Date(Date.UTC(startYear, startMonth - 1, startDay));
        d.setUTCDate(d.getUTCDate() + (n - 1));
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;
        const day = d.getUTCDate();
        return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return cleanStr;
}

router.post('/operaciones/recordatorios', authenticateToken, requirePermission(['manage_recordatorios', '/dashboard/operaciones/recordatorios']), async (req, res) => {
    try {
        const { id, descripcion, id_ubicacion, iniciar, activo, monto, repetir, repetir_desc, forma_pago, pagado, fecPago, formaPago2 } = req.body;
        const externalDb = await getExternalDb();
        const connection = await externalDb.getConnection();
        await connection.beginTransaction();
        try {
            let recordatorioId = id;
            if (id) {
                await connection.query(`UPDATE web_rc_recordatorios SET descripcion=?, id_ubicacion=?, iniciar=?, monto=?, repetir=?, repetir_desc=?, activo=?, forma_pago=? WHERE id=?`, 
                    [descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo ? 1 : 0, forma_pago, id]);
            } else {
                const [result] = await connection.query(`INSERT INTO web_rc_recordatorios (descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo, forma_pago) VALUES (?,?,?,?,?,?,?,?)`, 
                    [descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo ? 1 : 0, forma_pago]);
                recordatorioId = result.insertId;
            }
            await connection.query("DELETE FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = ?", [recordatorioId]);
            for (let n = 1; n <= repetir; n++) {
                const formattedDate = calculateRecurringDate(iniciar, n, repetir_desc);
                let isPagado = false;
                if (repetir_desc === 'VEZ') { if (pagado) isPagado = true; }
                if (isPagado) {
                    await connection.query("INSERT INTO web_rc_recordatorios_vencimientos (id_recordatorio, vencimiento, estado, fecha_cancelacion, forma_pago) VALUES (?, ?, 'C', ?, ?)", [recordatorioId, formattedDate, fecPago, formaPago2]);
                } else {
                    await connection.query("INSERT INTO web_rc_recordatorios_vencimientos (id_recordatorio, vencimiento, estado, fecha_cancelacion, forma_pago) VALUES (?, ?, 'P', NULL, '')", [recordatorioId, formattedDate]);
                }
            }
            await connection.commit();
            res.json({ success: true, message: 'Recordatorio Guardado!' });
        } catch(errTx) { await connection.rollback(); throw errTx; } finally { connection.release(); }
    } catch (error) { sendSafeError(res, error, 'Error al guardar recordatorio'); }
});

router.put('/operaciones/recordatorios/pagar/:id', authenticateToken, requirePermission(['manage_recordatorios', '/dashboard/operaciones/recordatorios']), async (req, res) => {
    try {
        const { id } = req.params;
        const { forma_pago, fecha_cancelacion } = req.body;
        const externalDb = await getExternalDb();
        await externalDb.query("UPDATE web_rc_recordatorios_vencimientos SET estado = 'C', fecha_cancelacion = ?, forma_pago = ? WHERE id = ?", [fecha_cancelacion, forma_pago, id]);
        res.json({ success: true, message: 'Pago Realizado!' });
    } catch (error) { sendSafeError(res, error, 'Error al registrar pago'); }
});

router.delete('/operaciones/recordatorios/vencimiento/:id', authenticateToken, requirePermission(['manage_recordatorios', '/dashboard/operaciones/recordatorios']), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        await externalDb.query("DELETE FROM web_rc_recordatorios_vencimientos WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Recordatorio Eliminado!' });
    } catch (error) { sendSafeError(res, error, 'Error al eliminar vencimiento'); }
});

// --- PORTAL ENERGY-LATAM / PUMA ORDERS & BANK INTEGRATION ---

async function ensurePortalTablesAndSeed(db) {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS portal_pedidos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                numero_orden VARCHAR(50) NOT NULL UNIQUE,
                id_estacion VARCHAR(50) NULL,
                estacion_nombre VARCHAR(150) NULL,
                fecha_pedido DATETIME NULL,
                fecha_solicitada DATE NULL,
                tipo_entrega VARCHAR(50) NULL,
                tipo_producto VARCHAR(50) NULL DEFAULT 'Bulk',
                estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
                estado_original VARCHAR(50) NULL,
                razon_estado TEXT NULL,
                monto_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                metodo_pago VARCHAR(50) NULL,
                costo_diesel DECIMAL(10,4) DEFAULT 0.0000,
                costo_regular DECIMAL(10,4) DEFAULT 0.0000,
                costo_super DECIMAL(10,4) DEFAULT 0.0000,
                costo_ion DECIMAL(10,4) DEFAULT 0.0000,
                galones_diesel DECIMAL(10,2) DEFAULT 0.00,
                galones_regular DECIMAL(10,2) DEFAULT 0.00,
                galones_super DECIMAL(10,2) DEFAULT 0.00,
                galones_ion DECIMAL(10,2) DEFAULT 0.00,
                factura_numero VARCHAR(50) NULL,
                factura_monto DECIMAL(12,2) DEFAULT 0.00,
                factura_saldo_pendiente DECIMAL(12,2) DEFAULT 0.00,
                factura_fecha_vencimiento DATE NULL,
                factura_fecha_emision DATE NULL,
                factura_pdf_url TEXT NULL,
                orden_pdf_url TEXT NULL,
                items_json LONGTEXT NULL,
                raw_data_json LONGTEXT NULL,
                estado_pago ENUM('PENDIENTE', 'PAGADO', 'PARCIAL', 'CONCILIADO') DEFAULT 'PENDIENTE',
                cuenta_bancaria_id INT NULL,
                movimiento_bancario_id INT NULL,
                cheque_id INT NULL,
                tipo_pago VARCHAR(50) DEFAULT 'Transferencia',
                referencia_pago VARCHAR(100) NULL,
                fecha_pago DATE NULL,
                monto_pagado DECIMAL(12,2) DEFAULT 0.00,
                observaciones_pago TEXT NULL,
                listo_conciliacion TINYINT(1) DEFAULT 0,
                fecha_conciliado DATE NULL,
                sincronizado_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_portal_orden (numero_orden),
                INDEX idx_portal_estacion (id_estacion),
                INDEX idx_portal_estado (estado),
                INDEX idx_portal_fecha (fecha_pedido),
                INDEX idx_portal_pago (estado_pago, listo_conciliacion)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS portal_resumen_cuenta (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cuenta_nombre VARCHAR(150),
                cuenta_numero VARCHAR(50),
                saldo_disponible DECIMAL(12,2) DEFAULT 0.00,
                limite_credito DECIMAL(12,2) DEFAULT 0.00,
                porcentaje_disponible DECIMAL(5,2) DEFAULT 0.00,
                ordenes_activas_count INT DEFAULT 0,
                ordenes_anteriores_count INT DEFAULT 0,
                ultima_sincronizacion DATETIME,
                raw_user_json LONGTEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS combustible_precios_quincenales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                periodo_inicio DATE NOT NULL,
                periodo_fin DATE NOT NULL,
                precio_diesel DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
                precio_regular DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
                precio_super DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
                precio_ion DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
                variacion_diesel DECIMAL(10,4) DEFAULT 0.0000,
                variacion_regular DECIMAL(10,4) DEFAULT 0.0000,
                variacion_super DECIMAL(10,4) DEFAULT 0.0000,
                variacion_ion DECIMAL(10,4) DEFAULT 0.0000,
                fuente VARCHAR(100) DEFAULT 'Portal Energy-Latam / DGEHM',
                activo TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_periodo (periodo_inicio, periodo_fin)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        const [cnt] = await db.query('SELECT COUNT(*) as c FROM portal_pedidos');
        if (cnt[0].c < 50) {
            await energyLatamService.seedInitialPortalOrders();
        }
    } catch(err) {
        console.warn('[ensurePortalTablesAndSeed] Note:', err.message);
    }
}

// 1. Obtener listado de pedidos del portal
router.get('/operaciones/portal/pedidos', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensurePortalTablesAndSeed(db);

        const { estacion, estado, tipo_producto, estado_pago, desde, hasta, search } = req.query;

        let query = `
            SELECT p.*,
                   cb.numero as cuenta_numero, cb.nombre as cuenta_nombre, b.descripcion as banco_nombre,
                   m.documento as mov_documento, m.fecha_aplicado as mov_fecha_aplicado,
                   IF(m.fecha_aplicado IS NOT NULL, 1, 0) as es_conciliado
            FROM portal_pedidos p
            LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
            LEFT JOIN bancos b ON cb.banco_id = b.id
            LEFT JOIN movimientos_bancarios m ON p.movimiento_bancario_id = m.id
            WHERE 1=1
        `;
        const params = [];

        if (estacion) {
            query += " AND (p.id_estacion = ? OR p.estacion_nombre LIKE ?)";
            params.push(estacion, `%${estacion}%`);
        }
        if (estado) {
            query += " AND p.estado = ?";
            params.push(estado);
        }
        if (tipo_producto) {
            query += " AND p.tipo_producto = ?";
            params.push(tipo_producto);
        }
        if (estado_pago) {
            query += " AND p.estado_pago = ?";
            params.push(estado_pago);
        }
        if (desde && hasta) {
            query += " AND DATE(p.fecha_pedido) BETWEEN ? AND ?";
            params.push(desde, hasta);
        }
        if (search) {
            query += " AND (p.numero_orden LIKE ? OR p.factura_numero LIKE ? OR p.estacion_nombre LIKE ? OR p.razon_estado LIKE ?)";
            const s = `%${search}%`;
            params.push(s, s, s, s);
        }

        query += " ORDER BY p.fecha_pedido DESC LIMIT 200";

        const [rows] = await withRetry(() => db.query(query, params));
        res.json(rows);
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener pedidos del portal');
    }
});

// 2. Resumen de cuenta del portal (saldo disponible, crédito, etc.)
router.get('/operaciones/portal/resumen-cuenta', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensurePortalTablesAndSeed(db);
        const [rows] = await withRetry(() => db.query("SELECT * FROM portal_resumen_cuenta ORDER BY id DESC LIMIT 1"));
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.json({
                saldo_disponible: 633.00,
                limite_credito: 2000.00,
                porcentaje_disponible: 32.00,
                cuenta_nombre: 'corina sosah',
                cuenta_numero: '3409396'
            });
        }
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener resumen de cuenta');
    }
});

// 3. Sincronizar todo desde el portal Energy Latam
router.post('/operaciones/portal/sincronizar', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const io = req.app.get('io');
        const result = await energyLatamService.syncFromPortal(io);
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al sincronizar con el portal Energy Latam');
    }
});

// 4. Actualizar pedido individual
router.post('/operaciones/portal/actualizar-pedido/:numero_orden', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { numero_orden } = req.params;
        const io = req.app.get('io');
        const result = await energyLatamService.syncFromPortal(io, numero_orden);
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar pedido individual');
    }
});

// 5. Vincular pedido con pago y alistarlo para conciliación bancaria
router.post('/operaciones/portal/vincular-pago', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const {
            numero_orden,
            cuenta_bancaria_id,
            tipo_pago,
            referencia_pago,
            fecha_pago,
            monto_pagado,
            observaciones,
            alistar_conciliacion
        } = req.body;

        if (!numero_orden) return res.status(400).json({ message: 'Se requiere el número de orden' });
        if (!cuenta_bancaria_id) return res.status(400).json({ message: 'Se requiere seleccionar la cuenta bancaria' });
        if (!fecha_pago) return res.status(400).json({ message: 'Se requiere la fecha de pago' });
        if (!monto_pagado || Number(monto_pagado) <= 0) return res.status(400).json({ message: 'El monto de pago debe ser mayor a 0' });

        const db = getDb();
        const [ordRows] = await db.query('SELECT * FROM portal_pedidos WHERE numero_orden = ?', [numero_orden]);
        if (ordRows.length === 0) return res.status(404).json({ message: 'Pedido no encontrado' });
        const orden = ordRows[0];

        const [ctaRows] = await db.query('SELECT c.*, b.descripcion as banco_nombre FROM cuentas_bancarias c LEFT JOIN bancos b ON c.banco_id = b.id WHERE c.id = ?', [cuenta_bancaria_id]);
        if (ctaRows.length === 0) return res.status(404).json({ message: 'Cuenta bancaria no encontrada' });
        const cta = ctaRows[0];

        let movimientoId = orden.movimiento_bancario_id;

        // Si se solicita alistar para conciliación bancaria, crear o actualizar el registro en movimientos_bancarios
        if (alistar_conciliacion) {
            let tipoRemesaCode = (tipo_pago || '').toUpperCase().includes('CHEQ') ? 'CH' : 'TR';
            const [remesas] = await db.query('SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ? LIMIT 1', [cta.empresa_id, tipoRemesaCode]);
            const tipoRemesaId = remesas[0]?.id || null;

            const docRef = referencia_pago || orden.factura_numero || orden.numero_orden;
            const concepto = `Pago Pedido Combustible #${orden.numero_orden} - ${orden.estacion_nombre || 'Puma'}${observaciones ? ' (' + observaciones + ')' : ''}`;

            if (movimientoId) {
                await db.query(`
                    UPDATE movimientos_bancarios SET
                        cuenta_bancaria_id = ?,
                        fecha = ?,
                        documento = ?,
                        concepto = ?,
                        monto = ?,
                        cargo = ?,
                        tipo_remesa_id = ?
                    WHERE id = ?
                `, [cta.id, fecha_pago, docRef, concepto, monto_pagado, monto_pagado, tipoRemesaId, movimientoId]);
            } else {
                const [movResult] = await db.query(`
                    INSERT INTO movimientos_bancarios (
                        empresa_id, cuenta_bancaria_id, fecha, documento, concepto,
                        monto, cargo, abono, tipo_remesa_id, num_partida, es_contabilizado
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, 0)
                `, [cta.empresa_id, cta.id, fecha_pago, docRef, concepto, monto_pagado, monto_pagado, tipoRemesaId]);
                movimientoId = movResult.insertId;
            }
        }

        const montoTotal = Number(orden.monto_total || 0);
        const montoPag = Number(monto_pagado || 0);
        const nuevoEstadoPago = montoPag >= montoTotal ? 'PAGADO' : 'PARCIAL';

        await db.query(`
            UPDATE portal_pedidos SET
                cuenta_bancaria_id = ?,
                movimiento_bancario_id = ?,
                tipo_pago = ?,
                referencia_pago = ?,
                fecha_pago = ?,
                monto_pagado = ?,
                observaciones_pago = ?,
                estado_pago = ?,
                listo_conciliacion = ?
            WHERE numero_orden = ?
        `, [
            cta.id,
            movimientoId,
            tipo_pago || 'Transferencia',
            referencia_pago || null,
            fecha_pago,
            montoPag,
            observaciones || null,
            nuevoEstadoPago,
            alistar_conciliacion ? 1 : 0,
            numero_orden
        ]);

        const io = req.app.get('io');
        if (io) {
            io.emit('portal_pedidos_updated', { numero_orden, estado_pago: nuevoEstadoPago });
            io.emit('movimientos_updated', { cuenta_id: cta.id });
        }

        res.json({
            success: true,
            message: 'Pago vinculado exitosamente y alistado para conciliación bancaria',
            movimiento_bancario_id: movimientoId,
            estado_pago: nuevoEstadoPago
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al vincular pago con pedido');
    }
});

// 6. Desvincular pago de un pedido
router.post('/operaciones/portal/desvincular-pago', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { numero_orden } = req.body;
        const db = getDb();
        const [ordRows] = await db.query('SELECT * FROM portal_pedidos WHERE numero_orden = ?', [numero_orden]);
        if (ordRows.length === 0) return res.status(404).json({ message: 'Pedido no encontrado' });
        const orden = ordRows[0];

        if (orden.movimiento_bancario_id) {
            const [movRows] = await db.query('SELECT fecha_aplicado FROM movimientos_bancarios WHERE id = ?', [orden.movimiento_bancario_id]);
            if (movRows.length > 0 && movRows[0].fecha_aplicado) {
                return res.status(400).json({ message: 'El movimiento bancario ya fue conciliado. Desconcilie primero en Conciliación Bancaria antes de desvincular.' });
            }
            await db.query('DELETE FROM movimientos_bancarios WHERE id = ?', [orden.movimiento_bancario_id]);
        }

        await db.query(`
            UPDATE portal_pedidos SET
                cuenta_bancaria_id = NULL,
                movimiento_bancario_id = NULL,
                cheque_id = NULL,
                referencia_pago = NULL,
                fecha_pago = NULL,
                monto_pagado = 0,
                observaciones_pago = NULL,
                estado_pago = 'PENDIENTE',
                listo_conciliacion = 0
            WHERE numero_orden = ?
        `, [numero_orden]);

        const io = req.app.get('io');
        if (io) {
            io.emit('portal_pedidos_updated', { numero_orden, estado_pago: 'PENDIENTE' });
            io.emit('movimientos_updated', {});
        }

        res.json({ success: true, message: 'Pago desvinculado del pedido' });
    } catch (error) {
        sendSafeError(res, error, 'Error al desvincular pago');
    }
});

// 7. Precios quincenales de combustibles
router.get('/operaciones/portal/precios-combustible', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await withRetry(() => db.query("SELECT * FROM combustible_precios_quincenales ORDER BY periodo_inicio DESC LIMIT 24"));
        res.json(rows);
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener precios de combustible');
    }
});

// 8. Guardar nuevo precio o actualización quincenal de combustible
router.post('/operaciones/portal/guardar-precios-combustible', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const {
            periodo_inicio,
            periodo_fin,
            precio_diesel,
            precio_regular,
            precio_super,
            precio_ion,
            variacion_diesel,
            variacion_regular,
            variacion_super,
            variacion_ion,
            fuente,
            aplicar_a_pedidos_pendientes
        } = req.body;

        if (!periodo_inicio || !periodo_fin) {
            return res.status(400).json({ message: 'Se requiere fecha de inicio y fin de la quincena' });
        }

        const db = getDb();
        await db.query(`
            INSERT INTO combustible_precios_quincenales (
                periodo_inicio, periodo_fin, precio_diesel, precio_regular, precio_super, precio_ion,
                variacion_diesel, variacion_regular, variacion_super, variacion_ion, fuente, activo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
                precio_diesel = VALUES(precio_diesel),
                precio_regular = VALUES(precio_regular),
                precio_super = VALUES(precio_super),
                precio_ion = VALUES(precio_ion),
                variacion_diesel = VALUES(variacion_diesel),
                variacion_regular = VALUES(variacion_regular),
                variacion_super = VALUES(variacion_super),
                variacion_ion = VALUES(variacion_ion),
                fuente = VALUES(fuente),
                activo = 1
        `, [
            periodo_inicio, periodo_fin,
            Number(precio_diesel || 0), Number(precio_regular || 0), Number(precio_super || 0), Number(precio_ion || 0),
            Number(variacion_diesel || 0), Number(variacion_regular || 0), Number(variacion_super || 0), Number(variacion_ion || 0),
            fuente || 'Ajuste Quincenal Oficial'
        ]);

        if (aplicar_a_pedidos_pendientes) {
            await db.query(`
                UPDATE portal_pedidos SET
                    costo_diesel = IF(galones_diesel > 0, ?, costo_diesel),
                    costo_regular = IF(galones_regular > 0, ?, costo_regular),
                    costo_super = IF(galones_super > 0, ?, costo_super),
                    costo_ion = IF(galones_ion > 0, ?, costo_ion),
                    monto_total = IF(tipo_producto = 'Bulk', 
                        (galones_diesel * ?) + (galones_regular * ?) + (galones_super * ?) + (galones_ion * ?),
                        monto_total
                    )
                WHERE estado IN ('PENDIENTE', 'RETENIDO', 'LIBERADO', 'EN_PROCESO')
            `, [
                Number(precio_diesel), Number(precio_regular), Number(precio_super), Number(precio_ion),
                Number(precio_diesel), Number(precio_regular), Number(precio_super), Number(precio_ion)
            ]);
        }

        const io = req.app.get('io');
        if (io) io.emit('combustible_precios_updated', {});

        res.json({ success: true, message: 'Precios quincenales guardados y actualizados exitosamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al guardar precios de combustible');
    }
});

// 9. Ajustar costos aplicados por pedido
router.post('/operaciones/portal/ajustar-costos-pedido', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { numero_orden, costo_diesel, costo_regular, costo_super, costo_ion } = req.body;
        if (!numero_orden) return res.status(400).json({ message: 'Se requiere el número de orden' });

        const db = getDb();
        const [rows] = await db.query('SELECT * FROM portal_pedidos WHERE numero_orden = ?', [numero_orden]);
        if (rows.length === 0) return res.status(404).json({ message: 'Pedido no encontrado' });
        const p = rows[0];

        const cD = Number(costo_diesel !== undefined ? costo_diesel : p.costo_diesel);
        const cR = Number(costo_regular !== undefined ? costo_regular : p.costo_regular);
        const cS = Number(costo_super !== undefined ? costo_super : p.costo_super);
        const cI = Number(costo_ion !== undefined ? costo_ion : p.costo_ion);

        let nuevoTotal = Number(p.monto_total);
        if (p.tipo_producto === 'Bulk' && (p.galones_diesel > 0 || p.galones_regular > 0 || p.galones_super > 0 || p.galones_ion > 0)) {
            nuevoTotal = (Number(p.galones_diesel || 0) * cD) +
                         (Number(p.galones_regular || 0) * cR) +
                         (Number(p.galones_super || 0) * cS) +
                         (Number(p.galones_ion || 0) * cI);
        }

        await db.query(`
            UPDATE portal_pedidos SET
                costo_diesel = ?,
                costo_regular = ?,
                costo_super = ?,
                costo_ion = ?,
                monto_total = ?
            WHERE numero_orden = ?
        `, [cD, cR, cS, cI, nuevoTotal, numero_orden]);

        const io = req.app.get('io');
        if (io) io.emit('portal_pedidos_updated', { numero_orden });

        res.json({ success: true, message: 'Costos de combustible ajustados para el pedido', nuevo_total: nuevoTotal });
    } catch (error) {
        sendSafeError(res, error, 'Error al ajustar costos del pedido');
    }
});

module.exports = router;
