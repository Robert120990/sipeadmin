process.env.NODE_ENV = 'test';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
    getDateStr,
    parseNaturalLanguageQuery
} = require('../services/telegramTextAndDates');
const {
    formatVentasMessage,
    formatSpecificStationMessage,
    formatTanquesAutonomiaMessage,
    formatPedidosPumaMessage,
    formatRentabilidadEbitdaMessage,
    formatTransitoValesMessage
} = require('../services/telegramFormatters');
const {
    classifyNegativeFeedback,
    analyzeNegativeFeedbackBatch,
    generateImprovedResponseForFeedback
} = require('../services/telegramFeedbackEvaluator');
const { buildLiveProjectContext } = require('../services/conversationalAiService');

describe('Mejora Integral de Respuestas Negativas del Bot de Telegram (4 Pilares)', () => {

    describe('Pilar 1 y 2: Desambiguación NLU y Nuevos Intents Deterministas', () => {
        it('debe desambiguar autonomía de tanques/combustible vs energía solar', () => {
            const qTanques = parseNaturalLanguageQuery('¿Cuál es la autonomía de los tanques de diésel en Costa del Sol?');
            assert.ok(qTanques);
            assert.strictEqual(qTanques.isTanques, true);
            assert.strictEqual(qTanques.isSolar, false);
            assert.strictEqual(qTanques.matchedFuel?.key, 'diesel');
            assert.strictEqual(qTanques.matchedStation?.id, '008');

            const qSolar = parseNaturalLanguageQuery('Estado actual de paneles solares y batería de Andelsa');
            assert.ok(qSolar);
            assert.strictEqual(qSolar.isSolar, true);
            assert.strictEqual(qSolar.isTanques, false);
        });

        it('debe detectar consultas de Pedidos Puma, Rentabilidad EBITDA, Tránsito/Vales y Chequera vs Bancos', () => {
            const qPedidos = parseNaturalLanguageQuery('¿Qué pedidos Puma están retenidos o en tránsito?');
            assert.ok(qPedidos);
            assert.strictEqual(qPedidos.isPedidosPuma, true);

            const qEbitda = parseNaturalLanguageQuery('Muéstrame la rentabilidad EBITDA por estación');
            assert.ok(qEbitda);
            assert.strictEqual(qEbitda.isRentabilidad, true);

            const qTransito = parseNaturalLanguageQuery('¿Cuánto dinero en tránsito y vales sin facturar tenemos?');
            assert.ok(qTransito);
            assert.strictEqual(qTransito.isTransitoVales, true);

            const qChequera = parseNaturalLanguageQuery('¿Cuánto tenemos disponible en chequera?');
            assert.ok(qChequera);
            assert.strictEqual(qChequera.isChequera, true);
            assert.strictEqual(qChequera.isBancosGlobal, false);

            const qBancos = parseNaturalLanguageQuery('¿Cuánto dinero hay en las cuentas bancarias?');
            assert.ok(qBancos);
            assert.strictEqual(qBancos.isBancosGlobal, true);
            assert.strictEqual(qBancos.isChequera, false);
        });
    });

    describe('Pilar 2: Manejo Inteligente de «Hoy» (Turnos en Curso) y Nuevos Formateadores', () => {
        it('formatVentasMessage debe explicar turnos abiertos de hoy e incluir referencia del último cierre', () => {
            const today = getDateStr(0);
            const yesterday = getDateStr(-1);
            const msg = formatVentasMessage(
                { estaciones: [], tiendas: [] },
                today,
                {
                    isTodayOpenShift: true,
                    latestClosedRef: {
                        date: yesterday,
                        data: {
                            estaciones: [{ empresa: 'Puma Miraflores', galonaje: 5000, venta: 20000 }],
                            tiendas: [{ empresa: 'Super 7 Miraflores', venta: 1500 }]
                        }
                    }
                }
            );

            assert.ok(msg.includes('TURNOS DE HOY EN CURSO'));
            assert.ok(msg.includes('REFERENCIA — ÚLTIMO CIERRE CONSOLIDADO'));
            assert.ok(msg.includes('5,000.00 gal'));
            assert.ok(msg.includes('$21,500.00'));
        });

        it('formatSpecificStationMessage debe explicar turnos abiertos de hoy por estación con referencia', () => {
            const today = getDateStr(0);
            const yesterday = getDateStr(-1);
            const msg = formatSpecificStationMessage(
                { empresa: 'Puma Miraflores', galonaje: 0, venta: 0 },
                null,
                today,
                null,
                {
                    stationName: 'Puma Miraflores',
                    isTodayOpenShift: true,
                    latestClosedRef: {
                        date: yesterday,
                        estacion: { empresa: 'Puma Miraflores', galonaje: 4200, venta: 16800 }
                    }
                }
            );

            assert.ok(msg.includes('Turnos de hoy en curso'));
            assert.ok(msg.includes('4,200.00 gal'));
            assert.ok(msg.includes('$16,800.00'));
        });

        it('los nuevos formateadores ejecutivos deben estructurar métricas reales en HTML limpio', () => {
            const msgTanques = formatTanquesAutonomiaMessage({
                fecha_ultimo_cierre: '2026-11-13',
                tanques: [
                    {
                        estacion: 'Puma Costa del Sol',
                        tipo_combustible: 'Diesel',
                        stock_actual: 1850,
                        capacidad: 10000,
                        ullage_disponible_gal: 8150,
                        porcentaje_ocupacion: 18.5,
                        horas_autonomia: 14.2,
                        cobertura_logistica: 'emergencia_real'
                    },
                    {
                        estacion: 'Puma Miraflores',
                        tipo_combustible: 'Regular',
                        stock_actual: 5400,
                        capacidad: 10000,
                        ullage_disponible_gal: 4600,
                        porcentaje_ocupacion: 54,
                        horas_autonomia: 38.5,
                        cobertura_logistica: 'cubierto_en_ruta',
                        galones_en_ruta: 4000
                    }
                ]
            });
            assert.ok(msgTanques.includes('INVENTARIO DE TANQUES Y AUTONOMÍA'));
            assert.ok(msgTanques.includes('Puma Costa del Sol'));
            assert.ok(msgTanques.includes('14.2h'));
            assert.ok(msgTanques.includes('Urge pedir'));

            const msgPedidos = formatPedidosPumaMessage({
                resumen: { total_activos: 2, en_transito: 1, retenidos: 1, pendientes: 0, monto_activo_usd: 21000, saldo_facturas_pendiente_usd: 18500 },
                pedidos: [
                    {
                        numero_orden: '900123',
                        estacion_nombre: 'Puma San Martín',
                        estado: 'Retenido por Crédito',
                        es_retenido: true,
                        es_activo: true,
                        total_galones: 6000,
                        monto_total: 21000
                    }
                ]
            });
            assert.ok(msgPedidos.includes('PEDIDOS DE COMBUSTIBLE — PORTAL PUMA'));
            assert.ok(msgPedidos.includes('#900123'));
            assert.ok(msgPedidos.includes('Puma San Martín'));

            const msgEbitda = formatRentabilidadEbitdaMessage({
                periodo: { desde: '2026-10-15', hasta: '2026-11-13', dias: 30 },
                resumen_consolidado: {
                    ingresos_totales: 450000,
                    galones_totales: 115000,
                    margen_bruto_total: 52000,
                    ahorro_solar_total_usd: 2400,
                    utilidad_operativa_total: 36400,
                    margen_neto_promedio_galon: 0.316
                },
                estaciones: [
                    { estacion: 'Puma Miraflores', ingresos_totales: 150000, margen_bruto_total: 18000, utilidad_operativa_neta: 12500 }
                ]
            });
            assert.ok(msgEbitda.includes('RENTABILIDAD OPERATIVA Y EBITDA REAL'));
            assert.ok(msgEbitda.includes('$36,400.00'));

            const msgTransito = formatTransitoValesMessage({
                ventana_dias: 14,
                resumen: {
                    remesas_pista_usd: 95000,
                    abonos_bancos_identificados_usd: 91500,
                    efectivo_en_transito_48h_usd: 3500,
                    partidas_transito_count: 2,
                    vales_sin_facturar_72h_usd: 1200,
                    vales_sin_facturar_count: 3
                },
                remesas_en_transito_48h: [
                    { estacion: 'Shell Chalchuapa', fecha: '2026-11-10', dias_transito: 4, diferencia_pendiente_usd: 2100 }
                ],
                vales_sin_facturar_72h: [
                    { cliente: 'Transporte Norte', estacion: 'Puma Miraflores', dias_antiguedad: 5, monto_usd: 650 }
                ]
            });
            assert.ok(msgTransito.includes('AUDITORÍA DE EFECTIVO EN TRÁNSITO Y VALES'));
            assert.ok(msgTransito.includes('Shell Chalchuapa'));
            assert.ok(msgTransito.includes('Transporte Norte'));
        });
    });

    describe('Pilar 1: Contexto 360° Verificado en Agente Conversacional', () => {
        it('buildLiveProjectContext debe retornar estructura válida con tanques_autonomia.tanques (arreglo) y pedidos_puma', async () => {
            const ctx = await buildLiveProjectContext();
            assert.ok(ctx);
            assert.ok(ctx.tanques_autonomia && Array.isArray(ctx.tanques_autonomia.tanques));
            assert.ok(ctx.pedidos_puma && typeof ctx.pedidos_puma === 'object' && Array.isArray(ctx.pedidos_puma.ordenes_recientes));
            assert.ok(ctx.energia_solar && typeof ctx.energia_solar === 'object');
        });
    });

    describe('Pilar 4: Evaluador Forense y Regenerador de Respuestas Negativas', () => {
        it('classifyNegativeFeedback debe identificar con precisión las causas raíz históricas', () => {
            const c1 = classifyNegativeFeedback({
                consulta_original: 'Autonomía de tanques de diésel',
                respuesta_resumen: 'Solar Estado Actual'
            });
            assert.strictEqual(c1.codigo_causa, 'COLISION_SOLAR_TANQUES');

            const c2 = classifyNegativeFeedback({
                consulta_original: 'Ventas de hoy',
                respuesta_resumen: 'VENTAS DE ESTACIONES | Total: $0.00 | 0.00 gal'
            });
            assert.strictEqual(c2.codigo_causa, 'TURNOS_HOY_EN_CERO');

            const c3 = classifyNegativeFeedback({
                consulta_original: 'hola necesito ver algo raro',
                respuesta_resumen: 'Comando no reconocido'
            });
            assert.strictEqual(c3.codigo_causa, 'COMANDO_NO_RECONOCIDO');

            const c4 = classifyNegativeFeedback({
                consulta_original: '¿Cómo va el flujo de efectivo vs inventario?',
                respuesta_resumen: 'Asistente IA Gemini'
            });
            assert.strictEqual(c4.codigo_causa, 'CONTEXTO_IA_INCOMPLETO');

            const c5 = classifyNegativeFeedback({
                consulta_original: 'Pedidos Puma retenidos',
                respuesta_resumen: 'Conversación'
            });
            assert.strictEqual(c5.codigo_causa, 'MODULO_EJECUTIVO_NUEVO');

            const c6 = classifyNegativeFeedback({
                consulta_original: 'Ventas de Miraflores',
                respuesta_resumen: 'Fecha: 2026-11-13',
                comentario_mejora: 'Quería ver todo el mes de octubre completo'
            });
            assert.strictEqual(c6.codigo_causa, 'PRECISION_PERIODO_ALCANCE');
        });

        it('analyzeNegativeFeedbackBatch debe agrupar estadísticas y causas raíz sobre lote NO_UTIL', async () => {
            const batch = await analyzeNegativeFeedbackBatch([
                {
                    id: 1,
                    consulta_original: 'Autonomía de tanques de diésel',
                    respuesta_resumen: 'Solar Estado Actual',
                    comentario_mejora: 'Me dio paneles solares en vez de tanques',
                    estado: 'COMPLETADO',
                    notas_resolucion: 'Autocorregido en vivo (NLU determinista)'
                },
                {
                    id: 2,
                    consulta_original: 'Ventas de hoy',
                    respuesta_resumen: '$0.00',
                    comentario_mejora: '',
                    estado: 'ABIERTO',
                    notas_resolucion: null
                }
            ]);

            assert.strictEqual(batch.total_negativas, 2);
            assert.strictEqual(batch.con_comentario, 1);
            assert.strictEqual(batch.autocorregidas, 1);
            assert.strictEqual(batch.por_categoria.length, 2);
            assert.strictEqual(batch.items[0].intent_actual.codigo, 'TANQUES_AUTONOMIA');
        });

        it('generateImprovedResponseForFeedback debe combinar consulta_original + comentario_mejora y regenerar respuesta superior', async () => {
            const regenMonthly = await generateImprovedResponseForFeedback({
                id: 10,
                consulta_original: 'Ventas de Miraflores',
                comentario_mejora: 'del mes de octubre 2026',
                respuesta_resumen: 'Fecha: ayer'
            }, { useAiFallback: false });

            assert.strictEqual(regenMonthly.ok, true);
            assert.strictEqual(regenMonthly.intent_detectado.codigo, 'VENTAS_MENSUALES');
            assert.ok(regenMonthly.nueva_respuesta_html.includes('OCTUBRE 2026'));

            const regenToday = await generateImprovedResponseForFeedback({
                id: 11,
                consulta_original: 'Ventas de hoy',
                comentario_mejora: '',
                respuesta_resumen: '$0.00'
            }, { useAiFallback: false });

            assert.strictEqual(regenToday.ok, true);
            assert.strictEqual(regenToday.intent_detectado.codigo, 'VENTAS_GLOBALES');
            assert.ok(
                regenToday.nueva_respuesta_html.includes('TURNOS DE HOY EN CURSO') ||
                regenToday.nueva_respuesta_html.includes('VENTAS') ||
                regenToday.nueva_respuesta_html.includes('Estaciones')
            );
        });
    });
});
