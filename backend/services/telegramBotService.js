const axios = require('axios');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const salesHourlyService = require('./salesHourlyService');
const solarEnergyService = require('./solarEnergyService');
const sysSaasService = require('./sysSaasService');

const {
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    getDateStr,
    normalizeText,
    shiftDate,
    parseSpanishDateText,
    SPANISH_MONTH_NAMES,
    parseSpanishPeriodOrDate,
    parseUserDate,
    KNOWN_STATIONS,
    KNOWN_FUELS,
    KNOWN_BANKS,
    KNOWN_ACCOUNT_HOLDERS,
    KNOWN_STORE_LINES,
    resolveStationId,
    findStationById,
    findFuelByKey,
    parseNaturalLanguageQuery
} = require('./telegramTextAndDates');

const {
    TELEGRAM_API_BASE,
    runtimeState,
    getBotToken,
    getMainReplyKeyboard,
    testTelegramConnection,
    sendTelegramMessage,
    sendChatAction,
    sendTelegramDocument,
    sendTelegramPhoto,
    sendTelegramAudio,
    setTelegramWebhook,
    deleteTelegramWebhook,
    getTelegramWebhookInfo,
    answerCallbackQuery,
    editMessageReplyMarkup,
    setTelegramBotCommands,
    getBotStatus
} = require('./telegramTransportService');

const {
    pendingTaskWizards,
    clearProductivityWizards,
    pruneProductivityWizards,
    resolveCollaboratorCandidates,
    parseMultiUserTaskInput,
    createMultiUserTasksFromTelegram,
    formatMultiTaskCreationResultMessage,
    startTaskAssignmentWizard,
    getTasksSummaryData,
    formatTasksMessage,
    getTasksInlineMarkup,
    getEventosProgramadosData,
    formatEventosProgramadosMessage,
    getEventosInlineMarkup,
    parseScheduleEventInput,
    startEventScheduleWizard,
    parseControlPagosQuery,
    getControlPagosDetailedData,
    formatControlPagosMessage,
    getControlPagosInlineMarkup,
    getCumpleanosData,
    formatCumpleanosMessage,
    getCumpleanosInlineMarkup,
    handleActiveProductivityWizardMessage,
    handleProductivityCallbackQuery
} = require('./telegramProductivityService');

const {
    queryMemoryCache,
    getCachedQuery,
    setCachedQuery,
    clearQueryCache,
    getSaldosBancosData,
    getSaldosChequeraData,
    filterBankOrChequeraAccounts,
    getVentasTiendaPorLineaData,
    getRankingDiasVentasData,
    getPagosProgramadosData,
    getConsolidadoVentas,
    getPedidosPumaData,
    COMPETENCIA_STATION_NAMES,
    KNOWN_COMPETITOR_BRANDS,
    extractCompetitorBrand,
    priceFmt,
    calcPriceDiff,
    getPreciosCompetenciaData,
    getCompetenciaInlineMarkup,
    formatPreciosCompetenciaMessage
} = require('./telegramDataService');

const {
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatProfileMessage,
    formatSpecificStationMessage,
    formatProductTotalMessage,
    formatRankingMessage,
    formatSpecificBankMessage,
    formatTiendasMessage,
    formatVentasTiendaLineaMessage,
    formatPeakDayVentasMessage,
    formatPagosProgramadosMessage,
    formatVentasMensualMessage,
    formatVentasRangoMessage,
    formatHorasPicoMessage,
    formatSolarEnergyMessage,
    getSolarInlineMarkup,
    formatAndelsaInventarioMessage,
    formatAndelsaCostosMessage,
    formatAndelsaVentasClienteMessage,
    formatAndelsaVentasProductoMessage,
    formatAndelsaCxcMessage,
    formatAndelsaFinanzasResumenMessage,
    getAndelsaInlineMarkup,
    formatTanquesAutonomiaMessage,
    formatPedidosPumaMessage,
    formatRentabilidadEbitdaMessage,
    formatTransitoValesMessage,
    formatIntelligentGuidanceMessage,
    formatHelpMessage
} = require('./telegramFormatters');

const { getTanquesAutonomia } = require('./fuelIntelligence');
const { getRentabilidadPorEstacion } = require('./profitabilityService');
const { getAuditoriaDineroEnTransito } = require('./operationalAuditService');

const {
    sanitizeGeminiApiKey,
    ensureTelegramConfigSchema,
    setRuntimeGeminiApiKey,
    getGeminiApiKeyCandidates,
    getGeminiApiKey,
    sanitizeAudioMimeType,
    isGeminiApiKeyInvalidError,
    transcribeTelegramVoice,
    analyzeTelegramImageReceipt,
    verifyReceiptInBankMovements,
    formatReceiptAnalysisMessage
} = require('./telegramGeminiService');

const {
    generateExecutiveReportPdf,
    buildAndSendTopicPdf
} = require('./telegramPdfService');

const {
    pendingReceiptPayments,
    prunePendingReceiptPayments,
    prepareReceiptPaymentDraft,
    applyReceiptDraftToVencimiento,
    handleReceiptPaymentCallback
} = require('./telegramReceiptPaymentService');

const {
    evaluateSentinelAlerts,
    formatSentinelMessage,
    getSentinelInlineMarkup,
    runProactiveSentinelDispatch
} = require('./telegramSentinelService');

const {
    buildAndSendExecutiveAudio,
    buildAndSendTopicChart
} = require('./telegramMediaInsightsService');

const {
    getFlujoResumenData,
    formatFlujoMessage,
    getFlujoInlineMarkup,
    getPrestamosResumenData,
    formatPrestamosMessage,
    getPrestamosInlineMarkup,
    getCreditosResumenData,
    formatCreditosMessage,
    getCreditosInlineMarkup,
    canUserApproveFinancialOp,
    createAndNotifyApprovalRequest,
    listApprovalsData,
    formatApprovalsListMessage,
    getApprovalsListMarkup,
    resolveApprovalAction,
    handleFinanceApprovalCallback
} = require('./telegramFinanceApprovalService');

let runtimeIo = null;

/**
 * Mapa en memoria para seguimiento de comentarios de mejora pendientes por usuario
 * key: telegramUserId (string) -> { feedbackId, timestamp }
 */
const pendingFeedbackUsers = new Map();

/**
 * Memoria de contexto conversacional multi-turno por usuario
 * TTL: 20 minutos
 * key: telegram_user_id (string) -> {
 *   lastStationId, lastStationName, lastDate, lastProduct, lastTopic,
 *   lastPeriod, lastHourReport, lastSolarReport, history: [], updatedAt
 * }
 */
const userConversationContext = new Map();
const CONVERSATION_CONTEXT_TTL = 20 * 60 * 1000; // 20 minutos

const getUserConversationContext = (userId) => {
    if (!userId) return null;
    const key = String(userId);
    const entry = userConversationContext.get(key);
    if (!entry) return null;
    if (Date.now() - (entry.updatedAt || 0) > CONVERSATION_CONTEXT_TTL) {
        userConversationContext.delete(key);
        return null;
    }
    return entry;
};

const setUserConversationContext = (userId, updates = {}) => {
    if (!userId) return null;
    const key = String(userId);
    const existing = getUserConversationContext(userId) || {
        lastStationId: null,
        lastStationName: null,
        lastDate: null,
        lastProduct: null,
        lastTopic: null,
        lastPeriod: null,
        lastHourReport: null,
        lastSolarReport: null,
        history: []
    };

    const newHistory = Array.isArray(existing.history) ? [...existing.history] : [];
    if (updates.query) {
        newHistory.push({
            query: updates.query,
            timestamp: Date.now(),
            topic: updates.lastTopic || existing.lastTopic || 'general'
        });
        if (newHistory.length > 20) newHistory.shift();
    }

    const merged = {
        lastStationId: updates.lastStationId !== undefined ? updates.lastStationId : existing.lastStationId,
        lastStationName: updates.lastStationName !== undefined ? updates.lastStationName : existing.lastStationName,
        lastDate: updates.lastDate !== undefined ? updates.lastDate : existing.lastDate,
        lastProduct: updates.lastProduct !== undefined ? updates.lastProduct : existing.lastProduct,
        lastTopic: updates.lastTopic !== undefined ? updates.lastTopic : existing.lastTopic,
        lastPeriod: updates.lastPeriod !== undefined ? updates.lastPeriod : existing.lastPeriod,
        lastHourReport: updates.lastHourReport !== undefined ? updates.lastHourReport : existing.lastHourReport,
        lastSolarReport: updates.lastSolarReport !== undefined ? updates.lastSolarReport : existing.lastSolarReport,
        history: newHistory,
        updatedAt: Date.now()
    };

    userConversationContext.set(key, merged);
    return merged;
};

const clearUserConversationContext = (userId) => {
    if (!userId) return;
    userConversationContext.delete(String(userId));
};

/**
 * Mapa en memoria para el modo de justificación interactiva de descuadres
 * key: telegram_user_id (string) -> { date, stationId, stationName, timestamp }
 */
const pendingAlertJustifications = new Map();
const PENDING_ACTION_TTL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_BOT_MAP_ENTRIES = 500;
const BOT_MEMORY_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos
let memorySweeperInterval = null;

function pruneTimedMap(map, ttlMs, tsField = 'timestamp', maxEntries = MAX_BOT_MAP_ENTRIES, nowMs = Date.now()) {
    let removed = 0;
    for (const [key, entry] of map.entries()) {
        const ts = entry && typeof entry === 'object' ? (entry[tsField] || entry.updatedAt || entry.timestamp || 0) : 0;
        if (nowMs - ts > ttlMs) {
            map.delete(key);
            removed += 1;
        }
    }
    const cap = Math.max(1, Number(maxEntries) || MAX_BOT_MAP_ENTRIES);
    while (map.size > cap) {
        const oldestKey = map.keys().next().value;
        if (oldestKey === undefined) break;
        map.delete(oldestKey);
        removed += 1;
    }
    return removed;
}

const pruneBotMemoryMaps = (maxEntries = MAX_BOT_MAP_ENTRIES) => {
    const now = Date.now();
    const removedContext = pruneTimedMap(userConversationContext, CONVERSATION_CONTEXT_TTL, 'updatedAt', maxEntries, now);
    const removedFeedback = pruneTimedMap(pendingFeedbackUsers, PENDING_ACTION_TTL_MS, 'timestamp', maxEntries, now);
    const removedJustifications = pruneTimedMap(pendingAlertJustifications, PENDING_ACTION_TTL_MS, 'timestamp', maxEntries, now);
    const removedWizards = typeof pruneProductivityWizards === 'function' ? pruneProductivityWizards(maxEntries) : 0;
    const removedReceipts = typeof prunePendingReceiptPayments === 'function' ? prunePendingReceiptPayments(Math.min(150, maxEntries)) : 0;
    return {
        removedContext,
        removedFeedback,
        removedJustifications,
        removedWizards,
        removedReceipts,
        totalRemoved: removedContext + removedFeedback + removedJustifications + removedWizards + removedReceipts
    };
};

const startBotMemorySweeper = () => {
    if (process.env.NODE_ENV === 'test' || memorySweeperInterval) return;
    memorySweeperInterval = setInterval(() => {
        try {
            pruneBotMemoryMaps(MAX_BOT_MAP_ENTRIES);
        } catch (_) {
            // Ignorar errores transitorios en limpieza periódica
        }
    }, BOT_MEMORY_SWEEP_INTERVAL_MS);
    if (memorySweeperInterval && typeof memorySweeperInterval.unref === 'function') {
        memorySweeperInterval.unref();
    }
};

const stopBotMemorySweeper = () => {
    if (memorySweeperInterval) {
        clearInterval(memorySweeperInterval);
        memorySweeperInterval = null;
    }
};

/**
 * Registrar un nuevo evento de consulta para retroalimentación en telegram_feedback
 */
const createFeedbackEntry = async ({
    telegramUserId,
    telegramUsername = null,
    firstName = null,
    chatId,
    mensajeId = null,
    consultaOriginal,
    respuestaResumen = null,
    calificacion = 'PENDIENTE'
}) => {
    try {
        const db = getDb();
        if (!db) return null;

        const [res] = await db.query(
            `INSERT INTO telegram_feedback 
             (telegram_user_id, telegram_username, first_name, chat_id, mensaje_id, consulta_original, respuesta_resumen, calificacion, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABIERTO')`,
            [
                String(telegramUserId),
                telegramUsername || null,
                firstName || null,
                String(chatId),
                mensajeId ? String(mensajeId) : null,
                String(consultaOriginal || ''),
                respuestaResumen ? String(respuestaResumen).substring(0, 1000) : null,
                calificacion
            ]
        );
        return res?.insertId || null;
    } catch (err) {
        console.error('[TelegramBot] Error al registrar feedback:', err.message);
        return null;
    }
};

/**
 * Generar markup de teclado inline para calificar la respuesta (Sí / No)
 */
const getFeedbackInlineMarkup = (feedbackId) => {
    if (!feedbackId) return null;
    return {
        inline_keyboard: [
            [
                { text: '👍 Sí', callback_data: `fb_ok:${feedbackId}` },
                { text: '👎 No', callback_data: `fb_no:${feedbackId}` }
            ]
        ]
    };
};

/**
 * Enviar mensaje con botones interactivos de retroalimentación (Sí / No)
 */
