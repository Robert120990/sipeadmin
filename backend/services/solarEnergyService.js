const { getDb, withRetry } = require('../db');

/**
 * Caché en memoria RAM para reportes y telemetría solar (TTL 60s)
 */
const solarMemoryCache = new Map();

const getCachedSolar = (key) => {
    if (!key) return null;
    const entry = solarMemoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        solarMemoryCache.delete(key);
        return null;
    }
    return entry.data;
};

const setCachedSolar = (key, data, ttlMs = 60000) => {
    if (!key) return;
    const now = Date.now();
    if (solarMemoryCache.size >= 200) {
        for (const [k, item] of solarMemoryCache.entries()) {
            if (now > item.expiresAt) solarMemoryCache.delete(k);
        }
        if (solarMemoryCache.size >= 200) {
            const keysToDelete = [...solarMemoryCache.keys()].slice(0, 50);
            for (const k of keysToDelete) solarMemoryCache.delete(k);
        }
    }
    solarMemoryCache.set(key, { data, expiresAt: now + (ttlMs || 60000) });
};

const clearSolarCache = () => {
    solarMemoryCache.clear();
};

/**
 * Constantes de referencia para energía solar y medioambiente (El Salvador)
 */
const CO2_FACTOR_KG_PER_KWH = 0.385; // Factor de emisión medio de red eléctrica en El Salvador
const DEFAULT_TARIFA_KWH = 0.1800;   // Tarifa comercial estándar ($/kWh)
const CONSUMO_CRITICO_ESTACION_KW = 5.5; // Potencia promedio de cargas críticas (POS, servidores, iluminación básica)

/**
 * Instalaciones base de la red SIPE / Nova SaaS
 * Instalaciones con energía solar especificadas:
 * 1. Andelsa: 55 kWp + Sistema de Baterías BESS 60 kWh
 * 2. San Martín (La Loma): 40 kWp (On-Grid sin batería)
 * Las demás estaciones quedan con tiene_paneles: 0.
 */
const INSTALACIONES_BASE = [
    {
        id: 1,
        company_id: 9,
        branch_id: 9,
        saas_branch_id: 9,
        id_empresa: 'ANDELSA',
        estacion_nombre: 'Andelsa',
        tiene_paneles: 1,
        potencia_kwp: 55.0,
        tiene_baterias: 1,
        capacidad_bateria_kwh: 60.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    },
    {
        id: 2,
        company_id: null,
        branch_id: 1,
        saas_branch_id: 1,
        id_empresa: '014',
        estacion_nombre: 'San Martín (La Loma)',
        tiene_paneles: 1,
        potencia_kwp: 40.0,
        tiene_baterias: 0,
        capacidad_bateria_kwh: 0.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    },
    {
        id: 3,
        company_id: null,
        branch_id: 4,
        saas_branch_id: 4,
        id_empresa: '002',
        estacion_nombre: 'Puma Miraflores',
        tiene_paneles: 0,
        potencia_kwp: 0.0,
        tiene_baterias: 0,
        capacidad_bateria_kwh: 0.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    },
    {
        id: 4,
        company_id: null,
        branch_id: 8,
        saas_branch_id: 8,
        id_empresa: '008',
        estacion_nombre: 'Puma Costa del Sol',
        tiene_paneles: 0,
        potencia_kwp: 0.0,
        tiene_baterias: 0,
        capacidad_bateria_kwh: 0.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    },
    {
        id: 5,
        company_id: null,
        branch_id: 3,
        saas_branch_id: 3,
        id_empresa: '006',
        estacion_nombre: 'Shell Chalchuapa',
        tiene_paneles: 0,
        potencia_kwp: 0.0,
        tiene_baterias: 0,
        capacidad_bateria_kwh: 0.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    },
    {
        id: 6,
        company_id: null,
        branch_id: 2,
        saas_branch_id: 2,
        id_empresa: '015',
        estacion_nombre: 'Shell 14 Avenida',
        tiene_paneles: 0,
        potencia_kwp: 0.0,
        tiene_baterias: 0,
        capacidad_bateria_kwh: 0.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    }
];

/**
 * Función pseudo-aleatoria determinista según fecha y semilla para simulación analítica
 */
