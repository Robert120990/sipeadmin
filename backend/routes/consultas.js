const express = require('express');
const router = express.Router();
const dbModule = require('../db');
const getDb = (...args) => dbModule.getDb(...args);
const getExternalDb = (...args) => dbModule.getExternalDb(...args);
const getAccountingDb = (...args) => dbModule.getAccountingDb(...args);
const withRetry = (...args) => dbModule.withRetry(...args);
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { getElSalvadorTodayYMD } = require('../utils/dateSv');
const {
    ventasViewPerms,
    fletesViewPerms,
    lubricantesViewPerms,
    preciosEstacionViewPerms,
    cumpleanosViewPerms,
    diferenciasViewPerms,
    genericConsultasPerms,
    getCleanStationName,
    getCleanTiendaName,
    saasBranchMap,
    branchToEmpId,
    normalizeSaasBranchId,
    OFFICIAL_ESTACIONES,
    isGenericDescription,
    formatYMD,
    computeSaasStoreShiftMetrics
} = require('../services/consultasCatalog');
const {
    normalizeStationName,
    getResumenMensualData,
    getResumenRangoVentasData,
    getComparativoAnualData
} = require('../services/consultasVentasResumenService');
const { registerConsultasCierresRoutes } = require('./consultasCierresRoutes');
const { registerConsultasCompetenciaRoutes } = require('./consultasCompetenciaRoutes');
const {
    round2,
    parseStrictDBDate,
    computeAccountReconciliationSummary,
    classifyCheckAging,
    summarizeChecksAging
} = require('../services/bancosIntegrityService');

/**
 * Motor heurístico experto para análisis forense y diagnóstico automático de descuadres de cierre de pista.
 */
const generarAnalisisDescuadre = ({
    estacion,
    fecha,
    totVenta = 0,
    noEfectivo = 0,
    efectivoEsperado = 0,
    efectivoDescargado = 0,
    desgloseDescargos = {},
    diferencia = 0,
    turnos = []
}) => {
    const dif = Math.round(Number(diferencia || 0) * 100) / 100;
    const absDif = Math.abs(dif);
    const isCuadrado = absDif <= 0.05;
    const isFaltante = dif < -0.05;
    const isSobrante = dif > 0.05;

    // 1. Severidad y Nivel de Riesgo
    let severidad = 'cuadrado';
    let nivelRiesgo = 'ok';
    let etiquetaSeveridad = 'Cuadrado';

    if (isFaltante) {
        if (absDif >= 1000) {
            severidad = 'critica';
            nivelRiesgo = 'danger';
            etiquetaSeveridad = `Faltante Crítico (-$${absDif.toFixed(2)})`;
        } else if (absDif >= 300) {
            severidad = 'alta';
            nivelRiesgo = 'warning';
            etiquetaSeveridad = `Faltante Alto (-$${absDif.toFixed(2)})`;
        } else if (absDif >= 50) {
            severidad = 'media';
            nivelRiesgo = 'warning';
            etiquetaSeveridad = `Faltante Moderado (-$${absDif.toFixed(2)})`;
        } else {
            severidad = 'baja';
            nivelRiesgo = 'info';
            etiquetaSeveridad = `Faltante Menor (-$${absDif.toFixed(2)})`;
        }
    } else if (isSobrante) {
        if (absDif >= 1000) {
            severidad = 'critica';
            nivelRiesgo = 'warning';
            etiquetaSeveridad = `Sobrante Atípico (+$${absDif.toFixed(2)})`;
        } else if (absDif >= 300) {
            severidad = 'alta';
            nivelRiesgo = 'warning';
            etiquetaSeveridad = `Sobrante Significativo (+$${absDif.toFixed(2)})`;
        } else {
            severidad = 'media';
            nivelRiesgo = 'info';
            etiquetaSeveridad = `Sobrante Menor (+$${absDif.toFixed(2)})`;
        }
    }

    // 2. Diagnóstico Conciso
    let diagnosticoPrincipal = '';
    const remesasTot = Number(desgloseDescargos.remesas || 0);
    const gastosPagosTot = Number(desgloseDescargos.gastos || 0) + Number(desgloseDescargos.pagos || 0) + Number(desgloseDescargos.descuentos || 0) + Number(desgloseDescargos.anticipos || 0);

    if (isCuadrado) {
        diagnosticoPrincipal = `Cierre de pista cuadrado al centavo. Todo el efectivo cobrado en pista ($${efectivoEsperado.toFixed(2)}) coincide exactamente con las remesas bancarias y descargos autorizados.`;
    } else if (isFaltante) {
        diagnosticoPrincipal = `Se identificó un faltante de -$${absDif.toFixed(2)} en la liquidación de efectivo. De $${efectivoEsperado.toFixed(2)} que ingresaron en efectivo tras descontar tarjetas y créditos sobre la venta de $${totVenta.toFixed(2)}, únicamente se justificaron $${remesasTot.toFixed(2)} en remesas bancarias y $${gastosPagosTot.toFixed(2)} en gastos/pagos. Faltan $${absDif.toFixed(2)} por ingresar al banco o justificar formalmente.`;
    } else {
        diagnosticoPrincipal = `Se reportó un excedente de +$${absDif.toFixed(2)} en la liquidación de pista. Los descargos reportados ($${efectivoDescargado.toFixed(2)}) superan el efectivo esperado por ventas ($${efectivoEsperado.toFixed(2)}), sugiriendo remesas de turnos previos o ingresos no registrados en las lecturas de mangueras.`;
    }

    // 3. Concentración por Turno y Responsable
    let focoTurno = null;
    let turnosAnalisis = [];
    if (turnos && turnos.length > 0) {
        turnosAnalisis = turnos.map(t => {
            const tDif = Math.round(Number(t.diferencia || 0) * 100) / 100;
            const pct = absDif > 0 ? Math.min(100, Math.round((Math.abs(tDif) / absDif) * 100)) : 0;
            return {
                ...t,
                diferencia: tDif,
                porcentaje_impacto: pct
            };
        }).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));

        const principal = turnosAnalisis[0];
        if (principal && Math.abs(principal.diferencia) > 0.05) {
            const pctConcentracion = absDif > 0 ? ((Math.abs(principal.diferencia) / absDif) * 100).toFixed(1) : '100';
            focoTurno = {
                turno: principal.turno,
                id_cierre: principal.id,
                responsable: principal.responsable || 'Sin asignar',
                diferencia: principal.diferencia,
                porcentaje: `${pctConcentracion}%`,
                texto: `El ${pctConcentracion}% del descuadre ($${Math.abs(principal.diferencia).toFixed(2)}) se concentró en el Turno ${principal.turno} a cargo de ${principal.responsable || 'Sin asignar'}.`
            };
        }
    }

    // 4. Hipótesis Operativas y Causas Probables
    const hipotesis = [];
    if (isFaltante) {
        if (absDif >= 1000) {
            hipotesis.push({
                titulo: 'Remesa física no asentada o en caja fuerte',
                probabilidad: 'Alta',
                descripcion: `Un faltante de $${absDif.toFixed(2)} equivale al monto típico de un depósito completo. Es altamente probable que el depósito ya se haya preparado o entregado al camión de valores/banco pero la boleta aún no ha sido digitada en el sistema.`,
                icono: 'banknote'
            });
        }
        if (turnos && turnos.some(t => t.turno >= 2 && Math.abs(t.diferencia) > 400)) {
            hipotesis.push({
                titulo: 'Desfase bancario de turno nocturno / fin de semana',
                probabilidad: 'Media-Alta',
                descripcion: 'Los depósitos del segundo o tercer turno suelen realizarse en buzón nocturno o procesarse con fecha del siguiente día contable.',
                icono: 'clock'
            });
        }
        if ((desgloseDescargos.gastos || 0) < 50 && absDif > 200) {
            hipotesis.push({
                titulo: 'Comprobantes de gastos operativos pendientes de entrega',
                probabilidad: 'Media',
                descripcion: 'Compras locales de pista, calibraciones o pagos menores hechos en efectivo que el encargado no ha reportado ni anexado al cierre.',
                icono: 'receipt'
            });
        }
        hipotesis.push({
            titulo: 'Faltante real en arqueo de cajero/bombero',
            probabilidad: absDif < 300 ? 'Alta' : 'Media',
            descripcion: focoTurno
                ? `Descuadre directo en gaveta a cargo de ${focoTurno.responsable} en Turno ${focoTurno.turno}. Requiere confrontación inmediata del arqueo físico.`
                : 'Posible error de cobro, falta de entrega de efectivo o dinero retenido por bomberos de pista.',
            icono: 'alert-triangle'
        });
    } else if (isSobrante) {
        hipotesis.push({
            titulo: 'Remesa de turno anterior aplicada al día actual',
            probabilidad: 'Alta',
            descripcion: `Se incluyó un depósito de $${absDif.toFixed(2)} que físicamente correspondía a ventas de días anteriores.`,
            icono: 'banknote'
        });
        hipotesis.push({
            titulo: 'Abono o recuperación de cartera no identificado',
            probabilidad: 'Media',
            descripcion: 'Ingreso recibido en gaveta por cobro de crédito o vales que no se registró en su rubro correspondiente.',
            icono: 'dollar-sign'
        });
    } else {
        hipotesis.push({
            titulo: 'Liquidación en perfecto equilibrio',
            probabilidad: 'Confirmada',
            descripcion: 'Todas las mangueras, cobros electrónicos y depósitos bancarios están 100% justificados y conciliados.',
            icono: 'check-circle'
        });
    }

    // 5. Checklist de Auditoría
    const checklist = [];
    if (isFaltante) {
        checklist.push({
            paso: 1,
            accion: `Verificar caja fuerte de ${estacion}`,
            detalle: 'Revisar físicamente si existen bolsas de remesa, sobres con efectivo o cheques resguardados en bóveda.'
        });
        checklist.push({
            paso: 2,
            accion: 'Cotejar boletas de remesa bancaria',
            detalle: 'Solicitar al encargado copia o foto de las boletas de depósito o recibo del camión blindado.'
        });
        if (focoTurno) {
            checklist.push({
                paso: 3,
                accion: `Entrevistar a ${focoTurno.responsable} (Turno ${focoTurno.turno})`,
                detalle: `El Turno ${focoTurno.turno} concentra $${Math.abs(focoTurno.diferencia).toFixed(2)} del faltante. Solicitar liquidación detallada.`
            });
        }
        checklist.push({
            paso: 4,
            accion: 'Revisar vouchers de tarjetas POS duplicados o pendientes',
            detalle: 'Comprobar que todas las transacciones electrónicas de las terminales bancarias hayan sido digitadas como tarjetas y no como efectivo.'
        });
        checklist.push({
            paso: 5,
            accion: 'Inspeccionar estado de cuenta bancario al día siguiente',
            detalle: 'Verificar si el dinero ingresó a la cuenta bancaria en la fecha valor posterior.'
        });
    } else if (isSobrante) {
        checklist.push({
            paso: 1,
            accion: 'Validar fechas de las boletas de remesa',
            detalle: 'Revisar si alguna boleta tiene fecha anterior a este cierre.'
        });
        checklist.push({
            paso: 2,
            accion: 'Auditar totalizador de lecturas de mangueras',
            detalle: 'Verificar si alguna lectura inicial/final fue registrada con error en galonaje o monto.'
        });
    }

    // 6. Mensaje Redactado para WhatsApp / Encargado
    const formatoMoneda = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
    const mensajeWhatsApp = [
        `🚨 *AUDITORÍA SIPE: DESCUADRE DE CIERRE*`,
        `⛽ *Estación:* ${estacion}`,
        `📅 *Fecha de Turno:* ${fecha}`,
        ``,
        `⚠️ *Estado:* ${etiquetaSeveridad}`,
        `💵 *Diferencia Neta:* ${formatoMoneda(dif)}`,
        `📊 *Venta Total:* ${formatoMoneda(totVenta)} (Combustible + Lubricantes)`,
        `💳 *Cobros No Efectivo:* -${formatoMoneda(noEfectivo)} (Tarjetas/Créditos/Vales)`,
        `💰 *Efectivo Esperado:* ${formatoMoneda(efectivoEsperado)}`,
        `🏦 *Remesas al Banco:* -${formatoMoneda(remesasTot)}`,
        `🧾 *Gastos/Pagos:* -${formatoMoneda(gastosPagosTot)}`,
        ``,
        focoTurno ? `🎯 *Foco Principal:* Turno ${focoTurno.turno} (${focoTurno.responsable}) -> Dif: ${formatoMoneda(focoTurno.diferencia)} (${focoTurno.porcentaje} del total)` : null,
        ``,
        `📋 *Acciones Requeridas:*`,
        isFaltante ? `1. Arqueo físico en caja fuerte de estación.\n2. Enviar fotos de boletas de depósito bancario.\n3. Descargo firmado por ${focoTurno?.responsable || 'el encargado'}.` : `1. Verificar fechas de boletas y lecturas de mangueras.`,
        ``,
        `_Generado automáticamente por SIPE Admin_`
    ].filter(Boolean).join('\n');

    return {
        severidad,
        nivel_riesgo: nivelRiesgo,
        etiqueta_severidad: etiquetaSeveridad,
        diagnostico_principal: diagnosticoPrincipal,
        foco_turno: focoTurno,
        hipotesis_probables: hipotesis,
        checklist_auditoria: checklist,
        mensaje_whatsapp: mensajeWhatsApp,
        turnos_analisis: turnosAnalisis
    };
};

/**
 * Consulta y agrupa los turnos individuales de pista de todas las estaciones para una fecha.
 */
