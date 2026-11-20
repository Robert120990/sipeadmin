const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    parseNaturalLanguageQuery,
    KNOWN_ACCOUNT_HOLDERS,
    KNOWN_STORE_LINES
} = require('../services/telegramTextAndDates');
const {
    filterBankOrChequeraAccounts
} = require('../services/telegramDataService');
const {
    formatBancosMessage,
    formatChequeraMessage,
    formatVentasTiendaLineaMessage,
    formatPeakDayVentasMessage,
    formatPagosProgramadosMessage
} = require('../services/telegramFormatters');
const {
    detectIntentInfo,
    classifyNegativeFeedback
} = require('../services/telegramFeedbackEvaluator');

describe('Mejoras NLU de Telegram Basadas en Retroalimentación y Sugerencias', () => {
    it('1. Detecta consulta de precios de competencia (#30 y #28)', () => {
        const parsed = parseNaturalLanguageQuery('Precios competencia');
        assert.equal(parsed.isCompetencia, true);

        const intent = detectIntentInfo('Precios competencia', 'Me compartió únicamente venta totales, y solicite precios de competência');
        assert.equal(intent.codigo, 'PRECIOS_COMPETENCIA');
    });

    it('2. Detecta filtro por contribuyente/titular, banco o número de cuenta en chequera/bancos (#15)', () => {
        const parsedLil = parseNaturalLanguageQuery('Saldo chequera inversiones lil');
        assert.equal(parsedLil.isChequera, true);
        assert.ok(parsedLil.matchedAccountHolder);
        assert.equal(parsedLil.matchedAccountHolder.key, 'INVERSIONES LIL');
        assert.equal(parsedLil.hasAccountFilterIntent, true);

        const parsedAndelsa = parseNaturalLanguageQuery('Saldo banco andelsa');
        assert.equal(parsedAndelsa.isBancosGlobal, true);
        assert.equal(parsedAndelsa.isAndelsaRelated, false, 'No debe ser secuestrado por Andelsa ERP cuando pide saldo banco/chequera');
        assert.ok(parsedAndelsa.matchedAccountHolder);
        assert.equal(parsedAndelsa.matchedAccountHolder.key, 'ANDELSA');

        const parsedNum = parseNaturalLanguageQuery('Saldo cuenta #1724');
        assert.equal(parsedNum.matchedAccountNumber, '1724');
        assert.equal(parsedNum.hasAccountFilterIntent, true);
    });

    it('3. Filtra correctamente cuentas de chequera o banco por contribuyente, banco o número (#15)', () => {
        const sampleChequera = {
            fecha: '2026-11-20',
            total: 317275.44,
            cuentas: [
                { banco: 'ATLANTIDA - INVERSIONES LIL #1724', raw_nom_banco: 'ATLANTIDA - ATLANTIDA - INVERSIONES LIL #1724', num_cta: '1724', saldo: 153000 },
                { banco: 'AMERICA CENTRAL - INVERSIONES LIL SA DE CV', raw_nom_banco: 'AMERICA CENTRAL - INVERSIONES LIL SA DE CV', num_cta: '200105', saldo: 47000 },
                { banco: 'AGRICOLA - INVERSIONES CMR', raw_nom_banco: 'AGRICOLA - INVERSIONES CMR', num_cta: '9988', saldo: 117275.44 }
            ]
        };

        const holderLil = KNOWN_ACCOUNT_HOLDERS.find(h => h.key === 'INVERSIONES LIL');
        const filtered = filterBankOrChequeraAccounts(sampleChequera, { matchedAccountHolder: holderLil });
        assert.equal(filtered.cuentas.length, 2);
        assert.equal(filtered.total, 200000);
        assert.equal(filtered.filterLabel, 'Inversiones LIL, S.A. de C.V.');

        const html = formatChequeraMessage(filtered);
        assert.match(html, /Contribuyente \/ Filtro:/i);
        assert.match(html, /Inversiones LIL/);
        assert.match(html, /\$200,000\.00/);

        const htmlBancos = formatBancosMessage(filtered);
        assert.match(htmlBancos, /Filtro:/i);
    });

    it('4. Detecta consultas de venta por línea de tienda y detalle de tienda de conveniencia (#4 y #3)', () => {
        const parsedCigarros = parseNaturalLanguageQuery('Vent cigarros la loma');
        assert.equal(parsedCigarros.isTiendaLinea, true);
        assert.ok(parsedCigarros.matchedStoreLine);
        assert.equal(parsedCigarros.matchedStoreLine.key, 'CIGARROS');
        assert.ok(parsedCigarros.matchedStation);
        assert.equal(parsedCigarros.matchedStation.id, '014');

        const parsedDetalleTienda = parseNaturalLanguageQuery('Detalle venta de tienda lá loma');
        assert.equal(parsedDetalleTienda.isTiendaLinea, true);
        assert.ok(parsedDetalleTienda.matchedStation);
        assert.equal(parsedDetalleTienda.matchedStation.id, '014');

        const sampleTiendaData = {
            startDate: '2026-11-01',
            endDate: '2026-11-20',
            station: { id: '004', name: 'San Martín (La Loma)' },
            storeLine: KNOWN_STORE_LINES.find(l => l.key === 'CIGARROS'),
            total_linea_usd: 534.70,
            total_tienda_usd: 3926.15,
            total_unidades_linea: 98,
            total_tickets_linea: 75,
            participacion_linea_pct: 13.62,
            productos_top: [
                { producto: 'CIGARROS MARLBORO ROJO BOX', unidades: 45, monto: 245.50, tickets: 40 }
            ]
        };

        const html = formatVentasTiendaLineaMessage(sampleTiendaData);
        assert.match(html, /VENTA DE LÍNEA EN TIENDA/);
        assert.match(html, /Cigarros y Cigarrillos/);
        assert.match(html, /\$534\.70/);
        assert.match(html, /MARLBORO ROJO BOX/);
    });

    it('5. Detecta día de mayor venta del mes y día de la semana que más vendió una estación (#1 y #19)', () => {
        const parsedOct = parseNaturalLanguageQuery('En mes de octubre que dia fue el de mayor venta ?');
        assert.equal(parsedOct.isPeakDay, true);
        assert.equal(parsedOct.peakDayOrder, 'DESC');
        assert.equal(parsedOct.targetMonth, 10);

        const parsedMiraflores = parseNaturalLanguageQuery('Que dia de la semana vendió mas miraflores');
        assert.equal(parsedMiraflores.isPeakDay, true);
        assert.ok(parsedMiraflores.matchedStation);
        assert.equal(parsedMiraflores.matchedStation.id, '002');

        const samplePeakData = {
            periodo_label: 'Octubre 2026',
            station: null,
            order: 'DESC',
            promedio_diario_venta: 59677.42,
            promedio_diario_galonaje: 13548.38,
            dia_principal: {
                fecha: '2026-10-30',
                dia_semana: 'Viernes',
                venta_total: 79008.39,
                venta_pista: 61200.00,
                venta_tienda: 17808.39,
                galonaje: 15078.31
            },
            top_dias: [
                { fecha: '2026-10-30', dia_semana: 'Viernes', venta_total: 79008.39, galonaje: 15078.31 }
            ],
            ranking_dias_semana: [
                { dia_semana: 'Viernes', promedio_venta: 71200.00, promedio_galonaje: 14400, cantidad_dias: 5 }
            ]
        };

        const html = formatPeakDayVentasMessage(samplePeakData);
        assert.match(html, /DÍA DE MAYOR VENTA/);
        assert.match(html, /Viernes 30\/10\/2026/);
        assert.match(html, /\$79,008\.39/);
    });

    it('6. Detecta consultas de pagos programados y recordatorios de vencimiento (#5)', () => {
        const parsedPagos = parseNaturalLanguageQuery('Cuales son los pagos programados');
        assert.equal(parsedPagos.isPagosProgramados, true);

        const samplePagos = {
            fecha_consulta: '2026-11-20',
            total_pendiente_usd: 425342.39,
            total_urgente_usd: 121788.09,
            cantidad_total: 2,
            pagos: [
                { id: 1, descripcion: 'COMPRA DE HUEVOS', monto: 33300, fecha_vencimiento: '2026-11-20', dias_restantes: 0 },
                { id: 2, descripcion: 'PEDIDO 16/11/2026', monto: 39051.61, fecha_vencimiento: '2026-11-21', dias_restantes: 1 }
            ],
            vencidos_o_hoy: [
                { id: 1, descripcion: 'COMPRA DE HUEVOS', monto: 33300, fecha_vencimiento: '2026-11-20', dias_restantes: 0 }
            ],
            proximos_7_dias: [
                { id: 2, descripcion: 'PEDIDO 16/11/2026', monto: 39051.61, fecha_vencimiento: '2026-11-21', dias_restantes: 1 }
            ],
            posteriores: []
        };

        const html = formatPagosProgramadosMessage(samplePagos);
        assert.match(html, /CONTROL DE PAGOS PROGRAMADOS Y VENCIMIENTOS/);
        assert.match(html, /COMPRA DE HUEVOS/);
        assert.match(html, /\$425,342\.39/);
    });

    it('7. Clasifica correctamente las causas raíz de los feedbacks negativos reales', () => {
        const c30 = classifyNegativeFeedback({
            consulta_original: 'Precios competencia',
            comentario_mejora: 'Me compartió únicamente venta totales, y solicite precios de competência'
        });
        assert.equal(c30.codigo_causa, 'PRECIOS_COMPETENCIA_DGEHM');

        const c15 = classifyNegativeFeedback({
            consulta_original: 'Saldo chequera inversiones lil',
            comentario_mejora: 'Necesito que se pueda consultar por cuentas específico, por banco o contribuyente'
        });
        assert.equal(c15.codigo_causa, 'FILTRO_CUENTA_CONTRIBUYENTE');

        const c4 = classifyNegativeFeedback({
            consulta_original: 'Vent cigarros la loma',
            comentario_mejora: 'La respuesta esperada era la venta de línea en super 7 san martin la loma , únicamente la venta cigarros'
        });
        assert.equal(c4.codigo_causa, 'VENTA_LINEA_TIENDA');

        const c1 = classifyNegativeFeedback({
            consulta_original: 'En mes de octubre que dia fue el de mayor venta ?',
            comentario_mejora: 'pregunte que dia fue el de mayor venta, pero la respuesta fue resumen de ventas consolidadas.'
        });
        assert.equal(c1.codigo_causa, 'DIA_PICO_VENTAS');
    });
});
