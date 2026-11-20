import React, { useState, useEffect, useMemo } from 'react';
import {
    AlertCircle, ArrowRight, Clock, Fuel, Landmark, ShieldAlert,
    TrendingUp, FileText, RefreshCw, CheckSquare, Ticket, Truck, Bot, Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import socket from '../services/socket';
import CalendarGrid from '../components/CalendarGrid';
import ColorIcon from '../components/ColorIcon';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { useToast } from '../components/Toast';
import { parseDateOnly, formatDateDisplay, formatDateDMY, isTodayOrPast } from '../utils/date';

const Dashboard = () => {
    const [weeklyPayments, setWeeklyPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [homeIntel, setHomeIntel] = useState(null);
    const [loadingIntel, setLoadingIntel] = useState(true);
    const [monthPayments, setMonthPayments] = useState([]);
    const [calendarLoading, setCalendarLoading] = useState(true);
    const [calendarMonth, setCalendarMonth] = useState(new Date());
    const [assignedTasks, setAssignedTasks] = useState([]);

    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user')) || {};
        } catch {
            return {};
        }
    }, []);

    // Vista Previa Dossier Ejecutivo PDF (Tamaño Carta)
    const [dossierOpen, setDossierOpen] = useState(false);
    const [dossierBlob, setDossierBlob] = useState(null);
    const [loadingDossier, setLoadingDossier] = useState(false);

    const navigate = useNavigate();
    const { addToast } = useToast();

    const fetchDashboardData = async () => {
        setLoading(true);
        setLoadingIntel(true);
        try {
            const [vencRes, intelRes, tasksRes] = await Promise.allSettled([
                api.get('/dashboard/vencimientos'),
                api.get('/inteligencia/home-resumen'),
                api.get('/tasks', { params: { solo_mias: 'true' } })
            ]);
            if (vencRes.status === 'fulfilled') {
                setWeeklyPayments(vencRes.value.data || []);
            }
            if (intelRes.status === 'fulfilled') {
                setHomeIntel(intelRes.value.data || null);
            }
            if (tasksRes.status === 'fulfilled') {
                const list = Array.isArray(tasksRes.value.data) ? tasksRes.value.data : [];
                setAssignedTasks(list.filter(t => t.estado !== 'completada' && t.estado !== 'cancelada'));
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
            setLoadingIntel(false);
        }
    };

    const fetchMonthData = async () => {
        setCalendarLoading(true);
        try {
            const year = calendarMonth.getFullYear();
            const month = calendarMonth.getMonth();
            const desde = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const hasta = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
            const { data } = await api.get(`/operaciones/recordatorios?desde=${desde}&hasta=${hasta}&estado=P`);
            setMonthPayments(data || []);
        } catch (error) {
            console.error('Error fetching month payments:', error);
            setMonthPayments([]);
        } finally {
            setCalendarLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
        const refreshAssigned = () => {
            api.get('/tasks', { params: { solo_mias: 'true' } }).then(res => {
                const list = Array.isArray(res.data) ? res.data : [];
                setAssignedTasks(list.filter(t => t.estado !== 'completada' && t.estado !== 'cancelada'));
            }).catch(() => {});
        };
        socket.on('tasks:changed', refreshAssigned);
        socket.on('tasks:assigned_card', refreshAssigned);
        return () => {
            socket.off('tasks:changed', refreshAssigned);
            socket.off('tasks:assigned_card', refreshAssigned);
        };
    }, []);

    useEffect(() => {
        fetchMonthData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calendarMonth]);

    const handleOpenDossierPdf = async () => {
        setLoadingDossier(true);
        try {
            const res = await api.get('/inteligencia/dossier-ejecutivo-pdf', { responseType: 'blob' });
            const pdfBlob = new Blob([res.data], { type: 'application/pdf' });
            setDossierBlob(pdfBlob);
            setDossierOpen(true);
        } catch (err) {
            console.error('Error generando dossier PDF:', err);
            addToast('No se pudo generar el Dossier Ejecutivo en PDF', 'error');
        } finally {
            setLoadingDossier(false);
        }
    };

    const paymentsByDay = useMemo(() => {
        const byDay = {};
        monthPayments.forEach(p => {
            if (!p.vence) return;
            const key = p.vence.split('T')[0];
            if (!byDay[key]) byDay[key] = [];
            byDay[key].push(p);
        });
        return byDay;
    }, [monthPayments]);

    const formatDate = (dateStr) => {
        return formatDateDisplay(dateStr, { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const getStatusInfo = (dateStr) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const parts = parseDateOnly(dateStr);
        if (!parts) return { color: '#3b82f6', label: 'PENDIENTE', bg: 'transparent' };
        const vence = new Date(parts.year, parts.month - 1, parts.day);

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
            maximumFractionDigits: 0
        }).format(val || 0);
    };

    const expiredPayments = weeklyPayments.filter(p => isTodayOrPast(p.vence));
    const expiredCount = expiredPayments.length;
    const expiredTotal = expiredPayments.reduce((sum, p) => sum + Number(p.monto), 0);

    const permisos = homeIntel?.permisos_bloques || {};
    const ventas = homeIntel?.ventas;
    const abastecimiento = homeIntel?.abastecimiento;
    const tesoreria = homeIntel?.tesoreria;
    const auditoria = homeIntel?.auditoria;
    const personal = homeIntel?.actividad_personal || { tickets_abiertos: 0, mis_tareas_pendientes: 0 };
    const alertasTanques = abastecimiento?.tanques?.alertas_tanques || [];
    const baterias = abastecimiento?.tanques?.baterias || abastecimiento?.baterias || [];

    const getBateriaColor = (pct) => {
        if (pct > 50) return '#10b981';
        if (pct >= 20) return '#f59e0b';
        return '#ef4444';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.4s ease-out' }}>
            {/* Header Compacto */}
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', padding: '0.45rem', borderRadius: '10px', display: 'flex' }}>
                        <ColorIcon icon="fluent-color:home-24" size={22} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>
                            Centro de Comando Operativo
                        </h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Indicadores clave en tiempo real adaptados a tu perfil • Grupo SIPE
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {permisos.dossier_pdf && (
                        <button
                            onClick={handleOpenDossierPdf}
                            disabled={loadingDossier}
                            className="btn btn-primary"
                            style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <FileText size={15} />
                            {loadingDossier ? 'Generando PDF...' : 'Dossier Ejecutivo PDF'}
                        </button>
                    )}
                    <button
                        onClick={fetchDashboardData}
                        disabled={loadingIntel}
                        className="btn"
                        style={{
                            height: '36px',
                            padding: '0 0.9rem',
                            fontSize: '0.825rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            border: '1px solid var(--border)',
                            background: 'var(--card-bg)',
                            color: 'var(--text)'
                        }}
                    >
                        <RefreshCw size={14} /> Actualizar
                    </button>
                </div>
            </div>

            {/* Fila de KPIs Inteligentes por Rol */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: '0.85rem' }}>
                {permisos.ventas && ventas && (
                    <div
                        className="card glass"
                        onClick={() => navigate('/dashboard/consultas/estaciones/ventas')}
                        style={{ padding: '0.85rem 1rem', cursor: 'pointer', borderLeft: '4px solid #6366f1' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
                                Ventas Cierre ({formatDateDMY(ventas.fecha_corte)})
                            </span>
                            <TrendingUp size={16} color="#6366f1" />
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.2rem' }}>
                            {mc(ventas.ayer_dolares)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
                            <span>{(ventas.ayer_galones || 0).toLocaleString()} gal</span>
                            {ventas.hoy_dolares > 0 && (
                                <span style={{ color: '#10b981', fontWeight: 600 }}>Hoy: {mc(ventas.hoy_dolares)}</span>
                            )}
                        </div>
                    </div>
                )}

                {permisos.abastecimiento && abastecimiento && (
                    <div
                        className="card glass"
                        onClick={() => navigate('/dashboard/estrategia/combustible')}
                        style={{
                            padding: '0.85rem 1rem',
                            cursor: 'pointer',
                            borderLeft: (abastecimiento.tanques?.emergencias_reales || 0) > 0 ? '4px solid #ef4444' : '4px solid #10b981'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
                                Tanques & Tránsito Puma
                            </span>
                            <Fuel size={16} color={(abastecimiento.tanques?.emergencias_reales || 0) > 0 ? '#ef4444' : '#10b981'} />
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: (abastecimiento.tanques?.emergencias_reales || 0) > 0 ? '#ef4444' : 'var(--text)', marginTop: '0.2rem' }}>
                            {abastecimiento.tanques?.emergencias_reales || 0} Emergencias Reales
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
                            <span style={{ color: '#0ea5e9', fontWeight: 600 }}>
                                🚚 {(abastecimiento.tanques?.galones_en_transito_total || 0).toLocaleString()} gal en ruta
                            </span>
                            {(abastecimiento.pedidos_puma?.retenidos || 0) > 0 && (
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                    ⛔ {abastecimiento.pedidos_puma.retenidos} retenido(s)
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {permisos.tesoreria && tesoreria && (
                    <div
                        className="card glass"
                        onClick={() => navigate('/dashboard/bancos/reportes/saldos-bancos')}
                        style={{ padding: '0.85rem 1rem', cursor: 'pointer', borderLeft: '4px solid #10b981' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
                                Liquidez en Bancos
                            </span>
                            <Landmark size={16} color="#10b981" />
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.2rem' }}>
                            {mc(tesoreria.saldo_total_usd)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {tesoreria.cuentas_activas || 0} cuentas operativas consolidadas
                        </div>
                    </div>
                )}

                {permisos.auditoria && auditoria && (
                    <div
                        className="card glass"
                        onClick={() => navigate('/dashboard/estrategia/mermas')}
                        style={{
                            padding: '0.85rem 1rem',
                            cursor: 'pointer',
                            borderLeft: (auditoria.alertas_transito_count || 0) > 0 ? '4px solid #f59e0b' : '4px solid #3b82f6'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
                                Efectivo en Tránsito &gt;48h
                            </span>
                            <ShieldAlert size={16} color="#f59e0b" />
                        </div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.2rem' }}>
                            {mc(auditoria.efectivo_en_transito_48h_usd)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Vales &gt;72h sin DTE: <strong style={{ color: (auditoria.vales_sin_facturar_72h_usd || 0) > 0 ? '#ef4444' : 'var(--text)' }}>{mc(auditoria.vales_sin_facturar_72h_usd)}</strong>
                        </div>
                    </div>
                )}

                {/* Tarjeta Universal: Tareas y Tickets del Usuario */}
                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: '4px solid #8b5cf6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
                            Mi Actividad Operativa
                        </span>
                        <CheckSquare size={16} color="#8b5cf6" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                        <div
                            onClick={() => navigate('/dashboard/operaciones/tareas')}
                            style={{ cursor: 'pointer' }}
                        >
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text)' }}>
                                {personal.mis_tareas_pendientes || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tareas activas</div>
                        </div>
                        <div style={{ width: '1px', height: '28px', backgroundColor: 'var(--border)' }} />
                        <div
                            onClick={() => navigate('/dashboard/seguridad/tickets')}
                            style={{ cursor: 'pointer' }}
                        >
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: (personal.tickets_abiertos || 0) > 0 ? '#f59e0b' : 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Ticket size={14} /> {personal.tickets_abiertos || 0}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tickets abiertos</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tarjeta Informativa en Sistema: Tareas y Actividades Asignadas al Usuario */}
            {assignedTasks.length > 0 && (
                <div
                    className="card glass"
                    style={{
                        padding: '0.85rem 1.1rem',
                        borderLeft: '4px solid #38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.32)',
                        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(139, 92, 246, 0.05) 100%)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <CheckSquare size={16} color="#38bdf8" />
                            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text)' }}>
                                Tarjeta Informativa · Tareas y Actividades Asignadas ({assignedTasks.length})
                            </span>
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                Actividades activas vinculadas a tu perfil y MiBot Telegram
                            </span>
                        </div>
                        <button
                            onClick={() => navigate('/dashboard/operaciones/tareas')}
                            style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        >
                            Ir a Tablero y MiBot <ArrowRight size={13} />
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(265px, 1fr))', gap: '0.6rem' }}>
                        {assignedTasks.slice(0, 3).map(t => {
                            const isAssignedToMe = Number(t.assigned_to) === Number(currentUser.id);
                            return (
                                <div
                                    key={t.id}
                                    onClick={() => {
                                        navigate('/dashboard/operaciones/tareas');
                                        setTimeout(() => {
                                            window.dispatchEvent(new CustomEvent('sipe:open-task-detail', { detail: { taskId: t.id } }));
                                        }, 180);
                                    }}
                                    style={{
                                        padding: '0.6rem 0.8rem',
                                        borderRadius: '8px',
                                        background: 'var(--card-bg)',
                                        border: '1px solid var(--border)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.32rem'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                        <span style={{
                                            fontSize: '0.66rem',
                                            fontWeight: 700,
                                            padding: '0.1rem 0.4rem',
                                            borderRadius: '4px',
                                            background: t.prioridad === 'urgente' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(56, 189, 248, 0.14)',
                                            color: t.prioridad === 'urgente' ? '#ef4444' : '#38bdf8',
                                            textTransform: 'uppercase'
                                        }}>
                                            {t.prioridad || 'MEDIA'} · {t.categoria || 'General'}
                                        </span>
                                        {t.mibot_summary?.has_mibot && (
                                            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                <Bot size={11} /> MiBot ({t.mibot_summary.ultimo_estado})
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                                        #{t.id} · {t.titulo}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.3rem' }}>
                                        <span>{isAssignedToMe ? `Asignada por: ${t.created_user_name || 'Sistema'}` : `Responsable: ${t.assigned_user_name || 'Colaborador'}`}</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.22rem', color: '#fbbf24', fontWeight: 600 }}>
                                            <Calendar size={11} /> {formatDateDMY(t.fecha_vencimiento)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Banda Compacta de Tanques Críticos con Cruce de Pedidos Puma */}
            {permisos.abastecimiento && alertasTanques.length > 0 && (
                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Truck size={15} color="var(--primary)" /> Monitoreo de Abastecimiento:
                        </span>
                        {alertasTanques.map((t, i) => {
                            const enRuta = t.riesgo_real === 'cubierto_en_ruta';
                            const esEmergencia = t.riesgo_real === 'emergencia_real';
                            return (
                                <span
                                    key={i}
                                    style={{
                                        fontSize: '0.74rem',
                                        padding: '0.2rem 0.55rem',
                                        borderRadius: '6px',
                                        fontWeight: 600,
                                        backgroundColor: enRuta
                                            ? 'rgba(14, 165, 233, 0.14)'
                                            : (esEmergencia ? 'rgba(239, 68, 68, 0.14)' : 'rgba(245, 158, 11, 0.14)'),
                                        color: enRuta ? '#0284c7' : (esEmergencia ? '#ef4444' : '#d97706')
                                    }}
                                >
                                    {t.estacion} • {t.nombre_combustible}: {t.horas_restantes}h
                                    {enRuta ? ` (+${(t.galones_en_transito || 0).toLocaleString()} gal en ruta)` : (esEmergencia ? ' (SIN PEDIDO)' : '')}
                                </span>
                            );
                        })}
                    </div>
                    <button
                        onClick={() => navigate('/dashboard/operaciones/pedidos')}
                        style={{ background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '0.78rem', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                        Gestionar Pedidos <ArrowRight size={13} />
                    </button>
                </div>
            )}

            {/* Banda Compacta de Nivel de Batería por Tanque/Pipa (#TKT-0035) */}
            {permisos.abastecimiento && baterias.length > 0 && (
                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Fuel size={15} color="var(--primary)" /> Nivel de Batería por Tanque
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                        {baterias.map((b, i) => {
                            const pct = Math.max(0, Math.min(100, Number(b.porcentaje_bateria ?? b.porcentaje ?? 0)));
                            const color = getBateriaColor(pct);
                            return (
                                <div key={i} style={{ flex: '1 1 210px', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                            {b.estacion || b.nombre || 'Tanque'}{b.nombre_combustible ? ` • ${b.nombre_combustible}` : ''}
                                        </span>
                                        <span style={{ fontWeight: 'bold', color }}>{pct.toFixed(0)}%</span>
                                    </div>
                                    <div style={{ width: '100%', height: '10px', borderRadius: '6px', backgroundColor: 'rgba(148, 163, 184, 0.25)', overflow: 'hidden' }}>
                                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '6px', transition: 'width 0.4s ease' }} />
                                    </div>
                                    {(b.galones_actuales !== undefined || b.capacidad_total !== undefined) && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            {(b.galones_actuales || 0).toLocaleString()} / {(b.capacidad_total || 0).toLocaleString()} gal
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Sección Principal: Vencimientos de la Semana y Calendario Mensual */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: '1rem', alignItems: 'start' }}>
                {/* CARD: PAGOS DE LA SEMANA */}
                <div className="card glass" style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '460px',
                    width: '100%'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem', flexShrink: 0, flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.12)', padding: '0.4rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ColorIcon icon="fluent-color:calendar-clock-24" size={22} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 'bold' }}>Vencimientos de la Semana</h4>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compromisos y recordatorios programados</p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate('/dashboard/operaciones/recordatorios')}
                            style={{ background: 'rgba(99, 102, 241, 0.1)', border: 'none', color: 'var(--primary)', height: '32px', padding: '0 0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', fontWeight: 'bold' }}
                        >
                            Ver Todo <ArrowRight size={13} />
                        </button>
                    </div>

                    {expiredCount > 0 && (
                        <div style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderLeft: '4px solid #ef4444',
                            borderRadius: '6px',
                            padding: '0.6rem 0.75rem',
                            marginBottom: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                            flexShrink: 0
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <ColorIcon icon="fluent-color:warning-24" size={18} />
                                <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.8rem' }}>
                                    {expiredCount} VENCIDOS / HOY
                                </span>
                            </div>
                            <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.92rem' }}>
                                {mc(expiredTotal)}
                            </span>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '180px' }}>
                            <div className="spinner"></div>
                        </div>
                    ) : weeklyPayments.length > 0 ? (
                        <div className="table-responsive" style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', minWidth: '420px', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)', zIndex: 10 }}>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Proveedor / Ubicación</th>
                                        <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'right' }}>Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {weeklyPayments.map((p, idx) => {
                                        const status = getStatusInfo(p.vence);
                                        return (
                                            <tr key={idx} style={{
                                                borderBottom: '1px solid var(--border)',
                                                backgroundColor: status.bg
                                            }}>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{p.ubicacion}</div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.descripcion}</div>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', verticalAlign: 'middle' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: status.color, fontWeight: status.label !== 'PENDIENTE' ? 'bold' : 'normal', flexWrap: 'wrap' }}>
                                                        <Clock size={12} color={status.color} />
                                                        {formatDate(p.vence)}
                                                        {status.label !== 'PENDIENTE' && (
                                                            <span style={{
                                                                fontSize: '0.68rem',
                                                                padding: '0.12rem 0.4rem',
                                                                borderRadius: '4px',
                                                                backgroundColor: status.color,
                                                                color: 'white'
                                                            }}>
                                                                {status.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)', fontSize: '0.8rem' }}>
                                                    {mc(p.monto)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', padding: '2rem 0', color: 'var(--text-muted)' }}>
                            <AlertCircle size={38} opacity={0.3} />
                            <p style={{ margin: 0, fontSize: '0.825rem' }}>No hay pagos programados para esta semana.</p>
                        </div>
                    )}
                </div>

                {/* CARD: CALENDARIO MENSUAL */}
                <div className="card glass" style={{
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%'
                }}>
                    {calendarLoading ? (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '250px' }}>
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <CalendarGrid
                            paymentsByDay={paymentsByDay}
                            currentMonth={calendarMonth}
                            onMonthChange={setCalendarMonth}
                        />
                    )}
                </div>
            </div>

            <ReportPreviewModal
                isOpen={dossierOpen}
                onClose={() => setDossierOpen(false)}
                title="Dossier Ejecutivo Semanal • Grupo SIPE"
                subtitle="EBITDA Real, Liquidez Bancaria, Abastecimiento y Auditoría en Tránsito"
                badge="CARTA • DIRECCIÓN"
                pdfSource={dossierBlob}
                fileName={`Dossier_Ejecutivo_SIPE_${new Date().toISOString().split('T')[0]}.pdf`}
                totalPages={1}
                footerInfo="Informe gerencial consolidado en formato Tamaño Carta completo"
            />
        </div>
    );
};

export default Dashboard;
