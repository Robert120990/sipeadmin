const express = require('express');
const router = express.Router();
const { getDb, getExternalDb } = require('../db');
const { authenticateToken, requirePermission, isAdminUser } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const {
    ensureMibotSchema,
    createMibotProgramacion,
    getActiveMibotSummaryByTaskIds,
    listMibotProgramaciones,
    setRealtimeIo
} = require('../services/mibotNotifierService');

router.use((req, _res, next) => {
    const io = req.app?.get('io') || req.io;
    if (io) setRealtimeIo(io);
    next();
});

const taskPerms = ['manage_tasks', '/dashboard/operaciones/tareas'];

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

const hasTaskManagePermission = (user) => {
    if (!user) return false;
    if (isAdminUser(user)) return true;
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    return taskPerms.some(p => perms.includes(p));
};

/**
 * GET /api/tasks/collaborators
 * Retrieve all active collaborators/users available for task assignment
 * Accessible to any authenticated user
 */
router.get('/collaborators', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        await ensureMibotSchema(db).catch(() => {});
        const [rows] = await db.query(`
            SELECT 
                u.id, 
                u.username, 
                u.nombre, 
                u.email, 
                u.status, 
                u.role_id, 
                r.name as role_name,
                tu.id AS telegram_usuario_id,
                tu.telegram_user_id,
                tu.telegram_username,
                tu.cargo AS telegram_cargo,
                tu.recibir_mibot,
                tu.mibot_tareas,
                tu.mibot_validaciones,
                tu.mibot_reuniones
            FROM users u 
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN telegram_usuarios tu ON tu.user_id = u.id AND tu.activo = 1
            WHERE u.status = 'active' OR u.status IS NULL
            ORDER BY COALESCE(NULLIF(u.nombre, ''), u.username) ASC
        `);
        res.json(rows);
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener colaboradores para asignación de tareas');
    }
});

/**
 * GET /api/tasks
 * List tasks with optional filters
 * Allows collaborators with task permissions to see team tasks, while restricting users without manage_tasks to their own tasks
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
        const canViewAllTasks = hasTaskManagePermission(req.user);

        // If "solo_mias" is true or the user lacks task management permissions, show only tasks assigned to or created by the current user
        if (solo_mias === 'true' || !canViewAllTasks) {
            query += ' AND (t.assigned_to = ? OR t.created_by = ?)';
            params.push(req.user.id, req.user.id);
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
        const mibotMap = await getActiveMibotSummaryByTaskIds(db, rows.map(r => r.id));

        // Normalize checklist JSON & attach MiBot summary
        const tasks = rows.map(t => ({
            ...t,
            checklist: typeof t.checklist === 'string' ? JSON.parse(t.checklist) : (t.checklist || []),
            mibot_summary: mibotMap.get(Number(t.id)) || null
        }));

        res.json(tasks);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar tareas');
    }
});

/**
 * Helper para construir y programar aviso MiBot vinculado a una tarea del tablero
 */
