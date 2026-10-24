# Graph Report - SIPEOFI  (2026-10-24)

## Corpus Check
- 228 files · ~520,806 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 1704 nodes · 4706 edges · 89 communities (82 shown, 7 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 275 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `40218397`
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
- broadcastDiscrepancyAlerts
- ref_node_assert
- Dashboard.jsx
- ticketService.js
- SupportTickets.jsx
- DesignerView.jsx
- authorization.test.js
- dependencies
- githubChanges.js
- themeUtils.js
- withRetry
- backend/package.json
- paymentNotifier.js
- 5. Resumen de Módulos y Tablas Principales
- finanzas.js
- onedrive.js
- backup-db.js
- ref_fs
- generate-icons.cjs
- AGENTS.md
- rrhh.test.js
- FinanzasPrestamos.jsx
- authenticateToken
- bancos.js
- cheques.js
- ref_path
- sync-dgehm-direct.js
- scripts
- handleIncomingMessage
- birthdayNotifier.js
- dgehmService.js
- TicketContext.jsx
- ReportPreviewModal
- scripts
- telegramAuditorService.js
- telegramBotService.js
- dependencies
- telegramPerformance.test.js
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
- sendSafeError
- errorDiagnostics.js
- conciliacion.js
- tasks.js
- useToast
- DashboardLayout.jsx
- VentasEstaciones.jsx
- deploy.js
- webhook-server.js
- salesHourlyService.js
- ConsultasPreciosCompetencia.jsx
- sync_portal_pedidos.sh
- autoSyncScheduler.js
- solarEnergyService.js
- 20260814_create_check_format_tables.js
- NotificationBell.jsx
- config.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- andelsaTelegramBot.test.js
- middleware/bitacora.js
- PermissionRoute
- getPuppeteer
- DesignCanvas.jsx
- NotificationProvider
- Frontend Conventions
- devDependencies

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 121 edges
2. `react` - 95 edges
3. `getDb()` - 83 edges
4. `lucide-react` - 80 edges
5. `App()` - 64 edges
6. `Modal()` - 62 edges
7. `DashboardLayout()` - 62 edges
8. `api` - 58 edges
9. `withRetry()` - 54 edges
10. `handleIncomingMessage()` - 53 edges

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

## Communities (89 total, 7 thin omitted)

### Community 0 - "Modal"
Cohesion: 0.13
Nodes (36): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), PrintEngine, Carriers() (+28 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.13
Nodes (54): App(), DashboardLayout, Login, DashboardLayout(), AsistenteIA, BackupDBCheck, Bitacora, Carriers (+46 more)

### Community 2 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.20
Nodes (35): handleAiQuery(), escapeHtml(), formatAlertasMessage(), formatAndelsaCostosMessage(), formatAndelsaCxcMessage(), formatAndelsaFinanzasResumenMessage(), formatAndelsaInventarioMessage(), formatAndelsaVentasClienteMessage() (+27 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.10
Nodes (19): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+11 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (51): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, JWT_SECRET, isUserRevoked }, authRoutes, { autoLogMiddleware } (+43 more)

### Community 5 - "operaciones.js"
Cohesion: 0.06
Nodes (43): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, buildEstacionFilterClause(), calculateHasMore(), crypto, energiaSolarViewPerms, energyLatamService, express (+35 more)

### Community 6 - "consultas.js"
Cohesion: 0.07
Nodes (44): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, branchToEmpId, cierreViewPerms, crypto, cumpleanosViewPerms, diferenciasViewPerms, express (+36 more)

### Community 7 - "middleware/auth.js"
Cohesion: 0.05
Nodes (34): jwt, requireRole(), restoreUser(), revokedUsers, revokeUser(), { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser }, bcrypt, express (+26 more)

### Community 8 - "broadcastDiscrepancyAlerts"
Cohesion: 0.23
Nodes (16): broadcastCustomAlert(), broadcastDiscrepancyAlerts(), buildAndSendTopicPdf(), formatDiscrepancyAlertMessage(), generateExecutiveReportPdf(), getCachedQuery(), getConsolidadoVentas(), getDateStr() (+8 more)

### Community 9 - "ref_node_assert"
Cohesion: 0.11
Nodes (10): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService (+2 more)

### Community 10 - "Dashboard.jsx"
Cohesion: 0.31
Nodes (13): CalendarGrid(), DAYS, getStatusColor(), MONTHS, Dashboard(), addMonthsPreservingDay(), dateFromParts(), dateOnlyToDate() (+5 more)

### Community 11 - "ticketService.js"
Cohesion: 0.08
Nodes (51): acknowledgeResolution(), addTicketMessage(), approveAndGeneratePlan(), autoTriageTicketsForAi(), buildAgyPlanApprovalKeyboard(), buildAiPromptPackage(), buildInteractiveTicketKeyboard(), computeDiagnosticRelevance() (+43 more)

### Community 12 - "SupportTickets.jsx"
Cohesion: 0.15
Nodes (14): CommandPalette(), TICKET_KEYWORDS, TicketAiBundleModal(), TicketFiltersBar(), TicketSummaryCards(), useTickets(), formatDateTime(), PRIORITY_STYLES (+6 more)

### Community 13 - "DesignerView.jsx"
Cohesion: 0.12
Nodes (17): PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox(), CalibrationDialog(), Preview() (+9 more)

### Community 14 - "authorization.test.js"
Cohesion: 0.20
Nodes (5): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }

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
Cohesion: 0.09
Nodes (46): getAccountingDb(), withRetry(), withTransaction(), { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion } (+38 more)

