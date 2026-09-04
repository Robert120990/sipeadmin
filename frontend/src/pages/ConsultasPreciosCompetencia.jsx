import React, { useState, useEffect, useMemo } from 'react';
import { Download, Printer, Search, Calendar, Clock, MapPin, Upload, X, CheckCircle, Filter, FileSpreadsheet, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
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
    const [onlyCheaper, setOnlyCheaper] = useState(false);
    const [syncingDGEHM, setSyncingDGEHM] = useState(false);
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
            addToast(error.response?.data?.message || 'Error al cargar precios de competencia', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSyncDGEHM = async () => {
        setSyncingDGEHM(true);
        try {
            const res = await api.post('/consultas/estaciones/precios-competencia/sync-dgehm');
            addToast(res.data?.message || 'Precios sincronizados con éxito desde DGEHM', 'success');
            await fetchData();
        } catch (err) {
            console.error('Error al sincronizar con DGEHM:', err);
            const msg = err.response?.data?.message || 'Error al consultar la página de DGEHM';
            addToast(msg, 'warning');
            setShowUploadModal(true);
        } finally {
            setSyncingDGEHM(false);
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

    // Helper to identify if an item represents our own station
    const isOurStation = (item) => {
        if (item.es_propia === 1 || item.es_propia === true || item.es_propia === '1') return true;
        const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
        const t = norm(item.titulo);
        const e = norm(item.estacion);
        if (t === e) return true;
        if (t.includes('COSTA DEL SOL') && e.includes('COSTA DEL SOL')) return true;
        if (t.includes('DESVIO') && e.includes('DESVIO')) return true;
        if (t.includes('SAN MARTIN') && e.includes('SAN MARTIN')) return true;
        if (t.includes('MIRAFLORES') && e.includes('MIRAFLORES')) return true;
        return false;
    };

    // Precalculate base prices of our own stations grouped by titulo
    const basePricesByTitulo = useMemo(() => {
        const map = {};
        data.forEach(item => {
            if (isOurStation(item)) {
                map[item.titulo] = {
                    super_c: Number(item.super_c) || 0,
                    regular_c: Number(item.regular_c) || 0,
                    ion_c: Number(item.ion_c) || 0,
                    diesel_c: Number(item.diesel_c) || 0,
                    super_a: Number(item.super_a) || 0,
                    regular_a: Number(item.regular_a) || 0,
                    ion_a: Number(item.ion_a) || 0,
                    diesel_a: Number(item.diesel_a) || 0,
                };
            }
        });
        return map;
    }, [data]);

    // Check if a competitor row has at least one price cheaper than our station
    const hasAnyCheaperPrice = (item) => {
        if (isOurStation(item)) return false;
        const base = basePricesByTitulo[item.titulo];
        if (!base) return false;
        const keys = ['super_c', 'regular_c', 'ion_c', 'diesel_c', 'super_a', 'regular_a', 'ion_a', 'diesel_a'];
        return keys.some(key => {
            const p = Number(item[key]) || 0;
            const b = Number(base[key]) || 0;
            return p > 0 && b > 0 && p < b;
        });
    };

    const filteredData = data.filter(item => {
        const matchesSearch = item.titulo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.estacion?.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        if (onlyCheaper) {
            return isOurStation(item) || hasAnyCheaperPrice(item);
        }
        return true;
    });

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

    const renderPriceCell = (item, key) => {
        const val = Number(item[key]) || 0;
        if (val === 0) {
            return <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>-</span>;
        }

        const isOwn = isOurStation(item);
        if (isOwn) {
            return (
                <span style={{ fontWeight: 'bold', color: 'var(--primary, #6366f1)' }}>
                    {mc(val)}
                </span>
            );
        }

        const base = basePricesByTitulo[item.titulo];
        const baseVal = Number(base?.[key]) || 0;
        const isLower = baseVal > 0 && val < baseVal;
        const diff = isLower ? (val - baseVal).toFixed(2) : null;

        if (isLower) {
            return (
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }} title={`¡Competidor más barato! Precio nuestro: ${mc(baseVal)} (Diferencia: ${diff})`}>
                    <span style={{ 
                        backgroundColor: 'rgba(239, 68, 68, 0.2)', 
                        color: '#ef4444', 
                        padding: '0.15rem 0.4rem', 
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontSize: '0.85rem'
                    }}>
                        <span>↓</span> {mc(val)}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 'bold', marginTop: '1px' }}>
                        {diff}
                    </span>
                </div>
            );
        }

        return <span>{mc(val)}</span>;
    };

    const exportToPDF = () => {
        const doc = jsPDF({ orientation: 'landscape' });
        doc.text('Consulta de Precios de Competencia', 14, 15);
        
        const tableBody = filteredData.map(item => [
            item.titulo,
            item.estacion + (isOurStation(item) ? ' (NUESTRA)' : ''),
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
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            {/* Header section */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div>
                        <h1 style={{ color: 'var(--primary)', marginBottom: '0.25rem', fontSize: '1.6rem' }}>Precios de Competencia</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Comparativa automática de precios de estaciones frente a la competencia (DGEHM).</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button 
                        onClick={handleSyncDGEHM} 
                        disabled={syncingDGEHM} 
                        className="btn-primary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#059669', borderColor: '#059669' }}
                        title="Consultar y actualizar automáticamente los precios desde el portal DGEHM"
                    >
                        <RefreshCw size={18} style={{ animation: syncingDGEHM ? 'spin 1s linear infinite' : 'none' }} /> 
                        {syncingDGEHM ? 'Consultando DGEHM...' : 'Consultar DGEHM'}
                    </button>
                    <button onClick={() => { setCsvData([]); setCsvFileName(''); setValidado(false); setFiltrado(false); setShowUploadModal(true); }} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Upload size={18} /> Cargar CSV
                    </button>
                    <button onClick={exportToExcel} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Download size={18} /> Excel
                    </button>
                    <button onClick={exportToPDF} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Printer size={18} /> PDF
                    </button>
                </div>
            </div>

            {/* Filters and search */}
            <div className="card glass" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
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
                <button 
                    onClick={() => setOnlyCheaper(!onlyCheaper)} 
                    className={onlyCheaper ? 'btn-primary' : 'btn-secondary'}
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        whiteSpace: 'nowrap',
                        backgroundColor: onlyCheaper ? '#dc2626' : undefined,
                        borderColor: onlyCheaper ? '#dc2626' : undefined
                    }}
                    title="Filtrar estaciones donde la competencia tiene precios menores a los nuestros"
                >
                    <AlertTriangle size={16} />
                    {onlyCheaper ? 'Mostrando más baratos' : 'Solo más baratos'}
                </button>
                <button onClick={fetchData} className="btn-icon" title="Refrescar datos">
                    <Clock size={20} />
                </button>
            </div>

            {/* Table section */}
            <div className="card glass table-responsive" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            {/* Grouped Headers */}
                            <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th colSpan={3} style={{ padding: '1rem', textAlign: 'left', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1rem' }}>DETALLE GENERAL</th>
                                <th colSpan={4} style={{ padding: '0.5rem', textAlign: 'center', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#22c55e', fontWeight: 'bold' }}>SERVICIO COMPLETO</th>
                                <th colSpan={4} style={{ padding: '0.5rem', textAlign: 'center', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#3b82f6', fontWeight: 'bold' }}>AUTO SERVICIO</th>
                            </tr>
                            {/* Main Headers */}
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                <th style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Estación/Zona</th>
                                <th style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Competencia</th>
                                <th style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', width: '170px' }}>Modificación</th>
                                
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
                                filteredData.map((item, idx) => {
                                    const own = isOurStation(item);
                                    const hasCheaper = hasAnyCheaperPrice(item);
                                    return (
                                        <tr 
                                            key={idx} 
                                            className="table-row-hover" 
                                            style={{ 
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                backgroundColor: own ? 'rgba(99, 102, 241, 0.08)' : undefined
                                            }}
                                        >
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.titulo}</div>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <MapPin size={14} color="var(--text-muted)" />
                                                    <span style={{ fontWeight: own ? 'bold' : 'normal' }}>{item.estacion}</span>
                                                    {own && (
                                                        <span style={{ 
                                                            backgroundColor: 'rgba(99, 102, 241, 0.2)', 
                                                            color: 'var(--primary)', 
                                                            border: '1px solid var(--primary)', 
                                                            borderRadius: '4px', 
                                                            padding: '0.1rem 0.4rem', 
                                                            fontSize: '0.68rem', 
                                                            fontWeight: 'bold',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.25rem'
                                                        }}>
                                                            <ShieldCheck size={12} /> NUESTRA ESTACIÓN
                                                        </span>
                                                    )}
                                                    {!own && hasCheaper && (
                                                        <span style={{ 
                                                            color: '#ef4444', 
                                                            fontSize: '0.68rem', 
                                                            fontWeight: 'bold',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '2px',
                                                            backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                                            padding: '0.1rem 0.35rem',
                                                            borderRadius: '4px'
                                                        }}>
                                                            <AlertTriangle size={11} /> Precios menores
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Calendar size={14} /> {item.modificacion}
                                                </div>
                                            </td>
                                            
                                            {/* SC Values */}
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', backgroundColor: 'rgba(34, 197, 94, 0.02)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
                                                {renderPriceCell(item, 'super_c')}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                                {renderPriceCell(item, 'regular_c')}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                                {renderPriceCell(item, 'ion_c')}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', backgroundColor: 'rgba(34, 197, 94, 0.02)' }}>
                                                {renderPriceCell(item, 'diesel_c')}
                                            </td>

                                            {/* AS Values */}
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', backgroundColor: 'rgba(59, 130, 246, 0.02)', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                                {renderPriceCell(item, 'super_a')}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                                {renderPriceCell(item, 'regular_a')}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                                {renderPriceCell(item, 'ion_a')}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', backgroundColor: 'rgba(59, 130, 246, 0.02)' }}>
                                                {renderPriceCell(item, 'diesel_a')}
                                            </td>
                                        </tr>
                                    );
                                })
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
                    <div style={{ border: '2px dashed var(--border)', borderRadius: '8px', padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Upload size={44} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                        <p style={{ marginBottom: '1.25rem', fontSize: '0.95rem' }}>Seleccione el archivo .csv descargado del portal oficial DGEHM</p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                            <label className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.6rem 1.5rem' }}>
                                <FileSpreadsheet size={18} /> Seleccionar Archivo
                                <input type="file" accept=".csv" onChange={handleFileSelect} style={{ display: 'none' }} />
                            </label>
                            <a 
                                href="https://sinapp.dgehm.gob.sv/DRHM/estadisticas.aspx?uid=2" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem', textDecoration: 'none' }}
                            >
                                Abrir Portal DGEHM Oficial ↗
                            </a>
                        </div>
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
