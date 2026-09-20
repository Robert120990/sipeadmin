const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { getDb, getExternalDb } = require('../db');

/**
 * Format date object into YYYY-MM-DD
 */
function toDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format currency to standard USD format ($ 1,234.56)
 */
function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return `$ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format Date into human-readable Spanish string
 */
function formatSpanishDate(d = new Date()) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    const dayName = days[d.getDay()];
    const day = d.getDate();
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();
    return `${dayName}, ${day} de ${monthName} de ${year}`;
}

/**
 * Fetch payments that are due today
 */
async function getDuePayments(targetDate = new Date()) {
    const externalDb = await getExternalDb();
    const dateStr = toDateString(targetDate);

    const query = `
        SELECT 
            c.descripcion AS ubicacion,
            b.descripcion,
            DATE_FORMAT(a.vencimiento, '%d/%m/%Y') AS fecha_vencimiento,
            DATE_FORMAT(a.vencimiento, '%Y-%m-%d') AS fecha_iso,
            b.monto,
            COALESCE(b.forma_pago, 'Sin observación') AS forma_pago,
            a.estado,
            a.id,
            b.id AS id_recordatorio
        FROM web_rc_recordatorios_vencimientos a
        INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
        INNER JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
        WHERE a.estado = 'P' 
          AND b.activo = 1
          AND DATE(a.vencimiento) = ?
        ORDER BY c.descripcion, b.descripcion
    `;

    const [payments] = await externalDb.query(query, [dateStr]);

    // Query overdue summary as helpful context
    let overdueSummary = { total_vencidos: 0, monto_vencidos: 0 };
    try {
        const [overdueRows] = await externalDb.query(`
            SELECT COUNT(*) AS total_vencidos, COALESCE(SUM(b.monto), 0) AS monto_vencidos
            FROM web_rc_recordatorios_vencimientos a
            INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
            WHERE a.estado = 'P' AND b.activo = 1 AND DATE(a.vencimiento) < ?
        `, [dateStr]);
        if (overdueRows && overdueRows[0]) {
            overdueSummary = {
                total_vencidos: Number(overdueRows[0].total_vencidos) || 0,
                monto_vencidos: Number(overdueRows[0].monto_vencidos) || 0
            };
        }
    } catch (err) {
        console.warn('[Payment Notifier] Warning fetching overdue summary:', err.message);
    }

    return { payments, overdueSummary };
}

/**
 * Build email template for payments due today
 */
function buildPaymentEmailHtml(payments, dateFormatted, overdueSummary) {
    const totalAmount = payments.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);

    const rowsHtml = payments.map((p, index) => {
        const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `
            <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 14px; font-weight: 600; color: #1e293b; font-size: 13px;">
                    ${p.ubicacion}
                </td>
                <td style="padding: 12px 14px; color: #334155; font-size: 13px;">
                    ${p.descripcion}
                </td>
                <td style="padding: 12px 14px; text-align: right; color: #b91c1c; font-weight: 700; font-size: 14px;">
                    ${formatCurrency(p.monto)}
                </td>
                <td style="padding: 12px 14px; color: #64748b; font-size: 12px;">
                    ${p.forma_pago || '—'}
                </td>
            </tr>
        `;
    }).join('');

    const overdueAlertHtml = overdueSummary && overdueSummary.total_vencidos > 0 ? `
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 6px; margin-top: 24px;">
            <p style="margin: 0; color: #991b1b; font-size: 13px;">
                <strong>Aviso Adicional:</strong> Existen además <strong>${overdueSummary.total_vencidos}</strong> pagos vencidos anteriores pendientes de cancelación, con un monto acumulado de <strong>${formatCurrency(overdueSummary.monto_vencidos)}</strong>.
            </p>
        </div>
    ` : '';

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recordatorio de Pagos - SIPE</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 720px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            
            <!-- Header Banner -->
            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px 24px; text-align: center; color: #ffffff;">
                <div style="font-size: 32px; margin-bottom: 8px;">🔔</div>
                <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em; color: #f8fafc;">
                    Recordatorio de Pagos que Vencen Hoy
                </h1>
                <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1;">
                    ${dateFormatted}
                </p>
            </div>

            <!-- Summary KPI Cards -->
            <div style="padding: 24px 28px;">
                <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 200px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; display: block; margin-bottom: 4px;">
                            Pagos por Vencer Hoy
                        </span>
                        <span style="font-size: 26px; font-weight: 800; color: #0f172a;">
                            ${payments.length}
                        </span>
                    </div>
                    <div style="flex: 1; min-width: 200px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; text-align: center;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #1d4ed8; font-weight: 600; display: block; margin-bottom: 4px;">
                            Monto Total del Día
                        </span>
                        <span style="font-size: 26px; font-weight: 800; color: #1e40af;">
                            ${formatCurrency(totalAmount)}
                        </span>
                    </div>
                </div>

                <!-- Table of Payments -->
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background-color: #1e293b; color: #ffffff;">
                                <th style="padding: 10px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-top-left-radius: 6px;">Ubicación</th>
                                <th style="padding: 10px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Descripción</th>
                                <th style="padding: 10px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; text-align: right;">Monto</th>
                                <th style="padding: 10px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-top-right-radius: 6px;">Observación</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="background-color: #f1f5f9; font-weight: 700; border-top: 2px solid #cbd5e1;">
                                <td colspan="2" style="padding: 12px 14px; font-size: 13px; color: #1e293b;">Total General</td>
                                <td style="padding: 12px 14px; font-size: 14px; text-align: right; color: #b91c1c;">${formatCurrency(totalAmount)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                ${overdueAlertHtml}

                <div style="margin-top: 24px; text-align: center; padding: 14px; background-color: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
                    <p style="margin: 0; color: #475569; font-size: 13px;">
                        💡 Para registrar pagos o marcar vencimientos como cancelados, acceda a <strong>SIPE Admin &gt; Operaciones &gt; Control de Recordatorios</strong>.
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; color: #64748b; font-size: 12px;">
                <p style="margin: 0;">
                    Este recordatorio automático fue enviado por <strong>SIPE Admin</strong>.
                </p>
                <p style="margin: 4px 0 0; font-size: 11px; color: #94a3b8;">
                    Enviado a la cuenta de correo de oficina configurada en el sistema.
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
}

/**
 * Check payments due today and send reminder notification
 */
async function sendPaymentReminderNotification(options = {}) {
    const {
        forceSendEmpty = false,
        customRecipient = null,
        targetDate = new Date()
    } = options;

    const db = getDb();
    const [rows] = await db.query("SELECT * FROM email_configs ORDER BY created_at DESC LIMIT 1");
    const emailConfig = rows[0];

    if (!emailConfig || !emailConfig.host || !emailConfig.user || !emailConfig.password) {
        const errorMsg = 'Configuración SMTP incompleta en email_configs. No se pudo enviar el recordatorio.';
        console.warn(`[Payment Notifier] ${errorMsg}`);
        return { sent: false, reason: errorMsg };
    }

    const recipient = customRecipient || emailConfig.office_email || emailConfig.user;
    if (!recipient) {
        const errorMsg = 'No se ha configurado el correo de oficina ni el usuario destinatario.';
        console.warn(`[Payment Notifier] ${errorMsg}`);
        return { sent: false, reason: errorMsg };
    }

    const { payments, overdueSummary } = await getDuePayments(targetDate);
    const dateFormatted = formatSpanishDate(targetDate);

    if (!payments || payments.length === 0) {
        if (!forceSendEmpty) {
            console.log(`[Payment Notifier] No hay pagos que vencen hoy (${dateFormatted}). Envío omitido.`);
            return {
                sent: false,
                count: 0,
                message: `No hay pagos que vencen en la fecha ${dateFormatted}. No se envió correo.`
            };
        }

        // When forceSendEmpty is true (e.g. user manual test)
        const transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: emailConfig.port || 587,
            secure: Boolean(emailConfig.secure),
            auth: { user: emailConfig.user, pass: emailConfig.password },
            tls: { rejectUnauthorized: false }
        });

        await transporter.sendMail({
            from: `"${emailConfig.from_address || 'SIPE Notificaciones'}" <${emailConfig.user}>`,
            to: recipient,
            subject: `Recordatorio de Pagos - ${dateFormatted}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #334155;">
                    <h2>Recordatorio de Pagos (${dateFormatted})</h2>
                    <p>No se encontraron pagos programados que venzan en el día de hoy.</p>
                </div>
            `
        });

        return {
            sent: true,
            count: 0,
            recipient,
            message: `Informe vacío de pagos enviado a ${recipient}`
        };
    }

    const totalAmount = payments.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);

    const transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port || 587,
        secure: Boolean(emailConfig.secure),
        auth: { user: emailConfig.user, pass: emailConfig.password },
        tls: { rejectUnauthorized: false }
    });

    const htmlContent = buildPaymentEmailHtml(payments, dateFormatted, overdueSummary);

    await transporter.sendMail({
        from: `"${emailConfig.from_address || 'SIPE Notificaciones'}" <${emailConfig.user}>`,
        to: recipient,
        subject: `🔔 Recordatorio: ${payments.length} Pago(s) Vencen Hoy (${formatCurrency(totalAmount)}) - ${dateFormatted}`,
        html: htmlContent
    });

    console.log(`[Payment Notifier] Recordatorio enviado a ${recipient} con ${payments.length} pago(s) por un total de ${formatCurrency(totalAmount)}.`);

    return {
        sent: true,
        count: payments.length,
        totalAmount,
        recipient,
        message: `Recordatorio enviado con éxito a ${recipient} con ${payments.length} pago(s) que vencen hoy.`,
        payments
    };
}

/**
 * Initialize daily cron job scheduled at 08:00 AM (America/El_Salvador timezone)
 */
function initPaymentScheduler() {
    // Schedule: 08:00 AM every day
    const cronExpression = '0 8 * * *';

    const scheduledTask = cron.schedule(cronExpression, async () => {
        console.log('[Payment Notifier Cron] Iniciando verificación diaria de pagos que vencen hoy (08:00 AM)...');
        try {
            const result = await sendPaymentReminderNotification();
            console.log('[Payment Notifier Cron] Resultado:', result.message || result.reason);
        } catch (err) {
            console.error('[Payment Notifier Cron] Error ejecutando tarea diaria:', err);
        }
    }, {
        timezone: 'America/El_Salvador'
    });

    console.log('[Payment Notifier] Programador diario de pagos inicializado: 08:00 AM (Zona horaria: America/El_Salvador).');
    return scheduledTask;
}

module.exports = {
    getDuePayments,
    buildPaymentEmailHtml,
    sendPaymentReminderNotification,
    initPaymentScheduler,
    formatCurrency,
    formatSpanishDate
};
