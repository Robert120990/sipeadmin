import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Plus, CheckCircle, Edit, Trash2, X, Save, Download, FileText as FileTextIcon, Sparkles, Send, MessageSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';

export default function ControlRecordatorios() {
    const { addToast } = useToast();
    const [recordatorios, setRecordatorios] = useState([]);
    const [ubicaciones, setUbicaciones] = useState([]);

    // Debounce Hook to fix typing lag natively
    const useDebounce = (value, delay) => {
        const [debouncedValue, setDebouncedValue] = useState(value);
        useEffect(() => {
            const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
            return () => clearTimeout(handler);
        }, [value, delay]);
        return debouncedValue;
    };
    
    // Filters
    const getFirstDayOfMonth = () => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().split('T')[0];
    };
    const firstDayStr = getFirstDayOfMonth();
    const todayStr = new Date().toISOString().split('T')[0];
    const [fechaDesde, setFechaDesde] = useState(firstDayStr);
    const [fechaHasta, setFechaHasta] = useState(todayStr);
    const [estadoFilter, setEstadoFilter] = useState('ALL'); // P, C, ALL
    
    // UI State
    const [loading, setLoading] = useState(false);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [parentsList, setParentsList] = useState([]);
    
    // Search Filters State
    const [searchFilters, setSearchFilters] = useState({
        descripcion: '', fecha_inicio: '', ubicacion: '', monto: '', observacion: '', cuotas: '', activo: '', repetir_desc: ''
    });
    const debouncedFilters = useDebounce(searchFilters, 350);
    const [selectedParent, setSelectedParent] = useState(null); // { id, descripcion }
    
    // Form State (Parent Recordatorio)
    const [formData, setFormData] = useState({
        id: '', descripcion: '', id_ubicacion: '', iniciar: todayStr, 
        activo: true, monto: 0.0, repetir: 1, repetir_desc: 'VEZ', 
        forma_pago: '', pagado: false, fecPago: todayStr, formaPago2: ''
    });

    const [pagoData, setPagoData] = useState({ id_vencimiento: '', fecPago: todayStr, formaPago: '' });

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState([
        { role: 'ai', text: '¡Hola! Soy tu asistente IA de Pagos. Dime qué necesitas buscar o pagar y yo lo haré por ti.' }
    ]);
    const [chatLoading, setChatLoading] = useState(false);
    const [iaFilterText, setIaFilterText] = useState(null);

    useEffect(() => {
        fetchUbicaciones();
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estadoFilter]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = { estado: estadoFilter };
            if (selectedParent) {
                params.id_recordatorio = selectedParent.id;
            } else {
                params.desde = fechaDesde;
                params.hasta = fechaHasta;
            }
            const res = await api.get('/operaciones/recordatorios', { params });
            setRecordatorios(res.data);
        } catch (error) {
            addToast('Error al cargar datos', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchUbicaciones = async () => {
        try {
            const res = await api.get('/operaciones/recordatorios/ubicaciones');
            setUbicaciones(res.data);
        } catch (error) { console.error('Error', error); }
    };

    const displayRecordatorios = useMemo(() => {
        if (!iaFilterText) return recordatorios;
        const term = iaFilterText.toLowerCase();
        return recordatorios.filter(r => 
            (r.ubicacion || '').toLowerCase().includes(term) ||
            (r.descripcion || '').toLowerCase().includes(term) ||
            (r.observacion || '').toLowerCase().includes(term) ||
            (r.vence && formatDate(r.vence).includes(term)) ||
            (r.vence || '').includes(term)
        );
    }, [recordatorios, iaFilterText]);

    const totalMonto = useMemo(() => {
        return displayRecordatorios.reduce((sum, item) => {
            if (item.estado === 'PENDIENTE') return sum + Number(item.monto || 0);
            return sum;
        }, 0);
    }, [displayRecordatorios]);

    // AI Handle Submit
    const handleChatSubmit = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const userPrompt = chatInput.trim();
        setChatInput('');
        setChatHistory(prev => [...prev, { role: 'user', text: userPrompt }]);
        setChatLoading(true);

        try {
            const res = await api.post('/ai/pagos/chat', {
                prompt: userPrompt,
                context: displayRecordatorios
            });
            
            const iaResponse = res.data;
            if (iaResponse.error) throw new Error(iaResponse.error);
            
            setChatHistory(prev => [...prev, { role: 'ai', text: iaResponse.reply }]);

            if (iaResponse.action === 'FILTER') {
                const p = iaResponse.action_params || {};
                if (p.estado && ['P', 'C', 'ALL'].includes(p.estado) && p.estado !== estadoFilter) {
                    setEstadoFilter(p.estado);
                }
                const term = p.ubicacion || p.descripcion || '';
                setIaFilterText(term || null);
                if (term || p.estado !== 'ALL') addToast('Orden de IA aplicada: Filtrando vista.', 'success');
            } else if (iaResponse.action === 'PAY') {
                const id = iaResponse.action_params?.id_recordatorio;
                const rec = displayRecordatorios.find(r => String(r.id) === String(id) || String(r.id_recordatorio) === String(id));
                if (rec) {
                    setPagoData({ id_vencimiento: rec.id, fecPago: todayStr, formaPago: 'Aprobado vía IA Asistente' });
                    setIsPagoModalOpen(true);
                } else {
                    setChatHistory(prev => [...prev, { role: 'ai', text: 'No logré localizar ese ID en la tabla mostrada.' }]);
                }
            }
        } catch (err) {
            setChatHistory(prev => [...prev, { role: 'ai', text: 'Ups, ' + (err.response?.data?.error || err.message || 'ocurrió un error de conexión.') }]);
        } finally {
            setChatLoading(false);
        }
    };

    // Format Currency & Dates
    const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const mc = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.post('/operaciones/recordatorios', formData);
            addToast('Recordatorio Guardado', 'success');
            setIsFormModalOpen(false);
            fetchData();
        } catch (error) {
            addToast('Error al guardar recordatorio', 'error');
        }
    };

    const loadForEdit = async (vencimientoRec) => {
        if (vencimientoRec.estado === 'CANCELADO') {
            addToast('Recordatorio Finalizado. No Puede Editar.', 'error');
            return;
        }
        try {
            const res = await api.get(`/operaciones/recordatorios/${vencimientoRec.id_recordatorio}`);
            if (res.data.pagados > 0) {
                if(!window.confirm("Este Recordatorio ya posee pagos.\nSi Decide editar perderá todos los pagos. ¿Desea continuar?")) return;
            }
            
            const p = res.data.recordatorio;
            setFormData({
                id: p.id,
                descripcion: p.descripcion,
                id_ubicacion: p.id_ubicacion,
                iniciar: String(p.iniciar).substring(0, 10),
                activo: Boolean(p.activo),
                monto: p.monto,
                repetir: p.repetir,
                repetir_desc: p.repetir_desc,
                forma_pago: p.forma_pago || '',
                pagado: false,
                fecPago: todayStr,
                formaPago2: ''
            });
            setIsFormModalOpen(true);
        } catch (error) {
            addToast('Error al cargar detalle', 'error');
        }
    };

    const handleSelectParent = (parent) => {
        setSelectedParent({ id: parent.id, descripcion: parent.descripcion });
        setIsSearchModalOpen(false);
        // We'll call fetchData via useEffect if we want, or manually
    };

    const clearParentFilter = () => {
        setSelectedParent(null);
    };

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedParent, fechaDesde, fechaHasta, estadoFilter]);

    const openSearchModal = async () => {
        setLoading(true);
        try {
            const res = await api.get('/operaciones/recordatorios/parents/buscar');
            setParentsList(res.data);
            setIsSearchModalOpen(true);
        } catch (error) {
            addToast('Error cargando búsquedas', 'error');
        } finally {
            setLoading(false);
        }
    };

    const filteredParents = useMemo(() => {
        if (!parentsList.length) return [];
        const result = parentsList.filter(p => {
            const descMatch = (p.descripcion || '').toLowerCase().includes(debouncedFilters.descripcion.toLowerCase());
            const dateMatch = (formatDate(p.fecha_inicio) || '').includes(debouncedFilters.fecha_inicio);
            const ubicMatch = (p.ubicacion || '').toLowerCase().includes(debouncedFilters.ubicacion.toLowerCase());
            const montoMatch = String(p.monto || '').includes(debouncedFilters.monto);
            const obsMatch = (p.observacion || '').toLowerCase().includes(debouncedFilters.observacion.toLowerCase());
            const cuotasMatch = String(p.cuotas || '').includes(debouncedFilters.cuotas);
            const repDescMatch = (p.repetir_desc || '').toLowerCase().includes(debouncedFilters.repetir_desc.toLowerCase());
            const activoMatch = (p.activo || '').toLowerCase().includes(debouncedFilters.activo.toLowerCase());
            
            return descMatch && dateMatch && ubicMatch && montoMatch && obsMatch && cuotasMatch && repDescMatch && activoMatch;
        });
        // Limit to 100 for performance during search
        return result.slice(0, 100);
    }, [parentsList, debouncedFilters]);

    const handleDelete = async (rec) => {
        if (rec.estado === 'CANCELADO') {
            addToast('Recordatorio Finalizado. No Puede Eliminar.', 'error');
            return;
        }
        if (!window.confirm("¿Eliminar Recordatorio?")) return;
        try {
            await api.delete(`/operaciones/recordatorios/vencimiento/${rec.id}`);
            addToast('Eliminado', 'success');
            fetchData();
        } catch (error) {
            addToast('Error eliminando', 'error');
        }
    };

    const handlePagoSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/operaciones/recordatorios/pagar/${pagoData.id_vencimiento}`, {
                fecha_cancelacion: pagoData.fecPago,
                forma_pago: pagoData.formaPago
            });
            addToast('Pago Realizado!', 'success');
            setIsPagoModalOpen(false);
            fetchData();
        } catch (error) {
            addToast('Error al pagar', 'error');
        }
    };

    const exportToExcel = () => {
        const wsData = recordatorios.map(r => ({
            "Ubicación": r.ubicacion,
            "Descripción": r.descripcion,
            "Vence": formatDate(r.vence),
            "Observación": r.observacion,
            "Forma Pago": r.forma_pago,
            "Monto": Number(r.monto),
            "Estado": r.estado,
            "Fec Pago": formatDate(r.fecha_cancelacion)
        }));
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Recordatorios");
        XLSX.writeFile(wb, "Control_de_Pagos.xlsx");
        addToast('Excel Exportado', 'success');
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text("Control de Pagos (Recordatorios)", 14, 15);
        autoTable(doc, {
            startY: 20,
            head: [['Ubicación', 'Descripción', 'Vence', 'Obs', 'Método', 'Monto', 'Estado', 'Pág']],
            body: recordatorios.map(r => [
                r.ubicacion, r.descripcion, formatDate(r.vence), r.observacion,
                r.forma_pago, mc(r.monto), r.estado, formatDate(r.fecha_cancelacion)
            ]),
            styles: { fontSize: 8 }
        });
        doc.save("Control_de_Pagos.pdf");
        addToast('PDF Exportado', 'success');
    };

    return (
        <div style={{ padding: '2rem', height: '100%', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ margin: 0, color: 'var(--primary)' }}>Control de Recordatorios</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={openSearchModal}>
                        <Search size={18} /> Buscar
                    </button>
                    <button className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => {
                        setFormData({ id: '', descripcion: '', id_ubicacion: '', iniciar: todayStr, activo: true, monto: 0.0, repetir: 1, repetir_desc: 'VEZ', forma_pago: '', pagado: false, fecPago: todayStr, formaPago2: '' });
                        setIsFormModalOpen(true);
                    }}>
                        <Plus size={18} /> Nuevo Recordatorio
                    </button>
                </div>
            </div>
            
            <div className="card glass" style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: selectedParent ? 0.5 : 1 }}>
                    <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>VENCEN DESDE</label>
                    <input type="date" className="form-control" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} disabled={!!selectedParent} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: selectedParent ? 0.5 : 1 }}>
                    <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>VENCEN HASTA</label>
                    <input type="date" className="form-control" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} disabled={!!selectedParent} />
                </div>
                
                {selectedParent && (
                    <div style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.75rem', 
                        backgroundColor: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--primary)', 
                        padding: '0.5rem 1rem', borderRadius: '12px', height: '42px' 
                    }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                            FILTRADO POR: <span style={{ color: 'white' }}>{selectedParent.descripcion} (ID: {selectedParent.id})</span>
                        </div>
                        <button onClick={clearParentFilter} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 0 }}>
                            <X size={16} />
                        </button>
                    </div>
                )}
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button onClick={fetchData} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.5rem' }}>
                        <Search size={18} /> CONSULTAR
                    </button>
                    <button onClick={exportToExcel} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem' }}>
                        <Download size={18} /> EXCEL
                    </button>
                    <button onClick={exportToPDF} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem' }}>
                        <FileTextIcon size={18} /> PDF
                    </button>
                </div>

                <div style={{ marginLeft: '1rem', display: 'flex', gap: '0.5rem', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '1.5rem', alignItems: 'center' }}>
                    <button 
                        onClick={() => setEstadoFilter('P')}
                        style={{ 
                            padding: '0.5rem 1.25rem', borderRadius: '24px', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.3s ease',
                            backgroundColor: estadoFilter === 'P' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            color: estadoFilter === 'P' ? '#fff' : 'var(--text-muted)',
                            boxShadow: estadoFilter === 'P' ? '0 4px 12px rgba(99, 102, 241, 0.4)' : 'none'
                        }}
                    >
                        Pendientes
                    </button>
                    <button 
                        onClick={() => setEstadoFilter('C')}
                        style={{ 
                            padding: '0.5rem 1.25rem', borderRadius: '24px', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.3s ease',
                            backgroundColor: estadoFilter === 'C' ? '#10b981' : 'rgba(255,255,255,0.05)',
                            color: estadoFilter === 'C' ? '#fff' : 'var(--text-muted)',
                            boxShadow: estadoFilter === 'C' ? '0 4px 12px rgba(16, 185, 129, 0.4)' : 'none'
                        }}
                    >
                        Finalizados
                    </button>
                    <button 
                        onClick={() => setEstadoFilter('ALL')}
                        style={{ 
                            padding: '0.5rem 1.25rem', borderRadius: '24px', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'all 0.3s ease',
                            backgroundColor: estadoFilter === 'ALL' ? '#6b7280' : 'rgba(255,255,255,0.05)',
                            color: estadoFilter === 'ALL' ? '#fff' : 'var(--text-muted)',
                            boxShadow: estadoFilter === 'ALL' ? '0 4px 12px rgba(107, 114, 128, 0.4)' : 'none'
                        }}
                    >
                        Todos
                    </button>
                </div>

            </div>

            <div className={`card glass ${loading ? 'fade-loading' : ''}`} style={{ 
                marginBottom: '1.5rem', 
                flex: 1, 
                overflowY: 'auto', 
                maxHeight: '600px', 
                padding: '0',
                backgroundColor: 'rgba(20, 25, 30, 0.4)'
            }}>
                {loading && (
                    <div className="loading-overlay">
                        <div className="spinner"></div>
                        <p style={{ marginTop: '1rem', color: 'var(--primary)', fontWeight: 'bold' }}>Sincronizando Módulos...</p>
                    </div>
                )}
                <table className="data-table" style={{ fontSize: '0.75rem', width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#1E232A' }}>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '0.75rem 0.5rem', width: '100px' }}>ID PRINCIPAL</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>UBICACION</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>DESCRIPCION</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>VENCE</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>OBSERVACION</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>FORMA PAGO</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>MONTO</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>ESTADO</th>
                            <th style={{ padding: '0.75rem 0.5rem' }}>FEC. PAGO</th>
                            <th style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>ACCIONES</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayRecordatorios.length === 0 ? (
                            <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem' }}>No hay registros coincidentes</td></tr>
                        ) : displayRecordatorios.map((r, idx) => (
                            <tr key={idx} style={{ 
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                backgroundColor: r.estado === 'CANCELADO' ? 'rgba(40, 167, 69, 0.05)' : 'transparent' 
                            }}>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{r.id_recordatorio}</td>
                                <td style={{ padding: '0.5rem' }}>{r.ubicacion}</td>
                                <td style={{ padding: '0.5rem' }}>{r.descripcion}</td>
                                <td style={{ padding: '0.5rem', color: 'var(--warning)', fontWeight: 'bold' }}>{formatDate(r.vence)}</td>
                                <td style={{ padding: '0.5rem' }}>{r.observacion}</td>
                                <td style={{ padding: '0.5rem' }}>{r.forma_pago}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{mc(r.monto)}</td>
                                <td style={{ padding: '0.5rem' }}>
                                    <span style={{ 
                                        padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold',
                                        backgroundColor: r.estado === 'CANCELADO' ? 'rgba(40,167,69,0.2)' : 'rgba(255,193,7,0.2)',
                                        color: r.estado === 'CANCELADO' ? '#28a745' : '#ffc107'
                                    }}>
                                        {r.estado}
                                    </span>
                                </td>
                                <td style={{ padding: '0.5rem' }}>{formatDate(r.fecha_cancelacion)}</td>
                                <td style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center', padding: '0.5rem' }}>
                                    <button className="btn-primary" style={{ padding: '0.3rem' }} title="Marcar como Pagado" disabled={r.estado === 'CANCELADO'} onClick={() => {
                                        setPagoData({ id_vencimiento: r.id, fecPago: todayStr, formaPago: '' });
                                        setIsPagoModalOpen(true);
                                    }}>
                                        <CheckCircle size={14} />
                                    </button>
                                    <button className="btn-success" style={{ padding: '0.3rem', backgroundColor: r.estado === 'CANCELADO' ? 'gray' : '#17a2b8' }} title="Editar" onClick={() => loadForEdit(r)}>
                                        <Edit size={14} />
                                    </button>
                                    <button className="btn-danger" style={{ padding: '0.3rem' }} title="Eliminar" disabled={r.estado === 'CANCELADO'} onClick={() => handleDelete(r)}>
                                        <Trash2 size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', padding: '1rem', backgroundColor: 'rgba(25, 30, 36, 0.6)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>MONTO TOTAL (Pendiente):</span>
                <span style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--danger)' }}>{mc(totalMonto)}</span>
            </div>

            {/* AGENTE IA FLOATING BUTTON & CHAT */}
            <button 
                onClick={() => setIsChatOpen(!isChatOpen)}
                style={{
                    position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 1050,
                    backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '50%',
                    width: '60px', height: '60px', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    boxShadow: '0 4px 15px rgba(99, 102, 241, 0.5)', cursor: 'pointer', transition: 'transform 0.3s'
                }}
            >
                {isChatOpen ? <X size={28} /> : <Sparkles size={28} />}
            </button>

            {isChatOpen && (
                <div className="card glass" style={{
                    position: 'fixed', bottom: '6.5rem', right: '2rem', zIndex: 1050,
                    width: '380px', height: '500px', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)', overflow: 'hidden'
                }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.5rem', background: 'var(--primary)', borderRadius: '50%', display: 'flex' }}>
                            <Sparkles size={18} color="white" />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>Agente Inteligente SIPE</h3>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {chatHistory.map((m, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={{
                                    maxWidth: '85%', padding: '0.75rem 1rem', borderRadius: '12px',
                                    background: m.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                    color: 'white', fontSize: '0.85rem', lineHeight: '1.4',
                                    borderTopRightRadius: m.role === 'user' ? 0 : '12px',
                                    borderTopLeftRadius: m.role === 'ai' ? 0 : '12px',
                                }}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.75rem 1rem', borderRadius: '12px', borderTopLeftRadius: 0, color: 'var(--primary)', fontWeight: 'bold' }}>
                                    Analizando...
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {iaFilterText && (
                        <div style={{ padding: '0.5rem 1rem', background: 'rgba(234, 179, 8, 0.15)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(234, 179, 8, 0.3)' }}>
                            <span style={{color: '#facc15'}}>Filtro Dinámico Aplicado: <strong>{iaFilterText}</strong></span>
                            <button onClick={() => setIaFilterText(null)} style={{ background: 'none', border: 'none', color: '#facc15', cursor: 'pointer', display: 'flex' }}><X size={16}/></button>
                        </div>
                    )}

                    <form onSubmit={handleChatSubmit} style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)' }}>
                        <input 
                            type="text" className="form-control" placeholder="Pagar factura CFE, buscar Juan..."
                            value={chatInput} onChange={e => setChatInput(e.target.value)}
                            style={{ flex: 1, borderRadius: '20px', padding: '0.6rem 1rem', fontSize: '0.85rem' }}
                            disabled={chatLoading}
                        />
                        <button type="submit" disabled={chatLoading} style={{
                            background: 'var(--primary)', border: 'none', color: 'white', width: '38px', height: '38px',
                            borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer'
                        }}>
                            <Send size={16} />
                        </button>
                    </form>
                </div>
            )}

            {/* MODAL 1: NUEVO/EDITAR RECORDATORIO */}
            {isFormModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', overflow: 'auto', padding: '2rem' }}>
                    <div className="card glass" style={{ width: '600px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                            <h2 style={{ margin: 0 }}>{formData.id ? 'Editar Recordatorio' : 'Nueva Operación de Pago'}</h2>
                            <button onClick={() => setIsFormModalOpen(false)} style={{ background: 'none', color: 'var(--text-muted)' }}><X size={24} /></button>
                        </div>
                        <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>DESCRIPCIÓN DEL PAGO</label>
                                    <input type="text" className="form-control" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} required placeholder="Ej. Pago de Alquiler, Seguro..." />
                                </div>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>UBICACIÓN / EMPRESA</label>
                                    <select 
                                        style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)', outline: 'none' }}
                                        value={formData.id_ubicacion} 
                                        onChange={e => setFormData({...formData, id_ubicacion: e.target.value})} 
                                        required
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {ubicaciones.map(u => <option value={u.id} key={u.id}>{u.descripcion}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>FECHA DE INICIO</label>
                                    <input type="date" className="form-control" value={formData.iniciar} onChange={e => setFormData({...formData, iniciar: e.target.value})} required />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>MONTO ($)</label>
                                    <input type="number" step="0.01" className="form-control" value={formData.monto} onChange={e => setFormData({...formData, monto: e.target.value})} required style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--primary)' }} />
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>CANTIDAD</label>
                                    <input type="number" min="1" className="form-control" value={formData.repetir} onChange={e => setFormData({...formData, repetir: e.target.value})} required />
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>REPETICIÓN</label>
                                    <select 
                                        style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', color: 'var(--text)', outline: 'none' }}
                                        value={formData.repetir_desc} 
                                        onChange={e => {
                                            setFormData({
                                                ...formData, 
                                                repetir_desc: e.target.value,
                                                pagado: e.target.value === 'VEZ' ? formData.pagado : false
                                            })
                                        }}
                                    >
                                        <option value="VEZ">UNA VEZ</option>
                                        <option value="DIAS">DÍAS</option>
                                        <option value="MES">MESES</option>
                                        <option value="AÑO">AÑOS</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>OBSERVACIÓN / REFERENCIA</label>
                                <input type="text" className="form-control" value={formData.forma_pago} onChange={e => setFormData({...formData, forma_pago: e.target.value})} placeholder="Ej. Factura #123, Transferencia..." />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                    <input type="checkbox" checked={formData.activo} onChange={e => setFormData({...formData, activo: e.target.checked})} style={{ width: '18px', height: '18px' }} /> ESTADO ACTIVO
                                </label>
                            </div>

                            {formData.repetir_desc === 'VEZ' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: 'bold', color: '#4ade80' }}>
                                            <input type="checkbox" checked={formData.pagado} onChange={e => {
                                                const chk = e.target.checked;
                                                setFormData({...formData, pagado: chk, fecPago: chk ? todayStr : '', formaPago2: chk ? formData.formaPago2 : ''})
                                            }} style={{ width: '18px', height: '18px' }} /> MARCAR COMO PAGADO AL REGISTRAR
                                        </label>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', opacity: formData.pagado ? 1 : 0.4, pointerEvents: formData.pagado ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>FECHA DE PAGO</label>
                                            <input type="date" className="form-control" disabled={!formData.pagado} value={formData.fecPago} onChange={e => setFormData({...formData, fecPago: e.target.value})} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>MODALIDAD DE PAGO</label>
                                            <input type="text" className="form-control" placeholder="Ej. Cheque, Transferencia..." disabled={!formData.pagado} value={formData.formaPago2} onChange={e => setFormData({...formData, formaPago2: e.target.value})} />
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                <button type="button" className="btn-secondary" onClick={() => setIsFormModalOpen(false)} style={{ padding: '0.6rem 2rem' }}>Cancelar</button>
                                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 2rem' }}>
                                    <Save size={20} /> Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: PAGAR RECORDATORIO */}
            {isPagoModalOpen && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="card glass modal-content" style={{ maxWidth: '400px', width: '100%', margin: '0 auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ color: 'var(--primary)' }}>Realizar Pago</h2>
                            <button onClick={() => setIsPagoModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handlePagoSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>FECHA DEL PAGO</label>
                                <input type="date" className="form-control" value={pagoData.fecPago} onChange={e => setPagoData({...pagoData, fecPago: e.target.value})} required />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>FORMA DE PAGO</label>
                                <input type="text" className="form-control" placeholder="Efectivo, Cheque..." value={pagoData.formaPago} onChange={e => setPagoData({...pagoData, formaPago: e.target.value})} required />
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" className="btn-danger" onClick={() => setIsPagoModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <CheckCircle size={18} /> Procesar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 3: BUSCADOR DE MATRICES */}
            {isSearchModalOpen && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="card glass modal-content" style={{ maxWidth: '900px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', margin: '0 auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ color: 'var(--primary)' }}>Buscar Recordatorio (Matriz)</h2>
                            <button onClick={() => setIsSearchModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <div className="table-responsive" style={{ flex: 1, overflowY: 'auto', backgroundColor: 'rgba(20,25,30,0.5)', borderRadius: '8px' }}>
                            <table className="data-table" style={{ fontSize: '0.8rem' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'rgba(30,35,42,1)' }}>
                                    <tr>
                                        <th style={{ width: '100px' }}>ID PRINCIPAL</th>
                                        <th>
                                            Descripcion
                                            <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                                   value={searchFilters.descripcion} onChange={e => setSearchFilters({...searchFilters, descripcion: e.target.value})} placeholder="Buscar..." />
                                        </th>
                                        <th>
                                            FechaInicio
                                            <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                                   value={searchFilters.fecha_inicio} onChange={e => setSearchFilters({...searchFilters, fecha_inicio: e.target.value})} placeholder="Buscar..." />
                                        </th>
                                        <th>
                                            Ubicacion
                                            <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                                   value={searchFilters.ubicacion} onChange={e => setSearchFilters({...searchFilters, ubicacion: e.target.value})} placeholder="Buscar..." />
                                        </th>
                                        <th>
                                            Monto
                                            <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                                   value={searchFilters.monto} onChange={e => setSearchFilters({...searchFilters, monto: e.target.value})} placeholder="Buscar..." />
                                        </th>
                                        <th>
                                            Observacion
                                            <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                                   value={searchFilters.observacion} onChange={e => setSearchFilters({...searchFilters, observacion: e.target.value})} placeholder="Buscar..." />
                                        </th>
                                        <th>
                                            Cuotas
                                            <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                                   value={searchFilters.cuotas} onChange={e => setSearchFilters({...searchFilters, cuotas: e.target.value})} placeholder="Buscar..." />
                                        </th>
                                        <th>
                                            Repetición
                                            <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                                   value={searchFilters.repetir_desc} onChange={e => setSearchFilters({...searchFilters, repetir_desc: e.target.value})} placeholder="Buscar..." />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredParents.length === 0 ? (
                                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '1rem' }}>No se encontraron matrices</td></tr>
                                    ) : filteredParents.map((p, idx) => (
                                        <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => handleSelectParent(p)}>
                                            <td style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>{p.id}</td>
                                            <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{p.descripcion}</td>
                                            <td>{formatDate(p.fecha_inicio)}</td>
                                            <td>{p.ubicacion}</td>
                                            <td>{p.monto}</td>
                                            <td>{p.observacion}</td>
                                            <td>{p.cuotas}</td>
                                            <td>{p.repetir_desc}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
