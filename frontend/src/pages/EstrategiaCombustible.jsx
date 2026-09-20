import React, { useState, useEffect } from 'react';
import { 
    Fuel, AlertTriangle, TrendingUp, Calculator, RefreshCw, 
    ArrowRight, CheckCircle2, AlertOctagon, HelpCircle, Layers, Truck
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { formatDateDMY } from '../utils/date';

export default function EstrategiaCombustible() {
    const { addToast } = useToast();

    const [autonomiaData, setAutonomiaData] = useState(null);
    const [loadingAutonomia, setLoadingAutonomia] = useState(true);

    // Simulador DGEHM State
    const [variaciones, setVariaciones] = useState({ S: 0.08, R: 0.06, D: 0.10, I: 0.10 });
    const [simuladorData, setSimuladorData] = useState(null);
    const [calculandoSimulador, setCalculandoSimulador] = useState(false);

    // Filtros
    const [filtroEstacion, setFiltroEstacion] = useState('todas');
    const [filtroTipo, setFiltroTipo] = useState('todos');

    const fetchAutonomia = async () => {
        setLoadingAutonomia(true);
        try {
            const res = await api.get('/inteligencia/tanques-autonomia');
            setAutonomiaData(res.data);
            ejecutarSimulador(variaciones);
        } catch (error) {
            console.error('Error fetching autonomia tanques:', error);
            addToast('Error al consultar autonomía de tanques', 'error');
        } finally {
            setLoadingAutonomia(false);
        }
    };

    const ejecutarSimulador = async (vars = variaciones) => {
        setCalculandoSimulador(true);
        try {
            const res = await api.post('/inteligencia/simulador-dgehm', { variaciones: vars });
            setSimuladorData(res.data);
        } catch (error) {
            console.error('Error calculando simulador DGEHM:', error);
            addToast('Error al ejecutar simulador DGEHM', 'error');
        } finally {
            setCalculandoSimulador(false);
        }
    };

    useEffect(() => {
        fetchAutonomia();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleVariacionChange = (combustible, val) => {
        const parsed = parseFloat(val) || 0;
        const updated = { ...variaciones, [combustible]: parsed };
        setVariaciones(updated);
    };

    const handleCalcularClick = (e) => {
        e.preventDefault();
        ejecutarSimulador(variaciones);
    };

    const resumen = autonomiaData?.resumen || {};
    const tanques = autonomiaData?.tanques || [];

    const tanquesFiltrados = tanques.filter(t => {
        if (filtroEstacion !== 'todas' && String(t.id_empresa) !== String(filtroEstacion)) return false;
        if (filtroTipo !== 'todos' && t.tipo_combustible !== filtroTipo) return false;
        return true;
    });

    const estacionesUnicas = Array.from(new Set(tanques.map(t => JSON.stringify({ id: t.id_empresa, nombre: t.estacion })))).map(s => JSON.parse(s));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', padding: '0.45rem', borderRadius: '8px' }}>
                        <Fuel size={22} color="var(--primary)" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Inteligencia de Combustible & DGEHM</h1>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                            Autonomía de tanques en tiempo real y recomendador estratégico de compras pre-cambio oficial
                            {autonomiaData?.fecha_corte && ` • Último corte: ${formatDateDMY(autonomiaData.fecha_corte)}`}
                        </p>
                    </div>
                </div>

                <button 
                    onClick={fetchAutonomia}
                    className="btn btn-primary"
                    style={{ height: '36px', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                    <RefreshCw size={15} /> Actualizar
                </button>
            </div>

            {/* KPI Cards de Tanques */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '0.85rem' 
            }}>
                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Stock Total Grupo
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--text)', marginTop: '0.2rem' }}>
                        {resumen.stock_total_galones?.toLocaleString() || 0} gal
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        de {resumen.capacidad_total_galones?.toLocaleString() || 0} gal de capacidad
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Ocupación Global
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--primary)', marginTop: '0.2rem' }}>
                        {resumen.porcentaje_ocupacion_global || 0}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {resumen.total_tanques || 0} tanques monitoreados
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: resumen.tanques_criticos > 0 ? '4px solid #ef4444' : '4px solid #10b981' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Tanques &lt;24 Horas
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: resumen.tanques_criticos > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                        {resumen.tanques_criticos || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: resumen.tanques_criticos > 0 ? '#ef4444' : '#10b981' }}>
                        {resumen.tanques_criticos > 0 ? 'En riesgo inminente de quiebre' : 'Stock seguro en todas las estaciones'}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Tanques en Alerta (24-48h)
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#f59e0b', marginTop: '0.2rem' }}>
                        {resumen.tanques_advertencia || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Planificar despacho en 24h
                    </div>
                </div>
            </div>

            {/* SECCIÓN 1: SIMULADOR DE COMPRA ESTRATÉGICA PRE-DGEHM */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Calculator size={18} color="var(--primary)" /> Simulador de Compras Estratégicas Pre-Cambio DGEHM
                        </h3>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                            Ingresa la variación esperada del precio de referencia de la DGEHM para calcular la ganancia por compra anticipada.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {simuladorData?.resumen_ejecutivo?.ganancia_oportunidad_usd > 0 && (
                            <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                Oportunidad de Margen: +${simuladorData.resumen_ejecutivo.ganancia_oportunidad_usd.toLocaleString()} USD
                            </div>
                        )}
                    </div>
                </div>

                {/* Formulario de Variaciones */}
                <form onSubmit={handleCalcularClick} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
                    <div style={{ width: '110px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Var. Súper ($)</label>
                        <input 
                            type="number" 
                            step="0.01" 
                            className="form-control" 
                            value={variaciones.S} 
                            onChange={(e) => handleVariacionChange('S', e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ width: '110px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Var. Regular ($)</label>
                        <input 
                            type="number" 
                            step="0.01" 
                            className="form-control" 
                            value={variaciones.R} 
                            onChange={(e) => handleVariacionChange('R', e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ width: '110px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Var. Diésel ($)</label>
                        <input 
                            type="number" 
                            step="0.01" 
                            className="form-control" 
                            value={variaciones.D} 
                            onChange={(e) => handleVariacionChange('D', e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ width: '110px' }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Var. Ion ($)</label>
                        <input 
                            type="number" 
                            step="0.01" 
                            className="form-control" 
                            value={variaciones.I} 
                            onChange={(e) => handleVariacionChange('I', e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={calculandoSimulador}
                        className="btn btn-primary"
                        style={{ height: '36px', fontSize: '0.825rem', padding: '0 1.25rem' }}
                    >
                        {calculandoSimulador ? 'Calculando...' : 'Simular Estrategia'}
                    </button>
                </form>

                {/* Resultado Resumen del Simulador */}
                {simuladorData?.resumen_ejecutivo && (
                    <div style={{ 
                        backgroundColor: 'rgba(99, 102, 241, 0.05)', 
                        border: '1px solid rgba(99, 102, 241, 0.2)', 
                        borderRadius: '8px', 
                        padding: '0.75rem 1rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                    }}>
                        <div style={{ fontSize: '0.825rem' }}>
                            <strong style={{ color: 'var(--primary)' }}>Recomendación Logística:</strong> {simuladorData.resumen_ejecutivo.accion_principal}
                            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                                {simuladorData.resumen_ejecutivo.estrategia_flete}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Galones a Pedir</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text)' }}>
                                    {simuladorData.resumen_ejecutivo.galones_totales_sugeridos?.toLocaleString()} gal
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* SECCIÓN 2: MONITOR DE HORAS DE COMBUSTIBLE EN TANQUES */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Layers size={18} color="var(--primary)" /> Niveles de Tanque y Autonomía Restante
                    </h3>

                    {/* Filtros */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <select 
                            value={filtroEstacion} 
                            onChange={(e) => setFiltroEstacion(e.target.value)}
                            className="form-control"
                            style={{ height: '36px', fontSize: '0.825rem', width: 'auto', minWidth: '150px' }}
                        >
                            <option value="todas">Todas las Estaciones</option>
                            {estacionesUnicas.map(e => (
                                <option key={e.id} value={e.id}>{e.nombre}</option>
                            ))}
                        </select>

                        <select 
                            value={filtroTipo} 
                            onChange={(e) => setFiltroTipo(e.target.value)}
                            className="form-control"
                            style={{ height: '36px', fontSize: '0.825rem', width: 'auto' }}
                        >
                            <option value="todos">Todos los Combustibles</option>
                            <option value="S">Súper</option>
                            <option value="R">Regular</option>
                            <option value="D">Diésel</option>
                            <option value="I">Ion Diésel</option>
                        </select>
                    </div>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>ESTACIÓN / TANQUE</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'left', color: 'var(--text-muted)' }}>PRODUCTO</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>CAPACIDAD & OCUPACIÓN</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>STOCK ACTUAL</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>ESPACIO LIBRE (ULLAGE)</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'right', color: 'var(--text-muted)' }}>CONSUMO DÍA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>AUTONOMÍA</th>
                                <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textAlign: 'center', color: 'var(--text-muted)' }}>ESTADO</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingAutonomia ? (
                                <tr>
                                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        Cargando datos de tanques...
                                    </td>
                                </tr>
                            ) : tanquesFiltrados.length === 0 ? (
                                <tr>
                                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                                        No se encontraron tanques con los filtros aplicados.
                                    </td>
                                </tr>
                            ) : (
                                tanquesFiltrados.map((t, idx) => {
                                    const esCritico = t.estado === 'critico';
                                    const esAdvertencia = t.estado === 'advertencia';

                                    let badgeColor = '#10b981';
                                    let badgeBg = 'rgba(16, 185, 129, 0.15)';
                                    let badgeText = 'ÓPTIMO';
                                    if (esCritico) {
                                        badgeColor = '#ef4444';
                                        badgeBg = 'rgba(239, 68, 68, 0.15)';
                                        badgeText = 'CRÍTICO (<24h)';
                                    } else if (esAdvertencia) {
                                        badgeColor = '#f59e0b';
                                        badgeBg = 'rgba(245, 158, 11, 0.15)';
                                        badgeText = 'ALERTA (24-48h)';
                                    }

                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <strong>{t.estacion}</strong>
                                                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.tanque_nombre}</span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <span style={{ fontWeight: 600 }}>{t.nombre_combustible}</span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', width: '160px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.2rem', color: 'var(--text-muted)' }}>
                                                    <span>{t.porcentaje_ocupacion}%</span>
                                                    <span>{t.capacidad?.toLocaleString()} gal</span>
                                                </div>
                                                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ 
                                                        width: `${Math.min(100, t.porcentaje_ocupacion)}%`, 
                                                        height: '100%', 
                                                        backgroundColor: badgeColor,
                                                        borderRadius: '3px'
                                                    }} />
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold' }}>
                                                {t.stock_actual?.toLocaleString()} gal
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>
                                                {t.espacio_libre_ullage?.toLocaleString()} gal
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                                ~{t.consumo_diario_estimado?.toLocaleString()} gal
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <strong style={{ color: badgeColor }}>
                                                    {t.horas_restantes > 120 ? '>5 días' : `${t.horas_restantes} hrs`}
                                                </strong>
                                                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    ({t.dias_restantes} días)
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
