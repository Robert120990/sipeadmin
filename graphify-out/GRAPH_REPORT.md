# Graph Report - SIPEOFI  (2026-10-12)

## Corpus Check
- 194 files · ~436,937 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .example 2, (none) 2, .bat 2)

## Summary
- 1340 nodes · 3574 edges · 67 communities (62 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 171 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eb601f6a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useToast
- lazyPages.js
- telegramBotService.js
- frontend/package.json
- server.js
- operaciones.js
- consultas.js
- middleware/auth.js
- FinanzasInversiones.jsx
- conversationalAiService.js
- Dashboard.jsx
- errorHandler.js
- inteligencia.js
- Cheques.jsx
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
- webhook-server.js
- tasks.js
- dgehmService.js
- 20260814_create_check_format_tables.js
- deploy.js
- scripts
- withTransaction
- getPuppeteer
- dependencies
- middleware/bitacora.js
- PLAN ESTRATÉGICO DE INTEGRACIÓN: INTELIGENCIA ARTIFICIAL, CONTABILIDAD AUTOMÁTICA Y CONTROL FINANCIERO
- vercel.json
- deploy.sh
- 1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques)
- sw.js
- operacionesPedidos.test.js
- Estándares del Backend - SIPE Admin
- devDependencies
- Reglas de Git, Commits y Sincronización Remota
- devDependencies
- db.js
- scripts
- routes/bitacora.js
- creditRiskService.js
- telegramAlerts.test.js
- authorization.test.js
- ai.js

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 103 edges
2. `react` - 80 edges
3. `getDb()` - 76 edges
4. `lucide-react` - 66 edges
5. `Modal()` - 62 edges
6. `App()` - 60 edges
7. `DashboardLayout()` - 56 edges
8. `api` - 50 edges
9. `withRetry()` - 47 edges
10. `ReportPreviewModal()` - 46 edges

## Surprising Connections (you probably didn't know these)
- `Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)` --references--> `ReportPreviewModal()`  [INFERRED]
  AGENTS.md → frontend/src/components/ReportPreviewModal.jsx
- `PWA` --references--> `UpdateNotifier()`  [INFERRED]
  AGENTS.md → frontend/src/components/UpdateNotifier.jsx
- `Versioning` --references--> `UpdateNotifier()`  [INFERRED]
  AGENTS.md → frontend/src/components/UpdateNotifier.jsx
- `Frontend` --references--> `UpdateNotifier()`  [INFERRED]
  README.md → frontend/src/components/UpdateNotifier.jsx
- `🚀 Arquitectura y Entorno de Producción` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js

## Import Cycles
- 2-file cycle: `backend/services/conversationalAiService.js -> backend/services/telegramBotService.js -> backend/services/conversationalAiService.js`
- 2-file cycle: `backend/db.js -> backend/services/solarEnergyService.js -> backend/db.js`
- 2-file cycle: `backend/db.js -> backend/services/energyLatamService.js -> backend/db.js`

## Communities (67 total, 5 thin omitted)

### Community 0 - "useToast"
Cohesion: 0.07
Nodes (99): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), ReportPreviewModal(), ToastContext (+91 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.05
Nodes (97): Frontend Conventions, Responsive / Mobile, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login (+89 more)

### Community 2 - "telegramBotService.js"
Cohesion: 0.08
Nodes (80): getDb(), { authenticateToken, requirePermission }, express, {
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
}, { getDb }, router, { sendSafeError }, telegramPerms (+72 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.11
Nodes (17): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+9 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (45): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole }, authRoutes, { autoLogMiddleware } (+37 more)

### Community 5 - "operaciones.js"
Cohesion: 0.12
Nodes (15): { authenticateToken, requirePermission }, energyLatamService, express, fetchPromedios(), fetchTankReadings(), { getDb, getExternalDb, getAccountingDb, withRetry }, OFFICIAL_ESTACIONES, pedidosViewPerms (+7 more)

### Community 6 - "consultas.js"
Cohesion: 0.08
Nodes (38): { authenticateToken, requirePermission }, branchToEmpId, cierreViewPerms, cumpleanosViewPerms, diferenciasViewPerms, express, fletesViewPerms, formatYMD() (+30 more)

### Community 7 - "middleware/auth.js"
Cohesion: 0.10
Nodes (25): authenticateToken(), isAdminUser(), isUserRevoked(), jwt, requirePermission(), requireRole(), restoreUser(), revokedUsers (+17 more)

### Community 8 - "FinanzasInversiones.jsx"
Cohesion: 0.64
Nodes (8): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), generateSensitivityScenarios()

### Community 9 - "conversationalAiService.js"
Cohesion: 0.05
Nodes (53): appendToHistory(), askConversationalAgent(), buildLiveProjectContext(), cleanExpiredSessions(), clearConversation(), conversationHistory, { getConsolidadoVentasData }, { getDb } (+45 more)

### Community 10 - "Dashboard.jsx"
Cohesion: 0.18
Nodes (18): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), createColorIcon(), ICON_ALIASES, bundledCollections (+10 more)

