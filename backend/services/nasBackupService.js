const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const axios = require('axios');
const mysql = require('mysql2/promise');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const dbModule = require('../db');
const {
    encryptSecret,
    decryptSecret,
    generateAgentToken,
    hashSecret,
    timingSafeEqualHex
} = require('../utils/cryptoVault');

const NAS_TIMEZONE = 'America/El_Salvador';
const SYSTEM_DATABASES = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
const ALLOWED_MODES = new Set(['synology_pull', 'synology_dsm', 'webdav', 'sftp', 'local_mount']);
const ALLOWED_TYPES = new Set(['synology', 'qnap', 'truenas', 'linux_sftp', 'webdav_generico']);

const SCHEDULE_PRESETS = {
    manual: { cron: '', label: 'Solo manual' },
    every_6h: { cron: '0 */6 * * *', label: 'Cada 6 horas' },
    every_12h: { cron: '0 */12 * * *', label: 'Cada 12 horas' },
    daily: { cron: '0 2 * * *', label: 'Diario (02:00 AM)' },
    weekly: { cron: '0 3 * * 0', label: 'Semanal (Dom 03:00 AM)' }
};

const activeBackupJobs = new Set();
const scheduledTasks = new Map();
let globalIo = null;

// ── Validation & Formatting Helpers ──────────────────────────────────────────

function isPrivateIpAddress(rawHost) {
    if (!rawHost || typeof rawHost !== 'string') return false;
    const host = rawHost.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    if (!host) return false;
    if (host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.lan')) {
        return true;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!ipv4) return false;
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
}

function validateSafeDatabaseName(name) {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 64) return false;
    if (SYSTEM_DATABASES.has(trimmed.toLowerCase())) return false;
    return /^[a-zA-Z0-9_$]+$/.test(trimmed);
}

function validateSafeRemotePath(rawPath) {
    if (typeof rawPath !== 'string') return false;
    const trimmed = rawPath.trim();
    if (!trimmed || trimmed.length > 250) return false;
    if (trimmed.includes('..') || /[;|&$`\r\n"'<>]/.test(trimmed)) return false;
    return /^\/[a-zA-Z0-9_.\-/ ]+$/.test(trimmed);
}

function validateSafeHost(rawHost) {
    if (!rawHost || typeof rawHost !== 'string') return false;
    const trimmed = rawHost.trim();
    if (!trimmed || trimmed.length > 250) return false;
    if (/[;|&$`\r\n\s"'<>]/.test(trimmed)) return false;
    return /^[a-zA-Z0-9.:_-]+$/.test(trimmed);
}

function validateSafeUsername(rawUser) {
    if (!rawUser || typeof rawUser !== 'string') return false;
    const trimmed = rawUser.trim();
    if (!trimmed || trimmed.length > 100) return false;
    return /^[a-zA-Z0-9._@-]+$/.test(trimmed);
}

function normalizeDsmSharePath(rawPath) {
    const cleaned = String(rawPath || '/backups/sipe-db').trim().replace(/\/+/g, '/').replace(/\/$/, '') || '/backups/sipe-db';
    // En Synology FileStation API las rutas inician en la carpeta compartida (sin /volume1)
    const stripped = cleaned.replace(/^\/volume\d+\//i, '/');
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function resolveEffectiveHost(nas) {
    const remote = String(nas?.host_remoto || '').trim();
    const lan = String(nas?.host_lan || '').trim();
    return remote || lan;
}

function resolveDefaultPort(modo, usarSsl = true) {
    switch (modo) {
        case 'synology_dsm':
            return usarSsl ? 5001 : 5000;
        case 'webdav':
            return usarSsl ? 5006 : 5005;
        case 'sftp':
            return 22;
        case 'local_mount':
            return 0;
        case 'synology_pull':
        default:
            return 5001;
    }
}

function safeJsonParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

function formatBytes(bytes) {
    const num = Number(bytes || 0);
    if (!Number.isFinite(num) || num <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
    return `${(num / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function getBackupTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getTempWorkDir() {
    const dir = path.join(os.tmpdir(), 'sipe_nas_backups');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    return dir;
}

function sanitizeNasServerForClient(row) {
    if (!row) return null;
    const effectiveHost = resolveEffectiveHost(row);
    const basesDatos = safeJsonParse(row.bases_datos_json, []);
    const telemetria = safeJsonParse(row.telemetria_json, null);
    const archivosRemotos = safeJsonParse(row.archivos_remotos_json, []);

    return {
        id: row.id,
        nombre: row.nombre,
        tipo_nas: row.tipo_nas,
        modo_conexion: row.modo_conexion,
        host_lan: row.host_lan || '',
        host_remoto: row.host_remoto || '',
        host_efectivo: effectiveHost,
        es_ip_privada: isPrivateIpAddress(effectiveHost),
        puerto: Number(row.puerto || 5001),
        usar_ssl: Boolean(row.usar_ssl),
        permitir_cert_autofirmado: Boolean(row.permitir_cert_autofirmado),
        usuario: row.usuario,
        password: '',
        has_password: Boolean(row.password_enc),
        has_ssh_key: Boolean(row.ssh_private_key_enc),
        ruta_destino: row.ruta_destino,
        servidor_origen_ip: row.servidor_origen_ip || '5.252.55.29',
        bases_datos: Array.isArray(basesDatos) ? basesDatos : [],
        respaldar_todas: Boolean(row.respaldar_todas),
        programacion_activa: Boolean(row.programacion_activa),
        frecuencia: row.frecuencia || 'daily',
        cron_expresion: row.cron_expresion || '0 2 * * *',
        retencion_dias: Number(row.retencion_dias || 30),
        notificar_telegram: Boolean(row.notificar_telegram),
        es_principal: Boolean(row.es_principal),
        activo: Boolean(row.activo),
        agent_token_prefix: row.agent_token_prefix || '',
        has_agent_token: Boolean(row.agent_token_hash),
        estado_conexion: row.estado_conexion || 'pendiente',
        ultimo_check_at: row.ultimo_check_at,
        ultimo_heartbeat_at: row.ultimo_heartbeat_at,
        ultimo_backup_at: row.ultimo_backup_at,
        ultimo_backup_estado: row.ultimo_backup_estado,
        ultimo_error: row.ultimo_error,
        telemetria,
        archivos_remotos: Array.isArray(archivosRemotos) ? archivosRemotos : [],
        notas: row.notas || '',
        backup_en_curso: activeBackupJobs.has(Number(row.id)),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

// ── MySQL Source Server Inspection & Dumping (5.252.55.29) ───────────────────

function getPrimaryMySqlConfig() {
    if (process.env.DATABASE_URL) {
        try {
            const url = new URL(process.env.DATABASE_URL);
            return {
                host: url.hostname,
                port: url.port ? parseInt(url.port, 10) : 3306,
                user: url.username,
                password: decodeURIComponent(url.password),
                database: url.pathname.substring(1) || 'db_sipe_admin'
            };
        } catch (_) {
            // fallback below
        }
    }
    return {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'db_sipe_admin'
    };
}

async function discoverSourceDatabases() {
    const db = dbModule.getDb();
    const mysqlCfg = getPrimaryMySqlConfig();

    const [[serverMeta]] = await db.query(
        'SELECT VERSION() AS version, @@hostname AS hostname, @@port AS port, DATABASE() AS current_db'
    );

    const [rows] = await db.query(
        `SELECT
            s.SCHEMA_NAME AS name,
            COUNT(t.TABLE_NAME) AS tables_count,
            COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS size_bytes
         FROM information_schema.SCHEMATA s
         LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME
         WHERE s.SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
         GROUP BY s.SCHEMA_NAME
         ORDER BY size_bytes DESC, s.SCHEMA_NAME ASC`
    );

    // Enriquecer con fecha del último backup registrado por BD
    const lastBackupByDb = new Map();
    try {
        const [logRows] = await db.query(
            `SELECT archivos_generados_json, finalizado_at, iniciado_at
             FROM nas_backup_logs
             WHERE estado IN ('completado', 'parcial')
             ORDER BY iniciado_at DESC
             LIMIT 60`
        );
        for (const lr of logRows) {
            const files = safeJsonParse(lr.archivos_generados_json, []);
            if (!Array.isArray(files)) continue;
            for (const f of files) {
                if (f && f.database && f.status === 'ok' && !lastBackupByDb.has(f.database)) {
                    lastBackupByDb.set(f.database, {
                        at: lr.finalizado_at || lr.iniciado_at,
                        sizeBytes: Number(f.sizeBytes || 0),
                        fileName: f.fileName || ''
                    });
                }
            }
        }
    } catch (_) {
        // non-fatal
    }

    const databases = rows.map((r) => {
        const sizeBytes = Number(r.size_bytes || 0);
        const lastInfo = lastBackupByDb.get(r.name) || null;
        return {
            name: r.name,
            tablesCount: Number(r.tables_count || 0),
            sizeBytes,
            sizeMb: Number((sizeBytes / (1024 * 1024)).toFixed(2)),
            isPrimarySipe: r.name === mysqlCfg.database || r.name === 'db_sipe_admin',
            isSaas: r.name === 'db_sistema_saas',
            lastBackupAt: lastInfo?.at || null,
            lastBackupFile: lastInfo?.fileName || null,
            lastBackupSizeBytes: lastInfo?.sizeBytes || 0
        };
    });

    const totalSizeBytes = databases.reduce((acc, item) => acc + item.sizeBytes, 0);

    return {
        sourceServer: {
            ip: process.env.PRODUCTION_SERVER_IP || '5.252.55.29',
            mysqlHost: mysqlCfg.host,
            mysqlPort: Number(serverMeta?.port || mysqlCfg.port || 3306),
            mysqlVersion: serverMeta?.version || 'MySQL',
            hostname: serverMeta?.hostname || 'vps-sipe',
            currentDb: serverMeta?.current_db || mysqlCfg.database,
            totalDatabases: databases.length,
            totalSizeBytes,
            totalSizeMb: Number((totalSizeBytes / (1024 * 1024)).toFixed(2))
        },
        databases
    };
}

function runNativeMysqldump(mysqlCfg, dbName, outputPath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const gzip = zlib.createGzip({ level: 6 });
        const writeStream = fs.createWriteStream(outputPath, { mode: 0o600 });
        let sizeBytes = 0;
        let stderr = '';
        let settled = false;

        const fail = (err) => {
            if (settled) return;
            settled = true;
            try { writeStream.destroy(); } catch (_) { /* ignore */ }
            reject(err);
        };

        const args = [
            `--host=${mysqlCfg.host}`,
            `--port=${mysqlCfg.port}`,
            `--user=${mysqlCfg.user}`,
            '--single-transaction',
            '--quick',
            '--routines',
            '--triggers',
            '--hex-blob',
            dbName
        ];

        const env = { ...process.env, MYSQL_PWD: mysqlCfg.password || '' };
        const dump = spawn('mysqldump', args, { env });

        dump.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        dump.on('error', (err) => fail(err));
        gzip.on('error', (err) => fail(err));
        writeStream.on('error', (err) => fail(err));

        dump.stdout.pipe(gzip);
        gzip.on('data', (chunk) => {
            hash.update(chunk);
            sizeBytes += chunk.length;
        });
        gzip.pipe(writeStream);

        let dumpCode = null;
        let streamFinished = false;

        const maybeFinish = () => {
            if (settled) return;
            if (dumpCode === null || !streamFinished) return;
            if (dumpCode === 0) {
                settled = true;
                resolve({
                    sizeBytes,
                    sha256: hash.digest('hex'),
                    engine: 'mysqldump'
                });
            } else {
                fail(new Error(`mysqldump código ${dumpCode}: ${stderr.trim() || 'error desconocido'}`));
            }
        };

        dump.on('close', (code) => {
            dumpCode = code;
            maybeFinish();
        });

        writeStream.on('finish', () => {
            streamFinished = true;
            maybeFinish();
        });
    });
}

function escapeSqlValue(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return 'NULL';
        return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
    }
    const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
    const escaped = str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\0/g, '\\0')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
    return `'${escaped}'`;
}

async function runFallbackNodeDump(mysqlCfg, dbName, outputPath) {
    const conn = await mysql.createConnection({
        host: mysqlCfg.host,
        port: mysqlCfg.port,
        user: mysqlCfg.user,
        password: mysqlCfg.password,
        database: dbName,
        connectTimeout: 15000
    });

    const hash = crypto.createHash('sha256');
    const gzip = zlib.createGzip({ level: 6 });
    const writeStream = fs.createWriteStream(outputPath, { mode: 0o600 });
    let sizeBytes = 0;

    gzip.on('data', (chunk) => {
        hash.update(chunk);
        sizeBytes += chunk.length;
    });
    gzip.pipe(writeStream);

    const writeChunk = (text) => new Promise((resolve, reject) => {
        if (gzip.write(text, 'utf8')) {
            resolve();
        } else {
            gzip.once('drain', resolve);
            gzip.once('error', reject);
        }
    });

    try {
        await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await conn.beginTransaction();

        await writeChunk(
            `-- SIPE Admin NAS Database Backup (Node.js Streaming Fallback)\n` +
            `-- Fecha UTC: ${new Date().toISOString()}\n` +
            `-- Base de datos: ${dbName}\n\n` +
            `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n`
        );

        const [tables] = await conn.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
        const tableNames = tables.map((row) => Object.values(row)[0]);

        for (const tableName of tableNames) {
            const [[createRow]] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
            const createSql = createRow['Create Table'];
            await writeChunk(`DROP TABLE IF EXISTS \`${tableName}\`;\n${createSql};\n\n`);

            const [rows] = await conn.query(`SELECT * FROM \`${tableName}\``);
            if (rows.length > 0) {
                const columns = Object.keys(rows[0]);
                const colsSql = columns.map((k) => `\`${k}\``).join(', ');
                const BATCH_SIZE = 100;
                for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                    const batch = rows.slice(i, i + BATCH_SIZE);
                    const tuples = batch.map((row) => {
                        const vals = columns.map((col) => escapeSqlValue(row[col])).join(', ');
                        return `(${vals})`;
                    });
                    await writeChunk(`INSERT INTO \`${tableName}\` (${colsSql}) VALUES\n${tuples.join(',\n')};\n`);
                }
                await writeChunk('\n');
            }
        }

        await conn.commit();
        await writeChunk('SET FOREIGN_KEY_CHECKS=1;\n');
        gzip.end();

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            gzip.on('error', reject);
        });

        return {
            sizeBytes,
            sha256: hash.digest('hex'),
            engine: 'mysql2-node'
        };
    } catch (err) {
        try { await conn.rollback(); } catch (_) { /* ignore */ }
        try { writeStream.destroy(); } catch (_) { /* ignore */ }
        throw err;
    } finally {
        await conn.end().catch(() => {});
    }
}

