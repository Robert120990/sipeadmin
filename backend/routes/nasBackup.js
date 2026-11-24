const express = require('express');
const fs = require('fs');
const router = express.Router();
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const nasService = require('../services/nasBackupService');

const NAS_PERMS = ['manage_nas_backups', '/dashboard/seguridad/nas'];
const guardNas = [authenticateToken, requirePermission(NAS_PERMS)];

function resolvePublicBaseUrl(req) {
    if (process.env.PUBLIC_APP_URL) {
        return process.env.PUBLIC_APP_URL.replace(/\/+$/, '');
    }
    const rawHost = String(req.get('x-forwarded-host') || req.get('host') || '').trim();
    if (rawHost && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(rawHost)) {
        const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
        return `${proto}://${rawHost}`;
    }
    return 'https://admin.sipesv.com';
}

async function authenticateAgentRequest(req, res, next) {
    try {
        const rawToken =
            req.headers['x-nas-token'] ||
            (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : '');
        const nas = await nasService.authenticateNasAgentToken(rawToken);
        if (!nas) {
            return res.status(401).json({ message: 'Token de agente NAS inválido o servidor desactivado.' });
        }
        req.nasAgent = nas;
        return next();
    } catch (err) {
        return sendSafeError(res, err, 'Error al autenticar agente NAS', 500);
    }
}

// ── Panel de Control NAS (Rutas protegidas de Seguridad) ─────────────────────

router.get('/overview', ...guardNas, async (req, res) => {
    try {
        const data = await nasService.getOverview();
        return res.json(data);
    } catch (err) {
        return sendSafeError(res, err, 'Error al cargar panel de control NAS');
    }
});

router.get('/databases', ...guardNas, async (req, res) => {
    try {
        const data = await nasService.discoverSourceDatabases();
        return res.json(data);
    } catch (err) {
        return sendSafeError(res, err, 'Error al descubrir bases de datos del servidor origen');
    }
});

router.post('/servers', ...guardNas, async (req, res) => {
    try {
        const created = await nasService.createNasServer(req.body || {}, req.user?.id || null);
        return res.status(201).json({
            message: `Servidor NAS "${created.nombre}" agregado correctamente.`,
            server: created
        });
    } catch (err) {
        const status = err.status || (err.message ? 400 : 500);
        return sendSafeError(res, err, err.message || 'Error al agregar servidor NAS', status);
    }
});

router.put('/servers/:id', ...guardNas, async (req, res) => {
    try {
        const updated = await nasService.updateNasServer(req.params.id, req.body || {});
        return res.json({
            message: `Configuración del NAS "${updated.nombre}" actualizada correctamente.`,
            server: updated
        });
    } catch (err) {
        const status = err.status || (err.message ? 400 : 500);
        return sendSafeError(res, err, err.message || 'Error al actualizar servidor NAS', status);
    }
});

router.delete('/servers/:id', ...guardNas, async (req, res) => {
    try {
        const result = await nasService.deleteNasServer(req.params.id);
        return res.json({
            message: `Servidor NAS "${result.nombre}" eliminado correctamente.`,
            ...result
        });
    } catch (err) {
        return sendSafeError(res, err, err.message || 'Error al eliminar servidor NAS', err.status || 500);
    }
});

router.post('/servers/:id/test', ...guardNas, async (req, res) => {
    try {
        const result = await nasService.testNasConnection(req.params.id);
        return res.json(result);
    } catch (err) {
        return sendSafeError(res, err, err.message || 'Error al probar conexión con el NAS', err.status || 500);
    }
});

router.post('/servers/:id/backup-now', ...guardNas, async (req, res) => {
    try {
        const actor = req.user?.nombre || req.user?.username || 'Administrador';
        const result = await nasService.runBackupToNas(req.params.id, {
            tipoEjecucion: 'manual',
            actor
        });
        return res.json(result);
    } catch (err) {
        return sendSafeError(res, err, err.message || 'Error al ejecutar respaldo hacia el NAS', err.status || 500);
    }
});

router.post('/servers/:id/rotate-token', ...guardNas, async (req, res) => {
    try {
        const result = await nasService.rotateNasAgentToken(req.params.id);
        return res.json({
            message: 'Token del agente Synology rotado correctamente. Actualice el script en su NAS.',
            ...result
        });
    } catch (err) {
        return sendSafeError(res, err, err.message || 'Error al rotar token del agente NAS', err.status || 500);
    }
});

router.get('/servers/:id/synology-script', ...guardNas, async (req, res) => {
    try {
        const publicBaseUrl = resolvePublicBaseUrl(req);
        const pkg = await nasService.getSynologySetupPackage(req.params.id, publicBaseUrl);
        if (req.query.download === '1') {
            res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${pkg.scriptFileName}"`);
            return res.send(pkg.script);
        }
        return res.json(pkg);
    } catch (err) {
        return sendSafeError(res, err, err.message || 'Error al generar script para Synology DSM', err.status || 500);
    }
});

router.get('/servers/:id/files', ...guardNas, async (req, res) => {
    try {
        const result = await nasService.listNasRemoteFiles(req.params.id);
        return res.json(result);
    } catch (err) {
        return sendSafeError(res, err, err.message || 'Error al consultar archivos en el NAS', err.status || 400);
    }
});

