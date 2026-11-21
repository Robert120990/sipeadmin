# Graph Report - SIPEOFI  (2026-11-20)

## Corpus Check
- 271 files · ~690,561 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 2534 nodes · 7301 edges · 117 communities (109 shown, 8 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 543 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4b4ad3eb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useToast
- lazyPages.js
- telegramBot.test.js
- frontend/package.json
- server.js
- operaciones.js
- handleSmartNaturalLanguageQuery
- inteligencia.js
- telegramCompetencia.test.js
- ref_node_assert
- react
- ticketService.js
- TicketContext.jsx
- VentasEstaciones.jsx
- webhook-server.js
- dependencies
- githubChanges.js
- operationalRobustness.test.js
- withRetry
- backend/package.json
- recordatoriosPagosService.js
- 5. Resumen de Módulos y Tablas Principales
- finanzas.js
- telegramExecutiveSuite.test.js
- backup-db.js
- ref_path
- generate-icons.cjs
- AGENTS.md
- config.js
- ReportPreviewModal
- ticketTelegramAgyService.js
- date.js
- businessGrowthAgyService.js
- autoSyncScheduler.js
- sync-dgehm-direct.js
- scripts
- telegramProductivityService.js
- telegramFeedbackEvaluator.js
- getDb
- mibotNotifier.test.js
- EnergiaSolarAndelsa.jsx
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
- sendSafeError
- executiveFlashService.js
- auth.test.js
- telegramAdvancedCapabilities.test.js
- rrhh.test.js
- middleware/auth.js
- salesHourlyService.js
- DesignerView.jsx
- sync_portal_pedidos.sh
- mibotNotifierService.js
- telegramAlerts.test.js
- handleAiQuery
- getDateStr
- telegramGeminiService.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- telegramMediaInsightsService.js
- themeUtils.js
- andelsaTelegramBot.test.js
- telegramVoice.test.js
- operationalAuditService.js
- conversationalAiService.js
- tasks.js
- telegramSentinelService.js
- telegramPerformance.test.js
- 20260814_create_check_format_tables.js
- architectureAndContracts.test.js
- cashflowForecast.js
- consultas.js
- Modal
- createMibotProgramacion
- paymentNotifier.js
- CommandPalette.jsx
- telegramVisionAndPdf.test.js
- birthdayNotifier.js
- energyLatamService.js
- cheques.js
- fuelIntelligence.js
- profitabilityService.js
- rrhh.js
- errorDiagnostics.js
- ticketDiagnostics.js
- ErrorBoundary
- telegramSecurity.test.js
- AsistenteIA.jsx
- DashboardLayout.jsx
- gracefulShutdown
- PermissionRoute
- NotificationBell
- NotificationProvider
- utils/auth.js
- Frontend Conventions

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 131 edges
2. `handleSmartNaturalLanguageQuery()` - 104 edges
3. `react` - 100 edges
4. `handleIncomingMessage()` - 92 edges
5. `lucide-react` - 85 edges
6. `escapeHtml()` - 75 edges
7. `Modal()` - 70 edges
8. `App()` - 66 edges
9. `DashboardLayout()` - 64 edges
10. `api` - 63 edges

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

## Communities (117 total, 8 thin omitted)

### Community 0 - "useToast"
Cohesion: 0.18
Nodes (19): 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ESTRATEGIA_TABS, EstrategiaNav(), useToast(), BackupDBCheck(), Bitacora(), ConfiguracionContabilidad() (+11 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.12
Nodes (58): Responsive / Mobile, App(), DashboardLayout, Login, useViewport(), DashboardLayout(), AsistenteIA, BackupDBCheck (+50 more)

### Community 2 - "telegramBot.test.js"
Cohesion: 0.08
Nodes (4): getFeedbackInlineMarkup(), assert, { describe, it }, {
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
Cohesion: 0.10
Nodes (19): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+11 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (55): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked, resolveLiveUserAuthState }, authRoutes, { autoLogMiddleware } (+47 more)

### Community 5 - "operaciones.js"
Cohesion: 0.06
Nodes (35): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, buildCompactPresetValue(), buildEstacionFilterClause(), calculateHasMore(), compactBankCode(), crypto, energiaSolarViewPerms (+27 more)

### Community 6 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.10
Nodes (47): attemptSelfHealingCorrection(), createFeedbackEntry(), getAccountingDb(), getDb(), getExternalDb(), getFeedbackList(), getFeedbackStats(), getUserConversationContext() (+39 more)

### Community 7 - "inteligencia.js"
Cohesion: 0.17
Nodes (11): { authenticateToken, requirePermission }, express, { generateExecutiveReportPdf }, {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
}, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia }, { getRiesgoCreditoFlotas, getDetalleDtesCliente } (+3 more)

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
Cohesion: 0.05
Nodes (24): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }, assert, crecimientoRouter, { describe, it, beforeEach, afterEach } (+16 more)

