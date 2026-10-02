const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config(); // Standard config works better across environments

const getDbConfig = () => {
    if (process.env.DATABASE_URL) {
        try {
            const url = new URL(process.env.DATABASE_URL);
            return {
                host: url.hostname,
                user: url.username,
                password: decodeURIComponent(url.password),
                database: url.pathname.substring(1),
                port: url.port ? parseInt(url.port) : 3306,
                connectTimeout: 10000,
                waitForConnections: true,
                connectionLimit: 10,
                maxIdle: 5,
                idleTimeout: 30000,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000,
                timezone: 'Z'
            };
        } catch (e) {
            console.error('Error parsing DATABASE_URL:', e);
        }
    }

    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL && !process.env.DB_HOST) {
        throw new Error('FATAL: Database configuration missing. DATABASE_URL or DB_HOST must be provided in production.');
    }

    return {
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'db_sipe_admin',
        port: parseInt(process.env.DB_PORT || '3306'),
        connectTimeout: 10000,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 5,
        idleTimeout: 30000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        timezone: 'Z'
    };
};

const dbConfig = getDbConfig();

let pool;
let externalPools = {};

const initDB = async () => {
    try {
        // En Vercel no podemos correr 15 scripts de CREATE TABLE por timeout de Serverless (10s)
        if (process.env.VERCEL) {
            console.log('Vercel Environment Detected: Bypassing local init schemas.');
            pool = mysql.createPool(dbConfig);
            // Test connection but don't crash if it fails (db might be warming up)
            try {
                const conn = await pool.getConnection();
                conn.release();
                console.log('Vercel: DB connection OK.');
            } catch (e) {
                console.error('Vercel: DB connection FAILED on init:', e.message);
                // Pool still exists, route handlers will get the error naturally
            }
            return pool;
        }

        console.log(`Checking connection to ${dbConfig.host}:${dbConfig.port}...`);
        
        // Create connection without database to check if it exists
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            port: dbConfig.port,
            connectTimeout: 10000
        });

        console.log('Database server reachable. Ensuring database exists...');
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await connection.end();

        // Connect with the database
        pool = mysql.createPool(dbConfig);
        console.log('Connected to MySQL database!');

        // Create tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                description TEXT
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                nombre VARCHAR(100),
                email VARCHAR(100),
                password VARCHAR(255) NOT NULL,
                role_id INT,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (role_id) REFERENCES roles(id)
            );
        `);

        // Migrations for existing DB
        try { await pool.query('ALTER TABLE users ADD COLUMN nombre VARCHAR(100)'); } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME') console.error(e); }
        try { await pool.query('ALTER TABLE users ADD COLUMN email VARCHAR(100)'); } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME') console.error(e); }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                description TEXT
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id INT,
                permission_id INT,
                PRIMARY KEY (role_id, permission_id),
                FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS external_configs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                host VARCHAR(255) NOT NULL,
                user VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                database_name VARCHAR(255) NOT NULL,
                port INT DEFAULT 3306,
                type VARCHAR(50) DEFAULT 'main',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);

        try { await pool.query("ALTER TABLE external_configs ADD COLUMN type VARCHAR(50) DEFAULT 'main'"); } catch(e) { /* column may already exist */ }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS email_configs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                host VARCHAR(255) NOT NULL,
                port INT DEFAULT 587,
                secure BOOLEAN DEFAULT FALSE,
                user VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                from_address VARCHAR(255) NOT NULL,
                office_email VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);

        try { await pool.query("ALTER TABLE email_configs ADD COLUMN office_email VARCHAR(255) NULL"); } catch(e) { /* column may already exist */ }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS carriers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tankers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                carrier_id INT,
                compartments JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (carrier_id) REFERENCES carriers(id) ON DELETE SET NULL
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS empresas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                codigo VARCHAR(50) NOT NULL,
                nombre VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_codigo (codigo)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS bancos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                codigo VARCHAR(50) NOT NULL,
                descripcion VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id),
                UNIQUE KEY uk_empresa_codigo (empresa_id, codigo)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tipos_cuenta_bancaria (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                codigo VARCHAR(50) NOT NULL,
                descripcion VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id),
                UNIQUE KEY uk_empresa_codigo (empresa_id, codigo)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tipos_remesas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                codigo VARCHAR(50) NOT NULL,
                descripcion VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id),
                UNIQUE KEY uk_empresa_codigo (empresa_id, codigo)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cuentas_bancarias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                banco_id INT NOT NULL,
                tipo_cuenta_id INT NOT NULL,
                numero VARCHAR(50) NOT NULL,
                nombre VARCHAR(255),
                cod_cta VARCHAR(50),
                activa BOOLEAN DEFAULT TRUE,
                orden INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id),
                FOREIGN KEY (banco_id) REFERENCES bancos(id),
                FOREIGN KEY (tipo_cuenta_id) REFERENCES tipos_cuenta_bancaria(id),
                UNIQUE KEY uk_empresa_numero (empresa_id, numero)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS movimientos_bancarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                cuenta_bancaria_id INT NOT NULL,
                fecha DATE NOT NULL,
                fecha_aplicado DATE,
                documento VARCHAR(100),
                concepto VARCHAR(255),
                monto DECIMAL(14,2) DEFAULT 0,
                cargo DECIMAL(14,2) DEFAULT 0,
                abono DECIMAL(14,2) DEFAULT 0,
                tipo_remesa_id INT,
                num_partida VARCHAR(50),
                cod_cta VARCHAR(50),
                es_contabilizado BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id),
                FOREIGN KEY (cuenta_bancaria_id) REFERENCES cuentas_bancarias(id),
                FOREIGN KEY (tipo_remesa_id) REFERENCES tipos_remesas(id),
                INDEX idx_fecha (fecha),
                INDEX idx_empresa_fecha (empresa_id, fecha)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cheques (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                cuenta_bancaria_id INT NOT NULL,
                llave VARCHAR(20),
                fecha DATE NOT NULL,
                cheque_anulado BOOLEAN DEFAULT FALSE,
                cheque VARCHAR(20),
                valor DECIMAL(14,2) DEFAULT 0,
                a_nombre VARCHAR(150),
                fecha_aplicado DATE,
                concepto VARCHAR(200),
                es_reservado BOOLEAN DEFAULT FALSE,
                es_contabilizado BOOLEAN DEFAULT FALSE,
                es_pago_contado BOOLEAN DEFAULT FALSE,
                fue_noemitido BOOLEAN DEFAULT FALSE,
                num_partida VARCHAR(10),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id),
                FOREIGN KEY (cuenta_bancaria_id) REFERENCES cuentas_bancarias(id),
                INDEX idx_fecha (fecha),
                INDEX idx_empresa_fecha (empresa_id, fecha)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS bitacora_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                username VARCHAR(100),
                accion VARCHAR(50) NOT NULL,
                entidad VARCHAR(100) NOT NULL,
                entidad_id VARCHAR(100),
                detalles TEXT,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_creado (created_at),
                INDEX idx_entidad (entidad),
                INDEX idx_accion (accion)
            );
        `);

        // Tabla de validaciones de saldo de banco (Conciliación)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS validaciones_saldo_banco (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cuenta_bancaria_id INT NOT NULL,
                fecha_validacion DATETIME NOT NULL,
                monto_banco DECIMAL(14,2) NOT NULL DEFAULT 0,
                saldo_chequera DECIMAL(14,2) DEFAULT 0,
                diferencia DECIMAL(14,2) DEFAULT 0,
                notas TEXT,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cuenta_bancaria_id) REFERENCES cuentas_bancarias(id) ON DELETE CASCADE,
                INDEX idx_cta_fecha (cuenta_bancaria_id, fecha_validacion)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Tablas del módulo de Finanzas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS prestamos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                banco_id INT NULL,
                cuenta_bancaria_id INT NULL,
                numero_prestamo VARCHAR(50) NOT NULL UNIQUE,
                descripcion VARCHAR(255) NOT NULL,
                monto_original DECIMAL(14,2) NOT NULL,
                tasa_interes_anual DECIMAL(6,3) NOT NULL,
                plazo_meses INT NOT NULL,
                frecuencia_pago VARCHAR(20) DEFAULT 'mensual',
                fecha_inicio DATE NOT NULL,
                fecha_primer_pago DATE NOT NULL,
                cuota_calculada DECIMAL(14,2) NOT NULL,
                seguro_tipo VARCHAR(30) DEFAULT 'ninguno',
                seguro_valor DECIMAL(10,4) DEFAULT 0,
                seguro_cuota DECIMAL(10,2) DEFAULT 0,
                ahorro_tipo VARCHAR(30) DEFAULT 'ninguno',
                ahorro_valor DECIMAL(10,4) DEFAULT 0,
                ahorro_cuota DECIMAL(10,2) DEFAULT 0,
                cuota_total DECIMAL(14,2) DEFAULT 0,
                comision_tipo VARCHAR(30) DEFAULT 'none',
                comision_valor DECIMAL(10,4) DEFAULT 0,
                comision_monto DECIMAL(14,2) DEFAULT 0,
                monto_neto_desembolsado DECIMAL(14,2) DEFAULT 0,
                dias_gracia INT DEFAULT 0,
                estado VARCHAR(20) DEFAULT 'activo',
                notas TEXT,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_empresa_estado (empresa_id, estado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        try { await pool.query("ALTER TABLE prestamos ADD COLUMN comision_tipo VARCHAR(30) DEFAULT 'none'"); } catch(e) { /* existe */ }
        try { await pool.query("ALTER TABLE prestamos ADD COLUMN comision_valor DECIMAL(10,4) DEFAULT 0"); } catch(e) { /* existe */ }
        try { await pool.query("ALTER TABLE prestamos ADD COLUMN comision_monto DECIMAL(14,2) DEFAULT 0"); } catch(e) { /* existe */ }
        try { await pool.query("ALTER TABLE prestamos ADD COLUMN monto_neto_desembolsado DECIMAL(14,2) DEFAULT 0"); } catch(e) { /* existe */ }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS prestamos_pagos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                prestamo_id INT NOT NULL,
                numero_cuota INT NULL,
                fecha_pago DATE NOT NULL,
                tipo_pago VARCHAR(30) DEFAULT 'cuota_normal',
                monto_total DECIMAL(14,2) NOT NULL,
                monto_capital DECIMAL(14,2) NOT NULL,
                monto_interes DECIMAL(14,2) DEFAULT 0,
                monto_seguro DECIMAL(10,2) DEFAULT 0,
                monto_ahorro DECIMAL(10,2) DEFAULT 0,
                monto_otros DECIMAL(10,2) DEFAULT 0,
                saldo_restante DECIMAL(14,2) NOT NULL,
                numero_comprobante VARCHAR(50) NULL,
                cuenta_origen_id INT NULL,
                notas TEXT,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (prestamo_id) REFERENCES prestamos(id) ON DELETE CASCADE,
                INDEX idx_prestamo_fecha (prestamo_id, fecha_pago)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS finanzas_proyectos_inversion (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                nombre VARCHAR(150) NOT NULL,
                descripcion TEXT,
                inversion_inicial DECIMAL(14,2) NOT NULL,
                tasa_descuento DECIMAL(6,3) DEFAULT 10.0,
                duracion_anos INT NOT NULL,
                flujos_anuales JSON,
                van DECIMAL(14,2) DEFAULT 0,
                tir DECIMAL(6,3) DEFAULT 0,
                payback_anos DECIMAL(5,2) DEFAULT 0,
                roi DECIMAL(6,3) DEFAULT 0,
                estado VARCHAR(20) DEFAULT 'en_evaluacion',
                notas TEXT,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_empresa_inversion (empresa_id, estado)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS finanzas_planes_mantenimiento (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                nombre VARCHAR(150) NOT NULL,
                categoria VARCHAR(50) DEFAULT 'equipo',
                costo_estimado DECIMAL(14,2) NOT NULL,
                frecuencia VARCHAR(20) DEFAULT 'anual',
                fecha_programada DATE NOT NULL,
                fecha_completado DATE NULL,
                estado VARCHAR(20) DEFAULT 'pendiente',
                responsable VARCHAR(100),
                proveedor VARCHAR(100),
                notas TEXT,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_empresa_mantenimiento (empresa_id, estado, fecha_programada)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Seed initial data
        const [roles] = await pool.query('SELECT * FROM roles WHERE name = "Administrator"');
        if (roles.length === 0) {
            const [roleResult] = await pool.query('INSERT INTO roles (name, description) VALUES ("Administrator", "Full system access")');
            const adminRoleId = roleResult.insertId;

            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await pool.query('INSERT INTO users (username, nombre, password, role_id) VALUES ("admin", "Administrador", ?, ?)', [hashedPassword, adminRoleId]);

            // Add basic permissions
            const permissionsList = [
                ['manage_users', 'Can create, edit, and delete users'],
                ['manage_roles', 'Can manage roles and permissions'],
                ['view_dashboard', 'Can view the main dashboard'],
                ['view_bitacora', 'Can view audit logs']
            ];

            for (const [name, desc] of permissionsList) {
                const [pResult] = await pool.query('INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)', [name, desc]);
                const permId = pResult.insertId || (await pool.query('SELECT id FROM permissions WHERE name = ?', [name]))[0][0].id;
                await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [adminRoleId, permId]);
            }

            console.log('Initial setup completed with "admin" user!');
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS validaciones_saldo_banco (
                id INT AUTO_INCREMENT PRIMARY KEY,
                cuenta_bancaria_id INT NOT NULL,
                fecha_validacion DATETIME NOT NULL,
                monto_banco DECIMAL(14,2) NOT NULL DEFAULT 0,
                saldo_chequera DECIMAL(14,2) DEFAULT 0,
                diferencia DECIMAL(14,2) DEFAULT 0,
                notas TEXT,
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cuenta_bancaria_id) REFERENCES cuentas_bancarias(id) ON DELETE CASCADE,
                INDEX idx_cta_fecha (cuenta_bancaria_id, fecha_validacion)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS prestamos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                empresa_id INT NOT NULL,
                banco_id INT NULL,
                cuenta_bancaria_id INT NULL,
                numero_prestamo VARCHAR(50) NOT NULL,
                descripcion VARCHAR(255) NOT NULL,
                monto_original DECIMAL(14,2) NOT NULL,
                tasa_interes_anual DECIMAL(6,3) NOT NULL,
                plazo_meses INT NOT NULL,
                frecuencia_pago VARCHAR(20) DEFAULT 'mensual',
                fecha_inicio DATE NOT NULL,
                fecha_primer_pago DATE NOT NULL,
                cuota_calculada DECIMAL(14,2) NOT NULL,
                seguro_tipo VARCHAR(30) DEFAULT 'ninguno',
                seguro_valor DECIMAL(10,4) DEFAULT 0,
                seguro_cuota DECIMAL(10,2) DEFAULT 0,
                ahorro_tipo VARCHAR(30) DEFAULT 'ninguno',
                ahorro_valor DECIMAL(10,4) DEFAULT 0,
                ahorro_cuota DECIMAL(10,2) DEFAULT 0,
                cuota_total DECIMAL(14,2) DEFAULT 0,
                dias_gracia INT DEFAULT 0,
                estado VARCHAR(20) DEFAULT 'activo',
                notas TEXT,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (empresa_id) REFERENCES empresas(id),
                FOREIGN KEY (banco_id) REFERENCES bancos(id) ON DELETE SET NULL,
                FOREIGN KEY (cuenta_bancaria_id) REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
                INDEX idx_empresa_estado (empresa_id, estado)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS prestamos_pagos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                prestamo_id INT NOT NULL,
                numero_cuota INT NULL,
                fecha_pago DATE NOT NULL,
                tipo_pago VARCHAR(30) DEFAULT 'cuota_regular',
                monto_total DECIMAL(14,2) NOT NULL,
                monto_capital DECIMAL(14,2) NOT NULL,
                monto_interes DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                monto_seguro DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                monto_ahorro DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                monto_otros DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                saldo_restante DECIMAL(14,2) NOT NULL,
                numero_comprobante VARCHAR(50) NULL,
                cuenta_origen_id INT NULL,
                notas TEXT NULL,
                created_by INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (prestamo_id) REFERENCES prestamos(id) ON DELETE CASCADE,
                FOREIGN KEY (cuenta_origen_id) REFERENCES cuentas_bancarias(id) ON DELETE SET NULL,
                INDEX idx_prestamo_fecha (prestamo_id, fecha_pago)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                titulo VARCHAR(200) NOT NULL,
                descripcion TEXT NULL,
                tipo_plazo ENUM('dia_especifico', 'rango') DEFAULT 'dia_especifico',
                fecha_inicio DATE NULL,
                fecha_vencimiento DATE NOT NULL,
                hora_limite TIME NULL,
                prioridad ENUM('baja', 'media', 'alta', 'urgente') DEFAULT 'media',
                estado ENUM('pendiente', 'en_proceso', 'en_revision', 'completada', 'cancelada') DEFAULT 'pendiente',
                orden INT DEFAULT 0,
                categoria VARCHAR(50) DEFAULT 'General',
                assigned_to INT NOT NULL,
                created_by INT NOT NULL,
                checklist JSON NULL,
                completada_en DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE RESTRICT,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
                INDEX idx_tasks_assigned (assigned_to, estado),
                INDEX idx_tasks_vencimiento (fecha_vencimiento)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS task_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                user_id INT NOT NULL,
                comentario TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
                INDEX idx_comments_task (task_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                data JSON NULL,
                is_read TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_read (user_id, is_read, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Migration for seguro and ahorro columns
        try {
            const [cols] = await pool.query("SHOW COLUMNS FROM prestamos LIKE 'seguro_tipo'");
            if (cols.length === 0) {
                await pool.query(`
                    ALTER TABLE prestamos
                    ADD COLUMN seguro_tipo VARCHAR(30) DEFAULT 'ninguno',
                    ADD COLUMN seguro_valor DECIMAL(10,4) DEFAULT 0,
                    ADD COLUMN seguro_cuota DECIMAL(10,2) DEFAULT 0,
                    ADD COLUMN ahorro_tipo VARCHAR(30) DEFAULT 'ninguno',
                    ADD COLUMN ahorro_valor DECIMAL(10,4) DEFAULT 0,
                    ADD COLUMN ahorro_cuota DECIMAL(10,2) DEFAULT 0,
                    ADD COLUMN cuota_total DECIMAL(14,2) DEFAULT 0
                `);
            }
            const [pCols] = await pool.query("SHOW COLUMNS FROM prestamos_pagos LIKE 'monto_seguro'");
            if (pCols.length === 0) {
                await pool.query(`
                    ALTER TABLE prestamos_pagos
                    ADD COLUMN monto_seguro DECIMAL(14,2) DEFAULT 0.00 AFTER monto_interes,
                    ADD COLUMN monto_ahorro DECIMAL(14,2) DEFAULT 0.00 AFTER monto_seguro
                `);
            }
        } catch (e) {
            console.error('Migration prestamos seguros/ahorros:', e.message);
        }

        // Ensure bank reconciliation permissions exist for Administrator role
        try {
            const [adminRole] = await pool.query('SELECT id FROM roles WHERE name = "Administrator"');
            if (adminRole.length > 0) {
                const adminRoleId = adminRole[0].id;
                const newPerms = [
                    ['view_bitacora', 'Can view audit logs'],
                    ['/dashboard/bancos/conciliacion', 'Acceso a Conciliación Bancaria'],
                    ['view_conciliacion_bancaria', 'Permite consultar conciliaciones bancarias'],
                    ['manage_conciliacion_bancaria', 'Permite conciliar y desconciliar movimientos'],
                    ['edit_monto_conciliacion', 'Permite modificar montos en conciliación'],
                    ['/dashboard/finanzas/prestamos', 'Acceso a Préstamos y Créditos'],
                    ['/dashboard/finanzas/calculadora', 'Acceso a Calculadora de Amortización'],
                    ['/dashboard/finanzas/inversiones', 'Acceso a Evaluador de Inversiones y ROI'],
                    ['/dashboard/finanzas/planes-mantenimiento', 'Acceso a Planes de Mantenimiento'],
                    ['/dashboard/finanzas/asesor', 'Acceso a Asesor Financiero y Proyecciones IA'],
                    ['/dashboard/finanzas/resumen', 'Acceso a Resumen Financiero y Vencimientos'],
                    ['manage_finanzas_prestamos', 'Permite crear, editar y eliminar préstamos'],
                    ['manage_finanzas_pagos', 'Permite registrar y anular pagos de préstamos'],
                    ['manage_finanzas_inversiones', 'Permite gestionar proyectos de inversión y presupuestos'],
                    ['manage_finanzas_mantenimiento', 'Permite programar y gestionar mantenimientos'],
                    ['/dashboard/operaciones/tareas', 'Acceso a Asignación y Gestión de Tareas'],
                    ['manage_tasks', 'Permite crear, asignar y eliminar tareas'],
                    ['/dashboard/operaciones/pedidos', 'Acceso a Pedidos de Combustible'],
                    ['manage_pedidos', 'Permite gestionar pedidos de combustible y sincronización'],
                    ['/dashboard/operaciones/recordatorios', 'Acceso a Control de Recordatorios y Pagos'],
                    ['manage_recordatorios', 'Permite crear, editar, pagar y anular recordatorios']
                ];
                for (const [pName, pDesc] of newPerms) {
                    await pool.query('INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)', [pName, pDesc]);
                    const [[perm]] = await pool.query('SELECT id FROM permissions WHERE name = ?', [pName]);
                    if (perm) {
                        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [adminRoleId, perm.id]);
                    }
                }
            }
        } catch (e) {
            console.error('Migration permissions conciliacion/finanzas:', e.message);
        }

        // Ensure tipos_remesas has TR (TRANSFERENCIA) for all companies
        try {
            const [empresas] = await pool.query('SELECT id FROM empresas');
            for (const emp of empresas) {
                await pool.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "TR", "TRANSFERENCIA")', [emp.id]);
                await pool.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "RM", "REMESA DIARIA")', [emp.id]);
                await pool.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "NC", "NOTA DE CARGO")', [emp.id]);
                await pool.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "NA", "NOTA DE ABONO")', [emp.id]);
                await pool.query('INSERT IGNORE INTO tipos_remesas (empresa_id, codigo, descripcion) VALUES (?, "CH", "CHEQUE")', [emp.id]);
            }
        } catch (e) {
            console.error('Migration tipos_remesas:', e.message);
        }

        try {
            await pool.query("UPDATE IGNORE permissions SET name = '/dashboard/bancos/reportes/saldos-bancos' WHERE name = '/dashboard/consultas/saldos-bancos'");
            await pool.query("UPDATE IGNORE permissions SET name = '/dashboard/bancos/reportes/saldos-chequera' WHERE name = '/dashboard/consultas/saldos-chequera'");
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('/dashboard/bancos/reportes/saldos-bancos', 'Reporte de saldos consolidados en bancos')");
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('/dashboard/bancos/reportes/saldos-chequera', 'Reporte de saldos en chequeras')");
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('/dashboard/bancos/reportes/impresion-cheques', 'Reporte e impresión de cheques por rango')");
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('/dashboard/bancos/reportes/cheques-fecha', 'Reporte de cheques por rango de fecha')");
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('/dashboard/bancos/reportes/movimientos-fecha', 'Reporte de movimientos bancarios por rango de fecha')");

            // Permisos de Dirección Estratégica
            const estrategiaPerms = [
                ['view_direccion_estrategica', 'Acceso al módulo de Dirección Estratégica'],
                ['/dashboard/estrategia/torre-control', 'Torre de Control Ejecutiva y Flash Diario'],
                ['/dashboard/estrategia/combustible', 'Inteligencia de Combustible y Compras DGEHM'],
                ['/dashboard/estrategia/flujo-caja', 'Flujo de Caja Predictivo a 30/60 días'],
                ['/dashboard/estrategia/mermas', 'Auditoría de Mermas y Descalibración de Pista'],
                ['/dashboard/estrategia/rentabilidad', 'P&L y Rentabilidad Operativa por Estación'],
                ['/dashboard/estrategia/creditos', 'Control de Riesgo de Crédito y Flotas']
            ];
            for (const [permName, permDesc] of estrategiaPerms) {
                await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)", [permName, permDesc]);
            }

            // Permisos de Consulta de Cambios (GitHub)
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('/dashboard/seguridad/cambios', 'Consulta de cambios y versiones subidos a GitHub')");
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('view_github_changes', 'Ver cambios y commits de GitHub')");

            // Permisos de RRHH (Planillas)
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('/dashboard/rrhh/planillas', 'Acceso al módulo de Planillas RRHH')");
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('view_rrhh_planillas', 'Consultar y exportar planillas de RRHH')");
            await pool.query("INSERT IGNORE INTO permissions (name, description) VALUES ('pay_rrhh_planillas', 'Permite pagar planillas y registrar formas de pago')");

            // Tabla de pagos y formas de pago de planillas (afecta bancos y genera movimientos_bancarios)
            await pool.query(`
                CREATE TABLE IF NOT EXISTS rh_planilla_pagos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    company_id INT NOT NULL,
                    empresa_id INT NULL,
                    periodo_anio INT NOT NULL,
                    periodo_mes INT NOT NULL,
                    quincena ENUM('primera', 'segunda') NOT NULL,
                    cuenta_bancaria_id INT NOT NULL,
                    movimiento_bancario_id INT NULL,
                    monto DECIMAL(14,2) NOT NULL,
                    forma_pago VARCHAR(50) DEFAULT 'Transferencia',
                    tipo_remesa_id INT NULL,
                    documento VARCHAR(100) NULL,
                    concepto VARCHAR(255) NULL,
                    fecha_pago DATE NOT NULL,
                    created_by INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (cuenta_bancaria_id) REFERENCES cuentas_bancarias(id) ON DELETE CASCADE,
                    FOREIGN KEY (movimiento_bancario_id) REFERENCES movimientos_bancarios(id) ON DELETE SET NULL,
                    INDEX idx_rh_pago_periodo (company_id, periodo_anio, periodo_mes, quincena),
                    INDEX idx_rh_pago_cuenta (cuenta_bancaria_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            const [[adminRole]] = await pool.query("SELECT id FROM roles WHERE name IN ('admin', 'Administrator') LIMIT 1");
            if (adminRole) {
                const [allTargetPerms] = await pool.query("SELECT id FROM permissions WHERE name LIKE '/dashboard/estrategia/%' OR name LIKE '/dashboard/bancos/reportes/%' OR name = 'view_direccion_estrategica' OR name = '/dashboard/seguridad/cambios' OR name = 'view_github_changes' OR name = '/dashboard/rrhh/planillas' OR name = 'view_rrhh_planillas' OR name = 'pay_rrhh_planillas'");
                for (const p of allTargetPerms) {
                    await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [adminRole.id, p.id]);
                }
            }

            // Asignar permisos de RRHH a todos los roles existentes
            const [allRoles] = await pool.query("SELECT id FROM roles");
            const [rrhhPerms] = await pool.query("SELECT id FROM permissions WHERE name IN ('/dashboard/rrhh/planillas', 'view_rrhh_planillas', 'pay_rrhh_planillas')");
            for (const r of allRoles) {
                for (const p of rrhhPerms) {
                    await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [r.id, p.id]);
                }
            }
        } catch (e) {
            console.error('Migration bancos & estrategia & seguridad & rrhh permissions:', e.message);
        }

        // ==============================================================
        // MIGRATION: Portal Energy-Latam / Pedidos & Precios Combustible
        // ==============================================================
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS portal_pedidos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    numero_orden VARCHAR(50) NOT NULL UNIQUE,
                    id_estacion VARCHAR(50) NULL,
                    estacion_nombre VARCHAR(150) NULL,
                    fecha_pedido DATETIME NULL,
                    fecha_solicitada DATE NULL,
                    tipo_entrega VARCHAR(50) NULL,
                    tipo_producto VARCHAR(50) NULL DEFAULT 'Bulk',
                    estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
                    estado_original VARCHAR(50) NULL,
                    razon_estado TEXT NULL,
                    monto_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                    metodo_pago VARCHAR(50) NULL,
                    costo_diesel DECIMAL(10,4) DEFAULT 0.0000,
                    costo_regular DECIMAL(10,4) DEFAULT 0.0000,
                    costo_super DECIMAL(10,4) DEFAULT 0.0000,
                    costo_ion DECIMAL(10,4) DEFAULT 0.0000,
                    galones_diesel DECIMAL(10,2) DEFAULT 0.00,
                    galones_regular DECIMAL(10,2) DEFAULT 0.00,
                    galones_super DECIMAL(10,2) DEFAULT 0.00,
                    galones_ion DECIMAL(10,2) DEFAULT 0.00,
                    factura_numero VARCHAR(50) NULL,
                    factura_monto DECIMAL(12,2) DEFAULT 0.00,
                    factura_saldo_pendiente DECIMAL(12,2) DEFAULT 0.00,
                    factura_fecha_vencimiento DATE NULL,
                    factura_fecha_emision DATE NULL,
                    factura_pdf_url TEXT NULL,
                    orden_pdf_url TEXT NULL,
                    items_json LONGTEXT NULL,
                    raw_data_json LONGTEXT NULL,
                    estado_pago ENUM('PENDIENTE', 'PAGADO', 'PARCIAL', 'CONCILIADO') DEFAULT 'PENDIENTE',
                    cuenta_bancaria_id INT NULL,
                    movimiento_bancario_id INT NULL,
                    cheque_id INT NULL,
                    tipo_pago VARCHAR(50) DEFAULT 'Transferencia',
                    referencia_pago VARCHAR(100) NULL,
                    fecha_pago DATE NULL,
                    monto_pagado DECIMAL(12,2) DEFAULT 0.00,
                    observaciones_pago TEXT NULL,
                    listo_conciliacion TINYINT(1) DEFAULT 0,
                    fecha_conciliado DATE NULL,
                    sincronizado_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_portal_orden (numero_orden),
                    INDEX idx_portal_estacion (id_estacion),
                    INDEX idx_portal_estado (estado),
                    INDEX idx_portal_fecha (fecha_pedido),
                    INDEX idx_portal_pago (estado_pago, listo_conciliacion)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS portal_resumen_cuenta (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    cuenta_nombre VARCHAR(150),
                    cuenta_numero VARCHAR(50),
                    saldo_disponible DECIMAL(12,2) DEFAULT 0.00,
                    limite_credito DECIMAL(12,2) DEFAULT 0.00,
                    porcentaje_disponible DECIMAL(5,2) DEFAULT 0.00,
                    ordenes_activas_count INT DEFAULT 0,
                    ordenes_anteriores_count INT DEFAULT 0,
                    ultima_sincronizacion DATETIME,
                    raw_user_json LONGTEXT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS combustible_precios_quincenales (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    periodo_inicio DATE NOT NULL,
                    periodo_fin DATE NOT NULL,
                    precio_diesel DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
                    precio_regular DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
                    precio_super DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
                    precio_ion DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
                    variacion_diesel DECIMAL(10,4) DEFAULT 0.0000,
                    variacion_regular DECIMAL(10,4) DEFAULT 0.0000,
                    variacion_super DECIMAL(10,4) DEFAULT 0.0000,
                    variacion_ion DECIMAL(10,4) DEFAULT 0.0000,
                    fuente VARCHAR(100) DEFAULT 'Portal Energy-Latam / DGEHM',
                    activo TINYINT(1) DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_periodo (periodo_inicio, periodo_fin)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS combustible_fletes_estacion (
                    id_estacion VARCHAR(10) PRIMARY KEY,
                    estacion_nombre VARCHAR(100) NOT NULL,
                    flete_galon DECIMAL(10,5) NOT NULL DEFAULT 0.04000,
                    activo TINYINT(1) DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS combustible_precios_estacion_quincenal (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    id_estacion VARCHAR(10) NOT NULL,
                    estacion_nombre VARCHAR(100) NOT NULL,
                    periodo_inicio DATE NOT NULL,
                    periodo_fin DATE NOT NULL,
                    precio_diesel DECIMAL(10,5) NOT NULL DEFAULT 0.00000,
                    precio_regular DECIMAL(10,5) NOT NULL DEFAULT 0.00000,
                    precio_super DECIMAL(10,5) NOT NULL DEFAULT 0.00000,
                    precio_ion DECIMAL(10,5) NOT NULL DEFAULT 0.00000,
                    fuente VARCHAR(100) DEFAULT 'Liquidación Quincenal Puma / SIPE',
                    activo TINYINT(1) DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_estacion_periodo (id_estacion, periodo_inicio, periodo_fin)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS web_pedidos_temp (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    id_estacion VARCHAR(50) NOT NULL,
                    fecha DATE NOT NULL,
                    id_carrier_local INT NULL,
                    id_transportista INT NULL,
                    id_tanker_local INT NULL,
                    id_calibracion_diesel INT NULL,
                    diesel DOUBLE(15,2) DEFAULT 0,
                    regular DOUBLE(15,2) DEFAULT 0,
                    super DOUBLE(15,2) DEFAULT 0,
                    iondiesel DOUBLE(15,2) DEFAULT 0,
                    numero VARCHAR(50) NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            await pool.query(`
                CREATE TABLE IF NOT EXISTS web_pedidos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    fecha DATE NOT NULL,
                    numero VARCHAR(50) NOT NULL,
                    id_estacion VARCHAR(50) NOT NULL,
                    forma_pago VARCHAR(50) NULL,
                    p_diesel DOUBLE(15,2) DEFAULT 0,
                    p_regular DOUBLE(15,2) DEFAULT 0,
                    p_super DOUBLE(15,2) DEFAULT 0,
                    p_ion DOUBLE(15,2) DEFAULT 0,
                    id_carrier_local INT NULL,
                    id_tanker_local INT NULL,
                    flete VARCHAR(50) NULL,
                    pipa INT DEFAULT 0,
                    costo_d DOUBLE(15,4) DEFAULT 0,
                    costo_s DOUBLE(15,4) DEFAULT 0,
                    costo_r DOUBLE(15,4) DEFAULT 0,
                    costo_i DOUBLE(15,4) DEFAULT 0,
                    compartido DOUBLE(15,2) DEFAULT 0,
                    id_origen INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);

            // Seed initial resumen
            await pool.query(`
                INSERT IGNORE INTO portal_resumen_cuenta (id, cuenta_nombre, cuenta_numero, saldo_disponible, limite_credito, porcentaje_disponible, ultima_sincronizacion)
                VALUES (1, 'corina sosah', '3409396', 642.00, 2000.00, 32.00, NOW())
            `);

            // Seed real reference quincenas (exact wholesale base prices from Puma fuel liquidation)
            await pool.query(`
                INSERT INTO combustible_precios_quincenales 
                (periodo_inicio, periodo_fin, precio_diesel, precio_regular, precio_super, precio_ion, fuente, activo)
                VALUES 
                ('2026-09-15', '2026-09-28', 3.8281, 3.7120, 3.9800, 4.0274, 'Liquidación Quincenal Puma / SIPE', 0),
                ('2026-09-29', '2026-10-12', 3.8281, 3.7120, 3.9800, 4.0274, 'Liquidación Quincenal Puma / SIPE', 1)
                ON DUPLICATE KEY UPDATE
                precio_diesel = VALUES(precio_diesel),
                precio_regular = VALUES(precio_regular),
                precio_super = VALUES(precio_super),
                precio_ion = VALUES(precio_ion),
                fuente = VALUES(fuente),
                activo = VALUES(activo)
            `);

            // Seed exact wholesale station prices (Base Facturación Puma)
            await pool.query(`
                INSERT INTO combustible_precios_estacion_quincenal
                (id_estacion, estacion_nombre, periodo_inicio, periodo_fin, precio_diesel, precio_regular, precio_super, precio_ion)
                VALUES
                ('002', 'Puma Miraflores', '2026-09-15', '2026-09-28', 3.82810, 3.71200, 3.98000, 0.00000),
                ('006', 'Shell Chalchuapa', '2026-09-15', '2026-09-28', 3.83330, 3.72610, 3.99410, 0.00000),
                ('008', 'Puma Costa del Sol', '2026-09-15', '2026-09-28', 3.82810, 3.71200, 3.98004, 0.00000),
                ('014', 'Puma San Martin (La Loma)', '2026-09-15', '2026-09-28', 3.85040, 3.73430, 4.00234, 4.02739),
                ('015', 'Shell 14 Avenida (Zurita)', '2026-09-15', '2026-09-28', 3.85420, 3.73810, 4.00614, 0.00000),
                ('004', 'Puma El Desvio', '2026-09-15', '2026-09-28', 3.83000, 3.72000, 3.99000, 0.00000),

                ('002', 'Puma Miraflores', '2026-09-29', '2026-10-12', 3.82810, 3.71200, 3.98000, 0.00000),
                ('006', 'Shell Chalchuapa', '2026-09-29', '2026-10-12', 3.83330, 3.72610, 3.99410, 0.00000),
                ('008', 'Puma Costa del Sol', '2026-09-29', '2026-10-12', 3.82810, 3.71200, 3.98004, 0.00000),
                ('014', 'Puma San Martin (La Loma)', '2026-09-29', '2026-10-12', 3.85040, 3.73430, 4.00234, 4.02739),
                ('015', 'Shell 14 Avenida (Zurita)', '2026-09-29', '2026-10-12', 3.85420, 3.73810, 4.00614, 0.00000),
                ('004', 'Puma El Desvio', '2026-09-29', '2026-10-12', 3.83000, 3.72000, 3.99000, 0.00000)
                ON DUPLICATE KEY UPDATE
                precio_diesel = VALUES(precio_diesel),
                precio_regular = VALUES(precio_regular),
                precio_super = VALUES(precio_super),
                precio_ion = VALUES(precio_ion)
            `);

            // Seed default station freight rates per gallon
            await pool.query(`
                INSERT INTO combustible_fletes_estacion (id_estacion, estacion_nombre, flete_galon) VALUES
                ('002', 'Puma Miraflores', 0.04630),
                ('006', 'Shell Chalchuapa', 0.03110),
                ('008', 'Puma Costa del Sol', 0.05370),
                ('014', 'Puma San Martin (La Loma)', 0.04690),
                ('015', 'Shell 14 Avenida (Zurita)', 0.02820),
                ('004', 'Puma El Desvio', 0.04000)
                ON DUPLICATE KEY UPDATE
                flete_galon = VALUES(flete_galon),
                estacion_nombre = VALUES(estacion_nombre)
            `);

            // Seed orders from snapshot if empty or only partial
            const [orderCount] = await pool.query('SELECT COUNT(*) as c FROM portal_pedidos');
            if (orderCount[0].c < 50) {
                const { seedInitialPortalOrders } = require('./services/energyLatamService');
                await seedInitialPortalOrders(true);
            }
        } catch (e) {
            console.error('Migration portal_pedidos & combustible_precios:', e.message);
        }

        return pool;
    } catch (error) {
        console.error('DATABASE INITIALIZATION ERROR:', error.message);
        console.error('Hint: Ensure your database is running and accessible. Check connection details (host, user, password, database) and SSL configuration.');
        throw error; // Re-throw to ensure the application handles the failure
    }
};

