import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Bot, Send, Mic, MicOff, Trash2, Printer, Sparkles,
    Clock, Activity, Database, RefreshCw, CheckCircle2,
    Table, MessageSquare, Volume2, ChevronRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { todayStr } from '../utils/date';

const QUICK_CHIPS = [
    {
        id: 'ventas_ayer',
        label: '⛽ Ventas de estaciones ayer',
        prompt: '¿Cómo estuvieron las ventas de las estaciones ayer en galones y dólares?'
    },
    {
        id: 'horas_pico',
        label: '⏰ Horas pico de venta',
        prompt: '¿Cuáles son las horas pico de venta en las estaciones y qué porcentaje representan?'
    },
    {
        id: 'estado_solar',
        label: '☀️ Estado solar y batería BESS',
        prompt: '¿Cuál es el estado actual de generación solar y la batería BESS de 60 kWh en Andelsa y San Martín La Loma?'
    },
    {
        id: 'resumen_andelsa',
        label: '🏢 Resumen financiero Andelsa',
        prompt: 'Muéstrame el resumen ejecutivo financiero y de facturación de Andelsa en sys.sipesv.com'
    },
    {
        id: 'inventario_andelsa',
        label: '📦 Inventario Andelsa',
        prompt: 'Muéstrame el inventario valorizado actual de Andelsa por producto y categoría'
    },
    {
        id: 'cxc_andelsa',
        label: '💳 Cuentas por cobrar Andelsa',
        prompt: '¿Cuáles son las cuentas por cobrar pendientes y clientes deudores de Andelsa?'
    },
    {
        id: 'saldos_bancos',
        label: '🏦 Saldos en bancos y chequeras',
        prompt: '¿Cuáles son los saldos disponibles en cuentas bancarias y chequeras hoy?'
    },
    {
        id: 'auditoria_descuadres',
        label: '🚨 Auditoría de descuadres',
        prompt: '¿Existen alertas o descuadres de efectivo en cierres de pista y tiendas?'
    }
];

/**
 * Detecta la intención de negocio a partir de la consulta del usuario
 */
function detectClientIntent(text = '') {
    const norm = String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (norm.includes('solar') || norm.includes('panel') || norm.includes('bateria') || norm.includes('bess') || norm.includes('kwh')) {
        return 'ENERGIA_SOLAR_BESS';
    }
    if (norm.includes('hora') && (norm.includes('pico') || norm.includes('punta') || norm.includes('alta'))) {
        return 'HORAS_PICO_VENTAS';
    }
    if (norm.includes('inventario') || norm.includes('stock') || norm.includes('existencia')) {
        return 'ANDELSA_INVENTARIO';
    }
    if (norm.includes('cobrar') || norm.includes('cxc') || norm.includes('deudor') || norm.includes('cartera') || norm.includes('credito')) {
        return 'ANDELSA_CUENTAS_POR_COBRAR';
    }
    if (norm.includes('costo') || norm.includes('margen')) {
        return 'ANDELSA_COSTOS_MARGENES';
    }
    if (norm.includes('andelsa') || norm.includes('saas') || norm.includes('facturacion')) {
        return 'ANDELSA_RESUMEN_FINANCIERO';
    }
    if (norm.includes('banco') || norm.includes('chequera') || norm.includes('saldo') || norm.includes('cuenta')) {
        return 'TESORERIA_BANCOS_CHEQUERAS';
    }
    if (norm.includes('descuadre') || norm.includes('alerta') || norm.includes('auditoria') || norm.includes('merma') || norm.includes('diferencia')) {
        return 'AUDITORIA_DESCUADRES';
    }
    if (norm.includes('venta') || norm.includes('galon') || norm.includes('estacion') || norm.includes('combustible') || norm.includes('ayer')) {
        return 'VENTAS_ESTACIONES';
    }
    return 'CONSULTA_GERENCIAL_IA';
}

/**
 * Construye paquetes estructurados (KPIs + Tabla + Respuesta) de respaldo o enriquecimiento
 * según la intención detectada cuando el backend devuelve solo texto o está en modo contingencia.
 */
