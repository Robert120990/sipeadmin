const express = require('express');
const router = express.Router();
const { authenticateToken, isAdminUser } = require('../middleware/auth');
const ticketService = require('../services/ticketService');

const canManageTickets = (user) => {
    if (!user) return false;
    if (isAdminUser(user)) return true;
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    return perms.includes('manage_support_tickets');
};

const getActorName = (user) => {
    if (!user) return 'Usuario';
    return user.nombre || user.name || user.username || `Usuario #${user.id}`;
};

// GET /api/tickets/stats
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const canManage = canManageTickets(req.user) && req.query.mine !== 'true';
        const stats = await ticketService.getTicketStats({
            userId: req.user.id,
            userName: req.user.nombre || req.user.name,
            username: req.user.username,
            canManage
        });
        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('Error getting ticket stats:', err);
        res.status(500).json({ message: 'Error al obtener estadísticas de tickets' });
    }
});

// GET /api/tickets/pending-resolved
router.get('/pending-resolved', authenticateToken, async (req, res) => {
    try {
        // Sincronizar cambios externos de sys.sipesv.com en segundo plano
        ticketService.syncRealtimeTicketUpdates(req.io);
        const list = await ticketService.getPendingResolvedForUser(
            req.user.id,
            req.user.nombre || req.user.name,
            req.user.username
        );
        res.json({ success: true, data: list });
    } catch (err) {
        console.error('Error getting pending resolved tickets:', err);
        res.status(500).json({ message: 'Error al consultar tickets resueltos pendientes' });
    }
});

// GET /api/tickets/ai-bundle
router.get('/ai-bundle', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes para empaquetar tickets IA' });
        }
        const idsParam = req.query.ids ? String(req.query.ids).split(',').map(Number).filter(Boolean) : null;
        const tickets = await ticketService.getAiBundleTickets({ ticketIds: idsParam });
        const bundle = await ticketService.saveAndGenerateAiBundle({
            items: [],
            aiMode: req.query.ai_mode || 'agent_prompt',
            agentPlatform: req.query.agent_platform || 'antigravity'
        });
        res.json({
            success: true,
            data: tickets,
            promptMarkdown: bundle.promptMarkdown
        });
    } catch (err) {
        console.error('Error getting AI bundle:', err);
        res.status(500).json({ message: 'Error al obtener paquete IA de tickets' });
    }
});

// POST /api/tickets/ai-bundle/generate
router.post('/ai-bundle/generate', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const result = await ticketService.saveAndGenerateAiBundle({
            items: req.body?.items || [],
            extraContext: req.body?.extraContext || '',
            aiMode: req.body?.ai_mode || 'agent_prompt',
            agentPlatform: req.body?.agent_platform || 'antigravity'
        });
        res.json({
            success: true,
            data: result.tickets,
            promptMarkdown: result.promptMarkdown,
            count: result.count,
            message: `Paquete de ${result.count} ticket(s) listo para IA`
        });
    } catch (err) {
        console.error('Error generating AI bundle:', err);
        res.status(500).json({ message: 'Error al generar paquete IA' });
    }
});

// POST /api/tickets/ai-bundle/auto-triage
router.post('/ai-bundle/auto-triage', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const result = await ticketService.autoTriageTicketsForAi();
        res.json({
            success: true,
            data: result,
            message: `Auto-Triaje completado (${result.count} tickets preparados para IA)`
        });
    } catch (err) {
        console.error('Error in auto-triage:', err);
        res.status(500).json({ message: 'Error al ejecutar auto-triaje IA' });
    }
});

// POST /api/tickets/ai-bundle/resolve-batch
router.post('/ai-bundle/resolve-batch', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const resolved = await ticketService.resolveAiBundleBatch({
            ticketIds: req.body?.ticketIds || [],
            resolutionNotes: req.body?.resolution_notes || '',
            resolvedVersion: req.body?.resolved_version || null,
            actorId: req.user.id,
            actorName: getActorName(req.user),
            io: req.io
        });
        res.json({
            success: true,
            data: resolved,
            message: `${resolved.length} ticket(s) marcados como resueltos y notificados en tiempo real.`
        });
    } catch (err) {
        console.error('Error resolving batch:', err);
        res.status(500).json({ message: 'Error al resolver lote de tickets' });
    }
});

// GET /api/tickets/agy-settings
router.get('/agy-settings', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const cfg = await ticketService.getAgySettings();
        res.json({ success: true, data: cfg });
    } catch (err) {
        res.status(500).json({ message: 'Error al obtener configuración AGY' });
    }
});

