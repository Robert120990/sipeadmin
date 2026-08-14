import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import useDesigner from '../modules/check-designer/hooks/useDesigner';
import FormatManager from '../modules/check-designer/components/layout/FormatManager';
import DesignerView from '../modules/check-designer/components/layout/DesignerView';

/**
 * Página principal del Diseñador de Impresión de Cheques.
 * 
 * Este componente actúa como un contenedor principal. Usa el hook `useDesigner` para obtener
 * toda la lógica de estado. El contenido que se muestra depende de si hay un `formatId` en la URL:
 * - Sin `formatId`: Muestra el `FormatManager` (lista de formatos y modal de creación/edición).
 * - Con `formatId`: Carga el formato y muestra el `DesignerView` (interfaz del diseñador visual).
 */
export default function CheckDesigner() {
    const { formatId } = useParams();
    const designerState = useDesigner();
    const { cargarFormato, isLoading } = designerState;

    // Si la URL contiene un formatId, cargamos los datos de ese formato al montar el componente.
    useEffect(() => {
        if (formatId) {
            cargarFormato(formatId);
        }
    }, [formatId, cargarFormato]);

    // Si estamos en modo edición y aún estamos cargando, mostramos un estado de carga.
    if (formatId && isLoading) {
        return <div className="p-8 text-center text-muted">Cargando diseñador...</div>;
    }

    // Si hay un formatId, mostramos el diseñador visual.
    if (formatId) {
        // Pasamos todo el estado y las funciones del hook al DesignerView
        return <DesignerView {...designerState} />;
    }

    // Si no hay formatId, mostramos la lista de formatos.
    return <FormatManager />;
}
