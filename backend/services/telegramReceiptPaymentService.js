const crypto = require('crypto');
const recordatoriosPagosService = require('./recordatoriosPagosService');
const {
    escapeHtml,
    moneyFmt,
    toDisplayDate,
    getDateStr,
    normalizeText
} = require('./telegramTextAndDates');

const RECEIPT_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_RECEIPT_DRAFTS = 150;
const pendingReceiptPayments = new Map();

const MATCH_STOP_WORDS = new Set([
    'pago', 'pagos', 'factura', 'facturas', 'comprobante', 'transferencia', 'remesa',
    'cheque', 'recibo', 'de', 'del', 'la', 'las', 'el', 'los', 'y', 'o', 'en', 'por',
    'para', 'con', 'sin', 'a', 'sa', 'cv', 'sv', 'usd', 'banco', 'bac', 'promerica',
    'davivienda', 'agricola', 'cuscatlan', 'hipotecario', 'cuenta', 'numero', 'ref'
]);

/**
 * Purga borradores de abonos expirados o excedentes en memoria.
 */
function prunePendingReceiptPayments(maxEntries = MAX_RECEIPT_DRAFTS, nowMs = Date.now()) {
    let removed = 0;
    for (const [key, entry] of pendingReceiptPayments.entries()) {
        const ts = entry && typeof entry === 'object' ? (entry.timestamp || 0) : 0;
        if (nowMs - ts > RECEIPT_DRAFT_TTL_MS || entry?.applied) {
            pendingReceiptPayments.delete(key);
            removed += 1;
        }
    }
    const cap = Math.max(1, Number(maxEntries) || MAX_RECEIPT_DRAFTS);
    while (pendingReceiptPayments.size > cap) {
        const oldestKey = pendingReceiptPayments.keys().next().value;
        if (oldestKey === undefined) break;
        pendingReceiptPayments.delete(oldestKey);
        removed += 1;
    }
    return removed;
}

function clearPendingReceiptPayments(ownerTelegramUserId = null) {
    if (!ownerTelegramUserId) {
        pendingReceiptPayments.clear();
        return;
    }
    const ownerStr = String(ownerTelegramUserId);
    for (const [key, entry] of pendingReceiptPayments.entries()) {
        if (String(entry?.ownerTelegramUserId || '') === ownerStr) {
            pendingReceiptPayments.delete(key);
        }
    }
}

function extractSignificantTokens(raw = '') {
    return normalizeText(raw)
        .split(/[\s\-_/]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 3 && !MATCH_STOP_WORDS.has(t));
}

/**
 * Infere un método de pago válido de Control de Pagos desde el OCR del comprobante.
 */
function inferPaymentMethod(analysis = {}) {
    const raw = `${analysis.metodo_pago || ''} ${analysis.tipo_documento || ''}`.trim();
    const norm = normalizeText(raw);
    if (norm.includes('cheque') || norm.includes('chq')) return 'CHEQUE';
    if (norm.includes('deposito') || norm.includes('remesa')) return 'DEPOSITO';
    if (norm.includes('efectivo') || norm.includes('caja')) return 'EFECTIVO';
    if (norm.includes('tarjeta') || norm.includes('visa') || norm.includes('mastercard')) {
        return norm.includes('debito') ? 'TARJETA_DEBITO' : 'TARJETA_CREDITO';
    }
    if (norm.includes('nota de credito')) return 'NOTA_CREDITO';
    if (norm.includes('remision')) return 'REMISION';
    if (norm.includes('transfer')) return 'TRANSFERENCIA';
    const normalized = recordatoriosPagosService.normalizeMetodoPago(analysis.metodo_pago || 'TRANSFERENCIA');
    return normalized || 'TRANSFERENCIA';
}

/**
 * Busca y puntúa vencimientos pendientes de Control de Pagos que coincidan con un comprobante OCR.
 */