const sendTelegramResponseWithFeedback = async (chatId, text, { user, query, responseSummary = null, reply_markup = null }) => {
    let feedbackId = null;
    try {
        const plainBody = String(text || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        const richSummary = responseSummary && plainBody && !plainBody.includes(responseSummary)
            ? `[${responseSummary}] ${plainBody}`.substring(0, 980)
            : (plainBody || responseSummary || '').substring(0, 980);

        feedbackId = await createFeedbackEntry({
            telegramUserId: user?.telegram_user_id || chatId,
            telegramUsername: user?.telegram_username,
            firstName: user?.first_name,
            chatId,
            consultaOriginal: query || 'Consulta directa',
            respuestaResumen: richSummary,
            calificacion: 'PENDIENTE'
        });
    } catch (fbErr) {
        console.error('[TelegramBot] Error al preparar feedback:', fbErr.message);
    }

    let finalMarkup = null;
    let finalText = text;
    const extraRows = (reply_markup && reply_markup.inline_keyboard) ? reply_markup.inline_keyboard : [];

    if (feedbackId) {
        finalText = `${text}\n\n<i>¿Contesté bien a tu pregunta?</i>`;
        const fbRows = [
            [
                { text: '👍 Sí', callback_data: `fb_ok:${feedbackId}` },
                { text: '👎 No', callback_data: `fb_no:${feedbackId}` }
            ]
        ];
        finalMarkup = {
            inline_keyboard: [...extraRows, ...fbRows]
        };
    } else if (extraRows.length > 0) {
        finalMarkup = { inline_keyboard: extraRows };
    } else {
        finalMarkup = getMainReplyKeyboard();
    }

    const sent = await sendTelegramMessage(chatId, finalText, finalMarkup);

    if (sent?.message_id && feedbackId) {
        try {
            const db = getDb();
            if (db) {
                await db.query('UPDATE telegram_feedback SET mensaje_id = ? WHERE id = ?', [
                    String(sent.message_id),
                    feedbackId
                ]);
            }
        } catch (_) {
            // Silenciosamente ignorar fallo de actualización de mensaje_id
        }
    }

    return sent;
};

/**
 * Manejar eventos de callback_query provenientes de botones inline en Telegram
 */
const handleCallbackQuery = async (cq) => {
    if (!cq || !cq.id || !cq.data) return;

    const data = String(cq.data).trim();
    const fromId = cq.from ? String(cq.from.id) : null;
    const chatId = cq.message?.chat?.id || fromId;
    const messageId = cq.message?.message_id;

    if (data === 'noop') {
        await answerCallbackQuery(cq.id, 'Ya has calificado esta respuesta.');
        return;
    }

    // Registrar callbacks de alerta o interactivos en el auditor forense
    if (data.startsWith('alert_') || data.includes('alerta') || data.startsWith('ack_')) {
        try {
            const { recordAlertCallback } = require('./telegramAuditorService');
            recordAlertCallback(fromId);
        } catch (_) {
            // Ignorar defensivamente
        }
    }

    // Caso 1: Calificación positiva (👍 Sí) — validando propietario del feedback
    if (data.startsWith('fb_ok:')) {
        if (!fromId) {
            await answerCallbackQuery(cq.id, '⛔ Sesión de Telegram no válida.');
            return;
        }
        const feedbackId = parseInt(data.replace('fb_ok:', ''), 10);
        if (feedbackId) {
            try {
                const db = getDb();
                if (db) {
                    const tgUser = await resolveTelegramUser(cq.from);
                    if (!tgUser || !tgUser.activo) {
                        await answerCallbackQuery(cq.id, '⛔ Tu cuenta de Telegram no está autorizada.');
                        return;
                    }
                    await db.query(
                        `UPDATE telegram_feedback 
                         SET calificacion = 'UTIL', estado = 'COMPLETADO', updated_at = NOW() 
                         WHERE id = ? AND telegram_user_id = ?`,
                        [feedbackId, fromId]
                    );
                }
            } catch (err) {
                console.error('[TelegramBot] Error actualizando feedback UTIL:', err.message);
            }
        }

        await answerCallbackQuery(cq.id, '¡Muchas gracias por confirmar! 🙌 Me alegra haber ayudado.');

        if (chatId && messageId) {
            await editMessageReplyMarkup(chatId, messageId, {
                inline_keyboard: [
                    [{ text: '✅ Marcado: Contestó bien 👍', callback_data: 'noop' }]
                ]
            });
        }
        return;
    }

    // Caso 2: Calificación negativa (👎 No) — validando propietario del feedback
    if (data.startsWith('fb_no:')) {
        if (!fromId) {
            await answerCallbackQuery(cq.id, '⛔ Sesión de Telegram no válida.');
            return;
        }
        const feedbackId = parseInt(data.replace('fb_no:', ''), 10);
        let consultaOriginal = null;
        let respuestaAnterior = null;
        if (feedbackId) {
            try {
                const db = getDb();
                if (db) {
                    const tgUser = await resolveTelegramUser(cq.from);
                    if (!tgUser || !tgUser.activo) {
                        await answerCallbackQuery(cq.id, '⛔ Tu cuenta de Telegram no está autorizada.');
                        return;
                    }
                    await db.query(
                        `UPDATE telegram_feedback 
                         SET calificacion = 'NO_UTIL', estado = 'ABIERTO', updated_at = NOW() 
                         WHERE id = ? AND telegram_user_id = ?`,
                        [feedbackId, fromId]
                    );
                    const [fbRows] = await db.query(
                        'SELECT consulta_original, respuesta_resumen FROM telegram_feedback WHERE id = ? AND telegram_user_id = ? LIMIT 1',
                        [feedbackId, fromId]
                    );
                    if (Array.isArray(fbRows) && fbRows.length > 0) {
                        consultaOriginal = fbRows[0].consulta_original || null;
                        respuestaAnterior = fbRows[0].respuesta_resumen || null;
                    }
                }
            } catch (err) {
                console.error('[TelegramBot] Error actualizando feedback NO_UTIL:', err.message);
            }
        }

        await answerCallbackQuery(cq.id, 'Registrado. Cuéntanos qué dato buscabas y lo corregimos ahora mismo.');

        if (chatId && messageId) {
            await editMessageReplyMarkup(chatId, messageId, {
                inline_keyboard: [
                    [{ text: '❌ Marcado: Necesita mejorar 👎', callback_data: 'noop' }]
                ]
            });
        }

        if (fromId) {
            pendingFeedbackUsers.set(fromId, {
                feedbackId,
                consultaOriginal,
                respuestaAnterior,
                timestamp: Date.now()
            });

            const promptMsg = `✍️ <b>Lamento no haber respondido como esperabas.</b>\n\n` +
                `Indícame brevemente qué dato exacto buscabas o qué faltó (por ejemplo: <i>"quería el saldo de Promerica"</i>, <i>"era todo el mes de octubre"</i> o <i>"nivel de tanques"</i>) y <b>te generaré la respuesta corregida de inmediato</b>.`;

            await sendTelegramMessage(chatId, promptMsg, getMainReplyKeyboard());
        }
        return;
    }

    // Callbacks interactivos de MiBot Personal (recordatorios de pago, tareas, validaciones y reuniones)
    if (data.startsWith('mibot:')) {
        try {
            const db = getDb();
            if (!db || !cq.from) {
                await answerCallbackQuery(cq.id, '⛔ No fue posible verificar tu autorización.');
                return;
            }
            const tgUser = await resolveTelegramUser(cq.from);
            if (!tgUser || !tgUser.activo) {
                await answerCallbackQuery(cq.id, '⛔ Tu cuenta de Telegram no está autorizada.');
                return;
            }
            const effPerms = await getUserEffectivePermissions(tgUser);
            if (effPerms.inactiveInSipe) {
                await answerCallbackQuery(cq.id, '⛔ Tu usuario vinculado en SIPE está inactivo.');
                return;
            }
            const mibotService = require('./mibotNotifierService');
            const handled = await mibotService.handleMibotCallbackQuery({
                db,
                cq,
                tgUser,
                transport: { answerCallbackQuery, editMessageReplyMarkup, sendTelegramMessage }
            });
            if (handled) return;
        } catch (mibotCbErr) {
            console.error('[TelegramBot] Error en callback de MiBot:', mibotCbErr.message);
            await answerCallbackQuery(cq.id, '⚠️ Error procesando tu respuesta en MiBot.');
            return;
        }
    }

    // Callbacks interactivos de Productividad (Tareas Multi-Usuario, Agenda Eventos, Control de Pagos, Cumpleaños) - fail-closed
    if (
        data.startsWith('tg_tsk:') ||
        data.startsWith('tg_evt:') ||
        data.startsWith('tg_pago:') ||
        data.startsWith('tg_bday:')
    ) {
        try {
            const db = getDb();
            if (!db || !cq.from) {
                await answerCallbackQuery(cq.id, '⛔ No fue posible verificar tu autorización.');
                return;
            }
            const tgUser = await resolveTelegramUser(cq.from);
            if (!tgUser || !tgUser.activo) {
                await answerCallbackQuery(cq.id, '⛔ Tu cuenta de Telegram no está autorizada.');
                return;
            }
            const effPerms = await getUserEffectivePermissions(tgUser);
            if (effPerms.inactiveInSipe) {
                await answerCallbackQuery(cq.id, '⛔ Tu usuario vinculado en SIPE está inactivo.');
                return;
            }
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const handled = await handleProductivityCallbackQuery({
                db,
                externalDb,
                accountingDb,
                cq,
                tgUser,
                effPerms,
                transport: {
                    sendTelegramMessage,
                    answerCallbackQuery,
                    editMessageReplyMarkup,
                    sendChatAction,
                    getMainReplyKeyboard
                }
            });
            if (handled) return;
        } catch (prodCbErr) {
            console.error('[TelegramBot] Error en callback de Productividad:', prodCbErr.message);
            await answerCallbackQuery(cq.id, '⚠️ Error procesando tu solicitud.');
            return;
        }
    }

    // Callbacks ejecutivos: Abonos por comprobante (tg_rcp), Centinela (tg_sent), Gráficas PNG (tg_chr), Finanzas (tg_fin), Aprobaciones (tg_apr) - fail-closed
    if (
        data.startsWith('tg_rcp:') ||
        data.startsWith('tg_sent:') ||
        data.startsWith('tg_chr:') ||
        data.startsWith('tg_fin:') ||
        data.startsWith('tg_apr:')
    ) {
        try {
            const db = getDb();
            if (!db || !cq.from) {
                await answerCallbackQuery(cq.id, '⛔ No fue posible verificar tu autorización.');
                return;
            }
            const tgUser = await resolveTelegramUser(cq.from);
            if (!tgUser || !tgUser.activo) {
                await answerCallbackQuery(cq.id, '⛔ Tu cuenta de Telegram no está autorizada.');
                return;
            }
            const effPerms = await getUserEffectivePermissions(tgUser);
            if (effPerms.inactiveInSipe) {
                await answerCallbackQuery(cq.id, '⛔ Tu usuario vinculado en SIPE está inactivo.');
                return;
            }

            const transport = {
                sendTelegramMessage,
                sendTelegramPhoto,
                sendTelegramAudio,
                answerCallbackQuery,
                editMessageReplyMarkup,
                sendChatAction,
                getMainReplyKeyboard
            };

            if (data.startsWith('tg_rcp:')) {
                const externalDb = await getExternalDb().catch(() => null);
                const handled = await handleReceiptPaymentCallback({ db, externalDb, cq, tgUser, effPerms, transport });
                if (handled) return;
            }

            if (data.startsWith('tg_sent:')) {
                if (!effPerms.alertas && !effPerms.saldos_banco && !effPerms.isAdmin) {
                    await answerCallbackQuery(cq.id, '⛔ Sin permiso para consultar el Centinela de Liquidez.');
                    return;
                }
                await answerCallbackQuery(cq.id, '🛡️ Evaluando liquidez y tránsito...');
                sendChatAction(chatId, 'typing').catch(() => {});
                const externalDb = await getExternalDb().catch(() => null);
                const accountingDb = await getAccountingDb().catch(() => null);
                const sentinelRes = await evaluateSentinelAlerts({ db, externalDb, accountingDb });
                await sendTelegramMessage(chatId, formatSentinelMessage(sentinelRes), getSentinelInlineMarkup());
                return;
            }

            if (data.startsWith('tg_chr:')) {
                const topic = data.split(':')[1] || 'ventas';
                const ctx = fromId ? getUserConversationContext(fromId) : null;
                const targetDate = ctx?.lastDate || getDateStr(-1);
                await answerCallbackQuery(cq.id, `📊 Generando gráfica (${topic})...`);
                await buildAndSendTopicChart({
                    chatId,
                    topic,
                    targetDate,
                    effectivePerms: effPerms,
                    transport
                });
                return;
            }

            if (data.startsWith('tg_fin:') || data.startsWith('tg_apr:')) {
                const handled = await handleFinanceApprovalCallback({
                    db,
                    cq,
                    tgUser,
                    effPerms,
                    io: runtimeIo,
                    transport
                });
                if (handled) return;
            }
        } catch (execCbErr) {
            console.error('[TelegramBot] Error en callback ejecutivo:', execCbErr.message);
            await answerCallbackQuery(cq.id, '⚠️ Error procesando tu solicitud.');
            return;
        }
    }

    // Callbacks interactivos para Tickets de Soporte y Consola AGY (fail-closed)
    if (data.startsWith('agy_') || data.startsWith('ticket_')) {
        try {
            const db = getDb();
            if (!db || !cq.from) {
                await answerCallbackQuery(cq.id, '⛔ No fue posible verificar tu autorización.');
                return;
            }
            const tgUser = await resolveTelegramUser(cq.from);
            if (!tgUser || !tgUser.activo) {
                await answerCallbackQuery(cq.id, '⛔ Tu cuenta de Telegram no está autorizada.');
                return;
            }
            const effPerms = await getUserEffectivePermissions(tgUser);
            if (effPerms.inactiveInSipe) {
                await answerCallbackQuery(cq.id, '⛔ Tu usuario vinculado en SIPE está inactivo.');
                return;
            }
            const ticketTelegramAgyService = require('./ticketTelegramAgyService');
            const handled = await ticketTelegramAgyService.handleTicketCallback(
                cq,
                { sendTelegramMessage, answerCallbackQuery, editMessageReplyMarkup, sendChatAction, escapeHtml },
                { tgUser, effPerms }
            );
            if (handled) return;
        } catch (ticketCbErr) {
            console.error('[TelegramBot] Error en callback de Ticket/AGY:', ticketCbErr.message);
            await answerCallbackQuery(cq.id, '⚠️ Error procesando acción del ticket.');
            return;
        }
    }

    // Verificar autorización FAIL-CLOSED del usuario antes de ejecutar callbacks de datos sensibles
    if (
        data.startsWith('andelsa_') ||
        data.startsWith('solar_') ||
        data.startsWith('comp_') ||
        data.startsWith('pdf_rep:') ||
        data.startsWith('alert_')
    ) {
        try {
            const db = getDb();
            if (!db || !cq.from) {
                await answerCallbackQuery(cq.id, '⛔ No fue posible verificar tu sesión de Telegram.');
                return;
            }
            const tgUser = await resolveTelegramUser(cq.from);
            if (!tgUser || !tgUser.activo) {
                await answerCallbackQuery(cq.id, '⛔ Tu cuenta de Telegram no está autorizada.');
                return;
            }
            const effPerms = await getUserEffectivePermissions(tgUser);
            if (effPerms.inactiveInSipe) {
                await answerCallbackQuery(cq.id, '⛔ Tu usuario vinculado en SIPE está inactivo.');
                return;
            }
            const canCompetencia = Boolean(effPerms.precios_competencia ?? (effPerms.ventas || effPerms.alertas));
            if (data.startsWith('comp_') && !canCompetencia) {
                await answerCallbackQuery(cq.id, '⛔ No tienes permiso para consultar precios de competencia.');
                return;
            }
            if (data.startsWith('andelsa_') && !effPerms.ventas && !effPerms.saldos_banco && !effPerms.isAdmin) {
                await answerCallbackQuery(cq.id, '⛔ No tienes permiso para consultar reportes de Andelsa.');
                return;
            }
            if (data.startsWith('solar_') && !effPerms.ventas && !effPerms.alertas && !effPerms.isAdmin) {
                await answerCallbackQuery(cq.id, '⛔ No tienes permiso para consultar energía solar.');
                return;
            }
            if (data.startsWith('pdf_rep:')) {
                const reqTopic = data.replace('pdf_rep:', '').trim().toLowerCase();
                if (reqTopic === 'dossier' && !effPerms.isAdmin && !(effPerms.ventas && effPerms.saldos_banco)) {
                    await answerCallbackQuery(cq.id, '⛔ El Dossier Ejecutivo requiere permisos de Ventas y Bancos.');
                    return;
                }
                if (reqTopic.includes('banco') && !effPerms.saldos_banco && !effPerms.isAdmin) {
                    await answerCallbackQuery(cq.id, '⛔ No tienes permiso para reportes de bancos.');
                    return;
                }
                if (reqTopic.includes('cheque') && !effPerms.saldos_chequera && !effPerms.isAdmin) {
                    await answerCallbackQuery(cq.id, '⛔ No tienes permiso para reportes de chequera.');
                    return;
                }
                if ((reqTopic.includes('competencia') || reqTopic.includes('precio') || reqTopic.includes('dgehm')) && !canCompetencia) {
                    await answerCallbackQuery(cq.id, '⛔ No tienes permiso para reportes de precios de competencia.');
                    return;
                }
                if (reqTopic.includes('venta') && !effPerms.ventas && !effPerms.isAdmin) {
                    await answerCallbackQuery(cq.id, '⛔ No tienes permiso para reportes de ventas.');
                    return;
                }
                if (reqTopic.includes('andelsa') && !effPerms.ventas && !effPerms.saldos_banco && !effPerms.isAdmin) {
                    await answerCallbackQuery(cq.id, '⛔ No tienes permiso para reportes de Andelsa.');
                    return;
                }
                if (reqTopic.includes('solar') && !effPerms.ventas && !effPerms.alertas && !effPerms.isAdmin) {
                    await answerCallbackQuery(cq.id, '⛔ No tienes permiso para reportes de energía solar.');
                    return;
                }
            }
            if (data.startsWith('alert_') && !effPerms.alertas && !effPerms.ventas && !effPerms.isAdmin) {
                await answerCallbackQuery(cq.id, '⛔ No tienes permiso para gestionar alertas.');
                return;
            }
        } catch (authErr) {
            console.error('[TelegramBot] Error verificando permisos en callback (fail-closed):', authErr.message);
            await answerCallbackQuery(cq.id, '⛔ Error verificando permisos. Intenta nuevamente.');
            return;
        }
    }

    // Callbacks interactivos para Precios de la Competencia (DGEHM)
    if (data.startsWith('comp_')) {
        if (data === 'comp_sync') {
            await answerCallbackQuery(cq.id, '🔄 Sincronizando precios oficiales DGEHM...');
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const runSyncDgehm = require('../sync-dgehm-direct');
                const syncResult = await runSyncDgehm();
                queryMemoryCache.delete('competencia:precios');
                const compData = await getPreciosCompetenciaData({ forceRefresh: true });
                const syncBanner = syncResult?.success
                    ? `✅ <b>Sincronización DGEHM completada</b> (<code>${syncResult.updatedCount || compData.totalMonitoreadas || 0}</code> estaciones actualizadas)\n\n`
                    : `⚠️ <i>Sincronización finalizada con observación: ${escapeHtml(syncResult?.message || 'Usando último snapshot local')}</i>\n\n`;
                if (fromId) {
                    setUserConversationContext(fromId, { lastTopic: 'competencia', lastStationId: null });
                }
                await sendTelegramMessage(chatId, syncBanner + formatPreciosCompetenciaMessage(compData), getCompetenciaInlineMarkup());
            } catch (syncErr) {
                console.error('[TelegramBot] Error en comp_sync DGEHM:', syncErr.message);
                await sendTelegramMessage(chatId, '❌ Error al sincronizar precios con DGEHM: ' + escapeHtml(syncErr.message));
            }
            return;
        }

        await answerCallbackQuery(cq.id, 'Consultando precios de competencia...');
        try {
            const compData = await getPreciosCompetenciaData();
            if (data === 'comp_all') {
                if (fromId) {
                    setUserConversationContext(fromId, { lastTopic: 'competencia', lastStationId: null });
                }
                await sendTelegramMessage(chatId, formatPreciosCompetenciaMessage(compData), getCompetenciaInlineMarkup());
            } else if (data === 'comp_cheaper') {
                if (fromId) {
                    setUserConversationContext(fromId, { lastTopic: 'competencia', lastStationId: null });
                }
                await sendTelegramMessage(chatId, formatPreciosCompetenciaMessage(compData, { onlyCheaper: true }), getCompetenciaInlineMarkup());
            } else if (data.startsWith('comp_st:')) {
                const stId = data.split(':')[1] || '002';
                const stObj = findStationById(stId) || { id: stId, name: COMPETENCIA_STATION_NAMES[stId] || stId };
                if (fromId) {
                    setUserConversationContext(fromId, {
                        lastTopic: 'competencia',
                        lastStationId: stId,
                        lastStationName: stObj.name
                    });
                }
                await sendTelegramMessage(chatId, formatPreciosCompetenciaMessage(compData, { station: stObj }), getCompetenciaInlineMarkup(stId));
            }
        } catch (compErr) {
            console.error('[TelegramBot] Error en callback de competencia:', compErr.message);
            await sendTelegramMessage(chatId, '❌ Error al consultar precios de la competencia: ' + escapeHtml(compErr.message));
        }
        return;
    }

    // Callbacks interactivos para Andelsa / Nova SaaS (sys.sipesv.com)
    if (data.startsWith('andelsa_')) {
        await answerCallbackQuery(cq.id, 'Consultando Nova SaaS...');
        try {
            if (data === 'andelsa_inv') {
                const res = await sysSaasService.getAndelsaInventarios();
                await sendTelegramMessage(chatId, formatAndelsaInventarioMessage(res), getAndelsaInlineMarkup());
            } else if (data === 'andelsa_costos') {
                const res = await sysSaasService.getAndelsaCostos();
                await sendTelegramMessage(chatId, formatAndelsaCostosMessage(res), getAndelsaInlineMarkup());
            } else if (data === 'andelsa_cli') {
                const res = await sysSaasService.getAndelsaVentasPorCliente();
                await sendTelegramMessage(chatId, formatAndelsaVentasClienteMessage(res, 'Últimos 30 días'), getAndelsaInlineMarkup());
            } else if (data === 'andelsa_prod') {
                const res = await sysSaasService.getAndelsaVentasPorProducto();
                await sendTelegramMessage(chatId, formatAndelsaVentasProductoMessage(res, 'Últimos 30 días'), getAndelsaInlineMarkup());
            } else if (data === 'andelsa_cxc') {
                const res = await sysSaasService.getAndelsaCuentasPorCobrar();
                await sendTelegramMessage(chatId, formatAndelsaCxcMessage(res), getAndelsaInlineMarkup());
            } else if (data === 'andelsa_resumen') {
                const res = await sysSaasService.getAndelsaFinanzasResumen();
                await sendTelegramMessage(chatId, formatAndelsaFinanzasResumenMessage(res, 'Mes actual'), getAndelsaInlineMarkup());
            }
        } catch (e) {
            await sendTelegramMessage(chatId, '❌ Error al cargar datos de Andelsa: ' + escapeHtml(e.message));
        }
        return;
    }

    // Callbacks interactivos para Energía Solar
    if (data.startsWith('solar_')) {
        await answerCallbackQuery(cq.id, 'Consultando energía solar...');
        try {
            if (data === 'solar_andelsa') {
                const res = await solarEnergyService.getSolarAhorroDiario(null, 9);
                await sendTelegramMessage(chatId, formatSolarEnergyMessage(res, 'diario', 'Hoy • Andelsa'), getSolarInlineMarkup());
            } else if (data === 'solar_sanmartin') {
                const res = await solarEnergyService.getSolarAhorroDiario(null, 1);
                await sendTelegramMessage(chatId, formatSolarEnergyMessage(res, 'diario', 'Hoy • San Martín (La Loma)'), getSolarInlineMarkup());
            } else if (data === 'solar_realtime') {
                const res = await solarEnergyService.getSolarEstadoActual();
                await sendTelegramMessage(chatId, formatSolarEnergyMessage(res, 'estado_actual'), getSolarInlineMarkup());
            } else if (data === 'solar_mes') {
                const now = new Date();
                const res = await solarEnergyService.getSolarAhorroMensual(now.getFullYear(), now.getMonth() + 1);
                const mLabel = `${SPANISH_MONTH_NAMES[now.getMonth() + 1]} ${now.getFullYear()}`;
                await sendTelegramMessage(chatId, formatSolarEnergyMessage(res, 'mensual', mLabel), getSolarInlineMarkup());
            }
        } catch (e) {
            await sendTelegramMessage(chatId, '❌ Error al consultar datos solares: ' + escapeHtml(e.message));
        }
        return;
    }

    // Callbacks para generación y envío de Reportes Ejecutivos en PDF Tamaño Carta
    if (data.startsWith('pdf_rep:')) {
        const topic = data.replace('pdf_rep:', '').trim() || 'ventas';
        await answerCallbackQuery(cq.id, '📄 Generando reporte PDF tamaño Carta...');
        try {
            const ctx = fromId ? getUserConversationContext(fromId) : null;
            const targetDate = ctx?.lastDate || getDateStr(-1);
            await buildAndSendTopicPdf(chatId, topic, { targetDate });
        } catch (pdfErr) {
            console.error('[TelegramBot] Error generando PDF en callback:', pdfErr);
            await sendTelegramMessage(chatId, '❌ Error al generar el reporte PDF: ' + escapeHtml(pdfErr.message));
        }
        return;
    }

    // Caso 3: Alertas Interactivas con botones de acción rápida
    // 3.1 alert_dtl: Ver Detalle de Estación
    if (data.startsWith('alert_dtl:')) {
        const parts = data.split(':');
        const targetDate = parts[1] || getDateStr(-1);
        const stationId = parts[2] || '008';
        await answerCallbackQuery(cq.id, 'Cargando detalle...');
        try {
            const consolData = await getConsolidadoVentas(targetDate);
            const stObj = findStationById(stationId) || KNOWN_STATIONS.find(s => s.id === resolveStationId(stationId));
            const stName = stObj ? stObj.name : (stationId || 'Estación');
            const st = (consolData?.estaciones || []).find(e => 
                String(e.id) === String(stationId) || 
                String(e.saas_branch_id) === String(stationId) ||
                normalizeText(e.empresa).includes(normalizeText(stName))
            );
            const stPista = (consolData?.resumen_cierre || []).find(r => 
                normalizeText(r.estacion || r.empresa || '').includes(normalizeText(stName)) ||
                String(r.estacion_id || r.branch_id) === String(stationId)
            );
            const stTienda = (consolData?.cortes_tienda || []).find(t => 
                normalizeText(t.empresa || t.tienda_nombre || '').includes(normalizeText(stName)) ||
                String(t.estacion_id || t.branch_id) === String(stationId)
            );

            let dtlMsg = `🔍 <b>Detalle Operativo de Auditoría</b>\n`;
            dtlMsg += `⛽ <b>Estación:</b> ${escapeHtml(stName)}\n`;
            dtlMsg += `📅 <b>Fecha Auditada:</b> ${toDisplayDate(targetDate)}\n`;
            dtlMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

            if (st) {
                dtlMsg += `📊 <b>Venta de Combustibles:</b>\n`;
                dtlMsg += `• Total Dinero: <code>${moneyFmt(st.venta ?? st.total_venta ?? 0)}</code>\n`;
                dtlMsg += `• Total Galones: <code>${numFmt(st.galonaje ?? st.galones ?? 0)} gal</code>\n`;
                if (st.super) dtlMsg += `   └ Súper: <code>${numFmt(st.super)} gal</code>\n`;
                if (st.regular) dtlMsg += `   └ Regular: <code>${numFmt(st.regular)} gal</code>\n`;
                if (st.diesel) dtlMsg += `   └ Diésel: <code>${numFmt(st.diesel)} gal</code>\n`;
                if (st.ion || st.ion_diesel) dtlMsg += `   └ Ion Diésel: <code>${numFmt(st.ion ?? st.ion_diesel)} gal</code>\n`;
                dtlMsg += `\n`;
            }

            if (stPista) {
                const dif = Number(stPista.diferencia !== undefined ? stPista.diferencia : (stPista.dif || 0));
                const icon = dif < 0 ? '🔴 Faltante' : (dif > 0 ? '🟡 Sobrante' : '🟢 Cuadrado');
                dtlMsg += `⛽ <b>Cuadre de Pista y Lecturas:</b>\n`;
                dtlMsg += `• Diferencia: <code>${moneyFmt(dif)}</code> (${icon})\n`;
                if (stPista.total_venta) dtlMsg += `• Venta en Pista: <code>${moneyFmt(stPista.total_venta)}</code>\n`;
                dtlMsg += `\n`;
            }

            if (stTienda) {
                const difT = Number(stTienda.dif !== undefined ? stTienda.dif : (stTienda.diferencia || 0));
                const iconT = difT < 0 ? '🔴 Faltante' : (difT > 0 ? '🟡 Sobrante' : '🟢 Cuadrado');
                dtlMsg += `🛒 <b>Tienda (${escapeHtml(stTienda.empresa || stTienda.tienda_nombre || 'Tienda')}):</b>\n`;
                dtlMsg += `• Venta Tienda: <code>${moneyFmt(stTienda.venta || 0)}</code>\n`;
                if (stTienda.gastos) dtlMsg += `• Gastos: <code>${moneyFmt(stTienda.gastos)}</code>\n`;
                dtlMsg += `• Diferencia: <code>${moneyFmt(difT)}</code> (${iconT})\n\n`;
            }

            dtlMsg += `<i>Acción registrada en auditoría de SIPE Admin.</i>`;
            await sendTelegramMessage(chatId, dtlMsg, getMainReplyKeyboard());
        } catch (err) {
            console.error('[TelegramBot] Error en alert_dtl:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar detalle: ' + escapeHtml(err.message), getMainReplyKeyboard());
        }
        return;
    }

    // 3.2 alert_just: Justificar Descuadre de Estación
    if (data.startsWith('alert_just:')) {
        const parts = data.split(':');
        const targetDate = parts[1] || getDateStr(-1);
        const stationId = parts[2] || '008';
        await answerCallbackQuery(cq.id, 'Modo justificación activado');
        const stObj = findStationById(stationId) || KNOWN_STATIONS.find(s => s.id === resolveStationId(stationId));
        const stName = stObj ? stObj.name : (stationId || 'Estación');

        if (fromId) {
            pendingAlertJustifications.set(fromId, {
                date: targetDate,
                stationId,
                stationName: stName,
                timestamp: Date.now()
            });
        }

        const justMsg = `🏷️ <b>Justificación de Descuadre</b>\n\n` +
            `⛽ <b>Estación:</b> ${escapeHtml(stName)}\n` +
            `📅 <b>Fecha Auditada:</b> ${toDisplayDate(targetDate)}\n\n` +
            `Por favor, escribe a continuación el motivo o justificación de esta discrepancia ` +
            `(ej. calibración de mangueras, derrame menor reportado, turno en proceso de conciliación):\n\n` +
            `<i>(Escribe tu justificación en el chat para registrarla en la bitácora de auditoría, o escribe /cancelar para abortar)</i>`;

        await sendTelegramMessage(chatId, justMsg, getMainReplyKeyboard());
        return;
    }

    // 3.3 alert_recheck: Re-verificar Turno en Tiempo Real
    if (data.startsWith('alert_recheck:')) {
        const parts = data.split(':');
        const targetDate = parts[1] || getDateStr(-1);
        const stationId = parts[2] || '008';
        await answerCallbackQuery(cq.id, '🔄 Re-verificando en tiempo real...');
        try {
            const consolData = await getConsolidadoVentas(targetDate);
            const stObj = findStationById(stationId) || KNOWN_STATIONS.find(s => s.id === resolveStationId(stationId));
            const stName = stObj ? stObj.name : (stationId || 'Estación');
            const stPista = (consolData?.resumen_cierre || []).find(r => 
                normalizeText(r.estacion || r.empresa || '').includes(normalizeText(stName)) ||
                String(r.estacion_id || r.branch_id) === String(stationId)
            );
            const pistaDif = stPista ? Number(stPista.diferencia !== undefined ? stPista.diferencia : (stPista.dif || 0)) : 0;
            const isSquared = Math.abs(pistaDif) <= 10;

            let recheckMsg = `🔄 <b>Re-verificación de Cuadre en Tiempo Real</b>\n`;
            recheckMsg += `⛽ <b>Estación:</b> ${escapeHtml(stName)}\n`;
            recheckMsg += `📅 <b>Fecha:</b> ${toDisplayDate(targetDate)}\n`;
            recheckMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

            if (isSquared) {
                recheckMsg += `✅ <b>¡Turno conciliado / cuadrado!</b>\n\n`;
                recheckMsg += `• Diferencia actual en pista: <code>${moneyFmt(pistaDif)}</code>\n`;
                recheckMsg += `• Estado: <b>En orden (dentro de tolerancia operativa)</b>\n\n`;
                recheckMsg += `<i>El turno ya fue cuadrado satisfactoriamente en el sistema.</i>`;
            } else {
                recheckMsg += `⚠️ <b>Discrepancia aún pendiente de cuadre:</b>\n\n`;
                recheckMsg += `• Diferencia en pista: <code>${moneyFmt(pistaDif)}</code> ${pistaDif < 0 ? '(🔴 Faltante)' : '(🟡 Sobrante)'}\n`;
                if (stPista?.total_venta) {
                    recheckMsg += `• Venta total en pista: <code>${moneyFmt(stPista.total_venta)}</code>\n`;
                }
                recheckMsg += `\n<i>Recomendación: Contactar al encargado de estación para completar la captura del cierre.</i>`;
            }

            await sendTelegramMessage(chatId, recheckMsg, getMainReplyKeyboard());
        } catch (err) {
            console.error('[TelegramBot] Error en alert_recheck:', err);
            await sendTelegramMessage(chatId, '❌ Error al re-verificar estado: ' + escapeHtml(err.message), getMainReplyKeyboard());
        }
        return;
    }

    // 3.4 alert_sum: Resumen Global del Día
    if (data.startsWith('alert_sum:')) {
        const parts = data.split(':');
        const targetDate = parts[1] || getDateStr(-1);
        await answerCallbackQuery(cq.id, 'Cargando resumen del día...');
        try {
            const consolData = await getConsolidadoVentas(targetDate);
            const sumMsg = formatVentasMessage(consolData, targetDate);
            await sendTelegramMessage(chatId, sumMsg, getMainReplyKeyboard());
        } catch (err) {
            console.error('[TelegramBot] Error en alert_sum:', err);
            await sendTelegramMessage(chatId, '❌ Error al cargar resumen del día: ' + escapeHtml(err.message), getMainReplyKeyboard());
        }
        return;
    }
};

/**
 * Verificar o registrar usuario en telegram_usuarios
 */
const resolveTelegramUser = async (from) => {
    const db = getDb();
    if (!db) return null;

    const telegramUserId = String(from.id);
    const username = from.username ? `@${from.username}` : null;
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';

    try {
        const [rows] = await db.query(
            'SELECT * FROM telegram_usuarios WHERE telegram_user_id = ? LIMIT 1',
            [telegramUserId]
        );

        if (rows && rows.length > 0) {
            const user = rows[0];
            // Actualizar datos de perfil e interacción
            await db.query(
                `UPDATE telegram_usuarios 
                 SET telegram_username = ?, first_name = ?, last_name = ?, last_interaction = NOW() 
                 WHERE id = ?`,
                [username, firstName, lastName, user.id]
            );
            return { ...user, telegram_username: username, first_name: firstName, last_name: lastName };
        }

        // No realizar autovinculación por nombre de pantalla (first_name/last_name) para evitar suplantación.
        // La vinculación con un usuario de SIPE (user_id) debe ser asignada por un Administrador en el panel de seguridad.
        const matchedUserId = null;

        // Si no existe, insertar con activo = 0 y privilegios mínimos para aprobación administrativa
        const [insertRes] = await db.query(
            `INSERT INTO telegram_usuarios 
             (telegram_user_id, telegram_username, first_name, last_name, user_id, activo, permiso_ventas, permiso_saldos_banco, permiso_saldos_chequera, permiso_alertas, notas, last_interaction)
             VALUES (?, ?, ?, ?, ?, 0, 1, 0, 0, 0, 'Solicitud automática desde Telegram (pendiente de vinculación)', NOW())`,
            [telegramUserId, username, firstName, lastName, matchedUserId]
        );

        return {
            id: insertRes.insertId,
            telegram_user_id: telegramUserId,
            telegram_username: username,
            first_name: firstName,
            last_name: lastName,
            user_id: matchedUserId,
            activo: 0,
            permiso_ventas: 1,
            permiso_saldos_banco: 0,
            permiso_saldos_chequera: 0,
            permiso_alertas: 0
        };
    } catch (err) {
        console.error('[TelegramBot] Error resolviendo usuario:', err.message);
        return null;
    }
};

