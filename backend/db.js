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
                    ['manage_tasks', 'Permite crear, asignar y eliminar tareas']
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

            const [[adminRole]] = await pool.query("SELECT id FROM roles WHERE name IN ('admin', 'Administrator') LIMIT 1");
            if (adminRole) {
                const [allTargetPerms] = await pool.query("SELECT id FROM permissions WHERE name LIKE '/dashboard/estrategia/%' OR name LIKE '/dashboard/bancos/reportes/%' OR name = 'view_direccion_estrategica' OR name = '/dashboard/seguridad/cambios' OR name = 'view_github_changes'");
                for (const p of allTargetPerms) {
                    await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)", [adminRole.id, p.id]);
                }
            }
        } catch (e) {
            console.error('Migration bancos & estrategia & seguridad permissions:', e.message);
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
