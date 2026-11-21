const express = require('express');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { initDB, getDbIfReady, closeAllPools } = require('./db');
const { requireSignedOrAuthenticatedUpload } = require('./utils/uploadSigner');

dotenv.config();

const app = express();
// Enable trust proxy for reverse proxy environments (Caddy on VPS) to accurately read client IP
app.set('trust proxy', 1);
const server = http.createServer(app);
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
const helmet = require('helmet');

// Hardened CORS allowed origins
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://admin.sipesv.com'];
const configuredOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : [];
const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        return callback(new Error(`Bloqueado por política CORS: origen no autorizado (${origin})`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};

const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
                return callback(null, true);
            }
            return callback(new Error('Socket.io CORS origin not allowed'));
        },
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    }
});

app.set('io', io);

const PORT = process.env.PORT || 5001;

// Global Security Middleware
app.disable('x-powered-by');
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:", "https:", "http://localhost:5001", "http://127.0.0.1:5001"],
            frameSrc: ["'self'", "blob:"],
            objectSrc: ["'self'", "blob:"],
            workerSrc: ["'self'", "blob:"]
        }
    }
}));
app.use(cors(corsOptions));
// Dynamic body parser: 20MB for heavy data uploads / reconciliations, 1MB for all other endpoints
const jsonParserDefault = express.json({ limit: '1mb' });
const jsonParserLarge = express.json({ limit: '20mb' });
const largePayloadPrefixes = [
    '/api/consultas/estaciones/precios-competencia/upload',
    '/api/bancos/conciliacion/parse-extracto',
    '/api/bancos/conciliacion/crear-masivo-y-aplicar',
    '/api/conciliacion/parse-extracto',
    '/api/conciliacion/crear-masivo-y-aplicar',
    '/api/tickets',
    '/api/operaciones/recordatorios'
];

app.use((req, res, next) => {
    const url = req.originalUrl || req.url || '';
    const isLarge = largePayloadPrefixes.some(p => url.startsWith(p));
    if (isLarge) {
        return jsonParserLarge(req, res, next);
    }
    return jsonParserDefault(req, res, next);
});

// Assign unique Request ID for error tracing and audit logging
app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
});

// Inject io into request
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Auto-logging middleware (before routes to capture all write operations)
const { autoLogMiddleware } = require('./middleware/bitacora');
app.use(autoLogMiddleware());

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const jwt = require('jsonwebtoken');
const { authenticateToken, requireRole, isAdminUser, JWT_SECRET, isUserRevoked, resolveLiveUserAuthState } = require('./middleware/auth');

io.use(async (socket, next) => {
    const rawToken = socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '') : null);
    if (!rawToken) {
        return next(new Error('Autenticación requerida para conexión en tiempo real'));
    }
    try {
        const decoded = jwt.verify(rawToken, JWT_SECRET);
        if (!decoded || decoded.status === 'inactive' || isUserRevoked(decoded.id)) {
            return next(new Error('Usuario inactivo o suspendido'));
        }
        const liveResult = await resolveLiveUserAuthState(decoded);
        if (!liveResult.ok) {
            return next(new Error(liveResult.message || 'Sesión inválida o expirada'));
        }
        socket.user = liveResult.user;
        return next();
    } catch (_) {
        return next(new Error('Token inválido o expirado'));
    }
});

