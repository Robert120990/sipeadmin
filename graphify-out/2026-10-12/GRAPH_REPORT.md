# Graph Report - SIPEOFI  (2026-10-12)

## Corpus Check
- 186 files · ~415,801 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .example 2, (none) 2, .bat 2)

## Summary
- 1250 nodes · 3301 edges · 62 communities (57 shown, 5 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 134 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `df52d27d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useToast
- lazyPages.js
- getDb
- frontend/package.json
- server.js
- operaciones.js
- consultas.js
- routes/auth.js
- FinanzasInversiones.jsx
- db.js
- Dashboard.jsx
- errorHandler.js
- inteligencia.js
- DesignerView.jsx
- errorDiagnostics.js
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
- config.js
- conciliacion.js
- bancos.js
- cheques.js
- mysql2
- sync-dgehm-direct.js
- scripts
- webhook-server.js
- requirePermission
- dgehmService.js
- 20260814_create_check_format_tables.js
- deploy.js
- scripts
- checkDesigner.js
- getPuppeteer
- dependencies
- middleware/bitacora.js
- PLAN ESTRATÉGICO DE INTEGRACIÓN: INTELIGENCIA ARTIFICIAL, CONTABILIDAD AUTOMÁTICA Y CONTROL FINANCIERO
- vercel.json
- deploy.sh
- 1. Formato Compacto y Ergonómico (Estándar Impresión de Cheques)
- sw.js
- middleware/auth.js
- Estándares del Backend - SIPE Admin
- devDependencies
- Reglas de Git, Commits y Sincronización Remota
- devDependencies
- useDesigner.js
- scripts

## God Nodes (most connected - your core abstractions)
1. `useToast()` - 103 edges
2. `react` - 80 edges
3. `lucide-react` - 66 edges
4. `getDb()` - 63 edges
5. `Modal()` - 62 edges
6. `App()` - 60 edges
7. `DashboardLayout()` - 56 edges
8. `api` - 50 edges
9. `ReportPreviewModal()` - 46 edges
10. `useConfirm()` - 41 edges

## Surprising Connections (you probably didn't know these)
- `🚀 Arquitectura y Entorno de Producción` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)` --references--> `ReportPreviewModal()`  [INFERRED]
  AGENTS.md → frontend/src/components/ReportPreviewModal.jsx
- `🔒 Seguridad y Control de Acceso` --references--> `withTransaction()`  [INFERRED]
  README.md → backend/db.js
- `Bitácora (Audit Log)` --references--> `authenticateToken()`  [INFERRED]
  AGENTS.md → backend/middleware/auth.js
- `4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA)` --references--> `getUserEffectivePermissions()`  [INFERRED]
  AGENTS.md → backend/services/telegramBotService.js

## Import Cycles
- 2-file cycle: `backend/services/conversationalAiService.js -> backend/services/telegramBotService.js -> backend/services/conversationalAiService.js`
- 2-file cycle: `backend/db.js -> backend/services/energyLatamService.js -> backend/db.js`

## Communities (62 total, 5 thin omitted)

### Community 0 - "useToast"
Cohesion: 0.06
Nodes (112): Regla obligatoria para NUEVAS pantallas (no opcional), 4. Modales de Creación y Edición de Registros, Reglas para Formularios:, ConfirmContext, useConfirm(), Modal(), ReportPreviewModal(), ToastContext (+104 more)

### Community 1 - "lazyPages.js"
Cohesion: 0.07
Nodes (88): Frontend Conventions, Responsive / Mobile, 1. Definir el Módulo en `navigation.js`, 2. ¡CRÍTICO! Registrar en `allNavCategories`, 3. Registrar las Rutas en `App.jsx`, App(), DashboardLayout, Login (+80 more)

### Community 2 - "getDb"
Cohesion: 0.06
Nodes (81): getDb(), getExternalDb(), { getExternalDb }, up(), { getDb, getExternalDb }, up(), { getDb, getExternalDb }, up() (+73 more)

### Community 3 - "frontend/package.json"
Cohesion: 0.12
Nodes (16): axios, eslint, name, private, type, version, eslint-plugin-react, eslint-plugin-react-hooks (+8 more)

### Community 4 - "server.js"
Cohesion: 0.04
Nodes (44): aiLimiter, aiRoutes, allowedOrigins, apiLimiter, app, { authenticateToken, requireRole }, authRoutes, { autoLogMiddleware } (+36 more)

### Community 5 - "operaciones.js"
Cohesion: 0.06
Nodes (38): initDB(), { authenticateToken, requirePermission }, buildEstacionFilterClause(), calculateHasMore(), energyLatamService, express, fetchPromedios(), fetchTankReadings() (+30 more)

### Community 6 - "consultas.js"
Cohesion: 0.08
Nodes (37): { authenticateToken, requirePermission }, branchToEmpId, cierreViewPerms, cumpleanosViewPerms, diferenciasViewPerms, express, fletesViewPerms, formatYMD() (+29 more)

### Community 7 - "routes/auth.js"
Cohesion: 0.10
Nodes (17): restoreUser(), revokeUser(), { authenticateToken, requirePermission, requireRole, JWT_SECRET, revokeUser, restoreUser }, bcrypt, express, { getDb }, jwt, router (+9 more)

### Community 8 - "FinanzasInversiones.jsx"
Cohesion: 0.55
Nodes (9): FinanzasInversiones(), calculateBCRatio(), calculateDiscountedPayback(), calculateIRR(), calculateNPV(), calculatePayback(), calculateROI(), calculateTCO() (+1 more)

### Community 9 - "db.js"
Cohesion: 0.14
Nodes (24): configCache, dbConfig, dotenv, externalPools, fetchCachedExternalConfig(), getAccountingDb(), mysql, withRetry() (+16 more)

### Community 10 - "Dashboard.jsx"
Cohesion: 0.16
Nodes (20): CalendarGrid(), DAYS, getStatusColor(), MONTHS, ColorIcon(), createColorIcon(), ICON_ALIASES, bundledCollections (+12 more)

### Community 11 - "errorHandler.js"
Cohesion: 0.08
Nodes (26): { authenticateToken, requirePermission }, express, { GoogleGenAI }, recordatoriosPerms, router, { sendSafeError }, { authenticateToken, requirePermission }, catalogosViewPerms (+18 more)

### Community 12 - "inteligencia.js"
Cohesion: 0.13
Nodes (20): { authenticateToken, requirePermission }, express, { getFlashEjecutivo, enviarFlashPorEmail }, { getFlujoCajaProyectado }, { getRentabilidadPorEstacion }, { getRiesgoCreditoFlotas, getDetalleDtesCliente }, { getTanquesAutonomia, calcularSimuladorDGEHM, getAuditoriaMermas }, router (+12 more)

### Community 13 - "DesignerView.jsx"
Cohesion: 0.27
Nodes (9): applySnap(), DesignCanvas(), PropertyPanel(), DesignerView(), ZOOM_LEVELS, Toolbox(), Preview(), useKeyboard() (+1 more)

### Community 14 - "errorDiagnostics.js"
Cohesion: 0.14
Nodes (9): ErrorBoundary, copyDiagnosticToClipboard(), errorLogBuffer, generateDiagnosticReport(), getRecentErrorLogs(), recordApiError(), recordDiagnosticLog(), recordGlobalError() (+1 more)

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
Cohesion: 0.24
Nodes (16): drawReciboSection(), exportBancario(), formatCurrency(), formatFechaHora(), generatePlanillaReportePDF(), generateReciboIndividualPDF(), generateRecibosMasivosPDF(), { getAccountingDb, withRetry } (+8 more)

### Community 19 - "backend/package.json"
Cohesion: 0.11
Nodes (18): author, description, axios, eslint, keywords, license, main, name (+10 more)

### Community 20 - "paymentNotifier.js"
Cohesion: 0.05
Nodes (36): buildBirthdayEmailHtml(), cron, formatSpanishDate(), { getDb, getAccountingDb }, getTodaysBirthdays(), initBirthdayScheduler(), nodemailer, sendBirthdayNotification() (+28 more)

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
Cohesion: 0.09
Nodes (22): 1. Arquitectura de Dos Servidores y Cero Afectación a Producción, 2. Integración con Graphify (`Graphify-Labs/graphify`), 3. Grupo de Subagentes Especializados, 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA), 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin), 6. Catálogo de Actividades Automatizadas en n8n, Commands, Deployment & Architecture (VPS Host) (+14 more)

