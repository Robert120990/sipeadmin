const { getExternalDb, withRetry } = require('../db');

/**
 * Normaliza fecha YYYY-MM-DD a formato DD/MM/YYYY
 */
const toSystemDate = (dStr) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length !== 3) return dStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

/**
 * Obtiene el P&L y Rentabilidad Operativa por Estación de Servicio
 * @param {string} fechaDesde - YYYY-MM-DD
 * @param {string} fechaHasta - YYYY-MM-DD
 */
const getRentabilidadPorEstacion = async (fechaDesde, fechaHasta) => {
    const externalDb = await getExternalDb();

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

    const datesArray = [];
    let curr = new Date(dInicio + 'T12:00:00');
    const endDate = new Date(dFin + 'T12:00:00');
    while (curr <= endDate) {
        datesArray.push(toSystemDate(curr.toISOString().split('T')[0]));
        curr.setDate(curr.getDate() + 1);
    }

    // 1. Estaciones activas
    const [stations] = await withRetry(() => externalDb.query(
        "SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden"
    ));

    // 2. Ventas y galonaje de combustible por estación
    const sqlCombustibles = `
        SELECT a.id_empresa,
               IFNULL(SUM(b.total), 0.0) as total_galones,
               IFNULL(SUM(b.total * b.precio), 0.0) as venta_dolares,
               IFNULL(SUM(IF(d.clasificacion = 'D', b.total, 0.0)), 0.0) as galones_diesel,
               IFNULL(SUM(IF(d.clasificacion = 'R', b.total, 0.0)), 0.0) as galones_regular,
               IFNULL(SUM(IF(d.clasificacion = 'S', b.total, 0.0)), 0.0) as galones_super,
               IFNULL(SUM(IF(d.clasificacion = 'I', b.total, 0.0)), 0.0) as galones_ion
        FROM web_consolidado a
        LEFT JOIN cierre_turno_lecturas b ON a.id_empresa = b.id_empresa
        INNER JOIN cfg_combustibles d ON b.id_empresa = d.id_empresa AND b.id_producto = d.id_producto
        INNER JOIN cierre_turno c ON b.id_cierre_turno = c.id AND b.id_empresa = c.id_empresa
        WHERE c.fecha_turno IN (?) AND a.grupo = 'ESTACION'
        GROUP BY a.id_empresa
        ORDER BY a.orden
    `;
    const [combustiblesRows] = await withRetry(() => externalDb.query(sqlCombustibles, [datesArray]));

    // 3. Costos promedio de adquisición de combustible
    const [costosRows] = await withRetry(() => externalDb.query(
        "SELECT id_empresa, cod_producto, costo FROM combustibles_costos WHERE id IN (SELECT MAX(id) FROM combustibles_costos GROUP BY id_empresa, cod_producto)"
    ));
    const costMap = {};
    costosRows.forEach(c => {
        if (!costMap[c.id_empresa]) costMap[c.id_empresa] = {};
        costMap[c.id_empresa][c.cod_producto] = Number(c.costo || 0);
    });

    // 4. Ventas de Tienda de conveniencia
    const sqlTiendas = `
        SELECT a.id_empresa,
               IFNULL(SUM(b.monto), 0.0) as total_tienda
        FROM web_consolidado a
        LEFT JOIN ventas_tienda b ON a.id_empresa = b.id_empresa AND b.fecha BETWEEN ? AND ?
        WHERE a.grupo = 'TIENDA'
        GROUP BY a.id_empresa
    `;
    const [tiendasRows] = await withRetry(() => externalDb.query(sqlTiendas, [dInicio, dFin]));
    const tiendasMap = {};
    tiendasRows.forEach(t => {
        tiendasMap[t.id_empresa] = Number(t.total_tienda || 0);
    });

    // 5. Ventas de Lubricantes
    const sqlLubricantes = `
        SELECT a.id_empresa,
               IFNULL(SUM(b.precio_total), 0.0) as total_lubricantes
        FROM web_consolidado a
        LEFT JOIN inventario_lubricantes b ON a.id_empresa = b.id_empresa AND b.fecha_turno IN (?)
        WHERE a.grupo = 'ESTACION'
        GROUP BY a.id_empresa
    `;
    const [lubricantesRows] = await withRetry(() => externalDb.query(sqlLubricantes, [datesArray]));
    const lubricantesMap = {};
    lubricantesRows.forEach(l => {
        lubricantesMap[l.id_empresa] = Number(l.total_lubricantes || 0);
    });

    // 6. Gastos operativos registrados en turnos
    const sqlGastos = `
        SELECT a.id_empresa,
               IFNULL(SUM(b.valor), 0.0) as total_gastos
        FROM web_consolidado a
        LEFT JOIN cierre_turno_gastos b ON a.id_empresa = b.id_empresa
        INNER JOIN cierre_turno c ON b.id_cierre_turno = c.id AND b.id_empresa = c.id_empresa
        WHERE c.fecha_turno IN (?) AND a.grupo = 'ESTACION'
        GROUP BY a.id_empresa
    `;
    const [gastosRows] = await withRetry(() => externalDb.query(sqlGastos, [datesArray]));
    const gastosMap = {};
    gastosRows.forEach(g => {
        gastosMap[g.id_empresa] = Number(g.total_gastos || 0);
    });

    // Costos operativos fijos estimados adicionales por estación (energía eléctrica, personal, fletes)
    // Se prorratean unos $4,500 - $6,500 mensuales por estación típica
    const estimacionGastosFijosMensuales = 5500;
    const factorDias = datesArray.length / 30;
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

        const cD = (costMap[id] && costMap[id]['DIESEL']) || 3.10;
        const cR = (costMap[id] && costMap[id]['REGULAR']) || 3.35;
        const cS = (costMap[id] && costMap[id]['SUPER']) || 3.65;
        const cI = (costMap[id] && costMap[id]['IONDIESEL']) || 3.20;

        const costoCombustible = (gD * cD) + (gR * cR) + (gS * cS) + (gI * cI);
        const margenCombustible = ventaCombustible > 0 ? (ventaCombustible - costoCombustible) : (galonesTotal * 0.28); // Fallback razonable si no hay costos

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
        periodo: { desde: dInicio, hasta: dFin, dias: datesArray.length },
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
