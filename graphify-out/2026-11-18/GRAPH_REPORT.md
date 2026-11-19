# Graph Report - SIPEOFI  (2026-11-16)

## Corpus Check
- 251 files · ~579,586 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 2073 nodes · 5715 edges · 97 communities (91 shown, 6 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 346 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `228fdc74`
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
- DesignCanvas.jsx
- errorHandler.js
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
- telegramAlerts.test.js
- sync-dgehm-direct.js
- scripts
- useToast
- telegramFeedbackEvaluator.js
- dgehmService.js
- VentasEstaciones.jsx
- api.js
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
- middleware/auth.js
- errorDiagnostics.js
- conciliacion.js
- requirePermission
- paymentNotifier.js
- routes/auth.js
- react
- cheques.js
- deploy.js
- salesHourlyService.js
- NotificationContext.jsx
- sync_portal_pedidos.sh
- autoSyncScheduler.js
- finanzasCrecimiento.test.js
- energyLatamService.js
- telegramDataService.js
- telegramGeminiService.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- conversationalAiService.js
- telegramTextAndDates.js
- andelsaTelegramBot.test.js
- telegramPerformance.test.js
- inteligencia.js
- bancos.js
- tickets.js
- Frontend Conventions
- telegramVisionAndPdf.test.js
- ref_path
- architectureAndContracts.test.js
- AsistenteIA.jsx
- FinanzasCrecimiento.jsx
- solarAndSalesHourly.test.js
- getDb
- cashflowForecast.js

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 127 edges
2. `react` - 97 edges
3. `lucide-react` - 82 edges
4. `App()` - 66 edges
5. `Modal()` - 64 edges
6. `DashboardLayout()` - 64 edges
7. `api` - 60 edges
8. `getDb()` - 58 edges
9. `ReportPreviewModal()` - 58 edges
10. `handleIncomingMessage()` - 57 edges

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

## Communities (97 total, 6 thin omitted)

### Community 0 - "Modal"
Cohesion: 0.10
Nodes (43): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), Carriers(), Cheques() (+35 more)

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
Nodes (18): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+10 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (52): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked }, authRoutes, { autoLogMiddleware } (+44 more)

### Community 5 - "operaciones.js"
Cohesion: 0.07
Nodes (30): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, buildEstacionFilterClause(), calculateHasMore(), crypto, energiaSolarViewPerms, energyLatamService, express (+22 more)

### Community 6 - "consultas.js"
Cohesion: 0.06
Nodes (66): { authenticateToken, requirePermission }, dbModule, express, generarAnalisisDescuadre(), getAccountingDb(), getConsolidadoVentasData(), getCortesTiendaData(), getDb() (+58 more)

### Community 7 - "operationalIntelligenceV2.test.js"
Cohesion: 0.08
Nodes (38): dbModule, enviarFlashPorEmail(), formatFechaTexto(), getAccountingDb(), getDb(), getExternalDb(), getFlashEjecutivo(), { getTanquesAutonomia } (+30 more)

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
Cohesion: 0.13
Nodes (7): assert, { describe, it }, assert, { describe, it }, assert, consultasRouter, { describe, it }

### Community 10 - "date.js"
Cohesion: 0.29
Nodes (16): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), ConsultasCumpleanos(), Dashboard(), addMonthsPreservingDay() (+8 more)

### Community 11 - "ticketService.js"
Cohesion: 0.08
Nodes (53): acknowledgeResolution(), addTicketMessage(), approveAndGeneratePlan(), autoTriageTicketsForAi(), buildAgyPlanApprovalKeyboard(), buildAiPromptPackage(), buildInteractiveTicketKeyboard(), computeDiagnosticRelevance() (+45 more)

### Community 12 - "TicketContext.jsx"
Cohesion: 0.07
Nodes (38): CommandPalette(), TICKET_KEYWORDS, PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal() (+30 more)

### Community 13 - "DesignCanvas.jsx"
Cohesion: 0.67
Nodes (3): applySnap(), DesignCanvas(), react-konva

