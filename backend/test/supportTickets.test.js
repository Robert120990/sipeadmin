const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { saveBase64Screenshot, UPLOADS_DIR } = require('../services/ticketService');

/**
 * Helper to validate ticket ownership / visibility rules for admin.sipesv.com users
 */
function isTicketOwnedByAdminUser(ticket, user) {
    if (!ticket || !user) return false;
    const uid = Number(user.id || 0);
    if (uid && (Number(ticket.admin_user_id) === uid || Number(ticket.user_id) === uid)) {
        return true;
    }
    const uName = String(user.nombre || user.username || '').trim().toLowerCase();
    const tName = String(ticket.user_name || '').trim().toLowerCase();
    if (uName && tName && uName === tName) {
        return true;
    }
    const uEmail = String(user.email || '').trim().toLowerCase();
    const tEmail = String(ticket.user_email || '').trim().toLowerCase();
    if (uEmail && tEmail && uEmail === tEmail) {
        return true;
    }
    return false;
}

/**
 * Helper to format real-time notification when ticket transitions to resuelto or pendiente
 */
function buildRealtimeTicketNotification(ticket, nextStatus, actorName = 'Soporte Técnico') {
    const isResolved = nextStatus === 'resuelto';
    return {
        type: isResolved ? 'ticket_resolved' : 'ticket_pending',
        title: isResolved
            ? `✅ Ticket Resuelto: ${ticket.ticket_code}`
            : `🔄 Ticket en Proceso: ${ticket.ticket_code}`,
        message: isResolved
            ? `Tu ticket "${ticket.subject}" ha sido resuelto${ticket.resolved_version ? ` en v${ticket.resolved_version}` : ''}. ${ticket.resolution_notes || ''}`.trim()
            : `Tu ticket "${ticket.subject}" cambió a estado "${nextStatus === 'en_proceso' ? 'En Proceso (Pendiente de Solución)' : 'Abierto (Pendiente)'}" por ${actorName}.`,
        link: '/dashboard/seguridad/tickets',
        data: {
            ticket_id: ticket.id,
            ticket_code: ticket.ticket_code,
            status: nextStatus,
            subject: ticket.subject,
            resolution_notes: ticket.resolution_notes,
            resolved_version: ticket.resolved_version
        }
    };
}

