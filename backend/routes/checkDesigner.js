const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route GET /api/check-designer/formats
 * @desc Listar todos los formatos de cheque, opcionalmente filtrados por banco o estado.
 * @query {banco_id} Opcional. {banco_nombre} Opcional (descripción del banco). {is_active} Opcional ('true' o 'false').
 */
router.get('/formats', authenticateToken, async (req, res) => {
    const { banco_id, banco_nombre, is_active } = req.query;
    try {
        const db = getDb();
        let query = `
            SELECT cf.id, cf.name, cf.description, cf.banco_id, b.descripcion as banco_nombre,
                   cf.width, cf.height, cf.orientation, cf.margin_top, cf.margin_right,
                   cf.margin_bottom, cf.margin_left, cf.resolution, cf.printer_name,
                   cf.is_active, cf.design_json, cf.created_at, cf.updated_at
            FROM check_format cf
            LEFT JOIN bancos b ON cf.banco_id = b.id
            WHERE 1=1
        `;
        const params = [];

        if (banco_id) {
            query += ' AND cf.banco_id = ?';
            params.push(banco_id);
        }
        if (banco_nombre) {
            query += ' AND b.descripcion = ?';
            params.push(banco_nombre);
        }
        if (is_active !== undefined) {
            query += ' AND cf.is_active = ?';
            params.push(is_active === 'true' || is_active === true);
        }

        query += ' ORDER BY cf.name ASC';
        const [formats] = await db.query(query, params);
        res.json(formats);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar formatos de cheque', error: error.message });
    }
});

/**
 * @route POST /api/check-designer/formats
 * @desc Crear un nuevo formato de cheque.
 */
router.post('/formats', authenticateToken, async (req, res) => {
    const { name, banco_id, description, width, height, orientation, margin_top, margin_right, margin_bottom, margin_left, resolution, printer_name, design_json } = req.body;
    try {
        const db = getDb();

        // Validaciones básicas
        if (!name) return res.status(400).json({ message: 'El nombre del formato es requerido' });
        if (!design_json) return res.status(400).json({ message: 'El diseño JSON es requerido' });

        // Validar que el banco_id pertenezca a la empresa si se proporciona
        if (banco_id) {
            const [bancoRows] = await db.query('SELECT id FROM bancos WHERE id = ?', [banco_id]);
            if (bancoRows.length === 0) return res.status(400).json({ message: 'Banco no encontrado' });
        }

        const [result] = await db.query(
            'INSERT INTO check_format (name, banco_id, description, width, height, orientation, margin_top, margin_right, margin_bottom, margin_left, resolution, printer_name, design_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, banco_id || null, description, width || 152.4, height || 69.85, orientation || 'horizontal', margin_top || 0, margin_right || 0, margin_bottom || 0, margin_left || 0, resolution || 96, printer_name || null, JSON.stringify(design_json)]
        );

        res.status(201).json({ message: 'Formato de cheque creado exitosamente', id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'Ya existe un formato con ese nombre' });
        } else {
            res.status(500).json({ message: 'Error al crear formato de cheque', error: error.message });
        }
    }
});

/**
 * @route GET /api/check-designer/formats/:id
 * @desc Obtener un formato de cheque específico por su ID, incluyendo su diseño JSON.
 */
router.get('/formats/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        const [formats] = await db.query(
            `SELECT cf.id, cf.name, cf.description, cf.banco_id, b.descripcion as banco_nombre,
                    cf.width, cf.height, cf.orientation, cf.margin_top, cf.margin_right,
                    cf.margin_bottom, cf.margin_left, cf.resolution, cf.printer_name,
                    cf.is_active, cf.design_json, cf.created_at, cf.updated_at
             FROM check_format cf
             LEFT JOIN bancos b ON cf.banco_id = b.id
             WHERE cf.id = ?`,
            [id]
        );

        if (formats.length === 0) {
            return res.status(404).json({ message: 'Formato de cheque no encontrado' });
        }

        const format = formats[0];
        // Asegúrate de que design_json se devuelva como un objeto, no como una cadena.
        format.design_json = typeof format.design_json === 'string' ? JSON.parse(format.design_json) : format.design_json;

        res.json(format);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener formato de cheque', error: error.message });
    }
});

/**
 * @route PUT /api/check-designer/formats/:id
 * @desc Actualizar la configuración general de un formato de cheque (no el diseño JSON).
 */