const getTurnosPorEmpresa = async (externalDb, sysDate, accountingDb = null, dateIso = null) => {
    const turnosPorEmpresa = {};
    if (accountingDb && dateIso) {
        try {
            const sqlTurnosSaas = `
                SELECT 
                    c.id,
                    c.branch_id,
                    c.numero_turno as turno,
                    c.seller_name as responsable,
                    (SELECT IFNULL(SUM(r.monto), 0.0) FROM gas_station_closeout_readings r WHERE r.closeout_id = c.id) as venta,
                    (SELECT IFNULL(SUM(rem.monto), 0.0) FROM gas_station_closeout_remesas rem WHERE rem.closeout_id = c.id) as remesas,
                    (SELECT IFNULL(SUM(tar.monto), 0.0) FROM gas_station_closeout_tarjetas tar WHERE tar.closeout_id = c.id) as tarjetas,
                    (SELECT IFNULL(SUM(g.valor), 0.0) FROM gas_station_closeout_expenses g WHERE g.closeout_id = c.id) as gastos,
                    (SELECT IFNULL(SUM(d.total), 0.0) FROM gas_station_closeout_descuentos d WHERE d.closeout_id = c.id) as descuentos,
                    (SELECT IFNULL(SUM(cp.monto), 0.0) FROM gas_station_closeout_cupones cp WHERE cp.closeout_id = c.id) as cupones,
                    (SELECT IFNULL(SUM(cr.monto), 0.0) FROM gas_station_closeout_creditos cr WHERE cr.closeout_id = c.id) as creditos,
                    (SELECT IFNULL(SUM(ch.monto), 0.0) FROM gas_station_closeout_cheques ch WHERE ch.closeout_id = c.id) as cheques,
                    (SELECT IFNULL(SUM(vl.monto), 0.0) FROM gas_station_closeout_vales vl WHERE vl.closeout_id = c.id) as vales,
                    (SELECT IFNULL(SUM(ad.monto), 0.0) FROM gas_station_closeout_adelantos ad WHERE ad.closeout_id = c.id) as anticipos,
                    (SELECT IFNULL(SUM(ant.monto), 0.0) FROM gas_station_closeout_anticipos_despachados ant WHERE ant.closeout_id = c.id) as anticipos_despachados,
                    (SELECT IFNULL(SUM(tr.monto), 0.0) FROM gas_station_closeout_trupput_despachos tr WHERE tr.closeout_id = c.id) as trupput,
                    (SELECT IFNULL(SUM(l.total), 0.0) FROM gas_station_closeout_lubricant_readings l WHERE l.closeout_id = c.id) as lubricantes
                FROM gas_station_closeouts c
                WHERE c.fecha_turno = ? AND c.estado = 'cerrado'
                ORDER BY c.branch_id, c.numero_turno
            `;
            const [shiftRows] = await withRetry(() => accountingDb.query(sqlTurnosSaas, [dateIso]));
            if (shiftRows && shiftRows.length > 0) {
                const r2 = (v) => (Math.round(Number(v || 0) * 100) / 100) || 0;
                shiftRows.forEach(sh => {
                    const normBranch = normalizeSaasBranchId(sh.branch_id);
                    const empId = branchToEmpId[normBranch] || branchToEmpId[sh.branch_id] || String(sh.branch_id).padStart(3, '0');
                    if (!turnosPorEmpresa[empId]) turnosPorEmpresa[empId] = [];
                    const lub = r2(sh.lubricantes);
                    const vtaComb = r2(sh.venta);
                    const vta = r2(vtaComb + lub);
                    const rem = r2(sh.remesas);
                    const tarj = r2(sh.tarjetas);
                    const gst = r2(sh.gastos);
                    const pag = 0;
                    const desc = r2(sh.descuentos);
                    const cup = r2(sh.cupones);
                    const cred = r2(sh.creditos);
                    const chq = r2(sh.cheques);
                    const val = r2(sh.vales);
                    const ant = r2(sh.anticipos);
                    const antDesp = r2(sh.anticipos_despachados);
                    const trup = r2(sh.trupput);
                    const sumaTurno = r2(rem + tarj + gst + pag + desc + cup + cred + chq + val + ant + antDesp + trup);
                    const difTurno = r2(sumaTurno - vta);

                    turnosPorEmpresa[empId].push({
                        id: sh.id,
                        turno: Number(sh.turno) || 1,
                        responsable: sh.responsable || 'Sin asignar',
                        venta: vta,
                        lubricantes: lub,
                        remesas: rem,
                        tarjetas: tarj,
                        gastos: gst,
                        pagos: pag,
                        descuentos: desc,
                        cupones: cup,
                        creditos: cred,
                        cheques: chq,
                        vales: val,
                        anticipos: ant,
                        anticipos_despachados: antDesp,
                        trupput: trup,
                        suma: sumaTurno,
                        diferencia: difTurno
                    });
                });
                return turnosPorEmpresa;
            }
        } catch (turnosErr) {
            console.warn('[Consolidado Ventas SaaS] Error consultando turnos SaaS:', turnosErr.message);
        }
    }

    if (!externalDb) return turnosPorEmpresa;

    try {
        const sqlTurnos = `
            SELECT c.id, c.id_empresa, c.turno, c.responsable,
                   IFNULL(SUM(l.monto), 0.0) as venta,
                   (SELECT IFNULL(SUM(r.efectivo + r.monedas + r.transferencia), 0.0) FROM cierre_turno_remesa r WHERE r.id_cierre_turno = c.id AND r.id_empresa = c.id_empresa) as remesas,
                   (SELECT IFNULL(SUM(t.valor), 0.0) FROM cierre_turno_tarjeta t WHERE t.id_cierre_turno = c.id AND t.id_empresa = c.id_empresa) as tarjetas,
                   (SELECT IFNULL(SUM(g.valor), 0.0) FROM cierre_turno_gastos g WHERE g.id_cierre_turno = c.id AND g.id_empresa = c.id_empresa) as gastos,
                   (SELECT IFNULL(SUM(p.valor), 0.0) FROM cierre_turno_pagos p WHERE p.id_cierre_turno = c.id AND p.id_empresa = c.id_empresa) as pagos,
                   (SELECT IFNULL(SUM(d.valor * d.cantidad), 0.0) FROM cierre_turno_descuentos d WHERE d.id_cierre_turno = c.id AND d.id_empresa = c.id_empresa) as descuentos,
                   (SELECT IFNULL(SUM(cp.valor), 0.0) FROM cierre_turno_cupones cp WHERE cp.id_cierre_turno = c.id AND cp.id_empresa = c.id_empresa) as cupones,
                   (SELECT IFNULL(SUM(cr.total_descuento), 0.0) FROM cierre_turno_credito cr WHERE cr.id_cierre_turno = c.id AND cr.id_empresa = c.id_empresa) as creditos,
                   (SELECT IFNULL(SUM(ch.valor), 0.0) FROM cierre_turno_cheques ch WHERE ch.id_cierre_turno = c.id AND ch.id_empresa = c.id_empresa) as cheques,
                   (SELECT IFNULL(SUM(a.valor), 0.0) FROM cierre_turno_anticipos a WHERE a.id_cierre_turno = c.id AND a.id_empresa = c.id_empresa) as anticipos
            FROM cierre_turno c
            LEFT JOIN cierre_turno_lecturas l ON c.id = l.id_cierre_turno AND c.id_empresa = l.id_empresa
            WHERE c.fecha_turno = ?
            GROUP BY c.id, c.id_empresa, c.turno, c.responsable
            ORDER BY c.id_empresa, c.turno
        `;
        const [shiftRows] = await withRetry(() => externalDb.query(sqlTurnos, [sysDate]));
        (shiftRows || []).forEach(sh => {
            const empId = String(sh.id_empresa);
            if (!turnosPorEmpresa[empId]) turnosPorEmpresa[empId] = [];
            const vta = Math.round(Number(sh.venta || 0) * 100) / 100;
            const rem = Math.round(Number(sh.remesas || 0) * 100) / 100;
            const tarj = Math.round(Number(sh.tarjetas || 0) * 100) / 100;
            const gst = Math.round(Number(sh.gastos || 0) * 100) / 100;
            const pag = Math.round(Number(sh.pagos || 0) * 100) / 100;
            const desc = Math.round(Number(sh.descuentos || 0) * 100) / 100;
            const cup = Math.round(Number(sh.cupones || 0) * 100) / 100;
            const cred = Math.round(Number(sh.creditos || 0) * 100) / 100;
            const chq = Math.round(Number(sh.cheques || 0) * 100) / 100;
            const ant = Math.round(Number(sh.anticipos || 0) * 100) / 100;
            const sumaTurno = Math.round((rem + tarj + gst + pag + desc + cup + cred + chq + ant) * 100) / 100;
            const difTurno = Math.round((sumaTurno - vta) * 100) / 100;

            turnosPorEmpresa[empId].push({
                id: sh.id,
                turno: sh.turno,
                responsable: sh.responsable || 'Sin asignar',
                venta: vta,
                remesas: rem,
                tarjetas: tarj,
                gastos: gst,
                pagos: pag,
                descuentos: desc,
                cupones: cup,
                creditos: cred,
                cheques: chq,
                anticipos: ant,
                suma: sumaTurno,
                diferencia: difTurno
            });
        });
    } catch (turnosErr) {
        console.warn('[Consolidado Ventas] Error consultando turnos detallados:', turnosErr.message);
    }
    return turnosPorEmpresa;
};

/**
 * Mapea una fila de resumen de cierre de turno incorporando la conciliación de efectivo y el análisis inteligente.
 */
const mapCierreRowConExplicacion = (r, turnosPorEmpresa, sysDate) => {
    const vales = Number(r.vales || 0);
    const anticiposDesp = Number(r.anticipos_despachados || 0);
    const trupput = Number(r.trupput || 0);
    const monto = Number(r.creditos || 0) + Number(r.cupones || 0) + Number(r.cheques || 0) + vales + anticiposDesp + trupput + Number(r.tarjetas || 0) + Number(r.remesas || 0) + Number(r.gastos || 0) + Number(r.anticipos || 0) + Number(r.pagos || 0) + Number(r.descuentos || 0);
    const venta = Number(r.total_venta || 0) + Number(r.lubricantes || 0);
    const diferencia = (Math.round((monto - venta) * 100) / 100) || 0;
    const gastos = Math.round(Number(r.gastos || 0) * 100) / 100;
    const totVenta = Math.round(venta * 100) / 100;

    const alertas = [];
    if (diferencia < -0.05) {
        alertas.push({ tipo: 'descuadre_cierre', nivel: 'danger', texto: `Faltante de cierre: -$${Math.abs(diferencia).toFixed(2)}` });
    } else if (diferencia > 0.05) {
        alertas.push({ tipo: 'descuadre_cierre', nivel: 'warning', texto: `Sobrante de cierre: +$${diferencia.toFixed(2)}` });
    }
    if (gastos > 150) {
        alertas.push({ tipo: 'gasto_elevado', nivel: 'warning', texto: `Gastos de pista elevados: $${gastos.toFixed(2)}` });
    }
    if (totVenta === 0) {
        alertas.push({ tipo: 'sin_venta', nivel: 'info', texto: 'Sin venta registrada en pista' });
    }

    const noEfectivo = Math.round(((Number(r.tarjetas || 0)) + (Number(r.cupones || 0)) + (Number(r.cheques || 0)) + (Number(r.creditos || 0)) + vales + anticiposDesp + trupput) * 100) / 100;
    const efectivoEsperado = Math.round((totVenta - noEfectivo) * 100) / 100;
    const efectivoDescargado = Math.round(((Number(r.remesas || 0)) + gastos + (Number(r.pagos || 0)) + (Number(r.anticipos || 0)) + (Number(r.descuentos || 0))) * 100) / 100;

    const cleanEmpresa = getCleanStationName(String(r.id_empresa), r.estacion);
    const stationTurnos = (turnosPorEmpresa && turnosPorEmpresa[String(r.id_empresa)]) || [];

    const desgloseDesc = {
        remesas: Math.round(Number(r.remesas || 0) * 100) / 100,
        gastos: gastos,
        pagos: Math.round(Number(r.pagos || 0) * 100) / 100,
        descuentos: Math.round(Number(r.descuentos || 0) * 100) / 100,
        anticipos: Math.round(Number(r.anticipos || 0) * 100) / 100
    };

    const desgloseNoEf = {
        tarjetas: Math.round(Number(r.tarjetas || 0) * 100) / 100,
        cupones: Math.round(Number(r.cupones || 0) * 100) / 100,
        cheques: Math.round(Number(r.cheques || 0) * 100) / 100,
        credito: Math.round(Number(r.creditos || 0) * 100) / 100,
        vales: Math.round(vales * 100) / 100,
        anticipos_despachados: Math.round(anticiposDesp * 100) / 100,
        trupput: Math.round(trupput * 100) / 100
    };

    const analisisInteligente = generarAnalisisDescuadre({
        id_empresa: r.id_empresa,
        estacion: cleanEmpresa,
        fecha: sysDate,
        totVenta,
        ventaCombustible: Math.round(Number(r.total_venta || 0) * 100) / 100,
        lubricantes: Math.round(Number(r.lubricantes || 0) * 100) / 100,
        noEfectivo,
        desgloseNoEfectivo: desgloseNoEf,
        efectivoEsperado,
        efectivoDescargado,
        desgloseDescargos: desgloseDesc,
        diferencia,
        turnos: stationTurnos
    });

    const explicacion = {
        tot_venta: totVenta,
        venta_combustible: Math.round(Number(r.total_venta || 0) * 100) / 100,
        lubricantes: Math.round(Number(r.lubricantes || 0) * 100) / 100,
        no_efectivo: noEfectivo,
        desglose_no_efectivo: desgloseNoEf,
        efectivo_esperado: efectivoEsperado,
        efectivo_descargado: efectivoDescargado,
        desglose_descargos: desgloseDesc,
        diferencia,
        tipo: diferencia < -0.05 ? 'faltante' : (diferencia > 0.05 ? 'sobrante' : 'cuadrado'),
        mensaje: diferencia < -0.05
            ? `Faltante de caja por -$${Math.abs(diferencia).toFixed(2)}: De los $${efectivoEsperado.toFixed(2)} cobrados en efectivo, solo se han justificado $${efectivoDescargado.toFixed(2)} en remesas y descargos (quedan $${Math.abs(diferencia).toFixed(2)} pendientes de remesar al banco o liquidar).`
            : (diferencia > 0.05
                ? `Sobrante de caja por +$${diferencia.toFixed(2)}: Se justificaron $${efectivoDescargado.toFixed(2)} en remesas y descargos, superando el efectivo esperado de $${efectivoEsperado.toFixed(2)}.`
                : 'Cierre de pista cuadrado al centavo.'),
        analisis_inteligente: analisisInteligente
    };

    return {
        id_empresa: r.id_empresa,
        empresa: cleanEmpresa,
        credito: Math.round(Number(r.creditos || 0) * 100) / 100,
        cupones: Math.round(Number(r.cupones || 0) * 100) / 100,
        cheques: Math.round(Number(r.cheques || 0) * 100) / 100,
        vales: Math.round(vales * 100) / 100,
        anticipos_despachados: Math.round(anticiposDesp * 100) / 100,
        trupput: Math.round(trupput * 100) / 100,
        tarjetas: Math.round(Number(r.tarjetas || 0) * 100) / 100,
        remesas: Math.round(Number(r.remesas || 0) * 100) / 100,
        gastos,
        lubricantes: Math.round(Number(r.lubricantes || 0) * 100) / 100,
        anticipos: Math.round(Number(r.anticipos || 0) * 100) / 100,
        pagos: Math.round(Number(r.pagos || 0) * 100) / 100,
        descuentos: Math.round(Number(r.descuentos || 0) * 100) / 100,
        suma: Math.round(monto * 100) / 100,
        tot_venta: totVenta,
        diferencia,
        alertas,
        tiene_incongruencia: alertas.some(a => a.nivel === 'danger' || a.nivel === 'warning'),
        explicacion_diferencia: explicacion,
        turnos: stationTurnos
    };
};

