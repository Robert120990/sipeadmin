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

/**
 * Evalúa el estado de pago, porcentaje pagado y mora de un DTE
 */
const calcularEstadoPagoDte = ({ total_pagar = 0, total_abonado = 0, condicion_operacion = 2, fecha_emision = null, dias_plazo = 15, fecha_referencia = new Date() }) => {
    const total = Number(total_pagar || 0);
    const abonado = Number(total_abonado || 0);
    const saldo = Math.max(0, Math.round((total - abonado) * 100) / 100);
    const esCredito = Number(condicion_operacion) === 2;

    let estado_pago = 'PENDIENTE';
    if (!esCredito) {
        estado_pago = 'PAGADO_CONTADO';
    } else if (saldo <= 0.01) {
        estado_pago = 'PAGADO';
    } else if (abonado > 0) {
        estado_pago = 'ABONADO_PARCIAL';
    } else {
        estado_pago = 'PENDIENTE';
    }

    let dias_transcurridos = 0;
    let dias_mora = 0;
    if (fecha_emision) {
        const fEmi = new Date(fecha_emision);
        if (!isNaN(fEmi.getTime())) {
            const diff = Math.abs(fecha_referencia - fEmi);
            dias_transcurridos = Math.floor(diff / (1000 * 60 * 60 * 24));
            if (esCredito && estado_pago !== 'PAGADO' && dias_transcurridos > dias_plazo) {
                dias_mora = dias_transcurridos - dias_plazo;
            }
        }
    }

    const porcentaje_pagado = total > 0 ? Math.min(100, Math.round((abonado / total) * 100)) : 100;

    return {
        total_pagar: total,
        total_abonado: abonado,
        saldo_pendiente: saldo,
        porcentaje_pagado,
        estado_pago,
        dias_transcurridos,
        dias_mora,
        vencido: dias_mora > 0
    };
};

/**
 * Consulta de DTEs, estado de pago y abonos de un cliente específico
 * Conectado exclusivamente a Nova SaaS (db_sistema_saas)
 * @param {number|string} customerId 
 */