async function findMatchingPendingVencimientos({ db, externalDb, analysis = {}, caption = '' } = {}) {
    if (!externalDb || typeof externalDb.query !== 'function') return [];

    let rawRows = [];
    try {
        const [rows] = await externalDb.query(
            `SELECT
                a.id,
                a.id_recordatorio,
                DATE_FORMAT(a.vencimiento, '%Y-%m-%d') AS vence,
                a.estado AS legacy_estado,
                IF(a.estado = 'P', 'PENDIENTE', 'CANCELADO') AS estado,
                a.forma_pago,
                b.descripcion,
                b.monto,
                b.id_ubicacion,
                b.forma_pago AS observacion,
                COALESCE(c.descripcion, '') AS ubicacion
             FROM web_rc_recordatorios_vencimientos a
             INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
             LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
             WHERE b.activo = 1 AND (a.estado = 'P' OR a.estado = 'PENDIENTE' OR a.estado IS NULL)
             ORDER BY a.vencimiento ASC, a.id DESC
             LIMIT 120`
        );
        rawRows = rows || [];
    } catch (errExt) {
        console.warn('[TelegramReceiptPayment] Error consultando vencimientos pendientes:', errExt.message);
        return [];
    }

    if (rawRows.length === 0) return [];

    let enrichedRows = rawRows;
    if (db && typeof db.query === 'function') {
        try {
            enrichedRows = await recordatoriosPagosService.enrichRecordatoriosList(db, rawRows);
        } catch (errEnrich) {
            console.warn('[TelegramReceiptPayment] Aviso enriqueciendo vencimientos:', errEnrich.message);
        }
    }

    const ocrMonto = Number(analysis.monto_usd || analysis.monto || 0);
    const refRaw = String(analysis.referencia || '').trim();
    const refDigits = refRaw.replace(/\D/g, '');
    const hintTokens = [
        ...new Set([
            ...extractSignificantTokens(analysis.beneficiario || ''),
            ...extractSignificantTokens(analysis.concepto || ''),
            ...extractSignificantTokens(caption || '')
        ])
    ];

    const todayStr = getDateStr(0);
    const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();

    const scored = [];
    for (const row of enrichedRows) {
        const montoTotal = Number(row.monto || 0);
        const montoPagado = Number(row.monto_pagado || 0);
        const saldoPendiente = row.saldo_pendiente !== undefined
            ? Number(row.saldo_pendiente)
            : Math.max(0, Math.round((montoTotal - montoPagado) * 100) / 100);
        const estadoPago = String(row.estado_pago || (saldoPendiente <= 0.009 ? 'CANCELADO' : (montoPagado > 0 ? 'PARCIAL' : 'PENDIENTE'))).toUpperCase();

        if (estadoPago === 'CANCELADO' || saldoPendiente <= 0.009) continue;

        let score = 0;
        const reasons = [];

        // 1. Coincidencia de monto
        if (ocrMonto > 0) {
            const diffSaldo = Math.abs(saldoPendiente - ocrMonto);
            const diffTotal = Math.abs(montoTotal - ocrMonto);
            const bestDiff = Math.min(diffSaldo, diffTotal);
            if (bestDiff <= 0.05) {
                score += 55;
                reasons.push('monto exacto');
            } else if (bestDiff <= 1.00) {
                score += 35;
                reasons.push('monto aproximado');
            } else if (ocrMonto < saldoPendiente && saldoPendiente > 0 && (ocrMonto / saldoPendiente) >= 0.15) {
                score += 15;
                reasons.push('posible abono parcial');
            }
        }

        const haystackRaw = `${row.descripcion || ''} ${row.observacion || ''} ${row.ubicacion || ''} ${row.forma_pago || ''}`;
        const haystackNorm = normalizeText(haystackRaw);

        // 2. Coincidencia por referencia o DTE (>= 4 dígitos)
        if (refRaw && refRaw !== 'S/N' && refRaw.length >= 4) {
            const normRef = normalizeText(refRaw);
            if (normRef && haystackNorm.includes(normRef)) {
                score += 35;
                reasons.push(`ref ${refRaw}`);
            } else if (refDigits.length >= 4 && haystackRaw.replace(/\D/g, '').includes(refDigits)) {
                score += 35;
                reasons.push(`código ${refDigits}`);
            }
        }

        // 3. Tokens de beneficiario / concepto / caption
        if (hintTokens.length > 0) {
            let tokenHits = 0;
            for (const tk of hintTokens) {
                if (haystackNorm.includes(tk)) {
                    tokenHits += 1;
                }
            }
            if (tokenHits > 0) {
                score += Math.min(35, tokenHits * 10);
                reasons.push('coincidencia texto');
            }
        }

        // 4. Proximidad temporal (vencido o próximos 15 días)
        const venceStr = String(row.vence || row.fecha_vencimiento || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(venceStr)) {
            const vMs = new Date(`${venceStr}T00:00:00Z`).getTime();
            const diffDays = Math.round((vMs - todayMs) / (1000 * 60 * 60 * 24));
            if (diffDays <= 15) {
                score += 10;
            }
        }

        if (score >= 25) {
            scored.push({
                id: Number(row.id),
                id_recordatorio: Number(row.id_recordatorio || 0),
                descripcion: String(row.descripcion || 'Pago Programado').trim(),
                ubicacion: String(row.ubicacion || '').trim(),
                vence: venceStr || todayStr,
                monto_total: Math.round(montoTotal * 100) / 100,
                monto_pagado: Math.round(montoPagado * 100) / 100,
                saldo_pendiente: Math.round(saldoPendiente * 100) / 100,
                estado_pago: estadoPago,
                tipo_operacion: row.tipo_operacion || 'CXP',
                metodo_pago_preferido: row.metodo_pago_preferido || null,
                cuenta_bancaria_id_preferida: row.cuenta_bancaria_id_preferida || row.cuenta_bancaria_id || null,
                cuenta_label_preferida: row.cuenta_label || null,
                score,
                reasons
            });
        }
    }

    scored.sort((a, b) => b.score - a.score || a.vence.localeCompare(b.vence));
    return scored.slice(0, 3);
}

