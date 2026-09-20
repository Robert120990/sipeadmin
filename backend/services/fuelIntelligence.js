const { getExternalDb, withRetry } = require('../db');

/**
 * Normaliza fecha YYYY-MM-DD a formato DD/MM/YYYY usado en los cierres de turno
 */
const toSystemDate = (dStr) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length !== 3) return dStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

/**
 * 1. Obtiene la autonomía en horas y días de todos los tanques por estación
 */
const getTanquesAutonomia = async () => {
    const externalDb = await getExternalDb();

    // 1. Obtener lista de estaciones
    const [stations] = await withRetry(() => externalDb.query(
        "SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden"
    ));

    // 2. Obtener la última fecha registrada de lecturas de tanque
    const [maxFechaRows] = await withRetry(() => externalDb.query(
        "SELECT MAX(fecha) as last_date FROM lecturas_tanque"
    ));
    let lastDate = maxFechaRows[0]?.last_date;
    if (lastDate instanceof Date) {
        lastDate = lastDate.toISOString().split('T')[0];
    }
    if (!lastDate) {
        const today = new Date();
        lastDate = today.toISOString().split('T')[0];
    }

    // 3. Obtener lecturas más recientes de tanques
    const tankQuery = `
        SELECT a.id_empresa,
               b.codigo_producto,
               c.descripcion AS tanque_nombre,
               c.capacidad,
               c.galones_reserva,
               IF(c.tipo_combustible='M', 'I', c.tipo_combustible) as tipo_combustible,
               b.lectura as stock_actual
        FROM lecturas_tanque a
        INNER JOIN (
            SELECT id_empresa, fecha, MAX(turno) as max_turno
            FROM lecturas_tanque
            WHERE fecha = ?
            GROUP BY id_empresa, fecha
        ) m ON a.id_empresa = m.id_empresa AND a.fecha = m.fecha AND a.turno = m.max_turno
        INNER JOIN detalle_lecturas_tanque b ON a.id = b.id_lectura AND a.id_empresa = b.id_empresa
        INNER JOIN tanques c ON b.codigo_producto = c.id AND b.id_empresa = c.id_empresa
        WHERE a.fecha = ?
    `;
    const [tankRows] = await withRetry(() => externalDb.query(tankQuery, [lastDate, lastDate]));

    // 4. Calcular el consumo promedio diario de los últimos 7 días
    const dates7d = [];
    const baseD = new Date(lastDate + 'T12:00:00');
    for (let i = 1; i <= 7; i++) {
        const d = new Date(baseD);
        d.setDate(d.getDate() - i);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        dates7d.push(`${day}/${month}/${year}`);
    }

    const [consumptionRows] = await withRetry(() => externalDb.query(`
        SELECT a.id_empresa,
               IF(a.id_empresa = '004' AND a.codigo_producto = '0007', 'I', LEFT(a.nom_producto, 1)) AS tipo_combustible,
               SUM(a.total) as total_7d
        FROM cierre_turno_lecturas a
        INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa = b.id_empresa
        WHERE b.fecha_turno IN (?)
        GROUP BY a.id_empresa, tipo_combustible
    `, [dates7d]));

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
        const stationName = station ? station.titulo : `Estación ${idEmpresa}`;

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

    // Ordenar primero los críticos, luego advertencias, luego por horas restantes ASC
    tanquesDetalle.sort((a, b) => {
        const weight = { critico: 0, advertencia: 1, optimo: 2 };
        if (weight[a.estado] !== weight[b.estado]) return weight[a.estado] - weight[b.estado];
        return a.horas_restantes - b.horas_restantes;
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
    const externalDb = await getExternalDb();

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

    const datesArray = [];
    let curr = new Date(dInicio + 'T12:00:00');
    const endDate = new Date(dFin + 'T12:00:00');
    while (curr <= endDate) {
        datesArray.push(toSystemDate(curr.toISOString().split('T')[0]));
        curr.setDate(curr.getDate() + 1);
    }

    // Ventas acumuladas de cierres
    const sqlVentas = `
        SELECT x.id_empresa, a.titulo as estacion, z.clasificacion as tipo,
               SUM(y.total) as venta_galones
        FROM cierre_turno x
        INNER JOIN cierre_turno_lecturas y ON x.id_empresa = y.id_empresa AND x.id = y.id_cierre_turno
        INNER JOIN cfg_combustibles z ON y.id_empresa = z.id_empresa AND y.id_producto = z.id_producto
        INNER JOIN web_consolidado a ON x.id_empresa = a.id_empresa
        WHERE x.fecha_turno IN (?) AND a.grupo = 'ESTACION'
        GROUP BY x.id_empresa, a.titulo, z.clasificacion, a.orden
        ORDER BY a.orden, z.clasificacion
    `;
    const [ventasRows] = await withRetry(() => externalDb.query(sqlVentas, [datesArray]));

    // Movimientos físicos de tanques (inicial, recargas, final)
    const sqlMovs = `
        SELECT a.id_empresa, a.fecha, a.turno, c.tipo_combustible,
               SUM(b.anterior) as anterior, SUM(b.recarga) as recarga, SUM(b.lectura) as lectura
        FROM lecturas_tanque a
        INNER JOIN detalle_lecturas_tanque b ON a.id_empresa = b.id_empresa AND a.id = b.id_lectura
        INNER JOIN tanques c ON a.id_empresa = c.id_empresa AND b.codigo_producto = c.id
        WHERE a.fecha BETWEEN ? AND ?
        GROUP BY a.id_empresa, c.tipo_combustible, a.fecha, a.turno
        ORDER BY a.id_empresa, a.fecha, a.turno
    `;
    const [movsRows] = await withRetry(() => externalDb.query(sqlMovs, [dInicio, dFin]));

    // Costos promedio de combustible para valorizar merma
    const [costosRows] = await withRetry(() => externalDb.query(
        "SELECT id_empresa, cod_producto, costo FROM combustibles_costos WHERE id IN (SELECT MAX(id) FROM combustibles_costos GROUP BY id_empresa, cod_producto)"
    ));
    const costMap = {};
    costosRows.forEach(c => {
        costMap[`${c.id_empresa}_${c.cod_producto}`] = Number(c.costo || 0);
    });

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
