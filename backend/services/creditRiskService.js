const { getAccountingDb, withRetry } = require('../db');

/**
 * Monitoreo de riesgo crediticio para flotas y clientes corporativos
 * Conectado exclusivamente a Nova SaaS (db_sistema_saas)
 */
const getRiesgoCreditoFlotas = async () => {
    let clientes = [];

    const accountingDb = await getAccountingDb();

    // 1. Facturas y saldos de clientes a crédito
    const query = `
        SELECT 
            c.id,
            c.company_id,
            comp.nombre_comercial as empresa_emisora,
            COALESCE(c.nombre_comercial, c.nombre) as cliente_nombre,
            c.nit,
            c.nrc,
            COALESCE(c.dias_credito, 15) as dias_plazo,
            COALESCE(SUM(s.total_pagar), 0.0) as facturado_credito,
            COALESCE(p.total_pagado, 0.0) as total_pagado,
            (COALESCE(SUM(s.total_pagar), 0.0) - COALESCE(p.total_pagado, 0.0)) as saldo_pendiente,
            MIN(s.fecha_emision) as factura_mas_antigua_pendiente
        FROM customers c
        INNER JOIN companies comp ON c.company_id = comp.id
        LEFT JOIN sales_headers s ON c.id = s.customer_id AND s.condicion_operacion = 2 AND s.estado = 'emitido'
        LEFT JOIN (
            SELECT customer_id, SUM(monto) as total_pagado
            FROM customer_payments
            GROUP BY customer_id
        ) p ON c.id = p.customer_id
        WHERE c.es_credito = 1
        GROUP BY c.id, c.company_id, comp.nombre_comercial, c.nombre_comercial, c.nombre, c.nit, c.nrc, c.dias_credito
        HAVING saldo_pendiente > 0 OR facturado_credito > 0
        ORDER BY saldo_pendiente DESC
        LIMIT 50
    `;
    const [rows] = await withRetry(() => accountingDb.query(query));
    clientes = rows;

    // 2. Vales de pista no facturados en turnos cerrados (gas_station_closeout_creditos)
    const valesPistaMap = {};
    try {
        const [valesRows] = await withRetry(() => accountingDb.query(`
            SELECT gsc.cliente_id, COALESCE(SUM(gsc.monto), 0.0) as total_vales
            FROM gas_station_closeout_creditos gsc
            JOIN gas_station_closeouts c ON gsc.closeout_id = c.id
            WHERE c.estado = 'cerrado'
            GROUP BY gsc.cliente_id
        `));
        valesRows.forEach(v => {
            if (v.cliente_id) valesPistaMap[v.cliente_id] = Number(v.total_vales || 0);
        });
    } catch (e) {
        // Opcional si la tabla no está poblada
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    let totalCarteraCredito = 0;
    let totalSaldoVencido = 0;
    let clientesEnRiesgoAlto = 0;

    const reporteClientes = clientes.map(c => {
        const valesPista = valesPistaMap[c.id] || 0;
        const saldoFacturas = Math.max(0, Number(c.saldo_pendiente || 0));
        const saldo = saldoFacturas + valesPista;

        // Línea de crédito estimada si la base no tiene columna de límite explícito
        const facturado = Number(c.facturado_credito || 0);
        const limite = Math.max(5000, Math.ceil((facturado > 0 ? facturado * 1.2 : 5000) / 1000) * 1000);
        const plazoDias = Number(c.dias_plazo || 15);

        const porcentajeUtilizado = Math.min(100, Math.round((saldo / limite) * 100));

        // Calcular días de mora si hay fecha de factura más antigua
        let diasMora = 0;
        if (c.factura_mas_antigua_pendiente) {
            const fAntigua = new Date(c.factura_mas_antigua_pendiente);
            const diffTime = Math.abs(today - fAntigua);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > plazoDias) {
                diasMora = diffDays - plazoDias;
            }
        }

        totalCarteraCredito += saldo;
        if (diasMora > 0) totalSaldoVencido += saldo;

        // Semáforo de riesgo
        let nivelRiesgo = 'bajo';
        let accionSugerida = 'Línea de crédito en orden.';

        if (porcentajeUtilizado >= 95 || diasMora > 7) {
            nivelRiesgo = 'critico';
            accionSugerida = 'SUSPENDER DESPACHO DE VALES. Notificar a gerencia de pista y enviar cobrador.';
            clientesEnRiesgoAlto++;
        } else if (porcentajeUtilizado >= 75 || diasMora > 0) {
            nivelRiesgo = 'advertencia';
            accionSugerida = 'Cerca del límite o días de gracia vencidos. Enviar recordatorio de pago.';
        }

        return {
            id: c.id,
            cliente: c.cliente_nombre,
            empresa_emisora: c.empresa_emisora,
            limite_credito: Math.round(limite),
            saldo_pendiente: Math.round(saldo * 100) / 100,
            disponible_credito: Math.round(Math.max(0, limite - saldo)),
            porcentaje_utilizado: porcentajeUtilizado,
            dias_plazo: plazoDias,
            dias_mora: diasMora,
            fecha_antigua: c.factura_mas_antigua_pendiente ? (c.factura_mas_antigua_pendiente instanceof Date ? c.factura_mas_antigua_pendiente.toISOString().split('T')[0] : String(c.factura_mas_antigua_pendiente).split('T')[0]) : null,
            nivel_riesgo: nivelRiesgo,
            accion_sugerida: accionSugerida
        };
    });

    return {
        resumen_cartera: {
            fecha_corte: todayStr,
            total_cartera_activa_usd: Math.round(totalCarteraCredito * 100) / 100,
            total_saldo_vencido_usd: Math.round(totalSaldoVencido * 100) / 100,
            porcentaje_morosidad: totalCarteraCredito > 0 ? Math.round((totalSaldoVencido / totalCarteraCredito) * 100) : 0,
            total_clientes_analizados: reporteClientes.length,
            clientes_criticos_para_bloqueo: clientesEnRiesgoAlto
        },
        clientes: reporteClientes
    };
};

module.exports = {
    getRiesgoCreditoFlotas
};