async function dumpDatabaseToTempGzip(dbName) {
    if (!validateSafeDatabaseName(dbName)) {
        throw new Error(`Nombre de base de datos no permitido: ${dbName}`);
    }
    const mysqlCfg = getPrimaryMySqlConfig();
    const workDir = getTempWorkDir();
    const timestamp = getBackupTimestamp();
    const fileName = `${dbName}_${timestamp}.sql.gz`;
    const localPath = path.join(workDir, `${crypto.randomBytes(6).toString('hex')}_${fileName}`);
    const startedAt = Date.now();

    try {
        const result = await runNativeMysqldump(mysqlCfg, dbName, localPath);
        return {
            database: dbName,
            fileName,
            localPath,
            sizeBytes: result.sizeBytes,
            sha256: result.sha256,
            engine: result.engine,
            durationMs: Date.now() - startedAt
        };
    } catch (dumpErr) {
        try {
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        } catch (_) { /* ignore */ }

        const fallbackResult = await runFallbackNodeDump(mysqlCfg, dbName, localPath);
        return {
            database: dbName,
            fileName,
            localPath,
            sizeBytes: fallbackResult.sizeBytes,
            sha256: fallbackResult.sha256,
            engine: fallbackResult.engine,
            fallbackReason: dumpErr.message,
            durationMs: Date.now() - startedAt
        };
    }
}

// ── WebDAV XML Parser ────────────────────────────────────────────────────────

function parseWebdavPropfindXml(xmlText, baseRemotePath = '') {
    if (!xmlText || typeof xmlText !== 'string') return [];
    const responses = xmlText.match(/<(?:[a-z0-9_-]+:)?response\b[\s\S]*?<\/(?:[a-z0-9_-]+:)?response>/gi) || [];
    const normalizedBase = String(baseRemotePath || '').replace(/\/+$/, '');
    const files = [];

    for (const block of responses) {
        const hrefMatch = block.match(/<(?:[a-z0-9_-]+:)?href[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?href>/i);
        const sizeMatch = block.match(/<(?:[a-z0-9_-]+:)?getcontentlength[^>]*>(\d+)<\/(?:[a-z0-9_-]+:)?getcontentlength>/i);
        const dateMatch = block.match(/<(?:[a-z0-9_-]+:)?getlastmodified[^>]*>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?getlastmodified>/i);
        const isCollection = /<(?:[a-z0-9_-]+:)?collection\b/i.test(block);
        if (isCollection || !hrefMatch) continue;

        let decodedHref = hrefMatch[1].trim();
        try {
            decodedHref = decodeURIComponent(decodedHref);
        } catch (_) { /* keep raw */ }

        const cleanHref = decodedHref.replace(/\/+$/, '');
        if (normalizedBase && cleanHref.endsWith(normalizedBase)) continue;
        const fileName = path.posix.basename(cleanHref);
        if (!fileName || (!fileName.endsWith('.sql.gz') && !fileName.endsWith('.sql'))) continue;

        const mtime = dateMatch ? new Date(dateMatch[1].trim()) : null;
        files.push({
            name: fileName,
            path: cleanHref,
            sizeBytes: sizeMatch ? Number(sizeMatch[1]) : 0,
            modifiedAt: mtime && !Number.isNaN(mtime.getTime()) ? mtime.toISOString() : null
        });
    }

    return files.sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));
}

// ── Protocol Adapters (DSM API, WebDAV, SFTP, Local Mount) ───────────────────

function buildHttpsAgent(nas) {
    return new https.Agent({
        rejectUnauthorized: !nas.permitir_cert_autofirmado
    });
}

async function dsmLogin(nas) {
    const host = resolveEffectiveHost(nas);
    const protocol = nas.usar_ssl ? 'https' : 'http';
    const port = Number(nas.puerto || (nas.usar_ssl ? 5001 : 5000));
    const baseUrl = `${protocol}://${host}:${port}`;
    const password = decryptSecret(nas.password_enc);
    const httpsAgent = nas.usar_ssl ? buildHttpsAgent(nas) : undefined;

    if (!password) {
        throw new Error('Contraseña de Synology DSM no configurada. Edite el NAS e ingrese la contraseña del usuario.');
    }

    const res = await axios.get(`${baseUrl}/webapi/auth.cgi`, {
        params: {
            api: 'SYNO.API.Auth',
            version: 3,
            method: 'login',
            account: nas.usuario,
            passwd: password,
            session: 'FileStation',
            format: 'sid'
        },
        timeout: 12000,
        httpsAgent
    });

    if (!res.data?.success || !res.data?.data?.sid) {
        const code = res.data?.error?.code;
        const reasonMap = {
            400: 'Usuario o contraseña incorrectos en Synology DSM',
            401: 'Cuenta deshabilitada en Synology DSM',
            402: 'Permiso denegado para este usuario en FileStation',
            403: 'La cuenta requiere código 2FA/OTP (cree un usuario dedicado de backup sin 2FA o use Modo Agente Pull)',
            404: 'Autenticación fallida en Synology DSM'
        };
        throw new Error(reasonMap[code] || `Synology DSM rechazó el inicio de sesión (código ${code || 'desconocido'})`);
    }

    return {
        baseUrl,
        sid: res.data.data.sid,
        httpsAgent
    };
}

async function dsmLogout(session) {
    if (!session?.sid) return;
    try {
        await axios.get(`${session.baseUrl}/webapi/auth.cgi`, {
            params: {
                api: 'SYNO.API.Auth',
                version: 1,
                method: 'logout',
                session: 'FileStation',
                _sid: session.sid
            },
            timeout: 5000,
            httpsAgent: session.httpsAgent
        });
    } catch (_) {
        // non-fatal
    }
}

async function dsmListFiles(session, remotePath) {
    const sharePath = normalizeDsmSharePath(remotePath);
    const res = await axios.get(`${session.baseUrl}/webapi/entry.cgi`, {
        params: {
            api: 'SYNO.FileStation.List',
            version: 2,
            method: 'list',
            folder_path: sharePath,
            additional: '["size","time"]',
            _sid: session.sid
        },
        timeout: 15000,
        httpsAgent: session.httpsAgent
    });

    if (!res.data?.success) {
        const code = res.data?.error?.code;
        if (code === 408) {
            return []; // Carpeta aún no creada
        }
        throw new Error(`No se pudo listar carpeta "${sharePath}" en Synology DSM (código ${code || 'desconocido'})`);
    }

    const rawFiles = res.data?.data?.files || [];
    return rawFiles
        .filter((f) => !f.isdir && (f.name.endsWith('.sql.gz') || f.name.endsWith('.sql')))
        .map((f) => ({
            name: f.name,
            path: f.path,
            sizeBytes: Number(f.additional?.size || 0),
            modifiedAt: f.additional?.time?.mtime ? new Date(f.additional.time.mtime * 1000).toISOString() : null
        }))
        .sort((a, b) => (b.modifiedAt || '').localeCompare(a.modifiedAt || ''));
}

