process.env.NODE_ENV = 'test';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const consultaPedidosRouter = require('../routes/consultaPedidos');

const {
    formatDateToDDMMYYYY,
    formatOrderDateYMD,
    buildOrdersSummary,
    validateReceivePayload,
    resolveStationName
} = consultaPedidosRouter;

describe('Consulta de Pedidos (RRS) - Helpers y Contratos', () => {
    it('debe convertir fechas YYYY-MM-DD a DD/MM/YYYY y preservar formatos existentes', () => {
        assert.strictEqual(formatDateToDDMMYYYY('2026-11-24'), '24/11/2026');
        assert.strictEqual(formatDateToDDMMYYYY('24/11/2026'), '24/11/2026');
        assert.strictEqual(formatDateToDDMMYYYY(''), '');
    });

    it('debe extraer fecha YYYY-MM-DD válida para combustibles_costos', () => {
        assert.strictEqual(formatOrderDateYMD('2026-11-24T10:30:00Z'), '2026-11-24');
        assert.strictEqual(formatOrderDateYMD('24/11/2026'), '2026-11-24');
        assert.strictEqual(formatOrderDateYMD(new Date('2026-11-20T12:00:00Z')), '2026-11-20');
    });

    it('debe resolver nombres oficiales de estaciones (002, 006, 008, 014, 015, 016)', () => {
        assert.strictEqual(resolveStationName('002'), 'Puma Miraflores');
        assert.strictEqual(resolveStationName('006'), 'Shell Chalchuapa');
        assert.strictEqual(resolveStationName('008'), 'Puma Costa del Sol');
        assert.strictEqual(resolveStationName('014'), 'Puma La Loma (San Martín)');
        assert.strictEqual(resolveStationName('015'), 'Shell 14 Avenida');
        assert.strictEqual(resolveStationName('016'), 'Shell Poliedro');
    });

    it('debe calcular correctamente los totales de KPI y total_galones por pedido', () => {
        const { formattedRows, summary } = buildOrdersSummary([
            { id: 1, p_diesel: 5000, p_regular: 3000, p_super: 1000, p_ion: 0 },
            { id: 2, p_diesel: 2000, p_regular: 0, p_super: 1500, p_ion: 500 }
        ]);

        assert.strictEqual(formattedRows[0].total_galones, 9000);
        assert.strictEqual(formattedRows[1].total_galones, 4000);
        assert.strictEqual(summary.totalOrders, 2);
        assert.strictEqual(summary.totalDiesel, 7000);
        assert.strictEqual(summary.totalRegular, 3000);
        assert.strictEqual(summary.totalSuper, 2500);
        assert.strictEqual(summary.totalIon, 500);
        assert.strictEqual(summary.totalGallons, 13000);
    });

    it('debe validar estrictamente el payload de recepción de pedido', () => {
        const baseOrder = {
            id: 10,
            estado: 'VISTO',
            p_diesel: 5000,
            p_regular: 0,
            p_super: 0,
            p_ion: 0
        };

        assert.strictEqual(
            validateReceivePayload({ fecha_descarga: '2026-11-24' }, baseOrder).valid,
            false
        );
        assert.strictEqual(
            validateReceivePayload({ documento: '53930' }, baseOrder).valid,
            false
        );
        assert.strictEqual(
            validateReceivePayload(
                { documento: '53930', fecha_descarga: '2026-11-24', r_diesel: 5000, costo_d: 3.5 },
                { ...baseOrder, estado: 'PENDIENTE' }
            ).valid,
            false
        );
        assert.strictEqual(
            validateReceivePayload(
                { documento: '53930', fecha_descarga: '2026-11-24', r_diesel: 0, costo_d: 0 },
                { ...baseOrder, p_diesel: 0 }
            ).valid,
            false
        );
        assert.strictEqual(
            validateReceivePayload(
                { documento: '53930', fecha_descarga: '2026-11-24', r_diesel: 5000, costo_d: 0 },
                baseOrder
            ).valid,
            false
        );

        const badTransfer = validateReceivePayload(
            {
                metodo_pago: 'TRANSFERENCIA',
                documento: '53930',
                fecha_descarga: '2026-11-24',
                r_diesel: 5000,
                costo_d: 3.5,
                numero_cuenta: '',
                referencia: '123456',
                monto: 17500
            },
            baseOrder
        );
        assert.strictEqual(badTransfer.valid, false);

        const okTransfer = validateReceivePayload(
            {
                metodo_pago: 'TRANSFERENCIA',
                documento: '53930',
                fecha_descarga: '2026-11-24',
                r_diesel: 5000,
                costo_d: 3.5,
                numero_cuenta: '123456789',
                referencia: '12345678901234',
                monto: 17500
            },
            baseOrder
        );
        assert.strictEqual(okTransfer.valid, true);
        assert.strictEqual(okTransfer.parsed.referencia, '1234567890');
        assert.strictEqual(okTransfer.parsed.formattedFechaDescarga, '24/11/2026');

        const okCheque = validateReceivePayload(
            {
                metodo_pago: 'CHEQUE',
                documento: '53930',
                fecha_descarga: '2026-11-24',
                r_diesel: 5000,
                costo_d: 3.5,
                cheques: [{ numero_cuenta: '111', cheque: '999', valor: 17500 }]
            },
            baseOrder
        );
        assert.strictEqual(okCheque.valid, true);
        assert.strictEqual(okCheque.parsed.cheques.length, 1);
    });

    it('debe exponer las 9 rutas HTTP esperadas en el router', () => {
        const signatures = consultaPedidosRouter.stack
            .filter((layer) => layer.route)
            .map((layer) => `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`);

        const expected = [
            'GET /stations',
            'GET /orders',
            'PATCH /orders/:id/seen',
            'GET /banks',
            'GET /bank-accounts',
            'GET /vouchers/validate',
            'GET /orders/:id/vouchers',
            'GET /orders/:id/transfer',
            'PATCH /orders/:id/receive'
        ];

        assert.strictEqual(signatures.length, expected.length);
        expected.forEach((sig) => {
            assert.ok(signatures.includes(sig), `Falta ruta esperada: ${sig}`);
        });
    });
});
