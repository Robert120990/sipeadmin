# Graph Report - SIPEOFI  (2026-10-12)

## Corpus Check
- 199 files · ~452,250 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .example 2, (none) 2, .bat 2)

## Summary
- 1401 nodes · 3765 edges · 80 communities (73 shown, 7 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 202 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9d0ba586`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ReportPreviewModal
- lazyPages.js
- handleSmartNaturalLanguageQuery
- frontend/package.json
- server.js
- operaciones.js
- consultas.js
- routes/auth.js
- FinanzasInversiones.jsx
- ref_node_assert
- Dashboard.jsx
- errorHandler.js
- inteligencia.js
- useToast
- autoSyncScheduler.js
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
- authorization.test.js
- middleware/auth.js
- dgehmService.js
- telegramAdvancedCapabilities.test.js
- deploy.js
- scripts
- telegramAuditorService.js
- telegram.js
- dependencies
- conversationalAiService.js
- PLAN ESTRATÉGICO DE INTEGRACIÓN: INTELIGENCIA ARTIFICIAL, CONTABILIDAD AUTOMÁTICA Y CONTROL FINANCIERO
- vercel.json
- deploy.sh
- 1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques)
- sw.js
- operacionesPedidos.test.js
- Estándares del Backend - SIPE Admin
- telegramBotService.js
- Reglas de Git, Commits y Sincronización Remota
- devDependencies
- db.js
- scripts
- rrhh.js
- errorDiagnostics.js
- solarEnergyService.js
- react
- getPuppeteer
- Modal
- salesHourlyService.js
- devDependencies
- 20260814_create_check_format_tables.js
- Cheques.jsx
- middleware/bitacora.js
- sync_portal_pedidos.sh
- FinanzasPrestamos.jsx
- VentasEstaciones.jsx
- webhook-server.js
- ConsultaCambiosGithub.jsx
- DesignCanvas.jsx
- sync_dgehm_precios.sh

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 103 edges
2. `getDb()` - 82 edges
3. `react` - 80 edges
4. `lucide-react` - 66 edges
5. `Modal()` - 62 edges
6. `App()` - 60 edges
7. `DashboardLayout()` - 56 edges
8. `api` - 50 edges
9. `withRetry()` - 47 edges
10. `ReportPreviewModal()` - 46 edges

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

## Communities (80 total, 7 thin omitted)

### Community 0 - "ReportPreviewModal"
Cohesion: 0.17
Nodes (27): Regla obligatoria para NUEVAS pantallas (no opcional), ReportPreviewModal(), ConciliacionBancaria(), Consultas(), ConsultasCumpleanos(), ControlRecordatorios(), DiferenciasCombustible(), Lubricantes() (+19 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.07
Nodes (88): Frontend Conventions, Responsive / Mobile, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login (+80 more)

### Community 2 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.30
Nodes (22): escapeHtml(), formatAlertasMessage(), formatBancosMessage(), formatChequeraMessage(), formatFeedbackListMessage(), formatHorasPicoMessage(), formatProductTotalMessage(), formatRankingMessage() (+14 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.11
Nodes (17): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+9 more)

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
Nodes (24): restoreUser(), revokeUser(), { authenticateToken, requirePermission, requireRole, JWT_SECRET, revokeUser, restoreUser }, bcrypt, express, { getDb }, jwt, router (+16 more)

### Community 8 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 9 - "ref_node_assert"
Cohesion: 0.10
Nodes (13): calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), assert, { describe, it }, assert, { describe, it }, assert (+5 more)

### Community 10 - "Dashboard.jsx"
Cohesion: 0.18
Nodes (18): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), createColorIcon(), ICON_ALIASES, bundledCollections (+10 more)

### Community 11 - "errorHandler.js"
Cohesion: 0.08
Nodes (26): { authenticateToken, requirePermission }, express, { GoogleGenAI }, recordatoriosPerms, router, { sendSafeError }, { authenticateToken, requirePermission }, bitacoraPerms (+18 more)

### Community 12 - "inteligencia.js"
Cohesion: 0.13
Nodes (19): { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente }, { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas }, router (+11 more)

### Community 13 - "useToast"
Cohesion: 0.10
Nodes (24): useToast(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, FormatManager(), ICON_MAP, Toolbox(), CalibrationDialog() (+16 more)

### Community 14 - "autoSyncScheduler.js"
Cohesion: 0.17
Nodes (12): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+4 more)

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
Nodes (33): fetchCachedExternalConfig(), getAccountingDb(), withRetry(), withTransaction(), getPreciosEstacionData(), { getDb, getAccountingDb, withRetry }, getFlujoCajaProyectado(), getRiesgoCreditoFlotas() (+25 more)

### Community 19 - "backend/package.json"
Cohesion: 0.11
Nodes (18): author, description, axios, eslint, keywords, license, main, name (+10 more)

### Community 20 - "config.js"
Cohesion: 0.08
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
Cohesion: 0.20
Nodes (10): axios, dotenv, ensureLogDir(), fs, { getDb }, https, logFile, path (+2 more)

### Community 35 - "scripts"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, build:all, deploy, lint, test (+1 more)

### Community 36 - "authorization.test.js"
Cohesion: 0.20
Nodes (5): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }

### Community 37 - "middleware/auth.js"
Cohesion: 0.10
Nodes (24): authenticateToken(), isAdminUser(), isUserRevoked(), jwt, requirePermission(), requireRole(), revokedUsers, syncRevokedUsersFromDb() (+16 more)

### Community 38 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 39 - "telegramAdvancedCapabilities.test.js"
Cohesion: 0.11
Nodes (28): askGeminiAssistant(), broadcastDiscrepancyAlerts(), clearUserConversationContext(), escapeRegex(), findFuelByKey(), findStationById(), formatDiscrepancyAlertMessage(), formatYMD() (+20 more)

### Community 40 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "telegramAuditorService.js"
Cohesion: 0.15
Nodes (26): activeUsers, checkDatabasesHealth(), checkFeedbackMetrics(), clearErrors(), errorBuffer, formatDiagnosticsMessage(), getActiveUsersCount(), { getDb, getExternalDb } (+18 more)

### Community 43 - "telegram.js"
Cohesion: 0.17
Nodes (12): { authenticateToken, requirePermission }, express, {
    getBotStatus,
    testTelegramConnection,
    restartTelegramBot,
    initTelegramBot,
    stopTelegramBot,
    sendTelegramMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert,
    getFeedbackStats,
    getFeedbackList
}, { getDb }, {
    getHealthDiagnostics,
    getErrors,
    clearErrors
}, maskToken(), router, { sendSafeError } (+4 more)

### Community 44 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, axios, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react, react (+6 more)

### Community 45 - "conversationalAiService.js"
Cohesion: 0.15
Nodes (18): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), conversationHistory, getActiveConversationsCount(), { getConsolidadoVentasData }, { getDb } (+10 more)

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

### Community 54 - "operacionesPedidos.test.js"
Cohesion: 0.25
Nodes (7): buildEstacionFilterClause(), calculateHasMore(), parsePedidosPagination(), assert, { describe, it }, { normalizeEstacion, getPortalCredentials, savePortalCredentials }, { parsePedidosPagination, calculateHasMore, buildEstacionFilterClause }

### Community 55 - "Estándares del Backend - SIPE Admin"
Cohesion: 0.29
Nodes (6): 1. Estructura de Archivos, 2. Creación de Nuevos Módulos, 3. Manejo de Errores, 4. WebSockets, 5. Base de Datos Externa, Estándares del Backend - SIPE Admin

### Community 56 - "telegramBotService.js"
Cohesion: 0.13
Nodes (38): getDb(), answerCallbackQuery(), axios, BANK_NAME_MAP, broadcastCustomAlert(), createFeedbackEntry(), editMessageReplyMarkup(), formatHelpMessage() (+30 more)

### Community 57 - "Reglas de Git, Commits y Sincronización Remota"
Cohesion: 0.40
Nodes (4): 1. Verificación y Sincronización Previa a cualquier Push, 2. Commits Atómicos, 3. Mensajes de Commit Estrictamente en Español, Reglas de Git, Commits y Sincronización Remota

### Community 58 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @iconify-json/flat-color-icons, @iconify-json/fluent-color, @iconify-json/fluent-emoji-flat (+4 more)

### Community 60 - "db.js"
Cohesion: 0.13
Nodes (16): configCache, dbConfig, dotenv, externalPools, getExternalDb(), initDB(), mysql, { getExternalDb } (+8 more)

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

### Community 62 - "rrhh.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, express, PERMISSION_REQUIRED, rhPlanillaService, router, { sendSafeError }

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.14
Nodes (9): ErrorBoundary, copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError() (+1 more)

### Community 64 - "solarEnergyService.js"
Cohesion: 0.22
Nodes (15): buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario(), getSolarAhorroMensual(), getSolarAhorroRango() (+7 more)

### Community 65 - "react"
Cohesion: 0.18
Nodes (14): ToastContext, EstrategiaCombustible(), EstrategiaCreditos(), EstrategiaFlujoCaja(), EstrategiaMermas(), EstrategiaRentabilidad(), EstrategiaTorreControl(), CATEGORIAS (+6 more)

### Community 66 - "getPuppeteer"
Cohesion: 0.60
Nodes (5): getPuppeteer(), getPuppeteer(), puppeteer, puppeteer-core, @sparticuz/chromium

### Community 67 - "Modal"
Cohesion: 0.20
Nodes (15): 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), Carriers(), ChequesContado(), ToggleSwitch() (+7 more)

### Community 68 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 69 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, eslint, nodemon

### Community 70 - "20260814_create_check_format_tables.js"
Cohesion: 0.25
Nodes (5): dbConfig, dotenv, mysql, path, dotenv

### Community 71 - "Cheques.jsx"
Cohesion: 0.23
Nodes (15): CheckPdfService, DesignerService, PrintEngine, Cheques(), ImpresionCheques(), CENTENAS, DECENAS, formatearFechaEnLetras() (+7 more)

### Community 72 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

### Community 74 - "FinanzasPrestamos.jsx"
Cohesion: 0.29
Nodes (16): FinanzasCalculadora(), FinanzasPrestamos(), FinanzasResumen(), addPeriodToDate(), calculateDisbursementCommission(), calculatePeriodInsurance(), calculatePeriodSavings(), calculatePMT() (+8 more)

### Community 75 - "VentasEstaciones.jsx"
Cohesion: 0.22
Nodes (12): CorteTiendaModal(), moneyFmt(), ConciliacionEfectivoCard(), DiferenciaDescuadreModal(), moneyFmt(), DrillDownPistaModal(), moneyFmt(), numFmt() (+4 more)

### Community 76 - "webhook-server.js"
Cohesion: 0.20
Nodes (7): crypto, { exec }, http, path, PORT, PROJECT_DIR, server

### Community 77 - "ConsultaCambiosGithub.jsx"
Cohesion: 0.60
Nodes (4): ConsultaCambiosGithub(), formatDateTime(), formatRelativeTime(), TYPE_CONFIG

### Community 78 - "DesignCanvas.jsx"
Cohesion: 0.67
Nodes (3): applySnap(), DesignCanvas(), react-konva

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 648 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `telegramBotService.js` to `server.js`, `operaciones.js`, `consultas.js`, `routes/auth.js`, `errorHandler.js`, `inteligencia.js`, `autoSyncScheduler.js`, `withRetry`, `config.js`, `finanzas.js`, `rrhh.test.js`, `energyLatamService.js`, `conciliacion.js`, `bancos.js`, `cheques.js`, `sync-dgehm-direct.js`, `middleware/auth.js`, `dgehmService.js`, `telegramAdvancedCapabilities.test.js`, `telegramAuditorService.js`, `telegram.js`, `conversationalAiService.js`, `db.js`, `solarEnergyService.js`, `middleware/bitacora.js`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06752475247524753 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `middleware/auth.js` to `cheques.js`, `server.js`, `operaciones.js`, `consultas.js`, `routes/auth.js`, `middleware/bitacora.js`, `errorHandler.js`, `inteligencia.js`, `telegram.js`, `githubChanges.js`, `config.js`, `finanzas.js`, `onedrive.js`, `rrhh.js`, `conciliacion.js`, `bancos.js`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Modal()` (e.g. with `Regla obligatoria para NUEVAS pantallas (no opcional)` and `Responsive / Mobile`) actually correct?**
  _`Modal()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `frontend/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._