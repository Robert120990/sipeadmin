# AGENTS.md

## Structure
- `backend/` - Express.js API server (Node.js/CommonJS, entry: `server.js`, port 5001)
- `frontend/` - React SPA (Vite, port 5173 dev), proxies `/api` and `/socket.io` to backend

## Commands
- **Frontend dev**: `cd frontend && npm run dev`
- **Backend dev**: `cd backend && npm start` (requires MySQL accessible)
- **Frontend build**: `cd frontend && npm run build` (outputs to `dist/`)
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
- Frontend uses ESLint; backend has no lint or typecheck
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
