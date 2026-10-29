const express = require('express');
const router = express.Router();
const { authenticateToken, requirePermission, isAdminUser } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const growthService = require('../services/businessGrowthAgyService');

const crecimientoViewPerms = [
    '/dashboard/finanzas/crecimiento',
    'manage_finanzas_crecimiento',
    '/dashboard/finanzas/asesor',
    'manage_finanzas_asesor',
    'view_direccion_estrategica'
];

const crecimientoManagePerms = [
    'manage_finanzas_crecimiento',
    '/dashboard/finanzas/crecimiento'
];

// GET /api/finanzas/crecimiento/contexto
router.get('/contexto', authenticateToken, requirePermission(crecimientoViewPerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        await growthService.ensureCrecimientoSchema(db);
        const empresaId = req.query.empresa_id || null;

        const [snapshot, agyStatus, [statsRows]] = await Promise.all([
            growthService.buildEnterpriseGrowthSnapshot(db, { empresaId }),
            growthService.getAgyServerStatus(),
            db.query(`
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN fijado = 1 THEN 1 ELSE 0 END) AS fijados,
                    SUM(CASE WHEN origen IN ('auto_conversacion', 'auto_sistema', 'auto_graphify') THEN 1 ELSE 0 END) AS auto_construidos
                FROM finanzas_conocimiento
                WHERE activo = 1
            `)
        ]);

        const simulacionDefault = growthService.simulateCorporateGrowthScenario({
            deuda_actual_usd: snapshot.deuda.saldo_total_usd > 100000 ? snapshot.deuda.saldo_total_usd : 5000000,
            tasa_actual_pct: snapshot.deuda.tasa_ponderada_anual_pct > 0 ? snapshot.deuda.tasa_ponderada_anual_pct : 9.25
        });

        const st = statsRows?.[0] || {};
        res.json({
            success: true,
            snapshot,
            simulacion_default: simulacionDefault,
            agy_status: agyStatus,
            categorias_conocimiento: growthService.KNOWLEDGE_CATEGORIES,
            stats_conocimiento: {
                total: Number(st.total || 0),
                fijados: Number(st.fijados || 0),
                auto_construidos: Number(st.auto_construidos || 0)
            }
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar contexto de Crecimiento Empresarial');
    }
});

// POST /api/finanzas/crecimiento/simular
router.post('/simular', authenticateToken, requirePermission(crecimientoViewPerms), async (req, res) => {
    try {
        const result = growthService.simulateCorporateGrowthScenario(req.body || {});
        let savedNode = null;

        if (req.body?.guardar_conocimiento) {
            const db = growthService.resolveDb();
            await growthService.ensureCrecimientoSchema(db);
            const p = result.parametros;
            const r = result.resultados;
            const titulo = String(req.body.titulo_escenario || `Escenario Consolidado $${(p.monto_consolidado_usd / 1000000).toFixed(1)}M @ ${p.nueva_tasa_pct}% (${p.nuevo_plazo_meses}m)`).slice(0, 210);
            const resumen = `Cuota gracia: $${r.cuota_total_durante_gracia_usd.toLocaleString('en-US')}/mes | Estabilizada: $${r.cuota_total_estabilizada_usd.toLocaleString('en-US')}/mes | DSCR: ${r.dscr_estabilizado}x | Escudo fiscal: $${r.ahorro_fiscal_total_anual_usd.toLocaleString('en-US')}/año.`;
            const contenido = `Escenario financiero simulado y guardado: Consolidación de $${p.deuda_actual_usd.toLocaleString('en-US')} de deuda actual + $${p.capex_granja_usd.toLocaleString('en-US')} CapEx Granja Avícola = $${p.monto_consolidado_usd.toLocaleString('en-US')} al ${p.nueva_tasa_pct}% anual por ${p.nuevo_plazo_meses} meses con ${p.meses_gracia_granja} meses de gracia. DSCR durante gracia: ${r.dscr_durante_gracia}x; DSCR estabilizado: ${r.dscr_estabilizado}x (${r.viabilidad}). Escudo fiscal total anual estimado: $${r.ahorro_fiscal_total_anual_usd.toLocaleString('en-US')}. Flujo libre anual post-deuda: $${r.flujo_libre_anual_post_deuda_usd.toLocaleString('en-US')}.`;

            const [ins] = await db.query(
                `INSERT INTO finanzas_conocimiento
                 (categoria, titulo, contenido, resumen_ejecutivo, etiquetas, origen, confianza, fijado, activo, metricas_json, created_by)
                 VALUES ('deuda_capital', ?, ?, ?, 'simulacion,10m,granja,holding,dscr', 'manual', 0.98, 1, 1, ?, ?)`,
                [titulo, contenido, resumen, JSON.stringify(result), req.user?.id || null]
            );
            savedNode = { id: ins.insertId, titulo };
        }

        res.json({ success: true, ...result, saved_knowledge: savedNode });
    } catch (error) {
        sendSafeError(res, error, 'Error al ejecutar simulación financiera');
    }
});

// GET /api/finanzas/crecimiento/graphify
router.get('/graphify', authenticateToken, requirePermission(crecimientoViewPerms), async (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const result = growthService.queryGraphifyContext(q, 16);
        res.json({ success: true, ...result });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar grafo Graphify');
    }
});

