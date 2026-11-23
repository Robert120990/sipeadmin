const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);

const { getFlujoCajaProyectado } = require('./cashflowForecast');
const { getRiesgoCreditoFlotas } = require('./creditRiskService');
const { sendTelegramMessage } = require('./telegramTransportService');
const {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr
} = require('./telegramTextAndDates');

const CHEQUE_APPROVAL_THRESHOLD_USD = Number(process.env.TELEGRAM_CHEQUE_APPROVAL_THRESHOLD || 5000);
const ensuredApprovalPools = new WeakSet();

/**
 * Crea de forma idempotente la tabla de aprobaciones gerenciales vía Telegram.
 */
async function ensureApprovalsSchema(db) {
    if (!db || typeof db.query !== 'function') return;
    if (ensuredApprovalPools.has(db)) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS telegram_aprobaciones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            tipo VARCHAR(40) NOT NULL,
            entidad_id VARCHAR(64) NOT NULL,
            titulo VARCHAR(200) NOT NULL,
            resumen TEXT NULL,
            monto_usd DECIMAL(14,2) NOT NULL DEFAULT 0.00,
            empresa_nombre VARCHAR(150) NULL,
            solicitado_por_user_id INT NULL,
            solicitado_por_nombre VARCHAR(150) NULL,
            estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
            resuelto_por_telegram_id VARCHAR(64) NULL,
            resuelto_por_user_id INT NULL,
            resuelto_por_nombre VARCHAR(150) NULL,
            resuelto_at DATETIME NULL,
            metadata_json LONGTEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_tg_apr_estado (estado, created_at),
            KEY idx_tg_apr_tipo_entidad (tipo, entidad_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ensuredApprovalPools.add(db);
}

// =========================================================================
// 1. CONSULTAS FINANCIERAS EJECUTIVAS (/flujo, /prestamos, /creditos)
// =========================================================================

async function getFlujoResumenData({ horizon = 30, forecastFn = null } = {}) {
    const cleanHorizon = Number(horizon) === 60 ? 60 : 30;
    const executor = forecastFn || getFlujoCajaProyectado;
    const data = await executor(cleanHorizon);
    return {
        horizon: cleanHorizon,
        ...data
    };
}

function formatFlujoMessage(data = {}) {
    const kpi = data.kpi || {};
    const horizon = data.horizonte_dias || data.horizon || 30;
    const brechas = Array.isArray(data.brechas_liquidez) ? data.brechas_liquidez : [];
    const recs = Array.isArray(data.recomendaciones) ? data.recomendaciones : [];
    const salud = String(kpi.salud_flujo || 'SALUDABLE').toUpperCase();
    const saludIcon = salud === 'CRÍTICO' || salud === 'CRITICO' ? '🔴' : (salud === 'PRECAUCIÓN' || salud === 'PRECAUCION' ? '🟡' : '🟢');

    let msg = `📈 <b>FLUJO DE CAJA PROYECTADO (${horizon} DÍAS)</b>\n`;
    msg += `📅 <b>Corte:</b> ${toDisplayDate(data.fecha_generacion || getDateStr(0))}\n`;
    msg += `📊 <b>Salud del Flujo:</b> ${saludIcon} <b>${escapeHtml(salud)}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `💰 <b>RESUMEN FINANCIERO DEL PERÍODO:</b>\n`;
    msg += `• <b>Saldo Inicial en Bancos:</b> <b>${moneyFmt(kpi.saldo_inicial_bancos || 0)}</b>\n`;
    msg += `• <b>Ingresos Proyectados:</b> <code>+${moneyFmt(kpi.total_ingresos_proyectados || 0)}</code>\n`;
    msg += `• <b>Egresos Proyectados:</b> <code>-${moneyFmt(kpi.total_egresos_proyectados || 0)}</code>\n`;
    msg += `• <b>Saldo Mínimo Proyectado:</b> <b>${moneyFmt(kpi.saldo_minimo_proyectado || 0)}</b>`;
    if (kpi.fecha_saldo_minimo) msg += ` (<i>${toDisplayDate(kpi.fecha_saldo_minimo)}</i>)`;
    msg += `\n`;

    if (Number(kpi.compromisos_puma_pendientes_usd || 0) > 0 || Number(kpi.compromisos_control_pagos_cxp_usd || 0) > 0) {
        msg += `\n🧾 <b>COMPROMISOS CONSIDERADOS:</b>\n`;
        if (Number(kpi.compromisos_puma_pendientes_usd || 0) > 0) {
            msg += `   • Facturas Puma: <code>${moneyFmt(kpi.compromisos_puma_pendientes_usd)}</code>\n`;
        }
        if (Number(kpi.compromisos_control_pagos_cxp_usd || 0) > 0) {
            msg += `   • Control de Pagos (CXP): <code>${moneyFmt(kpi.compromisos_control_pagos_cxp_usd)}</code>\n`;
        }
        if (Number(kpi.compromisos_control_pagos_cxc_usd || 0) > 0) {
            msg += `   • Control de Pagos (CXC a favor): <code>${moneyFmt(kpi.compromisos_control_pagos_cxc_usd)}</code>\n`;
        }
    }

    if (brechas.length > 0) {
        msg += `\n🚨 <b>BRECHAS DE LIQUIDEZ (${kpi.dias_con_deficit || brechas.length} días):</b>\n`;
        brechas.slice(0, 4).forEach(b => {
            msg += `• <code>${toDisplayDate(b.fecha)}</code>: <b>-${moneyFmt(b.deficit || 0)}</b> — ${escapeHtml(b.causa_principal || 'Déficit')}\n`;
        });
    } else {
        msg += `\n✅ <b>Cobertura Solvente:</b> Sin días en déficit durante los próximos ${horizon} días.\n`;
    }

    if (recs.length > 0 && recs[0].detalle) {
        msg += `\n💡 <b>Recomendación:</b> <i>${escapeHtml(recs[0].detalle)}</i>\n`;
    }

    msg += `\n<i>SIPE Admin • Finanzas y Tesorería</i>`;
    return msg;
}

function getFlujoInlineMarkup(horizon = 30) {
    const h = Number(horizon) === 60 ? 60 : 30;
    return {
        inline_keyboard: [
            [
                { text: h === 30 ? '✅ Flujo 30 días' : '📈 Flujo 30 días', callback_data: 'tg_fin:flujo:30' },
                { text: h === 60 ? '✅ Flujo 60 días' : '📆 Flujo 60 días', callback_data: 'tg_fin:flujo:60' }
            ],
            [
                { text: '📊 Ver Gráfica Flujo', callback_data: 'tg_chr:flujo' },
                { text: '🛡️ Centinela Liquidez', callback_data: 'tg_sent:refresh' }
            ]
        ]
    };
}

/**
 * Consulta consolidada de préstamos bancarios de SIPE Admin.
 */
async function getPrestamosResumenData({ db = null, estado = 'activo' } = {}) {
    const activeDb = db || getDb();
    if (!activeDb || typeof activeDb.query !== 'function') {
        throw new Error('Base de datos no disponible para consultar préstamos');
    }

    const cleanEstado = estado === 'todos' ? 'todos' : 'activo';
    let query = `
        SELECT
            p.id,
            p.numero_prestamo,
            p.descripcion,
            p.estado,
            p.monto_original,
            p.tasa_interes_anual,
            COALESCE(p.cuota_total, p.cuota_calculada, 0) AS cuota_total,
            COALESCE(DAY(p.fecha_primer_pago), 15) AS dia_pago,
            e.nombre AS empresa_nombre,
            b.descripcion AS banco_nombre,
            COALESCE(SUM(pp.monto_capital), 0) AS total_capital_pagado,
            COALESCE(SUM(pp.monto_total), 0) AS total_pagado,
            (p.monto_original - COALESCE(SUM(pp.monto_capital), 0)) AS saldo_actual
        FROM prestamos p
        LEFT JOIN empresas e ON p.empresa_id = e.id
        LEFT JOIN bancos b ON p.banco_id = b.id
        LEFT JOIN prestamos_pagos pp ON p.id = pp.prestamo_id
        WHERE 1=1
    `;
    const params = [];
    if (cleanEstado !== 'todos') {
        query += ' AND p.estado = ?';
        params.push(cleanEstado);
    }
    query += ' GROUP BY p.id ORDER BY saldo_actual DESC, p.id DESC';

    const [rows] = await activeDb.query(query, params);
    const prestamos = (rows || []).map(r => {
        const orig = Number(r.monto_original || 0);
        const saldo = Math.max(0, Math.round(Number(r.saldo_actual !== undefined ? r.saldo_actual : orig) * 100) / 100);
        const pct = orig > 0 ? Math.min(100, Math.round(((orig - saldo) / orig) * 1000) / 10) : 0;
        return {
            id: Number(r.id),
            numero_prestamo: r.numero_prestamo || `#${r.id}`,
            descripcion: r.descripcion || 'Préstamo Bancario',
            estado: r.estado || 'activo',
            empresa_nombre: r.empresa_nombre || 'SIPE',
            banco_nombre: r.banco_nombre || 'Banco',
            monto_original: Math.round(orig * 100) / 100,
            saldo_actual: saldo,
            cuota_mensual: Math.round(Number(r.cuota_total || 0) * 100) / 100,
            tasa_interes_anual: Number(r.tasa_interes_anual || 0),
            dia_pago: Number(r.dia_pago || 15),
            porcentaje_amortizado: pct
        };
    });

    const activos = prestamos.filter(p => String(p.estado).toLowerCase() === 'activo');
    const saldoTotalUsd = Math.round(prestamos.reduce((s, p) => s + p.saldo_actual, 0) * 100) / 100;
    const cuotaMensualUsd = Math.round(activos.reduce((s, p) => s + p.cuota_mensual, 0) * 100) / 100;
    const origTotal = prestamos.reduce((s, p) => s + p.monto_original, 0);
    const pctAmortizadoProm = origTotal > 0 ? Math.round(((origTotal - saldoTotalUsd) / origTotal) * 1000) / 10 : 0;

    return {
        estado: cleanEstado,
        cantidad: prestamos.length,
        saldo_total_usd: saldoTotalUsd,
        cuota_mensual_usd: cuotaMensualUsd,
        porcentaje_amortizado: pctAmortizadoProm,
        prestamos
    };
}

