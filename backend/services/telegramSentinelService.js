const cron = require('node-cron');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);

const recordatoriosPagosService = require('./recordatoriosPagosService');
const { getAuditoriaDineroEnTransito } = require('./operationalAuditService');
const { auditStationCloseoutsAndRemesas } = require('./stationDiscrepancyAuditService');
const { getSaldosBancosData } = require('./telegramDataService');
const { sendTelegramMessage } = require('./telegramTransportService');
const { getRealtimeIo } = require('./mibotNotifierService');
const {
    round2,
    parseStrictDBDate,
    computeAccountReconciliationSummary,
    classifyCheckAging
} = require('./bancosIntegrityService');
const {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr,
    shiftDate,
    normalizeText
} = require('./telegramTextAndDates');

const ensuredSentinelPools = new WeakSet();
let sentinelTasks = [];
let sentinelIo = null;

function setSentinelIo(ioInstance) {
    if (ioInstance) sentinelIo = ioInstance;
}

const BANK_SENTINEL_CATEGORY_LABELS = {
    REMESA_48H_HABILES: 'Remesa sin acreditar (>48h hábiles)',
    CHEQUE_POR_CADUCAR: 'Cheque próximo a caducar (150-180 días)',
    CHEQUE_CADUCO: 'Cheque caduco (>180 días)',
    SOBREGIRO_CHEQUERA: 'Sobregiro en chequera',
    CUENTA_SIN_VALIDAR_7D: 'Cuenta bancaria sin validar (>7 días)'
};

const BANK_IN_APP_PERMS = new Set([
    'manage_conciliacion_bancaria',
    'view_conciliacion_bancaria',
    'manage_cuentas',
    'manage_cheques',
    'manage_movimientos',
    '/dashboard/bancos/conciliacion',
    '/dashboard/bancos/cuentas',
    '/dashboard/bancos/reportes/saldos-bancos',
    '/dashboard/bancos/reportes/saldos-chequera'
]);

/**
 * Crea de forma idempotente la bitácora de deduplicación diaria del Centinela 24/7.
 */
