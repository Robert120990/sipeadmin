const fs = require('fs');
const path = require('path');
const https = require('https');
const db = require('../db');
const getDb = (...args) => db.getDb(...args);
const getAccountingDb = (...args) => db.getAccountingDb(...args);

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const SIBLING_SAAS_UPLOADS = [
    process.env.SYS_SAAS_UPLOADS_DIR,
    path.resolve(__dirname, '..', '..', '..', 'SIPEWEBgas', 'server', 'uploads'),
    '/var/www/SIPEWEBgas/server/uploads',
    '/opt/nova-saas/server/uploads'
].filter(Boolean);

const ensureUploadsDir = () => {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
};

const schemaInitializedPools = new WeakSet();
const poolTicketColsMap = new WeakMap();

const hasTicketCol = (pool, colName) => {
    const colSet = pool ? poolTicketColsMap.get(pool) : null;
    if (!colSet || colSet.size === 0) return true;
    return colSet.has(colName);
};

const ensureTicketSchema = async (pool) => {
    if (!pool || schemaInitializedPools.has(pool)) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_code VARCHAR(32) NOT NULL UNIQUE,
                company_id INT NULL,
                user_id INT NOT NULL,
                admin_user_id INT NULL,
                user_name VARCHAR(150) NOT NULL,
                user_role VARCHAR(60) NULL,
                type ENUM('problema', 'requerimiento', 'mejora', 'consulta') NOT NULL DEFAULT 'problema',
                priority ENUM('baja', 'media', 'alta', 'urgente') NOT NULL DEFAULT 'media',
                status ENUM('abierto', 'en_proceso', 'resuelto', 'cerrado') NOT NULL DEFAULT 'abierto',
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                module_name VARCHAR(120) NULL,
                page_url VARCHAR(255) NULL,
                source_system VARCHAR(40) NULL DEFAULT 'admin.sipesv.com',
                screenshot_url VARCHAR(500) NULL,
                attachments_json LONGTEXT NULL,
                diagnostics_json LONGTEXT NULL,
                diagnostic_relevance VARCHAR(30) NULL DEFAULT 'sin_errores',
                diagnostic_score INT NOT NULL DEFAULT 0,
                include_in_ai_prompt TINYINT(1) NOT NULL DEFAULT 0,
                ai_notes TEXT NULL,
                custom_logs LONGTEXT NULL,
                ai_mode VARCHAR(30) NOT NULL DEFAULT 'agent_prompt',
                agent_platform VARCHAR(40) NOT NULL DEFAULT 'antigravity',
                ai_bundled_at DATETIME NULL,
                agy_status VARCHAR(40) NOT NULL DEFAULT 'idle',
                agy_model VARCHAR(80) NULL DEFAULT 'gemini-4-argon-high',
                agy_plan_markdown LONGTEXT NULL,
                agy_execution_log LONGTEXT NULL,
                agy_approved_by VARCHAR(120) NULL,
                agy_plan_version INT NOT NULL DEFAULT 0,
                agy_telegram_msg_id VARCHAR(64) NULL,
                agy_updated_at DATETIME NULL,
                resolution_notes TEXT NULL,
                resolved_version VARCHAR(50) NULL,
                resolved_by INT NULL,
                resolved_by_name VARCHAR(150) NULL,
                resolved_at DATETIME NULL,
                creator_notified_at DATETIME NULL,
                telegram_message_id VARCHAR(64) NULL,
                telegram_chat_id VARCHAR(64) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_support_tickets_company_status (company_id, status),
                INDEX idx_support_tickets_user_status (user_id, status),
                INDEX idx_support_tickets_admin_user (admin_user_id, status),
                INDEX idx_support_tickets_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        const extraColumns = [
            ['admin_user_id', 'INT NULL'],
            ['source_system', "VARCHAR(40) NULL DEFAULT 'sys.sipesv.com'"],
            ['attachments_json', 'LONGTEXT NULL'],
            ['diagnostics_json', 'LONGTEXT NULL'],
            ['diagnostic_relevance', "VARCHAR(30) NULL DEFAULT 'sin_errores'"],
            ['diagnostic_score', 'INT NOT NULL DEFAULT 0'],
            ['include_in_ai_prompt', 'TINYINT(1) NOT NULL DEFAULT 0'],
            ['ai_notes', 'TEXT NULL'],
            ['custom_logs', 'LONGTEXT NULL'],
            ['ai_mode', "VARCHAR(30) NOT NULL DEFAULT 'agent_prompt'"],
            ['agent_platform', "VARCHAR(40) NOT NULL DEFAULT 'antigravity'"],
            ['ai_bundled_at', 'DATETIME NULL'],
            ['agy_status', "VARCHAR(40) NOT NULL DEFAULT 'idle'"],
            ['agy_model', "VARCHAR(80) NULL DEFAULT 'gemini-4-argon-high'"],
            ['agy_plan_markdown', 'LONGTEXT NULL'],
            ['agy_execution_log', 'LONGTEXT NULL'],
            ['agy_approved_by', 'VARCHAR(120) NULL'],
            ['agy_plan_version', 'INT NOT NULL DEFAULT 0'],
            ['agy_telegram_msg_id', 'VARCHAR(64) NULL'],
            ['agy_updated_at', 'DATETIME NULL'],
            ['resolved_version', 'VARCHAR(50) NULL'],
            ['resolved_by', 'INT NULL']
        ];

        for (const [colName, colDef] of extraColumns) {
            try {
                const [cols] = await pool.query(`SHOW COLUMNS FROM support_tickets LIKE ?`, [colName]);
                if (!cols || cols.length === 0) {
                    await pool.query(`ALTER TABLE support_tickets ADD COLUMN ${colName} ${colDef}`);
                }
            } catch (_) {
                // Ignore if already exists or restricted
            }
        }

        try {
            const [allCols] = await pool.query('SHOW COLUMNS FROM support_tickets');
            if (Array.isArray(allCols) && allCols.length > 0) {
                const colSet = new Set(allCols.map((c) => c.Field || c.COLUMN_NAME).filter(Boolean));
                if (colSet.size > 0) {
                    poolTicketColsMap.set(pool, colSet);
                }
            }
        } catch (_) {
            // Ignore in mock test pools
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_ticket_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id INT NOT NULL,
                sender_type VARCHAR(30) NOT NULL DEFAULT 'user',
                sender_id INT NULL,
                sender_user_id INT NULL,
                sender_name VARCHAR(150) NOT NULL,
                sender_role VARCHAR(60) NOT NULL DEFAULT 'user',
                source VARCHAR(30) NOT NULL DEFAULT 'web',
                message TEXT NOT NULL,
                attachment_url VARCHAR(500) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ticket_messages_ticket (ticket_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        const msgExtraColumns = [
            ['sender_type', "VARCHAR(30) NOT NULL DEFAULT 'user'"],
            ['sender_id', 'INT NULL'],
            ['sender_user_id', 'INT NULL'],
            ['sender_role', "VARCHAR(60) NOT NULL DEFAULT 'user'"],
            ['source', "VARCHAR(30) NOT NULL DEFAULT 'web'"],
            ['attachment_url', 'VARCHAR(500) NULL']
        ];
        for (const [colName, colDef] of msgExtraColumns) {
            try {
                const [cols] = await pool.query(`SHOW COLUMNS FROM support_ticket_messages LIKE ?`, [colName]);
                if (!cols || cols.length === 0) {
                    await pool.query(`ALTER TABLE support_ticket_messages ADD COLUMN ${colName} ${colDef}`);
                }
            } catch (_) {
                // Ignore
            }
        }

        await pool.query(`
            CREATE TABLE IF NOT EXISTS agy_server_settings (
                id INT PRIMARY KEY DEFAULT 1,
                ssh_host VARCHAR(150) NOT NULL DEFAULT '5.252.55.29',
                ssh_port INT NOT NULL DEFAULT 22,
                ssh_user VARCHAR(80) NOT NULL DEFAULT 'root',
                ssh_password VARCHAR(255) NULL,
                ssh_key_path VARCHAR(255) NULL,
                project_path VARCHAR(255) NOT NULL DEFAULT '/var/www/sipeadmin',
                agy_command VARCHAR(120) NOT NULL DEFAULT 'agy',
                default_model VARCHAR(80) NOT NULL DEFAULT 'gemini-4-argon-high',
                available_models_json TEXT NULL,
                execution_mode VARCHAR(30) NOT NULL DEFAULT 'auto',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        schemaInitializedPools.add(pool);
    } catch (err) {
        console.warn('[TicketService] ensureTicketSchema warning:', err.message);
    }
};

/**
 * Obtiene el pool principal de tickets:
 * Conecta directamente a `db_sistema_saas` (sys.sipesv.com) para que todos los tickets
 * de admin.sipesv.com alimenten en tiempo real a sys.sipesv.com.
 * Si `db_sistema_saas` no está accesible (ej. entorno de test aislado), usa `getDb()` (db_sipe_admin).
 */
const getTicketPool = async () => {
    if (process.env.TICKET_FORCE_LOCAL_DB === 'true') {
        const localPool = getDb();
        await ensureTicketSchema(localPool);
        return { pool: localPool, isSharedSaas: false };
    }
    try {
        const saasPool = await getAccountingDb();
        await saasPool.query('SELECT 1');
        await ensureTicketSchema(saasPool);
        return { pool: saasPool, isSharedSaas: true };
    } catch (_) {
        const localPool = getDb();
        await ensureTicketSchema(localPool);
        return { pool: localPool, isSharedSaas: false };
    }
};

const saveBase64Screenshot = (base64Data, prefix = 'ticket') => {
    if (!base64Data || typeof base64Data !== 'string') return null;
    if (base64Data.startsWith('/api/uploads/') || base64Data.startsWith('http')) {
        return base64Data;
    }

    const match = base64Data.match(/^data:image\/(webp|png|jpeg|jpg);base64,(.+)$/i);
    const ext = match ? (match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()) : 'webp';
    const rawBase64 = match ? match[2] : base64Data;

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length > 6 * 1024 * 1024) {
        throw new Error('La captura excede el límite de 6MB.');
    }

    ensureUploadsDir();
    const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, buffer);

    // Copiar también al directorio uploads de sys.sipesv.com si existe en el mismo servidor (excepto tests)
    if (!String(prefix).startsWith('TEST-')) {
        for (const siblingDir of SIBLING_SAAS_UPLOADS) {
            try {
                if (fs.existsSync(siblingDir)) {
                    fs.writeFileSync(path.join(siblingDir, filename), buffer);
                }
            } catch (_) {
                // Ignorar si no tiene permisos en directorio hermano
            }
        }
    }

    return `/api/uploads/${filename}`;
};

const normalizeAttachments = (rawAttachments, fallbackSingleBase64, prefix = 'ticket') => {
    const items = [];
    if (Array.isArray(rawAttachments)) {
        for (const item of rawAttachments.slice(0, 6)) {
            if (!item) continue;
            const src = typeof item === 'string' ? item : (item.base64 || item.dataUrl || item.url);
            if (!src) continue;
            const savedUrl = saveBase64Screenshot(src, prefix);
            if (savedUrl) {
                items.push({
                    url: savedUrl,
                    caption: typeof item === 'object' && item.caption ? String(item.caption).trim().slice(0, 240) : '',
                    annotated: Boolean(typeof item === 'object' && item.annotated),
                    created_at: new Date().toISOString()
                });
            }
        }
    }
    if (items.length === 0 && fallbackSingleBase64) {
        const singleUrl = saveBase64Screenshot(fallbackSingleBase64, prefix);
        if (singleUrl) {
            items.push({ url: singleUrl, caption: '', annotated: false, created_at: new Date().toISOString() });
        }
    }
    return items;
};

const computeDiagnosticRelevance = (diagnostics) => {
    if (!diagnostics || typeof diagnostics !== 'object') {
        return { relevance: 'sin_errores', score: 0, payload: null };
    }
    const clientRelevance = diagnostics.relevance;
    const clientScore = Number(diagnostics.relevanceScore || 0);
    const networkErrors = Array.isArray(diagnostics.networkErrors) ? diagnostics.networkErrors.slice(0, 12) : [];
    const consoleErrors = Array.isArray(diagnostics.consoleErrors) ? diagnostics.consoleErrors.slice(0, 12) : [];
    const runtimeErrors = Array.isArray(diagnostics.runtimeErrors) ? diagnostics.runtimeErrors.slice(0, 8) : [];

    let score = clientScore;
    if (!score) {
        if (networkErrors.some((e) => Number(e.status) >= 500)) score += 65;
        else if (networkErrors.length > 0) score += 40;
        if (runtimeErrors.length > 0) score += 50;
        if (consoleErrors.length > 0) score += 25;
        score = Math.min(100, score);
    }

    const relevance = clientRelevance || (
        score >= 65 ? 'alta' : score >= 35 ? 'media' : score > 0 ? 'baja' : 'sin_errores'
    );

    return {
        relevance,
        score,
        payload: {
            capturedAt: diagnostics.capturedAt || new Date().toISOString(),
            currentRoute: diagnostics.currentRoute || null,
            userAgent: diagnostics.userAgent ? String(diagnostics.userAgent).slice(0, 250) : null,
            viewport: diagnostics.viewport || null,
            relevance,
            relevanceScore: score,
            summary: diagnostics.summary || null,
            networkErrors,
            consoleErrors,
            runtimeErrors
        }
    };
};

const generateTicketCode = async (pool) => {
    try {
        const [admRows] = await pool.query(
            "SELECT ticket_code FROM support_tickets WHERE ticket_code LIKE 'ADM-%' ORDER BY id DESC LIMIT 50"
        );
        let maxSeq = 0;
        for (const r of admRows || []) {
            const m = String(r.ticket_code || '').match(/^ADM-(\d+)$/i);
            if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxSeq) maxSeq = n;
            }
        }
        if (maxSeq > 0) {
            return `ADM-${String(maxSeq + 1).padStart(4, '0')}`;
        }
    } catch (_) {
        // Fallback a MAX(id)
    }
    const [rows] = await pool.query('SELECT MAX(id) AS maxId FROM support_tickets');
    const nextNum = (Number(rows[0]?.maxId) || 0) + 1;
    return `ADM-${String(nextNum).padStart(4, '0')}`;
};

/**
 * Resuelve qué usuarios de db_sipe_admin (admin.sipesv.com) deben recibir notificación
 * para un ticket determinado (el creador y/o administradores).
 */
const resolveTargetAdminUserId = async (ticket) => {
    if (!ticket) return null;
    const localDb = getDb();
    if (ticket.admin_user_id) {
        return Number(ticket.admin_user_id);
    }
    // Si fue creado en admin.sipesv.com, user_id suele corresponder al usuario en db_sipe_admin
    if (ticket.source_system === 'admin.sipesv.com' && ticket.user_id) {
        try {
            const [uRows] = await localDb.query('SELECT id FROM users WHERE id = ? LIMIT 1', [ticket.user_id]);
            if (uRows.length > 0) return Number(uRows[0].id);
        } catch (_) { /* ignore */ }
    }
    // Intentar emparejar por nombre o username
    if (ticket.user_name) {
        try {
            const [uRows] = await localDb.query(
                'SELECT id FROM users WHERE LOWER(nombre) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1',
                [ticket.user_name, ticket.user_name]
            );
            if (uRows.length > 0) return Number(uRows[0].id);
        } catch (_) { /* ignore */ }
    }
    return null;
};

/**
 * Crea una notificación persistente en `db_sipe_admin.notifications` y la emite por Socket.io
 * al usuario en tiempo real (`notification:new`).
 */
const createAndEmitAdminNotification = async ({ io, userId, type, title, message, data }) => {
    if (!userId) return null;
    try {
        const localDb = getDb();
        const dataJson = data ? JSON.stringify(data) : null;
        const [res] = await localDb.query(
            `INSERT INTO notifications (user_id, type, title, message, data, is_read)
             VALUES (?, ?, ?, ?, ?, 0)`,
            [userId, type, title, message, dataJson]
        );
        const notificationObj = {
            id: res.insertId,
            user_id: Number(userId),
            type,
            title,
            message,
            data: data || {},
            is_read: 0,
            created_at: new Date().toISOString()
        };
        if (io) {
            io.to(`user_${userId}`).emit('notification:new', notificationObj);
        }
        return notificationObj;
    } catch (err) {
        console.warn('[TicketService] Error creando notificación local:', err.message);
        return null;
    }
};

const buildInteractiveTicketKeyboard = (ticketId, status = 'abierto') => {
    if (!ticketId) return undefined;
    if (status === 'resuelto' || status === 'cerrado') {
        return { inline_keyboard: [[{ text: '💬 Enviar Comentario Adicional', callback_data: `ticket_comment:${ticketId}` }]] };
    }
    return {
        inline_keyboard: [
            [{ text: '🤖 Aprobar y Planificar AGY', callback_data: `agy_start_plan:${ticketId}` }],
            [{ text: '🛠️ En Proceso', callback_data: `ticket_take:${ticketId}` }, { text: '✅ Marcar Resuelto', callback_data: `ticket_resolve:${ticketId}` }],
            [{ text: '✍️ Resolver con Nota', callback_data: `ticket_resolve_note:${ticketId}` }, { text: '💬 Comentar al Usuario', callback_data: `ticket_comment:${ticketId}` }]
        ]
    };
};

const buildAgyPlanApprovalKeyboard = (ticketId) => ({
    inline_keyboard: [
        [{ text: '✅ Aprobar y Ejecutar Plan', callback_data: `agy_plan_approve:${ticketId}` }],
        [
            { text: '✏️ Ampliar / Re-planificar', callback_data: `agy_plan_feedback:${ticketId}` },
            { text: '❌ Denegar Plan', callback_data: `agy_plan_reject:${ticketId}` }
        ]
    ]
});

/**
 * Envía aviso interactivo a Telegram compartiendo el bot y chats técnicos de sys.sipesv.com (db_sistema_saas)
 * para que los administradores puedan reaccionar con botones inline (Aprobar AGY, En Proceso, Resolver, Comentar).
 */
const sendTelegramSupportAlert = async (htmlText, options = {}) => {
    try {
        const { pool: ticketPool, isSharedSaas } = await getTicketPool();
        const localDb = getDb();
        let botToken = null;
        const targetChatIds = new Set();

        // 1. Priorizar bot y destinatarios de db_sistema_saas (donde está conectado el webhook interactivo de tickets/AGY)
        if (isSharedSaas && ticketPool) {
            try {
                const [saasCfg] = await ticketPool.query('SELECT bot_token, is_active, support_tickets_active FROM telegram_settings WHERE id = 1 LIMIT 1');
                if (saasCfg?.[0]?.bot_token && saasCfg[0].is_active !== 0 && saasCfg[0].support_tickets_active !== 0) {
                    botToken = saasCfg[0].bot_token;
                }
                const [saasChats] = await ticketPool.query(
                    `SELECT DISTINCT chat_id FROM telegram_chat_bindings WHERE COALESCE(receive_support_tickets, 1) = 1`
                );
                for (const c of saasChats || []) {
                    if (c.chat_id) targetChatIds.add(String(c.chat_id));
                }
            } catch (_) { /* ignore */ }
        }

        // 2. Fallback al bot local de db_sipe_admin si no se obtuvo de SaaS
        if (!botToken) {
            try {
                const [cfgRows] = await localDb.query('SELECT bot_token, is_active FROM telegram_config WHERE id = 1 LIMIT 1');
                botToken = cfgRows?.[0]?.bot_token || process.env.TELEGRAM_BOT_TOKEN;
            } catch (_) {
                botToken = process.env.TELEGRAM_BOT_TOKEN;
            }
        }
        if (!botToken) return false;

        try {
            const [tgUsers] = await localDb.query('SELECT telegram_user_id FROM telegram_usuarios WHERE activo = 1 AND permiso_alertas = 1');
            for (const u of tgUsers || []) {
                if (u.telegram_user_id) targetChatIds.add(String(u.telegram_user_id));
            }
        } catch (_) { /* ignore */ }

        if (process.env.TELEGRAM_SUPPORT_CHAT_ID) {
            targetChatIds.add(String(process.env.TELEGRAM_SUPPORT_CHAT_ID));
        }

        const replyMarkup = options.replyMarkup || (options.ticketId ? buildInteractiveTicketKeyboard(options.ticketId, options.status || 'abierto') : undefined);
        const targets = Array.from(targetChatIds).slice(0, 8);

        for (const chatId of targets) {
            const payloadObj = {
                chat_id: chatId,
                text: htmlText,
                parse_mode: 'HTML'
            };
            if (replyMarkup) {
                payloadObj.reply_markup = replyMarkup;
            }
            const payload = JSON.stringify(payloadObj);
            const req = https.request({
                hostname: 'api.telegram.org',
                path: `/bot${botToken}/sendMessage`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 8000
            });
            req.on('error', () => {});
            req.write(payload);
            req.end();
        }
        return targets.length > 0;
    } catch (_) {
        // Silencioso para no bloquear flujo principal
        return false;
    }
};

const toApiUploadUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    return url.startsWith('/uploads/') ? `/api${url}` : url;
};

const enrichTicketRow = (r) => {
    if (!r) return null;
    let attachments = [];
    if (r.attachments_json) {
        try {
            attachments = typeof r.attachments_json === 'string' ? JSON.parse(r.attachments_json) : r.attachments_json;
        } catch {
            attachments = [];
        }
    }
    const normalizedScreenshotUrl = toApiUploadUrl(r.screenshot_url);
    if ((!Array.isArray(attachments) || attachments.length === 0) && normalizedScreenshotUrl) {
        attachments = [{ url: normalizedScreenshotUrl, caption: '', annotated: false }];
    } else if (Array.isArray(attachments)) {
        attachments = attachments.map((a) => (a && a.url ? { ...a, url: toApiUploadUrl(a.url) } : a));
    }

    let diagnostics = null;
    if (r.diagnostics_json) {
        try {
            diagnostics = typeof r.diagnostics_json === 'string' ? JSON.parse(r.diagnostics_json) : r.diagnostics_json;
        } catch {
            diagnostics = null;
        }
    }

    return {
        ...r,
        code: r.ticket_code,
        creator_name: r.user_name,
        creator_username: r.user_name,
        screenshot_url: normalizedScreenshotUrl,
        company_name: r.company_name || (r.source_system === 'admin.sipesv.com' ? 'SIPE Admin (admin.sipesv.com)' : 'SIPE SaaS (sys.sipesv.com)'),
        attachments: Array.isArray(attachments) ? attachments : [],
        diagnostics
    };
};

const getTicketById = async (id) => {
    const { pool, isSharedSaas } = await getTicketPool();
    let query = `
        SELECT t.*
        FROM support_tickets t
        WHERE t.id = ?
        LIMIT 1
    `;
    if (isSharedSaas) {
        query = `
            SELECT t.*, c.razon_social AS company_name, b.nombre AS branch_name
            FROM support_tickets t
            LEFT JOIN companies c ON c.id = t.company_id
            LEFT JOIN branches b ON b.id = t.branch_id
            WHERE t.id = ?
            LIMIT 1
        `;
    }
    let rows;
    try {
        [rows] = await pool.query(query, [id]);
    } catch (_) {
        [rows] = await pool.query('SELECT t.* FROM support_tickets t WHERE t.id = ? LIMIT 1', [id]);
    }
    if (!rows || rows.length === 0) return null;

    const [messages] = await pool.query(
        `SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC, id ASC`,
        [id]
    );

    const enriched = enrichTicketRow(rows[0]);
    const normalizedMessages = (messages || []).map((m) => ({
        ...m,
        attachment_url: toApiUploadUrl(m.attachment_url),
        sender_user_id: m.sender_user_id ?? m.sender_id ?? null,
        sender_role: m.sender_role || (m.sender_type === 'user' ? 'user' : 'tech'),
        source: m.source || (m.sender_type === 'telegram' ? 'telegram' : 'web')
    }));
    return {
        ...enriched,
        messages: normalizedMessages
    };
};

const createTicket = async ({
    companyId = null,
    userId,
    adminUserId = null,
    userName,
    userRole = 'user',
    type = 'problema',
    priority = 'media',
    subject,
    description,
    moduleName = null,
    pageUrl = null,
    screenshotBase64 = null,
    attachments = null,
    diagnostics = null,
    io = null
}) => {
    const { pool } = await getTicketPool();
    let ticketCode = await generateTicketCode(pool);
    const normalizedAttachments = normalizeAttachments(attachments, screenshotBase64, 'ticket');
    const primaryScreenshotUrl = normalizedAttachments[0]?.url || null;
    const attachmentsJson = normalizedAttachments.length > 0 ? JSON.stringify(normalizedAttachments) : null;

    const diagResult = computeDiagnosticRelevance(diagnostics);
    const diagnosticsJson = diagResult.payload ? JSON.stringify(diagResult.payload) : null;

    const effectiveCompanyId = Number(companyId) || 1;
    const effectiveUserId = Number(userId) || 1;
    const effectiveAdminUserId = Number(adminUserId || userId) || effectiveUserId;
    const effectiveModuleName = moduleName
        ? (String(moduleName).includes('Admin') ? moduleName : `${moduleName} (Admin)`)
        : 'SIPE Admin';

    let insertId;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const [result] = await pool.query(
                `INSERT INTO support_tickets
                 (ticket_code, company_id, user_id, admin_user_id, user_name, user_role, type, priority, status,
                  subject, description, module_name, page_url, source_system, screenshot_url,
                  attachments_json, diagnostics_json, diagnostic_relevance, diagnostic_score)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'abierto', ?, ?, ?, ?, 'admin.sipesv.com', ?, ?, ?, ?, ?)`,
                [
                    ticketCode,
                    effectiveCompanyId,
                    effectiveUserId,
                    effectiveAdminUserId,
                    userName || 'Usuario SIPE Admin',
                    userRole || 'user',
                    type || 'problema',
                    priority || 'media',
                    subject,
                    description,
                    effectiveModuleName,
                    pageUrl || '/dashboard',
                    primaryScreenshotUrl,
                    attachmentsJson,
                    diagnosticsJson,
                    diagResult.relevance,
                    diagResult.score
                ]
            );
            insertId = result.insertId;
            break;
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY' && attempt < 2) {
                ticketCode = `ADM-${Date.now().toString().slice(-5)}`;
                continue;
            }
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                const [fallbackResult] = await pool.query(
                    `INSERT INTO support_tickets
                     (ticket_code, company_id, user_id, user_name, user_role, type, priority, status,
                      subject, description, module_name, page_url, screenshot_url,
                      attachments_json, diagnostics_json, diagnostic_relevance, diagnostic_score)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'abierto', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        ticketCode,
                        effectiveCompanyId,
                        effectiveUserId,
                        userName || 'Usuario SIPE Admin',
                        userRole || 'user',
                        type || 'problema',
                        priority || 'media',
                        subject,
                        description,
                        effectiveModuleName,
                        pageUrl || '/dashboard',
                        primaryScreenshotUrl,
                        attachmentsJson,
                        diagnosticsJson,
                        diagResult.relevance,
                        diagResult.score
                    ]
                );
                insertId = fallbackResult.insertId;
                break;
            }
            throw err;
        }
    }

    try {
        await pool.query(
            `INSERT INTO support_ticket_messages
             (ticket_id, sender_type, sender_id, sender_user_id, sender_name, sender_role, source, message, attachment_url)
             VALUES (?, 'user', ?, ?, ?, ?, 'web', ?, ?)`,
            [insertId, effectiveUserId, effectiveUserId, userName || 'Usuario', userRole || 'user', description, primaryScreenshotUrl]
        );
    } catch (_) {
        await pool.query(
            `INSERT INTO support_ticket_messages
             (ticket_id, sender_type, sender_id, sender_name, message, attachment_url)
             VALUES (?, 'user', ?, ?, ?, ?)`,
            [insertId, effectiveUserId, userName || 'Usuario', description, primaryScreenshotUrl]
        );
    }

    const ticket = await getTicketById(insertId);

    // Registrar estado inicial en el caché de vigilancia en tiempo real
    knownTicketStateCache.set(Number(ticket.id), {
        status: ticket.status,
        updatedAt: String(ticket.updated_at || ''),
        resolvedAt: String(ticket.resolved_at || '')
    });

    // Notificar en tiempo real al creador (confirmación de ticket pendiente) y a los administradores
    if (effectiveAdminUserId) {
        await createAndEmitAdminNotification({
            io,
            userId: effectiveAdminUserId,
            type: 'ticket_pending',
            title: `🎫 Ticket #${ticket.ticket_code} Pendiente`,
            message: `Tu ticket "${ticket.subject}" fue enviado a soporte (sys.sipesv.com) y está pendiente de atención.`,
            data: {
                ticket_id: ticket.id,
                ticket_code: ticket.ticket_code,
                status: 'abierto',
                subject: ticket.subject
            }
        });
    }

    // Notificar a otros administradores en db_sipe_admin
    try {
        const localDb = getDb();
        const [admins] = await localDb.query(
            `SELECT u.id FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE (u.role_id = 1 OR LOWER(r.name) IN ('admin', 'administrator', 'administrador'))
               AND u.status = 'active'`
        );
        for (const adm of admins) {
            if (Number(adm.id) === Number(effectiveAdminUserId)) continue;
            await createAndEmitAdminNotification({
                io,
                userId: adm.id,
                type: 'ticket_created',
                title: `🆕 Nuevo Ticket #${ticket.ticket_code} (${ticket.priority.toUpperCase()})`,
                message: `${ticket.user_name}: ${ticket.subject}`,
                data: {
                    ticket_id: ticket.id,
                    ticket_code: ticket.ticket_code,
                    status: 'abierto',
                    subject: ticket.subject
                }
            });
        }
    } catch (_) { /* ignore */ }

    if (io) {
        io.emit('ticket:created', ticket);
    }

    sendTelegramSupportAlert(
        `🎫 <b>NUEVO TICKET DE SOPORTE — #${ticket.ticket_code}</b>\n` +
        `🌐 <b>Proyecto:</b> <code>admin.sipesv.com</code> (SIPE Admin)\n\n` +
        `📌 <b>Asunto:</b> ${ticket.subject}\n` +
        `⚡ <b>Prioridad:</b> ${String(ticket.priority).toUpperCase()}  |  <b>Tipo:</b> ${ticket.type}\n` +
        `📂 <b>Módulo:</b> ${ticket.module_name || 'SIPE Admin'} (<code>${ticket.page_url || '/dashboard'}</code>)\n` +
        `👤 <b>Solicitante:</b> ${ticket.user_name}\n\n` +
        `📝 <b>Descripción:</b>\n${String(ticket.description || '').slice(0, 400)}\n\n` +
        `<i>Selecciona una acción abajo o usa /agy ${ticket.ticket_code} o /resolver ${ticket.ticket_code} &lt;nota&gt;</i>`,
        { ticketId: ticket.id, status: ticket.status }
    );

    return ticket;
};

