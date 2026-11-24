import React from 'react';
import {
    Fuel,
    CreditCard,
    Calendar,
    FileText,
    Eye,
    PackageCheck,
    Clock,
    CheckCircle2,
    Info
} from 'lucide-react';
import Modal from '../Modal';
import { formatDateDMY } from '../../utils/date';

const formatNumber = (val, dec = 2) => {
    const num = parseFloat(val) || 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const formatCurrency = (val, dec = 2) => {
    const num = parseFloat(val) || 0;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
};

function calculateOrderCost(order) {
    if (!order) return 0;
    const isReceived = String(order.estado || '').toUpperCase() === 'RECIBIDO';
    if (isReceived && parseFloat(order.pago) > 0) {
        return parseFloat(order.pago);
    }
    const flete = parseFloat(order.flete) || 0;
    const dGal = isReceived && parseFloat(order.r_diesel) > 0 ? parseFloat(order.r_diesel) : (parseFloat(order.p_diesel) || 0);
    const rGal = isReceived && parseFloat(order.r_regular) > 0 ? parseFloat(order.r_regular) : (parseFloat(order.p_regular) || 0);
    const sGal = isReceived && parseFloat(order.r_super) > 0 ? parseFloat(order.r_super) : (parseFloat(order.p_super) || 0);
    const iGal = isReceived && parseFloat(order.r_ion) > 0 ? parseFloat(order.r_ion) : (parseFloat(order.p_ion) || 0);

    const cD = (parseFloat(order.costo_d) || 0) + flete;
    const cR = (parseFloat(order.costo_r) || 0) + flete;
    const cS = (parseFloat(order.costo_s) || 0) + flete;
    const cI = (parseFloat(order.costo_i) || 0) + flete;

    return (dGal * cD) + (rGal * cR) + (sGal * cS) + (iGal * cI);
}

export function OrderStatusBadge({ estado }) {
    const est = String(estado || '').toUpperCase();
    const styles = {
        PENDIENTE: { bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.35)', Icon: Clock },
        VISTO: { bg: 'rgba(14, 165, 233, 0.14)', color: '#0284c7', border: '1px solid rgba(14, 165, 233, 0.35)', Icon: Eye },
        RECIBIDO: { bg: 'rgba(16, 185, 129, 0.14)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.35)', Icon: CheckCircle2 }
    };
    const cfg = styles[est] || { bg: 'rgba(59, 130, 246, 0.14)', color: 'var(--primary)', border: '1px solid rgba(59, 130, 246, 0.35)', Icon: Info };
    const { Icon } = cfg;

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontWeight: 'bold',
                background: cfg.bg,
                color: cfg.color,
                border: cfg.border,
                whiteSpace: 'nowrap'
            }}
        >
            <Icon size={12} />
            {est || 'OTRO'}
        </span>
    );
}