// PUT /api/tickets/agy-settings
router.put('/agy-settings', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const cfg = await ticketService.saveAgySettings(req.body || {});
        res.json({ success: true, data: cfg, message: 'Configuración de Consola AGY guardada' });
    } catch (err) {
        res.status(500).json({ message: 'Error al guardar configuración AGY' });
    }
});

// GET /api/tickets
router.get('/', authenticateToken, async (req, res) => {
    try {
        const canManage = canManageTickets(req.user);
        const mineOnly = req.query.mine === 'true' || !canManage;
        const result = await ticketService.getTickets({
            userId: req.user.id,
            userName: req.user.nombre || req.user.name,
            username: req.user.username,
            canManage,
            mineOnly,
            status: req.query.status || null,
            type: req.query.type || null,
            priority: req.query.priority || null,
            search: req.query.search || '',
            page: req.query.page || 1,
            limit: req.query.limit || 20
        });
        res.json({
            success: true,
            data: result.items,
            pagination: result.pagination
        });
    } catch (err) {
        console.error('Error listing tickets:', err);
        res.status(500).json({ message: 'Error al consultar listado de tickets' });
    }
});

// POST /api/tickets
router.post('/', authenticateToken, async (req, res) => {
    try {
        const {
            subject,
            description,
            type = 'problema',
            priority = 'media',
            module_name,
            page_url,
            screenshot_base64,
            attachments,
            diagnostics,
            company_id
        } = req.body || {};

        if (!subject || !String(subject).trim() || !description || !String(description).trim()) {
            return res.status(400).json({ message: 'El asunto y la descripción del ticket son obligatorios.' });
        }

        const ticket = await ticketService.createTicket({
            companyId: company_id || null,
            userId: req.user.id,
            adminUserId: req.user.id,
            userName: getActorName(req.user),
            userRole: req.user.role || req.user.role_name || (req.user.role_id === 1 ? 'admin' : 'user'),
            type,
            priority,
            subject: String(subject).trim(),
            description: String(description).trim(),
            moduleName: module_name || null,
            pageUrl: page_url || null,
            screenshotBase64: screenshot_base64 || null,
            attachments: attachments || null,
            diagnostics: diagnostics || null,
            io: req.io
        });

        res.status(201).json({
            success: true,
            data: ticket,
            ticket,
            message: `Ticket ${ticket.ticket_code} creado y sincronizado con sys.sipesv.com`
        });
    } catch (err) {
        console.error('Error creating ticket:', err);
        res.status(500).json({ message: err.message || 'Error al crear el ticket de soporte' });
    }
});

// PUT /api/tickets/:id/acknowledge
router.put('/:id/acknowledge', authenticateToken, async (req, res) => {
    try {
        await ticketService.acknowledgeResolution(
            req.params.id,
            req.user.id,
            req.user.nombre || req.user.name,
            req.user.username
        );
        res.json({ success: true, message: 'Notificación de resolución confirmada' });
    } catch (err) {
        console.error('Error acknowledging ticket:', err);
        res.status(500).json({ message: 'Error al confirmar lectura de ticket resuelto' });
    }
});

// GET /api/tickets/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const ticket = await ticketService.getTicketById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket no encontrado' });
        }
        const canManage = canManageTickets(req.user);
        const actorName = String(getActorName(req.user)).toLowerCase();
        const username = String(req.user.username || '').toLowerCase();
        const isOwner =
            Number(ticket.admin_user_id) === Number(req.user.id) ||
            Number(ticket.user_id) === Number(req.user.id) ||
            String(ticket.user_name || '').toLowerCase() === actorName ||
            (username && String(ticket.user_name || '').toLowerCase() === username);

        if (!canManage && !isOwner) {
            return res.status(403).json({ message: 'No tiene permisos para ver este ticket' });
        }
        res.json({ success: true, data: ticket });
    } catch (err) {
        console.error('Error getting ticket detail:', err);
        res.status(500).json({ message: 'Error al obtener detalle del ticket' });
    }
});

