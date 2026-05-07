const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const path = require('path');
dotenv.config(); // Standard config works better across environments

const getDbConfig = () => {
    const config = {
        host: process.env.DB_HOST || '207.244.251.167',
        user: process.env.DB_USER || 'sysadmin',
        password: process.env.DB_PASSWORD || 'QwErTy123',
        database: process.env.DB_NAME || 'db_sipe_admin',
        port: parseInt(process.env.DB_PORT || '3306'),
        connectTimeout: 10000, // 10s timeout
        waitForConnections: true,
        connectionLimit: 10,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
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
                enableKeepAlive: true,
                keepAliveInitialDelay: 0
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

        try { await pool.query("ALTER TABLE external_configs ADD COLUMN type VARCHAR(50) DEFAULT 'main'"); } catch(e) {}

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
                ['view_dashboard', 'Can view the main dashboard']
            ];

            for (const [name, desc] of permissionsList) {
                const [pResult] = await pool.query('INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)', [name, desc]);
                const permId = pResult.insertId || (await pool.query('SELECT id FROM permissions WHERE name = ?', [name]))[0][0].id;
                await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [adminRoleId, permId]);
            }

            console.log('Initial setup completed with "admin" user!');
        }

        return pool;
    } catch (error) {
        console.error('DATABASE INITIALIZATION ERROR:', error.message);
        console.error('Hint: Ensure your database is running and accessible. Check connection details (host, user, password, database) and SSL configuration.');
        throw error; // Re-throw to ensure the application handles the failure
    }
};

const getDb = () => pool;

const getExternalDb = async () => {
    let configs;
    try {
        [configs] = await pool.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
    } catch (err) {
        if (err.code === 'ECONNRESET') {
            console.log('RETRYING getExternalDb config query due to ECONNRESET...');
            [configs] = await pool.query("SELECT * FROM external_configs WHERE type = 'main' ORDER BY created_at DESC LIMIT 1");
        } else {
            throw err;
        }
    }
    
    if (configs.length === 0) throw new Error('No hay configuración de base de datos externa (Principal). Configúrala primero.');
    
    const config = configs[0];
    const poolKey = `main:${config.host}:${config.port || 3306}:${config.database_name}:${config.user}`;
    
    let externalDb = externalPools[poolKey];
    if (!externalDb) {
        externalDb = mysql.createPool({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database_name,
            port: config.port || 3306,
            connectionLimit: 10
        });
        externalPools[poolKey] = externalDb;
    }
    return externalDb;
};

const getAccountingDb = async () => {
    let configs;
    try {
        [configs] = await pool.query("SELECT * FROM external_configs WHERE type = 'accounting' ORDER BY created_at DESC LIMIT 1");
    } catch (err) {
        if (err.code === 'ECONNRESET') {
            console.log('RETRYING getAccountingDb config query due to ECONNRESET...');
            [configs] = await pool.query("SELECT * FROM external_configs WHERE type = 'accounting' ORDER BY created_at DESC LIMIT 1");
        } else {
            throw err;
        }
    }
    
    if (configs.length === 0) throw new Error('No hay configuración de base de datos de contabilidad. Configúrala primero.');
    
    const config = configs[0];
    const poolKey = `accounting:${config.host}:${config.port || 3306}:${config.database_name}:${config.user}`;
    
    let externalDb = externalPools[poolKey];
    if (!externalDb) {
        externalDb = mysql.createPool({
            host: config.host,
            user: config.user,
            password: config.password,
            database: config.database_name,
            port: config.port || 3306,
            connectionLimit: 10
        });
        externalPools[poolKey] = externalDb;
    }
    return externalDb;
};

module.exports = { initDB, getDb, getExternalDb, getAccountingDb };
