const express = require('express');
const router = express.Router();
const { getDb, getExternalDb, getAccountingDb, withRetry } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { sendSafeError } = require('../utils/errorHandler');
const { GoogleGenAI } = require('@google/genai');

const ventasViewPerms = [
    'view_ventas',
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/consultas/estaciones/resumen-cierre',
    '/dashboard/estrategia/torre-control',
    '/dashboard/estrategia/combustible',
    '/dashboard/operaciones/pedidos',
    '/dashboard/finanzas/resumen'
];

const fletesViewPerms = [
    'manage_pedidos',
    'view_ventas',
    '/dashboard/operaciones/pedidos',
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/estrategia/combustible'
];

const lubricantesViewPerms = [
    '/dashboard/consultas/estaciones/lubricantes',
    '/dashboard/estrategia/torre-control'
];

const cierreViewPerms = [
    '/dashboard/consultas/estaciones/resumen-cierre',
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/estrategia/torre-control'
];

const preciosEstacionViewPerms = [
    '/dashboard/consultas/estaciones/precios',
    '/dashboard/consultas/estaciones/precios-competencia',
    '/dashboard/estrategia/combustible',
    '/dashboard/estrategia/torre-control'
];

const cumpleanosViewPerms = [
    '/dashboard/consultas/otras/cumpleanos',
    '/dashboard/rrhh/planillas'
];

const diferenciasViewPerms = [
    '/dashboard/consultas/estaciones/diferencias-combustible',
    '/dashboard/estrategia/mermas',
    '/dashboard/estrategia/torre-control'
];

const preciosCompetenciaViewPerms = [
    'manage_precios_competencia',
    '/dashboard/consultas/estaciones/precios-competencia',
    '/dashboard/consultas/estaciones/precios',
    '/dashboard/estrategia/combustible'
];

const genericConsultasPerms = [
    '/dashboard/consultas/otras/backup-db-check',
    '/dashboard/consultas/estaciones/ventas',
    '/dashboard/consultas/estaciones/resumen-cierre',
    '/dashboard/estrategia/torre-control',
    '/dashboard/bancos/reportes/saldos-bancos',
    '/dashboard/bancos/reportes/saldos-chequera'
];

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
    const cleanId = String(id || '');
    const upper = (defaultTitulo || '').toUpperCase();
    if (upper.includes('MIRAFLORES') || ((cleanId === '002' || cleanId === '4') && (upper.includes('E-MARKET') || upper === '002' || !upper))) return 'E-Market Miraflores';
    if (upper.includes('CHALCHUAPA') || ((cleanId === '006' || cleanId === '3') && (upper.includes('E-MARKET') || upper === '006' || !upper))) return 'E-Market Chalchuapa';
    if (upper.includes('COSTA') || ((cleanId === '008' || cleanId === '8') && (upper.includes('SUPER') || upper === '008' || !upper))) return 'Super 7 Costa';
    if (upper.includes('SAN MARTIN') || upper.includes('LA LOMA') || ((cleanId === '014' || cleanId === '1') && (upper.includes('E-MARKET') || upper === '014' || !upper))) return 'E-Market San Martin';
    if (upper.includes('PEDREGAL') || ((cleanId === '009' || cleanId === '6') && (upper.includes('SUPER') || upper === '009' || !upper))) return 'Super El Pedregal';
    return defaultTitulo || `Tienda ${cleanId}`;
};

const saasBranchMap = {
    '014': 1, // San Martin -> Puma San Martin II
    '006': 3, // Chalchuapa -> Shell Chalchuapa
    '009': 6, // El Pedregal -> Super El Pedregal
    '002': 4, // Miraflores -> Puma Miraflores
    '008': 8, // Costa del Sol -> Puma Costa del Sol
    'E-1': 8, // Costa del Sol alias
    '015': 2  // Shell 14 Avenida
};

const branchToEmpId = {
    1: '014',
    2: '015',
    3: '006',
    4: '002',
    8: '008',
    6: '009'
};

