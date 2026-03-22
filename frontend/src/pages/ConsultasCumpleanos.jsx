import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { FileSpreadsheet, FileText, Cake, Building2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ConsultasCumpleanos() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
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
        XLSX.writeFile(workbook, `Cumpleañeros_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    const exportToPDF = () => {
        if (data.length === 0) return;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text("Cumpleañeros del Mes", 14, 15);
        doc.setFontSize(10);
        doc.text("Listado de empleados activos que cumplen años el mes actual.", 14, 22);

        const tableColumn = ["Nombre", "Departamento", "Cumpleaños", "Empresa"];
        const tableRows = data.map(item => [
            item.nombre,
            item.departamento || 'N/A',
            new Date(item.fecha_nacimiento).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }),
            item.empresa
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            headStyles: { fillColor: [16, 185, 129] } // Success color
        });

        doc.save(`Cumpleaños_${new Date().toISOString().split('T')[0]}.pdf`);
        addToast('Documento PDF descargado', 'success');
    };

    // Grouping logic
    const groupedData = data.reduce((acc, curr) => {
        if (!acc[curr.empresa]) acc[curr.empresa] = [];
        acc[curr.empresa].push(curr);
        return acc;
    }, {});

    if (loading) return <div className="p-8 text-center text-muted animate-pulse">Cargando cumpleañeros...</div>;

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="icon-container" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '1rem', borderRadius: '1rem' }}>
                        <Cake size={32} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0 }}>Cumpleañeros del Mes</h1>
                        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Basado en la conexión externa de contabilidad.</p>
                    </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={exportToExcel} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <FileSpreadsheet size={18} /> Excel
                    </button>
                    <button onClick={exportToPDF} disabled={data.length === 0} className="btn-secondary" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <FileText size={18} /> PDF
                    </button>
                </div>
            </div>

            {data.length > 0 ? (
                Object.keys(groupedData).map(empresa => (
                    <div key={empresa} style={{ marginBottom: '2.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', paddingLeft: '0.5rem' }}>
                            <Building2 size={20} color="#10b981" />
                            <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--primary)' }}>{empresa}</h2>
                            <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', marginLeft: '0.5rem' }}>
                                {groupedData[empresa].length} {groupedData[empresa].length === 1 ? 'cumpleañero' : 'cumpleañeros'}
                            </span>
                        </div>
                        
                        <div className="card glass overflow-hidden">
                            <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ padding: '1rem' }}>Nombre</th>
                                        <th style={{ padding: '1rem' }}>Departamento</th>
                                        <th style={{ padding: '1rem' }}>Día</th>
                                        <th style={{ padding: '1rem' }}>Fecha Completa</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {groupedData[empresa].map((emp, idx) => {
                                        const birthDate = new Date(emp.fecha_nacimiento);
                                        const isToday = birthDate.getDate() === new Date().getDate();
                                        
                                        return (
                                            <tr key={idx} style={{ 
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                backgroundColor: isToday ? 'rgba(16, 185, 129, 0.05)' : 'transparent'
                                            }}>
                                                <td style={{ padding: '1rem', fontWeight: '500' }}>
                                                    {emp.nombre}
                                                    {isToday && <span style={{ marginLeft: '0.5rem', fontSize: '1.25rem' }}>🎂</span>}
                                                </td>
                                                <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                    {emp.departamento || 'Sin asignar'}
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <span style={{ 
                                                        display: 'inline-block',
                                                        padding: '0.25rem 0.75rem',
                                                        borderRadius: '0.5rem',
                                                        backgroundColor: 'rgba(255,255,255,0.05)',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {birthDate.getDate()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                                                    {birthDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
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
                <div className="card glass text-center p-12">
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                        No se encontraron cumpleañeros para este mes en el sistema de contabilidad.
                    </p>
                </div>
            )}
        </div>
    );
}
