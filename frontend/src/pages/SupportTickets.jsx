import React, { useState, useEffect, useCallback } from 'react';
import {
    Ticket, Camera, Eye, Image as ImageIcon, CheckCircle2,
    Clock, AlertCircle, Lock, Sparkles, Keyboard, Bot, Terminal, ChevronLeft, ChevronRight
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useTickets } from '../context/TicketContext';
import {
    TicketSummaryCards,
    TicketFiltersBar,
    TicketAiBundleModal,
    TicketAgyFlowModal
} from '../components/tickets';

const STATUS_CONFIG = {
    abierto: {
        label: 'Abierto (Pendiente)',
        bg: 'rgba(245, 158, 11, 0.14)',
        color: '#d97706',
        border: 'rgba(245, 158, 11, 0.35)',
        icon: AlertCircle
    },
    en_proceso: {
        label: 'En Proceso',
        bg: 'rgba(2, 132, 199, 0.14)',
        color: '#0284c7',
        border: 'rgba(2, 132, 199, 0.35)',
        icon: Clock
    },
    resuelto: {
        label: 'Resuelto',
        bg: 'rgba(16, 185, 129, 0.14)',
        color: '#059669',
        border: 'rgba(16, 185, 129, 0.35)',
        icon: CheckCircle2
    },
    cerrado: {
        label: 'Cerrado',
        bg: 'rgba(100, 116, 139, 0.14)',
        color: '#64748b',
        border: 'rgba(100, 116, 139, 0.35)',
        icon: Lock
    }
};

