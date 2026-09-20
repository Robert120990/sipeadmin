# SIPE Admin

Sistema Integral de Gestión y Control Administrativo, Bancario, Financiero y de Operaciones para Estaciones de Servicio.

---

## 🚀 Arquitectura y Entorno de Producción

- **Dominio Principal:** [https://admin.sipesv.com](https://admin.sipesv.com)
- **Servidor:** VPS Host Linux con proxy inverso **Caddy** (HTTPS automático con TLS).
- **Gestor de Procesos:** **PM2** administrando:
  - `sipeadmin-backend` (API Express, Socket.io, Puppeteer en puerto 5001)
  - `sipeadmin-webhook` (Despliegue continuo automatizado en puerto 9000)
- **Base de Datos:** MySQL / MariaDB con transacciones seguras (`withTransaction`) y esquemas inicializados en arranque.
- **Frontend SPA:** React 18 + Vite con Code-Splitting (<200 kB inicial) y PWA.

---

## 🛠️ Tecnologías

### Backend
- **Node.js** (v20+)
- **Express.js** con Rate Limiting (`express-rate-limit`)
- **MySQL2** con connection pool y transacciones ACID
- **Socket.io** para sincronización en tiempo real
- **Puppeteer** para automatización e integración
- **Node Test Runner** (`node --test`) para suite de pruebas automatizadas

### Frontend
- **React 18** (SPA) + **Vite 5**
- **React Router v6** con Suspense y Lazy Loading de módulos
- **Vanilla CSS** con tokens de diseño, tema claro/oscuro y componentes ergonómicos
- **PWA** con Service Worker y detector de actualizaciones en vivo (`UpdateNotifier`)

---

## 💻 Comandos Principales

```bash
# Desarrollo Frontend (puerto 5173)
cd frontend && npm run dev

# Desarrollo Backend (puerto 5001)
cd backend && npm start

# Ejecutar suite de pruebas del backend
cd backend && npm test

# Ejecutar linters (ESLint)
cd backend && npm run lint
cd frontend && npm run lint

# Construir frontend para producción
cd frontend && npm run build

# Despliegue con incremento de versión automático
npm run deploy
```

---

## 🔒 Seguridad y Control de Acceso

- **BFLA (Broken Function Level Authorization):** Todas las rutas críticas están protegidas por `requirePermission` y `requireRole` a nivel de API backend.
- **Rate Limiting:** Protección anti fuerza bruta en login (10 intentos / 15 min), limitación de consumo de API de IA y limitación global por IP.
- **Transacciones Seguras:** Operaciones multi-tabla (préstamos, cheques correlativos, conciliación) se ejecutan dentro de `withTransaction` con bloqueos pesimistas de fila (`FOR UPDATE`).
- **Sanitización de Errores:** Errores SQL internos no se filtran hacia el cliente HTTP en producción.