/**
 * Resolver permisos efectivos del usuario de Telegram.
 * Si está vinculado a un usuario de SIPE Admin (user_id),
 * hereda dinámicamente sus permisos de acuerdo con su rol y accesos configurados.
 */
const getUserEffectivePermissions = async (user) => {
    if (!user) {
        return {
            isLinked: false,
            linkedUser: null,
            inactiveInSipe: false,
            ventas: false,
            saldos_banco: false,
            saldos_chequera: false,
            alertas: false,
            precios_competencia: false,
            tareas: false,
            control_pagos: false,
            cumpleanos: false,
            finanzas_prestamos: false,
            aprobaciones: false
        };
    }

    if (!user.user_id) {
        return {
            isLinked: false,
            linkedUser: null,
            inactiveInSipe: false,
            ventas: Boolean(user.permiso_ventas),
            saldos_banco: Boolean(user.permiso_saldos_banco),
            saldos_chequera: Boolean(user.permiso_saldos_chequera),
            alertas: Boolean(user.permiso_alertas),
            precios_competencia: Boolean(user.permiso_ventas || user.permiso_alertas),
            tareas: false,
            control_pagos: Boolean(user.permiso_saldos_banco),
            cumpleanos: Boolean(user.permiso_ventas || user.permiso_alertas),
            finanzas_prestamos: Boolean(user.permiso_saldos_banco),
            aprobaciones: false
        };
    }

    const db = getDb();
    if (!db) {
        return {
            isLinked: true,
            linkedUser: null,
            inactiveInSipe: false,
            isAdmin: false,
            sipePermissions: [],
            ventas: Boolean(user.permiso_ventas),
            saldos_banco: Boolean(user.permiso_saldos_banco),
            saldos_chequera: Boolean(user.permiso_saldos_chequera),
            alertas: Boolean(user.permiso_alertas),
            precios_competencia: Boolean(user.permiso_ventas || user.permiso_alertas),
            tareas: false,
            control_pagos: Boolean(user.permiso_saldos_banco),
            cumpleanos: Boolean(user.permiso_ventas || user.permiso_alertas),
            finanzas_prestamos: Boolean(user.permiso_saldos_banco),
            aprobaciones: false
        };
    }

    try {
        const [rows] = await db.query(`
            SELECT u.id, u.username, u.nombre, u.email, u.status, u.role_id, r.name as role_name,
                   GROUP_CONCAT(p.name) as permissions
            FROM users u
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE u.id = ?
            GROUP BY u.id
        `, [user.user_id]);

        if (!rows || rows.length === 0) {
            return {
                isLinked: false,
                linkedUser: null,
                inactiveInSipe: false,
                isAdmin: false,
                sipePermissions: [],
                ventas: Boolean(user.permiso_ventas),
                saldos_banco: Boolean(user.permiso_saldos_banco),
                saldos_chequera: Boolean(user.permiso_saldos_chequera),
                alertas: Boolean(user.permiso_alertas),
                precios_competencia: Boolean(user.permiso_ventas || user.permiso_alertas),
                tareas: false,
                control_pagos: Boolean(user.permiso_saldos_banco),
                cumpleanos: Boolean(user.permiso_ventas || user.permiso_alertas),
                finanzas_prestamos: Boolean(user.permiso_saldos_banco),
                aprobaciones: false
            };
        }

        const su = rows[0];
        if (su.status && su.status !== 'active') {
            return {
                isLinked: true,
                linkedUser: su,
                inactiveInSipe: true,
                isAdmin: false,
                sipePermissions: [],
                ventas: false,
                saldos_banco: false,
                saldos_chequera: false,
                alertas: false,
                precios_competencia: false,
                tareas: false,
                control_pagos: false,
                cumpleanos: false,
                finanzas_prestamos: false,
                aprobaciones: false
            };
        }

        let permsList = (su.permissions || '').split(',').map((p) => p.trim()).filter(Boolean);
        // Evitar truncamiento por límite de 1024 bytes de GROUP_CONCAT consultando permisos directos del rol si hay role_id
        if (su.role_id) {
            try {
                const [permRows] = await db.query(
                    `SELECT p.name FROM role_permissions rp INNER JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id = ?`,
                    [su.role_id]
                );
                if (Array.isArray(permRows) && permRows.length > 0) {
                    permsList = permRows.map((r) => String(r.name || '').trim()).filter(Boolean);
                }
            } catch (_) {
                // Fallback a GROUP_CONCAT en mocks de prueba
            }
        }
        const isAdmin = Number(su.role_id) === 1 || su.role_name === 'Administrator' || su.role_name === 'Super Administrator' || permsList.includes('/dashboard/seguridad/telegram') || permsList.includes('manage_telegram');

        const hasVentas = isAdmin || permsList.includes('/dashboard/consultas/estaciones/ventas');
        const hasBancos = isAdmin || permsList.includes('/dashboard/bancos/reportes/saldos-bancos') || permsList.includes('/dashboard/bancos/cuentas') || permsList.includes('/dashboard/bancos/movimientos');
        const hasChequera = isAdmin || permsList.includes('/dashboard/bancos/reportes/saldos-chequera') || permsList.includes('/dashboard/bancos/cheques');
        const hasAlertas = isAdmin || permsList.includes('/dashboard/consultas/estaciones/diferencias-combustible') || permsList.includes('/dashboard/consultas/estaciones/resumen-cierre');
        const hasPreciosCompetencia = isAdmin ||
            hasVentas ||
            permsList.includes('manage_precios_competencia') ||
            permsList.includes('/dashboard/consultas/estaciones/precios-competencia') ||
            permsList.includes('/dashboard/consultas/estaciones/precios') ||
            permsList.includes('/dashboard/estrategia/combustible') ||
            permsList.includes('/dashboard/estrategia/torre-control');
        const hasTareas = isAdmin ||
            permsList.includes('manage_tasks') ||
            permsList.includes('/dashboard/operaciones/tareas');
        const hasControlPagos = isAdmin ||
            hasBancos ||
            permsList.includes('manage_recordatorios') ||
            permsList.includes('/dashboard/operaciones/recordatorios');
        const hasCumpleanos = isAdmin ||
            hasVentas ||
            hasAlertas ||
            permsList.includes('/dashboard/consultas/otras/cumpleanos');
        const hasPrestamos = isAdmin ||
            hasBancos ||
            permsList.includes('/dashboard/finanzas/prestamos');
        const hasAprobaciones = canUserApproveFinancialOp({
            isAdmin,
            inactiveInSipe: false,
            linkedUser: su,
            sipePermissions: permsList
        });

        return {
            isLinked: true,
            linkedUser: su,
            inactiveInSipe: false,
            isAdmin: Boolean(isAdmin),
            sipePermissions: permsList,
            ventas: hasVentas,
            saldos_banco: hasBancos,
            saldos_chequera: hasChequera,
            alertas: hasAlertas,
            precios_competencia: hasPreciosCompetencia,
            tareas: hasTareas,
            control_pagos: hasControlPagos,
            cumpleanos: hasCumpleanos,
            finanzas_prestamos: hasPrestamos,
            aprobaciones: hasAprobaciones
        };
    } catch (err) {
        console.error('[TelegramBot] Error resolviendo permisos heredados:', err.message);
        return {
            isLinked: true,
            linkedUser: null,
            inactiveInSipe: false,
            isAdmin: false,
            ventas: Boolean(user.permiso_ventas),
            saldos_banco: Boolean(user.permiso_saldos_banco),
            saldos_chequera: Boolean(user.permiso_saldos_chequera),
            alertas: Boolean(user.permiso_alertas),
            precios_competencia: Boolean(user.permiso_ventas || user.permiso_alertas),
            tareas: false,
            control_pagos: Boolean(user.permiso_saldos_banco),
            cumpleanos: Boolean(user.permiso_ventas || user.permiso_alertas),
            finanzas_prestamos: Boolean(user.permiso_saldos_banco),
            aprobaciones: false
        };
    }
};

/**
 * Registrar en bitácora de consultas de Telegram
 */
const logTelegramQuery = async (telegramUserId, comando, consulta, autorizado = 1) => {
    try {
        const db = getDb();
        if (!db) return;
        await db.query(
            'INSERT INTO telegram_bitacora (telegram_user_id, comando, consulta, autorizado) VALUES (?, ?, ?, ?)',
            [String(telegramUserId), String(comando).slice(0, 100), String(consulta || '').slice(0, 250), autorizado ? 1 : 0]
        );
    } catch (e) {
        console.warn('[TelegramBot] No se pudo guardar bitácora de telegram:', e.message);
    }
};

/**
 * Despachador inteligente de lenguaje natural
 */
