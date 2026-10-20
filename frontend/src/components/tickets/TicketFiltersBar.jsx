import React from 'react';
import { Search, Filter, User, Users, RotateCcw } from 'lucide-react';

const TicketFiltersBar = ({
    search,
    onSearchChange,
    status,
    onStatusChange,
    type,
    onTypeChange,
    priority,
    onPriorityChange,
    mineOnly,
    onMineOnlyChange,
    canManage,
    onReset
}) => {
    return (
        <div
            className="card glass"
            style={{
                padding: '0.85rem 1.1rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.65rem'
            }}
        >
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
                <Search
                    size={15}
                    style={{
                        position: 'absolute',
                        left: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)'
                    }}
                />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Buscar por código (#TKT-0001), asunto, módulo o descripción..."
                    className="form-input"
                    style={{
                        width: '100%',
                        height: '36px',
                        paddingLeft: '2.15rem',
                        paddingRight: '0.75rem',
                        fontSize: '0.82rem'
                    }}
                />
            </div>

            {/* Selects & Scope */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                {canManage && (
                    <div
                        style={{
                            display: 'inline-flex',
                            background: 'var(--bg)',
                            padding: '0.2rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border)'
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => onMineOnlyChange(false)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                border: 'none',
                                cursor: 'pointer',
                                background: !mineOnly ? 'var(--primary)' : 'transparent',
                                color: !mineOnly ? '#fff' : 'var(--text-muted)'
                            }}
                        >
                            <Users size={13} /> Todos
                        </button>
                        <button
                            type="button"
                            onClick={() => onMineOnlyChange(true)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                border: 'none',
                                cursor: 'pointer',
                                background: mineOnly ? 'var(--primary)' : 'transparent',
                                color: mineOnly ? '#fff' : 'var(--text-muted)'
                            }}
                        >
                            <User size={13} /> Mis Tickets
                        </button>
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Filter size={14} color="var(--text-muted)" />
                    <select
                        value={status}
                        onChange={(e) => onStatusChange(e.target.value)}
                        className="form-input"
                        style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.65rem', width: 'auto' }}
                    >
                        <option value="">Todos los Estados</option>
                        <option value="abierto">Abiertos (Pendientes)</option>
                        <option value="en_proceso">En Proceso</option>
                        <option value="resuelto">Resueltos</option>
                        <option value="cerrado">Cerrados</option>
                    </select>
                </div>

                <select
                    value={type}
                    onChange={(e) => onTypeChange(e.target.value)}
                    className="form-input"
                    style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.65rem', width: 'auto' }}
                >
                    <option value="">Todos los Tipos</option>
                    <option value="problema">Problema / Error</option>
                    <option value="requerimiento">Requerimiento</option>
                    <option value="mejora">Mejora</option>
                    <option value="consulta">Consulta</option>
                </select>

                <select
                    value={priority}
                    onChange={(e) => onPriorityChange(e.target.value)}
                    className="form-input"
                    style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.65rem', width: 'auto' }}
                >
                    <option value="">Toda Prioridad</option>
                    <option value="urgente">Urgente</option>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                </select>

                {(search || status || type || priority || mineOnly) && (
                    <button
                        type="button"
                        onClick={onReset}
                        style={{
                            height: '36px',
                            padding: '0 0.65rem',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--hover-bg)',
                            color: 'var(--text)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                        title="Limpiar filtros"
                    >
                        <RotateCcw size={14} />
                        <span>Limpiar</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default TicketFiltersBar;
