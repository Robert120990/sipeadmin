import React, { useState, useEffect } from 'react';
import { Calendar, Search, FileSpreadsheet, FileText, Droplets } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Lubricantes() {
    // Default dates: start of month and today
    const current = new Date();
    const firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
    
    // Formatting helper
    const formatDate = (d) => d.toISOString().split('T')[0];

    const [fechaInicial, setFechaInicial] = useState(formatDate(firstDay));
    const [fechaFinal, setFechaFinal] = useState(formatDate(current));

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();

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
        }
        setLoading(false);
    };

    // Load once on mount
    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const totalVenta = data.reduce((acc, curr) => acc + (curr.venta || 0), 0);
    const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const exportToExcel = () => {
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Lubricantes");
        XLSX.writeFile(workbook, `Venta_Lubricantes_${fechaInicial}_al_${fechaFinal}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    const exportToPDF = () => {
        if (data.length === 0) return;
        const doc = new jsPDF('portrait');
        
        doc.setFontSize(16);
        doc.text('Reporte de Venta de Lubricantes', 14, 15);
        doc.setFontSize(10);
        doc.text(`Periodo: ${fechaInicial} al ${fechaFinal}`, 14, 22);

        const tableColumn = ["Sucursal", "Venta ($)"];
        const tableRows = data.map(row => [row.empresa, moneyFmt(row.venta || 0)]);

        // append totals row
        tableRows.push(["TOTAL", moneyFmt(totalVenta)]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 10, cellPadding: 3 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [245, 245, 245] }
        });

        doc.save(`Venta_Lubricantes_${fechaInicial}_al_${fechaFinal}.pdf`);
        addToast('Documento PDF descargado', 'success');
    };

    const Badge = ({ val }) => {
        return (
            <span style={{ backgroundColor: '#22c55e', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                {val}
            </span>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', zoom: 0.95 }}>
            {/* Headers and Export */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1>Ventas de Lubricantes</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Módulo de reportes consolidados por rango de fechas.</p>
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
                        <Droplets size={20} />
                        <span style={{ fontWeight: '500' }}>Registros: {data.length}</span>
                    </div>
                </div>
            </div>

            {/* Control Bar */}
            <div className="card glass" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Fecha Inicial</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)', width: 'fit-content' }}>
                        <Calendar size={16} color="var(--text-muted)" />
                        <input 
                            type="date" 
                            value={fechaInicial} 
                            onChange={e => setFechaInicial(e.target.value)} 
                            style={{ border: 'none', padding: '0.5rem', fontSize: '0.85rem', background: 'transparent', outline: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Fecha Final</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)', width: 'fit-content' }}>
                        <Calendar size={16} color="var(--text-muted)" />
                        <input 
                            type="date" 
                            value={fechaFinal} 
                            onChange={e => setFechaFinal(e.target.value)} 
                            style={{ border: 'none', padding: '0.5rem', fontSize: '0.85rem', background: 'transparent', outline: 'none' }}
                        />
                    </div>
                </div>

                <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.5rem', marginTop: '1.25rem' }}>
                    <Search size={16} /> {loading ? 'Cargando...' : 'Consultar'}
                </button>
            </div>

            {/* Table */}
            <div className="card glass" style={{ padding: '0' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '1rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'right', padding: '1rem' }}>Venta</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.75rem 1rem' }}>{row.empresa}</td>
                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                        <Badge val={moneyFmt(row.venta || 0)} />
                                    </td>
                                </tr>
                            ))}
                            {data.length > 0 && (
                                <tr style={{ fontWeight: 'bold', background: 'rgba(0,0,0,0.02)' }}>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>Total Venta</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontSize: '1rem', color: 'var(--primary)' }}>
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
            </div>
        </div>
    );
}