### Community 10 - "react"
Cohesion: 0.12
Nodes (22): ConfirmContext, useConfirm(), AGY_STATUS_META, DEFAULT_MODELS, AGENT_PLATFORMS, AI_EXECUTION_MODES, ToastContext, NotificationContext (+14 more)

### Community 11 - "ticketService.js"
Cohesion: 0.07
Nodes (63): acknowledgeResolution(), addTicketMessage(), AGY_MODEL_ALIASES, approveAndGeneratePlan(), autoTriageTicketsForAi(), AVAILABLE_AGY_MODELS, buildAgyPlanApprovalKeyboard(), buildAiPromptPackage() (+55 more)

### Community 12 - "TicketContext.jsx"
Cohesion: 0.07
Nodes (37): PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal(), TOOLS, TicketAgyFlowModal() (+29 more)

### Community 13 - "VentasEstaciones.jsx"
Cohesion: 0.21
Nodes (12): CorteTiendaModal(), moneyFmt(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt(), numFmt() (+4 more)

### Community 14 - "webhook-server.js"
Cohesion: 0.10
Nodes (15): { execSync }, path, parts, pkg, pkgPath, { readFileSync }, crypto, { exec } (+7 more)

### Community 15 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, axios, axios-cookiejar-support, bcryptjs, cors, dotenv, express, express-rate-limit (+12 more)

### Community 16 - "githubChanges.js"
Cohesion: 0.14
Nodes (17): { authenticateToken, requirePermission }, commitCache, computeCommitKpis(), { execFile }, express, fetchCommitDetail(), fetchGithubCommits(), fetchLocalGitCommits() (+9 more)

### Community 17 - "operationalRobustness.test.js"
Cohesion: 0.10
Nodes (19): pendingFeedbackUsers, assert, { closeExternalPools, closeAllPools }, { describe, it, afterEach }, fs, { getDateStr }, jwt, { JWT_SECRET } (+11 more)

### Community 18 - "withRetry"
Cohesion: 0.14
Nodes (32): fetchCachedExternalConfig(), getAccountingDb(), withRetry(), withTransaction(), calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), getRiesgoCreditoFlotas() (+24 more)

### Community 19 - "backend/package.json"
Cohesion: 0.09
Nodes (21): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+13 more)

### Community 20 - "recordatoriosPagosService.js"
Cohesion: 0.10
Nodes (39): BANK_RECONCILIABLE_METHODS, buildLegacyFormaPagoSummary(), computePaymentBalance(), crypto, DEFAULT_CASH_SOURCES, deleteReceiptFile(), enrichRecordatoriosList(), ensurePagosUploadsDir() (+31 more)