const OFFICIAL_ESTACIONES = [
    { id_empresa: '002', branch_id: 4, saas_branch_id: 4, titulo: 'Puma Miraflores', orden: 1 },
    { id_empresa: '006', branch_id: 3, saas_branch_id: 3, titulo: 'Shell Chalchuapa', orden: 2 },
    { id_empresa: '008', branch_id: 8, saas_branch_id: 8, titulo: 'Puma Costa del Sol', orden: 3 },
    { id_empresa: '014', branch_id: 1, saas_branch_id: 1, titulo: 'Puma La Loma (San Martín)', orden: 4 },
    { id_empresa: '015', branch_id: 2, saas_branch_id: 2, titulo: 'Shell 14 Avenida', orden: 5 }
];

// Tokens y conceptos genéricos para auditoría de movimientos sin descripción suficiente
const GENERIC_TOKENS = new Set([
    'gasto', 'gastos', 'varios', 'otro', 'otros', 'caja', 'ajuste', 'pendiente',
    'compra', 'vale', 'pago', 'cajero', 'general', 'operativo', 'tienda', 'super',
    'sin concepto', 'ninguno', 'na', 'n/a', 'x', '-', '.', '..', '...', 'cierre',
    'saldo', 'fondo', 's/n', 'sn', 'vale provisional', 'diferencia', 'descuadre'
]);

