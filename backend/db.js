const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config(); // Standard config works better across environments

const getDbConfig = () => {
    const config = {
        host: process.env.DB_HOST || '207.244.251.167',
        user: process.env.DB_USER || 'sysadmin',
        password: process.env.DB_PASSWORD || 'QwErTy123',
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
    return config;
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);

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
                    ['edit_monto_conciliacion', 'Permite modificar montos en conciliación']
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
            console.error('Migration permissions conciliacion:', e.message);
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

        return pool;
    } catch (error) {
        console.error('DATABASE INITIALIZATION ERROR:', error.message);
        console.error('Hint: Ensure your database is running and accessible. Check connection details (host, user, password, database) and SSL configuration.');
        throw error; // Re-throw to ensure the application handles the failure
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
        [configs] = await mainPool.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
    } catch (err) {
        if (err.code === 'ECONNRESET') {
            console.log('RETRYING getExternalDb config query due to ECONNRESET...');
            try {
                const mainPool = getDb();
                [configs] = await mainPool.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
            } catch (retryErr) {
                console.warn('Retry failed getting external_configs main:', retryErr.message);
            }
        } else {
            console.warn('Warning getting external_configs main:', err.message);
        }
    }
    
    const config = (configs && configs.length > 0) ? configs[0] : {
        host: process.env.DB_HOST || '207.244.251.167',
        user: process.env.DB_USER || 'sysadmin',
        password: process.env.DB_PASSWORD || 'QwErTy123',
        database_name: 'db_system_rrs',
        database: 'db_system_rrs',
        port: 3306
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
            connectionLimit: 10,
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
        [configs] = await mainPool.query("SELECT * FROM external_configs WHERE type = 'accounting' ORDER BY created_at DESC LIMIT 1");
    } catch (err) {
        if (err.code === 'ECONNRESET') {
            console.log('RETRYING getAccountingDb config query due to ECONNRESET...');
            try {
                const mainPool = getDb();
                [configs] = await mainPool.query("SELECT * FROM external_configs WHERE type = 'accounting' ORDER BY created_at DESC LIMIT 1");
            } catch (retryErr) {
                console.warn('Retry failed getting external_configs accounting:', retryErr.message);
            }
        } else {
            console.warn('Warning getting external_configs accounting:', err.message);
        }
    }
    
    const config = (configs && configs.length > 0) ? configs[0] : {
        host: process.env.DB_HOST || '207.244.251.167',
        user: process.env.DB_USER || 'sysadmin',
        password: process.env.DB_PASSWORD || 'QwErTy123',
        database_name: 'db_sytem_rrs_conta',
        database: 'db_sytem_rrs_conta',
        port: 3306
    };
    const dbName = config.database_name || config.database || 'db_sytem_rrs_conta';
    const poolKey = `accounting:${config.host}:${config.port || 3306}:${dbName}:${config.user}`;
    
    let externalDb = externalPools[poolKey];
    if (!externalDb) {
        externalDb = mysql.createPool({
            host: config.host,
            user: config.user,
            password: config.password,
            database: dbName,
            port: config.port || 3306,
            connectionLimit: 10,
            timezone: 'Z'
        });
        externalPools[poolKey] = externalDb;
    }
    return externalDb;
};

module.exports = { initDB, getDb, getExternalDb, getAccountingDb };
