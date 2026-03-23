import React, { useState, useEffect } from 'react';
import { Calendar, AlertCircle, ArrowRight, DollarSign, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Dashboard = () => {
    const [weeklyPayments, setWeeklyPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            console.log('Fetching dashboard from:', api.defaults.baseURL);
            const res = await api.get('/dashboard/vencimientos');
            console.log('Dashboard Data Received:', res.data);
            setWeeklyPayments(res.data || []);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const getStatusInfo = (dateStr) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const vence = new Date(dateStr);
        vence.setHours(0, 0, 0, 0);
        
        if (vence < today) return { color: '#ef4444', label: 'VENCIDO', bg: 'rgba(239, 68, 68, 0.1)' };
        if (vence.getTime() === today.getTime()) return { color: '#f97316', label: 'HOY', bg: 'rgba(249, 115, 22, 0.1)' };
        
        const diffDays = Math.ceil((vence - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 2) return { color: '#fbbf24', label: 'PRÓXIMO', bg: 'rgba(251, 191, 36, 0.1)' };
        
        return { color: '#3b82f6', label: 'PENDIENTE', bg: 'transparent' };
    };

    const mc = (val) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(val || 0);
    };

    const expiredPayments = weeklyPayments.filter(p => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return new Date(p.vence) < today;
    });

    const expiredCount = expiredPayments.length;
    const expiredTotal = expiredPayments.reduce((sum, p) => sum + Number(p.monto), 0);

    return (
        <div style={{ padding: '2rem', animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Resumen Operativo</h1>
                <p style={{ color: 'var(--text-muted)' }}>Bienvenido al panel de control administrativo de SIPE.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                {/* CARD: PAGOS DE LA SEMANA */}
                <div className="card glass" style={{ 
                    padding: '1.25rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    maxHeight: '450px',
                    maxWidth: '600px',
                    width: '100%'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', padding: '0.5rem', borderRadius: '10px' }}>
                                <Calendar size={22} color="var(--primary)" />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>Vencimientos de la Semana</h4>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Panel de control operativo</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => navigate('/dashboard/operaciones/recordatorios')}
                            style={{ background: 'rgba(99, 102, 241, 0.1)', border: 'none', color: 'var(--primary)', padding: '0.4rem 0.8rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s' }}
                        >
                            Ver Todo <ArrowRight size={14} />
                        </button>
                    </div>

                    {expiredCount > 0 && (
                        <div style={{ 
                            backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                            borderLeft: '4px solid #ef4444',
                            borderRadius: '6px', 
                            padding: '0.75rem', 
                            marginBottom: '1rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            animation: 'pulse 2s infinite',
                            flexShrink: 0
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertCircle size={16} color="#ef4444" />
                                <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                    {expiredCount} VENCIDOS
                                </span>
                            </div>
                            <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1rem' }}>
                                {mc(expiredTotal)}
                            </span>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <div className="spinner"></div>
                        </div>
                    ) : weeklyPayments.length > 0 ? (
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.4rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#1E293B', zIndex: 10 }}>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                        <th style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Proveedor / Ubicación</th>
                                        <th style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Fecha</th>
                                        <th style={{ padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', textAlign: 'right' }}>Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {weeklyPayments.map((p, idx) => {
                                        const status = getStatusInfo(p.vence);
                                        return (
                                            <tr key={idx} style={{ 
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                backgroundColor: status.bg
                                            }}>
                                                <td style={{ padding: '0.6rem 0.5rem' }}>
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{p.ubicacion}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.descripcion}</div>
                                                </td>
                                                <td style={{ padding: '0.6rem 0.5rem', verticalAlign: 'middle' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: status.color, fontWeight: status.label !== 'PENDIENTE' ? 'bold' : 'normal' }}>
                                                        <Clock size={12} color={status.color} />
                                                        {formatDate(p.vence)}
                                                        {status.label !== 'PENDIENTE' && (
                                                            <span style={{ 
                                                                fontSize: '0.6rem', 
                                                                padding: '0.1rem 0.3rem', 
                                                                borderRadius: '4px', 
                                                                backgroundColor: status.color, 
                                                                color: 'white',
                                                                marginLeft: '0.25rem'
                                                            }}>
                                                                {status.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)', fontSize: '0.85rem' }}>
                                                    {mc(p.monto)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)' }}>
                            <AlertCircle size={48} opacity={0.3} />
                            <p>No hay pagos programados para esta semana.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
