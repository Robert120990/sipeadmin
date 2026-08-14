import React from 'react';

/**
 * Componente Ruler: Muestra reglas horizontales y verticales alrededor del canvas.
 * Actualmente es un placeholder visual.
 */
export default function Ruler() {
    return (
        <>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '20px', background: '#e0e0e0', borderBottom: '1px solid #ccc', zIndex: 10, fontFamily: 'monospace', fontSize: '10px', paddingLeft: '5px', boxSizing: 'border-box' }}>
                {/* Marcas de regla vertical */}
                Ruler H
            </div>
            <div style={{ position: 'absolute', top: '20px', left: 0, bottom: 0, width: '20px', background: '#e0e0e0', borderRight: '1px solid #ccc', zIndex: 10, fontFamily: 'monospace', fontSize: '10px', paddingTop: '5px', boxSizing: 'border-box' }}>
                {/* Marcas de regla horizontal */}
                R
            </div>
        </>
    );
}
