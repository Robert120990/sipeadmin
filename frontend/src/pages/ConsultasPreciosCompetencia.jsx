import React, { useState, useEffect } from 'react';
import { FileText, Download, Printer, Search, ArrowLeft, Fuel, Calendar, Clock, MapPin, Upload, X, CheckCircle, Filter, FileSpreadsheet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';

const ConsultasPreciosCompetencia = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [showUploadModal, setShowUploadModal] = useState(false);
    const [csvData, setCsvData] = useState([]);
    const [csvFileName, setCsvFileName] = useState('');
    const [validado, setValidado] = useState(false);
    const [filtrado, setFiltrado] = useState(false);
    const [uploading, setUploading] = useState(false);

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

    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        return lines.map(line => {
            const cols = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    inQuotes = !inQuotes;
                } else if (ch === ',' && !inQuotes) {
                    cols.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
            cols.push(current.trim());
            return cols;
        });
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setCsvFileName(file.name);
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            const rows = parseCSV(text);
            setCsvData(rows);
            setValidado(false);
            setFiltrado(false);
        };
        reader.readAsText(file);
    };

    const handleValidar = () => {
        if (csvData.length === 0) return addToast('No hay datos para validar', 'error');
        let rows = [...csvData];
        rows = rows.filter((row, idx) => {
            if (idx === 0) return false;
            if (!row[3] || row[3].trim() === '') return false;
            return true;
        });
        rows = rows.map(row => {
            const filtered = [];
            for (let i = 0; i < row.length; i++) {
                if (i === 0 || i === 1 || i === 6 || i === 11) continue;
                filtered.push(row[i]);
            }
            return filtered;
        });
        setCsvData(rows);
        setValidado(true);
        setFiltrado(false);
    };

    const handleFiltrar = async () => {
        try {
            const res = await api.get('/consultas/estaciones/precios-competencia/estaciones');
            const estaciones = res.data || [];
            const competenciaSet = new Set(estaciones.map(e => (e.competencia || '').toLowerCase().trim()));
            let rows = [...csvData];
            rows = rows.filter(row => {
                const estacion = ((row[0] || '') + '').replace(/'/g, '').toLowerCase().trim();
                return competenciaSet.has(estacion);
            });
            rows = rows.map(row => row.map((val, idx) => {
                if (idx === 0 || idx === 1) return val || '';
                const v = (val != null ? String(val) : '');
                if (v.trim() === '') return '0';
                return v;
            }));
            setCsvData(rows);
            setFiltrado(true);
        } catch (e) {
            console.error(e);
            addToast('Error al filtrar: ' + (e.response?.data?.message || e.message), 'error');
        }
    };

    const handleActualizar = async () => {
        if (csvData.length === 0) return addToast('No hay datos para actualizar', 'error');
        setUploading(true);
        try {
            const payload = csvData.map(row => ({
                estacion: row[0] || '',
                modificacion: row[1] || '',
                super_c: row[2] || '0',
                regular_c: row[3] || '0',
                ion_c: row[4] || '0',
                diesel_c: row[5] || '0',
                super_a: row[6] || '0',
                regular_a: row[7] || '0',
                ion_a: row[8] || '0',
                diesel_a: row[9] || '0'
            }));
            await api.post('/consultas/estaciones/precios-competencia/upload', { data: payload });
            addToast('Precios actualizados exitosamente', 'success');
            setShowUploadModal(false);
            setCsvData([]);
            setCsvFileName('');
            setValidado(false);
            setFiltrado(false);
            fetchData();
        } catch (e) {
            addToast('Error al actualizar precios', 'error');
        } finally {
            setUploading(false);
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
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div>
                        <h1 style={{ color: 'var(--primary)', marginBottom: '0.25rem' }}>Precios de Competencia</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Comparativa de precios actuales por estación y zona.</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => { setCsvData([]); setCsvFileName(''); setValidado(false); setFiltrado(false); setShowUploadModal(true); }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Upload size={18} /> Cargar CSV
                    </button>
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

            <Modal open={showUploadModal} onClose={() => setShowUploadModal(false)} title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><FileSpreadsheet size={20} color="var(--primary)" />Cargar Precios de Competencia</span>} size="xl">
                {csvData.length === 0 ? (
                    <div style={{ border: '2px dashed var(--border)', borderRadius: '8px', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Upload size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <p style={{ marginBottom: '1rem' }}>Seleccione un archivo .csv con los precios de competencia</p>
                        <label className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.6rem 2rem' }}>
                            <FileSpreadsheet size={18} /> Seleccionar Archivo
                            <input type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
                        </label>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                <FileSpreadsheet size={14} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
                                {csvFileName} ({csvData.length} filas)
                            </span>
                            <div style={{ flex: 1 }} />
                            {!validado && (
                                <button onClick={handleValidar} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <CheckCircle size={16} /> Validar
                                </button>
                            )}
                            {validado && !filtrado && (
                                <button onClick={handleFiltrar} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Filter size={16} /> Filtrar
                                </button>
                            )}
                            {filtrado && (
                                <button onClick={handleActualizar} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} disabled={uploading}>
                                    <Upload size={16} /> {uploading ? 'Actualizando...' : 'Actualizar BD'}
                                </button>
                            )}
                            <button onClick={() => { setCsvData([]); setCsvFileName(''); setValidado(false); setFiltrado(false); }} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <X size={16} /> Limpiar
                            </button>
                        </div>

                        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'auto', maxHeight: '65vh' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.75rem' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '0.5rem', textAlign: 'left', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Estación</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)', width: '100px' }}>Modificación</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Super C</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Regular C</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Ion C</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Diesel C</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Super A</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Regular A</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Ion A</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right', backgroundColor: 'var(--card-bg)', position: 'sticky', top: 0, zIndex: 2, borderBottom: '2px solid var(--primary)' }}>Diesel A</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {csvData.map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.4rem 0.5rem' }}>{row[0]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem' }}>{row[1]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row[2]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row[3]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row[4]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row[5]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row[6]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row[7]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row[8]}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{row[9]}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Modal>
        </div>
    );
};

export default ConsultasPreciosCompetencia;
