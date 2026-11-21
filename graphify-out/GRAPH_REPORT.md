# Graph Report - SIPEOFI  (2026-11-20)

## Corpus Check
- 273 files · ~699,749 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 2574 nodes · 7447 edges · 116 communities (108 shown, 8 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 556 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b736139d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- FinanzasPrestamos.jsx
- lazyPages.js
- telegramBot.test.js
- frontend/package.json
- server.js
- operaciones.js
- telegramExecutiveSuite.test.js
- inteligencia.js
- telegramCompetencia.test.js
- ref_node_assert
- useToast
- ticketService.js
- TicketContext.jsx
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
- telegramTextAndDates.js
- backup-db.js
- ref_fs
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
- handleSmartNaturalLanguageQuery
- stationDiscrepancyAuditService.js
- mibotNotifier.test.js
- finanzasCrecimiento.test.js
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
- useConfirm
- conciliacion.js
- sendSafeError
- executiveFlashService.js
- middleware/auth.js
- telegramAdvancedCapabilities.test.js
- rrhh.test.js
- express
- salesHourlyService.js
- DesignerView.jsx
- sync_portal_pedidos.sh
- mibotNotifierService.js
- aiGateway.test.js
- stationDiscrepancyAudit.test.js
- getDateStr
- telegramMediaInsightsService.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- consultasCierresRoutes.js
- themeUtils.js
- andelsaTelegramBot.test.js
- telegramVoice.test.js
- operationalAuditService.js
- conversationalAiService.js
- requirePermission
- telegramSentinelService.js
- solarEnergyService.js
- ref_path
- architectureAndContracts.test.js
- cashflowForecast.js
- consultas.js
- ControlRecordatorios.jsx
- onedrive.js
- paymentNotifier.js
- useTickets
- telegramVisionAndPdf.test.js
- bancos.js
- getDb
- cheques.js
- fuelIntelligence.js
- telegramAlerts.test.js
- rrhh.js
- errorDiagnostics.js
- dgehmService.js
- deploy.js
- middleware/bitacora.js
- renderExecutiveChartPng
- DashboardLayout.jsx
- bundledIcons.js
- PermissionRoute
- NotificationBell.jsx
- utils/auth.js
- Frontend Conventions

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 131 edges
2. `handleSmartNaturalLanguageQuery()` - 107 edges
3. `react` - 100 edges
4. `handleIncomingMessage()` - 95 edges
5. `lucide-react` - 85 edges
6. `escapeHtml()` - 77 edges
7. `Modal()` - 70 edges
8. `App()` - 66 edges
9. `moneyFmt()` - 64 edges
10. `DashboardLayout()` - 64 edges

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

## Communities (116 total, 8 thin omitted)

### Community 0 - "FinanzasPrestamos.jsx"
Cohesion: 0.30
Nodes (16): FinanzasAsesor(), FinanzasCalculadora(), FinanzasPrestamos(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings(), calculatePMT() (+8 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.13
Nodes (55): App(), DashboardLayout, Login, DashboardLayout(), AsistenteIA, BackupDBCheck, Bitacora, Carriers (+47 more)

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
Cohesion: 0.12
Nodes (16): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+8 more)

### Community 4 - "server.js"
Cohesion: 0.03
Nodes (61): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked, resolveLiveUserAuthState }, authRoutes, { autoLogMiddleware } (+53 more)

### Community 5 - "operaciones.js"
Cohesion: 0.06
Nodes (35): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, buildCompactPresetValue(), buildEstacionFilterClause(), calculateHasMore(), compactBankCode(), crypto, energiaSolarViewPerms (+27 more)

### Community 6 - "telegramExecutiveSuite.test.js"
Cohesion: 0.06
Nodes (48): getUserEffectivePermissions(), buildApprovalCardMarkup(), buildApprovalCardMessage(), canUserApproveFinancialOp(), createAndNotifyApprovalRequest(), dbModule, ensureApprovalsSchema(), ensuredApprovalPools (+40 more)

### Community 7 - "inteligencia.js"
Cohesion: 0.13
Nodes (16): {
    auditStationCloseoutsAndRemesas,
    runStationDiscrepancyAlertCheck
}, { authenticateToken, requirePermission }, express, { generateExecutiveReportPdf }, {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
}, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia } (+8 more)

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
Cohesion: 0.08
Nodes (15): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService (+7 more)

