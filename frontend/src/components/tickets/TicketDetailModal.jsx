import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
    X, Ticket, CheckCircle2, Clock, Play, Lock, Send, MessageSquare,
    Image as ImageIcon, User, Building2, Globe, Sparkles, Paperclip, Bot, Terminal
} from 'lucide-react';
import api from '../../services/api';
import { socket } from '../../services/socket';
import { useToast } from '../Toast';
import { compressTicketImage } from '../../utils/ticketImageCompressor';
import TicketDiagnosticsPanel from './TicketDiagnosticsPanel';
import TicketAgyFlowModal from './TicketAgyFlowModal';

const STATUS_META = {
    abierto: { label: 'Abierto (Pendiente)', bg: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24' },
    en_proceso: { label: 'En Proceso', bg: 'rgba(14, 165, 233, 0.16)', color: '#38bdf8' },
    resuelto: { label: 'Resuelto', bg: 'rgba(16, 185, 129, 0.18)', color: '#34d399' },
    cerrado: { label: 'Cerrado', bg: 'rgba(148, 163, 184, 0.18)', color: '#94a3b8' }
};

const formatDateTimeLocal = (val) => {
    if (!val) return '—';
    try {
        return new Date(val).toLocaleString('es-SV', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return String(val);
    }
};

const TicketDetailModal = ({ open, ticketId, onClose, onUpdated, canManage = false }) => {
    const { addToast } = useToast();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [replyImageBase64, setReplyImageBase64] = useState(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [resolvedVersion, setResolvedVersion] = useState('');
    const [showResolveBox, setShowResolveBox] = useState(false);
    const [aiNotes, setAiNotes] = useState('');
    const [previewImageUrl, setPreviewImageUrl] = useState(null);
    const [agyOpen, setAgyOpen] = useState(false);
    const replyFileRef = useRef(null);

    const loadTicketDetail = useCallback(async (silent = false) => {
        if (!open || !ticketId) return;
        if (!silent) setLoading(true);
        try {
            const res = await api.get(`/tickets/${ticketId}`);
            const data = res.data?.data || res.data;
            setTicket(data);
            setAiNotes(data?.ai_notes || '');
        } catch (_) {
            if (!silent) addToast('No se pudo cargar el detalle del ticket', 'error');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [open, ticketId, addToast]);

    useEffect(() => {
        if (open && ticketId) {
            loadTicketDetail(false);
            const interval = setInterval(() => loadTicketDetail(true), 10000);
            return () => clearInterval(interval);
        }
    }, [open, ticketId, loadTicketDetail]);

    useEffect(() => {
        if (!open || !ticketId) return;
        const onSocketTicketEvent = (payload) => {
            const targetId = payload?.id || payload?.ticketId || payload?.ticket?.id;
            if (Number(targetId) === Number(ticketId)) {
                loadTicketDetail(true);
            }
        };
        socket.on('ticket:updated', onSocketTicketEvent);
        socket.on('ticket:resolved', onSocketTicketEvent);
        socket.on('ticket:message', onSocketTicketEvent);
        return () => {
            socket.off('ticket:updated', onSocketTicketEvent);
            socket.off('ticket:resolved', onSocketTicketEvent);
            socket.off('ticket:message', onSocketTicketEvent);
        };
    }, [open, ticketId, loadTicketDetail]);

    const parsedAttachments = useMemo(() => {
        if (!ticket) return [];
        let list = ticket.attachments || ticket.attachments_json;
        if (typeof list === 'string') {
            try { list = JSON.parse(list); } catch { list = []; }
        }
        if (Array.isArray(list) && list.length > 0) return list;
        return ticket.screenshot_url ? [{ url: ticket.screenshot_url, caption: '', annotated: false }] : [];
    }, [ticket]);

    const parsedDiagnostics = useMemo(() => {
        if (!ticket) return null;
        if (ticket.diagnostics && typeof ticket.diagnostics === 'object') return ticket.diagnostics;
        if (!ticket.diagnostics_json) return null;
        if (typeof ticket.diagnostics_json === 'object') return ticket.diagnostics_json;
        try { return JSON.parse(ticket.diagnostics_json); } catch { return null; }
    }, [ticket]);

    if (!open || !ticketId) return null;

    const handleStatusChange = async (newStatus, extra = {}) => {
        setBusy(true);
        try {
            const res = await api.put(`/tickets/${ticketId}/status`, {
                status: newStatus,
                ...extra
            });
            const updated = res.data?.data || res.data?.ticket;
            setTicket(updated);
            setShowResolveBox(false);
            addToast(
                newStatus === 'resuelto'
                    ? 'Ticket marcado como RESUELTO y notificado en tiempo real al usuario.'
                    : `Estado del ticket actualizado a ${STATUS_META[newStatus]?.label || newStatus}`,
                'success'
            );
            if (onUpdated) onUpdated(updated);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al actualizar el estado del ticket', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleConfirmResolve = (e) => {
        e.preventDefault();
        handleStatusChange('resuelto', {
            resolution_notes: resolutionNotes.trim() || 'Solicitud atendida y resuelta por el equipo técnico.',
            resolved_version: resolvedVersion.trim() || null
        });
    };

    const handleAiReview = async (nextInclude) => {
        setBusy(true);
        try {
            const res = await api.put(`/tickets/${ticketId}/ai-review`, {
                include_in_ai_prompt: nextInclude,
                ai_notes: aiNotes
            });
            const updated = res.data?.data || res.data?.ticket;
            setTicket(updated);
            addToast(nextInclude ? 'Ticket incluido en el paquete para IA' : 'Revisión para IA actualizada', 'success');
            if (onUpdated) onUpdated(updated);
        } catch (_) {
            addToast('No se pudo actualizar la instrucción para IA', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleReplyFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const compressed = await compressTicketImage(file);
        if (compressed) setReplyImageBase64(compressed);
    };

    const handleSendReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim() && !replyImageBase64) return;
        setBusy(true);
        try {
            const res = await api.post(`/tickets/${ticketId}/messages`, {
                message: replyText.trim() || 'Adjunto captura en seguimiento',
                attachment_base64: replyImageBase64 || null
            });
            const updated = res.data?.data || res.data?.ticket;
            setTicket(updated);
            setReplyText('');
            setReplyImageBase64(null);
            addToast('Comentario enviado en tiempo real', 'success');
            if (onUpdated) onUpdated(updated);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al enviar comentario', 'error');
        } finally {
            setBusy(false);
        }
    };

    const messages = Array.isArray(ticket?.messages) ? ticket.messages : [];
    const inAiBundle = Boolean(ticket?.include_in_ai_prompt);
    const stMeta = STATUS_META[ticket?.status] || STATUS_META.abierto;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9990,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(2, 6, 23, 0.68)',
                backdropFilter: 'blur(4px)',
                padding: '0.75rem',
                overflowY: 'auto'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '880px',
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
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.85rem 1.15rem',
                        background: '#0f172a',
                        color: '#fff',
                        borderBottom: '1px solid #1e293b'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', flexShrink: 0 }}>
                            <Ticket size={20} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem' }}>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 800, padding: '0.1rem 0.45rem', borderRadius: '6px', background: 'rgba(99,102,241,0.25)', color: '#c7d2fe' }}>
                                    {ticket?.code || ticket?.ticket_code || `#${ticketId}`}
                                </span>
                                {ticket?.status && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', padding: '0.12rem 0.55rem', borderRadius: '999px', background: stMeta.bg, color: stMeta.color }}>
                                        {stMeta.label}
                                    </span>
                                )}
                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                                    {ticket?.type} · Prioridad {ticket?.priority}
                                </span>
                            </div>
                            <h2 style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ticket?.subject || 'Cargando detalle...'}
                            </h2>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.35rem' }}>
                        <X size={18} />
                    </button>
                </div>

                {loading && !ticket ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Cargando información del ticket...
                    </div>
                ) : !ticket ? null : (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                        {/* Metadata row */}
                        <div className="form-grid form-grid-3" style={{ gap: '0.6rem', background: 'var(--bg)', padding: '0.7rem 0.85rem', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <User size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Solicitado por</span>
                                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{ticket.creator_name || ticket.user_name}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Building2 size={15} color="#10b981" style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sistema / Módulo</span>
                                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{ticket.module_name || 'SIPE Admin'}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={15} color="#f59e0b" style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fecha de Creación</span>
                                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{formatDateTimeLocal(ticket.created_at)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Description + Attachments */}
                        <div className={parsedAttachments.length > 0 ? 'form-grid form-grid-2' : ''} style={{ gap: '0.85rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem' }}>
                                    <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                        Descripción y Comentarios
                                    </span>
                                    <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text)', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                                        {ticket.description}
                                    </p>
                                    {ticket.page_url && (
                                        <div style={{ marginTop: '0.65rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                            <Globe size={12} />
                                            <span>Ruta: {ticket.page_url}</span>
                                        </div>
                                    )}
                                </div>

                                {ticket.status === 'resuelto' && (
                                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '10px', padding: '0.85rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.3rem' }}>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <CheckCircle2 size={15} /> Resuelto por {ticket.resolved_by_name || 'Soporte Técnico'}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: '#10b981' }}>{formatDateTimeLocal(ticket.resolved_at)}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text)', fontWeight: 600, whiteSpace: 'pre-line' }}>
                                            {ticket.resolution_notes}
                                        </p>
                                        <div style={{ marginTop: '0.45rem', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <Sparkles size={12} color="#10b981" />
                                            <span>
                                                {ticket.creator_notified_at
                                                    ? `El usuario confirmó de enterado el ${formatDateTimeLocal(ticket.creator_notified_at)}`
                                                    : 'Notificación y pop-up de resuelto activos para el usuario creador'}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {parsedAttachments.length > 0 && (
                                <div style={{ background: '#0f172a', borderRadius: '10px', padding: '0.75rem', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', textTransform: 'uppercase', color: '#cbd5e1' }}>
                                        <ImageIcon size={13} color="#818cf8" /> Capturas Adjuntas ({parsedAttachments.length})
                                    </span>
                                    <div style={{ display: 'grid', gridTemplateColumns: parsedAttachments.length > 1 ? 'repeat(auto-fit, minmax(150px, 1fr))' : '1fr', gap: '0.5rem' }}>
                                        {parsedAttachments.map((att, idx) => (
                                            <div key={idx} style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewImageUrl(att.url)}
                                                    style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'zoom-in', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: '165px', overflow: 'hidden' }}
                                                >
                                                    <img src={att.url} alt={`Captura ${idx + 1}`} style={{ maxHeight: '165px', width: 'auto', objectFit: 'contain' }} />
                                                    {att.annotated && (
                                                        <span style={{ position: 'absolute', top: '4px', left: '4px', padding: '0.1rem 0.4rem', borderRadius: '4px', background: '#4f46e5', color: '#fff', fontSize: '0.62rem', fontWeight: 700 }}>
                                                            Con trazos
                                                        </span>
                                                    )}
                                                </button>
                                                {att.caption && (
                                                    <div style={{ fontSize: '0.7rem', color: '#cbd5e1', padding: '0 0.25rem' }}>&ldquo;{att.caption}&rdquo;</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {parsedDiagnostics && <TicketDiagnosticsPanel diagnostics={parsedDiagnostics} compact={false} />}

                        {/* Technician / Admin Actions */}
                        {canManage && (
                            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                        Acciones de Soporte y Consola AGY
                                    </span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setAgyOpen(true)}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.7rem', borderRadius: '8px', background: '#0f172a', color: '#34d399', border: '1px solid #334155', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            <Terminal size={13} />
                                            <span>{ticket.agy_plan_version ? `Plan AGY v${ticket.agy_plan_version}` : 'Planificar AGY'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => handleAiReview(!inAiBundle)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                padding: '0.38rem 0.7rem',
                                                borderRadius: '8px',
                                                background: inAiBundle ? '#4f46e5' : 'var(--card-bg)',
                                                color: inAiBundle ? '#fff' : 'var(--text)',
                                                border: inAiBundle ? '1px solid #4f46e5' : '1px solid var(--border)',
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Bot size={13} />
                                            <span>{inAiBundle ? 'En Paquete IA ✓' : 'Paquete IA'}</span>
                                        </button>
                                        {ticket.status !== 'en_proceso' && ticket.status !== 'resuelto' && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => handleStatusChange('en_proceso')}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.38rem 0.7rem', borderRadius: '8px', background: '#0284c7', color: '#fff', border: 'none', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                <Play size={12} /> En Proceso
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setShowResolveBox((v) => !v)}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.8rem', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            <CheckCircle2 size={13} />
                                            <span>{ticket.status === 'resuelto' ? 'Actualizar Solución' : 'Marcar Resuelto'}</span>
                                        </button>
                                        {ticket.status !== 'cerrado' && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => handleStatusChange('cerrado')}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.38rem 0.7rem', borderRadius: '8px', background: 'var(--hover-bg)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                <Lock size={12} /> Cerrar
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', paddingTop: '0.45rem', borderTop: '1px solid var(--border)' }}>
                                    <input
                                        type="text"
                                        value={aiNotes}
                                        onChange={(e) => setAiNotes(e.target.value)}
                                        placeholder="Comentario / instrucción técnica para que la IA resuelva este ticket..."
                                        className="form-input"
                                        style={{ flex: '1 1 240px', height: '36px', fontSize: '0.78rem' }}
                                    />
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleAiReview(1)}
                                        style={{ height: '36px', padding: '0 0.85rem', borderRadius: '8px', background: 'rgba(79,70,229,0.14)', color: 'var(--primary)', border: '1px solid rgba(79,70,229,0.35)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Guardar Nota para IA
                                    </button>
                                </div>

                                {showResolveBox && (
                                    <form onSubmit={handleConfirmResolve} style={{ paddingTop: '0.6rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                        <div className="form-grid form-grid-2" style={{ gap: '0.55rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                                    Nota de Solución (la verá el usuario en su pop-up)
                                                </label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={resolutionNotes}
                                                    onChange={(e) => setResolutionNotes(e.target.value)}
                                                    placeholder="Describe qué se corrigió o implementó..."
                                                    className="form-input"
                                                    style={{ width: '100%', height: '36px', fontSize: '0.8rem' }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                                                    Versión (Opcional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={resolvedVersion}
                                                    onChange={(e) => setResolvedVersion(e.target.value)}
                                                    placeholder="Ej. 1.0.85"
                                                    className="form-input"
                                                    style={{ width: '100%', height: '36px', fontSize: '0.8rem' }}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                                            <button type="button" onClick={() => setShowResolveBox(false)} style={{ padding: '0.38rem 0.75rem', borderRadius: '8px', background: 'var(--hover-bg)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                                                Cancelar
                                            </button>
                                            <button type="submit" disabled={busy} style={{ padding: '0.38rem 0.95rem', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer' }}>
                                                Confirmar y Notificar en Tiempo Real
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        )}

                        {/* Follow-up Messages */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <MessageSquare size={14} color="var(--primary)" /> Historial de Seguimiento ({messages.length})
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '210px', overflowY: 'auto' }}>
                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        style={{
                                            padding: '0.65rem 0.8rem',
                                            borderRadius: '10px',
                                            border: '1px solid var(--border)',
                                            background: msg.sender_role === 'tech' ? 'rgba(79, 70, 229, 0.08)' : 'var(--bg)',
                                            fontSize: '0.78rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.2rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{msg.sender_name}</span>
                                                <span style={{ fontSize: '0.64rem', fontWeight: 700, padding: '0.08rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase', background: msg.source === 'telegram' ? 'rgba(14,165,233,0.18)' : 'var(--hover-bg)', color: msg.source === 'telegram' ? '#0284c7' : 'var(--text-muted)' }}>
                                                    {msg.source === 'telegram' ? 'Telegram' : 'Web'}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{formatDateTimeLocal(msg.created_at)}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text)', whiteSpace: 'pre-line' }}>{msg.message}</p>
                                        {msg.attachment_url && (
                                            <button type="button" onClick={() => setPreviewImageUrl(msg.attachment_url)} style={{ marginTop: '0.4rem', background: 'none', border: 'none', padding: 0, cursor: 'zoom-in' }}>
                                                <img src={msg.attachment_url} alt="Adjunto" style={{ maxHeight: '110px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {replyImageBase64 && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg)', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.75rem' }}>
                                    <img src={replyImageBase64} alt="Previsualización" style={{ height: '30px', width: 'auto', borderRadius: '4px' }} />
                                    <span style={{ fontWeight: 600 }}>Imagen WebP lista</span>
                                    <button type="button" onClick={() => setReplyImageBase64(null)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 700, cursor: 'pointer' }}>
                                        Quitar
                                    </button>
                                </div>
                            )}

                            <form onSubmit={handleSendReply} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem' }}>
                                <button
                                    type="button"
                                    onClick={() => replyFileRef.current?.click()}
                                    style={{ height: '36px', width: '36px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                    title="Adjuntar captura al comentario"
                                >
                                    <Paperclip size={15} />
                                </button>
                                <input ref={replyFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleReplyFile} />
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Escribe un comentario o adjunta otra captura..."
                                    className="form-input"
                                    style={{ flex: '1 1 220px', height: '36px', fontSize: '0.8rem' }}
                                />
                                <button
                                    type="submit"
                                    disabled={busy || (!replyText.trim() && !replyImageBase64)}
                                    style={{ height: '36px', padding: '0 0.95rem', borderRadius: '8px', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', opacity: (busy || (!replyText.trim() && !replyImageBase64)) ? 0.5 : 1 }}
                                >
                                    <Send size={14} /> Enviar
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>

            <TicketAgyFlowModal open={agyOpen} ticketId={ticketId} onClose={() => setAgyOpen(false)} onUpdated={() => loadTicketDetail(true)} />

            {previewImageUrl && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 10030, background: 'rgba(2,6,23,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={(e) => { e.stopPropagation(); setPreviewImageUrl(null); }}
                >
                    <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem' }}>
                        <a href={previewImageUrl} download onClick={(e) => e.stopPropagation()} style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', background: '#4f46e5', color: '#fff', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}>
                            Descargar Imagen
                        </a>
                        <button type="button" onClick={() => setPreviewImageUrl(null)} style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', background: '#1e293b', color: '#fff', border: 'none', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                            Cerrar Vista
                        </button>
                    </div>
                    <img src={previewImageUrl} alt="Vista ampliada" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '84vh', objectFit: 'contain', borderRadius: '10px', border: '1px solid #334155' }} />
                </div>
            )}
        </div>
    );
};

export default TicketDetailModal;
