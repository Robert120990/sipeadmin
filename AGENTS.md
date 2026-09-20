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
