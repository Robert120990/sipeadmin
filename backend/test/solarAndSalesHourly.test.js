process.env.NODE_ENV = 'test';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const solarEnergyService = require('../services/solarEnergyService');
const salesHourlyService = require('../services/salesHourlyService');

describe('Solar Energy & Battery Service Tests', () => {

    describe('getInstalacionesSolares', () => {
        it('debe listar exactamente las 2 ubicaciones con paneles (Andelsa 55 kWp, San Martín 40 kWp) y 1 con baterías (Andelsa 60 kWh)', async () => {
            const result = await solarEnergyService.getInstalacionesSolares();
            assert.ok(result);
            assert.ok(Array.isArray(result.instalaciones_con_paneles));
            assert.strictEqual(result.instalaciones_con_paneles.length, 2);

            // Ubicación 1: Andelsa (55.0 kWp, con batería 60 kWh BESS)
            const andelsa = result.instalaciones_con_paneles.find(i => i.estacion_nombre.includes('Andelsa'));
            assert.ok(andelsa, 'Andelsa debe estar en la lista con paneles');
            assert.strictEqual(andelsa.branch_id, 9);
            assert.strictEqual(andelsa.potencia_kwp, 55.0);
            assert.strictEqual(andelsa.tiene_baterias, 1);
            assert.strictEqual(andelsa.capacidad_bateria_kwh, 60.0);
            assert.strictEqual(andelsa.tarifa_kwh, 0.18);

            // Ubicación 2: San Martín (La Loma) (40.0 kWp, sin batería)
            const sanMartin = result.instalaciones_con_paneles.find(i => i.estacion_nombre.includes('San Martín'));
            assert.ok(sanMartin, 'San Martín (La Loma) debe estar en la lista con paneles');
            assert.strictEqual(sanMartin.branch_id, 1);
            assert.strictEqual(sanMartin.potencia_kwp, 40.0);
            assert.strictEqual(sanMartin.tiene_baterias, 0);
            assert.strictEqual(sanMartin.capacidad_bateria_kwh, 0.0);
            assert.strictEqual(sanMartin.tarifa_kwh, 0.18);

            // Resumen de baterías: Solo 1 estación con baterías (Andelsa)
            assert.strictEqual(result.instalaciones_con_baterias.length, 1);
            assert.strictEqual(result.instalaciones_con_baterias[0].estacion_nombre, 'Andelsa');

            // Métricas de capacidad acumulada
            assert.strictEqual(result.resumen.potencia_total_kwp, 95.0);
            assert.strictEqual(result.resumen.capacidad_total_bateria_kwh, 60.0);
            assert.strictEqual(result.resumen.total_ubicaciones_solares, 2);
            assert.strictEqual(result.resumen.total_ubicaciones_baterias, 1);
        });

        it('debe registrar demás estaciones sin paneles solares (tiene_paneles = 0)', async () => {
            const result = await solarEnergyService.getInstalacionesSolares();
            const sinPaneles = result.instalaciones.filter(i => i.tiene_paneles === 0);
            assert.ok(sinPaneles.length >= 3);
            sinPaneles.forEach(st => {
                assert.strictEqual(st.potencia_kwp, 0);
                assert.strictEqual(st.tiene_baterias, 0);
            });
        });
    });

    describe('getSolarAhorroDiario', () => {
        it('debe calcular métricas completas de ahorro diario con dual naming y nunca dar $0.00', async () => {
            const targetDate = '2026-10-12';
            const data = await solarEnergyService.getSolarAhorroDiario(targetDate);

            assert.strictEqual(data.fecha, targetDate);
            assert.ok(data.generacion_total_kwh > 300, 'Generación total de 95 kWp debe superar 300 kWh/día');
            assert.ok(data.autoconsumo_total_kwh > 250, 'Autoconsumo debe ser mayor a 250 kWh/día');
            assert.ok(data.bateria_descarga_total_kwh > 30, 'Descarga de batería de Andelsa debe aportar energía');
            assert.ok(data.ahorro_total_usd > 50, 'Ahorro diario en USD debe superar los $50');
            assert.ok(data.total_ahorro_usd > 50, 'total_ahorro_usd debe ser idéntico y positivo');
            assert.strictEqual(data.ahorro_total_usd, data.total_ahorro_usd);
            assert.ok(data.co2_evitado_total_kg > 100, 'CO2 evitado diario debe superar los 100 kg');
            assert.strictEqual(data.desglose_por_estacion.length, 2);

            // Desglose por estación
            const andelsa = data.desglose_por_estacion.find(e => e.estacion_nombre.includes('Andelsa'));
            const sanMartin = data.desglose_por_estacion.find(e => e.estacion_nombre.includes('San Martín'));

            assert.ok(andelsa, 'Andelsa debe existir');
            assert.ok(sanMartin, 'San Martín debe existir');
            assert.ok(andelsa.bateria_carga_kwh > 0, 'Andelsa debe cargar baterías');
            assert.ok(andelsa.bateria_descarga_kwh > 0, 'Andelsa debe descargar baterías');
            assert.ok(andelsa.bateria_soc_pct >= 80, 'Estado de carga SoC de Andelsa debe rondar el 85%');
            assert.strictEqual(sanMartin.bateria_carga_kwh, 0, 'San Martín no tiene batería');
            assert.strictEqual(sanMartin.bateria_descarga_kwh, 0);
        });

        it('debe permitir filtrar por estación específica (Andelsa branch_id 9)', async () => {
            const data = await solarEnergyService.getSolarAhorroDiario('2026-10-12', 9);
            assert.strictEqual(data.desglose_por_estacion.length, 1);
            assert.strictEqual(data.desglose_por_estacion[0].branch_id, 9);
            assert.strictEqual(data.desglose_por_estacion[0].estacion_nombre, 'Andelsa');
            assert.ok(data.total_ahorro_usd > 0);
        });
    });

    describe('getSolarAhorroMensual', () => {
        it('debe acumular el ahorro del mes completo (ej. octubre 2026)', async () => {
            const res = await solarEnergyService.getSolarAhorroMensual(2026, 10);

            assert.strictEqual(res.anio, 2026);
            assert.strictEqual(res.mes, 10);
            assert.strictEqual(res.periodo, '2026-10');
            assert.ok(res.dias_transcurridos >= 12, 'Octubre 2026 debe contabilizar los días transcurridos');
            assert.ok(res.ahorro_total_usd > 500, 'Ahorro acumulado de octubre debe ser superior a $500');
            assert.strictEqual(res.ahorro_total_usd, res.total_ahorro_usd);
            assert.ok(res.promedio_diario_ahorro_usd > 40, 'Promedio diario debe calcularse');
            assert.ok(res.generacion_total_kwh > 3000, 'Generación total del mes');
            assert.ok(res.co2_evitado_total_kg > 1000, 'CO2 total evitado del mes');
            assert.ok(Array.isArray(res.historico_diario));
            assert.strictEqual(res.historico_diario.length, res.dias_transcurridos);
        });
    });

    describe('getSolarAhorroRango', () => {
        it('debe consolidar ahorro en un rango personalizado de fechas', async () => {
            const res = await solarEnergyService.getSolarAhorroRango('2026-10-01', '2026-10-10');

            assert.strictEqual(res.fecha_inicio, '2026-10-01');
            assert.strictEqual(res.fecha_fin, '2026-10-10');
            assert.strictEqual(res.dias_analizados, 10);
            assert.ok(res.ahorro_total_usd > 500);
            assert.strictEqual(res.ahorro_total_usd, res.total_ahorro_usd);
            assert.ok(res.promedio_diario_ahorro_usd > 50);
            assert.strictEqual(res.historico_diario.length, 10);
            assert.strictEqual(res.desglose_por_estacion.length, 2);
        });
    });

    describe('getSolarEstadoActual', () => {
        it('debe retornar estado en tiempo real del sistema solar y la batería BESS Andelsa', async () => {
            const estado = await solarEnergyService.getSolarEstadoActual();

            assert.ok(estado.timestamp);
            assert.ok(typeof estado.potencia_actual_total_kw === 'number');
            assert.strictEqual(estado.potencia_instalada_total_kwp, 95.0);
            assert.strictEqual(estado.potencia_total_kwp, 95.0);
            assert.ok(estado.bateria_soc_pct >= 0 && estado.bateria_soc_pct <= 100);
            assert.ok(estado.horas_autonomia_estimadas > 0, 'Andelsa debe contar con horas de autonomía calculadas');
            assert.strictEqual(estado.capacidad_total_baterias_kwh, 60.0);

            // Verificación específica por estación
            assert.strictEqual(estado.estaciones.length, 2);
            const andelsa = estado.estaciones.find(e => e.estacion_nombre === 'Andelsa');
            const sanMartin = estado.estaciones.find(e => e.estacion_nombre.includes('San Martín'));

            assert.ok(andelsa);
            assert.strictEqual(andelsa.tiene_baterias, 1);
            assert.ok(andelsa.horas_autonomia > 5, 'Andelsa con 60 kWh debe proveer más de 5 hrs de autonomía para cargas críticas');

            assert.ok(sanMartin);
            assert.strictEqual(sanMartin.tiene_baterias, 0);
            assert.strictEqual(sanMartin.horas_autonomia, 0);
        });
    });

    describe('seedSolarEnergyData', () => {
        it('debe ejecutar siembra en base de datos sin lanzar excepciones', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes('COUNT(*)')) {
                        return [[{ count: 0 }]];
                    }
                    if (sql.includes('SHOW COLUMNS')) {
                        return [[{ Field: 'company_id' }]];
                    }
                    if (sql.includes('SELECT id FROM energia_instalaciones')) {
                        return [[]];
                    }
                    return [[{ affectedRows: 1, insertId: 1 }]];
                }
            };
            const result = await solarEnergyService.seedSolarEnergyData(mockDb);
            assert.strictEqual(result, true);
        });
    });
});

