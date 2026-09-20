const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

/**
 * Helper to emit real-time socket events for task changes
 */
function emitTaskEvent(req, eventName, payload) {
    try {
        const io = req.app?.get('io') || req.io;
        if (io) {
            io.emit(eventName, payload);
        }
    } catch (err) {
        console.warn('[Tasks Socket] Warning emitting event:', err.message);
    }
}

/**
 * Helper to create a notification in DB and emit real-time event to the specific user
 */
async function createAndEmitNotification(req, { userId, type, title, message, data = {} }) {
    try {
        if (!userId) return null;
        const db = getDb();
        const [result] = await db.query(`
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES (?, ?, ?, ?, ?)
        `, [userId, type, title, message, JSON.stringify(data)]);

        const notification = {
            id: result.insertId,
            user_id: userId,
            type,
            title,
            message,
            data,
            is_read: false,
            created_at: new Date().toISOString()
        };

        const io = req.app?.get('io') || req.io;
        if (io) {
            io.to(`user_${userId}`).emit('notification:new', notification);
        }
        return notification;
    } catch (err) {
        console.warn('[Tasks Notification] Warning sending notification:', err.message);
        return null;
    }
}

/**
 * GET /api/tasks
 * List tasks with optional filters
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const {
            search,
            assigned_to,
            estado,
            prioridad,
            categoria,
            fecha_desde,
            fecha_hasta,
            solo_mias
        } = req.query;

        let query = `
            SELECT 
                t.*,
                DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(t.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                COALESCE(u1.nombre, u1.username) AS assigned_user_name,
                u1.username AS assigned_username,
                COALESCE(u2.nombre, u2.username) AS created_user_name,
                (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comments_count
            FROM tasks t
            LEFT JOIN users u1 ON t.assigned_to = u1.id
            LEFT JOIN users u2 ON t.created_by = u2.id
            WHERE 1=1
        `;

        const params = [];

        // If user explicitly asks for "solo_mias" or is non-admin and no other assigned_to filter
        if (solo_mias === 'true' || (req.user.role_id !== 1 && !assigned_to && solo_mias !== 'false')) {
            query += ' AND t.assigned_to = ?';
            params.push(req.user.id);
        } else if (assigned_to) {
            query += ' AND t.assigned_to = ?';
            params.push(assigned_to);
        }

        if (estado && estado !== 'todos') {
            query += ' AND t.estado = ?';
            params.push(estado);
        }

        if (prioridad && prioridad !== 'todas') {
            query += ' AND t.prioridad = ?';
            params.push(prioridad);
        }

        if (categoria && categoria !== 'todas') {
            query += ' AND t.categoria = ?';
            params.push(categoria);
        }

        if (fecha_desde) {
            query += ' AND t.fecha_vencimiento >= ?';
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            query += ' AND t.fecha_vencimiento <= ?';
            params.push(fecha_hasta);
        }

        if (search && search.trim()) {
            query += ' AND (t.titulo LIKE ? OR t.descripcion LIKE ?)';
            const term = `%${search.trim()}%`;
            params.push(term, term);
        }

        query += `
            ORDER BY 
                CASE t.estado
                    WHEN 'pendiente' THEN 1
                    WHEN 'en_proceso' THEN 2
                    WHEN 'en_revision' THEN 3
                    WHEN 'completada' THEN 4
                    WHEN 'cancelada' THEN 5
                    ELSE 6
                END ASC,
                t.orden ASC,
                t.fecha_vencimiento ASC,
                t.created_at DESC
        `;

        const [rows] = await db.query(query, params);

        // Normalize checklist JSON
        const tasks = rows.map(t => ({
            ...t,
            checklist: typeof t.checklist === 'string' ? JSON.parse(t.checklist) : (t.checklist || [])
        }));

        res.json(tasks);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar tareas');
    }
});

/**
 * GET /api/tasks/kpis/summary
 * KPI summary metrics
 */
