const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const withRetry = (...args) => dbModule.withRetry(...args);
const { isAdminUser } = require('../middleware/auth');
const { branchToEmpId, formatYMD } = require('./consultasCatalog');
const { getTanquesAutonomia } = require('./fuelIntelligence');
const { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia } = require('./profitabilityService');
const { getSaldosBancosData } = require('./telegramDataService');
const { moneyFmt, numFmt, toDisplayDate, getDateStr } = require('./telegramTextAndDates');

const resolveStationEmpCode = (rawId) => {
    if (rawId === null || rawId === undefined) return '';
    const str = String(rawId).trim();
    if (branchToEmpId[str]) return branchToEmpId[str];
    if (/^\d+$/.test(str) && str.length < 3) return str.padStart(3, '0');
    return str;
};

const userHasAnyPerm = (user, perms = []) => {
    if (!user) return false;
    if (user.isApiKey || isAdminUser(user)) return true;
    const userPerms = Array.isArray(user.permissions) ? user.permissions : [];
    return perms.some(p => userPerms.includes(p));
};

/**
 * 1. Auditoría Cruzada de Dinero en Tránsito (Pista ↔ Bancos) y Vales sin Facturar (>72h)
 * Solo lectura estricta (SELECT) sobre db_sistema_saas y db_sipe_admin.
 */
