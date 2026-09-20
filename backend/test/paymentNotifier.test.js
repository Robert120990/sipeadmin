const { describe, it } = require('node:test');
const assert = require('node:assert');
const { formatCurrency, formatSpanishDate, buildPaymentEmailHtml } = require('../services/paymentNotifier');

describe('Payment Notifier Service Tests', () => {
    it('formatCurrency should return formatted USD currency string', () => {
        assert.strictEqual(formatCurrency(1234.56), '$ 1,234.56');
        assert.strictEqual(formatCurrency(0), '$ 0.00');
        assert.strictEqual(formatCurrency('2500'), '$ 2,500.00');
    });

    it('formatSpanishDate should return date string in Spanish', () => {
        const testDate = new Date('2026-09-20T12:00:00Z');
        const formatted = formatSpanishDate(testDate);

        assert.ok(typeof formatted === 'string');
        assert.ok(formatted.includes('20'));
        assert.ok(formatted.includes('septiembre'));
        assert.ok(formatted.includes('2026'));
    });

    it('buildPaymentEmailHtml should render HTML table with payment items and totals', () => {
        const samplePayments = [
            {
                ubicacion: 'ESTACION SAN MARTIN',
                descripcion: 'PAGO DE ENERGIA ELECTRICA',
                monto: 850.50,
                forma_pago: 'TRANSFERENCIA'
            },
            {
                ubicacion: 'OFICINA CENTRAL',
                descripcion: 'SEGURO EMPRESARIAL',
                monto: 1200.00,
                forma_pago: 'CHEQUE'
            }
        ];

        const overdueSummary = { total_vencidos: 3, monto_vencidos: 4500 };
        const html = buildPaymentEmailHtml(samplePayments, 'Domingo, 20 de septiembre de 2026', overdueSummary);

        assert.ok(typeof html === 'string');
        assert.ok(html.includes('Recordatorio de Pagos que Vencen Hoy'));
        assert.ok(html.includes('ESTACION SAN MARTIN'));
        assert.ok(html.includes('PAGO DE ENERGIA ELECTRICA'));
        assert.ok(html.includes('$ 850.50'));
        assert.ok(html.includes('$ 1,200.00'));
        assert.ok(html.includes('$ 2,050.50')); // Total general
        assert.ok(html.includes('Existen además <strong>3</strong> pagos vencidos'));
    });
});