async function ensureSentinelSchema(db) {
    if (!db || typeof db.query !== 'function') return;
    if (ensuredSentinelPools.has(db)) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS telegram_sentinel_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sentinel_key VARCHAR(120) NOT NULL,
            alert_date DATE NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'warning',
            summary VARCHAR(500) NULL,
            recipients_count INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_sentinel_key_day (sentinel_key, alert_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    ensuredSentinelPools.add(db);
}

/**
 * Calcula qué días del mes (YYYY-MM-DD) caen dentro de la ventana [today, today + daysAhead].
 */
function buildWindowDayMap(todayStr, daysAhead = 3) {
    const horizon = Math.max(0, Math.min(14, parseInt(daysAhead, 10) || 3));
    const map = new Map();
    for (let offset = 0; offset <= horizon; offset++) {
        const ymd = offset === 0 ? todayStr : shiftDate(todayStr, offset);
        const dayNum = Number(String(ymd).split('-')[2]);
        if (!map.has(dayNum)) {
            map.set(dayNum, ymd);
        }
    }
    return map;
}

/**
 * Evalúa liquidez (saldos bancarios vs compromisos próximos + cuotas de préstamos)
 * y remesas en tránsito >48h + vales >72h sin facturar.
 */
async function evaluateSentinelAlerts({
    db = null,
    externalDb = null,
    accountingDb = null,
    daysAhead = 3,
    todayOverride = null,
    overrides = null
} = {}) {
    const activeDb = db || getDb();
    const todayStr = todayOverride || getDateStr(0);
    const horizon = Math.max(1, Math.min(14, parseInt(daysAhead, 10) || 3));
    const horizonEndStr = shiftDate(todayStr, horizon);

    // 1. Obtener saldos en bancos y catálogo local de cuentas
    const bancosData = overrides?.bancosData
        ? overrides.bancosData
        : await getSaldosBancosData().catch(() => ({ total: 0, cuentas: [], fecha: todayStr }));

    const totalBancosUsd = Math.round(Number(bancosData?.total || 0) * 100) / 100;
    const cuentasBancos = Array.isArray(bancosData?.cuentas) ? bancosData.cuentas : [];

    // Mapa id cuentas_bancarias -> { numero, nombre, banco } para cruzar metas preferidas
    const localAccountById = new Map();
    if (activeDb && typeof activeDb.query === 'function') {
        try {
            const [accRows] = await activeDb.query(
                `SELECT cb.id, cb.numero, cb.nombre, COALESCE(b.descripcion, '') AS banco_nombre
                 FROM cuentas_bancarias cb
                 LEFT JOIN bancos b ON cb.banco_id = b.id
                 WHERE cb.activa = TRUE`
            );
            for (const a of (accRows || [])) {
                localAccountById.set(Number(a.id), a);
            }
        } catch (_) {
            // Opcional en mocks
        }
    }

    // 2. Compromisos pendientes de Control de Pagos (vencidos o próximos N días)
    let pagosVentana = [];
    if (Array.isArray(overrides?.pagosData)) {
        pagosVentana = overrides.pagosData;
    } else {
        const ext = externalDb || await Promise.resolve(getExternalDb()).catch(() => null);
        if (ext && typeof ext.query === 'function') {
            try {
                const [cpRows] = await ext.query(
                    `SELECT a.id, a.id_recordatorio, DATE_FORMAT(a.vencimiento, '%Y-%m-%d') AS vence,
                            IF(a.estado = 'P', 'PENDIENTE', 'CANCELADO') AS estado,
                            a.forma_pago, b.descripcion, b.monto, c.descripcion AS ubicacion
                     FROM web_rc_recordatorios_vencimientos a
                     INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
                     LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
                     WHERE b.activo = 1
                       AND a.estado = 'P'
                       AND a.vencimiento <= ?
                     ORDER BY a.vencimiento ASC
                     LIMIT 150`,
                    [horizonEndStr]
                );
                let enriched = cpRows || [];
                if (activeDb && enriched.length > 0) {
                    try {
                        enriched = await recordatoriosPagosService.enrichRecordatoriosList(activeDb, enriched);
                    } catch (_) {
                        // Continuar con valores base
                    }
                }
                const metaLabelMap = new Map();
                if (activeDb && enriched.length > 0) {
                    try {
                        const venIds = enriched.map(r => Number(r.id)).filter(Boolean);
                        if (venIds.length > 0) {
                            const ph = venIds.map(() => '?').join(',');
                            const [mRows] = await activeDb.query(
                                `SELECT vencimiento_id, cuenta_bancaria_id, cuenta_label, tipo_operacion
                                 FROM recordatorios_vencimientos_meta
                                 WHERE vencimiento_id IN (${ph})`,
                                venIds
                            );
                            for (const m of (mRows || [])) {
                                metaLabelMap.set(Number(m.vencimiento_id), m);
                            }
                        }
                    } catch (_) {
                        // Meta opcional
                    }
                }

                pagosVentana = enriched.map(r => {
                    const meta = metaLabelMap.get(Number(r.id));
                    const saldo = r.saldo_pendiente !== undefined
                        ? Number(r.saldo_pendiente)
                        : Number(r.monto || 0);
                    return {
                        id: Number(r.id),
                        descripcion: String(r.descripcion || 'Pago Programado').trim(),
                        ubicacion: String(r.ubicacion || '').trim(),
                        fecha_vencimiento: String(r.vence || r.fecha_vencimiento || todayStr).slice(0, 10),
                        saldo_pendiente: Math.round(saldo * 100) / 100,
                        tipo_operacion: meta?.tipo_operacion || r.tipo_operacion || 'CXP',
                        cuenta_bancaria_id: meta?.cuenta_bancaria_id || r.cuenta_bancaria_id_preferida || null,
                        cuenta_label: meta?.cuenta_label || r.cuenta_label || null
                    };
                }).filter(p => p.saldo_pendiente > 0.01 && p.tipo_operacion !== 'CXC');
            } catch (errCp) {
                console.warn('[TelegramSentinel] Error cargando Control de Pagos:', errCp.message);
            }
        }
    }

    // 3. Cuotas de préstamos bancarios cuyo día de pago cae en la ventana [0..daysAhead]
    let prestamosVentana = [];
    const windowDayMap = buildWindowDayMap(todayStr, horizon);
    let rawPrestamos = Array.isArray(overrides?.prestamosRows) ? overrides.prestamosRows : null;
    if (!rawPrestamos && activeDb && typeof activeDb.query === 'function') {
        try {
            const [pRows] = await activeDb.query(
                `SELECT p.id, p.numero_prestamo, p.descripcion,
                        COALESCE(p.cuota_total, p.cuota_calculada, 0) AS cuota,
                        COALESCE(DAY(p.fecha_primer_pago), 15) AS dia_pago,
                        p.cuenta_bancaria_id,
                        b.descripcion AS banco_nombre,
                        cb.numero AS cuenta_numero,
                        cb.nombre AS cuenta_nombre
                 FROM prestamos p
                 LEFT JOIN bancos b ON p.banco_id = b.id
                 LEFT JOIN cuentas_bancarias cb ON p.cuenta_bancaria_id = cb.id
                 WHERE p.estado = 'activo'`
            );
            rawPrestamos = pRows || [];
        } catch (_) {
            rawPrestamos = [];
        }
    }

    for (const p of (rawPrestamos || [])) {
        const diaPago = Number(p.dia_pago || 15);
        if (windowDayMap.has(diaPago)) {
            const cuota = Math.round(Number(p.cuota || p.cuota_total || p.cuota_calculada || 0) * 100) / 100;
            if (cuota > 0) {
                prestamosVentana.push({
                    id: Number(p.id),
                    numero_prestamo: p.numero_prestamo || `PREST-${p.id}`,
                    descripcion: p.descripcion || `Cuota Préstamo ${p.numero_prestamo || p.id}`,
                    fecha_vencimiento: windowDayMap.get(diaPago),
                    monto: cuota,
                    cuenta_bancaria_id: p.cuenta_bancaria_id || null,
                    cuenta_numero: p.cuenta_numero || null,
                    banco_nombre: p.banco_nombre || null
                });
            }
        }
    }

    const totalPagosCp = pagosVentana.reduce((s, p) => s + Number(p.saldo_pendiente || 0), 0);
    const totalPrestamos = prestamosVentana.reduce((s, p) => s + Number(p.monto || 0), 0);
    const totalCompromisosUsd = Math.round((totalPagosCp + totalPrestamos) * 100) / 100;

    const pagosVencidosHoy = pagosVentana.filter(p => p.fecha_vencimiento <= todayStr);
    const totalVencidoHoyUsd = Math.round(
        pagosVencidosHoy.reduce((s, p) => s + Number(p.saldo_pendiente || 0), 0) * 100
    ) / 100;

    const brechaGlobalUsd = Math.round(Math.max(0, totalCompromisosUsd - totalBancosUsd) * 100) / 100;
    const coberturaRatio = totalCompromisosUsd > 0
        ? Math.round((totalBancosUsd / totalCompromisosUsd) * 100) / 100
        : 99;

    // 4. Análisis de déficit por cuenta bancaria asociada
    const accountDemandMap = new Map();
    const resolveBankItemFromBankList = ({ cuenta_bancaria_id, cuenta_label, cuenta_numero }) => {
        const localAcc = cuenta_bancaria_id ? localAccountById.get(Number(cuenta_bancaria_id)) : null;
        const targetDigits = String(cuenta_numero || localAcc?.numero || (String(cuenta_label || '').match(/\d{4,}/)?.[0] || '')).replace(/\D/g, '');
        if (!targetDigits && !cuenta_label) return null;

        let match = null;
        if (targetDigits.length >= 4) {
            const last4 = targetDigits.slice(-4);
            match = cuentasBancos.find(c => {
                const digits = String(c.num_cta || c.cuenta || '').replace(/\D/g, '');
                return digits && (digits === targetDigits || digits.endsWith(last4));
            }) || null;
        }
        if (!match && cuenta_label) {
            const normLabel = normalizeText(cuenta_label);
            match = cuentasBancos.find(c => {
                const cNorm = normalizeText(`${c.banco || ''} ${c.cuenta || ''}`);
                return normLabel && (cNorm.includes(normLabel) || normLabel.includes(normalizeText(c.cuenta || '')));
            }) || null;
        }
        if (match) return match;
        if (localAcc) {
            return {
                banco: localAcc.banco_nombre || 'Banco',
                cuenta: `${localAcc.nombre} (${localAcc.numero})`,
                saldo: 0
            };
        }
        return null;
    };

    const addDemandForAccount = (bankEntry, amount, conceptLabel) => {
        if (!bankEntry || amount <= 0) return;
        const key = `${normalizeText(bankEntry.banco)}|${normalizeText(bankEntry.cuenta)}`;
        const prev = accountDemandMap.get(key) || {
            banco: bankEntry.banco || 'Banco',
            cuenta: bankEntry.cuenta || 'Cuenta',
            saldo: Math.round(Number(bankEntry.saldo || 0) * 100) / 100,
            compromisos: 0,
            conceptos: []
        };
        prev.compromisos = Math.round((prev.compromisos + amount) * 100) / 100;
        if (prev.conceptos.length < 3 && conceptLabel) prev.conceptos.push(conceptLabel);
        accountDemandMap.set(key, prev);
    };

    for (const p of pagosVentana) {
        if (p.cuenta_bancaria_id || p.cuenta_label) {
            const bItem = resolveBankItemFromBankList(p);
            addDemandForAccount(bItem, Number(p.saldo_pendiente || 0), p.descripcion);
        }
    }
    for (const pr of prestamosVentana) {
        if (pr.cuenta_bancaria_id || pr.cuenta_numero) {
            const bItem = resolveBankItemFromBankList(pr);
            addDemandForAccount(bItem, Number(pr.monto || 0), pr.descripcion);
        }
    }

    const cuentasConDeficit = [];
    for (const acc of accountDemandMap.values()) {
        if (acc.compromisos > acc.saldo + 0.01) {
            cuentasConDeficit.push({
                ...acc,
                deficit: Math.round((acc.compromisos - acc.saldo) * 100) / 100
            });
        }
    }
    cuentasConDeficit.sort((a, b) => b.deficit - a.deficit);

    const liquidezAjustada = totalCompromisosUsd > 0 && (brechaGlobalUsd > 0 || totalBancosUsd < totalCompromisosUsd * 1.15);

    // 5. Auditoría de remesas en tránsito >48h y vales >72h
    let transitoData = overrides?.transitoData || null;
    if (!transitoData) {
        try {
            transitoData = await getAuditoriaDineroEnTransito({ dias: 14, accountingDb });
        } catch (errTr) {
            console.warn('[TelegramSentinel] Error consultando dinero en tránsito:', errTr.message);
            transitoData = {
                resumen: {
                    efectivo_en_transito_48h_usd: 0,
                    vales_sin_facturar_72h_usd: 0,
                    partidas_transito_count: 0,
                    vales_sin_facturar_count: 0
                },
                remesas_en_transito: [],
                vales_pendientes_72h: []
            };
        }
    }

    const remesasCriticas = (transitoData?.remesas_en_transito || []).filter(r => Number(r.dias_transito || 0) >= 2 && Number(r.pendiente_conciliar_usd || 0) >= 50);
    const valesCriticos = (transitoData?.vales_pendientes_72h || []).filter(v => Number(v.dias_antiguedad || 0) >= 3 && Number(v.monto_usd || 0) > 0);
    const totalRemesas48hUsd = Math.round(
        Number(transitoData?.resumen?.efectivo_en_transito_48h_usd || remesasCriticas.reduce((s, r) => s + Number(r.pendiente_conciliar_usd || 0), 0)) * 100
    ) / 100;
    const totalVales72hUsd = Math.round(
        Number(transitoData?.resumen?.vales_sin_facturar_72h_usd || valesCriticos.reduce((s, v) => s + Number(v.monto_usd || 0), 0)) * 100
    ) / 100;

    // 5B. Auditoría de cortes de pista/tienda y conciliación de dinero enviado vs banco
    let stationAuditData = overrides?.stationAuditData || null;
    if (!stationAuditData && !overrides && process.env.NODE_ENV !== 'test') {
        try {
            stationAuditData = await auditStationCloseoutsAndRemesas({
                dias: 7,
                closeoutDays: 2,
                pistaThreshold: 5,
                tiendaThreshold: 5,
                deliveryDiffThreshold: 5,
                undeliveredMinUsd: 50,
                accountingDb,
                externalDb,
                todayOverride: todayStr
            });
        } catch (errAudit) {
            console.warn('[TelegramSentinel] Error auditando cortes y remesas:', errAudit.message);
            stationAuditData = null;
        }
    }

    const cortesPistaDif = stationAuditData?.pista_discrepancias || [];
    const cortesTiendaDif = stationAuditData?.tienda_discrepancias || [];
    const enviosRemesaDif = stationAuditData?.delivery_mismatches || [];
    const remesasSinRespaldo48h = stationAuditData?.remesas_sin_entregar_48h || [];
    const cortesDescuadreCount = cortesPistaDif.length + cortesTiendaDif.length;
    const remesasEnvioDifCount = enviosRemesaDif.length + remesasSinRespaldo48h.length;

    // 5C. Centinela Bancario Automático (R4.3: remesas >48h hábiles, cheques caducos/por caducar, sobregiros, >7d sin validar)
    let bankEval = null;
    try {
        bankEval = await evaluateBankSentinelChecks({
            db: activeDb,
            externalDb,
            accountingDb,
            todayOverride: todayStr,
            overrides: overrides
                ? { ...overrides, remesasSinAcreditar: overrides.remesasSinAcreditar ?? [] }
                : null
        });
    } catch (errBank) {
        console.warn('[TelegramSentinel] Error evaluando Centinela Bancario:', errBank.message);
        bankEval = null;
    }

    // 6. Claves de alertas activas
    const alertKeys = [];
    if (brechaGlobalUsd > 0) alertKeys.push('LIQ_BRECHA_GLOBAL');
    else if (liquidezAjustada) alertKeys.push('LIQ_AJUSTADA');
    if (cuentasConDeficit.length > 0) alertKeys.push('LIQ_CUENTA_DEFICIT');
    if (totalVencidoHoyUsd > 0) alertKeys.push('PAGOS_VENCIDOS_HOY');
    if (remesasCriticas.length > 0) alertKeys.push('REMESAS_48H');
    if (valesCriticos.length > 0) alertKeys.push('VALES_72H');
    if (cortesDescuadreCount > 0) alertKeys.push('CORTES_DESCUADRE');
    if (remesasEnvioDifCount > 0) alertKeys.push('REMESAS_ENVIADAS_DIF');

    if (bankEval && bankEval.hasAlerts && Array.isArray(bankEval.alertItems)) {
        const bankCategories = [...new Set(bankEval.alertItems.map(a => a.category).filter(Boolean))];
        for (const cat of bankCategories) {
            if (cat === 'REMESA_48H_HABILES' && alertKeys.includes('REMESAS_48H')) continue;
            if (!alertKeys.includes(cat)) {
                alertKeys.push(cat);
            }
        }
    }

    const hasAlerts = alertKeys.length > 0 || Boolean(bankEval?.hasAlerts);
    const isCritico = brechaGlobalUsd > 0 ||
        cuentasConDeficit.length > 0 ||
        remesasCriticas.some(r => r.severidad === 'critico' || Number(r.dias_transito) >= 4) ||
        stationAuditData?.severity === 'critico' ||
        bankEval?.severity === 'critico';
    const severity = !hasAlerts ? 'ok' : (isCritico ? 'critico' : 'alerta');

    return {
        fecha: todayStr,
        horizon_hasta: horizonEndStr,
        daysAhead: horizon,
        hasAlerts,
        severity,
        alertKeys,
        liquidez: {
            total_bancos_usd: totalBancosUsd,
            cuentas_activas_count: cuentasBancos.length,
            total_compromisos_3d_usd: totalCompromisosUsd,
            total_pagos_cp_usd: Math.round(totalPagosCp * 100) / 100,
            total_prestamos_3d_usd: Math.round(totalPrestamos * 100) / 100,
            pagos_ventana_count: pagosVentana.length,
            prestamos_ventana_count: prestamosVentana.length,
            pagos_vencidos_hoy_count: pagosVencidosHoy.length,
            total_vencido_hoy_usd: totalVencidoHoyUsd,
            brecha_global_usd: brechaGlobalUsd,
            cobertura_ratio: coberturaRatio,
            liquidez_ajustada: liquidezAjustada,
            cuentas_con_deficit: cuentasConDeficit,
            top_compromisos: pagosVentana.slice(0, 6),
            top_prestamos: prestamosVentana.slice(0, 4)
        },
        transito: {
            total_remesas_48h_usd: totalRemesas48hUsd,
            remesas_criticas_count: remesasCriticas.length,
            remesas_criticas: remesasCriticas.slice(0, 6),
            total_vales_72h_usd: totalVales72hUsd,
            vales_criticos_count: valesCriticos.length,
            vales_criticos: valesCriticos.slice(0, 5)
        },
        cortes_y_remesas: stationAuditData ? {
            cortes_descuadre_count: cortesDescuadreCount,
            remesas_envio_dif_count: remesasEnvioDifCount,
            pista_discrepancias: cortesPistaDif.slice(0, 4),
            tienda_discrepancias: cortesTiendaDif.slice(0, 4),
            delivery_mismatches: enviosRemesaDif.slice(0, 4),
            remesas_sin_entregar_48h: remesasSinRespaldo48h.slice(0, 3)
        } : null,
        bancos_centinela: bankEval
    };
}

/**
 * Formatea el reporte HTML del Centinela 24/7 para Telegram.
 */
function formatSentinelMessage(result = {}) {
    const liq = result.liquidez || {};
    const tr = result.transito || {};
    const badge = result.severity === 'critico'
        ? '🔴 <b>ALERTA CRÍTICA</b>'
        : (result.hasAlerts ? '🟡 <b>ATENCIÓN PREVENTIVA</b>' : '🟢 <b>TESORERÍA Y TRÁNSITO EN ORDEN</b>');

    let msg = `🛡️ <b>CENTINELA 24/7 DE LIQUIDEZ Y TESORERÍA</b>\n`;
    msg += `📅 <b>Corte:</b> ${toDisplayDate(result.fecha || getDateStr(0))} (horizonte ${result.daysAhead || 3} días)\n`;
    msg += `📊 <b>Estado:</b> ${badge}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Liquidez vs compromisos
    msg += `🏦 <b>LIQUIDEZ VS COMPROMISOS (${result.daysAhead || 3} DÍAS):</b>\n`;
    msg += `• <b>Disponible en Bancos:</b> <b>${moneyFmt(liq.total_bancos_usd || 0)}</b>\n`;
    msg += `• <b>Compromisos Próximos + Vencidos:</b> <b>${moneyFmt(liq.total_compromisos_3d_usd || 0)}</b>\n`;
    if (Number(liq.total_pagos_cp_usd || 0) > 0) {
        msg += `   ├ Control de Pagos (${liq.pagos_ventana_count || 0}): <code>${moneyFmt(liq.total_pagos_cp_usd)}</code>\n`;
    }
    if (Number(liq.total_prestamos_3d_usd || 0) > 0) {
        msg += `   ├ Cuotas Préstamos (${liq.prestamos_ventana_count || 0}): <code>${moneyFmt(liq.total_prestamos_3d_usd)}</code>\n`;
    }

    if (Number(liq.brecha_global_usd || 0) > 0) {
        msg += `• 🚨 <b>DÉFICIT GLOBAL PROYECTADO:</b> <b>-${moneyFmt(liq.brecha_global_usd)}</b>\n`;
    } else if (liq.liquidez_ajustada) {
        msg += `• ⚠️ <b>Cobertura Ajustada:</b> <code>${Number(liq.cobertura_ratio || 0).toFixed(2)}x</code> (&lt;1.15x recomendado)\n`;
    } else {
        msg += `• ✅ <b>Cobertura Bancaria:</b> Holgada (<code>${liq.total_compromisos_3d_usd > 0 ? `${Number(liq.cobertura_ratio).toFixed(2)}x` : 'Sin vencimientos'}</code>)\n`;
    }

    if (Number(liq.total_vencido_hoy_usd || 0) > 0) {
        msg += `• 🔴 <b>Vencidos o para Hoy:</b> <b>${moneyFmt(liq.total_vencido_hoy_usd)}</b> (${liq.pagos_vencidos_hoy_count} pagos)\n`;
    }

    if (Array.isArray(liq.cuentas_con_deficit) && liq.cuentas_con_deficit.length > 0) {
        msg += `\n⚠️ <b>CUENTAS CON SALDO INSUFICIENTE (${liq.cuentas_con_deficit.length}):</b>\n`;
        liq.cuentas_con_deficit.slice(0, 4).forEach(acc => {
            msg += `• <b>${escapeHtml(acc.banco)} · ${escapeHtml(acc.cuenta)}</b>\n`;
            msg += `   └ Saldo: <code>${moneyFmt(acc.saldo)}</code> | Comp.: <code>${moneyFmt(acc.compromisos)}</code> → <b>Falta ${moneyFmt(acc.deficit)}</b>\n`;
        });
    }

    // Tránsito >48h y vales >72h
    msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💵 <b>AUDITORÍA DE TRÁNSITO Y VALES:</b>\n`;
    if ((tr.remesas_criticas_count || 0) > 0) {
        msg += `🔴 <b>Remesas / POS sin abonar (&gt;48h):</b> <b>${moneyFmt(tr.total_remesas_48h_usd || 0)}</b> (${tr.remesas_criticas_count} partidas)\n`;
        (tr.remesas_criticas || []).slice(0, 4).forEach(r => {
            msg += `   • ${escapeHtml(r.estacion || 'Estación')} (${toDisplayDate(r.fecha_turno)}): <code>${moneyFmt(r.pendiente_conciliar_usd)}</code> (${r.dias_transito}d)\n`;
        });
    } else {
        msg += `🟢 <b>Remesas (&gt;48h):</b> Al día, sin partidas rezagadas.\n`;
    }

    if ((tr.vales_criticos_count || 0) > 0) {
        msg += `🟡 <b>Vales Pista sin facturar (&gt;72h):</b> <b>${moneyFmt(tr.total_vales_72h_usd || 0)}</b> (${tr.vales_criticos_count} lotes)\n`;
    } else {
        msg += `🟢 <b>Vales Pista (&gt;72h):</b> Facturación al día.\n`;
    }

    const cr = result.cortes_y_remesas;
    if (cr && ((cr.cortes_descuadre_count || 0) > 0 || (cr.remesas_envio_dif_count || 0) > 0)) {
        msg += `\n⛽ <b>CORTES Y REMESAS ENVIADAS (DIFERENCIAS):</b>\n`;
        (cr.pista_discrepancias || []).slice(0, 3).forEach(p => {
            msg += `   • Pista <b>${escapeHtml(p.estacion)}</b> (${toDisplayDate(p.fecha)}): <code>${moneyFmt(p.diferencia)}</code>\n`;
        });
        (cr.tienda_discrepancias || []).slice(0, 3).forEach(t => {
            msg += `   • Tienda <b>${escapeHtml(t.tienda)}</b> (${toDisplayDate(t.fecha)}): <code>${moneyFmt(t.diferencia)}</code>\n`;
        });
        (cr.delivery_mismatches || []).slice(0, 3).forEach(d => {
            msg += `   • Envío <b>${escapeHtml(d.estacion)}</b> (${escapeHtml(d.llave_saas)} ${toDisplayDate(d.fecha)}): Dif <code>${moneyFmt(d.diferencia_banco_vs_sistema)}</code>\n`;
        });
        (cr.remesas_sin_entregar_48h || []).slice(0, 2).forEach(u => {
            msg += `   • Sin entregar &gt;48h <b>${escapeHtml(u.estacion)}</b>: <code>${moneyFmt(u.neto_sin_respaldo_usd)}</code>\n`;
        });
    }

    const bc = result.bancos_centinela;
    if (bc && bc.hasAlerts && Array.isArray(bc.alertItems) && bc.alertItems.length > 0) {
        msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🏦 <b>CENTINELA BANCARIO (${bc.alertItems.length}):</b>\n`;
        const byCat = new Map();
        for (const item of bc.alertItems) {
            if (!byCat.has(item.category)) byCat.set(item.category, []);
            byCat.get(item.category).push(item);
        }
        for (const [cat, items] of byCat.entries()) {
            const label = BANK_SENTINEL_CATEGORY_LABELS[cat] || cat;
            const icon = items.some(i => i.severity === 'critico') ? '🚨' : '⚠️';
            msg += `${icon} <b>${escapeHtml(label)} (${items.length}):</b>\n`;
            items.slice(0, 4).forEach(it => {
                msg += `   • ${escapeHtml(it.summary)}\n`;
            });
            if (items.length > 4) {
                msg += `   • ... y ${items.length - 4} más\n`;
            }
        }
    }

    msg += `\n<i>SIPE Admin • Centinela Tesorería 24/7</i>`;
    return msg;
}

function getSentinelInlineMarkup() {
    return {
        inline_keyboard: [
            [
                { text: '🔄 Re-evaluar Centinela', callback_data: 'tg_sent:refresh' },
                { text: '🔍 Auditar Cortes/Remesas', callback_data: 'tg_audit_cortes:refresh' }
            ],
            [
                { text: '💳 Pagos Hoy/Vencidos', callback_data: 'tg_pago:f:hoy' },
                { text: '📈 Flujo 30d', callback_data: 'tg_fin:flujo:30' }
            ]
        ]
    };
}

/**
 * Obtiene destinatarios autorizados del Centinela (activos, permiso_alertas y tesorería/Admin).
 */
async function fetchSentinelRecipients(db) {
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
                // Fallback a GROUP_CONCAT
            }
        }

        return (users || []).filter(u => {
            if (!u.telegram_user_id) return false;
            if (u.user_id && u.sipe_status === 'inactive') return false;
            const isAdmin = Number(u.sipe_role_id) === 1 ||
                u.sipe_role_name === 'Administrator' ||
                u.sipe_role_name === 'Super Administrator';
            const directPerms = permsByRole[Number(u.sipe_role_id)];
            const perms = (Array.isArray(directPerms) && directPerms.length > 0)
                ? directPerms
                : String(u.sipe_permissions || '').split(',').map(s => s.trim()).filter(Boolean);

            const hasAlertFlag = Number(u.permiso_alertas) === 1 ||
                isAdmin ||
                perms.includes('/dashboard/consultas/estaciones/diferencias-combustible');
            const hasTreasuryPerm = Number(u.permiso_saldos_banco) === 1 ||
                isAdmin ||
                perms.includes('/dashboard/bancos/reportes/saldos-bancos') ||
                perms.includes('/dashboard/bancos/cuentas');

            return hasAlertFlag && hasTreasuryPerm;
        });
    } catch (err) {
        console.warn('[TelegramSentinel] Error obteniendo destinatarios:', err.message);
        return [];
    }
}

/**
 * Ejecuta evaluación y envío proactivo deduplicado (máximo 1 vez por clave + día + franja).
 */
async function runProactiveSentinelDispatch({
    db = null,
    externalDb = null,
    accountingDb = null,
    io = null,
    sendTelegramFn = sendTelegramMessage,
    todayOverride = null,
    slotKey = 'auto',
    overrides = null
} = {}) {
    const activeDb = db || getDb();
    if (!activeDb) return { dispatched: false, reason: 'db_unavailable' };

    await ensureSentinelSchema(activeDb);
    const result = await evaluateSentinelAlerts({
        db: activeDb,
        externalDb,
        accountingDb,
        daysAhead: 3,
        todayOverride,
        overrides
    });

    if (!result.hasAlerts) {
        return { dispatched: false, reason: 'no_alerts', result };
    }

    const sortedKeys = [...result.alertKeys].sort().join('|');
    const sentinelKey = `${slotKey}:${sortedKeys}`.slice(0, 120);
    const bankCount = result.bancos_centinela?.counts?.total || 0;
    const summaryText = `Bancos=${result.liquidez.total_bancos_usd} Comp=${result.liquidez.total_compromisos_3d_usd} Transito48h=${result.transito.total_remesas_48h_usd} BankAlerts=${bankCount}`.slice(0, 480);

    const [insRes] = await activeDb.query(
        `INSERT IGNORE INTO telegram_sentinel_log (sentinel_key, alert_date, severity, summary, recipients_count)
         VALUES (?, ?, ?, ?, 0)`,
        [sentinelKey, result.fecha, result.severity, summaryText]
    );

    if (!insRes || Number(insRes.affectedRows || 0) === 0) {
        return { dispatched: false, reason: 'deduplicated', sentinelKey, result };
    }

    const recipients = await fetchSentinelRecipients(activeDb);
    const msg = formatSentinelMessage(result);
    const markup = getSentinelInlineMarkup();
    let sentCount = 0;

    for (const user of recipients) {
        try {
            await sendTelegramFn(user.telegram_user_id, msg, markup);
            sentCount += 1;
        } catch (errSend) {
            console.warn(`[TelegramSentinel] Error enviando alerta a ${user.telegram_user_id}:`, errSend.message);
        }
    }

    let inAppNotifiedCount = 0;
    let bankAlertsDispatched = 0;
    if (result.bancos_centinela?.hasAlerts && Array.isArray(result.bancos_centinela.alertItems) && result.bancos_centinela.alertItems.length > 0) {
        try {
            const newBankAlerts = await recordNewBankSentinelAlerts(activeDb, result.bancos_centinela);
            bankAlertsDispatched = newBankAlerts.length;
            if (newBankAlerts.length > 0) {
                inAppNotifiedCount = await dispatchBankInAppNotifications({
                    db: activeDb,
                    io,
                    evaluation: result.bancos_centinela,
                    alerts: newBankAlerts,
                    slotKey
                });
                const totalBankRecip = inAppNotifiedCount + sentCount;
                try {
                    for (const item of newBankAlerts) {
                        await activeDb.query(
                            'UPDATE telegram_sentinel_log SET recipients_count = ? WHERE sentinel_key = ? AND alert_date = ?',
                            [totalBankRecip, item.sentinelKey, result.bancos_centinela.fecha]
                        );
                    }
                } catch (_) {
                    // Opcional en mocks
                }
            }
        } catch (errBankDispatch) {
            console.warn('[TelegramSentinel] Error despachando alertas bancarias in-app:', errBankDispatch.message);
        }
    }

    try {
        await activeDb.query(
            `UPDATE telegram_sentinel_log SET recipients_count = ? WHERE sentinel_key = ? AND alert_date = ?`,
            [sentCount, sentinelKey, result.fecha]
        );
    } catch (_) {
        // Opcional en mocks
    }

    return {
        dispatched: true,
        sentCount,
        recipientsTotal: recipients.length,
        inAppNotifiedCount,
        bankAlertsDispatched,
        sentinelKey,
        result
    };
}

/**
 * Cuenta los días hábiles (Lunes a Viernes) transcurridos estrictamente después de `fromYmd` hasta `toYmd` inclusive.
 */
function countBusinessDaysBetween(fromYmd, toYmd) {
    const startStr = parseStrictDBDate(fromYmd);
    const endStr = parseStrictDBDate(toYmd);
    if (!startStr || !endStr || endStr <= startStr) return 0;

    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const cursor = new Date(Date.UTC(sy, sm - 1, sd + 1, 12, 0, 0));
    const endMs = Date.UTC(ey, em - 1, ed, 12, 0, 0);

    let count = 0;
    let guard = 0;
    while (cursor.getTime() <= endMs && guard < 3660) {
        const day = cursor.getUTCDay();
        if (day >= 1 && day <= 5) {
            count += 1;
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        guard += 1;
    }
    return count;
}

function countCalendarDaysBetween(fromYmd, toYmd) {
    const startStr = parseStrictDBDate(fromYmd);
    const endStr = parseStrictDBDate(toYmd);
    if (!startStr || !endStr) return null;
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const startMs = Date.UTC(sy, sm - 1, sd, 12, 0, 0);
    const endMs = Date.UTC(ey, em - 1, ed, 12, 0, 0);
    return Math.max(0, Math.floor((endMs - startMs) / 86400000));
}

/**
 * Evalúa las 4 alertas automáticas del Centinela Bancario (R4.3):
 *  1. Remesas de cierres de estación sin acreditar >48h hábiles (>= 2 días hábiles, >= $50)
 *  2. Cheques en circulación próximos a caducar (150-180d) y caducos (>180d)
 *  3. Sobregiros en chequera (saldo_chequera < 0)
 *  4. Cuentas bancarias activas con >7 días sin validar (o nunca validadas)
 */
async function evaluateBankSentinelChecks({
    db = null,
    externalDb = null,
    accountingDb = null,
    todayOverride = null,
    overrides = null
} = {}) {
    const activeDb = db || getDb();
    const todayStr = parseStrictDBDate(todayOverride) || getDateStr(0);

    let cuentasRows = Array.isArray(overrides?.cuentasRows) ? overrides.cuentasRows : null;
    if (!cuentasRows && activeDb && typeof activeDb.query === 'function') {
        try {
            const [rows] = await activeDb.query(
                `SELECT cb.id, cb.empresa_id, cb.numero, cb.nombre, cb.saldo_inicial, cb.fecha_saldo_inicial,
                        COALESCE(e.nombre, '') AS empresa_nombre,
                        COALESCE(e.codigo, '') AS empresa_codigo,
                        COALESCE(b.descripcion, 'Banco') AS banco_nombre
                 FROM cuentas_bancarias cb
                 LEFT JOIN empresas e ON cb.empresa_id = e.id
                 LEFT JOIN bancos b ON cb.banco_id = b.id
                 WHERE cb.activa = TRUE
                 ORDER BY b.descripcion ASC, cb.numero ASC`
            );
            cuentasRows = rows || [];
        } catch (err) {
            console.warn('[BankSentinel] Error consultando cuentas activas:', err.message);
            cuentasRows = [];
        }
    }
    cuentasRows = cuentasRows || [];

    const cuentaById = new Map();
    for (const c of cuentasRows) {
        cuentaById.set(Number(c.id), c);
    }

    const alertItems = [];

    // ── 1. Remesas de cierres sin acreditar (>48h hábiles) ──
    const remesasSinAcreditar = [];
    let rawRemesas = null;
    if (Array.isArray(overrides?.remesasSinAcreditar)) {
        rawRemesas = overrides.remesasSinAcreditar;
    } else if (Array.isArray(overrides?.transitoData?.remesas_en_transito)) {
        rawRemesas = overrides.transitoData.remesas_en_transito;
    } else if (!overrides) {
        try {
            const tr = await getAuditoriaDineroEnTransito({ dias: 14, accountingDb, externalDb });
            rawRemesas = tr?.remesas_en_transito || [];
        } catch (errTr) {
            console.warn('[BankSentinel] Error consultando remesas en tránsito:', errTr.message);
            rawRemesas = [];
        }
    } else {
        rawRemesas = [];
    }

    for (const r of (rawRemesas || [])) {
        const fechaTurno = parseStrictDBDate(r.fecha_turno || r.fecha);
        const pendiente = round2(r.pendiente_conciliar_usd ?? r.pendiente ?? r.monto ?? 0);
        if (!fechaTurno || pendiente < 50) continue;
        const bizDays = countBusinessDaysBetween(fechaTurno, todayStr);
        if (bizDays < 2) continue;

        const estacion = String(r.estacion || 'Estación').trim();
        const empKey = String(r.codigo_estacion || r.id_empresa || normalizeText(estacion)).replace(/\s+/g, '_').slice(0, 30);
        const item = {
            sentinelKey: `bank:remesa48h:${empKey}:${fechaTurno}`.slice(0, 120),
            category: 'REMESA_48H_HABILES',
            severity: bizDays >= 4 ? 'critico' : 'alerta',
            title: `Remesa sin acreditar (>48h hábiles): ${estacion}`,
            summary: `${estacion} (${toDisplayDate(fechaTurno)}): ${moneyFmt(pendiente)} pendiente tras ${bizDays} días hábiles`,
            cuenta_id: null,
            meta: {
                estacion,
                codigo_estacion: r.codigo_estacion || r.id_empresa || null,
                fecha_turno: fechaTurno,
                dias_habiles: bizDays,
                pendiente_conciliar_usd: pendiente
            }
        };
        remesasSinAcreditar.push(item.meta);
        alertItems.push(item);
    }

    // ── 2. Cheques próximos a caducar (150-180d) y caducos (>180d) ──
    const chequesPorCaducar = [];
    const chequesCaducos = [];
    let rawCheques = Array.isArray(overrides?.chequesRows) ? overrides.chequesRows : null;
    if (!rawCheques && activeDb && typeof activeDb.query === 'function' && cuentasRows.length > 0) {
        try {
            const [chkRows] = await activeDb.query(
                `SELECT ch.id, ch.cuenta_bancaria_id, ch.cheque, ch.fecha, ch.fecha_aplicado, ch.valor, ch.a_nombre,
                        ch.cheque_anulado, ch.fue_noemitido, ch.es_reservado, ch.deleted_at,
                        cb.numero AS cuenta_numero, cb.nombre AS cuenta_nombre, cb.fecha_saldo_inicial,
                        COALESCE(b.descripcion, 'Banco') AS banco_nombre,
                        COALESCE(e.nombre, '') AS empresa_nombre
                 FROM cheques ch
                 INNER JOIN cuentas_bancarias cb ON ch.cuenta_bancaria_id = cb.id
                 LEFT JOIN bancos b ON cb.banco_id = b.id
                 LEFT JOIN empresas e ON cb.empresa_id = e.id
                 WHERE cb.activa = 1
                   AND ch.deleted_at IS NULL
                   AND ch.cheque_anulado = FALSE
                   AND ch.fue_noemitido = FALSE
                   AND ch.es_reservado = FALSE
                   AND ch.fecha_aplicado IS NULL
                   AND ch.fecha <= ?
                 ORDER BY ch.fecha ASC, ch.id ASC`,
                [todayStr]
            );
            rawCheques = chkRows || [];
        } catch (errChk) {
            console.warn('[BankSentinel] Error consultando cheques en circulación:', errChk.message);
            rawCheques = [];
        }
    }

    for (const ch of (rawCheques || [])) {
        if (Boolean(ch.deleted_at) || Boolean(ch.cheque_anulado) || Boolean(ch.fue_noemitido) || Boolean(ch.es_reservado) || ch.fecha_aplicado) {
            continue;
        }
        const chFecha = parseStrictDBDate(ch.fecha);
        if (!chFecha || chFecha > todayStr) continue;

        const cta = cuentaById.get(Number(ch.cuenta_bancaria_id));
        const floorDate = parseStrictDBDate(ch.fecha_saldo_inicial || cta?.fecha_saldo_inicial);
        if (floorDate && chFecha < floorDate) continue;

        const aging = classifyCheckAging(chFecha, todayStr);
        if (!aging.caduco && !aging.por_caducar) continue;

        const bancoNom = ch.banco_nombre || cta?.banco_nombre || 'Banco';
        const ctaNum = ch.cuenta_numero || cta?.numero || '';
        const chNum = String(ch.cheque || ch.id);
        const valor = round2(ch.valor || 0);
        const benef = String(ch.a_nombre || 'Beneficiario').trim();

        const meta = {
            id: Number(ch.id),
            cuenta_bancaria_id: Number(ch.cuenta_bancaria_id),
            banco_nombre: bancoNom,
            cuenta_numero: ctaNum,
            cheque: chNum,
            a_nombre: benef,
            fecha: chFecha,
            valor,
            dias_circulacion: aging.dias_circulacion,
            aging_bucket: aging.aging_bucket
        };

        if (aging.caduco) {
            chequesCaducos.push(meta);
            alertItems.push({
                sentinelKey: `bank:chq_caduco:${ch.id}`.slice(0, 120),
                category: 'CHEQUE_CADUCO',
                severity: 'critico',
                title: `Cheque caduco (>180d): #${chNum}`,
                summary: `Cheque #${chNum} (${bancoNom} ${ctaNum}) a favor de ${benef} por ${moneyFmt(valor)} lleva ${aging.dias_circulacion} días sin cobro`,
                cuenta_id: Number(ch.cuenta_bancaria_id),
                meta
            });
        } else {
            chequesPorCaducar.push(meta);
            alertItems.push({
                sentinelKey: `bank:chq_por_caducar:${ch.id}`.slice(0, 120),
                category: 'CHEQUE_POR_CADUCAR',
                severity: 'alerta',
                title: `Cheque por caducar (${aging.dias_circulacion}d): #${chNum}`,
                summary: `Cheque #${chNum} (${bancoNom} ${ctaNum}) a favor de ${benef} por ${moneyFmt(valor)} tiene ${aging.dias_circulacion} días en circulación`,
                cuenta_id: Number(ch.cuenta_bancaria_id),
                meta
            });
        }
    }

    // ── 3. Sobregiros en chequera (saldo_chequera < 0) ──
    const sobregiros = [];
    for (const cta of cuentasRows) {
        let summary = overrides?.summariesByCuentaId?.[cta.id] || overrides?.summariesByCuentaId?.[String(cta.id)] || null;
        if (!summary && activeDb && typeof activeDb.query === 'function') {
            try {
                summary = await computeAccountReconciliationSummary(activeDb, cta.id, todayStr);
            } catch (_) {
                summary = null;
            }
        }
        if (!summary) continue;

        const saldoChequera = round2(summary.saldo_chequera || 0);
        if (saldoChequera < -0.005) {
            const meta = {
                cuenta_bancaria_id: Number(cta.id),
                numero: cta.numero || '',
                nombre: cta.nombre || '',
                banco_nombre: cta.banco_nombre || 'Banco',
                empresa_nombre: cta.empresa_nombre || '',
                saldo_chequera: saldoChequera,
                saldo_conciliado_libros: round2(summary.saldo_conciliado_libros || 0)
            };
            sobregiros.push(meta);
            alertItems.push({
                sentinelKey: `bank:sobregiro:cta_${cta.id}`.slice(0, 120),
                category: 'SOBREGIRO_CHEQUERA',
                severity: 'critico',
                title: `Sobregiro en chequera: ${cta.banco_nombre || 'Banco'} ${cta.numero || ''}`,
                summary: `Cuenta ${cta.nombre || cta.numero} (${cta.banco_nombre || 'Banco'}) presenta saldo en chequera negativo de ${moneyFmt(saldoChequera)}`,
                cuenta_id: Number(cta.id),
                meta
            });
        }
    }

    // ── 4. Cuentas activas con >7 días sin validar ──
    const cuentasSinValidar = [];
    const lastValByCuenta = new Map();
    if (Array.isArray(overrides?.validacionesRows)) {
        for (const vr of overrides.validacionesRows) {
            const cid = Number(vr.cuenta_bancaria_id);
            const fVal = parseStrictDBDate(vr.fecha_validacion || vr.ultima_validacion);
            if (!cid || !fVal) continue;
            const prev = lastValByCuenta.get(cid);
            if (!prev || fVal > prev) lastValByCuenta.set(cid, fVal);
        }
    } else if (activeDb && typeof activeDb.query === 'function' && cuentasRows.length > 0) {
        try {
            const [valRows] = await activeDb.query(
                `SELECT cuenta_bancaria_id, MAX(fecha_validacion) AS ultima_validacion
                 FROM validaciones_saldo_banco
                 GROUP BY cuenta_bancaria_id`
            );
            for (const vr of (valRows || [])) {
                const cid = Number(vr.cuenta_bancaria_id);
                const fVal = parseStrictDBDate(vr.ultima_validacion);
                if (cid && fVal) lastValByCuenta.set(cid, fVal);
            }
        } catch (errVal) {
            if (!errVal || (errVal.code !== 'ER_NO_SUCH_TABLE' && errVal.errno !== 1146)) {
                console.warn('[BankSentinel] Error consultando validaciones_saldo_banco:', errVal.message);
            }
        }
    }

    for (const cta of cuentasRows) {
        const cid = Number(cta.id);
        const ultimaVal = lastValByCuenta.get(cid) || null;
        const diasSinValidar = ultimaVal ? countCalendarDaysBetween(ultimaVal, todayStr) : null;
        if (!ultimaVal || diasSinValidar > 7) {
            const meta = {
                cuenta_bancaria_id: cid,
                numero: cta.numero || '',
                nombre: cta.nombre || '',
                banco_nombre: cta.banco_nombre || 'Banco',
                empresa_nombre: cta.empresa_nombre || '',
                ultima_validacion: ultimaVal,
                dias_sin_validar: diasSinValidar,
                nunca_validada: !ultimaVal
            };
            cuentasSinValidar.push(meta);
            alertItems.push({
                sentinelKey: `bank:sin_validar:cta_${cid}`.slice(0, 120),
                category: 'CUENTA_SIN_VALIDAR_7D',
                severity: 'alerta',
                title: `Cuenta sin validar (>7d): ${cta.banco_nombre || 'Banco'} ${cta.numero || ''}`,
                summary: ultimaVal
                    ? `Cuenta ${cta.nombre || cta.numero} tiene ${diasSinValidar} días sin validar saldo (última: ${toDisplayDate(ultimaVal)})`
                    : `Cuenta ${cta.nombre || cta.numero} nunca ha tenido una validación de saldo registrada`,
                cuenta_id: cid,
                meta
            });
        }
    }

    const hasAlerts = alertItems.length > 0;
    const isCritico = alertItems.some(a => a.severity === 'critico');
    const severity = !hasAlerts ? 'ok' : (isCritico ? 'critico' : 'alerta');

    return {
        fecha: todayStr,
        hasAlerts,
        severity,
        alertItems,
        remesas_48h_habiles: remesasSinAcreditar,
        cheques_por_caducar: chequesPorCaducar,
        cheques_caducos: chequesCaducos,
        sobregiros,
        cuentas_sin_validar: cuentasSinValidar,
        counts: {
            total: alertItems.length,
            remesas_48h_habiles: remesasSinAcreditar.length,
            cheques_por_caducar: chequesPorCaducar.length,
            cheques_caducos: chequesCaducos.length,
            sobregiros: sobregiros.length,
            cuentas_sin_validar: cuentasSinValidar.length
        }
    };
}