const getCortesTiendaData = async (externalDb, date, accountingDbParam = undefined) => {
    // 1. Obtener cortes del sistema legado (cort_cabecera)
    let legacyRows = [];
    if (externalDb && typeof externalDb.query === 'function') {
        try {
            const sqlCortesTienda = `
                SELECT 
                    b.id_empresa,
                    b.titulo as tienda_nombre,
                    a.id as id_corte,
                    DATE_FORMAT(COALESCE(a.fecha, ?), '%Y-%m-%d') as fecha,
                    COALESCE(a.turno, 0) as turno,
                    COALESCE(a.responsable, '') as responsable,
                    COALESCE(a.tot_ventas, 0.0) as venta,
                    COALESCE(a.tot_ingresos, 0.0) as ingresos,
                    COALESCE(a.tot_tarjeta, 0.0) as tarjeta,
                    COALESCE(a.tot_remesado, 0.0) as remesado,
                    COALESCE(a.tot_gastos, 0.0) as gastos,
                    COALESCE(a.tot_retirado, 0.0) as retiros,
                    COALESCE(a.efectivo, 0.0) as saldo_f,
                    COALESCE(a.diferencia, 0.0) as dif,
                    CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END as tiene_corte
                FROM web_consolidado b
                LEFT JOIN cort_cabecera a ON b.id_empresa = a.id_empresa AND a.fecha = ?
                WHERE b.grupo = 'TIENDA' AND b.id_empresa NOT IN ('004', '022')
                ORDER BY b.orden
            `;
            const [rows] = await externalDb.query(sqlCortesTienda, [date, date]);
            legacyRows = rows || [];
        } catch (e) {
            console.warn('[Cortes Tienda] Error leyendo legacy cort_cabecera:', e.message);
        }
    }

    // 2. Consultar turnos de tiendas en db_sistema_saas (sys.sipesv.com)
    const saasByBranch = {};
    try {
        const saasDb = accountingDbParam !== undefined
            ? accountingDbParam
            : (process.env.NODE_ENV === 'test' ? null : await getAccountingDb().catch(() => null));
        if (saasDb) {
            const [saasShifts] = await withRetry(() => saasDb.query(`
                SELECT s.id, s.branch_id, b.nombre as branch_nombre, p.nombre as pos_nombre,
                       s.total_sales, s.total_incomes, s.card_sales, s.total_tarjetas,
                       s.transfer_sales, s.other_sales, s.total_puntos,
                       s.total_remesas, s.total_expenses,
                       s.opening_balance, s.expected_cash, s.actual_cash, s.difference, s.shift_number,
                       COALESCE(sel.nombre, u.nombre) as seller_nombre
                FROM pos_shifts s
                JOIN branches b ON s.branch_id = b.id
                JOIN points_of_sale p ON s.pos_id = p.id
                LEFT JOIN sellers sel ON s.seller_id = sel.id
                LEFT JOIN users u ON s.seller_id = u.id
                WHERE DATE(s.shift_date) = ?
                  AND s.status = 'closed'
                  AND (p.nombre LIKE '%Tienda%' OR p.nombre LIKE '%Super%')
                ORDER BY s.branch_id, s.id
            `, [date]));

            for (const sh of (saasShifts || [])) {
                if (!saasByBranch[sh.branch_id]) {
                    saasByBranch[sh.branch_id] = {
                        branch_id: sh.branch_id,
                        shift_ids: [],
                        shift_numbers: new Set(),
                        sellers: new Set(),
                        venta: 0,
                        ingresos: 0,
                        tarjeta: 0,
                        remesado: 0,
                        gastos: 0,
                        saldo_f: 0,
                        dif: 0
                    };
                }
                const b = saasByBranch[sh.branch_id];
                const metrics = computeSaasStoreShiftMetrics(sh);
                b.shift_ids.push(sh.id);
                if (sh.shift_number) b.shift_numbers.add(sh.shift_number);
                if (sh.seller_nombre) b.sellers.add(sh.seller_nombre);
                b.venta += metrics.venta;
                b.ingresos += metrics.ingresos;
                b.tarjeta += metrics.tarjeta;
                b.remesado += metrics.remesado;
                b.gastos += metrics.gastos;
                b.saldo_f += metrics.saldo_f;
                b.dif += metrics.dif;
            }

            // Distinguir tarjetas y remesas analizando pos_shift_remesas en una sola consulta agrupada
            const allShiftIds = [];
            const shiftToBranch = {};
            for (const bId of Object.keys(saasByBranch)) {
                const b = saasByBranch[bId];
                (b.shift_ids || []).forEach(sid => {
                    allShiftIds.push(sid);
                    shiftToBranch[sid] = bId;
                });
            }

            if (allShiftIds.length > 0) {
                try {
                    const [remRows] = await withRetry(() => saasDb.query(
                        "SELECT shift_id, description, amount FROM pos_shift_remesas WHERE shift_id IN (?)",
                        [allShiftIds]
                    ));
                    const branchRemTotals = {};
                    for (const r of (remRows || [])) {
                        const bId = r.shift_id ? shiftToBranch[r.shift_id] : (Object.keys(saasByBranch).length === 1 ? Object.keys(saasByBranch)[0] : null);
                        if (!bId) continue;
                        if (!branchRemTotals[bId]) {
                            branchRemTotals[bId] = { tarjeta: 0, remesado: 0, count: 0 };
                        }
                        const desc = (r.description || '').toLowerCase();
                        const amt = Number(r.amount || 0);
                        const isCard = desc.includes('pos') || desc.includes('credomatic') || desc.includes('tarjeta') || desc.includes('voucher');
                        if (isCard) {
                            branchRemTotals[bId].tarjeta += amt;
                        } else {
                            branchRemTotals[bId].remesado += amt;
                        }
                        branchRemTotals[bId].count += 1;
                    }

                    for (const bId of Object.keys(branchRemTotals)) {
                        if (saasByBranch[bId] && branchRemTotals[bId].count > 0) {
                            if (branchRemTotals[bId].tarjeta > 0) {
                                saasByBranch[bId].tarjeta = branchRemTotals[bId].tarjeta;
                            }
                            if (branchRemTotals[bId].remesado > 0 || branchRemTotals[bId].tarjeta > 0) {
                                saasByBranch[bId].remesado = branchRemTotals[bId].remesado;
                            }
                        }
                    }
                } catch (remErr) {
                    console.warn('[Cortes Tienda] Error leyendo pos_shift_remesas:', remErr.message);
                }
            }
        }
    } catch (saasErr) {
        console.warn('[Cortes Tienda] Error consultando SaaS pos_shifts:', saasErr.message);
    }

    if (!legacyRows || legacyRows.length === 0) {
        const storeEntries = [
            { id_empresa: '014', tienda_nombre: 'E-MARKET SAN MARTIN' },
            { id_empresa: '006', tienda_nombre: 'E-MARKET CHALCHUAPA' },
            { id_empresa: '002', tienda_nombre: 'E-MARKET MIRAFLORES' },
            { id_empresa: '008', tienda_nombre: 'SUPER 7 COSTA' },
            { id_empresa: '009', tienda_nombre: 'SUPER EL PEDREGAL' }
        ];
        legacyRows = storeEntries.map(s => ({
            id_empresa: s.id_empresa,
            tienda_nombre: s.tienda_nombre,
            id_corte: null,
            fecha: date,
            turno: 0,
            responsable: '',
            venta: 0,
            ingresos: 0,
            tarjeta: 0,
            remesado: 0,
            gastos: 0,
            retiros: 0,
            saldo_f: 0,
            dif: 0,
            tiene_corte: 0
        }));
    }

    // 3. Priorizar datos de SaaS (cerrados) y complementar con histórico legado
    return (legacyRows || []).map(r => {
        const saasBranchId = saasBranchMap[r.id_empresa];
        const saasData = saasBranchId ? saasByBranch[saasBranchId] : null;

        // Si SaaS tiene turnos cerrados para esta sucursal, usar SaaS prioritariamente
        if (saasData && (saasData.shift_ids.length > 0 || saasData.venta > 0)) {
            const row = {
                id_corte: `SAAS_${saasBranchId}_${date}`,
                id_empresa: r.id_empresa,
                empresa: getCleanTiendaName(String(r.id_empresa), r.tienda_nombre),
                fecha: date,
                turno: Array.from(saasData.shift_numbers).join('-') || 1,
                responsable: Array.from(saasData.sellers).join(', ') || 'Cajero Turno',
                venta: Math.round(saasData.venta * 100) / 100,
                ingresos: Math.round(saasData.ingresos * 100) / 100,
                tarjeta: Math.round(saasData.tarjeta * 100) / 100,
                remesado: Math.round(saasData.remesado * 100) / 100,
                gastos: Math.round(saasData.gastos * 100) / 100,
                retiros: 0,
                saldo_f: Math.round(saasData.saldo_f * 100) / 100,
                dif: Math.round(saasData.dif * 100) / 100,
                tiene_corte: true,
                fuente: 'db_sistema_saas (sys.sipesv.com)'
            };
            const alertas = [];
            if (row.gastos > 0) alertas.push({ tipo: 'gasto_tienda', nivel: 'warning', texto: `Gasto en tienda: $${row.gastos.toFixed(2)}` });
            if (row.dif !== 0) alertas.push({ tipo: 'descuadre', nivel: 'danger', texto: row.dif < 0 ? `Faltante: -$${Math.abs(row.dif).toFixed(2)}` : `Sobrante: +$${row.dif.toFixed(2)}` });
            row.alertas = alertas;
            row.tiene_incongruencia = alertas.length > 0;
            return row;
        }

        const legacyRow = {
            id_corte: r.id_corte,
            id_empresa: r.id_empresa,
            empresa: getCleanTiendaName(String(r.id_empresa), r.tienda_nombre),
            fecha: r.fecha,
            turno: r.turno,
            responsable: r.responsable,
            venta: Math.round(Number(r.venta || 0) * 100) / 100,
            ingresos: Math.round(Number(r.ingresos || 0) * 100) / 100,
            tarjeta: Math.round(Number(r.tarjeta || 0) * 100) / 100,
            remesado: Math.round(Number(r.remesado || 0) * 100) / 100,
            gastos: Math.round(Number(r.gastos || 0) * 100) / 100,
            retiros: Math.round(Number(r.retiros || 0) * 100) / 100,
            saldo_f: Math.round(Number(r.saldo_f || 0) * 100) / 100,
            dif: Math.round(Number(r.dif || 0) * 100) / 100,
            tiene_corte: r.tiene_corte === 1,
            fuente: 'db_system_rrs'
        };
        const legAlertas = [];
        if (legacyRow.gastos > 0) legAlertas.push({ tipo: 'gasto_tienda', nivel: 'warning', texto: `Gasto en tienda: $${legacyRow.gastos.toFixed(2)}` });
        if (legacyRow.dif !== 0) legAlertas.push({ tipo: 'descuadre', nivel: 'danger', texto: legacyRow.dif < 0 ? `Faltante: -$${Math.abs(legacyRow.dif).toFixed(2)}` : `Sobrante: +$${legacyRow.dif.toFixed(2)}` });
        if (!legacyRow.tiene_corte) legAlertas.push({ tipo: 'sin_corte', nivel: 'info', texto: 'Sin corte registrado' });
        else if (legacyRow.venta === 0) legAlertas.push({ tipo: 'venta_cero', nivel: 'warning', texto: 'Corte con venta $0.00' });
        legacyRow.alertas = legAlertas;
        legacyRow.tiene_incongruencia = legAlertas.length > 0;
        return legacyRow;
    });
};

