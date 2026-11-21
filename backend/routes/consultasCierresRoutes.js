const dbModule = require('../db');
const getExternalDb = (...args) => dbModule.getExternalDb(...args);
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const withRetry = (...args) => dbModule.withRetry(...args);
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { GoogleGenAI } = require('@google/genai');
const {
    cierreViewPerms,
    getCleanStationName,
    getCleanTiendaName,
    saasBranchMap,
    normalizeSaasBranchId,
    OFFICIAL_ESTACIONES,
    isGenericDescription,
    formatYMD,
    computeSaasStoreShiftMetrics
} = require('../services/consultasCatalog');

function registerConsultasCierresRoutes(router, {
    generarAnalisisDescuadre,
    getTurnosPorEmpresa,
    mapCierreRowConExplicacion,
    getCortesTiendaData
}) {
router.get('/ventas/resumen-cierre/:date', authenticateToken, requirePermission(cierreViewPerms), async (req, res) => {
    const { date } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const parts = date.split('-'); 
        const sysDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        const accountingDb = await getAccountingDb();
        const externalDb = await getExternalDb();

        if (accountingDb) {
            const [saasCheck] = await withRetry(() => accountingDb.query(
                "SELECT COUNT(*) as cnt FROM gas_station_closeouts WHERE fecha_turno = ? AND estado = 'cerrado'",
                [date]
            ));
            if (saasCheck[0]?.cnt > 0) {
                const turnosPorEmpresa = await getTurnosPorEmpresa(externalDb, sysDate, accountingDb, date);

                const sqlSaasCierre = `
                    SELECT 
                        c.branch_id,
                        SUM((SELECT IFNULL(SUM(cr.monto), 0.0) FROM gas_station_closeout_creditos cr WHERE cr.closeout_id = c.id)) as creditos,
                        SUM((SELECT IFNULL(SUM(cp.monto), 0.0) FROM gas_station_closeout_cupones cp WHERE cp.closeout_id = c.id)) as cupones,
                        SUM((SELECT IFNULL(SUM(ch.monto), 0.0) FROM gas_station_closeout_cheques ch WHERE ch.closeout_id = c.id)) as cheques,
                        SUM((SELECT IFNULL(SUM(vl.monto), 0.0) FROM gas_station_closeout_vales vl WHERE vl.closeout_id = c.id)) as vales,
                        SUM((SELECT IFNULL(SUM(ant.monto), 0.0) FROM gas_station_closeout_anticipos_despachados ant WHERE ant.closeout_id = c.id)) as anticipos_despachados,
                        SUM((SELECT IFNULL(SUM(tr.monto), 0.0) FROM gas_station_closeout_trupput_despachos tr WHERE tr.closeout_id = c.id)) as trupput,
                        SUM((SELECT IFNULL(SUM(tar.monto), 0.0) FROM gas_station_closeout_tarjetas tar WHERE tar.closeout_id = c.id)) as tarjetas,
                        SUM((SELECT IFNULL(SUM(rem.monto), 0.0) FROM gas_station_closeout_remesas rem WHERE rem.closeout_id = c.id)) as remesas,
                        SUM((SELECT IFNULL(SUM(g.valor), 0.0) FROM gas_station_closeout_expenses g WHERE g.closeout_id = c.id)) as gastos,
                        SUM((SELECT IFNULL(SUM(l.total), 0.0) FROM gas_station_closeout_lubricant_readings l WHERE l.closeout_id = c.id)) as lubricantes,
                        SUM((SELECT IFNULL(SUM(ad.monto), 0.0) FROM gas_station_closeout_adelantos ad WHERE ad.closeout_id = c.id)) as anticipos,
                        0.0 as pagos,
                        SUM((SELECT IFNULL(SUM(d.total), 0.0) FROM gas_station_closeout_descuentos d WHERE d.closeout_id = c.id)) as descuentos,
                        SUM((SELECT IFNULL(SUM(r.monto), 0.0) FROM gas_station_closeout_readings r WHERE r.closeout_id = c.id)) as total_venta
                    FROM gas_station_closeouts c
                    WHERE c.fecha_turno = ? AND c.estado = 'cerrado'
                    GROUP BY c.branch_id
                `;
                const [saasCierreRows] = await withRetry(() => accountingDb.query(sqlSaasCierre, [date]));
                const saasCierreMap = {};
                const numericFields = ['creditos', 'cupones', 'cheques', 'vales', 'anticipos_despachados', 'trupput', 'tarjetas', 'remesas', 'gastos', 'lubricantes', 'anticipos', 'pagos', 'descuentos', 'total_venta'];
                (saasCierreRows || []).forEach(r => {
                    const bId = normalizeSaasBranchId(r.branch_id);
                    if (!saasCierreMap[bId]) {
                        saasCierreMap[bId] = { ...r, branch_id: bId };
                    } else {
                        for (const k of numericFields) {
                            saasCierreMap[bId][k] = Number(saasCierreMap[bId][k] || 0) + Number(r[k] || 0);
                        }
                    }
                });

                const resumenCierreLocal = OFFICIAL_ESTACIONES.map(st => {
                    const raw = saasCierreMap[st.branch_id] || {
                        creditos: 0,
                        cupones: 0,
                        cheques: 0,
                        vales: 0,
                        anticipos_despachados: 0,
                        trupput: 0,
                        tarjetas: 0,
                        remesas: 0,
                        gastos: 0,
                        lubricantes: 0,
                        anticipos: 0,
                        pagos: 0,
                        descuentos: 0,
                        total_venta: 0
                    };
                    return mapCierreRowConExplicacion({
                        id_empresa: st.id_empresa,
                        estacion: st.titulo,
                        ...raw
                    }, turnosPorEmpresa, date);
                });

                return res.json(resumenCierreLocal);
            }
        }

        if (!externalDb) return res.json([]);
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
        const [rows, turnosPorEmpresa] = await Promise.all([
            externalDb.query(sql, params).then(([r]) => r),
            getTurnosPorEmpresa(externalDb, sysDate)
        ]);
        res.json((rows || []).map(r => mapCierreRowConExplicacion(r, turnosPorEmpresa, sysDate)));
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar resumen de cierre'); 
    }
});

// Cortes de Tienda (Listado)
router.get('/ventas/cortes-tienda/:date', authenticateToken, requirePermission(cierreViewPerms), async (req, res) => {
    const { date } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const externalDb = await getExternalDb().catch(() => null);
        const accountingDb = await getAccountingDb().catch(() => null);
        const cortes = await getCortesTiendaData(externalDb, date, accountingDb);
        res.json(cortes);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar cortes de tienda');
    }
});

