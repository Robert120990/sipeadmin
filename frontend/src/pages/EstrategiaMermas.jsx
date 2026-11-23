import React, { useState, useEffect } from 'react';
import {
    ShieldAlert, AlertTriangle, RefreshCw, Droplet, Landmark, Receipt, Flame
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateDMY, todayStr, offsetDaysStr } from '../utils/date';
import EstrategiaNav from '../components/EstrategiaNav';

export default function EstrategiaMermas() {
    const { addToast } = useToast();

    const getDefaultDates = () => ({
        desde: offsetDaysStr(-7),
        hasta: todayStr()
    });

    const [{ desde, hasta }, setDates] = useState(getDefaultDates);
    const [vistaActiva, setVistaActiva] = useState('mermas');
    const [auditData, setAuditData] = useState(null);
    const [transitoData, setTransitoData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filtroSeveridad, setFiltroSeveridad] = useState('todas');

    const fetchAuditorias = async () => {
        setLoading(true);
        try {
            const d1 = new Date(desde);
            const d2 = new Date(hasta);
            const diasVentana = Math.max(7, Math.min(60, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1 || 14));

            const [mermasRes, transitoRes] = await Promise.allSettled([
                api.get(`/inteligencia/mermas-auditoria?desde=${desde}&hasta=${hasta}`),
                api.get(`/inteligencia/auditoria-transito?dias=${Math.max(14, diasVentana)}`)
            ]);

            if (mermasRes.status === 'fulfilled') {
                setAuditData(mermasRes.value.data);
            } else {
                addToast('Error al auditar mermas de combustible', 'error');
            }

            if (transitoRes.status === 'fulfilled') {
                setTransitoData(transitoRes.value.data);
            }
        } catch (error) {
            console.error('Error fetching auditorías:', error);
            addToast('Error al cargar paneles de auditoría operativa', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAuditorias();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resumen = auditData?.resumen || {};
    const auditorias = auditData?.auditorias || [];
    const rachasMicroMerma = auditData?.rachas_micro_merma || [];

    const transitoResumen = transitoData?.resumen || {};
    const remesasEnTransito = transitoData?.remesas_en_transito || [];
    const valesPendientes72h = transitoData?.vales_pendientes_72h || [];

    const auditoriasFiltradas = auditorias.filter(a => {
        if (filtroSeveridad === 'critico') return a.estado === 'critico';
        if (filtroSeveridad === 'advertencia') return a.estado === 'advertencia';
        if (filtroSeveridad === 'racha') return (a.dias_racha_negativa || 0) >= 3;
        return true;
    });

    const totalAlertasMermas = (resumen.alertas_criticas || 0) + rachasMicroMerma.length;
    const totalAlertasTransito = (transitoResumen.partidas_transito_count || 0) + (valesPendientes72h.length > 0 ? 1 : 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            <EstrategiaNav />

            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <ShieldAlert size={22} color="#ef4444" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Auditoría de Mermas, Dinero en Tránsito y Vales</h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Control físico de dispensadores, rachas silenciosas, cruce Pista ↔ Bancos (&gt;48h) y vales sin DTE (&gt;72h) • {formatDateDMY(desde)} al {formatDateDMY(hasta)}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                        type="date"
                        className="form-control"
                        value={desde}
                        onChange={(e) => setDates(prev => ({ ...prev, desde: e.target.value }))}
                        style={{ height: '36px', fontSize: '0.825rem', width: '132px' }}
                    />
                    <input
                        type="date"
                        className="form-control"
                        value={hasta}
                        onChange={(e) => setDates(prev => ({ ...prev, hasta: e.target.value }))}
                        style={{ height: '36px', fontSize: '0.825rem', width: '132px' }}
                    />
                    <button
                        onClick={fetchAuditorias}
                        className="btn btn-primary"
                        style={{ height: '36px', padding: '0 1.15rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} /> Auditar
                    </button>
                </div>
            </div>

            {/* Selector Compacto de Vista */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => setVistaActiva('mermas')}
                    className={vistaActiva === 'mermas' ? 'btn btn-primary' : 'btn btn-secondary'}
                    style={{ height: '36px', padding: '0 1rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                    <Droplet size={15} /> Mermas & Micro-Fugas en Pista
                    {totalAlertasMermas > 0 && (
                        <span style={{
                            backgroundColor: vistaActiva === 'mermas' ? 'rgba(255,255,255,0.25)' : 'rgba(239, 68, 68, 0.18)',
                            color: vistaActiva === 'mermas' ? '#fff' : '#ef4444',
                            fontSize: '0.7rem',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '999px',
                            fontWeight: 700
                        }}>
                            {totalAlertasMermas}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setVistaActiva('transito')}
                    className={vistaActiva === 'transito' ? 'btn btn-primary' : 'btn btn-secondary'}
                    style={{ height: '36px', padding: '0 1rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                    <Landmark size={15} /> Dinero en Tránsito (&gt;48h) & Vales sin DTE (&gt;72h)
                    {totalAlertasTransito > 0 && (
                        <span style={{
                            backgroundColor: vistaActiva === 'transito' ? 'rgba(255,255,255,0.25)' : 'rgba(245, 158, 11, 0.2)',
                            color: vistaActiva === 'transito' ? '#fff' : '#f59e0b',
                            fontSize: '0.7rem',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '999px',
                            fontWeight: 700
                        }}>
                            {totalAlertasTransito}
                        </span>
                    )}
                </button>
            </div>

            {vistaActiva === 'mermas' ? (
                <>
                    {/* KPI Cards Mermas */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
                        gap: '0.85rem'
                    }}>
                        <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: resumen.costo_total_perdida_usd > 1000 ? '4px solid #ef4444' : '4px solid #10b981' }}>
                            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Costo Total de Mermas
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: resumen.costo_total_perdida_usd > 1000 ? '#ef4444' : 'var(--text)', marginTop: '0.2rem' }}>
                                ${resumen.costo_total_perdida_usd?.toLocaleString() || 0} USD
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {resumen.total_galones_perdidos?.toLocaleString() || 0} gal • Costo real factura + flete
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Alertas Críticas (&gt;0.50%)
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: resumen.alertas_criticas > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                                {resumen.alertas_criticas || 0}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Superan tolerancia reglamentaria
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: rachasMicroMerma.length > 0 ? '4px solid #f59e0b' : '4px solid #10b981' }}>
                            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Rachas Micro-Merma (3+ días)
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: rachasMicroMerma.length > 0 ? '#f59e0b' : '#10b981', marginTop: '0.2rem' }}>
                                {rachasMicroMerma.length}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Deriva negativa diaria consecutiva
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Estatus de Pista
                            </div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: resumen.alertas_criticas > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                                {resumen.estatus_general || 'CONTROLADO'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Tolerancia técnica máxima ±0.25%
                            </div>
                        </div>
                    </div>

                    {/* Panel de Rachas de Micro-Merma Silenciosa */}
                    {rachasMicroMerma.length > 0 && (
                        <div className="card glass" style={{ padding: '0.9rem 1.15rem', borderLeft: '4px solid #f59e0b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.55rem', flexWrap: 'wrap' }}>
                                <Flame size={18} color="#f59e0b" />
                                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>
                                    Detección de Micro-Mermas Acumuladas Silenciosas (3+ días consecutivos de faltante)
                                </h3>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.65rem' }}>
                                {rachasMicroMerma.map((r, idx) => (
                                    <div key={idx} style={{
                                        padding: '0.6rem 0.75rem',
                                        borderRadius: '8px',
                                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                                        border: '1px solid rgba(245, 158, 11, 0.25)',
                                        fontSize: '0.78rem'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            <strong>{r.estacion} • {r.nombre_combustible}</strong>
                                            <span style={{
                                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                                color: '#ef4444',
                                                fontSize: '0.7rem',
                                                padding: '0.1rem 0.4rem',
                                                borderRadius: '4px',
                                                fontWeight: 700
                                            }}>
                                                {r.dias_consecutivos}d seguidos
                                            </span>
                                        </div>
                                        <div style={{ marginTop: '0.25rem', color: 'var(--text)' }}>
                                            Faltante acumulado: <strong>-{r.galones_acumulados_perdidos} gal</strong> (${r.impacto_acumulado_usd?.toLocaleString()}) • Prom: {r.variacion_promedio_diaria_pct}%/día
                                        </div>
                                        <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {r.diagnostico}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tabla de Auditoría de Mermas */}
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
                                <option value="todas">Todos los Estados ({auditorias.length})</option>
                                <option value="critico">Solo Críticos (&gt;0.50%)</option>
                                <option value="advertencia">Solo Advertencias (0.25% - 0.50%)</option>
                                <option value="racha">Con Racha Negativa (3+ días)</option>
                            </select>
                        </div>

                        <div className="table-responsive">
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '960px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>COMBUSTIBLE</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>INICIAL</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>RECARGAS</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>VENTA REG.</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>FINAL TEÓRICO</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>FINAL FÍSICO</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>DIF. (GAL)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>% MERMA</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>IMPACTO ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>ESTADO</th>
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
                                            const racha = a.dias_racha_negativa || 0;

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
                                                        ${Math.abs(a.impacto_usd || 0).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
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
                                                            {racha >= 3 && (
                                                                <span style={{
                                                                    backgroundColor: 'rgba(245, 158, 11, 0.16)',
                                                                    color: '#f59e0b',
                                                                    fontSize: '0.7rem',
                                                                    padding: '0.12rem 0.38rem',
                                                                    borderRadius: '4px',
                                                                    fontWeight: 700
                                                                }} title="Días consecutivos con micro-merma negativa">
                                                                    {racha}d racha
                                                                </span>
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
                </>
            ) : (
                <>
                    {/* KPI Cards Dinero en Tránsito y Vales */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))',
                        gap: '0.85rem'
                    }}>
                        <div className="card glass" style={{
                            padding: '0.85rem 1rem',
                            borderLeft: (transitoResumen.efectivo_en_transito_48h_usd || 0) > 0 ? '4px solid #ef4444' : '4px solid #10b981'
                        }}>
                            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Efectivo / POS &gt;48h en Tránsito
                            </div>
                            <div style={{
                                fontSize: '1.35rem',
                                fontWeight: 'bold',
                                color: (transitoResumen.efectivo_en_transito_48h_usd || 0) > 0 ? '#ef4444' : '#10b981',
                                marginTop: '0.2rem'
                            }}>
                                ${transitoResumen.efectivo_en_transito_48h_usd?.toLocaleString() || 0}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {transitoResumen.partidas_transito_count || 0} cierres pendientes de conciliar en banco
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Abonos Bancarios Identificados
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#3b82f6', marginTop: '0.2rem' }}>
                                ${transitoResumen.abonos_bancos_identificados_usd?.toLocaleString() || 0}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Pista: ${(transitoResumen.efectivo_remesado_pista_usd || 0).toLocaleString()} remesas + ${(transitoResumen.pos_tarjetas_pista_usd || 0).toLocaleString()} POS
                            </div>
                        </div>

                        <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Comisión Bancaria POS Est.
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#8b5cf6', marginTop: '0.2rem' }}>
                                ${transitoResumen.comision_pos_estimada_usd?.toLocaleString() || 0}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Tasa de referencia adquiriente (~1.85%)
                            </div>
                        </div>

                        <div className="card glass" style={{
                            padding: '0.85rem 1rem',
                            borderLeft: (transitoResumen.vales_sin_facturar_72h_usd || 0) > 0 ? '4px solid #f59e0b' : '4px solid #10b981'
                        }}>
                            <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Vales en Pista &gt;72h sin DTE
                            </div>
                            <div style={{
                                fontSize: '1.35rem',
                                fontWeight: 'bold',
                                color: (transitoResumen.vales_sin_facturar_72h_usd || 0) > 0 ? '#f59e0b' : '#10b981',
                                marginTop: '0.2rem'
                            }}>
                                ${transitoResumen.vales_sin_facturar_72h_usd?.toLocaleString() || 0}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {transitoResumen.vales_sin_facturar_count || 0} lotes pendientes de facturación fiscal
                            </div>
                        </div>
                    </div>

                    {/* Tabla 1: Remesas y Lotes POS >48h en Tránsito */}
                    <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Landmark size={18} color="#3b82f6" /> Cruce Pista ↔ Bancos: Efectivo y Lotes POS con &gt;48h en Tránsito
                            </h3>
                            <span style={{
                                fontSize: '0.72rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontWeight: 700,
                                backgroundColor: remesasEnTransito.length === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: remesasEnTransito.length === 0 ? '#10b981' : '#f59e0b'
                            }}>
                                {transitoResumen.estatus_auditoria || 'CONCILIACIÓN AL DÍA'}
                            </span>
                        </div>

                        <div className="table-responsive">
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '880px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>FECHA TURNO</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>ANTIGÜEDAD</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>REMESA PISTA ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>TARJETAS POS ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>ABONO BANCO EST. ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>EN TRÁNSITO ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>ESTADO</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="8" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                                Cruzando cierres de pista contra extractos bancarios...
                                            </td>
                                        </tr>
                                    ) : remesasEnTransito.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" style={{ padding: '1.5rem', textAlign: 'center', color: '#10b981', fontSize: '0.825rem', fontWeight: 600 }}>
                                                Sin remesas ni lotes POS retenidos mayores a 48 horas. Conciliación bancaria al día.
                                            </td>
                                        </tr>
                                    ) : (
                                        remesasEnTransito.map((rt, idx) => {
                                            const crit = rt.severidad === 'critico';
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{rt.estacion}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>{formatDateDMY(rt.fecha_turno)}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 700, color: crit ? '#ef4444' : '#f59e0b' }}>
                                                        {rt.dias_transito} días
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                        ${rt.remesa_pista_usd?.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                        ${rt.pos_pista_usd?.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#10b981' }}>
                                                        ${rt.abono_bancario_estimado_usd?.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: crit ? '#ef4444' : '#f59e0b' }}>
                                                        ${rt.pendiente_conciliar_usd?.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                        <span style={{
                                                            backgroundColor: crit ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                            color: crit ? '#ef4444' : '#f59e0b',
                                                            fontSize: '0.72rem',
                                                            padding: '0.15rem 0.45rem',
                                                            borderRadius: '4px',
                                                            fontWeight: 700,
                                                            display: 'inline-block'
                                                        }}>
                                                            {crit ? 'CRÍTICO >96H' : 'EN TRÁNSITO'}
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

                    {/* Tabla 2: Vales de Crédito en Pista >72h sin Factura Fiscal DTE */}
                    <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Receipt size={18} color="#f59e0b" /> Vales y Créditos de Pista con &gt;72h Pendientes de Facturación DTE
                            </h3>
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Evita desfase de cobro e IVA al cierre mensual
                            </span>
                        </div>

                        <div className="table-responsive">
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>FECHA TURNO</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'left', color: 'var(--text-muted)' }}>CLIENTE / FLOTA</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>CANT. VALES</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'right', color: 'var(--text-muted)' }}>MONTO PENDIENTE ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', textAlign: 'center', color: 'var(--text-muted)' }}>ANTIGÜEDAD</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                                Verificando vales de pista frente a emisión de DTEs...
                                            </td>
                                        </tr>
                                    ) : valesPendientes72h.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '1.5rem', textAlign: 'center', color: '#10b981', fontSize: '0.825rem', fontWeight: 600 }}>
                                                Todos los vales de crédito con más de 72 horas cuentan con documento emitido.
                                            </td>
                                        </tr>
                                    ) : (
                                        valesPendientes72h.map((v, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{v.estacion}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>{formatDateDMY(v.fecha_turno)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>{v.cliente}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>{v.cantidad_vales}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                                                    ${v.monto_usd?.toLocaleString()}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        backgroundColor: v.dias_antiguedad >= 7 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                        color: v.dias_antiguedad >= 7 ? '#ef4444' : '#f59e0b',
                                                        fontSize: '0.72rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 700,
                                                        display: 'inline-block'
                                                    }}>
                                                        <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} />
                                                        {v.dias_antiguedad}d sin DTE
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
