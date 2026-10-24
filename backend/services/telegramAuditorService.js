const { getDb, getExternalDb } = require('../db');

/**
 * Capacidad máxima del buffer circular de errores forenses en memoria
 */
const MAX_ERROR_BUFFER_SIZE = 50;

/**
 * Buffer circular de errores forenses en memoria (FIFO)
 */
const errorBuffer = [];
let errorCounter = 0;

/**
 * Registro de actividad de usuarios para cálculo de sesiones activas
 * Clave: userId/chatId -> timestamp ms
 */
const activeUsers = new Map();

/**
 * Métricas acumuladas en memoria del ecosistema de Telegram
 */
const metrics = {
    totalQueriesReceived: 0,
    totalSuccessfulQueries: 0,
    totalFailedQueries: 0,
    voiceNotesProcessed: 0,
    voiceNotesFailed: 0,
    multiTurnQueriesCount: 0,
    alertCallbacksHandled: 0,
    totalResponseTimeMs: 0,
    timedQueriesCount: 0
};

/**
 * Determina la severidad recomendada según el tipo de incidente
 */
const inferSeverity = (type) => {
    const t = String(type || '').toUpperCase();
    if (t.includes('CRITICAL') || t.includes('POLLING_ERROR') || t.includes('DB_ERROR') || t.includes('SECURITY')) {
        return 'critical';
    }
    if (t.includes('WARN') || t.includes('RATE_LIMIT') || t.includes('AUTH_DENIED')) {
        return 'warning';
    }
    if (t.includes('INFO')) {
        return 'info';
    }
    return 'error';
};

/**
 * Registra un error o evento forense en el buffer circular
 */
const recordError = ({ type = 'SYSTEM_ERROR', message, stack, userId, chatId, query, details, severity } = {}) => {
    errorCounter += 1;
    const resolvedSeverity = severity || inferSeverity(type);

    const entry = {
        id: `err_${Date.now()}_${errorCounter}`,
        timestamp: new Date().toISOString(),
        type: String(type || 'SYSTEM_ERROR').toUpperCase(),
        severity: resolvedSeverity,
        message: String(message || 'Error no especificado'),
        stack: stack ? String(stack).slice(0, 1500) : null,
        userId: userId !== undefined && userId !== null ? String(userId) : null,
        chatId: chatId !== undefined && chatId !== null ? String(chatId) : null,
        query: query ? String(query).slice(0, 500) : null,
        details: details || null
    };

    // Buffer circular: insertar al inicio y truncar el más antiguo si supera el límite
    errorBuffer.unshift(entry);
    if (errorBuffer.length > MAX_ERROR_BUFFER_SIZE) {
        errorBuffer.pop();
    }

    return entry;
};

/**
 * Obtener lista de errores forenses registrados
 */
const getErrors = ({ limit = 50, type = null } = {}) => {
    let result = [...errorBuffer];
    if (type) {
        const targetType = String(type).toUpperCase();
        result = result.filter(e => e.type === targetType);
    }
    if (limit && Number(limit) > 0) {
        result = result.slice(0, Number(limit));
    }
    return result;
};

/**
 * Limpiar el buffer de errores forenses
 */
const clearErrors = () => {
    const cleared = errorBuffer.length;
    errorBuffer.length = 0;
    return {
        cleared,
        remaining: 0,
        timestamp: new Date().toISOString()
    };
};

/**
 * Registra actividad de un usuario para cálculo de usuarios/sesiones activas
 */
const recordUserActivity = (userIdOrChatId) => {
    if (!userIdOrChatId) return;
    const key = String(userIdOrChatId);
    activeUsers.set(key, Date.now());

    // Limpieza oportunista de registros con más de 24 horas para evitar fugas de memoria
    if (activeUsers.size > 2000) {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        for (const [k, timestamp] of activeUsers.entries()) {
            if (timestamp < oneDayAgo) {
                activeUsers.delete(k);
            }
        }
    }
};

/**
 * Obtiene la cantidad de usuarios activos en la ventana de tiempo dada (por defecto 20 min)
 */
const getActiveUsersCount = (windowMinutes = 20) => {
    const cutoff = Date.now() - (windowMinutes * 60 * 1000);
    let count = 0;
    for (const [, timestamp] of activeUsers.entries()) {
        if (timestamp >= cutoff) {
            count += 1;
        }
    }
    return count;
};

/**
 * Registra la recepción de una consulta en Telegram
 */