function dsmUploadFileStream(session, remotePath, localPath, fileName) {
    return new Promise((resolve, reject) => {
        const sharePath = normalizeDsmSharePath(remotePath);
        const boundary = `----SipeNasBoundary${crypto.randomBytes(12).toString('hex')}`;
        const fileStat = fs.statSync(localPath);

        const textFields = [
            ['path', sharePath],
            ['create_parents', 'true'],
            ['overwrite', 'true']
        ];

        let preamble = '';
        for (const [k, v] of textFields) {
            preamble += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
        }
        preamble += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/gzip\r\n\r\n`;

        const preambleBuf = Buffer.from(preamble, 'utf8');
        const epilogueBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
        const totalLength = preambleBuf.length + fileStat.size + epilogueBuf.length;

        const targetUrl = new URL(
            `${session.baseUrl}/webapi/entry.cgi?api=SYNO.FileStation.Upload&version=2&method=upload&_sid=${encodeURIComponent(session.sid)}`
        );
        const isHttps = targetUrl.protocol === 'https:';
        const transport = isHttps ? https : http;

        const req = transport.request(
            {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (isHttps ? 443 : 80),
                path: `${targetUrl.pathname}${targetUrl.search}`,
                method: 'POST',
                agent: isHttps ? session.httpsAgent : undefined,
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': totalLength
                },
                timeout: 300000
            },
            (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk.toString('utf8'); });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body || '{}');
                        if (parsed.success) {
                            resolve({ remotePath: `${sharePath}/${fileName}` });
                        } else {
                            reject(new Error(`Synology Upload falló (código ${parsed.error?.code || res.statusCode})`));
                        }
                    } catch (_) {
                        reject(new Error(`Respuesta inesperada de Synology Upload (HTTP ${res.statusCode})`));
                    }
                });
            }
        );

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Tiempo de espera agotado subiendo respaldo al Synology NAS'));
        });

        req.write(preambleBuf);
        const fileStream = fs.createReadStream(localPath);
        fileStream.on('error', (err) => {
            req.destroy(err);
            reject(err);
        });
        fileStream.on('end', () => {
            req.write(epilogueBuf);
            req.end();
        });
        fileStream.pipe(req, { end: false });
    });
}

async function dsmDeleteFiles(session, filePaths) {
    if (!Array.isArray(filePaths) || filePaths.length === 0) return 0;
    const res = await axios.get(`${session.baseUrl}/webapi/entry.cgi`, {
        params: {
            api: 'SYNO.FileStation.Delete',
            version: 2,
            method: 'delete',
            path: JSON.stringify(filePaths),
            _sid: session.sid
        },
        timeout: 30000,
        httpsAgent: session.httpsAgent
    });
    return res.data?.success ? filePaths.length : 0;
}

async function webdavRequest(nas, method, subPath = '', extraConfig = {}) {
    const host = resolveEffectiveHost(nas);
    const protocol = nas.usar_ssl ? 'https' : 'http';
    const port = Number(nas.puerto || (nas.usar_ssl ? 5006 : 5005));
    const password = decryptSecret(nas.password_enc);
    const cleanBase = normalizeDsmSharePath(nas.ruta_destino);
    const fullPath = subPath
        ? `${cleanBase.replace(/\/$/, '')}/${subPath.replace(/^\//, '')}`
        : cleanBase;
    const encodedPath = fullPath.split('/').map((seg) => encodeURIComponent(seg)).join('/');
    const url = `${protocol}://${host}:${port}${encodedPath}`;

    return axios({
        method,
        url,
        auth: {
            username: nas.usuario,
            password
        },
        httpsAgent: nas.usar_ssl ? buildHttpsAgent(nas) : undefined,
        timeout: extraConfig.timeout || 20000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
        ...extraConfig
    });
}

async function ensureWebdavFolders(nas) {
    const segments = normalizeDsmSharePath(nas.ruta_destino).split('/').filter(Boolean);
    const host = resolveEffectiveHost(nas);
    const protocol = nas.usar_ssl ? 'https' : 'http';
    const port = Number(nas.puerto || (nas.usar_ssl ? 5006 : 5005));
    const password = decryptSecret(nas.password_enc);
    let current = '';

    for (const seg of segments) {
        current += `/${encodeURIComponent(seg)}`;
        await axios({
            method: 'MKCOL',
            url: `${protocol}://${host}:${port}${current}`,
            auth: { username: nas.usuario, password },
            httpsAgent: nas.usar_ssl ? buildHttpsAgent(nas) : undefined,
            timeout: 10000,
            validateStatus: () => true
        });
    }
}

function runCommandNoShell(command, args, { env = process.env, timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { env });
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            try { proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
        }, timeoutMs);

        proc.stdout.on('data', (c) => { stdout += c.toString('utf8'); });
        proc.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut) {
                return reject(new Error(`Comando ${command} excedió el tiempo límite (${Math.round(timeoutMs / 1000)}s)`));
            }
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(stderr.trim() || `${command} finalizó con código ${code}`));
            }
        });
    });
}

async function withTempSshAuth(nas, fn) {
    const keyContent = decryptSecret(nas.ssh_private_key_enc);
    const password = decryptSecret(nas.password_enc);
    let keyFile = null;

    try {
        if (keyContent && keyContent.trim()) {
            keyFile = path.join(getTempWorkDir(), `key_${crypto.randomBytes(8).toString('hex')}.pem`);
            fs.writeFileSync(keyFile, `${keyContent.trim()}\n`, { mode: 0o600 });
            return await fn({ keyFile, password: null });
        }
        return await fn({ keyFile: null, password: password || null });
    } finally {
        if (keyFile) {
            try { fs.unlinkSync(keyFile); } catch (_) { /* ignore */ }
        }
    }
}

async function runSshExec(nas, remoteCmd, timeoutMs = 20000) {
    const host = resolveEffectiveHost(nas);
    const port = Number(nas.puerto || 22);
    if (!validateSafeHost(host) || !validateSafeUsername(nas.usuario)) {
        throw new Error('Host o usuario SSH contienen caracteres inválidos');
    }

    return withTempSshAuth(nas, async ({ keyFile, password }) => {
        const baseArgs = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=10',
            '-p', String(port)
        ];
        if (keyFile) {
            baseArgs.push('-i', keyFile, '-o', 'BatchMode=yes');
            baseArgs.push(`${nas.usuario}@${host}`, remoteCmd);
            return runCommandNoShell('ssh', baseArgs, { timeoutMs });
        }
        if (password) {
            baseArgs.push(`${nas.usuario}@${host}`, remoteCmd);
            return runCommandNoShell('sshpass', ['-e', 'ssh', ...baseArgs], {
                env: { ...process.env, SSHPASS: password },
                timeoutMs
            }).catch((err) => {
                if (err.code === 'ENOENT') {
                    throw new Error('Para SFTP con contraseña instale "sshpass" en el servidor 5.252.55.29, o configure una Llave Privada SSH o use Synology DSM API / Agente Pull.');
                }
                throw err;
            });
        }
        baseArgs.push('-o', 'BatchMode=yes', `${nas.usuario}@${host}`, remoteCmd);
        return runCommandNoShell('ssh', baseArgs, { timeoutMs });
    });
}

async function runScpUpload(nas, localPath, remoteFullPath) {
    const host = resolveEffectiveHost(nas);
    const port = Number(nas.puerto || 22);
    if (!validateSafeHost(host) || !validateSafeUsername(nas.usuario)) {
        throw new Error('Host o usuario SFTP inválidos');
    }

    return withTempSshAuth(nas, async ({ keyFile, password }) => {
        const baseArgs = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ConnectTimeout=15',
            '-P', String(port)
        ];
        if (keyFile) {
            baseArgs.push('-i', keyFile, '-o', 'BatchMode=yes', localPath, `${nas.usuario}@${host}:${remoteFullPath}`);
            return runCommandNoShell('scp', baseArgs, { timeoutMs: 300000 });
        }
        if (password) {
            baseArgs.push(localPath, `${nas.usuario}@${host}:${remoteFullPath}`);
            return runCommandNoShell('sshpass', ['-e', 'scp', ...baseArgs], {
                env: { ...process.env, SSHPASS: password },
                timeoutMs: 300000
            }).catch((err) => {
                if (err.code === 'ENOENT') {
                    throw new Error('Para SCP/SFTP con contraseña instale "sshpass" en 5.252.55.29 o use Llave Privada SSH / Modo Agente Pull.');
                }
                throw err;
            });
        }
        baseArgs.push('-o', 'BatchMode=yes', localPath, `${nas.usuario}@${host}:${remoteFullPath}`);
        return runCommandNoShell('scp', baseArgs, { timeoutMs: 300000 });
    });
}

// ── Public Service Operations ────────────────────────────────────────────────

async function getNasByIdRaw(id) {
    const db = dbModule.getDb();
    const [rows] = await db.query('SELECT * FROM nas_servers WHERE id = ? LIMIT 1', [Number(id)]);
    return rows?.[0] || null;
}

async function listNasServers() {
    const db = dbModule.getDb();
    const [rows] = await db.query(
        'SELECT * FROM nas_servers ORDER BY es_principal DESC, activo DESC, id ASC'
    );
    return rows.map(sanitizeNasServerForClient);
}

async function getOverview() {
    const db = dbModule.getDb();
    const [servers, discovery, [logRows]] = await Promise.all([
        listNasServers(),
        discoverSourceDatabases().catch((err) => ({
            sourceServer: {
                ip: process.env.PRODUCTION_SERVER_IP || '5.252.55.29',
                mysqlHost: getPrimaryMySqlConfig().host,
                mysqlPort: getPrimaryMySqlConfig().port,
                mysqlVersion: 'No disponible',
                hostname: 'vps-sipe',
                totalDatabases: 0,
                totalSizeBytes: 0,
                totalSizeMb: 0,
                error: err.message
            },
            databases: []
        })),
        db.query(
            `SELECT l.*, s.nombre AS nas_nombre, s.host_lan AS nas_host_lan
             FROM nas_backup_logs l
             JOIN nas_servers s ON s.id = l.nas_id
             ORDER BY l.iniciado_at DESC
             LIMIT 40`
        )
    ]);

    const recentLogs = logRows.map((row) => ({
        ...row,
        bases_objetivo: safeJsonParse(row.bases_objetivo_json, []),
        archivos_generados: safeJsonParse(row.archivos_generados_json, [])
    }));

    return {
        servers,
        sourceServer: discovery.sourceServer,
        databases: discovery.databases,
        recentLogs,
        schedulePresets: SCHEDULE_PRESETS,
        schedulerStatus: {
            activeCronJobs: scheduledTasks.size,
            timezone: NAS_TIMEZONE,
            runningJobs: Array.from(activeBackupJobs)
        }
    };
}

function validateAndNormalizeNasPayload(payload, existing = null) {
    const nombre = String(payload.nombre || '').trim();
    const tipo_nas = ALLOWED_TYPES.has(payload.tipo_nas) ? payload.tipo_nas : 'synology';
    const modo_conexion = ALLOWED_MODES.has(payload.modo_conexion) ? payload.modo_conexion : 'synology_pull';
    const host_lan = String(payload.host_lan || '').trim();
    const host_remoto = String(payload.host_remoto || '').trim();
    const usuario = String(payload.usuario || '').trim();
    const usar_ssl = payload.usar_ssl !== undefined ? Boolean(payload.usar_ssl) : true;
    const permitir_cert_autofirmado = payload.permitir_cert_autofirmado !== undefined ? Boolean(payload.permitir_cert_autofirmado) : true;
    const rawPort = payload.puerto !== undefined && payload.puerto !== '' ? parseInt(payload.puerto, 10) : resolveDefaultPort(modo_conexion, usar_ssl);
    const ruta_destino = String(payload.ruta_destino || '/volume1/backups/sipe-db').trim();
    const servidor_origen_ip = String(payload.servidor_origen_ip || '5.252.55.29').trim();
    const respaldar_todas = payload.respaldar_todas !== undefined ? Boolean(payload.respaldar_todas) : true;
    const rawBases = Array.isArray(payload.bases_datos) ? payload.bases_datos : [];
    const bases_datos = rawBases.map((b) => String(b || '').trim()).filter(validateSafeDatabaseName);
    const frecuencia = Object.prototype.hasOwnProperty.call(SCHEDULE_PRESETS, payload.frecuencia) || payload.frecuencia === 'custom'
        ? payload.frecuencia
        : 'daily';
    const cron_expresion = frecuencia === 'custom'
        ? String(payload.cron_expresion || '0 2 * * *').trim()
        : (SCHEDULE_PRESETS[frecuencia]?.cron || '0 2 * * *');
    const programacion_activa = frecuencia === 'manual' ? false : (payload.programacion_activa !== undefined ? Boolean(payload.programacion_activa) : true);
    const retencion_dias = Math.max(1, Math.min(365, parseInt(payload.retencion_dias || '30', 10) || 30));
    const notificar_telegram = payload.notificar_telegram !== undefined ? Boolean(payload.notificar_telegram) : true;
    const es_principal = Boolean(payload.es_principal);
    const activo = payload.activo !== undefined ? Boolean(payload.activo) : true;
    const notas = payload.notas !== undefined ? String(payload.notas || '').trim().slice(0, 1000) : '';

    if (!nombre || nombre.length > 120) {
        throw new Error('El nombre del servidor NAS es obligatorio (máximo 120 caracteres).');
    }
    if (!usuario || !validateSafeUsername(usuario)) {
        throw new Error('El usuario del NAS es obligatorio y solo debe contener letras, números, puntos, guiones o @.');
    }
    if (host_lan && !validateSafeHost(host_lan)) {
        throw new Error('La dirección IP LAN del NAS contiene caracteres inválidos.');
    }
    if (host_remoto && !validateSafeHost(host_remoto)) {
        throw new Error('El host remoto / Tailscale / DDNS contiene caracteres inválidos.');
    }
    if (!host_lan && !host_remoto && modo_conexion !== 'local_mount') {
        throw new Error('Debe especificar al menos la IP LAN (ej. 192.168.31.222) o el Host Remoto del NAS.');
    }
    if (!validateSafeRemotePath(ruta_destino)) {
        throw new Error('La ruta de destino en el NAS debe iniciar con "/" y no contener ".." ni caracteres especiales peligrosos.');
    }
    if (modo_conexion !== 'local_mount' && (Number.isNaN(rawPort) || rawPort < 1 || rawPort > 65535)) {
        throw new Error('El puerto debe ser un número entre 1 y 65535.');
    }
    if (programacion_activa && cron_expresion && !cron.validate(cron_expresion)) {
        throw new Error(`La expresión cron "${cron_expresion}" no es válida.`);
    }

    const password_enc = (payload.password !== undefined && payload.password !== null && String(payload.password) !== '')
        ? encryptSecret(payload.password)
        : (existing?.password_enc || null);

    const ssh_private_key_enc = (payload.ssh_private_key !== undefined && payload.ssh_private_key !== null && String(payload.ssh_private_key) !== '')
        ? encryptSecret(payload.ssh_private_key)
        : (payload.clear_ssh_key ? null : (existing?.ssh_private_key_enc || null));

    return {
        nombre,
        tipo_nas,
        modo_conexion,
        host_lan,
        host_remoto,
        puerto: modo_conexion === 'local_mount' ? 0 : rawPort,
        usar_ssl: usar_ssl ? 1 : 0,
        permitir_cert_autofirmado: permitir_cert_autofirmado ? 1 : 0,
        usuario,
        password_enc,
        ssh_private_key_enc,
        ruta_destino,
        servidor_origen_ip,
        bases_datos_json: JSON.stringify(bases_datos),
        respaldar_todas: respaldar_todas ? 1 : 0,
        programacion_activa: programacion_activa ? 1 : 0,
        frecuencia,
        cron_expresion: cron_expresion || '0 2 * * *',
        retencion_dias,
        notificar_telegram: notificar_telegram ? 1 : 0,
        es_principal: es_principal ? 1 : 0,
        activo: activo ? 1 : 0,
        notas
    };
}

