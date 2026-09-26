import React, { useState, useEffect } from 'react';
import { Calendar, Search, FileSpreadsheet, Printer, Droplets } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { todayStr } from '../utils/date';
import ReportPreviewModal from '../components/ReportPreviewModal';

export default function Lubricantes() {
    const current = new Date();
    const firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
    
    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const [fechaInicial, setFechaInicial] = useState(fmtDate(firstDay));
    const [fechaFinal, setFechaFinal] = useState(todayStr());

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();

    // Report preview state
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [pdfSource, setPdfSource] = useState(null);
    const [previewPdfDoc, setPreviewPdfDoc] = useState(null);
    const [totalPages, setTotalPages] = useState(1);
    const [previewFileName, setPreviewFileName] = useState('');

    const fetchData = async () => {
        if (!fechaInicial || !fechaFinal) {
            return addToast('Debes seleccionar ambas fechas', 'error');
        }
        
        if (new Date(fechaInicial) > new Date(fechaFinal)) {
            return addToast('La fecha inicial no puede ser mayor a la fecha final', 'error');
        }

        setLoading(true);
        try {
            const res = await api.get(`/ventas/lubricantes/${fechaInicial}/${fechaFinal}`);
            setData(res.data || []);
            addToast('Datos cargados exitosamente', 'success');
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al cargar datos de lubricantes', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Load once on mount
    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalVenta = data.reduce((acc, curr) => acc + (curr.venta || 0), 0);
    const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

    const exportToExcel = () => {
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data.map(d => ({
            "Sucursal": d.empresa,
            "Venta ($)": d.venta
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Lubricantes");
        XLSX.writeFile(workbook, `Venta_Lubricantes_${fechaInicial}_al_${fechaFinal}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    const handlePreviewPDF = () => {
        if (data.length === 0) {
            addToast('No hay datos para exportar', 'warning');
            return;
        }

        // Carta vertical completo (Letter portrait: 215.9 x 279.4 mm)
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Encabezado
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('REPORTE DE VENTA DE LUBRICANTES', 14, 15);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Período: ${fechaInicial} al ${fechaFinal}  |  Generado: ${new Date().toLocaleDateString('es-SV')} ${new Date().toLocaleTimeString('es-SV')}`, 14, 21);

        const tableColumn = ["Sucursal", "Venta ($)"];
        const tableRows = data.map(row => [row.empresa, moneyFmt(row.venta || 0)]);

        // Fila de totales
        tableRows.push(["TOTAL VENTA", moneyFmt(totalVenta)]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8.5, cellPadding: 2.5 },
            columnStyles: { 
                0: { halign: 'left' },
                1: { halign: 'right', fontStyle: 'bold' }
            },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            margin: { left: 14, right: 14, bottom: 15 },
            didDrawPage: (dataHook) => {
                const pNum = dataHook.pageNumber;
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.text(
                    `Página ${pNum}`,
                    pageWidth - 20,
                    pageHeight - 8,
                    { align: 'right' }
                );
            }
        });

        const pagesCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pagesCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${i} de ${pagesCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
            doc.text('SIPEOFI - Sistema de Información de Estaciones', 14, pageHeight - 8);
        }

        const blob = doc.output('blob');
        setPdfSource(blob);
        setPreviewPdfDoc(doc);
        setTotalPages(pagesCount);
        setPreviewFileName(`Venta_Lubricantes_${fechaInicial}_al_${fechaFinal}.pdf`);
        setPreviewModalOpen(true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <Droplets size={22} color="var(--primary)" />
                        Ventas de Lubricantes
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Reportes consolidados de venta de lubricantes por rango de fechas.
                    </p>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {data.length > 0 && (
                        <>
                            <button 
                                onClick={exportToExcel} 
                                disabled={data.length === 0} 
                                className="btn-secondary" 
                                style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', height: '36px', padding: '0 0.85rem', fontSize: '0.825rem' }} 
                                title="Exportar a Excel"
                            >
                                <FileSpreadsheet size={16} /> Excel
                            </button>
                            <button 
                                onClick={handlePreviewPDF} 
                                disabled={data.length === 0} 
                                className="btn-secondary" 
                                style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', height: '36px', padding: '0 0.85rem', fontSize: '0.825rem' }} 
                                title="Vista Previa / PDF"
                            >
                                <Printer size={16} /> Vista Previa / PDF
                            </button>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: 'var(--primary)', background: 'rgba(37, 99, 235, 0.08)', padding: '0 0.75rem', height: '36px', borderRadius: 'var(--border-radius)', fontSize: '0.825rem' }}>
                        <Droplets size={16} />
                        <span style={{ fontWeight: '600' }}>Registros: {data.length}</span>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="card glass" style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.75rem 1.25rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Desde:</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)', height: '36px' }}>
                        <Calendar size={15} color="var(--text-muted)" style={{ marginRight: '0.35rem' }} />
                        <input 
                            type="date" 
                            value={fechaInicial} 
                            onChange={e => setFechaInicial(e.target.value)} 
                            style={{ border: 'none', padding: '0.2rem', fontSize: '0.825rem', background: 'transparent', outline: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Hasta:</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)', height: '36px' }}>
                        <Calendar size={15} color="var(--text-muted)" style={{ marginRight: '0.35rem' }} />
                        <input 
                            type="date" 
                            value={fechaFinal} 
                            onChange={e => setFechaFinal(e.target.value)} 
                            style={{ border: 'none', padding: '0.2rem', fontSize: '0.825rem', background: 'transparent', outline: 'none' }}
                        />
                    </div>
                </div>

                <button 
                    className="btn-primary" 
                    onClick={fetchData} 
                    disabled={loading} 
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 1.25rem', fontSize: '0.825rem' }}
                >
                    <Search size={15} /> {loading ? 'Cargando...' : 'Consultar'}
                </button>
            </div>

            {/* Table */}
            <div className="card glass table-responsive" style={{ padding: '0' }}>
                <table style={{ width: '100%', fontSize: '0.825rem', borderCollapse: 'collapse', minWidth: '550px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--primary)', background: 'rgba(0,0,0,0.02)' }}>
                            <th style={{ textAlign: 'left', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Sucursal</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Venta ($)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.45rem 0.5rem' }}>{row.empresa}</td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: '600' }}>
                                    {moneyFmt(row.venta || 0)}
                                </td>
                            </tr>
                        ))}
                        {data.length > 0 && (
                            <tr style={{ fontWeight: 'bold', background: 'rgba(0,0,0,0.03)', borderTop: '2px solid var(--border)' }}>
                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', textTransform: 'uppercase', fontSize: '0.8rem' }}>Total Venta</td>
                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontSize: '0.9rem', color: 'var(--primary)' }}>
                                    {moneyFmt(totalVenta)}
                                </td>
                            </tr>
                        )}
                        {data.length === 0 && !loading && (
                            <tr><td colSpan="2" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay datos para mostrar en este rango de fechas</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Vista Previa de Reporte */}
            <ReportPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                pdfSource={pdfSource}
                pdfDoc={previewPdfDoc}
                title="Reporte de Venta de Lubricantes"
                subtitle={`Período: ${fechaInicial} al ${fechaFinal}`}
                badge="LUBRICANTES"
                totalPages={totalPages}
                fileName={previewFileName}
            />
        </div>
    );
}
