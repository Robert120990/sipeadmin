const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas } = require('../services/fuelIntelligence');
const { getFlujoCajaProyectado } = require('../services/cashflowForecast');
const { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia } = require('../services/profitabilityService');
const { getRiesgoCreditoFlotas, getDetalleDtesCliente } = require('../services/creditRiskService');
const { getFlashEjecutivo, enviarFlashPorEmail } = require('../services/executiveFlashService');
const {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
} = require('../services/operationalAuditService');
const { generateExecutiveReportPdf } = require('../services/telegramPdfService');
const {
    auditStationCloseoutsAndRemesas,
    runStationDiscrepancyAlertCheck
} = require('../services/stationDiscrepancyAuditService');

// 0. Resumen Inteligente por Rol para Inicio (/dashboard)
router.get('/home-resumen', authenticateToken, async (req, res) => {
    try {
        const data = await getHomeResumenInteligente(req.user);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar el resumen inteligente de inicio');
    }
});

// 1. Flash Ejecutivo para Dueños
router.get('/flash-ejecutivo', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/torre-control']), async (req, res) => {
    try {
        const data = await getFlashEjecutivo();
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al generar el flash ejecutivo');
    }
});

// Enviar Flash por Email a socios
router.post('/enviar-flash-email', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/torre-control']), async (req, res) => {
    const { destinatario } = req.body;
    try {
        const resultado = await enviarFlashPorEmail(destinatario);
        res.json({ message: `Flash ejecutivo enviado exitosamente a ${resultado.email}`, resultado });
    } catch (error) {
        sendSafeError(res, error, 'Error al enviar el flash ejecutivo por correo');
    }
});

// 2. Autonomía de Tanques (Horas Restantes y Quiebre de Stock + Cruce Pedidos Puma)
router.get('/tanques-autonomia', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/combustible']), async (req, res) => {
    try {
        const data = await getTanquesAutonomia();
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar autonomía de tanques');
    }
});

// 3. Simulador de Compra Pre-DGEHM
router.post('/simulador-dgehm', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/combustible']), async (req, res) => {
    const { variaciones } = req.body;
    try {
        const data = await calcularSimuladorDGEHM({ variaciones });
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al ejecutar simulador DGEHM');
    }
});

// 4. Flujo de Caja Predictivo a 30 / 60 Días
router.get('/flujo-caja-proyectado', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/flujo-caja']), async (req, res) => {
    const { dias = 30 } = req.query;
    try {
        const data = await getFlujoCajaProyectado(parseInt(dias, 10));
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al calcular proyección de flujo de caja');
    }
});

// 5. Auditoría de Mermas, Rachas de Micro-Merma y Descalibración de Pistolas
router.get('/mermas-auditoria', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/mermas']), async (req, res) => {
    const { desde, hasta } = req.query;
    try {
        const data = await getAuditoriaMermas(desde, hasta);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al auditar mermas de combustible');
    }
});

// 5B. Auditoría Cruzada de Efectivo/POS en Tránsito (>48h) y Vales Pendientes (>72h)
router.get(
    '/auditoria-transito',
    authenticateToken,
    requirePermission([
        'view_direccion_estrategica',
        '/dashboard/estrategia/mermas',
        '/dashboard/bancos/conciliacion',
        '/dashboard/estrategia/torre-control'
    ]),
    async (req, res) => {
        const { dias = 14 } = req.query;
        try {
            const data = await getAuditoriaDineroEnTransito({ dias: parseInt(dias, 10) || 14 });
            res.json(data);
        } catch (error) {
            sendSafeError(res, error, 'Error al auditar efectivo en tránsito y vales pendientes');
        }
    }
);

// 6. Rentabilidad Operativa (EBITDA Real) y P&L por Estación
router.get('/rentabilidad-estaciones', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/rentabilidad']), async (req, res) => {
    const { desde, hasta } = req.query;
    const rawExcluir = req.query.excluirImpuestos ?? req.query.excluir_impuestos ?? '';
    const excluirImpuestos = ['1', 'true', 'si', 'yes'].includes(String(rawExcluir).trim().toLowerCase());
    try {
        const data = await getRentabilidadPorEstacion(desde, hasta, { excluirImpuestos });
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al calcular rentabilidad por estación');
    }
});