### Community 10 - "useToast"
Cohesion: 0.12
Nodes (32): ESTRATEGIA_TABS, EstrategiaNav(), AGENT_PLATFORMS, AI_EXECUTION_MODES, ToastContext, useToast(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal() (+24 more)

### Community 11 - "ticketService.js"
Cohesion: 0.07
Nodes (63): acknowledgeResolution(), addTicketMessage(), AGY_MODEL_ALIASES, approveAndGeneratePlan(), autoTriageTicketsForAi(), AVAILABLE_AGY_MODELS, buildAgyPlanApprovalKeyboard(), buildAiPromptPackage() (+55 more)

### Community 12 - "TicketContext.jsx"
Cohesion: 0.08
Nodes (32): TICKET_KEYWORDS, PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal(), TOOLS (+24 more)

### Community 13 - "Modal"
Cohesion: 0.09
Nodes (36): 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, formatDateDMY(), formatMibotDateTime(), formatMoney(), getDeliveryBadgeStyle(), getSvNowDateTimeParts(), MIBOT_FRECUENCIA_OPTIONS (+28 more)

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
Cohesion: 0.10
Nodes (19): pendingFeedbackUsers, assert, { closeExternalPools, closeAllPools }, { describe, it, afterEach }, fs, { getDateStr }, jwt, { JWT_SECRET } (+11 more)

### Community 18 - "withRetry"
Cohesion: 0.18
Nodes (27): fetchCachedExternalConfig(), getAccountingDb(), withRetry(), withTransaction(), anularPagoPlanilla(), drawReciboSection(), exportBancario(), formatCurrency() (+19 more)

### Community 19 - "backend/package.json"
Cohesion: 0.10
Nodes (20): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+12 more)

### Community 20 - "recordatoriosPagosService.js"
Cohesion: 0.10
Nodes (39): BANK_RECONCILIABLE_METHODS, buildLegacyFormaPagoSummary(), computePaymentBalance(), crypto, DEFAULT_CASH_SOURCES, deleteReceiptFile(), enrichRecordatoriosList(), ensurePagosUploadsDir() (+31 more)

### Community 21 - "5. Resumen de Módulos y Tablas Principales"
Cohesion: 0.06
Nodes (30): 1. Información General de Conexión, 2. Arquitectura Multi-Tenant (Regla Crítica), 3.1. `account_types` (Tipos de Cuenta - Global), 3.2. `entry_types` (Tipos de Partida Contable - Global), 3.3. `chart_of_accounts` (Catálogo de Cuentas Contables), 3.4. `accounting_entries` (Cabecera de Partidas Contables), 3.5. `accounting_entry_lines` (Líneas de Partida Contable), 3.6. `accounting_entry_correlativos` (Control de Correlativos) (+22 more)

### Community 22 - "finanzas.js"
Cohesion: 0.14
Nodes (11): { authenticateToken, requirePermission }, express, finanzasCatalogosPerms, { getDb, withTransaction }, { GoogleGenAI }, mantenimientoViewPerms, prestamosViewPerms, proyectosViewPerms (+3 more)

### Community 23 - "telegramTextAndDates.js"
Cohesion: 0.09
Nodes (30): filterBankOrChequeraAccounts(), analyzeNegativeFeedbackBatch(), classifyNegativeFeedback(), detectIntentInfo(), BANK_NAME_MAP, EL_SALVADOR_DATE_FMT, escapeRegex(), formatYMD() (+22 more)

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
Cohesion: 0.16
Nodes (12): { authenticateToken, requireRole }, dbModule, express, getDb(), invalidateConfigCache(), nodemailer, parseValidPort(), router (+4 more)

### Community 29 - "ReportPreviewModal"
Cohesion: 0.12
Nodes (33): ReportPreviewModal(), AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText(), ConsultaCambiosGithub() (+25 more)

### Community 30 - "ticketTelegramAgyService.js"
Cohesion: 0.17
Nodes (29): buildAgyReviewBranchName(), buildBranchReviewKeyboard(), buildCurrentKeyboardForTicket(), buildModelPickerKeyboard(), buildPlanApprovalKeyboard(), buildRetryExecutionKeyboard(), buildTicketActionKeyboard(), discardAgyReviewBranchOnServer() (+21 more)

### Community 31 - "date.js"
Cohesion: 0.23
Nodes (18): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), createColorIcon(), ICON_ALIASES, ConsultasCumpleanos() (+10 more)

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.12
Nodes (34): applyFlexibleTextEdit(), autoBuildKnowledgeFromEcosystem(), calculatePMT(), detectLocalAgyBinary(), emitCrecimientoAgySocket(), ensureCrecimientoSchema(), { execFileSync, spawn }, executeAgyServerPlan() (+26 more)

