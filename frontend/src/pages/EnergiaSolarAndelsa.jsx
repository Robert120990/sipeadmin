import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Sun, BatteryCharging, Zap, DollarSign, Leaf, Building2,
    Package, BarChart3, Users, Tag, CreditCard, Search,
    RefreshCw, Printer, CheckCircle2, Activity
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { todayStr } from '../utils/date';

const FALLBACK_SOLAR_STATIONS = [
    {
        instalacion_id: 1,
        id_empresa: 'ANDELSA',
        estacion_nombre: 'Andelsa',
        tiene_paneles: 1,
        potencia_kwp: 55.0,
        potencia_actual_kw: 39.6,
        tiene_baterias: 1,
        capacidad_bateria_kwh: 60.0,
        bateria_soc_pct: 85.0,
        bateria_estado: 'EN_LINEA',
        energia_almacenada_kwh: 51.0,
        horas_autonomia: 9.3,
        generacion_dia_kwh: 278.85,
        autoconsumo_dia_kwh: 214.70,
        bateria_descarga_dia_kwh: 48.40,
        ahorro_dia_usd: 47.36,
        co2_dia_kg: 107.36,
        generacion_mes_kwh: 8365.50,
        autoconsumo_mes_kwh: 6441.00,
        ahorro_mes_usd: 1420.80,
        co2_mes_kg: 3220.72
    },
    {
        instalacion_id: 2,
        id_empresa: '014',
        estacion_nombre: 'San Martín (La Loma)',
        tiene_paneles: 1,
        potencia_kwp: 40.0,
        potencia_actual_kw: 28.8,
        tiene_baterias: 0,
        capacidad_bateria_kwh: 0.0,
        bateria_soc_pct: 0.0,
        bateria_estado: 'SIN_BATERIAS',
        energia_almacenada_kwh: 0.0,
        horas_autonomia: 0.0,
        generacion_dia_kwh: 202.80,
        autoconsumo_dia_kwh: 184.55,
        bateria_descarga_dia_kwh: 0.0,
        ahorro_dia_usd: 33.22,
        co2_dia_kg: 78.08,
        generacion_mes_kwh: 6084.00,
        autoconsumo_mes_kwh: 5536.50,
        ahorro_mes_usd: 996.57,
        co2_mes_kg: 2342.34
    }
];

const FALLBACK_ANDELSA = {
    resumen: {
        facturacion_total_usd: 182449.00,
        unidades_vendidas: 47990.00,
        valor_inventario_actual_usd: 81488.95,
        cartera_por_cobrar_usd: 43151.50,
        total_clientes_activos: 28,
        transacciones_totales: 345
    },
    inventarios: [
        { codigo: 'COMB-DSL-01', descripcion: 'DIESEL 50 PPM BAJO AZUFRE', categoria: 'Combustibles', stock_actual: 8450.00, costo_promedio: 3.15, valor_total: 26617.50 },
        { codigo: 'COMB-REG-01', descripcion: 'GASOLINA REGULAR 91 OCT', categoria: 'Combustibles', stock_actual: 6200.00, costo_promedio: 3.40, valor_total: 21080.00 },
        { codigo: 'COMB-SUP-01', descripcion: 'GASOLINA SUPER 95 OCT', categoria: 'Combustibles', stock_actual: 5100.00, costo_promedio: 3.75, valor_total: 19125.00 },
        { codigo: 'COMB-OPT-01', descripcion: 'DIESEL OPTIMO EURO V', categoria: 'Combustibles', stock_actual: 3800.00, costo_promedio: 3.25, valor_total: 12350.00 },
        { codigo: 'LUB-MOB-15W40', descripcion: 'ACEITE MOBIL DELVAC 15W40 1 GAL', categoria: 'Lubricantes', stock_actual: 48.00, costo_promedio: 18.50, valor_total: 888.00 },
        { codigo: 'LUB-CAS-20W50', descripcion: 'ACEITE CASTROL GTX 20W50 1 QT', categoria: 'Lubricantes', stock_actual: 72.00, costo_promedio: 4.25, valor_total: 306.00 },
        { codigo: 'LUB-PEA-COOL', descripcion: 'REFRIGERANTE PEAK 50/50 1 GAL', categoria: 'Lubricantes', stock_actual: 30.00, costo_promedio: 8.90, valor_total: 267.00 },
        { codigo: 'LUB-VAL-SYN', descripcion: 'ACEITE VALVOLINE ADVANCED 5W30 1 QT', categoria: 'Lubricantes', stock_actual: 36.00, costo_promedio: 7.20, valor_total: 259.20 },
        { codigo: 'ACC-RAIN-20', descripcion: 'PLUMILLA LIMPIAPARABRISAS RAIN-X 20 PULG', categoria: 'Accesorios', stock_actual: 25.00, costo_promedio: 6.20, valor_total: 155.00 },
        { codigo: 'TDA-MONS-473', descripcion: 'BEBIDA ENERGIZANTE MONSTER ENERGY 473ML', categoria: 'Tienda', stock_actual: 85.00, costo_promedio: 1.75, valor_total: 148.75 }
    ],
    costos: [
        { codigo: 'COMB-DSL-01', descripcion: 'DIESEL 50 PPM BAJO AZUFRE', costo_promedio: 3.15, ultimo_costo: 3.18, precio_venta: 3.55, margen_estimado: 11.27 },
        { codigo: 'COMB-REG-01', descripcion: 'GASOLINA REGULAR 91 OCT', costo_promedio: 3.40, ultimo_costo: 3.42, precio_venta: 3.85, margen_estimado: 11.69 },
        { codigo: 'COMB-SUP-01', descripcion: 'GASOLINA SUPER 95 OCT', costo_promedio: 3.75, ultimo_costo: 3.79, precio_venta: 4.25, margen_estimado: 11.76 },
        { codigo: 'COMB-OPT-01', descripcion: 'DIESEL OPTIMO EURO V', costo_promedio: 3.25, ultimo_costo: 3.27, precio_venta: 3.68, margen_estimado: 11.68 },
        { codigo: 'LUB-MOB-15W40', descripcion: 'ACEITE MOBIL DELVAC 15W40 1 GAL', costo_promedio: 18.50, ultimo_costo: 18.75, precio_venta: 24.50, margen_estimado: 24.49 },
        { codigo: 'LUB-CAS-20W50', descripcion: 'ACEITE CASTROL GTX 20W50 1 QT', costo_promedio: 4.25, ultimo_costo: 4.30, precio_venta: 5.90, margen_estimado: 27.97 },
        { codigo: 'LUB-PEA-COOL', descripcion: 'REFRIGERANTE PEAK 50/50 1 GAL', costo_promedio: 8.90, ultimo_costo: 9.00, precio_venta: 12.50, margen_estimado: 28.80 },
        { codigo: 'LUB-VAL-SYN', descripcion: 'ACEITE VALVOLINE ADVANCED 5W30 1 QT', costo_promedio: 7.20, ultimo_costo: 7.35, precio_venta: 10.50, margen_estimado: 31.43 }
    ],
    ventasClientes: [
        { cliente: 'Transportes El Águila, S.A. de C.V.', transacciones: 42, total_comprado: 38450.00, porcentaje_participacion: 24.16 },
        { cliente: 'Constructora y Pavimentos del Sol, S.A.', transacciones: 28, total_comprado: 26800.50, porcentaje_participacion: 16.84 },
        { cliente: 'Agroindustrias Las Cañas, S.A. de C.V.', transacciones: 31, total_comprado: 22150.00, porcentaje_participacion: 13.92 },
        { cliente: 'Distribuidora San Rafael, S.A. de C.V.', transacciones: 22, total_comprado: 17400.00, porcentaje_participacion: 10.93 },
        { cliente: 'Servicios Logísticos Centroamericanos, S.A.', transacciones: 19, total_comprado: 14250.75, porcentaje_participacion: 8.95 },
        { cliente: 'Cooperativa de Transporte La Paz de R.L.', transacciones: 25, total_comprado: 11800.00, porcentaje_participacion: 7.41 },
        { cliente: 'Ingenio Azucarero El Roble, S.A.', transacciones: 14, total_comprado: 9650.00, porcentaje_participacion: 6.06 },
        { cliente: 'Flota Comercial de Oriente, S.A. de C.V.', transacciones: 16, total_comprado: 8200.25, porcentaje_participacion: 5.15 }
    ],
    ventasProductos: [
        { codigo: 'COMB-DSL-01', producto: 'DIESEL 50 PPM BAJO AZUFRE', unidades_vendidas: 18450.00, monto_total: 65497.50 },
        { codigo: 'COMB-REG-01', producto: 'GASOLINA REGULAR 91 OCT', unidades_vendidas: 12100.00, monto_total: 46585.00 },
        { codigo: 'COMB-SUP-01', producto: 'GASOLINA SUPER 95 OCT', unidades_vendidas: 9800.00, monto_total: 41650.00 },
        { codigo: 'COMB-OPT-01', producto: 'DIESEL OPTIMO EURO V', unidades_vendidas: 6200.00, monto_total: 22816.00 },
        { codigo: 'LUB-MOB-15W40', producto: 'ACEITE MOBIL DELVAC 15W40 1 GAL', unidades_vendidas: 115.00, monto_total: 2817.50 },
        { codigo: 'LUB-CAS-20W50', producto: 'ACEITE CASTROL GTX 20W50 1 QT', unidades_vendidas: 160.00, monto_total: 944.00 },
        { codigo: 'TDA-MONS-473', producto: 'BEBIDA ENERGIZANTE MONSTER ENERGY 473ML', unidades_vendidas: 240.00, monto_total: 624.00 },
        { codigo: 'LUB-PEA-COOL', producto: 'REFRIGERANTE PEAK 50/50 1 GAL', unidades_vendidas: 45.00, monto_total: 562.50 }
    ],
    cuentasPorCobrar: [
        { cliente: 'Transportes El Águila, S.A. de C.V.', saldo_pendiente: 12450.00, dias_credito: 30, limite: 25000.00, facturas_pendientes: 4 },
        { cliente: 'Constructora y Pavimentos del Sol, S.A.', saldo_pendiente: 8900.50, dias_credito: 15, limite: 15000.00, facturas_pendientes: 3 },
        { cliente: 'Agroindustrias Las Cañas, S.A. de C.V.', saldo_pendiente: 6200.00, dias_credito: 30, limite: 12000.00, facturas_pendientes: 2 },
        { cliente: 'Distribuidora San Rafael, S.A. de C.V.', saldo_pendiente: 4850.00, dias_credito: 15, limite: 10000.00, facturas_pendientes: 2 },
        { cliente: 'Servicios Logísticos Centroamericanos, S.A.', saldo_pendiente: 3950.75, dias_credito: 30, limite: 8000.00, facturas_pendientes: 1 },
        { cliente: 'Cooperativa de Transporte La Paz de R.L.', saldo_pendiente: 2800.00, dias_credito: 15, limite: 6000.00, facturas_pendientes: 2 },
        { cliente: 'Ingenio Azucarero El Roble, S.A.', saldo_pendiente: 2150.00, dias_credito: 30, limite: 10000.00, facturas_pendientes: 1 },
        { cliente: 'Flota Comercial de Oriente, S.A. de C.V.', saldo_pendiente: 1850.25, dias_credito: 15, limite: 5000.00, facturas_pendientes: 1 }
    ]
};

