const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb ? dbModule.getExternalDb(...args) : null;
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const withRetry = (...args) => dbModule.withRetry(...args);

/**
 * Genera el flujo de caja proyectado a 30 o 60 días
 * Consolidando saldos bancarios actuales, ventas promedio en turnos cerrados, cuotas de préstamos,
 * compromisos de proveedores (purchase_quedans), compras estimadas de combustible y nómina quincenal.
 */
const getFlujoCajaProyectado = async (diasHorizonte = 30) => {
    const horizon = parseInt(diasHorizonte, 10) === 60 ? 60 : 30;
    const db = getDb();
    const accountingDb = await getAccountingDb();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 1. Obtener saldo inicial en bancos desde movimientos y cuentas bancarias de SIPE
    let saldoInicialBancos = 0;
    try {
        const [localBalanceRows] = await db.query(`
            SELECT COALESCE(SUM(abono - cargo), 0) as saldo_neto
            FROM movimientos_bancarios
        `);
        saldoInicialBancos = Number(localBalanceRows[0]?.saldo_neto || 0);
    } catch (err) {
        console.warn('Error al calcular saldo en movimientos bancarios:', err.message);
    }

    if (saldoInicialBancos <= 0) {
        try {
            const [accRows] = await db.query(`
                SELECT COALESCE(SUM(saldo_inicial), 0) as saldo_base
                FROM cuentas_bancarias
                WHERE activa = 1
            `);
            saldoInicialBancos = Number(accRows[0]?.saldo_base || 85000);
        } catch (e) {
            saldoInicialBancos = 85000;
        }
    }

    // 2. Calcular promedio diario de ventas de combustible (turnos cerrados) y tienda de los últimos 30 días
    let promedioVentaDiariaCombustible = 0;
    let promedioVentaDiariaTiendas = 0;
    try {
        // Ventas de combustible en turnos cerrados de los últimos 30 días
        const [ventasRows] = await withRetry(() => accountingDb.query(`
            SELECT COALESCE(SUM(r.monto), 0.0) as total_venta_30d
            FROM gas_station_closeouts c
            JOIN gas_station_closeout_readings r ON c.id = r.closeout_id
            WHERE c.estado = 'cerrado' AND c.fecha_turno >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        `));
        const totalVenta30d = Number(ventasRows[0]?.total_venta_30d || 0);
        promedioVentaDiariaCombustible = totalVenta30d > 0 ? (totalVenta30d / 30) : 28000;

        // Ventas de tiendas / mostrador en los últimos 30 días
        const [tiendasRows] = await withRetry(() => accountingDb.query(`
            SELECT COALESCE(SUM(total_pagar), 0.0) as total_tienda_30d
            FROM sales_headers
            WHERE estado = 'emitido' AND fecha_emision >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        `));
        const totalTienda30d = Number(tiendasRows[0]?.total_tienda_30d || 0);
        promedioVentaDiariaTiendas = totalTienda30d > 0 ? (totalTienda30d / 30) : 3500;
    } catch (err) {
        console.warn('Error calculando promedio de ventas 30d:', err.message);
        promedioVentaDiariaCombustible = 28000;
        promedioVentaDiariaTiendas = 3500;
    }

    // 3. Obtener Préstamos Bancarios activos y programar sus fechas de pago
    let prestamosActivos = [];
    try {
        const [pRows] = await db.query(`
            SELECT id, numero_prestamo, descripcion, cuota_total, cuota_calculada,
                   frecuencia_pago, fecha_primer_pago,
                   COALESCE(DAY(fecha_primer_pago), 15) as dia_pago
            FROM prestamos
            WHERE estado = 'activo'
        `);
        prestamosActivos = pRows;
    } catch (err) {
        console.warn('Error al cargar préstamos:', err.message);
    }

    // 4. Obtener compromisos y quedans de proveedores pendientes en la ventana de proyección
    const fechaFinHorizonte = new Date(today);
    fechaFinHorizonte.setDate(fechaFinHorizonte.getDate() + horizon);
    const fechaFinHorizonteStr = fechaFinHorizonte.toISOString().split('T')[0];

    let recordatoriosPendientes = [];
    try {
        const [recRows] = await withRetry(() => accountingDb.query(`
            SELECT fecha_vencimiento as fecha_vence, CONCAT('Quedan #', num_quedan) as descripcion, total as monto
            FROM purchase_quedans
            WHERE fecha_vencimiento BETWEEN ? AND ?
              AND status IN ('PENDING', 'SOLICITADO')
        `, [todayStr, fechaFinHorizonteStr]));
        recordatoriosPendientes = recRows;
    } catch (err) {
        console.warn('Error al cargar purchase_quedans:', err.message);
    }

    // 5. Mantenimientos programados en la ventana (SIPE local) y facturas pendientes de Puma (portal_pedidos)
    let mantenimientosProgramados = [];
    let compromisosPumaPendientesUsd = 0;
    try {
        const [mRows] = await db.query(`
            SELECT fecha_programada, nombre AS nombre_activo, costo_estimado
            FROM finanzas_planes_mantenimiento
            WHERE fecha_programada BETWEEN ? AND ?
              AND estado IN ('programado', 'pendiente')
        `, [todayStr, fechaFinHorizonteStr]);
        mantenimientosProgramados = mRows;
    } catch (err) {
        console.warn('Error al cargar mantenimientos:', err.message);
    }

    try {
        const [pumaRows] = await db.query(`
            SELECT
                COALESCE(factura_fecha_vencimiento, fecha_solicitada, DATE(fecha_pedido)) as fecha_vence,
                CONCAT('Pedido Puma #', numero_orden) as descripcion,
                CASE WHEN factura_saldo_pendiente > 0 THEN factura_saldo_pendiente ELSE (monto_total - COALESCE(monto_pagado, 0)) END as monto
            FROM portal_pedidos
            WHERE estado_pago IN ('PENDIENTE', 'PARCIAL')
              AND UPPER(estado) IN ('FACTURADO', 'LIBERADO')
              AND COALESCE(factura_fecha_vencimiento, fecha_solicitada, DATE(fecha_pedido)) BETWEEN ? AND ?
        `, [todayStr, fechaFinHorizonteStr]);
        (pumaRows || []).forEach(pr => {
            const m = Number(pr.monto || 0);
            if (m > 0) {
                compromisosPumaPendientesUsd += m;
                recordatoriosPendientes.push({
                    fecha_vence: pr.fecha_vence,
                    descripcion: pr.descripcion,
                    monto: m
                });
            }
        });
    } catch (_errPuma) {
        // Fallback limpio si portal_pedidos no tiene facturas pendientes
    }

    // 5b. Control de Pagos (web_rc_recordatorios_vencimientos): incorporar saldo pendiente real (descontando abonos parciales)
    //     separando CXP/GASTO (egresos) y CXC (ingresos)
    const recordatoriosCxcPendientes = [];
    let compromisosControlPagosCxpUsd = 0;
    let compromisosControlPagosCxcUsd = 0;
    try {
        const externalDb = await Promise.resolve(getExternalDb()).catch(() => null);
        if (externalDb && typeof externalDb.query === 'function') {
            const [cpRows] = await externalDb.query(`
                SELECT a.id AS vencimiento_id, a.vencimiento AS fecha_vence,
                       b.descripcion, b.monto, COALESCE(c.descripcion, '') AS ubicacion
                FROM web_rc_recordatorios_vencimientos a
                INNER JOIN web_rc_recordatorios b ON a.id_recordatorio = b.id
                LEFT JOIN web_rc_ubicaciones c ON b.id_ubicacion = c.id
                WHERE b.activo = 1
                  AND a.estado = 'P'
                  AND a.vencimiento BETWEEN ? AND ?
            `, [todayStr, fechaFinHorizonteStr]);

            if (Array.isArray(cpRows) && cpRows.length > 0) {
                const venIds = cpRows.map(r => Number(r.vencimiento_id)).filter(Boolean);
                const abonosMap = new Map();
                const metaMap = new Map();
                if (venIds.length > 0) {
                    const ph = venIds.map(() => '?').join(',');
                    try {
                        const [abRows] = await db.query(
                            `SELECT vencimiento_id, COALESCE(SUM(monto), 0) AS pagado, MAX(tipo_operacion) AS tipo_op
                             FROM recordatorios_pagos_abonos
                             WHERE vencimiento_id IN (${ph})
                             GROUP BY vencimiento_id`,
                            venIds
                        );
                        (abRows || []).forEach(r => abonosMap.set(Number(r.vencimiento_id), { pagado: Number(r.pagado || 0), tipo_op: r.tipo_op }));
                    } catch (_eAb) { /* tabla opcional si aún no existe */ }
                    try {
                        const [mRows] = await db.query(
                            `SELECT vencimiento_id, tipo_operacion FROM recordatorios_vencimientos_meta WHERE vencimiento_id IN (${ph})`,
                            venIds
                        );
                        (mRows || []).forEach(r => metaMap.set(Number(r.vencimiento_id), r.tipo_operacion));
                    } catch (_eMeta) { /* tabla opcional si aún no existe */ }
                }

                for (const row of cpRows) {
                    const vid = Number(row.vencimiento_id);
                    const total = Number(row.monto || 0);
                    const abInfo = abonosMap.get(vid);
                    const pagado = abInfo ? abInfo.pagado : 0;
                    const saldoPendiente = Math.round(Math.max(0, total - pagado) * 100) / 100;
                    if (saldoPendiente <= 0) continue;

                    const tipoOp = metaMap.get(vid) || abInfo?.tipo_op || 'CXP';
                    const partialTag = pagado > 0 ? ` [Parcial · resta $${saldoPendiente.toFixed(2)}]` : '';
                    const descLabel = `${row.descripcion || 'Pago programado'}${row.ubicacion ? ` (${row.ubicacion})` : ''}${partialTag}`;

                    if (tipoOp === 'CXC') {
                        compromisosControlPagosCxcUsd += saldoPendiente;
                        recordatoriosCxcPendientes.push({
                            fecha_vence: row.fecha_vence,
                            descripcion: descLabel,
                            monto: saldoPendiente
                        });
                    } else {
                        compromisosControlPagosCxpUsd += saldoPendiente;
                        recordatoriosPendientes.push({
                            fecha_vence: row.fecha_vence,
                            descripcion: descLabel,
                            monto: saldoPendiente
                        });
                    }
                }
            }
        }
    } catch (_errCp) {
        // Fallback limpio si externalDb no está disponible
    }

    // 6. Nómina quincenal real calculada desde rh_planillas
    let nominaQuincenalEstimada = 18000;
    try {
        const [payrollRows] = await withRetry(() => accountingDb.query(`
            SELECT AVG(total_quincena) as prom_nomina
            FROM (
                SELECT periodo_anio, periodo_mes, quincena, SUM(monto_recibir) as total_quincena
                FROM rh_planillas
                GROUP BY periodo_anio, periodo_mes, quincena
                ORDER BY periodo_anio DESC, periodo_mes DESC, quincena DESC
                LIMIT 4
            ) t
        `));
        if (payrollRows && payrollRows[0]?.prom_nomina && Number(payrollRows[0].prom_nomina) > 0) {
            nominaQuincenalEstimada = Number(payrollRows[0].prom_nomina);
        }
    } catch (err) {
        // Fallback estándar
    }

    // 7. Costo diario de compra de combustible (85% a 88% del valor de venta)
    const costoDiarioCombustible = promedioVentaDiariaCombustible * 0.88;

    // 8. Construcción de la línea de tiempo día a día
    const timeline = [];
    let saldoAcumulado = saldoInicialBancos;
    let saldoMinimoProyectado = saldoInicialBancos;
    let fechaSaldoMinimo = todayStr;
    const brechasDeLiquidez = [];

    const fondoReservaSeguridad = 15000;

    for (let i = 1; i <= horizon; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dayStr = `${yyyy}-${mm}-${dd}`;
        const diaDelMes = d.getDate();
        const diaSemana = d.getDay();

        // Moduladores por día de semana
        let factorVenta = 1.0;
        if (diaSemana === 5 || diaSemana === 6) factorVenta = 1.15;
        if (diaSemana === 0) factorVenta = 1.05;
        if (diaSemana === 1) factorVenta = 0.90;

        // Ingresos del día (ventas + Cuentas por Cobrar programadas en Control de Pagos)
        const ingresoCombustible = promedioVentaDiariaCombustible * factorVenta;
        const ingresoTienda = promedioVentaDiariaTiendas * factorVenta;
        let ingresoCxcRecordatorios = 0;
        recordatoriosCxcPendientes.forEach(r => {
            let rFecha = r.fecha_vence;
            if (rFecha instanceof Date) rFecha = rFecha.toISOString().split('T')[0];
            if (rFecha === dayStr) {
                ingresoCxcRecordatorios += Number(r.monto || 0);
            }
        });
        const totalIngresosDia = ingresoCombustible + ingresoTienda + ingresoCxcRecordatorios;

        // Egresos del día
        let egresoCombustible = 0;
        if (diaSemana !== 0) {
            egresoCombustible = (costoDiarioCombustible * 7) / 6;
        }

        // Cuotas de préstamos bancarios vencidas este día
        let egresoPrestamos = 0;
        const prestamosDetalle = [];
        prestamosActivos.forEach(p => {
            const fechaPrimerPago = p.fecha_primer_pago ? new Date(p.fecha_primer_pago) : null;
            const diaVencePrestamo = p.dia_pago || (fechaPrimerPago ? fechaPrimerPago.getDate() : 15);
            if (diaDelMes === diaVencePrestamo) {
                const cuota = Number(p.cuota_total || p.cuota_calculada || 0);
                egresoPrestamos += cuota;
                prestamosDetalle.push({
                    numero: p.numero_prestamo,
                    descripcion: p.descripcion,
                    monto: cuota
                });
            }
        });

        // Recordatorios de servicios y quedans programados este día
        let egresoRecordatorios = 0;
        const recordatoriosDetalle = [];
        recordatoriosPendientes.forEach(r => {
            let rFecha = r.fecha_vence;
            if (rFecha instanceof Date) rFecha = rFecha.toISOString().split('T')[0];
            if (rFecha === dayStr) {
                const m = Number(r.monto || 0);
                egresoRecordatorios += m;
                recordatoriosDetalle.push({
                    descripcion: r.descripcion,
                    monto: m
                });
            }
        });

        // Mantenimientos
        let egresoMantenimientos = 0;
        mantenimientosProgramados.forEach(m => {
            let mFecha = m.fecha_programada;
            if (mFecha instanceof Date) mFecha = mFecha.toISOString().split('T')[0];
            if (mFecha === dayStr) {
                const c = Number(m.costo_estimado || 0);
                egresoMantenimientos += c;
            }
        });

        // Nómina: Se paga el 15 y el último día del mes
        let egresoNomina = 0;
        const ultimoDiaMes = new Date(yyyy, d.getMonth() + 1, 0).getDate();
        if (diaDelMes === 15 || diaDelMes === ultimoDiaMes) {
            egresoNomina = nominaQuincenalEstimada;
        }

        const totalEgresosDia = egresoCombustible + egresoPrestamos + egresoRecordatorios + egresoMantenimientos + egresoNomina;

        // Actualizar saldo acumulado
        saldoAcumulado = saldoAcumulado + totalIngresosDia - totalEgresosDia;

        if (saldoAcumulado < saldoMinimoProyectado) {
            saldoMinimoProyectado = saldoAcumulado;
            fechaSaldoMinimo = dayStr;
        }

        // Evaluar brecha de liquidez
        let estadoDia = 'optimo';
        if (saldoAcumulado < 0) {
            estadoDia = 'deficit';
            brechasDeLiquidez.push({
                fecha: dayStr,
                saldo_proyectado: Math.round(saldoAcumulado),
                deficit: Math.round(Math.abs(saldoAcumulado)),
                causa_principal: egresoNomina > 0 ? 'Pago de Planilla Quincenal' : (egresoPrestamos > 0 ? 'Vencimiento de Cuotas Bancarias' : 'Compras de Cisternas de Combustible')
            });
        } else if (saldoAcumulado < fondoReservaSeguridad) {
            estadoDia = 'reserva_baja';
        }

        timeline.push({
            dia_indice: i,
            fecha: dayStr,
            dia_semana: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][diaSemana],
            saldo_inicial: Math.round(saldoAcumulado - totalIngresosDia + totalEgresosDia),
            ingresos: {
                total: Math.round(totalIngresosDia),
                combustible: Math.round(ingresoCombustible),
                tienda: Math.round(ingresoTienda),
                cxc_recordatorios: Math.round(ingresoCxcRecordatorios)
            },
            egresos: {
                total: Math.round(totalEgresosDia),
                combustible: Math.round(egresoCombustible),
                prestamos: Math.round(egresoPrestamos),
                recordatorios: Math.round(egresoRecordatorios),
                mantenimiento: Math.round(egresoMantenimientos),
                nomina: Math.round(egresoNomina),
                detalles_prestamos: prestamosDetalle,
                detalles_recordatorios: recordatoriosDetalle
            },
            flujo_neto_dia: Math.round(totalIngresosDia - totalEgresosDia),
            saldo_final_proyectado: Math.round(saldoAcumulado),
            estado: estadoDia
        });
    }

    // 9. Recomendaciones directivas de remediación de liquidez
    const recomendaciones = [];
    if (brechasDeLiquidez.length > 0) {
        const primerDeficit = brechasDeLiquidez[0];
        const formatDMY = (dStr) => {
            if (!dStr) return '';
            const parts = String(dStr).split('T')[0].split('-');
            if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
            return dStr;
        };
        recomendaciones.push({
            tipo: 'alerta_critica',
            titulo: `Déficit de caja proyectado a partir del ${formatDMY(primerDeficit.fecha)}`,
            detalle: `Se anticipa un faltante de -$${primerDeficit.deficit.toLocaleString()} USD ocasionado por ${primerDeficit.causa_principal}.`,
            accion_sugerida: 'Coordinar anticipos de cobro de vales corporativos o utilizar línea de crédito de capital de trabajo.'
        });
    } else {
        recomendaciones.push({
            tipo: 'positiva',
            titulo: 'Flujo de caja solvente durante todo el período',
            detalle: `El saldo mínimo proyectado se mantendrá en $${Math.round(saldoMinimoProyectado).toLocaleString()} USD, superando la reserva de contingencia.`,
            accion_sugerida: 'Oportunidad de realizar amortizaciones extraordinarias a préstamos con mayor tasa de interés.'
        });
    }

    return {
        horizonte_dias: horizon,
        fecha_generacion: todayStr,
        kpi: {
            saldo_inicial_bancos: Math.round(saldoInicialBancos),
            saldo_minimo_proyectado: Math.round(saldoMinimoProyectado),
            fecha_saldo_minimo: fechaSaldoMinimo,
            total_ingresos_proyectados: Math.round(timeline.reduce((s, d) => s + d.ingresos.total, 0)),
            total_egresos_proyectados: Math.round(timeline.reduce((s, d) => s + d.egresos.total, 0)),
            compromisos_puma_pendientes_usd: Math.round(compromisosPumaPendientesUsd),
            compromisos_control_pagos_cxp_usd: Math.round(compromisosControlPagosCxpUsd),
            compromisos_control_pagos_cxc_usd: Math.round(compromisosControlPagosCxcUsd),
            dias_con_deficit: brechasDeLiquidez.length,
            salud_flujo: brechasDeLiquidez.length === 0 ? 'SALUDABLE' : (saldoMinimoProyectado < 0 ? 'CRÍTICO' : 'PRECAUCIÓN')
        },
        brechas_liquidez: brechasDeLiquidez.slice(0, 5),
        recomendaciones,
        timeline
    };
};

module.exports = {
    getFlujoCajaProyectado
};
