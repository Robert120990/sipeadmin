const express = require('express');
const cors = require('cors');
const http = require('http');
const dotenv = require('dotenv');
const { initDB } = require('./db');

dotenv.config();

const app = express();
// Enable trust proxy for reverse proxy environments (Caddy on VPS) to accurately read client IP
app.set('trust proxy', 1);
const server = http.createServer(app);
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
    contentSecurityPolicy: false
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Inject io into request
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Auto-logging middleware (before routes to capture all write operations)
const { autoLogMiddleware } = require('./middleware/bitacora');
app.use(autoLogMiddleware());

io.on("connection", (socket) => {
    console.log(`Usuario conectado a Socket.io: ${socket.id}`);
    socket.on("join", (userId) => {
        if (userId) {
            socket.join(`user_${userId}`);
            console.log(`Socket ${socket.id} unido al canal user_${userId}`);
        }
    });
    socket.on("disconnect", () => {
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

const rateLimit = require('express-rate-limit');
const { authenticateToken, requireRole } = require('./middleware/auth');

// Rate limiting general para la API (300 req / min por IP)
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas solicitudes desde esta IP, por favor intente nuevamente en un momento.' }
});

// Rate limiting estricto para Login (10 intentos / 15 min por IP)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
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

// Mount Routes
app.use('/api', authRoutes); // Login, Users, Roles
app.use('/api/notifications', notificationsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/bancos/conciliacion', conciliacionRoutes);
app.use('/api/bancos', bancosRoutes);
app.use('/api/finanzas', finanzasRoutes);
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

// Health Check público
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
        res.status(500).json({ ok: false, message: 'Fallo en comprobación de base de datos' });
    }
});

// Global error handler sanitizado
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars -- Express requires 4 args to detect error handlers
    console.error('Unhandled error:', err);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(err.status || 500).json({ 
        message: err.userMessage || 'Error interno del servidor',
        ...(isDev && err.message ? { debug: err.message } : {})
    });
});

// Initialize DB, Schedulers and Start Server
const { initBirthdayScheduler } = require('./services/birthdayNotifier');
const { initPaymentScheduler } = require('./services/paymentNotifier');

initDB().then(() => {
    initBirthdayScheduler();
    initPaymentScheduler();
    server.listen(PORT, () => {
        console.log(`Server HTTP y Socket.io running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

module.exports = app;
