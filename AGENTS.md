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