// =========================================================
// --- BASE DE CONOCIMIENTOS AUTOCONSTRUIBLE (AUTO-BUILD) ---
// =========================================================

// GET /api/finanzas/crecimiento/conocimiento
router.get('/conocimiento', authenticateToken, requirePermission(crecimientoViewPerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        await growthService.ensureCrecimientoSchema(db);
        const { categoria, origen, fijado, search, incluir_inactivos } = req.query;

        let sql = 'SELECT * FROM finanzas_conocimiento WHERE 1=1';
        const params = [];

        if (!incluir_inactivos) {
            sql += ' AND activo = 1';
        }
        if (categoria && categoria !== 'todas') {
            sql += ' AND categoria = ?';
            params.push(categoria);
        }
        if (origen && origen !== 'todos') {
            sql += ' AND origen = ?';
            params.push(origen);
        }
        if (fijado === '1' || fijado === 'true') {
            sql += ' AND fijado = 1';
        }
        if (search && String(search).trim()) {
            const s = `%${String(search).trim()}%`;
            sql += ' AND (titulo LIKE ? OR contenido LIKE ? OR etiquetas LIKE ? OR resumen_ejecutivo LIKE ?)';
            params.push(s, s, s, s);
        }

        sql += ' ORDER BY fijado DESC, updated_at DESC LIMIT 200';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows || [] });
    } catch (error) {
        sendSafeError(res, error, 'Error al obtener base de conocimientos');
    }
});

