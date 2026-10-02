const express = require('express');
const router = express.Router();
const { getDb, getExternalDb, getAccountingDb, withRetry } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');

// --- Ventas ---
router.get('/ventas/consolidado/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    try {
        const externalDb = await getExternalDb();
        
        const [stations] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden");
        const toSystemDate = (dStr) => {
            const parts = dStr.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        };
        const sysDate = toSystemDate(date);

        const cInicio = new Date(date + 'T12:00:00');
        cInicio.setDate(cInicio.getDate() - 15);
        const cInicioStr = cInicio.toISOString().split('T')[0];
        
        const sqlTiendas = `
            SELECT a.id_empresa, a.titulo, 
                   SUM(IF(b.fecha = ?, IFNULL(b.monto, 0.0), 0.0)) as monto, 
                   AVG(IFNULL(b.monto, 0.0)) as promedio 
            FROM web_consolidado a 
            LEFT JOIN ventas_tienda b ON a.id_empresa = b.id_empresa AND b.fecha BETWEEN ? AND ?
            WHERE a.grupo = 'TIENDA' 
            GROUP BY a.id_empresa, a.titulo, a.orden 
            ORDER BY a.orden
        `;
        const [tiendasRows] = await externalDb.query(sqlTiendas, [date, cInicioStr, date]);
        const tiendasLocal = (tiendasRows || [])
            .filter(r => r.id_empresa !== '004')
            .map(row => ({
                fecha: date,
                empresa: getCleanTiendaName(String(row.id_empresa), row.titulo),
                venta: Math.round(Number(row.monto || 0) * 100) / 100,
                promedio: Math.round(Number(row.promedio || 0) * 100) / 100
            }));

        const sqlEstaciones = `
            SELECT a.id_empresa, a.titulo, 
                   IFNULL(SUM(IF(d.clasificacion = 'D', b.total, 0.0)), 0.0) as diesel, 
                   IFNULL(SUM(IF(d.clasificacion = 'R', b.total, 0.0)), 0.0) as regular, 
                   IFNULL(SUM(IF(d.clasificacion = 'S', b.total, 0.0)), 0.0) as super, 
                   IFNULL(SUM(IF(d.clasificacion = 'I', b.total, 0.0)), 0.0) as ion, 
                   IFNULL(SUM(b.total), 0.0) as galonaje, 
                   IFNULL(SUM(b.total * b.precio), 0.0) as monto
            FROM web_consolidado a 
            LEFT JOIN cierre_turno_lecturas b ON a.id_empresa = b.id_empresa 
            INNER JOIN cfg_combustibles d ON b.id_empresa = d.id_empresa AND b.id_producto = d.id_producto 
            INNER JOIN cierre_turno c ON b.id_cierre_turno = c.id AND b.id_empresa = c.id_empresa AND c.fecha_turno = ? 
            WHERE a.grupo = 'ESTACION' 
            GROUP BY a.id_empresa, a.titulo, a.orden 
            ORDER BY a.orden
        `;
        const [estacionesRows] = await externalDb.query(sqlEstaciones, [sysDate]);
        const estacionesLocal = (estacionesRows || [])
            .filter(r => r.id_empresa !== '004')
            .map(row => ({
                empresa: getCleanStationName(String(row.id_empresa), row.titulo),
                diesel: Math.round(Number(row.diesel || 0) * 100) / 100,
                regular: Math.round(Number(row.regular || 0) * 100) / 100,
                super: Math.round(Number(row.super || 0) * 100) / 100,
                ion: Math.round(Number(row.ion || 0) * 100) / 100,
                galonaje: Math.round(Number(row.galonaje || 0) * 100) / 100,
                venta: Math.round(Number(row.monto || 0) * 100) / 100
            }));

        const sqlMargenes = `
            SELECT a.id_empresa, a.titulo, 
                   SUM(IFNULL(IF(b.clasificacion = 'D' AND b.tipo = 'A', c.precio, 0.0), 0.0)) as diesel_a, 
                   SUM(IFNULL(IF(b.clasificacion = 'R' AND b.tipo = 'A', c.precio, 0.0), 0.0)) as regular_a, 
                   SUM(IFNULL(IF(b.clasificacion = 'S' AND b.tipo = 'A', c.precio, 0.0), 0.0)) as super_a, 
                   SUM(IFNULL(IF(b.clasificacion = 'D' AND b.tipo = 'F', c.precio, 0.0), 0.0)) as diesel_c, 
                   SUM(IFNULL(IF(b.clasificacion = 'R' AND b.tipo = 'F', c.precio, 0.0), 0.0)) as regular_c, 
                   SUM(IFNULL(IF(b.clasificacion = 'S' AND b.tipo = 'F', c.precio, 0.0), 0.0)) as super_c, 
                   SUM(IFNULL(IF(b.clasificacion = 'I', c.precio, 0.0), 0.0)) as ion_diesel, 
                   SUM(IFNULL(IF(b.clasificacion = 'D' AND b.tipo = 'M', c.precio, 0.0), 0.0)) as master 
            FROM web_consolidado a 
            LEFT JOIN cfg_combustibles b ON a.id_empresa = b.id_empresa 
            LEFT JOIN ( 
                 SELECT a.id_empresa, a.id_producto, a.codigo_producto, a.nom_producto, precio 
                 FROM cierre_turno_lecturas a 
                 INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa = b.id_empresa 
                 WHERE b.fecha_turno = ? 
                   AND b.turno = (SELECT MAX(x.turno) FROM cierre_turno x WHERE x.id_empresa = b.id_empresa AND x.fecha_turno = b.fecha_turno) 
                 GROUP BY codigo_producto, a.id_empresa, a.id_producto, a.nom_producto, precio 
            ) c ON b.id_empresa = c.id_empresa AND b.codigo = c.codigo_producto 
            WHERE a.grupo = 'ESTACION' 
            GROUP BY a.id_empresa, a.titulo, a.orden 
            ORDER BY a.orden
        `;
        const [margenesRows] = await externalDb.query(sqlMargenes, [sysDate]);

        // Obtener costos de combustibles vigentes para la quincena de la fecha consultada
        let quincenaRow = null;
        let stationCostsMap = {};
        try {
            const db = getDb();
            // 1. Quincena exacta según la fecha consultada
            const [qRows] = await withRetry(() => db.query(
                `SELECT * FROM combustible_precios_quincenales 
                 WHERE ? BETWEEN periodo_inicio AND periodo_fin 
                 ORDER BY periodo_inicio DESC LIMIT 1`,
                [date]
            ));

            if (qRows && qRows.length > 0) {
                quincenaRow = qRows[0];
            } else {
                // Quincena anterior más cercana a la fecha
                const [qFallback] = await withRetry(() => db.query(
                    `SELECT * FROM combustible_precios_quincenales 
                     WHERE periodo_inicio <= ? 
                     ORDER BY periodo_inicio DESC LIMIT 1`,
                    [date]
                ));
                if (qFallback && qFallback.length > 0) {
                    quincenaRow = qFallback[0];
                } else {
                    // Última quincena registrada
                    const [qLatest] = await withRetry(() => db.query(
                        `SELECT * FROM combustible_precios_quincenales 
                         ORDER BY periodo_inicio DESC LIMIT 1`
                    ));
                    if (qLatest && qLatest.length > 0) {
                        quincenaRow = qLatest[0];
                    }
                }
            }

            // 2. Costos de compra mayorista (Bulk) por estación desde portal_pedidos en o cerca del período
            const fechaDesde = quincenaRow ? quincenaRow.periodo_inicio : date;
            const fechaHasta = quincenaRow ? quincenaRow.periodo_fin : date;

            const [portalCostsRows] = await withRetry(() => db.query(
                `SELECT id_estacion, estacion_nombre,
                        AVG(NULLIF(costo_diesel, 0)) as costo_diesel,
                        AVG(NULLIF(costo_regular, 0)) as costo_regular,
                        AVG(NULLIF(costo_super, 0)) as costo_super,
                        AVG(NULLIF(costo_ion, 0)) as costo_ion
                 FROM portal_pedidos
                 WHERE tipo_producto = 'Bulk'
                   AND (costo_diesel > 0 OR costo_regular > 0 OR costo_super > 0 OR costo_ion > 0)
                   AND (
                       (fecha_pedido BETWEEN ? AND ?)
                       OR (fecha_pedido BETWEEN DATE_SUB(?, INTERVAL 20 DAY) AND DATE_ADD(?, INTERVAL 5 DAY))
                   )
                 GROUP BY id_estacion, estacion_nombre`,
                [fechaDesde, fechaHasta, date, date]
            ));

            const mapStationCode = (id, name) => {
                if (id) {
                    const clean = String(id).padStart(3, '0');
                    if (['002', '004', '006', '008', '014', '015'].includes(clean)) return clean;
                }
                const n = (name || '').toUpperCase();
                if (n.includes('MIRAFLORES')) return '002';
                if (n.includes('DESVIO') || n.includes('DESVÍO')) return '004';
                if (n.includes('CHALCHUAPA')) return '006';
                if (n.includes('COSTA')) return '008';
                if (n.includes('LOMA') || n.includes('SAN MARTIN')) return '014';
                if (n.includes('14 AVENIDA')) return '015';
                return null;
            };

            (portalCostsRows || []).forEach(r => {
                const stCode = mapStationCode(r.id_estacion, r.estacion_nombre);
                if (stCode) {
                    stationCostsMap[stCode] = {
                        costo_diesel: Number(r.costo_diesel || 0),
                        costo_regular: Number(r.costo_regular || 0),
                        costo_super: Number(r.costo_super || 0),
                        costo_ion: Number(r.costo_ion || 0)
                    };
                }
            });
        } catch (dbErr) {
            console.warn('[Consolidado Ventas] Nota: portal_pedidos o combustible_precios_quincenales no disponibles:', dbErr.message);
        }

        // 3. Fallback de costos históricos en externalDb (si existiesen)
        let legacyCostsMap = {};
        try {
            const [costsRows] = await externalDb.query(
                `SELECT id_empresa, cod_producto, costo FROM combustibles_costos 
                 WHERE id IN (SELECT MAX(id) FROM combustibles_costos GROUP BY id_empresa, cod_producto)`
            );
            (costsRows || []).forEach(row => {
                const id = String(row.id_empresa).padStart(3, '0');
                if (!legacyCostsMap[id]) legacyCostsMap[id] = {};
                legacyCostsMap[id][row.cod_producto] = Number(row.costo || 0);
            });
        } catch (extErr) {
            console.warn('[Consolidado Ventas] Nota: tabla combustibles_costos externa:', extErr.message);
        }

        // 4. Fletes por estación (por galón) según tabla o predeterminados oficiales
        const stationFletes = {
            '002': 0.04630, // Puma Miraflores
            '006': 0.03110, // Shell Chalchuapa
            '008': 0.05370, // Puma Costa del Sol
            '014': 0.04690, // Puma San Martín (La Loma)
            '015': 0.02820, // Shell Zurita (14 Avenida)
            '004': 0.04000  // Puma El Desvío
        };

        try {
            const db = getDb();
            const [fleteRows] = await db.query('SELECT id_estacion, flete_galon FROM combustible_fletes_estacion WHERE activo = 1');
            (fleteRows || []).forEach(f => {
                if (f.id_estacion && Number(f.flete_galon) > 0) {
                    stationFletes[String(f.id_estacion).padStart(3, '0')] = Number(f.flete_galon);
                }
            });
        } catch (fErr) {
            // Predeterminados aplicados
        }

        const getFuelBaseCost = (idEmpresa, fuelType) => {
            const idKey = String(idEmpresa).padStart(3, '0');
            // 1. Costo base de factura/portal específico de la estación
            const stCost = stationCostsMap[idKey];
            if (stCost && stCost[`costo_${fuelType}`] > 0) {
                return stCost[`costo_${fuelType}`];
            }
            // 2. Costo base de referencia quincenal
            if (quincenaRow && Number(quincenaRow[`precio_${fuelType}`] || 0) > 0) {
                return Number(quincenaRow[`precio_${fuelType}`]);
            }
            // 3. Costo heredado de externalDb
            const legacyKey = fuelType === 'ion' ? 'IONDIESEL' : fuelType.toUpperCase();
            if (legacyCostsMap[idKey] && Number(legacyCostsMap[idKey][legacyKey] || 0) > 0) {
                return Number(legacyCostsMap[idKey][legacyKey]);
            }
            return 0;
        };

        const FOVIAL_COTRANS = 0.30000;
        const IVA_RATE = 0.13;

        // Desglose de costos oficiales:
        // Subtotal = Base + Flete
        // IVA = Subtotal * 0.13
        // FOVIAL/COTRANS = $0.30 fijo
        // Costo Total = Subtotal + IVA + FOVIAL/COTRANS = (Base + Flete) * 1.13 + 0.30
        const getFuelCostBreakdown = (idEmpresa, fuelType) => {
            const idKey = String(idEmpresa).padStart(3, '0');
            const baseCost = getFuelBaseCost(idKey, fuelType);
            if (baseCost <= 0) return { base: 0, flete: 0, subtotal: 0, iva: 0, fovial: 0, total: 0 };

            const flete = stationFletes[idKey] !== undefined ? stationFletes[idKey] : 0.04000;
            const subtotal = Math.round((baseCost + flete) * 100000) / 100000;
            const iva = Math.round(subtotal * IVA_RATE * 100000) / 100000;
            const fovial = FOVIAL_COTRANS;
            const total = Math.round((subtotal + iva + fovial) * 100000) / 100000;

            return {
                base: Math.round(baseCost * 100000) / 100000,
                flete: Math.round(flete * 100000) / 100000,
                subtotal,
                iva,
                fovial,
                total
            };
        };

        const calcMargin = (retailPrice, totalCost) => {
            const p = Number(retailPrice || 0);
            const c = Number(totalCost || 0);
            // Si la estación no vende ese producto o no tiene esa modalidad, precio es 0 -> no aplica margen
            if (p <= 0 || c <= 0) return null;
            return Math.round((p - c) * 100) / 100;
        };

        const margenesLocal = (margenesRows || [])
            .filter(r => r.id_empresa !== '004')
            .map(row => {
                const idEmpresa = String(row.id_empresa);
                const costD = getFuelCostBreakdown(idEmpresa, 'diesel');
                const costR = getFuelCostBreakdown(idEmpresa, 'regular');
                const costS = getFuelCostBreakdown(idEmpresa, 'super');
                let costI = getFuelCostBreakdown(idEmpresa, 'ion');
                if (costI.total <= 0 && costD.total > 0) {
                    costI = { ...costD };
                }

                const pDA = Number(row.diesel_a || 0);
                const pRA = Number(row.regular_a || 0);
                const pSA = Number(row.super_a || 0);
                const pDC = Number(row.diesel_c || 0);
                const pRC = Number(row.regular_c || 0);
                const pSC = Number(row.super_c || 0);
                const pMaster = Number(row.master || 0);
                const pIon = Number(row.ion_diesel || 0);

                return {
                    id_empresa: idEmpresa,
                    empresa: getCleanStationName(idEmpresa, row.titulo),
                    flete: stationFletes[idEmpresa] || 0.04000,
                    margen_da: calcMargin(pDA, costD.total),
                    margen_ra: calcMargin(pRA, costR.total),
                    margen_sa: calcMargin(pSA, costS.total),
                    margen_dc: calcMargin(pDC, costD.total),
                    margen_rc: calcMargin(pRC, costR.total),
                    margen_sc: calcMargin(pSC, costS.total),
                    margen_master: calcMargin(pMaster, costD.total),
                    margen_io: calcMargin(pIon, costI.total),
                    precios: {
                        diesel_a: pDA,
                        regular_a: pRA,
                        super_a: pSA,
                        diesel_c: pDC,
                        regular_c: pRC,
                        super_c: pSC,
                        master: pMaster,
                        ion_diesel: pIon
                    },
                    costos: {
                        diesel: costD.total,
                        regular: costR.total,
                        super: costS.total,
                        ion: costI.total
                    },
                    costos_base: {
                        diesel: costD.base,
                        regular: costR.base,
                        super: costS.base,
                        ion: costI.base
                    },
                    desglose_costos: {
                        diesel: costD,
                        regular: costR,
                        super: costS,
                        ion: costI
                    }
                };
            });

        const cDesde = new Date(date + 'T12:00:00'); cDesde.setDate(cDesde.getDate() - 6);
        const promediosDates = []; let pCurr = new Date(cDesde);
        while (pCurr <= new Date(date + 'T12:00:00')) { const d = String(pCurr.getDate()).padStart(2, '0'); const m = String(pCurr.getMonth() + 1).padStart(2, '0'); const y = pCurr.getFullYear(); promediosDates.push(`${d}/${m}/${y}`); pCurr.setDate(pCurr.getDate() + 1); }

        const lecturasTanquesQ = `
            SELECT 
                b.lectura, 
                CASE 
                    WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%DIESEL%' OR (a.id LIKE '%-T' AND b.codigo_producto = '03')) THEN 86
                    WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%SUPER%' OR (a.id LIKE '%-T' AND b.codigo_producto = '01')) THEN 86
                    WHEN a.id_empresa = '008' AND (b.descripcion LIKE '%REGULAR%' OR (a.id LIKE '%-T' AND b.codigo_producto = '02')) THEN 
                        IF(a.id LIKE '%-T', 105, c.galones_reserva)
                    ELSE COALESCE(c.galones_reserva, 0)
                END AS galones_reserva,
                CASE 
                    WHEN a.id_empresa = '008' THEN 
                        CASE 
                            WHEN b.descripcion LIKE '%DIESEL%' OR (a.id LIKE '%-T' AND b.codigo_producto = '03') THEN 'D'
                            WHEN b.descripcion LIKE '%SUPER%' OR (a.id LIKE '%-T' AND b.codigo_producto = '01') THEN 'S'
                            WHEN b.descripcion LIKE '%REGULAR%' OR (a.id LIKE '%-T' AND b.codigo_producto = '02') THEN 'R'
                            ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                        END
                    ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                END AS tipo_combustible, 
                a.id_empresa 
            FROM lecturas_tanque a 
            INNER JOIN detalle_lecturas_tanque b ON a.id = b.id_lectura AND a.id_empresa = b.id_empresa 
            LEFT JOIN tanques c ON b.codigo_producto = c.id AND b.id_empresa = c.id_empresa 
            WHERE a.fecha = ? AND a.turno = (SELECT MAX(x.turno) FROM lecturas_tanque x WHERE x.id_empresa = a.id_empresa AND x.fecha = a.fecha)
        `;

        const [lecturasRows, promediosRows] = await Promise.all([
            externalDb.query(lecturasTanquesQ, [date]),
            externalDb.query(`SELECT a.id_empresa, IF(a.id_empresa = '004' AND a.codigo_producto = '0007','I', LEFT(a.nom_producto,1)) AS tipo_combustible, SUM(a.total) as total_7d FROM cierre_turno_lecturas a INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa = b.id_empresa WHERE b.fecha_turno IN (?) GROUP BY a.id_empresa, tipo_combustible`, [promediosDates])
        ]);
        const lecturas = lecturasRows[0], promedios = promediosRows[0];
        const inventarioLocal = stations.map(s => {
            const id = s.id_empresa;
            const getInv = (tipo) => lecturas.filter(l => l.id_empresa === id && l.tipo_combustible === tipo).reduce((acc, curr) => acc + (Number(curr.lectura || 0) - Number(curr.galones_reserva || 0)), 0);
            const nD = getInv('D'), nR = getInv('R'), nS = getInv('S'), nI = getInv('I');
            const getProm = (tipo) => { const row = promedios.find(p => p.id_empresa === id && p.tipo_combustible === tipo); return (Number(row?.total_7d || 0) / 7); };
            const pD = getProm('D'), pR = getProm('R'), pS = getProm('S'), pI = getProm('I');
            return { empresa: s.titulo, diesel: nD, regular: nR, super: nS, iondiesel: nI, duracion_diesel: pD > 0 ? Math.round((nD / pD) * 10) / 10 : 0, duracion_regular: pR > 0 ? Math.round((nR / pR) * 10) / 10 : 0, duracion_super: pS > 0 ? Math.round((nS / pS) * 10) / 10 : 0, duracion_ion: pI > 0 ? Math.round((nI / pI) * 10) / 10 : 0 };
        });

        res.json({
            tiendas: tiendasLocal,
            estaciones: estacionesLocal,
            margenes: margenesLocal,
            inventario: inventarioLocal,
            quincena: quincenaRow ? {
                periodo_inicio: quincenaRow.periodo_inicio,
                periodo_fin: quincenaRow.periodo_fin,
                precio_diesel: Number(quincenaRow.precio_diesel || 0),
                precio_regular: Number(quincenaRow.precio_regular || 0),
                precio_super: Number(quincenaRow.precio_super || 0),
                precio_ion: Number(quincenaRow.precio_ion || 0),
                fuente: quincenaRow.fuente || 'Portal Puma / DGEHM'
            } : null
        });
    } catch (error) { res.status(500).json({ message: 'Error fetching consolidado' }); }
});

