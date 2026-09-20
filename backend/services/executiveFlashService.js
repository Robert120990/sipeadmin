const nodemailer = require('nodemailer');
const { GoogleGenAI } = require('@google/genai');
const { getDb, getAccountingDb, getExternalDb, withRetry } = require('../db');
const { getTanquesAutonomia } = require('./fuelIntelligence');

/**
 * Formatea una fecha YYYY-MM-DD a texto en español (ej. sábado, 19 de septiembre de 2026)
 */
const formatFechaTexto = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = String(dateStr).split('-').map(Number);
    if (!y || !m || !d) return String(dateStr);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Genera el Flash Ejecutivo Diario para Dueños y Directores
 */
const getFlashEjecutivo = async () => {
    const db = getDb();
    const accountingDb = await getAccountingDb();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // 1. Ventas por estación (solo turnos cerrados) para Ayer y Hoy
    const sqlVentasTurno = `
        SELECT b.id as id_empresa, b.nombre as estacion,
               COALESCE(SUM(r.diferencia), 0.0) as galones,
               COALESCE(SUM(r.monto), 0.0) as venta_monto
        FROM branches b
        JOIN gas_station_closeouts c ON b.id = c.branch_id
        JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
        WHERE c.estado = 'cerrado' AND c.fecha_turno = ?
        GROUP BY b.id, b.nombre
        ORDER BY b.id
    `;

    let ventasAyer = { 
        fecha: yesterdayStr,
        fecha_texto: formatFechaTexto(yesterdayStr),
        total_galones: 0, 
        total_dolares: 0, 
        margen_promedio_galon: 0.28, 
        estaciones: [] 
    };

    try {
        let [rowsAyer] = await withRetry(() => accountingDb.query(sqlVentasTurno, [yesterdayStr]));
        let fechaAplicada = yesterdayStr;

        // Si ayer aún no tiene turnos cerrados, tomar el último día con turnos cerrados
        if (rowsAyer.length === 0) {
            const [latestClosedRows] = await withRetry(() => accountingDb.query(
                "SELECT MAX(fecha_turno) as latest_date FROM gas_station_closeouts WHERE estado = 'cerrado'"
            ));
            let lastClosedDate = latestClosedRows[0]?.latest_date;
            if (lastClosedDate instanceof Date) lastClosedDate = lastClosedDate.toISOString().split('T')[0];
            if (lastClosedDate) {
                fechaAplicada = lastClosedDate;
                const [rowsLatest] = await withRetry(() => accountingDb.query(sqlVentasTurno, [lastClosedDate]));
                rowsAyer = rowsLatest;
            }
        }

        if (rowsAyer.length > 0) {
            const totG = rowsAyer.reduce((s, r) => s + Number(r.galones || 0), 0);
            const totV = rowsAyer.reduce((s, r) => s + Number(r.venta_monto || 0), 0);
            ventasAyer = {
                fecha: fechaAplicada,
                fecha_texto: formatFechaTexto(fechaAplicada),
                total_galones: Math.round(totG),
                total_dolares: Math.round(totV),
                margen_promedio_galon: 0.28,
                estaciones: rowsAyer.map(r => ({
                    id_empresa: r.id_empresa,
                    estacion: r.estacion,
                    galones: Math.round(Number(r.galones || 0)),
                    venta_monto: Math.round(Number(r.venta_monto || 0))
                }))
            };
        }
    } catch (err) {
        console.warn('Error al obtener ventas de ayer:', err.message);
    }

    // Ventas de hoy en curso (turnos cerrados hasta el momento)
    let ventasHoy = {
        fecha: todayStr,
        fecha_texto: formatFechaTexto(todayStr),
        total_galones: 0,
        total_dolares: 0,
        margen_promedio_galon: 0.28,
        estaciones: []
    };

    try {
        const [rowsHoy] = await withRetry(() => accountingDb.query(sqlVentasTurno, [todayStr]));
        if (rowsHoy.length > 0) {
            const totGHoy = rowsHoy.reduce((s, r) => s + Number(r.galones || 0), 0);
            const totVHoy = rowsHoy.reduce((s, r) => s + Number(r.venta_monto || 0), 0);
            ventasHoy = {
                fecha: todayStr,
                fecha_texto: formatFechaTexto(todayStr),
                total_galones: Math.round(totGHoy),
                total_dolares: Math.round(totVHoy),
                margen_promedio_galon: 0.28,
                estaciones: rowsHoy.map(r => ({
                    id_empresa: r.id_empresa,
                    estacion: r.estacion,
                    galones: Math.round(Number(r.galones || 0)),
                    venta_monto: Math.round(Number(r.venta_monto || 0))
                }))
            };
        }
    } catch (err) {
        console.warn('Error al obtener ventas de hoy:', err.message);
    }

    // 2. Saldos disponibles en bancos (desde SP de bancos o cuentas activas)
    let totalBancos = 0;
    let bancosDetalle = [];
    const bankNameMap = {
        'AMERICA CENTRAL': 'BAC Credomatic',
        'CITIBANK': 'Banco Cuscatlán',
        'AGRICOLA': 'Banco Agrícola',
        'PROMERICA': 'Banco Promerica',
        'DAVIVIENDA': 'Banco Davivienda',
        'HIPOTECARIO': 'Banco Hipotecario',
        'ATLANTIDA': 'Banco Atlántida',
        'BANCO AZUL': 'Banco Azul',
        'CONSTELACION': 'Constelación',
        'FOMENTO AGROPECUARIO': 'Banco de Fomento Agropecuario'
    };

    try {
        const externalDb = await getExternalDb();
        const [spResults] = await withRetry(() => externalDb.query('CALL sp_saldo_en_bancos(?)', [todayStr]));
        const rows = spResults[0] || [];

        const parsed = rows
            .filter(r => Number(r.new_saldo || 0) > 0)
            .map(r => {
                const raw = (r.nom_banco || '').replace(/^A\s*-\s*/, '').trim();
                const parts = raw.split(/\s*-\s*/);
                const bancoKey = parts[0]?.trim() || 'Banco';
                const banco = bankNameMap[bancoKey] || bancoKey;
                const cuentaDesc = parts.slice(1).join(' - ')?.trim() || r.num_cta || '';
                return {
                    banco,
                    cuenta: r.num_cta ? (cuentaDesc ? `${cuentaDesc} (${r.num_cta})` : r.num_cta) : cuentaDesc,
                    saldo: Math.round(Number(r.new_saldo || 0))
                };
            })
            .sort((a, b) => b.saldo - a.saldo);

        if (parsed.length > 0) {
            bancosDetalle = parsed;
            totalBancos = parsed.reduce((sum, b) => sum + b.saldo, 0);
        }
    } catch (err) {
        console.warn('Error al obtener saldos bancarios desde sp_saldo_en_bancos:', err.message);
    }

    // Fallback a cuentas locales si SP falló o no devolvió cuentas
    if (bancosDetalle.length === 0) {
        try {
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
            if (bRows.length > 0) {
                bancosDetalle = bRows.map(r => ({
                    banco: r.banco || 'Banco',
                    cuenta: r.cuenta ? `${r.cuenta_desc || ''} (${r.cuenta})` : r.cuenta_desc,
                    saldo: Math.round(Number(r.saldo || 0))
                }));
                totalBancos = bancosDetalle.reduce((sum, b) => sum + b.saldo, 0);
            }
        } catch (errFallback) {
            console.warn('Error fallback bancos:', errFallback.message);
        }
    }

    // 3. Autonomía de Tanques y Alertas Críticas
    let tanquesCriticos = [];
    try {
        const autonomia = await getTanquesAutonomia();
        tanquesCriticos = autonomia.tanques.filter(t => t.estado === 'critico' || t.horas_restantes < 24);
    } catch (err) {
        console.warn('Error al verificar tanques críticos:', err.message);
    }

    // 4. Compromisos financieros de las próximas 48 horas
    let compromisosProximos = [];
    let totalCompromisos48h = 0;
    try {
        const en48h = new Date(today);
        en48h.setDate(en48h.getDate() + 2);
        const en48hStr = en48h.toISOString().split('T')[0];

        // Préstamos con cuota en próximas 48h
        const diaHoy = today.getDate();
        const diaManana = new Date(today.getTime() + 24 * 60 * 60 * 1000).getDate();
        const [pRows] = await db.query(`
            SELECT numero_prestamo, descripcion, cuota_total,
                   COALESCE(DAY(fecha_primer_pago), 15) as dia_pago
            FROM prestamos
            WHERE estado = 'activo' AND COALESCE(DAY(fecha_primer_pago), 15) IN (?, ?)
        `, [diaHoy, diaManana]);
        pRows.forEach(p => {
            const m = Number(p.cuota_total || 0);
            totalCompromisos48h += m;
            compromisosProximos.push({
                tipo: 'Préstamo Bancario',
                descripcion: `${p.numero_prestamo} - ${p.descripcion}`,
                monto: Math.round(m),
                fecha: todayStr
            });
        });

        // Quedans / cuentas por pagar de proveedores de Nova SaaS
        const [recRows] = await withRetry(() => accountingDb.query(`
            SELECT fecha_vencimiento, CONCAT('Quedan #', num_quedan) as descripcion, total as monto
            FROM purchase_quedans
            WHERE fecha_vencimiento BETWEEN ? AND ?
              AND status IN ('PENDING', 'SOLICITADO')
        `, [todayStr, en48hStr]));
        recRows.forEach(r => {
            const m = Number(r.monto || 0);
            totalCompromisos48h += m;
            compromisosProximos.push({
                tipo: 'Pago / Quedan',
                descripcion: r.descripcion,
                monto: Math.round(m),
                fecha: r.fecha_vencimiento instanceof Date ? r.fecha_vencimiento.toISOString().split('T')[0] : r.fecha_vencimiento
            });
        });
    } catch (err) {
        console.warn('Error al verificar compromisos 48h:', err.message);
    }

    // 5. Diagnóstico de Inteligencia Artificial (Gemini) si está disponible
    let aiDiagnostico = 'Operaciones de pista y balances financieros dentro de parámetros normales. Mantener monitoreo de tanques y flujo de caja.';
    if (process.env.GEMINI_API_KEY) {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const prompt = `Actúa como el CFO Corporativo del Grupo Empresarial SIPE de estaciones de servicio en El Salvador.
Proporciona un diagnóstico ejecutivo de 2 oraciones concisas y directas para los dueños sobre la situación de hoy:
- Ventas de ayer: $${ventasAyer.total_dolares.toLocaleString()} (${ventasAyer.total_galones.toLocaleString()} galones).
- Saldo en bancos disponible: $${Math.round(totalBancos).toLocaleString()}.
- Tanques críticos (<24h combustible): ${tanquesCriticos.length} tanques (${tanquesCriticos.map(t => `${t.estacion} - ${t.nombre_combustible}`).join(', ')}).
- Compromisos por pagar próximas 48h: $${Math.round(totalCompromisos48h).toLocaleString()}.
Responde únicamente con el texto ejecutivo directo sin títulos ni introducciones.`;

            const resAi = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            const raw = resAi.text || resAi.candidates?.[0]?.content?.parts?.[0]?.text;
            if (raw) aiDiagnostico = raw.trim();
        } catch (e) {
            console.warn('AI executive flash error:', e.message);
        }
    }

    // 6. Generar texto preformateado para WhatsApp / Telegram
    const formatDMY = (dStr) => {
        if (!dStr) return '';
        const parts = String(dStr).split('T')[0].split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dStr;
    };
    const fechaDMY = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    let whatsappText = `📊 *FLASH EJECUTIVO SIPE - ${fechaDMY}*\n`;
    whatsappText += `────────────────────────────\n`;
    whatsappText += `⛽ *Ventas de Ayer (${formatDMY(ventasAyer.fecha)}):* $${ventasAyer.total_dolares.toLocaleString()} (${ventasAyer.total_galones.toLocaleString()} gal)\n`;
    if (ventasAyer.estaciones && ventasAyer.estaciones.length > 0) {
        ventasAyer.estaciones.forEach(e => {
            whatsappText += `   • ${e.estacion}: $${e.venta_monto.toLocaleString()} (${e.galones.toLocaleString()} gal)\n`;
        });
    }
    if (ventasHoy.total_dolares > 0) {
        whatsappText += `\n⛽ *Ventas de Hoy (${formatDMY(ventasHoy.fecha)}):* $${ventasHoy.total_dolares.toLocaleString()} (${ventasHoy.total_galones.toLocaleString()} gal en turnos cerrados)\n`;
    }
    whatsappText += `\n🏦 *Liquidez en Bancos:* $${Math.round(totalBancos).toLocaleString()} USD (${bancosDetalle.length} cuentas)\n`;
    whatsappText += `💳 *Compromisos Próximas 48h:* $${Math.round(totalCompromisos48h).toLocaleString()} USD\n`;

    if (tanquesCriticos.length > 0) {
        whatsappText += `\n🚨 *ALERTA TANQUES (<24h combustible):*\n`;
        tanquesCriticos.forEach(t => {
            whatsappText += `   ⚠️ ${t.estacion} - ${t.nombre_combustible}: ${t.horas_restantes}h restantes (${t.stock_actual} gal)\n`;
        });
        whatsappText += `   👉 _Acción: Generar pedido de cisterna inmediato._\n`;
    } else {
        whatsappText += `\n✅ *Inventario en Tanques:* Todos los tanques con autonomía superior a 24 horas.\n`;
    }

    whatsappText += `\n💡 *Diagnóstico Dirección:* ${aiDiagnostico}\n`;
    whatsappText += `────────────────────────────\n`;
    whatsappText += `_Generado automáticamente por SIPE Admin Suite_`;

    return {
        fecha: todayStr,
        fecha_texto: fechaDMY,
        kpi: {
            ventas_ayer_usd: ventasAyer.total_dolares,
            ventas_ayer_galones: ventasAyer.total_galones,
            ventas_hoy_usd: ventasHoy.total_dolares,
            ventas_hoy_galones: ventasHoy.total_galones,
            liquidez_bancos_usd: Math.round(totalBancos),
            compromisos_48h_usd: Math.round(totalCompromisos48h),
            tanques_criticos_count: tanquesCriticos.length
        },
        ventas_ayer: ventasAyer,
        ventas_hoy: ventasHoy,
        bancos: bancosDetalle.slice(0, 10),
        total_bancos_cuentas: bancosDetalle.length,
        tanques_criticos: tanquesCriticos,
        compromisos_48h: compromisosProximos,
        diagnostico_ia: aiDiagnostico,
        whatsapp_text: whatsappText
    };
};

