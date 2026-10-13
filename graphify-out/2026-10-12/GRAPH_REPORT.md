# Graph Report - SIPEOFI  (2026-10-12)

## Corpus Check
- 198 files · ~451,980 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .example 2, (none) 2, .bat 2)

## Summary
- 1397 nodes · 3760 edges · 74 communities (68 shown, 6 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 201 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `32f482f4`
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
- middleware/auth.js
- FinanzasInversiones.jsx
- ref_node_assert
- Dashboard.jsx
- errorHandler.js
- getAccountingDb
- DesignerView.jsx
- autoSyncScheduler.js
- dependencies
- githubChanges.js
- themeUtils.js
- rhPlanillaService.js
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
- tasks.js
- dgehmService.js
- telegramBotService.js
- deploy.js
- scripts
- getDb
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
- handleIncomingMessage
- Reglas de Git, Commits y Sincronización Remota
- devDependencies
- db.js
- scripts
- rrhh.js
- errorDiagnostics.js
- solarEnergyService.js
- useDesigner.js
- getPuppeteer
- solarAndSalesHourly.test.js
- salesHourlyService.js
- devDependencies
- 20260814_create_check_format_tables.js
- catalogos.js
- middleware/bitacora.js
- sync_portal_pedidos.sh

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

## Communities (74 total, 6 thin omitted)

### Community 0 - "useToast"
Cohesion: 0.06
Nodes (114): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), ReportPreviewModal(), ToastContext (+106 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.07
Nodes (88): Frontend Conventions, Responsive / Mobile, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login (+80 more)

### Community 2 - "handleSmartNaturalLanguageQuery"
Cohesion: 0.28
Nodes (23): escapeHtml(), formatAlertasMessage(), formatBancosMessage(), formatChequeraMessage(), formatFeedbackListMessage(), formatHorasPicoMessage(), formatProductTotalMessage(), formatProfileMessage() (+15 more)

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
Cohesion: 0.08
Nodes (39): withRetry(), { authenticateToken, requirePermission }, branchToEmpId, cierreViewPerms, cumpleanosViewPerms, diferenciasViewPerms, express, fletesViewPerms (+31 more)

### Community 7 - "middleware/auth.js"
Cohesion: 0.07
Nodes (34): authenticateToken(), isAdminUser(), isUserRevoked(), jwt, requirePermission(), requireRole(), restoreUser(), revokedUsers (+26 more)

### Community 8 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 9 - "ref_node_assert"
Cohesion: 0.14
Nodes (6): assert, { describe, it }, assert, { describe, it }, assert, { describe, it }

### Community 10 - "Dashboard.jsx"
Cohesion: 0.18
Nodes (18): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), createColorIcon(), ICON_ALIASES, bundledCollections (+10 more)

### Community 11 - "errorHandler.js"
Cohesion: 0.08
Nodes (26): { authenticateToken, requirePermission }, express, { GoogleGenAI }, recordatoriosPerms, router, { sendSafeError }, { authenticateToken, requirePermission }, bitacoraPerms (+18 more)

### Community 12 - "getAccountingDb"
Cohesion: 0.10
Nodes (29): getAccountingDb(), { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente }, { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas } (+21 more)

### Community 13 - "DesignerView.jsx"
Cohesion: 0.25
Nodes (10): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, Toolbox(), CalibrationDialog(), Preview() (+2 more)

### Community 14 - "autoSyncScheduler.js"
Cohesion: 0.16
Nodes (13): AUTO_SYNC_FORMATTED_HOURS, AUTO_SYNC_HOURS, cron, energyLatamService, executeAutoSyncCycle(), getAutoSyncStatus(), initAutoSyncScheduler(), lastSyncMetadata (+5 more)

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

### Community 20 - "config.js"
Cohesion: 0.08
Nodes (34): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+26 more)

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
Cohesion: 0.10
Nodes (12): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }, crypto, { exec }, http (+4 more)