const getDetalleDtesCliente = async (customerId) => {
    const accountingDb = await getAccountingDb();

    // 1. Datos del cliente
    const [custRows] = await withRetry(() => accountingDb.query(`
        SELECT 
            c.id,
            c.company_id,
            comp.nombre_comercial as empresa_emisora,
            COALESCE(c.nombre_comercial, c.nombre) as cliente_nombre,
            c.nit,
            c.nrc,
            COALESCE(c.dias_credito, 15) as dias_plazo
        FROM customers c
        INNER JOIN companies comp ON c.company_id = comp.id
        WHERE c.id = ?
        LIMIT 1
    `, [customerId]));

    if (!custRows || custRows.length === 0) {
        throw new Error('Cliente no encontrado en la base de datos');
    }
    const cliente = custRows[0];

    // 2. DTEs emitidos para el cliente
    const [dtesRows] = await withRetry(() => accountingDb.query(`
        SELECT 
            s.id as sale_id,
            s.company_id,
            s.branch_id,
            b.nombre as sucursal_nombre,
            s.tipo_documento,
            s.dte_type,
            s.numero_control,
            s.codigo_generacion,
            s.sello_recepcion,
            s.fecha_emision,
            s.hora_emision,
            s.condicion_operacion,
            s.estado,
            s.total_gravado,
            s.total_iva,
            s.total_pagar,
            COALESCE(p.total_abonado, 0.0) as total_abonado
        FROM sales_headers s
        LEFT JOIN branches b ON s.branch_id = b.id
        LEFT JOIN (
            SELECT sale_id, SUM(monto) as total_abonado
            FROM customer_payments
            WHERE sale_id IS NOT NULL
            GROUP BY sale_id
        ) p ON s.id = p.sale_id
        WHERE s.customer_id = ?
          AND s.estado != 'invalidado'
        ORDER BY s.fecha_emision DESC, s.id DESC
        LIMIT 250
    `, [customerId]));

    // 3. Abonos y pagos recibidos del cliente
    const [pagosRows] = await withRetry(() => accountingDb.query(`
        SELECT 
            cp.id,
            cp.company_id,
            cp.branch_id,
            b.nombre as sucursal_nombre,
            cp.customer_id,
            cp.sale_id,
            cp.monto,
            cp.fecha_pago,
            cp.metodo_pago,
            cp.referencia,
            cp.notas,
            cp.created_at,
            s.numero_control,
            s.codigo_generacion,
            s.fecha_emision as dte_fecha_emision
        FROM customer_payments cp
        LEFT JOIN branches b ON cp.branch_id = b.id
        LEFT JOIN sales_headers s ON cp.sale_id = s.id
        WHERE cp.customer_id = ?
        ORDER BY cp.fecha_pago DESC, cp.id DESC
        LIMIT 250
    `, [customerId]));

    const TIPO_DTE_LABELS = {
        '01': 'Factura Electrónica (FE)',
        '03': 'Comprobante Crédito Fiscal (CCF)',
        '05': 'Nota de Crédito (NC)',
        '06': 'Nota de Débito (ND)',
        '11': 'Factura de Exportación (FEX)',
        '14': 'Factura Sujeto Excluido (FSE)'
    };

    const METODOS_PAGO_LABELS = {
        '01': 'Efectivo',
        '02': 'Tarjeta Débito/Crédito',
        '03': 'Cheque',
        '04': 'Transferencia / Depósito',
        '05': 'Giro Bancario',
        '06': 'Otros'
    };

    const today = new Date();
    const plazoDias = Number(cliente.dias_plazo || 15);

    let totalFacturado = 0;
    let totalAbonado = 0;
    let totalSaldoPendiente = 0;
    let dtesPagadosCount = 0;
    let dtesPendientesCount = 0;
    let dtesAbonoParcialCount = 0;

    const dtes = dtesRows.map(row => {
        const calculos = calcularEstadoPagoDte({
            total_pagar: row.total_pagar,
            total_abonado: row.total_abonado,
            condicion_operacion: row.condicion_operacion,
            fecha_emision: row.fecha_emision,
            dias_plazo: plazoDias,
            fecha_referencia: today
        });

        totalFacturado += calculos.total_pagar;
        totalAbonado += calculos.total_abonado;
        totalSaldoPendiente += calculos.saldo_pendiente;

        if (calculos.estado_pago === 'PAGADO' || calculos.estado_pago === 'PAGADO_CONTADO') {
            dtesPagadosCount++;
        } else if (calculos.estado_pago === 'ABONADO_PARCIAL') {
            dtesAbonoParcialCount++;
        } else {
            dtesPendientesCount++;
        }

        const tipoCodigo = row.dte_type || row.tipo_documento || '03';
        const tipoDesc = TIPO_DTE_LABELS[tipoCodigo] || `DTE-${tipoCodigo}`;

        return {
            id: row.sale_id,
            numero_control: row.numero_control || `VTA-${row.sale_id}`,
            codigo_generacion: row.codigo_generacion || null,
            sello_recepcion: row.sello_recepcion || null,
            tipo_dte: tipoCodigo,
            tipo_dte_desc: tipoDesc,
            condicion_operacion: Number(row.condicion_operacion) === 2 ? 'Crédito' : 'Contado',
            fecha_emision: row.fecha_emision ? (row.fecha_emision instanceof Date ? row.fecha_emision.toISOString().split('T')[0] : String(row.fecha_emision).split('T')[0]) : null,
            hora_emision: row.hora_emision || null,
            sucursal_nombre: row.sucursal_nombre || 'Estación Central',
            total_gravado: Number(row.total_gravado || 0),
            total_iva: Number(row.total_iva || 0),
            total_pagar: calculos.total_pagar,
            total_abonado: calculos.total_abonado,
            saldo_pendiente: calculos.saldo_pendiente,
            porcentaje_pagado: calculos.porcentaje_pagado,
            estado_pago: calculos.estado_pago,
            dias_transcurridos: calculos.dias_transcurridos,
            dias_mora: calculos.dias_mora,
            vencido: calculos.vencido
        };
    });

    const abonos = pagosRows.map(p => {
        const metodoKey = String(p.metodo_pago || '').trim();
        return {
            id: p.id,
            monto: Number(p.monto || 0),
            fecha_pago: p.fecha_pago ? (p.fecha_pago instanceof Date ? p.fecha_pago.toISOString().split('T')[0] : String(p.fecha_pago).split('T')[0]) : null,
            metodo_pago: METODOS_PAGO_LABELS[metodoKey] || p.metodo_pago || 'Pago Registrado',
            referencia: p.referencia || 'S/R',
            notas: p.notas || '',
            sale_id: p.sale_id || null,
            numero_control: p.numero_control || (p.sale_id ? `Venta #${p.sale_id}` : null),
            codigo_generacion: p.codigo_generacion || null,
            tipo_abono: p.sale_id ? 'ABONO_DTE' : 'ABONO_GENERAL'
        };
    });

    const totalPagosRegistrados = abonos.reduce((sum, a) => sum + a.monto, 0);

    return {
        cliente: {
            id: cliente.id,
            nombre: cliente.cliente_nombre,
            empresa_emisora: cliente.empresa_emisora,
            nit: cliente.nit,
            nrc: cliente.nrc,
            dias_plazo: plazoDias
        },
        resumen: {
            total_facturado_usd: Math.round(totalFacturado * 100) / 100,
            total_abonado_usd: Math.round(totalAbonado * 100) / 100,
            total_pagos_recibidos_usd: Math.round(totalPagosRegistrados * 100) / 100,
            saldo_pendiente_usd: Math.max(0, Math.round((totalFacturado - totalPagosRegistrados) * 100) / 100),
            saldo_pendiente_dtes_usd: Math.round(totalSaldoPendiente * 100) / 100,
            total_dtes: dtes.length,
            dtes_pagados: dtesPagadosCount,
            dtes_con_abono: dtesAbonoParcialCount,
            dtes_pendientes: dtesPendientesCount
        },
        dtes,
        abonos
    };
};

module.exports = {
    getRiesgoCreditoFlotas,
    getDetalleDtesCliente,
    calcularEstadoPagoDte
};