/**
 * Resuelve la cuenta bancaria del catálogo local que mejor corresponde al comprobante y vencimiento.
 */
async function resolveBankAccountForReceipt({ db, analysis = {}, selectedMatch = null } = {}) {
    let adminCuentas = [];
    if (db && typeof db.query === 'function') {
        try {
            const [rows] = await db.query(
                `SELECT cb.id AS raw_id, cb.id, cb.numero, cb.nombre,
                        COALESCE(b.descripcion, 'BANCO') AS banco_nombre,
                        COALESCE(e.nombre, '') AS empresa_nombre
                 FROM cuentas_bancarias cb
                 LEFT JOIN bancos b ON cb.banco_id = b.id
                 LEFT JOIN empresas e ON cb.empresa_id = e.id
                 WHERE cb.activa = 1
                 ORDER BY b.descripcion ASC, cb.numero ASC`
            );
            adminCuentas = rows || [];
        } catch (errAcc) {
            console.warn('[TelegramReceiptPayment] No se pudieron leer cuentas_bancarias:', errAcc.message);
        }
    }

    const ocrMatched = recordatoriosPagosService.matchExtractedReceiptToCatalog(
        {
            ...analysis,
            banco_origen: analysis.banco_origen || analysis.banco,
            metodo_pago: inferPaymentMethod(analysis)
        },
        adminCuentas,
        {
            tipo_operacion: selectedMatch?.tipo_operacion || 'CXP',
            ubicacion: selectedMatch?.ubicacion || '',
            saldo_pendiente: selectedMatch?.saldo_pendiente || 0,
            monto_total: selectedMatch?.monto_total || 0
        }
    );

    if (ocrMatched?.cuenta_bancaria_id) {
        return {
            cuenta_bancaria_id: Number(ocrMatched.cuenta_bancaria_id),
            cuenta_label: ocrMatched.cuenta_label,
            metodo_pago: ocrMatched.metodo_pago || inferPaymentMethod(analysis),
            tarjeta_ref: ocrMatched.tarjeta_ref || null,
            match_reason: ocrMatched.cuenta_match_reason || 'Catálogo cuentas SIPE'
        };
    }

    if (selectedMatch?.cuenta_bancaria_id_preferida) {
        const found = adminCuentas.find(c => Number(c.raw_id || c.id) === Number(selectedMatch.cuenta_bancaria_id_preferida));
        return {
            cuenta_bancaria_id: Number(selectedMatch.cuenta_bancaria_id_preferida),
            cuenta_label: found
                ? `[${found.banco_nombre}] ${found.nombre} - (${found.numero})`
                : (selectedMatch.cuenta_label_preferida || ocrMatched?.cuenta_label || null),
            metodo_pago: selectedMatch.metodo_pago_preferido || ocrMatched?.metodo_pago || inferPaymentMethod(analysis),
            tarjeta_ref: ocrMatched?.tarjeta_ref || null,
            match_reason: 'Cuenta habitual del vencimiento'
        };
    }

    return {
        cuenta_bancaria_id: null,
        cuenta_label: ocrMatched?.cuenta_label || (analysis.banco ? String(analysis.banco).slice(0, 120) : null),
        metodo_pago: ocrMatched?.metodo_pago || inferPaymentMethod(analysis),
        tarjeta_ref: ocrMatched?.tarjeta_ref || null,
        match_reason: null
    };
}

