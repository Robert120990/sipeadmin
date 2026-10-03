const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

const catalogosViewPerms = [
    'manage_catalogos',
    '/dashboard/carriers',
    '/dashboard/tankers',
    '/dashboard/operaciones/pedidos',
    'manage_pedidos'
];

// --- Carriers (Transportistas) ---
router.get('/carriers', authenticateToken, requirePermission(catalogosViewPerms), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query('SELECT * FROM carriers ORDER BY code');
        res.json(rows);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar transportistas'); 
    }
});

router.post('/carriers', authenticateToken, requirePermission(['manage_catalogos', '/dashboard/carriers']), async (req, res) => {
    const { code, description } = req.body;
    try {
        const db = getDb();
        await db.query('INSERT INTO carriers (code, description) VALUES (?, ?)', [code, description]);
        req.io.emit('carriers_updated');
        res.status(201).json({ message: 'Carrier created' });
    } catch (error) { 
        sendSafeError(res, error, 'Error al crear transportista'); 
    }
});

router.put('/carriers/:id', authenticateToken, requirePermission(['manage_catalogos', '/dashboard/carriers']), async (req, res) => {
    const { id } = req.params;
    const { code, description } = req.body;
    try {
        const db = getDb();
        await db.query('UPDATE carriers SET code = ?, description = ? WHERE id = ?', [code, description, id]);
        req.io.emit('carriers_updated');
        res.json({ message: 'Carrier updated' });
    } catch (error) { 
        sendSafeError(res, error, 'Error al actualizar transportista'); 
    }
});

router.delete('/carriers/:id', authenticateToken, requirePermission(['manage_catalogos', '/dashboard/carriers']), async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM carriers WHERE id = ?', [id]);
        req.io.emit('carriers_updated');
        res.json({ message: 'Carrier deleted' });
    } catch (error) { 
        sendSafeError(res, error, 'Error al eliminar transportista'); 
    }
});

// --- Tankers (Pipas) ---
router.get('/tankers', authenticateToken, requirePermission(catalogosViewPerms), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query(`
            SELECT t.*, c.code as carrier_code, c.description as carrier_desc 
            FROM tankers t 
            LEFT JOIN carriers c ON t.carrier_id = c.id 
            ORDER BY t.id DESC
        `);
        res.json(rows);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar pipas'); 
    }
});

router.post('/tankers', authenticateToken, requirePermission(['manage_catalogos', '/dashboard/tankers']), async (req, res) => {
    const { code, carrier_id, compartments } = req.body;
    try {
        const db = getDb();
        await db.query('INSERT INTO tankers (code, carrier_id, compartments) VALUES (?, ?, ?)', [code, carrier_id, JSON.stringify(compartments)]);
        req.io.emit('tankers_updated');
        res.status(201).json({ message: 'Tanker created' });
    } catch (error) { 
        sendSafeError(res, error, 'Error al crear pipa'); 
    }
});

router.put('/tankers/:id', authenticateToken, requirePermission(['manage_catalogos', '/dashboard/tankers']), async (req, res) => {
    const { id } = req.params;
    const { code, carrier_id, compartments } = req.body;
    try {
        const db = getDb();
        await db.query('UPDATE tankers SET code = ?, carrier_id = ?, compartments = ? WHERE id = ?', [code, carrier_id, JSON.stringify(compartments), id]);
        req.io.emit('tankers_updated');
        res.json({ message: 'Tanker updated' });
    } catch (error) { 
        sendSafeError(res, error, 'Error al actualizar pipa'); 
    }
});

router.delete('/tankers/:id', authenticateToken, requirePermission(['manage_catalogos', '/dashboard/tankers']), async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM tankers WHERE id = ?', [id]);
        req.io.emit('tankers_updated');
        res.json({ message: 'Tanker deleted' });
    } catch (error) { 
        sendSafeError(res, error, 'Error al eliminar pipa'); 
    }
});

module.exports = router;