const recordQueryReceived = (userIdOrChatId = null) => {
    metrics.totalQueriesReceived += 1;
    if (userIdOrChatId) {
        recordUserActivity(userIdOrChatId);
    }
    return metrics.totalQueriesReceived;
};

/**
 * Registra una consulta resuelta con éxito
 */
const recordQuerySuccess = ({ durationMs, userIdOrChatId } = {}) => {
    metrics.totalSuccessfulQueries += 1;
    if (typeof durationMs === 'number' && durationMs >= 0) {
        metrics.totalResponseTimeMs += durationMs;
        metrics.timedQueriesCount += 1;
    }
    if (userIdOrChatId) {
        recordUserActivity(userIdOrChatId);
    }
    return metrics.totalSuccessfulQueries;
};

/**
 * Registra una consulta fallida y su error forense correspondiente
 */
const recordQueryFailure = ({ durationMs, type = 'QUERY_ERROR', message, stack, userId, chatId, query, details } = {}) => {
    metrics.totalFailedQueries += 1;
    if (typeof durationMs === 'number' && durationMs >= 0) {
        metrics.totalResponseTimeMs += durationMs;
        metrics.timedQueriesCount += 1;
    }
    if (userId || chatId) {
        recordUserActivity(userId || chatId);
    }

    const recordedError = recordError({
        type,
        message,
        stack,
        userId,
        chatId,
        query,
        details
    });

    return {
        totalFailedQueries: metrics.totalFailedQueries,
        error: recordedError
    };
};

/**
 * Registra el procesamiento exitoso de una nota de voz
 */
const recordVoiceNoteProcessed = (userIdOrChatId = null) => {
    metrics.voiceNotesProcessed += 1;
    if (userIdOrChatId) {
        recordUserActivity(userIdOrChatId);
    }
    return metrics.voiceNotesProcessed;
};

/**
 * Registra el fallo en el procesamiento de una nota de voz
 */
const recordVoiceNoteFailed = ({ error, userId, chatId } = {}) => {
    metrics.voiceNotesFailed += 1;
    if (userId || chatId) {
        recordUserActivity(userId || chatId);
    }
    recordError({
        type: 'VOICE_ERROR',
        message: error?.message || String(error || 'Fallo procesando nota de voz'),
        stack: error?.stack,
        userId,
        chatId
    });
    return metrics.voiceNotesFailed;
};

/**
 * Registra una consulta que forma parte de un diálogo multi-turno
 */
const recordMultiTurnQuery = (userIdOrChatId = null) => {
    metrics.multiTurnQueriesCount += 1;
    if (userIdOrChatId) {
        recordUserActivity(userIdOrChatId);
    }
    return metrics.multiTurnQueriesCount;
};

/**
 * Registra la atención de un callback interactivo de alerta
 */
const recordAlertCallback = (userIdOrChatId = null) => {
    metrics.alertCallbacksHandled += 1;
    if (userIdOrChatId) {
        recordUserActivity(userIdOrChatId);
    }
    return metrics.alertCallbacksHandled;
};

/**
 * Obtener snapshot de métricas acumuladas calculadas
 */
const getMetrics = () => {
    const errorRatePct = metrics.totalQueriesReceived > 0
        ? Number(((metrics.totalFailedQueries / metrics.totalQueriesReceived) * 100).toFixed(2))
        : 0;

    const averageResponseTimeMs = metrics.timedQueriesCount > 0
        ? Math.round(metrics.totalResponseTimeMs / metrics.timedQueriesCount)
        : 0;

    return {
        totalQueriesReceived: metrics.totalQueriesReceived,
        totalSuccessfulQueries: metrics.totalSuccessfulQueries,
        totalFailedQueries: metrics.totalFailedQueries,
        voiceNotesProcessed: metrics.voiceNotesProcessed,
        voiceNotesFailed: metrics.voiceNotesFailed,
        multiTurnQueriesCount: metrics.multiTurnQueriesCount,
        alertCallbacksHandled: metrics.alertCallbacksHandled,
        errorRatePct,
        averageResponseTimeMs,
        totalResponseTimeMs: metrics.totalResponseTimeMs,
        timedQueriesCount: metrics.timedQueriesCount
    };
};

/**
 * Reiniciar métricas acumuladas y sesiones (útil para pruebas unitarias)
 */
