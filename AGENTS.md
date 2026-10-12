# AGENTS.md

## Structure
- `backend/` - Express.js API server (Node.js/CommonJS, entry: `server.js`, port 5001)
- `frontend/` - React SPA (Vite, port 5173 dev), proxies `/api` and `/socket.io` to backend

## Commands
- **Frontend dev**: `cd frontend && npm run dev`
- **Backend dev**: `cd backend && npm start` (requires MySQL accessible)
- **Frontend build**: `cd frontend && npm run build` (outputs to `dist/`)
- **Lint frontend**: `cd frontend && npm run lint` (ESLint 8, config in `frontend/.eslintrc.cjs`)
- **Lint backend**: `cd backend && npm run lint` (ESLint 8, config in `backend/.eslintrc.cjs`)
- **Full build** (root): `npm run build` — deletes `public/`, builds frontend, copies `dist/` to `public/`, then `npm install`s backend

## Environment
Backend requires `.env` in `backend/`:
- `DATABASE_URL` or `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`
- `JWT_SECRET`, `GEMINI_API_KEY`, `PORT` (default 5001)

Frontend proxies to `localhost:5001` in dev; no env vars required.

## Deployment & Architecture (VPS Host)
- **Production Server**: VPS Linux (`5.252.55.29`) running behind **Caddy** reverse proxy (`admin.sipesv.com`)
- **Process Manager**: PM2 manages `sipeadmin-backend` (port 5001) and `sipeadmin-webhook` (port 9000)
- **Package Manager**: pnpm workspace
- **Auto-deployment**: Webhook listening on port 9000 triggers `/home/sistemas/deploy-sipeadmin.sh` on git push to `main`
- **Socket.io & Puppeteer**: Fully supported with persistent Node.js process on VPS
- **Legacy Vercel**: `vercel.json` kept for fallback/migration compatibility

## Testing & Quality Assurance
- **Backend automated tests**: `npm test` runs Node.js native test runner (`node --test test/**/*.test.js`)
- **Frontend build & code-splitting**: Uses `React.lazy()` with Rollup `manualChunks` in `vite.config.js` (<200 kB initial bundle)
- **CI Pipeline**: `.github/workflows/ci.yml` validates frontend/backend linting, automated tests, and production build on push/PR
- **ESLint**: Both frontend and backend use ESLint; run `npm run lint` before committing
- Socket.io runs on same port as Express (not a separate port)

## Bitácora (Audit Log)
- **Every new CRUD route** must be registered in the audit log automatically via `autoLogMiddleware` in `backend/middleware/bitacora.js` (already active for all `POST/PUT/PATCH/DELETE`).
- No route needs manual logging — the middleware captures method, entity, ID, user, IP, and request body automatically.
- **Exception**: If a route does not use `authenticateToken`, `req.user` won't exist and the action won't be logged (this is intentional for public endpoints like `/login`).
- **Frontend**: Every new page that needs restricted access must:
  - Add its path to `securityItems` in `navigation.js` if it belongs to Seguridad
  - Register in `componentRegistry` in `DashboardLayout.jsx`
  - Add a `<Route>` in `App.jsx` with `<PermissionRoute>`
- **New permissions** must be added to the seed in `backend/db.js` (the `permissionsList` array) and as an `INSERT IGNORE` migration so existing DBs also get the permission.

## Frontend Conventions
- **All destructive actions** (delete, deactivate, etc.) must use the custom confirmation dialog:
  ```jsx
  import { useConfirm } from '../components/ConfirmDialog';
  import { useToast } from '../components/Toast';
  
  const { confirm } = useConfirm();
  const { addToast } = useToast();
  
  // Always wrap destructive operations with confirm
  if (!await confirm('¿Estás seguro de eliminar X?', { variant: 'danger' })) return;
  ```
  - Use `variant: 'danger'` for delete/deactivate, omit for other confirmations
  - Use `useToast` for success/error feedback (`addToast('Mensaje', 'success' | 'error' | 'warning')`)
  - Both `ConfirmProvider` and `ToastProvider` are already active in `App.jsx`

