const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const {
    ANDELSA_COMPANY_ID,
    _setMockDb,
    getAndelsaInventarios,
    getAndelsaCostos,
    getAndelsaVentasPorCliente,
    getAndelsaVentasPorProducto,
    getAndelsaCuentasPorCobrar,
    getAndelsaFinanzasResumen
} = require('../services/sysSaasService');

describe('SysSaasService (Nova SaaS - Andelsa Integration)', () => {

    beforeEach(() => {
        _setMockDb(null);
    });

    afterEach(() => {
        _setMockDb(null);
    });

    describe('Configuración y Constantes', () => {
        it('debe tener company_id = 9 para ANDELSA, S.A. DE C.V.', () => {
            assert.strictEqual(ANDELSA_COMPANY_ID, 9);
        });
    });

    describe('1. getAndelsaInventarios (Modo Fallback Analítico)', () => {
        it('debe retornar inventarios con estructura y resumen correctos', async () => {
            const data = await getAndelsaInventarios({ limit: 5 });

            assert.ok(data);
            assert.strictEqual(data.isFallback, true);
            assert.ok(Array.isArray(data.items));
            assert.strictEqual(data.items.length, 5);

            // Verificar estructura del primer item
            const item = data.items[0];
            assert.ok(item.codigo);
            assert.ok(item.descripcion);
            assert.ok(item.categoria);
            assert.ok(typeof item.stock_actual === 'number');
            assert.ok(typeof item.costo_promedio === 'number');
            assert.ok(typeof item.valor_total === 'number');
            assert.ok(item.stock_actual > 0);
            assert.ok(item.valor_total > 0);

            // Verificar resumen
            assert.ok(data.resumen);
            assert.ok(data.resumen.total_articulos > 0);
            assert.ok(data.resumen.unidades_totales > 0);
            assert.ok(data.resumen.valor_total_usd > 0);
            assert.strictEqual(data.resumen.total_stock, data.resumen.unidades_totales);
        });

        it('debe filtrar correctamente por categoria', async () => {
            const data = await getAndelsaInventarios({ categoria: 'Lubricantes' });
            assert.ok(data.items.length > 0);
            data.items.forEach(it => {
                assert.strictEqual(it.categoria, 'Lubricantes');
            });
        });

        it('debe filtrar correctamente por término de búsqueda (search)', async () => {
            const data = await getAndelsaInventarios({ search: 'DIESEL' });
            assert.ok(data.items.length > 0);
            data.items.forEach(it => {
                const match = it.codigo.includes('DSL') || it.codigo.includes('OPT') || it.descripcion.includes('DIESEL');
                assert.ok(match, `Item ${it.codigo} debe coincidir con DIESEL`);
            });
        });
    });

    describe('2. getAndelsaCostos (Modo Fallback Analítico)', () => {
        it('debe retornar costos, último costo y margen estimado coherente', async () => {
            const data = await getAndelsaCostos({ limit: 10 });

            assert.ok(data);
            assert.strictEqual(data.isFallback, true);
            assert.ok(Array.isArray(data.items));
            assert.strictEqual(data.items.length, 10);

            const item = data.items[0];
            assert.ok(item.codigo);
            assert.ok(item.descripcion);
            assert.ok(typeof item.costo_promedio === 'number');
            assert.ok(typeof item.ultimo_costo === 'number');
            assert.ok(typeof item.precio_venta === 'number');
            assert.ok(typeof item.margen_estimado === 'number');

            // Margen debe ser coherente con fórmula: ((precio_venta - costo_promedio) / precio_venta) * 100
            const margenCalc = parseFloat((((item.precio_venta - item.costo_promedio) / item.precio_venta) * 100).toFixed(2));
            assert.ok(Math.abs(item.margen_estimado - margenCalc) < 0.05);

            // Resumen
            assert.ok(data.resumen);
            assert.strictEqual(data.resumen.total_productos, 10);
            assert.ok(data.resumen.costo_promedio_general > 0);
            assert.ok(data.resumen.margen_promedio > 0);
        });

        it('debe filtrar por search en costos', async () => {
            const data = await getAndelsaCostos({ search: 'MOBIL' });
            assert.ok(data.items.length >= 1);
            assert.ok(data.items[0].descripcion.includes('MOBIL'));
        });
    });

    describe('3. getAndelsaVentasPorCliente (Modo Fallback Analítico)', () => {
        it('debe retornar ranking con porcentaje de participación y resumen', async () => {
            const data = await getAndelsaVentasPorCliente({ limit: 5 });

            assert.ok(data);
            assert.strictEqual(data.isFallback, true);
            assert.ok(Array.isArray(data.ranking));
            assert.strictEqual(data.ranking.length, 5);

            const c = data.ranking[0];
            assert.ok(c.cliente);
            assert.ok(typeof c.transacciones === 'number' && c.transacciones > 0);
            assert.ok(typeof c.total_comprado === 'number' && c.total_comprado > 0);
            assert.ok(typeof c.porcentaje_participacion === 'number' && c.porcentaje_participacion > 0);

            // Resumen del período
            assert.ok(data.resumen);
            assert.ok(data.resumen.total_facturado > 0);
            assert.ok(data.resumen.total_clientes > 0);
            assert.ok(data.resumen.total_transacciones > 0);
            assert.ok(data.resumen.periodo);
            assert.ok(data.resumen.periodo.startDate);
            assert.ok(data.resumen.periodo.endDate);
        });

        it('debe filtrar por clienteSearch', async () => {
            const data = await getAndelsaVentasPorCliente({ clienteSearch: 'Águila' });
            assert.ok(data.ranking.length >= 1);
            assert.ok(data.ranking[0].cliente.includes('Águila'));
        });
    });

    describe('4. getAndelsaVentasPorProducto (Modo Fallback Analítico)', () => {
        it('debe retornar ranking de productos por unidades y monto', async () => {
            const data = await getAndelsaVentasPorProducto({ limit: 5 });

            assert.ok(data);
            assert.strictEqual(data.isFallback, true);
            assert.ok(Array.isArray(data.ranking));
            assert.strictEqual(data.ranking.length, 5);

            const p = data.ranking[0];
            assert.ok(p.codigo);
            assert.ok(p.producto);
            assert.ok(p.unidades_vendidas > 0);
            assert.ok(p.monto_total > 0);

            assert.ok(data.resumen);
            assert.ok(data.resumen.total_unidades > 0);
            assert.ok(data.resumen.monto_total_usd > 0);
            assert.ok(data.resumen.total_productos_distintos > 0);
            assert.ok(data.resumen.periodo);
        });

        it('debe filtrar por productoSearch', async () => {
            const data = await getAndelsaVentasPorProducto({ productoSearch: 'SUPER' });
            assert.ok(data.ranking.length >= 1);
            assert.ok(data.ranking[0].producto.includes('SUPER'));
        });
    });

    describe('5. getAndelsaCuentasPorCobrar (Modo Fallback Analítico)', () => {
        it('debe listar clientes deudores y resumen de cartera', async () => {
            const data = await getAndelsaCuentasPorCobrar({ limit: 5 });

            assert.ok(data);
            assert.strictEqual(data.isFallback, true);
            assert.ok(Array.isArray(data.clientes_deudores));
            assert.strictEqual(data.clientes_deudores.length, 5);

            const d = data.clientes_deudores[0];
            assert.ok(d.cliente);
            assert.ok(d.saldo_pendiente > 0);
            assert.ok(d.dias_credito > 0);
            assert.ok(d.limite !== undefined);

            assert.ok(data.resumen);
            assert.ok(data.resumen.total_cartera_por_cobrar > 0);
            assert.ok(data.resumen.total_clientes_deudores > 0);
        });
    });

    describe('6. getAndelsaFinanzasResumen (Modo Fallback Analítico)', () => {
        it('debe compilar todos los indicadores clave de Andelsa', async () => {
            const data = await getAndelsaFinanzasResumen({ startDate: '2026-10-01', endDate: '2026-10-31' });

            assert.ok(data);
            assert.strictEqual(data.isFallback, true);
            assert.ok(data.facturacion_total_usd > 0);
            assert.ok(data.unidades_vendidas > 0);
            assert.ok(data.valor_inventario_actual_usd > 0);
            assert.ok(data.cartera_por_cobrar_usd > 0);
            assert.ok(data.total_clientes_activos > 0);
            assert.strictEqual(data.periodo.startDate, '2026-10-01');
            assert.strictEqual(data.periodo.endDate, '2026-10-31');
        });
    });

    describe('Simulación con Pool MySQL Conectado (Modo DB)', () => {
        it('debe procesar getAndelsaInventarios desde base de datos', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes('COUNT(DISTINCT p.id)')) {
                        return [[{ total_articulos: 2, unidades_totales: 1500, valor_total_usd: 4800 }]];
                    }
                    return [[
                        { codigo: 'DSL-01', descripcion: 'DIESEL 50 PPM', categoria: 'Combustibles', stock_actual: 1000, costo_promedio: 3.20, valor_total: 3200 },
                        { codigo: 'REG-01', descripcion: 'GASOLINA REGULAR', categoria: 'Combustibles', stock_actual: 500, costo_promedio: 3.20, valor_total: 1600 }
                    ]];
                }
            };
            _setMockDb(mockDb);

            const result = await getAndelsaInventarios();
            assert.strictEqual(result.isFallback, false);
            assert.strictEqual(result.items.length, 2);
            assert.strictEqual(result.items[0].codigo, 'DSL-01');
            assert.strictEqual(result.resumen.total_articulos, 2);
            assert.strictEqual(result.resumen.valor_total_usd, 4800);
        });

        it('debe procesar getAndelsaCostos desde base de datos', async () => {
            const mockDb = {
                query: async () => {
                    return [[
                        { id: 1, codigo: 'DSL-01', descripcion: 'DIESEL 50 PPM', costo_promedio: 3.20, ultimo_costo: 3.25, precio_venta: 3.65 }
                    ]];
                }
            };
            _setMockDb(mockDb);

            const result = await getAndelsaCostos();
            assert.strictEqual(result.isFallback, false);
            assert.strictEqual(result.items.length, 1);
            assert.strictEqual(result.items[0].codigo, 'DSL-01');
            assert.strictEqual(result.items[0].margen_estimado, 12.33);
            assert.strictEqual(result.resumen.total_productos, 1);
        });

        it('debe procesar getAndelsaVentasPorCliente desde base de datos', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes('COUNT(sh.id) AS total_transacciones')) {
                        return [[{ total_transacciones: 15, total_facturado: 10000, total_clientes: 2 }]];
                    }
                    return [[
                        { customer_id: 10, cliente: 'Transporte Sol', transacciones: 10, total_comprado: 7500 },
                        { customer_id: 11, cliente: 'Agro Campo', transacciones: 5, total_comprado: 2500 }
                    ]];
                }
            };
            _setMockDb(mockDb);

            const result = await getAndelsaVentasPorCliente();
            assert.strictEqual(result.isFallback, false);
            assert.strictEqual(result.ranking.length, 2);
            assert.strictEqual(result.ranking[0].porcentaje_participacion, 75.0);
            assert.strictEqual(result.ranking[1].porcentaje_participacion, 25.0);
            assert.strictEqual(result.resumen.total_facturado, 10000);
        });

        it('debe procesar getAndelsaVentasPorProducto desde base de datos', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes('total_unidades')) {
                        return [[{ total_unidades: 2500, monto_total_usd: 8500, total_productos_distintos: 2 }]];
                    }
                    return [[
                        { codigo: 'DSL-01', producto: 'DIESEL 50 PPM', unidades_vendidas: 1500, monto_total: 5400 },
                        { codigo: 'REG-01', producto: 'GASOLINA REGULAR', unidades_vendidas: 1000, monto_total: 3100 }
                    ]];
                }
            };
            _setMockDb(mockDb);

            const result = await getAndelsaVentasPorProducto();
            assert.strictEqual(result.isFallback, false);
            assert.strictEqual(result.ranking.length, 2);
            assert.strictEqual(result.resumen.total_unidades, 2500);
        });

        it('debe procesar getAndelsaCuentasPorCobrar desde base de datos', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes('total_cartera')) {
                        return [[{ total_cartera: 5200.50 }]];
                    }
                    return [[
                        { customer_id: 1, cliente: 'Cliente A', dias_credito: 15, limite: null, saldo_pendiente: 3200.50, facturas_pendientes: 2 },
                        { customer_id: 2, cliente: 'Cliente B', dias_credito: 30, limite: null, saldo_pendiente: 2000.00, facturas_pendientes: 1 }
                    ]];
                }
            };
            _setMockDb(mockDb);

            const result = await getAndelsaCuentasPorCobrar();
            assert.strictEqual(result.isFallback, false);
            assert.strictEqual(result.clientes_deudores.length, 2);
            assert.strictEqual(result.resumen.total_cartera_por_cobrar, 5200.50);
        });

        it('debe procesar getAndelsaFinanzasResumen desde base de datos', async () => {
            const mockDb = {
                query: async (sql) => {
                    if (sql.includes('facturacion_total_usd')) {
                        return [[{ facturacion_total_usd: 50000, transacciones_totales: 120 }]];
                    }
                    if (sql.includes('unidades_vendidas')) {
                        return [[{ unidades_vendidas: 14000 }]];
                    }
                    if (sql.includes('valor_inventario_usd')) {
                        return [[{ valor_inventario_usd: 25000 }]];
                    }
                    if (sql.includes('cartera_por_cobrar')) {
                        return [[{ cartera_por_cobrar: 8000 }]];
                    }
                    if (sql.includes('total_clientes')) {
                        return [[{ total_clientes: 35 }]];
                    }
                    return [[]];
                }
            };
            _setMockDb(mockDb);

            const result = await getAndelsaFinanzasResumen();
            assert.strictEqual(result.isFallback, false);
            assert.strictEqual(result.facturacion_total_usd, 50000);
            assert.strictEqual(result.unidades_vendidas, 14000);
            assert.strictEqual(result.valor_inventario_actual_usd, 25000);
            assert.strictEqual(result.cartera_por_cobrar_usd, 8000);
            assert.strictEqual(result.total_clientes_activos, 35);
        });

        it('debe activar fallback automáticamente si el pool falla con excepción', async () => {
            const mockFaultyDb = {
                query: async () => {
                    const err = new Error('Connection lost');
                    err.code = 'PROTOCOL_CONNECTION_LOST';
                    throw err;
                }
            };
            _setMockDb(mockFaultyDb);

            const invResult = await getAndelsaInventarios();
            assert.strictEqual(invResult.isFallback, true);
            assert.ok(invResult.items.length > 0);

            const costosResult = await getAndelsaCostos();
            assert.strictEqual(costosResult.isFallback, true);

            const ventasResult = await getAndelsaVentasPorCliente();
            assert.strictEqual(ventasResult.isFallback, true);

            const finanzasResult = await getAndelsaFinanzasResumen();
            assert.strictEqual(finanzasResult.isFallback, true);
        });
    });
});
