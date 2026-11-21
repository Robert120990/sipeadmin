# Graph Report - SIPEOFI  (2026-11-20)

## Corpus Check
- 264 files · ~668,752 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 2376 nodes · 6762 edges · 101 communities (95 shown, 6 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 478 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `911fc7af`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Modal
- lazyPages.js
- telegramBot.test.js
- frontend/package.json
- server.js
- operaciones.js
- consultas.js
- inteligencia.js
- telegramCompetencia.test.js
- ref_node_assert
- useToast
- ticketService.js
- TicketContext.jsx
- date.js
- webhook-server.js
- dependencies
- githubChanges.js
- themeUtils.js
- db.js
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
- DashboardLayout.jsx
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
- getDb
- scripts
- operationalIntelligenceV2.test.js
- solarEnergyService.js
- sendSafeError
- requirePermission
- executiveFlashService.js
- middleware/auth.js
- conversationalAiService.js
- NotificationContext.jsx
- finanzasCrecimiento.test.js
- salesHourlyService.js
- react
- sync_portal_pedidos.sh
- mibotNotifierService.js
- telegramAlerts.test.js
- authorization.test.js
- telegramDataService.js
- errorDiagnostics.js
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
- analisisDescuadre.test.js
- ControlRecordatorios.jsx
- ticketDiagnostics.js
- PermissionRoute
- solarAndSalesHourly.test.js
- telegramVisionAndPdf.test.js
- getDb
- ErrorBoundary

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
10. `escapeHtml()` - 58 edges

## Surprising Connections (you probably didn't know these)
- `4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA)` --references--> `getUserEffectivePermissions()`  [INFERRED]
  AGENTS.md → backend/services/telegramBotService.js
- `Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)` --references--> `ReportPreviewModal()`  [INFERRED]
  AGENTS.md → frontend/src/components/ReportPreviewModal.jsx
- `🚀 Arquitectura y Entorno de Producción` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `🔒 Seguridad y Control de Acceso` --references--> `requirePermission()`  [INFERRED]
  README.md → backend/middleware/auth.js
- `Regla obligatoria para NUEVAS pantallas (no opcional)` --references--> `useConfirm()`  [INFERRED]
  AGENTS.md → frontend/src/components/ConfirmDialog.jsx

## Import Cycles
- None detected.

## Communities (101 total, 6 thin omitted)

### Community 0 - "Modal"
Cohesion: 0.09
Nodes (44): 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), formatDateDMY(), formatMibotDateTime(), formatMoney(), getDeliveryBadgeStyle() (+36 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.11
Nodes (61): Frontend Conventions, App(), DashboardLayout, Login, ProtectedRoute(), ConfirmProvider(), ToastProvider(), DashboardLayout() (+53 more)

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
Nodes (17): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+9 more)

### Community 4 - "server.js"
Cohesion: 0.03
Nodes (58): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked, resolveLiveUserAuthState }, authRoutes, { autoLogMiddleware } (+50 more)

### Community 5 - "operaciones.js"
Cohesion: 0.05
Nodes (47): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, buildCompactPresetValue(), buildEstacionFilterClause(), calculateHasMore(), compactBankCode(), crypto, energiaSolarViewPerms (+39 more)

### Community 6 - "consultas.js"
Cohesion: 0.10
Nodes (40): { authenticateToken, requirePermission }, dbModule, express, {
    normalizeStationName,
    getResumenMensualData,
    getResumenRangoVentasData,
    getComparativoAnualData
}, { registerConsultasCierresRoutes }, { registerConsultasCompetenciaRoutes }, router, { sendSafeError } (+32 more)

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
Cohesion: 0.10
Nodes (11): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }, assert, { describe, it } (+3 more)

### Community 10 - "useToast"
Cohesion: 0.12
Nodes (33): ESTRATEGIA_TABS, EstrategiaNav(), AGY_STATUS_META, DEFAULT_MODELS, AGENT_PLATFORMS, AI_EXECUTION_MODES, ToastContext, useToast() (+25 more)

