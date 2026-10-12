const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    getHorasPicoVentas,
    getHorasPicoRango,
    generarFallbackAnaliticoHoras,
    compilarAnalisisHoras,
    getFranjaLabel,
    getFranjaCategoria,
    HOURLY_WEIGHTS_STANDARD
} = require('../services/salesHourlyService');

describe('Sales Hourly & Peak Hours Service Unit Tests', () => {

    describe('getHorasPicoVentas', () => {
        it('debe detectar la hora pico, top 3 horas, franjas horarias y totales del día', async () => {
            const fechaTest = '2026-10-12';
            const data = await getHorasPicoVentas(fechaTest);

            assert.ok(data);
            assert.strictEqual(data.fecha, fechaTest);

            // 1. Detección de hora pico
            assert.ok(typeof data.hora_pico === 'string', 'hora_pico debe ser una franja formateada');
            assert.ok(data.hora_pico.includes(':00 - '));
            assert.ok(typeof data.hora_pico_num === 'number');
            assert.ok(data.venta_hora_pico > 0);
            assert.ok(data.transacciones_hora_pico > 0);

            // En el modelo estándar analítico, la hora pico principal es las 17:00 (17:00 - 18:00)
            if (data.origen_datos === 'fallback_analitico') {
                assert.strictEqual(data.hora_pico_num, 17);
                assert.strictEqual(data.hora_pico, '17:00 - 18:00');
            }

            // 2. Top 3 horas
            assert.ok(Array.isArray(data.top_3_horas));
            assert.strictEqual(data.top_3_horas.length, 3, 'Top horas debe contener exactamente 3 franjas');
            assert.ok(data.top_3_horas[0].total_venta >= data.top_3_horas[1].total_venta);
            assert.ok(data.top_3_horas[1].total_venta >= data.top_3_horas[2].total_venta);
            assert.ok(data.top_3_horas[0].porcentaje_total > 0);

            // 3. Distribución de franjas horarias (Madrugada, Mañana, Mediodía, Noche)
            assert.ok(data.distribucion_franjas);
            const franjas = data.distribucion_franjas;
            assert.ok(franjas['Madrugada'] && franjas['Mañana'] && franjas['Mediodía'] && franjas['Noche']);
            assert.ok(franjas['Madrugada'].venta >= 0);
            assert.ok(franjas['Mañana'].venta > 0);
            assert.ok(franjas['Mediodía'].venta > 0);
            assert.ok(franjas['Noche'].venta > 0);

            // Suma de porcentajes de franjas debe ser aproximadamente 100%
            const sumaPctFranjas = franjas['Madrugada'].porcentaje_venta + 
                                  franjas['Mañana'].porcentaje_venta + 
                                  franjas['Mediodía'].porcentaje_venta + 
                                  franjas['Noche'].porcentaje_venta;
            assert.ok(Math.abs(sumaPctFranjas - 100) < 0.5, `La suma de porcentajes de franjas (${sumaPctFranjas}) debe ser ~100%`);

            // 4. Totales del día y desglose 24 horas
            assert.ok(data.total_dia);
            assert.ok(data.total_dia.total_venta > 0);
            assert.ok(data.total_dia.transacciones > 0);
            assert.ok(data.total_dia.ticket_promedio > 0);

            assert.ok(Array.isArray(data.desglose_por_hora));
            assert.strictEqual(data.desglose_por_hora.length, 24, 'Debe desglosar las 24 horas del día (0-23)');
            assert.strictEqual(data.desglose_por_hora[0].hora, 0);
            assert.strictEqual(data.desglose_por_hora[23].hora, 23);
        });

        it('debe admitir filtro por sucursal específica (branch_id)', async () => {
            const dataBranch = await getHorasPicoVentas('2026-10-12', 4);
            assert.ok(dataBranch);
            assert.strictEqual(dataBranch.branch_id, 4);
            assert.ok(dataBranch.total_dia.total_venta > 0);
            assert.strictEqual(dataBranch.desglose_por_hora.length, 24);
        });
    });

    describe('getHorasPicoRango', () => {
        it('debe consolidar el análisis de horas pico para un periodo de tiempo', async () => {
            const dInicio = '2026-10-01';
            const dFin = '2026-10-10';
            const rango = await getHorasPicoRango(dInicio, dFin);

            assert.ok(rango);
            assert.strictEqual(rango.fecha_inicio, dInicio);
            assert.strictEqual(rango.fecha_fin, dFin);
            assert.strictEqual(rango.dias_analizados, 10);

            // Métricas de ventas promedio y totales
            assert.ok(rango.total_dia.total_venta > 0);
            assert.ok(rango.total_dia.transacciones > 0);
            assert.ok(rango.promedio_diario_venta > 0);
            assert.ok(rango.promedio_diario_transacciones > 0);

            // Verificación del promedio diario
            const promCalculado = Number((rango.total_dia.total_venta / rango.dias_analizados).toFixed(2));
            assert.strictEqual(rango.promedio_diario_venta, promCalculado);

            // Hora pico y 24 horas consolidadas
            assert.ok(rango.hora_pico);
            assert.strictEqual(rango.top_3_horas.length, 3);
            assert.strictEqual(rango.desglose_por_hora.length, 24);
        });

        it('debe asignar rango por defecto ante parámetros nulos', async () => {
            const rango = await getHorasPicoRango(null, null);
            assert.ok(rango);
            assert.ok(rango.dias_analizados >= 30);
            assert.ok(rango.total_dia.total_venta > 0);
        });
    });

    describe('Fallback analítico ante desconexión de base de datos', () => {
        it('debe responder de forma determinista y estable con origen_datos fallback_analitico', async () => {
            const fallback = generarFallbackAnaliticoHoras('2026-10-12', null);

            assert.strictEqual(fallback.origen_datos, 'fallback_analitico');
            assert.strictEqual(fallback.fecha, '2026-10-12');
            assert.strictEqual(fallback.hora_pico_num, 17);
            assert.strictEqual(fallback.hora_pico, '17:00 - 18:00');
            assert.ok(fallback.venta_hora_pico > 0);

            // Las ponderaciones estándar deben respetarse
            assert.strictEqual(HOURLY_WEIGHTS_STANDARD.length, 24);
            const sumaPesos = HOURLY_WEIGHTS_STANDARD.reduce((acc, w) => acc + w.peso, 0);
            assert.ok(Math.abs(sumaPesos - 1.0) < 0.001, 'La suma de pesos horarios debe ser 1.0 (100%)');
        });

        it('getFranjaLabel y getFranjaCategoria deben clasificar correctamente las 24 horas', () => {
            assert.strictEqual(getFranjaLabel(0), '00:00 - 01:00');
            assert.strictEqual(getFranjaLabel(17), '17:00 - 18:00');
            assert.strictEqual(getFranjaLabel(23), '23:00 - 00:00');

            assert.strictEqual(getFranjaCategoria(3), 'Madrugada');
            assert.strictEqual(getFranjaCategoria(8), 'Mañana');
            assert.strictEqual(getFranjaCategoria(14), 'Mediodía');
            assert.strictEqual(getFranjaCategoria(20), 'Noche');
        });

        it('compilarAnalisisHoras debe calcular tickets promedio y porcentajes sobre el total de forma robusta', () => {
            const mockHoras = [
                { hora: 8, total_venta: 200, transacciones: 10 },
                { hora: 17, total_venta: 800, transacciones: 40 }
            ];

            const compilado = compilarAnalisisHoras(mockHoras);
            assert.strictEqual(compilado.total_dia.total_venta, 1000);
            assert.strictEqual(compilado.total_dia.transacciones, 50);
            assert.strictEqual(compilado.total_dia.ticket_promedio, 20.0);

            assert.strictEqual(compilado.hora_pico_num, 17);
            assert.strictEqual(compilado.hora_pico, '17:00 - 18:00');
            assert.strictEqual(compilado.desglose_por_hora[0].porcentaje_total, 20.0);
            assert.strictEqual(compilado.desglose_por_hora[1].porcentaje_total, 80.0);
        });
    });
});
