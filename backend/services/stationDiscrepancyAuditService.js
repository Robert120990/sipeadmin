const cron = require('node-cron');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const withRetry = (...args) => dbModule.withRetry(...args);

const {
    OFFICIAL_ESTACIONES,
    branchToEmpId,
    normalizeSaasBranchId,
    getCleanStationName,
    getCleanTiendaName,
    formatYMD,
    computeSaasStoreShiftMetrics
} = require('./consultasCatalog');
const { sendTelegramMessage } = require('./telegramTransportService');
const {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr,
    shiftDate
} = require('./telegramTextAndDates');

const ensuredAuditPools = new WeakSet();
let watcherTask = null;
let watcherIo = null;

const STATION_KEYWORDS = [
    { empId: '002', branchId: 4, name: 'Puma Miraflores', patterns: ['MIRAFLORES'] },
    { empId: '006', branchId: 3, name: 'Shell Chalchuapa', patterns: ['CHALCHUAPA'] },
    { empId: '008', branchId: 8, name: 'Puma Costa del Sol', patterns: ['COSTA'] },
    { empId: '014', branchId: 1, name: 'Puma La Loma (San Martín)', patterns: ['SAN MARTIN', 'SAN MARTÍN', 'LA LOMA'] },
    { empId: '015', branchId: 2, name: 'Shell 14 Avenida', patterns: ['14 AV'] },
    { empId: '016', branchId: 7, name: 'Shell Poliedro', patterns: ['POLIEDRO'] }
];

const round2 = (v) => (Math.round(Number(v || 0) * 100) / 100) || 0;

/**
 * Crea de forma idempotente la bitácora de deduplicación de alertas de cortes y remesas.
 */
async function ensureDiscrepancyAlertSchema(db) {
    if (!db || typeof db.query !== 'function') return;
    if (ensuredAuditPools.has(db)) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS station_discrepancy_alerts_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            alert_fingerprint VARCHAR(160) NOT NULL,
            alert_type VARCHAR(40) NOT NULL,
            station_name VARCHAR(120) NULL,
            audit_date DATE NULL,
            amount_usd DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            severity VARCHAR(20) NOT NULL DEFAULT 'warning',
            summary VARCHAR(500) NULL,
            telegram_sent_count INT NOT NULL DEFAULT 0,
            inapp_sent_count INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_station_alert_fp (alert_fingerprint)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ensuredAuditPools.add(db);
}

/**
 * Construye los sufijos /MM/YYYY necesarios para filtrar `fecha` en db_system_rrs.movimientos_bancarios sin full-scan.
 */