### Community 37 - "tasks.js"
Cohesion: 0.22
Nodes (7): { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, router, { sendSafeError }, taskPerms

### Community 38 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 39 - "telegramBotService.js"
Cohesion: 0.08
Nodes (46): answerCallbackQuery(), askGeminiAssistant(), axios, BANK_NAME_MAP, broadcastDiscrepancyAlerts(), clearUserConversationContext(), createFeedbackEntry(), editMessageReplyMarkup() (+38 more)

### Community 40 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "getDb"
Cohesion: 0.14
Nodes (29): getDb(), maskToken(), learnAlias(), activeUsers, checkDatabasesHealth(), checkFeedbackMetrics(), clearErrors(), errorBuffer (+21 more)

### Community 43 - "telegram.js"
Cohesion: 0.16
Nodes (18): { authenticateToken, requirePermission }, express, {
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
}, router, { sendSafeError }, telegramPerms (+10 more)

### Community 44 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, axios, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react, react (+6 more)

### Community 45 - "conversationalAiService.js"
Cohesion: 0.16
Nodes (17): appendToHistory(), askConversationalAgent(), cleanExpiredSessions(), clearConversation(), conversationHistory, getActiveConversationsCount(), { getConsolidadoVentasData }, { getDb } (+9 more)

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

### Community 56 - "handleIncomingMessage"
Cohesion: 0.24
Nodes (11): formatHelpMessage(), formatIntelligentGuidanceMessage(), getDateStr(), getFeedbackList(), getSaldosBancosData(), getSaldosChequeraData(), getUserConversationContext(), getUserEffectivePermissions() (+3 more)

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

### Community 62 - "rrhh.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, express, PERMISSION_REQUIRED, rhPlanillaService, router, { sendSafeError }

### Community 63 - "errorDiagnostics.js"
Cohesion: 0.14
Nodes (9): ErrorBoundary, copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError() (+1 more)

### Community 64 - "solarEnergyService.js"
Cohesion: 0.22
Nodes (15): buildLiveProjectContext(), calcularRegistroDiarioAnalitico(), { getDb, withRetry }, getDeterministicVariation(), getInstalacionesSolares(), getSolarAhorroDiario(), getSolarAhorroMensual(), getSolarAhorroRango() (+7 more)

### Community 65 - "useDesigner.js"
Cohesion: 0.27
Nodes (7): ICON_MAP, snapToGridValue(), useDesigner(), TIPOS_CAMPO, VARIABLES_DISPONIBLES, CheckDesigner(), uuid

### Community 66 - "getPuppeteer"
Cohesion: 0.60
Nodes (5): getPuppeteer(), getPuppeteer(), puppeteer, puppeteer-core, @sparticuz/chromium

### Community 67 - "solarAndSalesHourly.test.js"
Cohesion: 0.40
Nodes (4): assert, { describe, it }, salesHourlyService, solarEnergyService

### Community 68 - "salesHourlyService.js"
Cohesion: 0.34
Nodes (12): compilarAnalisisHoras(), generarFallbackAnaliticoHoras(), { getAccountingDb, withRetry }, getFranjaCategoria(), getFranjaLabel(), getHorasPicoRango(), getHorasPicoVentas(), getVolumenDiarioEstimado() (+4 more)

### Community 69 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, eslint, nodemon

### Community 70 - "20260814_create_check_format_tables.js"
Cohesion: 0.25
Nodes (5): dbConfig, dotenv, mysql, path, dotenv

### Community 71 - "catalogos.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, catalogosViewPerms, express, { getDb }, router, { sendSafeError }

### Community 72 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 645 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `getDb` to `server.js`, `operaciones.js`, `consultas.js`, `middleware/auth.js`, `errorHandler.js`, `getAccountingDb`, `autoSyncScheduler.js`, `config.js`, `finanzas.js`, `rrhh.test.js`, `energyLatamService.js`, `conciliacion.js`, `bancos.js`, `cheques.js`, `sync-dgehm-direct.js`, `tasks.js`, `dgehmService.js`, `telegramBotService.js`, `telegram.js`, `conversationalAiService.js`, `handleIncomingMessage`, `db.js`, `solarEnergyService.js`, `catalogos.js`, `middleware/bitacora.js`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useToast` be split into smaller, more focused modules?**
  _Cohesion score 0.05680658139674533 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `middleware/auth.js` to `cheques.js`, `server.js`, `operaciones.js`, `consultas.js`, `catalogos.js`, `middleware/bitacora.js`, `tasks.js`, `errorHandler.js`, `getAccountingDb`, `telegram.js`, `githubChanges.js`, `config.js`, `finanzas.js`, `onedrive.js`, `rrhh.js`, `conciliacion.js`, `bancos.js`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Modal()` (e.g. with `Regla obligatoria para NUEVAS pantallas (no opcional)` and `Responsive / Mobile`) actually correct?**
  _`Modal()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06752475247524753 - nodes in this community are weakly interconnected._