async function createNasServer(payload, userId = null) {
    const db = dbModule.getDb();
    const data = validateAndNormalizeNasPayload(payload, null);
    const tokenBundle = generateAgentToken();

    if (data.es_principal) {
        await db.query('UPDATE nas_servers SET es_principal = 0');
    }

    const [result] = await db.query(
        `INSERT INTO nas_servers (
            nombre, tipo_nas, modo_conexion, host_lan, host_remoto, puerto,
            usar_ssl, permitir_cert_autofirmado, usuario, password_enc, ssh_private_key_enc,
            ruta_destino, servidor_origen_ip, bases_datos_json, respaldar_todas,
            programacion_activa, frecuencia, cron_expresion, retencion_dias,
            notificar_telegram, es_principal, activo,
            agent_token_hash, agent_token_prefix, agent_token_enc,
            estado_conexion, notas, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
        [
            data.nombre, data.tipo_nas, data.modo_conexion, data.host_lan, data.host_remoto, data.puerto,
            data.usar_ssl, data.permitir_cert_autofirmado, data.usuario, data.password_enc, data.ssh_private_key_enc,
            data.ruta_destino, data.servidor_origen_ip, data.bases_datos_json, data.respaldar_todas,
            data.programacion_activa, data.frecuencia, data.cron_expresion, data.retencion_dias,
            data.notificar_telegram, data.es_principal, data.activo,
            tokenBundle.hash, tokenBundle.prefix, tokenBundle.encrypted,
            data.notas, userId
        ]
    );

    await reloadNasBackupSchedulers();
    const created = await getNasByIdRaw(result.insertId);
    return sanitizeNasServerForClient(created);
}

async function updateNasServer(id, payload) {
    const db = dbModule.getDb();
    const existing = await getNasByIdRaw(id);
    if (!existing) {
        const err = new Error('Servidor NAS no encontrado');
        err.status = 404;
        throw err;
    }

    const data = validateAndNormalizeNasPayload(payload, existing);
    if (data.es_principal) {
        await db.query('UPDATE nas_servers SET es_principal = 0 WHERE id <> ?', [Number(id)]);
    }

    await db.query(
        `UPDATE nas_servers SET
            nombre = ?, tipo_nas = ?, modo_conexion = ?, host_lan = ?, host_remoto = ?, puerto = ?,
            usar_ssl = ?, permitir_cert_autofirmado = ?, usuario = ?, password_enc = ?, ssh_private_key_enc = ?,
            ruta_destino = ?, servidor_origen_ip = ?, bases_datos_json = ?, respaldar_todas = ?,
            programacion_activa = ?, frecuencia = ?, cron_expresion = ?, retencion_dias = ?,
            notificar_telegram = ?, es_principal = ?, activo = ?, notas = ?
         WHERE id = ?`,
        [
            data.nombre, data.tipo_nas, data.modo_conexion, data.host_lan, data.host_remoto, data.puerto,
            data.usar_ssl, data.permitir_cert_autofirmado, data.usuario, data.password_enc, data.ssh_private_key_enc,
            data.ruta_destino, data.servidor_origen_ip, data.bases_datos_json, data.respaldar_todas,
            data.programacion_activa, data.frecuencia, data.cron_expresion, data.retencion_dias,
            data.notificar_telegram, data.es_principal, data.activo, data.notas,
            Number(id)
        ]
    );

    await reloadNasBackupSchedulers();
    const updated = await getNasByIdRaw(id);
    return sanitizeNasServerForClient(updated);
}

async function deleteNasServer(id) {
    const db = dbModule.getDb();
    const existing = await getNasByIdRaw(id);
    if (!existing) {
        const err = new Error('Servidor NAS no encontrado');
        err.status = 404;
        throw err;
    }
    await db.query('DELETE FROM nas_servers WHERE id = ?', [Number(id)]);
    await reloadNasBackupSchedulers();
    return { deleted: true, id: Number(id), nombre: existing.nombre };
}

async function rotateNasAgentToken(id) {
    const db = dbModule.getDb();
    const existing = await getNasByIdRaw(id);
    if (!existing) {
        const err = new Error('Servidor NAS no encontrado');
        err.status = 404;
        throw err;
    }
    const tokenBundle = generateAgentToken();
    await db.query(
        'UPDATE nas_servers SET agent_token_hash = ?, agent_token_prefix = ?, agent_token_enc = ? WHERE id = ?',
        [tokenBundle.hash, tokenBundle.prefix, tokenBundle.encrypted, Number(id)]
    );
    return {
        id: Number(id),
        token: tokenBundle.token,
        prefix: tokenBundle.prefix
    };
}

function getEffectiveAgentToken(nas) {
    if (nas.agent_token_enc) {
        try {
            return decryptSecret(nas.agent_token_enc);
        } catch (_) {
            return '';
        }
    }
    return '';
}

function buildSynologyPullScript(nas, publicBaseUrl = 'https://admin.sipesv.com') {
    const cleanBase = String(publicBaseUrl || 'https://admin.sipesv.com').replace(/\/+$/, '');
    const token = getEffectiveAgentToken(nas) || 'REEMPLAZAR_CON_TOKEN_ROTADO';
    const destDir = nas.ruta_destino || '/volume1/backups/sipe-db';
    const retentionDays = Number(nas.retencion_dias || 30);
    const nasName = String(nas.nombre || 'Synology NAS').replace(/"/g, "'");
    const hostLan = nas.host_lan || '192.168.31.222';

    return `#!/bin/bash
# ==============================================================================
# SIPE Admin -> Synology NAS Backup Agent (Modo Pull Seguro HTTPS)
# NAS: ${nasName} (${hostLan}) | Usuario: ${nas.usuario}
# Origen BD: ${nas.servidor_origen_ip || '5.252.55.29'} (${cleanBase})
# Carpeta Destino Synology: ${destDir}
# Retención local: ${retentionDays} días
#
# Instalación en Synology DSM:
#   Panel de control -> Programador de tareas -> Crear -> Tareas programadas
#   -> Script definido por el usuario (Programar diario p.ej. 02:00 AM)
# ==============================================================================

set -uo pipefail

SIPE_URL="${cleanBase}"
NAS_TOKEN="${token}"
DEST_DIR="${destDir}"
RETENTION_DAYS="${retentionDays}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
START_MS="$(($(date +%s) * 1000))"

mkdir -p "$DEST_DIR"
chmod 750 "$DEST_DIR" 2>/dev/null || true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "Iniciando respaldo de bases de datos desde $SIPE_URL hacia $DEST_DIR..."

MANIFEST_FILE="$(mktemp)"
HDR_FILE="$(mktemp)"
RESULTS_FILE="$(mktemp)"
trap 'rm -f "$MANIFEST_FILE" "$HDR_FILE" "$RESULTS_FILE"' EXIT

HTTP_CODE="$(curl -sS -w '%{http_code}' -o "$MANIFEST_FILE" \\
  --connect-timeout 15 --max-time 60 \\
  -H "X-NAS-Token: $NAS_TOKEN" \\
  "$SIPE_URL/api/seguridad/nas/agent/manifest")"

if [ "$HTTP_CODE" != "200" ]; then
  log "ERROR: No se pudo consultar el manifiesto (HTTP $HTTP_CODE)."
  exit 1
fi

DATABASES="$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
for db in data.get("databases", []):
    print(db)
' "$MANIFEST_FILE" 2>/dev/null)"

if [ -z "$DATABASES" ]; then
  log "ADVERTENCIA: No se recibieron bases de datos para respaldar."
  exit 1
fi

TOTAL_DBS=0
OK_DBS=0
TOTAL_BYTES=0
ERRORS_ACC=""

for DB_NAME in $DATABASES; do
  TOTAL_DBS=$((TOTAL_DBS + 1))
  OUT_FILE="$DEST_DIR/\${DB_NAME}_\${TIMESTAMP}.sql.gz"
  DB_START="$(($(date +%s) * 1000))"
  log "Descargando volcado comprimido de '$DB_NAME'..."

  : > "$HDR_FILE"
  DUMP_HTTP="$(curl -sS -w '%{http_code}' -D "$HDR_FILE" -o "$OUT_FILE" \\
    --connect-timeout 20 --max-time 900 \\
    -H "X-NAS-Token: $NAS_TOKEN" \\
    "$SIPE_URL/api/seguridad/nas/agent/dump/$DB_NAME")"

  DB_END="$(($(date +%s) * 1000))"
  DB_DUR="$((DB_END - DB_START))"
  FILE_STATUS="error"
  FILE_ERR=""
  FILE_SIZE=0
  LOCAL_SHA=""

  if [ "$DUMP_HTTP" = "200" ] && [ -s "$OUT_FILE" ]; then
    REMOTE_SHA="$(grep -i '^x-backup-sha256:' "$HDR_FILE" | awk '{print $2}' | tr -d '\\r\\n')"
    LOCAL_SHA="$(sha256sum "$OUT_FILE" | awk '{print $1}')"
    FILE_SIZE="$(stat -c%s "$OUT_FILE" 2>/dev/null || wc -c < "$OUT_FILE")"

    if [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "$LOCAL_SHA" ]; then
      rm -f "$OUT_FILE"
      FILE_ERR="Checksum SHA-256 no coincide (archivo descartado)"
      ERRORS_ACC="\${ERRORS_ACC}\${DB_NAME}: \${FILE_ERR}; "
      log "ERROR integridad en $DB_NAME: esperado=$REMOTE_SHA local=$LOCAL_SHA"
    else
      FILE_STATUS="ok"
      OK_DBS=$((OK_DBS + 1))
      TOTAL_BYTES=$((TOTAL_BYTES + FILE_SIZE))
      log "OK $DB_NAME -> $(basename "$OUT_FILE") ($FILE_SIZE bytes, SHA256=\${LOCAL_SHA:0:12}...)"
    fi
  else
    rm -f "$OUT_FILE"
    FILE_ERR="HTTP $DUMP_HTTP al descargar respaldo"
    ERRORS_ACC="\${ERRORS_ACC}\${DB_NAME}: \${FILE_ERR}; "
    log "ERROR descargando $DB_NAME (HTTP $DUMP_HTTP)"
  fi

  DB_NAME="$DB_NAME" OUT_FILE="$OUT_FILE" FILE_SIZE="$FILE_SIZE" LOCAL_SHA="$LOCAL_SHA" \\
    DB_DUR="$DB_DUR" FILE_STATUS="$FILE_STATUS" FILE_ERR="$FILE_ERR" \\
    python3 -c '