### Community 19 - "backend/package.json"
Cohesion: 0.11
Nodes (18): author, description, axios, eslint, keywords, license, main, name (+10 more)

### Community 20 - "paymentNotifier.js"
Cohesion: 0.23
Nodes (13): buildPaymentEmailHtml(), cron, formatCurrency(), formatSpanishDate(), { getDb, getExternalDb }, getDuePayments(), initPaymentScheduler(), nodemailer (+5 more)

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
Cohesion: 0.17
Nodes (13): BACKUP_DIR, dotenv, executeBackup(), fallbackNodeDump(), fs, getTimestamp(), mysql, path (+5 more)

### Community 25 - "ref_fs"
Cohesion: 0.12
Nodes (11): fs, path, puppeteer, __dirname, parts, pkg, pkgPath, __dirname (+3 more)

### Community 26 - "generate-icons.cjs"
Cohesion: 0.18
Nodes (11): BG, chunk(), crc32(), CRC_TABLE, fs, OUT_DIR, path, S_ROWS (+3 more)

### Community 27 - "AGENTS.md"
Cohesion: 0.07
Nodes (25): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+17 more)

### Community 28 - "rrhh.test.js"
Cohesion: 0.20
Nodes (10): assert, { getDb, getAccountingDb }, { numberToWords }, rhPlanillaService, { test, describe, after }, CENTENAS, DECENAS, numberToWords() (+2 more)

