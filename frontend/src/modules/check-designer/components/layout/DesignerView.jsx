import React, { useState } from 'react';
import { Save, Eye, Printer, Undo2, Redo2, Trash2, Copy, ZoomIn, ZoomOut, ChevronLeft, Grid3X3, Magnet, Ruler } from 'lucide-react';
import Toolbox from '../toolbox/Toolbox';
import DesignCanvas from '../canvas/DesignCanvas';
import PropertyPanel from '../inspector/PropertyPanel';
import CalibrationDialog from '../ui/CalibrationDialog';
import Preview from '../ui/Preview';
import useKeyboard from '../../hooks/useKeyboard';
import PrintEngine from '../../services/PrintEngine';
import { useConfirm } from '../../../../components/ConfirmDialog';

const ZOOM_LEVELS = [25, 50, 75, 100, 125, 150, 200];

export default function DesignerView(designerState) {
    const {
        formato,
        campos,
        campoSeleccionado,
        zoom,
        snapToGrid,
        showGrid,
        showRules,
        setShowGrid,
        setShowRules,
        setSnapToGrid,
        guardarCambiosDiseno,
        agregarCampo,
        agregarCampoEnPosicion,
        actualizarCampo,
        eliminarCampo,
        duplicarCampo,
        undo,
        redo,
        setZoomLevel,
    } = designerState;

    const { confirm } = useConfirm();
    const [showPreview, setShowPreview] = useState(false);
    const [showCalibration, setShowCalibration] = useState(false);
    const [clipboard, setClipboard] = useState(null);

    const handleSave = async () => {
        if (formato?.id) {
            await guardarCambiosDiseno(formato.id);
        } else {
            await designerState.guardarFormatoCompleto();
        }
    };

    const handleDeleteField = async (campo) => {
        const nombre = campo?.etiqueta || 'este campo';
        const confirmed = await confirm(`¿Estás seguro de eliminar el campo "${nombre}"?`, { variant: 'danger' });
        if (confirmed) eliminarCampo(campo.id);
    };

    const handleDeleteSelected = async () => {
        if (campoSeleccionado) await handleDeleteField(campoSeleccionado);
    };

    const handleCopy = () => {
        if (campoSeleccionado) setClipboard(JSON.parse(JSON.stringify(campoSeleccionado)));
    };

    const handlePaste = () => {
        if (!clipboard) return;
        const nuevo = { ...clipboard, id: `${clipboard.id}-${Date.now()}`, x: clipboard.x + 20, y: clipboard.y + 20 };
        designerState.setCampos(prev => [...prev, nuevo]);
        designerState.setCampoSeleccionado(nuevo);
    };

    const handleDuplicate = () => {
        if (campoSeleccionado) duplicarCampo(campoSeleccionado.id);
    };

    const handleZoomOut = () => {
        const currentIndex = ZOOM_LEVELS.indexOf(zoom);
        const next = currentIndex > 0 ? ZOOM_LEVELS[currentIndex - 1] : ZOOM_LEVELS[0];
        setZoomLevel(next);
    };

    const handleZoomIn = () => {
        const currentIndex = ZOOM_LEVELS.indexOf(zoom);
        const next = currentIndex < ZOOM_LEVELS.length - 1 ? ZOOM_LEVELS[currentIndex + 1] : ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
        setZoomLevel(next);
    };

    const handlePrintCalibration = async () => {
        const confirmed = await confirm('Imprimir hoja de calibración con líneas, cuadrícula y coordenadas para ajustar el cheque físico en la impresora.', {
            title: 'Imprimir hoja de calibración',
            confirmText: 'Imprimir',
        });
        if (confirmed) PrintEngine.printCalibrationSheet(formato);
    };

    useKeyboard({
        onCopy: handleCopy,
        onPaste: handlePaste,
        onUndo: undo,
        onRedo: redo,
        onDelete: () => { if (campoSeleccionado) eliminarCampo(campoSeleccionado.id); },
        enabled: true,
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 6rem)', padding: '1rem', gap: '0.5rem' }}>
            <div className="page-header" style={{ flexShrink: '0', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <button className="btn-secondary" onClick={() => window.history.back()} title="Volver a formatos" style={{ display: 'flex', alignItems: 'center', padding: '0.4rem' }}>
                        <ChevronLeft size={18} />
                    </button>
                    <h2 style={{ margin: 0 }}>{formato?.name || 'Nuevo Formato'}</h2>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{formato?.banco_nombre || 'Sin Banco Asociado'} · {formato?.width} x {formato?.height} mm</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                    <button className="btn-secondary" onClick={undo} title="Deshacer (Ctrl+Z)" style={{ display: 'flex', alignItems: 'center', padding: '0.4rem' }}><Undo2 size={16} /></button>
                    <button className="btn-secondary" onClick={redo} title="Rehacer (Ctrl+Y)" style={{ display: 'flex', alignItems: 'center', padding: '0.4rem' }}><Redo2 size={16} /></button>
                    <button className="btn-secondary" onClick={handleDuplicate} disabled={!campoSeleccionado} title="Duplicar campo" style={{ display: 'flex', alignItems: 'center', padding: '0.4rem' }}><Copy size={16} /></button>
                    <button className="btn-secondary" onClick={handleDeleteSelected} disabled={!campoSeleccionado} title="Eliminar campo (Supr)" style={{ display: 'flex', alignItems: 'center', padding: '0.4rem' }}><Trash2 size={16} /></button>
                    <div style={{ width: '1px', height: '24px', background: 'var(--border)' }}></div>
                    <button className="btn-secondary" onClick={handleZoomOut} title="Alejar"><ZoomOut size={16} /></button>
                    <select
                        value={zoom}
                        onChange={(e) => setZoomLevel(parseInt(e.target.value))}
                        style={{ width: 'auto', padding: '0.35rem 0.5rem' }}
                        title="Nivel de zoom"
                    >
                        {ZOOM_LEVELS.map(level => <option key={level} value={level}>{level}%</option>)}
                    </select>
                    <button className="btn-secondary" onClick={handleZoomIn} title="Acercar"><ZoomIn size={16} /></button>
                    <div style={{ width: '1px', height: '24px', background: 'var(--border)' }}></div>
                    <button
                        className={`btn-secondary ${showGrid ? 'btn-active' : ''}`}
                        onClick={() => setShowGrid(v => !v)}
                        title="Mostrar/ocultar cuadrícula"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                        <Grid3X3 size={16} /> Cuadrícula
                    </button>
                    <button
                        className={`btn-secondary ${snapToGrid ? 'btn-active' : ''}`}
                        onClick={() => setSnapToGrid(v => !v)}
                        title="Ajustar al cuadrícula"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                        <Magnet size={16} /> Snap
                    </button>
                    <button
                        className={`btn-secondary ${showRules ? 'btn-active' : ''}`}
                        onClick={() => setShowRules(v => !v)}
                        title="Mostrar/ocultar reglas"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                        <Ruler size={16} /> Reglas
                    </button>
                    <div style={{ width: '1px', height: '24px', background: 'var(--border)' }}></div>
                    <button className="btn-secondary" onClick={handleSave} title="Guardar diseño" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Save size={16} /> Guardar</button>
                    <button className="btn-secondary" onClick={() => setShowPreview(true)} title="Vista previa" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Eye size={16} /> Vista Previa</button>
                    <button className="btn-secondary" onClick={() => setShowCalibration(true)} title="Calibración de impresora" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Printer size={16} /> Calibración</button>
                    <button className="btn-secondary" onClick={handlePrintCalibration} title="Imprimir hoja de calibración" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>Imprimir Calibración</button>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, gap: '0.5rem', overflow: 'hidden' }}>
                <Toolbox onAddField={agregarCampo} />
                <div style={{ flex: 1, position: 'relative', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', overflow: 'hidden' }}>
                    <DesignCanvas
                        campos={campos}
                        setCampos={designerState.setCampos}
                        campoSeleccionado={campoSeleccionado}
                        setCampoSeleccionado={designerState.setCampoSeleccionado}
                        zoom={zoom}
                        formato={formato}
                        updateCampo={actualizarCampo}
                        agregarCampoEnPosicion={agregarCampoEnPosicion}
                        snapToGrid={snapToGrid}
                        showGrid={showGrid}
                    />
                </div>
                <PropertyPanel
                    campo={campoSeleccionado}
                    onUpdate={actualizarCampo}
                    onDelete={handleDeleteField}
                    onDuplicate={duplicarCampo}
                />
            </div>

            <Preview
                formato={formato}
                campos={campos}
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
            />

            <CalibrationDialog
                printerName={formato?.printer_name || ''}
                isOpen={showCalibration}
                onClose={() => setShowCalibration(false)}
            />
        </div>
    );
}