import json, os
item = {
    "database": os.environ["DB_NAME"],
    "fileName": os.path.basename(os.environ["OUT_FILE"]),
    "remotePath": os.environ["OUT_FILE"],
    "sizeBytes": int(os.environ["FILE_SIZE"] or 0),
    "sha256": os.environ["LOCAL_SHA"],
    "durationMs": int(os.environ["DB_DUR"] or 0),
    "status": os.environ["FILE_STATUS"],
    "error": os.environ["FILE_ERR"] or None
}
print(json.dumps(item))
' >> "$RESULTS_FILE"
done

# Retención local en Synology NAS
PURGED_COUNT="$(find "$DEST_DIR" -maxdepth 1 -type f \\( -name "*.sql.gz" -o -name "*.sql" \\) -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null | wc -l | tr -d ' ')"

# Telemetría del volumen Synology e inventario de últimos respaldos
END_MS="$(($(date +%s) * 1000))"
TOTAL_DUR="$((END_MS - START_MS))"
FINAL_STATUS="completado"
if [ "$OK_DBS" -eq 0 ]; then
  FINAL_STATUS="error"
elif [ "$OK_DBS" -lt "$TOTAL_DBS" ]; then
  FINAL_STATUS="parcial"
fi

REPORT_PAYLOAD="$(DEST_DIR="$DEST_DIR" RESULTS_FILE="$RESULTS_FILE" FINAL_STATUS="$FINAL_STATUS" \\
  TOTAL_DBS="$TOTAL_DBS" OK_DBS="$OK_DBS" TOTAL_BYTES="$TOTAL_BYTES" \\
  TOTAL_DUR="$TOTAL_DUR" PURGED_COUNT="$PURGED_COUNT" ERRORS_ACC="$ERRORS_ACC" \\
  python3 -c '
import json, os, shutil, socket, glob, datetime

dest = os.environ["DEST_DIR"]
usage = shutil.disk_usage(dest)
dsm_ver = "Synology DSM"
try:
    with open("/etc.defaults/VERSION", "r", encoding="utf-8") as fh:
        kv = dict(line.strip().split("=", 1) for line in fh if "=" in line)
        ver = kv.get("productversion", "").strip(chr(34))
        bld = kv.get("buildnumber", "").strip(chr(34))
        if ver:
            dsm_ver = f"DSM {ver} (build {bld})" if bld else f"DSM {ver}"
except Exception:
    pass

result_items = []
with open(os.environ["RESULTS_FILE"], "r", encoding="utf-8") as rf:
    for line in rf:
        line = line.strip()
        if line:
            result_items.append(json.loads(line))

files = []
for p in sorted(glob.glob(os.path.join(dest, "*.sql*")), key=os.path.getmtime, reverse=True)[:50]:
    st = os.stat(p)
    files.append({
        "name": os.path.basename(p),
        "path": p,
        "sizeBytes": st.st_size,
        "modifiedAt": datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat()
    })

payload = {
    "status": os.environ["FINAL_STATUS"],
    "totalBases": int(os.environ["TOTAL_DBS"]),
    "basesExitosas": int(os.environ["OK_DBS"]),
    "tamanoTotalBytes": int(os.environ["TOTAL_BYTES"]),
    "duracionMs": int(os.environ["TOTAL_DUR"]),
    "archivosPurgados": int(os.environ["PURGED_COUNT"] or 0),
    "errorDetalle": os.environ["ERRORS_ACC"].strip() or None,
    "files": result_items,
    "remoteFiles": files,
    "telemetry": {
        "hostname": socket.gethostname(),
        "dsmVersion": dsm_ver,
        "diskTotalBytes": usage.total,
        "diskUsedBytes": usage.used,
        "diskFreeBytes": usage.free,
        "diskUsagePct": round((usage.used / usage.total) * 100, 1) if usage.total else 0,
        "backupFilesCount": len(files)
    }
}
print(json.dumps(payload))
')"

curl -sS -X POST \\
  --connect-timeout 15 --max-time 30 \\
  -H "Content-Type: application/json" \\
  -H "X-NAS-Token: $NAS_TOKEN" \\
  -d "$REPORT_PAYLOAD" \\
  "$SIPE_URL/api/seguridad/nas/agent/report" >/dev/null || log "ADVERTENCIA: No se pudo reportar telemetría al panel SIPE."

log "Respaldo finalizado con estado: $FINAL_STATUS ($OK_DBS/$TOTAL_DBS bases, purgados=$PURGED_COUNT)."
[ "$FINAL_STATUS" != "error" ]
`;
}

async function getSynologySetupPackage(id, publicBaseUrl) {
    const nas = await getNasByIdRaw(id);
    if (!nas) {
        const err = new Error('Servidor NAS no encontrado');
        err.status = 404;
        throw err;
    }

    let token = getEffectiveAgentToken(nas);
    if (!token) {
        const rotated = await rotateNasAgentToken(id);
        token = rotated.token;
    }

    const freshNas = await getNasByIdRaw(id);
    const script = buildSynologyPullScript(freshNas, publicBaseUrl);

    return {
        nasId: freshNas.id,
        nombre: freshNas.nombre,
        host_lan: freshNas.host_lan || '192.168.31.222',
        usuario: freshNas.usuario,
        ruta_destino: freshNas.ruta_destino,
        servidor_origen_ip: freshNas.servidor_origen_ip || '5.252.55.29',
        tokenPrefix: freshNas.agent_token_prefix,
        token,
        scriptFileName: `sipe_nas_backup_${freshNas.id}.sh`,
        script,
        steps: [
            `Ingrese a su Synology DSM en https://${freshNas.host_lan || '192.168.31.222'}:5001 con el usuario "${freshNas.usuario}".`,
            `Cree (si no existe) la carpeta compartida o subcarpeta destino "${freshNas.ruta_destino}" con permisos de lectura/escritura para "${freshNas.usuario}".`,
            'Abra Panel de control → Programador de tareas → Crear → Tareas programadas → Script definido por el usuario.',
            'En General asigne el nombre "Respaldo BD SIPE 5.252.55.29", en Programa elija ejecución diaria (ej. 02:00 AM), en Configuración de tarea pegue el script (o ejecute la ruta donde lo guardó) y pulse "Ejecutar" para validar el primer respaldo inmediato.'
        ]
    };
}

async function resolveTargetDatabasesForNas(nas) {
    const discovery = await discoverSourceDatabases();
    const availableNames = discovery.databases.map((d) => d.name);

    if (nas.respaldar_todas) {
        return availableNames;
    }

    const configured = safeJsonParse(nas.bases_datos_json, []);
    const validSelected = (Array.isArray(configured) ? configured : [])
        .filter((name) => validateSafeDatabaseName(name) && availableNames.includes(name));

    return validSelected.length > 0 ? validSelected : availableNames;
}