async function scheduleMibotForTask({ db, req, task, mibotConfig }) {
    if (!mibotConfig || !mibotConfig.enabled) return null;
    const destIds = Array.isArray(mibotConfig.destinatario_ids)
        ? mibotConfig.destinatario_ids.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0)
        : [];
    if (destIds.length === 0) return null;

    const tipo = ['TAREA', 'VALIDACION', 'REUNION', 'RECORDATORIO_PAGO'].includes(String(mibotConfig.tipo || '').toUpperCase())
        ? String(mibotConfig.tipo).toUpperCase()
        : 'TAREA';
    const prioLabel = String(task.prioridad || 'media').toUpperCase();
    const catLabel = task.categoria || 'General';
    const dueLabel = task.fecha_vencimiento || '';
    const horaLabel = task.hora_limite ? ` (${String(task.hora_limite).slice(0, 5)})` : '';
    const checklistArr = Array.isArray(task.checklist) ? task.checklist : [];
    const checklistTxt = checklistArr.length > 0
        ? `\n\nSub-tareas (${checklistArr.length}):\n` + checklistArr.map(c => `• ${c.texto}`).join('\n')
        : '';
    const extraMsg = mibotConfig.mensaje && String(mibotConfig.mensaje).trim()
        ? String(mibotConfig.mensaje).trim()
        : [
            task.descripcion ? String(task.descripcion).trim() : `Se te ha asignado la actividad "${task.titulo}".`,
            `Prioridad: ${prioLabel} · Categoría: ${catLabel}${dueLabel ? ` · Plazo: ${dueLabel}${horaLabel}` : ''}`,
            checklistTxt
        ].filter(Boolean).join('\n');

    const io = req.app?.get('io') || req.io || null;
    const externalDb = getExternalDb();

    return createMibotProgramacion({
        db,
        externalDb,
        payload: {
            tipo,
            titulo: mibotConfig.titulo ? String(mibotConfig.titulo).trim() : `Tarea #${task.id}: ${task.titulo}`,
            mensaje: extraMsg,
            task_id: task.id,
            ubicacion: catLabel,
            fecha_vencimiento: task.fecha_vencimiento || null,
            destinatario_ids: destIds,
            enviar_ahora: Boolean(mibotConfig.enviar_ahora),
            programado_para: mibotConfig.enviar_ahora ? undefined : mibotConfig.programado_para,
            frecuencia: mibotConfig.frecuencia || 'UNA_VEZ',
            prioridad: task.prioridad || 'media'
        },
        actorUser: req.user,
        io,
        skipSystemNotification: true
    });
}

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
        const canViewAllTasks = hasTaskManagePermission(req.user);

        if (solo_mias === 'true' || !canViewAllTasks) {
            whereClause += ' AND (assigned_to = ? OR created_by = ?)';
            params.push(req.user.id, req.user.id);
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
        if (!hasTaskManagePermission(req.user) && Number(task.created_by) !== Number(req.user.id) && Number(task.assigned_to) !== Number(req.user.id)) {
            return res.status(403).json({ message: 'No tiene permisos para ver esta tarea.' });
        }

        task.checklist = typeof task.checklist === 'string' ? JSON.parse(task.checklist) : (task.checklist || []);

        // Fetch comments & MiBot schedules
        const [commentsResult, mibotMap, mibotProgramaciones] = await Promise.all([
            db.query(`
                SELECT 
                    tc.*,
                    COALESCE(u.nombre, u.username) AS user_name,
                    u.username
                FROM task_comments tc
                JOIN users u ON tc.user_id = u.id
                WHERE tc.task_id = ?
                ORDER BY tc.created_at ASC
            `, [taskId]),
            getActiveMibotSummaryByTaskIds(db, [taskId]),
            listMibotProgramaciones(db, { taskId: Number(taskId), limit: 25 }).catch(() => [])
        ]);
        const [comments] = commentsResult;

        res.json({
            ...task,
            comments,
            mibot_summary: mibotMap.get(Number(taskId)) || null,
            mibot_programaciones: mibotProgramaciones || []
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar detalle de tarea');
    }
});

/**
 * POST /api/tasks
 * Create a new task (and optionally schedule/dispatch MiBot Telegram notification)
 */
