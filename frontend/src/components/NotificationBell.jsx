import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { useConfirm } from './ConfirmDialog';
import api from '../services/api';
import {
    Bell,
    CheckCheck,
    Check,
    Trash2,
    ClipboardCheck,
    CheckCircle2,
    MessageSquare,
    Info,
    X,
    ExternalLink,
    Clock,
    PlayCircle,
    Calendar,
    User,
    Tag,
    Bot
} from 'lucide-react';

/**
 * Format relative time in Spanish
 */
function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Hace un momento';
    if (diffMin === 1) return 'Hace 1 minuto';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHours === 1) return 'Hace 1 hora';
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;

    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * Render icon for notification type
 */
function getNotificationIcon(type) {
    switch (type) {
        case 'task_assigned':
            return {
                icon: <ClipboardCheck size={16} />,
                bg: 'rgba(59, 130, 246, 0.15)',
                color: '#3b82f6'
            };
        case 'task_completed':
            return {
                icon: <CheckCircle2 size={16} />,
                bg: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981'
            };
        case 'ticket_resolved':
            return {
                icon: <CheckCircle2 size={16} />,
                bg: 'rgba(16, 185, 129, 0.18)',
                color: '#10b981'
            };
        case 'ticket_pending':
        case 'ticket_created':
            return {
                icon: <ClipboardCheck size={16} />,
                bg: 'rgba(245, 158, 11, 0.18)',
                color: '#f59e0b'
            };
        case 'ticket_comment':
        case 'task_comment':
            return {
                icon: <MessageSquare size={16} />,
                bg: 'rgba(139, 92, 246, 0.15)',
                color: '#8b5cf6'
            };
        default:
            return {
                icon: <Info size={16} />,
                bg: 'rgba(100, 116, 139, 0.15)',
                color: '#64748b'
            };
    }
}

/**
 * NotificationBell Component
 */
