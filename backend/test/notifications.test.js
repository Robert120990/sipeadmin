const { describe, it } = require('node:test');
const assert = require('node:assert');

/**
 * Helper logic extracted for notification handling and formatting tests
 */
function formatNotificationPayload({ type, title, message, data, user_id }) {
    if (!type || !title || !message) {
        throw new Error('Type, title and message are mandatory');
    }
    return {
        user_id,
        type,
        title: title.trim(),
        message: message.trim(),
        data: data || {},
        is_read: false
    };
}

function calculateUnreadCount(notifications = []) {
    return notifications.filter(n => !n.is_read).length;
}

describe('Notifications System Unit Tests', () => {
    it('should correctly format notification payload', () => {
        const payload = formatNotificationPayload({
            user_id: 5,
            type: 'task_assigned',
            title: ' Nueva Tarea Asignada ',
            message: ' Administrador te ha asignado la tarea #10 ',
            data: { taskId: 10, link: '/dashboard/operaciones/tareas' }
        });

        assert.strictEqual(payload.user_id, 5);
        assert.strictEqual(payload.type, 'task_assigned');
        assert.strictEqual(payload.title, 'Nueva Tarea Asignada');
        assert.strictEqual(payload.message, 'Administrador te ha asignado la tarea #10');
        assert.strictEqual(payload.data.taskId, 10);
        assert.strictEqual(payload.is_read, false);
    });

    it('should throw error when required fields are missing', () => {
        assert.throws(() => {
            formatNotificationPayload({ type: 'task_assigned', title: '' });
        }, /Type, title and message are mandatory/);
    });

    it('should calculate unread counts accurately', () => {
        const list = [
            { id: 1, is_read: true },
            { id: 2, is_read: false },
            { id: 3, is_read: false },
            { id: 4, is_read: true },
            { id: 5, is_read: false }
        ];

        const unread = calculateUnreadCount(list);
        assert.strictEqual(unread, 3);
    });
});