### Community 28 - "rrhh.test.js"
Cohesion: 0.20
Nodes (10): assert, { getDb, getAccountingDb }, { numberToWords }, rhPlanillaService, { test, describe, after }, CENTENAS, DECENAS, numberToWords() (+2 more)

### Community 29 - "config.js"
Cohesion: 0.18
Nodes (10): invalidateConfigCache(), { authenticateToken, requireRole }, express, { getDb, invalidateConfigCache }, nodemailer, router, { sendBirthdayNotification }, { sendPaymentReminderNotification } (+2 more)

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

### Community 37 - "requirePermission"
Cohesion: 0.13
Nodes (14): isAdminUser(), requirePermission(), requireRole(), { authenticateToken, requirePermission, isAdminUser }, createAndEmitNotification(), express, { getDb }, router (+6 more)

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

### Community 42 - "checkDesigner.js"
Cohesion: 0.29
Nodes (6): { authenticateToken, requirePermission }, checkDesignerPerms, express, { getDb }, router, { sendSafeError }

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

### Community 54 - "middleware/auth.js"
Cohesion: 0.19
Nodes (11): authenticateToken(), isUserRevoked(), jwt, revokedUsers, syncRevokedUsersFromDb(), { authenticateToken, requirePermission }, bitacoraPerms, express (+3 more)

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