### Community 14 - "errorHandler.js"
Cohesion: 0.10
Nodes (13): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }, crypto, crypto, { exec } (+5 more)

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
Cohesion: 0.14
Nodes (32): fetchCachedExternalConfig(), getAccountingDb(), withRetry(), withTransaction(), calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), getRiesgoCreditoFlotas() (+24 more)

### Community 19 - "backend/package.json"
Cohesion: 0.09
Nodes (26): author, description, devDependencies, eslint, nodemon, axios, eslint, keywords (+18 more)

### Community 20 - "config.js"
Cohesion: 0.11
Nodes (21): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+13 more)

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
Cohesion: 0.06
Nodes (39): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+31 more)

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
Cohesion: 0.15
Nodes (15): getIsoDate(), getPreciosCompetenciaSafe(), handleAiQuery(), handleSchemaContext(), handleSolarAndelsaDashboard(), handleWebhooksTrigger(), stripHtmlToText(), userHasAnyPerm() (+7 more)

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.13
Nodes (34): autoBuildKnowledgeFromEcosystem(), buildEnterpriseGrowthSnapshot(), calculatePMT(), detectLocalAgyBinary(), emitCrecimientoAgySocket(), ensureCrecimientoSchema(), { execFileSync, spawn }, executeAgyServerPlan() (+26 more)