## UI Compacta y Ergonómica (Regla Obligatoria)
Toda pantalla de gestión, consulta o reporte DEBE seguir el estándar compacto implementado en Impresión de Cheques:
- **Espaciado general**: Usar `gap: '1rem'` en el contenedor raíz; `.page-header` con `marginBottom: '0.75rem'` a `'1rem'`, títulos de `1.2rem - 1.25rem` con icono de `20-22px` y subtítulo de `0.8rem`.
- **Filtros y Búsqueda**: Card con padding compacto (`1rem 1.25rem`). Inputs numéricos, códigos o rangos (ej. "Desde #", "Hasta #") NUNCA deben expandirse a columnas gigantes; fijar anchos proporcionales (`110px - 130px`). Altura estándar en filtros de `36px` a `38px`, `fontSize: '0.825rem'`. Botones de búsqueda compactos alineados inline (`height: 36px`, `padding: 0 1.25rem`).
- **Checkboxes**: Siempre `16x16px` con labels inline (`display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; user-select: none; cursor: pointer;`).
- **Tablas de datos**: Encabezados con `padding: 0.45rem 0.5rem`, `fontSize: 0.74rem`, uppercase, letterSpacing `0.03em`. Celdas con `padding: 0.45rem 0.5rem`, `fontSize: 0.8rem`. Badges de estado con `fontSize: 0.72rem`, `padding: 0.15rem 0.45rem`.
- **Selectores de Cuenta Bancaria**: OBLIGATORIO usar `formatCuentaLabel(c)` y `sortCuentas(cuentas)` de `src/utils/cuentaUtils.js`. Formato: `[banco] nombre de la cuenta - (numero de cuenta)`, ordenado primero por banco ASC y luego por número de cuenta ASC.

## Vista Previa de Reportes e Impresiones (`ReportPreviewModal`)
Toda pantalla que genere, previsualice o imprima reportes o cheques DEBE utilizar el componente compartido `ReportPreviewModal` (`src/components/ReportPreviewModal.jsx`):
- **Prohibido** disparar `window.print()` ciegamente sin vista previa previa.
- Debe abrir `<ReportPreviewModal ... />` pasando el `pdfSource` (Blob o URL del PDF generado), `title`, `subtitle`, `badge`, `totalPages`, `fileName`, etc.
- **Página Completa (Carta)**: Todo PDF o documento generado para impresión debe estructurarse a tamaño **Carta completo** (`letter`: 215.9mm x 279.4mm), evitando reducir el tamaño al del comprobante físico para garantizar legibilidad e impresión estándar.

## Versioning
- Version number is stored in `frontend/package.json` (`version` field)
- Displayed in sidebar as `vX.Y.Z`, injected at build time via Vite `define`
- **Before every push to GitHub**, run: `cd frontend && npm run bump`
- Then include the bumped `frontend/package.json` in the commit
- This ensures production (Vercel) and local show the same version
- Root-level `npm run deploy` automates bump + commit + push
- The build emits `dist/version.json` (`version` + `buildId` via the `version-json` plugin in `vite.config.js`) — used by `sw.js` (cache names) and `UpdateNotifier` (new-version detection)

## Git, Commits y Sincronización Remota (Regla Obligatoria)
1. **Sincronización Previa Obligatoria (Antes de Push)**:
   - ANTES de realizar cualquier `git push`, es OBLIGATORIO verificar si hay cambios en el repositorio remoto:
     ```bash
     git fetch origin main
     ```
   - Si el remoto tiene cambios (`git log HEAD..origin/main`), se deben sincronizar inmediatamente antes de pushear:
     ```bash
     git pull --rebase origin main
     ```
   - Resolver cualquier conflicto con máxima precaución preservando las funcionalidades remotas y locales.
   - Tras sincronizar, ejecutar pruebas (`npm test`) y verificar compilación (`npm run build`) antes de empujar.
2. **Commits Atómicos**:
   - Cada commit debe representar un cambio único, coherente y autocontenido (una sola tarea, corrección o feature delimitada).
   - Prohibido acumular múltiples funcionalidades o refactorizaciones masivas no relacionadas en un solo commit indiscriminado.
3. **Mensajes de Commit en Español**:
   - Todos los mensajes de commit DEBEN redactarse estrictamente en **español**.
   - Seguir la convención semántica:
     - `feat: agregar sistema de notificaciones en tiempo real`
     - `fix: corregir desconexión de backend y validación de clave JWT`
     - `chore: incrementar versión a 1.0.59`
     - `refactor: optimizar tablero Kanban de tareas`
     - `test: agregar pruebas unitarias para notificaciones`


## Responsive / Mobile
- Breakpoint: **768px** — `useViewport()` hook in `src/hooks/useViewport.js` switches `DashboardLayout` between Desktop shell (sidebar + tabs, unchanged) and Mobile shell (header + single active view + bottom nav Inicio/Menú/Más + drawer)
- Mobile navigation reuses the same filtered menus and `componentRegistry`; `openTab` replaces the tab list on mobile (single active view)
- **New modals must use the shared `Modal` component** (`src/components/Modal.jsx`) with `size="sm|md|lg|xl"` — never inline fixed-width overlays
- **Tables**: wrap in `.table-responsive` (overflow-x auto); never `overflow: hidden`
- **Form grids**: use `.form-grid` + `.form-grid-2`/`.form-grid-3` + `.span-2`/`.span-3` (collapse to 1 column on mobile) — inline `gridTemplateColumns` cannot be overridden by media queries
- **Page headers**: use `.page-header` (flex + wrap)
- No `zoom` hacks, no fixed pixel widths for containers/modals

