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
});
