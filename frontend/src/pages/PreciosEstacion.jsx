import React, { useState, useEffect } from 'react';
import { Calendar, Search, FileSpreadsheet, Printer, DollarSign } from 'lucide-react';
import { useToast } from '../components/Toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { todayStr } from '../utils/date';
import ReportPreviewModal from '../components/ReportPreviewModal';

export default function PreciosEstacion() {
    const defaultDate = todayStr();

    const [fecha, setFecha] = useState(defaultDate);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();

    // Report preview state
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [pdfSource, setPdfSource] = useState(null);
    const [previewPdfDoc, setPreviewPdfDoc] = useState(null);
    const [totalPages, setTotalPages] = useState(1);
    const [previewFileName, setPreviewFileName] = useState('');

    const fetchData = async (isManual = false) => {
        setLoading(true);
        try {
            const res = await api.get(`/ventas/precios-estacion/${fecha}`);
            if (Array.isArray(res.data)) {
                setData(res.data);
                if (isManual) {
                    if (res.data.length > 0) {
                        addToast('Precios cargados con éxito', 'success');
                    } else {
                        addToast('No hay precios registrados para esta fecha', 'info');
                    }
                }
            } else {
                setData([]);
                addToast('El servicio remoto no devolvió datos válidos', 'error');
            }
        } catch (error) {
            addToast('Error al cargar datos de precios', 'error');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

    const exportToExcel = () => {
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data.map(row => ({
            "Sucursal": row.empresa,
            "Diesel A": row.diesel_a,
            "Regular A": row.regular_a,
            "Super A": row.super_a,
            "Diesel C": row.diesel_c,
            "Regular C": row.regular_c,
            "Super C": row.super_c,
            "Ion Diesel": row.ion_diesel,
            "Master": row.master
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Precios_Estacion");
        XLSX.writeFile(workbook, `Precios_Estacion_${fecha}.xlsx`);
    };

    const handlePreviewPDF = () => {
        if (data.length === 0) {
            addToast('No hay datos para exportar', 'warning');
            return;
        }

        // Carta apaisado (Letter landscape: 279.4 x 215.9 mm)
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
        doc.text('REPORTE DE PRECIOS POR ESTACIÓN (PIZARRAS)', 14, 15);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Fecha de Consulta: ${fecha}  |  Generado: ${new Date().toLocaleDateString('es-SV')} ${new Date().toLocaleTimeString('es-SV')}`, 14, 21);

        const tableColumn = [
            "Sucursal", 
            "Diesel A", "Regular A", "Super A", 
            "Diesel C", "Regular C", "Super C", 
            "Ion Diesel", "Master"
        ];
        
        const tableRows = data.map(row => [
            row.empresa || '-', 
            moneyFmt(row.diesel_a), moneyFmt(row.regular_a), moneyFmt(row.super_a), 
            moneyFmt(row.diesel_c), moneyFmt(row.regular_c), moneyFmt(row.super_c), 
            moneyFmt(row.ion_diesel), moneyFmt(row.master)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2, halign: 'right' },
            columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], halign: 'center' },
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
        setPreviewFileName(`Precios_Estacion_${fecha}.pdf`);
        setPreviewModalOpen(true);
    };

    const NumCell = ({ val }) => (
        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
            {val ? moneyFmt(val) : '-'}
        </td>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <DollarSign size={22} color="var(--primary)" /> 
                        Precios por Estación
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Consulta de pizarras de precio vigentes para el día seleccionado.
                    </p>
                </div>
                
                {data.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button 
                            onClick={exportToExcel} 
                            disabled={data.length === 0} 
                            className="btn-secondary" 
                            style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', height: '36px', padding: '0 0.85rem', fontSize: '0.825rem' }}
                        >
                            <FileSpreadsheet size={16} /> Excel
                        </button>
                        <button 
                            onClick={handlePreviewPDF} 
                            disabled={data.length === 0} 
                            className="btn-secondary" 
                            style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', height: '36px', padding: '0 0.85rem', fontSize: '0.825rem' }}
                        >
                            <Printer size={16} /> Vista Previa / PDF
                        </button>
                    </div>
                )}
            </div>

            {/* Filter Bar */}
            <div className="card glass" style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '0.75rem 1.25rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>Fecha:</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)', height: '36px' }}>
                        <Calendar size={15} color="var(--text-muted)" style={{ marginRight: '0.35rem' }} />
                        <input 
                            type="date" 
                            value={fecha} 
                            onChange={e => setFecha(e.target.value)} 
                            style={{ border: 'none', padding: '0.2rem', fontSize: '0.825rem', background: 'transparent', outline: 'none' }}
                        />
                    </div>
                </div>

                <button 
                    className="btn-primary" 
                    onClick={() => fetchData(true)} 
                    disabled={loading} 
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 1.25rem', fontSize: '0.825rem' }}
                >
                    <Search size={15} /> {loading ? 'Cargando...' : 'Consultar'}
                </button>
            </div>

            {/* Table */}
            <div className="card glass table-responsive" style={{ padding: '0' }}>
                <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '950px' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--primary)', background: 'rgba(0,0,0,0.02)' }}>
                            <th style={{ textAlign: 'left', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Sucursal</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Diesel A</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Regular A</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Super A</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Diesel C</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Regular C</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Super C</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Ion Diesel</th>
                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Master</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap', fontWeight: 'bold' }}>{row.empresa || '-'}</td>
                                <NumCell val={row.diesel_a} />
                                <NumCell val={row.regular_a} />
                                <NumCell val={row.super_a} />
                                <NumCell val={row.diesel_c} />
                                <NumCell val={row.regular_c} />
                                <NumCell val={row.super_c} />
                                <NumCell val={row.ion_diesel} />
                                <NumCell val={row.master} />
                            </tr>
                        ))}
                        {data.length === 0 && !loading && (
                            <tr><td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Realiza una consulta para ver las pizarras de este día</td></tr>
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
                title="Pizarras de Precios por Estación"
                subtitle={`Fecha de consulta: ${fecha}`}
                badge="PRECIOS"
                totalPages={totalPages}
                fileName={previewFileName}
            />
        </div>
    );
}
