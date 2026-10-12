const axios = require('axios');
const { getDb, getExternalDb } = require('../db');

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const DEFAULT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8852249993:AAHs51t4kIGqXfdEl8epRL0Le08PTZ52qu0';

let isPollingActive = false;
let lastPollAt = null;
let currentOffset = 0;
let botInfo = null;

/**
 * Mapeo oficial de nombres amigables de bancos
 */
const BANK_NAME_MAP = {
    'AGRICOLA': 'Banco Agrícola',
    'PROMERICA': 'Banco Promerica',
    'DAVIVIENDA': 'Banco Davivienda',
    'HIPOTECARIO': 'Banco Hipotecario',
    'ATLANTIDA': 'Banco Atlántida',
    'BANCO AZUL': 'Banco Azul',
    'CONSTELACION': 'Constelación',
    'FOMENTO AGROPECUARIO': 'Banco de Fomento Agropecuario',
    'CUSCATLAN': 'Banco Cuscatlán',
    'AMERICA CENTRAL': 'BAC Credomatic',
    'BAC': 'BAC Credomatic'
};

/**
 * Obtener token activo desde base de datos o variable de entorno
 */
const getBotToken = async () => {
    try {
        const db = getDb();
        if (db) {
            const [rows] = await db.query('SELECT bot_token, is_active FROM telegram_config WHERE id = 1 LIMIT 1');
            if (rows && rows.length > 0 && rows[0].bot_token) {
                return {
                    token: rows[0].bot_token.trim(),
                    isActive: Boolean(rows[0].is_active)
                };
            }
        }
    } catch (e) {
        // Base de datos puede estar iniciando
    }
    return {
        token: (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TOKEN).trim(),
        isActive: true
    };
};

/**
 * Escape de caracteres especiales para Telegram HTML mode
 */
