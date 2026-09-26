import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { FileSpreadsheet, Printer, Cake, Building2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseDateOnly, formatDateDisplay, isBirthdayToday, todayStr } from '../utils/date';
import ReportPreviewModal from '../components/ReportPreviewModal';

export default function ConsultasCumpleanos() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    // Report preview state
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [pdfSource, setPdfSource] = useState(null);
    const [previewPdfDoc, setPreviewPdfDoc] = useState(null);
    const [totalPages, setTotalPages] = useState(1);
    const [previewFileName, setPreviewFileName] = useState('');

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/consultas/cumpleanos');
            setData(res.data);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar los cumpleañeros', 'error');
        } finally {
            setLoading(false);
        }
    };

    const exportToExcel = () => {
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Cumpleañeros");
        XLSX.writeFile(workbook, `Cumpleañeros_${todayStr()}.xlsx`);
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
        doc.text("CUMPLEAÑEROS DEL MES ACTUAL", 14, 15);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Listado de personal activo  |  Generado: ${new Date().toLocaleDateString('es-SV')} ${new Date().toLocaleTimeString('es-SV')}`, 14, 21);

        const tableColumn = ["Nombre", "Departamento", "Cumpleaños", "Empresa"];
        const tableRows = data.map(item => [
            item.nombre,
            item.departamento || 'N/A',
            formatDateDisplay(item.fecha_nacimiento),
            item.empresa
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8.5, cellPadding: 2.5 },
            headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] },
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
        setPreviewFileName(`Cumpleaños_${todayStr()}.pdf`);
        setPreviewModalOpen(true);
    };

    // Grouping logic
    const groupedData = data.reduce((acc, curr) => {
        if (!acc[curr.empresa]) acc[curr.empresa] = [];
        acc[curr.empresa].push(curr);
        return acc;
    }, {});

    if (loading) return <div className="p-8 text-center text-muted animate-pulse" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando cumpleañeros...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <Cake size={22} color="#10b981" />
                        Cumpleañeros del Mes
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Registro de empleados activos que celebran su natalicio en el mes en curso.
                    </p>
                </div>
                
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
            </div>

            {data.length > 0 ? (
                Object.keys(groupedData).map(empresa => (
                    <div key={empresa} style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <Building2 size={18} color="#10b981" />
                            <h2 style={{ fontSize: '1rem', margin: 0, color: 'var(--primary)', fontWeight: '600' }}>{empresa}</h2>
                            <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>
                                {groupedData[empresa].length} {groupedData[empresa].length === 1 ? 'cumpleañero' : 'cumpleañeros'}
                            </span>
                        </div>
                        
                        <div className="card glass table-responsive" style={{ padding: 0 }}>
                            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '600px' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid rgba(16, 185, 129, 0.3)', background: 'rgba(0,0,0,0.02)' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Nombre</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Departamento</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Día</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Fecha Completa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedData[empresa].map((emp, idx) => {
                                        const birthParts = parseDateOnly(emp.fecha_nacimiento);
                                        const today = isBirthdayToday(emp.fecha_nacimiento);
                                        
                                        return (
                                            <tr key={idx} style={{ 
                                                borderBottom: '1px solid var(--border)',
                                                backgroundColor: today ? 'rgba(16, 185, 129, 0.08)' : 'transparent'
                                            }}>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: '500' }}>
                                                    {emp.nombre}
                                                    {today && <span style={{ marginLeft: '0.5rem', fontSize: '1rem' }} title="¡Cumpleaños hoy!">🎂</span>}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>
                                                    {emp.departamento || 'Sin asignar'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>
                                                    <span style={{ 
                                                        fontWeight: 'bold', 
                                                        color: today ? '#10b981' : 'var(--text-color)',
                                                        backgroundColor: today ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.8rem'
                                                    }}>
                                                        Día {birthParts.day}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>
                                                    {formatDateDisplay(emp.fecha_nacimiento)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            ) : (
                <div className="card glass" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No se encontraron cumpleañeros para el mes actual.
                </div>
            )}

            {/* Modal de Vista Previa de Reporte */}
            <ReportPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                pdfSource={pdfSource}
                pdfDoc={previewPdfDoc}
                title="Cumpleañeros del Mes"
                subtitle="Listado general de cumpleaños"
                badge="PERSONAL"
                totalPages={totalPages}
                fileName={previewFileName}
            />
        </div>
    );
}
