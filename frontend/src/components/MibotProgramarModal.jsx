import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Bot, Send, Clock, Calendar, Users, CheckCircle2, Bell,
    CreditCard, ClipboardList, ShieldCheck, CalendarClock,
    Search, Trash2, XCircle, RefreshCw, AlertCircle
} from 'lucide-react';
import api from '../services/api';
import Modal from './Modal';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

export const MIBOT_TIPO_OPTIONS = [
    {
        id: 'RECORDATORIO_PAGO',
        label: 'Recordatorio de Pago',
        short: 'Pago',
        emoji: '💳',
        icon: CreditCard,
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.14)',
        capField: 'mibot_pagos'
    },
    {
        id: 'TAREA',
        label: 'Tarea',
        short: 'Tarea',
        emoji: '📋',
        icon: ClipboardList,
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.14)',
        capField: 'mibot_tareas'
    },
    {
        id: 'VALIDACION',
        label: 'Validar Actividad',
        short: 'Validación',
        emoji: '✅',
        icon: ShieldCheck,
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.14)',
        capField: 'mibot_validaciones'
    },
    {
        id: 'REUNION',
        label: 'Reunión',
        short: 'Reunión',
        emoji: '📅',
        icon: Calendar,
        color: '#a78bfa',
        bg: 'rgba(167, 139, 250, 0.14)',
        capField: 'mibot_reuniones'
    }
];

export const MIBOT_FRECUENCIA_OPTIONS = [
    { id: 'UNA_VEZ', label: 'Una sola vez' },
    { id: 'DIARIO_HASTA_PAGAR', label: 'Diario hasta cancelar pago' },
    { id: 'DIARIO', label: 'Todos los días' },
    { id: 'SEMANAL', label: 'Cada semana' }
];

const pad2 = (n) => String(Math.trunc(Number(n) || 0)).padStart(2, '0');

const formatMoney = (val) => `$${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDateDMY = (raw) => {
    if (!raw) return '—';
    const s = String(raw).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export function formatMibotDateTime(raw) {
    if (!raw) return '—';
    const s = String(raw).replace('T', ' ').slice(0, 16);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (!m) return s;
    const h24 = Number(m[4]);
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${m[3]}/${m[2]}/${m[1]} ${pad2(h12)}:${m[5]} ${ampm}`;
}

