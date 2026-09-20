const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { getDb, getAccountingDb } = require('../db');

/**
 * Fetch employees whose birthday matches today (or a specific date)
 */
async function getTodaysBirthdays(targetDate = new Date()) {
    const accountingDb = await getAccountingDb();
    const day = targetDate.getDate();
    const month = targetDate.getMonth() + 1;

    const query = `
        SELECT 
            CONCAT(TRIM(e.nombres), ' ', TRIM(e.apellidos)) AS nombre,
            DATE_FORMAT(e.fecha_nacimiento, '%d/%m/%Y') AS fecha_nacimiento,
            DAY(e.fecha_nacimiento) AS dia,
            MONTH(e.fecha_nacimiento) AS mes,
            TIMESTAMPDIFF(YEAR, e.fecha_nacimiento, ?) AS edad_cumplida,
            c.razon_social AS empresa,
            COALESCE(d.descripcion, 'Sin asignar') AS departamento
        FROM rh_empleados e
        JOIN companies c ON e.company_id = c.id
        LEFT JOIN rh_departamentos d ON e.departamento_personal_id = d.id
        WHERE e.es_activo = 1 
          AND e.fecha_nacimiento IS NOT NULL 
          AND MONTH(e.fecha_nacimiento) = ?
          AND DAY(e.fecha_nacimiento) = ?
        ORDER BY c.razon_social, d.descripcion, e.apellidos, e.nombres
    `;

    const [rows] = await accountingDb.query(query, [targetDate, month, day]);
    return rows;
}

/**
 * Build a polished, responsive HTML email template for the birthday report
 */