// Detalle de un Corte de Tienda específico (Líneas de Venta + Movimientos de Tarjeta/Gastos)
router.get('/ventas/corte-tienda/detalle/:id_corte', authenticateToken, requirePermission(cierreViewPerms), async (req, res) => {
    const { id_corte } = req.params;
    try {
        // 1. Manejo de cortes provenientes del nuevo sistema SaaS (sys.sipesv.com)
        if (id_corte && String(id_corte).startsWith('SAAS_')) {
            const parts = String(id_corte).split('_');
            const branchId = parseInt(parts[1], 10);
            const date = parts.slice(2).join('_');

            const saasDb = await getAccountingDb();
            const [branchRow] = await withRetry(() => saasDb.query("SELECT nombre FROM branches WHERE id = ?", [branchId]));
            const branchNombre = branchRow?.[0]?.nombre || `Sucursal ${branchId}`;

            const storeNames = {
                1: 'E-Market San Martin',
                3: 'E-Market Chalchuapa',
                6: 'Super El Pedregal',
                4: 'E-Market Miraflores',
                8: 'Super 7 Costa'
            };
            const storeName = storeNames[branchId] || branchNombre;

            // Turnos de tienda (solo turnos cerrados)
            const [shifts] = await withRetry(() => saasDb.query(`
                SELECT s.id, s.shift_number, s.total_sales, s.total_incomes, s.card_sales, s.total_tarjetas,
                       s.transfer_sales, s.other_sales, s.total_puntos,
                       s.total_remesas, s.total_expenses, s.opening_balance, s.expected_cash, s.actual_cash, s.difference,
                       COALESCE(sel.nombre, u.nombre) as seller_nombre
                FROM pos_shifts s
                JOIN points_of_sale p ON s.pos_id = p.id
                LEFT JOIN sellers sel ON s.seller_id = sel.id
                LEFT JOIN users u ON s.seller_id = u.id
                WHERE s.branch_id = ? AND DATE(s.shift_date) = ?
                  AND s.status = 'closed'
                  AND (p.nombre LIKE '%Tienda%' OR p.nombre LIKE '%Super%')
            `, [branchId, date]));

            const shiftIds = (shifts || []).map(s => s.id);
            const shiftNumbers = Array.from(new Set((shifts || []).map(s => s.shift_number).filter(Boolean))).join('-');
            const sellers = Array.from(new Set((shifts || []).map(s => s.seller_nombre).filter(Boolean))).join(', ');

            const totalVentas = (shifts || []).reduce((acc, s) => acc + Number(s.total_sales || 0), 0);
            const totalIngresos = (shifts || []).reduce((acc, s) => acc + Number(s.total_incomes || 0), 0);
            const totalGastos = (shifts || []).reduce((acc, s) => acc + Number(s.total_expenses || 0), 0);
            const totalSaldoF = (shifts || []).reduce((acc, s) => acc + Number(s.actual_cash || 0), 0);
            const totalDif = (shifts || []).reduce((acc, s) => acc + computeSaasStoreShiftMetrics(s).dif, 0);

            // Detalle de movimientos (gastos, tarjetas, remesas, ingresos)
            const detallesMovimientos = [];
            let totalTarjetas = 0;
            let totalRemesado = 0;

            if (shiftIds.length > 0) {
                const [expRows] = await withRetry(() => saasDb.query(
                    "SELECT description, amount FROM pos_shift_expenses WHERE shift_id IN (?)",
                    [shiftIds]
                ));
                (expRows || []).forEach(e => {
                    const desc = e.description || 'Gasto operativo';
                    const esGenerico = isGenericDescription(desc);
                    detallesMovimientos.push({
                        tipo: 'G',
                        tipo_nombre: 'Gasto',
                        descripcion: desc,
                        monto: Math.round(Number(e.amount || 0) * 100) / 100,
                        es_generico: esGenerico,
                        alerta: esGenerico ? 'Concepto no especificado o genérico' : null,
                        alerta_gasto: 'Gasto no habitual en tienda de conveniencia'
                    });
                });

                const [remRows] = await withRetry(() => saasDb.query(
                    "SELECT description, amount FROM pos_shift_remesas WHERE shift_id IN (?)",
                    [shiftIds]
                ));
                (remRows || []).forEach(r => {
                    const desc = r.description || '';
                    const descLower = desc.toLowerCase();
                    const amt = Math.round(Number(r.amount || 0) * 100) / 100;
                    const isCard = descLower.includes('pos') || descLower.includes('credomatic') || descLower.includes('tarjeta') || descLower.includes('voucher');
                    const esGenerico = isGenericDescription(desc);
                    if (isCard) {
                        totalTarjetas += amt;
                        detallesMovimientos.push({
                            tipo: 'T',
                            tipo_nombre: 'Tarjeta',
                            descripcion: desc || 'Tarjeta / POS',
                            monto: amt,
                            es_generico: esGenerico,
                            alerta: esGenerico ? 'Concepto no especificado o genérico' : null
                        });
                    } else {
                        totalRemesado += amt;
                        detallesMovimientos.push({
                            tipo: 'R',
                            tipo_nombre: 'Remesa',
                            descripcion: desc || 'Remesa efectivo',
                            monto: amt,
                            es_generico: esGenerico,
                            alerta: esGenerico ? 'Concepto no especificado o genérico' : null
                        });
                    }
                });

                const [incRows] = await withRetry(() => saasDb.query(
                    "SELECT description, amount FROM pos_shift_incomes WHERE shift_id IN (?)",
                    [shiftIds]
                ));
                (incRows || []).forEach(i => {
                    const desc = i.description || 'Ingreso de caja';
                    const esGenerico = isGenericDescription(desc);
                    detallesMovimientos.push({
                        tipo: 'I',
                        tipo_nombre: 'Ingreso',
                        descripcion: desc,
                        monto: Math.round(Number(i.amount || 0) * 100) / 100,
                        es_generico: esGenerico,
                        alerta: esGenerico ? 'Concepto no especificado o genérico' : null
                    });
                });
            }

            // Si pos_shift_remesas no tuvo tarjetas explícitas, usar total_tarjetas / card_sales de pos_shifts
            if (totalTarjetas === 0 && (shifts || []).some(s => Math.max(Number(s.total_tarjetas || 0), Number(s.card_sales || 0)) > 0)) {
                totalTarjetas = (shifts || []).reduce((acc, s) => acc + Math.max(Number(s.total_tarjetas || 0), Number(s.card_sales || 0)), 0);
            }
            if (totalRemesado === 0 && (shifts || []).some(s => Number(s.total_remesas || 0) > 0)) {
                totalRemesado = (shifts || []).reduce((acc, s) => acc + Number(s.total_remesas || 0), 0);
            }

            // Ventas agrupadas por categoría/línea
            const [lineRows] = await withRetry(() => saasDb.query(`
                SELECT COALESCE(c.name, 'General') as linea, 
                       ROUND(SUM(si.venta_gravada + si.venta_exenta), 2) as monto
                FROM sales_items si
                JOIN sales_headers sh ON si.sale_id = sh.id
                LEFT JOIN products p ON si.product_id = p.id
                LEFT JOIN product_categories c ON p.category_id = c.id
                WHERE sh.branch_id = ? AND sh.fecha_emision = ?
                  AND (sh.estado = 'emitido' OR sh.estado IS NULL)
                  AND (p.tipo_item IS NULL OR p.tipo_item != 'combustible')
                  AND (c.name IS NULL OR c.name != 'COMBUSTIBLES')
                GROUP BY linea
                ORDER BY monto DESC
            `, [branchId, date]));

            const sumLines = (lineRows || []).reduce((acc, l) => acc + Number(l.monto || 0), 0);
            const ventasLineas = (lineRows || []).map(l => ({
                linea: l.linea,
                monto: Math.round(Number(l.monto || 0) * 100) / 100,
                porcentaje: sumLines > 0 ? Math.round((Number(l.monto || 0) / sumLines) * 10000) / 100 : 0
            }));

            const cabeceraGastos = Math.round(totalGastos * 100) / 100;
            const cabeceraDif = Math.round(totalDif * 100) / 100;
            const saasIncongruencias = [];
            if (cabeceraGastos > 0) {
                saasIncongruencias.push({ tipo: 'gasto_tienda', nivel: 'warning', texto: `Registra gastos en tienda por $${cabeceraGastos.toFixed(2)}` });
            }
            if (Math.abs(cabeceraDif) > 0.01) {
                saasIncongruencias.push({ tipo: 'descuadre', nivel: 'danger', texto: cabeceraDif < 0 ? `Faltante de caja por -$${Math.abs(cabeceraDif).toFixed(2)}` : `Sobrante de caja por +$${cabeceraDif.toFixed(2)}` });
            }
            if (detallesMovimientos.some(d => d.es_generico)) {
                saasIncongruencias.push({ tipo: 'concepto_generico', nivel: 'warning', texto: 'Contiene conceptos de movimientos sin especificar o genéricos' });
            }

            return res.json({
                id_corte,
                cabecera: {
                    id: id_corte,
                    id_empresa: String(branchId).padStart(3, '0'),
                    tienda_nombre: storeName,
                    fecha: date,
                    turno: shiftNumbers || 1,
                    responsable: sellers || 'Cajero Turno',
                    venta: Math.round(totalVentas * 100) / 100,
                    ingresos: Math.round(totalIngresos * 100) / 100,
                    tarjeta: Math.round(totalTarjetas * 100) / 100,
                    remesado: Math.round(totalRemesado * 100) / 100,
                    gastos: cabeceraGastos,
                    retiros: 0,
                    saldo_f: Math.round(totalSaldoF * 100) / 100,
                    dif: cabeceraDif,
                    incongruencias: saasIncongruencias,
                    tiene_incongruencia: saasIncongruencias.length > 0
                },
                ventas_lineas: ventasLineas,
                detalles_movimientos: detallesMovimientos,
                totales: {
                    gastos: cabeceraGastos,
                    tarjetas: Math.round(totalTarjetas * 100) / 100,
                    remesas: Math.round(totalRemesado * 100) / 100,
                    ingresos: Math.round(totalIngresos * 100) / 100
                }
            });
        }

        // 2. Manejo de cortes legado (db_system_rrs)
        const externalDb = await getExternalDb();
        const [cabeceraRows] = await externalDb.query(`
            SELECT a.*, b.titulo as tienda_nombre 
            FROM cort_cabecera a 
            LEFT JOIN web_consolidado b ON a.id_empresa = b.id_empresa AND b.grupo = 'TIENDA'
            WHERE a.id = ?
        `, [id_corte]);

        if (!cabeceraRows || cabeceraRows.length === 0) {
            return res.status(404).json({ message: 'Corte de tienda no encontrado' });
        }

        const cabecera = cabeceraRows[0];
        const [ventasRows] = await externalDb.query(`
            SELECT linea, monto, porcentaje 
            FROM cort_ventas 
            WHERE id_corte = ? 
            ORDER BY monto DESC
        `, [id_corte]);

        const [detalleRows] = await externalDb.query(`
            SELECT tipo, descripcion, monto 
            FROM cort_detalle 
            WHERE id_corte = ? 
            ORDER BY tipo, monto DESC
        `, [id_corte]);

        const totalGastos = (detalleRows || []).filter(d => d.tipo === 'G').reduce((acc, c) => acc + Number(c.monto || 0), 0);
        const totalTarjetas = (detalleRows || []).filter(d => d.tipo === 'T').reduce((acc, c) => acc + Number(c.monto || 0), 0);
        const totalIngresos = (detalleRows || []).filter(d => d.tipo === 'I').reduce((acc, c) => acc + Number(c.monto || 0), 0);

        const legDetallesMovimientos = (detalleRows || []).map(d => {
            const esGenerico = isGenericDescription(d.descripcion);
            return {
                tipo: d.tipo,
                tipo_nombre: d.tipo === 'G' ? 'Gasto' : d.tipo === 'T' ? 'Tarjeta' : 'Ingreso',
                descripcion: d.descripcion,
                monto: Math.round(Number(d.monto || 0) * 100) / 100,
                es_generico: esGenerico,
                alerta: esGenerico ? 'Concepto no especificado o genérico' : null,
                alerta_gasto: d.tipo === 'G' ? 'Gasto no habitual en tienda de conveniencia' : null
            };
        });

        const legGastos = Math.round(totalGastos * 100) / 100;
        const legDif = Number(cabecera.diferencia || 0);
        const legIncongruencias = [];
        if (legGastos > 0) {
            legIncongruencias.push({ tipo: 'gasto_tienda', nivel: 'warning', texto: `Registra gastos en tienda por $${legGastos.toFixed(2)}` });
        }
        if (Math.abs(legDif) > 0.01) {
            legIncongruencias.push({ tipo: 'descuadre', nivel: 'danger', texto: legDif < 0 ? `Faltante de caja por -$${Math.abs(legDif).toFixed(2)}` : `Sobrante de caja por +$${legDif.toFixed(2)}` });
        }
        if (legDetallesMovimientos.some(d => d.es_generico)) {
            legIncongruencias.push({ tipo: 'concepto_generico', nivel: 'warning', texto: 'Contiene conceptos de movimientos sin especificar o genéricos' });
        }

        res.json({
            id_corte,
            cabecera: {
                id: cabecera.id,
                id_empresa: cabecera.id_empresa,
                tienda_nombre: getCleanTiendaName(String(cabecera.id_empresa), cabecera.tienda_nombre),
                fecha: cabecera.fecha ? new Date(cabecera.fecha).toISOString().split('T')[0] : '',
                turno: cabecera.turno,
                responsable: cabecera.responsable || '-',
                venta: Number(cabecera.tot_ventas || 0),
                ingresos: Number(cabecera.tot_ingresos || 0),
                tarjeta: Number(cabecera.tot_tarjeta || 0),
                remesado: Number(cabecera.tot_remesado || 0),
                gastos: legGastos,
                retiros: Number(cabecera.tot_retirado || 0),
                saldo_f: Number(cabecera.efectivo || 0),
                dif: legDif,
                incongruencias: legIncongruencias,
                tiene_incongruencia: legIncongruencias.length > 0
            },
            ventas_lineas: (ventasRows || []).map(v => ({
                linea: v.linea,
                monto: Math.round(Number(v.monto || 0) * 100) / 100,
                porcentaje: Math.round(Number(v.porcentaje || 0) * 10000) / 100
            })),
            detalles_movimientos: legDetallesMovimientos,
            totales: {
                gastos: legGastos,
                tarjetas: Math.round(totalTarjetas * 100) / 100,
                ingresos: Math.round(totalIngresos * 100) / 100
            }
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar detalle del corte de tienda');
    }
});

// Detalle por Rubro de Cierre de Turno de Estación (Gastos, Tarjetas, Remesas, Crédito, etc.)
router.get('/ventas/cierre-turno/detalle/:id_empresa/:date/:rubro', authenticateToken, requirePermission(cierreViewPerms), async (req, res) => {
    const { id_empresa, date, rubro } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const cleanId = String(id_empresa).padStart(3, '0');
        const saasBranchId = saasBranchMap[cleanId] || saasBranchMap[id_empresa];
        const saasBranchIds = Number(saasBranchId) === 7 ? [7, 12] : [saasBranchId];
        let saasHasClosedShifts = false;
        let accountingDb = null;
        if (saasBranchId) {
            try {
                accountingDb = await getAccountingDb();
                if (accountingDb) {
                    const [chk] = await withRetry(() => accountingDb.query(
                        "SELECT COUNT(*) as count FROM gas_station_closeouts WHERE branch_id IN (?) AND fecha_turno = ? AND estado = 'cerrado'",
                        [saasBranchIds, date]
                    ));
                    if (chk && chk[0]?.count > 0) {
                        saasHasClosedShifts = true;
                    }
                }
            } catch (sErr) {
                console.warn('[Detalle Cierre SaaS] Error verificando SaaS:', sErr.message);
            }
        }

        if (saasHasClosedShifts) {
            const stOfficial = OFFICIAL_ESTACIONES.find(s => s.id_empresa === cleanId || s.branch_id === saasBranchId);
            const estacionNombre = stOfficial?.titulo || `Estación ${cleanId}`;
            let rows = [];
            let mapFn = (row) => row;

            switch (rubro.toLowerCase()) {
                case 'gastos': {
                    const [gRows] = await withRetry(() => accountingDb.query(`
                        SELECT g.id, g.closeout_id, g.fecha, g.documento, g.tipo as tipo_doc,
                               g.provider_id as cod_proveedor, COALESCE(g.proveedor, 'Sin proveedor') as nombre,
                               g.valor, g.comentario as concepto, g.rubro
                        FROM gas_station_closeout_expenses g
                        JOIN gas_station_closeouts c ON g.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY g.id
                    `, [saasBranchIds, date]));
                    rows = gRows || [];
                    mapFn = (r) => {
                        const conceptoStr = r.concepto || r.rubro || '';
                        const esGenerico = isGenericDescription(conceptoStr);
                        const docStr = (r.documento || '').trim();
                        const faltaDocumento = !docStr || docStr === '-' || docStr === '0' || docStr === 'S/N' || docStr === 'SN';
                        const alertas = [];
                        if (esGenerico) alertas.push({ tipo: 'concepto_generico', texto: 'Concepto vago o poco descriptivo' });
                        if (faltaDocumento) alertas.push({ tipo: 'sin_documento', texto: 'Sin número de comprobante o documento' });

                        return {
                            id: r.id,
                            fecha: formatYMD(r.fecha) || date,
                            documento: r.documento || '-',
                            tipo_doc: (r.tipo_doc || '').toUpperCase(),
                            codigo: r.cod_proveedor || '-',
                            nombre: r.nombre || 'Sin nombre',
                            valor: Math.round(Number(r.valor || 0) * 100) / 100,
                            concepto: conceptoStr || 'Gasto operativo',
                            rubro: r.rubro || 'Gastos',
                            es_generico: esGenerico,
                            falta_documento: faltaDocumento,
                            es_incongruente: esGenerico || faltaDocumento,
                            alertas
                        };
                    };
                    break;
                }

                case 'tarjetas': {
                    const [tRows] = await withRetry(() => accountingDb.query(`
                        SELECT t.id, t.closeout_id, c.fecha_turno as fecha, t.num_tarjeta, t.num_autorizacion,
                               COALESCE(p.nombre, 'POS / Terminal') as banco_nombre, t.monto as valor, t.tipo_operacion
                        FROM gas_station_closeout_tarjetas t
                        JOIN gas_station_closeouts c ON t.closeout_id = c.id
                        LEFT JOIN gas_station_pos_types p ON t.pos_type_id = p.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY t.id
                    `, [saasBranchIds, date]));
                    rows = tRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        tarjeta: r.num_tarjeta || '****',
                        autorizacion: r.num_autorizacion || '-',
                        banco: r.banco_nombre || 'POS / Terminal',
                        tipo_operacion: (r.tipo_operacion || 'VTA').toUpperCase(),
                        valor: Math.round(Number(r.valor || 0) * 100) / 100
                    });
                    break;
                }

                case 'remesas': {
                    const [remRows] = await withRetry(() => accountingDb.query(`
                        SELECT r.id, r.closeout_id, c.fecha_turno as fecha, r.documento,
                               COALESCE(r.descripcion, 'Remesa General') as banco_nombre,
                               r.monto as efectivo, 0 as monedas, 0 as transferencia, r.monto as total,
                               r.codigo as num_voucher, r.tipo_operacion
                        FROM gas_station_closeout_remesas r
                        JOIN gas_station_closeouts c ON r.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY r.id
                    `, [saasBranchIds, date]));
                    rows = remRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        documento: r.documento || '-',
                        banco: r.banco_nombre || 'Remesa General',
                        efectivo: Math.round(Number(r.efectivo || 0) * 100) / 100,
                        monedas: 0,
                        transferencia: 0,
                        total: Math.round(Number(r.total || 0) * 100) / 100,
                        voucher: (r.num_voucher || '').trim() || '-',
                        tipo_operacion: (r.tipo_operacion || 'VTA').toUpperCase()
                    });
                    break;
                }

                case 'credito':
                case 'creditos': {
                    const [crRows] = await withRetry(() => accountingDb.query(`
                        SELECT cr.id, cr.closeout_id, c.fecha_turno as fecha, cr.documento, cr.tipo_documento as tipo_doc,
                               cr.cliente_id as cod_cliente, cr.cliente_nombre,
                               cr.producto_codigo as cod_producto, cr.producto_descripcion,
                               cr.cantidad, cr.precio, cr.monto as valor, cr.placa, cr.kilometraje
                        FROM gas_station_closeout_creditos cr
                        JOIN gas_station_closeouts c ON cr.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY cr.id
                    `, [saasBranchIds, date]));
                    rows = crRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        documento: r.documento || '-',
                        tipo_doc: r.tipo_doc || 'CCF',
                        codigo: r.cod_cliente || '-',
                        cliente: r.cliente_nombre || 'Cliente Crédito',
                        producto: r.producto_descripcion || r.cod_producto || '-',
                        cantidad: Math.round(Number(r.cantidad || 0) * 100) / 100,
                        precio: Math.round(Number(r.precio || 0) * 1000) / 1000,
                        valor: Math.round(Number(r.valor || 0) * 100) / 100,
                        placa: r.placa || '-',
                        kilometraje: Number(r.kilometraje || 0)
                    });
                    break;
                }

                case 'lubricantes': {
                    const [lRows] = await withRetry(() => accountingDb.query(`
                        SELECT l.producto_codigo as id_producto, l.producto_descripcion as nom_producto,
                               l.lectura_inicial as inicial, l.recarga as complemento, l.lectura_final as final,
                               l.ventas, l.precio as precio_unitario, l.total as precio_total
                        FROM gas_station_closeout_lubricant_readings l
                        JOIN gas_station_closeouts c ON l.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                          AND (l.lectura_inicial > 0 OR l.ventas > 0 OR l.recarga > 0)
                        ORDER BY l.producto_descripcion
                    `, [saasBranchIds, date]));
                    rows = lRows || [];
                    mapFn = (r) => ({
                        codigo: r.id_producto || '-',
                        producto: r.nom_producto || 'Lubricante',
                        inicial: Number(r.inicial || 0),
                        complemento: Number(r.complemento || 0),
                        final: Number(r.final || 0),
                        ventas: Number(r.ventas || 0),
                        precio_unitario: Math.round(Number(r.precio_unitario || 0) * 100) / 100,
                        precio_total: Math.round(Number(r.precio_total || 0) * 100) / 100
                    });
                    break;
                }

                case 'lecturas':
                case 'tot_venta':
                case 'total_venta': {
                    const [lecRows] = await withRetry(() => accountingDb.query(`
                        SELECT r.id, r.closeout_id, c.numero_turno as turno,
                               r.codigo_producto, r.descripcion_producto as nom_producto,
                               r.diferencia as galones, r.precio, r.monto
                        FROM gas_station_closeout_readings r
                        JOIN gas_station_closeouts c ON r.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY c.numero_turno, r.descripcion_producto
                    `, [saasBranchIds, date]));
                    rows = lecRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        turno: r.turno || 1,
                        codigo: r.codigo_producto || '-',
                        producto: r.nom_producto || 'Combustible',
                        galones: Math.round(Number(r.galones || 0) * 100) / 100,
                        precio: Math.round(Number(r.precio || 0) * 1000) / 1000,
                        monto: Math.round(Number(r.monto || 0) * 100) / 100
                    });
                    break;
                }

                case 'cupones': {
                    const [cupRows] = await withRetry(() => accountingDb.query(`
                        SELECT cp.id, cp.closeout_id, c.fecha_turno as fecha, cp.cupon as documento,
                               COALESCE(cp.distribuidora_nombre, 'Distribuidora') as distribuidora,
                               cp.producto_descripcion as cod_producto, cp.monto as valor
                        FROM gas_station_closeout_cupones cp
                        JOIN gas_station_closeouts c ON cp.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY cp.id
                    `, [saasBranchIds, date]));
                    rows = cupRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        documento: r.documento || '-',
                        distribuidora: r.distribuidora || '-',
                        producto: r.cod_producto || '-',
                        valor: Math.round(Number(r.valor || 0) * 100) / 100
                    });
                    break;
                }

                case 'anticipos': {
                    const [antRows] = await withRetry(() => accountingDb.query(`
                        SELECT a.id, a.closeout_id, '-' as id_cajero, a.empleado as id_empleado, a.monto as valor
                        FROM gas_station_closeout_adelantos a
                        JOIN gas_station_closeouts c ON a.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY a.id
                    `, [saasBranchIds, date]));
                    rows = antRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        cajero: r.id_cajero || '-',
                        empleado: r.id_empleado || '-',
                        valor: Math.round(Number(r.valor || 0) * 100) / 100
                    });
                    break;
                }

                case 'descuentos': {
                    const [descRows] = await withRetry(() => accountingDb.query(`
                        SELECT d.id, d.closeout_id, c.fecha_turno as fecha, d.documento,
                               d.cliente_nombre, d.producto_descripcion as cod_producto,
                               d.cantidad, d.valor, d.total
                        FROM gas_station_closeout_descuentos d
                        JOIN gas_station_closeouts c ON d.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY d.id
                    `, [saasBranchIds, date]));
                    rows = descRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        documento: r.documento || '-',
                        cliente: r.cliente_nombre || '-',
                        producto: r.cod_producto || '-',
                        cantidad: Number(r.cantidad || 0),
                        valor: Math.round(Number(r.valor || 0) * 100) / 100,
                        total: Math.round(Number(r.total || 0) * 100) / 100
                    });
                    break;
                }

                case 'cheques': {
                    const [chRows] = await withRetry(() => accountingDb.query(`
                        SELECT ch.id, ch.closeout_id, c.fecha_turno as fecha, ch.numero_cheque as documento,
                               COALESCE(ch.banco, 'Cheque Bancario') as banco, ch.tipo_operacion, ch.monto as valor
                        FROM gas_station_closeout_cheques ch
                        JOIN gas_station_closeouts c ON ch.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY ch.id
                    `, [saasBranchIds, date]));
                    rows = chRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        documento: r.documento || '-',
                        banco: r.banco || 'Cheque Bancario',
                        tipo_operacion: (r.tipo_operacion || 'VTA').toUpperCase(),
                        valor: Math.round(Number(r.valor || 0) * 100) / 100
                    });
                    break;
                }

                case 'vales': {
                    const [valRows] = await withRetry(() => accountingDb.query(`
                        SELECT v.id, v.closeout_id, c.fecha_turno as fecha, v.documento, v.tipo_documento as tipo_doc,
                               COALESCE(v.cliente_nombre, 'Vale Estación') as cliente, v.producto_descripcion as producto,
                               v.cantidad, v.precio, v.monto as valor, v.placa
                        FROM gas_station_closeout_vales v
                        JOIN gas_station_closeouts c ON v.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY v.id
                    `, [saasBranchIds, date]));
                    rows = valRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        documento: r.documento || '-',
                        tipo_doc: r.tipo_doc || 'VALE',
                        cliente: r.cliente || 'Vale',
                        producto: r.producto || '-',
                        cantidad: Number(r.cantidad || 0),
                        precio: Math.round(Number(r.precio || 0) * 1000) / 1000,
                        valor: Math.round(Number(r.valor || 0) * 100) / 100,
                        placa: r.placa || '-'
                    });
                    break;
                }

                case 'anticipos_despachados': {
                    const [antDRows] = await withRetry(() => accountingDb.query(`
                        SELECT ad.id, ad.closeout_id, c.fecha_turno as fecha, ad.documento, ad.tipo_documento as tipo_doc,
                               COALESCE(ad.cliente_nombre, 'Cliente Anticipo') as cliente,
                               ad.producto_descripcion as producto, ad.cantidad, ad.precio, ad.monto as valor, ad.placa
                        FROM gas_station_closeout_anticipos_despachados ad
                        JOIN gas_station_closeouts c ON ad.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY ad.id
                    `, [saasBranchIds, date]));
                    rows = antDRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        documento: r.documento || '-',
                        tipo_doc: r.tipo_doc || 'ANT',
                        cliente: r.cliente || 'Cliente Anticipo',
                        producto: r.producto || '-',
                        cantidad: Number(r.cantidad || 0),
                        precio: Math.round(Number(r.precio || 0) * 1000) / 1000,
                        valor: Math.round(Number(r.valor || 0) * 100) / 100,
                        placa: r.placa || '-'
                    });
                    break;
                }

                case 'trupput': {
                    const [trRows] = await withRetry(() => accountingDb.query(`
                        SELECT t.id, t.closeout_id, c.fecha_turno as fecha, t.documento,
                               COALESCE(t.cliente_nombre, 'Cliente Trupput') as cliente,
                               t.producto_descripcion as producto, t.galones as cantidad, t.precio, t.monto as valor, t.placa
                        FROM gas_station_closeout_trupput_despachos t
                        JOIN gas_station_closeouts c ON t.closeout_id = c.id
                        WHERE c.branch_id IN (?) AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY t.id
                    `, [saasBranchIds, date]));
                    rows = trRows || [];
                    mapFn = (r) => ({
                        id: r.id,
                        fecha: formatYMD(r.fecha) || date,
                        documento: r.documento || '-',
                        cliente: r.cliente || 'Cliente Trupput',
                        producto: r.producto || '-',
                        cantidad: Number(r.cantidad || 0),
                        precio: Math.round(Number(r.precio || 0) * 1000) / 1000,
                        valor: Math.round(Number(r.valor || 0) * 100) / 100,
                        placa: r.placa || '-'
                    });
                    break;
                }

                case 'pagos':
                    rows = [];
                    break;

                default:
                    return res.status(400).json({ message: `Rubro '${rubro}' no soportado` });
            }

            const mapped = (rows || []).map(mapFn);
            const total = mapped.reduce((acc, curr) => acc + Number(curr.valor || curr.total || curr.monto || curr.precio_total || 0), 0);

            return res.json({
                id_empresa: cleanId,
                estacion_nombre: estacionNombre,
                rubro,
                fecha: date,
                fecha_turno: date,
                total: Math.round(total * 100) / 100,
                registros: mapped,
                fuente: 'db_sistema_saas (sys.sipesv.com)'
            });
        }

        const externalDb = await getExternalDb();
        const parts = date.split('-');
        const sysDate = `${parts[2]}/${parts[1]}/${parts[0]}`;

        const [stRows] = await externalDb.query("SELECT titulo FROM web_consolidado WHERE id_empresa = ?", [cleanId]);
        const estacionNombre = stRows[0]?.titulo ? getCleanStationName(cleanId, stRows[0].titulo) : `Estación ${cleanId}`;

        let query = '';
        let queryParams = [sysDate, cleanId];
        let mapFn = (row) => row;

        switch (rubro.toLowerCase()) {
            case 'gastos':
                query = `
                    SELECT g.id, g.id_cierre_turno, g.fecha, g.documento, g.tipo_doc, 
                           g.cod_proveedor, COALESCE(p.nombre, g.cod_proveedor) as nombre, 
                           g.valor, g.concepto, g.cuenta as rubro
                    FROM cierre_turno_gastos g 
                    INNER JOIN cierre_turno c ON g.id_cierre_turno = c.id AND g.id_empresa = c.id_empresa
                    LEFT JOIN proveedores p ON (g.cod_proveedor = p.codigo OR g.cod_proveedor = p.id) AND g.id_empresa = p.id_empresa 
                    WHERE c.fecha_turno = ? AND g.id_empresa = ?
                    ORDER BY g.id
                `;
                mapFn = (r) => {
                    const conceptoStr = r.concepto || r.rubro || '';
                    const esGenerico = isGenericDescription(conceptoStr);
                    const docStr = (r.documento || '').trim();
                    const faltaDocumento = !docStr || docStr === '-' || docStr === '0' || docStr === 'S/N' || docStr === 'SN';
                    const alertas = [];
                    if (esGenerico) alertas.push({ tipo: 'concepto_generico', texto: 'Concepto vago o poco descriptivo' });
                    if (faltaDocumento) alertas.push({ tipo: 'sin_documento', texto: 'Sin número de comprobante o documento' });

                    return {
                        id: r.id,
                        fecha: r.fecha,
                        documento: r.documento || '-',
                        tipo_doc: (r.tipo_doc || '').toUpperCase(),
                        codigo: r.cod_proveedor || '-',
                        nombre: r.nombre || 'Sin nombre',
                        valor: Math.round(Number(r.valor || 0) * 100) / 100,
                        concepto: conceptoStr || 'Gasto operativo',
                        rubro: r.rubro || 'Gastos',
                        es_generico: esGenerico,
                        falta_documento: faltaDocumento,
                        es_incongruente: esGenerico || faltaDocumento,
                        alertas
                    };
                };
                break;

            case 'tarjetas':
                query = `
                    SELECT t.id, t.id_cierre_turno, t.fecha, t.numero_tarjeta, t.autorizacion, 
                           t.id_banco, COALESCE(b.descripcion, t.id_banco) as banco_nombre, 
                           t.valor, t.tipo_operacion
                    FROM cierre_turno_tarjeta t
                    INNER JOIN cierre_turno c ON t.id_cierre_turno = c.id AND t.id_empresa = c.id_empresa
                    LEFT JOIN bancos b ON t.id_banco = b.id AND t.id_empresa = b.id_empresa
                    WHERE c.fecha_turno = ? AND t.id_empresa = ?
                    ORDER BY t.id
                `;
                mapFn = (r) => ({
                    id: r.id,
                    fecha: r.fecha,
                    tarjeta: r.numero_tarjeta || '****',
                    autorizacion: r.autorizacion || '-',
                    banco: r.banco_nombre || 'POS / Terminal',
                    tipo_operacion: r.tipo_operacion || 'VTA',
                    valor: Math.round(Number(r.valor || 0) * 100) / 100
                });
                break;

            case 'remesas':
                query = `
                    SELECT r.id, r.id_cierre_turno, r.fecha, r.documento, r.id_banco,
                           COALESCE(b.descripcion, r.id_banco) as banco_nombre, r.efectivo, r.monedas,
                           r.transferencia, (r.efectivo + r.monedas + r.transferencia) as total,
                           r.num_voucher, r.tipo_operacion
                    FROM cierre_turno_remesa r
                    INNER JOIN cierre_turno c ON r.id_cierre_turno = c.id AND r.id_empresa = c.id_empresa
                    LEFT JOIN bancos b ON r.id_banco = b.id AND r.id_empresa = b.id_empresa
                    WHERE c.fecha_turno = ? AND r.id_empresa = ?
                    ORDER BY r.id
                `;
                mapFn = (r) => ({
                    id: r.id,
                    fecha: r.fecha,
                    documento: r.documento || '-',
                    banco: r.banco_nombre || 'Remesa General',
                    efectivo: Math.round(Number(r.efectivo || 0) * 100) / 100,
                    monedas: Math.round(Number(r.monedas || 0) * 100) / 100,
                    transferencia: Math.round(Number(r.transferencia || 0) * 100) / 100,
                    total: Math.round(Number(r.total || 0) * 100) / 100,
                    voucher: (r.num_voucher || '').trim() || '-',
                    tipo_operacion: r.tipo_operacion || 'VTA'
                });
                break;

            case 'credito':
            case 'creditos':
                query = `
                    SELECT cr.id, cr.id_cierre_turno, cr.fecha, cr.documento, cr.tipo_doc,
                           cr.cod_cliente, COALESCE(cl.nombre, cr.cod_cliente) as cliente_nombre,
                           cr.cod_producto, cr.cantidad, cr.precio, cr.total_descuento as valor,
                           cr.placa, cr.kilometraje
                    FROM cierre_turno_credito cr
                    INNER JOIN cierre_turno c ON cr.id_cierre_turno = c.id AND cr.id_empresa = c.id_empresa
                    LEFT JOIN clientes cl ON cr.cod_cliente = cl.codigo AND cr.id_empresa = cl.id_empresa
                    WHERE c.fecha_turno = ? AND cr.id_empresa = ?
                    ORDER BY cr.id
                `;
                mapFn = (r) => ({
                    id: r.id,
                    fecha: r.fecha,
                    documento: r.documento || '-',
                    tipo_doc: r.tipo_doc || 'CCF',
                    codigo: r.cod_cliente || '-',
                    cliente: r.cliente_nombre || 'Cliente Crédito',
                    producto: r.cod_producto || '-',
                    cantidad: Math.round(Number(r.cantidad || 0) * 100) / 100,
                    precio: Math.round(Number(r.precio || 0) * 1000) / 1000,
                    valor: Math.round(Number(r.valor || 0) * 100) / 100,
                    placa: r.placa || '-',
                    kilometraje: Number(r.kilometraje || 0)
                });
                break;

            case 'lubricantes':
                query = `
                    SELECT l.id_producto, COALESCE(p.descripcion, l.id_producto) as nom_producto, 
                           l.inicial, l.complemento, l.final, l.ventas, l.precio_unitario, l.precio_total
                    FROM inventario_lubricantes l
                    LEFT JOIN productos p ON l.id_producto = p.codigo AND l.id_empresa = p.id_empresa
                    WHERE l.fecha_turno = ? AND l.id_empresa = ? AND (l.inicial > 0 OR l.ventas > 0 OR l.complemento > 0)
                    ORDER BY nom_producto
                `;
                mapFn = (r) => ({
                    codigo: r.id_producto,
                    producto: r.nom_producto,
                    inicial: Number(r.inicial || 0),
                    complemento: Number(r.complemento || 0),
                    final: Number(r.final || 0),
                    ventas: Number(r.ventas || 0),
                    precio_unitario: Math.round(Number(r.precio_unitario || 0) * 100) / 100,
                    precio_total: Math.round(Number(r.precio_total || 0) * 100) / 100
                });
                break;

            case 'lecturas':
            case 'tot_venta':
            case 'total_venta':
                query = `
                    SELECT l.id, l.id_cierre_turno, l.id_producto, l.codigo_producto, l.nom_producto,
                           l.total as galones, l.precio, COALESCE(l.monto, (l.total * l.precio), 0.0) as monto,
                           c.turno
                    FROM cierre_turno_lecturas l
                    INNER JOIN cierre_turno c ON l.id_cierre_turno = c.id AND l.id_empresa = c.id_empresa
                    WHERE c.fecha_turno = ? AND (l.id_empresa = ? OR l.id_empresa = ?)
                    ORDER BY c.turno, l.nom_producto
                `;
                queryParams = [sysDate, cleanId, String(parseInt(id_empresa, 10) || cleanId)];
                mapFn = (r) => ({
                    id: r.id,
                    turno: r.turno || 1,
                    codigo: r.codigo_producto || r.id_producto || '-',
                    producto: r.nom_producto || 'Combustible',
                    galones: Math.round(Number(r.galones || 0) * 100) / 100,
                    precio: Math.round(Number(r.precio || 0) * 1000) / 1000,
                    monto: Math.round(Number(r.monto || 0) * 100) / 100
                });
                break;

            case 'cupones':
                query = `
                    SELECT cp.id, cp.id_cierre_turno, cp.fecha, cp.documento, cp.distribuidora, cp.cod_producto, cp.valor
                    FROM cierre_turno_cupones cp
                    INNER JOIN cierre_turno c ON cp.id_cierre_turno = c.id AND cp.id_empresa = c.id_empresa
                    WHERE c.fecha_turno = ? AND cp.id_empresa = ?
                    ORDER BY cp.id
                `;
                mapFn = (r) => ({
                    id: r.id,
                    fecha: r.fecha,
                    documento: r.documento || '-',
                    distribuidora: r.distribuidora || '-',
                    producto: r.cod_producto || '-',
                    valor: Math.round(Number(r.valor || 0) * 100) / 100
                });
                break;

            case 'cheques':
                query = `
                    SELECT ch.id, ch.id_cierre_turno, ch.fecha, ch.documento, ch.id_banco,
                           COALESCE(b.descripcion, ch.id_banco) as banco_nombre, ch.valor, ch.tipo_operacion
                    FROM cierre_turno_cheques ch
                    INNER JOIN cierre_turno c ON ch.id_cierre_turno = c.id AND ch.id_empresa = c.id_empresa
                    LEFT JOIN bancos b ON ch.id_banco = b.id AND ch.id_empresa = b.id_empresa
                    WHERE c.fecha_turno = ? AND ch.id_empresa = ?
                    ORDER BY ch.id
                `;
                mapFn = (r) => ({
                    id: r.id,
                    fecha: r.fecha,
                    documento: r.documento || '-',
                    banco: r.banco_nombre || 'Banco',
                    tipo_operacion: r.tipo_operacion || 'CHQ',
                    valor: Math.round(Number(r.valor || 0) * 100) / 100
                });
                break;

            case 'anticipos':
                query = `
                    SELECT a.id, a.id_cierre_turno, a.id_cajero, a.id_empleado, a.valor
                    FROM cierre_turno_anticipos a
                    INNER JOIN cierre_turno c ON a.id_cierre_turno = c.id AND a.id_empresa = c.id_empresa
                    WHERE c.fecha_turno = ? AND a.id_empresa = ?
                    ORDER BY a.id
                `;
                mapFn = (r) => ({
                    id: r.id,
                    cajero: r.id_cajero || '-',
                    empleado: r.id_empleado || '-',
                    valor: Math.round(Number(r.valor || 0) * 100) / 100
                });
                break;

            case 'pagos':
                query = `
                    SELECT p.id, p.id_cierre_turno, p.fecha, p.documento, p.tipo_doc, p.cod_cliente,
                           COALESCE(cl.nombre, p.cod_cliente) as cliente_nombre, p.valor, p.cod_producto,
                           p.cantidad, p.precio, p.total_descuento
                    FROM cierre_turno_pagos p
                    INNER JOIN cierre_turno c ON p.id_cierre_turno = c.id AND p.id_empresa = c.id_empresa
                    LEFT JOIN clientes cl ON p.cod_cliente = cl.codigo AND p.id_empresa = cl.id_empresa
                    WHERE c.fecha_turno = ? AND p.id_empresa = ?
                    ORDER BY p.id
                `;
                mapFn = (r) => ({
                    id: r.id,
                    fecha: r.fecha,
                    documento: r.documento || '-',
                    tipo_doc: r.tipo_doc || '-',
                    cliente: r.cliente_nombre || r.cod_cliente || '-',
                    valor: Math.round(Number(r.valor || 0) * 100) / 100
                });
                break;

            case 'descuentos':
                query = `
                    SELECT d.id, d.id_cierre_turno, d.fecha, d.documento, d.cod_cliente,
                           COALESCE(cl.nombre, d.cod_cliente) as cliente_nombre, d.cod_producto,
                           d.cantidad, d.valor, (d.cantidad * d.valor) as total
                    FROM cierre_turno_descuentos d
                    INNER JOIN cierre_turno c ON d.id_cierre_turno = c.id AND d.id_empresa = c.id_empresa
                    LEFT JOIN clientes cl ON d.cod_cliente = cl.codigo AND d.id_empresa = cl.id_empresa
                    WHERE c.fecha_turno = ? AND d.id_empresa = ?
                    ORDER BY d.id
                `;
                mapFn = (r) => ({
                    id: r.id,
                    fecha: r.fecha,
                    documento: r.documento || '-',
                    cliente: r.cliente_nombre || r.cod_cliente || '-',
                    producto: r.cod_producto || '-',
                    cantidad: Number(r.cantidad || 0),
                    valor: Math.round(Number(r.valor || 0) * 100) / 100,
                    total: Math.round(Number(r.total || 0) * 100) / 100
                });
                break;

            default:
                return res.status(400).json({ message: `Rubro '${rubro}' no soportado` });
        }

        const [rows] = await externalDb.query(query, queryParams);
        const mapped = (rows || []).map(mapFn);
        const total = mapped.reduce((acc, curr) => acc + Number(curr.valor || curr.total || curr.monto || curr.precio_total || 0), 0);

        res.json({
            id_empresa: cleanId,
            estacion_nombre: estacionNombre,
            rubro,
            fecha: date,
            fecha_turno: sysDate,
            total: Math.round(total * 100) / 100,
            registros: mapped
        });
    } catch (error) {
        sendSafeError(res, error, `Error al consultar detalle de ${rubro}`);
    }
});