// --- Ventas ---
const getConsolidadoVentasData = async (date) => {
    let externalDb = null;
    try {
        externalDb = await getExternalDb();
    } catch (e) {
        console.warn('[Consolidado Ventas] externalDb no disponible:', e.message);
    }

        let accountingDb = null;
        let useSaas = false;
        try {
            accountingDb = await getAccountingDb();
            if (accountingDb) {
                const [saasCheck] = await withRetry(() => accountingDb.query(
                    "SELECT COUNT(*) as count FROM gas_station_closeouts WHERE fecha_turno = ? AND estado = 'cerrado'",
                    [date]
                ));
                if (saasCheck && saasCheck[0]?.count > 0) {
                    useSaas = true;
                }
            }
        } catch (saasErr) {
            console.warn('[Consolidado Ventas] Error verificando SaaS:', saasErr.message);
        }

        let stations = OFFICIAL_ESTACIONES;
        if (externalDb) {
            try {
                const [stRows] = await externalDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden");
                if (stRows && stRows.length > 0) stations = stRows;
            } catch (stErr) {
                console.warn('[Consolidado Ventas] Error cargando web_consolidado:', stErr.message);
            }
        }

        const toSystemDate = (dStr) => {
            const parts = dStr.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        };
        const sysDate = toSystemDate(date);

        const cInicio = new Date(date + 'T12:00:00');
        cInicio.setDate(cInicio.getDate() - 15);
        const cInicioStr = cInicio.toISOString().split('T')[0];

        let tiendasLocal = [];
        if (externalDb) {
            try {
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
                tiendasLocal = (tiendasRows || [])
                    .filter(r => r.id_empresa !== '004')
                    .map(row => ({
                        fecha: date,
                        empresa: getCleanTiendaName(String(row.id_empresa), row.titulo),
                        venta: Math.round(Number(row.monto || 0) * 100) / 100,
                        promedio: Math.round(Number(row.promedio || 0) * 100) / 100
                    }));
            } catch (tErr) {
                console.warn('[Consolidado Ventas] Error consultando ventas_tienda:', tErr.message);
            }
        }

        let estacionesLocal = [];
        let margenesRows = [];
        let inventarioLocal = [];
        let resumenCierreLocal = [];
        let turnosPorEmpresa = {};

        if (useSaas) {
            // 1. Resumen de Ventas Estaciones (SaaS, solo turnos cerrados)
            const sqlSaasEstaciones = `
                SELECT 
                    c.branch_id,
                    SUM(CASE WHEN r.descripcion_producto LIKE '%REGULAR%' THEN r.diferencia ELSE 0 END) as regular,
                    SUM(CASE WHEN r.descripcion_producto LIKE '%SUPER%' THEN r.diferencia ELSE 0 END) as super,
                    SUM(CASE WHEN (r.descripcion_producto LIKE '%DIESEL%' AND r.descripcion_producto NOT LIKE '%ION%') THEN r.diferencia ELSE 0 END) as diesel,
                    SUM(CASE WHEN r.descripcion_producto LIKE '%ION%' THEN r.diferencia ELSE 0 END) as ion,
                    SUM(r.diferencia) as galonaje,
                    SUM(r.monto) as monto
                FROM gas_station_closeouts c
                JOIN gas_station_closeout_readings r ON r.closeout_id = c.id
                WHERE c.fecha_turno = ? AND c.estado = 'cerrado'
                GROUP BY c.branch_id
            `;
            const [saasSalesRows] = await withRetry(() => accountingDb.query(sqlSaasEstaciones, [date]));
            const saasEstMap = {};
            (saasSalesRows || []).forEach(r => {
                const bId = normalizeSaasBranchId(r.branch_id);
                if (!saasEstMap[bId]) {
                    saasEstMap[bId] = { ...r, branch_id: bId };
                } else {
                    saasEstMap[bId].diesel = Number(saasEstMap[bId].diesel || 0) + Number(r.diesel || 0);
                    saasEstMap[bId].regular = Number(saasEstMap[bId].regular || 0) + Number(r.regular || 0);
                    saasEstMap[bId].super = Number(saasEstMap[bId].super || 0) + Number(r.super || 0);
                    saasEstMap[bId].ion = Number(saasEstMap[bId].ion || 0) + Number(r.ion || 0);
                    saasEstMap[bId].galonaje = Number(saasEstMap[bId].galonaje || 0) + Number(r.galonaje || 0);
                    saasEstMap[bId].monto = Number(saasEstMap[bId].monto || 0) + Number(r.monto || 0);
                }
            });

            estacionesLocal = OFFICIAL_ESTACIONES.map(st => {
                const row = saasEstMap[st.branch_id] || {};
                const diesel = Math.round(Number(row.diesel || 0) * 100) / 100;
                const regular = Math.round(Number(row.regular || 0) * 100) / 100;
                const superVal = Math.round(Number(row.super || 0) * 100) / 100;
                const ion = Math.round(Number(row.ion || 0) * 100) / 100;
                const galonaje = Math.round(Number(row.galonaje || 0) * 100) / 100;
                const venta = Math.round(Number(row.monto || 0) * 100) / 100;

                const alertas = [];
                if (galonaje === 0 && venta > 0) {
                    alertas.push({ tipo: 'galonaje_incongruente', nivel: 'danger', texto: `Venta registrada ($${venta.toFixed(2)}) con 0.00 galones` });
                } else if (galonaje > 0 && venta === 0) {
                    alertas.push({ tipo: 'galonaje_incongruente', nivel: 'danger', texto: `Despacho de combustible (${galonaje.toFixed(2)} gal) con $0.00 en venta` });
                } else if (galonaje === 0 && venta === 0) {
                    alertas.push({ tipo: 'sin_despacho', nivel: 'info', texto: 'Sin despacho ni venta en pista' });
                }

                return {
                    id_empresa: st.id_empresa,
                    empresa: getCleanStationName(st.id_empresa, st.titulo),
                    diesel,
                    regular,
                    super: superVal,
                    ion,
                    galonaje,
                    venta,
                    alertas,
                    tiene_incongruencia: alertas.some(a => a.nivel === 'danger' || a.nivel === 'warning'),
                    fuente: 'db_sistema_saas (sys.sipesv.com)'
                };
            });

            // 2. Precios para márgenes (último turno cerrado de la fecha)
            const sqlSaasPrecios = `
                SELECT 
                    c.branch_id,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%DIESEL AUTO%' OR (r.descripcion_producto LIKE '%DIESEL%' AND r.descripcion_producto NOT LIKE '%FULL%' AND r.descripcion_producto NOT LIKE '%COMPLETO%' AND r.descripcion_producto NOT LIKE '%ION%') THEN r.precio ELSE 0 END) as diesel_a,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%REGULAR%AUTO%' OR (r.descripcion_producto LIKE '%REGULAR%' AND r.descripcion_producto NOT LIKE '%FULL%' AND r.descripcion_producto NOT LIKE '%COMPLETO%') THEN r.precio ELSE 0 END) as regular_a,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%SUPER%AUTO%' OR (r.descripcion_producto LIKE '%SUPER%' AND r.descripcion_producto NOT LIKE '%FULL%' AND r.descripcion_producto NOT LIKE '%COMPLETO%') THEN r.precio ELSE 0 END) as super_a,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%DIESEL%FULL%' OR r.descripcion_producto LIKE '%DIESEL%COMPLETO%' THEN r.precio ELSE 0 END) as diesel_c,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%REGULAR%FULL%' OR r.descripcion_producto LIKE '%REGULAR%COMPLETO%' THEN r.precio ELSE 0 END) as regular_c,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%SUPER%FULL%' OR r.descripcion_producto LIKE '%SUPER%COMPLETO%' THEN r.precio ELSE 0 END) as super_c,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%ION%' THEN r.precio ELSE 0 END) as ion_diesel,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%MASTER%' THEN r.precio ELSE 0 END) as master
                FROM gas_station_closeouts c
                JOIN gas_station_closeout_readings r ON r.closeout_id = c.id
                WHERE c.fecha_turno = ? AND c.estado = 'cerrado'
                  AND c.numero_turno = (
                      SELECT MAX(x.numero_turno) 
                      FROM gas_station_closeouts x 
                      WHERE x.branch_id = c.branch_id AND x.fecha_turno = c.fecha_turno AND x.estado = 'cerrado'
                  )
                GROUP BY c.branch_id
            `;
            const [saasPreciosRows] = await withRetry(() => accountingDb.query(sqlSaasPrecios, [date]));
            const saasMargenMap = {};
            (saasPreciosRows || []).forEach(r => {
                saasMargenMap[normalizeSaasBranchId(r.branch_id)] = r;
            });
            margenesRows = OFFICIAL_ESTACIONES.map(st => {
                const row = saasMargenMap[st.branch_id] || {};
                return {
                    id_empresa: st.id_empresa,
                    titulo: st.titulo,
                    diesel_a: Number(row.diesel_a || 0),
                    regular_a: Number(row.regular_a || 0),
                    super_a: Number(row.super_a || 0),
                    diesel_c: Number(row.diesel_c || 0),
                    regular_c: Number(row.regular_c || 0),
                    super_c: Number(row.super_c || 0),
                    ion_diesel: Number(row.ion_diesel || 0),
                    master: Number(row.master || 0)
                };
            });

            // 3. Inventario de tanques (último turno cerrado) y promedios 7 días COMPLETOS (excluyendo hoySV)
            const { getElSalvadorTodayYMD, addDaysYMD } = require('../utils/dateSv');
            const hoySV = getElSalvadorTodayYMD();
            const ayerSV = addDaysYMD(hoySV, -1);
            const dateHasta7d = (date && date < hoySV) ? date : ayerSV;
            const dateDesde7d = addDaysYMD(dateHasta7d, -6);

            const [saasTankRows, saas7dRows] = await Promise.all([
                withRetry(() => accountingDb.query(`
                    SELECT 
                        c.branch_id,
                        t.tipo_combustible,
                        t.descripcion,
                        (tr.lectura_actual - COALESCE(t.reserva, 0)) as inventario_neto
                    FROM gas_station_closeouts c
                    JOIN gas_station_closeout_tank_readings tr ON tr.closeout_id = c.id
                    JOIN gas_station_tanks t ON t.id = tr.tank_id
                    WHERE c.fecha_turno = ? AND c.estado = 'cerrado'
                      AND c.numero_turno = (
                          SELECT MAX(x.numero_turno) 
                          FROM gas_station_closeouts x 
                          WHERE x.branch_id = c.branch_id AND x.fecha_turno = c.fecha_turno AND x.estado = 'cerrado'
                      )
                `, [date])),
                withRetry(() => accountingDb.query(`
                    SELECT 
                        c.branch_id,
                        CASE 
                            WHEN p.tipo_combustible = 1 OR r.descripcion_producto LIKE '%REGULAR%' THEN 'R'
                            WHEN p.tipo_combustible = 2 OR r.descripcion_producto LIKE '%SUPER%' OR r.descripcion_producto LIKE '%V-POWER%' THEN 'S'
                            WHEN p.tipo_combustible = 4 OR r.descripcion_producto LIKE '%ION%' OR r.descripcion_producto LIKE '%ULSD%' THEN 'I'
                            ELSE 'D'
                        END as tipo_combustible,
                        SUM(GREATEST(0, COALESCE(r.diferencia, 0))) as total_7d,
                        COUNT(DISTINCT c.fecha_turno) as dias_activos
                    FROM gas_station_closeouts c
                    JOIN gas_station_closeout_readings r ON r.closeout_id = c.id
                    LEFT JOIN products p ON r.product_id = p.id
                    WHERE c.fecha_turno BETWEEN ? AND ? AND c.estado = 'cerrado'
                    GROUP BY c.branch_id, tipo_combustible
                `, [dateDesde7d, dateHasta7d]))
            ]);

            const tankList = (saasTankRows[0] || []).map(t => ({ ...t, branch_id: normalizeSaasBranchId(t.branch_id) }));
            const promedios7d = (saas7dRows[0] || []).map(p => ({ ...p, branch_id: normalizeSaasBranchId(p.branch_id) }));

            inventarioLocal = OFFICIAL_ESTACIONES.map(s => {
                const bId = s.branch_id;
                const bTanks = tankList.filter(t => t.branch_id === bId);
                const getInv = (fuelCode) => {
                    return bTanks.filter(t => {
                        if (fuelCode === 'R') return t.tipo_combustible === 1 || (t.descripcion || '').toUpperCase().includes('REGULAR');
                        if (fuelCode === 'S') return t.tipo_combustible === 2 || (t.descripcion || '').toUpperCase().includes('SUPER');
                        if (fuelCode === 'I') return t.tipo_combustible === 4 || (t.descripcion || '').toUpperCase().includes('ION');
                        return (t.tipo_combustible === 3 || t.tipo_combustible === 5 || (t.descripcion || '').toUpperCase().includes('DIESEL')) && !(t.descripcion || '').toUpperCase().includes('ION');
                    }).reduce((acc, curr) => acc + Math.max(0, Number(curr.inventario_neto || 0)), 0);
                };

                const nD = Math.round(getInv('D') * 100) / 100;
                const nR = Math.round(getInv('R') * 100) / 100;
                const nS = Math.round(getInv('S') * 100) / 100;
                const nI = Math.round(getInv('I') * 100) / 100;

                const branchDays = Math.max(
                    1,
                    ...promedios7d.filter(p => p.branch_id === bId).map(p => Number(p.dias_activos || 0)),
                    0
                ) || 7;
                const getProm = (tipo) => {
                    const rows = promedios7d.filter(p => p.branch_id === bId && p.tipo_combustible === tipo);
                    const total7d = rows.reduce((sum, r) => sum + Number(r?.total_7d || 0), 0);
                    return total7d / branchDays;
                };
                const pD = getProm('D'), pR = getProm('R'), pS = getProm('S'), pI = getProm('I');

                return {
                    empresa: s.titulo,
                    diesel: nD,
                    regular: nR,
                    super: nS,
                    iondiesel: nI,
                    duracion_diesel: pD > 0 ? Math.round((nD / pD) * 10) / 10 : 0,
                    duracion_regular: pR > 0 ? Math.round((nR / pR) * 10) / 10 : 0,
                    duracion_super: pS > 0 ? Math.round((nS / pS) * 10) / 10 : 0,
                    duracion_ion: pI > 0 ? Math.round((nI / pI) * 10) / 10 : 0
                };
            });

            // 4. Detalle de turnos por estación y resumen de cierre pista (cerrados únicamente)
            turnosPorEmpresa = await getTurnosPorEmpresa(externalDb, sysDate, accountingDb, date);

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
            const numericCierreFields = ['creditos', 'cupones', 'cheques', 'vales', 'anticipos_despachados', 'trupput', 'tarjetas', 'remesas', 'gastos', 'lubricantes', 'anticipos', 'pagos', 'descuentos', 'total_venta'];
            (saasCierreRows || []).forEach(r => {
                const bId = normalizeSaasBranchId(r.branch_id);
                if (!saasCierreMap[bId]) {
                    saasCierreMap[bId] = { ...r, branch_id: bId };
                } else {
                    for (const k of numericCierreFields) {
                        saasCierreMap[bId][k] = Number(saasCierreMap[bId][k] || 0) + Number(r[k] || 0);
                    }
                }
            });

            resumenCierreLocal = OFFICIAL_ESTACIONES.map(st => {
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
        } else if (externalDb) {
            // Modo legado (db_system_rrs)
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
            estacionesLocal = (estacionesRows || [])
                .filter(r => r.id_empresa !== '004')
                .map(row => {
                    const diesel = Math.round(Number(row.diesel || 0) * 100) / 100;
                    const regular = Math.round(Number(row.regular || 0) * 100) / 100;
                    const superVal = Math.round(Number(row.super || 0) * 100) / 100;
                    const ion = Math.round(Number(row.ion || 0) * 100) / 100;
                    const galonaje = Math.round(Number(row.galonaje || 0) * 100) / 100;
                    const venta = Math.round(Number(row.monto || 0) * 100) / 100;

                    const alertas = [];
                    if (galonaje === 0 && venta > 0) {
                        alertas.push({ tipo: 'galonaje_incongruente', nivel: 'danger', texto: `Venta registrada ($${venta.toFixed(2)}) con 0.00 galones` });
                    } else if (galonaje > 0 && venta === 0) {
                        alertas.push({ tipo: 'galonaje_incongruente', nivel: 'danger', texto: `Despacho de combustible (${galonaje.toFixed(2)} gal) con $0.00 en venta` });
                    } else if (galonaje === 0 && venta === 0) {
                        alertas.push({ tipo: 'sin_despacho', nivel: 'info', texto: 'Sin despacho ni venta en pista' });
                    }

                    return {
                        id_empresa: String(row.id_empresa),
                        empresa: getCleanStationName(String(row.id_empresa), row.titulo),
                        diesel,
                        regular,
                        super: superVal,
                        ion,
                        galonaje,
                        venta,
                        alertas,
                        tiene_incongruencia: alertas.some(a => a.nivel === 'danger' || a.nivel === 'warning')
                    };
                });

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
            const [mRows] = await externalDb.query(sqlMargenes, [sysDate]);
            margenesRows = mRows || [];

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
            const lecturas = lecturasRows[0] || [], promedios = promediosRows[0] || [];
            inventarioLocal = stations.map(s => {
                const id = s.id_empresa;
                const getInv = (tipo) => lecturas.filter(l => l.id_empresa === id && l.tipo_combustible === tipo).reduce((acc, curr) => acc + (Number(curr.lectura || 0) - Number(curr.galones_reserva || 0)), 0);
                const nD = getInv('D'), nR = getInv('R'), nS = getInv('S'), nI = getInv('I');
                const getProm = (tipo) => { const row = promedios.find(p => p.id_empresa === id && p.tipo_combustible === tipo); return (Number(row?.total_7d || 0) / 7); };
                const pD = getProm('D'), pR = getProm('R'), pS = getProm('S'), pI = getProm('I');
                return { empresa: s.titulo, diesel: nD, regular: nR, super: nS, iondiesel: nI, duracion_diesel: pD > 0 ? Math.round((nD / pD) * 10) / 10 : 0, duracion_regular: pR > 0 ? Math.round((nR / pR) * 10) / 10 : 0, duracion_super: pS > 0 ? Math.round((nS / pS) * 10) / 10 : 0, duracion_ion: pI > 0 ? Math.round((nI / pI) * 10) / 10 : 0 };
            });

            // Resumen Cierre de Turno Pista (cierre_turno)
            const sqlCierreTurno = `
                SELECT x.id_empresa,
                       x.titulo AS estacion,
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
                       (SELECT IFNULL(SUM(b.monto),0.0) FROM cierre_turno a INNER JOIN cierre_turno_lecturas b ON a.id=b.id_cierre_turno AND a.id_empresa=b.id_empresa WHERE a.fecha_turno = ? AND a.id_empresa = x.id_empresa) AS total_venta
                FROM web_consolidado x WHERE x.grupo = 'ESTACION' AND x.id_empresa != '004' ORDER BY x.orden
            `;
            turnosPorEmpresa = await getTurnosPorEmpresa(externalDb, sysDate);
            const [resumenCierreRows] = await externalDb.query(sqlCierreTurno, Array(11).fill(sysDate));
            resumenCierreLocal = (resumenCierreRows || []).map(r => mapCierreRowConExplicacion(r, turnosPorEmpresa, sysDate));
        }

        // Obtener costos de combustibles vigentes para la quincena de la fecha consultada
        let quincenaRow = null;
        let stationCostsMap = {};
        let stationQuincenalMap = {};
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
                    if (['002', '004', '006', '008', '014', '015', '016'].includes(clean)) return clean;
                    if (String(id).trim() === '7') return '016';
                }
                const n = (name || '').toUpperCase();
                if (n.includes('MIRAFLORES')) return '002';
                if (n.includes('DESVIO') || n.includes('DESVÍO')) return '004';
                if (n.includes('CHALCHUAPA')) return '006';
                if (n.includes('COSTA')) return '008';
                if (n.includes('LOMA') || n.includes('SAN MARTIN')) return '014';
                if (n.includes('14 AVENIDA')) return '015';
                if (n.includes('POLIEDRO')) return '016';
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

            // 2b. Precios base mayoristas específicos por estación fijados para esta quincena
            stationQuincenalMap = {};
            try {
                const [stQRows] = await withRetry(() => db.query(
                    `SELECT id_estacion, precio_diesel, precio_regular, precio_super, precio_ion 
                     FROM combustible_precios_estacion_quincenal
                     WHERE ? BETWEEN periodo_inicio AND periodo_fin AND activo = 1`,
                    [date]
                ));
                (stQRows || []).forEach(r => {
                    const stCode = String(r.id_estacion).padStart(3, '0');
                    stationQuincenalMap[stCode] = {
                        costo_diesel: Number(r.precio_diesel || 0),
                        costo_regular: Number(r.precio_regular || 0),
                        costo_super: Number(r.precio_super || 0),
                        costo_ion: Number(r.precio_ion || 0)
                    };
                });
            } catch (sqErr) {
                // Ignore if table not yet migrated
            }
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
            '016': 0.02820, // Shell Poliedro
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

        const FOVIAL_COTRANS = 0.30000;
        const IVA_RATE = 0.13;

        const getFuelBaseCost = (idEmpresa, fuelType) => {
            const idKey = String(idEmpresa).padStart(3, '0');
            
            // 1. Costo base oficial específico por estación para la quincena (Base Facturación Puma)
            const stQ = stationQuincenalMap[idKey];
            if (stQ && stQ[`costo_${fuelType}`] > 0) {
                return stQ[`costo_${fuelType}`];
            }

            // 2. Costo base deducido de factura/portal específico de la estación
            const stCost = stationCostsMap[idKey];
            if (stCost && stCost[`costo_${fuelType}`] > 0) {
                const flete = stationFletes[idKey] !== undefined ? stationFletes[idKey] : 0.04000;
                const portalPrice = stCost[`costo_${fuelType}`];
                // En facturación Puma mayorista, el precio unitario es (Base + Flete + FOVIAL/COTRANS $0.30)
                // Se deduce el FOVIAL y el flete para obtener la Base Facturación pura
                const baseFromPortal = Math.max(0, portalPrice - flete - FOVIAL_COTRANS);
                if (baseFromPortal > 1.0) {
                    return Math.round(baseFromPortal * 100000) / 100000;
                }
                return portalPrice;
            }

            // 3. Costo base de referencia quincenal general
            if (quincenaRow && Number(quincenaRow[`precio_${fuelType}`] || 0) > 0) {
                return Number(quincenaRow[`precio_${fuelType}`]);
            }

            // 4. Costo heredado de externalDb
            const legacyKey = fuelType === 'ion' ? 'IONDIESEL' : fuelType.toUpperCase();
            if (legacyCostsMap[idKey] && Number(legacyCostsMap[idKey][legacyKey] || 0) > 0) {
                return Number(legacyCostsMap[idKey][legacyKey]);
            }

            // 5. Precios de referencia oficiales según informe de liquidación Puma
            const defaultBases = { diesel: 3.82810, regular: 3.71200, super: 3.98000, ion: 4.02739 };
            return defaultBases[fuelType] || 0;
        };

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

        // Cortes de Tienda detallados (combinando legado cort_cabecera y nuevo sistema SaaS pos_shifts)
        const cortesTiendaLocal = await getCortesTiendaData(externalDb, date, accountingDb);

        // Si alguna tienda no tenía venta en ventas_tienda pero sí en cortes de tienda, complementar
        tiendasLocal.forEach(t => {
            if (Number(t.venta || 0) === 0) {
                const c = cortesTiendaLocal.find(k => k.empresa === t.empresa);
                if (c && Number(c.venta || 0) > 0) {
                    t.venta = c.venta;
                }
            }
        });

        // Y si alguna tienda no tenía corte en cort_cabecera/pos_shifts pero sí registra venta en ventas_tienda, complementar
        cortesTiendaLocal.forEach(c => {
            if (Number(c.venta || 0) === 0 && !c.tiene_corte) {
                const t = tiendasLocal.find(k => k.empresa === c.empresa);
                if (t && Number(t.venta || 0) > 0) {
                    c.venta = t.venta;
                    c.tiene_corte = true;
                    c.responsable = c.responsable || 'Cierre Diario (SIPE)';
                    c.alertas = (c.alertas || []).filter(a => a.tipo !== 'sin_corte' && a.tipo !== 'venta_cero');
                    c.tiene_incongruencia = c.alertas.length > 0;
                }
            }
        });

        // Si tiendasLocal quedó vacío (ej. externalDb sin conexión), poblar desde cortesTiendaLocal
        if (tiendasLocal.length === 0 && cortesTiendaLocal.length > 0) {
            tiendasLocal = cortesTiendaLocal.map(c => ({
                fecha: date,
                empresa: c.empresa,
                venta: Number(c.venta || 0),
                promedio: Number(c.venta || 0)
            }));
        }

        // Resumen global de auditoría e incongruencias
        const auditoria = {
            total_alertas: 0,
            gastos_tiendas_count: 0,
            gastos_tiendas_monto: 0,
            descuadres_cortes_count: 0,
            descuadres_cortes_monto: 0,
            descuadres_pista_count: 0,
            descuadres_pista_monto: 0,
            galonajes_incongruentes_count: 0,
            tiendas_sin_corte_count: 0
        };

        cortesTiendaLocal.forEach(c => {
            if (c.gastos > 0) {
                auditoria.gastos_tiendas_count += 1;
                auditoria.gastos_tiendas_monto += c.gastos;
            }
            if (Math.abs(c.dif) > 0.01) {
                auditoria.descuadres_cortes_count += 1;
                auditoria.descuadres_cortes_monto += Math.abs(c.dif);
            }
            if (!c.tiene_corte) {
                auditoria.tiendas_sin_corte_count += 1;
            }
        });

        resumenCierreLocal.forEach(r => {
            if (Math.abs(r.diferencia) > 0.05) {
                auditoria.descuadres_pista_count += 1;
                auditoria.descuadres_pista_monto += Math.abs(r.diferencia);
            }
        });

        estacionesLocal.forEach(e => {
            if ((e.galonaje === 0 && e.venta > 0) || (e.galonaje > 0 && e.venta === 0)) {
                auditoria.galonajes_incongruentes_count += 1;
            }
        });

        auditoria.gastos_tiendas_monto = Math.round(auditoria.gastos_tiendas_monto * 100) / 100;
        auditoria.descuadres_cortes_monto = Math.round(auditoria.descuadres_cortes_monto * 100) / 100;
        auditoria.descuadres_pista_monto = Math.round(auditoria.descuadres_pista_monto * 100) / 100;
        auditoria.total_alertas = auditoria.gastos_tiendas_count + auditoria.descuadres_cortes_count + auditoria.descuadres_pista_count + auditoria.galonajes_incongruentes_count;

        return {
            tiendas: tiendasLocal,
            cortes_tienda: cortesTiendaLocal,
            estaciones: estacionesLocal,
            resumen_cierre: resumenCierreLocal,
            margenes: margenesLocal,
            inventario: inventarioLocal,
            auditoria,
            quincena: quincenaRow ? {
                periodo_inicio: formatYMD(quincenaRow.periodo_inicio),
                periodo_fin: formatYMD(quincenaRow.periodo_fin),
                precio_diesel: Number(quincenaRow.precio_diesel || 0),
                precio_regular: Number(quincenaRow.precio_regular || 0),
                precio_super: Number(quincenaRow.precio_super || 0),
                precio_ion: Number(quincenaRow.precio_ion || 0),
                fuente: quincenaRow.fuente || 'Portal Puma / DGEHM'
            } : null
        };
};

router.get('/ventas/consolidado/:date', authenticateToken, requirePermission(ventasViewPerms), async (req, res) => {
    const { date } = req.params;
    try {
        const data = await getConsolidadoVentasData(date);
        res.json(data);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar consolidado de ventas'); 
    }
});

// Obtener fletes de combustible por estación
router.get('/ventas/combustibles/fletes', authenticateToken, requirePermission(fletesViewPerms), async (req, res) => {
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
        { id_estacion: '016', estacion_nombre: 'Shell Poliedro', flete_galon: 0.02820 }
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

// Obtener todas las quincenas y precios por estación
router.get('/ventas/combustibles/quincenas', authenticateToken, requirePermission(fletesViewPerms), async (req, res) => {
    try {
        const db = getDb();
        const [quincenas] = await db.query(`
            SELECT * FROM combustible_precios_quincenales 
            ORDER BY periodo_inicio DESC LIMIT 24
        `);
        const [estacionesPrecios] = await db.query(`
            SELECT * FROM combustible_precios_estacion_quincenal 
            ORDER BY periodo_inicio DESC, id_estacion ASC
        `);
        const [fletes] = await db.query(`
            SELECT * FROM combustible_fletes_estacion WHERE activo = 1 ORDER BY id_estacion ASC
        `);
        res.json({
            quincenas: quincenas || [],
            estaciones_precios: estacionesPrecios || [],
            fletes: fletes || []
        });
    } catch (e) {
        sendSafeError(res, e, 'Error al consultar quincenas de combustible');
    }
});

// Guardar o actualizar precios de quincena (general y por estación)
router.post('/ventas/combustibles/quincenas', authenticateToken, requirePermission(['manage_pedidos', '/dashboard/operaciones/pedidos']), async (req, res) => {
    try {
        const { periodo_inicio, periodo_fin, precio_diesel, precio_regular, precio_super, precio_ion, estaciones, activo } = req.body;
        if (!periodo_inicio || !periodo_fin) {
            return res.status(400).json({ message: 'Se requiere periodo_inicio y periodo_fin' });
        }
        const db = getDb();
        
        // 1. Guardar o actualizar quincena general
        await db.query(`
            INSERT INTO combustible_precios_quincenales 
            (periodo_inicio, periodo_fin, precio_diesel, precio_regular, precio_super, precio_ion, fuente, activo)
            VALUES (?, ?, ?, ?, ?, ?, 'Ajuste Manual SIPE', ?)
            ON DUPLICATE KEY UPDATE
            precio_diesel = VALUES(precio_diesel),
            precio_regular = VALUES(precio_regular),
            precio_super = VALUES(precio_super),
            precio_ion = VALUES(precio_ion),
            activo = VALUES(activo)
        `, [periodo_inicio, periodo_fin, Number(precio_diesel || 0), Number(precio_regular || 0), Number(precio_super || 0), Number(precio_ion || 0), (activo === false || activo === 0 || activo === '0') ? 0 : 1]);

        // 2. Si se proporcionaron precios por estación, guardarlos
        if (Array.isArray(estaciones) && estaciones.length > 0) {
            for (const est of estaciones) {
                if (!est.id_estacion) continue;
                await db.query(`
                    INSERT INTO combustible_precios_estacion_quincenal
                    (id_estacion, estacion_nombre, periodo_inicio, periodo_fin, precio_diesel, precio_regular, precio_super, precio_ion)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    precio_diesel = VALUES(precio_diesel),
                    precio_regular = VALUES(precio_regular),
                    precio_super = VALUES(precio_super),
                    precio_ion = VALUES(precio_ion),
                    estacion_nombre = VALUES(estacion_nombre)
                `, [
                    est.id_estacion,
                    est.estacion_nombre || est.id_estacion,
                    periodo_inicio,
                    periodo_fin,
                    Number(est.precio_diesel || precio_diesel || 0),
                    Number(est.precio_regular || precio_regular || 0),
                    Number(est.precio_super || precio_super || 0),
                    Number(est.precio_ion || precio_ion || 0)
                ]);
            }
        }

        res.json({ message: 'Precios de quincena guardados exitosamente' });
    } catch (e) {
        sendSafeError(res, e, 'Error al guardar precios de quincena');
    }
});

router.get('/ventas/resumen-mensual/:periodo', authenticateToken, requirePermission(ventasViewPerms), async (req, res) => {
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

        const externalDb = await getExternalDb().catch(() => null);
        const accountingDb = await getAccountingDb().catch(() => null);
        const data = await getResumenMensualData(externalDb, year, month, accountingDb);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar resumen mensual de ventas');
    }
});

router.get('/ventas/resumen-mensual/:year/:month', authenticateToken, requirePermission(ventasViewPerms), async (req, res) => {
    try {
        const { year, month } = req.params;
        const externalDb = await getExternalDb().catch(() => null);
        const accountingDb = await getAccountingDb().catch(() => null);
        const data = await getResumenMensualData(externalDb, year, month, accountingDb);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar resumen mensual de ventas');
    }
});

router.get('/ventas/resumen-rango/:start/:end', authenticateToken, requirePermission(ventasViewPerms), async (req, res) => {
    try {
        const { start, end } = req.params;
        const externalDb = await getExternalDb().catch(() => null);
        const accountingDb = await getAccountingDb().catch(() => null);
        const data = await getResumenRangoVentasData(externalDb, start, end, accountingDb);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar resumen de ventas por rango');
    }
});

router.get('/ventas/comparativo-anual', authenticateToken, requirePermission(ventasViewPerms), async (req, res) => {
    try {
        const { anioPrincipal, anioComparar, anio1, anio2, anio } = req.query;
        const pYear = anioPrincipal || anio1 || anio || new Date().getFullYear();
        const cYear = anioComparar || anio2 || (parseInt(pYear, 10) - 1);

        const externalDb = await getExternalDb().catch(() => null);
        const accountingDb = await getAccountingDb().catch(() => null);
        const data = await getComparativoAnualData(externalDb, pYear, cYear, accountingDb);
        res.json(data);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar comparativo anual de ventas');
    }
});

router.normalizeStationName = normalizeStationName;
router.getResumenMensualData = getResumenMensualData;
router.getResumenRangoVentasData = getResumenRangoVentasData;
router.getComparativoAnualData = getComparativoAnualData;
router.getCleanStationName = getCleanStationName;
router.getCleanTiendaName = getCleanTiendaName;
router.getCortesTiendaData = getCortesTiendaData;

router.get('/ventas/lubricantes/:start/:end', authenticateToken, requirePermission(lubricantesViewPerms), async (req, res) => {
    const { start, end } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const accountingDb = await getAccountingDb();
        if (accountingDb) {
            const [saasCheck] = await withRetry(() => accountingDb.query(
                "SELECT COUNT(*) as cnt FROM gas_station_closeouts WHERE fecha_turno BETWEEN ? AND ? AND estado = 'cerrado'",
                [start, end]
            ));
            if (saasCheck[0]?.cnt > 0) {
                const sql = `
                    SELECT 
                        c.branch_id,
                        COALESCE(SUM(l.total), 0.0) as venta
                    FROM gas_station_closeouts c
                    JOIN gas_station_closeout_lubricant_readings l ON l.closeout_id = c.id
                    WHERE c.fecha_turno BETWEEN ? AND ? AND c.estado = 'cerrado'
                    GROUP BY c.branch_id
                `;
                const [saasRows] = await withRetry(() => accountingDb.query(sql, [start, end]));
                const saasMap = {};
                (saasRows || []).forEach(r => {
                    const bId = normalizeSaasBranchId(r.branch_id);
                    saasMap[bId] = { branch_id: bId, venta: Number(saasMap[bId]?.venta || 0) + Number(r.venta || 0) };
                });
                const result = OFFICIAL_ESTACIONES.map(st => {
                    const row = saasMap[st.branch_id] || {};
                    return {
                        empresa: st.titulo,
                        venta: Math.round(Number(row.venta || 0) * 100) / 100
                    };
                });
                return res.json(result);
            }
        }

        const externalDb = await getExternalDb();
        if (!externalDb) return res.json([]);
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
        const [rows] = await withRetry(() => externalDb.query(sql, [datesArray]));
        res.json(rows.map(r => ({ empresa: r.titulo, venta: Number(r.monto || 0) })));
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar ventas de lubricantes'); 
    }
});


registerConsultasCierresRoutes(router, {
    generarAnalisisDescuadre,
    getTurnosPorEmpresa,
    mapCierreRowConExplicacion,
    getCortesTiendaData
});

const getPreciosEstacionData = async (date) => {
    const parts = date.split('-'); 
    const sysDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    const accountingDb = await getAccountingDb();

    if (accountingDb) {
        const [saasCheck] = await withRetry(() => accountingDb.query(
            "SELECT COUNT(*) as cnt FROM gas_station_closeouts WHERE fecha_turno = ? AND estado = 'cerrado'",
            [date]
        ));
        if (saasCheck[0]?.cnt > 0) {
            const sqlSaasPrecios = `
                SELECT 
                    c.branch_id,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%DIESEL AUTO%' OR (r.descripcion_producto LIKE '%DIESEL%' AND r.descripcion_producto NOT LIKE '%FULL%' AND r.descripcion_producto NOT LIKE '%COMPLETO%' AND r.descripcion_producto NOT LIKE '%ION%') THEN r.precio ELSE 0 END) as diesel_a,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%REGULAR%AUTO%' OR (r.descripcion_producto LIKE '%REGULAR%' AND r.descripcion_producto NOT LIKE '%FULL%' AND r.descripcion_producto NOT LIKE '%COMPLETO%') THEN r.precio ELSE 0 END) as regular_a,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%SUPER%AUTO%' OR (r.descripcion_producto LIKE '%SUPER%' AND r.descripcion_producto NOT LIKE '%FULL%' AND r.descripcion_producto NOT LIKE '%COMPLETO%') THEN r.precio ELSE 0 END) as super_a,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%DIESEL%FULL%' OR r.descripcion_producto LIKE '%DIESEL%COMPLETO%' THEN r.precio ELSE 0 END) as diesel_c,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%REGULAR%FULL%' OR r.descripcion_producto LIKE '%REGULAR%COMPLETO%' THEN r.precio ELSE 0 END) as regular_c,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%SUPER%FULL%' OR r.descripcion_producto LIKE '%SUPER%COMPLETO%' THEN r.precio ELSE 0 END) as super_c,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%ION%' THEN r.precio ELSE 0 END) as ion_diesel,
                    MAX(CASE WHEN r.descripcion_producto LIKE '%MASTER%' THEN r.precio ELSE 0 END) as master
                FROM gas_station_closeouts c
                JOIN gas_station_closeout_readings r ON r.closeout_id = c.id
                WHERE c.fecha_turno = ? AND c.estado = 'cerrado'
                  AND c.numero_turno = (
                      SELECT MAX(x.numero_turno) 
                      FROM gas_station_closeouts x 
                      WHERE x.branch_id = c.branch_id AND x.fecha_turno = c.fecha_turno AND x.estado = 'cerrado'
                  )
                GROUP BY c.branch_id
            `;
            const [saasPreciosRows] = await withRetry(() => accountingDb.query(sqlSaasPrecios, [date]));
            const saasPreciosMap = {};
            (saasPreciosRows || []).forEach(r => { saasPreciosMap[normalizeSaasBranchId(r.branch_id)] = r; });
            return OFFICIAL_ESTACIONES.map(st => {
                const row = saasPreciosMap[st.branch_id] || {};
                return {
                    empresa: st.titulo,
                    diesel_a: Number(row.diesel_a || 0),
                    regular_a: Number(row.regular_a || 0),
                    super_a: Number(row.super_a || 0),
                    diesel_c: Number(row.diesel_c || 0),
                    regular_c: Number(row.regular_c || 0),
                    super_c: Number(row.super_c || 0),
                    ion_diesel: Number(row.ion_diesel || 0),
                    master: Number(row.master || 0)
                };
            });
        }
    }

    const externalDb = await getExternalDb();
    if (!externalDb) return [];
    const sql = `select a.id_empresa,a.titulo, sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'A',c.precio,0.0),0.0)) as diesel_a,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'A',c.precio,0.0),0.0)) as regular_a,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'A',c.precio,0.0),0.0)) as super_a, sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'F',c.precio,0.0),0.0)) as diesel_c,sum(ifnull(if(b.clasificacion = 'R' and b.tipo = 'F',c.precio,0.0),0.0)) as regular_c,sum(ifnull(if(b.clasificacion = 'S' and b.tipo = 'F',c.precio,0.0),0.0)) as super_c, sum(ifnull(if(b.clasificacion = 'I',c.precio,0.0),0.0)) as ion_diesel,sum(ifnull(if(b.clasificacion = 'D' and b.tipo = 'M',c.precio,0.0),0.0)) as master from web_consolidado a left join cfg_combustibles b on a.id_empresa = b.id_empresa left join ( SELECT a.id_empresa,a.id_producto, a.codigo_producto,a.nom_producto,precio FROM cierre_turno_lecturas a INNER JOIN cierre_turno b ON a.id_cierre_turno = b.id AND a.id_empresa=b.id_empresa WHERE b.fecha_turno = ? AND b.turno = (SELECT MAX(x.turno) FROM cierre_turno x WHERE x.id_empresa=b.id_empresa AND x.fecha_turno=b.fecha_turno) GROUP BY codigo_producto,a.id_empresa order by id_empresa,codigo_producto) c on b.id_empresa = c.id_empresa and b.codigo = c.codigo_producto where a.grupo = 'ESTACION' group by id_empresa order by orden`;
    const [rows] = await withRetry(() => externalDb.query(sql, [sysDate]));
    return (rows || []).map(r => ({ empresa: r.titulo, diesel_a: Number(r.diesel_a), regular_a: Number(r.regular_a), super_a: Number(r.super_a), diesel_c: Number(r.diesel_c), regular_c: Number(r.regular_c), super_c: Number(r.super_c), ion_diesel: Number(r.ion_diesel), master: Number(r.master) }));
};

router.get('/ventas/precios-estacion/:date', authenticateToken, requirePermission(preciosEstacionViewPerms), async (req, res) => {
    const { date } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const data = await getPreciosEstacionData(date);
        res.json(data);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar precios de combustible'); 
    }
});

