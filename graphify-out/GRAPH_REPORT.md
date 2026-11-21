# Graph Report - SIPEOFI  (2026-11-20)

## Corpus Check
- 266 files · ~671,305 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 2416 nodes · 6868 edges · 109 communities (102 shown, 7 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 488 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1ed9def8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useConfirm
- lazyPages.js
- telegramBot.test.js
- frontend/package.json
- server.js
- operaciones.js
- consultasCierresRoutes.js
- inteligencia.js
- telegramCompetencia.test.js
- ref_node_assert
- useToast
- ticketService.js
- QuickTicketModal.jsx
- Modal
- webhook-server.js
- dependencies
- githubChanges.js
- operationalRobustness.test.js
- withRetry
- backend/package.json
- recordatoriosPagosService.js
- 5. Resumen de Módulos y Tablas Principales
- finanzas.js
- onedrive.js
- backup-db.js
- ref_fs
- generate-icons.cjs
- AGENTS.md
- config.js
- FinanzasPrestamos.jsx
- ticketTelegramAgyService.js
- date.js
- businessGrowthAgyService.js
- autoSyncScheduler.js
- sync-dgehm-direct.js
- scripts
- telegramProductivityService.js
- handleSmartNaturalLanguageQuery
- dgehmService.js
- mibotNotifier.test.js
- ReportPreviewModal
- scripts
- telegramAuditorService.js
- telegramBotService.js
- dependencies
- sysSaasService.js
- PLAN ESTRATÉGICO DE INTEGRACIÓN: INTELIGENCIA ARTIFICIAL, CONTABILIDAD AUTOMÁTICA Y CONTROL FINANCIERO
- vercel.json
- deploy.sh
- 1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques)
- sw.js
- ai.js
- Estándares del Backend - SIPE Admin
- telegram.js
- Reglas de Git, Commits y Sincronización Remota
- devDependencies
- db.js
- scripts
- operationalIntelligenceV2.test.js
- Cheques.jsx
- errorHandler.js
- requirePermission
- executiveFlashService.js
- middleware/auth.js
- telegramAdvancedCapabilities.test.js
- rrhh.test.js
- finanzasCrecimiento.test.js
- salesHourlyService.js
- DesignerView.jsx
- sync_portal_pedidos.sh
- mibotNotifierService.js
- aiGateway.test.js
- sendSafeError
- telegramDataService.js
- SupportTickets.jsx
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- getConsolidadoVentasData
- telegramTextAndDates.js
- andelsaTelegramBot.test.js
- telegramVoice.test.js
- operationalAuditService.js
- deploy.js
- tasks.js
- bancos.js
- telegramPerformance.test.js
- ref_path
- architectureAndContracts.test.js
- cashflowForecast.js
- consultas.js
- ControlRecordatorios.jsx
- ensureMibotSchema
- TicketContext.jsx
- CommandPalette.jsx
- telegramVisionAndPdf.test.js
- routes/bitacora.js
- energyLatamService.js
- conciliacion.js
- telegramAlerts.test.js
- tickets.js
- FinanzasCrecimiento.jsx
- errorDiagnostics.js
- ticketDiagnostics.js
- middleware/bitacora.js
- bundledIcons.js

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 131 edges
2. `react` - 100 edges
3. `lucide-react` - 85 edges
4. `handleSmartNaturalLanguageQuery()` - 84 edges
5. `Modal()` - 70 edges
6. `handleIncomingMessage()` - 69 edges
7. `App()` - 66 edges
8. `DashboardLayout()` - 64 edges
9. `api` - 63 edges
10. `escapeHtml()` - 59 edges

