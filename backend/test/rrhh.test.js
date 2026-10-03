const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const { getDb, getAccountingDb } = require('../db');
const rhPlanillaService = require('../services/rhPlanillaService');
const { numberToWords } = require('../utils/numberToWords');

describe('Módulo RRHH Planillas Unit & Integration Tests', () => {
    after(async () => {
        try {
            const db = await getAccountingDb();
            await db.end();
        } catch (e) {
            // ignore
        }
        try {
            const main = getDb();
            await main.end();
        } catch (e) {
            // ignore
        }
    });

    test('numberToWords debe formatear importes a texto legal correctamente', () => {
        const t1 = numberToWords(1500.50);
        assert.ok(t1.includes('MIL QUINIENTOS'));
        assert.ok(t1.includes('50/100 USD'));

        const t2 = numberToWords(0.00);
        assert.ok(t2.includes('CERO'));
        assert.ok(t2.includes('00/100 USD'));

        const t3 = numberToWords(8201.96);
        assert.ok(t3.includes('OCHO MIL DOSCIENTOS UNO'));
        assert.ok(t3.includes('96/100 USD'));
    });

    let dbAvailable = null;
    const checkDb = async () => {
        if (dbAvailable !== null) return dbAvailable;
        try {
            const db = await getAccountingDb();
            const [rows] = await db.query('SELECT 1 as ok');
            dbAvailable = !!(rows && rows[0]?.ok);
        } catch (e) {
            dbAvailable = false;
        }
        return dbAvailable;
    };

    const testWithDb = (title, fn) => {
        test(title, async (t) => {
            const available = await checkDb();
            if (!available) {
                t.skip('MySQL no disponible en este entorno');
                return;
            }
            await fn(t);
        });
    };

    testWithDb('getEmpresas debe retornar el catálogo de empresas registradas en Sipe Web SaaS', async () => {
        const empresas = await rhPlanillaService.getEmpresas();
        assert.ok(Array.isArray(empresas), 'Debe retornar un arreglo');
        assert.ok(empresas.length > 0, 'Debe contener al menos una empresa');

        const empAndelsa = empresas.find(e => e.id === 9 || e.razon_social.includes('ANDELSA'));
        assert.ok(empAndelsa, 'Debe existir ANDELSA en las empresas');
        assert.ok(typeof empAndelsa.razon_social === 'string');
    });

    testWithDb('getPlanillasGrupos debe retornar los períodos agrupados y su estado general', async () => {
        const resultado = await rhPlanillaService.getPlanillasGrupos({
            companyId: 9,
            anio: 2026
        });

        assert.ok(Array.isArray(resultado.data), 'data debe ser un arreglo');
        assert.ok(resultado.data.length > 0, 'Debe contener períodos para ANDELSA en 2026');

        const first = resultado.data[0];
        assert.ok(first.periodo_anio === 2026);
        assert.ok(first.quincena === 'primera' || first.quincena === 'segunda');
        assert.ok(Number(first.total_empleados) > 0);
        assert.ok(Number(first.total_percepciones) > 0);
        assert.ok(Number(first.total_neto) > 0);
        assert.ok(['pagada', 'pendiente'].includes(first.estado_general), 'estado_general debe ser pagada o pendiente');
    });

    testWithDb('getPlanillaDetalle debe listar empleados con rubros desglosados', async () => {
        const detalle = await rhPlanillaService.getPlanillaDetalle({
            companyId: 9,
            anio: 2026,
            mes: 9,
            quincena: 'segunda'
        });

        assert.ok(Array.isArray(detalle.empleados), 'empleados debe ser un arreglo');
        assert.ok(detalle.empleados.length > 0, 'Debe contener empleados');
        assert.ok(detalle.totales !== null, 'totales debe existir');

        const primerEmp = detalle.empleados[0];
        assert.ok(primerEmp.empleado_codigo, 'Empleado debe tener código');
        assert.ok(primerEmp.empleado_nombres, 'Empleado debe tener nombres');
        assert.ok(Array.isArray(primerEmp.rubros), 'Empleado debe tener arreglo de rubros');
        assert.ok(primerEmp.rubros.length > 0, 'Empleado debe tener rubros itemizados');
    });

    testWithDb('exportBancario debe generar CSV con BOM y formato ="cuenta",monto,nombre y TXT tabulado', async () => {
        const exportData = await rhPlanillaService.exportBancario({
            companyId: 9,
            anio: 2026,
            mes: 9,
            quincena: 'segunda'
        });

        assert.ok(exportData.csv, 'Debe contener propiedad csv');
        assert.ok(exportData.txt, 'Debe contener propiedad txt');
        assert.ok(exportData.fileNameBase.includes('PLANILLA_BANCARIA'), 'Nombre base de archivo debe ser descriptivo');

        // Validar CSV
        assert.ok(exportData.csv.startsWith('\uFEFFsep=,\n'), 'CSV debe comenzar con BOM UTF-8 y declaración sep=,');
        assert.ok(exportData.csv.includes('="'), 'CSV debe contener cuentas con formato ="..." para preservar ceros');

        // Validar TXT
        assert.ok(exportData.txt.includes('\t'), 'TXT debe ser tabulado');
    });

    testWithDb('generatePlanillaReportePDF debe emitir un Buffer de PDF válido (Carta Horizontal)', async () => {
        const pdfBuffer = await rhPlanillaService.generatePlanillaReportePDF({
            companyId: 9,
            anio: 2026,
            mes: 9,
            quincena: 'segunda'
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Debe ser un Buffer');
        assert.ok(pdfBuffer.length > 1000, 'El PDF debe tener contenido');
        assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF', 'Debe comenzar con la firma mágica %PDF');
    });

    testWithDb('generateRecibosMasivosPDF debe emitir un Buffer de PDF válido con 2 recibos por página', async () => {
        const pdfBuffer = await rhPlanillaService.generateRecibosMasivosPDF({
            companyId: 9,
            anio: 2026,
            mes: 9,
            quincena: 'segunda'
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Debe ser un Buffer');
        assert.ok(pdfBuffer.length > 5000, 'El PDF de recibos masivos debe tener contenido sustancial');
        assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF', 'Debe comenzar con la firma mágica %PDF');
    });

    testWithDb('generateReciboIndividualPDF debe emitir un Buffer de PDF válido para un empleado específico', async () => {
        const detalle = await rhPlanillaService.getPlanillaDetalle({
            companyId: 9,
            anio: 2026,
            mes: 9,
            quincena: 'segunda'
        });
        const empId = detalle.empleados[0].id;

        const pdfBuffer = await rhPlanillaService.generateReciboIndividualPDF({
            companyId: 9,
            planillaId: empId
        });

        assert.ok(Buffer.isBuffer(pdfBuffer), 'Debe ser un Buffer');
        assert.ok(pdfBuffer.length > 1000, 'El PDF del recibo individual debe tener contenido');
        assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF', 'Debe comenzar con la firma mágica %PDF');
    });

    testWithDb('getCuentasBancariasParaPago debe retornar cuentas bancarias activas y formas de pago', async () => {
        const resultado = await rhPlanillaService.getCuentasBancariasParaPago(9);
        assert.ok(Array.isArray(resultado.cuentas), 'cuentas debe ser un arreglo');
        assert.ok(resultado.cuentas.length > 0, 'Debe haber al menos una cuenta activa');
        assert.ok(Array.isArray(resultado.formas_pago), 'formas_pago debe ser un arreglo');
        assert.ok(resultado.formas_pago.some(f => f.codigo === 'TR'), 'Debe incluir Transferencia Bancaria (TR)');

        const cta = resultado.cuentas[0];
        assert.ok(cta.id > 0, 'Cuenta debe tener id');
        assert.ok(cta.numero, 'Cuenta debe tener número');
        assert.ok(cta.banco_nombre, 'Cuenta debe tener nombre de banco');
    });

    testWithDb('registrarPagoPlanilla debe registrar múltiples formas de pago, afectar cuentas con fecha_aplicado NULL y permitir anulación', async () => {
        const adminDb = getDb();
        const saasDb = await getAccountingDb();

        // 1. Obtener una cuenta bancaria activa
        const { cuentas } = await rhPlanillaService.getCuentasBancariasParaPago(9);
        assert.ok(cuentas.length > 0, 'Debe haber cuentas disponibles');
        const cta1 = cuentas[0];
        const cta2 = cuentas[1] || cuentas[0];

        // 2. Registrar pago dividido en dos formas de pago para período de prueba
        const testAnio = 2026;
        const testMes = 9;
        const testQuincena = 'segunda';

        // Limpiar pagos previos de prueba si hubiesen
        await adminDb.query('DELETE FROM rh_planilla_pagos WHERE company_id = ? AND periodo_anio = ? AND periodo_mes = ? AND quincena = ?', [9, testAnio, testMes, testQuincena]);

        const resPago = await rhPlanillaService.registrarPagoPlanilla({
            companyId: 9,
            anio: testAnio,
            mes: testMes,
            quincena: testQuincena,
            pagos: [
                {
                    cuenta_bancaria_id: cta1.id,
                    forma_pago: 'Transferencia',
                    documento: 'TR-TEST-100',
                    monto: 150.00,
                    fecha_pago: '2026-09-30'
                },
                {
                    cuenta_bancaria_id: cta2.id,
                    forma_pago: 'Cheque',
                    documento: 'CH-TEST-200',
                    monto: 75.50,
                    fecha_pago: '2026-09-30'
                }
            ],
            userId: 1
        });

        assert.equal(resPago.success, true);
        assert.equal(resPago.pagos_count, 2);
        assert.equal(resPago.total_pagado, 225.50);

        // 3. Verificar que en movimientos_bancarios se crearon los registros con fecha_aplicado = NULL
        const movIds = resPago.movimientos.map(m => m.movimiento_bancario_id);
        const [movs] = await adminDb.query('SELECT * FROM movimientos_bancarios WHERE id IN (?)', [movIds]);
        assert.equal(movs.length, 2, 'Deben existir 2 movimientos creados');
        for (const m of movs) {
            assert.equal(m.fecha_aplicado, null, 'OBLIGATORIO: fecha_aplicado debe ser NULL para ser conciliable');
            assert.ok(Number(m.cargo) > 0, 'El cargo debe ser mayor a 0 (salida de dinero)');
            assert.equal(Number(m.abono), 0, 'El abono debe ser 0');
        }

        // 4. Verificar que en db_sistema_saas rh_planillas el estado pasó a "pagada"
        const [planillasPagadas] = await saasDb.query(
            'SELECT DISTINCT estado FROM rh_planillas WHERE company_id = ? AND periodo_anio = ? AND periodo_mes = ? AND quincena = ?',
            [9, testAnio, testMes, testQuincena]
        );
        assert.equal(planillasPagadas[0]?.estado, 'pagada', 'Estado en SaaS debe ser pagada');

        // 5. Consultar pagos registrados mediante getPagosPlanilla
        const pagosRegistrados = await rhPlanillaService.getPagosPlanilla({
            companyId: 9,
            anio: testAnio,
            mes: testMes,
            quincena: testQuincena
        });
        assert.equal(pagosRegistrados.length, 2);
        assert.equal(pagosRegistrados[0].es_conciliado, 0, 'No debe estar marcado como conciliado aún');

        // 6. Validar que si el movimiento está conciliado (fecha_aplicado != null), la anulación sea rechazada
        const primerPagoId = pagosRegistrados[0].id;
        const primerMovId = pagosRegistrados[0].movimiento_bancario_id;
        await adminDb.query('UPDATE movimientos_bancarios SET fecha_aplicado = "2026-09-30" WHERE id = ?', [primerMovId]);

        await assert.rejects(
            async () => {
                await rhPlanillaService.anularPagoPlanilla({ pagoId: primerPagoId, userId: 1 });
            },
            /ya ha sido conciliado en el módulo de Bancos/
        );

        // Desconciliar para probar la anulación exitosa
        await adminDb.query('UPDATE movimientos_bancarios SET fecha_aplicado = NULL WHERE id = ?', [primerMovId]);

        // 7. Anular ambos pagos y verificar reversión
        for (const p of pagosRegistrados) {
            const anularRes = await rhPlanillaService.anularPagoPlanilla({ pagoId: p.id, userId: 1 });
            assert.equal(anularRes.success, true);
        }

        // Verificar que los movimientos bancarios fueron eliminados
        const [movsRestantes] = await adminDb.query('SELECT * FROM movimientos_bancarios WHERE id IN (?)', [movIds]);
        assert.equal(movsRestantes.length, 0, 'Los movimientos bancarios deben haberse eliminado tras la anulación');

        // Verificar que la planilla volvió a estado "pendiente"
        const [planillasRevertidas] = await saasDb.query(
            'SELECT DISTINCT estado FROM rh_planillas WHERE company_id = ? AND periodo_anio = ? AND periodo_mes = ? AND quincena = ?',
            [9, testAnio, testMes, testQuincena]
        );
        assert.equal(planillasRevertidas[0]?.estado, 'pendiente', 'Estado debe regresar a pendiente al anular todos los pagos');
    });

    testWithDb('getPlanillasGrupos debe calcular timestamp de última modificación y conteo de anomalías', async () => {
        const resultado = await rhPlanillaService.getPlanillasGrupos({
            companyId: 2,
            anio: 2026
        });

        assert.ok(Array.isArray(resultado.data));
        assert.ok(resultado.data.length > 0);
        const grupo = resultado.data[0];
        assert.ok(grupo.ultima_modificacion, 'Debe incluir fecha ISO de última modificación');
        assert.ok(grupo.ultima_modificacion_formato, 'Debe incluir fecha formateada en es-SV');
        assert.ok(typeof grupo.total_anomalias === 'number', 'total_anomalias debe ser numérico');
    });

    testWithDb('getPlanillaDetalle debe calcular auditoría, alertas comparativas y desglose por rubro', async () => {
        const detalle = await rhPlanillaService.getPlanillaDetalle({
            companyId: 2,
            anio: 2026,
            mes: 9,
            quincena: 'segunda'
        });

        // Validar auditoría y timestamps
        assert.ok(detalle.auditoria, 'Debe incluir objeto de auditoría');
        assert.ok(detalle.auditoria.ultima_modificacion_formato, 'Auditoría debe tener fecha y hora formateada');
        assert.ok(Array.isArray(detalle.auditoria.alertas), 'Auditoría debe tener arreglo de alertas');
        assert.ok(typeof detalle.auditoria.total_alertas === 'number');

        // Validar comparativa contra período anterior
        assert.ok(detalle.periodo_anterior, 'Debe incluir objeto de período anterior');
        assert.equal(detalle.periodo_anterior.existe, true);
        assert.equal(detalle.periodo_anterior.quincena, 'primera');
        assert.ok(Array.isArray(detalle.periodo_anterior.empleados_nuevos));

        // Validar desglose de rubros en empleados
        assert.ok(detalle.empleados.length > 0);
        const empConExtras = detalle.empleados.find(e => e.desglose_ingresos_extra.length > 0);
        assert.ok(empConExtras, 'Debe existir empleado con ingresos extra itemizados');
        assert.ok(empConExtras.desglose_ingresos_extra[0].descripcion);
        assert.ok(typeof empConExtras.desglose_ingresos_extra[0].monto === 'number');

        // Validar información de jornada y ausencias
        const empConAusencia = detalle.empleados.find(e => e.info_jornada.tiene_ausencia);
        assert.ok(empConAusencia, 'Debe detectar empleado con días de ausencia (Yolanda Aracely)');
        assert.equal(empConAusencia.info_jornada.dias_trabajados, 10);
        assert.equal(empConAusencia.info_jornada.dias_ausente, 5);
        assert.ok(empConAusencia.info_jornada.descuento_ausencia > 0);
    });
});