const escapeHtml = (text) => {
    if (!text && text !== 0) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

/**
 * Formateador de moneda en USD
 */
const moneyFmt = (val) => {
    const num = Number(val || 0);
    const isNeg = num < 0;
    const abs = Math.abs(num);
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (isNeg ? '-' : '') + '$' + formatted;
};

/**
 * Formateador de números (galonaje, cantidades)
 */
const numFmt = (val) => {
    const num = Number(val || 0);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Convertir YYYY-MM-DD a DD/MM/YYYY
 */
const toDisplayDate = (ymd) => {
    if (!ymd) return '';
    const parts = ymd.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return ymd;
};

/**
 * Obtener fecha YYYY-MM-DD con desplazamiento en días
 */
const getDateStr = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Normalizar fecha enviada por el usuario (admite YYYY-MM-DD o DD/MM/YYYY)
 */
const parseUserDate = (input) => {
    if (!input) return null;
    const clean = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const match = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    return null;
};

/**
 * Teclado interactivo principal para Telegram
 */
const getMainReplyKeyboard = () => {
    return {
        keyboard: [
            [{ text: '⛽ Ventas de Hoy' }, { text: '⛽ Ventas de Ayer' }],
            [{ text: '🏦 Saldo en Banco' }, { text: '🧾 Saldo en Chequera' }],
            [{ text: '🚨 Alertas en Estaciones' }, { text: 'ℹ️ Mi Perfil' }]
        ],
        resize_keyboard: true,
        is_persistent: true
    };
};

/**
 * Comprobar conexión con la API de Telegram (getMe)
 */
const testTelegramConnection = async (customToken = null) => {
    const token = customToken || (await getBotToken()).token;
    if (!token) throw new Error('Token de Telegram no configurado');
    const res = await axios.get(`${TELEGRAM_API_BASE}${token}/getMe`, { timeout: 10000 });
    if (res.data?.ok) {
        botInfo = res.data.result;
        return res.data.result;
    }
    throw new Error('Respuesta inválida de Telegram API');
};

/**
 * Enviar mensaje a un chat de Telegram
 */
const sendTelegramMessage = async (chatId, text, replyMarkup = null) => {
    const { token } = await getBotToken();
    if (!token) return;

    const payload = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };

    if (replyMarkup) {
        payload.reply_markup = replyMarkup;
    }

    try {
        await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
    } catch (err) {
        // Si falló por formato HTML, intentar enviar como texto plano
        if (err.response?.data?.description?.includes('can\'t parse entities')) {
            const plainText = text.replace(/<[^>]*>?/gm, '');
            delete payload.parse_mode;
            payload.text = plainText;
            await axios.post(`${TELEGRAM_API_BASE}${token}/sendMessage`, payload, { timeout: 15000 });
        } else {
            console.error('[TelegramBot] Error enviando mensaje a chat:', chatId, err.message);
        }
    }
};

/**
 * Verificar o registrar usuario en telegram_usuarios
 */
const resolveTelegramUser = async (from) => {
    const db = getDb();
    if (!db) return null;

    const telegramUserId = String(from.id);
    const username = from.username ? `@${from.username}` : null;
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';

    try {
        const [rows] = await db.query(
            'SELECT * FROM telegram_usuarios WHERE telegram_user_id = ? LIMIT 1',
            [telegramUserId]
        );

        if (rows && rows.length > 0) {
            const user = rows[0];
            // Actualizar datos de perfil e interacción
            await db.query(
                `UPDATE telegram_usuarios 
                 SET telegram_username = ?, first_name = ?, last_name = ?, last_interaction = NOW() 
                 WHERE id = ?`,
                [username, firstName, lastName, user.id]
            );
            return { ...user, telegram_username: username, first_name: firstName, last_name: lastName };
        }

        // Si no existe, insertar con activo = 0 para aprobación administrativa
        const [insertRes] = await db.query(
            `INSERT INTO telegram_usuarios 
             (telegram_user_id, telegram_username, first_name, last_name, activo, permiso_ventas, permiso_saldos_banco, permiso_saldos_chequera, permiso_alertas, notas, last_interaction)
             VALUES (?, ?, ?, ?, 0, 1, 1, 1, 1, 'Solicitud automática desde Telegram', NOW())`,
            [telegramUserId, username, firstName, lastName]
        );

        return {
            id: insertRes.insertId,
            telegram_user_id: telegramUserId,
            telegram_username: username,
            first_name: firstName,
            last_name: lastName,
            activo: 0,
            permiso_ventas: 1,
            permiso_saldos_banco: 1,
            permiso_saldos_chequera: 1,
            permiso_alertas: 1
        };
    } catch (err) {
        console.error('[TelegramBot] Error resolviendo usuario:', err.message);
        return null;
    }
};

/**
 * Registrar en bitácora de consultas de Telegram
 */
const logTelegramQuery = async (telegramUserId, comando, consulta, autorizado = 1) => {
    try {
        const db = getDb();
        if (!db) return;
        await db.query(
            'INSERT INTO telegram_bitacora (telegram_user_id, comando, consulta, autorizado) VALUES (?, ?, ?, ?)',
            [String(telegramUserId), String(comando).slice(0, 100), String(consulta || '').slice(0, 250), autorizado ? 1 : 0]
        );
    } catch (e) {
        console.warn('[TelegramBot] No se pudo guardar bitácora de telegram:', e.message);
    }
};

/**
 * Consulta de Saldos en Bancos (sp_saldo_en_bancos con fallback)
 */
const getSaldosBancosData = async () => {
    const today = getDateStr(0);
    let bancosDetalle = [];
    let totalBancos = 0;

    try {
        const externalDb = await getExternalDb();
        if (externalDb) {
            const [spResults] = await externalDb.query('CALL sp_saldo_en_bancos(?)', [today]);
            const rows = spResults && spResults[0] ? spResults[0] : [];

            bancosDetalle = rows
                .filter(r => Number(r.new_saldo || r.saldo || 0) > 0)
                .map(r => {
                    const raw = (r.nom_banco || '').replace(/^A\s*-\s*/, '').trim();
                    const parts = raw.split(/\s*-\s*/);
                    const bancoKey = parts[0]?.trim() || 'Banco';
                    const banco = BANK_NAME_MAP[bancoKey] || bancoKey;
                    const cuentaDesc = parts.slice(1).join(' - ')?.trim() || r.num_cta || '';
                    const saldo = Number(r.new_saldo || r.saldo || 0);
                    return {
                        banco,
                        cuenta: r.num_cta ? (cuentaDesc ? `${cuentaDesc} (${r.num_cta})` : r.num_cta) : cuentaDesc,
                        saldo
                    };
                })
                .sort((a, b) => b.saldo - a.saldo);

            if (bancosDetalle.length > 0) {
                totalBancos = bancosDetalle.reduce((sum, b) => sum + b.saldo, 0);
                return { total: totalBancos, cuentas: bancosDetalle, fecha: today, fuente: 'sp_saldo_en_bancos' };
            }
        }
    } catch (err) {
        console.warn('[TelegramBot] Error en sp_saldo_en_bancos, ejecutando fallback local:', err.message);
    }

    // Fallback a cuentas locales
    try {
        const db = getDb();
        if (db) {
            const [bRows] = await db.query(`
                SELECT b.descripcion as banco, c.nombre as cuenta_desc, c.numero as cuenta,
                       COALESCE(SUM(m.abono - m.cargo), 0) as saldo
                FROM cuentas_bancarias c
                LEFT JOIN bancos b ON c.banco_id = b.id
                LEFT JOIN movimientos_bancarios m ON c.id = m.cuenta_bancaria_id
                WHERE c.activa = 1
                GROUP BY c.id, b.descripcion, c.nombre, c.numero
                HAVING saldo > 0
                ORDER BY saldo DESC
            `);
            bancosDetalle = (bRows || []).map(r => ({
                banco: r.banco || 'Banco',
                cuenta: r.cuenta ? `${r.cuenta_desc || ''} (${r.cuenta})`.trim() : (r.cuenta_desc || 'Cuenta'),
                saldo: Number(r.saldo || 0)
            }));
            totalBancos = bancosDetalle.reduce((sum, b) => sum + b.saldo, 0);
        }
    } catch (localErr) {
        console.warn('[TelegramBot] Error en fallback local de bancos:', localErr.message);
    }

    return { total: totalBancos, cuentas: bancosDetalle, fecha: today, fuente: 'local' };
};

/**
 * Consulta de Saldos en Chequera (sp_saldo_en_chequera con fallback)
 */
const getSaldosChequeraData = async () => {
    const today = getDateStr(0);
    let chequerasDetalle = [];
    let totalChequera = 0;

    try {
        const externalDb = await getExternalDb();
        if (externalDb) {
            const [spResults] = await externalDb.query('CALL sp_saldo_en_chequera(?)', [today]);
            const rows = spResults && spResults[0] ? spResults[0] : [];

            chequerasDetalle = rows
                .filter(r => Number(r.new_saldo ?? r.saldo_chequera ?? r.saldo ?? r.monto ?? 0) !== 0)
                .map(r => {
                    const raw = (r.nom_banco || r.banco || '').replace(/^A\s*-\s*/, '').trim();
                    const parts = raw.split(/\s*-\s*/);
                    const bancoKey = parts[0]?.trim() || 'Banco';
                    const banco = BANK_NAME_MAP[bancoKey] || bancoKey;
                    const numCta = r.num_cta || r.numero || r.cuenta || '';
                    const cuentaDesc = parts.slice(1).join(' - ')?.trim() || numCta;
                    const saldo = Number(r.new_saldo ?? r.saldo_chequera ?? r.saldo ?? r.monto ?? 0);
                    return {
                        banco,
                        cuenta: numCta ? (cuentaDesc ? `${cuentaDesc} (${numCta})` : numCta) : cuentaDesc,
                        saldo
                    };
                })
                .sort((a, b) => b.saldo - a.saldo);

            if (chequerasDetalle.length > 0) {
                totalChequera = chequerasDetalle.reduce((sum, c) => sum + c.saldo, 0);
                return { total: totalChequera, cuentas: chequerasDetalle, fecha: today, fuente: 'sp_saldo_en_chequera' };
            }
        }
    } catch (err) {
        console.warn('[TelegramBot] Error en sp_saldo_en_chequera, ejecutando fallback:', err.message);
    }

    // Fallback a validaciones_saldo_banco o movimientos de cuentas
    try {
        const db = getDb();
        if (db) {
            const [rows] = await db.query(`
                SELECT b.descripcion as banco, c.nombre as cuenta_desc, c.numero as cuenta,
                       v.saldo_chequera as saldo
                FROM validaciones_saldo_banco v
                INNER JOIN (
                    SELECT cuenta_bancaria_id, MAX(id) as max_id 
                    FROM validaciones_saldo_banco 
                    GROUP BY cuenta_bancaria_id
                ) latest ON v.id = latest.max_id
                INNER JOIN cuentas_bancarias c ON v.cuenta_bancaria_id = c.id
                LEFT JOIN bancos b ON c.banco_id = b.id
                WHERE c.activa = 1
                ORDER BY v.saldo_chequera DESC
            `);
            chequerasDetalle = (rows || []).map(r => ({
                banco: r.banco || 'Banco',
                cuenta: `${r.cuenta_desc || ''} (${r.cuenta})`.trim(),
                saldo: Number(r.saldo || 0)
            }));
            totalChequera = chequerasDetalle.reduce((sum, c) => sum + c.saldo, 0);
        }
    } catch (e) {
        console.warn('[TelegramBot] Error en fallback de chequeras:', e.message);
    }

    return { total: totalChequera, cuentas: chequerasDetalle, fecha: today, fuente: 'local' };
};

/**
 * Consulta de Ventas Consolidadas y Alertas
 */
const getConsolidadoVentas = async (date) => {
    const { getConsolidadoVentasData } = require('../routes/consultas');
    if (!getConsolidadoVentasData) {
        throw new Error('Módulo de consolidado de ventas no disponible');
    }
    return await getConsolidadoVentasData(date);
};

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
const formatProfileMessage = (user) => {
    let msg = `👤 <b>PERFIL DE USUARIO TELEGRAM</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `• <b>Nombre:</b> ${escapeHtml(`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'No especificado')}\n`;
    msg += `• <b>Usuario:</b> ${escapeHtml(user.telegram_username || 'Sin @username')}\n`;
    msg += `• <b>ID Telegram:</b> <code>${escapeHtml(user.telegram_user_id)}</code>\n`;
    msg += `• <b>Estado:</b> ${user.activo ? '🟢 <b>Activo / Autorizado</b>' : '🔴 <b>Inactivo</b>'}\n\n`;
    msg += `🔑 <b>PERMISOS DE CONSULTA ASIGNADOS:</b>\n`;
    msg += `${user.permiso_ventas ? '✅' : '❌'} <b>Ventas de Estaciones</b>\n`;
    msg += `${user.permiso_saldos_banco ? '✅' : '❌'} <b>Saldo en Bancos</b>\n`;
    msg += `${user.permiso_saldos_chequera ? '✅' : '❌'} <b>Saldo en Chequera</b>\n`;
    msg += `${user.permiso_alertas ? '✅' : '❌'} <b>Alertas en Estaciones</b>\n\n`;
    msg += `<i>Administrado desde SIPE Admin (Seguridad &gt; Usuarios de Telegram)</i>`;
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
    msg += `🏦 <b>/bancos</b> - Saldos consolidados en cuentas de bancos\n`;
    msg += `🧾 <b>/chequera</b> - Saldos disponibles en cuentas de cheques\n`;
    msg += `🚨 <b>/alertas</b> - Descuadres de pista, cortes y gastos de tiendas\n`;
    msg += `ℹ️ <b>/perfil</b> o <b>/id</b> - Ver tu ID y permisos asignados\n`;
    msg += `❓ <b>/ayuda</b> - Ver esta guía de comandos\n\n`;
    msg += `<i>Acceso restringido a usuarios autorizados por el Administrador.</i>`;
    return msg;
};

/**
 * Procesar un mensaje entrante de Telegram
 */
const handleIncomingMessage = async (msg) => {
    if (!msg || !msg.chat || !msg.from) return;

    const chatId = msg.chat.id;
    const rawText = (msg.text || '').trim();
    if (!rawText) return;

    // 1. Resolver usuario en la base de datos
    const user = await resolveTelegramUser(msg.from);
    if (!user) {
        await sendTelegramMessage(chatId, '⚠️ Error interno del sistema al identificar usuario.');
        return;
    }

    // 2. Verificar si está autorizado (activo = 1)
    if (!user.activo) {
        await logTelegramQuery(user.telegram_user_id, rawText, 'Acceso denegado (usuario inactivo)', 0);
        const name = escapeHtml(user.first_name || 'Usuario');
        const notAuthMsg = `⛔ <b>Acceso no autorizado</b>\n\n` +
            `Hola <b>${name}</b>.\n` +
            `Tu ID de Telegram es: <code>${escapeHtml(user.telegram_user_id)}</code>.\n\n` +
            `Tu cuenta aún no tiene permisos para realizar consultas en <b>SIPE Admin</b>.\n` +
            `Se ha registrado tu solicitud para que un administrador del sistema habilite tu acceso desde el panel web (<i>Seguridad &gt; Usuarios de Telegram</i>).`;
        await sendTelegramMessage(chatId, notAuthMsg);
        return;
    }

    const keyboard = getMainReplyKeyboard();
    const cleanLower = rawText.toLowerCase().replace(/^[/\s]+/, '');

    // Comandos de Saludo / Inicio
    if (cleanLower === 'start' || cleanLower === 'menu' || cleanLower === 'hola' || cleanLower === 'inicio') {
        await logTelegramQuery(user.telegram_user_id, '/start', 'Menú principal', 1);
        const name = escapeHtml(user.first_name || 'Usuario');
        const welcome = `👋 ¡Hola <b>${name}</b>!\n` +
            `Bienvenido al asistente de consultas gerenciales de <b>SIPE Admin</b>.\n\n` +
            `Usa los botones inferiores para consultar información en tiempo real:`;
        await sendTelegramMessage(chatId, welcome, keyboard);
        return;
    }

    // Comandos de Perfil / ID
    if (cleanLower === 'perfil' || cleanLower === 'id' || cleanLower === 'mi_id' || cleanLower.includes('mi perfil')) {
        await logTelegramQuery(user.telegram_user_id, '/perfil', 'Consulta de perfil', 1);
        await sendTelegramMessage(chatId, formatProfileMessage(user), keyboard);
        return;
    }

    // Comandos de Ayuda
    if (cleanLower === 'ayuda' || cleanLower === 'help') {
        await logTelegramQuery(user.telegram_user_id, '/ayuda', 'Consulta de ayuda', 1);
        await sendTelegramMessage(chatId, formatHelpMessage(), keyboard);
        return;
    }

    // 3. CONSULTA: SALDO EN BANCO
    if (cleanLower.includes('saldo en banco') || cleanLower === 'bancos' || cleanLower === 'banco' || cleanLower === 'saldos') {
        if (!user.permiso_saldos_banco) {
            await logTelegramQuery(user.telegram_user_id, 'bancos', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar saldos en bancos.', keyboard);
            return;
        }

        await sendTelegramMessage(chatId, '⏳ Consultando saldos consolidados en bancos...');
        try {
            const data = await getSaldosBancosData();
            await logTelegramQuery(user.telegram_user_id, 'bancos', `Total: ${data.total}`, 1);
            await sendTelegramMessage(chatId, formatBancosMessage(data), keyboard);
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de bancos:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar saldos bancarios: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 4. CONSULTA: SALDO EN CHEQUERA
    if (cleanLower.includes('saldo en chequera') || cleanLower === 'chequera' || cleanLower === 'cheques' || cleanLower === 'saldo_chequera') {
        if (!user.permiso_saldos_chequera) {
            await logTelegramQuery(user.telegram_user_id, 'chequera', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar saldos en chequera.', keyboard);
            return;
        }

        await sendTelegramMessage(chatId, '⏳ Consultando saldos en chequeras...');
        try {
            const data = await getSaldosChequeraData();
            await logTelegramQuery(user.telegram_user_id, 'chequera', `Total: ${data.total}`, 1);
            await sendTelegramMessage(chatId, formatChequeraMessage(data), keyboard);
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de chequera:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar saldos en chequeras: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 5. CONSULTA: ALERTAS EN ESTACIONES
    if (cleanLower.includes('alertas') || cleanLower.includes('descuadres') || cleanLower.includes('auditoria')) {
        if (!user.permiso_alertas) {
            await logTelegramQuery(user.telegram_user_id, 'alertas', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar alertas operativas.', keyboard);
            return;
        }

        // Determinar fecha (por defecto ayer, o la indicada)
        let targetDate = getDateStr(-1);
        const parts = rawText.split(/\s+/);
        if (parts.length > 1) {
            const parsed = parseUserDate(parts[1]);
            if (parsed) targetDate = parsed;
            if (parts[1].toLowerCase() === 'hoy') targetDate = getDateStr(0);
            if (parts[1].toLowerCase() === 'ayer') targetDate = getDateStr(-1);
        }

        await sendTelegramMessage(chatId, `⏳ Analizando auditoría y descuadres del ${toDisplayDate(targetDate)}...`);
        try {
            const data = await getConsolidadoVentas(targetDate);
            await logTelegramQuery(user.telegram_user_id, 'alertas', `Fecha: ${targetDate}`, 1);
            await sendTelegramMessage(chatId, formatAlertasMessage(data, targetDate), keyboard);
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de alertas:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar alertas operativas: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // 6. CONSULTA: VENTAS DE ESTACIONES
    if (cleanLower.includes('ventas') || cleanLower.includes('venta') || cleanLower.includes('combustible')) {
        if (!user.permiso_ventas) {
            await logTelegramQuery(user.telegram_user_id, 'ventas', 'Permiso denegado', 0);
            await sendTelegramMessage(chatId, '⚠️ No tienes permiso asignado para consultar ventas de estaciones.', keyboard);
            return;
        }

        let targetDate = getDateStr(-1); // Ventas cerradas de ayer por defecto
        if (cleanLower.includes('hoy') || rawText.includes('Hoy')) {
            targetDate = getDateStr(0);
        } else if (cleanLower.includes('ayer') || rawText.includes('Ayer')) {
            targetDate = getDateStr(-1);
        } else {
            // Verificar si mandó una fecha específica ej. /ventas 2026-10-10
            const words = rawText.split(/\s+/);
            for (const w of words) {
                const parsed = parseUserDate(w);
                if (parsed) {
                    targetDate = parsed;
                    break;
                }
            }
        }

        await sendTelegramMessage(chatId, `⏳ Consultando consolidado de ventas del ${toDisplayDate(targetDate)}...`);
        try {
            const data = await getConsolidadoVentas(targetDate);
            await logTelegramQuery(user.telegram_user_id, 'ventas', `Fecha: ${targetDate}`, 1);
            await sendTelegramMessage(chatId, formatVentasMessage(data, targetDate), keyboard);
        } catch (err) {
            console.error('[TelegramBot] Error en consulta de ventas:', err);
            await sendTelegramMessage(chatId, '❌ Ocurrió un error al consultar las ventas: ' + escapeHtml(err.message), keyboard);
        }
        return;
    }

    // Mensaje no reconocido
    await logTelegramQuery(user.telegram_user_id, rawText, 'Comando no reconocido', 1);
    await sendTelegramMessage(
        chatId,
        '❓ No reconocí esa opción. Por favor selecciona una de las opciones del menú interactivo inferior o escribe <b>/ayuda</b>.',
        keyboard
    );
};

/**
 * Ciclo principal de Long Polling para Telegram Bot
 */
const runPollingLoop = async () => {
    while (isPollingActive) {
        try {
            const { token, isActive } = await getBotToken();
            if (!isActive || !token) {
                console.log('[TelegramBot] Bot en pausa o sin token. Esperando 10 segundos...');
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }

            lastPollAt = new Date();

            // Actualizar timestamp en base de datos cada cierto tiempo
            try {
                const db = getDb();
                if (db) {
                    await db.query('UPDATE telegram_config SET last_poll_at = NOW() WHERE id = 1');
                }
            } catch (_) {
                // Silenciosamente ignorar fallo de actualización de timestamp en polling
            }

            const res = await axios.get(`${TELEGRAM_API_BASE}${token}/getUpdates`, {
                params: {
                    offset: currentOffset,
                    timeout: 20
                },
                timeout: 30000
            });

            if (res.data?.ok && Array.isArray(res.data.result)) {
                const updates = res.data.result;
                for (const update of updates) {
                    currentOffset = update.update_id + 1;
                    if (update.message) {
                        // Procesar de manera asíncrona sin bloquear la recepción
                        handleIncomingMessage(update.message).catch(err => {
                            console.error('[TelegramBot] Error procesando mensaje:', err.message);
                        });
                    }
                }
            }
        } catch (err) {
            // Manejar errores típicos de polling
            if (err.response?.status === 409) {
                console.warn('[TelegramBot] 409 Conflict: Otra instancia está realizando polling. Reintentando en 6s...');
                await new Promise(r => setTimeout(r, 6000));
            } else if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
                // Timeout de conexión normal de long polling, continuar
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.warn('[TelegramBot] Error en ciclo de polling:', err.message);
                await new Promise(r => setTimeout(r, 4000));
            }
        }
    }
    console.log('[TelegramBot] Long Polling detenido.');
};

/**
 * Iniciar el servicio de Telegram Bot
 */
const initTelegramBot = async () => {
    if (isPollingActive) {
        console.log('[TelegramBot] Polling ya se encuentra activo.');
        return;
    }

    try {
        const { token, isActive } = await getBotToken();
        if (!isActive) {
            console.log('[TelegramBot] Bot configurado como inactivo en base de datos.');
            return;
        }

        // Testear bot con getMe
        try {
            botInfo = await testTelegramConnection(token);
            console.log(`[TelegramBot] Conectado exitosamente: @${botInfo.username} (${botInfo.first_name})`);

            const db = getDb();
            if (db) {
                await db.query(
                    'UPDATE telegram_config SET bot_username = ?, bot_first_name = ?, last_poll_at = NOW() WHERE id = 1',
                    [botInfo.username || 'SIPE_IA_BOT', botInfo.first_name || 'SIPE_BOT']
                );
            }
        } catch (connErr) {
            console.warn('[TelegramBot] Advertencia: no se pudo verificar getMe de inmediato:', connErr.message);
        }

        isPollingActive = true;
        runPollingLoop().catch(e => console.error('[TelegramBot] Fallo crítico en polling loop:', e));
    } catch (e) {
        console.error('[TelegramBot] Error al inicializar bot:', e.message);
    }
};

/**
 * Detener el servicio de polling
 */
const stopTelegramBot = () => {
    isPollingActive = false;
};

/**
 * Reiniciar el servicio
 */
const restartTelegramBot = async () => {
    stopTelegramBot();
    await new Promise(r => setTimeout(r, 1000));
    await initTelegramBot();
};

/**
 * Obtener estado para la API web
 */
const getBotStatus = async () => {
    const { token, isActive } = await getBotToken();
    let isConnected = false;
    let details = botInfo;

    try {
        if (token) {
            details = await testTelegramConnection(token);
            isConnected = true;
        }
    } catch (e) {
        isConnected = false;
    }

    return {
        isConnected,
        isPolling: isPollingActive,
        isActive,
        lastPollAt,
        bot: details || {
            id: 8852249993,
            username: 'SIPE_IA_BOT',
            first_name: 'SIPE_BOT'
        }
    };
};

module.exports = {
    initTelegramBot,
    stopTelegramBot,
    restartTelegramBot,
    getBotStatus,
    testTelegramConnection,
    sendTelegramMessage,
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
    formatProfileMessage,
    formatHelpMessage,
    parseUserDate,
    moneyFmt,
    numFmt
};