async function testNasConnection(id) {
    const db = dbModule.getDb();
    const nas = await getNasByIdRaw(id);
    if (!nas) {
        const err = new Error('Servidor NAS no encontrado');
        err.status = 404;
        throw err;
    }

    const start = Date.now();
    const effectiveHost = resolveEffectiveHost(nas);
    const isPrivate = isPrivateIpAddress(effectiveHost);

    try {
        if (nas.modo_conexion === 'synology_pull') {
            const discovery = await discoverSourceDatabases();
            const targetDbs = await resolveTargetDatabasesForNas(nas);
            const hasHeartbeat = Boolean(nas.ultimo_heartbeat_at);
            const heartbeatAgeHours = hasHeartbeat
                ? Math.round((Date.now() - new Date(nas.ultimo_heartbeat_at).getTime()) / 3600000)
                : null;
            const estado = hasHeartbeat && heartbeatAgeHours <= 36 ? 'online' : 'pendiente';
            const message = hasHeartbeat
                ? `Agente Pull listo. Último reporte del Synology (${nas.host_lan || 'LAN'}) hace ${heartbeatAgeHours}h. Origen ${nas.servidor_origen_ip} saludable con ${targetDbs.length} bases.`
                : `Servidor origen ${nas.servidor_origen_ip} listo (${targetDbs.length} bases detectadas). Pendiente instalar y ejecutar el Script Synology DSM en ${nas.host_lan || '192.168.31.222'} para recibir el primer reporte.`;

            await db.query(
                'UPDATE nas_servers SET estado_conexion = ?, ultimo_check_at = NOW(), ultimo_error = NULL WHERE id = ?',
                [estado, nas.id]
            );

            return {
                ok: true,
                mode: 'synology_pull',
                estado,
                latencyMs: Date.now() - start,
                message,
                details: {
                    sourceDatabases: targetDbs,
                    totalSourceSizeMb: discovery.sourceServer.totalSizeMb,
                    hasHeartbeat,
                    heartbeatAgeHours,
                    esIpPrivada: isPrivate
                }
            };
        }

        if (nas.modo_conexion === 'synology_dsm') {
            let session = null;
            try {
                session = await dsmLogin(nas);
                const files = await dsmListFiles(session, nas.ruta_destino);
                let dsmInfo = null;
                try {
                    const infoRes = await axios.get(`${session.baseUrl}/webapi/entry.cgi`, {
                        params: { api: 'SYNO.FileStation.Info', version: 2, method: 'get', _sid: session.sid },
                        timeout: 8000,
                        httpsAgent: session.httpsAgent
                    });
                    dsmInfo = infoRes.data?.data || null;
                } catch (_) { /* optional */ }

                const telemetry = {
                    ...(safeJsonParse(nas.telemetria_json, {}) || {}),
                    hostname: dsmInfo?.hostname || effectiveHost,
                    dsmVersion: dsmInfo ? 'Synology DSM FileStation OK' : 'Synology DSM',
                    backupFilesCount: files.length
                };

                await db.query(
                    `UPDATE nas_servers
                     SET estado_conexion = 'online', ultimo_check_at = NOW(), ultimo_error = NULL,
                         telemetria_json = ?, archivos_remotos_json = ?
                     WHERE id = ?`,
                    [JSON.stringify(telemetry), JSON.stringify(files.slice(0, 50)), nas.id]
                );

                return {
                    ok: true,
                    mode: 'synology_dsm',
                    estado: 'online',
                    latencyMs: Date.now() - start,
                    message: `Conexión exitosa a Synology DSM (${effectiveHost}:${nas.puerto}). Carpeta "${normalizeDsmSharePath(nas.ruta_destino)}" accesible (${files.length} respaldos encontrados).`,
                    details: { filesCount: files.length, hostname: telemetry.hostname }
                };
            } finally {
                await dsmLogout(session);
            }
        }

        if (nas.modo_conexion === 'webdav') {
            const res = await webdavRequest(nas, 'PROPFIND', '', {
                headers: { Depth: '1' },
                timeout: 12000
            });
            if (res.status === 401 || res.status === 403) {
                throw new Error(`Credenciales WebDAV rechazadas (HTTP ${res.status}). Verifique usuario "${nas.usuario}" y permisos WebDAV en Synology.`);
            }
            if (res.status === 404) {
                await ensureWebdavFolders(nas);
            } else if (res.status < 200 || res.status >= 300) {
                throw new Error(`WebDAV respondió HTTP ${res.status}`);
            }

            const files = typeof res.data === 'string' ? parseWebdavPropfindXml(res.data, normalizeDsmSharePath(nas.ruta_destino)) : [];
            await db.query(
                `UPDATE nas_servers
                 SET estado_conexion = 'online', ultimo_check_at = NOW(), ultimo_error = NULL,
                     archivos_remotos_json = ?
                 WHERE id = ?`,
                [JSON.stringify(files.slice(0, 50)), nas.id]
            );

            return {
                ok: true,
                mode: 'webdav',
                estado: 'online',
                latencyMs: Date.now() - start,
                message: `Conexión WebDAV exitosa a ${effectiveHost}:${nas.puerto} (${files.length} respaldos detectados).`,
                details: { filesCount: files.length }
            };
        }

        if (nas.modo_conexion === 'sftp') {
            const { stdout } = await runSshExec(
                nas,
                `mkdir -p '${nas.ruta_destino}' && df -B1 '${nas.ruta_destino}' | tail -n 1 && hostname`,
                15000
            );
            const lines = stdout.trim().split('\n').filter(Boolean);
            const dfCols = (lines[0] || '').trim().split(/\s+/);
            const diskTotalBytes = Number(dfCols[1] || 0);
            const diskUsedBytes = Number(dfCols[2] || 0);
            const diskFreeBytes = Number(dfCols[3] || 0);
            const hostname = lines[1] || effectiveHost;
            const telemetry = {
                hostname,
                dsmVersion: 'SSH/SFTP Conectado',
                diskTotalBytes,
                diskUsedBytes,
                diskFreeBytes,
                diskUsagePct: diskTotalBytes > 0 ? Number(((diskUsedBytes / diskTotalBytes) * 100).toFixed(1)) : 0
            };

            await db.query(
                `UPDATE nas_servers
                 SET estado_conexion = 'online', ultimo_check_at = NOW(), ultimo_error = NULL,
                     telemetria_json = ?
                 WHERE id = ?`,
                [JSON.stringify(telemetry), nas.id]
            );

            return {
                ok: true,
                mode: 'sftp',
                estado: 'online',
                latencyMs: Date.now() - start,
                message: `Conexión SSH/SFTP exitosa con ${hostname} (${effectiveHost}:${nas.puerto}). Espacio libre: ${formatBytes(diskFreeBytes)}.`,
                details: telemetry
            };
        }

        if (nas.modo_conexion === 'local_mount') {
            if (!fs.existsSync(nas.ruta_destino)) {
                fs.mkdirSync(nas.ruta_destino, { recursive: true });
            }
            fs.accessSync(nas.ruta_destino, fs.constants.R_OK | fs.constants.W_OK);
            const files = fs.readdirSync(nas.ruta_destino)
                .filter((f) => f.endsWith('.sql.gz') || f.endsWith('.sql'))
                .map((f) => {
                    const st = fs.statSync(path.join(nas.ruta_destino, f));
                    return { name: f, path: path.join(nas.ruta_destino, f), sizeBytes: st.size, modifiedAt: st.mtime.toISOString() };
                })
                .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

            await db.query(
                `UPDATE nas_servers
                 SET estado_conexion = 'online', ultimo_check_at = NOW(), ultimo_error = NULL,
                     archivos_remotos_json = ?
                 WHERE id = ?`,
                [JSON.stringify(files.slice(0, 50)), nas.id]
            );

            return {
                ok: true,
                mode: 'local_mount',
                estado: 'online',
                latencyMs: Date.now() - start,
                message: `Carpeta montada "${nas.ruta_destino}" accesible con lectura/escritura (${files.length} respaldos).`,
                details: { filesCount: files.length }
            };
        }

        throw new Error(`Modo de conexión no soportado: ${nas.modo_conexion}`);
    } catch (error) {
        let friendlyMessage = error.message;
        if (isPrivate && ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(error.code) || /timeout|ETIMEDOUT|EHOSTUNREACH/i.test(error.message)) {
            if (isPrivate) {
                friendlyMessage = `No fue posible alcanzar la IP local privada "${effectiveHost}" directamente desde el servidor VPS (${nas.servidor_origen_ip || '5.252.55.29'}). Recomendación: cambie el modo a "Agente Pull Synology" (funciona sin abrir puertos en el router) o configure una IP Tailscale/WireGuard o DDNS en el campo "Host Remoto". (${error.message})`;
            }
        }

        await db.query(
            'UPDATE nas_servers SET estado_conexion = ?, ultimo_check_at = NOW(), ultimo_error = ? WHERE id = ?',
            ['offline', friendlyMessage.slice(0, 1000), nas.id]
        ).catch(() => {});

        return {
            ok: false,
            mode: nas.modo_conexion,
            estado: 'offline',
            latencyMs: Date.now() - start,
            message: friendlyMessage
        };
    }
}

async function listNasRemoteFiles(id) {
    const db = dbModule.getDb();
    const nas = await getNasByIdRaw(id);
    if (!nas) {
        const err = new Error('Servidor NAS no encontrado');
        err.status = 404;
        throw err;
    }

    if (nas.modo_conexion === 'synology_pull') {
        return {
            source: 'agent_inventory',
            updatedAt: nas.ultimo_heartbeat_at || nas.ultimo_backup_at,
            files: safeJsonParse(nas.archivos_remotos_json, [])
        };
    }

    let files = [];
    if (nas.modo_conexion === 'synology_dsm') {
        let session = null;
        try {
            session = await dsmLogin(nas);
            files = await dsmListFiles(session, nas.ruta_destino);
        } finally {
            await dsmLogout(session);
        }
    } else if (nas.modo_conexion === 'webdav') {
        const res = await webdavRequest(nas, 'PROPFIND', '', { headers: { Depth: '1' } });
        if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') {
            files = parseWebdavPropfindXml(res.data, normalizeDsmSharePath(nas.ruta_destino));
        }
    } else if (nas.modo_conexion === 'sftp') {
        const { stdout } = await runSshExec(
            nas,
            `ls -l --time-style=+%Y-%m-%dT%H:%M:%SZ '${nas.ruta_destino}' 2>/dev/null | grep -E '\\.sql(\\.gz)?$' || true`
        );
        files = stdout.split('\n').filter(Boolean).map((line) => {
            const parts = line.trim().split(/\s+/);
            const sizeBytes = Number(parts[4] || 0);
            const modifiedAt = parts[5] || null;
            const name = parts.slice(6).join(' ');
            return { name, path: `${nas.ruta_destino.replace(/\/$/, '')}/${name}`, sizeBytes, modifiedAt };
        }).filter((f) => f.name);
    } else if (nas.modo_conexion === 'local_mount') {
        if (fs.existsSync(nas.ruta_destino)) {
            files = fs.readdirSync(nas.ruta_destino)
                .filter((f) => f.endsWith('.sql.gz') || f.endsWith('.sql'))
                .map((f) => {
                    const full = path.join(nas.ruta_destino, f);
                    const st = fs.statSync(full);
                    return { name: f, path: full, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() };
                })
                .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
        }
    }

    await db.query('UPDATE nas_servers SET archivos_remotos_json = ? WHERE id = ?', [
        JSON.stringify(files.slice(0, 60)),
        nas.id
    ]).catch(() => {});

    return {
        source: 'live',
        updatedAt: new Date().toISOString(),
        files
    };
}

function emitNasUpdate(payload) {
    if (!globalIo) return;
    try {
        globalIo.emit('nas_backup_updated', {
            timestamp: new Date().toISOString(),
            ...payload
        });
    } catch (_) {
        // non-fatal
    }
}

