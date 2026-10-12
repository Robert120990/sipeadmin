const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatProfileMessage,
    parseUserDate,
    moneyFmt,
    numFmt
} = require('../services/telegramBotService');

describe('Telegram Bot Service Unit Tests', () => {

    describe('parseUserDate', () => {
        it('debe aceptar y normalizar fechas en formato YYYY-MM-DD', () => {
            assert.strictEqual(parseUserDate('2026-10-12'), '2026-10-12');
            assert.strictEqual(parseUserDate('  2026-09-15  '), '2026-09-15');
        });

        it('debe convertir formatos DD/MM/YYYY o DD-MM-YYYY a YYYY-MM-DD', () => {
            assert.strictEqual(parseUserDate('12/10/2026'), '2026-10-12');
            assert.strictEqual(parseUserDate('5/9/2026'), '2026-09-05');
            assert.strictEqual(parseUserDate('01-05-2026'), '2026-05-01');
        });

        it('debe retornar null ante formatos inválidos o texto vacío', () => {
            assert.strictEqual(parseUserDate(''), null);
            assert.strictEqual(parseUserDate(null), null);
            assert.strictEqual(parseUserDate('fecha_invalida'), null);
        });
    });

    describe('moneyFmt y numFmt', () => {
        it('debe formatear valores de moneda con signo de dólar y 2 decimales', () => {
            assert.strictEqual(moneyFmt(12500.5), '$12,500.50');
            assert.strictEqual(moneyFmt(0), '$0.00');
            assert.strictEqual(moneyFmt(null), '$0.00');
        });

        it('debe formatear números con separador de miles y 2 decimales', () => {
            assert.strictEqual(numFmt(4520.25), '4,520.25');
            assert.strictEqual(numFmt(0), '0.00');
        });
    });

    describe('formatVentasMessage', () => {
        it('debe estructurar correctamente el resumen global y el detalle por estación', () => {
            const mockData = {
                estaciones: [
                    {
                        empresa: 'Puma Miraflores',
                        diesel: 2000,
                        regular: 1500,
                        super: 1000,
                        ion: 0,
                        galonaje: 4500,
                        venta: 18000
                    },
                    {
                        empresa: 'Shell Chalchuapa',
                        diesel: 1000,
                        regular: 1000,
                        super: 500,
                        ion: 200,
                        galonaje: 2700,
                        venta: 11000
                    }
                ],
                tiendas: [
                    { empresa: 'Super 7 Miraflores', venta: 1500.50 },
                    { empresa: 'Shell Select Chalchuapa', venta: 800.00 }
                ]
            };

            const msg = formatVentasMessage(mockData, '2026-10-11');
            assert.ok(msg.includes('VENTAS DE ESTACIONES Y TIENDAS'));
            assert.ok(msg.includes('11/10/2026'));
            assert.ok(msg.includes('7,200.00 gal')); // Total galones 4500 + 2700
            assert.ok(msg.includes('$29,000.00')); // Venta combustible 18000 + 11000
            assert.ok(msg.includes('$2,300.50')); // Venta tiendas 1500.50 + 800
            assert.ok(msg.includes('$31,300.50')); // Total global
            assert.ok(msg.includes('Puma Miraflores'));
            assert.ok(msg.includes('Shell Chalchuapa'));
            assert.ok(msg.includes('Super 7 Miraflores'));
        });
    });

    describe('formatBancosMessage', () => {
        it('debe agrupar cuentas por banco y mostrar el saldo total consolidado', () => {
            const mockBancos = {
                fecha: '2026-10-12',
                total: 250000.75,
                fuente: 'sp_saldo_en_bancos',
                cuentas: [
                    { banco: 'Banco Agrícola', cuenta: 'Cta Principal (001)', saldo: 150000.50 },
                    { banco: 'Banco Agrícola', cuenta: 'Cta Secundaria (002)', saldo: 50000.25 },
                    { banco: 'Banco Promerica', cuenta: 'Cta Recaudación (999)', saldo: 50000.00 }
                ]
            };

            const msg = formatBancosMessage(mockBancos);
            assert.ok(msg.includes('SALDOS CONSOLIDADOS EN BANCOS'));
            assert.ok(msg.includes('12/10/2026'));
            assert.ok(msg.includes('$250,000.75'));
            assert.ok(msg.includes('Banco Agrícola'));
            assert.ok(msg.includes('$200,000.75')); // Subtotal Banco Agrícola
            assert.ok(msg.includes('Banco Promerica'));
        });
    });

    describe('formatChequeraMessage', () => {
        it('debe listar las cuentas de chequera con su saldo respectivo', () => {
            const mockChequera = {
                fecha: '2026-10-12',
                total: 85200.00,
                fuente: 'sp_saldo_en_chequera',
                cuentas: [
                    { banco: 'Banco Agrícola', cuenta: 'Chequera Operativa (001)', saldo: 60200.00 },
                    { banco: 'Banco Davivienda', cuenta: 'Chequera Flete (555)', saldo: 25000.00 }
                ]
            };

            const msg = formatChequeraMessage(mockChequera);
            assert.ok(msg.includes('SALDOS EN CHEQUERA'));
            assert.ok(msg.includes('$85,200.00'));
            assert.ok(msg.includes('Chequera Operativa (001)'));
            assert.ok(msg.includes('Chequera Flete (555)'));
        });
    });

    describe('formatAlertasMessage', () => {
        it('debe reportar estado en orden cuando no existen anomalías', () => {
            const mockAuditoriaLimpia = {
                auditoria: { total_alertas: 0 },
                resumen_cierre: [],
                cortes_tienda: [],
                estaciones: []
            };

            const msg = formatAlertasMessage(mockAuditoriaLimpia, '2026-10-11');
            assert.ok(msg.includes('AUDITORÍA EN ORDEN'));
            assert.ok(msg.includes('No se detectaron descuadres ni anomalías operativas'));
        });

        it('debe reportar descuadres en pista y gastos de tiendas cuando existen anomalías', () => {
            const mockAnomalias = {
                auditoria: {
                    total_alertas: 3,
                    gastos_tiendas_count: 1,
                    descuadres_pista_count: 1,
                    descuadres_cortes_count: 1
                },
                resumen_cierre: [
                    { estacion: 'Puma Miraflores', diferencia: -150.25 }
                ],
                cortes_tienda: [
                    { empresa: 'Super 7 Costa del Sol', dif: -25.50, gastos: 45.00 }
                ],
                estaciones: []
            };

            const msg = formatAlertasMessage(mockAnomalias, '2026-10-11');
            assert.ok(msg.includes('TOTAL ALERTAS DETECTADAS: 3'));
            assert.ok(msg.includes('Puma Miraflores'));
            assert.ok(msg.includes('-$150.25'));
            assert.ok(msg.includes('Super 7 Costa del Sol'));
            assert.ok(msg.includes('-$25.50'));
            assert.ok(msg.includes('$45.00'));
        });
    });

    describe('formatProfileMessage', () => {
        it('debe mostrar los datos del usuario de Telegram y la lista de permisos asignados', () => {
            const user = {
                first_name: 'Raúl',
                last_name: 'Sistemas',
                telegram_username: '@raulsistemas',
                telegram_user_id: '123456789',
                activo: 1,
                permiso_ventas: 1,
                permiso_saldos_banco: 1,
                permiso_saldos_chequera: 0,
                permiso_alertas: 1
            };

            const msg = formatProfileMessage(user);
            assert.ok(msg.includes('Raúl Sistemas'));
            assert.ok(msg.includes('@raulsistemas'));
            assert.ok(msg.includes('123456789'));
            assert.ok(msg.includes('Activo / Autorizado'));
            assert.ok(msg.includes('✅ <b>Ventas de Estaciones</b>'));
            assert.ok(msg.includes('✅ <b>Saldo en Bancos</b>'));
            assert.ok(msg.includes('❌ <b>Saldo en Chequera</b>'));
            assert.ok(msg.includes('✅ <b>Alertas en Estaciones</b>'));
        });

        it('debe reflejar usuario SIPE vinculado y herencia de permisos cuando está asociado', () => {
            const user = {
                first_name: 'Raul',
                last_name: 'Sosa',
                telegram_username: '@RRSM5',
                telegram_user_id: '1651970576',
                user_id: 2,
                activo: 1
            };

            const effectivePerms = {
                isLinked: true,
                linkedUser: {
                    id: 2,
                    nombre: 'Raul Sosa',
                    username: 'raul',
                    role_name: 'Administrator'
                },
                ventas: true,
                saldos_banco: true,
                saldos_chequera: true,
                alertas: true
            };

            const msg = formatProfileMessage(user, effectivePerms);
            assert.ok(msg.includes('Raul Sosa'));
            assert.ok(msg.includes('Usuario SIPE Admin:</b> 🏢 <b>Raul Sosa'));
            assert.ok(msg.includes('Rol en SIPE:</b> 🛡️ <i>Administrator</i>'));
            assert.ok(msg.includes('Heredados de SIPE Admin'));
            assert.ok(msg.includes('✅ <b>Ventas de Estaciones</b>'));
            assert.ok(msg.includes('✅ <b>Saldo en Bancos</b>'));
            assert.ok(msg.includes('✅ <b>Saldo en Chequera</b>'));
            assert.ok(msg.includes('✅ <b>Alertas en Estaciones</b>'));
        });
    });
});
