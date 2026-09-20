const { getAccountingDb, withRetry } = require('../db');


/**
 * 1. Obtiene la autonomía en horas y días de todos los tanques por estación
 */
const getTanquesAutonomia = async () => {
    const accountingDb = await getAccountingDb();

    // 1. Obtener lista de estaciones con tanques
    const [stations] = await withRetry(() => accountingDb.query(
        "SELECT id as id_empresa, nombre as titulo FROM branches WHERE id IN (SELECT DISTINCT branch_id FROM gas_station_tanks) ORDER BY id"
    ));

    // 2. Obtener la última fecha registrada de cierres de estación cerrados
    const [maxFechaRows] = await withRetry(() => accountingDb.query(
        "SELECT MAX(fecha_turno) as last_date FROM gas_station_closeouts WHERE estado = 'cerrado'"
    ));
    let lastDate = maxFechaRows[0]?.last_date;
    if (lastDate instanceof Date) {
        lastDate = lastDate.toISOString().split('T')[0];
    }
    if (!lastDate) {
        const today = new Date();
        lastDate = today.toISOString().split('T')[0];
    }

    // 3. Obtener lecturas más recientes de tanques correspondientes a turnos cerrados
    const tankQuery = `
        SELECT 
            t.id as tank_id,
            t.branch_id as id_empresa,
            b.nombre as estacion,
            t.codigo as tanque_codigo,
            t.descripcion as tanque_nombre,
            t.capacidad,
            t.reserva as galones_reserva,
            CASE 
                WHEN t.tipo_combustible = 4 OR t.descripcion LIKE '%Ion%' THEN 'I'
                WHEN t.tipo_combustible = 3 OR t.descripcion LIKE '%Diesel%' THEN 'D'
                WHEN t.tipo_combustible = 2 OR t.descripcion LIKE '%Super%' THEN 'S'
                WHEN t.tipo_combustible = 1 OR t.descripcion LIKE '%Regular%' THEN 'R'
                ELSE 'D'
            END as tipo_combustible,
            COALESCE(lr.lectura_actual, 0) as stock_actual,
            c.fecha_turno as fecha_lectura
        FROM gas_station_tanks t
        JOIN branches b ON t.branch_id = b.id
        LEFT JOIN (
            SELECT tr.tank_id, tr.lectura_actual, tr.closeout_id
            FROM gas_station_closeout_tank_readings tr
            INNER JOIN (
                SELECT tr2.tank_id, MAX(tr2.closeout_id) as max_closeout_id
                FROM gas_station_closeout_tank_readings tr2
                JOIN gas_station_closeouts c2 ON tr2.closeout_id = c2.id
                WHERE c2.estado = 'cerrado'
                GROUP BY tr2.tank_id
            ) m ON tr.tank_id = m.tank_id AND tr.closeout_id = m.max_closeout_id
        ) lr ON t.id = lr.tank_id
        LEFT JOIN gas_station_closeouts c ON lr.closeout_id = c.id
        ORDER BY b.nombre, t.codigo
    `;
    const [tankRows] = await withRetry(() => accountingDb.query(tankQuery));

    // 4. Calcular el consumo promedio diario de los últimos 7 días considerando solo turnos cerrados
    const consumptionQuery = `
        SELECT id_empresa, tipo_combustible, SUM(diferencia) as total_7d
        FROM (
            SELECT 
                c.branch_id as id_empresa,
                CASE 
                    WHEN r.codigo_producto LIKE '%ION%' OR r.descripcion_producto LIKE '%ION%' OR p.tipo_combustible = 4 THEN 'I'
                    WHEN r.codigo_producto LIKE '%DIESEL%' OR r.descripcion_producto LIKE '%DIESEL%' OR p.tipo_combustible = 3 THEN 'D'
                    WHEN r.codigo_producto LIKE '%SUPER%' OR r.descripcion_producto LIKE '%SUPER%' OR p.tipo_combustible = 2 THEN 'S'
                    WHEN r.codigo_producto LIKE '%REGULAR%' OR r.descripcion_producto LIKE '%REGULAR%' OR p.tipo_combustible = 1 THEN 'R'
                    ELSE 'D'
                END as tipo_combustible,
                r.diferencia
            FROM gas_station_closeouts c
            JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
            LEFT JOIN products p ON r.product_id = p.id
            WHERE c.estado = 'cerrado' AND c.fecha_turno >= DATE_SUB(?, INTERVAL 7 DAY)
        ) sub
        GROUP BY id_empresa, tipo_combustible
    `;
    const [consumptionRows] = await withRetry(() => accountingDb.query(consumptionQuery, [lastDate]));

    const consumptionMap = {};
    consumptionRows.forEach(r => {
        const key = `${r.id_empresa}_${r.tipo_combustible}`;
        consumptionMap[key] = (Number(r.total_7d || 0) / 7);
    });

    const combustiblesNombres = {
        'S': 'Súper',
        'R': 'Regular',
        'D': 'Diésel',
        'I': 'Ion Diésel'
    };

    let totalCapacidadGrupo = 0;
    let totalStockGrupo = 0;
    let tanquesCriticosCount = 0;

    const tanquesDetalle = [];

    tankRows.forEach(t => {
        const idEmpresa = t.id_empresa;
        const tipo = t.tipo_combustible;
        const station = stations.find(s => String(s.id_empresa) === String(idEmpresa));
        const stationName = t.estacion || (station ? station.titulo : `Estación ${idEmpresa}`);

        const capacidad = Number(t.capacidad || 0);
        const reserva = Number(t.galones_reserva || 0);
        const stockActual = Number(t.stock_actual || 0);
        const stockUtil = Math.max(0, stockActual - reserva);
        const espacioLibreUllage = Math.max(0, capacidad - stockActual);

        const consumoPromDiario = consumptionMap[`${idEmpresa}_${tipo}`] || 0;
        const consumoPorHora = consumoPromDiario > 0 ? (consumoPromDiario / 24) : 0;

        let horasRestantes = 999;
        let diasRestantes = 99;
        if (consumoPorHora > 0) {
            horasRestantes = Math.round((stockUtil / consumoPorHora) * 10) / 10;
            diasRestantes = Math.round((stockUtil / consumoPromDiario) * 10) / 10;
        }

        const porcentajeOcupacion = capacidad > 0 ? Math.round((stockActual / capacidad) * 100) : 0;

        let estado = 'optimo'; // optimo (>48h), advertencia (24-48h), critico (<24h)
        if (horasRestantes < 24) {
            estado = 'critico';
            tanquesCriticosCount++;
        } else if (horasRestantes < 48) {
            estado = 'advertencia';
        }

        totalCapacidadGrupo += capacidad;
        totalStockGrupo += stockActual;

        tanquesDetalle.push({
            id_empresa: idEmpresa,
            estacion: stationName,
            tanque_id: t.codigo_producto,
            tanque_nombre: t.tanque_nombre || `${combustiblesNombres[tipo] || tipo} Tanque`,
            tipo_combustible: tipo,
            nombre_combustible: combustiblesNombres[tipo] || tipo,
            capacidad,
            reserva,
            stock_actual: stockActual,
            stock_util: stockUtil,
            espacio_libre_ullage: espacioLibreUllage,
            consumo_diario_estimado: Math.round(consumoPromDiario),
            consumo_hora_estimado: Math.round(consumoPorHora * 10) / 10,
            horas_restantes: horasRestantes,
            dias_restantes: diasRestantes,
            porcentaje_ocupacion: porcentajeOcupacion,
            estado,
            fecha_lectura: lastDate
        });
    });

    // Ordenar por estación ASC y luego por nivel de ocupación ASC
    tanquesDetalle.sort((a, b) => {
        const cmpEstacion = (a.estacion || '').localeCompare(b.estacion || '', 'es', { numeric: true });
        if (cmpEstacion !== 0) return cmpEstacion;
        return (a.porcentaje_ocupacion || 0) - (b.porcentaje_ocupacion || 0);
    });

    return {
        fecha_corte: lastDate,
        resumen: {
            total_tanques: tanquesDetalle.length,
            tanques_criticos: tanquesCriticosCount,
            tanques_advertencia: tanquesDetalle.filter(t => t.estado === 'advertencia').length,
            capacidad_total_galones: totalCapacidadGrupo,
            stock_total_galones: totalStockGrupo,
            porcentaje_ocupacion_global: totalCapacidadGrupo > 0 ? Math.round((totalStockGrupo / totalCapacidadGrupo) * 100) : 0
        },
        tanques: tanquesDetalle
    };
};

