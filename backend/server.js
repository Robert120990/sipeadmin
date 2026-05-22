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

// Mount Routes
app.use('/api', authRoutes); // Login, Users, Roles
app.use('/api/bancos', bancosRoutes);
app.use('/api', catalogosRoutes); // Carriers, Tankers
app.use('/api', operacionesRoutes); // Dashboard, Operaciones
app.use('/api', consultasRoutes); // Ventas, Consultas
app.use('/api', configRoutes);
app.use('/api/cheques', chequesRoutes);
app.use('/api', onedriveRoutes);
app.use('/api/ai', aiRoutes);

// Health Check
app.get('/api/debug-ping', (req, res) => res.json({ message: 'pong' }));

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Error interno del servidor' });
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