const handleSmartNaturalLanguageQuery = async (user, rawText, chatId, effectivePerms, keyboard, contextOptions = {}) => {
    const userContext = contextOptions.userContext || (user?.telegram_user_id ? getUserConversationContext(user.telegram_user_id) : null);
    const parsed = parseNaturalLanguageQuery(rawText, userContext);
    if (!parsed) return false;

    const sendFeedback = contextOptions.customSendFeedback || ((cId, text, meta) => {
        const fullText = (contextOptions.voicePrefix || '') + text;
        return sendTelegramResponseWithFeedback(cId, fullText, meta);
    });

    // -0.4 Asignar Tareas a 1 o más colaboradores (Lenguaje Natural o Asistente Interactivo)
    if (parsed.isAsignarTarea) {
        const db = getDb();
        const externalDb = await getExternalDb().catch(() => null);
        const candidates = await resolveCollaboratorCandidates(db);
        const parsedTask = parseMultiUserTaskInput(rawText, candidates);
        const creatorSipeId = effectivePerms?.linkedUser?.id ? Number(effectivePerms.linkedUser.id) : (user?.user_id ? Number(user.user_id) : null);
        const canManageTeam = Boolean(effectivePerms?.tareas || effectivePerms?.isAdmin);

        if (parsedTask.isComplete) {
            const assignsOther = parsedTask.assignees.some(a => !creatorSipeId || Number(a.user_id) !== creatorSipeId);
            if (assignsOther && !canManageTeam) {
                await logTelegramQuery(user.telegram_user_id, rawText, 'Permiso denegado asignar tarea', 0);
                await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⚠️ No tienes permiso asignado para asignar tareas a otros colaboradores.', keyboard);
                return true;
            }
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const res = await createMultiUserTasksFromTelegram({
                    db,
                    externalDb,
                    creatorTgUser: user,
                    creatorEffPerms: effectivePerms,
                    assignees: parsedTask.assignees,
                    titulo: parsedTask.titulo,
                    descripcion: rawText,
                    fecha_vencimiento: parsedTask.fecha_vencimiento,
                    hora_limite: parsedTask.hora_limite,
                    prioridad: parsedTask.prioridad,
                    categoria: parsedTask.categoria,
                    enviar_ahora: true
                });
                await logTelegramQuery(
                    user.telegram_user_id,
                    rawText,
                    `Tarea Multi-Usuario (${res.createdTasks.length}): ${parsedTask.titulo.slice(0, 80)}`,
                    1
                );
                await sendTelegramMessage(
                    chatId,
                    (contextOptions.voicePrefix || '') + formatMultiTaskCreationResultMessage(res, parsedTask),
                    keyboard
                );
                return true;
            } catch (taskErr) {
                await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error asignando tarea: ' + escapeHtml(taskErr.message), keyboard);
                return true;
            }
        }

        // Datos parciales (ej. "Asignar tarea a Corina y Raul" sin título -> abrir paso 2 directo; o abrir wizard completo)
        if (parsedTask.assignees.length > 0 && !parsedTask.titulo) {
            const assignsOther = parsedTask.assignees.some(a => !creatorSipeId || Number(a.user_id) !== creatorSipeId);
            if (assignsOther && !canManageTeam) {
                await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⚠️ No tienes permiso asignado para asignar tareas a otros colaboradores.', keyboard);
                return true;
            }
            const wiz = {
                step: 'ENTER_TITLE',
                candidates,
                selectedKeys: parsedTask.assignees.map(a => a.key),
                titulo: '',
                descripcion: '',
                prioridad: parsedTask.prioridad || 'media',
                fecha_vencimiento: parsedTask.fecha_vencimiento,
                hora_limite: parsedTask.hora_limite || '17:00',
                categoria: parsedTask.categoria || 'Operaciones',
                updatedAt: Date.now()
            };
            pendingTaskWizards.set(String(user.telegram_user_id), wiz);
            const names = parsedTask.assignees.map(a => escapeHtml(a.nombre)).join(', ');
            await sendTelegramMessage(
                chatId,
                (contextOptions.voicePrefix || '') +
                `✍️ <b>ASIGNAR TAREA A: ${names}</b>\n\n` +
                `Ahora escribe (o envía nota de voz con) el título de la tarea y plazo:\n` +
                `<i>Ejemplo: "Revisar inventario de lubricantes mañana 10am"</i>\n<i>(o envía /cancelar)</i>`,
                keyboard
            );
            return true;
        }

        await startTaskAssignmentWizard({
            db,
            chatId,
            tgUser: user,
            effPerms: effectivePerms,
            transport: { sendTelegramMessage, getMainReplyKeyboard }
        });
        return true;
    }

    // -0.3 Programar Evento / Reunión / Recordatorio en MiBot
    if (parsed.isAgendarEvento) {
        const db = getDb();
        const externalDb = await getExternalDb().catch(() => null);
        const candidates = await resolveCollaboratorCandidates(db);
        const parsedEvt = parseScheduleEventInput(rawText, candidates, user.id);

        if (parsedEvt.isComplete) {
            const creatorSipeId = effectivePerms?.linkedUser?.id ? Number(effectivePerms.linkedUser.id) : (user?.user_id ? Number(user.user_id) : null);
            const includesOther = parsedEvt.participants.some(p => Number(p.telegram_usuario_id) !== Number(user.id));
            if (includesOther && !effectivePerms?.tareas && !effectivePerms?.isAdmin) {
                await logTelegramQuery(user.telegram_user_id, rawText, 'Permiso denegado agendar evento grupal', 0);
                await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⚠️ No tienes permiso para agendar eventos a otros usuarios; solo recordatorios personales.', keyboard);
                return true;
            }
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const mibotService = require('./mibotNotifierService');
                const actorUser = {
                    id: creatorSipeId,
                    nombre: effectivePerms?.linkedUser?.nombre || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Telegram',
                    username: effectivePerms?.linkedUser?.username || user.telegram_username || 'telegram'
                };
                const res = await mibotService.createMibotProgramacion({
                    db,
                    externalDb,
                    payload: {
                        tipo: parsedEvt.tipo,
                        titulo: parsedEvt.titulo.slice(0, 175),
                        mensaje: rawText.trim(),
                        destinatario_ids: parsedEvt.participants.map(p => Number(p.telegram_usuario_id)),
                        enviar_ahora: false,
                        programado_para: parsedEvt.programado_para,
                        frecuencia: parsedEvt.frecuencia
                    },
                    actorUser,
                    skipSystemNotification: true
                });
                const prog = res.programacion;
                const meta = mibotService.TIPO_META[prog.tipo] || mibotService.TIPO_META.REUNION;
                const destNames = (prog.destinatarios || []).map(d => escapeHtml(d.nombre_destinatario)).join(', ');
                await logTelegramQuery(user.telegram_user_id, rawText, `Evento Programado: ${prog.titulo.slice(0, 80)}`, 1);
                const msg = [
                    `✅ <b>${meta.emoji} RECORDATORIO PROGRAMADO EN MIBOT</b>`,
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `📌 <b>${escapeHtml(prog.titulo)}</b>`,
                    `• 🗓️ <b>Fecha / Hora:</b> ${mibotService.formatDisplayDateTimeSv(prog.programado_para)}`,
                    `• 🔁 <b>Frecuencia:</b> ${mibotService.FRECUENCIA_LABELS[prog.frecuencia] || prog.frecuencia}`,
                    `• 👥 <b>Destinatarios:</b> ${destNames}`,
                    ``,
                    `<i>MiBot te enviará el aviso personal con botones de confirmación en la fecha programada.</i>`
                ].join('\n');
                await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + msg, getEventosInlineMarkup('semana'));
                return true;
            } catch (evtErr) {
                await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error programando evento: ' + escapeHtml(evtErr.message), keyboard);
                return true;
            }
        }

        const defaultTipo = /\breunion|junta|cita\b/i.test(parsed.normalized) ? 'REUNION' : 'TAREA';
        await startEventScheduleWizard({
            db,
            chatId,
            tgUser: user,
            defaultTipo,
            transport: { sendTelegramMessage }
        });
        return true;
    }

    // -0.2 Consultar Tareas Activas / Equipo / Vencidas
    if (parsed.isConsultaTareas) {
        const db = getDb();
        const sipeUserId = effectivePerms?.linkedUser?.id ? Number(effectivePerms.linkedUser.id) : (user?.user_id ? Number(user.user_id) : null);
        const canManageTeam = Boolean(effectivePerms?.tareas || effectivePerms?.isAdmin);
        const candidates = canManageTeam ? await resolveCollaboratorCandidates(db) : [];
        const personMatch = rawText.match(/\btareas\s+de\s+([a-záéíóúñÁÉÍÓÚÑ0-9_.-]+)/i);
        let filterPersonQuery = null;
        if (personMatch && canManageTeam) {
            const pWord = normalizeText(personMatch[1]);
            if (!['hoy', 'ayer', 'esta', 'equipo', 'todos', 'sipe'].includes(pWord)) {
                const matchedCand = candidates.find(c => normalizeText(c.nombre).includes(pWord) || normalizeText(c.username || '').includes(pWord));
                filterPersonQuery = matchedCand ? matchedCand.nombre.split(' ')[0] : personMatch[1];
            }
        }
        const scope = /\b(vencidas?|atrasadas?)\b/i.test(parsed.normalized)
            ? 'overdue'
            : ((/\b(equipo|todas|todos)\b/i.test(parsed.normalized) || filterPersonQuery) && canManageTeam ? 'team' : 'mine');

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const tasksData = await getTasksSummaryData({
                db,
                sipeUserId,
                canManageTeam,
                scope,
                filterPersonQuery
            });
            await logTelegramQuery(user.telegram_user_id, rawText, `Consulta Tareas (${tasksData.scope})`, 1);
            await sendTelegramMessage(
                chatId,
                (contextOptions.voicePrefix || '') + formatTasksMessage(tasksData),
                getTasksInlineMarkup(tasksData)
            );
            return true;
        } catch (tErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error consultando tareas: ' + escapeHtml(tErr.message), keyboard);
            return true;
        }
    }

    // -0.1 Consultar Agenda y Eventos Programados (MiBot + Tareas + Control de Pagos + Cumpleaños)
    if (parsed.isEventosAgenda) {
        const db = getDb();
        const externalDb = await getExternalDb().catch(() => null);
        const accountingDb = await getAccountingDb().catch(() => null);
        const sipeUserId = effectivePerms?.linkedUser?.id ? Number(effectivePerms.linkedUser.id) : (user?.user_id ? Number(user.user_id) : null);
        const canManageTeam = Boolean(effectivePerms?.tareas || effectivePerms?.isAdmin);
        const canControlPagos = Boolean(effectivePerms?.control_pagos || effectivePerms?.saldos_banco || effectivePerms?.isAdmin);

        let range = 'semana';
        if (/\bhoy\b/i.test(parsed.normalized)) range = 'hoy';
        else if (/\bmanana\b/i.test(parsed.normalized)) range = 'manana';
        else if (/\bmes\b/i.test(parsed.normalized)) range = 'mes';

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const agendaData = await getEventosProgramadosData({
                db,
                externalDb,
                accountingDb,
                telegramUserId: user.telegram_user_id,
                sipeUserId,
                range,
                includeControlPagos: canControlPagos,
                includeTeam: canManageTeam
            });
            await logTelegramQuery(user.telegram_user_id, rawText, `Agenda Eventos (${range})`, 1);
            await sendTelegramMessage(
                chatId,
                (contextOptions.voicePrefix || '') + formatEventosProgramadosMessage(agendaData),
                getEventosInlineMarkup(range)
            );
            return true;
        } catch (agErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error consultando agenda de eventos: ' + escapeHtml(agErr.message), keyboard);
            return true;
        }
    }

    // -0.05 Consulta de Cumpleaños del Personal
    if (parsed.isCumpleanos) {
        const canCumpleanos = Boolean(effectivePerms?.cumpleanos ?? (effectivePerms?.ventas || effectivePerms?.alertas || effectivePerms?.isAdmin));
        if (!canCumpleanos) {
            await logTelegramQuery(user.telegram_user_id, rawText, 'Permiso denegado cumpleaños', 0);
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⚠️ No tienes permiso asignado para consultar cumpleaños del personal.', keyboard);
            return true;
        }
        const accountingDb = await getAccountingDb().catch(() => null);
        let scope = 'semana';
        if (/\bhoy\b/i.test(parsed.normalized)) scope = 'hoy';
        else if (parsed.isMonthly || /\b(mes|mensual)\b/i.test(parsed.normalized)) scope = 'mes';

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const bData = await getCumpleanosData({
                accountingDb,
                scope,
                targetMonth: parsed.targetMonth || null
            });
            await logTelegramQuery(user.telegram_user_id, rawText, `Cumpleaños (${scope})`, 1);
            await sendFeedback(chatId, formatCumpleanosMessage(bData), {
                user,
                query: rawText,
                reply_markup: getCumpleanosInlineMarkup(scope)
            });
            return true;
        } catch (bErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error consultando cumpleaños: ' + escapeHtml(bErr.message), keyboard);
            return true;
        }
    }

    // -0.04 Gráfica Visual PNG por Tema (prioridad antes de consultas de texto genéricas)
    if (parsed.isGrafica) {
        try {
            await logTelegramQuery(user.telegram_user_id, rawText, `Gráfica PNG (${parsed.graficaTopic || 'ventas'})`, 1);
            await buildAndSendTopicChart({
                chatId,
                topic: parsed.graficaTopic || 'ventas',
                targetDate: parsed.targetDate,
                effectivePerms,
                transport: { sendTelegramMessage, sendChatAction, sendTelegramPhoto }
            });
            return true;
        } catch (chrErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error generando gráfica: ' + escapeHtml(chrErr.message), keyboard);
            return true;
        }
    }

    // -0.03 Briefing Ejecutivo en Audio TTS (Gemini 3.8 Flash TTS)
    if (parsed.isAudioResumen) {
        try {
            await logTelegramQuery(user.telegram_user_id, rawText, 'Resumen Ejecutivo Audio TTS', 1);
            await buildAndSendExecutiveAudio({
                chatId,
                user,
                effectivePerms,
                targetDate: parsed.targetDate,
                transport: { sendTelegramMessage, sendChatAction, sendTelegramAudio }
            });
            return true;
        } catch (audErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error generando audio ejecutivo: ' + escapeHtml(audErr.message), keyboard);
            return true;
        }
    }

    // -0.02 Centinela 24/7 de Liquidez y Tránsito
    if (parsed.isCentinela) {
        if (!effectivePerms.alertas && !effectivePerms.saldos_banco && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⚠️ No tienes permiso asignado para consultar el Centinela de Liquidez.', keyboard);
            return true;
        }
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const db = getDb();
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const sentinelRes = await evaluateSentinelAlerts({ db, externalDb, accountingDb });
            await logTelegramQuery(user.telegram_user_id, rawText, 'Centinela Liquidez NLU', 1);
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + formatSentinelMessage(sentinelRes), getSentinelInlineMarkup());
            return true;
        } catch (sentErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error ejecutando Centinela: ' + escapeHtml(sentErr.message), keyboard);
            return true;
        }
    }

    // -0.015 Bandeja de Aprobaciones Gerenciales
    if (parsed.isAprobaciones) {
        if (!canUserApproveFinancialOp(effectivePerms)) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⛔ Solo Gerencia o Administración puede consultar y resolver aprobaciones.', keyboard);
            return true;
        }
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const rows = await listApprovalsData({ db: getDb(), estado: 'PENDIENTE' });
            await logTelegramQuery(user.telegram_user_id, rawText, 'Aprobaciones Pendientes', 1);
            await sendTelegramMessage(
                chatId,
                (contextOptions.voicePrefix || '') + formatApprovalsListMessage(rows, 'PENDIENTE'),
                getApprovalsListMarkup(rows) || keyboard
            );
            return true;
        } catch (aprErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error cargando aprobaciones: ' + escapeHtml(aprErr.message), keyboard);
            return true;
        }
    }

    // -0.01 Flujo de Caja Proyectado 30/60 días
    if (parsed.isFlujoCaja) {
        if (!effectivePerms.saldos_banco && !effectivePerms.control_pagos && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⚠️ No tienes permiso asignado para consultar flujo de caja.', keyboard);
            return true;
        }
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const flujoData = await getFlujoResumenData({ horizon: parsed.flujoHorizon || 30 });
            await logTelegramQuery(user.telegram_user_id, rawText, `Flujo de Caja ${flujoData.horizon}d`, 1);
            await sendFeedback(chatId, formatFlujoMessage(flujoData), {
                user,
                query: rawText,
                reply_markup: getFlujoInlineMarkup(flujoData.horizon)
            });
            return true;
        } catch (flErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error proyectando flujo de caja: ' + escapeHtml(flErr.message), keyboard);
            return true;
        }
    }

    // -0.008 Préstamos Bancarios
    if (parsed.isPrestamos) {
        if (!effectivePerms.saldos_banco && !effectivePerms.finanzas_prestamos && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⚠️ No tienes permiso asignado para consultar préstamos bancarios.', keyboard);
            return true;
        }
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const prestData = await getPrestamosResumenData({ db: getDb(), estado: 'activo' });
            await logTelegramQuery(user.telegram_user_id, rawText, 'Préstamos Bancarios', 1);
            await sendFeedback(chatId, formatPrestamosMessage(prestData), {
                user,
                query: rawText,
                reply_markup: getPrestamosInlineMarkup('activo')
            });
            return true;
        } catch (prErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error consultando préstamos: ' + escapeHtml(prErr.message), keyboard);
            return true;
        }
    }

    // -0.006 Créditos de Flotas y Riesgo Crediticio
    if (parsed.isCreditosFlota) {
        if (!effectivePerms.ventas && !effectivePerms.saldos_banco && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '⚠️ No tienes permiso asignado para consultar créditos de flotas.', keyboard);
            return true;
        }
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const filter = /\b(mora|vencid|critico|riesgo|bloque)\b/i.test(parsed.normalized) ? 'critico' : 'todos';
            const credData = await getCreditosResumenData({ filter });
            await logTelegramQuery(user.telegram_user_id, rawText, `Créditos Flotas (${filter})`, 1);
            await sendFeedback(chatId, formatCreditosMessage(credData), {
                user,
                query: rawText,
                reply_markup: getCreditosInlineMarkup(filter)
            });
            return true;
        } catch (crErr) {
            await sendTelegramMessage(chatId, (contextOptions.voicePrefix || '') + '❌ Error consultando créditos de flotas: ' + escapeHtml(crErr.message), keyboard);
            return true;
        }
    }

    // 0.0 Consulta de Precios de la Competencia (DGEHM)
    if (parsed.isCompetencia) {
        const canViewCompetencia = Boolean(
            effectivePerms?.precios_competencia ?? (effectivePerms?.ventas || effectivePerms?.alertas)
        );
        if (!canViewCompetencia) {
            await logTelegramQuery(user.telegram_user_id, rawText, 'Permiso denegado (precios competencia)', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar precios de la competencia.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const compData = await getPreciosCompetenciaData();
            const targetStation = (parsed.matchedStation && parsed.matchedStation.id !== 'ANDELSA') ? parsed.matchedStation : null;
            const msg = formatPreciosCompetenciaMessage(compData, {
                station: targetStation,
                fuel: parsed.matchedFuel,
                brand: parsed.matchedCompetitorBrand,
                onlyCheaper: parsed.onlyCheaper,
                serviceType: parsed.competenciaServiceType
            });
            await logTelegramQuery(
                user.telegram_user_id,
                rawText,
                `Precios Competencia${targetStation ? ` (${targetStation.name})` : ''}${parsed.matchedFuel ? ` [${parsed.matchedFuel.key}]` : ''}`,
                1
            );
            setUserConversationContext(user?.telegram_user_id, {
                lastTopic: 'competencia',
                lastStationId: targetStation?.id || null,
                lastStationName: targetStation?.name || null,
                lastProduct: parsed.matchedFuel?.key || null,
                query: rawText
            });
            await sendFeedback(chatId, msg, {
                user,
                query: rawText,
                reply_markup: getCompetenciaInlineMarkup(targetStation?.id || null)
            });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de precios de competencia:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar los precios de la competencia: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.1 Consulta de Energía Solar y Baterías (Paneles, Ahorro, Estado de Batería, Autonomía)
    if (parsed.isSolar) {
        if (!effectivePerms.ventas && !effectivePerms.alertas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar datos de energía solar.', keyboard);
            return true;
        }

        const norm = parsed.normalized;
        const wantsRealtime = /\b(estado|actual|tiempo real|ahorita|bateria|baterias|soc|autonomia|carga)\b/i.test(norm) &&
                              !/\b(ahorro|mes|mensual|ayer|dia|rango|total)\b/i.test(norm);

        const targetStationId = parsed.matchedStation ? (parsed.matchedStation.branch_id || parsed.matchedStation.id || parsed.matchedStation.name) : null;
        const stationSuffix = parsed.matchedStation ? ` • ${parsed.matchedStation.name}` : '';

        if (wantsRealtime) {
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const solarData = await solarEnergyService.getSolarEstadoActual(targetStationId);
                const msg = formatSolarEnergyMessage(solarData, 'estado_actual', parsed.matchedStation ? parsed.matchedStation.name : null);
                await logTelegramQuery(user.telegram_user_id, rawText, 'Solar Estado Actual', 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastTopic: 'solar',
                    lastSolarReport: solarData,
                    lastStationId: parsed.matchedStation ? parsed.matchedStation.id : null,
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getSolarInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en consulta solar estado actual:', err);
                await sendTelegramMessage(chatId, '❌ Error al consultar estado de energía solar: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isMonthly) {
            const y = parsed.targetYear || 2026;
            const m = parsed.targetMonth || 10;
            const monthLabel = `${SPANISH_MONTH_NAMES[m]} ${y}${stationSuffix}`;
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const solarData = await solarEnergyService.getSolarAhorroMensual(y, m, targetStationId);
                const msg = formatSolarEnergyMessage(solarData, 'mensual', monthLabel);
                await logTelegramQuery(user.telegram_user_id, rawText, `Solar Mensual ${y}-${m}`, 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastPeriod: `${y}-${m}`,
                    lastTopic: 'solar',
                    lastSolarReport: solarData,
                    lastStationId: parsed.matchedStation ? parsed.matchedStation.id : null,
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getSolarInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en consulta solar mensual:', err);
                await sendTelegramMessage(chatId, '❌ Error al calcular ahorro solar mensual: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isRange) {
            const rangeLabel = `Del ${toDisplayDate(parsed.startDate)} al ${toDisplayDate(parsed.endDate)}${stationSuffix}`;
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const solarData = await solarEnergyService.getSolarAhorroRango(parsed.startDate, parsed.endDate, targetStationId);
                const msg = formatSolarEnergyMessage(solarData, 'rango', rangeLabel);
                await logTelegramQuery(user.telegram_user_id, rawText, `Solar Rango ${parsed.startDate} a ${parsed.endDate}`, 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastPeriod: `${parsed.startDate}:${parsed.endDate}`,
                    lastTopic: 'solar',
                    lastSolarReport: solarData,
                    lastStationId: parsed.matchedStation ? parsed.matchedStation.id : null,
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getSolarInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en consulta solar rango:', err);
                await sendTelegramMessage(chatId, '❌ Error al calcular ahorro solar por rango: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        // Por defecto: Ahorro Diario (de la fecha indicada o ayer)
        const targetDate = parsed.targetDate;
        const dayLabel = `${toDisplayDate(targetDate)}${stationSuffix}`;
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const solarData = await solarEnergyService.getSolarAhorroDiario(targetDate, targetStationId);
            const msg = formatSolarEnergyMessage(solarData, 'diario', dayLabel);
            await logTelegramQuery(user.telegram_user_id, rawText, `Solar Diario ${targetDate}`, 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastDate: targetDate,
                lastTopic: 'solar',
                lastSolarReport: solarData,
                lastStationId: parsed.matchedStation ? parsed.matchedStation.id : null,
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getSolarInlineMarkup() });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta solar diaria:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar ahorro solar: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.2 Consulta de Horas Pico de Venta / Horarios de Mayor Flujo
    if (parsed.isHourlyPeak) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar análisis de ventas por hora.', keyboard);
            return true;
        }

        const branchId = parsed.matchedStation ? (parsed.matchedStation.saas_branch_id || parsed.matchedStation.branch_id || null) : null;
        const stationSuffix = parsed.matchedStation ? ` en ${parsed.matchedStation.name}` : ' en la red';

        if (parsed.isRange) {
            const rangeLabel = `Del ${toDisplayDate(parsed.startDate)} al ${toDisplayDate(parsed.endDate)}${stationSuffix}`;
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const peakData = await salesHourlyService.getHorasPicoRango(parsed.startDate, parsed.endDate, branchId);
                const msg = formatHorasPicoMessage(peakData, rangeLabel, true);
                await logTelegramQuery(user.telegram_user_id, rawText, `Horas Pico Rango ${parsed.startDate} a ${parsed.endDate}`, 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastStationId: parsed.matchedStation?.id || null,
                    lastStationName: parsed.matchedStation?.name || null,
                    lastPeriod: `${parsed.startDate}:${parsed.endDate}`,
                    lastTopic: 'horas_pico',
                    lastHourReport: peakData,
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en horas pico rango:', err);
                await sendTelegramMessage(chatId, '❌ Error al analizar horas pico: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isMonthly) {
            const y = parsed.targetYear || 2026;
            const m = parsed.targetMonth || 10;
            const monthLabel = `${SPANISH_MONTH_NAMES[m]} ${y}${stationSuffix}`;
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const peakData = await salesHourlyService.getHorasPicoRango(parsed.startDate, parsed.endDate, branchId);
                const msg = formatHorasPicoMessage(peakData, monthLabel, true);
                await logTelegramQuery(user.telegram_user_id, rawText, `Horas Pico Mes ${y}-${m}`, 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastStationId: parsed.matchedStation?.id || null,
                    lastStationName: parsed.matchedStation?.name || null,
                    lastPeriod: `${y}-${m}`,
                    lastTopic: 'horas_pico',
                    lastHourReport: peakData,
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en horas pico mensual:', err);
                await sendTelegramMessage(chatId, '❌ Error al analizar horas pico: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        // Por defecto: Horas pico del día objetivo (ayer o fecha específica)
        const targetDate = parsed.targetDate;
        const dateLabel = `${toDisplayDate(targetDate)}${stationSuffix}`;
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const peakData = await salesHourlyService.getHorasPicoVentas(targetDate, branchId);
            const msg = formatHorasPicoMessage(peakData, dateLabel, false);
            await logTelegramQuery(user.telegram_user_id, rawText, `Horas Pico ${targetDate}`, 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastStationId: parsed.matchedStation?.id || null,
                lastStationName: parsed.matchedStation?.name || null,
                lastDate: targetDate,
                lastTopic: 'horas_pico',
                lastHourReport: peakData,
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en horas pico diario:', err);
            await sendTelegramMessage(chatId, '❌ Error al analizar horas pico: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.3 Consultas Administrativas y Financieras de Andelsa (sys.sipesv.com / Nova SaaS)
    if (parsed.isAndelsaInventario || parsed.isAndelsaCostos || parsed.isAndelsaCxc || parsed.isAndelsaVentasCliente || parsed.isAndelsaVentasProducto || parsed.isAndelsaFinanzasResumen) {
        if (!effectivePerms.ventas && !effectivePerms.saldos_banco && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar reportes administrativos de Andelsa.', keyboard);
            return true;
        }

        if (parsed.isAndelsaInventario) {
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const data = await sysSaasService.getAndelsaInventarios();
                const msg = formatAndelsaInventarioMessage(data);
                await logTelegramQuery(user.telegram_user_id, rawText, 'Andelsa Inventarios', 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastTopic: 'andelsa_inventario',
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getAndelsaInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en inventarios Andelsa:', err);
                await sendTelegramMessage(chatId, '❌ Error al consultar inventarios de Andelsa: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isAndelsaCostos) {
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const data = await sysSaasService.getAndelsaCostos();
                const msg = formatAndelsaCostosMessage(data);
                await logTelegramQuery(user.telegram_user_id, rawText, 'Andelsa Costos', 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastTopic: 'andelsa_costos',
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getAndelsaInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en costos Andelsa:', err);
                await sendTelegramMessage(chatId, '❌ Error al consultar costos de Andelsa: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isAndelsaCxc) {
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const data = await sysSaasService.getAndelsaCuentasPorCobrar();
                const msg = formatAndelsaCxcMessage(data);
                await logTelegramQuery(user.telegram_user_id, rawText, 'Andelsa CXC', 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastTopic: 'andelsa_cxc',
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getAndelsaInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en CXC Andelsa:', err);
                await sendTelegramMessage(chatId, '❌ Error al consultar CXC de Andelsa: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isAndelsaVentasCliente) {
            const sDate = parsed.startDate || parsed.targetDate;
            const eDate = parsed.endDate || parsed.targetDate;
            const label = parsed.isMonthly ? `${SPANISH_MONTH_NAMES[parsed.targetMonth || 10]} ${parsed.targetYear || 2026}` : parsed.isRange ? `Del ${toDisplayDate(sDate)} al ${toDisplayDate(eDate)}` : toDisplayDate(parsed.targetDate);
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const data = await sysSaasService.getAndelsaVentasPorCliente(sDate, eDate);
                const msg = formatAndelsaVentasClienteMessage(data, label);
                await logTelegramQuery(user.telegram_user_id, rawText, 'Andelsa Ventas Cliente', 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastTopic: 'andelsa_ventas_cliente',
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getAndelsaInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en ventas por cliente Andelsa:', err);
                await sendTelegramMessage(chatId, '❌ Error al consultar ventas por cliente de Andelsa: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isAndelsaVentasProducto) {
            const sDate = parsed.startDate || parsed.targetDate;
            const eDate = parsed.endDate || parsed.targetDate;
            const label = parsed.isMonthly ? `${SPANISH_MONTH_NAMES[parsed.targetMonth || 10]} ${parsed.targetYear || 2026}` : parsed.isRange ? `Del ${toDisplayDate(sDate)} al ${toDisplayDate(eDate)}` : toDisplayDate(parsed.targetDate);
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const data = await sysSaasService.getAndelsaVentasPorProducto(sDate, eDate);
                const msg = formatAndelsaVentasProductoMessage(data, label);
                await logTelegramQuery(user.telegram_user_id, rawText, 'Andelsa Ventas Producto', 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastTopic: 'andelsa_ventas_producto',
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getAndelsaInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en ventas por producto Andelsa:', err);
                await sendTelegramMessage(chatId, '❌ Error al consultar ventas por producto de Andelsa: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }

        if (parsed.isAndelsaFinanzasResumen) {
            const sDate = parsed.startDate || (parsed.isMonthly ? `${parsed.targetYear || 2026}-${String(parsed.targetMonth || 10).padStart(2, '0')}-01` : null);
            const eDate = parsed.endDate || (parsed.isMonthly ? `${parsed.targetYear || 2026}-${String(parsed.targetMonth || 10).padStart(2, '0')}-31` : null);
            const label = parsed.isMonthly ? `${SPANISH_MONTH_NAMES[parsed.targetMonth || 10]} ${parsed.targetYear || 2026}` : parsed.isRange ? `Del ${toDisplayDate(sDate)} al ${toDisplayDate(eDate)}` : 'Mes en curso';
            sendChatAction(chatId, 'typing').catch(() => {});
            try {
                const data = await sysSaasService.getAndelsaFinanzasResumen(sDate, eDate);
                const msg = formatAndelsaFinanzasResumenMessage(data, label);
                await logTelegramQuery(user.telegram_user_id, rawText, 'Andelsa Resumen Financiero', 1);
                setUserConversationContext(user?.telegram_user_id, {
                    lastTopic: 'andelsa_resumen',
                    query: rawText
                });
                await sendFeedback(chatId, msg, { user, query: rawText, reply_markup: getAndelsaInlineMarkup() });
                return true;
            } catch (err) {
                console.error('[TelegramBot] Error en resumen financiero Andelsa:', err);
                await sendTelegramMessage(chatId, '❌ Error al consultar resumen de Andelsa: ' + escapeHtml(err.message), keyboard);
                return true;
            }
        }
    }

    // 0.25 Consulta de Inventario de Tanques, Autonomía y Cobertura Logística
    if (parsed.isTanques) {
        if (!effectivePerms.ventas && !effectivePerms.alertas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar inventario y autonomía de tanques.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const tanquesData = await getTanquesAutonomia();
            const msg = formatTanquesAutonomiaMessage(tanquesData, {
                station: parsed.matchedStation,
                fuel: parsed.matchedFuel
            });
            await logTelegramQuery(user.telegram_user_id, rawText, 'Tanques y Autonomía', 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastStationId: parsed.matchedStation?.id || null,
                lastStationName: parsed.matchedStation?.name || null,
                lastProduct: parsed.matchedFuel?.key || null,
                lastTopic: 'tanques',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de tanques:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar inventario de tanques: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.26 Consulta de Pedidos de Combustible Portal Puma (en ruta, retenidos, pendientes)
    if (parsed.isPedidosPuma) {
        if (!effectivePerms.ventas && !effectivePerms.alertas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar pedidos de combustible Puma.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const pedidosData = await getPedidosPumaData();
            const onlyRetained = /\b(retenid[oa]s?|hold|bloquead[oa]s?)\b/i.test(parsed.normalized);
            const msg = formatPedidosPumaMessage(pedidosData, {
                station: parsed.matchedStation,
                onlyRetained
            });
            await logTelegramQuery(user.telegram_user_id, rawText, 'Pedidos Portal Puma', 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastStationId: parsed.matchedStation?.id || null,
                lastStationName: parsed.matchedStation?.name || null,
                lastTopic: 'pedidos_puma',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de pedidos Puma:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar pedidos Puma: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.27 Consulta de Rentabilidad Operativa y EBITDA Real por Estación
    if (parsed.isRentabilidad) {
        if (!effectivePerms.ventas && !effectivePerms.saldos_banco) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar rentabilidad y EBITDA.', keyboard);
            return true;
        }

        const dInicio = (parsed.isRange || parsed.isMonthly) ? parsed.startDate : null;
        const dFin = (parsed.isRange || parsed.isMonthly) ? parsed.endDate : null;
        const periodoLabel = parsed.isMonthly
            ? `${SPANISH_MONTH_NAMES[parsed.targetMonth || 10]} ${parsed.targetYear || 2026}`
            : parsed.isRange
                ? `Del ${toDisplayDate(parsed.startDate)} al ${toDisplayDate(parsed.endDate)}`
                : null;

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const rentabData = await getRentabilidadPorEstacion(dInicio, dFin);
            const msg = formatRentabilidadEbitdaMessage(rentabData, {
                station: parsed.matchedStation,
                periodoLabel
            });
            await logTelegramQuery(user.telegram_user_id, rawText, 'Rentabilidad EBITDA', 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastStationId: parsed.matchedStation?.id || null,
                lastStationName: parsed.matchedStation?.name || null,
                lastTopic: 'rentabilidad',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de rentabilidad:', err);
            await sendTelegramMessage(chatId, '❌ Error al calcular rentabilidad EBITDA: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.28 Consulta de Dinero en Tránsito (>48h) y Vales sin Facturar (>72h)
    if (parsed.isTransitoVales) {
        if (!effectivePerms.saldos_banco && !effectivePerms.alertas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar efectivo en tránsito y vales.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const transitoData = await getAuditoriaDineroEnTransito({ dias: 14 });
            const msg = formatTransitoValesMessage(transitoData);
            await logTelegramQuery(user.telegram_user_id, rawText, 'Efectivo en Tránsito y Vales', 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastTopic: 'transito_vales',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de tránsito y vales:', err);
            await sendTelegramMessage(chatId, '❌ Error al auditar efectivo en tránsito: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.29 Consulta explícita de Saldos en Chequera (con soporte de filtro por banco, contribuyente/titular, estación o cuenta)
    if (parsed.isChequera) {
        if (!effectivePerms.saldos_chequera) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar saldos en chequera.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getSaldosChequeraData();
            const payload = filterBankOrChequeraAccounts(data, {
                matchedBank: parsed.matchedBank,
                matchedAccountHolder: parsed.matchedAccountHolder,
                matchedStation: parsed.matchedStation,
                matchedAccountNumber: parsed.matchedAccountNumber
            });
            const msg = formatChequeraMessage(payload);
            await logTelegramQuery(user.telegram_user_id, rawText, payload.filterLabel ? `Chequera (${payload.filterLabel})` : 'Saldos en Chequera', 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastTopic: 'chequera',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de chequera NLU:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar saldos en chequera: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.30 Consulta explícita de Saldos Consolidados en Bancos (con soporte de filtro por contribuyente/titular o cuenta)
    if (parsed.isBancosGlobal) {
        if (!effectivePerms.saldos_banco) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar saldos bancarios.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getSaldosBancosData();
            const payload = filterBankOrChequeraAccounts(data, {
                matchedBank: parsed.matchedBank,
                matchedAccountHolder: parsed.matchedAccountHolder,
                matchedStation: parsed.matchedStation,
                matchedAccountNumber: parsed.matchedAccountNumber
            });
            const msg = formatBancosMessage(payload);
            await logTelegramQuery(user.telegram_user_id, rawText, payload.filterLabel ? `Bancos (${payload.filterLabel})` : 'Saldos en Bancos', 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastTopic: 'bancos',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta global de bancos NLU:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar saldos bancarios: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.31 Consulta de Pagos Programados y Control de Pagos (enriquecido con abonos parciales, filtros y saldos)
    if (parsed.isPagosProgramados) {
        if (!effectivePerms.control_pagos && !effectivePerms.saldos_banco && !effectivePerms.ventas && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar Control de Pagos.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const db = getDb();
            const externalDb = await getExternalDb().catch(() => null);
            const pagosQuery = parseControlPagosQuery(rawText, parsed);
            const pagosData = await getControlPagosDetailedData({
                db,
                externalDb,
                filterMode: pagosQuery.filterMode,
                ubicacionFilter: pagosQuery.ubicacionFilter,
                searchTerm: pagosQuery.searchTerm,
                startDate: pagosQuery.startDate,
                endDate: pagosQuery.endDate
            });
            const msg = formatControlPagosMessage(pagosData);
            await logTelegramQuery(user.telegram_user_id, rawText, `Control de Pagos (${pagosQuery.filterMode})`, 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastTopic: 'pagos_programados',
                query: rawText
            });
            await sendFeedback(chatId, msg, {
                user,
                query: rawText,
                reply_markup: getControlPagosInlineMarkup(pagosData)
            });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de Control de Pagos:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar Control de Pagos: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.32 Consulta de Ventas de Tienda por Línea / Categoría o Detalle de Tienda de Estación (ej. 'Vent cigarros la loma', 'Detalle venta de tienda la loma')
    if (parsed.isTiendaLinea) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de tiendas.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const lineaData = await getVentasTiendaPorLineaData({
                startDate: parsed.startDate || parsed.targetDate,
                endDate: parsed.endDate || parsed.targetDate,
                targetDate: parsed.targetDate,
                station: parsed.matchedStation,
                storeLine: parsed.matchedStoreLine
            });
            const msg = formatVentasTiendaLineaMessage(lineaData);
            await logTelegramQuery(
                user.telegram_user_id,
                rawText,
                `Tienda Línea: ${parsed.matchedStoreLine?.label || 'Todas'} (${parsed.matchedStation?.name || 'Global'})`,
                1
            );
            setUserConversationContext(user?.telegram_user_id, {
                lastDate: lineaData.endDate || parsed.targetDate,
                lastStationId: parsed.matchedStation?.id || null,
                lastStationName: parsed.matchedStation?.name || null,
                lastTopic: 'tienda_linea',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de línea de tienda:', err);
            await sendTelegramMessage(chatId, '❌ Error al consultar ventas por línea de tienda: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.33 Consulta de Día de Mayor / Menor Venta del Mes o Rango y Día de la Semana (ej. 'En mes de octubre que dia fue el de mayor venta?', 'Que dia de la semana vendió mas miraflores')
    if (parsed.isPeakDay) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const peakDayData = await getRankingDiasVentasData({
                startDate: parsed.isRange ? parsed.startDate : null,
                endDate: parsed.isRange ? parsed.endDate : null,
                year: parsed.isMonthly ? parsed.targetYear : null,
                month: parsed.isMonthly ? parsed.targetMonth : null,
                station: parsed.matchedStation,
                order: parsed.peakDayOrder || 'DESC'
            });
            const msg = formatPeakDayVentasMessage(peakDayData);
            await logTelegramQuery(
                user.telegram_user_id,
                rawText,
                `Día Mayor/Menor Venta (${peakDayData.periodo_label})`,
                1
            );
            setUserConversationContext(user?.telegram_user_id, {
                lastStationId: parsed.matchedStation?.id || null,
                lastStationName: parsed.matchedStation?.name || null,
                lastTopic: 'dia_pico_ventas',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de día de mayor venta:', err);
            await sendTelegramMessage(chatId, '❌ Error al calcular el día de mayor venta: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.3 Consulta de Ventas Mensuales Consolidadas (ej. 'resumen de ventas por gasolinera mes de octubre')
    if (parsed.isMonthly) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas consolidadas.', keyboard);
            return true;
        }

        const y = parsed.targetYear || 2026;
        const m = parsed.targetMonth || 10;
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const { getResumenMensualData } = require('../routes/consultas');
            const data = await getResumenMensualData(externalDb, y, m, accountingDb);
            const msg = formatVentasMensualMessage(data, y, m);
            await logTelegramQuery(user.telegram_user_id, rawText, `Ventas Mensual ${y}-${m}`, 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastPeriod: `${y}-${String(m).padStart(2, '0')}`,
                lastMonth: m,
                lastYear: y,
                lastTopic: 'ventas_mensual',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ventas mensual:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar el resumen mensual: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 0.4 Consulta de Ventas por Rango de Fechas (ej. 'ventas del 1 al 10 de octubre')
    if (parsed.isRange) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas por rango.', keyboard);
            return true;
        }

        const rangeLabel = `Del ${toDisplayDate(parsed.startDate)} al ${toDisplayDate(parsed.endDate)}`;
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const { getResumenRangoVentasData } = require('../routes/consultas');
            const data = await getResumenRangoVentasData(externalDb, parsed.startDate, parsed.endDate, accountingDb);
            const msg = formatVentasRangoMessage(data, parsed.startDate, parsed.endDate, rangeLabel);
            await logTelegramQuery(user.telegram_user_id, rawText, `Ventas Rango ${parsed.startDate} a ${parsed.endDate}`, 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastPeriod: `${parsed.startDate}:${parsed.endDate}`,
                lastTopic: 'ventas_rango',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ventas por rango:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar el rango de fechas: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 1. Consulta de Rankings / Comparativas (PRIORIDAD ALTA: evaluada ANTES de combustibles globales)
    if (parsed.isRanking) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar rankings de ventas.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const metric = parsed.normalized.includes('galon') || parsed.normalized.includes('galones') ? 'galonaje' : 'venta';
            const msg = formatRankingMessage(data, parsed.targetDate, metric, parsed.matchedFuel);
            await logTelegramQuery(user.telegram_user_id, rawText, `Ranking ${metric}${parsed.matchedFuel ? ` (${parsed.matchedFuel.key})` : ''}`, 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastDate: parsed.targetDate,
                lastProduct: parsed.matchedFuel?.key || null,
                lastTopic: 'ranking',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ranking:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al generar ranking: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 2. Consulta de Estación Específica (con o sin combustible)
    if (parsed.matchedStation) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de estaciones.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const matchStationRow = (rows) => (rows || []).find(e =>
                e.id_empresa === parsed.matchedStation.id ||
                normalizeText(e.empresa).includes(normalizeText(parsed.matchedStation.name)) ||
                parsed.matchedStation.keywords.some(kw => normalizeText(e.empresa).includes(normalizeText(kw)))
            );

            const st = matchStationRow(data?.estaciones);
            const isTodayTarget = parsed.targetDate === getDateStr(0);
            const hasZeroToday = !st || (Number(st.galonaje || 0) === 0 && Number(st.venta || 0) === 0);

            if (isTodayTarget && hasZeroToday) {
                const yestDate = getDateStr(-1);
                const yestData = await getConsolidadoVentas(yestDate).catch(() => null);
                const stYest = matchStationRow(yestData?.estaciones);
                if (stYest && (Number(stYest.galonaje || 0) > 0 || Number(stYest.venta || 0) > 0)) {
                    const tiendaYest = (yestData?.tiendas || []).find(t => normalizeText(t.empresa).includes(parsed.matchedStation.tiendaKey));
                    const msg = `⏳ <b>Turnos de hoy (${toDisplayDate(parsed.targetDate)}) aún en curso en ${escapeHtml(parsed.matchedStation.name)}</b>\n` +
                        `<i>Sin cierre de turno consolidado para hoy todavía. Te comparto como referencia el último cierre consolidado:</i>\n\n` +
                        formatSpecificStationMessage(stYest, parsed.matchedFuel, yestDate, tiendaYest);
                    await logTelegramQuery(user.telegram_user_id, rawText, `Estación hoy en curso (ref ${yestDate}): ${stYest.empresa}`, 1);
                    setUserConversationContext(user?.telegram_user_id, {
                        lastStationId: parsed.matchedStation.id,
                        lastStationName: parsed.matchedStation.name,
                        lastDate: yestDate,
                        lastProduct: parsed.matchedFuel?.key || null,
                        lastTopic: 'ventas_estacion',
                        query: rawText
                    });
                    await sendFeedback(chatId, msg, { user, query: rawText });
                    return true;
                }
            }

            if (!st) {
                await sendTelegramMessage(chatId, `⚠️ No se encontraron registros de ventas cerradas para ${parsed.matchedStation.name} en la fecha ${toDisplayDate(parsed.targetDate)}.`, keyboard);
                return true;
            }

            const tiendas = data?.tiendas || [];
            const tienda = tiendas.find(t => normalizeText(t.empresa).includes(parsed.matchedStation.tiendaKey));

            const msg = formatSpecificStationMessage(st, parsed.matchedFuel, parsed.targetDate, tienda);
            await logTelegramQuery(user.telegram_user_id, rawText, `Estación: ${st.empresa}`, 1);
            try {
                const { learnAlias } = require('./conversationalAiService');
                learnAlias('station', parsed.matchedStation.id, rawText).catch(() => {});
            } catch (aliasErr) {
                // Aprendizaje opcional
            }
            setUserConversationContext(user?.telegram_user_id, {
                lastStationId: parsed.matchedStation.id,
                lastStationName: parsed.matchedStation.name,
                lastDate: parsed.targetDate,
                lastProduct: parsed.matchedFuel?.key || null,
                lastTopic: 'ventas_estacion',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de estación específica:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al procesar la consulta: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 3. Consulta de Combustible Global (sin estación específica)
    if (parsed.matchedFuel && !parsed.matchedStation) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de combustible.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const msg = formatProductTotalMessage(data, parsed.matchedFuel, parsed.targetDate);
            await logTelegramQuery(user.telegram_user_id, rawText, `Total: ${parsed.matchedFuel.label}`, 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastStationId: null,
                lastStationName: null,
                lastDate: parsed.targetDate,
                lastProduct: parsed.matchedFuel.key,
                lastTopic: 'ventas_producto',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de combustible global:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al calcular el total: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 4. Consulta de Banco Específico
    if (parsed.matchedBank) {
        if (!effectivePerms.saldos_banco) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar saldos bancarios.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getSaldosBancosData();
            const hasSubFilter = Boolean(parsed.matchedAccountHolder || parsed.matchedStation || parsed.matchedAccountNumber);
            const msg = hasSubFilter
                ? formatBancosMessage(filterBankOrChequeraAccounts(data, {
                    matchedBank: parsed.matchedBank,
                    matchedAccountHolder: parsed.matchedAccountHolder,
                    matchedStation: parsed.matchedStation,
                    matchedAccountNumber: parsed.matchedAccountNumber
                }))
                : formatSpecificBankMessage(data, parsed.matchedBank);
            await logTelegramQuery(user.telegram_user_id, rawText, `Banco: ${parsed.matchedBank.label}`, 1);
            try {
                const { learnAlias } = require('./conversationalAiService');
                learnAlias('bank', parsed.matchedBank.key, rawText).catch(() => {});
            } catch (aliasErr) {
                // Aprendizaje opcional
            }
            setUserConversationContext(user?.telegram_user_id, {
                lastStationId: null,
                lastStationName: null,
                lastProduct: null,
                lastDate: null,
                lastTopic: 'bancos',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de banco específico:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar el banco: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 5. Consulta de Tiendas
    if (parsed.isTiendas) {
        if (!effectivePerms.ventas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de tiendas.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const msg = formatTiendasMessage(data, parsed.targetDate);
            await logTelegramQuery(user.telegram_user_id, rawText, 'Tiendas cortes', 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastDate: parsed.targetDate,
                lastStationId: parsed.matchedStation?.id || null,
                lastStationName: parsed.matchedStation?.name || null,
                lastTopic: 'tiendas',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de tiendas:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar tiendas: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // 6. Consulta de Alertas / Auditoría
    if (parsed.isAlertas) {
        if (!effectivePerms.alertas) {
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar alertas operativas.', keyboard);
            return true;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getConsolidadoVentas(parsed.targetDate);
            const msg = formatAlertasMessage(data, parsed.targetDate);
            await logTelegramQuery(user.telegram_user_id, rawText, 'Alertas auditoría', 1);
            setUserConversationContext(user?.telegram_user_id, {
                lastDate: parsed.targetDate,
                lastStationId: null,
                lastStationName: null,
                lastTopic: 'alertas',
                query: rawText
            });
            await sendFeedback(chatId, msg, { user, query: rawText });
            return true;
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de alertas:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar alertas: ' + escapeHtml(err.message), keyboard);
            return true;
        }
    }

    // Las preguntas abiertas o analíticas pasan a askConversationalAgent (con contexto 360° real y memoria)
    return false;
};

/**
 * Autocorrección activa en vivo cuando un usuario reporta respuesta NO_UTIL (👎) y explica qué necesitaba.
 * Combina consulta_original + comentario_mejora, intenta resolver primero por NLU determinista y luego
 * por el Agente Conversacional 360°, y actualiza notas_resolucion en telegram_feedback.
 */
const attemptSelfHealingCorrection = async ({
    user,
    chatId,
    effectivePerms,
    keyboard,
    voicePrefix = '',
    feedbackId = null,
    consultaOriginal = null,
    respuestaAnterior = null,
    clarificationText = ''
}) => {
    const cleanClarification = String(clarificationText || '').trim();
    if (cleanClarification.length < 4 || /^(nada|ninguno|ninguna|ok|gracias|mal|error|no)$/i.test(normalizeText(cleanClarification))) {
        return false;
    }

    let origQuery = consultaOriginal;
    let prevAnswer = respuestaAnterior;

    if ((!origQuery || !prevAnswer) && feedbackId) {
        try {
            const db = getDb();
            if (db) {
                const [rows] = await db.query(
                    'SELECT consulta_original, respuesta_resumen FROM telegram_feedback WHERE id = ? LIMIT 1',
                    [feedbackId]
                );
                if (rows.length > 0) {
                    origQuery = origQuery || rows[0].consulta_original || null;
                    prevAnswer = prevAnswer || rows[0].respuesta_resumen || null;
                }
            }
        } catch (_) {
            // Ignorar defensivamente
        }
    }

    let sentCorrected = false;
    const correctionHeader =
        `🙏 <b>¡Gracias por la aclaración!</b> Guardé tu observación y generé de inmediato la <b>respuesta corregida</b>:\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const customSendFeedback = async (cId, text, meta = {}) => {
        sentCorrected = true;
        return sendTelegramResponseWithFeedback(cId, (voicePrefix || '') + correctionHeader + text, {
            ...meta,
            user,
            query: origQuery ? `[Autocorrección] ${origQuery} → ${cleanClarification}` : cleanClarification,
            responseSummary: `Autocorregido: ${meta.responseSummary || 'NLU Determinista'}`
        });
    };

    const userCtx = getUserConversationContext(user?.telegram_user_id);

    // 1. Intentar con la aclaración directa en NLU determinista
    const handledDirect = await handleSmartNaturalLanguageQuery(user, cleanClarification, chatId, effectivePerms, keyboard, {
        voicePrefix,
        userContext: userCtx,
        customSendFeedback
    });

    // 2. Si no coincidió sola y existe consulta_original, combinar ambas (ej. "Ventas de Miraflores" + "del mes pasado")
    let handledCombined = false;
    if (!handledDirect && !sentCorrected && origQuery) {
        const combinedQuery = `${origQuery} ${cleanClarification}`.trim();
        handledCombined = await handleSmartNaturalLanguageQuery(user, combinedQuery, chatId, effectivePerms, keyboard, {
            voicePrefix,
            userContext: userCtx,
            customSendFeedback
        });
    }

    let resolutionMethod = (handledDirect || handledCombined || sentCorrected)
        ? 'Autocorregido en vivo (NLU determinista)'
        : null;

    // 3. Si NLU determinista no aplicó, consultar al Agente Conversacional 360° con contexto de autocorrección
    if (!resolutionMethod) {
        try {
            const { askConversationalAgent } = require('./conversationalAiService');
            const extraSystemNote =
                `MODO AUTOCORRECCIÓN INMEDIATA DE FEEDBACK NEGATIVO:\n` +
                `- Consulta original del usuario: "${origQuery || 'N/D'}"\n` +
                `- Respuesta previa que NO le sirvió: "${String(prevAnswer || 'N/D').slice(0, 400)}"\n` +
                `- Aclaración actual del usuario sobre lo que realmente necesita: "${cleanClarification}"\n` +
                `INSTRUCCIÓN: Corrige el enfoque de inmediato y entrega los datos exactos solicitados desde el JSON en vivo, de forma directa y ejecutiva, sin repetir la respuesta fallida.`;

            const aiReply = await askConversationalAgent({
                user,
                prompt: origQuery ? `${origQuery} — Aclaración: ${cleanClarification}` : cleanClarification,
                chatId,
                effectivePerms,
                extraSystemNote
            });

            if (aiReply) {
                sentCorrected = true;
                resolutionMethod = 'Autocorregido en vivo (Agente IA 360°)';
                await sendTelegramResponseWithFeedback(chatId, (voicePrefix || '') + correctionHeader + aiReply, {
                    user,
                    query: origQuery ? `[Autocorrección] ${origQuery} → ${cleanClarification}` : cleanClarification,
                    responseSummary: 'Autocorregido (Agente IA 360°)'
                });
            }
        } catch (aiErr) {
            console.warn('[TelegramBot] Autocorrección IA no disponible:', aiErr.message);
        }
    }

    if (resolutionMethod && feedbackId) {
        try {
            const db = getDb();
            if (db) {
                await db.query(
                    `UPDATE telegram_feedback
                     SET notas_resolucion = ?, updated_at = NOW()
                     WHERE id = ?`,
                    [resolutionMethod, feedbackId]
                );
            }
        } catch (_) {
            // Ignorar defensivamente
        }
    }

    return Boolean(sentCorrected);
};

const isSupportedReceiptDocument = (doc) => {
    if (!doc || !doc.file_id) return false;
    const mime = String(doc.mime_type || '').toLowerCase();
    const name = String(doc.file_name || '').toLowerCase();
    return mime === 'application/pdf' ||
        mime.startsWith('image/') ||
        /\.(pdf|jpe?g|png|webp)$/i.test(name);
};

/**
 * Procesar un mensaje entrante de Telegram
 */
const handleIncomingMessage = async (msg, contextOptions = {}) => {
    if (!msg || !msg.chat || !msg.from) return;

    const chatId = msg.chat.id;
    const rawText = (msg.text || '').trim();
    const voicePrefix = contextOptions.voicePrefix || '';
    const hasMedia = Boolean(
        msg.voice ||
        msg.audio ||
        (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) ||
        isSupportedReceiptDocument(msg.document)
    );
    if (!rawText && !hasMedia) return;

    // 1. Resolver y autenticar usuario ANTES de procesar voz, fotos OCR o consultas (fail-closed)
    const user = await resolveTelegramUser(msg.from);
    if (!user) {
        await sendTelegramMessage(chatId, '⚠️ Error interno del sistema al identificar usuario.');
        return;
    }

    const queryStartTime = Date.now();
    try {
        const { recordQueryReceived } = require('./telegramAuditorService');
        recordQueryReceived(user.telegram_user_id);
    } catch (_) {
        // Ignorar
    }

    // 2. Verificar si está autorizado (activo = 1)
    if (!user.activo) {
        await logTelegramQuery(user.telegram_user_id, rawText || (msg.photo ? '[FOTO]' : '[VOZ]'), 'Acceso denegado (usuario inactivo)', 0);
        const name = escapeHtml(user.first_name || 'Usuario');
        const notAuthMsg = `⛔ <b>Acceso no autorizado</b>\n\n` +
            `Hola <b>${name}</b>.\n` +
            `Tu ID de Telegram es: <code>${escapeHtml(user.telegram_user_id)}</code>.\n\n` +
            `Tu cuenta aún no tiene permisos para realizar consultas en <b>SIPE Admin</b>.\n` +
            `Se ha registrado tu solicitud para que un administrador del sistema habilite tu acceso desde el panel web (<i>Seguridad &gt; Usuarios de Telegram</i>).`;
        await sendTelegramMessage(chatId, notAuthMsg);
        return;
    }

    // 2.1 Resolver permisos efectivos (heredados de SIPE o manuales)
    const effectivePerms = await getUserEffectivePermissions(user);

    // Si está vinculado pero su cuenta en SIPE Admin está inactiva
    if (effectivePerms.inactiveInSipe) {
        await logTelegramQuery(user.telegram_user_id, rawText || (msg.photo ? '[FOTO]' : '[VOZ]'), 'Acceso suspendido (usuario SIPE inactivo)', 0);
        const name = escapeHtml(user.first_name || 'Usuario');
        const inactiveMsg = `⛔ <b>Acceso Suspendido</b>\n\n` +
            `Hola <b>${name}</b>.\n` +
            `Tu cuenta de Telegram está vinculada al usuario de SIPE Admin <b>${escapeHtml(effectivePerms.linkedUser?.nombre || '')}</b>, el cual se encuentra actualmente <b>inactivo</b> en el sistema.\n` +
            `Por favor contacta a un Administrador para reactivar tu cuenta.`;
        await sendTelegramMessage(chatId, inactiveMsg);
        return;
    }

    const MAX_TELEGRAM_MEDIA_BYTES = 10 * 1024 * 1024;
    const isSafeTelegramFilePath = (fp) => typeof fp === 'string' && /^[a-zA-Z0-9/_.-]+$/.test(fp) && !fp.includes('..');

    // Detección de notas de voz o audios entrantes (Soporte Gemini 2.0 Flash)
    if (msg.voice || msg.audio) {
        try {
            const { recordVoiceNoteProcessed } = require('./telegramAuditorService');
            recordVoiceNoteProcessed(msg.from.id);
        } catch (_) {
            // Ignorar defensivamente
        }

        const mediaSize = Number(msg.voice?.file_size || msg.audio?.file_size || 0);
        if (mediaSize > MAX_TELEGRAM_MEDIA_BYTES) {
            await sendTelegramMessage(chatId, '⚠️ El audio supera el límite permitido de 10 MB. Envía una nota de voz más breve.');
            return;
        }

        sendChatAction(chatId, 'record_voice').catch(() => {});

        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            await sendTelegramMessage(
                chatId,
                '🎙️ <b>Servicio de voz no disponible</b>\n\n' +
                'La clave de API de Gemini no se encuentra configurada en el servidor ni en la base de datos.\n' +
                'Un administrador puede ingresarla desde <b>Seguridad &gt; Usuarios de Telegram &gt; Configuración</b> en SIPE Admin.\n\n' +
                'Por favor, escribe tu consulta por texto para atenderte de inmediato.',
                getMainReplyKeyboard()
            );
            return;
        }

        await sendTelegramMessage(chatId, '⏳ Escuchando y transcribiendo nota de voz...');

        let transcribedText = null;
        try {
            const fileId = msg.voice?.file_id || msg.audio?.file_id;
            const mimeType = msg.voice?.mime_type || msg.audio?.mime_type || 'audio/ogg';
            const { token } = await getBotToken();
            const fileRes = await axios.get(`${TELEGRAM_API_BASE}${token}/getFile?file_id=${encodeURIComponent(fileId)}`, { timeout: 15000 });
            const filePath = fileRes.data?.result?.file_path;
            if (!isSafeTelegramFilePath(filePath)) throw new Error('Ruta de archivo de audio inválida');

            sendChatAction(chatId, 'typing').catch(() => {});
            const audioRes = await axios.get(`https://api.telegram.org/file/bot${token}/${filePath}`, {
                responseType: 'arraybuffer',
                maxContentLength: MAX_TELEGRAM_MEDIA_BYTES,
                maxBodyLength: MAX_TELEGRAM_MEDIA_BYTES,
                timeout: 30000
            });
            const audioBuffer = Buffer.from(audioRes.data);

            transcribedText = await transcribeTelegramVoice(audioBuffer, mimeType);
        } catch (voiceErr) {
            console.error('[TelegramBot] Error en transcripción de audio:', voiceErr.message);
            try {
                const { recordVoiceNoteFailed } = require('./telegramAuditorService');
                recordVoiceNoteFailed({
                    error: voiceErr.message,
                    userId: msg.from.id,
                    chatId
                });
            } catch (_) {
                // Ignorar fallo de registro en auditoría
            }

            const isKeyError = isGeminiApiKeyInvalidError(voiceErr);
            const friendlyReason = isKeyError
                ? 'La clave de Gemini API configurada es inválida o ha expirado. Un administrador debe actualizarla en <b>Seguridad &gt; Usuarios de Telegram &gt; Configurar Token / IA</b> en SIPE Admin.'
                : 'Ocurrió un inconveniente al descargar o transcribir tu audio.';

            await sendTelegramMessage(
                chatId,
                '🎙️ <b>No se pudo procesar la nota de voz</b>\n\n' +
                friendlyReason + '\n\n' +
                'Por favor, intenta nuevamente o escribe tu consulta por texto para atenderte de inmediato.',
                getMainReplyKeyboard()
            );
            return;
        }

        if (!transcribedText || !transcribedText.trim()) {
            await sendTelegramMessage(
                chatId,
                '🎙️ <b>Nota de voz no comprensible</b>\n\n' +
                'No fue posible entender el audio o la grabación no contenía voz clara.\n' +
                'Por favor, intenta enviar una nueva nota de voz o escribe tu consulta por texto.',
                getMainReplyKeyboard()
            );
            return;
        }

        const newVoicePrefix = `🎙️ <i>"«${escapeHtml(transcribedText.trim())}»"</i>\n\n`;
        return await handleIncomingMessage({
            ...msg,
            text: transcribedText.trim(),
            voice: null,
            audio: null
        }, { voicePrefix: newVoicePrefix });
    }

    // Detección de fotografías o documentos PDF/imagen de comprobantes bancarios / facturas (OCR + Control de Pagos)
    const isPhotoReceipt = Boolean(msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0);
    const receiptDoc = !isPhotoReceipt && isSupportedReceiptDocument(msg.document) ? msg.document : null;
    if (isPhotoReceipt || receiptDoc) {
        sendChatAction(chatId, 'typing').catch(() => {});

        const bestPhoto = isPhotoReceipt ? msg.photo[msg.photo.length - 1] : receiptDoc;
        if (Number(bestPhoto?.file_size || 0) > MAX_TELEGRAM_MEDIA_BYTES) {
            await sendTelegramMessage(chatId, '⚠️ El comprobante supera el límite permitido de 10 MB.');
            return;
        }

        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            await sendTelegramMessage(
                chatId,
                '📸 <b>Servicio de visión IA no disponible</b>\n\n' +
                'La clave de API de Gemini no se encuentra configurada en el servidor ni en la base de datos.\n' +
                'Un administrador puede ingresarla desde <b>Seguridad &gt; Usuarios de Telegram &gt; Configuración</b> en SIPE Admin.',
                getMainReplyKeyboard()
            );
            return;
        }

        let detectedMime = 'image/jpeg';
        let fileName = 'comprobante_telegram.jpg';
        if (receiptDoc) {
            const rawMime = String(receiptDoc.mime_type || '').toLowerCase().split(';')[0].trim();
            const origName = String(receiptDoc.file_name || '');
            if (rawMime === 'application/pdf' || /\.pdf$/i.test(origName)) {
                detectedMime = 'application/pdf';
                fileName = origName || 'comprobante_telegram.pdf';
            } else if (rawMime === 'image/png' || /\.png$/i.test(origName)) {
                detectedMime = 'image/png';
                fileName = origName || 'comprobante_telegram.png';
            } else if (rawMime === 'image/webp' || /\.webp$/i.test(origName)) {
                detectedMime = 'image/webp';
                fileName = origName || 'comprobante_telegram.webp';
            } else {
                detectedMime = 'image/jpeg';
                fileName = origName || 'comprobante_telegram.jpg';
            }
        }

        await sendTelegramMessage(
            chatId,
            detectedMime === 'application/pdf'
                ? '📄 Analizando comprobante PDF con IA...'
                : '📸 Analizando imagen / comprobante con IA...'
        );

        try {
            const fileId = bestPhoto.file_id;
            const { token } = await getBotToken();
            const fileRes = await axios.get(`${TELEGRAM_API_BASE}${token}/getFile?file_id=${encodeURIComponent(fileId)}`, { timeout: 15000 });
            const filePath = fileRes.data?.result?.file_path;
            if (!isSafeTelegramFilePath(filePath)) throw new Error('Ruta de archivo de comprobante inválida');

            sendChatAction(chatId, 'typing').catch(() => {});
            const imgRes = await axios.get(`https://api.telegram.org/file/bot${token}/${filePath}`, {
                responseType: 'arraybuffer',
                maxContentLength: MAX_TELEGRAM_MEDIA_BYTES,
                maxBodyLength: MAX_TELEGRAM_MEDIA_BYTES,
                timeout: 30000
            });
            const imageBuffer = Buffer.from(imgRes.data);

            const analysis = await analyzeTelegramImageReceipt(imageBuffer, detectedMime, msg.caption || '');
            // Solo consultar movimientos_bancarios si el usuario tiene permiso de bancos o es Admin
            const canVerifyBank = Boolean(effectivePerms.saldos_banco || effectivePerms.isAdmin);
            const verification = canVerifyBank
                ? await verifyReceiptInBankMovements(analysis)
                : { found: false, matches: [], restrictedByPermission: true };
            let reportMsg = formatReceiptAnalysisMessage(analysis, verification);

            let receiptDraft = null;
            try {
                const isUnmockedExtInTest = Boolean(
                    (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT) &&
                    dbModule.getExternalDb?.name === 'getExternalDb'
                );
                const extDb = isUnmockedExtInTest ? null : await getExternalDb().catch(() => null);
                receiptDraft = extDb ? await prepareReceiptPaymentDraft({
                    db: getDb(),
                    externalDb: extDb,
                    user,
                    effectivePerms,
                    fileBuffer: imageBuffer,
                    mimeType: detectedMime,
                    fileName,
                    analysis,
                    caption: msg.caption || ''
                }) : null;
            } catch (draftErr) {
                console.warn('[TelegramBot] Aviso buscando coincidencia Control de Pagos:', draftErr.message);
            }

            await logTelegramQuery(
                user.telegram_user_id,
                detectedMime === 'application/pdf' ? 'OCR_COMPROBANTE_PDF' : 'OCR_COMPROBANTE_FOTO',
                `${analysis.tipo_documento || 'Comprobante'} - ${analysis.banco || ''} - $${analysis.monto_usd || 0}`,
                1
            );

            if (receiptDraft?.sectionHtml && receiptDraft?.inlineMarkup) {
                reportMsg += receiptDraft.sectionHtml;
                await sendTelegramMessage(chatId, reportMsg, receiptDraft.inlineMarkup);
            } else {
                await sendTelegramResponseWithFeedback(chatId, reportMsg, {
                    user,
                    query: msg.caption || 'Análisis de comprobante por imagen',
                    responseSummary: `OCR: ${analysis.banco || 'Doc'} $${analysis.monto_usd || 0} (Ref: ${analysis.referencia || 'S/N'})`
                });
            }
            return;
        } catch (imgErr) {
            console.error('[TelegramBot] Error en análisis de comprobante:', imgErr.message);
            await sendTelegramMessage(
                chatId,
                '📸 <b>No se pudo procesar el comprobante</b>\n\n' +
                'Ocurrió un inconveniente al analizar la imagen o PDF.\n' +
                'Por favor, asegúrate de que el archivo sea legible e intenta nuevamente.',
                getMainReplyKeyboard()
            );
            return;
        }
    }

    if (!rawText) return;

    const keyboard = getMainReplyKeyboard();
    const cleanLower = rawText.toLowerCase().replace(/^[/\s]+/, '');

    // A. Interceptar respuesta si el usuario tiene una retroalimentación de mejora pendiente
    const pendingFb = pendingFeedbackUsers.get(String(user.telegram_user_id));
    if (pendingFb && (Date.now() - pendingFb.timestamp < 30 * 60 * 1000)) {
        if (cleanLower === 'cancelar' || cleanLower === '/cancelar') {
            pendingFeedbackUsers.delete(String(user.telegram_user_id));
            await sendTelegramMessage(chatId, voicePrefix + '👌 Retroalimentación cancelada. ¿En qué más puedo ayudarte hoy?', keyboard);
            return;
        }

        // Si el usuario presionó menú o start, cancelar feedback y continuar con el menú
        if (cleanLower === 'start' || cleanLower === 'menu' || cleanLower === 'inicio') {
            pendingFeedbackUsers.delete(String(user.telegram_user_id));
        } else {
            // Guardar el comentario de mejora en el log de mejora continua
            try {
                const db = getDb();
                if (db && pendingFb.feedbackId) {
                    await db.query(
                        `UPDATE telegram_feedback 
                         SET comentario_mejora = ?, estado = 'COMPLETADO', updated_at = NOW() 
                         WHERE id = ?`,
                        [rawText, pendingFb.feedbackId]
                    );
                }
            } catch (fbSaveErr) {
                console.error('[TelegramBot] Error guardando comentario de mejora:', fbSaveErr);
            }

            pendingFeedbackUsers.delete(String(user.telegram_user_id));

            const selfHealed = await attemptSelfHealingCorrection({
                user,
                chatId,
                effectivePerms,
                keyboard,
                voicePrefix,
                feedbackId: pendingFb.feedbackId,
                consultaOriginal: pendingFb.consultaOriginal || null,
                respuestaAnterior: pendingFb.respuestaAnterior || null,
                clarificationText: rawText
            });

            if (selfHealed) {
                return;
            }

            const ackMsg = `🙏 <b>¡Muchas gracias por tu sugerencia!</b>\n\n` +
                `Tu comentario ha sido guardado exitosamente en la bitácora de mejora continua:\n` +
                `💬 <i>«${escapeHtml(rawText)}»</i>\n\n` +
                `Nuestro equipo y agentes de IA utilizarán este feedback para optimizar el modelo de consultas y no repetir este error. 🚀`;

            await sendTelegramMessage(chatId, voicePrefix + ackMsg, keyboard);
            return;
        }
    }

    // B. Interceptar si el usuario está en modo de justificación interactiva de alerta
    const pendingJust = pendingAlertJustifications.get(String(user.telegram_user_id));
    if (pendingJust && (Date.now() - pendingJust.timestamp < 30 * 60 * 1000)) {
        if (cleanLower === 'cancelar' || cleanLower === '/cancelar') {
            pendingAlertJustifications.delete(String(user.telegram_user_id));
            await sendTelegramMessage(chatId, voicePrefix + '👌 Justificación cancelada. ¿En qué más puedo ayudarte hoy?', keyboard);
            return;
        }

        try {
            await logTelegramQuery(
                user.telegram_user_id,
                'JUSTIFICACION_DESCUADRE',
                `Estación: ${pendingJust.stationName || pendingJust.stationId}, Fecha: ${pendingJust.date}, Motivo: ${rawText}`,
                1
            );

            const db = getDb();
            if (db) {
                await db.query(
                    `INSERT INTO bitacora_logs (user_id, username, accion, entidad, entidad_id, detalles, ip_address)
                     VALUES (?, ?, 'JUSTIFY_DISCREPANCY', 'discrepancias', ?, ?, 'TelegramBot')`,
                    [
                        user.user_id || null,
                        user.telegram_username || user.first_name || 'telegram_user',
                        pendingJust.stationId || '008',
                        JSON.stringify({
                            estacion: pendingJust.stationName || pendingJust.stationId,
                            fecha: pendingJust.date,
                            justificacion: rawText,
                            telegram_user_id: user.telegram_user_id
                        })
                    ]
                );
            }
        } catch (justErr) {
            console.error('[TelegramBot] Error registrando justificación:', justErr.message);
        }

        pendingAlertJustifications.delete(String(user.telegram_user_id));

        const ackJustMsg = `✅ <b>Justificación Registrada Exitosamente</b>\n\n` +
            `Tu observación para <b>${escapeHtml(pendingJust.stationName || pendingJust.stationId)}</b> (${toDisplayDate(pendingJust.date)}) ha sido asentada en la bitácora de auditoría de SIPE Admin:\n\n` +
            `📝 <i>«${escapeHtml(rawText)}»</i>\n\n` +
            `👤 Registrado por: <b>${escapeHtml(user.first_name || user.telegram_username || 'Usuario')}</b>`;

        await sendTelegramMessage(chatId, voicePrefix + ackJustMsg, keyboard);
        return;
    }

    // B.2 Interceptar comandos técnicos y respuestas pendientes de Tickets / Consola AGY
    try {
        const ticketTelegramAgyService = require('./ticketTelegramAgyService');
        const handledTicketCmd = await ticketTelegramAgyService.handleTicketTextCommand(
            chatId,
            rawText,
            user,
            effectivePerms,
            { sendTelegramMessage, answerCallbackQuery, editMessageReplyMarkup, sendChatAction, escapeHtml }
        );
        if (handledTicketCmd) return;
    } catch (tCmdErr) {
        console.error('[TelegramBot] Error en comando de Ticket/AGY:', tCmdErr.message);
    }

    // B.3 Interceptar asistentes interactivos de Tareas Multi-Usuario y Agenda de Eventos MiBot
    try {
        const db = getDb();
        const externalDb = await getExternalDb().catch(() => null);
        const handledWizard = await handleActiveProductivityWizardMessage({
            db,
            externalDb,
            rawText,
            chatId,
            user,
            effectivePerms,
            voicePrefix,
            transport: { sendTelegramMessage, getMainReplyKeyboard }
        });
        if (handledWizard) return;
    } catch (wizErr) {
        console.error('[TelegramBot] Error en asistente de productividad:', wizErr.message);
    }

    // C. Detección en lenguaje natural de insatisfacción directa (ej. 'no contestaste bien', 'no me sirvio', 'esta mal')
    const isExplicitNegativeFeedback = /\b(no\s+contestaste\s+bien|no\s+respondiste\s+bien|no\s+me\s+sirvio|no\s+me\s+sirve|esta\s+mal\s+la\s+respuesta|respuesta\s+incorrecta|no\s+es\s+lo\s+que\s+pedi|eso\s+no\s+es\s+lo\s+que\s+pregunte|te\s+equivocaste)\b/i.test(normalizeText(rawText));
    if (isExplicitNegativeFeedback) {
        let latestFeedbackId = null;
        let consultaOriginal = null;
        let respuestaAnterior = null;

        const inlineClarification = normalizeText(rawText)
            .replace(/\b(no\s+contestaste\s+bien|no\s+respondiste\s+bien|no\s+me\s+sirvio|no\s+me\s+sirve|esta\s+mal\s+la\s+respuesta|respuesta\s+incorrecta|eso\s+no\s+es\s+lo\s+que\s+pregunte|no\s+es\s+lo\s+que\s+pedi|te\s+equivocaste)\b/gi, ' ')
            .replace(/^[\s,.;:-]+/, '')
            .trim();
        const hasInlineClarification = inlineClarification.length >= 10;

        try {
            const db = getDb();
            if (db) {
                const [recentRows] = await db.query(
                    `SELECT id, consulta_original, respuesta_resumen FROM telegram_feedback 
                     WHERE telegram_user_id = ? 
                     ORDER BY created_at DESC LIMIT 1`,
                    [String(user.telegram_user_id)]
                );
                if (recentRows.length > 0) {
                    latestFeedbackId = recentRows[0].id;
                    consultaOriginal = recentRows[0].consulta_original || null;
                    respuestaAnterior = recentRows[0].respuesta_resumen || null;
                    await db.query(
                        `UPDATE telegram_feedback 
                         SET calificacion = 'NO_UTIL',
                             comentario_mejora = COALESCE(?, comentario_mejora),
                             estado = ?,
                             updated_at = NOW() 
                         WHERE id = ?`,
                        [
                            hasInlineClarification ? rawText : null,
                            hasInlineClarification ? 'COMPLETADO' : 'ABIERTO',
                            latestFeedbackId
                        ]
                    );
                }
            }
        } catch (_) {
            // Silenciosamente ignorar fallo si la BD no está disponible
        }

        if (hasInlineClarification) {
            const healed = await attemptSelfHealingCorrection({
                user,
                chatId,
                effectivePerms,
                keyboard,
                voicePrefix,
                feedbackId: latestFeedbackId,
                consultaOriginal,
                respuestaAnterior,
                clarificationText: inlineClarification
            });
            if (healed) return;
        }

        pendingFeedbackUsers.set(String(user.telegram_user_id), {
            feedbackId: latestFeedbackId,
            consultaOriginal,
            respuestaAnterior,
            timestamp: Date.now()
        });

        const promptMsg = `✍️ <b>Lamento no haber respondido adecuadamente.</b>\n\n` +
            `Cuéntame con tus palabras qué dato exacto buscabas y <b>te enviaré la respuesta corregida de inmediato</b>.\n\n` +
            `<i>(Escribe tu aclaración a continuación o envía /cancelar)</i>`;

        await sendTelegramMessage(chatId, voicePrefix + promptMsg, keyboard);
        return;
    }

    // D. Detección en lenguaje natural de satisfacción directa (ej. 'contestaste bien', 'gracias, muy util')
    const isExplicitPositiveFeedback = !isExplicitNegativeFeedback && /\b(contestaste\s+bien|buena\s+respuesta|gracias\s+por\s+la\s+informacion|excelente\s+servicio|muy\s+util|me\s+sirvio)\b/i.test(normalizeText(rawText));
    if (isExplicitPositiveFeedback) {
        try {
            const db = getDb();
            if (db) {
                await db.query(
                    `UPDATE telegram_feedback 
                     SET calificacion = 'UTIL', estado = 'COMPLETADO', updated_at = NOW() 
                     WHERE telegram_user_id = ? AND calificacion = 'PENDIENTE' 
                     ORDER BY created_at DESC LIMIT 1`,
                    [String(user.telegram_user_id)]
                );
            }
        } catch (_) {
            // Silenciosamente ignorar fallo si la BD no está disponible
        }

        const thanksMsg = `🙌 <b>¡Con mucho gusto!</b>\n\n` +
            `Me alegra que te haya sido de utilidad la respuesta. Quedo atento a tus próximas consultas en SIPE.`;
        await sendTelegramMessage(chatId, voicePrefix + thanksMsg, keyboard);
        return;
    }

    // Comandos de Saludo / Inicio (Limpia contexto multi-turno y wizards activos)
    if (cleanLower === 'start' || cleanLower === 'menu' || cleanLower === 'hola' || cleanLower === 'inicio' || cleanLower === 'cancelar') {
        clearUserConversationContext(user.telegram_user_id);
        clearProductivityWizards(user.telegram_user_id);
        await logTelegramQuery(user.telegram_user_id, `/${cleanLower}`, 'Menú principal / Reinicio de contexto', 1);
        const name = escapeHtml(user.first_name || 'Usuario');
        const welcome = `👋 ¡Hola <b>${name}</b>!\n` +
            `Bienvenido al asistente de consultas gerenciales de <b>SIPE Admin</b>.\n\n` +
            `Usa los botones inferiores para consultar información en tiempo real:`;
        await sendTelegramMessage(chatId, voicePrefix + welcome, keyboard);
        return;
    }

    // Comando de Sugerencias / Feedback para Administradores
    if (cleanLower === 'sugerencias' || cleanLower === '/sugerencias' || cleanLower === 'feedback' || cleanLower === '/feedback') {
        const isAdmin = Boolean(
            effectivePerms.isAdmin ||
            user.is_admin ||
            (effectivePerms.linkedUser && (
                effectivePerms.linkedUser.role_name === 'Administrator' ||
                effectivePerms.linkedUser.role_name === 'Super Administrator' ||
                (effectivePerms.linkedUser.permissions && effectivePerms.linkedUser.permissions.includes('/dashboard/seguridad/telegram'))
            ))
        );

        if (!isAdmin) {
            await logTelegramQuery(user.telegram_user_id, rawText, 'Permiso denegado sugerencias', 0);
            const deniedMsg = `⛔ <b>Acceso Restringido</b>\n\nEl reporte de sugerencias de mejora está restringido exclusivamente a <b>Administradores</b> de SIPE Admin.`;
            await sendTelegramMessage(chatId, voicePrefix + deniedMsg, keyboard);
            return;
        }

        await logTelegramQuery(user.telegram_user_id, rawText, 'Listado de sugerencias de Telegram', 1);
        const feedbackList = await getFeedbackList({ limit: 5 });
        const listMsg = formatFeedbackListMessage(feedbackList);
        await sendTelegramMessage(chatId, voicePrefix + listMsg, keyboard);
        return;
    }

    // Comandos de MiBot Personal (ver avisos, pagos pendientes, tareas y reuniones asignadas)
    if (
        cleanLower === 'mibot' ||
        cleanLower === '/mibot' ||
        cleanLower === 'mis avisos' ||
        cleanLower === '/misavisos'
    ) {
        await logTelegramQuery(user.telegram_user_id, '/mibot', 'Consulta de avisos personales MiBot', 1);
        try {
            const db = getDb();
            const mibotService = require('./mibotNotifierService');
            const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username || 'Usuario';
            const inboxHtml = await mibotService.formatUserPersonalMibotInbox(db, user.telegram_user_id, displayName);
            const mibotMarkup = {
                inline_keyboard: [
                    [
                        { text: '📋 Mis Tareas', callback_data: 'tg_tsk:l:mine' },
                        { text: '🗓️ Agenda 7 Días', callback_data: 'tg_evt:r:semana' }
                    ],
                    [
                        { text: '➕ Asignar Tarea', callback_data: 'tg_tsk:new' },
                        { text: '➕ Agendar Evento', callback_data: 'tg_evt:new' }
                    ]
                ]
            };
            await sendTelegramMessage(chatId, voicePrefix + inboxHtml, mibotMarkup);
        } catch (mibotErr) {
            console.error('[TelegramBot] Error consultando MiBot inbox:', mibotErr.message);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No fue posible consultar tus avisos de MiBot en este momento.', keyboard);
        }
        return;
    }

    // Acceso rápido desde botón del teclado: "📋 Tareas & Agenda"
    if (normalizeText(rawText).replace(/^[^a-z0-9]+/, '').trim() === 'tareas & agenda') {
        try {
            const db = getDb();
            const sipeUserId = effectivePerms?.linkedUser?.id ? Number(effectivePerms.linkedUser.id) : (user?.user_id ? Number(user.user_id) : null);
            const canManageTeam = Boolean(effectivePerms?.tareas || effectivePerms?.isAdmin);
            const tasksData = await getTasksSummaryData({ db, sipeUserId, canManageTeam, scope: 'mine' });
            await logTelegramQuery(user.telegram_user_id, '/tareas', 'Botón Tareas & Agenda', 1);
            await sendTelegramMessage(chatId, voicePrefix + formatTasksMessage(tasksData), getTasksInlineMarkup(tasksData));
        } catch (tBtnErr) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error consultando tareas: ' + escapeHtml(tBtnErr.message), keyboard);
        }
        return;
    }

    // Acceso rápido desde botón del teclado: "💳 Control de Pagos"
    if (normalizeText(rawText).replace(/^[^a-z0-9]+/, '').trim() === 'control de pagos') {
        if (!effectivePerms.control_pagos && !effectivePerms.saldos_banco && !effectivePerms.ventas && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar Control de Pagos.', keyboard);
            return;
        }
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const db = getDb();
            const externalDb = await getExternalDb().catch(() => null);
            const pagosData = await getControlPagosDetailedData({ db, externalDb, filterMode: 'resumen' });
            await logTelegramQuery(user.telegram_user_id, '/pagos', 'Botón Control de Pagos', 1);
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + formatControlPagosMessage(pagosData), {
                user,
                query: 'Control de Pagos',
                responseSummary: `Saldo: $${pagosData.total_saldo_pendiente_usd}`,
                reply_markup: getControlPagosInlineMarkup(pagosData)
            });
        } catch (pBtnErr) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error consultando Control de Pagos: ' + escapeHtml(pBtnErr.message), keyboard);
        }
        return;
    }

    // Comandos de Perfil / ID
    if (cleanLower === 'perfil' || cleanLower === 'id' || cleanLower === 'mi_id' || cleanLower.includes('mi perfil')) {
        await logTelegramQuery(user.telegram_user_id, '/perfil', 'Consulta de perfil', 1);
        await sendTelegramMessage(chatId, voicePrefix + formatProfileMessage(user, effectivePerms), keyboard);
        return;
    }

    // Comandos de Ayuda
    if (cleanLower === 'ayuda' || cleanLower === 'help') {
        await logTelegramQuery(user.telegram_user_id, '/ayuda', 'Consulta de ayuda', 1);
        await sendTelegramMessage(chatId, voicePrefix + formatHelpMessage(), keyboard);
        return;
    }

    // Comandos de Salud / Diagnóstico / Auditoría
    if (cleanLower === 'salud' || cleanLower === '/salud' || cleanLower === 'auditoria' || cleanLower === '/auditoria' || cleanLower === 'diagnostico' || cleanLower === '/diagnostico') {
        const isAdmin = Boolean(
            effectivePerms.isAdmin ||
            (effectivePerms.linkedUser && (
                effectivePerms.linkedUser.role_name === 'Administrator' ||
                (effectivePerms.linkedUser.permissions && effectivePerms.linkedUser.permissions.includes('/dashboard/seguridad/telegram'))
            ))
        );

        if (!isAdmin) {
            await logTelegramQuery(user.telegram_user_id, `/${cleanLower.replace(/^\//, '')}`, 'Diagnóstico de salud (denegado)', 0);
            const deniedMsg = `⛔ <b>Acceso Restringido</b>\n\nEl reporte de diagnóstico de salud y auditoría forense está restringido exclusivamente a <b>Administradores</b> de SIPE Admin.`;
            await sendTelegramMessage(chatId, voicePrefix + deniedMsg, keyboard);
            return;
        }

        await logTelegramQuery(user.telegram_user_id, `/${cleanLower.replace(/^\//, '')}`, 'Diagnóstico de salud ejecutado', 1);
        await sendTelegramMessage(chatId, '🩺 <i>Ejecutando diagnóstico forense de salud del sistema...</i>');
        try {
            const { formatDiagnosticsMessage, recordQuerySuccess } = require('./telegramAuditorService');
            const diagMsg = await formatDiagnosticsMessage();
            recordQuerySuccess({ durationMs: Date.now() - queryStartTime, userIdOrChatId: user.telegram_user_id });
            await sendTelegramMessage(chatId, voicePrefix + diagMsg, keyboard);
        } catch (diagErr) {
            console.error('[TelegramBot] Error al generar diagnóstico:', diagErr);
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error al generar diagnóstico: ' + escapeHtml(diagErr.message), keyboard);
        }
        return;
    }

    // Comandos ejecutivos directos (/centinela, /audio, /grafica, /flujo, /prestamos, /creditos, /aprobaciones)
    if (cleanLower === 'centinela' || cleanLower === 'liquidez') {
        if (!effectivePerms.alertas && !effectivePerms.saldos_banco && !effectivePerms.isAdmin) {
            await logTelegramQuery(user.telegram_user_id, '/centinela', 'Permiso denegado centinela', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar el Centinela de Liquidez.', keyboard);
            return;
        }
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const db = getDb();
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const sentinelRes = await evaluateSentinelAlerts({ db, externalDb, accountingDb });
            await logTelegramQuery(user.telegram_user_id, '/centinela', `Alertas: ${sentinelRes.alertKeys.length}`, 1);
            await sendTelegramMessage(chatId, voicePrefix + formatSentinelMessage(sentinelRes), getSentinelInlineMarkup());
        } catch (err) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error ejecutando Centinela: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    if (cleanLower === 'audio' || cleanLower === 'voz') {
        try {
            await logTelegramQuery(user.telegram_user_id, '/audio', 'Resumen ejecutivo en audio TTS', 1);
            const ctx = getUserConversationContext(user.telegram_user_id);
            await buildAndSendExecutiveAudio({
                chatId,
                user,
                effectivePerms,
                targetDate: ctx?.lastDate || getDateStr(-1),
                transport: { sendTelegramMessage, sendChatAction, sendTelegramAudio }
            });
        } catch (err) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error generando nota de audio: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    if (cleanLower === 'grafica' || cleanLower.startsWith('grafica ')) {
        const arg = cleanLower.replace(/^grafica\s*/i, '').trim();
        let topic = 'ventas';
        if (arg.includes('banco')) topic = 'bancos';
        else if (arg.includes('flujo')) topic = 'flujo';
        else if (arg.includes('solar')) topic = 'solar';
        try {
            const ctx = getUserConversationContext(user.telegram_user_id);
            await logTelegramQuery(user.telegram_user_id, '/grafica', `Gráfica PNG (${topic})`, 1);
            await buildAndSendTopicChart({
                chatId,
                topic,
                targetDate: ctx?.lastDate || getDateStr(-1),
                effectivePerms,
                transport: { sendTelegramMessage, sendChatAction, sendTelegramPhoto }
            });
        } catch (err) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error generando gráfica PNG: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    if (cleanLower === 'flujo' || cleanLower.startsWith('flujo ')) {
        if (!effectivePerms.saldos_banco && !effectivePerms.control_pagos && !effectivePerms.isAdmin) {
            await logTelegramQuery(user.telegram_user_id, '/flujo', 'Permiso denegado flujo', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar flujo de caja.', keyboard);
            return;
        }
        const horizon = cleanLower.includes('60') ? 60 : 30;
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const flujoData = await getFlujoResumenData({ horizon });
            await logTelegramQuery(user.telegram_user_id, '/flujo', `Flujo ${horizon}d`, 1);
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + formatFlujoMessage(flujoData), {
                user,
                query: rawText,
                responseSummary: `Flujo ${horizon}d: ${flujoData?.kpi?.salud_flujo || 'OK'}`,
                reply_markup: getFlujoInlineMarkup(horizon)
            });
        } catch (err) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error consultando flujo de caja: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    if (cleanLower === 'prestamos' || cleanLower.startsWith('prestamos ')) {
        if (!effectivePerms.saldos_banco && !effectivePerms.finanzas_prestamos && !effectivePerms.isAdmin) {
            await logTelegramQuery(user.telegram_user_id, '/prestamos', 'Permiso denegado préstamos', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar préstamos.', keyboard);
            return;
        }
        const estado = cleanLower.includes('todos') ? 'todos' : 'activo';
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const prestData = await getPrestamosResumenData({ db: getDb(), estado });
            await logTelegramQuery(user.telegram_user_id, '/prestamos', `Préstamos (${estado})`, 1);
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + formatPrestamosMessage(prestData), {
                user,
                query: rawText,
                responseSummary: `Préstamos: $${prestData.saldo_total_usd}`,
                reply_markup: getPrestamosInlineMarkup(estado)
            });
        } catch (err) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error consultando préstamos: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    if (cleanLower === 'creditos' || cleanLower.startsWith('creditos ')) {
        if (!effectivePerms.ventas && !effectivePerms.saldos_banco && !effectivePerms.isAdmin) {
            await logTelegramQuery(user.telegram_user_id, '/creditos', 'Permiso denegado créditos', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar créditos de flotas.', keyboard);
            return;
        }
        const filter = cleanLower.includes('critico') || cleanLower.includes('mora') ? 'critico' : 'todos';
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const credData = await getCreditosResumenData({ filter });
            await logTelegramQuery(user.telegram_user_id, '/creditos', `Créditos flotas (${filter})`, 1);
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + formatCreditosMessage(credData), {
                user,
                query: rawText,
                responseSummary: `Cartera: $${credData?.resumen_cartera?.total_cartera_activa_usd || 0}`,
                reply_markup: getCreditosInlineMarkup(filter)
            });
        } catch (err) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error consultando créditos de flotas: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    if (cleanLower === 'aprobaciones' || cleanLower.startsWith('aprobaciones ')) {
        if (!canUserApproveFinancialOp(effectivePerms)) {
            await logTelegramQuery(user.telegram_user_id, '/aprobaciones', 'Permiso denegado aprobaciones', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⛔ Solo Gerencia o Administración puede consultar y resolver aprobaciones.', keyboard);
            return;
        }
        const filtroEstado = cleanLower.includes('todas') ? 'TODAS' : 'PENDIENTE';
        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const rows = await listApprovalsData({ db: getDb(), estado: filtroEstado });
            await logTelegramQuery(user.telegram_user_id, '/aprobaciones', `Aprobaciones (${filtroEstado})`, 1);
            await sendTelegramMessage(
                chatId,
                voicePrefix + formatApprovalsListMessage(rows, filtroEstado),
                getApprovalsListMarkup(rows) || keyboard
            );
        } catch (err) {
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error consultando aprobaciones: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 0. Comandos o solicitudes de exportación de Reporte Ejecutivo en PDF Tamaño Carta
    const normForPdf = normalizeText(rawText);
    const isDossierCommand = cleanLower === 'dossier' || cleanLower === '/dossier' ||
        /\b(dossier|dossier ejecutivo|dossier semanal|reporte semanal pdf)\b/i.test(normForPdf);
    const isPdfCommand = isDossierCommand || cleanLower === 'pdf' || cleanLower.startsWith('pdf ') ||
        /\b(pdf|documento pdf|reporte en pdf|exportar pdf|mandame el pdf|enviame el pdf)\b/i.test(normForPdf);
    if (isPdfCommand) {
        const userCtx = getUserConversationContext(user.telegram_user_id);
        let pdfTopic = 'ventas';
        if (isDossierCommand || /\b(dossier|semanal)\b/i.test(normForPdf)) {
            pdfTopic = 'dossier';
        } else if (/\b(banco|bancos|saldos bancarios|cuentas bancarias)\b/i.test(normForPdf)) {
            pdfTopic = 'bancos';
        } else if (/\b(chequera|chequeras|cheques)\b/i.test(normForPdf)) {
            pdfTopic = 'chequeras';
        } else if (/\b(competencia|competidores|precios?|dgehm)\b/i.test(normForPdf)) {
            pdfTopic = 'competencia';
        } else if (/\b(solar|solares|paneles|bateria|baterias|fotovoltaic)\b/i.test(normForPdf)) {
            pdfTopic = 'solar';
        } else if (/\b(andelsa|saas|nova)\b/i.test(normForPdf)) {
            pdfTopic = 'andelsa';
        } else if (/\b(venta|ventas|combustible|galon|estacion)\b/i.test(normForPdf)) {
            pdfTopic = 'ventas';
        } else if (userCtx?.lastTopic) {
            pdfTopic = userCtx.lastTopic;
        }

        const canCompetenciaPdf = Boolean(effectivePerms.precios_competencia ?? (effectivePerms.ventas || effectivePerms.alertas));
        if (pdfTopic === 'dossier' && (!effectivePerms.ventas || !effectivePerms.saldos_banco) && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ El Dossier Ejecutivo Semanal requiere permisos gerenciales de Ventas y Bancos.', keyboard);
            return;
        }
        if ((pdfTopic.includes('competencia') || pdfTopic.includes('precio') || pdfTopic.includes('dgehm')) && !canCompetenciaPdf) {
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para exportar reportes de precios de competencia.', keyboard);
            return;
        }
        if (pdfTopic.includes('banco') && !effectivePerms.saldos_banco) {
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para exportar reportes de bancos.', keyboard);
            return;
        }
        if (pdfTopic.includes('chequera') && !effectivePerms.saldos_chequera) {
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para exportar reportes de chequera.', keyboard);
            return;
        }
        if (pdfTopic.includes('venta') && !effectivePerms.ventas && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para exportar reportes de ventas.', keyboard);
            return;
        }
        if (pdfTopic.includes('andelsa') && !effectivePerms.ventas && !effectivePerms.saldos_banco && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para exportar reportes de Andelsa.', keyboard);
            return;
        }
        if (pdfTopic.includes('solar') && !effectivePerms.ventas && !effectivePerms.alertas && !effectivePerms.isAdmin) {
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para exportar reportes de energía solar.', keyboard);
            return;
        }

        const targetDate = parseSpanishDateText(rawText) || userCtx?.lastDate || getDateStr(-1);
        try {
            await logTelegramQuery(user.telegram_user_id, '/pdf', `Exportar PDF (${pdfTopic})`, 1);
            await buildAndSendTopicPdf(chatId, pdfTopic, { targetDate });
        } catch (pdfErr) {
            console.error('[TelegramBot] Error generando reporte PDF:', pdfErr);
            await sendTelegramMessage(chatId, voicePrefix + '❌ Error al generar el reporte PDF: ' + escapeHtml(pdfErr.message), keyboard);
        }
        return;
    }

    // 1. Intentar resolver consultas estructuradas de lenguaje natural con soporte multi-turno
    const handledNlu = await handleSmartNaturalLanguageQuery(user, rawText, chatId, effectivePerms, keyboard, {
        voicePrefix,
        userContext: getUserConversationContext(user.telegram_user_id)
    });
    if (handledNlu) return;

    // 1.5 Comandos directos de botones del teclado o comandos cortos globales (antes de IA para respuesta instantánea y determinista)
    const strippedButtonText = normalizeText(rawText).replace(/^[^a-z0-9]+/i, '').trim();
    const isConciseVentasGlobal = /^(?:ventas?(?:\s+(?:de\s+|en\s+)?(?:estaciones(?:\s+y\s+tiendas)?|combustible|combustibles|global(?:es)?|red))?)(?:\s+(?:de\s+|del\s+)?(?:hoy|ayer|antier|anteayer|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?))?$/i.test(strippedButtonText);
    const isConciseAlertasGlobal = /^(?:alertas?(?:\s+(?:en\s+|de\s+)?estaciones|\s+operativas)?|descuadres?)(?:\s+(?:de\s+|del\s+)?(?:hoy|ayer|antier|anteayer|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?))?$/i.test(strippedButtonText);
    const isConciseCompetenciaGlobal = /^(?:precios?(?:\s+de(?:\s+la)?)?\s+competencia|competencia|precios|dgehm)$/i.test(strippedButtonText);
    const isConciseBancosGlobal = /^(?:saldos?\s+(?:en\s+|de\s+)?bancos?|bancos?|banco|saldos)$/i.test(strippedButtonText);
    const isConciseChequeraGlobal = /^(?:saldos?\s+(?:en\s+|de\s+)?chequeras?|chequeras?|cheques|saldo_chequera)$/i.test(strippedButtonText);
    const isDirectGlobalCommand = isConciseVentasGlobal || isConciseAlertasGlobal || isConciseCompetenciaGlobal || isConciseBancosGlobal || isConciseChequeraGlobal;

    // 2. Si NO es un botón/comando global conciso, atender preguntas abiertas o analíticas mediante el Agente Conversacional IA 360°
    if (!isDirectGlobalCommand) {
        try {
            const { askConversationalAgent } = require('./conversationalAiService');
            const aiResponse = await askConversationalAgent({ user, prompt: rawText, chatId, effectivePerms });
            if (aiResponse) {
                await logTelegramQuery(user.telegram_user_id, rawText, 'Conversación Asistente IA', 1);
                setUserConversationContext(user.telegram_user_id, {
                    query: rawText
                });
                await sendTelegramResponseWithFeedback(chatId, voicePrefix + aiResponse, { user, query: rawText, responseSummary: 'Conversación Asistente IA' });
                return;
            }
        } catch (aiErr) {
            console.warn('[TelegramBot] Agente conversacional no disponible:', aiErr.message);
        }
    }

    // 2.5 CONSULTA: PRECIOS DE LA COMPETENCIA
    if (isConciseCompetenciaGlobal || cleanLower.includes('competencia') || cleanLower === 'precios' || cleanLower === 'dgehm') {
        const canCompetencia = Boolean(effectivePerms.precios_competencia ?? (effectivePerms.ventas || effectivePerms.alertas));
        if (!canCompetencia) {
            await logTelegramQuery(user.telegram_user_id, 'competencia', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar precios de la competencia.', keyboard);
            return;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const compData = await getPreciosCompetenciaData();
            await logTelegramQuery(user.telegram_user_id, 'competencia', `Monitoreadas: ${compData.totalMonitoreadas}`, 1);
            setUserConversationContext(user.telegram_user_id, {
                lastStationId: null,
                lastStationName: null,
                lastProduct: null,
                lastTopic: 'competencia',
                query: rawText
            });
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + formatPreciosCompetenciaMessage(compData), {
                user,
                query: 'Precios de la Competencia',
                responseSummary: `Monitoreadas: ${compData.totalMonitoreadas}`,
                reply_markup: getCompetenciaInlineMarkup()
            });
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de precios de competencia:', err);
            await sendTelegramMessage(chatId, voicePrefix + '❌ Ocurrió un error al consultar precios de la competencia: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 3. CONSULTA: SALDO EN BANCO
    if (isConciseBancosGlobal || cleanLower.includes('saldo en banco') || cleanLower === 'bancos' || cleanLower === 'banco' || cleanLower === 'saldos') {
        if (!effectivePerms.saldos_banco) {
            await logTelegramQuery(user.telegram_user_id, 'bancos', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar saldos en bancos.', keyboard);
            return;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getSaldosBancosData();
            await logTelegramQuery(user.telegram_user_id, 'bancos', `Total: ${data.total}`, 1);
            setUserConversationContext(user.telegram_user_id, {
                lastStationId: null,
                lastStationName: null,
                lastProduct: null,
                lastDate: null,
                lastTopic: 'bancos',
                query: rawText
            });
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + formatBancosMessage(data), { user, query: 'Saldos en Bancos', responseSummary: `Total: ${data.total}` });
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de bancos:', err);
            await sendTelegramMessage(chatId, voicePrefix + '❌ Ocurrió un error al consultar saldos bancarios: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 4. CONSULTA: SALDO EN CHEQUERA
    if (isConciseChequeraGlobal || cleanLower.includes('saldo en chequera') || cleanLower === 'chequera' || cleanLower === 'cheques' || cleanLower === 'saldo_chequera') {
        if (!effectivePerms.saldos_chequera) {
            await logTelegramQuery(user.telegram_user_id, 'chequera', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar saldos en chequera.', keyboard);
            return;
        }

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getSaldosChequeraData();
            await logTelegramQuery(user.telegram_user_id, 'chequera', `Total: ${data.total}`, 1);
            setUserConversationContext(user.telegram_user_id, {
                lastStationId: null,
                lastStationName: null,
                lastProduct: null,
                lastDate: null,
                lastTopic: 'chequera',
                query: rawText
            });
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + formatChequeraMessage(data), { user, query: 'Saldos en Chequera', responseSummary: `Total: ${data.total}` });
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de chequera:', err);
            await sendTelegramMessage(chatId, voicePrefix + '❌ Ocurrió un error al consultar saldos en chequeras: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 5. CONSULTA: ALERTAS EN ESTACIONES
    if (isConciseAlertasGlobal || cleanLower.includes('alertas') || cleanLower.includes('descuadres') || cleanLower.includes('auditoria')) {
        if (!effectivePerms.alertas) {
            await logTelegramQuery(user.telegram_user_id, 'alertas', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar alertas operativas.', keyboard);
            return;
        }

        // Determinar fecha (por defecto ayer, o la indicada)
        const targetDate = parseSpanishDateText(rawText) || getDateStr(-1);

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getConsolidadoVentas(targetDate);
            await logTelegramQuery(user.telegram_user_id, 'alertas', `Fecha: ${targetDate}`, 1);
            setUserConversationContext(user.telegram_user_id, {
                lastDate: targetDate,
                lastStationId: null,
                lastStationName: null,
                lastProduct: null,
                lastTopic: 'alertas',
                query: rawText
            });
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + formatAlertasMessage(data, targetDate), { user, query: `Alertas ${targetDate}`, responseSummary: `Fecha: ${targetDate}` });
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de alertas:', err);
            await sendTelegramMessage(chatId, voicePrefix + '❌ Ocurrió un error al consultar alertas operativas: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 6. CONSULTA: VENTAS DE ESTACIONES
    if (isConciseVentasGlobal || cleanLower.includes('ventas') || cleanLower.includes('venta') || cleanLower.includes('combustible')) {
        if (!effectivePerms.ventas) {
            await logTelegramQuery(user.telegram_user_id, 'ventas', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, voicePrefix + '⚠️ No tienes permiso asignado para consultar ventas de estaciones.', keyboard);
            return;
        }

        const targetDate = parseSpanishDateText(rawText) || getDateStr(-1); // Ventas cerradas de ayer por defecto
        const todayStr = getDateStr(0);

        sendChatAction(chatId, 'typing').catch(() => {});
        try {
            const data = await getConsolidadoVentas(targetDate);
            const totalClosedToday = (data?.estaciones || []).reduce((s, e) => s + Number(e.galonaje || 0) + Number(e.venta || 0), 0) +
                (data?.tiendas || []).reduce((s, t) => s + Number(t.venta || 0), 0);

            let latestClosedRef = null;
            if (targetDate === todayStr && totalClosedToday === 0) {
                const yestStr = getDateStr(-1);
                const yestData = await getConsolidadoVentas(yestStr).catch(() => null);
                if (yestData) {
                    latestClosedRef = { date: yestStr, data: yestData };
                }
            }

            await logTelegramQuery(user.telegram_user_id, 'ventas', `Fecha: ${targetDate}`, 1);
            setUserConversationContext(user.telegram_user_id, {
                lastDate: targetDate,
                lastStationId: null,
                lastStationName: null,
                lastProduct: null,
                lastTopic: 'ventas_global',
                query: rawText
            });
            const ventasMsg = formatVentasMessage(data, targetDate, {
                isTodayOpenShift: targetDate === todayStr && totalClosedToday === 0,
                latestClosedRef
            });
            await sendTelegramResponseWithFeedback(chatId, voicePrefix + ventasMsg, { user, query: `Ventas ${targetDate}`, responseSummary: `Fecha: ${targetDate}` });
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ventas:', err);
            await sendTelegramMessage(chatId, voicePrefix + '❌ Ocurrió un error al consultar las ventas: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // Mensaje no reconocido - enviar orientación inteligente (sin botones 👍/👎 para no distorsionar métricas de calidad)
    await logTelegramQuery(user.telegram_user_id, rawText, 'Comando no reconocido', 1);
    await sendTelegramMessage(
        chatId,
        voicePrefix + formatIntelligentGuidanceMessage(),
        keyboard
    );
};

/**
 * Ciclo principal de Long Polling para Telegram Bot
 */
const runPollingLoop = async (generation) => {
    while (runtimeState.isPollingActive && runtimeState.pollingGeneration === generation) {
        try {
            const { token, isActive } = await getBotToken();
            if (!isActive || !token) {
                console.log('[TelegramBot] Bot en pausa o sin token. Esperando 10 segundos...');
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }

            runtimeState.lastPollAt = new Date();

            // Throttlear actualización de timestamp en base de datos cada 2 minutos (120,000 ms)
            const nowTime = Date.now();
            if (nowTime - runtimeState.lastDbPollUpdate >= 120000) {
                try {
                    const db = getDb();
                    if (db) {
                        await db.query('UPDATE telegram_config SET last_poll_at = NOW() WHERE id = 1');
                        runtimeState.lastDbPollUpdate = nowTime;
                    }
                } catch (_) {
                    // Silenciosamente ignorar fallo de actualización de timestamp en polling
                }
            }

            const res = await axios.get(`${TELEGRAM_API_BASE}${token}/getUpdates`, {
                params: {
                    offset: runtimeState.currentOffset,
                    timeout: 20
                },
                timeout: 30000
            });

            if (res.data?.ok && Array.isArray(res.data.result)) {
                const updates = res.data.result;
                for (const update of updates) {
                    runtimeState.currentOffset = update.update_id + 1;
                    if (update.message) {
                        // Procesar de manera asíncrona sin bloquear la recepción
                        handleIncomingMessage(update.message).catch(err => {
                            console.error('[TelegramBot] Error procesando mensaje:', err.message);
                        });
                    } else if (update.callback_query) {
                        handleCallbackQuery(update.callback_query).catch(err => {
                            console.error('[TelegramBot] Error procesando callback query:', err.message);
                        });
                    }
                }
            }
        } catch (err) {
            // Manejar errores típicos de polling
            if (err.response?.status === 409) {
                console.warn('[TelegramBot] 409 Conflict: Otra instancia está realizando polling. Reintentando en 6s...');
                await new Promise(r => setTimeout(r, 6000));
            } else if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
                // Timeout de conexión normal de long polling, continuar
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.warn('[TelegramBot] Error en ciclo de polling:', err.message);
                try {
                    const { recordError } = require('./telegramAuditorService');
                    recordError({
                        type: 'POLLING_ERROR',
                        message: err.message,
                        stack: err.stack,
                        details: { code: err.code, status: err.response?.status }
                    });
                } catch (_) {
                    // Silencioso
                }
                await new Promise(r => setTimeout(r, 4000));
            }
        }
    }
    console.log('[TelegramBot] Long Polling detenido.');
};

/**
 * Iniciar el servicio de Telegram Bot
 */
const initTelegramBot = async (io = null) => {
    if (io) {
        runtimeIo = io;
    }
    if (runtimeState.isPollingActive) {
        console.log('[TelegramBot] Polling ya se encuentra activo.');
        return;
    }

    try {
        const { token, isActive } = await getBotToken();
        if (!isActive) {
            console.log('[TelegramBot] Bot configurado como inactivo en base de datos.');
            return;
        }

        // Testear bot con getMe
        try {
            runtimeState.botInfo = await testTelegramConnection(token);
            console.log(`[TelegramBot] Conectado exitosamente: @${runtimeState.botInfo.username} (${runtimeState.botInfo.first_name})`);

            const db = getDb();
            if (db) {
                await db.query(
                    'UPDATE telegram_config SET bot_username = ?, bot_first_name = ?, last_poll_at = NOW() WHERE id = 1',
                    [runtimeState.botInfo.username || 'SIPE_IA_BOT', runtimeState.botInfo.first_name || 'SIPE_BOT']
                );
            }
        } catch (connErr) {
            console.warn('[TelegramBot] Advertencia: no se pudo verificar getMe de inmediato:', connErr.message);
        }

        runtimeState.pollingGeneration = (runtimeState.pollingGeneration || 0) + 1;
        const activeGen = runtimeState.pollingGeneration;
        runtimeState.isPollingActive = true;
        startBotMemorySweeper();
        setTelegramBotCommands([
            { command: 'tareas', description: 'Ver y gestionar tareas activas' },
            { command: 'asignar', description: 'Asignar tarea a uno o más usuarios' },
            { command: 'agenda', description: 'Agenda de eventos, reuniones y pagos' },
            { command: 'agendar', description: 'Programar recordatorio o reunión MiBot' },
            { command: 'pagos', description: 'Control de Pagos (vencidos, hoy, parciales)' },
            { command: 'centinela', description: 'Centinela de liquidez 72h y remesas >48h' },
            { command: 'flujo', description: 'Flujo de caja proyectado a 30 o 60 días' },
            { command: 'prestamos', description: 'Cartera de préstamos bancarios' },
            { command: 'creditos', description: 'Riesgo y mora en créditos de flotas' },
            { command: 'grafica', description: 'Gráfica visual PNG (ventas, bancos, flujo, solar)' },
            { command: 'audio', description: 'Resumen ejecutivo en nota de audio' },
            { command: 'aprobaciones', description: 'Bandeja de aprobaciones gerenciales' },
            { command: 'cumpleanos', description: 'Cumpleaños del personal' },
            { command: 'mibot', description: 'Tus avisos personales MiBot' },
            { command: 'ventas', description: 'Resumen de ventas de estaciones' },
            { command: 'bancos', description: 'Saldos consolidados en bancos' },
            { command: 'ayuda', description: 'Guía completa de funciones y comandos' }
        ]).catch(() => {});
        runPollingLoop(activeGen).catch(e => console.error('[TelegramBot] Fallo crítico en polling loop:', e));
    } catch (e) {
        console.error('[TelegramBot] Error al inicializar bot:', e.message);
    }
};

/**
 * Detener el servicio de polling
 */
const stopTelegramBot = () => {
    runtimeState.isPollingActive = false;
    runtimeState.pollingGeneration = (runtimeState.pollingGeneration || 0) + 1;
    stopBotMemorySweeper();
};

/**
 * Reiniciar el servicio
 */
const restartTelegramBot = async () => {
    stopTelegramBot();
    await new Promise(r => setTimeout(r, 1000));
    await initTelegramBot();
};

/**
 * Generar markup con botones inline para alertas interactivas de discrepancias
 */
const getDiscrepancyInlineMarkup = (date, stationId = '008') => {
    const d = date || getDateStr(-1);
    const sid = stationId || '008';
    return {
        inline_keyboard: [
            [
                { text: '🔍 Ver Detalle', callback_data: `alert_dtl:${d}:${sid}` },
                { text: '🏷️ Justificar', callback_data: `alert_just:${d}:${sid}` }
            ],
            [
                { text: '🔄 Re-verificar', callback_data: `alert_recheck:${d}:${sid}` },
                { text: '📊 Resumen del Día', callback_data: `alert_sum:${d}` }
            ]
        ]
    };
};

/**
 * Formatear mensaje de Alerta Gerencial Urgente de Discrepancias
 */
const formatDiscrepancyAlertMessage = ({ effectiveDate, pistaDiscrepancies = [], tiendaDiscrepancies = [], mermasAnomalas = [] }, options = {}) => {
    let msg = `🚨 <b>ALERTA GERENCIAL DE DISCREPANCIAS</b>\n`;
    msg += `📅 <b>Fecha Auditada:</b> ${toDisplayDate(effectiveDate)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const totalDescuadres = pistaDiscrepancies.length + tiendaDiscrepancies.length + mermasAnomalas.length;
    msg += `⚠️ <b>Se detectaron ${totalDescuadres} discrepancia(s) que superan los umbrales de control:</b>\n\n`;

    // 1. Descuadres en Pista (diferencia > $10)
    if (pistaDiscrepancies.length > 0) {
        msg += `⛽ <b>Descuadres en Pista (&gt;$10.00):</b>\n`;
        pistaDiscrepancies.forEach(p => {
            const dif = Number(p.diferencia !== undefined ? p.diferencia : (p.dif || 0));
            const icon = dif < 0 ? '🔴 Faltante' : '🟡 Sobrante';
            const estName = escapeHtml(p.estacion || p.empresa || p.titulo || 'Estación');
            msg += `• ⚠️ <b>${estName}</b>\n`;
            msg += `   └ ${icon}: <code>${moneyFmt(dif)}</code>`;
            if (p.total_venta || p.venta) {
                msg += ` | Venta: ${moneyFmt(p.total_venta || p.venta)}`;
            }
            msg += `\n`;
        });
        msg += `\n`;
    }

    // 2. Descuadres en Cortes de Tienda (diferencia > $5)
    if (tiendaDiscrepancies.length > 0) {
        msg += `🛒 <b>Descuadres en Cortes de Tienda (&gt;$5.00):</b>\n`;
        tiendaDiscrepancies.forEach(t => {
            const dif = Number(t.dif !== undefined ? t.dif : (t.diferencia || 0));
            const icon = dif < 0 ? '🔴 Faltante' : '🟡 Sobrante';
            const tiendaName = escapeHtml(t.empresa || t.tienda_nombre || t.titulo || 'Tienda');
            msg += `• ⚠️ <b>${tiendaName}</b>\n`;
            msg += `   └ ${icon}: <code>${moneyFmt(dif)}</code>`;
            if (t.venta) {
                msg += ` | Venta: ${moneyFmt(t.venta)}`;
            }
            if (t.gastos && Number(t.gastos) > 0) {
                msg += ` | Gastos: ${moneyFmt(t.gastos)}`;
            }
            msg += `\n`;
        });
        msg += `\n`;
    }

    // 3. Mermas Anómalas / Variaciones
    if (mermasAnomalas.length > 0) {
        msg += `⚠️ <b>Mermas Anómalas / Variaciones de Galonaje:</b>\n`;
        mermasAnomalas.forEach(m => {
            const estName = escapeHtml(m.estacion || m.empresa || m.titulo || 'Estación');
            const prod = escapeHtml(m.nombre_combustible || m.producto || m.tipo_combustible || 'Combustible');
            msg += `• ⚠️ <b>${estName} - ${prod}</b>\n`;
            const difGal = m.diferencia_galones !== undefined ? `${numFmt(m.diferencia_galones)} gal` : '';
            const pct = m.porcentaje_variacion !== undefined ? `(${numFmt(m.porcentaje_variacion)}%)` : '';
            const imp = m.impacto_usd ? ` | Impacto: <code>${moneyFmt(m.impacto_usd)}</code>` : '';
            msg += `   └ Variación: ${difGal} ${pct}${imp}\n`;
        });
        msg += `\n`;
    }

    msg += `🚨 <i>Notificación automática gerencial emitida por SIPE Admin.</i>\n`;
    msg += `<i>Por favor verificar cierres y cuadres de caja correspondientes.</i>`;

    if (options && (options.withMarkup || options.withButtons)) {
        const primaryStationId = options.stationId || 
                                 pistaDiscrepancies[0]?.estacion_id || 
                                 pistaDiscrepancies[0]?.branch_id || 
                                 resolveStationId(pistaDiscrepancies[0]?.estacion || pistaDiscrepancies[0]?.empresa) || 
                                 '008';
        return {
            text: msg,
            reply_markup: getDiscrepancyInlineMarkup(effectiveDate, primaryStationId)
        };
    }

    return msg;
};
formatDiscrepancyAlertMessage.getInlineMarkup = getDiscrepancyInlineMarkup;


/**
 * Obtiene usuarios activos autorizados para recibir alertas broadcast, evitando
 * truncamiento de permisos por el límite de 1024 bytes de GROUP_CONCAT.
 */
const fetchAuthorizedAlertUsers = async (db) => {
    try {
        const [users] = await db.query(`
            SELECT tu.*, u.status as sipe_status, u.role_id as sipe_role_id, r.name as sipe_role_name,
                   GROUP_CONCAT(p.name) as sipe_permissions
            FROM telegram_usuarios tu
            LEFT JOIN users u ON tu.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE tu.activo = 1
            GROUP BY tu.id
        `);

        const roleIds = [...new Set((users || []).map(u => Number(u.sipe_role_id)).filter(id => Number.isFinite(id) && id > 0))];
        const permsByRole = {};
        if (roleIds.length > 0) {
            try {
                const [permRows] = await db.query(
                    'SELECT rp.role_id, p.name FROM role_permissions rp INNER JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id IN (?)',
                    [roleIds]
                );
                if (Array.isArray(permRows)) {
                    for (const pr of permRows) {
                        const rid = Number(pr.role_id);
                        if (!permsByRole[rid]) permsByRole[rid] = [];
                        if (pr.name) permsByRole[rid].push(String(pr.name).trim());
                    }
                }
            } catch (_) {
                // Fallback a GROUP_CONCAT en mocks
            }
        }

        return (users || []).filter(u => {
            if (u.user_id && u.sipe_status === 'inactive') return false;
            if (Number(u.permiso_alertas) === 1) return true;
            if (u.user_id && (Number(u.sipe_role_id) === 1 || u.sipe_role_name === 'Administrator' || u.sipe_role_name === 'Super Administrator')) return true;
            const directPerms = permsByRole[Number(u.sipe_role_id)];
            const perms = (Array.isArray(directPerms) && directPerms.length > 0)
                ? directPerms
                : (u.sipe_permissions || '').split(',').map(p => p.trim()).filter(Boolean);
            return perms.includes('/dashboard/consultas/estaciones/diferencias-combustible') ||
                   perms.includes('/dashboard/consultas/estaciones/resumen-cierre');
        });
    } catch (dbErr) {
        try {
            const [simpleUsers] = await db.query(
                'SELECT * FROM telegram_usuarios WHERE activo = 1 AND permiso_alertas = 1'
            );
            return simpleUsers || [];
        } catch (sErr) {
            console.warn('[TelegramBot] Error consultando telegram_usuarios:', sErr.message);
            return [];
        }
    }
};

/**
 * Difusión Proactiva de Alertas de Discrepancias
 * Analiza consolidado de ventas, filtra descuadres >$10 en pista, >$5 en tiendas o mermas anómalas
 * y lo envía vía Telegram a todos los directores autorizados (activo = 1 y permiso_alertas = 1).
 */
const broadcastDiscrepancyAlerts = async (targetDate = null, customDataOrOptions = null) => {
    const effectiveDate = targetDate ? (parseUserDate(targetDate) || targetDate) : getDateStr(-1);

    let data = null;
    let customUsers = null;

    if (customDataOrOptions) {
        if (customDataOrOptions.resumen_cierre || customDataOrOptions.cortes_tienda || customDataOrOptions.estaciones) {
            data = customDataOrOptions;
        } else if (customDataOrOptions.data) {
            data = customDataOrOptions.data;
            customUsers = customDataOrOptions.users || customDataOrOptions.recipients;
        } else if (Array.isArray(customDataOrOptions)) {
            customUsers = customDataOrOptions;
        }
    }

    if (!data) {
        data = await getConsolidadoVentas(effectiveDate);
    }

    // 1. Filtrar descuadres en pista (diferencia > $10)
    const pistaDiscrepancies = (data?.resumen_cierre || []).filter(r => {
        const dif = Math.abs(Number(r.diferencia !== undefined ? r.diferencia : (r.dif || 0)));
        return dif > 10;
    });

    // 2. Filtrar descuadres en cortes de tienda (diferencia > $5)
    const tiendaDiscrepancies = (data?.cortes_tienda || []).filter(t => {
        const dif = Math.abs(Number(t.dif !== undefined ? t.dif : (t.diferencia || 0)));
        return dif > 5;
    });

    // 3. Filtrar mermas anómalas
    let mermasAnomalas = [];
    if (Array.isArray(data?.mermas)) {
        mermasAnomalas = data.mermas.filter(m => 
            m.estado === 'critico' || 
            Math.abs(Number(m.porcentaje_variacion || 0)) > 0.50 || 
            Math.abs(Number(m.diferencia_galones || 0)) > 50 ||
            Math.abs(Number(m.impacto_usd || 0)) > 50
        );
    } else {
        try {
            const { getAuditoriaMermas } = require('./fuelIntelligence');
            if (typeof getAuditoriaMermas === 'function') {
                const mData = await getAuditoriaMermas(effectiveDate, effectiveDate);
                if (mData && Array.isArray(mData.auditorias)) {
                    mermasAnomalas = mData.auditorias.filter(m => 
                        m.estado === 'critico' || 
                        Math.abs(Number(m.porcentaje_variacion || 0)) > 0.50 || 
                        Math.abs(Number(m.diferencia_galones || 0)) > 50 ||
                        Math.abs(Number(m.impacto_usd || 0)) > 50
                    );
                }
            }
        } catch (_) {
            // Silencioso en caso de entorno sin BD de combustibles
        }
    }

    const totalDiscrepancies = pistaDiscrepancies.length + tiendaDiscrepancies.length + mermasAnomalas.length;

    // Si no existen discrepancias, no emitir alertas a usuarios
    if (totalDiscrepancies === 0) {
        return {
            ok: true,
            fecha: effectiveDate,
            discrepancies_found: false,
            total_discrepancies: 0,
            descuadres_pista: 0,
            descuadres_tienda: 0,
            mermas_anomalas: 0,
            recipients_count: 0,
            recipients: [],
            message: 'No se detectaron descuadres ni mermas anómalas superiores a los umbrales para la fecha auditada.'
        };
    }

    // Obtener usuarios autorizados con activo = 1 y permiso_alertas = 1
    let authorizedUsers = customUsers || [];
    if (!customUsers) {
        const db = getDb();
        if (db) {
            authorizedUsers = await fetchAuthorizedAlertUsers(db);
        }
    }

    const alertMessage = formatDiscrepancyAlertMessage({
        effectiveDate,
        pistaDiscrepancies,
        tiendaDiscrepancies,
        mermasAnomalas
    });

    const primaryStationId = pistaDiscrepancies[0]?.estacion_id || 
                             pistaDiscrepancies[0]?.branch_id || 
                             resolveStationId(pistaDiscrepancies[0]?.estacion || pistaDiscrepancies[0]?.empresa) || 
                             '008';
    const alertMarkup = getDiscrepancyInlineMarkup(effectiveDate, primaryStationId);

    const sendResults = [];
    for (const user of authorizedUsers) {
        try {
            await sendTelegramMessage(user.telegram_user_id, alertMessage, alertMarkup);
            await logTelegramQuery(
                user.telegram_user_id,
                'BROADCAST_DISCREPANCY_ALERT',
                `Alerta discrepancias ${effectiveDate}: ${pistaDiscrepancies.length} pista, ${tiendaDiscrepancies.length} tienda`,
                1
            );
            sendResults.push({
                telegram_user_id: user.telegram_user_id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username,
                status: 'sent'
            });
        } catch (err) {
            console.error(`[TelegramBot] Error al enviar alerta a chat ${user.telegram_user_id}:`, err.message);
            sendResults.push({
                telegram_user_id: user.telegram_user_id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username,
                status: 'failed',
                error: err.message
            });
        }
    }

    if (authorizedUsers.length === 0) {
        await logTelegramQuery(
            'SYSTEM',
            'BROADCAST_DISCREPANCY_ALERT',
            `Discrepancias detectadas (${effectiveDate}) sin destinatarios con permiso_alertas activo`,
            0
        );
    }

    return {
        ok: true,
        fecha: effectiveDate,
        discrepancies_found: true,
        total_discrepancies: totalDiscrepancies,
        descuadres_pista: pistaDiscrepancies.length,
        descuadres_tienda: tiendaDiscrepancies.length,
        mermas_anomalas: mermasAnomalas.length,
        recipients_count: authorizedUsers.length,
        recipients: sendResults,
        details: {
            pista: pistaDiscrepancies.map(p => ({
                estacion: p.estacion || p.empresa || p.titulo || 'Estación',
                diferencia: Number(p.diferencia !== undefined ? p.diferencia : (p.dif || 0))
            })),
            tienda: tiendaDiscrepancies.map(t => ({
                empresa: t.empresa || t.tienda_nombre || t.titulo || 'Tienda',
                diferencia: Number(t.dif !== undefined ? t.dif : (t.diferencia || 0))
            })),
            mermas: mermasAnomalas.map(m => ({
                estacion: m.estacion || m.empresa || m.titulo || 'Estación',
                producto: m.nombre_combustible || m.producto || m.tipo_combustible || 'Combustible',
                diferencia_galones: m.diferencia_galones,
                porcentaje_variacion: m.porcentaje_variacion
            }))
        }
    };
};

/**
 * Difusión de Alerta Gerencial Personalizada (Para n8n o Administradores)
 */
const broadcastCustomAlert = async ({ message, title = null, severity = 'alerta' }, customUsers = null) => {
    if (!message || !String(message).trim()) {
        throw new Error('El mensaje de la alerta es obligatorio');
    }

    let authorizedUsers = customUsers || [];
    if (!customUsers) {
        const db = getDb();
        if (db) {
            authorizedUsers = await fetchAuthorizedAlertUsers(db);
        }
    }

    const sevIcon = severity === 'danger' || severity === 'critico' ? '🚨' : (severity === 'info' ? 'ℹ️' : '⚠️');
    const headerTitle = title ? escapeHtml(title) : 'COMUNICADO GERENCIAL SIPE';

    let formattedMsg = `${sevIcon} <b>${headerTitle}</b>\n`;
    formattedMsg += `📅 <b>Fecha:</b> ${toDisplayDate(getDateStr(0))}\n`;
    formattedMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    formattedMsg += `${escapeHtml(message)}\n\n`;
    formattedMsg += `<i>Mensaje emitido vía SIPE Automation</i>`;

    const sendResults = [];
    for (const user of authorizedUsers) {
        try {
            await sendTelegramMessage(user.telegram_user_id, formattedMsg);
            await logTelegramQuery(
                user.telegram_user_id,
                'BROADCAST_CUSTOM_ALERT',
                message.slice(0, 200),
                1
            );
            sendResults.push({
                telegram_user_id: user.telegram_user_id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username,
                status: 'sent'
            });
        } catch (err) {
            sendResults.push({
                telegram_user_id: user.telegram_user_id,
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.telegram_username,
                status: 'failed',
                error: err.message
            });
        }
    }

    if (authorizedUsers.length === 0) {
        await logTelegramQuery(
            'SYSTEM',
            'BROADCAST_CUSTOM_ALERT',
            `Alerta broadcast emitida sin destinatarios con permiso_alertas activo: ${message.slice(0, 100)}`,
            0
        );
    }

    return {
        ok: true,
        recipients_count: authorizedUsers.length,
        recipients: sendResults,
        message: 'Alerta broadcast procesada con éxito'
    };
};

/**
 * Obtener estadísticas consolidadas de satisfacción y retroalimentación del bot
 */
const getFeedbackStats = async () => {
    try {
        const db = getDb();
        if (!db) {
            return {
                total: 0,
                utiles: 0,
                no_utiles: 0,
                pendientes: 0,
                con_comentarios: 0,
                tasa_satisfaccion: 100.0
            };
        }

        const [rows] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN calificacion = 'UTIL' THEN 1 ELSE 0 END) as utiles,
                SUM(CASE WHEN calificacion = 'NO_UTIL' THEN 1 ELSE 0 END) as no_utiles,
                SUM(CASE WHEN calificacion = 'PENDIENTE' THEN 1 ELSE 0 END) as pendientes,
                SUM(CASE WHEN comentario_mejora IS NOT NULL AND TRIM(comentario_mejora) != '' THEN 1 ELSE 0 END) as con_comentarios
            FROM telegram_feedback
        `);

        const r = rows?.[0] || {};
        const total = Number(r.total || 0);
        const utiles = Number(r.utiles || 0);
        const no_utiles = Number(r.no_utiles || 0);
        const evaluados = utiles + no_utiles;
        const tasa = evaluados > 0 ? Number(((utiles / evaluados) * 100).toFixed(1)) : 100.0;

        return {
            total,
            utiles,
            no_utiles,
            pendientes: Number(r.pendientes || 0),
            con_comentarios: Number(r.con_comentarios || 0),
            tasa_satisfaccion: tasa
        };
    } catch (err) {
        console.error('[TelegramBot] Error al obtener estadísticas de feedback:', err);
        return {
            total: 0,
            utiles: 0,
            no_utiles: 0,
            pendientes: 0,
            con_comentarios: 0,
            tasa_satisfaccion: 100.0
        };
    }
};

/**
 * Obtener listado de registros de retroalimentación para mejora continua
 */
const getFeedbackList = async ({ limit = 50, offset = 0, estado = null, calificacion = null } = {}) => {
    try {
        const db = getDb();
        if (!db) return [];

        let sql = 'SELECT * FROM telegram_feedback WHERE 1=1';
        const params = [];

        if (estado) {
            sql += ' AND estado = ?';
            params.push(estado);
        }
        if (calificacion) {
            sql += ' AND calificacion = ?';
            params.push(calificacion);
        }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit) || 50, Number(offset) || 0);

        const [rows] = await db.query(sql, params);
        return rows || [];
    } catch (err) {
        console.error('[TelegramBot] Error al obtener listado de feedback:', err);
        return [];
    }
};

/**
 * Formatear lista de las últimas sugerencias/feedback para visualización de administradores
 */
const formatFeedbackListMessage = (feedbacks) => {
    let msg = `📬 <b>ÚLTIMAS 5 SUGERENCIAS Y FEEDBACK</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    if (!feedbacks || feedbacks.length === 0) {
        msg += `<i>No hay sugerencias registradas en la bitácora actualmente.</i>`;
        return msg;
    }

    feedbacks.forEach((f, idx) => {
        const califIcon = f.calificacion === 'UTIL' ? '👍 Útil' : (f.calificacion === 'NO_UTIL' ? '👎 No útil' : '⏳ Pendiente');
        const estadoBadge = f.estado === 'COMPLETADO' ? '🟢 Completado' : (f.estado === 'ABIERTO' ? '🟡 Abierto' : `⚪ ${escapeHtml(f.estado || 'Pendiente')}`);
        const userLabel = escapeHtml(f.first_name || f.telegram_username || f.telegram_user_id || 'Usuario');
        const dStr = f.created_at ? toDisplayDate(new Date(f.created_at).toISOString().split('T')[0]) : '';

        msg += `<b>${idx + 1}. ${userLabel}</b> ${dStr ? `(${dStr})` : ''}\n`;
        msg += `   • <b>Calificación:</b> ${califIcon} | <b>Estado:</b> ${estadoBadge}\n`;
        if (f.consulta_original) {
            msg += `   • <b>Consulta:</b> <i>«${escapeHtml(f.consulta_original.substring(0, 80))}»</i>\n`;
        }
        if (f.comentario_mejora) {
            msg += `   • <b>Sugerencia:</b> 💡 <i>«${escapeHtml(f.comentario_mejora)}»</i>\n`;
        }
        msg += `\n`;
    });

    msg += `<i>Gestiona el ciclo completo de feedback desde SIPE Admin Web.</i>`;
    return msg;
};

module.exports = {
    initTelegramBot,
    stopTelegramBot,
    restartTelegramBot,
    getBotStatus,
    testTelegramConnection,
    sendTelegramMessage,
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatProfileMessage,
    formatHelpMessage,
    getUserEffectivePermissions,
    parseUserDate,
    parseSpanishDateText,
    parseSpanishPeriodOrDate,
    SPANISH_MONTH_NAMES,
    moneyFmt,
    numFmt,
    normalizeText,
    parseNaturalLanguageQuery,
    formatSpecificStationMessage,
    formatProductTotalMessage,
    formatRankingMessage,
    formatSpecificBankMessage,
    formatTiendasMessage,
    formatVentasMensualMessage,
    formatVentasRangoMessage,
    formatHorasPicoMessage,
    formatSolarEnergyMessage,
    getSolarInlineMarkup,
    formatAndelsaInventarioMessage,
    formatAndelsaCostosMessage,
    formatAndelsaVentasClienteMessage,
    formatAndelsaVentasProductoMessage,
    formatAndelsaCxcMessage,
    formatAndelsaFinanzasResumenMessage,
    getAndelsaInlineMarkup,
    formatIntelligentGuidanceMessage,
    handleSmartNaturalLanguageQuery,
    formatDiscrepancyAlertMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert,
    getConsolidadoVentas,
    getSaldosBancosData,
    getSaldosChequeraData,
    getPreciosCompetenciaData,
    formatPreciosCompetenciaMessage,
    getCompetenciaInlineMarkup,
    extractCompetitorBrand,
    priceFmt,
    calcPriceDiff,
    KNOWN_COMPETITOR_BRANDS,
    COMPETENCIA_STATION_NAMES,
    getMainReplyKeyboard,
    createFeedbackEntry,
    getFeedbackInlineMarkup,
    sendTelegramResponseWithFeedback,
    handleCallbackQuery,
    answerCallbackQuery,
    editMessageReplyMarkup,
    getFeedbackStats,
    getFeedbackList,
    formatFeedbackListMessage,
    pendingFeedbackUsers,
    userConversationContext,
    getUserConversationContext,
    setUserConversationContext,
    clearUserConversationContext,
    pendingAlertJustifications,
    pruneBotMemoryMaps,
    getDiscrepancyInlineMarkup,
    handleIncomingMessage,
    shiftDate,
    findStationById,
    findFuelByKey,
    transcribeTelegramVoice,
    getGeminiApiKey,
    getGeminiApiKeyCandidates,
    sanitizeGeminiApiKey,
    ensureTelegramConfigSchema,
    setRuntimeGeminiApiKey,
    sanitizeAudioMimeType,
    KNOWN_STATIONS,
    KNOWN_FUELS,
    KNOWN_BANKS,
    KNOWN_ACCOUNT_HOLDERS,
    KNOWN_STORE_LINES,
    filterBankOrChequeraAccounts,
    getVentasTiendaPorLineaData,
    getRankingDiasVentasData,
    getPagosProgramadosData,
    formatVentasTiendaLineaMessage,
    formatPeakDayVentasMessage,
    formatPagosProgramadosMessage,
    sendChatAction,
    queryMemoryCache,
    getCachedQuery,
    setCachedQuery,
    clearQueryCache,
    setTelegramWebhook,
    deleteTelegramWebhook,
    getTelegramWebhookInfo,
    analyzeTelegramImageReceipt,
    verifyReceiptInBankMovements,
    formatReceiptAnalysisMessage,
    generateExecutiveReportPdf,
    sendTelegramDocument,
    sendTelegramPhoto,
    sendTelegramAudio,
    buildAndSendTopicPdf,
    escapeHtml,
    resolveTelegramUser,
    pendingReceiptPayments,
    prepareReceiptPaymentDraft,
    applyReceiptDraftToVencimiento,
    evaluateSentinelAlerts,
    runProactiveSentinelDispatch,
    buildAndSendExecutiveAudio,
    buildAndSendTopicChart,
    createAndNotifyApprovalRequest,
    resolveApprovalAction
};

