const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    getInstalacionesSolares,
    getSolarAhorroDiario,
    getSolarAhorroMensual,
    getSolarAhorroRango,
    getSolarEstadoActual
} = require('../services/solarEnergyService');

describe('Solar Energy & Storage Service Unit Tests', () => {

    describe('getInstalacionesSolares', () => {
        it('debe listar las 2 ubicaciones con paneles y 1 con batería', async () => {
            const result = await getInstalacionesSolares();
            assert.ok(result);
            assert.ok(Array.isArray(result.instalaciones));
            assert.ok(Array.isArray(result.instalaciones_con_paneles));
            assert.ok(Array.isArray(result.instalaciones_con_baterias));

            // Verificar conteos exactos de la red SIPE
            assert.strictEqual(result.instalaciones_con_paneles.length, 2, 'Debe haber exactamente 2 estaciones con paneles solares');
            assert.strictEqual(result.instalaciones_con_baterias.length, 1, 'Debe haber exactamente 1 estación con sistema de batería BESS');

            // Verificar resumen consolidado
            assert.strictEqual(result.resumen.total_ubicaciones_solares, 2);
            assert.strictEqual(result.resumen.total_ubicaciones_baterias, 1);
            assert.strictEqual(result.resumen.potencia_total_kwp, 80.0, 'Potencia total instalada debe ser 80 kWp (45 + 35)');
            assert.strictEqual(result.resumen.capacidad_total_bateria_kwh, 60.0, 'Capacidad total de batería debe ser 60 kWh');

            // Estaciones específicas
            const nombresPaneles = result.instalaciones_con_paneles.map(i => i.estacion_nombre);
            assert.ok(nombresPaneles.includes('Puma Miraflores'));
            assert.ok(nombresPaneles.includes('Puma Costa del Sol'));

            const nombresBaterias = result.instalaciones_con_baterias.map(i => i.estacion_nombre);
            assert.ok(nombresBaterias.includes('Puma Miraflores'));
        });
    });

    describe('getSolarAhorroDiario', () => {
        it('debe calcular ahorro en USD, kWh generados, autoconsumo y descarga de batería', async () => {
            const fechaTest = '2026-10-12';
            const data = await getSolarAhorroDiario(fechaTest);

            assert.ok(data);
            assert.strictEqual(data.fecha, fechaTest);

            // Generación y autoconsumo
            assert.ok(data.generacion_total_kwh > 0, 'La generación solar diaria debe ser mayor a 0 kWh');
            assert.ok(data.autoconsumo_total_kwh > 0, 'El autoconsumo diario debe ser mayor a 0 kWh');
            assert.ok(data.autoconsumo_total_kwh <= data.generacion_total_kwh, 'Autoconsumo no puede exceder generación');

            // Batería y ahorro
            assert.ok(data.bateria_descarga_total_kwh >= 0, 'Descarga de batería debe ser no negativa');
            assert.ok(data.ahorro_total_usd > 0, 'El ahorro total en USD debe ser positivo');
            assert.ok(data.co2_evitado_total_kg > 0, 'El CO2 evitado debe ser positivo');

            // Desglose por estación
            assert.strictEqual(data.total_estaciones_activas, 2);
            assert.strictEqual(data.desglose_por_estacion.length, 2);

            const miraflores = data.desglose_por_estacion.find(e => e.estacion_nombre === 'Puma Miraflores');
            assert.ok(miraflores);
            assert.strictEqual(miraflores.tiene_baterias, 1);
            assert.ok(miraflores.ahorro_usd > 0);

            const costa = data.desglose_por_estacion.find(e => e.estacion_nombre === 'Puma Costa del Sol');
            assert.ok(costa);
            assert.strictEqual(costa.tiene_baterias, 0);
            assert.strictEqual(costa.bateria_descarga_kwh, 0);
        });

        it('debe filtrar correctamente por estación específica', async () => {
            const data = await getSolarAhorroDiario('2026-10-12', '002');
            assert.ok(data);
            assert.strictEqual(data.total_estaciones_activas, 1);
            assert.strictEqual(data.desglose_por_estacion[0].id_empresa, '002');
            assert.strictEqual(data.desglose_por_estacion[0].estacion_nombre, 'Puma Miraflores');
        });

        it('debe tomar la fecha actual por defecto ante fecha nula o vacía', async () => {
            const data = await getSolarAhorroDiario(null);
            assert.ok(data);
            const hoy = new Date().toISOString().split('T')[0];
            assert.strictEqual(data.fecha, hoy);
            assert.ok(data.ahorro_total_usd > 0);
        });
    });

    describe('getSolarAhorroMensual', () => {
        it('debe calcular la acumulación del mes, días transcurridos y promedio diario', async () => {
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

            // Métricas de acumulación y promedio
            assert.ok(mensual.ahorro_total_usd > 0, 'Ahorro acumulado mensual debe ser positivo');
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
            assert.strictEqual(mensual.dias_transcurridos, 30);
            assert.strictEqual(mensual.dias_totales_mes, 30);
            assert.strictEqual(mensual.historico_diario.length, 30);
            assert.ok(mensual.ahorro_total_usd > 0);
        });
    });

    describe('getSolarAhorroRango', () => {
        it('debe validar fechas y calcular el ahorro exacto entre fechas', async () => {
            const dInicio = '2026-10-01';
            const dFin = '2026-10-10';
            const rango = await getSolarAhorroRango(dInicio, dFin);

            assert.ok(rango);
            assert.strictEqual(rango.fecha_inicio, dInicio);
            assert.strictEqual(rango.fecha_fin, dFin);
            assert.strictEqual(rango.dias_analizados, 10);
            assert.strictEqual(rango.historico_diario.length, 10);

            assert.ok(rango.ahorro_total_usd > 0);
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
            assert.ok(rango.dias_analizados >= 30);
            assert.ok(rango.ahorro_total_usd > 0);
        });
    });

    describe('getSolarEstadoActual', () => {
        it('debe reportar SoC de batería, potencia solar y autonomía estimada', async () => {
            const estado = await getSolarEstadoActual();

            assert.ok(estado);
            assert.ok(estado.timestamp);
            assert.ok(estado.hora_local_sv);
            assert.strictEqual(estado.potencia_instalada_total_kwp, 80.0);
            assert.strictEqual(estado.capacidad_total_baterias_kwh, 60.0);
            assert.ok(estado.potencia_actual_total_kw >= 0);

            // Batería SoC y autonomía
            assert.ok(estado.bateria_soc_pct >= 0 && estado.bateria_soc_pct <= 100, 'SoC debe ser porcentaje entre 0 y 100');
            assert.ok(estado.horas_autonomia_estimadas >= 0, 'Autonomía en horas debe ser no negativa');
            assert.ok(estado.energia_almacenada_total_kwh >= 0);

            // Estaciones individuales
            assert.strictEqual(estado.estaciones.length, 2);

            const mira = estado.estaciones.find(e => e.estacion_nombre === 'Puma Miraflores');
            assert.ok(mira);
            assert.strictEqual(mira.tiene_baterias, 1);
            assert.strictEqual(mira.capacidad_bateria_kwh, 60.0);
            assert.ok(['CARGANDO', 'DESCARGANDO', 'EN_LINEA', 'REPOSO'].includes(mira.bateria_estado));
            assert.ok(mira.horas_autonomia >= 0);

            const costa = estado.estaciones.find(e => e.estacion_nombre === 'Puma Costa del Sol');
            assert.ok(costa);
            assert.strictEqual(costa.tiene_baterias, 0);
            assert.strictEqual(costa.capacidad_bateria_kwh, 0.0);
            assert.strictEqual(costa.bateria_soc_pct, 0.0);
            assert.strictEqual(costa.horas_autonomia, 0.0);
        });
    });
});
