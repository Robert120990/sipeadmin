import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Text, Group } from 'react-konva';

const GRID_SIZE = 10;
const BASE_WIDTH_PX = 152.4 * 3.78;
const BASE_HEIGHT_PX = 69.85 * 3.78;

const applySnap = (value, shouldSnap) => {
    if (!shouldSnap) return value;
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
};

export default function DesignCanvas({ campos, setCampos, campoSeleccionado, setCampoSeleccionado, zoom, formato, updateCampo, agregarCampoEnPosicion, snapToGrid, showGrid }) {
    const stageRef = useRef();
    const [stageSize, setStageSize] = useState({ width: BASE_WIDTH_PX, height: BASE_HEIGHT_PX });

    useEffect(() => {
        if (formato) {
            const scaleFactor = formato.resolution / 96;
            const widthPx = (formato.width || 152.4) * 3.78 * scaleFactor;
            const heightPx = (formato.height || 69.85) * 3.78 * scaleFactor;
            setStageSize({ width: widthPx, height: heightPx });
        }
    }, [formato]);

    // Conversión mm -> px a 96 DPI (3.78 px/mm)
    const mmToPx = (mm) => (mm || 0) * 3.78;

    const handleStageClick = (e) => {
        const clickedOnEmpty = e.target === e.target.getStage();
        if (clickedOnEmpty) {
            setCampoSeleccionado(null);
        }
    };

    const handleDragEnd = (id) => (e) => {
        const newX = applySnap(Math.round(e.target.x()), snapToGrid);
        const newY = applySnap(Math.round(e.target.y()), snapToGrid);
        updateCampo(id, { x: newX, y: newY });
    };

    const handleTransformEnd = (id) => (e) => {
        const node = e.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        const newWidth = Math.max(5, applySnap(Math.round(node.width() * scaleX), snapToGrid));
        const newHeight = Math.max(5, applySnap(Math.round(node.height() * scaleY), snapToGrid));
        const newX = applySnap(Math.round(node.x()), snapToGrid);
        const newY = applySnap(Math.round(node.y()), snapToGrid);
        updateCampo(id, { x: newX, y: newY, ancho: newWidth, alto: newHeight });
    };

    const handleSelect = (campo) => {
        setCampoSeleccionado(campo);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const tipoCampo = e.dataTransfer.getData('text/plain');
        if (!tipoCampo) return;

        const stage = stageRef.current;
        if (!stage) return;

        // getRelativePointerPosition devuelve coordenadas del diseño (ya considera el zoom)
        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;

        agregarCampoEnPosicion(tipoCampo, Math.max(0, Math.round(pointer.x)), Math.max(0, Math.round(pointer.y)));
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    return (
        <div
            style={{ width: '100%', height: '100%', overflow: 'auto', cursor: 'grab' }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            <Stage
                ref={stageRef}
                width={stageSize.width}
                height={stageSize.height}
                onClick={handleStageClick}
                scale={{ x: zoom / 100, y: zoom / 100 }}
                style={{ background: '#f8f9fa', borderRadius: 'var(--border-radius)' }}
                draggable={false}
            >
                <Layer>
                    {showGrid && (
                        <>
                            {Array.from({ length: Math.ceil(stageSize.width / GRID_SIZE) }).map((_, i) => (
                                <Rect key={`v-${i}`} x={i * GRID_SIZE} y={0} width={1} height={stageSize.height} fill="rgba(0,0,0,0.05)" listening={false} />
                            ))}
                            {Array.from({ length: Math.ceil(stageSize.height / GRID_SIZE) }).map((_, i) => (
                                <Rect key={`h-${i}`} x={0} y={i * GRID_SIZE} width={stageSize.width} height={1} fill="rgba(0,0,0,0.05)" listening={false} />
                            ))}
                        </>
                    )}
                    {formato && (
                        <Rect
                            x={mmToPx(formato.margin_left)}
                            y={mmToPx(formato.margin_top)}
                            width={Math.max(0, stageSize.width - mmToPx(formato.margin_left) - mmToPx(formato.margin_right))}
                            height={Math.max(0, stageSize.height - mmToPx(formato.margin_top) - mmToPx(formato.margin_bottom))}
                            stroke="rgba(59,130,246,0.5)"
                            dash={[6, 4]}
                            listening={false}
                        />
                    )}
                </Layer>
                <Layer>
                    {campos.map((campo) => {
                        const isSelected = campoSeleccionado?.id === campo.id;
                        const textProps = {
                            x: 0,
                            y: 0,
                            text: campo.etiqueta,
                            width: campo.ancho,
                            height: campo.alto,
                            fontSize: parseInt(campo.fontSize),
                            fontFamily: campo.fuente || 'Arial',
                            fontStyle: (campo.peso === 'bold' ? 'bold ' : '') + (campo.estilo === 'italic' ? 'italic' : '') + (campo.subrayado ? 'underline' : ''),
                            fill: campo.color,
                            align: campo.alineacion === 'centro' ? 'center' : campo.alineacion === 'derecha' ? 'right' : 'left',
                            rotation: campo.rotacion,
                        };

                        return (
                            <Group
                                key={campo.id}
                                x={campo.x}
                                y={campo.y}
                                draggable
                                onClick={() => handleSelect(campo)}
                                onTap={() => handleSelect(campo)}
                                onDragStart={(ev) => {
                                    ev.cancelBubble = true;
                                }}
                                onDragEnd={handleDragEnd(campo.id)}
                                onTransformEnd={handleTransformEnd(campo.id)}
                                name={campo.id}
                            >
                                {!campo.visible && (
                                    <Rect x={0} y={0} width={campo.ancho} height={campo.alto} fill="rgba(255,0,0,0.1)" stroke="red" dash={[4, 4]} />
                                )}
                                <Text {...textProps} />
                                {isSelected && (
                                    <Rect
                                        x={-5}
                                        y={-5}
                                        width={campo.ancho + 10}
                                        height={campo.alto + 10}
                                        stroke="#3b82f6"
                                        dash={[4, 4]}
                                        listening={false}
                                    />
                                )}
                            </Group>
                        );
                    })}
                </Layer>
            </Stage>
        </div>
    );
}