// Obtener fletes de combustible por estación
router.get('/ventas/combustibles/fletes', authenticateToken, async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.query('SELECT * FROM combustible_fletes_estacion ORDER BY id_estacion');
        if (rows && rows.length > 0) return res.json(rows);
    } catch (e) {
        // Fallback default
    }
    res.json([
        { id_estacion: '002', estacion_nombre: 'Puma Miraflores', flete_galon: 0.04630 },
        { id_estacion: '006', estacion_nombre: 'Shell Chalchuapa', flete_galon: 0.03110 },
        { id_estacion: '008', estacion_nombre: 'Puma Costa del Sol', flete_galon: 0.05370 },
        { id_estacion: '014', estacion_nombre: 'Puma San Martin (La Loma)', flete_galon: 0.04690 },
        { id_estacion: '015', estacion_nombre: 'Shell 14 Avenida (Zurita)', flete_galon: 0.02820 },
        { id_estacion: '004', estacion_nombre: 'Puma El Desvio', flete_galon: 0.04000 }
    ]);
});

// Actualizar flete de combustible por estación
router.post('/ventas/combustibles/fletes', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { id_estacion, flete_galon, estacion_nombre } = req.body;
        if (!id_estacion || flete_galon === undefined) {
            return res.status(400).json({ message: 'Se requiere id_estacion y flete_galon' });
        }
        const db = getDb();
        await db.query(`
            INSERT INTO combustible_fletes_estacion (id_estacion, estacion_nombre, flete_galon, activo)
            VALUES (?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE flete_galon = VALUES(flete_galon), estacion_nombre = COALESCE(VALUES(estacion_nombre), estacion_nombre)
        `, [id_estacion, estacion_nombre || id_estacion, Number(flete_galon)]);
        res.json({ message: 'Flete actualizado exitosamente', id_estacion, flete_galon: Number(flete_galon) });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar flete de combustible');
    }
});

