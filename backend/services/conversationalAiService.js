const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const consultasModule = require('../routes/consultas');
const { getTanquesAutonomia } = require('./fuelIntelligence');

/**
 * Memoria conversacional en memoria por chat (ventana deslizante de últimos 8 turnos)
 * Clave: chatId -> Array<{ role: 'user' | 'model', parts: [{ text: string }], timestamp: number }>
 */
const conversationHistory = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Normalizar texto para comparaciones
 */
const normalizeStr = (str) => {
    return (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[¿?¡!,.;:()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Obtener clave de Gemini API (de BD, variable de entorno o fallback VPS, ignorando placeholders)
 */
const getGeminiApiKey = async () => {
    try {
        const { getGeminiApiKey: resolveBotGeminiKey } = require('./telegramGeminiService');
        if (typeof resolveBotGeminiKey === 'function') {
            return await resolveBotGeminiKey();
        }
    } catch (_) {
        // Fallback local
    }
    return (process.env.GEMINI_API_KEY || '').trim() || null;
};

/**
 * Limpiar sesiones inactivas
 */
const cleanExpiredSessions = () => {
    const now = Date.now();
    for (const [chatId, session] of conversationHistory.entries()) {
        const lastActivity = session.length > 0 ? session[session.length - 1].timestamp : 0;
        if (now - lastActivity > SESSION_TTL_MS) {
            conversationHistory.delete(chatId);
        }
    }
};

/**
 * Obtener cantidad de conversaciones activas en la ventana dada (por defecto 20 minutos)
 */
const getActiveConversationsCount = (windowMs = 20 * 60 * 1000) => {
    cleanExpiredSessions();
    const now = Date.now();
    let count = 0;
    for (const [, session] of conversationHistory.entries()) {
        const lastActivity = session.length > 0 ? session[session.length - 1].timestamp : 0;
        if (now - lastActivity <= windowMs) {
            count += 1;
        }
    }
    return count;
};

/**
 * Obtener historial formateado para la API de Gemini
 */
const getFormattedHistory = (chatId) => {
    cleanExpiredSessions();
    const history = conversationHistory.get(String(chatId)) || [];
    return history.map(item => ({
        role: item.role,
        parts: [{ text: item.text }]
    }));
};

/**
 * Guardar mensaje en el historial conversacional
 */
const appendToHistory = (chatId, role, text) => {
    const key = String(chatId);
    if (!conversationHistory.has(key)) {
        conversationHistory.set(key, []);
    }
    const session = conversationHistory.get(key);
    session.push({ role, text, timestamp: Date.now() });
    // Mantener sólo los últimos 8 mensajes
    if (session.length > 8) {
        session.shift();
    }
};

/**
 * Resetear conversación
 */
const clearConversation = (chatId) => {
    conversationHistory.delete(String(chatId));
};

/**
 * Registrar y automejorar alias en la base de datos
 */
const learnAlias = async (entityType, entityKey, rawAlias) => {
    const norm = normalizeStr(rawAlias);
    if (!norm || norm.length < 3) return;

    try {
        const db = getDb();
        if (!db) return;
        await db.query(`
            INSERT INTO telegram_aliases (entity_type, entity_key, alias, usage_count)
            VALUES (?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE usage_count = usage_count + 1
        `, [entityType, entityKey, norm]);
    } catch (e) {
        // Silenciosamente ignorar fallo de aprendizaje
    }
};

/**
 * Cargar alias conocidos desde la base de datos
 */
const loadDynamicAliases = async () => {
    try {
        const db = getDb();
        if (!db) return [];
        const [rows] = await db.query('SELECT entity_type, entity_key, alias FROM telegram_aliases ORDER BY usage_count DESC');
        return rows || [];
    } catch (_) {
        return [];
    }
};

/**
 * Construir contexto operativo completo del proyecto en tiempo real
 */
const buildLiveProjectContext = async (targetDate = null) => {
    // 1. Resolver fecha de ayer (cierres consolidados) y hoy
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterdayStr = d.toISOString().split('T')[0];
    const finalDate = targetDate || yesterdayStr;

    const context = {
        fecha_consulta: finalDate,
        estaciones_catalogo: [
            { id: '008', nombre: 'Puma Costa del Sol', alias: ['costa del sol', 'la costa', 'super 7 costa'] },
            { id: '002', nombre: 'Puma Miraflores', alias: ['miraflores', 'puma miraflores', 'e-market miraflores'] },
            { id: '006', nombre: 'Shell Chalchuapa', alias: ['chalchuapa', 'shell chalchuapa', 'santa ana'] },
            { id: '014', nombre: 'Puma La Loma (San Martín)', alias: ['la loma', 'san martin', 'san martín', 'loma'] },
            { id: '015', nombre: 'Shell 14 Avenida', alias: ['14 avenida', '14 ave', 'catorce avenida', 'shell 14'] },
            { id: '016', nombre: 'Shell Poliedro', alias: ['poliedro', 'shell poliedro'] }
        ],
        ventas_ayer: null,
        precios_competencia: null,
        bancos: null,
        chequeras: null,
        tanques_autonomia: null,
        alertas: null
    };

    // 2. Ventas y Tiendas
    try {
        const dataVentas = await consultasModule.getConsolidadoVentasData(finalDate);
        if (dataVentas) {
            context.ventas_ayer = {
                fecha: finalDate,
                resumen: {
                    total_galones: (dataVentas.estaciones || []).reduce((acc, e) => acc + Number(e.galonaje || 0), 0),
                    total_diesel: (dataVentas.estaciones || []).reduce((acc, e) => acc + Number(e.diesel || 0), 0),
                    total_regular: (dataVentas.estaciones || []).reduce((acc, e) => acc + Number(e.regular || 0), 0),
                    total_super: (dataVentas.estaciones || []).reduce((acc, e) => acc + Number(e.super || 0), 0),
                    total_ion: (dataVentas.estaciones || []).reduce((acc, e) => acc + Number(e.ion || 0), 0),
                    venta_combustible_usd: (dataVentas.estaciones || []).reduce((acc, e) => acc + Number(e.venta || 0), 0),
                    venta_tiendas_usd: (dataVentas.tiendas || []).reduce((acc, t) => acc + Number(t.venta || 0), 0)
                },
                estaciones: (dataVentas.estaciones || []).map(e => ({
                    id: e.id_empresa,
                    nombre: e.empresa,
                    diesel_gal: Number(e.diesel || 0),
                    regular_gal: Number(e.regular || 0),
                    super_gal: Number(e.super || 0),
                    ion_gal: Number(e.ion || 0),
                    total_gal: Number(e.galonaje || 0),
                    venta_usd: Number(e.venta || 0)
                })),
                tiendas: (dataVentas.tiendas || []).map(t => ({
                    nombre: t.empresa,
                    venta_usd: Number(t.venta || 0),
                    diferencia_corte: Number(t.dif || 0)
                }))
            };

            const totalAlertas = Number(dataVentas.auditoria?.total_alertas || 0);
            context.alertas = {
                total_alertas: totalAlertas,
                descuadres_pista: (dataVentas.resumen_cierre || []).filter(r => Math.abs(Number(r.diferencia || 0)) > 0.05),
                descuadres_tienda: (dataVentas.cortes_tienda || []).filter(t => Math.abs(Number(t.dif || 0)) > 0.01)
            };
        }
    } catch (e) {
        console.warn('[ConversationalAI] No se pudo cargar consolidado ventas:', e.message);
    }

    // 3. Bancos y Chequeras
    try {
        const { getSaldosBancosData, getSaldosChequeraData } = require('./telegramDataService');
        const bData = await getSaldosBancosData();
        const cData = await getSaldosChequeraData();
        context.bancos = {
            total_disponible_usd: bData.total,
            cuentas: (bData.cuentas || []).map(c => ({ banco: c.banco, cuenta: c.cuenta, saldo: c.saldo }))
        };
        context.chequeras = {
            total_chequera_usd: cData.total,
            cuentas: (cData.cuentas || []).map(c => ({ banco: c.banco, cuenta: c.cuenta, saldo: c.saldo }))
        };
    } catch (e) {
        console.warn('[ConversationalAI] No se pudo cargar bancos:', e.message);
    }

    // 4. Tanques Autonomía y Cobertura Logística
    try {
        const tanquesPayload = await getTanquesAutonomia();
        const tanquesList = Array.isArray(tanquesPayload)
            ? tanquesPayload
            : (Array.isArray(tanquesPayload?.tanques) ? tanquesPayload.tanques : []);
        context.tanques_autonomia = {
            fecha_corte: tanquesPayload?.fecha_ultimo_cierre || tanquesPayload?.fecha_corte || finalDate,
            resumen: tanquesPayload?.resumen || { total_tanques: tanquesList.length },
            tanques: tanquesList.map(t => ({
                estacion: t.estacion,
                combustible: t.tipo_combustible || t.combustible,
                stock_actual_gal: Number(t.stock_actual || 0),
                capacidad_gal: Number(t.capacidad || 0),
                ullage_disponible_gal: Number(t.ullage_disponible_gal || Math.max(0, Number(t.capacidad || 0) - Number(t.stock_actual || 0))),
                horas_autonomia: t.horas_autonomia ?? null,
                nivel_alerta: t.nivel_alerta || null,
                cobertura_logistica: t.cobertura_logistica || null,
                galones_en_ruta: Number(t.galones_en_ruta || 0)
            }))
        };
    } catch (e) {
        context.tanques_autonomia = { fecha_corte: finalDate, resumen: { total_tanques: 0 }, tanques: [] };
    }

    // 4.1 Pedidos de Combustible Portal Puma
    try {
        const { getPedidosPumaData } = require('./telegramDataService');
        const pedidosPuma = await getPedidosPumaData();
        context.pedidos_puma = {
            resumen: pedidosPuma?.resumen || { total_activos: 0, en_transito: 0, retenidos: 0, pendientes: 0 },
            ordenes_recientes: Array.isArray(pedidosPuma?.pedidos) ? pedidosPuma.pedidos.slice(0, 12) : []
        };
    } catch (e) {
        context.pedidos_puma = { resumen: { total_activos: 0, en_transito: 0, retenidos: 0, pendientes: 0 }, ordenes_recientes: [] };
    }

    // 5. Energía Solar y Baterías
    try {
        const { getSolarEstadoActual, getSolarAhorroMensual } = require('./solarEnergyService');
        const estadoSolar = await getSolarEstadoActual();
        const nowD = new Date();
        const ahorroMes = await getSolarAhorroMensual(nowD.getFullYear(), nowD.getMonth() + 1);
        context.energia_solar = {
            potencia_total_kwp: estadoSolar.potencia_total_kwp,
            capacidad_bateria_total_kwh: estadoSolar.capacidad_bateria_total_kwh,
            potencia_actual_estimada_kw: estadoSolar.potencia_actual_estimada_kw,
            bateria_promedio_soc_pct: estadoSolar.bateria_promedio_soc_pct,
            horas_autonomia_estimadas: estadoSolar.horas_autonomia_estimadas,
            ahorro_acumulado_mes_actual_usd: ahorroMes.total_ahorro_usd,
            generacion_mes_actual_kwh: ahorroMes.total_generacion_kwh,
            instalaciones: (estadoSolar.instalaciones || []).map(i => ({
                estacion: i.estacion_nombre,
                potencia_kwp: i.potencia_kwp,
                tiene_baterias: i.tiene_baterias === 1,
                capacidad_bateria_kwh: i.capacidad_bateria_kwh,
                bateria_soc_pct: i.bateria_soc_pct,
                horas_autonomia: i.horas_autonomia
            }))
        };
    } catch (e) {
        console.warn('[ConversationalAI] No se pudo cargar energia_solar:', e.message);
    }

    // 6. Análisis de Horas Pico de Venta
    try {
        const { getHorasPicoVentas } = require('./salesHourlyService');
        const peakData = await getHorasPicoVentas(finalDate);
        if (peakData) {
            context.horas_pico = {
                fecha: finalDate,
                hora_pico_principal: peakData.hora_pico,
                venta_hora_pico_usd: peakData.venta_hora_pico,
                transacciones_hora_pico: peakData.transacciones_hora_pico,
                pct_hora_pico: peakData.pct_hora_pico,
                top_3_horas: peakData.top_3_horas
            };
        }
    } catch (e) {
        console.warn('[ConversationalAI] No se pudo cargar horas_pico:', e.message);
    }

    // 7. Precios de la Competencia (DGEHM)
    try {
        const { getPreciosCompetenciaData } = require('./telegramDataService');
        const compData = await getPreciosCompetenciaData();
        if (compData && compData.totalMonitoreadas > 0) {
            context.precios_competencia = {
                ultima_validacion: compData.ultimaValidacion || compData.modificacionReciente,
                total_monitoreadas: compData.totalMonitoreadas,
                promedios_autoservicio: {
                    super: compData.promedios?.super_a,
                    regular: compData.promedios?.regular_a,
                    diesel: compData.promedios?.diesel_a
                },
                competidores_mas_baratos: (compData.competidoresMasBaratos || []).slice(0, 15).map(c => ({
                    zona: c.zona,
                    competidor: c.estacion,
                    marca: c.marca,
                    diferencias: c.cheaperFuels
                })),
                zonas: (compData.zonas || []).map(z => ({
                    id_estacion: z.id_estacion,
                    zona: z.zona,
                    propia: z.propia ? {
                        estacion: z.propia.estacion,
                        super_a: z.propia.super_a,
                        regular_a: z.propia.regular_a,
                        diesel_a: z.propia.diesel_a
                    } : null,
                    competidores: (z.competidores || []).map(c => ({
                        estacion: c.estacion,
                        marca: c.marca,
                        super_a: c.super_a,
                        regular_a: c.regular_a,
                        diesel_a: c.diesel_a,
                        mas_barato: c.isCheaper
                    }))
                }))
            };
        }
    } catch (e) {
        console.warn('[ConversationalAI] No se pudo cargar precios_competencia:', e.message);
    }

    return context;
};

/**
 * Procesar consulta conversacional con Gemini 2.0 Flash
 */
const askConversationalAgent = async ({ user, prompt, chatId, effectivePerms, extraSystemNote = null }) => {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        return null; // Fallback al motor semántico determinista
    }

    try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        const liveContext = await buildLiveProjectContext();

        // Aplicar restricciones de seguridad según los permisos efectivos del usuario
        if (effectivePerms) {
            if (!effectivePerms.ventas) delete liveContext.ventas_ayer;
            if (!effectivePerms.precios_competencia && !effectivePerms.ventas && !effectivePerms.alertas) delete liveContext.precios_competencia;
            if (!effectivePerms.saldos_banco) delete liveContext.bancos;
            if (!effectivePerms.saldos_chequera) delete liveContext.chequeras;
            if (!effectivePerms.alertas) delete liveContext.alertas;
            if (!effectivePerms.ventas && !effectivePerms.alertas) {
                delete liveContext.energia_solar;
                delete liveContext.tanques_autonomia;
                delete liveContext.pedidos_puma;
            }
            if (!effectivePerms.ventas) delete liveContext.horas_pico;
        }

        const history = chatId ? getFormattedHistory(chatId) : [];

        const userName = user?.first_name || user?.telegram_username || 'Director';

        const systemInstruction = `Eres "SIPE Asistente IA", el copiloto ejecutivo conversacional de la suite gerencial SIPE Admin para estaciones de servicio de combustible en El Salvador.
Tu interlocutor es ${userName}.
Tienes acceso en tiempo real a los números y operaciones de la empresa.

TU PERSONALIDAD:
- Ejecutiva, cálida, precisa, directa y accionable. Hablas en español salvadoreño formal y claro.
- Eres capaz de sostener una conversación fluida paso a paso. Recuerdas de qué hablaron en los mensajes anteriores.
- Si te hacen una pregunta de seguimiento (ej. "¿Y de regular?", "¿Y Miraflores?", "¿Cómo quedaron los bancos?"), sabes a qué se refiere el usuario gracias al historial.
- Si te saludan o te hacen una pregunta abierta, responde cordialmente, llama al usuario por su nombre y ofrécele 2 o 3 datos destacados reales del contexto (ej. estación líder en ventas, saldo en bancos o estado de tanques).

REGLAS DE DATOS Y PRECISIÓN ESTRICTA:
- Usa EXCLUSIVAMENTE los datos del CONTEXTO OPERATIVO REAL que te proporcionamos abajo. NUNCA inventes cifras ni supongas datos ausentes.
- Si un bloque fue omitido del contexto por permisos del usuario, indícalo con cortesía sin decir que el sistema falló.
- Si preguntan por ventas de "hoy" y aún no hay turnos cerrados para hoy, aclara que los turnos del día están en curso en pista y ofrece de inmediato el dato del último cierre consolidado (\`ventas_ayer\`) y/o el inventario actual en tanques (\`tanques_autonomia\`).
- Si te preguntan por un combustible específico (Diesel, Regular, Súper, Ion Diesel) o una estación (Costa del Sol, Miraflores, Chalchuapa, San Martín / La Loma, 14 Avenida o Poliedro), da el dato exacto con unidades (galones) e importe en dólares ($).
- TANQUES Y PEDIDOS PUMA: Usa \`tanques_autonomia\` y \`pedidos_puma\` para informar galones en stock, autonomía en horas (<24h crítico), espacio vacío (ullage) y si ya hay pipa en ruta o pedidos retenidos.
- PANELES SOLARES Y BATERÍAS: En la red existen 2 ubicaciones con generación fotovoltaica activa: Andelsa (55.0 kWp en paneles + sistema de almacenamiento en batería BESS de 60.0 kWh para respaldo de cargas críticas) y San Martín / La Loma (40.0 kWp en paneles On-Grid sin baterías). Potencia total instalada en la red: 95.0 kWp. Las demás estaciones no poseen paneles solares ni baterías. Usa siempre las cifras exactas de \`energia_solar\`.
- HORAS PICO DE VENTA: Menciona la hora pico principal, monto de venta y porcentaje sobre el total del día usando \`horas_pico\`.
- PRECIOS DE LA COMPETENCIA (DGEHM): Usa \`precios_competencia\` para comparar nuestras estaciones frente a competidores cercanos por zona (Texaco, Uno, DLC, Puma, Shell), indicando el precio en dólares por galón ($X.XX) y los centavos de diferencia frente a SIPE.
- Formatea SIEMPRE en HTML limpio compatible con Telegram: usa <b>negrita</b> para destacar cifras y nombres, <code>código</code> para montos/galonajes exactos y viñetas ordenadas. PROHIBIDO usar Markdown (\`**\` o \`###\`).
- Usa emojis con criterio gerencial (⛽, 🛢️, 🟢, 🔴, ⚡, ☀️, 🔋, ⏰, 🏦, 🛒, 🚨, 💵, 🏆, 🥇, 🚛).
${extraSystemNote ? `\nINSTRUCCIÓN ESPECIAL DE AUTOCORRECCIÓN:\n${extraSystemNote}\n` : ''}
CONTEXTO OPERATIVO REAL DE SIPE ADMIN:
${JSON.stringify(liveContext)}`;

        if (history.length > 0) {
            try {
                const { recordMultiTurnQuery } = require('./telegramAuditorService');
                recordMultiTurnQuery(chatId);
            } catch (_) {
                // Silencioso
            }
        }

        const contents = [
            ...history,
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents,
            config: {
                systemInstruction,
                temperature: 0.2
            }
        });

        const reply = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reply) return null;

        const cleanReply = reply.trim();
        // Guardar ambos turnos en la memoria de conversación (solo si hay sesión de chat activa)
        if (chatId) {
            appendToHistory(chatId, 'user', prompt);
            appendToHistory(chatId, 'model', cleanReply);
        }

        return cleanReply;
    } catch (err) {
        console.warn('[ConversationalAI] Error al generar respuesta con Gemini:', err.message);
        try {
            const { recordError } = require('./telegramAuditorService');
            recordError({
                type: 'AI_ERROR',
                message: err.message,
                stack: err.stack,
                userId: user?.telegram_user_id,
                chatId,
                query: prompt
            });
        } catch (_) {
            // Silencioso
        }
        return null;
    }
};

module.exports = {
    askConversationalAgent,
    buildLiveProjectContext,
    getFormattedHistory,
    appendToHistory,
    clearConversation,
    getActiveConversationsCount,
    learnAlias,
    loadDynamicAliases,
    getGeminiApiKey,
    normalizeStr
};
