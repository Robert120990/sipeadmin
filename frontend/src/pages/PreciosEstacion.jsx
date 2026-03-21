import React, { useState, useEffect } from 'react';
import { Calendar, Search, FileSpreadsheet, FileText, CheckCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import api from '../services/api';

export default function PreciosEstacion() {
    const defaultDate = new Date().toISOString().split('T')[0];

    const [fecha, setFecha] = useState(defaultDate);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/ventas/precios-estacion/${fecha}`);
            if (Array.isArray(res.data)) {
                setData(res.data);
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

    // Load once on mount unconditionally
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

    const exportToPDF = () => {
        if (data.length === 0) return;
        const doc = new jsPDF('landscape');
        
        doc.setFontSize(16);
        doc.text('Precios por Estación', 14, 15);
        doc.setFontSize(10);
        doc.text(`Fecha Consulta: ${fecha}`, 14, 22);

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
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2, halign: 'right' },
            columnStyles: { 0: { halign: 'left' } },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], halign: 'center' }
        });

        doc.save(`Precios_Estacion_${fecha}.pdf`);
    };

    const NumCell = ({ val }) => (
        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
            {val ? moneyFmt(val) : '-'}
        </td>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', zoom: 0.90 }}>
            {/* Headers and Export */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <CheckCircle size={28} color="var(--primary)" /> 
                        Precios por Estación
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>Módulo de consulta de Pizarras de Precio para el día seleccionado.</p>
                </div>
                
                {data.length > 0 && (
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button onClick={exportToExcel} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <FileSpreadsheet size={18} /> Excel
                        </button>
                        <button onClick={exportToPDF} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <FileText size={18} /> PDF
                        </button>
                    </div>
                )}
            </div>

            {/* Control Bar */}
            <div className="card glass" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Fecha de Consulta</label>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden', padding: '0 0.5rem', background: 'var(--bg-color)', width: 'fit-content' }}>
                        <Calendar size={16} color="var(--text-muted)" />
                        <input 
                            type="date" 
                            value={fecha} 
                            onChange={e => setFecha(e.target.value)} 
                            style={{ border: 'none', padding: '0.5rem', fontSize: '0.85rem', background: 'transparent', outline: 'none' }}
                        />
                    </div>
                </div>

                <button className="btn-primary" onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.5rem', marginTop: '1.25rem' }}>
                    <Search size={16} /> {loading ? 'Cargando...' : 'Realizar consulta'}
                </button>
            </div>

            {/* Table */}
            <div className="card glass" style={{ padding: '0' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '950px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--primary)' }}>
                                <th style={{ textAlign: 'left', padding: '1rem 0.5rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Diesel A</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Regular A</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Super A</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Diesel C</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Regular C</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Super C</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Ion Diesel</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Master</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap', fontWeight: 'bold' }}>{row.empresa || '-'}</td>
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
            </div>
        </div>
    );
}