/**
 * Formatea mensaje HTML del Centinela Bancario para Telegram.
 */
function formatBankSentinelMessage({ fecha, alertItems = [], severity = 'alerta' } = {}) {
    const badge = severity === 'critico' ? '🔴 <b>ALERTA BANCARIA CRÍTICA</b>' : '🟡 <b>CENTINELA BANCARIO PREVENTIVO</b>';
    let msg = `🏦 <b>CENTINELA BANCARIO AUTOMÁTICO</b>\n`;
    msg += `📅 <b>Corte:</b> ${toDisplayDate(fecha || getDateStr(0))}\n`;
    msg += `📊 <b>Estado:</b> ${badge}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const byCategory = new Map();
    for (const item of alertItems) {
        if (!byCategory.has(item.category)) byCategory.set(item.category, []);
        byCategory.get(item.category).push(item);
    }

    for (const [cat, items] of byCategory.entries()) {
        const label = BANK_SENTINEL_CATEGORY_LABELS[cat] || cat;
        const icon = items.some(i => i.severity === 'critico') ? '🚨' : '⚠️';
        msg += `${icon} <b>${escapeHtml(label)} (${items.length}):</b>\n`;
        items.slice(0, 6).forEach(it => {
            msg += `   • ${escapeHtml(it.summary)}\n`;
        });
        if (items.length > 6) {
            msg += `   • ... y ${items.length - 6} alerta(s) adicional(es)\n`;
        }
        msg += `\n`;
    }

    msg += `<i>SIPE Admin • Centinela Bancario</i>`;
    return msg;
}

/**
 * Obtiene usuarios activos de SIPE Admin autorizados para recibir notificaciones de Bancos en la app.
 */
async function fetchBankInAppRecipients(db) {
    if (!db || typeof db.query !== 'function') return [];
    try {
        const [rows] = await db.query(
            `SELECT u.id, u.username, u.nombre, u.status, u.role_id,
                    COALESCE(r.name, '') AS role_name,
                    p.name AS permission_name
             FROM users u
             LEFT JOIN roles r ON u.role_id = r.id
             LEFT JOIN role_permissions rp ON r.id = rp.role_id
             LEFT JOIN permissions p ON rp.permission_id = p.id
             WHERE COALESCE(u.status, 'active') = 'active'`
        );

        const byUser = new Map();
        for (const row of (rows || [])) {
            const uid = Number(row.id);
            if (!uid) continue;
            if (!byUser.has(uid)) {
                byUser.set(uid, {
                    id: uid,
                    username: row.username || '',
                    nombre: row.nombre || row.username || 'Usuario',
                    role_id: Number(row.role_id || 0),
                    role_name: String(row.role_name || ''),
                    permissions: new Set()
                });
            }
            if (row.permission_name) {
                byUser.get(uid).permissions.add(String(row.permission_name).trim());
            }
        }

        const authorized = [];
        for (const u of byUser.values()) {
            const roleLow = u.role_name.toLowerCase();
            const isAdmin = u.role_id === 1 ||
                ['admin', 'administrator', 'administrador', 'super admin', 'superadmin', 'super administrador'].includes(roleLow);
            const hasBankPerm = [...BANK_IN_APP_PERMS].some(p => u.permissions.has(p));
            if (isAdmin || hasBankPerm) {
                authorized.push({
                    id: u.id,
                    username: u.username,
                    nombre: u.nombre
                });
            }
        }
        return authorized;
    } catch (err) {
        console.warn('[BankSentinel] Error consultando usuarios SIPE para notificaciones:', err.message);
        return [];
    }
}

/**
 * Registra las claves individuales del Centinela Bancario en telegram_sentinel_log
 * y devuelve únicamente las alertas nuevas del día.
 */
async function recordNewBankSentinelAlerts(activeDb, evaluation) {
    const newAlerts = [];
    for (const item of (evaluation?.alertItems || [])) {
        const sKey = String(item.sentinelKey).slice(0, 120);
        const [insRes] = await activeDb.query(
            `INSERT IGNORE INTO telegram_sentinel_log (sentinel_key, alert_date, severity, summary, recipients_count)
             VALUES (?, ?, ?, ?, 0)`,
            [sKey, evaluation.fecha, item.severity, String(item.summary || item.title || '').slice(0, 480)]
        );
        if (insRes && Number(insRes.affectedRows || 0) > 0) {
            newAlerts.push({ ...item, sentinelKey: sKey });
        }
    }
    return newAlerts;
}

/**
 * Inserta notificaciones in-app en `notifications` y emite 'notification:new' vía Socket.io
 * a los usuarios autorizados de SIPE Admin.
 */
async function dispatchBankInAppNotifications({
    db: activeDb,
    io = null,
    evaluation,
    alerts,
    slotKey = 'auto'
}) {
    const targetAlerts = Array.isArray(alerts) ? alerts : [];
    if (!activeDb || targetAlerts.length === 0) return 0;

    const activeIo = io || sentinelIo || getRealtimeIo();
    const hasCrit = targetAlerts.some(a => a.severity === 'critico');
    const notifSeverity = hasCrit ? 'critico' : 'alerta';
    const notifTitle = targetAlerts.length === 1
        ? targetAlerts[0].title.slice(0, 255)
        : `Centinela Bancario: ${targetAlerts.length} alerta(s) detectada(s)`;
    const notifMessage = targetAlerts.slice(0, 4).map(a => `• ${a.summary}`).join('\n') +
        (targetAlerts.length > 4 ? `\n• ... y ${targetAlerts.length - 4} más` : '');
    const notifData = {
        fecha: evaluation.fecha,
        slotKey,
        severity: notifSeverity,
        sentinel_keys: targetAlerts.map(a => a.sentinelKey),
        alerts: targetAlerts.map(a => ({
            sentinel_key: a.sentinelKey,
            category: a.category,
            severity: a.severity,
            title: a.title,
            summary: a.summary,
            cuenta_id: a.cuenta_id,
            meta: a.meta
        }))
    };

    const inAppUsers = await fetchBankInAppRecipients(activeDb);
    let inAppNotifiedCount = 0;
    const jsonData = JSON.stringify(notifData);

    for (const user of inAppUsers) {
        try {
            const [insNotif] = await activeDb.query(
                `INSERT INTO notifications (user_id, type, title, message, data, is_read)
                 VALUES (?, 'bank_sentinel_alert', ?, ?, ?, 0)`,
                [user.id, notifTitle, notifMessage, jsonData]
            );
            inAppNotifiedCount += 1;

            if (activeIo && typeof activeIo.to === 'function') {
                activeIo.to(`user_${user.id}`).emit('notification:new', {
                    id: insNotif?.insertId || null,
                    user_id: user.id,
                    type: 'bank_sentinel_alert',
                    title: notifTitle,
                    message: notifMessage,
                    data: notifData,
                    is_read: false,
                    created_at: new Date().toISOString()
                });
            }
        } catch (errNotif) {
            console.warn(`[BankSentinel] Error notificando usuario SIPE #${user.id}:`, errNotif.message);
        }
    }

    return inAppNotifiedCount;
}