function buildMonthLikePatterns(startYmd, endYmd) {
    const patterns = new Set();
    const s = new Date(`${startYmd}T12:00:00Z`);
    const e = new Date(`${endYmd}T12:00:00Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        const now = new Date();
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        return [`%/${mm}/${now.getUTCFullYear()}`];
    }
    const cursor = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
    const limit = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 1));
    let guard = 0;
    while (cursor <= limit && guard < 4) {
        const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = cursor.getUTCFullYear();
        patterns.add(`%/${mm}/${yyyy}`);
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        guard += 1;
    }
    return Array.from(patterns);
}

function matchStationByConcept(concepto) {
    const upper = String(concepto || '').toUpperCase();
    for (const st of STATION_KEYWORDS) {
        if (st.patterns.some(p => upper.includes(p))) {
            return st;
        }
    }
    return null;
}

function extractDeclaredTotalFromComment(comentario) {
    const raw = String(comentario || '');
    const m = raw.match(/TOTAL\s*[:=]?\s*\$?\s*([\d,]+\.\d{2})/i);
    if (!m) return null;
    const val = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(val) ? round2(val) : null;
}

function parseBankDateDmyToIso(fechaStr) {
    const parts = String(fechaStr || '').trim().split('/');
    if (parts.length !== 3) return formatYMD(fechaStr);
    const [dd, mm, yyyy] = parts;
    if (!dd || !mm || !yyyy || yyyy.length !== 4) return '';
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Ejecuta la auditoría integral cruzada (solo lectura) entre:
 * 1) Cierres de Pista (fórmula completa incluyendo cheques, vales, anticipos despachados, trupput y lubricantes),
 * 2) Cortes de Tienda (SaaS con corrección Super El Pedregal + cort_cabecera legado),
 * 3) Envíos de Remesas (pista y tienda) vs Depósitos reales en banco (db_system_rrs.movimientos_bancarios),
 * 4) Remesas de pista sin entregar >48h netas (descontando depósitos RWQ / Remesa Cliente en banco).
 */
async function auditStationCloseoutsAndRemesas({
    dias = 7,
    closeoutDays = null,
    targetDate = null,
    pistaThreshold = 5,
    tiendaThreshold = 5,
    deliveryDiffThreshold = 5,
    undeliveredMinUsd = 50,
    accountingDb = null,
    externalDb = null,
    todayOverride = null
} = {}) {
    const baseDate = todayOverride || getDateStr(0);
    const auditDays = Math.min(30, Math.max(1, parseInt(dias, 10) || 7));
    const cDays = Math.min(30, Math.max(1, parseInt(closeoutDays || auditDays, 10) || auditDays));

    const remesaEnd = targetDate || baseDate;
    const remesaStart = targetDate || shiftDate(baseDate, -(auditDays - 1));
    const closeoutEnd = targetDate || baseDate;
    const closeoutStart = targetDate || shiftDate(baseDate, -(cDays - 1));
    const cutoff48h = shiftDate(baseDate, -2);
    const cutoff24h = shiftDate(baseDate, -1);

    const saas = accountingDb !== null && accountingDb !== undefined
        ? accountingDb
        : await getAccountingDb().catch(() => null);
    const rrs = externalDb !== null && externalDb !== undefined
        ? externalDb
        : await getExternalDb().catch(() => null);

    // 1. Movimientos bancarios vivos en db_system_rrs acotados por mes
    const bankByG = new Map();
    const bankByS = new Map();
    const rwqPistaByEmp = new Map();
    const rwqStoreByEmp = new Map();
    const clientRemByEmp = new Map();

    if (rrs && typeof rrs.query === 'function') {
        const minDate = remesaStart < closeoutStart ? remesaStart : closeoutStart;
        const scanStart = shiftDate(minDate, -2);
        const scanEnd = shiftDate(remesaEnd, 1);
        const monthPatterns = buildMonthLikePatterns(scanStart, scanEnd);
        const likeClause = monthPatterns.map(() => 'fecha LIKE ?').join(' OR ');

        try {
            const [movs] = await withRetry(() => rrs.query(
                `SELECT llave, id_empresa, numero_cuenta, fecha, documento, cod_remesa, concepto,
                        COALESCE(cargo, 0) AS cargo, COALESCE(monto, 0) AS monto
                 FROM movimientos_bancarios
                 WHERE (${likeClause})
                   AND COALESCE(cargo, monto, 0) > 0`,
                monthPatterns
            ));

            for (const m of (movs || [])) {
                const val = round2(Number(m.cargo || m.monto || 0));
                if (val <= 0) continue;
                const llave = String(m.llave || '').trim();
                const concepto = String(m.concepto || '').trim();
                const isoDate = parseBankDateDmyToIso(m.fecha);
                const inBankWindow = isoDate ? (isoDate >= remesaStart && isoDate <= scanEnd) : true;

                const matchG = llave.match(/-G(\d+)(?:-E(\d+))?$/);
                if (matchG) {
                    const gid = Number(matchG[1]);
                    const cur = bankByG.get(gid) || { mainSum: 0, extraSum: 0, totalSum: 0, rows: 0, fechas: [] };
                    if (matchG[2]) cur.extraSum = round2(cur.extraSum + val);
                    else cur.mainSum = round2(cur.mainSum + val);
                    cur.totalSum = round2(cur.mainSum + cur.extraSum);
                    cur.rows += 1;
                    if (isoDate) cur.fechas.push(isoDate);
                    bankByG.set(gid, cur);
                    continue;
                }

                const matchS = llave.match(/-S(\d+)(?:-E(\d+))?$/);
                if (matchS) {
                    const sid = Number(matchS[1]);
                    const cur = bankByS.get(sid) || { totalSum: 0, rows: 0, fechas: [] };
                    cur.totalSum = round2(cur.totalSum + val);
                    cur.rows += 1;
                    if (isoDate) cur.fechas.push(isoDate);
                    bankByS.set(sid, cur);
                    continue;
                }

                if (!inBankWindow) continue;
                const stMatch = matchStationByConcept(concepto);
                if (!stMatch) continue;
                const upperC = concepto.toUpperCase();

                if (llave.startsWith('RWQ')) {
                    const isStoreConcept = upperC.includes('SUPER 7') || upperC.includes('E-MARKET') || upperC.includes('TIENDA');
                    if (isStoreConcept) {
                        rwqStoreByEmp.set(stMatch.empId, round2((rwqStoreByEmp.get(stMatch.empId) || 0) + val));
                    } else {
                        rwqPistaByEmp.set(stMatch.empId, round2((rwqPistaByEmp.get(stMatch.empId) || 0) + val));
                    }
                } else if (upperC.includes('REMESA CLIENTE') || upperC.includes('SOBRANTE REMESA')) {
                    clientRemByEmp.set(stMatch.empId, round2((clientRemByEmp.get(stMatch.empId) || 0) + val));
                }
            }
        } catch (bankErr) {
            console.warn('[StationDiscrepancyAudit] Error consultando rrs.movimientos_bancarios:', bankErr.message);
        }
    }

    // 2. Auditoría de Cierres de Pista (fórmula completa + fusión branch 7/12)
    const pistaDiscrepancias = [];
    const stationStats = new Map();
    const ensureStationStat = (empId, branchId, name) => {
        if (!stationStats.has(empId)) {
            stationStats.set(empId, {
                id_empresa: empId,
                branch_id: branchId,
                estacion: name,
                turnos_cerrados: 0,
                venta_pista_usd: 0,
                cortes_discrepancias_count: 0,
                cortes_dif_acumulada_usd: 0,
                remesas_reportadas_usd: 0,
                remesas_entregadas_saas_usd: 0,
                remesas_pendientes_saas_usd: 0,
                remesas_pendientes_48h_usd: 0,
                envios_pista_count: 0,
                envios_pista_linked_usd: 0,
                banco_saas_g_usd: 0,
                banco_alt_rwq_clientes_usd: round2((rwqPistaByEmp.get(empId) || 0) + (clientRemByEmp.get(empId) || 0)),
                neto_sin_respaldo_48h_usd: 0,
                delivery_mismatches_count: 0
            });
        }
        return stationStats.get(empId);
    };

    for (const st of OFFICIAL_ESTACIONES) {
        ensureStationStat(st.id_empresa, st.branch_id, st.titulo);
    }

    if (saas && typeof saas.query === 'function') {
        try {
            const [pistaShifts] = await withRetry(() => saas.query(`
                SELECT
                    c.id,
                    c.branch_id,
                    DATE_FORMAT(c.fecha_turno, '%Y-%m-%d') AS fecha,
                    c.numero_turno AS turno,
                    c.seller_name AS responsable,
                    COALESCE((SELECT SUM(r.monto) FROM gas_station_closeout_readings r WHERE r.closeout_id = c.id), 0) AS venta_comb,
                    COALESCE((SELECT SUM(l.total) FROM gas_station_closeout_lubricant_readings l WHERE l.closeout_id = c.id), 0) AS lubricantes,
                    COALESCE((SELECT SUM(cr.monto) FROM gas_station_closeout_creditos cr WHERE cr.closeout_id = c.id), 0) AS creditos,
                    COALESCE((SELECT SUM(cp.monto) FROM gas_station_closeout_cupones cp WHERE cp.closeout_id = c.id), 0) AS cupones,
                    COALESCE((SELECT SUM(ch.monto) FROM gas_station_closeout_cheques ch WHERE ch.closeout_id = c.id), 0) AS cheques,
                    COALESCE((SELECT SUM(vl.monto) FROM gas_station_closeout_vales vl WHERE vl.closeout_id = c.id), 0) AS vales,
                    COALESCE((SELECT SUM(ant.monto) FROM gas_station_closeout_anticipos_despachados ant WHERE ant.closeout_id = c.id), 0) AS anticipos_despachados,
                    COALESCE((SELECT SUM(tr.monto) FROM gas_station_closeout_trupput_despachos tr WHERE tr.closeout_id = c.id), 0) AS trupput,
                    COALESCE((SELECT SUM(tar.monto) FROM gas_station_closeout_tarjetas tar WHERE tar.closeout_id = c.id), 0) AS tarjetas,
                    COALESCE((SELECT SUM(rem.monto) FROM gas_station_closeout_remesas rem WHERE rem.closeout_id = c.id), 0) AS remesas,
                    COALESCE((SELECT SUM(g.valor) FROM gas_station_closeout_expenses g WHERE g.closeout_id = c.id), 0) AS gastos,
                    COALESCE((SELECT SUM(ad.monto) FROM gas_station_closeout_adelantos ad WHERE ad.closeout_id = c.id), 0) AS anticipos,
                    COALESCE((SELECT SUM(d.total) FROM gas_station_closeout_descuentos d WHERE d.closeout_id = c.id), 0) AS descuentos
                FROM gas_station_closeouts c
                WHERE c.estado = 'cerrado'
                  AND c.fecha_turno BETWEEN ? AND ?
                ORDER BY c.fecha_turno DESC, c.branch_id ASC, c.numero_turno ASC
            `, [closeoutStart, closeoutEnd]));

            const byStationDay = new Map();
            for (const sh of (pistaShifts || [])) {
                const normBranch = normalizeSaasBranchId(sh.branch_id);
                const empId = branchToEmpId[normBranch] || branchToEmpId[sh.branch_id] || String(sh.branch_id).padStart(3, '0');
                const fecha = formatYMD(sh.fecha);
                const stMeta = OFFICIAL_ESTACIONES.find(s => s.id_empresa === empId);
                const stName = stMeta ? stMeta.titulo : getCleanStationName(empId, `Estación ${empId}`);
                const stStat = ensureStationStat(empId, normBranch, stName);

                const ventaShift = round2(Number(sh.venta_comb || 0) + Number(sh.lubricantes || 0));
                const sumShift = round2(
                    Number(sh.creditos || 0) + Number(sh.cupones || 0) + Number(sh.cheques || 0) +
                    Number(sh.vales || 0) + Number(sh.anticipos_despachados || 0) + Number(sh.trupput || 0) +
                    Number(sh.tarjetas || 0) + Number(sh.remesas || 0) + Number(sh.gastos || 0) +
                    Number(sh.anticipos || 0) + Number(sh.descuentos || 0)
                );
                const difShift = round2(sumShift - ventaShift);

                stStat.turnos_cerrados += 1;
                stStat.venta_pista_usd = round2(stStat.venta_pista_usd + ventaShift);

                const dayKey = `${empId}|${fecha}`;
                if (!byStationDay.has(dayKey)) {
                    byStationDay.set(dayKey, {
                        id_empresa: empId,
                        branch_id: normBranch,
                        estacion: stName,
                        fecha,
                        venta: 0,
                        justificado: 0,
                        remesas: 0,
                        turnos: []
                    });
                }
                const dayAgg = byStationDay.get(dayKey);
                dayAgg.venta = round2(dayAgg.venta + ventaShift);
                dayAgg.justificado = round2(dayAgg.justificado + sumShift);
                dayAgg.remesas = round2(dayAgg.remesas + Number(sh.remesas || 0));
                dayAgg.turnos.push({
                    id: sh.id,
                    turno: Number(sh.turno) || 1,
                    responsable: sh.responsable || 'Sin asignar',
                    venta: ventaShift,
                    diferencia: difShift
                });
            }

            for (const dayAgg of byStationDay.values()) {
                const dif = round2(dayAgg.justificado - dayAgg.venta);
                const stStat = stationStats.get(dayAgg.id_empresa);
                if (Math.abs(dif) >= pistaThreshold) {
                    const sortedTurnos = [...dayAgg.turnos].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
                    const foco = sortedTurnos[0] || null;
                    if (stStat) {
                        stStat.cortes_discrepancias_count += 1;
                        stStat.cortes_dif_acumulada_usd = round2(stStat.cortes_dif_acumulada_usd + dif);
                    }
                    pistaDiscrepancias.push({
                        id_empresa: dayAgg.id_empresa,
                        branch_id: dayAgg.branch_id,
                        estacion: dayAgg.estacion,
                        fecha: dayAgg.fecha,
                        venta_usd: dayAgg.venta,
                        justificado_usd: dayAgg.justificado,
                        remesas_usd: dayAgg.remesas,
                        diferencia: dif,
                        tipo: dif < 0 ? 'faltante' : 'sobrante',
                        foco_turno: foco ? {
                            turno: foco.turno,
                            responsable: foco.responsable,
                            diferencia: foco.diferencia
                        } : null
                    });
                }
            }
        } catch (pistaErr) {
            console.warn('[StationDiscrepancyAudit] Error auditando cierres pista:', pistaErr.message);
        }
    }

    // 3. Auditoría de Cortes de Tienda (SaaS pos_shifts corregido + legado cort_cabecera)
    const tiendaDiscrepancias = [];
    const saasCoveredStoreKeys = new Set();

    if (saas && typeof saas.query === 'function') {
        try {
            const [storeShifts] = await withRetry(() => saas.query(`
                SELECT s.id, s.branch_id, b.nombre AS branch_nombre,
                       DATE_FORMAT(s.shift_date, '%Y-%m-%d') AS fecha,
                       s.shift_number, s.total_sales, s.total_incomes, s.card_sales, s.total_tarjetas,
                       s.transfer_sales, s.other_sales, s.total_puntos, s.total_remesas, s.total_expenses,
                       s.opening_balance, s.expected_cash, s.actual_cash, s.difference,
                       COALESCE(sel.nombre, u.nombre) AS seller_nombre
                FROM pos_shifts s
                JOIN branches b ON s.branch_id = b.id
                JOIN points_of_sale p ON s.pos_id = p.id
                LEFT JOIN sellers sel ON s.seller_id = sel.id
                LEFT JOIN users u ON s.seller_id = u.id
                WHERE s.status = 'closed'
                  AND DATE(s.shift_date) BETWEEN ? AND ?
                  AND (p.nombre LIKE '%Tienda%' OR p.nombre LIKE '%Super%')
                ORDER BY s.shift_date DESC, s.branch_id ASC
            `, [closeoutStart, closeoutEnd]));

            const byStoreDay = new Map();
            for (const sh of (storeShifts || [])) {
                const empId = branchToEmpId[sh.branch_id] || String(sh.branch_id).padStart(3, '0');
                const fecha = formatYMD(sh.fecha);
                const key = `${empId}|${fecha}`;
                saasCoveredStoreKeys.add(key);

                if (!byStoreDay.has(key)) {
                    byStoreDay.set(key, {
                        id_empresa: empId,
                        branch_id: sh.branch_id,
                        tienda: getCleanTiendaName(empId, sh.branch_nombre),
                        fecha,
                        venta: 0,
                        remesado: 0,
                        gastos: 0,
                        dif: 0,
                        sellers: new Set(),
                        fuente: 'db_sistema_saas'
                    });
                }
                const agg = byStoreDay.get(key);
                const metrics = computeSaasStoreShiftMetrics(sh);
                agg.venta = round2(agg.venta + metrics.venta);
                agg.remesado = round2(agg.remesado + metrics.remesado);
                agg.gastos = round2(agg.gastos + metrics.gastos);
                agg.dif = round2(agg.dif + metrics.dif);
                if (sh.seller_nombre) agg.sellers.add(sh.seller_nombre);
            }

            for (const agg of byStoreDay.values()) {
                if (Math.abs(agg.dif) >= tiendaThreshold) {
                    tiendaDiscrepancias.push({
                        id_empresa: agg.id_empresa,
                        tienda: agg.tienda,
                        fecha: agg.fecha,
                        venta_usd: agg.venta,
                        remesado_usd: agg.remesado,
                        gastos_usd: agg.gastos,
                        diferencia: agg.dif,
                        tipo: agg.dif < 0 ? 'faltante' : 'sobrante',
                        responsable: Array.from(agg.sellers).join(', ') || 'Cajero Turno',
                        fuente: agg.fuente
                    });
                }
            }
        } catch (storeErr) {
            console.warn('[StationDiscrepancyAudit] Error auditando turnos de tienda SaaS:', storeErr.message);
        }
    }

    if (rrs && typeof rrs.query === 'function') {
        try {
            const [legacyCortes] = await withRetry(() => rrs.query(`
                SELECT a.id_empresa, b.titulo AS tienda_nombre,
                       DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha,
                       a.responsable, a.tot_ventas AS venta, a.tot_remesado AS remesado,
                       a.tot_gastos AS gastos, a.diferencia AS dif
                FROM cort_cabecera a
                LEFT JOIN web_consolidado b ON a.id_empresa = b.id_empresa AND b.grupo = 'TIENDA'
                WHERE a.fecha BETWEEN ? AND ?
                  AND a.id_empresa NOT IN ('004', '022')
                ORDER BY a.fecha DESC, a.id_empresa ASC
            `, [closeoutStart, closeoutEnd]));

            const byLegacyDay = new Map();
            for (const lc of (legacyCortes || [])) {
                const empId = String(lc.id_empresa);
                const fecha = formatYMD(lc.fecha);
                const key = `${empId}|${fecha}`;
                if (saasCoveredStoreKeys.has(key)) continue;

                if (!byLegacyDay.has(key)) {
                    byLegacyDay.set(key, {
                        id_empresa: empId,
                        tienda: getCleanTiendaName(empId, lc.tienda_nombre),
                        fecha,
                        venta: 0,
                        remesado: 0,
                        gastos: 0,
                        dif: 0,
                        responsables: new Set(),
                        fuente: 'db_system_rrs'
                    });
                }
                const agg = byLegacyDay.get(key);
                agg.venta = round2(agg.venta + Number(lc.venta || 0));
                agg.remesado = round2(agg.remesado + Number(lc.remesado || 0));
                agg.gastos = round2(agg.gastos + Number(lc.gastos || 0));
                agg.dif = round2(agg.dif + Number(lc.dif || 0));
                if (lc.responsable) agg.responsables.add(String(lc.responsable).trim());
            }

            for (const agg of byLegacyDay.values()) {
                if (Math.abs(agg.dif) >= tiendaThreshold) {
                    tiendaDiscrepancias.push({
                        id_empresa: agg.id_empresa,
                        tienda: agg.tienda,
                        fecha: agg.fecha,
                        venta_usd: agg.venta,
                        remesado_usd: agg.remesado,
                        gastos_usd: agg.gastos,
                        diferencia: agg.dif,
                        tipo: agg.dif < 0 ? 'faltante' : 'sobrante',
                        responsable: Array.from(agg.responsables).join(', ') || 'Cajero',
                        fuente: agg.fuente
                    });
                }
            }
        } catch (legErr) {
            console.warn('[StationDiscrepancyAudit] Error auditando cort_cabecera legado:', legErr.message);
        }
    }

    // 4. Conciliación Remesas Reportadas vs Envíos (Pista y Tienda) vs Depósitos Bancarios
    const deliveryMismatches = [];
    const remesasSinEntregar48h = [];
    const notasProceso = [];
    const mergedMigrationPairs = [];

    if (saas && typeof saas.query === 'function') {
        try {
            // 4A. Pista deliveries (gas_station_remesa_deliveries)
            const [pistaDelivs] = await withRetry(() => saas.query(`
                SELECT d.id, d.branch_id, b.nombre AS branch_name,
                       DATE_FORMAT(d.fecha, '%Y-%m-%d') AS fecha,
                       d.responsable, d.referencia, d.comentario,
                       ROUND(COALESCE((SELECT SUM(r.monto) FROM gas_station_closeout_remesas r WHERE r.entrega_id = d.id), 0), 2) AS linked_rem,
                       ROUND(COALESCE((SELECT SUM(e.monto) FROM gas_station_delivery_remesas_extra e WHERE e.delivery_id = d.id), 0), 2) AS extra_rem
                FROM gas_station_remesa_deliveries d
                LEFT JOIN branches b ON b.id = d.branch_id
                WHERE d.fecha BETWEEN ? AND ?
                ORDER BY d.id DESC
            `, [remesaStart, remesaEnd]));

            const provisionalPistaChecks = (pistaDelivs || []).map(d => {
                const normBranch = normalizeSaasBranchId(d.branch_id);
                const empId = branchToEmpId[normBranch] || branchToEmpId[d.branch_id] || String(d.branch_id).padStart(3, '0');
                const stMeta = OFFICIAL_ESTACIONES.find(s => s.id_empresa === empId);
                const stName = stMeta ? stMeta.titulo : getCleanStationName(empId, d.branch_name);
                const fecha = formatYMD(d.fecha);

                const linked = round2(Number(d.linked_rem || 0));
                const extra = round2(Number(d.extra_rem || 0));
                const expectedDelivery = round2(linked + extra);
                const declared = extractDeclaredTotalFromComment(d.comentario);
                const bank = bankByG.get(Number(d.id)) || { mainSum: 0, extraSum: 0, totalSum: 0, rows: 0 };
                const bankTotal = round2(bank.totalSum);

                const stStat = stationStats.get(empId);
                if (stStat) {
                    stStat.envios_pista_count += 1;
                    stStat.envios_pista_linked_usd = round2(stStat.envios_pista_linked_usd + expectedDelivery);
                    stStat.banco_saas_g_usd = round2(stStat.banco_saas_g_usd + bankTotal);
                }

                return {
                    kind: 'G',
                    id: Number(d.id),
                    empId,
                    normBranch,
                    estacion: stName,
                    fecha,
                    responsable: d.responsable || '-',
                    referencia: d.referencia || '-',
                    linked_usd: linked,
                    extra_usd: extra,
                    expected_usd: expectedDelivery,
                    declared_usd: declared,
                    bank_usd: bankTotal,
                    bank_rows: bank.rows,
                    diff_bank_vs_linked: round2(bankTotal - expectedDelivery),
                    diff_declared_vs_linked: declared !== null ? round2(declared - expectedDelivery) : null,
                    diff_bank_vs_declared: declared !== null ? round2(bankTotal - declared) : null
                };
            });

            // Compensación exacta de hermanos de migración (ej. Shell Poliedro branch 12 <-> 7 en 2026-11-12)
            const skipIds = new Set();
            for (let i = 0; i < provisionalPistaChecks.length; i++) {
                const a = provisionalPistaChecks[i];
                if (skipIds.has(a.id) || Math.abs(a.diff_bank_vs_linked) < deliveryDiffThreshold) continue;
                for (let j = i + 1; j < provisionalPistaChecks.length; j++) {
                    const b = provisionalPistaChecks[j];
                    if (skipIds.has(b.id) || a.normBranch !== b.normBranch || a.fecha !== b.fecha) continue;
                    if (Math.abs(a.diff_bank_vs_linked + b.diff_bank_vs_linked) <= 1.0 && Math.abs(b.diff_bank_vs_linked) >= deliveryDiffThreshold) {
                        skipIds.add(a.id);
                        skipIds.add(b.id);
                        mergedMigrationPairs.push(`Envíos G${Math.min(a.id, b.id)} + G${Math.max(a.id, b.id)} (${a.estacion} ${a.fecha}) consolidados en una sola boleta bancaria ($${round2(a.bank_usd + b.bank_usd).toFixed(2)}).`);
                        break;
                    }
                }
            }

            for (const c of provisionalPistaChecks) {
                if (skipIds.has(c.id)) continue;
                const missingInBank = c.bank_rows === 0 && c.fecha <= cutoff24h && c.expected_usd >= deliveryDiffThreshold;
                const hasBankMismatch = c.bank_rows > 0 && Math.abs(c.diff_bank_vs_linked) >= deliveryDiffThreshold;
                const hasDeclaredMismatch = c.diff_declared_vs_linked !== null && Math.abs(c.diff_declared_vs_linked) >= deliveryDiffThreshold;

                if (missingInBank || hasBankMismatch || hasDeclaredMismatch) {
                    const stStat = stationStats.get(c.empId);
                    if (stStat) stStat.delivery_mismatches_count += 1;

                    let motivo = 'Diferencia entre envío y banco';
                    if (missingInBank) motivo = 'Envío registrado en SaaS sin depósito en movimientos bancarios (>24h)';
                    else if (hasDeclaredMismatch && hasBankMismatch) motivo = 'Envío difiere contra boleta bancaria y contra comentario declarado';
                    else if (hasBankMismatch) motivo = 'Depósito en banco difiere contra remesas vinculadas al envío';
                    else if (hasDeclaredMismatch) motivo = 'Total declarado en comentario difiere contra remesas vinculadas';

                    deliveryMismatches.push({
                        tipo_envio: 'pista',
                        llave_saas: `G${c.id}`,
                        id: c.id,
                        id_empresa: c.empId,
                        estacion: c.estacion,
                        fecha: c.fecha,
                        responsable: c.responsable,
                        referencia: c.referencia,
                        remesas_vinculadas_usd: c.linked_usd,
                        extras_usd: c.extra_usd,
                        esperado_envio_usd: c.expected_usd,
                        declarado_comentario_usd: c.declared_usd,
                        depositado_banco_usd: c.bank_usd,
                        diferencia_banco_vs_sistema: c.diff_bank_vs_linked,
                        diferencia_declarado_vs_sistema: c.diff_declared_vs_linked,
                        diferencia_banco_vs_declarado: c.diff_bank_vs_declared,
                        motivo
                    });
                }
            }

            // 4B. Store deliveries (sales_remesa_deliveries)
            const [storeDelivs] = await withRetry(() => saas.query(`
                SELECT d.id, d.branch_id, b.nombre AS branch_name,
                       DATE_FORMAT(d.fecha, '%Y-%m-%d') AS fecha,
                       d.responsable, d.referencia,
                       ROUND(COALESCE(d.monto_entregado, 0), 2) AS monto_entregado,
                       ROUND(COALESCE(d.diferencia, 0), 2) AS db_dif,
                       ROUND(COALESCE((SELECT SUM(r.amount) FROM pos_shift_remesas r WHERE r.entrega_id = d.id), 0), 2) AS linked_rem
                FROM sales_remesa_deliveries d
                LEFT JOIN branches b ON b.id = d.branch_id
                WHERE d.fecha BETWEEN ? AND ?
                ORDER BY d.id DESC
            `, [remesaStart, remesaEnd]));

            const unlinkedStoreByBranch = new Map();
            for (const sd of (storeDelivs || [])) {
                const empId = branchToEmpId[sd.branch_id] || String(sd.branch_id).padStart(3, '0');
                const storeName = getCleanTiendaName(empId, sd.branch_name);
                const fecha = formatYMD(sd.fecha);
                const entregado = round2(sd.monto_entregado);
                const linkedRem = round2(sd.linked_rem);
                const bank = bankByS.get(Number(sd.id)) || { totalSum: 0, rows: 0 };
                const bankTotal = round2(bank.totalSum);
                const diffBankVsEntr = round2(bankTotal - entregado);

                const missingInBank = bank.rows === 0 && fecha <= cutoff24h && entregado >= deliveryDiffThreshold;
                const bankMismatch = bank.rows > 0 && Math.abs(diffBankVsEntr) >= deliveryDiffThreshold;
                const linkedMismatch = linkedRem > 0 && Math.abs(entregado - linkedRem) >= deliveryDiffThreshold;

                if (missingInBank || bankMismatch || linkedMismatch) {
                    deliveryMismatches.push({
                        tipo_envio: 'tienda',
                        llave_saas: `S${sd.id}`,
                        id: Number(sd.id),
                        id_empresa: empId,
                        estacion: storeName,
                        fecha,
                        responsable: sd.responsable || '-',
                        referencia: sd.referencia || '-',
                        remesas_vinculadas_usd: linkedRem,
                        extras_usd: 0,
                        esperado_envio_usd: entregado,
                        declarado_comentario_usd: null,
                        depositado_banco_usd: bankTotal,
                        diferencia_banco_vs_sistema: bankMismatch || missingInBank ? diffBankVsEntr : round2(entregado - linkedRem),
                        diferencia_declarado_vs_sistema: null,
                        diferencia_banco_vs_declarado: null,
                        motivo: missingInBank
                            ? 'Envío de tienda sin depósito reflejado en banco (>24h)'
                            : (bankMismatch ? 'Depósito en banco difiere contra monto entregado en tienda' : 'Monto entregado difiere contra remesas POS vinculadas')
                    });
                } else if (linkedRem === 0 && bank.rows > 0 && Math.abs(diffBankVsEntr) < deliveryDiffThreshold) {
                    const prev = unlinkedStoreByBranch.get(storeName) || { cnt: 0, sum: 0 };
                    prev.cnt += 1;
                    prev.sum = round2(prev.sum + entregado);
                    unlinkedStoreByBranch.set(storeName, prev);
                }
            }
            for (const [stName, info] of unlinkedStoreByBranch.entries()) {
                notasProceso.push(`${stName}: ${info.cnt} envío(s) por ${moneyFmt(info.sum)} depositados al centavo en banco pero sin vincular turnos pos_shift_remesas.`);
            }

            // 4C. Remesas reportadas vs entregadas vs sin entregar >48h
            const [remSummaryRows] = await withRetry(() => saas.query(`
                SELECT
                    c.branch_id,
                    SUM(r.monto) AS rem_reportadas,
                    SUM(CASE WHEN COALESCE(r.entregada, 0) = 1 OR r.entrega_id IS NOT NULL THEN r.monto ELSE 0 END) AS rem_entregadas,
                    SUM(CASE WHEN COALESCE(r.entregada, 0) = 0 AND r.entrega_id IS NULL THEN r.monto ELSE 0 END) AS rem_pendientes_all,
                    SUM(CASE WHEN c.fecha_turno <= ? AND COALESCE(r.entregada, 0) = 0 AND r.entrega_id IS NULL THEN r.monto ELSE 0 END) AS rem_pendientes_48h,
                    SUM(CASE WHEN c.fecha_turno <= ? AND COALESCE(r.entregada, 0) = 0 AND r.entrega_id IS NULL THEN 1 ELSE 0 END) AS cnt_pendientes_48h,
                    MIN(CASE WHEN c.fecha_turno <= ? AND COALESCE(r.entregada, 0) = 0 AND r.entrega_id IS NULL THEN c.fecha_turno ELSE NULL END) AS min_fecha_48h,
                    MAX(CASE WHEN c.fecha_turno <= ? AND COALESCE(r.entregada, 0) = 0 AND r.entrega_id IS NULL THEN c.fecha_turno ELSE NULL END) AS max_fecha_48h
                FROM gas_station_closeout_remesas r
                JOIN gas_station_closeouts c ON c.id = r.closeout_id
                WHERE c.estado = 'cerrado'
                  AND c.fecha_turno BETWEEN ? AND ?
                GROUP BY c.branch_id
            `, [cutoff48h, cutoff48h, cutoff48h, cutoff48h, remesaStart, remesaEnd]));

            const byNormEmpRem = new Map();
            for (const row of (remSummaryRows || [])) {
                const normBranch = normalizeSaasBranchId(row.branch_id);
                const empId = branchToEmpId[normBranch] || branchToEmpId[row.branch_id] || String(row.branch_id).padStart(3, '0');
                const prev = byNormEmpRem.get(empId) || {
                    rem_reportadas: 0,
                    rem_entregadas: 0,
                    rem_pendientes_all: 0,
                    rem_pendientes_48h: 0,
                    cnt_pendientes_48h: 0,
                    min_fecha_48h: null,
                    max_fecha_48h: null
                };
                prev.rem_reportadas = round2(prev.rem_reportadas + Number(row.rem_reportadas || 0));
                prev.rem_entregadas = round2(prev.rem_entregadas + Number(row.rem_entregadas || 0));
                prev.rem_pendientes_all = round2(prev.rem_pendientes_all + Number(row.rem_pendientes_all || 0));
                prev.rem_pendientes_48h = round2(prev.rem_pendientes_48h + Number(row.rem_pendientes_48h || 0));
                prev.cnt_pendientes_48h += Number(row.cnt_pendientes_48h || 0);
                const minF = formatYMD(row.min_fecha_48h);
                const maxF = formatYMD(row.max_fecha_48h);
                if (minF && (!prev.min_fecha_48h || minF < prev.min_fecha_48h)) prev.min_fecha_48h = minF;
                if (maxF && (!prev.max_fecha_48h || maxF > prev.max_fecha_48h)) prev.max_fecha_48h = maxF;
                byNormEmpRem.set(empId, prev);
            }

            for (const [empId, remAgg] of byNormEmpRem.entries()) {
                const stMeta = OFFICIAL_ESTACIONES.find(s => s.id_empresa === empId);
                const stName = stMeta ? stMeta.titulo : `Estación ${empId}`;
                const stStat = ensureStationStat(empId, stMeta?.branch_id || null, stName);

                stStat.remesas_reportadas_usd = remAgg.rem_reportadas;
                stStat.remesas_entregadas_saas_usd = remAgg.rem_entregadas;
                stStat.remesas_pendientes_saas_usd = remAgg.rem_pendientes_all;
                stStat.remesas_pendientes_48h_usd = remAgg.rem_pendientes_48h;

                // Respaldo bancario alternativo: depósitos RWQ + Remesa Cliente del período
                const respaldoAlt = stStat.banco_alt_rwq_clientes_usd || 0;
                const netoSinRespaldo = round2(Math.max(0, remAgg.rem_pendientes_48h - respaldoAlt));
                stStat.neto_sin_respaldo_48h_usd = netoSinRespaldo;

                if (netoSinRespaldo >= undeliveredMinUsd) {
                    remesasSinEntregar48h.push({
                        id_empresa: empId,
                        estacion: stName,
                        partidas_count: remAgg.cnt_pendientes_48h,
                        remesas_pendientes_saas_usd: remAgg.rem_pendientes_48h,
                        respaldo_alt_banco_usd: respaldoAlt,
                        neto_sin_respaldo_usd: netoSinRespaldo,
                        desde_fecha: remAgg.min_fecha_48h || remesaStart,
                        hasta_fecha: remAgg.max_fecha_48h || cutoff48h
                    });
                } else if (remAgg.rem_pendientes_48h >= undeliveredMinUsd && respaldoAlt > 0) {
                    notasProceso.push(
                        `${stName}: ${moneyFmt(remAgg.rem_pendientes_48h)} en remesas de cierre sin entrega_id SaaS (>48h), respaldados en banco por ${moneyFmt(respaldoAlt)} vía RWQ/transferencia directa de clientes.`
                    );
                }
            }
        } catch (remErr) {
            console.warn('[StationDiscrepancyAudit] Error auditando entregas y remesas:', remErr.message);
        }
    }

    for (const msg of mergedMigrationPairs) {
        notasProceso.push(msg);
    }

    const resumenPorEstacion = Array.from(stationStats.values()).map(s => {
        const hasIssues = s.cortes_discrepancias_count > 0 || s.delivery_mismatches_count > 0 || s.neto_sin_respaldo_48h_usd >= undeliveredMinUsd;
        return {
            ...s,
            estado: hasIssues ? 'ATENCIÓN' : (s.remesas_pendientes_48h_usd >= undeliveredMinUsd ? 'OBSERVACIÓN_PROCESO' : 'CUADRADO')
        };
    });

    const totalAlertCount =
        pistaDiscrepancias.length +
        tiendaDiscrepancias.length +
        deliveryMismatches.length +
        remesasSinEntregar48h.length;

    const hasCritical =
        pistaDiscrepancias.some(d => Math.abs(d.diferencia) >= 100) ||
        tiendaDiscrepancias.some(d => Math.abs(d.diferencia) >= 50) ||
        deliveryMismatches.some(d => Math.abs(d.diferencia_banco_vs_sistema) >= 100) ||
        remesasSinEntregar48h.some(r => r.neto_sin_respaldo_usd >= 500);

    return {
        periodo: {
            remesas_desde: remesaStart,
            remesas_hasta: remesaEnd,
            cortes_desde: closeoutStart,
            cortes_hasta: closeoutEnd,
            cutoff_48h: cutoff48h,
            dias_evaluados: auditDays
        },
        resumen: {
            total_alertas: totalAlertCount,
            cortes_pista_descuadre_count: pistaDiscrepancias.length,
            cortes_tienda_descuadre_count: tiendaDiscrepancias.length,
            envios_remesa_diferencia_count: deliveryMismatches.length,
            remesas_sin_respaldo_48h_count: remesasSinEntregar48h.length,
            estatus_general: totalAlertCount > 0 ? 'CON DIFERENCIAS' : 'CUADRADO'
        },
        pista_discrepancias: pistaDiscrepancias,
        tienda_discrepancias: tiendaDiscrepancias,
        delivery_mismatches: deliveryMismatches,
        remesas_sin_entregar_48h: remesasSinEntregar48h,
        resumen_por_estacion: resumenPorEstacion,
        notas_proceso: notasProceso,
        has_alerts: totalAlertCount > 0,
        severity: totalAlertCount === 0 ? 'ok' : (hasCritical ? 'critico' : 'alerta')
    };
}

/**
 * Construye huellas deterministas de cada discrepancia para deduplicar notificaciones en MySQL.
 */
function buildAlertEntriesFromAudit(auditData) {
    const entries = [];
    const cutoff = auditData?.periodo?.cutoff_48h || getDateStr(-2);

    for (const p of (auditData?.pista_discrepancias || [])) {
        const dif = round2(p.diferencia);
        entries.push({
            fingerprint: `pista:${p.id_empresa}:${p.fecha}:${dif.toFixed(2)}`.slice(0, 155),
            alertType: 'corte_pista',
            stationName: p.estacion,
            auditDate: p.fecha,
            amountUsd: dif,
            severity: Math.abs(dif) >= 100 ? 'critico' : 'alerta',
            summary: `${p.estacion} (${p.fecha}): ${dif < 0 ? 'Faltante' : 'Sobrante'} en cierre pista por ${moneyFmt(dif)}`,
            raw: p
        });
    }

    for (const t of (auditData?.tienda_discrepancias || [])) {
        const dif = round2(t.diferencia);
        entries.push({
            fingerprint: `tienda:${t.id_empresa}:${t.fecha}:${dif.toFixed(2)}`.slice(0, 155),
            alertType: 'corte_tienda',
            stationName: t.tienda,
            auditDate: t.fecha,
            amountUsd: dif,
            severity: Math.abs(dif) >= 50 ? 'critico' : 'alerta',
            summary: `${t.tienda} (${t.fecha}): ${dif < 0 ? 'Faltante' : 'Sobrante'} en corte tienda por ${moneyFmt(dif)}`,
            raw: t
        });
    }

    for (const d of (auditData?.delivery_mismatches || [])) {
        const diffBank = round2(d.diferencia_banco_vs_sistema);
        const diffDecl = d.diferencia_declarado_vs_sistema !== null && d.diferencia_declarado_vs_sistema !== undefined
            ? round2(d.diferencia_declarado_vs_sistema).toFixed(2)
            : 'na';
        entries.push({
            fingerprint: `delivery:${d.llave_saas}:${d.fecha}:${diffBank.toFixed(2)}:${diffDecl}`.slice(0, 155),
            alertType: 'remesa_envio',
            stationName: d.estacion,
            auditDate: d.fecha,
            amountUsd: diffBank,
            severity: Math.abs(diffBank) >= 100 ? 'critico' : 'alerta',
            summary: `${d.estacion} (${d.llave_saas} ${d.fecha}): Banco ${moneyFmt(d.depositado_banco_usd)} vs Sistema ${moneyFmt(d.esperado_envio_usd)} (Dif ${moneyFmt(diffBank)})`,
            raw: d
        });
    }

    for (const u of (auditData?.remesas_sin_entregar_48h || [])) {
        const net = round2(u.neto_sin_respaldo_usd);
        entries.push({
            fingerprint: `undeliv:${u.id_empresa}:${cutoff}:${Math.round(net)}`.slice(0, 155),
            alertType: 'remesa_48h',
            stationName: u.estacion,
            auditDate: cutoff,
            amountUsd: -net,
            severity: net >= 500 ? 'critico' : 'alerta',
            summary: `${u.estacion}: ${moneyFmt(net)} en remesas de cierre (>48h) sin entrega ni respaldo bancario`,
            raw: u
        });
    }

    return entries;
}

/**
 * Formatea reporte ejecutivo HTML para Telegram de auditoría cortes ↔ remesas enviadas ↔ banco.
 */
function formatStationDiscrepancyAuditMessage(auditData, { isProactiveAlert = false } = {}) {
    const res = auditData?.resumen || {};
    const per = auditData?.periodo || {};
    const headerTitle = isProactiveAlert
        ? '🚨 <b>ALERTA DE CORTES Y REMESAS ENVIADAS</b>'
        : '🔍 <b>AUDITORÍA DE CORTES Y REMESAS ENVIADAS</b>';

    let msg = `${headerTitle}\n`;
    msg += `📅 <b>Ventana Remesas/Envíos:</b> ${toDisplayDate(per.remesas_desde)} – ${toDisplayDate(per.remesas_hasta)}\n`;
    msg += `⛽ <b>Ventana Cortes:</b> ${toDisplayDate(per.cortes_desde)} – ${toDisplayDate(per.cortes_hasta)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (!auditData?.has_alerts) {
        msg += `🟢 <b>RESULTADO: TODO CUADRADO</b>\n`;
        msg += `• Sin descuadres relevantes en cierres de pista ni cortes de tienda.\n`;
        msg += `• Los envíos de remesas coinciden con los depósitos reflejados en bancos.\n`;
    } else {
        msg += `⚠️ <b>Se detectaron ${res.total_alertas || 0} discrepancia(s) reales:</b>\n\n`;

        if ((auditData.pista_discrepancias || []).length > 0) {
            msg += `⛽ <b>Diferencias en Cierres de Pista (${auditData.pista_discrepancias.length}):</b>\n`;
            auditData.pista_discrepancias.slice(0, 6).forEach(p => {
                const icon = p.diferencia < 0 ? '🔴 Faltante' : '🟡 Sobrante';
                const focoTxt = p.foco_turno ? ` | T${p.foco_turno.turno}: ${escapeHtml(p.foco_turno.responsable)}` : '';
                msg += `• <b>${escapeHtml(p.estacion)}</b> (${toDisplayDate(p.fecha)}): ${icon} <code>${moneyFmt(p.diferencia)}</code>${focoTxt}\n`;
            });
            msg += `\n`;
        }

        if ((auditData.tienda_discrepancias || []).length > 0) {
            msg += `🛒 <b>Diferencias en Cortes de Tienda (${auditData.tienda_discrepancias.length}):</b>\n`;
            auditData.tienda_discrepancias.slice(0, 6).forEach(t => {
                const icon = t.diferencia < 0 ? '🔴 Faltante' : '🟡 Sobrante';
                msg += `• <b>${escapeHtml(t.tienda)}</b> (${toDisplayDate(t.fecha)}): ${icon} <code>${moneyFmt(t.diferencia)}</code> (${escapeHtml(t.responsable || '-')})\n`;
            });
            msg += `\n`;
        }

        if ((auditData.delivery_mismatches || []).length > 0) {
            msg += `🏦 <b>Diferencias Dinero Enviado vs Banco / Cortes (${auditData.delivery_mismatches.length}):</b>\n`;
            auditData.delivery_mismatches.slice(0, 6).forEach(d => {
                msg += `• <b>${escapeHtml(d.estacion)}</b> · <code>${escapeHtml(d.llave_saas)}</code> (${toDisplayDate(d.fecha)})\n`;
                msg += `   └ Vinculado: <code>${moneyFmt(d.esperado_envio_usd)}</code> | Banco: <code>${moneyFmt(d.depositado_banco_usd)}</code> | Dif: <b>${moneyFmt(d.diferencia_banco_vs_sistema)}</b>\n`;
                if (d.declarado_comentario_usd !== null && d.declarado_comentario_usd !== undefined) {
                    msg += `   └ Boleta declarada: <code>${moneyFmt(d.declarado_comentario_usd)}</code> (Resp: ${escapeHtml(d.responsable || '-')})\n`;
                }
            });
            msg += `\n`;
        }

        if ((auditData.remesas_sin_entregar_48h || []).length > 0) {
            msg += `⏳ <b>Remesas de Cierre &gt;48h sin Entregar ni Respaldo (${auditData.remesas_sin_entregar_48h.length}):</b>\n`;
            auditData.remesas_sin_entregar_48h.slice(0, 5).forEach(u => {
                msg += `• <b>${escapeHtml(u.estacion)}</b>: <code>${moneyFmt(u.neto_sin_respaldo_usd)}</code> netos (${u.partidas_count} part., ${toDisplayDate(u.desde_fecha)}–${toDisplayDate(u.hasta_fecha)})\n`;
            });
            msg += `\n`;
        }
    }

    if ((auditData.notas_proceso || []).length > 0) {
        msg += `ℹ️ <b>Notas de conciliación operativa:</b>\n`;
        auditData.notas_proceso.slice(0, 4).forEach(n => {
            msg += `• ${escapeHtml(n)}\n`;
        });
        msg += `\n`;
    }

    msg += `<i>SIPE Admin • Auditoría Cortes ↔ Remesas ↔ Bancos</i>`;
    return msg;
}

function getStationAuditInlineMarkup() {
    return {
        inline_keyboard: [
            [
                { text: '🔄 Re-auditar Cortes y Remesas', callback_data: 'tg_audit_cortes:refresh' },
                { text: '🛡️ Centinela', callback_data: 'tg_sent:refresh' }
            ]
        ]
    };
}

/**
 * Obtiene destinatarios autorizados (Telegram + usuarios SIPE Admin in-app) para alertas de cierres y diferencias.
 */
async function fetchStationAuditRecipients(db) {
    if (!db || typeof db.query !== 'function') {
        return { telegramUsers: [], inAppUsers: [] };
    }

    const permsRequired = [
        '/dashboard/consultas/estaciones/resumen-cierre',
        '/dashboard/consultas/estaciones/diferencias-combustible',
        '/dashboard/consultas/estaciones/ventas',
        'view_direccion_estrategica'
    ];

    const hasPerm = (roleId, roleName, perms = []) => {
        if (Number(roleId) === 1 || roleName === 'Administrator' || roleName === 'Super Administrator') return true;
        return permsRequired.some(reqP => perms.includes(reqP));
    };

    const permsByRole = new Map();
    try {
        const [rpRows] = await db.query(
            `SELECT rp.role_id, p.name
             FROM role_permissions rp
             INNER JOIN permissions p ON rp.permission_id = p.id`
        );
        for (const r of (rpRows || [])) {
            const rid = Number(r.role_id);
            if (!permsByRole.has(rid)) permsByRole.set(rid, []);
            if (r.name) permsByRole.get(rid).push(String(r.name).trim());
        }
    } catch (_) {
        // Opcional en mocks
    }

    let telegramUsers = [];
    try {
        const [tgRows] = await db.query(`
            SELECT tu.*, u.status AS sipe_status, u.role_id AS sipe_role_id, r.name AS sipe_role_name,
                   GROUP_CONCAT(p.name) AS sipe_permissions
            FROM telegram_usuarios tu
            LEFT JOIN users u ON tu.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE tu.activo = 1
            GROUP BY tu.id
        `);

        telegramUsers = (tgRows || []).filter(u => {
            if (!u.telegram_user_id) return false;
            if (u.user_id && u.sipe_status === 'inactive') return false;
            if (Number(u.permiso_alertas) === 1) return true;
            const rolePerms = permsByRole.get(Number(u.sipe_role_id))
                || String(u.sipe_permissions || '').split(',').map(s => s.trim()).filter(Boolean);
            return hasPerm(u.sipe_role_id, u.sipe_role_name, rolePerms);
        });
    } catch (tgErr) {
        console.warn('[StationDiscrepancyAudit] Error leyendo telegram_usuarios:', tgErr.message);
    }

    let inAppUsers = [];
    try {
        const [sipeUsers] = await db.query(`
            SELECT u.id, u.nombre AS name, u.username, u.role_id, r.name AS role_name
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE COALESCE(u.status, 'active') = 'active'
        `);
        inAppUsers = (sipeUsers || []).filter(u => {
            const rolePerms = permsByRole.get(Number(u.role_id)) || [];
            return hasPerm(u.role_id, u.role_name, rolePerms);
        });
    } catch (_) {
        // Opcional en mocks
    }

    return { telegramUsers, inAppUsers };
}

/**
 * Ejecuta evaluación proactiva y notifica por Telegram + SIPE Admin in-app solo hallazgos nuevos (deduplicados en MySQL).
 */
async function runStationDiscrepancyAlertCheck({
    db = null,
    accountingDb = null,
    externalDb = null,
    io = null,
    sendTelegramFn = sendTelegramMessage,
    dias = 7,
    closeoutDays = 3,
    targetDate = null,
    pistaThreshold = 5,
    tiendaThreshold = 5,
    deliveryDiffThreshold = 5,
    undeliveredMinUsd = 50,
    todayOverride = null,
    auditOverride = null
} = {}) {
    const activeDb = db || getDb();
    if (!activeDb) return { dispatched: false, reason: 'db_unavailable' };

    await ensureDiscrepancyAlertSchema(activeDb);

    const auditData = auditOverride || await auditStationCloseoutsAndRemesas({
        dias,
        closeoutDays,
        targetDate,
        pistaThreshold,
        tiendaThreshold,
        deliveryDiffThreshold,
        undeliveredMinUsd,
        accountingDb,
        externalDb,
        todayOverride
    });

    if (!auditData.has_alerts) {
        return {
            dispatched: false,
            reason: 'no_alerts',
            newFindingsCount: 0,
            telegramSentCount: 0,
            inAppSentCount: 0,
            auditData
        };
    }

    const allEntries = buildAlertEntriesFromAudit(auditData);
    const newEntries = [];

    for (const entry of allEntries) {
        const [insRes] = await activeDb.query(
            `INSERT IGNORE INTO station_discrepancy_alerts_log
                (alert_fingerprint, alert_type, station_name, audit_date, amount_usd, severity, summary)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.fingerprint,
                entry.alertType,
                String(entry.stationName || '').slice(0, 115),
                entry.auditDate || null,
                entry.amountUsd,
                entry.severity,
                String(entry.summary || '').slice(0, 490)
            ]
        );
        if (insRes && Number(insRes.affectedRows || 0) > 0) {
            newEntries.push(entry);
        }
    }

    if (newEntries.length === 0) {
        return {
            dispatched: false,
            reason: 'deduplicated',
            newFindingsCount: 0,
            telegramSentCount: 0,
            inAppSentCount: 0,
            auditData
        };
    }

    // Construir subconjunto solo con los hallazgos nuevos para evitar repetir alertas previas en el mensaje
    const filteredAudit = {
        ...auditData,
        resumen: {
            ...auditData.resumen,
            total_alertas: newEntries.length
        },
        pista_discrepancias: newEntries.filter(e => e.alertType === 'corte_pista').map(e => e.raw),
        tienda_discrepancias: newEntries.filter(e => e.alertType === 'corte_tienda').map(e => e.raw),
        delivery_mismatches: newEntries.filter(e => e.alertType === 'remesa_envio').map(e => e.raw),
        remesas_sin_entregar_48h: newEntries.filter(e => e.alertType === 'remesa_48h').map(e => e.raw),
        has_alerts: true
    };

    const { telegramUsers, inAppUsers } = await fetchStationAuditRecipients(activeDb);
    const msgHtml = formatStationDiscrepancyAuditMessage(filteredAudit, { isProactiveAlert: true });
    const markup = getStationAuditInlineMarkup();

    let telegramSentCount = 0;
    for (const u of telegramUsers) {
        try {
            await sendTelegramFn(u.telegram_user_id, msgHtml, markup);
            telegramSentCount += 1;
        } catch (sendErr) {
            console.warn(`[StationDiscrepancyAudit] Error enviando Telegram a ${u.telegram_user_id}:`, sendErr.message);
        }
    }

    const activeIo = io || watcherIo;
    const notifTitle = `🚨 ${newEntries.length} diferencia(s) en cortes o remesas`;
    const notifMessage = newEntries.slice(0, 3).map(e => e.summary).join(' | ').slice(0, 480);
    const notifData = {
        link: '/dashboard/consultas/estaciones/ventas',
        alert_count: newEntries.length,
        fingerprints: newEntries.map(e => e.fingerprint),
        pista_count: filteredAudit.pista_discrepancias.length,
        tienda_count: filteredAudit.tienda_discrepancias.length,
        delivery_count: filteredAudit.delivery_mismatches.length,
        remesas_48h_count: filteredAudit.remesas_sin_entregar_48h.length
    };

    let inAppSentCount = 0;
    for (const user of inAppUsers) {
        try {
            const [nRes] = await activeDb.query(
                `INSERT INTO notifications (user_id, type, title, message, data)
                 VALUES (?, 'station_discrepancy_alert', ?, ?, ?)`,
                [user.id, notifTitle, notifMessage, JSON.stringify(notifData)]
            );
            inAppSentCount += 1;
            if (activeIo && typeof activeIo.to === 'function') {
                activeIo.to(`user_${user.id}`).emit('notification:new', {
                    id: nRes?.insertId || null,
                    user_id: user.id,
                    type: 'station_discrepancy_alert',
                    title: notifTitle,
                    message: notifMessage,
                    data: notifData,
                    is_read: false,
                    created_at: new Date().toISOString()
                });
            }
        } catch (_) {
            // Opcional en entornos sin tabla notifications
        }
    }

    try {
        const fps = newEntries.map(e => e.fingerprint);
        if (fps.length > 0) {
            await activeDb.query(
                `UPDATE station_discrepancy_alerts_log
                 SET telegram_sent_count = ?, inapp_sent_count = ?
                 WHERE alert_fingerprint IN (?)`,
                [telegramSentCount, inAppSentCount, fps]
            );
        }
    } catch (_) {
        // noop
    }

    return {
        dispatched: true,
        newFindingsCount: newEntries.length,
        telegramSentCount,
        inAppSentCount,
        fingerprints: newEntries.map(e => e.fingerprint),
        auditData: filteredAudit
    };
}

/**
 * Inicializa el monitor automático cada 30 minutos para cortes y dinero enviado.
 */
function initStationDiscrepancyWatcher(io = null) {
    watcherIo = io || watcherIo;
    if (process.env.NODE_ENV === 'test') return;
    stopStationDiscrepancyWatcher();

    watcherTask = cron.schedule('*/30 * * * *', () => {
        runStationDiscrepancyAlertCheck({
            io: watcherIo,
            dias: 7,
            closeoutDays: 3,
            pistaThreshold: 5,
            tiendaThreshold: 5,
            deliveryDiffThreshold: 5,
            undeliveredMinUsd: 50
        }).catch(err => {
            console.error('[StationDiscrepancyWatcher] Error en ciclo automático:', err.message);
        });
    }, { timezone: 'America/El_Salvador' });

    console.log('[StationDiscrepancyWatcher] Scheduler activo (cada 30 min America/El_Salvador).');
}

function stopStationDiscrepancyWatcher() {
    if (watcherTask && typeof watcherTask.stop === 'function') {
        try {
            watcherTask.stop();
        } catch (_) {
            // noop
        }
    }
    watcherTask = null;
}

module.exports = {
    ensureDiscrepancyAlertSchema,
    buildMonthLikePatterns,
    extractDeclaredTotalFromComment,
    parseBankDateDmyToIso,
    auditStationCloseoutsAndRemesas,
    buildAlertEntriesFromAudit,
    formatStationDiscrepancyAuditMessage,
    getStationAuditInlineMarkup,
    fetchStationAuditRecipients,
    runStationDiscrepancyAlertCheck,
    initStationDiscrepancyWatcher,
    stopStationDiscrepancyWatcher
};