const getTickets = async ({
    userId = null,
    userName = null,
    username = null,
    canManage = false,
    mineOnly = false,
    status = null,
    type = null,
    priority = null,
    search = '',
    page = 1,
    limit = 20
}) => {
    const { pool, isSharedSaas } = await getTicketPool();
    const where = ['1=1'];
    const params = [];

    if (!canManage || mineOnly) {
        const userConds = [];
        if (hasTicketCol(pool, 'admin_user_id')) {
            userConds.push('t.admin_user_id = ?');
            params.push(Number(userId || 0));
        }
        if (hasTicketCol(pool, 'source_system')) {
            userConds.push("(t.source_system = 'admin.sipesv.com' AND t.user_id = ?)");
            params.push(Number(userId || 0));
        } else {
            userConds.push('t.user_id = ?');
            params.push(Number(userId || 0));
        }
        if (userName) {
            userConds.push('LOWER(t.user_name) = LOWER(?)');
            params.push(String(userName));
        }
        if (username && username !== userName) {
            userConds.push('LOWER(t.user_name) = LOWER(?)');
            params.push(String(username));
        }
        where.push(`(${userConds.join(' OR ')})`);
    }

    if (status) {
        where.push('t.status = ?');
        params.push(status);
    }
    if (type) {
        where.push('t.type = ?');
        params.push(type);
    }
    if (priority) {
        where.push('t.priority = ?');
        params.push(priority);
    }
    if (search && String(search).trim()) {
        const q = `%${String(search).trim()}%`;
        where.push('(t.ticket_code LIKE ? OR t.subject LIKE ? OR t.description LIKE ? OR t.user_name LIKE ? OR t.module_name LIKE ?)');
        params.push(q, q, q, q, q);
    }

    const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const offset = (safePage - 1) * safeLimit;
    const whereClause = where.join(' AND ');

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total FROM support_tickets t WHERE ${whereClause}`,
        params
    );
    const total = Number(countRows[0]?.total || 0);

    let rows;
    try {
        if (isSharedSaas) {
            [rows] = await pool.query(
                `SELECT t.*, c.razon_social AS company_name, b.nombre AS branch_name
                 FROM support_tickets t
                 LEFT JOIN companies c ON c.id = t.company_id
                 LEFT JOIN branches b ON b.id = t.branch_id
                 WHERE ${whereClause}
                 ORDER BY
                    CASE t.status WHEN 'abierto' THEN 1 WHEN 'en_proceso' THEN 2 WHEN 'resuelto' THEN 3 ELSE 4 END ASC,
                    t.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, safeLimit, offset]
            );
        } else {
            throw new Error('local query');
        }
    } catch (_) {
        [rows] = await pool.query(
            `SELECT t.*
             FROM support_tickets t
             WHERE ${whereClause}
             ORDER BY
                CASE t.status WHEN 'abierto' THEN 1 WHEN 'en_proceso' THEN 2 WHEN 'resuelto' THEN 3 ELSE 4 END ASC,
                t.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, safeLimit, offset]
        );
    }

    const items = (rows || []).map(enrichTicketRow);

    return {
        items,
        pagination: {
            total,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.ceil(total / safeLimit) || 1
        }
    };
};

const getTicketStats = async ({ userId = null, userName = null, username = null, canManage = false }) => {
    const { pool } = await getTicketPool();
    const where = ['1=1'];
    const params = [];

    if (!canManage && userId) {
        const userConds = [];
        if (hasTicketCol(pool, 'admin_user_id')) {
            userConds.push('admin_user_id = ?');
            params.push(Number(userId));
        }
        if (hasTicketCol(pool, 'source_system')) {
            userConds.push("(source_system = 'admin.sipesv.com' AND user_id = ?)");
            params.push(Number(userId));
        } else {
            userConds.push('user_id = ?');
            params.push(Number(userId));
        }
        if (userName) {
            userConds.push('LOWER(user_name) = LOWER(?)');
            params.push(String(userName));
        }
        if (username && username !== userName) {
            userConds.push('LOWER(user_name) = LOWER(?)');
            params.push(String(username));
        }
        where.push(`(${userConds.join(' OR ')})`);
    }

    const aiSumExpr = hasTicketCol(pool, 'include_in_ai_prompt')
        ? "SUM(CASE WHEN include_in_ai_prompt = 1 AND status IN ('abierto', 'en_proceso') THEN 1 ELSE 0 END)"
        : '0';

    const [rows] = await pool.query(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'abierto' THEN 1 ELSE 0 END) AS abiertos,
            SUM(CASE WHEN status = 'en_proceso' THEN 1 ELSE 0 END) AS en_proceso,
            SUM(CASE WHEN status = 'resuelto' THEN 1 ELSE 0 END) AS resueltos,
            SUM(CASE WHEN status = 'cerrado' THEN 1 ELSE 0 END) AS cerrados,
            SUM(CASE WHEN priority = 'urgente' AND status IN ('abierto', 'en_proceso') THEN 1 ELSE 0 END) AS urgentes_pendientes,
            ${aiSumExpr} AS seleccionados_ia
         FROM support_tickets
         WHERE ${where.join(' AND ')}`,
        params
    );
    return rows[0] || {
        total: 0,
        abiertos: 0,
        en_proceso: 0,
        resueltos: 0,
        cerrados: 0,
        urgentes_pendientes: 0,
        seleccionados_ia: 0
    };
};