### Community 21 - "5. Resumen de Módulos y Tablas Principales"
Cohesion: 0.06
Nodes (30): 1. Información General de Conexión, 2. Arquitectura Multi-Tenant (Regla Crítica), 3.1. `account_types` (Tipos de Cuenta - Global), 3.2. `entry_types` (Tipos de Partida Contable - Global), 3.3. `chart_of_accounts` (Catálogo de Cuentas Contables), 3.4. `accounting_entries` (Cabecera de Partidas Contables), 3.5. `accounting_entry_lines` (Líneas de Partida Contable), 3.6. `accounting_entry_correlativos` (Control de Correlativos) (+22 more)

### Community 22 - "finanzas.js"
Cohesion: 0.14
Nodes (11): { authenticateToken, requirePermission }, express, finanzasCatalogosPerms, { getDb, withTransaction }, { GoogleGenAI }, mantenimientoViewPerms, prestamosViewPerms, proyectosViewPerms (+3 more)

### Community 23 - "telegramExecutiveSuite.test.js"
Cohesion: 0.10
Nodes (27): applyReceiptDraftToVencimiento(), buildReceiptDraftInlineMarkup(), clearPendingReceiptPayments(), crypto, {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr,
    normalizeText
}, extractSignificantTokens(), findMatchingPendingVencimientos(), handleReceiptPaymentCallback() (+19 more)

### Community 24 - "backup-db.js"
Cohesion: 0.19
Nodes (13): BACKUP_DIR, dotenv, executeBackup(), fallbackNodeDump(), fs, getTimestamp(), mysql, path (+5 more)

### Community 25 - "ref_path"
Cohesion: 0.12
Nodes (11): fs, path, puppeteer, __dirname, parts, pkg, pkgPath, __dirname (+3 more)

### Community 26 - "generate-icons.cjs"
Cohesion: 0.16
Nodes (11): BG, chunk(), crc32(), CRC_TABLE, fs, OUT_DIR, path, S_ROWS (+3 more)

### Community 27 - "AGENTS.md"
Cohesion: 0.07
Nodes (39): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+31 more)

### Community 28 - "config.js"
Cohesion: 0.16
Nodes (12): { authenticateToken, requireRole }, dbModule, express, getDb(), invalidateConfigCache(), nodemailer, parseValidPort(), router (+4 more)

### Community 29 - "ReportPreviewModal"
Cohesion: 0.14
Nodes (32): ReportPreviewModal(), ConsultaCambiosGithub(), formatDateTime(), formatRelativeTime(), TYPE_CONFIG, Consultas(), DiferenciasCombustible(), FinanzasCalculadora() (+24 more)

### Community 30 - "ticketTelegramAgyService.js"
Cohesion: 0.17
Nodes (29): buildAgyReviewBranchName(), buildBranchReviewKeyboard(), buildCurrentKeyboardForTicket(), buildModelPickerKeyboard(), buildPlanApprovalKeyboard(), buildRetryExecutionKeyboard(), buildTicketActionKeyboard(), discardAgyReviewBranchOnServer() (+21 more)

### Community 31 - "date.js"
Cohesion: 0.28
Nodes (16): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), ConsultasCumpleanos(), Dashboard(), addMonthsPreservingDay() (+8 more)

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.12
Nodes (34): applyFlexibleTextEdit(), autoBuildKnowledgeFromEcosystem(), calculatePMT(), detectLocalAgyBinary(), emitCrecimientoAgySocket(), ensureCrecimientoSchema(), { execFileSync, spawn }, executeAgyServerPlan() (+26 more)

