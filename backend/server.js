const express = require('express');
const cors = require('cors');
const http = require('http');
const dotenv = require('dotenv');
const { initDB } = require('./db');

dotenv.config();

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

const PORT = process.env.PORT || 5001;

// Global Middleware
app.use(cors());
app.use(express.json());

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
    socket.on("disconnect", () => {
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

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

// Mount Routes
app.use('/api', authRoutes); // Login, Users, Roles
app.use('/api/bancos/conciliacion', conciliacionRoutes);
app.use('/api/bancos', bancosRoutes);
app.use('/api/finanzas', finanzasRoutes);
app.use('/api', catalogosRoutes); // Carriers, Tankers
app.use('/api', operacionesRoutes); // Dashboard, Operaciones
app.use('/api', consultasRoutes); // Ventas, Consultas
app.use('/api', configRoutes);
app.use('/api/cheques', chequesRoutes);
app.use('/api', onedriveRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api', bitacoraRoutes);
app.use('/api/check-designer', checkDesignerRoutes);

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
app.use('/api/', apiLimiter);

// Rate limiting estricto para Login (10 intentos / 15 min por IP)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos fallidos de inicio de sesión. Por favor espere 15 minutos.' }
});
app.use('/api/login', loginLimiter);

// Rate limiting para endpoints de Inteligencia Artificial (20 req / min por IP)
const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Límite de consultas de IA alcanzado por este minuto. Intente de nuevo en breve.' }
});
app.use('/api/ai/', aiLimiter);
app.use('/api/finanzas/chat', aiLimiter);

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

// Initialize DB and Start Server
initDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Server HTTP y Socket.io running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

module.exports = app;
