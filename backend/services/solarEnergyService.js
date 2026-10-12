const { getDb, withRetry } = require('../db');

/**
 * Constantes de referencia para energía solar y medioambiente (El Salvador)
 */
const CO2_FACTOR_KG_PER_KWH = 0.385; // Factor de emisión medio de red eléctrica en El Salvador
const DEFAULT_TARIFA_KWH = 0.1800;   // Tarifa comercial estándar ($/kWh)
const CONSUMO_CRITICO_ESTACION_KW = 5.5; // Potencia promedio de cargas críticas (POS, luminarias, bombas, servidores)

/**
 * Instalaciones base de la red SIPE
 */
const INSTALACIONES_BASE = [
    {
        id: 1,
        branch_id: 4,
        saas_branch_id: 4,
        id_empresa: '002',
        estacion_nombre: 'Puma Miraflores',
        tiene_paneles: 1,
        potencia_kwp: 45.0,
        tiene_baterias: 1,
        capacidad_bateria_kwh: 60.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    },
    {
        id: 2,
        branch_id: 8,
        saas_branch_id: 8,
        id_empresa: '008',
        estacion_nombre: 'Puma Costa del Sol',
        tiene_paneles: 1,
        potencia_kwp: 35.0,
        tiene_baterias: 0,
        capacidad_bateria_kwh: 0.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    },
    {
        id: 3,
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
        id: 4,
        branch_id: 1,
        saas_branch_id: 1,
        id_empresa: '014',
        estacion_nombre: 'Puma La Loma (San Martín)',
        tiene_paneles: 0,
        potencia_kwp: 0.0,
        tiene_baterias: 0,
        capacidad_bateria_kwh: 0.0,
        tarifa_kwh: DEFAULT_TARIFA_KWH,
        activo: 1
    },
    {
        id: 5,
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
 * Función pseudo-aleatoria determinista según fecha y semilla para simulación realista
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
            autoconsumo_kwh: 0,
            bateria_carga_kwh: 0,
            bateria_descarga_kwh: 0,
            bateria_soc_pct: 0,
            ahorro_usd: 0,
            co2_evitado_kg: 0
        };
    }

    const varFactor = getDeterministicVariation(dateStr, instalacion.branch_id);
    const kwp = Number(instalacion.potencia_kwp) || 35.0;
    const tarifa = Number(instalacion.tarifa_kwh) || DEFAULT_TARIFA_KWH;

    // Horas solar pico (HSP): 4.8 a 5.3 horas en El Salvador
    const hsp = 4.8 + (varFactor * 0.5);
    const generacion_kwh = Number((kwp * hsp).toFixed(2));

    let autoconsumo_kwh = 0;
    let bateria_carga_kwh = 0;
    let bateria_descarga_kwh = 0;
    let bateria_soc_pct = 0;

    if (instalacion.tiene_baterias && Number(instalacion.capacidad_bateria_kwh) > 0) {
        // Miraflores: 45 kWp con 60 kWh de baterías
        // Autoconsumo directo durante el día (~76% de la generación)
        autoconsumo_kwh = Number((generacion_kwh * (0.75 + varFactor * 0.04)).toFixed(2));
        // El excedente se destina a cargar las baterías (45-52 kWh)
        const excedente = Math.max(0, generacion_kwh - autoconsumo_kwh);
        bateria_carga_kwh = Number(Math.min(55, excedente).toFixed(2));
        // Descarga vespertina/nocturna durante horas pico (eficiencia ~90%)
        bateria_descarga_kwh = Number((bateria_carga_kwh * 0.88).toFixed(2));
        // Estado de carga al final de la jornada / vespertino: 82% a 89% (promedio 85%)
        bateria_soc_pct = Number((82.0 + varFactor * 6.5).toFixed(2));
    } else {
        // Costa del Sol: 35 kWp sin baterías (100% autoconsumo diurno de cargas y bombas)
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
        branch_id: instalacion.branch_id,
        saas_branch_id: instalacion.saas_branch_id,
        id_empresa: instalacion.id_empresa,
        tiene_paneles: instalacion.tiene_paneles,
        potencia_kwp: kwp,
        tiene_baterias: instalacion.tiene_baterias,
        capacidad_bateria_kwh: Number(instalacion.capacidad_bateria_kwh) || 0,
        tarifa_kwh: tarifa,
        fecha: dateStr,
        generacion_kwh,
        autoconsumo_kwh,
        bateria_carga_kwh,
        bateria_descarga_kwh,
        bateria_soc_pct,
        ahorro_usd,
        co2_evitado_kg
    };
}

