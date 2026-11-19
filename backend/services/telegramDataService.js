const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);
const {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    KNOWN_STATIONS,
    findStationById,
    findFuelByKey
} = require('./telegramTextAndDates');

/**
 * Caché en memoria RAM de alta velocidad con TTL y auto-limpieza
 */
const queryMemoryCache = new Map();

const getCachedQuery = (key) => {
    if (!key) return null;
    const entry = queryMemoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        queryMemoryCache.delete(key);
        return null;
    }
    return entry.data;
};

const setCachedQuery = (key, data, ttlMs = 30000) => {
    if (!key) return;
    const now = Date.now();
    // 1. Limpieza de elementos expirados
    for (const [k, item] of queryMemoryCache.entries()) {
        if (now > item.expiresAt) {
            queryMemoryCache.delete(k);
        }
    }
    // 2. Auto-prune FIFO si alcanza o supera el límite de 300 elementos
    while (queryMemoryCache.size >= 300) {
        const oldestKey = queryMemoryCache.keys().next().value;
        if (!oldestKey) break;
        queryMemoryCache.delete(oldestKey);
    }
    queryMemoryCache.set(key, {
        data,
        expiresAt: now + (ttlMs || 30000),
        createdAt: now
    });
};

const clearQueryCache = () => {
    queryMemoryCache.clear();
};

/**
 * Consulta de Saldos en Bancos (sp_saldo_en_bancos con fallback)
 */
const getSaldosBancosData = async () => {
    const cacheKey = 'saldos:bancos';
    const cached = getCachedQuery(cacheKey);
    if (cached) return cached;

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
                const result = { total: totalBancos, cuentas: bancosDetalle, fecha: today, fuente: 'sp_saldo_en_bancos' };
                setCachedQuery(cacheKey, result, 30000);
                return result;
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

    const result = { total: totalBancos, cuentas: bancosDetalle, fecha: today, fuente: 'local' };
    setCachedQuery(cacheKey, result, 30000);
    return result;
};

/**
 * Consulta de Saldos en Chequera (sp_saldo_en_chequera con fallback)
 */
const getSaldosChequeraData = async () => {
    const cacheKey = 'saldos:chequeras';
    const cached = getCachedQuery(cacheKey);
    if (cached) return cached;

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
                const result = { total: totalChequera, cuentas: chequerasDetalle, fecha: today, fuente: 'sp_saldo_en_chequera' };
                setCachedQuery(cacheKey, result, 30000);
                return result;
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

    const result = { total: totalChequera, cuentas: chequerasDetalle, fecha: today, fuente: 'local' };
    setCachedQuery(cacheKey, result, 30000);
    return result;
};

/**
 * Consulta de Ventas Consolidadas y Alertas
 */
const getConsolidadoVentas = async (date) => {
    const key = `consolidado:${date}`;
    const cached = getCachedQuery(key);
    if (cached) return cached;

    const { getConsolidadoVentasData } = require('../routes/consultas');
    if (!getConsolidadoVentasData) {
        throw new Error('Módulo de consolidado de ventas no disponible');
    }
    const data = await getConsolidadoVentasData(date);
    const today = getDateStr(0);
    const ttlMs = (date === today) ? 30000 : 120000;
    setCachedQuery(key, data, ttlMs);
    return data;
};

/**
 * Mapeo amigable de zonas/estaciones propias para monitoreo de competencia DGEHM
 */
const COMPETENCIA_STATION_NAMES = {
    '002': 'Puma Miraflores',
    '006': 'Shell Chalchuapa',
    '008': 'Puma Costa del Sol',
    '014': 'San Martín (La Loma)',
    '015': 'Shell 14 Avenida',
    '016': 'Shell Poliedro'
};

/**
 * Catálogo de marcas competidoras monitoreadas en DGEHM
 */
const KNOWN_COMPETITOR_BRANDS = [
    { key: 'Texaco', label: 'Texaco', icon: '⭐' },
    { key: 'Uno', label: 'Uno', icon: '🔵' },
    { key: 'DLC', label: 'DLC', icon: '🟠' },
    { key: 'Puma', label: 'Puma', icon: '🟢' },
    { key: 'Shell', label: 'Shell', icon: '🟡' }
];

/**
 * Extraer la marca comercial desde el nombre de la estación DGEHM
 */
const extractCompetitorBrand = (stationName = '') => {
    const upper = String(stationName || '').toUpperCase();
    if (upper.includes('TEXACO')) return 'Texaco';
    if (upper.includes('PUMA')) return 'Puma';
    if (/\bUNO\b/.test(upper)) return 'Uno';
    if (upper.includes('SHELL')) return 'Shell';
    if (/\bDLC\b/.test(upper)) return 'DLC';
    return 'Otros';
};

/**
 * Formateador de precio unitario de combustible ($X.XX)
 */
const priceFmt = (val) => {
    const num = Number(val || 0);
    if (!Number.isFinite(num) || num <= 0) return '—';
    return '$' + num.toFixed(2);
};

