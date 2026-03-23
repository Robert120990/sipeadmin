import React, { useState, useEffect } from 'react';
import { FileText, Download, Printer, Search, ArrowLeft, Fuel, Calendar, Clock, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useToast } from '../components/Toast';

const ConsultasPreciosCompetencia = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();
    const { addToast } = useToast();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await api.get('/consultas/estaciones/precios-competencia');
            setData(res.data || []);
        } catch (error) {
            console.error('Error fetching prices:', error);
            addToast('Error al cargar precios de competencia', 'error');
        } finally {
            setLoading(false);
        }
    };

    const mc = (val) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(val || 0);
    };

    const filteredData = data.filter(item => 
        item.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.estacion?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();
        const exportData = filteredData.map(item => ({
            'Estación': item.titulo,
            'Competencia': item.estacion,
            'Modificación': item.modificacion,
            'Super (C)': item.super_c,
            'Regular (C)': item.regular_c,
            'Ion (C)': item.ion_c,
            'Diesel (C)': item.diesel_c,
            'Super (A)': item.super_a,
            'Regular (A)': item.regular_a,
            'Ion (A)': item.ion_a,
            'Diesel (A)': item.diesel_a
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(wb, ws, 'Precios Competencia');
        XLSX.writeFile(wb, 'precios_competencia.xlsx');
    };

    const exportToPDF = () => {
        const doc = jsPDF({ orientation: 'landscape' });
        doc.text('Consulta de Precios de Competencia', 14, 15);
        
        const tableBody = filteredData.map(item => [
            item.titulo,
            item.estacion,
            item.modificacion,
            mc(item.super_c),
            mc(item.regular_c),
            mc(item.ion_c),
            mc(item.diesel_c),
            mc(item.super_a),
            mc(item.regular_a),
            mc(item.ion_a),
            mc(item.diesel_a)
        ]);

        doc.autoTable({
            startY: 20,
            head: [['Estación', 'Competencia', 'Modificación', 'Super C', 'Reg C', 'Ion C', 'Dies C', 'Super A', 'Reg A', 'Ion A', 'Dies A']],
            body: tableBody,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [79, 70, 229] }
        });

        doc.save('precios_competencia.pdf');
    };

    return (
        <div style={{ padding: '2rem', animation: 'fadeIn 0.5s ease-out' }}>
            {/* Header section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div>
                        <h1 style={{ color: 'var(--primary)', marginBottom: '0.25rem' }}>Precios de Competencia</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Comparativa de precios actuales por estación y zona.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={exportToExcel} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Download size={18} /> Excel
                    </button>
                    <button onClick={exportToPDF} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Printer size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* Filters and search */}
            <div className="card glass" style={{ padding: '1.25rem', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar por estación o competencia..." 
                        className="input-search"
                        style={{ paddingLeft: '3rem', width: '100%' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button onClick={fetchData} className="btn-icon">
                    <Clock size={20} />
                </button>
            </div>

            {/* Table section */}
            <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            {/* Grouped Headers */}
                            <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th colSpan={3} style={{ padding: '1rem', textAlign: 'left', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1rem' }}>DETALLE GENERAL</th>
                                <th colSpan={4} style={{ padding: '0.5rem', textAlign: 'center', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#22c55e', fontWeight: 'bold' }}>SERVICIO COMPLETO</th>
                                <th colSpan={4} style={{ padding: '0.5rem', textAlign: 'center', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#3b82f6', fontWeight: 'bold' }}>AUTO SERVICIO</th>
                            </tr>
                            {/* Main Headers */}
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Estación/Zona</th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Competencia</th>
                                <th style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', width: '180px' }}>Modificación</th>
                                
                                {/* Servicio Completo Headers */}
                                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>Super</th>
                                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Regular</th>
                                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Ion Dies</th>
                                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Diesel</th>

                                {/* Auto Servicio Headers */}
                                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>Super</th>
                                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Regular</th>
                                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Ion Dies</th>
                                <th style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Diesel</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={11} style={{ padding: '4rem', textAlign: 'center' }}>
                                        <div className="spinner" style={{ margin: '0 auto' }}></div>
                                        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Cargando inteligencia de competencia...</p>
                                    </td>
                                </tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((item, idx) => (
                                    <tr key={idx} className="table-row-hover" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.titulo}</div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <MapPin size={14} color="var(--text-muted)" />
                                                {item.estacion}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Calendar size={14} /> {item.modificacion}
                                            </div>
                                        </td>
                                        
                                        {/* SC Values */}
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', backgroundColor: 'rgba(34, 197, 94, 0.02)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                                            {mc(item.super_c)}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                            {mc(item.regular_c)}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                            {mc(item.ion_c)}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                            {mc(item.diesel_c)}
                                        </td>

                                        {/* AS Values */}
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', backgroundColor: 'rgba(59, 130, 246, 0.02)', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                            {mc(item.super_a)}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                            {mc(item.regular_a)}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                            {mc(item.ion_a)}
                                        </td>
                                        <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                            {mc(item.diesel_a)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={11} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        <Search size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                        <p>No se encontraron registros de competencia.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ConsultasPreciosCompetencia;