io.on("connection", (socket) => {
    console.log(`Usuario conectado a Socket.io: ${socket.id}`);
    if (socket.user?.id) {
        socket.join(`user_${socket.user.id}`);
        const perms = Array.isArray(socket.user.permissions) ? socket.user.permissions : [];
        if (isAdminUser(socket.user)) {
            socket.join('role_admin');
            socket.join('perm_support_tickets');
            socket.join('perm_finanzas_crecimiento');
        } else {
            if (perms.includes('manage_support_tickets')) {
                socket.join('perm_support_tickets');
            }
            if (perms.includes('manage_finanzas_crecimiento') || perms.includes('/dashboard/finanzas/crecimiento')) {
                socket.join('perm_finanzas_crecimiento');
            }
        }
    }
    socket.on("join", (userId) => {
        if (!socket.user?.id) return;
        const targetId = Number(socket.user.id);
        if (Number(userId) === targetId) {
            socket.join(`user_${targetId}`);
            console.log(`Socket ${socket.id} unido al canal user_${targetId}`);
        }
    });
    socket.on("disconnect", () => {
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

// Rate limiting general para la API (300 req / min por IP)
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas solicitudes desde esta IP, por favor intente nuevamente en un momento.' }
});

// Rate limiting estricto para Login (15 intentos fallidos / 15 min por IP + usuario)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const ip = ipKeyGenerator(req.ip || '');
        const userKey = String(req.body?.username || '').trim().toLowerCase().slice(0, 80);
        return `${ip}:${userKey || 'anonymous'}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos fallidos de inicio de sesión. Por favor espere 15 minutos.' }
});

// Rate limiting para endpoints de Inteligencia Artificial (20 req / min por IP)
const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Límite de consultas de IA alcanzado por este minuto. Intente de nuevo en breve.' }
});

// Rate limiting para procesos intensivos en memoria/CPU como Puppeteer/OneDrive (10 req / 5 min por IP)
const heavyProcessLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Límite de solicitudes para procesos intensivos alcanzado. Espere unos minutos.' }
});

app.use('/api/login', loginLimiter);
app.use('/api/ai/', aiLimiter);
app.use('/api/finanzas/chat', aiLimiter);
app.use('/api/finanzas/crecimiento/conversaciones/mensaje', aiLimiter);
app.use('/api/operaciones/recordatorios/analizar-comprobante', aiLimiter);
app.use('/api/onedrive', heavyProcessLimiter);
app.use('/api/', apiLimiter);

// Import Routes
const authRoutes = require('./routes/auth');
const bancosRoutes = require('./routes/bancos');
const catalogosRoutes = require('./routes/catalogos');
const operacionesRoutes = require('./routes/operaciones');
const consultasRoutes = require('./routes/consultas');
const configRoutes = require('./routes/config');
const chequesRoutes = require('./routes/cheques');
const onedriveRoutes = require('./routes/onedrive');
const aiRoutes = require('./routes/ai');
const bitacoraRoutes = require('./routes/bitacora');
const checkDesignerRoutes = require('./routes/checkDesigner');
const conciliacionRoutes = require('./routes/conciliacion');
const finanzasRoutes = require('./routes/finanzas');
const inteligenciaRoutes = require('./routes/inteligencia');
const tasksRoutes = require('./routes/tasks');
const notificationsRoutes = require('./routes/notifications');
const githubChangesRoutes = require('./routes/githubChanges').router;
const rrhhRoutes = require('./routes/rrhh');
const telegramRoutes = require('./routes/telegram');
const ticketsRoutes = require('./routes/tickets');
const { UPLOADS_DIR, SIBLING_SAAS_UPLOADS, initTicketRealtimeWatcher, stopTicketRealtimeWatcher } = require('./services/ticketService');
const fs = require('fs');
const path = require('path');

// Mount Routes
app.use('/api', authRoutes); // Login, Users, Roles
app.use('/api/notifications', notificationsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/seguridad/cambios-github', githubChangesRoutes);
app.use('/api/bancos/conciliacion', conciliacionRoutes);
app.use('/api/bancos', bancosRoutes);
app.use('/api/finanzas', finanzasRoutes);
app.use('/api/rrhh', rrhhRoutes);
app.use('/api/inteligencia', inteligenciaRoutes);
app.use('/api', catalogosRoutes); // Carriers, Tankers
app.use('/api', operacionesRoutes); // Dashboard, Operaciones
app.use('/api', consultasRoutes); // Ventas, Consultas
app.use('/api', configRoutes);
app.use('/api/cheques', chequesRoutes);
app.use('/api', onedriveRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', bitacoraRoutes);
app.use('/api/check-designer', checkDesignerRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/uploads/pagos', requireSignedOrAuthenticatedUpload);
app.use('/api/uploads', express.static(UPLOADS_DIR, { dotfiles: 'deny', index: false, maxAge: '7d' }));
app.get('/api/uploads/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename || '');
    if (!safeName || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
        return res.status(400).json({ message: 'Nombre de archivo inválido' });
    }
    for (const dir of SIBLING_SAAS_UPLOADS) {
        try {
            const candidate = path.join(dir, safeName);
            if (fs.existsSync(candidate)) {
                return res.sendFile(candidate);
            }
        } catch (_) { /* ignore */ }
    }
    return res.redirect(`https://sys.sipesv.com/api/uploads/${encodeURIComponent(safeName)}`);
});

// Health Check público
// Health Check público con verificación activa de MySQL para deploy/monitoreo
app.get('/api/health', async (req, res) => {
    const basePayload = {
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    };
    const db = getDbIfReady();
    if (!db) {
        return res.status(503).json({ ...basePayload, status: 'degraded', db: 'initializing' });
    }
    try {
        await db.query('SELECT 1 AS ok');
        return res.status(200).json({ ...basePayload, status: 'ok', db: 'connected' });
    } catch (err) {
        console.error('[Health] Fallo en verificación MySQL:', err.message);
        return res.status(503).json({ ...basePayload, status: 'degraded', db: 'disconnected' });
    }
});

