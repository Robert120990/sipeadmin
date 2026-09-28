import React, { useState, useEffect } from 'react';
import { 
    Calendar, Search, FileSpreadsheet, Printer, 
    ChevronLeft, ChevronRight, Fuel, Store, DollarSign, 
    Layers, TrendingUp, BarChart3, LineChart,
    ArrowUpRight, ArrowDownRight, Sparkles, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReportPreviewModal from '../components/ReportPreviewModal';
import Modal from '../components/Modal';

export default function VentasEstaciones() {
    // --- ESTADO DIARIO ---
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const defaultDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const [fecha, setFecha] = useState(defaultDate);
    
    const [dataTiendas, setDataTiendas] = useState([]);
    const [dataEstaciones, setDataEstaciones] = useState([]);
    const [dataMargenes, setDataMargenes] = useState([]);
    const [dataInventario, setDataInventario] = useState([]);
    const [loading, setLoading] = useState(false);

    // --- ESTADO MENSUAL ---
    const now = new Date();
    const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [mesSeleccionado, setMesSeleccionado] = useState(defaultMes);
    const [monthlyData, setMonthlyData] = useState({
        periodo: defaultMes,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        dias_mes: 30,
        estaciones: [],
        tiendas: [],
        consolidado: [],
        totales: {
            diesel: 0, regular: 0, super: 0, ion: 0, galonaje: 0,
            venta_estacion: 0, venta_tienda: 0, venta_total: 0
        }
    });
    const [loadingMonthly, setLoadingMonthly] = useState(false);
    const [vistaMensual, setVistaMensual] = useState('consolidado'); // 'consolidado' | 'combustible' | 'tiendas'

    // --- REPORT PREVIEW MODAL ---
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [pdfSource, setPdfSource] = useState(null);
    const [previewPdfDoc, setPreviewPdfDoc] = useState(null);
    const [totalPages, setTotalPages] = useState(1);
    const [previewFileName, setPreviewFileName] = useState('');

    // --- ESTADO COMPARATIVO ANUAL ---
    const [showComparativoModal, setShowComparativoModal] = useState(false);
    const [comparativoData, setComparativoData] = useState(null);
    const [loadingComparativo, setLoadingComparativo] = useState(false);
    const [anioPrincipal, setAnioPrincipal] = useState(new Date().getFullYear());
    const [anioComparar, setAnioComparar] = useState(new Date().getFullYear() - 1);
    const [estacionFiltro, setEstacionFiltro] = useState('all'); // 'all' o id_empresa
    const [metricaFiltro, setMetricaFiltro] = useState('galonaje'); // 'galonaje' | 'venta_total' | 'venta_estacion' | 'venta_tienda' | 'diesel' | 'regular' | 'super' | 'ion'
    const [tipoGrafico, setTipoGrafico] = useState('barras'); // 'barras' | 'lineas'
    const [chartHover, setChartHover] = useState(null); // mes index 0..11
    
    const { addToast } = useToast();

    // --- CARGA DE DATOS COMPARATIVO ANUAL ---
    const fetchComparativoData = async (pYear = anioPrincipal, cYear = anioComparar) => {
        setLoadingComparativo(true);
        try {
            const res = await api.get('/ventas/comparativo-anual', {
                params: { anioPrincipal: pYear, anioComparar: cYear }
            });
            setComparativoData(res.data);
            if (res.data?.anioPrincipal) setAnioPrincipal(res.data.anioPrincipal);
            if (res.data?.anioComparar) setAnioComparar(res.data.anioComparar);
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al cargar comparativo anual', 'error');
        } finally {
            setLoadingComparativo(false);
        }
    };

    const handleOpenComparativoModal = () => {
        setShowComparativoModal(true);
        if (!comparativoData) {
            fetchComparativoData(anioPrincipal, anioComparar);
        }
    };

    const isCurrencyMetric = metricaFiltro.startsWith('venta');
    const formatMetricVal = (val) => isCurrencyMetric ? moneyFmt(val) : `${numFmt(val)} gal`;
    const formatMetricShort = (val) => {
        if (!val || val === 0) return '0';
        if (val >= 1000000) return isCurrencyMetric ? `$${(val / 1000000).toFixed(2)}M` : `${(val / 1000000).toFixed(2)}M gal`;
        if (val >= 1000) return isCurrencyMetric ? `$${(val / 1000).toFixed(1)}k` : `${(val / 1000).toFixed(1)}k gal`;
        return isCurrencyMetric ? `$${Math.round(val).toLocaleString()}` : `${Math.round(val).toLocaleString()} gal`;
    };

    const getMetricaNombre = (m) => {
        switch (m) {
            case 'galonaje': return 'Galonaje Total Combustible';
            case 'venta_total': return 'Venta Total Consolidada ($)';
            case 'venta_estacion': return 'Venta Pista Combustible ($)';
            case 'venta_tienda': return 'Venta Tienda E-Market ($)';
            case 'diesel': return 'Diésel (Galones)';
            case 'regular': return 'Regular (Galones)';
            case 'super': return 'Súper (Galones)';
            case 'ion': return 'Ion Diésel (Galones)';
            default: return m;
        }
    };

    const exportComparativoToExcel = () => {
        if (!comparativoData) return;
        const wb = XLSX.utils.book_new();
        const estName = estacionFiltro === 'all' 
            ? 'Todas las Estaciones (Consolidado)' 
            : (comparativoData.estaciones?.find(e => e.id_empresa === estacionFiltro)?.nombre || estacionFiltro);

        const rows = [
            ['REPORTE COMPARATIVO ANUAL DE VENTAS POR ESTACIÓN'],
            ['Estación:', estName],
            ['Métrica Evaluada:', getMetricaNombre(metricaFiltro)],
            ['Período:', `${anioPrincipal} vs ${anioComparar}`],
            ['Fecha de Generación:', new Date().toLocaleDateString('es-SV')],
            [''],
            ['Mes', String(anioPrincipal), String(anioComparar), 'Diferencia Neta', '% Variación', 'Estado']
        ];

        comparativoData.meses.forEach(m => {
            const v1 = estacionFiltro === 'all' ? (m.principal[metricaFiltro] || 0) : (m.principal.por_estacion?.[estacionFiltro]?.[metricaFiltro] || 0);
            const v2 = estacionFiltro === 'all' ? (m.comparar[metricaFiltro] || 0) : (m.comparar.por_estacion?.[estacionFiltro]?.[metricaFiltro] || 0);
            const d = Math.round((v1 - v2) * 100) / 100;
            const pct = v2 > 0 ? `${((d / v2) * 100).toFixed(1)}%` : (v1 > 0 ? '+100.0%' : '0.0%');
            const estado = v1 === 0 && v2 === 0 ? 'Sin registros' : (d >= 0 ? 'Superávit' : 'Déficit');
            rows.push([m.nombre, v1, v2, d, pct, estado]);
        });

        rows.push(['']);
        // Totales Anuales
        let t1 = 0, t2 = 0;
        if (estacionFiltro === 'all') {
            t1 = comparativoData.totales.principal[metricaFiltro] || 0;
            t2 = comparativoData.totales.comparar[metricaFiltro] || 0;
        } else {
            t1 = comparativoData.totales.principal.por_estacion?.[estacionFiltro]?.[metricaFiltro] || 0;
            t2 = comparativoData.totales.comparar.por_estacion?.[estacionFiltro]?.[metricaFiltro] || 0;
        }
        const td = Math.round((t1 - t2) * 100) / 100;
        const tpct = t2 > 0 ? `${((td / t2) * 100).toFixed(1)}%` : '0.0%';
        rows.push(['TOTAL ANUAL', t1, t2, td, tpct, td >= 0 ? 'Crecimiento' : 'Descenso']);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Comparativo Anual');
        XLSX.writeFile(wb, `Comparativo_Anual_${anioPrincipal}_vs_${anioComparar}_${estacionFiltro}.xlsx`);
        addToast('Archivo Excel descargado exitosamente', 'success');
    };

    const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
    const numFmt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

    const formatMsDate = (msDateStr) => {
        if (!msDateStr) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(msDateStr)) {
            const [year, month, day] = msDateStr.split('-');
            return `${day}/${month}/${year}`;
        }
        const ms = parseInt(msDateStr.replace(/[^0-9-]/g, ''));
        if (isNaN(ms)) return msDateStr;
        return new Date(ms).toLocaleDateString();
    };

    const getNombreMes = (mesStr) => {
        if (!mesStr) return '';
        const meses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const parts = mesStr.split('-');
        if (parts.length < 2) return mesStr;
        const m = parseInt(parts[1], 10);
        const y = parts[0];
        if (m >= 1 && m <= 12) {
            return `${meses[m - 1]} ${y}`;
        }
        return mesStr;
    };

    // --- CARGA DE DATOS DIARIOS ---
    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/ventas/consolidado/${fecha}`);
            setDataTiendas(res.data.tiendas || []);
            setDataEstaciones(res.data.estaciones || []);
            setDataMargenes(res.data.margenes || []);
            setDataInventario(res.data.inventario || []);
            addToast('Datos diarios cargados exitosamente', 'success');
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al cargar datos consolidados diarios', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- CARGA DE DATOS MENSUALES ---
    const fetchMonthlyData = async (targetMes = mesSeleccionado) => {
        if (!targetMes || !/^\d{4}-\d{2}$/.test(targetMes)) {
            return addToast('Formato de mes no válido (use YYYY-MM)', 'error');
        }
        setLoadingMonthly(true);
        try {
            const res = await api.get(`/ventas/resumen-mensual/${targetMes}`);
            setMonthlyData(res.data || {
                periodo: targetMes,
                estaciones: [],
                tiendas: [],
                consolidado: [],
                totales: {}
            });
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al cargar resumen mensual de ventas', 'error');
        } finally {
            setLoadingMonthly(false);
        }
    };

    // Load on mount
    useEffect(() => {
        fetchData();
        fetchMonthlyData(defaultMes);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Navegación de meses
    const handlePrevMonth = () => {
        const [y, m] = mesSeleccionado.split('-').map(Number);
        const prev = new Date(y, m - 2, 1);
        const newMes = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
        setMesSeleccionado(newMes);
        fetchMonthlyData(newMes);
    };

    const handleNextMonth = () => {
        const [y, m] = mesSeleccionado.split('-').map(Number);
        const next = new Date(y, m, 1);
        const newMes = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
        setMesSeleccionado(newMes);
        fetchMonthlyData(newMes);
    };

    const handleCurrentMonth = () => {
        const actual = new Date();
        const curr = `${actual.getFullYear()}-${String(actual.getMonth() + 1).padStart(2, '0')}`;
        setMesSeleccionado(curr);
        fetchMonthlyData(curr);
    };

    // --- EXPORTAR A EXCEL (MENSUAL) ---
    const exportMonthlyToExcel = () => {
        const { consolidado, estaciones, tiendas, totales, periodo } = monthlyData;
        if (!consolidado || consolidado.length === 0) {
            return addToast('No hay datos mensuales para exportar', 'warning');
        }

        const wb = XLSX.utils.book_new();

        // Hoja 1: Consolidado (Estación + Tienda)
        const wsConsolidadoData = consolidado.map(c => ({
            "Sucursal / Estación": c.empresa,
            "Tienda Vinculada": c.tienda_nombre || 'N/A',
            "Diesel (gal)": c.diesel,
            "Regular (gal)": c.regular,
            "Súper (gal)": c.super,
            "Ion (gal)": c.ion,
            "Galonaje Total": c.galonaje,
            "Venta Estación ($)": c.venta_estacion,
            "Venta Tienda ($)": c.venta_tienda,
            "Venta Total ($)": c.venta_total,
            "% Participación": totales?.venta_total > 0 ? (((c.venta_total / totales.venta_total) * 100).toFixed(2) + '%') : '0%'
        }));
        // Fila Total
        wsConsolidadoData.push({
            "Sucursal / Estación": "TOTAL GENERAL",
            "Tienda Vinculada": "",
            "Diesel (gal)": totales?.diesel || 0,
            "Regular (gal)": totales?.regular || 0,
            "Súper (gal)": totales?.super || 0,
            "Ion (gal)": totales?.ion || 0,
            "Galonaje Total": totales?.galonaje || 0,
            "Venta Estación ($)": totales?.venta_estacion || 0,
            "Venta Tienda ($)": totales?.venta_tienda || 0,
            "Venta Total ($)": totales?.venta_total || 0,
            "% Participación": "100.00%"
        });
        const wsConsolidado = XLSX.utils.json_to_sheet(wsConsolidadoData);
        XLSX.utils.book_append_sheet(wb, wsConsolidado, "Consolidado Mensual");

        // Hoja 2: Detalle Combustible
        if (estaciones && estaciones.length > 0) {
            const wsCombustibleData = estaciones.map(e => ({
                "Estación": e.empresa,
                "Diesel (gal)": e.diesel,
                "Regular (gal)": e.regular,
                "Súper (gal)": e.super,
                "Ion (gal)": e.ion,
                "Galonaje Total": e.galonaje,
                "Venta Combustible ($)": e.venta,
                "% Galonaje": totales?.galonaje > 0 ? (((e.galonaje / totales.galonaje) * 100).toFixed(2) + '%') : '0%'
            }));
            wsCombustibleData.push({
                "Estación": "TOTAL COMBUSTIBLE",
                "Diesel (gal)": totales?.diesel || 0,
                "Regular (gal)": totales?.regular || 0,
                "Súper (gal)": totales?.super || 0,
                "Ion (gal)": totales?.ion || 0,
                "Galonaje Total": totales?.galonaje || 0,
                "Venta Combustible ($)": totales?.venta_estacion || 0,
                "% Galonaje": "100.00%"
            });
            const wsCombustible = XLSX.utils.json_to_sheet(wsCombustibleData);
            XLSX.utils.book_append_sheet(wb, wsCombustible, "Detalle Combustible");
        }

        // Hoja 3: Detalle Tiendas
        if (tiendas && tiendas.length > 0) {
            const wsTiendasData = tiendas.map(t => ({
                "Tienda E-Market": t.empresa,
                "Días con Venta": t.dias_con_venta,
                "Promedio Diario ($)": t.promedio_diario,
                "Venta Mensual ($)": t.venta,
                "% Participación": totales?.venta_tienda > 0 ? (((t.venta / totales.venta_tienda) * 100).toFixed(2) + '%') : '0%'
            }));
            wsTiendasData.push({
                "Tienda E-Market": "TOTAL TIENDAS",
                "Días con Venta": "-",
                "Promedio Diario ($)": "-",
                "Venta Mensual ($)": totales?.venta_tienda || 0,
                "% Participación": "100.00%"
            });
            const wsTiendas = XLSX.utils.json_to_sheet(wsTiendasData);
            XLSX.utils.book_append_sheet(wb, wsTiendas, "Detalle Tiendas");
        }

        XLSX.writeFile(wb, `Resumen_Ventas_Mensual_${periodo}.xlsx`);
        addToast('Archivo Excel mensual descargado con éxito', 'success');
    };

    // --- VISTA PREVIA PDF CARTA CON ReportPreviewModal ---
    const handlePreviewMonthlyPDF = () => {
        const { consolidado, totales, periodo } = monthlyData;
        if (!consolidado || consolidado.length === 0) {
            return addToast('No hay datos mensuales para generar el reporte', 'warning');
        }

        // Letter landscape: 279.4 x 215.9 mm (Carta horizontal)
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Encabezado
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('SIPEOFI - RESUMEN DE VENTAS MENSUAL POR ESTACIÓN', 14, 14);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Período: ${getNombreMes(periodo)} (${periodo})   |   Generado: ${new Date().toLocaleDateString('es-SV')} ${new Date().toLocaleTimeString('es-SV')}`, 14, 20);

        // Bloque de Resumen KPI
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(14, 23, pageWidth - 28, 12, 1.5, 1.5, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(51, 65, 85);
        doc.text(`Galonaje Total: ${numFmt(totales?.galonaje || 0)} gal`, 18, 30.5);
        doc.text(`Venta Pista: ${moneyFmt(totales?.venta_estacion || 0)}`, 85, 30.5);
        doc.text(`Venta Tiendas: ${moneyFmt(totales?.venta_tienda || 0)}`, 150, 30.5);
        doc.text(`Gran Total Ventas: ${moneyFmt(totales?.venta_total || 0)}`, 215, 30.5);

        // Columnas
        const tableColumn = [
            "Sucursal / Estación", 
            "Diesel (gal)", 
            "Regular (gal)", 
            "Súper (gal)", 
            "Ion (gal)", 
            "Galonaje Total", 
            "Venta Estación ($)", 
            "Venta Tienda ($)", 
            "Venta Total ($)",
            "% Part."
        ];

        const tableRows = consolidado.map(row => {
            const part = totales?.venta_total > 0 ? ((row.venta_total / totales.venta_total) * 100).toFixed(1) + '%' : '0%';
            return [
                row.empresa,
                numFmt(row.diesel),
                numFmt(row.regular),
                numFmt(row.super),
                row.ion > 0 ? numFmt(row.ion) : '-',
                numFmt(row.galonaje),
                moneyFmt(row.venta_estacion),
                moneyFmt(row.venta_tienda),
                moneyFmt(row.venta_total),
                part
            ];
        });

        // Fila Total
        tableRows.push([
            "TOTAL GENERAL",
            numFmt(totales?.diesel || 0),
            numFmt(totales?.regular || 0),
            numFmt(totales?.super || 0),
            numFmt(totales?.ion || 0),
            numFmt(totales?.galonaje || 0),
            moneyFmt(totales?.venta_estacion || 0),
            moneyFmt(totales?.venta_tienda || 0),
            moneyFmt(totales?.venta_total || 0),
            "100.0%"
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 38,
            theme: 'striped',
            styles: { fontSize: 7.8, cellPadding: 2 },
            columnStyles: { 
                0: { halign: 'left', fontStyle: 'bold' },
                1: { halign: 'right' },
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right', fontStyle: 'bold' },
                6: { halign: 'right' },
                7: { halign: 'right' },
                8: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] },
                9: { halign: 'center' }
            },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: 14, right: 14, bottom: 12 },
            didDrawPage: (dataHook) => {
                const pNum = dataHook.pageNumber;
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.text(
                    `Página ${pNum}`,
                    pageWidth - 20,
                    pageHeight - 7,
                    { align: 'right' }
                );
            }
        });

        const pagesCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pagesCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${i} de ${pagesCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
            doc.text('SIPEOFI - Sistema de Información de Estaciones | Confidencial', 14, pageHeight - 7);
        }

        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        setPdfSource(url);
        setPreviewPdfDoc(doc);
        setTotalPages(pagesCount);
        setPreviewFileName(`Resumen_Ventas_Mensual_${periodo}.pdf`);
        setPreviewModalOpen(true);
    };

    const totalMontoTiendas = dataTiendas.reduce((acc, curr) => acc + (curr.venta || 0), 0);

    const Badge = ({ val, inverse = false }) => {
        let bg = 'transparent';
        const num = parseFloat(String(val).replace(/[$,]/g, ''));
        if (!isNaN(num)) {
            if (num > 0) bg = inverse ? '#ef4444' : '#22c55e';
            else if (num < 0) bg = inverse ? '#22c55e' : '#ef4444';
            else if (num === 0) bg = '#f59e0b';
        }
        return (
            <span style={{ backgroundColor: bg, color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                {val}
            </span>
        );
    };

    const BadgeSquare = ({ val, color }) => {
        const bgColors = {
            'red': '#ef4444',
            'blue': '#0ea5e9',
            'orange': '#f97316'
        };
        return (
            <span style={{ backgroundColor: bgColors[color] || '#cbd5e1', color: '#fff', padding: '2px 4px', borderRadius: '2px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                {val}
            </span>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Control Bar Diario */}
            <div className="card glass" style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginRight: '0.5rem' }}>Fecha:</span>
                    <Calendar size={16} color="var(--text-muted)" />
                    <input 
                        type="date" 
                        value={fecha} 
                        onChange={e => setFecha(e.target.value)} 
                        style={{ border: 'none', padding: '0.5rem', fontSize: '0.85rem', background: 'transparent', outline: 'none' }}
                    />
                </div>
                <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.5rem', height: '36px' }}>
                    <Search size={16} /> {loading ? 'Cargando...' : 'Consultar'}
                </button>
            </div>

            {/* Table 1: Tiendas E-Market Diario */}
            <div className="card glass" style={{ padding: '0' }}>
                <h3 style={{ margin: '0', padding: '1rem', borderBottom: '1px solid var(--border)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Resumen de Ventas Tiendas E-Market
                </h3>
                <div className="table-responsive" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '650px' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Fecha</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Monto</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Promedio</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Eficiencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataTiendas.map((t, i) => {
                                const eficiencia = t.promedio === 0 ? 'NaN%' : (((t.venta / t.promedio) - 1) * 100).toFixed(2) + '%';
                                return (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>{formatMsDate(t.fecha)}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{t.empresa}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                        {t.venta === 0 ? <Badge val={moneyFmt(t.venta)} /> : moneyFmt(t.venta)}
                                    </td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{moneyFmt(t.promedio)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{eficiencia}</td>
                                </tr>
                            );})}
                            {dataTiendas.length > 0 && (
                                <tr style={{ fontWeight: 'bold', background: 'rgba(0,0,0,0.02)' }}>
                                    <td colSpan="2" style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total</td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{moneyFmt(totalMontoTiendas)}</td>
                                    <td></td>
                                    <td></td>
                                </tr>
                            )}
                            {dataTiendas.length === 0 && !loading && (
                                <tr><td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table 2: Estaciones Diario */}
            <div className="card glass" style={{ padding: '0' }}>
                <h3 style={{ margin: '0', padding: '1rem', borderBottom: '1px solid var(--border)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Resumen de Ventas Estaciones
                </h3>
                <div className="table-responsive" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '700px' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>D</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>R</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>S</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>I</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Galonaje</th>
                                <th style={{ textAlign: 'right', padding: '0.75rem 1rem' }}>Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataEstaciones.map((e, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>{e.empresa}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.diesel)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.regular)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.super)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                                        {e.ion > 0 ? numFmt(e.ion) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                    </td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{numFmt(e.galonaje)}</td>
                                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>{moneyFmt(e.venta)}</td>
                                </tr>
                            ))}
                            {dataEstaciones.length === 0 && !loading && (
                                <tr><td colSpan="7" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table 3: Margenes */}
            <div className="card glass" style={{ padding: '0' }}>
                <h3 style={{ margin: '0', padding: '1rem', borderBottom: '1px solid var(--border)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Márgenes de Combustible
                </h3>
                <div className="table-responsive" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '850px' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>DieselA</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>RegularA</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>SuperA</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>DieselC</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>RegularC</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>SuperC</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>Master</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>IonDiesel</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataMargenes.map((m, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>{m.empresa}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_da || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_ra || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_sa || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_dc || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_rc || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_sc || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_master || 0).toFixed(2)}`} /></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}><Badge val={`$${(m.margen_io || 0).toFixed(2)}`} /></td>
                                </tr>
                            ))}
                            {dataMargenes.length === 0 && !loading && (
                                <tr><td colSpan="9" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table 4: Inventario */}
            <div className="card glass" style={{ padding: '0' }}>
                <h3 style={{ margin: '0', padding: '1rem', borderBottom: '1px solid var(--border)', fontSize: '1rem', color: 'var(--text-muted)' }}>
                    Resumen de Inventario de Combustibles
                </h3>
                <div className="table-responsive" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '850px' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Diesel</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Regular</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>Super</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem 1rem' }}>IonDiesel</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.25rem' }}>D.D</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.25rem' }}>D.R</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.25rem' }}>D.S</th>
                                <th style={{ textAlign: 'center', padding: '0.75rem 0.25rem' }}>D.I</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dataInventario.map((inv, i) => {
                                const mapColor = (val, thresholds) => {
                                    if(val <= thresholds.red) return 'red';
                                    if(val <= thresholds.orange) return 'orange';
                                    return 'blue';
                                };
                                return (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.5rem 1rem' }}>{inv.empresa}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{numFmt(inv.diesel || 0)}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{numFmt(inv.regular || 0)}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{numFmt(inv.super || 0)}</td>
                                    <td style={{ padding: '0.5rem 1rem' }}>{numFmt(inv.iondiesel || 0)}</td>
                                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}><BadgeSquare val={(inv.duracion_diesel || 0).toFixed(1)} color={mapColor(inv.duracion_diesel || 0, {red: 1.5, orange: 3})} /></td>
                                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}><BadgeSquare val={(inv.duracion_regular || 0).toFixed(1)} color={mapColor(inv.duracion_regular || 0, {red: 1.5, orange: 3})} /></td>
                                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}><BadgeSquare val={(inv.duracion_super || 0).toFixed(1)} color={mapColor(inv.duracion_super || 0, {red: 1.5, orange: 3})} /></td>
                                    <td style={{ padding: '0.5rem 0.25rem', textAlign: 'center' }}><BadgeSquare val={(inv.duracion_ion || 0).toFixed(1)} color={mapColor(inv.duracion_ion || 0, {red: 1.5, orange: 3})} /></td>
                                </tr>
                            );})}
                            {dataInventario.length === 0 && !loading && (
                                <tr><td colSpan="9" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* SECCIÓN AL FONDO: RESUMEN DE VENTA MENSUAL POR ESTACIÓN (PISTA Y TIENDA)  */}
            {/* ========================================================================= */}
            <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem', marginTop: '0.5rem', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                {/* Header de Sección Mensual */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary, #3b82f6)' }}>
                            <TrendingUp size={22} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                Resumen de Ventas Mensual por Estación
                                <span style={{ fontSize: '0.75rem', fontWeight: '600', padding: '0.2rem 0.6rem', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                                    {getNombreMes(mesSeleccionado)}
                                </span>
                                {monthlyData?.origen && (
                                    <span style={{ fontSize: '0.72rem', fontWeight: '500', padding: '0.15rem 0.55rem', borderRadius: '12px', background: monthlyData.origen.includes('saas') ? 'rgba(34, 197, 94, 0.12)' : 'rgba(59, 130, 246, 0.12)', color: monthlyData.origen.includes('saas') ? '#22c55e' : '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: monthlyData.origen.includes('saas') ? '#22c55e' : '#3b82f6' }}></span>
                                        {monthlyData.origen.includes('saas') ? 'sys.sipesv.com (Nova SaaS)' : 'Base Local RRS'}
                                    </span>
                                )}
                            </h2>
                            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Consolidado mensual de combustible (galones y $) y tiendas E-Market por estación
                            </p>
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button 
                            className="btn-primary" 
                            onClick={handleOpenComparativoModal}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.45rem', 
                                height: '36px', 
                                padding: '0 0.95rem', 
                                fontSize: '0.825rem',
                                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                                border: 'none',
                                color: '#fff',
                                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                                fontWeight: '600'
                            }}
                            title="Graficar y ver de forma dinámica el comportamiento mensual de cada estación"
                        >
                            <BarChart3 size={15} /> Gráfica Comparativa Anual
                        </button>
                        <button 
                            className="btn-secondary" 
                            onClick={exportMonthlyToExcel}
                            disabled={loadingMonthly || !monthlyData?.consolidado?.length}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 0.85rem', fontSize: '0.825rem' }}
                            title="Exportar archivo Excel con todas las hojas del mes"
                        >
                            <FileSpreadsheet size={15} color="#22c55e" /> Exportar Excel
                        </button>
                        <button 
                            className="btn-secondary" 
                            onClick={handlePreviewMonthlyPDF}
                            disabled={loadingMonthly || !monthlyData?.consolidado?.length}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 0.85rem', fontSize: '0.825rem' }}
                            title="Ver vista previa e imprimir en tamaño Carta"
                        >
                            <Printer size={15} color="#3b82f6" /> Vista Previa PDF
                        </button>
                    </div>
                </div>

                {/* Barra de Filtros y Navegación de Mes */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.02)', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                    {/* Controles de Navegación de Mes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button 
                            className="btn-secondary"
                            onClick={handlePrevMonth}
                            disabled={loadingMonthly}
                            style={{ height: '36px', width: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Ver mes anterior"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        
                        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)', height: '36px' }}>
                            <Calendar size={15} color="var(--text-muted)" style={{ marginRight: '0.4rem' }} />
                            <input 
                                type="month" 
                                value={mesSeleccionado} 
                                onChange={e => {
                                    setMesSeleccionado(e.target.value);
                                    fetchMonthlyData(e.target.value);
                                }} 
                                style={{ border: 'none', fontSize: '0.825rem', background: 'transparent', outline: 'none', cursor: 'pointer', color: 'var(--text)' }}
                            />
                        </div>

                        <button 
                            className="btn-secondary"
                            onClick={handleNextMonth}
                            disabled={loadingMonthly}
                            style={{ height: '36px', width: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Ver mes siguiente"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <button 
                        className="btn-secondary"
                        onClick={handleCurrentMonth}
                        disabled={loadingMonthly}
                        style={{ height: '36px', padding: '0 0.8rem', fontSize: '0.8rem' }}
                    >
                        Mes Actual
                    </button>

                    <button 
                        className="btn-primary" 
                        onClick={() => fetchMonthlyData(mesSeleccionado)} 
                        disabled={loadingMonthly} 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 1.25rem', fontSize: '0.825rem' }}
                    >
                        <Search size={15} /> {loadingMonthly ? 'Consultando...' : 'Consultar'}
                    </button>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setVistaMensual('consolidado')}
                            style={{
                                height: '34px',
                                padding: '0 0.85rem',
                                fontSize: '0.8rem',
                                borderRadius: 'var(--border-radius)',
                                border: '1px solid',
                                borderColor: vistaMensual === 'consolidado' ? 'var(--primary, #3b82f6)' : 'var(--border)',
                                background: vistaMensual === 'consolidado' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                color: vistaMensual === 'consolidado' ? 'var(--primary, #3b82f6)' : 'var(--text-muted)',
                                fontWeight: vistaMensual === 'consolidado' ? 'bold' : 'normal',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}
                        >
                            <Layers size={14} /> Consolidado (Pista + Tienda)
                        </button>
                        <button
                            onClick={() => setVistaMensual('combustible')}
                            style={{
                                height: '34px',
                                padding: '0 0.85rem',
                                fontSize: '0.8rem',
                                borderRadius: 'var(--border-radius)',
                                border: '1px solid',
                                borderColor: vistaMensual === 'combustible' ? 'var(--primary, #3b82f6)' : 'var(--border)',
                                background: vistaMensual === 'combustible' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                color: vistaMensual === 'combustible' ? 'var(--primary, #3b82f6)' : 'var(--text-muted)',
                                fontWeight: vistaMensual === 'combustible' ? 'bold' : 'normal',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}
                        >
                            <Fuel size={14} /> Detalle Combustible
                        </button>
                        <button
                            onClick={() => setVistaMensual('tiendas')}
                            style={{
                                height: '34px',
                                padding: '0 0.85rem',
                                fontSize: '0.8rem',
                                borderRadius: 'var(--border-radius)',
                                border: '1px solid',
                                borderColor: vistaMensual === 'tiendas' ? 'var(--primary, #3b82f6)' : 'var(--border)',
                                background: vistaMensual === 'tiendas' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                color: vistaMensual === 'tiendas' ? 'var(--primary, #3b82f6)' : 'var(--text-muted)',
                                fontWeight: vistaMensual === 'tiendas' ? 'bold' : 'normal',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}
                        >
                            <Store size={14} /> Detalle Tiendas E-Market
                        </button>
                    </div>
                </div>

                {/* Tarjetas KPI del Mes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ padding: '0.85rem 1rem', borderRadius: 'var(--border-radius)', background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.18)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                            <Fuel size={18} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total Galonaje</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)' }}>
                                {numFmt(monthlyData?.totales?.galonaje || 0)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>gal</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '0.85rem 1rem', borderRadius: 'var(--border-radius)', background: 'rgba(14, 165, 233, 0.06)', border: '1px solid rgba(14, 165, 233, 0.18)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9' }}>
                            <DollarSign size={18} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Venta Combustible ($)</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#0ea5e9' }}>
                                {moneyFmt(monthlyData?.totales?.venta_estacion || 0)}
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '0.85rem 1rem', borderRadius: 'var(--border-radius)', background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.18)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e' }}>
                            <Store size={18} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Venta Tiendas ($)</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#22c55e' }}>
                                {moneyFmt(monthlyData?.totales?.venta_tienda || 0)}
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '0.85rem 1rem', borderRadius: 'var(--border-radius)', background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.18)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
                            <TrendingUp size={18} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Gran Total Mensual ($)</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#a855f7' }}>
                                {moneyFmt(monthlyData?.totales?.venta_total || 0)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* VISTA 1: TABLA CONSOLIDADA (PISTA + TIENDA) */}
                {vistaMensual === 'consolidado' && (
                    <div className="table-responsive" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '950px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.65rem 0.85rem' }}>Estación / Sucursal</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.6rem' }}>Diesel (gal)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.6rem' }}>Regular (gal)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.6rem' }}>Súper (gal)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.6rem' }}>Ion (gal)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.75rem', color: 'var(--primary, #3b82f6)' }}>Galonaje Total</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.75rem' }}>Venta Estación ($)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.75rem' }}>Venta Tienda ($)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.85rem', color: '#22c55e' }}>Venta Total ($)</th>
                                    <th style={{ textAlign: 'center', padding: '0.65rem 0.6rem' }}>% Part.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyData?.consolidado?.map((row, i) => {
                                    const part = monthlyData?.totales?.venta_total > 0 
                                        ? (((row.venta_total / monthlyData.totales.venta_total) * 100).toFixed(1) + '%')
                                        : '0.0%';
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.5rem 0.85rem', fontWeight: '500' }}>
                                                {row.empresa}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>{numFmt(row.diesel)}</td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>{numFmt(row.regular)}</td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>{numFmt(row.super)}</td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>
                                                {row.ion > 0 ? numFmt(row.ion) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '600' }}>
                                                {numFmt(row.galonaje)}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                                {moneyFmt(row.venta_estacion)}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                                {row.venta_tienda > 0 ? (
                                                    <span style={{ color: '#22c55e', fontWeight: '500' }}>{moneyFmt(row.venta_tienda)}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)' }}>$0.00</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.85rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--text)' }}>
                                                {moneyFmt(row.venta_total)}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: '500' }}>
                                                    {part}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {monthlyData?.consolidado?.length > 0 && (
                                    <tr style={{ fontWeight: 'bold', background: 'rgba(59, 130, 246, 0.08)', borderTop: '2px solid var(--border)' }}>
                                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            TOTAL GENERAL
                                        </td>
                                        <td style={{ padding: '0.75rem 0.6rem', textAlign: 'right' }}>{numFmt(monthlyData?.totales?.diesel || 0)}</td>
                                        <td style={{ padding: '0.75rem 0.6rem', textAlign: 'right' }}>{numFmt(monthlyData?.totales?.regular || 0)}</td>
                                        <td style={{ padding: '0.75rem 0.6rem', textAlign: 'right' }}>{numFmt(monthlyData?.totales?.super || 0)}</td>
                                        <td style={{ padding: '0.75rem 0.6rem', textAlign: 'right' }}>{numFmt(monthlyData?.totales?.ion || 0)}</td>
                                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'right', color: 'var(--primary, #3b82f6)', fontSize: '0.85rem' }}>
                                            {numFmt(monthlyData?.totales?.galonaje || 0)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'right' }}>
                                            {moneyFmt(monthlyData?.totales?.venta_estacion || 0)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'right', color: '#22c55e' }}>
                                            {moneyFmt(monthlyData?.totales?.venta_tienda || 0)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', color: '#a855f7', fontSize: '0.9rem' }}>
                                            {moneyFmt(monthlyData?.totales?.venta_total || 0)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.6rem', textAlign: 'center' }}>100.0%</td>
                                    </tr>
                                )}

                                {(!monthlyData?.consolidado || monthlyData.consolidado.length === 0) && !loadingMonthly && (
                                    <tr>
                                        <td colSpan="10" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No hay registros consolidados para el período {getNombreMes(mesSeleccionado)}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* VISTA 2: TABLA DETALLE COMBUSTIBLE */}
                {vistaMensual === 'combustible' && (
                    <div className="table-responsive" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '850px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.65rem 0.85rem' }}>Estación / Sucursal</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.65rem' }}>Diesel (gal)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.65rem' }}>Regular (gal)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.65rem' }}>Súper (gal)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.65rem' }}>Ion (gal)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.85rem', color: 'var(--primary, #3b82f6)' }}>Total Galones</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.85rem' }}>Venta Total ($)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.75rem' }}>Promedio Diario</th>
                                    <th style={{ textAlign: 'center', padding: '0.65rem 0.65rem' }}>% Galonaje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyData?.estaciones?.map((e, i) => {
                                    const partGal = monthlyData?.totales?.galonaje > 0 
                                        ? (((e.galonaje / monthlyData.totales.galonaje) * 100).toFixed(1) + '%')
                                        : '0.0%';
                                    const promDiario = monthlyData.dias_mes > 0 ? (e.galonaje / monthlyData.dias_mes) : 0;
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.5rem 0.85rem', fontWeight: '500' }}>{e.empresa}</td>
                                            <td style={{ padding: '0.5rem 0.65rem', textAlign: 'right' }}>{numFmt(e.diesel)}</td>
                                            <td style={{ padding: '0.5rem 0.65rem', textAlign: 'right' }}>{numFmt(e.regular)}</td>
                                            <td style={{ padding: '0.5rem 0.65rem', textAlign: 'right' }}>{numFmt(e.super)}</td>
                                            <td style={{ padding: '0.5rem 0.65rem', textAlign: 'right' }}>
                                                {e.ion > 0 ? numFmt(e.ion) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.85rem', textAlign: 'right', fontWeight: 'bold' }}>{numFmt(e.galonaje)}</td>
                                            <td style={{ padding: '0.5rem 0.85rem', textAlign: 'right', fontWeight: '500' }}>{moneyFmt(e.venta)}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>{numFmt(promDiario)} gal/d</td>
                                            <td style={{ padding: '0.5rem 0.65rem', textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: '500' }}>
                                                    {partGal}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {monthlyData?.estaciones?.length > 0 && (
                                    <tr style={{ fontWeight: 'bold', background: 'rgba(59, 130, 246, 0.08)', borderTop: '2px solid var(--border)' }}>
                                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'left', textTransform: 'uppercase' }}>TOTAL COMBUSTIBLE</td>
                                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'right' }}>{numFmt(monthlyData?.totales?.diesel || 0)}</td>
                                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'right' }}>{numFmt(monthlyData?.totales?.regular || 0)}</td>
                                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'right' }}>{numFmt(monthlyData?.totales?.super || 0)}</td>
                                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'right' }}>{numFmt(monthlyData?.totales?.ion || 0)}</td>
                                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', color: 'var(--primary, #3b82f6)' }}>
                                            {numFmt(monthlyData?.totales?.galonaje || 0)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', color: '#0ea5e9' }}>
                                            {moneyFmt(monthlyData?.totales?.venta_estacion || 0)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                            {numFmt((monthlyData?.totales?.galonaje || 0) / (monthlyData.dias_mes || 1))} gal/d
                                        </td>
                                        <td style={{ padding: '0.75rem 0.65rem', textAlign: 'center' }}>100.0%</td>
                                    </tr>
                                )}

                                {(!monthlyData?.estaciones || monthlyData.estaciones.length === 0) && !loadingMonthly && (
                                    <tr>
                                        <td colSpan="9" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No hay datos de combustible para el período {getNombreMes(mesSeleccionado)}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* VISTA 3: TABLA DETALLE TIENDAS E-MARKET */}
                {vistaMensual === 'tiendas' && (
                    <div className="table-responsive" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '700px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.65rem 0.85rem' }}>Tienda E-Market</th>
                                    <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem' }}>Días con Venta</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.85rem' }}>Promedio Diario ($)</th>
                                    <th style={{ textAlign: 'right', padding: '0.65rem 0.85rem', color: '#22c55e' }}>Venta Total Mensual ($)</th>
                                    <th style={{ textAlign: 'center', padding: '0.65rem 0.75rem' }}>% Tiendas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyData?.tiendas?.map((t, i) => {
                                    const partTienda = monthlyData?.totales?.venta_tienda > 0 
                                        ? (((t.venta / monthlyData.totales.venta_tienda) * 100).toFixed(1) + '%')
                                        : '0.0%';
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.5rem 0.85rem', fontWeight: '500' }}>{t.empresa}</td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.05)', color: 'var(--text)' }}>
                                                    {t.dias_con_venta} / {monthlyData.dias_mes}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.5rem 0.85rem', textAlign: 'right' }}>{moneyFmt(t.promedio_diario)}</td>
                                            <td style={{ padding: '0.5rem 0.85rem', textAlign: 'right', fontWeight: 'bold', color: '#22c55e' }}>
                                                {moneyFmt(t.venta)}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', fontWeight: '500' }}>
                                                    {partTienda}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {monthlyData?.tiendas?.length > 0 && (
                                    <tr style={{ fontWeight: 'bold', background: 'rgba(34, 197, 94, 0.08)', borderTop: '2px solid var(--border)' }}>
                                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'left', textTransform: 'uppercase' }}>TOTAL TIENDAS</td>
                                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>-</td>
                                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                                            {moneyFmt((monthlyData?.totales?.venta_tienda || 0) / (monthlyData.dias_mes || 1))}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', color: '#22c55e', fontSize: '0.9rem' }}>
                                            {moneyFmt(monthlyData?.totales?.venta_tienda || 0)}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>100.0%</td>
                                    </tr>
                                )}

                                {(!monthlyData?.tiendas || monthlyData.tiendas.length === 0) && !loadingMonthly && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No hay registros de tiendas para el período {getNombreMes(mesSeleccionado)}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Vista Previa e Impresión Carta (ReportPreviewModal) */}
            <ReportPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                pdfSource={pdfSource}
                pdfDoc={previewPdfDoc}
                title="Resumen de Ventas Mensual por Estación"
                subtitle={`Período: ${getNombreMes(mesSeleccionado)} (${mesSeleccionado})`}
                badge="Ventas Mensuales"
                totalPages={totalPages}
                fileName={previewFileName}
            />

            {/* ========================================================================= */}
            {/* MODAL DE COMPARATIVO ANUAL DINÁMICO POR ESTACIÓN (GRÁFICA Y MES POR MES)  */}
            {/* ========================================================================= */}
            <Modal
                open={showComparativoModal}
                onClose={() => setShowComparativoModal(false)}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                            <BarChart3 size={20} />
                        </div>
                        <div>
                            <span style={{ fontSize: '1.15rem', fontWeight: 'bold' }}>Comparativo Anual Dinámico de Ventas</span>
                            <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', fontWeight: '600', padding: '0.18rem 0.55rem', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.15)', color: '#2563eb' }}>
                                {anioPrincipal} vs {anioComparar}
                            </span>
                        </div>
                    </div>
                }
                size="xl"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {estacionFiltro === 'all' 
                                ? 'Mostrando consolidado general de todas las estaciones activas' 
                                : `Filtrando exclusivamente: ${comparativoData?.estaciones?.find(e => e.id_empresa === estacionFiltro)?.nombre || estacionFiltro}`}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="btn-secondary"
                                onClick={exportComparativoToExcel}
                                disabled={!comparativoData}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.8rem' }}
                            >
                                <FileSpreadsheet size={15} color="#22c55e" /> Descargar Excel
                            </button>
                            <button
                                className="btn-primary"
                                onClick={() => setShowComparativoModal(false)}
                                style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.8rem' }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>
                    {/* Barra de Filtros y Controles del Modal */}
                    <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', background: 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                        {/* Selector de Estación */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Estación
                            </label>
                            <select
                                value={estacionFiltro}
                                onChange={e => setEstacionFiltro(e.target.value)}
                                style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.825rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text)', minWidth: '190px' }}
                            >
                                <option value="all">Todas las Estaciones (Consolidado)</option>
                                {(comparativoData?.estaciones || []).map(est => (
                                    <option key={est.id_empresa} value={est.id_empresa}>
                                        {est.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Selector de Métrica */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Métrica a Graficar
                            </label>
                            <select
                                value={metricaFiltro}
                                onChange={e => setMetricaFiltro(e.target.value)}
                                style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.825rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text)', minWidth: '180px' }}
                            >
                                <option value="galonaje">Galonaje Total (Gal)</option>
                                <option value="venta_total">Venta Total ($)</option>
                                <option value="venta_estacion">Venta Pista Combustible ($)</option>
                                <option value="venta_tienda">Venta Tienda E-Market ($)</option>
                                <option value="diesel">Diésel (Gal)</option>
                                <option value="regular">Regular (Gal)</option>
                                <option value="super">Súper (Gal)</option>
                                <option value="ion">Ion Diésel (Gal)</option>
                            </select>
                        </div>

                        {/* Selector de Año Principal */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Año Base
                            </label>
                            <select
                                value={anioPrincipal}
                                onChange={e => {
                                    const y = parseInt(e.target.value, 10);
                                    setAnioPrincipal(y);
                                    fetchComparativoData(y, anioComparar);
                                }}
                                style={{ height: '36px', padding: '0 0.65rem', fontSize: '0.825rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text)', width: '95px' }}
                            >
                                {(comparativoData?.aniosDisponibles || [anioPrincipal]).map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>

                        {/* Selector de Año a Comparar */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Año a Comparar
                            </label>
                            <select
                                value={anioComparar}
                                onChange={e => {
                                    const y = parseInt(e.target.value, 10);
                                    setAnioComparar(y);
                                    fetchComparativoData(anioPrincipal, y);
                                }}
                                style={{ height: '36px', padding: '0 0.65rem', fontSize: '0.825rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text)', width: '95px' }}
                            >
                                {(comparativoData?.aniosDisponibles || [anioComparar]).map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>

                        {/* Botón Refrescar */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', justifyContent: 'flex-end', marginTop: 'auto' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => fetchComparativoData(anioPrincipal, anioComparar)}
                                disabled={loadingComparativo}
                                style={{ height: '36px', padding: '0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                                title="Actualizar datos"
                            >
                                <RefreshCw size={14} className={loadingComparativo ? 'spin' : ''} /> Actualizar
                            </button>
                        </div>

                        {/* Toggle de Tipo de Gráfico */}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem', alignItems: 'center', marginTop: 'auto' }}>
                            <button
                                onClick={() => setTipoGrafico('barras')}
                                style={{
                                    height: '36px',
                                    padding: '0 0.75rem',
                                    fontSize: '0.8rem',
                                    borderRadius: 'var(--border-radius)',
                                    border: '1px solid',
                                    borderColor: tipoGrafico === 'barras' ? 'var(--primary, #3b82f6)' : 'var(--border)',
                                    background: tipoGrafico === 'barras' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                    color: tipoGrafico === 'barras' ? 'var(--primary, #3b82f6)' : 'var(--text-muted)',
                                    fontWeight: tipoGrafico === 'barras' ? 'bold' : 'normal',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                }}
                            >
                                <BarChart3 size={15} /> Barras
                            </button>
                            <button
                                onClick={() => setTipoGrafico('lineas')}
                                style={{
                                    height: '36px',
                                    padding: '0 0.75rem',
                                    fontSize: '0.8rem',
                                    borderRadius: 'var(--border-radius)',
                                    border: '1px solid',
                                    borderColor: tipoGrafico === 'lineas' ? 'var(--primary, #3b82f6)' : 'var(--border)',
                                    background: tipoGrafico === 'lineas' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                    color: tipoGrafico === 'lineas' ? 'var(--primary, #3b82f6)' : 'var(--text-muted)',
                                    fontWeight: tipoGrafico === 'lineas' ? 'bold' : 'normal',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                }}
                            >
                                <LineChart size={15} /> Líneas
                            </button>
                        </div>
                    </div>

                    {/* Estado de Carga */}
                    {loadingComparativo && (
                        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                            <RefreshCw size={28} className="spin" color="var(--primary, #3b82f6)" />
                            <span style={{ fontSize: '0.9rem' }}>Consultando información mensual y calculando métricas comparativas...</span>
                        </div>
                    )}

                    {/* Contenido Principal si hay datos cargados */}
                    {!loadingComparativo && comparativoData && (() => {
                        // Extracción de datos según filtros activos
                        const chartData = (comparativoData.meses || []).map((m, idx) => {
                            let v1 = 0;
                            let v2 = 0;
                            if (estacionFiltro === 'all') {
                                v1 = Number(m.principal?.[metricaFiltro] || 0);
                                v2 = Number(m.comparar?.[metricaFiltro] || 0);
                            } else {
                                v1 = Number(m.principal?.por_estacion?.[estacionFiltro]?.[metricaFiltro] || 0);
                                v2 = Number(m.comparar?.por_estacion?.[estacionFiltro]?.[metricaFiltro] || 0);
                            }
                            const diff = Math.round((v1 - v2) * 100) / 100;
                            const pct = v2 > 0 ? Math.round(((diff / v2) * 100) * 10) / 10 : (v1 > 0 ? 100 : 0);
                            return {
                                mes: m.mes,
                                nombre: m.nombre,
                                mes_corto: m.mes_corto,
                                val1: v1,
                                val2: v2,
                                diff,
                                pct,
                                idx
                            };
                        });

                        // Totales Anuales
                        let totVal1 = 0;
                        let totVal2 = 0;
                        if (estacionFiltro === 'all') {
                            totVal1 = Number(comparativoData.totales?.principal?.[metricaFiltro] || 0);
                            totVal2 = Number(comparativoData.totales?.comparar?.[metricaFiltro] || 0);
                        } else {
                            totVal1 = Number(comparativoData.totales?.principal?.por_estacion?.[estacionFiltro]?.[metricaFiltro] || 0);
                            totVal2 = Number(comparativoData.totales?.comparar?.por_estacion?.[estacionFiltro]?.[metricaFiltro] || 0);
                        }
                        const totDiff = Math.round((totVal1 - totVal2) * 100) / 100;
                        const totPct = totVal2 > 0 ? Math.round(((totDiff / totVal2) * 100) * 10) / 10 : 0;

                        // YTD hasta el mes de corte
                        const mesCorte = comparativoData.totales?.ytd?.mes_corte || 9;
                        const nombreCorte = comparativoData.totales?.ytd?.nombre_corte || 'Septiembre';
                        let ytdVal1 = 0;
                        let ytdVal2 = 0;
                        chartData.filter(d => d.mes <= mesCorte).forEach(d => {
                            ytdVal1 += d.val1;
                            ytdVal2 += d.val2;
                        });
                        ytdVal1 = Math.round(ytdVal1 * 100) / 100;
                        ytdVal2 = Math.round(ytdVal2 * 100) / 100;
                        const ytdDiff = Math.round((ytdVal1 - ytdVal2) * 100) / 100;
                        const ytdPct = ytdVal2 > 0 ? Math.round(((ytdDiff / ytdVal2) * 100) * 10) / 10 : 0;

                        // Mes Récord
                        let peakMonth = { nombre: 'N/A', val1: 0 };
                        chartData.forEach(d => {
                            if (d.val1 > peakMonth.val1) {
                                peakMonth = { nombre: d.nombre, val1: d.val1 };
                            }
                        });

                        // Configuración del SVG
                        const svgWidth = 880;
                        const svgHeight = 250;
                        const padLeft = 75;
                        const padRight = 25;
                        const padTop = 25;
                        const padBottom = 40;
                        const plotW = svgWidth - padLeft - padRight;
                        const plotH = svgHeight - padTop - padBottom;

                        const rawMax = Math.max(...chartData.map(d => Math.max(d.val1, d.val2)), 1);
                        const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
                        const normalized = rawMax / magnitude;
                        const chartMax = Math.max(Math.ceil(normalized * 1.15) * magnitude, 10);

                        const yGridLevels = [0, 0.333, 0.666, 1.0];
                        const slotW = plotW / 12;
                        const barW = 15;
                        const barGap = 4;

                        // Puntos para líneas
                        const points1 = chartData.map((d, i) => {
                            const cx = padLeft + (i + 0.5) * slotW;
                            const cy = (padTop + plotH) - (d.val1 / chartMax) * plotH;
                            return `${cx},${cy}`;
                        }).join(' ');

                        const points2 = chartData.map((d, i) => {
                            const cx = padLeft + (i + 0.5) * slotW;
                            const cy = (padTop + plotH) - (d.val2 / chartMax) * plotH;
                            return `${cx},${cy}`;
                        }).join(' ');

                        return (
                            <>
                                {/* Tarjetas de Resumen KPI */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
                                    {/* KPI 1: Año Principal */}
                                    <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '3px solid #3b82f6' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>AÑO {anioPrincipal}</span>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></span>
                                        </div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text)' }}>
                                            {formatMetricShort(totVal1)}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Total acumulado en el año
                                        </span>
                                    </div>

                                    {/* KPI 2: Año Comparado */}
                                    <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '3px solid #10b981' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>AÑO {anioComparar}</span>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                                        </div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text)' }}>
                                            {formatMetricShort(totVal2)}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Total del año comparado
                                        </span>
                                    </div>

                                    {/* KPI 3: Variación Neta */}
                                    <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: `3px solid ${totDiff >= 0 ? '#22c55e' : '#ef4444'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>VARIACIÓN TOTAL</span>
                                            {totDiff >= 0 ? <ArrowUpRight size={15} color="#22c55e" /> : <ArrowDownRight size={15} color="#ef4444" />}
                                        </div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: totDiff >= 0 ? '#22c55e' : '#ef4444' }}>
                                            {totDiff >= 0 ? '+' : ''}{totPct}%
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {totDiff >= 0 ? '+' : ''}{formatMetricShort(totDiff)}
                                        </span>
                                    </div>

                                    {/* KPI 4: Acumulado YTD */}
                                    <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '3px solid #8b5cf6' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>CORTE YTD ({nombreCorte.slice(0,3)})</span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', padding: '0.1rem 0.35rem', borderRadius: '4px', background: ytdDiff >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: ytdDiff >= 0 ? '#22c55e' : '#ef4444' }}>
                                                {ytdPct >= 0 ? '+' : ''}{ytdPct}%
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--text)' }}>
                                            {formatMetricShort(ytdVal1)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>vs {formatMetricShort(ytdVal2)}</span>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Cálculo justo a mes transcurrido
                                        </span>
                                    </div>

                                    {/* KPI 5: Mes Récord */}
                                    <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '3px solid #f59e0b' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>MES RÉCORD {anioPrincipal}</span>
                                            <Sparkles size={14} color="#f59e0b" />
                                        </div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                                            {peakMonth.nombre}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {formatMetricShort(peakMonth.val1)}
                                        </span>
                                    </div>
                                </div>

                                {/* Gráfico SVG Dinámico */}
                                <div className="card glass" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {/* Cabecera del Gráfico con Leyenda */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '0.925rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                                {getMetricaNombre(metricaFiltro)}
                                                <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                                                    ({estacionFiltro === 'all' ? 'Todas las Estaciones' : comparativoData.estaciones?.find(e => e.id_empresa === estacionFiltro)?.nombre})
                                                </span>
                                            </h4>
                                        </div>

                                        {/* Leyenda */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#3b82f6' }}></span>
                                                <span style={{ fontWeight: '600' }}>Año {anioPrincipal}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10b981' }}></span>
                                                <span style={{ fontWeight: '600' }}>Año {anioComparar}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Info Banner al pasar el cursor (Hover) */}
                                    <div style={{ minHeight: '26px', padding: '0.3rem 0.6rem', borderRadius: '6px', background: chartHover !== null ? 'rgba(59, 130, 246, 0.1)' : 'transparent', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                                        {chartHover !== null ? (
                                            <>
                                                <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                                                    Mes: {chartData[chartHover].nombre}
                                                </span>
                                                <span>
                                                    <strong style={{ color: '#3b82f6' }}>{anioPrincipal}:</strong> {formatMetricVal(chartData[chartHover].val1)}
                                                </span>
                                                <span>
                                                    <strong style={{ color: '#10b981' }}>{anioComparar}:</strong> {formatMetricVal(chartData[chartHover].val2)}
                                                </span>
                                                <span style={{ fontWeight: 'bold', color: chartData[chartHover].diff >= 0 ? '#22c55e' : '#ef4444' }}>
                                                    Variación: {chartData[chartHover].pct >= 0 ? '+' : ''}{chartData[chartHover].pct}% ({chartData[chartHover].diff >= 0 ? '+' : ''}{formatMetricVal(chartData[chartHover].diff)})
                                                </span>
                                            </>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                Pasa el cursor sobre cualquier mes para ver los valores detallados y la variación exacta.
                                            </span>
                                        )}
                                    </div>

                                    {/* Contenedor SVG Responsivo */}
                                    <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                                        <svg
                                            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                                            style={{ width: '100%', minWidth: '700px', height: 'auto', display: 'block', overflow: 'visible' }}
                                            onMouseLeave={() => setChartHover(null)}
                                        >
                                            <defs>
                                                <linearGradient id="barBlueGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#3b82f6" />
                                                    <stop offset="100%" stopColor="#1d4ed8" />
                                                </linearGradient>
                                                <linearGradient id="barGreenGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#10b981" />
                                                    <stop offset="100%" stopColor="#059669" />
                                                </linearGradient>
                                            </defs>

                                            {/* Líneas de cuadrícula horizontales y etiquetas de eje Y */}
                                            {yGridLevels.map((pct, idx) => {
                                                const yPos = padTop + (1 - pct) * plotH;
                                                const valLevel = pct * chartMax;
                                                return (
                                                    <g key={idx}>
                                                        <line
                                                            x1={padLeft}
                                                            y1={yPos}
                                                            x2={svgWidth - padRight}
                                                            y2={yPos}
                                                            stroke={pct === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}
                                                            strokeWidth={pct === 0 ? 1.5 : 1}
                                                            strokeDasharray={pct === 0 ? 'none' : '4 4'}
                                                        />
                                                        <text
                                                            x={padLeft - 8}
                                                            y={yPos + 4}
                                                            textAnchor="end"
                                                            fontSize="10"
                                                            fill="var(--text-muted)"
                                                            fontWeight="500"
                                                        >
                                                            {formatMetricShort(valLevel)}
                                                        </text>
                                                    </g>
                                                );
                                            })}

                                            {/* Columnas mensuales (Barras o Líneas) */}
                                            {chartData.map((d, i) => {
                                                const xc = padLeft + (i + 0.5) * slotW;
                                                const isHovered = chartHover === i;

                                                // Alturas
                                                const h1 = (d.val1 / chartMax) * plotH;
                                                const y1 = (padTop + plotH) - h1;
                                                const h2 = (d.val2 / chartMax) * plotH;
                                                const y2 = (padTop + plotH) - h2;

                                                const x1 = xc - barW - (barGap / 2);
                                                const x2 = xc + (barGap / 2);

                                                return (
                                                    <g key={i}>
                                                        {/* Fondo de resalte al pasar el cursor */}
                                                        {isHovered && (
                                                            <rect
                                                                x={padLeft + i * slotW}
                                                                y={padTop}
                                                                width={slotW}
                                                                height={plotH}
                                                                fill="rgba(59, 130, 246, 0.08)"
                                                                rx="4"
                                                            />
                                                        )}

                                                        {/* Renderizado en Modo Barras */}
                                                        {tipoGrafico === 'barras' && (
                                                            <>
                                                                {/* Barra Año Principal (Azul) */}
                                                                {d.val1 > 0 && (
                                                                    <rect
                                                                        x={x1}
                                                                        y={y1}
                                                                        width={barW}
                                                                        height={Math.max(h1, 2)}
                                                                        rx="3"
                                                                        fill="url(#barBlueGrad)"
                                                                        opacity={chartHover === null || isHovered ? 1 : 0.5}
                                                                        style={{ transition: 'opacity 0.2s ease, height 0.3s ease' }}
                                                                    />
                                                                )}

                                                                {/* Barra Año Comparado (Verde) */}
                                                                {d.val2 > 0 && (
                                                                    <rect
                                                                        x={x2}
                                                                        y={y2}
                                                                        width={barW}
                                                                        height={Math.max(h2, 2)}
                                                                        rx="3"
                                                                        fill="url(#barGreenGrad)"
                                                                        opacity={chartHover === null || isHovered ? 1 : 0.5}
                                                                        style={{ transition: 'opacity 0.2s ease, height 0.3s ease' }}
                                                                    />
                                                                )}
                                                            </>
                                                        )}

                                                        {/* Etiqueta del Mes en el Eje X */}
                                                        <text
                                                            x={xc}
                                                            y={svgHeight - 15}
                                                            textAnchor="middle"
                                                            fontSize="11"
                                                            fill={isHovered ? 'var(--primary, #3b82f6)' : 'var(--text-color)'}
                                                            fontWeight={isHovered ? 'bold' : 'normal'}
                                                        >
                                                            {d.mes_corto}
                                                        </text>

                                                        {/* Zona interactiva transparente para hover */}
                                                        <rect
                                                            x={padLeft + i * slotW}
                                                            y={padTop}
                                                            width={slotW}
                                                            height={plotH + 25}
                                                            fill="transparent"
                                                            style={{ cursor: 'pointer' }}
                                                            onMouseEnter={() => setChartHover(i)}
                                                        />
                                                    </g>
                                                );
                                            })}

                                            {/* Renderizado en Modo Líneas */}
                                            {tipoGrafico === 'lineas' && (
                                                <>
                                                    {/* Línea Año Principal (Azul) */}
                                                    <polyline
                                                        points={points1}
                                                        fill="none"
                                                        stroke="#3b82f6"
                                                        strokeWidth="2.5"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    />
                                                    {/* Línea Año Comparado (Verde) */}
                                                    <polyline
                                                        points={points2}
                                                        fill="none"
                                                        stroke="#10b981"
                                                        strokeWidth="2"
                                                        strokeDasharray="5 3"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    />

                                                    {/* Puntos / Marcadores */}
                                                    {chartData.map((d, i) => {
                                                        const xc = padLeft + (i + 0.5) * slotW;
                                                        const cy1 = (padTop + plotH) - (d.val1 / chartMax) * plotH;
                                                        const cy2 = (padTop + plotH) - (d.val2 / chartMax) * plotH;
                                                        const isHovered = chartHover === i;

                                                        return (
                                                            <g key={i}>
                                                                {d.val1 > 0 && (
                                                                    <circle
                                                                        cx={xc}
                                                                        cy={cy1}
                                                                        r={isHovered ? 5 : 3.5}
                                                                        fill="#3b82f6"
                                                                        stroke="#fff"
                                                                        strokeWidth="1.5"
                                                                    />
                                                                )}
                                                                {d.val2 > 0 && (
                                                                    <circle
                                                                        cx={xc}
                                                                        cy={cy2}
                                                                        r={isHovered ? 4.5 : 3}
                                                                        fill="#10b981"
                                                                        stroke="#fff"
                                                                        strokeWidth="1.5"
                                                                    />
                                                                )}
                                                            </g>
                                                        );
                                                    })}
                                                </>
                                            )}
                                        </svg>
                                    </div>
                                </div>

                                {/* Tabla Detallada Mes por Mes */}
                                <div className="card glass" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
                                        <h4 style={{ margin: 0, fontSize: '0.925rem', fontWeight: '600' }}>
                                            Comportamiento Mensual Detallado (Enero a Diciembre)
                                        </h4>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {estacionFiltro === 'all' ? 'Consolidado General' : comparativoData.estaciones?.find(e => e.id_empresa === estacionFiltro)?.nombre}
                                        </span>
                                    </div>

                                    <div className="table-responsive" style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '780px' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border)' }}>
                                                    <th style={{ textAlign: 'left', padding: '0.65rem 1rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>Mes</th>
                                                    <th style={{ textAlign: 'right', padding: '0.65rem 1rem', fontSize: '0.74rem', textTransform: 'uppercase', color: '#3b82f6' }}>
                                                        Año {anioPrincipal}
                                                    </th>
                                                    <th style={{ textAlign: 'right', padding: '0.65rem 1rem', fontSize: '0.74rem', textTransform: 'uppercase', color: '#10b981' }}>
                                                        Año {anioComparar}
                                                    </th>
                                                    <th style={{ textAlign: 'right', padding: '0.65rem 1rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                                                        Diferencia Neta
                                                    </th>
                                                    <th style={{ textAlign: 'right', padding: '0.65rem 1rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                                                        % Variación
                                                    </th>
                                                    <th style={{ textAlign: 'center', padding: '0.65rem 1rem', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                                                        Comportamiento
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {chartData.map((d, i) => {
                                                    const isZeroBoth = d.val1 === 0 && d.val2 === 0;
                                                    const isFuture = d.val1 === 0 && d.val2 > 0;
                                                    return (
                                                        <tr
                                                            key={i}
                                                            onMouseEnter={() => setChartHover(i)}
                                                            onMouseLeave={() => setChartHover(null)}
                                                            style={{
                                                                borderBottom: '1px solid var(--border)',
                                                                background: chartHover === i ? 'rgba(59, 130, 246, 0.08)' : (i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'),
                                                                transition: 'background 0.15s ease'
                                                            }}
                                                        >
                                                            <td style={{ padding: '0.55rem 1rem', fontWeight: '600' }}>
                                                                {d.nombre}
                                                            </td>
                                                            <td style={{ padding: '0.55rem 1rem', textAlign: 'right', fontWeight: 'bold', color: d.val1 > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                                                                {d.val1 > 0 ? formatMetricVal(d.val1) : '-'}
                                                            </td>
                                                            <td style={{ padding: '0.55rem 1rem', textAlign: 'right', color: d.val2 > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                                                                {d.val2 > 0 ? formatMetricVal(d.val2) : '-'}
                                                            </td>
                                                            <td style={{ padding: '0.55rem 1rem', textAlign: 'right', fontWeight: '600', color: isZeroBoth ? 'var(--text-muted)' : (d.diff >= 0 ? '#22c55e' : '#ef4444') }}>
                                                                {isZeroBoth ? '-' : `${d.diff >= 0 ? '+' : ''}${formatMetricVal(d.diff)}`}
                                                            </td>
                                                            <td style={{ padding: '0.55rem 1rem', textAlign: 'right' }}>
                                                                {isZeroBoth ? (
                                                                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                                                                ) : isFuture ? (
                                                                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(148, 163, 184, 0.15)', color: 'var(--text-muted)' }}>
                                                                        Pendiente
                                                                    </span>
                                                                ) : (
                                                                    <span style={{
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 'bold',
                                                                        padding: '0.15rem 0.5rem',
                                                                        borderRadius: '4px',
                                                                        background: d.diff >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                                        color: d.diff >= 0 ? '#22c55e' : '#ef4444'
                                                                    }}>
                                                                        {d.diff >= 0 ? '+' : ''}{d.pct}%
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '0.55rem 1rem', textAlign: 'center' }}>
                                                                {isZeroBoth ? (
                                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sin datos</span>
                                                                ) : isFuture ? (
                                                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>En curso / Pendiente</span>
                                                                ) : d.diff >= 0 ? (
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: '600', color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                        <ArrowUpRight size={12} /> Crecimiento
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: '600', color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                        <ArrowDownRight size={12} /> Descenso
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                {/* Fila Total Anual */}
                                                <tr style={{ background: 'rgba(0,0,0,0.04)', fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                                                    <td style={{ padding: '0.75rem 1rem' }}>TOTAL ANUAL</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#3b82f6', fontSize: '0.85rem' }}>
                                                        {formatMetricVal(totVal1)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#10b981', fontSize: '0.85rem' }}>
                                                        {formatMetricVal(totVal2)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: totDiff >= 0 ? '#22c55e' : '#ef4444' }}>
                                                        {totDiff >= 0 ? '+' : ''}{formatMetricVal(totDiff)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                        <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.55rem', borderRadius: '4px', background: totDiff >= 0 ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)', color: totDiff >= 0 ? '#22c55e' : '#ef4444' }}>
                                                            {totDiff >= 0 ? '+' : ''}{totPct}%
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: totDiff >= 0 ? '#22c55e' : '#ef4444' }}>
                                                        {totDiff >= 0 ? 'Superávit Anual' : 'Déficit Anual'}
                                                    </td>
                                                </tr>

                                                {/* Fila Acumulado YTD */}
                                                <tr style={{ background: 'rgba(59, 130, 246, 0.05)', fontWeight: 'bold', borderTop: '1px dashed var(--border)' }}>
                                                    <td style={{ padding: '0.65rem 1rem', color: '#3b82f6' }}>
                                                        ACUMULADO YTD (Ene - {nombreCorte})
                                                    </td>
                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: '#3b82f6' }}>
                                                        {formatMetricVal(ytdVal1)}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: '#10b981' }}>
                                                        {formatMetricVal(ytdVal2)}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', color: ytdDiff >= 0 ? '#22c55e' : '#ef4444' }}>
                                                        {ytdDiff >= 0 ? '+' : ''}{formatMetricVal(ytdDiff)}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                                                        <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.55rem', borderRadius: '4px', background: ytdDiff >= 0 ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)', color: ytdDiff >= 0 ? '#22c55e' : '#ef4444' }}>
                                                            {ytdDiff >= 0 ? '+' : ''}{ytdPct}%
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'center', color: '#3b82f6' }}>
                                                        Comparación Justa YTD
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </div>
            </Modal>
        </div>
    );
}
