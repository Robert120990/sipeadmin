const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const {
    BANK_NAME_MAP,
    escapeHtml,
    getDateStr,
    normalizeText,
    SPANISH_MONTH_NAMES,
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
                        num_cta: String(r.num_cta || ''),
                        raw_nom_banco: String(r.nom_banco || ''),
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
                       (
                           COALESCE(c.saldo_inicial, 0) +
                           COALESCE((
                               SELECT SUM(m.abono - m.cargo)
                               FROM movimientos_bancarios m
                               WHERE m.cuenta_bancaria_id = c.id
                                 AND m.deleted_at IS NULL
                                 AND (c.fecha_saldo_inicial IS NULL OR m.fecha >= c.fecha_saldo_inicial)
                           ), 0) -
                           COALESCE((
                               SELECT SUM(ch.valor)
                               FROM cheques ch
                               WHERE ch.cuenta_bancaria_id = c.id
                                 AND ch.deleted_at IS NULL
                                 AND ch.cheque_anulado = FALSE
                                 AND ch.fue_noemitido = FALSE
                                 AND ch.es_reservado = FALSE
                                 AND (c.fecha_saldo_inicial IS NULL OR ch.fecha >= c.fecha_saldo_inicial)
                           ), 0)
                       ) as saldo
                FROM cuentas_bancarias c
                LEFT JOIN bancos b ON c.banco_id = b.id
                WHERE c.activa = 1
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
                        num_cta: String(numCta || ''),
                        raw_nom_banco: String(r.nom_banco || r.banco || ''),
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

/**
 * Filtrar cuentas de Banco o Chequera por Banco, Contribuyente/Titular, Estación/Tienda o Número de Cuenta
 */
const filterBankOrChequeraAccounts = (data, {
    matchedBank = null,
    matchedAccountHolder = null,
    matchedStation = null,
    matchedAccountNumber = null
} = {}) => {
    const allCuentas = Array.isArray(data?.cuentas) ? data.cuentas : [];
    const filterParts = [];

    if (matchedBank) filterParts.push(matchedBank.label);
    if (matchedAccountHolder) filterParts.push(matchedAccountHolder.label);
    if (matchedStation && (!matchedAccountHolder || matchedStation.id !== matchedAccountHolder.key)) {
        filterParts.push(matchedStation.name);
    }
    if (matchedAccountNumber) filterParts.push(`Cuenta #${matchedAccountNumber}`);

    const hasFilter = filterParts.length > 0;
    if (!hasFilter) {
        return {
            ...data,
            hasFilter: false,
            filterLabel: null,
            total_positivo: allCuentas.filter(c => Number(c.saldo || 0) > 0).reduce((s, c) => s + Number(c.saldo || 0), 0),
            total_sobregiro: allCuentas.filter(c => Number(c.saldo || 0) < 0).reduce((s, c) => s + Number(c.saldo || 0), 0)
        };
    }

    const filtered = allCuentas.filter(c => {
        const bNorm = normalizeText(c.banco || '');
        const cNorm = normalizeText(`${c.cuenta || ''} ${c.raw_nom_banco || ''} ${c.num_cta || ''}`);
        const fullNorm = `${bNorm} ${cNorm}`.trim();

        if (matchedBank) {
            const matchesB = (matchedBank.keywords || []).some(kw => fullNorm.includes(normalizeText(kw)));
            if (!matchesB) return false;
        }

        if (matchedAccountHolder) {
            const matchesH = (matchedAccountHolder.keywords || []).some(kw => {
                const nKw = normalizeText(kw);
                if (nKw.length <= 3) {
                    return new RegExp(`\\b${nKw}\\b`, 'i').test(fullNorm);
                }
                return fullNorm.includes(nKw);
            });
            if (!matchesH) return false;
        }

        if (matchedStation && (!matchedAccountHolder || matchedStation.id !== matchedAccountHolder.key)) {
            const stExtra = matchedStation.id === '008' ? ['cds', 'costa del sol', 'costa'] :
                            matchedStation.id === '014' ? ['san martin', 'la loma', 'lil'] :
                            matchedStation.id === '002' ? ['miraflores'] :
                            matchedStation.id === '006' ? ['chalchuapa', 'chalchupa'] : [];
            const allStKws = [...(matchedStation.keywords || []), ...stExtra];
            const matchesSt = allStKws.some(kw => {
                const nKw = normalizeText(kw);
                if (nKw.length <= 3) {
                    return new RegExp(`\\b${nKw}\\b`, 'i').test(fullNorm);
                }
                return fullNorm.includes(nKw);
            });
            if (!matchesSt) return false;
        }

        if (matchedAccountNumber) {
            const cleanNum = String(matchedAccountNumber).replace(/[^0-9]/g, '');
            const rawDigits = `${c.num_cta || ''} ${c.cuenta || ''} ${c.raw_nom_banco || ''}`.replace(/[^0-9]/g, '');
            if (!cleanNum || (!rawDigits.includes(cleanNum) && !fullNorm.includes(normalizeText(matchedAccountNumber)))) {
                return false;
            }
        }

        return true;
    });

    const total = filtered.reduce((s, c) => s + Number(c.saldo || 0), 0);
    const totalPositivo = filtered.filter(c => Number(c.saldo || 0) > 0).reduce((s, c) => s + Number(c.saldo || 0), 0);
    const totalSobregiro = filtered.filter(c => Number(c.saldo || 0) < 0).reduce((s, c) => s + Number(c.saldo || 0), 0);

    return {
        ...data,
        hasFilter: true,
        filterLabel: filterParts.join(' • '),
        cuentas: filtered,
        total,
        total_positivo: totalPositivo,
        total_sobregiro: totalSobregiro,
        total_cuentas_sistema: allCuentas.length
    };
};

/**
 * Consulta Híbrida de Ventas de Tienda de Conveniencia por Línea / Categoría y Producto
 * Combina db_sistema_saas (sales_items + product_categories) y db_system_rrs (cort_ventas + cort_cabecera)
 */
const getVentasTiendaPorLineaData = async ({
    startDate = null,
    endDate = null,
    targetDate = null,
    station = null,
    storeLine = null
} = {}) => {
    const sDate = startDate || targetDate || getDateStr(-1);
    const eDate = endDate || targetDate || sDate;
    const stObj = station ? (typeof station === 'object' ? station : findStationById(station)) : null;
    const cacheKey = `tienda_linea:${sDate}:${eDate}:${stObj?.id || 'ALL'}:${storeLine?.key || 'ALL'}`;
    const cached = getCachedQuery(cacheKey);
    if (cached) return cached;

    const lineasMap = new Map();
    const productosTop = [];
    let totalTiendaPeriodo = 0;
    let fallbackPeriodoLabel = null;
    let effectiveStartDate = sDate;
    let effectiveEndDate = eDate;

    const matchesLineFilter = (lineName, prodName = '') => {
        if (!storeLine) return true;
        const normLine = normalizeText(lineName || '');
        const normProd = normalizeText(prodName || '');
        const matchers = [...(storeLine.dbMatchers || []), ...(storeLine.keywords || [])];
        return matchers.some(m => {
            const nm = normalizeText(m);
            return normLine.includes(nm) || normProd.includes(nm);
        });
    };

    const runQueryForRange = async (rangeStart, rangeEnd) => {
        const localLineasMap = new Map();
        const localProductos = [];
        let localTotalTienda = 0;

        // 1. Consultar Nova SaaS (db_sistema_saas: sales_items + sales_headers + products + product_categories)
        try {
            const accountingDb = await getAccountingDb().catch(() => null);
            if (accountingDb) {
                const branchFilterSql = stObj?.saas_branch_id ? 'AND sh.branch_id = ?' : 'AND sh.branch_id IN (1, 2, 3, 4, 8, 12)';
                const params = stObj?.saas_branch_id
                    ? [rangeStart, rangeEnd, Number(stObj.saas_branch_id)]
                    : [rangeStart, rangeEnd];

                const [saasLines] = await accountingDb.query(`
                    SELECT
                        COALESCE(pc.name, 'MERCADERIA EN GENERAL') as linea,
                        COUNT(DISTINCT sh.id) as tickets,
                        COALESCE(SUM(si.cantidad), 0) as unidades,
                        ROUND(COALESCE(SUM(si.cantidad * si.precio_unitario - COALESCE(si.monto_descuento, 0)), 0), 2) as monto
                    FROM sales_items si
                    INNER JOIN sales_headers sh ON si.sale_id = sh.id
                    LEFT JOIN products p ON si.product_id = p.id
                    LEFT JOIN product_categories pc ON p.category_id = pc.id
                    WHERE DATE(sh.fecha_emision) BETWEEN ? AND ?
                      ${branchFilterSql}
                      AND COALESCE(sh.estado, '') != 'ANULADO'
                      AND (p.tipo_combustible IS NULL OR p.tipo_combustible = 0)
                      AND UPPER(COALESCE(pc.name, '')) != 'COMBUSTIBLES'
                    GROUP BY COALESCE(pc.name, 'MERCADERIA EN GENERAL')
                    HAVING monto > 0
                    ORDER BY monto DESC
                `, params);

                (saasLines || []).forEach(r => {
                    const lName = String(r.linea || 'MERCADERIA EN GENERAL').trim().toUpperCase();
                    const monto = Number(r.monto || 0);
                    const unidades = Number(r.unidades || 0);
                    const tickets = Number(r.tickets || 0);
                    if (monto <= 0) return;
                    localTotalTienda += monto;
                    const existing = localLineasMap.get(lName) || { linea: lName, monto: 0, unidades: 0, tickets: 0 };
                    existing.monto = Math.round((existing.monto + monto) * 100) / 100;
                    existing.unidades = Math.round((existing.unidades + unidades) * 100) / 100;
                    existing.tickets += tickets;
                    localLineasMap.set(lName, existing);
                });

                // Si se pidió una línea específica (ej. CIGARROS) o estación específica, obtener top productos vendidos
                const [saasProds] = await accountingDb.query(`
                    SELECT
                        COALESCE(p.nombre, si.descripcion, 'Producto') as producto,
                        COALESCE(pc.name, 'MERCADERIA EN GENERAL') as linea,
                        COUNT(DISTINCT sh.id) as tickets,
                        COALESCE(SUM(si.cantidad), 0) as unidades,
                        ROUND(COALESCE(SUM(si.cantidad * si.precio_unitario - COALESCE(si.monto_descuento, 0)), 0), 2) as monto
                    FROM sales_items si
                    INNER JOIN sales_headers sh ON si.sale_id = sh.id
                    LEFT JOIN products p ON si.product_id = p.id
                    LEFT JOIN product_categories pc ON p.category_id = pc.id
                    WHERE DATE(sh.fecha_emision) BETWEEN ? AND ?
                      ${branchFilterSql}
                      AND COALESCE(sh.estado, '') != 'ANULADO'
                      AND (p.tipo_combustible IS NULL OR p.tipo_combustible = 0)
                      AND UPPER(COALESCE(pc.name, '')) != 'COMBUSTIBLES'
                    GROUP BY COALESCE(p.nombre, si.descripcion, 'Producto'), COALESCE(pc.name, 'MERCADERIA EN GENERAL')
                    HAVING monto > 0
                    ORDER BY monto DESC
                    LIMIT 300
                `, params);

                (saasProds || []).forEach(pr => {
                    if (matchesLineFilter(pr.linea, pr.producto)) {
                        localProductos.push({
                            producto: String(pr.producto || '').trim(),
                            linea: String(pr.linea || '').trim().toUpperCase(),
                            tickets: Number(pr.tickets || 0),
                            unidades: Number(pr.unidades || 0),
                            monto: Number(pr.monto || 0)
                        });
                    }
                });
            }
        } catch (errSaas) {
            console.warn('[TelegramBot] Error consultando líneas de tienda en SaaS:', errSaas.message);
        }

        // 2. Complementar con db_system_rrs (cort_ventas + cort_cabecera, especialmente Miraflores 002 y Costa del Sol 008)
        try {
            const externalDb = await getExternalDb().catch(() => null);
            if (externalDb && (!stObj || localTotalTienda === 0)) {
                const empFilterSql = stObj?.id ? 'AND c.id_empresa = ?' : "AND c.id_empresa NOT IN ('004', '022')";
                const legParams = stObj?.id ? [rangeStart, rangeEnd, stObj.id] : [rangeStart, rangeEnd];

                const [legLines] = await externalDb.query(`
                    SELECT
                        v.linea,
                        COALESCE(SUM(v.monto), 0) as monto
                    FROM cort_ventas v
                    INNER JOIN cort_cabecera c ON v.id_corte = c.id AND v.id_empresa = c.id_empresa
                    WHERE DATE(c.fecha) BETWEEN ? AND ?
                      ${empFilterSql}
                      AND UPPER(COALESCE(v.linea, '')) != 'COMBUSTIBLES'
                    GROUP BY v.linea
                    HAVING monto > 0
                    ORDER BY monto DESC
                `, legParams);

                (legLines || []).forEach(r => {
                    const lName = String(r.linea || 'GENERAL').trim().toUpperCase();
                    const monto = Number(r.monto || 0);
                    if (monto <= 0) return;
                    // Si la estación ya fue cargada desde SaaS, no duplicar; si es estación legada (002, 008) o total general, sumar
                    if (!stObj || localTotalTienda === 0 || !localLineasMap.has(lName)) {
                        localTotalTienda += monto;
                        const existing = localLineasMap.get(lName) || { linea: lName, monto: 0, unidades: 0, tickets: 0 };
                        existing.monto = Math.round((existing.monto + monto) * 100) / 100;
                        localLineasMap.set(lName, existing);
                    }
                });
            }
        } catch (errLeg) {
            console.warn('[TelegramBot] Error consultando cort_ventas legado:', errLeg.message);
        }

        return {
            lineas: Array.from(localLineasMap.values()).sort((a, b) => b.monto - a.monto),
            productos: localProductos.sort((a, b) => b.monto - a.monto).slice(0, 12),
            totalTienda: Math.round(localTotalTienda * 100) / 100
        };
    };

    // Ejecutar para la fecha o rango solicitado
    let primaryRes = await runQueryForRange(sDate, eDate);

    // Si la fecha puntual dio 0 (ej. turno de tienda abierto o fecha sin corte) o la línea específica dio 0 en ese día,
    // buscar en los últimos 30 días / mes del período para brindar el dato real consolidado
    const matchedPrimaryLines = storeLine
        ? primaryRes.lineas.filter(l => matchesLineFilter(l.linea))
        : primaryRes.lineas;

    if (matchedPrimaryLines.length === 0 && primaryRes.productos.length === 0) {
        const refParts = sDate.split('-');
        const y = Number(refParts[0]) || new Date().getFullYear();
        const m = Number(refParts[1]) || (new Date().getMonth() + 1);
        const lastDay = new Date(y, m, 0).getDate();
        const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
        const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const monthRes = await runQueryForRange(monthStart, monthEnd);
        const matchedMonthLines = storeLine
            ? monthRes.lineas.filter(l => matchesLineFilter(l.linea))
            : monthRes.lineas;

        if (matchedMonthLines.length > 0 || monthRes.productos.length > 0) {
            primaryRes = monthRes;
            effectiveStartDate = monthStart;
            effectiveEndDate = monthEnd;
            fallbackPeriodoLabel = `Consolidado ${SPANISH_MONTH_NAMES[m] || 'Mes'} ${y}`;
        }
    }

    primaryRes.lineas.forEach(l => lineasMap.set(l.linea, l));
    productosTop.push(...primaryRes.productos);
    totalTiendaPeriodo = primaryRes.totalTienda;

    const allLineas = Array.from(lineasMap.values()).map(l => ({
        ...l,
        porcentaje: totalTiendaPeriodo > 0 ? Math.round((l.monto / totalTiendaPeriodo) * 10000) / 100 : 0
    }));

    const filteredLineas = storeLine
        ? allLineas.filter(l => matchesLineFilter(l.linea))
        : allLineas;

    const totalLineaConsultada = filteredLineas.reduce((s, l) => s + l.monto, 0) ||
        productosTop.reduce((s, p) => s + p.monto, 0);
    const totalUnidadesLinea = filteredLineas.reduce((s, l) => s + (l.unidades || 0), 0) ||
        productosTop.reduce((s, p) => s + (p.unidades || 0), 0);
    const totalTicketsLinea = filteredLineas.reduce((s, l) => s + (l.tickets || 0), 0) ||
        productosTop.reduce((s, p) => s + (p.tickets || 0), 0);

    const result = {
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        requestedStartDate: sDate,
        requestedEndDate: eDate,
        fallbackPeriodoLabel,
        station: stObj,
        storeLine,
        total_tienda_usd: totalTiendaPeriodo,
        total_linea_usd: Math.round(totalLineaConsultada * 100) / 100,
        total_unidades_linea: Math.round(totalUnidadesLinea * 100) / 100,
        total_tickets_linea: totalTicketsLinea,
        participacion_linea_pct: totalTiendaPeriodo > 0
            ? Math.round((totalLineaConsultada / totalTiendaPeriodo) * 10000) / 100
            : 0,
        lineas: filteredLineas,
        todas_las_lineas: allLineas,
        productos_top: productosTop
    };

    setCachedQuery(cacheKey, result, 30000);
    return result;
};

const SPANISH_WEEKDAYS = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

/**
 * Consulta de Día de Mayor / Menor Venta del Mes o Rango y Rendimiento por Día de la Semana
 */
const getRankingDiasVentasData = async ({
    startDate = null,
    endDate = null,
    year = null,
    month = null,
    station = null,
    order = 'DESC'
} = {}) => {
    let sDate = startDate;
    let eDate = endDate;
    let periodoLabel = '';

    if (year && month) {
        const y = Number(year);
        const m = Number(month);
        const lastDay = new Date(y, m, 0).getDate();
        sDate = `${y}-${String(m).padStart(2, '0')}-01`;
        eDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        periodoLabel = `${SPANISH_MONTH_NAMES[m] || 'Mes'} ${y}`;
    } else if (sDate && eDate && sDate !== eDate) {
        periodoLabel = `Del ${sDate} al ${eDate}`;
    } else {
        // Por defecto últimos 30 días cerrados si no se especificó mes ni rango
        eDate = getDateStr(-1);
        sDate = getDateStr(-30);
        periodoLabel = `Últimos 30 días (${sDate} al ${eDate})`;
    }

    const stObj = station ? (typeof station === 'object' ? station : findStationById(station)) : null;
    const cacheKey = `ranking_dias:${sDate}:${eDate}:${stObj?.id || 'ALL'}:${order}`;
    const cached = getCachedQuery(cacheKey);
    if (cached) return cached;

    const daysMap = new Map();

    const ensureDay = (ymd) => {
        if (!daysMap.has(ymd)) {
            const parts = ymd.split('-');
            const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            const dowIdx = !isNaN(dt.getTime()) ? dt.getDay() : 0;
            daysMap.set(ymd, {
                fecha: ymd,
                dow_index: dowIdx,
                dia_semana: SPANISH_WEEKDAYS[dowIdx] || 'Día',
                galonaje: 0,
                venta_pista: 0,
                venta_tienda: 0,
                venta_total: 0
            });
        }
        return daysMap.get(ymd);
    };

    // 1. Consultar Nova SaaS (gas_station_closeouts + pos_shifts)
    try {
        const accountingDb = await getAccountingDb().catch(() => null);
        if (accountingDb) {
            const branchSql = stObj?.saas_branch_id ? 'AND c.branch_id = ?' : 'AND c.branch_id != 12';
            const fuelParams = stObj?.saas_branch_id
                ? [sDate, eDate, Number(stObj.saas_branch_id)]
                : [sDate, eDate];

            const [saasFuelDays] = await accountingDb.query(`
                SELECT
                    DATE_FORMAT(c.fecha_turno, '%Y-%m-%d') as fecha_ymd,
                    COALESCE(SUM(r.diferencia), 0) as galonaje,
                    COALESCE(SUM(r.monto), 0) as venta_pista
                FROM gas_station_closeouts c
                INNER JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
                WHERE c.estado = 'cerrado'
                  AND c.fecha_turno BETWEEN ? AND ?
                  ${branchSql}
                GROUP BY fecha_ymd
                ORDER BY fecha_ymd ASC
            `, fuelParams);

            (saasFuelDays || []).forEach(r => {
                if (!r.fecha_ymd) return;
                const d = ensureDay(String(r.fecha_ymd));
                d.galonaje = Math.round((d.galonaje + Number(r.galonaje || 0)) * 100) / 100;
                d.venta_pista = Math.round((d.venta_pista + Number(r.venta_pista || 0)) * 100) / 100;
                d.venta_total = Math.round((d.venta_pista + d.venta_tienda) * 100) / 100;
            });

            const shiftBranchSql = stObj?.saas_branch_id ? 'AND s.branch_id = ?' : '';
            const [saasStoreDays] = await accountingDb.query(`
                SELECT
                    DATE_FORMAT(s.shift_date, '%Y-%m-%d') as fecha_ymd,
                    COALESCE(SUM(s.total_sales), 0) as venta_tienda
                FROM pos_shifts s
                INNER JOIN points_of_sale p ON s.pos_id = p.id
                WHERE s.status = 'closed'
                  AND DATE(s.shift_date) BETWEEN ? AND ?
                  AND (p.nombre LIKE '%Tienda%' OR p.nombre LIKE '%Super%')
                  ${shiftBranchSql}
                GROUP BY fecha_ymd
            `, fuelParams).catch(() => [[]]);

            (saasStoreDays || []).forEach(r => {
                if (!r.fecha_ymd) return;
                const d = ensureDay(String(r.fecha_ymd));
                d.venta_tienda = Math.round((d.venta_tienda + Number(r.venta_tienda || 0)) * 100) / 100;
                d.venta_total = Math.round((d.venta_pista + d.venta_tienda) * 100) / 100;
            });
        }
    } catch (errSaas) {
        console.warn('[TelegramBot] Error consultando ranking de días en SaaS:', errSaas.message);
    }

    // 2. Complementar con db_system_rrs si SaaS no devolvió días o para tiendas legadas
    try {
        const externalDb = await getExternalDb().catch(() => null);
        if (externalDb && daysMap.size === 0) {
            const empSql = stObj?.id ? 'AND ct.id_empresa = ?' : "AND ct.id_empresa != '004'";
            const legParams = stObj?.id ? [sDate, eDate, stObj.id] : [sDate, eDate];
            const [legFuelDays] = await externalDb.query(`
                SELECT
                    DATE_FORMAT(STR_TO_DATE(ct.fecha_turno, '%d/%m/%Y'), '%Y-%m-%d') as fecha_ymd,
                    COALESCE(SUM(ct_l.total), 0) as galonaje,
                    COALESCE(SUM(ct_l.monto), SUM(ct_l.total * ct_l.precio), 0) as venta_pista
                FROM cierre_turno ct
                INNER JOIN cierre_turno_lecturas ct_l ON ct.id = ct_l.id_cierre_turno AND ct.id_empresa = ct_l.id_empresa
                WHERE STR_TO_DATE(ct.fecha_turno, '%d/%m/%Y') BETWEEN ? AND ?
                  ${empSql}
                GROUP BY fecha_ymd
            `, legParams);

            (legFuelDays || []).forEach(r => {
                if (!r.fecha_ymd) return;
                const d = ensureDay(String(r.fecha_ymd));
                d.galonaje = Math.round(Number(r.galonaje || 0) * 100) / 100;
                d.venta_pista = Math.round(Number(r.venta_pista || 0) * 100) / 100;
                d.venta_total = Math.round((d.venta_pista + d.venta_tienda) * 100) / 100;
            });
        }
    } catch (errLeg) {
        console.warn('[TelegramBot] Error consultando ranking de días en legado:', errLeg.message);
    }

    const allDays = Array.from(daysMap.values()).filter(d => d.venta_total > 0 || d.galonaje > 0);
    const sortedDays = [...allDays].sort((a, b) =>
        order === 'ASC' ? (a.venta_total - b.venta_total) : (b.venta_total - a.venta_total)
    );

    // Agrupar rendimiento por día de la semana (Lunes a Domingo)
    const weekdayStatsMap = new Map();
    allDays.forEach(d => {
        const prev = weekdayStatsMap.get(d.dia_semana) || {
            dia_semana: d.dia_semana,
            dow_index: d.dow_index,
            cantidad_dias: 0,
            total_venta: 0,
            total_galonaje: 0,
            promedio_venta: 0,
            promedio_galonaje: 0
        };
        prev.cantidad_dias += 1;
        prev.total_venta = Math.round((prev.total_venta + d.venta_total) * 100) / 100;
        prev.total_galonaje = Math.round((prev.total_galonaje + d.galonaje) * 100) / 100;
        prev.promedio_venta = Math.round((prev.total_venta / prev.cantidad_dias) * 100) / 100;
        prev.promedio_galonaje = Math.round((prev.total_galonaje / prev.cantidad_dias) * 100) / 100;
        weekdayStatsMap.set(d.dia_semana, prev);
    });

    const rankingDiasSemana = Array.from(weekdayStatsMap.values()).sort((a, b) =>
        order === 'ASC' ? (a.promedio_venta - b.promedio_venta) : (b.promedio_venta - a.promedio_venta)
    );

    const totalVentaPeriodo = allDays.reduce((s, d) => s + d.venta_total, 0);
    const totalGalonajePeriodo = allDays.reduce((s, d) => s + d.galonaje, 0);

    const result = {
        periodo_label: periodoLabel,
        startDate: sDate,
        endDate: eDate,
        station: stObj,
        order,
        total_dias_evaluados: allDays.length,
        total_venta_periodo: Math.round(totalVentaPeriodo * 100) / 100,
        total_galonaje_periodo: Math.round(totalGalonajePeriodo * 100) / 100,
        promedio_diario_venta: allDays.length > 0 ? Math.round((totalVentaPeriodo / allDays.length) * 100) / 100 : 0,
        promedio_diario_galonaje: allDays.length > 0 ? Math.round((totalGalonajePeriodo / allDays.length) * 100) / 100 : 0,
        dia_principal: sortedDays[0] || null,
        top_dias: sortedDays.slice(0, 7),
        mejor_dia_semana: rankingDiasSemana[0] || null,
        ranking_dias_semana: rankingDiasSemana
    };

    setCachedQuery(cacheKey, result, 30000);
    return result;
};

/**
 * Consulta de Pagos Programados y Vencimientos Pendientes (Control de Pagos enriquecido con abonos/saldos)
 */
const getPagosProgramadosData = async ({ limit = 200, filterMode = 'resumen', ubicacionFilter = null, searchTerm = null, startDate = null, endDate = null } = {}) => {
    const cacheKey = `pagos:programados:${limit}:${filterMode}:${ubicacionFilter || ''}:${searchTerm || ''}:${startDate || ''}:${endDate || ''}`;
    const cached = getCachedQuery(cacheKey);
    if (cached) return cached;

    const { getControlPagosDetailedData } = require('./telegramProductivityService');
    const result = await getControlPagosDetailedData({
        filterMode,
        ubicacionFilter,
        searchTerm,
        startDate,
        endDate,
        limit
    });

    setCachedQuery(cacheKey, result, 30000);
    return result;
};

module.exports = {
    queryMemoryCache,
    getCachedQuery,
    setCachedQuery,
    clearQueryCache,
    getSaldosBancosData,
    getSaldosChequeraData,
    filterBankOrChequeraAccounts,
    getVentasTiendaPorLineaData,
    getRankingDiasVentasData,
    getPagosProgramadosData,
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
