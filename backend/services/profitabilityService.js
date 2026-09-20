const { getAccountingDb, withRetry } = require('../db');

/**
 * Obtiene el P&L y Rentabilidad Operativa por Estación de Servicio
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

    // 1. Estaciones activas con infraestructura de tanques
    const [stations] = await withRetry(() => accountingDb.query(
        "SELECT id as id_empresa, nombre as titulo FROM branches WHERE id IN (SELECT DISTINCT branch_id FROM gas_station_tanks) ORDER BY id"
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
        WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
        GROUP BY b.id
        ORDER BY b.id
    `;
    const [combustiblesRows] = await withRetry(() => accountingDb.query(sqlCombustibles, [dInicio, dFin]));

    // 3. Costos promedio de combustible desde catálogo
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
    } catch (e) {
        // Fallback default
    }

    // 4. Ventas de Tienda de conveniencia (sales_headers POS en la sucursal)
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
    } catch (e) {
        // Si no hay ventas de tienda registradas
    }

    // 5. Ventas de Lubricantes en cierres de pista cerrados
    const lubricantesMap = {};
    try {
        const sqlLubricantes = `
            SELECT c.branch_id as id_empresa, COALESCE(SUM(l.total), 0.0) as total_lubricantes
            FROM gas_station_closeouts c
            JOIN gas_station_closeout_lubricant_readings l ON c.id = l.closeout_id
            WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
            GROUP BY c.branch_id
        `;
        const [lubricantesRows] = await withRetry(() => accountingDb.query(sqlLubricantes, [dInicio, dFin]));
        lubricantesRows.forEach(l => {
            lubricantesMap[l.id_empresa] = Number(l.total_lubricantes || 0);
        });
    } catch (e) {
        // Si no hay lubricantes registrados
    }

    // 6. Gastos operativos registrados en turnos cerrados
    const sqlGastos = `
        SELECT c.branch_id as id_empresa, COALESCE(SUM(e.valor), 0.0) as total_gastos
        FROM gas_station_closeouts c
        JOIN gas_station_closeout_expenses e ON c.id = e.closeout_id
        WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
        GROUP BY c.branch_id
    `;
    const [gastosRows] = await withRetry(() => accountingDb.query(sqlGastos, [dInicio, dFin]));
    const gastosMap = {};
    gastosRows.forEach(g => {
        gastosMap[g.id_empresa] = Number(g.total_gastos || 0);
    });

    // Costos operativos fijos estimados adicionales por estación (energía eléctrica, personal, fletes)
    const estimacionGastosFijosMensuales = 5500;
    const factorDias = numDias / 30;
    const gastosFijosPeriodo = estimacionGastosFijosMensuales * factorDias;

    let granTotalGalones = 0;
    let granTotalIngresos = 0;
    let granTotalMargenBruto = 0;
    let granTotalUtilidadNeta = 0;

    const reporteEstaciones = stations.map(s => {
        const id = s.id_empresa;
        const rowC = combustiblesRows.find(c => String(c.id_empresa) === String(id)) || {};

        const galonesTotal = Number(rowC.total_galones || 0);
        const ventaCombustible = Number(rowC.venta_dolares || 0);

        const gD = Number(rowC.galones_diesel || 0);
        const gR = Number(rowC.galones_regular || 0);
        const gS = Number(rowC.galones_super || 0);
        const gI = Number(rowC.galones_ion || 0);

        const cD = costMap['DIESEL'] || 3.10;
        const cR = costMap['REGULAR'] || 3.35;
        const cS = costMap['SUPER'] || 3.65;
        const cI = costMap['IONDIESEL'] || 3.20;

        const costoCombustible = (gD * cD) + (gR * cR) + (gS * cS) + (gI * cI);
        const margenCombustible = ventaCombustible > 0 ? (ventaCombustible - costoCombustible) : (galonesTotal * 0.28);

        // Tiendas (Margen comercial promedio 24%)
        const ventaTienda = tiendasMap[id] || 0;
        const margenTienda = ventaTienda * 0.24;

        // Lubricantes (Margen comercial promedio 30%)
        const ventaLubricantes = lubricantesMap[id] || 0;
        const margenLubricantes = ventaLubricantes * 0.30;

        const totalIngresosEstacion = ventaCombustible + ventaTienda + ventaLubricantes;
        const totalMargenBruto = margenCombustible + margenTienda + margenLubricantes;

        const gastosVariablesPista = gastosMap[id] || 0;
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

        let clasificacion = 'rentable';
        if (utilidadOperativaNeta < 0) {
            clasificacion = 'en_perdida';
        } else if (utilidadOperativaNeta > 15000 * factorDias) {
            clasificacion = 'estrella';
        }

        return {
            id_empresa: id,
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
            margen_neto_promedio_galon: granTotalGalones > 0 ? Math.round((granTotalUtilidadNeta / granTotalGalones) * 1000) / 1000 : 0,
            estaciones_estrella: reporteEstaciones.filter(e => e.clasificacion === 'estrella').length,
            estaciones_en_perdida: reporteEstaciones.filter(e => e.clasificacion === 'en_perdida').length
        },
        estaciones: reporteEstaciones
    };
};

module.exports = {
    getRentabilidadPorEstacion
};