/**
 * Ejecuta las 4 validaciones del Centinela Bancario con deduplicación diaria por hallazgo,
 * insertando notificaciones in-app + emitiendo 'notification:new' vía Socket.io y enviando por Telegram.
 */
async function runBankSentinelChecks({
    db = null,
    externalDb = null,
    accountingDb = null,
    io = null,
    sendTelegramFn = sendTelegramMessage,
    todayOverride = null,
    slotKey = 'auto',
    overrides = null
} = {}) {
    const activeDb = db || getDb();
    if (!activeDb) return { dispatched: false, reason: 'db_unavailable', newAlertsCount: 0 };

    await ensureSentinelSchema(activeDb);

    const evaluation = await evaluateBankSentinelChecks({
        db: activeDb,
        externalDb,
        accountingDb,
        todayOverride,
        overrides
    });

    if (!evaluation.hasAlerts) {
        return { dispatched: false, reason: 'no_alerts', newAlertsCount: 0, evaluation };
    }

    const newAlerts = await recordNewBankSentinelAlerts(activeDb, evaluation);

    if (newAlerts.length === 0) {
        return { dispatched: false, reason: 'deduplicated', newAlertsCount: 0, evaluation };
    }

    const hasCrit = newAlerts.some(a => a.severity === 'critico');
    const notifSeverity = hasCrit ? 'critico' : 'alerta';
    const inAppNotifiedCount = await dispatchBankInAppNotifications({
        db: activeDb,
        io,
        evaluation,
        alerts: newAlerts,
        slotKey
    });

    const tgRecipients = await fetchSentinelRecipients(activeDb);
    let telegramSentCount = 0;
    if (tgRecipients.length > 0 && typeof sendTelegramFn === 'function') {
        const tgMsg = formatBankSentinelMessage({
            fecha: evaluation.fecha,
            alertItems: newAlerts,
            severity: notifSeverity
        });
        const markup = {
            inline_keyboard: [
                [
                    { text: '🏦 Saldos Bancos', callback_data: 'tg_fin:bancos' },
                    { text: '🔄 Re-evaluar Centinela', callback_data: 'tg_sent:refresh' }
                ]
            ]
        };
        for (const tgUser of tgRecipients) {
            try {
                await sendTelegramFn(tgUser.telegram_user_id, tgMsg, markup);
                telegramSentCount += 1;
            } catch (errTg) {
                console.warn(`[BankSentinel] Error enviando Telegram a ${tgUser.telegram_user_id}:`, errTg.message);
            }
        }
    }

    const totalRecipients = inAppNotifiedCount + telegramSentCount;
    try {
        for (const item of newAlerts) {
            await activeDb.query(
                'UPDATE telegram_sentinel_log SET recipients_count = ? WHERE sentinel_key = ? AND alert_date = ?',
                [totalRecipients, item.sentinelKey, evaluation.fecha]
            );
        }
    } catch (_) {
        // Opcional en mocks
    }

    return {
        dispatched: true,
        newAlertsCount: newAlerts.length,
        inAppNotifiedCount,
        telegramSentCount,
        newAlerts,
        evaluation
    };
}