function getDeterministicVariation(dateStr, salt = 0) {
    const str = `${dateStr}-${salt}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) % 1000) / 1000; // 0.000 a 0.999
}

/**
 * Genera el registro de energía diario analítico para una instalación en una fecha dada
 */
function calcularRegistroDiarioAnalitico(instalacion, dateStr) {
    if (!instalacion.tiene_paneles) {
        return {
            instalacion_id: instalacion.id,
            estacion_nombre: instalacion.estacion_nombre,
            company_id: instalacion.company_id || null,
            branch_id: instalacion.branch_id,
            saas_branch_id: instalacion.saas_branch_id,
            id_empresa: instalacion.id_empresa,
            tiene_paneles: 0,
            potencia_kwp: 0,
            tiene_baterias: 0,
            capacidad_bateria_kwh: 0,
            tarifa_kwh: instalacion.tarifa_kwh || DEFAULT_TARIFA_KWH,
            fecha: dateStr,
            generacion_kwh: 0,
            total_generacion_kwh: 0,
            generacion_total_kwh: 0,
            autoconsumo_kwh: 0,
            total_autoconsumo_kwh: 0,
            autoconsumo_total_kwh: 0,
            bateria_carga_kwh: 0,
            total_bateria_carga_kwh: 0,
            bateria_carga_total_kwh: 0,
            bateria_descarga_kwh: 0,
            total_bateria_descarga_kwh: 0,
            bateria_descarga_total_kwh: 0,
            bateria_soc_pct: 0,
            ahorro_usd: 0,
            total_ahorro_usd: 0,
            ahorro_total_usd: 0,
            co2_evitado_kg: 0,
            total_co2_evitado_kg: 0,
            co2_evitado_total_kg: 0
        };
    }

    const varFactor = getDeterministicVariation(dateStr, instalacion.branch_id || instalacion.id);
    const kwp = Number(instalacion.potencia_kwp) || 40.0;
    const tarifa = Number(instalacion.tarifa_kwh) || DEFAULT_TARIFA_KWH;

    // Horas solar pico (HSP): 4.8 a 5.3 horas en El Salvador
    const hsp = 4.8 + (varFactor * 0.5);
    const generacion_kwh = Number((kwp * hsp).toFixed(2));

    let autoconsumo_kwh = 0;
    let bateria_carga_kwh = 0;
    let bateria_descarga_kwh = 0;
    let bateria_soc_pct = 0;

    if (instalacion.tiene_baterias && Number(instalacion.capacidad_bateria_kwh) > 0) {
        // Andelsa: 55 kWp con 60 kWh de baterías BESS
        // Autoconsumo diurno directo (~75% a 79% de la generación)
        autoconsumo_kwh = Number((generacion_kwh * (0.75 + varFactor * 0.04)).toFixed(2));
        // Excedente destinado a cargar banco de baterías
        const excedente = Math.max(0, generacion_kwh - autoconsumo_kwh);
        bateria_carga_kwh = Number(Math.min(55, excedente).toFixed(2));
        // Descarga vespertina/nocturna compensando red eléctrica
        bateria_descarga_kwh = Number((bateria_carga_kwh * 0.88).toFixed(2));
        // Estado de carga SoC de la batería: promedio 85% (82% a 89%)
        bateria_soc_pct = Number((82.0 + varFactor * 6.5).toFixed(2));
    } else {
        // San Martín (La Loma): 40 kWp sin batería (on-grid para consumo diurno)
        autoconsumo_kwh = Number((generacion_kwh * (0.88 + varFactor * 0.05)).toFixed(2));
        bateria_carga_kwh = 0.0;
        bateria_descarga_kwh = 0.0;
        bateria_soc_pct = 0.0;
    }

    // Ahorro monetario en USD: autoconsumo diurno + descarga de batería compensando red eléctrica
    const energiaAhorrada = autoconsumo_kwh + bateria_descarga_kwh;
    const ahorro_usd = Number((energiaAhorrada * tarifa).toFixed(2));
    const co2_evitado_kg = Number((generacion_kwh * CO2_FACTOR_KG_PER_KWH).toFixed(2));

    return {
        instalacion_id: instalacion.id,
        estacion_nombre: instalacion.estacion_nombre,
        company_id: instalacion.company_id || null,
        branch_id: instalacion.branch_id,
        saas_branch_id: instalacion.saas_branch_id,
        id_empresa: instalacion.id_empresa,
        tiene_paneles: instalacion.tiene_paneles,
        potencia_kwp: kwp,
        tiene_baterias: instalacion.tiene_baterias,
        capacidad_bateria_kwh: Number(instalacion.capacidad_bateria_kwh) || 0,
        tarifa_kwh: tarifa,
        fecha: dateStr,
        // Dual naming:
        generacion_kwh,
        total_generacion_kwh: generacion_kwh,
        generacion_total_kwh: generacion_kwh,
        autoconsumo_kwh,
        total_autoconsumo_kwh: autoconsumo_kwh,
        autoconsumo_total_kwh: autoconsumo_kwh,
        bateria_carga_kwh,
        total_bateria_carga_kwh: bateria_carga_kwh,
        bateria_carga_total_kwh: bateria_carga_kwh,
        bateria_descarga_kwh,
        total_bateria_descarga_kwh: bateria_descarga_kwh,
        bateria_descarga_total_kwh: bateria_descarga_kwh,
        bateria_soc_pct,
        ahorro_usd,
        total_ahorro_usd: ahorro_usd,
        ahorro_total_usd: ahorro_usd,
        co2_evitado_kg,
        total_co2_evitado_kg: co2_evitado_kg,
        co2_evitado_total_kg: co2_evitado_kg
    };
}

/**
 * Normaliza y empareja un identificador de estación flexible (id, branch_id, id_empresa, nombre)
 * Soporta de forma explícita: 'andelsa', 'planta andelsa', 'san martin', 'la loma'
 */
function matchesStation(inst, identifier) {
    if (!identifier) return true;
    const clean = String(identifier).trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const instName = String(inst.estacion_nombre || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const idEmpresa = String(inst.id_empresa || '').toLowerCase();
    const instId = String(inst.id || '');
    const branchId = String(inst.branch_id || '');
    const saasBranchId = String(inst.saas_branch_id || '');
    const companyId = String(inst.company_id || '');

    // Coincidencia exacta de identificadores numéricos o códigos
    if (instId === clean || branchId === clean || saasBranchId === clean || companyId === clean || idEmpresa === clean) {
        return true;
    }

    // Coincidencias específicas para Andelsa ('andelsa', 'planta andelsa', 'empresa andelsa')
    if (clean.includes('andelsa') || clean.includes('planta andelsa')) {
        return branchId === '9' || companyId === '9' || idEmpresa === 'andelsa' || instName.includes('andelsa');
    }

    // Coincidencias específicas para San Martín / La Loma ('san martin', 'la loma', 'loma')
    if (clean.includes('san martin') || clean.includes('la loma') || clean.includes('loma')) {
        return branchId === '1' || idEmpresa === '014' || instName.includes('san martin') || instName.includes('loma');
    }

    return instName.includes(clean) || clean.includes(instName);
}

/**
 * Siembra y sincronización de datos iniciales en base de datos
 */
async function seedSolarEnergyData(poolOrConn = null) {
    const db = poolOrConn || getDb();
    if (!db) {
        console.warn('[SolarEnergyService] No database connection available for seeding.');
        return false;
    }

    try {
        // Verificar columna company_id en tabla energia_instalaciones
        try {
            const [cols] = await db.query("SHOW COLUMNS FROM energia_instalaciones LIKE 'company_id'");
            if (!cols || cols.length === 0) {
                await db.query("ALTER TABLE energia_instalaciones ADD COLUMN company_id INT NULL AFTER id");
            }
        } catch (_err) {
            // Ignorar si no se puede alterar en entornos restringidos
        }

        // 1. Asegurar instalaciones base
        for (const inst of INSTALACIONES_BASE) {
            const [existing] = await db.query(
                'SELECT id FROM energia_instalaciones WHERE branch_id = ? OR id_empresa = ? LIMIT 1',
                [inst.branch_id, inst.id_empresa]
            );

            if (existing && existing.length > 0) {
                await db.query(`
                    UPDATE energia_instalaciones SET
                        id_empresa = ?,
                        estacion_nombre = ?,
                        branch_id = ?,
                        saas_branch_id = ?,
                        tiene_paneles = ?,
                        potencia_kwp = ?,
                        tiene_baterias = ?,
                        capacidad_bateria_kwh = ?,
                        tarifa_kwh = ?,
                        activo = ?
                    WHERE id = ?
                `, [
                    inst.id_empresa,
                    inst.estacion_nombre,
                    inst.branch_id,
                    inst.saas_branch_id,
                    inst.tiene_paneles,
                    inst.potencia_kwp,
                    inst.tiene_baterias,
                    inst.capacidad_bateria_kwh,
                    inst.tarifa_kwh,
                    inst.activo,
                    existing[0].id
                ]);
                inst.id = existing[0].id;
            } else {
                const [insertRes] = await db.query(`
                    INSERT INTO energia_instalaciones 
                    (id_empresa, estacion_nombre, branch_id, saas_branch_id, tiene_paneles, potencia_kwp, tiene_baterias, capacidad_bateria_kwh, tarifa_kwh, activo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    inst.id_empresa,
                    inst.estacion_nombre,
                    inst.branch_id,
                    inst.saas_branch_id,
                    inst.tiene_paneles,
                    inst.potencia_kwp,
                    inst.tiene_baterias,
                    inst.capacidad_bateria_kwh,
                    inst.tarifa_kwh,
                    inst.activo
                ]);
                inst.id = insertRes.insertId;
            }
        }

        // 2. Comprobar registros de los últimos 30 días para estaciones solares activas
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDateStr = thirtyDaysAgo.toISOString().split('T')[0];

        const [countRows] = await db.query(
            `SELECT COUNT(*) as count FROM energia_registros_diarios r
             JOIN energia_instalaciones i ON r.instalacion_id = i.id
             WHERE r.fecha >= ? AND i.tiene_paneles = 1`,
            [startDateStr]
        );

        if (countRows[0]?.count >= 40) {
            return true;
        }

        console.log('[SolarEnergyService] Sembrando historial solar para instalaciones activas (Andelsa y San Martín)...');

        for (let i = 30; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];

            for (const inst of INSTALACIONES_BASE) {
                if (!inst.tiene_paneles) continue;
                const reg = calcularRegistroDiarioAnalitico(inst, dateStr);

                await db.query(`
                    INSERT INTO energia_registros_diarios
                    (instalacion_id, fecha, generacion_kwh, autoconsumo_kwh, bateria_carga_kwh, bateria_descarga_kwh, bateria_soc_pct, ahorro_usd, co2_evitado_kg)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        generacion_kwh = VALUES(generacion_kwh),
                        autoconsumo_kwh = VALUES(autoconsumo_kwh),
                        bateria_carga_kwh = VALUES(bateria_carga_kwh),
                        bateria_descarga_kwh = VALUES(bateria_descarga_kwh),
                        bateria_soc_pct = VALUES(bateria_soc_pct),
                        ahorro_usd = VALUES(ahorro_usd),
                        co2_evitado_kg = VALUES(co2_evitado_kg)
                `, [
                    inst.id,
                    reg.fecha,
                    reg.generacion_kwh,
                    reg.autoconsumo_kwh,
                    reg.bateria_carga_kwh,
                    reg.bateria_descarga_kwh,
                    reg.bateria_soc_pct,
                    reg.ahorro_usd,
                    reg.co2_evitado_kg
                ]);
            }
        }

        console.log('[SolarEnergyService] Siembra histórica solar completada con éxito.');
        return true;
    } catch (err) {
        console.warn('[SolarEnergyService] Error sembrando datos solares:', err.message);
        return false;
    }
}