// 6B. Elasticidad de Precios DGEHM vs. Volumen de Galones por Estación
router.get(
    '/elasticidad-precios',
    authenticateToken,
    requirePermission([
        'view_direccion_estrategica',
        '/dashboard/estrategia/rentabilidad',
        '/dashboard/estrategia/combustible',
        '/dashboard/consultas/estaciones/precios-competencia'
    ]),
    async (req, res) => {
        const { dias = 30 } = req.query;
        try {
            const data = await getElasticidadPreciosCompetencia(parseInt(dias, 10) || 30);
            res.json(data);
        } catch (error) {
            sendSafeError(res, error, 'Error al analizar elasticidad de precios frente a competencia');
        }
    }
);

// 7. Riesgo de Crédito y Flotas
router.get('/credito-flotas', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/creditos']), async (req, res) => {
    try {
        const data = await getRiesgoCreditoFlotas();
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar riesgo crediticio');
    }
});

// 8. Detalle de DTEs, Estado de Pago y Abonos por Cliente
router.get('/credito-flotas/:customerId/dtes', authenticateToken, requirePermission(['view_direccion_estrategica', '/dashboard/estrategia/creditos']), async (req, res) => {
    const { customerId } = req.params;
    const customerIdNum = parseInt(customerId, 10);
    if (!customerId || isNaN(customerIdNum) || customerIdNum <= 0) {
        return res.status(400).json({ message: 'Identificador de cliente no válido.' });
    }
    try {
        const data = await getDetalleDtesCliente(customerIdNum);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar DTEs y abonos del cliente');
    }
});

// 9. Dossier Ejecutivo Semanal en PDF Tamaño Carta (para ReportPreviewModal)
router.get(
    '/dossier-ejecutivo-pdf',
    authenticateToken,
    requirePermission([
        'view_direccion_estrategica',
        '/dashboard/estrategia/torre-control',
        '/dashboard/estrategia/rentabilidad',
        '/dashboard/configuracion/agentes-ia'
    ]),
    async (req, res) => {
        try {
            const payload = await buildWeeklyExecutiveDossierPayload();
            const pdfBuffer = await generateExecutiveReportPdf(payload);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${payload.fileName || 'Dossier_Ejecutivo_SIPE.pdf'}"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);
        } catch (error) {
            sendSafeError(res, error, 'Error al generar el Dossier Ejecutivo Semanal en PDF');
        }
    }
);

// 10. Auditoría Cruzada de Cortes (Pista y Tienda) ↔ Remesas Enviadas ↔ Bancos
router.get(
    '/auditoria-cortes-remesas',
    authenticateToken,
    requirePermission([
        'view_direccion_estrategica',
        '/dashboard/estrategia/torre-control',
        '/dashboard/consultas/estaciones/resumen-cierre',
        '/dashboard/consultas/estaciones/diferencias-combustible',
        '/dashboard/consultas/estaciones/ventas'
    ]),
    async (req, res) => {
        const { dias = 7, closeoutDays = null, targetDate = null } = req.query;
        try {
            const data = await auditStationCloseoutsAndRemesas({
                dias: parseInt(dias, 10) || 7,
                closeoutDays: closeoutDays ? parseInt(closeoutDays, 10) : null,
                targetDate: targetDate ? String(targetDate).slice(0, 10) : null
            });
            res.json(data);
        } catch (error) {
            sendSafeError(res, error, 'Error al ejecutar auditoría de cortes y remesas');
        }
    }
);

// 10B. Disparar notificación proactiva deduplicada (Telegram + in-app) de diferencias en cortes/envíos
router.post(
    '/auditoria-cortes-remesas/notificar',
    authenticateToken,
    requirePermission([
        'view_direccion_estrategica',
        '/dashboard/estrategia/torre-control',
        '/dashboard/consultas/estaciones/diferencias-combustible'
    ]),
    async (req, res) => {
        const { dias = 7, closeoutDays = 3, targetDate = null } = req.body || {};
        try {
            const result = await runStationDiscrepancyAlertCheck({
                io: req.app?.get('io') || null,
                dias: parseInt(dias, 10) || 7,
                closeoutDays: parseInt(closeoutDays, 10) || 3,
                targetDate: targetDate ? String(targetDate).slice(0, 10) : null
            });
            res.json(result);
        } catch (error) {
            sendSafeError(res, error, 'Error al notificar diferencias de cortes y remesas');
        }
    }
);

module.exports = router;