### Regla obligatoria para NUEVAS pantallas (no opcional)
Toda pantalla nueva DEBE cumplir esta checklist, verificada en DevTools a 375px y 320px antes de considerar terminada:
- **Raíz**: prohibido `padding: '2rem'` inline en el contenedor raíz — los estilos inline no son anulables por media queries; usar el padding del `.tab-content-container`
- **Diseño compacto**: aplicar alturas de 36-38px en filtros, campos numéricos con anchos limitados (110-130px), checkboxes de 16px, tablas con padding de 0.45rem
- **Selectores de Cuenta**: usar `formatCuentaLabel` y `sortCuentas` de `cuentaUtils.js`
- **Reportes e Impresión**: previsualizar obligatoriamente con `ReportPreviewModal` a tamaño Carta página completa
- **Tablas**: SIEMPRE envolver en `<div className="table-responsive">` (o `card glass table-responsive`) Y fijar `minWidth` (800-1100px) en la tabla para que las columnas hagan scroll horizontal legible en móvil
- **Flexbox con más de 2 controles** (filtros, botones de acción, paginación, barras de totales): `flexWrap: 'wrap'` obligatorio — nunca filas flex sin wrap que puedan desbordar en ≤400px
- **Headers**: usar `.page-header`; **formularios**: `.form-grid` + `.form-grid-2`/`.form-grid-3` + `.span-2`/`.span-3` (colapsan a 1 columna en móvil); prohibido `gridTemplateColumns` inline
- **Modales**: SIEMPRE el componente compartido `Modal` (`size="sm|md|lg|xl"`) o `ReportPreviewModal` para vistas previas de reportes; nunca overlays con ancho fijo
- **Botones destructivos**: `useConfirm` + `useToast` (ver Frontend Conventions)

## PWA
- Assets in `frontend/public/`: `manifest.webmanifest`, `sw.js`, `icons/*.png` (placeholder icons generated by `frontend/scripts/generate-icons.cjs` — replace with brand icons when available)
- SW strategy: shell precache keyed by `buildId`, `index.html`/`version.json` network-first, `/assets/*` cache-first (hashed/immutable), **`/api/*` never cached**
- `vercel.json` sets `no-cache` for `sw.js`, `manifest.webmanifest`, `version.json`, `index.html`; immutable for `/icons/*`
- Update flow: `UpdateNotifier` checks `/version.json` on load, on tab focus, and every 60 min → banner + `skipWaiting` + single reload (guard in sessionStorage prevents loops)
- `frontend/scripts/` is Node/CommonJS (`.cjs`) and has an ESLint override for `node` env

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## Ecosistema de Agentes IA, n8n y OpenClaw (Servidor 169.58.207.115)

### 1. Arquitectura de Dos Servidores y Cero Afectación a Producción
- **Servidor de Producción Principal (VPS Linux `5.252.55.29`)**:
  - Aloja `admin.sipesv.com` (SIPE Admin SPA + Backend Express en puerto 5001).
  - Aloja las bases de datos transaccionales `db_sistema_saas` y `db_sipe_admin`.
  - **Regla de Oro de Cero Impacto**: Ningún agente externo, script o flujo de n8n/OpenClaw ejecuta operaciones de escritura destructivas o bloqueantes sobre las bases de producción. Todo acceso externo hacia la base de datos se realiza a través de consultas con privilegios estrictos de **Solo Lectura (`SELECT`)** y mediante endpoints protegidos del API Gateway de SIPE Admin con límites de tiempo (`timeout: 10s`).
- **Servidor de Automatizaciones y Agentes (`169.58.207.115`)**:
  - **OpenClaw (`bot.how2getfun.com`)**: Gateway de agentes conversacionales para mensajería (Telegram). Ofrece una interfaz de lenguaje natural humana y ergonómica para socios, gerentes y contadores.
  - **n8n**: Motor de flujos de trabajo programados (crons) y webhooks asíncronos para tareas desatendidas (envío de Flash matutino a las 7:00 AM, alertas automáticas de descuadres y mermas).
  - **Sinergia**: OpenClaw asume la conversación humana en Telegram y n8n asume la orquestación programada y webhooks.