router.get('/kpis/summary', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const { assigned_to, solo_mias } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (solo_mias === 'true' || (req.user.role_id !== 1 && !assigned_to && solo_mias !== 'false')) {
            whereClause += ' AND assigned_to = ?';
            params.push(req.user.id);
        } else if (assigned_to) {
            whereClause += ' AND assigned_to = ?';
            params.push(assigned_to);
        }

        const query = `
            SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN estado = 'en_proceso' THEN 1 ELSE 0 END) AS en_proceso,
                SUM(CASE WHEN estado = 'en_revision' THEN 1 ELSE 0 END) AS en_revision,
                SUM(CASE WHEN estado = 'completada' THEN 1 ELSE 0 END) AS completadas,
                SUM(CASE WHEN estado NOT IN ('completada', 'cancelada') AND fecha_vencimiento < CURDATE() THEN 1 ELSE 0 END) AS vencidas,
                SUM(CASE WHEN estado NOT IN ('completada', 'cancelada') AND fecha_vencimiento = CURDATE() THEN 1 ELSE 0 END) AS vence_hoy
            FROM tasks
            ${whereClause}
        `;

        const [rows] = await db.query(query, params);
        const stats = rows[0] || {};

        res.json({
            total: Number(stats.total) || 0,
            pendientes: Number(stats.pendientes) || 0,
            en_proceso: Number(stats.en_proceso) || 0,
            en_revision: Number(stats.en_revision) || 0,
            completadas: Number(stats.completadas) || 0,
            vencidas: Number(stats.vencidas) || 0,
            vence_hoy: Number(stats.vence_hoy) || 0
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener resumen de KPIs de tareas');
    }
});

/**
 * GET /api/tasks/:id
 * Retrieve single task with comments
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const taskId = req.params.id;

        const [tasks] = await db.query(`
            SELECT 
                t.*,
                DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(t.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                COALESCE(u1.nombre, u1.username) AS assigned_user_name,
                u1.username AS assigned_username,
                COALESCE(u2.nombre, u2.username) AS created_user_name,
                u2.username AS created_username
            FROM tasks t
            LEFT JOIN users u1 ON t.assigned_to = u1.id
            LEFT JOIN users u2 ON t.created_by = u2.id
            WHERE t.id = ?
        `, [taskId]);

        if (tasks.length === 0) {
            return res.status(404).json({ message: 'Tarea no encontrada' });
        }

        const task = tasks[0];
        task.checklist = typeof task.checklist === 'string' ? JSON.parse(task.checklist) : (task.checklist || []);

        // Fetch comments
        const [comments] = await db.query(`
            SELECT 
                tc.*,
                COALESCE(u.nombre, u.username) AS user_name,
                u.username
            FROM task_comments tc
            JOIN users u ON tc.user_id = u.id
            WHERE tc.task_id = ?
            ORDER BY tc.created_at ASC
        `, [taskId]);

        res.json({
            ...task,
            comments
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar detalle de tarea');
    }
});

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const {
            titulo,
            descripcion,
            tipo_plazo = 'dia_especifico',
            fecha_inicio,
            fecha_vencimiento,
            hora_limite,
            prioridad = 'media',
            categoria = 'General',
            assigned_to,
            checklist = []
        } = req.body;

        if (!titulo || !titulo.trim()) {
            return res.status(400).json({ message: 'El título de la tarea es obligatorio.' });
        }

        if (!assigned_to) {
            return res.status(400).json({ message: 'Debe asignar la tarea a un usuario.' });
        }

        if (!fecha_vencimiento) {
            return res.status(400).json({ message: 'La fecha de vencimiento es obligatoria.' });
        }

        const checklistJson = JSON.stringify(Array.isArray(checklist) ? checklist : []);

        const [result] = await db.query(`
            INSERT INTO tasks (
                titulo,
                descripcion,
                tipo_plazo,
                fecha_inicio,
                fecha_vencimiento,
                hora_limite,
                prioridad,
                estado,
                categoria,
                assigned_to,
                created_by,
                checklist
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?)
        `, [
            titulo.trim().toUpperCase(),
            descripcion ? descripcion.trim() : null,
            tipo_plazo,
            tipo_plazo === 'rango' && fecha_inicio ? fecha_inicio : null,
            fecha_vencimiento,
            hora_limite || null,
            prioridad,
            categoria || 'General',
            assigned_to,
            req.user.id,
            checklistJson
        ]);

        const newTaskId = result.insertId;

        // Fetch newly created task with user names
        const [rows] = await db.query(`
            SELECT 
                t.*,
                DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(t.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                COALESCE(u1.nombre, u1.username) AS assigned_user_name,
                COALESCE(u2.nombre, u2.username) AS created_user_name
            FROM tasks t
            LEFT JOIN users u1 ON t.assigned_to = u1.id
            LEFT JOIN users u2 ON t.created_by = u2.id
            WHERE t.id = ?
        `, [newTaskId]);

        const createdTask = {
            ...rows[0],
            checklist: Array.isArray(checklist) ? checklist : []
        };

        emitTaskEvent(req, 'tasks:changed', { action: 'created', task: createdTask });

        // Notify assigned user
        const creatorName = req.user.nombre || req.user.username || 'Un usuario';
        await createAndEmitNotification(req, {
            userId: assigned_to,
            type: 'task_assigned',
            title: 'Nueva Tarea Asignada',
            message: `${creatorName} te ha asignado: "${titulo.trim().toUpperCase()}"`,
            data: {
                taskId: newTaskId,
                link: '/dashboard/operaciones/tareas',
                priority: prioridad || 'media'
            }
        });

        res.status(201).json({
            message: 'Tarea creada con éxito',
            task: createdTask
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al crear la tarea');
    }
});

/**
 * PUT /api/tasks/:id
 * Full update of task
 */
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const taskId = req.params.id;
        const {
            titulo,
            descripcion,
            tipo_plazo = 'dia_especifico',
            fecha_inicio,
            fecha_vencimiento,
            hora_limite,
            prioridad = 'media',
            categoria = 'General',
            assigned_to,
            checklist
        } = req.body;

        if (!titulo || !titulo.trim()) {
            return res.status(400).json({ message: 'El título de la tarea es obligatorio.' });
        }

        if (!assigned_to) {
            return res.status(400).json({ message: 'Debe asignar la tarea a un usuario.' });
        }

        if (!fecha_vencimiento) {
            return res.status(400).json({ message: 'La fecha de vencimiento es obligatoria.' });
        }

        const checklistJson = checklist !== undefined 
            ? JSON.stringify(Array.isArray(checklist) ? checklist : [])
            : null;

        let updateQuery = `
            UPDATE tasks SET
                titulo = ?,
                descripcion = ?,
                tipo_plazo = ?,
                fecha_inicio = ?,
                fecha_vencimiento = ?,
                hora_limite = ?,
                prioridad = ?,
                categoria = ?,
                assigned_to = ?
        `;
        const params = [
            titulo.trim().toUpperCase(),
            descripcion ? descripcion.trim() : null,
            tipo_plazo,
            tipo_plazo === 'rango' && fecha_inicio ? fecha_inicio : null,
            fecha_vencimiento,
            hora_limite || null,
            prioridad,
            categoria || 'General',
            assigned_to
        ];

        if (checklistJson !== null) {
            updateQuery += ', checklist = ?';
            params.push(checklistJson);
        }

        updateQuery += ' WHERE id = ?';
        params.push(taskId);

        await db.query(updateQuery, params);

        const [rows] = await db.query(`
            SELECT 
                t.*,
                DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(t.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                COALESCE(u1.nombre, u1.username) AS assigned_user_name,
                COALESCE(u2.nombre, u2.username) AS created_user_name
            FROM tasks t
            LEFT JOIN users u1 ON t.assigned_to = u1.id
            LEFT JOIN users u2 ON t.created_by = u2.id
            WHERE t.id = ?
        `, [taskId]);

        const updatedTask = {
            ...rows[0],
            checklist: typeof rows[0]?.checklist === 'string' ? JSON.parse(rows[0].checklist) : (rows[0]?.checklist || [])
        };

        emitTaskEvent(req, 'tasks:changed', { action: 'updated', task: updatedTask });

        if (updatedTask.estado === 'completada' && updatedTask.created_by) {
            const completedByName = req.user.nombre || req.user.username || 'Un usuario';
            await createAndEmitNotification(req, {
                userId: updatedTask.created_by,
                type: 'task_completed',
                title: 'Tarea Finalizada',
                message: `${completedByName} ha completado la tarea: "${updatedTask.titulo}"`,
                data: {
                    taskId: updatedTask.id,
                    link: '/dashboard/operaciones/tareas'
                }
            });
        }

        res.json({
            message: 'Tarea actualizada con éxito',
            task: updatedTask
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar la tarea');
    }
});

