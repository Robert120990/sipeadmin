import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { BarChart3, FileSpreadsheet, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { todayStr } from '../utils/date';

export default function Consultas({ type, title, description }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    // ReportPreviewModal state
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewFileName, setPreviewFileName] = useState('Reporte.pdf');

    useEffect(() => {
        fetchData();
    }, [type]); // Refetch if type changes

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/consultas/${type}`);
            setData(res.data);
            setLoading(false);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar los datos', 'error');
            setLoading(false);
        }
    };

    const columns = data.length > 0 ? Object.keys(data[0]) : [];

    const exportToExcel = () => {
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
        XLSX.writeFile(workbook, `${title.replace(/ /g, '_')}_${todayStr()}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    const exportToPDF = () => {
        if (data.length === 0) return;
        // Landscape letter size according to AGENTS.md
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });
        
        doc.setFontSize(15);
        doc.text(title, 14, 15);
        doc.setFontSize(9);
        doc.text(description, 14, 21);

        const tableColumn = columns.map(c => c.replace(/_/g, ' '));
        const tableRows = data.map(row => {
            return columns.map(c => {
                const cellValue = row[c];
                return typeof cellValue === 'number' 
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cellValue)
                    : cellValue;
            });
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didDrawPage: (data) => {
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 8, { align: 'right' });
                doc.text('SIPE Admin - Reporte Oficial de Consultas Bancarias', 14, doc.internal.pageSize.height - 8);
            }
        });

        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        const fileName = `${title.replace(/ /g, '_')}_${todayStr()}.pdf`;
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewFileName(fileName);
        setShowPreviewModal(true);
    };

    if (loading) return <div>Cargando consulta...</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--primary)' }}>{title}</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>{description}</p>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button onClick={exportToExcel} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', height: '36px', fontSize: '0.825rem' }} title="Exportar a formato Excel">
                            <FileSpreadsheet size={16} /> Excel
                        </button>
                        <button onClick={exportToPDF} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', height: '36px', fontSize: '0.825rem' }} title="Vista previa en tamaño Carta e impresión">
                            <Printer size={16} /> Vista Previa / PDF
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--primary)', background: 'rgba(37, 99, 235, 0.1)', padding: '0.35rem 0.85rem', borderRadius: 'var(--border-radius)', height: '36px', fontSize: '0.825rem' }}>
                        <BarChart3 size={18} />
                        <span style={{ fontWeight: '500' }}>Registros: {data.length}</span>
                    </div>
                </div>
            </div>

            <div className="card glass table-responsive" style={{ padding: 0 }}>
                {data.length > 0 ? (
                    <table style={{ width: '100%', minWidth: '850px', whiteSpace: 'nowrap', fontSize: '0.825rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                                {columns.map(col => (
                                    <th key={col} style={{ textTransform: 'capitalize', padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>{col.replace(/_/g, ' ')}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    {columns.map(col => {
                                        const cellValue = row[col];
                                        const displayValue = typeof cellValue === 'number' 
                                            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cellValue)
                                            : cellValue;
                                            
                                        return (
                                            <td key={`${idx}-${col}`} style={{ padding: '0.5rem 0.75rem' }}>
                                                {displayValue}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        No se encontraron registros en el sistema externo, o debes configurar la conexión primero en el apartado Configuración.
                    </div>
                )}
            </div>

            <ReportPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                pdfSource={previewPdfBlob}
                title={title}
                subtitle={description}
                badge={type === 'saldos-bancos' ? 'BANCOS' : 'CHEQUERA'}
                totalPages={previewTotalPages}
                fileName={previewFileName}
            />
        </div>
    );
}