### 2. Integración con Graphify (`Graphify-Labs/graphify`)
- **Propósito**: Convierte todo el código fuente de SIPE Admin, esquemas SQL (`backend/db.js`, migraciones), controladores (`backend/routes/`) y servicios de negocio en un **Grafo de Conocimiento Determinista (AST)** sin requerir bases de datos vectoriales.
- **Artefactos Locales Generados**:
  - `graphify-out/graph.json`: 1,107+ nodos, 3,060+ aristas y 54 comunidades que modelan todas las entidades y llamadas del sistema.
  - `graphify-out/graph.html`: Visualizador interactivo del grafo de dependencias y modelos para inspección en navegador.
- **Uso para Agentes**:
  - Antes de ejecutar o responder a una consulta en Telegram, OpenClaw o el subagente consulta el grafo con:
    ```bash
    graphify query "<pregunta o entidad>"
    graphify explain "<concepto>"
    ```
  - Esto proporciona el subgrafo exacto con las tablas (`gas_station_closeouts`, `sales_headers`, `cuentas_bancarias`, etc.) y endpoints correspondientes, eliminando alucinaciones y reduciendo el consumo de tokens en 70x.

### 3. Grupo de Subagentes Especializados
- `sipe_graphify_architect`: Mantiene y consulta el grafo de conocimiento del código, esquemas y rutas.
- `openclaw_telegram_agent`: Transforma solicitudes en lenguaje natural en Telegram en respuestas ejecutivas, cálidas y ergonómicas con formato HTML limpio y emojis clave.
- `n8n_integration_orchestrator`: Orquesta flujos de automatización programados y webhooks entre `169.58.207.115` y `5.252.55.29`.

### 4. Nuevas Funciones y Endpoints en Backend (API Gateway para Agentes IA)
- `POST /api/ai/query`: Recibe intenciones y preguntas de agentes, valida permisos del usuario de Telegram mediante `getUserEffectivePermissions` y entrega datos formateados.
- `GET /api/ai/schema-context`: Expone el diccionario de datos y metadatos de entidades operativas para que OpenClaw y n8n reconozcan campos y tablas.
- `POST /api/ai/webhooks/trigger`: Despachador de eventos de SIPE hacia n8n en `169.58.207.115` (cierre de turnos con anomalías, emisión de cheques, alertas operativas).
- `POST /api/operaciones/portal/auto-sync-remote`: Endpoint seguro (vía `x-api-key`) para recibir disparos periódicos de sincronización de pedidos y precios desde `169.58.207.115`, liberando de sobrecarga de timers al host de producción.

### 5. Nuevas Pantallas Proyectadas en Frontend (SIPE Admin)
- `/dashboard/seguridad/telegram` (Activa): Gestión y vinculación de usuarios de Telegram con usuarios de SIPE y herencia de permisos.
- `/dashboard/configuracion/agentes-ia`: Tablero de control de agentes (estado de OpenClaw y n8n en `169.58.207.115`, visor de grafo Graphify interactivo y log de consultas de IA).
- `/dashboard/consultas/ia-asistente`: Panel web interactivo para dialogar con el asistente usando la misma inteligencia que Telegram.

### 6. Catálogo de Actividades Automatizadas en n8n y Servidor de Automatizaciones
- **Actividad 1: Flash Ejecutivo Matutino (7:00 AM)**:
  - Disparador: Cron en n8n a las 7:00 AM de lunes a domingo.
  - Consumo: `GET /api/inteligencia/flash-ejecutivo` en `admin.sipesv.com`.
  - Acción: Distribución a través de Telegram y WhatsApp a los directores registrados.
- **Actividad 2: Centinela de Mermas y Descuadres de Pista**:
  - Disparador: Webhook al registrarse un cierre con descuadre $> \$50$ o merma $> 0.4\%$.
  - Acción: Alerta inmediata con botón interactivo de revisión en Telegram.
- **Actividad 3: Monitor de Precios Pre-DGEHM**:
  - Disparador: Cron quincenal los lunes a las 6:00 PM.
  - Acción: Evalúa variación de precios de referencia y recomienda estrategia de compra de cisternas.
- **Actividad 4: Orquestación Continua de Pedidos Puma y Precios (Cada 30 minutos)**:
  - Disparador: Crontab en `169.58.207.115` (`*/30 * * * * /home/rsboosted/sipe-tasks/sync_portal_pedidos.sh`).
  - Consumo: `POST /api/operaciones/portal/auto-sync-remote` en `admin.sipesv.com` vía cabecera `x-api-key`.
  - Acción: Descentraliza la programación periódica para no sobrecargar el servidor de producción (`5.252.55.29`), manteniendo la última hora y pedidos siempre frescos.

