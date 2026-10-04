const { describe, it } = require('node:test');
const assert = require('node:assert');
const consultasRouter = require('../routes/consultas');

describe('Motor de Análisis Forense de Descuadres de Cierre de Turno', () => {
    const { generarAnalisisDescuadre, mapCierreRowConExplicacion } = consultasRouter;

    it('debe diagnosticar correctamente un faltante crítico (-$3,741.86) e identificar al turno y responsable foco', () => {
        const turnosMock = [
            {
                id: 101,
                turno: 1,
                responsable: 'Carlos Henríquez',
                venta: 8200.00,
                remesas: 4100.00,
                tarjetas: 3200.00,
                gastos: 289.38,
                pagos: 0,
                descuentos: 0,
                cupones: 0,
                suma: 7589.38,
                diferencia: -610.62
            },
            {
                id: 102,
                turno: 2,
                responsable: 'Francisco Amaya',
                venta: 10922.97,
                remesas: 3652.76,
                tarjetas: 4027.01,
                gastos: 75.00,
                pagos: 82.21,
                descuentos: 0,
                cupones: 0,
                suma: 7836.98,
                diferencia: -3085.99
            }
        ];

        const analisis = generarAnalisisDescuadre({
            id_empresa: '002',
            estacion: 'Puma Miraflores',
            fecha: '02/10/2026',
            totVenta: 19122.97,
            ventaCombustible: 19077.72,
            lubricantes: 45.25,
            noEfectivo: 7264.01,
            desgloseNoEfectivo: { tarjetas: 7227.01, cupones: 37.00, cheques: 0, credito: 0 },
            efectivoEsperado: 11858.96,
            efectivoDescargado: 8117.10,
            desgloseDescargos: { remesas: 7752.76, gastos: 76.40, pagos: 103.20, descuentos: 184.74, anticipos: 0 },
            diferencia: -3741.86,
            turnos: turnosMock
        });

        // 1. Severidad y riesgo
        assert.strictEqual(analisis.severidad, 'critica');
        assert.strictEqual(analisis.nivel_riesgo, 'danger');
        assert.ok(analisis.etiqueta_severidad.includes('Faltante Crítico'));

        // 2. Diagnóstico conciso
        assert.ok(analisis.diagnostico_principal.includes('3741.86'));
        assert.ok(analisis.diagnostico_principal.includes('11858.96'));

        // 3. Foco de responsabilidad (Turno 2 con Francisco Amaya)
        assert.ok(analisis.foco_turno !== null);
        assert.strictEqual(analisis.foco_turno.turno, 2);
        assert.strictEqual(analisis.foco_turno.responsable, 'Francisco Amaya');
        assert.strictEqual(analisis.foco_turno.diferencia, -3085.99);
        assert.strictEqual(analisis.foco_turno.porcentaje, '82.5%');

        // 4. Hipótesis operativas
        assert.ok(analisis.hipotesis_probables.length >= 2);
        assert.ok(analisis.hipotesis_probables.some(h => h.titulo.includes('Remesa física')));

        // 5. Checklist de auditoría
        assert.ok(analisis.checklist_auditoria.length >= 3);
        assert.ok(analisis.checklist_auditoria.some(c => c.accion.includes('Francisco Amaya')));

        // 6. Mensaje WhatsApp
        assert.ok(analisis.mensaje_whatsapp.includes('Puma Miraflores'));
        assert.ok(analisis.mensaje_whatsapp.includes('Francisco Amaya'));
        assert.ok(analisis.mensaje_whatsapp.includes('-$3,741.86'));
    });

    it('debe reconocer un cierre perfectamente cuadrado ($0.00)', () => {
        const analisis = generarAnalisisDescuadre({
            id_empresa: '006',
            estacion: 'Shell Chalchuapa',
            fecha: '02/10/2026',
            totVenta: 10000.00,
            noEfectivo: 3000.00,
            efectivoEsperado: 7000.00,
            efectivoDescargado: 7000.00,
            desgloseDescargos: { remesas: 7000.00, gastos: 0, pagos: 0 },
            diferencia: 0.00,
            turnos: []
        });

        assert.strictEqual(analisis.severidad, 'cuadrado');
        assert.strictEqual(analisis.nivel_riesgo, 'ok');
        assert.ok(analisis.diagnostico_principal.includes('cuadrado al centavo'));
        assert.strictEqual(analisis.foco_turno, null);
    });

    it('debe detectar un sobrante atípico (+$1,500.00)', () => {
        const analisis = generarAnalisisDescuadre({
            id_empresa: '014',
            estacion: 'Puma La Loma',
            fecha: '02/10/2026',
            totVenta: 5000.00,
            noEfectivo: 1000.00,
            efectivoEsperado: 4000.00,
            efectivoDescargado: 5500.00,
            desgloseDescargos: { remesas: 5500.00, gastos: 0, pagos: 0 },
            diferencia: 1500.00,
            turnos: []
        });

        assert.strictEqual(analisis.severidad, 'critica');
        assert.strictEqual(analisis.nivel_riesgo, 'warning');
        assert.ok(analisis.etiqueta_severidad.includes('Sobrante'));
        assert.ok(analisis.hipotesis_probables.some(h => h.titulo.includes('turno anterior')));
    });

    it('mapCierreRowConExplicacion debe estructurar correctamente la entidad y su análisis', () => {
        const rawRow = {
            id_empresa: '002',
            estacion: 'Puma Miraflores',
            creditos: '0',
            cupones: '37.00',
            cheques: '0',
            tarjetas: '7227.01',
            remesas: '7752.76',
            gastos: '76.40',
            anticipos: '0',
            pagos: '103.20',
            descuentos: '184.74',
            total_venta: '19077.72',
            lubricantes: '45.25'
        };

        const turnosMap = {
            '002': [
                { id: 101, turno: 1, responsable: 'Carlos H', venta: 8200, diferencia: -610.62 },
                { id: 102, turno: 2, responsable: 'Francisco A', venta: 10922.97, diferencia: -3085.99 }
            ]
        };

        const mapped = mapCierreRowConExplicacion(rawRow, turnosMap, '02/10/2026');

        assert.strictEqual(mapped.id_empresa, '002');
        assert.strictEqual(mapped.tot_venta, 19122.97);
        assert.strictEqual(mapped.diferencia, -3741.86);
        assert.strictEqual(mapped.tiene_incongruencia, true);
        assert.ok(mapped.explicacion_diferencia.analisis_inteligente);
        assert.strictEqual(mapped.explicacion_diferencia.analisis_inteligente.foco_turno.responsable, 'Francisco A');
        assert.strictEqual(mapped.turnos.length, 2);
    });
});