describe('Support Tickets & Real-Time Notifications (admin.sipesv.com <-> sys.sipesv.com)', () => {
    it('saveBase64Screenshot should persist valid WebP data URL and return /api/uploads path', () => {
        // Minimal 1x1 WebP base64 payload
        const tinyWebpBase64 = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
        const url = saveBase64Screenshot(tinyWebpBase64, 'TEST-TKT-001');
        assert.ok(url, 'Expected a URL string');
        assert.ok(url.startsWith('/api/uploads/TEST-TKT-001-'), `Unexpected URL format: ${url}`);
        assert.ok(url.endsWith('.webp'), 'Expected .webp extension');

        const filename = path.basename(url);
        const savedPath = path.join(UPLOADS_DIR, filename);
        assert.strictEqual(fs.existsSync(savedPath), true, 'Expected file to exist on disk');

        // Cleanup test file
        try {
            fs.unlinkSync(savedPath);
        } catch (_) {
            // ignore cleanup errors
        }
    });

    it('saveBase64Screenshot should return null for empty or non-string input and preserve existing URLs', () => {
        assert.strictEqual(saveBase64Screenshot(null), null);
        assert.strictEqual(saveBase64Screenshot(''), null);
        assert.strictEqual(saveBase64Screenshot(12345), null);
        assert.strictEqual(saveBase64Screenshot('/api/uploads/existing.webp'), '/api/uploads/existing.webp');
    });

    it('isTicketOwnedByAdminUser should match by admin_user_id, user_name, or user_email across systems', () => {
        const adminUser = {
            id: 14,
            username: 'contador.central',
            nombre: 'Carlos Contador',
            email: 'carlos@sipesv.com'
        };

        // Match by admin_user_id
        assert.strictEqual(
            isTicketOwnedByAdminUser({ id: 1, admin_user_id: 14, user_id: 99, user_name: 'Otro' }, adminUser),
            true
        );

        // Match by user_name when created or synced from sys.sipesv.com
        assert.strictEqual(
            isTicketOwnedByAdminUser({ id: 2, admin_user_id: null, user_id: 88, user_name: 'carlos contador' }, adminUser),
            true
        );

        // Match by user_email
        assert.strictEqual(
            isTicketOwnedByAdminUser({ id: 3, admin_user_id: null, user_id: 77, user_name: 'C. Contador', user_email: 'CARLOS@SIPESV.COM' }, adminUser),
            true
        );

        // Non-matching ticket
        assert.strictEqual(
            isTicketOwnedByAdminUser({ id: 4, admin_user_id: 25, user_id: 25, user_name: 'Pedro Perez', user_email: 'pedro@sipesv.com' }, adminUser),
            false
        );
    });

    it('buildRealtimeTicketNotification should format resolved and pending notifications with /dashboard/seguridad/tickets link', () => {
        const sampleTicket = {
            id: 42,
            ticket_code: 'TKT-20261019-4821',
            subject: 'Diferencia en reporte de conciliación bancaria',
            resolution_notes: 'Se corrigió el filtro de fechas en conciliación.',
            resolved_version: '1.0.148'
        };

        const resolvedNotif = buildRealtimeTicketNotification(sampleTicket, 'resuelto', 'Ing. Soporte');
        assert.strictEqual(resolvedNotif.type, 'ticket_resolved');
        assert.ok(resolvedNotif.title.includes('TKT-20261019-4821'));
        assert.ok(resolvedNotif.message.includes('v1.0.148'));
        assert.strictEqual(resolvedNotif.link, '/dashboard/seguridad/tickets');
        assert.strictEqual(resolvedNotif.data.ticket_id, 42);
        assert.strictEqual(resolvedNotif.data.status, 'resuelto');

        const pendingNotif = buildRealtimeTicketNotification(sampleTicket, 'en_proceso', 'Ing. Soporte');
        assert.strictEqual(pendingNotif.type, 'ticket_pending');
        assert.ok(pendingNotif.title.includes('Ticket en Proceso'));
        assert.ok(pendingNotif.message.includes('En Proceso (Pendiente de Solución)'));
        assert.strictEqual(pendingNotif.data.status, 'en_proceso');
    });

    it('End-to-End ticketService lifecycle against strict db_sistema_saas schema (company_id NOT NULL)', async () => {
        const dbModule = require('../db');
        const ticketService = require('../services/ticketService');

        const ticketsTable = [];
        const messagesTable = [];
        const notificationsTable = [];
        const emittedEvents = [];

        const mockIo = {
            emit(event, payload) {
                emittedEvents.push({ room: 'global', event, payload });
            },
            to(room) {
                return {
                    emit(event, payload) {
                        emittedEvents.push({ room, event, payload });
                    }
                };
            }
        };

        // Strict SaaS pool simulator enforcing company_id NOT NULL and user_id NOT NULL
        const strictSaasPool = {
            async query(sql, params = []) {
                const q = String(sql).trim();
                if (q === 'SELECT 1') return [[{ 1: 1 }]];
                if (q.startsWith('CREATE TABLE') || q.startsWith('ALTER TABLE')) return [{ affectedRows: 0 }];
                if (q.startsWith('SHOW COLUMNS FROM support_tickets')) {
                    const cols = [
                        'id', 'ticket_code', 'company_id', 'branch_id', 'user_id', 'admin_user_id',
                        'user_name', 'user_role', 'type', 'priority', 'status', 'subject', 'description',
                        'page_url', 'module_name', 'source_system', 'screenshot_url', 'attachments_json',
                        'diagnostics_json', 'diagnostic_relevance', 'diagnostic_score', 'include_in_ai_prompt',
                        'ai_notes', 'custom_logs', 'ai_mode', 'agent_platform', 'ai_bundled_at',
                        'agy_status', 'agy_model', 'agy_plan_markdown', 'agy_plan_version', 'agy_execution_log',
                        'agy_approved_by', 'agy_updated_at', 'resolution_notes', 'resolved_version',
                        'resolved_by', 'resolved_by_name', 'resolved_at', 'creator_notified_at',
                        'created_at', 'updated_at'
                    ].map((Field) => ({ Field }));
                    if (params[0]) {
                        return [cols.filter((c) => c.Field === params[0])];
                    }
                    return [cols];
                }
                if (q.startsWith('SHOW COLUMNS FROM support_ticket_messages')) {
                    const cols = [
                        'id', 'ticket_id', 'sender_type', 'sender_id', 'sender_user_id',
                        'sender_name', 'sender_role', 'source', 'message', 'attachment_url', 'created_at'
                    ].map((Field) => ({ Field }));
                    if (params[0]) {
                        return [cols.filter((c) => c.Field === params[0])];
                    }
                    return [cols];
                }
                if (q.includes('SELECT MAX(id) AS maxId FROM support_tickets')) {
                    const maxId = ticketsTable.reduce((m, r) => Math.max(m, r.id), 0);
                    return [[{ maxId }]];
                }
                if (q.startsWith('INSERT INTO support_tickets')) {
                    const companyIdVal = params[1];
                    const userIdVal = params[2];
                    if (companyIdVal === null || companyIdVal === undefined) {
                        const err = new Error("Column 'company_id' cannot be null");
                        err.code = 'ER_BAD_NULL_ERROR';
                        throw err;
                    }
                    if (userIdVal === null || userIdVal === undefined) {
                        const err = new Error("Column 'user_id' cannot be null");
                        err.code = 'ER_BAD_NULL_ERROR';
                        throw err;
                    }
                    const newId = ticketsTable.length + 1;
                    const row = {
                        id: newId,
                        ticket_code: params[0],
                        company_id: companyIdVal,
                        user_id: userIdVal,
                        admin_user_id: params[3],
                        user_name: params[4],
                        user_role: params[5],
                        type: params[6],
                        priority: params[7],
                        status: 'abierto',
                        subject: params[8],
                        description: params[9],
                        module_name: params[10],
                        page_url: params[11],
                        source_system: 'admin.sipesv.com',
                        screenshot_url: params[12] || '/uploads/sample-from-saas.webp',
                        attachments_json: params[13],
                        diagnostics_json: params[14],
                        diagnostic_relevance: params[15],
                        diagnostic_score: params[16],
                        include_in_ai_prompt: 0,
                        ai_notes: null,
                        resolution_notes: null,
                        resolved_version: null,
                        resolved_by_name: null,
                        resolved_at: null,
                        creator_notified_at: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    ticketsTable.push(row);
                    return [{ insertId: newId, affectedRows: 1 }];
                }
                if (q.startsWith('INSERT INTO support_ticket_messages')) {
                    const msgId = messagesTable.length + 1;
                    messagesTable.push({
                        id: msgId,
                        ticket_id: Number(params[0]),
                        sender_type: params[1] || 'user',
                        sender_id: params[2],
                        sender_user_id: params[3],
                        sender_name: params[4] || 'Usuario',
                        sender_role: params[5] || 'user',
                        source: params[6] || 'web',
                        message: params[7] || params[4],
                        attachment_url: params[8] || null,
                        created_at: new Date().toISOString()
                    });
                    return [{ insertId: msgId, affectedRows: 1 }];
                }
                if (q.includes('FROM support_tickets t') && q.includes('WHERE t.id = ?')) {
                    if (q.includes('c.name AS company_name')) {
                        const err = new Error("Unknown column 'c.name' in 'field list'");
                        err.code = 'ER_BAD_FIELD_ERROR';
                        throw err;
                    }
                    const found = ticketsTable.find((t) => t.id === Number(params[0]));
                    if (!found) return [[]];
                    return [[{ ...found, company_name: 'SERVICIOS INTEGRALES PETROLEROS S.A. DE C.V.' }]];
                }
                if (q.startsWith('SELECT * FROM support_ticket_messages WHERE ticket_id = ?')) {
                    return [messagesTable.filter((m) => m.ticket_id === Number(params[0]))];
                }
                if (q.startsWith('SELECT COUNT(*) AS total FROM support_tickets')) {
                    return [[{ total: ticketsTable.length }]];
                }
                if (q.includes('FROM support_tickets t') && q.includes('LIMIT ? OFFSET ?')) {
                    return [ticketsTable.map((t) => ({ ...t, company_name: 'SIPE S.A. DE C.V.' }))];
                }
                if (q.includes('SUM(CASE WHEN status =')) {
                    return [[{
                        total: ticketsTable.length,
                        abiertos: ticketsTable.filter((t) => t.status === 'abierto').length,
                        en_proceso: ticketsTable.filter((t) => t.status === 'en_proceso').length,
                        resueltos: ticketsTable.filter((t) => t.status === 'resuelto').length,
                        cerrados: ticketsTable.filter((t) => t.status === 'cerrado').length,
                        urgentes_pendientes: 0,
                        seleccionados_ia: ticketsTable.filter((t) => t.include_in_ai_prompt === 1).length
                    }]];
                }
                if (q.startsWith('UPDATE support_tickets')) {
                    const idParam = Number(params[params.length - 1]) || Number(params[0]);
                    const target = ticketsTable.find((t) => t.id === idParam) || ticketsTable[0];
                    if (target) {
                        if (q.includes("status = 'resuelto'")) {
                            target.status = 'resuelto';
                            target.resolution_notes = params[0];
                            target.resolved_version = params[1];
                            target.resolved_by_name = params[3] || params[2];
                            target.resolved_at = new Date().toISOString();
                            target.creator_notified_at = null;
                        } else if (q.includes('SET status = ?')) {
                            target.status = params[0];
                        } else if (q.includes('creator_notified_at = NOW()')) {
                            target.creator_notified_at = new Date().toISOString();
                        }
                        target.updated_at = new Date().toISOString();
                    }
                    return [{ affectedRows: target ? 1 : 0 }];
                }
                if (q.includes("AND t.status = 'resuelto'") && q.includes('t.creator_notified_at IS NULL')) {
                    return [ticketsTable.filter((t) => t.status === 'resuelto' && !t.creator_notified_at)];
                }
                return [[]];
            }
        };

        const mockLocalPool = {
            async query(sql, params = []) {
                const q = String(sql).trim();
                if (q.startsWith('INSERT INTO notifications')) {
                    const id = notificationsTable.length + 1;
                    notificationsTable.push({
                        id,
                        user_id: params[0],
                        type: params[1],
                        title: params[2],
                        message: params[3],
                        data: params[4]
                    });
                    return [{ insertId: id, affectedRows: 1 }];
                }
                if (q.includes('FROM users')) {
                    return [[{ id: 7, nombre: 'Raul Admin', username: 'raul' }]];
                }
                return [[]];
            }
        };

        const origGetAccountingDb = dbModule.getAccountingDb;
        const origGetDb = dbModule.getDb;
        dbModule.getAccountingDb = async () => strictSaasPool;
        dbModule.getDb = () => mockLocalPool;

        try {
            // 1. Create ticket with companyId: null (simulating admin.sipesv.com user without company_id)
            const created = await ticketService.createTicket({
                companyId: null,
                userId: 7,
                adminUserId: 7,
                userName: 'Raul Admin',
                userRole: 'Administrator',
                type: 'problema',
                priority: 'alta',
                subject: 'Prueba de sincronización con sys.sipesv.com',
                description: 'Validando creación sin company_id nulo y notificaciones en vivo.',
                moduleName: 'Seguridad',
                pageUrl: '/dashboard/seguridad/tickets',
                io: mockIo
            });

            assert.ok(created, 'Ticket should be created');
            assert.strictEqual(created.company_id, 1, 'company_id must default to 1 (non-null)');
            assert.strictEqual(created.ticket_code, 'ADM-0001');
            assert.strictEqual(created.screenshot_url, '/api/uploads/sample-from-saas.webp', '/uploads/ must normalize to /api/uploads/');
            assert.ok(emittedEvents.some((e) => e.event === 'ticket:created'), 'Should emit ticket:created');
            assert.ok(emittedEvents.some((e) => e.event === 'notification:new' && e.payload.type === 'ticket_pending'), 'Should emit pending notification to creator');

            // 2. List tickets & stats
            const listRes = await ticketService.getTickets({ userId: 7, userName: 'Raul Admin', canManage: false, mineOnly: true });
            assert.strictEqual(listRes.items.length, 1);
            const stats = await ticketService.getTicketStats({ userId: 7, userName: 'Raul Admin', canManage: false });
            assert.strictEqual(stats.total, 1);
            assert.strictEqual(stats.abiertos, 1);

            // 3. Add message
            const withReply = await ticketService.addTicketMessage(created.id, {
                senderUserId: 99,
                senderName: 'Soporte Técnico',
                senderRole: 'tech',
                message: 'Estamos revisando tu caso.',
                io: mockIo
            });
            assert.strictEqual(withReply.messages.length, 2);
            assert.ok(emittedEvents.some((e) => e.event === 'ticket:message'), 'Should emit ticket:message');

            // 4. Resolve ticket
            const resolved = await ticketService.updateTicketStatus(created.id, {
                status: 'resuelto',
                resolutionNotes: 'Sincronización verificada al 100%.',
                resolvedVersion: '1.0.150',
                actorId: 99,
                actorName: 'Soporte Técnico',
                io: mockIo
            });
            assert.strictEqual(resolved.status, 'resuelto');
            assert.ok(emittedEvents.some((e) => e.event === 'ticket:resolved'), 'Should emit ticket:resolved');
            assert.ok(emittedEvents.some((e) => e.event === 'notification:new' && e.payload.type === 'ticket_resolved'), 'Should emit ticket_resolved notification');

            // 5. Pending resolved & acknowledge
            const pendingResolved = await ticketService.getPendingResolvedForUser(7, 'Raul Admin', 'raul');
            assert.strictEqual(pendingResolved.length, 1);
            const acked = await ticketService.acknowledgeResolution(created.id, 7, 'Raul Admin', 'raul');
            assert.strictEqual(acked, true);
            const pendingAfterAck = await ticketService.getPendingResolvedForUser(7, 'Raul Admin', 'raul');
            assert.strictEqual(pendingAfterAck.length, 0);
        } finally {
            dbModule.getAccountingDb = origGetAccountingDb;
            dbModule.getDb = origGetDb;
        }
    });

    it('Resilience when db_sistema_saas has only base v295-v299 columns (ALTER TABLE restricted)', async () => {
        const dbModule = require('../db');
        const ticketService = require('../services/ticketService');

        const baseTickets = [];
        const baseMessages = [];
        const allowedTicketCols = new Set([
            'id', 'ticket_code', 'company_id', 'branch_id', 'user_id',
            'user_name', 'user_role', 'type', 'priority', 'status',
            'subject', 'description', 'page_url', 'module_name',
            'screenshot_url', 'attachments_json', 'browser_info',
            'diagnostics_json', 'diagnostic_relevance', 'diagnostic_score',
            'include_in_ai_prompt', 'ai_notes', 'agy_status', 'agy_model',
            'agy_plan_markdown', 'agy_plan_version', 'agy_execution_log',
            'agy_feedback_history', 'agy_approved_by', 'agy_updated_at',
            'assigned_to', 'assigned_name', 'resolution_notes',
            'resolved_version', 'resolved_by_name', 'resolved_at',
            'creator_notified_at', 'telegram_notified', 'created_at', 'updated_at'
        ]);

        const restrictedSaasPool = {
            async query(sql, params = []) {
                const q = String(sql).trim();
                if (q === 'SELECT 1') return [[{ 1: 1 }]];
                if (q.startsWith('CREATE TABLE')) return [{ affectedRows: 0 }];
                if (q.startsWith('ALTER TABLE')) {
                    const err = new Error('ALTER command denied to user');
                    err.code = 'ER_TABLEACCESS_DENIED_ERROR';
                    throw err;
                }
                if (q.startsWith('SHOW COLUMNS FROM support_tickets')) {
                    const cols = Array.from(allowedTicketCols).map((Field) => ({ Field }));
                    if (params[0]) return [cols.filter((c) => c.Field === params[0])];
                    return [cols];
                }
                if (q.startsWith('SHOW COLUMNS FROM support_ticket_messages')) {
                    const cols = ['id', 'ticket_id', 'sender_type', 'sender_id', 'sender_name', 'message', 'attachment_url', 'created_at'].map((Field) => ({ Field }));
                    if (params[0]) return [cols.filter((c) => c.Field === params[0])];
                    return [cols];
                }
                // Reject any query referencing non-existent columns on support_tickets
                const forbiddenMatch = q.includes('support_tickets') && q.match(/\b(admin_user_id|source_system|ai_bundled_at|resolved_by)\b/);
                if (forbiddenMatch) {
                    const err = new Error(`Unknown column '${forbiddenMatch[1]}' in 'field list'`);
                    err.code = 'ER_BAD_FIELD_ERROR';
                    throw err;
                }
                if (q.includes('support_ticket_messages') && q.includes('sender_user_id')) {
                    const err = new Error("Unknown column 'sender_user_id' in 'field list'");
                    err.code = 'ER_BAD_FIELD_ERROR';
                    throw err;
                }
                if (q.includes('SELECT MAX(id) AS maxId FROM support_tickets')) {
                    return [[{ maxId: baseTickets.length }]];
                }
                if (q.startsWith('INSERT INTO support_tickets')) {
                    if (!params[1]) {
                        const err = new Error("Column 'company_id' cannot be null");
                        err.code = 'ER_BAD_NULL_ERROR';
                        throw err;
                    }
                    const id = baseTickets.length + 1;
                    baseTickets.push({
                        id,
                        ticket_code: params[0],
                        company_id: params[1],
                        user_id: params[2],
                        user_name: params[3],
                        user_role: params[4],
                        type: params[5],
                        priority: params[6],
                        status: 'abierto',
                        subject: params[7],
                        description: params[8],
                        module_name: params[9],
                        page_url: params[10],
                        screenshot_url: params[11],
                        attachments_json: params[12],
                        diagnostics_json: params[13],
                        diagnostic_relevance: params[14],
                        diagnostic_score: params[15],
                        include_in_ai_prompt: 0,
                        ai_notes: null,
                        creator_notified_at: null
                    });
                    return [{ insertId: id, affectedRows: 1 }];
                }
                if (q.startsWith('INSERT INTO support_ticket_messages')) {
                    const id = baseMessages.length + 1;
                    baseMessages.push({
                        id,
                        ticket_id: Number(params[0]),
                        sender_type: params[1] || 'user',
                        sender_id: params[2],
                        sender_name: params[3],
                        message: params[4],
                        attachment_url: params[5] || null
                    });
                    return [{ insertId: id, affectedRows: 1 }];
                }
                if (q.includes('FROM support_tickets t') && q.includes('WHERE t.id = ?')) {
                    const found = baseTickets.find((t) => t.id === Number(params[0]));
                    return [found ? [{ ...found, company_name: 'SIPE S.A. DE C.V.' }] : []];
                }
                if (q.startsWith('SELECT * FROM support_ticket_messages WHERE ticket_id = ?')) {
                    return [baseMessages.filter((m) => m.ticket_id === Number(params[0]))];
                }
                if (q.startsWith('SELECT COUNT(*) AS total FROM support_tickets')) {
                    return [[{ total: baseTickets.length }]];
                }
                if (q.includes('FROM support_tickets t') && q.includes('LIMIT ? OFFSET ?')) {
                    return [baseTickets];
                }
                if (q.includes('SUM(CASE WHEN status =')) {
                    return [[{ total: baseTickets.length, abiertos: 1, en_proceso: 0, resueltos: 0, cerrados: 0, urgentes_pendientes: 0, seleccionados_ia: 0 }]];
                }
                if (q.startsWith('UPDATE support_tickets')) {
                    if (baseTickets[0] && q.includes("status = 'resuelto'")) {
                        baseTickets[0].status = 'resuelto';
                    }
                    return [{ affectedRows: 1 }];
                }
                return [baseTickets];
            }
        };

        const mockLocalPool = {
            async query() {
                return [[]];
            }
        };

        const origGetAccountingDb = dbModule.getAccountingDb;
        const origGetDb = dbModule.getDb;
        dbModule.getAccountingDb = async () => restrictedSaasPool;
        dbModule.getDb = () => mockLocalPool;

        try {
            const t = await ticketService.createTicket({
                companyId: null,
                userId: 3,
                adminUserId: 3,
                userName: 'Contador SIPE',
                subject: 'Ticket en esquema base v295',
                description: 'Debe funcionar sin columnas extendidas.'
            });
            assert.ok(t.id);
            assert.strictEqual(t.company_id, 1);

            const list = await ticketService.getTickets({ userId: 3, userName: 'Contador SIPE', canManage: false, mineOnly: true });
            assert.strictEqual(list.items.length, 1);

            const stats = await ticketService.getTicketStats({ userId: 3, userName: 'Contador SIPE', canManage: false });
            assert.strictEqual(stats.total, 1);

            const updated = await ticketService.updateTicketStatus(t.id, {
                status: 'resuelto',
                resolutionNotes: 'Listo',
                actorId: 1,
                actorName: 'Soporte'
            });
            assert.strictEqual(updated.status, 'resuelto');

            const pending = await ticketService.getPendingResolvedForUser(3, 'Contador SIPE', 'contador');
            assert.strictEqual(pending.length, 1);

            const ack = await ticketService.acknowledgeResolution(t.id, 3, 'Contador SIPE', 'contador');
            assert.strictEqual(ack, true);
        } finally {
            dbModule.getAccountingDb = origGetAccountingDb;
            dbModule.getDb = origGetDb;
        }
    });
});
