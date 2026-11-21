process.env.NODE_ENV = 'test';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const consultasRouter = require('../routes/consultas');
const {
    branchToEmpId,
    normalizeSaasBranchId,
    computeSaasStoreShiftMetrics
} = require('../services/consultasCatalog');
const {
    auditStationCloseoutsAndRemesas,
    formatStationDiscrepancyAuditMessage,
    runStationDiscrepancyAlertCheck
} = require('../services/stationDiscrepancyAuditService');
const { parseNaturalLanguageQuery } = require('../services/telegramTextAndDates');

const SYNTH_DIRECTOR_CHAT = '999000301';
const SYNTH_UNAUTH_CHAT = '999000302';

describe('Corrección de Falsos Positivos y Auditoría Cortes ↔ Remesas Enviadas ↔ Banco', () => {
    it('normalizeSaasBranchId y branchToEmpId fusionan Shell Poliedro (branch 12 -> 7 / 016)', () => {
        assert.equal(normalizeSaasBranchId(12), 7);
        assert.equal(normalizeSaasBranchId(7), 7);
        assert.equal(branchToEmpId[12], '016');
        assert.equal(branchToEmpId[7], '016');
    });

    it('mapCierreRowConExplicacion y getTurnosPorEmpresa incluyen trupput, anticipos_despachados, cheques, vales y lubricantes', async () => {
        const { mapCierreRowConExplicacion, getTurnosPorEmpresa } = consultasRouter;

        // 1. Shell Chalchuapa con $3,402.00 en trupput
        const chalRow = mapCierreRowConExplicacion({
            id_empresa: '006',
            estacion: 'Shell Chalchuapa',
            creditos: 1200,
            cupones: 0,
            cheques: 0,
            vales: 0,
            anticipos_despachados: 0,
            trupput: 3402.00,
            tarjetas: 3000,
            remesas: 6000,
            gastos: 50,
            anticipos: 0,
            pagos: 0,
            descuentos: 0,
            total_venta: 13652.00,
            lubricantes: 0
        }, {}, '2026-11-18');
        assert.equal(chalRow.diferencia, 0);
        assert.equal(chalRow.trupput, 3402);
        assert.equal(chalRow.explicacion_diferencia.desglose_no_efectivo.trupput, 3402);

        // 2. Puma La Loma (San Martín) con $1,032.37 en anticipos_despachados
        const smRow = mapCierreRowConExplicacion({
            id_empresa: '014',
            estacion: 'Puma La Loma (San Martín)',
            creditos: 500,
            cupones: 0,
            cheques: 0,
            vales: 0,
            anticipos_despachados: 1032.37,
            trupput: 0,
            tarjetas: 4000,
            remesas: 8000,
            gastos: 100,
            anticipos: 0,
            pagos: 0,
            descuentos: 0,
            total_venta: 13632.37,
            lubricantes: 0
        }, {}, '2026-11-19');
        assert.equal(smRow.diferencia, 0);
        assert.equal(smRow.anticipos_despachados, 1032.37);

        // 3. getTurnosPorEmpresa suma cheques + vales + anticipos_despachados + trupput y agrega lubricantes a venta
        const mockSaasTurnosDb = {
            query: async (sql) => {
                if (sql.includes('FROM gas_station_closeouts c')) {
                    return [[
                        {
                            id: 901,
                            branch_id: 4, // Miraflores -> 002
                            turno: 1,
                            responsable: 'Juan Pérez',
                            venta: 5000.00,
                            lubricantes: 120.50,
                            remesas: 2500.00,
                            tarjetas: 1500.00,
                            gastos: 20.50,
                            descuentos: 0,
                            cupones: 0,
                            creditos: 0,
                            cheques: 1000.00,
                            vales: 100.00,
                            anticipos: 0,
                            anticipos_despachados: 0,
                            trupput: 0
                        },
                        {
                            id: 902,
                            branch_id: 12, // Shell EL Poliedro -> fusionado a 016
                            turno: 2,
                            responsable: 'Alvaro Aguilar',
                            venta: 4000.00,
                            lubricantes: 0,
                            remesas: 3500.00,
                            tarjetas: 500.00,
                            gastos: 0,
                            descuentos: 0,
                            cupones: 0,
                            creditos: 0,
                            cheques: 0,
                            vales: 0,
                            anticipos: 0,
                            anticipos_despachados: 0,
                            trupput: 0
                        }
                    ]];
                }
                return [[]];
            }
        };

        const turnos = await getTurnosPorEmpresa(null, '19/11/2026', mockSaasTurnosDb, '2026-11-19');
        assert.equal(turnos['002'].length, 1);
        assert.equal(turnos['002'][0].venta, 5120.50);
        assert.equal(turnos['002'][0].diferencia, 0);
        assert.equal(turnos['002'][0].cheques, 1000);
        assert.equal(turnos['002'][0].vales, 100);
        assert.equal(turnos['016'].length, 1);
        assert.equal(turnos['016'][0].diferencia, 0);
    });

    it('computeSaasStoreShiftMetrics corrige bug expected_cash=0 de Super El Pedregal y toma total_tarjetas', () => {
        // Caso 1: Super El Pedregal cuadrado pero SaaS escribió difference = actual_cash = 214.55
        const pedregalOk = computeSaasStoreShiftMetrics({
            opening_balance: 30,
            expected_cash: 0,
            actual_cash: 214.55,
            total_sales: 184.55,
            total_incomes: 0,
            total_remesas: 139.90,
            total_expenses: 44.65,
            card_sales: 0,
            total_tarjetas: 0,
            difference: 214.55
        });
        assert.equal(pedregalOk.adjusted_zero_expected_bug, true);
        assert.equal(pedregalOk.dif, 0);

        // Caso 2: Super El Pedregal con faltante real de $15.00
        const pedregalRealShort = computeSaasStoreShiftMetrics({
            opening_balance: 30,
            expected_cash: 0,
            actual_cash: 214.55,
            total_sales: 184.55,
            total_incomes: 0,
            total_remesas: 124.90,
            total_expenses: 44.65,
            card_sales: 0,
            total_tarjetas: 0,
            difference: 214.55
        });
        assert.equal(pedregalRealShort.dif, -15);

        // Caso 3: San Martín II usa total_tarjetas cuando card_sales es 0
        const smStore = computeSaasStoreShiftMetrics({
            total_sales: 676.22,
            total_remesas: 520.85,
            total_expenses: 2.84,
            card_sales: 0,
            total_tarjetas: 152.53,
            expected_cash: 0,
            actual_cash: 0,
            difference: 0
        });
        assert.equal(smStore.tarjeta, 152.53);
        assert.equal(smStore.dif, 0);
    });

    it('auditStationCloseoutsAndRemesas detecta descuadre real, G362 vs banco, migra Poliedro sin falso positivo y concilia RWQ/clientes', async () => {
        const mockSaasDb = {
            query: async (sql) => {
                if (sql.includes('FROM gas_station_closeouts c') && sql.includes('trupput')) {
                    return [[
                        // Chalchuapa con descuadre real -$45.50
                        {
                            id: 1, branch_id: 3, fecha: '2026-11-18', turno: 1, responsable: 'Mario Lopez',
                            venta_comb: 5000, lubricantes: 0, creditos: 0, cupones: 0, cheques: 0, vales: 0,
                            anticipos_despachados: 0, trupput: 1944.50, tarjetas: 1000, remesas: 2010, gastos: 0,
                            anticipos: 0, descuentos: 0
                        },
                        // Shell Poliedro B12 + B7 mismo día, cuadrado al centavo tras fusión
                        {
                            id: 2, branch_id: 12, fecha: '2026-11-12', turno: 1, responsable: 'Carlos A',
                            venta_comb: 3000, lubricantes: 0, creditos: 0, cupones: 0, cheques: 0, vales: 0,
                            anticipos_despachados: 0, trupput: 0, tarjetas: 500, remesas: 2500, gastos: 0,
                            anticipos: 0, descuentos: 0
                        },
                        {
                            id: 3, branch_id: 7, fecha: '2026-11-12', turno: 2, responsable: 'Oscar M',
                            venta_comb: 2000, lubricantes: 0, creditos: 0, cupones: 0, cheques: 0, vales: 0,
                            anticipos_despachados: 0, trupput: 0, tarjetas: 500, remesas: 1500, gastos: 0,
                            anticipos: 0, descuentos: 0
                        }
                    ]];
                }
                if (sql.includes('FROM pos_shifts s')) {
                    return [[
                        // Super El Pedregal cuadrado con bug expected_cash=0 -> NO debe alertar
                        {
                            id: 1281, branch_id: 6, branch_nombre: 'Super El Pedregal', fecha: '2026-11-19',
                            shift_number: 1, total_sales: 184.55, total_incomes: 0, card_sales: 0, total_tarjetas: 0,
                            transfer_sales: 0, other_sales: 0, total_puntos: 0, total_remesas: 139.90, total_expenses: 44.65,
                            opening_balance: 30, expected_cash: 0, actual_cash: 214.55, difference: 214.55, seller_nombre: 'Eli'
                        }
                    ]];
                }
                if (sql.includes('FROM gas_station_remesa_deliveries d')) {
                    return [[
                        // Chalchuapa G362: linked 12,801.01, comentario TOTAL $13,596.90, banco 13,641.01 (+840)
                        {
                            id: 362, branch_id: 3, branch_name: 'Shell Chalchuapa', fecha: '2026-11-16',
                            responsable: 'NANCY AMAYA', referencia: '0231979006',
                            comentario: 'REMESA DE PISTA TOTAL $13,596.90',
                            linked_rem: 12801.01, extra_rem: 0
                        },
                        // Poliedro migración G339 (branch 7) + G340 (branch 12) consolidados en banco bajo 016-G340 ($3,098.38)
                        {
                            id: 339, branch_id: 7, branch_name: 'Shell Poliedro', fecha: '2026-11-12',
                            responsable: 'OSCAR MAYEN', referencia: '25011122', comentario: '',
                            linked_rem: 519.68, extra_rem: 0
                        },
                        {
                            id: 340, branch_id: 12, branch_name: 'Shell EL Poliedro', fecha: '2026-11-12',
                            responsable: 'OSCAR MAYEN', referencia: '25011122', comentario: '',
                            linked_rem: 2578.70, extra_rem: 0
                        }
                    ]];
                }
                if (sql.includes('FROM sales_remesa_deliveries d')) {
                    return [[
                        // Pedregal sin vincular pos_shift_remesas pero banco coincide al centavo
                        {
                            id: 329, branch_id: 6, branch_name: 'Super El Pedregal', fecha: '2026-11-19',
                            responsable: 'ELI', referencia: '1771615203', monto_entregado: 334.30, db_dif: 334.30, linked_rem: 0
                        }
                    ]];
                }
                if (sql.includes('FROM gas_station_closeout_remesas r')) {
                    return [[
                        // Miraflores $8,301.34 pendientes SaaS pero cubiertos por RWQ en banco -> sin falso positivo de robo
                        {
                            branch_id: 4, rem_reportadas: 8301.34, rem_entregadas: 0, rem_pendientes_all: 8301.34,
                            rem_pendientes_48h: 8301.34, cnt_pendientes_48h: 12, min_fecha_48h: '2026-11-15', max_fecha_48h: '2026-11-17'
                        },
                        // Costa del Sol $1,200 pendientes >48h SIN respaldo bancario alternativo -> DEBE alertar
                        {
                            branch_id: 8, rem_reportadas: 5000, rem_entregadas: 3800, rem_pendientes_all: 1200,
                            rem_pendientes_48h: 1200, cnt_pendientes_48h: 3, min_fecha_48h: '2026-11-15', max_fecha_48h: '2026-11-16'
                        }
                    ]];
                }
                return [[]];
            }
        };

        const mockRrsDb = {
            query: async (sql) => {
                if (sql.includes('FROM movimientos_bancarios')) {
                    return [[
                        { llave: '006-G362', id_empresa: 'E-3', numero_cuenta: '10000033001897', fecha: '16/11/2026', documento: '0231979006', cod_remesa: '01', concepto: 'SHELL CHALCHUAPA', cargo: 13641.01, monto: 13641.01 },
                        { llave: '016-G340', id_empresa: 'E-1', numero_cuenta: '10000060002375', fecha: '12/11/2026', documento: '25011122', cod_remesa: '01', concepto: 'SHELL EL POLIEDRO', cargo: 3098.38, monto: 3098.38 },
                        { llave: '006-S329', id_empresa: 'E-3', numero_cuenta: '10000203003447', fecha: '19/11/2026', documento: '1771615203', cod_remesa: '01', concepto: 'SUPER EL PEDREGAL', cargo: 334.30, monto: 334.30 },
                        { llave: 'RWQ000297411', id_empresa: 'E-1', numero_cuenta: '10000033001900', fecha: '19/11/2026', documento: '231879068', cod_remesa: '01', concepto: 'PUMA MIRAFLORES (19/11/2026)', cargo: 8301.34, monto: 8301.34 }
                    ]];
                }
                if (sql.includes('FROM cort_cabecera a')) {
                    return [[
                        { id_empresa: '002', tienda_nombre: 'E-MARKET MIRAFLORES', fecha: '2026-11-16', responsable: 'Rosa M', venta: 3822.98, remesado: 2665.30, gastos: 256.99, dif: -20.99 }
                    ]];
                }
                return [[]];
            }
        };

        const audit = await auditStationCloseoutsAndRemesas({
            dias: 10,
            todayOverride: '2026-11-20',
            accountingDb: mockSaasDb,
            externalDb: mockRrsDb
        });

        assert.equal(audit.has_alerts, true);
        assert.equal(audit.pista_discrepancias.length, 1);
        assert.equal(audit.pista_discrepancias[0].id_empresa, '006');
        assert.equal(audit.pista_discrepancias[0].diferencia, -45.5);

        assert.equal(audit.tienda_discrepancias.length, 1);
        assert.equal(audit.tienda_discrepancias[0].id_empresa, '002');
        assert.equal(audit.tienda_discrepancias[0].diferencia, -20.99);

        // Solo G362 debe estar en delivery_mismatches (G339+G340 compensados y S329 cuadrado con banco)
        assert.equal(audit.delivery_mismatches.length, 1);
        assert.equal(audit.delivery_mismatches[0].llave_saas, 'G362');
        assert.equal(audit.delivery_mismatches[0].diferencia_banco_vs_sistema, 840);
        assert.equal(audit.delivery_mismatches[0].declarado_comentario_usd, 13596.9);

        // Costa del Sol sin respaldo debe aparecer; Miraflores RWQ solo va en notas_proceso
        assert.equal(audit.remesas_sin_entregar_48h.length, 1);
        assert.equal(audit.remesas_sin_entregar_48h[0].id_empresa, '008');
        assert.ok(audit.notas_proceso.some(n => n.includes('Puma Miraflores') && n.includes('RWQ')));
        assert.ok(audit.notas_proceso.some(n => n.includes('G339 + G340')));
    });

    it('runStationDiscrepancyAlertCheck envía Telegram + Socket.io deduplicado en MySQL y detecta cambios de monto', async () => {
        const seenFingerprints = new Set();
        const notificationsInserted = [];
        const emittedEvents = [];
        const telegramSent = [];

        const mockAdminDb = {
            query: async (sql, params = []) => {
                if (/CREATE TABLE IF NOT EXISTS station_discrepancy_alerts_log/i.test(sql)) {
                    return [{ affectedRows: 0 }];
                }
                if (/INSERT IGNORE INTO station_discrepancy_alerts_log/i.test(sql)) {
                    const fp = params[0];
                    if (seenFingerprints.has(fp)) {
                        return [{ affectedRows: 0 }];
                    }
                    seenFingerprints.add(fp);
                    return [{ affectedRows: 1 }];
                }
                if (/FROM role_permissions rp/i.test(sql)) {
                    return [[
                        { role_id: 2, name: '/dashboard/consultas/estaciones/resumen-cierre' },
                        { role_id: 3, name: '/dashboard/consultas/otras/cumpleanos' }
                    ]];
                }
                if (/FROM telegram_usuarios tu/i.test(sql)) {
                    return [[
                        { id: 1, telegram_user_id: SYNTH_DIRECTOR_CHAT, activo: 1, permiso_alertas: 1, sipe_role_id: 1, sipe_role_name: 'Administrator', sipe_status: 'active', sipe_permissions: '' },
                        { id: 2, telegram_user_id: SYNTH_UNAUTH_CHAT, activo: 1, permiso_alertas: 0, sipe_role_id: 3, sipe_role_name: 'Operador', sipe_status: 'active', sipe_permissions: '/dashboard/consultas/otras/cumpleanos' }
                    ]];
                }
                if (/FROM users u/i.test(sql)) {
                    return [[
                        { id: 10, name: 'Raul Sosa', username: 'raul', role_id: 1, role_name: 'Administrator' },
                        { id: 20, name: 'Operador Basico', username: 'op', role_id: 3, role_name: 'Operador' }
                    ]];
                }
                if (/INSERT INTO notifications/i.test(sql)) {
                    const row = { id: notificationsInserted.length + 1, user_id: params[0], title: params[1], message: params[2] };
                    notificationsInserted.push(row);
                    return [{ insertId: row.id }];
                }
                return [{ affectedRows: 1 }];
            }
        };

        const mockIo = {
            to: (room) => ({
                emit: (eventName, payload) => emittedEvents.push({ room, eventName, payload })
            })
        };

        const baseAudit = {
            periodo: {
                remesas_desde: '2026-11-14',
                remesas_hasta: '2026-11-20',
                cortes_desde: '2026-11-18',
                cortes_hasta: '2026-11-20',
                cutoff_48h: '2026-11-18'
            },
            resumen: { total_alertas: 1 },
            pista_discrepancias: [],
            tienda_discrepancias: [],
            delivery_mismatches: [
                {
                    tipo_envio: 'pista',
                    llave_saas: 'G362',
                    id: 362,
                    id_empresa: '006',
                    estacion: 'Shell Chalchuapa',
                    fecha: '2026-11-16',
                    responsable: 'NANCY AMAYA',
                    esperado_envio_usd: 12801.01,
                    declarado_comentario_usd: 13596.90,
                    depositado_banco_usd: 13641.01,
                    diferencia_banco_vs_sistema: 840.00,
                    diferencia_declarado_vs_sistema: 795.89,
                    motivo: 'Envío difiere contra banco'
                }
            ],
            remesas_sin_entregar_48h: [],
            notas_proceso: [],
            has_alerts: true,
            severity: 'critico'
        };

        // 1. Primera ejecución -> notifica solo a usuario autorizado (1 Telegram + 1 Socket.io/DB)
        const r1 = await runStationDiscrepancyAlertCheck({
            db: mockAdminDb,
            io: mockIo,
            auditOverride: baseAudit,
            sendTelegramFn: async (chatId, text, markup) => telegramSent.push({ chatId, text, markup })
        });
        assert.equal(r1.dispatched, true);
        assert.equal(r1.telegramSentCount, 1);
        assert.equal(r1.inAppSentCount, 1);
        assert.equal(telegramSent[0].chatId, SYNTH_DIRECTOR_CHAT);
        assert.ok(telegramSent[0].text.includes('G362'));
        assert.equal(emittedEvents[0].room, 'user_10');
        assert.equal(emittedEvents[0].eventName, 'notification:new');

        // 2. Segunda ejecución idéntica -> deduplicada
        const r2 = await runStationDiscrepancyAlertCheck({
            db: mockAdminDb,
            io: mockIo,
            auditOverride: baseAudit,
            sendTelegramFn: async (chatId, text, markup) => telegramSent.push({ chatId, text, markup })
        });
        assert.equal(r2.dispatched, false);
        assert.equal(r2.reason, 'deduplicated');
        assert.equal(telegramSent.length, 1);

        // 3. Nuevo descuadre o cambio de monto -> vuelve a notificar
        const changedAudit = {
            ...baseAudit,
            pista_discrepancias: [
                { id_empresa: '002', estacion: 'Puma Miraflores', fecha: '2026-11-20', diferencia: -35.00, foco_turno: { turno: 2, responsable: 'Carlos H', diferencia: -35.00 } }
            ]
        };
        const r3 = await runStationDiscrepancyAlertCheck({
            db: mockAdminDb,
            io: mockIo,
            auditOverride: changedAudit,
            sendTelegramFn: async (chatId, text, markup) => telegramSent.push({ chatId, text, markup })
        });
        assert.equal(r3.dispatched, true);
        assert.equal(r3.newFindingsCount, 1);
        assert.equal(telegramSent.length, 2);
        assert.ok(telegramSent[1].text.includes('Puma Miraflores'));

        // NLU y formateador
        const parsed = parseNaturalLanguageQuery('evaluar las diferencias en cortes y remesas enviadas si coinciden');
        assert.equal(parsed.isAuditoriaCortesRemesas, true);
        const cleanMsg = formatStationDiscrepancyAuditMessage({ ...baseAudit, has_alerts: false, delivery_mismatches: [] });
        assert.ok(cleanMsg.includes('TODO CUADRADO'));
    });
});