### Community 33 - "autoSyncScheduler.js"
Cohesion: 0.16
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), initAutoSyncScheduler(), lastSyncMetadata, syncDGEHM (+4 more)

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.06
Nodes (44): { authenticateToken, requirePermission }, express, findLatestFile(), getPuppeteer(), navigateIntoFolder(), parseDateFromFileName(), parseRelativeDate(), router (+36 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "telegramProductivityService.js"
Cohesion: 0.07
Nodes (59): getRealtimeIo(), buildCandidateSearchTokens(), buildEventWizardMarkup(), buildTaskWizardConfirmMarkup(), buildTaskWizardStep1Markup(), cleanExtractedTitle(), clearProductivityWizards(), createMultiUserTasksFromTelegram() (+51 more)

### Community 37 - "telegramFeedbackEvaluator.js"
Cohesion: 0.09
Nodes (74): formatFeedbackListMessage(), handleCallbackQuery(), filterBankOrChequeraAccounts(), analyzeNegativeFeedbackBatch(), { askConversationalAgent }, buildDeterministicExecutiveFallback(), classifyNegativeFeedback(), detectIntentInfo() (+66 more)

### Community 38 - "getDb"
Cohesion: 0.18
Nodes (23): getDb(), buildEnterpriseGrowthSnapshot(), dbModule, runInitialServiceSeeds(), { seedInitialPortalOrders }, { seedSolarEnergyData }, seedInitialPortalOrders(), calcularRegistroDiarioAnalitico() (+15 more)

### Community 39 - "mibotNotifier.test.js"
Cohesion: 0.18
Nodes (13): addMinutesToSvSql(), buildMibotInlineKeyboard(), computeNextScheduleSql(), formatDisplayDateTimeSv(), getActiveMibotCountsByVencimientos(), getElSalvadorNowParts(), getElSalvadorNowSql(), handleMibotCallbackQuery() (+5 more)

### Community 40 - "EnergiaSolarAndelsa.jsx"
Cohesion: 0.36
Nodes (7): ANDELSA_SUBVIEWS, EnergiaSolarAndelsa(), FALLBACK_ANDELSA, FALLBACK_SOLAR_STATIONS, formatMoney(), formatNum(), normalizeSolarAndelsaPayload()

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.15
Nodes (26): activeUsers, checkDatabasesHealth(), checkFeedbackMetrics(), clearErrors(), errorBuffer, formatDiagnosticsMessage(), getActiveUsersCount(), { getDb, getExternalDb } (+18 more)

### Community 43 - "telegramBotService.js"
Cohesion: 0.06
Nodes (64): handleWebhooksTrigger(), axios, broadcastCustomAlert(), broadcastDiscrepancyAlerts(), {
    buildAndSendExecutiveAudio,
    buildAndSendTopicChart
}, clearUserConversationContext(), dbModule, {
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
} (+56 more)

### Community 44 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, axios, html2canvas, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react (+7 more)

### Community 45 - "sysSaasService.js"
Cohesion: 0.18
Nodes (22): clearSaasCache(), { getAccountingDb, getExternalDb, withRetry }, getAndelsaCostos(), getAndelsaCuentasPorCobrar(), getAndelsaFinanzasResumen(), getAndelsaInventarios(), getAndelsaVentasPorCliente(), getAndelsaVentasPorProducto() (+14 more)

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
Nodes (29): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, cachedGraphifyStats, conversationalAiService, crypto, dbModule, DEFAULT_AI_SUGGESTIONS, express (+21 more)

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
Cohesion: 0.11
Nodes (20): closeAllPools(), closeExternalPools(), configCache, dbConfig, dotenv, externalPools, getExternalDb(), initDB() (+12 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "operationalIntelligenceV2.test.js"
Cohesion: 0.17
Nodes (9): aiRouter, assert, dbModule, { describe, it, afterEach }, { generateExecutiveReportPdf }, {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
}, { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia }, { getTanquesAutonomia, getAuditoriaMermas } (+1 more)

### Community 63 - "Cheques.jsx"
Cohesion: 0.13
Nodes (28): Regla obligatoria para NUEVAS pantallas (no opcional), CheckPdfService, DesignerService, PrintEngine, Cheques(), ChequesContado(), ToggleSwitch(), ConciliacionBancaria() (+20 more)

### Community 64 - "errorHandler.js"
Cohesion: 0.06
Nodes (28): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }, { authenticateToken, requirePermission } (+20 more)

### Community 65 - "sendSafeError"
Cohesion: 0.18
Nodes (13): { authenticateToken, requirePermission }, crypto, dbModule, express, getDb(), {
    preciosEstacionViewPerms,
    preciosCompetenciaViewPerms
}, registerConsultasCompetenciaRoutes(), { sendSafeError } (+5 more)

### Community 66 - "executiveFlashService.js"
Cohesion: 0.27
Nodes (11): dbModule, enviarFlashPorEmail(), formatFechaTexto(), getAccountingDb(), getDb(), getExternalDb(), getFlashEjecutivo(), { getTanquesAutonomia } (+3 more)

### Community 67 - "auth.test.js"
Cohesion: 0.09
Nodes (23): invalidateRoleAuthCache(), invalidateUserAuthCache(), restoreUser(), revokeUser(), { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser, invalidateUserAuthCache, invalidateRoleAuthCache }, bcrypt, dbModule, express (+15 more)

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

### Community 70 - "middleware/auth.js"
Cohesion: 0.06
Nodes (41): getDbIfReady(), authenticateToken(), deletedUsers, fetchLiveUserAuthState(), isAdminUser(), isUserRevoked(), jwt, requirePermission() (+33 more)

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "DesignerView.jsx"
Cohesion: 0.15
Nodes (17): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox() (+9 more)

### Community 74 - "mibotNotifierService.js"
Cohesion: 0.15
Nodes (21): cron, dbModule, digestTableInitPromises, ensureMibotDigestTable(), { escapeHtml }, formatDateOnlyDMY(), formatMibotPersonalMessage(), formatMoney() (+13 more)

### Community 75 - "telegramAlerts.test.js"
Cohesion: 0.10
Nodes (14): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }, assert, axios (+6 more)

