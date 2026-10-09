const express = require('express');
const router = express.Router();
const { getDb, getExternalDb, getAccountingDb, withRetry } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const energyLatamService = require('../services/energyLatamService');

const vencimientosViewPerms = [
    '/dashboard',
    'view_dashboard',
    'manage_recordatorios',
    '/dashboard/operaciones/recordatorios',
    '/dashboard/finanzas/resumen'
];

const pedidosViewPerms = [
    'manage_pedidos',
    '/dashboard/operaciones/pedidos',
    '/dashboard/operaciones/pedidos-programados',
    '/dashboard/estrategia/torre-control',
    '/dashboard/estrategia/combustible'
];

const recordatoriosViewPerms = [
    'manage_recordatorios',
    '/dashboard/operaciones/recordatorios',
    '/dashboard',
    'view_dashboard',
    '/dashboard/finanzas/resumen'
];

/**
 * Parsea y sanitiza los parámetros de paginación para consultas de pedidos.
 * Por defecto limita a 10 transacciones para no sobrecargar el sistema.
 * Permite ampliar a 20, 50, o 'all', y calcular offset progresivo (scroll infinito).
 */
function parsePedidosPagination(query = {}) {
    const rawLimit = query.limit;
    const rawOffset = query.offset;

    if (rawLimit === 'all' || rawLimit === 'ALL' || rawLimit === '-1') {
        const offset = Math.max(0, parseInt(rawOffset, 10) || 0);
        return { limit: null, offset, isAll: true };
    }

    let limit = 10; // 10 transacciones por defecto según requerimiento
    if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
        const parsed = parseInt(rawLimit, 10);
        if (isNaN(parsed) || parsed < 1) {
            limit = 1;
        } else {
            limit = parsed;
        }
    }

    let offset = 0;
    if (rawOffset !== undefined && rawOffset !== null && rawOffset !== '') {
        const parsedOff = parseInt(rawOffset, 10);
        offset = isNaN(parsedOff) || parsedOff < 0 ? 0 : parsedOff;
    }

    return { limit, offset, isAll: false };
}

/**
 * Determina si existen más registros disponibles por consultar
 */
function calculateHasMore(total, offset, countLoaded, isAll = false) {
    if (isAll) return false;
    const t = Number(total) || 0;
    const off = Number(offset) || 0;
    const loaded = Number(countLoaded) || 0;
    return (off + loaded) < t;
}

/**
 * Resuelve la condición SQL y parámetros para el filtro de estación.
 * Permite filtrar de forma inteligente por:
 *  - ID de empresa ('008', '002', '004', '006', '014', '015')
 *  - Nombre en web_consolidado ('ENERGY GAS COSTA DEL SOL', 'PUMA LA LOMA (SAN MARTÍN)', etc.)
 *  - Nombre en portal Puma ('PUMA COSTA DEL SOL', 'SHELL CHALCHUAPA', etc.)
 *  - Palabras clave ('COSTA', 'MIRAFLORES', 'DESVIO', 'CHALCHUAPA', 'LOMA', '14')
 */
function buildEstacionFilterClause(estacionInput) {
    if (!estacionInput) return null;
    const s = String(estacionInput).trim().toUpperCase();

    // 1. Costa del Sol (ENERGY GAS COSTA DEL SOL / PUMA COSTA DEL SOL)
    if (s === '008' || s.includes('COSTA') || s.includes('SOL') || s.includes('ENERGY GAS')) {
        return {
            sql: "(p.id_estacion = '008' OR p.estacion_nombre LIKE '%COSTA%' OR p.estacion_nombre LIKE '%SOL%')",
            params: []
        };
    }

    // 2. Puma Miraflores
    if (s === '002' || s.includes('MIRAFLORES')) {
        return {
            sql: "(p.id_estacion = '002' OR p.estacion_nombre LIKE '%MIRAFLORES%')",
            params: []
        };
    }

    // 3. Puma El Desvío
    if (s === '004' || s.includes('DESVIO') || s.includes('DESVÍO')) {
        return {
            sql: "(p.id_estacion = '004' OR p.estacion_nombre LIKE '%DESVIO%' OR p.estacion_nombre LIKE '%DESVÍO%')",
            params: []
        };
    }

    // 4. Shell Chalchuapa
    if (s === '006' || s.includes('CHALCHUAPA')) {
        return {
            sql: "(p.id_estacion = '006' OR p.estacion_nombre LIKE '%CHALCHUAPA%')",
            params: []
        };
    }

    // 5. Puma La Loma / San Martín / Inversiones LIL
    if (s === '014' || s.includes('LOMA') || s.includes('SAN MARTIN') || s.includes('SAN MARTÍN') || s.includes('LIL')) {
        return {
            sql: "(p.id_estacion = '014' OR p.estacion_nombre LIKE '%LOMA%' OR p.estacion_nombre LIKE '%SAN MARTIN%')",
            params: []
        };
    }

    // 6. Shell 14 Avenida
    if (s === '015' || s.includes('14 AVENIDA') || s.includes('14TA') || s.includes('14A') || s.includes('14 AV')) {
        return {
            sql: "(p.id_estacion = '015' OR p.estacion_nombre LIKE '%14 AVENIDA%' OR p.estacion_nombre LIKE '%14TA%')",
            params: []
        };
    }

    // Fallback genérico por coincidencia directa
    return {
        sql: "(p.id_estacion = ? OR p.estacion_nombre LIKE ?)",
        params: [estacionInput, `%${estacionInput}%`]
    };
}

// --- Dashboard / Vencimientos ---
router.get('/dashboard/vencimientos', authenticateToken, requirePermission(vencimientosViewPerms), async (req, res) => {
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
        sendSafeError(res, error, 'Error al consultar vencimientos'); 
    }
});

// --- Pedidos de Combustible ---
router.get('/operaciones/estaciones', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden");
        res.json(rows);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar estaciones'); 
    }
});