const getCleanStationName = (id, defaultTitulo) => {
    if (!defaultTitulo) return '';
    const upper = defaultTitulo.toUpperCase();
    if (id === '002' && (upper.includes('MIRAFLORES') || upper === '002')) return 'Puma Miraflores';
    if (id === '006' && (upper.includes('CHALCHUAPA') || upper === '006')) return 'Shell Chalchuapa';
    if (id === '008' && (upper.includes('COSTA') || upper === '008')) return 'Puma Costa del Sol';
    if (id === '014' && (upper.includes('SAN MARTIN') || upper.includes('LA LOMA') || upper === '014')) return 'Puma La Loma (San Martín)';
    if (id === '015' && (upper.includes('14') || upper === '015')) return 'Shell 14 Avenida';
    return defaultTitulo;
};

const getCleanTiendaName = (id, defaultTitulo) => {
    if (!defaultTitulo) return '';
    const upper = defaultTitulo.toUpperCase();
    if (id === '002' && upper.includes('MIRAFLORES')) return 'E-Market Miraflores';
    if (id === '006' && upper.includes('CHALCHUAPA')) return 'E-Market Chalchuapa';
    if (id === '008' && upper.includes('COSTA')) return 'Super 7 Costa';
    if (id === '014' && (upper.includes('SAN MARTIN') || upper.includes('LA LOMA'))) return 'E-Market San Martin';
    if (id === '009' && upper.includes('PEDREGAL')) return 'Super El Pedregal';
    return defaultTitulo;
};

const normalizeStationName = (name) => {
    if (!name) return '';
    return name
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(ESTACION DE SERVICIO|ESTACION|ES|E-MARKET|EMARKET|TIENDA|PISTA|MARKET|DE SERVICIO|PUMA|SHELL|SUPER 7|SUPER7|SELECT|UNO|TEXACO)\b/gi, '')
        .replace(/[^A-Z0-9]/g, '')
        .trim();
};