export function getDeliveryBadgeStyle(estado) {
    const est = String(estado || 'PENDIENTE').toUpperCase();
    if (est === 'VALIDADO') return { label: '✔️ Validado', bg: 'rgba(16, 185, 129, 0.18)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' };
    if (est === 'VISTO') return { label: '👀 Visto', bg: 'rgba(56, 189, 248, 0.16)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)' };
    if (est === 'ENVIADO') return { label: '📩 Enviado', bg: 'rgba(99, 102, 241, 0.18)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.4)' };
    if (est === 'POSPUESTO') return { label: '⏰ Pospuesto 1h', bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' };
    if (est === 'ERROR') return { label: '⚠️ Error', bg: 'rgba(239, 68, 68, 0.18)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)' };
    return { label: '⏳ Pendiente', bg: 'rgba(148, 163, 184, 0.14)', color: '#cbd5e1', border: '1px solid rgba(148, 163, 184, 0.3)' };
}

function getSvNowDateTimeParts(offsetMinutes = 0) {
    const target = new Date(Date.now() + offsetMinutes * 60 * 1000);
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/El_Salvador',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    });
    const parts = {};
    for (const p of fmt.formatToParts(target)) {
        if (p.type !== 'literal') parts[p.type] = p.value;
    }
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${hh}:${parts.minute}`
    };
}

function shiftDateString(ymd, deltaDays) {
    const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return getSvNowDateTimeParts(0).date;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays));
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export default function MibotProgramarModal({
    open,
    onClose,
    vencimientoRow = null,
    defaultTipo = null,
    onSaved = null
}) {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [recipients, setRecipients] = useState([]);
    const [recipientSearch, setRecipientSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);

    const [tipo, setTipo] = useState('RECORDATORIO_PAGO');
    const [titulo, setTitulo] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [enviarAhora, setEnviarAhora] = useState(false);
    const [fechaProg, setFechaProg] = useState('');
    const [horaProg, setHoraProg] = useState('08:00');
    const [frecuencia, setFrecuencia] = useState('UNA_VEZ');

    const [saving, setSaving] = useState(false);
    const [existingList, setExistingList] = useState([]);
    const [loadingExisting, setLoadingExisting] = useState(false);
    const [sendingExistingId, setSendingExistingId] = useState(null);

    const paymentSaldo = useMemo(() => {
        if (!vencimientoRow) return null;
        if (vencimientoRow.saldo_pendiente !== undefined && vencimientoRow.saldo_pendiente !== null) {
            return Number(vencimientoRow.saldo_pendiente || 0);
        }
        return vencimientoRow.estado === 'CANCELADO' ? 0 : Number(vencimientoRow.monto || 0);
    }, [vencimientoRow]);

    const paymentTotal = useMemo(() => {
        if (!vencimientoRow) return null;
        return Number(vencimientoRow.monto_total ?? vencimientoRow.monto ?? 0);
    }, [vencimientoRow]);

    const loadRecipients = useCallback(async () => {
        setLoadingRecipients(true);
        try {
            const res = await api.get('/telegram/mibot/destinatarios');
            const list = Array.isArray(res.data?.destinatarios) ? res.data.destinatarios : [];
            setRecipients(list);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar usuarios de Telegram para MiBot', 'error');
        } finally {
            setLoadingRecipients(false);
        }
    }, [addToast]);

    const loadExistingForVencimiento = useCallback(async (venId) => {
        if (!venId) {
            setExistingList([]);
            return;
        }
        setLoadingExisting(true);
        try {
            const res = await api.get('/telegram/mibot/programaciones', {
                params: { vencimiento_id: venId, limit: 25 }
            });
            setExistingList(Array.isArray(res.data?.programaciones) ? res.data.programaciones : []);
        } catch (_) {
            setExistingList([]);
        } finally {
            setLoadingExisting(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;

        loadRecipients();
        setRecipientSearch('');
        setSelectedIds([]);

        const inOneHour = getSvNowDateTimeParts(60);

        if (vencimientoRow) {
            const isParcial = vencimientoRow.estado_pago === 'PARCIAL';
            const saldoVal = vencimientoRow.saldo_pendiente !== undefined && vencimientoRow.saldo_pendiente !== null
                ? Number(vencimientoRow.saldo_pendiente || 0)
                : Number(vencimientoRow.monto || 0);
            const desc = vencimientoRow.descripcion || `Pago #${vencimientoRow.id_recordatorio || vencimientoRow.id}`;
            const ubic = vencimientoRow.ubicacion || 'General';
            const venceTxt = formatDateDMY(vencimientoRow.vence);

            setTipo(defaultTipo || 'RECORDATORIO_PAGO');
            setTitulo(isParcial ? `Saldo parcial pendiente: ${desc}` : `Pago pendiente: ${desc}`);
            setMensaje(
                isParcial
                    ? `Queda un saldo pendiente de ${formatMoney(saldoVal)} (de ${formatMoney(vencimientoRow.monto)}) para ${ubic} con vencimiento ${venceTxt}. Favor coordinar el pago restante o validar en Control de Pagos.`
                    : `Recordatorio de pago pendiente por ${formatMoney(saldoVal)} para ${ubic}, con vencimiento el ${venceTxt}. Favor gestionar y subir comprobante en SIPE Admin.`
            );
            setEnviarAhora(false);
            setFechaProg(inOneHour.date);
            setHoraProg(inOneHour.time);
            setFrecuencia(saldoVal > 0 ? 'DIARIO_HASTA_PAGAR' : 'UNA_VEZ');
            loadExistingForVencimiento(vencimientoRow.id);
        } else {
            const initTipo = defaultTipo || 'REUNION';
            setTipo(initTipo);
            setTitulo(initTipo === 'REUNION' ? 'Recordatorio de Reunión' : '');
            setMensaje(
                initTipo === 'REUNION'
                    ? 'Se les recuerda nuestra reunión programada. Por favor confirmar asistencia desde este mensaje.'
                    : ''
            );
            setEnviarAhora(false);
            setFechaProg(inOneHour.date);
            setHoraProg(inOneHour.time);
            setFrecuencia('UNA_VEZ');
            setExistingList([]);
        }
    }, [open, vencimientoRow, defaultTipo, loadRecipients, loadExistingForVencimiento]);

    const currentTipoMeta = useMemo(() => {
        return MIBOT_TIPO_OPTIONS.find(t => t.id === tipo) || MIBOT_TIPO_OPTIONS[0];
    }, [tipo]);

    const filteredRecipients = useMemo(() => {
        const q = recipientSearch.trim().toLowerCase();
        if (!q) return recipients;
        return recipients.filter(u => {
            const blob = `${u.nombre_completo || ''} ${u.cargo || ''} ${u.telegram_username || ''} ${u.sipe_nombre || ''}`.toLowerCase();
            return blob.includes(q);
        });
    }, [recipients, recipientSearch]);

    const selectedRecipientObjects = useMemo(() => {
        const set = new Set(selectedIds);
        return recipients.filter(u => set.has(u.id));
    }, [recipients, selectedIds]);

    const toggleRecipient = (id) => {
        setSelectedIds(prev => (
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        ));
    };

    const handleSelectAllFiltered = () => {
        const enabledIds = filteredRecipients
            .filter(u => u[currentTipoMeta.capField] !== false)
            .map(u => u.id);
        const idsToUse = enabledIds.length > 0 ? enabledIds : filteredRecipients.map(u => u.id);
        setSelectedIds(prev => [...new Set([...prev, ...idsToUse])]);
    };

    const handleClearSelection = () => {
        setSelectedIds([]);
    };

    const applyPresetSchedule = (preset) => {
        if (preset === 'NOW') {
            setEnviarAhora(true);
            return;
        }
        setEnviarAhora(false);
        if (preset === '1H') {
            const p = getSvNowDateTimeParts(60);
            setFechaProg(p.date);
            setHoraProg(p.time);
        } else if (preset === 'TOMORROW_8AM') {
            const todaySv = getSvNowDateTimeParts(0).date;
            setFechaProg(shiftDateString(todaySv, 1));
            setHoraProg('08:00');
        } else if (preset === 'DAY_BEFORE_DUE' && vencimientoRow?.vence) {
            const dueMinus1 = shiftDateString(String(vencimientoRow.vence).slice(0, 10), -1);
            setFechaProg(dueMinus1);
            setHoraProg('08:30');
        }
    };

    const handleSelectTipo = (newTipo) => {
        setTipo(newTipo);
        if (!vencimientoRow && (!titulo.trim() || titulo === 'Recordatorio de Reunión' || titulo === 'Validación de Actividad' || titulo === 'Nueva Tarea Asignada' || titulo === 'Recordatorio de Pago')) {
            if (newTipo === 'REUNION') setTitulo('Recordatorio de Reunión');
            else if (newTipo === 'VALIDACION') setTitulo('Validación de Actividad');
            else if (newTipo === 'TAREA') setTitulo('Nueva Tarea Asignada');
            else setTitulo('Recordatorio de Pago');
        }
        if (newTipo !== 'RECORDATORIO_PAGO' && frecuencia === 'DIARIO_HASTA_PAGAR') {
            setFrecuencia('UNA_VEZ');
        }
    };

    const handleSubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        if (selectedIds.length === 0) {
            addToast('Selecciona al menos un usuario registrado en Telegram para enviar el aviso', 'warning');
            return;
        }
        if (!titulo.trim() || titulo.trim().length < 3) {
            addToast('Ingresa un título descriptivo (mínimo 3 caracteres)', 'warning');
            return;
        }
        if (!mensaje.trim()) {
            addToast('Escribe el mensaje que MiBot enviará a cada usuario', 'warning');
            return;
        }
        if (!enviarAhora && (!fechaProg || !horaProg)) {
            addToast('Indica la fecha y hora de envío o selecciona "Enviar ahora"', 'warning');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                tipo,
                titulo: titulo.trim(),
                mensaje: mensaje.trim(),
                destinatario_ids: selectedIds,
                enviar_ahora: enviarAhora,
                programado_para: enviarAhora ? undefined : `${fechaProg} ${horaProg}:00`,
                frecuencia,
                ...(vencimientoRow ? {
                    vencimiento_id: vencimientoRow.id,
                    recordatorio_id: vencimientoRow.id_recordatorio,
                    ubicacion: vencimientoRow.ubicacion,
                    monto_total: paymentTotal,
                    monto_pendiente: paymentSaldo,
                    fecha_vencimiento: vencimientoRow.vence ? String(vencimientoRow.vence).slice(0, 10) : null
                } : {})
            };

            const res = await api.post('/telegram/mibot/programaciones', payload);
            addToast(res.data?.message || 'Aviso MiBot guardado con éxito', 'success');

            if (onSaved) onSaved();

            if (vencimientoRow) {
                await loadExistingForVencimiento(vencimientoRow.id);
                setEnviarAhora(false);
            } else {
                onClose();
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al programar aviso en MiBot', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSendExistingNow = async (prog) => {
        setSendingExistingId(prog.id);
        try {
            const res = await api.post(`/telegram/mibot/programaciones/${prog.id}/enviar-ahora`);
            addToast(res.data?.message || 'Aviso enviado por Telegram', 'success');
            if (vencimientoRow?.id) await loadExistingForVencimiento(vencimientoRow.id);
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error enviando aviso MiBot', 'error');
        } finally {
            setSendingExistingId(null);
        }
    };

    const handleCancelExisting = async (prog) => {
        if (!await confirm(`¿Cancelar el aviso MiBot "${prog.titulo}"? Dejará de enviarse automáticamente.`, { variant: 'danger' })) return;
        try {
            await api.patch(`/telegram/mibot/programaciones/${prog.id}/estado`, { estado: 'CANCELADO' });
            addToast('Programación MiBot cancelada', 'success');
            if (vencimientoRow?.id) await loadExistingForVencimiento(vencimientoRow.id);
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error cancelando programación', 'error');
        }
    };

    const handleDeleteExisting = async (prog) => {
        if (!await confirm(`¿Eliminar definitivamente el aviso MiBot "${prog.titulo}"?`, { variant: 'danger' })) return;
        try {
            await api.delete(`/telegram/mibot/programaciones/${prog.id}`);
            addToast('Programación MiBot eliminada', 'success');
            if (vencimientoRow?.id) await loadExistingForVencimiento(vencimientoRow.id);
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error eliminando programación', 'error');
        }
    };

    return (
        <Modal
            open={open}
            onClose={() => !saving && onClose()}
            title={
                vencimientoRow
                    ? `MiBot Telegram — Programar Aviso (#${vencimientoRow.id_recordatorio || vencimientoRow.id})`
                    : 'MiBot Telegram — Programar Aviso, Tarea, Validación o Reunión'
            }
            size="lg"
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', width: '100%' }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {selectedIds.length > 0
                            ? `🤖 MiBot enviará ${selectedIds.length} mensaje(s) personal(es) en Telegram`
                            : 'Selecciona 1 o más usuarios registrados en Telegram'}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onClose}
                            disabled={saving}
                            style={{ height: '36px', fontSize: '0.8rem', padding: '0 0.9rem' }}
                        >
                            Cerrar
                        </button>
                        <button
                            type="submit"
                            form="mibot-programar-form"
                            className="btn-primary"
                            disabled={saving || selectedIds.length === 0}
                            style={{ height: '36px', fontSize: '0.8rem', padding: '0 1.1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            {saving ? (
                                <>
                                    <RefreshCw size={14} className="spin" />
                                    {enviarAhora ? 'Enviando...' : 'Programando...'}
                                </>
                            ) : enviarAhora ? (
                                <>
                                    <Send size={14} />
                                    Enviar Ahora ({selectedIds.length})
                                </>
                            ) : (
                                <>
                                    <Bell size={14} />
                                    Programar Aviso ({selectedIds.length})
                                </>
                            )}
                        </button>
                    </div>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0 }}>
                {/* Contexto del pago vinculado si viene de Control de Pagos */}
                {vencimientoRow && (
                    <div style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '9px',
                        backgroundColor: 'rgba(14, 165, 233, 0.08)',
                        border: '1px solid rgba(14, 165, 233, 0.3)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                    }}>
                        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' }}>
                                {vencimientoRow.descripcion}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.15rem' }}>
                                <span>Ubicación: <strong style={{ color: 'var(--text)' }}>{vencimientoRow.ubicacion || 'General'}</strong></span>
                                <span>Vence: <strong style={{ color: '#fbbf24' }}>{formatDateDMY(vencimientoRow.vence)}</strong></span>
                                <span>Estado: <strong style={{ color: vencimientoRow.estado_pago === 'PARCIAL' ? '#38bdf8' : '#fbbf24' }}>{vencimientoRow.estado_pago || vencimientoRow.estado}</strong></span>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Saldo Pendiente</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: paymentSaldo > 0 ? '#fbbf24' : '#34d399' }}>
                                {formatMoney(paymentSaldo)}
                            </div>
                        </div>
                    </div>
                )}

                <form id="mibot-programar-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {/* 1. TIPO DE AVISO MIBOT */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            1. Tipo de Aviso Personal (MiBot)
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {MIBOT_TIPO_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                const active = tipo === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => handleSelectTipo(opt.id)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            padding: '0.35rem 0.72rem',
                                            borderRadius: '8px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            border: active ? `1px solid ${opt.color}` : '1px solid var(--border)',
                                            backgroundColor: active ? opt.bg : 'rgba(255,255,255,0.03)',
                                            color: active ? opt.color : 'var(--text-muted)'
                                        }}
                                    >
                                        <Icon size={14} />
                                        <span>{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 2. SELECCIÓN MÚLTIPLE DE USUARIOS REGISTRADOS EN TELEGRAM */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        padding: '0.75rem',
                        borderRadius: '9px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'rgba(255,255,255,0.02)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', margin: 0 }}>
                                <Users size={15} color="#0088cc" />
                                2. Usuarios de Telegram a Notificar Personalmente ({selectedIds.length} seleccionados)
                            </label>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={handleSelectAllFiltered}
                                    style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.72rem' }}
                                >
                                    Seleccionar todos
                                </button>
                                {selectedIds.length > 0 && (
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={handleClearSelection}
                                        style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.72rem' }}
                                    >
                                        Limpiar
                                    </button>
                                )}
                            </div>
                        </div>

                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Buscar por nombre, cargo (ej. Gerente General) o @usuario..."
                                value={recipientSearch}
                                onChange={e => setRecipientSearch(e.target.value)}
                                style={{ height: '36px', fontSize: '0.8rem', paddingLeft: '30px', width: '100%' }}
                            />
                        </div>

                        {loadingRecipients ? (
                            <div style={{ padding: '0.85rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Cargando usuarios registrados en Telegram...
                            </div>
                        ) : filteredRecipients.length === 0 ? (
                            <div style={{ padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.78rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                                <span>No se encontraron usuarios activos con MiBot habilitado. Regístralos en Seguridad → Usuarios y Bot de Telegram.</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', maxHeight: '175px', overflowY: 'auto', paddingRight: '0.15rem' }}>
                                {filteredRecipients.map(u => {
                                    const isSelected = selectedIds.includes(u.id);
                                    const capEnabled = u[currentTipoMeta.capField] !== false;
                                    return (
                                        <label
                                            key={u.id}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.45rem',
                                                padding: '0.4rem 0.65rem',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                fontSize: '0.78rem',
                                                border: isSelected ? '1px solid #0088cc' : '1px solid var(--border)',
                                                backgroundColor: isSelected ? 'rgba(0, 136, 204, 0.16)' : 'rgba(255,255,255,0.025)',
                                                flex: '1 1 215px',
                                                maxWidth: '100%'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleRecipient(u.id)}
                                                style={{ width: '16px', height: '16px', flexShrink: 0 }}
                                            />
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {u.nombre_completo}
                                                </div>
                                                <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                                                    {u.cargo && (
                                                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{u.cargo}</span>
                                                    )}
                                                    {u.telegram_username && <span>{u.telegram_username}</span>}
                                                    {!capEnabled && (
                                                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>({currentTipoMeta.short} desact.)</span>
                                                    )}
                                                </div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        )}

                        {selectedRecipientObjects.length > 0 && (
                            <div style={{ fontSize: '0.73rem', color: '#7dd3fc', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                <Bot size={14} style={{ flexShrink: 0 }} />
                                <span>
                                    Se enviará mensaje personal por separado a <strong>{selectedRecipientObjects.length}</strong> persona(s):{' '}
                                    {selectedRecipientObjects.map(u => u.cargo ? `${u.nombre_completo} (${u.cargo})` : u.nombre_completo).join(', ')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* 3. TÍTULO Y MENSAJE */}
                    <div className="form-grid form-grid-2" style={{ gap: '0.65rem' }}>
                        <div className="form-group span-2" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                                3. Asunto / Título del Recordatorio *
                            </label>
                            <input
                                type="text"
                                className="form-control"
                                required
                                maxLength={180}
                                placeholder="Ej: Reunión gerencial de cierre, Pago pendiente ANDELSA, Validar depósito..."
                                value={titulo}
                                onChange={e => setTitulo(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', width: '100%' }}
                            />
                        </div>

                        <div className="form-group span-2" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                                Mensaje Personal que entregará MiBot *
                            </label>
                            <textarea
                                className="form-control"
                                required
                                rows={3}
                                maxLength={2000}
                                placeholder="Escribe los detalles (hora, lugar, instrucciones, documento a validar o saldo pendiente)..."
                                value={mensaje}
                                onChange={e => setMensaje(e.target.value)}
                                style={{ fontSize: '0.82rem', padding: '0.5rem 0.65rem', width: '100%', resize: 'vertical' }}
                            />
                        </div>
                    </div>

                    {/* 4. PROGRAMACIÓN DE FECHA, HORA Y FRECUENCIA */}
                    <div style={{
                        padding: '0.75rem',
                        borderRadius: '9px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Clock size={14} color="#f59e0b" />
                                4. Cuándo enviar (Hora de El Salvador)
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                <button
                                    type="button"
                                    onClick={() => applyPresetSchedule('NOW')}
                                    style={{
                                        height: '26px', padding: '0 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                                        border: enviarAhora ? '1px solid #10b981' : '1px solid var(--border)',
                                        backgroundColor: enviarAhora ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                                        color: enviarAhora ? '#34d399' : 'var(--text-muted)'
                                    }}
                                >
                                    ⚡ Enviar ahora
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyPresetSchedule('1H')}
                                    style={{
                                        height: '26px', padding: '0 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                        border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-muted)'
                                    }}
                                >
                                    ⏱️ En 1 hora
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyPresetSchedule('TOMORROW_8AM')}
                                    style={{
                                        height: '26px', padding: '0 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                        border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-muted)'
                                    }}
                                >
                                    🌅 Mañana 8:00 AM
                                </button>
                                {vencimientoRow?.vence && (
                                    <button
                                        type="button"
                                        onClick={() => applyPresetSchedule('DAY_BEFORE_DUE')}
                                        style={{
                                            height: '26px', padding: '0 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                            border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-muted)'
                                        }}
                                    >
                                        📅 1 día antes del vence
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="form-grid form-grid-3" style={{ gap: '0.6rem' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                                    Fecha de Envío
                                </label>
                                <input
                                    type="date"
                                    className="form-control"
                                    value={fechaProg}
                                    onChange={e => { setEnviarAhora(false); setFechaProg(e.target.value); }}
                                    disabled={enviarAhora}
                                    style={{ height: '36px', fontSize: '0.8rem', width: '100%', opacity: enviarAhora ? 0.55 : 1 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                                    Hora (El Salvador)
                                </label>
                                <input
                                    type="time"
                                    className="form-control"
                                    value={horaProg}
                                    onChange={e => { setEnviarAhora(false); setHoraProg(e.target.value); }}
                                    disabled={enviarAhora}
                                    style={{ height: '36px', fontSize: '0.8rem', width: '100%', opacity: enviarAhora ? 0.55 : 1 }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>
                                    Frecuencia / Repetición
                                </label>
                                <select
                                    className="form-control"
                                    value={frecuencia}
                                    onChange={e => setFrecuencia(e.target.value)}
                                    style={{ height: '36px', fontSize: '0.8rem', width: '100%' }}
                                >
                                    {MIBOT_FRECUENCIA_OPTIONS.map(opt => (
                                        <option
                                            key={opt.id}
                                            value={opt.id}
                                            disabled={opt.id === 'DIARIO_HASTA_PAGAR' && !vencimientoRow}
                                        >
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {frecuencia === 'DIARIO_HASTA_PAGAR' && vencimientoRow && (
                            <div style={{ fontSize: '0.72rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                                <span>MiBot enviará el recordatorio diariamente con el saldo actualizado y se detendrá automáticamente al cancelarse el 100%.</span>
                            </div>
                        )}
                    </div>
                </form>

                {/* HISTORIAL DE AVISOS PROGRAMADOS PARA ESTE PAGO */}
                {vencimientoRow && (
                    <div style={{
                        padding: '0.75rem',
                        borderRadius: '9px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'rgba(15, 23, 42, 0.35)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <CalendarClock size={14} color="#38bdf8" />
                                Avisos MiBot de este pago ({existingList.length})
                            </span>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => loadExistingForVencimiento(vencimientoRow.id)}
                                disabled={loadingExisting}
                                style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <RefreshCw size={11} className={loadingExisting ? 'spin' : ''} /> Actualizar
                            </button>
                        </div>

                        {loadingExisting ? (
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem' }}>
                                Cargando avisos programados...
                            </div>
                        ) : existingList.length === 0 ? (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.4rem' }}>
                                Aún no hay avisos MiBot programados para este vencimiento.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '210px', overflowY: 'auto' }}>
                                {existingList.map(p => (
                                    <div
                                        key={p.id}
                                        style={{
                                            padding: '0.55rem 0.7rem',
                                            borderRadius: '7px',
                                            border: '1px solid var(--border)',
                                            backgroundColor: 'rgba(255,255,255,0.02)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.35rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <strong style={{ fontSize: '0.79rem', color: 'var(--text)' }}>{p.titulo}</strong>
                                                <span style={{
                                                    fontSize: '0.67rem',
                                                    fontWeight: 700,
                                                    padding: '0.1rem 0.42rem',
                                                    borderRadius: '10px',
                                                    backgroundColor: p.estado === 'PROGRAMADO' ? 'rgba(56, 189, 248, 0.16)' : p.estado === 'COMPLETADO' ? 'rgba(16, 185, 129, 0.16)' : p.estado === 'CANCELADO' ? 'rgba(239, 68, 68, 0.14)' : 'rgba(99, 102, 241, 0.16)',
                                                    color: p.estado === 'PROGRAMADO' ? '#38bdf8' : p.estado === 'COMPLETADO' ? '#34d399' : p.estado === 'CANCELADO' ? '#f87171' : '#a5b4fc'
                                                }}>
                                                    {p.estado}
                                                </span>
                                                <span style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                                    {p.proximo_envio_at ? `Próx: ${formatMibotDateTime(p.proximo_envio_at)}` : `Env: ${formatMibotDateTime(p.ultimo_envio_at || p.programado_para)}`}
                                                </span>
                                            </div>
                                            <div style={{ display: 'inline-flex', gap: '0.28rem', alignItems: 'center' }}>
                                                {p.estado !== 'CANCELADO' && (
                                                    <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        disabled={sendingExistingId === p.id}
                                                        onClick={() => handleSendExistingNow(p)}
                                                        title="Enviar ahora mismo por Telegram"
                                                        style={{ height: '25px', padding: '0 0.45rem', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                                    >
                                                        <Send size={11} color="#0088cc" /> Enviar
                                                    </button>
                                                )}
                                                {p.estado === 'PROGRAMADO' && (
                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        onClick={() => handleCancelExisting(p)}
                                                        title="Cancelar programación"
                                                        style={{ width: '25px', height: '25px', padding: 0 }}
                                                    >
                                                        <XCircle size={13} color="#f59e0b" />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="icon-btn"
                                                    onClick={() => handleDeleteExisting(p)}
                                                    title="Eliminar programación"
                                                    style={{ width: '25px', height: '25px', padding: 0 }}
                                                >
                                                    <Trash2 size={13} color="#ef4444" />
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                            {(p.destinatarios || []).map(d => {
                                                const st = getDeliveryBadgeStyle(d.estado_entrega);
                                                return (
                                                    <span
                                                        key={d.id}
                                                        title={d.respuesta_nota || d.error_msg || d.estado_entrega}
                                                        style={{
                                                            fontSize: '0.68rem',
                                                            padding: '0.12rem 0.45rem',
                                                            borderRadius: '6px',
                                                            backgroundColor: st.bg,
                                                            color: st.color,
                                                            border: st.border,
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        {d.nombre_destinatario}{d.cargo ? ` (${d.cargo})` : ''} · {st.label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}