router.put('/formats/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, banco_id, description, width, height, orientation, margin_top, margin_right, margin_bottom, margin_left, resolution, printer_name, is_active } = req.body;
    try {
        const db = getDb();

        // Validaciones básicas
        if (name !== undefined) {
            const [existing] = await db.query('SELECT id FROM check_format WHERE name = ? AND id != ?', [name, id]);
            if (existing.length > 0) return res.status(409).json({ message: 'Ya existe un formato con ese nombre' });
        }

        if (banco_id) {
            const [bancoRows] = await db.query('SELECT id FROM bancos WHERE id = ?', [banco_id]);
            if (bancoRows.length === 0) return res.status(400).json({ message: 'Banco no encontrado' });
        }

        const fieldsToUpdate = [];
        const values = [];

        // Dinámicamente construir la consulta solo con los campos proporcionados
        if (name !== undefined) { fieldsToUpdate.push('name = ?'); values.push(name); }
        if (banco_id !== undefined) { fieldsToUpdate.push('banco_id = ?'); values.push(banco_id || null); }
        if (description !== undefined) { fieldsToUpdate.push('description = ?'); values.push(description); }
        if (width !== undefined) { fieldsToUpdate.push('width = ?'); values.push(width); }
        if (height !== undefined) { fieldsToUpdate.push('height = ?'); values.push(height); }
        if (orientation !== undefined) { fieldsToUpdate.push('orientation = ?'); values.push(orientation); }
        if (margin_top !== undefined) { fieldsToUpdate.push('margin_top = ?'); values.push(margin_top); }
        if (margin_right !== undefined) { fieldsToUpdate.push('margin_right = ?'); values.push(margin_right); }
        if (margin_bottom !== undefined) { fieldsToUpdate.push('margin_bottom = ?'); values.push(margin_bottom); }
        if (margin_left !== undefined) { fieldsToUpdate.push('margin_left = ?'); values.push(margin_left); }
        if (resolution !== undefined) { fieldsToUpdate.push('resolution = ?'); values.push(resolution); }
        if (printer_name !== undefined) { fieldsToUpdate.push('printer_name = ?'); values.push(printer_name || null); }
        if (is_active !== undefined) { fieldsToUpdate.push('is_active = ?'); values.push(is_active); }

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
        }

        values.push(id);
        await db.query(`UPDATE check_format SET ${fieldsToUpdate.join(', ')} WHERE id = ?`, values);

        res.json({ message: 'Formato de cheque actualizado exitosamente' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ message: 'Ya existe un formato con ese nombre' });
        } else {
            res.status(500).json({ message: 'Error al actualizar formato de cheque', error: error.message });
        }
    }
});

/**
 * @route PATCH /api/check-designer/formats/:id/design
 * @desc Actualizar específicamente el diseño JSON de un formato.
 */
router.patch('/formats/:id/design', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { design_json } = req.body;

    if (!design_json) return res.status(400).json({ message: 'El diseño JSON es requerido' });

    try {
        const db = getDb();
        const [existing] = await db.query('SELECT id FROM check_format WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Formato de cheque no encontrado' });
        }

        await db.query('UPDATE check_format SET design_json = ? WHERE id = ?', [JSON.stringify(design_json), id]);

        res.json({ message: 'Diseño del formato actualizado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al actualizar el diseño del formato', error: error.message });
    }
});

/**
 * @route DELETE /api/check-designer/formats/:id
 * @desc Desactivar (borrado lógico) un formato de cheque.
 */
router.delete('/formats/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        const [existing] = await db.query('SELECT id FROM check_format WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'Formato de cheque no encontrado' });
        }

        await db.query('UPDATE check_format SET is_active = FALSE WHERE id = ?', [id]);
        res.json({ message: 'Formato de cheque desactivado exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al desactivar formato de cheque', error: error.message });
    }
});

// --- Calibración de Impresoras ---

/**
 * @route GET /api/check-designer/calibrations
 * @desc Listar todas las calibraciones de impresoras.
 */
router.get('/calibrations', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [calibrations] = await db.query('SELECT * FROM printer_calibration ORDER BY printer_name ASC');
        res.json(calibrations);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar calibraciones', error: error.message });
    }
});

/**
 * @route POST /api/check-designer/calibrations
 * @desc Crear o actualizar una calibración de impresora.
 */
router.post('/calibrations', authenticateToken, async (req, res) => {
    const { printer_name, offset_x, offset_y, scale } = req.body;
    try {
        const db = getDb();
        if (!printer_name) return res.status(400).json({ message: 'El nombre de la impresora es requerido' });

        // Usar UPSERT para crear o actualizar la calibración de una impresora específica
        await db.query(
            'INSERT INTO printer_calibration (printer_name, offset_x, offset_y, scale) VALUES (?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE offset_x = VALUES(offset_x), offset_y = VALUES(offset_y), scale = VALUES(scale)',
            [printer_name, offset_x || 0, offset_y || 0, scale || 1.00]
        );

        res.status(201).json({ message: 'Calibración guardada exitosamente' });
    } catch (error) {
        res.status(500).json({ message: 'Error al guardar calibración', error: error.message });
    }
});

/**
 * @route GET /api/check-designer/bancos
 * @desc Listar todos los bancos para poblar el selector al crear/editar formatos.
 */
router.get('/bancos', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        // Consolidar bancos: un banco existe una vez por empresa (bancos.empresa_id),
        // pero el formato es el mismo sin importar la empresa. Agrupamos por descripción
        // para que cada banco aparezca una sola vez en el selector.
        const [bancos] = await db.query(
            'SELECT MIN(b.id) as id, b.descripcion, COUNT(DISTINCT b.empresa_id) as num_empresas ' +
            'FROM bancos b ' +
            'GROUP BY b.descripcion ' +
            'ORDER BY b.descripcion ASC'
        );
        res.json(bancos);
    } catch (error) {
        res.status(500).json({ message: 'Error al cargar bancos', error: error.message });
    }
});

module.exports = router;