const getResumenMensualData = async (externalDb, yearNum, monthNum, accountingDbParam = null) => {
    const y = parseInt(yearNum, 10);
    const m = parseInt(monthNum, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12 || y < 2000 || y > 2100) {
        throw new Error('Año o mes inválido');
    }

    const monthStr = String(m).padStart(2, '0');
    const daysInMonth = new Date(y, m, 0).getDate();
    const startDate = `${y}-${monthStr}-01`;
    const endDate = `${y}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    // 1. Si se inyecta accountingDbParam explícitamente (ej. en pruebas unitarias), procesar SaaS
    if (accountingDbParam) {
        try {
            const sqlSaasEstaciones = `
                SELECT 
                    b.id as id_empresa,
                    b.nombre as empresa,
                    COALESCE(SUM(r.diferencia), 0.0) as galonaje,
                    COALESCE(SUM(r.monto), 0.0) as venta_estacion,
                    COALESCE(SUM(CASE WHEN (r.codigo_producto LIKE '%DIE%' AND r.codigo_producto NOT LIKE '%ION%') OR p.tipo_combustible = 3 THEN r.diferencia ELSE 0 END), 0.0) as diesel,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%REG%' OR p.tipo_combustible = 1 THEN r.diferencia ELSE 0 END), 0.0) as regular,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%SUP%' OR p.tipo_combustible = 2 THEN r.diferencia ELSE 0 END), 0.0) as super,
                    COALESCE(SUM(CASE WHEN r.codigo_producto LIKE '%ION%' OR p.tipo_combustible = 4 THEN r.diferencia ELSE 0 END), 0.0) as ion
                FROM branches b
                JOIN gas_station_closeouts c ON b.id = c.branch_id
                JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
                LEFT JOIN products p ON r.product_id = p.id
                WHERE c.estado = 'cerrado' AND c.fecha_turno BETWEEN ? AND ?
                GROUP BY b.id, b.nombre
                ORDER BY b.id
            `;
            const [saasEstRows] = await withRetry(() => accountingDbParam.query(sqlSaasEstaciones, [startDate, endDate]));

            if (saasEstRows && saasEstRows.length > 0) {
                const sqlSaasTiendas = `
                    SELECT 
                        b.id as id_empresa,
                        b.nombre as empresa,
                        COALESCE(SUM(sh.total_pagar), 0.0) as venta,
                        COUNT(DISTINCT sh.fecha_emision) as dias_con_venta,
                        IFNULL(AVG(sh.total_pagar), 0.0) as promedio_diario
                    FROM branches b
                    LEFT JOIN sales_headers sh ON b.id = sh.branch_id AND (sh.estado = 'emitido' OR sh.status = 'COMPLETED') AND sh.fecha_emision BETWEEN ? AND ?
                    WHERE b.id IN (SELECT DISTINCT branch_id FROM gas_station_closeouts WHERE estado = 'cerrado' AND fecha_turno BETWEEN ? AND ?)
                       OR sh.total_pagar > 0
                    GROUP BY b.id, b.nombre
                    ORDER BY b.id
                `;
                const [saasTiendasRows] = await withRetry(() => accountingDbParam.query(sqlSaasTiendas, [startDate, endDate, startDate, endDate]));

                const estacionesLocal = saasEstRows.map(row => ({
                    id_empresa: String(row.id_empresa),
                    empresa: row.empresa,
                    diesel: Math.round(Number(row.diesel || 0) * 100) / 100,
                    regular: Math.round(Number(row.regular || 0) * 100) / 100,
                    super: Math.round(Number(row.super || 0) * 100) / 100,
                    ion: Math.round(Number(row.ion || 0) * 100) / 100,
                    galonaje: Math.round(Number(row.galonaje || 0) * 100) / 100,
                    venta: Math.round(Number(row.venta_estacion || 0) * 100) / 100
                }));

                const tiendasLocal = (saasTiendasRows || []).map(row => ({
                    id_empresa: String(row.id_empresa),
                    empresa: row.empresa,
                    venta: Math.round(Number(row.venta || 0) * 100) / 100,
                    dias_con_venta: Number(row.dias_con_venta || 0),
                    promedio_diario: Math.round(Number(row.promedio_diario || 0) * 100) / 100
                }));

                const consolidadoLocal = estacionesLocal.map(e => {
                    const t = tiendasLocal.find(tienda => String(tienda.id_empresa) === String(e.id_empresa));
                    const vTienda = t ? t.venta : 0;
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

router.get('/ventas/resumen-mensual/:periodo', authenticateToken, async (req, res) => {
    try {
        const { periodo } = req.params;
        let year, month;
        if (/^\d{4}-\d{1,2}$/.test(periodo)) {
            const parts = periodo.split('-');
            year = parts[0];
            month = parts[1];
        } else if (/^\d{4}$/.test(periodo) && req.query.month) {
            year = periodo;
            month = req.query.month;
        } else {
            return res.status(400).json({ message: 'Formato de período inválido. Debe ser YYYY-MM' });
        }

        const externalDb = await getExternalDb();
        const data = await getResumenMensualData(externalDb, year, month);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar resumen mensual de ventas');
    }
});

router.get('/ventas/resumen-mensual/:year/:month', authenticateToken, async (req, res) => {
    try {
        const { year, month } = req.params;
        const externalDb = await getExternalDb();
        const data = await getResumenMensualData(externalDb, year, month);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar resumen mensual de ventas');
    }
});

const getComparativoAnualData = async (externalDb, anioPrincipalParam, anioCompararParam) => {
    const currentYear = new Date().getFullYear();
    const anioPrincipal = parseInt(anioPrincipalParam || currentYear, 10);
    const anioComparar = parseInt(anioCompararParam || (anioPrincipal - 1), 10);

    if (isNaN(anioPrincipal) || isNaN(anioComparar) || anioPrincipal < 2000 || anioPrincipal > 2100 || anioComparar < 2000 || anioComparar > 2100) {
        throw new Error('Años inválidos para el comparativo');
    }

    const strPrincipal = String(anioPrincipal);
    const strComparar = String(anioComparar);

    // 1. Obtener lista de estaciones activas (excluyendo 004 El Desvío)
    const [stationRows] = await withRetry(() => externalDb.query(
        "SELECT id_empresa, titulo, orden FROM web_consolidado WHERE grupo = 'ESTACION' AND id_empresa != '004' ORDER BY orden"
    ));

    const estaciones = (stationRows || []).map(s => ({
        id_empresa: String(s.id_empresa),
        nombre: getCleanStationName(String(s.id_empresa), s.titulo)
    }));

    // 2. Consultar combustibles para ambos años
    const sqlCombustibles = `
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
        WHERE RIGHT(ct.fecha_turno, 4) IN (?, ?)
          AND ct.id_empresa != '004'
        GROUP BY anio, mes, ct_l.id_empresa
        ORDER BY anio, mes, ct_l.id_empresa
    `;
    const [fuelRows] = await withRetry(() => externalDb.query(sqlCombustibles, [strPrincipal, strComparar]));

    // 3. Consultar ventas de tienda para ambos años
    const sqlTiendas = `
        SELECT 
            CAST(YEAR(fecha) AS CHAR) as anio,
            MONTH(fecha) as mes,
            id_empresa,
            IFNULL(SUM(monto), 0.0) as venta_tienda
        FROM ventas_tienda
        WHERE YEAR(fecha) IN (?, ?) AND id_empresa != '004'
        GROUP BY anio, mes, id_empresa
        ORDER BY anio, mes, id_empresa
    `;
    const [tiendaRows] = await withRetry(() => externalDb.query(sqlTiendas, [anioPrincipal, anioComparar]));

    // 4. Obtener años disponibles en la base de datos
    let aniosDisponibles = [anioPrincipal, anioComparar];
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
            const set = new Set(yearsRows.map(r => parseInt(r.anio, 10)).filter(y => !isNaN(y)));
            set.add(anioPrincipal);
            set.add(anioComparar);
            aniosDisponibles = Array.from(set).sort((a, b) => b - a);
        }
    } catch {
        // Fallback a los años consultados si la subconsulta fallara
    }

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

router.get('/ventas/comparativo-anual', authenticateToken, async (req, res) => {
    try {
        const { anioPrincipal, anioComparar, anio1, anio2, anio } = req.query;
        const pYear = anioPrincipal || anio1 || anio || new Date().getFullYear();
        const cYear = anioComparar || anio2 || (parseInt(pYear, 10) - 1);

        const externalDb = await getExternalDb();
        const data = await getComparativoAnualData(externalDb, pYear, cYear);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar comparativo anual de ventas');
    }
});

router.normalizeStationName = normalizeStationName;
router.getResumenMensualData = getResumenMensualData;
router.getComparativoAnualData = getComparativoAnualData;
router.getCleanStationName = getCleanStationName;
router.getCleanTiendaName = getCleanTiendaName;

router.get('/ventas/lubricantes/:start/:end', authenticateToken, async (req, res) => {
    const { start, end } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const externalDb = await getExternalDb();
        const datesArray = []; 
        let curr = new Date(start + 'T12:00:00');
        const endDate = new Date(end + 'T12:00:00');
        while (curr <= endDate && datesArray.length < 366) { 
            const day = String(curr.getDate()).padStart(2, '0'); 
            const month = String(curr.getMonth() + 1).padStart(2, '0'); 
            const year = curr.getFullYear(); 
            datesArray.push(`${day}/${month}/${year}`); 
            curr.setDate(curr.getDate() + 1); 
        }
        if (datesArray.length === 0) {
            return res.json([]);
        }
        const sql = `SELECT a.id_empresa, a.titulo, IFNULL(SUM(b.precio_total), 0.0) as monto FROM web_consolidado a LEFT JOIN inventario_lubricantes b ON a.id_empresa = b.id_empresa AND b.fecha_turno IN (?) WHERE a.grupo = 'ESTACION' GROUP BY id_empresa ORDER BY a.orden`;
        const [rows] = await externalDb.query(sql, [datesArray]);
        res.json(rows.map(r => ({ empresa: r.titulo, venta: Number(r.monto || 0) })));
    } catch (error) { 
        console.error('Error fetching lubricantes:', error);
        res.status(500).json({ message: 'Error fetching lubricantes' }); 
    }
});

router.get('/ventas/resumen-cierre/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const externalDb = await getExternalDb();
        const parts = date.split('-'); 
        const sysDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        const sql = `
            SELECT x.titulo AS estacion,
                   (SELECT IFNULL(SUM(b.total_descuento),0.0) FROM cierre_turno a INNER JOIN cierre_turno_credito b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS creditos,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_cupones b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS cupones,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_cheques b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS cheques,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_tarjeta b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS tarjetas,
                   (SELECT IFNULL(SUM(b.efectivo),0.0) + IFNULL(SUM(b.monedas),0.0) + IFNULL(SUM(b.transferencia),0.0) FROM cierre_turno a INNER JOIN cierre_turno_remesa b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS remesas,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_gastos b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS gastos,
                   (SELECT IFNULL(SUM(precio_total),0.0) FROM inventario_lubricantes WHERE id_empresa=x.id_empresa AND fecha_turno=?) AS lubricantes,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_anticipos b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS anticipos,
                   (SELECT IFNULL(SUM(b.valor),0.0) FROM cierre_turno a INNER JOIN cierre_turno_pagos b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS pagos,
                   (SELECT IFNULL(SUM(b.valor*b.cantidad),0.0) FROM cierre_turno a INNER JOIN cierre_turno_descuentos b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS descuentos,
                   (SELECT IFNULL(SUM(b.monto),0.0) FROM cierre_turno a INNER JOIN cierre_turno_lecturas b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS total_venta,
                   x.id_empresa 
            FROM web_consolidado x WHERE x.grupo = 'ESTACION' ORDER BY x.titulo
        `;
        const params = Array(11).fill(sysDate);
        const [rows] = await externalDb.query(sql, params);
        res.json(rows.map(r => {
            const monto = Number(r.creditos) + Number(r.cupones) + Number(r.cheques) + Number(r.tarjetas) + Number(r.remesas) + Number(r.gastos) + Number(r.anticipos) + Number(r.pagos) + Number(r.descuentos);
            const venta = Number(r.total_venta) + Number(r.lubricantes);
            return { empresa: r.estacion, credito: Number(r.creditos), cupones: Number(r.cupones), cheques: Number(r.cheques), tarjetas: Number(r.tarjetas), remesas: Number(r.remesas), gastos: Number(r.gastos), lubricantes: Number(r.lubricantes), anticipos: Number(r.anticipos), pagos: Number(r.pagos), descuentos: Number(r.descuentos), suma: Math.round(monto * 100) / 100, tot_venta: Math.round(venta * 100) / 100, diferencia: Math.round((monto - venta) * 100) / 100 };
        }));
    } catch (error) { 
        console.error('Error fetching resumen:', error);
        res.status(500).json({ message: 'Error fetching resumen' }); 
    }
});

router.get('/ventas/precios-estacion/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const externalDb = await getExternalDb();
        const parts = date.split('-'); 
        const sysDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        const sql = `select a.id_empresa,a.titulo, sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'A',c.precio,0.0),0.0)) as diesel_a,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'A',c.precio,0.0),0.0)) as regular_a,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'A',c.precio,0.0),0.0)) as super_a, sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'F',c.precio,0.0),0.0)) as diesel_c,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'F',c.precio,0.0),0.0)) as regular_c,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'F',c.precio,0.0),0.0)) as super_c, sum(ifnull(if(b.clasificacion = 'I',c.precio,0.0),0.0)) as ion_diesel,sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'M',c.precio,0.0),0.0)) as master from web_consolidado a left join cfg_combustibles b on a.id_empresa = b.id_empresa left join ( SELECT a.id_empresa,a.id_producto, a.codigo_producto,a.nom_producto,precio FROM cierre_turno_lecturas a INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa=b.id_empresa WHERE b.fecha_turno = ? AND b.turno = (SELECT MAX(x.turno) FROM cierre_turno x WHERE x.id_empresa=b.id_empresa AND x.fecha_turno=b.fecha_turno) GROUP BY codigo_producto,a.id_empresa order by id_empresa,codigo_producto) c on b.id_empresa = c.id_empresa and b.codigo = c.codigo_producto where a.grupo = 'ESTACION' group by id_empresa order by orden`;
        const [rows] = await externalDb.query(sql, [sysDate]);
        res.json(rows.map(r => ({ empresa: r.titulo, diesel_a: Number(r.diesel_a), regular_a: Number(r.regular_a), super_a: Number(r.super_a), diesel_c: Number(r.diesel_c), regular_c: Number(r.regular_c), super_c: Number(r.super_c), ion_diesel: Number(r.ion_diesel), master: Number(r.master) })));
    } catch (error) { 
        console.error('Error fetching precios:', error);
        res.status(500).json({ message: 'Error fetching precios' }); 
    }
});

router.get('/consultas/cumpleanos', authenticateToken, async (req, res) => {
    try {
        const accountingDb = await getAccountingDb();
        const query = `
            SELECT 
                CONCAT(TRIM(e.nombres), ' ', TRIM(e.apellidos)) AS nombre,
                DATE_FORMAT(e.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
                c.razon_social AS empresa,
                COALESCE(d.descripcion, 'Sin asignar') AS departamento
            FROM rh_empleados e
            JOIN companies c ON e.company_id = c.id
            LEFT JOIN rh_departamentos d ON e.departamento_personal_id = d.id
            WHERE e.es_activo = 1 
              AND e.fecha_nacimiento IS NOT NULL 
              AND MONTH(e.fecha_nacimiento) = MONTH(CURRENT_DATE())
            ORDER BY c.razon_social, d.descripcion, DAY(e.fecha_nacimiento)
        `;
        const [rows] = await accountingDb.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching cumpleanos:', error.message);
        res.status(500).json({ message: 'Error fetching cumpleanos' });
    }
});

router.get('/consultas/diferencias-combustible/:desde/:hasta', authenticateToken, async (req, res) => {
    const { desde, hasta } = req.params;
    try {
        const externalDb = await getExternalDb();
        const datesArray = []; let curr = new Date(desde + 'T12:00:00');
        while (curr <= new Date(hasta + 'T12:00:00')) { const day = String(curr.getDate()).padStart(2, '0'); const month = String(curr.getMonth() + 1).padStart(2, '0'); const year = curr.getFullYear(); datesArray.push(`${day}/${month}/${year}`); curr.setDate(curr.getDate() + 1); }
        const sql1 = `select x.id_empresa, a.titulo as estacion, z.clasificacion as tipo, 0.0 as inicial, 0.0 as recargas, sum(y.total) as venta, 0.0 as final, 0.0 as suma, 0.0 as diferencia from cierre_turno x inner join cierre_turno_lecturas y on x.id_empresa = y.id_empresa and x.id = y.id_cierre_turno inner join cfg_combustibles z on y.id_empresa = z.id_empresa and y.id_producto = z.id_producto inner join web_consolidado a on x.id_empresa = a.id_empresa where x.fecha_turno IN (?) and a.grupo = 'ESTACION' group by x.id_empresa, a.titulo, z.clasificacion, a.orden order by a.orden, z.clasificacion`;
        const [dt_result] = await externalDb.query(sql1, [datesArray]);
        const sql2 = `
            SELECT 
                a.id_empresa,
                a.fecha,
                a.turno,
                CASE 
                    WHEN a.id_empresa = '008' THEN 
                        CASE 
                            WHEN b.descripcion LIKE '%DIESEL%' OR (a.id LIKE '%-T' AND b.codigo_producto = '03') THEN 'D'
                            WHEN b.descripcion LIKE '%SUPER%' OR (a.id LIKE '%-T' AND b.codigo_producto = '01') THEN 'S'
                            WHEN b.descripcion LIKE '%REGULAR%' OR (a.id LIKE '%-T' AND b.codigo_producto = '02') THEN 'R'
                            ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                        END
                    ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                END AS tipo_combustible,
                SUM(b.anterior) AS anterior,
                SUM(b.recarga) AS recarga,
                SUM(b.lectura) AS lectura 
            FROM lecturas_tanque a 
            INNER JOIN detalle_lecturas_tanque b ON a.id_empresa = b.id_empresa AND a.id = b.id_lectura 
            LEFT JOIN tanques c ON a.id_empresa = c.id_empresa AND b.codigo_producto = c.id 
            WHERE a.fecha BETWEEN ? AND ? 
            GROUP BY 
                a.id_empresa,
                CASE 
                    WHEN a.id_empresa = '008' THEN 
                        CASE 
                            WHEN b.descripcion LIKE '%DIESEL%' OR (a.id LIKE '%-T' AND b.codigo_producto = '03') THEN 'D'
                            WHEN b.descripcion LIKE '%SUPER%' OR (a.id LIKE '%-T' AND b.codigo_producto = '01') THEN 'S'
                            WHEN b.descripcion LIKE '%REGULAR%' OR (a.id LIKE '%-T' AND b.codigo_producto = '02') THEN 'R'
                            ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                        END
                    ELSE IF(c.tipo_combustible='M','I',c.tipo_combustible)
                END,
                a.fecha,
                a.turno 
            ORDER BY a.id_empresa, a.fecha, a.turno
        `;
        const [dt_movi] = await externalDb.query(sql2, [desde, hasta]);
        res.json(dt_result.map(fila => {
            let inicial = 0.0, final = 0.0; const FindRow = dt_movi.filter(m => String(m.id_empresa) === String(fila.id_empresa) && String(m.tipo_combustible) === String(fila.tipo));
            if (FindRow.length > 0) { inicial = Number(FindRow[0].anterior) || 0.0; final = Number(FindRow[FindRow.length - 1].lectura) || 0.0; }
            const recargas = FindRow.reduce((sum, current) => sum + (Number(current.recarga) || 0), 0);
            const suma = inicial + recargas - Number(fila.venta);
            return { empresa: fila.estacion, combustible: fila.tipo, inicial, recargas, venta: Number(fila.venta), final, suma, diferencia: final - suma };
        }));
    } catch (error) { res.status(500).json({ message: 'Error fetching diferencias' }); }
});

router.get('/consultas/estaciones/precios-competencia', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const query = `SELECT c.titulo, a.estacion, a.modificacion, a.super_c, a.regular_c, a.ion_c, a.diesel_c, a.super_a, a.regular_a, a.ion_a, a.diesel_a, IFNULL(b.es_propia, 0) as es_propia FROM web_precios_competencia a INNER JOIN web_estaciones_competencia b ON a.estacion = b.competencia INNER JOIN web_consolidado c ON b.id_estacion = c.id_empresa AND c.grupo = 'ESTACION' ORDER BY c.titulo, b.es_propia DESC, a.estacion`;
        const [rows] = await withRetry(() => externalDb.query(query));
        const [meta] = await withRetry(() => externalDb.query('SELECT MAX(created_at) as ultima_validacion FROM web_precios_competencia_historial'));
        res.json({
            data: rows,
            ultimaValidacion: meta[0]?.ultima_validacion || null,
            total: rows.length
        });
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar precios de competencia'); 
    }
});

router.get('/consultas/estaciones/precios-competencia/estaciones', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [rows] = await withRetry(() => externalDb.query('SELECT id, competencia, id_estacion, IFNULL(es_propia, 0) as es_propia FROM web_estaciones_competencia'));
        res.json(rows);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar estaciones de competencia'); 
    }
});

router.get('/consultas/estaciones/precios-competencia/catalogo', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const [estacionesSistema] = await withRetry(() => externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden, titulo"));
        const [estacionesMonitoreadas] = await withRetry(() => externalDb.query(`
            SELECT a.ID as id, a.id_estacion, b.titulo as estacion_sistema, a.competencia, IFNULL(a.es_propia, 0) as es_propia 
            FROM web_estaciones_competencia a 
            LEFT JOIN web_consolidado b ON a.id_estacion = b.id_empresa AND b.grupo = 'ESTACION'
            ORDER BY b.titulo, a.es_propia DESC, a.competencia
        `));
        
        let catalogoDgehm = [];
        try {
            catalogoDgehm = require('../data/dgehm_estaciones.json');
        } catch (e) {
            catalogoDgehm = [];
        }

        res.json({
            estaciones_sistema: estacionesSistema,
            estaciones_monitoreadas: estacionesMonitoreadas,
            catalogo_dgehm: catalogoDgehm
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al cargar catálogo de estaciones de competencia');
    }
});

router.post('/consultas/estaciones/precios-competencia/estaciones', authenticateToken, requirePermission(['manage_precios_competencia', '/dashboard/consultas/estaciones/precios-competencia']), async (req, res) => {
    try {
        const { id_estacion, competencia, es_propia } = req.body;
        if (!id_estacion || !competencia || !competencia.trim()) {
            return res.status(400).json({ message: 'La estación del sistema y el nombre de la estación son requeridos.' });
        }

        const externalDb = await getExternalDb();
        const compTrimmed = competencia.trim();
        const isPropiaNum = (es_propia === 1 || es_propia === true || es_propia === '1') ? 1 : 0;

        // Validar que no exista ya para la misma estación del sistema
        const [existing] = await withRetry(() => externalDb.query(
            'SELECT ID FROM web_estaciones_competencia WHERE id_estacion = ? AND UPPER(competencia) = UPPER(?)',
            [id_estacion, compTrimmed]
        ));
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Esta estación ya se encuentra asignada a esta sucursal.' });
        }

        // Si se marca como propia, desmarcar cualquier otra estación propia previa en la misma sucursal
        if (isPropiaNum === 1) {
            await withRetry(() => externalDb.query(
                'UPDATE web_estaciones_competencia SET es_propia = 0 WHERE id_estacion = ?',
                [id_estacion]
            ));
        }

        const [result] = await withRetry(() => externalDb.query(
            'INSERT INTO web_estaciones_competencia (id_estacion, competencia, es_propia) VALUES (?, ?, ?)',
            [id_estacion, compTrimmed, isPropiaNum]
        ));

        res.json({
            message: 'Estación asignada correctamente',
            id: result.insertId,
            id_estacion,
            competencia: compTrimmed,
            es_propia: isPropiaNum
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al agregar estación');
    }
});

router.put('/consultas/estaciones/precios-competencia/estaciones/:id', authenticateToken, requirePermission(['manage_precios_competencia', '/dashboard/consultas/estaciones/precios-competencia']), async (req, res) => {
    const { id } = req.params;
    const { competencia, es_propia, id_estacion } = req.body;
    try {
        const externalDb = await getExternalDb();
        const [current] = await withRetry(() => externalDb.query('SELECT * FROM web_estaciones_competencia WHERE ID = ?', [id]));
        if (current.length === 0) {
            return res.status(404).json({ message: 'Estación no encontrada' });
        }

        const newComp = competencia !== undefined ? competencia.trim() : current[0].competencia;
        const newPropia = es_propia !== undefined ? ((es_propia === 1 || es_propia === true || es_propia === '1') ? 1 : 0) : current[0].es_propia;
        const newIdEstacion = id_estacion !== undefined ? id_estacion : current[0].id_estacion;

        // Si se marca como propia (1), desmarcar cualquier otra estación propia para la misma sucursal
        if (newPropia === 1) {
            await withRetry(() => externalDb.query(
                'UPDATE web_estaciones_competencia SET es_propia = 0 WHERE id_estacion = ? AND ID != ?',
                [newIdEstacion, id]
            ));
        }

        await withRetry(() => externalDb.query(
            'UPDATE web_estaciones_competencia SET competencia = ?, es_propia = ?, id_estacion = ? WHERE ID = ?',
            [newComp, newPropia, newIdEstacion, id]
        ));

        res.json({ message: 'Estación actualizada con éxito', id, competencia: newComp, es_propia: newPropia, id_estacion: newIdEstacion });
    } catch (error) {
        sendSafeError(res, error, 'Error al actualizar estación');
    }
});

router.delete('/consultas/estaciones/precios-competencia/estaciones/:id', authenticateToken, requirePermission(['manage_precios_competencia', '/dashboard/consultas/estaciones/precios-competencia']), async (req, res) => {
    const { id } = req.params;
    try {
        const externalDb = await getExternalDb();
        const [rows] = await withRetry(() => externalDb.query('SELECT * FROM web_estaciones_competencia WHERE ID = ?', [id]));
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Estación no encontrada' });
        }
        const stationName = rows[0].competencia;

        await withRetry(() => externalDb.query('DELETE FROM web_estaciones_competencia WHERE ID = ?', [id]));

        // Si la estación ya no figura en ninguna sucursal, limpiar de web_precios_competencia
        const [stillExists] = await withRetry(() => externalDb.query('SELECT ID FROM web_estaciones_competencia WHERE competencia = ?', [stationName]));
        if (stillExists.length === 0) {
            await withRetry(() => externalDb.query('DELETE FROM web_precios_competencia WHERE estacion = ?', [stationName]));
        }

        res.json({ message: `Estación "${stationName}" quitada correctamente` });
    } catch (error) {
        sendSafeError(res, error, 'Error al quitar estación');
    }
});

router.get('/consultas/estaciones/precios', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        const date = new Date().toISOString().split('T')[0];
        const parts = date.split('-'); const sysDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        const sql = `select a.id_empresa,a.titulo, sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'A',c.precio,0.0),0.0)) as diesel_a,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'A',c.precio,0.0),0.0)) as regular_a,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'A',c.precio,0.0),0.0)) as super_a, sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'F',c.precio,0.0),0.0)) as diesel_c,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'F',c.precio,0.0),0.0)) as regular_c,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'F',c.precio,0.0),0.0)) as super_c, sum(ifnull(if(b.clasificacion = 'I',c.precio,0.0),0.0)) as ion_diesel,sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'M',c.precio,0.0),0.0)) as master from web_consolidado a left join cfg_combustibles b on a.id_empresa = b.id_empresa left join ( SELECT a.id_empresa,a.id_producto, a.codigo_producto,a.nom_producto,precio FROM cierre_turno_lecturas a INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa=b.id_empresa WHERE b.fecha_turno = ? AND b.turno = (SELECT MAX(x.turno) FROM cierre_turno x WHERE x.id_empresa=b.id_empresa AND x.fecha_turno=b.fecha_turno) GROUP BY codigo_producto,a.id_empresa order by id_empresa,codigo_producto) c on b.id_empresa = c.id_empresa and b.codigo = c.codigo_producto where a.grupo = 'ESTACION' group by id_empresa order by orden`;
        const [rows] = await withRetry(() => externalDb.query(sql, [sysDate]));
        res.json(rows.map(r => ({ empresa: r.titulo, diesel_a: Number(r.diesel_a), regular_a: Number(r.regular_a), super_a: Number(r.super_a), diesel_c: Number(r.diesel_c), regular_c: Number(r.regular_c), super_c: Number(r.super_c), ion_diesel: Number(r.ion_diesel), master: Number(r.master) })));
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar precios por estación'); 
    }
});

router.post('/consultas/estaciones/precios-competencia/sync-dgehm', authenticateToken, requirePermission(['manage_precios_competencia', '/dashboard/consultas/estaciones/precios-competencia']), async (req, res) => {
    try {
        const axios = require('axios');
        const https = require('https');
        const agent = new https.Agent({ rejectUnauthorized: false });

        const url = 'https://sinapp.dgehm.gob.sv/DRHM/estadisticas.aspx?uid=2';
        let res1;
        try {
            res1 = await axios.get(url, {
                httpsAgent: agent,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 10000
            });
        } catch (fetchErr) {
            console.error('Error connecting to DGEHM from cloud:', fetchErr.message);
            return res.status(504).json({ 
                isCloudBlocked: true,
                message: 'El portal gubernamental DGEHM no responde a conexiones desde la nube (cortafuegos de seguridad gubernamental). Por favor descarga el archivo CSV desde el portal y súbelo con el botón "Cargar Archivo".' 
            });
        }

        const rawCookies = res1.headers['set-cookie'];
        const cookies = rawCookies ? rawCookies.map(c => c.split(';')[0]).join('; ') : '';
        const match = res1.data.match(/"ExportUrlBase":"([^"]+)"/);
        if (!match) {
            return res.status(502).json({ message: 'No se pudo obtener el endpoint de reporte de la DGEHM' });
        }

        const exportUrl = 'https://sinapp.dgehm.gob.sv' + match[1].replace(/\\u0026/g, '&') + 'CSV';
        const res2 = await axios.get(exportUrl, {
            httpsAgent: agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Cookie': cookies,
                'Referer': url
            },
            timeout: 35000
        });

        const csvText = String(res2.data || '');
        const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length <= 1) {
            return res.status(502).json({ message: 'El reporte de DGEHM vino vacío' });
        }

        // Helper to parse CSV lines safely
        const parseLine = (line) => {
            const cols = [];
            let cur = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') inQuotes = !inQuotes;
                else if (ch === ',' && !inQuotes) { cols.push(cur.trim()); cur = ''; }
                else cur += ch;
            }
            cols.push(cur.trim());
            return cols;
        };

        const parsedRows = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseLine(lines[i]);
            if (cols.length < 14) continue;
            parsedRows.push({
                estacion: cols[2],
                modificacion: cols[3],
                super_c: cols[4],
                regular_c: cols[5],
                ion_c: cols[7],
                diesel_c: cols[8],
                super_a: cols[9],
                regular_a: cols[10],
                ion_a: cols[12],
                diesel_a: cols[13]
            });
        }

        const externalDb = await getExternalDb();
        const [mappedStations] = await externalDb.query('SELECT competencia FROM web_estaciones_competencia');

        const norm = str => (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
        const mappedMap = new Map();
        mappedStations.forEach(m => {
            mappedMap.set(norm(m.competencia), m.competencia);
        });

        const matchedRows = [];
        const seenStations = new Set();
        parsedRows.forEach(row => {
            const nName = norm(row.estacion);
            if (mappedMap.has(nName)) {
                const dbName = mappedMap.get(nName);
                if (!seenStations.has(dbName)) {
                    seenStations.add(dbName);
                    matchedRows.push({
                        estacion: dbName,
                        modificacion: row.modificacion,
                        super_c: row.super_c,
                        regular_c: row.regular_c,
                        ion_c: row.ion_c,
                        diesel_c: row.diesel_c,
                        super_a: row.super_a,
                        regular_a: row.regular_a,
                        ion_a: row.ion_a,
                        diesel_a: row.diesel_a
                    });
                }
            }
        });

        if (matchedRows.length === 0) {
            return res.status(404).json({ message: 'No se encontraron coincidencias entre el reporte DGEHM y las estaciones configuradas' });
        }

        const cleanNum = (val) => {
            const s = String(val || '');
            const cleaned = s.replace(/[^0-9.-]/g, '');
            const n = Number(cleaned);
            return isNaN(n) ? 0 : n;
        };

        const today = new Date().toISOString().split('T')[0];
        const conn = await externalDb.getConnection();
        await conn.beginTransaction();
        try {
            // 1. Update snapshot
            await conn.query('DELETE FROM web_precios_competencia');
            const insertSql = 'INSERT INTO web_precios_competencia (estacion, modificacion, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a) VALUES ?';
            const values = matchedRows.map(r => [
                r.estacion, r.modificacion,
                cleanNum(r.super_c), cleanNum(r.regular_c), cleanNum(r.ion_c), cleanNum(r.diesel_c),
                cleanNum(r.super_a), cleanNum(r.regular_a), cleanNum(r.ion_a), cleanNum(r.diesel_a)
            ]);
            await conn.query(insertSql, [values]);

            // 2. Update historical table
            for (const r of matchedRows) {
                await conn.query(`
                    INSERT INTO web_precios_competencia_historial 
                    (estacion, modificacion, fecha_registro, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        modificacion = VALUES(modificacion),
                        super_c = VALUES(super_c),
                        regular_c = VALUES(regular_c),
                        ion_c = VALUES(ion_c),
                        diesel_c = VALUES(diesel_c),
                        super_a = VALUES(super_a),
                        regular_a = VALUES(regular_a),
                        ion_a = VALUES(ion_a),
                        diesel_a = VALUES(diesel_a)
                `, [
                    r.estacion, r.modificacion, today,
                    cleanNum(r.super_c), cleanNum(r.regular_c), cleanNum(r.ion_c), cleanNum(r.diesel_c),
                    cleanNum(r.super_a), cleanNum(r.regular_a), cleanNum(r.ion_a), cleanNum(r.diesel_a)
                ]);
            }

            await conn.commit();
            res.json({
                message: `Precios sincronizados exitosamente desde DGEHM (${matchedRows.length} estaciones actualizadas)`,
                count: matchedRows.length,
                totalConfigured: mappedStations.length,
                totalDGEHM: parsedRows.length
            });
        } catch (dbErr) {
            await conn.rollback();
            throw dbErr;
        } finally {
            conn.release();
        }
    } catch (error) {
        sendSafeError(res, error, 'Error al sincronizar precios con DGEHM');
    }
});

router.post('/consultas/estaciones/precios-competencia/upload', authenticateToken, requirePermission(['manage_precios_competencia', '/dashboard/consultas/estaciones/precios-competencia']), async (req, res) => {
    try {
        const { data } = req.body;
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ message: 'No data provided' });
        }
        const externalDb = await getExternalDb();
        const conn = await externalDb.getConnection();
        await conn.beginTransaction();
        try {
            await conn.query('DELETE FROM web_precios_competencia');
            const insertSql = 'INSERT INTO web_precios_competencia (estacion, modificacion, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a) VALUES ?';
            const cleanNum = (val) => {
                const s = String(val || '');
                const cleaned = s.replace(/[^0-9.-]/g, '');
                const n = Number(cleaned);
                return isNaN(n) ? 0 : n;
            };
            const today = new Date().toISOString().split('T')[0];
            const values = data.map(row => [
                row.estacion, row.modificacion, cleanNum(row.super_c), cleanNum(row.regular_c),
                cleanNum(row.ion_c), cleanNum(row.diesel_c), cleanNum(row.super_a),
                cleanNum(row.regular_a), cleanNum(row.ion_a), cleanNum(row.diesel_a)
            ]);
            console.log('UPLOAD precios competencia - count:', data.length, 'first row:', JSON.stringify(data[0]), 'first values:', JSON.stringify(values[0]));
            await conn.query(insertSql, [values]);

            // Save to history
            for (const row of data) {
                await conn.query(`
                    INSERT INTO web_precios_competencia_historial 
                    (estacion, modificacion, fecha_registro, super_c, regular_c, ion_c, diesel_c, super_a, regular_a, ion_a, diesel_a)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        modificacion = VALUES(modificacion),
                        super_c = VALUES(super_c),
                        regular_c = VALUES(regular_c),
                        ion_c = VALUES(ion_c),
                        diesel_c = VALUES(diesel_c),
                        super_a = VALUES(super_a),
                        regular_a = VALUES(regular_a),
                        ion_a = VALUES(ion_a),
                        diesel_a = VALUES(diesel_a)
                `, [
                    row.estacion, row.modificacion, today,
                    cleanNum(row.super_c), cleanNum(row.regular_c), cleanNum(row.ion_c), cleanNum(row.diesel_c),
                    cleanNum(row.super_a), cleanNum(row.regular_a), cleanNum(row.ion_a), cleanNum(row.diesel_a)
                ]);
            }

            await conn.commit();
            res.json({ message: 'Precios actualizados exitosamente', count: data.length });
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    } catch (error) { res.status(500).json({ message: 'Error updating precios competencia' }); }
});

router.get('/consultas/estaciones/precios-competencia/historial', authenticateToken, async (req, res) => {
    try {
        const { desde, hasta, estacion } = req.query;
        const externalDb = await getExternalDb();
        
        let query = `
            SELECT h.id, h.estacion, h.modificacion, DATE_FORMAT(h.fecha_registro, '%Y-%m-%d') as fecha_registro,
                   h.super_c, h.regular_c, h.ion_c, h.diesel_c,
                   h.super_a, h.regular_a, h.ion_a, h.diesel_a,
                   c.titulo as estacion_propia
            FROM web_precios_competencia_historial h
            LEFT JOIN web_estaciones_competencia b ON h.estacion = b.competencia
            LEFT JOIN web_consolidado c ON b.id_estacion = c.id_empresa AND c.grupo = 'ESTACION'
            WHERE 1=1
        `;
        const params = [];
        if (desde) {
            query += ' AND h.fecha_registro >= ?';
            params.push(desde);
        }
        if (hasta) {
            query += ' AND h.fecha_registro <= ?';
            params.push(hasta);
        }
        if (estacion) {
            query += ' AND (h.estacion LIKE ? OR c.titulo LIKE ?)';
            params.push(`%${estacion}%`, `%${estacion}%`);
        }
        query += ' ORDER BY h.fecha_registro DESC, h.estacion ASC LIMIT 500';

        const [rows] = await externalDb.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching historial:', error);
        res.status(500).json({ message: 'Error al consultar historial de precios' });
    }
});

router.get('/consultas/estaciones/precios-competencia/bi-analytics', authenticateToken, async (req, res) => {
    try {
        const externalDb = await getExternalDb();
        
        // 1. Current data with station details
        const queryCurrent = `
            SELECT c.titulo as estacion_propia, a.estacion, a.modificacion,
                   a.super_c, a.regular_c, a.ion_c, a.diesel_c,
                   a.super_a, a.regular_a, a.ion_a, a.diesel_a
            FROM web_precios_competencia a
            INNER JOIN web_estaciones_competencia b ON a.estacion = b.competencia
            INNER JOIN web_consolidado c ON b.id_estacion = c.id_empresa AND c.grupo = 'ESTACION'
        `;
        const [currentRows] = await externalDb.query(queryCurrent);

        // Helper to extract brand
        const extractBrand = (name) => {
            const upper = (name || '').toUpperCase();
            if (upper.includes('TEXACO')) return 'Texaco';
            if (upper.includes('PUMA')) return 'Puma';
            if (upper.includes('UNO')) return 'Uno';
            if (upper.includes('SHELL')) return 'Shell';
            if (upper.includes('DLC')) return 'DLC';
            return 'Otros / Indep.';
        };

        // 2. Market Averages (ignoring 0 values)
        const calcAvg = (arr, key) => {
            const valid = arr.map(item => Number(item[key] || 0)).filter(v => v > 0);
            if (valid.length === 0) return 0;
            return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
        };

        const calcMinMax = (arr, key) => {
            const valid = arr.filter(item => Number(item[key] || 0) > 0);
            if (valid.length === 0) return { min: { val: 0, station: '-' }, max: { val: 0, station: '-' } };
            valid.sort((a, b) => Number(a[key]) - Number(b[key]));
            return {
                min: { val: Number(valid[0][key]), station: valid[0].estacion, propia: valid[0].estacion_propia },
                max: { val: Number(valid[valid.length - 1][key]), station: valid[valid.length - 1].estacion, propia: valid[valid.length - 1].estacion_propia }
            };
        };

        const promediosMercado = {
            super_a: calcAvg(currentRows, 'super_a'),
            regular_a: calcAvg(currentRows, 'regular_a'),
            diesel_a: calcAvg(currentRows, 'diesel_a'),
            super_c: calcAvg(currentRows, 'super_c'),
            regular_c: calcAvg(currentRows, 'regular_c'),
            diesel_c: calcAvg(currentRows, 'diesel_c')
        };

        const rankingExtremos = {
            super_a: calcMinMax(currentRows, 'super_a'),
            regular_a: calcMinMax(currentRows, 'regular_a'),
            diesel_a: calcMinMax(currentRows, 'diesel_a')
        };

        // 3. Average by Brand
        const byBrand = {};
        for (const row of currentRows) {
            const brand = extractBrand(row.estacion);
            if (!byBrand[brand]) byBrand[brand] = [];
            byBrand[brand].push(row);
        }

        const marcas = Object.keys(byBrand).map(brand => {
            const list = byBrand[brand];
            return {
                brand,
                count: list.length,
                super_a: calcAvg(list, 'super_a'),
                regular_a: calcAvg(list, 'regular_a'),
                diesel_a: calcAvg(list, 'diesel_a'),
                super_c: calcAvg(list, 'super_c'),
                regular_c: calcAvg(list, 'regular_c'),
                diesel_c: calcAvg(list, 'diesel_c')
            };
        }).sort((a, b) => b.count - a.count);

        // 4. Historical Trends
        const queryTrend = `
            SELECT DATE_FORMAT(fecha_registro, '%Y-%m-%d') as fecha,
                   AVG(NULLIF(super_a, 0)) as super_a,
                   AVG(NULLIF(regular_a, 0)) as regular_a,
                   AVG(NULLIF(diesel_a, 0)) as diesel_a,
                   AVG(NULLIF(super_c, 0)) as super_c,
                   AVG(NULLIF(regular_c, 0)) as regular_c,
                   AVG(NULLIF(diesel_c, 0)) as diesel_c,
                   COUNT(DISTINCT estacion) as total_estaciones
            FROM web_precios_competencia_historial
            GROUP BY fecha_registro
            ORDER BY fecha_registro ASC
            LIMIT 30
        `;
        const [trendRows] = await externalDb.query(queryTrend);

        const tendenciaHistorica = trendRows.map(r => ({
            fecha: r.fecha,
            super_a: Number(Number(r.super_a || 0).toFixed(2)),
            regular_a: Number(Number(r.regular_a || 0).toFixed(2)),
            diesel_a: Number(Number(r.diesel_a || 0).toFixed(2)),
            super_c: Number(Number(r.super_c || 0).toFixed(2)),
            regular_c: Number(Number(r.regular_c || 0).toFixed(2)),
            diesel_c: Number(Number(r.diesel_c || 0).toFixed(2)),
            total_estaciones: r.total_estaciones
        }));

        // 5. Total History Count & Last Update
        const [histCount] = await externalDb.query('SELECT COUNT(*) as total, MAX(fecha_registro) as ultima_fecha FROM web_precios_competencia_historial');

        // 6. Generate Dynamic Business Insights
        const insights = [];
        if (marcas.length > 1) {
            const sortedBySuper = [...marcas].filter(m => m.super_a > 0).sort((a, b) => a.super_a - b.super_a);
            if (sortedBySuper.length > 1) {
                const cheapest = sortedBySuper[0];
                const mostExpensive = sortedBySuper[sortedBySuper.length - 1];
                const diff = (mostExpensive.super_a - cheapest.super_a).toFixed(2);
                insights.push({
                    type: 'competitive_gap',
                    title: 'Brecha de Marca en Gasolina Superior',
                    description: `La marca **${cheapest.brand}** lidera con el precio promedio más bajo ($${cheapest.super_a}), $${diff} por debajo de **${mostExpensive.brand}** ($${mostExpensive.super_a}).`
                });
            }
        }

        if (rankingExtremos.diesel_a.min.val > 0 && rankingExtremos.diesel_a.max.val > 0) {
            const spreadDiesel = (rankingExtremos.diesel_a.max.val - rankingExtremos.diesel_a.min.val).toFixed(2);
            insights.push({
                type: 'price_spread',
                title: 'Dispersión de Precios en Diésel',
                description: `El Diésel más económico se encuentra en **${rankingExtremos.diesel_a.min.station}** ($${rankingExtremos.diesel_a.min.val}) con una diferencia de $${spreadDiesel} respecto a la estación más alta ($${rankingExtremos.diesel_a.max.val}).`
            });
        }

        if (tendenciaHistorica.length > 1) {
            const first = tendenciaHistorica[0];
            const last = tendenciaHistorica[tendenciaHistorica.length - 1];
            const delta = (last.super_a - first.super_a).toFixed(2);
            insights.push({
                type: 'trend',
                title: 'Tendencia Reciente del Mercado',
                description: `En el periodo analizado, el promedio de Superior pasó de $${first.super_a} a $${last.super_a} (${delta >= 0 ? '+' : ''}$${delta}).`
            });
        }

        res.json({
            totalEstaciones: currentRows.length,
            promediosMercado,
            rankingExtremos,
            marcas,
            tendenciaHistorica,
            totalHistorialRegistros: histCount[0]?.total || 0,
            ultimaFechaHistorial: histCount[0]?.ultima_fecha || null,
            insights
        });
    } catch (error) {
        console.error('Error fetching BI analytics:', error);
        res.status(500).json({ message: 'Error al generar análisis de BI' });
    }
});

router.get('/consultas/:type', authenticateToken, async (req, res) => {
    const { type } = req.params;
    try {
        const externalDb = await getExternalDb();
        const today = new Date().toISOString().split('T')[0];
        let results;
        if (type === 'saldos-bancos') [results] = await externalDb.query('CALL sp_saldo_en_bancos(?)', [today]);
        else if (type === 'saldos-chequera') [results] = await externalDb.query('CALL sp_saldo_en_chequera(?)', [today]);
        else return res.status(404).json({ message: 'Consulta no encontrada' });
        res.json(results[0] || []);
    } catch (error) { res.status(500).json({ message: 'Error executing SP' }); }
});

module.exports = router;
