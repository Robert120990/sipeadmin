import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import {
    ZoomIn, ZoomOut, RotateCw, Download, Trash2, ChevronLeft, ChevronRight,
    FileText, ExternalLink, RotateCcw
} from 'lucide-react';
import { formatBytes } from '../utils/receiptCompressor';

export default function ReceiptViewerModal({
    open,
    onClose,
    comprobantes = [],
    initialIndex = 0,
    title = 'Visualizador de Comprobantes',
    onDelete = null
}) {
    const [activeIdx, setActiveIdx] = useState(initialIndex || 0);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        if (open) {
            const safeIdx = Math.min(Math.max(0, initialIndex || 0), Math.max(0, comprobantes.length - 1));
            setActiveIdx(safeIdx);
            setZoom(1);
            setRotation(0);
        }
    }, [open, initialIndex, comprobantes.length]);

    const current = comprobantes[activeIdx] || null;
    const isPdf = current && (current.mime_type === 'application/pdf' || /\.pdf$/i.test(current.archivo_url || current.nombre_original || ''));
    const fileUrl = current?.archivo_url || current?.data_url || '';

    const handlePrev = () => {
        if (comprobantes.length <= 1) return;
        setActiveIdx(prev => (prev - 1 + comprobantes.length) % comprobantes.length);
        setZoom(1);
        setRotation(0);
    };

    const handleNext = () => {
        if (comprobantes.length <= 1) return;
        setActiveIdx(prev => (prev + 1) % comprobantes.length);
        setZoom(1);
        setRotation(0);
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={current ? `${title} (${activeIdx + 1}/${comprobantes.length})` : title}
            size="xl"
        >
            {!current ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No hay comprobantes para visualizar.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Barra de controles */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0, flex: '1 1 160px', maxWidth: '100%' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                {current.nombre_original || 'Comprobante'}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-word' }}>
                                {current.mime_type || 'archivo'}
                                {current.tamano_bytes ? ` · ${formatBytes(current.tamano_bytes)}` : ''}
                                {current.ancho && current.alto ? ` · ${current.ancho}×${current.alto}px` : ''}
                                {current.nota ? ` · ${current.nota}` : ''}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {!isPdf && (
                                <>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ height: '32px', padding: '0 0.55rem', fontSize: '0.75rem' }}
                                        onClick={() => setZoom(z => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                                        title="Alejar"
                                    >
                                        <ZoomOut size={14} />
                                    </button>
                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, minWidth: '42px', textAlign: 'center' }}>
                                        {Math.round(zoom * 100)}%
                                    </span>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ height: '32px', padding: '0 0.55rem', fontSize: '0.75rem' }}
                                        onClick={() => setZoom(z => Math.min(3, Number((z + 0.25).toFixed(2))))}
                                        title="Acercar"
                                    >
                                        <ZoomIn size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ height: '32px', padding: '0 0.55rem', fontSize: '0.75rem' }}
                                        onClick={() => setRotation(r => (r + 90) % 360)}
                                        title="Rotar 90°"
                                    >
                                        <RotateCw size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        style={{ height: '32px', padding: '0 0.55rem', fontSize: '0.75rem' }}
                                        onClick={() => { setZoom(1); setRotation(0); }}
                                        title="Restablecer vista"
                                    >
                                        <RotateCcw size={14} />
                                    </button>
                                </>
                            )}

                            <a
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary"
                                style={{ height: '32px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}
                                title="Abrir en nueva pestaña"
                            >
                                <ExternalLink size={13} /> Abrir
                            </a>
                            <a
                                href={fileUrl}
                                download={current.nombre_original || 'comprobante'}
                                className="btn-primary"
                                style={{ height: '32px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}
                                title="Descargar"
                            >
                                <Download size={13} /> Descargar
                            </a>
                            {onDelete && current.id && (
                                <button
                                    type="button"
                                    className="btn-danger"
                                    style={{ height: '32px', padding: '0 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                    onClick={() => onDelete(current)}
                                    title="Eliminar comprobante"
                                >
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Área de visualización */}
                    <div style={{
                        position: 'relative',
                        minHeight: '380px',
                        maxHeight: '62vh',
                        overflow: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(10, 14, 22, 0.85)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color)',
                        padding: '0.75rem'
                    }}>
                        {comprobantes.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    onClick={handlePrev}
                                    style={{
                                        position: 'sticky',
                                        left: '0.25rem',
                                        zIndex: 5,
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '50%',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                    }}
                                    title="Anterior"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                            </>
                        )}

                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
                            {isPdf ? (
                                <iframe
                                    src={fileUrl}
                                    title={current.nombre_original || 'PDF'}
                                    style={{ width: '100%', height: '58vh', border: 'none', borderRadius: '6px', background: '#fff' }}
                                />
                            ) : (
                                <img
                                    src={fileUrl}
                                    alt={current.nombre_original || 'Comprobante'}
                                    style={{
                                        maxWidth: zoom === 1 ? '100%' : 'none',
                                        maxHeight: zoom === 1 ? '56vh' : 'none',
                                        width: zoom !== 1 ? `${Math.round(zoom * 100)}%` : 'auto',
                                        transform: `rotate(${rotation}deg)`,
                                        transition: 'transform 0.15s ease',
                                        borderRadius: '6px',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                                        objectFit: 'contain'
                                    }}
                                />
                            )}
                        </div>

                        {comprobantes.length > 1 && (
                            <button
                                type="button"
                                onClick={handleNext}
                                style={{
                                    position: 'sticky',
                                    right: '0.25rem',
                                    zIndex: 5,
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '50%',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}
                                title="Siguiente"
                            >
                                <ChevronRight size={18} />
                            </button>
                        )}
                    </div>

                    {/* Tira de miniaturas si hay más de 1 comprobante */}
                    {comprobantes.length > 1 && (
                        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                            {comprobantes.map((c, idx) => {
                                const thumbPdf = c.mime_type === 'application/pdf' || /\.pdf$/i.test(c.archivo_url || c.nombre_original || '');
                                const active = idx === activeIdx;
                                return (
                                    <button
                                        key={c.id || idx}
                                        type="button"
                                        onClick={() => { setActiveIdx(idx); setZoom(1); setRotation(0); }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            padding: '0.3rem 0.5rem',
                                            borderRadius: '6px',
                                            border: active ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                            backgroundColor: active ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.03)',
                                            color: 'var(--text)',
                                            cursor: 'pointer',
                                            flexShrink: 0
                                        }}
                                    >
                                        {thumbPdf ? (
                                            <FileText size={20} style={{ color: '#f87171' }} />
                                        ) : (
                                            <img
                                                src={c.archivo_url || c.data_url}
                                                alt=""
                                                style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '4px' }}
                                            />
                                        )}
                                        <span style={{ fontSize: '0.72rem', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {c.nombre_original || `#${idx + 1}`}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
