# Graph Report - SIPEOFI  (2026-10-19)

## Corpus Check
- 228 files · ~515,949 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 1681 nodes · 4637 edges · 85 communities (78 shown, 7 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 271 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ce97b971`
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
- auth.test.js
- getDb
- ref_node_assert
- date.js
- ticketService.js
- inteligencia.js
- DesignCanvas.jsx
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
- energyLatamService.js
- conciliacion.js
- bancos.js
- cheques.js
- ref_path
- sync-dgehm-direct.js
- scripts
- telegramVisionAndPdf.test.js
- routes/auth.js
- dgehmService.js
- TicketContext.jsx
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
- react
- middleware/auth.js
- lucide-react
- DashboardLayout.jsx
- useToast
- deploy.js
- Cheques.jsx
- salesHourlyService.js
- FinanzasPrestamos.jsx
- sync_portal_pedidos.sh
- autoSyncScheduler.js
- solarEnergyService.js
- telegramPerformance.test.js
- NotificationContext.jsx
- config.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- operacionesPedidos.test.js
- CommandPalette.jsx
- generate-guide-pdf.js
- creditRiskService.js

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 121 edges
2. `react` - 95 edges
3. `getDb()` - 90 edges
4. `lucide-react` - 80 edges
5. `App()` - 64 edges
6. `Modal()` - 62 edges
7. `DashboardLayout()` - 62 edges
8. `api` - 58 edges
9. `withRetry()` - 54 edges
10. `handleIncomingMessage()` - 52 edges

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

## Communities (85 total, 7 thin omitted)

### Community 0 - "Modal"
Cohesion: 0.14
Nodes (29): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), Carriers(), ChequesContado() (+21 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.12
Nodes (57): Frontend Conventions, App(), DashboardLayout, Login, ConfirmProvider(), ToastProvider(), DashboardLayout(), AsistenteIA (+49 more)

### Community 2 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.18
Nodes (37): handleAiQuery(), escapeHtml(), formatAlertasMessage(), formatAndelsaCostosMessage(), formatAndelsaCxcMessage(), formatAndelsaFinanzasResumenMessage(), formatAndelsaInventarioMessage(), formatAndelsaVentasClienteMessage() (+29 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.12
Nodes (16): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+8 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (50): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, JWT_SECRET, isUserRevoked }, authRoutes, { autoLogMiddleware } (+42 more)

### Community 5 - "operaciones.js"
Cohesion: 0.09
Nodes (21): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, crypto, energiaSolarViewPerms, energyLatamService, express, fetchPromedios(), fetchTankReadings() (+13 more)

### Community 6 - "consultas.js"
Cohesion: 0.07
Nodes (42): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, branchToEmpId, cierreViewPerms, crypto, cumpleanosViewPerms, diferenciasViewPerms, express (+34 more)

### Community 7 - "auth.test.js"
Cohesion: 0.14
Nodes (13): Bitácora (Audit Log), restoreUser(), revokeUser(), autoLogMiddleware(), { getDb }, logAction(), sanitizeData(), assert (+5 more)

### Community 8 - "getDb"
Cohesion: 0.21
Nodes (24): getDb(), learnAlias(), broadcastCustomAlert(), buildAndSendTopicPdf(), createFeedbackEntry(), generateExecutiveReportPdf(), getCachedQuery(), getConsolidadoVentas() (+16 more)

### Community 9 - "ref_node_assert"
Cohesion: 0.11
Nodes (10): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService (+2 more)

### Community 10 - "date.js"
Cohesion: 0.31
Nodes (15): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ConsultasCumpleanos(), Dashboard(), addMonthsPreservingDay(), dateFromParts() (+7 more)

### Community 11 - "ticketService.js"
Cohesion: 0.08
Nodes (45): acknowledgeResolution(), addTicketMessage(), approveAndGeneratePlan(), autoTriageTicketsForAi(), buildAiPromptPackage(), computeDiagnosticRelevance(), createAndEmitAdminNotification(), createTicket() (+37 more)

### Community 12 - "inteligencia.js"
Cohesion: 0.10
Nodes (24): { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente }, { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas }, router (+16 more)

### Community 13 - "DesignCanvas.jsx"
Cohesion: 0.67
Nodes (3): applySnap(), DesignCanvas(), react-konva

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
Cohesion: 0.20
Nodes (25): getAccountingDb(), withRetry(), withTransaction(), anularPagoPlanilla(), drawReciboSection(), exportBancario(), formatCurrency(), formatFechaHora() (+17 more)

### Community 19 - "backend/package.json"
Cohesion: 0.09
Nodes (21): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+13 more)

### Community 20 - "paymentNotifier.js"
Cohesion: 0.11
Nodes (25): buildBirthdayEmailHtml(), cron, formatSpanishDate(), { getDb, getAccountingDb }, getTodaysBirthdays(), initBirthdayScheduler(), nodemailer, sendBirthdayNotification() (+17 more)

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
Cohesion: 0.17
Nodes (8): __dirname, parts, pkg, pkgPath, __dirname, pkg, vite, @vitejs/plugin-react

### Community 26 - "generate-icons.cjs"
Cohesion: 0.16
Nodes (11): BG, chunk(), crc32(), CRC_TABLE, fs, OUT_DIR, path, S_ROWS (+3 more)

### Community 27 - "AGENTS.md"
Cohesion: 0.07
Nodes (25): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+17 more)

### Community 28 - "rrhh.test.js"
Cohesion: 0.20
Nodes (10): assert, { getDb, getAccountingDb }, { numberToWords }, rhPlanillaService, { test, describe, after }, CENTENAS, DECENAS, numberToWords() (+2 more)

### Community 29 - "energyLatamService.js"
Cohesion: 0.21
Nodes (14): checkPortalStatus(), fs, { getDb, withRetry }, getPortalCredentials(), launchBrowser(), normalizeEstacion(), normalizeEstado(), path (+6 more)

### Community 30 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 31 - "bancos.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }

### Community 32 - "cheques.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction }, router, { sendSafeError }

### Community 33 - "ref_path"
Cohesion: 0.10
Nodes (11): dbConfig, dotenv, mysql, path, mysql, path, mysql, path (+3 more)

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.18
Nodes (10): axios, dotenv, ensureLogDir(), fs, { getDb }, https, logFile, path (+2 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "telegramVisionAndPdf.test.js"
Cohesion: 0.14
Nodes (15): analyzeTelegramImageReceipt(), askGeminiAssistant(), getGeminiApiKey(), sanitizeAudioMimeType(), transcribeTelegramVoice(), {
    analyzeTelegramImageReceipt,
    verifyReceiptInBankMovements,
    formatReceiptAnalysisMessage,
    generateExecutiveReportPdf,
    sendTelegramDocument,
    handleIncomingMessage,
    handleCallbackQuery
}, assert, axios (+7 more)

### Community 37 - "routes/auth.js"
Cohesion: 0.07
Nodes (22): { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser }, bcrypt, express, { getDb }, jwt, router, { sendSafeError }, withRetry() (+14 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.21
Nodes (11): getPuppeteer(), cleanNum(), fetchDgehmPrices(), fs, getPuppeteer(), normalizeName(), path, syncDgehmWithDatabase() (+3 more)

### Community 39 - "TicketContext.jsx"
Cohesion: 0.07
Nodes (33): PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal(), TOOLS, AGY_STATUS_META (+25 more)

### Community 40 - "ReportPreviewModal"
Cohesion: 0.13
Nodes (32): ReportPreviewModal(), AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText(), ConsultaCambiosGithub() (+24 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.08
Nodes (43): maskToken(), appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), conversationHistory, getActiveConversationsCount(), { getConsolidadoVentasData } (+35 more)

### Community 43 - "telegramAdvancedCapabilities.test.js"
Cohesion: 0.13
Nodes (24): broadcastDiscrepancyAlerts(), clearUserConversationContext(), escapeRegex(), findFuelByKey(), findStationById(), formatDiscrepancyAlertMessage(), formatFeedbackListMessage(), formatYMD() (+16 more)

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
Cohesion: 0.07
Nodes (31): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), conversationalAiService, crypto, DEFAULT_AI_SUGGESTIONS, express, getConsolidadoVentasSafe() (+23 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegramBotService.js"
Cohesion: 0.09
Nodes (35): { authenticateToken, requirePermission }, crypto, express, {
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
    getTelegramWebhookInfo
}, { getDb }, {
    getHealthDiagnostics,
    getErrors,
    clearErrors
}, router, { sendSafeError } (+27 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.12
Nodes (18): configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getExternalDb(), initDB(), mysql (+10 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "sendSafeError"
Cohesion: 0.08
Nodes (27): handleSchemaContext(), { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission } (+19 more)

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.09
Nodes (17): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, PermissionRoute(), ProtectedRoute(), ErrorBoundary, getStoredToken(), getStoredUser() (+9 more)

### Community 64 - "react"
Cohesion: 0.12
Nodes (17): PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox(), CalibrationDialog(), Preview() (+9 more)

### Community 65 - "middleware/auth.js"
Cohesion: 0.08
Nodes (30): authenticateToken(), isAdminUser(), isUserRevoked(), jwt, requirePermission(), requireRole(), revokedUsers, syncRevokedUsersFromDb() (+22 more)

### Community 66 - "lucide-react"
Cohesion: 0.20
Nodes (15): ESTRATEGIA_TABS, EstrategiaNav(), AGENT_PLATFORMS, AI_EXECUTION_MODES, TicketAiBundleModal(), ToastContext, EstrategiaCombustible(), EstrategiaCreditos() (+7 more)

### Community 67 - "DashboardLayout.jsx"
Cohesion: 0.11
Nodes (23): Responsive / Mobile, ColorIcon(), createColorIcon(), ICON_ALIASES, LoadingFallback(), bundledCollections, allNavCategories, bancosMenu (+15 more)

### Community 68 - "useToast"
Cohesion: 0.13
Nodes (21): useToast(), CorteTiendaModal(), moneyFmt(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt() (+13 more)

### Community 69 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 70 - "Cheques.jsx"
Cohesion: 0.21
Nodes (14): CheckPdfService, DesignerService, PrintEngine, Cheques(), ImpresionCheques(), CENTENAS, DECENAS, formatearFechaEnLetras() (+6 more)

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "FinanzasPrestamos.jsx"
Cohesion: 0.29
Nodes (16): FinanzasAsesor(), FinanzasCalculadora(), FinanzasPrestamos(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings(), calculatePMT() (+8 more)

### Community 74 - "autoSyncScheduler.js"
Cohesion: 0.16
Nodes (13): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+5 more)

### Community 75 - "solarEnergyService.js"
Cohesion: 0.25
Nodes (17): buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario(), getSolarAhorroMensual() (+9 more)

### Community 76 - "telegramPerformance.test.js"
Cohesion: 0.12
Nodes (12): clearSolarCache(), solarMemoryCache, saasMemoryCache, clearQueryCache(), queryMemoryCache, assert, axios, { describe, it, beforeEach, afterEach } (+4 more)

### Community 77 - "NotificationContext.jsx"
Cohesion: 0.27
Nodes (9): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast(), NotificationContext, NotificationProvider(), useNotifications(), getAudioContext() (+1 more)

### Community 78 - "config.js"
Cohesion: 0.18
Nodes (9): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+1 more)

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "operacionesPedidos.test.js"
Cohesion: 0.25
Nodes (7): buildEstacionFilterClause(), calculateHasMore(), parsePedidosPagination(), assert, { describe, it }, { normalizeEstacion, getPortalCredentials, savePortalCredentials }, { parsePedidosPagination, calculateHasMore, buildEstacionFilterClause }

### Community 82 - "CommandPalette.jsx"
Cohesion: 0.53
Nodes (4): CommandPalette(), TICKET_KEYWORDS, useTickets(), evaluateSafeMath()

### Community 83 - "generate-guide-pdf.js"
Cohesion: 0.40
Nodes (3): fs, path, puppeteer

### Community 84 - "creditRiskService.js"
Cohesion: 0.50
Nodes (4): calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), getRiesgoCreditoFlotas()

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 764 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `getDb` to `server.js`, `operaciones.js`, `consultas.js`, `auth.test.js`, `ticketService.js`, `inteligencia.js`, `withRetry`, `paymentNotifier.js`, `finanzas.js`, `rrhh.test.js`, `energyLatamService.js`, `conciliacion.js`, `bancos.js`, `cheques.js`, `sync-dgehm-direct.js`, `telegramVisionAndPdf.test.js`, `routes/auth.js`, `dgehmService.js`, `telegramAuditorService.js`, `telegramAdvancedCapabilities.test.js`, `telegramBotService.js`, `db.js`, `sendSafeError`, `middleware/auth.js`, `autoSyncScheduler.js`, `solarEnergyService.js`, `config.js`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.1391304347826087 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `Modal`, `lazyPages.js`, `lucide-react`, `DashboardLayout.jsx`, `frontend/package.json`, `useToast`, `Cheques.jsx`, `TicketContext.jsx`, `ReportPreviewModal`, `FinanzasPrestamos.jsx`, `date.js`, `NotificationContext.jsx`, `DesignCanvas.jsx`, `FinanzasInversiones.jsx`, `themeUtils.js`, `CommandPalette.jsx`, `errorDiagnostics.js`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12390414962010521 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `middleware/auth.js` to `cheques.js`, `server.js`, `routes/auth.js`, `consultas.js`, `auth.test.js`, `operaciones.js`, `inteligencia.js`, `config.js`, `githubChanges.js`, `onedrive.js`, `ai.js`, `conciliacion.js`, `finanzas.js`, `telegramBotService.js`, `sendSafeError`, `bancos.js`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._