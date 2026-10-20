import React from 'react';
import { Ticket, AlertCircle, Clock, CheckCircle2, Flame } from 'lucide-react';

const TicketSummaryCards = ({ stats = {}, activeStatus = '', onSelectStatus }) => {
    const cards = [
        {
            id: '',
            label: 'Total Tickets',
            value: Number(stats.total || 0),
            icon: Ticket,
            color: '#4f46e5',
            bg: 'rgba(79, 70, 229, 0.12)'
        },
        {
            id: 'abierto',
            label: 'Abiertos (Pendientes)',
            value: Number(stats.abiertos || 0),
            icon: AlertCircle,
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.14)'
        },
        {
            id: 'en_proceso',
            label: 'En Proceso',
            value: Number(stats.en_proceso || 0),
            icon: Clock,
            color: '#0284c7',
            bg: 'rgba(2, 132, 199, 0.14)'
        },
        {
            id: 'resuelto',
            label: 'Resueltos',
            value: Number(stats.resueltos || 0),
            icon: CheckCircle2,
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.14)'
        },
        {
            id: 'urgente_info',
            label: 'Urgentes Activos',
            value: Number(stats.urgentes_pendientes || 0),
            icon: Flame,
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.14)',
            isFilter: false
        }
    ];

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.75rem' }}>
            {cards.map((card) => {
                const Icon = card.icon;
                const isSelected = card.isFilter !== false && activeStatus === card.id;
                return (
                    <button
                        key={card.id}
                        type="button"
                        onClick={() => card.isFilter !== false && onSelectStatus && onSelectStatus(card.id)}
                        className="card glass"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                            borderRadius: '12px',
                            border: isSelected ? `2px solid ${card.color}` : '1px solid var(--border)',
                            background: 'var(--card-bg)',
                            textAlign: 'left',
                            cursor: card.isFilter !== false ? 'pointer' : 'default',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                {card.label}
                            </span>
                            <span style={{ display: 'block', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.15rem' }}>
                                {card.value}
                            </span>
                        </div>
                        <div
                            style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: card.bg,
                                color: card.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}
                        >
                            <Icon size={18} />
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default TicketSummaryCards;
