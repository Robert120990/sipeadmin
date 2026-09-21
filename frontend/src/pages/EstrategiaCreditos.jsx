import React, { useState, useEffect } from 'react';
import { 
    CheckCircle2, RefreshCw, Search, DollarSign, 
    Copy, Eye, FileText, Receipt, CheckCheck, Clock, AlertTriangle, X
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateDMY } from '../utils/date';
import Modal from '../components/Modal';

export default function EstrategiaCreditos() {
    const { addToast } = useToast();

    const [carteraData, setCarteraData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filtroRiesgo, setFiltroRiesgo] = useState('todos');
    const [search, setSearch] = useState('');

    // Estado del modal de DTEs y Abonos
    const [modalDtesOpen, setModalDtesOpen] = useState(false);
    const [selectedCliente, setSelectedCliente] = useState(null);
    const [detalleLoading, setDetalleLoading] = useState(false);
    const [detalleData, setDetalleData] = useState(null);
    const [activeTab, setActiveTab] = useState('dtes'); // 'dtes' | 'abonos'
    const [filtroEstadoDte, setFiltroEstadoDte] = useState('todos'); // 'todos' | 'pendientes' | 'abonos' | 'pagados'
    const [searchDte, setSearchDte] = useState('');

    const fetchCreditos = async () => {
        setLoading(true);
        try {
            const res = await api.get('/inteligencia/credito-flotas');
            setCarteraData(res.data);
        } catch (error) {
            console.error('Error fetching credito flotas:', error);
            addToast('Error al consultar riesgo de créditos', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCreditos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleVerDetalleDtes = async (cliente) => {
        setSelectedCliente(cliente);
        setModalDtesOpen(true);
        setDetalleLoading(true);
        setActiveTab('dtes');
        setFiltroEstadoDte('todos');
        setSearchDte('');
        try {
            const res = await api.get(`/inteligencia/credito-flotas/${cliente.id}/dtes`);
            setDetalleData(res.data);
        } catch (error) {
            console.error('Error al cargar detalle de DTEs:', error);
            addToast('No se pudieron obtener los DTEs y abonos del cliente', 'error');
        } finally {
            setDetalleLoading(false);
        }
    };

    const handleCopiarCodigoGen = (codigo) => {
        if (!codigo) return;
        navigator.clipboard.writeText(codigo);
        addToast('Código de generación copiado', 'success');
    };

    const resumen = carteraData?.resumen_cartera || {};
    const clientes = carteraData?.clientes || [];

    const clientesFiltrados = clientes.filter(c => {
        if (filtroRiesgo !== 'todos' && c.nivel_riesgo !== filtroRiesgo) return false;
        if (search.trim()) {
            const q = search.toLowerCase();
            return c.cliente?.toLowerCase().includes(q) || c.empresa_emisora?.toLowerCase().includes(q);
        }
        return true;
    });

    const handleCopiarAlerta = (cliente) => {
        const text = `⚠️ *ALERTA SIPE CRÉDITOS:* Se solicita suspensión temporal de vales para *${cliente.cliente}*. Motivo: Saldo adeudado $${cliente.saldo_pendiente.toLocaleString()} USD (${cliente.porcentaje_utilizado}% de cupo utilizado, ${cliente.dias_mora} días de mora).`;
        navigator.clipboard.writeText(text);
        addToast(`Alerta para ${cliente.cliente} copiada al portapapeles`, 'success');
    };

    // DTEs filtrados en el modal
    const modalDtes = detalleData?.dtes || [];
    const modalAbonos = detalleData?.abonos || [];
    const modalResumen = detalleData?.resumen || {};

    const dtesFiltrados = modalDtes.filter(d => {
        if (filtroEstadoDte === 'pendientes' && d.estado_pago !== 'PENDIENTE') return false;
        if (filtroEstadoDte === 'abonos' && d.estado_pago !== 'ABONADO_PARCIAL') return false;
        if (filtroEstadoDte === 'pagados' && d.estado_pago !== 'PAGADO' && d.estado_pago !== 'PAGADO_CONTADO') return false;
        if (searchDte.trim()) {
            const q = searchDte.toLowerCase();
            return (
                d.numero_control?.toLowerCase().includes(q) ||
                d.codigo_generacion?.toLowerCase().includes(q) ||
                d.tipo_dte_desc?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <CheckCircle2 size={22} color="#06b6d4" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Control de Crédito & Flotas Corporativas</h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Monitoreo de líneas de crédito, riesgo de incobrables y suspensión preventiva de vales
                            {resumen?.fecha_corte && ` • Corte: ${formatDateDMY(resumen.fecha_corte)}`}
                        </p>
                    </div>
                </div>

                <button 
                    onClick={fetchCreditos}
                    className="btn btn-primary"
                    style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                    <RefreshCw size={15} /> Actualizar
                </button>
            </div>

            {/* KPI Cards */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', 
                gap: '0.85rem' 
            }}>
                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Cartera Total en Crédito
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.2rem' }}>
                        ${resumen.total_cartera_activa_usd?.toLocaleString() || 0} USD
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#06b6d4' }}>
                        {resumen.total_clientes_analizados || 0} clientes evaluados
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: resumen.total_saldo_vencido_usd > 0 ? '4px solid #ef4444' : '4px solid #10b981' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Saldo Vencido en Mora
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: resumen.total_saldo_vencido_usd > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                        ${resumen.total_saldo_vencido_usd?.toLocaleString() || 0} USD
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {resumen.porcentaje_morosidad || 0}% tasa de morosidad
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Bloqueo Preventivo Sugerido
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: resumen.clientes_criticos_para_bloqueo > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                        {resumen.clientes_criticos_para_bloqueo || 0} Clientes
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Exceden cupo o superan 7 días mora
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Estatus de Cartera
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: resumen.porcentaje_morosidad > 15 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                        {resumen.porcentaje_morosidad > 15 ? 'RIESGO ELEVADO' : 'CARTERA SANA'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Límites de crédito controlados
                    </div>
                </div>
            </div>

            {/* Tabla de Clientes y Flotas */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, maxWidth: '350px' }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                            <input 
                                type="text"
                                className="form-control"
                                placeholder="Buscar cliente o empresa..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', paddingLeft: '32px', width: '100%' }}
                            />
                        </div>
                    </div>

                    <select 
                        value={filtroRiesgo} 
                        onChange={(e) => setFiltroRiesgo(e.target.value)}
                        className="form-control"
                        style={{ height: '36px', fontSize: '0.825rem', width: 'auto' }}
                    >
                        <option value="todos">Todos los Clientes</option>
                        <option value="critico">Solo Bloqueo Sugerido (Críticos)</option>
                        <option value="advertencia">Solo Advertencias</option>
                        <option value="bajo">Solo Cartera al Día</option>
                    </select>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>CLIENTE / FLOTA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>EMPRESA EMISORA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>LÍMITE ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>SALDO PENDIENTE</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>USO DE LÍNEA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>PLAZO / MORA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>NIVEL RIESGO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>ACCIÓN RECOMENDADA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Evaluando carteras y plazos de clientes...
                                    </td>
                                </tr>
                            ) : clientesFiltrados.length === 0 ? (
                                <tr>
                                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        No se encontraron clientes con el filtro seleccionado.
                                    </td>
                                </tr>
                            ) : (
                                clientesFiltrados.map((c, idx) => {
                                    const esCritico = c.nivel_riesgo === 'critico';
                                    const esAdvertencia = c.nivel_riesgo === 'advertencia';

                                    let badgeColor = '#10b981';
                                    let badgeBg = 'rgba(16, 185, 129, 0.15)';
                                    let badgeText = 'BAJO';
                                    if (esCritico) {
                                        badgeColor = '#ef4444';
                                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                                        badgeText = 'CRÍTICO';
                                    } else if (esAdvertencia) {
                                        badgeColor = '#f59e0b';
                                        badgeBg = 'rgba(245, 158, 11, 0.15)';
                                        badgeText = 'MEDIO';
                                    }

                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {/* OJO directo para acceso inmediato en móvil */}
                                                    <button
                                                        onClick={() => handleVerDetalleDtes(c)}
                                                        className="btn btn-secondary"
                                                        title="Ver DTEs, abonos y estado de pago"
                                                        style={{
                                                            height: '28px',
                                                            width: '28px',
                                                            padding: 0,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            borderRadius: '6px',
                                                            backgroundColor: 'rgba(6, 182, 212, 0.12)',
                                                            borderColor: 'rgba(6, 182, 212, 0.3)',
                                                            color: '#06b6d4',
                                                            cursor: 'pointer',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <Eye size={15} />
                                                    </button>
                                                    <div>
                                                        <div>{c.cliente}</div>
                                                        {c.nit && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>NIT: {c.nit}</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>
                                                {c.empresa_emisora}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                ${c.limite_credito?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: esCritico ? '#ef4444' : 'var(--text)' }}>
                                                ${c.saldo_pendiente?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', width: '130px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.2rem' }}>
                                                    <span>{c.porcentaje_utilizado}%</span>
                                                    <span style={{ color: 'var(--text-muted)' }}>Disp: ${c.disponible_credito?.toLocaleString()}</span>
                                                </div>
                                                <div style={{ width: '100%', height: '5px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ 
                                                        width: `${Math.min(100, c.porcentaje_utilizado)}%`, 
                                                        height: '100%', 
                                                        backgroundColor: badgeColor,
                                                        borderRadius: '3px'
                                                    }} />
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span>{c.dias_plazo} días</span>
                                                {c.dias_mora > 0 && (
                                                    <span style={{ display: 'block', color: '#ef4444', fontWeight: 'bold', fontSize: '0.72rem' }}>
                                                        +{c.dias_mora}d mora
                                                        {c.fecha_antigua && (
                                                             <span style={{ display: 'block', fontWeight: 'normal', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                                (desde {formatDateDMY(c.fecha_antigua)})
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{ 
                                                    backgroundColor: badgeBg, 
                                                    color: badgeColor, 
                                                    fontSize: '0.72rem', 
                                                    padding: '0.15rem 0.45rem', 
                                                    borderRadius: '4px',
                                                    fontWeight: 'bold',
                                                    display: 'inline-block'
                                                }}>
                                                    {badgeText}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.75rem', color: esCritico ? '#ef4444' : 'var(--text-muted)', fontWeight: esCritico ? 600 : 'normal' }}>
                                                        {c.accion_sugerida}
                                                    </span>
                                                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                                                        <button 
                                                            onClick={() => handleVerDetalleDtes(c)}
                                                            className="btn btn-secondary"
                                                            title="Ver DTEs, abonos y estado de pago"
                                                            style={{ height: '26px', padding: '0 0.5rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}
                                                        >
                                                            <Eye size={12} color="#06b6d4" /> DTEs & Abonos
                                                        </button>
                                                        {esCritico && (
                                                            <button 
                                                                onClick={() => handleCopiarAlerta(c)}
                                                                className="btn btn-secondary"
                                                                title="Copiar mensaje de alerta para WhatsApp"
                                                                style={{ height: '26px', padding: '0 0.5rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}
                                                            >
                                                                <Copy size={12} /> Copiar Alerta
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Detalle de DTEs y Abonos */}
            <Modal
                open={modalDtesOpen}
                onClose={() => setModalDtesOpen(false)}
                title={`DTEs y Abonos: ${selectedCliente?.cliente || ''}`}
                size="xl"
                footer={(
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <button 
                            className="btn btn-secondary"
                            onClick={() => setModalDtesOpen(false)}
                            style={{ height: '34px', fontSize: '0.8rem' }}
                        >
                            Cerrar
                        </button>
                    </div>
                )}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Header info bar */}
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '0.6rem 0.85rem', 
                        backgroundColor: 'var(--bg-card)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '8px',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                    }}>
                        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Emisora: <strong style={{ color: 'var(--text)' }}>{selectedCliente?.empresa_emisora || 'N/A'}</strong>
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Plazo: <strong style={{ color: 'var(--text)' }}>{selectedCliente?.dias_plazo || 15} días</strong>
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Límite Cupo: <strong style={{ color: 'var(--text)' }}>${selectedCliente?.limite_credito?.toLocaleString()}</strong>
                            </span>
                        </div>
                        <div style={{ fontSize: '0.8rem' }}>
                            Saldo Global: <strong style={{ color: selectedCliente?.saldo_pendiente > 0 ? '#ef4444' : '#10b981' }}>${selectedCliente?.saldo_pendiente?.toLocaleString()} USD</strong>
                        </div>
                    </div>

                    {/* KPI Cards del Cliente */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', 
                        gap: '0.65rem' 
                    }}>
                        <div className="card glass" style={{ padding: '0.65rem 0.85rem' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                Total Facturado DTEs
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.15rem' }}>
                                ${modalResumen.total_facturado_usd?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#06b6d4' }}>
                                {modalResumen.total_dtes || 0} DTEs emitidos
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.65rem 0.85rem', borderLeft: '3px solid #10b981' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                Abonos Recibidos
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.15rem' }}>
                                ${modalResumen.total_pagos_recibidos_usd?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {modalAbonos.length} pagos registrados
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.65rem 0.85rem', borderLeft: modalResumen.saldo_pendiente_usd > 0 ? '3px solid #ef4444' : '3px solid #10b981' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                Saldo Pendiente Total
                            </div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: modalResumen.saldo_pendiente_usd > 0 ? '#ef4444' : '#10b981', marginTop: '0.15rem' }}>
                                ${modalResumen.saldo_pendiente_usd?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                Facturado menos abonos
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.65rem 0.85rem' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                Balance DTEs
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                    {modalResumen.dtes_pagados || 0} Pagados
                                </span>
                                <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 'bold' }}>
                                    {modalResumen.dtes_pendientes || 0} Pendientes
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Segmented Tab Controls */}
                    <div style={{ 
                        display: 'flex', 
                        borderBottom: '1px solid var(--border-color)', 
                        gap: '0.5rem',
                        marginTop: '0.2rem'
                    }}>
                        <button
                            onClick={() => setActiveTab('dtes')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.5rem 0.85rem',
                                fontSize: '0.825rem',
                                fontWeight: 600,
                                border: 'none',
                                background: 'transparent',
                                borderBottom: activeTab === 'dtes' ? '2px solid #06b6d4' : '2px solid transparent',
                                color: activeTab === 'dtes' ? '#06b6d4' : 'var(--text-muted)',
                                cursor: 'pointer'
                            }}
                        >
                            <FileText size={15} /> Facturas y DTEs ({modalDtes.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('abonos')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.5rem 0.85rem',
                                fontSize: '0.825rem',
                                fontWeight: 600,
                                border: 'none',
                                background: 'transparent',
                                borderBottom: activeTab === 'abonos' ? '2px solid #06b6d4' : '2px solid transparent',
                                color: activeTab === 'abonos' ? '#06b6d4' : 'var(--text-muted)',
                                cursor: 'pointer'
                            }}
                        >
                            <DollarSign size={15} /> Historial de Abonos ({modalAbonos.length})
                        </button>
                    </div>

                    {/* Contenido de Tab: DTEs */}
                    {activeTab === 'dtes' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {/* Filtros de DTEs */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => setFiltroEstadoDte('todos')}
                                        className={`btn ${filtroEstadoDte === 'todos' ? 'btn-primary' : 'btn-secondary'}`}
                                        style={{ height: '30px', fontSize: '0.74rem', padding: '0 0.6rem' }}
                                    >
                                        Todos ({modalDtes.length})
                                    </button>
                                    <button
                                        onClick={() => setFiltroEstadoDte('pendientes')}
                                        className={`btn ${filtroEstadoDte === 'pendientes' ? 'btn-primary' : 'btn-secondary'}`}
                                        style={{ height: '30px', fontSize: '0.74rem', padding: '0 0.6rem' }}
                                    >
                                        Solo Pendientes ({modalResumen.dtes_pendientes || 0})
                                    </button>
                                    <button
                                        onClick={() => setFiltroEstadoDte('abonos')}
                                        className={`btn ${filtroEstadoDte === 'abonos' ? 'btn-primary' : 'btn-secondary'}`}
                                        style={{ height: '30px', fontSize: '0.74rem', padding: '0 0.6rem' }}
                                    >
                                        Abono Parcial ({modalResumen.dtes_con_abono || 0})
                                    </button>
                                    <button
                                        onClick={() => setFiltroEstadoDte('pagados')}
                                        className={`btn ${filtroEstadoDte === 'pagados' ? 'btn-primary' : 'btn-secondary'}`}
                                        style={{ height: '30px', fontSize: '0.74rem', padding: '0 0.6rem' }}
                                    >
                                        Pagados ({modalResumen.dtes_pagados || 0})
                                    </button>
                                </div>

                                <div style={{ position: 'relative', width: '220px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '8px', top: '8px', color: 'var(--text-muted)' }} />
                                    <input 
                                        type="text"
                                        className="form-control"
                                        placeholder="Buscar DTE o UUID..."
                                        value={searchDte}
                                        onChange={(e) => setSearchDte(e.target.value)}
                                        style={{ height: '30px', fontSize: '0.75rem', paddingLeft: '28px', width: '100%' }}
                                    />
                                </div>
                            </div>

                            {/* Tabla de DTEs */}
                            <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'left', color: 'var(--text-muted)' }}>DOCUMENTO / N° CONTROL</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'left', color: 'var(--text-muted)' }}>FECHA EMISIÓN</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'right', color: 'var(--text-muted)' }}>TOTAL DTE</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'right', color: 'var(--text-muted)' }}>ABONADO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'right', color: 'var(--text-muted)' }}>SALDO RESTANTE</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'center', color: 'var(--text-muted)' }}>PLAZO / VENCIMIENTO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'center', color: 'var(--text-muted)' }}>ESTADO PAGO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'center', color: 'var(--text-muted)' }}>CÓDIGO GENERACIÓN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detalleLoading ? (
                                            <tr>
                                                <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    Consultando DTEs y abonos en base de datos...
                                                </td>
                                            </tr>
                                        ) : dtesFiltrados.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    No se encontraron documentos DTEs para este filtro.
                                                </td>
                                            </tr>
                                        ) : (
                                            dtesFiltrados.map((d, dIdx) => {
                                                const esPagado = d.estado_pago === 'PAGADO' || d.estado_pago === 'PAGADO_CONTADO';
                                                const esParcial = d.estado_pago === 'ABONADO_PARCIAL';
                                                const esPendiente = d.estado_pago === 'PENDIENTE';

                                                return (
                                                    <tr key={dIdx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                                                        <td style={{ padding: '0.4rem 0.5rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                                <span style={{ 
                                                                    fontSize: '0.68rem', 
                                                                    backgroundColor: d.tipo_dte === '03' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                                    color: d.tipo_dte === '03' ? '#06b6d4' : '#10b981',
                                                                    padding: '0.1rem 0.35rem',
                                                                    borderRadius: '4px',
                                                                    fontWeight: 'bold'
                                                                }}>
                                                                    {d.tipo_dte === '03' ? 'CCF' : d.tipo_dte === '01' ? 'FACTURA' : `DTE-${d.tipo_dte}`}
                                                                </span>
                                                                <strong style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                                                    {d.numero_control}
                                                                </strong>
                                                            </div>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                                                {d.sucursal_nombre} • Condición: {d.condicion_operacion}
                                                            </div>
                                                        </td>

                                                        <td style={{ padding: '0.4rem 0.5rem' }}>
                                                            <div>{formatDateDMY(d.fecha_emision)}</div>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                                hace {d.dias_transcurridos} días
                                                            </div>
                                                        </td>

                                                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 'bold' }}>
                                                            ${d.total_pagar?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>

                                                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                                                            <div style={{ color: d.total_abonado > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: d.total_abonado > 0 ? 600 : 'normal' }}>
                                                                ${d.total_abonado?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </div>
                                                            {d.total_pagar > 0 && d.total_abonado > 0 && (
                                                                <div style={{ fontSize: '0.68rem', color: '#10b981' }}>
                                                                    {d.porcentaje_pagado}% cubierto
                                                                </div>
                                                            )}
                                                        </td>

                                                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: esPagado ? '#10b981' : '#ef4444' }}>
                                                            ${d.saldo_pendiente?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>

                                                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                                                            {esPagado ? (
                                                                <span style={{ color: '#10b981', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                    <CheckCheck size={12} /> Liquidado
                                                                </span>
                                                            ) : d.dias_mora > 0 ? (
                                                                <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.72rem' }}>
                                                                    +{d.dias_mora}d mora
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                                    En plazo
                                                                </span>
                                                            )}
                                                        </td>

                                                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                                                            {esPagado ? (
                                                                <span style={{ 
                                                                    backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                                                                    color: '#10b981', 
                                                                    fontSize: '0.7rem', 
                                                                    padding: '0.15rem 0.45rem', 
                                                                    borderRadius: '4px',
                                                                    fontWeight: 'bold',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.2rem'
                                                                }}>
                                                                    <CheckCheck size={11} /> PAGADO
                                                                </span>
                                                            ) : esParcial ? (
                                                                <span style={{ 
                                                                    backgroundColor: 'rgba(245, 158, 11, 0.15)', 
                                                                    color: '#f59e0b', 
                                                                    fontSize: '0.7rem', 
                                                                    padding: '0.15rem 0.45rem', 
                                                                    borderRadius: '4px',
                                                                    fontWeight: 'bold',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.2rem'
                                                                }}>
                                                                    <Clock size={11} /> ABONADO ({d.porcentaje_pagado}%)
                                                                </span>
                                                            ) : (
                                                                <span style={{ 
                                                                    backgroundColor: 'rgba(239, 68, 68, 0.15)', 
                                                                    color: '#ef4444', 
                                                                    fontSize: '0.7rem', 
                                                                    padding: '0.15rem 0.45rem', 
                                                                    borderRadius: '4px',
                                                                    fontWeight: 'bold',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.2rem'
                                                                }}>
                                                                    <AlertTriangle size={11} /> PENDIENTE
                                                                </span>
                                                            )}
                                                        </td>

                                                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                                                            {d.codigo_generacion ? (
                                                                <button
                                                                    onClick={() => handleCopiarCodigoGen(d.codigo_generacion)}
                                                                    className="btn btn-secondary"
                                                                    title={`Copiar UUID: ${d.codigo_generacion}`}
                                                                    style={{ height: '24px', padding: '0 0.4rem', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                                                                >
                                                                    <Copy size={11} />
                                                                    <span style={{ fontFamily: 'monospace' }}>{d.codigo_generacion.substring(0, 8)}...</span>
                                                                </button>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Contenido de Tab: Abonos */}
                    {activeTab === 'abonos' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Registro de recibos y abonos aplicados a la cuenta del cliente ({modalAbonos.length} movimientos).
                            </div>

                            <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'left', color: 'var(--text-muted)' }}>FECHA PAGO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'right', color: 'var(--text-muted)' }}>MONTO ABONADO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'left', color: 'var(--text-muted)' }}>FORMA DE PAGO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'left', color: 'var(--text-muted)' }}>REFERENCIA / RECIBO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'left', color: 'var(--text-muted)' }}>DTE APLICADO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', textAlign: 'left', color: 'var(--text-muted)' }}>NOTAS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detalleLoading ? (
                                            <tr>
                                                <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    Cargando historial de abonos...
                                                </td>
                                            </tr>
                                        ) : modalAbonos.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    No se han registrado abonos o recibos para este cliente todavía.
                                                </td>
                                            </tr>
                                        ) : (
                                            modalAbonos.map((a, aIdx) => (
                                                <tr key={aIdx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.78rem' }}>
                                                    <td style={{ padding: '0.4rem 0.5rem' }}>
                                                        <strong>{formatDateDMY(a.fecha_pago)}</strong>
                                                    </td>
                                                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                                                        +${a.monto?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td style={{ padding: '0.4rem 0.5rem' }}>
                                                        <span style={{ 
                                                            fontSize: '0.7rem', 
                                                            backgroundColor: 'var(--bg-card)', 
                                                            border: '1px solid var(--border-color)', 
                                                            padding: '0.1rem 0.4rem', 
                                                            borderRadius: '4px' 
                                                        }}>
                                                            {a.metodo_pago}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace' }}>
                                                        {a.referencia}
                                                    </td>
                                                    <td style={{ padding: '0.4rem 0.5rem' }}>
                                                        {a.numero_control ? (
                                                            <span style={{ 
                                                                fontSize: '0.7rem', 
                                                                backgroundColor: 'rgba(6, 182, 212, 0.12)', 
                                                                color: '#06b6d4', 
                                                                padding: '0.1rem 0.35rem', 
                                                                borderRadius: '4px',
                                                                fontWeight: 'bold',
                                                                fontFamily: 'monospace'
                                                            }}>
                                                                {a.numero_control}
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                                Abono a Cuenta General
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                        {a.notas || '—'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
