'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

const dbModule = require('../../db');
const { JWT_SECRET, invalidateUserAuthCache, restoreUser } = require('../../middleware/auth');
const { createUnifiedMockDb } = require('./mockDb.helper');
const {
    createSocketIoSpy,
    createTelegramAxiosSpy,
    createGeminiSdkSpy
} = require('./mockExternalApis.helper');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads');

/**
 * Extracts the active `largePayloadPrefixes` whitelist from `backend/server.js`
 * without executing `server.js` (which invokes `initDB()` at module load time).
 */
function readServerLargePayloadPrefixes() {
    const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.js'), 'utf8');
    const match = serverSrc.match(/const\s+largePayloadPrefixes\s*=\s*\[([\s\S]*?)\];/);
    if (!match) return [];
    const items = [];
    const strRe = /['"]([^'"]+)['"]/g;
    let m;
    while ((m = strRe.exec(match[1])) !== null) {
        items.push(m[1]);
    }
    return items;
}

function readServerSource() {
    return fs.readFileSync(path.join(BACKEND_ROOT, 'server.js'), 'utf8');
}

function createE2eHarness() {
    const mockDb = createUnifiedMockDb();
    const socketSpy = createSocketIoSpy();
    const telegramSpy = createTelegramAxiosSpy();
    const geminiSpy = createGeminiSdkSpy();

    let server = null;
    let baseUrl = '';
    const trackedUploadFiles = new Set();

    let origGetDb;
    let origGetDbIfReady;
    let origGetExternalDb;
    let origGetAccountingDb;
    let origWithTransaction;
    let origWithRetry;
    let origWriteFileSync;
    let origWriteFile;
    let origPromisesWriteFile;

    let clearQueryCacheFn = null;
    let invalidateBotTokenCacheFn = null;

    const trackIfUploadPath = (targetPath) => {
        try {
            if (!targetPath || typeof targetPath !== 'string') return;
            const resolved = path.resolve(targetPath);
            const uploadsRoot = path.resolve(UPLOADS_DIR) + path.sep;
            if (resolved.startsWith(uploadsRoot)) {
                trackedUploadFiles.add(resolved);
            }
        } catch (_) {
            // ignore non-path buffers/urls
        }
    };

    const collectMockDbUploadUrls = () => {
        const st = mockDb.getState();
        const urls = [];
        for (const c of (st.recordatorios_pagos_comprobantes || [])) {
            if (c?.archivo_url) urls.push(c.archivo_url);
        }
        for (const a of (st.task_attachments || [])) {
            if (a?.archivo_url) urls.push(a.archivo_url);
        }
        for (const m of (st.movimientos_bancarios_comprobantes || [])) {
            if (m?.archivo_url) urls.push(m.archivo_url);
        }
        for (const m of (st.movimientos_bancarios || [])) {
            if (m?.comprobante_url) urls.push(m.comprobante_url);
        }
        for (const url of urls) {
            const clean = String(url).split('?')[0];
            if (clean.startsWith('/api/uploads/')) {
                const rel = clean.slice('/api/uploads/'.length);
                trackedUploadFiles.add(path.resolve(UPLOADS_DIR, rel));
            }
        }
    };

    const cleanupTrackedUploads = () => {
        collectMockDbUploadUrls();
        for (const fullPath of trackedUploadFiles) {
            try {
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            } catch (_) {
                // ignore cleanup race
            }
        }
        trackedUploadFiles.clear();
        for (const sub of ['pagos', 'tareas', 'bancos', 'movimientos']) {
            const dir = path.join(UPLOADS_DIR, sub);
            try {
                if (!fs.existsSync(dir)) continue;
                for (const name of fs.readdirSync(dir)) {
                    if (name.startsWith(`${process.pid}_`)) {
                        const p = path.join(dir, name);
                        if (fs.existsSync(p)) fs.unlinkSync(p);
                    }
                }
            } catch (_) {
                // ignore cleanup race
            }
        }
    };

    const makeToken = (userId = 1) => {
        const u = mockDb.getState().users.find((x) => Number(x.id) === Number(userId));
        if (!u) {
            return jwt.sign({ id: userId, username: `user_${userId}`, role_id: 6, role: 'Colaborador', status: 'active' }, JWT_SECRET, { expiresIn: '1h' });
        }
        return jwt.sign(
            { id: u.id, username: u.username, nombre: u.nombre, role_id: u.role_id, role: u.role_name, status: u.status, tv: u.token_version || 1 },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
    };

    const start = async () => {
        origGetDb = dbModule.getDb;
        origGetDbIfReady = dbModule.getDbIfReady;
        origGetExternalDb = dbModule.getExternalDb;
        origGetAccountingDb = dbModule.getAccountingDb;
        origWithTransaction = dbModule.withTransaction;
        origWithRetry = dbModule.withRetry;
        origWriteFileSync = fs.writeFileSync;
        origWriteFile = fs.writeFile;
        origPromisesWriteFile = fs.promises.writeFile;

        fs.writeFileSync = function trackedWriteFileSync(filePath, data, options) {
            trackIfUploadPath(filePath);
            return origWriteFileSync.call(fs, filePath, data, options);
        };
        fs.writeFile = function trackedWriteFile(filePath, data, options, cb) {
            trackIfUploadPath(filePath);
            return origWriteFile.call(fs, filePath, data, options, cb);
        };
        fs.promises.writeFile = async function trackedPromisesWriteFile(filePath, data, options) {
            trackIfUploadPath(filePath);
            return origPromisesWriteFile.call(fs.promises, filePath, data, options);
        };

        dbModule.getDb = () => mockDb.pool;
        dbModule.getDbIfReady = () => mockDb.pool;
        dbModule.getExternalDb = async () => mockDb.externalPool;
        dbModule.getAccountingDb = async () => mockDb.accountingPool;
        dbModule.withRetry = async (fn) => fn();
        dbModule.withTransaction = async (cb) => {
            const conn = await mockDb.pool.getConnection();
            try {
                await conn.beginTransaction();
                const res = await cb(conn);
                await conn.commit();
                return res;
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }
        };

        telegramSpy.install();
        geminiSpy.install();

        const modulesToReset = [
            '../../middleware/bitacora',
            '../../utils/uploadSigner',
            '../../services/bancosIntegrityService',
            '../../services/recordatoriosPagosService',
            '../../services/telegramTransportService',
            '../../services/telegramGeminiService',
            '../../services/telegramDataService',
            '../../services/cashflowForecast',
            '../../services/telegramSentinelService',
            '../../services/mibotNotifierService',
            '../../routes/conciliacion',
            '../../routes/bancos',
            '../../routes/cheques',
            '../../routes/checkDesigner',
            '../../routes/operaciones',
            '../../routes/consultas',
            '../../routes/config',
            '../../routes/bitacora',
            '../../routes/notifications',
            '../../routes/tasks',
            '../../routes/telegram'
        ];
        for (const rel of modulesToReset) {
            try {
                delete require.cache[require.resolve(rel)];
            } catch (_) {
                // optional module
            }
        }

        const { autoLogMiddleware } = require('../../middleware/bitacora');
        const { guardProtectedUploadsMiddleware } = require('../../utils/uploadSigner');
        const { clearQueryCache } = require('../../services/telegramDataService');
        const { invalidateBotTokenCache } = require('../../services/telegramTransportService');
        clearQueryCacheFn = clearQueryCache;
        invalidateBotTokenCacheFn = invalidateBotTokenCache;

        const app = express();
        const jsonDefault = express.json({ limit: '1mb' });
        const jsonLarge = express.json({ limit: '20mb' });
        const prefixes = readServerLargePayloadPrefixes();

        app.use((req, res, next) => {
            const url = req.originalUrl || req.url || '';
            if (prefixes.some((p) => url.startsWith(p))) {
                return jsonLarge(req, res, next);
            }
            return jsonDefault(req, res, next);
        });

        app.use((req, _res, next) => {
            req.io = socketSpy.io;
            next();
        });
        app.set('io', socketSpy.io);

        app.use(autoLogMiddleware());

        app.use('/api/notifications', require('../../routes/notifications'));
        app.use('/api/tasks', require('../../routes/tasks'));
        app.use('/api/bancos/conciliacion', require('../../routes/conciliacion'));
        app.use('/api/bancos', require('../../routes/bancos'));
        app.use('/api/cheques', require('../../routes/cheques'));
        app.use('/api/check-designer', require('../../routes/checkDesigner'));
        app.use('/api/telegram', require('../../routes/telegram'));
        app.use('/api', require('../../routes/operaciones'));
        app.use('/api', require('../../routes/consultas'));
        app.use('/api', require('../../routes/config'));
        app.use('/api', require('../../routes/bitacora'));

        app.use('/api/uploads', guardProtectedUploadsMiddleware);
        app.use('/api/uploads', express.static(UPLOADS_DIR, { dotfiles: 'deny', index: false }));

        app.use((err, _req, res, next) => {
            if (res.headersSent) return next(err);
            if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
                return res.status(413).json({ message: 'Payload demasiado grande' });
            }
            return res.status(err?.status || 500).json({ message: err?.message || 'Error interno' });
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
    };

    const stop = async () => {
        cleanupTrackedUploads();
        if (origWriteFileSync) fs.writeFileSync = origWriteFileSync;
        if (origWriteFile) fs.writeFile = origWriteFile;
        if (origPromisesWriteFile) fs.promises.writeFile = origPromisesWriteFile;
        if (server) {
            await new Promise((resolve) => server.close(resolve));
            server = null;
        }
        telegramSpy.restore();
        geminiSpy.restore();
        if (origGetDb) dbModule.getDb = origGetDb;
        if (origGetDbIfReady) dbModule.getDbIfReady = origGetDbIfReady;
        if (origGetExternalDb) dbModule.getExternalDb = origGetExternalDb;
        if (origGetAccountingDb) dbModule.getAccountingDb = origGetAccountingDb;
        if (origWithTransaction) dbModule.withTransaction = origWithTransaction;
        if (origWithRetry) dbModule.withRetry = origWithRetry;
    };

    const reset = () => {
        cleanupTrackedUploads();
        mockDb.reset();
        socketSpy.reset();
        telegramSpy.reset();
        geminiSpy.reset();
        if (clearQueryCacheFn) clearQueryCacheFn();
        if (invalidateBotTokenCacheFn) invalidateBotTokenCacheFn();
        [1, 2, 3, 4, 5, 6].forEach((id) => {
            restoreUser(id);
            invalidateUserAuthCache(id);
        });
    };

    const request = async (method, urlPath, { userId = 1, token = undefined, body = null, rawBody = null, headers = {} } = {}) => {
        const reqHeaders = { ...headers };
        if (token !== null) {
            const resolvedToken = token !== undefined ? token : (userId ? makeToken(userId) : null);
            if (resolvedToken) {
                reqHeaders.Authorization = `Bearer ${resolvedToken}`;
            }
        }
        let payload;
        if (rawBody !== null) {
            payload = rawBody;
            if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
        } else if (body !== null) {
            payload = JSON.stringify(body);
            if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
        }

        const res = await fetch(`${baseUrl}${urlPath}`, {
            method,
            headers: reqHeaders,
            body: payload
        });
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const text = buffer.toString('utf8');
        let data = {};
        try {
            data = JSON.parse(text);
        } catch (_) {
            data = {};
        }
        return {
            status: res.status,
            data,
            text,
            buffer,
            headers: res.headers
        };
    };

    const rawGet = (rawPath, headers = {}) => new Promise((resolve, reject) => {
        const parsed = new URL(baseUrl);
        const req = http.request({
            hostname: parsed.hostname,
            port: Number(parsed.port),
            path: rawPath,
            method: 'GET',
            headers
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const text = buffer.toString('utf8');
                let data = {};
                try { data = JSON.parse(text); } catch (_) { data = {}; }
                resolve({ status: res.statusCode, data, text, buffer, headers: res.headers });
            });
        });
        req.on('error', reject);
        req.end();
    });

    const flushAuditLog = async () => {
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setImmediate(r));
    };

    const writeTempProtectedFile = (subdir, filename, contentBuf) => {
        const dirPath = path.join(UPLOADS_DIR, subdir);
        fs.mkdirSync(dirPath, { recursive: true });
        const uniqueName = `${process.pid}_${filename}`;
        const full = path.join(dirPath, uniqueName);
        fs.writeFileSync(full, contentBuf);
        trackedUploadFiles.add(full);
        return `/api/uploads/${subdir}/${uniqueName}`;
    };

    return {
        mockDb,
        socketSpy,
        telegramSpy,
        geminiSpy,
        start,
        stop,
        reset,
        request,
        rawGet,
        makeToken,
        flushAuditLog,
        writeTempProtectedFile,
        getBaseUrl: () => baseUrl,
        readServerLargePayloadPrefixes,
        readServerSource
    };
}

module.exports = {
    createE2eHarness,
    UPLOADS_DIR
};
