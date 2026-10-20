import React from 'react';
import { CheckCircle2, Sparkles, Eye, Check, GitCommit } from 'lucide-react';

const TicketResolvedModal = ({ ticket, onAcknowledge, onViewDetail }) => {
    if (!ticket) return null;

    const code = ticket.code || ticket.ticket_code || `#${ticket.id}`;
    const resolvedVersion = ticket.resolved_version || null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10010,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(2, 6, 23, 0.72)',
                backdropFilter: 'blur(4px)',
                padding: '1rem'
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '480px',
                    background: 'var(--card-bg)',
                    color: 'var(--text)',
                    borderRadius: '18px',
                    border: '2px solid rgba(16, 185, 129, 0.45)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden'
                }}
            >
                <div
                    style={{
                        background: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
                        padding: '1.25rem 1.35rem',
                        color: '#fff',
                        position: 'relative'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <div
                            style={{
                                width: '46px',
                                height: '46px',
                                borderRadius: '14px',
                                background: 'rgba(255,255,255,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}
                        >
                            <CheckCircle2 size={26} color="#fff" />
                        </div>
                        <div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', background: 'rgba(255,255,255,0.22)' }}>
                                    ¡Ticket Resuelto!
                                </span>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.76rem', fontWeight: 700, opacity: 0.92 }}>
                                    {code}
                                </span>
                                {resolvedVersion && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.12rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(2, 6, 23, 0.35)' }}>
                                        <GitCommit size={11} /> v{resolvedVersion}
                                    </span>
                                )}
                            </div>
                            <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.05rem', fontWeight: 800 }}>
                                Tu solicitud ha sido atendida
                            </h3>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '1.15rem 1.35rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div>
                        <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            Asunto del Ticket
                        </span>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)' }}>
                            {ticket.subject}
                        </p>
                    </div>

                    <div
                        style={{
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '12px',
                            padding: '0.8rem 0.95rem'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.3rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>
                                <Sparkles size={13} /> Respuesta de Soporte ({ticket.resolved_by_name || 'Equipo Técnico'})
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text)', whiteSpace: 'pre-line', lineHeight: 1.45 }}>
                            {ticket.resolution_notes || 'El requerimiento o incidente reportado ya fue solucionado y desplegado.'}
                        </p>
                    </div>

                    {ticket.screenshot_url && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', background: 'var(--bg)', padding: '0.5rem 0.65rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <img
                                src={ticket.screenshot_url}
                                alt="Captura"
                                style={{ width: '56px', height: '40px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }}
                            />
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                <strong style={{ display: 'block', color: 'var(--text)' }}>Captura original adjunta</strong>
                                Módulo: {ticket.module_name || 'SIPE Admin'}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.35rem' }}>
                        {onViewDetail && (
                            <button
                                type="button"
                                onClick={() => onViewDetail(ticket.id)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.5rem 0.85rem',
                                    borderRadius: '10px',
                                    background: 'var(--hover-bg)',
                                    color: 'var(--text)',
                                    border: '1px solid var(--border)',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                <Eye size={14} /> Ver Detalle
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onAcknowledge(ticket.id)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                padding: '0.55rem 1.15rem',
                                borderRadius: '10px',
                                background: '#10b981',
                                color: '#fff',
                                border: 'none',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                            }}
                        >
                            <Check size={16} />
                            <span>Enterado, ¡Muchas Gracias!</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TicketResolvedModal;