### Community 76 - "handleAiQuery"
Cohesion: 0.29
Nodes (8): buildFallbackConsolidadoVentas(), getConsolidadoVentasSafe(), getIsoDate(), getPreciosCompetenciaSafe(), handleAiQuery(), handleSolarAndelsaDashboard(), stripHtmlToText(), userHasAnyPerm()

### Community 77 - "getDateStr"
Cohesion: 0.11
Nodes (48): buildLiveProjectContext(), buildWeeklyExecutiveDossierPayload(), {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    SPANISH_MONTH_NAMES,
    KNOWN_STATIONS,
    findStationById,
    findFuelByKey
}, calcPriceDiff(), dbModule, extractCompetitorBrand(), formatPreciosCompetenciaMessage(), getAccountingDb() (+40 more)

### Community 78 - "telegramGeminiService.js"
Cohesion: 0.19
Nodes (22): getGeminiApiKey(), analyzePaymentReceiptWithAI(), analyzeTelegramImageReceipt(), askGeminiAssistant(), dbModule, ensuredTelegramSchemaPools, ensureTelegramConfigSchema(), {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr
} (+14 more)

### Community 79 - "sync_dgehm_precios.sh"
Cohesion: 0.40
Nodes (4): PATH, sync_dgehm_precios.sh script, SIPE_ADMIN_URL, SYNC_API_KEY

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "telegramMediaInsightsService.js"
Cohesion: 0.11
Nodes (22): BITMAP_FONT_5X7, buildAndSendExecutiveAudio(), buildExecutiveAudioScript(), CHART_PALETTE, crc32(), encodeRgbaToPng(), ensureWavBuffer(), {
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    getDateStr,
    normalizeText
} (+14 more)

### Community 82 - "themeUtils.js"
Cohesion: 0.24
Nodes (17): ThemeModal(), ThemeContext, ThemeProvider(), useTheme(), ConfiguracionTema(), ConfiguracionTema, ACCENT_PRESETS, adjustBrightness() (+9 more)

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
Nodes (14): { branchToEmpId, formatYMD }, dbModule, getAccountingDb(), getAuditoriaDineroEnTransito(), getDb(), getHomeResumenInteligente(), { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia }, { getSaldosBancosData } (+6 more)

