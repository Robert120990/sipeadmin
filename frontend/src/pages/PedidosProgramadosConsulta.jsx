import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ClipboardList, 
    RefreshCw, 
    Download, 
    Printer, 
    Fuel, 
    AlertTriangle, 
    CheckCircle2, 
    Clock, 
    Truck, 
    ArrowUpRight,
    ExternalLink,
    Info
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Format numeric values with commas and optional decimals
const numFmt = (n, dec = 0) => {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec
    });
};

export default function PedidosProgramadosConsulta() {
    const navigate = useNavigate();
    const { addToast } = useToast();

    // Data State
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedStation, setSelectedStation] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Report Preview State
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewPages, setPreviewPages] = useState(1);

    // Fetch consolidated data
    const fetchConsolidado = useCallback(async (isManualRefresh = false) => {
        try {
            setLoading(true);
            const res = await api.get('/operaciones/pedidos-programados/consolidado');
            setData(res.data || null);
            if (isManualRefresh) {
                addToast('Datos consolidados actualizados en tiempo real', 'success');
            }
        } catch (error) {
            console.error('Error fetching consolidado pedidos programados:', error);
            addToast('Error al consultar datos consolidados de pedidos programados', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchConsolidado();
    }, [fetchConsolidado]);

    // Format server date array or ISO string
    const formatDisplayDate = (dStr) => {
        if (!dStr) return '';
        const clean = dStr.includes('T') ? dStr.split('T')[0] : dStr;
        const parts = clean.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dStr;
    };

    // Calculate badge color and style for duration in days
    const getDuracionStyle = (dias) => {
        const val = Number(dias || 0);
        if (val <= 0) {
            return {
                bg: '#ef4444',
                color: '#ffffff',
                border: '1px solid #dc2626',
                fontWeight: 'bold'
            };
        }
        if (val < 2.0) {
            return {
                bg: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                fontWeight: 'bold'
            };
        }
        if (val < 4.0) {
            return {
                bg: 'rgba(245, 158, 11, 0.2)',
                color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                fontWeight: 'bold'
            };
        }
        return {
            bg: '#22c55e',
            color: '#ffffff',
            border: '1px solid #16a34a',
            fontWeight: 'bold'
        };
    };

    // KPIs Summary calculations
    const kpis = useMemo(() => {
        if (!data || !data.estaciones) {
            return { totalGalones: 0, pedidosActivos: 0, estacionesCriticas: 0, totalEstaciones: 0 };
        }
        const totalGalones = data.totales?.total_general || 0;
        const pedidosActivos = data.totales?.total_pedidos_activos || 0;
        const totalEstaciones = data.estaciones.length;
        const estacionesCriticas = data.estaciones.filter(e => {
            return (e.d_d <= 2.0 && e.d_d > 0) || (e.d_r <= 2.0 && e.d_r > 0) || (e.d_s <= 2.0 && e.d_s > 0);
        }).length;

        return { totalGalones, pedidosActivos, estacionesCriticas, totalEstaciones };
    }, [data]);

    // Handle station click for detail modal
    const handleStationClick = (station) => {
        setSelectedStation(station);
        setShowDetailModal(true);
    };

    // Export to Excel
    const handleExportExcel = () => {
        if (!data || !data.estaciones || data.estaciones.length === 0) {
            return addToast('No hay datos para exportar', 'warning');
        }

        const excelRows = data.estaciones.map(r => ({
            'Estación': r.estacion,
            'Diesel (Gal)': r.pedido_diesel,
            'Diesel Ion (Gal)': r.pedido_diesel_ion,
            'Regular (Gal)': r.pedido_regular,
            'Súper (Gal)': r.pedido_super,
            'Total Galones': r.total_pedido,
            'D.D. (Días)': r.d_d,
            'D.I. (Días)': r.d_i,
            'D.R. (Días)': r.d_r,
            'D.S. (Días)': r.d_s,
            'Fecha Diesel': r.fecha_diesel || '-',
            'Fecha Diesel Ion': r.fecha_diesel_ion || '-',
            'Fecha Regular': r.fecha_regular || '-',
            'Fecha Súper': r.fecha_super || '-'
        }));

        // Totals row
        excelRows.push({
            'Estación': 'TOTAL GENERAL',
            'Diesel (Gal)': data.totales.pedido_diesel,
            'Diesel Ion (Gal)': data.totales.pedido_diesel_ion,
            'Regular (Gal)': data.totales.pedido_regular,
            'Súper (Gal)': data.totales.pedido_super,
            'Total Galones': data.totales.total_general,
            'D.D. (Días)': '',
            'D.I. (Días)': '',
            'D.R. (Días)': '',
            'D.S. (Días)': '',
            'Fecha Diesel': '',
            'Fecha Diesel Ion': '',
            'Fecha Regular': '',
            'Fecha Súper': ''
        });

        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Pedidos_Programados");
        const filename = `Pedidos_Programados_Consolidado_${data.fecha_actual || 'reporte'}.xlsx`;
        XLSX.writeFile(workbook, filename);
        addToast('Archivo Excel descargado con éxito', 'success');
    };

    // Generate PDF for ReportPreviewModal
    const handleGenerarPDF = () => {
        if (!data || !data.estaciones || data.estaciones.length === 0) {
            return addToast('No hay datos para previsualizar', 'warning');
        }

        // Standard Letter landscape (279.4mm x 215.9mm)
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });

        // Header Title
        doc.setFontSize(14);
        doc.setTextColor(30, 41, 59);
        doc.text('CONSOLIDADO DE PEDIDOS PROGRAMADOS Y AUTONOMÍA DE TANQUES', 14, 14);

        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        const sub = `Fecha de emisión: ${formatDisplayDate(data.fecha_actual)} | Fecha de corte lecturas: ${formatDisplayDate(data.fecha_corte)} | Estaciones: ${data.estaciones.length}`;
        doc.text(sub, 14, 20);

        // Table headers and data
        const head = [
            [
                'ESTACIÓN', 
                'DIESEL', 
                'DIESEL ION', 
                'REGULAR', 
                'SUPER', 
                'D.D.', 
                'D.I.', 
                'D.R.', 
                'D.S.', 
                'FECHA DIESEL', 
                'FECHA DIESEL ION', 
                'FECHA REGULAR', 
                'FECHA SUPER'
            ]
        ];

        const body = data.estaciones.map(r => [
            r.estacion,
            numFmt(r.pedido_diesel),
            numFmt(r.pedido_diesel_ion),
            numFmt(r.pedido_regular),
            numFmt(r.pedido_super),
            r.d_d.toFixed(1),
            r.d_i.toFixed(1),
            r.d_r.toFixed(1),
            r.d_s.toFixed(1),
            r.fecha_diesel || '-',
            r.fecha_diesel_ion || '-',
            r.fecha_regular || '-',
            r.fecha_super || '-'
        ]);

        // Add Totals row to body
        body.push([
            'TOTAL GENERAL',
            numFmt(data.totales.pedido_diesel),
            numFmt(data.totales.pedido_diesel_ion),
            numFmt(data.totales.pedido_regular),
            numFmt(data.totales.pedido_super),
            '-',
            '-',
            '-',
            '-',
            '',
            '',
            '',
            ''
        ]);

        autoTable(doc, {
            startY: 25,
            head: head,
            body: body,
            theme: 'grid',
            styles: {
                fontSize: 7.5,
                cellPadding: 2,
                textColor: [30, 41, 59],
                lineColor: [226, 232, 240],
                lineWidth: 0.1
            },
            headStyles: {
                fillColor: [37, 99, 235],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'left', fontStyle: 'bold', cellWidth: 38 },
                1: { halign: 'right', fillColor: [254, 249, 195], cellWidth: 16 },
                2: { halign: 'right', fillColor: [254, 249, 195], cellWidth: 16 },
                3: { halign: 'right', fillColor: [254, 249, 195], cellWidth: 16 },
                4: { halign: 'right', fillColor: [254, 249, 195], cellWidth: 16 },
                5: { halign: 'center', cellWidth: 11 },
                6: { halign: 'center', cellWidth: 11 },
                7: { halign: 'center', cellWidth: 11 },
                8: { halign: 'center', cellWidth: 11 },
                9: { halign: 'center', cellWidth: 26 },
                10: { halign: 'center', cellWidth: 26 },
                11: { halign: 'center', cellWidth: 26 },
                12: { halign: 'center', cellWidth: 26 }
            },
            didParseCell: function(cellData) {
                // Style totals row
                if (cellData.row.index === body.length - 1) {
                    cellData.cell.styles.fontStyle = 'bold';
                    cellData.cell.styles.fillColor = [241, 245, 249];
                }
            }
        });

        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${i} de ${totalPages} - Sistema SIPE Admin`, 14, 206);
            doc.text(`Generado: ${new Date().toLocaleString('es-SV')}`, 215, 206);
        }

        const blob = doc.output('blob');
        setPreviewPdfBlob(blob);
        setPreviewPages(totalPages);
        setPreviewModalOpen(true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header de la Pantalla */}
            <div className="page-header" style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ padding: '0.45rem', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--primary)', display: 'flex' }}>
                        <ClipboardList size={22} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Pedidos Programados</h1>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Consolidado general de pedidos pendientes, autonomía de tanques y proyección de abastecimiento
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {data?.fecha_actual && (
                        <div style={{ 
                            fontSize: '0.75rem', 
                            padding: '0.25rem 0.65rem', 
                            background: 'var(--bg-active)', 
                            border: '1px solid var(--border)', 
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            color: 'var(--text-muted)'
                        }}>
                            <Clock size={13} color="var(--primary)" />
                            <span>Fecha Servidor: <b style={{ color: 'var(--text-color)' }}>{formatDisplayDate(data.fecha_actual)}</b></span>
                            <span style={{ margin: '0 0.2rem', color: 'var(--border)' }}>|</span>
                            <span>Corte Lecturas: <b style={{ color: 'var(--text-color)' }}>{formatDisplayDate(data.fecha_corte)}</b></span>
                        </div>
                    )}

                    <button 
                        type="button" 
                        onClick={() => fetchConsolidado(true)} 
                        disabled={loading}
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Actualizar datos en tiempo real"
                    >
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                        <span>Actualizar</span>
                    </button>

                    <button 
                        type="button" 
                        onClick={handleExportExcel} 
                        disabled={loading || !data?.estaciones?.length}
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Descargar tabla en formato Excel"
                    >
                        <Download size={14} color="#10b981" />
                        <span>Excel</span>
                    </button>

                    <button 
                        type="button" 
                        onClick={handleGenerarPDF} 
                        disabled={loading || !data?.estaciones?.length}
                        className="btn-primary"
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Generar vista previa e imprimir en tamaño Carta horizontal"
                    >
                        <Printer size={14} />
                        <span>Vista Previa / Imprimir</span>
                    </button>
                </div>
            </div>

            {/* Tarjetas KPI Superiores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)' }}>
                        <Fuel size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Galones Programados</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                            {numFmt(kpis.totalGalones)} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Gal</span>
                        </div>
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <Truck size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Pedidos Pendientes</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>
                            {kpis.pedidosActivos} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>entregas</span>
                        </div>
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.5rem', borderRadius: '8px', background: kpis.estacionesCriticas > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.1)', color: kpis.estacionesCriticas > 0 ? '#ef4444' : '#10b981' }}>
                        {kpis.estacionesCriticas > 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Estaciones en Alerta (&lt;2d)</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: kpis.estacionesCriticas > 0 ? '#ef4444' : '#10b981' }}>
                            {kpis.estacionesCriticas} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>estaciones</span>
                        </div>
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                        <CheckCircle2 size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Red Operativa</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-color)' }}>
                            {kpis.totalEstaciones} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>estaciones</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabla Consolidada de Pedidos Programados */}
            <div className="card glass table-responsive" style={{ padding: 0 }}>
                <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', minWidth: '1000px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-active)', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'left', fontWeight: 'bold', width: '180px' }}>
                                ESTACIÓN
                            </th>
                            
                            {/* Columnas de Combustibles (Fondo suave crema/amarillo) */}
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'right', background: 'rgba(245, 158, 11, 0.08)', borderLeft: '2px solid rgba(245, 158, 11, 0.35)', color: '#f59e0b', fontWeight: 'bold' }}>
                                DIESEL
                            </th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'right', background: 'rgba(139, 92, 246, 0.08)', borderLeft: '1px solid var(--border)', color: '#a78bfa', fontWeight: 'bold' }}>
                                DIESEL ION
                            </th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'right', background: 'rgba(16, 185, 129, 0.08)', borderLeft: '1px solid var(--border)', color: '#10b981', fontWeight: 'bold' }}>
                                REGULAR
                            </th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'right', background: 'rgba(239, 68, 68, 0.08)', borderLeft: '1px solid var(--border)', color: '#ef4444', fontWeight: 'bold' }}>
                                SUPER
                            </th>

                            {/* Columnas de Duración (D.D., D.I., D.R., D.S.) */}
                            <th style={{ padding: '0.55rem 0.45rem', textAlign: 'center', borderLeft: '2px solid var(--border)', fontWeight: 'bold', width: '48px' }}>
                                D.D.
                            </th>
                            <th style={{ padding: '0.55rem 0.45rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontWeight: 'bold', width: '48px' }}>
                                D.I.
                            </th>
                            <th style={{ padding: '0.55rem 0.45rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontWeight: 'bold', width: '48px' }}>
                                D.R.
                            </th>
                            <th style={{ padding: '0.55rem 0.45rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontWeight: 'bold', width: '48px' }}>
                                D.S.
                            </th>

                            {/* Columnas de Fechas Proyectadas */}
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'center', borderLeft: '2px solid var(--border)', fontWeight: 'bold' }}>
                                FECHA DIESEL
                            </th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontWeight: 'bold' }}>
                                FECHA DIESEL ION
                            </th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontWeight: 'bold' }}>
                                FECHA REGULAR
                            </th>
                            <th style={{ padding: '0.55rem 0.65rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontWeight: 'bold' }}>
                                FECHA SUPER
                            </th>

                            <th style={{ padding: '0.55rem 0.5rem', textAlign: 'center', borderLeft: '1px solid var(--border)', width: '60px' }}>
                                DETALLE
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan="14" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                        <div className="spinner" style={{ width: '22px', height: '22px', border: '3px solid var(--primary)', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                        <span>Consultando datos consolidados de todas las estaciones...</span>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {!loading && data?.estaciones?.length === 0 && (
                            <tr>
                                <td colSpan="14" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    No se encontraron estaciones activas registradas.
                                </td>
                            </tr>
                        )}

                        {!loading && data?.estaciones?.map((row) => {
                            const hasOrders = row.total_pedido > 0;
                            const ddStyle = getDuracionStyle(row.d_d);
                            const diStyle = getDuracionStyle(row.d_i);
                            const drStyle = getDuracionStyle(row.d_r);
                            const dsStyle = getDuracionStyle(row.d_s);

                            return (
                                <tr 
                                    key={row.id_empresa}
                                    onClick={() => handleStationClick(row)}
                                    style={{ 
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease',
                                        borderBottom: '1px solid var(--border)'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    title="Clic para ver desglose de pedidos programados y tanques de esta estación"
                                >
                                    {/* Nombre de Estación */}
                                    <td style={{ padding: '0.5rem 0.65rem', fontWeight: 'bold', color: 'var(--text-color)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <span style={{ color: 'var(--primary)' }}>🏢</span>
                                            <span>{row.estacion}</span>
                                            {hasOrders && (
                                                <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: 'rgba(37, 99, 235, 0.15)', color: 'var(--primary)', borderRadius: '4px', border: '1px solid rgba(37, 99, 235, 0.3)' }}>
                                                    {row.pedidos_count}
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    {/* PEDIDO DIESEL */}
                                    <td style={{ 
                                        padding: '0.5rem 0.65rem', 
                                        textAlign: 'right', 
                                        fontWeight: 'bold', 
                                        background: 'rgba(254, 249, 195, 0.35)', 
                                        color: row.pedido_diesel > 0 ? 'var(--text-color)' : 'var(--text-muted)',
                                        borderLeft: '2px solid rgba(245, 158, 11, 0.35)'
                                    }}>
                                        {numFmt(row.pedido_diesel)}
                                    </td>

                                    {/* PEDIDO DIESEL ION */}
                                    <td style={{ 
                                        padding: '0.5rem 0.65rem', 
                                        textAlign: 'right', 
                                        fontWeight: 'bold', 
                                        background: 'rgba(254, 249, 195, 0.35)', 
                                        color: row.pedido_diesel_ion > 0 ? 'var(--text-color)' : 'var(--text-muted)',
                                        borderLeft: '1px solid var(--border)'
                                    }}>
                                        {numFmt(row.pedido_diesel_ion)}
                                    </td>

                                    {/* PEDIDO REGULAR */}
                                    <td style={{ 
                                        padding: '0.5rem 0.65rem', 
                                        textAlign: 'right', 
                                        fontWeight: 'bold', 
                                        background: 'rgba(254, 249, 195, 0.35)', 
                                        color: row.pedido_regular > 0 ? 'var(--text-color)' : 'var(--text-muted)',
                                        borderLeft: '1px solid var(--border)'
                                    }}>
                                        {numFmt(row.pedido_regular)}
                                    </td>

                                    {/* PEDIDO SUPER */}
                                    <td style={{ 
                                        padding: '0.5rem 0.65rem', 
                                        textAlign: 'right', 
                                        fontWeight: 'bold', 
                                        background: 'rgba(254, 249, 195, 0.35)', 
                                        color: row.pedido_super > 0 ? 'var(--text-color)' : 'var(--text-muted)',
                                        borderLeft: '1px solid var(--border)'
                                    }}>
                                        {numFmt(row.pedido_super)}
                                    </td>

                                    {/* D.D. */}
                                    <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center', borderLeft: '2px solid var(--border)' }}>
                                        <span style={{ 
                                            display: 'inline-block', 
                                            minWidth: '38px', 
                                            padding: '0.15rem 0.3rem', 
                                            borderRadius: '4px', 
                                            fontSize: '0.74rem',
                                            background: ddStyle.bg,
                                            color: ddStyle.color,
                                            border: ddStyle.border,
                                            fontWeight: ddStyle.fontWeight
                                        }}>
                                            {row.d_d.toFixed(1)}
                                        </span>
                                    </td>

                                    {/* D.I. */}
                                    <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                                        <span style={{ 
                                            display: 'inline-block', 
                                            minWidth: '38px', 
                                            padding: '0.15rem 0.3rem', 
                                            borderRadius: '4px', 
                                            fontSize: '0.74rem',
                                            background: diStyle.bg,
                                            color: diStyle.color,
                                            border: diStyle.border,
                                            fontWeight: diStyle.fontWeight
                                        }}>
                                            {row.d_i.toFixed(1)}
                                        </span>
                                    </td>

                                    {/* D.R. */}
                                    <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                                        <span style={{ 
                                            display: 'inline-block', 
                                            minWidth: '38px', 
                                            padding: '0.15rem 0.3rem', 
                                            borderRadius: '4px', 
                                            fontSize: '0.74rem',
                                            background: drStyle.bg,
                                            color: drStyle.color,
                                            border: drStyle.border,
                                            fontWeight: drStyle.fontWeight
                                        }}>
                                            {row.d_r.toFixed(1)}
                                        </span>
                                    </td>

                                    {/* D.S. */}
                                    <td style={{ padding: '0.4rem 0.3rem', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                                        <span style={{ 
                                            display: 'inline-block', 
                                            minWidth: '38px', 
                                            padding: '0.15rem 0.3rem', 
                                            borderRadius: '4px', 
                                            fontSize: '0.74rem',
                                            background: dsStyle.bg,
                                            color: dsStyle.color,
                                            border: dsStyle.border,
                                            fontWeight: dsStyle.fontWeight
                                        }}>
                                            {row.d_s.toFixed(1)}
                                        </span>
                                    </td>

                                    {/* FECHA DIESEL */}
                                    <td style={{ padding: '0.5rem 0.65rem', textAlign: 'center', borderLeft: '2px solid var(--border)', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                                        {row.fecha_diesel ? (
                                            <span style={{ color: 'var(--text-color)' }}>{row.fecha_diesel}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </td>

                                    {/* FECHA DIESEL ION */}
                                    <td style={{ padding: '0.5rem 0.65rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                                        {row.fecha_diesel_ion ? (
                                            <span style={{ color: 'var(--text-color)' }}>{row.fecha_diesel_ion}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </td>

                                    {/* FECHA REGULAR */}
                                    <td style={{ padding: '0.5rem 0.65rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                                        {row.fecha_regular ? (
                                            <span style={{ color: 'var(--text-color)' }}>{row.fecha_regular}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </td>

                                    {/* FECHA SUPER */}
                                    <td style={{ padding: '0.5rem 0.65rem', textAlign: 'center', borderLeft: '1px solid var(--border)', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>
                                        {row.fecha_super ? (
                                            <span style={{ color: 'var(--text-color)' }}>{row.fecha_super}</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                                        )}
                                    </td>

                                    {/* BOTÓN VER DETALLE */}
                                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                                        <button 
                                            type="button" 
                                            className="btn-secondary"
                                            style={{ padding: '3px 8px', fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStationClick(row);
                                            }}
                                        >
                                            <span>Ver</span>
                                            <ArrowUpRight size={11} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>

                    {/* Fila de Totales */}
                    {data?.totales && (
                        <tfoot>
                            <tr style={{ background: 'var(--bg-active)', borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                                <td style={{ padding: '0.55rem 0.65rem', color: 'var(--primary)' }}>
                                    TOTALES CONSOLIDADOS
                                </td>
                                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', color: '#f59e0b', borderLeft: '2px solid rgba(245, 158, 11, 0.35)', background: 'rgba(245, 158, 11, 0.05)' }}>
                                    {numFmt(data.totales.pedido_diesel)}
                                </td>
                                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', color: '#a78bfa', borderLeft: '1px solid var(--border)', background: 'rgba(139, 92, 246, 0.05)' }}>
                                    {numFmt(data.totales.pedido_diesel_ion)}
                                </td>
                                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', color: '#10b981', borderLeft: '1px solid var(--border)', background: 'rgba(16, 185, 129, 0.05)' }}>
                                    {numFmt(data.totales.pedido_regular)}
                                </td>
                                <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', color: '#ef4444', borderLeft: '1px solid var(--border)', background: 'rgba(239, 68, 68, 0.05)' }}>
                                    {numFmt(data.totales.pedido_super)}
                                </td>
                                <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', borderLeft: '2px solid var(--border)', fontSize: '0.74rem' }}>
                                    (Autonomías calculadas con pedido)
                                </td>
                                <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)', borderLeft: '2px solid var(--border)', fontSize: '0.74rem' }}>
                                    Total General: <b style={{ color: 'var(--primary)' }}>{numFmt(data.totales.total_general)} Galones</b>
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {/* Leyenda y Notas Operacionales */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 'bold' }}>Semáforo de Autonomía:</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#ef4444' }}></span>
                        <span>0.0 días (Sin producto / Crítico)</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#22c55e' }}></span>
                        <span>&gt; 0 días (Óptimo / En servicio)</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ width: '14px', height: '10px', borderRadius: '2px', background: 'rgba(254, 249, 195, 0.8)', border: '1px solid rgba(245, 158, 11, 0.5)' }}></span>
                        <span>Galones Pedidos a Puma</span>
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Info size={13} color="var(--primary)" />
                    <span>Haz clic en cualquier estación para ver el desglose de pipas y lecturas de tanques</span>
                </div>
            </div>

            {/* MODAL DETALLE DE ESTACIÓN */}
            <Modal 
                open={showDetailModal} 
                onClose={() => setShowDetailModal(false)} 
                title={selectedStation ? `Detalle Operacional: ${selectedStation.estacion}` : 'Detalle de Estación'}
                size="xl"
            >
                {selectedStation && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Cabecera del Detalle */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(37, 99, 235, 0.08)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.25)', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                    {selectedStation.estacion} (Código: {selectedStation.id_empresa})
                                </h3>
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                    Corte de inventario: {formatDisplayDate(data?.fecha_corte)} | Total Programado: <b>{numFmt(selectedStation.total_pedido)} Gal</b>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn-primary"
                                style={{ fontSize: '0.75rem', padding: '0.4rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                onClick={() => {
                                    setShowDetailModal(false);
                                    navigate('/dashboard/operaciones/pedidos');
                                }}
                            >
                                <span>Abrir en Pedidos de Combustible</span>
                                <ExternalLink size={13} />
                            </button>
                        </div>

                        {/* SECCIÓN 1: Pedidos Programados Individuales */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.45rem' }}>
                                <Truck size={16} color="var(--primary)" />
                                <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold' }}>
                                    Pedidos Programados Pendientes ({selectedStation.pedidos?.length || 0})
                                </h4>
                            </div>

                            {(!selectedStation.pedidos || selectedStation.pedidos.length === 0) ? (
                                <div style={{ padding: '1rem', background: 'var(--bg-active)', borderRadius: '6px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    No hay pedidos programados pendientes registrados para esta estación.
                                </div>
                            ) : (
                                <div className="card glass table-responsive" style={{ padding: 0 }}>
                                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-active)', borderBottom: '1px solid var(--border)' }}>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left' }}>FECHA ENTREGA</th>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left' }}># PEDIDO</th>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>DIESEL</th>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>REGULAR</th>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>SUPER</th>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>ION</th>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>TOTAL PIPA</th>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left' }}>TRANSPORTISTA</th>
                                                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left' }}>PIPA</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedStation.pedidos.map(p => (
                                                <tr key={p.id_pedido} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.45rem 0.5rem' }}>{formatDisplayDate(p.fecha)}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                                        <div>{p.numero || `TEMP-${p.id_pedido}`}</div>
                                                        {p.nombre_estacion_compartida && (
                                                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'rgba(59, 130, 246, 0.15)', color: '#38bdf8', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.1rem' }}>
                                                                🤝 Compartido con {p.nombre_estacion_compartida}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#f59e0b', fontWeight: 'bold' }}>{numFmt(p.diesel)}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#10b981', fontWeight: 'bold' }}>{numFmt(p.regular)}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#ef4444', fontWeight: 'bold' }}>{numFmt(p.super)}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#8b5cf6', fontWeight: 'bold' }}>{numFmt(p.iondiesel)}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--text-color)' }}>{numFmt(p.total_galones)} Gal</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>{p.transportista_nombre}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>{p.pipa_placa}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* SECCIÓN 2: Estado de Tanques y Proyecciones */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.45rem' }}>
                                <Fuel size={16} color="var(--primary)" />
                                <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold' }}>
                                    Estado de Tanques y Proyección de Agotamiento
                                </h4>
                            </div>

                            <div className="card glass table-responsive" style={{ padding: 0 }}>
                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg-active)', borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'left' }}>PRODUCTO</th>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'right' }}>INVENTARIO</th>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'right' }}>FUERA DE VENTA</th>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'right' }}>CAPACIDAD</th>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'right' }}>VENTA PROM.</th>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'right' }}>PROGRAMADO</th>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'center' }}>NIVEL %</th>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'center' }}>DÍAS AUTONOMÍA</th>
                                            <th style={{ padding: '0.45rem 0.55rem', textAlign: 'center' }}>FECHA PROYECTADA</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            { code: 'D', name: 'DIESEL', color: '#f59e0b' },
                                            { code: 'I', name: 'DIESEL ION', color: '#8b5cf6' },
                                            { code: 'R', name: 'REGULAR', color: '#10b981' },
                                            { code: 'S', name: 'SUPER', color: '#ef4444' }
                                        ].map(prod => {
                                            const tData = selectedStation.tanques_detalle?.[prod.code] || {};
                                            const dStyle = getDuracionStyle(tData.durDias);

                                            return (
                                                <tr key={prod.code} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.45rem 0.55rem', fontWeight: 'bold', color: prod.color }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: prod.color }}></span>
                                                            {prod.name}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right', fontWeight: 'bold' }}>{numFmt(tData.inventario)}</td>
                                                    <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right', color: '#f87171' }}>{numFmt(tData.reserva)}</td>
                                                    <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right', color: 'var(--text-muted)' }}>{numFmt(tData.capacidad)}</td>
                                                    <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right', color: '#c084fc' }}>{numFmt(tData.promedio)}</td>
                                                    <td style={{ padding: '0.45rem 0.55rem', textAlign: 'right', fontWeight: 'bold', color: prod.color }}>{numFmt(tData.programado)}</td>
                                                    <td style={{ padding: '0.45rem 0.55rem', textAlign: 'center', fontWeight: 'bold' }}>
                                                        {tData.capacidad > 0 ? `${tData.nivel}%` : '-'}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.55rem', textAlign: 'center' }}>
                                                        <span style={{ 
                                                            display: 'inline-block', 
                                                            minWidth: '40px', 
                                                            padding: '0.15rem 0.35rem', 
                                                            borderRadius: '4px', 
                                                            fontSize: '0.74rem',
                                                            background: dStyle.bg,
                                                            color: dStyle.color,
                                                            border: dStyle.border,
                                                            fontWeight: dStyle.fontWeight
                                                        }}>
                                                            {(tData.durDias || 0).toFixed(1)}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.55rem', textAlign: 'center', color: 'var(--text-color)', fontWeight: 'bold' }}>
                                                        {tData.fechaStr || '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Botón de cierre modal */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowDetailModal(false)}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL VISTA PREVIA REPORTE IMPRESIÓN */}
            <ReportPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                title="Consolidado de Pedidos Programados"
                subtitle={`Corte de lecturas: ${formatDisplayDate(data?.fecha_corte)} | Emisión: ${formatDisplayDate(data?.fecha_actual)}`}
                badge="OPERACIONES"
                pdfSource={previewPdfBlob}
                fileName={`Pedidos_Programados_${data?.fecha_actual || 'reporte'}.pdf`}
                totalPages={previewPages}
                footerInfo="Formato oficial SIPE Admin - Tamaño Carta Horizontal"
            />
        </div>
    );
}