/**
 * PATCH /api/tasks/:id/status
 * Fast status and order change (for Drag & Drop and quick actions)
 */
router.patch('/:id/status', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const taskId = req.params.id;
        const { estado, orden } = req.body;

        const validStatuses = ['pendiente', 'en_proceso', 'en_revision', 'completada', 'cancelada'];
        if (!validStatuses.includes(estado)) {
            return res.status(400).json({ message: 'Estado de tarea no válido.' });
        }

        let query = 'UPDATE tasks SET estado = ?';
        const params = [estado];

        if (estado === 'completada') {
            query += ', completada_en = NOW()';
        } else {
            query += ', completada_en = NULL';
        }

        if (orden !== undefined && orden !== null) {
            query += ', orden = ?';
            params.push(orden);
        }

        query += ' WHERE id = ?';
        params.push(taskId);

        await db.query(query, params);

        const [rows] = await db.query(`
            SELECT 
                t.*,
                DATE_FORMAT(t.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(t.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
                COALESCE(u1.nombre, u1.username) AS assigned_user_name,
                COALESCE(u2.nombre, u2.username) AS created_user_name
            FROM tasks t
            LEFT JOIN users u1 ON t.assigned_to = u1.id
            LEFT JOIN users u2 ON t.created_by = u2.id
            WHERE t.id = ?
        `, [taskId]);

        const updatedTask = {
            ...rows[0],
            checklist: typeof rows[0]?.checklist === 'string' ? JSON.parse(rows[0].checklist) : (rows[0]?.checklist || [])
        };

        emitTaskEvent(req, 'tasks:changed', { action: 'status_changed', task: updatedTask });

        if (estado === 'completada' && updatedTask.created_by) {
            const completedByName = req.user.nombre || req.user.username || 'Un usuario';
            await createAndEmitNotification(req, {
                userId: updatedTask.created_by,
                type: 'task_completed',
                title: 'Tarea Finalizada',
                message: `${completedByName} ha completado la tarea: "${updatedTask.titulo}"`,
                data: {
                    taskId: updatedTask.id,
                    link: '/dashboard/operaciones/tareas'
                }
            });
        }

        res.json({
            message: `Estado actualizado a ${estado}`,
            task: updatedTask
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar estado de la tarea');
    }
});

