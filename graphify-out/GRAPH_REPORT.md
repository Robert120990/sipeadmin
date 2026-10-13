# Graph Report - SIPEOFI  (2026-10-13)

## Corpus Check
- 208 files · ~486,813 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .example 2, (none) 2, .bat 2)

## Summary
- 1525 nodes · 4216 edges · 83 communities (76 shown, 7 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 245 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ae093d72`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useToast
- lazyPages.js
- handleSmartNaturalLanguageQuery
- frontend/package.json
- server.js
- operaciones.js
- consultas.js
- routes/auth.js
- react
- ref_node_assert
- date.js
- middleware/auth.js
- withRetry
- DesignCanvas.jsx
- @google/genai
- dependencies
- githubChanges.js
- themeUtils.js
- rhPlanillaService.js
- backend/package.json
- paymentNotifier.js
- 5. Resumen de Módulos y Tablas Principales
- finanzas.js
- onedrive.js
- backup-db.js
- ref_path
- generate-icons.cjs
- AGENTS.md
- rrhh.test.js
- energyLatamService.js
- conciliacion.js
- bancos.js
- cheques.js
- mysql2
- sync-dgehm-direct.js
- scripts
- ReportPreviewModal
- tasks.js
- dgehmService.js
- telegramBotService.js
- deploy.js
- scripts
- telegramAuditorService.js
- handleIncomingMessage
- dependencies
- sysSaasService.js
- PLAN ESTRATÉGICO DE INTEGRACIÓN: INTELIGENCIA ARTIFICIAL, CONTABILIDAD AUTOMÁTICA Y CONTROL FINANCIERO
- vercel.json
- deploy.sh
- 1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques)
- sw.js
- ai.js
- Estándares del Backend - SIPE Admin
- getDb
- Reglas de Git, Commits y Sincronización Remota
- devDependencies
- db.js
- scripts
- errorHandler.js
- errorDiagnostics.js
- Cheques.jsx
- config.js
- getPuppeteer
- solarEnergyService.js
- FinanzasPrestamos.jsx
- devDependencies
- 20260814_create_check_format_tables.js
- salesHourlyService.js
- middleware/bitacora.js
- sync_portal_pedidos.sh
- autoSyncScheduler.js
- VentasEstaciones.jsx
- webhook-server.js
- telegramPerformance.test.js
- telegramAlerts.test.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- operacionesPedidos.test.js
- AsistenteIA.jsx

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 107 edges
2. `getDb()` - 84 edges
3. `react` - 82 edges
4. `lucide-react` - 68 edges
5. `App()` - 62 edges
6. `Modal()` - 62 edges
7. `DashboardLayout()` - 58 edges
8. `withRetry()` - 54 edges
9. `handleIncomingMessage()` - 52 edges
10. `api` - 52 edges

## Surprising Connections (you probably didn't know these)
- `🚀 Arquitectura y Entorno de Producción` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)` --references--> `ReportPreviewModal()`  [INFERRED]
  AGENTS.md → frontend/src/components/ReportPreviewModal.jsx
- `🔒 Seguridad y Control de Acceso` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `Bitácora (Audit Log)` --references--> `authenticateToken()`  [INFERRED]
  AGENTS.md → backend/middleware/auth.js
- `🔒 Seguridad y Control de Acceso` --references--> `requirePermission()`  [INFERRED]
  README.md → backend/middleware/auth.js

## Import Cycles
- 2-file cycle: `backend/services/conversationalAiService.js -> backend/services/telegramBotService.js -> backend/services/conversationalAiService.js`
- 2-file cycle: `backend/services/telegramAuditorService.js -> backend/services/telegramBotService.js -> backend/services/telegramAuditorService.js`
- 2-file cycle: `backend/db.js -> backend/services/solarEnergyService.js -> backend/db.js`
- 2-file cycle: `backend/db.js -> backend/services/energyLatamService.js -> backend/db.js`
- 3-file cycle: `backend/services/conversationalAiService.js -> backend/services/telegramAuditorService.js -> backend/services/telegramBotService.js -> backend/services/conversationalAiService.js`

## Communities (83 total, 7 thin omitted)

### Community 0 - "useToast"
Cohesion: 0.13
Nodes (37): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, useConfirm(), Modal(), useToast(), BackupDBCheck(), Bitacora() (+29 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.06
Nodes (95): Frontend Conventions, Responsive / Mobile, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login (+87 more)

### Community 2 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.24
Nodes (30): handleAiQuery(), escapeHtml(), formatAlertasMessage(), formatAndelsaCostosMessage(), formatAndelsaCxcMessage(), formatAndelsaFinanzasResumenMessage(), formatAndelsaInventarioMessage(), formatAndelsaVentasClienteMessage() (+22 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.12
Nodes (16): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+8 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (45): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole }, authRoutes, { autoLogMiddleware } (+37 more)

### Community 5 - "operaciones.js"
Cohesion: 0.11
Nodes (16): { authenticateToken, requirePermission }, energyLatamService, express, fetchPromedios(), fetchTankReadings(), { getDb, getExternalDb, getAccountingDb, withRetry }, OFFICIAL_ESTACIONES, pedidosViewPerms (+8 more)

### Community 6 - "consultas.js"
Cohesion: 0.07
Nodes (39): { authenticateToken, requirePermission }, branchToEmpId, cierreViewPerms, cumpleanosViewPerms, diferenciasViewPerms, express, fletesViewPerms, formatYMD() (+31 more)

### Community 7 - "routes/auth.js"
Cohesion: 0.07
Nodes (25): isAdminUser(), requireRole(), restoreUser(), revokeUser(), { authenticateToken, requirePermission, requireRole, JWT_SECRET, revokeUser, restoreUser }, bcrypt, express, { getDb } (+17 more)

### Community 8 - "react"
Cohesion: 0.17
Nodes (14): ConfirmContext, ToastContext, CorteTiendaModal(), moneyFmt(), EstrategiaCombustible(), EstrategiaFlujoCaja(), EstrategiaMermas(), EstrategiaRentabilidad() (+6 more)

### Community 9 - "ref_node_assert"
Cohesion: 0.07
Nodes (15): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }, assert, { describe, it }, assert (+7 more)

### Community 10 - "date.js"
Cohesion: 0.31
Nodes (15): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ConsultasCumpleanos(), Dashboard(), addMonthsPreservingDay(), dateFromParts() (+7 more)

### Community 11 - "middleware/auth.js"
Cohesion: 0.11
Nodes (21): authenticateToken(), isUserRevoked(), jwt, requirePermission(), revokedUsers, syncRevokedUsersFromDb(), authenticateAiRequest(), { authenticateToken, requirePermission } (+13 more)

### Community 12 - "withRetry"
Cohesion: 0.12
Nodes (30): getAccountingDb(), withRetry(), { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente } (+22 more)

### Community 13 - "DesignCanvas.jsx"
Cohesion: 0.67
Nodes (3): applySnap(), DesignCanvas(), react-konva

### Community 14 - "@google/genai"
Cohesion: 0.31
Nodes (8): askGeminiAssistant(), getGeminiApiKey(), sanitizeAudioMimeType(), transcribeTelegramVoice(), assert, { describe, it }, {
    sanitizeAudioMimeType,
    getGeminiApiKey,
    transcribeTelegramVoice
}, @google/genai

### Community 15 - "dependencies"
Cohesion: 0.10
Nodes (20): dependencies, axios, axios-cookiejar-support, bcryptjs, cors, dotenv, express, express-rate-limit (+12 more)

### Community 16 - "githubChanges.js"
Cohesion: 0.14
Nodes (17): { authenticateToken, requirePermission }, commitCache, computeCommitKpis(), { execFile }, express, fetchCommitDetail(), fetchGithubCommits(), fetchLocalGitCommits() (+9 more)

### Community 17 - "themeUtils.js"
Cohesion: 0.26
Nodes (16): ThemeModal(), ThemeContext, ThemeProvider(), useTheme(), ConfiguracionTema(), ACCENT_PRESETS, adjustBrightness(), applyCustomThemeCSS() (+8 more)

### Community 18 - "rhPlanillaService.js"
Cohesion: 0.20
Nodes (18): drawReciboSection(), exportBancario(), formatCurrency(), formatFechaHora(), generatePlanillaReportePDF(), generateReciboIndividualPDF(), generateRecibosMasivosPDF(), { getAccountingDb, withRetry } (+10 more)

### Community 19 - "backend/package.json"
Cohesion: 0.11
Nodes (18): author, description, axios, eslint, keywords, license, main, name (+10 more)

### Community 20 - "paymentNotifier.js"
Cohesion: 0.11
Nodes (26): buildBirthdayEmailHtml(), cron, formatSpanishDate(), { getDb, getAccountingDb }, getTodaysBirthdays(), initBirthdayScheduler(), nodemailer, sendBirthdayNotification() (+18 more)

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
Cohesion: 0.12
Nodes (11): fs, path, puppeteer, __dirname, parts, pkg, pkgPath, __dirname (+3 more)

### Community 26 - "generate-icons.cjs"
Cohesion: 0.16
Nodes (11): BG, chunk(), crc32(), CRC_TABLE, fs, OUT_DIR, path, S_ROWS (+3 more)

### Community 27 - "AGENTS.md"
Cohesion: 0.07
Nodes (26): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones, Commands, Deployment & Architecture (VPS Host) (+18 more)

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

### Community 33 - "mysql2"
Cohesion: 0.20
Nodes (4): mysql, mysql, mysql, mysql2

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.18
Nodes (10): axios, dotenv, ensureLogDir(), fs, { getDb }, https, logFile, path (+2 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "ReportPreviewModal"
Cohesion: 0.15
Nodes (26): ReportPreviewModal(), ConsultaCambiosGithub(), formatDateTime(), formatRelativeTime(), TYPE_CONFIG, Consultas(), ControlRecordatorios(), DiferenciasCombustible() (+18 more)

### Community 37 - "tasks.js"
Cohesion: 0.22
Nodes (7): { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, router, { sendSafeError }, taskPerms

### Community 38 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 39 - "telegramBotService.js"
Cohesion: 0.09
Nodes (40): axios, BANK_NAME_MAP, broadcastDiscrepancyAlerts(), clearUserConversationContext(), escapeRegex(), findFuelByKey(), findStationById(), formatDiscrepancyAlertMessage() (+32 more)

### Community 40 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.08
Nodes (43): maskToken(), appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), conversationHistory, getActiveConversationsCount(), { getConsolidadoVentasData } (+35 more)

### Community 43 - "handleIncomingMessage"
Cohesion: 0.15
Nodes (24): analyzeTelegramImageReceipt(), buildAndSendTopicPdf(), formatBancosMessage(), formatChequeraMessage(), formatFeedbackListMessage(), formatReceiptAnalysisMessage(), generateExecutiveReportPdf(), getCachedQuery() (+16 more)

### Community 44 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, axios, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react, react (+6 more)

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
Cohesion: 0.09
Nodes (25): { authenticateToken, requirePermission }, buildFallbackConsolidadoVentas(), conversationalAiService, DEFAULT_AI_SUGGESTIONS, express, getConsolidadoVentasSafe(), {
    getGeminiApiKey,
    parseNaturalLanguageQuery,
    getConsolidadoVentas,
    getSaldosBancosData,
    getSaldosChequeraData,
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatSolarEnergyMessage,
    formatHorasPicoMessage,
    formatAndelsaFinanzasResumenMessage,
    formatAndelsaInventarioMessage,
    formatAndelsaCostosMessage,
    formatAndelsaVentasClienteMessage,
    formatAndelsaVentasProductoMessage,
    formatAndelsaCxcMessage,
    formatRankingMessage,
    formatTiendasMessage,
    formatSpecificStationMessage,
    formatProductTotalMessage,
    formatSpecificBankMessage,
    formatAlertasMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert,
    moneyFmt,
    numFmt,
    normalizeText,
    findStationById,
    SPANISH_MONTH_NAMES,
    KNOWN_STATIONS,
    KNOWN_FUELS,
    KNOWN_BANKS
}, getIsoDate() (+17 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "getDb"
Cohesion: 0.10
Nodes (32): getDb(), { authenticateToken, requirePermission }, express, {
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
}, router, { sendSafeError } (+24 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.10
Nodes (23): configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getExternalDb(), initDB(), mysql (+15 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "errorHandler.js"
Cohesion: 0.09
Nodes (20): { authenticateToken, requirePermission }, catalogosViewPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission }, checkDesignerPerms (+12 more)

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.14
Nodes (9): ErrorBoundary, copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError() (+1 more)

### Community 64 - "Cheques.jsx"
Cohesion: 0.10
Nodes (30): PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox(), CalibrationDialog(), Preview() (+22 more)

### Community 65 - "config.js"
Cohesion: 0.20
Nodes (9): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+1 more)

### Community 66 - "getPuppeteer"
Cohesion: 0.60
Nodes (5): getPuppeteer(), getPuppeteer(), puppeteer, puppeteer-core, @sparticuz/chromium

### Community 67 - "solarEnergyService.js"
Cohesion: 0.25
Nodes (17): buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario(), getSolarAhorroMensual() (+9 more)

### Community 68 - "FinanzasPrestamos.jsx"
Cohesion: 0.30
Nodes (16): FinanzasAsesor(), FinanzasCalculadora(), FinanzasPrestamos(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings(), calculatePMT() (+8 more)

### Community 69 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, eslint, nodemon

### Community 70 - "20260814_create_check_format_tables.js"
Cohesion: 0.25
Nodes (5): dbConfig, dotenv, mysql, path, dotenv

### Community 71 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 72 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

### Community 74 - "autoSyncScheduler.js"
Cohesion: 0.17
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+4 more)

### Community 75 - "VentasEstaciones.jsx"
Cohesion: 0.26
Nodes (10): ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt(), numFmt(), ResumenPista(), VentasEstaciones() (+2 more)

### Community 76 - "webhook-server.js"
Cohesion: 0.20
Nodes (7): crypto, { exec }, http, path, PORT, PROJECT_DIR, server

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

### Community 81 - "operacionesPedidos.test.js"
Cohesion: 0.25
Nodes (7): buildEstacionFilterClause(), calculateHasMore(), parsePedidosPagination(), assert, { describe, it }, { normalizeEstacion, getPortalCredentials, savePortalCredentials }, { parsePedidosPagination, calculateHasMore, buildEstacionFilterClause }

### Community 82 - "AsistenteIA.jsx"
Cohesion: 0.52
Nodes (6): AsistenteIA(), buildStructuredFallbackByIntent(), detectClientIntent(), normalizeAiQueryResponse(), QUICK_CHIPS, renderSafeRichText()

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 698 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `getDb` to `handleSmartNaturalLanguageQuery`, `server.js`, `operaciones.js`, `consultas.js`, `routes/auth.js`, `middleware/auth.js`, `withRetry`, `@google/genai`, `paymentNotifier.js`, `finanzas.js`, `rrhh.test.js`, `energyLatamService.js`, `conciliacion.js`, `bancos.js`, `cheques.js`, `sync-dgehm-direct.js`, `tasks.js`, `dgehmService.js`, `telegramBotService.js`, `telegramAuditorService.js`, `handleIncomingMessage`, `db.js`, `errorHandler.js`, `config.js`, `solarEnergyService.js`, `middleware/bitacora.js`, `autoSyncScheduler.js`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useToast` be split into smaller, more focused modules?**
  _Cohesion score 0.12579281183932348 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `middleware/auth.js` to `cheques.js`, `config.js`, `server.js`, `operaciones.js`, `consultas.js`, `routes/auth.js`, `middleware/bitacora.js`, `tasks.js`, `withRetry`, `githubChanges.js`, `onedrive.js`, `ai.js`, `conciliacion.js`, `finanzas.js`, `getDb`, `errorHandler.js`, `bancos.js`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05978705978705979 - nodes in this community are weakly interconnected._
- **Why does `Bitácora (Audit Log)` connect `middleware/bitacora.js` to `middleware/auth.js`, `AGENTS.md`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._