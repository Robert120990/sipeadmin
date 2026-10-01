const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parsePedidosPagination, calculateHasMore } = require('../routes/operaciones');

describe('Operaciones - Pedidos Combustible Pagination Tests', () => {
    describe('parsePedidosPagination', () => {
        it('debe establecer 10 transacciones por defecto cuando no se envían parámetros', () => {
            const pagination = parsePedidosPagination({});
            assert.strictEqual(pagination.limit, 10);
            assert.strictEqual(pagination.offset, 0);
            assert.strictEqual(pagination.isAll, false);
        });

        it('debe permitir ampliar a 20 transacciones', () => {
            const pagination = parsePedidosPagination({ limit: '20' });
            assert.strictEqual(pagination.limit, 20);
            assert.strictEqual(pagination.offset, 0);
            assert.strictEqual(pagination.isAll, false);
        });

        it('debe calcular correctamente el offset para consultas consecutivas al hacer scroll', () => {
            const pagination = parsePedidosPagination({ limit: '10', offset: '20' });
            assert.strictEqual(pagination.limit, 10);
            assert.strictEqual(pagination.offset, 20);
            assert.strictEqual(pagination.isAll, false);
        });

        it('debe soportar la opción "all" para consultar todas las transacciones sin límite', () => {
            const pagination = parsePedidosPagination({ limit: 'all' });
            assert.strictEqual(pagination.limit, null);
            assert.strictEqual(pagination.offset, 0);
            assert.strictEqual(pagination.isAll, true);
        });

        it('debe proteger contra números negativos o valores corruptos', () => {
            const pagination = parsePedidosPagination({ limit: '-5', offset: '-10' });
            assert.strictEqual(pagination.limit, 1);
            assert.strictEqual(pagination.offset, 0);
        });
    });

    describe('calculateHasMore', () => {
        it('debe indicar hasMore = true cuando aún quedan registros por cargar', () => {
            // total: 25, offset: 0, cargados: 10
            const hasMore = calculateHasMore(25, 0, 10, false);
            assert.strictEqual(hasMore, true);
        });

        it('debe indicar hasMore = true en la segunda página si aún hay más', () => {
            // total: 25, offset: 10, cargados: 10 -> 20 de 25
            const hasMore = calculateHasMore(25, 10, 10, false);
            assert.strictEqual(hasMore, true);
        });

        it('debe indicar hasMore = false cuando se alcanzaron todas las transacciones', () => {
            // total: 25, offset: 20, cargados: 5 -> 25 de 25
            const hasMore = calculateHasMore(25, 20, 5, false);
            assert.strictEqual(hasMore, false);
        });

        it('debe indicar hasMore = false si isAll es true', () => {
            const hasMore = calculateHasMore(100, 0, 100, true);
            assert.strictEqual(hasMore, false);
        });
    });
});
