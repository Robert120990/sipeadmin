import React, { useState, useEffect } from 'react';
import { 
    CheckCircle2, AlertTriangle, ShieldAlert, RefreshCw, 
    Search, DollarSign, Users, AlertOctagon, Copy
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateDMY } from '../utils/date';

export default function EstrategiaCreditos() {
    const { addToast } = useToast();

    const [carteraData, setCarteraData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filtroRiesgo, setFiltroRiesgo] = useState('todos');
    const [search, setSearch] = useState('');

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
                                                {c.cliente}
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
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