const updateTicketStatus = async (
    id,
    { status, resolutionNotes = null, resolvedVersion = null, actorId = null, actorName = 'Soporte Técnico', source = 'web', io = null }
) => {
    const { pool } = await getTicketPool();
    const current = await getTicketById(id);
    if (!current) return null;

    const validStatuses = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
    const nextStatus = validStatuses.includes(status) ? status : current.status;
    const isResolving = nextStatus === 'resuelto';
    const finalNotes = resolutionNotes !== null ? resolutionNotes : current.resolution_notes;
    const finalVersion = resolvedVersion !== null ? resolvedVersion : current.resolved_version;

    if (isResolving) {
        try {
            await pool.query(
                `UPDATE support_tickets
                 SET status = 'resuelto',
                     resolution_notes = ?,
                     resolved_version = ?,
                     resolved_by = ?,
                     resolved_by_name = ?,
                     resolved_at = NOW(),
                     creator_notified_at = NULL
                 WHERE id = ?`,
                [
                    finalNotes || 'Ticket resuelto satisfactoriamente.',
                    finalVersion || null,
                    actorId,
                    actorName,
                    id
                ]
            );
        } catch (_) {
            await pool.query(
                `UPDATE support_tickets
                 SET status = 'resuelto',
                     resolution_notes = ?,
                     resolved_version = ?,
                     resolved_by_name = ?,
                     resolved_at = NOW(),
                     creator_notified_at = NULL
                 WHERE id = ?`,
                [
                    finalNotes || 'Ticket resuelto satisfactoriamente.',
                    finalVersion || null,
                    actorName,
                    id
                ]
            );
        }
    } else {
        await pool.query(`UPDATE support_tickets SET status = ? WHERE id = ?`, [nextStatus, id]);
    }

    const statusLabelMap = {
        abierto: 'Abierto (Pendiente)',
        en_proceso: 'En Proceso (Pendiente de Solución)',
        resuelto: 'Resuelto',
        cerrado: 'Cerrado'
    };

    const sysMessage = isResolving
        ? `✅ Ticket marcado como RESUELTO por ${actorName}${finalVersion ? ` (Versión ${finalVersion})` : ''}${finalNotes ? `: "${finalNotes}"` : '.'}`
        : `🔄 Estado cambiado a "${statusLabelMap[nextStatus] || nextStatus}" por ${actorName}.`;

    try {
        await pool.query(
            `INSERT INTO support_ticket_messages
             (ticket_id, sender_type, sender_id, sender_user_id, sender_name, sender_role, source, message)
             VALUES (?, 'tech', ?, ?, ?, 'tech', ?, ?)`,
            [id, actorId, actorId, actorName, source, sysMessage]
        );
    } catch (_) {
        await pool.query(
            `INSERT INTO support_ticket_messages
             (ticket_id, sender_type, sender_id, sender_name, message)
             VALUES (?, 'tech', ?, ?, ?)`,
            [id, actorId, actorName, sysMessage]
        );
    }

    const updated = await getTicketById(id);

    // Actualizar caché de vigilancia para evitar notificación duplicada en el poller
    knownTicketStateCache.set(Number(updated.id), {
        status: updated.status,
        updatedAt: String(updated.updated_at || ''),
        resolvedAt: String(updated.resolved_at || '')
    });

    // Notificar al usuario creador en admin.sipesv.com en tiempo real
    const targetAdminUserId = await resolveTargetAdminUserId(updated);
    if (targetAdminUserId) {
        if (isResolving) {
            await createAndEmitAdminNotification({
                io,
                userId: targetAdminUserId,
                type: 'ticket_resolved',
                title: `✅ ¡Ticket #${updated.ticket_code} Resuelto!`,
                message: `${updated.subject} — ${updated.resolution_notes || 'Tu solicitud ha sido resuelta.'}`,
                data: {
                    ticket_id: updated.id,
                    ticket_code: updated.ticket_code,
                    status: 'resuelto',
                    subject: updated.subject,
                    resolution_notes: updated.resolution_notes,
                    resolved_by_name: updated.resolved_by_name
                }
            });
            if (io) {
                io.to(`user_${targetAdminUserId}`).emit('ticket:resolved', updated);
            }
        } else {
            await createAndEmitAdminNotification({
                io,
                userId: targetAdminUserId,
                type: 'ticket_pending',
                title: `⏳ Ticket #${updated.ticket_code}: ${statusLabelMap[nextStatus] || nextStatus}`,
                message: `El estado de tu ticket "${updated.subject}" ahora es ${statusLabelMap[nextStatus] || nextStatus}.`,
                data: {
                    ticket_id: updated.id,
                    ticket_code: updated.ticket_code,
                    status: nextStatus,
                    subject: updated.subject
                }
            });
        }
    }

    if (io) {
        io.emit('ticket:updated', updated);
        if (isResolving) {
            io.emit('ticket:resolved', updated);
        }
    }

    sendTelegramSupportAlert(
        `${isResolving ? '✅' : '🔄'} <b>ACTUALIZACIÓN DE TICKET (${updated.ticket_code})</b>\n` +
        `📌 <b>Asunto:</b> ${updated.subject}\n` +
        `📊 <b>Nuevo Estado:</b> ${statusLabelMap[nextStatus] || nextStatus}\n` +
        `👨‍💻 <b>Por:</b> ${actorName}\n` +
        (isResolving && finalNotes ? `🛠️ <b>Solución:</b> ${finalNotes}` : '')
    );

    return updated;
};