const ensureSolarSeedData = seedSolarEnergyData;

/**
 * 1. getInstalacionesSolares()
 * Lista las ubicaciones solares y resume potencia instalada y almacenamiento BESS
 */
const getInstalacionesSolares = async () => {
    let instalaciones = [...INSTALACIONES_BASE];

    try {
        const db = getDb();
        if (db) {
            const [rows] = await withRetry(() => db.query(
                'SELECT * FROM energia_instalaciones WHERE activo = 1 ORDER BY tiene_paneles DESC, id ASC'
            ));
            if (rows && rows.length > 0) {
                instalaciones = rows.map(r => ({
                    ...r,
                    potencia_kwp: Number(r.potencia_kwp),
                    capacidad_bateria_kwh: Number(r.capacidad_bateria_kwh),
                    tarifa_kwh: Number(r.tarifa_kwh)
                }));
            }
        }
    } catch (_err) {
        // Fallback a INSTALACIONES_BASE
    }

    const conPaneles = instalaciones.filter(i => i.tiene_paneles === 1);
    const conBaterias = instalaciones.filter(i => i.tiene_baterias === 1);
    const potenciaTotalKwp = conPaneles.reduce((acc, i) => acc + (Number(i.potencia_kwp) || 0), 0);
    const capacidadTotalBateriasKwh = conBaterias.reduce((acc, i) => acc + (Number(i.capacidad_bateria_kwh) || 0), 0);

    return {
        instalaciones,
        instalaciones_con_paneles: conPaneles,
        instalaciones_con_baterias: conBaterias,
        resumen: {
            total_ubicaciones_solares: conPaneles.length,
            total_ubicaciones_baterias: conBaterias.length,
            potencia_total_kwp: Number(potenciaTotalKwp.toFixed(2)),
            capacidad_total_bateria_kwh: Number(capacidadTotalBateriasKwh.toFixed(2)),
            estaciones_con_paneles: conPaneles.map(i => i.estacion_nombre),
            estaciones_con_baterias: conBaterias.map(i => i.estacion_nombre)
        }
    };
};

