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

    it('ticketsRouter.isTicketOwner debe prevenir colisión de homónimos cuando admin_user_id existe y permitir fallback en tickets sincronizados', () => {
        const ticketsRouter = require('../routes/tickets');
        const ownerUser = { id: 10, username: 'juan.perez', nombre: 'Juan Perez', email: 'juan@sipesv.com' };
        const homonymIntruder = { id: 99, username: 'otro.juan', nombre: 'Juan Perez', email: 'juan2@sipesv.com' };

        const localTicket = { id: 500, admin_user_id: 10, user_id: 10, user_name: 'Juan Perez', source_system: 'admin.sipesv.com' };
        assert.strictEqual(ticketsRouter.isTicketOwner(localTicket, ownerUser), true);
        assert.strictEqual(ticketsRouter.isTicketOwner(localTicket, homonymIntruder), false, 'Un homónimo con otro ID no debe ser considerado propietario');

        const syncedSaasTicket = { id: 501, admin_user_id: null, user_id: 88, user_name: 'Juan Perez', source_system: 'sys.sipesv.com' };
        assert.strictEqual(ticketsRouter.isTicketOwner(syncedSaasTicket, ownerUser), true);
    });

    it('saveBase64Screenshot debe generar nombres no enumerables con UUIDv4 criptográfico y aislar salas Socket.io', async () => {
        const tinyWebpBase64 = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
        const url = saveBase64Screenshot(tinyWebpBase64, 'TEST-UUID');
        assert.match(url, /^\/api\/uploads\/TEST-UUID-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i);
        const savedPath = path.join(UPLOADS_DIR, path.basename(url));
        try { fs.unlinkSync(savedPath); } catch (_) { /* ignore */ }

        const ticketService = require('../services/ticketService');
        const dbModule = require('../db');
        const origGetAccountingDb = dbModule.getAccountingDb;
        const origGetDb = dbModule.getDb;

        const mockPool = {
            async query(sql) {
                const q = String(sql).trim();
                if (q.startsWith('SHOW COLUMNS')) return [[{ Field: 'id' }, { Field: 'admin_user_id' }, { Field: 'source_system' }]];
                if (q.startsWith('INSERT INTO support_tickets')) return [{ insertId: 777 }];
                if (q.includes('FROM support_tickets t') && q.includes('WHERE t.id = ?')) {
                    return [[{ id: 777, ticket_code: 'ADM-0777', admin_user_id: 42, user_id: 42, user_name: 'Operador', subject: 'Prueba Sala', description: 'Desc', status: 'abierto', priority: 'media', type: 'problema', source_system: 'admin.sipesv.com' }]];
                }
                return [[]];
            }
        };
        dbModule.getAccountingDb = async () => { throw new Error('offline'); };
        dbModule.getDb = () => mockPool;

        const roomEmissions = [];
        let globalEmits = 0;
        const scopedIo = {
            to(rooms) {
                return {
                    emit(ev, payload) {
                        roomEmissions.push({ rooms, ev, payload });
                    }
                };
            },
            emit() {
                globalEmits += 1;
            }
        };

        try {
            await ticketService.createTicket({
                userId: 42,
                adminUserId: 42,
                userName: 'Operador',
                subject: 'Prueba Sala',
                description: 'Desc',
                io: scopedIo
            });
            assert.strictEqual(globalEmits, 0, 'No debe emitir globalmente a sockets no autorizados');
            const createdEv = roomEmissions.find((e) => e.ev === 'ticket:created');
            assert.ok(createdEv, 'Debe emitir ticket:created a salas autorizadas');
            assert.ok(createdEv.rooms.includes('perm_support_tickets'));
            assert.ok(createdEv.rooms.includes('role_admin'));
            assert.ok(createdEv.rooms.includes('user_42'));
        } finally {
            dbModule.getAccountingDb = origGetAccountingDb;
            dbModule.getDb = origGetDb;
        }
    });

    it('Tickets por Telegram/AGY deben usar gemini-4-neon-high por defecto y trabajos finalizados deben pasar de en_proceso a resuelto/completada', async () => {
        const ticketService = require('../services/ticketService');
        const dbModule = require('../db');
        const origGetAccountingDb = dbModule.getAccountingDb;
        const origGetDb = dbModule.getDb;

        assert.strictEqual(ticketService.DEFAULT_AGY_MODEL, 'gemini-4-neon-high');

        const tickets = [
            {
                id: 901,
                ticket_code: 'ADM-0901',
                company_id: 1,
                user_id: 7,
                admin_user_id: 7,
                user_name: 'Raul Admin',
                subject: 'Ticket finalizado en AGY pero rezagado en_proceso',
                description: 'Validar reconciliación automática',
                status: 'en_proceso',
                priority: 'alta',
                type: 'mejora',
                source_system: 'admin.sipesv.com',
                include_in_ai_prompt: 1,
                agy_status: 'completado',
                agy_model: 'gemini-4-argon-high',
                agy_approved_by: 'Raul (Telegram)',
                resolution_notes: null,
                resolved_at: null
            },
            {
                id: 902,
                ticket_code: 'ADM-0902',
                company_id: 1,
                user_id: 7,
                admin_user_id: 7,
                user_name: 'Raul Admin',
                subject: 'Nuevo ticket desde Telegram pendiente de planificar',
                description: 'Debe tomar modelo gemini-4-neon-high por defecto y al ejecutarse quedar resuelto',
                status: 'abierto',
                priority: 'media',
                type: 'requerimiento',
                source_system: 'admin.sipesv.com',
                include_in_ai_prompt: 0,
                agy_status: 'idle',
                agy_model: '',
                agy_plan_version: 0,
                resolution_notes: null,
                resolved_at: null
            }
        ];

        const aiAgentTasks = [
            {
                id: 51,
                title: '[Ticket #ADM-0901] Ticket finalizado en AGY pero rezagado en_proceso',
                status: 'en_proceso',
                progress: 50,
                current_step: 'Prompt + Logs listos',
                completed_at: null
            },
            {
                id: 52,
                title: '[Ticket #ADM-0902] Nuevo ticket desde Telegram pendiente de planificar',
                status: 'en_proceso',
                progress: 50,
                current_step: 'Ejecutando...',
                completed_at: null
            }
        ];

        const growthConversations = [
            { id: 301, ticket_id: 901, ticket_code: 'ADM-0901', estado_agy: 'ejecutando' }
        ];

        const localNotifications = [
            { id: 1, user_id: 7, type: 'ticket_pending', title: '⏳ Ticket #ADM-0902: En Proceso', is_read: 0 }
        ];

        const settingsRow = {
            id: 1,
            ssh_host: 'localhost',
            ssh_port: 22,
            ssh_user: 'root',
            project_path: '/var/www/sipeadmin',
            agy_command: 'agy',
            default_model: '',
            execution_mode: 'auto'
        };

        const mockSaasPool = {
            async query(sql, params = []) {
                const q = String(sql).replace(/\s+/g, ' ').trim();
                if (q === 'SELECT 1') return [[{ 1: 1 }]];
                if (q.startsWith('CREATE TABLE') || q.startsWith('ALTER TABLE')) return [{ affectedRows: 0 }];
                if (q.startsWith('SHOW COLUMNS FROM support_tickets')) {
                    const cols = [
                        'id', 'ticket_code', 'company_id', 'user_id', 'admin_user_id', 'user_name',
                        'status', 'priority', 'type', 'subject', 'description', 'source_system',
                        'include_in_ai_prompt', 'ai_notes', 'agy_status', 'agy_model', 'agy_plan_markdown',
                        'agy_plan_version', 'agy_execution_log', 'agy_approved_by', 'agy_updated_at',
                        'resolution_notes', 'resolved_version', 'resolved_by', 'resolved_by_name',
                        'resolved_at', 'creator_notified_at', 'telegram_messages_json'
                    ].map((Field) => ({ Field }));
                    return [params[0] ? cols.filter((c) => c.Field === params[0]) : cols];
                }
                if (q.startsWith('SHOW COLUMNS FROM support_ticket_messages')) {
                    return [[{ Field: 'id' }, { Field: 'ticket_id' }, { Field: 'sender_user_id' }]];
                }
                if (q.startsWith('UPDATE agy_server_settings')) {
                    if (!settingsRow.default_model) settingsRow.default_model = params[0];
                    return [{ affectedRows: 1 }];
                }
                if (q.startsWith('SELECT * FROM agy_server_settings') || q.startsWith('SELECT default_model FROM agy_server_settings')) {
                    return [[settingsRow]];
                }
                if (q.includes("WHERE agy_status = 'completado' AND status IN ('abierto', 'en_proceso')")) {
                    return [tickets.filter((t) => t.agy_status === 'completado' && (t.status === 'abierto' || t.status === 'en_proceso'))];
                }
                if (q.includes("WHERE status IN ('resuelto', 'cerrado') AND include_in_ai_prompt = 1")) {
                    return [tickets.filter((t) => (t.status === 'resuelto' || t.status === 'cerrado') && t.include_in_ai_prompt === 1)];
                }
                if (q.includes("AND agy_status = 'idle' AND status IN ('abierto', 'en_proceso')")) {
                    return [tickets.filter((t) => t.agy_status === 'idle' && (!t.agy_model || t.agy_model === ''))];
                }
                if (q.startsWith('UPDATE ai_agent_tasks t INNER JOIN support_tickets st')) {
                    for (const task of aiAgentTasks) {
                        const linked = tickets.find((st) => task.title.includes(st.ticket_code));
                        if (linked && (linked.status === 'resuelto' || linked.status === 'cerrado' || linked.agy_status === 'completado')) {
                            task.status = 'completada';
                            task.progress = 100;
                            task.completed_at = new Date().toISOString();
                        }
                    }
                    return [{ affectedRows: 1 }];
                }
                if (q.startsWith('UPDATE ai_agent_tasks SET status =')) {
                    const codePattern = String(params[2] || '').replace(/%/g, '');
                    for (const task of aiAgentTasks) {
                        if (codePattern && task.title.includes(codePattern)) {
                            task.status = 'completada';
                            task.progress = 100;
                            task.current_step = params[0];
                            task.completed_at = new Date().toISOString();
                        }
                    }
                    return [{ affectedRows: 1 }];
                }
                if (q.includes('FROM support_tickets t') && q.includes('WHERE t.id = ?')) {
                    const found = tickets.find((t) => t.id === Number(params[0]));
                    return [found ? [{ ...found }] : []];
                }
                if (q.startsWith('SELECT * FROM support_ticket_messages')) {
                    return [[]];
                }
                if (q.startsWith('INSERT INTO support_ticket_messages')) {
                    return [{ insertId: 1, affectedRows: 1 }];
                }
                if (q.startsWith('UPDATE support_tickets')) {
                    const id = Number(params[params.length - 1]);
                    const target = tickets.find((t) => t.id === id);
                    if (target) {
                        if (q === 'UPDATE support_tickets SET agy_model = ? WHERE id = ?') {
                            target.agy_model = params[0];
                        } else if (q === 'UPDATE support_tickets SET include_in_ai_prompt = 0 WHERE id = ?') {
                            target.include_in_ai_prompt = 0;
                        } else if (q.includes("agy_status = 'esperando_aprobacion'")) {
                            if (target.status === 'abierto') target.status = 'en_proceso';
                            target.agy_status = 'esperando_aprobacion';
                            target.agy_model = params[1];
                            target.agy_plan_markdown = params[2];
                            target.agy_approved_by = params[3];
                            target.agy_plan_version = params[4];
                        } else if (q.includes("SET agy_status = 'completado'")) {
                            target.agy_status = 'completado';
                            target.include_in_ai_prompt = 0;
                        } else if (q.includes("SET status = 'resuelto'")) {
                            target.status = 'resuelto';
                            target.include_in_ai_prompt = 0;
                            target.resolution_notes = params[0];
                            target.resolved_at = new Date().toISOString();
                        }
                    }
                    return [{ affectedRows: target ? 1 : 0 }];
                }
                return [[]];
            }
        };

        const mockLocalDb = {
            async query(sql, params = []) {
                const q = String(sql).replace(/\s+/g, ' ').trim();
                if (q.startsWith('UPDATE finanzas_conversaciones')) {
                    const tid = Number(params[0]);
                    for (const c of growthConversations) {
                        if (c.ticket_id === tid) c.estado_agy = 'completado';
                    }
                    return [{ affectedRows: 1 }];
                }
                if (q.startsWith('UPDATE notifications SET is_read = 1')) {
                    const codeLike = String(params[1] || '').replace(/%/g, '');
                    for (const n of localNotifications) {
                        if (codeLike && n.title.includes(codeLike)) n.is_read = 1;
                    }
                    return [{ affectedRows: 1 }];
                }
                if (q.startsWith('INSERT INTO notifications')) {
                    localNotifications.push({ id: localNotifications.length + 1, user_id: params[0], type: params[1], title: params[2], is_read: 0 });
                    return [{ insertId: localNotifications.length, affectedRows: 1 }];
                }
                return [[]];
            }
        };

        dbModule.getAccountingDb = async () => mockSaasPool;
        dbModule.getDb = () => mockLocalDb;

        try {
            // 1. Al inicializar esquema y consultar ajustes, establece gemini-4-neon-high y reconcilia trabajos finalizados
            const agyCfg = await ticketService.getAgySettings();
            assert.strictEqual(agyCfg.default_model, 'gemini-4-neon-high');
            assert.strictEqual(agyCfg.available_models[0].id, 'gemini-4-neon-high');

            // El ticket 901 que tenía agy_status='completado' y status='en_proceso' debe haber pasado a 'resuelto'
            assert.strictEqual(tickets[0].status, 'resuelto');
            assert.strictEqual(tickets[0].include_in_ai_prompt, 0);
            assert.strictEqual(aiAgentTasks[0].status, 'completada');
            assert.strictEqual(aiAgentTasks[0].progress, 100);
            assert.strictEqual(growthConversations[0].estado_agy, 'completado');

            // El ticket 902 idle sin modelo debe haberse actualizado a gemini-4-neon-high
            assert.strictEqual(tickets[1].agy_model, 'gemini-4-neon-high');

            // 2. Planificar y ejecutar el ticket 902 con modelo por defecto (gemini-4-neon-high)
            const planned = await ticketService.approveAndGeneratePlan(902, {
                actorName: 'Raul (Telegram)'
            });
            assert.strictEqual(planned.agy_model, 'gemini-4-neon-high');
            assert.strictEqual(planned.status, 'en_proceso');
            assert.strictEqual(planned.agy_status, 'esperando_aprobacion');

            const executed = await ticketService.executeApprovedPlan(902, {
                actorId: 7,
                actorName: 'Raul (Telegram)'
            });
            assert.strictEqual(executed.agy_status, 'completado');
            assert.strictEqual(executed.status, 'resuelto', 'Al finalizar plan AGY, el ticket NO debe quedar en_proceso sino resuelto');
            assert.strictEqual(executed.include_in_ai_prompt, 0);
            assert.strictEqual(aiAgentTasks[1].status, 'completada', 'La tarea agéntica vinculada debe pasar a completada (100%)');
            assert.strictEqual(localNotifications[0].is_read, 1, 'La notificación previa de En Proceso debe marcarse como leída');
        } finally {
            dbModule.getAccountingDb = origGetAccountingDb;
            dbModule.getDb = origGetDb;
        }
    });

    it('ticketTelegramAgyService maneja /ticket, /modelo, selector inline de modelos y seguridad fail-closed', async () => {
        const ticketTelegramAgyService = require('../services/ticketTelegramAgyService');
        const growthAgyService = require('../services/businessGrowthAgyService');
        const dbModule = require('../db');
        const origGetAccountingDb = dbModule.getAccountingDb;
        const origGetDb = dbModule.getDb;

        // 1. Validar edición tolerante a indentación/espacios finales
        const sampleFile = 'const a = 1;\n    const label = "Anterior";   \nconst b = 2;\n';
        const patched = growthAgyService.applyFlexibleTextEdit(
            sampleFile,
            '  const label = "Anterior";\nconst b = 2;',
            '    const label = "Actualizado";\nconst b = 2;'
        );
        assert.ok(patched.includes('"Actualizado"'), 'applyFlexibleTextEdit debe aplicar el cambio aunque difiera sangría en la búsqueda');

        // 2. Validar contención segura de rutas AGY (sin traversal ni archivos críticos)
        assert.strictEqual(ticketTelegramAgyService.isSafeAgyTargetPath('/opt/sipeadmin', 'frontend/src/pages/Ventas.jsx'), true);
        assert.strictEqual(ticketTelegramAgyService.isSafeAgyTargetPath('/opt/sipeadmin', '../sipeadmin-evil/hack.js'), false);
        assert.strictEqual(ticketTelegramAgyService.isSafeAgyTargetPath('/opt/sipeadmin', 'backend/.env'), false);
        assert.strictEqual(ticketTelegramAgyService.isSafeAgyTargetPath('/opt/sipeadmin', 'backend/middleware/auth.js'), false);
        assert.strictEqual(ticketTelegramAgyService.isSafeAgyTargetPath('/opt/sipeadmin', 'deploy.sh'), false);

        // 3. Validar que permiso_alertas por sí solo NO autoriza gestión de tickets ni AGY
        assert.strictEqual(
            ticketTelegramAgyService.isTicketAdminOrManager(
                { telegram_user_id: '777', activo: 1, permiso_alertas: 1 },
                { linkedUser: { id: 9, role_id: 4, role_name: 'Operador' }, alertas: true, sipePermissions: [] }
            ),
            false
        );

        const settingsRow = { id: 1, default_model: 'gemini-4-neon-high' };
        const ticket12 = {
            id: 12,
            ticket_code: 'ADM-0012',
            company_id: 1,
            user_id: 7,
            admin_user_id: 7,
            user_name: 'Raul Admin',
            subject: 'Ajuste pendiente en ADM-0012',
            description: 'Validar flujo completo desde bot de Telegram',
            module_name: 'Operaciones',
            page_url: '/dashboard/operaciones/pedidos',
            status: 'en_proceso',
            priority: 'alta',
            type: 'mejora',
            source_system: 'admin.sipesv.com',
            agy_status: 'esperando_aprobacion',
            agy_model: 'gemini-4-neon-high',
            agy_plan_markdown: '🎯 Diagnóstico: Ajuste requerido.'
        };

        const mockPool = {
            async query(sql, params = []) {
                const q = String(sql).replace(/\s+/g, ' ').trim();
                if (q === 'SELECT 1') return [[{ 1: 1 }]];
                if (q.startsWith('CREATE TABLE') || q.startsWith('ALTER TABLE')) return [{ affectedRows: 0 }];
                if (q.startsWith('SHOW COLUMNS FROM support_tickets')) {
                    return [[
                        { Field: 'id' }, { Field: 'ticket_code' }, { Field: 'status' },
                        { Field: 'agy_status' }, { Field: 'agy_model' }, { Field: 'include_in_ai_prompt' }
                    ]];
                }
                if (q.startsWith('SELECT * FROM agy_server_settings') || q.startsWith('SELECT default_model FROM agy_server_settings')) {
                    return [[settingsRow]];
                }
                if (q.startsWith('INSERT INTO agy_server_settings')) {
                    settingsRow.default_model = params[0];
                    return [{ affectedRows: 1 }];
                }
                if (q.startsWith('SELECT id FROM support_tickets WHERE ticket_code = ?')) {
                    return [params[0] === 'ADM-0012' ? [{ id: 12 }] : []];
                }
                if (q.includes('FROM support_tickets t') && q.includes('WHERE t.id = ?')) {
                    return [Number(params[0]) === 12 ? [{ ...ticket12 }] : []];
                }
                if (q.startsWith('UPDATE support_tickets SET agy_model = ?')) {
                    ticket12.agy_model = params[0];
                    return [{ affectedRows: 1 }];
                }
                if (q.startsWith('UPDATE support_tickets') && q.includes("SET status = 'resuelto'")) {
                    ticket12.status = 'resuelto';
                    ticket12.agy_status = 'completado';
                    ticket12.resolution_notes = params[0];
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            }
        };

        dbModule.getAccountingDb = async () => mockPool;
        dbModule.getDb = () => ({ async query() { return [[]]; } });

        const sentMessages = [];
        const answeredCallbacks = [];
        const editedMarkups = [];
        const tgHelpers = {
            async sendTelegramMessage(chatId, html, replyMarkup) {
                sentMessages.push({ chatId, html, replyMarkup });
            },
            async answerCallbackQuery(id, text) {
                answeredCallbacks.push({ id, text });
            },
            async editMessageReplyMarkup(chatId, msgId, markup) {
                editedMarkups.push({ chatId, msgId, markup });
            },
            async sendChatAction() {},
            escapeHtml: (s) => String(s || '')
        };

        const adminUser = { telegram_user_id: '555', first_name: 'Raul', activo: 1, permiso_alertas: 1 };
        const adminPerms = { isAdmin: true, linkedUser: { id: 1, role_id: 1, role_name: 'Administrator' }, sipePermissions: ['manage_support_tickets'] };

        try {
            // Fail-closed: callback sin tgUser debe rechazarse
            const rejectedNoUser = await ticketTelegramAgyService.handleTicketCallback(
                { id: 'cb_unauth', data: 'agy_start_plan:12', from: { id: 999 }, message: { chat: { id: 999 }, message_id: 1 } },
                tgHelpers,
                { tgUser: null, effPerms: {} }
            );
            assert.strictEqual(rejectedNoUser, true);
            assert.ok(answeredCallbacks.some((c) => c.id === 'cb_unauth' && c.text.includes('⛔')));

            // /ticket ADM-0012 debe mostrar gemini-4-neon-high y botón Cambiar Modelo
            const handledCmd = await ticketTelegramAgyService.handleTicketTextCommand(555, '/ticket adm-12', adminUser, adminPerms, tgHelpers);
            assert.strictEqual(handledCmd, true);
            assert.ok(sentMessages[0].html.includes('ADM-0012'));
            assert.ok(sentMessages[0].html.includes('gemini-4-neon-high'));
            assert.ok(JSON.stringify(sentMessages[0].replyMarkup).includes('agy_model_menu:12'));

            // Cambiar modelo del ticket mediante botón inline a gemini-4-neon-xhigh
            const cbPick = await ticketTelegramAgyService.handleTicketCallback(
                { id: 'cb_m1', data: 'agy_sm:12:gemini-4-neon-xhigh', from: { id: 555, first_name: 'Raul' }, message: { chat: { id: 555 }, message_id: 10 } },
                tgHelpers,
                { tgUser: adminUser, effPerms: adminPerms }
            );
            assert.strictEqual(cbPick, true);
            assert.strictEqual(ticket12.agy_model, 'gemini-4-neon-xhigh');
            assert.ok(editedMarkups.some((m) => JSON.stringify(m.markup).includes('Neon XHigh')));

            // Cambiar modelo global con /modelo opus
            const handledModelCmd = await ticketTelegramAgyService.handleTicketTextCommand(555, '/modelo opus', adminUser, adminPerms, tgHelpers);
            assert.strictEqual(handledModelCmd, true);
            assert.strictEqual(settingsRow.default_model, 'claude-opus-5-5-high');

            // Cambiar modelo puntual con /modelo ADM-0012 neon-high
            const handledTicketModelCmd = await ticketTelegramAgyService.handleTicketTextCommand(555, '/modelo ADM-0012 neon-high', adminUser, adminPerms, tgHelpers);
            assert.strictEqual(handledTicketModelCmd, true);
            assert.strictEqual(ticket12.agy_model, 'gemini-4-neon-high');

            // Resolver ticket
            const handledCb = await ticketTelegramAgyService.handleTicketCallback(
                { id: 'cb1', data: 'ticket_resolve:12', from: { id: 555, first_name: 'Raul' }, message: { chat: { id: 555 }, message_id: 10 } },
                tgHelpers,
                { tgUser: adminUser, effPerms: adminPerms }
            );
            assert.strictEqual(handledCb, true);
            assert.strictEqual(ticket12.status, 'resuelto');
            assert.ok(answeredCallbacks.some((c) => c.text.includes('Resuelto')));
        } finally {
            dbModule.getAccountingDb = origGetAccountingDb;
            dbModule.getDb = origGetDb;
        }
    });
});
