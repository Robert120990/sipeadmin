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

    const mc = (val) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(val || 0);
    };

    return (
        <div style={{ padding: '2rem', animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Resumen Operativo</h1>
                <p style={{ color: 'var(--text-muted)' }}>Bienvenido al panel de control administrativo de SIPE.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                {/* CARD: PAGOS DE LA SEMANA */}
                <div className="card glass" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', maxHeight: '420px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', padding: '0.5rem', borderRadius: '10px' }}>
                                <Calendar size={20} color="var(--primary)" />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem' }}>Vencimientos de la Semana</h4>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Próximos 7 días</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => navigate('/dashboard/operaciones/recordatorios')}
                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 'bold' }}
                        >
                            Ver Todo <ArrowRight size={14} />
                        </button>
                    </div>

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
                                    {weeklyPayments.map((p, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.6rem 0' }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{p.ubicacion}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.descripcion}</div>
                                            </td>
                                            <td style={{ padding: '0.6rem 0', verticalAlign: 'middle' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                                                    <Clock size={12} color="#f59e0b" />
                                                    {formatDate(p.vence)}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.6rem 0', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)', fontSize: '0.85rem' }}>
                                                {mc(p.monto)}
                                            </td>
                                        </tr>
                                    ))}
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

                {/* PLACEHOLDER CARD: QUICK STATS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card glass" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '1rem', borderRadius: '14px' }}>
                            <DollarSign size={32} color="#10b981" />
                        </div>
                        <div>
                            <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total Pendiente Semana</h4>
                            <h2 style={{ margin: '0.25rem 0 0 0', color: '#10b981' }}>
                                {mc(weeklyPayments.reduce((sum, p) => sum + Number(p.monto), 0))}
                            </h2>
                        </div>
                    </div>
                    
                    <div className="card glass" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', opacity: 0.8 }}>
                        <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', padding: '1rem', borderRadius: '14px' }}>
                            <Calendar size={32} color="#f59e0b" />
                        </div>
                        <div>
                            <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Recordatorios Activos</h4>
                            <h2 style={{ margin: '0.25rem 0 0 0' }}>{weeklyPayments.length}</h2>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