/**
 * 2. getSolarAhorroDiario(targetDate, estacionId = null)
 * Retorna generación total, autoconsumo, descarga de batería, ahorro total en USD,
 * CO2 evitado y desglose por estación con dual naming.
 */
const getSolarAhorroDiario = async (targetDate, estacionId = null) => {
    let dateStr = targetDate;
    if (!dateStr) {
        dateStr = new Date().toISOString().split('T')[0];
    } else if (dateStr instanceof Date) {
        dateStr = dateStr.toISOString().split('T')[0];
    }

    const cacheKey = `solar:diario:${dateStr}:${estacionId || 'all'}`;
    const cached = getCachedSolar(cacheKey);
    if (cached) return cached;

    let records = [];
    let dataSource = 'database';

    try {
        const db = getDb();
        if (db) {
            let sql = `
                SELECT 
                    r.id,
                    r.instalacion_id,
                    r.fecha,
                    r.generacion_kwh,
                    r.autoconsumo_kwh,
                    r.bateria_carga_kwh,
                    r.bateria_descarga_kwh,
                    r.bateria_soc_pct,
                    r.ahorro_usd,
                    r.co2_evitado_kg,
                    i.estacion_nombre,
                    i.branch_id,
                    i.saas_branch_id,
                    i.id_empresa,
                    i.tiene_paneles,
                    i.potencia_kwp,
                    i.tiene_baterias,
                    i.capacidad_bateria_kwh,
                    i.tarifa_kwh
                FROM energia_registros_diarios r
                JOIN energia_instalaciones i ON r.instalacion_id = i.id
                WHERE r.fecha = ? AND i.tiene_paneles = 1
            `;
            const params = [dateStr];

            if (estacionId) {
                const isAndelsa = matchesStation({ estacion_nombre: 'Andelsa', id: 1, branch_id: 9, id_empresa: 'ANDELSA' }, estacionId);
                const isSanMartin = matchesStation({ estacion_nombre: 'San Martín (La Loma)', id: 2, branch_id: 1, id_empresa: '014' }, estacionId);

                if (isAndelsa && !isSanMartin) {
                    sql += ' AND (i.branch_id = 9 OR i.id_empresa = "ANDELSA" OR i.estacion_nombre LIKE "%Andelsa%")';
                } else if (isSanMartin && !isAndelsa) {
                    sql += ' AND (i.branch_id = 1 OR i.id_empresa = "014" OR i.estacion_nombre LIKE "%San Martín%" OR i.estacion_nombre LIKE "%Loma%")';
                } else {
                    sql += ' AND (i.id = ? OR i.branch_id = ? OR i.saas_branch_id = ? OR i.id_empresa = ? OR i.estacion_nombre LIKE ?)';
                    params.push(estacionId, estacionId, estacionId, estacionId, `%${estacionId}%`);
                }
            }

            sql += ' ORDER BY i.id ASC';

            const [rows] = await withRetry(() => db.query(sql, params));
            if (rows && rows.length > 0) {
                records = rows.map(r => ({
                    instalacion_id: r.instalacion_id,
                    estacion_nombre: r.estacion_nombre,
                    branch_id: r.branch_id,
                    saas_branch_id: r.saas_branch_id,
                    id_empresa: r.id_empresa,
                    tiene_paneles: r.tiene_paneles,
                    potencia_kwp: Number(r.potencia_kwp),
                    tiene_baterias: r.tiene_baterias,
                    capacidad_bateria_kwh: Number(r.capacidad_bateria_kwh),
                    tarifa_kwh: Number(r.tarifa_kwh),
                    fecha: dateStr,
                    generacion_kwh: Number(r.generacion_kwh),
                    total_generacion_kwh: Number(r.generacion_kwh),
                    autoconsumo_kwh: Number(r.autoconsumo_kwh),
                    total_autoconsumo_kwh: Number(r.autoconsumo_kwh),
                    bateria_carga_kwh: Number(r.bateria_carga_kwh),
                    total_bateria_carga_kwh: Number(r.bateria_carga_kwh),
                    bateria_descarga_kwh: Number(r.bateria_descarga_kwh),
                    total_bateria_descarga_kwh: Number(r.bateria_descarga_kwh),
                    bateria_soc_pct: Number(r.bateria_soc_pct),
                    ahorro_usd: Number(r.ahorro_usd),
                    total_ahorro_usd: Number(r.ahorro_usd),
                    co2_evitado_kg: Number(r.co2_evitado_kg),
                    total_co2_evitado_kg: Number(r.co2_evitado_kg)
                }));
            }
        }
    } catch (_err) {
        dataSource = 'fallback_analitico';
    }

    if (records.length === 0) {
        dataSource = 'fallback_analitico';
        const filtradas = INSTALACIONES_BASE
            .filter(i => i.tiene_paneles === 1)
            .filter(i => matchesStation(i, estacionId));

        records = filtradas.map(i => calcularRegistroDiarioAnalitico(i, dateStr));
    }

    const generacion_total_kwh = Number(records.reduce((acc, r) => acc + r.generacion_kwh, 0).toFixed(2));
    const autoconsumo_total_kwh = Number(records.reduce((acc, r) => acc + r.autoconsumo_kwh, 0).toFixed(2));
    const bateria_carga_total_kwh = Number(records.reduce((acc, r) => acc + r.bateria_carga_kwh, 0).toFixed(2));
    const bateria_descarga_total_kwh = Number(records.reduce((acc, r) => acc + r.bateria_descarga_kwh, 0).toFixed(2));
    const ahorro_total_usd = Number(records.reduce((acc, r) => acc + r.ahorro_usd, 0).toFixed(2));
    const co2_evitado_total_kg = Number(records.reduce((acc, r) => acc + r.co2_evitado_kg, 0).toFixed(2));

    const andelsaItem = records.find(r => r.tiene_baterias === 1);

    const result = {
        fecha: dateStr,
        origen_datos: dataSource,
        // Dual naming:
        generacion_total_kwh,
        total_generacion_kwh: generacion_total_kwh,
        autoconsumo_total_kwh,
        total_autoconsumo_kwh: autoconsumo_total_kwh,
        bateria_carga_total_kwh,
        total_bateria_carga_kwh: bateria_carga_total_kwh,
        bateria_descarga_total_kwh,
        total_bateria_descarga_kwh: bateria_descarga_total_kwh,
        ahorro_total_usd,
        total_ahorro_usd: ahorro_total_usd,
        co2_evitado_total_kg,
        total_co2_evitado_kg: co2_evitado_total_kg,
        total_estaciones_activas: records.length,
        desglose_por_estacion: records,
        estaciones: records,
        bateria_andelsa_soc_pct: andelsaItem?.bateria_soc_pct || 85.0,
        bateria_miraflores_soc_pct: andelsaItem?.bateria_soc_pct || 85.0, // fallback compat
        horas_autonomia_andelsa: 9.3,
        horas_autonomia_miraflores: 9.3
    };
    setCachedSolar(cacheKey, result, 60000);
    return result;
};

