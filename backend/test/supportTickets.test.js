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
});