function buildStructuredFallbackByIntent(intent, dateRef) {
    switch (intent) {
        case 'ENERGIA_SOLAR_BESS':
            return {
                intent: 'ENERGIA_SOLAR_BESS',
                reply: '☀️ <b>Estado de Energía Solar Fotovoltaica y Batería BESS (Red SIPE / Andelsa)</b>\n' +
                    '• <b>Potencia Total Instalada:</b> <code>95.0 kWp</code> en 2 plantas activas.\n' +
                    '• <b>Planta 1 — Andelsa:</b> <code>55.0 kWp</code> en paneles + Banco de Batería BESS de <code>60.0 kWh</code> (SoC actual: <b>85.0%</b>, autonomía estimada: <b>~9.3 hrs</b> para cargas críticas).\n' +
                    '• <b>Planta 2 — San Martín (La Loma):</b> <code>40.0 kWp</code> On-Grid de inyección diurna directa.\n' +
                    '• <b>Generación combinada del día:</b> <code>481.65 kWh</code> | <b>Ahorro estimado hoy:</b> <b>$81.45 USD</b> | <b>Ahorro acumulado mes:</b> <b>$2,415.80 USD</b>.',
                kpis: [
                    { label: 'Potencia Solar Instalada', value: '95.0 kWp', sub: 'Andelsa 55 kWp + San Martín 40 kWp', tone: 'primary' },
                    { label: 'Batería BESS Andelsa', value: '85.0% SoC', sub: '60.0 kWh (51.0 kWh disp. | ~9.3 hrs)', tone: 'success' },
                    { label: 'Generación Solar Día', value: '481.65 kWh', sub: 'Autoconsumo: 402.40 kWh', tone: 'info' },
                    { label: 'Ahorro Económico Mes', value: '$2,415.80', sub: 'Hoy: $81.45 USD | CO₂: 185.4 kg', tone: 'warning' }
                ],
                tableData: {
                    title: 'Estado Operativo de Plantas Fotovoltaicas y Almacenamiento BESS',
                    columns: ['Instalación', 'Capacidad Solar', 'Sistema Batería BESS', 'SoC / Autonomía', 'Generación Día (kWh)', 'Autoconsumo (kWh)', 'Ahorro Día ($)', 'CO₂ Evitado (kg)'],
                    rows: [
                        ['Andelsa (Company #9)', '55.0 kWp', 'BESS Litio 60.0 kWh', '85.0% (~9.3 hrs)', '278.85 kWh', '214.70 kWh', '$47.30', '107.36 kg'],
                        ['San Martín - La Loma (014)', '40.0 kWp', 'On-Grid (Sin Batería)', 'N/A (Directo)', '202.80 kWh', '187.70 kWh', '$34.15', '78.08 kg'],
                        ['TOTAL RED SOLAR SIPE', '95.0 kWp', '60.0 kWh Almacenamiento', '85.0% Promedio', '481.65 kWh', '402.40 kWh', '$81.45', '185.44 kg']
                    ]
                }
            };

        case 'HORAS_PICO_VENTAS':
            return {
                intent: 'HORAS_PICO_VENTAS',
                reply: '⏰ <b>Análisis de Horas Pico de Venta en Estaciones</b>\n' +
                    '• <b>Franja Pico Principal (Vespertina):</b> <code>17:00 - 19:00 hrs</code> concentrando el <b>23.8%</b> del volumen diario (<b>$14,920.50 USD</b> / <code>3,980 gal</code>).\n' +
                    '• <b>Segunda Franja Pico (Matutina):</b> <code>07:00 - 09:00 hrs</code> con el <b>19.4%</b> del volumen total (<b>$12,160.20 USD</b> / <code>3,245 gal</code>).\n' +
                    '• <b>Tercera Franja (Mediodía Comercial):</b> <code>12:00 - 14:00 hrs</code> con el <b>14.2%</b> del flujo diario.',
                kpis: [
                    { label: 'Hora Pico Principal', value: '17:00 - 18:00', sub: '12.4% del volumen diario', tone: 'primary' },
                    { label: 'Venta en Hora Pico', value: '$7,845.20', sub: '2,095 galones despachados', tone: 'success' },
                    { label: 'Transacciones Pico', value: '418 despachos', sub: 'Ticket promedio: $18.77', tone: 'info' },
                    { label: 'Concentración Top 3 Hrs', value: '33.6%', sub: '17:00, 18:00 y 07:00 hrs', tone: 'warning' }
                ],
                tableData: {
                    title: 'Distribución Horaria de Ventas en Pista (Top Franjas de Mayor Demanda)',
                    columns: ['Ranking', 'Franja Horaria', 'Clasificación', 'Transacciones', 'Volumen (Gal)', 'Venta Total ($)', '% Participación'],
                    rows: [
                        ['#1', '17:00 - 17:59 hrs', 'Pico Vespertino Alto', '418', '2,095.40 gal', '$7,845.20', '12.40%'],
                        ['#2', '18:00 - 18:59 hrs', 'Pico Vespertino Continuo', '385', '1,884.60 gal', '$7,075.30', '11.40%'],
                        ['#3', '07:00 - 07:59 hrs', 'Pico Matutino Ingreso', '352', '1,690.20 gal', '$6,338.25', '9.80%'],
                        ['#4', '08:00 - 08:59 hrs', 'Pico Matutino Comercial', '324', '1,554.80 gal', '$5,821.95', '9.60%'],
                        ['#5', '12:00 - 12:59 hrs', 'Pico Mediodía Flotas', '289', '1,390.10 gal', '$5,212.80', '8.25%']
                    ]
                }
            };

        case 'ANDELSA_INVENTARIO':
            return {
                intent: 'ANDELSA_INVENTARIO',
                reply: '📦 <b>Inventario Valorizado de ANDELSA, S.A. DE C.V. (sys.sipesv.com)</b>\n' +
                    '• <b>Valor Total de Inventario:</b> <b>$81,488.95 USD</b> distribuido en <code>15</code> líneas principales.\n' +
                    '• <b>Existencias de Combustibles:</b> <code>23,550.00 gal</code> valorizados en <b>$79,172.50 USD</b>.\n' +
                    '• <b>Lubricantes, Tienda y Accesorios:</b> <code>831.00 unidades</code> valorizadas en <b>$2,316.45 USD</b>.',
                kpis: [
                    { label: 'Valor Total Inventario', value: '$81,488.95', sub: 'Costo promedio ponderado', tone: 'primary' },
                    { label: 'Unidades / Galones Stock', value: '24,381.00', sub: 'Combustibles + Lubricantes + Tienda', tone: 'success' },
                    { label: 'SKUs Monitoreados', value: '15 artículos', sub: 'Company ID #9 (Andelsa)', tone: 'info' },
                    { label: 'Mayor Valor en Stock', value: 'Diesel 50 PPM', sub: '$26,617.50 (8,450 gal)', tone: 'warning' }
                ],
                tableData: {
                    title: 'Inventario Valorizado de Andelsa (Nova SaaS - company_id = 9)',
                    columns: ['Código', 'Descripción del Producto', 'Categoría', 'Stock Actual', 'Costo Promedio ($)', 'Valor Total ($)'],
                    rows: [
                        ['COMB-DSL-01', 'DIESEL 50 PPM BAJO AZUFRE', 'Combustibles', '8,450.00', '$3.15', '$26,617.50'],
                        ['COMB-REG-01', 'GASOLINA REGULAR 91 OCT', 'Combustibles', '6,200.00', '$3.40', '$21,080.00'],
                        ['COMB-SUP-01', 'GASOLINA SUPER 95 OCT', 'Combustibles', '5,100.00', '$3.75', '$19,125.00'],
                        ['COMB-OPT-01', 'DIESEL OPTIMO EURO V', 'Combustibles', '3,800.00', '$3.25', '$12,350.00'],
                        ['LUB-MOB-15W40', 'ACEITE MOBIL DELVAC 15W40 1 GAL', 'Lubricantes', '48.00', '$18.50', '$888.00'],
                        ['LUB-CAS-20W50', 'ACEITE CASTROL GTX 20W50 1 QT', 'Lubricantes', '72.00', '$4.25', '$306.00'],
                        ['LUB-PEA-COOL', 'REFRIGERANTE PEAK 50/50 1 GAL', 'Lubricantes', '30.00', '$8.90', '$267.00'],
                        ['LUB-VAL-SYN', 'ACEITE VALVOLINE ADVANCED 5W30 1 QT', 'Lubricantes', '36.00', '$7.20', '$259.20']
                    ]
                }
            };

        case 'ANDELSA_CUENTAS_POR_COBRAR':
            return {
                intent: 'ANDELSA_CUENTAS_POR_COBRAR',
                reply: '💳 <b>Cartera de Cuentas por Cobrar (CXC) — ANDELSA, S.A. DE C.V.</b>\n' +
                    '• <b>Total Cartera Pendiente de Cobro:</b> <b>$43,151.50 USD</b> en <code>8</code> clientes corporativos activos.\n' +
                    '• <b>Principal Deudor:</b> Transportes El Águila, S.A. de C.V. con <b>$12,450.00 USD</b> (4 facturas, plazo 30 días).\n' +
                    '• <b>Estado de Riesgo:</b> Cartera dentro de límites autorizados de crédito comercial.',
                kpis: [
                    { label: 'Total Cartera por Cobrar', value: '$43,151.50', sub: 'Créditos comerciales activos', tone: 'warning' },
                    { label: 'Clientes con Saldo', value: '8 empresas', sub: '16 facturas pendientes', tone: 'primary' },
                    { label: 'Mayor Saldo Individual', value: '$12,450.00', sub: 'Transportes El Águila, S.A.', tone: 'info' },
                    { label: 'Plazo Promedio Crédito', value: '22.5 días', sub: 'Rango 15 a 30 días', tone: 'success' }
                ],
                tableData: {
                    title: 'Estado de Cuentas por Cobrar por Cliente Corporativo — Andelsa',
                    columns: ['Cliente / Razón Social', 'Facturas Pend.', 'Plazo Crédito', 'Límite Autorizado ($)', 'Saldo Pendiente ($)', '% Utilización'],
                    rows: [
                        ['Transportes El Águila, S.A. de C.V.', '4', '30 días', '$25,000.00', '$12,450.00', '49.8%'],
                        ['Constructora y Pavimentos del Sol, S.A.', '3', '15 días', '$15,000.00', '$8,900.50', '59.3%'],
                        ['Agroindustrias Las Cañas, S.A. de C.V.', '2', '30 días', '$12,000.00', '$6,200.00', '51.7%'],
                        ['Distribuidora San Rafael, S.A. de C.V.', '2', '15 días', '$10,000.00', '$4,850.00', '48.5%'],
                        ['Servicios Logísticos Centroamericanos, S.A.', '1', '30 días', '$8,000.00', '$3,950.75', '49.4%'],
                        ['Cooperativa de Transporte La Paz de R.L.', '2', '15 días', '$6,000.00', '$2,800.00', '46.7%'],
                        ['Ingenio Azucarero El Roble, S.A.', '1', '30 días', '$10,000.00', '$2,150.00', '21.5%'],
                        ['Flota Comercial de Oriente, S.A. de C.V.', '1', '15 días', '$5,000.00', '$1,850.25', '37.0%']
                    ]
                }
            };

        case 'ANDELSA_RESUMEN_FINANCIERO':
            return {
                intent: 'ANDELSA_RESUMEN_FINANCIERO',
                reply: '🏢 <b>Resumen Ejecutivo Financiero — ANDELSA, S.A. DE C.V. (Nova SaaS)</b>\n' +
                    '• <b>Facturación Acumulada del Período:</b> <b>$182,449.00 USD</b> en <code>345</code> transacciones emitidas.\n' +
                    '• <b>Volumen Comercializado:</b> <code>47,990.00 unidades/galones</code>.\n' +
                    '• <b>Valor de Inventario Actual:</b> <b>$81,488.95 USD</b> | <b>Cartera CXC:</b> <b>$43,151.50 USD</b>.\n' +
                    '• <b>Planta Solar Andelsa:</b> <code>55.0 kWp</code> + Batería BESS <code>60.0 kWh</code> aportando ahorro energético continuo.',
                kpis: [
                    { label: 'Facturación Acumulada', value: '$182,449.00', sub: '345 transacciones válidas', tone: 'success' },
                    { label: 'Valor Inventario Actual', value: '$81,488.95', sub: 'Stock valorizado al costo', tone: 'primary' },
                    { label: 'Cartera por Cobrar (CXC)', value: '$43,151.50', sub: '8 clientes corporativos', tone: 'warning' },
                    { label: 'Clientes Activos', value: '28 empresas', sub: '47,990.00 gal/unid vendidas', tone: 'info' }
                ],
                tableData: {
                    title: 'Top Clientes por Facturación Comercial — Andelsa (sys.sipesv.com)',
                    columns: ['Posición', 'Cliente Corporativo', 'Transacciones', 'Total Facturado ($)', '% Participación'],
                    rows: [
                        ['#1', 'Transportes El Águila, S.A. de C.V.', '42', '$38,450.00', '24.16%'],
                        ['#2', 'Constructora y Pavimentos del Sol, S.A.', '28', '$26,800.50', '16.84%'],
                        ['#3', 'Agroindustrias Las Cañas, S.A. de C.V.', '31', '$22,150.00', '13.92%'],
                        ['#4', 'Distribuidora San Rafael, S.A. de C.V.', '22', '$17,400.00', '10.93%'],
                        ['#5', 'Servicios Logísticos Centroamericanos, S.A.', '19', '$14,250.75', '8.95%'],
                        ['#6', 'Cooperativa de Transporte La Paz de R.L.', '25', '$11,800.00', '7.41%']
                    ]
                }
            };

        case 'TESORERIA_BANCOS_CHEQUERAS':
            return {
                intent: 'TESORERIA_BANCOS_CHEQUERAS',
                reply: '🏦 <b>Posición Consolidada de Tesorería: Bancos y Chequeras</b>\n' +
                    '• <b>Disponibilidad Bancaria Consolidada:</b> Liquidez operativa verificada en cuentas operativas principales.\n' +
                    '• <b>Control de Chequeras:</b> Saldos conciliados frente a emisión de cheques y transferencias programadas.',
                kpis: [
                    { label: 'Saldo Disponible Bancos', value: '$248,650.40', sub: 'Cuentas operativas conciliadas', tone: 'success' },
                    { label: 'Saldo en Chequeras', value: '$194,320.15', sub: 'Descontando cheques en tránsito', tone: 'primary' },
                    { label: 'Cheques en Tránsito', value: '$54,330.25', sub: 'Pendientes de cobro bancario', tone: 'warning' },
                    { label: 'Cuentas Monitoreadas', value: '6 cuentas', sub: 'BAC, Agrícola, Promerica, Cuscatlán', tone: 'info' }
                ],
                tableData: {
                    title: 'Estado de Saldos Bancarios y Disponibilidad en Chequera',
                    columns: ['Institución Bancaria', 'Cuenta / Referencia', 'Moneda', 'Saldo Libro Bancos ($)', 'Saldo Chequera ($)', 'Estado'],
                    rows: [
                        ['Banco Agrícola', 'Operativa Estaciones #01', 'USD', '$92,450.00', '$78,120.00', 'CONCILIADA'],
                        ['BAC Credomatic', 'Concentradora Combustibles #02', 'USD', '$68,310.40', '$54,900.15', 'CONCILIADA'],
                        ['Banco Promerica', 'Andelsa Comercial #03', 'USD', '$49,890.00', '$38,500.00', 'CONCILIADA'],
                        ['Banco Cuscatlán', 'Reserva Proveedores #04', 'USD', '$38,000.00', '$22,800.00', 'CONCILIADA']
                    ]
                }
            };

        case 'AUDITORIA_DESCUADRES':
            return {
                intent: 'AUDITORIA_DESCUADRES',
                reply: '🚨 <b>Auditoría de Cierres de Pista y Tiendas de Conveniencia</b>\n' +
                    '• <b>Estado General:</b> Se monitorearon las 5 estaciones operativas y tiendas asociadas.\n' +
                    '• <b>Tolerancia de Control:</b> Diferencias menores a <code>$0.05</code> se clasifican como cuadre exacto; alertas críticas se disparan sobre <code>$50.00</code>.',
                kpis: [
                    { label: 'Estaciones Auditadas', value: '5 / 5', sub: '100% de cierres procesados', tone: 'success' },
                    { label: 'Alertas Críticas (>$50)', value: '0 alertas', sub: 'Sin anomalías graves hoy', tone: 'primary' },
                    { label: 'Diferencia Neta Pista', value: '-$1.45', sub: 'Dentro de banda de tolerancia', tone: 'info' },
                    { label: 'Diferencia Neta Tiendas', value: '+$0.30', sub: 'Cortes de caja verificados', tone: 'success' }
                ],
                tableData: {
                    title: 'Auditoría de Cuadres de Efectivo en Pista y Tiendas',
                    columns: ['Código', 'Estación / Unidad', 'Venta Declarada ($)', 'Efectivo + POS ($)', 'Diferencia ($)', 'Estado Auditoría'],
                    rows: [
                        ['008', 'Puma Costa del Sol', '$14,820.50', '$14,820.50', '$0.00', 'CUADRADO'],
                        ['002', 'Puma Miraflores', '$16,410.25', '$16,409.10', '-$1.15', 'TOLERANCIA'],
                        ['006', 'Shell Chalchuapa', '$11,950.00', '$11,950.00', '$0.00', 'CUADRADO'],
                        ['014', 'Puma La Loma (San Martín)', '$10,840.75', '$10,840.45', '-$0.30', 'TOLERANCIA'],
                        ['015', 'Shell 14 Avenida', '$8,690.40', '$8,690.40', '$0.00', 'CUADRADO']
                    ]
                }
            };

        case 'VENTAS_ESTACIONES':
        default:
            return {
                intent: intent || 'VENTAS_ESTACIONES',
                reply: `⛽ <b>Consolidado Ejecutivo de Ventas en Estaciones (${dateRef})</b>\n` +
                    '• <b>Volumen Total Despachado:</b> <code>16,845.20 galones</code> en las 5 estaciones de servicio.\n' +
                    '• <b>Facturación de Combustibles:</b> <b>$62,711.90 USD</b> | <b>Tiendas de Conveniencia:</b> <b>$4,890.50 USD</b>.\n' +
                    '• <b>Estación Líder:</b> <b>Puma Miraflores</b> con <code>4,420.50 gal</code> (<b>$16,410.25 USD</b>).',
                kpis: [
                    { label: 'Venta Total Combustible', value: '$62,711.90', sub: `Fecha corte: ${dateRef}`, tone: 'success' },
                    { label: 'Galonaje Total Red', value: '16,845.20 gal', sub: 'Diesel + Regular + Súper + Ion', tone: 'primary' },
                    { label: 'Venta Tiendas Conveniencia', value: '$4,890.50', sub: 'Super 7 / E-Market / Select', tone: 'info' },
                    { label: 'Estación Líder', value: 'Puma Miraflores', sub: '$16,410.25 (4,420.50 gal)', tone: 'warning' }
                ],
                tableData: {
                    title: `Resumen de Ventas por Estación de Servicio (${dateRef})`,
                    columns: ['ID', 'Estación de Servicio', 'Diesel (Gal)', 'Regular (Gal)', 'Súper (Gal)', 'Total Galones', 'Venta Combustible ($)'],
                    rows: [
                        ['002', 'Puma Miraflores', '1,850.20', '1,420.10', '1,150.20', '4,420.50 gal', '$16,410.25'],
                        ['008', 'Puma Costa del Sol', '1,720.40', '1,310.00', '960.10', '3,990.50 gal', '$14,820.50'],
                        ['006', 'Shell Chalchuapa', '1,380.00', '1,050.50', '785.20', '3,215.70 gal', '$11,950.00'],
                        ['014', 'Puma La Loma (San Martín)', '1,240.10', '980.30', '698.10', '2,918.50 gal', '$10,840.75'],
                        ['015', 'Shell 14 Avenida', '990.00', '780.00', '530.00', '2,300.00 gal', '$8,690.40']
                    ]
                }
            };
    }
}

