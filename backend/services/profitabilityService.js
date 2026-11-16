const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const withRetry = (...args) => dbModule.withRetry(...args);
const { branchToEmpId, OFFICIAL_ESTACIONES } = require('./consultasCatalog');
const solarEnergyService = require('./solarEnergyService');

const resolveStationEmpCode = (rawId) => {
    if (rawId === null || rawId === undefined) return '';
    const str = String(rawId).trim();
    if (branchToEmpId[str]) return branchToEmpId[str];
    if (/^\d+$/.test(str) && str.length < 3) return str.padStart(3, '0');
    return str;
};

/**
 * Obtiene el P&L y Rentabilidad Operativa (EBITDA Real) por Estación de Servicio
 * Cruzando ventas en turnos cerrados con liquidación quincenal Puma, fletes por estación,
 * nómina RRHH, ahorro energético solar fotovoltaico y planes de mantenimiento.
 * @param {string} fechaDesde - YYYY-MM-DD
 * @param {string} fechaHasta - YYYY-MM-DD
 */
const getRentabilidadPorEstacion = async (fechaDesde, fechaHasta) => {
    const accountingDb = await getAccountingDb();

    // Fechas por defecto: últimos 30 días
    let dFin = fechaHasta;
    let dInicio = fechaDesde;
    if (!dFin || !dInicio) {
        const now = new Date();
        dFin = now.toISOString().split('T')[0];
        const prev = new Date(now);
        prev.setDate(prev.getDate() - 30);
        dInicio = prev.toISOString().split('T')[0];
    }

    const tInicio = new Date(dInicio + 'T00:00:00');
    const tFin = new Date(dFin + 'T00:00:00');
    const numDias = Math.max(1, Math.round((tFin - tInicio) / (1000 * 60 * 60 * 24)) + 1);
    const factorDias = numDias / 30;

    // 1. Estaciones activas con infraestructura de tanques (Inversiones LIL branch_id 7 para Shell Poliedro, excluyendo branch_id 12)
    const [stations] = await withRetry(() => accountingDb.query(
        "SELECT id as id_empresa, nombre as titulo FROM branches WHERE id != 12 AND id IN (SELECT DISTINCT branch_id FROM gas_station_tanks) ORDER BY id"
    ));

    // 2. Ventas y galonaje de combustible por estación (solo turnos cerrados)
    const sqlCombustibles = `
        SELECT 
            b.id as id_empresa,
            COALESCE(SUM(r.diferencia), 0.0) as total_galones,
            COALESCE(SUM(r.monto), 0.0) as venta_dolares,
            COALESCE(SUM(CASE WHEN (r.codigo_producto LIKE '%DIESEL%' AND r.codigo_producto NOT LIKE '%ION%') OR p.tipo_combustible = 3 THEN r.diferencia ELSE 0 END), 0.0) as galones_diesel,
            COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%REGULAR%' OR p.tipo_combustible = 1 THEN r.diferencia ELSE 0 END), 0.0) as galones_regular,
            COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%SUPER%' OR p.tipo_combustible = 2 THEN r.diferencia ELSE 0 END), 0.0) as galones_super,
            COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%ION%' OR p.tipo_combustible = 4 THEN r.diferencia ELSE 0 END), 0.0) as galones_ion
        FROM branches b
        JOIN gas_station_closeouts c ON b.id = c.branch_id
        JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
        LEFT JOIN products p ON r.product_id = p.id
        WHERE c.estado = 'cerrado' AND b.id != 12 AND c.fecha_turno BETWEEN ? AND ?
        GROUP BY id_empresa
        ORDER BY id_empresa
    `;
    const [combustiblesRows] = await withRetry(() => accountingDb.query(sqlCombustibles, [dInicio, dFin]));

    // 3. Costos base de combustible desde catálogo SaaS y liquidación quincenal + flete por estación
    const costMap = {
        'DIESEL': 3.10,
        'REGULAR': 3.35,
        'SUPER': 3.65,
        'IONDIESEL': 3.20
    };
    try {
        const [costosRows] = await withRetry(() => accountingDb.query(`
            SELECT 
                CASE 
                    WHEN tipo_combustible = 4 THEN 'IONDIESEL'
                    WHEN tipo_combustible = 3 THEN 'DIESEL'
                    WHEN tipo_combustible = 2 THEN 'SUPER'
                    WHEN tipo_combustible = 1 THEN 'REGULAR'
                    ELSE 'DIESEL'
                END as cod_producto,
                AVG(costo) as costo
            FROM products
            WHERE tipo_combustible > 0 AND costo > 0
            GROUP BY cod_producto
        `));
        costosRows.forEach(c => {
            if (c.cod_producto && Number(c.costo) > 0) {
                costMap[c.cod_producto] = Number(c.costo);
            }
        });
    } catch (_e) {
        // Fallback default
    }

    const stationWholesaleMap = {};
    const fleteGalonMap = {};
    const mantenimientoMap = {};
    let hasRealFuelCosts = false;

    try {
        const db = getDb();
        if (db) {
            const [fletesRows] = await db.query(
                'SELECT id_estacion, flete_galon FROM combustible_fletes_estacion WHERE activo = 1'
            );
            (fletesRows || []).forEach(f => {
                const code = resolveStationEmpCode(f.id_estacion);
                if (code && Number(f.flete_galon) > 0) {
                    fleteGalonMap[code] = Number(f.flete_galon);
                    hasRealFuelCosts = true;
                }
            });

            const [qRows] = await db.query(`
                SELECT id_estacion, precio_diesel, precio_regular, precio_super, precio_ion
                FROM combustible_precios_estacion_quincenal
                ORDER BY
                    CASE WHEN periodo_fin >= ? AND periodo_inicio <= ? THEN 0 ELSE 1 END ASC,
                    periodo_fin DESC
            `, [dInicio, dFin]);
            (qRows || []).forEach(q => {
                const code = resolveStationEmpCode(q.id_estacion);
                if (!code || stationWholesaleMap[code]) return;
                stationWholesaleMap[code] = {
                    DIESEL: Number(q.precio_diesel) > 0 ? Number(q.precio_diesel) : null,
                    REGULAR: Number(q.precio_regular) > 0 ? Number(q.precio_regular) : null,
                    SUPER: Number(q.precio_super) > 0 ? Number(q.precio_super) : null,
                    IONDIESEL: Number(q.precio_ion) > 0 ? Number(q.precio_ion) : null
                };
                hasRealFuelCosts = true;
            });

            const [mantRows] = await db.query(`
                SELECT empresa_id, COALESCE(SUM(costo_estimado), 0) as total_mant
                FROM finanzas_planes_mantenimiento
                WHERE COALESCE(fecha_completado, fecha_programada) BETWEEN ? AND ?
                  AND estado IN ('completado', 'programado', 'pendiente')
                GROUP BY empresa_id
            `, [dInicio, dFin]);
            (mantRows || []).forEach(m => {
                mantenimientoMap[String(m.empresa_id)] = Number(m.total_mant || 0);
            });
        }
    } catch (_errLocal) {
        // Fallback limpio
    }

    // 4. Nómina real en rh_planillas (agrupada por sucursal si existe, o prorrateada en estaciones activas)
    const payrollByBranch = {};
    let totalPayrollFallbackPerStation = 0;
    let hasRealPayroll = false;
    try {
        const [payrollRows] = await withRetry(() => accountingDb.query(`
            SELECT branch_id, COALESCE(SUM(monto_recibir), 0.0) as total_planilla
            FROM rh_planillas
            WHERE CONCAT(periodo_anio, '-', LPAD(periodo_mes, 2, '0'), '-', CASE WHEN quincena = 1 OR quincena = 'primera' THEN '15' ELSE '28' END)
                  BETWEEN ? AND ?
            GROUP BY branch_id
        `, [dInicio, dFin]));
        if (Array.isArray(payrollRows) && payrollRows.length > 0) {
            let unassignedSum = 0;
            payrollRows.forEach(pr => {
                const amt = Number(pr.total_planilla || 0);
                if (amt <= 0) return;
                hasRealPayroll = true;
                if (pr.branch_id) {
                    const normBranch = Number(pr.branch_id) === 7 ? 12 : Number(pr.branch_id);
                    payrollByBranch[normBranch] = (payrollByBranch[normBranch] || 0) + amt;
                } else {
                    unassignedSum += amt;
                }
            });
            if (unassignedSum > 0 && stations.length > 0) {
                totalPayrollFallbackPerStation = unassignedSum / stations.length;
            }
        }
    } catch (_errPayroll) {
        // Si rh_planillas no tiene branch_id o no está disponible, usar respaldo proporcional
    }

    // 5. Ahorro energético solar real por estación en el rango
    const solarAhorroByEmp = {};
    try {
        const solarRango = await solarEnergyService.getSolarAhorroRango(dInicio, dFin);
        const listaSolar = solarRango?.desglose_por_estacion || solarRango?.estaciones || [];
        listaSolar.forEach(item => {
            const code = resolveStationEmpCode(item.id_empresa || item.saas_branch_id || item.branch_id);
            const ahorro = Number(item.total_ahorro_usd ?? item.ahorro_usd ?? 0);
            if (code && ahorro > 0) {
                solarAhorroByEmp[code] = (solarAhorroByEmp[code] || 0) + ahorro;
            }
        });
    } catch (_errSolar) {
        // Fallback limpio
    }

    // 6. Ventas de Tienda de conveniencia (sales_headers POS en la sucursal)
    const tiendasMap = {};
    try {
        const sqlTiendas = `
            SELECT branch_id as id_empresa, COALESCE(SUM(total_pagar), 0.0) as total_tienda
            FROM sales_headers
            WHERE estado = 'emitido' AND fecha_emision BETWEEN ? AND ?
            GROUP BY branch_id
        `;
        const [tiendasRows] = await withRetry(() => accountingDb.query(sqlTiendas, [dInicio, dFin]));
        tiendasRows.forEach(t => {
            tiendasMap[t.id_empresa] = Number(t.total_tienda || 0);
        });
    } catch (_e) {
        // Si no hay ventas de tienda registradas
    }

    // 7. Ventas de Lubricantes en cierres de pista cerrados
    const lubricantesMap = {};
    try {
        const sqlLubricantes = `
            SELECT c.branch_id as id_empresa, COALESCE(SUM(l.total), 0.0) as total_lubricantes
            FROM gas_station_closeouts c
            JOIN gas_station_closeout_lubricant_readings l ON c.id = l.closeout_id
            WHERE c.estado = 'cerrado' AND c.branch_id != 12 AND c.fecha_turno BETWEEN ? AND ?
            GROUP BY id_empresa
        `;
        const [lubricantesRows] = await withRetry(() => accountingDb.query(sqlLubricantes, [dInicio, dFin]));
        lubricantesRows.forEach(l => {
            lubricantesMap[l.id_empresa] = Number(l.total_lubricantes || 0);
        });
    } catch (_e) {
        // Si no hay lubricantes registrados
    }

    // 8. Gastos operativos registrados en turnos cerrados
    const sqlGastos = `
        SELECT c.branch_id as id_empresa, COALESCE(SUM(e.valor), 0.0) as total_gastos
        FROM gas_station_closeouts c
        JOIN gas_station_closeout_expenses e ON c.id = e.closeout_id
        WHERE c.estado = 'cerrado' AND c.branch_id != 12 AND c.fecha_turno BETWEEN ? AND ?
        GROUP BY id_empresa
    `;
    const [gastosRows] = await withRetry(() => accountingDb.query(sqlGastos, [dInicio, dFin]));
    const gastosMap = {};
    gastosRows.forEach(g => {
        gastosMap[g.id_empresa] = Number(g.total_gastos || 0);
    });

    let granTotalGalones = 0;
    let granTotalIngresos = 0;
    let granTotalMargenBruto = 0;
    let granTotalUtilidadNeta = 0;
    let granTotalFleteUsd = 0;
    let granTotalAhorroSolarUsd = 0;

    const reporteEstaciones = stations.map(s => {
        const id = s.id_empresa;
        const empCode = resolveStationEmpCode(id);
        const rowC = combustiblesRows.find(c => String(c.id_empresa) === String(id)) || {};

        const galonesTotal = Number(rowC.total_galones || 0);
        const ventaCombustible = Number(rowC.venta_dolares || 0);

        const gD = Number(rowC.galones_diesel || 0);
        const gR = Number(rowC.galones_regular || 0);
        const gS = Number(rowC.galones_super || 0);
        const gI = Number(rowC.galones_ion || 0);

        const stWholesale = stationWholesaleMap[empCode] || {};
        const cD = stWholesale.DIESEL || costMap['DIESEL'] || 3.10;
        const cR = stWholesale.REGULAR || costMap['REGULAR'] || 3.35;
        const cS = stWholesale.SUPER || costMap['SUPER'] || 3.65;
        const cI = stWholesale.IONDIESEL || costMap['IONDIESEL'] || 3.20;

        const fleteUnitario = fleteGalonMap[empCode] || 0;
        const costoFleteCisternas = galonesTotal * fleteUnitario;

        const costoBaseCombustible = (gD * cD) + (gR * cR) + (gS * cS) + (gI * cI);
        // Si el precio de venta registrado supera el costo mayorista real, calculamos margen real; si no (ej. precios seed de otro período), aplicamos margen mayorista real o respaldo
        let margenCombustible = ventaCombustible > (costoBaseCombustible + costoFleteCisternas) && ventaCombustible > 0
            ? (ventaCombustible - costoBaseCombustible - costoFleteCisternas)
            : (ventaCombustible > costoBaseCombustible && ventaCombustible > 0
                ? (ventaCombustible - costoBaseCombustible)
                : Math.max(0, (galonesTotal * 0.28) - costoFleteCisternas));

        // Tiendas (Margen comercial promedio 24%)
        const ventaTienda = tiendasMap[id] || 0;
        const margenTienda = ventaTienda * 0.24;

        // Lubricantes (Margen comercial promedio 30%)
        const ventaLubricantes = lubricantesMap[id] || 0;
        const margenLubricantes = ventaLubricantes * 0.30;

        const totalIngresosEstacion = ventaCombustible + ventaTienda + ventaLubricantes;
        const totalMargenBruto = margenCombustible + margenTienda + margenLubricantes;

        // OPEX Real Integrado: gastos pista + planilla real (o base laboral) + energía neta (descontando ahorro solar) + mantenimiento
        const gastosVariablesPista = gastosMap[id] || 0;
        const planillaEstacion = hasRealPayroll
            ? ((payrollByBranch[Number(id)] || 0) + totalPayrollFallbackPerStation)
            : (3200 * factorDias);
        const energiaBrutaEstimada = 1450 * factorDias;
        const ahorroSolarEstacion = solarAhorroByEmp[empCode] || 0;
        const energiaNetaEstacion = Math.max(180 * factorDias, energiaBrutaEstimada - ahorroSolarEstacion);
        const otrosFijosAdmin = 850 * factorDias;
        const mantenimientoEstacion = mantenimientoMap[String(id)] || 0;

        const gastosFijosPeriodo = planillaEstacion + energiaNetaEstacion + otrosFijosAdmin + mantenimientoEstacion;
        const totalGastosOperativos = gastosVariablesPista + gastosFijosPeriodo;

        const utilidadOperativaNeta = totalMargenBruto - totalGastosOperativos;

        const margenNetoPorGalon = galonesTotal > 0 ? (utilidadOperativaNeta / galonesTotal) : 0;
        const margenBrutoPorGalon = galonesTotal > 0 ? (margenCombustible / galonesTotal) : 0;

        // Punto de equilibrio en galones = Gastos Totales / Margen Bruto por galón
        const puntoEquilibrioGalones = margenBrutoPorGalon > 0 ? Math.round(totalGastosOperativos / margenBrutoPorGalon) : 0;

        granTotalGalones += galonesTotal;
        granTotalIngresos += totalIngresosEstacion;
        granTotalMargenBruto += totalMargenBruto;
        granTotalUtilidadNeta += utilidadOperativaNeta;
        granTotalFleteUsd += costoFleteCisternas;
        granTotalAhorroSolarUsd += ahorroSolarEstacion;

        let clasificacion = 'rentable';
        if (utilidadOperativaNeta < 0) {
            clasificacion = 'en_perdida';
        } else if (utilidadOperativaNeta > 15000 * factorDias) {
            clasificacion = 'estrella';
        }

        return {
            id_empresa: id,
            codigo_estacion: empCode,
            estacion: s.titulo,
            galones_vendidos: Math.round(galonesTotal),
            ingresos: {
                total: Math.round(totalIngresosEstacion),
                combustible: Math.round(ventaCombustible),
                tienda: Math.round(ventaTienda),
                lubricantes: Math.round(ventaLubricantes)
            },
            margenes_brutos: {
                total: Math.round(totalMargenBruto),
                combustible: Math.round(margenCombustible),
                tienda: Math.round(margenTienda),
                lubricantes: Math.round(margenLubricantes)
            },
            gastos_operativos: {
                total: Math.round(totalGastosOperativos),
                variables_pista: Math.round(gastosVariablesPista),
                fijos_prorrateados: Math.round(gastosFijosPeriodo)
            },
            desglose_costos_reales: {
                flete_galon_usd: fleteUnitario,
                flete_total_usd: Math.round(costoFleteCisternas),
                planilla_rrhh_usd: Math.round(planillaEstacion),
                energia_neta_usd: Math.round(energiaNetaEstacion),
                ahorro_solar_usd: Math.round(ahorroSolarEstacion),
                mantenimiento_usd: Math.round(mantenimientoEstacion),
                fuente: (hasRealFuelCosts || hasRealPayroll || ahorroSolarEstacion > 0) ? 'real_integrado' : 'estimado_estandar'
            },
            utilidad_operativa_neta: Math.round(utilidadOperativaNeta),
            margen_bruto_por_galon: Math.round(margenBrutoPorGalon * 1000) / 1000,
            margen_neto_por_galon: Math.round(margenNetoPorGalon * 1000) / 1000,
            punto_equilibrio_galones: puntoEquilibrioGalones,
            superavit_punto_equilibrio: Math.round(galonesTotal - puntoEquilibrioGalones),
            clasificacion
        };
    });

    // Ordenar de mayor utilidad neta a menor
    reporteEstaciones.sort((a, b) => b.utilidad_operativa_neta - a.utilidad_operativa_neta);

    return {
        periodo: { desde: dInicio, hasta: dFin, dias: numDias },
        resumen_consolidado: {
            galones_totales: Math.round(granTotalGalones),
            ingresos_totales: Math.round(granTotalIngresos),
            margen_bruto_total: Math.round(granTotalMargenBruto),
            utilidad_operativa_total: Math.round(granTotalUtilidadNeta),
            flete_total_usd: Math.round(granTotalFleteUsd),
            ahorro_solar_total_usd: Math.round(granTotalAhorroSolarUsd),
            fuente_costos: (hasRealFuelCosts || hasRealPayroll || granTotalAhorroSolarUsd > 0) ? 'real_integrado' : 'estimado_estandar',
            margen_neto_promedio_galon: granTotalGalones > 0 ? Math.round((granTotalUtilidadNeta / granTotalGalones) * 1000) / 1000 : 0,
            estaciones_estrella: reporteEstaciones.filter(e => e.clasificacion === 'estrella').length,
            estaciones_en_perdida: reporteEstaciones.filter(e => e.clasificacion === 'en_perdida').length
        },
        estaciones: reporteEstaciones
    };
};