const addTicketMessage = async (
    id,
    { senderUserId = null, senderName = 'Usuario', senderRole = 'user', source = 'web', message, attachmentBase64 = null, io = null }
) => {
    const { pool } = await getTicketPool();
    const current = await getTicketById(id);
    if (!current) return null;

    const attachmentUrl = attachmentBase64 ? saveBase64Screenshot(attachmentBase64, `ticket-reply-${id}`) : null;
    const senderTypeVal = senderRole === 'user' ? 'user' : (source === 'telegram' ? 'telegram' : 'tech');
    try {
        await pool.query(
            `INSERT INTO support_ticket_messages
             (ticket_id, sender_type, sender_id, sender_user_id, sender_name, sender_role, source, message, attachment_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, senderTypeVal, senderUserId, senderUserId, senderName, senderRole, source, message, attachmentUrl]
        );
    } catch (_) {
        await pool.query(
            `INSERT INTO support_ticket_messages
             (ticket_id, sender_type, sender_id, sender_name, message, attachment_url)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, senderTypeVal, senderUserId, senderName, message, attachmentUrl]
        );
    }

    await pool.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = ?`, [id]);

    const updated = await getTicketById(id);

    const targetAdminUserId = await resolveTargetAdminUserId(updated);
    if (targetAdminUserId && Number(targetAdminUserId) !== Number(senderUserId)) {
        await createAndEmitAdminNotification({
            io,
            userId: targetAdminUserId,
            type: 'ticket_comment',
            title: `💬 Respuesta en Ticket #${updated.ticket_code}`,
            message: `${senderName}: ${String(message || '').slice(0, 140)}`,
            data: {
                ticket_id: updated.id,
                ticket_code: updated.ticket_code,
                status: updated.status,
                subject: updated.subject
            }
        });
    }

    if (io) {
        io.emit('ticket:message', { ticketId: Number(id), ticket: updated });
        io.emit('ticket:updated', updated);
    }

    if (senderRole === 'user') {
        sendTelegramSupportAlert(
            `💬 <b>NUEVO COMENTARIO EN TICKET #${updated.ticket_code}</b>\n` +
            `🌐 <b>Proyecto:</b> <code>admin.sipesv.com</code>\n` +
            `📌 <b>Asunto:</b> ${updated.subject}\n` +
            `👤 <b>Usuario:</b> ${senderName}\n\n` +
            `"${String(message || '').slice(0, 400)}"`,
            { ticketId: updated.id, status: updated.status }
        );
    }

    return updated;
};