### Community 60 - "useDesigner.js"
Cohesion: 0.27
Nodes (7): ICON_MAP, snapToGridValue(), useDesigner(), TIPOS_CAMPO, VARIABLES_DISPONIBLES, CheckDesigner(), uuid

### Community 61 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, bump, dev, lint, preview

## Knowledge Gaps
- **18 isolated node(s):** `axios`, `axios-cookiejar-support`, `tough-cookie`, `eslint`, `nodemon` (+13 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 588 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getDb()` connect `getDb` to `server.js`, `operaciones.js`, `consultas.js`, `routes/auth.js`, `db.js`, `errorHandler.js`, `inteligencia.js`, `paymentNotifier.js`, `finanzas.js`, `rrhh.test.js`, `config.js`, `conciliacion.js`, `bancos.js`, `cheques.js`, `sync-dgehm-direct.js`, `requirePermission`, `dgehmService.js`, `checkDesigner.js`, `middleware/bitacora.js`, `middleware/auth.js`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `useToast()` (e.g. with `Frontend Conventions` and `Regla obligatoria para NUEVAS pantallas (no opcional)`) actually correct?**
  _`useToast()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `axios`, `axios-cookiejar-support`, `tough-cookie` to the rest of the system?**
  _18 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useToast` be split into smaller, more focused modules?**
  _Cohesion score 0.05707000182138304 - nodes in this community are weakly interconnected._
- **Why does `authenticateToken()` connect `middleware/auth.js` to `cheques.js`, `getDb`, `server.js`, `operaciones.js`, `consultas.js`, `routes/auth.js`, `requirePermission`, `checkDesigner.js`, `errorHandler.js`, `inteligencia.js`, `middleware/bitacora.js`, `githubChanges.js`, `finanzas.js`, `onedrive.js`, `config.js`, `conciliacion.js`, `bancos.js`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Modal()` (e.g. with `Regla obligatoria para NUEVAS pantallas (no opcional)` and `Responsive / Mobile`) actually correct?**
  _`Modal()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `lazyPages.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06752475247524753 - nodes in this community are weakly interconnected._