/**
 * Calcular diferencial en centavos (Competidor - Propia)
 */
const calcPriceDiff = (compVal, ownVal) => {
    const c = Number(compVal || 0);
    const o = Number(ownVal || 0);
    if (c <= 0 || o <= 0) return null;
    const diff = Number((c - o).toFixed(2));
    const sign = diff > 0 ? '+' : (diff < 0 ? '-' : '');
    const formatted = diff === 0 ? '$0.00' : `${sign}$${Math.abs(diff).toFixed(2)}`;
    const icon = diff < -0.001 ? '🔻' : (diff > 0.001 ? '🔺' : '🟰');
    return { diff, formatted, icon };
};

/**
 * Obtener precio efectivo de referencia (prioriza Autoservicio, fallback a Servicio Completo)
 */
const pickEffectivePrice = (row, fuelKey, serviceType = 'AS') => {
    if (!row) return 0;
    const asVal = Number(row[`${fuelKey}_a`] || 0);
    const scVal = Number(row[`${fuelKey}_c`] || 0);
    if (serviceType === 'SC') {
        return scVal > 0 ? scVal : asVal;
    }
    return asVal > 0 ? asVal : scVal;
};

/**
 * Consulta estructurada de Precios de la Competencia (DGEHM)
 * Soporta inyección de `options.customRows` para pruebas unitarias deterministas
 */