### Community 86 - "conversationalAiService.js"
Cohesion: 0.16
Nodes (18): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), consultasModule, conversationHistory, dbModule, getActiveConversationsCount() (+10 more)

### Community 87 - "tasks.js"
Cohesion: 0.15
Nodes (11): { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), {
    ensureMibotSchema,
    createMibotProgramacion,
    getActiveMibotSummaryByTaskIds,
    listMibotProgramaciones,
    setRealtimeIo
}, express, { getDb, getExternalDb }, hasTaskManagePermission(), router, { sendSafeError } (+3 more)

### Community 88 - "telegramSentinelService.js"
Cohesion: 0.16
Nodes (18): buildWindowDayMap(), cron, dbModule, ensuredSentinelPools, ensureSentinelSchema(), {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr,
    shiftDate,
    normalizeText
}, evaluateSentinelAlerts(), fetchSentinelRecipients() (+10 more)

### Community 89 - "telegramPerformance.test.js"
Cohesion: 0.10
Nodes (9): clearSolarCache(), solarMemoryCache, assert, axios, { describe, it, beforeEach, afterEach }, router, {
    saasMemoryCache,
    getCachedSaas,
    setCachedSaas,
    clearSaasCache
}, {
    sendChatAction,
    queryMemoryCache,
    getCachedQuery,
    setCachedQuery,
    clearQueryCache,
    setTelegramWebhook,
    deleteTelegramWebhook,
    getTelegramWebhookInfo
} (+1 more)

### Community 90 - "20260814_create_check_format_tables.js"
Cohesion: 0.10
Nodes (11): dbConfig, dotenv, mysql, path, mysql, path, mysql, path (+3 more)

### Community 91 - "architectureAndContracts.test.js"
Cohesion: 0.25
Nodes (7): assert, BACKEND_ROOT, collectJsFiles(), { describe, it }, dfs(), fs, path

### Community 92 - "cashflowForecast.js"
Cohesion: 0.48
Nodes (6): dbModule, getAccountingDb(), getDb(), getExternalDb(), getFlujoCajaProyectado(), withRetry()

### Community 93 - "consultas.js"
Cohesion: 0.08
Nodes (55): { authenticateToken, requirePermission }, dbModule, express, generarAnalisisDescuadre(), getAccountingDb(), getConsolidadoVentasData(), getCortesTiendaData(), getDb() (+47 more)

### Community 94 - "Modal"
Cohesion: 0.12
Nodes (36): ControlPagosModal(), formatDateShort(), getMethodCategory(), getMethodLabel(), mc(), OPERATION_TYPES, PAYMENT_METHOD_OPTIONS, formatDateDMY() (+28 more)

### Community 95 - "createMibotProgramacion"
Cohesion: 0.39
Nodes (9): checkLinkedPaymentStatus(), createMibotProgramacion(), dispatchMibotProgramacion(), ensureMibotSchema(), getEligibleMibotRecipients(), getMibotProgramacionById(), hydrateProgramacionRow(), listMibotProgramaciones() (+1 more)

### Community 96 - "paymentNotifier.js"
Cohesion: 0.23
Nodes (13): buildPaymentEmailHtml(), cron, formatCurrency(), formatSpanishDate(), { getDb, getExternalDb }, getDuePayments(), initPaymentScheduler(), nodemailer (+5 more)

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

### Community 99 - "birthdayNotifier.js"
Cohesion: 0.21
Nodes (12): buildBirthdayEmailHtml(), cron, formatSpanishDate(), { getDb, getAccountingDb }, getTodaysBirthdays(), initBirthdayScheduler(), nodemailer, sendBirthdayNotification() (+4 more)

### Community 100 - "energyLatamService.js"
Cohesion: 0.22
Nodes (13): checkPortalStatus(), fs, { getDb, withRetry }, getPortalCredentials(), launchBrowser(), normalizeEstacion(), normalizeEstado(), path (+5 more)

