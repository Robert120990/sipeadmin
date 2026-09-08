import React, { useState, useEffect, useMemo } from 'react';
import { 
    Wrench, Plus, Calendar, DollarSign, AlertTriangle, 
    CheckCircle2, Clock, Trash2, Edit2, FileSpreadsheet, 
    FileText, ArrowRight, ShieldAlert, Cpu, RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { formatCurrency } from '../utils/loanCalculations';
import { calculateTCO } from '../utils/investmentCalculations';

export default function FinanzasPlanesMantenimiento() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const [activeTab, setActiveTab] = useState('cronograma'); // 'cronograma' | 'tco'
    const [empresas, setEmpresas] = useState([]);
    const [mantenimientos, setMantenimientos] = useState([]);
    const [loading, setLoading] = useState(false);

    // Filtros cronograma
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');
    const [filtroTipoGasto, setFiltroTipoGasto] = useState('');

    // Modal Crear / Editar Mantenimiento
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [saving, setSaving] = useState(false);

    const [maintForm, setMaintForm] = useState({
        empresa_id: '',
        nombre_activo: '',
        tipo_activo: 'Dispensador',
        costo_estimado: 0,
        tipo_gasto: 'preventivo',
        frecuencia: 'semestral',
        fecha_programada: new Date().toISOString().split('T')[0],
        responsable: '',
        proveedor: '',
        criticidad: 'media',
        estado: 'programado',
        notas: ''
    });

    // Estado del Simulador TCO (Sustituir vs Reparar)
    const [tcoParams, setTcoParams] = useState({
        aniosProyeccion: 5,
        costoEquipoNuevo: 18000,
        mantenimientoAnualNuevo: 800,
        garantiaAnios: 2,
        valorRescateNuevo: 3000,
        costoReparacionActual: 3500,
        mantenimientoAnualActual: 2800,
        inflacionMantenimiento: 12,
        valorVentaActual: 1000
    });

    // Cargar datos
    const fetchData = async () => {
        setLoading(true);
        try {
            const [catRes, mantRes] = await Promise.all([
                api.get('/finanzas/catalogos'),
                api.get('/finanzas/mantenimiento')
            ]);
            setEmpresas(catRes.data?.empresas || []);
            setMantenimientos(mantRes.data || []);
            if (catRes.data?.empresas?.length > 0 && !maintForm.empresa_id) {
                setMaintForm(prev => ({ ...prev, empresa_id: catRes.data.empresas[0].id }));
            }
        } catch (error) {
            console.error('Error fetching planes mantenimiento:', error);
            addToast('Error al cargar datos de mantenimiento', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Abrir Modal
    const handleOpenModal = (item = null) => {
        if (item) {
            setEditingItem(item);
            setMaintForm({
                empresa_id: item.empresa_id,
                nombre_activo: item.nombre_activo,
                tipo_activo: item.tipo_activo || 'Dispensador',
                costo_estimado: item.costo_estimado,
                tipo_gasto: item.tipo_gasto || 'preventivo',
                frecuencia: item.frecuencia || 'semestral',
                fecha_programada: item.fecha_programada ? item.fecha_programada.split('T')[0] : '',
                fecha_ejecutada: item.fecha_ejecutada ? item.fecha_ejecutada.split('T')[0] : '',
                responsable: item.responsable || '',
                proveedor: item.proveedor || '',
                criticidad: item.criticidad || 'media',
                estado: item.estado || 'programado',
                notas: item.notas || ''
            });
        } else {
            setEditingItem(null);
            setMaintForm({
                empresa_id: empresas[0]?.id || '',
                nombre_activo: '',
                tipo_activo: 'Dispensador',
                costo_estimado: 0,
                tipo_gasto: 'preventivo',
                frecuencia: 'semestral',
                fecha_programada: new Date().toISOString().split('T')[0],
                responsable: '',
                proveedor: '',
                criticidad: 'media',
                estado: 'programado',
                notas: ''
            });
        }
        setModalOpen(true);
    };

    // Guardar Mantenimiento
    const handleSaveMantenimiento = async (e) => {
        e.preventDefault();
        if (!maintForm.empresa_id || !maintForm.nombre_activo || !maintForm.costo_estimado || !maintForm.fecha_programada) {
            addToast('Completa los campos obligatorios: Empresa, Activo, Costo y Fecha', 'warning');
            return;
        }

        setSaving(true);
        try {
            if (editingItem) {
                await api.put(`/finanzas/mantenimiento/${editingItem.id}`, maintForm);
                addToast('Mantenimiento actualizado exitosamente', 'success');
            } else {
                await api.post('/finanzas/mantenimiento', maintForm);
                addToast('Mantenimiento programado exitosamente', 'success');
            }
            setModalOpen(false);
            fetchData();
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al guardar mantenimiento', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Eliminar Mantenimiento
    const handleDeleteMantenimiento = async (item) => {
        const ok = await confirm(`¿Estás seguro de eliminar el plan para "${item.nombre_activo}"?`, { variant: 'danger' });
        if (!ok) return;

        try {
            await api.delete(`/finanzas/mantenimiento/${item.id}`);
            addToast('Mantenimiento eliminado', 'success');
            setMantenimientos(prev => prev.filter(m => m.id !== item.id));
        } catch (error) {
            addToast('Error al eliminar mantenimiento', 'error');
        }
    };

    // Marcar como ejecutado
    const handleMarcarEjecutado = async (item) => {
        try {
            await api.put(`/finanzas/mantenimiento/${item.id}`, {
                ...item,
                estado: 'ejecutado',
                fecha_ejecutada: new Date().toISOString().split('T')[0]
            });
            addToast(`Mantenimiento para "${item.nombre_activo}" marcado como ejecutado`, 'success');
            setMantenimientos(prev => prev.map(m => m.id === item.id ? { ...m, estado: 'ejecutado', fecha_ejecutada: new Date().toISOString().split('T')[0] } : m));
        } catch (error) {
            addToast('Error al actualizar estado', 'error');
        }
    };

    // Filtros
    const mantenimientosFiltrados = mantenimientos.filter(m => {
        if (filtroEmpresa && String(m.empresa_id) !== String(filtroEmpresa)) return false;
        if (filtroEstado && m.estado !== filtroEstado) return false;
        if (filtroTipoGasto && m.tipo_gasto !== filtroTipoGasto) return false;
        return true;
    });

    // KPIs de Mantenimiento
    const kpis = useMemo(() => {
        const totalPresupuesto = mantenimientosFiltrados.reduce((sum, m) => sum + (m.costo_estimado || 0), 0);
        const preventivoTotal = mantenimientosFiltrados.filter(m => m.tipo_gasto === 'preventivo').reduce((sum, m) => sum + (m.costo_estimado || 0), 0);
        const capexTotal = mantenimientosFiltrados.filter(m => m.tipo_gasto === 'mejora_capex').reduce((sum, m) => sum + (m.costo_estimado || 0), 0);
        const criticosCount = mantenimientosFiltrados.filter(m => m.criticidad === 'critica' || m.criticidad === 'alta').length;
        const programadosCount = mantenimientosFiltrados.filter(m => m.estado === 'programado').length;

        return {
            totalPresupuesto,
            preventivoTotal,
            capexTotal,
            criticosCount,
            programadosCount
        };
    }, [mantenimientosFiltrados]);

    // Cálculo reactivo TCO
    const tcoResult = useMemo(() => {
        return calculateTCO(tcoParams);
    }, [tcoParams]);

    // Exportar a Excel
    const exportToExcel = () => {
        if (mantenimientos.length === 0) return;
        const wsData = mantenimientos.map(m => ({
            'ID': m.id,
            'Activo': m.nombre_activo,
            'Tipo de Activo': m.tipo_activo,
            'Empresa': m.empresa_nombre,
            'Costo Estimado': m.costo_estimado,
            'Tipo Gasto': m.tipo_gasto,
            'Frecuencia': m.frecuencia,
            'Fecha Programada': m.fecha_programada ? m.fecha_programada.split('T')[0] : '',
            'Fecha Ejecución': m.fecha_ejecutada ? m.fecha_ejecutada.split('T')[0] : 'Pendiente',
            'Criticidad': m.criticidad,
            'Estado': m.estado,
            'Responsable': m.responsable || 'N/A',
            'Proveedor': m.proveedor || 'N/A'
        }));
        const ws = XLSX.utils.json_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Planes_Mantenimiento");
        XLSX.writeFile(wb, `Mantenimiento_Presupuesto_${new Date().toISOString().split('T')[0]}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    // Exportar a PDF
    const exportToPDF = () => {
        if (mantenimientos.length === 0) return;
        const doc = new jsPDF('landscape');
        doc.setFontSize(15);
        doc.text('Presupuesto y Planificación de Mantenimientos y CapEx', 14, 15);
        doc.setFontSize(9);
        doc.text(`Fecha: ${new Date().toLocaleDateString()} | Presupuesto Total: ${formatCurrency(kpis.totalPresupuesto)}`, 14, 22);

        const columns = ['Activo', 'Empresa', 'Tipo Activo', 'Costo', 'Tipo Gasto', 'Frecuencia', 'Fecha Prog.', 'Criticidad', 'Estado'];
        const rows = mantenimientos.map(m => [
            m.nombre_activo,
            m.empresa_nombre,
            m.tipo_activo,
            formatCurrency(m.costo_estimado),
            m.tipo_gasto.toUpperCase(),
            m.frecuencia,
            m.fecha_programada ? m.fecha_programada.split('T')[0] : '',
            m.criticidad.toUpperCase(),
            m.estado.toUpperCase()
        ]);

        autoTable(doc, {
            head: [columns],
            body: rows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [30, 41, 59] }
        });

        doc.save(`Planes_Mantenimiento_${new Date().toISOString().split('T')[0]}.pdf`);
        addToast('Archivo PDF descargado', 'success');
    };

    // Insignia de criticidad
    const renderBadgeCriticidad = (criticidad) => {
        const styles = {
            critica: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Crítica' },
            alta: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: 'Alta' },
            media: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Media' },
            baja: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', label: 'Baja' }
        };
        const s = styles[criticidad] || styles.media;
        return (
            <span style={{ background: s.bg, color: s.color, padding: '0.2rem 0.5rem', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700 }}>
                {s.label}
            </span>
        );
    };

    return (
        <div style={{ paddingBottom: '3rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
                        <Wrench size={28} className="text-primary" />
                        Planes de Mantenimiento y Presupuesto
                    </h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0 0', fontSize: '0.92rem' }}>
                        Control de desembolsos preventivos y correctivos para tanques, dispensadores, bombas y flota de transporte. Matriz de decisión TCO.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button 
                        className={`btn ${activeTab === 'cronograma' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setActiveTab('cronograma')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Calendar size={16} /> Cronograma y Presupuestos
                    </button>
                    <button 
                        className={`btn ${activeTab === 'tco' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setActiveTab('tco')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Cpu size={16} /> Decisión: ¿Sustituir o Reparar?
                    </button>
                </div>
            </div>

            {/* TAB 1: CRONOGRAMA Y PRESUPUESTOS */}
            {activeTab === 'cronograma' && (
                <div>
                    {/* KPIs de Mantenimiento */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #3b82f6' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                PRESUPUESTO TOTAL COMPROMETIDO
                            </div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0.3rem 0', color: 'var(--text-color)' }}>
                                {formatCurrency(kpis.totalPresupuesto)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {kpis.programadosCount} eventos programados
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                GASTO PREVENTIVO (OPEX)
                            </div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0.3rem 0', color: '#10b981' }}>
                                {formatCurrency(kpis.preventivoTotal)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Mantenimiento programado continuo
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #8b5cf6' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                MEJORAS MAYORES (CAPEX)
                            </div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0.3rem 0', color: '#8b5cf6' }}>
                                {formatCurrency(kpis.capexTotal)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Inversión que alarga la vida útil
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '1.25rem', borderLeft: `4px solid ${kpis.criticosCount > 0 ? '#ef4444' : '#10b981'}` }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                EVENTOS DE ALTA CRITICIDAD
                            </div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0.3rem 0', color: kpis.criticosCount > 0 ? '#ef4444' : '#10b981' }}>
                                {kpis.criticosCount}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {kpis.criticosCount > 0 ? 'Requiere atención prioritaria' : 'Todo bajo control'}
                            </div>
                        </div>
                    </div>

                    {/* Barra de Filtros y Acciones */}
                    <div className="card glass" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', flex: 1 }}>
                                <select 
                                    className="form-control" 
                                    style={{ maxWidth: '220px' }}
                                    value={filtroEmpresa}
                                    onChange={e => setFiltroEmpresa(e.target.value)}
                                >
                                    <option value="">Todas las Empresas</option>
                                    {empresas.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                    ))}
                                </select>

                                <select 
                                    className="form-control" 
                                    style={{ maxWidth: '170px' }}
                                    value={filtroEstado}
                                    onChange={e => setFiltroEstado(e.target.value)}
                                >
                                    <option value="">Todos los Estados</option>
                                    <option value="programado">Programados</option>
                                    <option value="en_proceso">En Proceso</option>
                                    <option value="ejecutado">Ejecutados</option>
                                    <option value="vencido">Vencidos</option>
                                </select>

                                <select 
                                    className="form-control" 
                                    style={{ maxWidth: '170px' }}
                                    value={filtroTipoGasto}
                                    onChange={e => setFiltroTipoGasto(e.target.value)}
                                >
                                    <option value="">Todos los Gastos</option>
                                    <option value="preventivo">Preventivo (OpEx)</option>
                                    <option value="correctivo">Correctivo</option>
                                    <option value="mejora_capex">Mejora Mayor (CapEx)</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '0.6rem' }}>
                                <button 
                                    className="btn btn-outline" 
                                    onClick={exportToExcel}
                                    disabled={mantenimientos.length === 0}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <FileSpreadsheet size={16} /> Excel
                                </button>
                                <button 
                                    className="btn btn-outline" 
                                    onClick={exportToPDF}
                                    disabled={mantenimientos.length === 0}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <FileText size={16} /> PDF
                                </button>
                                <button 
                                    className="btn btn-primary"
                                    onClick={() => handleOpenModal()}
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                >
                                    <Plus size={16} /> Programar Mantenimiento
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Tabla de Mantenimientos */}
                    <div className="card glass" style={{ padding: '1.25rem' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                Cargando planes de mantenimiento...
                            </div>
                        ) : mantenimientosFiltrados.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                No se encontraron planes de mantenimiento con los filtros seleccionados.
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table" style={{ width: '100%', minWidth: '950px' }}>
                                    <thead>
                                        <tr>
                                            <th>Activo / Equipo</th>
                                            <th>Empresa</th>
                                            <th>Tipo Activo</th>
                                            <th>Costo Estimado</th>
                                            <th>Frecuencia</th>
                                            <th>Fecha Programada</th>
                                            <th>Criticidad</th>
                                            <th>Estado</th>
                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mantenimientosFiltrados.map(m => (
                                            <tr key={m.id}>
                                                <td>
                                                    <div style={{ fontWeight: 600 }}>{m.nombre_activo}</div>
                                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                        {m.tipo_gasto === 'mejora_capex' ? 'CapEx (Inversión)' : 'OpEx (Gasto Operativo)'}
                                                        {m.responsable && ` | Resp: ${m.responsable}`}
                                                    </small>
                                                </td>
                                                <td>{m.empresa_nombre}</td>
                                                <td>{m.tipo_activo}</td>
                                                <td style={{ fontWeight: 600 }}>{formatCurrency(m.costo_estimado)}</td>
                                                <td style={{ textTransform: 'capitalize' }}>{m.frecuencia}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                        <Calendar size={14} className="text-muted" />
                                                        {m.fecha_programada ? m.fecha_programada.split('T')[0] : 'N/A'}
                                                    </div>
                                                </td>
                                                <td>{renderBadgeCriticidad(m.criticidad)}</td>
                                                <td>
                                                    <span className={`badge ${m.estado === 'ejecutado' ? 'badge-success' : m.estado === 'en_proceso' ? 'badge-warning' : 'badge-secondary'}`}>
                                                        {m.estado.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                                        {m.estado !== 'ejecutado' && (
                                                            <button 
                                                                className="btn btn-sm btn-outline text-success"
                                                                onClick={() => handleMarcarEjecutado(m)}
                                                                title="Marcar como ejecutado"
                                                            >
                                                                <CheckCircle2 size={14} />
                                                            </button>
                                                        )}
                                                        <button 
                                                            className="btn btn-sm btn-outline"
                                                            onClick={() => handleOpenModal(m)}
                                                            title="Editar plan"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button 
                                                            className="btn btn-sm btn-outline text-danger"
                                                            onClick={() => handleDeleteMantenimiento(m)}
                                                            title="Eliminar registro"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: MATRIZ DE DECISIÓN TCO (SUSTITUIR VS REPARAR) */}
            {activeTab === 'tco' && (
                <div>
                    <div className="card glass" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                            <Cpu size={22} className="text-primary" />
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                                Dilema Financiero: ¿Conviene Sustituir o Seguir Reparando el Activo? (TCO)
                            </h2>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                            Analiza el Costo Total de Propiedad proyectado a varios años entre seguir parchando un equipo desgastado vs comprar uno nuevo con garantía y menor gasto operativo.
                        </p>
                    </div>

                    {/* Formulario de Parámetros TCO */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        {/* Opción A: Mantener y Reparar Actual */}
                        <div className="card glass" style={{ padding: '1.5rem', borderTop: '4px solid #ef4444' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ef4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <ShieldAlert size={18} /> Opción A: Mantener Equipo Existente
                            </h3>

                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Costo de Reparación Inmediata ($)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={tcoParams.costoReparacionActual}
                                        onChange={e => setTcoParams({ ...tcoParams, costoReparacionActual: parseFloat(e.target.value) || 0 })}
                                        step="200"
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Desembolso para ponerlo a operar hoy</small>
                                </div>

                                <div>
                                    <label className="form-label">Gasto de Mantenimiento Anual Actual ($)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={tcoParams.mantenimientoAnualActual}
                                        onChange={e => setTcoParams({ ...tcoParams, mantenimientoAnualActual: parseFloat(e.target.value) || 0 })}
                                        step="200"
                                    />
                                </div>

                                <div>
                                    <label className="form-label">Incremento Anual por Desgaste/Fallas (%)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={tcoParams.inflacionMantenimiento}
                                        onChange={e => setTcoParams({ ...tcoParams, inflacionMantenimiento: parseFloat(e.target.value) || 0 })}
                                        step="1"
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Cada año falla más por envejecimiento</small>
                                </div>

                                <div>
                                    <label className="form-label">Valor de Venta como Chatarra/Usado ($)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={tcoParams.valorVentaActual}
                                        onChange={e => setTcoParams({ ...tcoParams, valorVentaActual: parseFloat(e.target.value) || 0 })}
                                        step="100"
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Lo que recuperamos si lo vendemos hoy</small>
                                </div>
                            </div>
                        </div>

                        {/* Opción B: Comprar Equipo Nuevo */}
                        <div className="card glass" style={{ padding: '1.5rem', borderTop: '4px solid #10b981' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#10b981', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <CheckCircle2 size={18} /> Opción B: Adquirir Activo Nuevo
                            </h3>

                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Precio de Compra del Nuevo Activo ($)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={tcoParams.costoEquipoNuevo}
                                        onChange={e => setTcoParams({ ...tcoParams, costoEquipoNuevo: parseFloat(e.target.value) || 0 })}
                                        step="500"
                                    />
                                </div>

                                <div>
                                    <label className="form-label">Mantenimiento Preventivo Anual Nuevo ($)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={tcoParams.mantenimientoAnualNuevo}
                                        onChange={e => setTcoParams({ ...tcoParams, mantenimientoAnualNuevo: parseFloat(e.target.value) || 0 })}
                                        step="100"
                                    />
                                </div>

                                <div>
                                    <label className="form-label">Años de Garantía Total del Fabricante</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={tcoParams.garantiaAnios}
                                        onChange={e => setTcoParams({ ...tcoParams, garantiaAnios: parseInt(e.target.value, 10) || 1 })}
                                        min="0"
                                        max="5"
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Durante este lapso el mantenimiento es mínimo</small>
                                </div>

                                <div>
                                    <label className="form-label">Valor Residual Estimado al Final ($)</label>
                                    <input 
                                        type="number" 
                                        className="form-control"
                                        value={tcoParams.valorRescateNuevo}
                                        onChange={e => setTcoParams({ ...tcoParams, valorRescateNuevo: parseFloat(e.target.value) || 0 })}
                                        step="200"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Veredicto y Tarjeta de Decisión */}
                    <div className="card glass" style={{ padding: '1.5rem', border: `2px solid ${tcoResult.convieneSustituir ? '#10b981' : '#3b82f6'}`, marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <span className="badge" style={{ background: tcoResult.convieneSustituir ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)', color: tcoResult.convieneSustituir ? '#10b981' : '#3b82f6', fontSize: '0.85rem' }}>
                                    DICTAMEN FINANCIERO TCO
                                </span>
                                <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0.4rem 0' }}>
                                    {tcoResult.convieneSustituir ? 'Recomendación: SUSTITUIR POR EQUIPO NUEVO' : 'Recomendación: MANTENER Y REPARAR POR AHORA'}
                                </h3>
                                <p style={{ color: 'var(--text-color)', fontSize: '0.95rem', margin: 0 }}>
                                    {tcoResult.recomendacion}
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'right' }}>
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Costo Total Mantener:</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#ef4444' }}>
                                        {formatCurrency(tcoResult.tcoActual)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Costo Total Nuevo:</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#10b981' }}>
                                        {formatCurrency(tcoResult.tcoNuevo)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Desglose de Gastos Año por Año */}
                        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.2rem' }}>
                            <h4 style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: '0.8rem' }}>
                                Comparativa de Desembolsos Anuales Proyectados:
                            </h4>
                            <div className="table-responsive">
                                <table className="table table-sm" style={{ width: '100%', minWidth: '600px' }}>
                                    <thead>
                                        <tr>
                                            <th>Concepto</th>
                                            {Array.from({ length: tcoParams.aniosProyeccion }).map((_, i) => (
                                                <th key={i} style={{ textAlign: 'right' }}>Año {i + 1}</th>
                                            ))}
                                            <th style={{ textAlign: 'right' }}>Total Acumulado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style={{ fontWeight: 600, color: '#ef4444' }}>Opción A (Equipo Actual)</td>
                                            {tcoResult.flujoAnualActual.map((f, i) => (
                                                <td key={i} style={{ textAlign: 'right' }}>{formatCurrency(f)}</td>
                                            ))}
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                                                {formatCurrency(tcoResult.tcoActual)}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style={{ fontWeight: 600, color: '#10b981' }}>Opción B (Equipo Nuevo)</td>
                                            {tcoResult.flujoAnualNuevo.map((f, i) => (
                                                <td key={i} style={{ textAlign: 'right' }}>{formatCurrency(f)}</td>
                                            ))}
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                                                {formatCurrency(tcoResult.tcoNuevo)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL PROGRAMAR / EDITAR MANTENIMIENTO */}
            {modalOpen && (
                <Modal 
                    isOpen={modalOpen} 
                    onClose={() => setModalOpen(false)}
                    title={editingItem ? "Editar Plan de Mantenimiento" : "Programar Nuevo Mantenimiento"}
                    size="lg"
                >
                    <form onSubmit={handleSaveMantenimiento}>
                        <div className="form-grid form-grid-2">
                            <div>
                                <label className="form-label">Empresa *</label>
                                <select 
                                    className="form-control"
                                    value={maintForm.empresa_id}
                                    onChange={e => setMaintForm({ ...maintForm, empresa_id: e.target.value })}
                                    required
                                >
                                    <option value="">-- Seleccionar Empresa --</option>
                                    {empresas.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="form-label">Nombre del Activo / Equipo *</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={maintForm.nombre_activo}
                                    onChange={e => setMaintForm({ ...maintForm, nombre_activo: e.target.value })}
                                    placeholder="Ej. Dispensador Wayne #2 Pista Norte"
                                    required
                                />
                            </div>

                            <div>
                                <label className="form-label">Tipo de Activo</label>
                                <select 
                                    className="form-control"
                                    value={maintForm.tipo_activo}
                                    onChange={e => setMaintForm({ ...maintForm, tipo_activo: e.target.value })}
                                >
                                    <option value="Dispensador">Dispensador de Combustible</option>
                                    <option value="Tanque Subterráneo">Tanque Subterráneo</option>
                                    <option value="Cisterna / Pipa">Cisterna / Pipa de Transporte</option>
                                    <option value="Bomba Sumergible">Bomba Sumergible / Motobomba</option>
                                    <option value="Planta Eléctrica">Planta Eléctrica de Emergencia</option>
                                    <option value="Pista / Techo">Pista de Concreto / Marquesina</option>
                                    <option value="Sistema Informático">Sistema Informático / Consola</option>
                                    <option value="Otro">Otro Activo</option>
                                </select>
                            </div>

                            <div>
                                <label className="form-label">Costo Estimado ($) *</label>
                                <input 
                                    type="number" 
                                    className="form-control"
                                    value={maintForm.costo_estimado}
                                    onChange={e => setMaintForm({ ...maintForm, costo_estimado: parseFloat(e.target.value) || 0 })}
                                    step="50"
                                    required
                                />
                            </div>

                            <div>
                                <label className="form-label">Tipo de Gasto</label>
                                <select 
                                    className="form-control"
                                    value={maintForm.tipo_gasto}
                                    onChange={e => setMaintForm({ ...maintForm, tipo_gasto: e.target.value })}
                                >
                                    <option value="preventivo">Preventivo Programado (OpEx)</option>
                                    <option value="correctivo">Correctivo por Falla</option>
                                    <option value="mejora_capex">Mejora Mayor / Reconstrucción (CapEx)</option>
                                </select>
                            </div>

                            <div>
                                <label className="form-label">Frecuencia</label>
                                <select 
                                    className="form-control"
                                    value={maintForm.frecuencia}
                                    onChange={e => setMaintForm({ ...maintForm, frecuencia: e.target.value })}
                                >
                                    <option value="mensual">Mensual</option>
                                    <option value="trimestral">Trimestral</option>
                                    <option value="semestral">Semestral</option>
                                    <option value="anual">Anual</option>
                                    <option value="bianual">Cada 2 Años</option>
                                    <option value="eventual">Eventual / Única Vez</option>
                                </select>
                            </div>

                            <div>
                                <label className="form-label">Fecha Programada *</label>
                                <input 
                                    type="date" 
                                    className="form-control"
                                    value={maintForm.fecha_programada}
                                    onChange={e => setMaintForm({ ...maintForm, fecha_programada: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="form-label">Nivel de Criticidad</label>
                                <select 
                                    className="form-control"
                                    value={maintForm.criticidad}
                                    onChange={e => setMaintForm({ ...maintForm, criticidad: e.target.value })}
                                >
                                    <option value="baja">Baja (No detiene operaciones)</option>
                                    <option value="media">Media (Afecta parcialmente)</option>
                                    <option value="alta">Alta (Riesgo operativo o seguridad)</option>
                                    <option value="critica">Crítica (Paro total inminente)</option>
                                </select>
                            </div>

                            <div>
                                <label className="form-label">Responsable Interno</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={maintForm.responsable}
                                    onChange={e => setMaintForm({ ...maintForm, responsable: e.target.value })}
                                    placeholder="Ej. Ing. Mantenimiento / Jefe Pista"
                                />
                            </div>

                            <div>
                                <label className="form-label">Proveedor / Taller Especializado</label>
                                <input 
                                    type="text" 
                                    className="form-control"
                                    value={maintForm.proveedor}
                                    onChange={e => setMaintForm({ ...maintForm, proveedor: e.target.value })}
                                    placeholder="Ej. Gilbarco Service / Taller Diesel"
                                />
                            </div>

                            <div>
                                <label className="form-label">Estado</label>
                                <select 
                                    className="form-control"
                                    value={maintForm.estado}
                                    onChange={e => setMaintForm({ ...maintForm, estado: e.target.value })}
                                >
                                    <option value="programado">Programado</option>
                                    <option value="en_proceso">En Proceso</option>
                                    <option value="ejecutado">Ejecutado</option>
                                    <option value="vencido">Vencido</option>
                                    <option value="cancelado">Cancelado</option>
                                </select>
                            </div>

                            <div className="span-2">
                                <label className="form-label">Notas y Observaciones</label>
                                <textarea 
                                    className="form-control"
                                    rows="2"
                                    value={maintForm.notas}
                                    onChange={e => setMaintForm({ ...maintForm, notas: e.target.value })}
                                    placeholder="Detalles de calibración, refacciones a sustituir, etc."
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                            <button 
                                type="button" 
                                className="btn btn-outline" 
                                onClick={() => setModalOpen(false)}
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit" 
                                className="btn btn-primary"
                                disabled={saving}
                            >
                                {saving ? 'Guardando...' : editingItem ? 'Actualizar Mantenimiento' : 'Programar Mantenimiento'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