const getPreciosCompetenciaData = async (options = {}) => {
    const cacheKey = 'competencia:precios';
    if (!options.forceRefresh && !Array.isArray(options.customRows)) {
        const cached = getCachedQuery(cacheKey);
        if (cached) return cached;
    }

    let rawRows = [];
    let ultimaValidacion = options.ultimaValidacion || null;

    if (Array.isArray(options.customRows)) {
        rawRows = options.customRows;
    } else {
        const db = getDb();
        if (db && typeof db.query === 'function') {
            try {
                const [joinedRows] = await db.query(`
                    SELECT b.id_estacion, c.titulo, a.estacion, a.modificacion,
                           a.super_c, a.regular_c, a.ion_c, a.diesel_c,
                           a.super_a, a.regular_a, a.ion_a, a.diesel_a,
                           IFNULL(b.es_propia, 0) as es_propia
                    FROM web_precios_competencia a
                    INNER JOIN web_estaciones_competencia b
                        ON UPPER(TRIM(a.estacion)) = UPPER(TRIM(b.competencia))
                    LEFT JOIN web_consolidado c
                        ON b.id_estacion = c.id_empresa AND c.grupo = 'ESTACION'
                    ORDER BY COALESCE(c.orden, 99), c.titulo, b.es_propia DESC, a.estacion
                `);
                rawRows = Array.isArray(joinedRows) ? joinedRows : [];

                if (rawRows.length === 0) {
                    const [fallbackRows] = await db.query(`
                        SELECT 'GENERAL' as id_estacion, 'Red General DGEHM' as titulo,
                               estacion, modificacion,
                               super_c, regular_c, ion_c, diesel_c,
                               super_a, regular_a, ion_a, diesel_a,
                               0 as es_propia
                        FROM web_precios_competencia
                        ORDER BY estacion
                        LIMIT 60
                    `);
                    rawRows = Array.isArray(fallbackRows) ? fallbackRows : [];
                }
            } catch (err) {
                console.warn('[TelegramBot] Error consultando web_precios_competencia:', err.message);
            }

            try {
                const [meta] = await db.query('SELECT MAX(created_at) as ultima_validacion FROM web_precios_competencia_historial');
                if (Array.isArray(meta) && meta[0]?.ultima_validacion) {
                    ultimaValidacion = meta[0].ultima_validacion;
                }
            } catch (_) {
                // Historial opcional
            }
        }
    }

    // Normalizar filas
    const normalizedRows = rawRows.map(r => {
        let idEstacion = r.id_estacion ? String(r.id_estacion).trim() : null;
        if (!idEstacion && r.titulo) {
            const matchedKnown = KNOWN_STATIONS.find(s =>
                s.id !== 'ANDELSA' && (
                    normalizeText(r.titulo).includes(normalizeText(s.name)) ||
                    s.keywords.some(kw => kw.length > 3 && normalizeText(r.titulo).includes(normalizeText(kw)))
                )
            );
            idEstacion = matchedKnown ? matchedKnown.id : 'GENERAL';
        }
        idEstacion = idEstacion || 'GENERAL';

        const zona = COMPETENCIA_STATION_NAMES[idEstacion] || r.titulo || 'Zona General';
        const esPropia = (r.es_propia === 1 || r.es_propia === true || r.es_propia === '1') ? 1 : 0;

        return {
            id_estacion: idEstacion,
            zona,
            titulo: r.titulo || zona,
            estacion: String(r.estacion || '').trim(),
            marca: extractCompetitorBrand(r.estacion),
            modificacion: r.modificacion ? String(r.modificacion).trim() : '',
            es_propia: esPropia,
            super_c: Number(r.super_c || 0),
            regular_c: Number(r.regular_c || 0),
            ion_c: Number(r.ion_c || 0),
            diesel_c: Number(r.diesel_c || 0),
            super_a: Number(r.super_a || 0),
            regular_a: Number(r.regular_a || 0),
            ion_a: Number(r.ion_a || 0),
            diesel_a: Number(r.diesel_a || 0)
        };
    });

    // Agrupar por zona / estación SIPE
    const zonasMap = new Map();
    for (const row of normalizedRows) {
        const key = row.id_estacion || row.zona;
        if (!zonasMap.has(key)) {
            zonasMap.set(key, {
                id_estacion: row.id_estacion,
                zona: row.zona,
                propia: null,
                competidores: [],
                todos: []
            });
        }
        const group = zonasMap.get(key);
        group.todos.push(row);
        if (row.es_propia === 1 && !group.propia) {
            group.propia = row;
        } else if (row.es_propia !== 1) {
            group.competidores.push(row);
        }
    }

    const competidoresMasBaratos = [];
    const zonas = [];

    for (const group of zonasMap.values()) {
        const own = group.propia;
        let masBaratosCount = 0;

        group.competidores = group.competidores.map(comp => {
            const diffSuperA = own ? calcPriceDiff(pickEffectivePrice(comp, 'super', 'AS'), pickEffectivePrice(own, 'super', 'AS')) : null;
            const diffRegularA = own ? calcPriceDiff(pickEffectivePrice(comp, 'regular', 'AS'), pickEffectivePrice(own, 'regular', 'AS')) : null;
            const diffDieselA = own ? calcPriceDiff(pickEffectivePrice(comp, 'diesel', 'AS'), pickEffectivePrice(own, 'diesel', 'AS')) : null;
            const diffSuperC = own ? calcPriceDiff(comp.super_c, own.super_c) : null;
            const diffRegularC = own ? calcPriceDiff(comp.regular_c, own.regular_c) : null;
            const diffDieselC = own ? calcPriceDiff(comp.diesel_c, own.diesel_c) : null;

            const cheaperFuels = [];
            if (diffSuperA && diffSuperA.diff < -0.001) cheaperFuels.push({ fuel: 'Súper', ...diffSuperA, compPrice: pickEffectivePrice(comp, 'super', 'AS'), ownPrice: pickEffectivePrice(own, 'super', 'AS') });
            else if (diffSuperC && diffSuperC.diff < -0.001) cheaperFuels.push({ fuel: 'Súper (SC)', ...diffSuperC, compPrice: comp.super_c, ownPrice: own.super_c });

            if (diffRegularA && diffRegularA.diff < -0.001) cheaperFuels.push({ fuel: 'Regular', ...diffRegularA, compPrice: pickEffectivePrice(comp, 'regular', 'AS'), ownPrice: pickEffectivePrice(own, 'regular', 'AS') });
            else if (diffRegularC && diffRegularC.diff < -0.001) cheaperFuels.push({ fuel: 'Regular (SC)', ...diffRegularC, compPrice: comp.regular_c, ownPrice: own.regular_c });

            if (diffDieselA && diffDieselA.diff < -0.001) cheaperFuels.push({ fuel: 'Diésel', ...diffDieselA, compPrice: pickEffectivePrice(comp, 'diesel', 'AS'), ownPrice: pickEffectivePrice(own, 'diesel', 'AS') });
            else if (diffDieselC && diffDieselC.diff < -0.001) cheaperFuels.push({ fuel: 'Diésel (SC)', ...diffDieselC, compPrice: comp.diesel_c, ownPrice: own.diesel_c });

            const isCheaper = cheaperFuels.length > 0;
            const enriched = {
                ...comp,
                isCheaper,
                cheaperFuels,
                diffs: {
                    super_a: diffSuperA,
                    regular_a: diffRegularA,
                    diesel_a: diffDieselA,
                    super_c: diffSuperC,
                    regular_c: diffRegularC,
                    diesel_c: diffDieselC
                }
            };

            if (isCheaper) {
                masBaratosCount += 1;
                competidoresMasBaratos.push({
                    ...enriched,
                    propiaEstacion: own ? own.estacion : group.zona
                });
            }

            return enriched;
        });

        zonas.push({
            id_estacion: group.id_estacion,
            zona: group.zona,
            propia: own,
            competidores: group.competidores,
            totalCompetidores: group.competidores.length,
            masBaratosCount
        });
    }

    // Calcular promedios y extremos de mercado
    const calcAvg = (field, fallbackField = null) => {
        const vals = normalizedRows
            .map(r => Number(r[field] || 0) > 0 ? Number(r[field]) : (fallbackField ? Number(r[fallbackField] || 0) : 0))
            .filter(v => v > 0);
        if (vals.length === 0) return 0;
        return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
    };

    const calcExtremes = (fuelKey) => {
        const candidates = normalizedRows
            .map(r => ({
                estacion: r.estacion,
                zona: r.zona,
                es_propia: r.es_propia,
                marca: r.marca,
                precio: pickEffectivePrice(r, fuelKey, 'AS')
            }))
            .filter(x => x.precio > 0);
        if (candidates.length === 0) return { min: null, max: null };
        candidates.sort((a, b) => a.precio - b.precio);
        return {
            min: candidates[0],
            max: candidates[candidates.length - 1]
        };
    };

    const modificacionReciente = normalizedRows.find(r => r.modificacion)?.modificacion || null;

    const result = {
        rows: normalizedRows,
        zonas,
        promedios: {
            super_a: calcAvg('super_a', 'super_c'),
            regular_a: calcAvg('regular_a', 'regular_c'),
            diesel_a: calcAvg('diesel_a', 'diesel_c'),
            super_c: calcAvg('super_c'),
            regular_c: calcAvg('regular_c'),
            diesel_c: calcAvg('diesel_c')
        },
        extremos: {
            super: calcExtremes('super'),
            regular: calcExtremes('regular'),
            diesel: calcExtremes('diesel')
        },
        competidoresMasBaratos,
        totalMonitoreadas: normalizedRows.length,
        totalCompetidores: normalizedRows.filter(r => r.es_propia !== 1).length,
        totalZonas: zonas.length,
        ultimaValidacion,
        modificacionReciente
    };

    if (!Array.isArray(options.customRows)) {
        setCachedQuery(cacheKey, result, 30000);
    }
    return result;
};

