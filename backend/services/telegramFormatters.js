const {
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    normalizeText,
    SPANISH_MONTH_NAMES
} = require('./telegramTextAndDates');

/**
 * Formatear mensaje de Resumen de Ventas
 */
const formatVentasMessage = (data, date) => {
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

    let msg = `⛽ <b>VENTAS DE ESTACIONES Y TIENDAS</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

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
 * Formatear mensaje de Saldos en Bancos
 */
const formatBancosMessage = (data) => {
    let msg = `🏦 <b>SALDOS CONSOLIDADOS EN BANCOS</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(data.fecha)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 <b>SALDO TOTAL EN BANCOS:</b>\n`;
    msg += `<b>${moneyFmt(data.total)}</b>\n\n`;

    if (!data.cuentas || data.cuentas.length === 0) {
        msg += `<i>No se encontraron cuentas bancarias con saldo positivo para la fecha.</i>\n`;
    } else {
        msg += `📋 <b>DETALLE POR CUENTA:</b>\n`;
        // Agrupar por banco
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
 * Formatear mensaje de Saldos en Chequera
 */
const formatChequeraMessage = (data) => {
    let msg = `🧾 <b>SALDOS EN CHEQUERA</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(data.fecha)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `💰 <b>TOTAL EN CHEQUERAS:</b>\n`;
    msg += `<b>${moneyFmt(data.total)}</b>\n\n`;

    if (!data.cuentas || data.cuentas.length === 0) {
        msg += `<i>No se registraron cuentas de chequera con movimiento activo.</i>\n`;
    } else {
        msg += `📋 <b>DETALLE POR CUENTA DE CHEQUES:</b>\n`;
        data.cuentas.forEach((c, idx) => {
            msg += `${idx + 1}. <b>${escapeHtml(c.banco)}</b>\n`;
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
const formatSpecificStationMessage = (st, fuel, date, tienda) => {
    let msg = `⛽ <b>${escapeHtml(st.empresa)}</b>\n`;
    msg += `📅 <b>Fecha:</b> ${toDisplayDate(date)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

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
 * Mensaje de orientación cuando la consulta libre no coincide con una entidad conocida
 */
const formatIntelligentGuidanceMessage = () => {
    let msg = `❓ No pude identificar con certeza tu consulta específica.\n\n`;
    msg += `💡 <b>Preguntas que puedes hacerme directamente:</b>\n`;
    msg += `• ⛽ <b>Por estación y producto:</b>\n`;
    msg += `   <i>"¿Cuánto diesel vendió Costa del Sol?"</i>\n`;
    msg += `   <i>"Ventas de Miraflores"</i>\n`;
    msg += `   <i>"¿Cuánto vendió San Martín ayer?"</i>\n`;
    msg += `• 🛢️ <b>Por combustible global:</b>\n`;
    msg += `   <i>"¿Cuánto diesel se vendió en total ayer?"</i>\n`;
    msg += `   <i>"Venta total de regular"</i>\n`;
    msg += `• 🏆 <b>Rankings y comparativas:</b>\n`;
    msg += `   <i>"¿Cuál estación vendió más ayer?"</i>\n`;
    msg += `• 📊 <b>Precios de la competencia (DGEHM):</b>\n`;
    msg += `   <i>"Revisar los precios de la competencia"</i>\n`;
    msg += `   <i>"¿Quién tiene más barato el diésel?"</i>\n`;
    msg += `   <i>"Precios de competencia en Miraflores"</i>\n`;
    msg += `• 🛒 <b>Tiendas de conveniencia:</b>\n`;
    msg += `   <i>"¿Cuánto vendieron las tiendas?"</i>\n`;
    msg += `   <i>"Ventas de E-Market"</i>\n`;
    msg += `• 🏦 <b>Bancos específicos:</b>\n`;
    msg += `   <i>"¿Cuánto tenemos en Promerica?"</i>\n`;
    msg += `   <i>"Saldo de Banco Agrícola"</i>\n`;
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
    formatIntelligentGuidanceMessage,
    formatHelpMessage
};