describe('Sales Hourly & Peak Hours Service Tests', () => {

    describe('getHorasPicoVentas (Fallback Analítico)', () => {
        it('debe identificar la hora pico vespertina (17:00 - 19:00 hrs) y matutina (07:00 - 09:00 hrs)', async () => {
            const data = await salesHourlyService.getHorasPicoVentas('2026-10-12');

            assert.strictEqual(data.fecha, '2026-10-12');
            assert.ok(data.origen_datos, 'Debe indicar origen de los datos');

            // La hora pico debe situarse en la franja vespertina (17:00 - 18:00)
            assert.strictEqual(data.hora_pico, '17:00 - 18:00');
            assert.ok(data.venta_hora_pico > 0);
            assert.ok(data.transacciones_hora_pico > 0);

            // Top 3 horas debe contener franjas vespertina y matutina
            assert.strictEqual(data.top_3_horas.length, 3);
            const franjasTop = data.top_3_horas.map(h => h.franja);
            assert.ok(franjasTop.includes('17:00 - 18:00'), 'Debe incluir 17:00-18:00 en top 3');
            assert.ok(franjasTop.includes('18:00 - 19:00'), 'Debe incluir 18:00-19:00 en top 3');
            assert.ok(franjasTop.includes('07:00 - 08:00'), 'Debe incluir hora pico matutina en top 3');

            // Distribución de franjas canónicas
            const franjas = data.distribucion_franjas;
            assert.ok(franjas.Madrugada, 'Debe existir franja Madrugada (00-06)');
            assert.ok(franjas.Mañana, 'Debe existir franja Mañana (06-12)');
            assert.ok(franjas.Mediodía, 'Debe existir franja Mediodía (12-18)');
            assert.ok(franjas.Noche, 'Debe existir franja Noche (18-24)');

            // Proporciones estándar de negocio
            assert.ok(franjas.Mediodía.porcentaje_venta > 30, 'Mediodía (incluye pico 17:00) debe superar el 30%');
            assert.ok(franjas.Mañana.porcentaje_venta > 25, 'Mañana (incluye pico matutino) debe superar el 25%');
            assert.ok(franjas.Madrugada.porcentaje_venta < 10, 'Madrugada debe ser menor al 10%');

            // Total del día
            assert.ok(data.total_dia.total_venta > 0);
            assert.ok(data.total_dia.transacciones > 0);
            assert.ok(data.total_dia.ticket_promedio > 10);
            assert.strictEqual(data.desglose_por_hora.length, 24);
        });

        it('debe filtrar por branch_id específico generando volumen adaptado', async () => {
            const dataStation = await salesHourlyService.getHorasPicoVentas('2026-10-12', 4);
            const dataConsolidado = await salesHourlyService.getHorasPicoVentas('2026-10-12', null);

            assert.strictEqual(dataStation.branch_id, 4);
            assert.ok(dataStation.total_dia.total_venta < dataConsolidado.total_dia.total_venta, 
                'Venta de una estación debe ser menor que la red consolidada');
            assert.strictEqual(dataStation.hora_pico, '17:00 - 18:00');
        });
    });

    describe('getHorasPicoRango', () => {
        it('debe realizar análisis consolidado para un rango de fechas', async () => {
            const rango = await salesHourlyService.getHorasPicoRango('2026-10-01', '2026-10-12');

            assert.strictEqual(rango.fecha_inicio, '2026-10-01');
            assert.strictEqual(rango.fecha_fin, '2026-10-12');
            assert.strictEqual(rango.dias_analizados, 12);
            assert.ok(rango.promedio_diario_venta > 0);
            assert.strictEqual(rango.hora_pico, '17:00 - 18:00');
            assert.strictEqual(rango.top_3_horas.length, 3);
            assert.strictEqual(rango.desglose_por_hora.length, 24);
            assert.ok(rango.total_dia.total_venta > 0);
        });
    });

    describe('Manejo de consultas directas con BD simulada', () => {
        it('debe compilar correctamente resultados provenientes de sales_headers', () => {
            const mockHoras = [
                { hora: 7, franja: '07:00 - 08:00', total_venta: 1200.0, transacciones: 60 },
                { hora: 17, franja: '17:00 - 18:00', total_venta: 2500.0, transacciones: 110 },
                { hora: 18, franja: '18:00 - 19:00', total_venta: 2100.0, transacciones: 95 }
            ];
            // Rellenar 24 horas
            const horas24 = [];
            for (let h = 0; h < 24; h++) {
                const found = mockHoras.find(m => m.hora === h);
                horas24.push(found || {
                    hora: h,
                    franja: salesHourlyService.getFranjaLabel(h),
                    total_venta: 100.0,
                    transacciones: 10
                });
            }

            const compilado = salesHourlyService.compilarAnalisisHoras(horas24);
            assert.strictEqual(compilado.hora_pico, '17:00 - 18:00');
            assert.strictEqual(compilado.venta_hora_pico, 2500.0);
            assert.strictEqual(compilado.transacciones_hora_pico, 110);
            assert.strictEqual(compilado.top_3_horas[0].franja, '17:00 - 18:00');
            assert.strictEqual(compilado.top_3_horas[1].franja, '18:00 - 19:00');
            assert.strictEqual(compilado.top_3_horas[2].franja, '07:00 - 08:00');
        });
    });
});
