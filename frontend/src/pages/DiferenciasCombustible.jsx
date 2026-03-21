import React, { useState } from 'react';
import { Search, FileSpreadsheet, FileText, ClipboardList } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function DiferenciasCombustible() {
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();

    const fetchData = async () => {
        if (!startDate || !endDate) return addToast('Seleccione un rango de fechas', 'warning');
        setLoading(true);
        try {
            const response = await api.get(`/consultas/diferencias-combustible/${startDate}/${endDate}`);
            setData(response.data);
            if (response.data.length === 0) addToast('No se encontraron registros', 'info');
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al cargar datos', 'error');
        } finally {
            setLoading(false);
        }
    };

    const numFmt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

    const exportPDF = () => {
        if (!data.length) return addToast('No hay datos para exportar', 'warning');
        const doc = new jsPDF({ orientation: 'landscape' });
        
        doc.setFontSize(16);
        doc.text('Diferencias en Combustibles', 14, 15);
        doc.setFontSize(10);
        doc.text(`Desde: ${startDate} - Hasta: ${endDate}`, 14, 22);

        const tableColumn = ["Sucursal", "Tipo", "Inicial", "Recargas", "Ventas", "Final", "Suma", "Diferencia"];
        const tableRows = data.map(row => [
            row.empresa, row.combustible,
            numFmt(row.inicial), numFmt(row.recargas), numFmt(row.venta), 
            numFmt(row.final), numFmt(row.suma), numFmt(row.diferencia)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] }
        });
        
        doc.save(`Diferencias_Combustible_${startDate}_al_${endDate}.pdf`);
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
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Diferencias en Combustibles</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Consulta de inventarios y diferencias (Galones/Litros).</p>
                </div>
                {data.length > 0 && (
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={exportExcel} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <FileSpreadsheet size={18} /> Excel
                        </button>
                        <button onClick={exportPDF} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <FileText size={18} /> PDF
                        </button>
                    </div>
                )}
            </div>

            <div className="card glass" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Desde:</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="form-control" />
                </div>
                <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
                    <label>Hasta:</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="form-control" />
                </div>
                <button onClick={fetchData} className="btn-primary" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '42px' }}>
                    <Search size={18} /> {loading ? 'Consultando...' : 'Realizar consulta'}
                </button>
            </div>

            <div className="card glass" style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: '800px' }}>
                    <thead>
                        <tr>
                            <th>Sucursal</th>
                            <th>Tipo</th>
                            <th style={{textAlign: 'right'}}>Inicial</th>
                            <th style={{textAlign: 'right'}}>Recargas</th>
                            <th style={{textAlign: 'right'}}>Ventas</th>
                            <th style={{textAlign: 'right'}}>Final</th>
                            <th style={{textAlign: 'right'}}>Suma</th>
                            <th style={{textAlign: 'right'}}>Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.length > 0 ? (
                            data.map((row, idx) => (
                                <tr key={idx}>
                                    <td>{row.empresa}</td>
                                    <td>{row.combustible}</td>
                                    <td style={{textAlign: 'right'}}>{numFmt(row.inicial)}</td>
                                    <td style={{textAlign: 'right'}}>{numFmt(row.recargas)}</td>
                                    <td style={{textAlign: 'right'}}>{numFmt(row.venta)}</td>
                                    <td style={{textAlign: 'right'}}>{numFmt(row.final)}</td>
                                    <td style={{textAlign: 'right', fontWeight: 'bold'}}>{numFmt(row.suma)}</td>
                                    <td style={{
                                        textAlign: 'right', 
                                        color: row.diferencia < 0 ? '#ef4444' : (row.diferencia > 0 ? '#3b82f6' : 'inherit'), 
                                        fontWeight: 'bold'
                                    }}>
                                        {numFmt(row.diferencia)}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                    {loading ? 'Cargando datos...' : 'No hay datos para mostrar...'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