### Community 11 - "ticketService.js"
Cohesion: 0.07
Nodes (63): acknowledgeResolution(), addTicketMessage(), AGY_MODEL_ALIASES, approveAndGeneratePlan(), autoTriageTicketsForAi(), AVAILABLE_AGY_MODELS, buildAgyPlanApprovalKeyboard(), buildAiPromptPackage() (+55 more)

### Community 12 - "TicketContext.jsx"
Cohesion: 0.07
Nodes (34): CommandPalette(), TICKET_KEYWORDS, PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal() (+26 more)

### Community 13 - "date.js"
Cohesion: 0.30
Nodes (15): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ConsultasCumpleanos(), Dashboard(), addMonthsPreservingDay(), dateFromParts() (+7 more)

### Community 14 - "webhook-server.js"
Cohesion: 0.17
Nodes (8): crypto, { exec }, fs, http, path, PORT, PROJECT_DIR, server

### Community 15 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, axios, axios-cookiejar-support, bcryptjs, cors, dotenv, express, express-rate-limit (+12 more)

### Community 16 - "githubChanges.js"
Cohesion: 0.14
Nodes (17): { authenticateToken, requirePermission }, commitCache, computeCommitKpis(), { execFile }, express, fetchCommitDetail(), fetchGithubCommits(), fetchLocalGitCommits() (+9 more)

### Community 17 - "themeUtils.js"
Cohesion: 0.24
Nodes (17): ThemeModal(), ThemeContext, ThemeProvider(), useTheme(), ConfiguracionTema(), ConfiguracionTema, ACCENT_PRESETS, adjustBrightness() (+9 more)

### Community 18 - "db.js"
Cohesion: 0.09
Nodes (44): configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getAccountingDb(), mysql, withRetry() (+36 more)

### Community 19 - "backend/package.json"
Cohesion: 0.09
Nodes (21): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+13 more)

### Community 20 - "recordatoriosPagosService.js"
Cohesion: 0.07
Nodes (59): getGeminiApiKey(), getActiveMibotCountsByVencimientos(), analyzePaymentReceiptWithAI(), BANK_RECONCILIABLE_METHODS, buildLegacyFormaPagoSummary(), computePaymentBalance(), crypto, DEFAULT_CASH_SOURCES (+51 more)

### Community 21 - "5. Resumen de Módulos y Tablas Principales"
Cohesion: 0.06
Nodes (30): 1. Información General de Conexión, 2. Arquitectura Multi-Tenant (Regla Crítica), 3.1. `account_types` (Tipos de Cuenta - Global), 3.2. `entry_types` (Tipos de Partida Contable - Global), 3.3. `chart_of_accounts` (Catálogo de Cuentas Contables), 3.4. `accounting_entries` (Cabecera de Partidas Contables), 3.5. `accounting_entry_lines` (Líneas de Partida Contable), 3.6. `accounting_entry_correlativos` (Control de Correlativos) (+22 more)

### Community 22 - "finanzas.js"
Cohesion: 0.07
Nodes (24): withTransaction(), requireRole(), { authenticateToken, requirePermission }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction }, router (+16 more)

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
Cohesion: 0.08
Nodes (36): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+28 more)

### Community 28 - "config.js"
Cohesion: 0.10
Nodes (23): { authenticateToken, requireRole }, dbModule, express, getDb(), invalidateConfigCache(), nodemailer, parseValidPort(), router (+15 more)

