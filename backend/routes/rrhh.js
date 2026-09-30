const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const rhPlanillaService = require('../services/rhPlanillaService');

const PERMISSION_REQUIRED = ['/dashboard/rrhh/planillas', 'view_rrhh_planillas'];

/**
 * 1. Obtener empresas de Sipe Web SaaS
 */
router.get('/empresas', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const empresas = await rhPlanillaService.getEmpresas();
        res.json(empresas);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar empresas de RRHH');
    }
});

/**
 * 2. Obtener sucursales y departamentos para filtros
 */
router.get('/filtros', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id } = req.query;
        if (!company_id) {
            return res.status(400).json({ message: 'company_id es requerido' });
        }
        const filtros = await rhPlanillaService.getFiltros(company_id);
        res.json(filtros);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar filtros');
    }
});

/**
 * 3. Obtener planillas agrupadas por período (con estado de cierre)
 */
router.get('/planillas/grupos', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id, anio, mes, quincena, page, limit } = req.query;
        if (!company_id) {
            return res.status(400).json({ message: 'company_id es requerido' });
        }
        const resultado = await rhPlanillaService.getPlanillasGrupos({
            companyId: company_id,
            anio,
            mes,
            quincena,
            page,
            limit
        });
        res.json(resultado);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar períodos de planillas');
    }
});

/**
 * 4. Obtener detalle de empleados y rubros de un período
 */
router.get('/planillas/detalle', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id, anio, mes, quincena, branch_ids, departamento_ids, search } = req.query;
        if (!company_id || !anio || !mes || !quincena) {
            return res.status(400).json({ message: 'Parámetros company_id, anio, mes y quincena requeridos' });
        }

        const parseList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.map(Number).filter(n => !isNaN(n) && n > 0);
            return String(val).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
        };

        const resultado = await rhPlanillaService.getPlanillaDetalle({
            companyId: company_id,
            anio,
            mes,
            quincena,
            branchIds: parseList(branch_ids),
            deptoIds: parseList(departamento_ids),
            search
        });
        res.json(resultado);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar detalle de planilla');
    }
});

/**
 * 5. Exportar formato de archivo bancario (CSV y/o TXT)
 */
router.get('/export/bancario', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id, anio, mes, quincena, branch_ids, departamento_ids, formato = 'ambos' } = req.query;
        if (!company_id || !anio || !mes || !quincena) {
            return res.status(400).json({ message: 'Parámetros company_id, anio, mes y quincena requeridos' });
        }

        const parseList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.map(Number).filter(n => !isNaN(n) && n > 0);
            return String(val).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
        };

        const data = await rhPlanillaService.exportBancario({
            companyId: company_id,
            anio,
            mes,
            quincena,
            branchIds: parseList(branch_ids),
            deptoIds: parseList(departamento_ids),
            formato
        });

        // Retornar JSON completo para procesamiento dinámico en el frontend
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al exportar formato bancario');
    }
});

/**
 * 6. Generar Planilla Oficial en PDF (Carta Horizontal)
 */
router.get('/export/pdf', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id, anio, mes, quincena, branch_ids, departamento_ids } = req.query;
        if (!company_id || !anio || !mes || !quincena) {
            return res.status(400).json({ message: 'Parámetros company_id, anio, mes y quincena requeridos' });
        }

        const parseList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.map(Number).filter(n => !isNaN(n) && n > 0);
            return String(val).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
        };

        const pdfBuffer = await rhPlanillaService.generatePlanillaReportePDF({
            companyId: company_id,
            anio,
            mes,
            quincena,
            branchIds: parseList(branch_ids),
            deptoIds: parseList(departamento_ids)
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Planilla_${anio}_${mes}_${quincena}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        sendSafeError(res, error, 'Error al generar PDF de planilla oficial');
    }
});

/**
 * 7. Generar Recibos Masivos en PDF (Carta Vertical)
 */
router.get('/export/recibos', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id, anio, mes, quincena, branch_ids, departamento_ids } = req.query;
        if (!company_id || !anio || !mes || !quincena) {
            return res.status(400).json({ message: 'Parámetros company_id, anio, mes y quincena requeridos' });
        }

        const parseList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.map(Number).filter(n => !isNaN(n) && n > 0);
            return String(val).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
        };

        const pdfBuffer = await rhPlanillaService.generateRecibosMasivosPDF({
            companyId: company_id,
            anio,
            mes,
            quincena,
            branchIds: parseList(branch_ids),
            deptoIds: parseList(departamento_ids)
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Recibos_Masivos_${anio}_${mes}_${quincena}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        sendSafeError(res, error, 'Error al generar recibos masivos');
    }
});

/**
 * 8. Generar Recibo Individual de Empleado en PDF
 */
router.get('/export/recibo/:id', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { id } = req.params;
        const { company_id } = req.query;
        if (!company_id) {
            return res.status(400).json({ message: 'company_id es requerido' });
        }

        const pdfBuffer = await rhPlanillaService.generateReciboIndividualPDF({
            companyId: company_id,
            planillaId: id
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Recibo_Planilla_${id}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        sendSafeError(res, error, 'Error al generar recibo individual');
    }
});

/**
 * 9. Obtener catálogo de cuentas bancarias y formas de pago disponibles
 */
router.get('/cuentas-bancarias', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id } = req.query;
        const resultado = await rhPlanillaService.getCuentasBancariasParaPago(company_id);
        res.json(resultado);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar cuentas bancarias');
    }
});

/**
 * 10. Consultar formas de pago registradas para un período de planilla
 */
router.get('/planillas/pagos', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id, anio, mes, quincena } = req.query;
        if (!company_id || !anio || !mes || !quincena) {
            return res.status(400).json({ message: 'Parámetros company_id, anio, mes y quincena requeridos' });
        }

        const pagos = await rhPlanillaService.getPagosPlanilla({
            companyId: company_id,
            anio: parseInt(anio, 10),
            mes: parseInt(mes, 10),
            quincena
        });
        res.json(pagos);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar pagos de la planilla');
    }
});

/**
 * 11. Registrar formas de pago de planilla y generar movimientos bancarios (conciliables)
 */
router.post('/planillas/pagar', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { company_id, anio, mes, quincena, pagos } = req.body;
        if (!company_id || !anio || !mes || !quincena || !Array.isArray(pagos) || pagos.length === 0) {
            return res.status(400).json({ message: 'Parámetros requeridos incompletos o lista de pagos vacía' });
        }

        const resultado = await rhPlanillaService.registrarPagoPlanilla({
            companyId: company_id,
            anio: parseInt(anio, 10),
            mes: parseInt(mes, 10),
            quincena,
            pagos,
            userId: req.user?.id,
            io: req.io
        });

        res.status(201).json(resultado);
    } catch (error) {
        sendSafeError(res, error, error.message || 'Error al registrar el pago de la planilla');
    }
});

/**
 * 12. Anular un pago de planilla registrado y revertir movimiento bancario
 */
router.delete('/planillas/pagos/:id', authenticateToken, requirePermission(PERMISSION_REQUIRED), async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await rhPlanillaService.anularPagoPlanilla({
            pagoId: id,
            userId: req.user?.id,
            io: req.io
        });

        res.json(resultado);
    } catch (error) {
        sendSafeError(res, error, error.message || 'Error al anular el pago de la planilla');
    }
});

module.exports = router;