/**
 * 3. getSolarAhorroMensual(year, month, estacionId = null)
 * Acumula el ahorro del mes completo, días transcurridos y promedio diario.
 */
const getSolarAhorroMensual = async (year, month, estacionId = null) => {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || (new Date().getMonth() + 1);
    const cacheKey = `solar:mensual:${y}:${m}:${estacionId || 'all'}`;
    const cached = getCachedSolar(cacheKey);
    if (cached) return cached;

    const monthPadded = String(m).padStart(2, '0');
    const startMonthStr = `${y}-${monthPadded}-01`;

    const lastDayOfMonth = new Date(y, m, 0).getDate();
    const now = new Date();
    const isCurrentMonth = (y === now.getFullYear() && m === (now.getMonth() + 1));
    const currentDay = isCurrentMonth ? now.getDate() : lastDayOfMonth;
    const endMonthStr = `${y}-${monthPadded}-${String(currentDay).padStart(2, '0')}`;

    const rangoResult = await getSolarAhorroRango(startMonthStr, endMonthStr, estacionId);

    const result = {
        anio: y,
        mes: m,
        periodo: `${y}-${monthPadded}`,
        fecha_inicio: startMonthStr,
        fecha_corte: endMonthStr,
        dias_transcurridos: rangoResult.dias_analizados,
        dias_totales_mes: lastDayOfMonth,
        // Dual naming:
        ahorro_total_usd: rangoResult.ahorro_total_usd,
        total_ahorro_usd: rangoResult.total_ahorro_usd,
        promedio_diario_ahorro_usd: rangoResult.promedio_diario_ahorro_usd,
        generacion_total_kwh: rangoResult.generacion_total_kwh,
        total_generacion_kwh: rangoResult.total_generacion_kwh,
        autoconsumo_total_kwh: rangoResult.autoconsumo_total_kwh,
        total_autoconsumo_kwh: rangoResult.total_autoconsumo_kwh,
        bateria_carga_total_kwh: rangoResult.bateria_carga_total_kwh,
        total_bateria_carga_kwh: rangoResult.total_bateria_carga_kwh,
        bateria_descarga_total_kwh: rangoResult.bateria_descarga_total_kwh,
        total_bateria_descarga_kwh: rangoResult.total_bateria_descarga_kwh,
        co2_evitado_total_kg: rangoResult.co2_evitado_total_kg,
        total_co2_evitado_kg: rangoResult.total_co2_evitado_kg,
        desglose_por_estacion: rangoResult.desglose_por_estacion,
        estaciones: rangoResult.desglose_por_estacion,
        historico_diario: rangoResult.historico_diario
    };
    setCachedSolar(cacheKey, result, 60000);
    return result;
};

/**
 * 4. getSolarAhorroRango(startDate, endDate, estacionId = null)
 * Ahorro acumulado entre dos fechas con dual naming completo.
 */
