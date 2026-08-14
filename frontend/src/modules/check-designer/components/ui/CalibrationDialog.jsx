import React, { useState, useEffect } from 'react';
import Modal from '../../../../components/Modal';
import { Printer } from 'lucide-react';
import DesignerService from '../../services/DesignerService';
import { useToast } from '../../../../components/Toast';

export default function CalibrationDialog({ printerName, isOpen, onClose, onSaved }) {
    const { addToast } = useToast();
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [scale, setScale] = useState(1.0);
    const [printer, setPrinter] = useState('');
    const [calibrations, setCalibrations] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setPrinter(printerName || '');
        if (isOpen) {
            fetchCalibrations();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, printerName]);

    const fetchCalibrations = async () => {
        setLoading(true);
        try {
            const data = await DesignerService.getCalibrations();
            setCalibrations(data);
            const match = data.find(c => c.printer_name === (printerName || 'Predeterminada'));
            if (match) {
                setOffsetX(match.offset_x);
                setOffsetY(match.offset_y);
                setScale(match.scale);
            }
        } catch (err) {
            addToast('Error al cargar calibraciones', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            await DesignerService.saveCalibration({
                printer_name: printer || 'Predeterminada',
                offset_x: parseFloat(offsetX) || 0,
                offset_y: parseFloat(offsetY) || 0,
                scale: parseFloat(scale) || 1.0,
            });
            addToast('Calibración guardada', 'success');
            onSaved && onSaved();
            fetchCalibrations();
        } catch (err) {
            addToast('Error al guardar calibración', 'error');
        }
    };

    const handleSelectCalibration = (cal) => {
        setOffsetX(cal.offset_x);
        setOffsetY(cal.offset_y);
        setScale(cal.scale);
    };

    return (
        <Modal open={isOpen} onClose={onClose} title="Calibración de Impresora">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ajuste los valores de desplazamiento y escala según las necesidades de su impresora.</p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Printer size={20} color="var(--text-muted)" />
                    <input type="text" placeholder="Nombre de la impresora" value={printer} onChange={e => setPrinter(e.target.value)} style={{ flex: 1 }} />
                </div>
                <div className="form-grid form-grid-2">
                    <div><label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Offset Horizontal (mm)</label><input type="number" step="0.1" value={offsetX} onChange={e => setOffsetX(e.target.value)} style={{ width: '100%' }} /></div>
                    <div><label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Offset Vertical (mm)</label><input type="number" step="0.1" value={offsetY} onChange={e => setOffsetY(e.target.value)} style={{ width: '100%' }} /></div>
                </div>
                <div><label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem' }}>Escala (%)</label><input type="number" step="0.1" value={scale * 100} onChange={e => setScale(parseFloat(e.target.value) / 100)} style={{ width: '100%' }} /></div>
                {calibrations.length > 0 && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Calibraciones Guardadas</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '100px', overflowY: 'auto' }}>
                            {calibrations.map(cal => (
                                <button key={cal.id} onClick={() => handleSelectCalibration(cal)} style={{ textAlign: 'left', padding: '0.5rem', background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', cursor: 'pointer' }}>
                                    <span style={{ fontWeight: 'bold' }}>{cal.printer_name}</span>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>X: {cal.offset_x}, Y: {cal.offset_y}, Escala: {cal.scale}x</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                <button type="button" onClick={handleSave} className="btn-primary" style={{ flex: 1 }}>Guardar Calibración</button>
            </div>
        </Modal>
    );
}