### Community 33 - "autoSyncScheduler.js"
Cohesion: 0.17
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+4 more)

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.15
Nodes (20): axios, cleanNum(), dotenv, ensureLogDir(), fetchAllFuelPricesWithFallback(), fetchMirrorGasolinaSv(), fetchPrimaryDgehm(), formatIsoToDgehmDate() (+12 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "telegramProductivityService.js"
Cohesion: 0.07
Nodes (59): getRealtimeIo(), buildCandidateSearchTokens(), buildEventWizardMarkup(), buildTaskWizardConfirmMarkup(), buildTaskWizardStep1Markup(), cleanExtractedTitle(), clearProductivityWizards(), createMultiUserTasksFromTelegram() (+51 more)

### Community 37 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.11
Nodes (70): formatStationDiscrepancyAuditMessage(), getStationAuditInlineMarkup(), formatFeedbackListMessage(), handleCallbackQuery(), handleSmartNaturalLanguageQuery(), { askConversationalAgent }, {
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
}, generateImprovedResponseForFeedback() (+62 more)

### Community 38 - "stationDiscrepancyAuditService.js"
Cohesion: 0.14
Nodes (25): computeSaasStoreShiftMetrics(), formatYMD(), auditStationCloseoutsAndRemesas(), buildAlertEntriesFromAudit(), buildMonthLikePatterns(), cron, dbModule, ensuredAuditPools (+17 more)

### Community 39 - "mibotNotifier.test.js"
Cohesion: 0.18
Nodes (13): addMinutesToSvSql(), buildMibotInlineKeyboard(), computeNextScheduleSql(), formatDisplayDateTimeSv(), getActiveMibotCountsByVencimientos(), getElSalvadorNowParts(), getElSalvadorNowSql(), handleMibotCallbackQuery() (+5 more)

### Community 40 - "finanzasCrecimiento.test.js"
Cohesion: 0.10
Nodes (16): { authenticateToken, requirePermission, isAdminUser }, crecimientoManagePerms, crecimientoViewPerms, express, growthService, router, { sendSafeError }, assert (+8 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.14
Nodes (28): maskToken(), activeUsers, checkDatabasesHealth(), checkFeedbackMetrics(), clearErrors(), errorBuffer, formatDiagnosticsMessage(), getActiveUsersCount() (+20 more)

### Community 43 - "telegramBotService.js"
Cohesion: 0.06
Nodes (79): askConversationalAgent(), attemptSelfHealingCorrection(), {
    auditStationCloseoutsAndRemesas,
    formatStationDiscrepancyAuditMessage,
    getStationAuditInlineMarkup
}, axios, broadcastCustomAlert(), broadcastDiscrepancyAlerts(), {
    buildAndSendExecutiveAudio,
    buildAndSendTopicChart
}, clearUserConversationContext() (+71 more)

### Community 44 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, axios, html2canvas, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react (+7 more)

### Community 45 - "sysSaasService.js"
Cohesion: 0.19
Nodes (21): clearSaasCache(), { getAccountingDb, getExternalDb, withRetry }, getAndelsaCostos(), getAndelsaCuentasPorCobrar(), getAndelsaFinanzasResumen(), getAndelsaInventarios(), getAndelsaVentasPorCliente(), getAndelsaVentasPorProducto() (+13 more)

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
Cohesion: 0.05
Nodes (38): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), cachedGraphifyStats, conversationalAiService, crypto, dbModule, DEFAULT_AI_SUGGESTIONS (+30 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegram.js"
Cohesion: 0.09
Nodes (16): {
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
}, { getDb, getExternalDb } (+8 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.17
Nodes (12): closeAllPools(), closeExternalPools(), configCache, dbConfig, dotenv, externalPools, initDB(), invalidateConfigCache() (+4 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "operationalIntelligenceV2.test.js"
Cohesion: 0.13
Nodes (18): { branchToEmpId, OFFICIAL_ESTACIONES }, dbModule, getAccountingDb(), getDb(), getElasticidadPreciosCompetencia(), getRentabilidadPorEstacion(), resolveStationEmpCode(), solarEnergyService (+10 more)

### Community 63 - "useConfirm"
Cohesion: 0.14
Nodes (28): Regla obligatoria para NUEVAS pantallas (no opcional), ConfirmContext, useConfirm(), PrintEngine, Cheques(), ChequesContado(), ToggleSwitch(), ConciliacionBancaria() (+20 more)

### Community 64 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 65 - "sendSafeError"
Cohesion: 0.08
Nodes (24): { authenticateToken, requirePermission }, checkDesignerPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission }, crypto (+16 more)

### Community 66 - "executiveFlashService.js"
Cohesion: 0.27
Nodes (11): dbModule, enviarFlashPorEmail(), formatFechaTexto(), getAccountingDb(), getDb(), getExternalDb(), getFlashEjecutivo(), { getTanquesAutonomia } (+3 more)

### Community 67 - "middleware/auth.js"
Cohesion: 0.08
Nodes (33): getDbIfReady(), authenticateToken(), deletedUsers, fetchLiveUserAuthState(), invalidateRoleAuthCache(), invalidateUserAuthCache(), isUserRevoked(), jwt (+25 more)

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

### Community 70 - "express"
Cohesion: 0.09
Nodes (19): { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission }, catalogosViewPerms (+11 more)

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "DesignerView.jsx"
Cohesion: 0.12
Nodes (20): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox() (+12 more)

### Community 74 - "mibotNotifierService.js"
Cohesion: 0.13
Nodes (32): checkLinkedPaymentStatus(), createMibotProgramacion(), cron, dbModule, digestTableInitPromises, dispatchMibotProgramacion(), ensureMibotDigestTable(), ensureMibotSchema() (+24 more)

### Community 75 - "aiGateway.test.js"
Cohesion: 0.20
Nodes (6): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }

### Community 76 - "stationDiscrepancyAudit.test.js"
Cohesion: 0.15
Nodes (12): generarAnalisisDescuadre(), mapCierreRowConExplicacion(), branchToEmpId, assert, consultasRouter, { describe, it }, assert, {
    auditStationCloseoutsAndRemesas,
    formatStationDiscrepancyAuditMessage,
    runStationDiscrepancyAlertCheck
} (+4 more)

### Community 77 - "getDateStr"
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

### Community 78 - "telegramMediaInsightsService.js"
Cohesion: 0.08
Nodes (44): getGeminiApiKey(), analyzePaymentReceiptWithAI(), analyzeTelegramImageReceipt(), askGeminiAssistant(), dbModule, ensuredTelegramSchemaPools, ensureTelegramConfigSchema(), {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr
} (+36 more)

### Community 79 - "sync_dgehm_precios.sh"
Cohesion: 0.40
Nodes (4): PATH, sync_dgehm_precios.sh script, SIPE_ADMIN_URL, SYNC_API_KEY

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "consultasCierresRoutes.js"
Cohesion: 0.19
Nodes (13): { authenticateToken, requirePermission }, {
    cierreViewPerms,
    getCleanStationName,
    getCleanTiendaName,
    saasBranchMap,
    normalizeSaasBranchId,
    OFFICIAL_ESTACIONES,
    isGenericDescription,
    formatYMD,
    computeSaasStoreShiftMetrics
}, dbModule, getAccountingDb(), getExternalDb(), { GoogleGenAI }, registerConsultasCierresRoutes(), { sendSafeError } (+5 more)

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
Cohesion: 0.19
Nodes (16): { branchToEmpId, formatYMD, normalizeSaasBranchId }, { buildMonthLikePatterns, parseBankDateDmyToIso }, dbModule, getAccountingDb(), getAuditoriaDineroEnTransito(), getDb(), getExternalDb(), getHomeResumenInteligente() (+8 more)

### Community 86 - "conversationalAiService.js"
Cohesion: 0.17
Nodes (16): appendToHistory(), cleanExpiredSessions(), clearConversation(), consultasModule, conversationHistory, dbModule, getActiveConversationsCount(), getDb() (+8 more)

### Community 87 - "requirePermission"
Cohesion: 0.10
Nodes (21): isAdminUser(), requirePermission(), requireRole(), { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), {
    ensureMibotSchema,
    createMibotProgramacion,
    getActiveMibotSummaryByTaskIds,
    listMibotProgramaciones,
    setRealtimeIo
}, express, { getDb, getExternalDb } (+13 more)

### Community 88 - "telegramSentinelService.js"
Cohesion: 0.14
Nodes (21): { auditStationCloseoutsAndRemesas }, buildWindowDayMap(), cron, dbModule, ensuredSentinelPools, ensureSentinelSchema(), {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr,
    shiftDate,
    normalizeText
}, evaluateSentinelAlerts() (+13 more)

### Community 89 - "solarEnergyService.js"
Cohesion: 0.09
Nodes (26): buildEnterpriseGrowthSnapshot(), calcularRegistroDiarioAnalitico(), clearSolarCache(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario() (+18 more)

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
Cohesion: 0.12
Nodes (35): { authenticateToken, requirePermission }, dbModule, express, getAccountingDb(), getConsolidadoVentasData(), getCortesTiendaData(), getDb(), getExternalDb() (+27 more)

### Community 94 - "ControlRecordatorios.jsx"
Cohesion: 0.18
Nodes (20): ControlPagosModal(), formatDateShort(), getMethodCategory(), getMethodLabel(), mc(), OPERATION_TYPES, PAYMENT_METHOD_OPTIONS, ReceiptViewerModal() (+12 more)

### Community 95 - "onedrive.js"
Cohesion: 0.22
Nodes (12): { authenticateToken, requirePermission }, express, findLatestFile(), navigateIntoFolder(), parseDateFromFileName(), parseRelativeDate(), router, scrapeItems() (+4 more)

### Community 96 - "paymentNotifier.js"
Cohesion: 0.11
Nodes (26): buildBirthdayEmailHtml(), cron, formatSpanishDate(), { getDb, getAccountingDb }, getTodaysBirthdays(), initBirthdayScheduler(), nodemailer, sendBirthdayNotification() (+18 more)

### Community 97 - "useTickets"
Cohesion: 0.47
Nodes (5): CommandPalette(), useTickets(), copyTextToClipboard(), evaluateSafeMath(), evaluateSafeMathNumeric()

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

### Community 99 - "bancos.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }

### Community 100 - "getDb"
Cohesion: 0.10
Nodes (28): getDb(), getExternalDb(), { getExternalDb }, up(), { getDb, getExternalDb }, up(), { getDb, getExternalDb }, up() (+20 more)

### Community 101 - "cheques.js"
Cohesion: 0.17
Nodes (9): { authenticateToken, requirePermission }, { CHEQUE_APPROVAL_THRESHOLD_USD, createAndNotifyApprovalRequest }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction }, router, { sendSafeError } (+1 more)

### Community 102 - "fuelIntelligence.js"
Cohesion: 0.40
Nodes (9): { branchToEmpId, formatYMD }, calcularSimuladorDGEHM(), dbModule, getAccountingDb(), getAuditoriaMermas(), getDb(), getTanquesAutonomia(), resolveStationEmpCode() (+1 more)

### Community 103 - "telegramAlerts.test.js"
Cohesion: 0.20
Nodes (7): assert, axios, { describe, it, beforeEach, afterEach }, {
    formatDiscrepancyAlertMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert
}, jwt, { JWT_SECRET }, telegramRouter

### Community 104 - "rrhh.js"
Cohesion: 0.22
Nodes (8): { authenticateToken, requirePermission }, { createAndNotifyApprovalRequest }, express, { getDb }, PERMISSION_REQUIRED, rhPlanillaService, router, { sendSafeError }

### Community 105 - "errorDiagnostics.js"
Cohesion: 0.11
Nodes (15): ErrorBoundary, clearErrorLogs(), copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog() (+7 more)

### Community 106 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 107 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 108 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

### Community 109 - "renderExecutiveChartPng"
Cohesion: 0.53
Nodes (6): getPuppeteer(), getPuppeteer(), renderExecutiveChartPng(), puppeteer, puppeteer-core, @sparticuz/chromium

### Community 110 - "DashboardLayout.jsx"
Cohesion: 0.14
Nodes (19): Responsive / Mobile, LoadingFallback(), allNavCategories, bancosMenu, bancosReportes, catalogItems, configuracionMenu, consultasEstaciones (+11 more)

### Community 112 - "PermissionRoute"
Cohesion: 0.40
Nodes (4): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, PermissionRoute()

### Community 113 - "NotificationBell.jsx"
Cohesion: 0.25
Nodes (10): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast(), NotificationContext, NotificationProvider(), readStoredUser(), useNotifications() (+2 more)

### Community 116 - "Frontend Conventions"
Cohesion: 0.67
Nodes (3): Frontend Conventions, ConfirmProvider(), ToastProvider()

## Knowledge Gaps
- **21 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1124 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
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
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._
- **Why does `getDb()` connect `getDb` to `server.js`, `operaciones.js`, `withRetry`, `finanzas.js`, `telegramTextAndDates.js`, `businessGrowthAgyService.js`, `autoSyncScheduler.js`, `sync-dgehm-direct.js`, `handleSmartNaturalLanguageQuery`, `telegramAuditorService.js`, `telegram.js`, `db.js`, `conciliacion.js`, `sendSafeError`, `rrhh.test.js`, `express`, `requirePermission`, `solarEnergyService.js`, `paymentNotifier.js`, `bancos.js`, `cheques.js`, `rrhh.js`, `dgehmService.js`, `middleware/bitacora.js`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `handleSmartNaturalLanguageQuery()` (e.g. with `telegramBotService.js` and `getMainReplyKeyboard()`) actually correct?**
  _`handleSmartNaturalLanguageQuery()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `telegramBot.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._