const resetMetrics = () => {
    metrics.totalQueriesReceived = 0;
    metrics.totalSuccessfulQueries = 0;
    metrics.totalFailedQueries = 0;
    metrics.voiceNotesProcessed = 0;
    metrics.voiceNotesFailed = 0;
    metrics.multiTurnQueriesCount = 0;
    metrics.alertCallbacksHandled = 0;
    metrics.totalResponseTimeMs = 0;
    metrics.timedQueriesCount = 0;
    activeUsers.clear();
    return getMetrics();
};

/**
 * Diagnóstico de conectividad con bases de datos
 */
const checkDatabasesHealth = async () => {
    const databases = {
        sipeAdmin: {
            name: process.env.DB_NAME || 'db_sipe_admin',
            connected: false,
            latencyMs: 0,
            error: null
        },
        sistemaSaas: {
            name: process.env.EXTERNAL_DB_NAME || 'db_sistema_saas',
            connected: false,
            latencyMs: 0,
            error: null
        }
    };

    // 1. db_sipe_admin
    try {
        const db = getDb();
        if (db) {
            const start = Date.now();
            await db.query('SELECT 1');
            databases.sipeAdmin.connected = true;
            databases.sipeAdmin.latencyMs = Date.now() - start;
        } else {
            databases.sipeAdmin.error = 'Pool db_sipe_admin no inicializado';
        }
    } catch (err) {
        databases.sipeAdmin.error = err.message;
    }

    // 2. db_sistema_saas
    try {
        if (typeof getExternalDb === 'function') {
            const extDb = await getExternalDb();
            if (extDb) {
                const start = Date.now();
                await extDb.query('SELECT 1');
                databases.sistemaSaas.connected = true;
                databases.sistemaSaas.latencyMs = Date.now() - start;
            } else {
                databases.sistemaSaas.error = 'Pool db_sistema_saas no inicializado';
            }
        } else {
            databases.sistemaSaas.error = 'Función getExternalDb no disponible';
        }
    } catch (err) {
        databases.sistemaSaas.error = err.message;
    }

    return databases;
};

/**
 * Diagnóstico de métricas de feedback y satisfacción
 */