// PUT /api/tickets/:id/status
router.put('/:id/status', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Solo el equipo de soporte o administradores pueden cambiar el estado.' });
        }
        const { status, resolution_notes, resolved_version } = req.body || {};
        if (!status) {
            return res.status(400).json({ message: 'El estado es obligatorio' });
        }
        const updated = await ticketService.updateTicketStatus(req.params.id, {
            status,
            resolutionNotes: resolution_notes !== undefined ? resolution_notes : null,
            resolvedVersion: resolved_version !== undefined ? resolved_version : null,
            actorId: req.user.id,
            actorName: getActorName(req.user),
            source: 'web',
            io: req.io
        });
        if (!updated) {
            return res.status(404).json({ message: 'Ticket no encontrado' });
        }
        res.json({
            success: true,
            data: updated,
            ticket: updated,
            message: `Estado actualizado a ${status}`
        });
    } catch (err) {
        console.error('Error updating ticket status:', err);
        res.status(500).json({ message: 'Error al actualizar el estado del ticket' });
    }
});

// PUT /api/tickets/:id/ai-review
router.put('/:id/ai-review', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const updated = await ticketService.updateTicketAiReview(req.params.id, {
            includeInAiPrompt: req.body?.include_in_ai_prompt,
            aiNotes: req.body?.ai_notes,
            customLogs: req.body?.custom_logs,
            aiMode: req.body?.ai_mode,
            agentPlatform: req.body?.agent_platform
        });
        if (!updated) {
            return res.status(404).json({ message: 'Ticket no encontrado' });
        }
        res.json({ success: true, data: updated, ticket: updated });
    } catch (err) {
        console.error('Error updating AI review:', err);
        res.status(500).json({ message: 'Error al actualizar revisión IA del ticket' });
    }
});

// POST /api/tickets/:id/messages
router.post('/:id/messages', authenticateToken, async (req, res) => {
    try {
        const { message, attachment_base64 } = req.body || {};
        if ((!message || !String(message).trim()) && !attachment_base64) {
            return res.status(400).json({ message: 'El mensaje o adjunto es obligatorio' });
        }
        const canManage = canManageTickets(req.user);
        const updated = await ticketService.addTicketMessage(req.params.id, {
            senderUserId: req.user.id,
            senderName: getActorName(req.user),
            senderRole: canManage ? 'tech' : 'user',
            source: 'web',
            message: String(message || 'Adjunto captura en seguimiento').trim(),
            attachmentBase64: attachment_base64 || null,
            io: req.io
        });
        if (!updated) {
            return res.status(404).json({ message: 'Ticket no encontrado' });
        }
        res.status(201).json({ success: true, data: updated, ticket: updated });
    } catch (err) {
        console.error('Error adding ticket message:', err);
        res.status(500).json({ message: 'Error al agregar comentario al ticket' });
    }
});

// POST /api/tickets/:id/agy/plan
router.post('/:id/agy/plan', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const updated = await ticketService.approveAndGeneratePlan(req.params.id, {
            model: req.body?.model || 'gemini-4-argon-high',
            aiNotes: req.body?.ai_notes || '',
            feedbackComment: req.body?.feedback_comment || '',
            actorName: getActorName(req.user),
            io: req.io
        });
        res.json({ success: true, data: updated, message: 'Planificación AGY generada y lista para revisión' });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Error al generar plan AGY' });
    }
});

// POST /api/tickets/:id/agy/execute
router.post('/:id/agy/execute', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const updated = await ticketService.executeApprovedPlan(req.params.id, {
            actorName: getActorName(req.user),
            io: req.io
        });
        res.json({ success: true, data: updated, message: 'Plan AGY enviado a ejecución' });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Error al ejecutar plan AGY' });
    }
});

// POST /api/tickets/:id/agy/reject
router.post('/:id/agy/reject', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const updated = await ticketService.rejectPlan(req.params.id, {
            reason: req.body?.reason || 'Denegado por administrador',
            actorName: getActorName(req.user),
            io: req.io
        });
        res.json({ success: true, data: updated, message: 'Plan AGY denegado' });
    } catch (err) {
        res.status(500).json({ message: err.message || 'Error al denegar plan AGY' });
    }
});

// POST /api/tickets/:id/agy/resend-telegram
router.post('/:id/agy/resend-telegram', authenticateToken, async (req, res) => {
    try {
        if (!canManageTickets(req.user)) {
            return res.status(403).json({ message: 'Permisos insuficientes' });
        }
        const ticket = await ticketService.getTicketById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
        await ticketService.approveAndGeneratePlan(req.params.id, {
            model: ticket.agy_model || 'gemini-4-argon-high',
            aiNotes: ticket.ai_notes || '',
            actorName: getActorName(req.user),
            io: req.io
        });
        res.json({ success: true, message: 'Plan reenviado a Telegram con botones de reacción' });
    } catch (err) {
        res.status(500).json({ message: 'Error al reenviar plan a Telegram' });
    }
});

module.exports = router;
