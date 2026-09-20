import React, { useState, useEffect } from 'react';
import { 
    Compass, Fuel, Landmark, AlertTriangle, TrendingUp, 
    Share2, Mail, RefreshCw, CheckCircle2, ArrowRight, 
    DollarSign, ShieldAlert, Sparkles, Clock, Copy
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { formatDateDMY } from '../utils/date';

export default function EstrategiaTorreControl() {
    const { addToast } = useToast();
    const navigate = useNavigate();

    const [flashData, setFlashData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [periodoVentas, setPeriodoVentas] = useState('ayer'); // 'ayer' | 'hoy'
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [emailDestino, setEmailDestino] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);

    const fetchFlash = async () => {
        setLoading(true);
        try {
            const res = await api.get('/inteligencia/flash-ejecutivo');
            setFlashData(res.data);
        } catch (error) {
            console.error('Error fetching flash ejecutivo:', error);
            addToast('Error al cargar la Torre de Control Ejecutiva', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFlash();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCopiarWhatsApp = () => {
        if (!flashData?.whatsapp_text) return;
        navigator.clipboard.writeText(flashData.whatsapp_text);
        addToast('¡Resumen copiado! Listo para pegar en WhatsApp o Telegram', 'success');
    };

    const handleEnviarEmail = async () => {
        setSendingEmail(true);
        try {
            await api.post('/inteligencia/enviar-flash-email', {
                destinatario: emailDestino.trim() || undefined
            });
            addToast('Flash ejecutivo enviado por correo exitosamente', 'success');
            setEmailModalOpen(false);
            setEmailDestino('');
        } catch (error) {
            const msg = error.response?.data?.message || 'Error al enviar por correo';
            addToast(msg, 'error');
        } finally {
            setSendingEmail(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={28} className="spin" style={{ marginBottom: '0.75rem', color: 'var(--primary)' }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Cargando Torre de Control y Flash Ejecutivo...</p>
            </div>
        );
    }

    const kpi = flashData?.kpi || {};
    const tanquesCriticos = flashData?.tanques_criticos || [];
    const currentVentas = periodoVentas === 'ayer' ? (flashData?.ventas_ayer || {}) : (flashData?.ventas_hoy || {});
    const ventasEstaciones = currentVentas?.estaciones || [];
    const bancos = flashData?.bancos || [];
    const compromisos = flashData?.compromisos_48h || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <Compass size={22} color="var(--primary)" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Torre de Control Ejecutiva</h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Centro de decisiones y flash matutino para directores • {formatDateDMY(flashData?.fecha) || flashData?.fecha_texto}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button 
                        onClick={handleCopiarWhatsApp}
                        className="btn btn-secondary"
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Copy size={16} /> Copiar Flash (WhatsApp)
                    </button>
                    <button 
                        onClick={() => setEmailModalOpen(true)}
                        className="btn btn-secondary"
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <Mail size={16} /> Enviar por Correo
                    </button>
                    <button 
                        onClick={fetchFlash}
                        className="btn btn-primary"
                        style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        <RefreshCw size={15} /> Actualizar
                    </button>
                </div>
            </div>

            {/* Diagnóstico Directivo IA */}
            <div className="card glass" style={{ 
                padding: '0.85rem 1.15rem', 
                borderLeft: '4px solid var(--primary)', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                backgroundColor: 'rgba(99, 102, 241, 0.05)'
            }}>
                <Sparkles size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.825rem', lineHeight: '1.45' }}>
                    <strong style={{ color: 'var(--primary)', marginRight: '0.4rem' }}>Diagnóstico Estratégico:</strong>
                    <span>{flashData?.diagnostico_ia}</span>
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
                gap: '0.85rem' 
            }}>
                {/* Card 1: Ventas */}
                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {periodoVentas === 'ayer' ? 'Ventas Ayer' : 'Ventas Hoy'}
                        </span>
                        <div style={{ display: 'inline-flex', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
                            <button
                                type="button"
                                onClick={() => setPeriodoVentas('ayer')}
                                style={{
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '0.15rem 0.45rem',
                                    fontSize: '0.7rem',
                                    fontWeight: periodoVentas === 'ayer' ? 700 : 500,
                                    backgroundColor: periodoVentas === 'ayer' ? 'var(--primary)' : 'transparent',
                                    color: periodoVentas === 'ayer' ? '#fff' : 'var(--text-muted)',
                                    cursor: 'pointer'
                                }}
                            >
                                Ayer
                            </button>
                            <button
                                type="button"
                                onClick={() => setPeriodoVentas('hoy')}
                                style={{
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '0.15rem 0.45rem',
                                    fontSize: '0.7rem',
                                    fontWeight: periodoVentas === 'hoy' ? 700 : 500,
                                    backgroundColor: periodoVentas === 'hoy' ? 'var(--primary)' : 'transparent',
                                    color: periodoVentas === 'hoy' ? '#fff' : 'var(--text-muted)',
                                    cursor: 'pointer'
                                }}
                            >
                                Hoy
                            </button>
                        </div>
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text)' }}>
                        ${(currentVentas?.total_dolares || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{(currentVentas?.total_galones || 0).toLocaleString()} galones {periodoVentas === 'hoy' ? 'cerrados' : 'despachados'}</span>
                    </div>
                </div>

                {/* Card 2: Liquidez en Bancos */}
                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                            Saldo en Bancos
                        </span>
                        <Landmark size={16} color="#10b981" />
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#10b981' }}>
                        ${kpi.liquidez_bancos_usd?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Disponible ({flashData?.total_bancos_cuentas || bancos.length} cuentas activas)
                    </div>
                </div>

                {/* Card 3: Tanques en Riesgo */}
                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                            Tanques &lt;24h
                        </span>
                        <Fuel size={16} color={kpi.tanques_criticos_count > 0 ? '#ef4444' : '#10b981'} />
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: kpi.tanques_criticos_count > 0 ? '#ef4444' : 'var(--text)' }}>
                        {kpi.tanques_criticos_count || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: kpi.tanques_criticos_count > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                        {kpi.tanques_criticos_count > 0 ? 'Requieren pedido urgente' : 'Niveles óptimos'}
                    </div>
                </div>

                {/* Card 4: Compromisos 48h */}
                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                            Compromisos 48h
                        </span>
                        <Clock size={16} color="#f59e0b" />
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#f59e0b' }}>
                        ${kpi.compromisos_48h_usd?.toLocaleString() || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Deuda bancaria y pagos fijos
                    </div>
                </div>
            </div>

            {/* Alerta de Tanques Críticos si existen */}
            {tanquesCriticos.length > 0 && (
                <div className="card glass" style={{ 
                    padding: '0.85rem 1.15rem', 
                    borderLeft: '4px solid #ef4444', 
                    backgroundColor: 'rgba(239, 68, 68, 0.05)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertTriangle size={18} color="#ef4444" />
                            <strong style={{ color: '#ef4444', fontSize: '0.85rem' }}>
                                ¡Atención Inmediata! {tanquesCriticos.length} tanque(s) con autonomía crítica de combustible:
                            </strong>
                        </div>
                        <button 
                            onClick={() => navigate('/dashboard/estrategia/combustible')}
                            className="btn btn-secondary"
                            style={{ height: '30px', fontSize: '0.75rem', padding: '0 0.8rem' }}
                        >
                            Ver Monitor de Tanques <ArrowRight size={13} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {tanquesCriticos.map((t, idx) => (
                            <span 
                                key={idx} 
                                style={{ 
                                    backgroundColor: 'rgba(239, 68, 68, 0.15)', 
                                    color: '#ef4444', 
                                    padding: '0.25rem 0.55rem', 
                                    borderRadius: '6px', 
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold'
                                }}
                            >
                                {t.estacion} - {t.nombre_combustible}: {t.horas_restantes}h ({t.stock_actual} gal)
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Dos Columnas: Ventas de Ayer vs Posición de Liquidez */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                {/* Columna Izquierda: Ventas por Estación */}
                <div className="card glass" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <TrendingUp size={16} color="var(--primary)" /> 
                            {periodoVentas === 'ayer' ? 'Desglose de Ventas de Ayer' : 'Desglose de Ventas de Hoy'}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ display: 'inline-flex', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
                                <button
                                    type="button"
                                    onClick={() => setPeriodoVentas('ayer')}
                                    style={{
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '0.15rem 0.5rem',
                                        fontSize: '0.72rem',
                                        fontWeight: periodoVentas === 'ayer' ? 700 : 500,
                                        backgroundColor: periodoVentas === 'ayer' ? 'var(--primary)' : 'transparent',
                                        color: periodoVentas === 'ayer' ? '#fff' : 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Ayer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPeriodoVentas('hoy')}
                                    style={{
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '0.15rem 0.5rem',
                                        fontSize: '0.72rem',
                                        fontWeight: periodoVentas === 'hoy' ? 700 : 500,
                                        backgroundColor: periodoVentas === 'hoy' ? 'var(--primary)' : 'transparent',
                                        color: periodoVentas === 'hoy' ? '#fff' : 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Hoy
                                </button>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {formatDateDMY(currentVentas?.fecha) || currentVentas?.fecha_texto}
                            </span>
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '350px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>GALONES</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>VENTA ($)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ventasEstaciones.length === 0 ? (
                                    <tr>
                                        <td colSpan="3" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            {periodoVentas === 'ayer'
                                                ? 'No se registran turnos de venta finalizados para ayer.'
                                                : 'No se registran turnos de venta finalizados para hoy aún.'}
                                        </td>
                                    </tr>
                                ) : (
                                    ventasEstaciones.map((e, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{e.estacion}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{e.galones?.toLocaleString()}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>
                                                ${e.venta_monto?.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Columna Derecha: Posición Bancaria y Compromisos */}
                <div className="card glass" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Landmark size={16} color="#10b981" /> Saldos Disponibles en Bancos
                        </h3>
                        <button 
                            onClick={() => navigate('/dashboard/bancos/cuentas')}
                            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                            Ver Bancos &rarr;
                        </button>
                    </div>

                    <div 
                        className="table-responsive" 
                        style={{ 
                            maxHeight: '190px', 
                            overflowY: 'auto',
                            border: '1px solid var(--border-color)', 
                            borderRadius: '6px'
                        }}
                    >
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '320px' }}>
                            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--card-bg)', zIndex: 1 }}>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>BANCO / CUENTA</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>SALDO ($)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bancos.length === 0 ? (
                                    <tr>
                                        <td colSpan="2" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            No se cargaron saldos de cuentas bancarias.
                                        </td>
                                    </tr>
                                ) : (
                                    bancos.map((b, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <strong style={{ color: 'var(--text)' }}>{b.banco}</strong>
                                                {b.cuenta && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'block' }}>{b.cuenta}</span>}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: b.saldo < 5000 ? '#f59e0b' : '#10b981' }}>
                                                ${b.saldo?.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {bancos.length > 0 && (
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '0.45rem 0.6rem', 
                            backgroundColor: 'rgba(16, 185, 129, 0.08)', 
                            borderRadius: '6px', 
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            fontSize: '0.8rem', 
                            fontWeight: 'bold' 
                        }}>
                            <span>Total disponible:</span>
                            <span style={{ color: '#10b981' }}>
                                ${kpi.liquidez_bancos_usd?.toLocaleString() || 0}
                            </span>
                        </div>
                    )}

                    {/* Compromisos en 48h */}
                    {compromisos.length > 0 && (
                        <div style={{ marginTop: '0.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem' }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#f59e0b', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Clock size={14} /> Pagos Próximos (48 horas):
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.75rem', color: 'var(--text-muted)', maxHeight: '90px', overflowY: 'auto' }}>
                                {compromisos.map((c, idx) => (
                                    <li key={idx}>
                                        <strong>{c.tipo}:</strong> {c.descripcion} — <span style={{ color: 'var(--text)', fontWeight: 600 }}>${c.monto?.toLocaleString()}</span> ({formatDateDMY(c.fecha)})
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* Accesos Directos a los Módulos de Decisión */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                gap: '0.75rem' 
            }}>
                <button 
                    onClick={() => navigate('/dashboard/estrategia/combustible')}
                    className="card glass"
                    style={{ padding: '0.85rem', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s' }}
                >
                    <Fuel size={20} color="var(--primary)" style={{ marginBottom: '0.35rem' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>Autonomía & DGEHM</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Simulador de compras</div>
                </button>

                <button 
                    onClick={() => navigate('/dashboard/estrategia/flujo-caja')}
                    className="card glass"
                    style={{ padding: '0.85rem', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s' }}
                >
                    <DollarSign size={20} color="#10b981" style={{ marginBottom: '0.35rem' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>Flujo Predictivo</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>30 / 60 días de caja</div>
                </button>

                <button 
                    onClick={() => navigate('/dashboard/estrategia/mermas')}
                    className="card glass"
                    style={{ padding: '0.85rem', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s' }}
                >
                    <ShieldAlert size={20} color="#ef4444" style={{ marginBottom: '0.35rem' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>Auditoría Mermas</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Control de fugas en pista</div>
                </button>

                <button 
                    onClick={() => navigate('/dashboard/estrategia/rentabilidad')}
                    className="card glass"
                    style={{ padding: '0.85rem', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s' }}
                >
                    <TrendingUp size={20} color="#8b5cf6" style={{ marginBottom: '0.35rem' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>P&L por Estación</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Margen neto por galón</div>
                </button>

                <button 
                    onClick={() => navigate('/dashboard/estrategia/creditos')}
                    className="card glass"
                    style={{ padding: '0.85rem', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'all 0.2s' }}
                >
                    <CheckCircle2 size={20} color="#06b6d4" style={{ marginBottom: '0.35rem' }} />
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>Crédito y Flotas</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Scoring y bloqueo vales</div>
                </button>
            </div>

            {/* Modal para Enviar Flash por Email */}
            <Modal
                open={emailModalOpen}
                onClose={() => setEmailModalOpen(false)}
                title="Enviar Flash Ejecutivo por Correo"
                size="sm"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button 
                            type="button" 
                            className="btn btn-secondary" 
                            onClick={() => setEmailModalOpen(false)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="button" 
                            className="btn btn-primary" 
                            onClick={handleEnviarEmail}
                            disabled={sendingEmail}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        >
                            {sendingEmail ? 'Enviando...' : 'Enviar Ahora'}
                        </button>
                    </div>
                }
            >
                <div style={{ fontSize: '0.825rem', lineHeight: '1.45', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    El resumen ejecutivo matutino con indicadores clave de ventas, liquidez en bancos y tanques en riesgo será enviado vía SMTP.
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                        Correo Electrónico Destinatario (Opcional si usa el de oficina):
                    </label>
                    <input 
                        type="email"
                        className="form-control"
                        placeholder="ejemplo@empresa.com"
                        value={emailDestino}
                        onChange={(e) => setEmailDestino(e.target.value)}
                        style={{ height: '36px', fontSize: '0.825rem', width: '100%' }}
                    />
                </div>
            </Modal>
        </div>
    );
}