export default function ConsultaPedidoDetailModal({
    open,
    order,
    onClose,
    onMarkSeen,
    onReceive
}) {
    if (!open || !order) return null;

    const est = String(order.estado || '').toUpperCase();
    const isReceived = est === 'RECIBIDO';
    const flete = parseFloat(order.flete) || 0;

    const fuels = [
        { key: 'D', label: 'Diésel', color: '#d97706', pKey: 'p_diesel', rKey: 'r_diesel', cKey: 'costo_d', showAlways: true },
        { key: 'R', label: 'Regular', color: '#059669', pKey: 'p_regular', rKey: 'r_regular', cKey: 'costo_r', showAlways: true },
        { key: 'S', label: 'Súper', color: '#dc2626', pKey: 'p_super', rKey: 'r_super', cKey: 'costo_s', showAlways: true },
        { key: 'I', label: 'Ion Diésel', color: '#7c3aed', pKey: 'p_ion', rKey: 'r_ion', cKey: 'costo_i', showAlways: (parseFloat(order.p_ion) || 0) > 0 || (parseFloat(order.r_ion) || 0) > 0 }
    ].filter((f) => f.showAlways);

    const totalRecibidos =
        (parseFloat(order.r_diesel) || 0) +
        (parseFloat(order.r_regular) || 0) +
        (parseFloat(order.r_super) || 0) +
        (parseFloat(order.r_ion) || 0);

    const footerContent = (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {est === 'PENDIENTE' && onMarkSeen && (
                    <button
                        type="button"
                        onClick={() => onMarkSeen(order)}
                        className="btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#0284c7', borderColor: 'rgba(14, 165, 233, 0.4)' }}
                    >
                        <Eye size={14} />
                        <span>Marcar como Visto</span>
                    </button>
                )}
                {est === 'VISTO' && onReceive && (
                    <button
                        type="button"
                        onClick={() => onReceive(order)}
                        className="btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#059669' }}
                    >
                        <PackageCheck size={14} />
                        <span>Recibir Pedido</span>
                    </button>
                )}
            </div>
            <button type="button" onClick={onClose} className="btn-secondary">
                Cerrar
            </button>
        </div>
    );

    return (
        <Modal
            open={open && !!order}
            onClose={onClose}
            size="lg"
            title={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Fuel size={18} color="var(--primary)" />
                    <span>Pedido #{order.numero || order.id}</span>
                    <OrderStatusBadge estado={order.estado} />
                </span>
            }
            footer={footerContent}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span>
                        Estación: <strong>{order.estacion_nombre || order.id_estacion}</strong> ({order.id_estacion})
                    </span>
                    <span>
                        Fecha Pedido: <strong>{formatDateDMY(order.fecha)}</strong>
                    </span>
                    {flete > 0 && (
                        <span style={{ fontSize: '0.76rem', padding: '0.15rem 0.45rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px' }}>
                            Flete aplicado: <strong>{formatCurrency(flete, 4)}</strong> /gln
                        </span>
                    )}
                </div>

                <div>
                    <div style={{ fontSize: '0.74rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.4rem', letterSpacing: '0.03em' }}>
                        Desglose de Combustible y Costos
                    </div>
                    <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Producto</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Gal. Pedidos</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Gal. Recibidos</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Costo /gln</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Flete /gln</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Costo Efectivo</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fuels.map((f) => {
                                    const ordered = parseFloat(order[f.pKey]) || 0;
                                    const received = parseFloat(order[f.rKey]) || 0;
                                    const unitCost = parseFloat(order[f.cKey]) || 0;
                                    const effectiveCost = unitCost + flete;
                                    const qtyForSub = isReceived && received > 0 ? received : ordered;
                                    const subtotal = qtyForSub * effectiveCost;

                                    return (
                                        <tr key={f.key} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 'bold', color: f.color }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: f.color }} />
                                                    {f.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', fontWeight: '600' }}>
                                                {formatNumber(ordered, 2)} gln
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {formatNumber(received, 2)} gln
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {formatCurrency(unitCost, 4)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {formatCurrency(flete, 4)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', fontWeight: '600' }}>
                                                {formatCurrency(effectiveCost, 4)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', fontWeight: 'bold', color: f.color }}>
                                                {formatCurrency(subtotal, 2)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: 'var(--bg-secondary)', borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>Total</td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--primary)' }}>
                                        {formatNumber(order.total_galones, 2)} gln
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.8rem', color: '#059669' }}>
                                        {formatNumber(totalRecibidos, 2)} gln
                                    </td>
                                    <td colSpan={3} style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                        Total Estimado / Facturado:
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.9rem', color: '#059669' }}>
                                        {formatCurrency(calculateOrderCost(order), 2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <div className="form-grid form-grid-2">
                    <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                            <CreditCard size={13} />
                            <span>Forma de Pago / Bancos</span>
                        </div>
                        <div style={{ fontWeight: '600', wordBreak: 'break-word' }}>
                            {order.forma_pago || 'No especificada'}
                        </div>
                    </div>

                    <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                            <Calendar size={13} />
                            <span>Fecha de Descarga</span>
                        </div>
                        <div style={{ fontWeight: '600' }}>
                            {order.fecha_descarga || 'No registrada'}
                        </div>
                    </div>
                </div>

                {(order.documento || order.observacion || order.ncr_numero) && (
                    <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <FileText size={13} />
                            <span>Documentos y Observaciones</span>
                        </div>
                        {order.documento && (
                            <div>
                                <strong>Documento / Remisión:</strong> {order.documento}
                            </div>
                        )}
                        {order.ncr_numero && (
                            <div>
                                <strong>Notas de Crédito:</strong> #{order.ncr_numero}{' '}
                                {parseFloat(order.ncr_monto) > 0 && (
                                    <span style={{ color: '#059669', fontWeight: 'bold' }}>
                                        ({formatCurrency(order.ncr_monto, 2)})
                                    </span>
                                )}
                            </div>
                        )}
                        {order.observacion && (
                            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                &quot;{order.observacion}&quot;
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}
