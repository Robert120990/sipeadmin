const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Cargar las variables de entorno desde el archivo .env en la carpeta backend
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Reproduce la lógica de getDbConfig() de db.js para asegurar compatibilidad.
 */
const getDbConfig = () => {
    let config = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'db_sipe_admin',
        port: parseInt(process.env.DB_PORT || '3306'),
        connectTimeout: 10000,
        waitForConnections: true,
        connectionLimit: 10,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        timezone: 'Z',
        multipleStatements: true // Force multiple statements for migration script
    };

    if (process.env.DATABASE_URL) {
        try {
            const url = new URL(process.env.DATABASE_URL);
            config = {
                host: url.hostname,
                user: url.username,
                password: decodeURIComponent(url.password),
                database: url.pathname.substring(1),
                port: url.port ? parseInt(url.port) : 3306,
                connectTimeout: 10000,
                waitForConnections: true,
                connectionLimit: 10,
                enableKeepAlive: true,
                keepAliveInitialDelay: 0,
                timezone: 'Z',
                multipleStatements: true // Force multiple statements for migration script
            };
        } catch (e) {
            console.error('Error parsing DATABASE_URL:', e);
        }
    }
    return config;
};

const dbConfig = getDbConfig();

const migrations = `
-- Tabla para almacenar los formatos de diseño de cheques
CREATE TABLE IF NOT EXISTS check_format (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    banco_id INT,
    description TEXT,
    width DECIMAL(10,2) NOT NULL DEFAULT 152.4,
    height DECIMAL(10,2) NOT NULL DEFAULT 69.85,
    orientation ENUM('vertical', 'horizontal') NOT NULL DEFAULT 'horizontal',
    margin_top DECIMAL(10,2) DEFAULT 0,
    margin_right DECIMAL(10,2) DEFAULT 0,
    margin_bottom DECIMAL(10,2) DEFAULT 0,
    margin_left DECIMAL(10,2) DEFAULT 0,
    resolution INT NOT NULL DEFAULT 96,
    printer_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    design_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_name (name),
    FOREIGN KEY (banco_id) REFERENCES bancos(id) ON DELETE SET NULL
);

-- Tabla para almacenar las calibraciones de impresoras
CREATE TABLE IF NOT EXISTS printer_calibration (
    id INT AUTO_INCREMENT PRIMARY KEY,
    printer_name VARCHAR(255) NOT NULL,
    offset_x DECIMAL(10,2) DEFAULT 0,
    offset_y DECIMAL(10,2) DEFAULT 0,
    scale DECIMAL(5,2) DEFAULT 1.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_printer (printer_name)
);
`;

const runMigrations = async () => {
    let connection;
    try {
        console.log('Intentando conectar a la base de datos con la configuración:');
        console.log(`Host: ${dbConfig.host}, DB: ${dbConfig.database}, Puerto: ${dbConfig.port}, User: ${dbConfig.user}`);
        connection = await mysql.createConnection(dbConfig);
        console.log('Conexión exitosa. Ejecutando migraciones...');

        await connection.query(migrations);
        console.log('Migraciones completadas con éxito.');
        console.log('Tablas verificadas: check_format, printer_calibration');
    } catch (error) {
        console.error('Error durante la migración:', error.message);
        process.exit(1);
    } finally {
        if (connection && connection.end) {
            await connection.end();
            console.log('Conexión cerrada.');
        }
    }
};

runMigrations();