function formatPrestamosMessage(data = {}) {
    const items = Array.isArray(data.prestamos) ? data.prestamos : [];
    const label = data.estado === 'todos' ? 'HISTÓRICO COMPLETO' : 'ACTIVOS VIGENTES';

    let msg = `🏛️ <b>CARTERA DE PRÉSTAMOS BANCARIOS</b> (${label})\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 <b>Saldo Total Adeudado:</b> <b>${moneyFmt(data.saldo_total_usd || 0)}</b>\n`;
    msg += `📅 <b>Cuotas Mensuales Activas:</b> <code>${moneyFmt(data.cuota_mensual_usd || 0)}/mes</code>\n`;
    msg += `📊 <b>Amortización Global:</b> <code>${Number(data.porcentaje_amortizado || 0).toFixed(1)}%</code> (${data.cantidad || 0} créditos)\n\n`;

    if (items.length === 0) {
        msg += `✅ <i>No se encontraron préstamos registrados para el filtro seleccionado.</i>\n`;
    } else {
        msg += `📋 <b>DETALLE POR OBLIGACIÓN (${Math.min(items.length, 10)}):</b>\n`;
        items.slice(0, 10).forEach((p, idx) => {
            const stIcon = String(p.estado).toLowerCase() === 'activo' ? '🟢' : '⚪';
            msg += `${idx + 1}. ${stIcon} <b>${escapeHtml(p.banco_nombre)}</b> · ${escapeHtml(p.numero_prestamo)}\n`;
            msg += `   └ ${escapeHtml(p.empresa_nombre)} | Saldo: <b>${moneyFmt(p.saldo_actual)}</b> | Cuota: <code>${moneyFmt(p.cuota_mensual)}</code> (día ${p.dia_pago}) | ${p.porcentaje_amortizado}%\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Finanzas y Obligaciones</i>`;
    return msg;
}

function getPrestamosInlineMarkup(estado = 'activo') {
    const isAll = estado === 'todos';
    return {
        inline_keyboard: [
            [
                { text: !isAll ? '✅ Activos' : '🟢 Ver Activos', callback_data: 'tg_fin:prest:activo' },
                { text: isAll ? '✅ Todos' : '📋 Ver Todos', callback_data: 'tg_fin:prest:todos' }
            ],
            [
                { text: '📈 Flujo de Caja', callback_data: 'tg_fin:flujo:30' },
                { text: '🛡️ Centinela Liquidez', callback_data: 'tg_sent:refresh' }
            ]
        ]
    };
}

/**
 * Consulta de riesgo crediticio de flotas y clientes corporativos.
 */
async function getCreditosResumenData({ filter = 'todos', creditRiskFn = null } = {}) {
    const cleanFilter = filter === 'critico' ? 'critico' : 'todos';
    const executor = creditRiskFn || getRiesgoCreditoFlotas;
    const raw = await executor();
    const allClientes = Array.isArray(raw?.clientes) ? raw.clientes : [];

    const filtered = cleanFilter === 'critico'
        ? allClientes.filter(c => c.nivel_riesgo === 'critico' || c.nivel_riesgo === 'advertencia' || Number(c.dias_mora || 0) > 0)
        : allClientes;

    const riskWeight = { critico: 3, advertencia: 2, bajo: 1 };
    const sorted = [...filtered].sort((a, b) =>
        (riskWeight[b.nivel_riesgo] || 0) - (riskWeight[a.nivel_riesgo] || 0) ||
        Number(b.saldo_pendiente || 0) - Number(a.saldo_pendiente || 0)
    );

    return {
        filter: cleanFilter,
        resumen_cartera: raw?.resumen_cartera || {},
        clientes: sorted
    };
}

function formatCreditosMessage(data = {}) {
    const res = data.resumen_cartera || {};
    const clientes = Array.isArray(data.clientes) ? data.clientes : [];
    const filterTag = data.filter === 'critico' ? 'MORA / RIESGO CRÍTICO' : 'CARTERA ACTIVA';

    let msg = `⛽ <b>CRÉDITOS DE FLOTAS Y RIESGO CREDITICIO</b> (${filterTag})\n`;
    msg += `📅 <b>Corte:</b> ${toDisplayDate(res.fecha_corte || getDateStr(0))}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `💰 <b>Cartera Activa Total:</b> <b>${moneyFmt(res.total_cartera_activa_usd || 0)}</b>\n`;
    msg += `🔴 <b>Saldo en Mora:</b> <b>${moneyFmt(res.total_saldo_vencido_usd || 0)}</b> (<code>${res.porcentaje_morosidad || 0}%</code>)\n`;
    msg += `🚨 <b>Clientes Críticos (Bloqueo):</b> <b>${res.clientes_criticos_para_bloqueo || 0}</b> de ${res.total_clientes_analizados || clientes.length}\n\n`;

    if (clientes.length === 0) {
        msg += `✅ <i>No hay clientes en condición crítica o morosidad bajo este filtro.</i>\n`;
    } else {
        msg += `📋 <b>PRINCIPALES CUENTAS (${Math.min(clientes.length, 10)}):</b>\n`;
        clientes.slice(0, 10).forEach((c, idx) => {
            const icon = c.nivel_riesgo === 'critico' ? '🔴' : (c.nivel_riesgo === 'advertencia' ? '🟡' : '🟢');
            const moraStr = Number(c.dias_mora || 0) > 0 ? ` · <b>${c.dias_mora}d mora</b>` : '';
            msg += `${idx + 1}. ${icon} <b>${escapeHtml(c.cliente || 'Cliente')}</b>\n`;
            msg += `   └ Saldo: <b>${moneyFmt(c.saldo_pendiente || 0)}</b> (${c.porcentaje_utilizado || 0}% límite)${moraStr}\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Gestión de Riesgo Crediticio</i>`;
    return msg;
}

function getCreditosInlineMarkup(filter = 'todos') {
    const isCrit = filter === 'critico';
    return {
        inline_keyboard: [
            [
                { text: isCrit ? '✅ Críticos / Mora' : '🚨 Ver Críticos / Mora', callback_data: 'tg_fin:cred:critico' },
                { text: !isCrit ? '✅ Cartera Completa' : '📋 Ver Todos', callback_data: 'tg_fin:cred:todos' }
            ]
        ]
    };
}

// =========================================================================
// 2. MOTOR DE APROBACIONES GERENCIALES (CHEQUES ALTOS Y PLANILLAS RRHH)
// =========================================================================

/**
 * Validación FAIL-CLOSED de autorización gerencial para aprobar o detener desembolsos.
 */
function canUserApproveFinancialOp(effPerms = {}) {
    if (!effPerms || effPerms.inactiveInSipe) return false;
    if (effPerms.isAdmin) return true;
    const roleName = String(effPerms.linkedUser?.role_name || '');
    if (/gerencia|director/i.test(roleName)) return true;
    const permsList = Array.isArray(effPerms.sipePermissions) ? effPerms.sipePermissions : [];
    return permsList.includes('approve_financial_ops') ||
        permsList.includes('manage_telegram') ||
        permsList.includes('/dashboard/seguridad/telegram');
}

/**
 * Obtiene usuarios activos de Telegram con facultad gerencial de aprobación.
 */
async function fetchAuthorizedApprovers(db) {
    if (!db || typeof db.query !== 'function') return [];
    try {
        const [users] = await db.query(`
            SELECT tu.*, u.status AS sipe_status, u.role_id AS sipe_role_id, r.name AS sipe_role_name,
                   GROUP_CONCAT(p.name) AS sipe_permissions
            FROM telegram_usuarios tu
            LEFT JOIN users u ON tu.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE tu.activo = 1
            GROUP BY tu.id
        `);

        const roleIds = [...new Set((users || []).map(u => Number(u.sipe_role_id)).filter(id => id > 0))];
        const permsByRole = {};
        if (roleIds.length > 0) {
            try {
                const [permRows] = await db.query(
                    'SELECT rp.role_id, p.name FROM role_permissions rp INNER JOIN permissions p ON rp.permission_id = p.id WHERE rp.role_id IN (?)',
                    [roleIds]
                );
                for (const pr of (permRows || [])) {
                    const rid = Number(pr.role_id);
                    if (!permsByRole[rid]) permsByRole[rid] = [];
                    if (pr.name) permsByRole[rid].push(String(pr.name).trim());
                }
            } catch (_) {
                // Fallback a GROUP_CONCAT en mocks
            }
        }

        return (users || []).filter(u => {
            if (!u.telegram_user_id) return false;
            if (!u.user_id) return false;
            if (u.sipe_status === 'inactive') return false;
            const isAdmin = Number(u.sipe_role_id) === 1 ||
                u.sipe_role_name === 'Administrator' ||
                u.sipe_role_name === 'Super Administrator';
            const directPerms = permsByRole[Number(u.sipe_role_id)];
            const perms = (Array.isArray(directPerms) && directPerms.length > 0)
                ? directPerms
                : String(u.sipe_permissions || '').split(',').map(s => s.trim()).filter(Boolean);
            return canUserApproveFinancialOp({
                isAdmin,
                inactiveInSipe: false,
                linkedUser: { role_name: u.sipe_role_name },
                sipePermissions: perms
            });
        });
    } catch (err) {
        console.warn('[TelegramApprovals] Error listando aprobadores:', err.message);
        return [];
    }
}

function buildApprovalCardMessage(approval = {}) {
    const tipoIcon = approval.tipo === 'PLANILLA' ? '👥' : '🧾';
    const tipoLabel = approval.tipo === 'PLANILLA' ? 'PAGO DE PLANILLA RRHH' : 'CHEQUE DE ALTO MONTO';
    let msg = `⚠️ <b>SOLICITUD DE APROBACIÓN GERENCIAL</b>\n`;
    msg += `${tipoIcon} <b>${tipoLabel}</b> (<code>#${approval.id || 'N/A'}</code>)\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `📌 <b>Concepto:</b> <b>${escapeHtml(approval.titulo || 'Operación Financiera')}</b>\n`;
    if (approval.empresa_nombre) {
        msg += `🏢 <b>Empresa:</b> ${escapeHtml(approval.empresa_nombre)}\n`;
    }
    msg += `💵 <b>Monto:</b> <b>${moneyFmt(approval.monto_usd || 0)}</b>\n`;
    if (approval.resumen) {
        msg += `📝 <b>Detalle:</b> ${escapeHtml(approval.resumen)}\n`;
    }
    if (approval.solicitado_por_nombre) {
        msg += `👤 <b>Emitido por:</b> ${escapeHtml(approval.solicitado_por_nombre)}\n`;
    }
    msg += `\n<i>Pulsa una acción para validar o detener esta operación:</i>`;
    return msg;
}

function buildApprovalCardMarkup(approvalId) {
    return {
        inline_keyboard: [
            [
                { text: '✅ Aprobar', callback_data: `tg_apr:ok:${approvalId}` },
                { text: '❌ Detener / Revisar', callback_data: `tg_apr:hold:${approvalId}` }
            ]
        ]
    };
}

/**
 * Registra una operación para revisión gerencial y notifica a los aprobadores vía Telegram.
 */
async function createAndNotifyApprovalRequest({
    db = null,
    tipo = 'CHEQUE',
    entidadId = '',
    titulo = '',
    resumen = '',
    montoUsd = 0,
    empresaNombre = null,
    requestedByUser = null,
    metadata = {},
    sendTelegramFn = null
} = {}) {
    if (process.env.NODE_ENV === 'test' && typeof sendTelegramFn !== 'function') {
        return { skipped: true, reason: 'test_env' };
    }

    const activeDb = db || getDb();
    if (!activeDb || typeof activeDb.query !== 'function') {
        return { ok: false, reason: 'db_unavailable' };
    }

    await ensureApprovalsSchema(activeDb);

    const safeTipo = String(tipo || 'CHEQUE').toUpperCase().slice(0, 40);
    const safeEntidadId = String(entidadId || '').slice(0, 64);
    const safeTitulo = String(titulo || 'Operación Financiera').slice(0, 200);
    const safeResumen = String(resumen || '').slice(0, 1000);
    const cleanMonto = Math.round(Number(montoUsd || 0) * 100) / 100;
    const safeEmpresa = empresaNombre ? String(empresaNombre).slice(0, 150) : null;
    const reqUserId = requestedByUser?.id ? Number(requestedByUser.id) : null;
    const reqUserName = requestedByUser?.nombre || requestedByUser?.username || 'Usuario SIPE';

    const [ins] = await activeDb.query(
        `INSERT INTO telegram_aprobaciones
            (tipo, entidad_id, titulo, resumen, monto_usd, empresa_nombre, solicitado_por_user_id, solicitado_por_nombre, estado, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)`,
        [
            safeTipo,
            safeEntidadId,
            safeTitulo,
            safeResumen,
            cleanMonto,
            safeEmpresa,
            reqUserId,
            String(reqUserName).slice(0, 150),
            JSON.stringify(metadata || {})
        ]
    );
    const approvalId = ins.insertId;

    const approvers = await fetchAuthorizedApprovers(activeDb);
    const sender = sendTelegramFn || sendTelegramMessage;
    const cardMsg = buildApprovalCardMessage({
        id: approvalId,
        tipo: safeTipo,
        titulo: safeTitulo,
        resumen: safeResumen,
        monto_usd: cleanMonto,
        empresa_nombre: safeEmpresa,
        solicitado_por_nombre: reqUserName
    });
    const markup = buildApprovalCardMarkup(approvalId);

    let sentCount = 0;
    for (const appr of approvers) {
        try {
            await sender(appr.telegram_user_id, cardMsg, markup);
            sentCount += 1;
        } catch (errSend) {
            console.warn(`[TelegramApprovals] Error notificando aprobador ${appr.telegram_user_id}:`, errSend.message);
        }
    }

    return {
        ok: true,
        id: approvalId,
        sentCount,
        approversTotal: approvers.length
    };
}

async function listApprovalsData({ db = null, estado = 'PENDIENTE', limit = 10 } = {}) {
    const activeDb = db || getDb();
    if (!activeDb || typeof activeDb.query !== 'function') return [];
    await ensureApprovalsSchema(activeDb);

    const safeLimit = Math.min(25, Math.max(1, parseInt(limit, 10) || 10));
    if (estado && estado !== 'TODAS') {
        const [rows] = await activeDb.query(
            `SELECT * FROM telegram_aprobaciones WHERE estado = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
            [estado, safeLimit]
        );
        return rows || [];
    }
    const [rows] = await activeDb.query(
        `SELECT * FROM telegram_aprobaciones ORDER BY created_at DESC, id DESC LIMIT ?`,
        [safeLimit]
    );
    return rows || [];
}

function formatApprovalsListMessage(rows = [], estado = 'PENDIENTE') {
    let msg = `🛡️ <b>BANDEJA DE APROBACIONES GERENCIALES</b>\n`;
    msg += `📋 <b>Filtro:</b> ${escapeHtml(estado)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (!rows || rows.length === 0) {
        msg += `✅ <i>No hay solicitudes de aprobación ${estado === 'PENDIENTE' ? 'pendientes' : 'registradas'} en este momento.</i>\n`;
        return msg;
    }

    rows.slice(0, 10).forEach((r, idx) => {
        const stIcon = r.estado === 'APROBADO' ? '✅' : (r.estado === 'DETENIDO' ? '❌' : '⏳');
        const tipoIcon = r.tipo === 'PLANILLA' ? '👥' : '🧾';
        msg += `${idx + 1}. ${stIcon} ${tipoIcon} <b>#${r.id} · ${escapeHtml(r.titulo)}</b>\n`;
        msg += `   └ Monto: <b>${moneyFmt(r.monto_usd || 0)}</b>`;
        if (r.empresa_nombre) msg += ` | ${escapeHtml(r.empresa_nombre)}`;
        msg += ` | Estado: <code>${escapeHtml(r.estado)}</code>\n`;
        if (r.resumen) {
            msg += `   └ <i>${escapeHtml(String(r.resumen).slice(0, 100))}</i>\n`;
        }
    });

    return msg;
}

function getApprovalsListMarkup(rows = []) {
    const pending = (rows || []).filter(r => r.estado === 'PENDIENTE').slice(0, 3);
    if (pending.length === 0) return null;
    return {
        inline_keyboard: pending.map(r => ([
            { text: `✅ Aprobar #${r.id}`, callback_data: `tg_apr:ok:${r.id}` },
            { text: `❌ Detener #${r.id}`, callback_data: `tg_apr:hold:${r.id}` }
        ]))
    };
}

/**
 * Resuelve de forma atómica una solicitud pendiente (APROBADO o DETENIDO).
 */
async function resolveApprovalAction({
    db = null,
    approvalId,
    decision,
    tgUser = {},
    effPerms = {},
    io = null
} = {}) {
    if (!canUserApproveFinancialOp(effPerms)) {
        return {
            ok: false,
            status: 'forbidden',
            message: '⛔ Solo usuarios autorizados de Gerencia o Administración pueden aprobar o detener operaciones.'
        };
    }

    const activeDb = db || getDb();
    if (!activeDb || typeof activeDb.query !== 'function') {
        return { ok: false, status: 'db_unavailable', message: 'Base de datos no disponible.' };
    }

    await ensureApprovalsSchema(activeDb);

    const idNum = parseInt(approvalId, 10);
    const normDecision = String(decision || '').toUpperCase();
    if (!idNum || !['APROBADO', 'DETENIDO'].includes(normDecision)) {
        return { ok: false, status: 'invalid', message: 'Solicitud o decisión inválida.' };
    }

    const [existingRows] = await activeDb.query(
        'SELECT * FROM telegram_aprobaciones WHERE id = ? LIMIT 1',
        [idNum]
    );
    if (!existingRows || existingRows.length === 0) {
        return { ok: false, status: 'not_found', message: '⚠️ Solicitud de aprobación no encontrada.' };
    }
    const approval = existingRows[0];

    const resolverName = effPerms?.linkedUser?.nombre ||
        `${tgUser?.first_name || ''} ${tgUser?.last_name || ''}`.trim() ||
        tgUser?.telegram_username ||
        'Gerencia';
    const resolverUserId = effPerms?.linkedUser?.id || tgUser?.user_id || null;
    const resolverTgId = String(tgUser?.telegram_user_id || '');

    const [upd] = await activeDb.query(
        `UPDATE telegram_aprobaciones
         SET estado = ?,
             resuelto_por_telegram_id = ?,
             resuelto_por_user_id = ?,
             resuelto_por_nombre = ?,
             resuelto_at = NOW()
         WHERE id = ? AND estado = 'PENDIENTE'`,
        [normDecision, resolverTgId, resolverUserId, String(resolverName).slice(0, 150), idNum]
    );

    if (!upd || Number(upd.affectedRows || 0) === 0) {
        const [currRows] = await activeDb.query('SELECT * FROM telegram_aprobaciones WHERE id = ? LIMIT 1', [idNum]);
        const current = currRows?.[0] || approval;
        return {
            ok: false,
            status: 'already_resolved',
            current,
            message: `ℹ️ La solicitud #${idNum} ya fue resuelta como ${current.estado} por ${current.resuelto_por_nombre || 'Gerencia'}.`
        };
    }

    // Si es un cheque y Gerencia lo DETIENE, marcarlo inmediatamente como reservado/retenido
    let chequeFlagged = false;
    if (normDecision === 'DETENIDO' && approval.tipo === 'CHEQUE' && approval.entidad_id) {
        try {
            const chequeId = parseInt(approval.entidad_id, 10);
            if (chequeId > 0) {
                await activeDb.query(
                    `UPDATE cheques
                     SET es_reservado = 1,
                         concepto = LEFT(CONCAT('[DETENIDO GERENCIA TG] ', COALESCE(concepto, '')), 255)
                     WHERE id = ?`,
                    [chequeId]
                );
                chequeFlagged = true;
            }
        } catch (errChq) {
            console.warn('[TelegramApprovals] Aviso reteniendo cheque en BD:', errChq.message);
        }
    }

    // Registrar en bitacora_logs
    try {
        await activeDb.query(
            `INSERT INTO bitacora_logs (user_id, username, accion, entidad, entidad_id, detalles, ip_address)
             VALUES (?, ?, ?, 'telegram_aprobaciones', ?, ?, 'TelegramBot')`,
            [
                resolverUserId,
                String(effPerms?.linkedUser?.username || tgUser?.telegram_username || resolverName).slice(0, 100),
                normDecision === 'APROBADO' ? 'APPROVE_TELEGRAM' : 'HOLD_TELEGRAM',
                String(idNum),
                JSON.stringify({
                    tipo: approval.tipo,
                    entidad_id: approval.entidad_id,
                    monto_usd: approval.monto_usd,
                    decision: normDecision,
                    cheque_retenido: chequeFlagged,
                    telegram_user_id: resolverTgId
                })
            ]
        );
    } catch (_) {
        // Bitácora opcional en mocks
    }

    // Notificar en SIPE Admin Web al usuario solicitante
    if (approval.solicitado_por_user_id) {
        const notifTitle = normDecision === 'APROBADO'
            ? `✅ Aprobado por Gerencia: ${approval.titulo}`
            : `⛔ Detenido por Gerencia: ${approval.titulo}`;
        const notifMessage = `${resolverName} marcó como ${normDecision} (${moneyFmt(approval.monto_usd || 0)}) vía Telegram.`;
        try {
            await activeDb.query(
                `INSERT INTO notifications (user_id, type, title, message, data, is_read)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [
                    approval.solicitado_por_user_id,
                    normDecision === 'APROBADO' ? 'success' : 'warning',
                    notifTitle.slice(0, 180),
                    notifMessage.slice(0, 480),
                    JSON.stringify({
                        approval_id: idNum,
                        tipo: approval.tipo,
                        entidad_id: approval.entidad_id,
                        decision: normDecision
                    })
                ]
            );
        } catch (_) {
            // Tabla notifications opcional en mocks
        }

        if (io && typeof io.to === 'function') {
            try {
                io.to(`user_${approval.solicitado_por_user_id}`).emit('notification:new', {
                    user_id: approval.solicitado_por_user_id,
                    type: normDecision === 'APROBADO' ? 'success' : 'warning',
                    title: notifTitle,
                    message: notifMessage,
                    approval_id: idNum
                });
            } catch (_) {
                // Socket opcional
            }
        }
    }

    return {
        ok: true,
        decision: normDecision,
        chequeFlagged,
        approval: {
            ...approval,
            estado: normDecision,
            resuelto_por_nombre: resolverName,
            resuelto_por_user_id: resolverUserId,
            resuelto_por_telegram_id: resolverTgId
        }
    };
}

/**
 * Procesa callbacks `tg_fin:*` (flujo/préstamos/créditos) y `tg_apr:*` (aprobaciones).
 */
async function handleFinanceApprovalCallback({ db = null, cq, tgUser, effPerms, io = null, transport = {} } = {}) {
    const data = String(cq?.data || '');
    if (!data.startsWith('tg_fin:') && !data.startsWith('tg_apr:')) return false;

    const {
        sendTelegramMessage: sendMsgFn = sendTelegramMessage,
        answerCallbackQuery: answerFn = async () => {},
        editMessageReplyMarkup: editMarkupFn = async () => {},
        sendChatAction: actionFn = async () => {},
        getMainReplyKeyboard: keyboardFn = () => undefined
    } = transport;

    const chatId = cq.message?.chat?.id;
    const msgId = cq.message?.message_id;

    if (data.startsWith('tg_fin:')) {
        const [, section, arg] = data.split(':');

        if (section === 'flujo') {
            if (!effPerms?.saldos_banco && !effPerms?.control_pagos && !effPerms?.isAdmin) {
                await answerFn(cq.id, '⛔ Sin permiso para consultar flujo de caja.');
                return true;
            }
            const horizon = arg === '60' ? 60 : 30;
            await answerFn(cq.id, `Calculando flujo a ${horizon} días...`);
            actionFn(chatId, 'typing').catch(() => {});
            const flujoData = await getFlujoResumenData({ horizon });
            await sendMsgFn(chatId, formatFlujoMessage(flujoData), getFlujoInlineMarkup(horizon));
            return true;
        }

        if (section === 'prest') {
            if (!effPerms?.saldos_banco && !effPerms?.finanzas_prestamos && !effPerms?.isAdmin) {
                await answerFn(cq.id, '⛔ Sin permiso para consultar préstamos.');
                return true;
            }
            const estado = arg === 'todos' ? 'todos' : 'activo';
            await answerFn(cq.id, 'Consultando préstamos...');
            const prestData = await getPrestamosResumenData({ db, estado });
            await sendMsgFn(chatId, formatPrestamosMessage(prestData), getPrestamosInlineMarkup(estado));
            return true;
        }

        if (section === 'cred') {
            if (!effPerms?.ventas && !effPerms?.saldos_banco && !effPerms?.isAdmin) {
                await answerFn(cq.id, '⛔ Sin permiso para consultar créditos de flotas.');
                return true;
            }
            const filter = arg === 'critico' ? 'critico' : 'todos';
            await answerFn(cq.id, 'Analizando riesgo de flotas...');
            const credData = await getCreditosResumenData({ filter });
            await sendMsgFn(chatId, formatCreditosMessage(credData), getCreditosInlineMarkup(filter));
            return true;
        }
        return false;
    }

    if (data.startsWith('tg_apr:')) {
        const [, action, approvalId] = data.split(':');
        const decision = action === 'ok' ? 'APROBADO' : (action === 'hold' ? 'DETENIDO' : null);
        if (!decision) return false;

        const res = await resolveApprovalAction({
            db,
            approvalId,
            decision,
            tgUser,
            effPerms,
            io
        });

        if (!res.ok) {
            await answerFn(cq.id, res.message.slice(0, 180));
            if (res.status === 'already_resolved' && chatId && msgId) {
                await editMarkupFn(chatId, msgId, { inline_keyboard: [] });
            }
            if (chatId) {
                await sendMsgFn(chatId, escapeHtml(res.message), keyboardFn());
            }
            return true;
        }

        await answerFn(cq.id, decision === 'APROBADO' ? '✅ Aprobado por Gerencia' : '❌ Operación detenida');
        if (chatId && msgId) {
            await editMarkupFn(chatId, msgId, { inline_keyboard: [] });
        }

        const badge = decision === 'APROBADO' ? '✅ <b>APROBADO POR GERENCIA</b>' : '⛔ <b>DETENIDO PARA REVISIÓN</b>';
        let reply = `${badge}\n`;
        reply += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
        reply += `• <b>Solicitud:</b> <code>#${res.approval.id}</code> — <b>${escapeHtml(res.approval.titulo)}</b>\n`;
        reply += `• <b>Monto:</b> <b>${moneyFmt(res.approval.monto_usd || 0)}</b>\n`;
        reply += `• <b>Resuelto por:</b> ${escapeHtml(res.approval.resuelto_por_nombre)}\n`;
        if (res.chequeFlagged) {
            reply += `• 🧾 <i>El cheque quedó marcado como reservado/retenido en Chequera SIPE Admin.</i>\n`;
        }
        if (chatId) {
            await sendMsgFn(chatId, reply, keyboardFn());
        }
        return true;
    }

    return false;
}

module.exports = {
    CHEQUE_APPROVAL_THRESHOLD_USD,
    ensureApprovalsSchema,
    getFlujoResumenData,
    formatFlujoMessage,
    getFlujoInlineMarkup,
    getPrestamosResumenData,
    formatPrestamosMessage,
    getPrestamosInlineMarkup,
    getCreditosResumenData,
    formatCreditosMessage,
    getCreditosInlineMarkup,
    canUserApproveFinancialOp,
    fetchAuthorizedApprovers,
    buildApprovalCardMessage,
    buildApprovalCardMarkup,
    createAndNotifyApprovalRequest,
    listApprovalsData,
    formatApprovalsListMessage,
    getApprovalsListMarkup,
    resolveApprovalAction,
    handleFinanceApprovalCallback
};
