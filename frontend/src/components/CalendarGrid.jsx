import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';

const DAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getStatusColor(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vence = new Date(dateStr);
    vence.setHours(0, 0, 0, 0);
    if (vence < today) return '#ef4444';
    if (vence.getTime() === today.getTime()) return '#f97316';
    const diffDays = Math.ceil((vence - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2) return '#fbbf24';
    return '#3b82f6';
}

export default function CalendarGrid({ paymentsByDay, currentMonth, onMonthChange }) {
    const [selectedDay, setSelectedDay] = useState(null);

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const totalDaysInMonth = lastDay.getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const handleDayClick = (day, e) => {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const payments = paymentsByDay[dateKey];
        if (!payments || payments.length === 0) return;
        setSelectedDay(selectedDay === dateKey ? null : dateKey);
    };

    const prevMonth = () => {
        setSelectedDay(null);
        onMonthChange(new Date(year, month - 1, 1));
    };

    const nextMonth = () => {
        setSelectedDay(null);
        onMonthChange(new Date(year, month + 1, 1));
    };

    const cells = [];
    for (let i = 0; i < startDow; i++) {
        cells.push(<div key={`empty-${i}`} style={{ aspectRatio: '1', padding: '2px' }} />);
    }
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayPayments = paymentsByDay[dateKey] || [];
        const dayDate = new Date(year, month, day);
        dayDate.setHours(0, 0, 0, 0);
        const isToday = dayDate.getTime() === today.getTime();
        const isSelected = selectedDay === dateKey;

        cells.push(
            <div
                key={day}
                onClick={(e) => handleDayClick(day, e)}
                style={{
                    aspectRatio: '1',
                    padding: '2px',
                    cursor: dayPayments.length > 0 ? 'pointer' : 'default',
                    borderRadius: '6px',
                    background: isSelected ? 'var(--primary)' : isToday ? 'rgba(37, 99, 235, 0.15)' : 'transparent',
                    border: isToday && !isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    transition: 'all 0.15s ease',
                    fontSize: '0.75rem'
                }}
                onMouseEnter={e => {
                    if (!isSelected && !isToday) e.currentTarget.style.background = 'var(--hover-bg)';
                }}
                onMouseLeave={e => {
                    if (!isSelected && !isToday) e.currentTarget.style.background = 'transparent';
                }}
                title={dayPayments.length > 0 ? `${dayPayments.length} pago${dayPayments.length > 1 ? 's' : ''}` : ''}
            >
                <span style={{
                    color: isSelected ? '#fff' : dayPayments.length > 0 ? getStatusColor(dateKey) : 'var(--text-muted)',
                    fontWeight: dayPayments.length > 0 || isToday ? 600 : 400,
                    lineHeight: 1
                }}>
                    {day}
                </span>
                {dayPayments.length > 0 && (
                    <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
                        {dayPayments.slice(0, 3).map((_, i) => (
                            <div key={i} style={{
                                width: '4px', height: '4px', borderRadius: '50%',
                                background: getStatusColor(dateKey)
                            }} />
                        ))}
                        {dayPayments.length > 3 && (
                            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', lineHeight: '4px' }}>
                                +{dayPayments.length - 3}
                            </span>
                        )}
                    </div>
                )}
            </div>
        );
    }

    const totalAmount = useMemo(() => {
        return Object.entries(paymentsByDay).reduce((sum, [, payments]) => {
            return sum + payments.reduce((s, p) => s + Number(p.monto), 0);
        }, 0);
    }, [paymentsByDay]);

    const totalPending = useMemo(() => {
        return Object.values(paymentsByDay).reduce((sum, payments) => sum + payments.length, 0);
    }, [paymentsByDay]);

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CalendarIcon size={20} color="var(--primary)" />
                    <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                        {MONTHS[month]} {year}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={prevMonth} style={{ background: 'var(--hover-bg)', border: 'none', color: 'var(--text-muted)', borderRadius: '6px', cursor: 'pointer', padding: '0.3rem', display: 'flex' }}>
                        <ChevronLeft size={16} />
                    </button>
                    <button onClick={nextMonth} style={{ background: 'var(--hover-bg)', border: 'none', color: 'var(--text-muted)', borderRadius: '6px', cursor: 'pointer', padding: '0.3rem', display: 'flex' }}>
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span><strong style={{ color: 'var(--text)' }}>{totalPending}</strong> pendientes</span>
                <span><strong style={{ color: 'var(--danger)' }}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalAmount)}
                </strong> total</span>
            </div>

            {/* Day names */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
                {DAYS.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, padding: '2px 0' }}>
                        {d}
                    </div>
                ))}
            </div>

            {/* Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {cells}
            </div>

            {/* Selected day details */}
            {selectedDay && (paymentsByDay[selectedDay]?.length > 0) && (
                <div style={{
                    marginTop: '0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.6rem',
                    background: 'var(--hover-bg)',
                    fontSize: '0.78rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                            {new Date(selectedDay).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                        <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                            <X size={14} />
                        </button>
                    </div>
                    <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {paymentsByDay[selectedDay].map((p, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.3rem 0', borderBottom: i < paymentsByDay[selectedDay].length - 1 ? '1px solid var(--border)' : 'none'
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.ubicacion}
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.descripcion}
                                    </div>
                                </div>
                                <div style={{ fontWeight: 'bold', color: 'var(--danger)', marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(p.monto))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