router.get('/consultas/cumpleanos', authenticateToken, requirePermission(cumpleanosViewPerms), async (req, res) => {
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
        sendSafeError(res, error, 'Error al consultar cumpleaños de empleados');
    }
});

router.get('/consultas/diferencias-combustible/:desde/:hasta', authenticateToken, requirePermission(diferenciasViewPerms), async (req, res) => {
    const { desde, hasta } = req.params;
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
            return res.status(400).json({ message: 'Formato de fecha inválido (debe ser YYYY-MM-DD)' });
        }
        const curr = new Date(desde + 'T12:00:00');
        const endDate = new Date(hasta + 'T12:00:00');
        if (isNaN(curr.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ message: 'Fechas inválidas' });
        }
        if (curr > endDate) {
            return res.status(400).json({ message: 'La fecha inicial no puede ser mayor que la fecha final' });
        }
        const diffDays = Math.ceil((endDate.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 366) {
            return res.status(400).json({ message: 'El rango de fechas no puede exceder 366 días' });
        }

        const accountingDb = await getAccountingDb();
        if (accountingDb) {
            const [saasCheck] = await withRetry(() => accountingDb.query(
                "SELECT COUNT(*) as cnt FROM gas_station_closeouts WHERE fecha_turno BETWEEN ? AND ? AND estado = 'cerrado'",
                [desde, hasta]
            ));
            if (saasCheck[0]?.cnt > 0) {
                const sqlVentas = `
                    SELECT 
                        c.branch_id,
                        CASE 
                            WHEN r.descripcion_producto LIKE '%REGULAR%' THEN 'R'
                            WHEN r.descripcion_producto LIKE '%SUPER%' THEN 'S'
                            WHEN r.descripcion_producto LIKE '%ION%' THEN 'I'
                            ELSE 'D'
                        END as tipo,
                        COALESCE(SUM(r.diferencia), 0.0) as venta
                    FROM gas_station_closeouts c
                    JOIN gas_station_closeout_readings r ON r.closeout_id = c.id
                    WHERE c.fecha_turno BETWEEN ? AND ? AND c.estado = 'cerrado'
                    GROUP BY c.branch_id, tipo
                `;
                const [ventasRows] = await withRetry(() => accountingDb.query(sqlVentas, [desde, hasta]));

                const sqlTanques = `
                    SELECT 
                        c.branch_id,
                        c.fecha_turno,
                        c.numero_turno,
                        tr.tank_id,
                        COALESCE(t.codigo, CAST(tr.tank_id AS CHAR)) as tank_code,
                        CASE 
                            WHEN t.tipo_combustible = 1 OR tr.descripcion_tanque LIKE '%REGULAR%' THEN 'R'
                            WHEN t.tipo_combustible = 2 OR tr.descripcion_tanque LIKE '%SUPER%' THEN 'S'
                            WHEN t.tipo_combustible = 4 OR tr.descripcion_tanque LIKE '%ION%' THEN 'I'
                            ELSE 'D'
                        END as tipo,
                        tr.lectura_anterior,
                        tr.recarga,
                        tr.lectura_actual
                    FROM gas_station_closeouts c
                    JOIN gas_station_closeout_tank_readings tr ON tr.closeout_id = c.id
                    LEFT JOIN gas_station_tanks t ON tr.tank_id = t.id
                    WHERE c.fecha_turno BETWEEN ? AND ? AND c.estado = 'cerrado'
                    ORDER BY c.fecha_turno ASC, c.numero_turno ASC, tr.id ASC
                `;
                const [tankRows] = await withRetry(() => accountingDb.query(sqlTanques, [desde, hasta]));

                const groups = {};
                (tankRows || []).forEach(r => {
                    const normBranch = normalizeSaasBranchId(r.branch_id);
                    const key = `${normBranch}_${r.tipo}_${r.tank_code || r.tank_id}`;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push({ ...r, branch_id: normBranch });
                });

                const stationFuelTotals = {};
                for (const [key, rows] of Object.entries(groups)) { // eslint-disable-line no-unused-vars
                    const first = rows[0];
                    const last = rows[rows.length - 1];
                    const bId = first.branch_id;
                    const tipo = first.tipo;
                    const tankKey = `${bId}_${tipo}`;
                    if (!stationFuelTotals[tankKey]) {
                        stationFuelTotals[tankKey] = {
                            branch_id: bId,
                            tipo,
                            inicial: 0,
                            recargas: 0,
                            final: 0
                        };
                    }
                    stationFuelTotals[tankKey].inicial += Number(first.lectura_anterior || 0);
                    stationFuelTotals[tankKey].final += Number(last.lectura_actual || 0);
                    stationFuelTotals[tankKey].recargas += rows.reduce((acc, curr) => acc + Number(curr.recarga || 0), 0);
                }

                const finalResults = [];
                OFFICIAL_ESTACIONES.forEach(st => {
                    ['D', 'R', 'S', 'I'].forEach(tipo => {
                        const tankKey = `${st.branch_id}_${tipo}`;
                        const tData = stationFuelTotals[tankKey] || { inicial: 0, recargas: 0, final: 0 };
                        const vRows = (ventasRows || []).filter(v => normalizeSaasBranchId(v.branch_id) === st.branch_id && v.tipo === tipo);
                        const venta = vRows.reduce((sum, r) => sum + Number(r?.venta || 0), 0);

                        if (tData.inicial === 0 && tData.final === 0 && venta === 0) return;

                        const inicial = Math.round(tData.inicial * 100) / 100;
                        const recargas = Math.round(tData.recargas * 100) / 100;
                        const vFinal = Math.round(tData.final * 100) / 100;
                        const vRound = Math.round(venta * 100) / 100;
                        const suma = Math.round((inicial + recargas - vRound) * 100) / 100;
                        const diferencia = Math.round((vFinal - suma) * 100) / 100;

                        finalResults.push({
                            empresa: st.titulo,
                            combustible: tipo,
                            inicial,
                            recargas,
                            venta: vRound,
                            final: vFinal,
                            suma,
                            diferencia
                        });
                    });
                });

                return res.json(finalResults);
            }
        }

        const externalDb = await getExternalDb();
        if (!externalDb) return res.json([]);
        const datesArray = [];
        const iter = new Date(curr);
        while (iter <= endDate && datesArray.length < 366) {
            const day = String(iter.getDate()).padStart(2, '0');
            const month = String(iter.getMonth() + 1).padStart(2, '0');
            const year = iter.getFullYear();
            datesArray.push(`${day}/${month}/${year}`);
            iter.setDate(iter.getDate() + 1);
        }
        if (datesArray.length === 0) {
            return res.json([]);
        }
        const sql1 = `select x.id_empresa, a.titulo as estacion, z.clasificacion as tipo, 0.0 as inicial, 0.0 as recargas, sum(y.total) as venta, 0.0 as final, 0.0 as suma, 0.0 as diferencia from cierre_turno x inner join cierre_turno_lecturas y on x.id_empresa = y.id_empresa and x.id = y.id_cierre_turno inner join cfg_combustibles z on y.id_empresa = z.id_empresa and y.id_producto = z.id_producto inner join web_consolidado a on x.id_empresa = a.id_empresa where x.fecha_turno IN (?) and a.grupo = 'ESTACION' group by x.id_empresa, a.titulo, z.clasificacion, a.orden order by a.orden, z.clasificacion`;
        const [dt_result] = await withRetry(() => externalDb.query(sql1, [datesArray]));
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
        const [dt_movi] = await withRetry(() => externalDb.query(sql2, [desde, hasta]));
        res.json((dt_result || []).map(fila => {
            let inicial = 0.0, final = 0.0; const FindRow = (dt_movi || []).filter(m => String(m.id_empresa) === String(fila.id_empresa) && String(m.tipo_combustible) === String(fila.tipo));
            if (FindRow.length > 0) { inicial = Number(FindRow[0].anterior) || 0.0; final = Number(FindRow[FindRow.length - 1].lectura) || 0.0; }
            const recargas = FindRow.reduce((sum, current) => sum + (Number(current.recarga) || 0), 0);
            const suma = inicial + recargas - Number(fila.venta);
            return {
                empresa: fila.estacion,
                combustible: fila.tipo,
                inicial,
                recargas,
                venta: Number(fila.venta),
                final,
                suma,
                diferencia: final - suma
            };
        }));
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar diferencias de combustible');
    }
});

