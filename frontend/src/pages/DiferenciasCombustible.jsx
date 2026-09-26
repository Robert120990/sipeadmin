import React, { useState } from 'react';
import { Search, FileSpreadsheet, Printer } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { todayStr } from '../utils/date';

export default function DiferenciasCombustible() {
    const [startDate, setStartDate] = useState(todayStr());
    const [endDate, setEndDate] = useState(todayStr());
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();

    // ReportPreviewModal state
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewFileName, setPreviewFileName] = useState('Diferencias_Combustible.pdf');

    const fetchData = async (isManual = false) => {
        if (!startDate || !endDate) return addToast('Seleccione un rango de fechas', 'warning');
        setLoading(true);
        try {
            const response = await api.get(`/consultas/diferencias-combustible/${startDate}/${endDate}`);
            setData(response.data);
            if (response.data.length === 0) {
                addToast('No se encontraron registros', 'info');
            } else if (isManual) {
                addToast('Diferencias cargadas con éxito', 'success');
            }
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al cargar datos', 'error');
        } finally {
            setLoading(false);
        }
    };

    const numFmt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

    const exportPDF = () => {
        if (!data.length) return addToast('No hay datos para exportar', 'warning');
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });
        
        doc.setFontSize(15);
        doc.text('Diferencias en Combustibles', 14, 15);
        doc.setFontSize(9);
        doc.text(`Período: ${startDate} al ${endDate} | Total Registros: ${data.length}`, 14, 21);

        const tableColumn = ["Sucursal", "Tipo", "Inicial", "Recargas", "Ventas", "Final", "Suma", "Diferencia"];
        const tableRows = data.map(row => [
            row.empresa, row.combustible,
            numFmt(row.inicial), numFmt(row.recargas), numFmt(row.venta), 
            numFmt(row.final), numFmt(row.suma), numFmt(row.diferencia)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            didDrawPage: (dPage) => {
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(`Página ${dPage.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 8, { align: 'right' });
                doc.text('SIPE Admin - Reporte de Diferencias de Combustibles', 14, doc.internal.pageSize.height - 8);
            }
        });
        
        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        const fileName = `Diferencias_Combustible_${startDate}_al_${endDate}.pdf`;
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewFileName(fileName);
        setShowPreviewModal(true);
    };

    const exportExcel = () => {
        if (!data.length) return addToast('No hay datos para exportar', 'warning');
        const worksheet = XLSX.utils.json_to_sheet(data.map(row => ({
            "Sucursal": row.empresa,
            "Tipo": row.combustible,
            "Inicial": row.inicial,
            "Recargas": row.recargas,
            "Ventas": row.venta,
            "Final": row.final,
            "Suma": row.suma,
            "Diferencia": row.diferencia
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Diferencias");
        XLSX.writeFile(workbook, `Diferencias_Combustible_${startDate}_al_${endDate}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: 'var(--primary)' }}>Diferencias en Combustibles</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Consulta de inventarios y diferencias (Galones/Litros).</p>
                </div>
                {data.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={exportExcel} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', height: '36px', fontSize: '0.825rem' }}>
                            <FileSpreadsheet size={16} /> Excel
                        </button>
                        <button onClick={exportPDF} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', height: '36px', fontSize: '0.825rem' }} title="Vista previa e impresión en tamaño Carta">
                            <Printer size={16} /> Vista Previa / PDF
                        </button>
                    </div>
                )}
            </div>

            <div className="card glass" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1', minWidth: '160px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Desde:</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="form-control" style={{ height: '36px', fontSize: '0.825rem' }} />
                </div>
                <div className="form-group" style={{ flex: '1', minWidth: '160px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Hasta:</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="form-control" style={{ height: '36px', fontSize: '0.825rem' }} />
                </div>
                <button onClick={() => fetchData(true)} className="btn-primary" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '36px', fontSize: '0.825rem', padding: '0 1.25rem' }}>
                    <Search size={16} /> {loading ? 'Consultando...' : 'Realizar consulta'}
                </button>
            </div>

            <div className="card glass table-responsive" style={{ padding: 0 }}>
                <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                            <th style={{ padding: '0.6rem 0.75rem' }}>Sucursal</th>
                            <th style={{ padding: '0.6rem 0.75rem' }}>Tipo</th>
                            <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem' }}>Inicial</th>
                            <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem' }}>Recargas</th>
                            <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem' }}>Ventas</th>
                            <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem' }}>Final</th>
                            <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem' }}>Suma</th>
                            <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem' }}>Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.length > 0 ? (
                            data.map((row, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '0.55rem 0.75rem' }}>{row.empresa}</td>
                                    <td style={{ padding: '0.55rem 0.75rem' }}>{row.combustible}</td>
                                    <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem' }}>{numFmt(row.inicial)}</td>
                                    <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem' }}>{numFmt(row.recargas)}</td>
                                    <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem' }}>{numFmt(row.venta)}</td>
                                    <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem' }}>{numFmt(row.final)}</td>
                                    <td style={{ textAlign: 'right', padding: '0.55rem 0.75rem', fontWeight: 'bold' }}>{numFmt(row.suma)}</td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: '0.55rem 0.75rem',
                                        color: row.diferencia < 0 ? '#ef4444' : (row.diferencia > 0 ? '#3b82f6' : 'inherit'), 
                                        fontWeight: 'bold'
                                    }}>
                                        {numFmt(row.diferencia)}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                    {loading ? 'Cargando datos...' : 'No hay datos para mostrar...'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <ReportPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                pdfSource={previewPdfBlob}
                title="Diferencias en Combustibles"
                subtitle={`Período: ${startDate} al ${endDate} | Total Registros: ${data.length}`}
                badge="COMBUSTIBLES"
                totalPages={previewTotalPages}
                fileName={previewFileName}
            />
        </div>
    );
}