function buildBirthdayEmailHtml(birthdays, dateStr) {
    const rowsHtml = birthdays.map((b, index) => {
        const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        return `
            <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 16px; font-weight: 600; color: #1e293b; font-size: 14px;">
                    ${b.nombre}
                </td>
                <td style="padding: 12px 16px; color: #475569; font-size: 13px;">
                    ${b.empresa || 'N/A'}
                </td>
                <td style="padding: 12px 16px; color: #475569; font-size: 13px;">
                    ${b.departamento || 'Sin asignar'}
                </td>
                <td style="padding: 12px 16px; text-align: center; color: #2563eb; font-weight: 600; font-size: 13px;">
                    ${b.edad_cumplida ? `${b.edad_cumplida} años` : (b.fecha_nacimiento || 'Hoy')}
                </td>
            </tr>
        `;
    }).join('');

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cumpleañeros del Día - SIPE</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 680px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            
            <!-- Header Banner -->
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
                <div style="font-size: 36px; margin-bottom: 8px;">🎉</div>
                <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">
                    Cumpleañeros del Día
                </h1>
                <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">
                    ${dateStr}
                </p>
            </div>

            <!-- Content Body -->
            <div style="padding: 24px 28px;">
                <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 6px; margin-bottom: 24px;">
                    <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 500;">
                        Hoy celebramos el cumpleaños de <strong>${birthdays.length}</strong> colaborador${birthdays.length === 1 ? '' : 'es'} en la organización.
                    </p>
                </div>

                <!-- Table -->
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background-color: #0f172a; color: #ffffff;">
                                <th style="padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-top-left-radius: 6px;">Colaborador</th>
                                <th style="padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Empresa</th>
                                <th style="padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Departamento</th>
                                <th style="padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; text-align: center; border-top-right-radius: 6px;">Edad</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>

                <!-- Congratulations message -->
                <div style="margin-top: 28px; text-align: center; padding: 20px; background-color: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
                    <p style="margin: 0; color: #334155; font-size: 14px; font-weight: 500;">
                        🎂 ¡Le deseamos a cada uno un excelente día lleno de bendiciones y éxitos!
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; color: #64748b; font-size: 12px;">
                <p style="margin: 0;">
                    Este informe fue generado automáticamente por <strong>SIPE Admin</strong>.
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
 * Format a Date object into human-readable Spanish string (e.g. "Lunes, 20 de septiembre de 2026")
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
 * Check birthdays and send email notification
 */
async function sendBirthdayNotification(options = {}) {
    const {
        forceSendEmpty = false,
        customRecipient = null,
        targetDate = new Date()
    } = options;

    const db = getDb();
    const [rows] = await db.query("SELECT * FROM email_configs ORDER BY created_at DESC LIMIT 1");
    const emailConfig = rows[0];

    if (!emailConfig || !emailConfig.host || !emailConfig.user || !emailConfig.password) {
        const errorMsg = 'Configuración SMTP incompleta en email_configs. No se pudo enviar el informe.';
        console.warn(`[Birthday Notifier] ${errorMsg}`);
        return { sent: false, reason: errorMsg };
    }

    const recipient = customRecipient || emailConfig.office_email || emailConfig.user;
    if (!recipient) {
        const errorMsg = 'No se ha configurado el correo de oficina ni el usuario destinatario.';
        console.warn(`[Birthday Notifier] ${errorMsg}`);
        return { sent: false, reason: errorMsg };
    }

    const birthdays = await getTodaysBirthdays(targetDate);
    const dateFormatted = formatSpanishDate(targetDate);

    if (!birthdays || birthdays.length === 0) {
        if (!forceSendEmpty) {
            console.log(`[Birthday Notifier] No hay cumpleañeros registrados para hoy (${dateFormatted}). Envío omitido.`);
            return {
                sent: false,
                count: 0,
                message: `No hay cumpleañeros para la fecha ${dateFormatted}. No se envió correo.`
            };
        }

        // When forceSendEmpty is true (e.g. user manual test)
        const transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: emailConfig.port || 587,
            secure: Boolean(emailConfig.secure),
            auth: { user: emailConfig.user, pass: emailConfig.password },
            tls: { rejectUnauthorized: process.env.SMTP_ALLOW_SELF_SIGNED === 'true' ? false : true }
        });

        await transporter.sendMail({
            from: `"${emailConfig.from_address || 'SIPE Notificaciones'}" <${emailConfig.user}>`,
            to: recipient,
            subject: `Informe de Cumpleañeros - ${dateFormatted}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #334155;">
                    <h2>Informe de Cumpleañeros (${dateFormatted})</h2>
                    <p>No se encontraron colaboradores cumpliendo años en el día de hoy.</p>
                </div>
            `
        });

        return {
            sent: true,
            count: 0,
            recipient,
            message: `Informe vacío enviado a ${recipient}`
        };
    }

    // Send email with birthdays
    const transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port || 587,
        secure: Boolean(emailConfig.secure),
        auth: { user: emailConfig.user, pass: emailConfig.password },
        tls: { rejectUnauthorized: process.env.SMTP_ALLOW_SELF_SIGNED === 'true' ? false : true }
    });

    const htmlContent = buildBirthdayEmailHtml(birthdays, dateFormatted);

    await transporter.sendMail({
        from: `"${emailConfig.from_address || 'SIPE Notificaciones'}" <${emailConfig.user}>`,
        to: recipient,
        subject: `🎉 Cumpleañeros de Hoy (${birthdays.length}) - ${dateFormatted}`,
        html: htmlContent
    });

    console.log(`[Birthday Notifier] Informe enviado a ${recipient} con ${birthdays.length} cumpleañero(s).`);

    return {
        sent: true,
        count: birthdays.length,
        recipient,
        message: `Informe enviado con éxito a ${recipient} con ${birthdays.length} cumpleañero(s).`,
        birthdays
    };
}

/**
 * Initialize daily cron job scheduled at 08:00 AM (America/El_Salvador timezone)
 */
function initBirthdayScheduler() {
    // Schedule: 08:00 AM every day
    // Cron syntax: minute (0), hour (8), day of month (*), month (*), day of week (*)
    const cronExpression = '0 8 * * *';

    const scheduledTask = cron.schedule(cronExpression, async () => {
        console.log('[Birthday Notifier Cron] Iniciando verificación diaria de cumpleañeros (08:00 AM)...');
        try {
            const result = await sendBirthdayNotification();
            console.log('[Birthday Notifier Cron] Resultado:', result.message || result.reason);
        } catch (err) {
            console.error('[Birthday Notifier Cron] Error ejecutando tarea diaria:', err);
        }
    }, {
        timezone: 'America/El_Salvador'
    });

    console.log('[Birthday Notifier] Programador diario inicializado: 08:00 AM (Zona horaria: America/El_Salvador).');
    return scheduledTask;
}

module.exports = {
    getTodaysBirthdays,
    buildBirthdayEmailHtml,
    sendBirthdayNotification,
    initBirthdayScheduler,
    formatSpanishDate
};