/**
 * PATCH /api/tasks/:id/checklist
 * Quick update of checklist items (marking subtasks)
 */
router.patch('/:id/checklist', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const taskId = req.params.id;
        const { checklist } = req.body;

        if (!Array.isArray(checklist)) {
            return res.status(400).json({ message: 'El checklist debe ser una lista de ítems.' });
        }

        await db.query('UPDATE tasks SET checklist = ? WHERE id = ?', [JSON.stringify(checklist), taskId]);

        emitTaskEvent(req, 'tasks:changed', { action: 'checklist_updated', taskId, checklist });

        res.json({
            message: 'Lista de verificación actualizada con éxito',
            checklist
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar checklist de la tarea');
    }
});

/**
 * DELETE /api/tasks/:id
 * Delete task (admin or creator)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const taskId = req.params.id;

        const [tasks] = await db.query('SELECT id, created_by, assigned_to FROM tasks WHERE id = ?', [taskId]);
        if (tasks.length === 0) {
            return res.status(404).json({ message: 'Tarea no encontrada' });
        }

        const task = tasks[0];
        // Allow deletion if Administrator, creator or assigned
        if (req.user.role_id !== 1 && req.user.role !== 'Administrator' && task.created_by !== req.user.id) {
            return res.status(403).json({ message: 'No tiene permisos para eliminar esta tarea.' });
        }

        await db.query('DELETE FROM tasks WHERE id = ?', [taskId]);

        emitTaskEvent(req, 'tasks:changed', { action: 'deleted', taskId });

        res.json({ message: 'Tarea eliminada con éxito' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar la tarea');
    }
});

/**
 * POST /api/tasks/:id/comments
 * Add comment to task
 */
router.post('/:id/comments', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const taskId = req.params.id;
        const { comentario } = req.body;

        if (!comentario || !comentario.trim()) {
            return res.status(400).json({ message: 'El comentario no puede estar vacío.' });
        }

        const [result] = await db.query(`
            INSERT INTO task_comments (task_id, user_id, comentario)
            VALUES (?, ?, ?)
        `, [taskId, req.user.id, comentario.trim()]);

        const [newComments] = await db.query(`
            SELECT 
                tc.*,
                COALESCE(u.nombre, u.username) AS user_name,
                u.username
            FROM task_comments tc
            JOIN users u ON tc.user_id = u.id
            WHERE tc.id = ?
        `, [result.insertId]);

        const createdComment = newComments[0];

        emitTaskEvent(req, 'tasks:comment_added', { taskId, comment: createdComment });

        // Notify other participant of the new comment
        try {
            const [tRows] = await db.query('SELECT created_by, assigned_to, titulo FROM tasks WHERE id = ?', [taskId]);
            if (tRows.length > 0) {
                const taskInfo = tRows[0];
                const commenterName = req.user.nombre || req.user.username || 'Un usuario';
                const targetUserId = req.user.id === taskInfo.assigned_to ? taskInfo.created_by : taskInfo.assigned_to;
                if (targetUserId && targetUserId !== req.user.id) {
                    await createAndEmitNotification(req, {
                        userId: targetUserId,
                        type: 'task_comment',
                        title: 'Nuevo Comentario en Tarea',
                        message: `${commenterName} comentó en "${taskInfo.titulo}": ${comentario.trim().substring(0, 70)}...`,
                        data: {
                            taskId,
                            link: '/dashboard/operaciones/tareas'
                        }
                    });
                }
            }
        } catch (notifErr) {
            console.warn('[Tasks Comment Notification] Warning:', notifErr.message);
        }

        res.status(201).json({
            message: 'Comentario agregado con éxito',
            comment: createdComment
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al agregar comentario a la tarea');
    }
});

module.exports = router;
