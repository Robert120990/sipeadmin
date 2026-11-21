const cron = require('node-cron');
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);

const recordatoriosPagosService = require('./recordatoriosPagosService');
const { getAuditoriaDineroEnTransito } = require('./operationalAuditService');
const { auditStationCloseoutsAndRemesas } = require('./stationDiscrepancyAuditService');
const { getSaldosBancosData } = require('./telegramDataService');
const { sendTelegramMessage } = require('./telegramTransportService');
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
                 WHERE cb.activa = 1`
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

    const hasAlerts = alertKeys.length > 0;
    const isCritico = brechaGlobalUsd > 0 ||
        cuentasConDeficit.length > 0 ||
        remesasCriticas.some(r => r.severidad === 'critico' || Number(r.dias_transito) >= 4) ||
        stationAuditData?.severity === 'critico';
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
        } : null
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
    const summaryText = `Bancos=${result.liquidez.total_bancos_usd} Comp=${result.liquidez.total_compromisos_3d_usd} Transito48h=${result.transito.total_remesas_48h_usd}`.slice(0, 480);

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
        sentinelKey,
        result
    };
}

/**
 * Inicializa las franjas horarias automáticas (08:15 y 14:30 America/El_Salvador).
 */
function initTelegramSentinelScheduler() {
    if (process.env.NODE_ENV === 'test') return;
    stopTelegramSentinelScheduler();

    const morningTask = cron.schedule('15 8 * * *', () => {
        runProactiveSentinelDispatch({ slotKey: 'morning' }).catch(err => {
            console.error('[TelegramSentinel] Error en ejecución matutina:', err.message);
        });
    }, { timezone: 'America/El_Salvador' });

    const afternoonTask = cron.schedule('30 14 * * *', () => {
        runProactiveSentinelDispatch({ slotKey: 'afternoon' }).catch(err => {
            console.error('[TelegramSentinel] Error en ejecución vespertina:', err.message);
        });
    }, { timezone: 'America/El_Salvador' });

    sentinelTasks = [morningTask, afternoonTask];
    console.log('[TelegramSentinel] Scheduler activo (08:15 y 14:30 America/El_Salvador).');
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
    stopTelegramSentinelScheduler
};
