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

        // Si se solicita descarga directa de archivo específico
        if (formato === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${data.fileNameBase}.csv"`);
            return res.send(data.csv);
        }
        if (formato === 'txt') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${data.fileNameBase}.txt"`);
            return res.send(data.txt);
        }

        // Si es formato ambos o solicitud ajax, retornar JSON con ambos contenidos
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

module.exports = router;
