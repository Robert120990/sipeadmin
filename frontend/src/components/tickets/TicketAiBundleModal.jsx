import React, { useState, useEffect, useCallback } from 'react';
import {
    X, Bot, Copy, Check, Sparkles, Trash2, CheckCircle2,
    FileCode2, AlertTriangle, Image as ImageIcon, RefreshCw, Upload, Terminal
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../Toast';

const AI_EXECUTION_MODES = {
    agent_prompt: {
        id: 'agent_prompt',
        icon: '📋',
        label: 'Modo 2: Prompt + Logs para Agente Externo',
        desc: 'Genera el prompt Markdown estructurado con capturas y logs para Antigravity, Cursor o Claude.'
    },
    internal_api: {
        id: 'internal_api',
        icon: '⚡',
        label: 'Modo 1: API Interna Autónoma',
        desc: 'Prepara los tickets seleccionados para resolución asistida con notas técnicas.'
    }
};

const AGENT_PLATFORMS = {
    antigravity: { id: 'antigravity', name: 'Antigravity', icon: '🚀' },
    cursor: { id: 'cursor', name: 'Cursor IDE', icon: '🖱️' },
    claude: { id: 'claude', name: 'Claude Code', icon: '🤖' }
};

export default function TicketAiBundleModal({ open, onClose, selectedIds = [], onSuccess }) {
    const { addToast } = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [extraContext, setExtraContext] = useState('');
    const [aiMode, setAiMode] = useState('agent_prompt');
    const [agentPlatform, setAgentPlatform] = useState('antigravity');
    const [openLogsTicketId, setOpenLogsTicketId] = useState(null);
    const [promptPreview, setPromptPreview] = useState('');
    const [copied, setCopied] = useState(false);
    const [batchVersion, setBatchVersion] = useState('');
    const [batchNote, setBatchNote] = useState('');
    const [showResolveConfirm, setShowResolveConfirm] = useState(false);

    const idsParam = Array.isArray(selectedIds) && selectedIds.length > 0 ? selectedIds.join(',') : '';

    const loadBundle = useCallback(async () => {
        if (!open) return;
        setLoading(true);
        try {
            const res = await api.get('/tickets/ai-bundle', {
                params: {
                    ...(idsParam ? { ids: idsParam } : {}),
                    agent_platform: agentPlatform,
                    ai_mode: aiMode
                }
            });
            const list = Array.isArray(res.data?.data) ? res.data.data : [];
            setItems(list.map((t) => ({ ...t, ai_notes: t.ai_notes || '', custom_logs: t.custom_logs || '' })));
            setPromptPreview(res.data?.promptMarkdown || '');
        } catch (_) {
            addToast('No se pudo cargar el paquete IA de tickets', 'error');
        } finally {
            setLoading(false);
        }
    }, [open, idsParam, agentPlatform, aiMode, addToast]);

    useEffect(() => {
        if (open) loadBundle();
    }, [open, loadBundle]);

    if (!open) return null;

    const handleLogFileForTicket = (idx, file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = String(ev.target?.result || '').slice(0, 15000);
            setItems((prev) => prev.map((it, i) => {
                if (i !== idx) return it;
                const combined = it.custom_logs ? `${it.custom_logs.trim()}\n--- [${file.name}] ---\n${text}` : `--- [${file.name}] ---\n${text}`;
                return { ...it, custom_logs: combined };
            }));
            addToast(`Log "${file.name}" cargado en el ticket`, 'success');
        };
        reader.readAsText(file);
    };

    const handleGenerate = async (copyAfter = true) => {
        setBusy(true);
        try {
            const payload = {
                extraContext,
                ai_mode: aiMode,
                agent_platform: agentPlatform,
                items: items.map((t) => ({
                    id: t.id,
                    include_in_ai_prompt: 1,
                    ai_notes: t.ai_notes || '',
                    custom_logs: t.custom_logs || '',
                    ai_mode: aiMode,
                    agent_platform: agentPlatform
                }))
            };
            const res = await api.post('/tickets/ai-bundle/generate', payload);
            const md = res.data?.promptMarkdown || '';
            setPromptPreview(md);
            if (copyAfter && md) {
                try {
                    await navigator.clipboard.writeText(md);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 3000);
                    addToast('Prompt + Logs copiados al portapapeles', 'success');
                } catch {
                    addToast('Paquete IA actualizado', 'success');
                }
            } else {
                addToast('Vista previa del paquete IA actualizada', 'success');
            }
            if (onSuccess) onSuccess();
        } catch (_) {
            addToast('No se pudo generar el paquete para IA', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleRemoveTicket = async (ticketId) => {
        try {
            await api.put(`/tickets/${ticketId}/ai-review`, { include_in_ai_prompt: 0 });
            setItems((prev) => prev.filter((item) => Number(item.id) !== Number(ticketId)));
            addToast('Ticket retirado del lote para IA', 'info');
            if (onSuccess) onSuccess();
        } catch (_) {
            addToast('Error al quitar ticket del lote', 'error');
        }
    };

    const handleAutoTriage = async () => {
        setBusy(true);
        try {
            const res = await api.post('/tickets/ai-bundle/auto-triage');
            addToast(res.data?.message || 'Auto-Triaje IA completado', 'success');
            await loadBundle();
            if (onSuccess) onSuccess();
        } catch (_) {
            addToast('Error al ejecutar Auto-Triaje IA', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleResolveBatch = async () => {
        setBusy(true);
        try {
            const res = await api.post('/tickets/ai-bundle/resolve-batch', {
                ticketIds: items.map((t) => t.id),
                resolution_notes: batchNote,
                resolved_version: batchVersion || null
            });
            addToast(res.data?.message || 'Lote de tickets resuelto y notificado en tiempo real', 'success');
            setShowResolveConfirm(false);
            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al resolver el lote de tickets', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10020,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(2, 6, 23, 0.78)',
                backdropFilter: 'blur(4px)',
                padding: '0.75rem'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '960px',
                    maxHeight: '92vh',
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
                        padding: '0.85rem 1.15rem',
                        background: '#0f172a',
                        color: '#fff',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.6rem',
                        borderBottom: '1px solid #1e293b'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
                            <Bot size={21} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem' }}>
                                <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>
                                    Empaquetador Inteligente de Tickets &amp; Logs para IA
                                </h2>
                                <span style={{ padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800, background: 'rgba(99,102,241,0.25)', color: '#c7d2fe' }}>
                                    {items.length} ticket(s)
                                </span>
                            </div>
                            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                                Selecciona tickets técnicos, adjunta logs y resuelve en lote notificando a los usuarios en tiempo real.
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={handleAutoTriage}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.75rem', borderRadius: '8px', background: 'rgba(99,102,241,0.25)', color: '#e0e7ff', border: '1px solid rgba(99,102,241,0.4)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                            <Sparkles size={13} />
                            <span>{busy ? 'Procesando...' : 'Auto-Triaje IA'}</span>
                        </button>
                        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.3rem' }}>
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div className="form-grid form-grid-2" style={{ gap: '0.5rem' }}>
                        {Object.values(AI_EXECUTION_MODES).map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setAiMode(m.id)}
                                style={{
                                    textAlign: 'left',
                                    padding: '0.6rem 0.8rem',
                                    borderRadius: '10px',
                                    border: aiMode === m.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    background: aiMode === m.id ? 'var(--hover-bg)' : 'var(--bg)',
                                    color: 'var(--text)',
                                    cursor: 'pointer'
                                }}
                            >
                                <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>{m.icon} {m.label}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{m.desc}</div>
                            </button>
                        ))}
                    </div>

                    {aiMode === 'agent_prompt' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Plataforma:</span>
                            {Object.values(AGENT_PLATFORMS).map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setAgentPlatform(p.id)}
                                    style={{
                                        padding: '0.25rem 0.65rem',
                                        borderRadius: '8px',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        border: agentPlatform === p.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                                        background: agentPlatform === p.id ? 'var(--primary)' : 'var(--bg)',
                                        color: agentPlatform === p.id ? '#fff' : 'var(--text)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {p.icon} {p.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {loading ? (
                        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                            Armando paquete de tickets para IA...
                        </div>
                    ) : items.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <Bot size={34} color="var(--text-muted)" style={{ marginBottom: '0.5rem' }} />
                            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 700 }}>
                                No hay tickets seleccionados para el paquete de IA
                            </p>
                            <button
                                type="button"
                                onClick={handleAutoTriage}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.95rem', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <Sparkles size={14} /> Ejecutar Auto-Triaje con Agente IA
                            </button>
                        </div>
                    ) : (
                        <div className="form-grid form-grid-2" style={{ gap: '0.85rem', alignItems: 'start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        1. Directrices y Logs por Ticket ({items.length})
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleGenerate(false)}
                                        style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                    >
                                        <RefreshCw size={12} /> Actualizar vista previa
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '340px', overflowY: 'auto' }}>
                                    {items.map((t, idx) => (
                                        <div key={t.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)' }}>#{t.ticket_code}</span>
                                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t.type} · {t.priority}</span>
                                                        {t.diagnostic_relevance && t.diagnostic_relevance !== 'sin_errores' && (
                                                            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#ef4444' }}>
                                                                <AlertTriangle size={10} style={{ display: 'inline' }} /> Log {t.diagnostic_score || 0}%
                                                            </span>
                                                        )}
                                                        {t.screenshot_url && (
                                                            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#10b981' }}>
                                                                <ImageIcon size={10} style={{ display: 'inline' }} /> WebP
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '0.15rem' }}>{t.subject}</div>
                                                </div>
                                                <button type="button" onClick={() => handleRemoveTicket(t.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }} title="Retirar del lote">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)' }}>🎯 Instrucción técnica:</span>
                                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                                        <Upload size={11} /> Subir .log
                                                        <input type="file" accept=".log,.txt,.json" style={{ display: 'none' }} onChange={(e) => handleLogFileForTicket(idx, e.target.files?.[0])} />
                                                    </label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenLogsTicketId(openLogsTicketId === t.id ? null : t.id)}
                                                        style={{ padding: '0.1rem 0.45rem', borderRadius: '4px', background: '#0f172a', color: '#34d399', border: 'none', fontSize: '0.66rem', fontWeight: 700, cursor: 'pointer' }}
                                                    >
                                                        <Terminal size={10} style={{ display: 'inline', marginRight: '3px' }} />
                                                        {t.custom_logs ? 'Ver Logs' : 'Pegar Logs'}
                                                    </button>
                                                </div>
                                            </div>
                                            <textarea
                                                rows={2}
                                                value={t.ai_notes || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ai_notes: val } : it)));
                                                }}
                                                placeholder="Ej. Corregir validación en controlador / Ajustar vista..."
                                                className="form-input"
                                                style={{ width: '100%', fontSize: '0.76rem' }}
                                            />
                                            {(openLogsTicketId === t.id || t.custom_logs) && (
                                                <textarea
                                                    rows={3}
                                                    value={t.custom_logs || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, custom_logs: val } : it)));
                                                    }}
                                                    placeholder="Pega aquí las trazas de error o logs..."
                                                    style={{ width: '100%', background: '#0f172a', color: '#34d399', fontFamily: 'monospace', fontSize: '0.7rem', borderRadius: '8px', padding: '0.45rem', border: '1px solid #334155' }}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <input
                                    type="text"
                                    value={extraContext}
                                    onChange={(e) => setExtraContext(e.target.value)}
                                    placeholder="Instrucción global adicional para el lote (opcional)..."
                                    className="form-input"
                                    style={{ width: '100%', height: '36px', fontSize: '0.78rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <FileCode2 size={14} color="var(--primary)" /> 2. Prompt Markdown Generado
                                </span>
                                <textarea
                                    readOnly
                                    value={promptPreview}
                                    style={{
                                        width: '100%',
                                        minHeight: '320px',
                                        background: '#0f172a',
                                        color: '#f8fafc',
                                        fontFamily: 'monospace',
                                        fontSize: '0.72rem',
                                        padding: '0.75rem',
                                        borderRadius: '10px',
                                        border: '1px solid #1e293b',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {showResolveConfirm && items.length > 0 && (
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '12px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>
                                    Marcar los {items.length} tickets del paquete como RESUELTOS
                                </span>
                                <button type="button" onClick={() => setShowResolveConfirm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.74rem', cursor: 'pointer' }}>
                                    Cancelar
                                </button>
                            </div>
                            <div className="form-grid form-grid-2" style={{ gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    value={batchNote}
                                    onChange={(e) => setBatchNote(e.target.value)}
                                    placeholder="Nota general de solución para los usuarios..."
                                    className="form-input"
                                    style={{ height: '36px', fontSize: '0.78rem' }}
                                />
                                <input
                                    type="text"
                                    value={batchVersion}
                                    onChange={(e) => setBatchVersion(e.target.value)}
                                    placeholder="Versión desplegada (opcional)"
                                    className="form-input"
                                    style={{ height: '36px', fontSize: '0.78rem' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={handleResolveBatch}
                                    style={{ padding: '0.45rem 0.95rem', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                                >
                                    Confirmar y Notificar en Tiempo Real ({items.length})
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ padding: '0.75rem 1.15rem', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div>
                        {items.length > 0 && !showResolveConfirm && (
                            <button
                                type="button"
                                onClick={() => setShowResolveConfirm(true)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.42rem 0.85rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.14)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.35)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <CheckCircle2 size={14} /> Resolver Lote ({items.length}) y Notificar Usuarios
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button type="button" onClick={onClose} style={{ padding: '0.42rem 0.85rem', borderRadius: '8px', background: 'var(--hover-bg)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>
                            Cerrar
                        </button>
                        {items.length > 0 && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleGenerate(true)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 1rem', borderRadius: '8px', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                <span>{copied ? '¡Copiado al Portapapeles!' : 'Guardar Notas y Copiar Prompt IA'}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