/**
 * Inicializa las franjas horarias automáticas (08:15, 14:30 y chequeo bancario cada 2h America/El_Salvador).
 */
function initTelegramSentinelScheduler(io = null) {
    if (io) setSentinelIo(io);
    if (process.env.NODE_ENV === 'test') return;
    stopTelegramSentinelScheduler();

    const morningTask = cron.schedule('15 8 * * *', () => {
        runProactiveSentinelDispatch({ slotKey: 'morning' }).catch(err => {
            console.error('[TelegramSentinel] Error en ejecución matutina:', err.message);
        });
        runBankSentinelChecks({ slotKey: 'morning', io: sentinelIo }).catch(err => {
            console.error('[BankSentinel] Error en ejecución matutina:', err.message);
        });
    }, { timezone: 'America/El_Salvador' });

    const afternoonTask = cron.schedule('30 14 * * *', () => {
        runProactiveSentinelDispatch({ slotKey: 'afternoon' }).catch(err => {
            console.error('[TelegramSentinel] Error en ejecución vespertina:', err.message);
        });
        runBankSentinelChecks({ slotKey: 'afternoon', io: sentinelIo }).catch(err => {
            console.error('[BankSentinel] Error en ejecución vespertina:', err.message);
        });
    }, { timezone: 'America/El_Salvador' });

    const bankPeriodicTask = cron.schedule('0 */2 * * *', () => {
        runBankSentinelChecks({ slotKey: 'bank_periodic', io: sentinelIo }).catch(err => {
            console.error('[BankSentinel] Error en ejecución periódica:', err.message);
        });
    }, { timezone: 'America/El_Salvador' });

    sentinelTasks = [morningTask, afternoonTask, bankPeriodicTask];
    console.log('[TelegramSentinel] Scheduler activo (08:15, 14:30 y Centinela Bancario c/2h America/El_Salvador).');
}

function stopTelegramSentinelScheduler() {
    for (const task of sentinelTasks) {
        try {
            if (task && typeof task.stop === 'function') task.stop();
        } catch (_) {
            // noop
        }
    }
    sentinelTasks = [];
}

module.exports = {
    ensureSentinelSchema,
    evaluateSentinelAlerts,
    formatSentinelMessage,
    getSentinelInlineMarkup,
    fetchSentinelRecipients,
    runProactiveSentinelDispatch,
    initTelegramSentinelScheduler,
    stopTelegramSentinelScheduler,
    setSentinelIo,
    countBusinessDaysBetween,
    evaluateBankSentinelChecks,
    formatBankSentinelMessage,
    fetchBankInAppRecipients,
    runBankSentinelChecks,
    BANK_SENTINEL_CATEGORY_LABELS
};