const getPendingResolvedForUser = async (userId, userName = null, username = null) => {
    if (!userId) return [];
    const { pool } = await getTicketPool();
    const userConds = [];
    const params = [];
    if (hasTicketCol(pool, 'admin_user_id')) {
        userConds.push('t.admin_user_id = ?');
        params.push(Number(userId));
    }
    if (hasTicketCol(pool, 'source_system')) {
        userConds.push("(t.source_system = 'admin.sipesv.com' AND t.user_id = ?)");
        params.push(Number(userId));
    } else {
        userConds.push('t.user_id = ?');
        params.push(Number(userId));
    }
    if (userName) {
        userConds.push('LOWER(t.user_name) = LOWER(?)');
        params.push(String(userName));
    }
    if (username && username !== userName) {
        userConds.push('LOWER(t.user_name) = LOWER(?)');
        params.push(String(username));
    }

    const [rows] = await pool.query(
        `SELECT t.*
         FROM support_tickets t
         WHERE (${userConds.join(' OR ')})
           AND t.status = 'resuelto'
           AND t.creator_notified_at IS NULL
         ORDER BY t.resolved_at DESC, t.updated_at DESC
         LIMIT 5`,
        params
    );
    return (rows || []).map(enrichTicketRow);
};

const acknowledgeResolution = async (id, userId, userName = null, username = null) => {
    const { pool } = await getTicketPool();
    const userConds = [];
    const params = [Number(id)];
    if (hasTicketCol(pool, 'admin_user_id')) {
        userConds.push('admin_user_id = ?');
        params.push(Number(userId || 0));
    }
    userConds.push('user_id = ?');
    params.push(Number(userId || 0));
    if (userName) {
        userConds.push('LOWER(user_name) = LOWER(?)');
        params.push(String(userName));
    }
    if (username && username !== userName) {
        userConds.push('LOWER(user_name) = LOWER(?)');
        params.push(String(username));
    }

    const [res] = await pool.query(
        `UPDATE support_tickets
         SET creator_notified_at = NOW()
         WHERE id = ? AND (${userConds.join(' OR ')})`,
        params
    );
    return res.affectedRows > 0;
};