export default function NotificationBell({ isMobile = false }) {
    const {
        notifications,
        unreadCount,
        bellRinging,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll
    } = useNotifications();
    const { confirm } = useConfirm();

    const [isOpen, setIsOpen] = useState(false);
    const [filter, setFilter] = useState('all'); // 'all' | 'unread'
    const popoverRef = useRef(null);
    const buttonRef = useRef(null);
    const navigate = useNavigate();

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(e.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target)
            ) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'unread') return !n.is_read;
        return true;
    });

    const handleItemClick = (notification) => {
        if (!notification.is_read) {
            markAsRead(notification.id);
        }
        setIsOpen(false);

        if (notification.data?.ticket_id || String(notification.type || '').startsWith('ticket_')) {
            navigate('/dashboard/seguridad/tickets');
            if (notification.data?.ticket_id) {
                window.dispatchEvent(new CustomEvent('sipe:open-ticket-detail', {
                    detail: { ticketId: notification.data.ticket_id }
                }));
            }
            return;
        }
        if (notification.data?.link) {
            navigate(notification.data.link);
        }
    };

    return (
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            {/* Bell Trigger Button */}
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen(prev => !prev)}
                aria-label="Notificaciones"
                title="Centro de Notificaciones"
                style={{
                    background: isOpen ? 'var(--hover-bg)' : 'none',
                    border: 'none',
                    borderRadius: '8px',
                    padding: isMobile ? '0.4rem' : '0.45rem',
                    cursor: 'pointer',
                    color: unreadCount > 0 ? 'var(--text)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    zIndex: isOpen ? 1061 : 1,
                    transition: 'all 0.2s ease'
                }}
            >
                <Bell size={20} className={bellRinging ? 'bell-animated' : ''} />

                {unreadCount > 0 && (
                    <span
                        className="notif-badge-pulse"
                        style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: '#ef4444',
                            color: '#ffffff',
                            borderRadius: '10px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            minWidth: '17px',
                            height: '17px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 4px',
                            boxSizing: 'border-box',
                            lineHeight: 1
                        }}
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Popover & Dimming Backdrop */}
            {isOpen && (
                <>
                    {/* Fullscreen Dimming Backdrop to isolate popover and close on outside click */}
                    <div
                        className="notif-backdrop"
                        onClick={() => setIsOpen(false)}
                        aria-label="Cerrar notificaciones"
                    />

                    {/* Elevated High-Contrast Popover Card */}
                    <div
                        ref={popoverRef}
                        className="notif-popover"
                        style={{
                            right: isMobile ? '-15px' : '0'
                        }}
                    >
                        {/* Header */}
                        <div className="notif-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                <div
                                    style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '7px',
                                        background: 'rgba(59, 130, 246, 0.15)',
                                        color: '#3b82f6',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Bell size={15} />
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>
                                    Notificaciones
                                </span>
                                {unreadCount > 0 && (
                                    <span
                                        style={{
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            background: 'rgba(239, 68, 68, 0.18)',
                                            color: '#ef4444',
                                            padding: '0.12rem 0.5rem',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(239, 68, 68, 0.35)'
                                        }}
                                    >
                                        {unreadCount} nueva{unreadCount > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {unreadCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={markAllAsRead}
                                        style={{
                                            background: 'rgba(59, 130, 246, 0.12)',
                                            border: '1px solid rgba(59, 130, 246, 0.25)',
                                            color: 'var(--primary)',
                                            fontSize: '0.74rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            padding: '0.25rem 0.55rem',
                                            borderRadius: '6px',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title="Marcar todas como leídas"
                                    >
                                        <CheckCheck size={13} />
                                        <span>Marcar leídas</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    aria-label="Cerrar panel de notificaciones"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        padding: '0.3rem',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease'
                                    }}
                                    title="Cerrar"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Filter Tabs */}
                        <div className="notif-tabs-bar">
                            <button
                                type="button"
                                className={`notif-tab-btn ${filter === 'all' ? 'active' : ''}`}
                                onClick={() => setFilter('all')}
                            >
                                <span>Todas</span>
                                <span style={{ opacity: 0.8 }}>({notifications.length})</span>
                            </button>
                            <button
                                type="button"
                                className={`notif-tab-btn ${filter === 'unread' ? 'active' : ''}`}
                                onClick={() => setFilter('unread')}
                            >
                                <span>No leídas</span>
                                <span style={{ opacity: 0.8 }}>({unreadCount})</span>
                            </button>
                        </div>

                        {/* Notification List */}
                        <div
                            style={{
                                maxHeight: '350px',
                                overflowY: 'auto',
                                padding: '0.4rem 0',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            {filteredNotifications.length === 0 ? (
                                <div
                                    style={{
                                        padding: '2.5rem 1.5rem',
                                        textAlign: 'center',
                                        color: 'var(--text-muted)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '0.6rem'
                                    }}
                                >
                                    <div
                                        style={{
                                            width: '46px',
                                            height: '46px',
                                            borderRadius: '50%',
                                            background: 'rgba(255, 255, 255, 0.04)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'var(--text-muted)',
                                            opacity: 0.7
                                        }}
                                    >
                                        <Bell size={22} />
                                    </div>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                                        {filter === 'unread' ? 'No tienes notificaciones sin leer' : 'No hay notificaciones registradas'}
                                    </span>
                                </div>
                            ) : (
                                filteredNotifications.map(item => {
                                    const styleInfo = getNotificationIcon(item.type);
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => handleItemClick(item)}
                                            className={`notif-item-card ${item.is_read ? 'read' : 'unread'}`}
                                        >
                                            {/* Unread indicator dot */}
                                            {!item.is_read && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: '12px',
                                                        left: '6px',
                                                        width: '6px',
                                                        height: '6px',
                                                        borderRadius: '50%',
                                                        background: '#3b82f6',
                                                        boxShadow: '0 0 6px #3b82f6'
                                                    }}
                                                />
                                            )}

                                            {/* Icon */}
                                            <div
                                                style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    background: styleInfo.bg,
                                                    color: styleInfo.color,
                                                    border: `1px solid ${styleInfo.color}33`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                    marginTop: '1px'
                                                }}
                                            >
                                                {styleInfo.icon}
                                            </div>

                                            {/* Content */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.4rem', marginBottom: '3px' }}>
                                                    <span
                                                        style={{
                                                            fontSize: '0.83rem',
                                                            fontWeight: item.is_read ? 600 : 700,
                                                            color: item.is_read ? 'var(--text)' : '#60a5fa',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                    >
                                                        {item.title}
                                                    </span>
                                                    <span
                                                        style={{
                                                            fontSize: '0.68rem',
                                                            color: 'var(--text-muted)',
                                                            flexShrink: 0,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.2rem'
                                                        }}
                                                    >
                                                        <Clock size={10} />
                                                        {formatTimeAgo(item.created_at)}
                                                    </span>
                                                </div>

                                                <p
                                                    style={{
                                                        margin: 0,
                                                        fontSize: '0.77rem',
                                                        color: item.is_read ? 'var(--text-muted)' : 'var(--text)',
                                                        lineHeight: '1.4',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden',
                                                        opacity: item.is_read ? 0.8 : 0.95
                                                    }}
                                                >
                                                    {item.message}
                                                </p>
                                            </div>

                                            {/* Actions */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '0.35rem',
                                                    flexShrink: 0
                                                }}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                {!item.is_read ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => markAsRead(item.id)}
                                                        title="Marcar como leída"
                                                        style={{
                                                            background: 'rgba(59, 130, 246, 0.15)',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            color: 'var(--primary)',
                                                            cursor: 'pointer',
                                                            padding: '4px',
                                                            display: 'flex'
                                                        }}
                                                    >
                                                        <Check size={13} />
                                                    </button>
                                                ) : (
                                                    <span style={{ width: '13px' }} />
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => deleteNotification(item.id)}
                                                    title="Eliminar notificación"
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--text-muted)',
                                                        cursor: 'pointer',
                                                        padding: '4px',
                                                        display: 'flex',
                                                        opacity: 0.65,
                                                        transition: 'opacity 0.15s ease'
                                                    }}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div className="notif-footer">
                            {notifications.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!await confirm('¿Estás seguro de limpiar todo el historial de notificaciones?', { variant: 'danger' })) return;
                                        clearAll();
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        fontSize: '0.74rem',
                                        cursor: 'pointer',
                                        padding: '0.2rem 0.4rem',
                                        borderRadius: '4px',
                                        transition: 'color 0.15s ease'
                                    }}
                                >
                                    Limpiar historial
                                </button>
                            ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    Al día
                                </span>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', opacity: 0.8 }}>
                                    SIPE Tiempo Real
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.06)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        color: 'var(--text)',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        padding: '0.2rem 0.6rem',
                                        borderRadius: '4px'
                                    }}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Real-time Floating Notification Toast Component
 */