async function runBackupToNas(id, { tipoEjecucion = 'manual', actor = 'Sistema' } = {}) {
    const db = dbModule.getDb();
    const nasId = Number(id);
    const nas = await getNasByIdRaw(nasId);
    if (!nas) {
        const err = new Error('Servidor NAS no encontrado');
        err.status = 404;
        throw err;
    }

    if (activeBackupJobs.has(nasId)) {
        const err = new Error(`Ya existe un respaldo en ejecución para "${nas.nombre}". Espere a que finalice.`);
        err.status = 409;
        throw err;
    }

    activeBackupJobs.add(nasId);
    const startMs = Date.now();
    const targetDatabases = await resolveTargetDatabasesForNas(nas);

    const [insertRes] = await db.query(
        `INSERT INTO nas_backup_logs (
            nas_id, tipo_ejecucion, modo_conexion, servidor_origen, estado,
            bases_objetivo_json, total_bases, iniciado_por, iniciado_at
        ) VALUES (?, ?, ?, ?, 'en_progreso', ?, ?, ?, NOW())`,
        [
            nasId,
            tipoEjecucion,
            nas.modo_conexion,
            nas.servidor_origen_ip || '5.252.55.29',
            JSON.stringify(targetDatabases),
            targetDatabases.length,
            actor
        ]
    );
    const logId = insertRes.insertId;

    const generatedFiles = [];
    let basesExitosas = 0;
    let tamanoTotalBytes = 0;
    let archivosPurgados = 0;
    const errors = [];
    let dsmSession = null;

    try {
        if (targetDatabases.length === 0) {
            throw new Error('No se encontraron bases de datos seleccionadas o disponibles en el servidor origen.');
        }

        // En Modo Pull ejecutado manualmente desde el panel, realizamos verificación íntegra de volcados
        // para garantizar que 5.252.55.29 genera los .sql.gz sin errores antes de que Synology los descargue.
        const isPullVerification = nas.modo_conexion === 'synology_pull';

        if (nas.modo_conexion === 'synology_dsm') {
            dsmSession = await dsmLogin(nas);
        } else if (nas.modo_conexion === 'webdav') {
            await ensureWebdavFolders(nas);
        } else if (nas.modo_conexion === 'sftp') {
            await runSshExec(nas, `mkdir -p '${nas.ruta_destino}'`);
        } else if (nas.modo_conexion === 'local_mount') {
            fs.mkdirSync(nas.ruta_destino, { recursive: true });
        }

        for (const dbName of targetDatabases) {
            let dumpInfo = null;
            try {
                dumpInfo = await dumpDatabaseToTempGzip(dbName);
                let remotePath = `${nas.ruta_destino.replace(/\/$/, '')}/${dumpInfo.fileName}`;

                if (nas.modo_conexion === 'synology_dsm') {
                    const up = await dsmUploadFileStream(dsmSession, nas.ruta_destino, dumpInfo.localPath, dumpInfo.fileName);
                    remotePath = up.remotePath;
                } else if (nas.modo_conexion === 'webdav') {
                    const stat = fs.statSync(dumpInfo.localPath);
                    const upRes = await webdavRequest(nas, 'PUT', dumpInfo.fileName, {
                        data: fs.createReadStream(dumpInfo.localPath),
                        headers: {
                            'Content-Type': 'application/gzip',
                            'Content-Length': stat.size
                        },
                        timeout: 300000
                    });
                    if (upRes.status < 200 || upRes.status >= 300) {
                        throw new Error(`WebDAV PUT falló con HTTP ${upRes.status}`);
                    }
                } else if (nas.modo_conexion === 'sftp') {
                    await runScpUpload(nas, dumpInfo.localPath, remotePath);
                } else if (nas.modo_conexion === 'local_mount') {
                    fs.copyFileSync(dumpInfo.localPath, remotePath);
                } else if (isPullVerification) {
                    remotePath = `verificado_para_pull://${dumpInfo.fileName}`;
                }

                basesExitosas += 1;
                tamanoTotalBytes += dumpInfo.sizeBytes;
                generatedFiles.push({
                    database: dbName,
                    fileName: dumpInfo.fileName,
                    remotePath,
                    sizeBytes: dumpInfo.sizeBytes,
                    sha256: dumpInfo.sha256,
                    engine: dumpInfo.engine,
                    durationMs: dumpInfo.durationMs,
                    status: 'ok'
                });
            } catch (dbErr) {
                errors.push(`${dbName}: ${dbErr.message}`);
                generatedFiles.push({
                    database: dbName,
                    fileName: dumpInfo?.fileName || `${dbName}.sql.gz`,
                    sizeBytes: dumpInfo?.sizeBytes || 0,
                    sha256: dumpInfo?.sha256 || '',
                    durationMs: dumpInfo?.durationMs || 0,
                    status: 'error',
                    error: dbErr.message
                });
            } finally {
                if (dumpInfo?.localPath) {
                    try { fs.unlinkSync(dumpInfo.localPath); } catch (_) { /* ignore */ }
                }
            }
        }

        // Aplicar retención en modos Push
        const retentionDays = Number(nas.retencion_dias || 30);
        const cutoffMs = Date.now() - retentionDays * 86400 * 1000;
        let updatedRemoteFiles = null;

        try {
            if (nas.modo_conexion === 'synology_dsm' && dsmSession) {
                const remoteFiles = await dsmListFiles(dsmSession, nas.ruta_destino);
                const toDelete = remoteFiles
                    .filter((f) => f.modifiedAt && new Date(f.modifiedAt).getTime() < cutoffMs)
                    .map((f) => f.path);
                archivosPurgados = await dsmDeleteFiles(dsmSession, toDelete);
                updatedRemoteFiles = remoteFiles.filter((f) => !toDelete.includes(f.path));
            } else if (nas.modo_conexion === 'webdav') {
                const listRes = await webdavRequest(nas, 'PROPFIND', '', { headers: { Depth: '1' } });
                if (listRes.status >= 200 && listRes.status < 300 && typeof listRes.data === 'string') {
                    const remoteFiles = parseWebdavPropfindXml(listRes.data, normalizeDsmSharePath(nas.ruta_destino));
                    for (const rf of remoteFiles) {
                        if (rf.modifiedAt && new Date(rf.modifiedAt).getTime() < cutoffMs) {
                            const delRes = await webdavRequest(nas, 'DELETE', rf.name);
                            if (delRes.status >= 200 && delRes.status < 300) archivosPurgados += 1;
                        }
                    }
                    updatedRemoteFiles = remoteFiles;
                }
            } else if (nas.modo_conexion === 'sftp') {
                const { stdout } = await runSshExec(
                    nas,
                    `find '${nas.ruta_destino}' -maxdepth 1 -type f -name '*.sql.gz' -mtime +${retentionDays} -print -delete | wc -l`
                );
                archivosPurgados = parseInt(stdout.trim(), 10) || 0;
            } else if (nas.modo_conexion === 'local_mount' && fs.existsSync(nas.ruta_destino)) {
                const entries = fs.readdirSync(nas.ruta_destino).filter((f) => f.endsWith('.sql.gz') || f.endsWith('.sql'));
                const remaining = [];
                for (const file of entries) {
                    const full = path.join(nas.ruta_destino, file);
                    const st = fs.statSync(full);
                    if (st.mtimeMs < cutoffMs) {
                        fs.unlinkSync(full);
                        archivosPurgados += 1;
                    } else {
                        remaining.push({ name: file, path: full, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() });
                    }
                }
                updatedRemoteFiles = remaining.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
            }
        } catch (retErr) {
            console.warn(`[NAS Backup] Aviso en retención NAS #${nasId}:`, retErr.message);
        }

        const estado = basesExitosas === 0
            ? 'error'
            : (basesExitosas < targetDatabases.length ? 'parcial' : 'completado');
        const duracionMs = Date.now() - startMs;
        const mensaje = isPullVerification
            ? `Verificación de volcado en 5.252.55.29 (${basesExitosas}/${targetDatabases.length} bases, ${formatBytes(tamanoTotalBytes)}). Listo para descarga por el Agente Synology.`
            : `Respaldo ${estado} en "${nas.nombre}": ${basesExitosas}/${targetDatabases.length} bases (${formatBytes(tamanoTotalBytes)})${archivosPurgados > 0 ? ` · ${archivosPurgados} antiguos depurados` : ''}.`;

        await db.query(
            `UPDATE nas_backup_logs
             SET estado = ?, archivos_generados_json = ?, bases_exitosas = ?,
                 tamano_total_bytes = ?, duracion_ms = ?, archivos_purgados = ?,
                 mensaje = ?, error_detalle = ?, finalizado_at = NOW()
             WHERE id = ?`,
            [
                estado,
                JSON.stringify(generatedFiles),
                basesExitosas,
                tamanoTotalBytes,
                duracionMs,
                archivosPurgados,
                mensaje,
                errors.length > 0 ? errors.join(' | ').slice(0, 2000) : null,
                logId
            ]
        );

        const nextConnState = isPullVerification
            ? (nas.ultimo_heartbeat_at ? 'online' : 'pendiente')
            : (estado === 'error' ? 'offline' : 'online');

        if (updatedRemoteFiles) {
            await db.query(
                `UPDATE nas_servers
                 SET estado_conexion = ?, ultimo_backup_at = NOW(), ultimo_backup_estado = ?,
                     ultimo_error = ?, archivos_remotos_json = ?
                 WHERE id = ?`,
                [nextConnState, estado, errors.length > 0 ? errors.join(' | ').slice(0, 1000) : null, JSON.stringify(updatedRemoteFiles.slice(0, 60)), nasId]
            );
        } else {
            await db.query(
                `UPDATE nas_servers
                 SET estado_conexion = ?, ultimo_backup_at = NOW(), ultimo_backup_estado = ?, ultimo_error = ?
                 WHERE id = ?`,
                [nextConnState, estado, errors.length > 0 ? errors.join(' | ').slice(0, 1000) : null, nasId]
            );
        }

        emitNasUpdate({ nasId, logId, estado, mensaje });

        return {
            ok: estado !== 'error',
            logId,
            nasId,
            estado,
            mensaje,
            totalBases: targetDatabases.length,
            basesExitosas,
            tamanoTotalBytes,
            duracionMs,
            archivosPurgados,
            files: generatedFiles
        };
    } catch (fatalErr) {
        const duracionMs = Date.now() - startMs;
        await db.query(
            `UPDATE nas_backup_logs
             SET estado = 'error', archivos_generados_json = ?, bases_exitosas = ?,
                 tamano_total_bytes = ?, duracion_ms = ?, mensaje = ?, error_detalle = ?, finalizado_at = NOW()
             WHERE id = ?`,
            [
                JSON.stringify(generatedFiles),
                basesExitosas,
                tamanoTotalBytes,
                duracionMs,
                `Fallo al respaldar hacia ${nas.nombre}`,
                fatalErr.message.slice(0, 2000),
                logId
            ]
        ).catch(() => {});

        await db.query(
            `UPDATE nas_servers
             SET estado_conexion = 'offline', ultimo_backup_estado = 'error', ultimo_error = ?
             WHERE id = ?`,
            [fatalErr.message.slice(0, 1000), nasId]
        ).catch(() => {});

        emitNasUpdate({ nasId, logId, estado: 'error', mensaje: fatalErr.message });
        throw fatalErr;
    } finally {
        await dsmLogout(dsmSession);
        activeBackupJobs.delete(nasId);
    }
}

// ── Synology Pull Agent Authentication & Reporting ───────────────────────────

async function authenticateNasAgentToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 16) {
        return null;
    }
    const db = dbModule.getDb();
    const tokenHash = hashSecret(rawToken.trim());
    const [rows] = await db.query(
        'SELECT * FROM nas_servers WHERE activo = 1 AND agent_token_hash = ? LIMIT 1',
        [tokenHash]
    );
    const nas = rows?.[0];
    if (!nas || !timingSafeEqualHex(nas.agent_token_hash, tokenHash)) {
        return null;
    }
    return nas;
}

async function recordAgentReport(nas, payload = {}) {
    const db = dbModule.getDb();
    const status = ['completado', 'parcial', 'error'].includes(payload.status) ? payload.status : 'completado';
    const files = Array.isArray(payload.files) ? payload.files : [];
    const remoteFiles = Array.isArray(payload.remoteFiles) ? payload.remoteFiles.slice(0, 60) : null;
    const telemetry = payload.telemetry && typeof payload.telemetry === 'object' ? payload.telemetry : null;
    const totalBases = Number(payload.totalBases || files.length || 0);
    const basesExitosas = Number(payload.basesExitosas ?? files.filter((f) => f.status === 'ok').length);
    const tamanoTotalBytes = Number(payload.tamanoTotalBytes || files.reduce((acc, f) => acc + Number(f.sizeBytes || 0), 0));
    const duracionMs = Number(payload.duracionMs || 0);
    const archivosPurgados = Number(payload.archivosPurgados || 0);
    const errorDetalle = payload.errorDetalle ? String(payload.errorDetalle).slice(0, 2000) : null;

    const mensaje = status === 'error'
        ? `Agente Synology reportó error (${basesExitosas}/${totalBases} bases).`
        : `Respaldo Pull completado en Synology (${basesExitosas}/${totalBases} bases, ${formatBytes(tamanoTotalBytes)})${archivosPurgados > 0 ? ` · ${archivosPurgados} antiguos depurados` : ''}.`;

    const [insertRes] = await db.query(
        `INSERT INTO nas_backup_logs (
            nas_id, tipo_ejecucion, modo_conexion, servidor_origen, estado,
            bases_objetivo_json, archivos_generados_json, total_bases, bases_exitosas,
            tamano_total_bytes, duracion_ms, archivos_purgados, mensaje, error_detalle,
            iniciado_por, iniciado_at, finalizado_at
        ) VALUES (?, 'agente_pull', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
            nas.id,
            nas.modo_conexion,
            nas.servidor_origen_ip || '5.252.55.29',
            status,
            JSON.stringify(files.map((f) => f.database).filter(Boolean)),
            JSON.stringify(files),
            totalBases,
            basesExitosas,
            tamanoTotalBytes,
            duracionMs,
            archivosPurgados,
            mensaje,
            errorDetalle,
            `Synology:${nas.usuario}`
        ]
    );

    const nextState = status === 'error' ? 'warning' : 'online';
    await db.query(
        `UPDATE nas_servers
         SET estado_conexion = ?,
             ultimo_heartbeat_at = NOW(),
             ultimo_check_at = NOW(),
             ultimo_backup_at = NOW(),
             ultimo_backup_estado = ?,
             ultimo_error = ?,
             telemetria_json = COALESCE(?, telemetria_json),
             archivos_remotos_json = COALESCE(?, archivos_remotos_json)
         WHERE id = ?`,
        [
            nextState,
            status,
            errorDetalle,
            telemetry ? JSON.stringify(telemetry) : null,
            remoteFiles ? JSON.stringify(remoteFiles) : null,
            nas.id
        ]
    );

    emitNasUpdate({
        nasId: nas.id,
        logId: insertRes.insertId,
        estado: status,
        mensaje,
        source: 'agente_pull'
    });

    return {
        ok: true,
        logId: insertRes.insertId,
        status,
        mensaje
    };
}

async function recordAgentHeartbeat(nas, payload = {}) {
    const db = dbModule.getDb();
    const telemetry = payload.telemetry && typeof payload.telemetry === 'object' ? payload.telemetry : null;
    const remoteFiles = Array.isArray(payload.remoteFiles) ? payload.remoteFiles.slice(0, 60) : null;

    await db.query(
        `UPDATE nas_servers
         SET estado_conexion = 'online',
             ultimo_heartbeat_at = NOW(),
             ultimo_check_at = NOW(),
             telemetria_json = COALESCE(?, telemetria_json),
             archivos_remotos_json = COALESCE(?, archivos_remotos_json)
         WHERE id = ?`,
        [
            telemetry ? JSON.stringify(telemetry) : null,
            remoteFiles ? JSON.stringify(remoteFiles) : null,
            nas.id
        ]
    );

    emitNasUpdate({ nasId: nas.id, estado: 'online', source: 'heartbeat' });
    return { ok: true, serverTime: new Date().toISOString() };
}

async function listBackupLogs({ nasId = null, estado = null, limit = 50 } = {}) {
    const db = dbModule.getDb();
    const clauses = [];
    const params = [];

    if (nasId) {
        clauses.push('l.nas_id = ?');
        params.push(Number(nasId));
    }
    if (estado && estado !== 'todos') {
        clauses.push('l.estado = ?');
        params.push(String(estado));
    }

    const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await db.query(
        `SELECT l.*, s.nombre AS nas_nombre, s.host_lan AS nas_host_lan
         FROM nas_backup_logs l
         JOIN nas_servers s ON s.id = l.nas_id
         ${whereSql}
         ORDER BY l.iniciado_at DESC
         LIMIT ?`,
        [...params, safeLimit]
    );

    return rows.map((row) => ({
        ...row,
        bases_objetivo: safeJsonParse(row.bases_objetivo_json, []),
        archivos_generados: safeJsonParse(row.archivos_generados_json, [])
    }));
}

// ── Cron Scheduler Lifecycle ─────────────────────────────────────────────────

function stopNasBackupSchedulers() {
    for (const task of scheduledTasks.values()) {
        try { task.stop(); } catch (_) { /* ignore */ }
    }
    scheduledTasks.clear();
}

async function reloadNasBackupSchedulers() {
    stopNasBackupSchedulers();

    if (process.env.NODE_ENV === 'test') return 0;
    if (process.env.NODE_APP_INSTANCE !== undefined && process.env.NODE_APP_INSTANCE !== '0') {
        return 0;
    }

    const db = dbModule.getDbIfReady();
    if (!db) return 0;

    try {
        const [rows] = await db.query(
            `SELECT id, nombre, modo_conexion, cron_expresion
             FROM nas_servers
             WHERE activo = 1 AND programacion_activa = 1 AND modo_conexion <> 'synology_pull'`
        );

        for (const row of rows) {
            if (!row.cron_expresion || !cron.validate(row.cron_expresion)) continue;
            const task = cron.schedule(
                row.cron_expresion,
                async () => {
                    try {
                        console.log(`[NAS Scheduler] Ejecutando respaldo programado para NAS #${row.id} (${row.nombre})...`);
                        await runBackupToNas(row.id, { tipoEjecucion: 'programado', actor: 'Cron NAS' });
                    } catch (err) {
                        console.error(`[NAS Scheduler] Error en respaldo NAS #${row.id}:`, err.message);
                    }
                },
                { timezone: NAS_TIMEZONE }
            );
            scheduledTasks.set(Number(row.id), task);
        }

        if (scheduledTasks.size > 0) {
            console.log(`[NAS Scheduler] ${scheduledTasks.size} programación(es) Push NAS activas (${NAS_TIMEZONE}).`);
        }
        return scheduledTasks.size;
    } catch (err) {
        console.warn('[NAS Scheduler] No se pudieron cargar programaciones:', err.message);
        return 0;
    }
}

