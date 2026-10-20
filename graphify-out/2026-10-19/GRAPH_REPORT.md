# Graph Report - SIPEOFI  (2026-10-15)

## Corpus Check
- 209 files · ~489,549 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 3, .example 2, .bat 2)

## Summary
- 1553 nodes · 4290 edges · 75 communities (68 shown, 7 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 245 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `292e35cc`
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
- auth.test.js
- handleIncomingMessage
- ref_node_assert
- Dashboard.jsx
- express
- inteligencia.js
- DesignerView.jsx
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
- energyLatamService.js
- conciliacion.js
- bancos.js
- cheques.js
- ref_path
- sync-dgehm-direct.js
- scripts
- @google/genai
- aiGateway.test.js
- dgehmService.js
- broadcastDiscrepancyAlerts
- scripts
- telegramAuditorService.js
- telegramAdvancedCapabilities.test.js
- dependencies
- telegramPerformance.test.js
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
- getDb
- scripts
- middleware/auth.js
- useDesigner.js
- routes/auth.js
- 20260814_create_check_format_tables.js
- deploy.js
- salesHourlyService.js
- sync_portal_pedidos.sh
- autoSyncScheduler.js
- webhook-server.js
- sync_dgehm_precios.sh
- FinanzasInversiones.jsx
- operacionesPedidos.test.js
- getPuppeteer
- devDependencies

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 107 edges
2. `getDb()` - 84 edges
3. `react` - 83 edges
4. `lucide-react` - 69 edges
5. `App()` - 62 edges
6. `Modal()` - 62 edges
7. `DashboardLayout()` - 59 edges
8. `withRetry()` - 54 edges
9. `handleIncomingMessage()` - 52 edges
10. `api` - 52 edges

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

## Communities (75 total, 7 thin omitted)

### Community 0 - "useToast"
Cohesion: 0.05
Nodes (127): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), ESTRATEGIA_TABS, EstrategiaNav(), Modal() (+119 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.05
Nodes (100): Frontend Conventions, Responsive / Mobile, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login (+92 more)

### Community 2 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.18
Nodes (37): handleAiQuery(), escapeHtml(), formatAlertasMessage(), formatAndelsaCostosMessage(), formatAndelsaCxcMessage(), formatAndelsaFinanzasResumenMessage(), formatAndelsaInventarioMessage(), formatAndelsaVentasClienteMessage() (+29 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.12
Nodes (16): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+8 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (46): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole, JWT_SECRET, isUserRevoked }, authRoutes, { autoLogMiddleware } (+38 more)

### Community 5 - "operaciones.js"
Cohesion: 0.09
Nodes (21): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, crypto, energiaSolarViewPerms, energyLatamService, express, fetchPromedios(), fetchTankReadings() (+13 more)

### Community 6 - "consultas.js"
Cohesion: 0.07
Nodes (42): authenticateSyncOrAdmin(), { authenticateToken, requirePermission }, branchToEmpId, cierreViewPerms, crypto, cumpleanosViewPerms, diferenciasViewPerms, express (+34 more)

### Community 7 - "auth.test.js"
Cohesion: 0.15
Nodes (12): Bitácora (Audit Log), restoreUser(), autoLogMiddleware(), { getDb }, logAction(), sanitizeData(), assert, { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser } (+4 more)

### Community 8 - "handleIncomingMessage"
Cohesion: 0.21
Nodes (15): broadcastCustomAlert(), createFeedbackEntry(), formatBancosMessage(), formatChequeraMessage(), formatFeedbackListMessage(), formatHelpMessage(), formatReceiptAnalysisMessage(), getMainReplyKeyboard() (+7 more)

### Community 9 - "ref_node_assert"
Cohesion: 0.07
Nodes (18): verifyReceiptInBankMovements(), assert, { describe, it }, assert, { describe, it }, assert, axios, { describe, it, beforeEach, afterEach } (+10 more)

### Community 10 - "Dashboard.jsx"
Cohesion: 0.16
Nodes (20): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), createColorIcon(), ICON_ALIASES, bundledCollections (+12 more)

### Community 11 - "express"
Cohesion: 0.14
Nodes (12): { authenticateToken, requirePermission }, checkDesignerPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken }, express (+4 more)

### Community 12 - "inteligencia.js"
Cohesion: 0.10
Nodes (26): { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente }, { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas }, router (+18 more)

### Community 13 - "DesignerView.jsx"
Cohesion: 0.25
Nodes (10): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, Toolbox(), CalibrationDialog(), Preview() (+2 more)

### Community 14 - "errorHandler.js"
Cohesion: 0.17
Nodes (6): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }, crypto

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
Nodes (27): getAccountingDb(), withRetry(), { getDb, getAccountingDb, withRetry }, getFlujoCajaProyectado(), { getAccountingDb, withRetry }, getRentabilidadPorEstacion(), drawReciboSection(), exportBancario() (+19 more)

### Community 19 - "backend/package.json"
Cohesion: 0.11
Nodes (18): author, description, axios, eslint, keywords, license, main, name (+10 more)

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
Cohesion: 0.17
Nodes (6): mysql, path, mysql, path, mysql, mysql2