const getAuditoriaDineroEnTransito = async ({ dias = 14 } = {}) => {
    const windowDays = Math.min(60, Math.max(5, parseInt(dias, 10) || 14));
    const now = new Date();
    const dFin = now.toISOString().split('T')[0];
    const prev = new Date(now);
    prev.setDate(prev.getDate() - windowDays);
    const dInicio = prev.toISOString().split('T')[0];

    const cutoff48hObj = new Date(now);
    cutoff48hObj.setDate(cutoff48hObj.getDate() - 2);
    const cutoff48hStr = cutoff48hObj.toISOString().split('T')[0];

    // 1.1 Remesas y Tarjetas reportadas en turnos cerrados de pista (db_sistema_saas)
    let pistaRows = [];
    let valesSinFacturar = [];
    try {
        const accountingDb = await getAccountingDb();
        if (accountingDb) {
            const [remRows] = await withRetry(() => accountingDb.query(`
                SELECT
                    c.branch_id as id_empresa,
                    b.nombre as estacion,
                    c.fecha_turno as fecha,
                    COALESCE(SUM(rem.total_remesa), 0.0) as remesas_pista_usd,
                    COALESCE(SUM(pos.total_tarjeta), 0.0) as tarjetas_pista_usd
                FROM gas_station_closeouts c
                JOIN branches b ON c.branch_id = b.id
                LEFT JOIN (
                    SELECT closeout_id, SUM(monto) as total_remesa
                    FROM gas_station_closeout_remesas
                    GROUP BY closeout_id
                ) rem ON c.id = rem.closeout_id
                LEFT JOIN (
                    SELECT closeout_id, SUM(monto) as total_tarjeta
                    FROM gas_station_closeout_tarjetas
                    GROUP BY closeout_id
                ) pos ON c.id = pos.closeout_id
                WHERE c.estado = 'cerrado' AND c.branch_id != 12 AND c.fecha_turno BETWEEN ? AND ?
                GROUP BY id_empresa, estacion, c.fecha_turno
                ORDER BY c.fecha_turno DESC, id_empresa ASC
            `, [dInicio, dFin]));
            pistaRows = remRows || [];

            // 1.2 Vales / créditos de pista con antigüedad >= 3 días (72h)
            try {
                const [valesRows] = await withRetry(() => accountingDb.query(`
                    SELECT
                        c.branch_id as id_empresa,
                        b.nombre as estacion,
                        c.fecha_turno as fecha_turno,
                        COALESCE(cu.nombre, CONCAT('Cliente #', COALESCE(cr.cliente_id, 0))) as cliente,
                        COUNT(*) as cantidad_vales,
                        COALESCE(SUM(cr.monto), 0.0) as monto_usd,
                        DATEDIFF(CURDATE(), c.fecha_turno) as dias_antiguedad
                    FROM gas_station_closeouts c
                    JOIN branches b ON c.branch_id = b.id
                    JOIN gas_station_closeout_creditos cr ON c.id = cr.closeout_id
                    LEFT JOIN customers cu ON cr.cliente_id = cu.id
                    LEFT JOIN sales_headers sh
                        ON sh.customer_id = cr.cliente_id
                       AND sh.branch_id = c.branch_id
                       AND sh.fecha_emision >= c.fecha_turno
                       AND sh.estado = 'emitido'
                    WHERE c.estado = 'cerrado'
                      AND c.branch_id != 12
                      AND c.fecha_turno BETWEEN ? AND DATE_SUB(CURDATE(), INTERVAL 3 DAY)
                      AND sh.id IS NULL
                      AND cr.monto > 0
                    GROUP BY id_empresa, estacion, c.fecha_turno, cliente
                    ORDER BY dias_antiguedad DESC, monto_usd DESC
                    LIMIT 40
                `, [dInicio]));
                valesSinFacturar = (valesRows || []).map(v => ({
                    id_empresa: v.id_empresa,
                    codigo_estacion: resolveStationEmpCode(v.id_empresa),
                    estacion: v.estacion,
                    fecha_turno: formatYMD(v.fecha_turno),
                    cliente: v.cliente,
                    cantidad_vales: Number(v.cantidad_vales || 0),
                    monto_usd: Math.round(Number(v.monto_usd || 0) * 100) / 100,
                    dias_antiguedad: Number(v.dias_antiguedad || 3)
                }));
            } catch (_errVales) {
                valesSinFacturar = [];
            }
        }
    } catch (_errPista) {
        pistaRows = [];
    }

    // 1.3 Abonos bancarios registrados en SIPE Admin (movimientos_bancarios)
    let abonosPorFecha = {};
    let totalAbonosBancosUsd = 0;
    try {
        const db = getDb();
        if (db) {
            const dFinMas3Obj = new Date(now);
            dFinMas3Obj.setDate(dFinMas3Obj.getDate() + 3);
            const dFinMas3 = dFinMas3Obj.toISOString().split('T')[0];

            const [bankMovs] = await db.query(`
                SELECT fecha, COALESCE(SUM(abono), 0.0) as total_abono
                FROM movimientos_bancarios
                WHERE abono > 0 AND fecha BETWEEN ? AND ?
                GROUP BY fecha
            `, [dInicio, dFinMas3]);

            (bankMovs || []).forEach(bm => {
                const fStr = formatYMD(bm.fecha);
                const val = Number(bm.total_abono || 0);
                abonosPorFecha[fStr] = (abonosPorFecha[fStr] || 0) + val;
                totalAbonosBancosUsd += val;
            });
        }
    } catch (_errBank) {
        abonosPorFecha = {};
    }

    // Agrupar total de pista por fecha para evaluar cobertura bancaria T+0 / T+1 / T+2
    const pistaTotalByDate = {};
    pistaRows.forEach(pr => {
        const fStr = formatYMD(pr.fecha);
        const tot = Number(pr.remesas_pista_usd || 0) + Number(pr.tarjetas_pista_usd || 0);
        pistaTotalByDate[fStr] = (pistaTotalByDate[fStr] || 0) + tot;
    });

    const addDaysStr = (isoStr, offset) => {
        const [y, m, d] = String(isoStr).split('-').map(Number);
        if (!y || !m || !d) return isoStr;
        const dt = new Date(Date.UTC(y, m - 1, d + offset));
        return dt.toISOString().split('T')[0];
    };

    let totalRemesasPistaUsd = 0;
    let totalPosPistaUsd = 0;
    let efectivoEnTransito48hUsd = 0;
    const remesasEnTransito = [];

    pistaRows.forEach(pr => {
        const fStr = formatYMD(pr.fecha);
        const remUsd = Number(pr.remesas_pista_usd || 0);
        const posUsd = Number(pr.tarjetas_pista_usd || 0);
        totalRemesasPistaUsd += remUsd;
        totalPosPistaUsd += posUsd;

        if (fStr <= cutoff48hStr && (remUsd + posUsd) > 0) {
            // Verificar cobertura bancaria en ventana [T, T+1, T+2] proporcional a la estación
            const bankWindow =
                (abonosPorFecha[fStr] || 0) * 0.5 +
                (abonosPorFecha[addDaysStr(fStr, 1)] || 0) * 0.35 +
                (abonosPorFecha[addDaysStr(fStr, 2)] || 0) * 0.15;
            const totalDayPista = pistaTotalByDate[fStr] || 1;
            const share = (remUsd + posUsd) / totalDayPista;
            const abonoAsociado = Math.min(remUsd + posUsd, bankWindow * share);
            const pendiente = Math.max(0, (remUsd + posUsd) - abonoAsociado);

            // Considerar comisión POS promedio saludable (~1.85%) antes de levantar alerta
            const toleranciaComisionPos = posUsd * 0.025;
            if (pendiente > Math.max(50, toleranciaComisionPos)) {
                efectivoEnTransito48hUsd += pendiente;
                const diasTransito = Math.max(2, Math.round((new Date(dFin + 'T00:00:00Z') - new Date(fStr + 'T00:00:00Z')) / (1000 * 60 * 60 * 24)));
                remesasEnTransito.push({
                    id_empresa: pr.id_empresa,
                    codigo_estacion: resolveStationEmpCode(pr.id_empresa),
                    estacion: pr.estacion,
                    fecha_turno: fStr,
                    dias_transito: diasTransito,
                    remesa_pista_usd: Math.round(remUsd * 100) / 100,
                    pos_pista_usd: Math.round(posUsd * 100) / 100,
                    abono_bancario_estimado_usd: Math.round(abonoAsociado * 100) / 100,
                    pendiente_conciliar_usd: Math.round(pendiente * 100) / 100,
                    severidad: diasTransito >= 4 || pendiente > 2500 ? 'critico' : 'advertencia'
                });
            }
        }
    });

    const comisionPosEstimadaUsd = totalPosPistaUsd * 0.0185;
    const totalVales72hUsd = valesSinFacturar.reduce((s, v) => s + Number(v.monto_usd || 0), 0);
    const alertasTransitoCount = remesasEnTransito.length + (valesSinFacturar.length > 0 ? 1 : 0);

    return {
        periodo: { desde: dInicio, hasta: dFin, dias: windowDays },
        resumen: {
            efectivo_remesado_pista_usd: Math.round(totalRemesasPistaUsd * 100) / 100,
            pos_tarjetas_pista_usd: Math.round(totalPosPistaUsd * 100) / 100,
            abonos_bancos_identificados_usd: Math.round(totalAbonosBancosUsd * 100) / 100,
            efectivo_en_transito_48h_usd: Math.round(efectivoEnTransito48hUsd * 100) / 100,
            comision_pos_estimada_usd: Math.round(comisionPosEstimadaUsd * 100) / 100,
            vales_sin_facturar_72h_usd: Math.round(totalVales72hUsd * 100) / 100,
            vales_sin_facturar_count: valesSinFacturar.length,
            partidas_transito_count: remesasEnTransito.length,
            alertas_transito_count: alertasTransitoCount,
            estatus_auditoria: alertasTransitoCount > 0 ? 'PENDIENTES EN TRÁNSITO' : 'CONCILIACIÓN AL DÍA'
        },
        remesas_en_transito: remesasEnTransito.slice(0, 30),
        vales_pendientes_72h: valesSinFacturar
    };
};

