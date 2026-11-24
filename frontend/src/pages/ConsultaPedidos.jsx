import React, { useState, useEffect, useCallback } from 'react';
import {
    Fuel,
    Search,
    RefreshCw,
    Eye,
    X,
    FileText,
    Layers,
    PackageCheck,
    Landmark,
    ArrowLeftRight,
    Check
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import Modal from '../components/Modal';
import { formatDateDMY } from '../utils/date';
import ConsultaPedidoDetailModal, { OrderStatusBadge } from '../components/pedidos/ConsultaPedidoDetailModal';
import ConsultaPedidoReceiveModal from '../components/pedidos/ConsultaPedidoReceiveModal';

const formatNumber = (val, dec = 0) => {
    const num = parseFloat(val) || 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

export default function ConsultaPedidos() {
    const { addToast } = useToast();

    const [stations, setStations] = useState([]);
    const [stationFilter, setStationFilter] = useState('TODAS');
    const [statusFilter, setStatusFilter] = useState('PENDIENTE');
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [orders, setOrders] = useState([]);
    const [summary, setSummary] = useState({
        totalOrders: 0,
        totalDiesel: 0,
        totalRegular: 0,
        totalSuper: 0,
        totalIon: 0,
        totalGallons: 0
    });
    const [loading, setLoading] = useState(true);
    const [markingSeen, setMarkingSeen] = useState(false);

    // Modals state
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [confirmSeenOrder, setConfirmSeenOrder] = useState(null);
    const [selectMethodOrder, setSelectMethodOrder] = useState(null);
    const [receivingOrder, setReceivingOrder] = useState(null);
    const [receiveMethod, setReceiveMethod] = useState('CHEQUE');

    // Load station list
    useEffect(() => {
        let cancelled = false;
        api.get('/operaciones/consulta-pedidos/stations')
            .then((res) => {
                if (!cancelled) setStations(res.data?.data || []);
            })
            .catch(() => {
                if (!cancelled) setStations([]);
            });
        return () => { cancelled = true; };
    }, []);

    // Fetch orders
    const fetchOrders = useCallback(async (isManual = false) => {
        try {
            setLoading(true);
            const params = {
                status: statusFilter,
                station_id: stationFilter !== 'TODAS' ? stationFilter : undefined,
                search: searchTerm.trim() || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined
            };
            const res = await api.get('/operaciones/consulta-pedidos/orders', { params });
            setOrders(res.data?.data || []);
            setSummary(res.data?.summary || {
                totalOrders: 0,
                totalDiesel: 0,
                totalRegular: 0,
                totalSuper: 0,
                totalIon: 0,
                totalGallons: 0
            });
            if (isManual) {
                addToast('Pedidos actualizados desde RRS', 'success');
            }
        } catch (error) {
            addToast(error.response?.data?.message || error.response?.data?.error || 'Error al consultar pedidos en RRS', 'error');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, stationFilter, searchTerm, startDate, endDate, addToast]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchOrders(false);
        }, searchTerm ? 250 : 0);
        return () => clearTimeout(timer);
    }, [fetchOrders, searchTerm]);

    const handleConfirmSeen = async () => {
        if (!confirmSeenOrder || markingSeen) return;
        try {
            setMarkingSeen(true);
            const res = await api.patch(`/operaciones/consulta-pedidos/orders/${confirmSeenOrder.id}/seen`);
            addToast(res.data?.message || 'Pedido marcado como visto exitosamente', 'success');
            if (selectedOrder && selectedOrder.id === confirmSeenOrder.id) {
                setSelectedOrder((prev) => (prev ? { ...prev, estado: 'VISTO' } : null));
            }
            setConfirmSeenOrder(null);
            fetchOrders(false);
        } catch (err) {
            addToast(err.response?.data?.error || 'Error al marcar pedido como visto', 'error');
        } finally {
            setMarkingSeen(false);
        }
    };

    const handleInitiateReceive = (order) => {
        setSelectMethodOrder(order);
    };

    const handleSelectReceiveMethod = (method, order = selectMethodOrder) => {
        if (!order) return;
        setReceiveMethod(method);
        setReceivingOrder(order);
        setSelectMethodOrder(null);
    };

    const activeStationLabel = stationFilter === 'TODAS'
        ? 'Todas las estaciones'
        : (stations.find((s) => String(s.id_empresa) === String(stationFilter))?.titulo || `Estación ${stationFilter}`);

    const hasActiveFilters = Boolean(searchTerm || startDate || endDate || stationFilter !== 'TODAS');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ padding: '0.45rem', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--primary)', display: 'flex' }}>
                        <Fuel size={22} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Consulta de Pedidos</h1>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Monitoreo, confirmación y recepción de pedidos de combustible desde RRS
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.78rem', padding: '0.35rem 0.7rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                        <span>RRS: <strong>{activeStationLabel}</strong></span>
                    </div>

                    <button
                        type="button"
                        onClick={() => fetchOrders(true)}
                        disabled={loading}
                        className="btn-primary"
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        title="Refrescar lista"
                    >
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                        <span>Actualizar</span>
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div className="card glass" style={{ flex: '1 1 160px', padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        <span>Pedidos {statusFilter === 'TODOS' ? '' : statusFilter.toLowerCase()}</span>
                        <Layers size={15} color="var(--primary)" />
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{summary.totalOrders}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>En el listado actual</div>
                </div>

                <div className="card glass" style={{ flex: '1 1 160px', padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        <span>Diésel</span>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#d97706' }} />
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginTop: '0.25rem', color: '#d97706' }}>
                        {formatNumber(summary.totalDiesel)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>gln</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Galones pedidos</div>
                </div>

                <div className="card glass" style={{ flex: '1 1 160px', padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        <span>Regular</span>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#059669' }} />
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginTop: '0.25rem', color: '#059669' }}>
                        {formatNumber(summary.totalRegular)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>gln</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Galones pedidos</div>
                </div>

                <div className="card glass" style={{ flex: '1 1 160px', padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        <span>Súper</span>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#dc2626' }} />
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginTop: '0.25rem', color: '#dc2626' }}>
                        {formatNumber(summary.totalSuper)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>gln</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Galones pedidos</div>
                </div>

                <div className="card glass" style={{ flex: '1 1 170px', padding: '0.85rem 1rem', borderColor: 'rgba(37, 99, 235, 0.35)', background: 'rgba(37, 99, 235, 0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--primary)' }}>
                        <span>Total Galones</span>
                        <Fuel size={15} color="var(--primary)" />
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginTop: '0.25rem', color: 'var(--primary)' }}>
                        {formatNumber(summary.totalGallons)} <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>gln</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {summary.totalIon > 0 ? `Incluye ${formatNumber(summary.totalIon)} gln Ion` : 'Suma de productos'}
                    </div>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="card glass" style={{ padding: '0.85rem 1.15rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    {/* Status Tabs */}
                    <div style={{ display: 'inline-flex', padding: '3px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', flexWrap: 'wrap', gap: '2px' }}>
                        {[
                            { value: 'PENDIENTE', label: 'Pendientes / Vistos' },
                            { value: 'RECIBIDO', label: 'Recibidos' },
                            { value: 'TODOS', label: 'Todos' }
                        ].map((tab) => {
                            const active = statusFilter === tab.value;
                            return (
                                <button
                                    key={tab.value}
                                    type="button"
                                    onClick={() => setStatusFilter(tab.value)}
                                    style={{
                                        height: '32px',
                                        padding: '0 0.75rem',
                                        fontSize: '0.78rem',
                                        fontWeight: 'bold',
                                        borderRadius: '6px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: active ? 'var(--primary)' : 'transparent',
                                        color: active ? '#fff' : 'var(--text-muted)'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Station + Search + Dates */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                        <select
                            value={stationFilter}
                            onChange={(e) => setStationFilter(e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem', minWidth: '185px', maxWidth: '240px', padding: '0 0.6rem' }}
                            title="Filtrar por estación"
                        >
                            <option value="TODAS">Todas las estaciones</option>
                            {stations.map((st) => (
                                <option key={st.id_empresa} value={st.id_empresa}>
                                    {st.titulo} ({st.id_empresa})
                                </option>
                            ))}
                        </select>

                        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '280px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder="Buscar pedido, doc., referencia..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', width: '100%', paddingLeft: '30px', paddingRight: '0.6rem' }}
                            />
                        </div>

                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', width: '135px', padding: '0 0.45rem' }}
                                title="Fecha desde"
                            />
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', width: '135px', padding: '0 0.45rem' }}
                                title="Fecha hasta"
                            />
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStationFilter('TODAS');
                                        setSearchTerm('');
                                        setStartDate('');
                                        setEndDate('');
                                    }}
                                    className="btn-secondary"
                                    style={{ height: '36px', padding: '0 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }}
                                    title="Limpiar filtros"
                                >
                                    <X size={14} />
                                    <span>Limpiar</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Orders Table */}
            <div className="card glass table-responsive" style={{ padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>PEDIDO #</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ESTACIÓN</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>FECHA</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ESTADO</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>DIÉSEL</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>REGULAR</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>SÚPER</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ION</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>TOTAL GLN</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>FORMA DE PAGO / REF.</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ACCIONES</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={11} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    Cargando pedidos desde RRS...
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan={11} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                    {statusFilter === 'PENDIENTE'
                                        ? 'No hay pedidos pendientes o vistos en este momento.'
                                        : 'No se encontraron resultados con los filtros aplicados.'}
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => {
                                const pDiesel = parseFloat(order.p_diesel) || 0;
                                const pRegular = parseFloat(order.p_regular) || 0;
                                const pSuper = parseFloat(order.p_super) || 0;
                                const pIon = parseFloat(order.p_ion) || 0;
                                const totalGln = parseFloat(order.total_galones) || 0;
                                const est = String(order.estado || '').toUpperCase();

                                return (
                                    <tr key={order.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                                            {order.numero || `#${order.id}`}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                            {order.estacion_nombre || order.id_estacion}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {formatDateDMY(order.fecha)}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                            <OrderStatusBadge estado={order.estado} />
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: pDiesel > 0 ? 'bold' : 'normal', color: pDiesel > 0 ? '#d97706' : 'var(--text-muted)' }}>
                                            {pDiesel > 0 ? formatNumber(pDiesel, 2) : '—'}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: pRegular > 0 ? 'bold' : 'normal', color: pRegular > 0 ? '#059669' : 'var(--text-muted)' }}>
                                            {pRegular > 0 ? formatNumber(pRegular, 2) : '—'}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: pSuper > 0 ? 'bold' : 'normal', color: pSuper > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                                            {pSuper > 0 ? formatNumber(pSuper, 2) : '—'}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: pIon > 0 ? 'bold' : 'normal', color: pIon > 0 ? '#7c3aed' : 'var(--text-muted)' }}>
                                            {pIon > 0 ? formatNumber(pIon, 2) : '—'}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--primary)' }}>
                                            {formatNumber(totalGln, 2)}
                                        </td>
                                        <td
                                            style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}
                                            title={order.forma_pago || ''}
                                        >
                                            {order.forma_pago || '—'}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                                                {est === 'PENDIENTE' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmSeenOrder(order)}
                                                        className="btn-secondary"
                                                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#0284c7', borderColor: 'rgba(14, 165, 233, 0.4)' }}
                                                        title="Marcar pedido como visto"
                                                    >
                                                        <Eye size={13} />
                                                        <span>Visto</span>
                                                    </button>
                                                )}

                                                {est === 'VISTO' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleInitiateReceive(order)}
                                                        className="btn-primary"
                                                        style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#059669' }}
                                                        title="Recibir pedido y registrar descarga"
                                                    >
                                                        <PackageCheck size={13} />
                                                        <span>Recibir</span>
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedOrder(order)}
                                                    className="icon-btn"
                                                    title="Ver detalle del pedido"
                                                >
                                                    <FileText size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal: Confirmar Marcar como Visto */}
            <Modal
                open={!!confirmSeenOrder}
                onClose={() => setConfirmSeenOrder(null)}
                size="sm"
                title={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                        <Eye size={18} color="#0284c7" />
                        <span>¿Marcar Pedido como Visto?</span>
                    </span>
                }
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', width: '100%' }}>
                        <button type="button" onClick={() => setConfirmSeenOrder(null)} disabled={markingSeen} className="btn-secondary">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmSeen}
                            disabled={markingSeen}
                            className="btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            {markingSeen ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
                            <span>Confirmar Visto</span>
                        </button>
                    </div>
                }
            >
                {confirmSeenOrder && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.84rem' }}>
                        <div style={{ fontWeight: 'bold' }}>
                            Pedido #{confirmSeenOrder.numero || confirmSeenOrder.id} · {confirmSeenOrder.estacion_nombre || confirmSeenOrder.id_estacion}
                        </div>
                        <p style={{ margin: 0, padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                            El estado del pedido cambiará a <strong style={{ color: '#0284c7' }}>VISTO</strong> para indicar que la estación tiene conocimiento del pedido y se encuentra lista para recibir la descarga.
                        </p>
                    </div>
                )}
            </Modal>

            {/* Modal: Selector de Método de Pago al Recibir */}
            <Modal
                open={!!selectMethodOrder}
                onClose={() => setSelectMethodOrder(null)}
                size="md"
                title={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                        <PackageCheck size={18} color="var(--primary)" />
                        <span>Recibir Pedido #{selectMethodOrder?.numero || selectMethodOrder?.id}</span>
                    </span>
                }
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <button type="button" onClick={() => setSelectMethodOrder(null)} className="btn-secondary">
                            Cancelar
                        </button>
                    </div>
                }
            >
                {selectMethodOrder && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Seleccione el método de pago para registrar la descarga en <strong>{selectMethodOrder.estacion_nombre || selectMethodOrder.id_estacion}</strong>:
                        </div>

                        <div className="form-grid form-grid-2">
                            <button
                                type="button"
                                onClick={() => handleSelectReceiveMethod('CHEQUE')}
                                className="card glass"
                                style={{ textAlign: 'left', padding: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--border)' }}
                            >
                                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Landmark size={18} />
                                </div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.92rem' }}>Pago con Cheque(s)</div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    Registro de uno o más cheques bancarios con verificación de vouchers, descuento de cupones y notas de crédito.
                                </div>
                                <div style={{ fontSize: '0.76rem', fontWeight: 'bold', color: 'var(--primary)' }}>Continuar &rarr;</div>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleSelectReceiveMethod('TRANSFERENCIA')}
                                className="card glass"
                                style={{ textAlign: 'left', padding: '1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--border)' }}
                            >
                                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ArrowLeftRight size={18} />
                                </div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.92rem' }}>Pago por Transferencia</div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                    Registro directo a cuenta bancaria con número de referencia, fecha de pago y registro en movimientos bancarios.
                                </div>
                                <div style={{ fontSize: '0.76rem', fontWeight: 'bold', color: '#059669' }}>Continuar &rarr;</div>
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal: Recibir Pedido */}
            <ConsultaPedidoReceiveModal
                open={!!receivingOrder}
                order={receivingOrder}
                initialMethod={receiveMethod}
                onClose={() => setReceivingOrder(null)}
                onSuccess={() => {
                    setReceivingOrder(null);
                    setSelectedOrder(null);
                    fetchOrders(false);
                }}
            />

            {/* Modal: Detalle del Pedido */}
            <ConsultaPedidoDetailModal
                open={!!selectedOrder}
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onMarkSeen={(ord) => {
                    setSelectedOrder(null);
                    setConfirmSeenOrder(ord);
                }}
                onReceive={(ord) => {
                    setSelectedOrder(null);
                    handleInitiateReceive(ord);
                }}
            />
        </div>
    );
}
