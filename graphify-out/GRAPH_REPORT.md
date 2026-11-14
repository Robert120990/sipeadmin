# Graph Report - SIPEOFI  (2026-11-13)

## Corpus Check
- 233 files · ~551,242 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 1793 nodes · 4968 edges · 93 communities (84 shown, 9 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 300 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3298177c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Modal
- lazyPages.js
- handleSmartNaturalLanguageQuery
- frontend/package.json
- server.js
- operaciones.js
- consultas.js
- middleware/auth.js
- telegramCompetencia.test.js
- ref_node_assert
- navigation.js
- ticketService.js
- SupportTickets.jsx
- DesignerView.jsx
- authorization.test.js
- dependencies
- githubChanges.js
- themeUtils.js
- withRetry
- backend/package.json
- birthdayNotifier.js
- 5. Resumen de Módulos y Tablas Principales
- finanzas.js
- onedrive.js
- backup-db.js
- ref_fs
- generate-icons.cjs
- AGENTS.md
- rrhh.test.js
- FinanzasPrestamos.jsx
- checkDesigner.js
- bancos.js
- businessGrowthAgyService.js
- ref_path
- sync-dgehm-direct.js
- scripts
- handleIncomingMessage
- inteligencia.js
- dgehmService.js
- QuickTicketModal.jsx
- ReportPreviewModal
- scripts
- telegramAuditorService.js
- telegramAdvancedCapabilities.test.js
- dependencies
- sysSaasService.js
- PLAN ESTRATÉGICO DE INTEGRACIÓN: INTELIGENCIA ARTIFICIAL, CONTABILIDAD AUTOMÁTICA Y CONTROL FINANCIERO
- vercel.json
- deploy.sh
- 1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques)
- sw.js
- ai.js
- Estándares del Backend - SIPE Admin
- telegramBotService.js
- Reglas de Git, Commits y Sincronización Remota
- devDependencies
- db.js
- scripts
- sendSafeError
- errorDiagnostics.js
- conciliacion.js
- tasks.js
- useToast
- finanzasCrecimiento.test.js
- Cheques.jsx
- conversationalAiService.js
- deploy.js
- salesHourlyService.js
- NotificationContext.jsx
- sync_portal_pedidos.sh
- autoSyncScheduler.js
- solarEnergyService.js
- energyLatamService.js
- telegramPerformance.test.js
- telegramAlerts.test.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- paymentNotifier.js
- middleware/bitacora.js
- operacionesPedidos.test.js
- CommandPalette.jsx
- config.js
- TicketDetailModal.jsx
- useDesigner.js
- ticketDiagnostics.js
- aiGateway.test.js
- TicketContext.jsx
- agregar_nuevo_modulo.md
- PrintEngine.js

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 123 edges
2. `react` - 96 edges
3. `lucide-react` - 81 edges
4. `getDb()` - 66 edges
5. `App()` - 65 edges
6. `Modal()` - 64 edges
7. `DashboardLayout()` - 63 edges
8. `api` - 59 edges
9. `handleIncomingMessage()` - 56 edges
10. `withRetry()` - 54 edges

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
- 2-file cycle: `backend/services/conversationalAiService.js -> backend/services/telegramBotService.js -> backend/services/conversationalAiService.js`
- 2-file cycle: `backend/services/telegramAuditorService.js -> backend/services/telegramBotService.js -> backend/services/telegramAuditorService.js`
- 2-file cycle: `backend/db.js -> backend/services/solarEnergyService.js -> backend/db.js`
- 2-file cycle: `backend/db.js -> backend/services/energyLatamService.js -> backend/db.js`
- 3-file cycle: `backend/services/conversationalAiService.js -> backend/services/telegramAuditorService.js -> backend/services/telegramBotService.js -> backend/services/conversationalAiService.js`

## Communities (93 total, 9 thin omitted)

