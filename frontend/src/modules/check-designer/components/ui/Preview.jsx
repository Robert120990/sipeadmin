import React from 'react';
import Modal from '../../../../components/Modal';
import { Eye } from 'lucide-react';

const MM_TO_PX = 3.78; // 96 DPI

/**
 * Vista previa del cheque: renderiza el diseño a escala 1:1 (96 DPI)
 * con datos de ejemplo, fiel a lo que se imprimiría.
 */
export default function Preview({ formato, campos, isOpen, onClose }) {
    if (!formato) return null;

    const widthPx = (formato.width || 152.4) * MM_TO_PX;
    const heightPx = (formato.height || 69.85) * MM_TO_PX;
    const marginLeft = (formato.margin_left || 0) * MM_TO_PX;
    const marginTop = (formato.margin_top || 0) * MM_TO_PX;

    // Datos de ejemplo para la vista previa
    const ejemplo = {
        fecha: '14/08/2026',
        fecha_letras: '14 DE AGOSTO DE 2026',
        dia: '14',
        mes: '08',
        anio: '2026',
        beneficiario: 'Empresa de Prueba S.A.',
        monto_numeros: '1,234.56',
        monto_letras: 'Mil doscientos treinta y cuatro con 56/100',
        concepto: 'Pago de prueba',
        numero_cheque: '000123',
        ciudad: 'San Salvador',
        empresa: 'SIPE ADMIN',
        cuenta_bancaria: '000-0000000-00',
        usuario_impresion: 'admin',
        sucursal: 'Principal',
        observaciones: 'Observaciones de ejemplo',
    };

    const renderCampo = (campo) => {
        if (campo.visible === false) return null;
        const valor = ejemplo[campo.tipo] || ejemplo[campo.variable] || (campo.tipo === 'texto_fijo' ? campo.etiqueta : '');
        return (
            <div
                key={campo.id}
                style={{
                    position: 'absolute',
                    left: campo.x,
                    top: campo.y,
                    width: campo.ancho,
                    height: campo.alto,
                    transform: `rotate(${campo.rotacion || 0}deg)`,
                    fontSize: campo.fontSize,
                    fontFamily: campo.fuente || 'Arial',
                    fontWeight: campo.peso === 'bold' ? 'bold' : 'normal',
                    fontStyle: campo.estilo === 'italic' ? 'italic' : 'normal',
                    textDecoration: campo.subrayado ? 'underline' : 'none',
                    color: campo.color || '#000',
                    textAlign: campo.alineacion === 'centro' ? 'center' : campo.alineacion === 'derecha' ? 'right' : 'left',
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                }}
            >
                {valor}
            </div>
        );
    };

    return (
        <Modal open={isOpen} onClose={onClose} title="Vista Previa del Cheque" size="lg">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Renderizado a escala real (96 DPI). Los datos mostrados son de ejemplo.
                </p>
                <div style={{ overflow: 'auto', background: '#525659', padding: '2rem', borderRadius: 'var(--border-radius)' }}>
                    <div
                        style={{
                            position: 'relative',
                            width: `${widthPx}px`,
                            height: `${heightPx}px`,
                            background: '#ffffff',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                            margin: '0 auto',
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{ position: 'absolute', left: marginLeft, top: marginTop, right: (formato.margin_right || 0) * MM_TO_PX, bottom: (formato.margin_bottom || 0) * MM_TO_PX }}>
                            {campos.map(renderCampo)}
                        </div>
                        <div style={{ position: 'absolute', right: '6px', bottom: '4px', fontSize: '10px', color: '#999', fontFamily: 'monospace' }}>
                            {formato.width} x {formato.height} mm
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-primary" onClick={onClose} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Eye size={16} /> Cerrar
                    </button>
                </div>
            </div>
        </Modal>
    );
}