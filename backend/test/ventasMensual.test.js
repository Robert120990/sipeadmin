const { describe, it } = require('node:test');
const assert = require('node:assert');
const consultasRouter = require('../routes/consultas');

describe('Ventas Mensual Backend Logic Tests', () => {
    const normalizeStationName = consultasRouter.normalizeStationName;
    const getResumenMensualData = consultasRouter.getResumenMensualData;

    describe('normalizeStationName', () => {
        it('debe normalizar nombres de estación y tienda para permitir match limpio', () => {
            const estacion = normalizeStationName('ES CHALCHUAPA');
            const tienda = normalizeStationName('E-MARKET CHALCHUAPA');
            assert.strictEqual(estacion, 'CHALCHUAPA');
            assert.strictEqual(tienda, 'CHALCHUAPA');
            assert.strictEqual(estacion, tienda);
        });

        it('debe remover tildes y palabras clave operativas', () => {
            assert.strictEqual(normalizeStationName('ESTACIÓN DE SERVICIO ACAJUTLA'), 'ACAJUTLA');
            assert.strictEqual(normalizeStationName('TIENDA E-MARKET SAN LUIS'), 'SANLUIS');
            assert.strictEqual(normalizeStationName('PISTA MIRAFLORES'), 'MIRAFLORES');
        });

        it('debe manejar entradas vacías o nulas de forma segura', () => {
            assert.strictEqual(normalizeStationName(''), '');
            assert.strictEqual(normalizeStationName(null), '');
            assert.strictEqual(normalizeStationName(undefined), '');
        });
    });

    describe('getResumenMensualData validación y consolidación', () => {
        it('debe rechazar mes o año inválidos', async () => {
            await assert.rejects(async () => {
                await getResumenMensualData({}, 'invalid', 9);
            }, /Año o mes inválido/);

            await assert.rejects(async () => {
                await getResumenMensualData({}, 2026, 13);
            }, /Año o mes inválido/);

            await assert.rejects(async () => {
                await getResumenMensualData({}, 2026, 0);
            }, /Año o mes inválido/);
        });

        it('debe consolidar estaciones y tiendas mockeadas correctamente', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes("grupo = 'ESTACION'")) {
                        return [[
                            { id_empresa: '001', titulo: 'ES CHALCHUAPA', orden: 1, diesel: 1000, regular: 2000, super: 3000, ion: 500, galonaje: 6500, monto: 26000 },
                            { id_empresa: '002', titulo: 'ES ACAJUTLA', orden: 2, diesel: 1500, regular: 2500, super: 3500, ion: 0, galonaje: 7500, monto: 30000 }
                        ]];
                    }
                    if (sql.includes("grupo = 'TIENDA'")) {
                        return [[
                            { id_empresa: '001', titulo: 'E-MARKET CHALCHUAPA', orden: 1, monto: 5000, dias_con_venta: 28, promedio_diario: 178.57 },
                            { id_empresa: '009', titulo: 'TIENDA INDEPENDIENTE', orden: 3, monto: 1200, dias_con_venta: 20, promedio_diario: 60 }
                        ]];
                    }
                    return [[]];
                }
            };

            const result = await getResumenMensualData(mockDb, 2026, 9, null);
            assert.strictEqual(result.periodo, '2026-09');
            assert.strictEqual(result.year, 2026);
            assert.strictEqual(result.month, 9);
            assert.strictEqual(result.dias_mes, 30);
            assert.strictEqual(result.estaciones.length, 2);
            assert.strictEqual(result.tiendas.length, 2);

            // Consolidado tiene 3 filas: Chalchuapa (Pista + Tienda), Acajutla (solo Pista), Tienda Independiente (solo Tienda)
            assert.strictEqual(result.consolidado.length, 3);

            const chalchuapa = result.consolidado.find(c => c.empresa === 'ES CHALCHUAPA');
            assert.ok(chalchuapa);
            assert.strictEqual(chalchuapa.galonaje, 6500);
            assert.strictEqual(chalchuapa.venta_estacion, 26000);
            assert.strictEqual(chalchuapa.venta_tienda, 5000);
            assert.strictEqual(chalchuapa.venta_total, 31000);

            const acajutla = result.consolidado.find(c => c.empresa === 'ES ACAJUTLA');
            assert.ok(acajutla);
            assert.strictEqual(acajutla.venta_estacion, 30000);
            assert.strictEqual(acajutla.venta_tienda, 0);
            assert.strictEqual(acajutla.venta_total, 30000);

            const tiendaInd = result.consolidado.find(c => c.empresa === 'TIENDA INDEPENDIENTE');
            assert.ok(tiendaInd);
            assert.strictEqual(tiendaInd.venta_estacion, 0);
            assert.strictEqual(tiendaInd.venta_tienda, 1200);
            assert.strictEqual(tiendaInd.venta_total, 1200);

            // Totales
            assert.strictEqual(result.totales.galonaje, 14000);
            assert.strictEqual(result.totales.venta_estacion, 56000);
            assert.strictEqual(result.totales.venta_tienda, 6200);
            assert.strictEqual(result.totales.venta_total, 62200);
        });

        it('debe priorizar y procesar correctamente los datos de db_sistema_saas (Nova SaaS)', async () => {
            const mockSaasDb = {
                query: async (sql) => {
                    if (sql.includes('gas_station_closeout_readings')) {
                        return [[
                            { id_empresa: 1, empresa: 'Puma Miraflores', galonaje: 60000, venta_estacion: 250000, diesel: 15000, regular: 18000, super: 20000, ion: 7000 },
                            { id_empresa: 2, empresa: 'Shell Chalchuapa', galonaje: 55000, venta_estacion: 230000, diesel: 18000, regular: 17000, super: 20000, ion: 0 }
                        ]];
                    }
                    if (sql.includes('sales_headers')) {
                        return [[
                            { id_empresa: 1, empresa: 'Puma Miraflores', venta: 24000, dias_con_venta: 28, promedio_diario: 857.14 },
                            { id_empresa: 2, empresa: 'Shell Chalchuapa', venta: 30000, dias_con_venta: 28, promedio_diario: 1071.43 }
                        ]];
                    }
                    return [[]];
                }
            };

            const result = await getResumenMensualData({}, 2026, 9, mockSaasDb);
            assert.strictEqual(result.origen, 'db_sistema_saas (sys.sipesv.com)');
            assert.strictEqual(result.estaciones.length, 2);

            const miraflores = result.consolidado.find(c => c.empresa === 'Puma Miraflores');
            assert.ok(miraflores);
            assert.strictEqual(miraflores.ion, 7000); // Puma Miraflores sí tiene Ion Diésel
            assert.strictEqual(miraflores.venta_estacion, 250000);
            assert.strictEqual(miraflores.venta_tienda, 24000);
            assert.strictEqual(miraflores.venta_total, 274000);

            const chalchuapa = result.consolidado.find(c => c.empresa === 'Shell Chalchuapa');
            assert.ok(chalchuapa);
            assert.strictEqual(chalchuapa.ion, 0); // Shell Chalchuapa NO tiene Ion Diésel
            assert.strictEqual(chalchuapa.venta_estacion, 230000);
            assert.strictEqual(chalchuapa.venta_tienda, 30000);
            assert.strictEqual(chalchuapa.venta_total, 260000);
        });
    });

    describe('getComparativoAnualData validación y consolidación anual', () => {
        const getComparativoAnualData = consultasRouter.getComparativoAnualData;

        it('debe rechazar años fuera de rango o inválidos', async () => {
            await assert.rejects(async () => {
                await getComparativoAnualData({}, 1800, 2025);
            }, /Años inválidos para el comparativo/);

            await assert.rejects(async () => {
                await getComparativoAnualData({}, 2026, 'invalido');
            }, /Años inválidos para el comparativo/);
        });

        it('debe estructurar los 12 meses, calcular totales anuales, picos y YTD correctamente', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes("grupo = 'ESTACION'")) {
                        return [[
                            { id_empresa: '002', titulo: 'Puma Miraflores', orden: 1 },
                            { id_empresa: '006', titulo: 'Shell Chalchuapa', orden: 2 }
                        ]];
                    }
                    if (sql.includes('cierre_turno_lecturas')) {
                        // Devuelve datos para mes 1 (Enero) en 2026 y 2025
                        return [[
                            { anio: '2026', mes: 1, id_empresa: '002', diesel: 20000, regular: 15000, super: 25000, ion: 0, galonaje: 60000, venta_estacion: 240000 },
                            { anio: '2026', mes: 1, id_empresa: '006', diesel: 10000, regular: 10000, super: 10000, ion: 0, galonaje: 30000, venta_estacion: 120000 },
                            { anio: '2025', mes: 1, id_empresa: '002', diesel: 18000, regular: 12000, super: 20000, ion: 0, galonaje: 50000, venta_estacion: 200000 },
                            { anio: '2025', mes: 1, id_empresa: '006', diesel: 8000, regular: 8000, super: 9000, ion: 0, galonaje: 25000, venta_estacion: 100000 }
                        ]];
                    }
                    if (sql.includes('ventas_tienda')) {
                        return [[
                            { anio: '2026', mes: 1, id_empresa: '002', venta_tienda: 40000 },
                            { anio: '2025', mes: 1, id_empresa: '002', venta_tienda: 30000 }
                        ]];
                    }
                    if (sql.includes('DISTINCT anio')) {
                        return [[{ anio: '2026' }, { anio: '2025' }]];
                    }
                    return [[]];
                }
            };

            const result = await getComparativoAnualData(mockDb, 2026, 2025);
            assert.strictEqual(result.anioPrincipal, 2026);
            assert.strictEqual(result.anioComparar, 2025);
            assert.strictEqual(result.meses.length, 12);
            assert.strictEqual(result.estaciones.length, 2);

            // Mes 1 (Enero)
            const ene = result.meses[0];
            assert.strictEqual(ene.mes, 1);
            assert.strictEqual(ene.nombre, 'Enero');
            assert.strictEqual(ene.principal.galonaje, 90000); // 60k + 30k
            assert.strictEqual(ene.principal.venta_estacion, 360000); // 240k + 120k
            assert.strictEqual(ene.principal.venta_tienda, 40000);
            assert.strictEqual(ene.principal.venta_total, 400000); // 360k + 40k

            assert.strictEqual(ene.comparar.galonaje, 75000); // 50k + 25k
            assert.strictEqual(ene.comparar.venta_estacion, 300000); // 200k + 100k
            assert.strictEqual(ene.comparar.venta_tienda, 30000);
            assert.strictEqual(ene.comparar.venta_total, 330000);

            // Diferencia Enero
            assert.strictEqual(ene.diferencia.galonaje, 15000); // 90k - 75k
            assert.strictEqual(ene.diferencia.galonaje_pct, 20); // (15k / 75k) * 100
            assert.strictEqual(ene.diferencia.venta_total, 70000); // 400k - 330k
            assert.strictEqual(ene.diferencia.venta_total_pct, 21.2); // (70k / 330k) * 100 = 21.21% -> 21.2%

            // Por estación en Enero
            assert.strictEqual(ene.principal.por_estacion['002'].galonaje, 60000);
            assert.strictEqual(ene.principal.por_estacion['002'].venta_total, 280000); // 240k + 40k
            assert.strictEqual(ene.principal.por_estacion['006'].galonaje, 30000);
            assert.strictEqual(ene.principal.por_estacion['006'].venta_total, 120000);

            // Totales anuales
            assert.strictEqual(result.totales.principal.galonaje, 90000);
            assert.strictEqual(result.totales.principal.venta_total, 400000);
            assert.strictEqual(result.totales.comparar.galonaje, 75000);
            assert.strictEqual(result.totales.comparar.venta_total, 330000);

            // Pico
            assert.strictEqual(result.totales.picos.galonaje.mes, 1);
            assert.strictEqual(result.totales.picos.galonaje.valor, 90000);

            // YTD
            assert.strictEqual(result.totales.ytd.mes_corte, 1);
            assert.strictEqual(result.totales.ytd.principal.galonaje, 90000);
            assert.strictEqual(result.totales.ytd.comparar.galonaje, 75000);
            assert.strictEqual(result.totales.ytd.diferencia.galonaje, 15000);
        });
    });

    describe('getCortesTiendaData (Híbrido Legado y SaaS)', () => {
        const getCortesTiendaData = consultasRouter.getCortesTiendaData;

        it('debe mantener datos legados si existe corte con venta > 0', async () => {
            const mockExtDb = {
                query: async () => [[
                    { id_empresa: '002', tienda_nombre: 'E-Market Miraflores', id_corte: 101, fecha: '2026-06-01', turno: 1, responsable: 'Juan', venta: 3200, ingresos: 50, tarjeta: 800, remesado: 2400, gastos: 50, retiros: 0, saldo_f: 50, dif: 0, tiene_corte: 1 }
                ]]
            };
            const mockSaasDb = {
                query: async () => [[]]
            };

            const cortes = await getCortesTiendaData(mockExtDb, '2026-06-01', mockSaasDb);
            assert.strictEqual(cortes.length, 1);
            assert.strictEqual(cortes[0].id_corte, 101);
            assert.strictEqual(cortes[0].venta, 3200);
            assert.strictEqual(cortes[0].tiene_corte, true);
            assert.strictEqual(cortes[0].fuente, 'db_system_rrs');
        });

        it('debe complementar con SaaS cuando legado no tiene corte o registra $0.00', async () => {
            const mockExtDb = {
                query: async () => [[
                    { id_empresa: '014', tienda_nombre: 'E-Market San Martin', id_corte: null, fecha: '2026-10-01', turno: 0, responsable: '', venta: 0, ingresos: 0, tarjeta: 0, remesado: 0, gastos: 0, retiros: 0, saldo_f: 0, dif: 0, tiene_corte: 0 }
                ]]
            };
            const mockSaasDb = {
                query: async (sql) => {
                    if (sql.includes('FROM pos_shifts')) {
                        return [[
                            { id: 10, branch_id: 1, branch_nombre: 'Puma San Martin II', pos_nombre: 'Tienda 1', total_sales: 1366.99, total_incomes: 9.03, card_sales: 0, total_remesas: 1349.97, total_expenses: 16.30, actual_cash: 10, difference: 0, shift_number: 1, seller_nombre: 'Oscar Ruiz' }
                        ]];
                    }
                    if (sql.includes('FROM pos_shift_remesas')) {
                        return [[
                            { description: 'Venta POS Credomatic', amount: 373.27 },
                            { description: 'Remesa Banco Agricola', amount: 976.70 }
                        ]];
                    }
                    return [[]];
                }
            };

            const cortes = await getCortesTiendaData(mockExtDb, '2026-10-01', mockSaasDb);
            assert.strictEqual(cortes.length, 1);
            assert.strictEqual(cortes[0].id_corte, 'SAAS_1_2026-10-01');
            assert.strictEqual(cortes[0].empresa, 'E-Market San Martin');
            assert.strictEqual(cortes[0].venta, 1366.99);
            assert.strictEqual(cortes[0].tarjeta, 373.27);
            assert.strictEqual(cortes[0].remesado, 976.70);
            assert.strictEqual(cortes[0].gastos, 16.30);
            assert.strictEqual(cortes[0].responsable, 'Oscar Ruiz');
            assert.strictEqual(cortes[0].tiene_corte, true);
            assert.strictEqual(cortes[0].fuente, 'db_sistema_saas (sys.sipesv.com)');
        });
    });
});