/**
 * 2. Simulador y Recomendador de Compra Pre-DGEHM
 * @param {Object} params - { variaciones: { S: +0.08, R: +0.06, D: +0.10, I: +0.10 }, fecha_cambio }
 */
const calcularSimuladorDGEHM = async (params = {}) => {
    const { variaciones = { S: 0.08, R: 0.06, D: 0.10, I: 0.10 } } = params;
    const autonomia = await getTanquesAutonomia();

    let gananciaOportunidadTotal = 0;
    let galonesSugeridosTotales = 0;

    const recomendacionesPorEstacion = {};

    autonomia.tanques.forEach(t => {
        const varPrecio = parseFloat(variaciones[t.tipo_combustible] || 0);
        const ullage = t.espacio_libre_ullage;

        // Si el precio SUBE: Sugerir llenar tanque al máximo seguro (90% capacidad o ullage disponible)
        // Si el precio BAJA: Sugerir pedir solo lo justo para cubrir consumo hasta la fecha de cambio
        let galonesRecomendados = 0;
        let impactoFinanciero = 0;
        let recomendacionTexto = '';

        if (varPrecio > 0) {
            // El precio subirá: Llenar tanque anticipadamente
            galonesRecomendados = Math.max(0, Math.floor(ullage * 0.95)); // Dejar 5% de holgura de seguridad
            impactoFinanciero = galonesRecomendados * varPrecio; // Ganancia neta por comprar barato y vender a precio nuevo
            recomendacionTexto = `Comprar anticipadamente antes del aumento de $${varPrecio.toFixed(2)}/gal.`;
            gananciaOportunidadTotal += impactoFinanciero;
        } else if (varPrecio < 0) {
            // El precio bajará: Minimizar inventario para no devaluarse
            const consumo2Dias = t.consumo_diario_estimado * 2;
            const faltantePara2Dias = Math.max(0, consumo2Dias - t.stock_util);
            galonesRecomendados = Math.min(faltantePara2Dias, ullage);
            impactoFinanciero = Math.abs(t.stock_actual * varPrecio); // Pérdida evitada o costo de devaluación
            recomendacionTexto = `Comprar solo el mínimo de supervivencia (${galonesRecomendados} gal) para esperar precio a la baja.`;
        } else {
            galonesRecomendados = Math.max(0, Math.floor(ullage * 0.70));
            recomendacionTexto = 'Precio estable. Mantener nivel de reposición estándar.';
        }

        galonesSugeridosTotales += galonesRecomendados;

        if (!recomendacionesPorEstacion[t.id_empresa]) {
            recomendacionesPorEstacion[t.id_empresa] = {
                id_empresa: t.id_empresa,
                estacion: t.estacion,
                total_galones_sugeridos: 0,
                ganancia_proyectada: 0,
                tanques: []
            };
        }

        recomendacionesPorEstacion[t.id_empresa].total_galones_sugeridos += galonesRecomendados;
        recomendacionesPorEstacion[t.id_empresa].ganancia_proyectada += (varPrecio > 0 ? impactoFinanciero : 0);

        recomendacionesPorEstacion[t.id_empresa].tanques.push({
            tanque: t.tanque_nombre,
            combustible: t.nombre_combustible,
            tipo_combustible: t.tipo_combustible,
            stock_actual: t.stock_actual,
            ullage: ullage,
            horas_restantes: t.horas_restantes,
            variacion_dgehm: varPrecio,
            galones_sugeridos: galonesRecomendados,
            impacto_financiero: Math.round(impactoFinanciero * 100) / 100,
            recomendacion: recomendacionTexto
        });
    });

    return {
        variaciones_aplicadas: variaciones,
        resumen_ejecutivo: {
            ganancia_oportunidad_usd: Math.round(gananciaOportunidadTotal * 100) / 100,
            galones_totales_sugeridos: galonesSugeridosTotales,
            accion_principal: gananciaOportunidadTotal > 0
                ? `Oportunidad de captura de margen: Ganancia proyectada de $${gananciaOportunidadTotal.toFixed(2)} USD comprando antes del cambio oficial.`
                : 'Minimizar pedidos para mitigar pérdidas por devaluación de inventario en tanque.',
            estrategia_flete: `Requerirá aproximadamente ${Math.ceil(galonesSugeridosTotales / 8500)} viajes de pipa (capacidad estándar 8,500 gal).`
        },
        estaciones: Object.values(recomendacionesPorEstacion)
    };
};