/**
 * Construye los botones inline del borrador de abono desde comprobante.
 */
function buildReceiptDraftInlineMarkup(draftId, matches = [], analysis = {}) {
    if (!draftId || !Array.isArray(matches) || matches.length === 0) return null;
    const primary = matches[0];
    const ocrMonto = Number(analysis.monto_usd || 0);
    const applyAmount = Math.min(ocrMonto > 0 ? ocrMonto : primary.saldo_pendiente, primary.saldo_pendiente);

    const rows = [
        [
            {
                text: `✅ Aplicar Abono (${moneyFmt(applyAmount)})`,
                callback_data: `tg_rcp:ok:${draftId}:${primary.id}`
            }
        ]
    ];

    if (matches.length > 1) {
        const altRow = matches.slice(1, 3).map(m => ({
            text: `🔄 ${String(m.descripcion || 'Otro').slice(0, 18)} (${moneyFmt(m.saldo_pendiente)})`,
            callback_data: `tg_rcp:sel:${draftId}:${m.id}`
        }));
        rows.push(altRow);
    }

    rows.push([{ text: '❌ Descartar', callback_data: `tg_rcp:no:${draftId}` }]);
    return { inline_keyboard: rows };
}

/**
 * Prepara en memoria un borrador de abono a Control de Pagos tras analizar una foto o PDF.
 */
async function prepareReceiptPaymentDraft({
    db,
    externalDb,
    user,
    effectivePerms = {},
    fileBuffer = null,
    mimeType = 'image/jpeg',
    fileName = 'comprobante.jpg',
    analysis = {},
    caption = ''
} = {}) {
    const canControlPagos = Boolean(effectivePerms.control_pagos || effectivePerms.saldos_banco || effectivePerms.isAdmin);
    if (!canControlPagos || !user?.telegram_user_id) {
        return { draftId: null, matches: [], sectionHtml: '', inlineMarkup: null };
    }

    const detectedAmount = Number(analysis.monto_usd || analysis.monto || 0);
    if (!Number.isFinite(detectedAmount) || detectedAmount <= 0) {
        return { draftId: null, matches: [], sectionHtml: '', inlineMarkup: null };
    }

    const matches = await findMatchingPendingVencimientos({ db, externalDb, analysis, caption });
    if (!matches || matches.length === 0) {
        return { draftId: null, matches: [], sectionHtml: '', inlineMarkup: null };
    }

    prunePendingReceiptPayments(MAX_RECEIPT_DRAFTS);

    const primary = matches[0];
    const resolvedAccount = await resolveBankAccountForReceipt({ db, analysis, selectedMatch: primary });
    const draftId = crypto.randomBytes(5).toString('hex');

    pendingReceiptPayments.set(draftId, {
        draftId,
        ownerTelegramUserId: String(user.telegram_user_id),
        fileBuffer: Buffer.isBuffer(fileBuffer) ? fileBuffer : null,
        mimeType: mimeType || 'image/jpeg',
        fileName: fileName || 'comprobante.jpg',
        analysis,
        caption,
        matches,
        resolvedAccount,
        applying: false,
        applied: false,
        timestamp: Date.now()
    });

    const amountToApply = Math.min(detectedAmount, primary.saldo_pendiente);
    const remainingAfter = Math.max(0, Math.round((primary.saldo_pendiente - amountToApply) * 100) / 100);
    const willCancel = remainingAfter <= 0.01;

    let sectionHtml = `\n\n━━━━━━━━━━━━━━━━━━━━━\n`;
    sectionHtml += `💳 <b>COINCIDENCIA EN CONTROL DE PAGOS</b>\n`;
    sectionHtml += `• <b>Compromiso (#${primary.id}):</b> <b>${escapeHtml(primary.descripcion)}</b>`;
    if (primary.ubicacion) sectionHtml += ` (${escapeHtml(primary.ubicacion)})`;
    sectionHtml += `\n`;
    sectionHtml += `• <b>Vence:</b> <code>${toDisplayDate(primary.vence)}</code> | <b>Saldo actual:</b> <code>${moneyFmt(primary.saldo_pendiente)}</code>\n`;
    sectionHtml += `• <b>Monto a aplicar:</b> <b>${moneyFmt(amountToApply)}</b> → `;
    sectionHtml += willCancel
        ? `<b>CANCELADO (100%)</b> ✅\n`
        : `<b>PARCIAL</b> (restaría <code>${moneyFmt(remainingAfter)}</code>)\n`;
    sectionHtml += `• <b>Forma / Cuenta:</b> <code>${escapeHtml(resolvedAccount.metodo_pago)}</code>`;
    if (resolvedAccount.cuenta_label) {
        sectionHtml += ` · ${escapeHtml(resolvedAccount.cuenta_label)}`;
    }
    sectionHtml += `\n`;
    if (matches.length > 1) {
        sectionHtml += `• <i>También coincide con ${matches.length - 1} compromiso(s) adicional(es) abajo.</i>\n`;
    }
    sectionHtml += `\n<i>Pulsa</i> <b>✅ Aplicar Abono</b> <i>para registrar el pago y adjuntar este comprobante automáticamente.</i>`;

    return {
        draftId,
        matches,
        resolvedAccount,
        sectionHtml,
        inlineMarkup: buildReceiptDraftInlineMarkup(draftId, matches, analysis)
    };
}

