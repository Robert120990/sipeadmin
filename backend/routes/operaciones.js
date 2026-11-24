const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb, getExternalDb, getAccountingDb, withRetry } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const energyLatamService = require('../services/energyLatamService');
const solarEnergyService = require('../services/solarEnergyService');
const salesHourlyService = require('../services/salesHourlyService');
const recordatoriosPagosService = require('../services/recordatoriosPagosService');
const { signUploadUrl } = require('../utils/uploadSigner');

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

const recordatoriosManagePerms = [
    'manage_recordatorios',
    '/dashboard/operaciones/recordatorios'
];

const pedidosManagePerms = [
    'manage_pedidos',
    '/dashboard/operaciones/pedidos'
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

    // 3. Shell Poliedro (prioridad sobre Desvío de Opico)
    if (s === '016' || s === '7' || s === '12' || s.includes('POLIEDRO') || s.includes('OPICO')) {
        return {
            sql: "(p.id_estacion = '016' OR p.estacion_nombre LIKE '%POLIEDRO%' OR p.estacion_nombre LIKE '%OPICO%')",
            params: []
        };
    }

    // 4. Puma El Desvío (inactiva)
    if ((s === '004' || s.includes('DESVIO') || s.includes('DESVÍO')) && !s.includes('POLIEDRO')) {
        return {
            sql: "(p.id_estacion = '004' OR p.estacion_nombre LIKE '%DESVIO%' OR p.estacion_nombre LIKE '%DESVÍO%')",
            params: []
        };
    }

    // 5. Shell Chalchuapa
    if (s === '006' || s.includes('CHALCHUAPA')) {
        return {
            sql: "(p.id_estacion = '006' OR p.estacion_nombre LIKE '%CHALCHUAPA%')",
            params: []
        };
    }

    // 6. Puma La Loma / San Martín / Inversiones LIL
    if (s === '014' || s.includes('LOMA') || s.includes('SAN MARTIN') || s.includes('SAN MARTÍN') || s.includes('LIL')) {
        return {
            sql: "(p.id_estacion = '014' OR p.estacion_nombre LIKE '%LOMA%' OR p.estacion_nombre LIKE '%SAN MARTIN%')",
            params: []
        };
    }

    // 7. Shell 14 Avenida
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
        const toDate = addDaysYMD(getElSalvadorTodayYMD(), 7);
        
        const query = `
            SELECT c.descripcion as ubicacion, b.descripcion, a.vencimiento as vence, b.monto, a.id, b.id as id_recordatorio
            FROM web_rc_recordatorios_vencimientos a 
            INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id 
            INNER JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id 
            WHERE a.vencimiento <= ? 
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
const OFFICIAL_ESTACIONES = [
    { id_empresa: '002', branch_id: 4, saas_branch_id: 4, company_id: 8, titulo: 'Puma Miraflores', orden: 1 },
    { id_empresa: '006', branch_id: 3, saas_branch_id: 3, company_id: 2, titulo: 'Shell Chalchuapa', orden: 2 },
    { id_empresa: '008', branch_id: 8, saas_branch_id: 8, company_id: 8, titulo: 'Puma Costa del Sol', orden: 3 },
    { id_empresa: '014', branch_id: 1, saas_branch_id: 1, company_id: 1, titulo: 'Puma La Loma (San Martín)', orden: 4 },
    { id_empresa: '015', branch_id: 2, saas_branch_id: 2, company_id: 1, titulo: 'Shell 14 Avenida', orden: 5 },
    { id_empresa: '016', branch_id: 7, saas_branch_id: 7, company_id: 1, titulo: 'Shell Poliedro', orden: 6 }
];

const POLIEDRO_RESERVA_FALLBACK = { S: 175, R: 320, D: 210, I: 210 };

const getCleanStationName = (id, defaultTitulo) => {
    const matched = OFFICIAL_ESTACIONES.find(s => s.id_empresa === String(id) || String(s.branch_id) === String(id));
    if (matched) return matched.titulo;
    const upper = String(defaultTitulo || '').toUpperCase();
    if (upper.includes('POLIEDRO')) return 'Shell Poliedro';
    if (upper.includes('14 AVENIDA') || upper.includes('ZURITA')) return 'Shell 14 Avenida';
    if (upper.includes('SAN MARTIN') || upper.includes('LA LOMA')) return 'Puma La Loma (San Martín)';
    if (upper.includes('COSTA')) return 'Puma Costa del Sol';
    if (upper.includes('CHALCHUAPA')) return 'Shell Chalchuapa';
    if (upper.includes('MIRAFLORES')) return 'Puma Miraflores';
    return defaultTitulo;
};

router.get('/operaciones/estaciones', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        let rows = [];
        if (externalDb) {
            // Omitir Puma El Desvío (004, inactiva)
            const [dbRows] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' AND id_empresa != '004' ORDER BY orden");
            rows = (dbRows || []).map(r => ({
                id_empresa: r.id_empresa,
                titulo: getCleanStationName(r.id_empresa, r.titulo).toUpperCase()
            }));
        }
        const existingIds = new Set(rows.map(r => String(r.id_empresa)));
        OFFICIAL_ESTACIONES.forEach(st => {
            if (!existingIds.has(st.id_empresa)) {
                rows.push({
                    id_empresa: st.id_empresa,
                    titulo: st.titulo.toUpperCase()
                });
                existingIds.add(st.id_empresa);
            }
        });
        res.json(rows);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar estaciones'); 
    }
});

router.get('/operaciones/fecha-servidor', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const accountingDb = await getAccountingDb().catch(() => null);
        if (accountingDb) {
            const [saasRows] = await accountingDb.query("SELECT DATE_FORMAT(MAX(fecha_turno), '%Y-%m-%d') as fecha_servidor FROM gas_station_closeouts WHERE estado = 'cerrado' AND branch_id != 12");
            if (saasRows[0]?.fecha_servidor) {
                return res.json({ fecha_servidor: saasRows[0].fecha_servidor });
            }
        }
        const externalDb = await getExternalDb();
        const [rows] = await externalDb.query("SELECT MAX(fecha) as fecha_servidor FROM lecturas_tanque");
        res.json({ fecha_servidor: rows[0]?.fecha_servidor || null });
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar fecha del servidor'); 
    }
});

const SV_TIMEZONE = 'America/El_Salvador';

function formatDateYMD(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
        return val.toISOString().split('T')[0];
    }
    const str = String(val).trim();
    const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

function addDaysYMD(ymd, deltaDays) {
    const clean = formatDateYMD(ymd);
    if (!clean) return null;
    const [y, m, d] = clean.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
    return dt.toISOString().split('T')[0];
}

function getElSalvadorTodayYMD(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: SV_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);
}

/**
 * Formatea una marca de tiempo DATETIME/TIMESTAMP almacenada en hora local SV
 * (devuelta como 'YYYY-MM-DD HH:mm:ss' por DATE_FORMAT) sin aplicar un segundo desfase UTC.
 */
function formatSqlDateTimeSV(val) {
    if (!val) return null;
    let raw = '';
    if (val instanceof Date && !isNaN(val.getTime())) {
        const y = val.getUTCFullYear();
        const mo = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        const h = String(val.getUTCHours()).padStart(2, '0');
        const mi = String(val.getUTCMinutes()).padStart(2, '0');
        const s = String(val.getUTCSeconds()).padStart(2, '0');
        raw = `${y}-${mo}-${d} ${h}:${mi}:${s}`;
    } else {
        raw = String(val).trim().replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '');
    }
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    const [, year, month, day, hourStr, minute, sec = '00'] = m;
    const hour24 = Number(hourStr);
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const hora = `${String(hour12).padStart(2, '0')}:${minute} ${ampm}`;
    const fecha = `${day}/${month}/${year}`;
    return {
        iso: `${year}-${month}-${day} ${hourStr}:${minute}:${sec}`,
        fecha,
        hora,
        label: `${fecha} • ${hora}`
    };
}

router.get('/operaciones/fecha-servidor-global', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const fechaActual = getElSalvadorTodayYMD();
        const fechaAyer = addDaysYMD(fechaActual, -1);
        res.json({ fecha_actual: fechaActual, fecha_ayer: fechaAyer });
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar fecha global del servidor'); 
    }
});

async function resolveStationBranchId(accountingDb, id_empresa) {
    if (!id_empresa) return null;
    const cleanId = String(id_empresa).trim();
    if (cleanId === '016' || cleanId === '7' || cleanId === '12') return 7; // Inversiones LIL - Shell Poliedro
    const matched = OFFICIAL_ESTACIONES.find(s => s.id_empresa === cleanId || String(s.branch_id) === cleanId);
    if (matched) return matched.branch_id;
    if (!accountingDb) return null;
    try {
        const [settings] = await accountingDb.query('SELECT branch_id FROM gas_station_settings WHERE setting_key = ? AND setting_value = ? AND branch_id != 12 ORDER BY company_id ASC LIMIT 1', ['rrs_id_empresa', cleanId]);
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
    // 1. Prioridad: nuevo sistema SaaS (accountingDb - Inversiones LIL branch_id=7 para Shell Poliedro)
    if (accountingDb) {
        try {
            const branchId = await resolveStationBranchId(accountingDb, id_empresa);
            if (branchId) {
                const [closeoutRows] = await accountingDb.query(`
                    SELECT id, branch_id,
                           DATE_FORMAT(fecha_turno, '%Y-%m-%d') as fecha_turno,
                           numero_turno,
                           DATE_FORMAT(COALESCE(updated_at, closed_at, created_at), '%Y-%m-%d %H:%i:%s') as fecha_hora_datos,
                           DATE_FORMAT(COALESCE(closed_at, created_at), '%Y-%m-%d %H:%i:%s') as fecha_hora_cierre
                    FROM gas_station_closeouts 
                    WHERE branch_id = ? AND estado = 'cerrado'
                    ORDER BY fecha_turno DESC, numero_turno DESC 
                    LIMIT 1
                `, [branchId]);

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
                        const normalizedTanks = tanks.map(t => {
                            const rVal = Number(t.reserva || 0);
                            if (rVal === 0 && branchId === 7) {
                                return { ...t, reserva: POLIEDRO_RESERVA_FALLBACK[t.tipo_combustible] || 0 };
                            }
                            return t;
                        });
                        const effectiveDate = closeout.fecha_turno instanceof Date 
                            ? closeout.fecha_turno.toISOString().split('T')[0] 
                            : String(closeout.fecha_turno || fecha).split('T')[0];
                        const dtDatos = formatSqlDateTimeSV(closeout.fecha_hora_datos);
                        const dtCierre = formatSqlDateTimeSV(closeout.fecha_hora_cierre);
                        return {
                            fecha: effectiveDate,
                            turno: closeout.numero_turno,
                            fecha_hora_datos: dtDatos?.iso || null,
                            fecha_hora_label: dtDatos?.label || null,
                            hora_datos: dtDatos?.hora || null,
                            fecha_hora_cierre: dtCierre?.iso || null,
                            fecha_hora_cierre_label: dtCierre?.label || null,
                            inventario: normalizedTanks
                        };
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

async function fetchPromedios(id_empresa, fecha, externalDb, accountingDb, options = {}) {
    const agg = { D: 0, R: 0, S: 0, I: 0 };
    const now = options.now instanceof Date ? options.now : new Date();
    const hoySV = getElSalvadorTodayYMD(now);
    const ayerSV = addDaysYMD(hoySV, -1);
    const requestedYMD = formatDateYMD(fecha);
    // ADM-0014: Nunca incluir el día calendario en curso (hoySV) en el promedio móvil de 7 días.
    // Los turnos parciales de madrugada (Turno 1) reducían artificialmente el promedio diario ~15%
    // al desplazar la ventana de 7 días completos a 6 días completos + 1 turno parcial.
    const maxAllowedCompleteDate = (requestedYMD && requestedYMD < hoySV) ? requestedYMD : ayerSV;

    // 1. Prioridad: nuevo sistema SaaS (accountingDb)
    if (accountingDb) {
        try {
            const branchId = await resolveStationBranchId(accountingDb, id_empresa);
            if (branchId) {
                const [maxRows] = await accountingDb.query(
                    "SELECT DATE_FORMAT(MAX(fecha_turno), '%Y-%m-%d') as max_fecha FROM gas_station_closeouts WHERE branch_id = ? AND estado = 'cerrado' AND fecha_turno <= ?",
                    [branchId, maxAllowedCompleteDate]
                );
                let rawRef = formatDateYMD(maxRows[0]?.max_fecha);
                if (!rawRef) {
                    const [fallbackMax] = await accountingDb.query(
                        "SELECT DATE_FORMAT(MAX(fecha_turno), '%Y-%m-%d') as max_fecha FROM gas_station_closeouts WHERE branch_id = ? AND estado = 'cerrado'",
                        [branchId]
                    );
                    rawRef = formatDateYMD(fallbackMax[0]?.max_fecha) || maxAllowedCompleteDate;
                }
                const dateHasta = rawRef;
                const dateDesde = addDaysYMD(dateHasta, -6);

                // Contar días operativos cerrados a nivel de estación (evita sobreestimar productos
                // de baja rotación como Ion Diesel si no tuvieron ventas en algún día de la ventana).
                const [daysRows] = await accountingDb.query(`
                    SELECT COUNT(DISTINCT fecha_turno) as dias_activos
                    FROM gas_station_closeouts
                    WHERE branch_id = ?
                      AND fecha_turno BETWEEN ? AND ?
                      AND estado = 'cerrado'
                `, [branchId, dateDesde, dateHasta]);
                const activeDays = Math.max(1, Number(daysRows[0]?.dias_activos || 0));

                const [rows] = await accountingDb.query(`
                    SELECT 
                        tipo_combustible,
                        SUM(GREATEST(0, COALESCE(diferencia, 0))) as total_galones
                    FROM (
                        SELECT 
                            r.diferencia,
                            CASE 
                                WHEN p.tipo_combustible = 1 OR r.descripcion_producto LIKE '%REGULAR%' THEN 'R'
                                WHEN p.tipo_combustible = 2 OR r.descripcion_producto LIKE '%SUPER%' OR r.descripcion_producto LIKE '%V-POWER%' THEN 'S'
                                WHEN p.tipo_combustible = 4 OR r.descripcion_producto LIKE '%ION%' OR r.descripcion_producto LIKE '%ULSD%' THEN 'I'
                                ELSE 'D'
                            END as tipo_combustible
                        FROM gas_station_closeouts c
                        JOIN gas_station_closeout_readings r ON r.closeout_id = c.id
                        LEFT JOIN products p ON r.product_id = p.id
                        WHERE c.branch_id = ? 
                          AND c.fecha_turno BETWEEN ? AND ? 
                          AND c.estado = 'cerrado'
                    ) sub
                    GROUP BY tipo_combustible
                `, [branchId, dateDesde, dateHasta]);

                let totalProm = 0;
                (rows || []).forEach(r => {
                    if (['D', 'R', 'S', 'I'].includes(r.tipo_combustible)) {
                        const val = Math.round((Number(r.total_galones || 0) / activeDays) * 100) / 100;
                        agg[r.tipo_combustible] = Math.round((agg[r.tipo_combustible] + val) * 100) / 100;
                        totalProm += val;
                    }
                });

                if (totalProm > 0) {
                    return {
                        ...agg,
                        meta: {
                            fecha_desde: dateDesde,
                            fecha_hasta: dateHasta,
                            dias_activos: activeDays,
                            fuente: 'saas'
                        }
                    };
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
            for (let i = 0; i < 7; i++) {
                const ymd = addDaysYMD(maxAllowedCompleteDate, -i);
                const [year, month, day] = ymd.split('-');
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
                    agg[r.tipo_combustible] = Math.round((agg[r.tipo_combustible] + Number(r.promedio || 0)) * 100) / 100;
                }
            });
            return {
                ...agg,
                meta: {
                    fecha_desde: addDaysYMD(maxAllowedCompleteDate, -6),
                    fecha_hasta: maxAllowedCompleteDate,
                    dias_activos: 7,
                    fuente: 'external'
                }
            };
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

function createEmptyFuelBuckets() {
    return { D: 0, R: 0, S: 0, I: 0 };
}

/**
 * Reconcilia pedidos programados contra recargas físicas ya registradas en turnos cerrados.
 * - Incluye pedidos de hoy (hoySV) y futuros (> hoySV).
 * - Si un pedido confirmado de ayer (ayerSV) no tuvo recarga ayer y hoy en Turno 1 hubo descarga
 *   de madrugada (rollover nocturno), esa recarga de T1 cubre primero el pedido de ayer sin
 *   anular falsamente pedidos nuevos programados para hoy.
 * - Para pedidos de hoy (hoySV), descuenta las recargas ya ingresadas en lectura_actual para
 *   evitar doble conteo en inventario/autonomía y marca ya_descargado / descarga_parcial.
 */
function reconcileScheduledOrdersWithRefills(orders = [], hoySV, refillProfile = {}, options = {}) {
    const ayerSV = addDaysYMD(hoySV, -1);
    const minVisibleDate = options.minVisibleDate || hoySV;
    const isHistorical = Boolean(options.isHistorical);

    const recargaAyer = { ...createEmptyFuelBuckets(), ...(refillProfile.ayer || {}) };
    const recargaHoyT1 = { ...createEmptyFuelBuckets(), ...(refillProfile.hoyT1 || {}) };
    const recargaHoyPostT1 = { ...createEmptyFuelBuckets(), ...(refillProfile.hoyPostT1 || {}) };

    const sorted = [...(orders || [])].sort((a, b) => {
        const fa = formatDateYMD(a.fecha) || '';
        const fb = formatDateYMD(b.fecha) || '';
        if (fa !== fb) return fa.localeCompare(fb);
        return Number(a.id_pedido || a.id || 0) - Number(b.id_pedido || b.id || 0);
    });

    if (!isHistorical) {
        // Paso 1: Si hubo un pedido confirmado de ayer sin recarga suficiente ayer,
        // asignar recarga nocturna de hoy Turno 1 (T1) para no descontarla de pedidos de hoy.
        const ayerUnfilled = createEmptyFuelBuckets();
        sorted.forEach(o => {
            const f = formatDateYMD(o.fecha);
            if (f !== ayerSV) return;
            const hasConfirmedNum = String(o.numero || '').trim().length > 0;
            if (!hasConfirmedNum) return;
            const fuels = {
                D: Number(o.diesel || 0),
                R: Number(o.regular || 0),
                S: Number(o.super || 0),
                I: Number(o.iondiesel || 0)
            };
            ['D', 'R', 'S', 'I'].forEach(k => {
                const coveredYesterday = Math.min(fuels[k], recargaAyer[k]);
                recargaAyer[k] = Math.max(0, recargaAyer[k] - coveredYesterday);
                ayerUnfilled[k] += Math.max(0, fuels[k] - coveredYesterday);
            });
        });

        ['D', 'R', 'S', 'I'].forEach(k => {
            if (ayerUnfilled[k] > 0 && recargaHoyT1[k] > 0) {
                const rolloverUsed = Math.min(ayerUnfilled[k], recargaHoyT1[k]);
                recargaHoyT1[k] = Math.max(0, recargaHoyT1[k] - rolloverUsed);
            }
        });
    }

    const remainingHoy = {
        D: Math.max(0, Number(recargaHoyT1.D || 0) + Number(recargaHoyPostT1.D || 0)),
        R: Math.max(0, Number(recargaHoyT1.R || 0) + Number(recargaHoyPostT1.R || 0)),
        S: Math.max(0, Number(recargaHoyT1.S || 0) + Number(recargaHoyPostT1.S || 0)),
        I: Math.max(0, Number(recargaHoyT1.I || 0) + Number(recargaHoyPostT1.I || 0))
    };

    const result = [];
    for (const o of sorted) {
        const orderDate = formatDateYMD(o.fecha);
        if (!orderDate) continue;
        if (isHistorical) {
            if (orderDate <= minVisibleDate) continue;
        } else if (orderDate < minVisibleDate) {
            continue;
        }

        const d = Number(o.diesel || 0);
        const r = Number(o.regular || 0);
        const s = Number(o.super || 0);
        const i = Number(o.iondiesel || 0);
        const totalGal = d + r + s + i;

        let pD = d;
        let pR = r;
        let pS = s;
        let pI = i;
        let yaDescargado = false;
        let descargaParcial = false;

        if (!isHistorical && orderDate === hoySV && totalGal > 0) {
            const covD = Math.min(d, remainingHoy.D);
            const covR = Math.min(r, remainingHoy.R);
            const covS = Math.min(s, remainingHoy.S);
            const covI = Math.min(i, remainingHoy.I);

            remainingHoy.D = Math.max(0, remainingHoy.D - covD);
            remainingHoy.R = Math.max(0, remainingHoy.R - covR);
            remainingHoy.S = Math.max(0, remainingHoy.S - covS);
            remainingHoy.I = Math.max(0, remainingHoy.I - covI);

            pD = Math.round(Math.max(0, d - covD) * 100) / 100;
            pR = Math.round(Math.max(0, r - covR) * 100) / 100;
            pS = Math.round(Math.max(0, s - covS) * 100) / 100;
            pI = Math.round(Math.max(0, i - covI) * 100) / 100;

            const totalPendiente = pD + pR + pS + pI;
            // Tolerancia del 5% por merma o redondeo de varilla en descarga completa
            if (totalPendiente <= totalGal * 0.05) {
                yaDescargado = true;
                pD = 0;
                pR = 0;
                pS = 0;
                pI = 0;
            } else if (totalPendiente < totalGal) {
                descargaParcial = true;
            }
        }

        result.push({
            ...o,
            fecha: orderDate,
            diesel: d,
            regular: r,
            super: s,
            iondiesel: i,
            pendiente_diesel: pD,
            pendiente_regular: pR,
            pendiente_super: pS,
            pendiente_iondiesel: pI,
            ya_descargado: yaDescargado,
            descarga_parcial: descargaParcial,
            nombre_estacion_compartida: getCleanStationName(o.id_estacion_compartida, o.nombre_estacion_compartida) || null
        });
    }

    return result;
}

async function fetchRefillProfile(accountingDb, id_estacion, hoySV, ayerSV) {
    const profile = {
        ayer: createEmptyFuelBuckets(),
        hoyT1: createEmptyFuelBuckets(),
        hoyPostT1: createEmptyFuelBuckets()
    };
    if (!accountingDb) return profile;
    try {
        const branchId = await resolveStationBranchId(accountingDb, id_estacion);
        if (!branchId) return profile;
        const [rows] = await accountingDb.query(`
            SELECT
                DATE_FORMAT(c.fecha_turno, '%Y-%m-%d') as fecha,
                c.numero_turno,
                CASE
                    WHEN t.tipo_combustible = 4 OR t.descripcion LIKE '%Ion%' THEN 'I'
                    WHEN t.tipo_combustible = 3 OR t.descripcion LIKE '%Diesel%' THEN 'D'
                    WHEN t.tipo_combustible = 2 OR t.descripcion LIKE '%Super%' THEN 'S'
                    WHEN t.tipo_combustible = 1 OR t.descripcion LIKE '%Regular%' THEN 'R'
                    ELSE 'D'
                END as tipo_combustible,
                SUM(COALESCE(tr.recarga, 0)) as total_recarga
            FROM gas_station_closeouts c
            JOIN gas_station_closeout_tank_readings tr ON tr.closeout_id = c.id
            JOIN gas_station_tanks t ON t.id = tr.tank_id
            WHERE c.branch_id = ?
              AND c.fecha_turno IN (?, ?)
              AND c.estado = 'cerrado'
            GROUP BY c.fecha_turno, c.numero_turno, tipo_combustible
            HAVING SUM(COALESCE(tr.recarga, 0)) > 0
        `, [branchId, ayerSV, hoySV]);

        (rows || []).forEach(r => {
            const tipo = r.tipo_combustible;
            const rec = Number(r.total_recarga || 0);
            if (!['D', 'R', 'S', 'I'].includes(tipo) || rec <= 0) return;
            const fechaStr = formatDateYMD(r.fecha);
            if (fechaStr === ayerSV) {
                profile.ayer[tipo] += rec;
            } else if (fechaStr === hoySV) {
                if (Number(r.numero_turno) === 1) {
                    profile.hoyT1[tipo] += rec;
                } else {
                    profile.hoyPostT1[tipo] += rec;
                }
            }
        });
    } catch (err) {
        console.warn('Error consultando recargas de tanque para reconciliación:', err.message);
    }
    return profile;
}

async function fetchProgramadosEstacion(id_estacion, fechaParam, externalDb, accountingDb, options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    const hoySV = getElSalvadorTodayYMD(now);
    const ayerSV = addDaysYMD(hoySV, -1);
    const reqYMD = formatDateYMD(fechaParam);
    // ADM-0016: Cuando se consulta operación actual (fecha >= ayerSV, incluyendo cuando
    // Turno 1 de hoy ya cerró y effectiveDate === hoySV), siempre incluir pedidos con fecha >= hoySV.
    const isHistorical = Boolean(reqYMD && reqYMD < ayerSV);
    const sqlMinDate = isHistorical ? reqYMD : ayerSV;
    const sqlOp = isHistorical ? '>' : '>=';

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
        WHERE t.id_estacion = ? AND t.fecha ${sqlOp} ?
        ORDER BY t.fecha ASC, t.id ASC
    `;
    const [rows] = await externalDb.query(query, [id_estacion, sqlMinDate]);
    const refillProfile = isHistorical
        ? { ayer: createEmptyFuelBuckets(), hoyT1: createEmptyFuelBuckets(), hoyPostT1: createEmptyFuelBuckets() }
        : await fetchRefillProfile(accountingDb, id_estacion, hoySV, ayerSV);

    return reconcileScheduledOrdersWithRefills(rows || [], hoySV, refillProfile, {
        minVisibleDate: isHistorical ? reqYMD : hoySV,
        isHistorical
    });
}

