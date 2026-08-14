import React from 'react';
import { VARIABLES_DISPONIBLES } from '../../types';
import { FileText, Calendar, CalendarDays, CalendarRange, CalendarCheck, User, Hash, AlignLeft, Tag, MapPin, Building2, Landmark, UserCircle, Store, MessageSquare, Stamp } from 'lucide-react';

// Mapeo de tipos a iconos de Lucide
const ICON_MAP = {
    fecha: Calendar,
    dia: CalendarDays,
    mes: Calendar,
    anio: CalendarRange,
    anio_corto: CalendarRange,
    fecha_letras: CalendarCheck,
    fecha_letras_corta: CalendarCheck,
    beneficiario: User,
    monto_numeros: Hash,
    monto_letras: FileText,
    concepto: AlignLeft,
    numero_cheque: Tag,
    ciudad: MapPin,
    empresa: Building2,
    cuenta_bancaria: Landmark,
    usuario_impresion: UserCircle,
    sucursal: Store,
    observaciones: MessageSquare,
    texto_fijo: Stamp,
};

/**
 * Componente Toolbox: Barra lateral izquierda que muestra los campos variables disponibles.
 * Cada ítem es arrastrable y se puede soltar en el DesignCanvas.
 */
export default function Toolbox({ onAddField }) {
    
    // Mapeo de strings de iconos a componentes de Lucide
    const getIcon = (iconName) => {
        const IconComponent = ICON_MAP[iconName];
        return IconComponent ? <IconComponent size={18} /> : <FileText size={18} />;
    };

    const handleDragStart = (e, variable) => {
        // Al arrastrar, guardamos el tipo y la etiqueta en el dataTransfer
        // para que el canvas lo lea al soltar.
        e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: variable.tipo, etiqueta: variable.etiqueta }));
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDragEnd = (e) => {
        if (e.dataTransfer) e.dataTransfer.clearData();
    };

    return (
        <div style={{ flexShrink: '0', width: '220px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', padding: '0.75rem', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text)' }}>Campos Disponibles</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Arrastre un campo al lienzo.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {VARIABLES_DISPONIBLES.map(variable => (
                    <div
                        key={variable.tipo + '-' + variable.etiqueta}
                        draggable
                        onDragStart={(e) => handleDragStart(e, variable)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onAddField(variable.tipo, variable.etiqueta)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--border-radius)',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        title={`Arrastrar ${variable.etiqueta}`}
                    >
                        {getIcon(variable.icon || variable.tipo)}
                        <span style={{ fontSize: '0.85rem' }}>{variable.etiqueta}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