const updateTicketAiReview = async (
    id,
    { includeInAiPrompt = undefined, aiNotes = undefined, customLogs = undefined, aiMode = undefined, agentPlatform = undefined }
) => {
    const { pool } = await getTicketPool();
    const sets = [];
    const params = [];
    if (includeInAiPrompt !== undefined && hasTicketCol(pool, 'include_in_ai_prompt')) {
        sets.push('include_in_ai_prompt = ?');
        params.push(includeInAiPrompt ? 1 : 0);
    }
    if (aiNotes !== undefined && hasTicketCol(pool, 'ai_notes')) {
        sets.push('ai_notes = ?');
        params.push(aiNotes ? String(aiNotes).trim() : null);
    }
    if (customLogs !== undefined && hasTicketCol(pool, 'custom_logs')) {
        sets.push('custom_logs = ?');
        params.push(customLogs ? String(customLogs).trim() : null);
    }
    if (aiMode !== undefined && hasTicketCol(pool, 'ai_mode')) {
        sets.push('ai_mode = ?');
        params.push(aiMode === 'internal_api' ? 'internal_api' : 'agent_prompt');
    }
    if (agentPlatform !== undefined && hasTicketCol(pool, 'agent_platform')) {
        sets.push('agent_platform = ?');
        params.push(String(agentPlatform || 'antigravity').slice(0, 40));
    }
    if (sets.length === 0) return getTicketById(id);

    params.push(id);
    try {
        await pool.query(`UPDATE support_tickets SET ${sets.join(', ')} WHERE id = ?`, params);
    } catch (_) {
        // Fallback a solo columnas base v297 si alguna columna extendida no existe
        const fallbackSets = [];
        const fallbackParams = [];
        if (includeInAiPrompt !== undefined) {
            fallbackSets.push('include_in_ai_prompt = ?');
            fallbackParams.push(includeInAiPrompt ? 1 : 0);
        }
        if (aiNotes !== undefined) {
            fallbackSets.push('ai_notes = ?');
            fallbackParams.push(aiNotes ? String(aiNotes).trim() : null);
        }
        if (fallbackSets.length > 0) {
            fallbackParams.push(id);
            await pool.query(`UPDATE support_tickets SET ${fallbackSets.join(', ')} WHERE id = ?`, fallbackParams);
        }
    }
    return getTicketById(id);
};

const buildAiPromptPackage = (tickets = [], { extraContext = '', agentPlatform = 'antigravity', aiMode = 'agent_prompt' } = {}) => {
    const nowStr = new Date().toLocaleString('es-SV', { timeZone: 'America/El_Salvador' });
    const lines = [
        `# 🛠️ PAQUETE DE TICKETS DE SOPORTE PARA RESOLUCIÓN CON IA (SIPE ADMIN / SAAS)`,
        `> **Generado:** ${nowStr}`,
        `> **Total de tickets en este lote:** ${tickets.length}`,
        `> **Modo de Ejecución:** ${aiMode === 'internal_api' ? 'Modo 1 — API Interna Autónoma' : `Modo 2 — Prompt + Logs (${agentPlatform.toUpperCase()})`}`,
        ``
    ];

    if (extraContext && String(extraContext).trim()) {
        lines.push(`## 📌 INSTRUCCIÓN GLOBAL DEL ADMINISTRADOR`);
        lines.push(String(extraContext).trim());
        lines.push(``);
    }

    tickets.forEach((t, index) => {
        lines.push(`---`);
        lines.push(`## ${index + 1}. [${t.ticket_code}] ${t.subject}`);
        lines.push(`- **ID Interno:** \`${t.id}\``);
        lines.push(`- **Tipo / Prioridad:** \`${t.type}\` / \`${String(t.priority).toUpperCase()}\``);
        lines.push(`- **Módulo / Ruta:** ${t.module_name || 'General'} (\`${t.page_url || 'N/A'}\`)`);
        lines.push(`- **Reportado por:** ${t.user_name} (${t.company_name || 'SIPE Admin'})`);
        lines.push(``);
        lines.push(`### 📝 Descripción del Usuario`);
        lines.push(t.description || '_Sin descripción_');
        lines.push(``);
        if (t.ai_notes && String(t.ai_notes).trim()) {
            lines.push(`### 🎯 Directriz Técnica para la IA`);
            lines.push(`> ${String(t.ai_notes).trim().replace(/\n/g, '\n> ')}`);
            lines.push(``);
        }
        if (t.custom_logs && String(t.custom_logs).trim()) {
            lines.push(`### 📋 Logs Adjuntos`);
            lines.push('```text');
            lines.push(String(t.custom_logs).trim().slice(0, 4000));
            lines.push('```');
            lines.push(``);
        }
    });

    return lines.join('\n');
};

