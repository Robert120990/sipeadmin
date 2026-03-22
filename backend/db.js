const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const path = require('path');
dotenv.config(); // Standard config works better across environments

const getDbConfig = () => {
    if (process.env.DATABASE_URL) {
        // Parse mysql://user:pass@host/db
        try {
            const url = new URL(process.env.DATABASE_URL);
            return {
                host: url.hostname,
                user: url.username,
                password: decodeURIComponent(url.password),
                database: url.pathname.substring(1),
                port: url.port ? parseInt(url.port) : 3306
            };
        } catch (e) {
            console.error('Error parsing DATABASE_URL:', e);
        }
    }
    return {
        host: '207.244.251.167',
        user: 'sysadmin',
        password: 'QwErTy123',
        database: 'db_sipe_admin'
    };
};

const dbConfig = getDbConfig();

const initDB = async () => {
    try {
        // En Vercel no podemos correr 15 scripts de CREATE TABLE por timeout de Serverless (10s)
        if (process.env.VERCEL) {
            console.log('Vercel Environment Detected: Bypassing local init schemas.');
            return mysql.createPool(dbConfig);
        }

        // Create connection without database to check if it exists
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        console.log('Checking database...');
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        await connection.end();

        // Connect with the database
        const pool = mysql.createPool(dbConfig);
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
                password VARCHAR(255) NOT NULL,
                role_id INT,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (role_id) REFERENCES roles(id)
            );
        `);

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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );
        `);

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
            await pool.query('INSERT INTO users (username, password, role_id) VALUES ("admin", ?, ?)', [hashedPassword, adminRoleId]);

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

module.exports = { initDB };