const PRIORITY_STYLES = {
    baja: { bg: 'rgba(100, 116, 139, 0.12)', color: 'var(--text-muted)' },
    media: { bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706' },
    alta: { bg: 'rgba(249, 115, 22, 0.15)', color: '#ea580c' },
    urgente: { bg: 'rgba(239, 68, 68, 0.16)', color: '#ef4444' }
};

const TYPE_LABELS = {
    problema: 'Problema / Error',
    requerimiento: 'Requerimiento',
    mejora: 'Mejora',
    consulta: 'Consulta'
};

const formatDateTime = (val) => {
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

export default function SupportTickets() {
    const { addToast } = useToast();
    const { openQuickTicket, openTicketDetail, canManageTickets, ticketRefreshVersion, triggerTicketRefresh } = useTickets();

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [status, setStatus] = useState('');
    const [type, setType] = useState('');
    const [priority, setPriority] = useState('');
    const [mineOnly, setMineOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(15);

    const [tickets, setTickets] = useState([]);
    const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
    const [statsData, setStatsData] = useState({});
    const [isLoading, setIsLoading] = useState(false);

    const [aiBundleOpen, setAiBundleOpen] = useState(false);
    const [agyTicketId, setAgyTicketId] = useState(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [search]);

    const loadTicketsAndStats = useCallback(async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const [listRes, statsRes] = await Promise.all([
                api.get('/tickets', {
                    params: {
                        search: debouncedSearch || undefined,
                        page,
                        limit,
                        status: status || undefined,
                        type: type || undefined,
                        priority: priority || undefined,
                        mine: mineOnly ? 'true' : undefined
                    }
                }),
                api.get('/tickets/stats')
            ]);

            setTickets(Array.isArray(listRes.data?.data) ? listRes.data.data : []);
            setPagination(listRes.data?.pagination || { total: 0, page: 1, totalPages: 1 });
            setStatsData(statsRes.data?.data || {});
        } catch (_) {
            if (!silent) addToast('Error al cargar tickets de soporte', 'error');
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, [debouncedSearch, page, limit, status, type, priority, mineOnly, addToast]);

    useEffect(() => {
        loadTicketsAndStats(false);
    }, [loadTicketsAndStats]);

    // Recargar automáticamente en tiempo real cuando llegan eventos por Socket.io
    useEffect(() => {
        if (ticketRefreshVersion > 0) {
            loadTicketsAndStats(true);
        }
    }, [ticketRefreshVersion, loadTicketsAndStats]);

    const handleToggleAi = async (id, nextVal) => {
        try {
            await api.put(`/tickets/${id}/ai-review`, { include_in_ai_prompt: nextVal });
            addToast(nextVal ? 'Ticket agregado al paquete para IA' : 'Ticket retirado del paquete para IA', 'success');
            loadTicketsAndStats(true);
        } catch (_) {
            addToast('No se pudo actualizar la selección para IA', 'error');
        }
    };

    const handleResetFilters = () => {
        setSearch('');
        setDebouncedSearch('');
        setStatus('');
        setType('');
        setPriority('');
        setMineOnly(false);
        setPage(1);
    };

    const aiSelectedCount = Number(statsData?.seleccionados_ia || 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Page Header */}
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.22rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Ticket size={21} color="var(--primary)" />
                        <span>Centro de Soporte y Tickets</span>
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.15rem 0.55rem',
                                borderRadius: '999px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: 'rgba(16, 185, 129, 0.14)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.35)'
                            }}
                        >
                            <Sparkles size={11} /> Tiempo Real · Conectado con sys.sipesv.com
                        </span>
                    </h1>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Reporta problemas o requerimientos con captura WebP anotada. Recibe notificaciones en vivo de estado pendiente y resuelto.
                    </p>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.65rem',
                            borderRadius: '8px',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border)',
                            fontSize: '0.74rem',
                            color: 'var(--text-muted)'
                        }}
                    >
                        <Keyboard size={14} color="var(--primary)" />
                        <span>Atajo:</span>
                        <kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>
                            Ctrl+K
                        </kbd>
                        <span>→ <strong style={{ color: 'var(--primary)' }}>ticket</strong></span>
                    </div>

                    {canManageTickets && (
                        <button
                            type="button"
                            onClick={() => setAiBundleOpen(true)}
                            style={{
                                height: '36px',
                                padding: '0 0.9rem',
                                borderRadius: '8px',
                                background: '#0f172a',
                                color: '#fff',
                                border: '1px solid #334155',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                cursor: 'pointer'
                            }}
                        >
                            <Bot size={15} color="#818cf8" />
                            <span>Empaquetar Prompt IA</span>
                            <span style={{ padding: '0.08rem 0.45rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800, background: 'rgba(99,102,241,0.3)', color: '#c7d2fe' }}>
                                {aiSelectedCount}
                            </span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => openQuickTicket({ autoCapture: true })}
                        className="btn-primary"
                        style={{
                            height: '36px',
                            padding: '0 1rem',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <Camera size={15} />
                        <span>Nuevo Ticket con Captura</span>
                    </button>
                </div>
            </div>

            <TicketSummaryCards
                stats={statsData}
                activeStatus={status}
                onSelectStatus={(s) => {
                    setStatus((prev) => (prev === s ? '' : s));
                    setPage(1);
                }}
            />

            <TicketFiltersBar
                search={search}
                onSearchChange={setSearch}
                status={status}
                onStatusChange={(v) => { setStatus(v); setPage(1); }}
                type={type}
                onTypeChange={(v) => { setType(v); setPage(1); }}
                priority={priority}
                onPriorityChange={(v) => { setPriority(v); setPage(1); }}
                mineOnly={mineOnly}
                onMineOnlyChange={(v) => { setMineOnly(v); setPage(1); }}
                canManage={canManageTickets}
                onReset={handleResetFilters}
            />

            <div className="card glass table-responsive" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%', minWidth: '880px', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Código</th>
                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Asunto / Módulo</th>
                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Tipo</th>
                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Prioridad</th>
                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Solicitante</th>
                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Estado</th>
                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Fecha</th>
                            <th style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    Cargando listado de tickets...
                                </td>
                            </tr>
                        ) : tickets.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <Ticket size={30} style={{ margin: '0 auto 0.4rem auto', opacity: 0.4, display: 'block' }} />
                                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text)' }}>
                                        No se encontraron tickets de soporte
                                    </div>
                                    <div style={{ fontSize: '0.76rem', marginTop: '0.2rem' }}>
                                        Usa el botón &ldquo;Nuevo Ticket con Captura&rdquo; o presiona Ctrl + K y escribe &ldquo;ticket&rdquo;.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            tickets.map((t) => {
                                const st = STATUS_CONFIG[t.status] || STATUS_CONFIG.abierto;
                                const StIcon = st.icon;
                                const prio = PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.media;
                                const inAi = Boolean(t.include_in_ai_prompt);

                                return (
                                    <tr
                                        key={t.id}
                                        onClick={() => openTicketDetail(t.id)}
                                        style={{
                                            cursor: 'pointer',
                                            background: inAi ? 'rgba(79, 70, 229, 0.05)' : undefined
                                        }}
                                    >
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span
                                                    style={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 800,
                                                        color: 'var(--primary)',
                                                        background: 'rgba(79, 70, 229, 0.1)',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '6px'
                                                    }}
                                                >
                                                    {t.code || t.ticket_code}
                                                </span>
                                                {t.screenshot_url && (
                                                    <ImageIcon size={14} color="var(--text-muted)" title="Contiene captura de pantalla WebP" />
                                                )}
                                            </div>
                                        </td>

                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', maxWidth: '340px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <span style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {t.subject}
                                                </span>
                                                {t.diagnostic_relevance === 'alta' && (
                                                    <span style={{ flexShrink: 0, padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, background: 'rgba(239,68,68,0.16)', color: '#ef4444' }}>
                                                        Error Log {t.diagnostic_score ? `${t.diagnostic_score}%` : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {t.module_name || 'SIPE Admin'} {t.company_name ? `· ${t.company_name}` : ''}
                                                {t.ai_notes ? ` · 🎯 Nota IA: "${t.ai_notes}"` : ''}
                                            </div>
                                        </td>

                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                            {TYPE_LABELS[t.type] || t.type}
                                        </td>

                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '999px',
                                                    background: prio.bg,
                                                    color: prio.color
                                                }}
                                            >
                                                {t.priority}
                                            </span>
                                        </td>

                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {t.creator_name || t.user_name}
                                        </td>

                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '999px',
                                                    background: st.bg,
                                                    color: st.color,
                                                    border: `1px solid ${st.border}`
                                                }}
                                            >
                                                <StIcon size={12} />
                                                <span>{st.label}</span>
                                            </span>
                                        </td>

                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {formatDateTime(t.created_at)}
                                        </td>

                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                {canManageTickets && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => setAgyTicketId(t.id)}
                                                            title="Aprobar ticket y ejecutar flujo en Consola AGY"
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.25rem',
                                                                padding: '0.25rem 0.55rem',
                                                                borderRadius: '6px',
                                                                background: '#0f172a',
                                                                color: '#34d399',
                                                                border: '1px solid #334155',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <Terminal size={12} />
                                                            <span>{t.agy_plan_version ? `AGY v${t.agy_plan_version}` : 'AGY'}</span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleAi(t.id, !inAi)}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.25rem',
                                                                padding: '0.25rem 0.55rem',
                                                                borderRadius: '6px',
                                                                background: inAi ? '#4f46e5' : 'var(--bg)',
                                                                color: inAi ? '#fff' : 'var(--text)',
                                                                border: inAi ? '1px solid #4f46e5' : '1px solid var(--border)',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <Bot size={12} />
                                                            <span>{inAi ? 'En IA ✓' : 'IA'}</span>
                                                        </button>
                                                    </>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => openTicketDetail(t.id)}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.25rem',
                                                        padding: '0.25rem 0.6rem',
                                                        borderRadius: '6px',
                                                        background: 'var(--hover-bg)',
                                                        color: 'var(--text)',
                                                        border: '1px solid var(--border)',
                                                        fontSize: '0.73rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <Eye size={13} />
                                                    <span>Detalle</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>

                {/* Compact Pagination Footer */}
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        padding: '0.6rem 0.9rem',
                        borderTop: '1px solid var(--border)',
                        fontSize: '0.76rem',
                        color: 'var(--text-muted)'
                    }}
                >
                    <div>
                        Mostrando <strong>{tickets.length}</strong> de <strong>{pagination.total || 0}</strong> tickets
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                        <select
                            value={limit}
                            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                            className="form-input"
                            style={{ height: '30px', fontSize: '0.74rem', padding: '0 0.45rem', width: 'auto' }}
                        >
                            <option value={10}>10 / pág</option>
                            <option value={15}>15 / pág</option>
                            <option value={25}>25 / pág</option>
                            <option value={50}>50 / pág</option>
                        </select>
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            style={{ height: '30px', padding: '0 0.55rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1, display: 'inline-flex', alignItems: 'center' }}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontWeight: 700, color: 'var(--text)', padding: '0 0.35rem' }}>
                            Pág. {pagination.page || page} de {pagination.totalPages || 1}
                        </span>
                        <button
                            type="button"
                            disabled={page >= (pagination.totalPages || 1)}
                            onClick={() => setPage((p) => p + 1)}
                            style={{ height: '30px', padding: '0 0.55rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: page >= (pagination.totalPages || 1) ? 'not-allowed' : 'pointer', opacity: page >= (pagination.totalPages || 1) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center' }}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <TicketAiBundleModal
                open={aiBundleOpen}
                onClose={() => setAiBundleOpen(false)}
                onSuccess={() => {
                    triggerTicketRefresh();
                    loadTicketsAndStats(true);
                }}
            />

            <TicketAgyFlowModal
                open={Boolean(agyTicketId)}
                ticketId={agyTicketId}
                onClose={() => setAgyTicketId(null)}
                onUpdated={() => {
                    triggerTicketRefresh();
                    loadTicketsAndStats(true);
                }}
            />
        </div>
    );
}