const withRetry = async (fn, retries = 2) => {
    try {
        return await fn();
    } catch (err) {
        if ((err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ETIMEDOUT') && retries > 0) {
            console.warn(`[DB] Retrying DB query due to ${err.code}...`);
            await new Promise(r => setTimeout(r, 200));
            return await withRetry(fn, retries - 1);
        }
        throw err;
    }
};

const getDb = () => {
    if (!pool) {
        pool = mysql.createPool(dbConfig);
    }
    return pool;
};

const getExternalDb = async () => {
    let configs = [];
    try {
        const mainPool = getDb();
        [configs] = await withRetry(() => mainPool.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1"));
    } catch (err) {
        console.warn('Warning getting external_configs main:', err.message);
    }
    
    const config = (configs && configs.length > 0) ? configs[0] : {
        host: process.env.EXTERNAL_DB_HOST || process.env.DB_HOST || '127.0.0.1',
        user: process.env.EXTERNAL_DB_USER || process.env.DB_USER || 'root',
        password: process.env.EXTERNAL_DB_PASSWORD || process.env.DB_PASSWORD || '',
        database_name: process.env.EXTERNAL_DB_NAME || 'db_system_rrs',
        database: process.env.EXTERNAL_DB_NAME || 'db_system_rrs',
        port: parseInt(process.env.EXTERNAL_DB_PORT || process.env.DB_PORT || '3306')
    };
    const dbName = config.database_name || config.database || 'db_system_rrs';
    const poolKey = `main:${config.host}:${config.port || 3306}:${dbName}:${config.user}`;
    
    let externalDb = externalPools[poolKey];
    if (!externalDb) {
        externalDb = mysql.createPool({
            host: config.host,
            user: config.user,
            password: config.password,
            database: dbName,
            port: config.port || 3306,
            connectTimeout: 10000,
            waitForConnections: true,
            connectionLimit: 10,
            maxIdle: 5,
            idleTimeout: 30000,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            timezone: 'Z'
        });
        externalPools[poolKey] = externalDb;
    }
    return externalDb;
};

const getAccountingDb = async () => {
    let configs = [];
    try {
        const mainPool = getDb();
        [configs] = await withRetry(() => mainPool.query("SELECT * FROM external_configs WHERE type = 'accounting' ORDER BY created_at DESC LIMIT 1"));
    } catch (err) {
        console.warn('Warning getting external_configs accounting:', err.message);
    }
    
    const config = (configs && configs.length > 0) ? configs[0] : {
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database_name: 'db_sistema_saas',
        database: 'db_sistema_saas',
        port: parseInt(process.env.DB_PORT || '3306')
    };
    const dbName = config.database_name || config.database || 'db_sistema_saas';
    const poolKey = `accounting:${config.host}:${config.port || 3306}:${dbName}:${config.user}`;
    
    let externalDb = externalPools[poolKey];
    if (!externalDb) {
        externalDb = mysql.createPool({
            host: config.host,
            user: config.user,
            password: config.password,
            database: dbName,
            port: config.port || 3306,
            connectTimeout: 10000,
            waitForConnections: true,
            connectionLimit: 10,
            maxIdle: 5,
            idleTimeout: 30000,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            timezone: 'Z'
        });
        externalPools[poolKey] = externalDb;
    }
    return externalDb;
};

/**
 * Helper para ejecutar operaciones multi-tabla dentro de una transacción gestionada
 */
const withTransaction = async (callback) => {
    const mainPool = getDb();
    if (!mainPool) throw new Error('Database pool not initialized');
    const connection = await mainPool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};

module.exports = { initDB, getDb, getExternalDb, getAccountingDb, withRetry, withTransaction };