router.post('/', authenticateToken, requirePermission(taskPerms), async (req, res) => {
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
            assigned_to_ids = [],
            checklist = [],
            mibot = null
        } = req.body;

        if (!titulo || !titulo.trim()) {
            return res.status(400).json({ message: 'El título de la tarea es obligatorio.' });
        }

        const rawExtraIds = Array.isArray(assigned_to_ids) ? assigned_to_ids : [];
        const assigneeIds = [...new Set(
            [assigned_to, ...rawExtraIds]
                .map(n => parseInt(n, 10))
                .filter(n => Number.isFinite(n) && n > 0)
        )];

        if (assigneeIds.length === 0) {
            return res.status(400).json({ message: 'Debe asignar la tarea al menos a un usuario.' });
        }

        if (!fecha_vencimiento) {
            return res.status(400).json({ message: 'La fecha de vencimiento es obligatoria.' });
        }

        const checklistJson = JSON.stringify(Array.isArray(checklist) ? checklist : []);
        const creatorName = req.user.nombre || req.user.username || 'Un usuario';

        // Mapear usuarios SIPE asignados -> su registro telegram_usuarios activo (si aplica)
        const userToTgIds = new Map();
        const selectedDestIds = Array.isArray(mibot?.destinatario_ids)
            ? [...new Set(mibot.destinatario_ids.map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0))]
            : [];
        const mappedTgIds = new Set();

        if (mibot && mibot.enabled && assigneeIds.length > 1 && selectedDestIds.length > 0) {
            const ph = assigneeIds.map(() => '?').join(',');
            const [tgRows] = await db.query(
                `SELECT id, user_id FROM telegram_usuarios
                 WHERE user_id IN (${ph}) AND activo = 1 AND COALESCE(recibir_mibot, 1) = 1`,
                assigneeIds
            ).catch(() => [[]]);
            for (const row of (tgRows || [])) {
                const uid = Number(row.user_id);
                const tgId = Number(row.id);
                if (selectedDestIds.includes(tgId)) {
                    if (!userToTgIds.has(uid)) userToTgIds.set(uid, []);
                    userToTgIds.get(uid).push(tgId);
                    mappedTgIds.add(tgId);
                }
            }
        }
        const extraUnmappedTgIds = selectedDestIds.filter(id => !mappedTgIds.has(id));

        const createdTasks = [];
        let firstMibotResult = null;
        let firstMibotStatusLabel = null;
        let totalMibotSent = 0;
        let totalMibotRecipients = 0;

        for (let idx = 0; idx < assigneeIds.length; idx++) {
            const targetUserId = assigneeIds[idx];

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
                targetUserId,
                req.user.id,
                checklistJson
            ]);

            const newTaskId = result.insertId;

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

            let createdTask = {
                ...rows[0],
                checklist: Array.isArray(checklist) ? checklist : []
            };

            let mibotResult = null;
            let mibotStatusLabel = null;
            if (mibot && mibot.enabled) {
                try {
                    let destsForThisTask = selectedDestIds;
                    if (assigneeIds.length > 1) {
                        const ownTgs = userToTgIds.get(targetUserId) || [];
                        destsForThisTask = idx === 0
                            ? [...new Set([...ownTgs, ...extraUnmappedTgIds])]
                            : ownTgs;
                    }

                    if (destsForThisTask.length > 0) {
                        mibotResult = await scheduleMibotForTask({
                            db,
                            req,
                            task: createdTask,
                            mibotConfig: { ...mibot, destinatario_ids: destsForThisTask }
                        });
                        if (!firstMibotResult) firstMibotResult = mibotResult;
                        if (mibotResult?.programacion) {
                            const mibotMap = await getActiveMibotSummaryByTaskIds(db, [newTaskId]);
                            createdTask = {
                                ...createdTask,
                                mibot_summary: mibotMap.get(Number(newTaskId)) || null
                            };
                            const destNames = (mibotResult.programacion.destinatarios || []).map(d => d.nombre_destinatario).join(', ');
                            if (mibotResult.dispatch) {
                                totalMibotSent += Number(mibotResult.dispatch.sent || 0);
                                totalMibotRecipients += Number(mibotResult.dispatch.total || 0);
                                mibotStatusLabel = `Enviado por Telegram (${mibotResult.dispatch.sent}/${mibotResult.dispatch.total}) a: ${destNames}`;
                            } else {
                                totalMibotRecipients += (mibotResult.programacion.destinatarios || []).length;
                                mibotStatusLabel = `Programado en MiBot Telegram para: ${destNames}`;
                            }
                            if (!firstMibotStatusLabel) firstMibotStatusLabel = mibotStatusLabel;
                        }
                    }
                } catch (mibotErr) {
                    console.warn('[Tasks MiBot] Aviso programando MiBot en creación de tarea:', mibotErr.message);
                }
            }

            emitTaskEvent(req, 'tasks:changed', { action: 'created', task: createdTask });

            const notificationData = {
                taskId: newTaskId,
                titulo: createdTask.titulo,
                descripcion: createdTask.descripcion || '',
                categoria: createdTask.categoria || 'General',
                priority: prioridad || 'media',
                prioridad: prioridad || 'media',
                fecha_vencimiento: createdTask.fecha_vencimiento,
                hora_limite: createdTask.hora_limite || null,
                assigned_to: Number(targetUserId),
                assigned_user_name: createdTask.assigned_user_name || 'Colaborador',
                created_by: Number(req.user.id),
                created_user_name: creatorName,
                mibot_status_label: mibotStatusLabel,
                link: '/dashboard/operaciones/tareas'
            };

            await createAndEmitNotification(req, {
                userId: targetUserId,
                type: 'task_assigned',
                title: 'Nueva Tarea / Actividad Asignada',
                message: `${creatorName} te ha asignado: "${titulo.trim().toUpperCase()}"`,
                data: notificationData
            });

            emitTaskEvent(req, 'tasks:assigned_card', {
                task: createdTask,
                mibot: mibotResult ? { programacion: mibotResult.programacion, dispatch: mibotResult.dispatch, label: mibotStatusLabel } : null,
                notificationData
            });

            createdTasks.push(createdTask);
        }

        const multiMibotSummary = assigneeIds.length > 1 && totalMibotRecipients > 0
            ? (totalMibotSent > 0
                ? `Enviado por Telegram (${totalMibotSent}/${totalMibotRecipients})`
                : `Programado en MiBot Telegram (${totalMibotRecipients} dest.)`)
            : firstMibotStatusLabel;

        res.status(201).json({
            message: createdTasks.length > 1
                ? `${createdTasks.length} tareas asignadas con éxito${multiMibotSummary ? ` · ${multiMibotSummary}` : ''}`
                : (multiMibotSummary
                    ? `Tarea creada con éxito · ${multiMibotSummary}`
                    : 'Tarea creada con éxito'),
            task: createdTasks[0],
            tasks: createdTasks,
            count: createdTasks.length,
            mibot: firstMibotResult
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al crear la tarea');
    }
});