### Community 29 - "FinanzasPrestamos.jsx"
Cohesion: 0.27
Nodes (17): FinanzasCalculadora(), FinanzasPlanesMantenimiento(), FinanzasPrestamos(), calculateTCO(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings() (+9 more)

### Community 30 - "authenticateToken"
Cohesion: 0.17
Nodes (12): authenticateToken(), isUserRevoked(), requirePermission(), syncRevokedUsersFromDb(), { authenticateToken, requirePermission }, checkDesignerPerms, express, { getDb } (+4 more)

### Community 31 - "bancos.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }

### Community 32 - "cheques.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction }, router, { sendSafeError }

### Community 33 - "ref_path"
Cohesion: 0.17
Nodes (6): mysql, path, mysql, path, mysql, mysql2

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.20
Nodes (10): axios, dotenv, ensureLogDir(), fs, { getDb }, https, logFile, path (+2 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "handleIncomingMessage"
Cohesion: 0.10
Nodes (28): getGeminiApiKey(), analyzeTelegramImageReceipt(), askGeminiAssistant(), createFeedbackEntry(), formatHelpMessage(), getGeminiApiKey(), getGeminiApiKeyCandidates(), getMainReplyKeyboard() (+20 more)

### Community 37 - "birthdayNotifier.js"
Cohesion: 0.21
Nodes (12): buildBirthdayEmailHtml(), cron, formatSpanishDate(), { getDb, getAccountingDb }, getTodaysBirthdays(), initBirthdayScheduler(), nodemailer, sendBirthdayNotification() (+4 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 39 - "TicketContext.jsx"
Cohesion: 0.13
Nodes (19): PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal(), TOOLS, AGY_STATUS_META (+11 more)

### Community 40 - "ReportPreviewModal"
Cohesion: 0.13
Nodes (34): ReportPreviewModal(), AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText(), ConsultaCambiosGithub() (+26 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.08
Nodes (42): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), conversationHistory, getActiveConversationsCount(), { getConsolidadoVentasData }, { getDb } (+34 more)

### Community 43 - "telegramBotService.js"
Cohesion: 0.11
Nodes (30): axios, BANK_NAME_MAP, clearUserConversationContext(), ensuredTelegramSchemaPools, escapeRegex(), findFuelByKey(), findStationById(), formatFeedbackListMessage() (+22 more)

### Community 44 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, axios, html2canvas, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react (+7 more)

### Community 45 - "telegramPerformance.test.js"
Cohesion: 0.09
Nodes (33): clearSolarCache(), solarMemoryCache, clearSaasCache(), { getAccountingDb, getExternalDb, withRetry }, getAndelsaCostos(), getAndelsaCuentasPorCobrar(), getAndelsaFinanzasResumen(), getAndelsaInventarios() (+25 more)

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
Cohesion: 0.07
Nodes (31): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), conversationalAiService, crypto, DEFAULT_AI_SUGGESTIONS, express, getConsolidadoVentasSafe() (+23 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegram.js"
Cohesion: 0.11
Nodes (28): { authenticateToken, requirePermission }, crypto, express, {
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
}, maskToken(), router (+20 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "getDb"
Cohesion: 0.11
Nodes (26): configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getDb(), getExternalDb(), initDB() (+18 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "sendSafeError"
Cohesion: 0.08
Nodes (27): handleSchemaContext(), { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission } (+19 more)

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.09
Nodes (18): ProtectedRoute(), ErrorBoundary, getStoredToken(), getStoredUser(), clearErrorLogs(), copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport() (+10 more)

### Community 64 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 65 - "tasks.js"
Cohesion: 0.12
Nodes (14): isAdminUser(), { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, hasTaskManagePermission(), router, { sendSafeError } (+6 more)

### Community 66 - "useToast"
Cohesion: 0.15
Nodes (25): ESTRATEGIA_TABS, EstrategiaNav(), AGENT_PLATFORMS, AI_EXECUTION_MODES, ToastContext, useToast(), BackupDBCheck(), Bitacora() (+17 more)

### Community 67 - "DashboardLayout.jsx"
Cohesion: 0.11
Nodes (23): Responsive / Mobile, ColorIcon(), createColorIcon(), ICON_ALIASES, LoadingFallback(), bundledCollections, allNavCategories, bancosMenu (+15 more)

### Community 68 - "VentasEstaciones.jsx"
Cohesion: 0.22
Nodes (12): CorteTiendaModal(), moneyFmt(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt(), numFmt() (+4 more)

### Community 69 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 70 - "webhook-server.js"
Cohesion: 0.20
Nodes (7): crypto, { exec }, http, path, PORT, PROJECT_DIR, server

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "ConsultasPreciosCompetencia.jsx"
Cohesion: 0.31
Nodes (4): NotificationContext, CATEGORIAS, COLUMNS, socket

### Community 74 - "autoSyncScheduler.js"
Cohesion: 0.16
Nodes (13): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+5 more)

### Community 75 - "solarEnergyService.js"
Cohesion: 0.26
Nodes (16): buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario(), getSolarAhorroMensual() (+8 more)

### Community 76 - "20260814_create_check_format_tables.js"
Cohesion: 0.25
Nodes (5): dbConfig, dotenv, mysql, path, dotenv

### Community 77 - "NotificationBell.jsx"
Cohesion: 0.52
Nodes (5): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast(), useNotifications()

### Community 78 - "config.js"
Cohesion: 0.18
Nodes (9): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+1 more)

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "andelsaTelegramBot.test.js"
Cohesion: 0.25
Nodes (7): getAndelsaInlineMarkup(), getSolarInlineMarkup(), assert, { describe, it }, {
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

### Community 82 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

### Community 83 - "PermissionRoute"
Cohesion: 0.40
Nodes (4): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, PermissionRoute()

### Community 84 - "getPuppeteer"
Cohesion: 0.60
Nodes (5): getPuppeteer(), getPuppeteer(), puppeteer, puppeteer-core, @sparticuz/chromium

### Community 85 - "DesignCanvas.jsx"
Cohesion: 0.67
Nodes (3): applySnap(), DesignCanvas(), react-konva

### Community 86 - "NotificationProvider"
Cohesion: 0.67
Nodes (3): NotificationProvider(), getAudioContext(), playNotificationSound()

### Community 87 - "Frontend Conventions"
Cohesion: 0.67
Nodes (3): Frontend Conventions, ConfirmProvider(), ToastProvider()

### Community 88 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, eslint, nodemon

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 771 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `getDb` to `handleSmartNaturalLanguageQuery`, `server.js`, `operaciones.js`, `consultas.js`, `middleware/auth.js`, `broadcastDiscrepancyAlerts`, `withRetry`, `paymentNotifier.js`, `finanzas.js`, `rrhh.test.js`, `authenticateToken`, `bancos.js`, `cheques.js`, `sync-dgehm-direct.js`, `handleIncomingMessage`, `birthdayNotifier.js`, `dgehmService.js`, `telegramAuditorService.js`, `telegramBotService.js`, `telegram.js`, `sendSafeError`, `conciliacion.js`, `tasks.js`, `autoSyncScheduler.js`, `solarEnergyService.js`, `config.js`, `middleware/bitacora.js`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.12753623188405797 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `authenticateToken` to `cheques.js`, `conciliacion.js`, `tasks.js`, `server.js`, `operaciones.js`, `consultas.js`, `middleware/auth.js`, `config.js`, `githubChanges.js`, `middleware/bitacora.js`, `withRetry`, `onedrive.js`, `ai.js`, `finanzas.js`, `telegram.js`, `sendSafeError`, `bancos.js`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13376623376623376 - nodes in this community are weakly interconnected._
- **Why does `react` connect `useToast` to `Modal`, `lazyPages.js`, `DashboardLayout.jsx`, `frontend/package.json`, `VentasEstaciones.jsx`, `TicketContext.jsx`, `ReportPreviewModal`, `ConsultasPreciosCompetencia.jsx`, `Dashboard.jsx`, `SupportTickets.jsx`, `NotificationBell.jsx`, `DesignerView.jsx`, `FinanzasInversiones.jsx`, `themeUtils.js`, `DesignCanvas.jsx`, `AGENTS.md`, `FinanzasPrestamos.jsx`, `errorDiagnostics.js`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._