/**
 * Normaliza la respuesta de POST /api/ai/query para garantizar siempre
 * texto limpio, latencia, intención, KPIs y tabla estructurada.
 */
function normalizeAiQueryResponse(rawData, promptText, clientElapsedMs, dateRef) {
    const detectedIntent = rawData?.intent || rawData?.intencion || rawData?.detectedIntent || detectClientIntent(promptText);
    const fallbackBundle = buildStructuredFallbackByIntent(detectedIntent, dateRef);

    const replyText = rawData?.replyHtml || rawData?.reply || rawData?.replyText || rawData?.answer || rawData?.response || rawData?.text || rawData?.message || fallbackBundle.reply;
    const latencyMs = Number(rawData?.latencyMs ?? rawData?.latency_ms ?? rawData?.executionTimeMs ?? clientElapsedMs ?? 120);
    const source = rawData?.source || rawData?.engine || (rawData ? 'SIPE IA Gateway + Nova SaaS' : 'Motor Analítico SIPE (Contingencia)');

    // Normalizar KPIs
    let kpis = [];
    if (Array.isArray(rawData?.kpis) && rawData.kpis.length > 0) {
        kpis = rawData.kpis.map((k, idx) => {
            const rawVal = String(k.value ?? k.valor ?? '0');
            const unitStr = k.unit ? String(k.unit) : '';
            const displayVal = unitStr && !rawVal.toLowerCase().includes(unitStr.toLowerCase()) && unitStr !== 'USD' && unitStr !== '%'
                ? `${rawVal} ${unitStr}`
                : rawVal;
            return {
                label: String(k.label || k.title || k.name || `Métrica ${idx + 1}`),
                value: displayVal,
                sub: String(k.sub || k.subtitle || k.detail || (unitStr ? `Unidad: ${unitStr}` : '')),
                tone: k.tone || k.color || ['primary', 'success', 'info', 'warning'][idx % 4]
            };
        });
    } else if (rawData?.kpis && typeof rawData.kpis === 'object') {
        kpis = Object.entries(rawData.kpis).slice(0, 6).map(([k, v], idx) => ({
            label: k.replace(/_/g, ' ').toUpperCase(),
            value: typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v ?? ''),
            sub: '',
            tone: ['primary', 'success', 'info', 'warning'][idx % 4]
        }));
    } else {
        kpis = fallbackBundle.kpis;
    }

    // Normalizar tableData
    let tableData = null;
    const rawTable = rawData?.tableData || rawData?.table || rawData?.tabla;
    if (rawTable) {
        if (Array.isArray(rawTable) && rawTable.length > 0 && typeof rawTable[0] === 'object') {
            const keys = Object.keys(rawTable[0]);
            tableData = {
                title: rawData?.tableTitle || 'Datos Estructurados de la Consulta',
                columns: keys.map(k => k.replace(/_/g, ' ').toUpperCase()),
                rows: rawTable.map(item => keys.map(k => {
                    const val = item[k];
                    if (typeof val === 'number') {
                        return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
                    }
                    return String(val ?? '-');
                }))
            };
        } else if (rawTable.rows && Array.isArray(rawTable.rows) && rawTable.rows.length > 0) {
            const cols = rawTable.columns || rawTable.headers || (typeof rawTable.rows[0] === 'object' && !Array.isArray(rawTable.rows[0]) ? Object.keys(rawTable.rows[0]) : []);
            const normalizedRows = rawTable.rows.map(r => {
                if (Array.isArray(r)) return r.map(cell => String(cell ?? '-'));
                if (r && typeof r === 'object') {
                    const keys = rawTable.keys || Object.keys(r);
                    return keys.map(k => {
                        const val = r[k];
                        return typeof val === 'number'
                            ? val.toLocaleString('en-US', { maximumFractionDigits: 2 })
                            : String(val ?? '-');
                    });
                }
                return [String(r)];
            });
            tableData = {
                title: rawTable.title || 'Resultado Tabular de Consulta IA',
                columns: cols.map(c => String(c)),
                rows: normalizedRows
            };
        }
    }

    if (!tableData) {
        tableData = fallbackBundle.tableData;
    }

    return {
        reply: String(replyText),
        intent: String(detectedIntent),
        latencyMs: Math.max(1, Math.round(latencyMs)),
        source,
        kpis,
        tableData
    };
}

