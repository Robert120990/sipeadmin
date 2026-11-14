const dbModule = require('../db');
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const withRetry = (...args) => dbModule.withRetry(...args);
const {
    getCleanStationName,
    getCleanTiendaName,
    branchToEmpId,
    normalizeSaasBranchId,
    OFFICIAL_ESTACIONES
} = require('./consultasCatalog');

const normalizeStationName = (name) => {
    if (!name) return '';
    return name
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(ESTACION DE SERVICIO|ESTACION|ES|E-MARKET|EMARKET|TIENDA|PISTA|MARKET|DE SERVICIO|PUMA|SHELL|SUPER 7|SUPER7|SELECT|UNO|TEXACO)\b/gi, '')
        .replace(/[^A-Z0-9]/g, '')
        .trim();
};

const getResumenMensualData = async (externalDb, yearNum, monthNum, accountingDbParam = undefined) => {
    const y = parseInt(yearNum, 10);
    const m = parseInt(monthNum, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12 || y < 2000 || y > 2100) {
        throw new Error('Año o mes inválido');
    }

    const monthStr = String(m).padStart(2, '0');
    const daysInMonth = new Date(y, m, 0).getDate();
    const startDate = `${y}-${monthStr}-01`;
    const endDate = `${y}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    // 1. Obtener base contable / SaaS (accountingDb) si no fue inyectada explícitamente
    const accountingDb = accountingDbParam !== undefined
        ? accountingDbParam
        : (process.env.NODE_ENV === 'test' ? null : await getAccountingDb().catch(() => null));

    if (accountingDb) {
        try {
            const sqlSaasEstaciones = `
                SELECT 
                    b.id as id_empresa,
                    b.nombre as empresa,
                    COALESCE(SUM(r.diferencia), 0.0) as galonaje,
                    COALESCE(SUM(r.monto), 0.0) as venta_estacion,
                    COALESCE(SUM(CASE WHEN (r.codigo_producto LIKE '%DIE%' AND r.codigo_producto NOT LIKE '%ION%') OR p.tipo_combustible IN (3, 5) OR (p.nombre LIKE '%DIESEL%' AND p.nombre NOT LIKE '%ION%') THEN r.diferencia ELSE 0 END), 0.0) as diesel,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%REG%' OR p.tipo_combustible = 1 OR p.nombre LIKE '%REGULAR%' THEN r.diferencia ELSE 0 END), 0.0) as regular,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%SUP%' OR p.tipo_combustible = 2 OR p.nombre LIKE '%SUPER%' THEN r.diferencia ELSE 0 END), 0.0) as super,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%ION%' OR p.tipo_combustible = 4 OR p.nombre LIKE '%ION%' THEN r.diferencia ELSE 0 END), 0.0) as ion
                FROM branches b
                JOIN gas_station_closeouts c ON b.id = c.branch_id
                JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
                LEFT JOIN products p ON r.product_id = p.id
                WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
                GROUP BY b.id, b.nombre
                ORDER BY b.id
            `;
            const [saasEstRows] = await withRetry(() => accountingDb.query(sqlSaasEstaciones, [startDate, endDate]));

            if (saasEstRows && saasEstRows.length > 0) {
                const sqlSaasTiendas = `
                    SELECT 
                        b.id as id_empresa,
                        b.nombre as empresa,
                        COALESCE(SUM(s.total_sales), 0.0) as venta,
                        COUNT(DISTINCT DATE(s.shift_date)) as dias_con_venta,
                        ROUND(COALESCE(SUM(s.total_sales), 0.0) / GREATEST(COUNT(DISTINCT DATE(s.shift_date)), 1), 2) as promedio_diario
                    FROM branches b
                    JOIN pos_shifts s ON b.id = s.branch_id
                    JOIN points_of_sale p ON s.pos_id = p.id
                    WHERE s.status = 'closed' 
                      AND DATE(s.shift_date) BETWEEN ? AND ?
                      AND (p.nombre LIKE '%Tienda%' OR p.nombre LIKE '%Super%')
                    GROUP BY b.id, b.nombre
                    ORDER BY b.id
                `;
                let [saasTiendasRows] = await withRetry(() => accountingDb.query(sqlSaasTiendas, [startDate, endDate])).catch(() => [[]]);
                if (!saasTiendasRows || saasTiendasRows.length === 0) {
                    try {
                        const sqlSaasTiendasFallback = `
                            SELECT 
                                b.id as id_empresa,
                                b.nombre as empresa,
                                COALESCE(SUM(sh.total), 0.0) as venta,
                                COUNT(DISTINCT DATE(sh.fecha_emision)) as dias_con_venta,
                                ROUND(COALESCE(SUM(sh.total), 0.0) / GREATEST(COUNT(DISTINCT DATE(sh.fecha_emision)), 1), 2) as promedio_diario
                            FROM branches b
                            JOIN sales_headers sh ON b.id = sh.branch_id
                            WHERE DATE(sh.fecha_emision) BETWEEN ? AND ?
                            GROUP BY b.id, b.nombre
                            ORDER BY b.id
                        `;
                        const [fallbackRows] = await withRetry(() => accountingDb.query(sqlSaasTiendasFallback, [startDate, endDate]));
                        if (fallbackRows && fallbackRows.length > 0) {
                            saasTiendasRows = fallbackRows;
                        }
                    } catch {
                        /* ignore */
                    }
                }

                const estacionesMap = new Map();
                saasEstRows.forEach(row => {
                    const normBranch = normalizeSaasBranchId(row.id_empresa);
                    const matchedOfficial = OFFICIAL_ESTACIONES.find(st => st.branch_id === normBranch || String(st.id_empresa) === String(row.id_empresa));
                    const empKey = String(matchedOfficial ? matchedOfficial.id_empresa : row.id_empresa);
                    const cleanName = getCleanStationName(empKey, row.empresa) || (matchedOfficial ? matchedOfficial.titulo : row.empresa);
                    const existing = estacionesMap.get(empKey) || {
                        id_empresa: empKey,
                        empresa: cleanName,
                        diesel: 0,
                        regular: 0,
                        super: 0,
                        ion: 0,
                        galonaje: 0,
                        venta: 0
                    };
                    existing.diesel = Math.round((existing.diesel + Number(row.diesel || 0)) * 100) / 100;
                    existing.regular = Math.round((existing.regular + Number(row.regular || 0)) * 100) / 100;
                    existing.super = Math.round((existing.super + Number(row.super || 0)) * 100) / 100;
                    existing.ion = Math.round((existing.ion + Number(row.ion || 0)) * 100) / 100;
                    existing.galonaje = Math.round((existing.galonaje + Number(row.galonaje || 0)) * 100) / 100;
                    existing.venta = Math.round((existing.venta + Number(row.venta_estacion || 0)) * 100) / 100;
                    estacionesMap.set(empKey, existing);
                });

                const tiendasMap = new Map();
                (saasTiendasRows || []).forEach(row => {
                    const empId = branchToEmpId[row.id_empresa] || String(row.id_empresa);
                    const storeName = getCleanTiendaName(empId, row.empresa) || row.empresa;
                    const venta = Math.round(Number(row.venta || 0) * 100) / 100;
                    const dias = Number(row.dias_con_venta || 0);
                    const prom = dias > 0 ? Math.round((venta / dias) * 100) / 100 : Math.round(Number(row.promedio_diario || 0) * 100) / 100;
                    tiendasMap.set(empId, {
                        id_empresa: empId,
                        empresa: storeName,
                        venta,
                        dias_con_venta: dias,
                        promedio_diario: prom
                    });
                });

                // Complementar con db_system_rrs (ej. tiendas Miraflores 002 y Costa del Sol 008 o meses de transición)
                if (externalDb && typeof externalDb.query === 'function') {
                    try {
                        const datesArr = [];
                        for (let d = 1; d <= daysInMonth; d++) {
                            datesArr.push(`${String(d).padStart(2, '0')}/${monthStr}/${y}`);
                        }
                        const sqlLegEst = `
                            SELECT a.id_empresa, a.titulo, a.orden,
                                   IFNULL(SUM(IF(d.clasificacion = 'D', b.total, 0.0)), 0.0) as diesel, 
                                   IFNULL(SUM(IF(d.clasificacion = 'R', b.total, 0.0)), 0.0) as regular, 
                                   IFNULL(SUM(IF(d.clasificacion = 'S', b.total, 0.0)), 0.0) as super, 
                                   IFNULL(SUM(IF(d.clasificacion = 'I', b.total, 0.0)), 0.0) as ion, 
                                   IFNULL(SUM(b.total), 0.0) as galonaje, 
                                   COALESCE(SUM(b.monto), SUM(b.total * b.precio), 0.0) as monto
                            FROM web_consolidado a 
                            LEFT JOIN (
                                SELECT ct_l.id_empresa, ct_l.id_producto, ct_l.total, ct_l.precio, ct_l.monto
                                FROM cierre_turno_lecturas ct_l
                                INNER JOIN cierre_turno ct ON ct_l.id_cierre_turno = ct.id AND ct_l.id_empresa = ct.id_empresa
                                WHERE ct.fecha_turno IN (?)
                            ) b ON a.id_empresa = b.id_empresa
                            LEFT JOIN cfg_combustibles d ON b.id_empresa = d.id_empresa AND b.id_producto = d.id_producto
                            WHERE a.grupo = 'ESTACION' AND a.id_empresa != '004'
                            GROUP BY a.id_empresa, a.titulo, a.orden
                            ORDER BY a.orden
                        `;
                        const sqlLegTda = `
                            SELECT a.id_empresa, a.titulo, a.orden, 
                                   IFNULL(SUM(b.monto), 0.0) as monto,
                                   COUNT(DISTINCT IF(b.monto > 0, b.fecha, NULL)) as dias_con_venta,
                                   IFNULL(AVG(IF(b.monto > 0, b.monto, NULL)), 0.0) as promedio_diario
                            FROM web_consolidado a 
                            LEFT JOIN ventas_tienda b ON a.id_empresa = b.id_empresa AND b.fecha BETWEEN ? AND ?
                            WHERE a.grupo = 'TIENDA' AND a.id_empresa NOT IN ('004', '022')
                            GROUP BY a.id_empresa, a.titulo, a.orden
                            ORDER BY a.orden
                        `;
                        const [[legEstRows], [legTdaRows]] = await Promise.all([
                            withRetry(() => externalDb.query(sqlLegEst, [datesArr])).catch(() => [[]]),
                            withRetry(() => externalDb.query(sqlLegTda, [startDate, endDate])).catch(() => [[]])
                        ]);

                        (legEstRows || []).forEach(leg => {
                            if (leg.id_empresa === '004') return;
                            const empKey = String(leg.id_empresa);
                            const legGal = Math.round(Number(leg.galonaje || 0) * 100) / 100;
                            const legVenta = Math.round(Number(leg.monto || 0) * 100) / 100;
                            if (legGal <= 0 && legVenta <= 0) return;
                            const existing = estacionesMap.get(empKey);
                            if (!existing || (legGal > existing.galonaje && legVenta > existing.venta)) {
                                estacionesMap.set(empKey, {
                                    id_empresa: empKey,
                                    empresa: getCleanStationName(empKey, leg.titulo),
                                    diesel: Math.round(Number(leg.diesel || 0) * 100) / 100,
                                    regular: Math.round(Number(leg.regular || 0) * 100) / 100,
                                    super: Math.round(Number(leg.super || 0) * 100) / 100,
                                    ion: Math.round(Number(leg.ion || 0) * 100) / 100,
                                    galonaje: legGal,
                                    venta: legVenta
                                });
                            }
                        });

                        (legTdaRows || []).forEach(legT => {
                            if (legT.id_empresa === '004' || legT.id_empresa === '022') return;
                            const empId = String(legT.id_empresa);
                            const legVenta = Math.round(Number(legT.monto || 0) * 100) / 100;
                            const legDias = Number(legT.dias_con_venta || 0);
                            if (legVenta <= 0 && tiendasMap.has(empId)) return;
                            const existingT = tiendasMap.get(empId);
                            if (!existingT || legVenta > existingT.venta) {
                                const prom = legDias > 0 ? Math.round((legVenta / legDias) * 100) / 100 : Math.round(Number(legT.promedio_diario || 0) * 100) / 100;
                                tiendasMap.set(empId, {
                                    id_empresa: empId,
                                    empresa: getCleanTiendaName(empId, legT.titulo),
                                    venta: legVenta,
                                    dias_con_venta: legDias,
                                    promedio_diario: prom
                                });
                            }
                        });
                    } catch (legErr) {
                        console.warn('[Ventas Mensual] Nota: no se pudo complementar con db_system_rrs:', legErr.message);
                    }
                }

                const officialOrder = ['002', '006', '008', '014', '015', '016', '009'];
                const estacionesLocal = Array.from(estacionesMap.values()).sort((a, b) => {
                    const ia = officialOrder.indexOf(String(a.id_empresa));
                    const ib = officialOrder.indexOf(String(b.id_empresa));
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return 0;
                });
                const tiendasLocal = Array.from(tiendasMap.values()).sort((a, b) => {
                    const ia = officialOrder.indexOf(String(a.id_empresa));
                    const ib = officialOrder.indexOf(String(b.id_empresa));
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return 0;
                });

                const matchedTiendaIds = new Set();
                const consolidadoLocal = estacionesLocal.map(e => {
                    let t = tiendasLocal.find(tienda => String(tienda.id_empresa) === String(e.id_empresa) && !matchedTiendaIds.has(tienda.id_empresa));
                    if (!t) {
                        const eNorm = normalizeStationName(e.empresa);
                        if (eNorm.length >= 3) {
                            t = tiendasLocal.find(tienda => !matchedTiendaIds.has(tienda.id_empresa) && normalizeStationName(tienda.empresa) === eNorm);
                        }
                    }
                    const vTienda = t ? t.venta : 0;
                    if (t) matchedTiendaIds.add(t.id_empresa);
                    return {
                        id_empresa: e.id_empresa,
                        empresa: e.empresa,
                        tienda_nombre: t ? t.empresa : '',
                        diesel: e.diesel,
                        regular: e.regular,
                        super: e.super,
                        ion: e.ion,
                        galonaje: e.galonaje,
                        venta_estacion: e.venta,
                        venta_tienda: vTienda,
                        venta_total: Math.round((e.venta + vTienda) * 100) / 100
                    };
                });

                tiendasLocal.forEach(t => {
                    if (!matchedTiendaIds.has(t.id_empresa) && t.venta > 0) {
                        consolidadoLocal.push({
                            id_empresa: t.id_empresa,
                            empresa: t.empresa,
                            tienda_nombre: t.empresa,
                            diesel: 0,
                            regular: 0,
                            super: 0,
                            ion: 0,
                            galonaje: 0,
                            venta_estacion: 0,
                            venta_tienda: t.venta,
                            venta_total: t.venta,
                            es_tienda_solo: true
                        });
                    }
                });

                const totales = {
                    diesel: Math.round(estacionesLocal.reduce((acc, c) => acc + c.diesel, 0) * 100) / 100,
                    regular: Math.round(estacionesLocal.reduce((acc, c) => acc + c.regular, 0) * 100) / 100,
                    super: Math.round(estacionesLocal.reduce((acc, c) => acc + c.super, 0) * 100) / 100,
                    ion: Math.round(estacionesLocal.reduce((acc, c) => acc + c.ion, 0) * 100) / 100,
                    galonaje: Math.round(estacionesLocal.reduce((acc, c) => acc + c.galonaje, 0) * 100) / 100,
                    venta_estacion: Math.round(estacionesLocal.reduce((acc, c) => acc + c.venta, 0) * 100) / 100,
                    venta_tienda: Math.round(tiendasLocal.reduce((acc, c) => acc + c.venta, 0) * 100) / 100,
                    venta_total: Math.round((estacionesLocal.reduce((acc, c) => acc + c.venta, 0) + tiendasLocal.reduce((acc, c) => acc + c.venta, 0)) * 100) / 100
                };

                return {
                    periodo: `${y}-${monthStr}`,
                    year: y,
                    month: m,
                    dias_mes: daysInMonth,
                    origen: 'db_sistema_saas (sys.sipesv.com)',
                    estaciones: estacionesLocal,
                    tiendas: tiendasLocal,
                    consolidado: consolidadoLocal,
                    totales
                };
            }
        } catch (errSaas) {
            console.warn('[Ventas Mensual] Error en mock SaaS:', errSaas.message);
        }
    }

    // 2. Fallback a db_system_rrs
    // Fechas en formato DD/MM/YYYY para cierre_turno.fecha_turno
    const datesArray = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const dStr = String(d).padStart(2, '0');
        datesArray.push(`${dStr}/${monthStr}/${y}`);
    }

    // Consulta de estaciones de combustible
    const sqlEstaciones = `
        SELECT a.id_empresa, a.titulo, a.orden,
               IFNULL(SUM(IF(d.clasificacion = 'D', b.total, 0.0)), 0.0) as diesel, 
               IFNULL(SUM(IF(d.clasificacion = 'R', b.total, 0.0)), 0.0) as regular, 
               IFNULL(SUM(IF(d.clasificacion = 'S', b.total, 0.0)), 0.0) as super, 
               IFNULL(SUM(IF(d.clasificacion = 'I', b.total, 0.0)), 0.0) as ion, 
               IFNULL(SUM(b.total), 0.0) as galonaje, 
               COALESCE(SUM(b.monto), SUM(b.total * b.precio), 0.0) as monto
        FROM web_consolidado a 
        LEFT JOIN (
            SELECT ct_l.id_empresa, ct_l.id_producto, ct_l.total, ct_l.precio, ct_l.monto
            FROM cierre_turno_lecturas ct_l
            INNER JOIN cierre_turno ct ON ct_l.id_cierre_turno = ct.id AND ct_l.id_empresa = ct.id_empresa
            WHERE ct.fecha_turno IN (?)
        ) b ON a.id_empresa = b.id_empresa
        LEFT JOIN cfg_combustibles d ON b.id_empresa = d.id_empresa AND b.id_producto = d.id_producto
        WHERE a.grupo = 'ESTACION' 
        GROUP BY a.id_empresa, a.titulo, a.orden
        ORDER BY a.orden
    `;
    const [estacionesRows] = await withRetry(() => externalDb.query(sqlEstaciones, [datesArray]));
    const estacionesLocal = (estacionesRows || [])
        .filter(row => row.id_empresa !== '004') // Omitir Puma El Desvío (inactiva)
        .map(row => ({
            id_empresa: String(row.id_empresa),
            empresa: getCleanStationName(String(row.id_empresa), row.titulo),
            diesel: Math.round(Number(row.diesel || 0) * 100) / 100,
            regular: Math.round(Number(row.regular || 0) * 100) / 100,
            super: Math.round(Number(row.super || 0) * 100) / 100,
            ion: Math.round(Number(row.ion || 0) * 100) / 100,
            galonaje: Math.round(Number(row.galonaje || 0) * 100) / 100,
            venta: Math.round(Number(row.monto || 0) * 100) / 100
        }));

    // Consulta de tiendas E-Market
    const sqlTiendas = `
        SELECT a.id_empresa, a.titulo, a.orden, 
               IFNULL(SUM(b.monto), 0.0) as monto,
               COUNT(DISTINCT IF(b.monto > 0, b.fecha, NULL)) as dias_con_venta,
               IFNULL(AVG(IF(b.monto > 0, b.monto, NULL)), 0.0) as promedio_diario
        FROM web_consolidado a 
        LEFT JOIN ventas_tienda b ON a.id_empresa = b.id_empresa AND b.fecha BETWEEN ? AND ?
        WHERE a.grupo = 'TIENDA' 
        GROUP BY a.id_empresa, a.titulo, a.orden
        ORDER BY a.orden
    `;
    const [tiendasRows] = await withRetry(() => externalDb.query(sqlTiendas, [startDate, endDate]));
    const tiendasLocal = (tiendasRows || [])
        .filter(row => row.id_empresa !== '004')
        .map(row => ({
            id_empresa: String(row.id_empresa),
            empresa: getCleanTiendaName(String(row.id_empresa), row.titulo),
            venta: Math.round(Number(row.monto || 0) * 100) / 100,
            dias_con_venta: Number(row.dias_con_venta || 0),
            promedio_diario: Math.round(Number(row.promedio_diario || 0) * 100) / 100
        }));

    // Consolidado por estación (vinculando Pista con Tienda correspondiente)
    const matchedTiendaIds = new Set();
    const consolidadoLocal = estacionesLocal.map(e => {
        let matchedTienda = tiendasLocal.find(t => t.id_empresa && String(t.id_empresa) === String(e.id_empresa) && !matchedTiendaIds.has(t.id_empresa));
        if (!matchedTienda) {
            const eNorm = normalizeStationName(e.empresa);
            if (eNorm.length >= 3) {
                matchedTienda = tiendasLocal.find(t => !matchedTiendaIds.has(t.id_empresa) && normalizeStationName(t.empresa) === eNorm);
            }
        }

        let ventaTienda = 0;
        let nombreTienda = '';
        if (matchedTienda) {
            ventaTienda = matchedTienda.venta;
            nombreTienda = matchedTienda.empresa;
            matchedTiendaIds.add(matchedTienda.id_empresa);
        }

        return {
            id_empresa: e.id_empresa,
            empresa: e.empresa,
            tienda_nombre: nombreTienda,
            diesel: e.diesel,
            regular: e.regular,
            super: e.super,
            ion: e.ion,
            galonaje: e.galonaje,
            venta_estacion: e.venta,
            venta_tienda: ventaTienda,
            venta_total: Math.round((e.venta + ventaTienda) * 100) / 100
        };
    });

    // Agregar tiendas no vinculadas directamente como filas independientes (solo si tienen venta > 0)
    tiendasLocal.forEach(t => {
        if (!matchedTiendaIds.has(t.id_empresa) && t.venta > 0) {
            consolidadoLocal.push({
                id_empresa: t.id_empresa,
                empresa: t.empresa,
                tienda_nombre: t.empresa,
                diesel: 0,
                regular: 0,
                super: 0,
                ion: 0,
                galonaje: 0,
                venta_estacion: 0,
                venta_tienda: t.venta,
                venta_total: t.venta,
                es_tienda_solo: true
            });
        }
    });

    const totales = {
        diesel: Math.round(estacionesLocal.reduce((acc, c) => acc + c.diesel, 0) * 100) / 100,
        regular: Math.round(estacionesLocal.reduce((acc, c) => acc + c.regular, 0) * 100) / 100,
        super: Math.round(estacionesLocal.reduce((acc, c) => acc + c.super, 0) * 100) / 100,
        ion: Math.round(estacionesLocal.reduce((acc, c) => acc + c.ion, 0) * 100) / 100,
        galonaje: Math.round(estacionesLocal.reduce((acc, c) => acc + c.galonaje, 0) * 100) / 100,
        venta_estacion: Math.round(estacionesLocal.reduce((acc, c) => acc + c.venta, 0) * 100) / 100,
        venta_tienda: Math.round(tiendasLocal.reduce((acc, c) => acc + c.venta, 0) * 100) / 100,
        venta_total: Math.round((estacionesLocal.reduce((acc, c) => acc + c.venta, 0) + tiendasLocal.reduce((acc, c) => acc + c.venta, 0)) * 100) / 100
    };

    return {
        periodo: `${y}-${monthStr}`,
        year: y,
        month: m,
        dias_mes: daysInMonth,
        origen: 'db_system_rrs (sys.sipesv.com)',
        estaciones: estacionesLocal,
        tiendas: tiendasLocal,
        consolidado: consolidadoLocal,
        totales
    };
};

const getResumenRangoVentasData = async (externalDb, startDate, endDate, accountingDbParam = undefined) => {
    if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new Error('Rango de fechas inválido (debe ser YYYY-MM-DD)');
    }

    const accountingDb = accountingDbParam !== undefined
        ? accountingDbParam
        : (process.env.NODE_ENV === 'test' ? null : await getAccountingDb().catch(() => null));

    if (accountingDb) {
        try {
            const sqlSaasEstaciones = `
                SELECT 
                    b.id as id_empresa,
                    b.nombre as empresa,
                    COALESCE(SUM(r.diferencia), 0.0) as galonaje,
                    COALESCE(SUM(r.monto), 0.0) as venta_estacion,
                    COALESCE(SUM(CASE WHEN (r.codigo_producto LIKE '%DIE%' AND r.codigo_producto NOT LIKE '%ION%') OR p.tipo_combustible IN (3, 5) OR (p.nombre LIKE '%DIESEL%' AND p.nombre NOT LIKE '%ION%') THEN r.diferencia ELSE 0 END), 0.0) as diesel,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%REG%' OR p.tipo_combustible = 1 OR p.nombre LIKE '%REGULAR%' THEN r.diferencia ELSE 0 END), 0.0) as regular,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%SUP%' OR p.tipo_combustible = 2 OR p.nombre LIKE '%SUPER%' THEN r.diferencia ELSE 0 END), 0.0) as super,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%ION%' OR p.tipo_combustible = 4 OR p.nombre LIKE '%ION%' THEN r.diferencia ELSE 0 END), 0.0) as ion
                FROM branches b
                JOIN gas_station_closeouts c ON b.id = c.branch_id
                JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
                LEFT JOIN products p ON r.product_id = p.id
                WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
                GROUP BY b.id, b.nombre
                ORDER BY b.id
            `;
            const [saasEstRows] = await withRetry(() => accountingDb.query(sqlSaasEstaciones, [startDate, endDate]));

            if (saasEstRows && saasEstRows.length > 0) {
                const sqlSaasTiendas = `
                    SELECT 
                        b.id as id_empresa,
                        b.nombre as empresa,
                        COALESCE(SUM(s.total_sales), 0.0) as venta,
                        COUNT(DISTINCT DATE(s.shift_date)) as dias_con_venta,
                        ROUND(COALESCE(SUM(s.total_sales), 0.0) / GREATEST(COUNT(DISTINCT DATE(s.shift_date)), 1), 2) as promedio_diario
                    FROM branches b
                    JOIN pos_shifts s ON b.id = s.branch_id
                    JOIN points_of_sale p ON s.pos_id = p.id
                    WHERE s.status = 'closed' 
                      AND DATE(s.shift_date) BETWEEN ? AND ?
                      AND (p.nombre LIKE '%Tienda%' OR p.nombre LIKE '%Super%')
                    GROUP BY b.id, b.nombre
                    ORDER BY b.id
                `;
                let [saasTiendasRows] = await withRetry(() => accountingDb.query(sqlSaasTiendas, [startDate, endDate])).catch(() => [[]]);
                if (!saasTiendasRows || saasTiendasRows.length === 0) {
                    try {
                        const sqlSaasTiendasFallback = `
                            SELECT 
                                b.id as id_empresa,
                                b.nombre as empresa,
                                COALESCE(SUM(sh.total), 0.0) as venta,
                                COUNT(DISTINCT DATE(sh.fecha_emision)) as dias_con_venta,
                                ROUND(COALESCE(SUM(sh.total), 0.0) / GREATEST(COUNT(DISTINCT DATE(sh.fecha_emision)), 1), 2) as promedio_diario
                            FROM branches b
                            JOIN sales_headers sh ON b.id = sh.branch_id
                            WHERE DATE(sh.fecha_emision) BETWEEN ? AND ?
                            GROUP BY b.id, b.nombre
                            ORDER BY b.id
                        `;
                        const [fallbackRows] = await withRetry(() => accountingDb.query(sqlSaasTiendasFallback, [startDate, endDate]));
                        if (fallbackRows && fallbackRows.length > 0) {
                            saasTiendasRows = fallbackRows;
                        }
                    } catch {
                        /* ignore */
                    }
                }

                const estacionesMap = new Map();
                saasEstRows.forEach(row => {
                    const normBranch = normalizeSaasBranchId(row.id_empresa);
                    const matchedOfficial = OFFICIAL_ESTACIONES.find(st => st.branch_id === normBranch || String(st.id_empresa) === String(row.id_empresa));
                    const empKey = String(matchedOfficial ? matchedOfficial.id_empresa : row.id_empresa);
                    const cleanName = getCleanStationName(empKey, row.empresa) || (matchedOfficial ? matchedOfficial.titulo : row.empresa);
                    const existing = estacionesMap.get(empKey) || {
                        id_empresa: empKey,
                        empresa: cleanName,
                        diesel: 0,
                        regular: 0,
                        super: 0,
                        ion: 0,
                        galonaje: 0,
                        venta: 0
                    };
                    existing.diesel = Math.round((existing.diesel + Number(row.diesel || 0)) * 100) / 100;
                    existing.regular = Math.round((existing.regular + Number(row.regular || 0)) * 100) / 100;
                    existing.super = Math.round((existing.super + Number(row.super || 0)) * 100) / 100;
                    existing.ion = Math.round((existing.ion + Number(row.ion || 0)) * 100) / 100;
                    existing.galonaje = Math.round((existing.galonaje + Number(row.galonaje || 0)) * 100) / 100;
                    existing.venta = Math.round((existing.venta + Number(row.venta_estacion || 0)) * 100) / 100;
                    estacionesMap.set(empKey, existing);
                });

                const tiendasMap = new Map();
                (saasTiendasRows || []).forEach(row => {
                    const empId = branchToEmpId[row.id_empresa] || String(row.id_empresa);
                    const storeName = getCleanTiendaName(empId, row.empresa) || row.empresa;
                    const venta = Math.round(Number(row.venta || 0) * 100) / 100;
                    const dias = Number(row.dias_con_venta || 0);
                    const prom = dias > 0 ? Math.round((venta / dias) * 100) / 100 : Math.round(Number(row.promedio_diario || 0) * 100) / 100;
                    tiendasMap.set(empId, {
                        id_empresa: empId,
                        empresa: storeName,
                        venta,
                        dias_con_venta: dias,
                        promedio_diario: prom
                    });
                });

                // Complementar con db_system_rrs (ej. tiendas Miraflores 002 y Costa del Sol 008 o meses de transición)
                if (externalDb && typeof externalDb.query === 'function') {
                    try {
                        const sqlLegEst = `
                            SELECT a.id_empresa, a.titulo, a.orden,
                                   IFNULL(SUM(IF(d.clasificacion = 'D', b.total, 0.0)), 0.0) as diesel, 
                                   IFNULL(SUM(IF(d.clasificacion = 'R', b.total, 0.0)), 0.0) as regular, 
                                   IFNULL(SUM(IF(d.clasificacion = 'S', b.total, 0.0)), 0.0) as super, 
                                   IFNULL(SUM(IF(d.clasificacion = 'I', b.total, 0.0)), 0.0) as ion, 
                                   IFNULL(SUM(b.total), 0.0) as galonaje, 
                                   COALESCE(SUM(b.monto), SUM(b.total * b.precio), 0.0) as monto
                            FROM web_consolidado a 
                            LEFT JOIN (
                                SELECT ct_l.id_empresa, ct_l.id_producto, ct_l.total, ct_l.precio, ct_l.monto
                                FROM cierre_turno_lecturas ct_l
                                INNER JOIN cierre_turno ct ON ct_l.id_cierre_turno = ct.id AND ct_l.id_empresa = ct.id_empresa
                                WHERE STR_TO_DATE(ct.fecha_turno, '%d/%m/%Y') BETWEEN ? AND ?
                            ) b ON a.id_empresa = b.id_empresa
                            LEFT JOIN cfg_combustibles d ON b.id_empresa = d.id_empresa AND b.id_producto = d.id_producto
                            WHERE a.grupo = 'ESTACION' AND a.id_empresa != '004'
                            GROUP BY a.id_empresa, a.titulo, a.orden
                            ORDER BY a.orden
                        `;
                        const sqlLegTda = `
                            SELECT a.id_empresa, a.titulo, a.orden, 
                                   IFNULL(SUM(b.monto), 0.0) as monto,
                                   COUNT(DISTINCT IF(b.monto > 0, b.fecha, NULL)) as dias_con_venta,
                                   IFNULL(AVG(IF(b.monto > 0, b.monto, NULL)), 0.0) as promedio_diario
                            FROM web_consolidado a 
                            LEFT JOIN ventas_tienda b ON a.id_empresa = b.id_empresa AND b.fecha BETWEEN ? AND ?
                            WHERE a.grupo = 'TIENDA' AND a.id_empresa NOT IN ('004', '022')
                            GROUP BY a.id_empresa, a.titulo, a.orden
                            ORDER BY a.orden
                        `;
                        const [[legEstRows], [legTdaRows]] = await Promise.all([
                            withRetry(() => externalDb.query(sqlLegEst, [startDate, endDate])).catch(() => [[]]),
                            withRetry(() => externalDb.query(sqlLegTda, [startDate, endDate])).catch(() => [[]])
                        ]);

                        (legEstRows || []).forEach(leg => {
                            if (leg.id_empresa === '004') return;
                            const empKey = String(leg.id_empresa);
                            const legGal = Math.round(Number(leg.galonaje || 0) * 100) / 100;
                            const legVenta = Math.round(Number(leg.monto || 0) * 100) / 100;
                            if (legGal <= 0 && legVenta <= 0) return;
                            const existing = estacionesMap.get(empKey);
                            if (!existing || (legGal > existing.galonaje && legVenta > existing.venta)) {
                                estacionesMap.set(empKey, {
                                    id_empresa: empKey,
                                    empresa: getCleanStationName(empKey, leg.titulo),
                                    diesel: Math.round(Number(leg.diesel || 0) * 100) / 100,
                                    regular: Math.round(Number(leg.regular || 0) * 100) / 100,
                                    super: Math.round(Number(leg.super || 0) * 100) / 100,
                                    ion: Math.round(Number(leg.ion || 0) * 100) / 100,
                                    galonaje: legGal,
                                    venta: legVenta
                                });
                            }
                        });

                        (legTdaRows || []).forEach(legT => {
                            if (legT.id_empresa === '004' || legT.id_empresa === '022') return;
                            const empId = String(legT.id_empresa);
                            const legVenta = Math.round(Number(legT.monto || 0) * 100) / 100;
                            const legDias = Number(legT.dias_con_venta || 0);
                            if (legVenta <= 0 && tiendasMap.has(empId)) return;
                            const existingT = tiendasMap.get(empId);
                            if (!existingT || legVenta > existingT.venta) {
                                const prom = legDias > 0 ? Math.round((legVenta / legDias) * 100) / 100 : Math.round(Number(legT.promedio_diario || 0) * 100) / 100;
                                tiendasMap.set(empId, {
                                    id_empresa: empId,
                                    empresa: getCleanTiendaName(empId, legT.titulo),
                                    venta: legVenta,
                                    dias_con_venta: legDias,
                                    promedio_diario: prom
                                });
                            }
                        });
                    } catch (legErr) {
                        console.warn('[Ventas Rango] Nota: no se pudo complementar con db_system_rrs:', legErr.message);
                    }
                }

                const officialOrder = ['002', '006', '008', '014', '015', '016', '009'];
                const estacionesLocal = Array.from(estacionesMap.values()).sort((a, b) => {
                    const ia = officialOrder.indexOf(String(a.id_empresa));
                    const ib = officialOrder.indexOf(String(b.id_empresa));
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return 0;
                });
                const tiendasLocal = Array.from(tiendasMap.values()).sort((a, b) => {
                    const ia = officialOrder.indexOf(String(a.id_empresa));
                    const ib = officialOrder.indexOf(String(b.id_empresa));
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return 0;
                });

                const matchedTiendaIds = new Set();
                const consolidadoLocal = estacionesLocal.map(e => {
                    let t = tiendasLocal.find(tienda => String(tienda.id_empresa) === String(e.id_empresa) && !matchedTiendaIds.has(tienda.id_empresa));
                    if (!t) {
                        const eNorm = normalizeStationName(e.empresa);
                        if (eNorm.length >= 3) {
                            t = tiendasLocal.find(tienda => !matchedTiendaIds.has(tienda.id_empresa) && normalizeStationName(tienda.empresa) === eNorm);
                        }
                    }
                    const vTienda = t ? t.venta : 0;
                    if (t) matchedTiendaIds.add(t.id_empresa);
                    return {
                        id_empresa: e.id_empresa,
                        empresa: e.empresa,
                        tienda_nombre: t ? t.empresa : '',
                        diesel: e.diesel,
                        regular: e.regular,
                        super: e.super,
                        ion: e.ion,
                        galonaje: e.galonaje,
                        venta_estacion: e.venta,
                        venta_tienda: vTienda,
                        venta_total: Math.round((e.venta + vTienda) * 100) / 100
                    };
                });

                tiendasLocal.forEach(t => {
                    if (!matchedTiendaIds.has(t.id_empresa) && t.venta > 0) {
                        consolidadoLocal.push({
                            id_empresa: t.id_empresa,
                            empresa: t.empresa,
                            tienda_nombre: t.empresa,
                            diesel: 0,
                            regular: 0,
                            super: 0,
                            ion: 0,
                            galonaje: 0,
                            venta_estacion: 0,
                            venta_tienda: t.venta,
                            venta_total: t.venta,
                            es_tienda_solo: true
                        });
                    }
                });

                const totales = {
                    diesel: Math.round(estacionesLocal.reduce((acc, c) => acc + c.diesel, 0) * 100) / 100,
                    regular: Math.round(estacionesLocal.reduce((acc, c) => acc + c.regular, 0) * 100) / 100,
                    super: Math.round(estacionesLocal.reduce((acc, c) => acc + c.super, 0) * 100) / 100,
                    ion: Math.round(estacionesLocal.reduce((acc, c) => acc + c.ion, 0) * 100) / 100,
                    galonaje: Math.round(estacionesLocal.reduce((acc, c) => acc + c.galonaje, 0) * 100) / 100,
                    venta_estacion: Math.round(estacionesLocal.reduce((acc, c) => acc + c.venta, 0) * 100) / 100,
                    venta_tienda: Math.round(tiendasLocal.reduce((acc, c) => acc + c.venta, 0) * 100) / 100,
                    venta_total: Math.round((estacionesLocal.reduce((acc, c) => acc + c.venta, 0) + tiendasLocal.reduce((acc, c) => acc + c.venta, 0)) * 100) / 100
                };

                return {
                    periodo: `${startDate} al ${endDate}`,
                    fecha_inicio: startDate,
                    fecha_fin: endDate,
                    origen: 'db_sistema_saas (sys.sipesv.com)',
                    estaciones: estacionesLocal,
                    tiendas: tiendasLocal,
                    consolidado: consolidadoLocal,
                    totales
                };
            }
        } catch (errSaas) {
            console.warn('[Ventas Rango] Error en mock SaaS:', errSaas.message);
        }
    }

    if (externalDb && typeof externalDb.query === 'function') {
        try {
            const sqlLegEst = `
                SELECT a.id_empresa, a.titulo, a.orden,
                       IFNULL(SUM(IF(d.clasificacion = 'D', b.total, 0.0)), 0.0) as diesel, 
                       IFNULL(SUM(IF(d.clasificacion = 'R', b.total, 0.0)), 0.0) as regular, 
                       IFNULL(SUM(IF(d.clasificacion = 'S', b.total, 0.0)), 0.0) as super, 
                       IFNULL(SUM(IF(d.clasificacion = 'I', b.total, 0.0)), 0.0) as ion, 
                       IFNULL(SUM(b.total), 0.0) as galonaje, 
                       COALESCE(SUM(b.monto), SUM(b.total * b.precio), 0.0) as monto
                FROM web_consolidado a 
                LEFT JOIN (
                    SELECT ct_l.id_empresa, ct_l.id_producto, ct_l.total, ct_l.precio, ct_l.monto
                    FROM cierre_turno_lecturas ct_l
                    INNER JOIN cierre_turno ct ON ct_l.id_cierre_turno = ct.id AND ct_l.id_empresa = ct.id_empresa
                    WHERE STR_TO_DATE(ct.fecha_turno, '%d/%m/%Y') BETWEEN ? AND ?
                ) b ON a.id_empresa = b.id_empresa
                LEFT JOIN cfg_combustibles d ON b.id_empresa = d.id_empresa AND b.id_producto = d.id_producto
                WHERE a.grupo = 'ESTACION' AND a.id_empresa != '004'
                GROUP BY a.id_empresa, a.titulo, a.orden
                ORDER BY a.orden
            `;
            const sqlLegTda = `
                SELECT a.id_empresa, a.titulo, a.orden, 
                       IFNULL(SUM(b.monto), 0.0) as monto,
                       COUNT(DISTINCT IF(b.monto > 0, b.fecha, NULL)) as dias_con_venta,
                       IFNULL(AVG(IF(b.monto > 0, b.monto, NULL)), 0.0) as promedio_diario
                FROM web_consolidado a 
                LEFT JOIN ventas_tienda b ON a.id_empresa = b.id_empresa AND b.fecha BETWEEN ? AND ?
                WHERE a.grupo = 'TIENDA' AND a.id_empresa NOT IN ('004', '022')
                GROUP BY a.id_empresa, a.titulo, a.orden
                ORDER BY a.orden
            `;
            const [[legEstRows], [legTdaRows]] = await Promise.all([
                withRetry(() => externalDb.query(sqlLegEst, [startDate, endDate])),
                withRetry(() => externalDb.query(sqlLegTda, [startDate, endDate]))
            ]);

            const estacionesLocal = (legEstRows || []).map(row => ({
                id_empresa: String(row.id_empresa),
                empresa: getCleanStationName(String(row.id_empresa), row.titulo),
                diesel: Math.round(Number(row.diesel || 0) * 100) / 100,
                regular: Math.round(Number(row.regular || 0) * 100) / 100,
                super: Math.round(Number(row.super || 0) * 100) / 100,
                ion: Math.round(Number(row.ion || 0) * 100) / 100,
                galonaje: Math.round(Number(row.galonaje || 0) * 100) / 100,
                venta: Math.round(Number(row.monto || 0) * 100) / 100
            }));

            const tiendasLocal = (legTdaRows || []).map(row => ({
                id_empresa: String(row.id_empresa),
                empresa: getCleanTiendaName(String(row.id_empresa), row.titulo),
                venta: Math.round(Number(row.monto || 0) * 100) / 100,
                dias_con_venta: Number(row.dias_con_venta || 0),
                promedio_diario: Math.round(Number(row.promedio_diario || 0) * 100) / 100
            }));

            const matchedTiendaIds = new Set();
            const consolidadoLocal = estacionesLocal.map(e => {
                const t = tiendasLocal.find(tienda => String(tienda.id_empresa) === String(e.id_empresa) && !matchedTiendaIds.has(tienda.id_empresa));
                const vTienda = t ? t.venta : 0;
                if (t) matchedTiendaIds.add(t.id_empresa);
                return {
                    id_empresa: e.id_empresa,
                    empresa: e.empresa,
                    tienda_nombre: t ? t.empresa : '',
                    diesel: e.diesel,
                    regular: e.regular,
                    super: e.super,
                    ion: e.ion,
                    galonaje: e.galonaje,
                    venta_estacion: e.venta,
                    venta_tienda: vTienda,
                    venta_total: Math.round((e.venta + vTienda) * 100) / 100
                };
            });

            tiendasLocal.forEach(t => {
                if (!matchedTiendaIds.has(t.id_empresa) && t.venta > 0) {
                    consolidadoLocal.push({
                        id_empresa: t.id_empresa,
                        empresa: t.empresa,
                        tienda_nombre: t.empresa,
                        diesel: 0, regular: 0, super: 0, ion: 0, galonaje: 0, venta_estacion: 0,
                        venta_tienda: t.venta,
                        venta_total: t.venta,
                        es_tienda_solo: true
                    });
                }
            });

            const totales = {
                diesel: Math.round(estacionesLocal.reduce((acc, c) => acc + c.diesel, 0) * 100) / 100,
                regular: Math.round(estacionesLocal.reduce((acc, c) => acc + c.regular, 0) * 100) / 100,
                super: Math.round(estacionesLocal.reduce((acc, c) => acc + c.super, 0) * 100) / 100,
                ion: Math.round(estacionesLocal.reduce((acc, c) => acc + c.ion, 0) * 100) / 100,
                galonaje: Math.round(estacionesLocal.reduce((acc, c) => acc + c.galonaje, 0) * 100) / 100,
                venta_estacion: Math.round(estacionesLocal.reduce((acc, c) => acc + c.venta, 0) * 100) / 100,
                venta_tienda: Math.round(tiendasLocal.reduce((acc, c) => acc + c.venta, 0) * 100) / 100,
                venta_total: Math.round((estacionesLocal.reduce((acc, c) => acc + c.venta, 0) + tiendasLocal.reduce((acc, c) => acc + c.venta, 0)) * 100) / 100
            };

            return {
                periodo: `${startDate} al ${endDate}`,
                fecha_inicio: startDate,
                fecha_fin: endDate,
                origen: 'db_system_rrs',
                estaciones: estacionesLocal,
                tiendas: tiendasLocal,
                consolidado: consolidadoLocal,
                totales
            };
        } catch (errLeg) {
            console.warn('[Ventas Rango] Error en consulta db_system_rrs:', errLeg.message);
        }
    }

    return {
        periodo: `${startDate} al ${endDate}`,
        fecha_inicio: startDate,
        fecha_fin: endDate,
        origen: 'fallback_vacio',
        estaciones: [],
        tiendas: [],
        consolidado: [],
        totales: { diesel: 0, regular: 0, super: 0, ion: 0, galonaje: 0, venta_estacion: 0, venta_tienda: 0, venta_total: 0 }
    };
};

const getComparativoAnualData = async (externalDb, anioPrincipalParam, anioCompararParam, accountingDbParam = undefined) => {
    const currentYear = new Date().getFullYear();
    const anioPrincipal = parseInt(anioPrincipalParam || currentYear, 10);
    const anioComparar = parseInt(anioCompararParam || (anioPrincipal - 1), 10);

    if (isNaN(anioPrincipal) || isNaN(anioComparar) || anioPrincipal < 2000 || anioPrincipal > 2100 || anioComparar < 2000 || anioComparar > 2100) {
        throw new Error('Años inválidos para el comparativo');
    }

    const strPrincipal = String(anioPrincipal);
    const strComparar = String(anioComparar);

    const accountingDb = accountingDbParam !== undefined
        ? accountingDbParam
        : (process.env.NODE_ENV === 'test' ? null : await getAccountingDb().catch(() => null));

    // 1. Obtener lista de estaciones activas (excluyendo 004 El Desvío)
    let estaciones = OFFICIAL_ESTACIONES.map(s => ({
        id_empresa: String(s.id_empresa),
        nombre: s.titulo
    }));
    if (externalDb && typeof externalDb.query === 'function') {
        try {
            const [stationRows] = await withRetry(() => externalDb.query(
                "SELECT id_empresa, titulo, orden FROM web_consolidado WHERE grupo = 'ESTACION' AND id_empresa != '004' ORDER BY orden"
            ));
            if (stationRows && stationRows.length > 0) {
                estaciones = stationRows.map(s => ({
                    id_empresa: String(s.id_empresa),
                    nombre: getCleanStationName(String(s.id_empresa), s.titulo)
                }));
                if (accountingDb) {
                    const existingIds = new Set(estaciones.map(e => e.id_empresa));
                    OFFICIAL_ESTACIONES.forEach(st => {
                        if (!existingIds.has(st.id_empresa)) {
                            estaciones.push({
                                id_empresa: String(st.id_empresa),
                                nombre: st.titulo
                            });
                            existingIds.add(st.id_empresa);
                        }
                    });
                }
            }
        } catch {
            /* ignore */
        }
    }

    // Helper para consultar datos de combustible por año (fusionando SaaS cerrado y legado db_system_rrs por estación/mes)
    const getFuelRowsForYear = async (targetYearStr) => {
        const saasMap = new Map();
        if (accountingDb) {
            try {
                const [saasCheck] = await withRetry(() => accountingDb.query(
                    "SELECT COUNT(*) as cnt FROM gas_station_closeouts WHERE YEAR(fecha_turno) = ? AND estado = 'cerrado'",
                    [targetYearStr]
                ));
                if (saasCheck?.[0]?.cnt > 0) {
                    const sqlSaas = `
                        SELECT 
                            YEAR(c.fecha_turno) as anio,
                            MONTH(c.fecha_turno) as mes,
                            c.branch_id,
                            COALESCE(SUM(CASE WHEN (r.codigo_producto LIKE '%DIE%' AND r.codigo_producto NOT LIKE '%ION%') OR p.tipo_combustible IN (3, 5) OR (p.nombre LIKE '%DIESEL%' AND p.nombre NOT LIKE '%ION%') THEN r.diferencia ELSE 0 END), 0.0) as diesel,
                            COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%REG%' OR p.tipo_combustible = 1 OR p.nombre LIKE '%REGULAR%' THEN r.diferencia ELSE 0 END), 0.0) as regular,
                            COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%SUP%' OR p.tipo_combustible = 2 OR p.nombre LIKE '%SUPER%' THEN r.diferencia ELSE 0 END), 0.0) as super,
                            COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%ION%' OR p.tipo_combustible = 4 OR p.nombre LIKE '%ION%' THEN r.diferencia ELSE 0 END), 0.0) as ion,
                            COALESCE(SUM(r.diferencia), 0.0) as galonaje,
                            COALESCE(SUM(r.monto), 0.0) as venta_estacion
                        FROM gas_station_closeouts c
                        JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
                        LEFT JOIN products p ON r.product_id = p.id
                        WHERE c.estado = 'cerrado' AND YEAR(c.fecha_turno) = ?
                        GROUP BY anio, mes, c.branch_id
                        ORDER BY anio, mes, c.branch_id
                    `;
                    const [saasRows] = await withRetry(() => accountingDb.query(sqlSaas, [targetYearStr]));
                    (saasRows || []).forEach(r => {
                        const anio = String(r.anio);
                        const mes = Number(r.mes);
                        const id_empresa = branchToEmpId[r.branch_id] || String(r.branch_id);
                        const key = `${anio}_${mes}_${id_empresa}`;
                        const existing = saasMap.get(key) || {
                            anio,
                            mes,
                            id_empresa,
                            diesel: 0,
                            regular: 0,
                            super: 0,
                            ion: 0,
                            galonaje: 0,
                            venta_estacion: 0
                        };
                        existing.diesel = Math.round((existing.diesel + Number(r.diesel || 0)) * 100) / 100;
                        existing.regular = Math.round((existing.regular + Number(r.regular || 0)) * 100) / 100;
                        existing.super = Math.round((existing.super + Number(r.super || 0)) * 100) / 100;
                        existing.ion = Math.round((existing.ion + Number(r.ion || 0)) * 100) / 100;
                        existing.galonaje = Math.round((existing.galonaje + Number(r.galonaje || 0)) * 100) / 100;
                        existing.venta_estacion = Math.round((existing.venta_estacion + Number(r.venta_estacion || 0)) * 100) / 100;
                        saasMap.set(key, existing);
                    });
                }
            } catch (errSaasFuel) {
                console.warn(`[Comparativo Anual] Error consultando SaaS combustible para ${targetYearStr}:`, errSaasFuel.message);
            }
        }

        // Consultar también db_system_rrs para completar meses históricos y sucursales previas a migración
        if (externalDb && typeof externalDb.query === 'function') {
            try {
                const sqlLegacy = `
                    SELECT 
                        RIGHT(ct.fecha_turno, 4) as anio,
                        CAST(SUBSTRING(ct.fecha_turno, 4, 2) AS UNSIGNED) AS mes,
                        ct_l.id_empresa,
                        IFNULL(SUM(IF(d.clasificacion = 'D', ct_l.total, 0.0)), 0.0) as diesel,
                        IFNULL(SUM(IF(d.clasificacion = 'R', ct_l.total, 0.0)), 0.0) as regular,
                        IFNULL(SUM(IF(d.clasificacion = 'S', ct_l.total, 0.0)), 0.0) as super,
                        IFNULL(SUM(IF(d.clasificacion = 'I', ct_l.total, 0.0)), 0.0) as ion,
                        IFNULL(SUM(ct_l.total), 0.0) as galonaje,
                        COALESCE(SUM(ct_l.monto), SUM(ct_l.total * ct_l.precio), 0.0) as venta_estacion
                    FROM cierre_turno ct
                    INNER JOIN cierre_turno_lecturas ct_l 
                        ON ct.id = ct_l.id_cierre_turno AND ct.id_empresa = ct_l.id_empresa
                    LEFT JOIN cfg_combustibles d 
                        ON ct_l.id_empresa = d.id_empresa AND ct_l.id_producto = d.id_producto
                    WHERE RIGHT(ct.fecha_turno, 4) = ?
                      AND ct.id_empresa != '004'
                    GROUP BY anio, mes, ct_l.id_empresa
                    ORDER BY anio, mes, ct_l.id_empresa
                `;
                const [legRows] = await withRetry(() => externalDb.query(sqlLegacy, [targetYearStr]));
                (legRows || []).forEach(r => {
                    const anio = String(r.anio);
                    const mes = Number(r.mes);
                    const id_empresa = String(r.id_empresa);
                    const key = `${anio}_${mes}_${id_empresa}`;
                    const legObj = {
                        anio,
                        mes,
                        id_empresa,
                        diesel: Number(r.diesel || 0),
                        regular: Number(r.regular || 0),
                        super: Number(r.super || 0),
                        ion: Number(r.ion || 0),
                        galonaje: Number(r.galonaje || 0),
                        venta_estacion: Number(r.venta_estacion || 0)
                    };
                    const existing = saasMap.get(key);
                    if (!existing || (legObj.galonaje > existing.galonaje && legObj.venta_estacion > existing.venta_estacion)) {
                        saasMap.set(key, legObj);
                    }
                });
            } catch (errLegFuel) {
                console.warn(`[Comparativo Anual] Error consultando legado combustible para ${targetYearStr}:`, errLegFuel.message);
            }
        }

        return Array.from(saasMap.values());
    };

    // Helper para consultar datos de tienda por año (fusionando SaaS pos_shifts y legado ventas_tienda por sucursal/mes)
    const getStoreRowsForYear = async (targetYearNum) => {
        const targetYearStr = String(targetYearNum);
        const storeMap = new Map();
        if (accountingDb) {
            try {
                const [saasCheck] = await withRetry(() => accountingDb.query(
                    "SELECT COUNT(*) as cnt FROM pos_shifts WHERE YEAR(shift_date) = ? AND status = 'closed'",
                    [targetYearStr]
                ));
                if (saasCheck?.[0]?.cnt > 0) {
                    const sqlSaas = `
                        SELECT 
                            YEAR(s.shift_date) as anio,
                            MONTH(s.shift_date) as mes,
                            s.branch_id,
                            COALESCE(SUM(s.total_sales), 0.0) as venta_tienda
                        FROM pos_shifts s
                        JOIN points_of_sale p ON s.pos_id = p.id
                        WHERE s.status = 'closed' AND YEAR(s.shift_date) = ?
                          AND (p.nombre LIKE '%Tienda%' OR p.nombre LIKE '%Super%')
                        GROUP BY anio, mes, s.branch_id
                        ORDER BY anio, mes, s.branch_id
                    `;
                    const [saasRows] = await withRetry(() => accountingDb.query(sqlSaas, [targetYearStr]));
                    (saasRows || []).forEach(r => {
                        const anio = String(r.anio);
                        const mes = Number(r.mes);
                        const id_empresa = branchToEmpId[r.branch_id] || String(r.branch_id);
                        const key = `${anio}_${mes}_${id_empresa}`;
                        const existing = storeMap.get(key);
                        const val = Number(r.venta_tienda || 0);
                        if (!existing) {
                            storeMap.set(key, { anio, mes, id_empresa, venta_tienda: val });
                        } else {
                            existing.venta_tienda = Math.round((existing.venta_tienda + val) * 100) / 100;
                        }
                    });
                }
            } catch (errSaasStore) {
                console.warn(`[Comparativo Anual] Error consultando SaaS tienda para ${targetYearStr}:`, errSaasStore.message);
            }
        }

        // Complementar con db_system_rrs (incluye Miraflores 002, Costa del Sol 008 y meses históricos)
        if (externalDb && typeof externalDb.query === 'function') {
            try {
                const sqlLegacy = `
                    SELECT 
                        CAST(YEAR(fecha) AS CHAR) as anio,
                        MONTH(fecha) as mes,
                        id_empresa,
                        IFNULL(SUM(monto), 0.0) as venta_tienda
                    FROM ventas_tienda
                    WHERE YEAR(fecha) = ? AND id_empresa NOT IN ('004', '022')
                    GROUP BY anio, mes, id_empresa
                    ORDER BY anio, mes, id_empresa
                `;
                const [legRows] = await withRetry(() => externalDb.query(sqlLegacy, [targetYearNum]));
                (legRows || []).forEach(r => {
                    const anio = String(r.anio);
                    const mes = Number(r.mes);
                    const id_empresa = String(r.id_empresa);
                    const key = `${anio}_${mes}_${id_empresa}`;
                    const legVal = Number(r.venta_tienda || 0);
                    const existing = storeMap.get(key);
                    if (!existing || legVal > existing.venta_tienda) {
                        storeMap.set(key, { anio, mes, id_empresa, venta_tienda: legVal });
                    }
                });
            } catch (errLegStore) {
                console.warn(`[Comparativo Anual] Error consultando legado tienda para ${targetYearStr}:`, errLegStore.message);
            }
        }

        return Array.from(storeMap.values());
    };

    const [fuelPrincipal, fuelComparar, storePrincipal, storeComparar] = await Promise.all([
        getFuelRowsForYear(strPrincipal),
        getFuelRowsForYear(strComparar),
        getStoreRowsForYear(anioPrincipal),
        getStoreRowsForYear(anioComparar)
    ]);

    const fuelRows = [...fuelPrincipal, ...fuelComparar];
    const tiendaRows = [...storePrincipal, ...storeComparar];

    // Asegurar que sucursales exclusivas de tienda con ventas (como Super El Pedregal 009) estén en la lista de estaciones/sucursales
    if (tiendaRows.some(r => String(r.id_empresa) === '009' && Number(r.venta_tienda) > 0)) {
        if (!estaciones.some(e => String(e.id_empresa) === '009')) {
            estaciones.push({ id_empresa: '009', nombre: 'Super El Pedregal' });
        }
    }

    // 4. Obtener años disponibles en la base de datos
    const yearsSet = new Set([anioPrincipal, anioComparar]);
    if (accountingDb) {
        try {
            const [saasYears] = await withRetry(() => accountingDb.query(
                "SELECT DISTINCT YEAR(fecha_turno) as anio FROM gas_station_closeouts WHERE estado = 'cerrado'"
            ));
            (saasYears || []).forEach(r => { if (r.anio) yearsSet.add(parseInt(r.anio, 10)); });
        } catch {
            /* ignore */
        }
    }
    if (externalDb && typeof externalDb.query === 'function') {
        try {
            const [yearsRows] = await withRetry(() => externalDb.query(`
                SELECT DISTINCT anio FROM (
                    SELECT DISTINCT RIGHT(fecha_turno, 4) as anio 
                    FROM cierre_turno 
                    WHERE fecha_turno IS NOT NULL AND LENGTH(fecha_turno) = 10
                    UNION
                    SELECT DISTINCT CAST(YEAR(fecha) AS CHAR) as anio 
                    FROM ventas_tienda 
                    WHERE fecha IS NOT NULL
                ) t 
                WHERE anio REGEXP '^[0-9]{4}$' AND anio >= '2020' AND anio <= '2030'
                ORDER BY anio DESC
            `));
            if (yearsRows && yearsRows.length > 0) {
                yearsRows.forEach(r => {
                    const yr = parseInt(r.anio, 10);
                    if (!isNaN(yr)) yearsSet.add(yr);
                });
            }
        } catch {
            /* ignore */
        }
    }
    const aniosDisponibles = Array.from(yearsSet).sort((a, b) => b - a);

    // 5. Nombres de meses
    const mesesInfo = [
        { mes: 1, nombre: 'Enero', mes_corto: 'Ene' },
        { mes: 2, nombre: 'Febrero', mes_corto: 'Feb' },
        { mes: 3, nombre: 'Marzo', mes_corto: 'Mar' },
        { mes: 4, nombre: 'Abril', mes_corto: 'Abr' },
        { mes: 5, nombre: 'Mayo', mes_corto: 'May' },
        { mes: 6, nombre: 'Junio', mes_corto: 'Jun' },
        { mes: 7, nombre: 'Julio', mes_corto: 'Jul' },
        { mes: 8, nombre: 'Agosto', mes_corto: 'Ago' },
        { mes: 9, nombre: 'Septiembre', mes_corto: 'Sep' },
        { mes: 10, nombre: 'Octubre', mes_corto: 'Oct' },
        { mes: 11, nombre: 'Noviembre', mes_corto: 'Nov' },
        { mes: 12, nombre: 'Diciembre', mes_corto: 'Dic' }
    ];

    const emptyMetrics = () => ({
        galonaje: 0,
        venta_estacion: 0,
        venta_tienda: 0,
        venta_total: 0,
        diesel: 0,
        regular: 0,
        super: 0,
        ion: 0
    });

    const addMetrics = (target, src) => {
        target.galonaje = Math.round((target.galonaje + (src.galonaje || 0)) * 100) / 100;
        target.venta_estacion = Math.round((target.venta_estacion + (src.venta_estacion || 0)) * 100) / 100;
        target.venta_tienda = Math.round((target.venta_tienda + (src.venta_tienda || 0)) * 100) / 100;
        target.venta_total = Math.round((target.venta_total + (src.venta_total || 0)) * 100) / 100;
        target.diesel = Math.round((target.diesel + (src.diesel || 0)) * 100) / 100;
        target.regular = Math.round((target.regular + (src.regular || 0)) * 100) / 100;
        target.super = Math.round((target.super + (src.super || 0)) * 100) / 100;
        target.ion = Math.round((target.ion + (src.ion || 0)) * 100) / 100;
    };

    // Estructurar datos mensuales
    const meses = mesesInfo.map(({ mes, nombre, mes_corto }) => {
        const buildYearMonth = (targetYearStr) => {
            const fuels = (fuelRows || []).filter(r => String(r.anio) === targetYearStr && Number(r.mes) === mes);
            const stores = (tiendaRows || []).filter(r => String(r.anio) === targetYearStr && Number(r.mes) === mes);

            const por_estacion = {};
            const total = emptyMetrics();

            estaciones.forEach(est => {
                const f = fuels.find(r => String(r.id_empresa) === est.id_empresa);
                const t = stores.find(r => String(r.id_empresa) === est.id_empresa);

                const gal = f ? Math.round(Number(f.galonaje || 0) * 100) / 100 : 0;
                const vEst = f ? Math.round(Number(f.venta_estacion || 0) * 100) / 100 : 0;
                const vTda = t ? Math.round(Number(t.venta_tienda || 0) * 100) / 100 : 0;
                const d = f ? Math.round(Number(f.diesel || 0) * 100) / 100 : 0;
                const r = f ? Math.round(Number(f.regular || 0) * 100) / 100 : 0;
                const s = f ? Math.round(Number(f.super || 0) * 100) / 100 : 0;
                const i = f ? Math.round(Number(f.ion || 0) * 100) / 100 : 0;

                const estMetrics = {
                    galonaje: gal,
                    venta_estacion: vEst,
                    venta_tienda: vTda,
                    venta_total: Math.round((vEst + vTda) * 100) / 100,
                    diesel: d,
                    regular: r,
                    super: s,
                    ion: i
                };

                por_estacion[est.id_empresa] = estMetrics;
                addMetrics(total, estMetrics);
            });

            return { total, por_estacion };
        };

        const principal = buildYearMonth(strPrincipal);
        const comparar = buildYearMonth(strComparar);

        const diffGal = Math.round((principal.total.galonaje - comparar.total.galonaje) * 100) / 100;
        const pctGal = comparar.total.galonaje > 0 ? Math.round(((diffGal / comparar.total.galonaje) * 100) * 10) / 10 : 0;
        const diffVenta = Math.round((principal.total.venta_total - comparar.total.venta_total) * 100) / 100;
        const pctVenta = comparar.total.venta_total > 0 ? Math.round(((diffVenta / comparar.total.venta_total) * 100) * 10) / 10 : 0;

        return {
            mes,
            nombre,
            mes_corto,
            principal: {
                ...principal.total,
                por_estacion: principal.por_estacion
            },
            comparar: {
                ...comparar.total,
                por_estacion: comparar.por_estacion
            },
            diferencia: {
                galonaje: diffGal,
                galonaje_pct: pctGal,
                venta_total: diffVenta,
                venta_total_pct: pctVenta,
                venta_estacion: Math.round((principal.total.venta_estacion - comparar.total.venta_estacion) * 100) / 100,
                venta_tienda: Math.round((principal.total.venta_tienda - comparar.total.venta_tienda) * 100) / 100
            }
        };
    });

    // Totales Anuales
    const calcYearTotal = (key) => {
        const total = emptyMetrics();
        const por_estacion = {};
        estaciones.forEach(est => { por_estacion[est.id_empresa] = emptyMetrics(); });

        meses.forEach(m => {
            addMetrics(total, m[key]);
            estaciones.forEach(est => {
                if (m[key]?.por_estacion?.[est.id_empresa]) {
                    addMetrics(por_estacion[est.id_empresa], m[key].por_estacion[est.id_empresa]);
                }
            });
        });

        return { ...total, por_estacion };
    };

    const totPrincipal = calcYearTotal('principal');
    const totComparar = calcYearTotal('comparar');

    const totDiffGal = Math.round((totPrincipal.galonaje - totComparar.galonaje) * 100) / 100;
    const totPctGal = totComparar.galonaje > 0 ? Math.round(((totDiffGal / totComparar.galonaje) * 100) * 10) / 10 : 0;
    const totDiffVenta = Math.round((totPrincipal.venta_total - totComparar.venta_total) * 100) / 100;
    const totPctVenta = totComparar.venta_total > 0 ? Math.round(((totDiffVenta / totComparar.venta_total) * 100) * 10) / 10 : 0;

    // Mes récord / pico
    let picoPrincipalGal = { mes: 0, nombre: '', valor: 0 };
    let picoPrincipalVenta = { mes: 0, nombre: '', valor: 0 };
    let mesCorteYtd = 0;

    meses.forEach(m => {
        if (m.principal.galonaje > picoPrincipalGal.valor) {
            picoPrincipalGal = { mes: m.mes, nombre: m.nombre, valor: m.principal.galonaje };
        }
        if (m.principal.venta_total > picoPrincipalVenta.valor) {
            picoPrincipalVenta = { mes: m.mes, nombre: m.nombre, valor: m.principal.venta_total };
        }
        if (m.principal.galonaje > 0 || m.principal.venta_total > 0) {
            if (m.mes > mesCorteYtd) mesCorteYtd = m.mes;
        }
    });

    if (mesCorteYtd === 0) mesCorteYtd = 12;

    // Cálculo YTD acumulado hasta el mes con ventas en año principal
    const ytdPrincipal = emptyMetrics();
    const ytdComparar = emptyMetrics();
    meses.filter(m => m.mes <= mesCorteYtd).forEach(m => {
        addMetrics(ytdPrincipal, m.principal);
        addMetrics(ytdComparar, m.comparar);
    });

    const ytdDiffGal = Math.round((ytdPrincipal.galonaje - ytdComparar.galonaje) * 100) / 100;
    const ytdPctGal = ytdComparar.galonaje > 0 ? Math.round(((ytdDiffGal / ytdComparar.galonaje) * 100) * 10) / 10 : 0;
    const ytdDiffVenta = Math.round((ytdPrincipal.venta_total - ytdComparar.venta_total) * 100) / 100;
    const ytdPctVenta = ytdComparar.venta_total > 0 ? Math.round(((ytdDiffVenta / ytdComparar.venta_total) * 100) * 10) / 10 : 0;

    return {
        anioPrincipal,
        anioComparar,
        aniosDisponibles,
        estaciones,
        meses,
        totales: {
            principal: totPrincipal,
            comparar: totComparar,
            diferencia: {
                galonaje: totDiffGal,
                galonaje_pct: totPctGal,
                venta_total: totDiffVenta,
                venta_total_pct: totPctVenta
            },
            picos: {
                galonaje: picoPrincipalGal,
                venta_total: picoPrincipalVenta
            },
            ytd: {
                mes_corte: mesCorteYtd,
                nombre_corte: mesesInfo[mesCorteYtd - 1]?.nombre || '',
                principal: ytdPrincipal,
                comparar: ytdComparar,
                diferencia: {
                    galonaje: ytdDiffGal,
                    galonaje_pct: ytdPctGal,
                    venta_total: ytdDiffVenta,
                    venta_total_pct: ytdPctVenta
                }
            }
        }
    };
};

module.exports = {
    normalizeStationName,
    getResumenMensualData,
    getResumenRangoVentasData,
    getComparativoAnualData
};