/**
 * 3. Auditoría de Mermas y Fugas en Pista
 * Compara variaciones entre inventario físico (vara/sensor) y ventas teóricas
 */
const getAuditoriaMermas = async (desde, hasta) => {
    const accountingDb = await getAccountingDb();

    // Si no se reciben fechas, tomar últimos 7 días
    let dFin = hasta;
    let dInicio = desde;
    if (!dFin || !dInicio) {
        const now = new Date();
        dFin = now.toISOString().split('T')[0];
        const prev = new Date(now);
        prev.setDate(prev.getDate() - 7);
        dInicio = prev.toISOString().split('T')[0];
    }

    // Ventas acumuladas de cierres
    const sqlVentas = `
        SELECT c.branch_id as id_empresa, b.nombre as estacion,
               CASE 
                   WHEN r.codigo_producto LIKE '%ION%' OR r.descripcion_producto LIKE '%ION%' OR p.tipo_combustible = 4 THEN 'I'
                   WHEN r.codigo_producto LIKE '%DIESEL%' OR r.descripcion_producto LIKE '%DIESEL%' OR p.tipo_combustible = 3 THEN 'D'
                   WHEN r.codigo_producto LIKE '%SUPER%' OR r.descripcion_producto LIKE '%SUPER%' OR p.tipo_combustible = 2 THEN 'S'
                   WHEN r.codigo_producto LIKE '%REGULAR%' OR r.descripcion_producto LIKE '%REGULAR%' OR p.tipo_combustible = 1 THEN 'R'
                   ELSE 'D'
               END as tipo,
               SUM(r.diferencia) as venta_galones
        FROM gas_station_closeouts c
        JOIN branches b ON c.branch_id = b.id
        JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
        LEFT JOIN products p ON r.product_id = p.id
        WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
        GROUP BY c.branch_id, b.nombre, tipo
        ORDER BY c.branch_id, tipo
    `;
    const [ventasRows] = await withRetry(() => accountingDb.query(sqlVentas, [dInicio, dFin]));

    // Movimientos físicos de tanques (inicial, recargas, final)
    const sqlMovs = `
        SELECT 
            c.branch_id as id_empresa,
            b.nombre as estacion,
            CASE 
                WHEN t.tipo_combustible = 4 OR t.descripcion LIKE '%Ion%' THEN 'I'
                WHEN t.tipo_combustible = 3 OR t.descripcion LIKE '%Diesel%' THEN 'D'
                WHEN t.tipo_combustible = 2 OR t.descripcion LIKE '%Super%' THEN 'S'
                WHEN t.tipo_combustible = 1 OR t.descripcion LIKE '%Regular%' THEN 'R'
                ELSE 'D'
            END as tipo_combustible,
            SUM(tr.recarga) as recarga,
            CAST(SUBSTRING_INDEX(GROUP_CONCAT(tr.lectura_anterior ORDER BY c.fecha_turno ASC, c.numero_turno ASC SEPARATOR ','), ',', 1) AS DECIMAL(14,5)) as anterior,
            CAST(SUBSTRING_INDEX(GROUP_CONCAT(tr.lectura_actual ORDER BY c.fecha_turno DESC, c.numero_turno DESC SEPARATOR ','), ',', 1) AS DECIMAL(14,5)) as lectura
        FROM gas_station_closeouts c
        JOIN branches b ON c.branch_id = b.id
        JOIN gas_station_closeout_tank_readings tr ON c.id = tr.closeout_id
        JOIN gas_station_tanks t ON tr.tank_id = t.id
        WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
        GROUP BY c.branch_id, b.nombre, tipo_combustible
        ORDER BY c.branch_id, tipo_combustible
    `;
    const [movsRows] = await withRetry(() => accountingDb.query(sqlMovs, [dInicio, dFin]));

    // Costos promedio de combustible para valorizar merma
    const costMap = {
        'S': 3.65,
        'R': 3.35,
        'D': 3.10,
        'I': 3.20
    };
    try {
        const [costosRows] = await withRetry(() => accountingDb.query(`
            SELECT 
                CASE 
                    WHEN tipo_combustible = 4 THEN 'I'
                    WHEN tipo_combustible = 3 THEN 'D'
                    WHEN tipo_combustible = 2 THEN 'S'
                    WHEN tipo_combustible = 1 THEN 'R'
                    ELSE 'D'
                END as tipo,
                AVG(costo) as costo
            FROM products
            WHERE tipo_combustible > 0 AND costo > 0
            GROUP BY tipo
        `));
        costosRows.forEach(c => {
            if (c.tipo && Number(c.costo) > 0) {
                costMap[c.tipo] = Number(c.costo);
            }
        });
    } catch (e) {
        // Fallback ya configurado en costMap
    }

    const combustiblesCodigos = {
        'S': 'SUPER',
        'R': 'REGULAR',
        'D': 'DIESEL',
        'I': 'IONDIESEL'
    };

    const combustiblesNombres = {
        'S': 'Súper',
        'R': 'Regular',
        'D': 'Diésel',
        'I': 'Ion Diésel'
    };

    let totalGalonesMerma = 0;
    let totalCostoMermaUsd = 0;
    let alertasCriticas = 0;

    const mermasDetalle = ventasRows.map(fila => {
        const findRows = movsRows.filter(m => String(m.id_empresa) === String(fila.id_empresa) && String(m.tipo_combustible) === String(fila.tipo));
        let inicial = 0.0;
        let final = 0.0;
        if (findRows.length > 0) {
            inicial = Number(findRows[0].anterior) || 0.0;
            final = Number(findRows[findRows.length - 1].lectura) || 0.0;
        }
        const recargas = findRows.reduce((sum, currRow) => sum + (Number(currRow.recarga) || 0), 0);
        const venta = Number(fila.venta_galones || 0);
        const inventarioTeorico = inicial + recargas - venta;
        const diferenciaGalones = final - inventarioTeorico; // Negativo = Faltante / Merma

        const porcentajeMerma = venta > 0 ? (diferenciaGalones / venta) * 100 : 0;
        const porcentajeAbs = Math.abs(porcentajeMerma);

        // Umbrales de merma: Normal (-0.25% a +0.25%), Alerta (0.25% - 0.50%), Crítico (>0.50%)
        let estado = 'normal';
        let severidad = 'verde';
        if (porcentajeAbs > 0.50) {
            estado = 'critico';
            severidad = 'rojo';
            alertasCriticas++;
        } else if (porcentajeAbs > 0.25) {
            estado = 'advertencia';
            severidad = 'amarillo';
        }

        const codProd = combustiblesCodigos[fila.tipo] || 'REGULAR';
        const costoGalon = costMap[`${fila.id_empresa}_${codProd}`] || 3.50; // fallback $3.50
        const impactoMonetario = diferenciaGalones * costoGalon;

        if (diferenciaGalones < 0) {
            totalGalonesMerma += Math.abs(diferenciaGalones);
            totalCostoMermaUsd += Math.abs(impactoMonetario);
        }

        return {
            id_empresa: fila.id_empresa,
            estacion: fila.estacion,
            tipo_combustible: fila.tipo,
            nombre_combustible: combustiblesNombres[fila.tipo] || fila.tipo,
            inicial: Math.round(inicial),
            recargas: Math.round(recargas),
            venta: Math.round(venta),
            final_fisico: Math.round(final),
            teorico: Math.round(inventarioTeorico),
            diferencia_galones: Math.round(diferenciaGalones * 10) / 10,
            porcentaje_variacion: Math.round(porcentajeMerma * 100) / 100,
            costo_unitario_estimado: costoGalon,
            impacto_usd: Math.round(impactoMonetario * 100) / 100,
            estado,
            severidad,
            recomendacion: estado === 'critico'
                ? 'Enviar técnico de calibración o realizar prueba de hermeticidad con serafín de inmediato.'
                : estado === 'advertencia'
                    ? 'Monitorear turnos siguientes para confirmar si es variación térmica o fuga leve.'
                    : 'Variación dentro de tolerancia física y reglamentaria.'
        };
    });

    return {
        periodo: { desde: dInicio, hasta: dFin },
        resumen: {
            total_galones_perdidos: Math.round(totalGalonesMerma),
            costo_total_perdida_usd: Math.round(totalCostoMermaUsd * 100) / 100,
            alertas_criticas: alertasCriticas,
            estatus_general: alertasCriticas > 0 ? 'ATENCIÓN REQUERIDA' : 'CONTROL OPERATIVO ADECUADO'
        },
        auditorias: mermasDetalle
    };
};

module.exports = {
    getTanquesAutonomia,
    calcularSimuladorDGEHM,
    getAuditoriaMermas
};
