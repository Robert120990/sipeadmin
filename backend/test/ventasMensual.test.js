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
});
