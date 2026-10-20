import React, { useState, useEffect, useCallback } from 'react';
import { X, Terminal, Sparkles, Play, XCircle, RefreshCw, Send, Settings2, Server, Cpu, MessageSquarePlus } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../Toast';

const AGY_STATUS_META = {
    idle: { label: 'Listo para Planificar', bg: 'rgba(100,116,139,0.2)', color: '#cbd5e1' },
    planificando: { label: 'Planificando con AGY...', bg: 'rgba(245,158,11,0.25)', color: '#fde68a' },
    esperando_aprobacion: { label: 'Plan Generado (Esperando Aprobación)', bg: 'rgba(99,102,241,0.25)', color: '#c7d2fe' },
    ejecutando: { label: 'Ejecutando Plan en Consola AGY...', bg: 'rgba(14,165,233,0.25)', color: '#bae6fd' },
    completado: { label: 'Plan Ejecutado en Consola AGY', bg: 'rgba(16,185,129,0.25)', color: '#6ee7b7' },
    denegado: { label: 'Plan Denegado', bg: 'rgba(239,68,68,0.25)', color: '#fecdd3' },
    error: { label: 'Error de Consola', bg: 'rgba(239,68,68,0.25)', color: '#fecdd3' }
};

const DEFAULT_MODELS = [
    { id: 'gemini-4-argon-high', label: 'gemini-4-argon-high (Máxima Velocidad e Inteligencia)' },
    { id: 'gemini-3.1-pro', label: 'gemini-3.1-pro (Razonamiento Profundo)' },
    { id: 'gemini-3-flash', label: 'gemini-3-flash (Ultra Rápido)' }
];

