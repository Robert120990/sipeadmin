const solarEnergyService = require('./solarEnergyService');
const sysSaasService = require('./sysSaasService');
const { buildWeeklyExecutiveDossierPayload } = require('./operationalAuditService');
const {
    moneyFmt,
    numFmt,
    toDisplayDate,
    getDateStr
} = require('./telegramTextAndDates');
const {
    sendChatAction,
    sendTelegramDocument
} = require('./telegramTransportService');
const {
    getSaldosBancosData,
    getSaldosChequeraData,
    getConsolidadoVentas,
    priceFmt,
    pickEffectivePrice,
    getPreciosCompetenciaData
} = require('./telegramDataService');

/**
 * Generar un Reporte Ejecutivo en formato PDF Tamaño Carta (LETTER) completo
 */
const generateExecutiveReportPdf = ({
    title = 'REPORTE EJECUTIVO SIPE ADMIN',
    subtitle = 'Dirección Estratégica • Operaciones y Finanzas',
    dateStr = null,
    kpis = [],
    rows = [],
    columns = [],
    summaryText = ''
} = {}) => {
    return new Promise((resolve, reject) => {
        try {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
            const chunks = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', (err) => reject(err));

            const effectiveDateStr = dateStr || toDisplayDate(getDateStr(0));

            // 1. Encabezado Corporativo Tamaño Carta (612 x 792 pt, ancho útil 532 pt)
            doc.rect(40, 35, 532, 68).fill('#0f172a');
            doc.fillColor('#38bdf8').font('Helvetica-Bold').fontSize(9)
                .text('SIPE ADMIN • SUITE EJECUTIVA GERENCIAL', 54, 46);
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
                .text(String(title || 'REPORTE EJECUTIVO SIPE ADMIN').toUpperCase(), 54, 60, { width: 365 });
            doc.fillColor('#cbd5e1').font('Helvetica').fontSize(9)
                .text(String(subtitle || 'Dirección Estratégica • Operaciones y Finanzas'), 54, 80, { width: 365 });

            doc.fillColor('#f8fafc').font('Helvetica-Bold').fontSize(9)
                .text(`Fecha: ${effectiveDateStr}`, 415, 52, { width: 145, align: 'right' });
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
                .text('Formato: Carta (Letter)', 415, 68, { width: 145, align: 'right' });

            let cursorY = 118;

            // 2. Bloque de KPIs Ejecutivos
            if (Array.isArray(kpis) && kpis.length > 0) {
                const colsCount = Math.min(kpis.length, 4);
                const gap = 10;
                const cardWidth = Math.floor((532 - gap * (colsCount - 1)) / colsCount);

                kpis.forEach((kpi, idx) => {
                    if (idx > 0 && idx % 4 === 0) {
                        cursorY += 54;
                    }
                    const colIdx = idx % 4;
                    const cardX = 40 + colIdx * (cardWidth + gap);
                    doc.rect(cardX, cursorY, cardWidth, 46).fillAndStroke('#f8fafc', '#e2e8f0');

                    const kpiLabel = (kpi && typeof kpi === 'object') ? (kpi.label || kpi.title || `KPI ${idx + 1}`) : `Indicador ${idx + 1}`;
                    const kpiValue = (kpi && typeof kpi === 'object') ? (kpi.value ?? kpi.val ?? '') : String(kpi ?? '');

                    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5)
                        .text(String(kpiLabel).toUpperCase(), cardX + 8, cursorY + 8, { width: cardWidth - 16 });
                    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11)
                        .text(String(kpiValue), cardX + 8, cursorY + 23, { width: cardWidth - 16 });
                });

                cursorY += 58;
            }

            // 3. Resumen Ejecutivo
            if (summaryText) {
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10)
                    .text('RESUMEN EJECUTIVO', 40, cursorY);
                cursorY += 14;
                doc.fillColor('#334155').font('Helvetica').fontSize(9.5)
                    .text(String(summaryText), 40, cursorY, { width: 532 });
                cursorY = doc.y + 14;
            }

            // 4. Tabla de Datos
            if (Array.isArray(rows) && rows.length > 0) {
                let normalizedCols = [];
                if (Array.isArray(columns) && columns.length > 0) {
                    normalizedCols = columns.map(c => (typeof c === 'object' && c !== null)
                        ? { header: c.header || c.label || c.key || '', key: c.key || null }
                        : { header: String(c), key: null });
                } else if (typeof rows[0] === 'object' && !Array.isArray(rows[0]) && rows[0] !== null) {
                    normalizedCols = Object.keys(rows[0]).map(k => ({ header: k.toUpperCase(), key: k }));
                } else if (Array.isArray(rows[0])) {
                    normalizedCols = rows[0].map((_, idx) => ({ header: `COL ${idx + 1}`, key: null }));
                } else {
                    normalizedCols = [{ header: 'DETALLE', key: null }];
                }

                const colCount = Math.max(normalizedCols.length, 1);
                const colWidth = Math.floor(532 / colCount);

                // Encabezado de tabla
                doc.rect(40, cursorY, 532, 22).fill('#1e293b');
                normalizedCols.forEach((col, cIdx) => {
                    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
                        .text(String(col.header), 45 + cIdx * colWidth, cursorY + 6, { width: colWidth - 10 });
                });
                cursorY += 22;

                // Filas de tabla
                rows.forEach((row, rIdx) => {
                    if (cursorY > 685) {
                        doc.addPage({ size: 'LETTER', margin: 40 });
                        cursorY = 45;
                    }
                    const rowBg = rIdx % 2 === 0 ? '#ffffff' : '#f1f5f9';
                    doc.rect(40, cursorY, 532, 20).fill(rowBg);

                    normalizedCols.forEach((col, cIdx) => {
                        let cellVal = '';
                        if (Array.isArray(row)) {
                            cellVal = row[cIdx] ?? '';
                        } else if (typeof row === 'object' && row !== null) {
                            cellVal = col.key ? (row[col.key] ?? '') : (Object.values(row)[cIdx] ?? '');
                        } else {
                            cellVal = String(row ?? '');
                        }
                        doc.fillColor('#1e293b').font('Helvetica').fontSize(8)
                            .text(String(cellVal), 45 + cIdx * colWidth, cursorY + 5, { width: colWidth - 10 });
                    });

                    cursorY += 20;
                });
            }

            // 5. Pie de Página Tamaño Carta
            const footerY = 725;
            doc.moveTo(40, footerY).lineTo(572, footerY).strokeColor('#cbd5e1').stroke();
            doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(8)
                .text('SIPE Admin • Reporte Ejecutivo Generado Automáticamente • Formato Tamaño Carta (Letter)', 40, footerY + 7, {
                    width: 532,
                    align: 'center'
                });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

/**
 * Construir y enviar por Telegram el reporte PDF Tamaño Carta según el tema solicitado
 */
const buildAndSendTopicPdf = async (chatId, topicKey = 'ventas', options = {}) => {
    const cleanTopic = String(topicKey || 'ventas').toLowerCase().trim();
    const targetDate = options.targetDate || getDateStr(-1);

    sendChatAction(chatId, 'upload_document').catch(() => {});

    if (cleanTopic.includes('dossier') || cleanTopic.includes('semanal')) {
        const dossierPayload = await buildWeeklyExecutiveDossierPayload();
        const pdfBuffer = await generateExecutiveReportPdf(dossierPayload);
        const filename = dossierPayload.fileName || `Dossier_Ejecutivo_SIPE_${getDateStr(0)}.pdf`;
        const caption =
            `📄 <b>Dossier Ejecutivo Semanal • Grupo SIPE (Tamaño Carta)</b>\n` +
            `📈 EBITDA Operativo (7d): <b>${moneyFmt(dossierPayload.meta?.utilidad_operativa_total || 0)}</b>\n` +
            `🏦 Liquidez Consolidada: <b>${moneyFmt(dossierPayload.meta?.liquidez_bancos_usd || 0)}</b>`;
        return await sendTelegramDocument(chatId, pdfBuffer, filename, caption);
    }

    if (cleanTopic.includes('banco')) {
        const data = await getSaldosBancosData();
        const cuentas = data?.cuentas || [];
        const pdfBuffer = await generateExecutiveReportPdf({
            title: 'REPORTE CONSOLIDADO DE SALDOS BANCARIOS',
            subtitle: 'Disponibilidad en Cuentas Bancarias Corporativas • SIPE Admin',
            dateStr: toDisplayDate(data?.fecha || getDateStr(0)),
            kpis: [
                { label: 'Saldo Total Bancos', value: moneyFmt(data?.total || 0) },
                { label: 'Cuentas Activas', value: String(cuentas.length) },
                { label: 'Fuente', value: data?.fuente === 'sp_saldo_en_bancos' ? 'Conciliación' : 'Catálogo Local' }
            ],
            columns: ['Banco', 'Cuenta Bancaria', 'Saldo Disponible'],
            rows: cuentas.map(c => [c.banco || 'Banco', c.cuenta || 'Cuenta', moneyFmt(c.saldo || 0)]),
            summaryText: `Reporte oficial en tamaño Carta con el desglose de saldos disponibles en cuentas bancarias al ${toDisplayDate(data?.fecha || getDateStr(0))}.`
        });
        const filename = `Reporte_Saldos_Bancos_${data?.fecha || getDateStr(0)}.pdf`;
        const caption = `📄 <b>Reporte Ejecutivo de Saldos en Bancos (Tamaño Carta)</b>\n💰 Total Consolidado: <b>${moneyFmt(data?.total || 0)}</b>`;
        return await sendTelegramDocument(chatId, pdfBuffer, filename, caption);
    }

    if (cleanTopic.includes('chequera') || cleanTopic.includes('cheque')) {
        const data = await getSaldosChequeraData();
        const cuentas = data?.cuentas || [];
        const pdfBuffer = await generateExecutiveReportPdf({
            title: 'REPORTE DE SALDOS EN CHEQUERA',
            subtitle: 'Control de Tesorería y Disponibilidad en Libros • SIPE Admin',
            dateStr: toDisplayDate(data?.fecha || getDateStr(0)),
            kpis: [
                { label: 'Total en Chequeras', value: moneyFmt(data?.total || 0) },
                { label: 'Cuentas de Cheques', value: String(cuentas.length) }
            ],
            columns: ['Banco', 'Cuenta', 'Saldo en Chequera'],
            rows: cuentas.map(c => [c.banco || 'Banco', c.cuenta || 'Cuenta', moneyFmt(c.saldo || 0)]),
            summaryText: `Estado ejecutivo de saldos disponibles en chequeras corporativas al ${toDisplayDate(data?.fecha || getDateStr(0))}.`
        });
        const filename = `Reporte_Saldos_Chequera_${data?.fecha || getDateStr(0)}.pdf`;
        const caption = `📄 <b>Reporte Ejecutivo de Saldos en Chequera (Tamaño Carta)</b>\n💰 Total Chequeras: <b>${moneyFmt(data?.total || 0)}</b>`;
        return await sendTelegramDocument(chatId, pdfBuffer, filename, caption);
    }

    if (cleanTopic.includes('solar') || cleanTopic.includes('panel')) {
        const solarData = await solarEnergyService.getSolarAhorroDiario(targetDate);
        const estaciones = solarData?.desglose_por_estacion || solarData?.estaciones || [];
        const ahorro = solarData?.total_ahorro_usd ?? solarData?.ahorro_total_usd ?? 0;
        const gen = solarData?.total_generacion_kwh ?? solarData?.generacion_total_kwh ?? 0;
        const co2 = solarData?.total_co2_evitado_kg ?? solarData?.co2_evitado_total_kg ?? 0;

        const pdfBuffer = await generateExecutiveReportPdf({
            title: 'REPORTE DE ENERGÍA SOLAR Y BATERÍAS BESS',
            subtitle: 'Generación Fotovoltaica, Almacenamiento y Ahorro Económico',
            dateStr: toDisplayDate(targetDate),
            kpis: [
                { label: 'Ahorro del Día', value: moneyFmt(ahorro) },
                { label: 'Generación Solar', value: `${numFmt(gen)} kWh` },
                { label: 'CO2 Evitado', value: `${numFmt(co2)} kg` },
                { label: 'Capacidad Red', value: '95.0 kWp / 60 kWh' }
            ],
            columns: ['Ubicación', 'Capacidad (kWp)', 'Generación (kWh)', 'Ahorro USD'],
            rows: estaciones.map(e => [
                e.estacion_nombre || 'Estación',
                `${e.potencia_kwp || 0} kWp`,
                `${numFmt(e.total_generacion_kwh ?? e.generacion_kwh ?? 0)} kWh`,
                moneyFmt(e.total_ahorro_usd ?? e.ahorro_usd ?? 0)
            ]),
            summaryText: `Desempeño solar fotovoltaico y sistema de almacenamiento BESS correspondiente a la fecha ${toDisplayDate(targetDate)}.`
        });
        const filename = `Reporte_Energia_Solar_${targetDate}.pdf`;
        const caption = `📄 <b>Reporte Ejecutivo de Energía Solar (Tamaño Carta)</b>\n☀️ Ahorro: <b>${moneyFmt(ahorro)}</b> | Generación: <code>${numFmt(gen)} kWh</code>`;
        return await sendTelegramDocument(chatId, pdfBuffer, filename, caption);
    }

    if (cleanTopic.includes('andelsa') || cleanTopic.includes('saas')) {
        const fin = await sysSaasService.getAndelsaFinanzasResumen();
        const inv = await sysSaasService.getAndelsaInventarios();
        const items = inv?.items || [];
        const pdfBuffer = await generateExecutiveReportPdf({
            title: 'REPORTE EJECUTIVO ANDELSA (NOVA SAAS)',
            subtitle: 'Resumen Financiero, Inventarios y Cartera • sys.sipesv.com',
            dateStr: toDisplayDate(getDateStr(0)),
            kpis: [
                { label: 'Facturación Total', value: moneyFmt(fin?.facturacion_total_usd || 0) },
                { label: 'Valor Inventario', value: moneyFmt(fin?.valor_inventario_actual_usd || inv?.valor_inventario_total_usd || 0) },
                { label: 'Cartera CXC', value: moneyFmt(fin?.cartera_por_cobrar_usd || 0) },
                { label: 'Clientes Activos', value: String(fin?.total_clientes_activos || 0) }
            ],
            columns: ['Producto / Ítem', 'Stock Actual', 'Costo Promedio', 'Valor Total'],
            rows: items.slice(0, 15).map(i => [
                i.descripcion || 'Producto',
                numFmt(i.stock_actual || 0),
                moneyFmt(i.costo_promedio || 0),
                moneyFmt(i.valor_total || 0)
            ]),
            summaryText: 'Consolidado financiero y de inventarios en tiempo real de ANDELSA, S.A. DE C.V. (Nova SaaS).'
        });
        const filename = `Reporte_Ejecutivo_Andelsa_${getDateStr(0)}.pdf`;
        const caption = `📄 <b>Reporte Ejecutivo Andelsa • Nova SaaS (Tamaño Carta)</b>\n💵 Facturación: <b>${moneyFmt(fin?.facturacion_total_usd || 0)}</b>`;
        return await sendTelegramDocument(chatId, pdfBuffer, filename, caption);
    }

    if (cleanTopic.includes('competencia') || cleanTopic.includes('precio') || cleanTopic.includes('dgehm')) {
        const compData = await getPreciosCompetenciaData();
        const rows = compData?.rows || [];
        const cheaperCount = (compData?.competidoresMasBaratos || []).length;
        const today = getDateStr(0);

        const pdfBuffer = await generateExecutiveReportPdf({
            title: 'REPORTE DE PRECIOS DE LA COMPETENCIA (DGEHM)',
            subtitle: 'Monitoreo Comparativo de Precios por Zona • Modalidad Autoservicio y Servicio Completo',
            dateStr: toDisplayDate(today),
            kpis: [
                { label: 'Estaciones Monitoreadas', value: String(compData?.totalMonitoreadas || 0) },
                { label: 'Más Baratos vs SIPE', value: String(cheaperCount) },
                { label: 'Prom. Súper / Regular', value: `${priceFmt(compData?.promedios?.super_a)} / ${priceFmt(compData?.promedios?.regular_a)}` },
                { label: 'Promedio Diésel', value: priceFmt(compData?.promedios?.diesel_a) }
            ],
            columns: ['Zona SIPE', 'Estación / Competidor', 'Tipo', 'Súper AS', 'Regular AS', 'Diésel AS'],
            rows: rows.map(r => [
                r.zona || 'Zona',
                r.estacion || 'Estación',
                r.es_propia === 1 ? 'PROPIA (SIPE)' : 'COMPETIDOR',
                priceFmt(pickEffectivePrice(r, 'super', 'AS')),
                priceFmt(pickEffectivePrice(r, 'regular', 'AS')),
                priceFmt(pickEffectivePrice(r, 'diesel', 'AS'))
            ]),
            summaryText: `Comparativo oficial en tamaño Carta (Letter) de precios de combustibles frente a la competencia monitoreada en DGEHM al ${toDisplayDate(today)}. Competidores con algún precio inferior al nuestro: ${cheaperCount}.`
        });
        const filename = `Reporte_Precios_Competencia_${today}.pdf`;
        const caption = `📄 <b>Reporte Ejecutivo de Precios de Competencia (Tamaño Carta)</b>\n📊 Monitoreadas: <b>${compData?.totalMonitoreadas || 0}</b> | ⚠️ Más bajos: <b>${cheaperCount}</b>`;
        return await sendTelegramDocument(chatId, pdfBuffer, filename, caption);
    }

    // Por defecto: Reporte Consolidado de Ventas de Estaciones y Tiendas
    const data = await getConsolidadoVentas(targetDate);
    const estaciones = data?.estaciones || [];
    const tiendas = data?.tiendas || [];
    const totalGalones = estaciones.reduce((acc, e) => acc + Number(e.galonaje || e.galones || 0), 0);
    const totalCombustible = estaciones.reduce((acc, e) => acc + Number(e.venta || e.total_venta || 0), 0);
    const totalTiendas = tiendas.reduce((acc, t) => acc + Number(t.venta || 0), 0);
    const totalGlobal = totalCombustible + totalTiendas;

    const pdfBuffer = await generateExecutiveReportPdf({
        title: 'REPORTE CONSOLIDADO DE VENTAS',
        subtitle: 'Estaciones de Servicio y Tiendas de Conveniencia • SIPE Admin',
        dateStr: toDisplayDate(targetDate),
        kpis: [
            { label: 'Galonaje Total', value: `${numFmt(totalGalones)} gal` },
            { label: 'Venta Combustible', value: moneyFmt(totalCombustible) },
            { label: 'Venta Tiendas', value: moneyFmt(totalTiendas) },
            { label: 'Venta Total Global', value: moneyFmt(totalGlobal) }
        ],
        columns: ['Estación', 'Diesel (gal)', 'Regular (gal)', 'Súper (gal)', 'Total Gal', 'Venta ($)'],
        rows: estaciones.map(e => [
            e.empresa || e.titulo || 'Estación',
            numFmt(e.diesel || 0),
            numFmt(e.regular || 0),
            numFmt(e.super || 0),
            numFmt(e.galonaje || e.galones || 0),
            moneyFmt(e.venta || e.total_venta || 0)
        ]),
        summaryText: `Consolidado operativo de ventas de combustibles y tiendas de conveniencia para la fecha ${toDisplayDate(targetDate)}.`
    });
    const filename = `Reporte_Ventas_${targetDate}.pdf`;
    const caption = `📄 <b>Reporte Ejecutivo de Ventas (Tamaño Carta)</b>\n📅 Fecha: <b>${toDisplayDate(targetDate)}</b> | 💰 Total: <b>${moneyFmt(totalGlobal)}</b>`;
    return await sendTelegramDocument(chatId, pdfBuffer, filename, caption);
};

module.exports = {
    generateExecutiveReportPdf,
    buildAndSendTopicPdf
};
