import React, { useState } from 'react';
import { 
    AlertTriangle, CheckCircle2, Fuel, CreditCard, Banknote, 
    Receipt, DollarSign, Eye, Info, Clock, Sparkles, Copy, 
    Check, Target, HelpCircle, ShieldAlert, ListChecks, Loader2,
    MessageSquare, CheckSquare, Square
} from 'lucide-react';
import Modal from '../Modal';
import { useToast } from '../Toast';
import api from '../../services/api';

const moneyFmt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

/**
 * Componente modular para mostrar la tarjeta de diagnóstico y reconciliación de caja/efectivo.
 * Se puede usar inline dentro de la fila expandida o dentro de un modal.
 */
export function ConciliacionEfectivoCard({ station, fecha, onOpenModal, onOpenDrillDown }) {
    const { addToast } = useToast();
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
    const analisis = exp.analisis_inteligente || {};
    const foco = analisis.foco_turno;

    const isCuadrado = Math.abs(dif) <= 0.05;
    const isFaltante = dif < -0.05;
    const isSobrante = dif > 0.05;

    const statusBg = isCuadrado ? 'rgba(34, 197, 94, 0.05)' : isFaltante ? 'rgba(239, 68, 68, 0.05)' : 'rgba(245, 158, 11, 0.05)';
    const statusBorder = isCuadrado ? 'rgba(34, 197, 94, 0.3)' : isFaltante ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)';
    const statusColor = isCuadrado ? '#22c55e' : isFaltante ? '#ef4444' : '#f59e0b';

    const copyWhatsApp = () => {
        if (!analisis.mensaje_whatsapp) {
            addToast('No hay reporte disponible para copiar', 'info');
            return;
        }
        navigator.clipboard.writeText(analisis.mensaje_whatsapp);
        addToast('Reporte copiado al portapapeles listo para enviar por WhatsApp', 'success');
    };

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 'bold', fontSize: '0.825rem', color: 'var(--text-main)', flexWrap: 'wrap' }}>
                    {isCuadrado ? (
                        <CheckCircle2 size={16} color="#22c55e" />
                    ) : (
                        <AlertTriangle size={16} color={statusColor} />
                    )}
                    <span>Conciliación de Efectivo y Análisis de Descuadre</span>
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
                    {foco && (
                        <span style={{
                            fontSize: '0.72rem',
                            padding: '1px 7px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                        }}>
                            <Target size={11} /> Turno {foco.turno}: {foco.responsable} ({foco.porcentaje})
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {analisis.mensaje_whatsapp && (
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={copyWhatsApp}
                            style={{ height: '24px', fontSize: '0.7rem', padding: '0 0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            title="Copiar reporte formateado para WhatsApp / Encargado"
                        >
                            <MessageSquare size={12} color="#22c55e" /> WhatsApp
                        </button>
                    )}
                    {onOpenModal && (
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => onOpenModal(r)}
                            style={{ height: '24px', fontSize: '0.7rem', padding: '0 0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                            title="Ver análisis forense completo con IA"
                        >
                            <Sparkles size={12} /> Diagnóstico e IA
                        </button>
                    )}
                </div>
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
                {analisis.diagnostico_principal || (isFaltante ? (
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
                ))}
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
                                    const isFocoTurno = foco && foco.turno === t.turno;
                                    return (
                                        <tr key={t.id || idx} style={{
                                            borderBottom: '1px solid var(--border)',
                                            backgroundColor: isFocoTurno ? 'rgba(239, 68, 68, 0.06)' : undefined
                                        }}>
                                            <td style={{ padding: '0.4rem 0.55rem', fontWeight: 600 }}>
                                                Turno {t.turno} <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>({t.id})</span>
                                                {isFocoTurno && (
                                                    <span style={{ marginLeft: '4px', fontSize: '0.64rem', color: '#ef4444', fontWeight: 700 }}>
                                                        🎯 FOCO
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.4rem 0.55rem', fontWeight: isFocoTurno ? 700 : 400 }}>{t.responsable}</td>
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
 * Modal Completo de Diagnóstico de Descuadre con Motor Forense e IA Gemini.
 */
export default function DiferenciaDescuadreModal({ modalData, onClose, fecha, onOpenDrillDown }) {
    const { addToast } = useToast();
    const [dictamenIA, setDictamenIA] = useState(null);
    const [loadingIA, setLoadingIA] = useState(false);
    const [errorIA, setErrorIA] = useState(null);
    const [checkedChecklist, setCheckedChecklist] = useState({});

    if (!modalData) return null;

    const r = modalData;
    const exp = r.explicacion_diferencia || {};
    const dif = Number(r.diferencia || 0);
    const isCuadrado = Math.abs(dif) <= 0.05;
    const isFaltante = dif < -0.05;
    const isSobrante = dif > 0.05;
    const statusColor = isCuadrado ? '#22c55e' : isFaltante ? '#ef4444' : '#f59e0b';
    const analisis = exp.analisis_inteligente || {};
    const foco = analisis.foco_turno;
    const hipotesis = analisis.hipotesis_probables || [];
    const checklist = analisis.checklist_auditoria || [];

    const toggleChecklist = (idx) => {
        setCheckedChecklist(prev => ({
            ...prev,
            [idx]: !prev[idx]
        }));
    };

    const copyWhatsApp = () => {
        if (!analisis.mensaje_whatsapp) {
            addToast('No hay reporte disponible para copiar', 'info');
            return;
        }
        navigator.clipboard.writeText(analisis.mensaje_whatsapp);
        addToast('Reporte copiado al portapapeles listo para enviar por WhatsApp al encargado', 'success');
    };

    const solicitarDictamenIA = async () => {
        setLoadingIA(true);
        setErrorIA(null);
        try {
            const res = await api.post('/ventas/cierre-turno/analisis-ia', {
                id_empresa: r.id_empresa,
                fecha,
                station_name: r.empresa,
                explicacion_diferencia: exp,
                turnos: r.turnos || []
            });
            if (res.data?.success && res.data?.data) {
                setDictamenIA({ ...res.data.data, fuente: res.data.fuente });
                addToast('Dictamen forense generado exitosamente', 'success');
            } else {
                setErrorIA('No se pudo generar el dictamen forense.');
            }
        } catch (err) {
            const errMsg = err.response?.data?.message || 'Error al comunicarse con el motor pericial de IA.';
            setErrorIA(errMsg);
            addToast('Error generando dictamen IA', 'error');
        } finally {
            setLoadingIA(false);
        }
    };

    return (
        <Modal
            isOpen={Boolean(modalData)}
            onClose={onClose}
            title={`Diagnóstico Forense de Descuadre: ${r.empresa}`}
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
                        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                            {r.empresa}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Diferencia / Descuadre Total</div>
                        <div style={{
                            fontSize: '1.35rem',
                            fontWeight: 900,
                            color: statusColor
                        }}>
                            {moneyFmt(dif)}
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor }}>
                            {analisis.etiqueta_severidad || (isCuadrado ? 'Cierre Cuadrado' : isFaltante ? 'Faltante de Efectivo' : 'Sobrante de Efectivo')}
                        </div>
                    </div>
                </div>

                {/* Banner de Foco Crítico de Responsabilidad */}
                {foco && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        borderRadius: '8px',
                        padding: '0.65rem 0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem'
                    }}>
                        <Target size={22} color="#ef4444" style={{ flexShrink: 0 }} />
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: 1.45 }}>
                            <span style={{ fontWeight: 800, color: '#ef4444' }}>Foco de Auditoría Prioritario: </span>
                            El <strong>{foco.porcentaje}</strong> del descuadre total (<strong>{moneyFmt(foco.diferencia)}</strong>) se originó en el <strong>Turno {foco.turno}</strong> a cargo del responsable <strong>{foco.responsable}</strong>.
                        </div>
                    </div>
                )}

                {/* Tarjeta de Conciliación Completa con desglose */}
                <ConciliacionEfectivoCard
                    station={r}
                    fecha={fecha}
                    onOpenModal={null}
                    onOpenDrillDown={onOpenDrillDown}
                />

                {/* Botones Principales de Acción Rápida (WhatsApp & Dictamen IA) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    background: 'var(--surface-active)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        🤖 Herramientas de Análisis y Auditoría:
                    </div>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        {analisis.mensaje_whatsapp && (
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={copyWhatsApp}
                                style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                                title="Copiar informe estructurado para enviar por WhatsApp"
                            >
                                <Copy size={14} color="#22c55e" /> Copiar Reporte WhatsApp
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={solicitarDictamenIA}
                            disabled={loadingIA}
                            style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.95rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
                            title="Generar dictamen pericial forense utilizando IA"
                        >
                            {loadingIA ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                            {loadingIA ? 'Analizando con IA...' : '✨ Dictamen Forense IA (Gemini)'}
                        </button>
                    </div>
                </div>

                {/* Panel de Dictamen Forense IA (si ya fue solicitado) */}
                {dictamenIA && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(139, 92, 246, 0.08))',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        borderRadius: '8px',
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800, fontSize: '0.85rem', color: '#3b82f6' }}>
                                <Sparkles size={16} /> Dictamen Pericial Forense IA
                            </div>
                            <span style={{
                                fontSize: '0.68rem',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontWeight: 700,
                                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                                color: '#3b82f6',
                                textTransform: 'uppercase'
                            }}>
                                Fuente: {dictamenIA.fuente || 'gemini-2.0-flash'} • Criticidad: {dictamenIA.nivel_criticidad || 'ALTA'}
                            </span>
                        </div>

                        {/* Dictamen Ejecutivo */}
                        <div style={{ fontSize: '0.76rem', lineHeight: 1.5, color: 'var(--text-main)', background: 'var(--surface)', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                            <strong>Dictamen Ejecutivo:</strong> {dictamenIA.dictamen_ejecutivo}
                        </div>

                        {/* Foco de Responsabilidad */}
                        {dictamenIA.foco_responsabilidad && (
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-main)' }}>
                                <strong>🎯 Asignación de Responsabilidad:</strong> {dictamenIA.foco_responsabilidad}
                            </div>
                        )}

                        {/* Preguntas para Interrogatorio */}
                        {dictamenIA.preguntas_interrogatorio && dictamenIA.preguntas_interrogatorio.length > 0 && (
                            <div style={{ background: 'var(--surface)', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <HelpCircle size={13} color="#f59e0b" /> Preguntas Clave para el Interrogatorio del Responsable:
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.73rem', lineHeight: 1.45, color: 'var(--text-main)' }}>
                                    {dictamenIA.preguntas_interrogatorio.map((p, idx) => (
                                        <li key={idx} style={{ marginBottom: '3px' }}>{p}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Acciones Inmediatas y Control Interno */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.5rem' }}>
                            {dictamenIA.acciones_inmediatas && dictamenIA.acciones_inmediatas.length > 0 && (
                                <div style={{ background: 'var(--surface)', padding: '0.55rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                        🚨 Acciones Inmediatas de Auditoría:
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.72rem', lineHeight: 1.4 }}>
                                        {dictamenIA.acciones_inmediatas.map((a, idx) => (
                                            <li key={idx}>{a}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {dictamenIA.recomendaciones_control_interno && dictamenIA.recomendaciones_control_interno.length > 0 && (
                                <div style={{ background: 'var(--surface)', padding: '0.55rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                                        🛡️ Recomendaciones de Control Interno:
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.72rem', lineHeight: 1.4 }}>
                                        {dictamenIA.recomendaciones_control_interno.map((rec, idx) => (
                                            <li key={idx}>{rec}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {errorIA && (
                    <div style={{ fontSize: '0.74rem', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                        ⚠️ {errorIA}
                    </div>
                )}

                {/* Sección de Hipótesis Operativas y Causas Probables */}
                {hipotesis.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldAlert size={14} color="#f59e0b" /> Hipótesis Operativas y Causas Probables ({hipotesis.length})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.5rem' }}>
                            {hipotesis.map((h, idx) => (
                                <div key={idx} style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    padding: '0.55rem 0.75rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.25rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.76rem', color: 'var(--text-main)' }}>
                                            {h.titulo}
                                        </span>
                                        <span style={{
                                            fontSize: '0.66rem',
                                            padding: '1px 6px',
                                            borderRadius: '3px',
                                            fontWeight: 700,
                                            backgroundColor: h.probabilidad === 'Alta' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                            color: h.probabilidad === 'Alta' ? '#ef4444' : '#f59e0b'
                                        }}>
                                            Probabilidad {h.probabilidad}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                                        {h.descripcion}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sección de Checklist de Auditoría en Vivo */}
                {checklist.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ListChecks size={14} color="#3b82f6" /> Checklist de Verificación para Auditor / Supervisor
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {checklist.map((item, idx) => {
                                const isChecked = !!checkedChecklist[idx];
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => toggleChecklist(idx)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.55rem',
                                            padding: '0.45rem 0.65rem',
                                            borderRadius: '6px',
                                            background: isChecked ? 'rgba(34, 197, 94, 0.08)' : 'var(--surface)',
                                            border: `1px solid ${isChecked ? 'rgba(34, 197, 94, 0.3)' : 'var(--border)'}`,
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            transition: 'background 0.15s ease'
                                        }}
                                    >
                                        <div style={{ marginTop: '2px', color: isChecked ? '#22c55e' : 'var(--text-muted)' }}>
                                            {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', lineHeight: 1.4 }}>
                                            <span style={{ fontWeight: 700, textDecoration: isChecked ? 'line-through' : 'none', color: isChecked ? 'var(--text-muted)' : 'var(--text-main)' }}>
                                                {item.paso}. {item.accion}:
                                            </span>{' '}
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                {item.detalle}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

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