router.get('/operaciones/fecha-servidor', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT MAX(fecha) as fecha_servidor FROM lecturas_tanque");
        res.json({ fecha_servidor: rows[0]?.fecha_servidor || null });
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar fecha del servidor'); 
    }
});

router.get('/operaciones/fecha-servidor-global', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT CURDATE() as fecha_actual, DATE_SUB(CURDATE(), INTERVAL 1 DAY) as fecha_ayer");
        let fechaActual = rows[0]?.fecha_actual;
        let fechaAyer = rows[0]?.fecha_ayer;
        if (fechaActual instanceof Date) { fechaActual = fechaActual.toISOString().split('T')[0]; }
        if (fechaAyer instanceof Date) { fechaAyer = fechaAyer.toISOString().split('T')[0]; }
        res.json({ fecha_actual: fechaActual, fecha_ayer: fechaAyer });
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar fecha global del servidor'); 
    }
});

const OFFICIAL_ESTACIONES = [
    { id_empresa: '002', branch_id: 4, saas_branch_id: 4, titulo: 'Puma Miraflores', orden: 1 },
    { id_empresa: '006', branch_id: 3, saas_branch_id: 3, titulo: 'Shell Chalchuapa', orden: 2 },
    { id_empresa: '008', branch_id: 8, saas_branch_id: 8, titulo: 'Puma Costa del Sol', orden: 3 },
    { id_empresa: '014', branch_id: 1, saas_branch_id: 1, titulo: 'Puma La Loma (San Martín)', orden: 4 },
    { id_empresa: '015', branch_id: 2, saas_branch_id: 2, titulo: 'Shell 14 Avenida', orden: 5 }
];

async function resolveStationBranchId(accountingDb, id_empresa) {
    if (!id_empresa) return null;
    const cleanId = String(id_empresa).trim();
    const matched = OFFICIAL_ESTACIONES.find(s => s.id_empresa === cleanId || String(s.branch_id) === cleanId);
    if (matched) return matched.branch_id;
    if (!accountingDb) return null;
    try {
        const [settings] = await accountingDb.query('SELECT branch_id FROM gas_station_settings WHERE setting_key = ? AND setting_value = ? LIMIT 1', ['rrs_id_empresa', cleanId]);
        if (settings.length) return settings[0].branch_id;
        const parsed = parseInt(cleanId, 10);
        if (!isNaN(parsed)) {
            const [b] = await accountingDb.query('SELECT id FROM branches WHERE id = ? LIMIT 1', [parsed]);
            if (b.length) return b[0].id;
        }
    } catch (e) {
        console.warn('Error resolviendo branch_id para estación', id_empresa, e.message);
    }
    return null;
}

async function fetchTankReadings(id_empresa, fecha, externalDb, accountingDb) {
    // 1. Prioridad: nuevo sistema SaaS (accountingDb)
    if (accountingDb) {
        try {
            const branchId = await resolveStationBranchId(accountingDb, id_empresa);
            if (branchId) {
                const [closeoutRows] = await accountingDb.query(`
                    SELECT id, fecha_turno, numero_turno 
                    FROM gas_station_closeouts 
                    WHERE branch_id = ? AND fecha_turno <= ? AND estado = 'cerrado'
                    ORDER BY fecha_turno DESC, numero_turno DESC 
                    LIMIT 1
                `, [branchId, fecha]);

                if (closeoutRows.length) {
                    const closeout = closeoutRows[0];
                    const [tanks] = await accountingDb.query(`
                        SELECT 
                            t.codigo as id_tanque,
                            COALESCE(tr.lectura_actual, 0) as lectura,
                            t.capacidad,
                            t.reserva,
                            CASE 
                                WHEN t.tipo_combustible = 4 OR t.descripcion LIKE '%Ion%' THEN 'I'
                                WHEN t.tipo_combustible = 3 OR t.descripcion LIKE '%Diesel%' THEN 'D'
                                WHEN t.tipo_combustible = 2 OR t.descripcion LIKE '%Super%' THEN 'S'
                                WHEN t.tipo_combustible = 1 OR t.descripcion LIKE '%Regular%' THEN 'R'
                                ELSE 'D'
                            END as tipo_combustible
                        FROM gas_station_tanks t
                        LEFT JOIN gas_station_closeout_tank_readings tr ON t.id = tr.tank_id AND tr.closeout_id = ?
                        WHERE t.branch_id = ?
                        ORDER BY t.codigo
                    `, [closeout.id, branchId]);

                    if (tanks && tanks.length > 0) {
                        const effectiveDate = closeout.fecha_turno instanceof Date 
                            ? closeout.fecha_turno.toISOString().split('T')[0] 
                            : String(closeout.fecha_turno || fecha).split('T')[0];
                        return { fecha: effectiveDate, inventario: tanks };
                    }
                }
            }
        } catch (saasErr) {
            console.warn('SaaS datos-tanque warning:', saasErr.message);
        }
    }

    // 2. Fallback a base heredada (externalDb)
    if (externalDb) {
        try {
            const maxFechaQ = `SELECT MAX(fecha) as last_date FROM lecturas_tanque WHERE id_empresa = ? AND fecha <= ?`;
            const [maxRows] = await externalDb.query(maxFechaQ, [id_empresa, fecha]);
            let targetDate = fecha;
            if (maxRows.length && maxRows[0].last_date) {
                targetDate = maxRows[0].last_date;
                if (targetDate instanceof Date) { targetDate = targetDate.toISOString().split('T')[0]; }
            }
            const query = `
                SELECT 
                    b.id_producto AS id_tanque, 
                    SUM(b.lectura) AS lectura, 
                    SUM(
                        CASE 
                            WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%DIESEL%' OR (a.id LIKE '%-T' AND b.codigo_producto = '03')) THEN 5000
                            WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%SUPER%' OR (a.id LIKE '%-T' AND b.codigo_producto = '01')) THEN 3000
                            WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%REGULAR%' OR (a.id LIKE '%-T' AND b.codigo_producto = '02')) THEN 
                                IF(a.id LIKE '%-T', 6000, c.capacidad)
                            ELSE COALESCE(c.capacidad, 0)
                        END
                    ) AS capacidad, 
                    SUM(
                        CASE 
                            WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%DIESEL%' OR (a.id LIKE '%-T' AND b.codigo_producto = '03')) THEN 86
                            WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%SUPER%' OR (a.id LIKE '%-T' AND b.codigo_producto = '01')) THEN 86
                            WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%REGULAR%' OR (a.id LIKE '%-T' AND b.codigo_producto = '02')) THEN 
                                IF(a.id LIKE '%-T', 105, c.galones_reserva)
                            ELSE COALESCE(c.galones_reserva, 0)
                        END
                    ) AS reserva, 
                    CASE 
                        WHEN a.id_empresa = '008' THEN 
                            CASE 
                                WHEN b.descripcion LIKE '%DIESEL%' OR (a.id LIKE '%-T' AND b.codigo_producto = '03') THEN 'D'
                                WHEN b.descripcion LIKE '%SUPER%' OR (a.id LIKE '%-T' AND b.codigo_producto = '01') THEN 'S'
                                WHEN b.descripcion LIKE '%REGULAR%' OR (a.id LIKE '%-T' AND b.codigo_producto = '02') THEN 'R'
                                ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                            END
                        ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                    END AS tipo_combustible
                FROM lecturas_tanque a 
                INNER JOIN (
                    SELECT id_empresa, fecha, MAX(turno) as max_turno 
                    FROM lecturas_tanque 
                    WHERE id_empresa = ? AND fecha = ?
                    GROUP BY id_empresa, fecha
                ) m ON a.id_empresa = m.id_empresa AND a.fecha = m.fecha AND a.turno = m.max_turno
                INNER JOIN detalle_lecturas_tanque b ON a.id = b.id_lectura AND a.id_empresa = b.id_empresa 
                LEFT JOIN tanques c ON b.codigo_producto = c.id AND b.id_empresa = c.id_empresa 
                WHERE a.id_empresa = ? AND a.fecha = ?
                GROUP BY 
                    CASE 
                        WHEN a.id_empresa = '008' THEN 
                            CASE 
                                WHEN b.descripcion LIKE '%DIESEL%' OR (a.id LIKE '%-T' AND b.codigo_producto = '03') THEN 'D'
                                WHEN b.descripcion LIKE '%SUPER%' OR (a.id LIKE '%-T' AND b.codigo_producto = '01') THEN 'S'
                                WHEN b.descripcion LIKE '%REGULAR%' OR (a.id LIKE '%-T' AND b.codigo_producto = '02') THEN 'R'
                                ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                            END
                        ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                    END
            `;
            const [rows] = await externalDb.query(query, [id_empresa, targetDate, id_empresa, targetDate]);
            return { fecha: targetDate, inventario: rows || [] };
        } catch (extErr) {
            console.warn('ExternalDb datos-tanque warning:', extErr.message);
        }
    }

    return { fecha: fecha, inventario: [] };
}

