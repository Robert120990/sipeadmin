import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Pen, Square, ArrowUpRight, Type, Undo2, Trash2, Check } from 'lucide-react';
import { compressTicketImage } from '../../utils/ticketImageCompressor';

const COLORS = [
    { id: '#ef4444', label: 'Rojo' },
    { id: '#f59e0b', label: 'Ámbar' },
    { id: '#10b981', label: 'Verde' },
    { id: '#3b82f6', label: 'Azul' },
    { id: '#a855f7', label: 'Violeta' }
];

const TOOLS = [
    { id: 'pen', label: 'Lápiz', icon: Pen },
    { id: 'arrow', label: 'Flecha', icon: ArrowUpRight },
    { id: 'rect', label: 'Recuadro', icon: Square },
    { id: 'text', label: 'Texto', icon: Type }
];

const drawShape = (ctx, shape) => {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = shape.lineWidth || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shape.type === 'pen' && shape.points?.length > 1) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        ctx.stroke();
    } else if (shape.type === 'rect') {
        const x = Math.min(shape.startX, shape.endX);
        const y = Math.min(shape.startY, shape.endY);
        const w = Math.abs(shape.endX - shape.startX);
        const h = Math.abs(shape.endY - shape.startY);
        ctx.strokeRect(x, y, w, h);
    } else if (shape.type === 'arrow') {
        const dx = shape.endX - shape.startX;
        const dy = shape.endY - shape.startY;
        const angle = Math.atan2(dy, dx);
        const headLen = 18;
        ctx.beginPath();
        ctx.moveTo(shape.startX, shape.startY);
        ctx.lineTo(shape.endX, shape.endY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(shape.endX, shape.endY);
        ctx.lineTo(shape.endX - headLen * Math.cos(angle - Math.PI / 6), shape.endY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(shape.endX - headLen * Math.cos(angle + Math.PI / 6), shape.endY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    } else if (shape.type === 'text' && shape.text) {
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        const metrics = ctx.measureText(shape.text);
        const pad = 6;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(shape.x - pad, shape.y - 24, metrics.width + pad * 2, 32);
        ctx.fillStyle = shape.color;
        ctx.fillText(shape.text, shape.x, shape.y);
    }
    ctx.restore();
};

const ScreenshotAnnotatorModal = ({ open, imageSrc, onClose, onSave }) => {
    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const [tool, setTool] = useState('rect');
    const [color, setColor] = useState('#ef4444');
    const [shapes, setShapes] = useState([]);
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);

    const renderCanvas = useCallback((customShapes = shapes, customDraft = draft) => {
        const canvas = canvasRef.current;
        const img = imgRef.current;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        customShapes.forEach((s) => drawShape(ctx, s));
        if (customDraft) drawShape(ctx, customDraft);
    }, [shapes, draft]);

    useEffect(() => {
        if (!open || !imageSrc) return;
        setShapes([]);
        setDraft(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = img.width || 1280;
            canvas.height = img.height || 720;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = imageSrc;
    }, [open, imageSrc]);

    useEffect(() => {
        renderCanvas(shapes, draft);
    }, [shapes, draft, renderCanvas]);

    if (!open || !imageSrc) return null;

    const getCanvasPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const handlePointerDown = (e) => {
        e.preventDefault();
        const pos = getCanvasPos(e);
        if (tool === 'text') {
            const txt = window.prompt('Escribe la nota o etiqueta sobre la captura:');
            if (txt && txt.trim()) {
                setShapes((prev) => [...prev, { type: 'text', x: pos.x, y: pos.y, text: txt.trim(), color }]);
            }
            return;
        }
        if (tool === 'pen') {
            setDraft({ type: 'pen', color, lineWidth: 5, points: [pos] });
        } else {
            setDraft({ type: tool, color, lineWidth: 5, startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
        }
    };

    const handlePointerMove = (e) => {
        if (!draft) return;
        e.preventDefault();
        const pos = getCanvasPos(e);
        if (draft.type === 'pen') {
            setDraft((prev) => ({ ...prev, points: [...prev.points, pos] }));
        } else {
            setDraft((prev) => ({ ...prev, endX: pos.x, endY: pos.y }));
        }
    };

    const handlePointerUp = () => {
        if (!draft) return;
        setShapes((prev) => [...prev, draft]);
        setDraft(null);
    };

    const handleSave = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setSaving(true);
        try {
            const rawDataUrl = canvas.toDataURL('image/png');
            const compressed = await compressTicketImage(rawDataUrl, { maxWidth: 1440, quality: 0.82 });
            onSave(compressed || rawDataUrl, shapes.length > 0);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10025,
                background: 'rgba(2, 6, 23, 0.9)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                flexDirection: 'column',
                padding: '0.75rem'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    maxWidth: '1120px',
                    width: '100%',
                    margin: '0 auto',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '0.6rem 0.9rem',
                    color: '#fff'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>
                    {TOOLS.map((t) => {
                        const Icon = t.icon;
                        const active = tool === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTool(t.id)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: '8px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: active ? '#4f46e5' : '#1e293b',
                                    color: active ? '#fff' : '#cbd5e1'
                                }}
                            >
                                <Icon size={14} />
                                <span>{t.label}</span>
                            </button>
                        );
                    })}

                    <div style={{ width: '1px', height: '20px', background: '#334155', margin: '0 0.25rem' }} />

                    {COLORS.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setColor(c.id)}
                            title={c.label}
                            style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                backgroundColor: c.id,
                                border: color === c.id ? '2px solid #fff' : '2px solid transparent',
                                transform: color === c.id ? 'scale(1.12)' : 'scale(1)',
                                cursor: 'pointer'
                            }}
                        />
                    ))}

                    <div style={{ width: '1px', height: '20px', background: '#334155', margin: '0 0.25rem' }} />

                    <button
                        type="button"
                        onClick={() => setShapes((prev) => prev.slice(0, -1))}
                        disabled={shapes.length === 0}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.35rem 0.6rem',
                            borderRadius: '8px',
                            background: '#1e293b',
                            color: '#cbd5e1',
                            border: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            opacity: shapes.length === 0 ? 0.45 : 1,
                            cursor: shapes.length === 0 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <Undo2 size={14} /> Deshacer
                    </button>
                    <button
                        type="button"
                        onClick={() => setShapes([])}
                        disabled={shapes.length === 0}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.35rem 0.6rem',
                            borderRadius: '8px',
                            background: '#1e293b',
                            color: '#fda4af',
                            border: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            opacity: shapes.length === 0 ? 0.45 : 1,
                            cursor: shapes.length === 0 ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <Trash2 size={14} /> Limpiar
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.4rem 0.75rem',
                            borderRadius: '8px',
                            background: '#1e293b',
                            color: '#cbd5e1',
                            border: 'none',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        <X size={14} /> Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.4rem 0.9rem',
                            borderRadius: '8px',
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        <Check size={15} />
                        <span>{saving ? 'Guardando...' : 'Guardar Captura Marcada'}</span>
                    </button>
                </div>
            </div>

            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'auto',
                    marginTop: '0.6rem'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <canvas
                    ref={canvasRef}
                    onMouseDown={handlePointerDown}
                    onMouseMove={handlePointerMove}
                    onMouseUp={handlePointerUp}
                    onMouseLeave={handlePointerUp}
                    onTouchStart={handlePointerDown}
                    onTouchMove={handlePointerMove}
                    onTouchEnd={handlePointerUp}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '80vh',
                        objectFit: 'contain',
                        borderRadius: '10px',
                        border: '1px solid #334155',
                        cursor: 'crosshair',
                        touchAction: 'none',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.45)'
                    }}
                />
            </div>
        </div>
    );
};

export default ScreenshotAnnotatorModal;
