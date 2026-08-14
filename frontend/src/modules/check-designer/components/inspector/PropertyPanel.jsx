import React from 'react';
import { Trash2, Copy } from 'lucide-react';

/**
 * Componente PropertyPanel: Muestra los controles de edición de propiedades para el campo seleccionado.
 * Si no hay ningún campo seleccionado, muestra un mensaje informativo.
 */
export default function PropertyPanel({ campo, onUpdate, onDelete, onDuplicate }) {
    if (!campo) {
        return (
            <div style={{ flexShrink: '0', width: '300px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', padding: '1rem', overflowY: 'auto' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text)' }}>Propiedades</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Selecciona un campo para ver sus propiedades.</p>
            </div>
        );
    }

    // Función genérica para actualizar un solo valor del campo
    const handleChange = (key, value) => {
        onUpdate(campo.id, { [key]: value });
    };

    return (
        <div style={{ flexShrink: '0', width: '300px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', padding: '1rem', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text)' }}>Propiedades del Campo</h3>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={() => onDuplicate(campo.id)} title="Duplicar" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}><Copy size={16} /></button>
                    <button onClick={() => onDelete(campo)} title="Eliminar" style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem' }}><Trash2 size={16} /></button>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* --- Posición y Tamaño --- */}
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Posición y Tamaño</h4>
                    <div className="form-grid form-grid-2" style={{ gap: '0.5rem' }}>
                        <div><label>X:</label><input type="number" value={campo.x || 0} onChange={e => handleChange('x', parseInt(e.target.value))} style={{ width: '100%' }} /></div>
                        <div><label>Y:</label><input type="number" value={campo.y || 0} onChange={e => handleChange('y', parseInt(e.target.value))} style={{ width: '100%' }} /></div>
                        <div><label>Ancho:</label><input type="number" value={campo.ancho || 0} onChange={e => handleChange('ancho', parseInt(e.target.value))} style={{ width: '100%' }} /></div>
                        <div><label>Alto:</label><input type="number" value={campo.alto || 0} onChange={e => handleChange('alto', parseInt(e.target.value))} style={{ width: '100%' }} /></div>
                    </div>
                </div>

                {/* --- Texto y Fuente --- */}
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Texto y Fuente</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Texto/Etiqueta</label><input type="text" value={campo.etiqueta} onChange={e => handleChange('etiqueta', e.target.value)} style={{ width: '100%' }} /></div>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fuente</label><input type="text" value={campo.fuente || 'Arial'} onChange={e => handleChange('fuente', e.target.value)} style={{ width: '100%' }} /></div>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tamaño (px)</label><input type="number" value={parseInt(campo.fontSize)} onChange={e => handleChange('fontSize', `${e.target.value}px`)} style={{ width: '100%' }} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem' }}>
                        <button onClick={() => handleChange('peso', campo.peso === 'bold' ? 'normal' : 'bold')} style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem' }}>B</button>
                        <button onClick={() => handleChange('estilo', campo.estilo === 'italic' ? 'normal' : 'italic')} style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem' }}>I</button>
                        <button onClick={() => handleChange('subrayado', !campo.subrayado)} style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem' }}>U</button>
                    </div>
                    <div style={{ marginTop: '0.5rem' }}><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Color</label><input type="color" value={campo.color || '#000000'} onChange={e => handleChange('color', e.target.value)} style={{ width: '100%', height: '30px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} /></div>
                </div>

                {/* --- Alineación y Rotación --- */}
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Alineación y Rotación</h4>
                    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
                        <button onClick={() => handleChange('alineacion', 'izquierda')} style={{ flex: 1, padding: '0.3rem' }}>Izq.</button>
                        <button onClick={() => handleChange('alineacion', 'centro')} style={{ flex: 1, padding: '0.3rem' }}>Centro</button>
                        <button onClick={() => handleChange('alineacion', 'derecha')} style={{ flex: 1, padding: '0.3rem' }}>Der.</button>
                    </div>
                    <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rotación (º)</label><input type="number" value={campo.rotacion || 0} onChange={e => handleChange('rotacion', parseInt(e.target.value))} style={{ width: '100%' }} /></div>
                </div>

                {/* --- Formatos --- */}
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Formatos</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Formato de Fecha</label><input type="text" value={campo.formatoFecha || 'DD/MM/YYYY'} onChange={e => handleChange('formatoFecha', e.target.value)} style={{ width: '100%' }} /></div>
                        <div><label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Formato Monetario</label><input type="text" value={campo.formatoMonetario || '#,##0.00'} onChange={e => handleChange('formatoMonetario', e.target.value)} style={{ width: '100%' }} /></div>
                    </div>
                </div>

                {/* --- Visibilidad --- */}
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Otros</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id="visible" checked={campo.visible !== false} onChange={e => handleChange('visible', e.target.checked)} />
                        <label htmlFor="visible" style={{ fontSize: '0.85rem' }}>Visible</label>
                    </div>
                </div>
            </div>
        </div>
    );
}