### Community 101 - "cheques.js"
Cohesion: 0.17
Nodes (9): { authenticateToken, requirePermission }, { CHEQUE_APPROVAL_THRESHOLD_USD, createAndNotifyApprovalRequest }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction }, router, { sendSafeError } (+1 more)

### Community 102 - "fuelIntelligence.js"
Cohesion: 0.40
Nodes (9): { branchToEmpId, formatYMD }, calcularSimuladorDGEHM(), dbModule, getAccountingDb(), getAuditoriaMermas(), getDb(), getTanquesAutonomia(), resolveStationEmpCode() (+1 more)

### Community 103 - "profitabilityService.js"
Cohesion: 0.38
Nodes (9): { branchToEmpId, OFFICIAL_ESTACIONES }, dbModule, getAccountingDb(), getDb(), getElasticidadPreciosCompetencia(), getRentabilidadPorEstacion(), resolveStationEmpCode(), solarEnergyService (+1 more)

### Community 104 - "rrhh.js"
Cohesion: 0.22
Nodes (8): { authenticateToken, requirePermission }, { createAndNotifyApprovalRequest }, express, { getDb }, PERMISSION_REQUIRED, rhPlanillaService, router, { sendSafeError }

### Community 105 - "errorDiagnostics.js"
Cohesion: 0.24
Nodes (7): copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError()

### Community 106 - "ticketDiagnostics.js"
Cohesion: 0.53
Nodes (5): initTicketDiagnosticsCollector(), pushBounded(), recordNetworkErrorForTicket(), safeStringify(), state

### Community 108 - "telegramSecurity.test.js"
Cohesion: 0.27
Nodes (7): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData(), assert, { describe, it }

### Community 109 - "AsistenteIA.jsx"
Cohesion: 0.52
Nodes (6): AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText()

### Community 110 - "DashboardLayout.jsx"
Cohesion: 0.12
Nodes (21): createColorIcon(), ICON_ALIASES, LoadingFallback(), bundledCollections, allNavCategories, bancosMenu, bancosReportes, catalogItems (+13 more)

### Community 111 - "gracefulShutdown"
Cohesion: 0.33
Nodes (6): gracefulShutdown(), stopMibotScheduler(), restartTelegramBot(), stopBotMemorySweeper(), stopTelegramBot(), stopTicketRealtimeWatcher()

### Community 112 - "PermissionRoute"
Cohesion: 0.40
Nodes (4): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, PermissionRoute()

### Community 113 - "NotificationBell"
Cohesion: 0.40
Nodes (4): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast()

### Community 114 - "NotificationProvider"
Cohesion: 0.50
Nodes (4): NotificationProvider(), readStoredUser(), getAudioContext(), playNotificationSound()

### Community 116 - "Frontend Conventions"
Cohesion: 0.67
Nodes (3): Frontend Conventions, ConfirmProvider(), ToastProvider()

## Knowledge Gaps
- **21 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1106 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `backend/package.json`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11748633879781421 - nodes in this community are weakly interconnected._
- **Why does `getDb()` connect `getDb` to `server.js`, `operaciones.js`, `withRetry`, `finanzas.js`, `businessGrowthAgyService.js`, `autoSyncScheduler.js`, `sync-dgehm-direct.js`, `telegramFeedbackEvaluator.js`, `telegramAuditorService.js`, `telegram.js`, `db.js`, `errorHandler.js`, `rrhh.test.js`, `middleware/auth.js`, `tasks.js`, `paymentNotifier.js`, `birthdayNotifier.js`, `energyLatamService.js`, `cheques.js`, `rrhh.js`, `telegramSecurity.test.js`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `handleSmartNaturalLanguageQuery()` (e.g. with `telegramBotService.js` and `getMainReplyKeyboard()`) actually correct?**
  _`handleSmartNaturalLanguageQuery()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `telegramBot.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._