const getAiBundleTickets = async ({ ticketIds = null } = {}) => {
    const { pool } = await getTicketPool();
    const where = ['1=1'];
    const params = [];
    if (Array.isArray(ticketIds) && ticketIds.length > 0) {
        where.push(`t.id IN (${ticketIds.map(() => '?').join(',')})`);
        params.push(...ticketIds.map((n) => Number(n)));
    } else {
        where.push("t.include_in_ai_prompt = 1 AND t.status IN ('abierto', 'en_proceso')");
    }
    const [rows] = await pool.query(
        `SELECT t.* FROM support_tickets t WHERE ${where.join(' AND ')} ORDER BY t.created_at ASC`,
        params
    );
    return (rows || []).map(enrichTicketRow);
};

const saveAndGenerateAiBundle = async ({ items = [], extraContext = '', aiMode = 'agent_prompt', agentPlatform = 'antigravity' }) => {
    const { pool } = await getTicketPool();
    const ids = [];
    for (const item of items) {
        if (!item || !item.id) continue;
        ids.push(Number(item.id));
        await updateTicketAiReview(item.id, {
            includeInAiPrompt: item.include_in_ai_prompt !== undefined ? item.include_in_ai_prompt : 1,
            aiNotes: item.ai_notes,
            customLogs: item.custom_logs,
            aiMode,
            agentPlatform
        });
    }
    const tickets = await getAiBundleTickets({ ticketIds: ids.length > 0 ? ids : null });
    if (tickets.length > 0) {
        const ticketIds = tickets.map((t) => t.id);
        const setBundled = hasTicketCol(pool, 'ai_bundled_at')
            ? "ai_bundled_at = NOW(), status = CASE WHEN status = 'abierto' THEN 'en_proceso' ELSE status END"
            : "status = CASE WHEN status = 'abierto' THEN 'en_proceso' ELSE status END";
        try {
            await pool.query(
                `UPDATE support_tickets SET ${setBundled} WHERE id IN (${ticketIds.map(() => '?').join(',')})`,
                ticketIds
            );
        } catch (_) {
            await pool.query(
                `UPDATE support_tickets SET status = CASE WHEN status = 'abierto' THEN 'en_proceso' ELSE status END WHERE id IN (${ticketIds.map(() => '?').join(',')})`,
                ticketIds
            );
        }
    }
    const promptMarkdown = buildAiPromptPackage(tickets, { extraContext, agentPlatform, aiMode });
    return {
        tickets,
        promptMarkdown,
        count: tickets.length
    };
};

const autoTriageTicketsForAi = async () => {
    const { pool } = await getTicketPool();
    const [rows] = await pool.query(
        `SELECT * FROM support_tickets WHERE status IN ('abierto', 'en_proceso') ORDER BY created_at DESC LIMIT 25`
    );
    const triaged = [];
    for (const r of rows) {
        const autoNote = r.ai_notes || `Revisar ruta ${r.page_url || '/dashboard'} (${r.module_name || 'SIPE Admin'}) y validar flujo reportado.`;
        await pool.query(
            `UPDATE support_tickets SET include_in_ai_prompt = 1, ai_notes = ? WHERE id = ?`,
            [autoNote, r.id]
        );
        triaged.push({ id: r.id, ticket_code: r.ticket_code, ai_notes: autoNote });
    }
    return { count: triaged.length, triaged };
};

const resolveAiBundleBatch = async ({ ticketIds = [], resolutionNotes = '', resolvedVersion = null, actorId = null, actorName = 'Soporte IA', io = null }) => {
    const resolvedTickets = [];
    for (const rawId of ticketIds) {
        const id = Number(rawId);
        if (!id) continue;
        const current = await getTicketById(id);
        if (!current) continue;
        const noteToUse = (resolutionNotes && String(resolutionNotes).trim())
            ? String(resolutionNotes).trim()
            : (current.ai_notes ? `Resuelto: ${current.ai_notes}` : 'Atendido y resuelto por el equipo técnico.');
        const updated = await updateTicketStatus(id, {
            status: 'resuelto',
            resolutionNotes: noteToUse,
            resolvedVersion,
            actorId,
            actorName,
            source: 'web',
            io
        });
        await updateTicketAiReview(id, { includeInAiPrompt: 0 });
        if (updated) resolvedTickets.push(updated);
    }
    return resolvedTickets;
};

const getAgySettings = async () => {
    const { pool } = await getTicketPool();
    const [rows] = await pool.query('SELECT * FROM agy_server_settings WHERE id = 1 LIMIT 1');
    const cfg = rows?.[0] || {
        ssh_host: '5.252.55.29',
        ssh_port: 22,
        ssh_user: 'root',
        project_path: '/var/www/sipeadmin',
        agy_command: 'agy',
        default_model: 'gemini-4-argon-high',
        execution_mode: 'auto'
    };
    const { ssh_password, ...safeCfg } = cfg;
    return {
        ...safeCfg,
        ssh_password: '',
        has_ssh_password: Boolean(ssh_password),
        available_models: [
            { id: 'gemini-4-argon-high', label: 'gemini-4-argon-high (Máxima Velocidad e Inteligencia)' },
            { id: 'gemini-3.1-pro', label: 'gemini-3.1-pro (Razonamiento Profundo)' },
            { id: 'gemini-3-flash', label: 'gemini-3-flash (Ultra Rápido)' }
        ]
    };
};

const saveAgySettings = async (payload = {}) => {
    const { pool } = await getTicketPool();
    await pool.query(
        `INSERT INTO agy_server_settings (id, ssh_host, ssh_port, ssh_user, ssh_password, project_path, agy_command, default_model, execution_mode)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            ssh_host = VALUES(ssh_host),
            ssh_port = VALUES(ssh_port),
            ssh_user = VALUES(ssh_user),
            ssh_password = COALESCE(NULLIF(VALUES(ssh_password), ''), ssh_password),
            project_path = VALUES(project_path),
            agy_command = VALUES(agy_command),
            default_model = VALUES(default_model),
            execution_mode = VALUES(execution_mode)`,
        [
            payload.ssh_host || '5.252.55.29',
            Number(payload.ssh_port) || 22,
            payload.ssh_user || 'root',
            payload.ssh_password || null,
            payload.project_path || '/var/www/sipeadmin',
            payload.agy_command || 'agy',
            payload.default_model || 'gemini-4-argon-high',
            payload.execution_mode || 'auto'
        ]
    );
    return getAgySettings();
};

const approveAndGeneratePlan = async (id, { model = 'gemini-4-argon-high', aiNotes = '', feedbackComment = '', actorName = 'Administrador', io = null }) => {
    const { pool } = await getTicketPool();
    const ticket = await getTicketById(id);
    if (!ticket) throw new Error('Ticket no encontrado');

    const nextVersion = Number(ticket.agy_plan_version || 0) + 1;
    const planMd = [
        `# 📋 PLAN DE EJECUCIÓN AGY v${nextVersion} — ${ticket.ticket_code}`,
        `- **Modelo:** ${model}`,
        `- **Asunto:** ${ticket.subject}`,
        `- **Módulo / Ruta:** ${ticket.module_name || 'SIPE Admin'} (${ticket.page_url || '/dashboard'})`,
        aiNotes ? `- **Directriz Técnica:** ${aiNotes}` : null,
        feedbackComment ? `- **Observaciones / Feedback:** ${feedbackComment}` : null,
        ``,
        `## Pasos Propuestos`,
        `1. Inspeccionar componente y controlador asociado a \`${ticket.page_url || '/dashboard'}\`.`,
        `2. Aplicar ajuste solicitado en "${ticket.subject}" respetando reglas de SIPE Admin.`,
        `3. Ejecutar pruebas automatizadas y validar compilación antes de notificar al usuario.`
    ].filter(Boolean).join('\n');

    await pool.query(
        `UPDATE support_tickets
         SET status = CASE WHEN status = 'abierto' THEN 'en_proceso' ELSE status END,
             ai_notes = COALESCE(NULLIF(?, ''), ai_notes),
             agy_status = 'esperando_aprobacion',
             agy_model = ?,
             agy_plan_markdown = ?,
             agy_approved_by = ?,
             agy_plan_version = ?,
             agy_updated_at = NOW()
         WHERE id = ?`,
        [aiNotes, model, planMd, actorName, nextVersion, id]
    );

    const updated = await getTicketById(id);
    if (io) io.emit('ticket:updated', updated);

    sendTelegramSupportAlert(
        `🤖 <b>PLAN DE EJECUCIÓN AGY (v${nextVersion}) — #${updated.ticket_code}</b>\n` +
        `🌐 <b>Proyecto:</b> <code>admin.sipesv.com (SIPE Admin)</code>\n` +
        `🖥️ <b>Entorno:</b> <code>Consola AGY</code>  |  🧠 <b>Modelo:</b> <code>${model}</code>\n` +
        `📌 <b>Asunto:</b> ${updated.subject}\n` +
        `📂 <b>Módulo / Ruta:</b> ${updated.module_name || 'SIPE Admin'} (<code>${updated.page_url || '/dashboard'}</code>)\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${planMd}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👇 <b>Selecciona una decisión para la Consola AGY:</b>`,
        { replyMarkup: buildAgyPlanApprovalKeyboard(updated.id) }
    );

    return updated;
};