### Community 33 - "telegramAlerts.test.js"
Cohesion: 0.10
Nodes (14): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }, assert, axios (+6 more)

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.16
Nodes (20): axios, cleanNum(), dotenv, ensureLogDir(), fetchAllFuelPricesWithFallback(), fetchMirrorGasolinaSv(), fetchPrimaryDgehm(), formatIsoToDgehmDate() (+12 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "useToast"
Cohesion: 0.13
Nodes (24): ESTRATEGIA_TABS, EstrategiaNav(), AGENT_PLATFORMS, AI_EXECUTION_MODES, TicketAiBundleModal(), ToastContext, useToast(), ConciliacionEfectivoCard() (+16 more)

### Community 37 - "telegramFeedbackEvaluator.js"
Cohesion: 0.15
Nodes (48): handleSmartNaturalLanguageQuery(), { askConversationalAgent }, buildDeterministicExecutiveFallback(), {
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatSpecificStationMessage,
    formatProductTotalMessage,
    formatRankingMessage,
    formatSpecificBankMessage,
    formatTiendasMessage,
    formatVentasMensualMessage,
    formatVentasRangoMessage,
    formatHorasPicoMessage,
    formatSolarEnergyMessage,
    formatPreciosCompetenciaMessage,
    formatTanquesAutonomiaMessage,
    formatPedidosPumaMessage,
    formatRentabilidadEbitdaMessage,
    formatTransitoValesMessage
}, generateImprovedResponseForFeedback(), { getAuditoriaDineroEnTransito }, {
    getConsolidadoVentas,
    getSaldosBancosData,
    getSaldosChequeraData,
    getPreciosCompetenciaData,
    getPedidosPumaData
}, { getDb, getExternalDb, getAccountingDb } (+40 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 39 - "VentasEstaciones.jsx"
Cohesion: 0.26
Nodes (8): CorteTiendaModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt(), numFmt(), VentasEstaciones(), moneyFmt(), numFmt()

### Community 40 - "api.js"
Cohesion: 0.16
Nodes (28): ReportPreviewModal(), ConfiguracionAgentesIA(), ConsultaCambiosGithub(), formatDateTime(), formatRelativeTime(), TYPE_CONFIG, Consultas(), ControlRecordatorios() (+20 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegram.js"
Cohesion: 0.06
Nodes (42): {
    analyzeNegativeFeedbackBatch,
    generateImprovedResponseForFeedback
}, authenticateN8nOrAdmin(), { authenticateToken, requirePermission }, crypto, express, {
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
} (+34 more)

### Community 43 - "telegramAdvancedCapabilities.test.js"
Cohesion: 0.12
Nodes (14): broadcastDiscrepancyAlerts(), clearUserConversationContext(), formatDiscrepancyAlertMessage(), formatFeedbackListMessage(), getDiscrepancyInlineMarkup(), pendingAlertJustifications, userConversationContext, resolveStationId() (+6 more)

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
Nodes (53): attemptSelfHealingCorrection(), axios, broadcastCustomAlert(), createFeedbackEntry(), dbModule, {
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
    formatTanquesAutonomiaMessage,
    formatPedidosPumaMessage,
    formatRentabilidadEbitdaMessage,
    formatTransitoValesMessage,
    formatIntelligentGuidanceMessage,
    formatHelpMessage
}, {
    generateExecutiveReportPdf,
    buildAndSendTopicPdf
} (+45 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.15
Nodes (17): configCache, dbConfig, dotenv, externalPools, getDb(), getExternalDb(), initDB(), mysql (+9 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "middleware/auth.js"
Cohesion: 0.07
Nodes (29): authenticateToken(), isUserRevoked(), jwt, revokedUsers, syncRevokedUsersFromDb(), { authenticateToken, requirePermission }, catalogosViewPerms, express (+21 more)

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.09
Nodes (17): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, PermissionRoute(), ProtectedRoute(), ErrorBoundary, getStoredToken(), getStoredUser() (+9 more)

### Community 64 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 65 - "requirePermission"
Cohesion: 0.10
Nodes (21): isAdminUser(), requirePermission(), requireRole(), { authenticateToken, requirePermission, isAdminUser }, crecimientoManagePerms, crecimientoViewPerms, express, growthService (+13 more)

### Community 66 - "paymentNotifier.js"
Cohesion: 0.23
Nodes (13): buildPaymentEmailHtml(), cron, formatCurrency(), formatSpanishDate(), { getDb, getExternalDb }, getDuePayments(), initPaymentScheduler(), nodemailer (+5 more)

### Community 67 - "routes/auth.js"
Cohesion: 0.09
Nodes (21): Bitácora (Audit Log), restoreUser(), revokeUser(), autoLogMiddleware(), { getDb }, logAction(), sanitizeData(), { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser } (+13 more)

### Community 68 - "react"
Cohesion: 0.10
Nodes (22): AGY_STATUS_META, DEFAULT_MODELS, PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox() (+14 more)

### Community 69 - "cheques.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction }, router, { sendSafeError }

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
Cohesion: 0.16
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), initAutoSyncScheduler(), lastSyncMetadata, syncDGEHM (+4 more)

### Community 75 - "finanzasCrecimiento.test.js"
Cohesion: 0.17
Nodes (8): assert, crecimientoRouter, { describe, it, beforeEach, afterEach }, express, growthService, http, jwt, { JWT_SECRET }

### Community 76 - "energyLatamService.js"
Cohesion: 0.16
Nodes (18): dbModule, runInitialServiceSeeds(), { seedInitialPortalOrders }, { seedSolarEnergyData }, checkPortalStatus(), fs, { getDb, withRetry }, getPortalCredentials() (+10 more)

### Community 77 - "telegramDataService.js"
Cohesion: 0.14
Nodes (32): buildLiveProjectContext(), buildWeeklyExecutiveDossierPayload(), {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    KNOWN_STATIONS,
    findStationById,
    findFuelByKey
}, calcPriceDiff(), clearQueryCache(), COMPETENCIA_STATION_NAMES, dbModule, extractCompetitorBrand() (+24 more)

### Community 78 - "telegramGeminiService.js"
Cohesion: 0.19
Nodes (20): getGeminiApiKey(), analyzeTelegramImageReceipt(), askGeminiAssistant(), dbModule, ensuredTelegramSchemaPools, ensureTelegramConfigSchema(), {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr
}, GEMINI_FALLBACK_MODELS (+12 more)

### Community 79 - "sync_dgehm_precios.sh"
Cohesion: 0.40
Nodes (4): PATH, sync_dgehm_precios.sh script, SIPE_ADMIN_URL, SYNC_API_KEY

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.55
Nodes (9): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), calculateTCO() (+1 more)

### Community 81 - "conversationalAiService.js"
Cohesion: 0.17
Nodes (17): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), consultasModule, conversationHistory, dbModule, getActiveConversationsCount() (+9 more)

### Community 82 - "telegramTextAndDates.js"
Cohesion: 0.16
Nodes (23): formatPreciosCompetenciaMessage(), analyzeNegativeFeedbackBatch(), classifyNegativeFeedback(), detectIntentInfo(), escapeRegex(), findFuelByKey(), findStationById(), formatYMD() (+15 more)

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
Cohesion: 0.09
Nodes (25): calcularRegistroDiarioAnalitico(), clearSolarCache(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario(), getSolarAhorroMensual() (+17 more)

### Community 85 - "inteligencia.js"
Cohesion: 0.11
Nodes (25): { authenticateToken, requirePermission }, express, { generateExecutiveReportPdf }, {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
}, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia }, { getRiesgoCreditoFlotas, getDetalleDtesCliente } (+17 more)

### Community 86 - "bancos.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }

### Community 87 - "tickets.js"
Cohesion: 0.29
Nodes (7): { authenticateToken, isAdminUser }, express, getActorName(), isTicketOwner(), router, { sendSafeError }, ticketService

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
Cohesion: 0.10
Nodes (11): dbConfig, dotenv, mysql, path, mysql, path, mysql, path (+3 more)

### Community 91 - "architectureAndContracts.test.js"
Cohesion: 0.25
Nodes (7): assert, BACKEND_ROOT, collectJsFiles(), { describe, it }, dfs(), fs, path

### Community 92 - "AsistenteIA.jsx"
Cohesion: 0.52
Nodes (6): AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText()

### Community 93 - "FinanzasCrecimiento.jsx"
Cohesion: 0.38
Nodes (6): AGY_STATE_BADGES, FinanzasCrecimiento(), formatUSD(), ORIGEN_LABELS, QUICK_PROMPTS, SafeMarkdownView()

### Community 94 - "solarAndSalesHourly.test.js"
Cohesion: 0.40
Nodes (4): assert, { describe, it }, salesHourlyService, solarEnergyService

### Community 95 - "getDb"
Cohesion: 0.67
Nodes (3): getDb(), getGraphifyStatsSafe(), handleAgentsControlCenter()

### Community 103 - "cashflowForecast.js"
Cohesion: 0.53
Nodes (5): dbModule, getAccountingDb(), getDb(), getFlujoCajaProyectado(), withRetry()

## Knowledge Gaps
- **21 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 937 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authenticateToken()` connect `middleware/auth.js` to `conciliacion.js`, `requirePermission`, `routes/auth.js`, `server.js`, `cheques.js`, `consultas.js`, `operaciones.js`, `telegram.js`, `githubChanges.js`, `config.js`, `inteligencia.js`, `bancos.js`, `ai.js`, `finanzas.js`, `onedrive.js`, `tickets.js`, `sendSafeError`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.09726775956284153 - nodes in this community are weakly interconnected._
- **Why does `getDb()` connect `db.js` to `server.js`, `operaciones.js`, `withRetry`, `config.js`, `finanzas.js`, `rrhh.test.js`, `sendSafeError`, `businessGrowthAgyService.js`, `sync-dgehm-direct.js`, `telegramFeedbackEvaluator.js`, `dgehmService.js`, `telegram.js`, `middleware/auth.js`, `conciliacion.js`, `requirePermission`, `paymentNotifier.js`, `routes/auth.js`, `cheques.js`, `autoSyncScheduler.js`, `energyLatamService.js`, `telegramTextAndDates.js`, `telegramPerformance.test.js`, `bancos.js`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Modal()` (e.g. with `Regla obligatoria para NUEVAS pantallas (no opcional)` and `Responsive / Mobile`) actually correct?**
  _`Modal()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1294615849969752 - nodes in this community are weakly interconnected._