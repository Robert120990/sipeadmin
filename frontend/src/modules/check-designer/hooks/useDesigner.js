import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import DesignerService from '../services/DesignerService';
import { VARIABLES_DISPONIBLES } from '../types';
import { useToast } from '../../../components/Toast';

const GRID_SIZE = 10;

const snapToGridValue = (value, isSnapping) => {
    if (!isSnapping) return value;
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
};

const useDesigner = (formatId) => {
    const { addToast } = useToast();
    
    const [formato, setFormato] = useState(null);
    const [campos, setCampos] = useState([]);
    const [campoSeleccionado, setCampoSeleccionado] = useState(null);
    const [seleccionMultiple, setSeleccionMultiple] = useState([]);
    
    const [zoom, setZoom] = useState(100);
    const [showGrid, setShowGrid] = useState(true);
    const [showRules, setShowRules] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    // Referencias espejo para evitar cierres obsoletos (stale closures)
    const camposRef = useRef(campos);
    const historialRef = useRef({ undo: [], redo: [] });
    const formatoIdRef = useRef(formatId);

    useEffect(() => { camposRef.current = campos; }, [campos]);
    useEffect(() => { formatoIdRef.current = formatId; }, [formatId]);

    const pushToHistory = useCallback(() => {
        historialRef.current.undo.push(JSON.parse(JSON.stringify(camposRef.current)));
        historialRef.current.redo = [];
    }, []);

    const cargarFormato = useCallback(async (id) => {
        if (!id) return;
        setIsLoading(true);
        try {
            const data = await DesignerService.getFormatById(id);
            setFormato(data);
            setCampos(data.design_json.campos || []);
            historialRef.current = { undo: [], redo: [] };
        } catch (error) {
            addToast('Error al cargar el formato', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    const crearNuevoFormato = (bancoId, bancoNombre) => {
        const nuevoFormato = {
            name: `Nuevo Formato ${bancoNombre || ''}`,
            banco_id: bancoId,
            description: '',
            width: 152.4,
            height: 69.85,
            orientation: 'horizontal',
            margin_top: 10,
            margin_right: 10,
            margin_bottom: 10,
            margin_left: 10,
            resolution: 96,
            printer_name: null,
            is_active: true,
            design_json: { campos: [] },
        };
        setFormato(nuevoFormato);
        setCampos([]);
        setCampoSeleccionado(null);
        setSeleccionMultiple([]);
        historialRef.current = { undo: [], redo: [] };
    };

    const guardarCambiosDiseno = useCallback(async (id) => {
        if (!id || !formato) return;
        const designJson = { campos: camposRef.current };
        try {
            await DesignerService.saveDesign(id, designJson);
            addToast('Diseño guardado', 'success');
        } catch (error) {
            addToast('Error al guardar el diseño', 'error');
        }
    }, [formato, addToast]);

    const guardarFormatoCompleto = useCallback(async () => {
        if (!formato) return;
        const dataToSave = { ...formato, design_json: { campos: camposRef.current } };
        try {
            if (dataToSave.id) {
                await DesignerService.updateFormat(dataToSave.id, dataToSave);
                addToast('Formato actualizado', 'success');
            } else {
                const result = await DesignerService.createFormat(dataToSave);
                setFormato(prev => ({ ...prev, id: result.id }));
                addToast('Formato creado', 'success');
            }
        } catch (error) {
            addToast('Error al guardar el formato', 'error');
        }
    }, [formato, addToast]);

    const crearCampoNuevo = (tipoCampo, x, y, etiquetaExtra) => {
        const variable = VARIABLES_DISPONIBLES.find(v => v.tipo === tipoCampo);
        return {
            id: uuidv4(),
            tipo: tipoCampo,
            variable: tipoCampo,
            etiqueta: tipoCampo === 'texto_fijo' ? (etiquetaExtra || variable?.etiqueta || 'NO NEGOCIABLE') : `Nuevo ${variable?.etiqueta || tipoCampo}`,
        x: snapToGridValue(x, snapToGrid),
        y: snapToGridValue(y, snapToGrid),
        ancho: 150,
        alto: 30,
        rotacion: 0,
        peso: 'normal',
        estilo: 'normal',
        fuente: 'Arial',
        fontSize: '12px',
        color: '#000000',
        alineacion: 'izquierda',
        subrayado: false,
        formatoFecha: 'DD/MM/YYYY',
        formatoMonetario: '#,##0.00',
        visible: true,
    };
};
    const agregarCampo = useCallback((tipoCampo, x = 10, y = 10, etiquetaExtra = null) => {
        const nuevoCampo = crearCampoNuevo(tipoCampo, x, y, etiquetaExtra);
        pushToHistory();
        setCampos(prev => [...prev, nuevoCampo]);
        setCampoSeleccionado(nuevoCampo);
        setSeleccionMultiple([]);
    }, [snapToGrid, pushToHistory]);

    const agregarCampoEnPosicion = useCallback((tipoCampo, x, y, etiquetaExtra = null) => {
        agregarCampo(tipoCampo, x, y, etiquetaExtra);
    }, [agregarCampo]);

    const actualizarCampo = useCallback((id, nuevasPropiedades) => {
        const propsClave = ['x', 'y', 'ancho', 'alto', 'rotacion', 'etiqueta'];
        const esCambioSignificativo = Object.keys(nuevasPropiedades).some(key => propsClave.includes(key));

        if (esCambioSignificativo) {
            pushToHistory();
        }
        setCampos(prev => prev.map(campo => campo.id === id ? { ...campo, ...nuevasPropiedades } : campo));
        setCampoSeleccionado(prev => prev && prev.id === id ? { ...prev, ...nuevasPropiedades } : prev);
    }, [pushToHistory]);

    const eliminarCampo = useCallback((id) => {
        pushToHistory();
        setCampos(prev => prev.filter(c => c.id !== id));
        setCampoSeleccionado(null);
        setSeleccionMultiple(prev => prev.filter(i => i !== id));
    }, [pushToHistory]);

    const duplicarCampo = useCallback((id) => {
        const campo = camposRef.current.find(c => c.id === id);
        if (!campo) return;
        const nuevoCampo = { ...campo, id: uuidv4(), x: campo.x + 20, y: campo.y + 20 };
        pushToHistory();
        setCampos(prev => [...prev, nuevoCampo]);
        setCampoSeleccionado(nuevoCampo);
    }, [pushToHistory]);

    const seleccionarCampo = useCallback((id, isMulti = false) => {
        const campo = camposRef.current.find(c => c.id === id);
        if (!campo) return;

        if (isMulti) {
            setSeleccionMultiple(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
            setCampoSeleccionado(null);
        } else {
            setCampoSeleccionado(campo);
            setSeleccionMultiple([]);
        }
    }, []);

    const setZoomLevel = useCallback((level) => {
        setZoom(Math.max(25, Math.min(200, level)));
    }, []);

    const undo = useCallback(() => {
        if (historialRef.current.undo.length === 0) return;
        const previousState = historialRef.current.undo.pop();
        historialRef.current.redo.push(JSON.parse(JSON.stringify(camposRef.current)));
        setCampos(previousState);
        setCampoSeleccionado(null);
    }, []);

    const redo = useCallback(() => {
        if (historialRef.current.redo.length === 0) return;
        const nextState = historialRef.current.redo.pop();
        historialRef.current.undo.push(JSON.parse(JSON.stringify(camposRef.current)));
        setCampos(nextState);
        setCampoSeleccionado(null);
    }, []);

    return {
        formato,
        setFormato,
        campos,
        setCampos,
        campoSeleccionado,
        setCampoSeleccionado,
        seleccionMultiple,
        zoom,
        showGrid,
        showRules,
        snapToGrid,
        isLoading,
        setShowGrid,
        setShowRules,
        setSnapToGrid,
        cargarFormato,
        crearNuevoFormato,
        guardarCambiosDiseno,
        guardarFormatoCompleto,
        agregarCampo,
        agregarCampoEnPosicion,
        actualizarCampo,
        eliminarCampo,
        duplicarCampo,
        seleccionarCampo,
        setZoomLevel,
        undo,
        redo,
    };
};

export default useDesigner;
