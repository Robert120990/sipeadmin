const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Suite de Inteligencia y Decisión Estratégica Tests', () => {

    describe('Algoritmo de Compra Pre-DGEHM (Cálculo de Oportunidad)', () => {
        it('debe calcular ganancia proyectada positiva cuando el precio sube', () => {
            const variacionSuper = 0.08; // Sube $0.08 / gal
            const ullageDisponible = 5000; // 5,000 galones de espacio libre
            const galonesRecomendados = Math.floor(ullageDisponible * 0.95); // 4,750 gal
            const impactoFinanciero = galonesRecomendados * variacionSuper;

            assert.strictEqual(galonesRecomendados, 4750);
            assert.strictEqual(impactoFinanciero, 380);
            assert.ok(impactoFinanciero > 0, 'La ganancia de oportunidad debe ser positiva ante una subida de precio');
        });

        it('debe mitigar devaluación de inventario cuando el precio baja', () => {
            const variacionDiesel = -0.10; // Baja $0.10 / gal
            const stockActual = 6000;
            const devaluacionEvitada = Math.abs(stockActual * variacionDiesel);

            assert.strictEqual(devaluacionEvitada, 600);
        });
    });

    describe('Punto de Equilibrio y Margen por Galón (P&L Operativo)', () => {
        it('debe calcular correctamente el punto de equilibrio en galones mínimos', () => {
            const gastosOperativosTotales = 6000; // $6,000 USD de gastos fijos y variables
            const margenBrutoPorGalon = 0.30; // $0.30 USD por galón

            const puntoEquilibrioGalones = Math.round(gastosOperativosTotales / margenBrutoPorGalon);
            assert.strictEqual(puntoEquilibrioGalones, 20000, 'Se requieren 20,000 galones para cubrir los costos');
        });

        it('debe calcular margen neto por galón positivo cuando hay superávit', () => {
            const galonesVendidos = 25000;
            const utilidadOperativa = 1500; // $1,500 de ganancia neta

            const margenNetoGalon = Math.round((utilidadOperativa / galonesVendidos) * 1000) / 1000;
            assert.strictEqual(margenNetoGalon, 0.06);
        });
    });

    describe('Scoring y Clasificación de Riesgo Crediticio', () => {
        it('debe clasificar como CRÍTICO si el uso de línea supera 95% o mora > 7 días', () => {
            const limiteCredito = 10000;
            const saldoPendiente = 9600;
            const diasMora = 8;

            const porcentajeUso = (saldoPendiente / limiteCredito) * 100;
            let nivelRiesgo = 'bajo';
            if (porcentajeUso >= 95 || diasMora > 7) {
                nivelRiesgo = 'critico';
            }

            assert.strictEqual(nivelRiesgo, 'critico');
        });

        it('debe clasificar como BAJO si está dentro del límite y sin mora', () => {
            const limiteCredito = 10000;
            const saldoPendiente = 3500;
            const diasMora = 0;

            const porcentajeUso = (saldoPendiente / limiteCredito) * 100;
            let nivelRiesgo = 'bajo';
            if (porcentajeUso >= 95 || diasMora > 7) {
                nivelRiesgo = 'critico';
            } else if (porcentajeUso >= 75 || diasMora > 0) {
                nivelRiesgo = 'advertencia';
            }

            assert.strictEqual(nivelRiesgo, 'bajo');
        });
    });

    describe('Lógica de Brechas de Liquidez en Flujo de Caja', () => {
        it('debe detectar déficit cuando el saldo proyectado es menor que cero', () => {
            const saldoDia = -4500;
            const fondoReserva = 15000;

            let estado = 'optimo';
            if (saldoDia < 0) {
                estado = 'deficit';
            } else if (saldoDia < fondoReserva) {
                estado = 'reserva_baja';
            }

            assert.strictEqual(estado, 'deficit');
        });

        it('debe detectar reserva baja cuando el saldo proyectado es positivo pero menor a $15,000', () => {
            const saldoDia = 8200;
            const fondoReserva = 15000;

            let estado = 'optimo';
            if (saldoDia < 0) {
                estado = 'deficit';
            } else if (saldoDia < fondoReserva) {
                estado = 'reserva_baja';
            }

            assert.strictEqual(estado, 'reserva_baja');
        });
    });

    describe('Normalización de Estructuras Nova SaaS (db_sistema_saas)', () => {
        it('debe mapear correctamente los tipos de combustible numéricos a códigos estándar (R, S, D, I)', () => {
            const mapTipo = (tipoNum, desc = '') => {
                if (tipoNum === 4 || desc.includes('Ion')) return 'I';
                if (tipoNum === 3 || desc.includes('Diesel')) return 'D';
                if (tipoNum === 2 || desc.includes('Super')) return 'S';
                if (tipoNum === 1 || desc.includes('Regular')) return 'R';
                return 'D';
            };

            assert.strictEqual(mapTipo(1, 'Tanque Regular'), 'R');
            assert.strictEqual(mapTipo(2, 'Tanque Super'), 'S');
            assert.strictEqual(mapTipo(3, 'Tanque Diesel'), 'D');
            assert.strictEqual(mapTipo(4, 'Tanque Ion Diesel'), 'I');
            assert.strictEqual(mapTipo(5, 'Master Diesel'), 'D');
        });

        it('debe calcular horas y días restantes de autonomía basados en stock útil y consumo horario', () => {
            const reserva = 200;
            const stockActual = 4200;
            const consumoDiario = 1200; // gal/día

            const stockUtil = Math.max(0, stockActual - reserva); // 4000
            const consumoHora = consumoDiario / 24; // 50 gal/hora

            const horasRestantes = Math.round((stockUtil / consumoHora) * 10) / 10;
            const diasRestantes = Math.round((stockUtil / consumoDiario) * 10) / 10;

            assert.strictEqual(horasRestantes, 80.0);
            assert.strictEqual(diasRestantes, 3.3);

            let estado = 'optimo';
            if (horasRestantes < 24) estado = 'critico';
            else if (horasRestantes < 48) estado = 'advertencia';

            assert.strictEqual(estado, 'optimo');
        });

        it('debe clasificar como CRITICO si las horas restantes son menores a 24 horas', () => {
            const stockUtil = 800;
            const consumoHora = 50; // 16 horas restantes
            const horasRestantes = Math.round((stockUtil / consumoHora) * 10) / 10;

            let estado = 'optimo';
            if (horasRestantes < 24) estado = 'critico';
            else if (horasRestantes < 48) estado = 'advertencia';

            assert.strictEqual(horasRestantes, 16.0);
            assert.strictEqual(estado, 'critico');
        });

        it('debe descartar turnos no cerrados en el filtro de estado', () => {
            const turnos = [
                { id: 1, estado: 'cerrado', galones: 1200 },
                { id: 2, estado: 'abierto', galones: 300 },
                { id: 3, estado: 'reabierto', galones: 150 },
                { id: 4, estado: 'cerrado', galones: 850 }
            ];

            const turnosValidos = turnos.filter(t => t.estado === 'cerrado');
            const totalGalonesCerrados = turnosValidos.reduce((s, t) => s + t.galones, 0);

            assert.strictEqual(turnosValidos.length, 2);
            assert.strictEqual(totalGalonesCerrados, 2050);
        });
    });

    describe('Formato de Fechas dd/mm/yyyy en Módulo Dirección Estratégica', () => {
        const formatDMY = (val) => {
            if (!val) return '';
            if (typeof val === 'string') {
                const trimmed = val.trim();
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
                const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (match) {
                    const [, y, m, d] = match;
                    return `${d}/${m}/${y}`;
                }
            }
            if (val instanceof Date && !isNaN(val.getTime())) {
                const day = String(val.getDate()).padStart(2, '0');
                const month = String(val.getMonth() + 1).padStart(2, '0');
                return `${day}/${month}/${val.getFullYear()}`;
            }
            return String(val);
        };

        it('debe formatear cadenas ISO YYYY-MM-DD a dd/mm/yyyy sin desfase de zona horaria', () => {
            assert.strictEqual(formatDMY('2026-09-20'), '20/09/2026');
            assert.strictEqual(formatDMY('2026-01-05'), '05/01/2026');
            assert.strictEqual(formatDMY('2026-12-31'), '31/12/2026');
        });

        it('debe mantener cadenas que ya están en dd/mm/yyyy', () => {
            assert.strictEqual(formatDMY('20/09/2026'), '20/09/2026');
        });

        it('debe manejar strings con timestamp ISO conservando la fecha exacta en dd/mm/yyyy', () => {
            assert.strictEqual(formatDMY('2026-09-20T14:30:00.000Z'), '20/09/2026');
            assert.strictEqual(formatDMY('2026-10-05 08:00:00'), '05/10/2026');
        });

        it('debe retornar cadena vacía ante valores nulos o indefinidos', () => {
            assert.strictEqual(formatDMY(null), '');
            assert.strictEqual(formatDMY(undefined), '');
            assert.strictEqual(formatDMY(''), '');
        });
    });
});