/**
 * Analizador de Elasticidad de Precios DGEHM vs. Volumen de Galones Despachados
 * Cruza precios propios y de competencia zonal (web_precios_competencia) contra
 * la variación de volumen diario en turnos cerrados (últimos 7 días vs base previa).
 */
const getElasticidadPreciosCompetencia = async (dias = 30) => {
    const windowDays = Math.min(90, Math.max(14, parseInt(dias, 10) || 30));
    const now = new Date();
    const dFin = now.toISOString().split('T')[0];
    const dSplitObj = new Date(now);
    dSplitObj.setDate(dSplitObj.getDate() - 7);
    const dSplit = dSplitObj.toISOString().split('T')[0];
    const dInicioObj = new Date(now);
    dInicioObj.setDate(dInicioObj.getDate() - windowDays);
    const dInicio = dInicioObj.toISOString().split('T')[0];

    let compRows = [];
    try {
        const db = getDb();
        if (db) {
            const [rows] = await db.query(`
                SELECT
                    ec.id_estacion,
                    ec.competencia as estacion,
                    ec.es_propia,
                    pc.super_a, pc.regular_a, pc.diesel_a,
                    pc.super_c, pc.regular_c, pc.diesel_c,
                    pc.modificacion
                FROM web_estaciones_competencia ec
                JOIN web_precios_competencia pc ON UPPER(TRIM(ec.competencia)) = UPPER(TRIM(pc.estacion))
                ORDER BY ec.id_estacion, ec.es_propia DESC
            `);
            compRows = rows || [];
        }
    } catch (_errComp) {
        compRows = [];
    }

    // Volumen diario promedio reciente (7d) vs previo por estación y combustible
    const volumeStatsMap = {};
    try {
        const accountingDb = await getAccountingDb();
        const [volRows] = await withRetry(() => accountingDb.query(`
            SELECT
                CASE WHEN c.branch_id = 7 THEN 12 ELSE c.branch_id END as branch_id,
                CASE 
                    WHEN (r.codigo_producto LIKE '%DIESEL%' AND r.codigo_producto NOT LIKE '%ION%') OR p.tipo_combustible = 3 THEN 'diesel'
                    WHEN r.codigo_producto LIKE '%SUPER%' OR p.tipo_combustible = 2 THEN 'super'
                    WHEN r.codigo_producto LIKE '%REGULAR%' OR p.tipo_combustible = 1 THEN 'regular'
                    ELSE 'other'
                END as fuel_key,
                COUNT(DISTINCT CASE WHEN c.fecha_turno > ? THEN c.fecha_turno END) as dias_recientes,
                COALESCE(SUM(CASE WHEN c.fecha_turno > ? THEN r.diferencia ELSE 0 END), 0) as gal_recientes,
                COUNT(DISTINCT CASE WHEN c.fecha_turno <= ? THEN c.fecha_turno END) as dias_base,
                COALESCE(SUM(CASE WHEN c.fecha_turno <= ? THEN r.diferencia ELSE 0 END), 0) as gal_base
            FROM gas_station_closeouts c
            JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
            LEFT JOIN products p ON r.product_id = p.id
            WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
            GROUP BY branch_id, fuel_key
        `, [dSplit, dSplit, dSplit, dSplit, dInicio, dFin]));

        (volRows || []).forEach(vr => {
            if (vr.fuel_key === 'other') return;
            const empCode = resolveStationEmpCode(vr.branch_id);
            const avgRecent = Number(vr.dias_recientes) > 0 ? Number(vr.gal_recientes) / Number(vr.dias_recientes) : 0;
            const avgBase = Number(vr.dias_base) > 0 ? Number(vr.gal_base) / Number(vr.dias_base) : avgRecent;
            volumeStatsMap[`${empCode}_${vr.fuel_key}`] = {
                avgRecent,
                avgBase
            };
        });
    } catch (_errVol) {
        // Fallback limpio si accountingDb está desconectado
    }

    const pickPrice = (row, fuel) => {
        const valA = Number(row[`${fuel}_a`] || 0);
        const valC = Number(row[`${fuel}_c`] || 0);
        return valA > 0 ? valA : valC;
    };

    const fuelsMeta = [
        { key: 'super', label: 'Súper' },
        { key: 'regular', label: 'Regular' },
        { key: 'diesel', label: 'Diésel' }
    ];

    const analisis = [];
    let oportunidadesCapturaCount = 0;
    let alertasFugaVolumenCount = 0;

    OFFICIAL_ESTACIONES.forEach(est => {
        const zoneRows = compRows.filter(r => resolveStationEmpCode(r.id_estacion) === est.id_empresa);
        const ownRow = zoneRows.find(r => Number(r.es_propia) === 1);
        const rivals = zoneRows.filter(r => Number(r.es_propia) !== 1);

        fuelsMeta.forEach(fm => {
            const sipePrice = ownRow ? pickPrice(ownRow, fm.key) : 0;
            const rivalPrices = rivals
                .map(rv => ({ name: rv.estacion, price: pickPrice(rv, fm.key) }))
                .filter(rv => rv.price > 0);

            if (sipePrice <= 0 && rivalPrices.length === 0) return;

            const avgRival = rivalPrices.length > 0
                ? rivalPrices.reduce((s, r) => s + r.price, 0) / rivalPrices.length
                : sipePrice;
            const minRivalObj = rivalPrices.length > 0
                ? rivalPrices.reduce((min, cur) => (cur.price < min.price ? cur : min), rivalPrices[0])
                : { name: 'Sin competidor más bajo', price: sipePrice };

            const gapUsd = sipePrice > 0 && avgRival > 0 ? (sipePrice - avgRival) : 0;
            const gapCentavos = Math.round(gapUsd * 1000) / 10; // ej. +2.5 centavos

            const volInfo = volumeStatsMap[`${est.id_empresa}_${fm.key}`] || { avgRecent: 0, avgBase: 0 };
            const varVolPct = volInfo.avgBase > 0
                ? Math.round(((volInfo.avgRecent - volInfo.avgBase) / volInfo.avgBase) * 1000) / 10
                : 0;

            let posicion = 'alineado';
            let recomendacion = 'Mantener precio actual; diferencial alineado con la zona.';
            if (gapUsd >= 0.02 && varVolPct < -3) {
                posicion = 'fuga_volumen';
                alertasFugaVolumenCount++;
                recomendacion = `Sobreprecio de +$${gapUsd.toFixed(2)}/gal coincide con caída de ${varVolPct}% en galonaje: evaluar igualar autoservicio.`;
            } else if (gapUsd <= -0.02 && varVolPct >= 0) {
                posicion = 'oportunidad_margen';
                oportunidadesCapturaCount++;
                recomendacion = `Precio $${Math.abs(gapUsd).toFixed(2)}/gal debajo del promedio zonal con demanda firme: margen para +$0.01/gal sin perder volumen.`;
            } else if (gapUsd >= 0.02 && varVolPct >= 0) {
                posicion = 'poder_marca';
                recomendacion = 'Demanda inelástica favorable: la estación sostiene volumen pese a diferencial positivo.';
            }

            analisis.push({
                id_estacion: est.id_empresa,
                estacion: est.titulo,
                combustible_key: fm.key,
                combustible: fm.label,
                precio_sipe_usd: Math.round(sipePrice * 100) / 100,
                precio_promedio_zona_usd: Math.round(avgRival * 100) / 100,
                precio_min_competidor_usd: Math.round(minRivalObj.price * 100) / 100,
                competidor_mas_barato: minRivalObj.name,
                diferencial_usd: Math.round(gapUsd * 1000) / 1000,
                diferencial_centavos: gapCentavos,
                galones_diarios_7d: Math.round(volInfo.avgRecent),
                galones_diarios_base: Math.round(volInfo.avgBase),
                variacion_volumen_pct: varVolPct,
                posicion,
                recomendacion
            });
        });
    });

    return {
        periodo_dias: windowDays,
        fecha_corte: dFin,
        resumen: {
            pares_analizados: analisis.length,
            alertas_fuga_volumen: alertasFugaVolumenCount,
            oportunidades_captura_margen: oportunidadesCapturaCount
        },
        elasticidad: analisis
    };
};

module.exports = {
    getRentabilidadPorEstacion,
    getElasticidadPreciosCompetencia
};