const TicketAgyFlowModal = ({ open, ticketId, onClose, onUpdated }) => {
    const { addToast } = useToast();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [selectedModel, setSelectedModel] = useState('gemini-4-argon-high');
    const [aiNotes, setAiNotes] = useState('');
    const [feedbackComment, setFeedbackComment] = useState('');
    const [activeView, setActiveView] = useState('plan');
    const [showConfig, setShowConfig] = useState(false);
    const [cfgForm, setCfgForm] = useState({
        ssh_host: 'localhost',
        ssh_port: 22,
        ssh_user: 'root',
        ssh_password: '',
        project_path: '/var/www/sipeadmin',
        agy_command: 'agy',
        default_model: 'gemini-4-argon-high',
        execution_mode: 'auto'
    });

    const loadData = useCallback(async () => {
        if (!open || !ticketId) return;
        setLoading(true);
        try {
            const [tRes, cfgRes] = await Promise.all([
                api.get(`/tickets/${ticketId}`),
                api.get('/tickets/agy-settings').catch(() => ({ data: { data: {} } }))
            ]);
            const t = tRes.data?.data || tRes.data;
            setTicket(t);
            setAiNotes(t?.ai_notes || '');
            if (t?.agy_model) setSelectedModel(t.agy_model);
            const cfg = cfgRes.data?.data || {};
            setCfgForm((prev) => ({
                ...prev,
                ssh_host: cfg.ssh_host || 'localhost',
                ssh_port: cfg.ssh_port || 22,
                ssh_user: cfg.ssh_user || 'root',
                project_path: cfg.project_path || '/var/www/sipeadmin',
                agy_command: cfg.agy_command || 'agy',
                default_model: cfg.default_model || 'gemini-4-argon-high'
            }));
        } catch (_) {
            addToast('No se pudo cargar el flujo AGY del ticket', 'error');
        } finally {
            setLoading(false);
        }
    }, [open, ticketId, addToast]);

    useEffect(() => {
        if (open && ticketId) {
            loadData();
        }
    }, [open, ticketId, loadData]);

    if (!open || !ticketId) return null;

    const handlePlan = async () => {
        setBusy(true);
        try {
            const res = await api.post(`/tickets/${ticketId}/agy/plan`, {
                model: selectedModel,
                ai_notes: aiNotes,
                feedback_comment: feedbackComment
            });
            setTicket(res.data?.data || res.data);
            setFeedbackComment('');
            addToast(res.data?.message || 'Plan AGY generado', 'success');
            if (onUpdated) onUpdated();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al planificar con AGY', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleExecute = async () => {
        setBusy(true);
        try {
            const res = await api.post(`/tickets/${ticketId}/agy/execute`);
            setTicket(res.data?.data || res.data);
            addToast(res.data?.message || 'Ejecución iniciada en Consola AGY', 'success');
            if (onUpdated) onUpdated();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al ejecutar plan AGY', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleReject = async () => {
        setBusy(true);
        try {
            const res = await api.post(`/tickets/${ticketId}/agy/reject`, {
                reason: feedbackComment || 'Denegado por administrador'
            });
            setTicket(res.data?.data || res.data);
            addToast(res.data?.message || 'Plan AGY denegado', 'info');
            if (onUpdated) onUpdated();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al denegar plan', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleSaveConfig = async () => {
        try {
            await api.put('/tickets/agy-settings', cfgForm);
            setShowConfig(false);
            addToast('Configuración de Consola AGY guardada', 'success');
        } catch (_) {
            addToast('Error al guardar configuración AGY', 'error');
        }
    };

    const agyStatus = ticket?.agy_status || 'idle';
    const statusBadge = AGY_STATUS_META[agyStatus] || AGY_STATUS_META.idle;
    const hasPlan = Boolean(ticket?.agy_plan_markdown);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10015,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(2, 6, 23, 0.75)',
                backdropFilter: 'blur(4px)',
                padding: '0.75rem'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '820px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--card-bg)',
                    color: 'var(--text)',
                    borderRadius: '16px',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.6rem',
                        padding: '0.85rem 1.15rem',
                        background: '#0f172a',
                        color: '#fff',
                        borderBottom: '1px solid #1e293b'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
                            <Terminal size={19} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '6px', background: 'rgba(99,102,241,0.25)', color: '#c7d2fe' }}>
                                    {ticket?.code || ticket?.ticket_code || `#${ticketId}`}
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontFamily: 'monospace', padding: '0.1rem 0.45rem', borderRadius: '6px', background: '#1e293b', color: '#34d399' }}>
                                    <Server size={11} /> Consola AGY
                                </span>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: '999px', background: statusBadge.bg, color: statusBadge.color }}>
                                    {statusBadge.label}
                                </span>
                            </div>
                            <h2 style={{ margin: '0.2rem 0 0 0', fontSize: '0.9rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Flujo Consola AGY &amp; Aprobación por Telegram — {ticket?.subject || ''}
                            </h2>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                            type="button"
                            onClick={() => setShowConfig((v) => !v)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.65rem', borderRadius: '8px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            <Settings2 size={13} /> Ajustes
                        </button>
                        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.3rem' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {loading && !ticket ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Cargando flujo AGY del ticket...
                    </div>
                ) : (
                    <div style={{ padding: '1rem 1.15rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {showConfig && (
                            <div style={{ background: '#0f172a', color: '#f8fafc', borderRadius: '10px', padding: '0.85rem', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase' }}>
                                    Parámetros de Conexión a Consola AGY
                                </span>
                                <div className="form-grid form-grid-3" style={{ gap: '0.6rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Host</label>
                                        <input type="text" value={cfgForm.ssh_host} onChange={(e) => setCfgForm({ ...cfgForm, ssh_host: e.target.value })} className="form-input" style={{ height: '34px', fontSize: '0.78rem' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Usuario SSH</label>
                                        <input type="text" value={cfgForm.ssh_user} onChange={(e) => setCfgForm({ ...cfgForm, ssh_user: e.target.value })} className="form-input" style={{ height: '34px', fontSize: '0.78rem' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.2rem' }}>Ruta Proyecto</label>
                                        <input type="text" value={cfgForm.project_path} onChange={(e) => setCfgForm({ ...cfgForm, project_path: e.target.value })} className="form-input" style={{ height: '34px', fontSize: '0.78rem' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                    <button type="button" onClick={() => setShowConfig(false)} style={{ padding: '0.35rem 0.7rem', borderRadius: '6px', background: '#1e293b', color: '#cbd5e1', border: 'none', fontSize: '0.74rem', cursor: 'pointer' }}>Cerrar</button>
                                    <button type="button" onClick={handleSaveConfig} style={{ padding: '0.35rem 0.8rem', borderRadius: '6px', background: '#4f46e5', color: '#fff', border: 'none', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>Guardar</button>
                                </div>
                            </div>
                        )}

                        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            <div className="form-grid form-grid-2" style={{ gap: '0.65rem' }}>
                                <div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                        <Cpu size={13} color="var(--primary)" /> Modelo IA en Consola
                                    </label>
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="form-input"
                                        style={{ width: '100%', height: '36px', fontSize: '0.8rem' }}
                                    >
                                        {DEFAULT_MODELS.map((m) => (
                                            <option key={m.id} value={m.id}>{m.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                        Directriz Técnica (`ai_notes`)
                                    </label>
                                    <input
                                        type="text"
                                        value={aiNotes}
                                        onChange={(e) => setAiNotes(e.target.value)}
                                        placeholder="Instrucción técnica opcional para orientar el plan..."
                                        className="form-input"
                                        style={{ width: '100%', height: '36px', fontSize: '0.8rem' }}
                                    />
                                </div>
                            </div>

                            {hasPlan && (
                                <div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                        <MessageSquarePlus size={13} /> Observaciones para Re-planificar (Plan v{(ticket?.agy_plan_version || 1) + 1})
                                    </label>
                                    <input
                                        type="text"
                                        value={feedbackComment}
                                        onChange={(e) => setFeedbackComment(e.target.value)}
                                        placeholder="Escribe observaciones adicionales para re-planificar..."
                                        className="form-input"
                                        style={{ width: '100%', height: '36px', fontSize: '0.8rem' }}
                                    />
                                </div>
                            )}

                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    Al aprobar, AGY generará el plan de ejecución técnica para este ticket.
                                </span>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={handlePlan}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.45rem 0.95rem',
                                        borderRadius: '10px',
                                        background: '#4f46e5',
                                        color: '#fff',
                                        border: 'none',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        cursor: busy ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {busy ? <RefreshCw size={14} /> : <Sparkles size={14} />}
                                    <span>{hasPlan ? `Volver a Planificar (v${(ticket?.agy_plan_version || 1) + 1})` : 'Aprobar Ticket y Solicitar Plan a AGY'}</span>
                                </button>
                            </div>
                        </div>

                        <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.55rem 0.85rem', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setActiveView('plan')}
                                        style={{
                                            padding: '0.3rem 0.7rem',
                                            borderRadius: '8px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            border: 'none',
                                            cursor: 'pointer',
                                            background: activeView === 'plan' ? 'var(--primary)' : 'transparent',
                                            color: activeView === 'plan' ? '#fff' : 'var(--text-muted)'
                                        }}
                                    >
                                        📋 Plan de Ejecución {ticket?.agy_plan_version ? `(v${ticket.agy_plan_version})` : ''}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveView('console')}
                                        style={{
                                            padding: '0.3rem 0.7rem',
                                            borderRadius: '8px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            border: 'none',
                                            cursor: 'pointer',
                                            background: activeView === 'console' ? '#0f172a' : 'transparent',
                                            color: activeView === 'console' ? '#34d399' : 'var(--text-muted)'
                                        }}
                                    >
                                        💻 Salida Consola AGY
                                    </button>
                                </div>

                                {hasPlan && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={async () => {
                                                await api.post(`/tickets/${ticketId}/agy/resend-telegram`);
                                                addToast('Plan enviado a Telegram', 'success');
                                            }}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.65rem', borderRadius: '8px', background: 'rgba(14,165,233,0.14)', color: '#0284c7', border: '1px solid rgba(14,165,233,0.3)', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            <Send size={12} /> Reenviar a Telegram
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={handleExecute}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.75rem', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            <Play size={12} /> Aprobar y Ejecutar Plan
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={handleReject}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.65rem', borderRadius: '8px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            <XCircle size={12} /> Denegar
                                        </button>
                                    </div>
                                )}
                            </div>

                            {activeView === 'plan' ? (
                                <div style={{ padding: '0.85rem', maxHeight: '260px', overflowY: 'auto', background: 'var(--card-bg)' }}>
                                    {ticket?.agy_plan_markdown ? (
                                        <pre style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.5 }}>
                                            {ticket.agy_plan_markdown}
                                        </pre>
                                    ) : (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                            Aún no se ha generado un plan. Presiona &ldquo;Aprobar Ticket y Solicitar Plan a AGY&rdquo; para iniciar.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ padding: '0.85rem', maxHeight: '260px', overflowY: 'auto', background: '#0f172a', color: '#34d399', fontFamily: 'monospace', fontSize: '0.74rem' }}>
                                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                        {ticket?.agy_execution_log || 'Sin registros de consola todavía.'}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TicketAgyFlowModal;
