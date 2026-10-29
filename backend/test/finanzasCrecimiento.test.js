const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const growthService = require('../services/businessGrowthAgyService');
const { JWT_SECRET } = require('../middleware/auth');
const crecimientoRouter = require('../routes/finanzasCrecimiento');

/**
 * In-memory MySQL mock tailored for Crecimiento Empresarial, Auto-Build Knowledge & Consola AGY
 */
function createInMemoryGrowthDb() {
    let kbIdSeq = 1;
    let convIdSeq = 1;
    let msgIdSeq = 1;

    const conocimientos = [];
    const conversaciones = [];
    const mensajes = [];
    const prestamos = [
        {
            id: 101,
            empresa_id: 1,
            empresa_nombre: 'SIPE Corporativo',
            numero_prestamo: 'PR-5M-001',
            descripcion: 'Crédito Sindicado Corporativo',
            monto_original: 5200000,
            tasa_interes_anual: 9.15,
            plazo_meses: 60,
            cuota_calculada: 104100,
            cuota_total: 104100,
            saldo_actual: 5000000
        }
    ];
    const proyectos = [
        {
            id: 201,
            empresa_id: 1,
            empresa_nombre: 'AgroCo & Andelsa',
            nombre_proyecto: 'Granja Avícola Tecnificada Fase I',
            inversion_inicial: 5000000,
            vpn_estimado: 1850000,
            tir_estimada: 21.4,
            roi_estimado: 37.0,
            payback_meses: 42
        }
    ];

    return {
        _state: { conocimientos, conversaciones, mensajes },
        async query(sql, params = []) {
            const norm = String(sql).replace(/\s+/g, ' ').trim();

            if (norm.startsWith('CREATE TABLE')) {
                return [{ affectedRows: 0 }];
            }

            if (norm.startsWith('INSERT IGNORE INTO finanzas_conocimiento')) {
                const [clave, categoria, titulo, contenido, resumen, etiquetas, origen, confianza, fijado] = params;
                if (!conocimientos.some((k) => k.clave === clave)) {
                    conocimientos.push({
                        id: kbIdSeq++,
                        clave,
                        categoria,
                        titulo,
                        contenido,
                        resumen_ejecutivo: resumen,
                        etiquetas,
                        origen,
                        confianza,
                        fijado,
                        activo: 1,
                        veces_usado: 0,
                        updated_at: new Date().toISOString()
                    });
                }
                return [{ affectedRows: 1 }];
            }

            if (norm.includes('ON DUPLICATE KEY UPDATE') && norm.includes('finanzas_conocimiento')) {
                const [clave, categoria, titulo, contenido, resumen, etiquetas, empresa_id, metricas_json, created_by] = params;
                const existing = conocimientos.find((k) => k.clave === clave);
                if (existing) {
                    existing.titulo = titulo;
                    existing.contenido = contenido;
                    existing.resumen_ejecutivo = resumen;
                    existing.etiquetas = etiquetas;
                    existing.metricas_json = metricas_json;
                    existing.updated_at = new Date().toISOString();
                    return [{ insertId: existing.id, affectedRows: 2 }];
                }
                const newId = kbIdSeq++;
                conocimientos.push({
                    id: newId,
                    clave,
                    categoria,
                    titulo,
                    contenido,
                    resumen_ejecutivo: resumen,
                    etiquetas,
                    origen: 'auto_sistema',
                    confianza: 0.96,
                    fijado: 1,
                    activo: 1,
                    empresa_id,
                    metricas_json,
                    created_by,
                    veces_usado: 0,
                    updated_at: new Date().toISOString()
                });
                return [{ insertId: newId, affectedRows: 1 }];
            }

            if (norm.startsWith('SELECT id FROM finanzas_conocimiento WHERE LOWER(titulo) = LOWER(?)')) {
                const t = String(params[0] || '').toLowerCase();
                const found = conocimientos.filter((k) => String(k.titulo).toLowerCase() === t);
                return [found];
            }

            if (norm.startsWith('INSERT INTO finanzas_conocimiento')) {
                const [categoria, titulo, contenido, resumen, etiquetas, origen, empresa_id, created_by] = params;
                const newId = kbIdSeq++;
                conocimientos.push({
                    id: newId,
                    clave: null,
                    categoria,
                    titulo,
                    contenido,
                    resumen_ejecutivo: resumen,
                    etiquetas,
                    origen: origen || 'auto_conversacion',
                    confianza: 0.90,
                    fijado: 1,
                    activo: 1,
                    empresa_id,
                    created_by,
                    veces_usado: 0,
                    updated_at: new Date().toISOString()
                });
                return [{ insertId: newId, affectedRows: 1 }];
            }

            if (norm.startsWith('UPDATE finanzas_conocimiento SET veces_usado')) {
                for (const id of params) {
                    const item = conocimientos.find((k) => k.id === id);
                    if (item) item.veces_usado += 1;
                }
                return [{ affectedRows: params.length }];
            }

            if (norm.startsWith('UPDATE finanzas_conocimiento SET contenido = ?')) {
                const [contenido, resumen, etiquetas, id] = params;
                const item = conocimientos.find((k) => k.id === id);
                if (item) {
                    item.contenido = contenido;
                    item.resumen_ejecutivo = resumen;
                    item.etiquetas = etiquetas;
                }
                return [{ affectedRows: 1 }];
            }

            if (norm.includes('FROM finanzas_conocimiento') && norm.includes('COUNT(*) AS total')) {
                const active = conocimientos.filter((k) => k.activo === 1);
                return [[{
                    total: active.length,
                    fijados: active.filter((k) => k.fijado === 1).length,
                    auto_construidos: active.filter((k) => ['auto_conversacion', 'auto_sistema', 'auto_graphify'].includes(k.origen)).length
                }]];
            }

            if (norm.includes('FROM finanzas_conocimiento')) {
                return [conocimientos.filter((k) => k.activo === 1)];
            }

            if (norm.includes('FROM prestamos p')) {
                return [prestamos];
            }

            if (norm.includes('FROM finanzas_proyectos_inversion p')) {
                return [proyectos];
            }

            if (norm.includes('FROM finanzas_planes_mantenimiento')) {
                return [[{ costo_estimado: 12500 }]];
            }

            if (norm.startsWith('INSERT INTO finanzas_conversaciones')) {
                const [titulo, modo, proyecto_destino, modelo_ia, empresa_id, created_by, created_by_name] = params;
                const newId = convIdSeq++;
                conversaciones.push({
                    id: newId,
                    titulo,
                    modo,
                    proyecto_destino,
                    modelo_ia,
                    empresa_id,
                    ticket_id: null,
                    ticket_code: null,
                    estado_agy: 'idle',
                    plan_markdown: null,
                    plan_version: 0,
                    execution_log: '',
                    archivos_relacionados: '[]',
                    created_by,
                    created_by_name,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
                return [{ insertId: newId, affectedRows: 1 }];
            }

            if (norm.startsWith('SELECT id FROM finanzas_conversaciones WHERE id = ?')) {
                const c = conversaciones.find((x) => x.id === Number(params[0]));
                return [c ? [{ id: c.id }] : []];
            }

            if (norm.startsWith('SELECT * FROM finanzas_conversaciones WHERE id = ?')) {
                const c = conversaciones.find((x) => x.id === Number(params[0]));
                return [c ? [c] : []];
            }

            if (norm.startsWith('UPDATE finanzas_conversaciones')) {
                const id = Number(params[params.length - 1]);
                const conv = conversaciones.find((x) => x.id === id);
                if (conv) {
                    if (norm.includes("estado_agy = 'planificando'")) {
                        conv.estado_agy = 'planificando';
                        conv.proyecto_destino = params[0];
                        conv.modelo_ia = params[1];
                        conv.plan_version = params[2];
                        conv.archivos_relacionados = params[3];
                        conv.execution_log = `${conv.execution_log || ''}\n${params[4]}`;
                    } else if (norm.includes("estado_agy = 'esperando_aprobacion'")) {
                        conv.estado_agy = 'esperando_aprobacion';
                        conv.plan_markdown = params[0];
                        conv.execution_log = `${conv.execution_log || ''}\n${params[3]}`;
                    } else if (norm.includes("estado_agy = 'ejecutando'")) {
                        conv.estado_agy = 'ejecutando';
                        conv.execution_log = `${conv.execution_log || ''}\n${params[0]}`;
                    } else if (norm.includes("estado_agy = 'denegado'")) {
                        conv.estado_agy = 'denegado';
                        conv.execution_log = `${conv.execution_log || ''}\n${params[0]}`;
                    } else if (norm.includes('SET estado_agy = ?')) {
                        conv.estado_agy = params[0];
                        conv.execution_log = `${conv.execution_log || ''}\n${params[1]}`;
                    } else if (norm.includes('SET archivos_relacionados = ?')) {
                        conv.archivos_relacionados = params[0];
                    }
                    conv.updated_at = new Date().toISOString();
                }
                return [{ affectedRows: 1 }];
            }

            if (norm.startsWith('INSERT INTO finanzas_conversacion_mensajes')) {
                const [conversacion_id, rol, autor, contenido, conocimientos_extraidos_json, metadata_json] = params;
                const newId = msgIdSeq++;
                mensajes.push({
                    id: newId,
                    conversacion_id: Number(conversacion_id),
                    rol,
                    autor,
                    contenido,
                    conocimientos_extraidos_json: conocimientos_extraidos_json || null,
                    metadata_json: metadata_json || null,
                    created_at: new Date().toISOString()
                });
                return [{ insertId: newId, affectedRows: 1 }];
            }

            if (norm.includes('FROM finanzas_conversacion_mensajes')) {
                const cid = Number(params[0]);
                const filtered = mensajes.filter((m) => m.conversacion_id === cid);
                return [norm.includes('ORDER BY id DESC') ? [...filtered].reverse() : filtered];
            }

            return [[]];
        }
    };
}

function httpJsonRequest(server, method, reqPath, { token = null, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const addr = server.address();
        const payload = body ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

        const req = http.request(
            {
                hostname: '127.0.0.1',
                port: addr.port,
                path: reqPath,
                method,
                headers
            },
            (res) => {
                let raw = '';
                res.on('data', (chunk) => { raw += chunk; });
                res.on('end', () => {
                    let parsed = null;
                    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
                    resolve({ status: res.statusCode, data: parsed });
                });
            }
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

describe('Finanzas - Crecimiento Empresarial, Auto-Build de Conocimientos & Consola AGY', () => {
    let mockDb;

    beforeEach(() => {
        mockDb = createInMemoryGrowthDb();
        growthService._setMockDb(mockDb);
        growthService._setMockAiClient(null);
    });

    afterEach(() => {
        growthService._setMockDb(undefined);
        growthService._setMockAiClient(undefined);
    });

    it('simulateCorporateGrowthScenario calcula correctamente consolidación $10M ($5M deuda + $5M granja) con gracia y escudos fiscales', () => {
        const sim = growthService.simulateCorporateGrowthScenario({
            deuda_actual_usd: 5000000,
            tasa_actual_pct: 9.25,
            plazo_actual_meses: 60,
            capex_granja_usd: 5000000,
            nueva_tasa_pct: 7.5,
            nuevo_plazo_meses: 120,
            meses_gracia_granja: 18,
            ebitda_actual_anual_usd: 1700000,
            ebitda_granja_anual_usd: 1300000,
            sinergia_andelsa_anual_usd: 250000,
            regalias_techco_anual_usd: 180000,
            tasa_isr_pct: 30
        });

        assert.equal(sim.parametros.monto_consolidado_usd, 10000000);
        // La cuota del tramo A refinanciado a 120m debe ser menor que la cuota vieja a 60m
        assert.ok(sim.resultados.cuota_tramo_a_refinanciamiento_usd < sim.resultados.cuota_mensual_actual_usd);
        // Durante gracia, la cuota total ($5M amortizando + $5M solo intereses) es menor que la cuota vieja de $5M a 5 años
        assert.ok(sim.resultados.cuota_total_durante_gracia_usd < sim.resultados.cuota_mensual_actual_usd);
        assert.ok(sim.resultados.ahorro_fiscal_total_anual_usd > 200000, 'Debe reflejar escudo fiscal por intereses + TechCo Decreto 741 + depreciación');
        assert.ok(sim.resultados.dscr_estabilizado >= 1.35, `DSCR estabilizado esperado >= 1.35x, obtenido: ${sim.resultados.dscr_estabilizado}`);
        assert.equal(sim.resultados.viabilidad, 'Alta (Bancable)');
    });

    it('queryGraphifyContext y findSmartRepoFiles localizan archivos reales desde graphify-out/graph.json', () => {
        const gRes = growthService.queryGraphifyContext('finanzas prestamos tickets');
        if (gRes.available) {
            assert.ok(gRes.summary.total_nodes > 100);
            assert.ok(gRes.matches.length > 0);
        }

        const repo = growthService.resolveTargetRepo('sipeadmin');
        assert.equal(repo.key, 'sipeadmin');
        const files = growthService.findSmartRepoFiles(repo, 'Quiero mejorar backend/routes/finanzas.js y préstamos');
        assert.ok(Array.isArray(files) && files.length > 0);
        assert.ok(files.includes('backend/routes/finanzas.js'));
    });

    it('ensureCrecimientoSchema y autoBuildKnowledgeFromEcosystem siembran y actualizan nodos de conocimiento institucional', async () => {
        const res = await growthService.autoBuildKnowledgeFromEcosystem(mockDb, { userId: 1 });
        assert.ok(res.upserted_count >= 3);
        assert.equal(res.snapshot.deuda.saldo_total_usd, 5000000);
        assert.equal(res.snapshot.inversiones.mejor_tir_pct, 21.4);

        // 6 semillas base + nodos auto-construidos
        assert.ok(mockDb._state.conocimientos.length >= 9);
    });

    it('processGrowthConversationTurn aprende reglas heurísticas del usuario y soporta ciclo completo AGY Plan -> Ejecutar / Denegar', async () => {
        const adminUser = { id: 1, username: 'admin', nombre: 'Raúl Admin', role_id: 1, role: 'Administrator' };

        const turn = await growthService.processGrowthConversationTurn(mockDb, {
            modo: 'consola_agy',
            proyectoDestino: 'sipeadmin',
            mensaje: 'Regla: Todo financiamiento mayor a $5M para la granja debe exigir al menos 18 meses de gracia de capital.',
            autoLearn: true,
            user: adminUser
        });

        assert.ok(turn.conversacion_id > 0);
        assert.ok(turn.reply_markdown.includes('Análisis de Crecimiento Empresarial'));
        assert.equal(turn.conocimientos_aprendidos.length, 1, 'Debe haber auto-construido 1 nodo de conocimiento desde la directriz del usuario');

        // Generar Plan AGY v1
        const plan = await growthService.generateAgyServerPlan(mockDb, turn.conversacion_id, {
            instruction: 'Agregar indicador de DSCR objetivo en el tablero de finanzas',
            syncTicket: false,
            user: adminUser
        });
        assert.equal(plan.estado_agy, 'esperando_aprobacion');
        assert.equal(plan.plan_version, 1);
        assert.ok(plan.plan_markdown.includes('Plan v1'));

        // Ejecutar Plan AGY aprobado
        const execRes = await growthService.executeAgyServerPlan(mockDb, turn.conversacion_id, {
            user: adminUser
        });
        assert.equal(execRes.estado_agy, 'completado');
    });

    it('Endpoints HTTP protegen ejecución AGY en servidor exigiendo JWT válido y rol Administrador (401 / 403 / 200)', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/finanzas/crecimiento', crecimientoRouter);

        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

        try {
            // 1. Sin token -> 401
            const unauth = await httpJsonRequest(server, 'POST', '/api/finanzas/crecimiento/conversaciones/1/agy-execute');
            assert.equal(unauth.status, 401);

            // 2. Usuario operador NO administrador -> 403 en ejecución de código en servidor
            const nonAdminToken = jwt.sign(
                { id: 25, username: 'analista', role_id: 3, role: 'Operador', permissions: ['/dashboard/finanzas/crecimiento'] },
                JWT_SECRET,
                { expiresIn: '10m' }
            );
            const forbidden = await httpJsonRequest(server, 'POST', '/api/finanzas/crecimiento/conversaciones/1/agy-execute', {
                token: nonAdminToken,
                body: {}
            });
            assert.equal(forbidden.status, 403);

            // 3. Usuario Administrador -> puede simular, crear hilo, planificar y ejecutar
            const adminToken = jwt.sign(
                { id: 1, username: 'admin', nombre: 'SuperAdmin', role_id: 1, role: 'Administrator' },
                JWT_SECRET,
                { expiresIn: '10m' }
            );

            const msgRes = await httpJsonRequest(server, 'POST', '/api/finanzas/crecimiento/conversaciones/mensaje', {
                token: adminToken,
                body: {
                    modo: 'consola_agy',
                    mensaje: 'Necesito evaluar un ajuste en indicadores de crecimiento empresarial'
                }
            });
            assert.equal(msgRes.status, 200);
            const convId = msgRes.data.conversacion_id;

            const planRes = await httpJsonRequest(server, 'POST', `/api/finanzas/crecimiento/conversaciones/${convId}/agy-plan`, {
                token: adminToken,
                body: { instruction: 'Añadir alerta de DSCR < 1.35x', sync_ticket: false }
            });
            assert.equal(planRes.status, 200);
            assert.equal(planRes.data.estado_agy, 'esperando_aprobacion');

            const execOk = await httpJsonRequest(server, 'POST', `/api/finanzas/crecimiento/conversaciones/${convId}/agy-execute`, {
                token: adminToken,
                body: { auto_commit_push: false }
            });
            assert.equal(execOk.status, 200);
            assert.equal(execOk.data.estado_agy, 'completado');
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