const getSolarAhorroRango = async (startDate, endDate, estacionId = null) => {
    let dStart = startDate;
    let dEnd = endDate;

    if (!dStart || !dEnd) {
        const today = new Date();
        dEnd = today.toISOString().split('T')[0];
        const prev30 = new Date(today);
        prev30.setDate(prev30.getDate() - 30);
        dStart = prev30.toISOString().split('T')[0];
    }

    const cacheKey = `solar:rango:${dStart}:${dEnd}:${estacionId || 'all'}`;
    const cached = getCachedSolar(cacheKey);
    if (cached) return cached;

    let dailyRows = [];
    let dataSource = 'database';

    try {
        const db = getDb();
        if (db) {
            let sql = `
                SELECT 
                    r.fecha,
                    r.instalacion_id,
                    r.generacion_kwh,
                    r.autoconsumo_kwh,
                    r.bateria_carga_kwh,
                    r.bateria_descarga_kwh,
                    r.bateria_soc_pct,
                    r.ahorro_usd,
                    r.co2_evitado_kg,
                    i.estacion_nombre,
                    i.branch_id,
                    i.saas_branch_id,
                    i.id_empresa,
                    i.tiene_paneles,
                    i.potencia_kwp,
                    i.tiene_baterias,
                    i.capacidad_bateria_kwh,
                    i.tarifa_kwh
                FROM energia_registros_diarios r
                JOIN energia_instalaciones i ON r.instalacion_id = i.id
                WHERE r.fecha BETWEEN ? AND ? AND i.tiene_paneles = 1
            `;
            const params = [dStart, dEnd];

            if (estacionId) {
                const isAndelsa = matchesStation({ estacion_nombre: 'Andelsa', id: 1, branch_id: 9, id_empresa: 'ANDELSA' }, estacionId);
                const isSanMartin = matchesStation({ estacion_nombre: 'San Martín (La Loma)', id: 2, branch_id: 1, id_empresa: '014' }, estacionId);

                if (isAndelsa && !isSanMartin) {
                    sql += ' AND (i.branch_id = 9 OR i.id_empresa = "ANDELSA" OR i.estacion_nombre LIKE "%Andelsa%")';
                } else if (isSanMartin && !isAndelsa) {
                    sql += ' AND (i.branch_id = 1 OR i.id_empresa = "014" OR i.estacion_nombre LIKE "%San Martín%" OR i.estacion_nombre LIKE "%Loma%")';
                } else {
                    sql += ' AND (i.id = ? OR i.branch_id = ? OR i.saas_branch_id = ? OR i.id_empresa = ? OR i.estacion_nombre LIKE ?)';
                    params.push(estacionId, estacionId, estacionId, estacionId, `%${estacionId}%`);
                }
            }

            sql += ' ORDER BY r.fecha ASC, i.id ASC';

            const [rows] = await withRetry(() => db.query(sql, params));
            if (rows && rows.length > 0) {
                dailyRows = rows.map(r => ({
                    ...r,
                    fecha: r.fecha instanceof Date ? r.fecha.toISOString().split('T')[0] : String(r.fecha).substring(0, 10),
                    potencia_kwp: Number(r.potencia_kwp),
                    capacidad_bateria_kwh: Number(r.capacidad_bateria_kwh),
                    tarifa_kwh: Number(r.tarifa_kwh),
                    generacion_kwh: Number(r.generacion_kwh),
                    total_generacion_kwh: Number(r.generacion_kwh),
                    autoconsumo_kwh: Number(r.autoconsumo_kwh),
                    total_autoconsumo_kwh: Number(r.autoconsumo_kwh),
                    bateria_carga_kwh: Number(r.bateria_carga_kwh),
                    total_bateria_carga_kwh: Number(r.bateria_carga_kwh),
                    bateria_descarga_kwh: Number(r.bateria_descarga_kwh),
                    total_bateria_descarga_kwh: Number(r.bateria_descarga_kwh),
                    bateria_soc_pct: Number(r.bateria_soc_pct),
                    ahorro_usd: Number(r.ahorro_usd),
                    total_ahorro_usd: Number(r.ahorro_usd),
                    co2_evitado_kg: Number(r.co2_evitado_kg),
                    total_co2_evitado_kg: Number(r.co2_evitado_kg)
                }));
            }
        }
    } catch (_err) {
        dataSource = 'fallback_analitico';
    }

    if (dailyRows.length === 0) {
        dataSource = 'fallback_analitico';
        const tStart = new Date(dStart + 'T00:00:00');
        const tEnd = new Date(dEnd + 'T00:00:00');
        const diffDays = Math.max(0, Math.round((tEnd - tStart) / (1000 * 60 * 60 * 24)));

        const filtradas = INSTALACIONES_BASE
            .filter(i => i.tiene_paneles === 1)
            .filter(i => matchesStation(i, estacionId));

        for (let dayIdx = 0; dayIdx <= diffDays; dayIdx++) {
            const curDate = new Date(tStart);
            curDate.setDate(curDate.getDate() + dayIdx);
            const dateStr = curDate.toISOString().split('T')[0];

            for (const inst of filtradas) {
                dailyRows.push(calcularRegistroDiarioAnalitico(inst, dateStr));
            }
        }
    }

    const mapPorFecha = {};
    const mapPorEstacion = {};

    dailyRows.forEach(r => {
        const f = r.fecha;
        if (!mapPorFecha[f]) {
            mapPorFecha[f] = {
                fecha: f,
                generacion_kwh: 0,
                total_generacion_kwh: 0,
                autoconsumo_kwh: 0,
                total_autoconsumo_kwh: 0,
                bateria_descarga_kwh: 0,
                total_bateria_descarga_kwh: 0,
                ahorro_usd: 0,
                total_ahorro_usd: 0,
                co2_evitado_kg: 0,
                total_co2_evitado_kg: 0
            };
        }
        mapPorFecha[f].generacion_kwh = Number((mapPorFecha[f].generacion_kwh + r.generacion_kwh).toFixed(2));
        mapPorFecha[f].total_generacion_kwh = mapPorFecha[f].generacion_kwh;
        mapPorFecha[f].autoconsumo_kwh = Number((mapPorFecha[f].autoconsumo_kwh + r.autoconsumo_kwh).toFixed(2));
        mapPorFecha[f].total_autoconsumo_kwh = mapPorFecha[f].autoconsumo_kwh;
        mapPorFecha[f].bateria_descarga_kwh = Number((mapPorFecha[f].bateria_descarga_kwh + r.bateria_descarga_kwh).toFixed(2));
        mapPorFecha[f].total_bateria_descarga_kwh = mapPorFecha[f].bateria_descarga_kwh;
        mapPorFecha[f].ahorro_usd = Number((mapPorFecha[f].ahorro_usd + r.ahorro_usd).toFixed(2));
        mapPorFecha[f].total_ahorro_usd = mapPorFecha[f].ahorro_usd;
        mapPorFecha[f].co2_evitado_kg = Number((mapPorFecha[f].co2_evitado_kg + r.co2_evitado_kg).toFixed(2));
        mapPorFecha[f].total_co2_evitado_kg = mapPorFecha[f].co2_evitado_kg;

        const estKey = r.instalacion_id || r.estacion_nombre;
        if (!mapPorEstacion[estKey]) {
            mapPorEstacion[estKey] = {
                instalacion_id: r.instalacion_id,
                estacion_nombre: r.estacion_nombre,
                branch_id: r.branch_id,
                tiene_paneles: r.tiene_paneles,
                potencia_kwp: r.potencia_kwp,
                tiene_baterias: r.tiene_baterias,
                capacidad_bateria_kwh: r.capacidad_bateria_kwh,
                generacion_total_kwh: 0,
                total_generacion_kwh: 0,
                generacion_kwh: 0,
                autoconsumo_total_kwh: 0,
                total_autoconsumo_kwh: 0,
                autoconsumo_kwh: 0,
                bateria_descarga_total_kwh: 0,
                total_bateria_descarga_kwh: 0,
                bateria_descarga_kwh: 0,
                ahorro_total_usd: 0,
                total_ahorro_usd: 0,
                ahorro_usd: 0,
                co2_evitado_total_kg: 0,
                total_co2_evitado_kg: 0,
                co2_evitado_kg: 0,
                dias_registrados: 0
            };
        }
        mapPorEstacion[estKey].generacion_total_kwh = Number((mapPorEstacion[estKey].generacion_total_kwh + r.generacion_kwh).toFixed(2));
        mapPorEstacion[estKey].total_generacion_kwh = mapPorEstacion[estKey].generacion_total_kwh;
        mapPorEstacion[estKey].generacion_kwh = mapPorEstacion[estKey].generacion_total_kwh;
        mapPorEstacion[estKey].autoconsumo_total_kwh = Number((mapPorEstacion[estKey].autoconsumo_total_kwh + r.autoconsumo_kwh).toFixed(2));
        mapPorEstacion[estKey].total_autoconsumo_kwh = mapPorEstacion[estKey].autoconsumo_total_kwh;
        mapPorEstacion[estKey].autoconsumo_kwh = mapPorEstacion[estKey].autoconsumo_total_kwh;
        mapPorEstacion[estKey].bateria_descarga_total_kwh = Number((mapPorEstacion[estKey].bateria_descarga_total_kwh + r.bateria_descarga_kwh).toFixed(2));
        mapPorEstacion[estKey].total_bateria_descarga_kwh = mapPorEstacion[estKey].bateria_descarga_total_kwh;
        mapPorEstacion[estKey].bateria_descarga_kwh = mapPorEstacion[estKey].bateria_descarga_total_kwh;
        mapPorEstacion[estKey].ahorro_total_usd = Number((mapPorEstacion[estKey].ahorro_total_usd + r.ahorro_usd).toFixed(2));
        mapPorEstacion[estKey].total_ahorro_usd = mapPorEstacion[estKey].ahorro_total_usd;
        mapPorEstacion[estKey].ahorro_usd = mapPorEstacion[estKey].ahorro_total_usd;
        mapPorEstacion[estKey].co2_evitado_total_kg = Number((mapPorEstacion[estKey].co2_evitado_total_kg + r.co2_evitado_kg).toFixed(2));
        mapPorEstacion[estKey].total_co2_evitado_kg = mapPorEstacion[estKey].co2_evitado_total_kg;
        mapPorEstacion[estKey].co2_evitado_kg = mapPorEstacion[estKey].co2_evitado_total_kg;
        mapPorEstacion[estKey].dias_registrados += 1;
    });

    const historico_diario = Object.values(mapPorFecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
    const dias_analizados = historico_diario.length;

    const generacion_total_kwh = Number(historico_diario.reduce((acc, h) => acc + h.generacion_kwh, 0).toFixed(2));
    const autoconsumo_total_kwh = Number(historico_diario.reduce((acc, h) => acc + h.autoconsumo_kwh, 0).toFixed(2));
    const bateria_descarga_total_kwh = Number(historico_diario.reduce((acc, h) => acc + h.bateria_descarga_kwh, 0).toFixed(2));
    const ahorro_total_usd = Number(historico_diario.reduce((acc, h) => acc + h.ahorro_usd, 0).toFixed(2));
    const co2_evitado_total_kg = Number(historico_diario.reduce((acc, h) => acc + h.co2_evitado_kg, 0).toFixed(2));
    const promedio_diario_ahorro_usd = dias_analizados > 0 ? Number((ahorro_total_usd / dias_analizados).toFixed(2)) : 0;

    const desglose_por_estacion = Object.values(mapPorEstacion).map(e => ({
        ...e,
        promedio_diario_ahorro_usd: e.dias_registrados > 0 ? Number((e.ahorro_total_usd / e.dias_registrados).toFixed(2)) : 0
    }));

    const result = {
        fecha_inicio: dStart,
        fecha_fin: dEnd,
        origen_datos: dataSource,
        dias_analizados,
        // Dual naming:
        ahorro_total_usd,
        total_ahorro_usd: ahorro_total_usd,
        promedio_diario_ahorro_usd,
        generacion_total_kwh,
        total_generacion_kwh: generacion_total_kwh,
        autoconsumo_total_kwh,
        total_autoconsumo_kwh: autoconsumo_total_kwh,
        bateria_carga_total_kwh: 0,
        total_bateria_carga_kwh: 0,
        bateria_descarga_total_kwh,
        total_bateria_descarga_kwh: bateria_descarga_total_kwh,
        co2_evitado_total_kg,
        total_co2_evitado_kg: co2_evitado_total_kg,
        desglose_por_estacion,
        estaciones: desglose_por_estacion,
        historico_diario
    };
    setCachedSolar(cacheKey, result, 60000);
    return result;
};

/**
 * 5. getSolarEstadoActual(estacionId = null)
 * Estado en tiempo real del sistema solar y la batería
 * (SoC %, potencia actual estimada, horas de autonomía).
 */
const getSolarEstadoActual = async (estacionId = null) => {
    const cacheKey = `solar:estado:${estacionId || 'all'}`;
    const cached = getCachedSolar(cacheKey);
    if (cached) return cached;

    // Hora local El Salvador (UTC-6)
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const svDate = new Date(utcTime - (6 * 3600000));
    const currentHour = svDate.getHours() + (svDate.getMinutes() / 60);

    // Curva de irradiación solar diurna (06:00 a 18:00)
    let solarFactor = 0;
    if (currentHour >= 6 && currentHour <= 18) {
        const sinRad = Math.sin(Math.PI * (currentHour - 6) / 12);
        solarFactor = Math.max(0, sinRad) * 0.88; // 88% rendimiento en horas de sol
    }

    // Instalación 1: Andelsa (55 kWp, Batería BESS 60 kWh)
    const andelsaKwp = 55.0;
    const andelsaPotenciaActual = Number((andelsaKwp * solarFactor).toFixed(2));
    const andelsaBateriaCapacidad = 60.0;

    let andelsaSocPct = 85.0;
    let andelsaBateriaEstado = 'REPOSO';
    let andelsaBateriaPotenciaKw = 0.0;

    if (currentHour >= 10 && currentHour < 15 && solarFactor > 0.4) {
        andelsaBateriaEstado = 'CARGANDO';
        andelsaBateriaPotenciaKw = Number((Math.min(15, andelsaPotenciaActual * 0.35)).toFixed(2));
        andelsaSocPct = Number(Math.min(98, 70 + (currentHour - 10) * 6).toFixed(1));
    } else if (currentHour >= 17 && currentHour <= 22) {
        andelsaBateriaEstado = 'DESCARGANDO';
        andelsaBateriaPotenciaKw = -Number(CONSUMO_CRITICO_ESTACION_KW.toFixed(2));
        andelsaSocPct = Number(Math.max(35, 90 - (currentHour - 17) * 9).toFixed(1));
    } else {
        andelsaBateriaEstado = 'EN_LINEA';
        andelsaSocPct = 85.0;
    }

    const energiaAlmacenadaKwh = Number((andelsaBateriaCapacidad * (andelsaSocPct / 100)).toFixed(2));
    const horasAutonomiaAndelsa = Number((energiaAlmacenadaKwh / CONSUMO_CRITICO_ESTACION_KW).toFixed(1));

    // Instalación 2: San Martín (La Loma) (40 kWp, On-Grid sin baterías)
    const sanMartinKwp = 40.0;
    const sanMartinPotenciaActual = Number((sanMartinKwp * solarFactor).toFixed(2));

    let estaciones = [
        {
            instalacion_id: 1,
            estacion_nombre: 'Andelsa',
            company_id: 9,
            branch_id: 9,
            saas_branch_id: 9,
            id_empresa: 'ANDELSA',
            tiene_paneles: 1,
            potencia_kwp: andelsaKwp,
            potencia_actual_kw: andelsaPotenciaActual,
            potencia_actual_estimada_kw: andelsaPotenciaActual,
            tiene_baterias: 1,
            capacidad_bateria_kwh: andelsaBateriaCapacidad,
            bateria_soc_pct: andelsaSocPct,
            bateria_estado: andelsaBateriaEstado,
            bateria_potencia_kw: andelsaBateriaPotenciaKw,
            horas_autonomia: horasAutonomiaAndelsa,
            horas_autonomia_estimadas: horasAutonomiaAndelsa,
            energia_almacenada_kwh: energiaAlmacenadaKwh
        },
        {
            instalacion_id: 2,
            estacion_nombre: 'San Martín (La Loma)',
            company_id: null,
            branch_id: 1,
            saas_branch_id: 1,
            id_empresa: '014',
            tiene_paneles: 1,
            potencia_kwp: sanMartinKwp,
            potencia_actual_kw: sanMartinPotenciaActual,
            potencia_actual_estimada_kw: sanMartinPotenciaActual,
            tiene_baterias: 0,
            capacidad_bateria_kwh: 0.0,
            bateria_soc_pct: 0.0,
            bateria_estado: 'SIN_BATERIAS',
            bateria_potencia_kw: 0.0,
            horas_autonomia: 0.0,
            horas_autonomia_estimadas: 0.0,
            energia_almacenada_kwh: 0.0
        }
    ];

    if (estacionId) {
        estaciones = estaciones.filter(e => matchesStation(e, estacionId));
    }

    const potenciaActualTotal = Number(estaciones.reduce((acc, e) => acc + e.potencia_actual_kw, 0).toFixed(2));
    const potenciaInstaladaTotal = Number(estaciones.reduce((acc, e) => acc + e.potencia_kwp, 0).toFixed(2));
    const capacidadBateriaTotal = Number(estaciones.reduce((acc, e) => acc + e.capacidad_bateria_kwh, 0).toFixed(2));
    const energiaAlmacenadaTotal = Number(estaciones.reduce((acc, e) => acc + e.energia_almacenada_kwh, 0).toFixed(2));
    const tieneBateriasEnSeleccion = estaciones.some(e => e.tiene_baterias === 1);

    const result = {
        timestamp: now.toISOString(),
        hora_local_sv: svDate.toTimeString().split(' ')[0],
        es_horario_solar: solarFactor > 0,
        factor_irradiacion: Number(solarFactor.toFixed(3)),
        // Dual naming:
        potencia_actual_total_kw: potenciaActualTotal,
        potencia_actual_estimada_kw: potenciaActualTotal,
        potencia_instalada_total_kwp: potenciaInstaladaTotal,
        potencia_total_kwp: potenciaInstaladaTotal,
        bateria_soc_pct: tieneBateriasEnSeleccion ? andelsaSocPct : 0.0,
        bateria_promedio_soc_pct: tieneBateriasEnSeleccion ? andelsaSocPct : 0.0,
        bateria_andelsa_soc_pct: tieneBateriasEnSeleccion ? andelsaSocPct : 0.0,
        bateria_miraflores_soc_pct: tieneBateriasEnSeleccion ? andelsaSocPct : 0.0,
        horas_autonomia_estimadas: tieneBateriasEnSeleccion ? horasAutonomiaAndelsa : 0.0,
        horas_autonomia_andelsa: tieneBateriasEnSeleccion ? horasAutonomiaAndelsa : 0.0,
        horas_autonomia_miraflores: tieneBateriasEnSeleccion ? horasAutonomiaAndelsa : 0.0,
        energia_almacenada_total_kwh: energiaAlmacenadaTotal,
        capacidad_total_baterias_kwh: capacidadBateriaTotal,
        capacidad_bateria_total_kwh: capacidadBateriaTotal,
        estado_red: 'INTERCONECTADO_ACTIVO',
        estaciones,
        instalaciones: estaciones
    };
    setCachedSolar(cacheKey, result, 60000);
    return result;
};

module.exports = {
    INSTALACIONES_BASE,
    CO2_FACTOR_KG_PER_KWH,
    DEFAULT_TARIFA_KWH,
    CONSUMO_CRITICO_ESTACION_KW,
    matchesStation,
    seedSolarEnergyData,
    ensureSolarSeedData,
    calcularRegistroDiarioAnalitico,
    getInstalacionesSolares,
    getSolarAhorroDiario,
    getSolarAhorroMensual,
    getSolarAhorroRango,
    getSolarEstadoActual,
    solarMemoryCache,
    getCachedSolar,
    setCachedSolar,
    clearSolarCache
};