// Health Check público ligero
app.get('/api/debug-ping', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Endpoint de diagnóstico protegido (solo administradores autenticados)
app.get('/api/debug-db', authenticateToken, requireRole('Administrator'), async (req, res) => {
    try {
        const { getDb } = require('./db');
        const db = getDb();
        if (!db) return res.json({ ok: false, error: 'Pool not initialized' });
        const [rows] = await db.query('SELECT 1 AS test');
        res.json({ ok: true, result: rows[0] });
    } catch (e) {
        console.error('Debug DB Error:', e.message);
        res.status(500).json({ ok: false, message: 'Fallo en comprobación de base de datos', requestId: req.id });
    }
});

// Endpoint administrativo para reiniciar el proceso backend limpiamente (PM2 lo revivirá de inmediato)
app.post('/api/admin/restart-backend', authenticateToken, requireRole('Administrator'), (req, res) => {
    res.json({ ok: true, message: 'Reiniciando proceso backend en 1 segundo...' });
    setTimeout(() => {
        console.log('Reinicio solicitado por administrador autenticado. Saliendo para que PM2 reinicie el proceso...');
        process.exit(0);
    }, 1000);
});

// Global error handler sanitizado
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars -- Express requires 4 args to detect error handlers
    const requestId = req?.id || 'no-id';
    console.error(`[Unhandled Error][${requestId}]:`, err);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500).json({ 
        message: err.userMessage || 'Error interno del servidor',
        requestId: req?.id,
        ...(isDev && err.message ? { debug: err.message } : {})
    });
});

// Initialize DB, Schedulers, Telegram Bot and Start Server
const { initBirthdayScheduler } = require('./services/birthdayNotifier');
const { initPaymentScheduler } = require('./services/paymentNotifier');
const { initMibotScheduler, stopMibotScheduler } = require('./services/mibotNotifierService');
const { initTelegramBot, stopTelegramBot } = require('./services/telegramBotService');
const { initAutoSyncScheduler } = require('./services/autoSyncScheduler');
const { initTelegramSentinelScheduler, stopTelegramSentinelScheduler } = require('./services/telegramSentinelService');
const { runInitialServiceSeeds } = require('./services/dbBootstrapSeeds');

let isShuttingDown = false;
const gracefulShutdown = async (signal, exitCode = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Shutdown] Señal ${signal} recibida. Cerrando servicios de forma ordenada...`);

    const forceTimer = setTimeout(() => {
        console.error('[Shutdown] Tiempo límite alcanzado; forzando salida.');
        process.exit(exitCode || 1);
    }, 10000);
    if (forceTimer && typeof forceTimer.unref === 'function') forceTimer.unref();

    try { stopTelegramBot(); } catch (_) { /* noop */ }
    try { stopMibotScheduler(); } catch (_) { /* noop */ }
    try { stopTelegramSentinelScheduler(); } catch (_) { /* noop */ }
    try { stopTicketRealtimeWatcher(); } catch (_) { /* noop */ }

    await new Promise((resolve) => {
        let finished = false;
        const done = () => {
            if (!finished) {
                finished = true;
                resolve();
            }
        };
        try {
            if (io && typeof io.close === 'function') {
                io.close(() => done());
            } else if (server.listening) {
                server.close(() => done());
            } else {
                done();
            }
        } catch (_) {
            done();
        }
        setTimeout(done, 4000).unref();
    });

    try {
        await closeAllPools();
    } catch (poolErr) {
        console.error('[Shutdown] Error cerrando pools MySQL:', poolErr.message);
    }

    clearTimeout(forceTimer);
    console.log('[Shutdown] Cierre limpio completado.');
    process.exit(exitCode);
};

if (process.env.NODE_ENV !== 'test') {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
    process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));
    process.on('unhandledRejection', (reason) => {
        console.error('[Process] Unhandled Rejection capturado:', reason instanceof Error ? reason.stack || reason.message : reason);
    });
    process.on('uncaughtException', (err) => {
        console.error('[Process] Uncaught Exception crítico:', err instanceof Error ? err.stack || err.message : err);
        gracefulShutdown('uncaughtException', 1);
    });
}

initDB().then(async () => {
    await runInitialServiceSeeds();
    initBirthdayScheduler();
    initPaymentScheduler();
    initMibotScheduler(io);
    initTelegramBot(io);
    initTelegramSentinelScheduler();
    initAutoSyncScheduler(io);
    initTicketRealtimeWatcher(io);
    server.listen(PORT, () => {
        console.log(`Server HTTP y Socket.io running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

module.exports = app;
