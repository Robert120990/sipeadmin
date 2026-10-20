import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Terminal, WifiOff } from 'lucide-react';

const RELEVANCE_STYLES = {
    alta: {
        label: 'Alta relación con el problema reportado',
        bg: 'rgba(239, 68, 68, 0.1)',
        border: 'rgba(239, 68, 68, 0.35)',
        color: '#ef4444',
        badgeBg: 'rgba(239, 68, 68, 0.18)'
    },
    media: {
        label: 'Relación probable con errores recientes',
        bg: 'rgba(245, 158, 11, 0.1)',
        border: 'rgba(245, 158, 11, 0.35)',
        color: '#d97706',
        badgeBg: 'rgba(245, 158, 11, 0.18)'
    },
    baja: {
        label: 'Eventos técnicos secundarios en sesión',
        bg: 'rgba(100, 116, 139, 0.08)',
        border: 'var(--border)',
        color: 'var(--text-muted)',
        badgeBg: 'rgba(100, 116, 139, 0.15)'
    },
    sin_errores: {
        label: 'Sin errores en consola ni red',
        bg: 'rgba(16, 185, 129, 0.08)',
        border: 'rgba(16, 185, 129, 0.3)',
        color: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.16)'
    }
};

const TicketDiagnosticsPanel = ({ diagnostics, compact = false }) => {
    const [expanded, setExpanded] = useState(!compact);

    if (!diagnostics) return null;

    const rel = diagnostics.relevance || 'sin_errores';
    const meta = RELEVANCE_STYLES[rel] || RELEVANCE_STYLES.sin_errores;
    const netErrors = Array.isArray(diagnostics.networkErrors) ? diagnostics.networkErrors : [];
    const rtErrors = Array.isArray(diagnostics.runtimeErrors) ? diagnostics.runtimeErrors : [];
    const conErrors = Array.isArray(diagnostics.consoleErrors) ? diagnostics.consoleErrors : [];
    const totalEvents = netErrors.length + rtErrors.length + conErrors.length;

    return (
        <div
            style={{
                borderRadius: '10px',
                border: `1px solid ${meta.border}`,
                background: meta.bg,
                padding: '0.65rem 0.85rem',
                fontSize: '0.78rem'
            }}
        >
            <div
                onClick={() => setExpanded((v) => !v)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    cursor: 'pointer'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    {rel === 'sin_errores' ? (
                        <CheckCircle2 size={16} color={meta.color} style={{ flexShrink: 0 }} />
                    ) : rel === 'alta' ? (
                        <AlertTriangle size={16} color={meta.color} style={{ flexShrink: 0 }} />
                    ) : (
                        <Activity size={16} color={meta.color} style={{ flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                                Diagnóstico Técnico Automático
                            </span>
                            <span
                                style={{
                                    padding: '0.1rem 0.45rem',
                                    borderRadius: '999px',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    background: meta.badgeBg,
                                    color: meta.color
                                }}
                            >
                                {meta.label} ({diagnostics.relevanceScore || 0}%)
                            </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            {diagnostics.summary || `${totalEvents} evento(s) técnico(s) registrados`}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '0.2rem'
                    }}
                >
                    {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
            </div>

            {expanded && (
                <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {diagnostics.currentRoute && (
                            <span style={{ background: 'var(--card-bg)', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                Ruta: {diagnostics.currentRoute}
                            </span>
                        )}
                        {diagnostics.viewport && (
                            <span style={{ background: 'var(--card-bg)', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                Viewport: {diagnostics.viewport}
                            </span>
                        )}
                    </div>

                    {totalEvents === 0 ? (
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                            No se detectaron fallos HTTP (4xx/5xx) ni excepciones de JavaScript en el navegador.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '160px', overflowY: 'auto' }}>
                            {netErrors.map((err, i) => (
                                <div key={`net-${i}`} style={{ background: '#0f172a', color: '#f8fafc', borderRadius: '6px', padding: '0.4rem 0.55rem', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fb7185', fontWeight: 700 }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <WifiOff size={11} /> HTTP {err.status || 'ERR'} · {err.method} {err.url}
                                        </span>
                                        <span style={{ color: '#94a3b8' }}>{err.ts ? new Date(err.ts).toLocaleTimeString() : ''}</span>
                                    </div>
                                    <div style={{ color: '#cbd5e1', marginTop: '0.15rem' }}>{err.message}</div>
                                </div>
                            ))}
                            {rtErrors.map((err, i) => (
                                <div key={`rt-${i}`} style={{ background: '#0f172a', color: '#fde68a', borderRadius: '6px', padding: '0.4rem 0.55rem', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                    <div style={{ fontWeight: 700, color: '#fbbf24' }}>
                                        <Terminal size={11} style={{ display: 'inline', marginRight: '4px' }} />
                                        Excepción JS ({err.type || 'runtime'}) {err.source ? `en ${err.source}` : ''}
                                    </div>
                                    <div style={{ color: '#e2e8f0', marginTop: '0.15rem' }}>{err.message}</div>
                                </div>
                            ))}
                            {conErrors.map((err, i) => (
                                <div key={`con-${i}`} style={{ background: '#0f172a', color: '#cbd5e1', borderRadius: '6px', padding: '0.35rem 0.55rem', fontFamily: 'monospace', fontSize: '0.68rem' }}>
                                    <span style={{ color: '#94a3b8' }}>[console.error]</span> {err.message}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TicketDiagnosticsPanel;