// POST /api/finanzas/crecimiento/conocimiento/auto-build
router.post('/conocimiento/auto-build', authenticateToken, requirePermission(crecimientoManagePerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        const result = await growthService.autoBuildKnowledgeFromEcosystem(db, {
            empresaId: req.body?.empresa_id || null,
            userId: req.user?.id || null
        });
        res.json({
            success: true,
            message: `Auto-Build completado: ${result.upserted_count} nodos estratégicos sincronizados con datos reales y Graphify.`,
            ...result
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al ejecutar Auto-Build de conocimientos');
    }
});

// POST /api/finanzas/crecimiento/conocimiento
router.post('/conocimiento', authenticateToken, requirePermission(crecimientoManagePerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        await growthService.ensureCrecimientoSchema(db);
        const { categoria, titulo, contenido, resumen_ejecutivo, etiquetas, fijado, empresa_id } = req.body || {};

        if (!titulo || !String(titulo).trim() || !contenido || !String(contenido).trim()) {
            return res.status(400).json({ message: 'Título y contenido son requeridos' });
        }

        const safeCat = growthService.KNOWLEDGE_CATEGORIES.some((c) => c.id === categoria)
            ? categoria
            : 'estrategia_crecimiento';
        const cleanTitle = String(titulo).trim().slice(0, 215);
        const cleanBody = String(contenido).trim();
        const cleanSummary = String(resumen_ejecutivo || cleanBody.slice(0, 240)).trim().slice(0, 490);
        const cleanTags = String(etiquetas || 'manual,estrategia').trim().slice(0, 290);

        const [ins] = await db.query(
            `INSERT INTO finanzas_conocimiento
             (categoria, titulo, contenido, resumen_ejecutivo, etiquetas, origen, confianza, fijado, activo, empresa_id, created_by)
             VALUES (?, ?, ?, ?, ?, 'manual', 1.00, ?, 1, ?, ?)`,
            [safeCat, cleanTitle, cleanBody, cleanSummary, cleanTags, fijado === false || fijado === 0 ? 0 : 1, empresa_id || null, req.user?.id || null]
        );

        res.status(201).json({
            success: true,
            id: ins.insertId,
            message: 'Conocimiento estratégico guardado exitosamente'
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al guardar conocimiento');
    }
});

// PUT /api/finanzas/crecimiento/conocimiento/:id
router.put('/conocimiento/:id', authenticateToken, requirePermission(crecimientoManagePerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        await growthService.ensureCrecimientoSchema(db);
        const { id } = req.params;
        const [rows] = await db.query('SELECT * FROM finanzas_conocimiento WHERE id = ? LIMIT 1', [id]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ message: 'Registro de conocimiento no encontrado' });
        }
        const curr = rows[0];
        const nextCat = req.body.categoria && growthService.KNOWLEDGE_CATEGORIES.some((c) => c.id === req.body.categoria)
            ? req.body.categoria
            : curr.categoria;
        const nextTitle = req.body.titulo !== undefined ? String(req.body.titulo).trim().slice(0, 215) : curr.titulo;
        const nextBody = req.body.contenido !== undefined ? String(req.body.contenido).trim() : curr.contenido;
        const nextSummary = req.body.resumen_ejecutivo !== undefined
            ? String(req.body.resumen_ejecutivo).trim().slice(0, 490)
            : curr.resumen_ejecutivo;
        const nextTags = req.body.etiquetas !== undefined ? String(req.body.etiquetas).trim().slice(0, 290) : curr.etiquetas;
        const nextFijado = req.body.fijado !== undefined ? (req.body.fijado ? 1 : 0) : curr.fijado;
        const nextActivo = req.body.activo !== undefined ? (req.body.activo ? 1 : 0) : curr.activo;

        await db.query(
            `UPDATE finanzas_conocimiento
             SET categoria = ?, titulo = ?, contenido = ?, resumen_ejecutivo = ?, etiquetas = ?, fijado = ?, activo = ?
             WHERE id = ?`,
            [nextCat, nextTitle, nextBody, nextSummary, nextTags, nextFijado, nextActivo, id]
        );

        res.json({ success: true, message: 'Conocimiento actualizado correctamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar conocimiento');
    }
});

// DELETE /api/finanzas/crecimiento/conocimiento/:id
router.delete('/conocimiento/:id', authenticateToken, requirePermission(crecimientoManagePerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        await growthService.ensureCrecimientoSchema(db);
        await db.query('DELETE FROM finanzas_conocimiento WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Conocimiento eliminado correctamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar conocimiento');
    }
});

// =========================================================
// --- CONVERSACIONES Y PUENTE CONSOLA AGY EN SERVIDOR ---
// =========================================================

// GET /api/finanzas/crecimiento/conversaciones
router.get('/conversaciones', authenticateToken, requirePermission(crecimientoViewPerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        await growthService.ensureCrecimientoSchema(db);
        const [rows] = await db.query(`
            SELECT c.*,
                   (SELECT COUNT(*) FROM finanzas_conversacion_mensajes m WHERE m.conversacion_id = c.id) AS total_mensajes
            FROM finanzas_conversaciones c
            ORDER BY c.updated_at DESC
            LIMIT 60
        `);
        res.json({ success: true, data: rows || [] });
    } catch (error) {
        sendSafeError(res, error, 'Error al listar conversaciones');
    }
});