async function fetchPromedios(id_empresa, fecha, externalDb, accountingDb) {
    const agg = { D: 0, R: 0, S: 0, I: 0 };

    // 1. Prioridad: nuevo sistema SaaS (accountingDb)
    if (accountingDb) {
        try {
            const branchId = await resolveStationBranchId(accountingDb, id_empresa);
            if (branchId) {
                const cleanDate = fecha.includes('T') ? fecha.split('T')[0] : fecha;
                const cHasta = new Date(cleanDate + 'T12:00:00');
                const cDesde = new Date(cleanDate + 'T12:00:00');
                cDesde.setDate(cDesde.getDate() - 6);
                const dateDesde = cDesde.toISOString().split('T')[0];
                const dateHasta = cHasta.toISOString().split('T')[0];

                const [rows] = await accountingDb.query(`
                    SELECT 
                        CASE 
                            WHEN r.descripcion_producto LIKE '%REGULAR%' THEN 'R'
                            WHEN r.descripcion_producto LIKE '%SUPER%' THEN 'S'
                            WHEN r.descripcion_producto LIKE '%ION%' THEN 'I'
                            ELSE 'D'
                        END as tipo_combustible,
                        SUM(r.diferencia) / 7 as promedio
                    FROM gas_station_closeouts c
                    JOIN gas_station_closeout_readings r ON r.closeout_id = c.id
                    WHERE c.branch_id = ? 
                      AND c.fecha_turno BETWEEN ? AND ? 
                      AND c.estado = 'cerrado'
                    GROUP BY tipo_combustible
                `, [branchId, dateDesde, dateHasta]);

                let totalProm = 0;
                (rows || []).forEach(r => {
                    if (['D', 'R', 'S', 'I'].includes(r.tipo_combustible)) {
                        agg[r.tipo_combustible] = Number(r.promedio || 0);
                        totalProm += Number(r.promedio || 0);
                    }
                });

                if (totalProm > 0) {
                    return agg;
                }
            }
        } catch (saasErr) {
            console.warn('SaaS promedios warning:', saasErr.message);
        }
    }

    // 2. Fallback a base heredada (externalDb)
    if (externalDb) {
        try {
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
            (rows || []).forEach(r => {
                if (['D', 'R', 'S', 'I'].includes(r.tipo_combustible)) {
                    agg[r.tipo_combustible] += Number(r.promedio || 0);
                }
            });
        } catch (extErr) {
            console.warn('ExternalDb promedios warning:', extErr.message);
        }
    }

    return agg;
}

router.get('/operaciones/pedidos/datos-tanque/:id_empresa/:fecha', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const { id_empresa, fecha } = req.params;
        const externalDb = await getExternalDb().catch(() => null);
        const accountingDb = await getAccountingDb().catch(() => null);
        const data = await fetchTankReadings(id_empresa, fecha, externalDb, accountingDb);
        res.json(data);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar datos de tanque'); 
    }
});

