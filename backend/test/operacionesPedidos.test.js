const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    parsePedidosPagination,
    calculateHasMore,
    buildEstacionFilterClause,
    buildCompactPresetValue,
    inferBankNameFromText,
    inferUbicacionTags,
    fetchPromedios,
    reconcileScheduledOrdersWithRefills,
    fetchProgramadosEstacion
} = require('../routes/operaciones');
const { normalizeEstacion, getPortalCredentials, savePortalCredentials } = require('../services/energyLatamService');

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

        it('debe resolver SHELL POLIEDRO y código 016', () => {
            const clause = buildEstacionFilterClause('016');
            assert.ok(clause.sql.includes("'016'"));
            const norm = normalizeEstacion('SHELL POLIEDRO');
            assert.strictEqual(norm.id, '016');
            const normOpico = normalizeEstacion('DESVIO POLIEDRO');
            assert.strictEqual(normOpico.id, '016');
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

    describe('getPortalCredentials y savePortalCredentials', () => {
        it('debe resolver credenciales con formato y estructura válidos', async () => {
            const creds = await getPortalCredentials();
            assert.ok(creds);
            assert.ok(typeof creds.url === 'string');
            assert.ok(typeof creds.user === 'string');
            assert.ok(typeof creds.pass === 'string');
            assert.ok(['database', 'env', 'none'].includes(creds.source));
        });

        it('debe rechazar guardado si falta usuario o contraseña', async () => {
            await assert.rejects(
                () => savePortalCredentials({ user: '', password: '123' }),
                /usuario o correo del portal es requerido/
            );
            await assert.rejects(
                () => savePortalCredentials({ user: 'test@example.com', password: '' }),
                /contraseña del portal es requerida/
            );
        });
    });

    describe('Recordatorios - Presets automáticos de pago (ADM-0012)', () => {
        it('debe inferir BAC / AMERICA CENTRAL y etiquetas de ubicación para ANDELSA', () => {
            assert.strictEqual(inferBankNameFromText('BAC CTA CTE 201002367'), 'AMERICA CENTRAL');
            assert.strictEqual(inferBankNameFromText('BANCO DAVIVIENDA CTA CTE 002510128744'), 'DAVIVIENDA');
            const tags = inferUbicacionTags({
                empresa_nombre: 'ANDELSA, S.A. DE C.V.',
                nombre: 'ANDELSA - BAC CTA CTE',
                banco_nombre: 'AMERICA CENTRAL'
            });
            assert.ok(tags.includes('ANDELSA'));
        });

        it('debe generar preset_value menor o igual a 50 caracteres preservando banco y número de cuenta', () => {
            const preset = buildCompactPresetValue(
                'AMERICA CENTRAL',
                'ANDELSA S.A. DE C.V. - BAC CUENTA CORRIENTE PRINCIPAL',
                '201002367'
            );
            assert.ok(preset.length <= 50, `Longitud excedida: ${preset.length}`);
            assert.ok(preset.includes('201002367'));
            assert.ok(preset.includes('ANDELSA'));
        });
    });

    describe('Promedios de Venta 7 Días Completos (ADM-0014)', () => {
        it('debe excluir el día en curso (hoySV) aunque ya exista un Turno 1 cerrado y mantener el promedio estable de 7 días completos', async () => {
            const capturedParams = [];
            const mockAccountingDb = {
                query: async (sql, params) => {
                    capturedParams.push({ sql, params });
                    if (sql.includes('MAX(fecha_turno)')) {
                        // Simula que el query exige fecha_turno <= ayerSV ('2026-11-18')
                        assert.strictEqual(params[1], '2026-11-18');
                        return [[{ max_fecha: '2026-11-18' }]];
                    }
                    if (sql.includes('COUNT(DISTINCT fecha_turno) as dias_activos')) {
                        assert.strictEqual(params[1], '2026-11-12');
                        assert.strictEqual(params[2], '2026-11-18');
                        return [[{ dias_activos: 7 }]];
                    }
                    if (sql.includes('SUM(GREATEST(0, COALESCE(diferencia, 0)))')) {
                        // Totales exactos de Puma Miraflores (12/11 al 18/11) del caso ADM-0014
                        return [[
                            { tipo_combustible: 'D', total_galones: 14997.36 }, // 2142.48 / día
                            { tipo_combustible: 'R', total_galones: 7502.67 },  // 1071.81 / día
                            { tipo_combustible: 'S', total_galones: 4644.50 }   // 663.50 / día
                        ]];
                    }
                    return [[]];
                }
            };

            // Simula consulta a las 12:00 m.d. del 19/11/2026 (cuando Turno 1 de hoy ya cerró y fecha enviada es '2026-11-19')
            const fixedNow = new Date('2026-11-19T18:00:00Z'); // 12:00 PM America/El_Salvador
            const res = await fetchPromedios('002', '2026-11-19', null, mockAccountingDb, { now: fixedNow });

            assert.strictEqual(res.D, 2142.48);
            assert.strictEqual(res.R, 1071.81);
            assert.strictEqual(res.S, 663.5);
            assert.strictEqual(res.I, 0);
            assert.deepStrictEqual(res.meta, {
                fecha_desde: '2026-11-12',
                fecha_hasta: '2026-11-18',
                dias_activos: 7,
                fuente: 'saas'
            });
        });

        it('debe dividir combustibles de baja rotación (ej. Ion Diesel) por los días operativos de la estación y no sobreestimarlos', async () => {
            const mockAccountingDb = {
                query: async (sql) => {
                    if (sql.includes('MAX(fecha_turno)')) return [[{ max_fecha: '2026-11-22' }]];
                    if (sql.includes('COUNT(DISTINCT fecha_turno) as dias_activos')) return [[{ dias_activos: 7 }]];
                    if (sql.includes('SUM(GREATEST(0, COALESCE(diferencia, 0)))')) {
                        return [[
                            { tipo_combustible: 'D', total_galones: 7000 },
                            { tipo_combustible: 'I', total_galones: 212.10 } // 30.30/día en 7 días (NO 53.03 si solo vendió 4 días)
                        ]];
                    }
                    return [[]];
                }
            };

            const fixedNow = new Date('2026-11-23T14:00:00Z'); // 8:00 AM SV
            const res = await fetchPromedios('016', '2026-11-23', null, mockAccountingDb, { now: fixedNow });
            assert.strictEqual(res.D, 1000);
            assert.strictEqual(res.I, 30.3);
        });

        it('debe respetar una fecha histórica explícita anterior a hoySV', async () => {
            let capturedMaxCap = null;
            const mockAccountingDb = {
                query: async (sql, params) => {
                    if (sql.includes('MAX(fecha_turno)')) {
                        capturedMaxCap = params[1];
                        return [[{ max_fecha: '2026-11-10' }]];
                    }
                    if (sql.includes('COUNT(DISTINCT fecha_turno) as dias_activos')) return [[{ dias_activos: 7 }]];
                    if (sql.includes('SUM(GREATEST(0, COALESCE(diferencia, 0)))')) {
                        return [[{ tipo_combustible: 'D', total_galones: 7000 }]];
                    }
                    return [[]];
                }
            };

            const fixedNow = new Date('2026-11-23T14:00:00Z');
            const res = await fetchPromedios('002', '2026-11-10', null, mockAccountingDb, { now: fixedNow });
            assert.strictEqual(capturedMaxCap, '2026-11-10');
            assert.strictEqual(res.meta.fecha_desde, '2026-11-04');
            assert.strictEqual(res.meta.fecha_hasta, '2026-11-10');
        });
    });

    describe('Pedidos Programados del Día y Reconciliación Anti-Doble-Conteo (ADM-0016)', () => {
        it('debe incluir pedidos programados para HOY incluso cuando Turno 1 de hoy ya cerró y effectiveDate === hoySV', async () => {
            const mockExternalDb = {
                query: async (sql, params) => {
                    // Debe usar >= ayerSV internamente para nunca ocultar pedidos con fecha === hoySV
                    assert.ok(sql.includes('t.fecha >= ?'));
                    assert.strictEqual(params[1], '2026-11-19');
                    return [[
                        {
                            id_pedido: 4578,
                            fecha: '2026-11-20',
                            numero: '30250994',
                            diesel: 4000,
                            regular: 3000,
                            super: 1500,
                            iondiesel: 0
                        }
                    ]];
                }
            };
            const mockAccountingDb = {
                query: async () => [[]] // Sin recargas registradas en T1 todavía
            };

            const fixedNow = new Date('2026-11-20T15:30:00Z'); // 9:30 AM SV del 20/11/2026
            const rows = await fetchProgramadosEstacion('002', '2026-11-20', mockExternalDb, mockAccountingDb, { now: fixedNow });

            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].numero, '30250994');
            assert.strictEqual(rows[0].ya_descargado, false);
            assert.strictEqual(rows[0].pendiente_diesel, 4000);
            assert.strictEqual(rows[0].pendiente_regular, 3000);
            assert.strictEqual(rows[0].pendiente_super, 1500);
        });

        it('debe marcar ya_descargado = true y pendiente = 0 cuando la recarga del día ya entró al turno cerrado', () => {
            const orders = [
                { id_pedido: 4578, fecha: '2026-11-20', numero: '30250994', diesel: 4000, regular: 3000, super: 1500, iondiesel: 0 },
                { id_pedido: 4590, fecha: '2026-11-22', numero: '', diesel: 5000, regular: 2000, super: 1000, iondiesel: 0 }
            ];
            const refills = {
                ayer: { D: 0, R: 0, S: 0, I: 0 },
                hoyT1: { D: 0, R: 0, S: 0, I: 0 },
                hoyPostT1: { D: 4000, R: 3000, S: 1500, I: 0 }
            };

            const res = reconcileScheduledOrdersWithRefills(orders, '2026-11-20', refills);
            assert.strictEqual(res.length, 2);

            // El pedido de hoy ya fue descargado en Turno 2 -> visible pero pendiente = 0 (sin doble conteo)
            assert.strictEqual(res[0].id_pedido, 4578);
            assert.strictEqual(res[0].ya_descargado, true);
            assert.strictEqual(res[0].pendiente_diesel, 0);
            assert.strictEqual(res[0].pendiente_regular, 0);
            assert.strictEqual(res[0].pendiente_super, 0);

            // El pedido futuro sigue 100% pendiente
            assert.strictEqual(res[1].id_pedido, 4590);
            assert.strictEqual(res[1].ya_descargado, false);
            assert.strictEqual(res[1].pendiente_diesel, 5000);
        });

        it('debe manejar múltiples entregas el mismo día (ej. pipa principal descargada, pipa Ion aún en tránsito)', () => {
            const orders = [
                { id_pedido: 4584, fecha: '2026-11-23', numero: '', diesel: 4000, regular: 2000, super: 1000, iondiesel: 0 },
                { id_pedido: 4585, fecha: '2026-11-23', numero: '', diesel: 0, regular: 0, super: 0, iondiesel: 1500 }
            ];
            const refills = {
                ayer: { D: 0, R: 0, S: 0, I: 0 },
                hoyT1: { D: 0, R: 0, S: 0, I: 0 },
                hoyPostT1: { D: 4000, R: 2000, S: 1000, I: 0 }
            };

            const res = reconcileScheduledOrdersWithRefills(orders, '2026-11-23', refills);
            assert.strictEqual(res[0].id_pedido, 4584);
            assert.strictEqual(res[0].ya_descargado, true);
            assert.strictEqual(res[1].id_pedido, 4585);
            assert.strictEqual(res[1].ya_descargado, false);
            assert.strictEqual(res[1].pendiente_iondiesel, 1500);
        });

        it('no debe descontar falsamente un pedido nuevo de HOY cuando la recarga de Turno 1 pertenecía a una entrega nocturna confirmada de AYER', () => {
            const orders = [
                { id_pedido: 4574, fecha: '2026-11-19', numero: '30250795', diesel: 2000, regular: 4500, super: 2000, iondiesel: 0 },
                { id_pedido: 4599, fecha: '2026-11-20', numero: '', diesel: 2500, regular: 4000, super: 2000, iondiesel: 0 }
            ];
            const refills = {
                ayer: { D: 0, R: 0, S: 0, I: 0 },
                hoyT1: { D: 2000, R: 4500, S: 2000, I: 0 }, // Descarga de madrugada del pedido 4574 de ayer
                hoyPostT1: { D: 0, R: 0, S: 0, I: 0 }
            };

            const res = reconcileScheduledOrdersWithRefills(orders, '2026-11-20', refills);
            // Solo devuelve pedidos >= hoySV (oculta el de ayer) y mantiene el de hoy 100% pendiente
            assert.strictEqual(res.length, 1);
            assert.strictEqual(res[0].id_pedido, 4599);
            assert.strictEqual(res[0].ya_descargado, false);
            assert.strictEqual(res[0].pendiente_diesel, 2500);
            assert.strictEqual(res[0].pendiente_regular, 4000);
            assert.strictEqual(res[0].pendiente_super, 2000);
        });
    });
});
