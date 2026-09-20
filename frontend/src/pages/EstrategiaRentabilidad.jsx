import React, { useState, useEffect } from 'react';
import { 
    TrendingUp, DollarSign, Fuel, ShoppingBag, Droplets, 
    RefreshCw, Calendar, ArrowRight, Award, AlertCircle
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateDMY } from '../utils/date';

export default function EstrategiaRentabilidad() {
    const { addToast } = useToast();

    // Fechas por defecto: últimos 30 días
    const getDefaultDates = () => {
        const now = new Date();
        const hasta = now.toISOString().split('T')[0];
        const prev = new Date(now);
        prev.setDate(prev.getDate() - 30);
        const desde = prev.toISOString().split('T')[0];
        return { desde, hasta };
    };

    const [{ desde, hasta }, setDates] = useState(getDefaultDates);
    const [pnlData, setPnlData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchRentabilidad = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/inteligencia/rentabilidad-estaciones?desde=${desde}&hasta=${hasta}`);
            setPnlData(res.data);
        } catch (error) {
            console.error('Error fetching rentabilidad:', error);
            addToast('Error al calcular el P&L y rentabilidad por estación', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRentabilidad();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const resumen = pnlData?.resumen_consolidado || {};
    const estaciones = pnlData?.estaciones || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <TrendingUp size={22} color="#8b5cf6" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Rentabilidad Operativa & P&L por Estación</h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Estado de resultados operativo, margen por galón despachado y punto de equilibrio • Período: {formatDateDMY(desde)} al {formatDateDMY(hasta)}
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
                        onClick={fetchRentabilidad}
                        className="btn btn-primary"
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} /> Calcular P&L
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
                        Volumen Despachado
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.2rem' }}>
                        {resumen.galones_totales?.toLocaleString() || 0} gal
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#8b5cf6' }}>
                        En {pnlData?.periodo?.dias || 30} días analizados ({formatDateDMY(desde)} al {formatDateDMY(hasta)})
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Margen Bruto Total
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#3b82f6', marginTop: '0.2rem' }}>
                        ${resumen.margen_bruto_total?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Combustible + Tiendas + Lubricantes
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: resumen.utilidad_operativa_total >= 0 ? '4px solid #10b981' : '4px solid #ef4444' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Utilidad Operativa Neta
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: resumen.utilidad_operativa_total >= 0 ? '#10b981' : '#ef4444', marginTop: '0.2rem' }}>
                        ${resumen.utilidad_operativa_total?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        EBITDA operativo de estaciones
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Margen Neto Promedio
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.2rem' }}>
                        ${resumen.margen_neto_promedio_galon || 0} /gal
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Retorno neto por galón despachado
                    </div>
                </div>
            </div>

            {/* Tabla P&L por Estación */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Fuel size={18} color="var(--primary)" /> Desglose Financiero y Punto de Equilibrio por Punto de Venta
                    </h3>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>GALONES</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>MARGEN COMB. ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>MARGEN TIENDA ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>MARGEN BRUTO ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>GASTOS OPEX ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>UTILIDAD NETA ($)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>NETO/GAL</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>PTO. EQUILIBRIO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>CATEGORÍA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Calculando P&L operativo...
                                    </td>
                                </tr>
                            ) : estaciones.length === 0 ? (
                                <tr>
                                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        No se encontraron registros de ventas en este período.
                                    </td>
                                </tr>
                            ) : (
                                estaciones.map((e, idx) => {
                                    const esEstrella = e.clasificacion === 'estrella';
                                    const esPerdida = e.clasificacion === 'en_perdida';

                                    let badgeColor = '#10b981';
                                    let badgeBg = 'rgba(16, 185, 129, 0.15)';
                                    let badgeText = 'RENTABLE';
                                    if (esEstrella) {
                                        badgeColor = '#8b5cf6';
                                        badgeBg = 'rgba(139, 92, 246, 0.15)';
                                        badgeText = 'ESTRELLA';
                                    } else if (esPerdida) {
                                        badgeColor = '#ef4444';
                                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                                        badgeText = 'EN PÉRDIDA';
                                    }

                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                                {e.estacion}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                {e.galones_vendidos?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                ${e.margenes_brutos.combustible?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                ${e.margenes_brutos.tienda?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: '#3b82f6' }}>
                                                ${e.margenes_brutos.total?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#ef4444' }}>
                                                -${e.gastos_operativos.total?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: e.utilidad_operativa_neta >= 0 ? '#10b981' : '#ef4444' }}>
                                                ${e.utilidad_operativa_neta?.toLocaleString()}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--primary)' }}>
                                                ${e.margen_neto_por_galon}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                {e.punto_equilibrio_galones?.toLocaleString()} gal
                                                <span style={{ display: 'block', fontSize: '0.72rem', color: e.superavit_punto_equilibrio >= 0 ? '#10b981' : '#ef4444' }}>
                                                    {e.superavit_punto_equilibrio >= 0 ? `+${e.superavit_punto_equilibrio?.toLocaleString()} superávit` : `${e.superavit_punto_equilibrio?.toLocaleString()} déficit`}
                                                </span>
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
