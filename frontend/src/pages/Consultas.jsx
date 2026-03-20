import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { BarChart3, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Consultas({ type, title, description }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

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
        XLSX.writeFile(workbook, `${title.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    const exportToPDF = () => {
        if (data.length === 0) return;
        // Landscape to fit all dynamic columns
        const doc = new jsPDF('landscape');
        
        doc.setFontSize(16);
        doc.text(title, 14, 15);
        doc.setFontSize(10);
        doc.text(description, 14, 22);

        const tableColumn = columns.map(c => c.replace(/_/g, ' '));
        const tableRows = data.map(row => {
            return columns.map(c => {
                const cellValue = row[c];
                // format correctly as money where applicable on PDF
                return typeof cellValue === 'number' 
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cellValue)
                    : cellValue;
            });
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });

        doc.save(`${title.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
        addToast('Documento PDF descargado', 'success');
    };

    if (loading) return <div>Cargando consulta...</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1>{title}</h1>
                    <p style={{ color: 'var(--text-muted)' }}>{description}</p>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={exportToExcel} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} title="Exportar a formato Excel">
                            <FileSpreadsheet size={18} /> Excel
                        </button>
                        <button onClick={exportToPDF} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }} title="Exportar a formato PDF">
                            <FileText size={18} /> PDF
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--primary)', background: 'rgba(37, 99, 235, 0.1)', padding: '0.5rem 1rem', borderRadius: 'var(--border-radius)' }}>
                        <BarChart3 size={20} />
                        <span style={{ fontWeight: '500' }}>Registros encontrados: {data.length}</span>
                    </div>
                </div>
            </div>

            <div className="card glass" style={{ overflowX: 'auto' }}>
                {data.length > 0 ? (
                    <table style={{ minWidth: '100%', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                        <thead>
                            <tr>
                                {columns.map(col => (
                                    <th key={col} style={{ textTransform: 'capitalize' }}>{col.replace(/_/g, ' ')}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, idx) => (
                                <tr key={idx}>
                                    {columns.map(col => {
                                        const cellValue = row[col];
                                        // Format numbers safely, leave strings alone
                                        const displayValue = typeof cellValue === 'number' 
                                            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cellValue)
                                            : cellValue;
                                            
                                        return (
                                            <td key={`${idx}-${col}`}>
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
        </div>
    );
}