const isGenericDescription = (desc) => {
    if (!desc) return true;
    const clean = String(desc).trim().toLowerCase();
    if (clean.length < 4) return true;
    if (GENERIC_TOKENS.has(clean)) return true;
    const words = clean.replace(/[^a-z0-9áéíóúüñ]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    if (words.length <= 2 && words.every(w => GENERIC_TOKENS.has(w))) return true;
    return false;
};

const formatYMD = (val) => {
    if (!val) return '';
    if (val instanceof Date) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(val).trim();
    return s.split('T')[0].split(' ')[0];
};

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
                    (SELECT IFNULL(SUM(ad.monto), 0.0) FROM gas_station_closeout_adelantos ad WHERE ad.closeout_id = c.id) as anticipos,
                    (SELECT IFNULL(SUM(l.total), 0.0) FROM gas_station_closeout_lubricant_readings l WHERE l.closeout_id = c.id) as lubricantes
                FROM gas_station_closeouts c
                WHERE c.fecha_turno = ? AND c.estado = 'cerrado'
                ORDER BY c.branch_id, c.numero_turno
            `;
            const [shiftRows] = await withRetry(() => accountingDb.query(sqlTurnosSaas, [dateIso]));
            if (shiftRows && shiftRows.length > 0) {
                shiftRows.forEach(sh => {
                    const empId = branchToEmpId[sh.branch_id] || String(sh.branch_id).padStart(3, '0');
                    if (!turnosPorEmpresa[empId]) turnosPorEmpresa[empId] = [];
                    const vta = Math.round(Number(sh.venta || 0) * 100) / 100;
                    const rem = Math.round(Number(sh.remesas || 0) * 100) / 100;
                    const tarj = Math.round(Number(sh.tarjetas || 0) * 100) / 100;
                    const gst = Math.round(Number(sh.gastos || 0) * 100) / 100;
                    const pag = 0;
                    const desc = Math.round(Number(sh.descuentos || 0) * 100) / 100;
                    const cup = Math.round(Number(sh.cupones || 0) * 100) / 100;
                    const cred = Math.round(Number(sh.creditos || 0) * 100) / 100;
                    const chq = 0;
                    const ant = Math.round(Number(sh.anticipos || 0) * 100) / 100;
                    const sumaTurno = Math.round((rem + tarj + gst + pag + desc + cup + cred + chq + ant) * 100) / 100;
                    const difTurno = Math.round((sumaTurno - vta) * 100) / 100;

                    turnosPorEmpresa[empId].push({
                        id: sh.id,
                        turno: Number(sh.turno) || 1,
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
    const monto = Number(r.creditos) + Number(r.cupones) + Number(r.cheques) + Number(r.tarjetas) + Number(r.remesas) + Number(r.gastos) + Number(r.anticipos) + Number(r.pagos) + Number(r.descuentos);
    const venta = Number(r.total_venta) + Number(r.lubricantes);
    const diferencia = Math.round((monto - venta) * 100) / 100;
    const gastos = Math.round(Number(r.gastos) * 100) / 100;
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

    const noEfectivo = Math.round(((Number(r.tarjetas || 0)) + (Number(r.cupones || 0)) + (Number(r.cheques || 0)) + (Number(r.creditos || 0))) * 100) / 100;
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
        credito: Math.round(Number(r.creditos || 0) * 100) / 100
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
        credito: Math.round(Number(r.creditos) * 100) / 100,
        cupones: Math.round(Number(r.cupones) * 100) / 100,
        cheques: Math.round(Number(r.cheques) * 100) / 100,
        tarjetas: Math.round(Number(r.tarjetas) * 100) / 100,
        remesas: Math.round(Number(r.remesas) * 100) / 100,
        gastos,
        lubricantes: Math.round(Number(r.lubricantes) * 100) / 100,
        anticipos: Math.round(Number(r.anticipos) * 100) / 100,
        pagos: Math.round(Number(r.pagos) * 100) / 100,
        descuentos: Math.round(Number(r.descuentos) * 100) / 100,
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
                       s.total_sales, s.total_incomes, s.card_sales, s.total_remesas, s.total_expenses,
                       s.actual_cash, s.difference, s.shift_number,
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
                b.shift_ids.push(sh.id);
                if (sh.shift_number) b.shift_numbers.add(sh.shift_number);
                if (sh.seller_nombre) b.sellers.add(sh.seller_nombre);
                b.venta += Number(sh.total_sales || 0);
                b.ingresos += Number(sh.total_incomes || 0);
                b.tarjeta += Number(sh.card_sales || 0);
                b.remesado += Number(sh.total_remesas || 0);
                b.gastos += Number(sh.total_expenses || 0);
                b.saldo_f += Number(sh.actual_cash || 0);
                b.dif += Number(sh.difference || 0);
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
                            saasByBranch[bId].tarjeta = branchRemTotals[bId].tarjeta;
                            saasByBranch[bId].remesado = branchRemTotals[bId].remesado;
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
router.get('/ventas/consolidado/:date', authenticateToken, requirePermission(ventasViewPerms), async (req, res) => {
    const { date } = req.params;
    try {
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
                saasEstMap[r.branch_id] = r;
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
                saasMargenMap[r.branch_id] = r;
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

            // 3. Inventario de tanques (último turno cerrado) y promedios 7 días cerrados
            const cDesde7d = new Date(date + 'T12:00:00');
            cDesde7d.setDate(cDesde7d.getDate() - 6);
            const dateDesde7d = cDesde7d.toISOString().split('T')[0];

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
                            WHEN r.descripcion_producto LIKE '%REGULAR%' THEN 'R'
                            WHEN r.descripcion_producto LIKE '%SUPER%' THEN 'S'
                            WHEN r.descripcion_producto LIKE '%ION%' THEN 'I'
                            ELSE 'D'
                        END as tipo_combustible,
                        SUM(r.diferencia) as total_7d
                    FROM gas_station_closeouts c
                    JOIN gas_station_closeout_readings r ON r.closeout_id = c.id
                    WHERE c.fecha_turno BETWEEN ? AND ? AND c.estado = 'cerrado'
                    GROUP BY c.branch_id, tipo_combustible
                `, [dateDesde7d, date]))
            ]);

            const tankList = saasTankRows[0] || [];
            const promedios7d = saas7dRows[0] || [];

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

                const getProm = (tipo) => {
                    const row = promedios7d.find(p => p.branch_id === bId && p.tipo_combustible === tipo);
                    return (Number(row?.total_7d || 0) / 7);
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
                    0.0 as cheques,
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
            (saasCierreRows || []).forEach(r => {
                saasCierreMap[r.branch_id] = r;
            });

            resumenCierreLocal = OFFICIAL_ESTACIONES.map(st => {
                const raw = saasCierreMap[st.branch_id] || {
                    creditos: 0,
                    cupones: 0,
                    cheques: 0,
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

        res.json({
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
        });
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
        `, [periodo_inicio, periodo_fin, Number(precio_diesel || 0), Number(precio_regular || 0), Number(precio_super || 0), Number(precio_ion || 0), activo ? 1 : 1]);

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
                        IFNULL(AVG(s.total_sales), 0.0) as promedio_diario
                    FROM branches b
                    JOIN pos_shifts s ON b.id = s.branch_id
                    JOIN points_of_sale p ON s.pos_id = p.id
                    WHERE s.status = 'closed' 
                      AND s.shift_date BETWEEN ? AND ?
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
                                IFNULL(AVG(sh.total), 0.0) as promedio_diario
                            FROM branches b
                            JOIN sales_headers sh ON b.id = sh.branch_id
                            WHERE sh.fecha_emision BETWEEN ? AND ?
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

                const estacionesLocal = saasEstRows.map(row => {
                    const matchedOfficial = OFFICIAL_ESTACIONES.find(st => st.branch_id === Number(row.id_empresa) || String(st.id_empresa) === String(row.id_empresa));
                    const cleanName = getCleanStationName(String(row.id_empresa), row.empresa) || (matchedOfficial ? matchedOfficial.titulo : row.empresa);
                    return {
                        id_empresa: String(matchedOfficial ? matchedOfficial.id_empresa : row.id_empresa),
                        empresa: cleanName,
                        diesel: Math.round(Number(row.diesel || 0) * 100) / 100,
                        regular: Math.round(Number(row.regular || 0) * 100) / 100,
                        super: Math.round(Number(row.super || 0) * 100) / 100,
                        ion: Math.round(Number(row.ion || 0) * 100) / 100,
                        galonaje: Math.round(Number(row.galonaje || 0) * 100) / 100,
                        venta: Math.round(Number(row.venta_estacion || 0) * 100) / 100
                    };
                });

                const tiendasLocal = (saasTiendasRows || []).map(row => {
                    const empId = branchToEmpId[row.id_empresa] || String(row.id_empresa);
                    const storeName = getCleanTiendaName(empId, row.empresa) || row.empresa;
                    return {
                        id_empresa: empId,
                        empresa: storeName,
                        venta: Math.round(Number(row.venta || 0) * 100) / 100,
                        dias_con_venta: Number(row.dias_con_venta || 0),
                        promedio_diario: Math.round(Number(row.promedio_diario || 0) * 100) / 100
                    };
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
            }
        } catch {
            /* ignore */
        }
    }

    // Helper para consultar datos de combustible por año (SaaS cerrado con fallback a legado)
    const getFuelRowsForYear = async (targetYearStr) => {
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
                    return (saasRows || []).map(r => ({
                        anio: String(r.anio),
                        mes: Number(r.mes),
                        id_empresa: branchToEmpId[r.branch_id] || String(r.branch_id),
                        diesel: Number(r.diesel || 0),
                        regular: Number(r.regular || 0),
                        super: Number(r.super || 0),
                        ion: Number(r.ion || 0),
                        galonaje: Number(r.galonaje || 0),
                        venta_estacion: Number(r.venta_estacion || 0)
                    }));
                }
            } catch (errSaasFuel) {
                console.warn(`[Comparativo Anual] Error consultando SaaS combustible para ${targetYearStr}:`, errSaasFuel.message);
            }
        }

        // Fallback a db_system_rrs
        if (!externalDb || typeof externalDb.query !== 'function') return [];
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
        return (legRows || []).map(r => ({
            anio: String(r.anio),
            mes: Number(r.mes),
            id_empresa: String(r.id_empresa),
            diesel: Number(r.diesel || 0),
            regular: Number(r.regular || 0),
            super: Number(r.super || 0),
            ion: Number(r.ion || 0),
            galonaje: Number(r.galonaje || 0),
            venta_estacion: Number(r.venta_estacion || 0)
        }));
    };

    // Helper para consultar datos de tienda por año (SaaS cerrado con fallback a legado)
    const getStoreRowsForYear = async (targetYearNum) => {
        const targetYearStr = String(targetYearNum);
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
                    return (saasRows || []).map(r => ({
                        anio: String(r.anio),
                        mes: Number(r.mes),
                        id_empresa: branchToEmpId[r.branch_id] || String(r.branch_id),
                        venta_tienda: Number(r.venta_tienda || 0)
                    }));
                }
            } catch (errSaasStore) {
                console.warn(`[Comparativo Anual] Error consultando SaaS tienda para ${targetYearStr}:`, errSaasStore.message);
            }
        }

        // Fallback a db_system_rrs
        if (!externalDb || typeof externalDb.query !== 'function') return [];
        const sqlLegacy = `
            SELECT 
                CAST(YEAR(fecha) AS CHAR) as anio,
                MONTH(fecha) as mes,
                id_empresa,
                IFNULL(SUM(monto), 0.0) as venta_tienda
            FROM ventas_tienda
            WHERE YEAR(fecha) = ? AND id_empresa != '004'
            GROUP BY anio, mes, id_empresa
            ORDER BY anio, mes, id_empresa
        `;
        const [legRows] = await withRetry(() => externalDb.query(sqlLegacy, [targetYearNum]));
        return (legRows || []).map(r => ({
            anio: String(r.anio),
            mes: Number(r.mes),
            id_empresa: String(r.id_empresa),
            venta_tienda: Number(r.venta_tienda || 0)
        }));
    };

    const [fuelPrincipal, fuelComparar, storePrincipal, storeComparar] = await Promise.all([
        getFuelRowsForYear(strPrincipal),
        getFuelRowsForYear(strComparar),
        getStoreRowsForYear(anioPrincipal),
        getStoreRowsForYear(anioComparar)
    ]);

    const fuelRows = [...fuelPrincipal, ...fuelComparar];
    const tiendaRows = [...storePrincipal, ...storeComparar];

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
                (saasRows || []).forEach(r => { saasMap[r.branch_id] = r; });
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
                        0.0 as cheques,
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
                (saasCierreRows || []).forEach(r => {
                    saasCierreMap[r.branch_id] = r;
                });

                const resumenCierreLocal = OFFICIAL_ESTACIONES.map(st => {
                    const raw = saasCierreMap[st.branch_id] || {
                        creditos: 0,
                        cupones: 0,
                        cheques: 0,
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
                SELECT s.id, s.shift_number, s.total_sales, s.total_incomes, s.card_sales,
                       s.total_remesas, s.total_expenses, s.actual_cash, s.difference,
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
            const totalDif = (shifts || []).reduce((acc, s) => acc + Number(s.difference || 0), 0);

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

            // Si pos_shift_remesas no tuvo tarjetas explícitas, usar el card_sales de pos_shifts
            if (totalTarjetas === 0 && (shifts || []).some(s => Number(s.card_sales || 0) > 0)) {
                totalTarjetas = (shifts || []).reduce((acc, s) => acc + Number(s.card_sales || 0), 0);
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
        let saasHasClosedShifts = false;
        let accountingDb = null;
        if (saasBranchId) {
            try {
                accountingDb = await getAccountingDb();
                if (accountingDb) {
                    const [chk] = await withRetry(() => accountingDb.query(
                        "SELECT COUNT(*) as count FROM gas_station_closeouts WHERE branch_id = ? AND fecha_turno = ? AND estado = 'cerrado'",
                        [saasBranchId, date]
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY g.id
                    `, [saasBranchId, date]));
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY t.id
                    `, [saasBranchId, date]));
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY r.id
                    `, [saasBranchId, date]));
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY cr.id
                    `, [saasBranchId, date]));
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                          AND (l.lectura_inicial > 0 OR l.ventas > 0 OR l.recarga > 0)
                        ORDER BY l.producto_descripcion
                    `, [saasBranchId, date]));
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY c.numero_turno, r.descripcion_producto
                    `, [saasBranchId, date]));
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY cp.id
                    `, [saasBranchId, date]));
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY a.id
                    `, [saasBranchId, date]));
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
                        WHERE c.branch_id = ? AND c.fecha_turno = ? AND c.estado = 'cerrado'
                        ORDER BY d.id
                    `, [saasBranchId, date]));
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

                case 'cheques':
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
            (saasPreciosRows || []).forEach(r => { saasPreciosMap[r.branch_id] = r; });
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
                    ORDER BY c.branch_id, tipo, c.fecha_turno ASC, c.numero_turno ASC, tr.id ASC
                `;
                const [tankRows] = await withRetry(() => accountingDb.query(sqlTanques, [desde, hasta]));

                const groups = {};
                (tankRows || []).forEach(r => {
                    const key = `${r.branch_id}_${r.tipo}_${r.tank_id}`;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(r);
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
                        const vRow = (ventasRows || []).find(v => v.branch_id === st.branch_id && v.tipo === tipo);
                        const venta = Number(vRow?.venta || 0);

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

router.get('/consultas/estaciones/precios-competencia', authenticateToken, requirePermission(preciosCompetenciaViewPerms), async (req, res) => {
    try {
        const localDb = await getDb();
        const query = `SELECT c.titulo, a.estacion, a.modificacion, a.super_c, a.regular_c, a.ion_c, a.diesel_c, a.super_a, a.regular_a, a.ion_a, a.diesel_a, IFNULL(b.es_propia, 0) as es_propia FROM web_precios_competencia a INNER JOIN web_estaciones_competencia b ON a.estacion = b.competencia INNER JOIN web_consolidado c ON b.id_estacion = c.id_empresa AND c.grupo = 'ESTACION' ORDER BY c.titulo, b.es_propia DESC, a.estacion`;
        const [rows] = await withRetry(() => localDb.query(query));
        const [meta] = await withRetry(() => localDb.query('SELECT MAX(created_at) as ultima_validacion FROM web_precios_competencia_historial'));
        res.json({
            data: rows,
            ultimaValidacion: meta[0]?.ultima_validacion || null,
            total: rows.length
        });
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar precios de competencia'); 
    }
});

router.get('/consultas/estaciones/precios-competencia/estaciones', authenticateToken, requirePermission(preciosCompetenciaViewPerms), async (req, res) => {
    try {
        const localDb = await getDb();
        const [rows] = await withRetry(() => localDb.query('SELECT id, competencia, id_estacion, IFNULL(es_propia, 0) as es_propia FROM web_estaciones_competencia'));
        res.json(rows);
    } catch (error) { 
        sendSafeError(res, error, 'Error al consultar estaciones de competencia'); 
    }
});

router.get('/consultas/estaciones/precios-competencia/catalogo', authenticateToken, requirePermission(preciosCompetenciaViewPerms), async (req, res) => {
    try {
        const localDb = await getDb();
        const [estacionesSistema] = await withRetry(() => localDb.query("SELECT id_empresa, titulo FROM web_consolidado WHERE grupo = 'ESTACION' ORDER BY orden, titulo"));
        const [estacionesMonitoreadas] = await withRetry(() => localDb.query(`
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

        const localDb = await getDb();
        const compTrimmed = competencia.trim();
        const isPropiaNum = (es_propia === 1 || es_propia === true || es_propia === '1') ? 1 : 0;

        // Validar que no exista ya para la misma estación del sistema
        const [existing] = await withRetry(() => localDb.query(
            'SELECT ID FROM web_estaciones_competencia WHERE id_estacion = ? AND UPPER(competencia) = UPPER(?)',
            [id_estacion, compTrimmed]
        ));
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Esta estación ya se encuentra asignada a esta sucursal.' });
        }

        // Si se marca como propia, desmarcar cualquier otra estación propia previa en la misma sucursal
        if (isPropiaNum === 1) {
            await withRetry(() => localDb.query(
                'UPDATE web_estaciones_competencia SET es_propia = 0 WHERE id_estacion = ?',
                [id_estacion]
            ));
        }

        const [result] = await withRetry(() => localDb.query(
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
        const localDb = await getDb();
        const [current] = await withRetry(() => localDb.query('SELECT * FROM web_estaciones_competencia WHERE ID = ?', [id]));
        if (current.length === 0) {
            return res.status(404).json({ message: 'Estación no encontrada' });
        }

        const newComp = competencia !== undefined ? competencia.trim() : current[0].competencia;
        const newPropia = es_propia !== undefined ? ((es_propia === 1 || es_propia === true || es_propia === '1') ? 1 : 0) : current[0].es_propia;
        const newIdEstacion = id_estacion !== undefined ? id_estacion : current[0].id_estacion;

        // Si se marca como propia (1), desmarcar cualquier otra estación propia para la misma sucursal
        if (newPropia === 1) {
            await withRetry(() => localDb.query(
                'UPDATE web_estaciones_competencia SET es_propia = 0 WHERE id_estacion = ? AND ID != ?',
                [newIdEstacion, id]
            ));
        }

        await withRetry(() => localDb.query(
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
        const localDb = await getDb();
        const [rows] = await withRetry(() => localDb.query('SELECT * FROM web_estaciones_competencia WHERE ID = ?', [id]));
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Estación no encontrada' });
        }
        const stationName = rows[0].competencia;

        await withRetry(() => localDb.query('DELETE FROM web_estaciones_competencia WHERE ID = ?', [id]));

        // Si la estación ya no figura en ninguna sucursal, limpiar de web_precios_competencia
        const [stillExists] = await withRetry(() => localDb.query('SELECT ID FROM web_estaciones_competencia WHERE competencia = ?', [stationName]));
        if (stillExists.length === 0) {
            await withRetry(() => localDb.query('DELETE FROM web_precios_competencia WHERE estacion = ?', [stationName]));
        }

        res.json({ message: `Estación "${stationName}" quitada correctamente` });
    } catch (error) {
        sendSafeError(res, error, 'Error al quitar estación');
    }
});

