const { getDb, getExternalDb, getAccountingDb } = require('../db');
const {
    normalizeText,
    escapeHtml,
    moneyFmt,
    numFmt,
    toDisplayDate,
    getDateStr,
    parseSpanishDateText,
    parseNaturalLanguageQuery,
    SPANISH_MONTH_NAMES
} = require('./telegramTextAndDates');
const {
    getConsolidadoVentas,
    getSaldosBancosData,
    getSaldosChequeraData,
    filterBankOrChequeraAccounts,
    getVentasTiendaPorLineaData,
    getRankingDiasVentasData,
    getPagosProgramadosData,
    getPreciosCompetenciaData,
    getPedidosPumaData,
    formatPreciosCompetenciaMessage
} = require('./telegramDataService');
const {
    getResumenMensualData,
    getResumenRangoVentasData
} = require('./consultasVentasResumenService');
const {
    formatVentasMessage,
    formatBancosMessage,
    formatChequeraMessage,
    formatAlertasMessage,
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
    formatTanquesAutonomiaMessage,
    formatPedidosPumaMessage,
    formatRentabilidadEbitdaMessage,
    formatTransitoValesMessage
} = require('./telegramFormatters');
const { getTanquesAutonomia } = require('./fuelIntelligence');
const { getRentabilidadPorEstacion } = require('./profitabilityService');
const { getAuditoriaDineroEnTransito } = require('./operationalAuditService');
const solarEnergyService = require('./solarEnergyService');
const salesHourlyService = require('./salesHourlyService');
const { askConversationalAgent } = require('./conversationalAiService');

/**
 * Convierte respuesta HTML de Telegram a texto plano legible para previsualización o bitácora
 */
