const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    getInstalacionesSolares,
    getSolarAhorroDiario,
    getSolarAhorroMensual,
    getSolarAhorroRango,
    getSolarEstadoActual,
    matchesStation
} = require('../services/solarEnergyService');

describe('Solar Energy & Storage Service Unit Tests', () => {

    describe('matchesStation', () => {
        it('debe reconocer nombres y alias flexibles: andelsa, planta andelsa, san martin, la loma', () => {
            const instAndelsa = { id: 1, branch_id: 9, id_empresa: 'ANDELSA', estacion_nombre: 'Andelsa' };
            const instSanMartin = { id: 2, branch_id: 1, id_empresa: '014', estacion_nombre: 'San Martín (La Loma)' };

            // Andelsa
            assert.strictEqual(matchesStation(instAndelsa, 'andelsa'), true);
            assert.strictEqual(matchesStation(instAndelsa, 'planta andelsa'), true);
            assert.strictEqual(matchesStation(instAndelsa, 'ANDELSA'), true);
            assert.strictEqual(matchesStation(instAndelsa, 9), true);
            assert.strictEqual(matchesStation(instSanMartin, 'andelsa'), false);

            // San Martín (La Loma)
            assert.strictEqual(matchesStation(instSanMartin, 'san martin'), true);
            assert.strictEqual(matchesStation(instSanMartin, 'san martín'), true);
            assert.strictEqual(matchesStation(instSanMartin, 'la loma'), true);
            assert.strictEqual(matchesStation(instSanMartin, 'loma'), true);
            assert.strictEqual(matchesStation(instSanMartin, '014'), true);
            assert.strictEqual(matchesStation(instSanMartin, 1), true);
            assert.strictEqual(matchesStation(instAndelsa, 'san martin'), false);
        });
    });

    describe('getInstalacionesSolares', () => {
        it('debe listar las 2 ubicaciones con paneles (Andelsa 55 kWp, San Martín 40 kWp) y 1 con batería BESS (Andelsa 60 kWh)', async () => {
            const result = await getInstalacionesSolares();
            assert.ok(result);
            assert.ok(Array.isArray(result.instalaciones));
            assert.ok(Array.isArray(result.instalaciones_con_paneles));
            assert.ok(Array.isArray(result.instalaciones_con_baterias));

            // Verificar conteos exactos de la red SIPE / Nova SaaS
            assert.strictEqual(result.instalaciones_con_paneles.length, 2, 'Debe haber exactamente 2 estaciones con paneles solares');
            assert.strictEqual(result.instalaciones_con_baterias.length, 1, 'Debe haber exactamente 1 estación con sistema de batería BESS');

            // Verificar resumen consolidado
            assert.strictEqual(result.resumen.total_ubicaciones_solares, 2);
            assert.strictEqual(result.resumen.total_ubicaciones_baterias, 1);
            assert.strictEqual(result.resumen.potencia_total_kwp, 95.0, 'Potencia total instalada debe ser 95 kWp (55 Andelsa + 40 San Martín)');
            assert.strictEqual(result.resumen.capacidad_total_bateria_kwh, 60.0, 'Capacidad total de batería BESS debe ser 60 kWh (Andelsa)');

            // Estaciones específicas
            const nombresPaneles = result.instalaciones_con_paneles.map(i => i.estacion_nombre);
            assert.ok(nombresPaneles.includes('Andelsa'));
            assert.ok(nombresPaneles.includes('San Martín (La Loma)'));

            const nombresBaterias = result.instalaciones_con_baterias.map(i => i.estacion_nombre);
            assert.ok(nombresBaterias.includes('Andelsa'));
        });
    });

    describe('getSolarAhorroDiario', () => {
        it('debe calcular ahorro en USD y poblar siempre ambas variantes (dual naming) sin dar $0.00', async () => {
            const fechaTest = '2026-10-12';
            const data = await getSolarAhorroDiario(fechaTest);

            assert.ok(data);
            assert.strictEqual(data.fecha, fechaTest);

            // Verificación dual naming estricta
            assert.strictEqual(data.ahorro_total_usd, data.total_ahorro_usd);
            assert.strictEqual(data.generacion_total_kwh, data.total_generacion_kwh);
            assert.strictEqual(data.autoconsumo_total_kwh, data.total_autoconsumo_kwh);
            assert.strictEqual(data.bateria_descarga_total_kwh, data.total_bateria_descarga_kwh);
            assert.strictEqual(data.co2_evitado_total_kg, data.total_co2_evitado_kg);

            // Generación y autoconsumo
            assert.ok(data.generacion_total_kwh > 0, 'La generación solar diaria debe ser mayor a 0 kWh');
            assert.ok(data.autoconsumo_total_kwh > 0, 'El autoconsumo diario debe ser mayor a 0 kWh');
            assert.ok(data.autoconsumo_total_kwh <= data.generacion_total_kwh, 'Autoconsumo no puede exceder generación');

            // Batería y ahorro
            assert.ok(data.bateria_descarga_total_kwh >= 0, 'Descarga de batería debe ser no negativa');
            assert.ok(data.ahorro_total_usd > 0, 'El ahorro total en USD debe ser estrictamente positivo');
            assert.ok(data.total_ahorro_usd > 0, 'total_ahorro_usd debe ser estrictamente positivo (nunca $0.00)');
            assert.ok(data.co2_evitado_total_kg > 0, 'El CO2 evitado debe ser positivo');

            // Desglose por estación
            assert.strictEqual(data.total_estaciones_activas, 2);
            assert.strictEqual(data.desglose_por_estacion.length, 2);

            const andelsa = data.desglose_por_estacion.find(e => e.estacion_nombre === 'Andelsa');
            assert.ok(andelsa, 'Andelsa debe estar presente en el desglose');
            assert.strictEqual(andelsa.tiene_baterias, 1);
            assert.ok(andelsa.ahorro_usd > 0);
            assert.strictEqual(andelsa.ahorro_usd, andelsa.total_ahorro_usd);

            const sanMartin = data.desglose_por_estacion.find(e => e.estacion_nombre.includes('San Martín'));
            assert.ok(sanMartin, 'San Martín debe estar presente en el desglose');
            assert.strictEqual(sanMartin.tiene_baterias, 0);
            assert.strictEqual(sanMartin.bateria_descarga_kwh, 0);
            assert.ok(sanMartin.ahorro_usd > 0);
        });

        it('debe filtrar correctamente por estación específica: Andelsa', async () => {
            const data = await getSolarAhorroDiario('2026-10-12', 'andelsa');
            assert.ok(data);
            assert.strictEqual(data.total_estaciones_activas, 1);
            assert.strictEqual(data.desglose_por_estacion[0].id_empresa, 'ANDELSA');
            assert.strictEqual(data.desglose_por_estacion[0].estacion_nombre, 'Andelsa');
            assert.ok(data.total_ahorro_usd > 0, 'Ahorro de Andelsa debe ser mayor a $0');
        });

        it('debe filtrar correctamente por estación específica: San Martín (La Loma)', async () => {
            const data = await getSolarAhorroDiario('2026-10-12', 'la loma');
            assert.ok(data);
            assert.strictEqual(data.total_estaciones_activas, 1);
            assert.strictEqual(data.desglose_por_estacion[0].id_empresa, '014');
            assert.strictEqual(data.desglose_por_estacion[0].estacion_nombre, 'San Martín (La Loma)');
            assert.ok(data.total_ahorro_usd > 0, 'Ahorro de San Martín debe ser mayor a $0');
        });

        it('debe tomar la fecha actual por defecto ante fecha nula o vacía', async () => {
            const data = await getSolarAhorroDiario(null);
            assert.ok(data);
            const hoy = new Date().toISOString().split('T')[0];
            assert.strictEqual(data.fecha, hoy);
            assert.ok(data.ahorro_total_usd > 0);
            assert.ok(data.total_ahorro_usd > 0);
        });
    });

    describe('getSolarAhorroMensual', () => {
        it('debe calcular la acumulación del mes con dual naming y promedios coherentes', async () => {
            const anio = 2026;
            const mes = 10;
            const mensual = await getSolarAhorroMensual(anio, mes);

            assert.ok(mensual);
            assert.strictEqual(mensual.anio, 2026);
            assert.strictEqual(mensual.mes, 10);
            assert.strictEqual(mensual.periodo, '2026-10');
            assert.strictEqual(mensual.dias_totales_mes, 31);
            assert.ok(mensual.dias_transcurridos > 0);
            assert.ok(mensual.dias_transcurridos <= 31);

            // Dual naming
            assert.strictEqual(mensual.ahorro_total_usd, mensual.total_ahorro_usd);
            assert.strictEqual(mensual.generacion_total_kwh, mensual.total_generacion_kwh);
            assert.strictEqual(mensual.autoconsumo_total_kwh, mensual.total_autoconsumo_kwh);

            // Métricas de acumulación y promedio
            assert.ok(mensual.ahorro_total_usd > 0, 'Ahorro acumulado mensual debe ser positivo');
            assert.ok(mensual.total_ahorro_usd > 0, 'total_ahorro_usd debe ser positivo');
            assert.ok(mensual.promedio_diario_ahorro_usd > 0, 'Promedio diario debe ser positivo');
            assert.ok(mensual.generacion_total_kwh > 0, 'Generación acumulada debe ser positiva');
            assert.ok(mensual.autoconsumo_total_kwh > 0);

            // Verificación matemática del promedio
            const promedioEsperado = Number((mensual.ahorro_total_usd / mensual.dias_transcurridos).toFixed(2));
            assert.strictEqual(mensual.promedio_diario_ahorro_usd, promedioEsperado);

            // Desglose e histórico
            assert.ok(Array.isArray(mensual.historico_diario));
            assert.strictEqual(mensual.historico_diario.length, mensual.dias_transcurridos);
            assert.strictEqual(mensual.desglose_por_estacion.length, 2);
        });

        it('debe acumular correctamente meses pasados completos (ej. septiembre 2026: 30 días)', async () => {
            const mensual = await getSolarAhorroMensual(2026, 9);
            assert.strictEqual(mensual.dias_totales_mes, 30);
            assert.strictEqual(mensual.historico_diario.length, mensual.dias_transcurridos);
            assert.ok(mensual.dias_transcurridos > 0);
            assert.ok(mensual.ahorro_total_usd > 0);
            assert.ok(mensual.total_ahorro_usd > 0);
        });
    });

    describe('getSolarAhorroRango', () => {
        it('debe validar fechas y calcular el ahorro exacto entre fechas con dual naming', async () => {
            const dInicio = '2026-10-01';
            const dFin = '2026-10-10';
            const rango = await getSolarAhorroRango(dInicio, dFin);

            assert.ok(rango);
            assert.strictEqual(rango.fecha_inicio, dInicio);
            assert.strictEqual(rango.fecha_fin, dFin);
            assert.strictEqual(rango.dias_analizados, 10);
            assert.strictEqual(rango.historico_diario.length, 10);

            // Dual naming
            assert.strictEqual(rango.ahorro_total_usd, rango.total_ahorro_usd);
            assert.strictEqual(rango.generacion_total_kwh, rango.total_generacion_kwh);
            assert.strictEqual(rango.autoconsumo_total_kwh, rango.total_autoconsumo_kwh);

            assert.ok(rango.ahorro_total_usd > 0);
            assert.ok(rango.total_ahorro_usd > 0);
            assert.ok(rango.promedio_diario_ahorro_usd > 0);
            assert.ok(rango.generacion_total_kwh > 0);
            assert.ok(rango.co2_evitado_total_kg > 0);

            // Cronología ascendente en historico_diario
            assert.strictEqual(rango.historico_diario[0].fecha, '2026-10-01');
            assert.strictEqual(rango.historico_diario[9].fecha, '2026-10-10');
        });

        it('debe asignar rango por defecto de 30 días si no se proporcionan fechas', async () => {
            const rango = await getSolarAhorroRango(null, null);
            assert.ok(rango);
            assert.ok(rango.dias_analizados >= 1);
            assert.ok(rango.ahorro_total_usd > 0);
            assert.ok(rango.total_ahorro_usd > 0);
        });
    });

    describe('getSolarEstadoActual', () => {
        it('debe reportar SoC de batería BESS Andelsa, potencia solar total (95 kWp) y dual naming', async () => {
            const estado = await getSolarEstadoActual();

            assert.ok(estado);
            assert.ok(estado.timestamp);
            assert.ok(estado.hora_local_sv);

            // Dual naming
            assert.strictEqual(estado.potencia_instalada_total_kwp, 95.0);
            assert.strictEqual(estado.potencia_total_kwp, 95.0);
            assert.strictEqual(estado.capacidad_total_baterias_kwh, 60.0);
            assert.strictEqual(estado.capacidad_bateria_total_kwh, 60.0);
            assert.strictEqual(estado.potencia_actual_total_kw, estado.potencia_actual_estimada_kw);
            assert.strictEqual(estado.bateria_soc_pct, estado.bateria_promedio_soc_pct);

            // Batería SoC y autonomía
            assert.ok(estado.bateria_soc_pct >= 0 && estado.bateria_soc_pct <= 100, 'SoC debe ser porcentaje entre 0 y 100');
            assert.ok(estado.horas_autonomia_estimadas >= 0, 'Autonomía en horas debe ser no negativa');
            assert.ok(estado.energia_almacenada_total_kwh >= 0);

            // Estaciones individuales
            assert.strictEqual(estado.estaciones.length, 2);

            const andelsa = estado.estaciones.find(e => e.estacion_nombre === 'Andelsa');
            assert.ok(andelsa, 'Andelsa debe estar en estado actual');
            assert.strictEqual(andelsa.tiene_baterias, 1);
            assert.strictEqual(andelsa.capacidad_bateria_kwh, 60.0);
            assert.strictEqual(andelsa.potencia_kwp, 55.0);
            assert.ok(['CARGANDO', 'DESCARGANDO', 'EN_LINEA', 'REPOSO'].includes(andelsa.bateria_estado));
            assert.ok(andelsa.horas_autonomia >= 0);

            const sanMartin = estado.estaciones.find(e => e.estacion_nombre.includes('San Martín'));
            assert.ok(sanMartin, 'San Martín debe estar en estado actual');
            assert.strictEqual(sanMartin.tiene_baterias, 0);
            assert.strictEqual(sanMartin.capacidad_bateria_kwh, 0.0);
            assert.strictEqual(sanMartin.potencia_kwp, 40.0);
            assert.strictEqual(sanMartin.bateria_soc_pct, 0.0);
            assert.strictEqual(sanMartin.horas_autonomia, 0.0);
        });

        it('debe filtrar en tiempo real para una estación específica (Andelsa o San Martín)', async () => {
            const estadoAndelsa = await getSolarEstadoActual('andelsa');
            assert.strictEqual(estadoAndelsa.estaciones.length, 1);
            assert.strictEqual(estadoAndelsa.estaciones[0].estacion_nombre, 'Andelsa');
            assert.strictEqual(estadoAndelsa.potencia_total_kwp, 55.0);
            assert.strictEqual(estadoAndelsa.capacidad_bateria_total_kwh, 60.0);

            const estadoSM = await getSolarEstadoActual('san martin');
            assert.strictEqual(estadoSM.estaciones.length, 1);
            assert.strictEqual(estadoSM.estaciones[0].estacion_nombre, 'San Martín (La Loma)');
            assert.strictEqual(estadoSM.potencia_total_kwp, 40.0);
            assert.strictEqual(estadoSM.capacidad_bateria_total_kwh, 0.0);
        });
    });
});