/**
 * Siembra de datos iniciales en la base de datos para los últimos 30 días
 */
async function seedSolarEnergyData(poolOrConn = null) {
    const db = poolOrConn || getDb();
    if (!db) {
        console.warn('[SolarEnergyService] No database connection available for seeding.');
        return false;
    }

    try {
        // 1. Asegurar instalaciones base
        for (const inst of INSTALACIONES_BASE) {
            await db.query(`
                INSERT INTO energia_instalaciones 
                (id, id_empresa, estacion_nombre, branch_id, saas_branch_id, tiene_paneles, potencia_kwp, tiene_baterias, capacidad_bateria_kwh, tarifa_kwh, activo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    id_empresa = VALUES(id_empresa),
                    estacion_nombre = VALUES(estacion_nombre),
                    tiene_paneles = VALUES(tiene_paneles),
                    potencia_kwp = VALUES(potencia_kwp),
                    tiene_baterias = VALUES(tiene_baterias),
                    capacidad_bateria_kwh = VALUES(capacidad_bateria_kwh),
                    tarifa_kwh = VALUES(tarifa_kwh),
                    activo = VALUES(activo)
            `, [
                inst.id,
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
        }

        // 2. Comprobar si existen registros de los últimos 30 días
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDateStr = thirtyDaysAgo.toISOString().split('T')[0];

        const [countRows] = await db.query(
            'SELECT COUNT(*) as count FROM energia_registros_diarios WHERE fecha >= ?',
            [startDateStr]
        );

        if (countRows[0]?.count >= 40) {
            // Ya hay suficiente historial
            return true;
        }

        console.log('[SolarEnergyService] Sembrando historial solar para los últimos 30 días...');

        // Generar para los últimos 30 días hasta hoy
        for (let i = 30; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];

            for (const inst of INSTALACIONES_BASE) {
                if (!inst.tiene_paneles) continue; // Solo guardar registros de estaciones con paneles
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
                    reg.instalacion_id,
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

/**
 * Normaliza y empareja un identificador de estación flexible (id, branch_id, id_empresa, nombre)
 */
function matchesStation(inst, identifier) {
    if (!identifier) return true;
    const clean = String(identifier).trim().toLowerCase();
    return (
        String(inst.id) === clean ||
        String(inst.branch_id) === clean ||
        String(inst.saas_branch_id) === clean ||
        String(inst.id_empresa) === clean ||
        inst.estacion_nombre.toLowerCase().includes(clean)
    );
}

/**
 * 1. getInstalacionesSolares()
 * Lista las 2 ubicaciones con paneles y la 1 con baterías, junto con el resumen general.
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
    } catch (err) {
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
 * CO2 evitado y desglose por estación.
 */
const getSolarAhorroDiario = async (targetDate, estacionId = null) => {
    let dateStr = targetDate;
    if (!dateStr) {
        dateStr = new Date().toISOString().split('T')[0];
    } else if (dateStr instanceof Date) {
        dateStr = dateStr.toISOString().split('T')[0];
    }

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
                WHERE r.fecha = ?
            `;
            const params = [dateStr];

            if (estacionId) {
                sql += ' AND (i.id = ? OR i.branch_id = ? OR i.saas_branch_id = ? OR i.id_empresa = ? OR i.estacion_nombre LIKE ?)';
                params.push(estacionId, estacionId, estacionId, estacionId, `%${estacionId}%`);
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
                    autoconsumo_kwh: Number(r.autoconsumo_kwh),
                    bateria_carga_kwh: Number(r.bateria_carga_kwh),
                    bateria_descarga_kwh: Number(r.bateria_descarga_kwh),
                    bateria_soc_pct: Number(r.bateria_soc_pct),
                    ahorro_usd: Number(r.ahorro_usd),
                    co2_evitado_kg: Number(r.co2_evitado_kg)
                }));
            }
        }
    } catch (err) {
        // En caso de fallo de BD, usaremos el fallback analítico
        dataSource = 'fallback_analitico';
    }

    if (records.length === 0) {
        dataSource = 'fallback_analitico';
        // Generar registros analíticos para las instalaciones con paneles filtradas
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

    return {
        fecha: dateStr,
        origen_datos: dataSource,
        generacion_total_kwh,
        autoconsumo_total_kwh,
        bateria_carga_total_kwh,
        bateria_descarga_total_kwh,
        ahorro_total_usd,
        co2_evitado_total_kg,
        total_estaciones_activas: records.length,
        desglose_por_estacion: records
    };
};

/**
 * 3. getSolarAhorroMensual(year, month, estacionId = null)
 * Acumula el ahorro del mes completo (ej. octubre 2026), días transcurridos, promedio diario de ahorro.
 */
const getSolarAhorroMensual = async (year, month, estacionId = null) => {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || (new Date().getMonth() + 1);
    const monthPadded = String(m).padStart(2, '0');
    const startMonthStr = `${y}-${monthPadded}-01`;

    // Último día del mes o fecha actual si es el mes en curso
    const lastDayOfMonth = new Date(y, m, 0).getDate();
    const now = new Date();
    const isCurrentMonth = (y === now.getFullYear() && m === (now.getMonth() + 1));
    const currentDay = isCurrentMonth ? now.getDate() : lastDayOfMonth;
    const endMonthStr = `${y}-${monthPadded}-${String(currentDay).padStart(2, '0')}`;

    const rangoResult = await getSolarAhorroRango(startMonthStr, endMonthStr, estacionId);

    return {
        anio: y,
        mes: m,
        periodo: `${y}-${monthPadded}`,
        fecha_inicio: startMonthStr,
        fecha_corte: endMonthStr,
        dias_transcurridos: rangoResult.dias_analizados,
        dias_totales_mes: lastDayOfMonth,
        ahorro_total_usd: rangoResult.ahorro_total_usd,
        promedio_diario_ahorro_usd: rangoResult.promedio_diario_ahorro_usd,
        generacion_total_kwh: rangoResult.generacion_total_kwh,
        autoconsumo_total_kwh: rangoResult.autoconsumo_total_kwh,
        bateria_descarga_total_kwh: rangoResult.bateria_descarga_total_kwh,
        co2_evitado_total_kg: rangoResult.co2_evitado_total_kg,
        desglose_por_estacion: rangoResult.desglose_por_estacion,
        historico_diario: rangoResult.historico_diario
    };
};

/**
 * 4. getSolarAhorroRango(startDate, endDate, estacionId = null)
 * Ahorro acumulado entre dos fechas.
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
                WHERE r.fecha BETWEEN ? AND ?
            `;
            const params = [dStart, dEnd];

            if (estacionId) {
                sql += ' AND (i.id = ? OR i.branch_id = ? OR i.saas_branch_id = ? OR i.id_empresa = ? OR i.estacion_nombre LIKE ?)';
                params.push(estacionId, estacionId, estacionId, estacionId, `%${estacionId}%`);
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
                    autoconsumo_kwh: Number(r.autoconsumo_kwh),
                    bateria_carga_kwh: Number(r.bateria_carga_kwh),
                    bateria_descarga_kwh: Number(r.bateria_descarga_kwh),
                    bateria_soc_pct: Number(r.bateria_soc_pct),
                    ahorro_usd: Number(r.ahorro_usd),
                    co2_evitado_kg: Number(r.co2_evitado_kg)
                }));
            }
        }
    } catch (err) {
        dataSource = 'fallback_analitico';
    }

    if (dailyRows.length === 0) {
        dataSource = 'fallback_analitico';
        // Generar días analíticos entre dStart y dEnd
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

    // Agrupación por fecha para resumen cronológico
    const mapPorFecha = {};
    const mapPorEstacion = {};

    dailyRows.forEach(r => {
        const f = r.fecha;
        if (!mapPorFecha[f]) {
            mapPorFecha[f] = {
                fecha: f,
                generacion_kwh: 0,
                autoconsumo_kwh: 0,
                bateria_descarga_kwh: 0,
                ahorro_usd: 0,
                co2_evitado_kg: 0
            };
        }
        mapPorFecha[f].generacion_kwh = Number((mapPorFecha[f].generacion_kwh + r.generacion_kwh).toFixed(2));
        mapPorFecha[f].autoconsumo_kwh = Number((mapPorFecha[f].autoconsumo_kwh + r.autoconsumo_kwh).toFixed(2));
        mapPorFecha[f].bateria_descarga_kwh = Number((mapPorFecha[f].bateria_descarga_kwh + r.bateria_descarga_kwh).toFixed(2));
        mapPorFecha[f].ahorro_usd = Number((mapPorFecha[f].ahorro_usd + r.ahorro_usd).toFixed(2));
        mapPorFecha[f].co2_evitado_kg = Number((mapPorFecha[f].co2_evitado_kg + r.co2_evitado_kg).toFixed(2));

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
                autoconsumo_total_kwh: 0,
                bateria_descarga_total_kwh: 0,
                ahorro_total_usd: 0,
                co2_evitado_total_kg: 0,
                dias_registrados: 0
            };
        }
        mapPorEstacion[estKey].generacion_total_kwh = Number((mapPorEstacion[estKey].generacion_total_kwh + r.generacion_kwh).toFixed(2));
        mapPorEstacion[estKey].autoconsumo_total_kwh = Number((mapPorEstacion[estKey].autoconsumo_total_kwh + r.autoconsumo_kwh).toFixed(2));
        mapPorEstacion[estKey].bateria_descarga_total_kwh = Number((mapPorEstacion[estKey].bateria_descarga_total_kwh + r.bateria_descarga_kwh).toFixed(2));
        mapPorEstacion[estKey].ahorro_total_usd = Number((mapPorEstacion[estKey].ahorro_total_usd + r.ahorro_usd).toFixed(2));
        mapPorEstacion[estKey].co2_evitado_total_kg = Number((mapPorEstacion[estKey].co2_evitado_total_kg + r.co2_evitado_kg).toFixed(2));
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

    return {
        fecha_inicio: dStart,
        fecha_fin: dEnd,
        origen_datos: dataSource,
        dias_analizados,
        ahorro_total_usd,
        promedio_diario_ahorro_usd,
        generacion_total_kwh,
        autoconsumo_total_kwh,
        bateria_descarga_total_kwh,
        co2_evitado_total_kg,
        desglose_por_estacion,
        historico_diario
    };
};

/**
 * 5. getSolarEstadoActual()
 * Estado en tiempo real del sistema solar y la batería
 * (SoC %, potencia actual estimada, horas de autonomía).
 */
const getSolarEstadoActual = async () => {
    // Hora local El Salvador (UTC-6)
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const svDate = new Date(utcTime - (6 * 3600000));
    const currentHour = svDate.getHours() + (svDate.getMinutes() / 60);

    // Curva de irradiación solar diurna (06:00 a 18:00)
    let solarFactor = 0;
    if (currentHour >= 6 && currentHour <= 18) {
        const sinRad = Math.sin(Math.PI * (currentHour - 6) / 12);
        solarFactor = Math.max(0, sinRad) * 0.88; // 88% de rendimiento nominal bajo sol
    }

    // Instalación 1: Puma Miraflores (45 kWp, Batería 60 kWh)
    const mirafloresKwp = 45.0;
    const mirafloresPotenciaActual = Number((mirafloresKwp * solarFactor).toFixed(2));
    const mirafloresBateriaCapacidad = 60.0;

    // Perfil dinámico de la batería según la hora del día
    let mirafloresSocPct = 85.0; // Valor nominal representativo
    let mirafloresBateriaEstado = 'REPOSO';
    let mirafloresBateriaPotenciaKw = 0.0;

    if (currentHour >= 10 && currentHour < 15 && solarFactor > 0.4) {
        // En horas centrales de sol, la batería está cargando el excedente
        mirafloresBateriaEstado = 'CARGANDO';
        mirafloresBateriaPotenciaKw = Number((Math.min(12, mirafloresPotenciaActual * 0.35)).toFixed(2));
        mirafloresSocPct = Number(Math.min(98, 70 + (currentHour - 10) * 6).toFixed(1));
    } else if (currentHour >= 17 && currentHour <= 22) {
        // En horas pico de la tarde/noche, la batería se descarga activamente
        mirafloresBateriaEstado = 'DESCARGANDO';
        mirafloresBateriaPotenciaKw = -Number(CONSUMO_CRITICO_ESTACION_KW.toFixed(2));
        mirafloresSocPct = Number(Math.max(35, 90 - (currentHour - 17) * 9).toFixed(1));
    } else {
        // En espera con reserva
        mirafloresBateriaEstado = 'EN_LINEA';
        mirafloresSocPct = 85.0;
    }

    // Horas de autonomía estimadas de la batería para cargas críticas de la estación:
    // Energía almacenada disponible = Capacidad (60 kWh) * (SoC% / 100)
    const energiaAlmacenadaKwh = Number((mirafloresBateriaCapacidad * (mirafloresSocPct / 100)).toFixed(2));
    const horasAutonomiaMiraflores = Number((energiaAlmacenadaKwh / CONSUMO_CRITICO_ESTACION_KW).toFixed(1));

    // Instalación 2: Puma Costa del Sol (35 kWp, Sin Baterías)
    const costaKwp = 35.0;
    const costaPotenciaActual = Number((costaKwp * solarFactor).toFixed(2));

    const potenciaActualTotal = Number((mirafloresPotenciaActual + costaPotenciaActual).toFixed(2));

    return {
        timestamp: now.toISOString(),
        hora_local_sv: svDate.toTimeString().split(' ')[0],
        es_horario_solar: solarFactor > 0,
        factor_irradiacion: Number(solarFactor.toFixed(3)),
        potencia_actual_total_kw: potenciaActualTotal,
        potencia_instalada_total_kwp: 80.0,
        bateria_soc_pct: mirafloresSocPct,
        horas_autonomia_estimadas: horasAutonomiaMiraflores,
        energia_almacenada_total_kwh: energiaAlmacenadaKwh,
        capacidad_total_baterias_kwh: mirafloresBateriaCapacidad,
        estado_red: 'INTERCONECTADO_ACTIVO',
        estaciones: [
            {
                instalacion_id: 1,
                estacion_nombre: 'Puma Miraflores',
                branch_id: 4,
                saas_branch_id: 4,
                id_empresa: '002',
                tiene_paneles: 1,
                potencia_kwp: mirafloresKwp,
                potencia_actual_kw: mirafloresPotenciaActual,
                tiene_baterias: 1,
                capacidad_bateria_kwh: mirafloresBateriaCapacidad,
                bateria_soc_pct: mirafloresSocPct,
                bateria_estado: mirafloresBateriaEstado,
                bateria_potencia_kw: mirafloresBateriaPotenciaKw,
                horas_autonomia: horasAutonomiaMiraflores,
                energia_almacenada_kwh: energiaAlmacenadaKwh
            },
            {
                instalacion_id: 2,
                estacion_nombre: 'Puma Costa del Sol',
                branch_id: 8,
                saas_branch_id: 8,
                id_empresa: '008',
                tiene_paneles: 1,
                potencia_kwp: costaKwp,
                potencia_actual_kw: costaPotenciaActual,
                tiene_baterias: 0,
                capacidad_bateria_kwh: 0.0,
                bateria_soc_pct: 0.0,
                bateria_estado: 'SIN_BATERIAS',
                bateria_potencia_kw: 0.0,
                horas_autonomia: 0.0,
                energia_almacenada_kwh: 0.0
            }
        ]
    };
};

module.exports = {
    INSTALACIONES_BASE,
    CO2_FACTOR_KG_PER_KWH,
    DEFAULT_TARIFA_KWH,
    CONSUMO_CRITICO_ESTACION_KW,
    seedSolarEnergyData,
    calcularRegistroDiarioAnalitico,
    getInstalacionesSolares,
    getSolarAhorroDiario,
    getSolarAhorroMensual,
    getSolarAhorroRango,
    getSolarEstadoActual
};