router.get('/logs', ...guardNas, async (req, res) => {
    try {
        const logs = await nasService.listBackupLogs({
            nasId: req.query.nas_id || null,
            estado: req.query.estado || null,
            limit: req.query.limit || 50
        });
        return res.json(logs);
    } catch (err) {
        return sendSafeError(res, err, 'Error al consultar historial de respaldos NAS');
    }
});

router.get('/download-db/:dbName', ...guardNas, async (req, res) => {
    const dbName = String(req.params.dbName || '').trim();
    if (!nasService.validateSafeDatabaseName(dbName)) {
        return res.status(400).json({ message: 'Nombre de base de datos inválido o restringido.' });
    }

    let dumpInfo = null;
    try {
        const discovery = await nasService.discoverSourceDatabases();
        const exists = discovery.databases.some((d) => d.name === dbName);
        if (!exists) {
            return res.status(404).json({ message: `La base de datos "${dbName}" no existe en el servidor origen.` });
        }

        dumpInfo = await nasService.dumpDatabaseToTempGzip(dbName);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${dumpInfo.fileName}"`);
        res.setHeader('Content-Length', String(dumpInfo.sizeBytes));
        res.setHeader('X-Backup-SHA256', dumpInfo.sha256);
        res.setHeader('X-Backup-Database', dbName);

        const stream = fs.createReadStream(dumpInfo.localPath);
        const cleanup = () => {
            if (dumpInfo?.localPath) {
                try { fs.unlinkSync(dumpInfo.localPath); } catch (_) { /* ignore */ }
            }
        };
        res.on('finish', cleanup);
        res.on('close', cleanup);
        stream.on('error', () => {
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error al transmitir archivo de respaldo.' });
            }
        });
        return stream.pipe(res);
    } catch (err) {
        if (dumpInfo?.localPath) {
            try { fs.unlinkSync(dumpInfo.localPath); } catch (_) { /* ignore */ }
        }
        return sendSafeError(res, err, `Error al generar descarga de respaldo para ${dbName}`);
    }
});

router.get('/reporte-pdf', ...guardNas, async (req, res) => {
    try {
        const pdfBuffer = await nasService.generateNasAuditPdfBuffer();
        const today = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Auditoria_NAS_Backups_${today}.pdf"`);
        return res.send(pdfBuffer);
    } catch (err) {
        return sendSafeError(res, err, 'Error al generar reporte PDF de auditoría NAS');
    }
});

// ── Endpoints del Agente Pull Synology (autenticados por X-NAS-Token) ────────

router.get('/agent/manifest', authenticateAgentRequest, async (req, res) => {
    try {
        const databases = await nasService.resolveTargetDatabasesForNas(req.nasAgent);
        return res.json({
            nasId: req.nasAgent.id,
            nombre: req.nasAgent.nombre,
            servidorOrigen: req.nasAgent.servidor_origen_ip || '5.252.55.29',
            rutaDestino: req.nasAgent.ruta_destino,
            retencionDias: Number(req.nasAgent.retencion_dias || 30),
            databases
        });
    } catch (err) {
        return sendSafeError(res, err, 'Error al generar manifiesto de respaldo NAS');
    }
});

router.get('/agent/dump/:dbName', authenticateAgentRequest, async (req, res) => {
    const dbName = String(req.params.dbName || '').trim();
    if (!nasService.validateSafeDatabaseName(dbName)) {
        return res.status(400).json({ message: 'Nombre de base de datos no permitido.' });
    }

    let dumpInfo = null;
    try {
        const allowedDatabases = await nasService.resolveTargetDatabasesForNas(req.nasAgent);
        if (!allowedDatabases.includes(dbName)) {
            return res.status(403).json({ message: `La base de datos "${dbName}" no está autorizada para este NAS.` });
        }

        dumpInfo = await nasService.dumpDatabaseToTempGzip(dbName);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${dumpInfo.fileName}"`);
        res.setHeader('Content-Length', String(dumpInfo.sizeBytes));
        res.setHeader('X-Backup-SHA256', dumpInfo.sha256);
        res.setHeader('X-Backup-Filename', dumpInfo.fileName);
        res.setHeader('X-Backup-Database', dbName);

        const stream = fs.createReadStream(dumpInfo.localPath);
        const cleanup = () => {
            if (dumpInfo?.localPath) {
                try { fs.unlinkSync(dumpInfo.localPath); } catch (_) { /* ignore */ }
            }
        };
        res.on('finish', cleanup);
        res.on('close', cleanup);
        stream.on('error', () => {
            cleanup();
            if (!res.headersSent) {
                res.status(500).json({ message: 'Error transmitiendo volcado al Synology NAS.' });
            }
        });
        return stream.pipe(res);
    } catch (err) {
        if (dumpInfo?.localPath) {
            try { fs.unlinkSync(dumpInfo.localPath); } catch (_) { /* ignore */ }
        }
        return sendSafeError(res, err, `Error generando volcado SQL de ${dbName}`);
    }
});

router.post('/agent/report', authenticateAgentRequest, async (req, res) => {
    try {
        const result = await nasService.recordAgentReport(req.nasAgent, req.body || {});
        return res.json(result);
    } catch (err) {
        return sendSafeError(res, err, 'Error al registrar reporte del agente Synology NAS');
    }
});

router.post('/agent/heartbeat', authenticateAgentRequest, async (req, res) => {
    try {
        const result = await nasService.recordAgentHeartbeat(req.nasAgent, req.body || {});
        return res.json(result);
    } catch (err) {
        return sendSafeError(res, err, 'Error al registrar heartbeat del agente Synology NAS');
    }
});

module.exports = router;
