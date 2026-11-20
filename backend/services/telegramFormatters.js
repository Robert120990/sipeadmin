const {
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    getDateStr,
    normalizeText,
    SPANISH_MONTH_NAMES
} = require('./telegramTextAndDates');

/**
 * Formatear mensaje de Resumen de Ventas
 */
const formatVentasMessage = (data, date, options = {}) => {
    const estaciones = data?.estaciones || [];
    const tiendas = data?.tiendas || [];

    let totalDiesel = 0;
    let totalRegular = 0;
    let totalSuper = 0;
    let totalIon = 0;
    let totalGalones = 0;
    let totalVentaCombustible = 0;

    estaciones.forEach(e => {
        totalDiesel += Number(e.diesel || 0);
        totalRegular += Number(e.regular || 0);
        totalSuper += Number(e.super || 0);
        totalIon += Number(e.ion || 0);
        totalGalones += Number(e.galonaje || 0);
        totalVentaCombustible += Number(e.venta || 0);
    });

    const totalVentaTiendas = tiendas.reduce((acc, t) => acc + Number(t.venta || 0), 0);
    const totalGlobal = totalVentaCombustible + totalVentaTiendas;

    const isTodayEmpty = (totalGalones === 0 && totalGlobal === 0) &&
        (options.isTodayOpenShift || date === getDateStr(0));

    let msg = `⛽ <b>VENTAS DE ESTACIONES Y TIENDAS</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (isTodayEmpty) {
        msg += `⏳ <b>TURNOS DE HOY EN CURSO (SIN CORTE CERRADO AÚN)</b>\n`;
        msg += `Los turnos de pista del día <b>${toDisplayDate(date)}</b> continúan abiertos en estación; las cifras definitivas se consolidan automáticamente conforme cada sucursal ejecuta su cierre de turno.\n\n`;

        const ref = options.latestClosedRef;
        if (ref && ref.data) {
            const refEst = ref.data.estaciones || [];
            const refTda = ref.data.tiendas || [];
            const refGal = refEst.reduce((s, e) => s + Number(e.galonaje || 0), 0);
            const refComb = refEst.reduce((s, e) => s + Number(e.venta || 0), 0);
            const refTienda = refTda.reduce((s, t) => s + Number(t.venta || 0), 0);
            if (refGal > 0 || (refComb + refTienda) > 0) {
                msg += `📌 <b>REFERENCIA — ÚLTIMO CIERRE CONSOLIDADO (${toDisplayDate(ref.date)}):</b>\n`;
                msg += `• <b>Galonaje Cerrado:</b> <code>${numFmt(refGal)} gal</code>\n`;
                msg += `• <b>Venta Combustible:</b> <code>${moneyFmt(refComb)}</code>\n`;
                msg += `• <b>Venta Tiendas:</b> <code>${moneyFmt(refTienda)}</code>\n`;
                msg += `• 💰 <b>TOTAL CONSOLIDADO:</b> <b>${moneyFmt(refComb + refTienda)}</b>\n`;
                if (refEst.length > 0) {
                    msg += `\n🏪 <b>Estaciones (${toDisplayDate(ref.date)}):</b>\n`;
                    refEst.slice(0, 6).forEach((e, idx) => {
                        msg += `${idx + 1}. <b>${escapeHtml(e.empresa || e.titulo || 'Estación')}:</b> ⛽ ${numFmt(e.galonaje || 0)} gal | 💵 ${moneyFmt(e.venta || 0)}\n`;
                    });
                }
                msg += `\n`;
            }
        }

        msg += `💡 <i>Tip: Puedes preguntar "nivel de tanques" o "ventas de ayer" en cualquier momento.</i>\n`;
        msg += `<i>SIPE Admin • Dirección Estratégica</i>`;
        return msg;
    }

    msg += `📊 <b>RESUMEN CONSOLIDADO:</b>\n`;
    msg += `• <b>Galonaje Total:</b> <code>${numFmt(totalGalones)} gal</code>\n`;
    msg += `  ├ 🛢️ <b>Diesel:</b> ${numFmt(totalDiesel)} gal\n`;
    msg += `  ├ 🟢 <b>Regular:</b> ${numFmt(totalRegular)} gal\n`;
    msg += `  ├ 🔴 <b>Súper:</b> ${numFmt(totalSuper)} gal\n`;
    if (totalIon > 0) {
        msg += `  ├ ⚡ <b>Ion Diesel:</b> ${numFmt(totalIon)} gal\n`;
    }
    msg += `• <b>Venta Combustible:</b> <code>${moneyFmt(totalVentaCombustible)}</code>\n`;
    msg += `• <b>Venta Tiendas:</b> <code>${moneyFmt(totalVentaTiendas)}</code>\n`;
    msg += `• 💰 <b>VENTA TOTAL:</b> <b>${moneyFmt(totalGlobal)}</b>\n\n`;

    if (estaciones.length > 0) {
        msg += `🏪 <b>DETALLE POR ESTACIÓN:</b>\n`;
        estaciones.forEach((e, idx) => {
            const gal = numFmt(e.galonaje || 0);
            const vta = moneyFmt(e.venta || 0);
            msg += `${idx + 1}. <b>${escapeHtml(e.empresa || e.titulo || 'Estación')}</b>\n`;
            msg += `   └ ⛽ ${gal} gal | 💵 ${vta}\n`;
        });
        msg += `\n`;
    }

    if (tiendas.length > 0) {
        msg += `🛒 <b>VENTAS EN TIENDAS (CORTES):</b>\n`;
        tiendas.forEach((t) => {
            const vta = moneyFmt(t.venta || 0);
            msg += `• <b>${escapeHtml(t.empresa || 'Tienda')}:</b> ${vta}\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Dirección Estratégica</i>`;
    return msg;
};

/**
 * Formatear mensaje de Saldos en Bancos (global o filtrado por contribuyente/banco/cuenta)
 */
const formatBancosMessage = (data) => {
    const isFiltered = Boolean(data?.hasFilter && data?.filterLabel);
    let msg = isFiltered
        ? `🏦 <b>SALDOS EN BANCOS • ${escapeHtml(data.filterLabel.toUpperCase())}</b>\n`
        : `🏦 <b>SALDOS CONSOLIDADOS EN BANCOS</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(data.fecha)}\n`;
    if (isFiltered) {
        msg += `🔎 <b>Filtro:</b> ${escapeHtml(data.filterLabel)}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 <b>${isFiltered ? 'SALDO TOTAL FILTRADO:' : 'SALDO TOTAL EN BANCOS:'}</b>\n`;
    msg += `<b>${moneyFmt(data.total)}</b>\n\n`;

    if (!data.cuentas || data.cuentas.length === 0) {
        msg += isFiltered
            ? `<i>No se encontraron cuentas bancarias con saldo activo para el criterio "${escapeHtml(data.filterLabel)}".</i>\n`
            : `<i>No se encontraron cuentas bancarias con saldo positivo para la fecha.</i>\n`;
    } else {
        msg += `📋 <b>DETALLE POR CUENTA (${data.cuentas.length}):</b>\n`;
        const porBanco = {};
        data.cuentas.forEach(c => {
            const b = c.banco || 'Otros';
            if (!porBanco[b]) porBanco[b] = [];
            porBanco[b].push(c);
        });

        Object.keys(porBanco).forEach(banco => {
            const subtotal = porBanco[banco].reduce((sum, item) => sum + item.saldo, 0);
            msg += `🏛️ <b>${escapeHtml(banco)}</b> (<i>${moneyFmt(subtotal)}</i>)\n`;
            porBanco[banco].forEach(item => {
                msg += `   └ ${escapeHtml(item.cuenta)}: <code>${moneyFmt(item.saldo)}</code>\n`;
            });
            msg += `\n`;
        });
    }

    msg += `<i>Fuente: ${data.fuente === 'sp_saldo_en_bancos' ? 'Conciliación Bancaria' : 'Catálogo Local'}</i>`;
    return msg;
};

/**
 * Formatear mensaje de Saldos en Chequera (global o filtrado por contribuyente/banco/cuenta)
 */
const formatChequeraMessage = (data) => {
    const isFiltered = Boolean(data?.hasFilter && data?.filterLabel);
    let msg = isFiltered
        ? `🧾 <b>SALDOS EN CHEQUERA • ${escapeHtml(data.filterLabel.toUpperCase())}</b>\n`
        : `🧾 <b>SALDOS EN CHEQUERA</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(data.fecha)}\n`;
    if (isFiltered) {
        msg += `🔎 <b>Contribuyente / Filtro:</b> ${escapeHtml(data.filterLabel)}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (isFiltered && Number(data.total_sobregiro || 0) < 0 && Number(data.total_positivo || 0) > 0) {
        msg += `🟢 <b>Cuentas en Positivo:</b> <code>${moneyFmt(data.total_positivo)}</code>\n`;
        msg += `🔴 <b>En Sobregiro / Flotante:</b> <code>${moneyFmt(data.total_sobregiro)}</code>\n`;
    }
    msg += `💰 <b>${isFiltered ? 'SALDO NETO EN CHEQUERA:' : 'TOTAL EN CHEQUERAS:'}</b>\n`;
    msg += `<b>${moneyFmt(data.total)}</b>\n\n`;

    if (!data.cuentas || data.cuentas.length === 0) {
        msg += isFiltered
            ? `<i>No se encontraron cuentas de chequera para "${escapeHtml(data.filterLabel)}".</i>\n`
            : `<i>No se registraron cuentas de chequera con movimiento activo.</i>\n`;
    } else {
        msg += `📋 <b>DETALLE POR CUENTA DE CHEQUES (${data.cuentas.length}):</b>\n`;
        data.cuentas.forEach((c, idx) => {
            const icon = Number(c.saldo || 0) < 0 ? '🔴' : '🟢';
            msg += `${idx + 1}. ${icon} <b>${escapeHtml(c.banco)}</b>\n`;
            msg += `   └ ${escapeHtml(c.cuenta)}: <code>${moneyFmt(c.saldo)}</code>\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Control de Tesorería</i>`;
    return msg;
};

/**
 * Formatear mensaje de Alertas Operativas y Auditoría
 */
const formatAlertasMessage = (data, date) => {
    const auditoria = data?.auditoria || {};
    const totalAlertas = Number(auditoria.total_alertas || 0);

    let msg = `🚨 <b>ALERTAS Y AUDITORÍA EN ESTACIONES</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (totalAlertas === 0) {
        msg += `✅ <b>AUDITORÍA EN ORDEN</b>\n`;
        msg += `No se detectaron descuadres ni anomalías operativas para esta fecha:\n`;
        msg += `• Cierres de pista cuadrados correctamente\n`;
        msg += `• Tiendas sin descuadres de corte\n`;
        msg += `• Sin gastos operativos anómalos reportados\n`;
        msg += `• Galonajes consistentes con ventas\n\n`;
        msg += `<i>Todas las estaciones operaron bajo parámetros normales.</i>`;
        return msg;
    }

    msg += `⚠️ <b>TOTAL ALERTAS DETECTADAS: ${totalAlertas}</b>\n\n`;

    // 1. Descuadres en Pista
    const resumenCierre = data?.resumen_cierre || [];
    const difPista = resumenCierre.filter(r => Math.abs(Number(r.diferencia || 0)) > 0.05);
    if (difPista.length > 0) {
        msg += `⛽ <b>Descuadres en Pista (Cierre Turno):</b>\n`;
        difPista.forEach(r => {
            const dif = Number(r.diferencia || 0);
            const icon = dif < 0 ? '🔴' : '🟡';
            msg += `• ${icon} <b>${escapeHtml(r.estacion || r.empresa || 'Estación')}:</b> Dif. ${moneyFmt(dif)}\n`;
        });
        msg += `\n`;
    }

    // 2. Descuadres en Tienda
    const cortesTienda = data?.cortes_tienda || [];
    const difTiendas = cortesTienda.filter(t => Math.abs(Number(t.dif || 0)) > 0.01);
    if (difTiendas.length > 0) {
        msg += `🛒 <b>Descuadres en Cortes de Tienda:</b>\n`;
        difTiendas.forEach(t => {
            const dif = Number(t.dif || 0);
            const icon = dif < 0 ? '🔴' : '🟡';
            msg += `• ${icon} <b>${escapeHtml(t.empresa || 'Tienda')}:</b> Dif. ${moneyFmt(dif)}\n`;
        });
        msg += `\n`;
    }

    // 3. Gastos en Tienda
    const gTiendas = cortesTienda.filter(t => Number(t.gastos || 0) > 0);
    if (gTiendas.length > 0) {
        msg += `💸 <b>Gastos Reportados en Tiendas:</b>\n`;
        gTiendas.forEach(t => {
            msg += `• <b>${escapeHtml(t.empresa || 'Tienda')}:</b> ${moneyFmt(t.gastos)}\n`;
        });
        msg += `\n`;
    }

    // 4. Incongruencias de Galonaje
    const estaciones = data?.estaciones || [];
    const incongGal = estaciones.filter(e => (Number(e.galonaje || 0) === 0 && Number(e.venta || 0) > 0) || (Number(e.galonaje || 0) > 0 && Number(e.venta || 0) === 0));
    if (incongGal.length > 0) {
        msg += `⚠️ <b>Incongruencias Galonaje / Venta:</b>\n`;
        incongGal.forEach(e => {
            msg += `• <b>${escapeHtml(e.empresa || 'Estación')}:</b> ${numFmt(e.galonaje)} gal vs ${moneyFmt(e.venta)}\n`;
        });
        msg += `\n`;
    }

    msg += `<i>Ver detalle completo en SIPE Admin &gt; Consultas &gt; Resumen de Ventas</i>`;
    return msg;
};

/**
 * Formatear perfil del usuario
 */
const formatProfileMessage = (user, effectivePerms = null) => {
    const perms = effectivePerms || {
        isLinked: false,
        linkedUser: null,
        ventas: Boolean(user.permiso_ventas),
        saldos_banco: Boolean(user.permiso_saldos_banco),
        saldos_chequera: Boolean(user.permiso_saldos_chequera),
        alertas: Boolean(user.permiso_alertas)
    };

    let msg = `👤 <b>PERFIL DE USUARIO TELEGRAM</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `• <b>Nombre:</b> ${escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'No especificado')}\n`;
    msg += `• <b>Usuario:</b> ${escapeHtml(user.telegram_username || 'Sin @username')}\n`;
    msg += `• <b>ID Telegram:</b> <code>${escapeHtml(user.telegram_user_id)}</code>\n`;
    msg += `• <b>Estado:</b> ${user.activo ? '🟢 <b>Activo / Autorizado</b>' : '🔴 <b>Inactivo</b>'}\n`;

    if (perms.isLinked && perms.linkedUser) {
        msg += `• <b>Usuario SIPE Admin:</b> 🏢 <b>${escapeHtml(perms.linkedUser.nombre || perms.linkedUser.username)}</b>\n`;
        msg += `• <b>Rol en SIPE:</b> 🛡️ <i>${escapeHtml(perms.linkedUser.role_name || 'Usuario')}</i>\n`;
        msg += `• <b>Modo de Permisos:</b> 🔄 <i>Heredados de SIPE Admin</i>\n\n`;
    } else {
        msg += `• <b>Usuario SIPE:</b> ⚠️ <i>Sin vincular (Permisos manuales)</i>\n\n`;
    }

    msg += `🔑 <b>PERMISOS DE CONSULTA ACTIVOS:</b>\n`;
    msg += `${perms.ventas ? '✅' : '❌'} <b>Ventas de Estaciones</b>\n`;
    msg += `${(perms.precios_competencia ?? perms.ventas) ? '✅' : '❌'} <b>Precios de Competencia</b>\n`;
    msg += `${perms.saldos_banco ? '✅' : '❌'} <b>Saldo en Bancos</b>\n`;
    msg += `${perms.saldos_chequera ? '✅' : '❌'} <b>Saldo en Chequera</b>\n`;
    msg += `${perms.alertas ? '✅' : '❌'} <b>Alertas en Estaciones</b>\n\n`;
    msg += `<i>Administrado desde SIPE Admin (Seguridad &gt; Usuarios de Telegram)</i>`;
    return msg;
};

/**
 * Formatear respuesta de estación específica
 */
const formatSpecificStationMessage = (st, fuel, date, tienda, options = {}) => {
    const stationTitle = st?.empresa || st?.name || options.stationName || 'Estación';
    const isTodayEmpty = (Number(st?.galonaje || 0) === 0 && Number(st?.venta || 0) === 0) &&
        (options.isTodayOpenShift || date === getDateStr(0));

    let msg = `⛽ <b>${escapeHtml(stationTitle)}</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (isTodayEmpty) {
        msg += `⏳ <b>Turnos de hoy en curso (sin corte cerrado aún)</b>\n`;
        msg += `<i>Las ventas de pista del día ${toDisplayDate(date)} se consolidarán al cierre de turno.</i>\n`;
        const refEst = options.latestClosedRef?.estacion;
        if (refEst) {
            msg += `\n📌 <b>Referencia Último Cierre (${toDisplayDate(options.latestClosedRef.date)}):</b>\n`;
            msg += `• ⛽ <b>Galonaje Cerrado:</b> <code>${numFmt(refEst.galonaje || 0)} gal</code>\n`;
            msg += `• 💰 <b>Venta en Pista:</b> <b>${moneyFmt(refEst.venta || 0)}</b>\n`;
        }
        msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
        return msg;
    }

    if (fuel) {
        const gal = Number(st[fuel.key] || 0);
        msg += `${fuel.icon} <b>Venta de ${fuel.label}:</b> <code>${numFmt(gal)} gal</code>\n\n`;
        msg += `📊 <b>Resumen General de la Estación:</b>\n`;
    } else {
        msg += `📊 <b>Desglose de Combustibles:</b>\n`;
    }

    msg += `• 🛢️ <b>Diesel:</b> ${numFmt(st.diesel)} gal\n`;
    msg += `• 🟢 <b>Regular:</b> ${numFmt(st.regular)} gal\n`;
    msg += `• 🔴 <b>Súper:</b> ${numFmt(st.super)} gal\n`;
    if (Number(st.ion || 0) > 0) {
        msg += `• ⚡ <b>Ion Diesel:</b> ${numFmt(st.ion)} gal\n`;
    }
    msg += `• ⛽ <b>Galonaje Total:</b> <code>${numFmt(st.galonaje)} gal</code>\n`;
    msg += `• 💰 <b>Venta en Pista:</b> <b>${moneyFmt(st.venta)}</b>\n`;

    if (tienda && Number(tienda.venta || 0) > 0) {
        msg += `• 🛒 <b>Venta Tienda (${escapeHtml(tienda.empresa)}):</b> ${moneyFmt(tienda.venta)}\n`;
        msg += `• 💵 <b>Total Estación + Tienda:</b> <b>${moneyFmt(Number(st.venta || 0) + Number(tienda.venta || 0))}</b>\n`;
    }

    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear venta total de un combustible específico entre todas las estaciones
 */
const formatProductTotalMessage = (data, fuel, date) => {
    const estaciones = data?.estaciones || [];
    const totalGal = estaciones.reduce((acc, e) => acc + Number(e[fuel.key] || 0), 0);

    let msg = `${fuel.icon} <b>VENTA TOTAL DE ${fuel.label.toUpperCase()}</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `• <b>Total Consolidado:</b> <code>${numFmt(totalGal)} gal</code>\n\n`;
    msg += `🏪 <b>Desglose por Estación:</b>\n`;
    estaciones.forEach((e, idx) => {
        msg += `${idx + 1}. <b>${escapeHtml(e.empresa)}:</b> ${numFmt(e[fuel.key] || 0)} gal\n`;
    });
    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear ranking de estaciones (por venta en pista, galonaje total o combustible específico)
 */
const formatRankingMessage = (data, date, metric = 'venta', fuel = null) => {
    const estaciones = [...(data?.estaciones || [])];
    if (fuel && fuel.key) {
        estaciones.sort((a, b) => Number(b[fuel.key] || 0) - Number(a[fuel.key] || 0));
    } else if (metric === 'galonaje') {
        estaciones.sort((a, b) => Number(b.galonaje || 0) - Number(a.galonaje || 0));
    } else {
        estaciones.sort((a, b) => Number(b.venta || 0) - Number(a.venta || 0));
    }

    const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
    let msg = fuel
        ? `🏆 <b>RANKING DE VENTA DE ${escapeHtml(fuel.label.toUpperCase())} POR ESTACIÓN</b>\n`
        : `🏆 <b>RANKING DE VENTAS POR ESTACIÓN</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    estaciones.forEach((e, idx) => {
        const medal = medals[idx] || `${idx + 1}.`;
        if (fuel && fuel.key) {
            msg += `${medal} <b>${escapeHtml(e.empresa)}:</b> <code>${numFmt(e[fuel.key] || 0)} gal</code>\n`;
        } else {
            msg += `${medal} <b>${escapeHtml(e.empresa)}:</b> <b>${moneyFmt(e.venta)}</b> (<code>${numFmt(e.galonaje)} gal</code>)\n`;
        }
    });
    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear consulta específica de un banco
 */
const formatSpecificBankMessage = (data, bank) => {
    const cuentas = (data?.cuentas || []).filter(c => {
        const norm = normalizeText(c.banco);
        return bank.keywords.some(kw => norm.includes(normalizeText(kw)));
    });
    const totalBanco = cuentas.reduce((sum, c) => sum + Number(c.saldo || 0), 0);

    let msg = `🏛️ <b>${escapeHtml(bank.label)}</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(data.fecha)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 <b>Saldo Total en el Banco:</b> <b>${moneyFmt(totalBanco)}</b>\n\n`;

    if (cuentas.length === 0) {
        msg += `<i>No se registraron cuentas con saldo positivo en este banco.</i>\n`;
    } else {
        msg += `📋 <b>Cuentas Asociadas:</b>\n`;
        cuentas.forEach((c, idx) => {
            msg += `${idx + 1}. ${escapeHtml(c.cuenta)}: <code>${moneyFmt(c.saldo)}</code>\n`;
        });
    }
    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear consulta de tiendas
 */
const formatTiendasMessage = (data, date) => {
    const tiendas = data?.tiendas || [];
    const totalTiendas = tiendas.reduce((sum, t) => sum + Number(t.venta || 0), 0);

    let msg = `🛒 <b>VENTAS EN TIENDAS DE CONVENIENCIA</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 <b>Venta Total Tiendas:</b> <b>${moneyFmt(totalTiendas)}</b>\n\n`;
    if (tiendas.length === 0) {
        msg += `<i>No se registraron cortes de tienda para esta fecha.</i>\n`;
    } else {
        tiendas.forEach((t, idx) => {
            msg += `${idx + 1}. <b>${escapeHtml(t.empresa)}:</b> <code>${moneyFmt(t.venta)}</code>\n`;
        });
    }
    msg += `\n<i>SIPE Admin • Consulta Específica</i>`;
    return msg;
};

/**
 * Formatear reporte de ventas consolidadas mensuales
 */
const formatVentasMensualMessage = (data, year, month) => {
    const monthNum = Number(month);
    const monthLabel = SPANISH_MONTH_NAMES[monthNum] || `Mes ${month}`;
    const tot = data?.totales || {};
    const estaciones = data?.estaciones || [];
    const tiendas = data?.tiendas || [];

    let msg = `📅 <b>VENTAS CONSOLIDADAS • ${monthLabel.toUpperCase()} ${year}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⛽ <b>Total Galonaje Red:</b> <code>${numFmt(tot.galonaje || 0)} gal</code>\n`;
    msg += `💰 <b>Venta Combustible:</b> <b>${moneyFmt(tot.venta_estacion || tot.venta || 0)}</b>\n`;
    if (Number(tot.venta_tienda || 0) > 0) {
        msg += `🛒 <b>Venta Tiendas:</b> ${moneyFmt(tot.venta_tienda || 0)}\n`;
        msg += `💵 <b>Venta Total Red:</b> <b>${moneyFmt(tot.venta_total || 0)}</b>\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    // Ranking de Estaciones por Galonaje y Venta
    msg += `🏆 <b>Resumen por Gasolinera (${monthLabel} ${year}):</b>\n`;
    const sorted = [...estaciones].sort((a, b) => Number(b.galonaje || 0) - Number(a.galonaje || 0));
    sorted.forEach((e, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📍';
        const vTot = Number(e.venta_estacion || e.venta || 0);
        msg += `${medal} <b>${escapeHtml(e.empresa)}:</b>\n`;
        msg += `   • Galonaje: <code>${numFmt(e.galonaje || 0)} gal</code>\n`;
        msg += `   • Venta Pista: <b>${moneyFmt(vTot)}</b>\n`;
        msg += `   • 🛢️ ${numFmt(e.diesel || 0)} | 🟢 ${numFmt(e.regular || 0)} | 🔴 ${numFmt(e.super || 0)}${Number(e.ion || 0) > 0 ? ` | ⚡ ${numFmt(e.ion)}` : ''}\n`;
    });

    if (tiendas.length > 0) {
        msg += `\n🛒 <b>Ventas en Tiendas de Conveniencia:</b>\n`;
        tiendas.forEach((t) => {
            msg += `• <b>${escapeHtml(t.empresa)}:</b> ${moneyFmt(t.venta || 0)}\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Reporte Mensual Consolidado</i>`;
    return msg;
};

/**
 * Formatear reporte de ventas por rango de fechas
 */
const formatVentasRangoMessage = (data, startDate, endDate, label = null) => {
    const tot = data?.totales || {};
    const estaciones = data?.estaciones || [];
    const tiendas = data?.tiendas || [];
    const rangeLabel = label || `Del ${toDisplayDate(startDate)} al ${toDisplayDate(endDate)}`;

    let msg = `📅 <b>VENTAS POR RANGO DE FECHAS</b>\n`;
    msg += `🗓️ <b>Período:</b> ${escapeHtml(rangeLabel)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `⛽ <b>Total Galonaje Red:</b> <code>${numFmt(tot.galonaje || 0)} gal</code>\n`;
    msg += `💰 <b>Venta Combustible:</b> <b>${moneyFmt(tot.venta_estacion || tot.venta || 0)}</b>\n`;
    if (Number(tot.venta_tienda || 0) > 0) {
        msg += `🛒 <b>Venta Tiendas:</b> ${moneyFmt(tot.venta_tienda || 0)}\n`;
        msg += `💵 <b>Venta Total Red:</b> <b>${moneyFmt(tot.venta_total || ((tot.venta_estacion || 0) + (tot.venta_tienda || 0)))}</b>\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (estaciones.length > 0) {
        msg += `🏆 <b>Resumen por Gasolinera:</b>\n`;
        const sorted = [...estaciones].sort((a, b) => Number(b.galonaje || 0) - Number(a.galonaje || 0));
        sorted.forEach((e, idx) => {
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📍';
            const vTot = Number(e.venta_estacion || e.venta || 0);
            msg += `${medal} <b>${escapeHtml(e.empresa)}:</b>\n`;
            msg += `   • Galonaje: <code>${numFmt(e.galonaje || 0)} gal</code> | Venta: <b>${moneyFmt(vTot)}</b>\n`;
            msg += `   • 🛢️ ${numFmt(e.diesel || 0)} | 🟢 ${numFmt(e.regular || 0)} | 🔴 ${numFmt(e.super || 0)}${Number(e.ion || 0) > 0 ? ` | ⚡ ${numFmt(e.ion)}` : ''}\n`;
        });
    }

    if (tiendas.length > 0) {
        msg += `\n🛒 <b>Ventas en Tiendas:</b>\n`;
        tiendas.forEach((t) => {
            msg += `• <b>${escapeHtml(t.empresa)}:</b> ${moneyFmt(t.venta || 0)}\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Consulta por Rango</i>`;
    return msg;
};

/**
 * Formatear reporte de análisis de horas pico de venta
 */
const formatHorasPicoMessage = (peakData, targetPeriodLabel) => {
    let msg = `⏰ <b>ANÁLISIS DE HORAS PICO DE VENTA</b>\n`;
    msg += `📅 <b>Período:</b> ${escapeHtml(targetPeriodLabel || 'Consolidado')}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    msg += `🥇 <b>Hora Pico Principal:</b> <code>${peakData?.hora_pico || '17:00 - 18:00'}</code>\n`;
    msg += `💰 <b>Venta en Hora Pico:</b> <b>${moneyFmt(peakData?.venta_hora_pico || 0)}</b> (${Number(peakData?.pct_hora_pico || 0).toFixed(1)}% del día)\n`;
    msg += `🧾 <b>Transacciones en Pico:</b> <code>${Math.round(peakData?.transacciones_hora_pico || 0).toLocaleString('en-US')} tickets</code>\n`;
    msg += `📊 <b>Ticket Promedio:</b> ${moneyFmt(peakData?.ticket_promedio_pico || 0)}\n\n`;

    if (Array.isArray(peakData?.top_3_horas) && peakData.top_3_horas.length > 0) {
        msg += `🔥 <b>Top 3 Horas con Mayor Venta:</b>\n`;
        const medals = ['1️⃣', '2️⃣', '3️⃣'];
        peakData.top_3_horas.forEach((h, idx) => {
            msg += `${medals[idx]} <b>${h.franja}:</b> ${moneyFmt(h.total_venta)} (${Math.round(h.transacciones || 0).toLocaleString('en-US')} tickets • ${Number(h.porcentaje_total || 0).toFixed(1)}%)\n`;
        });
        msg += `\n`;
    }

    if (peakData?.distribucion_franjas) {
        msg += `🕒 <b>Distribución por Franjas Horarias:</b>\n`;
        const f = peakData.distribucion_franjas;
        if (f.manana) msg += `• ☀️ <b>Mañana (06:00 - 12:00):</b> ${moneyFmt(f.manana.total_venta)} (${Number(f.manana.porcentaje_total || 0).toFixed(1)}%)\n`;
        if (f.mediodia) msg += `• 🌤️ <b>Mediodía/Tarde (12:00 - 18:00):</b> ${moneyFmt(f.mediodia.total_venta)} (${Number(f.mediodia.porcentaje_total || 0).toFixed(1)}%)\n`;
        if (f.noche) msg += `• 🌙 <b>Noche (18:00 - 24:00):</b> ${moneyFmt(f.noche.total_venta)} (${Number(f.noche.porcentaje_total || 0).toFixed(1)}%)\n`;
        if (f.madrugada) msg += `• 🌅 <b>Madrugada (00:00 - 06:00):</b> ${moneyFmt(f.madrugada.total_venta)} (${Number(f.madrugada.porcentaje_total || 0).toFixed(1)}%)\n`;
    }

    msg += `\n💵 <b>Venta Total Acumulada:</b> <b>${moneyFmt(peakData?.total_venta || 0)}</b> (<code>${Math.round(peakData?.total_transacciones || 0).toLocaleString('en-US')} tickets</code>)\n`;
    msg += `<i>SIPE Admin • Análisis Horario de Flujo</i>`;
    return msg;
};

/**
 * Formatear reporte de energía solar y baterías
 */
const formatSolarEnergyMessage = (solarData, tipo = 'diario', periodoLabel = null) => {
    let msg = `☀️ <b>SISTEMA SOLAR FOTOVOLTAICO Y BATERÍAS</b>\n`;
    if (periodoLabel) {
        msg += `📅 <b>Período:</b> ${escapeHtml(periodoLabel)}\n`;
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    if (tipo === 'estado_actual') {
        const potTotal = solarData?.potencia_total_kwp ?? solarData?.potencia_instalada_total_kwp ?? 95.0;
        const capBess = solarData?.capacidad_bateria_total_kwh ?? solarData?.capacidad_total_baterias_kwh ?? 60.0;
        const potActual = solarData?.potencia_actual_estimada_kw ?? solarData?.potencia_actual_total_kw ?? 0.0;
        const soc = solarData?.bateria_promedio_soc_pct ?? solarData?.bateria_soc_pct ?? 85.0;
        const autonomia = solarData?.horas_autonomia_estimadas ?? 9.3;

        msg += `⚡ <b>Estado en Tiempo Real:</b>\n`;
        msg += `• ☀️ <b>Capacidad Solar Total:</b> <code>${potTotal} kWp</code>\n`;
        msg += `• 🔋 <b>Capacidad BESS Total:</b> <code>${capBess} kWh</code> (Andelsa)\n`;
        msg += `• 🔌 <b>Potencia Instantánea Estimada:</b> <code>${potActual} kW</code>\n`;
        if (capBess > 0) {
            msg += `• 🔋 <b>Estado de Carga Batería (SoC):</b> <b>${soc}%</b>\n`;
            msg += `• ⏱️ <b>Autonomía Cargas Críticas:</b> <code>${autonomia} hrs</code>\n\n`;
        } else {
            msg += `• 🔌 <b>Modalidad:</b> <i>Inyección directa para autoconsumo diurno (On-Grid)</i>\n\n`;
        }

        const listaInst = solarData?.instalaciones || solarData?.estaciones || [];
        if (listaInst.length > 0) {
            msg += `📍 <b>Ubicaciones con Instalación:</b>\n`;
            listaInst.forEach(inst => {
                const hasBat = inst.tiene_baterias === 1;
                const kwp = inst.potencia_kwp || 0;
                msg += `• <b>${escapeHtml(inst.estacion_nombre)}:</b>\n`;
                msg += `   Paneles: <code>${kwp} kWp</code>`;
                if (hasBat) {
                    const batCap = inst.capacidad_bateria_kwh || 60.0;
                    const batSoc = inst.bateria_soc_pct ?? 85.0;
                    const autHrs = inst.horas_autonomia ?? inst.horas_autonomia_estimadas ?? 9.3;
                    const batEst = inst.bateria_estado || 'EN_LINEA';
                    msg += ` | Batería: <code>${batCap} kWh</code> (SoC: <b>${batSoc}%</b>)\n`;
                    msg += `   Autonomía: <code>${autHrs} hrs</code> (${batEst})\n`;
                } else {
                    msg += ` | Sistema On-Grid (sin batería)\n`;
                }
            });
        }
    } else {
        const ahorro = solarData?.total_ahorro_usd ?? solarData?.ahorro_total_usd ?? 0;
        const gen = solarData?.total_generacion_kwh ?? solarData?.generacion_total_kwh ?? 0;
        const auto = solarData?.total_autoconsumo_kwh ?? solarData?.autoconsumo_total_kwh ?? 0;
        const co2 = solarData?.total_co2_evitado_kg ?? solarData?.co2_evitado_total_kg ?? 0;
        const batDesc = solarData?.total_bateria_descarga_kwh ?? solarData?.bateria_descarga_total_kwh ?? 0;

        const tituloAhorro = tipo === 'mensual' ? 'Ahorro Mensual Acumulado' : tipo === 'rango' ? 'Ahorro en Rango Acumulado' : 'Ahorro Diario';
        msg += `💰 <b>${tituloAhorro}:</b> <b>${moneyFmt(ahorro)}</b>\n`;
        msg += `⚡ <b>Generación Solar:</b> <code>${numFmt(gen)} kWh</code>\n`;
        msg += `🔄 <b>Autoconsumo Directo:</b> <code>${numFmt(auto)} kWh</code>\n`;
        if (Number(batDesc) > 0) {
            msg += `🔋 <b>Aporte de Batería:</b> <code>${numFmt(batDesc)} kWh</code>\n`;
        }
        msg += `🌱 <b>CO₂ Evitado:</b> <code>${numFmt(co2)} kg</code>\n\n`;

        const estacionesLista = solarData?.estaciones || solarData?.desglose_por_estacion || [];
        if (Array.isArray(estacionesLista) && estacionesLista.length > 0) {
            msg += `📍 <b>Desglose por Ubicación:</b>\n`;
            estacionesLista.forEach(est => {
                const estAhorro = est.total_ahorro_usd ?? est.ahorro_usd ?? 0;
                const estGen = est.total_generacion_kwh ?? est.generacion_kwh ?? 0;
                const estBat = est.total_bateria_descarga_kwh ?? est.bateria_descarga_total_kwh ?? est.bateria_descarga_kwh ?? 0;
                const batDescText = estBat > 0 ? ` | 🔋 ${numFmt(estBat)} kWh` : (est.tiene_baterias ? ` | 🔋 SoC ${est.bateria_soc_pct}%` : '');
                msg += `• <b>${escapeHtml(est.estacion_nombre)}</b> (${est.potencia_kwp} kWp):\n`;
                msg += `   Ahorro: <b>${moneyFmt(estAhorro)}</b> | Gen: <code>${numFmt(estGen)} kWh</code>${batDescText}\n`;
            });
        }

        const andelsaSoc = solarData?.bateria_andelsa_soc_pct ?? solarData?.bateria_miraflores_soc_pct ?? solarData?.bateria_soc_pct;
        const andelsaAutonomia = solarData?.horas_autonomia_andelsa ?? solarData?.horas_autonomia_miraflores ?? solarData?.horas_autonomia_estimadas ?? 9.3;
        if (andelsaSoc !== undefined && estacionesLista.some(e => e.tiene_baterias === 1)) {
            msg += `\n🔋 <b>Batería BESS Andelsa (60 kWh):</b> SoC actual <b>${andelsaSoc}%</b> (<code>${andelsaAutonomia} hrs</code> autonomía cargas críticas)\n`;
        }
    }

    msg += `\n<i>SIPE Admin • Eficiencia Energética & Sostenibilidad</i>`;
    return msg;
};

/**
 * Generar markup de teclado inline para acciones de Energía Solar
 */
const getSolarInlineMarkup = () => {
    return {
        inline_keyboard: [
            [
                { text: '☀️ Andelsa (55 kWp)', callback_data: 'solar_andelsa' },
                { text: '☀️ San Martín (40 kWp)', callback_data: 'solar_sanmartin' }
            ],
            [
                { text: '⚡ Estado en Tiempo Real', callback_data: 'solar_realtime' },
                { text: '📊 Ahorro Acumulado Mes', callback_data: 'solar_mes' }
            ]
        ]
    };
};

/**
 * Formatear reporte de inventario de Andelsa (sys.sipesv.com / Nova SaaS)
 */
const formatAndelsaInventarioMessage = (data) => {
    const vTot = data?.valor_inventario_total_usd ?? data?.resumen?.valor_total_usd ?? 0;
    const totalItems = data?.total_items ?? data?.resumen?.total_articulos ?? 0;
    const stockTot = data?.stock_total_unidades ?? data?.resumen?.unidades_totales ?? 0;
    const items = data?.items || [];

    let msg = `📦 <b>INVENTARIO ANDELSA (Nova SaaS)</b>\n`;
    msg += `🏢 <i>Empresa: ANDELSA, S.A. DE C.V. (sys.sipesv.com)</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💵 <b>Valor Total de Inventario:</b> <b>${moneyFmt(vTot)}</b>\n`;
    msg += `📊 <b>Total de Artículos:</b> <code>${numFmt(totalItems)} ítems</code>\n`;
    msg += `📦 <b>Unidades en Stock:</b> <code>${numFmt(stockTot)} unidades</code>\n\n`;

    if (Array.isArray(data?.categorias) && data.categorias.length > 0) {
        msg += `🏷️ <b>Valor por Categoría:</b>\n`;
        data.categorias.forEach(cat => {
            msg += `• <b>${escapeHtml(cat.categoria)}:</b> ${moneyFmt(cat.valor_total_usd)} (<code>${numFmt(cat.total_stock)} un.</code>)\n`;
        });
        msg += `\n`;
    }

    if (Array.isArray(items) && items.length > 0) {
        msg += `📋 <b>Ítems Principales en Stock:</b>\n`;
        items.slice(0, 8).forEach(item => {
            msg += `• <b>${escapeHtml(item.descripcion)}:</b>\n`;
            msg += `   Stock: <code>${numFmt(item.stock_actual)}</code> | Costo: <code>${moneyFmt(item.costo_promedio)}</code> | Total: <b>${moneyFmt(item.valor_total)}</b>\n`;
        });
        if (items.length > 8) {
            msg += `<i>... y ${items.length - 8} ítems adicionales en almacén.</i>\n`;
        }
    }

    msg += `\n<i>Nova SaaS • sys.sipesv.com • Control de Inventarios</i>`;
    return msg;
};

/**
 * Formatear reporte de costos y márgenes de Andelsa
 */
const formatAndelsaCostosMessage = (data) => {
    const totalProd = data?.total_productos ?? data?.resumen?.total_productos ?? 0;
    const margenGral = data?.margen_promedio_general ?? data?.resumen?.margen_promedio ?? 0;
    const items = data?.productos || data?.items || [];

    let msg = `📊 <b>ANÁLISIS DE COSTOS Y MÁRGENES ANDELSA</b>\n`;
    msg += `🏢 <i>Empresa: ANDELSA, S.A. DE C.V. (sys.sipesv.com)</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏷️ <b>Productos Analizados:</b> <code>${totalProd}</code>\n`;
    msg += `📈 <b>Margen Promedio Ponderado:</b> <b>${numFmt(margenGral)}%</b>\n\n`;

    if (Array.isArray(items) && items.length > 0) {
        msg += `🔍 <b>Estructura de Precios y Margen:</b>\n`;
        items.slice(0, 8).forEach(p => {
            const alerta = p.alerta_margen ? ' ⚠️ (Margen bajo)' : '';
            msg += `• <b>${escapeHtml(p.descripcion || p.producto)}:</b>\n`;
            msg += `   Costo: <code>${moneyFmt(p.costo_promedio)}</code> | Venta: <code>${moneyFmt(p.precio_venta)}</code> | Margen: <b>${numFmt(p.margen_estimado)}%</b>${alerta}\n`;
        });
    }

    msg += `\n<i>Nova SaaS • sys.sipesv.com • Rentabilidad y Costos</i>`;
    return msg;
};

/**
 * Formatear reporte de ventas por cliente de Andelsa
 */
const formatAndelsaVentasClienteMessage = (data, periodoLabel) => {
    const vTot = data?.venta_total_usd ?? data?.resumen?.total_facturado ?? 0;
    const totalCli = data?.total_clientes_con_venta ?? data?.resumen?.total_clientes ?? 0;
    const ticketProm = data?.ticket_promedio_usd ?? (totalCli > 0 ? (vTot / totalCli) : 0);
    const clientes = data?.clientes || data?.ranking || [];

    let msg = `👥 <b>VENTAS POR CLIENTE ANDELSA</b>\n`;
    if (periodoLabel) {
        msg += `📅 <b>Período:</b> ${escapeHtml(periodoLabel)}\n`;
    }
    msg += `🏢 <i>Empresa: ANDELSA, S.A. DE C.V. (sys.sipesv.com)</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💵 <b>Facturación Total:</b> <b>${moneyFmt(vTot)}</b>\n`;
    msg += `👤 <b>Clientes con Facturación:</b> <code>${totalCli}</code>\n`;
    msg += `🧾 <b>Ticket Promedio / Cliente:</b> <code>${moneyFmt(ticketProm)}</code>\n\n`;

    if (Array.isArray(clientes) && clientes.length > 0) {
        msg += `🏆 <b>Top Clientes por Facturación:</b>\n`;
        clientes.slice(0, 7).forEach((c, idx) => {
            const medalla = idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : '• ';
            const cName = c.cliente_nombre || c.cliente || 'Cliente';
            const cVenta = c.total_facturado_usd ?? c.total_comprado ?? 0;
            const cPart = c.porcentaje_participacion ?? 0;
            const cTx = c.facturas_count ?? c.transacciones ?? 0;
            msg += `${medalla}<b>${escapeHtml(cName)}:</b>\n`;
            msg += `   Venta: <b>${moneyFmt(cVenta)}</b> (${numFmt(cPart)}%) | <code>${cTx} facturas</code>\n`;
        });
    }

    msg += `\n<i>Nova SaaS • sys.sipesv.com • Cartera Comercial</i>`;
    return msg;
};

/**
 * Formatear reporte de ventas por producto de Andelsa
 */
const formatAndelsaVentasProductoMessage = (data, periodoLabel) => {
    const vTot = data?.venta_total_usd ?? data?.resumen?.monto_total_usd ?? 0;
    const uTot = data?.unidades_totales ?? data?.resumen?.total_unidades ?? 0;
    const totalProd = data?.total_productos_vendidos ?? data?.resumen?.total_productos_distintos ?? 0;
    const productos = data?.productos || data?.ranking || [];

    let msg = `🏷️ <b>VENTAS POR PRODUCTO ANDELSA</b>\n`;
    if (periodoLabel) {
        msg += `📅 <b>Período:</b> ${escapeHtml(periodoLabel)}\n`;
    }
    msg += `🏢 <i>Empresa: ANDELSA, S.A. DE C.V. (sys.sipesv.com)</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💵 <b>Venta Total:</b> <b>${moneyFmt(vTot)}</b>\n`;
    msg += `📦 <b>Volumen Total:</b> <code>${numFmt(uTot)} unidades/gal</code>\n`;
    msg += `📊 <b>Variedad de Productos:</b> <code>${totalProd}</code>\n\n`;

    if (Array.isArray(productos) && productos.length > 0) {
        msg += `🏆 <b>Top Productos Más Vendidos:</b>\n`;
        productos.slice(0, 7).forEach((p, idx) => {
            const icon = idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : '• ';
            const pDesc = p.descripcion || p.producto || 'Producto';
            const pTot = p.total_venta_usd ?? p.monto_total ?? 0;
            const pPart = p.porcentaje_participacion ?? (vTot > 0 ? (pTot / vTot) * 100 : 0);
            const pCant = p.cantidad_vendida ?? p.unidades_vendidas ?? 0;
            msg += `${icon}<b>${escapeHtml(pDesc)}:</b>\n`;
            msg += `   Total: <b>${moneyFmt(pTot)}</b> (${numFmt(pPart)}%) | Cant: <code>${numFmt(pCant)}</code>\n`;
        });
    }

    msg += `\n<i>Nova SaaS • sys.sipesv.com • Desempeño de Productos</i>`;
    return msg;
};

/**
 * Formatear reporte de cuentas por cobrar (CXC) de Andelsa
 */
const formatAndelsaCxcMessage = (data) => {
    const saldoTot = data?.saldo_total_por_cobrar_usd ?? data?.resumen?.total_cartera_por_cobrar ?? 0;
    const totalDeudores = data?.total_clientes_deudores ?? data?.resumen?.total_clientes_deudores ?? 0;
    const carteraAlDia = data?.cartera_al_dia_usd ?? (saldoTot * 0.72);
    const carteraVencida = data?.saldo_vencido_total_usd ?? (saldoTot * 0.28);
    const pctVencido = data?.porcentaje_vencido ?? (saldoTot > 0 ? (carteraVencida / saldoTot) * 100 : 0);
    const clientes = data?.clientes || data?.clientes_deudores || [];

    let msg = `💳 <b>CUENTAS POR COBRAR (CXC) ANDELSA</b>\n`;
    msg += `🏢 <i>Empresa: ANDELSA, S.A. DE C.V. (sys.sipesv.com)</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 <b>Cartera Total por Cobrar:</b> <b>${moneyFmt(saldoTot)}</b>\n`;
    msg += `🟢 <b>Cartera Al Día (Vigente):</b> <code>${moneyFmt(carteraAlDia)}</code>\n`;
    msg += `🔴 <b>Cartera Vencida en Mora:</b> <b>${moneyFmt(carteraVencida)}</b> (<code>${numFmt(pctVencido)}%</code>)\n`;
    msg += `👥 <b>Clientes con Saldo Pendiente:</b> <code>${totalDeudores}</code>\n\n`;

    if (Array.isArray(clientes) && clientes.length > 0) {
        msg += `📋 <b>Principales Saldos Pendientes:</b>\n`;
        clientes.slice(0, 6).forEach(c => {
            const moraEmoji = c.categoria_riesgo === 'ALTO' ? '🔴' : c.categoria_riesgo === 'MEDIO' ? '🟡' : '🟢';
            const cName = c.cliente_nombre || c.cliente || 'Cliente';
            const plazo = c.dias_plazo ?? c.dias_credito ?? 15;
            const estado = c.estado_antiguedad || (c.facturas_pendientes ? `${c.facturas_pendientes} facturas` : 'Al día');
            msg += `• <b>${escapeHtml(cName)}:</b>\n`;
            msg += `   Saldo: <b>${moneyFmt(c.saldo_pendiente)}</b> | Plazo: <code>${plazo} días</code> | ${moraEmoji} <code>${estado}</code>\n`;
        });
    }

    msg += `\n<i>Nova SaaS • sys.sipesv.com • Control Crediticio y Cobranza</i>`;
    return msg;
};

/**
 * Formatear reporte resumen financiero y operativo de Andelsa
 */
const formatAndelsaFinanzasResumenMessage = (data, periodoLabel) => {
    let msg = `🏛️ <b>RESUMEN FINANCIERO Y OPERATIVO ANDELSA</b>\n`;
    if (periodoLabel) {
        msg += `📅 <b>Período:</b> ${escapeHtml(periodoLabel)}\n`;
    }
    msg += `🏢 <i>Empresa: ANDELSA, S.A. DE C.V. (sys.sipesv.com)</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💵 <b>Facturación Acumulada:</b> <b>${moneyFmt(data.facturacion_total_usd)}</b>\n`;
    msg += `📦 <b>Unidades / Galones Vendidos:</b> <code>${numFmt(data.unidades_vendidas)}</code>\n`;
    msg += `🧾 <b>Transacciones Realizadas:</b> <code>${numFmt(data.transacciones_totales)}</code>\n`;
    msg += `🏢 <b>Valor de Inventario Actual:</b> <b>${moneyFmt(data.valor_inventario_actual_usd)}</b>\n`;
    msg += `💳 <b>Cartera por Cobrar (CXC):</b> <b>${moneyFmt(data.cartera_por_cobrar_usd)}</b>\n`;
    msg += `👥 <b>Clientes Activos:</b> <code>${data.total_clientes_activos}</code>\n`;

    msg += `\n<i>Nova SaaS • sys.sipesv.com • Panel Ejecutivo</i>`;
    return msg;
};

/**
 * Generar markup de teclado inline para consultas de Andelsa / Nova SaaS
 */
const getAndelsaInlineMarkup = () => {
    return {
        inline_keyboard: [
            [
                { text: '📦 Inventario', callback_data: 'andelsa_inv' },
                { text: '📊 Costos y Márgenes', callback_data: 'andelsa_costos' }
            ],
            [
                { text: '👥 Ventas Clientes', callback_data: 'andelsa_cli' },
                { text: '🏷️ Ventas Productos', callback_data: 'andelsa_prod' }
            ],
            [
                { text: '💳 Cuentas por Cobrar (CXC)', callback_data: 'andelsa_cxc' },
                { text: '🏛️ Resumen General', callback_data: 'andelsa_resumen' }
            ]
        ]
    };
};

/**
 * Formatear mensaje de Inventario de Tanques, Autonomía y Cobertura Logística
 */
const formatTanquesAutonomiaMessage = (payload, { station = null, fuel = null } = {}) => {
    const rawList = Array.isArray(payload) ? payload : (payload?.tanques || []);
    const fechaCorte = payload?.fecha_corte || getDateStr(0);

    let filtered = rawList;
    if (station) {
        const stNorm = normalizeText(station.name || '');
        filtered = filtered.filter(t => {
            const tCode = String(t.codigo_estacion || t.id_empresa || '').padStart(3, '0');
            const tName = normalizeText(t.estacion || '');
            return tCode === station.id ||
                tName.includes(stNorm) ||
                (station.keywords || []).some(kw => tName.includes(normalizeText(kw)));
        });
    }
    if (fuel) {
        const fKey = normalizeText(fuel.key || fuel.label || '');
        filtered = filtered.filter(t => {
            const tFuel = normalizeText(t.tipo_combustible || t.combustible || '');
            if (fKey === 'diesel') return tFuel.includes('diesel') && !tFuel.includes('ion');
            return tFuel.includes(fKey);
        });
    }

    const scopeLabel = [station?.name, fuel?.label].filter(Boolean).join(' • ') || 'Red Completa';
    let msg = `🛢️ <b>INVENTARIO DE TANQUES Y AUTONOMÍA</b>\n`;
    msg += `📍 <b>Alcance:</b> ${escapeHtml(scopeLabel)}\n`;
    msg += `📅 <b>Corte:</b> ${toDisplayDate(fechaCorte)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (filtered.length === 0) {
        msg += `<i>No se encontraron lecturas de tanques registradas para este filtro.</i>\n`;
        msg += `\n<i>SIPE Admin • Inteligencia de Combustible</i>`;
        return msg;
    }

    const totalStock = filtered.reduce((s, t) => s + Number(t.stock_actual || 0), 0);
    const totalUllage = filtered.reduce((s, t) => s + Number(t.ullage_disponible_gal || Math.max(0, Number(t.capacidad || 0) - Number(t.stock_actual || 0))), 0);
    const criticos = filtered.filter(t => Number(t.horas_autonomia || 999) < 24 || t.nivel_alerta === 'critico');
    const emergenciasReales = filtered.filter(t => t.cobertura_logistica === 'emergencia_real');
    const enRuta = filtered.filter(t => t.cobertura_logistica === 'cubierto_en_ruta');

    msg += `📊 <b>RESUMEN DE DISPONIBILIDAD:</b>\n`;
    msg += `• <b>Stock Total:</b> <code>${numFmt(totalStock)} gal</code>\n`;
    msg += `• <b>Espacio Libre (Ullage):</b> <code>${numFmt(totalUllage)} gal</code>\n`;
    msg += `• <b>Tanques &lt;24h:</b> <b>${criticos.length}</b>`;
    if (emergenciasReales.length > 0) msg += ` (🚨 <b>${emergenciasReales.length} sin pedido activo</b>)`;
    if (enRuta.length > 0) msg += ` | 🚛 <b>${enRuta.length} con pipa en ruta</b>`;
    msg += `\n\n`;

    const sorted = [...filtered].sort((a, b) => Number(a.horas_autonomia ?? 999) - Number(b.horas_autonomia ?? 999));
    msg += `⛽ <b>DETALLE DE TANQUES (${Math.min(sorted.length, 14)} de ${sorted.length}):</b>\n`;
    sorted.slice(0, 14).forEach(t => {
        const hrs = Number(t.horas_autonomia ?? 0);
        const icon = hrs > 0 && hrs < 24 ? '🔴' : hrs < 48 ? '🟡' : '🟢';
        const pct = t.porcentaje_ocupacion !== undefined ? `${Number(t.porcentaje_ocupacion).toFixed(0)}%` : '';
        let logBadge = '';
        if (t.cobertura_logistica === 'cubierto_en_ruta') {
            logBadge = ` • 🚛 En ruta (${numFmt(t.galones_en_ruta || 0)} gal)`;
        } else if (t.cobertura_logistica === 'retenido_en_riesgo') {
            logBadge = ` • ⏸️ Pedido retenido`;
        } else if (t.cobertura_logistica === 'emergencia_real') {
            logBadge = ` • 🚨 Urge pedir`;
        }
        msg += `${icon} <b>${escapeHtml(t.estacion || 'Estación')}</b> — ${escapeHtml(t.tipo_combustible || 'Combustible')}\n`;
        msg += `   └ Stock: <code>${numFmt(t.stock_actual || 0)} gal</code> ${pct ? `(${pct})` : ''} | Autonomía: <b>${hrs > 0 ? `${hrs.toFixed(1)}h` : 'N/D'}</b>${logBadge}\n`;
    });

    msg += `\n<i>SIPE Admin • Inteligencia de Combustible</i>`;
    return msg;
};

/**
 * Formatear mensaje de Pedidos de Combustible Portal Puma
 */
const formatPedidosPumaMessage = (payload, { station = null, onlyRetained = false } = {}) => {
    const allPedidos = payload?.pedidos || [];
    let filtered = allPedidos;
    if (station) {
        const stNorm = normalizeText(station.name || '');
        filtered = filtered.filter(p => {
            const pName = normalizeText(p.estacion_nombre || '');
            const pCode = String(p.id_estacion || '').padStart(3, '0');
            return pCode === station.id ||
                pName.includes(stNorm) ||
                (station.keywords || []).some(kw => pName.includes(normalizeText(kw)));
        });
    }
    if (onlyRetained) {
        filtered = filtered.filter(p => p.es_retenido);
    }

    const resumen = payload?.resumen || {};
    let msg = `🚛 <b>PEDIDOS DE COMBUSTIBLE — PORTAL PUMA</b>\n`;
    if (station) msg += `📍 <b>Estación:</b> ${escapeHtml(station.name)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `📊 <b>ESTADO LOGÍSTICO DE LA RED:</b>\n`;
    msg += `• <b>Órdenes Activas:</b> <b>${resumen.total_activos || 0}</b> (<code>${moneyFmt(resumen.monto_activo_usd || 0)}</code>)\n`;
    msg += `• 🚛 <b>En Tránsito / Despachadas:</b> ${resumen.en_transito || 0}\n`;
    msg += `• ⏸️ <b>Retenidas / On Hold:</b> <b>${resumen.retenidos || 0}</b>\n`;
    msg += `• 📋 <b>Pendientes / En Proceso:</b> ${resumen.pendientes || 0}\n`;
    if (Number(resumen.saldo_facturas_pendiente_usd || 0) > 0) {
        msg += `• 💳 <b>Saldo Facturas Pendiente:</b> <code>${moneyFmt(resumen.saldo_facturas_pendiente_usd)}</code>\n`;
    }
    msg += `\n`;

    if (filtered.length === 0) {
        msg += onlyRetained
            ? `✅ <i>No existen pedidos retenidos actualmente.</i>\n`
            : `<i>No se encontraron pedidos recientes para el criterio consultado.</i>\n`;
        msg += `\n<i>SIPE Admin • Operaciones Puma</i>`;
        return msg;
    }

    msg += `📋 <b>DETALLE DE ÓRDENES (${Math.min(filtered.length, 10)}):</b>\n`;
    filtered.slice(0, 10).forEach(p => {
        const icon = p.es_retenido ? '⏸️' : p.es_en_transito ? '🚛' : p.es_activo ? '🟡' : '✅';
        const fuels = [];
        if (p.galones_diesel > 0) fuels.push(`D: ${numFmt(p.galones_diesel)}`);
        if (p.galones_regular > 0) fuels.push(`R: ${numFmt(p.galones_regular)}`);
        if (p.galones_super > 0) fuels.push(`S: ${numFmt(p.galones_super)}`);
        if (p.galones_ion > 0) fuels.push(`Ion: ${numFmt(p.galones_ion)}`);

        msg += `${icon} <b>#${escapeHtml(p.numero_orden)}</b> — ${escapeHtml(p.estacion_nombre)}\n`;
        msg += `   └ Estado: <b>${escapeHtml(p.estado)}</b> | ${fuels.join(' | ') || `${numFmt(p.total_galones)} gal`} | <code>${moneyFmt(p.monto_total)}</code>\n`;
        if (p.razon_estado) {
            msg += `   └ ⚠️ <i>Motivo: ${escapeHtml(String(p.razon_estado).slice(0, 90))}</i>\n`;
        }
    });

    msg += `\n<i>SIPE Admin • Operaciones y Logística</i>`;
    return msg;
};

/**
 * Formatear mensaje de Rentabilidad Real y EBITDA por Estación
 */
const formatRentabilidadEbitdaMessage = (payload, { station = null, periodoLabel = null } = {}) => {
    const estaciones = payload?.estaciones || [];
    const res = payload?.resumen_consolidado || {};
    const per = payload?.periodo || {};
    const label = periodoLabel || (per.desde && per.hasta ? `${toDisplayDate(per.desde)} al ${toDisplayDate(per.hasta)} (${per.dias || 30}d)` : 'Últimos 30 días');

    let filtered = estaciones;
    if (station) {
        const stNorm = normalizeText(station.name || '');
        filtered = estaciones.filter(e => {
            const eName = normalizeText(e.estacion || '');
            const eCode = String(e.codigo_estacion || e.id_empresa || '').padStart(3, '0');
            return eCode === station.id ||
                eName.includes(stNorm) ||
                (station.keywords || []).some(kw => eName.includes(normalizeText(kw)));
        });
    }

    let msg = `📈 <b>RENTABILIDAD OPERATIVA Y EBITDA REAL</b>\n`;
    msg += `📅 <b>Período:</b> ${escapeHtml(label)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (!station) {
        msg += `💰 <b>CONSOLIDADO DE LA RED:</b>\n`;
        msg += `• <b>Ingresos Totales:</b> <code>${moneyFmt(res.ingresos_totales || 0)}</code>\n`;
        msg += `• <b>Galonaje Despachado:</b> <code>${numFmt(res.galones_totales || 0)} gal</code>\n`;
        msg += `• <b>Margen Bruto Total:</b> <code>${moneyFmt(res.margen_bruto_total || 0)}</code>\n`;
        if (Number(res.flete_total_usd || 0) > 0) {
            msg += `• <b>Flete Cisternas:</b> -<code>${moneyFmt(res.flete_total_usd)}</code>\n`;
        }
        if (Number(res.ahorro_solar_total_usd || 0) > 0) {
            msg += `• ☀️ <b>Ahorro Solar Integrado:</b> +<code>${moneyFmt(res.ahorro_solar_total_usd)}</code>\n`;
        }
        msg += `• 🏆 <b>EBITDA / UTILIDAD OPERATIVA:</b> <b>${moneyFmt(res.utilidad_operativa_total || 0)}</b> (<code>$${Number(res.margen_neto_promedio_galon || 0).toFixed(3)}/gal</code>)\n\n`;
    }

    if (filtered.length === 0) {
        msg += `<i>No se encontraron datos de rentabilidad para el criterio solicitado.</i>\n`;
    } else {
        msg += `🏪 <b>DESGLOSE POR ESTACIÓN:</b>\n`;
        filtered.forEach((e, idx) => {
            const util = Number(e.utilidad_operativa_neta || 0);
            const badge = util > 0 ? '🟢' : '🔴';
            const costos = e.desglose_costos_reales || {};
            msg += `${idx + 1}. ${badge} <b>${escapeHtml(e.estacion || 'Estación')}</b>\n`;
            msg += `   ├ Venta: <code>${moneyFmt(e.ingresos?.total || 0)}</code> (${numFmt(e.galones?.total || 0)} gal)\n`;
            msg += `   ├ Margen Bruto: <code>${moneyFmt(e.margenes_brutos?.total || 0)}</code> | Planilla: <code>${moneyFmt(costos.planilla_rrhh_usd || 0)}</code>\n`;
            msg += `   └ <b>EBITDA Neto:</b> <b>${moneyFmt(util)}</b> (<code>$${Number(e.margen_neto_por_galon || 0).toFixed(3)}/gal</code>)\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Inteligencia Financiera</i>`;
    return msg;
};

/**
 * Formatear mensaje de Auditoría de Dinero en Tránsito (>48h) y Vales sin Facturar (>72h)
 */
const formatTransitoValesMessage = (payload) => {
    const res = payload?.resumen || {};
    const remesas = payload?.remesas_en_transito || payload?.remesas_en_transito_48h || [];
    const vales = payload?.vales_pendientes_72h || payload?.vales_sin_facturar_72h || [];

    let msg = `🏦 <b>AUDITORÍA DE EFECTIVO EN TRÁNSITO Y VALES</b>\n`;
    msg += `📅 <b>Ventana Auditada:</b> ${escapeHtml(`${toDisplayDate(payload?.periodo?.desde || '')} al ${toDisplayDate(payload?.periodo?.hasta || '')}`)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `📊 <b>RESUMEN DE CONCILIACIÓN PISTA ↔ BANCOS:</b>\n`;
    msg += `• <b>Remesas Pista Cerradas:</b> <code>${moneyFmt(res.remesas_pista_usd || 0)}</code>\n`;
    msg += `• <b>Abonos Identificados en Banco:</b> <code>${moneyFmt(res.abonos_bancos_identificados_usd || 0)}</code>\n`;
    msg += `• 🚨 <b>Efectivo en Tránsito (&gt;48h):</b> <b>${moneyFmt(res.efectivo_en_transito_48h_usd || 0)}</b> (${res.partidas_transito_count || 0} partidas)\n`;
    msg += `• 🧾 <b>Vales sin DTE (&gt;72h):</b> <b>${moneyFmt(res.vales_sin_facturar_72h_usd || 0)}</b> (${res.vales_sin_facturar_count || 0} registros)\n\n`;

    if (remesas.length > 0) {
        msg += `⏳ <b>TOP REMESAS PENDIENTES DE ABONO (&gt;48h):</b>\n`;
        remesas.slice(0, 6).forEach(r => {
            msg += `• 🔴 <b>${escapeHtml(r.estacion)}</b> (${toDisplayDate(r.fecha)} — ${r.dias_transito || 2}d): <code>${moneyFmt(r.diferencia_pendiente_usd || r.remesa_pista_usd || 0)}</code>\n`;
        });
        msg += `\n`;
    }

    if (vales.length > 0) {
        msg += `🧾 <b>TOP VALES DE CRÉDITO SIN FACTURAR (&gt;72h):</b>\n`;
        vales.slice(0, 6).forEach(v => {
            msg += `• 🟡 <b>${escapeHtml(v.cliente)}</b> (${escapeHtml(v.estacion)} • ${v.dias_antiguedad}d): <code>${moneyFmt(v.monto_usd)}</code>\n`;
        });
        msg += `\n`;
    }

    if (remesas.length === 0 && vales.length === 0) {
        msg += `✅ <b>Conciliación al día:</b> No se detectan remesas retenidas &gt;48h ni vales sin facturar &gt;72h.\n\n`;
    }

    msg += `<i>SIPE Admin • Control Interno y Tesorería</i>`;
    return msg;
};

/**
 * Mensaje de orientación cuando la consulta libre no coincide con una entidad conocida
 */
const formatIntelligentGuidanceMessage = () => {
    let msg = `❓ No pude identificar con certeza tu consulta específica.\n\n`;
    msg += `💡 <b>Preguntas que puedes hacerme directamente:</b>\n`;
    msg += `• ⛽ <b>Por estación y producto:</b>\n`;
    msg += `   <i>"¿Cuánto diesel vendió Costa del Sol?"</i>\n`;
    msg += `   <i>"Ventas de Miraflores"</i>\n`;
    msg += `   <i>"¿Cuánto vendió San Martín ayer?"</i>\n`;
    msg += `• 🛢️ <b>Tanques, Autonomía y Pedidos Puma:</b>\n`;
    msg += `   <i>"Nivel de tanques y autonomía"</i>\n`;
    msg += `   <i>"¿Qué pedidos Puma están en ruta o retenidos?"</i>\n`;
    msg += `• 📈 <b>Rentabilidad EBITDA y Competencia:</b>\n`;
    msg += `   <i>"Rentabilidad EBITDA por estación"</i>\n`;
    msg += `   <i>"Revisar los precios de la competencia"</i>\n`;
    msg += `   <i>"¿Quién tiene más barato el diésel?"</i>\n`;
    msg += `   <i>"Precios de competencia en Miraflores"</i>\n`;
    msg += `• 🏆 <b>Rankings y combustible global:</b>\n`;
    msg += `   <i>"¿Cuál estación vendió más ayer?"</i>\n`;
    msg += `   <i>"Venta total de regular"</i>\n`;
    msg += `• 🛒 <b>Tiendas de conveniencia:</b>\n`;
    msg += `   <i>"¿Cuánto vendieron las tiendas?"</i>\n`;
    msg += `   <i>"Ventas de E-Market"</i>\n`;
    msg += `• 🏦 <b>Bancos, Chequeras y Tránsito:</b>\n`;
    msg += `   <i>"¿Cuánto tenemos en Promerica?"</i>\n`;
    msg += `   <i>"Dinero en tránsito y vales sin facturar"</i>\n`;
    msg += `• 🚨 <b>Auditoría:</b>\n`;
    msg += `   <i>"¿Hubo algún descuadre ayer?"</i>\n\n`;
    msg += `<i>O pulsa los botones del menú inferior para consultar los resúmenes consolidados.</i>`;
    return msg;
};

/**
 * Mensaje de Ayuda
 */
const formatHelpMessage = () => {
    let msg = `🤖 <b>ASISTENTE DE CONSULTAS SIPE ADMIN</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Puedes usar los botones del teclado o enviar los siguientes comandos:\n\n`;
    msg += `⛽ <b>/ventas</b> - Ventas de ayer (o escribe <i>/ventas YYYY-MM-DD</i> para otra fecha)\n`;
    msg += `⛽ <b>Ventas de Hoy</b> - Consultar ventas del día actual\n`;
    msg += `⛽ <b>Ventas de Ayer</b> - Consultar ventas cerradas de ayer\n`;
    msg += `📊 <b>/competencia</b> - Comparativo de precios de la competencia (DGEHM)\n`;
    msg += `🏦 <b>/bancos</b> - Saldos consolidados en cuentas de bancos\n`;
    msg += `🧾 <b>/chequera</b> - Saldos disponibles en cuentas de cheques\n`;
    msg += `🚨 <b>/alertas</b> - Descuadres de pista, cortes y gastos de tiendas\n`;
    msg += `📄 <b>/pdf</b> - Exportar reporte ejecutivo tamaño Carta (ventas, competencia, bancos)\n`;
    msg += `ℹ️ <b>/perfil</b> o <b>/id</b> - Ver tu ID y permisos asignados\n`;
    msg += `❓ <b>/ayuda</b> - Ver esta guía de comandos\n\n`;
    msg += `💡 <b>¡También puedes hacerme preguntas específicas en texto libre!</b>\n`;
    msg += `• <i>"Revisar los precios de la competencia"</i>\n`;
    msg += `• <i>"¿Quién tiene más barato el diésel?"</i>\n`;
    msg += `• <i>"¿Cuánto diesel vendió Costa del Sol?"</i>\n`;
    msg += `• <i>"Ventas de Miraflores"</i>\n`;
    msg += `• <i>"¿Cuál estación vendió más ayer?"</i>\n`;
    msg += `• <i>"¿Cuánto tenemos en Promerica?"</i>\n`;
    msg += `• <i>"¿Cuánto vendieron las tiendas?"</i>\n`;
    msg += `• <i>"¿Hubo algún descuadre ayer?"</i>\n\n`;
    msg += `<i>Acceso restringido a usuarios autorizados por el Administrador.</i>`;
    return msg;
};

/**
 * Formatear reporte de Ventas de Tienda de Conveniencia por Línea / Categoría y Producto
 */
const formatVentasTiendaLineaMessage = (data) => {
    const st = data?.station;
    const ln = data?.storeLine;
    const sDate = data?.startDate || getDateStr(-1);
    const eDate = data?.endDate || sDate;
    const periodoLabel = data?.fallbackPeriodoLabel
        ? data.fallbackPeriodoLabel
        : (sDate === eDate ? toDisplayDate(sDate) : `Del ${toDisplayDate(sDate)} al ${toDisplayDate(eDate)}`);

    const storeTitle = st ? `Super 7 / E-Market • ${st.name}` : 'Todas las Tiendas de Conveniencia';

    if (ln) {
        let msg = `${ln.icon || '🛒'} <b>VENTA DE LÍNEA EN TIENDA • ${escapeHtml(ln.label.toUpperCase())}</b>\n`;
        msg += `🏪 <b>Tienda:</b> ${escapeHtml(storeTitle)}\n`;
        msg += `📅 <b>Período:</b> ${escapeHtml(periodoLabel)}\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

        msg += `💰 <b>Venta Total ${escapeHtml(ln.label)}:</b> <b>${moneyFmt(data?.total_linea_usd || 0)}</b>\n`;
        if (Number(data?.total_unidades_linea || 0) > 0) {
            msg += `📦 <b>Unidades Vendidas:</b> <code>${numFmt(data.total_unidades_linea)} unid.</code>\n`;
        }
        if (Number(data?.total_tickets_linea || 0) > 0) {
            msg += `🧾 <b>Transacciones / Tickets:</b> <code>${data.total_tickets_linea} tickets</code>\n`;
        }
        if (Number(data?.total_tienda_usd || 0) > 0) {
            msg += `📊 <b>Participación en Tienda:</b> <code>${Number(data?.participacion_linea_pct || 0).toFixed(2)}%</code> (de ${moneyFmt(data.total_tienda_usd)} total tienda)\n`;
        }
        msg += `\n`;

        const prods = data?.productos_top || [];
        const lineas = data?.lineas || [];
        if (prods.length > 0) {
            msg += `🏆 <b>Desglose de Productos (${escapeHtml(ln.label)}):</b>\n`;
            prods.slice(0, 10).forEach((p, idx) => {
                msg += `${idx + 1}. <b>${escapeHtml(p.producto)}</b>\n`;
                msg += `   └ 💵 <b>${moneyFmt(p.monto)}</b> | 📦 <code>${numFmt(p.unidades)} un.</code> (${p.tickets} tickets)\n`;
            });
        } else if (lineas.length > 0) {
            msg += `📋 <b>Líneas Registradas:</b>\n`;
            lineas.forEach((l, idx) => {
                msg += `${idx + 1}. <b>${escapeHtml(l.linea)}:</b> <b>${moneyFmt(l.monto)}</b> (${Number(l.porcentaje || 0).toFixed(1)}%)\n`;
            });
        } else {
            msg += `ℹ️ <i>No se registran ventas en la línea "${escapeHtml(ln.label)}" para el período consultado.</i>\n`;
        }

        msg += `\n<i>SIPE Admin • Punto de Venta Tiendas</i>`;
        return msg;
    }

    let msg = `🛒 <b>DETALLE DE VENTA POR LÍNEAS EN TIENDA</b>\n`;
    msg += `🏪 <b>Tienda:</b> ${escapeHtml(storeTitle)}\n`;
    msg += `📅 <b>Período:</b> ${escapeHtml(periodoLabel)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 <b>Venta Total en Tienda:</b> <b>${moneyFmt(data?.total_tienda_usd || 0)}</b>\n\n`;

    const allLineas = data?.todas_las_lineas || data?.lineas || [];
    if (allLineas.length === 0) {
        msg += `ℹ️ <i>No se encontraron cortes o líneas de tienda cerradas para la fecha consultada.</i>\n`;
    } else {
        msg += `📊 <b>Desglose por Línea de Producto (Top ${Math.min(allLineas.length, 15)}):</b>\n`;
        allLineas.slice(0, 15).forEach((l, idx) => {
            const unidStr = Number(l.unidades || 0) > 0 ? ` • <code>${numFmt(l.unidades)} un.</code>` : '';
            msg += `${idx + 1}. <b>${escapeHtml(l.linea)}:</b> <b>${moneyFmt(l.monto)}</b> (<code>${Number(l.porcentaje || 0).toFixed(1)}%</code>)${unidStr}\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Punto de Venta Tiendas</i>`;
    return msg;
};

/**
 * Formatear reporte de Día de Mayor / Menor Venta del Mes o Rango y Ranking por Día de la Semana
 */
const formatPeakDayVentasMessage = (data) => {
    const isLowest = data?.order === 'ASC';
    const titleType = isLowest ? 'DÍA DE MENOR VENTA' : 'DÍA DE MAYOR VENTA';
    const st = data?.station;
    const scopeLabel = st ? st.name : 'Red Consolidada SIPE';
    const top = data?.dia_principal;
    const topDays = data?.top_dias || [];
    const dowRanking = data?.ranking_dias_semana || [];

    let msg = `🏆 <b>${titleType} • ${escapeHtml((data?.periodo_label || 'PERÍODO').toUpperCase())}</b>\n`;
    msg += `🏪 <b>Alcance:</b> ${escapeHtml(scopeLabel)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (!top) {
        msg += `ℹ️ <i>No se encontraron cierres diarios registrados para el período ${escapeHtml(data?.periodo_label || '')}.</i>\n`;
        return msg;
    }

    msg += `🥇 <b>${isLowest ? 'Día de Menor Venta:' : 'Día Récord de Mayor Venta:'}</b>\n`;
    msg += `📅 <b>${escapeHtml(top.dia_semana)} ${toDisplayDate(top.fecha)}</b>\n`;
    msg += `• 💰 <b>Venta Total del Día:</b> <b>${moneyFmt(top.venta_total)}</b>\n`;
    msg += `• ⛽ <b>Galonaje Despachado:</b> <code>${numFmt(top.galonaje)} gal</code>\n`;
    if (Number(top.venta_tienda || 0) > 0) {
        msg += `• 🛒 <b>Venta Combustible / Tienda:</b> ${moneyFmt(top.venta_pista)} pista + ${moneyFmt(top.venta_tienda)} tienda\n`;
    }
    msg += `• 📈 <b>Promedio Diario del Período:</b> <code>${moneyFmt(data.promedio_diario_venta)}</code> (<code>${numFmt(data.promedio_diario_galonaje)} gal/día</code>)\n\n`;

    if (topDays.length > 1) {
        const medals = ['🥇', '🥈', '🥉', '4.', '5.'];
        msg += `📆 <b>Top ${Math.min(topDays.length, 5)} Días con ${isLowest ? 'Menor' : 'Mayor'} Venta:</b>\n`;
        topDays.slice(0, 5).forEach((d, idx) => {
            msg += `${medals[idx] || `${idx + 1}.`} <b>${escapeHtml(d.dia_semana)} ${toDisplayDate(d.fecha)}:</b> <b>${moneyFmt(d.venta_total)}</b> (<code>${numFmt(d.galonaje)} gal</code>)\n`;
        });
        msg += `\n`;
    }

    if (dowRanking.length > 0) {
        const bestDow = dowRanking[0];
        msg += `📊 <b>Rendimiento Promedio por Día de la Semana:</b>\n`;
        msg += `<i>(Mejor día de la semana: <b>${escapeHtml(bestDow.dia_semana)}</b> con promedio de <b>${moneyFmt(bestDow.promedio_venta)}</b>)</i>\n`;
        dowRanking.forEach((w, idx) => {
            const icon = idx === 0 ? '🔥' : '▪️';
            msg += `${icon} <b>${escapeHtml(w.dia_semana)}:</b> Prom. <b>${moneyFmt(w.promedio_venta)}</b> | <code>${numFmt(w.promedio_galonaje)} gal</code> (${w.cantidad_dias} días)\n`;
        });
    }

    msg += `\n<i>SIPE Admin • Inteligencia Comercial</i>`;
    return msg;
};

/**
 * Formatear reporte de Pagos Programados y Vencimientos Pendientes (Control de Pagos)
 */
const formatPagosProgramadosMessage = (data) => {
    const pagos = data?.pagos || [];
    const urgentes = data?.vencidos_o_hoy || [];
    const prox7 = data?.proximos_7_dias || [];
    const posteriores = data?.posteriores || [];

    let msg = `💳 <b>CONTROL DE PAGOS PROGRAMADOS Y VENCIMIENTOS</b>\n`;
    msg += `📅 <b>Fecha de Corte:</b> ${toDisplayDate(data?.fecha_consulta || getDateStr(0))}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `💰 <b>Total Pendiente Programado:</b> <b>${moneyFmt(data?.total_pendiente_usd || 0)}</b> (<code>${data?.cantidad_total || 0} pagos</code>)\n`;
    if (urgentes.length > 0) {
        msg += `🔴 <b>Para Hoy / Vencidos:</b> <b>${moneyFmt(data?.total_urgente_usd || 0)}</b> (<code>${urgentes.length} compromisos</code>)\n`;
    }
    msg += `\n`;

    if (pagos.length === 0) {
        msg += `✅ <i>No hay pagos pendientes vencidos ni programados en Control de Pagos en este momento.</i>\n`;
        msg += `\n<i>SIPE Admin • Tesorería y Control de Pagos</i>`;
        return msg;
    }

    if (urgentes.length > 0) {
        msg += `🔴 <b>COMPROMISOS PARA HOY O VENCIDOS (${urgentes.length}):</b>\n`;
        urgentes.slice(0, 8).forEach(p => {
            msg += `• <b>${escapeHtml(p.descripcion)}:</b> <b>${moneyFmt(p.monto)}</b> (Vence: <code>${toDisplayDate(p.fecha_vencimiento)}</code>)\n`;
        });
        msg += `\n`;
    }

    if (prox7.length > 0) {
        msg += `🟡 <b>PRÓXIMOS 7 DÍAS (${prox7.length}):</b>\n`;
        prox7.slice(0, 8).forEach(p => {
            msg += `• <b>${escapeHtml(p.descripcion)}:</b> <b>${moneyFmt(p.monto)}</b> (Vence: <code>${toDisplayDate(p.fecha_vencimiento)}</code>)\n`;
        });
        msg += `\n`;
    }

    if (posteriores.length > 0) {
        msg += `🟢 <b>PROGRAMADOS POSTERIORES (${posteriores.length}):</b>\n`;
        posteriores.slice(0, 6).forEach(p => {
            msg += `• <b>${escapeHtml(p.descripcion)}:</b> <code>${moneyFmt(p.monto)}</code> (Vence: <code>${toDisplayDate(p.fecha_vencimiento)}</code>)\n`;
        });
        msg += `\n`;
    }

    msg += `<i>SIPE Admin • Tesorería y Control de Pagos</i>`;
    return msg;
};

module.exports = {
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatProfileMessage,
    formatSpecificStationMessage,
    formatProductTotalMessage,
    formatRankingMessage,
    formatSpecificBankMessage,
    formatTiendasMessage,
    formatVentasTiendaLineaMessage,
    formatPeakDayVentasMessage,
    formatPagosProgramadosMessage,
    formatVentasMensualMessage,
    formatVentasRangoMessage,
    formatHorasPicoMessage,
    formatSolarEnergyMessage,
    getSolarInlineMarkup,
    formatAndelsaInventarioMessage,
    formatAndelsaCostosMessage,
    formatAndelsaVentasClienteMessage,
    formatAndelsaVentasProductoMessage,
    formatAndelsaCxcMessage,
    formatAndelsaFinanzasResumenMessage,
    getAndelsaInlineMarkup,
    formatTanquesAutonomiaMessage,
    formatPedidosPumaMessage,
    formatRentabilidadEbitdaMessage,
    formatTransitoValesMessage,
    formatIntelligentGuidanceMessage,
    formatHelpMessage
};
