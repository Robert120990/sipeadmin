# Graph Report - SIPEOFI  (2026-11-20)

## Corpus Check
- 258 files · ~613,941 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 2194 nodes · 6047 edges · 106 communities (100 shown, 6 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 405 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8bd13097`
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
- executiveFlashService.js
- telegramCompetencia.test.js
- ref_node_assert
- date.js
- ticketService.js
- TicketContext.jsx
- DesignCanvas.jsx
- webhook-server.js
- dependencies
- githubChanges.js
- themeUtils.js
- withRetry
- backend/package.json
- recordatoriosPagosService.js
- 5. Resumen de Módulos y Tablas Principales
- finanzas.js
- onedrive.js
- backup-db.js
- ref_path
- generate-icons.cjs
- AGENTS.md
- rrhh.test.js
- FinanzasPrestamos.jsx
- ticketTelegramAgyService.js
- sendSafeError
- businessGrowthAgyService.js
- telegramAlerts.test.js
- sync-dgehm-direct.js
- scripts
- inteligencia.js
- telegramFeedbackEvaluator.js
- dgehmService.js
- useToast
- react
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
- express
- errorDiagnostics.js
- conciliacion.js
- operationalIntelligenceV2.test.js
- config.js
- middleware/auth.js
- Cheques.jsx
- cheques.js
- deploy.js
- salesHourlyService.js
- DesignerView.jsx
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
- operationalAuditService.js
- bancos.js
- requirePermission
- DashboardLayout.jsx
- getDb
- 20260814_create_check_format_tables.js
- architectureAndContracts.test.js
- errorHandler.js
- telegramSecurity.test.js
- ControlRecordatorios.jsx
- NotificationContext.jsx
- devDependencies
- consultasCompetenciaRoutes.js
- telegramVisionAndPdf.test.js
- consultasVentasResumenService.js
- routes/bitacora.js
- checkDesigner.js
- AsistenteIA.jsx
- cashflowForecast.js
- analisisDescuadre.test.js
- PermissionRoute

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 129 edges
2. `react` - 99 edges
3. `lucide-react` - 84 edges
4. `Modal()` - 68 edges
5. `App()` - 66 edges
6. `DashboardLayout()` - 64 edges
7. `api` - 61 edges
8. `handleIncomingMessage()` - 59 edges
9. `getDb()` - 58 edges
10. `ReportPreviewModal()` - 58 edges

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

## Communities (106 total, 6 thin omitted)

### Community 0 - "Modal"
Cohesion: 0.11
Nodes (30): 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), Carriers(), ChequesContado(), ToggleSwitch() (+22 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.11
Nodes (60): Frontend Conventions, Responsive / Mobile, App(), DashboardLayout, Login, ConfirmProvider(), ToastProvider(), useViewport() (+52 more)

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
Nodes (52): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked }, authRoutes, { autoLogMiddleware } (+44 more)

### Community 5 - "operaciones.js"
Cohesion: 0.06
Nodes (35): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, buildCompactPresetValue(), buildEstacionFilterClause(), calculateHasMore(), compactBankCode(), crypto, energiaSolarViewPerms (+27 more)

### Community 6 - "consultas.js"
Cohesion: 0.10
Nodes (39): { authenticateToken, requirePermission }, dbModule, express, getAccountingDb(), getConsolidadoVentasData(), getCortesTiendaData(), getDb(), getExternalDb() (+31 more)

### Community 7 - "executiveFlashService.js"
Cohesion: 0.27
Nodes (11): dbModule, enviarFlashPorEmail(), formatFechaTexto(), getAccountingDb(), getDb(), getExternalDb(), getFlashEjecutivo(), { getTanquesAutonomia } (+3 more)

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
Nodes (16): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }, salesHourlyService, solarEnergyService (+8 more)

### Community 10 - "date.js"
Cohesion: 0.16
Nodes (25): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), ESTRATEGIA_TABS, EstrategiaNav(), ConsultasCumpleanos() (+17 more)

### Community 11 - "ticketService.js"
Cohesion: 0.07
Nodes (63): acknowledgeResolution(), addTicketMessage(), AGY_MODEL_ALIASES, approveAndGeneratePlan(), autoTriageTicketsForAi(), AVAILABLE_AGY_MODELS, buildAgyPlanApprovalKeyboard(), buildAiPromptPackage() (+55 more)

### Community 12 - "TicketContext.jsx"
Cohesion: 0.07
Nodes (36): CommandPalette(), TICKET_KEYWORDS, PRIORITIES, QuickTicketModal(), TYPES, COLORS, drawShape(), ScreenshotAnnotatorModal() (+28 more)

### Community 13 - "DesignCanvas.jsx"
Cohesion: 0.67
Nodes (3): applySnap(), DesignCanvas(), react-konva

### Community 14 - "webhook-server.js"
Cohesion: 0.18
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

### Community 18 - "withRetry"
Cohesion: 0.16
Nodes (30): fetchCachedExternalConfig(), getAccountingDb(), withRetry(), withTransaction(), calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), getRiesgoCreditoFlotas() (+22 more)

### Community 19 - "backend/package.json"
Cohesion: 0.10
Nodes (23): author, description, axios, eslint, keywords, license, main, name (+15 more)

### Community 20 - "recordatoriosPagosService.js"
Cohesion: 0.11
Nodes (32): BANK_RECONCILIABLE_METHODS, buildLegacyFormaPagoSummary(), computePaymentBalance(), crypto, DEFAULT_CASH_SOURCES, deleteReceiptFile(), enrichRecordatoriosList(), ensurePagosUploadsDir() (+24 more)

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

### Community 25 - "ref_path"
Cohesion: 0.10
Nodes (13): fs, path, puppeteer, mysql, path, __dirname, parts, pkg (+5 more)

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

### Community 30 - "ticketTelegramAgyService.js"
Cohesion: 0.17
Nodes (29): buildAgyReviewBranchName(), buildBranchReviewKeyboard(), buildCurrentKeyboardForTicket(), buildModelPickerKeyboard(), buildPlanApprovalKeyboard(), buildRetryExecutionKeyboard(), buildTicketActionKeyboard(), discardAgyReviewBranchOnServer() (+21 more)

### Community 31 - "sendSafeError"
Cohesion: 0.15
Nodes (15): getIsoDate(), getPreciosCompetenciaSafe(), handleAiQuery(), handleSchemaContext(), handleSolarAndelsaDashboard(), handleWebhooksTrigger(), stripHtmlToText(), userHasAnyPerm() (+7 more)

### Community 32 - "businessGrowthAgyService.js"
Cohesion: 0.12
Nodes (35): applyFlexibleTextEdit(), autoBuildKnowledgeFromEcosystem(), buildEnterpriseGrowthSnapshot(), calculatePMT(), detectLocalAgyBinary(), emitCrecimientoAgySocket(), ensureCrecimientoSchema(), { execFileSync, spawn } (+27 more)

### Community 33 - "telegramAlerts.test.js"
Cohesion: 0.18
Nodes (7): assert, axios, { describe, it, beforeEach, afterEach }, {
    formatDiscrepancyAlertMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert
}, jwt, { JWT_SECRET }, telegramRouter

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.16
Nodes (20): axios, cleanNum(), dotenv, ensureLogDir(), fetchAllFuelPricesWithFallback(), fetchMirrorGasolinaSv(), fetchPrimaryDgehm(), formatIsoToDgehmDate() (+12 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "inteligencia.js"
Cohesion: 0.14
Nodes (20): { authenticateToken, requirePermission }, express, { generateExecutiveReportPdf }, {
    getAuditoriaDineroEnTransito,
    getHomeResumenInteligente,
    buildWeeklyExecutiveDossierPayload
}, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion, getElasticidadPreciosCompetencia }, { getRiesgoCreditoFlotas, getDetalleDtesCliente } (+12 more)

### Community 37 - "telegramFeedbackEvaluator.js"
Cohesion: 0.15
Nodes (48): handleCallbackQuery(), handleSmartNaturalLanguageQuery(), { askConversationalAgent }, {
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

### Community 39 - "useToast"
Cohesion: 0.13
Nodes (21): useToast(), CorteTiendaModal(), moneyFmt(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt() (+13 more)

### Community 40 - "react"
Cohesion: 0.14
Nodes (29): ReportPreviewModal(), AGENT_PLATFORMS, AI_EXECUTION_MODES, ToastContext, ConfiguracionAgentesIA(), ConsultaCambiosGithub(), formatDateTime(), formatRelativeTime() (+21 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.14
Nodes (27): maskToken(), activeUsers, checkFeedbackMetrics(), clearErrors(), errorBuffer, formatDiagnosticsMessage(), getActiveUsersCount(), { getDb, getExternalDb } (+19 more)

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
Nodes (30): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), cachedGraphifyStats, conversationalAiService, crypto, dbModule, DEFAULT_AI_SUGGESTIONS (+22 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegramBotService.js"
Cohesion: 0.06
Nodes (69): {
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
    setRuntimeGeminiApiKey,
    escapeHtml,
    resolveTelegramUser,
    getUserEffectivePermissions
}, { getDb }, {
    getHealthDiagnostics,
    getErrors,
    clearErrors
} (+61 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.13
Nodes (17): configCache, dbConfig, dotenv, externalPools, getExternalDb(), initDB(), mysql, { getExternalDb } (+9 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "express"
Cohesion: 0.14
Nodes (12): { authenticateToken, requirePermission }, catalogosViewPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken }, express (+4 more)

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.09
Nodes (18): ProtectedRoute(), ErrorBoundary, getStoredToken(), getStoredUser(), clearErrorLogs(), copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport() (+10 more)

### Community 64 - "conciliacion.js"
Cohesion: 0.18
Nodes (7): { authenticateToken, requirePermission }, conciliacionViewPerms, express, { getDb }, router, { sendSafeError }, withRetry()

### Community 65 - "operationalIntelligenceV2.test.js"
Cohesion: 0.13
Nodes (18): { branchToEmpId, OFFICIAL_ESTACIONES }, dbModule, getAccountingDb(), getDb(), getElasticidadPreciosCompetencia(), getRentabilidadPorEstacion(), resolveStationEmpCode(), solarEnergyService (+10 more)

### Community 66 - "config.js"
Cohesion: 0.08
Nodes (34): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+26 more)

### Community 67 - "middleware/auth.js"
Cohesion: 0.07
Nodes (28): authenticateToken(), isUserRevoked(), jwt, restoreUser(), revokedUsers, revokeUser(), syncRevokedUsersFromDb(), { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser } (+20 more)

### Community 68 - "Cheques.jsx"
Cohesion: 0.15
Nodes (23): Regla obligatoria para NUEVAS pantallas (no opcional), CheckPdfService, DesignerService, PrintEngine, Cheques(), ConciliacionBancaria(), ImpresionCheques(), MovimientosBancarios() (+15 more)

### Community 69 - "cheques.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, chequeViewPerms, contadoPerms, express, { getDb, getExternalDb, withTransaction }, router, { sendSafeError }

### Community 70 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "DesignerView.jsx"
Cohesion: 0.15
Nodes (16): PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox(), CalibrationDialog(), Preview() (+8 more)

### Community 74 - "autoSyncScheduler.js"
Cohesion: 0.16
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), initAutoSyncScheduler(), lastSyncMetadata, syncDGEHM (+4 more)

### Community 75 - "finanzasCrecimiento.test.js"
Cohesion: 0.10
Nodes (15): { authenticateToken, requirePermission, isAdminUser }, crecimientoManagePerms, crecimientoViewPerms, express, growthService, router, { sendSafeError }, assert (+7 more)

### Community 76 - "energyLatamService.js"
Cohesion: 0.24
Nodes (12): checkPortalStatus(), fs, { getDb, withRetry }, getPortalCredentials(), launchBrowser(), normalizeEstacion(), normalizeEstado(), path (+4 more)

### Community 77 - "telegramDataService.js"
Cohesion: 0.13
Nodes (34): buildLiveProjectContext(), buildWeeklyExecutiveDossierPayload(), {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    KNOWN_STATIONS,
    findStationById,
    findFuelByKey
}, calcPriceDiff(), clearQueryCache(), COMPETENCIA_STATION_NAMES, dbModule, extractCompetitorBrand() (+26 more)

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
Nodes (16): appendToHistory(), cleanExpiredSessions(), clearConversation(), consultasModule, conversationHistory, dbModule, getActiveConversationsCount(), getDb() (+8 more)

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
Cohesion: 0.10
Nodes (10): clearSolarCache(), solarMemoryCache, saasMemoryCache, assert, axios, { describe, it, beforeEach, afterEach }, router, {
    saasMemoryCache,
    getCachedSaas,
    setCachedSaas,
    clearSaasCache
} (+2 more)

### Community 85 - "operationalAuditService.js"
Cohesion: 0.20
Nodes (16): branchToEmpId, formatYMD(), { branchToEmpId, formatYMD }, dbModule, getAccountingDb(), getAuditoriaDineroEnTransito(), getDb(), getHomeResumenInteligente() (+8 more)

### Community 86 - "bancos.js"
Cohesion: 0.20
Nodes (7): { authenticateToken, requirePermission }, bancosViewPerms, express, { getDb }, movimientosViewPerms, router, { sendSafeError }

### Community 87 - "requirePermission"
Cohesion: 0.11
Nodes (20): isAdminUser(), requirePermission(), requireRole(), { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, hasTaskManagePermission() (+12 more)

### Community 88 - "DashboardLayout.jsx"
Cohesion: 0.12
Nodes (21): createColorIcon(), ICON_ALIASES, LoadingFallback(), bundledCollections, allNavCategories, bancosMenu, bancosReportes, catalogItems (+13 more)

### Community 89 - "getDb"
Cohesion: 0.18
Nodes (22): getDb(), dbModule, runInitialServiceSeeds(), { seedInitialPortalOrders }, { seedSolarEnergyData }, seedInitialPortalOrders(), calcularRegistroDiarioAnalitico(), getCachedSolar() (+14 more)

### Community 90 - "20260814_create_check_format_tables.js"
Cohesion: 0.12
Nodes (9): dbConfig, dotenv, mysql, path, mysql, path, mysql, dotenv (+1 more)

### Community 91 - "architectureAndContracts.test.js"
Cohesion: 0.25
Nodes (7): assert, BACKEND_ROOT, collectJsFiles(), { describe, it }, dfs(), fs, path

### Community 92 - "errorHandler.js"
Cohesion: 0.17
Nodes (6): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }, crypto

### Community 93 - "telegramSecurity.test.js"
Cohesion: 0.27
Nodes (7): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData(), assert, { describe, it }

### Community 94 - "ControlRecordatorios.jsx"
Cohesion: 0.18
Nodes (20): ControlPagosModal(), formatDateShort(), getMethodCategory(), getMethodLabel(), mc(), OPERATION_TYPES, PAYMENT_METHOD_OPTIONS, ReceiptViewerModal() (+12 more)

### Community 95 - "NotificationContext.jsx"
Cohesion: 0.25
Nodes (10): formatTimeAgo(), getNotificationIcon(), NotificationBell(), RealtimeNotificationToast(), NotificationContext, NotificationProvider(), readStoredUser(), useNotifications() (+2 more)

### Community 96 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, eslint, nodemon

### Community 97 - "consultasCompetenciaRoutes.js"
Cohesion: 0.18
Nodes (12): { authenticateToken, requirePermission }, crypto, dbModule, express, getDb(), {
    preciosEstacionViewPerms,
    preciosCompetenciaViewPerms
}, registerConsultasCompetenciaRoutes(), { sendSafeError } (+4 more)

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

### Community 99 - "consultasVentasResumenService.js"
Cohesion: 0.44
Nodes (9): getCleanStationName(), dbModule, getAccountingDb(), {
    getCleanStationName,
    getCleanTiendaName,
    branchToEmpId,
    normalizeSaasBranchId,
    OFFICIAL_ESTACIONES
}, getComparativoAnualData(), getResumenMensualData(), getResumenRangoVentasData(), normalizeStationName() (+1 more)

### Community 100 - "routes/bitacora.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }

### Community 101 - "checkDesigner.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, checkDesignerPerms, express, { getDb }, router, { sendSafeError }

### Community 102 - "AsistenteIA.jsx"
Cohesion: 0.52
Nodes (6): AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText()

### Community 103 - "cashflowForecast.js"
Cohesion: 0.48
Nodes (6): dbModule, getAccountingDb(), getDb(), getExternalDb(), getFlujoCajaProyectado(), withRetry()

### Community 104 - "analisisDescuadre.test.js"
Cohesion: 0.40
Nodes (5): generarAnalisisDescuadre(), mapCierreRowConExplicacion(), assert, consultasRouter, { describe, it }

### Community 105 - "PermissionRoute"
Cohesion: 0.40
Nodes (4): 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, PermissionRoute()

## Knowledge Gaps
- **21 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 982 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `getDb` to `server.js`, `operaciones.js`, `withRetry`, `finanzas.js`, `rrhh.test.js`, `businessGrowthAgyService.js`, `sync-dgehm-direct.js`, `telegramFeedbackEvaluator.js`, `dgehmService.js`, `telegramAuditorService.js`, `telegramBotService.js`, `db.js`, `express`, `conciliacion.js`, `config.js`, `middleware/auth.js`, `cheques.js`, `autoSyncScheduler.js`, `energyLatamService.js`, `telegramTextAndDates.js`, `bancos.js`, `requirePermission`, `telegramSecurity.test.js`, `routes/bitacora.js`, `checkDesigner.js`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Modal` be split into smaller, more focused modules?**
  _Cohesion score 0.11341463414634147 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `middleware/auth.js` to `server.js`, `operaciones.js`, `consultas.js`, `githubChanges.js`, `finanzas.js`, `onedrive.js`, `sendSafeError`, `inteligencia.js`, `ai.js`, `telegramBotService.js`, `express`, `conciliacion.js`, `config.js`, `cheques.js`, `finanzasCrecimiento.test.js`, `bancos.js`, `requirePermission`, `telegramSecurity.test.js`, `consultasCompetenciaRoutes.js`, `routes/bitacora.js`, `checkDesigner.js`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Modal()` (e.g. with `Regla obligatoria para NUEVAS pantallas (no opcional)` and `Responsive / Mobile`) actually correct?**
  _`Modal()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11264720942140297 - nodes in this community are weakly interconnected._