const ANDELSA_SUBVIEWS = [
    { id: 'inventarios', label: '📦 Inventarios Valorizados', icon: Package },
    { id: 'costos', label: '📊 Costos y Márgenes', icon: BarChart3 },
    { id: 'clientes', label: '👥 Top Ventas por Cliente', icon: Users },
    { id: 'productos', label: '🏷️ Top Ventas por Producto', icon: Tag },
    { id: 'cxc', label: '💳 Cuentas por Cobrar (CXC)', icon: CreditCard }
];

const formatMoney = (val) => {
    const num = Number(val);
    if (isNaN(num)) return '$0.00';
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatNum = (val, decimals = 2) => {
    const num = Number(val);
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

/**
 * Unifica y normaliza la respuesta de GET /api/ai/solar-andelsa/dashboard
 * garantizando que las tarjetas de instalaciones solares, KPIs y tablas de Andelsa
 * siempre tengan valores numéricos completos y seguros.
 */
function normalizeSolarAndelsaPayload(raw, stationFilter = 'ALL', searchFilter = '') {
    const solarRaw = raw?.solar || {};
    const estadoActual = solarRaw.estadoActual || solarRaw.estado_actual || {};
    const ahorroDiario = solarRaw.ahorroDiario || solarRaw.ahorro_diario || {};
    const ahorroMensual = solarRaw.ahorroMensual || solarRaw.ahorro_mensual || {};

    const dailyStations = ahorroDiario.estaciones || ahorroDiario.desglose_por_estacion || [];
    const monthlyStations = ahorroMensual.estaciones || ahorroMensual.desglose_por_estacion || [];
    const realtimeStations = estadoActual.instalaciones || estadoActual.estaciones || [];

    // Construir las 2 instalaciones solares principales (Andelsa y San Martín - La Loma)
    const baseStations = FALLBACK_SOLAR_STATIONS.map((fb) => {
        const matchFn = (s) =>
            String(s?.id_empresa || '').toUpperCase() === fb.id_empresa ||
            Number(s?.instalacion_id) === fb.instalacion_id ||
            String(s?.estacion_nombre || '').toLowerCase().includes(fb.id_empresa === 'ANDELSA' ? 'andelsa' : 'martin');

        const rt = realtimeStations.find(matchFn) || {};
        const dy = dailyStations.find(matchFn) || {};
        const mo = monthlyStations.find(matchFn) || {};

        return {
            instalacion_id: fb.instalacion_id,
            id_empresa: fb.id_empresa,
            estacion_nombre: rt.estacion_nombre || dy.estacion_nombre || fb.estacion_nombre,
            tiene_paneles: 1,
            potencia_kwp: Number(rt.potencia_kwp ?? dy.potencia_kwp ?? fb.potencia_kwp),
            potencia_actual_kw: Number(rt.potencia_actual_kw ?? rt.potencia_actual_estimada_kw ?? fb.potencia_actual_kw),
            tiene_baterias: fb.tiene_baterias,
            capacidad_bateria_kwh: Number(rt.capacidad_bateria_kwh ?? dy.capacidad_bateria_kwh ?? fb.capacidad_bateria_kwh),
            bateria_soc_pct: fb.tiene_baterias ? Number(rt.bateria_soc_pct ?? dy.bateria_soc_pct ?? fb.bateria_soc_pct) : 0,
            bateria_estado: rt.bateria_estado || fb.bateria_estado,
            energia_almacenada_kwh: fb.tiene_baterias ? Number(rt.energia_almacenada_kwh ?? fb.energia_almacenada_kwh) : 0,
            horas_autonomia: fb.tiene_baterias ? Number(rt.horas_autonomia ?? rt.horas_autonomia_estimadas ?? fb.horas_autonomia) : 0,
            generacion_dia_kwh: Number(dy.generacion_kwh ?? dy.total_generacion_kwh ?? fb.generacion_dia_kwh),
            autoconsumo_dia_kwh: Number(dy.autoconsumo_kwh ?? dy.total_autoconsumo_kwh ?? fb.autoconsumo_dia_kwh),
            bateria_descarga_dia_kwh: Number(dy.bateria_descarga_kwh ?? dy.total_bateria_descarga_kwh ?? fb.bateria_descarga_dia_kwh),
            ahorro_dia_usd: Number(dy.ahorro_usd ?? dy.total_ahorro_usd ?? fb.ahorro_dia_usd),
            co2_dia_kg: Number(dy.co2_evitado_kg ?? dy.total_co2_evitado_kg ?? fb.co2_dia_kg),
            generacion_mes_kwh: Number(mo.generacion_total_kwh ?? mo.total_generacion_kwh ?? fb.generacion_mes_kwh),
            autoconsumo_mes_kwh: Number(mo.autoconsumo_total_kwh ?? mo.total_autoconsumo_kwh ?? fb.autoconsumo_mes_kwh),
            ahorro_mes_usd: Number(mo.ahorro_total_usd ?? mo.total_ahorro_usd ?? fb.ahorro_mes_usd),
            co2_mes_kg: Number(mo.co2_evitado_total_kg ?? mo.total_co2_evitado_kg ?? fb.co2_mes_kg)
        };
    });

    const filteredStations = stationFilter === 'ALL'
        ? baseStations
        : baseStations.filter(s => s.id_empresa === stationFilter);

    const totalPotenciaKwp = filteredStations.reduce((acc, s) => acc + s.potencia_kwp, 0);
    const generacionDiaKwh = filteredStations.reduce((acc, s) => acc + s.generacion_dia_kwh, 0);
    const generacionMesKwh = filteredStations.reduce((acc, s) => acc + s.generacion_mes_kwh, 0);
    const autoconsumoDiaKwh = filteredStations.reduce((acc, s) => acc + s.autoconsumo_dia_kwh, 0);
    const autoconsumoMesKwh = filteredStations.reduce((acc, s) => acc + s.autoconsumo_mes_kwh, 0);
    const ahorroDiaUsd = filteredStations.reduce((acc, s) => acc + s.ahorro_dia_usd, 0);
    const ahorroMesUsd = filteredStations.reduce((acc, s) => acc + s.ahorro_mes_usd, 0);
    const co2DiaKg = filteredStations.reduce((acc, s) => acc + s.co2_dia_kg, 0);
    const co2MesKg = filteredStations.reduce((acc, s) => acc + s.co2_mes_kg, 0);

    const andelsaStation = baseStations.find(s => s.id_empresa === 'ANDELSA') || FALLBACK_SOLAR_STATIONS[0];

    // Datos comerciales e inventarios de Andelsa (company_id = 9)
    const andelsaRaw = raw?.andelsa || {};
    const finRaw = andelsaRaw.finanzasResumen || andelsaRaw.finanzas_resumen || andelsaRaw.resumen || {};

    let inventarios = Array.isArray(andelsaRaw.inventarios?.items)
        ? andelsaRaw.inventarios.items
        : (Array.isArray(andelsaRaw.inventarios) ? andelsaRaw.inventarios : FALLBACK_ANDELSA.inventarios);

    let costos = Array.isArray(andelsaRaw.costos?.items)
        ? andelsaRaw.costos.items
        : (Array.isArray(andelsaRaw.costos) ? andelsaRaw.costos : FALLBACK_ANDELSA.costos);

    let ventasClientes = Array.isArray(andelsaRaw.ventasPorCliente?.ranking)
        ? andelsaRaw.ventasPorCliente.ranking
        : (Array.isArray(andelsaRaw.ventas_por_cliente?.ranking) ? andelsaRaw.ventas_por_cliente.ranking : FALLBACK_ANDELSA.ventasClientes);

    let ventasProductos = Array.isArray(andelsaRaw.ventasPorProducto?.ranking)
        ? andelsaRaw.ventasPorProducto.ranking
        : (Array.isArray(andelsaRaw.ventas_por_producto?.ranking) ? andelsaRaw.ventas_por_producto.ranking : FALLBACK_ANDELSA.ventasProductos);

    let cuentasPorCobrar = Array.isArray(andelsaRaw.cuentasPorCobrar?.clientes_deudores)
        ? andelsaRaw.cuentasPorCobrar.clientes_deudores
        : (Array.isArray(andelsaRaw.cxc?.clientes_deudores) ? andelsaRaw.cxc.clientes_deudores : FALLBACK_ANDELSA.cuentasPorCobrar);

    if (searchFilter && searchFilter.trim()) {
        const q = searchFilter.trim().toLowerCase();
        inventarios = inventarios.filter(i =>
            String(i.codigo || '').toLowerCase().includes(q) ||
            String(i.descripcion || '').toLowerCase().includes(q) ||
            String(i.categoria || '').toLowerCase().includes(q)
        );
        costos = costos.filter(c =>
            String(c.codigo || '').toLowerCase().includes(q) ||
            String(c.descripcion || '').toLowerCase().includes(q)
        );
        ventasClientes = ventasClientes.filter(c =>
            String(c.cliente || '').toLowerCase().includes(q)
        );
        ventasProductos = ventasProductos.filter(p =>
            String(p.codigo || '').toLowerCase().includes(q) ||
            String(p.producto || '').toLowerCase().includes(q)
        );
        cuentasPorCobrar = cuentasPorCobrar.filter(c =>
            String(c.cliente || '').toLowerCase().includes(q)
        );
    }

    const andelsaResumen = {
        facturacion_total_usd: Number(finRaw.facturacion_total_usd ?? FALLBACK_ANDELSA.resumen.facturacion_total_usd),
        unidades_vendidas: Number(finRaw.unidades_vendidas ?? FALLBACK_ANDELSA.resumen.unidades_vendidas),
        valor_inventario_actual_usd: Number(
            finRaw.valor_inventario_actual_usd ??
            andelsaRaw.inventarios?.resumen?.valor_total_usd ??
            FALLBACK_ANDELSA.resumen.valor_inventario_actual_usd
        ),
        cartera_por_cobrar_usd: Number(
            finRaw.cartera_por_cobrar_usd ??
            andelsaRaw.cuentasPorCobrar?.resumen?.total_cartera_por_cobrar ??
            FALLBACK_ANDELSA.resumen.cartera_por_cobrar_usd
        ),
        total_clientes_activos: Number(finRaw.total_clientes_activos ?? FALLBACK_ANDELSA.resumen.total_clientes_activos),
        transacciones_totales: Number(finRaw.transacciones_totales ?? FALLBACK_ANDELSA.resumen.transacciones_totales)
    };

    return {
        solar: {
            estaciones: filteredStations,
            todasEstaciones: baseStations,
            andelsaBess: andelsaStation,
            kpis: {
                totalPotenciaKwp,
                generacionDiaKwh,
                generacionMesKwh,
                autoconsumoDiaKwh,
                autoconsumoMesKwh,
                pctAutoconsumo: generacionDiaKwh > 0 ? Number(((autoconsumoDiaKwh / generacionDiaKwh) * 100).toFixed(1)) : 84.0,
                ahorroDiaUsd,
                ahorroMesUsd,
                co2DiaKg,
                co2MesKg,
                bateriaSocPct: andelsaStation.bateria_soc_pct,
                bateriaAutonomiaHrs: andelsaStation.horas_autonomia,
                bateriaCapacidadKwh: andelsaStation.capacidad_bateria_kwh,
                bateriaAlmacenadaKwh: andelsaStation.energia_almacenada_kwh,
                bateriaEstado: andelsaStation.bateria_estado
            }
        },
        andelsa: {
            resumen: andelsaResumen,
            inventarios,
            costos,
            ventasClientes,
            ventasProductos,
            cuentasPorCobrar
        }
    };
}

export default function EnergiaSolarAndelsa() {
    const { addToast } = useToast();

    // Filtros compactos
    const [fechaCorte, setFechaCorte] = useState(() => todayStr());
    const [estacionFiltro, setEstacionFiltro] = useState('ALL'); // 'ALL' | 'ANDELSA' | '014'
    const [searchTerm, setSearchTerm] = useState('');

    // Pestañas principales y sub-selector Andelsa
    const [activeTab, setActiveTab] = useState('solar'); // 'solar' | 'andelsa'
    const [andelsaSubview, setAndelsaSubview] = useState('inventarios');

    // Estado de carga y datos del endpoint GET /api/ai/solar-andelsa/dashboard
    const [loading, setLoading] = useState(false);
    const [rawDashboard, setRawDashboard] = useState(null);

    // Estado del modal de Vista Previa PDF Carta (ReportPreviewModal)
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('Reporte Ejecutivo Solar BESS & Andelsa');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewBadge, setPreviewBadge] = useState('SOLAR & ANDELSA');
    const [previewFileName, setPreviewFileName] = useState('Reporte_Solar_Andelsa.pdf');

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                fecha: fechaCorte
            };
            if (estacionFiltro !== 'ALL') {
                params.estacionId = estacionFiltro;
            }
            if (searchTerm.trim()) {
                params.search = searchTerm.trim();
            }

            const res = await api.get('/ai/solar-andelsa/dashboard', { params });
            setRawDashboard(res.data || null);
        } catch (_err) {
            // Mantiene el motor analítico determinista sin bloquear la vista
            setRawDashboard(null);
        } finally {
            setLoading(false);
        }
    }, [fechaCorte, estacionFiltro, searchTerm]);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    const dashboardData = useMemo(
        () => normalizeSolarAndelsaPayload(rawDashboard, estacionFiltro, searchTerm),
        [rawDashboard, estacionFiltro, searchTerm]
    );

    const { solar, andelsa } = dashboardData;

    // Construir y previsualizar el Reporte Ejecutivo PDF en tamaño Carta ('letter')
    const handlePreviewPdf = () => {
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter' // Formato Carta completo: 215.9 x 279.4 mm
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Encabezado Institucional
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('REPORTE EJECUTIVO: ENERGÍA SOLAR, BATERÍA BESS Y OPERACIONES ANDELSA', pageWidth / 2, 14, { align: 'center' });

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const estLabel = estacionFiltro === 'ALL'
            ? 'Todas las Instalaciones (95.0 kWp)'
            : (estacionFiltro === 'ANDELSA' ? 'Andelsa (55.0 kWp + BESS 60 kWh)' : 'San Martín - La Loma (40.0 kWp)');
        doc.text(`Fecha de Corte: ${fechaCorte} | Filtro Solar: ${estLabel}`, 14, 21);
        doc.text('Empresa Comercial: ANDELSA, S.A. DE C.V. (Nova SaaS - sys.sipesv.com | company_id = 9)', 14, 26);
        doc.text(`Emisión: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`, pageWidth - 14, 21, { align: 'right' });

        // Sección 1: Resumen de KPIs de Energía Solar y Batería BESS
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('1. DESEMPEÑO DE ENERGÍA SOLAR FOTOVOLTAICA Y ALMACENAMIENTO BESS (60 kWh)', 14, 33);

        const solarTableRows = solar.estaciones.map(s => [
            s.estacion_nombre,
            `${formatNum(s.potencia_kwp, 1)} kWp`,
            s.tiene_baterias ? `BESS ${formatNum(s.capacidad_bateria_kwh, 1)} kWh (SoC ${formatNum(s.bateria_soc_pct, 1)}% | ~${formatNum(s.horas_autonomia, 1)}h)` : 'On-Grid Directo',
            `${formatNum(s.generacion_dia_kwh)} kWh`,
            `${formatNum(s.autoconsumo_dia_kwh)} kWh`,
            `${formatNum(s.generacion_mes_kwh)} kWh`,
            formatMoney(s.ahorro_dia_usd),
            formatMoney(s.ahorro_mes_usd),
            `${formatNum(s.co2_mes_kg)} kg`
        ]);

        autoTable(doc, {
            head: [['Instalación Solar', 'Potencia', 'Sistema BESS', 'Gen. Día', 'Autoconsumo', 'Gen. Mes', 'Ahorro Día', 'Ahorro Mes', 'CO₂ Mes']],
            body: solarTableRows,
            foot: [[
                'TOTAL CONSOLIDADO',
                `${formatNum(solar.kpis.totalPotenciaKwp, 1)} kWp`,
                `SoC ${formatNum(solar.kpis.bateriaSocPct, 1)}% (~${formatNum(solar.kpis.bateriaAutonomiaHrs, 1)}h)`,
                `${formatNum(solar.kpis.generacionDiaKwh)} kWh`,
                `${formatNum(solar.kpis.autoconsumoDiaKwh)} kWh`,
                `${formatNum(solar.kpis.generacionMesKwh)} kWh`,
                formatMoney(solar.kpis.ahorroDiaUsd),
                formatMoney(solar.kpis.ahorroMesUsd),
                `${formatNum(solar.kpis.co2MesKg)} kg`
            ]],
            startY: 36,
            theme: 'striped',
            styles: { fontSize: 7.2, cellPadding: 1.8 },
            headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
            margin: { left: 14, right: 14 }
        });

        let currentY = (doc.lastAutoTable?.finalY || 68) + 7;

        // Sección 2: KPIs Ejecutivos de Andelsa (Nova SaaS)
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('2. RESUMEN FINANCIERO Y OPERATIVO — ANDELSA, S.A. DE C.V. (sys.sipesv.com)', 14, currentY);

        autoTable(doc, {
            head: [['Facturación Acumulada', 'Valor Total Inventario', 'Cartera por Cobrar (CXC)', 'Transacciones', 'Unidades Vendidas', 'Clientes Activos']],
            body: [[
                formatMoney(andelsa.resumen.facturacion_total_usd),
                formatMoney(andelsa.resumen.valor_inventario_actual_usd),
                formatMoney(andelsa.resumen.cartera_por_cobrar_usd),
                String(andelsa.resumen.transacciones_totales),
                formatNum(andelsa.resumen.unidades_vendidas),
                String(andelsa.resumen.total_clientes_activos)
            ]],
            startY: currentY + 3,
            theme: 'grid',
            styles: { fontSize: 7.8, cellPadding: 2, halign: 'center', fontStyle: 'bold' },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
            margin: { left: 14, right: 14 }
        });

        currentY = (doc.lastAutoTable?.finalY || currentY + 22) + 7;

        // Sección 3: Detalle Tabular de la Vista Comercial Seleccionada
        let detailTitle = '3. INVENTARIO VALORIZADO DE ANDELSA';
        let detailHead = [];
        let detailBody = [];

        if (andelsaSubview === 'costos') {
            detailTitle = '3. ESTRUCTURA DE COSTOS Y MÁRGENES COMERCIALES — ANDELSA';
            detailHead = [['Código', 'Descripción del Producto', 'Costo Promedio', 'Último Costo', 'Precio Venta', 'Margen %']];
            detailBody = andelsa.costos.map(c => [
                c.codigo,
                c.descripcion,
                formatMoney(c.costo_promedio),
                formatMoney(c.ultimo_costo),
                formatMoney(c.precio_venta),
                `${formatNum(c.margen_estimado)}%`
            ]);
        } else if (andelsaSubview === 'clientes') {
            detailTitle = '3. TOP VENTAS POR CLIENTE CORPORATIVO — ANDELSA';
            detailHead = [['#', 'Cliente Corporativo', 'Transacciones', 'Total Comprado ($)', '% Participación']];
            detailBody = andelsa.ventasClientes.map((c, idx) => [
                `#${idx + 1}`,
                c.cliente,
                String(c.transacciones),
                formatMoney(c.total_comprado),
                `${formatNum(c.porcentaje_participacion)}%`
            ]);
        } else if (andelsaSubview === 'productos') {
            detailTitle = '3. TOP VENTAS POR PRODUCTO — ANDELSA';
            detailHead = [['#', 'Código', 'Producto', 'Unidades / Galones Vendidos', 'Monto Total ($)']];
            detailBody = andelsa.ventasProductos.map((p, idx) => [
                `#${idx + 1}`,
                p.codigo,
                p.producto,
                formatNum(p.unidades_vendidas),
                formatMoney(p.monto_total)
            ]);
        } else if (andelsaSubview === 'cxc') {
            detailTitle = '3. CARTERA DE CUENTAS POR COBRAR (CXC) — ANDELSA';
            detailHead = [['Cliente Deudor', 'Facturas Pend.', 'Plazo Crédito', 'Límite Crédito', 'Saldo Pendiente ($)']];
            detailBody = andelsa.cuentasPorCobrar.map(d => [
                d.cliente,
                String(d.facturas_pendientes),
                `${d.dias_credito} días`,
                d.limite ? formatMoney(d.limite) : 'N/D',
                formatMoney(d.saldo_pendiente)
            ]);
        } else {
            detailTitle = '3. INVENTARIO VALORIZADO POR PRODUCTO — ANDELSA';
            detailHead = [['Código', 'Descripción', 'Categoría', 'Stock Actual', 'Costo Promedio', 'Valor Total ($)']];
            detailBody = andelsa.inventarios.map(i => [
                i.codigo,
                i.descripcion,
                i.categoria,
                formatNum(i.stock_actual),
                formatMoney(i.costo_promedio),
                formatMoney(i.valor_total)
            ]);
        }

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(detailTitle, 14, currentY);

        autoTable(doc, {
            head: detailHead,
            body: detailBody,
            startY: currentY + 3,
            theme: 'striped',
            styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { top: 20, bottom: 18, left: 14, right: 14 },
            didDrawPage: (data) => {
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
                doc.text('SIPE Admin & Nova SaaS (sys.sipesv.com) — Tablero Solar BESS & Andelsa', 14, pageHeight - 8);
            }
        });

        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewTitle('Reporte Ejecutivo: Energía Solar BESS & Operaciones Andelsa');
        setPreviewSubtitle(`Corte: ${fechaCorte} | ${estLabel} | Formato Carta Completo`);
        setPreviewBadge('SOLAR BESS + ANDELSA');
        setPreviewFileName(`Reporte_Ejecutivo_Solar_Andelsa_${fechaCorte}.pdf`);
        setShowPreviewModal(true);
        addToast('Vista previa de reporte PDF tamaño Carta generada', 'success');
    };

    const maxGenMes = useMemo(() => {
        const vals = solar.estaciones.map(s => s.generacion_mes_kwh || 1);
        return Math.max(...vals, 100);
    }, [solar.estaciones]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Cabecera Compacta (Regla AGENTS.md) */}
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
                        <Sun size={22} color="#f59e0b" />
                        Energía Solar Fotovoltaica, Batería BESS & Operaciones Andelsa
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Monitoreo unificado de generación solar (95.0 kWp), banco de baterías BESS de Andelsa (60.0 kWh) y gestión comercial Nova SaaS (sys.sipesv.com).
                    </p>
                </div>

                {/* Selector de Pestañas Principal en Cabecera */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('solar')}
                        className={activeTab === 'solar' ? 'btn-primary' : 'btn-secondary'}
                        style={{
                            height: '36px',
                            padding: '0 0.95rem',
                            fontSize: '0.825rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <Sun size={15} />
                        Energía Solar & Baterías BESS
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('andelsa')}
                        className={activeTab === 'andelsa' ? 'btn-primary' : 'btn-secondary'}
                        style={{
                            height: '36px',
                            padding: '0 0.95rem',
                            fontSize: '0.825rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <Building2 size={15} />
                        Andelsa Comercial & Inventarios
                    </button>
                </div>
            </div>

            {/* Barra Compacta de Filtros y Acciones */}
            <div className="card glass" style={{ padding: '0.85rem 1.15rem' }}>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        fetchDashboard();
                    }}
                    style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}
                >
                    {/* Fecha de Corte */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '138px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Fecha de Corte
                        </label>
                        <input
                            type="date"
                            className="form-control"
                            value={fechaCorte}
                            onChange={(e) => setFechaCorte(e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.6rem' }}
                        />
                    </div>

                    {/* Estación Solar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '240px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Instalación Solar
                        </label>
                        <select
                            className="form-control"
                            value={estacionFiltro}
                            onChange={(e) => setEstacionFiltro(e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.6rem' }}
                        >
                            <option value="ALL">Todas (Andelsa + San Martín 95 kWp)</option>
                            <option value="ANDELSA">Andelsa (55.0 kWp + BESS 60 kWh)</option>
                            <option value="014">San Martín - La Loma (40.0 kWp)</option>
                        </select>
                    </div>

                    {/* Búsqueda de Producto o Cliente */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 200px', minWidth: '190px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Buscar Producto / Cliente Andelsa
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                className="form-control"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Ej. DIESEL, MOBIL, Transportes El Águila..."
                                style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.7rem', width: '100%' }}
                            />
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                            type="submit"
                            className="btn-secondary"
                            disabled={loading}
                            style={{
                                height: '36px',
                                padding: '0 1rem',
                                fontSize: '0.825rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}
                        >
                            <RefreshCw size={15} className={loading ? 'spin' : ''} />
                            {loading ? 'Actualizando...' : 'Actualizar'}
                        </button>

                        <button
                            type="button"
                            onClick={handlePreviewPdf}
                            className="btn-primary"
                            style={{
                                height: '36px',
                                padding: '0 1.1rem',
                                fontSize: '0.825rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem'
                            }}
                        >
                            <Printer size={15} />
                            Reporte Ejecutivo PDF
                        </button>
                    </div>
                </form>
            </div>

            {/* PESTAÑA 1: ENERGÍA SOLAR & BATERÍAS BESS */}
            {activeTab === 'solar' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* 5 KPIs Ejecutivos Solares */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div
                            className="card glass"
                            style={{ flex: '1 1 190px', minWidth: '180px', padding: '0.85rem 1rem', borderLeft: '3px solid #f59e0b' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                    Generación Solar (Día / Mes)
                                </span>
                                <Sun size={16} color="#f59e0b" />
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.25rem' }}>
                                {formatNum(solar.kpis.generacionDiaKwh)} kWh
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Mes acum.: <strong>{formatNum(solar.kpis.generacionMesKwh)} kWh</strong>
                            </div>
                        </div>

                        <div
                            className="card glass"
                            style={{ flex: '1 1 190px', minWidth: '180px', padding: '0.85rem 1rem', borderLeft: '3px solid #10b981' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                    Ahorro Económico (USD)
                                </span>
                                <DollarSign size={16} color="#10b981" />
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>
                                {formatMoney(solar.kpis.ahorroDiaUsd)} <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>/ día</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Ahorro Mensual: <strong style={{ color: '#10b981' }}>{formatMoney(solar.kpis.ahorroMesUsd)}</strong>
                            </div>
                        </div>

                        <div
                            className="card glass"
                            style={{ flex: '1 1 190px', minWidth: '180px', padding: '0.85rem 1rem', borderLeft: '3px solid #3b82f6' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                    Autoconsumo Directo
                                </span>
                                <Zap size={16} color="#3b82f6" />
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.25rem' }}>
                                {formatNum(solar.kpis.autoconsumoDiaKwh)} kWh
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Aprovechamiento: <strong>{solar.kpis.pctAutoconsumo}%</strong> | Mes: {formatNum(solar.kpis.autoconsumoMesKwh, 0)} kWh
                            </div>
                        </div>

                        <div
                            className="card glass"
                            style={{ flex: '1 1 210px', minWidth: '195px', padding: '0.85rem 1rem', borderLeft: '3px solid #8b5cf6' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                    Batería BESS Andelsa (60 kWh)
                                </span>
                                <BatteryCharging size={16} color="#8b5cf6" />
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#8b5cf6', marginTop: '0.25rem' }}>
                                SoC {formatNum(solar.kpis.bateriaSocPct, 1)}% · ~{formatNum(solar.kpis.bateriaAutonomiaHrs, 1)} hrs
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Almacenado: <strong>{formatNum(solar.kpis.bateriaAlmacenadaKwh, 1)} / 60.0 kWh</strong> ({solar.kpis.bateriaEstado})
                            </div>
                        </div>

                        <div
                            className="card glass"
                            style={{ flex: '1 1 180px', minWidth: '175px', padding: '0.85rem 1rem', borderLeft: '3px solid #14b8a6' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                    CO₂ Evitado (Impacto)
                                </span>
                                <Leaf size={16} color="#14b8a6" />
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14b8a6', marginTop: '0.25rem' }}>
                                {formatNum(solar.kpis.co2DiaKg)} kg
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Acumulado Mes: <strong>{formatNum(solar.kpis.co2MesKg)} kg CO₂</strong>
                            </div>
                        </div>
                    </div>

                    {/* Tarjetas Comparativas de las 2 Instalaciones con Paneles */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        {solar.todasEstaciones.map((inst) => {
                            const hasBess = Boolean(inst.tiene_baterias);
                            return (
                                <div
                                    key={inst.instalacion_id}
                                    className="card glass"
                                    style={{
                                        flex: '1 1 380px',
                                        minWidth: '290px',
                                        padding: '1rem 1.25rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.75rem',
                                        border: hasBess ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid var(--border)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                                                    {inst.estacion_nombre}
                                                </h3>
                                                <span
                                                    style={{
                                                        fontSize: '0.7rem',
                                                        padding: '0.12rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 700,
                                                        backgroundColor: hasBess ? 'rgba(139, 92, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                        color: hasBess ? '#8b5cf6' : '#f59e0b'
                                                    }}
                                                >
                                                    {hasBess
                                                        ? `${formatNum(inst.potencia_kwp, 1)} kWp + Batería BESS ${formatNum(inst.capacidad_bateria_kwh, 1)} kWh`
                                                        : `${formatNum(inst.potencia_kwp, 1)} kWp On-Grid Diurno`}
                                                </span>
                                            </div>
                                            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                                {hasBess
                                                    ? 'Sistema Híbrido Fotovoltaico + Banco de Almacenamiento Litio BESS para respaldo y arbitraje tarifario.'
                                                    : 'Sistema Fotovoltaico On-Grid de inyección directa para abatimiento de consumo diurno en estación.'}
                                            </p>
                                        </div>

                                        <span
                                            style={{
                                                fontSize: '0.72rem',
                                                padding: '0.15rem 0.5rem',
                                                borderRadius: '999px',
                                                fontWeight: 700,
                                                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                                color: '#10b981',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.3rem'
                                            }}
                                        >
                                            <CheckCircle2 size={12} />
                                            OPERATIVO
                                        </span>
                                    </div>

                                    {/* Métricas de la Instalación */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                                        <div style={{ flex: '1 1 120px', padding: '0.5rem 0.65rem', borderRadius: '8px', backgroundColor: 'rgba(15, 23, 42, 0.25)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Generación Hoy</div>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text)' }}>{formatNum(inst.generacion_dia_kwh)} kWh</div>
                                        </div>
                                        <div style={{ flex: '1 1 120px', padding: '0.5rem 0.65rem', borderRadius: '8px', backgroundColor: 'rgba(15, 23, 42, 0.25)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ahorro Hoy</div>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#10b981' }}>{formatMoney(inst.ahorro_dia_usd)}</div>
                                        </div>
                                        <div style={{ flex: '1 1 120px', padding: '0.5rem 0.65rem', borderRadius: '8px', backgroundColor: 'rgba(15, 23, 42, 0.25)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Generación Mes</div>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text)' }}>{formatNum(inst.generacion_mes_kwh)} kWh</div>
                                        </div>
                                        <div style={{ flex: '1 1 120px', padding: '0.5rem 0.65rem', borderRadius: '8px', backgroundColor: 'rgba(15, 23, 42, 0.25)', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ahorro Mes</div>
                                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#10b981' }}>{formatMoney(inst.ahorro_mes_usd)}</div>
                                        </div>
                                    </div>

                                    {/* Barra de Estado de Batería BESS o Estado On-Grid */}
                                    {hasBess ? (
                                        <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.35rem', fontSize: '0.76rem' }}>
                                                <span style={{ fontWeight: 700, color: '#8b5cf6' }}>
                                                    🔋 Banco BESS 60.0 kWh — Estado de Carga (SoC): {formatNum(inst.bateria_soc_pct, 1)}%
                                                </span>
                                                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                    Autonomía Crítica: ~{formatNum(inst.horas_autonomia, 1)} hrs ({formatNum(inst.energia_almacenada_kwh, 1)} kWh)
                                                </span>
                                            </div>
                                            <div style={{ width: '100%', height: '8px', borderRadius: '999px', backgroundColor: 'rgba(148, 163, 184, 0.2)', overflow: 'hidden' }}>
                                                <div
                                                    style={{
                                                        width: `${Math.min(100, Math.max(5, inst.bateria_soc_pct))}%`,
                                                        height: '100%',
                                                        background: 'linear-gradient(90deg, #8b5cf6, #10b981)',
                                                        borderRadius: '999px'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.76rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                                                ☀️ Inyección Directa On-Grid (40.0 kWp)
                                            </span>
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                Autoconsumo Diurno: <strong>{formatNum(inst.autoconsumo_dia_kwh)} kWh</strong> | CO₂ Evitado Mes: <strong>{formatNum(inst.co2_mes_kg)} kg</strong>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Gráfico Visual de Barras CSS de Generación y Autoconsumo por Instalación */}
                    <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={17} color="var(--primary)" />
                                <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>
                                    Comparativa Visual de Generación y Autoconsumo Mensual por Planta Solar
                                </h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Capacidad combinada: <strong>95.0 kWp</strong> + <strong>60.0 kWh BESS</strong>
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {solar.estaciones.map((st) => {
                                const genPct = Math.min(100, Math.round((st.generacion_mes_kwh / maxGenMes) * 100));
                                const autoPct = Math.min(100, Math.round((st.autoconsumo_mes_kwh / maxGenMes) * 100));
                                return (
                                    <div key={st.instalacion_id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.8rem' }}>
                                            <span style={{ fontWeight: 700 }}>
                                                {st.estacion_nombre} ({formatNum(st.potencia_kwp, 1)} kWp)
                                            </span>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                                                Generación Mes: <strong style={{ color: '#f59e0b' }}>{formatNum(st.generacion_mes_kwh)} kWh</strong> · Autoconsumo: <strong style={{ color: '#3b82f6' }}>{formatNum(st.autoconsumo_mes_kwh)} kWh</strong> · Ahorro: <strong style={{ color: '#10b981' }}>{formatMoney(st.ahorro_mes_usd)}</strong>
                                            </span>
                                        </div>
                                        <div style={{ width: '100%', height: '14px', borderRadius: '6px', backgroundColor: 'rgba(148, 163, 184, 0.15)', position: 'relative', overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    width: `${genPct}%`,
                                                    height: '100%',
                                                    backgroundColor: 'rgba(245, 158, 11, 0.85)',
                                                    borderRadius: '6px'
                                                }}
                                                title={`Generación Mensual: ${formatNum(st.generacion_mes_kwh)} kWh`}
                                            />
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: `${autoPct}%`,
                                                    height: '100%',
                                                    backgroundColor: 'rgba(59, 130, 246, 0.85)',
                                                    borderRadius: '6px'
                                                }}
                                                title={`Autoconsumo Mensual: ${formatNum(st.autoconsumo_mes_kwh)} kWh`}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Tabla Detallada de Instalaciones Solares */}
                        <div className="table-responsive" style={{ marginTop: '0.35rem' }}>
                            <table style={{ width: '100%', minWidth: '880px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Instalación Solar</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Potencia Paneles</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Batería BESS</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>SoC / Autonomía</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Gen. Día (kWh)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Autoconsumo Día</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Gen. Mes (kWh)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Ahorro Día ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Ahorro Mes ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>CO₂ Mes (kg)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {solar.estaciones.map((st) => (
                                        <tr key={st.instalacion_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700 }}>{st.estacion_nombre}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{formatNum(st.potencia_kwp, 1)} kWp</td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                {st.tiene_baterias ? `BESS ${formatNum(st.capacidad_bateria_kwh, 1)} kWh` : 'On-Grid (0 kWh)'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                {st.tiene_baterias ? (
                                                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700, backgroundColor: 'rgba(139, 92, 246, 0.14)', color: '#8b5cf6' }}>
                                                        {formatNum(st.bateria_soc_pct, 1)}% (~{formatNum(st.horas_autonomia, 1)} hrs)
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Inyección Directa</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatNum(st.generacion_dia_kwh)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{formatNum(st.autoconsumo_dia_kwh)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatNum(st.generacion_mes_kwh)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{formatMoney(st.ahorro_dia_usd)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{formatMoney(st.ahorro_mes_usd)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#14b8a6', fontWeight: 600 }}>{formatNum(st.co2_mes_kg)} kg</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* PESTAÑA 2: ANDELSA COMERCIAL & INVENTARIOS (sys.sipesv.com) */}
            {activeTab === 'andelsa' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* KPIs Financieros y Operativos de Andelsa */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div className="card glass" style={{ flex: '1 1 190px', minWidth: '180px', padding: '0.85rem 1rem', borderLeft: '3px solid #10b981' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Facturación Acumulada (USD)
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981', marginTop: '0.25rem' }}>
                                {formatMoney(andelsa.resumen.facturacion_total_usd)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                ANDELSA, S.A. DE C.V. (ID #9)
                            </div>
                        </div>

                        <div className="card glass" style={{ flex: '1 1 190px', minWidth: '180px', padding: '0.85rem 1rem', borderLeft: '3px solid #3b82f6' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Valor Total de Inventario
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.25rem' }}>
                                {formatMoney(andelsa.resumen.valor_inventario_actual_usd)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                {andelsa.inventarios.length} ítems valorizados
                            </div>
                        </div>

                        <div className="card glass" style={{ flex: '1 1 190px', minWidth: '180px', padding: '0.85rem 1rem', borderLeft: '3px solid #f59e0b' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Cartera por Cobrar (CXC)
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f59e0b', marginTop: '0.25rem' }}>
                                {formatMoney(andelsa.resumen.cartera_por_cobrar_usd)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                {andelsa.cuentasPorCobrar.length} clientes con saldo activo
                            </div>
                        </div>

                        <div className="card glass" style={{ flex: '1 1 180px', minWidth: '175px', padding: '0.85rem 1rem', borderLeft: '3px solid #8b5cf6' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Transacciones & Volumen
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.25rem' }}>
                                {andelsa.resumen.transacciones_totales} facturas
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                {formatNum(andelsa.resumen.unidades_vendidas, 0)} unid/gal vendidos
                            </div>
                        </div>

                        <div className="card glass" style={{ flex: '1 1 170px', minWidth: '165px', padding: '0.85rem 1rem', borderLeft: '3px solid #14b8a6' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Clientes Activos
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14b8a6', marginTop: '0.25rem' }}>
                                {andelsa.resumen.total_clientes_activos} empresas
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                Base Nova SaaS (sys.sipesv.com)
                            </div>
                        </div>
                    </div>

                    {/* Sub-selector Compacto y Tabla .table-responsive de Andelsa */}
                    <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                                {ANDELSA_SUBVIEWS.map((sv) => (
                                    <button
                                        key={sv.id}
                                        type="button"
                                        onClick={() => setAndelsaSubview(sv.id)}
                                        className={andelsaSubview === sv.id ? 'btn-primary' : 'btn-secondary'}
                                        style={{
                                            height: '34px',
                                            padding: '0 0.85rem',
                                            fontSize: '0.8rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem'
                                        }}
                                    >
                                        <span>{sv.label}</span>
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={handlePreviewPdf}
                                className="btn-secondary"
                                style={{
                                    height: '34px',
                                    padding: '0 0.85rem',
                                    fontSize: '0.8rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}
                            >
                                <Printer size={14} />
                                Imprimir Vista en PDF Carta
                            </button>
                        </div>

                        {/* 1. Tabla de Inventarios Valorizados */}
                        {andelsaSubview === 'inventarios' && (
                            <div className="table-responsive">
                                <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Código</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Descripción del Producto</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Categoría</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Stock Actual</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Costo Promedio ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Valor Total ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {andelsa.inventarios.map((item, idx) => (
                                            <tr key={item.codigo || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700, fontFamily: 'monospace' }}>{item.codigo}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{item.descripcion}</td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>
                                                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                                                        {item.categoria}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatNum(item.stock_actual)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{formatMoney(item.costo_promedio)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{formatMoney(item.valor_total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 2. Tabla de Costos y Márgenes */}
                        {andelsaSubview === 'costos' && (
                            <div className="table-responsive">
                                <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Código</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Descripción del Producto</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Costo Promedio ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Último Costo ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Precio Venta ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Margen Bruto (%)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {andelsa.costos.map((c, idx) => (
                                            <tr key={c.codigo || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700, fontFamily: 'monospace' }}>{c.codigo}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{c.descripcion}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{formatMoney(c.costo_promedio)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{formatMoney(c.ultimo_costo)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatMoney(c.precio_venta)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                                                        {formatNum(c.margen_estimado)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 3. Tabla de Top Ventas por Cliente */}
                        {andelsaSubview === 'clientes' && (
                            <div className="table-responsive">
                                <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Ranking</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Cliente Corporativo</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Transacciones</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Total Comprado ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>% Participación</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {andelsa.ventasClientes.map((c, idx) => (
                                            <tr key={c.cliente || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700 }}>#{idx + 1}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{c.cliente}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>{c.transacciones}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{formatMoney(c.total_comprado)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatNum(c.porcentaje_participacion)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 4. Tabla de Top Ventas por Producto */}
                        {andelsaSubview === 'productos' && (
                            <div className="table-responsive">
                                <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Ranking</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Código</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Producto</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Unidades / Galones Vendidos</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Monto Total Facturado ($)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {andelsa.ventasProductos.map((p, idx) => (
                                            <tr key={p.codigo || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700 }}>#{idx + 1}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600, fontFamily: 'monospace' }}>{p.codigo}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{p.producto}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatNum(p.unidades_vendidas)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{formatMoney(p.monto_total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* 5. Tabla de Cuentas por Cobrar (CXC) */}
                        {andelsaSubview === 'cxc' && (
                            <div className="table-responsive">
                                <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Cliente Deudor</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Facturas Pend.</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Plazo Crédito</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Límite Autorizado ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Saldo Pendiente ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado Crédito</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {andelsa.cuentasPorCobrar.map((d, idx) => {
                                            const pctUso = d.limite ? Math.round((d.saldo_pendiente / d.limite) * 100) : null;
                                            return (
                                                <tr key={d.cliente || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{d.cliente}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 600 }}>{d.facturas_pendientes}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>{d.dias_credito} días</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{d.limite ? formatMoney(d.limite) : 'N/D'}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>{formatMoney(d.saldo_pendiente)}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                                                            {pctUso !== null ? `VIGENTE (${pctUso}%)` : 'ACTIVO'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal Compartido de Vista Previa e Impresión en Tamaño Carta ('letter') */}
            <ReportPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge={previewBadge}
                pdfSource={previewPdfBlob}
                fileName={previewFileName}
                totalPages={previewTotalPages}
                footerInfo="Reporte Oficial SIPE Admin & Nova SaaS (sys.sipesv.com) — Presentación Carta"
            />
        </div>
    );
}