## Surprising Connections (you probably didn't know these)
- `🚀 Arquitectura y Entorno de Producción` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA)` --references--> `getUserEffectivePermissions()`  [INFERRED]
  AGENTS.md → backend/services/telegramBotService.js
- `Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)` --references--> `ReportPreviewModal()`  [INFERRED]
  AGENTS.md → frontend/src/components/ReportPreviewModal.jsx
- `🔒 Seguridad y Control de Acceso` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `Bitácora (Audit Log)` --references--> `authenticateToken()`  [INFERRED]
  AGENTS.md → backend/middleware/auth.js

## Import Cycles
- None detected.

## Communities (109 total, 7 thin omitted)

### Community 0 - "useConfirm"
Cohesion: 0.18
Nodes (21): 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, useConfirm(), formatDateDMY(), formatMibotDateTime(), formatMoney(), getDeliveryBadgeStyle(), getSvNowDateTimeParts() (+13 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.05
Nodes (112): Frontend Conventions, Responsive / Mobile, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login (+104 more)

### Community 2 - "telegramBot.test.js"
Cohesion: 0.08
Nodes (5): getFeedbackInlineMarkup(), pendingFeedbackUsers, assert, { describe, it }, {
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatProfileMessage,
    parseUserDate,
    parseSpanishDateText,
    parseSpanishPeriodOrDate,
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
    formatIntelligentGuidanceMessage,
    getFeedbackInlineMarkup,
    pendingFeedbackUsers,
    getFeedbackStats
}

### Community 3 - "frontend/package.json"
Cohesion: 0.11
Nodes (18): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+10 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (54): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked, resolveLiveUserAuthState }, authRoutes, { autoLogMiddleware } (+46 more)

### Community 5 - "operaciones.js"
Cohesion: 0.06
Nodes (35): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, buildCompactPresetValue(), buildEstacionFilterClause(), calculateHasMore(), compactBankCode(), crypto, energiaSolarViewPerms (+27 more)

### Community 6 - "consultasCierresRoutes.js"
Cohesion: 0.18
Nodes (21): { authenticateToken, requirePermission }, {
    cierreViewPerms,
    getCleanStationName,
    getCleanTiendaName,
    saasBranchMap,
    normalizeSaasBranchId,
    OFFICIAL_ESTACIONES,
    isGenericDescription,
    formatYMD
}, dbModule, getAccountingDb(), getExternalDb(), { GoogleGenAI }, registerConsultasCierresRoutes(), { sendSafeError } (+13 more)

### Community 7 - "inteligencia.js"
Cohesion: 0.14
Nodes (20): { authenticateToken, requirePermission }, express, { generateExecutiveReportPdf }, {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
}, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia }, { getRiesgoCreditoFlotas, getDetalleDtesCliente } (+12 more)

### Community 8 - "telegramCompetencia.test.js"
Cohesion: 0.11
Nodes (7): aiRouter, assert, axios, dbModule, { describe, it, beforeEach, afterEach }, {
    getMainReplyKeyboard,
    parseNaturalLanguageQuery,
    getPreciosCompetenciaData,
    formatPreciosCompetenciaMessage,
    getCompetenciaInlineMarkup,
    calcPriceDiff,
    extractCompetitorBrand,
    handleSmartNaturalLanguageQuery,
    handleCallbackQuery,
    buildAndSendTopicPdf,
    clearQueryCache,
    clearUserConversationContext,
    getUserConversationContext
}, SAMPLE_COMPETENCIA_ROWS

### Community 9 - "ref_node_assert"
Cohesion: 0.09
Nodes (13): assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService, assert, { describe, it } (+5 more)

### Community 10 - "useToast"
Cohesion: 0.10
Nodes (36): ConfirmContext, ESTRATEGIA_TABS, EstrategiaNav(), AGY_STATUS_META, DEFAULT_MODELS, TicketAgyFlowModal(), AGENT_PLATFORMS, AI_EXECUTION_MODES (+28 more)

### Community 11 - "ticketService.js"
Cohesion: 0.07
Nodes (63): acknowledgeResolution(), addTicketMessage(), AGY_MODEL_ALIASES, approveAndGeneratePlan(), autoTriageTicketsForAi(), AVAILABLE_AGY_MODELS, buildAgyPlanApprovalKeyboard(), buildAiPromptPackage() (+55 more)

### Community 12 - "QuickTicketModal.jsx"
Cohesion: 0.24
Nodes (12): PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal(), TOOLS, formatDateTimeLocal() (+4 more)

### Community 13 - "Modal"
Cohesion: 0.17
Nodes (18): Modal(), CorteTiendaModal(), moneyFmt(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt() (+10 more)

### Community 14 - "webhook-server.js"
Cohesion: 0.17
Nodes (9): crypto, { exec }, fs, http, path, PORT, PROJECT_DIR, runDeploy() (+1 more)

### Community 15 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, axios, axios-cookiejar-support, bcryptjs, cors, dotenv, express, express-rate-limit (+12 more)

### Community 16 - "githubChanges.js"
Cohesion: 0.14
Nodes (17): { authenticateToken, requirePermission }, commitCache, computeCommitKpis(), { execFile }, express, fetchCommitDetail(), fetchGithubCommits(), fetchLocalGitCommits() (+9 more)

### Community 17 - "operationalRobustness.test.js"
Cohesion: 0.09
Nodes (24): closeAllPools(), closeExternalPools(), invalidateConfigCache(), gracefulShutdown(), stopMibotScheduler(), stopTicketRealtimeWatcher(), assert, { closeExternalPools, closeAllPools } (+16 more)

### Community 18 - "withRetry"
Cohesion: 0.14
Nodes (32): fetchCachedExternalConfig(), getAccountingDb(), withRetry(), withTransaction(), calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), getRiesgoCreditoFlotas() (+24 more)

### Community 19 - "backend/package.json"
Cohesion: 0.09
Nodes (21): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+13 more)

### Community 20 - "recordatoriosPagosService.js"
Cohesion: 0.10
Nodes (40): getActiveMibotCountsByVencimientos(), BANK_RECONCILIABLE_METHODS, buildLegacyFormaPagoSummary(), computePaymentBalance(), crypto, DEFAULT_CASH_SOURCES, deleteReceiptFile(), enrichRecordatoriosList() (+32 more)

### Community 21 - "5. Resumen de Módulos y Tablas Principales"
Cohesion: 0.06
Nodes (30): 1. Información General de Conexión, 2. Arquitectura Multi-Tenant (Regla Crítica), 3.1. `account_types` (Tipos de Cuenta - Global), 3.2. `entry_types` (Tipos de Partida Contable - Global), 3.3. `chart_of_accounts` (Catálogo de Cuentas Contables), 3.4. `accounting_entries` (Cabecera de Partidas Contables), 3.5. `accounting_entry_lines` (Líneas de Partida Contable), 3.6. `accounting_entry_correlativos` (Control de Correlativos) (+22 more)

### Community 22 - "finanzas.js"
Cohesion: 0.14
Nodes (11): { authenticateToken, requirePermission }, express, finanzasCatalogosPerms, { getDb, withTransaction }, { GoogleGenAI }, mantenimientoViewPerms, prestamosViewPerms, proyectosViewPerms (+3 more)

### Community 23 - "onedrive.js"
Cohesion: 0.22
Nodes (12): { authenticateToken, requirePermission }, express, findLatestFile(), navigateIntoFolder(), parseDateFromFileName(), parseRelativeDate(), router, scrapeItems() (+4 more)

### Community 24 - "backup-db.js"
Cohesion: 0.19
Nodes (13): BACKUP_DIR, dotenv, executeBackup(), fallbackNodeDump(), fs, getTimestamp(), mysql, path (+5 more)

### Community 25 - "ref_fs"
Cohesion: 0.12
Nodes (11): fs, path, puppeteer, __dirname, parts, pkg, pkgPath, __dirname (+3 more)

### Community 26 - "generate-icons.cjs"
Cohesion: 0.16
Nodes (11): BG, chunk(), crc32(), CRC_TABLE, fs, OUT_DIR, path, S_ROWS (+3 more)

### Community 27 - "AGENTS.md"
Cohesion: 0.07
Nodes (39): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+31 more)

### Community 28 - "config.js"
Cohesion: 0.07
Nodes (37): { authenticateToken, requireRole }, dbModule, express, getDb(), invalidateConfigCache(), nodemailer, parseValidPort(), router (+29 more)

### Community 29 - "FinanzasPrestamos.jsx"
Cohesion: 0.30
Nodes (16): FinanzasAsesor(), FinanzasCalculadora(), FinanzasPrestamos(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings(), calculatePMT() (+8 more)

### Community 30 - "ticketTelegramAgyService.js"
Cohesion: 0.17
Nodes (29): buildAgyReviewBranchName(), buildBranchReviewKeyboard(), buildCurrentKeyboardForTicket(), buildModelPickerKeyboard(), buildPlanApprovalKeyboard(), buildRetryExecutionKeyboard(), buildTicketActionKeyboard(), discardAgyReviewBranchOnServer() (+21 more)

### Community 31 - "date.js"
Cohesion: 0.18
Nodes (22): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), createColorIcon(), ICON_ALIASES, ConsultasCumpleanos() (+14 more)

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.12
Nodes (34): applyFlexibleTextEdit(), autoBuildKnowledgeFromEcosystem(), calculatePMT(), detectLocalAgyBinary(), emitCrecimientoAgySocket(), ensureCrecimientoSchema(), { execFileSync, spawn }, executeAgyServerPlan() (+26 more)

### Community 33 - "autoSyncScheduler.js"
Cohesion: 0.16
Nodes (13): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+5 more)

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.15
Nodes (20): axios, cleanNum(), dotenv, ensureLogDir(), fetchAllFuelPricesWithFallback(), fetchMirrorGasolinaSv(), fetchPrimaryDgehm(), formatIsoToDgehmDate() (+12 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "telegramProductivityService.js"
Cohesion: 0.08
Nodes (62): getRealtimeIo(), buildCandidateSearchTokens(), buildEventWizardMarkup(), buildTaskWizardConfirmMarkup(), buildTaskWizardStep1Markup(), cleanExtractedTitle(), createMultiUserTasksFromTelegram(), dbModule (+54 more)

### Community 37 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.14
Nodes (55): formatFeedbackListMessage(), getUserConversationContext(), handleCallbackQuery(), handleSmartNaturalLanguageQuery(), setUserConversationContext(), { askConversationalAgent }, {
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
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
    formatTanquesAutonomiaMessage,
    formatPedidosPumaMessage,
    formatRentabilidadEbitdaMessage,
    formatTransitoValesMessage
}, generateImprovedResponseForFeedback() (+47 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.21
Nodes (11): getPuppeteer(), cleanNum(), fetchDgehmPrices(), fs, getPuppeteer(), normalizeName(), path, syncDgehmWithDatabase() (+3 more)

### Community 39 - "mibotNotifier.test.js"
Cohesion: 0.21
Nodes (14): addMinutesToSvSql(), buildMibotInlineKeyboard(), checkLinkedPaymentStatus(), computeNextScheduleSql(), createMibotProgramacion(), dispatchMibotProgramacion(), formatDisplayDateTimeSv(), getElSalvadorNowSql() (+6 more)

### Community 40 - "ReportPreviewModal"
Cohesion: 0.12
Nodes (35): Regla obligatoria para NUEVAS pantallas (no opcional), ReportPreviewModal(), AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText() (+27 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.06
Nodes (65): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), consultasModule, conversationHistory, dbModule, getActiveConversationsCount() (+57 more)

### Community 43 - "telegramBotService.js"
Cohesion: 0.06
Nodes (74): attemptSelfHealingCorrection(), axios, broadcastCustomAlert(), broadcastDiscrepancyAlerts(), clearUserConversationContext(), createFeedbackEntry(), dbModule, {
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
} (+66 more)

### Community 44 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, axios, html2canvas, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react (+7 more)

### Community 45 - "sysSaasService.js"
Cohesion: 0.18
Nodes (22): buildEnterpriseGrowthSnapshot(), clearSaasCache(), { getAccountingDb, getExternalDb, withRetry }, getAndelsaCostos(), getAndelsaCuentasPorCobrar(), getAndelsaFinanzasResumen(), getAndelsaInventarios(), getAndelsaVentasPorCliente() (+14 more)

### Community 46 - "PLAN ESTRATÉGICO DE INTEGRACIÓN: INTELIGENCIA ARTIFICIAL, CONTABILIDAD AUTOMÁTICA Y CONTROL FINANCIERO"
Cohesion: 0.17
Nodes (11): 1. Declaración de Principios y Reglas de Oro, 2. Diagrama de Arquitectura del Ecosistema, 3. Especificación Detallada de los Cuatro Pilares, 4. Diseño del Esquema de Base de Datos: `db_sipe_intelligence`, 5. Plan de Trabajo Paso a Paso (Cronograma por Sprints), 6. Procedimiento Estándar de Ejecución y Despliegue, Pilar 1: Motor de Contabilidad Automática (Normativa El Salvador), Pilar 2: Circuito de Quedans, Cuentas por Pagar (CXP) y Cobrar (CXC) (+3 more)

### Community 47 - "vercel.json"
Cohesion: 0.40
Nodes (4): builds, headers, rewrites, version

### Community 48 - "deploy.sh"
Cohesion: 0.50
Nodes (3): HOME, deploy.sh script, PATH

### Community 49 - "1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques)"
Cohesion: 0.20
Nodes (9): 1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques), 2. Vista Previa de Reportes e Impresiones (`ReportPreviewModal`), 3. Exportación a Excel y PDF Rápido, A. Jerarquía y Espaciados, B. Controles de Formulario e Inputs, C. Selectores de Cuentas Bancarias, D. Tablas de Datos Compactas y Densas, Ejemplo de Integración (+1 more)

### Community 54 - "ai.js"
Cohesion: 0.06
Nodes (30): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), cachedGraphifyStats, conversationalAiService, crypto, dbModule, DEFAULT_AI_SUGGESTIONS (+22 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegram.js"
Cohesion: 0.08
Nodes (17): {
    analyzeNegativeFeedbackBatch,
    generateImprovedResponseForFeedback
}, authenticateN8nOrAdmin(), { authenticateToken, requirePermission }, crypto, {
    ensureMibotSchema,
    getEligibleMibotRecipients,
    listMibotProgramaciones,
    createMibotProgramacion,
    dispatchMibotProgramacion,
    getMibotProgramacionById,
    normalizeScheduleDatetime,
    getElSalvadorNowSql,
    MIBOT_ESTADOS,
    setRealtimeIo
}, express, {
    getBotStatus,
    testTelegramConnection,
    restartTelegramBot,
    initTelegramBot,
    stopTelegramBot,
    sendTelegramMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert,
    getFeedbackStats,
    getFeedbackList,
    handleIncomingMessage,
    handleCallbackQuery,
    setTelegramWebhook,
    deleteTelegramWebhook,
    getTelegramWebhookInfo,
    getGeminiApiKey,
    sanitizeGeminiApiKey,
    ensureTelegramConfigSchema,
    setRuntimeGeminiApiKey,
    escapeHtml,
    resolveTelegramUser,
    getUserEffectivePermissions
}, { getDb, getExternalDb } (+9 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.14
Nodes (18): configCache, dbConfig, dotenv, externalPools, getDb(), getExternalDb(), initDB(), mysql (+10 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "operationalIntelligenceV2.test.js"
Cohesion: 0.13
Nodes (18): { branchToEmpId, OFFICIAL_ESTACIONES }, dbModule, getAccountingDb(), getDb(), getElasticidadPreciosCompetencia(), getRentabilidadPorEstacion(), resolveStationEmpCode(), solarEnergyService (+10 more)

### Community 63 - "Cheques.jsx"
Cohesion: 0.20
Nodes (14): CheckPdfService, DesignerService, PrintEngine, Cheques(), ImpresionCheques(), CENTENAS, DECENAS, formatearFechaEnLetras() (+6 more)

### Community 64 - "errorHandler.js"
Cohesion: 0.07
Nodes (26): { authenticateToken, requirePermission }, catalogosViewPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission }, checkDesignerPerms (+18 more)

### Community 65 - "requirePermission"
Cohesion: 0.10
Nodes (18): requirePermission(), { authenticateToken, requirePermission }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction }, router, { sendSafeError } (+10 more)

### Community 66 - "executiveFlashService.js"
Cohesion: 0.27
Nodes (11): dbModule, enviarFlashPorEmail(), formatFechaTexto(), getAccountingDb(), getDb(), getExternalDb(), getFlashEjecutivo(), { getTanquesAutonomia } (+3 more)

### Community 67 - "middleware/auth.js"
Cohesion: 0.08
Nodes (36): getDbIfReady(), authenticateToken(), deletedUsers, fetchLiveUserAuthState(), invalidateRoleAuthCache(), invalidateUserAuthCache(), isAdminUser(), isUserRevoked() (+28 more)

### Community 68 - "telegramAdvancedCapabilities.test.js"
Cohesion: 0.13
Nodes (8): pendingAlertJustifications, userConversationContext, assert, axios, consultasModule, dbModule, { describe, it, beforeEach, afterEach }, {
    transcribeTelegramVoice,
    userConversationContext,
    getUserConversationContext,
    setUserConversationContext,
    clearUserConversationContext,
    pendingAlertJustifications,
    getDiscrepancyInlineMarkup,
    formatDiscrepancyAlertMessage,
    formatFeedbackListMessage,
    handleIncomingMessage,
    handleCallbackQuery,
    parseNaturalLanguageQuery,
    parseSpanishPeriodOrDate,
    shiftDate,
    findStationById,
    findFuelByKey,
    broadcastDiscrepancyAlerts
}

### Community 69 - "rrhh.test.js"
Cohesion: 0.20
Nodes (10): assert, { getDb, getAccountingDb }, { numberToWords }, rhPlanillaService, { test, describe, after }, CENTENAS, DECENAS, numberToWords() (+2 more)

### Community 70 - "finanzasCrecimiento.test.js"
Cohesion: 0.10
Nodes (16): { authenticateToken, requirePermission, isAdminUser }, crecimientoManagePerms, crecimientoViewPerms, express, growthService, router, { sendSafeError }, assert (+8 more)

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "DesignerView.jsx"
Cohesion: 0.14
Nodes (17): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox() (+9 more)

### Community 74 - "mibotNotifierService.js"
Cohesion: 0.13
Nodes (17): cron, dbModule, digestTableInitPromises, { escapeHtml }, FRECUENCIA_LABELS, getEligibleMibotRecipients(), getElSalvadorNowParts(), getMibotProgramacionById() (+9 more)

### Community 75 - "aiGateway.test.js"
Cohesion: 0.20
Nodes (6): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }

### Community 76 - "sendSafeError"
Cohesion: 0.12
Nodes (14): getIsoDate(), getPreciosCompetenciaSafe(), handleAiQuery(), handleSchemaContext(), handleSolarAndelsaDashboard(), handleWebhooksTrigger(), stripHtmlToText(), userHasAnyPerm() (+6 more)

### Community 77 - "telegramDataService.js"
Cohesion: 0.15
Nodes (35): buildLiveProjectContext(), buildWeeklyExecutiveDossierPayload(), {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    SPANISH_MONTH_NAMES,
    KNOWN_STATIONS,
    findStationById,
    findFuelByKey
}, calcPriceDiff(), dbModule, extractCompetitorBrand(), formatPreciosCompetenciaMessage(), getAccountingDb() (+27 more)

### Community 78 - "SupportTickets.jsx"
Cohesion: 0.21
Nodes (7): TicketFiltersBar(), TicketSummaryCards(), formatDateTime(), PRIORITY_STYLES, STATUS_CONFIG, SupportTickets(), TYPE_LABELS

### Community 79 - "sync_dgehm_precios.sh"
Cohesion: 0.40
Nodes (4): PATH, sync_dgehm_precios.sh script, SIPE_ADMIN_URL, SYNC_API_KEY

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.47
Nodes (10): FinanzasInversiones(), FinanzasPlanesMantenimiento(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI() (+2 more)

### Community 81 - "getConsolidadoVentasData"
Cohesion: 0.43
Nodes (8): getAccountingDb(), getConsolidadoVentasData(), getCortesTiendaData(), getDb(), getExternalDb(), getPreciosEstacionData(), getTurnosPorEmpresa(), withRetry()

### Community 82 - "telegramTextAndDates.js"
Cohesion: 0.09
Nodes (30): filterBankOrChequeraAccounts(), analyzeNegativeFeedbackBatch(), classifyNegativeFeedback(), detectIntentInfo(), BANK_NAME_MAP, EL_SALVADOR_DATE_FMT, escapeRegex(), formatYMD() (+22 more)

### Community 83 - "andelsaTelegramBot.test.js"
Cohesion: 0.13
Nodes (5): assert, { describe, it }, {
    formatSolarEnergyMessage,
    getSolarInlineMarkup,
    formatAndelsaInventarioMessage,
    formatAndelsaCostosMessage,
    formatAndelsaVentasClienteMessage,
    formatAndelsaVentasProductoMessage,
    formatAndelsaCxcMessage,
    formatAndelsaFinanzasResumenMessage,
    getAndelsaInlineMarkup,
    parseNaturalLanguageQuery
}, solarEnergyService, sysSaasService

### Community 84 - "telegramVoice.test.js"
Cohesion: 0.25
Nodes (3): assert, { describe, it }, {
    sanitizeAudioMimeType,
    sanitizeGeminiApiKey,
    getGeminiApiKey,
    transcribeTelegramVoice
}

### Community 85 - "operationalAuditService.js"
Cohesion: 0.22
Nodes (15): formatYMD(), { branchToEmpId, formatYMD }, dbModule, getAccountingDb(), getAuditoriaDineroEnTransito(), getDb(), getHomeResumenInteligente(), { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia } (+7 more)

### Community 86 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 87 - "tasks.js"
Cohesion: 0.15
Nodes (11): { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), {
    ensureMibotSchema,
    createMibotProgramacion,
    getActiveMibotSummaryByTaskIds,
    listMibotProgramaciones,
    setRealtimeIo
}, express, { getDb, getExternalDb }, hasTaskManagePermission(), router, { sendSafeError } (+3 more)

### Community 88 - "bancos.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }

### Community 89 - "telegramPerformance.test.js"
Cohesion: 0.09
Nodes (25): calcularRegistroDiarioAnalitico(), clearSolarCache(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario(), getSolarAhorroMensual() (+17 more)

### Community 90 - "ref_path"
Cohesion: 0.10
Nodes (11): dbConfig, dotenv, mysql, path, mysql, path, mysql, path (+3 more)

### Community 91 - "architectureAndContracts.test.js"
Cohesion: 0.25
Nodes (7): assert, BACKEND_ROOT, collectJsFiles(), { describe, it }, dfs(), fs, path

### Community 92 - "cashflowForecast.js"
Cohesion: 0.48
Nodes (6): dbModule, getAccountingDb(), getDb(), getExternalDb(), getFlujoCajaProyectado(), withRetry()

### Community 93 - "consultas.js"
Cohesion: 0.10
Nodes (27): { authenticateToken, requirePermission }, dbModule, express, generarAnalisisDescuadre(), mapCierreRowConExplicacion(), {
    normalizeStationName,
    getResumenMensualData,
    getResumenRangoVentasData,
    getComparativoAnualData
}, { registerConsultasCierresRoutes }, { registerConsultasCompetenciaRoutes } (+19 more)

### Community 94 - "ControlRecordatorios.jsx"
Cohesion: 0.18
Nodes (20): ControlPagosModal(), formatDateShort(), getMethodCategory(), getMethodLabel(), mc(), OPERATION_TYPES, PAYMENT_METHOD_OPTIONS, ReceiptViewerModal() (+12 more)

### Community 95 - "ensureMibotSchema"
Cohesion: 0.31
Nodes (11): ensureMibotDigestTable(), ensureMibotSchema(), formatDateOnlyDMY(), formatMibotPersonalMessage(), formatMoney(), formatUserPersonalMibotInbox(), getDb(), getExternalDb() (+3 more)

### Community 96 - "TicketContext.jsx"
Cohesion: 0.33
Nodes (5): QuickTicketModal, TicketContext, TicketDetailModal, TicketProvider(), TicketResolvedModal

### Community 97 - "CommandPalette.jsx"
Cohesion: 0.46
Nodes (6): CommandPalette(), TICKET_KEYWORDS, useTickets(), copyTextToClipboard(), evaluateSafeMath(), evaluateSafeMathNumeric()

### Community 98 - "telegramVisionAndPdf.test.js"
Cohesion: 0.15
Nodes (6): {
    analyzeTelegramImageReceipt,
    verifyReceiptInBankMovements,
    formatReceiptAnalysisMessage,
    generateExecutiveReportPdf,
    sendTelegramDocument,
    handleIncomingMessage,
    handleCallbackQuery
}, assert, axios, consultasModule, dbModule, { describe, it, beforeEach, afterEach }

### Community 99 - "routes/bitacora.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }

### Community 100 - "energyLatamService.js"
Cohesion: 0.15
Nodes (19): dbModule, runInitialServiceSeeds(), { seedInitialPortalOrders }, { seedSolarEnergyData }, checkPortalStatus(), fs, { getDb, withRetry }, getPortalCredentials() (+11 more)

### Community 101 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 102 - "telegramAlerts.test.js"
Cohesion: 0.20
Nodes (7): assert, axios, { describe, it, beforeEach, afterEach }, {
    formatDiscrepancyAlertMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert
}, jwt, { JWT_SECRET }, telegramRouter

### Community 103 - "tickets.js"
Cohesion: 0.29
Nodes (7): { authenticateToken, isAdminUser }, express, getActorName(), isTicketOwner(), router, { sendSafeError }, ticketService

### Community 104 - "FinanzasCrecimiento.jsx"
Cohesion: 0.38
Nodes (6): AGY_STATE_BADGES, FinanzasCrecimiento(), formatUSD(), ORIGEN_LABELS, QUICK_PROMPTS, SafeMarkdownView()

### Community 105 - "errorDiagnostics.js"
Cohesion: 0.14
Nodes (9): ErrorBoundary, copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError() (+1 more)

### Community 106 - "ticketDiagnostics.js"
Cohesion: 0.53
Nodes (5): initTicketDiagnosticsCollector(), pushBounded(), recordNetworkErrorForTicket(), safeStringify(), state

### Community 108 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

## Knowledge Gaps
- **21 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1055 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authenticateToken()` connect `middleware/auth.js` to `server.js`, `operaciones.js`, `consultasCierresRoutes.js`, `inteligencia.js`, `githubChanges.js`, `operationalRobustness.test.js`, `finanzas.js`, `onedrive.js`, `config.js`, `ai.js`, `telegram.js`, `db.js`, `errorHandler.js`, `requirePermission`, `finanzasCrecimiento.test.js`, `tasks.js`, `bancos.js`, `consultas.js`, `routes/bitacora.js`, `conciliacion.js`, `tickets.js`, `middleware/bitacora.js`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05184108527131783 - nodes in this community are weakly interconnected._
- **Why does `Bitácora (Audit Log)` connect `middleware/bitacora.js` to `middleware/auth.js`, `AGENTS.md`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `handleSmartNaturalLanguageQuery()` (e.g. with `telegramBotService.js` and `getMainReplyKeyboard()`) actually correct?**
  _`handleSmartNaturalLanguageQuery()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `telegramBot.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._