/**
 * Envía el Flash Ejecutivo por correo a los socios/dueños
 */
const enviarFlashPorEmail = async (destinatario) => {
    const db = getDb();
    const [rows] = await db.query("SELECT * FROM email_configs ORDER BY created_at DESC LIMIT 1");
    if (!rows.length) {
        throw new Error('No hay configuración de correo SMTP registrada en Configuración > Configuración Correo.');
    }
    const config = rows[0];
    const targetEmail = destinatario || config.office_email;
    if (!targetEmail) {
        throw new Error('No se especificó un correo destinatario ni hay un correo de oficina configurado.');
    }

    const flash = await getFlashEjecutivo();

    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port || 587,
        secure: Boolean(config.secure),
        auth: { user: config.user, pass: config.password },
        tls: { rejectUnauthorized: process.env.SMTP_ALLOW_SELF_SIGNED === 'true' ? false : true }
    });

    const html = `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b;">
            <div style="max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #ffffff; padding: 24px; text-align: center;">
                    <h1 style="margin: 0; font-size: 20px; font-weight: bold; letter-spacing: 0.05em;">SIPE ADMIN | DIRECCIÓN ESTRATÉGICA</h1>
                    <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">Resumen Ejecutivo Diario para Socios y Directores</p>
                    <p style="margin: 4px 0 0 0; opacity: 0.75; font-size: 11px;">${flash.fecha_texto.toUpperCase()}</p>
                </div>
                <div style="padding: 24px;">
                    <div style="display: flex; gap: 12px; margin-bottom: 20px;">
                        <div style="flex: 1; background: #eff6ff; border-radius: 8px; padding: 14px; text-align: center; border: 1px solid #bfdbfe;">
                            <div style="font-size: 11px; color: #1e40af; font-weight: bold; text-transform: uppercase;">Ventas de Ayer</div>
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a8a; margin-top: 4px;">$${flash.kpi.ventas_ayer_usd.toLocaleString()}</div>
                            <div style="font-size: 11px; color: #64748b;">${flash.kpi.ventas_ayer_galones.toLocaleString()} galones</div>
                        </div>
                        <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 14px; text-align: center; border: 1px solid #bbf7d0;">
                            <div style="font-size: 11px; color: #166534; font-weight: bold; text-transform: uppercase;">Saldo en Bancos</div>
                            <div style="font-size: 20px; font-weight: bold; color: #15803d; margin-top: 4px;">$${flash.kpi.liquidez_bancos_usd.toLocaleString()}</div>
                            <div style="font-size: 11px; color: #64748b;">Disponible consolidado</div>
                        </div>
                        <div style="flex: 1; background: ${flash.kpi.tanques_criticos_count > 0 ? '#fef2f2' : '#f8fafc'}; border-radius: 8px; padding: 14px; text-align: center; border: 1px solid ${flash.kpi.tanques_criticos_count > 0 ? '#fecaca' : '#e2e8f0'};">
                            <div style="font-size: 11px; color: ${flash.kpi.tanques_criticos_count > 0 ? '#b91c1c' : '#475569'}; font-weight: bold; text-transform: uppercase;">Tanques &lt;24h</div>
                            <div style="font-size: 20px; font-weight: bold; color: ${flash.kpi.tanques_criticos_count > 0 ? '#dc2626' : '#334155'}; margin-top: 4px;">${flash.kpi.tanques_criticos_count}</div>
                            <div style="font-size: 11px; color: #64748b;">En riesgo de quiebre</div>
                        </div>
                    </div>

                    <div style="background: #f1f5f9; border-left: 4px solid #3b82f6; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
                        <h4 style="margin: 0 0 6px 0; color: #1e3a8a; font-size: 13px;">💡 Diagnóstico Directivo</h4>
                        <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #334155;">${flash.diagnostico_ia}</p>
                    </div>

                    ${flash.tanques_criticos.length > 0 ? `
                        <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 8px 0; color: #be123c; font-size: 13px;">🚨 Tanques que requieren recarga urgente</h4>
                            <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #881337;">
                                ${flash.tanques_criticos.map(t => `<li><b>${t.estacion}</b> (${t.nombre_combustible}): <b>${t.horas_restantes} horas</b> restantes (${t.stock_actual} gal en vara).</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 11px; color: #94a3b8; text-align: center;">
                        Este informe fue compilado automáticamente por el motor de inteligencia de SIPE Admin.
                    </div>
                </div>
            </div>
        </div>
    `;

    await transporter.sendMail({
        from: `"${config.from_address || 'SIPE Admin'}" <${config.user}>`,
        to: targetEmail,
        subject: `[SIPE Flash] Resumen Ejecutivo - ${flash.fecha_texto}`,
        text: flash.whatsapp_text,
        html
    });

    return { success: true, email: targetEmail };
};

module.exports = {
    getFlashEjecutivo,
    enviarFlashPorEmail
};
