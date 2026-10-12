const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatProfileMessage,
    parseUserDate,
    parseSpanishDateText,
    parseSpanishPeriodOrDate,
    moneyFmt,
    numFmt,
    normalizeText,
    parseNaturalLanguageQuery,
    formatSpecificStationMessage,
    formatProductTotalMessage,
    formatRankingMessage,
    formatSpecificBankMessage,
    formatTiendasMessage,
    formatVentasMensualMessage,
    formatVentasRangoMessage,
    formatHorasPicoMessage,
    formatSolarEnergyMessage,
    formatIntelligentGuidanceMessage
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

    describe('parseSpanishDateText', () => {
        it('debe reconocer fechas con nombre completo de mes y abreviaciones (año 2026 por defecto)', () => {
            assert.strictEqual(parseSpanishDateText('5 de octubre'), '2026-10-05');
            assert.strictEqual(parseSpanishDateText('15 de septiembre'), '2026-09-15');
            assert.strictEqual(parseSpanishDateText('05 de oct'), '2026-10-05');
            assert.strictEqual(parseSpanishDateText('1 de enero'), '2026-01-01');
            assert.strictEqual(parseSpanishDateText('31 de dic'), '2026-12-31');
        });

        it('debe reconocer "el dia X" asociando mes y año correspondiente', () => {
            assert.strictEqual(parseSpanishDateText('el dia 5'), '2026-10-05');
            assert.strictEqual(parseSpanishDateText('dia 12'), '2026-10-12');
            assert.strictEqual(parseSpanishDateText('el dia 15'), '2026-10-15');
        });

        it('debe reconocer años explícitos cuando se especifiquen', () => {
            assert.strictEqual(parseSpanishDateText('5 de octubre del 2025'), '2025-10-05');
            assert.strictEqual(parseSpanishDateText('15 de septiembre de 2024'), '2024-09-15');
            assert.strictEqual(parseSpanishDateText('05 de oct 2027'), '2027-10-05');
        });

        it('debe extraer fechas relativas en español ("hoy", "ayer", "el dia de ayer", etc.)', () => {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            const expectedToday = `${y}-${m}-${d}`;

            const yest = new Date(today);
            yest.setDate(yest.getDate() - 1);
            const yY = yest.getFullYear();
            const yM = String(yest.getMonth() + 1).padStart(2, '0');
            const yD = String(yest.getDate()).padStart(2, '0');
            const expectedYesterday = `${yY}-${yM}-${yD}`;

            assert.strictEqual(parseSpanishDateText('hoy'), expectedToday);
            assert.strictEqual(parseSpanishDateText('el dia de hoy'), expectedToday);
            assert.strictEqual(parseSpanishDateText('ayer'), expectedYesterday);
            assert.strictEqual(parseSpanishDateText('el dia de ayer'), expectedYesterday);
        });

        it('debe extraer la fecha inserta dentro de frases y preguntas completas', () => {
            assert.strictEqual(parseSpanishDateText('que estacion vendio mas el dia de ayer?'), '2026-10-11');
            assert.strictEqual(parseSpanishDateText('ventas del 5 de octubre'), '2026-10-05');
            assert.strictEqual(parseSpanishDateText('cual vendio mas el 15 de septiembre'), '2026-09-15');
            assert.strictEqual(parseSpanishDateText('descuadres del dia 5'), '2026-10-05');
        });

        it('debe retornar null para textos sin fecha válida o días inexistentes en calendario', () => {
            assert.strictEqual(parseSpanishDateText(''), null);
            assert.strictEqual(parseSpanishDateText(null), null);
            assert.strictEqual(parseSpanishDateText('sin fecha'), null);
            assert.strictEqual(parseSpanishDateText('32 de octubre'), null);
            assert.strictEqual(parseSpanishDateText('30 de febrero'), null);
        });
    });

    describe('parseSpanishPeriodOrDate', () => {
        it('debe reconocer mes completo especificado ("mes de octubre", "ventas de octubre")', () => {
            const p1 = parseSpanishPeriodOrDate('resumen de ventas por gasolinera mes de octubre');
            assert.ok(p1);
            assert.strictEqual(p1.type, 'month');
            assert.strictEqual(p1.year, 2026);
            assert.strictEqual(p1.month, 10);
            assert.strictEqual(p1.startDate, '2026-10-01');
            assert.strictEqual(p1.endDate, '2026-10-31');
            assert.strictEqual(p1.periodo, '2026-10');

            const p2 = parseSpanishPeriodOrDate('ventas en septiembre');
            assert.ok(p2);
            assert.strictEqual(p2.type, 'month');
            assert.strictEqual(p2.month, 9);
            assert.strictEqual(p2.startDate, '2026-09-01');
            assert.strictEqual(p2.endDate, '2026-09-30');
        });

        it('debe reconocer rangos de fechas ("del 1 al 10 de octubre", "entre 5 y 15 de septiembre")', () => {
            const r1 = parseSpanishPeriodOrDate('ventas del 1 al 10 de octubre');
            assert.ok(r1);
            assert.strictEqual(r1.type, 'range');
            assert.strictEqual(r1.startDate, '2026-10-01');
            assert.strictEqual(r1.endDate, '2026-10-10');

            const r2 = parseSpanishPeriodOrDate('entre el 5 y el 15 de septiembre del 2026');
            assert.ok(r2);
            assert.strictEqual(r2.type, 'range');
            assert.strictEqual(r2.startDate, '2026-09-05');
            assert.strictEqual(r2.endDate, '2026-09-15');
        });

        it('debe reconocer periodos relativos ("este mes", "mes pasado")', () => {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth() + 1;
            const thisM = parseSpanishPeriodOrDate('ahorro de paneles solares este mes');
            assert.ok(thisM);
            assert.strictEqual(thisM.type, 'month');
            assert.strictEqual(thisM.year, y);
            assert.strictEqual(thisM.month, m);

            const lastM = parseSpanishPeriodOrDate('ventas del mes pasado');
            assert.ok(lastM);
            assert.strictEqual(lastM.type, 'month');
        });

        it('debe delegar a fecha individual si contiene un día específico', () => {
            const s1 = parseSpanishPeriodOrDate('ventas del 5 de octubre');
            assert.ok(s1);
            assert.strictEqual(s1.type, 'single');
            assert.strictEqual(s1.date, '2026-10-05');
        });

        it('debe retornar null para textos sin periodo ni fecha válida', () => {
            assert.strictEqual(parseSpanishPeriodOrDate(''), null);
            assert.strictEqual(parseSpanishPeriodOrDate(null), null);
            assert.strictEqual(parseSpanishPeriodOrDate('hola asistente'), null);
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

    describe('NLU: normalizeText', () => {
        it('debe remover tildes, signos de puntuación y dobles espacios', () => {
            const raw = '  ¿Cuánto diésel vendió Costa del Sol, ayer?  ';
            const normalized = normalizeText(raw);
            assert.strictEqual(normalized, 'cuanto diesel vendio costa del sol ayer');
        });
    });

    describe('NLU: parseNaturalLanguageQuery', () => {
        it('debe resolver la pregunta exacta del usuario: "Cuanto diesel vendió costa del sol?"', () => {
            const query = 'Cuanto diesel vendió costa del sol?';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.matchedStation?.id, '008');
            assert.strictEqual(parsed.matchedStation?.name, 'Puma Costa del Sol');
            assert.strictEqual(parsed.matchedFuel?.key, 'diesel');
            assert.strictEqual(parsed.isRanking, false);
        });

        it('debe resolver consultas de estación sin producto específico: "Ventas de Miraflores"', () => {
            const query = 'Ventas de Miraflores';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.matchedStation?.id, '002');
            assert.strictEqual(parsed.matchedFuel, null);
        });

        it('debe detectar preguntas de ranking: "¿Cuál estación vendió más ayer?"', () => {
            const query = '¿Cuál estación vendió más ayer?';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.isRanking, true);
        });

        it('debe resolver consultas de banco específico: "¿Cuánto tenemos en Promerica?"', () => {
            const query = '¿Cuánto tenemos en Promerica?';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.matchedBank?.key, 'PROMERICA');
        });

        it('debe resolver consultas de auditoría: "¿Hubo algún descuadre ayer?"', () => {
            const query = '¿Hubo algún descuadre ayer?';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.isAlertas, true);
        });

        it('debe resolver consultas de tiendas: "Cortes de tienda de hoy"', () => {
            const query = 'Cortes de tienda de hoy';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.isTiendas, true);
        });

        it('debe resolver combustible global: "Venta total de regular"', () => {
            const query = 'Venta total de regular';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.matchedFuel?.key, 'regular');
            assert.strictEqual(parsed.matchedStation, null);
        });

        it('debe resolver sin colisión la pregunta real: "que estacion vendio mas el dia de ayer?" (evitando match erróneo de "ion")', () => {
            const query = 'que estacion vendio mas el dia de ayer?';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            // 1. "estacion" NO debe colisionar con combustible "ion"
            assert.strictEqual(parsed.matchedFuel, null);
            // 2. No debe asociarse a una estación fija
            assert.strictEqual(parsed.matchedStation, null);
            // 3. Debe identificarse como consulta de ranking
            assert.strictEqual(parsed.isRanking, true);
            // 4. Debe asociar la fecha correspondiente a ayer
            assert.strictEqual(parsed.targetDate, parseSpanishDateText('ayer'));
        });

        it('debe respetar límites estrictos de palabra para combustible ion (\\bion\\b) y prohibir match de subcadenas', () => {
            // "ion" como palabra aislada sí debe coincidir
            const parsedIon1 = parseNaturalLanguageQuery('Venta de ion diesel de ayer');
            assert.strictEqual(parsedIon1.matchedFuel?.key, 'ion');

            const parsedIon2 = parseNaturalLanguageQuery('total ion ayer');
            assert.strictEqual(parsedIon2.matchedFuel?.key, 'ion');

            // Palabras que contienen "ion" como subcadena NO deben coincidir
            const parsedNoIon1 = parseNaturalLanguageQuery('informacion de ventas');
            assert.strictEqual(parsedNoIon1.matchedFuel, null);

            const parsedNoIon2 = parseNaturalLanguageQuery('atencion al cliente');
            assert.strictEqual(parsedNoIon2.matchedFuel, null);

            const parsedNoIon3 = parseNaturalLanguageQuery('que estacion vendio mas');
            assert.strictEqual(parsedNoIon3.matchedFuel, null);

            const parsedNoIon4 = parseNaturalLanguageQuery('estacion lider en ventas');
            assert.strictEqual(parsedNoIon4.matchedFuel, null);
        });

        it('debe integrar fechas en español natural en parseNaturalLanguageQuery ("5 de octubre", "15 de septiembre", "05 de oct", "el dia 5")', () => {
            const parsed1 = parseNaturalLanguageQuery('Ventas del 5 de octubre');
            assert.strictEqual(parsed1.targetDate, '2026-10-05');

            const parsed2 = parseNaturalLanguageQuery('Consolidado del 15 de septiembre');
            assert.strictEqual(parsed2.targetDate, '2026-09-15');

            const parsed3 = parseNaturalLanguageQuery('Ventas del 05 de oct');
            assert.strictEqual(parsed3.targetDate, '2026-10-05');

            const parsed4 = parseNaturalLanguageQuery('Ventas el dia 5');
            assert.strictEqual(parsed4.targetDate, '2026-10-05');
        });

        it('debe identificar consulta mensual: "resumen de ventas por gasolinera mes de octubre" (mes octubre 2026)', () => {
            const query = 'resumen de ventas por gasolinera mes de octubre';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.isMonthly, true);
            assert.strictEqual(parsed.targetMonth, 10);
            assert.strictEqual(parsed.targetYear, 2026);
            assert.strictEqual(parsed.targetPeriod, '2026-10');
        });

        it('debe identificar consulta de rango: "del 1 al 10 de octubre"', () => {
            const query = 'del 1 al 10 de octubre';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.isRange, true);
            assert.strictEqual(parsed.startDate, '2026-10-01');
            assert.strictEqual(parsed.endDate, '2026-10-10');
        });

        it('debe identificar consulta de horas pico: "a que horas hubo la mayor cantidad de venta el dia de ayer"', () => {
            const query = 'a que horas hubo la mayor cantidad de venta el dia de ayer';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.isHourlyPeak, true);
            assert.strictEqual(parsed.targetDate, parseSpanishDateText('ayer'));
        });

        it('debe identificar consulta de energía: "ahorro en paneles solares y bateria"', () => {
            const query = 'ahorro en paneles solares y bateria';
            const parsed = parseNaturalLanguageQuery(query);
            assert.ok(parsed);
            assert.strictEqual(parsed.isSolar, true);
        });
    });

    describe('NLU Formatters', () => {
        const mockEstacion = {
            id_empresa: '008',
            empresa: 'Puma Costa del Sol',
            diesel: 3200,
            regular: 1800,
            super: 1500,
            ion: 0,
            galonaje: 6500,
            venta: 26000
        };

        it('formatSpecificStationMessage debe incluir el combustible destacado y los totales', () => {
            const fuel = { key: 'diesel', label: 'Diesel', icon: '🛢️' };
            const tienda = { empresa: 'Super 7 Costa del Sol', venta: 1200 };
            const msg = formatSpecificStationMessage(mockEstacion, fuel, '2026-10-11', tienda);

            assert.ok(msg.includes('Puma Costa del Sol'));
            assert.ok(msg.includes('Venta de Diesel'));
            assert.ok(msg.includes('3,200.00 gal'));
            assert.ok(msg.includes('$26,000.00'));
            assert.ok(msg.includes('Super 7 Costa del Sol'));
            assert.ok(msg.includes('$27,200.00')); // Estación + Tienda
        });

        it('formatProductTotalMessage debe totalizar el combustible entre todas las estaciones', () => {
            const fuel = { key: 'diesel', label: 'Diesel', icon: '🛢️' };
            const data = {
                estaciones: [
                    mockEstacion,
                    { id_empresa: '002', empresa: 'Puma Miraflores', diesel: 2000 }
                ]
            };
            const msg = formatProductTotalMessage(data, fuel, '2026-10-11');
            assert.ok(msg.includes('VENTA TOTAL DE DIESEL'));
            assert.ok(msg.includes('5,200.00 gal')); // 3200 + 2000
            assert.ok(msg.includes('Puma Costa del Sol'));
            assert.ok(msg.includes('Puma Miraflores'));
        });

        it('formatRankingMessage debe ordenar las estaciones de mayor a menor con medallas', () => {
            const data = {
                estaciones: [
                    { empresa: 'Puma Miraflores', venta: 15000, galonaje: 3800 },
                    { empresa: 'Puma Costa del Sol', venta: 26000, galonaje: 6500 }
                ]
            };
            const msg = formatRankingMessage(data, '2026-10-11', 'venta');
            assert.ok(msg.includes('RANKING DE VENTAS'));
            // Primero Puma Costa del Sol (26000)
            const idxCosta = msg.indexOf('Puma Costa del Sol');
            const idxMira = msg.indexOf('Puma Miraflores');
            assert.ok(idxCosta < idxMira);
            assert.ok(msg.includes('🥇'));
            assert.ok(msg.includes('🥈'));
        });

        it('formatSpecificBankMessage debe filtrar únicamente las cuentas del banco consultado', () => {
            const data = {
                fecha: '2026-10-12',
                cuentas: [
                    { banco: 'Banco Promerica', cuenta: 'Cta Recaudo (111)', saldo: 80000 },
                    { banco: 'Banco Agrícola', cuenta: 'Cta Principal (222)', saldo: 50000 }
                ]
            };
            const bank = { key: 'PROMERICA', label: 'Banco Promerica', keywords: ['promerica'] };
            const msg = formatSpecificBankMessage(data, bank);
            assert.ok(msg.includes('Banco Promerica'));
            assert.ok(msg.includes('$80,000.00'));
            assert.ok(msg.includes('Cta Recaudo (111)'));
            assert.ok(!msg.includes('Banco Agrícola'));
        });

        it('formatTiendasMessage debe formatear el listado de ventas en tiendas', () => {
            const data = {
                tiendas: [
                    { empresa: 'Super 7 Costa del Sol', venta: 1500.50 },
                    { empresa: 'E-Market Miraflores', venta: 800.00 }
                ]
            };
            const msg = formatTiendasMessage(data, '2026-10-11');
            assert.ok(msg.includes('VENTAS EN TIENDAS DE CONVENIENCIA'));
            assert.ok(msg.includes('$2,300.50')); // Total tiendas
            assert.ok(msg.includes('Super 7 Costa del Sol'));
            assert.ok(msg.includes('E-Market Miraflores'));
        });

        it('formatIntelligentGuidanceMessage debe contener ejemplos concretos de preguntas', () => {
            const msg = formatIntelligentGuidanceMessage();
            assert.ok(msg.includes('¿Cuánto diesel vendió Costa del Sol?'));
            assert.ok(msg.includes('Ventas de Miraflores'));
            assert.ok(msg.includes('¿Cuánto tenemos en Promerica?'));
        });

        it('formatRankingMessage debe soportar ranking por combustible específico', () => {
            const data = {
                estaciones: [
                    { empresa: 'Puma Miraflores', diesel: 1200, venta: 15000, galonaje: 3000 },
                    { empresa: 'Puma Costa del Sol', diesel: 3500, venta: 26000, galonaje: 6500 }
                ]
            };
            const fuel = { key: 'diesel', label: 'Diesel' };
            const msg = formatRankingMessage(data, '2026-10-11', 'venta', fuel);
            assert.ok(msg.includes('RANKING DE VENTA DE DIESEL POR ESTACIÓN'));
            assert.ok(msg.includes('3,500.00 gal'));
            assert.ok(msg.includes('1,200.00 gal'));
            const idxCosta = msg.indexOf('Puma Costa del Sol');
            const idxMira = msg.indexOf('Puma Miraflores');
            assert.ok(idxCosta < idxMira);
            assert.ok(msg.includes('🥇'));
            assert.ok(msg.includes('🥈'));
        });

        it('formatVentasMensualMessage debe estructurar el resumen mensual con ranking por galonaje y tiendas', () => {
            const data = {
                totales: {
                    galonaje: 154200.50,
                    venta_estacion: 580000.00,
                    venta_tienda: 45000.00,
                    venta_total: 625000.00
                },
                estaciones: [
                    { id_empresa: '002', empresa: 'Puma Miraflores', galonaje: 45000, venta_estacion: 170000, diesel: 20000, regular: 15000, super: 10000 },
                    { id_empresa: '008', empresa: 'Puma Costa del Sol', galonaje: 52000, venta_estacion: 195000, diesel: 25000, regular: 17000, super: 10000 }
                ],
                tiendas: [
                    { empresa: 'Super 7 Costa del Sol', venta: 28000 },
                    { empresa: 'E-Market Miraflores', venta: 17000 }
                ]
            };

            const msg = formatVentasMensualMessage(data, 2026, 10);
            assert.ok(msg.includes('OCTUBRE 2026'));
            assert.ok(msg.includes('154,200.50 gal'));
            assert.ok(msg.includes('$580,000.00'));
            assert.ok(msg.includes('$45,000.00'));
            assert.ok(msg.includes('$625,000.00'));
            // Ranking: Costa del Sol (52k gal) antes que Miraflores (45k gal)
            const idxCosta = msg.indexOf('Puma Costa del Sol');
            const idxMira = msg.indexOf('Puma Miraflores');
            assert.ok(idxCosta < idxMira);
            assert.ok(msg.includes('🥇'));
            assert.ok(msg.includes('🥈'));
            assert.ok(msg.includes('Super 7 Costa del Sol'));
            assert.ok(msg.includes('$28,000.00'));
        });

        it('formatVentasRangoMessage debe estructurar el reporte para un periodo delimitado', () => {
            const data = {
                totales: {
                    galonaje: 75000.00,
                    venta_estacion: 285000.00,
                    venta_tienda: 22000.00,
                    venta_total: 307000.00
                },
                estaciones: [
                    { id_empresa: '008', empresa: 'Puma Costa del Sol', galonaje: 40000, venta_estacion: 152000, diesel: 18000, regular: 12000, super: 10000 },
                    { id_empresa: '002', empresa: 'Puma Miraflores', galonaje: 35000, venta_estacion: 133000, diesel: 15000, regular: 12000, super: 8000 }
                ],
                tiendas: [
                    { empresa: 'Super 7 Costa del Sol', venta: 14000 }
                ]
            };

            const msg = formatVentasRangoMessage(data, '2026-10-01', '2026-10-10');
            assert.ok(msg.includes('VENTAS POR RANGO DE FECHAS'));
            assert.ok(msg.includes('Del 01/10/2026 al 10/10/2026'));
            assert.ok(msg.includes('75,000.00 gal'));
            assert.ok(msg.includes('$285,000.00'));
            assert.ok(msg.includes('Puma Costa del Sol'));
            assert.ok(msg.includes('Puma Miraflores'));
        });

        it('formatHorasPicoMessage debe estructurar el análisis con pico principal, top 3 y franjas', () => {
            const peakData = {
                hora_pico: '17:00 - 18:00',
                venta_hora_pico: 1850.75,
                transacciones_hora_pico: 112,
                pct_hora_pico: 10.5,
                ticket_promedio_pico: 16.52,
                total_venta: 17625.00,
                total_transacciones: 1050,
                top_3_horas: [
                    { franja: '17:00 - 18:00', total_venta: 1850.75, transacciones: 112, porcentaje_total: 10.5 },
                    { franja: '18:00 - 19:00', total_venta: 1674.37, transacciones: 101, porcentaje_total: 9.5 },
                    { franja: '07:00 - 08:00', total_venta: 1498.12, transacciones: 90, porcentaje_total: 8.5 }
                ],
                distribucion_franjas: {
                    madrugada: { total_venta: 705.00, porcentaje_total: 4.0 },
                    manana: { total_venta: 6168.75, porcentaje_total: 35.0 },
                    mediodia: { total_venta: 6609.37, porcentaje_total: 37.5 },
                    noche: { total_venta: 4141.88, porcentaje_total: 23.5 }
                }
            };

            const msg = formatHorasPicoMessage(peakData, '11/10/2026', false);
            assert.ok(msg.includes('ANÁLISIS DE HORAS PICO DE VENTA'));
            assert.ok(msg.includes('17:00 - 18:00'));
            assert.ok(msg.includes('$1,850.75'));
            assert.ok(msg.includes('112 tickets'));
            assert.ok(msg.includes('$16.52'));
            assert.ok(msg.includes('Top 3 Horas con Mayor Venta'));
            assert.ok(msg.includes('1️⃣'));
            assert.ok(msg.includes('2️⃣'));
            assert.ok(msg.includes('3️⃣'));
            assert.ok(msg.includes('Mañana (06:00 - 12:00)'));
            assert.ok(msg.includes('Mediodía/Tarde (12:00 - 18:00)'));
            assert.ok(msg.includes('Noche (18:00 - 24:00)'));
        });

        it('formatSolarEnergyMessage debe reportar tanto estado en tiempo real como ahorro diario/mensual', () => {
            // Caso 1: Estado en tiempo real
            const realtime = {
                potencia_total_kwp: 80.0,
                capacidad_bateria_total_kwh: 60.0,
                potencia_actual_estimada_kw: 52.4,
                bateria_promedio_soc_pct: 88.0,
                horas_autonomia_estimadas: 9.6,
                instalaciones: [
                    {
                        estacion_nombre: 'Puma Miraflores',
                        potencia_kwp: 45.0,
                        tiene_baterias: 1,
                        capacidad_bateria_kwh: 60.0,
                        bateria_soc_pct: 88.0,
                        horas_autonomia: 9.6,
                        bateria_estado: 'DESCARGA_CONTROLADA'
                    },
                    {
                        estacion_nombre: 'Puma Costa del Sol',
                        potencia_kwp: 35.0,
                        tiene_baterias: 0,
                        capacidad_bateria_kwh: 0.0,
                        bateria_soc_pct: 0.0,
                        horas_autonomia: 0.0,
                        bateria_estado: 'SIN_BATERIAS'
                    }
                ]
            };

            const msgRealtime = formatSolarEnergyMessage(realtime, 'estado_actual');
            assert.ok(msgRealtime.includes('80 kWp'));
            assert.ok(msgRealtime.includes('60 kWh'));
            assert.ok(msgRealtime.includes('88%'));
            assert.ok(msgRealtime.includes('9.6 hrs'));
            assert.ok(msgRealtime.includes('Puma Miraflores'));
            assert.ok(msgRealtime.includes('Puma Costa del Sol'));
            assert.ok(msgRealtime.includes('Sistema On-Grid'));

            // Caso 2: Ahorro mensual
            const mensual = {
                total_ahorro_usd: 1650.80,
                total_generacion_kwh: 9171.1,
                total_autoconsumo_kwh: 8254.0,
                total_bateria_descarga_kwh: 642.0,
                total_co2_evitado_kg: 3530.9,
                bateria_miraflores_soc_pct: 88.0,
                horas_autonomia_miraflores: 9.6,
                estaciones: [
                    { estacion_nombre: 'Puma Miraflores', potencia_kwp: 45.0, ahorro_usd: 978.50, generacion_kwh: 5436.1, bateria_descarga_kwh: 642.0 },
                    { estacion_nombre: 'Puma Costa del Sol', potencia_kwp: 35.0, ahorro_usd: 672.30, generacion_kwh: 3735.0, bateria_descarga_kwh: 0.0 }
                ]
            };

            const msgMensual = formatSolarEnergyMessage(mensual, 'mensual', 'Octubre 2026');
            assert.ok(msgMensual.includes('Octubre 2026'));
            assert.ok(msgMensual.includes('$1,650.80'));
            assert.ok(msgMensual.includes('9,171.10 kWh'));
            assert.ok(msgMensual.includes('3,530.90 kg'));
            assert.ok(msgMensual.includes('Puma Miraflores'));
            assert.ok(msgMensual.includes('Puma Costa del Sol'));
        });
    });
});