### Community 0 - "Modal"
Cohesion: 0.12
Nodes (33): Regla obligatoria para NUEVAS pantallas (no opcional), Responsive / Mobile, 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), FormatManager() (+25 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.12
Nodes (65): Frontend Conventions, App(), DashboardLayout, Login, PermissionRoute(), ProtectedRoute(), ConfirmProvider(), LoadingFallback() (+57 more)

### Community 2 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.17
Nodes (41): handleAiQuery(), escapeHtml(), formatAlertasMessage(), formatAndelsaCostosMessage(), formatAndelsaCxcMessage(), formatAndelsaFinanzasResumenMessage(), formatAndelsaInventarioMessage(), formatAndelsaVentasClienteMessage() (+33 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.11
Nodes (17): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+9 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (51): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, JWT_SECRET, isUserRevoked }, authRoutes, { autoLogMiddleware } (+43 more)

### Community 5 - "operaciones.js"
Cohesion: 0.09
Nodes (22): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, crypto, energiaSolarViewPerms, energyLatamService, express, fetchPromedios(), fetchTankReadings() (+14 more)

### Community 6 - "consultas.js"
Cohesion: 0.07
Nodes (44): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, branchToEmpId, cierreViewPerms, crypto, cumpleanosViewPerms, diferenciasViewPerms, express (+36 more)

### Community 7 - "middleware/auth.js"
Cohesion: 0.08
Nodes (32): authenticateToken(), isAdminUser(), isUserRevoked(), jwt, requirePermission(), requireRole(), restoreUser(), revokedUsers (+24 more)

### Community 8 - "telegramCompetencia.test.js"
Cohesion: 0.12
Nodes (24): buildAndSendTopicPdf(), calcPriceDiff(), clearQueryCache(), extractCompetitorBrand(), generateExecutiveReportPdf(), getCachedQuery(), getCompetenciaInlineMarkup(), getConsolidadoVentas() (+16 more)

### Community 9 - "ref_node_assert"
Cohesion: 0.11
Nodes (10): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService (+2 more)

### Community 10 - "navigation.js"
Cohesion: 0.08
Nodes (33): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), createColorIcon(), ICON_ALIASES, bundledCollections (+25 more)

### Community 11 - "ticketService.js"
Cohesion: 0.08
Nodes (51): acknowledgeResolution(), addTicketMessage(), approveAndGeneratePlan(), autoTriageTicketsForAi(), buildAgyPlanApprovalKeyboard(), buildAiPromptPackage(), buildInteractiveTicketKeyboard(), computeDiagnosticRelevance() (+43 more)

### Community 12 - "SupportTickets.jsx"
Cohesion: 0.17
Nodes (8): TicketAiBundleModal(), TicketFiltersBar(), TicketSummaryCards(), formatDateTime(), PRIORITY_STYLES, STATUS_CONFIG, SupportTickets(), TYPE_LABELS

### Community 13 - "DesignerView.jsx"
Cohesion: 0.25
Nodes (10): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, Toolbox(), CalibrationDialog(), Preview() (+2 more)

### Community 14 - "authorization.test.js"
Cohesion: 0.10
Nodes (12): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }, crypto, { exec }, http (+4 more)

### Community 15 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, axios, axios-cookiejar-support, bcryptjs, cors, dotenv, express, express-rate-limit (+12 more)

### Community 16 - "githubChanges.js"
Cohesion: 0.14
Nodes (17): { authenticateToken, requirePermission }, commitCache, computeCommitKpis(), { execFile }, express, fetchCommitDetail(), fetchGithubCommits(), fetchLocalGitCommits() (+9 more)

### Community 17 - "themeUtils.js"
Cohesion: 0.26
Nodes (16): ThemeModal(), ThemeContext, ThemeProvider(), useTheme(), ConfiguracionTema(), ACCENT_PRESETS, adjustBrightness(), applyCustomThemeCSS() (+8 more)

### Community 18 - "withRetry"
Cohesion: 0.15
Nodes (30): getAccountingDb(), withRetry(), calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), getRiesgoCreditoFlotas(), getAuditoriaMermas(), { getAccountingDb, withRetry } (+22 more)

### Community 19 - "backend/package.json"
Cohesion: 0.09
Nodes (21): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+13 more)

### Community 20 - "birthdayNotifier.js"
Cohesion: 0.19
Nodes (13): buildBirthdayEmailHtml(), cron, formatSpanishDate(), { getDb, getAccountingDb }, getTodaysBirthdays(), initBirthdayScheduler(), nodemailer, sendBirthdayNotification() (+5 more)

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
Nodes (25): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+17 more)

### Community 28 - "rrhh.test.js"
Cohesion: 0.20
Nodes (10): assert, { getDb, getAccountingDb }, { numberToWords }, rhPlanillaService, { test, describe, after }, CENTENAS, DECENAS, numberToWords() (+2 more)