function initNasBackupScheduler(io = null) {
    if (io) globalIo = io;
    reloadNasBackupSchedulers().catch(() => {});
}

// ── Executive US Letter PDF Report Generator (ReportPreviewModal) ────────────

async function generateNasAuditPdfBuffer() {
    const overview = await getOverview();
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'LETTER',
            margin: 42,
            info: {
                Title: 'Reporte de Auditoría - Panel de Control NAS & Backups BD',
                Author: 'SIPE Admin · Seguridad'
            }
        });

        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const nowLabel = new Date().toLocaleString('es-SV', {
            timeZone: NAS_TIMEZONE,
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        // Header banner
        doc.rect(42, 42, 528, 56).fill('#0f172a');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
            .text('SIPE ADMIN · SEGURIDAD — CONTROL DE RESPALDOS NAS', 56, 54);
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
            .text(`Servidor Origen: ${overview.sourceServer.ip} (${overview.sourceServer.mysqlVersion})  |  Generado: ${nowLabel}`, 56, 75);

        let y = 114;

        // KPI Summary Row
        const onlineCount = overview.servers.filter((s) => s.estado_conexion === 'online').length;
        const kpis = [
            { label: 'SERVIDORES NAS', value: `${onlineCount}/${overview.servers.length} en línea` },
            { label: 'BASES EN 5.252.55.29', value: `${overview.databases.length} bases (${overview.sourceServer.totalSizeMb} MB)` },
            { label: 'EJECUCIONES RECIENTES', value: `${overview.recentLogs.length} registros` }
        ];
        const cardW = 168;
        kpis.forEach((k, idx) => {
            const x = 42 + idx * (cardW + 12);
            doc.roundedRect(x, y, cardW, 44, 4).fillAndStroke('#f8fafc', '#cbd5e1');
            doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text(k.label, x + 10, y + 8, { width: cardW - 20 });
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(k.value, x + 10, y + 22, { width: cardW - 20 });
        });

        y += 60;

        // Section 1: NAS Servers
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('1. Servidores NAS Registrados', 42, y);
        y += 18;

        doc.rect(42, y, 528, 18).fill('#e2e8f0');
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8);
        doc.text('NAS / DESTINO', 48, y + 5, { width: 155 });
        doc.text('IP / HOST', 206, y + 5, { width: 92 });
        doc.text('MODO / USUARIO', 300, y + 5, { width: 105 });
        doc.text('RETENCIÓN', 408, y + 5, { width: 65 });
        doc.text('ESTADO', 478, y + 5, { width: 85 });
        y += 20;

        if (overview.servers.length === 0) {
            doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('No hay servidores NAS registrados.', 48, y + 4);
            y += 22;
        } else {
            for (const s of overview.servers) {
                if (y > 690) { doc.addPage(); y = 48; }
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5)
                    .text(s.nombre, 48, y, { width: 155 });
                doc.fillColor('#475569').font('Helvetica').fontSize(7.5)
                    .text(s.ruta_destino, 48, y + 10, { width: 155 });
                doc.fillColor('#0f172a').font('Helvetica').fontSize(8)
                    .text(s.host_remoto || s.host_lan || '-', 206, y + 2, { width: 92 });
                doc.text(`${s.modo_conexion} (${s.usuario})`, 300, y + 2, { width: 105 });
                doc.text(`${s.retencion_dias} días`, 408, y + 2, { width: 65 });
                doc.fillColor(s.estado_conexion === 'online' ? '#15803d' : s.estado_conexion === 'offline' ? '#b91c1c' : '#b45309')
                    .font('Helvetica-Bold').fontSize(8)
                    .text(String(s.estado_conexion || 'pendiente').toUpperCase(), 478, y + 2, { width: 85 });
                y += 26;
                doc.moveTo(42, y - 3).lineTo(570, y - 3).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            }
        }

        y += 12;

        // Section 2: Source Databases
        if (y > 650) { doc.addPage(); y = 48; }
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11)
            .text(`2. Bases de Datos en Servidor Origen (${overview.sourceServer.ip})`, 42, y);
        y += 18;

        doc.rect(42, y, 528, 18).fill('#e2e8f0');
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8);
        doc.text('BASE DE DATOS', 48, y + 5, { width: 190 });
        doc.text('TABLAS', 245, y + 5, { width: 60 });
        doc.text('TAMAÑO', 310, y + 5, { width: 80 });
        doc.text('ÚLTIMO RESPALDO', 398, y + 5, { width: 165 });
        y += 20;

        for (const dbItem of overview.databases.slice(0, 20)) {
            if (y > 700) { doc.addPage(); y = 48; }
            doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text(dbItem.name, 48, y, { width: 190 });
            doc.fillColor('#334155').font('Helvetica').fontSize(8).text(String(dbItem.tablesCount), 245, y, { width: 60 });
            doc.text(`${dbItem.sizeMb} MB`, 310, y, { width: 80 });
            doc.text(dbItem.lastBackupAt ? new Date(dbItem.lastBackupAt).toLocaleString('es-SV') : 'Pendiente', 398, y, { width: 165 });
            y += 17;
            doc.moveTo(42, y - 2).lineTo(570, y - 2).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
        }

        y += 14;

        // Section 3: Recent Backup History
        if (y > 640) { doc.addPage(); y = 48; }
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('3. Historial Reciente de Ejecuciones de Respaldo', 42, y);
        y += 18;

        doc.rect(42, y, 528, 18).fill('#e2e8f0');
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8);
        doc.text('FECHA', 48, y + 5, { width: 108 });
        doc.text('NAS', 158, y + 5, { width: 130 });
        doc.text('BASES', 292, y + 5, { width: 52 });
        doc.text('TAMAÑO', 348, y + 5, { width: 68 });
        doc.text('TIPO', 420, y + 5, { width: 72 });
        doc.text('ESTADO', 495, y + 5, { width: 72 });
        y += 20;

        if (overview.recentLogs.length === 0) {
            doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('Aún no se registran ejecuciones de respaldo.', 48, y + 4);
        } else {
            for (const log of overview.recentLogs.slice(0, 15)) {
                if (y > 710) { doc.addPage(); y = 48; }
                doc.fillColor('#334155').font('Helvetica').fontSize(7.8)
                    .text(log.iniciado_at ? new Date(log.iniciado_at).toLocaleString('es-SV') : '-', 48, y, { width: 108 });
                doc.text(log.nas_nombre || `#${log.nas_id}`, 158, y, { width: 130 });
                doc.text(`${log.bases_exitosas}/${log.total_bases}`, 292, y, { width: 52 });
                doc.text(formatBytes(log.tamano_total_bytes), 348, y, { width: 68 });
                doc.text(log.tipo_ejecucion || 'manual', 420, y, { width: 72 });
                doc.fillColor(log.estado === 'completado' ? '#15803d' : log.estado === 'error' ? '#b91c1c' : '#b45309')
                    .font('Helvetica-Bold')
                    .text(String(log.estado || '').toUpperCase(), 495, y, { width: 72 });
                y += 17;
                doc.moveTo(42, y - 2).lineTo(570, y - 2).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
            }
        }

        doc.end();
    });
}

module.exports = {
    NAS_TIMEZONE,
    SCHEDULE_PRESETS,
    isPrivateIpAddress,
    validateSafeDatabaseName,
    validateSafeRemotePath,
    validateSafeHost,
    validateSafeUsername,
    normalizeDsmSharePath,
    resolveEffectiveHost,
    resolveDefaultPort,
    formatBytes,
    parseWebdavPropfindXml,
    sanitizeNasServerForClient,
    validateAndNormalizeNasPayload,
    discoverSourceDatabases,
    dumpDatabaseToTempGzip,
    getNasByIdRaw,
    listNasServers,
    getOverview,
    createNasServer,
    updateNasServer,
    deleteNasServer,
    rotateNasAgentToken,
    buildSynologyPullScript,
    getSynologySetupPackage,
    resolveTargetDatabasesForNas,
    testNasConnection,
    listNasRemoteFiles,
    runBackupToNas,
    authenticateNasAgentToken,
    recordAgentReport,
    recordAgentHeartbeat,
    listBackupLogs,
    initNasBackupScheduler,
    reloadNasBackupSchedulers,
    stopNasBackupSchedulers,
    generateNasAuditPdfBuffer
};
