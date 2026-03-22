import React, { useState, useEffect } from 'react';
import { Calendar, Search, FileSpreadsheet, FileText, ClipboardList } from 'lucide-react';
import { useToast } from '../components/Toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';

export default function ResumenPista() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = yesterday.toISOString().split('T')[0];

    const [fecha, setFecha] = useState(defaultDate);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const { addToast } = useToast();

    const fetchData = async (isManual = false) => {
        setLoading(true);
        try {
            const res = await api.get(`/ventas/resumen-cierre/${fecha}`);
            if (Array.isArray(res.data)) {
                setData(res.data);
                if (isManual) {
                    if (res.data.length > 0) {
                        addToast('Datos cargados exitosamente', 'success');
                    } else {
                        addToast('No se encontraron registros para esta fecha', 'info');
                    }
                }
            } else {
                setData([]);
                addToast('El servicio remoto no devolvió datos válidos', 'error');
            }
            setLoading(false);
        } catch (error) {
            addToast('Error al cargar datos del resumen', 'error');
            setData([]);
            setLoading(false);
        }
    };

    // Load once on mount
    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const exportToExcel = () => {
        if (data.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen_Pista");
        XLSX.writeFile(workbook, `Resumen_Pista_${fecha}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    const exportToPDF = () => {
        if (data.length === 0) return;
        const doc = new jsPDF('landscape');
        
        doc.setFontSize(16);
        doc.text('Resumen de Pista - Consolidado de cortes', 14, 15);
        doc.setFontSize(10);
        doc.text(`Fecha: ${fecha}`, 14, 22);

        const tableColumn = ["Sucursal", "Creditos", "Cupones", "Tarjetas", "Remesas", "Gastos", "Lubrica.", "Anticip.", "Pagos", "Descu.", "Suma", "Tot.Venta", "Dif."];
        const tableRows = data.map(row => [
            row.empresa || row.sucursales || row.sucursal || '-', 
            moneyFmt(row.credito || row.creditos_ || row.creditos || 0), 
            moneyFmt(row.cupones || 0), 
            moneyFmt(row.tarjetas || 0), 
            moneyFmt(row.remesas || 0), 
            moneyFmt(row.gastos || 0), 
            moneyFmt(row.lubricantes || 0), 
            moneyFmt(row.anticipos || 0), 
            moneyFmt(row.pagos || row.cheques || 0), 
            moneyFmt(row.descuentos || 0), 
            moneyFmt(row.suma || 0), 
            moneyFmt(row.tot_venta || 0), 
            moneyFmt(row.diferencia || 0)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] }
        });

        doc.save(`Resumen_Pista_${fecha}.pdf`);
        addToast('Documento PDF descargado', 'success');
    };

    const RowCell = ({ val }) => (
        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
            {moneyFmt(val)}
        </td>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', zoom: 0.90 }}>
            {/* Headers and Export */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <ClipboardList size={28} color="var(--primary)" /> 
                        Resumen de Pista
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>Consolidado de resumen de cortes por fecha.</p>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={exportToExcel} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <FileSpreadsheet size={18} /> Excel
                    </button>
                    <button onClick={exportToPDF} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <FileText size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* Control Bar */}
            <div className="card glass" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Fecha</label>
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

                <button className="btn-primary" onClick={() => fetchData(true)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.5rem', marginTop: '1.25rem' }}>
                    <Search size={16} /> {loading ? 'Cargando...' : 'Realizar consulta'}
                </button>
            </div>

            {/* Table */}
            <div className="card glass" style={{ padding: '0' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '1rem 0.5rem' }}>Sucursal</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Creditos</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Cupones</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Tarjetas</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Remesas</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Gastos</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Lubrica.</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Anticip.</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Pagos</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Descu.</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Suma</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Tot.Venta</th>
                                <th style={{ textAlign: 'right', padding: '1rem 0.5rem' }}>Dif.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap' }}>{row.empresa || row.sucursales || row.sucursal || '-'}</td>
                                    <RowCell val={row.credito || row.creditos_ || row.creditos || 0} />
                                    <RowCell val={row.cupones || 0} />
                                    <RowCell val={row.tarjetas || 0} />
                                    <RowCell val={row.remesas || 0} />
                                    <RowCell val={row.gastos || 0} />
                                    <RowCell val={row.lubricantes || 0} />
                                    <RowCell val={row.anticipos || 0} />
                                    <RowCell val={row.pagos || row.cheques || 0} />
                                    <RowCell val={row.descuentos || 0} />
                                    <RowCell val={row.suma || 0} />
                                    <RowCell val={row.tot_venta || 0} />
                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', color: (row.diferencia || 0) < 0 ? '#ef4444' : ((row.diferencia || 0) > 0 ? '#22c55e' : 'inherit'), fontWeight: (row.diferencia || 0) !== 0 ? 'bold' : 'normal' }}>
                                        {moneyFmt(row.diferencia || 0)}
                                    </td>
                                </tr>
                            ))}
                            {data.length === 0 && !loading && (
                                <tr><td colSpan="13" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Realiza una consulta para ver los datos</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