const executeApprovedPlan = async (id, { actorName = 'Administrador', io = null } = {}) => {
    const { pool } = await getTicketPool();
    const logLine = `[${new Date().toISOString()}] Plan aprobado y enviado a ejecución por ${actorName}.`;
    await pool.query(
        `UPDATE support_tickets
         SET agy_status = 'completado',
             agy_execution_log = CONCAT(COALESCE(agy_execution_log, ''), '\n', ?),
             agy_updated_at = NOW()
         WHERE id = ?`,
        [logLine, id]
    );
    const updated = await getTicketById(id);
    if (io) io.emit('ticket:updated', updated);

    sendTelegramSupportAlert(
        `✅ <b>PLAN AGY APROBADO — #${updated.ticket_code}</b>\n` +
        `🌐 <b>Proyecto:</b> <code>admin.sipesv.com (SIPE Admin)</code>\n` +
        `📌 <b>Asunto:</b> ${updated.subject}\n` +
        `👤 <b>Aprobado por:</b> ${actorName}`,
        { replyMarkup: buildInteractiveTicketKeyboard(updated.id, updated.status) }
    );

    return updated;
};

const rejectPlan = async (id, { reason = 'Denegado por administrador', actorName = 'Administrador', io = null } = {}) => {
    const { pool } = await getTicketPool();
    const logLine = `[${new Date().toISOString()}] Plan denegado por ${actorName}: ${reason}`;
    await pool.query(
        `UPDATE support_tickets
         SET agy_status = 'denegado',
             agy_execution_log = CONCAT(COALESCE(agy_execution_log, ''), '\n', ?),
             agy_updated_at = NOW()
         WHERE id = ?`,
        [logLine, id]
    );
    const updated = await getTicketById(id);
    if (io) io.emit('ticket:updated', updated);

    sendTelegramSupportAlert(
        `❌ <b>PLAN AGY DENEGADO — #${updated.ticket_code}</b>\n` +
        `🌐 <b>Proyecto:</b> <code>admin.sipesv.com (SIPE Admin)</code>\n` +
        `📌 <b>Asunto:</b> ${updated.subject}\n` +
        `👤 <b>Por:</b> ${actorName}\n` +
        `📝 <b>Motivo:</b> ${reason}`,
        { replyMarkup: buildInteractiveTicketKeyboard(updated.id, updated.status) }
    );

    return updated;
};

/**
 * Vigilante de sincronización en tiempo real entre `sys.sipesv.com` y `admin.sipesv.com`.
 * Si un técnico en `sys.sipesv.com` (o desde Telegram) cambia un ticket a `en_proceso`, `abierto` o `resuelto`,
 * detecta el cambio y emite las notificaciones Socket.io y campana en `admin.sipesv.com`.
 */
const knownTicketStateCache = new Map();
let watcherBootstrapped = false;

const syncRealtimeTicketUpdates = async (io) => {
    try {
        const { pool } = await getTicketPool();
        const [rows] = await pool.query(
            `SELECT *
             FROM support_tickets
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             ORDER BY updated_at DESC
             LIMIT 100`
        );

        for (const r of rows || []) {
            const id = Number(r.id);
            const prev = knownTicketStateCache.get(id);
            const currState = {
                status: r.status,
                updatedAt: String(r.updated_at || ''),
                resolvedAt: String(r.resolved_at || '')
            };

            if (!watcherBootstrapped) {
                knownTicketStateCache.set(id, currState);
                continue;
            }

            if (!prev) {
                knownTicketStateCache.set(id, currState);
                if (io) {
                    const fullNewTicket = await getTicketById(id);
                    if (fullNewTicket) {
                        io.emit('ticket:created', fullNewTicket);
                    }
                }
                continue;
            }

            if (prev.status !== currState.status) {
                knownTicketStateCache.set(id, currState);
                const fullTicket = await getTicketById(id);
                const targetAdminUserId = await resolveTargetAdminUserId(fullTicket || r);

                if (targetAdminUserId) {
                    if (currState.status === 'resuelto') {
                        await createAndEmitAdminNotification({
                            io,
                            userId: targetAdminUserId,
                            type: 'ticket_resolved',
                            title: `✅ ¡Ticket #${r.ticket_code} Resuelto!`,
                            message: `${r.subject} — ${r.resolution_notes || 'Tu ticket ha sido resuelto en sys.sipesv.com.'}`,
                            data: {
                                ticket_id: id,
                                ticket_code: r.ticket_code,
                                status: 'resuelto',
                                subject: r.subject,
                                resolution_notes: r.resolution_notes
                            }
                        });
                        if (io && fullTicket) {
                            io.to(`user_${targetAdminUserId}`).emit('ticket:resolved', fullTicket);
                        }
                    } else if (currState.status === 'en_proceso' || currState.status === 'abierto') {
                        const label = currState.status === 'en_proceso' ? 'En Proceso' : 'Pendiente (Abierto)';
                        await createAndEmitAdminNotification({
                            io,
                            userId: targetAdminUserId,
                            type: 'ticket_pending',
                            title: `⏳ Ticket #${r.ticket_code}: ${label}`,
                            message: `Tu ticket "${r.subject}" está ${label} en soporte técnico.`,
                            data: {
                                ticket_id: id,
                                ticket_code: r.ticket_code,
                                status: currState.status,
                                subject: r.subject
                            }
                        });
                    }
                }

                if (io && fullTicket) {
                    io.emit('ticket:updated', fullTicket);
                    if (currState.status === 'resuelto') {
                        io.emit('ticket:resolved', fullTicket);
                    }
                }
            } else if (prev.updatedAt !== currState.updatedAt) {
                knownTicketStateCache.set(id, currState);
                if (io) {
                    const fullTicket = await getTicketById(id);
                    if (fullTicket) {
                        io.emit('ticket:updated', fullTicket);
                    }
                }
            }
        }
        watcherBootstrapped = true;
    } catch (_) {
        // Ignorar errores transitorios de red/BD en el poller
    }
};

let watcherIntervalId = null;
const initTicketRealtimeWatcher = (io) => {
    if (watcherIntervalId) clearInterval(watcherIntervalId);
    // Primera carga inmediata para poblar estado base
    syncRealtimeTicketUpdates(io);
    watcherIntervalId = setInterval(() => {
        syncRealtimeTicketUpdates(io);
    }, 12000);
    if (watcherIntervalId.unref) watcherIntervalId.unref();
};

module.exports = {
    UPLOADS_DIR,
    SIBLING_SAAS_UPLOADS,
    getTicketPool,
    ensureTicketSchema,
    saveBase64Screenshot,
    createTicket,
    getTickets,
    getTicketStats,
    getTicketById,
    updateTicketStatus,
    updateTicketAiReview,
    getAiBundleTickets,
    saveAndGenerateAiBundle,
    autoTriageTicketsForAi,
    resolveAiBundleBatch,
    addTicketMessage,
    getPendingResolvedForUser,
    acknowledgeResolution,
    getAgySettings,
    saveAgySettings,
    approveAndGeneratePlan,
    executeApprovedPlan,
    rejectPlan,
    syncRealtimeTicketUpdates,
    initTicketRealtimeWatcher
};
