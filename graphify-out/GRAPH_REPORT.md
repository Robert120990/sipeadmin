# Graph Report - SIPEOFI  (2026-10-29)

## Corpus Check
- 232 files · ~541,125 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 1769 nodes · 4888 edges · 89 communities (82 shown, 7 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 292 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d2b408ef`
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
- telegramBotService.js
- ref_node_assert
- date.js
- ticketService.js
- SupportTickets.jsx
- DesignerView.jsx
- authorization.test.js
- dependencies
- githubChanges.js
- themeUtils.js
- withRetry
- backend/package.json
- config.js
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
- telegramVisionAndPdf.test.js
- inteligencia.js
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
- telegram.js
- Reglas de Git, Commits y Sincronización Remota
- devDependencies
- db.js
- scripts
- sendSafeError
- errorDiagnostics.js
- conciliacion.js
- tasks.js
- react
- finanzasCrecimiento.test.js
- useToast
- conversationalAiService.js
- webhook-server.js
- salesHourlyService.js
- FinanzasCrecimiento.jsx
- sync_portal_pedidos.sh
- autoSyncScheduler.js
- solarEnergyService.js
- energyLatamService.js
- telegramPerformance.test.js
- telegramAlerts.test.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- finanzasCrecimiento.js
- middleware/bitacora.js
- operacionesPedidos.test.js
- CommandPalette.jsx
- DesignCanvas.jsx
- catalogos.js
- AsistenteIA.jsx
- ticketDiagnostics.js

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 123 edges
2. `react` - 96 edges
3. `getDb()` - 85 edges
4. `lucide-react` - 81 edges
5. `App()` - 65 edges
6. `Modal()` - 64 edges
7. `DashboardLayout()` - 63 edges
8. `api` - 59 edges
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
Nodes (35): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), PrintEngine, Carriers() (+27 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.06
Nodes (98): Frontend Conventions, Responsive / Mobile, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login (+90 more)

### Community 2 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.19
Nodes (39): handleAiQuery(), escapeHtml(), formatAlertasMessage(), formatAndelsaCostosMessage(), formatAndelsaCxcMessage(), formatAndelsaFinanzasResumenMessage(), formatAndelsaInventarioMessage(), formatAndelsaVentasClienteMessage() (+31 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.11
Nodes (18): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+10 more)

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
Cohesion: 0.09
Nodes (26): authenticateToken(), isUserRevoked(), jwt, requirePermission(), requireRole(), restoreUser(), revokedUsers, revokeUser() (+18 more)

### Community 8 - "telegramBotService.js"
Cohesion: 0.12
Nodes (41): getDb(), learnAlias(), analyzeTelegramImageReceipt(), axios, BANK_NAME_MAP, broadcastCustomAlert(), broadcastDiscrepancyAlerts(), buildAndSendTopicPdf() (+33 more)

### Community 9 - "ref_node_assert"
Cohesion: 0.11
Nodes (10): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService (+2 more)

### Community 10 - "date.js"
Cohesion: 0.31
Nodes (15): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ConsultasCumpleanos(), Dashboard(), addMonthsPreservingDay(), dateFromParts() (+7 more)

### Community 11 - "ticketService.js"
Cohesion: 0.08
Nodes (51): acknowledgeResolution(), addTicketMessage(), approveAndGeneratePlan(), autoTriageTicketsForAi(), buildAgyPlanApprovalKeyboard(), buildAiPromptPackage(), buildInteractiveTicketKeyboard(), computeDiagnosticRelevance() (+43 more)

### Community 12 - "SupportTickets.jsx"
Cohesion: 0.21
Nodes (7): TicketFiltersBar(), TicketSummaryCards(), formatDateTime(), PRIORITY_STYLES, STATUS_CONFIG, SupportTickets(), TYPE_LABELS

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
Cohesion: 0.17
Nodes (27): getAccountingDb(), withRetry(), withTransaction(), { getDb, getAccountingDb, withRetry }, getFlujoCajaProyectado(), { getAccountingDb, withRetry }, getRentabilidadPorEstacion(), anularPagoPlanilla() (+19 more)

### Community 19 - "backend/package.json"
Cohesion: 0.09
Nodes (21): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+13 more)

### Community 20 - "config.js"
Cohesion: 0.07
Nodes (35): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+27 more)

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
Nodes (32): autoBuildKnowledgeFromEcosystem(), calculatePMT(), detectLocalAgyBinary(), ensureCrecimientoSchema(), { execFileSync, spawn }, executeAgyServerPlan(), extractHeuristicKnowledgeFromText(), findSmartRepoFiles() (+24 more)

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
Cohesion: 0.11
Nodes (21): askGeminiAssistant(), ensureTelegramConfigSchema(), getGeminiApiKey(), getGeminiApiKeyCandidates(), getSiblingEnvGeminiKeys(), isRunningNodeTests(), sanitizeAudioMimeType(), sanitizeGeminiApiKey() (+13 more)

### Community 37 - "inteligencia.js"
Cohesion: 0.11
Nodes (24): { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente }, { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas }, router (+16 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.21
Nodes (11): getPuppeteer(), cleanNum(), fetchDgehmPrices(), fs, getPuppeteer(), normalizeName(), path, syncDgehmWithDatabase() (+3 more)

### Community 39 - "TicketContext.jsx"
Cohesion: 0.17
Nodes (9): QuickTicketModal(), COLORS, drawShape(), ScreenshotAnnotatorModal(), TOOLS, TicketResolvedModal(), TicketContext, collectTicketDiagnosticsSnapshot() (+1 more)

### Community 40 - "ReportPreviewModal"
Cohesion: 0.13
Nodes (29): ReportPreviewModal(), ConsultaCambiosGithub(), formatDateTime(), formatRelativeTime(), TYPE_CONFIG, Consultas(), ConsultasPreciosCompetencia(), ControlRecordatorios() (+21 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.13
Nodes (30): maskToken(), askConversationalAgent(), getGeminiApiKey(), activeUsers, checkDatabasesHealth(), checkFeedbackMetrics(), clearErrors(), errorBuffer (+22 more)

### Community 43 - "telegramAdvancedCapabilities.test.js"
Cohesion: 0.13
Nodes (21): clearUserConversationContext(), escapeRegex(), findFuelByKey(), findStationById(), formatFeedbackListMessage(), formatYMD(), normalizeText(), parseNaturalLanguageQuery() (+13 more)

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
Cohesion: 0.07
Nodes (31): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), conversationalAiService, crypto, DEFAULT_AI_SUGGESTIONS, express, getConsolidadoVentasSafe() (+23 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegram.js"
Cohesion: 0.13
Nodes (21): { authenticateToken, requirePermission }, crypto, express, {
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
}, router, { sendSafeError } (+13 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.12
Nodes (19): configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getExternalDb(), initDB(), mysql (+11 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "sendSafeError"
Cohesion: 0.07
Nodes (28): handleSchemaContext(), { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission } (+20 more)

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.14
Nodes (9): ErrorBoundary, copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError() (+1 more)

### Community 64 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 65 - "tasks.js"
Cohesion: 0.12
Nodes (14): isAdminUser(), { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, hasTaskManagePermission(), router, { sendSafeError } (+6 more)

### Community 66 - "react"
Cohesion: 0.12
Nodes (25): ESTRATEGIA_TABS, EstrategiaNav(), PRIORITIES, TYPES, AGY_STATUS_META, DEFAULT_MODELS, TicketAgyFlowModal(), AGENT_PLATFORMS (+17 more)

### Community 67 - "finanzasCrecimiento.test.js"
Cohesion: 0.09
Nodes (15): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }, assert, crecimientoRouter (+7 more)

### Community 68 - "useToast"
Cohesion: 0.13
Nodes (22): TicketAiBundleModal(), useToast(), CorteTiendaModal(), moneyFmt(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal() (+14 more)

### Community 69 - "conversationalAiService.js"
Cohesion: 0.17
Nodes (14): appendToHistory(), cleanExpiredSessions(), clearConversation(), conversationHistory, getActiveConversationsCount(), { getConsolidadoVentasData }, { getDb }, getFormattedHistory() (+6 more)

### Community 70 - "webhook-server.js"
Cohesion: 0.11
Nodes (13): { execSync }, path, parts, pkg, pkgPath, { readFileSync }, crypto, { exec } (+5 more)

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "FinanzasCrecimiento.jsx"
Cohesion: 0.20
Nodes (10): NotificationContext, AGY_STATE_BADGES, FinanzasCrecimiento(), formatUSD(), ORIGEN_LABELS, QUICK_PROMPTS, SafeMarkdownView(), CATEGORIAS (+2 more)

### Community 74 - "autoSyncScheduler.js"
Cohesion: 0.17
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+4 more)

### Community 75 - "solarEnergyService.js"
Cohesion: 0.24
Nodes (18): buildEnterpriseGrowthSnapshot(), buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario() (+10 more)

### Community 76 - "energyLatamService.js"
Cohesion: 0.21
Nodes (14): checkPortalStatus(), fs, { getDb, withRetry }, getPortalCredentials(), launchBrowser(), normalizeEstacion(), normalizeEstado(), path (+6 more)

### Community 77 - "telegramPerformance.test.js"
Cohesion: 0.13
Nodes (11): clearSolarCache(), solarMemoryCache, clearQueryCache(), queryMemoryCache, assert, axios, { describe, it, beforeEach, afterEach }, router (+3 more)

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

### Community 81 - "finanzasCrecimiento.js"
Cohesion: 0.25
Nodes (7): { authenticateToken, requirePermission, isAdminUser }, crecimientoManagePerms, crecimientoViewPerms, express, growthService, router, { sendSafeError }

### Community 82 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

### Community 83 - "operacionesPedidos.test.js"
Cohesion: 0.25
Nodes (7): buildEstacionFilterClause(), calculateHasMore(), parsePedidosPagination(), assert, { describe, it }, { normalizeEstacion, getPortalCredentials, savePortalCredentials }, { parsePedidosPagination, calculateHasMore, buildEstacionFilterClause }

### Community 84 - "CommandPalette.jsx"
Cohesion: 0.46
Nodes (6): CommandPalette(), TICKET_KEYWORDS, useTickets(), copyTextToClipboard(), evaluateSafeMath(), evaluateSafeMathNumeric()

### Community 85 - "DesignCanvas.jsx"
Cohesion: 0.67
Nodes (3): applySnap(), DesignCanvas(), react-konva

### Community 86 - "catalogos.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, catalogosViewPerms, express, { getDb }, router, { sendSafeError }

### Community 87 - "AsistenteIA.jsx"
Cohesion: 0.52
Nodes (6): AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText()

### Community 88 - "ticketDiagnostics.js"
Cohesion: 0.53
Nodes (5): initTicketDiagnosticsCollector(), pushBounded(), recordNetworkErrorForTicket(), safeStringify(), state

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 804 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `telegramBotService.js` to `handleSmartNaturalLanguageQuery`, `server.js`, `operaciones.js`, `consultas.js`, `middleware/auth.js`, `withRetry`, `config.js`, `finanzas.js`, `rrhh.test.js`, `checkDesigner.js`, `bancos.js`, `businessGrowthAgyService.js`, `sync-dgehm-direct.js`, `telegramVisionAndPdf.test.js`, `inteligencia.js`, `dgehmService.js`, `telegramAuditorService.js`, `telegram.js`, `db.js`, `sendSafeError`, `conciliacion.js`, `tasks.js`, `conversationalAiService.js`, `autoSyncScheduler.js`, `solarEnergyService.js`, `energyLatamService.js`, `middleware/bitacora.js`, `catalogos.js`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.1292517006802721 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `Modal`, `lazyPages.js`, `frontend/package.json`, `useToast`, `TicketContext.jsx`, `ReportPreviewModal`, `FinanzasCrecimiento.jsx`, `date.js`, `SupportTickets.jsx`, `DesignerView.jsx`, `FinanzasInversiones.jsx`, `themeUtils.js`, `CommandPalette.jsx`, `DesignCanvas.jsx`, `AsistenteIA.jsx`, `FinanzasPrestamos.jsx`, `errorDiagnostics.js`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.058944374209860935 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `middleware/auth.js` to `conciliacion.js`, `tasks.js`, `server.js`, `inteligencia.js`, `consultas.js`, `operaciones.js`, `githubChanges.js`, `finanzasCrecimiento.js`, `middleware/bitacora.js`, `checkDesigner.js`, `config.js`, `catalogos.js`, `ai.js`, `finanzas.js`, `onedrive.js`, `telegram.js`, `sendSafeError`, `bancos.js`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._