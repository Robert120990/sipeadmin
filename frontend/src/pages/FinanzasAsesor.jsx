import React, { useState, useEffect } from 'react';
import { 
    Sparkles, Bot, TrendingUp, Landmark, AlertTriangle, 
    CheckCircle2, DollarSign, Send, ArrowRight, ShieldCheck, 
    RefreshCw, Layers, Wrench, ChevronRight, HelpCircle
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../utils/loanCalculations';

export default function FinanzasAsesor() {
    const { addToast } = useToast();

    const [empresas, setEmpresas] = useState([]);
    const [empresaId, setEmpresaId] = useState('');
    const [loading, setLoading] = useState(false);
    const [advisoryData, setAdvisoryData] = useState(null);

    // Chat / Pregunta personalizada
    const [promptText, setPromptText] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [asking, setAsking] = useState(false);

    // Cargar empresas
    useEffect(() => {
        const fetchCatalogos = async () => {
            try {
                const res = await api.get('/finanzas/catalogos');
                setEmpresas(res.data?.empresas || []);
            } catch (err) {
                console.error('Error fetching catalogos:', err);
            }
        };
        fetchCatalogos();
        handleEjecutarDiagnostico();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Ejecutar diagnóstico general
    const handleEjecutarDiagnostico = async (targetEmpresaId = empresaId) => {
        setLoading(true);
        try {
            const payload = targetEmpresaId ? { empresa_id: targetEmpresaId } : {};
            const res = await api.post('/finanzas/asesor-ia', payload);
            setAdvisoryData(res.data);
            addToast('Diagnóstico financiero generado con éxito', 'success');
        } catch (error) {
            console.error('Error in asesor-ia:', error);
            addToast('Error al generar el diagnóstico financiero', 'error');
        } finally {
            setLoading(false);
        }
    };

    // Cambio de empresa
    const handleEmpresaChange = (newId) => {
        setEmpresaId(newId);
        handleEjecutarDiagnostico(newId);
    };

    // Enviar pregunta específica a la IA
    const handleEnviarConsulta = async (customPrompt = promptText) => {
        const text = customPrompt?.trim();
        if (!text) return;

        setAsking(true);
        const userMsg = { role: 'user', content: text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
        setChatHistory(prev => [...prev, userMsg]);
        setPromptText('');

        try {
            const payload = {
                prompt: text,
                empresa_id: empresaId || undefined
            };
            const res = await api.post('/finanzas/asesor-ia', payload);
            const aiReply = res.data?.data?.reply_markdown || res.data?.data?.diagnostico || 'Diagnóstico procesado.';
            const botMsg = { 
                role: 'bot', 
                content: aiReply, 
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                fuente: res.data?.fuente,
                arbitraje: res.data?.data?.arbitraje_deuda_vs_inversion
            };
            setChatHistory(prev => [...prev, botMsg]);
        } catch (error) {
            console.error('Error querying advisor:', error);
            addToast('Error al consultar al asesor IA', 'error');
            setChatHistory(prev => [...prev, {
                role: 'bot',
                content: 'Disculpa, ocurrió un error al procesar tu consulta financiera. Por favor intenta nuevamente.',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]);
        } finally {
            setAsking(false);
        }
    };

    // Consultas sugeridas
    const suggestedPrompts = [
        "¿Conviene prepagar préstamos bancarios o fondear proyectos de inversión?",
        "Dame un plan para optimizar el pago de intereses bancarios este año.",
        "¿Cuál es el impacto financiero del presupuesto de mantenimiento en la liquidez?",
        "Evalúa si la capacidad de flujo permite contratar un nuevo préstamo."
    ];

    const ctx = advisoryData?.contexto_base;
    const diag = advisoryData?.data;

    const saludBadgeConfig = {
        Optima: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', label: 'Salud Óptima' },
        Buena: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Salud Buena' },
        Precaucion: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: 'Precaución de Liquidez' },
        Critica: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Atención Crítica Requerida' }
    };

    const sBadge = saludBadgeConfig[diag?.salud_financiera] || saludBadgeConfig.Buena;

    return (
        <div style={{ paddingBottom: '3rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
                        <Sparkles size={28} style={{ color: '#f59e0b' }} />
                        Asesor Financiero y Proyecciones IA
                    </h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.3rem 0 0 0', fontSize: '0.92rem' }}>
                        Diagnóstico estratégico con Inteligencia Artificial (Gemini 2.0 Flash). Arbitraje de deuda vs inversión, alertas de liquidez y proyecciones.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                    <select 
                        className="form-control"
                        style={{ maxWidth: '240px', fontWeight: 600 }}
                        value={empresaId}
                        onChange={e => handleEmpresaChange(e.target.value)}
                    >
                        <option value="">Todas las Empresas (Grupo Consolidado)</option>
                        {empresas.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                        ))}
                    </select>

                    <button 
                        className="btn btn-primary"
                        onClick={() => handleEjecutarDiagnostico()}
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        {loading ? 'Analizando...' : 'Actualizar Diagnóstico'}
                    </button>
                </div>
            </div>

            {/* RADIOGRAFÍA FINANCIERA INTEGRADA */}
            {ctx && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {/* Deuda Activa */}
                    <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                            Deuda Bancaria Total
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0.3rem 0', color: '#ef4444' }}>
                            {formatCurrency(ctx.saldo_total_deuda || 0)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {ctx.total_prestamos_activos} préstamo(s) activo(s)
                        </div>
                    </div>

                    {/* Costo Ponderado de Deuda */}
                    <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                            Costo de Deuda (Tasa Anual)
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0.3rem 0', color: '#f59e0b' }}>
                            {ctx.tasa_ponderada_deuda_anual}%
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Tasa promedio ponderada anual
                        </div>
                    </div>

                    {/* Carga Mensual */}
                    <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #3b82f6' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                            Servicio Mensual de Deuda
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0.3rem 0', color: '#3b82f6' }}>
                            {formatCurrency(ctx.cuota_mensual_total || 0)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Desembolso mensual en cuotas
                        </div>
                    </div>

                    {/* Proyectos Evaluados */}
                    <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                            Cartera de Inversiones
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0.3rem 0', color: '#10b981' }}>
                            {ctx.proyectos?.length || 0} Proyectos
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Inversión: {formatCurrency(ctx.proyectos?.reduce((acc, p) => acc + (p.inversion || 0), 0) || 0)}
                        </div>
                    </div>

                    {/* Mantenimiento Programado */}
                    <div className="card glass" style={{ padding: '1.25rem', borderLeft: '4px solid #8b5cf6' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                            Mantenimiento Comprometido
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0.3rem 0', color: '#8b5cf6' }}>
                            {formatCurrency(ctx.mantenimiento_proximo?.total_comprometido || 0)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {ctx.mantenimiento_proximo?.cantidad_eventos || 0} eventos programados
                        </div>
                    </div>
                </div>
            )}

            {/* SECCIÓN PRINCIPAL: DIAGNÓSTICO EJECUTIVO Y ARBITRAJE */}
            {diag && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                    {/* Tarjeta Diagnóstico Ejecutivo */}
                    <div className="card glass" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Bot size={22} className="text-primary" />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                                    Diagnóstico Ejecutivo
                                </h3>
                            </div>
                            <span style={{ background: sBadge.bg, color: sBadge.color, padding: '0.25rem 0.65rem', borderRadius: '15px', fontSize: '0.8rem', fontWeight: 700 }}>
                                {sBadge.label}
                            </span>
                        </div>

                        <p style={{ fontSize: '0.92rem', lineHeight: '1.5', color: 'var(--text-color)', marginBottom: '1.2rem' }}>
                            {diag.diagnostico}
                        </p>

                        {/* Alertas de Riesgo */}
                        {diag.alertas_riesgo && diag.alertas_riesgo.length > 0 && (
                            <div style={{ marginBottom: '1.2rem' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
                                    <AlertTriangle size={15} /> Alertas de Atención Requerida:
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {diag.alertas_riesgo.map((alerta, i) => (
                                        <li key={i} style={{ marginBottom: '0.3rem' }}>{alerta}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Proyección a 12-36 meses */}
                        {diag.analisis_proyeccion && (
                            <div style={{ background: 'var(--bg-secondary)', padding: '0.9rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                                <strong style={{ color: 'var(--text-color)', display: 'block', marginBottom: '0.3rem' }}>
                                    Proyección Operativa y Flujo de Fondos:
                                </strong>
                                <span style={{ color: 'var(--text-muted)' }}>{diag.analisis_proyeccion}</span>
                            </div>
                        )}
                    </div>

                    {/* Tarjeta Arbitraje Financiero: Deuda vs Inversión */}
                    <div className="card glass" style={{ padding: '1.5rem', borderTop: '4px solid #3b82f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            <TrendingUp size={22} style={{ color: '#3b82f6' }} />
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                                Arbitraje de Capital: ¿Prepagar Deuda o Invertir?
                            </h3>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
                            Compara matemáticamente el costo de los préstamos bancarios contra la rentabilidad esperada (TIR) de los proyectos en evaluación.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.2rem' }}>
                            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Costo Deuda Bancaria</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b', margin: '0.2rem 0' }}>
                                    {diag.arbitraje_deuda_vs_inversion?.tasa_deuda_referencia || `${ctx?.tasa_ponderada_deuda_anual}%`}
                                </div>
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Ahorro por prepago</small>
                            </div>

                            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Rendimiento Proyectos (TIR)</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#10b981', margin: '0.2rem 0' }}>
                                    {diag.arbitraje_deuda_vs_inversion?.tir_promedio_proyectos || 'N/A'}
                                </div>
                                <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Retorno incremental</small>
                            </div>
                        </div>

                        <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <strong style={{ color: '#3b82f6', display: 'block', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                                Dictamen de Asesoría Financiera:
                            </strong>
                            <p style={{ fontSize: '0.88rem', margin: 0, color: 'var(--text-color)', lineHeight: '1.45' }}>
                                {diag.arbitraje_deuda_vs_inversion?.recomendacion_estrategica}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* RECOMENDACIONES PRIORITARIAS */}
            {diag?.recomendaciones_prioritarias && diag.recomendaciones_prioritarias.length > 0 && (
                <div className="card glass" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldCheck size={20} style={{ color: '#10b981' }} />
                        Recomendaciones Financieras Prioritarias para la Gerencia
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                        {diag.recomendaciones_prioritarias.map((rec, i) => (
                            <div key={i} style={{ background: 'var(--bg-secondary)', padding: '1.2rem', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-color)' }}>
                                            {rec.titulo}
                                        </span>
                                        <span className={`badge ${rec.impacto === 'Inmediato' || rec.impacto === 'Alto' ? 'badge-danger' : 'badge-primary'}`} style={{ fontSize: '0.7rem' }}>
                                            {rec.impacto}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                                        {rec.detalle}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* CHAT Y CONSEJERO FINANCIERO INTERACTIVO (GEMINI 2.0 FLASH) */}
            <div className="card glass" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
                    <Bot size={24} className="text-primary" />
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                            Consejero Financiero Interactivo (Chat con IA)
                        </h3>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Haz consultas estratégicas sobre tu estructura de préstamos, proyectos o presupuestos de mantenimiento.
                        </span>
                    </div>
                </div>

                {/* Preguntas Sugeridas */}
                <div style={{ marginBottom: '1.2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {suggestedPrompts.map((p, idx) => (
                        <button 
                            key={idx} 
                            type="button" 
                            className="btn btn-sm btn-outline"
                            onClick={() => handleEnviarConsulta(p)}
                            disabled={asking}
                            style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', borderRadius: '16px' }}
                        >
                            {p}
                        </button>
                    ))}
                </div>

                {/* Historial de Mensajes */}
                {chatHistory.length > 0 && (
                    <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.2rem', padding: '0.5rem' }}>
                        {chatHistory.map((msg, index) => (
                            <div 
                                key={index} 
                                style={{ 
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    maxWidth: '85%',
                                    background: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-secondary)',
                                    color: msg.role === 'user' ? '#ffffff' : 'var(--text-color)',
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
                                    fontSize: '0.9rem',
                                    lineHeight: '1.5'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', fontSize: '0.74rem', opacity: 0.8 }}>
                                    <span>{msg.role === 'user' ? 'Tú (Gerencia)' : 'Asesor Financiero IA'}</span>
                                    <span>{msg.time}</span>
                                </div>
                                <div style={{ whiteSpace: 'pre-line' }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Formulario de Input */}
                <form 
                    onSubmit={(e) => { e.preventDefault(); handleEnviarConsulta(); }}
                    style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}
                >
                    <input 
                        type="text" 
                        className="form-control"
                        value={promptText}
                        onChange={e => setPromptText(e.target.value)}
                        placeholder="Escribe tu consulta financiera o de inversión (ej. ¿Cuál es el riesgo de tomar un nuevo crédito de $50,000?)..."
                        disabled={asking}
                        style={{ flex: '1 1 200px', minWidth: 0 }}
                    />
                    <button 
                        type="submit" 
                        className="btn btn-primary"
                        disabled={asking || !promptText.trim()}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem 1.4rem' }}
                    >
                        <Send size={16} /> {asking ? 'Pensando...' : 'Preguntar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