export function RealtimeNotificationToast() {
    const { activeToast, dismissToast, markAsRead } = useNotifications();
    const navigate = useNavigate();

    if (!activeToast) return null;

    const styleInfo = getNotificationIcon(activeToast.type);

    const handleClickAction = () => {
        markAsRead(activeToast.id);
        dismissToast();
        if (activeToast.data?.ticket_id || String(activeToast.type || '').startsWith('ticket_')) {
            navigate('/dashboard/seguridad/tickets');
            if (activeToast.data?.ticket_id) {
                window.dispatchEvent(new CustomEvent('sipe:open-ticket-detail', { detail: { ticketId: activeToast.data.ticket_id } }));
            }
            return;
        }
        if (activeToast.data?.link) {
            navigate(activeToast.data.link);
        } else if (activeToast.type === 'task_assigned') {
            navigate('/dashboard/operaciones/tareas');
        }
        if (activeToast.data?.taskId) {
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('sipe:open-task-detail', {
                    detail: { taskId: activeToast.data.taskId }
                }));
            }, 150);
        }
    };

    const handleStartAssignedTask = async () => {
        if (activeToast.data?.taskId) {
            try {
                await api.patch(`/tasks/${activeToast.data.taskId}/status`, { estado: 'en_proceso' });
            } catch (_) {
                // ignore if already in progress
            }
        }
        handleClickAction();
    };

    const isTaskAssignedCard = activeToast.type === 'task_assigned';
    const taskData = activeToast.data || {};
    const prioRaw = String(taskData.prioridad || taskData.priority || 'media').toLowerCase();
    const prioBadge = prioRaw === 'urgente'
        ? { label: 'URGENTE', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.16)', border: 'rgba(239, 68, 68, 0.4)' }
        : prioRaw === 'alta'
            ? { label: 'ALTA', color: '#f97316', bg: 'rgba(249, 115, 22, 0.16)', border: 'rgba(249, 115, 22, 0.4)' }
            : prioRaw === 'baja'
                ? { label: 'BAJA', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.14)', border: 'rgba(148, 163, 184, 0.3)' }
                : { label: 'MEDIA', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)', border: 'rgba(56, 189, 248, 0.4)' };

    if (isTaskAssignedCard) {
        return (
            <div
                className="notif-toast-banner"
                style={{
                    position: 'fixed',
                    top: '1.25rem',
                    right: '1.25rem',
                    zIndex: 9999,
                    width: '415px',
                    maxWidth: 'calc(100vw - 1.5rem)',
                    background: 'var(--bg-card)',
                    border: `1px solid ${prioRaw === 'urgente' ? '#ef4444' : 'var(--primary)'}`,
                    borderLeft: `4px solid ${prioBadge.color}`,
                    borderRadius: '12px',
                    boxShadow: '0 14px 32px rgba(0, 0, 0, 0.45), 0 0 18px rgba(37, 99, 235, 0.25)',
                    padding: '0.9rem 1.05rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem'
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '7px',
                            background: styleInfo.bg,
                            color: styleInfo.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            {styleInfo.icon}
                        </div>
                        <span style={{ fontSize: '0.73rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#38bdf8' }}>
                            📋 Tarjeta de Tarea / Actividad Asignada
                        </span>
                        <span style={{
                            fontSize: '0.66rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.45rem',
                            borderRadius: '5px',
                            background: prioBadge.bg,
                            color: prioBadge.color,
                            border: `1px solid ${prioBadge.border}`
                        }}>
                            {prioBadge.label}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={dismissToast}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}
                        title="Cerrar tarjeta"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Title & Description */}
                <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                        {taskData.titulo || activeToast.title}
                    </div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.35 }}>
                        {taskData.descripcion || activeToast.message}
                    </div>
                </div>

                {/* Metadata Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '0.35rem 0.6rem',
                    padding: '0.5rem 0.65rem',
                    borderRadius: '8px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.73rem'
                }}>
                    {taskData.assigned_user_name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <User size={12} color="var(--primary)" />
                            <span>Resp: <strong style={{ color: 'var(--text-primary)' }}>{taskData.assigned_user_name}</strong></span>
                        </div>
                    )}
                    {taskData.created_user_name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <User size={12} color="#10b981" />
                            <span>Por: <strong style={{ color: 'var(--text-primary)' }}>{taskData.created_user_name}</strong></span>
                        </div>
                    )}
                    {taskData.categoria && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)' }}>
                            <Tag size={12} color="#a78bfa" />
                            <span>Área: <strong style={{ color: 'var(--text-primary)' }}>{taskData.categoria}</strong></span>
                        </div>
                    )}
                    {taskData.fecha_vencimiento && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-secondary)' }}>
                            <Calendar size={12} color="#f59e0b" />
                            <span>Plazo: <strong style={{ color: '#fbbf24' }}>{String(taskData.fecha_vencimiento).slice(0, 10)}{taskData.hora_limite ? ` · ${String(taskData.hora_limite).slice(0, 5)}` : ''}</strong></span>
                        </div>
                    )}
                    {taskData.mibot_status_label && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#38bdf8', fontWeight: 600, marginTop: '0.1rem' }}>
                            <Bot size={13} />
                            <span>{taskData.mibot_status_label}</span>
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {taskData.taskId && (
                        <button
                            type="button"
                            onClick={handleStartAssignedTask}
                            className="btn-secondary"
                            style={{
                                height: '29px',
                                padding: '0 0.7rem',
                                fontSize: '0.75rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                borderRadius: '6px',
                                color: '#38bdf8',
                                borderColor: 'rgba(56, 189, 248, 0.35)'
                            }}
                        >
                            <PlayCircle size={13} />
                            <span>Iniciar Tarea</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleClickAction}
                        className="btn-primary"
                        style={{
                            height: '29px',
                            padding: '0 0.8rem',
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            borderRadius: '6px'
                        }}
                    >
                        <span>Ver Actividad en Tablero</span>
                        <ExternalLink size={12} />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="notif-toast-banner"
            style={{
                position: 'fixed',
                top: '1.25rem',
                right: '1.25rem',
                zIndex: 9999,
                width: '360px',
                maxWidth: 'calc(100vw - 2rem)',
                background: 'var(--bg-card)',
                border: '1px solid var(--primary)',
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.35), 0 0 15px rgba(37, 99, 235, 0.25)',
                padding: '0.85rem 1rem',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start'
            }}
        >
            {/* Icon */}
            <div
                style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: styleInfo.bg,
                    color: styleInfo.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}
            >
                {styleInfo.icon}
            </div>

            {/* Body */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {activeToast.title}
                    </span>
                    <button
                        type="button"
                        onClick={dismissToast}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex'
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>

                <p
                    style={{
                        margin: 0,
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.35',
                        marginBottom: '0.5rem'
                    }}
                >
                    {activeToast.message}
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button
                        type="button"
                        onClick={handleClickAction}
                        className="btn-primary"
                        style={{
                            height: '28px',
                            padding: '0 0.75rem',
                            fontSize: '0.75rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            borderRadius: '6px'
                        }}
                    >
                        <span>{(activeToast.data?.ticket_id || String(activeToast.type || '').startsWith('ticket_')) ? 'Ver Ticket' : 'Ver Tarea'}</span>
                        <ExternalLink size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
}
