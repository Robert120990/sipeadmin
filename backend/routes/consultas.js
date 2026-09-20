const express = require('express');
const router = express.Router();
const { getExternalDb, getAccountingDb, withRetry } = require('../db');
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
            SELECT b.fecha, a.id_empresa, a.titulo, 
                   SUM(IF(b.fecha = ?, IFNULL(b.monto, 0.0), 0.0)) as monto, 
                   AVG(IFNULL(b.monto, 0.0)) as promedio 
            FROM web_consolidado a 
            LEFT JOIN ventas_tienda b ON a.id_empresa = b.id_empresa AND b.fecha BETWEEN ? AND ?
            WHERE a.grupo = 'TIENDA' 
            GROUP BY a.id_empresa 
            ORDER BY a.orden
        `;
        const [tiendasRows] = await externalDb.query(sqlTiendas, [date, cInicioStr, date]);
        const tiendasLocal = tiendasRows.map(row => ({
            fecha: date, empresa: row.titulo, venta: Number(row.monto || 0), promedio: Number(row.promedio || 0)
        }));

        const sqlEstaciones = `
            SELECT a.titulo, 
                   IFNULL(SUM(IF(d.clasificacion = 'D', b.total, 0.0)), 0.0) as diesel, 
                   IFNULL(SUM(IF(d.clasificacion = 'R', b.total, 0.0)), 0.0) as regular, 
                   IFNULL(SUM(IF(d.clasificacion = 'S', b.total, 0.0)), 0.0) as super, 
                   IFNULL(SUM(IF(d.clasificacion = 'I', b.total, 0.0)), 0.0) as ion, 
                   IFNULL(SUM(b.total), 0.0) as galonaje, 
                   IFNULL(SUM(b.total * b.precio), 0.0) as monto, 
                   a.id_empresa 
            FROM web_consolidado a 
            LEFT JOIN cierre_turno_lecturas b ON a.id_empresa = b.id_empresa 
            INNER JOIN cfg_combustibles d ON b.id_empresa = d.id_empresa AND b.id_producto = d.id_producto 
            INNER JOIN cierre_turno c ON b.id_cierre_turno = c.id AND b.id_empresa = c.id_empresa AND c.fecha_turno = ? 
            WHERE a.grupo = 'ESTACION' 
            GROUP BY a.id_empresa 
            ORDER BY a.orden
        `;
        const [estacionesRows] = await externalDb.query(sqlEstaciones, [sysDate]);
        const estacionesLocal = estacionesRows.map(row => ({
            empresa: row.titulo, diesel: Number(row.diesel || 0), regular: Number(row.regular || 0), super: Number(row.super || 0), ion: Number(row.ion || 0), galonaje: Number(row.galonaje || 0), venta: Number(row.monto || 0)
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
                 GROUP BY codigo_producto, a.id_empresa 
            ) c ON b.id_empresa = c.id_empresa AND b.codigo = c.codigo_producto 
            WHERE a.grupo = 'ESTACION' 
            GROUP BY id_empresa 
            ORDER BY orden
        `;
        const [margenesRows] = await externalDb.query(sqlMargenes, [sysDate]);
        const [costsRows] = await externalDb.query(`SELECT id_empresa, cod_producto, costo FROM combustibles_costos WHERE id IN (SELECT MAX(id) FROM combustibles_costos GROUP BY id_empresa, cod_producto)`);
        const costsMap = {};
        costsRows.forEach(row => { if (!costsMap[row.id_empresa]) costsMap[row.id_empresa] = {}; costsMap[row.id_empresa][row.cod_producto] = Number(row.costo || 0); });
        const margenesLocal = margenesRows.map(row => {
            const getC = (prod) => (costsMap[row.id_empresa] && costsMap[row.id_empresa][prod]) || 0;
            const cD = getC('DIESEL'), cR = getC('REGULAR'), cS = getC('SUPER'), cI = getC('IONDIESEL');
            return { empresa: row.titulo, margen_da: Number(row.diesel_a || 0) - cD, margen_ra: Number(row.regular_a || 0) - cR, margen_sa: Number(row.super_a || 0) - cS, margen_dc: Number(row.diesel_c || 0) - cD, margen_rc: Number(row.regular_c || 0) - cR, margen_sc: Number(row.super_c || 0) - cS, margen_io: Number(row.ion_diesel || 0) - cI, margen_master: Number(row.master || 0) - cD };
        });

        const cDesde = new Date(date + 'T12:00:00'); cDesde.setDate(cDesde.getDate() - 6);
        const promediosDates = []; let pCurr = new Date(cDesde);
        while (pCurr <= new Date(date + 'T12:00:00')) { const d = String(pCurr.getDate()).padStart(2, '0'); const m = String(pCurr.getMonth() + 1).padStart(2, '0'); const y = pCurr.getFullYear(); promediosDates.push(`${d}/${m}/${y}`); pCurr.setDate(pCurr.getDate() + 1); }

        const [lecturasRows, promediosRows] = await Promise.all([
            externalDb.query(`SELECT b.lectura, c.galones_reserva, IF(c.tipo_combustible='M','I',c.tipo_combustible) as tipo_combustible, a.id_empresa FROM lecturas_tanque a INNER JOIN detalle_lecturas_tanque b ON a.id = b.id_lectura AND a.id_empresa = b.id_empresa INNER JOIN tanques c ON b.codigo_producto = c.id AND b.id_empresa = c.id_empresa WHERE a.fecha = ? AND a.turno = (SELECT MAX(x.turno) FROM lecturas_tanque x WHERE x.id_empresa = a.id_empresa AND x.fecha = a.fecha)`, [date]),
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

        res.json({ tiendas: tiendasLocal, estaciones: estacionesLocal, margenes: margenesLocal, inventario: inventarioLocal });
    } catch (error) { res.status(500).json({ message: 'Error fetching consolidado' }); }
});