### Community 11 - "errorHandler.js"
Cohesion: 0.08
Nodes (26): { authenticateToken, requirePermission }, catalogosViewPerms, express, { getDb }, router, { sendSafeError }, { authenticateToken, requirePermission }, checkDesignerPerms (+18 more)

### Community 12 - "inteligencia.js"
Cohesion: 0.10
Nodes (24): { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente }, { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas }, router (+16 more)

### Community 13 - "Cheques.jsx"
Cohesion: 0.09
Nodes (32): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, ICON_MAP, Toolbox(), CalibrationDialog() (+24 more)

### Community 14 - "autoSyncScheduler.js"
Cohesion: 0.17
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

### Community 18 - "withRetry"
Cohesion: 0.21
Nodes (24): getAccountingDb(), withRetry(), anularPagoPlanilla(), drawReciboSection(), exportBancario(), formatCurrency(), formatFechaHora(), generatePlanillaReportePDF() (+16 more)

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
Cohesion: 0.10
Nodes (18): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n, Commands, Deployment & Architecture (VPS Host) (+10 more)

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

### Community 36 - "webhook-server.js"
Cohesion: 0.20
Nodes (7): crypto, { exec }, http, path, PORT, PROJECT_DIR, server

### Community 37 - "tasks.js"
Cohesion: 0.22
Nodes (7): { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, router, { sendSafeError }, taskPerms

### Community 38 - "dgehmService.js"
Cohesion: 0.31
Nodes (6): cleanNum(), fetchDgehmPrices(), fs, normalizeName(), path, syncDgehmWithDatabase()

### Community 39 - "20260814_create_check_format_tables.js"
Cohesion: 0.25
Nodes (5): dbConfig, dotenv, mysql, path, dotenv

### Community 40 - "deploy.js"
Cohesion: 0.25
Nodes (6): { execSync }, path, parts, pkg, pkgPath, { readFileSync }

### Community 41 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, backup:db, dev, lint, start, sync:dgehm, test

### Community 42 - "withTransaction"
Cohesion: 0.25
Nodes (8): withTransaction(), 🚀 Arquitectura y Entorno de Producción, Backend, 💻 Comandos Principales, Frontend, 🔒 Seguridad y Control de Acceso, SIPE Admin, 🛠️ Tecnologías

### Community 43 - "getPuppeteer"
Cohesion: 0.60
Nodes (5): getPuppeteer(), getPuppeteer(), puppeteer, puppeteer-core, @sparticuz/chromium

### Community 44 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, axios, @iconify/react, jspdf, jspdf-autotable, konva, lucide-react, react (+6 more)

### Community 45 - "middleware/bitacora.js"
Cohesion: 0.47
Nodes (5): Bitácora (Audit Log), autoLogMiddleware(), { getDb }, logAction(), sanitizeData()

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

### Community 56 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, eslint, nodemon

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

### Community 62 - "routes/bitacora.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, bitacoraPerms, express, { getDb }, router, { sendSafeError }

### Community 63 - "creditRiskService.js"
Cohesion: 0.50
Nodes (4): calcularEstadoPagoDte(), { getAccountingDb, withRetry }, getDetalleDtesCliente(), getRiesgoCreditoFlotas()

### Community 65 - "telegramAlerts.test.js"
Cohesion: 0.17
Nodes (8): assert, axios, { describe, it, beforeEach, afterEach }, {
    formatDiscrepancyAlertMessage,
    broadcastDiscrepancyAlerts,
    broadcastCustomAlert
}, jwt, { JWT_SECRET }, telegramRouter, jsonwebtoken

### Community 66 - "authorization.test.js"
Cohesion: 0.20
Nodes (5): assert, crypto, { describe, it }, { requirePermission }, { sendSafeError }

### Community 67 - "ai.js"
Cohesion: 0.25
Nodes (7): { authenticateToken, requirePermission }, express, { GoogleGenAI }, recordatoriosPerms, router, { sendSafeError }, @google/genai

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 625 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `telegramBotService.js` to `server.js`, `operaciones.js`, `consultas.js`, `middleware/auth.js`, `conversationalAiService.js`, `errorHandler.js`, `inteligencia.js`, `withRetry`, `config.js`, `finanzas.js`, `rrhh.test.js`, `energyLatamService.js`, `conciliacion.js`, `bancos.js`, `cheques.js`, `sync-dgehm-direct.js`, `tasks.js`, `dgehmService.js`, `withTransaction`, `middleware/bitacora.js`, `db.js`, `routes/bitacora.js`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useToast` be split into smaller, more focused modules?**
  _Cohesion score 0.06517905068629706 - nodes in this community are weakly interconnected._
- **Why does `react` connect `useToast` to `lazyPages.js`, `frontend/package.json`, `FinanzasInversiones.jsx`, `Dashboard.jsx`, `Cheques.jsx`, `themeUtils.js`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Modal()` (e.g. with `Regla obligatoria para NUEVAS pantallas (no opcional)` and `Responsive / Mobile`) actually correct?**
  _`Modal()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05048518227117755 - nodes in this community are weakly interconnected._