/**
 * Generar botones inline interactivos para Precios de la Competencia
 */
const getCompetenciaInlineMarkup = (selectedStationId = null) => {
    const mark = (id, label) => (selectedStationId === id ? `✅ ${label}` : `⛽ ${label}`);
    return {
        inline_keyboard: [
            [
                { text: '⚠️ Más Baratos', callback_data: 'comp_cheaper' },
                { text: '📊 Resumen Red', callback_data: 'comp_all' }
            ],
            [
                { text: mark('002', 'Miraflores'), callback_data: 'comp_st:002' },
                { text: mark('006', 'Chalchuapa'), callback_data: 'comp_st:006' },
                { text: mark('008', 'Costa'), callback_data: 'comp_st:008' }
            ],
            [
                { text: mark('014', 'La Loma'), callback_data: 'comp_st:014' },
                { text: mark('015', '14 Ave'), callback_data: 'comp_st:015' },
                { text: mark('016', 'Poliedro'), callback_data: 'comp_st:016' }
            ],
            [
                { text: '🔄 Sincronizar DGEHM', callback_data: 'comp_sync' },
                { text: '📄 Exportar PDF', callback_data: 'pdf_rep:competencia' }
            ]
        ]
    };
};

/**
 * Formatear mensaje ejecutivo de Precios de la Competencia para Telegram HTML
 */