/**
 * PUT /api/tasks/:id
 * Full update of task (and optionally schedule/dispatch MiBot Telegram notification)
 */
router.put('/:id', authenticateToken, requirePermission(taskPerms), async (req, res) => {
    try {
        const db = getDb();
        const taskId = req.params.id;

        const [existingTasks] = await db.query('SELECT id, created_by, assigned_to FROM tasks WHERE id = ?', [taskId]);
        if (existingTasks.length === 0) {
            return res.status(404).json({ message: 'Tarea no encontrada' });
        }

        const taskRow = existingTasks[0];
        if (!isAdminUser(req.user) && taskRow.created_by !== req.user.id && taskRow.assigned_to !== req.user.id) {
            return res.status(403).json({ message: 'No tiene permisos para modificar esta tarea.' });
        }

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
            checklist,
            mibot = null
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

        let updatedTask = {
            ...rows[0],
            checklist: typeof rows[0]?.checklist === 'string' ? JSON.parse(rows[0].checklist) : (rows[0]?.checklist || [])
        };

        let mibotResult = null;
        let mibotStatusLabel = null;
        if (mibot && mibot.enabled) {
            try {
                mibotResult = await scheduleMibotForTask({
                    db,
                    req,
                    task: updatedTask,
                    mibotConfig: mibot
                });
                if (mibotResult?.programacion) {
                    const destNames = (mibotResult.programacion.destinatarios || []).map(d => d.nombre_destinatario).join(', ');
                    mibotStatusLabel = mibotResult.dispatch
                        ? `Enviado por Telegram (${mibotResult.dispatch.sent}/${mibotResult.dispatch.total}) a: ${destNames}`
                        : `Programado en MiBot Telegram para: ${destNames}`;
                }
            } catch (mibotErr) {
                console.warn('[Tasks MiBot] Aviso programando MiBot en actualización de tarea:', mibotErr.message);
            }
        }

        const mibotMap = await getActiveMibotSummaryByTaskIds(db, [taskId]);
        updatedTask = {
            ...updatedTask,
            mibot_summary: mibotMap.get(Number(taskId)) || null
        };

        emitTaskEvent(req, 'tasks:changed', { action: 'updated', task: updatedTask });

        // Si cambió el responsable asignado o se solicitó aviso MiBot, enviar tarjeta informativa de asignación
        if (Number(taskRow.assigned_to) !== Number(assigned_to) || mibotResult) {
            const creatorName = req.user.nombre || req.user.username || 'Un usuario';
            const notificationData = {
                taskId: Number(taskId),
                titulo: updatedTask.titulo,
                descripcion: updatedTask.descripcion || '',
                categoria: updatedTask.categoria || 'General',
                priority: prioridad || 'media',
                prioridad: prioridad || 'media',
                fecha_vencimiento: updatedTask.fecha_vencimiento,
                hora_limite: updatedTask.hora_limite || null,
                assigned_to: Number(assigned_to),
                assigned_user_name: updatedTask.assigned_user_name || 'Colaborador',
                created_by: Number(req.user.id),
                created_user_name: creatorName,
                mibot_status_label: mibotStatusLabel,
                link: '/dashboard/operaciones/tareas'
            };

            await createAndEmitNotification(req, {
                userId: assigned_to,
                type: 'task_assigned',
                title: Number(taskRow.assigned_to) !== Number(assigned_to) ? 'Nueva Tarea / Actividad Asignada' : 'Tarea Actualizada y Agendada',
                message: `${creatorName} te ha asignado: "${updatedTask.titulo}"`,
                data: notificationData
            });

            emitTaskEvent(req, 'tasks:assigned_card', {
                task: updatedTask,
                mibot: mibotResult ? { programacion: mibotResult.programacion, dispatch: mibotResult.dispatch, label: mibotStatusLabel } : null,
                notificationData
            });
        }

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
            message: mibotStatusLabel
                ? `Tarea actualizada con éxito · ${mibotStatusLabel}`
                : 'Tarea actualizada con éxito',
            task: updatedTask,
            mibot: mibotResult
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

        const [existingTasks] = await db.query('SELECT id, created_by, assigned_to FROM tasks WHERE id = ?', [taskId]);
        if (existingTasks.length === 0) {
            return res.status(404).json({ message: 'Tarea no encontrada' });
        }

        const taskRow = existingTasks[0];
        if (!isAdminUser(req.user) && taskRow.created_by !== req.user.id && taskRow.assigned_to !== req.user.id) {
            return res.status(403).json({ message: 'No tiene permisos para cambiar el estado de esta tarea.' });
        }

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

        const [existingTasks] = await db.query('SELECT id, created_by, assigned_to FROM tasks WHERE id = ?', [taskId]);
        if (existingTasks.length === 0) {
            return res.status(404).json({ message: 'Tarea no encontrada' });
        }

        const taskRow = existingTasks[0];
        if (!isAdminUser(req.user) && taskRow.created_by !== req.user.id && taskRow.assigned_to !== req.user.id) {
            return res.status(403).json({ message: 'No tiene permisos para modificar la lista de verificación de esta tarea.' });
        }

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
router.delete('/:id', authenticateToken, requirePermission(taskPerms), async (req, res) => {
    try {
        const db = getDb();
        const taskId = req.params.id;

        const [tasks] = await db.query('SELECT id, created_by, assigned_to FROM tasks WHERE id = ?', [taskId]);
        if (tasks.length === 0) {
            return res.status(404).json({ message: 'Tarea no encontrada' });
        }

        const task = tasks[0];
        // Allow deletion if Administrator, creator or assigned
        if (!isAdminUser(req.user) && task.created_by !== req.user.id) {
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
router.post('/:id/comments', authenticateToken, requirePermission(taskPerms), async (req, res) => {
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