/**
 * Aplica de forma atómica un borrador de comprobante a un vencimiento de Control de Pagos.
 */
async function applyReceiptDraftToVencimiento({ db, externalDb, draft, vencimientoId, tgUser, effPerms = {} } = {}) {
    if (!db || !externalDb) {
        return { ok: false, status: 'db_unavailable', message: 'Base de datos no disponible para registrar abono.' };
    }
    const canControlPagos = Boolean(effPerms.control_pagos || effPerms.saldos_banco || effPerms.isAdmin);
    if (!canControlPagos || effPerms.inactiveInSipe) {
        return { ok: false, status: 'forbidden', message: '⛔ No tienes permiso para aplicar abonos en Control de Pagos.' };
    }
    if (!draft) {
        return { ok: false, status: 'expired', message: '⌛ Este comprobante expiró o ya fue procesado. Envíalo nuevamente.' };
    }
    if (String(tgUser?.telegram_user_id || '') !== String(draft.ownerTelegramUserId || '')) {
        return { ok: false, status: 'not_owner', message: '⛔ Solo el usuario que envió el comprobante puede confirmarlo.' };
    }
    if (draft.applied || draft.applying) {
        return { ok: false, status: 'already_applied', message: '✅ Este comprobante ya fue aplicado anteriormente.' };
    }

    const venId = parseInt(vencimientoId, 10);
    if (!venId || venId <= 0) {
        return { ok: false, status: 'invalid_id', message: 'Identificador de vencimiento inválido.' };
    }

    draft.applying = true;
    try {
        await recordatoriosPagosService.ensureRecordatoriosPagosTables(db);

        const [venRows] = await externalDb.query(
            `SELECT a.id, a.id_recordatorio, a.estado, b.descripcion, b.monto, c.descripcion AS ubicacion
             FROM web_rc_recordatorios_vencimientos a
             INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
             LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
             WHERE a.id = ? LIMIT 1`,
            [venId]
        );
        if (!venRows || venRows.length === 0) {
            return { ok: false, status: 'not_found', message: '⚠️ No se encontró el vencimiento seleccionado.' };
        }
        const ven = venRows[0];

        const [abonosPrevios] = await db.query(
            `SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM recordatorios_pagos_abonos WHERE vencimiento_id = ?`,
            [venId]
        );
        const yaPagado = Number(abonosPrevios?.[0]?.total_pagado || 0);
        const saldoActual = Math.max(0, Math.round((Number(ven.monto || 0) - yaPagado) * 100) / 100);
        if (saldoActual <= 0.009) {
            draft.applied = true;
            pendingReceiptPayments.delete(draft.draftId);
            return { ok: false, status: 'already_paid', message: '✅ Este compromiso ya se encuentra liquidado al 100%.' };
        }

        const analysis = draft.analysis || {};
        const matchObj = (draft.matches || []).find(m => Number(m.id) === venId) || { id: venId, ubicacion: ven.ubicacion, saldo_pendiente: saldoActual, monto_total: ven.monto };
        const accountInfo = await resolveBankAccountForReceipt({ db, analysis, selectedMatch: matchObj });

        const rawAmount = Number(analysis.monto_usd || analysis.monto || saldoActual);
        const montoAplicado = Math.round(Math.min(rawAmount > 0 ? rawAmount : saldoActual, saldoActual) * 100) / 100;
        const cleanFecha = recordatoriosPagosService.sanitizeIsoDate(analysis.fecha) || getDateStr(0);

        const normOp = recordatoriosPagosService.normalizeTipoOperacion(matchObj.tipo_operacion || 'CXP');
        const normMetodo = recordatoriosPagosService.normalizeMetodoPago(accountInfo.metodo_pago || inferPaymentMethod(analysis));
        const parsedCuentaId = accountInfo.cuenta_bancaria_id ? parseInt(accountInfo.cuenta_bancaria_id, 10) || null : null;
        const safeCuentaLabel = accountInfo.cuenta_label ? String(accountInfo.cuenta_label).trim().slice(0, 150) : null;
        const safeTarjeta = accountInfo.tarjeta_ref ? String(accountInfo.tarjeta_ref).trim().slice(0, 100) : null;
        const safeBeneficiario = analysis.beneficiario ? String(analysis.beneficiario).trim().slice(0, 150) : null;
        const safeRef = (analysis.referencia && analysis.referencia !== 'S/N') ? String(analysis.referencia).trim().slice(0, 120) : null;
        const safeNotas = `Aplicado desde Telegram (${analysis.tipo_documento || 'Comprobante'})`
            + (draft.caption ? ` · ${String(draft.caption).slice(0, 200)}` : '');

        const actor = effPerms?.linkedUser?.username || tgUser?.telegram_username || tgUser?.first_name || 'telegram_bot';
        const estadoConciliacion = (parsedCuentaId && recordatoriosPagosService.BANK_RECONCILIABLE_METHODS.has(normMetodo))
            ? 'PENDIENTE'
            : 'NO_APLICA';

        const [ins] = await db.query(
            `INSERT INTO recordatorios_pagos_abonos
                (vencimiento_id, recordatorio_id, ubicacion, descripcion_ref, tipo_operacion, metodo_pago,
                 cuenta_bancaria_id, cuenta_label, tarjeta_ref, beneficiario, referencia_doc, fecha_pago, monto, notas,
                 estado_conciliacion, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                venId,
                ven.id_recordatorio,
                String(ven.ubicacion || '').slice(0, 120),
                String(ven.descripcion || '').slice(0, 150),
                normOp,
                normMetodo,
                parsedCuentaId,
                safeCuentaLabel,
                safeTarjeta,
                safeBeneficiario,
                safeRef,
                cleanFecha,
                montoAplicado,
                safeNotas.slice(0, 1000),
                estadoConciliacion,
                String(actor).slice(0, 100)
            ]
        );
        const abonoId = ins.insertId;

        await db.query(
            `INSERT INTO recordatorios_vencimientos_meta
                (vencimiento_id, recordatorio_id, tipo_operacion, metodo_pago_preferido, cuenta_bancaria_id, cuenta_label, tarjeta_ref, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                tipo_operacion = VALUES(tipo_operacion),
                metodo_pago_preferido = VALUES(metodo_pago_preferido),
                cuenta_bancaria_id = COALESCE(VALUES(cuenta_bancaria_id), cuenta_bancaria_id),
                cuenta_label = COALESCE(VALUES(cuenta_label), cuenta_label),
                tarjeta_ref = COALESCE(VALUES(tarjeta_ref), tarjeta_ref),
                updated_by = VALUES(updated_by)`,
            [venId, ven.id_recordatorio, normOp, normMetodo, parsedCuentaId, safeCuentaLabel, safeTarjeta, String(actor).slice(0, 100)]
        );

        let savedComprobante = null;
        if (Buffer.isBuffer(draft.fileBuffer) && draft.fileBuffer.length > 0) {
            try {
                const mimeClean = (draft.mimeType === 'image/jpg' ? 'image/jpeg' : draft.mimeType) || 'image/jpeg';
                const dataUrl = `data:${mimeClean};base64,${draft.fileBuffer.toString('base64')}`;
                const saved = recordatoriosPagosService.saveReceiptBase64({
                    dataUrl,
                    nombreOriginal: draft.fileName || 'comprobante_telegram.jpg',
                    vencimientoId: venId
                });
                savedComprobante = saved;
                await db.query(
                    `INSERT INTO recordatorios_pagos_comprobantes
                        (vencimiento_id, abono_id, nombre_original, archivo_url, mime_type, tamano_bytes, nota, uploaded_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        venId,
                        abonoId,
                        saved.nombre_original,
                        saved.archivo_url,
                        saved.mime_type,
                        saved.tamano_bytes,
                        'Adjuntado vía Telegram Bot',
                        String(actor).slice(0, 100)
                    ]
                );
            } catch (compErr) {
                console.warn('[TelegramReceiptPayment] Aviso guardando archivo de comprobante:', compErr.message);
            }
        }

        const synced = await recordatoriosPagosService.syncVencimientoWithAbonos({ db, externalDb, vencimientoId: venId });

        try {
            await db.query(
                `INSERT INTO bitacora_logs (user_id, username, accion, entidad, entidad_id, detalles, ip_address)
                 VALUES (?, ?, 'CREATE_ABONO_TELEGRAM', 'recordatorios_pagos_abonos', ?, ?, 'TelegramBot')`,
                [
                    effPerms?.linkedUser?.id || tgUser?.user_id || null,
                    String(actor).slice(0, 100),
                    String(abonoId),
                    JSON.stringify({
                        vencimiento_id: venId,
                        monto: montoAplicado,
                        metodo_pago: normMetodo,
                        referencia_doc: safeRef,
                        telegram_user_id: tgUser?.telegram_user_id || null
                    })
                ]
            );
        } catch (_) {
            // Bitácora opcional en mocks
        }

        try {
            await db.query(
                'INSERT INTO telegram_bitacora (telegram_user_id, comando, consulta, autorizado) VALUES (?, ?, ?, 1)',
                [
                    String(tgUser?.telegram_user_id || ''),
                    'APPLY_ABONO_TELEGRAM',
                    `Abono #${abonoId} ven #${venId}: ${moneyFmt(montoAplicado)}`.slice(0, 250)
                ]
            );
        } catch (_) {
            // Ignorar si mock no incluye telegram_bitacora
        }

        draft.applied = true;
        draft.abonoId = abonoId;
        pendingReceiptPayments.delete(draft.draftId);

        return {
            ok: true,
            abonoId,
            vencimiento: ven,
            montoAplicado,
            metodoPago: normMetodo,
            cuentaLabel: safeCuentaLabel,
            referenciaDoc: safeRef,
            fechaPago: cleanFecha,
            archivoUrl: savedComprobante?.archivo_url || null,
            synced
        };
    } finally {
        draft.applying = false;
    }
}

