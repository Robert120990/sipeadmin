const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas } = require('../services/fuelIntelligence');
const { getFlujoCajaProyectado } = require('../services/cashflowForecast');
const { getRentabilidadPorEstacion } = require('../services/profitabilityService');
const { getRiesgoCreditoFlotas, getDetalleDtesCliente } = require('../services/creditRiskService');
const { getFlashEjecutivo, enviarFlashPorEmail } = require('../services/executiveFlashService');

// 1. Flash Ejecutivo para Dueños
router.get('/flash-ejecutivo', authenticateToken, async (req, res) => {
    try {
        const data = await getFlashEjecutivo();
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al generar el flash ejecutivo');
    }
});

// Enviar Flash por Email a socios
router.post('/enviar-flash-email', authenticateToken, async (req, res) => {
    const { destinatario } = req.body;
    try {
        const resultado = await enviarFlashPorEmail(destinatario);
        res.json({ message: `Flash ejecutivo enviado exitosamente a ${resultado.email}`, resultado });
    } catch (error) {
        sendSafeError(res, error, 'Error al enviar el flash ejecutivo por correo');
    }
});

// 2. Autonomía de Tanques (Horas Restantes y Quiebre de Stock)
router.get('/tanques-autonomia', authenticateToken, async (req, res) => {
    try {
        const data = await getTanquesAutonomia();
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar autonomía de tanques');
    }
});

// 3. Simulador de Compra Pre-DGEHM
router.post('/simulador-dgehm', authenticateToken, async (req, res) => {
    const { variaciones } = req.body;
    try {
        const data = await calcularSimuladorDGEHM({ variaciones });
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al ejecutar simulador DGEHM');
    }
});

// 4. Flujo de Caja Predictivo a 30 / 60 Días
router.get('/flujo-caja-proyectado', authenticateToken, async (req, res) => {
    const { dias = 30 } = req.query;
    try {
        const data = await getFlujoCajaProyectado(parseInt(dias, 10));
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al calcular proyección de flujo de caja');
    }
});

// 5. Auditoría de Mermas y Descalibración de Pistolas
router.get('/mermas-auditoria', authenticateToken, async (req, res) => {
    const { desde, hasta } = req.query;
    try {
        const data = await getAuditoriaMermas(desde, hasta);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al auditar mermas de combustible');
    }
});

// 6. Rentabilidad Operativa y P&L por Estación
router.get('/rentabilidad-estaciones', authenticateToken, async (req, res) => {
    const { desde, hasta } = req.query;
    try {
        const data = await getRentabilidadPorEstacion(desde, hasta);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al calcular rentabilidad por estación');
    }
});

// 7. Riesgo de Crédito y Flotas
router.get('/credito-flotas', authenticateToken, async (req, res) => {
    try {
        const data = await getRiesgoCreditoFlotas();
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar riesgo crediticio');
    }
});

// 8. Detalle de DTEs, Estado de Pago y Abonos por Cliente
router.get('/credito-flotas/:customerId/dtes', authenticateToken, async (req, res) => {
    const { customerId } = req.params;
    try {
        const data = await getDetalleDtesCliente(customerId);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar DTEs y abonos del cliente');
    }
});

module.exports = router;
