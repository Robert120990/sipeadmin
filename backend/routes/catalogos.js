const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// --- Carriers (Transportistas) ---
router.get('/carriers', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query('SELECT * FROM carriers ORDER BY code');
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching carriers' }); }
});

router.post('/carriers', authenticateToken, async (req, res) => {
    const { code, description } = req.body;
    try {
        const db = getDb();
        await db.query('INSERT INTO carriers (code, description) VALUES (?, ?)', [code, description]);
        req.io.emit('carriers_updated');
        res.status(201).json({ message: 'Carrier created' });
    } catch (error) { res.status(500).json({ message: 'Error creating carrier' }); }
});

router.put('/carriers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { code, description } = req.body;
    try {
        const db = getDb();
        await db.query('UPDATE carriers SET code = ?, description = ? WHERE id = ?', [code, description, id]);
        req.io.emit('carriers_updated');
        res.json({ message: 'Carrier updated' });
    } catch (error) { res.status(500).json({ message: 'Error updating carrier' }); }
});

router.delete('/carriers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM carriers WHERE id = ?', [id]);
        req.io.emit('carriers_updated');
        res.json({ message: 'Carrier deleted' });
    } catch (error) { res.status(500).json({ message: 'Error deleting carrier' }); }
});

// --- Tankers (Pipas) ---
router.get('/tankers', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query(`
            SELECT t.*, c.code as carrier_code, c.description as carrier_desc 
            FROM tankers t 
            LEFT JOIN carriers c ON t.carrier_id = c.id 
            ORDER BY t.id DESC
        `);
        res.json(rows);
    } catch (error) { res.status(500).json({ message: 'Error fetching tankers' }); }
});

router.post('/tankers', authenticateToken, async (req, res) => {
    const { code, carrier_id, compartments } = req.body;
    try {
        const db = getDb();
        await db.query('INSERT INTO tankers (code, carrier_id, compartments) VALUES (?, ?, ?)', [code, carrier_id, JSON.stringify(compartments)]);
        req.io.emit('tankers_updated');
        res.status(201).json({ message: 'Tanker created' });
    } catch (error) { res.status(500).json({ message: 'Error creating tanker' }); }
});

router.put('/tankers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { code, carrier_id, compartments } = req.body;
    try {
        const db = getDb();
        await db.query('UPDATE tankers SET code = ?, carrier_id = ?, compartments = ? WHERE id = ?', [code, carrier_id, JSON.stringify(compartments), id]);
        req.io.emit('tankers_updated');
        res.json({ message: 'Tanker updated' });
    } catch (error) { res.status(500).json({ message: 'Error updating tanker' }); }
});

router.delete('/tankers/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.query('DELETE FROM tankers WHERE id = ?', [id]);
        req.io.emit('tankers_updated');
        res.json({ message: 'Tanker deleted' });
    } catch (error) { res.status(500).json({ message: 'Error deleting tanker' }); }
});

module.exports = router;