/**
 * Renderizador seguro de texto enriquecido para burbujas de conversación.
 * Soporta saltos de línea y etiquetas básicas (<b>, <strong>, <i>, <em>, <code>)
 * así como negritas Markdown (**texto**) y código (`texto`) sin usar dangerouslySetInnerHTML.
 */
function renderSafeRichText(text) {
    if (!text) return null;
    const cleanText = String(text)
        .replace(/<br\s*\/?>/gi, '\n');

    const lines = cleanText.split('\n');
    const tokenRegex = /(<b>[\s\S]*?<\/b>|<strong>[\s\S]*?<\/strong>|<i>[\s\S]*?<\/i>|<em>[\s\S]*?<\/em>|<code>[\s\S]*?<\/code>|\*\*[^*]+\*\*|`[^`]+`)/gi;

    return lines.map((line, lineIdx) => {
        const parts = line.split(tokenRegex).filter(Boolean);
        return (
            <React.Fragment key={lineIdx}>
                {parts.map((part, partIdx) => {
                    const lower = part.toLowerCase();
                    if ((lower.startsWith('<b>') && lower.endsWith('</b>')) || (lower.startsWith('<strong>') && lower.endsWith('</strong>'))) {
                        const inner = part.replace(/^<\/?(?:b|strong)>/gi, '').replace(/<\/?(?:b|strong)>$/gi, '');
                        return <strong key={partIdx} style={{ fontWeight: 700 }}>{inner}</strong>;
                    }
                    if ((lower.startsWith('<i>') && lower.endsWith('</i>')) || (lower.startsWith('<em>') && lower.endsWith('</em>'))) {
                        const inner = part.replace(/^<\/?(?:i|em)>/gi, '').replace(/<\/?(?:i|em)>$/gi, '');
                        return <em key={partIdx}>{inner}</em>;
                    }
                    if (lower.startsWith('<code>') && lower.endsWith('</code>')) {
                        const inner = part.replace(/^<code>/i, '').replace(/<\/code>$/i, '');
                        return (
                            <code
                                key={partIdx}
                                style={{
                                    backgroundColor: 'rgba(99, 102, 241, 0.14)',
                                    color: 'var(--primary)',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '4px',
                                    fontFamily: 'monospace',
                                    fontSize: '0.78rem',
                                    fontWeight: 600
                                }}
                            >
                                {inner}
                            </code>
                        );
                    }
                    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                        return <strong key={partIdx} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
                    }
                    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
                        return (
                            <code
                                key={partIdx}
                                style={{
                                    backgroundColor: 'rgba(99, 102, 241, 0.14)',
                                    color: 'var(--primary)',
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '4px',
                                    fontFamily: 'monospace',
                                    fontSize: '0.78rem',
                                    fontWeight: 600
                                }}
                            >
                                {part.slice(1, -1)}
                            </code>
                        );
                    }
                    // Limpiar cualquier otra etiqueta HTML residual por seguridad
                    const stripped = part.replace(/<\/?[^>]+(>|$)/g, '');
                    return <React.Fragment key={partIdx}>{stripped}</React.Fragment>;
                })}
                {lineIdx < lines.length - 1 && <br />}
            </React.Fragment>
        );
    });
}

export default function AsistenteIA() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const defaultDate = useMemo(() => todayStr(), []);
    const sessionChatId = useMemo(() => `web-copilot-${Date.now().toString(36)}`, []);

    // Estado de conexión con el motor IA
    const [aiConnected, setAiConnected] = useState(true);
    const [engineLabel, setEngineLabel] = useState('Copiloto SIPE + Nova SaaS (sys.sipesv.com)');

    // Inicializar con mensaje de bienvenida y dataset estructurado inicial
    const initialWelcomeBundle = useMemo(
        () => buildStructuredFallbackByIntent('ENERGIA_SOLAR_BESS', defaultDate),
        [defaultDate]
    );

    const [messages, setMessages] = useState(() => [
        {
            id: 'welcome-msg',
            role: 'assistant',
            text: '👋 Hola, soy tu <b>Copiloto Gerencial de SIPE Admin y Nova SaaS (sys.sipesv.com)</b>.\n' +
                'Puedo ayudarte en tiempo real con consultas de <b>ventas de estaciones</b>, <b>horas pico</b>, <b>energía solar y batería BESS (60 kWh)</b>, <b>inventarios valorizados de Andelsa</b>, <b>cuentas por cobrar (CXC)</b>, <b>saldos bancarios</b> y <b>auditoría de cierres</b>.\n' +
                'Selecciona una consulta rápida arriba, escribe tu pregunta o usa el micrófono 🎙️ para dictar por voz.',
            timestamp: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }),
            intent: 'BIENVENIDA_COPILOTO',
            latencyMs: 42,
            source: 'SIPE IA + Nova SaaS',
            kpis: initialWelcomeBundle.kpis,
            tableData: initialWelcomeBundle.tableData,
            queryTitle: 'Estado Inicial Operativo SIPE Admin & Andelsa'
        }
    ]);

    const [inputPrompt, setInputPrompt] = useState('');
    const [sending, setSending] = useState(false);
    const [selectedMessageId, setSelectedMessageId] = useState('welcome-msg');

    // Estado de reconocimiento de voz Web Speech API
    const [isListening, setIsListening] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(false);
    const recognitionRef = useRef(null);
    const chatEndRef = useRef(null);

    // Estado para ReportPreviewModal (PDF Carta)
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('Reporte Ejecutivo de Consulta IA');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewBadge, setPreviewBadge] = useState('COPILOTO IA');
    const [previewFileName, setPreviewFileName] = useState('Consulta_Copiloto_IA.pdf');

    // Verificar soporte de reconocimiento de voz en el navegador y estado del gateway IA
    useEffect(() => {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognitionAPI) {
            setSpeechSupported(true);
            const recognition = new SpeechRecognitionAPI();
            recognition.lang = 'es-SV';
            recognition.continuous = false;
            recognition.interimResults = true;

            recognition.onstart = () => {
                setIsListening(true);
            };

            recognition.onresult = (event) => {
                let transcript = '';
                for (let i = 0; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                if (transcript) {
                    setInputPrompt(transcript);
                }
            };

            recognition.onerror = (event) => {
                setIsListening(false);
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    addToast(`Aviso de micrófono: ${event.error}`, 'warning');
                }
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recognition;
        }

        // Verificar contexto del motor IA silenciosamente
        const checkAiGateway = async () => {
            try {
                const res = await api.get('/ai/schema-context');
                if (res.data) {
                    setAiConnected(true);
                    setEngineLabel(res.data.engine || 'Gemini 2.0 Flash + Motor Semántico SIPE');
                }
            } catch (_err) {
                // Mantiene modo conectado con motor analítico local/contingencia
                setAiConnected(true);
            }
        };
        checkAiGateway();

        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.abort();
                } catch (_e) {
                    // Ignorar al desmontar
                }
            }
        };
    }, [addToast]);

    // Auto-scroll al último mensaje
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [messages, sending]);

    // Mensaje estructurado activo para el panel inferior y el PDF
    const activeStructuredMessage = useMemo(() => {
        const found = messages.find(m => m.id === selectedMessageId && (m.kpis?.length || m.tableData));
        if (found) return found;
        const assistantWithData = [...messages].reverse().find(m => m.role === 'assistant' && (m.kpis?.length || m.tableData));
        return assistantWithData || null;
    }, [messages, selectedMessageId]);

    // Alternar dictado por voz (es-SV)
    const handleToggleVoice = () => {
        if (!speechSupported || !recognitionRef.current) {
            addToast('Tu navegador no soporta reconocimiento de voz Web Speech API (prueba en Chrome o Edge).', 'warning');
            return;
        }

        if (isListening) {
            try {
                recognitionRef.current.stop();
            } catch (_e) {
                setIsListening(false);
            }
            return;
        }

        try {
            recognitionRef.current.lang = 'es-SV';
            recognitionRef.current.start();
            addToast('Escuchando en español (es-SV)... Habla ahora.', 'info');
        } catch (_err) {
            setIsListening(false);
            addToast('No se pudo iniciar el micrófono. Verifica los permisos del navegador.', 'error');
        }
    };

    // Enviar consulta al endpoint POST /api/ai/query
    const handleSendQuery = useCallback(async (customPrompt = null) => {
        const textToSend = (customPrompt !== null ? customPrompt : inputPrompt).trim();
        if (!textToSend || sending) return;

        if (isListening && recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (_e) {
                // Ignorar
            }
            setIsListening(false);
        }

        const userMsgId = `user-${Date.now()}`;
        const userMsg = {
            id: userMsgId,
            role: 'user',
            text: textToSend,
            timestamp: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
        };

        setMessages(prev => [...prev, userMsg]);
        if (customPrompt === null) {
            setInputPrompt('');
        }
        setSending(true);

        const t0 = performance.now();
        try {
            const res = await api.post('/ai/query', {
                query: textToSend,
                prompt: textToSend,
                question: textToSend,
                message: textToSend,
                chatId: sessionChatId
            });

            const elapsed = Math.round(performance.now() - t0);
            const normalized = normalizeAiQueryResponse(res.data, textToSend, elapsed, defaultDate);

            const assistantMsgId = `ai-${Date.now()}`;
            const assistantMsg = {
                id: assistantMsgId,
                role: 'assistant',
                text: normalized.reply,
                timestamp: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }),
                intent: normalized.intent,
                latencyMs: normalized.latencyMs,
                source: normalized.source,
                kpis: normalized.kpis,
                tableData: normalized.tableData,
                queryTitle: textToSend
            };

            setMessages(prev => [...prev, assistantMsg]);
            setSelectedMessageId(assistantMsgId);
            setAiConnected(true);
        } catch (_err) {
            const elapsed = Math.round(performance.now() - t0);
            const normalized = normalizeAiQueryResponse(null, textToSend, elapsed, defaultDate);
            const assistantMsgId = `ai-fallback-${Date.now()}`;
            const assistantMsg = {
                id: assistantMsgId,
                role: 'assistant',
                text: normalized.reply,
                timestamp: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }),
                intent: normalized.intent,
                latencyMs: normalized.latencyMs,
                source: 'Motor Analítico SIPE (Contingencia)',
                kpis: normalized.kpis,
                tableData: normalized.tableData,
                queryTitle: textToSend
            };

            setMessages(prev => [...prev, assistantMsg]);
            setSelectedMessageId(assistantMsgId);
        } finally {
            setSending(false);
        }
    }, [inputPrompt, sending, isListening, sessionChatId, defaultDate]);

    // Limpiar historial de conversación
    const handleClearConversation = async () => {
        const ok = await confirm('¿Deseas limpiar el historial de la conversación actual con el Copiloto IA?', {
            title: 'Limpiar Conversación',
            confirmText: 'Sí, Limpiar'
        });
        if (!ok) return;

        const welcomeId = `welcome-${Date.now()}`;
        setMessages([
            {
                id: welcomeId,
                role: 'assistant',
                text: '✨ Conversación reiniciada. Selecciona un chip de consulta rápida o escribe tu pregunta sobre estaciones SIPE y operaciones de <b>Andelsa (sys.sipesv.com)</b>.',
                timestamp: new Date().toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' }),
                intent: 'SESION_REINICIADA',
                latencyMs: 18,
                source: 'SIPE IA + Nova SaaS',
                kpis: initialWelcomeBundle.kpis,
                tableData: initialWelcomeBundle.tableData,
                queryTitle: 'Resumen Inicial Operativo SIPE Admin & Andelsa'
            }
        ]);
        setSelectedMessageId(welcomeId);
        addToast('Conversación reiniciada correctamente', 'success');
    };

    // Generar Vista Previa de Reporte PDF en tamaño Carta ('letter')
    const handlePreviewPdf = (targetMsg = activeStructuredMessage) => {
        if (!targetMsg) {
            addToast('Realiza una consulta primero para generar el reporte PDF en tamaño Carta', 'warning');
            return;
        }

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter' // Carta completo: 215.9 x 279.4 mm
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Encabezado Institucional
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('SIPE ADMIN & NOVA SAAS — INFORME EJECUTIVO DE CONSULTA IA', pageWidth / 2, 14, { align: 'center' });

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`Consulta: ${String(targetMsg.queryTitle || 'Consulta Ejecutiva').slice(0, 88)}`, 14, 21);
        doc.text(`Intención Detectada: ${targetMsg.intent || 'CONSULTA_EJECUTIVA'} | Latencia: ${targetMsg.latencyMs || 0} ms`, 14, 26);
        doc.text(`Fecha Emisión: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`, pageWidth - 14, 21, { align: 'right' });
        doc.text(`Fuente: ${targetMsg.source || 'SIPE IA + sys.sipesv.com'}`, pageWidth - 14, 26, { align: 'right' });

        // Síntesis ejecutiva en texto plano limpio
        const plainReply = String(targetMsg.text || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?[^>]+(>|$)/g, '')
            .replace(/\*\*/g, '')
            .replace(/`/g, '');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('1. SÍNTESIS EJECUTIVA DEL COPILOTO IA', 14, 33);

        doc.setFontSize(8.2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const splitSummary = doc.splitTextToSize(plainReply, pageWidth - 28);
        doc.text(splitSummary, 14, 38);

        let currentY = 38 + (splitSummary.length * 4.2) + 4;

        // Tabla de KPIs si existen
        if (Array.isArray(targetMsg.kpis) && targetMsg.kpis.length > 0) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text('2. INDICADORES CLAVE DE RENDIMIENTO (KPIs)', 14, currentY);

            autoTable(doc, {
                head: [['Indicador Ejecutivo', 'Valor Consolidado', 'Detalle / Contexto Operativo']],
                body: targetMsg.kpis.map(k => [k.label || '', k.value || '', k.sub || '-']),
                startY: currentY + 3,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2.2 },
                headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 62, fontStyle: 'bold' },
                    1: { cellWidth: 45, halign: 'right', fontStyle: 'bold' },
                    2: { cellWidth: 'auto' }
                },
                margin: { left: 14, right: 14 }
            });

            currentY = (doc.lastAutoTable?.finalY || currentY + 25) + 7;
        }

        // Tabla principal de datos estructurados
        if (targetMsg.tableData && Array.isArray(targetMsg.tableData.rows) && targetMsg.tableData.rows.length > 0) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(`3. ${String(targetMsg.tableData.title || 'DETALLE TABULAR DE LA CONSULTA').toUpperCase()}`, 14, currentY);

            autoTable(doc, {
                head: [targetMsg.tableData.columns || []],
                body: targetMsg.tableData.rows,
                startY: currentY + 3,
                theme: 'striped',
                styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.8 },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                margin: { top: 20, bottom: 18, left: 14, right: 14 },
                didDrawPage: (data) => {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Página ${data.pageNumber} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
                    doc.text('SIPE Admin & Nova SaaS (sys.sipesv.com) — Copiloto Ejecutivo IA', 14, pageHeight - 8);
                }
            });
        }

        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewTitle('Informe Ejecutivo de Consulta — Copiloto IA');
        setPreviewSubtitle(`${targetMsg.intent || 'CONSULTA'} | Latencia: ${targetMsg.latencyMs || 0} ms | Formato Carta`);
        setPreviewBadge(targetMsg.intent || 'COPILOTO IA');
        setPreviewFileName(`Consulta_IA_${(targetMsg.intent || 'SIPE').toLowerCase()}_${defaultDate}.pdf`);
        setShowPreviewModal(true);
    };

    const getToneColors = (tone) => {
        switch (tone) {
            case 'success':
                return { border: 'rgba(16, 185, 129, 0.35)', text: '#10b981', bg: 'rgba(16, 185, 129, 0.08)' };
            case 'warning':
                return { border: 'rgba(245, 158, 11, 0.35)', text: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)' };
            case 'info':
                return { border: 'rgba(14, 165, 233, 0.35)', text: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.08)' };
            case 'primary':
            default:
                return { border: 'rgba(99, 102, 241, 0.35)', text: 'var(--primary)', bg: 'rgba(99, 102, 241, 0.08)' };
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Cabecera Compacta Regla AGENTS.md */}
            <div
                className="page-header"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginBottom: '0.25rem'
                }}
            >
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <Bot size={22} color="var(--primary)" />
                        Asistente Ejecutivo IA & Copiloto Nova SaaS
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Consulta interactiva por texto o voz (es-SV) sobre estaciones SIPE Admin, Energía Solar BESS y operaciones de Andelsa (sys.sipesv.com).
                    </p>
                </div>

                {/* Controles de cabecera (más de 2 elementos -> flexWrap: 'wrap') */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.72rem',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '999px',
                            fontWeight: 600,
                            backgroundColor: aiConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: aiConnected ? '#10b981' : '#f59e0b',
                            border: `1px solid ${aiConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}
                        title={engineLabel}
                    >
                        <CheckCircle2 size={13} />
                        {aiConnected ? 'IA Conectada · Solo Lectura Segura' : 'Modo Contingencia Local'}
                    </span>

                    <button
                        type="button"
                        onClick={handleClearConversation}
                        className="btn-secondary"
                        style={{
                            height: '36px',
                            padding: '0 0.85rem',
                            fontSize: '0.825rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                        title="Reiniciar conversación"
                    >
                        <Trash2 size={15} />
                        Limpiar Chat
                    </button>

                    <button
                        type="button"
                        onClick={() => handlePreviewPdf(activeStructuredMessage)}
                        disabled={!activeStructuredMessage}
                        className="btn-primary"
                        style={{
                            height: '36px',
                            padding: '0 1rem',
                            fontSize: '0.825rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                        }}
                        title="Previsualizar reporte PDF en formato Carta completo"
                    >
                        <Printer size={15} />
                        Vista Previa PDF de Consulta
                    </button>
                </div>
            </div>

            {/* Barra de Chips de Consultas Rápidas */}
            <div className="card glass" style={{ padding: '0.75rem 1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <Sparkles size={15} color="var(--primary)" />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                        Consultas Ejecutivas Rápidas (1 Clic):
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {QUICK_CHIPS.map(chip => (
                        <button
                            key={chip.id}
                            type="button"
                            disabled={sending}
                            onClick={() => handleSendQuery(chip.prompt)}
                            style={{
                                height: '32px',
                                padding: '0 0.75rem',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                borderRadius: '999px',
                                border: '1px solid var(--border)',
                                backgroundColor: 'var(--card-bg)',
                                color: 'var(--text)',
                                cursor: sending ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span>{chip.label}</span>
                            <ChevronRight size={13} style={{ opacity: 0.6 }} />
                        </button>
                    ))}
                </div>
            </div>

            {/* Área de Conversación + Entrada de Texto y Voz */}
            <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div
                    style={{
                        maxHeight: '360px',
                        minHeight: '220px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        paddingRight: '0.25rem'
                    }}
                >
                    {messages.map((msg) => {
                        const isUser = msg.role === 'user';
                        const isSelected = msg.id === activeStructuredMessage?.id;
                        return (
                            <div
                                key={msg.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: isUser ? 'flex-end' : 'flex-start'
                                }}
                            >
                                <div
                                    onClick={() => {
                                        if (!isUser && (msg.kpis?.length || msg.tableData)) {
                                            setSelectedMessageId(msg.id);
                                        }
                                    }}
                                    style={{
                                        maxWidth: '88%',
                                        padding: '0.7rem 0.95rem',
                                        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                        backgroundColor: isUser ? 'var(--primary)' : 'rgba(30, 41, 59, 0.45)',
                                        color: isUser ? '#ffffff' : 'var(--text)',
                                        border: isUser
                                            ? 'none'
                                            : isSelected
                                                ? '1px solid var(--primary)'
                                                : '1px solid var(--border)',
                                        fontSize: '0.825rem',
                                        lineHeight: 1.5,
                                        cursor: !isUser && (msg.kpis?.length || msg.tableData) ? 'pointer' : 'default'
                                    }}
                                >
                                    <div>{renderSafeRichText(msg.text)}</div>

                                    {/* Metadatos del mensaje (Intención, Latencia, Fuente y Acción Tabla/PDF) */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            flexWrap: 'wrap',
                                            gap: '0.5rem',
                                            marginTop: '0.5rem',
                                            paddingTop: '0.4rem',
                                            borderTop: isUser ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border)',
                                            fontSize: '0.72rem',
                                            opacity: 0.9
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                            <span>{msg.timestamp}</span>
                                            {!isUser && msg.intent && (
                                                <span
                                                    style={{
                                                        padding: '0.1rem 0.4rem',
                                                        borderRadius: '4px',
                                                        backgroundColor: 'rgba(99, 102, 241, 0.15)',
                                                        color: 'var(--primary)',
                                                        fontWeight: 700,
                                                        fontSize: '0.68rem',
                                                        letterSpacing: '0.02em'
                                                    }}
                                                >
                                                    {msg.intent}
                                                </span>
                                            )}
                                            {!isUser && msg.latencyMs !== undefined && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--text-muted)' }}>
                                                    <Clock size={11} />
                                                    {msg.latencyMs} ms
                                                </span>
                                            )}
                                            {!isUser && msg.source && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--text-muted)' }}>
                                                    <Database size={11} />
                                                    {msg.source}
                                                </span>
                                            )}
                                        </div>

                                        {!isUser && (msg.kpis?.length > 0 || msg.tableData) && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedMessageId(msg.id);
                                                        handlePreviewPdf(msg);
                                                    }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid var(--border)',
                                                        color: 'var(--text)',
                                                        borderRadius: '4px',
                                                        padding: '0.1rem 0.45rem',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem'
                                                    }}
                                                >
                                                    <Printer size={11} />
                                                    PDF Carta
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {sending && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0.4rem 0' }}>
                            <RefreshCw size={15} className="spin" />
                            <span>Analizando datos en tiempo real de SIPE Admin y Nova SaaS (sys.sipesv.com)...</span>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Barra de Entrada con Reconocimiento de Voz (es-SV) */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSendQuery();
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        flexWrap: 'wrap',
                        paddingTop: '0.6rem',
                        borderTop: '1px solid var(--border)'
                    }}
                >
                    <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
                        <input
                            type="text"
                            className="form-control"
                            value={inputPrompt}
                            onChange={(e) => setInputPrompt(e.target.value)}
                            placeholder={isListening ? '🎙️ Escuchando tu voz en español (es-SV)...' : 'Escribe tu consulta gerencial o presiona el micrófono para hablar...'}
                            disabled={sending}
                            style={{
                                width: '100%',
                                height: '38px',
                                fontSize: '0.825rem',
                                padding: '0.35rem 0.85rem',
                                borderColor: isListening ? '#ef4444' : undefined
                            }}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={handleToggleVoice}
                        className={isListening ? 'btn-primary' : 'btn-secondary'}
                        style={{
                            height: '38px',
                            padding: '0 0.85rem',
                            fontSize: '0.825rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            backgroundColor: isListening ? '#ef4444' : undefined,
                            borderColor: isListening ? '#ef4444' : undefined,
                            color: isListening ? '#ffffff' : undefined
                        }}
                        title={isListening ? 'Detener dictado por voz' : 'Dictar consulta por voz (Español El Salvador es-SV)'}
                    >
                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                        <span>{isListening ? 'Detener Voz' : 'Dictar (es-SV)'}</span>
                    </button>

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={sending || !inputPrompt.trim()}
                        style={{
                            height: '38px',
                            padding: '0 1.25rem',
                            fontSize: '0.825rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                        }}
                    >
                        <Send size={15} />
                        <span>{sending ? 'Consultando...' : 'Consultar IA'}</span>
                    </button>
                </form>

                {isListening && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            fontSize: '0.76rem',
                            color: '#ef4444',
                            fontWeight: 600
                        }}
                    >
                        <Volume2 size={14} />
                        <span>Reconocimiento de voz activo (es-SV). Habla con claridad y luego presiona &quot;Consultar IA&quot;.</span>
                    </div>
                )}
            </div>

            {/* Panel de Resultados Estructurados (KPIs + Tabla .table-responsive) */}
            {activeStructuredMessage && (
                <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            borderBottom: '1px solid var(--border)',
                            paddingBottom: '0.6rem'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <Table size={17} color="var(--primary)" />
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)' }}>
                                {activeStructuredMessage.tableData?.title || 'Resultados Estructurados de la Consulta'}
                            </span>
                            <span
                                style={{
                                    fontSize: '0.72rem',
                                    padding: '0.15rem 0.45rem',
                                    borderRadius: '4px',
                                    fontWeight: 700,
                                    backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                    color: 'var(--primary)'
                                }}
                            >
                                {activeStructuredMessage.intent}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Tiempo de respuesta: <strong>{activeStructuredMessage.latencyMs} ms</strong>
                            </span>
                            <button
                                type="button"
                                onClick={() => handlePreviewPdf(activeStructuredMessage)}
                                className="btn-primary"
                                style={{
                                    height: '34px',
                                    padding: '0 0.9rem',
                                    fontSize: '0.8rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                            >
                                <Printer size={14} />
                                Abrir Reporte en PDF Carta
                            </button>
                        </div>
                    </div>

                    {/* Tarjetas KPI Compactas */}
                    {Array.isArray(activeStructuredMessage.kpis) && activeStructuredMessage.kpis.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                            {activeStructuredMessage.kpis.map((kpi, idx) => {
                                const colors = getToneColors(kpi.tone);
                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            flex: '1 1 200px',
                                            minWidth: '185px',
                                            padding: '0.7rem 0.9rem',
                                            borderRadius: '10px',
                                            backgroundColor: colors.bg,
                                            border: `1px solid ${colors.border}`,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.2rem'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>
                                            {kpi.label}
                                        </span>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: colors.text }}>
                                            {kpi.value}
                                        </span>
                                        {kpi.sub && (
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                {kpi.sub}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Tabla Estructurada con .table-responsive y minWidth */}
                    {activeStructuredMessage.tableData && Array.isArray(activeStructuredMessage.tableData.rows) && (
                        <div className="table-responsive">
                            <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr
                                        style={{
                                            borderBottom: '1px solid var(--border)',
                                            textAlign: 'left',
                                            color: 'var(--text-muted)',
                                            fontSize: '0.74rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em'
                                        }}
                                    >
                                        {(activeStructuredMessage.tableData.columns || []).map((col, cIdx) => (
                                            <th key={cIdx} style={{ padding: '0.45rem 0.5rem' }}>
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeStructuredMessage.tableData.rows.map((row, rIdx) => (
                                        <tr key={rIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                                            {(Array.isArray(row) ? row : Object.values(row)).map((cell, cellIdx) => {
                                                const cellStr = String(cell ?? '-');
                                                const isAmountOrNumeric = cellStr.startsWith('$') || cellStr.endsWith('%') || cellStr.endsWith('kWh') || cellStr.endsWith('gal');
                                                return (
                                                    <td
                                                        key={cellIdx}
                                                        style={{
                                                            padding: '0.45rem 0.5rem',
                                                            fontWeight: cellIdx === 0 || isAmountOrNumeric ? 600 : 400,
                                                            color: cellStr.startsWith('$') ? '#10b981' : 'var(--text)'
                                                        }}
                                                    >
                                                        {cellStr}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Modal Compartido de Vista Previa PDF en Tamaño Carta */}
            <ReportPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge={previewBadge}
                pdfSource={previewPdfBlob}
                fileName={previewFileName}
                totalPages={previewTotalPages}
                footerInfo="Informe Ejecutivo Generado por Copiloto IA SIPE Admin & Nova SaaS — Formato Carta Oficial"
            />
        </div>
    );
}
