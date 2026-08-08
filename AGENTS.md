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

## Deployment (Vercel)
- `vercel.json` routes `/api/*` to `backend/server.js` and all other paths to static frontend
- `initDB()` in `backend/db.js` is **skipped on Vercel** (`process.env.VERCEL` check) due to serverless timeout
- Database tables must exist before Vercel deploy (no auto-migration in production)

## Gotchas
- `public/` is a build artifact (root build script creates it), not source code — it is gitignored
- Backend has no test infrastructure (dummy `npm test` exits with error)
- Frontend and backend both use ESLint (`npm run lint` in each); **run lint before committing** — backend fixes found so far are documented in `backend/routes/onedrive.js` (browser globals inside `page.evaluate` are declared at top)
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

## Versioning
- Version number is stored in `frontend/package.json` (`version` field)
- Displayed in sidebar as `vX.Y.Z`, injected at build time via Vite `define`
- **Before every push to GitHub**, run: `cd frontend && npm run bump`
- Then include the bumped `frontend/package.json` in the commit
- This ensures production (Vercel) and local show the same version
- Root-level `npm run deploy` automates bump + commit + push
- The build emits `dist/version.json` (`version` + `buildId` via the `version-json` plugin in `vite.config.js`) — used by `sw.js` (cache names) and `UpdateNotifier` (new-version detection)

## Responsive / Mobile
- Breakpoint: **768px** — `useViewport()` hook in `src/hooks/useViewport.js` switches `DashboardLayout` between Desktop shell (sidebar + tabs, unchanged) and Mobile shell (header + single active view + bottom nav Inicio/Menú/Más + drawer)
- Mobile navigation reuses the same filtered menus and `componentRegistry`; `openTab` replaces the tab list on mobile (single active view)
- **New modals must use the shared `Modal` component** (`src/components/Modal.jsx`) with `size="sm|md|lg|xl"` — never inline fixed-width overlays
- **Tables**: wrap in `.table-responsive` (overflow-x auto); never `overflow: hidden`
- **Form grids**: use `.form-grid` + `.form-grid-2`/`.form-grid-3` + `.span-2`/`.span-3` (collapse to 1 column on mobile) — inline `gridTemplateColumns` cannot be overridden by media queries
- **Page headers**: use `.page-header` (flex + wrap)
- No `zoom` hacks, no fixed pixel widths for containers/modals

## PWA
- Assets in `frontend/public/`: `manifest.webmanifest`, `sw.js`, `icons/*.png` (placeholder icons generated by `frontend/scripts/generate-icons.cjs` — replace with brand icons when available)
- SW strategy: shell precache keyed by `buildId`, `index.html`/`version.json` network-first, `/assets/*` cache-first (hashed/immutable), **`/api/*` never cached**
- `vercel.json` sets `no-cache` for `sw.js`, `manifest.webmanifest`, `version.json`, `index.html`; immutable for `/icons/*`
- Update flow: `UpdateNotifier` checks `/version.json` on load, on tab focus, and every 60 min → banner + `skipWaiting` + single reload (guard in sessionStorage prevents loops)
- `frontend/scripts/` is Node/CommonJS (`.cjs`) and has an ESLint override for `node` env