router.get('/ventas/lubricantes/:start/:end', authenticateToken, async (req, res) => {
    const { start, end } = req.params;
    try {
        const externalDb = await getExternalDb();
        const datesArray = []; let curr = new Date(start + 'T12:00:00');
        while (curr <= new Date(end + 'T12:00:00')) { const day = String(curr.getDate()).padStart(2, '0'); const month = String(curr.getMonth() + 1).padStart(2, '0'); const year = curr.getFullYear(); datesArray.push(`${day}/${month}/${year}`); curr.setDate(curr.getDate() + 1); }
        const sql = `SELECT a.id_empresa, a.titulo, IFNULL(SUM(b.precio_total), 0.0) as monto FROM web_consolidado a LEFT JOIN inventario_lubricantes b ON a.id_empresa = b.id_empresa AND b.fecha_turno IN (?) WHERE a.grupo = 'ESTACION' GROUP BY id_empresa ORDER BY a.orden`;
        const [rows] = await externalDb.query(sql, [datesArray]);
        res.json(rows.map(r => ({ empresa: r.titulo, venta: Number(r.monto || 0) })));
    } catch (error) { res.status(500).json({ message: 'Error fetching lubricantes' }); }
});

router.get('/ventas/resumen-cierre/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    try {
        const externalDb = await getExternalDb();
        const parts = date.split('-'); const sysDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
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
    } catch (error) { res.status(500).json({ message: 'Error fetching resumen' }); }
});

router.get('/ventas/precios-estacion/:date', authenticateToken, async (req, res) => {
    const { date } = req.params;
    try {
        const externalDb = await getExternalDb();
        const parts = date.split('-'); const sysDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        const sql = `select a.id_empresa,a.titulo, sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'A',c.precio,0.0),0.0)) as diesel_a,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'A',c.precio,0.0),0.0)) as regular_a,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'A',c.precio,0.0),0.0)) as super_a, sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'F',c.precio,0.0),0.0)) as diesel_c,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'F',c.precio,0.0),0.0)) as regular_c,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'F',c.precio,0.0),0.0)) as super_c, sum(ifnull(if(b.clasificacion = 'I',c.precio,0.0),0.0)) as ion_diesel,sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'M',c.precio,0.0),0.0)) as master from web_consolidado a left join cfg_combustibles b on a.id_empresa = b.id_empresa left join ( SELECT a.id_empresa,a.id_producto, a.codigo_producto,a.nom_producto,precio FROM cierre_turno_lecturas a INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa=b.id_empresa WHERE b.fecha_turno = ? AND b.turno = (SELECT MAX(x.turno) FROM cierre_turno x WHERE x.id_empresa=b.id_empresa AND x.fecha_turno=b.fecha_turno) GROUP BY codigo_producto,a.id_empresa order by id_empresa,codigo_producto) c on b.id_empresa = c.id_empresa and b.codigo = c.codigo_producto where a.grupo = 'ESTACION' group by id_empresa order by orden`;
        const [rows] = await externalDb.query(sql, [sysDate]);
        res.json(rows.map(r => ({ empresa: r.titulo, diesel_a: Number(r.diesel_a), regular_a: Number(r.regular_a), super_a: Number(r.super_a), diesel_c: Number(r.diesel_c), regular_c: Number(r.regular_c), super_c: Number(r.super_c), ion_diesel: Number(r.ion_diesel), master: Number(r.master) })));
    } catch (error) { res.status(500).json({ message: 'Error fetching precios' }); }
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
        const sql2 = `select a.id_empresa,a.fecha,a.turno,c.tipo_combustible,sum(b.anterior) as anterior,sum(b.recarga) as recarga,sum(b.lectura) as lectura from lecturas_tanque a inner join detalle_lecturas_tanque b on a.id_empresa = b.id_empresa and a.id = b.id_lectura inner join tanques c on a.id_empresa = c.id_empresa and b.codigo_producto = c.id where a.fecha between ? and ? group by id_empresa,tipo_combustible,fecha,turno order by id_empresa,fecha,turno`;
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