### Community 29 - "FinanzasPrestamos.jsx"
Cohesion: 0.33
Nodes (15): FinanzasCalculadora(), FinanzasPrestamos(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings(), calculatePMT(), calculatePV() (+7 more)

### Community 30 - "ticketTelegramAgyService.js"
Cohesion: 0.17
Nodes (29): buildAgyReviewBranchName(), buildBranchReviewKeyboard(), buildCurrentKeyboardForTicket(), buildModelPickerKeyboard(), buildPlanApprovalKeyboard(), buildRetryExecutionKeyboard(), buildTicketActionKeyboard(), discardAgyReviewBranchOnServer() (+21 more)

### Community 31 - "DashboardLayout.jsx"
Cohesion: 0.11
Nodes (24): Responsive / Mobile, ColorIcon(), createColorIcon(), ICON_ALIASES, LoadingFallback(), bundledCollections, allNavCategories, bancosMenu (+16 more)

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.12
Nodes (35): applyFlexibleTextEdit(), autoBuildKnowledgeFromEcosystem(), buildEnterpriseGrowthSnapshot(), calculatePMT(), detectLocalAgyBinary(), emitCrecimientoAgySocket(), ensureCrecimientoSchema(), { execFileSync, spawn } (+27 more)

### Community 33 - "autoSyncScheduler.js"
Cohesion: 0.16
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), initAutoSyncScheduler(), lastSyncMetadata, syncDGEHM (+4 more)

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.15
Nodes (20): axios, cleanNum(), dotenv, ensureLogDir(), fetchAllFuelPricesWithFallback(), fetchMirrorGasolinaSv(), fetchPrimaryDgehm(), formatIsoToDgehmDate() (+12 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "telegramProductivityService.js"
Cohesion: 0.07
Nodes (60): getRealtimeIo(), buildCandidateSearchTokens(), buildEventWizardMarkup(), buildTaskWizardConfirmMarkup(), buildTaskWizardStep1Markup(), cleanExtractedTitle(), clearProductivityWizards(), createMultiUserTasksFromTelegram() (+52 more)

### Community 37 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.14
Nodes (54): handleSmartNaturalLanguageQuery(), { askConversationalAgent }, buildDeterministicExecutiveFallback(), {
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
}, generateImprovedResponseForFeedback(), { getAuditoriaDineroEnTransito }, {
    getConsolidadoVentas,
    getSaldosBancosData,
    getSaldosChequeraData,
    filterBankOrChequeraAccounts,
    getVentasTiendaPorLineaData,
    getRankingDiasVentasData,
    getPagosProgramadosData,
    getPreciosCompetenciaData,
    getPedidosPumaData,
    formatPreciosCompetenciaMessage
}, { getDb, getExternalDb, getAccountingDb } (+46 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.21
Nodes (11): getPuppeteer(), cleanNum(), fetchDgehmPrices(), fs, getPuppeteer(), normalizeName(), path, syncDgehmWithDatabase() (+3 more)

### Community 39 - "mibotNotifier.test.js"
Cohesion: 0.19
Nodes (12): addMinutesToSvSql(), buildMibotInlineKeyboard(), computeNextScheduleSql(), formatDisplayDateTimeSv(), getElSalvadorNowParts(), getElSalvadorNowSql(), handleMibotCallbackQuery(), normalizeScheduleDatetime() (+4 more)

### Community 40 - "ReportPreviewModal"
Cohesion: 0.11
Nodes (31): ReportPreviewModal(), AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText(), ConsultaCambiosGithub() (+23 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.14
Nodes (28): maskToken(), activeUsers, checkDatabasesHealth(), checkFeedbackMetrics(), clearErrors(), errorBuffer, formatDiagnosticsMessage(), getActiveUsersCount() (+20 more)

### Community 43 - "telegramBotService.js"
Cohesion: 0.06
Nodes (73): handleWebhooksTrigger(), askConversationalAgent(), attemptSelfHealingCorrection(), axios, broadcastCustomAlert(), broadcastDiscrepancyAlerts(), clearUserConversationContext(), createFeedbackEntry() (+65 more)

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
Cohesion: 0.06
Nodes (27): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), cachedGraphifyStats, conversationalAiService, crypto, dbModule, DEFAULT_AI_SUGGESTIONS (+19 more)

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

### Community 60 - "getDb"
Cohesion: 0.10
Nodes (27): getDb(), getExternalDb(), initDB(), { getExternalDb }, up(), { getDb, getExternalDb }, up(), { getDb, getExternalDb } (+19 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "operationalIntelligenceV2.test.js"
Cohesion: 0.13
Nodes (18): { branchToEmpId, OFFICIAL_ESTACIONES }, dbModule, getAccountingDb(), getDb(), getElasticidadPreciosCompetencia(), getRentabilidadPorEstacion(), resolveStationEmpCode(), solarEnergyService (+10 more)

### Community 63 - "solarEnergyService.js"
Cohesion: 0.27
Nodes (15): calcularRegistroDiarioAnalitico(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getSolarAhorroDiario(), getSolarAhorroMensual(), getSolarAhorroRango(), getSolarEstadoActual() (+7 more)

### Community 64 - "sendSafeError"
Cohesion: 0.04
Nodes (54): getIsoDate(), getPreciosCompetenciaSafe(), handleAiQuery(), handleSchemaContext(), handleSolarAndelsaDashboard(), stripHtmlToText(), { authenticateToken, requirePermission }, bitacoraPerms (+46 more)

### Community 65 - "requirePermission"
Cohesion: 0.18
Nodes (13): requirePermission(), { authenticateToken, requirePermission }, crypto, dbModule, express, getDb(), {
    preciosEstacionViewPerms,
    preciosCompetenciaViewPerms
}, registerConsultasCompetenciaRoutes() (+5 more)

### Community 66 - "executiveFlashService.js"
Cohesion: 0.24
Nodes (12): dbModule, enviarFlashPorEmail(), formatFechaTexto(), getAccountingDb(), getDb(), getExternalDb(), getFlashEjecutivo(), { getTanquesAutonomia } (+4 more)

### Community 67 - "middleware/auth.js"
Cohesion: 0.07
Nodes (38): Bitácora (Audit Log), getDbIfReady(), authenticateToken(), deletedUsers, fetchLiveUserAuthState(), invalidateRoleAuthCache(), invalidateUserAuthCache(), isUserRevoked() (+30 more)

### Community 68 - "conversationalAiService.js"
Cohesion: 0.17
Nodes (16): appendToHistory(), cleanExpiredSessions(), clearConversation(), consultasModule, conversationHistory, dbModule, getActiveConversationsCount(), getDb() (+8 more)

### Community 69 - "NotificationContext.jsx"
Cohesion: 0.25
Nodes (10): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast(), NotificationContext, NotificationProvider(), readStoredUser(), useNotifications() (+2 more)

### Community 70 - "finanzasCrecimiento.test.js"
Cohesion: 0.17
Nodes (8): assert, crecimientoRouter, { describe, it, beforeEach, afterEach }, express, growthService, http, jwt, { JWT_SECRET }

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "react"
Cohesion: 0.08
Nodes (34): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox() (+26 more)

### Community 74 - "mibotNotifierService.js"
Cohesion: 0.14
Nodes (30): checkLinkedPaymentStatus(), createMibotProgramacion(), cron, dbModule, digestTableInitPromises, dispatchMibotProgramacion(), ensureMibotDigestTable(), ensureMibotSchema() (+22 more)

### Community 75 - "telegramAlerts.test.js"
Cohesion: 0.10
Nodes (14): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }, assert, axios (+6 more)

### Community 76 - "authorization.test.js"
Cohesion: 0.20
Nodes (5): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }

### Community 77 - "telegramDataService.js"
Cohesion: 0.13
Nodes (39): buildLiveProjectContext(), buildWeeklyExecutiveDossierPayload(), {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    SPANISH_MONTH_NAMES,
    KNOWN_STATIONS,
    findStationById,
    findFuelByKey
}, calcPriceDiff(), clearQueryCache(), COMPETENCIA_STATION_NAMES, dbModule, extractCompetitorBrand() (+31 more)

### Community 78 - "errorDiagnostics.js"
Cohesion: 0.31
Nodes (5): errorLogBuffer, recordApiError(), recordDiagnosticLog(), recordGlobalError(), react-dom

### Community 79 - "sync_dgehm_precios.sh"
Cohesion: 0.40
Nodes (4): PATH, sync_dgehm_precios.sh script, SIPE_ADMIN_URL, SYNC_API_KEY

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "getConsolidadoVentasData"
Cohesion: 0.43
Nodes (8): getAccountingDb(), getConsolidadoVentasData(), getCortesTiendaData(), getDb(), getExternalDb(), getPreciosEstacionData(), getTurnosPorEmpresa(), withRetry()

### Community 82 - "telegramTextAndDates.js"
Cohesion: 0.09
Nodes (30): filterBankOrChequeraAccounts(), analyzeNegativeFeedbackBatch(), classifyNegativeFeedback(), detectIntentInfo(), BANK_NAME_MAP, escapeRegex(), formatYMD(), KNOWN_ACCOUNT_HOLDERS (+22 more)

### Community 83 - "andelsaTelegramBot.test.js"
Cohesion: 0.12
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
Cohesion: 0.21
Nodes (15): branchToEmpId, formatYMD(), { branchToEmpId, formatYMD }, dbModule, getAccountingDb(), getAuditoriaDineroEnTransito(), getDb(), getHomeResumenInteligente() (+7 more)

### Community 86 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 87 - "tasks.js"
Cohesion: 0.09
Nodes (21): isAdminUser(), userHasAnyPerm(), { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), {
    ensureMibotSchema,
    createMibotProgramacion,
    getActiveMibotSummaryByTaskIds,
    listMibotProgramaciones,
    setRealtimeIo
}, express, { getDb, getExternalDb }, hasTaskManagePermission() (+13 more)

### Community 88 - "bancos.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }

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

### Community 93 - "analisisDescuadre.test.js"
Cohesion: 0.40
Nodes (5): generarAnalisisDescuadre(), mapCierreRowConExplicacion(), assert, consultasRouter, { describe, it }

### Community 94 - "ControlRecordatorios.jsx"
Cohesion: 0.14
Nodes (30): Regla obligatoria para NUEVAS pantallas (no opcional), ControlPagosModal(), formatDateShort(), getMethodCategory(), getMethodLabel(), mc(), OPERATION_TYPES, PAYMENT_METHOD_OPTIONS (+22 more)

### Community 95 - "ticketDiagnostics.js"
Cohesion: 0.53
Nodes (5): initTicketDiagnosticsCollector(), pushBounded(), recordNetworkErrorForTicket(), safeStringify(), state

### Community 96 - "PermissionRoute"
Cohesion: 0.40
Nodes (4): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, PermissionRoute()

### Community 97 - "solarAndSalesHourly.test.js"
Cohesion: 0.40
Nodes (4): assert, { describe, it }, salesHourlyService, solarEnergyService

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

### Community 100 - "getDb"
Cohesion: 0.67
Nodes (3): getDb(), getGraphifyStatsSafe(), handleAgentsControlCenter()

### Community 105 - "ErrorBoundary"
Cohesion: 0.21
Nodes (4): ErrorBoundary, copyDiagnosticToClipboard(), generateDiagnosticReport(), getRecentErrorLogs()

## Knowledge Gaps
- **21 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1035 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authenticateToken()` connect `middleware/auth.js` to `sendSafeError`, `requirePermission`, `server.js`, `operaciones.js`, `consultas.js`, `inteligencia.js`, `githubChanges.js`, `db.js`, `onedrive.js`, `ai.js`, `finanzas.js`, `bancos.js`, `tasks.js`, `telegram.js`, `config.js`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.08644067796610169 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `dependencies` to `backend/package.json`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `handleSmartNaturalLanguageQuery()` (e.g. with `telegramBotService.js` and `getMainReplyKeyboard()`) actually correct?**
  _`handleSmartNaturalLanguageQuery()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11315924219150025 - nodes in this community are weakly interconnected._