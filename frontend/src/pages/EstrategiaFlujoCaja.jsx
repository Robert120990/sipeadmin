import React, { useState, useEffect } from 'react';
import { 
    DollarSign, Calendar, TrendingUp, TrendingDown, AlertTriangle, 
    CheckCircle2, RefreshCw, Layers, ArrowRight, ShieldCheck, ChevronRight
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';

export default function EstrategiaFlujoCaja() {
    const { addToast } = useToast();

    const [horizonte, setHorizonte] = useState(30);
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filtroEstado, setFiltroEstado] = useState('todos');

    const fetchForecast = async (dias = horizonte) => {
        setLoading(true);
        try {
            const res = await api.get(`/inteligencia/flujo-caja-proyectado?dias=${dias}`);
            setForecastData(res.data);
        } catch (error) {
            console.error('Error fetching cashflow forecast:', error);
            addToast('Error al cargar la proyección de flujo de caja', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchForecast(horizonte);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [horizonte]);

    const kpi = forecastData?.kpi || {};
    const timeline = forecastData?.timeline || [];
    const brechas = forecastData?.brechas_liquidez || [];
    const recomendaciones = forecastData?.recomendaciones || [];

    const timelineFiltrado = timeline.filter(t => {
        if (filtroEstado === 'deficit') return t.estado === 'deficit';
        if (filtroEstado === 'reserva_baja') return t.estado === 'reserva_baja';
        return true;
    });

    // Calcular coordenadas SVG para el gráfico de saldo
    const renderMiniChart = () => {
        if (!timeline.length) return null;
        const width = 800;
        const height = 140;
        const padding = 20;

        const saldos = timeline.map(t => t.saldo_final_proyectado);
        const minVal = Math.min(0, ...saldos);
        const maxVal = Math.max(...saldos, 100000);
        const range = maxVal - minVal || 1;

        const points = timeline.map((t, idx) => {
            const x = padding + (idx / (timeline.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((t.saldo_final_proyectado - minVal) / range) * (height - 2 * padding);
            return `${x},${y}`;
        }).join(' ');

        const zeroY = height - padding - ((0 - minVal) / range) * (height - 2 * padding);

        return (
            <div style={{ width: '100%', overflowX: 'auto', padding: '0.5rem 0' }}>
                <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '600px', height: '140px', overflow: 'visible' }}>
                    {/* Línea de Cero / Déficit */}
                    {minVal < 0 && (
                        <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="#ef4444" strokeDasharray="4" strokeWidth="1.5" />
                    )}

                    {/* Línea de Trayectoria de Saldo */}
                    <polyline fill="none" stroke="var(--primary)" strokeWidth="2.5" points={points} />

                    {/* Puntos clave */}
                    {timeline.map((t, idx) => {
                        const x = padding + (idx / (timeline.length - 1)) * (width - 2 * padding);
                        const y = height - padding - ((t.saldo_final_proyectado - minVal) / range) * (height - 2 * padding);
                        const isDeficit = t.estado === 'deficit';

                        if (idx % 5 === 0 || isDeficit || idx === timeline.length - 1) {
                            return (
                                <g key={idx}>
                                    <circle cx={x} cy={y} r={isDeficit ? 4 : 3} fill={isDeficit ? '#ef4444' : 'var(--primary)'} />
                                    <text x={x} y={y - 8} fontSize="9" fill={isDeficit ? '#ef4444' : 'var(--text-muted)'} textAnchor="middle" fontWeight="bold">
                                        ${Math.round(t.saldo_final_proyectado / 1000)}k
                                    </text>
                                </g>
                            );
                        }
                        return null;
                    })}
                </svg>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <DollarSign size={22} color="#10b981" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Flujo de Caja Predictivo</h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Proyección de liquidez a {horizonte} días considerando ventas, deuda bancaria, nómina y compras
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'inline-flex', backgroundColor: 'var(--border-color)', borderRadius: '8px', padding: '2px' }}>
                        <button
                            onClick={() => setHorizonte(30)}
                            style={{
                                background: horizonte === 30 ? 'var(--primary)' : 'transparent',
                                color: horizonte === 30 ? '#fff' : 'var(--text-muted)',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            30 Días
                        </button>
                        <button
                            onClick={() => setHorizonte(60)}
                            style={{
                                background: horizonte === 60 ? 'var(--primary)' : 'transparent',
                                color: horizonte === 60 ? '#fff' : 'var(--text-muted)',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            60 Días
                        </button>
                    </div>

                    <button 
                        onClick={() => fetchForecast(horizonte)}
                        className="btn btn-secondary"
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} /> Actualizar
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', 
                gap: '0.85rem' 
            }}>
                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Saldo Inicial en Bancos
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.2rem' }}>
                        ${kpi.saldo_inicial_bancos?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#10b981' }}>
                        Posición de caja actual
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: kpi.saldo_minimo_proyectado < 0 ? '4px solid #ef4444' : '4px solid #10b981' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Saldo Mínimo Proyectado
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: kpi.saldo_minimo_proyectado < 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                        ${kpi.saldo_minimo_proyectado?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Fecha estimada: {kpi.fecha_saldo_minimo || 'N/A'}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Total Ingresos ({horizonte}d)
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#3b82f6', marginTop: '0.2rem' }}>
                        ${kpi.total_ingresos_proyectados?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Ventas combustible + tienda
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Total Egresos ({horizonte}d)
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '0.2rem' }}>
                        ${kpi.total_egresos_proyectados?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Compras, cuotas, nóminas
                    </div>
                </div>
            </div>

            {/* Recomendaciones / Alertas de Brecha */}
            {recomendaciones.length > 0 && (
                <div className="card glass" style={{ padding: '0.85rem 1.15rem' }}>
                    {recomendaciones.map((r, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                            {r.tipo === 'alerta_critica' ? (
                                <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                            ) : (
                                <ShieldCheck size={18} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
                            )}
                            <div style={{ fontSize: '0.825rem' }}>
                                <strong style={{ color: r.tipo === 'alerta_critica' ? '#ef4444' : '#10b981' }}>{r.titulo}: </strong>
                                <span>{r.detalle} </span>
                                <em style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.15rem' }}>Acción recomendada: {r.accion_sugerida}</em>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Gráfico de Evolución de Saldo Proyectado */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <TrendingUp size={16} color="var(--primary)" /> Curva de Liquidez Proyectada ({horizonte} Días)
                </h3>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                        Generando modelo predictivo de caja...
                    </div>
                ) : (
                    renderMiniChart()
                )}
            </div>

            {/* Tabla Detallada Día a Día */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Calendar size={16} color="var(--primary)" /> Detalle Diario del Flujo
                    </h3>

                    <select 
                        value={filtroEstado} 
                        onChange={(e) => setFiltroEstado(e.target.value)}
                        className="form-control"
                        style={{ height: '36px', fontSize: '0.825rem', width: 'auto' }}
                    >
                        <option value="todos">Todos los Días</option>
                        <option value="deficit">Solo Días con Déficit</option>
                        <option value="reserva_baja">Días con Reserva Baja (&lt;$15k)</option>
                    </select>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>FECHA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>SALDO INICIAL</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>INGRESOS</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>COMPRAS COMB.</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>PRESTAMOS / GASTOS</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>TOTAL EGRESOS</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>FLUJO NETO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>SALDO FINAL</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>ESTADO</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Calculando proyección...
                                    </td>
                                </tr>
                            ) : timelineFiltrado.length === 0 ? (
                                <tr>
                                    <td colSpan="9" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        No hay registros que coincidan con el filtro.
                                    </td>
                                </tr>
                            ) : (
                                timelineFiltrado.map((d, idx) => {
                                    const esDeficit = d.estado === 'deficit';
                                    const esBajo = d.estado === 'reserva_baja';

                                    let badgeColor = '#10b981';
                                    let badgeBg = 'rgba(16, 185, 129, 0.15)';
                                    let badgeText = 'SOLVENTE';
                                    if (esDeficit) {
                                        badgeColor = '#ef4444';
                                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                                        badgeText = 'DÉFICIT';
                                    } else if (esBajo) {
                                        badgeColor = '#f59e0b';
                                        badgeBg = 'rgba(245, 158, 11, 0.15)';
                                        badgeText = 'RESERVA BAJA';
                                    }

                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <strong>{d.fecha}</strong>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'block' }}>{d.dia_semana}</span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                ${d.saldo_inicial?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>
                                                +${d.ingresos.total?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                -${d.egresos.combustible?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                {d.egresos.prestamos > 0 && (
                                                    <span style={{ color: '#f59e0b', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                                                        Cuota: -${d.egresos.prestamos?.toLocaleString()}
                                                    </span>
                                                )}
                                                {d.egresos.nomina > 0 && (
                                                    <span style={{ color: '#8b5cf6', display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                                                        Nómina: -${d.egresos.nomina?.toLocaleString()}
                                                    </span>
                                                )}
                                                {d.egresos.recordatorios > 0 && (
                                                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>
                                                        Fijos: -${d.egresos.recordatorios?.toLocaleString()}
                                                    </span>
                                                )}
                                                {d.egresos.prestamos === 0 && d.egresos.nomina === 0 && d.egresos.recordatorios === 0 && (
                                                    <span style={{ color: 'var(--text-muted)' }}>$0</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>
                                                -${d.egresos.total?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: d.flujo_neto_dia >= 0 ? '#10b981' : '#ef4444' }}>
                                                {d.flujo_neto_dia >= 0 ? `+$${d.flujo_neto_dia?.toLocaleString()}` : `-$${Math.abs(d.flujo_neto_dia)?.toLocaleString()}`}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: d.saldo_final_proyectado < 0 ? '#ef4444' : 'var(--text)' }}>
                                                ${d.saldo_final_proyectado?.toLocaleString()}
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
