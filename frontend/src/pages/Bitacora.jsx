import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../services/api';

export default function Bitacora() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [filters, setFilters] = useState({
        fecha_desde: '',
        fecha_hasta: '',
        username: '',
        accion: '',
        entidad: ''
    });
    const [filterOptions, setFilterOptions] = useState({ entidades: [], acciones: [] });
    const { addToast } = useToast();
    const limit = 20;

    const fetchLogs = useCallback(async (p) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', p || page);
            params.set('limit', limit);
            Object.entries(filters).forEach(([k, v]) => {
                if (v) params.set(k, v);
            });
            const { data } = await api.get(`/bitacora?${params.toString()}`);
            setLogs(data.data);
            setTotal(data.total);
            setPage(data.page);
            setTotalPages(data.totalPages);
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Error desconocido';
            console.error('Bitacora fetchLogs error:', msg, err);
            addToast(`Error al cargar bitácora: ${msg}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [filters, page]);

    const fetchFilterOptions = async () => {
        try {
            const { data } = await api.get('/bitacora/filtros');
            setFilterOptions(data);
        } catch (err) {
            console.error('Bitacora fetchFilterOptions error:', err.response?.data || err.message, err);
        }
    };

    useEffect(() => {
        fetchFilterOptions();
    }, []);

    useEffect(() => {
        fetchLogs(page);
    }, [page, filters]);

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1);
    };

    const clearFilters = () => {
        setFilters({ fecha_desde: '', fecha_hasta: '', username: '', accion: '', entidad: '' });
        setPage(1);
    };

    const hasFilters = Object.values(filters).some(v => v);

    const detailPreview = (detalles) => {
        if (!detalles) return '—';
        try {
            const parsed = JSON.parse(detalles);
            const keys = Object.keys(parsed);
            if (keys.length === 0) return '—';
            return keys.slice(0, 3).map(k => `${k}: ${parsed[k]}`).join(', ') + (keys.length > 3 ? '...' : '');
        } catch {
            return detalles.substring(0, 60) + (detalles.length > 60 ? '...' : '');
        }
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const getActionBadge = (accion) => {
        const colors = {
            CREATE: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
            UPDATE: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
            DELETE: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' }
        };
        const style = colors[accion] || { bg: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' };
        return (
            <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                background: style.bg,
                color: style.color
            }}>
                {accion}
            </span>
        );
    };

    return (
        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 4rem)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
                    <ClipboardList size={24} color="var(--primary)" /> Bitácora de Actividades
                </h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {total} registro{total !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap',
                padding: '1rem', background: 'var(--bg-color)', borderRadius: 'var(--border-radius)',
                border: '1px solid var(--border)', flexShrink: 0
            }}>
                <div className="form-group" style={{ margin: 0, minWidth: '140px', flex: 1, maxWidth: '180px' }}>
                    <label style={{ fontSize: '0.75rem' }}>Fecha Desde</label>
                    <input type="date" className="form-control" value={filters.fecha_desde}
                        onChange={e => handleFilterChange('fecha_desde', e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: '140px', flex: 1, maxWidth: '180px' }}>
                    <label style={{ fontSize: '0.75rem' }}>Fecha Hasta</label>
                    <input type="date" className="form-control" value={filters.fecha_hasta}
                        onChange={e => handleFilterChange('fecha_hasta', e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: '120px', flex: 1, maxWidth: '150px' }}>
                    <label style={{ fontSize: '0.75rem' }}>Usuario</label>
                    <input type="text" className="form-control" value={filters.username} placeholder="Buscar..."
                        onChange={e => handleFilterChange('username', e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: '110px', flex: 1, maxWidth: '140px' }}>
                    <label style={{ fontSize: '0.75rem' }}>Acción</label>
                    <select className="form-control" value={filters.accion}
                        onChange={e => handleFilterChange('accion', e.target.value)}>
                        <option value="">Todas</option>
                        {filterOptions.acciones.map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: '130px', flex: 1, maxWidth: '180px' }}>
                    <label style={{ fontSize: '0.75rem' }}>Entidad</label>
                    <select className="form-control" value={filters.entidad}
                        onChange={e => handleFilterChange('entidad', e.target.value)}>
                        <option value="">Todas</option>
                        {filterOptions.entidades.map(e => (
                            <option key={e} value={e}>{e}</option>
                        ))}
                    </select>
                </div>
                {hasFilters && (
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button onClick={clearFilters} className="btn-secondary"
                            style={{ padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Limpiar filtros">
                            <X size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <p>Cargando bitácora...</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <ClipboardList size={48} opacity={0.3} style={{ marginBottom: '1rem' }} />
                        <p>{hasFilters ? 'No se encontraron registros con los filtros aplicados' : 'No hay registros en la bitácora'}</p>
                    </div>
                ) : (
                    <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Fecha / Hora</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Usuario</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Acción</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Entidad</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>ID</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Detalles</th>
                                <th style={{ textAlign: 'left', padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => (
                                <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}>{log.username}</td>
                                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}>{getActionBadge(log.accion)}</td>
                                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontFamily: 'monospace' }}>{log.entidad}</td>
                                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.85rem' }}>{log.entidad_id || '—'}</td>
                                    <td style={{
                                        padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)',
                                        maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }} title={log.detalles || ''}>
                                        {detailPreview(log.detalles)}
                                    </td>
                                    <td style={{ padding: '0.6rem 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{log.ip_address || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem',
                    padding: '1rem 0 0 0', borderTop: '1px solid var(--border)', marginTop: '1rem', flexShrink: 0
                }}>
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    >
                        <ChevronLeft size={16} /> Anterior
                    </button>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Página {page} de {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    >
                        Siguiente <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}