/**
 * 2. Resumen Inteligente por Rol para Inicio (/dashboard)
 * Filtra cada bloque estrictamente según los permisos efectivos del usuario autenticado.
 */
const getHomeResumenInteligente = async (user) => {
    const canViewVentas = userHasAnyPerm(user, [
        'view_direccion_estrategica',
        '/dashboard/estrategia/torre-control',
        '/dashboard/consultas/estaciones/ventas',
        '/dashboard/consultas/estaciones/resumen-cierre',
        'view_ventas'
    ]);
    const canViewCombustible = userHasAnyPerm(user, [
        'view_direccion_estrategica',
        '/dashboard/estrategia/combustible',
        '/dashboard/operaciones/pedidos',
        'manage_pedidos'
    ]);
    const canViewBancos = userHasAnyPerm(user, [
        'view_direccion_estrategica',
        '/dashboard/estrategia/torre-control',
        '/dashboard/bancos/reportes/saldos-bancos',
        '/dashboard/bancos/cuentas',
        '/dashboard/bancos/conciliacion'
    ]);
    const canViewAuditoria = userHasAnyPerm(user, [
        'view_direccion_estrategica',
        '/dashboard/estrategia/mermas',
        '/dashboard/bancos/conciliacion',
        '/dashboard/estrategia/torre-control'
    ]);
    const canViewDossier = userHasAnyPerm(user, [
        'view_direccion_estrategica',
        '/dashboard/estrategia/torre-control',
        '/dashboard/estrategia/rentabilidad'
    ]);
    const canManageTickets = userHasAnyPerm(user, ['manage_support_tickets']);

    const todayStr = getDateStr(0);
    const yesterdayStr = getDateStr(-1);

    // Ejecutar bloques autorizados en paralelo con aislamiento total de fallos
    const [
        ventasRes,
        tanquesRes,
        pedidosRes,
        bancosRes,
        auditoriaRes,
        operativoUsuarioRes
    ] = await Promise.all([
        // Bloque Ventas
        (async () => {
            if (!canViewVentas) return null;
            try {
                const accountingDb = await getAccountingDb();
                if (!accountingDb) return { fecha: yesterdayStr, total_dolares: 0, total_galones: 0, hoy_dolares: 0, hoy_galones: 0 };
                const sql = `
                    SELECT COALESCE(SUM(r.diferencia), 0) as galones, COALESCE(SUM(r.monto), 0) as dolares
                    FROM gas_station_closeouts c
                    JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
                    WHERE c.estado = 'cerrado' AND c.fecha_turno = ?
                `;
                let [[ayerRow]] = await withRetry(() => accountingDb.query(sql, [yesterdayStr]));
                let fechaRef = yesterdayStr;
                if (Number(ayerRow?.dolares || 0) === 0) {
                    const [[maxRow]] = await withRetry(() => accountingDb.query(
                        "SELECT MAX(fecha_turno) as last_date FROM gas_station_closeouts WHERE estado = 'cerrado'"
                    ));
                    const lastD = formatYMD(maxRow?.last_date);
                    if (lastD) {
                        fechaRef = lastD;
                        [[ayerRow]] = await withRetry(() => accountingDb.query(sql, [lastD]));
                    }
                }
                const [[hoyRow]] = await withRetry(() => accountingDb.query(sql, [todayStr]));
                return {
                    fecha_corte: fechaRef,
                    ayer_dolares: Math.round(Number(ayerRow?.dolares || 0)),
                    ayer_galones: Math.round(Number(ayerRow?.galones || 0)),
                    hoy_dolares: Math.round(Number(hoyRow?.dolares || 0)),
                    hoy_galones: Math.round(Number(hoyRow?.galones || 0))
                };
            } catch (_e) {
                return { fecha_corte: yesterdayStr, ayer_dolares: 0, ayer_galones: 0, hoy_dolares: 0, hoy_galones: 0 };
            }
        })(),

        // Bloque Tanques
        (async () => {
            if (!canViewCombustible) return null;
            try {
                const aut = await getTanquesAutonomia();
                const criticosTop = (aut.tanques || [])
                    .filter(t => t.estado === 'critico' || t.estado === 'advertencia')
                    .sort((a, b) => a.horas_restantes - b.horas_restantes)
                    .slice(0, 4);
                return {
                    ...aut.resumen,
                    fecha_corte: aut.fecha_corte,
                    alertas_tanques: criticosTop
                };
            } catch (_e) {
                return { total_tanques: 0, tanques_criticos: 0, emergencias_reales: 0, cubiertos_en_ruta: 0, galones_en_transito_total: 0, alertas_tanques: [] };
            }
        })(),

        // Bloque Pedidos Puma
        (async () => {
            if (!canViewCombustible) return null;
            try {
                const db = getDb();
                if (!db) return null;
                const [[pRow]] = await db.query(`
                    SELECT
                        SUM(CASE WHEN UPPER(estado) = 'LIBERADO' THEN 1 ELSE 0 END) as liberados,
                        SUM(CASE WHEN UPPER(estado) IN ('EN_PROCESO', 'PENDIENTE') THEN 1 ELSE 0 END) as en_proceso,
                        SUM(CASE WHEN UPPER(estado) = 'RETENIDO' THEN 1 ELSE 0 END) as retenidos,
                        SUM(CASE WHEN estado_pago = 'PENDIENTE' THEN 1 ELSE 0 END) as pendientes_pago,
                        MAX(sincronizado_at) as ultima_sincronizacion
                    FROM portal_pedidos
                    WHERE fecha_pedido >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
                       OR fecha_solicitada >= DATE_SUB(CURDATE(), INTERVAL 15 DAY)
                `);
                return {
                    liberados: Number(pRow?.liberados || 0),
                    en_proceso: Number(pRow?.en_proceso || 0),
                    retenidos: Number(pRow?.retenidos || 0),
                    pendientes_pago: Number(pRow?.pendientes_pago || 0),
                    ultima_sincronizacion: pRow?.ultima_sincronizacion || null
                };
            } catch (_e) {
                return { liberados: 0, en_proceso: 0, retenidos: 0, pendientes_pago: 0, ultima_sincronizacion: null };
            }
        })(),

        // Bloque Tesorería
        (async () => {
            if (!canViewBancos) return null;
            try {
                const bData = await getSaldosBancosData();
                return {
                    saldo_total_usd: Math.round(Number(bData?.total || 0)),
                    cuentas_activas: (bData?.cuentas || []).length,
                    fuente: bData?.fuente || 'local'
                };
            } catch (_e) {
                return { saldo_total_usd: 0, cuentas_activas: 0, fuente: 'offline' };
            }
        })(),

        // Bloque Auditoría Tránsito
        (async () => {
            if (!canViewAuditoria) return null;
            try {
                const aud = await getAuditoriaDineroEnTransito({ dias: 10 });
                return aud.resumen;
            } catch (_e) {
                return { efectivo_en_transito_48h_usd: 0, vales_sin_facturar_72h_usd: 0, alertas_transito_count: 0 };
            }
        })(),

        // Bloque Tickets y Tareas del Usuario Actual
        (async () => {
            const out = { tickets_abiertos: 0, mis_tareas_pendientes: 0 };
            try {
                const db = getDb();
                if (!db || !user?.id) return out;
                if (canManageTickets) {
                    const [[tRow]] = await db.query(
                        "SELECT COUNT(*) as cnt FROM support_tickets WHERE status IN ('abierto', 'en_proceso')"
                    );
                    out.tickets_abiertos = Number(tRow?.cnt || 0);
                } else {
                    const [[tRow]] = await db.query(
                        "SELECT COUNT(*) as cnt FROM support_tickets WHERE (user_id = ? OR admin_user_id = ?) AND status IN ('abierto', 'en_proceso')",
                        [user.id, user.id]
                    );
                    out.tickets_abiertos = Number(tRow?.cnt || 0);
                }
                const [[taskRow]] = await db.query(
                    "SELECT COUNT(*) as cnt FROM tasks WHERE assigned_to = ? AND estado IN ('pendiente', 'en_proceso', 'en_revision')",
                    [user.id]
                );
                out.mis_tareas_pendientes = Number(taskRow?.cnt || 0);
            } catch (_e) {
                // Ignorar de forma segura
            }
            return out;
        })()
    ]);

    return {
        ok: true,
        timestamp: new Date().toISOString(),
        permisos_bloques: {
            ventas: canViewVentas,
            abastecimiento: canViewCombustible,
            tesoreria: canViewBancos,
            auditoria: canViewAuditoria,
            dossier_pdf: canViewDossier
        },
        ventas: ventasRes,
        abastecimiento: tanquesRes ? {
            tanques: tanquesRes,
            pedidos_puma: pedidosRes
        } : null,
        tesoreria: bancosRes,
        auditoria: auditoriaRes,
        actividad_personal: operativoUsuarioRes
    };
};

