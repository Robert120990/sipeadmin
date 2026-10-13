const { describe, it } = require('node:test');
const assert = require('node:assert');

const solarEnergyService = require('../services/solarEnergyService');
const sysSaasService = require('../services/sysSaasService');
const {
    formatSolarEnergyMessage,
    getSolarInlineMarkup,
    formatAndelsaInventarioMessage,
    formatAndelsaCostosMessage,
    formatAndelsaVentasClienteMessage,
    formatAndelsaVentasProductoMessage,
    formatAndelsaCxcMessage,
    formatAndelsaFinanzasResumenMessage,
    getAndelsaInlineMarkup,
    parseNaturalLanguageQuery
} = require('../services/telegramBotService');

describe('Andelsa & Solar Telegram Bot Comprehensive Tests', () => {

    describe('1. Verificación Solar Anti-Cero ($0.00 Bug Fix)', () => {
        it('getSolarAhorroDiario NUNCA debe retornar $0.00 y debe poblar dual naming idéntico', async () => {
            const data = await solarEnergyService.getSolarAhorroDiario('2026-10-12');
            assert.ok(data);
            assert.ok(data.total_ahorro_usd > 0, `total_ahorro_usd debe ser > 0, recibido: ${data.total_ahorro_usd}`);
            assert.ok(data.ahorro_total_usd > 0, `ahorro_total_usd debe ser > 0, recibido: ${data.ahorro_total_usd}`);
            assert.strictEqual(data.total_ahorro_usd, data.ahorro_total_usd);

            // Formatear mensaje y asegurar que no contenga $0.00
            const msg = formatSolarEnergyMessage(data, 'diario', '12/10/2026');
            assert.ok(!msg.includes('$0.00'), 'El mensaje formateado no debe contener $0.00');
            assert.ok(msg.includes('Ahorro Diario:'), 'Debe incluir encabezado de ahorro');
            assert.ok(msg.includes('Batería BESS Andelsa (60 kWh)'), 'Debe incluir la etiqueta de la batería de Andelsa');
        });

        it('getSolarAhorroMensual NUNCA debe retornar $0.00 y debe formatearse ejecutivamente', async () => {
            const data = await solarEnergyService.getSolarAhorroMensual(2026, 10);
            assert.ok(data);
            assert.ok(data.total_ahorro_usd > 0);
            assert.ok(data.ahorro_total_usd > 0);
            assert.strictEqual(data.total_ahorro_usd, data.ahorro_total_usd);

            const msg = formatSolarEnergyMessage(data, 'mensual', 'Octubre 2026');
            assert.ok(!msg.includes('$0.00'));
            assert.ok(msg.includes('Ahorro Mensual Acumulado:'));
        });

        it('getSolarAhorroRango NUNCA debe retornar $0.00', async () => {
            const data = await solarEnergyService.getSolarAhorroRango('2026-10-01', '2026-10-10');
            assert.ok(data);
            assert.ok(data.total_ahorro_usd > 0);
            assert.ok(data.ahorro_total_usd > 0);

            const msg = formatSolarEnergyMessage(data, 'rango', 'Del 01/10/2026 al 10/10/2026');
            assert.ok(!msg.includes('$0.00'));
        });

        it('getSolarEstadoActual debe reportar 95 kWp total y batería BESS Andelsa (60 kWh)', async () => {
            const estado = await solarEnergyService.getSolarEstadoActual();
            assert.strictEqual(estado.potencia_total_kwp, 95.0);
            assert.strictEqual(estado.capacidad_bateria_total_kwh, 60.0);

            const msg = formatSolarEnergyMessage(estado, 'estado_actual');
            assert.ok(msg.includes('Capacidad Solar Total:'));
            assert.ok(msg.includes('95 kWp'));
            assert.ok(msg.includes('BESS Total:</b> <code>60 kWh</code> (Andelsa)'));
            assert.ok(msg.includes('Andelsa:'));
            assert.ok(msg.includes('San Martín (La Loma):'));
        });

        it('debe filtrar solar específicamente para Andelsa', async () => {
            const data = await solarEnergyService.getSolarAhorroDiario('2026-10-12', 'andelsa');
            assert.strictEqual(data.desglose_por_estacion.length, 1);
            assert.strictEqual(data.desglose_por_estacion[0].estacion_nombre, 'Andelsa');
            assert.ok(data.total_ahorro_usd > 0);

            const msg = formatSolarEnergyMessage(data, 'diario', '12/10/2026 • Andelsa');
            assert.ok(msg.includes('Andelsa'));
            assert.ok(!msg.includes('$0.00'));
        });

        it('debe filtrar solar específicamente para San Martín (La Loma)', async () => {
            const data = await solarEnergyService.getSolarAhorroDiario('2026-10-12', 'la loma');
            assert.strictEqual(data.desglose_por_estacion.length, 1);
            assert.strictEqual(data.desglose_por_estacion[0].estacion_nombre, 'San Martín (La Loma)');
            assert.ok(data.total_ahorro_usd > 0);

            const msg = formatSolarEnergyMessage(data, 'diario', '12/10/2026 • San Martín (La Loma)');
            assert.ok(msg.includes('San Martín (La Loma)'));
            assert.ok(!msg.includes('$0.00'));
        });
    });

    describe('2. NLU Semántico para Andelsa / sys.sipesv.com (Nova SaaS)', () => {
        it('debe identificar consultas de inventario de Andelsa', () => {
            const p1 = parseNaturalLanguageQuery('inventario andelsa');
            assert.ok(p1.isAndelsaInventario, 'Debe detectar isAndelsaInventario');

            const p2 = parseNaturalLanguageQuery('stock y existencia de planta andelsa');
            assert.ok(p2.isAndelsaInventario);
        });

        it('debe identificar consultas de costos y márgenes de Andelsa', () => {
            const p1 = parseNaturalLanguageQuery('costos andelsa');
            assert.ok(p1.isAndelsaCostos, 'Debe detectar isAndelsaCostos');

            const p2 = parseNaturalLanguageQuery('margenes y utilidad de andelsa');
            assert.ok(p2.isAndelsaCostos);
        });

        it('debe identificar consultas de cuentas por cobrar (CXC) de Andelsa', () => {
            const p1 = parseNaturalLanguageQuery('cxc andelsa');
            assert.ok(p1.isAndelsaCxc, 'Debe detectar isAndelsaCxc');

            const p2 = parseNaturalLanguageQuery('cuentas por cobrar de andelsa');
            assert.ok(p2.isAndelsaCxc);

            const p3 = parseNaturalLanguageQuery('cartera y morosidad andelsa');
            assert.ok(p3.isAndelsaCxc);
        });

        it('debe identificar consultas de ventas por cliente de Andelsa', () => {
            const p1 = parseNaturalLanguageQuery('ventas por cliente andelsa');
            assert.ok(p1.isAndelsaVentasCliente, 'Debe detectar isAndelsaVentasCliente');

            const p2 = parseNaturalLanguageQuery('clientes de andelsa facturacion');
            assert.ok(p2.isAndelsaVentasCliente);
        });

        it('debe identificar consultas de ventas por producto de Andelsa', () => {
            const p1 = parseNaturalLanguageQuery('ventas por producto andelsa');
            assert.ok(p1.isAndelsaVentasProducto, 'Debe detectar isAndelsaVentasProducto');

            const p2 = parseNaturalLanguageQuery('productos mas vendidos de andelsa');
            assert.ok(p2.isAndelsaVentasProducto);
        });

        it('debe identificar consultas de resumen financiero de Andelsa', () => {
            const p1 = parseNaturalLanguageQuery('resumen financiero andelsa');
            assert.ok(p1.isAndelsaFinanzasResumen, 'Debe detectar isAndelsaFinanzasResumen');

            const p2 = parseNaturalLanguageQuery('finanzas andelsa');
            assert.ok(p2.isAndelsaFinanzasResumen);
        });

        it('debe discernir correctamente entre solar de Andelsa y finanzas de Andelsa', () => {
            const solarQuery = parseNaturalLanguageQuery('paneles solares de andelsa');
            assert.ok(solarQuery.isSolar, 'Debe marcar isSolar');
            assert.strictEqual(solarQuery.matchedStation?.id, 'ANDELSA');
            assert.strictEqual(solarQuery.isAndelsaFinanzasResumen, false, 'No debe confundirse con finanzas');

            const solarRealtime = parseNaturalLanguageQuery('bateria andelsa estado actual');
            assert.ok(solarRealtime.isSolar);
            assert.strictEqual(solarRealtime.matchedStation?.id, 'ANDELSA');
        });
    });

    describe('3. Formateadores Ejecutivos de Andelsa (sys.sipesv.com)', () => {
        it('formatAndelsaInventarioMessage debe estructurar KPIs y categorías', async () => {
            const data = await sysSaasService.getAndelsaInventarios();
            const msg = formatAndelsaInventarioMessage(data);

            assert.ok(msg.includes('INVENTARIO ANDELSA (Nova SaaS)'));
            assert.ok(msg.includes('Valor Total de Inventario:'));
            assert.ok(msg.includes('Ítems Principales en Stock:'));
            assert.ok(msg.includes('sys.sipesv.com'));
        });

        it('formatAndelsaCostosMessage debe estructurar márgenes y análisis de precios', async () => {
            const data = await sysSaasService.getAndelsaCostos();
            const msg = formatAndelsaCostosMessage(data);

            assert.ok(msg.includes('ANÁLISIS DE COSTOS Y MÁRGENES ANDELSA'));
            assert.ok(msg.includes('Margen Promedio Ponderado:'));
            assert.ok(msg.includes('Estructura de Precios y Margen:'));
        });

        it('formatAndelsaVentasClienteMessage debe rankear clientes con medallas', async () => {
            const data = await sysSaasService.getAndelsaVentasPorCliente();
            const msg = formatAndelsaVentasClienteMessage(data, 'Octubre 2026');

            assert.ok(msg.includes('VENTAS POR CLIENTE ANDELSA'));
            assert.ok(msg.includes('Facturación Total:'));
            assert.ok(msg.includes('🥇'));
        });

        it('formatAndelsaVentasProductoMessage debe listar top productos', async () => {
            const data = await sysSaasService.getAndelsaVentasPorProducto();
            const msg = formatAndelsaVentasProductoMessage(data, 'Octubre 2026');

            assert.ok(msg.includes('VENTAS POR PRODUCTO ANDELSA'));
            assert.ok(msg.includes('Volumen Total:'));
            assert.ok(msg.includes('🥇'));
        });

        it('formatAndelsaCxcMessage debe estructurar cartera al día vs mora', async () => {
            const data = await sysSaasService.getAndelsaCuentasPorCobrar();
            const msg = formatAndelsaCxcMessage(data);

            assert.ok(msg.includes('CUENTAS POR COBRAR (CXC) ANDELSA'));
            assert.ok(msg.includes('Cartera Total por Cobrar:'));
            assert.ok(msg.includes('Cartera Al Día (Vigente):'));
            assert.ok(msg.includes('Cartera Vencida en Mora:'));
        });

        it('formatAndelsaFinanzasResumenMessage debe consolidar los KPIs principales', async () => {
            const data = await sysSaasService.getAndelsaFinanzasResumen();
            const msg = formatAndelsaFinanzasResumenMessage(data, 'Mes Actual');

            assert.ok(msg.includes('RESUMEN FINANCIERO Y OPERATIVO ANDELSA'));
            assert.ok(msg.includes('Facturación Acumulada:'));
            assert.ok(msg.includes('Valor de Inventario Actual:'));
            assert.ok(msg.includes('Cartera por Cobrar (CXC):'));
        });

        it('getAndelsaInlineMarkup y getSolarInlineMarkup deben generar botones interactivos válidos', () => {
            const markupAndelsa = getAndelsaInlineMarkup();
            assert.ok(markupAndelsa.inline_keyboard.length >= 3);
            const callbacksAndelsa = markupAndelsa.inline_keyboard.flat().map(b => b.callback_data);
            assert.ok(callbacksAndelsa.includes('andelsa_inv'));
            assert.ok(callbacksAndelsa.includes('andelsa_costos'));
            assert.ok(callbacksAndelsa.includes('andelsa_cxc'));
            assert.ok(callbacksAndelsa.includes('andelsa_cli'));
            assert.ok(callbacksAndelsa.includes('andelsa_prod'));
            assert.ok(callbacksAndelsa.includes('andelsa_resumen'));

            const markupSolar = getSolarInlineMarkup();
            assert.ok(markupSolar.inline_keyboard.length >= 2);
            const callbacksSolar = markupSolar.inline_keyboard.flat().map(b => b.callback_data);
            assert.ok(callbacksSolar.includes('solar_andelsa'));
            assert.ok(callbacksSolar.includes('solar_sanmartin'));
            assert.ok(callbacksSolar.includes('solar_realtime'));
        });
    });
});