registerConsultasCompetenciaRoutes(router, {
    getPreciosEstacionData
});

const saldosConsultasPerms = [
    ...genericConsultasPerms,
    '/dashboard/consultas/saldos-bancos',
    '/dashboard/consultas/saldos-chequera',
    '/dashboard/bancos/cuentas',
    '/dashboard/bancos/conciliacion',
    '/dashboard/bancos/cheques',
    'manage_cuentas',
    'manage_conciliacion_bancaria',
    'view_conciliacion_bancaria',
    'manage_cheques'
];

function diffCalendarDaysYmd(fromYmd, toYmd) {
    const a = parseStrictDBDate(fromYmd);
    const b = parseStrictDBDate(toYmd);
    if (!a || !b) return null;
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    const msA = Date.UTC(ay, am - 1, ad);
    const msB = Date.UTC(by, bm - 1, bd);
    return Math.max(0, Math.floor((msB - msA) / 86400000));
}

router.get('/consultas/:type', authenticateToken, requirePermission(saldosConsultasPerms), async (req, res) => {
    const { type } = req.params;
    if (!['saldos-bancos', 'saldos-chequera', 'antiguedad-cheques'].includes(type)) {
        return res.status(404).json({ message: 'Consulta no encontrada' });
    }

    const rawFechaCorte = req.query.fecha_corte;
    const fechaCorte = rawFechaCorte ? parseStrictDBDate(rawFechaCorte) : getElSalvadorTodayYMD();
    if (rawFechaCorte && !fechaCorte) {
        return res.status(400).json({ message: 'La fecha de corte no es válida. Use formato YYYY-MM-DD.' });
    }

    const empresaParam = req.query.empresa_id || req.query.id_empresa || req.query.empresa || null;
    const bancoParam = req.query.banco_id || req.query.cod_banco || null;
    const cuentaParam = req.query.cuenta_bancaria_id ? parseInt(req.query.cuenta_bancaria_id, 10) : null;
    if (req.query.cuenta_bancaria_id && (!Number.isInteger(cuentaParam) || cuentaParam <= 0)) {
        return res.status(400).json({ message: 'cuenta_bancaria_id inválido.' });
    }
    const incluirInactivas = req.query.incluir_inactivas === 'true' || req.query.incluir_inactivas === '1';
    const comparativoSolicitado = req.query.comparativo === 'true' || req.query.comparativo === '1';

    try {
        const db = getDb();
        let whereSql = 'WHERE 1=1 ';
        const params = [];

        if (!incluirInactivas) {
            whereSql += ' AND cb.activa = TRUE';
        }
        if (empresaParam) {
            whereSql += ' AND (e.id = ? OR e.codigo = ?)';
            params.push(empresaParam, empresaParam);
        }
        if (bancoParam) {
            whereSql += ' AND (b.id = ? OR b.codigo = ?)';
            params.push(bancoParam, bancoParam);
        }
        if (cuentaParam) {
            whereSql += ' AND cb.id = ?';
            params.push(cuentaParam);
        }

        const [accountRows] = await db.query(
            `SELECT cb.id, cb.empresa_id, cb.banco_id, cb.tipo_cuenta_id, cb.numero, cb.nombre, cb.cod_cta,
                    cb.activa, cb.orden, cb.saldo_inicial, cb.fecha_saldo_inicial,
                    COALESCE(e.codigo, '') AS empresa_codigo,
                    COALESCE(e.nombre, '') AS empresa_nombre,
                    COALESCE(b.codigo, '') AS banco_codigo,
                    COALESCE(b.descripcion, 'Banco') AS banco_nombre,
                    COALESCE(tcb.descripcion, '') AS tipo_cuenta_nombre
             FROM cuentas_bancarias cb
             LEFT JOIN empresas e ON cb.empresa_id = e.id
             LEFT JOIN bancos b ON cb.banco_id = b.id
             LEFT JOIN tipos_cuenta_bancaria tcb ON cb.tipo_cuenta_id = tcb.id
             ${whereSql}
             ORDER BY b.descripcion ASC, cb.numero ASC`,
            params
        );

        const accountsList = Array.isArray(accountRows) ? accountRows : [];
        const cuentaIds = accountsList.map(c => Number(c.id)).filter(Boolean);

        // 1. Últimas validaciones por cuenta
        const latestValByCuenta = new Map();
        if (cuentaIds.length > 0) {
            try {
                const [valRows] = await db.query(
                    `SELECT id, cuenta_bancaria_id, fecha_validacion, fecha_corte, monto_banco,
                            saldo_chequera, saldo_conciliado_libros, diferencia, notas
                     FROM validaciones_saldo_banco
                     WHERE cuenta_bancaria_id IN (?)
                     ORDER BY fecha_validacion DESC, id DESC`,
                    [cuentaIds]
                );
                for (const vr of (valRows || [])) {
                    const cid = Number(vr.cuenta_bancaria_id);
                    if (!latestValByCuenta.has(cid)) {
                        latestValByCuenta.set(cid, vr);
                    }
                }
            } catch (errVal) {
                if (!errVal || (errVal.code !== 'ER_NO_SUCH_TABLE' && errVal.errno !== 1146)) {
                    console.warn('[ConsultasSaldos] Warning validaciones_saldo_banco:', errVal.message);
                }
            }
        }

        // 2. Estado de períodos de conciliación por cuenta
        const periodsByCuenta = new Map();
        if (cuentaIds.length > 0) {
            try {
                const [perRows] = await db.query(
                    `SELECT id, cuenta_bancaria_id, fecha_corte, estado, cerrado_por_nombre, cerrado_at,
                            reabierto_por_nombre, reabierto_at
                     FROM conciliacion_periodos
                     WHERE cuenta_bancaria_id IN (?)
                     ORDER BY fecha_corte DESC, id DESC`,
                    [cuentaIds]
                );
                for (const pr of (perRows || [])) {
                    const cid = Number(pr.cuenta_bancaria_id);
                    if (!periodsByCuenta.has(cid)) periodsByCuenta.set(cid, []);
                    periodsByCuenta.get(cid).push(pr);
                }
            } catch (errPer) {
                if (!errPer || (errPer.code !== 'ER_NO_SUCH_TABLE' && errPer.errno !== 1146)) {
                    console.warn('[ConsultasSaldos] Warning conciliacion_periodos:', errPer.message);
                }
            }
        }

        // 3. Cheques pendientes válidos para cálculo de antigüedad (Aging)
        const pendingChecksByCuenta = new Map();
        if (cuentaIds.length > 0) {
            const [chkRows] = await db.query(
                `SELECT ch.id, ch.cuenta_bancaria_id, ch.cheque, ch.fecha, ch.fecha_aplicado,
                        ch.valor, ch.a_nombre, ch.concepto, ch.cheque_anulado, ch.fue_noemitido,
                        ch.es_reservado, ch.deleted_at
                 FROM cheques ch
                 WHERE ch.cuenta_bancaria_id IN (?)
                   AND ch.deleted_at IS NULL
                   AND ch.cheque_anulado = FALSE
                   AND ch.fue_noemitido = FALSE
                   AND ch.es_reservado = FALSE
                   AND ch.fecha <= ?
                   AND (ch.fecha_aplicado IS NULL OR ch.fecha_aplicado > ?)
                 ORDER BY ch.fecha ASC, ch.id ASC`,
                [cuentaIds, fechaCorte, fechaCorte]
            );
            for (const ch of (chkRows || [])) {
                const cid = Number(ch.cuenta_bancaria_id);
                if (!pendingChecksByCuenta.has(cid)) pendingChecksByCuenta.set(cid, []);
                pendingChecksByCuenta.get(cid).push(ch);
            }
        }

        const summaries = await Promise.all(
            accountsList.map(cb => computeAccountReconciliationSummary(db, cb.id, fechaCorte))
        );

        const allPendingChecksDetalle = [];
        const allPendingChecksRaw = [];
        const cuentasOutput = [];

        for (let i = 0; i < accountsList.length; i++) {
            const cb = accountsList[i];
            const summary = summaries[i];
            if (!summary) continue;

            const cid = Number(cb.id);
            const floorDate = cb.fecha_saldo_inicial ? parseStrictDBDate(cb.fecha_saldo_inicial) : null;

            const rawChecks = pendingChecksByCuenta.get(cid) || [];
            const accChecks = rawChecks.filter(ch => {
                if (Boolean(ch.cheque_anulado) || Boolean(ch.fue_noemitido) || Boolean(ch.es_reservado) || Boolean(ch.deleted_at)) {
                    return false;
                }
                const chFecha = parseStrictDBDate(ch.fecha);
                if (!chFecha || chFecha > fechaCorte) return false;
                if (floorDate && chFecha < floorDate) return false;
                return true;
            });

            const accAging = summarizeChecksAging(accChecks, fechaCorte);

            for (const ch of accChecks) {
                allPendingChecksRaw.push(ch);
                const agingInfo = classifyCheckAging(ch.fecha, fechaCorte);
                allPendingChecksDetalle.push({
                    id: Number(ch.id),
                    cuenta_bancaria_id: cid,
                    numero_cuenta: cb.numero || '',
                    cuenta_nombre: cb.nombre || '',
                    banco_nombre: cb.banco_nombre || '',
                    empresa_codigo: cb.empresa_codigo || '',
                    empresa_nombre: cb.empresa_nombre || '',
                    cheque: ch.cheque ? String(ch.cheque) : '',
                    a_nombre: ch.a_nombre || '',
                    concepto: ch.concepto || '',
                    fecha: parseStrictDBDate(ch.fecha),
                    valor: round2(ch.valor || 0),
                    ...agingInfo
                });
            }

            const lastVal = latestValByCuenta.get(cid) || null;
            const lastValFecha = lastVal ? parseStrictDBDate(lastVal.fecha_validacion) : null;
            const diasSinValidar = lastValFecha ? diffCalendarDaysYmd(lastValFecha, fechaCorte) : null;

            const accPeriods = periodsByCuenta.get(cid) || [];
            const closedPeriods = accPeriods.filter(p => p.estado === 'CERRADO');
            const latestClosed = closedPeriods[0] || null;
            const latestClosedDate = latestClosed ? parseStrictDBDate(latestClosed.fecha_corte) : null;
            const latestPeriod = accPeriods[0] || null;
            let estadoPeriodo = 'ABIERTO';
            if (latestClosedDate && latestClosedDate >= fechaCorte) {
                estadoPeriodo = 'CERRADO';
            } else if (latestPeriod && latestPeriod.estado === 'REABIERTO') {
                estadoPeriodo = 'REABIERTO';
            }

            cuentasOutput.push({
                id: cid,
                cuenta_bancaria_id: cid,
                empresa_id: Number(cb.empresa_id),
                empresa_codigo: cb.empresa_codigo || '',
                empresa_nombre: cb.empresa_nombre || '',
                banco_id: Number(cb.banco_id),
                banco_codigo: cb.banco_codigo || '',
                banco_nombre: cb.banco_nombre || '',
                tipo_cuenta_nombre: cb.tipo_cuenta_nombre || '',
                numero: cb.numero || '',
                num_cta: cb.numero || '',
                nombre: cb.nombre || '',
                activa: Boolean(cb.activa),
                saldo_inicial: summary.saldo_inicial,
                fecha_saldo_inicial: summary.fecha_saldo_inicial,
                saldo_chequera: summary.saldo_chequera,
                cheques_en_transito: summary.cheques_en_transito,
                cargos_en_transito: summary.cargos_en_transito,
                cargos_cheques_en_transito: summary.cargos_cheques_en_transito,
                abonos_en_transito: summary.abonos_en_transito,
                depositos_en_transito: summary.abonos_en_transito,
                saldo_conciliado_libros: summary.saldo_conciliado_libros,
                saldo: type === 'saldos-chequera' ? summary.saldo_chequera : summary.saldo_conciliado_libros,
                cheques_reservados_count: summary.cheques_reservados_count,
                cheques_reservados_monto: summary.cheques_reservados_monto,
                estado_periodo: estadoPeriodo,
                periodo_cerrado_hasta: latestClosedDate,
                ultima_validacion: lastVal ? {
                    id: Number(lastVal.id),
                    fecha_validacion: lastValFecha,
                    fecha_corte: lastVal.fecha_corte ? parseStrictDBDate(lastVal.fecha_corte) : null,
                    monto_banco: round2(lastVal.monto_banco || 0),
                    diferencia: round2(lastVal.diferencia || 0),
                    notas: lastVal.notas || null
                } : null,
                ultima_validacion_fecha: lastValFecha,
                dias_sin_validar: diasSinValidar,
                aging: accAging
            });
        }

        allPendingChecksDetalle.sort((a, b) => (b.dias_circulacion || 0) - (a.dias_circulacion || 0) || String(a.fecha || '').localeCompare(String(b.fecha || '')));

        const totales = cuentasOutput.reduce((acc, row) => ({
            cuentas_count: acc.cuentas_count + 1,
            saldo_inicial: round2(acc.saldo_inicial + row.saldo_inicial),
            saldo_chequera: round2(acc.saldo_chequera + row.saldo_chequera),
            cheques_en_transito: round2(acc.cheques_en_transito + row.cheques_en_transito),
            cargos_en_transito: round2(acc.cargos_en_transito + row.cargos_en_transito),
            cargos_cheques_en_transito: round2(acc.cargos_cheques_en_transito + row.cargos_cheques_en_transito),
            abonos_en_transito: round2(acc.abonos_en_transito + row.abonos_en_transito),
            depositos_en_transito: round2(acc.depositos_en_transito + row.depositos_en_transito),
            saldo_conciliado_libros: round2(acc.saldo_conciliado_libros + row.saldo_conciliado_libros),
            cheques_pendientes_count: acc.cheques_pendientes_count + (row.aging?.total_cheques || 0),
            cheques_pendientes_monto: round2(acc.cheques_pendientes_monto + (row.aging?.total_monto || 0)),
            por_caducar_count: acc.por_caducar_count + (row.aging?.por_caducar_count || 0),
            por_caducar_monto: round2(acc.por_caducar_monto + (row.aging?.por_caducar_monto || 0)),
            caducos_count: acc.caducos_count + (row.aging?.caducos_count || 0),
            caducos_monto: round2(acc.caducos_monto + (row.aging?.caducos_monto || 0))
        }), {
            cuentas_count: 0,
            saldo_inicial: 0,
            saldo_chequera: 0,
            cheques_en_transito: 0,
            cargos_en_transito: 0,
            cargos_cheques_en_transito: 0,
            abonos_en_transito: 0,
            depositos_en_transito: 0,
            saldo_conciliado_libros: 0,
            cheques_pendientes_count: 0,
            cheques_pendientes_monto: 0,
            por_caducar_count: 0,
            por_caducar_monto: 0,
            caducos_count: 0,
            caducos_monto: 0
        });

        const agingResumen = summarizeChecksAging(allPendingChecksRaw, fechaCorte);

        let comparativo = {
            solicitado: false,
            disponible: false,
            fuente: null,
            error: null,
            filas: []
        };

        if (comparativoSolicitado && type !== 'antiguedad-cheques') {
            const spName = type === 'saldos-bancos' ? 'sp_saldo_en_bancos' : 'sp_saldo_en_chequera';
            try {
                const externalDb = await getExternalDb();
                if (!externalDb || typeof externalDb.query !== 'function') {
                    throw new Error('Base de datos externa no disponible');
                }
                const [spResults] = await externalDb.query(`CALL ${spName}(?)`, [fechaCorte]);
                const spRows = Array.isArray(spResults?.[0]) ? spResults[0] : (Array.isArray(spResults) ? spResults : []);

                const spByDigits = new Map();
                const filas = spRows.map(r => {
                    const numCta = String(r.num_cta || r.numero || r.cuenta || '').trim();
                    const digits = numCta.replace(/\D/g, '');
                    const saldoSp = round2(r.new_saldo ?? r.saldo_chequera ?? r.saldo ?? r.saldo_actual ?? r.monto ?? 0);
                    const rowObj = {
                        num_cta: numCta,
                        nom_banco: r.nom_banco || r.banco || '',
                        saldo: saldoSp
                    };
                    if (digits) spByDigits.set(digits, rowObj);
                    return rowObj;
                });

                for (const cRow of cuentasOutput) {
                    const cDigits = String(cRow.numero || '').replace(/\D/g, '');
                    const matchedSp = cDigits ? spByDigits.get(cDigits) : null;
                    if (matchedSp) {
                        const nativeVal = type === 'saldos-chequera' ? cRow.saldo_chequera : cRow.saldo_conciliado_libros;
                        cRow.comparativo_sp = {
                            num_cta: matchedSp.num_cta,
                            nom_banco: matchedSp.nom_banco,
                            saldo_sp: matchedSp.saldo,
                            diferencia_vs_sp: round2(nativeVal - matchedSp.saldo)
                        };
                    } else {
                        cRow.comparativo_sp = null;
                    }
                }

                comparativo = {
                    solicitado: true,
                    disponible: true,
                    fuente: spName,
                    error: null,
                    total_sp: round2(filas.reduce((s, r) => s + Number(r.saldo || 0), 0)),
                    filas
                };
            } catch (compErr) {
                comparativo = {
                    solicitado: true,
                    disponible: false,
                    fuente: null,
                    error: compErr?.message || 'Error consultando base externa',
                    filas: []
                };
            }
        }

        res.json({
            tipo: type,
            fecha_corte: fechaCorte,
            fuente: 'db_sipe_admin',
            cuentas: cuentasOutput,
            totales,
            aging_resumen: agingResumen,
            cheques_pendientes_detalle: allPendingChecksDetalle,
            comparativo
        });
    } catch (error) {
        sendSafeError(res, error, 'Error al ejecutar consulta');
    }
});

router.isGenericDescription = isGenericDescription;
router.generarAnalisisDescuadre = generarAnalisisDescuadre;
router.getTurnosPorEmpresa = getTurnosPorEmpresa;
router.mapCierreRowConExplicacion = mapCierreRowConExplicacion;
router.getConsolidadoVentasData = getConsolidadoVentasData;
router.getPreciosEstacionData = getPreciosEstacionData;

module.exports = router;