/**
 * 3. Construye el payload consolidado del Dossier Ejecutivo Semanal (Tamaño Carta)
 * Listo para renderizar con generateExecutiveReportPdf en Web (ReportPreviewModal) y Telegram (/dossier).
 */
const buildWeeklyExecutiveDossierPayload = async () => {
    const dFin = getDateStr(0);
    const dInicio = getDateStr(-7);

    const [pnlRes, tanquesRes, bancosRes, elasticidadRes, transitoRes] = await Promise.allSettled([
        getRentabilidadPorEstacion(dInicio, dFin),
        getTanquesAutonomia(),
        getSaldosBancosData(),
        getElasticidadPreciosCompetencia(30),
        getAuditoriaDineroEnTransito({ dias: 14 })
    ]);

    const pnl = pnlRes.status === 'fulfilled' ? pnlRes.value : null;
    const tanques = tanquesRes.status === 'fulfilled' ? tanquesRes.value : null;
    const bancos = bancosRes.status === 'fulfilled' ? bancosRes.value : null;
    const elasticidad = elasticidadRes.status === 'fulfilled' ? elasticidadRes.value : null;
    const transito = transitoRes.status === 'fulfilled' ? transitoRes.value : null;

    const consolidado = pnl?.resumen_consolidado || {};
    const estaciones = pnl?.estaciones || [];
    const totalBancos = Number(bancos?.total || 0);
    const emergenciasReales = Number(tanques?.resumen?.emergencias_reales ?? tanques?.resumen?.tanques_criticos ?? 0);
    const cubiertosEnRuta = Number(tanques?.resumen?.cubiertos_en_ruta || 0);
    const transitoUsd = Number(transito?.resumen?.efectivo_en_transito_48h_usd || 0);
    const vales72hUsd = Number(transito?.resumen?.vales_sin_facturar_72h_usd || 0);
    const fugasVolumen = Number(elasticidad?.resumen?.alertas_fuga_volumen || 0);
    const ahorroSolar = Number(consolidado.ahorro_solar_total_usd || 0);

    const kpis = [
        { label: 'Ingresos 7 Días', value: moneyFmt(consolidado.ingresos_totales || 0) },
        { label: 'Volumen 7 Días', value: `${numFmt(consolidado.galones_totales || 0)} gal` },
        { label: 'EBITDA Operativo', value: moneyFmt(consolidado.utilidad_operativa_total || 0) },
        { label: 'Margen Neto / Gal', value: `$${consolidado.margen_neto_promedio_galon || 0}/gal` },
        { label: 'Liquidez Bancos', value: moneyFmt(totalBancos) },
        { label: 'Emergencias Tanque', value: `${emergenciasReales} real (${cubiertosEnRuta} ruta)` },
        { label: 'Tránsito >48h', value: moneyFmt(transitoUsd) },
        { label: 'Vales >72h / Solar', value: `${moneyFmt(vales72hUsd)} / +${moneyFmt(ahorroSolar)}` }
    ];

    const columns = [
        'Estación de Servicio',
        'Galones (7d)',
        'Ingresos ($)',
        'Margen Bruto',
        'OPEX Real',
        'EBITDA Neto',
        'Neto/Gal'
    ];

    const rows = estaciones.length > 0
        ? estaciones.map(e => [
            e.estacion || 'Estación',
            numFmt(e.galones_vendidos || 0),
            moneyFmt(e.ingresos?.total || 0),
            moneyFmt(e.margenes_brutos?.total || 0),
            moneyFmt(e.gastos_operativos?.total || 0),
            moneyFmt(e.utilidad_operativa_neta || 0),
            `$${e.margen_neto_por_galon ?? 0}`
        ])
        : [['Consolidado Grupo SIPE', '0', '$0.00', '$0.00', '$0.00', '$0.00', '$0.000']];

    const summaryText =
        `Período evaluado: ${toDisplayDate(dInicio)} al ${toDisplayDate(dFin)}. ` +
        `Costos integrados (${consolidado.fuente_costos === 'real_integrado' ? 'Liquidación Puma + Fletes + Planilla + Solar' : 'Modelo Estándar'}): ` +
        `Flete cisternas ${moneyFmt(consolidado.flete_total_usd || 0)} | Ahorro solar ${moneyFmt(ahorroSolar)}. ` +
        `Auditoría de pista y bancos: ${moneyFmt(transitoUsd)} en efectivo/POS >48h y ${moneyFmt(vales72hUsd)} en vales >72h pendientes de facturar. ` +
        `Competencia DGEHM: ${fugasVolumen} alerta(s) de elasticidad precio-volumen detectadas.`;

    return {
        title: 'DOSSIER EJECUTIVO SEMANAL • GRUPO SIPE',
        subtitle: `Rentabilidad Real (EBITDA), Liquidez, Abastecimiento y Auditoría (${toDisplayDate(dInicio)} - ${toDisplayDate(dFin)})`,
        dateStr: toDisplayDate(dFin),
        fileName: `Dossier_Ejecutivo_SIPE_${dFin}.pdf`,
        kpis,
        columns,
        rows,
        summaryText,
        meta: {
            desde: dInicio,
            hasta: dFin,
            utilidad_operativa_total: consolidado.utilidad_operativa_total || 0,
            liquidez_bancos_usd: totalBancos,
            emergencias_reales: emergenciasReales
        }
    };
};

module.exports = {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
};