const stripTelegramHtml = (html = '') => {
    return String(html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

/**
 * Determina el identificador legible de la ruta NLU actual para una consulta
 */
const detectIntentInfo = (rawQuery = '') => {
    const clean = String(rawQuery || '').trim();
    if (!clean) {
        return { codigo: 'VACIO', etiqueta: 'Sin consulta' };
    }

    const parsed = parseNaturalLanguageQuery(clean);
    if (parsed) {
        if (parsed.isCompetencia) return { codigo: 'PRECIOS_COMPETENCIA', etiqueta: 'Precios de Competencia (DGEHM)' };
        if (parsed.isSolar) return { codigo: 'ENERGIA_SOLAR', etiqueta: 'Energía Solar y Baterías' };
        if (parsed.isHourlyPeak) return { codigo: 'HORAS_PICO', etiqueta: 'Horas Pico de Venta' };
        if (parsed.isTanques) return { codigo: 'TANQUES_AUTONOMIA', etiqueta: 'Inventario de Tanques y Autonomía' };
        if (parsed.isPedidosPuma) return { codigo: 'PEDIDOS_PUMA', etiqueta: 'Pedidos Combustible Portal Puma' };
        if (parsed.isRentabilidad) return { codigo: 'RENTABILIDAD_EBITDA', etiqueta: 'Rentabilidad Real y EBITDA' };
        if (parsed.isTransitoVales) return { codigo: 'TRANSITO_Y_VALES', etiqueta: 'Efectivo en Tránsito y Vales sin DTE' };
        if (parsed.isPagosProgramados) return { codigo: 'PAGOS_PROGRAMADOS', etiqueta: 'Control de Pagos y Vencimientos' };
        if (parsed.isChequera) {
            const filterSuffix = parsed.matchedAccountHolder?.label || parsed.matchedBank?.label || (parsed.matchedAccountNumber ? `#${parsed.matchedAccountNumber}` : '');
            return {
                codigo: filterSuffix ? 'SALDOS_CHEQUERA_FILTRADO' : 'SALDOS_CHEQUERA',
                etiqueta: filterSuffix ? `Saldos en Chequera (${filterSuffix})` : 'Saldos Disponibles en Chequera'
            };
        }
        if (parsed.matchedBank) return { codigo: 'BANCO_ESPECIFICO', etiqueta: `Saldo en ${parsed.matchedBank.label}` };
        if (parsed.isBancosGlobal) {
            const filterSuffix = parsed.matchedAccountHolder?.label || (parsed.matchedAccountNumber ? `#${parsed.matchedAccountNumber}` : '');
            return {
                codigo: filterSuffix ? 'SALDOS_BANCOS_FILTRADO' : 'SALDOS_BANCOS',
                etiqueta: filterSuffix ? `Saldos en Bancos (${filterSuffix})` : 'Saldos Consolidados en Bancos'
            };
        }
        if (parsed.isTiendaLinea) {
            const lineLabel = parsed.matchedStoreLine ? parsed.matchedStoreLine.label : 'Desglose por Líneas';
            const stLabel = parsed.matchedStation ? ` • ${parsed.matchedStation.name}` : '';
            return {
                codigo: 'TIENDA_VENTA_LINEA',
                etiqueta: `Tienda por Línea (${lineLabel}${stLabel})`
            };
        }
        if (parsed.isPeakDay) {
            return {
                codigo: 'DIA_PICO_VENTAS',
                etiqueta: `Día de ${parsed.peakDayOrder === 'ASC' ? 'Menor' : 'Mayor'} Venta y Día de la Semana`
            };
        }
        if (parsed.isMonthly) return { codigo: 'VENTAS_MENSUALES', etiqueta: 'Consolidado Mensual de Ventas' };
        if (parsed.isRange) return { codigo: 'VENTAS_RANGO', etiqueta: 'Ventas por Rango de Fechas' };
        if (parsed.isRanking) return { codigo: 'RANKING_ESTACIONES', etiqueta: 'Ranking de Estaciones' };
        if (parsed.matchedStation) return { codigo: 'VENTAS_ESTACION', etiqueta: `Detalle Estación (${parsed.matchedStation.name})` };
        if (parsed.matchedFuel) return { codigo: 'COMBUSTIBLE_GLOBAL', etiqueta: `Venta Global (${parsed.matchedFuel.label})` };
        if (parsed.isTiendas) return { codigo: 'TIENDAS_CONVENIENCIA', etiqueta: 'Tiendas de Conveniencia' };
        if (parsed.isAlertas || parsed.isDiscrepancy) return { codigo: 'AUDITORIA_DESCUADRES', etiqueta: 'Auditoría de Descuadres y Alertas' };
    }

    const norm = normalizeText(clean).replace(/^[^a-z0-9]+/i, '').trim();
    if (/\b(chequera|chequeras|cheques)\b/i.test(norm)) {
        return { codigo: 'SALDOS_CHEQUERA', etiqueta: 'Saldos Disponibles en Chequera' };
    }
    if (/\b(banco|bancos|saldos)\b/i.test(norm)) {
        return { codigo: 'SALDOS_BANCOS', etiqueta: 'Saldos Consolidados en Bancos' };
    }
    if (/\b(alertas?|descuadres?)\b/i.test(norm)) {
        return { codigo: 'AUDITORIA_DESCUADRES', etiqueta: 'Auditoría de Descuadres y Alertas' };
    }
    if (/^(?:ventas?(?:\s+(?:de\s+|en\s+)?(?:estaciones|combustible|global(?:es)?))?)(?:\s+(?:de\s+|del\s+)?(?:hoy|ayer|\d{4}-\d{2}-\d{2}))?$/i.test(norm)) {
        return { codigo: 'VENTAS_GLOBALES', etiqueta: 'Ventas Globales de Estaciones y Tiendas' };
    }

    return { codigo: 'AGENTE_IA_360', etiqueta: 'Agente Conversacional IA 360°' };
};

/**
 * Clasifica forensemente la causa raíz probable de una respuesta calificada como NO_UTIL
 */
const classifyNegativeFeedback = (fb = {}) => {
    const query = String(fb.consulta_original || '');
    const summary = String(fb.respuesta_resumen || '');
    const comment = String(fb.comentario_mejora || '');

    const qNorm = normalizeText(query);
    const sNorm = normalizeText(summary);
    const cNorm = normalizeText(comment);
    const allNorm = `${qNorm} ${cNorm}`.trim();

    // 1. Colisión léxica entre Autonomía de Tanques y Paneles Solares
    if (
        (/\bautonomia\b/.test(qNorm) && /\b(tanque|tanques|diesel|regular|super|combustible|galon|stock|pipa)\b/.test(allNorm)) ||
        (sNorm.includes('solar') && /\b(tanque|tanques|diesel|combustible|pipa)\b/.test(allNorm))
    ) {
        return {
            codigo_causa: 'COLISION_SOLAR_TANQUES',
            etiqueta_causa: 'Colisión Autonomía (Solar vs Tanques)',
            severidad: 'alta',
            diagnostico: 'La palabra «autonomía» activaba el módulo de baterías solares en lugar del inventario físico de tanques de combustible.',
            accion_correctiva: 'Desambiguación NLU aplicada: consultas de tanques/combustibles enrutan directo a getTanquesAutonomia().',
            corregido_en_motor: true
        };
    }

    // 2. Consultas de "Hoy" mostrando $0.00 sin advertir turnos abiertos
    if (
        (/\bhoy\b/.test(qNorm) && (summary.includes('$0.00') || /\b0\.00\b/.test(sNorm) || /\b(cero|0|abierto|turno|ayer)\b/.test(cNorm))) ||
        sNorm.includes('sin corte cerrado')
    ) {
        return {
            codigo_causa: 'TURNOS_HOY_EN_CERO',
            etiqueta_causa: 'Turnos de Hoy Abiertos ($0.00)',
            severidad: 'alta',
            diagnostico: 'Al consultar ventas de «hoy» antes del cierre de turno en pista, se mostraba $0.00 sin explicar que los turnos siguen abiertos ni dar referencia del último cierre.',
            accion_correctiva: 'Aviso explícito de turnos en curso + referencia automática del último cierre consolidado (ayer).',
            corregido_en_motor: true
        };
    }

    // 2.b Precios de Competencia (DGEHM) que antes caían al resumen de ventas totales
    if (
        /\b(competencia|competidores|dgehm)\b/.test(allNorm) &&
        (/\b(venta|ventas|galon|galones)\b/.test(sNorm) || /\b(venta|ventas|competencia)\b/.test(cNorm))
    ) {
        return {
            codigo_causa: 'PRECIOS_COMPETENCIA_DGEHM',
            etiqueta_causa: 'Precios de Competencia vs Ventas Totales',
            severidad: 'alta',
            diagnostico: 'La consulta solicitaba precios de la competencia (DGEHM), pero el bot respondió con el resumen general de ventas de combustible.',
            accion_correctiva: 'Intent determinista PRECIOS_COMPETENCIA habilitado con comparativa DGEHM por zona, marca y diferencial en centavos.',
            corregido_en_motor: true
        };
    }

    // 2.c Filtro de Saldos en Chequera o Bancos por Contribuyente / Titular / Cuenta Específica
    if (
        /\b(chequera|chequeras|banco|bancos|saldo|saldos|cuenta|cuentas)\b/.test(allNorm) &&
        /\b(contribuyente|inversiones\s+lil|lil|cmr|andelsa|raul\s+sosa|corina|cdh|especific[oa])\b/.test(allNorm)
    ) {
        return {
            codigo_causa: 'FILTRO_CUENTA_CONTRIBUYENTE',
            etiqueta_causa: 'Filtro por Contribuyente / Banco / Cuenta',
            severidad: 'alta',
            diagnostico: 'El usuario solicitó saldos de chequera o banco filtrados por contribuyente (ej. Inversiones LIL), banco o cuenta específica.',
            accion_correctiva: 'Motor filterBankOrChequeraAccounts() activo con soporte de contribuyentes (Inversiones LIL, CMR, Andelsa, RRS, Corina, CDH), bancos y # de cuenta.',
            corregido_en_motor: true
        };
    }

    // 2.d Ventas de Tienda de Conveniencia por Línea / Categoría de Producto (ej. Cigarros en Super 7 San Martín La Loma)
    if (
        /\b(cigarro|cigarros|cigarrillos|cerveza|cervezas|licor|licores|bebidas|cafe|comida|boquitas|dulces|linea|lineas|super\s*7|e-market|emarket)\b/.test(allNorm) &&
        (/\b(linea|cigarro|cigarros|tienda|super\s*7|e-market)\b/.test(allNorm))
    ) {
        return {
            codigo_causa: 'VENTA_LINEA_TIENDA',
            etiqueta_causa: 'Desglose por Línea de Tienda (Super 7 / E-Market)',
            severidad: 'alta',
            diagnostico: 'El usuario consultó la venta de una línea específica de tienda (ej. Cigarros en Super 7 La Loma), pero recibió el resumen de galones de pista.',
            accion_correctiva: 'Motor getVentasTiendaPorLineaData() activo conectando sales_items/product_categories (SaaS) y cort_ventas (legado) por línea y top productos.',
            corregido_en_motor: true
        };
    }

    // 2.e Día de Mayor / Menor Venta del Mes o Día de la Semana
    if (
        /\b(que\s+dia|cual\s+dia|dia\s+de\s+mayor|dia\s+de\s+menor|dia\s+de\s+la\s+semana|mejor\s+dia|mayor\s+venta)\b/.test(allNorm) &&
        /\b(dia|semana)\b/.test(qNorm)
    ) {
        return {
            codigo_causa: 'DIA_PICO_VENTAS',
            etiqueta_causa: 'Ranking Diario / Día de Mayor Venta del Mes',
            severidad: 'alta',
            diagnostico: 'El usuario preguntó qué día específico fue el de mayor venta en el mes, pero recibió el acumulado mensual por gasolinera.',
            accion_correctiva: 'Motor getRankingDiasVentasData() activo con cálculo del Día Récord #1, Top 5 días del período y promedio por día de la semana (Lunes a Domingo).',
            corregido_en_motor: true
        };
    }

    // 3. Comando no reconocido con botones de feedback o falta de intent
    if (sNorm.includes('comando no reconocido') || sNorm.includes('no pude identificar con certeza')) {
        return {
            codigo_causa: 'COMANDO_NO_RECONOCIDO',
            etiqueta_causa: 'Consulta No Reconocida / Sin Intent',
            severidad: 'alta',
            diagnostico: 'La consulta no coincidió con los patrones rígidos previos y cayó al mensaje genérico de ayuda con botones de calificación.',
            accion_correctiva: 'Nuevos intents deterministas + Agente Conversacional 360° desbloqueado y retiro de botones 👍/👎 en guías de ayuda.',
            corregido_en_motor: true
        };
    }

    // 4. Sombra de askGeminiAssistant (solo tenía ventas de ayer, ciego a bancos/tanques/pedidos/EBITDA)
    if (
        sNorm.startsWith('asistente ia gemini') ||
        sNorm.includes('no cuento con esa informacion') ||
        sNorm.includes('no tengo acceso') ||
        (sNorm.startsWith('conversacion asistente ia') && !summary.includes('│') && summary.length < 40)
    ) {
        return {
            codigo_causa: 'CONTEXTO_IA_INCOMPLETO',
            etiqueta_causa: 'Contexto IA Limitado / Sombra Legacy',
            severidad: 'alta',
            diagnostico: 'El bloque legacy askGeminiAssistant interceptaba preguntas abiertas con solo ventas de ayer (sin bancos, tanques, pedidos Puma ni EBITDA) y sin guardar el texto real respondido.',
            accion_correctiva: 'Unificación en askConversationalAgent 360° con tanques corregidos, pedidos Puma, solar 95 kWp real y registro íntegro de respuesta.',
            corregido_en_motor: true
        };
    }

    // 5. Módulos operativos que antes no tenían ruta determinista (Tanques, Pedidos Puma, EBITDA, Tránsito/Vales, Chequera vs Bancos)
    if (/\b(tanque|tanques|ullage|pedido|pedidos|pipa|cisterna|retenido|ebitda|rentabilidad|margen|transito|remesa|vale|vales|dte|chequera)\b/.test(allNorm)) {
        return {
            codigo_causa: 'MODULO_EJECUTIVO_NUEVO',
            etiqueta_causa: 'Módulo Operativo Sin Ruta Directa Previa',
            severidad: 'media',
            diagnostico: 'El usuario solicitó indicadores de Tanques, Pedidos Puma, EBITDA, Efectivo en Tránsito/Vales o Chequeras que carecían de formateador determinista dedicado.',
            accion_correctiva: 'Formateadores ejecutivos deterministas habilitados para Tanques, Pedidos Puma, EBITDA, Tránsito >48h / Vales >72h y Chequeras.',
            corregido_en_motor: true
        };
    }

    // 6. Precisión de período, fecha o estación indicada en comentario del usuario
    if (comment && /\b(mes|mensual|semana|rango|ayer|hoy|octubre|noviembre|septiembre|solo|estacion|detallad|desglos)\b/.test(cNorm)) {
        return {
            codigo_causa: 'PRECISION_PERIODO_ALCANCE',
            etiqueta_causa: 'Ajuste de Período o Alcance Solicitado',
            severidad: 'media',
            diagnostico: `El usuario requería otro corte o nivel de detalle («${comment.slice(0, 90)}»).`,
            accion_correctiva: 'Autocorrección en vivo habilitada al responder al botón 👎 combinando consulta original + aclaración.',
            corregido_en_motor: true
        };
    }

    return {
        codigo_causa: 'REVISION_CALIDAD_RESPUESTA',
        etiqueta_causa: comment ? 'Observación Específica del Usuario' : 'Calificación 👎 Sin Comentario Detallado',
        severidad: 'baja',
        diagnostico: comment
            ? `El usuario dejó la observación: «${comment.slice(0, 120)}».`
            : 'El usuario marcó 👎 No sin escribir comentario adicional; puede regenerarse con el motor mejorado para comparar calidad.',
        accion_correctiva: 'Regeneración bajo demanda disponible con el nuevo motor NLU + Agente 360°.',
        corregido_en_motor: true
    };
};

/**
 * Analiza un lote de respuestas negativas (NO_UTIL) desde BD o arreglo suministrado
 */
const analyzeNegativeFeedbackBatch = async (feedbackRows = null) => {
    let rows = feedbackRows;
    if (!Array.isArray(rows)) {
        try {
            const db = getDb();
            if (db) {
                const [dbRows] = await db.query(
                    `SELECT id, telegram_user_id, telegram_username, first_name, chat_id, mensaje_id,
                            consulta_original, respuesta_resumen, calificacion, comentario_mejora,
                            estado, notas_resolucion, created_at, updated_at
                     FROM telegram_feedback
                     WHERE calificacion = 'NO_UTIL'
                     ORDER BY created_at DESC
                     LIMIT 100`
                );
                rows = dbRows;
            } else {
                rows = [];
            }
        } catch (err) {
            console.error('[FeedbackEvaluator] Error consultando respuestas negativas:', err.message);
            rows = [];
        }
    }

    const categoryMap = new Map();
    let conComentario = 0;
    let abiertas = 0;
    let revisadas = 0;
    let autocorregidas = 0;

    const items = rows.map(row => {
        if (row.comentario_mejora && String(row.comentario_mejora).trim()) conComentario++;
        if (row.estado === 'REVISADO') revisadas++;
        else abiertas++;
        if (row.notas_resolucion && String(row.notas_resolucion).toLowerCase().includes('autocorregido')) {
            autocorregidas++;
        }

        const diagnostico_causa = classifyNegativeFeedback(row);
        const origIntent = detectIntentInfo(String(row.consulta_original || ''));
        const combinedQuery = row.comentario_mejora
            ? `${row.consulta_original || ''} ${row.comentario_mejora}`.trim()
            : String(row.consulta_original || '');
        const intent_actual = (origIntent && origIntent.codigo !== 'AGENTE_IA_360' && origIntent.codigo !== 'VACIO')
            ? origIntent
            : detectIntentInfo(combinedQuery);

        const prevCat = categoryMap.get(diagnostico_causa.codigo_causa) || {
            codigo: diagnostico_causa.codigo_causa,
            etiqueta: diagnostico_causa.etiqueta_causa,
            severidad: diagnostico_causa.severidad,
            accion_correctiva: diagnostico_causa.accion_correctiva,
            cantidad: 0
        };
        prevCat.cantidad += 1;
        categoryMap.set(diagnostico_causa.codigo_causa, prevCat);

        return {
            ...row,
            diagnostico_causa,
            intent_actual
        };
    });

    const por_categoria = Array.from(categoryMap.values()).sort((a, b) => b.cantidad - a.cantidad);

    return {
        total_negativas: items.length,
        con_comentario: conComentario,
        abiertas,
        revisadas,
        autocorregidas,
        por_categoria,
        items
    };
};

/**
 * Construye un resumen ejecutivo determinista multi-módulo si Gemini API no está disponible
 */
const buildDeterministicExecutiveFallback = async (queryText) => {
    const yest = getDateStr(-1);
    const [ventas, bancos, tanques, pedidos] = await Promise.all([
        getConsolidadoVentas(yest).catch(() => ({ estaciones: [], tiendas: [] })),
        getSaldosBancosData().catch(() => ({ total: 0, cuentas: [] })),
        getTanquesAutonomia().catch(() => ({ tanques: [] })),
        getPedidosPumaData().catch(() => ({ resumen: {} }))
    ]);

    const est = ventas?.estaciones || [];
    const tda = ventas?.tiendas || [];
    const totalGal = est.reduce((s, e) => s + Number(e.galonaje || 0), 0);
    const totalComb = est.reduce((s, e) => s + Number(e.venta || 0), 0);
    const totalTienda = tda.reduce((s, t) => s + Number(t.venta || 0), 0);
    const tanquesArr = Array.isArray(tanques?.tanques) ? tanques.tanques : [];
    const criticos = tanquesArr.filter(t => Number(t.horas_autonomia || 999) < 24);

    let msg = `📊 <b>RESUMEN EJECUTIVO INTEGRAL SIPE 360°</b>\n`;
    msg += `💬 <b>Consulta evaluada:</b> <i>«${escapeHtml(queryText)}»</i>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `⛽ <b>Último Cierre de Ventas (${toDisplayDate(yest)}):</b>\n`;
    msg += `• Galonaje Consolidado: <code>${numFmt(totalGal)} gal</code>\n`;
    msg += `• Venta Combustibles + Tiendas: <b>${moneyFmt(totalComb + totalTienda)}</b>\n\n`;
    msg += `🏦 <b>Posición Bancaria Consolidada:</b>\n`;
    msg += `• Liquidez Total en Cuentas: <b>${moneyFmt(bancos?.total || 0)}</b> (${(bancos?.cuentas || []).length} cuentas)\n\n`;
    msg += `🛢️ <b>Inventario de Tanques y Pedidos Puma:</b>\n`;
    msg += `• Tanques monitoreados: <code>${tanquesArr.length}</code> (Críticos &lt;24h: <b>${criticos.length}</b>)\n`;
    msg += `• Pedidos Puma activos: <code>${pedidos?.resumen?.total_activos ?? pedidos?.resumen?.activos ?? 0}</code> (En tránsito: <code>${pedidos?.resumen?.en_transito || 0}</code> | Retenidos: <b>${pedidos?.resumen?.retenidos || 0}</b>)\n\n`;
    msg += `<i>SIPE Admin • Motor de Respuesta Ejecutiva</i>`;
    return msg;
};

/**
 * Genera una respuesta mejorada para un registro de feedback negativo (o simulación ad-hoc)
 * combinando consulta_original + comentario_mejora sobre los nuevos motores deterministas e IA 360°.
 */
const generateImprovedResponseForFeedback = async (fb = {}, options = {}) => {
    const effectivePerms = options.effectivePerms || {
        isAdmin: true,
        ventas: true,
        saldos_banco: true,
        saldos_chequera: true,
        alertas: true,
        precios_competencia: true
    };
    const useAiFallback = options.useAiFallback !== false;

    const origQuery = String(fb.consulta_original || '').trim();
    const comment = String(fb.comentario_mejora || '').trim();
    const hasSubstantiveComment = comment.length >= 4 && !/^(nada|ninguno|ok|mal|error|no)$/i.test(normalizeText(comment));

    const diagnostico_causa = classifyNegativeFeedback(fb);

    // Priorizar consulta original si ya activa un intent determinista especializado; de lo contrario combinar con comentario limpio
    const cleanCommentForEval = comment
        .replace(/\b(?:pero\s+la\s+respuesta\s+fue|me\s+compartio\s+unicamente|no\s+resumen\s+de\s+venta|la\s+respuesta\s+esperada\s+era)[^,.]*/gi, ' ')
        .trim();

    const candidateQueries = [];
    if (origQuery) {
        candidateQueries.push(origQuery);
    }
    if (hasSubstantiveComment && origQuery) {
        candidateQueries.push(`${origQuery} ${cleanCommentForEval || comment}`.trim());
        candidateQueries.push(cleanCommentForEval || comment);
    } else if (comment) {
        candidateQueries.push(cleanCommentForEval || comment);
    }

    const primaryEvalQuery = candidateQueries[0] || origQuery || comment || 'Resumen ejecutivo';
    let parsed = null;
    let matchedCandidate = primaryEvalQuery;

    // Preferir el primer candidato que active una ruta determinista concreta
    for (const q of candidateQueries) {
        const p = parseNaturalLanguageQuery(q);
        const info = detectIntentInfo(q);
        if (p && info.codigo !== 'AGENTE_IA_360' && info.codigo !== 'VACIO') {
            parsed = p;
            matchedCandidate = q;
            break;
        }
        if (p && !parsed) {
            parsed = p;
            matchedCandidate = q;
        }
    }

    // Si la consulta original no tenía estación, línea o periodo mensual/rango pero el comentario sí la aclaró (ej. "solo Costa del Sol", "del mes de octubre 2026"), enriquecer parsed
    if (parsed && hasSubstantiveComment) {
        const commentParsed = parseNaturalLanguageQuery(cleanCommentForEval || comment);
        if (commentParsed) {
            if (!parsed.matchedStation && commentParsed.matchedStation) parsed.matchedStation = commentParsed.matchedStation;
            if (!parsed.matchedStoreLine && commentParsed.matchedStoreLine) {
                parsed.matchedStoreLine = commentParsed.matchedStoreLine;
                parsed.isTiendaLinea = true;
            }
            if (!parsed.matchedAccountHolder && commentParsed.matchedAccountHolder) {
                parsed.matchedAccountHolder = commentParsed.matchedAccountHolder;
            }
            if (!parsed.matchedBank && commentParsed.matchedBank) {
                parsed.matchedBank = commentParsed.matchedBank;
            }
            if (!parsed.isMonthly && commentParsed.isMonthly) {
                parsed.isMonthly = true;
                parsed.isMensual = true;
                parsed.targetMonth = commentParsed.targetMonth;
                parsed.targetYear = commentParsed.targetYear;
                parsed.targetPeriod = commentParsed.targetPeriod;
                parsed.startDate = commentParsed.startDate;
                parsed.endDate = commentParsed.endDate;
                parsed.targetDate = commentParsed.targetDate;
                matchedCandidate = `${origQuery} ${cleanCommentForEval || comment}`.trim();
            } else if (!parsed.isRange && commentParsed.isRange) {
                parsed.isRange = true;
                parsed.isRango = true;
                parsed.startDate = commentParsed.startDate;
                parsed.endDate = commentParsed.endDate;
                parsed.dateRange = commentParsed.dateRange;
                matchedCandidate = `${origQuery} ${cleanCommentForEval || comment}`.trim();
            }
        }
    }

    let htmlOut = null;
    let metodoGeneracion = 'NLU_DETERMINISTA';
    let intentDetectado = detectIntentInfo(matchedCandidate);
    const safeConsolidado = (d) => getConsolidadoVentas(d).catch(() => ({
        estaciones: [],
        tiendas: [],
        resumen_cierre: [],
        cortes_tienda: [],
        auditoria: { total_alertas: 0 }
    }));

    if (parsed) {
        if (parsed.isCompetencia) {
            const compData = await getPreciosCompetenciaData().catch(() => ({ zonas: [], competidoresMasBaratos: [], totalMonitoreadas: 0 }));
            const targetStation = (parsed.matchedStation && parsed.matchedStation.id !== 'ANDELSA') ? parsed.matchedStation : null;
            htmlOut = formatPreciosCompetenciaMessage(compData, { station: targetStation, fuel: parsed.matchedFuel || null });
        } else if (parsed.isSolar) {
            const targetStationId = parsed.matchedStation ? (parsed.matchedStation.branch_id || parsed.matchedStation.id || parsed.matchedStation.name) : null;
            if (parsed.isMonthly) {
                const now = new Date();
                const targetYear = parsed.targetYear || parsed.year || now.getFullYear();
                const targetMonth = parsed.targetMonth || parsed.month || (now.getMonth() + 1);
                const solarData = await solarEnergyService.getSolarAhorroMensual(targetYear, targetMonth, targetStationId);
                const monthName = SPANISH_MONTH_NAMES[targetMonth] || 'Mes';
                htmlOut = formatSolarEnergyMessage(solarData, 'mensual', `${monthName} ${targetYear}`);
            } else {
                const solarData = await solarEnergyService.getSolarEstadoActual(targetStationId);
                htmlOut = formatSolarEnergyMessage(solarData, 'estado_actual', parsed.matchedStation ? parsed.matchedStation.name : null);
            }
        } else if (parsed.isHourlyPeak) {
            const branchId = parsed.matchedStation ? (parsed.matchedStation.saas_branch_id || parsed.matchedStation.branch_id || null) : null;
            const targetDate = parsed.targetDate || getDateStr(-1);
            const peakData = await salesHourlyService.getHorasPicoVentas(targetDate, branchId);
            htmlOut = formatHorasPicoMessage(peakData, toDisplayDate(targetDate), false);
        } else if (parsed.isTanques) {
            const tanquesData = await getTanquesAutonomia().catch(() => ({ tanques: [] }));
            htmlOut = formatTanquesAutonomiaMessage(tanquesData, {
                station: parsed.matchedStation,
                fuel: parsed.matchedFuel
            });
        } else if (parsed.isPedidosPuma) {
            const pedidosData = await getPedidosPumaData().catch(() => ({ resumen: {}, pedidos: [] }));
            const onlyRetained = /\b(retenid[oa]s?|bloquead[oa]s?)\b/i.test(parsed.normalized);
            htmlOut = formatPedidosPumaMessage(pedidosData, {
                station: parsed.matchedStation,
                onlyRetained
            });
        } else if (parsed.isRentabilidad) {
            const rentData = await getRentabilidadPorEstacion().catch(() => ({ estaciones: [], resumen_consolidado: {} }));
            htmlOut = formatRentabilidadEbitdaMessage(rentData, {
                station: parsed.matchedStation
            });
        } else if (parsed.isTransitoVales) {
            const transitoData = await getAuditoriaDineroEnTransito().catch(() => ({ resumen: {}, remesas_en_transito: [], vales_pendientes_72h: [] }));
            htmlOut = formatTransitoValesMessage(transitoData);
        } else if (parsed.isPagosProgramados) {
            const pagosData = await getPagosProgramadosData().catch(() => ({ pagos: [], total_pendiente_usd: 0 }));
            htmlOut = formatPagosProgramadosMessage(pagosData);
        } else if (parsed.isChequera) {
            const cheqData = await getSaldosChequeraData().catch(() => ({ total: 0, cuentas: [] }));
            const filteredCheq = filterBankOrChequeraAccounts(cheqData, {
                matchedBank: parsed.matchedBank,
                matchedAccountHolder: parsed.matchedAccountHolder,
                matchedStation: parsed.matchedStation,
                matchedAccountNumber: parsed.matchedAccountNumber
            });
            htmlOut = formatChequeraMessage(filteredCheq);
        } else if (parsed.matchedBank) {
            const bankData = await getSaldosBancosData().catch(() => ({ total: 0, cuentas: [] }));
            const hasSubFilter = Boolean(parsed.matchedAccountHolder || parsed.matchedStation || parsed.matchedAccountNumber);
            htmlOut = hasSubFilter
                ? formatBancosMessage(filterBankOrChequeraAccounts(bankData, {
                    matchedBank: parsed.matchedBank,
                    matchedAccountHolder: parsed.matchedAccountHolder,
                    matchedStation: parsed.matchedStation,
                    matchedAccountNumber: parsed.matchedAccountNumber
                }))
                : formatSpecificBankMessage(bankData, parsed.matchedBank);
        } else if (parsed.isBancosGlobal) {
            const bankData = await getSaldosBancosData().catch(() => ({ total: 0, cuentas: [] }));
            const filteredBank = filterBankOrChequeraAccounts(bankData, {
                matchedBank: parsed.matchedBank,
                matchedAccountHolder: parsed.matchedAccountHolder,
                matchedStation: parsed.matchedStation,
                matchedAccountNumber: parsed.matchedAccountNumber
            });
            htmlOut = formatBancosMessage(filteredBank);
        } else if (parsed.isTiendaLinea) {
            const lineaData = await getVentasTiendaPorLineaData({
                startDate: parsed.startDate || parsed.targetDate,
                endDate: parsed.endDate || parsed.targetDate,
                targetDate: parsed.targetDate,
                station: parsed.matchedStation,
                storeLine: parsed.matchedStoreLine
            }).catch(() => ({ lineas: [], productos_top: [], total_linea_usd: 0, total_tienda_usd: 0 }));
            htmlOut = formatVentasTiendaLineaMessage(lineaData);
        } else if (parsed.isPeakDay) {
            const peakDayData = await getRankingDiasVentasData({
                startDate: parsed.isRange ? parsed.startDate : null,
                endDate: parsed.isRange ? parsed.endDate : null,
                year: parsed.isMonthly ? parsed.targetYear : null,
                month: parsed.isMonthly ? parsed.targetMonth : null,
                station: parsed.matchedStation,
                order: parsed.peakDayOrder || 'DESC'
            }).catch(() => ({ top_dias: [], ranking_dias_semana: [], dia_principal: null }));
            htmlOut = formatPeakDayVentasMessage(peakDayData);
        } else if (parsed.isMonthly) {
            const y = parsed.targetYear || parsed.year || new Date().getFullYear();
            const m = parsed.targetMonth || parsed.month || (new Date().getMonth() + 1);
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const mData = await getResumenMensualData(externalDb, y, m, accountingDb).catch(() => ({ estaciones: [], tiendas: [], totales: {} }));
            htmlOut = formatVentasMensualMessage(mData, y, m);
        } else if (parsed.isRange) {
            const externalDb = await getExternalDb().catch(() => null);
            const accountingDb = await getAccountingDb().catch(() => null);
            const rangeLabel = `Del ${toDisplayDate(parsed.startDate)} al ${toDisplayDate(parsed.endDate)}`;
            const rData = await getResumenRangoVentasData(externalDb, parsed.startDate, parsed.endDate, accountingDb).catch(() => ({ estaciones: [], tiendas: [], totales: {} }));
            htmlOut = formatVentasRangoMessage(rData, parsed.startDate, parsed.endDate, rangeLabel);
        } else if (parsed.isRanking) {
            const vData = await safeConsolidado(parsed.targetDate);
            const metric = parsed.normalized.includes('galon') ? 'galonaje' : 'venta';
            htmlOut = formatRankingMessage(vData, parsed.targetDate, metric, parsed.matchedFuel);
        } else if (parsed.matchedStation) {
            const vData = await safeConsolidado(parsed.targetDate);
            const todayStr = getDateStr(0);
            const matchedEst = (vData?.estaciones || []).find(e => {
                const empNorm = normalizeText(e.empresa || '');
                return e.id_empresa === parsed.matchedStation.id ||
                    parsed.matchedStation.keywords.some(kw => empNorm.includes(normalizeText(kw)));
            });
            const matchedTienda = (vData?.tiendas || []).find(t =>
                parsed.matchedStation.tiendaKey && normalizeText(t.empresa || '').includes(parsed.matchedStation.tiendaKey)
            );
            let latestClosedRef = null;
            if ((parsed.isExplicitToday || parsed.targetDate === todayStr) && (!matchedEst || Number(matchedEst.galonaje || 0) === 0)) {
                const yestStr = getDateStr(-1);
                const yestData = await safeConsolidado(yestStr);
                const yestEst = (yestData?.estaciones || []).find(e => {
                    const empNorm = normalizeText(e.empresa || '');
                    return e.id_empresa === parsed.matchedStation.id ||
                        parsed.matchedStation.keywords.some(kw => empNorm.includes(normalizeText(kw)));
                });
                if (yestEst && Number(yestEst.galonaje || 0) > 0) {
                    latestClosedRef = { date: yestStr, estacion: yestEst };
                }
            }
            htmlOut = formatSpecificStationMessage(
                matchedEst || { empresa: parsed.matchedStation.name, galonaje: 0, venta: 0 },
                parsed.matchedFuel,
                parsed.targetDate,
                matchedTienda,
                {
                    stationName: parsed.matchedStation.name,
                    isTodayOpenShift: (parsed.isExplicitToday || parsed.targetDate === todayStr) && (!matchedEst || Number(matchedEst.galonaje || 0) === 0),
                    latestClosedRef
                }
            );
        } else if (parsed.matchedFuel) {
            const vData = await safeConsolidado(parsed.targetDate);
            htmlOut = formatProductTotalMessage(vData, parsed.matchedFuel, parsed.targetDate);
        } else if (parsed.isTiendas) {
            const vData = await safeConsolidado(parsed.targetDate);
            htmlOut = formatTiendasMessage(vData, parsed.targetDate);
        } else if (parsed.isAlertas || parsed.isDiscrepancy) {
            const vData = await safeConsolidado(parsed.targetDate);
            htmlOut = formatAlertasMessage(vData, parsed.targetDate);
        }
    }

    // Comandos globales concisos (ventas de hoy / ventas de ayer / alertas / bancos / chequera)
    if (!htmlOut) {
        const normEval = normalizeText(primaryEvalQuery);
        if (/\b(alertas?|descuadres?)\b/i.test(normEval)) {
            const targetDate = parseSpanishDateText(primaryEvalQuery) || getDateStr(-1);
            const vData = await safeConsolidado(targetDate);
            intentDetectado = { codigo: 'AUDITORIA_DESCUADRES', etiqueta: 'Auditoría de Descuadres y Alertas' };
            htmlOut = formatAlertasMessage(vData, targetDate);
        } else if (/\b(ventas?|combustible)\b/i.test(normEval) && normEval.split(/\s+/).length <= 6) {
            const targetDate = parseSpanishDateText(primaryEvalQuery) || getDateStr(-1);
            const todayStr = getDateStr(0);
            const vData = await safeConsolidado(targetDate);
            const totalClosed = (vData?.estaciones || []).reduce((s, e) => s + Number(e.galonaje || 0) + Number(e.venta || 0), 0) +
                (vData?.tiendas || []).reduce((s, t) => s + Number(t.venta || 0), 0);
            let latestClosedRef = null;
            if (targetDate === todayStr && totalClosed === 0) {
                const yestStr = getDateStr(-1);
                const yestData = await safeConsolidado(yestStr);
                if (yestData) latestClosedRef = { date: yestStr, data: yestData };
            }
            intentDetectado = { codigo: 'VENTAS_GLOBALES', etiqueta: 'Ventas Globales de Estaciones y Tiendas' };
            htmlOut = formatVentasMessage(vData, targetDate, {
                isTodayOpenShift: targetDate === todayStr && totalClosed === 0,
                latestClosedRef
            });
        }
    }

    // Fallback al Agente Conversacional 360° con nota de regeneración forense
    if (!htmlOut && useAiFallback) {
        intentDetectado = { codigo: 'AGENTE_IA_360', etiqueta: 'Agente Conversacional IA 360°' };
        try {
            const extraSystemNote =
                `MODO REGENERACIÓN DE CALIDAD (EVALUADOR FORENSE SIPE ADMIN):\n` +
                `- Consulta original del usuario: "${origQuery || primaryEvalQuery}"\n` +
                `- Respuesta anterior calificada como NO ÚTIL: "${String(fb.respuesta_resumen || 'N/D').slice(0, 400)}"\n` +
                (hasSubstantiveComment ? `- Comentario de mejora del usuario: "${comment}"\n` : '') +
                `- Diagnóstico detectado: ${diagnostico_causa.diagnostico}\n` +
                `INSTRUCCIÓN: Genera una respuesta ejecutiva ejemplar, precisa, estructurada con viñetas y cifras reales del JSON 360°, corrigiendo por completo la deficiencia anterior.`;

            const aiReply = await askConversationalAgent({
                user: { first_name: fb.first_name || 'Director' },
                prompt: primaryEvalQuery,
                chatId: null, // No contaminar memoria conversacional en vivo
                effectivePerms,
                extraSystemNote
            });
            if (aiReply) {
                metodoGeneracion = 'AGENTE_IA_360';
                htmlOut = aiReply;
            }
        } catch (err) {
            console.warn('[FeedbackEvaluator] Agente IA 360° no disponible en regeneración:', err.message);
        }
    }

    // Respaldo determinista multi-módulo si no hay clave Gemini activa en el entorno
    if (!htmlOut) {
        metodoGeneracion = 'RESUMEN_EJECUTIVO_360_DETERMINISTA';
        htmlOut = await buildDeterministicExecutiveFallback(primaryEvalQuery);
    }

    return {
        ok: true,
        feedback_id: fb.id || null,
        metodo_generacion: metodoGeneracion,
        intent_detectado: intentDetectado,
        diagnostico_causa,
        consulta_original: origQuery,
        comentario_mejora: comment,
        consulta_evaluada: matchedCandidate,
        respuesta_anterior: fb.respuesta_resumen || 'Sin detalle previo almacenado',
        nueva_respuesta_html: htmlOut,
        nueva_respuesta_texto: stripTelegramHtml(htmlOut)
    };
};

module.exports = {
    stripTelegramHtml,
    detectIntentInfo,
    classifyNegativeFeedback,
    analyzeNegativeFeedbackBatch,
    generateImprovedResponseForFeedback
};