### Community 29 - "FinanzasPrestamos.jsx"
Cohesion: 0.30
Nodes (16): FinanzasAsesor(), FinanzasCalculadora(), FinanzasPrestamos(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings(), calculatePMT() (+8 more)

### Community 30 - "checkDesigner.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, checkDesignerPerms, express, { getDb }, router, { sendSafeError }

### Community 31 - "bancos.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.13
Nodes (33): autoBuildKnowledgeFromEcosystem(), buildEnterpriseGrowthSnapshot(), calculatePMT(), detectLocalAgyBinary(), ensureCrecimientoSchema(), { execFileSync, spawn }, executeAgyServerPlan(), extractHeuristicKnowledgeFromText() (+25 more)

### Community 33 - "ref_path"
Cohesion: 0.10
Nodes (11): dbConfig, dotenv, mysql, path, mysql, path, mysql, path (+3 more)

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.20
Nodes (10): axios, dotenv, ensureLogDir(), fs, { getDb }, https, logFile, path (+2 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "handleIncomingMessage"
Cohesion: 0.11
Nodes (30): analyzeTelegramImageReceipt(), askGeminiAssistant(), broadcastCustomAlert(), createFeedbackEntry(), formatHelpMessage(), formatReceiptAnalysisMessage(), getDb(), getGeminiApiKey() (+22 more)

### Community 37 - "inteligencia.js"
Cohesion: 0.13
Nodes (19): { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente }, { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas }, router (+11 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.21
Nodes (11): getPuppeteer(), cleanNum(), fetchDgehmPrices(), fs, getPuppeteer(), normalizeName(), path, syncDgehmWithDatabase() (+3 more)

### Community 39 - "QuickTicketModal.jsx"
Cohesion: 0.28
Nodes (10): PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal(), TOOLS, TicketProvider() (+2 more)

### Community 40 - "ReportPreviewModal"
Cohesion: 0.12
Nodes (36): ReportPreviewModal(), AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText(), ConsultaCambiosGithub() (+28 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.14
Nodes (27): maskToken(), activeUsers, checkDatabasesHealth(), checkFeedbackMetrics(), clearErrors(), errorBuffer, formatDiagnosticsMessage(), getActiveUsersCount() (+19 more)

### Community 43 - "telegramAdvancedCapabilities.test.js"
Cohesion: 0.12
Nodes (27): broadcastDiscrepancyAlerts(), clearUserConversationContext(), escapeRegex(), findFuelByKey(), findStationById(), formatDiscrepancyAlertMessage(), formatFeedbackListMessage(), formatPreciosCompetenciaMessage() (+19 more)

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
Nodes (35): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), conversationalAiService, crypto, DEFAULT_AI_SUGGESTIONS, express, getConsolidadoVentasSafe() (+27 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegramBotService.js"
Cohesion: 0.09
Nodes (39): { authenticateToken, requirePermission }, crypto, express, {
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
    setRuntimeGeminiApiKey
}, { getDb }, {
    getHealthDiagnostics,
    getErrors,
    clearErrors
}, router, { sendSafeError } (+31 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.13
Nodes (22): configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getDb(), getExternalDb(), initDB() (+14 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "sendSafeError"
Cohesion: 0.06
Nodes (33): { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission }, catalogosViewPerms (+25 more)

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.14
Nodes (9): ErrorBoundary, copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError() (+1 more)

### Community 64 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 65 - "tasks.js"
Cohesion: 0.20
Nodes (8): { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, hasTaskManagePermission(), router, { sendSafeError }, taskPerms

### Community 66 - "useToast"
Cohesion: 0.10
Nodes (38): ESTRATEGIA_TABS, EstrategiaNav(), AGENT_PLATFORMS, AI_EXECUTION_MODES, ToastContext, useToast(), CorteTiendaModal(), moneyFmt() (+30 more)

### Community 67 - "finanzasCrecimiento.test.js"
Cohesion: 0.09
Nodes (16): { authenticateToken, requirePermission, isAdminUser }, crecimientoManagePerms, crecimientoViewPerms, express, growthService, router, { sendSafeError }, assert (+8 more)

### Community 68 - "Cheques.jsx"
Cohesion: 0.25
Nodes (14): CheckPdfService, DesignerService, Cheques(), ImpresionCheques(), CENTENAS, DECENAS, formatearFechaEnLetras(), formatearFechaEnLetrasCorta() (+6 more)

### Community 69 - "conversationalAiService.js"
Cohesion: 0.16
Nodes (17): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), conversationHistory, getActiveConversationsCount(), { getConsolidadoVentasData }, { getDb } (+9 more)

### Community 70 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "NotificationContext.jsx"
Cohesion: 0.27
Nodes (9): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast(), NotificationContext, NotificationProvider(), useNotifications(), getAudioContext() (+1 more)

### Community 74 - "autoSyncScheduler.js"
Cohesion: 0.17
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+4 more)

### Community 75 - "solarEnergyService.js"
Cohesion: 0.25
Nodes (17): buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario(), getSolarAhorroMensual() (+9 more)

### Community 76 - "energyLatamService.js"
Cohesion: 0.21
Nodes (14): checkPortalStatus(), fs, { getDb, withRetry }, getPortalCredentials(), launchBrowser(), normalizeEstacion(), normalizeEstado(), path (+6 more)

### Community 77 - "telegramPerformance.test.js"
Cohesion: 0.14
Nodes (10): clearSolarCache(), solarMemoryCache, queryMemoryCache, assert, axios, { describe, it, beforeEach, afterEach }, router, {
    saasMemoryCache,
    getCachedSaas,
    setCachedSaas,
    clearSaasCache
} (+2 more)

### Community 78 - "telegramAlerts.test.js"
Cohesion: 0.20
Nodes (7): assert, axios, { describe, it, beforeEach, afterEach }, {
    formatDiscrepancyAlertMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert
}, jwt, { JWT_SECRET }, telegramRouter

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "paymentNotifier.js"
Cohesion: 0.23
Nodes (13): buildPaymentEmailHtml(), cron, formatCurrency(), formatSpanishDate(), { getDb, getExternalDb }, getDuePayments(), initPaymentScheduler(), nodemailer (+5 more)

### Community 82 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

### Community 83 - "operacionesPedidos.test.js"
Cohesion: 0.25
Nodes (7): buildEstacionFilterClause(), calculateHasMore(), parsePedidosPagination(), assert, { describe, it }, { normalizeEstacion, getPortalCredentials, savePortalCredentials }, { parsePedidosPagination, calculateHasMore, buildEstacionFilterClause }

### Community 84 - "CommandPalette.jsx"
Cohesion: 0.46
Nodes (6): CommandPalette(), TICKET_KEYWORDS, useTickets(), copyTextToClipboard(), evaluateSafeMath(), evaluateSafeMathNumeric()

### Community 85 - "config.js"
Cohesion: 0.18
Nodes (9): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+1 more)

### Community 86 - "TicketDetailModal.jsx"
Cohesion: 0.27
Nodes (8): AGY_STATUS_META, DEFAULT_MODELS, TicketAgyFlowModal(), formatDateTimeLocal(), STATUS_META, TicketDetailModal(), RELEVANCE_STYLES, TicketDiagnosticsPanel()

### Community 87 - "useDesigner.js"
Cohesion: 0.27
Nodes (7): ICON_MAP, snapToGridValue(), useDesigner(), TIPOS_CAMPO, VARIABLES_DISPONIBLES, CheckDesigner(), uuid

### Community 88 - "ticketDiagnostics.js"
Cohesion: 0.53
Nodes (5): initTicketDiagnosticsCollector(), pushBounded(), recordNetworkErrorForTicket(), safeStringify(), state

### Community 89 - "aiGateway.test.js"
Cohesion: 0.20
Nodes (6): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }

### Community 91 - "agregar_nuevo_modulo.md"
Cohesion: 0.50
Nodes (3): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 815 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `useToast` to `Modal`, `lazyPages.js`, `frontend/package.json`, `Cheques.jsx`, `QuickTicketModal.jsx`, `NotificationContext.jsx`, `ReportPreviewModal`, `navigation.js`, `SupportTickets.jsx`, `DesignerView.jsx`, `FinanzasInversiones.jsx`, `themeUtils.js`, `CommandPalette.jsx`, `TicketDetailModal.jsx`, `useDesigner.js`, `TicketContext.jsx`, `FinanzasPrestamos.jsx`, `errorDiagnostics.js`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._
- **Why does `getDb()` connect `db.js` to `server.js`, `operaciones.js`, `consultas.js`, `middleware/auth.js`, `withRetry`, `birthdayNotifier.js`, `finanzas.js`, `rrhh.test.js`, `checkDesigner.js`, `bancos.js`, `businessGrowthAgyService.js`, `sync-dgehm-direct.js`, `inteligencia.js`, `dgehmService.js`, `telegramAuditorService.js`, `telegramBotService.js`, `sendSafeError`, `conciliacion.js`, `tasks.js`, `conversationalAiService.js`, `autoSyncScheduler.js`, `solarEnergyService.js`, `energyLatamService.js`, `paymentNotifier.js`, `middleware/bitacora.js`, `config.js`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11697965571205007 - nodes in this community are weakly interconnected._
- **Why does `express` connect `sendSafeError` to `conciliacion.js`, `tasks.js`, `finanzasCrecimiento.test.js`, `server.js`, `inteligencia.js`, `consultas.js`, `middleware/auth.js`, `operaciones.js`, `githubChanges.js`, `backend/package.json`, `onedrive.js`, `config.js`, `ai.js`, `finanzas.js`, `telegramBotService.js`, `checkDesigner.js`, `bancos.js`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._