router.get('/operaciones/pedidos/promedios/:id_empresa/:fecha', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const { id_empresa, fecha } = req.params;
        const externalDb = await getExternalDb().catch(() => null);
        const accountingDb = await getAccountingDb().catch(() => null);
        const promedios = await fetchPromedios(id_empresa, fecha, externalDb, accountingDb);
        res.json(promedios);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar promedios de pedidos'); 
    }
});

// Asegurar columnas de viaje compartido en web_pedidos_temp
let sharedColsChecked = false;
async function ensureSharedColumns(db) {
    if (sharedColsChecked) return;
    try {
        await db.query("ALTER TABLE web_pedidos_temp ADD COLUMN id_estacion_compartida VARCHAR(50) NULL");
    } catch (e) { /* columna ya existe */ }
    try {
        await db.query("ALTER TABLE web_pedidos_temp ADD COLUMN id_pedido_compartido INT NULL");
    } catch (e) { /* columna ya existe */ }
    sharedColsChecked = true;
}

router.get('/operaciones/pedidos/programados/:id_estacion/:fecha', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const { id_estacion, fecha } = req.params;
        const externalDb = await getExternalDb();
        await ensureSharedColumns(externalDb);
        const query = `
            SELECT t.fecha, t.numero, t.diesel, t.regular, t.super, t.iondiesel,
                   IFNULL(t.id_carrier_local, t.id_transportista) as id_transportista,
                   IFNULL(t.id_tanker_local, t.id_calibracion_diesel) as id_calibracion_diesel,
                   t.id as id_pedido,
                   t.id_estacion_compartida,
                   t.id_pedido_compartido,
                   e2.titulo as nombre_estacion_compartida,
                   t2.diesel as diesel_compartido,
                   t2.regular as regular_compartido,
                   t2.super as super_compartido,
                   t2.iondiesel as iondiesel_compartido
            FROM web_pedidos_temp t
            LEFT JOIN web_consolidado e2 ON t.id_estacion_compartida = e2.id_empresa AND e2.grupo = 'ESTACION'
            LEFT JOIN web_pedidos_temp t2 ON t.id_pedido_compartido = t2.id
            WHERE t.id_estacion = ? AND t.fecha > ? ORDER BY t.fecha
        `;
        const [rows] = await externalDb.query(query, [id_estacion, fecha]);
        res.json(rows);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar pedidos programados'); 
    }
});

router.get('/operaciones/pedidos-programados/consolidado', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const localDb = getDb();
        await ensureSharedColumns(externalDb);

        // Fetch carriers and tankers from local DB for human-readable labels
        let carrierMap = {};
        let tankerMap = {};
        try {
            const [carriers] = await localDb.query('SELECT id, name FROM carriers');
            const [tankers] = await localDb.query('SELECT id, plate FROM tankers');
            carrierMap = Object.fromEntries(carriers.map(c => [c.id, c.name]));
            tankerMap = Object.fromEntries(tankers.map(t => [t.id, t.plate]));
        } catch (e) {
            console.warn('Error preloading carriers/tankers:', e.message);
        }

        // Determine fecha_actual and fecha_corte
        const [fechaRows] = await externalDb.query("SELECT CURDATE() as fecha_actual, DATE_SUB(CURDATE(), INTERVAL 1 DAY) as fecha_ayer");
        let fechaActual = fechaRows[0]?.fecha_actual;
        let fechaAyer = fechaRows[0]?.fecha_ayer;
        if (fechaActual instanceof Date) fechaActual = fechaActual.toISOString().split('T')[0];
        if (fechaAyer instanceof Date) fechaAyer = fechaAyer.toISOString().split('T')[0];

        // Stations
        const [estaciones] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY id_empresa");

        const accountingDb = await getAccountingDb().catch(() => null);

        // Compute rows for each station in parallel
        const rows = await Promise.all(estaciones.map(async (est) => {
            const orderQ = `
                SELECT t.id as id_pedido, t.fecha, t.numero, t.diesel, t.regular, t.super, t.iondiesel,
                       IFNULL(t.id_carrier_local, t.id_transportista) as id_transportista,
                       IFNULL(t.id_tanker_local, t.id_calibracion_diesel) as id_calibracion_diesel,
                       t.id_estacion_compartida,
                       t.id_pedido_compartido,
                       e2.titulo as nombre_estacion_compartida
                FROM web_pedidos_temp t
                LEFT JOIN web_consolidado e2 ON t.id_estacion_compartida = e2.id_empresa AND e2.grupo = 'ESTACION'
                WHERE t.id_estacion = ? AND t.fecha > ?
                ORDER BY t.fecha ASC, t.id ASC
            `;
            const [orders] = await externalDb.query(orderQ, [est.id_empresa, fechaAyer]);

            const sumProg = { D: 0, R: 0, S: 0, I: 0 };
            const enrichedOrders = orders.map(o => {
                const d = Number(o.diesel || 0);
                const r = Number(o.regular || 0);
                const s = Number(o.super || 0);
                const i = Number(o.iondiesel || 0);
                sumProg.D += d;
                sumProg.R += r;
                sumProg.S += s;
                sumProg.I += i;
                return {
                    id_pedido: o.id_pedido,
                    fecha: o.fecha instanceof Date ? o.fecha.toISOString().split('T')[0] : (o.fecha || '').split('T')[0],
                    numero: o.numero || '',
                    diesel: d,
                    regular: r,
                    super: s,
                    iondiesel: i,
                    total_galones: d + r + s + i,
                    transportista_nombre: carrierMap[o.id_transportista] || 'Sin asignar',
                    pipa_placa: tankerMap[o.id_calibracion_diesel] || 'Sin asignar',
                    nombre_estacion_compartida: o.nombre_estacion_compartida || null
                };
            });

            const tanquesData = await fetchTankReadings(est.id_empresa, fechaAyer, externalDb, accountingDb);
            const tanques = tanquesData.inventario || [];
            const promedios = await fetchPromedios(est.id_empresa, fechaAyer, externalDb, accountingDb);

            const getInv = (tipo) => {
                const items = tanques.filter(t => t.tipo_combustible === tipo);
                return items.reduce((acc, curr) => ({
                    capacidad: acc.capacidad + Number(curr.capacidad || 0),
                    reserva: acc.reserva + Number(curr.reserva || 0),
                    lectura: acc.lectura + Number(curr.lectura || 0)
                }), { capacidad: 0, reserva: 0, lectura: 0 });
            };

            const calcType = (tipo) => {
                const tk = getInv(tipo);
                const prom = Number(promedios[tipo] || 0);
                const prog = Number(sumProg[tipo] || 0);
                let durDias = 0;
                if (prom > 0) {
                    durDias = Math.max(0, (tk.lectura + prog - tk.reserva) / prom);
                }
                durDias = Math.round(durDias * 10) / 10;

                let nivel = 0;
                if (tk.capacidad > 0) {
                    nivel = Math.round(((tk.lectura + prog) / tk.capacidad) * 100);
                }

                let fechaStr = "";
                if (durDias > 0 && fechaAyer) {
                    const cleanDate = fechaAyer.includes('T') ? fechaAyer.split('T')[0] : fechaAyer;
                    const parts = cleanDate.split('-').map(Number);
                    if (parts.length === 3) {
                        const [y, m, d] = parts;
                        const target = new Date(y, m - 1, d + Math.floor(durDias));
                        const dd = String(target.getDate()).padStart(2, '0');
                        const mm = String(target.getMonth() + 1).padStart(2, '0');
                        const yyyy = target.getFullYear();
                        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                        fechaStr = `${dd}/${mm}/${yyyy} (${days[target.getDay()]})`;
                    }
                }

                return {
                    durDias,
                    fechaStr,
                    inventario: tk.lectura,
                    capacidad: tk.capacidad,
                    reserva: tk.reserva,
                    promedio: prom,
                    programado: prog,
                    nivel
                };
            };

            const D = calcType('D');
            const I = calcType('I');
            const R = calcType('R');
            const S = calcType('S');

            const totalPedido = sumProg.D + sumProg.I + sumProg.R + sumProg.S;

            return {
                id_empresa: est.id_empresa,
                estacion: est.titulo,
                pedido_diesel: sumProg.D,
                pedido_diesel_ion: sumProg.I,
                pedido_regular: sumProg.R,
                pedido_super: sumProg.S,
                total_pedido: totalPedido,
                d_d: D.durDias,
                d_i: I.durDias,
                d_r: R.durDias,
                d_s: S.durDias,
                fecha_diesel: D.fechaStr,
                fecha_diesel_ion: I.fechaStr,
                fecha_regular: R.fechaStr,
                fecha_super: S.fechaStr,
                tanques_detalle: { D, I, R, S },
                pedidos: enrichedOrders,
                pedidos_count: enrichedOrders.length
            };
        }));

        // Totals
        const totales = {
            pedido_diesel: rows.reduce((s, r) => s + r.pedido_diesel, 0),
            pedido_diesel_ion: rows.reduce((s, r) => s + r.pedido_diesel_ion, 0),
            pedido_regular: rows.reduce((s, r) => s + r.pedido_regular, 0),
            pedido_super: rows.reduce((s, r) => s + r.pedido_super, 0),
            total_general: rows.reduce((s, r) => s + r.total_pedido, 0),
            total_pedidos_activos: rows.reduce((s, r) => s + r.pedidos_count, 0)
        };

        res.json({
            fecha_actual: fechaActual,
            fecha_corte: fechaAyer,
            timestamp: new Date().toISOString(),
            estaciones: rows,
            totales
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar consolidado de pedidos programados');
    }
});

