const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

/**
 * GET /api/notifications
 * Get user's notifications (limit 50) and unread count
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [rows] = await db.query(`
            SELECT 
                id,
                user_id,
                type,
                title,
                message,
                data,
                is_read,
                created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `, [userId]);

        const [countRows] = await db.query(`
            SELECT COUNT(*) AS unreadCount
            FROM notifications
            WHERE user_id = ? AND is_read = 0
        `, [userId]);

        const unreadCount = countRows[0]?.unreadCount || 0;

        const notifications = rows.map(n => ({
            ...n,
            is_read: Boolean(n.is_read),
            data: typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {})
        }));

        res.json({
            notifications,
            unreadCount
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar notificaciones');
    }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
router.patch('/:id/read', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const notificationId = req.params.id;
        const userId = req.user.id;

        await db.query(`
            UPDATE notifications
            SET is_read = 1
            WHERE id = ? AND user_id = ?
        `, [notificationId, userId]);

        res.json({ message: 'Notificación marcada como leída' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar notificación');
    }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for current user
 */
router.patch('/read-all', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        await db.query(`
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = ? AND is_read = 0
        `, [userId]);

        res.json({ message: 'Todas las notificaciones marcadas como leídas' });
    } catch (error) {
        sendSafeError(res, error, 'Error al marcar todas las notificaciones como leídas');
    }
});

/**
 * DELETE /api/notifications/:id
 * Delete a specific notification
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const notificationId = req.params.id;
        const userId = req.user.id;

        await db.query(`
            DELETE FROM notifications
            WHERE id = ? AND user_id = ?
        `, [notificationId, userId]);

        res.json({ message: 'Notificación eliminada con éxito' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar notificación');
    }
});

/**
 * DELETE /api/notifications/clear-all
 * Clear all notifications for current user
 */
router.delete('/clear-all', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        await db.query(`
            DELETE FROM notifications
            WHERE user_id = ?
        `, [userId]);

        res.json({ message: 'Historial de notificaciones vaciado' });
    } catch (error) {
        sendSafeError(res, error, 'Error al vaciar notificaciones');
    }
});

module.exports = router;
