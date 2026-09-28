import React, { useState, useEffect } from 'react';
import { 
    Calendar, Search, FileSpreadsheet, Printer, 
    ChevronLeft, ChevronRight, Fuel, Store, DollarSign, 
    Layers, TrendingUp 
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReportPreviewModal from '../components/ReportPreviewModal';

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
    
    const { addToast } = useToast();

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
        </div>
    );
}
