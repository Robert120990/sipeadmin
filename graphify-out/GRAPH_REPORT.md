# Graph Report - SIPEOFI  (2026-11-26)

## Corpus Check
- 289 files · ~752,702 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 2848 nodes · 8200 edges · 122 communities (116 shown, 6 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 639 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `83995614`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- FinanzasPrestamos.jsx
- lazyPages.js
- telegramBot.test.js
- frontend/package.json
- server.js
- operaciones.js
- telegramMediaInsightsService.js
- inteligencia.js
- telegramCompetencia.test.js
- ref_node_assert
- react
- ticketService.js
- TicketContext.jsx
- Tareas.jsx
- webhook-server.js
- dependencies
- githubChanges.js
- nasBackupService.js
- withRetry
- backend/package.json
- recordatoriosPagosService.js
- 5. Resumen de Módulos y Tablas Principales
- finanzas.js
- telegramTextAndDates.js
- backup-db.js
- ref_fs
- generate-icons.cjs
- read_and_send_dgehm.js
- config.js
- useToast
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
- telegramAlerts.test.js
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
- getDb
- sendSafeError
- executiveFlashService.js
- middleware/auth.js
- telegramAdvancedCapabilities.test.js
- rrhh.test.js
- notifications.js
- salesHourlyService.js
- DesignCanvas.jsx
- sync_portal_pedidos.sh
- mibotNotifierService.js
- FinanzasCrecimiento.jsx
- securityAndAuditFixes.test.js
- getDateStr
- telegramGeminiService.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- consultaPedidos.js
- themeUtils.js
- andelsaTelegramBot.test.js
- telegramVoice.test.js
- operationalAuditService.js
- conversationalAiService.js
- tasks.js
- telegramSentinelService.js
- telegramPerformance.test.js
- ref_path
- architectureAndContracts.test.js
- cashflowForecast.js
- consultas.js
- useConfirm
- onedrive.js
- birthdayNotifier.js
- CommandPalette.jsx
- telegramVisionAndPdf.test.js
- localLlmFallback.test.js
- energyLatamService.js
- cheques.js
- fuelIntelligence.js
- mibotNluAndSchedule.test.js
- profitabilityService.js
- errorDiagnostics.js
- dgehmService.js
- deploy.js
- telegramSecurity.test.js
- paymentNotifier.js
- DashboardLayout.jsx
- VentasEstaciones.jsx
- App.jsx
- NotificationBell.jsx
- AGENTS.md
- consultasCompetenciaRoutes.js
- tickets.js
- finanzasCrecimiento.js
- ensureMibotSchema
- Ecosistema de Agentes IA, n8n y OpenClaw (Servidor 169.58.207.115)
- SIPE Admin
- ticketDiagnostics.js

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 137 edges
2. `handleSmartNaturalLanguageQuery()` - 112 edges
3. `react` - 105 edges
4. `handleIncomingMessage()` - 99 edges
5. `lucide-react` - 89 edges
6. `escapeHtml()` - 80 edges
7. `Modal()` - 78 edges
8. `api` - 66 edges
9. `moneyFmt()` - 64 edges
10. `toDisplayDate()` - 62 edges

## Surprising Connections (you probably didn't know these)
- `🚀 Arquitectura y Entorno de Producción` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA)` --references--> `getUserEffectivePermissions()`  [INFERRED]
  AGENTS.md → backend/services/telegramBotService.js
- `Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)` --references--> `ReportPreviewModal()`  [INFERRED]
  AGENTS.md → frontend/src/components/ReportPreviewModal.jsx
- `Frontend` --references--> `UpdateNotifier()`  [INFERRED]
  README.md → frontend/src/components/UpdateNotifier.jsx
- `🔒 Seguridad y Control de Acceso` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js

## Import Cycles
- None detected.

## Communities (122 total, 6 thin omitted)

### Community 0 - "FinanzasPrestamos.jsx"
Cohesion: 0.27
Nodes (17): FinanzasAsesor(), FinanzasCalculadora(), FinanzasPrestamos(), formatLocalYMD(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings() (+9 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.07
Nodes (56): ADMIN_ROLE_NAMES, ROUTE_BY_FULL_PATH, AsistenteIA, BackupDBCheck, Bitacora, Carriers, CheckDesigner, Cheques (+48 more)

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
Cohesion: 0.11
Nodes (18): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+10 more)

### Community 4 - "server.js"
Cohesion: 0.03
Nodes (64): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked, resolveLiveUserAuthState }, authRoutes, { autoLogMiddleware } (+56 more)

### Community 5 - "operaciones.js"
Cohesion: 0.06
Nodes (44): addDaysYMD(), authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, buildCompactPresetValue(), buildEstacionFilterClause(), calculateHasMore(), compactBankCode(), crypto (+36 more)

### Community 6 - "telegramMediaInsightsService.js"
Cohesion: 0.06
Nodes (48): BITMAP_FONT_5X7, buildAndSendExecutiveAudio(), buildExecutiveAudioScript(), CHART_PALETTE, crc32(), encodeRgbaToPng(), ensureWavBuffer(), {
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    getDateStr,
    normalizeText
} (+40 more)

### Community 7 - "inteligencia.js"
Cohesion: 0.15
Nodes (12): {
    auditStationCloseoutsAndRemesas,
    runStationDiscrepancyAlertCheck
}, { authenticateToken, requirePermission }, express, { generateExecutiveReportPdf }, {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
}, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia } (+4 more)

### Community 8 - "telegramCompetencia.test.js"
Cohesion: 0.10
Nodes (7): aiRouter, assert, axios, dbModule, { describe, it, beforeEach, afterEach }, {
    getMainReplyKeyboard,
    getHideReplyKeyboard,
    getMainInlineMenuMarkup,
    getCollapsedInlineMenuMarkup,
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
Cohesion: 0.10
Nodes (11): assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService, assert, { describe, it } (+3 more)

### Community 10 - "react"
Cohesion: 0.08
Nodes (41): ESTRATEGIA_TABS, EstrategiaNav(), Modal(), calculateOrderCost(), ConsultaPedidoDetailModal(), formatCurrency(), formatNumber(), OrderStatusBadge() (+33 more)

### Community 11 - "ticketService.js"
Cohesion: 0.06
Nodes (64): acknowledgeResolution(), addTicketMessage(), AGY_MODEL_ALIASES, approveAndGeneratePlan(), autoTriageTicketsForAi(), AVAILABLE_AGY_MODELS, buildAgyPlanApprovalKeyboard(), buildAiPromptPackage() (+56 more)

### Community 12 - "TicketContext.jsx"
Cohesion: 0.08
Nodes (31): PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal(), TOOLS, AGY_STATUS_META (+23 more)

### Community 13 - "Tareas.jsx"
Cohesion: 0.29
Nodes (14): formatDateDMY(), formatMibotDateTime(), formatMoney(), getDeliveryBadgeStyle(), getSvNowDateTimeParts(), MIBOT_FRECUENCIA_OPTIONS, MIBOT_TIPO_OPTIONS, MibotProgramarModal() (+6 more)

### Community 14 - "webhook-server.js"
Cohesion: 0.17
Nodes (9): crypto, { exec }, fs, http, path, PORT, PROJECT_DIR, runDeploy() (+1 more)

### Community 15 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, axios, axios-cookiejar-support, bcryptjs, cors, dotenv, express, express-rate-limit (+12 more)

### Community 16 - "githubChanges.js"
Cohesion: 0.14
Nodes (17): { authenticateToken, requirePermission }, commitCache, computeCommitKpis(), { execFile }, express, fetchCommitDetail(), fetchGithubCommits(), fetchLocalGitCommits() (+9 more)

### Community 17 - "nasBackupService.js"
Cohesion: 0.05
Nodes (90): activeBackupJobs, ALLOWED_MODES, ALLOWED_TYPES, authenticateNasAgentToken(), axios, buildHttpsAgent(), buildSynologyPullScript(), createNasServer() (+82 more)

### Community 18 - "withRetry"
Cohesion: 0.14
Nodes (31): fetchCachedExternalConfig(), getAccountingDb(), withRetry(), withTransaction(), calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), anularPagoPlanilla() (+23 more)

### Community 19 - "backend/package.json"
Cohesion: 0.09
Nodes (21): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+13 more)

### Community 20 - "recordatoriosPagosService.js"
Cohesion: 0.06
Nodes (62): getActiveMibotCountsByVencimientos(), BANK_RECONCILIABLE_METHODS, buildLegacyFormaPagoSummary(), computePaymentBalance(), crypto, DEFAULT_CASH_SOURCES, deleteReceiptFile(), enrichRecordatoriosList() (+54 more)

### Community 21 - "5. Resumen de Módulos y Tablas Principales"
Cohesion: 0.06
Nodes (30): 1. Información General de Conexión, 2. Arquitectura Multi-Tenant (Regla Crítica), 3.1. `account_types` (Tipos de Cuenta - Global), 3.2. `entry_types` (Tipos de Partida Contable - Global), 3.3. `chart_of_accounts` (Catálogo de Cuentas Contables), 3.4. `accounting_entries` (Cabecera de Partidas Contables), 3.5. `accounting_entry_lines` (Líneas de Partida Contable), 3.6. `accounting_entry_correlativos` (Control de Correlativos) (+22 more)

### Community 22 - "finanzas.js"
Cohesion: 0.14
Nodes (11): { authenticateToken, requirePermission }, express, finanzasCatalogosPerms, { generateWithGeminiFallback }, { getDb, withTransaction }, mantenimientoViewPerms, prestamosViewPerms, proyectosViewPerms (+3 more)

### Community 23 - "telegramTextAndDates.js"
Cohesion: 0.11
Nodes (28): broadcastDiscrepancyAlerts(), formatDiscrepancyAlertMessage(), getDiscrepancyInlineMarkup(), detectIntentInfo(), BANK_NAME_MAP, EL_SALVADOR_DATE_FMT, escapeRegex(), findFuelByKey() (+20 more)

### Community 24 - "backup-db.js"
Cohesion: 0.19
Nodes (13): BACKUP_DIR, dotenv, executeBackup(), fallbackNodeDump(), fs, getTimestamp(), mysql, path (+5 more)

### Community 25 - "ref_fs"
Cohesion: 0.12
Nodes (11): fs, path, puppeteer, __dirname, parts, pkg, pkgPath, __dirname (+3 more)

### Community 26 - "generate-icons.cjs"
Cohesion: 0.16
Nodes (11): BG, chunk(), crc32(), CRC_TABLE, fs, OUT_DIR, path, S_ROWS (+3 more)

### Community 27 - "read_and_send_dgehm.js"
Cohesion: 0.24
Nodes (15): Deployment & Architecture (VPS Host), cleanNum(), formatIsoToDgehmDate(), httpRequest(), https, loadMysql2(), main(), matchStations() (+7 more)

### Community 28 - "config.js"
Cohesion: 0.16
Nodes (12): { authenticateToken, requireRole }, dbModule, express, getDb(), invalidateConfigCache(), nodemailer, parseValidPort(), router (+4 more)

### Community 29 - "useToast"
Cohesion: 0.10
Nodes (51): ReportPreviewModal(), ToastContext, useToast(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), AsistenteIA(), buildStructuredFallbackByIntent() (+43 more)

### Community 30 - "ticketTelegramAgyService.js"
Cohesion: 0.17
Nodes (29): buildAgyReviewBranchName(), buildBranchReviewKeyboard(), buildCurrentKeyboardForTicket(), buildModelPickerKeyboard(), buildPlanApprovalKeyboard(), buildRetryExecutionKeyboard(), buildTicketActionKeyboard(), discardAgyReviewBranchOnServer() (+21 more)

### Community 31 - "date.js"
Cohesion: 0.30
Nodes (15): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ConsultasCumpleanos(), Dashboard(), addMonthsPreservingDay(), dateFromParts() (+7 more)

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.13
Nodes (34): applyFlexibleTextEdit(), autoBuildKnowledgeFromEcosystem(), buildEnterpriseGrowthSnapshot(), calculatePMT(), detectLocalAgyBinary(), emitCrecimientoAgySocket(), ensureCrecimientoSchema(), { execFileSync, spawn } (+26 more)

### Community 33 - "autoSyncScheduler.js"
Cohesion: 0.17
Nodes (11): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), initAutoSyncScheduler(), lastSyncMetadata, syncDGEHM (+3 more)

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.16
Nodes (20): axios, cleanNum(), dotenv, ensureLogDir(), fetchAllFuelPricesWithFallback(), fetchMirrorGasolinaSv(), fetchPrimaryDgehm(), formatIsoToDgehmDate() (+12 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "telegramProductivityService.js"
Cohesion: 0.07
Nodes (79): createMibotProgramacion(), getElSalvadorNowSql(), getRealtimeIo(), buildActorUserFromTelegram(), buildCandidateSearchTokens(), buildEventConfirmationMarkup(), buildEventConfirmationMessage(), buildEventTimePickerMarkup() (+71 more)

### Community 37 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.11
Nodes (66): formatStationDiscrepancyAuditMessage(), formatFeedbackListMessage(), handleSmartNaturalLanguageQuery(), filterBankOrChequeraAccounts(), analyzeNegativeFeedbackBatch(), { askConversationalAgent }, buildDeterministicExecutiveFallback(), classifyNegativeFeedback() (+58 more)

### Community 38 - "stationDiscrepancyAuditService.js"
Cohesion: 0.14
Nodes (24): formatYMD(), auditStationCloseoutsAndRemesas(), buildAlertEntriesFromAudit(), buildMonthLikePatterns(), cron, dbModule, ensuredAuditPools, ensureDiscrepancyAlertSchema() (+16 more)

### Community 39 - "mibotNotifier.test.js"
Cohesion: 0.25
Nodes (4): assert, {
    normalizeScheduleDatetime,
    addMinutesToSvSql,
    computeNextScheduleSql,
    formatDisplayDateTimeSv,
    formatMibotPersonalMessage,
    buildMibotInlineKeyboard,
    createMibotProgramacion,
    dispatchMibotProgramacion,
    handleMibotCallbackQuery,
    processDueMibotSchedules,
    getActiveMibotCountsByVencimientos
}, query(), test

### Community 40 - "telegramAlerts.test.js"
Cohesion: 0.06
Nodes (22): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }, assert, crecimientoRouter (+14 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.14
Nodes (28): maskToken(), activeUsers, checkDatabasesHealth(), checkFeedbackMetrics(), clearErrors(), errorBuffer, formatDiagnosticsMessage(), getActiveUsersCount() (+20 more)

### Community 43 - "telegramBotService.js"
Cohesion: 0.04
Nodes (112): getStationAuditInlineMarkup(), attemptSelfHealingCorrection(), {
    auditStationCloseoutsAndRemesas,
    formatStationDiscrepancyAuditMessage,
    getStationAuditInlineMarkup
}, axios, broadcastCustomAlert(), {
    buildAndSendExecutiveAudio,
    buildAndSendTopicChart
}, clearedLegacyKeyboardChats, clearUserConversationContext() (+104 more)

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
Cohesion: 0.08
Nodes (18): {
    analyzeNegativeFeedbackBatch,
    generateImprovedResponseForFeedback
}, authenticateN8nOrAdmin(), { authenticateToken, requirePermission }, crypto, {
    ensureMibotSchema,
    getEligibleMibotRecipients,
    getEligibleSipeOnlyUsers,
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
}, { getDb, getExternalDb } (+10 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.11
Nodes (21): closeAllPools(), closeExternalPools(), configCache, dbConfig, dotenv, externalPools, { generateAgentToken }, getExternalDb() (+13 more)

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
Cohesion: 0.17
Nodes (16): CheckPdfService, DesignerService, PrintEngine, Cheques(), ImpresionCheques(), getStoredUser(), CENTENAS, DECENAS (+8 more)

### Community 64 - "getDb"
Cohesion: 0.18
Nodes (23): getDb(), buildLiveProjectContext(), dbModule, runInitialServiceSeeds(), { seedInitialPortalOrders }, { seedSolarEnergyData }, seedInitialPortalOrders(), calcularRegistroDiarioAnalitico() (+15 more)

### Community 65 - "sendSafeError"
Cohesion: 0.04
Nodes (43): { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission }, catalogosViewPerms (+35 more)

### Community 66 - "executiveFlashService.js"
Cohesion: 0.27
Nodes (11): dbModule, enviarFlashPorEmail(), formatFechaTexto(), { generateWithGeminiFallback }, getAccountingDb(), getDb(), getExternalDb(), getFlashEjecutivo() (+3 more)

### Community 67 - "middleware/auth.js"
Cohesion: 0.08
Nodes (40): getDbIfReady(), authenticateToken(), deletedUsers, fetchLiveUserAuthState(), invalidateRoleAuthCache(), invalidateUserAuthCache(), isAdminUser(), isUserRevoked() (+32 more)

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

### Community 70 - "notifications.js"
Cohesion: 0.25
Nodes (7): { authenticateToken }, express, { getDb }, router, { sendSafeError }, { setRealtimeIo }, setRealtimeIo()

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "DesignCanvas.jsx"
Cohesion: 0.67
Nodes (3): applySnap(), DesignCanvas(), react-konva

### Community 74 - "mibotNotifierService.js"
Cohesion: 0.13
Nodes (27): buildMibotInlineKeyboard(), checkLinkedPaymentStatus(), cron, dbModule, digestTableInitPromises, dispatchMibotProgramacion(), emitMibotSystemNotifications(), ensureMibotDigestTable() (+19 more)

### Community 75 - "FinanzasCrecimiento.jsx"
Cohesion: 0.14
Nodes (19): ControlNAS(), EMPTY_FORM, formatBytes(), formatDateTime(), formatDuration(), FREQUENCY_OPTIONS, getStatusBadgeMeta(), isPrivateIpClient() (+11 more)

### Community 76 - "securityAndAuditFixes.test.js"
Cohesion: 0.10
Nodes (17): TAX_DEFAULTS, GEMINI_FALLBACK_MODELS, assert, { calcularEstadoPagoDte }, { computePaymentBalance }, dbModule, { describe, it }, fs (+9 more)

### Community 77 - "getDateStr"
Cohesion: 0.16
Nodes (32): buildWeeklyExecutiveDossierPayload(), {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    SPANISH_MONTH_NAMES,
    KNOWN_STATIONS,
    findStationById,
    findFuelByKey
}, calcPriceDiff(), dbModule, extractCompetitorBrand(), formatPreciosCompetenciaMessage(), getAccountingDb(), getCachedQuery() (+24 more)

### Community 78 - "telegramGeminiService.js"
Cohesion: 0.16
Nodes (26): resolveAiClient(), analyzePaymentReceiptWithAI(), analyzeTelegramImageReceipt(), askGeminiAssistant(), dbModule, ensuredTelegramSchemaPools, ensureTelegramConfigSchema(), {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr
} (+18 more)

### Community 79 - "sync_dgehm_precios.sh"
Cohesion: 0.40
Nodes (4): PATH, sync_dgehm_precios.sh script, SIPE_ADMIN_URL, SYNC_API_KEY

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "consultaPedidos.js"
Cohesion: 0.16
Nodes (16): { authenticateToken, requirePermission }, buildOrdersSummary(), consultaPedidosPerms, express, formatDateToDDMMYYYY(), formatOrderDateYMD(), { getExternalDb }, loadStationsList() (+8 more)

### Community 82 - "themeUtils.js"
Cohesion: 0.26
Nodes (16): ThemeModal(), ThemeContext, ThemeProvider(), useTheme(), ConfiguracionTema(), ACCENT_PRESETS, adjustBrightness(), applyCustomThemeCSS() (+8 more)

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
Cohesion: 0.20
Nodes (15): { branchToEmpId, formatYMD, normalizeSaasBranchId }, { buildMonthLikePatterns, parseBankDateDmyToIso }, dbModule, getAccountingDb(), getAuditoriaDineroEnTransito(), getDb(), getExternalDb(), getHomeResumenInteligente() (+7 more)

### Community 86 - "conversationalAiService.js"
Cohesion: 0.16
Nodes (18): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), consultasModule, conversationHistory, dbModule, getActiveConversationsCount() (+10 more)

### Community 87 - "tasks.js"
Cohesion: 0.20
Nodes (8): { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), {
    ensureMibotSchema,
    createMibotProgramacion,
    getActiveMibotSummaryByTaskIds,
    listMibotProgramaciones,
    setRealtimeIo
}, express, { getDb, getExternalDb }, router, { sendSafeError }, taskPerms

### Community 88 - "telegramSentinelService.js"
Cohesion: 0.14
Nodes (20): { auditStationCloseoutsAndRemesas }, buildWindowDayMap(), cron, dbModule, ensuredSentinelPools, ensureSentinelSchema(), {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr,
    shiftDate,
    normalizeText
}, evaluateSentinelAlerts() (+12 more)

### Community 89 - "telegramPerformance.test.js"
Cohesion: 0.10
Nodes (10): clearSolarCache(), solarMemoryCache, saasMemoryCache, assert, axios, { describe, it, beforeEach, afterEach }, router, {
    saasMemoryCache,
    getCachedSaas,
    setCachedSaas,
    clearSaasCache
} (+2 more)

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
Cohesion: 0.07
Nodes (61): { authenticateToken, requirePermission }, dbModule, express, generarAnalisisDescuadre(), getAccountingDb(), getConsolidadoVentasData(), getCortesTiendaData(), getDb() (+53 more)

### Community 94 - "useConfirm"
Cohesion: 0.11
Nodes (38): Regla obligatoria para NUEVAS pantallas (no opcional), Responsive / Mobile, 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), ControlPagosModal(), formatDateShort() (+30 more)

### Community 95 - "onedrive.js"
Cohesion: 0.22
Nodes (12): { authenticateToken, requirePermission }, express, findLatestFile(), navigateIntoFolder(), parseDateFromFileName(), parseRelativeDate(), router, scrapeItems() (+4 more)

### Community 96 - "birthdayNotifier.js"
Cohesion: 0.19
Nodes (13): buildBirthdayEmailHtml(), cron, formatSpanishDate(), { getDb, getAccountingDb }, getTodaysBirthdays(), initBirthdayScheduler(), nodemailer, sendBirthdayNotification() (+5 more)

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

### Community 99 - "localLlmFallback.test.js"
Cohesion: 0.23
Nodes (15): ALLOWED_LOCAL_INTENTS, ALLOWED_STATION_IDS, checkLocalLlmHealth(), classifyNaturalIntentWithLocalLlm(), convertGeminiContentsToOllamaMessages(), generateWithLocalLlm(), getLocalLlmConfig(), hasNonTextGeminiParts() (+7 more)

### Community 100 - "energyLatamService.js"
Cohesion: 0.19
Nodes (17): checkPortalStatus(), cleanupStaleBrowserLocks(), fs, { getDb, withRetry }, getPortalCredentials(), isTransientPuppeteerError(), launchBrowser(), normalizeEstacion() (+9 more)

### Community 101 - "cheques.js"
Cohesion: 0.07
Nodes (34): { authenticateToken, requirePermission }, bancosViewPerms, express, { formatDateYMD, formatDisplayDMY }, { getDb }, movimientosViewPerms, router, { sendSafeError } (+26 more)

### Community 102 - "fuelIntelligence.js"
Cohesion: 0.33
Nodes (11): addDaysYMD(), { branchToEmpId, formatYMD }, calcularSimuladorDGEHM(), dbModule, getAccountingDb(), getAuditoriaMermas(), getDb(), getElSalvadorTodayYMD() (+3 more)

### Community 103 - "mibotNluAndSchedule.test.js"
Cohesion: 0.17
Nodes (14): addMinutesToSvSql(), computeNextScheduleSql(), dbDatetimeToSvSql(), formatDisplayDateTimeSv(), getActiveMibotSummaryByTaskIds(), handleMibotCallbackQuery(), normalizeScheduleDatetime(), pad2() (+6 more)

### Community 104 - "profitabilityService.js"
Cohesion: 0.30
Nodes (13): getRiesgoCreditoFlotas(), { branchToEmpId, OFFICIAL_ESTACIONES }, dbModule, getAccountingDb(), getDb(), getElasticidadPreciosCompetencia(), { getElSalvadorTodayYMD, addDaysYMD }, getRentabilidadPorEstacion() (+5 more)

### Community 105 - "errorDiagnostics.js"
Cohesion: 0.13
Nodes (10): ErrorBoundary, copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError() (+2 more)

### Community 106 - "dgehmService.js"
Cohesion: 0.20
Nodes (12): getPuppeteer(), cleanNum(), fetchDgehmPrices(), fs, getPuppeteer(), normalizeName(), path, syncDgehmWithDatabase() (+4 more)

### Community 107 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 108 - "telegramSecurity.test.js"
Cohesion: 0.27
Nodes (7): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData(), assert, { describe, it }

### Community 109 - "paymentNotifier.js"
Cohesion: 0.23
Nodes (13): buildPaymentEmailHtml(), cron, formatCurrency(), formatSpanishDate(), { getDb, getExternalDb }, getDuePayments(), initPaymentScheduler(), nodemailer (+5 more)

### Community 110 - "DashboardLayout.jsx"
Cohesion: 0.11
Nodes (25): ColorIcon(), createColorIcon(), ICON_ALIASES, bundledCollections, allNavCategories, bancosMenu, bancosReportes, catalogItems (+17 more)

### Community 111 - "VentasEstaciones.jsx"
Cohesion: 0.26
Nodes (8): CorteTiendaModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt(), numFmt(), VentasEstaciones(), moneyFmt(), numFmt()

### Community 112 - "App.jsx"
Cohesion: 0.17
Nodes (16): Frontend Conventions, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login, PermissionRoute() (+8 more)

### Community 113 - "NotificationBell.jsx"
Cohesion: 0.25
Nodes (10): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast(), NotificationContext, NotificationProvider(), readStoredUser(), useNotifications() (+2 more)

### Community 114 - "AGENTS.md"
Cohesion: 0.17
Nodes (11): Commands, Environment, Git, Commits y Sincronización Remota (Regla Obligatoria), graphify, PWA, Structure, Testing & Quality Assurance, UI Compacta y Ergonómica (Regla Obligatoria) (+3 more)

### Community 115 - "consultasCompetenciaRoutes.js"
Cohesion: 0.18
Nodes (12): { authenticateToken, requirePermission }, crypto, dbModule, express, getDb(), {
    preciosEstacionViewPerms,
    preciosCompetenciaViewPerms
}, registerConsultasCompetenciaRoutes(), { sendSafeError } (+4 more)

### Community 116 - "tickets.js"
Cohesion: 0.25
Nodes (8): { authenticateToken, isAdminUser }, canManageTickets(), express, getActorName(), isTicketOwner(), router, { sendSafeError }, ticketService

### Community 117 - "finanzasCrecimiento.js"
Cohesion: 0.25
Nodes (7): { authenticateToken, requirePermission, isAdminUser }, crecimientoManagePerms, crecimientoViewPerms, express, growthService, router, { sendSafeError }

### Community 118 - "ensureMibotSchema"
Cohesion: 0.43
Nodes (8): canActorModifyProgramacion(), cancelMibotProgramacion(), ensureMibotSchema(), getLatestEditableMibotProgramacionForUser(), getMibotProgramacionById(), hydrateProgramacionRow(), listMibotProgramaciones(), rescheduleMibotProgramacion()

### Community 119 - "Ecosistema de Agentes IA, n8n y OpenClaw (Servidor 169.58.207.115)"
Cohesion: 0.29
Nodes (7): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Ecosistema de Agentes IA, n8n y OpenClaw (Servidor 169.58.207.115)

### Community 120 - "SIPE Admin"
Cohesion: 0.29
Nodes (6): 🚀 Arquitectura y Entorno de Producción, Backend, 💻 Comandos Principales, Frontend, SIPE Admin, 🛠️ Tecnologías

### Community 121 - "ticketDiagnostics.js"
Cohesion: 0.53
Nodes (5): initTicketDiagnosticsCollector(), pushBounded(), recordNetworkErrorForTicket(), safeStringify(), state

## Knowledge Gaps
- **21 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1217 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authenticateToken()` connect `middleware/auth.js` to `server.js`, `operaciones.js`, `inteligencia.js`, `githubChanges.js`, `recordatoriosPagosService.js`, `finanzas.js`, `config.js`, `ai.js`, `telegram.js`, `db.js`, `sendSafeError`, `notifications.js`, `consultaPedidos.js`, `tasks.js`, `consultas.js`, `onedrive.js`, `cheques.js`, `telegramSecurity.test.js`, `consultasCompetenciaRoutes.js`, `tickets.js`, `finanzasCrecimiento.js`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06545879602571596 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `FinanzasPrestamos.jsx`, `lazyPages.js`, `frontend/package.json`, `TicketContext.jsx`, `Tareas.jsx`, `useToast`, `date.js`, `Cheques.jsx`, `DesignCanvas.jsx`, `FinanzasCrecimiento.jsx`, `FinanzasInversiones.jsx`, `themeUtils.js`, `useConfirm`, `CommandPalette.jsx`, `errorDiagnostics.js`, `DashboardLayout.jsx`, `VentasEstaciones.jsx`, `App.jsx`, `NotificationBell.jsx`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `handleSmartNaturalLanguageQuery()` (e.g. with `telegramBotService.js` and `noReplyKeyboardFn()`) actually correct?**
  _`handleSmartNaturalLanguageQuery()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Should `telegramBot.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._