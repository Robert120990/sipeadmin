const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

function hasPermission(user, perm) {
    return user.role_id === 1 || (user.permissions && user.permissions.includes(perm));
}

router.get('/bitacora', authenticateToken, async (req, res) => {
    try {
        if (!hasPermission(req.user, 'view_bitacora')) {
            return res.status(403).json({ message: 'No tienes permiso para ver la bitácora' });
        }

        const db = getDb();
        const {
            page = 1,
            limit = 20,
            fecha_desde,
            fecha_hasta,
            username,
            accion,
            entidad
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        const conditions = [];
        const params = [];

        if (fecha_desde) {
            conditions.push('created_at >= ?');
            params.push(fecha_desde);
        }
        if (fecha_hasta) {
            conditions.push('created_at <= ?');
            params.push(fecha_hasta + ' 23:59:59');
        }
        if (username) {
            conditions.push('username LIKE ?');
            params.push(`%${username}%`);
        }
        if (accion) {
            conditions.push('accion = ?');
            params.push(accion);
        }
        if (entidad) {
            conditions.push('entidad = ?');
            params.push(entidad);
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total FROM bitacora_logs ${whereClause}`,
            params
        );

        const [rows] = await db.query(
            `SELECT * FROM bitacora_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...params, limitNum, offset]
        );

        res.json({
            data: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (err) {
        console.error('Error fetching bitacora:', err);
        res.status(500).json({ message: 'Error al obtener bitácora' });
    }
});

router.get('/bitacora/filtros', authenticateToken, async (req, res) => {
    try {
        if (!hasPermission(req.user, 'view_bitacora')) {
            return res.status(403).json({ message: 'No tienes permiso para ver la bitácora' });
        }

        const db = getDb();

        const [entidades] = await db.query(
            'SELECT DISTINCT entidad FROM bitacora_logs ORDER BY entidad'
        );
        const [acciones] = await db.query(
            "SELECT DISTINCT accion FROM bitacora_logs WHERE accion IN ('CREATE','UPDATE','DELETE') ORDER BY accion"
        );

        res.json({
            entidades: entidades.map(r => r.entidad),
            acciones: acciones.map(r => r.accion)
        });
    } catch (err) {
        console.error('Error fetching bitacora filters:', err);
        res.status(500).json({ message: 'Error al obtener filtros' });
    }
});

module.exports = router;
