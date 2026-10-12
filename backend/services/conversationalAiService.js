const { GoogleGenAI } = require('@google/genai');
const { getDb } = require('../db');
const { getConsolidadoVentasData } = require('../routes/consultas');
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
 * Obtener clave de Gemini API (de BD o de variable de entorno)
 */
const getGeminiApiKey = async () => {
    try {
        const db = getDb();
        if (db) {
            const [rows] = await db.query('SELECT gemini_api_key FROM telegram_config WHERE id = 1 LIMIT 1');
            if (rows && rows.length > 0 && rows[0].gemini_api_key && rows[0].gemini_api_key.trim().length > 10) {
                return rows[0].gemini_api_key.trim();
            }
        }
    } catch (e) {
        // Base de datos puede estar ocupada o iniciando
    }
    return process.env.GEMINI_API_KEY || null;
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
            { id: '015', nombre: 'Shell 14 Avenida', alias: ['14 avenida', '14 ave', 'catorce avenida', 'shell 14'] }
        ],
        ventas_ayer: null,
        bancos: null,
        chequeras: null,
        tanques_autonomia: null,
        alertas: null
    };

    // 2. Ventas y Tiendas
    try {
        const dataVentas = await getConsolidadoVentasData(finalDate);
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
        const { getSaldosBancosData, getSaldosChequeraData } = require('./telegramBotService');
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

    // 4. Tanques Autonomía (si está disponible)
    try {
        const tanques = await getTanquesAutonomia();
        if (Array.isArray(tanques) && tanques.length > 0) {
            context.tanques_autonomia = tanques.map(t => ({
                estacion: t.estacion,
                combustible: t.tipo_combustible,
                stock_actual: t.stock_actual,
                capacidad: t.capacidad
            }));
        }
    } catch (e) {
        // Tanques opcionales
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

    return context;
};

/**
 * Procesar consulta conversacional con Gemini 2.0 Flash
 */
const askConversationalAgent = async ({ user, prompt, chatId, effectivePerms }) => {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        return null; // Fallback al motor semántico determinista
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const liveContext = await buildLiveProjectContext();

        // Aplicar restricciones de seguridad según los permisos efectivos del usuario
        if (effectivePerms) {
            if (!effectivePerms.ventas) delete liveContext.ventas_ayer;
            if (!effectivePerms.saldos_banco) delete liveContext.bancos;
            if (!effectivePerms.saldos_chequera) delete liveContext.chequeras;
            if (!effectivePerms.alertas) delete liveContext.alertas;
            if (!effectivePerms.ventas && !effectivePerms.alertas) delete liveContext.energia_solar;
            if (!effectivePerms.ventas) delete liveContext.horas_pico;
        }

        const history = getFormattedHistory(chatId);

        const userName = user?.first_name || user?.telegram_username || 'Director';

        const systemInstruction = `Eres "SIPE Asistente IA", el copiloto ejecutivo conversacional de la suite gerencial SIPE Admin para estaciones de servicio de combustible en El Salvador.
Tu interlocutor es ${userName}.
Tienes acceso en tiempo real a los números y operaciones de la empresa.

TU PERSONALIDAD:
- Ejecutiva, cálida, profesional, directa y conversacional. Hablas en español salvadoreño formal y claro.
- Eres capaz de sostener una conversación fluida paso a paso. Recuerdas de qué hablaron en los mensajes anteriores.
- Si te hacen una pregunta de seguimiento (ej. "¿Y de regular?", "¿Y Miraflores?", "¿Cómo quedaron los bancos?"), sabes a qué se refiere el usuario gracias al historial.
- Si te saludan o te hacen una pregunta abierta, responde cordialmente, llama al usuario por su nombre y ofrécele 2 o 3 datos destacados del día (ej. estación líder en ventas, saldo en bancos o si la pista estuvo cuadrada).

REGLAS DE DATOS:
- Usa EXCLUSIVAMENTE los datos del CONTEXTO OPERATIVO REAL que te proporcionamos abajo. NUNCA inventes cifras.
- Si te preguntan por un combustible específico (Diesel, Regular, Súper, Ion Diesel) o una estación (Costa del Sol, Miraflores, Chalchuapa, San Martín o 14 Ave), da el dato exacto con unidades (galones) e importe en dólares ($).
- PANELES SOLARES Y BATERÍAS: En la red existen 2 ubicaciones con paneles solares: Puma Miraflores (45.0 kWp paneles + sistema de almacenamiento en batería BESS de 60.0 kWh con ~9.3 horas de autonomía para cargas críticas) y Puma Costa del Sol (35.0 kWp paneles on-grid sin baterías). Total instalado en la red: 80.0 kWp. Las demás 3 estaciones no poseen paneles solares ni baterías. Si preguntan por ahorro o estado, proporciona los kWh generados, ahorro en dólares y estado de carga de la batería (SoC %).
- HORAS PICO DE VENTA: Identifica los momentos de mayor volumen del día (típicamente pico de tarde 17:00-19:00 hrs y mañana 07:00-09:00 hrs). Menciona la hora pico principal, monto de venta y porcentaje sobre el total del día.
- RANGOS Y MESES: Si preguntan por ventas por rango de fechas o mes completo (ej. octubre), contextualiza con los datos del período.
- Formatea en HTML para Telegram: usa <b>negrita</b> para destacar cifras y nombres, <code>código</code> para galonajes exactos y listas con viñetas limpias.
- Usa emojis con criterio gerencial (⛽, 🛢️, 🟢, 🔴, ⚡, ☀️, 🔋, ⏰, 🏦, 🛒, 🚨, 💵, 🏆, 🥇).

CONTEXTO OPERATIVO REAL DE SIPE ADMIN:
${JSON.stringify(liveContext)}`;

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
        // Guardar ambos turnos en la memoria de conversación
        appendToHistory(chatId, 'user', prompt);
        appendToHistory(chatId, 'model', cleanReply);

        return cleanReply;
    } catch (err) {
        console.warn('[ConversationalAI] Error al generar respuesta con Gemini:', err.message);
        return null;
    }
};

module.exports = {
    askConversationalAgent,
    buildLiveProjectContext,
    getFormattedHistory,
    appendToHistory,
    clearConversation,
    learnAlias,
    loadDynamicAliases,
    getGeminiApiKey,
    normalizeStr
};
