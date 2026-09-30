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

    test('getEmpresas debe retornar el catálogo de empresas registradas en Sipe Web SaaS', async () => {
        const empresas = await rhPlanillaService.getEmpresas();
        assert.ok(Array.isArray(empresas), 'Debe retornar un arreglo');
        assert.ok(empresas.length > 0, 'Debe contener al menos una empresa');

        const empAndelsa = empresas.find(e => e.id === 9 || e.razon_social.includes('ANDELSA'));
        assert.ok(empAndelsa, 'Debe existir ANDELSA en las empresas');
        assert.ok(typeof empAndelsa.razon_social === 'string');
    });

    test('getPlanillasGrupos debe retornar los períodos agrupados y su estado general', async () => {
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

    test('getPlanillaDetalle debe listar empleados con rubros desglosados', async () => {
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

    test('exportBancario debe generar CSV con BOM y formato ="cuenta",monto,nombre y TXT tabulado', async () => {
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

    test('generatePlanillaReportePDF debe emitir un Buffer de PDF válido (Carta Horizontal)', async () => {
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

    test('generateRecibosMasivosPDF debe emitir un Buffer de PDF válido con 2 recibos por página', async () => {
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

    test('generateReciboIndividualPDF debe emitir un Buffer de PDF válido para un empleado específico', async () => {
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
});