router.get('/consultas/estaciones/precios', authenticateToken, requirePermission(preciosEstacionViewPerms), async (req, res) => {
    try {
        const date = new Date().toISOString().split('T')[0];
        const data = await getPreciosEstacionData(date);
        res.json(data);
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

        const localDb = await getDb();
        const [mappedStations] = await withRetry(() => localDb.query('SELECT competencia FROM web_estaciones_competencia'));

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
        const conn = await localDb.getConnection();
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

router.post('/consultas/estaciones/precios-competencia/upload', express.json({ limit: '20mb' }), authenticateToken, requirePermission(['manage_precios_competencia', '/dashboard/consultas/estaciones/precios-competencia']), async (req, res) => {
    try {
        const { data } = req.body;
        if (!Array.isArray(data) || data.length === 0) {
            return res.status(400).json({ message: 'No data provided' });
        }
        const localDb = await getDb();
        const conn = await localDb.getConnection();
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
    } catch (error) { 
        sendSafeError(res, error, 'Error al actualizar precios de competencia'); 
    }
});

router.get('/consultas/estaciones/precios-competencia/historial', authenticateToken, requirePermission(preciosCompetenciaViewPerms), async (req, res) => {
    try {
        const { desde, hasta, estacion } = req.query;
        const localDb = await getDb();
        
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

        const [rows] = await withRetry(() => localDb.query(query, params));
        res.json(rows);
    } catch (error) {
        sendSafeError(res, error, 'Error al consultar historial de precios');
    }
});

router.get('/consultas/estaciones/precios-competencia/bi-analytics', authenticateToken, requirePermission(preciosCompetenciaViewPerms), async (req, res) => {
    try {
        const localDb = await getDb();
        
        // 1. Current data with station details
        const queryCurrent = `
            SELECT c.titulo as estacion_propia, a.estacion, a.modificacion,
                   a.super_c, a.regular_c, a.ion_c, a.diesel_c,
                   a.super_a, a.regular_a, a.ion_a, a.diesel_a
            FROM web_precios_competencia a
            INNER JOIN web_estaciones_competencia b ON a.estacion = b.competencia
            INNER JOIN web_consolidado c ON b.id_estacion = c.id_empresa AND c.grupo = 'ESTACION'
        `;
        const [currentRows] = await withRetry(() => localDb.query(queryCurrent));

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
        const [trendRows] = await withRetry(() => localDb.query(queryTrend));

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
        const [histCount] = await withRetry(() => localDb.query('SELECT COUNT(*) as total, MAX(fecha_registro) as ultima_fecha FROM web_precios_competencia_historial'));

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
        sendSafeError(res, error, 'Error al generar análisis de BI');
    }
});

router.get('/consultas/:type', authenticateToken, requirePermission(genericConsultasPerms), async (req, res) => {
    const { type } = req.params;
    try {
        const externalDb = await getExternalDb();
        const today = new Date().toISOString().split('T')[0];
        let results;
        if (type === 'saldos-bancos') [results] = await externalDb.query('CALL sp_saldo_en_bancos(?)', [today]);
        else if (type === 'saldos-chequera') [results] = await externalDb.query('CALL sp_saldo_en_chequera(?)', [today]);
        else return res.status(404).json({ message: 'Consulta no encontrada' });
        res.json(results[0] || []);
    } catch (error) { 
        sendSafeError(res, error, 'Error al ejecutar consulta'); 
    }
});

router.isGenericDescription = isGenericDescription;
router.generarAnalisisDescuadre = generarAnalisisDescuadre;
router.getTurnosPorEmpresa = getTurnosPorEmpresa;
router.mapCierreRowConExplicacion = mapCierreRowConExplicacion;

module.exports = router;

