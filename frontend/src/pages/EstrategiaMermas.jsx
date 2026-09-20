import React, { useState, useEffect } from 'react';
import { 
    ShieldAlert, AlertTriangle, CheckCircle2, RefreshCw, 
    Calendar, DollarSign, Droplet, ArrowRight, Wrench, HelpCircle
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

export default function EstrategiaMermas() {
    const { addToast } = useToast();

    // Fechas por defecto: últimos 7 días
    const getDefaultDates = () => {
        const now = new Date();
        const hasta = now.toISOString().split('T')[0];
        const prev = new Date(now);
        prev.setDate(prev.getDate() - 7);
        const desde = prev.toISOString().split('T')[0];
        return { desde, hasta };
    };

    const [{ desde, hasta }, setDates] = useState(getDefaultDates);
    const [auditData, setAuditData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filtroSeveridad, setFiltroSeveridad] = useState('todas');

    const fetchMermas = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/inteligencia/mermas-auditoria?desde=${desde}&hasta=${hasta}`);
            setAuditData(res.data);
        } catch (error) {
            console.error('Error fetching mermas:', error);
            addToast('Error al auditar mermas de combustible', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMermas();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resumen = auditData?.resumen || {};
    const auditorias = auditData?.auditorias || [];

    const auditoriasFiltradas = auditorias.filter(a => {
        if (filtroSeveridad === 'critico') return a.estado === 'critico';
        if (filtroSeveridad === 'advertencia') return a.estado === 'advertencia';
        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <ShieldAlert size={22} color="#ef4444" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Auditoría de Mermas y Fugas en Pista</h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Monitoreo de diferencias físicas vs lecturas de dispensador y detección de descalibración
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input 
                        type="date" 
                        className="form-control"
                        value={desde}
                        onChange={(e) => setDates(prev => ({ ...prev, desde: e.target.value }))}
                        style={{ height: '36px', fontSize: '0.825rem', width: '135px' }}
                    />
                    <input 
                        type="date" 
                        className="form-control"
                        value={hasta}
                        onChange={(e) => setDates(prev => ({ ...prev, hasta: e.target.value }))}
                        style={{ height: '36px', fontSize: '0.825rem', width: '135px' }}
                    />
                    <button 
                        onClick={fetchMermas}
                        className="btn btn-primary"
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} /> Consultar
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', 
                gap: '0.85rem' 
            }}>
                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: resumen.costo_total_perdida_usd > 1000 ? '4px solid #ef4444' : '4px solid #10b981' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Costo Total de Mermas
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: resumen.costo_total_perdida_usd > 1000 ? '#ef4444' : 'var(--text)', marginTop: '0.2rem' }}>
                        ${resumen.costo_total_perdida_usd?.toLocaleString() || 0} USD
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {resumen.total_galones_perdidos?.toLocaleString() || 0} galones en el período
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Alertas Críticas (&gt;0.50%)
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: resumen.alertas_criticas > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                        {resumen.alertas_criticas || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Superan tolerancia reglamentaria
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Estatus de Pista
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: resumen.alertas_criticas > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                        {resumen.estatus_general || 'CONTROLADO'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Evaluación integral de estaciones
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Tolerancia Técnica
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.2rem' }}>
                        ±0.25% Máx
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Rango de expansión térmica
                    </div>
                </div>
            </div>

            {/* Tabla de Auditoría */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Droplet size={18} color="#ef4444" /> Comparativa de Faltantes y Sobrantes por Estación
                    </h3>

                    <select 
                        value={filtroSeveridad} 
                        onChange={(e) => setFiltroSeveridad(e.target.value)}
                        className="form-control"
                        style={{ height: '36px', fontSize: '0.825rem', width: 'auto' }}
                    >
                        <option value="todas">Todos los Estados</option>
                        <option value="critico">Solo Críticos (&gt;0.50%)</option>
                        <option value="advertencia">Solo Advertencias (0.25% - 0.50%)</option>
                    </select>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>COMBUSTIBLE</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>INICIAL</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>RECARGAS</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>VENTA REGISTRADA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>FINAL TEÓRICO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>FINAL FÍSICO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>DIFERENCIA (GAL)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>% MERMA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>IMPACTO ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>ESTADO</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="11" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Auditando movimientos y lecturas físicas...
                                    </td>
                                </tr>
                            ) : auditoriasFiltradas.length === 0 ? (
                                <tr>
                                    <td colSpan="11" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        No se encontraron registros de diferencias en este rango.
                                    </td>
                                </tr>
                            ) : (
                                auditoriasFiltradas.map((a, idx) => {
                                    const esCritico = a.estado === 'critico';
                                    const esAdvertencia = a.estado === 'advertencia';

                                    let badgeColor = '#10b981';
                                    let badgeBg = 'rgba(16, 185, 129, 0.15)';
                                    let badgeText = 'NORMAL';
                                    if (esCritico) {
                                        badgeColor = '#ef4444';
                                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                                        badgeText = 'CRÍTICO';
                                    } else if (esAdvertencia) {
                                        badgeColor = '#f59e0b';
                                        badgeBg = 'rgba(245, 158, 11, 0.15)';
                                        badgeText = 'ALERTA';
                                    }

                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{a.estacion}</td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>{a.nombre_combustible}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{a.inicial?.toLocaleString()}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#10b981' }}>+{a.recargas?.toLocaleString()}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{a.venta?.toLocaleString()}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{a.teorico?.toLocaleString()}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{a.final_fisico?.toLocaleString()}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: a.diferencia_galones < 0 ? '#ef4444' : '#10b981' }}>
                                                {a.diferencia_galones > 0 ? `+${a.diferencia_galones}` : a.diferencia_galones}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 'bold', color: badgeColor }}>
                                                {a.porcentaje_variacion}%
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: a.impacto_usd < 0 ? '#ef4444' : '#10b981' }}>
                                                ${Math.abs(a.impacto_usd)?.toLocaleString()}
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