/**
 * Procesa los botones inline `tg_rcp:*` para aplicar o descartar abonos de comprobantes.
 */
async function handleReceiptPaymentCallback({ db, externalDb, cq, tgUser, effPerms, transport = {} } = {}) {
    const data = String(cq?.data || '');
    if (!data.startsWith('tg_rcp:')) return false;

    const {
        sendTelegramMessage = async () => null,
        answerCallbackQuery = async () => {},
        editMessageReplyMarkup = async () => {},
        getMainReplyKeyboard = () => undefined
    } = transport;

    const chatId = cq.message?.chat?.id;
    const msgId = cq.message?.message_id;
    const parts = data.split(':');
    const action = parts[1];
    const draftId = parts[2];
    const targetVenId = parts[3];

    const draft = pendingReceiptPayments.get(draftId);

    if (action === 'no') {
        if (!draft) {
            await answerCallbackQuery(cq.id, 'Borrador ya descartado o expirado.');
            if (chatId && msgId) await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
            return true;
        }
        if (String(tgUser?.telegram_user_id || '') !== String(draft.ownerTelegramUserId || '')) {
            await answerCallbackQuery(cq.id, '⛔ Solo el usuario que envió el comprobante puede descartarlo.');
            return true;
        }
        pendingReceiptPayments.delete(draftId);
        await answerCallbackQuery(cq.id, '❌ Comprobante descartado.');
        if (chatId && msgId) await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
        if (chatId) {
            await sendTelegramMessage(chatId, '👌 Abono descartado. No se realizaron cambios en Control de Pagos.', getMainReplyKeyboard());
        }
        return true;
    }

    if (action === 'sel') {
        if (!draft) {
            await answerCallbackQuery(cq.id, '⌛ El borrador expiró. Reenvía el comprobante.');
            return true;
        }
        if (String(tgUser?.telegram_user_id || '') !== String(draft.ownerTelegramUserId || '')) {
            await answerCallbackQuery(cq.id, '⛔ Solo el autor del comprobante puede confirmarlo.');
            return true;
        }
        const selectedMatch = (draft.matches || []).find(m => String(m.id) === String(targetVenId));
        if (!selectedMatch) {
            await answerCallbackQuery(cq.id, '⚠️ Compromiso no encontrado en las coincidencias.');
            return true;
        }
        const applyAmount = Math.min(Number(draft.analysis?.monto_usd || selectedMatch.saldo_pendiente), selectedMatch.saldo_pendiente);
        await answerCallbackQuery(cq.id, `Seleccionado #${selectedMatch.id}`);
        if (chatId) {
            await sendTelegramMessage(
                chatId,
                `📌 <b>Confirmar Abono Alternativo</b>\n\n` +
                `• <b>Compromiso (#${selectedMatch.id}):</b> <b>${escapeHtml(selectedMatch.descripcion)}</b>` +
                (selectedMatch.ubicacion ? ` (${escapeHtml(selectedMatch.ubicacion)})` : '') + `\n` +
                `• <b>Saldo Pendiente:</b> <code>${moneyFmt(selectedMatch.saldo_pendiente)}</code>\n` +
                `• <b>Monto a Aplicar:</b> <b>${moneyFmt(applyAmount)}</b>\n\n` +
                `<i>Confirma abajo para registrar este abono:</i>`,
                {
                    inline_keyboard: [
                        [
                            { text: `✅ Confirmar Abono (${moneyFmt(applyAmount)})`, callback_data: `tg_rcp:ok:${draftId}:${selectedMatch.id}` },
                            { text: '❌ Cancelar', callback_data: `tg_rcp:no:${draftId}` }
                        ]
                    ]
                }
            );
        }
        return true;
    }

    if (action === 'ok') {
        const result = await applyReceiptDraftToVencimiento({
            db,
            externalDb,
            draft,
            vencimientoId: targetVenId,
            tgUser,
            effPerms
        });

        if (!result.ok) {
            await answerCallbackQuery(cq.id, result.message.slice(0, 180));
            if (chatId && (result.status === 'already_applied' || result.status === 'already_paid' || result.status === 'expired') && msgId) {
                await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
            }
            if (chatId) {
                await sendTelegramMessage(chatId, escapeHtml(result.message), getMainReplyKeyboard());
            }
            return true;
        }

        await answerCallbackQuery(cq.id, '✅ Abono registrado exitosamente');
        if (chatId && msgId) {
            await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
        }

        const bal = result.synced?.balance || {};
        const estadoLabel = bal.estado_pago === 'CANCELADO'
            ? '🟢 <b>CANCELADO (100% liquidado)</b>'
            : `🟡 <b>PARCIAL (${bal.porcentaje_pagado || 0}%)</b> · Saldo pendiente: <b>${moneyFmt(bal.saldo_pendiente || 0)}</b>`;

        let okMsg = `✅ <b>ABONO REGISTRADO EN CONTROL DE PAGOS</b>\n`;
        okMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
        okMsg += `• <b>Abono ID:</b> <code>#${result.abonoId}</code>\n`;
        okMsg += `• <b>Compromiso:</b> <b>${escapeHtml(result.vencimiento?.descripcion || 'Pago')}</b>\n`;
        if (result.vencimiento?.ubicacion) {
            okMsg += `• <b>Ubicación:</b> ${escapeHtml(result.vencimiento.ubicacion)}\n`;
        }
        okMsg += `• <b>Monto Aplicado:</b> <b>${moneyFmt(result.montoAplicado)}</b>\n`;
        okMsg += `• <b>Método:</b> <code>${escapeHtml(result.metodoPago)}</code>`;
        if (result.cuentaLabel) okMsg += ` · ${escapeHtml(result.cuentaLabel)}`;
        okMsg += `\n`;
        if (result.referenciaDoc) okMsg += `• <b>Referencia:</b> <code>${escapeHtml(result.referenciaDoc)}</code>\n`;
        okMsg += `• <b>Estado del Compromiso:</b> ${estadoLabel}\n`;
        if (result.archivoUrl) okMsg += `• 📎 <b>Comprobante archivado en SIPE Admin</b>\n`;
        okMsg += `\n<i>Registrado por ${escapeHtml(tgUser?.first_name || tgUser?.telegram_username || 'Telegram')}.</i>`;

        if (chatId) {
            await sendTelegramMessage(chatId, okMsg, getMainReplyKeyboard());
        }
        return true;
    }

    return false;
}

module.exports = {
    pendingReceiptPayments,
    prunePendingReceiptPayments,
    clearPendingReceiptPayments,
    inferPaymentMethod,
    findMatchingPendingVencimientos,
    resolveBankAccountForReceipt,
    buildReceiptDraftInlineMarkup,
    prepareReceiptPaymentDraft,
    applyReceiptDraftToVencimiento,
    handleReceiptPaymentCallback
};
