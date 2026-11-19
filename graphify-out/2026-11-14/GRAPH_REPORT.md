# Graph Report - SIPEOFI  (2026-11-14)

## Corpus Check
- 248 files · ~568,105 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 2009 nodes · 5442 edges · 105 communities (98 shown, 7 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 335 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2621bf15`
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
- operationalIntelligenceV2.test.js
- telegramCompetencia.test.js
- ref_node_assert
- date.js
- ticketService.js
- TicketContext.jsx
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
- DashboardLayout.jsx
- sendSafeError
- businessGrowthAgyService.js
- 20260814_create_check_format_tables.js
- sync-dgehm-direct.js
- scripts
- useToast
- handleSmartNaturalLanguageQuery
- dgehmService.js
- VentasEstaciones.jsx
- lucide-react
- scripts
- telegram.js
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
- authenticateToken
- errorDiagnostics.js
- conciliacion.js
- tasks.js
- inteligencia.js
- middleware/auth.js
- Cheques.jsx
- requirePermission
- deploy.js
- salesHourlyService.js
- NotificationContext.jsx
- sync_portal_pedidos.sh
- autoSyncScheduler.js
- solarEnergyService.js
- energyLatamService.js
- telegramDataService.js
- telegramGeminiService.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- paymentNotifier.js
- telegramTextAndDates.js
- andelsaTelegramBot.test.js
- telegramPerformance.test.js
- operationalAuditService.js
- getConsolidadoVentasData
- useDesigner.js
- Frontend Conventions
- telegramVisionAndPdf.test.js
- ref_path
- architectureAndContracts.test.js
- AsistenteIA.jsx
- consultasCierresRoutes.js
- consultasCompetenciaRoutes.js
- getPuppeteer
- devDependencies
- executiveFlashService.js
- webhook-server.js
- operacionesPedidos.test.js
- telegramVoice.test.js
- EnergiaSolarAndelsa.jsx
- dbBootstrapSeeds.js
- cashflowForecast.js
- getDb

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 127 edges
2. `react` - 97 edges
3. `lucide-react` - 82 edges
4. `App()` - 66 edges
5. `Modal()` - 64 edges
6. `DashboardLayout()` - 64 edges
7. `api` - 60 edges
8. `ReportPreviewModal()` - 58 edges
9. `getDb()` - 56 edges
10. `handleIncomingMessage()` - 56 edges

## Surprising Connections (you probably didn't know these)
- `4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA)` --references--> `getUserEffectivePermissions()`  [INFERRED]
  AGENTS.md → backend/services/telegramBotService.js
- `Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)` --references--> `ReportPreviewModal()`  [INFERRED]
  AGENTS.md → frontend/src/components/ReportPreviewModal.jsx
- `🚀 Arquitectura y Entorno de Producción` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `Bitácora (Audit Log)` --references--> `authenticateToken()`  [INFERRED]
  AGENTS.md → backend/middleware/auth.js
- `Responsive / Mobile` --references--> `Modal()`  [INFERRED]
  AGENTS.md → frontend/src/components/Modal.jsx

## Import Cycles
- None detected.

## Communities (105 total, 7 thin omitted)

### Community 0 - "Modal"
Cohesion: 0.12
Nodes (33): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), Carriers(), ChequesContado() (+25 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.13
Nodes (56): App(), DashboardLayout, Login, DashboardLayout(), AsistenteIA, BackupDBCheck, Bitacora, Carriers (+48 more)

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
Cohesion: 0.04
Nodes (51): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked }, authRoutes, { autoLogMiddleware } (+43 more)

### Community 5 - "operaciones.js"
Cohesion: 0.09
Nodes (22): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, crypto, energiaSolarViewPerms, energyLatamService, express, fetchPromedios(), fetchTankReadings() (+14 more)

### Community 6 - "consultas.js"
Cohesion: 0.13
Nodes (31): { authenticateToken, requirePermission }, dbModule, express, {
    normalizeStationName,
    getResumenMensualData,
    getResumenRangoVentasData,
    getComparativoAnualData
}, { registerConsultasCierresRoutes }, { registerConsultasCompetenciaRoutes }, router, { sendSafeError } (+23 more)

### Community 7 - "operationalIntelligenceV2.test.js"
Cohesion: 0.13
Nodes (18): { branchToEmpId, OFFICIAL_ESTACIONES }, dbModule, getAccountingDb(), getDb(), getElasticidadPreciosCompetencia(), getRentabilidadPorEstacion(), resolveStationEmpCode(), solarEnergyService (+10 more)

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
Cohesion: 0.07
Nodes (20): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService (+12 more)

### Community 10 - "date.js"
Cohesion: 0.28
Nodes (16): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), ConsultasCumpleanos(), Dashboard(), addMonthsPreservingDay() (+8 more)

### Community 11 - "ticketService.js"
Cohesion: 0.08
Nodes (54): acknowledgeResolution(), addTicketMessage(), approveAndGeneratePlan(), autoTriageTicketsForAi(), buildAgyPlanApprovalKeyboard(), buildAiPromptPackage(), buildInteractiveTicketKeyboard(), computeDiagnosticRelevance() (+46 more)

### Community 12 - "TicketContext.jsx"
Cohesion: 0.07
Nodes (35): CommandPalette(), TICKET_KEYWORDS, PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal() (+27 more)

### Community 13 - "DesignerView.jsx"
Cohesion: 0.25
Nodes (10): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, Toolbox(), CalibrationDialog(), Preview() (+2 more)

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
Nodes (28): getAccountingDb(), withRetry(), calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), getRiesgoCreditoFlotas(), anularPagoPlanilla(), drawReciboSection() (+20 more)

### Community 19 - "backend/package.json"
Cohesion: 0.11
Nodes (18): author, description, axios, eslint, keywords, license, main, name (+10 more)

### Community 20 - "config.js"
Cohesion: 0.10
Nodes (22): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+14 more)

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
Cohesion: 0.09
Nodes (22): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+14 more)

### Community 28 - "rrhh.test.js"
Cohesion: 0.20
Nodes (10): assert, { getDb, getAccountingDb }, { numberToWords }, rhPlanillaService, { test, describe, after }, CENTENAS, DECENAS, numberToWords() (+2 more)

### Community 29 - "FinanzasPrestamos.jsx"
Cohesion: 0.29
Nodes (16): FinanzasAsesor(), FinanzasCalculadora(), FinanzasPrestamos(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings(), calculatePMT() (+8 more)

### Community 30 - "DashboardLayout.jsx"
Cohesion: 0.11
Nodes (23): Responsive / Mobile, createColorIcon(), ICON_ALIASES, LoadingFallback(), bundledCollections, allNavCategories, bancosMenu, bancosReportes (+15 more)

### Community 31 - "sendSafeError"
Cohesion: 0.08
Nodes (23): getIsoDate(), getPreciosCompetenciaSafe(), handleAiQuery(), handleSchemaContext(), handleSolarAndelsaDashboard(), handleWebhooksTrigger(), stripHtmlToText(), userHasAnyPerm() (+15 more)

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.13
Nodes (33): autoBuildKnowledgeFromEcosystem(), calculatePMT(), detectLocalAgyBinary(), emitCrecimientoAgySocket(), ensureCrecimientoSchema(), { execFileSync, spawn }, executeAgyServerPlan(), extractHeuristicKnowledgeFromText() (+25 more)

### Community 33 - "20260814_create_check_format_tables.js"
Cohesion: 0.25
Nodes (5): dbConfig, dotenv, mysql, path, dotenv

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.20
Nodes (10): axios, dotenv, ensureLogDir(), fs, { getDb }, https, logFile, path (+2 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "useToast"
Cohesion: 0.11
Nodes (30): ESTRATEGIA_TABS, EstrategiaNav(), AGY_STATUS_META, DEFAULT_MODELS, TicketAgyFlowModal(), AGENT_PLATFORMS, AI_EXECUTION_MODES, TicketAiBundleModal() (+22 more)

### Community 37 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.24
Nodes (30): handleCallbackQuery(), handleSmartNaturalLanguageQuery(), {
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    normalizeText,
    SPANISH_MONTH_NAMES
}, formatAlertasMessage(), formatAndelsaCostosMessage(), formatAndelsaCxcMessage(), formatAndelsaFinanzasResumenMessage(), formatAndelsaInventarioMessage() (+22 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 39 - "VentasEstaciones.jsx"
Cohesion: 0.21
Nodes (12): CorteTiendaModal(), moneyFmt(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt(), numFmt() (+4 more)

### Community 40 - "lucide-react"
Cohesion: 0.15
Nodes (25): ReportPreviewModal(), ConsultaCambiosGithub(), formatDateTime(), formatRelativeTime(), TYPE_CONFIG, Consultas(), ConsultasPreciosCompetencia(), DiferenciasCombustible() (+17 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegram.js"
Cohesion: 0.05
Nodes (55): authenticateN8nOrAdmin(), { authenticateToken, requirePermission }, crypto, express, {
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
}, maskToken() (+47 more)

### Community 43 - "telegramAdvancedCapabilities.test.js"
Cohesion: 0.11
Nodes (16): broadcastDiscrepancyAlerts(), clearUserConversationContext(), formatDiscrepancyAlertMessage(), formatFeedbackListMessage(), getDiscrepancyInlineMarkup(), getUserConversationContext(), pendingAlertJustifications, setUserConversationContext() (+8 more)

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

### Community 56 - "telegramBotService.js"
Cohesion: 0.09
Nodes (45): axios, broadcastCustomAlert(), createFeedbackEntry(), dbModule, {
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
    resolveStationId,
    findStationById,
    findFuelByKey,
    parseNaturalLanguageQuery
}, {
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
    formatHelpMessage
}, {
    generateExecutiveReportPdf,
    buildAndSendTopicPdf
}, getAccountingDb() (+37 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.12
Nodes (23): Bitácora (Audit Log), configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getDb(), getExternalDb() (+15 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "authenticateToken"
Cohesion: 0.06
Nodes (34): authenticateToken(), isUserRevoked(), syncRevokedUsersFromDb(), { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router (+26 more)

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.09
Nodes (17): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, PermissionRoute(), ProtectedRoute(), ErrorBoundary, getStoredToken(), getStoredUser() (+9 more)

### Community 64 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 65 - "tasks.js"
Cohesion: 0.12
Nodes (17): isAdminUser(), { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, hasTaskManagePermission(), router, { sendSafeError } (+9 more)

### Community 66 - "inteligencia.js"
Cohesion: 0.14
Nodes (20): { authenticateToken, requirePermission }, express, { generateExecutiveReportPdf }, {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
}, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia }, { getRiesgoCreditoFlotas, getDetalleDtesCliente } (+12 more)

### Community 67 - "middleware/auth.js"
Cohesion: 0.05
Nodes (33): jwt, restoreUser(), revokedUsers, revokeUser(), { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser }, bcrypt, express, { getDb } (+25 more)

### Community 68 - "Cheques.jsx"
Cohesion: 0.18
Nodes (15): FormatManager(), CheckPdfService, DesignerService, PrintEngine, Cheques(), ImpresionCheques(), CENTENAS, DECENAS (+7 more)

### Community 69 - "requirePermission"
Cohesion: 0.12
Nodes (14): withTransaction(), requirePermission(), requireRole(), { authenticateToken, requirePermission }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction } (+6 more)

### Community 70 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "NotificationContext.jsx"
Cohesion: 0.25
Nodes (10): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast(), NotificationContext, NotificationProvider(), readStoredUser(), useNotifications() (+2 more)

### Community 74 - "autoSyncScheduler.js"
Cohesion: 0.17
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+4 more)

### Community 75 - "solarEnergyService.js"
Cohesion: 0.25
Nodes (17): buildEnterpriseGrowthSnapshot(), buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario() (+9 more)

### Community 76 - "energyLatamService.js"
Cohesion: 0.24
Nodes (12): checkPortalStatus(), fs, { getDb, withRetry }, getPortalCredentials(), launchBrowser(), normalizeEstacion(), normalizeEstado(), path (+4 more)

### Community 77 - "telegramDataService.js"
Cohesion: 0.13
Nodes (31): buildWeeklyExecutiveDossierPayload(), {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    KNOWN_STATIONS,
    findStationById,
    findFuelByKey
}, calcPriceDiff(), clearQueryCache(), COMPETENCIA_STATION_NAMES, dbModule, extractCompetitorBrand(), getCachedQuery() (+23 more)

### Community 78 - "telegramGeminiService.js"
Cohesion: 0.19
Nodes (20): getGeminiApiKey(), analyzeTelegramImageReceipt(), askGeminiAssistant(), dbModule, ensuredTelegramSchemaPools, ensureTelegramConfigSchema(), {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr
}, GEMINI_FALLBACK_MODELS (+12 more)

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "paymentNotifier.js"
Cohesion: 0.23
Nodes (13): buildPaymentEmailHtml(), cron, formatCurrency(), formatSpanishDate(), { getDb, getExternalDb }, getDuePayments(), initPaymentScheduler(), nodemailer (+5 more)

### Community 82 - "telegramTextAndDates.js"
Cohesion: 0.28
Nodes (15): formatPreciosCompetenciaMessage(), escapeRegex(), findFuelByKey(), findStationById(), formatYMD(), KNOWN_BANKS, KNOWN_FUELS, normalizeText() (+7 more)

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

### Community 84 - "telegramPerformance.test.js"
Cohesion: 0.10
Nodes (10): clearSolarCache(), solarMemoryCache, saasMemoryCache, assert, axios, { describe, it, beforeEach, afterEach }, router, {
    saasMemoryCache,
    getCachedSaas,
    setCachedSaas,
    clearSaasCache
} (+2 more)

### Community 85 - "operationalAuditService.js"
Cohesion: 0.22
Nodes (15): formatYMD(), { branchToEmpId, formatYMD }, dbModule, getAccountingDb(), getAuditoriaDineroEnTransito(), getDb(), getHomeResumenInteligente(), { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia } (+7 more)

### Community 86 - "getConsolidadoVentasData"
Cohesion: 0.21
Nodes (13): generarAnalisisDescuadre(), getAccountingDb(), getConsolidadoVentasData(), getCortesTiendaData(), getDb(), getExternalDb(), getPreciosEstacionData(), getTurnosPorEmpresa() (+5 more)

### Community 87 - "useDesigner.js"
Cohesion: 0.27
Nodes (7): ICON_MAP, snapToGridValue(), useDesigner(), TIPOS_CAMPO, VARIABLES_DISPONIBLES, CheckDesigner(), uuid

### Community 88 - "Frontend Conventions"
Cohesion: 0.67
Nodes (3): Frontend Conventions, ConfirmProvider(), ToastProvider()

### Community 89 - "telegramVisionAndPdf.test.js"
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

### Community 90 - "ref_path"
Cohesion: 0.17
Nodes (6): mysql, path, mysql, path, mysql, mysql2

### Community 91 - "architectureAndContracts.test.js"
Cohesion: 0.25
Nodes (7): assert, BACKEND_ROOT, collectJsFiles(), { describe, it }, dfs(), fs, path

### Community 92 - "AsistenteIA.jsx"
Cohesion: 0.52
Nodes (6): AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText()

### Community 93 - "consultasCierresRoutes.js"
Cohesion: 0.23
Nodes (11): { authenticateToken, requirePermission }, {
    cierreViewPerms,
    getCleanStationName,
    getCleanTiendaName,
    saasBranchMap,
    normalizeSaasBranchId,
    OFFICIAL_ESTACIONES,
    isGenericDescription,
    formatYMD
}, dbModule, getAccountingDb(), getExternalDb(), { GoogleGenAI }, registerConsultasCierresRoutes(), { sendSafeError } (+3 more)

### Community 94 - "consultasCompetenciaRoutes.js"
Cohesion: 0.20
Nodes (10): { authenticateToken, requirePermission }, crypto, dbModule, express, getDb(), {
    preciosEstacionViewPerms,
    preciosCompetenciaViewPerms
}, registerConsultasCompetenciaRoutes(), { sendSafeError } (+2 more)

### Community 95 - "getPuppeteer"
Cohesion: 0.60
Nodes (5): getPuppeteer(), getPuppeteer(), puppeteer, puppeteer-core, @sparticuz/chromium

### Community 96 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, eslint, nodemon

### Community 97 - "executiveFlashService.js"
Cohesion: 0.27
Nodes (11): dbModule, enviarFlashPorEmail(), formatFechaTexto(), getAccountingDb(), getDb(), getExternalDb(), getFlashEjecutivo(), { getTanquesAutonomia } (+3 more)

### Community 98 - "webhook-server.js"
Cohesion: 0.20
Nodes (7): crypto, { exec }, http, path, PORT, PROJECT_DIR, server

### Community 99 - "operacionesPedidos.test.js"
Cohesion: 0.22
Nodes (8): buildEstacionFilterClause(), calculateHasMore(), parsePedidosPagination(), savePortalCredentials(), assert, { describe, it }, { normalizeEstacion, getPortalCredentials, savePortalCredentials }, { parsePedidosPagination, calculateHasMore, buildEstacionFilterClause }

### Community 100 - "telegramVoice.test.js"
Cohesion: 0.25
Nodes (3): assert, { describe, it }, {
    sanitizeAudioMimeType,
    sanitizeGeminiApiKey,
    getGeminiApiKey,
    transcribeTelegramVoice
}

### Community 101 - "EnergiaSolarAndelsa.jsx"
Cohesion: 0.36
Nodes (7): ANDELSA_SUBVIEWS, EnergiaSolarAndelsa(), FALLBACK_ANDELSA, FALLBACK_SOLAR_STATIONS, formatMoney(), formatNum(), normalizeSolarAndelsaPayload()

### Community 102 - "dbBootstrapSeeds.js"
Cohesion: 0.38
Nodes (6): dbModule, runInitialServiceSeeds(), { seedInitialPortalOrders }, { seedSolarEnergyData }, seedInitialPortalOrders(), seedSolarEnergyData()

### Community 103 - "cashflowForecast.js"
Cohesion: 0.53
Nodes (5): dbModule, getAccountingDb(), getDb(), getFlujoCajaProyectado(), withRetry()

### Community 104 - "getDb"
Cohesion: 0.67
Nodes (3): getDb(), getGraphifyStatsSafe(), handleAgentsControlCenter()

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 911 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authenticateToken()` connect `authenticateToken` to `conciliacion.js`, `tasks.js`, `inteligencia.js`, `middleware/auth.js`, `server.js`, `requirePermission`, `consultas.js`, `operaciones.js`, `telegram.js`, `githubChanges.js`, `config.js`, `onedrive.js`, `ai.js`, `finanzas.js`, `db.js`, `consultasCierresRoutes.js`, `consultasCompetenciaRoutes.js`, `sendSafeError`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.12056737588652482 - nodes in this community are weakly interconnected._
- **Why does `react` connect `useToast` to `Modal`, `lazyPages.js`, `frontend/package.json`, `Cheques.jsx`, `EnergiaSolarAndelsa.jsx`, `VentasEstaciones.jsx`, `lucide-react`, `NotificationContext.jsx`, `date.js`, `TicketContext.jsx`, `DesignerView.jsx`, `FinanzasInversiones.jsx`, `themeUtils.js`, `useDesigner.js`, `AsistenteIA.jsx`, `FinanzasPrestamos.jsx`, `DashboardLayout.jsx`, `errorDiagnostics.js`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Modal()` (e.g. with `Regla obligatoria para NUEVAS pantallas (no opcional)` and `Responsive / Mobile`) actually correct?**
  _`Modal()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1294615849969752 - nodes in this community are weakly interconnected._