### Community 34 - "sync-dgehm-direct.js"
Cohesion: 0.20
Nodes (10): axios, dotenv, ensureLogDir(), fs, { getDb }, https, logFile, path (+2 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "@google/genai"
Cohesion: 0.29
Nodes (9): analyzeTelegramImageReceipt(), askGeminiAssistant(), getGeminiApiKey(), sanitizeAudioMimeType(), transcribeTelegramVoice(), assert, { describe, it }, {
    sanitizeAudioMimeType,
    getGeminiApiKey,
    transcribeTelegramVoice
} (+1 more)

### Community 37 - "aiGateway.test.js"
Cohesion: 0.20
Nodes (7): aiRouter, assert, axios, { describe, it, beforeEach, afterEach }, jwt, { JWT_SECRET }, jsonwebtoken

### Community 38 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 40 - "broadcastDiscrepancyAlerts"
Cohesion: 0.27
Nodes (14): broadcastDiscrepancyAlerts(), buildAndSendTopicPdf(), formatDiscrepancyAlertMessage(), generateExecutiveReportPdf(), getCachedQuery(), getConsolidadoVentas(), getDateStr(), getDiscrepancyInlineMarkup() (+6 more)

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.08
Nodes (43): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), conversationHistory, getActiveConversationsCount(), { getConsolidadoVentasData }, { getDb } (+35 more)

### Community 43 - "telegramAdvancedCapabilities.test.js"
Cohesion: 0.15
Nodes (19): clearUserConversationContext(), escapeRegex(), findFuelByKey(), findStationById(), formatYMD(), normalizeText(), parseNaturalLanguageQuery(), parseSpanishDateText() (+11 more)

### Community 44 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, axios, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react, react (+6 more)

### Community 45 - "telegramPerformance.test.js"
Cohesion: 0.07
Nodes (50): buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), clearSolarCache(), getCachedSolar(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario() (+42 more)

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
Nodes (33): authenticateAiRequest(), { authenticateToken, requirePermission, isAdminUser }, buildFallbackConsolidadoVentas(), conversationalAiService, crypto, DEFAULT_AI_SUGGESTIONS, express, getConsolidadoVentasSafe() (+25 more)

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegramBotService.js"
Cohesion: 0.10
Nodes (33): { authenticateToken, requirePermission }, crypto, express, {
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
}, maskToken(), router (+25 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "getDb"
Cohesion: 0.13
Nodes (21): configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getDb(), getExternalDb(), initDB() (+13 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "middleware/auth.js"
Cohesion: 0.08
Nodes (27): authenticateToken(), isUserRevoked(), jwt, requirePermission(), revokedUsers, revokeUser(), syncRevokedUsersFromDb(), { authenticateToken, requirePermission } (+19 more)

### Community 64 - "useDesigner.js"
Cohesion: 0.27
Nodes (7): ICON_MAP, snapToGridValue(), useDesigner(), TIPOS_CAMPO, VARIABLES_DISPONIBLES, CheckDesigner(), uuid

### Community 65 - "routes/auth.js"
Cohesion: 0.09
Nodes (19): isAdminUser(), requireRole(), { authenticateToken, requirePermission, requireRole, isAdminUser, JWT_SECRET, revokeUser, restoreUser }, bcrypt, express, { getDb }, jwt, router (+11 more)

### Community 68 - "20260814_create_check_format_tables.js"
Cohesion: 0.25
Nodes (5): dbConfig, dotenv, mysql, path, dotenv

### Community 69 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 71 - "salesHourlyService.js"
Cohesion: 0.21
Nodes (16): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+8 more)

### Community 74 - "autoSyncScheduler.js"
Cohesion: 0.17
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+4 more)

### Community 76 - "webhook-server.js"
Cohesion: 0.22
Nodes (7): crypto, { exec }, http, path, PORT, PROJECT_DIR, server

### Community 80 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 81 - "operacionesPedidos.test.js"
Cohesion: 0.25
Nodes (7): buildEstacionFilterClause(), calculateHasMore(), parsePedidosPagination(), assert, { describe, it }, { normalizeEstacion, getPortalCredentials, savePortalCredentials }, { parsePedidosPagination, calculateHasMore, buildEstacionFilterClause }

### Community 82 - "getPuppeteer"
Cohesion: 0.60
Nodes (5): getPuppeteer(), getPuppeteer(), puppeteer, puppeteer-core, @sparticuz/chromium

### Community 83 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, eslint, nodemon

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 715 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `getDb` to `handleSmartNaturalLanguageQuery`, `server.js`, `operaciones.js`, `consultas.js`, `auth.test.js`, `handleIncomingMessage`, `ref_node_assert`, `express`, `inteligencia.js`, `withRetry`, `config.js`, `finanzas.js`, `rrhh.test.js`, `energyLatamService.js`, `conciliacion.js`, `bancos.js`, `cheques.js`, `sync-dgehm-direct.js`, `@google/genai`, `dgehmService.js`, `broadcastDiscrepancyAlerts`, `telegramAuditorService.js`, `telegramPerformance.test.js`, `telegramBotService.js`, `middleware/auth.js`, `routes/auth.js`, `autoSyncScheduler.js`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useToast` be split into smaller, more focused modules?**
  _Cohesion score 0.050243830353184575 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `middleware/auth.js` to `cheques.js`, `routes/auth.js`, `server.js`, `operaciones.js`, `consultas.js`, `auth.test.js`, `express`, `inteligencia.js`, `githubChanges.js`, `config.js`, `onedrive.js`, `ai.js`, `finanzas.js`, `telegramBotService.js`, `conciliacion.js`, `bancos.js`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05028571428571429 - nodes in this community are weakly interconnected._
- **Why does `express` connect `express` to `cheques.js`, `routes/auth.js`, `server.js`, `operaciones.js`, `consultas.js`, `inteligencia.js`, `githubChanges.js`, `backend/package.json`, `config.js`, `onedrive.js`, `ai.js`, `conciliacion.js`, `finanzas.js`, `telegramBotService.js`, `middleware/auth.js`, `bancos.js`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._