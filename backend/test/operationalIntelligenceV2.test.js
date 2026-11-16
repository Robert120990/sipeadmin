process.env.NODE_ENV = 'test';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const dbModule = require('../db');
const solarEnergyService = require('../services/solarEnergyService');
const { getTanquesAutonomia, getAuditoriaMermas } = require('../services/fuelIntelligence');
const { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia } = require('../services/profitabilityService');
const {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
} = require('../services/operationalAuditService');
const { generateExecutiveReportPdf } = require('../services/telegramPdfService');
const aiRouter = require('../routes/ai');

const origGetDb = dbModule.getDb;
const origGetAccountingDb = dbModule.getAccountingDb;
const origWithRetry = dbModule.withRetry;
const origSolarRango = solarEnergyService.getSolarAhorroRango;

afterEach(() => {
    dbModule.getDb = origGetDb;
    dbModule.getAccountingDb = origGetAccountingDb;
    dbModule.withRetry = origWithRetry;
    solarEnergyService.getSolarAhorroRango = origSolarRango;
});

describe('Frentes 1–4: Inteligencia Operativa V2, EBITDA Real, Auditoría en Tránsito y Centro IA', () => {
    it('Frente 1: getTanquesAutonomia cruza portal_pedidos para distinguir cubierto_en_ruta vs emergencia_real y retenidos', async () => {
        dbModule.withRetry = async (fn) => fn();
        dbModule.getAccountingDb = async () => ({
            query: async (sql) => {
                if (sql.includes('FROM branches WHERE id !=')) {
                    return [[
                        { id_empresa: 1, titulo: 'Texaco Nejapa' },
                        { id_empresa: 2, titulo: 'Puma San Miguelito' }
                    ]];
                }
                if (sql.includes('MAX(fecha_turno)')) {
                    return [[{ last_date: '2026-11-13' }]];
                }
                if (sql.includes('FROM gas_station_tanks t')) {
                    return [[
                        {
                            tank_id: 10,
                            id_empresa: 1, // branch 1 -> '014'
                            estacion: 'Texaco Nejapa',
                            tanque_codigo: 'T-01',
                            tanque_nombre: 'Tanque Diesel 1',
                            capacidad: 10000,
                            galones_reserva: 500,
                            tipo_combustible: 'D',
                            stock_actual: 1700, // util 1200 -> 12h restantes (con consumo 2400/día = 100/h)
                            fecha_lectura: '2026-11-13'
                        },
                        {
                            tank_id: 20,
                            id_empresa: 2, // branch 2 -> '015'
                            estacion: 'Puma San Miguelito',
                            tanque_codigo: 'T-02',
                            tanque_nombre: 'Tanque Super 1',
                            capacidad: 8000,
                            galones_reserva: 400,
                            tipo_combustible: 'S',
                            stock_actual: 1400, // util 1000 -> 10h restantes, sin cisterna liberada
                            fecha_lectura: '2026-11-13'
                        }
                    ]];
                }
                if (sql.includes('SUM(diferencia) as total_7d')) {
                    return [[
                        { id_empresa: 1, tipo_combustible: 'D', total_7d: 16800 }, // 2400/día = 100/h
                        { id_empresa: 2, tipo_combustible: 'S', total_7d: 16800 }  // 2400/día = 100/h
                    ]];
                }
                return [[]];
            }
        });

        dbModule.getDb = () => ({
            query: async (sql) => {
                if (sql.includes('FROM portal_pedidos')) {
                    return [[
                        {
                            numero_orden: 'ORD-9001',
                            id_estacion: '014',
                            estado: 'LIBERADO',
                            galones_diesel: 4000,
                            galones_regular: 0,
                            galones_super: 0,
                            galones_ion: 0
                        },
                        {
                            numero_orden: 'ORD-9002',
                            id_estacion: '015',
                            estado: 'RETENIDO',
                            galones_diesel: 0,
                            galones_regular: 0,
                            galones_super: 3000,
                            galones_ion: 0
                        }
                    ]];
                }
                return [[]];
            }
        });

        const res = await getTanquesAutonomia();
        assert.equal(res.resumen.tanques_criticos, 2);
        assert.equal(res.resumen.cubiertos_en_ruta, 1);
        assert.equal(res.resumen.emergencias_reales, 1);
        assert.equal(res.resumen.pedidos_retenidos_total, 1);
        assert.equal(res.resumen.galones_en_transito_total, 4000);

        const nejapa = res.tanques.find(t => t.codigo_estacion === '014');
        const sanMiguelito = res.tanques.find(t => t.codigo_estacion === '015');
        assert.equal(nejapa.riesgo_real, 'cubierto_en_ruta');
        assert.equal(nejapa.galones_en_transito, 4000);
        assert.ok(nejapa.horas_restantes_con_transito >= 24);

        assert.equal(sanMiguelito.riesgo_real, 'emergencia_real');
        assert.equal(sanMiguelito.galones_retenidos, 3000);
        assert.equal(sanMiguelito.pedidos_retenidos_count, 1);
    });

    it('Frente 3: getAuditoriaMermas aplica costo mayorista + flete real y detecta rachas de micro-merma de 3+ días', async () => {
        dbModule.withRetry = async (fn) => fn();
        dbModule.getAccountingDb = async () => ({
            query: async (sql) => {
                // Consulta diaria de ventas para rachas (contiene c.fecha_turno as fecha)
                if (sql.includes('c.fecha_turno as fecha') && sql.includes('SUM(r.diferencia) as venta_galones')) {
                    return [[
                        { id_empresa: 1, estacion: 'Texaco Nejapa', fecha: '2026-11-11', tipo: 'S', venta_galones: 1000 },
                        { id_empresa: 1, estacion: 'Texaco Nejapa', fecha: '2026-11-12', tipo: 'S', venta_galones: 1000 },
                        { id_empresa: 1, estacion: 'Texaco Nejapa', fecha: '2026-11-13', tipo: 'S', venta_galones: 1000 }
                    ]];
                }
                // Consulta diaria de tanques para rachas
                if (sql.includes('c.fecha_turno as fecha') && sql.includes('GROUP_CONCAT(tr.lectura_anterior')) {
                    return [[
                        { id_empresa: 1, fecha: '2026-11-11', tipo: 'S', recarga: 0, anterior: 5000, lectura: 3997 }, // -3 gal (-0.30%)
                        { id_empresa: 1, fecha: '2026-11-12', tipo: 'S', recarga: 0, anterior: 3997, lectura: 2994 }, // -3 gal (-0.30%)
                        { id_empresa: 1, fecha: '2026-11-13', tipo: 'S', recarga: 0, anterior: 2994, lectura: 1991 }  // -3 gal (-0.30%)
                    ]];
                }
                // Consulta consolidada de ventas
                if (sql.includes('SUM(r.diferencia) as venta_galones')) {
                    return [[
                        { id_empresa: 1, estacion: 'Texaco Nejapa', tipo: 'S', venta_galones: 3000 }
                    ]];
                }
                // Consulta consolidada de movimientos de tanques
                if (sql.includes('GROUP_CONCAT(tr.lectura_anterior')) {
                    return [[
                        { id_empresa: 1, tipo_combustible: 'S', recarga: 0, anterior: 5000, lectura: 1991 }
                    ]];
                }
                if (sql.includes('FROM products')) {
                    return [[{ tipo: 'S', costo: 3.40 }]];
                }
                return [[]];
            }
        });

        dbModule.getDb = () => ({
            query: async (sql) => {
                if (sql.includes('combustible_fletes_estacion')) {
                    return [[{ id_estacion: '014', flete_galon: 0.05 }]];
                }
                if (sql.includes('combustible_precios_estacion_quincenal')) {
                    return [[{ id_estacion: '014', precio_diesel: 3.20, precio_regular: 3.45, precio_super: 3.75, precio_ion: 3.30 }]];
                }
                return [[]];
            }
        });

        const audit = await getAuditoriaMermas('2026-11-11', '2026-11-13');
        assert.equal(audit.rachas_micro_merma.length, 1);
        assert.equal(audit.rachas_micro_merma[0].dias_consecutivos, 3);
        assert.equal(audit.rachas_micro_merma[0].galones_acumulados_perdidos, 9);
        // Costo real estación '014' Súper = 3.75 + 0.05 = 3.80 -> 9 * 3.80 = 34.20
        assert.equal(audit.rachas_micro_merma[0].impacto_acumulado_usd, 34.2);
        assert.equal(audit.auditorias[0].dias_racha_negativa, 3);
    });

    it('Frente 2: getRentabilidadPorEstacion integra costos mayoristas, flete, planilla y ahorro solar + elasticidad DGEHM', async () => {
        dbModule.withRetry = async (fn) => fn();
        solarEnergyService.getSolarAhorroRango = async () => ({
            desglose_por_estacion: [
                { id_empresa: '014', total_ahorro_usd: 420 }
            ]
        });

        dbModule.getAccountingDb = async () => ({
            query: async (sql) => {
                if (sql.includes('FROM branches WHERE id !=')) {
                    return [[{ id_empresa: 1, titulo: 'Texaco Nejapa' }]];
                }
                if (sql.includes('venta_dolares')) {
                    return [[{
                        id_empresa: 1,
                        total_galones: 20000,
                        venta_dolares: 82000,
                        galones_diesel: 10000,
                        galones_regular: 5000,
                        galones_super: 5000,
                        galones_ion: 0
                    }]];
                }
                if (sql.includes('FROM rh_planillas')) {
                    return [[{ branch_id: 1, total_planilla: 2900 }]];
                }
                if (sql.includes('FROM sales_headers')) {
                    return [[{ id_empresa: 1, total_tienda: 5000 }]];
                }
                if (sql.includes('gas_station_closeout_lubricant_readings')) {
                    return [[{ id_empresa: 1, total_lubricantes: 1000 }]];
                }
                if (sql.includes('gas_station_closeout_expenses')) {
                    return [[{ id_empresa: 1, total_gastos: 350 }]];
                }
                // Para getElasticidadPreciosCompetencia
                if (sql.includes('dias_recientes')) {
                    return [[
                        { branch_id: 1, fuel_key: 'super', dias_recientes: 7, gal_recientes: 6300, dias_base: 10, gal_base: 10000 }, // 900 vs 1000 -> -10%
                        { branch_id: 1, fuel_key: 'regular', dias_recientes: 7, gal_recientes: 7700, dias_base: 10, gal_base: 10000 } // 1100 vs 1000 -> +10%
                    ]];
                }
                return [[]];
            }
        });

        dbModule.getDb = () => ({
            query: async (sql) => {
                if (sql.includes('combustible_fletes_estacion')) {
                    return [[{ id_estacion: '014', flete_galon: 0.04 }]];
                }
                if (sql.includes('combustible_precios_estacion_quincenal')) {
                    return [[{ id_estacion: '014', precio_diesel: 3.30, precio_regular: 3.55, precio_super: 3.85, precio_ion: 3.40 }]];
                }
                if (sql.includes('finanzas_planes_mantenimiento')) {
                    return [[{ empresa_id: '1', total_mant: 200 }]];
                }
                if (sql.includes('FROM web_estaciones_competencia')) {
                    return [[
                        { id_estacion: '014', estacion: 'TEXACO NEJAPA', es_propia: 1, super_a: 4.15, regular_a: 3.80, diesel_a: 3.55 },
                        { id_estacion: '014', estacion: 'UNO NEJAPA', es_propia: 0, super_a: 4.08, regular_a: 3.85, diesel_a: 3.55 }
                    ]];
                }
                return [[]];
            }
        });

        const pnl = await getRentabilidadPorEstacion('2026-10-15', '2026-11-13');
        assert.equal(pnl.resumen_consolidado.fuente_costos, 'real_integrado');
        assert.equal(pnl.resumen_consolidado.flete_total_usd, 800); // 20,000 * 0.04
        assert.equal(pnl.resumen_consolidado.ahorro_solar_total_usd, 420);
        assert.equal(pnl.estaciones[0].desglose_costos_reales.planilla_rrhh_usd, 2900);

        const elast = await getElasticidadPreciosCompetencia(30);
        const superRow = elast.elasticidad.find(r => r.id_estacion === '014' && r.combustible_key === 'super');
        const regRow = elast.elasticidad.find(r => r.id_estacion === '014' && r.combustible_key === 'regular');
        assert.equal(superRow.posicion, 'fuga_volumen');
        assert.equal(regRow.posicion, 'oportunidad_margen');
    });

    it('Frente 3: getAuditoriaDineroEnTransito detecta remesas >48h sin abono bancario y vales >72h sin DTE', async () => {
        const oldShiftDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        dbModule.withRetry = async (fn) => fn();
        dbModule.getAccountingDb = async () => ({
            query: async (sql) => {
                if (sql.includes('remesas_pista_usd')) {
                    return [[{
                        id_empresa: 1,
                        estacion: 'Texaco Nejapa',
                        fecha: oldShiftDate,
                        remesas_pista_usd: 4500,
                        tarjetas_pista_usd: 1500
                    }]];
                }
                if (sql.includes('gas_station_closeout_creditos')) {
                    return [[{
                        id_empresa: 2,
                        estacion: 'Puma San Miguelito',
                        fecha_turno: oldShiftDate,
                        cliente: 'Transportes Del Sur S.A.',
                        cantidad_vales: 4,
                        monto_usd: 680.5,
                        dias_antiguedad: 5
                    }]];
                }
                return [[]];
            }
        });

        dbModule.getDb = () => ({
            query: async (sql) => {
                if (sql.includes('FROM movimientos_bancarios')) {
                    return [[{ fecha: oldShiftDate, total_abono: 1000 }]]; // Solo cubre parcialmente
                }
                return [[]];
            }
        });

        const transito = await getAuditoriaDineroEnTransito({ dias: 14 });
        assert.ok(transito.resumen.efectivo_en_transito_48h_usd > 4000);
        assert.equal(transito.remesas_en_transito.length, 1);
        assert.equal(transito.vales_pendientes_72h.length, 1);
        assert.equal(transito.vales_pendientes_72h[0].cliente, 'Transportes Del Sur S.A.');
        assert.equal(transito.resumen.estatus_auditoria, 'PENDIENTES EN TRÁNSITO');
    });

    it('Frente 1: getHomeResumenInteligente filtra bloques estrictamente según permisos RBAC del usuario', async () => {
        dbModule.withRetry = async (fn) => fn();
        dbModule.getAccountingDb = async () => ({ query: async () => [[]] });
        dbModule.getDb = () => ({
            query: async (sql) => {
                if (sql.includes('FROM support_tickets')) {
                    return [[{ cnt: 2 }]];
                }
                if (sql.includes('FROM tasks')) {
                    return [[{ cnt: 3 }]];
                }
                return [[]];
            }
        });

        const operadorLimitado = {
            id: 45,
            username: 'operador_soporte',
            role_id: 3,
            role: 'Support',
            permissions: ['/dashboard/seguridad/tickets']
        };

        const resLimitado = await getHomeResumenInteligente(operadorLimitado);
        assert.equal(resLimitado.tesoreria, null);
        assert.equal(resLimitado.ventas, null);
        assert.equal(resLimitado.abastecimiento, null);
        assert.equal(resLimitado.auditoria, null);
        assert.equal(resLimitado.actividad_personal.tickets_abiertos, 2);
        assert.equal(resLimitado.actividad_personal.mis_tareas_pendientes, 3);

        const adminUser = { id: 1, role_id: 1, role: 'Administrator', permissions: [] };
        const resAdmin = await getHomeResumenInteligente(adminUser);
        assert.notEqual(resAdmin.tesoreria, null);
        assert.notEqual(resAdmin.ventas, null);
        assert.notEqual(resAdmin.abastecimiento, null);
        assert.notEqual(resAdmin.auditoria, null);
        assert.equal(resAdmin.permisos_bloques.dossier_pdf, true);
    });

    it('Frente 4: Dossier Ejecutivo Semanal PDF genera documento Carta válido y handleAgentsControlCenter responde con telemetría AST', async () => {
        dbModule.withRetry = async (fn) => fn();
        dbModule.getAccountingDb = async () => ({ query: async () => [[]] });
        dbModule.getDb = () => ({ query: async () => [[]] });

        const payload = await buildWeeklyExecutiveDossierPayload();
        assert.ok(payload.title.includes('DOSSIER EJECUTIVO SEMANAL'));
        assert.equal(payload.kpis.length, 8);

        const pdfBuffer = await generateExecutiveReportPdf(payload);
        assert.ok(Buffer.isBuffer(pdfBuffer));
        assert.ok(pdfBuffer.length > 1200);
        assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');

        // Verificar endpoint handleAgentsControlCenter
        let statusCode = 200;
        let jsonBody = null;
        const mockReq = { user: { id: 1, role_id: 1, role: 'Administrator' } };
        const mockRes = {
            status(c) {
                statusCode = c;
                return this;
            },
            json(payloadJson) {
                jsonBody = payloadJson;
                return this;
            }
        };

        await aiRouter.handleAgentsControlCenter(mockReq, mockRes);
        assert.equal(statusCode, 200);
        assert.equal(jsonBody.ok, true);
        assert.ok(jsonBody.health);
        assert.equal(jsonBody.automatizaciones.actividades_programadas.length, 4);
        assert.equal(jsonBody.graphify.zeroCyclesVerified, true);
        assert.ok(Array.isArray(jsonBody.bitacora_ia));
    });
});
