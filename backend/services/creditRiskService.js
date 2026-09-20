const { getAccountingDb, getExternalDb, withRetry } = require('../db');

/**
 * Monitoreo de riesgo crediticio para flotas y clientes corporativos
 */
const getRiesgoCreditoFlotas = async () => {
    let clientes = [];

    // 1. Intentar consultar base de datos de Nova SaaS (db_sistema_saas)
    try {
        const accountingDb = await getAccountingDb();
        const query = `
            SELECT 
                c.id,
                c.company_id,
                comp.nombre_comercial as empresa_emisora,
                COALESCE(c.nombre_comercial, c.nombre) as cliente_nombre,
                c.nit,
                c.nrc,
                COALESCE(c.limite_credito, 5000.00) as limite_credito,
                COALESCE(c.dias_credito, 15) as dias_plazo,
                COALESCE(SUM(s.monto_total), 0.0) as facturado_credito,
                COALESCE(p.total_pagado, 0.0) as total_pagado,
                (COALESCE(SUM(s.monto_total), 0.0) - COALESCE(p.total_pagado, 0.0)) as saldo_pendiente,
                MIN(s.fecha_emision) as factura_mas_antigua_pendiente
            FROM customers c
            INNER JOIN companies comp ON c.company_id = comp.id
            LEFT JOIN sales_headers s ON c.id = s.customer_id AND s.condicion_operacion = 'CREDITO' AND s.status != 'ANULADA'
            LEFT JOIN (
                SELECT customer_id, SUM(monto) as total_pagado
                FROM customer_payments
                GROUP BY customer_id
            ) p ON c.id = p.customer_id
            WHERE c.es_credito = 1 OR c.limite_credito > 0
            GROUP BY c.id
            ORDER BY saldo_pendiente DESC
        `;
        const [rows] = await withRetry(() => accountingDb.query(query));
        clientes = rows;
    } catch (err) {
        console.warn('Fallback a clientes de crédito de cierre de turnos:', err.message);
    }

    // 2. Si no hay clientes en Nova SaaS o falló la conexión, tomar de cierre_turno_credito en db_system_rrs
    if (clientes.length === 0) {
        try {
            const externalDb = await getExternalDb();
            const sqlRrs = `
                SELECT 
                    a.nom_cliente as cliente_nombre,
                    b.titulo as empresa_emisora,
                    SUM(a.total_descuento) as saldo_pendiente,
                    5000.00 as limite_credito,
                    15 as dias_plazo,
                    COUNT(a.id) as transacciones_activas
                FROM cierre_turno_credito a
                INNER JOIN web_consolidado b ON a.id_empresa = b.id_empresa
                GROUP BY a.nom_cliente, b.titulo
                HAVING saldo_pendiente > 0
                ORDER BY saldo_pendiente DESC
                LIMIT 25
            `;
            const [rowsRrs] = await withRetry(() => externalDb.query(sqlRrs));
            clientes = rowsRrs.map((r, idx) => ({
                id: idx + 1,
                cliente_nombre: r.cliente_nombre || 'Cliente Flota',
                empresa_emisora: r.empresa_emisora,
                limite_credito: Number(r.limite_credito),
                dias_plazo: Number(r.dias_plazo),
                saldo_pendiente: Number(r.saldo_pendiente),
                factura_mas_antigua_pendiente: null
            }));
        } catch (e) {
            console.error('Error al consultar clientes en RRS:', e.message);
        }
    }

    const today = new Date();
    let totalCarteraCredito = 0;
    let totalSaldoVencido = 0;
    let clientesEnRiesgoAlto = 0;

    const reporteClientes = clientes.map(c => {
        const saldo = Math.max(0, Number(c.saldo_pendiente || 0));
        const limite = Math.max(1, Number(c.limite_credito || 5000));
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
            nivel_riesgo: nivelRiesgo,
            accion_sugerida: accionSugerida
        };
    });

    return {
        resumen_cartera: {
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
