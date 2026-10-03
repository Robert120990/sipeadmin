/**
 * Script automatizado de respaldo para la base de datos de SIPE Admin
 * - Genera volcado SQL comprimido con gzip (.sql.gz)
 * - Soporta mysqldump nativo con fallback a conector MySQL2 puro
 * - Aplica política de retención automática de 7 días
 * - Uso: node scripts/backup-db.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const BACKUP_DIR = path.join(__dirname, '../backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);

const getTimestamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const purgeOldBackups = () => {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const now = Date.now();
    const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(BACKUP_DIR);

    for (const file of files) {
        if (!file.endsWith('.sql.gz') && !file.endsWith('.sql')) continue;
        const filePath = path.join(BACKUP_DIR, file);
        try {
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
                console.log(`[Backup Retention] Archivo antiguo eliminado: ${file}`);
            }
        } catch (err) {
            console.warn(`[Backup Retention] No se pudo evaluar/eliminar ${file}:`, err.message);
        }
    }
};

const runMysqldump = (host, port, user, password, database, outputPath) => {
    return new Promise((resolve, reject) => {
        const gzip = zlib.createGzip();
        const writeStream = fs.createWriteStream(outputPath);

        const args = [
            `--host=${host}`,
            `--port=${port}`,
            `--user=${user}`,
            '--single-transaction',
            '--quick',
            '--routines',
            '--triggers',
            database
        ];

        const env = { ...process.env, MYSQL_PWD: password };
        const dump = spawn('mysqldump', args, { env });

        dump.stdout.pipe(gzip).pipe(writeStream);

        let stderr = '';
        dump.stderr.on('data', chunk => { stderr += chunk.toString(); });

        dump.on('close', code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`mysqldump terminó con código ${code}: ${stderr}`));
            }
        });

        dump.on('error', err => {
            reject(err);
        });
    });
};

const fallbackNodeDump = async (config, outputPath) => {
    console.log('[Backup Fallback] Usando conector Node.js para generar volcado SQL...');
    const conn = await mysql.createConnection(config);
    const gzip = zlib.createGzip();
    const writeStream = fs.createWriteStream(outputPath);
    gzip.pipe(writeStream);

    try {
        const header = `-- SIPE Admin Node.js Database Dump\n-- Fecha: ${new Date().toISOString()}\n-- Base de datos: ${config.database}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`;
        gzip.write(header);

        const [tables] = await conn.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
        const tableNames = tables.map(r => Object.values(r)[0]);

        for (const tableName of tableNames) {
            const [[createRow]] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
            const createSql = createRow['Create Table'];
            gzip.write(`DROP TABLE IF EXISTS \`${tableName}\`;\n${createSql};\n\n`);

            const [rows] = await conn.query(`SELECT * FROM \`${tableName}\``);
            if (rows.length > 0) {
                for (const row of rows) {
                    const keys = Object.keys(row).map(k => `\`${k}\``).join(', ');
                    const values = Object.values(row).map(v => {
                        if (v === null || v === undefined) return 'NULL';
                        if (typeof v === 'number') return v;
                        if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
                        if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "\\'")}'`;
                        return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
                    }).join(', ');
                    gzip.write(`INSERT INTO \`${tableName}\` (${keys}) VALUES (${values});\n`);
                }
                gzip.write('\n');
            }
        }

        gzip.write('SET FOREIGN_KEY_CHECKS=1;\n');
        gzip.end();

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
    } finally {
        await conn.end();
    }
};

const executeBackup = async () => {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const host = process.env.DB_HOST || 'localhost';
    const port = parseInt(process.env.DB_PORT || '3306', 10);
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || '';
    const database = process.env.DB_NAME || 'sipeadmin';

    const timestamp = getTimestamp();
    const fileName = `sipeadmin_${database}_${timestamp}.sql.gz`;
    const outputPath = path.join(BACKUP_DIR, fileName);

    console.log(`[Backup] Iniciando respaldo de '${database}' a ${fileName}...`);

    try {
        await runMysqldump(host, port, user, password, database, outputPath);
        console.log(`[Backup] Respaldo completado exitosamente vía mysqldump: ${fileName}`);
    } catch (err) {
        console.warn(`[Backup] mysqldump no disponible o falló (${err.message}). Ejecutando fallback...`);
        try {
            await fallbackNodeDump({ host, port, user, password, database }, outputPath);
            console.log(`[Backup] Respaldo completado exitosamente vía conector Node.js: ${fileName}`);
        } catch (nodeErr) {
            console.error('[Backup Error] Falló el respaldo por completo:', nodeErr);
            if (fs.existsSync(outputPath)) {
                try { 
                    fs.unlinkSync(outputPath); 
                } catch (unlinkErr) {
                    console.warn('[Backup] No se pudo limpiar archivo fallido:', unlinkErr.message);
                }
            }
            process.exit(1);
        }
    }

    purgeOldBackups();
};

if (require.main === module) {
    executeBackup()
        .then(() => {
            console.log('[Backup] Tarea finalizada con éxito.');
            process.exit(0);
        })
        .catch(err => {
            console.error('[Backup Error Fatal]:', err);
            process.exit(1);
        });
}

module.exports = { executeBackup, purgeOldBackups };