router.get('/operaciones/pedidos/programados/:id_estacion/:fecha', authenticateToken, requirePermission(pedidosViewPerms), async (req, res) => {
    try {
        const { id_estacion, fecha } = req.params;
        const externalDb = await getExternalDb();
        const accountingDb = await getAccountingDb().catch(() => null);
        await ensureSharedColumns(externalDb);
        const enriched = await fetchProgramadosEstacion(id_estacion, fecha, externalDb, accountingDb);
        res.json(enriched);
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
            const [carriers] = await localDb.query("SELECT id, COALESCE(NULLIF(TRIM(description), ''), code) AS name FROM carriers");
            const [tankers] = await localDb.query('SELECT id, code AS plate FROM tankers');
            carrierMap = Object.fromEntries(carriers.map(c => [c.id, c.name]));
            tankerMap = Object.fromEntries(tankers.map(t => [t.id, t.plate]));
        } catch (e) {
            console.warn('Error preloading carriers/tankers:', e.message);
        }

        // Fechas oficiales en zona horaria America/El_Salvador
        const fechaActual = getElSalvadorTodayYMD();
        const fechaAyer = addDaysYMD(fechaActual, -1);

        // Stations: excluir Puma El Desvío (004, inactiva) y garantizar Shell Poliedro (016)
        const [dbEstaciones] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' AND id_empresa != '004' ORDER BY orden");
        let estaciones = (dbEstaciones || []).map(r => ({
            id_empresa: r.id_empresa,
            titulo: getCleanStationName(r.id_empresa, r.titulo)
        }));
        const existingIds = new Set(estaciones.map(r => String(r.id_empresa)));
        OFFICIAL_ESTACIONES.forEach(st => {
            if (!existingIds.has(st.id_empresa)) {
                estaciones.push({
                    id_empresa: st.id_empresa,
                    titulo: st.titulo
                });
                existingIds.add(st.id_empresa);
            }
        });

        const accountingDb = await getAccountingDb().catch(() => null);

        // Compute rows for each station in parallel
        const rows = await Promise.all(estaciones.map(async (est) => {
            const [reconciledOrders, tanquesData, promedios] = await Promise.all([
                fetchProgramadosEstacion(est.id_empresa, fechaActual, externalDb, accountingDb),
                fetchTankReadings(est.id_empresa, fechaAyer, externalDb, accountingDb),
                fetchPromedios(est.id_empresa, fechaAyer, externalDb, accountingDb)
            ]);

            const sumProg = { D: 0, R: 0, S: 0, I: 0 };
            const enrichedOrders = reconciledOrders.map(o => {
                const d = Number(o.diesel || 0);
                const r = Number(o.regular || 0);
                const s = Number(o.super || 0);
                const i = Number(o.iondiesel || 0);
                if (!o.ya_descargado) {
                    sumProg.D += Number(o.pendiente_diesel ?? d);
                    sumProg.R += Number(o.pendiente_regular ?? r);
                    sumProg.S += Number(o.pendiente_super ?? s);
                    sumProg.I += Number(o.pendiente_iondiesel ?? i);
                }
                return {
                    id_pedido: o.id_pedido,
                    fecha: o.fecha,
                    numero: o.numero || '',
                    diesel: d,
                    regular: r,
                    super: s,
                    iondiesel: i,
                    pendiente_diesel: Number(o.pendiente_diesel ?? d),
                    pendiente_regular: Number(o.pendiente_regular ?? r),
                    pendiente_super: Number(o.pendiente_super ?? s),
                    pendiente_iondiesel: Number(o.pendiente_iondiesel ?? i),
                    ya_descargado: Boolean(o.ya_descargado),
                    descarga_parcial: Boolean(o.descarga_parcial),
                    total_galones: d + r + s + i,
                    transportista_nombre: carrierMap[o.id_transportista] || 'Sin asignar',
                    pipa_placa: tankerMap[o.id_calibracion_diesel] || 'Sin asignar',
                    nombre_estacion_compartida: o.nombre_estacion_compartida || null
                };
            });

            const tanques = tanquesData.inventario || [];
            const refTankDate = formatDateYMD(tanquesData.fecha) || fechaAyer;

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
                if (durDias > 0 && refTankDate) {
                    const parts = refTankDate.split('-').map(Number);
                    if (parts.length === 3) {
                        const [y, m, d] = parts;
                        const target = new Date(Date.UTC(y, m - 1, d + Math.floor(durDias), 12, 0, 0));
                        const dd = String(target.getUTCDate()).padStart(2, '0');
                        const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
                        const yyyy = target.getUTCFullYear();
                        const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
                        fechaStr = `${dd}/${mm}/${yyyy} (${days[target.getUTCDay()]})`;
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
            const pendingCount = enrichedOrders.filter(o => !o.ya_descargado).length;

            return {
                id_empresa: est.id_empresa,
                estacion: est.titulo,
                fecha_lectura: refTankDate,
                turno_lectura: tanquesData.turno || null,
                promedio_ventana: promedios.meta || null,
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
                pedidos_count: pendingCount
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
function normalizeAccountDigits(val) {
    return String(val || '').replace(/[^0-9]/g, '');
}

function inferBankNameFromText(rawText = '') {
    const upper = String(rawText || '').toUpperCase();
    if (upper.includes('AMERICA CENTRAL') || /\bBAC\b/.test(upper)) return 'AMERICA CENTRAL';
    if (upper.includes('DAVIVIENDA') || /\bDAVI\b/.test(upper)) return 'DAVIVIENDA';
    if (upper.includes('PROMERICA') || /\bPROM\b/.test(upper)) return 'PROMERICA';
    if (upper.includes('AGRICOLA') || upper.includes('AGRÍCOLA') || /\bBCO AGRICOLA\b/.test(upper)) return 'AGRICOLA';
    if (upper.includes('HIPOTECARIO') || upper.includes('HIPOTECARIIO') || /\bBH\b/.test(upper)) return 'HIPOTECARIO';
    if (upper.includes('CUSCATLAN') || upper.includes('CUSCATLÁN')) return 'CUSCATLAN';
    if (upper.includes('AZUL')) return 'BANCO AZUL';
    if (upper.includes('ATLANTIDA') || upper.includes('ATLÁNTIDA')) return 'ATLANTIDA';
    if (upper.includes('SCOTIABANK')) return 'SCOTIABANK';
    if (upper.includes('CITIBANK') || upper.includes('BANCO CITY') || /\bCITI\b/.test(upper)) return 'CITIBANK';
    if (upper.includes('BANCOVI')) return 'BANCOVI';
    if (upper.includes('ABANK')) return 'ABANK';
    if (upper.includes('CONSTELACION')) return 'CONSTELACION';
    if (/\bBFA\b/.test(upper) || upper.includes('FOMENTO AGROPECUARIO')) return 'BFA';
    return 'BANCO';
}

function compactBankCode(bancoNombre = '') {
    const upper = String(bancoNombre || '').toUpperCase();
    if (upper.includes('AMERICA CENTRAL') || upper === 'BAC') return 'BAC';
    if (upper.includes('DAVIVIENDA')) return 'DAVI';
    if (upper.includes('PROMERICA')) return 'PROM';
    if (upper.includes('AGRICOLA')) return 'AGRICOLA';
    if (upper.includes('HIPOTECARIO')) return 'BH';
    if (upper.includes('CUSCATLAN')) return 'CUSCATLAN';
    if (upper.includes('AZUL')) return 'AZUL';
    if (upper.includes('ATLANTIDA')) return 'ATLANTIDA';
    if (upper.includes('CITIBANK')) return 'CITI';
    return upper.slice(0, 10) || 'BANCO';
}

function buildCompactPresetValue(bancoNombre, nombreCuenta, numeroCuenta) {
    const cleanBanco = String(bancoNombre || 'BANCO').trim();
    const cleanNombre = String(nombreCuenta || '').replace(/\s+/g, ' ').trim();
    const cleanNumero = String(numeroCuenta || '').trim();
    const standard = cleanNumero
        ? `[${cleanBanco}] ${cleanNombre} - (${cleanNumero})`
        : `[${cleanBanco}] ${cleanNombre}`;
    if (standard.length <= 50) return standard;

    const shortBank = compactBankCode(cleanBanco);
    if (!cleanNumero) {
        return `[${shortBank}] ${cleanNombre}`.slice(0, 50).trim();
    }
    const suffix = ` - (${cleanNumero})`;
    const prefix = `[${shortBank}] `;
    const maxNameLen = Math.max(6, 50 - prefix.length - suffix.length);
    const trimmedName = cleanNombre.slice(0, maxNameLen).trim();
    return `${prefix}${trimmedName}${suffix}`.slice(0, 50);
}

function inferUbicacionTags(account = {}) {
    const blob = `${account.empresa_nombre || ''} ${account.nombre || ''} ${account.banco_nombre || ''}`.toUpperCase();
    const tags = new Set();
    if (blob.includes('ANDELSA')) tags.add('ANDELSA');
    if (blob.includes('MIRAFLORES')) tags.add('ESTACION MIRAFLORES');
    if (blob.includes('CHALCHUAPA') || blob.includes('CHALCHUPA')) tags.add('ESTACION CHALCHUAPA');
    if (blob.includes('SAN MARTIN') || blob.includes('LOMA') || blob.includes('LIL')) tags.add('ESTACION SAN MARTIN');
    if (blob.includes('DESVIO') || blob.includes('CDH')) tags.add('ESTACION DESVIO');
    if (blob.includes('COSTA DEL SOL') || /\bCDS\b/.test(blob)) tags.add('ENERGY GAS COSTA DEL SOL');
    if (blob.includes('SUPER') || blob.includes('PEDREGAL') || blob.includes('CERRO VERDE')) tags.add('SUPER EL PEDREGAL');
    if (blob.includes('14 AVENIDA') || blob.includes('ZURITA')) tags.add('SHELL 14 AVENIDA');
    if (blob.includes('RAUL') || blob.includes('CORINA') || blob.includes('RABIDA') || blob.includes('CMR')) {
        tags.add('OFICINA CENTRAL');
        tags.add('PERSONAL');
    }
    return Array.from(tags);
}

router.get('/operaciones/recordatorios/presets-pago', authenticateToken, requirePermission(recordatoriosViewPerms), async (req, res) => {
    try {
        const db = getDb();
        const cuentasMap = new Map();

        try {
            const [adminCuentas] = await db.query(`
                SELECT c.id, c.empresa_id, c.numero, c.nombre,
                       COALESCE(b.descripcion, 'BANCO') AS banco_nombre,
                       COALESCE(e.nombre, '') AS empresa_nombre
                FROM cuentas_bancarias c
                LEFT JOIN bancos b ON c.banco_id = b.id
                LEFT JOIN empresas e ON c.empresa_id = e.id
                WHERE c.activa = 1
                ORDER BY b.descripcion ASC, c.numero ASC
            `);

            for (const row of (adminCuentas || [])) {
                const numero = String(row.numero || '').trim();
                const nombre = String(row.nombre || '').replace(/\s+/g, ' ').trim();
                const bancoNombre = String(row.banco_nombre || inferBankNameFromText(nombre)).trim();
                const empresaNombre = String(row.empresa_nombre || '').trim();
                const key = normalizeAccountDigits(numero) || `adm-${row.id}`;
                const displayNombre = empresaNombre && !nombre.toUpperCase().includes('ANDELSA') && empresaNombre.toUpperCase().includes('ANDELSA')
                    ? `ANDELSA - ${nombre}`
                    : nombre;
                const item = {
                    id: `cta-${row.id}`,
                    raw_id: Number(row.id),
                    source: 'admin_bancos',
                    banco_nombre: bancoNombre,
                    nombre: displayNombre,
                    numero,
                    empresa_nombre: empresaNombre,
                    preset_value: buildCompactPresetValue(bancoNombre, displayNombre, numero)
                };
                item.ubicacion_tags = inferUbicacionTags(item);
                cuentasMap.set(key, item);
            }
        } catch (errAdmin) {
            console.warn('[Recordatorios] Aviso cargando cuentas_bancarias:', errAdmin.message);
        }

        try {
            const accountingDb = await getAccountingDb().catch(() => null);
            if (accountingDb) {
                const [coaRows] = await accountingDb.query(`
                    SELECT ca.id, ca.company_id, ca.code, ca.name,
                           COALESCE(co.nombre_comercial, co.razon_social, '') AS company_name
                    FROM chart_of_accounts ca
                    LEFT JOIN companies co ON ca.company_id = co.id
                    WHERE ca.code LIKE '110103%' AND LENGTH(ca.code) >= 9
                    ORDER BY ca.company_id ASC, ca.code ASC
                `);
                for (const row of (coaRows || [])) {
                    const rawName = String(row.name || '').replace(/\s+/g, ' ').trim();
                    if (!rawName || /^DEPOSITOS\b/i.test(rawName)) continue;
                    const numMatch = rawName.match(/([0-9][0-9-]{4,}[0-9])/);
                    const numero = numMatch ? numMatch[1].trim() : '';
                    const digits = normalizeAccountDigits(numero);
                    if (digits && cuentasMap.has(digits)) continue;

                    const bancoNombre = inferBankNameFromText(rawName);
                    const companyName = String(row.company_name || '').replace(/\s+/g, ' ').trim();
                    const shortCompany = companyName.toUpperCase().includes('ANDELSA')
                        ? 'ANDELSA'
                        : companyName.toUpperCase().includes('LIL')
                            ? 'INVERSIONES LIL'
                            : companyName;
                    const cleanedLabel = rawName
                        .replace(/([#Nº]|CTA\.?\s*CTE\.?|CTA\.?\s*AHO\.?|CTA)\s*[#Nº]*\s*[0-9][0-9-]{4,}[0-9]/gi, '')
                        .replace(new RegExp(numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    const displayNombre = shortCompany && !cleanedLabel.toUpperCase().includes(shortCompany.toUpperCase())
                        ? `${shortCompany} - ${cleanedLabel || bancoNombre}`
                        : (cleanedLabel || shortCompany || bancoNombre);

                    const key = digits || `saas-${row.id}`;
                    const item = {
                        id: `coa-${row.id}`,
                        source: 'contabilidad_saas',
                        banco_nombre: bancoNombre,
                        nombre: displayNombre,
                        numero,
                        empresa_nombre: companyName,
                        preset_value: buildCompactPresetValue(bancoNombre, displayNombre, numero)
                    };
                    item.ubicacion_tags = inferUbicacionTags(item);
                    cuentasMap.set(key, item);
                }
            }
        } catch (errCoa) {
            console.warn('[Recordatorios] Aviso cargando cuentas contables SaaS:', errCoa.message);
        }

        res.json({
            cuentas: Array.from(cuentasMap.values()),
            metodos_base: [
                'TRANSFERENCIA',
                'CHEQUE',
                'TARJETA DE CREDITO',
                'TARJETA DE DEBITO',
                'EFECTIVO',
                'NOTA DE CREDITO',
                'REMISION',
                'DEBITO AUTOMATICO',
                'DEPOSITO',
                'COMPENSACION'
            ],
            metodos_catalogo: recordatoriosPagosService.PAYMENT_METHODS
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar presets de pago');
    }
});

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
        const db = getDb();
        const externalDb = await getExternalDb();
        let statusFilter = "a.estado IN ('P', 'C')";
        if (estado === 'P' || estado === 'PARCIAL') statusFilter = "a.estado = 'P'";
        else if (estado === 'C') statusFilter = "a.estado = 'C'";
        let query = `
            SELECT c.descripcion as ubicacion, b.id_ubicacion, b.descripcion, a.vencimiento as vence, b.forma_pago as observacion, 
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
        const enriched = await recordatoriosPagosService.enrichRecordatoriosList(db, rows);
        const finalRows = estado === 'PARCIAL'
            ? enriched.filter(r => r.estado_pago === 'PARCIAL')
            : enriched;
        res.json(finalRows);
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
        const safeFormaPago = String(forma_pago || '').trim().slice(0, 50);
        const safeFormaPago2 = String(formaPago2 || '').trim().slice(0, 50);
        const externalDb = await getExternalDb();
        const db = getDb();
        const connection = await externalDb.getConnection();
        try {
            await connection.beginTransaction();
            let recordatorioId = id;
            let preservePaidSchedule = false;
            if (id) {
                await connection.query(`UPDATE web_rc_recordatorios SET descripcion=?, id_ubicacion=?, iniciar=?, monto=?, repetir=?, repetir_desc=?, activo=?, forma_pago=? WHERE id=?`, 
                    [descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo ? 1 : 0, safeFormaPago, id]);

                const [existingVens] = await connection.query(
                    "SELECT id, estado FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = ?",
                    [id]
                );
                const existingIds = (existingVens || []).map(v => v.id);
                const hasPaidLegacy = (existingVens || []).some(v => String(v.estado || '').toUpperCase() === 'C');
                let hasLinkedAbonos = false;
                if (existingIds.length > 0 && db) {
                    try {
                        const [abCnt] = await db.query(
                            `SELECT COUNT(*) AS cnt FROM recordatorios_pagos_abonos WHERE vencimiento_id IN (${existingIds.map(() => '?').join(',')})`,
                            existingIds
                        );
                        hasLinkedAbonos = Number(abCnt[0]?.cnt || 0) > 0;
                    } catch (_) {
                        // Tabla opcional en entornos mínimos
                    }
                }
                // Nunca destruir vencimientos ya pagados o con abonos/comprobantes vinculados al editar un recordatorio
                preservePaidSchedule = hasPaidLegacy || hasLinkedAbonos;
            } else {
                const [result] = await connection.query(`INSERT INTO web_rc_recordatorios (descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo, forma_pago) VALUES (?,?,?,?,?,?,?,?)`, 
                    [descripcion, id_ubicacion, iniciar, monto, repetir, repetir_desc, activo ? 1 : 0, safeFormaPago]);
                recordatorioId = result.insertId;
            }
            if (!preservePaidSchedule) {
                await connection.query("DELETE FROM web_rc_recordatorios_vencimientos WHERE id_recordatorio = ?", [recordatorioId]);
                for (let n = 1; n <= repetir; n++) {
                    const formattedDate = calculateRecurringDate(iniciar, n, repetir_desc);
                    let isPagado = false;
                    if (repetir_desc === 'VEZ') { if (pagado) isPagado = true; }
                    if (isPagado) {
                        await connection.query("INSERT INTO web_rc_recordatorios_vencimientos (id_recordatorio, vencimiento, estado, fecha_cancelacion, forma_pago) VALUES (?, ?, 'C', ?, ?)", [recordatorioId, formattedDate, fecPago, safeFormaPago2]);
                    } else {
                        await connection.query("INSERT INTO web_rc_recordatorios_vencimientos (id_recordatorio, vencimiento, estado, fecha_cancelacion, forma_pago) VALUES (?, ?, 'P', NULL, '')", [recordatorioId, formattedDate]);
                    }
                }
            }
            await connection.commit();
            res.json({
                success: true,
                message: preservePaidSchedule
                    ? 'Recordatorio actualizado (se conservaron las cuotas existentes con pagos o abonos registrados).'
                    : 'Recordatorio Guardado!'
            });
        } catch (errTx) {
            await connection.rollback().catch(() => {});
            throw errTx;
        } finally {
            connection.release();
        }
    } catch (error) { sendSafeError(res, error, 'Error al guardar recordatorio'); }
});

router.put('/operaciones/recordatorios/pagar/:id', authenticateToken, requirePermission(['manage_recordatorios', '/dashboard/operaciones/recordatorios']), async (req, res) => {
    try {
        const { id } = req.params;
        const { forma_pago, fecha_cancelacion } = req.body;
        const safeFormaPago = String(forma_pago || '').trim().slice(0, 50);
        const externalDb = await getExternalDb();
        await externalDb.query("UPDATE web_rc_recordatorios_vencimientos SET estado = 'C', fecha_cancelacion = ?, forma_pago = ? WHERE id = ?", [fecha_cancelacion, safeFormaPago, id]);
        res.json({ success: true, message: 'Pago Realizado!' });
    } catch (error) { sendSafeError(res, error, 'Error al registrar pago'); }
});

router.patch('/operaciones/recordatorios/vencimiento/:id', authenticateToken, requirePermission(recordatoriosManagePerms), async (req, res) => {
    try {
        const { id } = req.params;
        const { forma_pago, fecha_cancelacion, observacion, id_recordatorio } = req.body;
        const safeFormaPago = forma_pago !== undefined ? String(forma_pago || '').trim().slice(0, 50) : undefined;
        const safeObs = observacion !== undefined ? String(observacion || '').trim().slice(0, 50) : undefined;
        const externalDb = await getExternalDb();

        if (safeFormaPago !== undefined) {
            if (fecha_cancelacion) {
                await externalDb.query(
                    'UPDATE web_rc_recordatorios_vencimientos SET forma_pago = ?, fecha_cancelacion = ? WHERE id = ?',
                    [safeFormaPago, fecha_cancelacion, id]
                );
            } else {
                await externalDb.query(
                    'UPDATE web_rc_recordatorios_vencimientos SET forma_pago = ? WHERE id = ?',
                    [safeFormaPago, id]
                );
            }
        }

        if (safeObs !== undefined) {
            let parentId = id_recordatorio;
            if (!parentId) {
                const [vRows] = await externalDb.query('SELECT id_recordatorio FROM web_rc_recordatorios_vencimientos WHERE id = ? LIMIT 1', [id]);
                parentId = vRows[0]?.id_recordatorio;
            }
            if (parentId) {
                await externalDb.query(
                    'UPDATE web_rc_recordatorios SET forma_pago = ? WHERE id = ?',
                    [safeObs, parentId]
                );
            }
        }

        res.json({
            success: true,
            message: 'Método de pago actualizado',
            forma_pago: safeFormaPago,
            observacion: safeObs
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar forma de pago');
    }
});

router.delete('/operaciones/recordatorios/vencimiento/:id', authenticateToken, requirePermission(['manage_recordatorios', '/dashboard/operaciones/recordatorios']), async (req, res) => {
    try {
        const db = getDb();
        const externalDb = await getExternalDb();
        const venId = parseInt(req.params.id, 10);
        await externalDb.query("DELETE FROM web_rc_recordatorios_vencimientos WHERE id = ?", [venId]);
        try {
            await recordatoriosPagosService.ensureRecordatoriosPagosTables(db);
            const [comps] = await db.query('SELECT archivo_url FROM recordatorios_pagos_comprobantes WHERE vencimiento_id = ?', [venId]);
            for (const c of comps) {
                recordatoriosPagosService.deleteReceiptFile(c.archivo_url);
            }
            await db.query('DELETE FROM recordatorios_pagos_comprobantes WHERE vencimiento_id = ?', [venId]);
            await db.query('DELETE FROM recordatorios_pagos_abonos WHERE vencimiento_id = ?', [venId]);
            await db.query('DELETE FROM recordatorios_vencimientos_meta WHERE vencimiento_id = ?', [venId]);
        } catch (cleanupErr) {
            console.warn('[Recordatorios] Aviso limpiando abonos/comprobantes al eliminar vencimiento:', cleanupErr.message);
        }
        res.json({ success: true, message: 'Recordatorio Eliminado!' });
    } catch (error) { sendSafeError(res, error, 'Error al eliminar vencimiento'); }
});

// --- CONTROL DE PAGOS AVANZADO: MULTI-ABONOS, PARCIALES, COMPROBANTES Y SUGERENCIAS ---

router.get('/operaciones/recordatorios/vencimiento/:id/detalle', authenticateToken, requirePermission(recordatoriosViewPerms), async (req, res) => {
    try {
        const venId = parseInt(req.params.id, 10);
        if (!venId) return res.status(400).json({ message: 'ID de vencimiento inválido' });
        const db = getDb();
        const externalDb = await getExternalDb();
        const detail = await recordatoriosPagosService.getVencimientoDetail({ db, externalDb, vencimientoId: venId });
        if (!detail) return res.status(404).json({ message: 'Vencimiento no encontrado' });
        res.json(detail);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar detalle de pagos del vencimiento');
    }
});

router.patch('/operaciones/recordatorios/vencimiento/:id/meta', authenticateToken, requirePermission(recordatoriosManagePerms), async (req, res) => {
    try {
        const venId = parseInt(req.params.id, 10);
        if (!venId) return res.status(400).json({ message: 'ID de vencimiento inválido' });
        const {
            tipo_operacion,
            metodo_pago_preferido,
            cuenta_bancaria_id,
            cuenta_label,
            tarjeta_ref,
            notas_control,
            forma_pago_legacy
        } = req.body || {};

        const db = getDb();
        const externalDb = await getExternalDb();
        await recordatoriosPagosService.ensureRecordatoriosPagosTables(db);

        const [venRows] = await externalDb.query(
            'SELECT id, id_recordatorio FROM web_rc_recordatorios_vencimientos WHERE id = ? LIMIT 1',
            [venId]
        );
        if (!venRows || venRows.length === 0) {
            return res.status(404).json({ message: 'Vencimiento no encontrado' });
        }
        const recordatorioId = venRows[0].id_recordatorio;
        const normOp = recordatoriosPagosService.normalizeTipoOperacion(tipo_operacion);
        const normMetodo = metodo_pago_preferido ? recordatoriosPagosService.normalizeMetodoPago(metodo_pago_preferido) : null;
        const parsedCuentaId = cuenta_bancaria_id ? parseInt(cuenta_bancaria_id, 10) || null : null;
        const safeCuentaLabel = cuenta_label ? String(cuenta_label).trim().slice(0, 150) : null;
        const safeTarjeta = tarjeta_ref ? String(tarjeta_ref).trim().slice(0, 100) : null;
        const safeNotas = notas_control !== undefined ? String(notas_control || '').trim().slice(0, 1000) : null;
        const actor = req.user?.username || req.user?.email || 'sistema';

        await db.query(
            `INSERT INTO recordatorios_vencimientos_meta
                (vencimiento_id, recordatorio_id, tipo_operacion, metodo_pago_preferido, cuenta_bancaria_id, cuenta_label, tarjeta_ref, notas_control, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                tipo_operacion = VALUES(tipo_operacion),
                metodo_pago_preferido = COALESCE(VALUES(metodo_pago_preferido), metodo_pago_preferido),
                cuenta_bancaria_id = VALUES(cuenta_bancaria_id),
                cuenta_label = VALUES(cuenta_label),
                tarjeta_ref = VALUES(tarjeta_ref),
                notas_control = COALESCE(VALUES(notas_control), notas_control),
                updated_by = VALUES(updated_by)`,
            [venId, recordatorioId, normOp, normMetodo, parsedCuentaId, safeCuentaLabel, safeTarjeta, safeNotas, actor]
        );

        // Si el usuario preasignó una forma de pago textual o cuenta, actualizar el campo legacy si aún no hay abonos
        const [abonoCnt] = await db.query('SELECT COUNT(*) AS c FROM recordatorios_pagos_abonos WHERE vencimiento_id = ?', [venId]);
        if (Number(abonoCnt[0]?.c || 0) === 0) {
            const legacyText = String(forma_pago_legacy || safeCuentaLabel || safeTarjeta || (normMetodo ? recordatoriosPagosService.getMethodMeta(normMetodo).label : '')).trim().slice(0, 50);
            if (legacyText) {
                await externalDb.query(
                    'UPDATE web_rc_recordatorios_vencimientos SET forma_pago = ? WHERE id = ?',
                    [legacyText, venId]
                );
            }
        } else if (tipo_operacion) {
            await db.query('UPDATE recordatorios_pagos_abonos SET tipo_operacion = ? WHERE vencimiento_id = ?', [normOp, venId]);
        }

        const detail = await recordatoriosPagosService.getVencimientoDetail({ db, externalDb, vencimientoId: venId });
        res.json({ success: true, message: 'Clasificación y método actualizados', detail });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar configuración del pago');
    }
});

router.post('/operaciones/recordatorios/vencimiento/:id/abonos', authenticateToken, requirePermission(recordatoriosManagePerms), async (req, res) => {
    try {
        const venId = parseInt(req.params.id, 10);
        if (!venId) return res.status(400).json({ message: 'ID de vencimiento inválido' });

        const {
            tipo_operacion = 'CXP',
            metodo_pago = 'TRANSFERENCIA',
            cuenta_bancaria_id = null,
            cuenta_label = null,
            tarjeta_ref = null,
            beneficiario = null,
            referencia_doc = null,
            fecha_pago,
            monto,
            notas = null,
            comprobantes = []
        } = req.body || {};

        const numericMonto = Math.round((Number(monto) || 0) * 100) / 100;
        if (!Number.isFinite(numericMonto) || numericMonto <= 0) {
            return res.status(400).json({ message: 'El monto del abono debe ser mayor a $0.00' });
        }

        const cleanFecha = formatDateYMD(fecha_pago) || getElSalvadorTodayYMD();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanFecha)) {
            return res.status(400).json({ message: 'La fecha de pago no es válida (use YYYY-MM-DD)' });
        }

        const db = getDb();
        const externalDb = await getExternalDb();
        await recordatoriosPagosService.ensureRecordatoriosPagosTables(db);

        const [venRows] = await externalDb.query(
            `SELECT a.id, a.id_recordatorio, b.descripcion, b.monto, c.descripcion AS ubicacion
             FROM web_rc_recordatorios_vencimientos a
             INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
             LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
             WHERE a.id = ? LIMIT 1`,
            [venId]
        );
        if (!venRows || venRows.length === 0) {
            return res.status(404).json({ message: 'Vencimiento no encontrado' });
        }
        const ven = venRows[0];

        const normOp = recordatoriosPagosService.normalizeTipoOperacion(tipo_operacion);
        const normMetodo = recordatoriosPagosService.normalizeMetodoPago(metodo_pago);
        const parsedCuentaId = cuenta_bancaria_id ? parseInt(cuenta_bancaria_id, 10) || null : null;
        const safeCuentaLabel = cuenta_label ? String(cuenta_label).trim().slice(0, 150) : null;
        const safeTarjeta = tarjeta_ref ? String(tarjeta_ref).trim().slice(0, 100) : null;
        const safeBeneficiario = beneficiario ? String(beneficiario).trim().slice(0, 150) : null;
        const safeRef = referencia_doc ? String(referencia_doc).trim().slice(0, 120) : null;
        const safeNotas = notas ? String(notas).trim().slice(0, 1000) : null;
        const actor = req.user?.username || req.user?.email || 'sistema';

        // Según preferencia: no inserta automáticamente en movimientos_bancarios;
        // queda como PENDIENTE de conciliación si tiene cuenta bancaria asociada para sugerirlo en Conciliación Bancaria.
        const estadoConciliacion = (parsedCuentaId && recordatoriosPagosService.BANK_RECONCILIABLE_METHODS.has(normMetodo))
            ? 'PENDIENTE'
            : 'NO_APLICA';

        const [ins] = await db.query(
            `INSERT INTO recordatorios_pagos_abonos
                (vencimiento_id, recordatorio_id, ubicacion, descripcion_ref, tipo_operacion, metodo_pago,
                 cuenta_bancaria_id, cuenta_label, tarjeta_ref, beneficiario, referencia_doc, fecha_pago, monto, notas,
                 estado_conciliacion, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                venId,
                ven.id_recordatorio,
                String(ven.ubicacion || '').slice(0, 120),
                String(ven.descripcion || '').slice(0, 150),
                normOp,
                normMetodo,
                parsedCuentaId,
                safeCuentaLabel,
                safeTarjeta,
                safeBeneficiario,
                safeRef,
                cleanFecha,
                numericMonto,
                safeNotas,
                estadoConciliacion,
                actor
            ]
        );
        const abonoId = ins.insertId;

        // Actualizar meta con el tipo_operacion y método más reciente
        await db.query(
            `INSERT INTO recordatorios_vencimientos_meta
                (vencimiento_id, recordatorio_id, tipo_operacion, metodo_pago_preferido, cuenta_bancaria_id, cuenta_label, tarjeta_ref, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                tipo_operacion = VALUES(tipo_operacion),
                metodo_pago_preferido = VALUES(metodo_pago_preferido),
                cuenta_bancaria_id = COALESCE(VALUES(cuenta_bancaria_id), cuenta_bancaria_id),
                cuenta_label = COALESCE(VALUES(cuenta_label), cuenta_label),
                tarjeta_ref = COALESCE(VALUES(tarjeta_ref), tarjeta_ref),
                updated_by = VALUES(updated_by)`,
            [venId, ven.id_recordatorio, normOp, normMetodo, parsedCuentaId, safeCuentaLabel, safeTarjeta, actor]
        );

        // Guardar comprobantes adjuntos (si se enviaron múltiples archivos junto al abono)
        if (Array.isArray(comprobantes) && comprobantes.length > 0) {
            for (const comp of comprobantes.slice(0, 10)) {
                if (!comp || !comp.data_url) continue;
                const saved = recordatoriosPagosService.saveReceiptBase64({
                    dataUrl: comp.data_url,
                    nombreOriginal: comp.nombre_original || 'comprobante.webp',
                    vencimientoId: venId
                });
                await db.query(
                    `INSERT INTO recordatorios_pagos_comprobantes
                        (vencimiento_id, abono_id, nombre_original, archivo_url, mime_type, tamano_bytes, ancho, alto, nota, uploaded_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        venId,
                        abonoId,
                        saved.nombre_original,
                        saved.archivo_url,
                        saved.mime_type,
                        saved.tamano_bytes,
                        comp.ancho ? parseInt(comp.ancho, 10) || null : null,
                        comp.alto ? parseInt(comp.alto, 10) || null : null,
                        comp.nota ? String(comp.nota).trim().slice(0, 255) : null,
                        actor
                    ]
                );
            }
        }

        const synced = await recordatoriosPagosService.syncVencimientoWithAbonos({ db, externalDb, vencimientoId: venId });
        const detail = await recordatoriosPagosService.getVencimientoDetail({ db, externalDb, vencimientoId: venId });

        const msg = synced?.balance?.estado_pago === 'CANCELADO'
            ? 'Pago registrado y saldo liquidado al 100% (CANCELADO)'
            : `Abono parcial registrado (${synced?.balance?.porcentaje_pagado || 0}% · Saldo pendiente: $${Number(synced?.balance?.saldo_pendiente || 0).toFixed(2)})`;

        res.status(201).json({ success: true, message: msg, abono_id: abonoId, detail });
    } catch (error) {
        sendSafeError(res, error, 'Error al registrar abono/pago');
    }
});

router.put('/operaciones/recordatorios/abonos/:abonoId', authenticateToken, requirePermission(recordatoriosManagePerms), async (req, res) => {
    try {
        const abonoId = parseInt(req.params.abonoId, 10);
        if (!abonoId) return res.status(400).json({ message: 'ID de abono inválido' });

        const db = getDb();
        const externalDb = await getExternalDb();
        await recordatoriosPagosService.ensureRecordatoriosPagosTables(db);

        const [existingRows] = await db.query('SELECT * FROM recordatorios_pagos_abonos WHERE id = ? LIMIT 1', [abonoId]);
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({ message: 'Abono no encontrado' });
        }
        const existing = existingRows[0];

        const {
            tipo_operacion = existing.tipo_operacion,
            metodo_pago = existing.metodo_pago,
            cuenta_bancaria_id = existing.cuenta_bancaria_id,
            cuenta_label = existing.cuenta_label,
            tarjeta_ref = existing.tarjeta_ref,
            beneficiario = existing.beneficiario,
            referencia_doc = existing.referencia_doc,
            fecha_pago = existing.fecha_pago,
            monto = existing.monto,
            notas = existing.notas
        } = req.body || {};

        const numericMonto = Math.round((Number(monto) || 0) * 100) / 100;
        if (!Number.isFinite(numericMonto) || numericMonto <= 0) {
            return res.status(400).json({ message: 'El monto del abono debe ser mayor a $0.00' });
        }
        const cleanFecha = formatDateYMD(fecha_pago) || formatDateYMD(existing.fecha_pago) || getElSalvadorTodayYMD();
        const normOp = recordatoriosPagosService.normalizeTipoOperacion(tipo_operacion);
        const normMetodo = recordatoriosPagosService.normalizeMetodoPago(metodo_pago);
        const parsedCuentaId = cuenta_bancaria_id ? parseInt(cuenta_bancaria_id, 10) || null : null;
        const estadoConc = existing.estado_conciliacion === 'CONCILIADO'
            ? 'CONCILIADO'
            : ((parsedCuentaId && recordatoriosPagosService.BANK_RECONCILIABLE_METHODS.has(normMetodo)) ? 'PENDIENTE' : 'NO_APLICA');

        await db.query(
            `UPDATE recordatorios_pagos_abonos
             SET tipo_operacion = ?, metodo_pago = ?, cuenta_bancaria_id = ?, cuenta_label = ?,
                 tarjeta_ref = ?, beneficiario = ?, referencia_doc = ?, fecha_pago = ?, monto = ?, notas = ?,
                 estado_conciliacion = ?
             WHERE id = ?`,
            [
                normOp,
                normMetodo,
                parsedCuentaId,
                cuenta_label ? String(cuenta_label).trim().slice(0, 150) : null,
                tarjeta_ref ? String(tarjeta_ref).trim().slice(0, 100) : null,
                beneficiario ? String(beneficiario).trim().slice(0, 150) : null,
                referencia_doc ? String(referencia_doc).trim().slice(0, 120) : null,
                cleanFecha,
                numericMonto,
                notas ? String(notas).trim().slice(0, 1000) : null,
                estadoConc,
                abonoId
            ]
        );

        await recordatoriosPagosService.syncVencimientoWithAbonos({ db, externalDb, vencimientoId: existing.vencimiento_id });
        const detail = await recordatoriosPagosService.getVencimientoDetail({ db, externalDb, vencimientoId: existing.vencimiento_id });
        res.json({ success: true, message: 'Abono actualizado correctamente', detail });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar abono');
    }
});

router.post('/operaciones/recordatorios/analizar-comprobante', authenticateToken, requirePermission(recordatoriosViewPerms), async (req, res) => {
    try {
        const {
            data_url = null,
            archivo_url = null,
            nombre_original = '',
            contexto = {}
        } = req.body || {};

        if (!data_url && !archivo_url) {
            return res.status(400).json({ message: 'Debe proporcionar un comprobante (imagen o PDF) para analizar.' });
        }

        const db = getDb();
        const analisis = await recordatoriosPagosService.analyzePaymentReceiptWithAI({
            dataUrl: data_url,
            archivoUrl: archivo_url,
            nombreOriginal: nombre_original,
            db,
            contexto: contexto && typeof contexto === 'object' ? contexto : {}
        });

        res.json({
            ok: true,
            analisis
        });
    } catch (error) {
        sendSafeError(res, error, 'No se pudo leer el comprobante con IA');
    }
});

router.delete('/operaciones/recordatorios/abonos/:abonoId', authenticateToken, requirePermission(recordatoriosManagePerms), async (req, res) => {
    try {
        const abonoId = parseInt(req.params.abonoId, 10);
        if (!abonoId) return res.status(400).json({ message: 'ID de abono inválido' });

        const db = getDb();
        const externalDb = await getExternalDb();
        await recordatoriosPagosService.ensureRecordatoriosPagosTables(db);

        const [existingRows] = await db.query('SELECT * FROM recordatorios_pagos_abonos WHERE id = ? LIMIT 1', [abonoId]);
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({ message: 'Abono no encontrado' });
        }
        const existing = existingRows[0];

        // Desvincular comprobantes de este abono (manteniéndolos en el vencimiento para no perder evidencia)
        await db.query('UPDATE recordatorios_pagos_comprobantes SET abono_id = NULL WHERE abono_id = ?', [abonoId]);
        await db.query('DELETE FROM recordatorios_pagos_abonos WHERE id = ?', [abonoId]);

        await recordatoriosPagosService.syncVencimientoWithAbonos({
            db,
            externalDb,
            vencimientoId: existing.vencimiento_id,
            forcePendingOnEmpty: true
        });
        const detail = await recordatoriosPagosService.getVencimientoDetail({ db, externalDb, vencimientoId: existing.vencimiento_id });
        res.json({ success: true, message: 'Abono eliminado y saldo recalculado', detail });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar abono');
    }
});

router.post('/operaciones/recordatorios/vencimiento/:id/comprobantes', authenticateToken, requirePermission(recordatoriosManagePerms), async (req, res) => {
    try {
        const venId = parseInt(req.params.id, 10);
        if (!venId) return res.status(400).json({ message: 'ID de vencimiento inválido' });

        const { abono_id = null, comprobantes = [] } = req.body || {};
        if (!Array.isArray(comprobantes) || comprobantes.length === 0) {
            return res.status(400).json({ message: 'Debe adjuntar al menos un comprobante' });
        }

        const db = getDb();
        const externalDb = await getExternalDb();
        await recordatoriosPagosService.ensureRecordatoriosPagosTables(db);

        const actor = req.user?.username || req.user?.email || 'sistema';
        const parsedAbonoId = abono_id ? parseInt(abono_id, 10) || null : null;
        const inserted = [];

        for (const comp of comprobantes.slice(0, 10)) {
            if (!comp || !comp.data_url) continue;
            const saved = recordatoriosPagosService.saveReceiptBase64({
                dataUrl: comp.data_url,
                nombreOriginal: comp.nombre_original || 'comprobante.webp',
                vencimientoId: venId
            });
            const [ins] = await db.query(
                `INSERT INTO recordatorios_pagos_comprobantes
                    (vencimiento_id, abono_id, nombre_original, archivo_url, mime_type, tamano_bytes, ancho, alto, nota, uploaded_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    venId,
                    parsedAbonoId,
                    saved.nombre_original,
                    saved.archivo_url,
                    saved.mime_type,
                    saved.tamano_bytes,
                    comp.ancho ? parseInt(comp.ancho, 10) || null : null,
                    comp.alto ? parseInt(comp.alto, 10) || null : null,
                    comp.nota ? String(comp.nota).trim().slice(0, 255) : null,
                    actor
                ]
            );
            inserted.push({
                id: ins.insertId,
                ...saved,
                signed_url: signUploadUrl(saved.archivo_url)
            });
        }

        const detail = await recordatoriosPagosService.getVencimientoDetail({ db, externalDb, vencimientoId: venId });
        res.status(201).json({
            success: true,
            message: `${inserted.length} comprobante(s) guardado(s) correctamente`,
            comprobantes: inserted,
            detail
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al subir comprobante(s)');
    }
});

router.delete('/operaciones/recordatorios/comprobantes/:comprobanteId', authenticateToken, requirePermission(recordatoriosManagePerms), async (req, res) => {
    try {
        const compId = parseInt(req.params.comprobanteId, 10);
        if (!compId) return res.status(400).json({ message: 'ID de comprobante inválido' });

        const db = getDb();
        const externalDb = await getExternalDb();
        await recordatoriosPagosService.ensureRecordatoriosPagosTables(db);

        const [rows] = await db.query('SELECT * FROM recordatorios_pagos_comprobantes WHERE id = ? LIMIT 1', [compId]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ message: 'Comprobante no encontrado' });
        }
        const comp = rows[0];
        recordatoriosPagosService.deleteReceiptFile(comp.archivo_url);
        await db.query('DELETE FROM recordatorios_pagos_comprobantes WHERE id = ?', [compId]);

        const detail = await recordatoriosPagosService.getVencimientoDetail({ db, externalDb, vencimientoId: comp.vencimiento_id });
        res.json({ success: true, message: 'Comprobante eliminado', detail });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar comprobante');
    }
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
            UPDATE portal_pedidos SET id_estacion = '016', estacion_nombre = 'SHELL POLIEDRO'
            WHERE (id_estacion IS NULL OR id_estacion = '' OR id_estacion != '016') 
              AND (estacion_nombre LIKE '%POLIEDRO%' OR raw_data_json LIKE '%POLIEDRO%')
        `);
        await db.query(`
            UPDATE portal_pedidos SET id_estacion = '004', estacion_nombre = 'PUMA EL DESVIO'
            WHERE (id_estacion IS NULL OR id_estacion = '' OR id_estacion != '004') 
              AND (estacion_nombre LIKE '%DESVIO%' OR estacion_nombre LIKE '%DESVÍO%' OR raw_data_json LIKE '%DESVIO%')
              AND estacion_nombre NOT LIKE '%POLIEDRO%' AND raw_data_json NOT LIKE '%POLIEDRO%'
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
        let data = rows.length > 0 ? { ...rows[0] } : {
            saldo_disponible: 633.00,
            limite_credito: 2000.00,
            porcentaje_disponible: 32.00,
            cuenta_nombre: 'corina sosah',
            cuenta_numero: '3409396',
            ultima_sincronizacion: null
        };

        const { getAutoSyncStatus } = require('../services/autoSyncScheduler');
        const autoSync = getAutoSyncStatus();

        if (!data.ultima_sincronizacion) {
            if (autoSync?.lastSync?.lastRunAt) {
                data.ultima_sincronizacion = autoSync.lastSync.lastRunAt;
            } else {
                const [lastOrder] = await withRetry(() => db.query("SELECT MAX(sincronizado_at) as last_order_sync FROM portal_pedidos")).catch(() => [[]]);
                data.ultima_sincronizacion = lastOrder[0]?.last_order_sync || data.updated_at || new Date().toISOString();
            }
        }

        // NOTA: La sincronización automática con Puppeteer está delegada exclusivamente al servidor de automatizaciones (169.58.207.115).
        // En este servidor principal NO se ejecuta scraping en segundo plano para no sobrecargar la CPU.

        if (data.ultima_sincronizacion) {
            try {
                const d = new Date(data.ultima_sincronizacion);
                if (!isNaN(d.getTime())) {
                    data.ultima_sincronizacion_hora = d.toLocaleTimeString('es-SV', {
                        timeZone: 'America/El_Salvador',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    });
                    data.ultima_sincronizacion_fecha = d.toLocaleDateString('es-SV', {
                        timeZone: 'America/El_Salvador',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    });
                }
            } catch (err) {
                // ignore
            }
        }

        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener resumen de cuenta');
    }
});

// Middleware para permitir acceso tanto a administradores autenticados (JWT) como al orquestador remoto (169.58.207.115 / n8n) vía API key
const safeCompareSyncKey = (a, b) => {
    if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

const getValidSyncKeys = () => [
    process.env.INTERNAL_API_KEY,
    process.env.N8N_API_KEY,
    process.env.SYNC_API_KEY,
    process.env.PORTAL_SYNC_API_KEY,
    process.env.TELEGRAM_API_KEY,
    process.env.TELEGRAM_BROADCAST_KEY,
    process.env.NODE_ENV !== 'production' ? 'sipe_orchestrator_2026_secure_token' : null
].filter(Boolean);

const authenticateSyncOrAdmin = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.headers['x-n8n-key'] || req.headers['x-n8n-token'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    const validKeys = getValidSyncKeys();

    if (apiKey && validKeys.some(k => safeCompareSyncKey(String(apiKey), String(k)))) {
        req.user = {
            id: 0,
            username: 'remote-orchestrator-169',
            role_name: 'Administrator',
            role_id: 1,
            permissions: ['manage_pedidos', '/dashboard/operaciones/pedidos', 'admin']
        };
        return next();
    }

    return authenticateToken(req, res, () => {
        requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos'])(req, res, next);
    });
};

// 3. Sincronizar todo desde el portal Energy Latam (manual o API remota)
router.post('/operaciones/portal/sincronizar', authenticateSyncOrAdmin, async (req, res) => {
    try {
        const io = req.app.get('io');
        const limitParam = req.body?.limit;
        const limit = limitParam !== undefined ? (limitParam === 'all' ? 50 : Math.min(50, Math.max(1, parseInt(limitParam, 10) || 10))) : 10;
        const result = await energyLatamService.syncFromPortal(io, null, limit);
        try {
            const db = getDb();
            await withRetry(() => db.query("UPDATE portal_resumen_cuenta SET ultima_sincronizacion = NOW() ORDER BY id DESC LIMIT 1"));
        } catch (dbErr) {
            console.warn('[sincronizar] Error al actualizar timestamp en portal_resumen_cuenta:', dbErr.message);
        }
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al sincronizar con el portal Energy Latam');
    }
});

// 3b. Endpoint exclusivo para disparar ciclo unificado de sincronización desde servidor remoto de automatizaciones (169.58.207.115)
router.post('/operaciones/portal/auto-sync-remote', authenticateSyncOrAdmin, async (req, res) => {
    try {
        const io = req.app.get('io');
        const { executeAutoSyncCycle } = require('../services/autoSyncScheduler');
        const source = req.body?.source || 'REMOTE_CRON_169.58.207.115';
        const result = await executeAutoSyncCycle(io, source);
        res.json({
            success: true,
            message: 'Ciclo unificado de sincronización completado',
            ...result
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al ejecutar sincronización remota');
    }
});

// 3a1. Consultar estado y configuración de sincronización automática
router.get('/operaciones/portal/sincronizacion-horarios', authenticateToken, requirePermission(pedidosViewPerms), (req, res) => {
    try {
        const { getAutoSyncStatus } = require('../services/autoSyncScheduler');
        res.json(getAutoSyncStatus());
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar horarios de sincronización automática');
    }
});

// 3a2. Disparar sincronización manual completa (Portal Pedidos + Precios Competencia)
router.post('/operaciones/portal/sincronizar-todo', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const io = req.app.get('io');
        const { executeAutoSyncCycle } = require('../services/autoSyncScheduler');
        const result = await executeAutoSyncCycle(io, 'MANUAL_DISPATCH');
        try {
            const db = getDb();
            await withRetry(() => db.query("UPDATE portal_resumen_cuenta SET ultima_sincronizacion = NOW() ORDER BY id DESC LIMIT 1"));
        } catch (dbErr) {
            console.warn('[sincronizar-todo] Error al actualizar timestamp en portal_resumen_cuenta:', dbErr.message);
        }
        res.json(result);
    } catch (error) {
        sendSafeError(res, error, 'Error al ejecutar sincronización unificada');
    }
});

// 3a3. Actualizar explícitamente la hora registrada de sincronización
router.post('/operaciones/portal/actualizar-hora-sincronizacion', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const db = getDb();
        await withRetry(() => db.query("UPDATE portal_resumen_cuenta SET ultima_sincronizacion = NOW() ORDER BY id DESC LIMIT 1"));
        const [rows] = await withRetry(() => db.query("SELECT * FROM portal_resumen_cuenta ORDER BY id DESC LIMIT 1"));
        const io = req.app.get('io');
        if (io) {
            io.emit('portal_pedidos_updated', {
                timestamp: new Date().toISOString(),
                resumen: rows[0]
            });
        }
        res.json({ success: true, message: 'Hora de sincronización actualizada exitosamente', resumen: rows[0] });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar hora de sincronización');
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

// 5b. Actualizar método de pago y/o cuenta bancaria directamente en la tabla (inline)
router.patch('/operaciones/portal/metodo-pago/:numero_orden', authenticateToken, requirePermission(pedidosManagePerms), async (req, res) => {
    try {
        const { numero_orden } = req.params;
        const { tipo_pago, cuenta_bancaria_id } = req.body;
        const db = getDb();
        const [ordRows] = await db.query('SELECT * FROM portal_pedidos WHERE numero_orden = ?', [numero_orden]);
        if (ordRows.length === 0) return res.status(404).json({ message: 'Pedido no encontrado' });
        const orden = ordRows[0];

        const nextTipoPago = tipo_pago !== undefined ? (String(tipo_pago || '').trim() || 'Transferencia') : (orden.tipo_pago || 'Transferencia');
        const nextCuentaId = cuenta_bancaria_id !== undefined ? (cuenta_bancaria_id || null) : orden.cuenta_bancaria_id;

        await db.query(
            'UPDATE portal_pedidos SET tipo_pago = ?, cuenta_bancaria_id = ? WHERE numero_orden = ?',
            [nextTipoPago, nextCuentaId, numero_orden]
        );

        if (orden.movimiento_bancario_id && nextCuentaId) {
            const [ctaRows] = await db.query('SELECT * FROM cuentas_bancarias WHERE id = ?', [nextCuentaId]);
            if (ctaRows.length > 0) {
                const cta = ctaRows[0];
                const tipoRemesaCode = nextTipoPago.toUpperCase().includes('CHEQ') ? 'CH' : 'TR';
                const [remesas] = await db.query('SELECT id FROM tipos_remesas WHERE empresa_id = ? AND codigo = ? LIMIT 1', [cta.empresa_id, tipoRemesaCode]);
                const tipoRemesaId = remesas[0]?.id || null;
                await db.query(
                    'UPDATE movimientos_bancarios SET cuenta_bancaria_id = ?, tipo_remesa_id = ? WHERE id = ?',
                    [cta.id, tipoRemesaId, orden.movimiento_bancario_id]
                );
            }
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('portal_pedidos_updated', { numero_orden, tipo_pago: nextTipoPago, cuenta_bancaria_id: nextCuentaId });
        }

        res.json({
            success: true,
            message: 'Método de pago actualizado',
            tipo_pago: nextTipoPago,
            cuenta_bancaria_id: nextCuentaId
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar método de pago');
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
            const pD = Number(precio_diesel || 0);
            const pR = Number(precio_regular || 0);
            const pS = Number(precio_super || 0);
            const pI = Number(precio_ion || 0);
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
            `, [pD, pR, pS, pI, pD, pR, pS, pI]);
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

// =========================================================================
// SERVICIOS DE ENERGÍA SOLAR Y ALMACENAMIENTO (BATERÍAS)
// =========================================================================
const energiaSolarViewPerms = [
    '/dashboard/operaciones/energia-solar',
    '/dashboard/consultas/ia-asistente',
    '/dashboard/estrategia/torre-control',
    'view_direccion_estrategica'
];

const horasPicoViewPerms = [
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/consultas/estaciones/resumen-cierre',
    '/dashboard/consultas/ia-asistente',
    '/dashboard/estrategia/torre-control',
    'view_direccion_estrategica',
    'view_ventas'
];

router.get('/energia/instalaciones', authenticateToken, requirePermission(energiaSolarViewPerms), async (req, res) => {
    try {
        const data = await solarEnergyService.getInstalacionesSolares();
        res.json({ success: true, data });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener instalaciones solares');
    }
});

router.get('/energia/ahorro-diario', authenticateToken, requirePermission(energiaSolarViewPerms), async (req, res) => {
    try {
        const { fecha, estacion_id } = req.query;
        const data = await solarEnergyService.getSolarAhorroDiario(fecha, estacion_id);
        res.json({ success: true, data });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener ahorro solar diario');
    }
});

router.get('/energia/ahorro-mensual', authenticateToken, requirePermission(energiaSolarViewPerms), async (req, res) => {
    try {
        const { anio, mes, year, month, estacion_id } = req.query;
        const data = await solarEnergyService.getSolarAhorroMensual(year || anio, month || mes, estacion_id);
        res.json({ success: true, data });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener ahorro solar mensual');
    }
});

router.get('/energia/ahorro-rango', authenticateToken, requirePermission(energiaSolarViewPerms), async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta, estacion_id } = req.query;
        const data = await solarEnergyService.getSolarAhorroRango(fecha_desde, fecha_hasta, estacion_id);
        res.json({ success: true, data });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener ahorro solar por rango');
    }
});

router.get('/energia/estado-actual', authenticateToken, requirePermission(energiaSolarViewPerms), async (req, res) => {
    try {
        const data = await solarEnergyService.getSolarEstadoActual();
        res.json({ success: true, data });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener estado solar actual');
    }
});

// =========================================================================
// SERVICIOS DE ANÁLISIS DE HORAS PICO DE VENTA
// =========================================================================

router.get('/ventas/horas-pico', authenticateToken, requirePermission(horasPicoViewPerms), async (req, res) => {
    try {
        const { fecha, branch_id } = req.query;
        const data = await salesHourlyService.getHorasPicoVentas(fecha, branch_id);
        res.json({ success: true, data });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener horas pico de venta');
    }
});

router.get('/ventas/horas-pico-rango', authenticateToken, requirePermission(horasPicoViewPerms), async (req, res) => {
    try {
        const { fecha_desde, fecha_hasta, branch_id } = req.query;
        const data = await salesHourlyService.getHorasPicoRango(fecha_desde, fecha_hasta, branch_id);
        res.json({ success: true, data });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener análisis consolidado de horas pico');
    }
});

router.parsePedidosPagination = parsePedidosPagination;
router.calculateHasMore = calculateHasMore;
router.buildEstacionFilterClause = buildEstacionFilterClause;
router.buildCompactPresetValue = buildCompactPresetValue;
router.inferBankNameFromText = inferBankNameFromText;
router.inferUbicacionTags = inferUbicacionTags;
router.formatDateYMD = formatDateYMD;
router.formatSqlDateTimeSV = formatSqlDateTimeSV;
router.addDaysYMD = addDaysYMD;
router.getElSalvadorTodayYMD = getElSalvadorTodayYMD;
router.fetchPromedios = fetchPromedios;
router.reconcileScheduledOrdersWithRefills = reconcileScheduledOrdersWithRefills;
router.fetchProgramadosEstacion = fetchProgramadosEstacion;

module.exports = router;
module.exports.parsePedidosPagination = parsePedidosPagination;
module.exports.calculateHasMore = calculateHasMore;
module.exports.buildEstacionFilterClause = buildEstacionFilterClause;
module.exports.buildCompactPresetValue = buildCompactPresetValue;
module.exports.inferBankNameFromText = inferBankNameFromText;
module.exports.inferUbicacionTags = inferUbicacionTags;
module.exports.formatDateYMD = formatDateYMD;
module.exports.formatSqlDateTimeSV = formatSqlDateTimeSV;
module.exports.addDaysYMD = addDaysYMD;
module.exports.getElSalvadorTodayYMD = getElSalvadorTodayYMD;
module.exports.fetchPromedios = fetchPromedios;
module.exports.reconcileScheduledOrdersWithRefills = reconcileScheduledOrdersWithRefills;
module.exports.fetchProgramadosEstacion = fetchProgramadosEstacion;