router.post('/operaciones/pedidos/agregar', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const {
            id_pedido,
            id_estacion,
            fecha,
            id_transportista,
            diesel,
            regular,
            super: s,
            iondiesel,
            id_calibracion_diesel,
            es_compartido,
            id_estacion_compartida,
            diesel_compartido,
            regular_compartido,
            super_compartido,
            iondiesel_compartido
        } = req.body;
        const externalDb = await getExternalDb();
        await ensureSharedColumns(externalDb);

        if (id_pedido) {
            await externalDb.query(`UPDATE web_pedidos_temp SET fecha=?, id_carrier_local=?, diesel=?, regular=?, super=?, iondiesel=?, id_tanker_local=?, id_estacion_compartida=? WHERE id=?`, 
                [fecha, id_transportista, diesel || 0, regular || 0, s || 0, iondiesel || 0, id_calibracion_diesel || null, es_compartido ? id_estacion_compartida : null, id_pedido]);

            // Sincronizar fecha, pipa y cantidades con el pedido compañero si existe
            const [curr] = await externalDb.query("SELECT id_pedido_compartido FROM web_pedidos_temp WHERE id = ?", [id_pedido]);
            if (curr.length && curr[0].id_pedido_compartido) {
                if (es_compartido) {
                    await externalDb.query(`UPDATE web_pedidos_temp SET fecha=?, id_carrier_local=?, id_tanker_local=?, diesel=?, regular=?, super=?, iondiesel=?, id_estacion_compartida=? WHERE id=?`, 
                        [fecha, id_transportista, id_calibracion_diesel || null, diesel_compartido || 0, regular_compartido || 0, super_compartido || 0, iondiesel_compartido || 0, id_estacion, curr[0].id_pedido_compartido]);
                } else {
                    await externalDb.query("DELETE FROM web_pedidos_temp WHERE id = ?", [curr[0].id_pedido_compartido]);
                    await externalDb.query("UPDATE web_pedidos_temp SET id_pedido_compartido = NULL, id_estacion_compartida = NULL WHERE id = ?", [id_pedido]);
                }
            } else if (es_compartido && id_estacion_compartida) {
                const [res2] = await externalDb.query(`
                    INSERT INTO web_pedidos_temp 
                    (id_estacion, fecha, id_carrier_local, diesel, regular, super, iondiesel, id_tanker_local, id_estacion_compartida, id_pedido_compartido) 
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                `, [id_estacion_compartida, fecha, id_transportista, diesel_compartido || 0, regular_compartido || 0, super_compartido || 0, iondiesel_compartido || 0, id_calibracion_diesel || null, id_estacion, id_pedido]);
                await externalDb.query("UPDATE web_pedidos_temp SET id_pedido_compartido = ?, id_estacion_compartida = ? WHERE id = ?", [res2.insertId, id_estacion_compartida, id_pedido]);
            }
        } else {
            if (es_compartido && id_estacion_compartida) {
                const totalComp = Number(diesel_compartido || 0) + Number(regular_compartido || 0) + Number(super_compartido || 0) + Number(iondiesel_compartido || 0);
                if (totalComp > 0) {
                    // 1. Insertar entrega para la estación principal
                    const [res1] = await externalDb.query(`
                        INSERT INTO web_pedidos_temp 
                        (id_estacion, fecha, id_carrier_local, diesel, regular, super, iondiesel, id_tanker_local, id_estacion_compartida) 
                        VALUES (?,?,?,?,?,?,?,?,?)
                    `, [id_estacion, fecha, id_transportista, diesel || 0, regular || 0, s || 0, iondiesel || 0, id_calibracion_diesel || null, id_estacion_compartida]);
                    const id1 = res1.insertId;

                    // 2. Insertar entrega para la estación compañera
                    const [res2] = await externalDb.query(`
                        INSERT INTO web_pedidos_temp 
                        (id_estacion, fecha, id_carrier_local, diesel, regular, super, iondiesel, id_tanker_local, id_estacion_compartida, id_pedido_compartido) 
                        VALUES (?,?,?,?,?,?,?,?,?,?)
                    `, [id_estacion_compartida, fecha, id_transportista, diesel_compartido || 0, regular_compartido || 0, super_compartido || 0, iondiesel_compartido || 0, id_calibracion_diesel || null, id_estacion, id1]);
                    const id2 = res2.insertId;

                    // 3. Vincular id de la segunda entrega en la principal
                    await externalDb.query("UPDATE web_pedidos_temp SET id_pedido_compartido = ? WHERE id = ?", [id2, id1]);

                    return res.json({ success: true, message: '¡Viaje Compartido programado exitosamente para ambas estaciones!' });
                }
            }

            // Pedido regular de una sola estación
            await externalDb.query(`INSERT INTO web_pedidos_temp (id_estacion, fecha, id_carrier_local, diesel, regular, super, iondiesel, id_tanker_local) VALUES (?,?,?,?,?,?,?,?)`, 
                [id_estacion, fecha, id_transportista, diesel || 0, regular || 0, s || 0, iondiesel || 0, id_calibracion_diesel || null]);
        }
        res.json({ success: true, message: 'Pedido Guardado!' });
    } catch (error) { sendSafeError(res, error, 'Error agregando pedido'); }
});

