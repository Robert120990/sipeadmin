import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    X, Ticket, Camera, Upload, AlertTriangle, Lightbulb,
    Sparkles, HelpCircle, Send, Trash2, RefreshCw, Edit3, Plus
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../Toast';
import { compressTicketImage } from '../../utils/ticketImageCompressor';
import { collectTicketDiagnosticsSnapshot } from '../../utils/ticketDiagnostics';
import ScreenshotAnnotatorModal from './ScreenshotAnnotatorModal';
import TicketDiagnosticsPanel from './TicketDiagnosticsPanel';

const TYPES = [
    { id: 'problema', label: 'Problema / Error', icon: AlertTriangle, color: '#ef4444' },
    { id: 'requerimiento', label: 'Requerimiento', icon: Lightbulb, color: '#3b82f6' },
    { id: 'mejora', label: 'Mejora', icon: Sparkles, color: '#10b981' },
    { id: 'consulta', label: 'Consulta', icon: HelpCircle, color: '#f59e0b' }
];

const PRIORITIES = [
    { id: 'baja', label: 'Baja' },
    { id: 'media', label: 'Media' },
    { id: 'alta', label: 'Alta' },
    { id: 'urgente', label: 'Urgente' }
];

const MAX_ATTACHMENTS = 6;

const QuickTicketModal = ({
    open,
    onClose,
    initialData = {},
    onCaptureRequest,
    onSuccess
}) => {
    const { addToast } = useToast();
    const [type, setType] = useState('problema');
    const [priority, setPriority] = useState('media');
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [moduleName, setModuleName] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [annotatingIndex, setAnnotatingIndex] = useState(null);
    const [capturing, setCapturing] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const fileInputRef = useRef(null);
    const subjectRef = useRef(null);

    useEffect(() => {
        if (open) {
            setType(initialData.type || 'problema');
            setPriority(initialData.priority || 'media');
            setSubject(initialData.subject || '');
            setDescription(initialData.description || '');
            setModuleName(initialData.moduleName || document.title || 'SIPE Admin');
            if (initialData.screenshot) {
                setAttachments([{
                    id: `init-${Date.now()}`,
                    base64: initialData.screenshot,
                    caption: '',
                    annotated: false
                }]);
            } else {
                setAttachments([]);
            }
            setTimeout(() => subjectRef.current?.focus(), 80);
        }
    }, [open, initialData]);

    const diagnosticsSnapshot = useMemo(() => {
        if (!open) return null;
        return collectTicketDiagnosticsSnapshot({
            subject,
            description,
            currentRoute: typeof window !== 'undefined' ? window.location.pathname : '/dashboard'
        });
    }, [open, subject, description]);

    // Pegar capturas desde portapapeles (Ctrl + V)
    useEffect(() => {
        if (!open) return;
        const handlePaste = async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        const compressed = await compressTicketImage(file);
                        if (compressed) {
                            setAttachments((prev) => {
                                if (prev.length >= MAX_ATTACHMENTS) {
                                    addToast(`Máximo ${MAX_ATTACHMENTS} imágenes por ticket`, 'warning');
                                    return prev;
                                }
                                addToast('Imagen pegada y comprimida en formato WebP', 'success');
                                return [...prev, { id: `paste-${Date.now()}`, base64: compressed, caption: '', annotated: false }];
                            });
                        }
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [open, addToast]);

    if (!open) return null;

    const handleCaptureCurrentScreen = async () => {
        if (!onCaptureRequest) return;
        if (attachments.length >= MAX_ATTACHMENTS) {
            addToast(`Máximo ${MAX_ATTACHMENTS} capturas permitidas`, 'warning');
            return;
        }
        setCapturing(true);
        try {
            const dataUrl = await onCaptureRequest();
            if (dataUrl) {
                setAttachments((prev) => [
                    ...prev,
                    { id: `cap-${Date.now()}`, base64: dataUrl, caption: '', annotated: false }
                ]);
                addToast('Captura de pantalla tomada en formato WebP', 'success');
            }
        } finally {
            setCapturing(false);
        }
    };

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        e.target.value = '';
        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                addToast('Selecciona únicamente archivos de imagen', 'error');
                continue;
            }
            const compressed = await compressTicketImage(file);
            if (compressed) {
                setAttachments((prev) => {
                    if (prev.length >= MAX_ATTACHMENTS) return prev;
                    return [...prev, { id: `up-${Date.now()}-${Math.random()}`, base64: compressed, caption: '', annotated: false }];
                });
            }
        }
        addToast('Imagen(es) adjuntada(s) y optimizada(s) en WebP', 'success');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!subject.trim() || !description.trim()) {
            addToast('Completa el asunto y la descripción del ticket', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            const res = await api.post('/tickets', {
                type,
                priority,
                subject: subject.trim(),
                description: description.trim(),
                module_name: moduleName.trim() || 'SIPE Admin',
                page_url: window.location.pathname + window.location.search,
                screenshot_base64: attachments[0]?.base64 || null,
                attachments: attachments.map((a) => ({
                    base64: a.base64,
                    caption: a.caption || '',
                    annotated: Boolean(a.annotated)
                })),
                diagnostics: diagnosticsSnapshot
            });
            const created = res.data?.data || res.data?.ticket;
            addToast(
                `Ticket #${created?.ticket_code || ''} enviado y sincronizado con sys.sipesv.com`,
                'success'
            );
            if (onSuccess) onSuccess(created);
            onClose();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al registrar el ticket de soporte', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const currentAnnotating = annotatingIndex !== null ? attachments[annotatingIndex] : null;

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9995,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(2, 6, 23, 0.68)',
                    backdropFilter: 'blur(4px)',
                    padding: '0.75rem',
                    overflowY: 'auto'
                }}
                onClick={onClose}
            >
                <div
                    style={{
                        width: '100%',
                        maxWidth: '760px',
                        maxHeight: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'var(--card-bg)',
                        color: 'var(--text)',
                        borderRadius: '16px',
                        border: '1px solid var(--border)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
                        overflow: 'hidden'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.85rem 1.15rem',
                            background: '#0f172a',
                            color: '#fff',
                            borderBottom: '1px solid #1e293b'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div
                                style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    background: 'rgba(99, 102, 241, 0.2)',
                                    border: '1px solid rgba(99, 102, 241, 0.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#818cf8'
                                }}
                            >
                                <Ticket size={20} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>
                                        Nuevo Ticket de Soporte o Requerimiento
                                    </h2>
                                    <span
                                        style={{
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            padding: '0.1rem 0.45rem',
                                            borderRadius: '999px',
                                            background: 'rgba(16, 185, 129, 0.2)',
                                            color: '#34d399',
                                            border: '1px solid rgba(16, 185, 129, 0.35)'
                                        }}
                                    >
                                        Sincronizado con sys.sipesv.com
                                    </span>
                                </div>
                                <p style={{ margin: '0.1rem 0 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                                    Puedes adjuntar varias capturas, señalar con flechas/recuadros y ver el estado en tiempo real.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                padding: '0.35rem',
                                borderRadius: '8px'
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} style={{ padding: '1rem 1.15rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {/* Type selector */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                Tipo de Solicitud
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.45rem' }}>
                                {TYPES.map((t) => {
                                    const Icon = t.icon;
                                    const active = type === t.id;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setType(t.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.45rem',
                                                padding: '0.5rem 0.65rem',
                                                borderRadius: '10px',
                                                border: active ? `2px solid ${t.color}` : '1px solid var(--border)',
                                                background: active ? 'var(--hover-bg)' : 'var(--bg)',
                                                color: 'var(--text)',
                                                fontSize: '0.78rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                textAlign: 'left'
                                            }}
                                        >
                                            <Icon size={15} color={t.color} style={{ flexShrink: 0 }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Priority + Module */}
                        <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                    Prioridad
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
                                    {PRIORITIES.map((p) => {
                                        const active = priority === p.id;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setPriority(p.id)}
                                                style={{
                                                    padding: '0.42rem 0.35rem',
                                                    borderRadius: '8px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                    background: active ? 'var(--primary)' : 'var(--bg)',
                                                    color: active ? '#fff' : 'var(--text)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                    Módulo / Pantalla Actual
                                </label>
                                <input
                                    type="text"
                                    value={moduleName}
                                    onChange={(e) => setModuleName(e.target.value)}
                                    placeholder="Ej. Conciliación Bancaria, Cheques, Pedidos..."
                                    className="form-input"
                                    style={{ width: '100%', height: '36px', fontSize: '0.82rem' }}
                                />
                            </div>
                        </div>

                        {/* Subject */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                Asunto o Resumen Corto *
                            </label>
                            <input
                                ref={subjectRef}
                                type="text"
                                required
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Ej. Diferencia al validar cheque o requerimiento en reporte..."
                                className="form-input"
                                style={{ width: '100%', height: '38px', fontSize: '0.84rem', fontWeight: 600 }}
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                Descripción Detallada / Comentarios *
                            </label>
                            <textarea
                                rows={3}
                                required
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Explica qué ocurrió, qué esperabas ver o qué mejora necesitas..."
                                className="form-input"
                                style={{ width: '100%', fontSize: '0.82rem', resize: 'vertical', padding: '0.5rem 0.75rem' }}
                            />
                        </div>

                        {/* Multi-screenshots + Annotation */}
                        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase' }}>
                                        Capturas de Pantalla WebP ({attachments.length}/{MAX_ATTACHMENTS})
                                    </span>
                                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        Puedes señalar con flechas/recuadros sobre cada imagen o pegar con Ctrl + V
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                                    <button
                                        type="button"
                                        onClick={handleCaptureCurrentScreen}
                                        disabled={capturing || attachments.length >= MAX_ATTACHMENTS}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            padding: '0.38rem 0.7rem',
                                            borderRadius: '8px',
                                            background: '#4f46e5',
                                            color: '#fff',
                                            border: 'none',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {capturing ? <RefreshCw size={13} /> : <Camera size={13} />}
                                        <span>{attachments.length > 0 ? 'Capturar Otra Vista' : 'Capturar Pantalla Actual'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={attachments.length >= MAX_ATTACHMENTS}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            padding: '0.38rem 0.7rem',
                                            borderRadius: '8px',
                                            background: 'var(--card-bg)',
                                            color: 'var(--text)',
                                            border: '1px solid var(--border)',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <Upload size={13} />
                                        <span>Subir Imagen</span>
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={handleFileUpload}
                                    />
                                </div>
                            </div>

                            {attachments.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
                                    {attachments.map((att, idx) => (
                                        <div
                                            key={att.id || idx}
                                            style={{
                                                background: 'var(--card-bg)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '10px',
                                                padding: '0.5rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.4rem'
                                            }}
                                        >
                                            <div style={{ position: 'relative', background: '#0f172a', borderRadius: '8px', overflow: 'hidden', height: '115px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img src={att.base64} alt={`Captura ${idx + 1}`} style={{ maxHeight: '115px', width: 'auto', objectFit: 'contain' }} />
                                                {att.annotated && (
                                                    <span style={{ position: 'absolute', top: '6px', left: '6px', padding: '0.1rem 0.45rem', borderRadius: '4px', background: '#4f46e5', color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}>
                                                        Señalizada ✏️
                                                    </span>
                                                )}
                                                <div style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnotatingIndex(idx)}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.25rem',
                                                            padding: '0.2rem 0.45rem',
                                                            borderRadius: '6px',
                                                            background: '#4f46e5',
                                                            color: '#fff',
                                                            border: 'none',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <Edit3 size={11} /> Señalar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                                                        style={{
                                                            padding: '0.25rem',
                                                            borderRadius: '6px',
                                                            background: '#ef4444',
                                                            color: '#fff',
                                                            border: 'none',
                                                            cursor: 'pointer'
                                                        }}
                                                        title="Eliminar imagen"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            <input
                                                type="text"
                                                value={att.caption}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setAttachments((prev) => prev.map((item, i) => (i === idx ? { ...item, caption: val } : item)));
                                                }}
                                                placeholder={`Nota en captura #${idx + 1} (opcional)...`}
                                                className="form-input"
                                                style={{ width: '100%', height: '30px', fontSize: '0.73rem' }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.6rem', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                                    Sin captura adjunta. Presiona <strong style={{ color: 'var(--primary)' }}>Capturar Pantalla Actual</strong> o pega con <strong>Ctrl + V</strong>.
                                </div>
                            )}
                        </div>

                        {/* Automatic Diagnostics Preview */}
                        <TicketDiagnosticsPanel diagnostics={diagnosticsSnapshot} compact />

                        {/* Actions */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Plus size={12} color="var(--primary)" />
                                Recibirás notificaciones en tiempo real de pendiente y resuelto.
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    style={{
                                        padding: '0.45rem 0.9rem',
                                        borderRadius: '10px',
                                        background: 'var(--hover-bg)',
                                        color: 'var(--text)',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.48rem 1.15rem',
                                        borderRadius: '10px',
                                        background: 'var(--primary)',
                                        color: '#fff',
                                        border: 'none',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: submitting ? 'not-allowed' : 'pointer',
                                        opacity: submitting ? 0.65 : 1
                                    }}
                                >
                                    <Send size={14} />
                                    <span>{submitting ? 'Enviando Ticket...' : 'Enviar Ticket'}</span>
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <ScreenshotAnnotatorModal
                open={annotatingIndex !== null && Boolean(currentAnnotating)}
                imageSrc={currentAnnotating?.base64}
                onClose={() => setAnnotatingIndex(null)}
                onSave={(annotatedWebp, hadShapes) => {
                    setAttachments((prev) =>
                        prev.map((item, idx) =>
                            idx === annotatingIndex
                                ? { ...item, base64: annotatedWebp, annotated: item.annotated || hadShapes }
                                : item
                        )
                    );
                    setAnnotatingIndex(null);
                    addToast('Anotaciones aplicadas sobre la captura', 'success');
                }}
            />
        </>
    );
};

export default QuickTicketModal;
