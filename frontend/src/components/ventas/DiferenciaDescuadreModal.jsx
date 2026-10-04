import React from 'react';
import { 
    AlertTriangle, CheckCircle2, Fuel, CreditCard, Banknote, 
    Receipt, DollarSign, Eye, Info, Clock, ArrowRight
} from 'lucide-react';
import Modal from '../Modal';

const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

/**
 * Componente modular para mostrar la tarjeta de diagnóstico y reconciliación de caja/efectivo.
 * Se puede usar inline dentro de la fila expandida o dentro de un modal.
 */
export function ConciliacionEfectivoCard({ station, fecha, onOpenModal, onOpenDrillDown }) {
    if (!station) return null;

    const r = station;
    const exp = r.explicacion_diferencia || {};
    const totVenta = exp.tot_venta ?? (Number(r.tot_venta) || 0);
    const noEfectivo = exp.no_efectivo ?? ((Number(r.tarjetas || 0)) + (Number(r.cupones || 0)) + (Number(r.cheques || 0)) + (Number(r.credito || 0)));
    const efectivoEsperado = exp.efectivo_esperado ?? (totVenta - noEfectivo);
    const desgloseDesc = exp.desglose_descargos || {
        remesas: Number(r.remesas || 0),
        gastos: Number(r.gastos || 0),
        pagos: Number(r.pagos || 0),
        descuentos: Number(r.descuentos || 0),
        anticipos: Number(r.anticipos || 0)
    };
    const efectivoDescargado = exp.efectivo_descargado ?? ((Number(r.remesas || 0)) + (Number(r.gastos || 0)) + (Number(r.pagos || 0)) + (Number(r.anticipos || 0)) + (Number(r.descuentos || 0)));
    const dif = Number(r.diferencia || 0);
    const turnos = r.turnos || [];

    const isCuadrado = Math.abs(dif) <= 0.05;
    const isFaltante = dif < -0.05;
    const isSobrante = dif > 0.05;

    const statusBg = isCuadrado ? 'rgba(34, 197, 94, 0.05)' : isFaltante ? 'rgba(239, 68, 68, 0.05)' : 'rgba(245, 158, 11, 0.05)';
    const statusBorder = isCuadrado ? 'rgba(34, 197, 94, 0.3)' : isFaltante ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)';
    const statusColor = isCuadrado ? '#22c55e' : isFaltante ? '#ef4444' : '#f59e0b';

    return (
        <div style={{
            backgroundColor: statusBg,
            border: `1px solid ${statusBorder}`,
            borderRadius: '8px',
            padding: '0.75rem 0.9rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem'
        }}>
            {/* Header del bloque */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 'bold', fontSize: '0.825rem', color: 'var(--text-main)' }}>
                    {isCuadrado ? (
                        <CheckCircle2 size={16} color="#22c55e" />
                    ) : (
                        <AlertTriangle size={16} color={statusColor} />
                    )}
                    <span>Conciliación de Efectivo y Origen del Descuadre</span>
                    <span style={{
                        fontSize: '0.74rem',
                        padding: '1px 7px',
                        borderRadius: '4px',
                        fontWeight: 700,
                        backgroundColor: isCuadrado ? 'rgba(34, 197, 94, 0.15)' : isFaltante ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: statusColor
                    }}>
                        {isCuadrado ? 'Cuadrado al centavo' : isFaltante ? `Faltante de Efectivo: ${moneyFmt(dif)}` : `Sobrante de Efectivo: ${moneyFmt(dif)}`}
                    </span>
                </div>
                {onOpenModal && (
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => onOpenModal(r)}
                        style={{ height: '24px', fontSize: '0.7rem', padding: '0 0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                        title="Ver análisis explicativo completo en modal ampliado"
                    >
                        <Eye size={12} /> Explicación Completa
                    </button>
                )}
            </div>

            {/* Ecuación de Conciliación Paso a Paso (5 tarjetas conectadas) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.45rem',
                alignItems: 'stretch'
            }}>
                {/* 1. Venta Total */}
                <div style={{ background: 'var(--surface)', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Fuel size={12} color="var(--primary)" /> 1. Venta Total
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                        {moneyFmt(totVenta)}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                        Comb. + Lubricantes
                    </div>
                </div>

                {/* 2. Cobros No Efectivo */}
                <div style={{ background: 'var(--surface)', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <CreditCard size={12} color="#3b82f6" /> 2. (-) No Efectivo
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#3b82f6', marginTop: '2px' }}>
                        -{moneyFmt(noEfectivo)}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                        Tarjetas POS, Vales, Crédito
                    </div>
                </div>

                {/* 3. Efectivo Esperado */}
                <div style={{ background: 'var(--surface)', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <DollarSign size={12} color="#10b981" /> 3. (=) Efectivo Esperado
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                        {moneyFmt(efectivoEsperado)}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                        Cobrado en efectivo en pista
                    </div>
                </div>

                {/* 4. Descargos de Efectivo */}
                <div style={{ background: 'var(--surface)', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Banknote size={12} color="#8b5cf6" /> 4. (-) Descargos Realizados
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#8b5cf6', marginTop: '2px' }}>
                        -{moneyFmt(efectivoDescargado)}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                        Remesas {moneyFmt(desgloseDesc.remesas)} + Gastos/Pagos {moneyFmt((desgloseDesc.gastos || 0) + (desgloseDesc.pagos || 0) + (desgloseDesc.descuentos || 0))}
                    </div>
                </div>

                {/* 5. Descuadre Neto */}
                <div style={{
                    background: isCuadrado ? 'rgba(34, 197, 94, 0.1)' : isFaltante ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    padding: '0.45rem 0.6rem',
                    borderRadius: '6px',
                    border: `1px solid ${statusBorder}`
                }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Info size={12} color={statusColor} /> 5. (=) Descuadre Neto
                    </div>
                    <div style={{
                        fontSize: '0.92rem',
                        fontWeight: 900,
                        color: statusColor,
                        marginTop: '2px'
                    }}>
                        {moneyFmt(dif)}
                    </div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>
                        {isCuadrado ? 'Liquidación exacta' : isFaltante ? 'Falta por justificar' : 'Excedente justificado'}
                    </div>
                </div>
            </div>

            {/* Diagnóstico en Lenguaje Claro */}
            <div style={{
                fontSize: '0.75rem',
                color: 'var(--text-main)',
                backgroundColor: 'var(--surface)',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                borderLeft: `4px solid ${statusColor}`,
                lineHeight: 1.45
            }}>
                <div style={{ fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    💡 Explicación del Descuadre:
                </div>
                {isFaltante ? (
                    <div>
                        De los <strong>{moneyFmt(efectivoEsperado)}</strong> cobrados en efectivo en pista, solo se han reportado <strong>{moneyFmt(desgloseDesc.remesas)}</strong> en remesas bancarias y <strong>{moneyFmt((desgloseDesc.gastos || 0) + (desgloseDesc.pagos || 0) + (desgloseDesc.descuentos || 0))}</strong> en gastos y comprobantes de salida.
                        <div style={{ marginTop: '3px', fontWeight: 600, color: '#ef4444' }}>
                            ⚠️ Hay un faltante de {moneyFmt(Math.abs(dif))} que no ha sido remesado al banco ni justificado en el cierre.
                        </div>
                    </div>
                ) : isSobrante ? (
                    <div>
                        Se reportaron <strong>{moneyFmt(efectivoDescargado)}</strong> en remesas y comprobantes de salida, lo cual supera el efectivo esperado de <strong>{moneyFmt(efectivoEsperado)}</strong> por <strong>{moneyFmt(dif)}</strong> (posible remesa de turno anterior o ingreso no registrado en lecturas).
                    </div>
                ) : (
                    <div>
                        El cierre está perfectamente cuadrado: el efectivo esperado ({moneyFmt(efectivoEsperado)}) coincide exactamente con las remesas y comprobantes reportados.
                    </div>
                )}
            </div>

            {/* Desglose por Turno si existen turnos */}
            {turnos && turnos.length > 0 && (
                <div style={{ marginTop: '0.15rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> Desglose por Turno de Pista ({turnos.length} turno{turnos.length > 1 ? 's' : ''})
                    </div>
                    <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', minWidth: '650px' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--surface-active)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.4rem 0.55rem', textAlign: 'left' }}>Turno</th>
                                    <th style={{ padding: '0.4rem 0.55rem', textAlign: 'left' }}>Responsable</th>
                                    <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>Venta Pista</th>
                                    <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>Tarjetas POS</th>
                                    <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>Remesas Banco</th>
                                    <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>Gastos/Otros</th>
                                    <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>Total Justificado</th>
                                    <th style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>Diferencia Turno</th>
                                </tr>
                            </thead>
                            <tbody>
                                {turnos.map((t, idx) => {
                                    const tDif = Number(t.diferencia || 0);
                                    const tCuadrado = Math.abs(tDif) <= 0.05;
                                    const tFaltante = tDif < -0.05;
                                    return (
                                        <tr key={t.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.4rem 0.55rem', fontWeight: 600 }}>
                                                Turno {t.turno} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>({t.id})</span>
                                            </td>
                                            <td style={{ padding: '0.4rem 0.55rem' }}>{t.responsable}</td>
                                            <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right', fontWeight: 600 }}>{moneyFmt(t.venta)}</td>
                                            <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right', color: '#3b82f6' }}>{moneyFmt(t.tarjetas)}</td>
                                            <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{moneyFmt(t.remesas)}</td>
                                            <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>{moneyFmt((t.gastos || 0) + (t.pagos || 0) + (t.descuentos || 0) + (t.cupones || 0))}</td>
                                            <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right', fontWeight: 600 }}>{moneyFmt(t.suma)}</td>
                                            <td style={{ padding: '0.4rem 0.55rem', textAlign: 'right' }}>
                                                <span style={{
                                                    fontWeight: 700,
                                                    padding: '1px 6px',
                                                    borderRadius: '3px',
                                                    backgroundColor: tCuadrado ? 'rgba(34, 197, 94, 0.15)' : tFaltante ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                    color: tCuadrado ? '#22c55e' : tFaltante ? '#ef4444' : '#f59e0b'
                                                }}>
                                                    {moneyFmt(tDif)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Modal Completo de Diagnóstico de Descuadre (se abre al hacer clic en el badge de Diferencia o en Ver Análisis)
 */
export default function DiferenciaDescuadreModal({ modalData, onClose, fecha, onOpenDrillDown }) {
    if (!modalData) return null;

    const r = modalData;
    const exp = r.explicacion_diferencia || {};
    const totVenta = exp.tot_venta ?? (Number(r.tot_venta) || 0);
    const noEfectivo = exp.no_efectivo ?? ((Number(r.tarjetas || 0)) + (Number(r.cupones || 0)) + (Number(r.cheques || 0)) + (Number(r.credito || 0)));
    const efectivoEsperado = exp.efectivo_esperado ?? (totVenta - noEfectivo);
    const desgloseDesc = exp.desglose_descargos || {
        remesas: Number(r.remesas || 0),
        gastos: Number(r.gastos || 0),
        pagos: Number(r.pagos || 0),
        descuentos: Number(r.descuentos || 0),
        anticipos: Number(r.anticipos || 0)
    };
    const dif = Number(r.diferencia || 0);
    const isCuadrado = Math.abs(dif) <= 0.05;
    const isFaltante = dif < -0.05;
    const isSobrante = dif > 0.05;
    const statusColor = isCuadrado ? '#22c55e' : isFaltante ? '#ef4444' : '#f59e0b';
    const turnos = r.turnos || [];

    return (
        <Modal
            isOpen={Boolean(modalData)}
            onClose={onClose}
            title={`Diagnóstico de Descuadre: ${r.empresa}`}
            size="lg"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Header de Resumen */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: isCuadrado ? 'rgba(34, 197, 94, 0.1)' : isFaltante ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    border: `1px solid ${isCuadrado ? 'rgba(34, 197, 94, 0.25)' : isFaltante ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`
                }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fecha Turno: <strong>{fecha}</strong></div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                            {r.empresa}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Diferencia / Descuadre Total</div>
                        <div style={{
                            fontSize: '1.25rem',
                            fontWeight: 900,
                            color: statusColor
                        }}>
                            {moneyFmt(dif)}
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: statusColor }}>
                            {isCuadrado ? 'Cierre Cuadrado' : isFaltante ? 'Faltante de Efectivo' : 'Sobrante de Efectivo'}
                        </div>
                    </div>
                </div>

                {/* Tarjeta de Conciliación Completa */}
                <ConciliacionEfectivoCard
                    station={r}
                    fecha={fecha}
                    onOpenModal={null}
                    onOpenDrillDown={onOpenDrillDown}
                />

                {/* Acciones directas para auditar comprobantes */}
                {onOpenDrillDown && (
                    <div style={{ marginTop: '0.3rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.45rem', fontWeight: 600 }}>
                            🔍 Inspeccionar comprobantes individuales que respaldan el cierre:
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    onClose();
                                    onOpenDrillDown(r.id_empresa, r.empresa, 'remesas', 'Remesas Bancarias');
                                }}
                                style={{ height: '30px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Banknote size={13} color="#10b981" /> Ver Remesas ({moneyFmt(r.remesas)})
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    onClose();
                                    onOpenDrillDown(r.id_empresa, r.empresa, 'tarjetas', 'Transacciones POS / Tarjetas');
                                }}
                                style={{ height: '30px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <CreditCard size={13} color="#3b82f6" /> Ver Tarjetas ({moneyFmt(r.tarjetas)})
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    onClose();
                                    onOpenDrillDown(r.id_empresa, r.empresa, 'gastos', 'Gastos Operativos');
                                }}
                                style={{ height: '30px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Receipt size={13} color="#ef4444" /> Ver Gastos ({moneyFmt(r.gastos)})
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    onClose();
                                    onOpenDrillDown(r.id_empresa, r.empresa, 'lecturas', 'Lecturas de Combustible');
                                }}
                                style={{ height: '30px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Fuel size={13} color="var(--primary)" /> Ver Mangueras ({moneyFmt(r.tot_venta)})
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