// GET /api/finanzas/crecimiento/conversaciones/:id
router.get('/conversaciones/:id', authenticateToken, requirePermission(crecimientoViewPerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        await growthService.ensureCrecimientoSchema(db);
        const [convRows] = await db.query('SELECT * FROM finanzas_conversaciones WHERE id = ? LIMIT 1', [req.params.id]);
        if (!convRows || convRows.length === 0) {
            return res.status(404).json({ message: 'Conversación no encontrada' });
        }
        const [msgs] = await db.query(
            'SELECT * FROM finanzas_conversacion_mensajes WHERE conversacion_id = ? ORDER BY id ASC',
            [req.params.id]
        );
        res.json({
            success: true,
            conversacion: convRows[0],
            mensajes: msgs || []
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar conversación');
    }
});

// POST /api/finanzas/crecimiento/conversaciones/mensaje
router.post('/conversaciones/mensaje', authenticateToken, requirePermission(crecimientoViewPerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        const result = await growthService.processGrowthConversationTurn(db, {
            conversacionId: req.body?.conversacion_id || null,
            titulo: req.body?.titulo || null,
            modo: req.body?.modo || 'consultoria_financiera',
            proyectoDestino: req.body?.proyecto_destino || 'sipeadmin',
            modeloIa: req.body?.modelo_ia || 'gemini-4-argon-high',
            empresaId: req.body?.empresa_id || null,
            mensaje: req.body?.mensaje || '',
            autoLearn: req.body?.auto_learn !== false,
            simulacionParams: req.body?.simulacion_params || null,
            user: req.user
        });
        res.json({ success: true, ...result });
    } catch (error) {
        if (String(error.message || '').includes('no puede estar vacío')) {
            return res.status(400).json({ message: error.message });
        }
        sendSafeError(res, error, 'Error al procesar mensaje con Estratega & AGY');
    }
});

// DELETE /api/finanzas/crecimiento/conversaciones/:id
router.delete('/conversaciones/:id', authenticateToken, requirePermission(crecimientoManagePerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        await growthService.ensureCrecimientoSchema(db);
        await db.query('DELETE FROM finanzas_conversaciones WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Conversación eliminada correctamente' });
    } catch (error) {
        sendSafeError(res, error, 'Error al eliminar conversación');
    }
});

// POST /api/finanzas/crecimiento/conversaciones/:id/agy-plan
router.post('/conversaciones/:id/agy-plan', authenticateToken, requirePermission(crecimientoManagePerms), async (req, res) => {
    try {
        if (!isAdminUser(req.user) && !(req.user?.permissions || []).includes('manage_finanzas_crecimiento')) {
            return res.status(403).json({ message: 'Permisos insuficientes para planificar en Consola AGY' });
        }
        const db = growthService.resolveDb();
        const result = await growthService.generateAgyServerPlan(db, req.params.id, {
            instruction: req.body?.instruction || '',
            model: req.body?.model || 'gemini-4-argon-high',
            proyectoDestino: req.body?.proyecto_destino || null,
            syncTicket: req.body?.sync_ticket !== false,
            user: req.user,
            io: req.io
        });
        res.json({
            success: true,
            message: 'Planificación AGY generada en el servidor y lista para revisión',
            ...result
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al generar Plan AGY en servidor');
    }
});

// POST /api/finanzas/crecimiento/conversaciones/:id/agy-execute
router.post('/conversaciones/:id/agy-execute', authenticateToken, async (req, res) => {
    try {
        // La ejecución de modificaciones de código en el servidor se restringe estrictamente a Administradores
        if (!isAdminUser(req.user)) {
            return res.status(403).json({
                message: 'Por seguridad, solo usuarios Administradores pueden aprobar y ejecutar modificaciones de AGY en el servidor.'
            });
        }
        const db = growthService.resolveDb();
        const result = await growthService.executeAgyServerPlan(db, req.params.id, {
            autoCommitPush: Boolean(req.body?.auto_commit_push),
            directInstruction: req.body?.direct_instruction || '',
            user: req.user,
            io: req.io
        });
        res.json({
            success: true,
            message: 'Ejecución de Plan AGY procesada en el servidor',
            ...result
        });
    } catch (error) {
        if (String(error.message || '').includes('Primero debes generar')) {
            return res.status(400).json({ message: error.message });
        }
        sendSafeError(res, error, 'Error al ejecutar Plan AGY en servidor');
    }
});

// POST /api/finanzas/crecimiento/conversaciones/:id/agy-reject
router.post('/conversaciones/:id/agy-reject', authenticateToken, requirePermission(crecimientoManagePerms), async (req, res) => {
    try {
        const db = growthService.resolveDb();
        const result = await growthService.rejectAgyServerPlan(db, req.params.id, {
            reason: req.body?.reason || '',
            user: req.user,
            io: req.io
        });
        res.json({ success: true, ...result });
    } catch (error) {
        sendSafeError(res, error, 'Error al denegar Plan AGY');
    }
});

module.exports = router;