const formatPreciosCompetenciaMessage = (data, options = {}) => {
    const zonas = data?.zonas || [];
    const rows = data?.rows || [];
    const serviceType = options.serviceType === 'SC' ? 'SC' : 'AS';
    const serviceLabel = serviceType === 'SC' ? 'Servicio Completo' : 'Autoservicio';

    let syncStr = '';
    if (data?.ultimaValidacion) {
        try {
            const dt = new Date(data.ultimaValidacion);
            if (!isNaN(dt.getTime())) {
                syncStr = dt.toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' });
            } else {
                syncStr = String(data.ultimaValidacion);
            }
        } catch (_) {
            syncStr = String(data.ultimaValidacion);
        }
    } else if (data?.modificacionReciente) {
        syncStr = data.modificacionReciente;
    }

    if (rows.length === 0) {
        let emptyMsg = `📊 <b>PRECIOS DE LA COMPETENCIA (DGEHM)</b>\n`;
        emptyMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
        emptyMsg += `ℹ️ Actualmente no hay registros cargados en el monitoreo local de precios de competencia.\n\n`;
        emptyMsg += `Pulsa el botón <b>🔄 Sincronizar DGEHM</b> abajo para descargar los precios oficiales vigentes desde la Dirección General de Energía, Hidrocarburos y Minas.`;
        return emptyMsg;
    }

    // 1. Vista filtrada por Estación / Zona específica
    if (options.station) {
        const stObj = typeof options.station === 'object' ? options.station : (findStationById(options.station) || { id: String(options.station), name: COMPETENCIA_STATION_NAMES[options.station] || String(options.station) });
        const zoneGroup = zonas.find(z =>
            String(z.id_estacion) === String(stObj.id) ||
            normalizeText(z.zona).includes(normalizeText(stObj.name || ''))
        );

        let msg = `⛽ <b>PRECIOS DE COMPETENCIA • ${escapeHtml((zoneGroup?.zona || stObj.name || 'ESTACIÓN').toUpperCase())}</b>\n`;
        if (syncStr) msg += `🕒 <b>Actualización DGEHM:</b> ${escapeHtml(syncStr)}\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (!zoneGroup) {
            msg += `⚠️ No hay estaciones competidoras asignadas actualmente a la zona de <b>${escapeHtml(stObj.name || String(options.station))}</b>.\n`;
            msg += `\n<i>Puedes asignar estaciones competidoras en SIPE Admin &gt; Consultas &gt; Precios Competencia.</i>`;
            return msg;
        }

        const own = zoneGroup.propia;
        if (options.fuel) {
            const fObj = typeof options.fuel === 'object' ? options.fuel : findFuelByKey(options.fuel);
            if (fObj) {
                const ownF = own ? pickEffectivePrice(own, fObj.key, serviceType) : 0;
                const compVals = zoneGroup.competidores
                    .map(c => ({ estacion: c.estacion, precio: pickEffectivePrice(c, fObj.key, serviceType) }))
                    .filter(x => x.precio > 0)
                    .sort((a, b) => a.precio - b.precio);
                msg += `${fObj.icon} <b>Enfoque ${escapeHtml(fObj.label)} (${serviceLabel}):</b> `;
                msg += ownF > 0 ? `SIPE <b>${priceFmt(ownF)}</b>` : 'SIPE —';
                if (compVals.length > 0) {
                    msg += ` | Menor comp.: <code>${priceFmt(compVals[0].precio)}</code> (${escapeHtml(compVals[0].estacion)})`;
                }
                msg += `\n\n`;
            }
        }
        if (own) {
            msg += `🏠 <b>Nuestra Estación: ${escapeHtml(own.estacion)}</b>\n`;
            msg += `• <b>Autoservicio:</b> 🔴 ${priceFmt(own.super_a)} | 🟢 ${priceFmt(own.regular_a)} | 🛢️ ${priceFmt(own.diesel_a)}`;
            if (own.ion_a > 0) msg += ` | ⚡ ${priceFmt(own.ion_a)}`;
            msg += `\n`;
            if (own.super_c > 0 || own.regular_c > 0 || own.diesel_c > 0) {
                msg += `• <b>Serv. Completo:</b> 🔴 ${priceFmt(own.super_c)} | 🟢 ${priceFmt(own.regular_c)} | 🛢️ ${priceFmt(own.diesel_c)}\n`;
            }
            if (own.modificacion) msg += `• <i>Vigencia: ${escapeHtml(own.modificacion)}</i>\n`;
            msg += `\n`;
        }

        if (zoneGroup.competidores.length === 0) {
            msg += `<i>No hay competidores externos registrados en esta zona.</i>\n`;
        } else {
            msg += `🏁 <b>Competidores en Zona (${zoneGroup.competidores.length}):</b>\n`;
            zoneGroup.competidores.forEach((c, idx) => {
                const sPrice = pickEffectivePrice(c, 'super', serviceType);
                const rPrice = pickEffectivePrice(c, 'regular', serviceType);
                const dPrice = pickEffectivePrice(c, 'diesel', serviceType);
                const dS = serviceType === 'SC' ? c.diffs?.super_c : c.diffs?.super_a;
                const dR = serviceType === 'SC' ? c.diffs?.regular_c : c.diffs?.regular_a;
                const dD = serviceType === 'SC' ? c.diffs?.diesel_c : c.diffs?.diesel_a;

                const alertTag = c.isCheaper ? ' ⚠️ <i>(Más bajo)</i>' : '';
                msg += `${idx + 1}. <b>${escapeHtml(c.estacion)}</b>${alertTag}\n`;
                msg += `   └ 🔴 ${priceFmt(sPrice)}${dS && dS.diff !== 0 ? ` (${dS.icon}${dS.formatted})` : ''} | `;
                msg += `🟢 ${priceFmt(rPrice)}${dR && dR.diff !== 0 ? ` (${dR.icon}${dR.formatted})` : ''} | `;
                msg += `🛢️ ${priceFmt(dPrice)}${dD && dD.diff !== 0 ? ` (${dD.icon}${dD.formatted})` : ''}\n`;
            });
        }

        msg += `\n<i>🔴 Súper | 🟢 Regular | 🛢️ Diésel (${serviceLabel}) • 🔻 Menor vs SIPE | 🔺 Mayor vs SIPE</i>`;
        return msg;
    }

    // 2. Vista de alertas: únicamente competidores más baratos que nuestras estaciones
    if (options.onlyCheaper && !options.fuel && !options.brand) {
        const cheaper = data?.competidoresMasBaratos || [];
        let msg = `⚠️ <b>COMPETIDORES CON PRECIO MENOR A SIPE</b>\n`;
        if (syncStr) msg += `🕒 <b>Actualización DGEHM:</b> ${escapeHtml(syncStr)}\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (cheaper.length === 0) {
            msg += `✅ <b>Excelente posición competitiva</b>\n`;
            msg += `Ninguna de las <b>${data.totalCompetidores || 0}</b> estaciones competidoras monitoreadas presenta precios inferiores a nuestras estaciones en su respectiva zona.\n\n`;
            msg += `📈 <b>Promedio Red (${serviceLabel}):</b>\n`;
            msg += `• 🔴 Súper: <code>${priceFmt(data.promedios?.super_a)}</code> | 🟢 Regular: <code>${priceFmt(data.promedios?.regular_a)}</code> | 🛢️ Diésel: <code>${priceFmt(data.promedios?.diesel_a)}</code>\n`;
            return msg;
        }

        msg += `Se detectaron <b>${cheaper.length}</b> competidor(es) por debajo de nuestro precio de referencia:\n\n`;
        cheaper.slice(0, 18).forEach((c, idx) => {
            const diffsText = (c.cheaperFuels || [])
                .map(cf => `<b>${cf.fuel}:</b> ${priceFmt(cf.compPrice)} vs ${priceFmt(cf.ownPrice)} (<code>${cf.formatted}</code>)`)
                .join(' • ');
            msg += `${idx + 1}. 🔻 <b>${escapeHtml(c.estacion)}</b> <i>[${escapeHtml(c.zona)}]</i>\n`;
            msg += `   └ ${diffsText}\n`;
        });
        if (cheaper.length > 18) {
            msg += `\n<i>... y ${cheaper.length - 18} competidor(es) adicional(es). Exporta el PDF para ver el listado completo.</i>\n`;
        }
        msg += `\n<i>Fuente: Monitoreo DGEHM • SIPE Admin</i>`;
        return msg;
    }

    // 3. Vista filtrada por Marca Competidora (ej. Texaco, Uno, DLC)
    if (options.brand) {
        const brandKey = typeof options.brand === 'object' ? options.brand.key : String(options.brand);
        const brandMatches = [];
        zonas.forEach(z => {
            z.competidores.forEach(c => {
                if (c.marca.toLowerCase() === brandKey.toLowerCase() || normalizeText(c.estacion).includes(normalizeText(brandKey))) {
                    brandMatches.push({ ...c, zona: z.zona });
                }
            });
            if (z.propia && (z.propia.marca.toLowerCase() === brandKey.toLowerCase())) {
                brandMatches.push({ ...z.propia, zona: z.zona });
            }
        });

        let msg = `🏷️ <b>PRECIOS DE COMPETENCIA • MARCA ${escapeHtml(brandKey.toUpperCase())}</b>\n`;
        if (syncStr) msg += `🕒 <b>Actualización DGEHM:</b> ${escapeHtml(syncStr)}\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (brandMatches.length === 0) {
            msg += `ℹ️ No se encontraron estaciones monitoreadas de la marca <b>${escapeHtml(brandKey)}</b> en el catálogo actual.\n`;
            return msg;
        }

        brandMatches.slice(0, 16).forEach((item, idx) => {
            const tag = item.es_propia === 1 ? '🏠 <i>(Propia)</i>' : (item.isCheaper ? '🔻 <i>(Más bajo)</i>' : '🏁');
            msg += `${idx + 1}. ${tag} <b>${escapeHtml(item.estacion)}</b> <i>[${escapeHtml(item.zona)}]</i>\n`;
            msg += `   └ 🔴 ${priceFmt(pickEffectivePrice(item, 'super', serviceType))} | 🟢 ${priceFmt(pickEffectivePrice(item, 'regular', serviceType))} | 🛢️ ${priceFmt(pickEffectivePrice(item, 'diesel', serviceType))}\n`;
        });
        msg += `\n<i>Precios en modalidad ${serviceLabel} • Fuente DGEHM</i>`;
        return msg;
    }

    // 4. Vista filtrada por Combustible específico (ej. "¿Quién tiene más barato el diésel?")
    if (options.fuel) {
        const fuelObj = typeof options.fuel === 'object' ? options.fuel : (findFuelByKey(options.fuel) || { key: 'diesel', label: 'Diésel', icon: '🛢️' });
        const fKey = fuelObj.key;

        const entries = [];
        const seen = new Set();
        zonas.forEach(z => {
            const allInZone = [...(z.propia ? [z.propia] : []), ...z.competidores];
            allInZone.forEach(item => {
                const dedupKey = `${item.id_estacion}:${item.estacion}`;
                if (seen.has(dedupKey)) return;
                seen.add(dedupKey);
                const val = pickEffectivePrice(item, fKey, serviceType);
                if (val > 0) {
                    const diffObj = item.es_propia === 1 ? null : (
                        serviceType === 'SC' ? item.diffs?.[`${fKey}_c`] : item.diffs?.[`${fKey}_a`]
                    );
                    entries.push({
                        estacion: item.estacion,
                        zona: z.zona,
                        es_propia: item.es_propia,
                        precio: val,
                        diffObj
                    });
                }
            });
        });

        entries.sort((a, b) => a.precio - b.precio || b.es_propia - a.es_propia);

        let msg = `${fuelObj.icon} <b>COMPARATIVO DE PRECIOS • ${escapeHtml(fuelObj.label.toUpperCase())}</b>\n`;
        if (syncStr) msg += `🕒 <b>Actualización DGEHM:</b> ${escapeHtml(syncStr)}\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

        if (entries.length === 0) {
            msg += `\nℹ️ No hay precios registrados para <b>${escapeHtml(fuelObj.label)}</b> en este momento.`;
            return msg;
        }

        const minEntry = entries[0];
        const maxEntry = entries[entries.length - 1];
        const avgVal = Number((entries.reduce((s, e) => s + e.precio, 0) / entries.length).toFixed(2));

        msg += `• 🥇 <b>Precio Más Bajo:</b> <b>${priceFmt(minEntry.precio)}</b> — ${escapeHtml(minEntry.estacion)} <i>(${escapeHtml(minEntry.zona)})</i>\n`;
        msg += `• 📈 <b>Promedio Monitoreado:</b> <code>${priceFmt(avgVal)}</code>\n`;
        msg += `• 🔺 <b>Precio Más Alto:</b> <code>${priceFmt(maxEntry.precio)}</code> — ${escapeHtml(maxEntry.estacion)}\n\n`;

        msg += `📋 <b>Ranking del Más Económico al Más Alto (${serviceLabel}):</b>\n`;
        entries.slice(0, 15).forEach((e, idx) => {
            const badge = e.es_propia === 1 ? '🏠' : (e.diffObj && e.diffObj.diff < -0.001 ? '🔻' : '🏁');
            const diffTxt = e.diffObj && e.diffObj.diff !== 0 ? ` (${e.diffObj.formatted} vs SIPE)` : (e.es_propia === 1 ? ' <b>[SIPE]</b>' : '');
            msg += `${idx + 1}. ${badge} <b>${priceFmt(e.precio)}</b> — ${escapeHtml(e.estacion)} <i>[${escapeHtml(e.zona)}]</i>${diffTxt}\n`;
        });
        if (entries.length > 15) {
            msg += `<i>... y ${entries.length - 15} estaciones más en monitoreo.</i>\n`;
        }
        msg += `\n<i>Pulsa una estación abajo para ver su comparativo zonal completo.</i>`;
        return msg;
    }

    // 5. Resumen Ejecutivo Consolidado de Toda la Red (Por Defecto)
    let msg = `📊 <b>PRECIOS DE LA COMPETENCIA (DGEHM)</b>\n`;
    if (syncStr) msg += `🕒 <b>Última actualización:</b> ${escapeHtml(syncStr)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;

    msg += `📈 <b>Promedio Mercado (${serviceLabel}):</b>\n`;
    msg += `• 🔴 <b>Súper:</b> <code>${priceFmt(data.promedios?.super_a)}</code> | 🟢 <b>Regular:</b> <code>${priceFmt(data.promedios?.regular_a)}</code> | 🛢️ <b>Diésel:</b> <code>${priceFmt(data.promedios?.diesel_a)}</code>\n`;

    const cheaperCount = (data.competidoresMasBaratos || []).length;
    if (cheaperCount > 0) {
        msg += `⚠️ <b>Alerta Competitiva:</b> <b>${cheaperCount}</b> competidor(es) tienen algún combustible por debajo de nuestra estación.\n\n`;
    } else {
        msg += `✅ <b>Posición Competitiva:</b> Ningún competidor monitoreado está por debajo de nuestras estaciones.\n\n`;
    }

    zonas.forEach(z => {
        const own = z.propia;
        msg += `⛽ <b>${escapeHtml(z.zona)}</b>`;
        if (z.masBaratosCount > 0) {
            msg += ` <i>(⚠️ ${z.masBaratosCount} más bajo${z.masBaratosCount > 1 ? 's' : ''})</i>`;
        }
        msg += `\n`;

        if (own) {
            msg += `  🏠 <b>Propia:</b> 🔴 ${priceFmt(pickEffectivePrice(own, 'super', serviceType))} | 🟢 ${priceFmt(pickEffectivePrice(own, 'regular', serviceType))} | 🛢️ ${priceFmt(pickEffectivePrice(own, 'diesel', serviceType))}\n`;
        }

        const sortedComp = [...z.competidores].sort((a, b) => Number(b.isCheaper) - Number(a.isCheaper));
        const previewComp = sortedComp.slice(0, 3);
        previewComp.forEach(c => {
            const icon = c.isCheaper ? '🔻' : '🏁';
            const shortName = c.estacion.length > 26 ? c.estacion.slice(0, 26) + '…' : c.estacion;
            msg += `  ${icon} ${escapeHtml(shortName)}: 🔴 ${priceFmt(pickEffectivePrice(c, 'super', serviceType))} | 🟢 ${priceFmt(pickEffectivePrice(c, 'regular', serviceType))} | 🛢️ ${priceFmt(pickEffectivePrice(c, 'diesel', serviceType))}\n`;
        });
        if (z.competidores.length > 3) {
            msg += `  <i>└ +${z.competidores.length - 3} competidor(es) más en esta zona</i>\n`;
        }
        msg += `\n`;
    });

    msg += `<i>Selecciona una estación abajo para ver el detalle completo o exportar en PDF Carta.</i>`;
    return msg;
};

/**
 * Consultar pedidos de combustible en Portal Puma (activos, en ruta, retenidos y recientes)
 */
const getPedidosPumaData = async () => {
    const cacheKey = 'operaciones:pedidos_puma';
    const cached = getCachedQuery(cacheKey);
    if (cached) return cached;

    const emptyResult = {
        fecha_consulta: getDateStr(0),
        resumen: {
            total_registrados: 0,
            total_activos: 0,
            en_transito: 0,
            retenidos: 0,
            pendientes: 0,
            monto_activo_usd: 0,
            saldo_facturas_pendiente_usd: 0
        },
        pedidos: []
    };

    try {
        const db = getDb();
        if (!db) return emptyResult;

        const [rows] = await db.query(`
            SELECT
                numero_orden,
                id_estacion,
                estacion_nombre,
                fecha_pedido,
                fecha_solicitada,
                estado,
                estado_original,
                razon_estado,
                monto_total,
                metodo_pago,
                galones_diesel,
                galones_regular,
                galones_super,
                galones_ion,
                factura_numero,
                factura_saldo_pendiente
            FROM portal_pedidos
            ORDER BY
                CASE
                    WHEN UPPER(COALESCE(estado, '')) REGEXP 'RETENID|HOLD|BLOQUEAD' THEN 1
                    WHEN UPPER(COALESCE(estado, '')) REGEXP 'TRANSIT|RUTA|DESPACH|CARGAD' THEN 2
                    WHEN UPPER(COALESCE(estado, '')) REGEXP 'PENDIENT|APROBAD|PROCES|NUEV' THEN 3
                    ELSE 4
                END ASC,
                COALESCE(fecha_solicitada, DATE(fecha_pedido)) DESC,
                id DESC
            LIMIT 25
        `);

        const pedidos = (rows || []).map(r => {
            const gd = Number(r.galones_diesel || 0);
            const gr = Number(r.galones_regular || 0);
            const gs = Number(r.galones_super || 0);
            const gi = Number(r.galones_ion || 0);
            const estadoNorm = String(r.estado || 'PENDIENTE').toUpperCase();
            const isRetenido = /RETENID|HOLD|BLOQUEAD/i.test(estadoNorm);
            const isEnTransito = /TRANSIT|RUTA|DESPACH|CARGAD/i.test(estadoNorm);
            const isCerrado = /ENTREGAD|COMPLETAD|CANCELAD|ANULAD|FACTURAD/i.test(estadoNorm) && !isRetenido && !isEnTransito;
            const isActivo = !isCerrado;

            return {
                numero_orden: r.numero_orden,
                id_estacion: r.id_estacion || null,
                estacion_nombre: r.estacion_nombre || `Estación ${r.id_estacion || ''}`.trim(),
                fecha_solicitada: r.fecha_solicitada
                    ? (r.fecha_solicitada instanceof Date ? r.fecha_solicitada.toISOString().split('T')[0] : String(r.fecha_solicitada).slice(0, 10))
                    : (r.fecha_pedido instanceof Date ? r.fecha_pedido.toISOString().split('T')[0] : null),
                estado: r.estado || 'PENDIENTE',
                razon_estado: r.razon_estado || null,
                monto_total: Number(r.monto_total || 0),
                metodo_pago: r.metodo_pago || null,
                galones_diesel: gd,
                galones_regular: gr,
                galones_super: gs,
                galones_ion: gi,
                total_galones: gd + gr + gs + gi,
                factura_numero: r.factura_numero || null,
                factura_saldo_pendiente: Number(r.factura_saldo_pendiente || 0),
                es_retenido: isRetenido,
                es_en_transito: isEnTransito,
                es_activo: isActivo
            };
        });

        const resumen = {
            total_registrados: pedidos.length,
            total_activos: pedidos.filter(p => p.es_activo).length,
            en_transito: pedidos.filter(p => p.es_en_transito).length,
            retenidos: pedidos.filter(p => p.es_retenido).length,
            pendientes: pedidos.filter(p => p.es_activo && !p.es_en_transito && !p.es_retenido).length,
            monto_activo_usd: pedidos.filter(p => p.es_activo).reduce((s, p) => s + p.monto_total, 0),
            saldo_facturas_pendiente_usd: pedidos.reduce((s, p) => s + p.factura_saldo_pendiente, 0)
        };

        const result = {
            fecha_consulta: getDateStr(0),
            resumen,
            pedidos
        };
        setCachedQuery(cacheKey, result, 30000);
        return result;
    } catch (_) {
        return emptyResult;
    }
};

module.exports = {
    queryMemoryCache,
    getCachedQuery,
    setCachedQuery,
    clearQueryCache,
    getSaldosBancosData,
    getSaldosChequeraData,
    getConsolidadoVentas,
    getPedidosPumaData,
    COMPETENCIA_STATION_NAMES,
    KNOWN_COMPETITOR_BRANDS,
    extractCompetitorBrand,
    priceFmt,
    calcPriceDiff,
    pickEffectivePrice,
    getPreciosCompetenciaData,
    getCompetenciaInlineMarkup,
    formatPreciosCompetenciaMessage
};
