const express = require('express');
const router = express.Router();
const { getExternalDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

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

router.post('/operaciones/pedidos/agregar', authenticateToken, async (req, res) => {
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
    } catch (error) { res.status(500).json({ message: 'Error agregando pedido' }); }
});

router.delete('/operaciones/pedidos/anular/:id', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [ex] = await externalDb.query("SELECT count(id_origen) as cont FROM web_pedidos WHERE id_origen = ?", [req.params.id]);
        if (ex[0].cont > 0) return res.status(400).json({ message: "Pedido Confirmado. No Puede Anular." });
        await externalDb.query("DELETE FROM web_pedidos_temp WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Pedido Anulado' });
    } catch (error) { res.status(500).json({ message: 'Error anulando pedido' }); }
});

router.post('/operaciones/pedidos/confirmar', authenticateToken, async (req, res) => {
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
        } catch(e) {}
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
    } catch (error) { res.status(500).json({ message: 'Error al confirmar pedido: ' + error.message }); }
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

router.post('/operaciones/recordatorios', authenticateToken, async (req, res) => {
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
                let dFecha = new Date(iniciar + 'T12:00:00');
                let isPagado = false;
                if (repetir_desc === 'VEZ') { if (pagado) isPagado = true; }
                else if (repetir_desc === 'DIAS') { if (n > 1) dFecha.setDate(dFecha.getDate() + (n * repetir)); }
                else if (repetir_desc === 'MES') { if (n > 1) dFecha.setMonth(dFecha.getMonth() + (n - 1)); }
                else if (repetir_desc === 'AÑO' || repetir_desc === 'ANO') { if (n > 1) dFecha.setFullYear(dFecha.getFullYear() + n); }
                const formattedDate = dFecha.toISOString().split('T')[0];
                if (isPagado) {
                    await connection.query("INSERT INTO web_rc_recordatorios_vencimientos (id_recordatorio, vencimiento, estado, fecha_cancelacion, forma_pago) VALUES (?, ?, 'C', ?, ?)", [recordatorioId, formattedDate, fecPago, formaPago2]);
                } else {
                    await connection.query("INSERT INTO web_rc_recordatorios_vencimientos (id_recordatorio, vencimiento, estado, fecha_cancelacion, forma_pago) VALUES (?, ?, 'P', NULL, '')", [recordatorioId, formattedDate]);
                }
            }
            await connection.commit();
            res.json({ success: true, message: 'Recordatorio Guardado!' });
        } catch(errTx) { await connection.rollback(); throw errTx; } finally { connection.release(); }
    } catch (error) { res.status(500).json({ message: 'Error saving recordatorio: ' + error.message }); }
});

router.put('/operaciones/recordatorios/pagar/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { forma_pago, fecha_cancelacion } = req.body;
        const externalDb = await getExternalDb();
        await externalDb.query("UPDATE web_rc_recordatorios_vencimientos SET estado = 'C', fecha_cancelacion = ?, forma_pago = ? WHERE id = ?", [fecha_cancelacion, forma_pago, id]);
        res.json({ success: true, message: 'Pago Realizado!' });
    } catch (error) { res.status(500).json({ message: 'Error marking paid' }); }
});

router.delete('/operaciones/recordatorios/vencimiento/:id', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        await externalDb.query("DELETE FROM web_rc_recordatorios_vencimientos WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Recordatorio Eliminado!' });
    } catch (error) { res.status(500).json({ message: 'Error deleting vencimiento' }); }
});

module.exports = router;