const checkFeedbackMetrics = async () => {
    const fallback = {
        total: 0,
        utiles: 0,
        no_utiles: 0,
        pendientes: 0,
        satisfactionRatePct: 100.0,
        pendingImprovementComments: 0
    };

    try {
        const db = getDb();
        if (!db) return fallback;

        const [rows] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN calificacion = 'UTIL' THEN 1 ELSE 0 END) as utiles,
                SUM(CASE WHEN calificacion = 'NO_UTIL' THEN 1 ELSE 0 END) as no_utiles,
                SUM(CASE WHEN calificacion = 'PENDIENTE' THEN 1 ELSE 0 END) as pendientes,
                SUM(CASE WHEN comentario_mejora IS NOT NULL AND TRIM(comentario_mejora) != '' AND (estado IS NULL OR estado != 'REVISADO') THEN 1 ELSE 0 END) as comentarios_pendientes
            FROM telegram_feedback
        `);

        const r = rows?.[0] || {};
        const total = Number(r.total || 0);
        const utiles = Number(r.utiles || 0);
        const no_utiles = Number(r.no_utiles || 0);
        const pendientes = Number(r.pendientes || 0);
        const evaluados = utiles + no_utiles;
        const satisfactionRatePct = evaluados > 0 ? Number(((utiles / evaluados) * 100).toFixed(1)) : 100.0;
        const pendingImprovementComments = Number(r.comentarios_pendientes || 0);

        return {
            total,
            utiles,
            no_utiles,
            pendientes,
            satisfactionRatePct,
            pendingImprovementComments
        };
    } catch (_) {
        return fallback;
    }
};

/**
 * Obtiene el diagnóstico completo de salud del ecosistema de Telegram
 */
const getHealthDiagnostics = async () => {
    // 1. Estado del bot (polling, último poll, config)
    let botStatus = {
        isPolling: false,
        isActive: false,
        lastPollAt: null,
        isConnected: false,
        username: null
    };

    try {
        // Intentar obtener de telegramBotService si está disponible
        const { getBotStatus } = require('./telegramBotService');
        if (typeof getBotStatus === 'function') {
            const bs = await getBotStatus();
            botStatus = {
                isPolling: Boolean(bs.isPolling),
                isActive: Boolean(bs.isActive),
                lastPollAt: bs.lastPollAt || null,
                isConnected: Boolean(bs.isConnected),
                username: bs.bot?.username ? `@${bs.bot.username}` : null
            };
        }
    } catch (_) {
        // Fallback: consultar tabla de configuración directamente
        try {
            const db = getDb();
            if (db) {
                const [cfgRows] = await db.query('SELECT bot_username, is_active, last_poll_at FROM telegram_config WHERE id = 1 LIMIT 1');
                if (cfgRows && cfgRows.length > 0) {
                    botStatus.isActive = Boolean(cfgRows[0].is_active);
                    botStatus.lastPollAt = cfgRows[0].last_poll_at;
                    botStatus.username = cfgRows[0].bot_username ? `@${cfgRows[0].bot_username}` : null;
                }
            }
        } catch (_dbErr) {
            // Ignorar de forma segura
        }
    }

    // 2. Conectividad a bases de datos (db_sipe_admin y db_sistema_saas)
    const databases = await checkDatabasesHealth();

    // 3. Estado de Gemini API (verificar tanto process.env como tabla telegram_config descartando placeholders)
    let geminiConfigured = false;
    try {
        const { getGeminiApiKey } = require('./telegramBotService');
        if (typeof getGeminiApiKey === 'function') {
            const resolvedKey = await getGeminiApiKey();
            geminiConfigured = Boolean(resolvedKey);
        }
    } catch (_) {
        geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10);
    }
    const gemini = {
        configured: geminiConfigured,
        model: 'gemini-2.0-flash'
    };

    // 4. Memoria activa de conversaciones (usuarios activos en los últimos 20 minutos)
    const activeConversationsCount = getActiveUsersCount(20);

    // 5. Métricas de satisfacción del feedback
    const feedbackSatisfaction = await checkFeedbackMetrics();

    // 6. Métricas acumuladas calculadas
    const currentMetrics = getMetrics();

    // 7. Últimos 10 errores forenses registrados
    const recentErrors = getErrors({ limit: 10 });

    // Determinar salud operativa global
    let status = 'healthy';
    if (!databases.sipeAdmin.connected || !databases.sistemaSaas.connected || currentMetrics.errorRatePct > 15) {
        status = 'degraded';
    }
    if (!databases.sipeAdmin.connected && !databases.sistemaSaas.connected) {
        status = 'critical';
    }
    if (currentMetrics.errorRatePct > 50 && currentMetrics.totalQueriesReceived >= 5) {
        status = 'critical';
    }

    return {
        status,
        timestamp: new Date().toISOString(),
        bot: botStatus,
        databases,
        gemini,
        activeConversations: {
            count: activeConversationsCount,
            windowMinutes: 20
        },
        feedbackSatisfaction,
        metrics: currentMetrics,
        recentErrors
    };
};

/**
 * Formatea un reporte ejecutivo en HTML para Telegram (/salud, /auditoria, /diagnostico)
 */
const formatDiagnosticsMessage = async (customDiagnostics = null) => {
    const diag = customDiagnostics || await getHealthDiagnostics();

    const esc = (text) => {
        if (!text && text !== 0) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    let statusHeader = '🟢 <b>SISTEMA SALUDABLE Y OPERATIVO</b>';
    if (diag.status === 'degraded') {
        statusHeader = '🟡 <b>ESTADO DEGRADADO (ATENCIÓN REQUERIDA)</b>';
    } else if (diag.status === 'critical') {
        statusHeader = '🔴 <b>ALERTA CRÍTICA: ANOMALÍAS EN INFRAESTRUCTURA</b>';
    }

    const pollTimeStr = diag.bot?.lastPollAt
        ? new Date(diag.bot.lastPollAt).toLocaleTimeString('es-SV', { hour12: false })
        : 'N/A';

    let msg = `🩺 <b>DIAGNÓSTICO DE SALUD Y AUDITORÍA SIPE</b>\n`;
    msg += `${statusHeader}\n`;
    msg += `<i>Generado el: ${new Date().toLocaleString('es-SV')}</i>\n\n`;

    // 1. Estado del Bot
    msg += `🤖 <b>ESTADO DEL BOT TELEGRAM:</b>\n`;
    msg += `• Polling: ${diag.bot?.isPolling ? '✅ Activo' : (diag.bot?.isActive ? '⏳ En espera' : '⏸️ En pausa')}\n`;
    msg += `• Conexión API: ${diag.bot?.isConnected ? '🟢 En línea' : '⚠️ Desconectado'}\n`;
    msg += `• Usuario: <code>${esc(diag.bot?.username || '@SIPE_IA_BOT')}</code>\n`;
    msg += `• Último Poll: <code>${esc(pollTimeStr)}</code>\n\n`;

    // 2. Bases de Datos
    msg += `🗄️ <b>CONECTIVIDAD A BASES DE DATOS:</b>\n`;
    const dbAdmin = diag.databases?.sipeAdmin;
    const dbSaas = diag.databases?.sistemaSaas;
    msg += `• <b>db_sipe_admin:</b> ${dbAdmin?.connected ? `🟢 Conectada (${dbAdmin.latencyMs} ms)` : `🔴 Fallo (${esc(dbAdmin?.error || 'Sin conexión')})`}\n`;
    msg += `• <b>db_sistema_saas:</b> ${dbSaas?.connected ? `🟢 Conectada (${dbSaas.latencyMs} ms)` : `🔴 Fallo (${esc(dbSaas?.error || 'Sin conexión')})`}\n\n`;

    // 3. IA y Sesiones
    msg += `🧠 <b>INTELIGENCIA ARTIFICIAL & MEMORIA:</b>\n`;
    msg += `• Gemini 2.0 Flash: ${diag.gemini?.configured ? '🟢 Configurado' : '⚠️ Sin GEMINI_API_KEY'}\n`;
    msg += `• Sesiones Activas (últimos 20 min): 👥 <b>${diag.activeConversations?.count || 0}</b> usuario(s)\n`;
    msg += `• Consultas Multi-Turno: 🔄 <b>${diag.metrics?.multiTurnQueriesCount || 0}</b>\n\n`;

    // 4. Métricas de Rendimiento
    const m = diag.metrics || {};
    msg += `📊 <b>MÉTRICAS OPERATIVAS:</b>\n`;
    msg += `• Consultas Recibidas: <b>${m.totalQueriesReceived || 0}</b>\n`;
    msg += `• Exitosas: 🟢 <b>${m.totalSuccessfulQueries || 0}</b> | Fallidas: 🔴 <b>${m.totalFailedQueries || 0}</b>\n`;
    msg += `• Tasa Global de Error: <b>${m.errorRatePct ?? 0}%</b>\n`;
    msg += `• Latencia Promedio: ⏱️ <b>${m.averageResponseTimeMs || 0} ms</b>\n`;
    msg += `• Notas de Voz: 🎙️ <b>${m.voiceNotesProcessed || 0}</b> proc. / <b>${m.voiceNotesFailed || 0}</b> fallidas\n`;
    msg += `• Callbacks de Alerta: 🚨 <b>${m.alertCallbacksHandled || 0}</b>\n\n`;

    // 5. Satisfacción del Feedback
    const fb = diag.feedbackSatisfaction || {};
    msg += `⭐ <b>SATISFACCIÓN & MEJORA CONTINUA:</b>\n`;
    msg += `• Tasa Útil: <b>${fb.satisfactionRatePct ?? 100}%</b> (${fb.utiles || 0} 👍 / ${fb.no_utiles || 0} 👎)\n`;
    msg += `• Sugerencias Pendientes de Revisión: 📝 <b>${fb.pendingImprovementComments || 0}</b>\n\n`;

    // 6. Últimos Errores Forenses
    msg += `🚨 <b>INCIDENTES FORENSES RECIENTES:</b>\n`;
    const errs = diag.recentErrors || [];
    if (errs.length === 0) {
        msg += `✅ <i>Cero incidentes en el buffer circular de auditoría.</i>\n`;
    } else {
        const topErrors = errs.slice(0, 3);
        topErrors.forEach((e, idx) => {
            const timeStr = new Date(e.timestamp).toLocaleTimeString('es-SV', { hour12: false });
            msg += `${idx + 1}. [<code>${esc(e.type)}</code> - ${esc(timeStr)}] ${esc(e.message.slice(0, 75))}\n`;
        });
        if (errs.length > 3) {
            msg += `<i>... y ${errs.length - 3} incidente(s) más en buffer.</i>\n`;
        }
    }

    msg += `\n<i>SIPE Admin • Módulo de Auditoría de Errores y Diagnóstico de Salud</i>`;
    return msg;
};

module.exports = {
    MAX_ERROR_BUFFER_SIZE,
    recordError,
    getErrors,
    clearErrors,
    recordUserActivity,
    getActiveUsersCount,
    recordQueryReceived,
    recordQuerySuccess,
    recordQueryFailure,
    recordVoiceNoteProcessed,
    recordVoiceNoteFailed,
    recordMultiTurnQuery,
    recordAlertCallback,
    getMetrics,
    resetMetrics,
    checkDatabasesHealth,
    checkFeedbackMetrics,
    getHealthDiagnostics,
    formatDiagnosticsMessage
};
