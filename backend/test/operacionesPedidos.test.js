const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parsePedidosPagination, calculateHasMore, buildEstacionFilterClause } = require('../routes/operaciones');
const { normalizeEstacion } = require('../services/energyLatamService');

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
            const hasMore = calculateHasMore(25, 0, 10, false);
            assert.strictEqual(hasMore, true);
        });

        it('debe indicar hasMore = true en la segunda página si aún hay más', () => {
            const hasMore = calculateHasMore(25, 10, 10, false);
            assert.strictEqual(hasMore, true);
        });

        it('debe indicar hasMore = false cuando se alcanzaron todas las transacciones', () => {
            const hasMore = calculateHasMore(25, 20, 5, false);
            assert.strictEqual(hasMore, false);
        });

        it('debe indicar hasMore = false si isAll es true', () => {
            const hasMore = calculateHasMore(100, 0, 100, true);
            assert.strictEqual(hasMore, false);
        });
    });

    describe('buildEstacionFilterClause y normalizeEstacion (Mapeo Inteligente Portal Puma)', () => {
        it('debe mapear ENERGY GAS COSTA DEL SOL al ID 008 y coincidir con Puma Costa del Sol', () => {
            const clause = buildEstacionFilterClause('ENERGY GAS COSTA DEL SOL');
            assert.ok(clause);
            assert.ok(clause.sql.includes("'008'"));
            assert.ok(clause.sql.includes('COSTA'));

            const norm = normalizeEstacion('ENERGY GAS COSTA DEL SOL');
            assert.strictEqual(norm.id, '008');
            assert.strictEqual(norm.nombre, 'PUMA COSTA DEL SOL');
        });

        it('debe resolver la estación por código numérico 008', () => {
            const clause = buildEstacionFilterClause('008');
            assert.ok(clause);
            assert.ok(clause.sql.includes("'008'"));
            assert.ok(clause.sql.includes('COSTA'));
        });

        it('debe resolver PUMA MIRAFLORES y código 002', () => {
            const clause = buildEstacionFilterClause('002');
            assert.ok(clause.sql.includes("'002'"));
            const norm = normalizeEstacion('PUMA MIRAFLORES');
            assert.strictEqual(norm.id, '002');
        });

        it('debe resolver PUMA EL DESVIO y código 004', () => {
            const clause = buildEstacionFilterClause('004');
            assert.ok(clause.sql.includes("'004'"));
            const norm = normalizeEstacion('PUMA EL DESVIO');
            assert.strictEqual(norm.id, '004');
        });

        it('debe resolver PUMA LA LOMA / SAN MARTIN y código 014', () => {
            const clause = buildEstacionFilterClause('PUMA LA LOMA (SAN MARTÍN)');
            assert.ok(clause.sql.includes("'014'"));
            const norm = normalizeEstacion('PUMA LA LOMA-LUBES');
            assert.strictEqual(norm.id, '014');
        });

        it('debe mapear órdenes non-fuels por número de cuenta al id de estación correspondiente', () => {
            const normMiraflores = normalizeEstacion('NON FUELS', { accountNumber: '3409101' });
            assert.strictEqual(normMiraflores.id, '002');

            const normDesvio = normalizeEstacion('NON FUELS', { accountNumber: '3409102' });
            assert.strictEqual(normDesvio.id, '004');

            const normLil = normalizeEstacion('INVERSIONES LIL SA DE CV - NON FUELS', { accountNumber: '3409797' });
            assert.strictEqual(normLil.id, '014');
        });
    });
});