// Dictamen Forense con IA para Descuadres de Cierre de Pista
router.post('/ventas/cierre-turno/analisis-ia', authenticateToken, requirePermission(cierreViewPerms), async (req, res) => {
    const { id_empresa, fecha, station_name, explicacion_diferencia, turnos } = req.body;
    try {
        const stationName = station_name || `Estación ${id_empresa}`;
        const exp = explicacion_diferencia || {};
        const dif = Number(exp.diferencia || 0);
        const totVenta = Number(exp.tot_venta || 0);
        const noEfectivo = Number(exp.no_efectivo || 0);
        const efectivoEsperado = Number(exp.efectivo_esperado || 0);
        const remesas = Number(exp.desglose_descargos?.remesas || 0);
        const gastos = Number(exp.desglose_descargos?.gastos || 0);
        const pagos = Number(exp.desglose_descargos?.pagos || 0);
        const turnosList = Array.isArray(turnos) ? turnos : [];

        // 1. Si hay clave GEMINI_API_KEY disponible en el entorno
        if (process.env.GEMINI_API_KEY) {
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const prompt = `Eres un Auditor Forense Senior y Controller Financiero Corporativo de Estaciones de Servicio de Combustibles (Gasolineras) de Grupo SIPE.
Tu trabajo es auditar un cierre de turno de pista que presenta una diferencia o descuadre de efectivo.

DATOS DEL CIERRE AUDITADO:
- Estación: ${stationName} (Código: ${id_empresa})
- Fecha del Turno: ${fecha}
- Venta Total Pista (Combustible + Lubricantes): $${totVenta.toFixed(2)}
- Cobros en Medios Electrónicos / No Efectivo (Tarjetas POS, Cupones, Crédito): -$${noEfectivo.toFixed(2)}
- Efectivo Físico que Debió Ingresar a Gaveta de Bomberos (Efectivo Esperado): $${efectivoEsperado.toFixed(2)}
- Remesas Depositadas en Banco: $${remesas.toFixed(2)}
- Comprobantes de Gastos y Pagos Autorizados: $${(gastos + pagos).toFixed(2)}
- Descuadre Neto de Cierre: $${dif.toFixed(2)} (${dif < -0.05 ? 'FALTANTE DE EFECTIVO' : (dif > 0.05 ? 'SOBRANTE DE EFECTIVO' : 'CUADRADO')})

DESGLOSE POR TURNOS DE PISTA:
${turnosList.map(t => `• Turno ${t.turno} (ID: ${t.id}) - Responsable: ${t.responsable || 'Sin asignar'} | Venta: $${Number(t.venta || 0).toFixed(2)} | Remesas: $${Number(t.remesas || 0).toFixed(2)} | Tarjetas: $${Number(t.tarjetas || 0).toFixed(2)} | Gastos/Pagos: $${(Number(t.gastos || 0) + Number(t.pagos || 0)).toFixed(2)} | Diferencia Turno: $${Number(t.diferencia || 0).toFixed(2)}`).join('\n') || 'No se registraron turnos individuales'}

INSTRUCCIÓN:
Emite un dictamen pericial forense riguroso, objetivo y en español profesional. Devuelve EXCLUSIVAMENTE un JSON válido con esta estructura exacta:
{
    "nivel_criticidad": "CRITICO" | "ALTO" | "MEDIO" | "BAJO" | "NORMAL",
    "dictamen_ejecutivo": "Texto pericial explicando claramente el origen matemático y físico de la discrepancia...",
    "foco_responsabilidad": "Identificación precisa del turno y bombero donde se concentró el descuadre con % de concentración...",
    "hipotesis_forenses": [
        "Hipótesis 1: ...",
        "Hipótesis 2: ..."
    ],
    "preguntas_interrogatorio": [
        "Pregunta 1 para el responsable del turno...",
        "Pregunta 2..."
    ],
    "acciones_inmediatas": [
        "Paso 1: ...",
        "Paso 2: ..."
    ],
    "recomendaciones_control_interno": [
        "Recomendación 1: ...",
        "Recomendación 2: ..."
    ]
}`;

                const result = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: {
                        temperature: 0.2,
                        responseMimeType: 'application/json'
                    }
                });

                const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
                const parsed = JSON.parse(rawText);

                return res.json({
                    success: true,
                    fuente: 'gemini-2.0-flash',
                    data: parsed
                });
            } catch (aiErr) {
                console.warn('[Cierre Turno IA] Error invocando Gemini, utilizando fallback heurístico:', aiErr.message);
            }
        }

        // 2. Fallback Heurístico Experto si no hay API Key o falla Gemini
        const analisisHeuristico = exp.analisis_inteligente || generarAnalisisDescuadre({
            id_empresa,
            estacion: stationName,
            fecha,
            totVenta,
            noEfectivo,
            efectivoEsperado,
            efectivoDescargado: exp.efectivo_descargado || (remesas + gastos + pagos),
            desgloseDescargos: exp.desglose_descargos || { remesas, gastos, pagos },
            diferencia: dif,
            turnos: turnosList
        });

        const fallbackData = {
            nivel_criticidad: dif < -1000 ? 'CRITICO' : (dif < -300 ? 'ALTO' : (dif < -50 ? 'MEDIO' : (dif > 0.05 ? 'ALTO' : 'NORMAL'))),
            dictamen_ejecutivo: analisisHeuristico.diagnostico_principal,
            foco_responsabilidad: analisisHeuristico.foco_turno
                ? analisisHeuristico.foco_turno.texto
                : (turnosList.length > 0 ? 'No se evidencia concentración en un solo turno.' : 'No hay detalle individual de turnos para aislar al responsable.'),
            hipotesis_forenses: (analisisHeuristico.hipotesis_probables || []).map(h => `${h.titulo} (${h.probabilidad}): ${h.descripcion}`),
            preguntas_interrogatorio: [
                analisisHeuristico.foco_turno
                    ? `¿Tiene el responsable ${analisisHeuristico.foco_turno.responsable} en su poder la boleta de remesa física o sobre de seguridad con los $${Math.abs(analisisHeuristico.foco_turno.diferencia).toFixed(2)} faltantes?`
                    : '¿Se verificó el contenido físico de la caja fuerte de la estación al momento del corte?',
                '¿Se realizaron pagos o gastos en efectivo durante el turno que no hayan sido facturados o entregados a administración?',
                '¿Existen comprobantes de tarjetas de crédito o vales de combustible archivados que no se hayan digitado en el sistema?'
            ],
            acciones_inmediatas: (analisisHeuristico.checklist_auditoria || []).map(c => `${c.accion}: ${c.detalle}`),
            recomendaciones_control_interno: [
                'Exigir que ninguna entrega de turno se firme sin que la boleta de remesa bancaria coincida con el arqueo de gaveta.',
                'Auditar en un plazo máximo de 24 horas los depósitos en tránsito o buzón nocturno con el estado de cuenta del banco.',
                'Establecer tope máximo de efectivo en gaveta para obligar a remesas parciales durante el turno.'
            ]
        };

        return res.json({
            success: true,
            fuente: 'heuristica_experta',
            data: fallbackData
        });

    } catch (err) {
        sendSafeError(res, err, 'Error generando análisis IA de descuadre');
    }
});
}

module.exports = {
    registerConsultasCierresRoutes
};