router.delete('/operaciones/pedidos/anular/:id', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        await ensureSharedColumns(externalDb);
        const [ex] = await externalDb.query("SELECT count(id_origen) as cont FROM web_pedidos WHERE id_origen = ?", [req.params.id]);
        if (ex[0].cont > 0) return res.status(400).json({ message: "Pedido Confirmado. No Puede Anular." });

        // Si tiene pedido compartido vinculado, anular también el compañero si no está confirmado
        const [row] = await externalDb.query("SELECT id_pedido_compartido FROM web_pedidos_temp WHERE id = ?", [req.params.id]);
        if (row.length && row[0].id_pedido_compartido) {
            const partnerId = row[0].id_pedido_compartido;
            const [exPartner] = await externalDb.query("SELECT count(id_origen) as cont FROM web_pedidos WHERE id_origen = ?", [partnerId]);
            if (!exPartner[0].cont) {
                await externalDb.query("DELETE FROM web_pedidos_temp WHERE id = ?", [partnerId]);
            }
        }

        await externalDb.query("DELETE FROM web_pedidos_temp WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Pedido Anulado' });
    } catch (error) { sendSafeError(res, error, 'Error anulando pedido'); }
});

router.post('/operaciones/pedidos/confirmar', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { id_pedido, numero, id_estacion, forma_pago, costo_d, costo_s, costo_r, costo_i } = req.body;
        const externalDb = await getExternalDb();
        await ensureSharedColumns(externalDb);
        const [exCheck] = await externalDb.query("SELECT count(id_origen) as cont FROM web_pedidos WHERE id_origen = ?", [id_pedido]);
        if (exCheck[0].cont > 0) return res.status(400).json({ message: "Pedido Confirmado. No Puede Volver a Confirmar." });
        const [tempReq] = await externalDb.query("SELECT * FROM web_pedidos_temp WHERE id = ?", [id_pedido]);
        if (!tempReq.length) return res.status(404).json({ message: "Pedido temporal no encontrado." });
        const p = tempReq[0];

        // Verificar si tiene entrega compañera vinculada
        let partnerReq = null;
        if (p.id_pedido_compartido) {
            const [pRows] = await externalDb.query("SELECT * FROM web_pedidos_temp WHERE id = ?", [p.id_pedido_compartido]);
            if (pRows.length) partnerReq = pRows[0];
        }

        const nTotal = Number(p.diesel || 0) + Number(p.regular || 0) + Number(p.super || 0) + Number(p.iondiesel || 0);
        const partnerTotal = partnerReq ? (Number(partnerReq.diesel || 0) + Number(partnerReq.regular || 0) + Number(partnerReq.super || 0) + Number(partnerReq.iondiesel || 0)) : 0;
        const granTotalViaje = nTotal + partnerTotal;

        const pipa = granTotalViaje >= 8000 ? 8000 : 4000;
        const fleteCol = granTotalViaje >= 8000 ? "pipa8000" : "pipa4000";
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
                    [p.diesel, p.regular, p.super, p.iondiesel, granTotalViaje, numero]);
            } else {
                await connection.query(`INSERT INTO web_pedidos (fecha, numero, id_estacion, forma_pago, p_diesel, p_regular, p_super, p_ion, id_carrier_local, id_tanker_local, flete, pipa, costo_d, costo_s, costo_r, costo_i, id_origen, compartido) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 
                    [cDate, numero, id_estacion, forma_pago, p.diesel, p.regular, p.super, p.iondiesel, p.id_carrier_local, p.id_tanker_local, flete, pipa, costo_d || 0, costo_s || 0, costo_r || 0, costo_i || 0, id_pedido, partnerReq ? granTotalViaje : 0]);
            }
            await connection.query("UPDATE web_pedidos_temp SET numero = ? WHERE id = ?", [numero, id_pedido]);

            // Si hay pedido compartido vinculado, confirmarlo también con el mismo número de orden del portal
            if (partnerReq) {
                await connection.query("UPDATE web_pedidos_temp SET numero = ? WHERE id = ?", [numero, partnerReq.id]);
                await connection.query("UPDATE web_pedidos SET p_diesel = p_diesel + ?, p_regular = p_regular + ?, p_super = p_super + ?, p_ion = p_ion + ?, compartido = ? WHERE numero = ?", 
                    [partnerReq.diesel, partnerReq.regular, partnerReq.super, partnerReq.iondiesel, granTotalViaje, numero]);
            }

            await connection.commit();
            res.json({ success: true, message: partnerReq ? '¡Viaje Compartido confirmado exitosamente para ambas estaciones!' : 'Pedido Confirmado y Creado!' });
        } catch(errTransaction) {
            await connection.rollback();
            throw errTransaction;
        } finally {
            connection.release();
        }
    } catch (error) { sendSafeError(res, error, 'Error al confirmar pedido'); }
});

// --- RECORDATORIOS / PAGOS ---
router.get('/operaciones/recordatorios/ubicaciones', authenticateToken, requirePermission(recordatoriosViewPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT id, descripcion FROM web_rc_ubicaciones ORDER BY descripcion");
        res.json(rows);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar ubicaciones'); 
    }
});

router.get('/operaciones/recordatorios', authenticateToken, requirePermission(recordatoriosViewPerms), async (req, res) => {
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
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar recordatorios'); 
    }
});

router.get('/operaciones/recordatorios/:id', authenticateToken, requirePermission(recordatoriosViewPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT * FROM web_rc_recordatorios WHERE id = ?", [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
        const [pagados] = await externalDb.query("SELECT COUNT(*) as cont FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = ? AND estado = 'C'", [req.params.id]);
        res.json({ recordatorio: rows[0], pagados: pagados[0].cont });
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar detalle del recordatorio'); 
    }
});

router.get('/operaciones/recordatorios/parents/buscar', authenticateToken, requirePermission(recordatoriosViewPerms), async (req, res) => {
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
    } catch (error) { 
        sendSafeError(res, error, 'Error al buscar recordatorios principales'); 
    }
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

let portalTablesInitialized = false;
let portalInitPromise = null;

async function ensurePortalTablesAndSeed(db) {
    if (portalTablesInitialized) return;
    if (portalInitPromise) return portalInitPromise;

    portalInitPromise = (async () => {
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

        const [cnt] = await db.query('SELECT COUNT(*) as c, COUNT(DISTINCT id_estacion) as distinct_est FROM portal_pedidos');
        if (cnt[0].c < 250 || (cnt[0].distinct_est || 0) < 4) {
            console.log('[ensurePortalTablesAndSeed] Seeding complete multi-station orders from snapshot...');
            await energyLatamService.seedInitialPortalOrders(true);
        }

        // Asegurar que las órdenes en la base de datos tengan su id_estacion y nombre normalizado
        await db.query(`
            UPDATE portal_pedidos SET id_estacion = '008', estacion_nombre = 'PUMA COSTA DEL SOL'
            WHERE (id_estacion IS NULL OR id_estacion = '' OR id_estacion != '008') 
              AND (estacion_nombre LIKE '%COSTA%' OR raw_data_json LIKE '%COSTA%')
        `);
        await db.query(`
            UPDATE portal_pedidos SET id_estacion = '002', estacion_nombre = 'PUMA MIRAFLORES'
            WHERE (id_estacion IS NULL OR id_estacion = '' OR id_estacion != '002') 
              AND (estacion_nombre LIKE '%MIRAFLORES%' OR raw_data_json LIKE '%MIRAFLORES%')
        `);
        await db.query(`
            UPDATE portal_pedidos SET id_estacion = '004', estacion_nombre = 'PUMA EL DESVIO'
            WHERE (id_estacion IS NULL OR id_estacion = '' OR id_estacion != '004') 
              AND (estacion_nombre LIKE '%DESVIO%' OR estacion_nombre LIKE '%DESVÍO%' OR raw_data_json LIKE '%DESVIO%')
        `);
        await db.query(`
            UPDATE portal_pedidos SET id_estacion = '006', estacion_nombre = 'SHELL CHALCHUAPA'
            WHERE (id_estacion IS NULL OR id_estacion = '' OR id_estacion != '006') 
              AND (estacion_nombre LIKE '%CHALCHUAPA%' OR raw_data_json LIKE '%CHALCHUAPA%')
        `);
        await db.query(`
            UPDATE portal_pedidos SET id_estacion = '014', estacion_nombre = 'PUMA LA LOMA'
            WHERE (id_estacion IS NULL OR id_estacion = '' OR id_estacion != '014') 
              AND (estacion_nombre LIKE '%LOMA%' OR estacion_nombre LIKE '%SAN MARTIN%' OR raw_data_json LIKE '%INVERSIONES LIL%')
        `);
        await db.query(`
            UPDATE portal_pedidos SET id_estacion = '015', estacion_nombre = 'SHELL 14 AVENIDA'
            WHERE (id_estacion IS NULL OR id_estacion = '' OR id_estacion != '015') 
              AND (estacion_nombre LIKE '%14 AVENIDA%' OR raw_data_json LIKE '%14 AVENIDA%')
        `);
        portalTablesInitialized = true;
        } catch(err) {
            console.warn('[ensurePortalTablesAndSeed] Note:', err.message);
        } finally {
            portalInitPromise = null;
        }
    })();

    return portalInitPromise;
}

// 1. Obtener listado de pedidos del portal
router.get('/operaciones/portal/pedidos', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const db = getDb();
        await ensurePortalTablesAndSeed(db);

        const { estacion, estado, tipo_producto, estado_pago, desde, hasta, search } = req.query;
        const pagination = parsePedidosPagination(req.query);

        let whereClause = " WHERE 1=1 ";
        const filterParams = [];

        if (estacion) {
            const estCond = buildEstacionFilterClause(estacion);
            if (estCond) {
                whereClause += ` AND ${estCond.sql}`;
                filterParams.push(...estCond.params);
            }
        }
        if (estado) {
            whereClause += " AND p.estado = ?";
            filterParams.push(estado);
        }
        if (tipo_producto) {
            whereClause += " AND p.tipo_producto = ?";
            filterParams.push(tipo_producto);
        }
        if (estado_pago) {
            whereClause += " AND p.estado_pago = ?";
            filterParams.push(estado_pago);
        }
        if (desde && hasta) {
            whereClause += " AND DATE(p.fecha_pedido) BETWEEN ? AND ?";
            filterParams.push(desde, hasta);
        }
        if (search) {
            const estSearchCond = buildEstacionFilterClause(search);
            if (estSearchCond && estSearchCond.params.length === 0) {
                whereClause += ` AND (${estSearchCond.sql} OR p.numero_orden LIKE ? OR p.factura_numero LIKE ? OR p.razon_estado LIKE ?)`;
                const s = `%${search}%`;
                filterParams.push(s, s, s);
            } else {
                whereClause += " AND (p.numero_orden LIKE ? OR p.factura_numero LIKE ? OR p.estacion_nombre LIKE ? OR p.razon_estado LIKE ?)";
                const s = `%${search}%`;
                filterParams.push(s, s, s, s);
            }
        }

        // 1. Obtener conteo total para cálculo de páginas y scroll infinito
        const countQuery = `SELECT COUNT(*) as total FROM portal_pedidos p ${whereClause}`;
        const [countRows] = await withRetry(() => db.query(countQuery, filterParams));
        const total = countRows[0]?.total || 0;

        // 2. Consulta de registros con límite y desplazamiento
        let query = `
            SELECT p.*,
                   cb.numero as cuenta_numero, cb.nombre as cuenta_nombre, b.descripcion as banco_nombre,
                   m.documento as mov_documento, m.fecha_aplicado as mov_fecha_aplicado,
                   IF(m.fecha_aplicado IS NOT NULL, 1, 0) as es_conciliado
            FROM portal_pedidos p
            LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
            LEFT JOIN bancos b ON cb.banco_id = b.id
            LEFT JOIN movimientos_bancarios m ON p.movimiento_bancario_id = m.id
            ${whereClause}
            ORDER BY p.fecha_pedido DESC
        `;

        const queryParams = [...filterParams];
        if (!pagination.isAll && pagination.limit !== null) {
            query += " LIMIT ? OFFSET ?";
            queryParams.push(pagination.limit, pagination.offset);
        }

        const [rows] = await withRetry(() => db.query(query, queryParams));
        const hasMore = calculateHasMore(total, pagination.offset, rows.length, pagination.isAll);

        res.json({
            success: true,
            data: rows,
            total,
            limit: pagination.limit,
            offset: pagination.offset,
            hasMore
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener pedidos del portal');
    }
});

// 2. Resumen de cuenta del portal (saldo disponible, crédito, etc.)
router.get('/operaciones/portal/resumen-cuenta', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
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
        const limitParam = req.body?.limit;
        const limit = limitParam !== undefined ? (limitParam === 'all' ? 50 : Math.min(50, Math.max(1, parseInt(limitParam, 10) || 10))) : 10;
        const result = await energyLatamService.syncFromPortal(io, null, limit);
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al sincronizar con el portal Energy Latam');
    }
});

// 3b. Diagnosticar estado de conexión con el portal Puma / Salesforce
router.get('/operaciones/portal/diagnostico', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const result = await energyLatamService.checkPortalStatus();
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al diagnosticar portal');
    }
});

// 3c. Enviar código de verificación OTP a Salesforce (2FA)
router.post('/operaciones/portal/verificar-codigo', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { code } = req.body;
        const result = await energyLatamService.submit2FACode(code);
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al procesar código de verificación');
    }
});

// 3d. Consultar estado y configuración de credenciales del portal Energy Latam
router.get('/operaciones/portal/credenciales', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const creds = await energyLatamService.getPortalCredentials();
        res.json({
            success: true,
            configured: Boolean(creds.user && creds.pass),
            user: creds.user || '',
            hasPassword: Boolean(creds.pass),
            source: creds.source,
            url: creds.url
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar credenciales del portal');
    }
});

// 3e. Guardar credenciales de acceso al portal Energy Latam
router.post('/operaciones/portal/credenciales', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { user, password, url } = req.body;
        if (!user || !String(user).trim()) {
            return res.status(400).json({ error: 'El usuario o correo electrónico es obligatorio' });
        }
        if (!password || !String(password).trim()) {
            return res.status(400).json({ error: 'La contraseña es obligatoria' });
        }
        const result = await energyLatamService.savePortalCredentials({ user, password, url });
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al guardar credenciales del portal');
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
router.get('/operaciones/portal/precios-combustible', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
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

router.parsePedidosPagination = parsePedidosPagination;
router.calculateHasMore = calculateHasMore;
router.buildEstacionFilterClause = buildEstacionFilterClause;

module.exports = router;
module.exports.parsePedidosPagination = parsePedidosPagination;
module.exports.calculateHasMore = calculateHasMore;
module.exports.buildEstacionFilterClause = buildEstacionFilterClause;
