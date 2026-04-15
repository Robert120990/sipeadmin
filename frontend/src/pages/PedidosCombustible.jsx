import React, { useState, useEffect, useMemo } from 'react';
import { Truck, CheckCircle, Save, XCircle, Search, Calendar, CheckSquare, PlusSquare } from 'lucide-react';
import { useToast } from '../components/Toast';
import api from '../services/api';

export default function PedidosCombustible() {
    const { addToast } = useToast();
    
    // T-1 Default Date Calculation
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = yesterday.toISOString().split('T')[0];

    const fmtDateArray = (dStr) => {
        if (!dStr) return '';
        // If it's a timestamp
        if (dStr.includes('T')) dStr = dStr.split('T')[0];
        const parts = dStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dStr;
    };

    // Master Data
    const [estaciones, setEstaciones] = useState([]);
    const [transportistas, setTransportistas] = useState([]);
    const [pipas, setPipas] = useState([]);

    // Selections
    const [selectedEstacion, setSelectedEstacion] = useState('');
    const [fechaConsulta, setFechaConsulta] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Formulario Agregar Pedido
    const [fechaPedido, setFechaPedido] = useState(defaultDate);
    const [previsualizar, setPrevisualizar] = useState(true);
    const [selectedTransporte, setSelectedTransporte] = useState('');
    const [selectedPipa, setSelectedPipa] = useState('');
    
    const [pedidoTemp, setPedidoTemp] = useState({ id: null });

    const [comp, setComp] = useState({
        D: { val: 0 },
        R: { val: 0 },
        S: { val: 0 },
        I: { val: 0 }
    });

    const totalPipa = Number(comp.D.val) + Number(comp.R.val) + Number(comp.S.val) + Number(comp.I.val);

    const pipasWithCap = useMemo(() => pipas.map(p => {
        let comps = [];
        try { comps = typeof p.compartments === 'string' ? JSON.parse(p.compartments) : p.compartments; } catch(e){}
        const totalCap = (comps || []).reduce((acc, curr) => acc + Number(curr.capacity || 0), 0);
        return { ...p, totalCapacity: totalCap };
    }), [pipas]);

    const recommendedPipa = useMemo(() => {
        if (totalPipa <= 0) return null;
        let best = pipasWithCap.find(p => p.totalCapacity === totalPipa);
        if (best) return best;
        const valid = pipasWithCap.filter(p => p.totalCapacity >= totalPipa);
        if (valid.length > 0) {
            valid.sort((a,b) => a.totalCapacity - b.totalCapacity);
            return valid[0];
        }
        if (pipasWithCap.length > 0) {
            const sorted = [...pipasWithCap].sort((a,b) => b.totalCapacity - a.totalCapacity);
            return sorted[0];
        }
        return null;
    }, [totalPipa, pipasWithCap]);

    // Operational Data
    const [inventario, setInventario] = useState([]);
    const [promedios, setPromedios] = useState({ D: 0, R: 0, S: 0, I: 0 });
    const [programados, setProgramados] = useState([]);

    // Modals
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmData, setConfirmData] = useState({
        numero_pedido: '', forma_pago: '', costo_d: 0, costo_r: 0, costo_s: 0, costo_i: 0
    });

    const numFmt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);
    const pctFmt = (val) => new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2 }).format(val || 0);

    // 1. Initial Load Master Data
    useEffect(() => {
        const fetchMaster = async () => {
            try {
                // Stations from web_consolidado
                const resCon = await api.get('/operaciones/estaciones');
                setEstaciones(resCon.data || []);
                
                // Transportistas & Pipas from local MySQL Core
                const resT = await api.get('/carriers');
                setTransportistas(resT.data || []);

                const resP = await api.get('/tankers');
                setPipas(resP.data || []);
            } catch (e) { addToast("Error cargando catálogos maestros", "error"); }
        };
        fetchMaster();
    }, []);

    // 3. Fetch Operational Data when Estacion changes
    const fetchOperationalData = async (est) => {
        if (!est) return;
        setIsLoading(true);
        try {
            // Inventario Tanques
            const resT = await api.get(`/operaciones/pedidos/datos-tanque/${est}/${defaultDate}`);
            setFechaConsulta(resT.data.fecha);
            setInventario(resT.data.inventario || []);

            // Promedios
            const resP = await api.get(`/operaciones/pedidos/promedios/${est}/${defaultDate}`);
            setPromedios(resP.data || { D: 0, R: 0, S: 0, I: 0 });

            // Programados
            const resProg = await api.get(`/operaciones/pedidos/programados/${est}/${resT.data.fecha}`);
            setProgramados(resProg.data || []);
            
            limpiarFormulario();
        } catch (error) {
            addToast("Error al obtener datos operativos", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchOperationalData(selectedEstacion); }, [selectedEstacion]);

    // Derived Matrix Computations
    const matrix = useMemo(() => {
        // sum of explicitly pending programados
        const sumProg = { D: 0, R: 0, S: 0, I: 0 };
        programados.forEach(p => {
            sumProg.D += Number(p.diesel || 0);
            sumProg.R += Number(p.regular || 0);
            sumProg.S += Number(p.super || 0);
            sumProg.I += Number(p.iondiesel || 0);
        });

        const getInvObj = (tipo) => inventario.find(i => i.tipo_combustible === tipo) || { capacidad: 0, reserva: 0, lectura: 0 };
        
        const buildCol = (tipo) => {
            const tk = getInvObj(tipo);
            const cap = Number(tk.capacidad);
            const res = Number(tk.reserva);
            const invActual = Number(tk.lectura);
            const prom = Number(promedios[tipo] || 0);
            
            let prog = sumProg[tipo];
            if (previsualizar) prog += Number(comp[tipo].val); // Add form input to forecasting
            
            let durDias = 0;
            if (prom > 0) durDias = (invActual + prog - res) / prom;

            let fechaDur = "";
            let nomDia = "";
            if (durDias > 0 && fechaConsulta) {
                const target = new Date(fechaConsulta);
                target.setDate(target.getDate() + Math.floor(durDias) + 1); // JS dates need standardizing with local offset, but rough approx is OK.
                fechaDur = target.toISOString().split('T')[0];
                const days = ['DOMINGO','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO'];
                nomDia = days[target.getUTCDay()];
            }

            let nivel = 0;
            if (cap > 0) nivel = (invActual + prog) / cap;

            return {
                capacidad: cap, reserva: res, inventario: invActual, promedio: prom, programado: prog,
                duracionDias: durDias, duracionFecha: fechaDur, duracionDiaNom: nomDia, nivelTanque: nivel
            };
        };

        return {
            D: buildCol('D'), R: buildCol('R'), S: buildCol('S'), I: buildCol('I')
        };
    }, [inventario, promedios, programados, previsualizar, comp, fechaConsulta]);

    const limpiarFormulario = () => {
        setFechaPedido(defaultDate);
        setSelectedTransporte('');
        setSelectedPipa('');
        setComp({
            D: { val: 0 }, R: { val: 0 },
            S: { val: 0 }, I: { val: 0 }
        });
        setPrevisualizar(true);
        setPedidoTemp({ id: null });
    };

    const autoSuggestPedido = () => {
        if (!selectedTransporte) return addToast('Por favor seleccione un Transportista primero', 'warning');
        if (!matrix || !pipasWithCap.length) return addToast('Faltan datos maestros de pipas o matriz', 'error');

        // maxFill is the absolute physical limit we can cram into the underground tanks.
        // We only consider types where capacity > 0 (meaning the station has that fuel)
        const activeTypes = ['D', 'R', 'S', 'I'].filter(type => matrix[type].capacidad > 0);
        
        const maxFill = {};
        activeTypes.forEach(type => {
            maxFill[type] = matrix[type].capacidad - matrix[type].inventario - matrix[type].programado;
        });

        // Enforce physical constraints
        const needsRefill = activeTypes.some(type => maxFill[type] > 500);
        if (!needsRefill) {
            return addToast('Los tanques ya están a máxima capacidad proyectada.', 'info');
        }

        const totalMax = activeTypes.reduce((acc, type) => acc + Math.max(0, maxFill[type]), 0);
        
        // Filter pipas only for the SELECTED carrier
        let carrierPipas = pipasWithCap.filter(p => p.carrier_id === Number(selectedTransporte));
        if (!carrierPipas.length) return addToast('Este transportista no tiene pipas registradas', 'error');

        // Find pipas that fit the totalMax, prioritize the largest valid one
        let validPipas = carrierPipas.filter(p => p.totalCapacity <= (totalMax + 100)).sort((a,b) => b.totalCapacity - a.totalCapacity);
        
        let bestPipa = validPipas.length > 0 ? validPipas[0] : [...carrierPipas].sort((a,b) => a.totalCapacity - b.totalCapacity)[0];

        let alloc = { D: 0, R: 0, S: 0, I: 0 };
        // Clone and sort compartments largest to smallest to fill knapsack
        let compartments = [...bestPipa.compartments].sort((a,b) => Number(b.capacity) - Number(a.capacity));

        compartments.forEach(c => {
            const cap = Number(c.capacity);
            let mostCriticalType = null;
            let lowestDuration = 9999;

            activeTypes.forEach(type => {
                const currentDur = matrix[type].duracionDias;
                const remainingSpace = maxFill[type] - alloc[type];
                if (remainingSpace >= (cap * 0.9) && currentDur < lowestDuration) {
                    lowestDuration = currentDur;
                    mostCriticalType = type;
                }
            });

            if (mostCriticalType) {
                alloc[mostCriticalType] += cap;
            } else {
                activeTypes.forEach(type => {
                    if (!mostCriticalType && (maxFill[type] - alloc[type] >= (cap * 0.9))) {
                        mostCriticalType = type;
                    }
                });
                if (!mostCriticalType) {
                   mostCriticalType = activeTypes.reduce((a, b) => matrix[a].duracionDias < matrix[b].duracionDias ? a : b);
                }
                alloc[mostCriticalType] += cap;
            }
        });

        setSelectedPipa(bestPipa.id);
        setComp({
            D: { val: alloc.D },
            R: { val: alloc.R },
            S: { val: alloc.S },
            I: { val: alloc.I }
        });
        
        addToast(`Sugerencia Aplicada: Pipa [${bestPipa.code}] de ${bestPipa.totalCapacity} Galones.`, 'success');

        // SUGGEST DATE: Find the fuel that runs out SOONEST
        let minDate = '';
        let minVal = 9999;
        activeTypes.forEach(type => {
            if (matrix[type].promedio > 0 && matrix[type].duracionDias < minVal) {
                minVal = matrix[type].duracionDias;
                minDate = matrix[type].duracionFecha;
            }
        });

        if (minDate) {
            // If the out-of-stock date is today or earlier, suggest today. 
            // Otherwise suggest the out-of-stock date (or 1 day before for safety)
            // Let's suggest the exact date it hits reserve so the fuel arrives justo a tiempo.
            setFechaPedido(minDate);
            addToast(`Fecha Sugerida: ${fmtDateArray(minDate)} (Agotamiento Crítico)`, 'info');
        }
    };

    // Safe Number Parsing helper
    const parseNum = (val) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    const handleGuardarPedido = async () => {
        if (!fechaPedido || !selectedTransporte || !selectedEstacion) return addToast('Faltan campos obligatorios', 'error');
        try {
            await api.post('/operaciones/pedidos/agregar', {
                id_pedido: pedidoTemp.id,
                id_estacion: selectedEstacion,
                fecha: fechaPedido,
                id_transportista: selectedTransporte, // Local Carriers ID
                diesel: parseNum(comp.D.val), regular: parseNum(comp.R.val), super: parseNum(comp.S.val), iondiesel: parseNum(comp.I.val),
                id_calibracion_diesel: selectedPipa || null, id_calibracion_regular: null,
                id_calibracion_super: null, id_calibracion_ion: null
            });
            addToast('Pedido Guardado', 'success');
            fetchOperationalData(selectedEstacion);
            limpiarFormulario();
        } catch (e) { addToast("Error agregando pedido", "error"); }
    };

    const handleEliminarPedido = async (id) => {
        if (!window.confirm("¿Anular Pedido?")) return;
        try {
            await api.delete(`/operaciones/pedidos/anular/${id}`);
            addToast("Pedido Anulado", "success");
            fetchOperationalData(selectedEstacion);
        } catch (e) {
            addToast(e.response?.data?.message || "Error al anular", "error");
        }
    };

    const loadPedidoToForm = (row) => {
        setPedidoTemp({ id: row.id_pedido });
        setFechaPedido(row.fecha ? row.fecha.split('T')[0] : '');
        setSelectedTransporte(row.id_transportista || '');
        setSelectedPipa(row.id_calibracion_diesel || ''); // Reverse mapping Pipa to legacy diesel calibration field
        setComp({
            D: { val: row.diesel },
            R: { val: row.regular },
            S: { val: row.super },
            I: { val: row.iondiesel }
        });
        setPrevisualizar(false);
    };

    const triggerConfirm = (row) => {
        setPedidoTemp({ id: row.id_pedido });
        setShowConfirmModal(true);
    };

    const executeConfirmTransaction = async () => {
        if (!confirmData.numero_pedido) return addToast('Ingrese el número de pedido', 'warning');
        try {
            await api.post('/operaciones/pedidos/confirmar', {
                id_pedido: pedidoTemp.id,
                numero: confirmData.numero_pedido,
                id_estacion: selectedEstacion,
                forma_pago: confirmData.forma_pago,
                costo_d: confirmData.costo_d, costo_r: confirmData.costo_r,
                costo_s: confirmData.costo_s, costo_i: confirmData.costo_i
            });
            addToast("Pedido Confirmado Exitosamente", "success");
            setShowConfirmModal(false);
            setConfirmData({ numero_pedido: '', forma_pago: '', costo_d: 0, costo_r: 0, costo_s: 0, costo_i: 0 });
            fetchOperationalData(selectedEstacion);
        } catch (e) {
            addToast(e.response?.data?.message || "Error en confirmación", "error");
        }
    };

    const getSelectedPipaData = () => pipas.find(p => p.id === Number(selectedPipa));
    const renderCompartments = () => {
        const pData = getSelectedPipaData();
        if (!pData || !pData.compartments) return null;
        let comps = [];
        try { comps = typeof pData.compartments === 'string' ? JSON.parse(pData.compartments) : pData.compartments; } catch(e){}
        if (!comps.length) return null;
        
        return (
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                <span style={{ fontSize:'0.7rem', fontWeight:'bold', width:'100%', marginBottom:'0.2rem', color:'var(--primary)' }}>COMPARTIMIENTOS PIPA ({comps.length}):</span>
                {comps.map((c, i) => (
                    <div key={i} style={{ border: '1px solid var(--border)', background: 'var(--bg-active)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)' }}>C{i+1}</span>
                        <b>{numFmt(c.capacity)}</b>
                    </div>
                ))}
            </div>
        );
    };

    const RenderPipaRecommendation = () => {
        if (totalPipa <= 0 || !recommendedPipa) return null;
        
        const isCurrentOk = selectedPipa && Number(selectedPipa) === recommendedPipa.id;
        return (
            <div style={{ marginTop: '0.5rem', marginBottom: '1rem', padding: '0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: isCurrentOk ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: isCurrentOk ? '#10b981' : '#ef4444', border: `1px solid ${isCurrentOk ? '#10b981' : '#ef4444'}`
            }}>
                {isCurrentOk ? (
                    <>✓ La Pipa seleccionada cubre dinámicamente tu solicitud.</>
                ) : (
                    <>⚠️ Sugerencia de Eficiencia: Selecciona la Pipa [{recommendedPipa.code}] (Capacidad Fija: {numFmt(recommendedPipa.totalCapacity)})</>
                )}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', zoom: 0.95 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.2rem', margin: 0 }}>
                    <Truck size={24} color="var(--primary)" /> Pedidos de Combustible
                </h1>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', padding: '0.4rem 1rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        DATOS AL DIA: {fmtDateArray(fechaConsulta)}
                    </div>
                </div>
            </div>

            {/* Top Toolbar */}
            <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>ESTACION</label>
                    <select value={selectedEstacion} onChange={e => setSelectedEstacion(e.target.value)} disabled={isLoading}
                        style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', minWidth: '250px' }}>
                        <option value="" style={{ background: '#1e293b', color: 'white' }}>-- Seleccione Estación --</option>
                        {estaciones.map(e => <option key={e.id_empresa} value={e.id_empresa} style={{ background: '#1e293b', color: 'white' }}>{e.titulo}</option>)}
                    </select>
                </div>
                {isLoading && <span style={{ color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid var(--primary)', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    Sincronizando Módulos...
                </span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) 2fr', gap: '1rem', alignItems: 'start', opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
                {/* Panel Izquierdo: Formulario */}
                <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--primary)', textAlign: 'center', borderBottom: '1px solid var(--primary)', paddingBottom: '0.5rem' }}>OPERACIONES PARA AGREGAR PEDIDO</h3>
                    
                    <button onClick={autoSuggestPedido} className="btn-success" style={{ width: '100%', margin: '0.5rem 0', padding: '0.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: '#10b981', color: '#fff' }}>
                        <CheckSquare size={18} /> Sugerir Pedido (IA)
                    </button>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>FECHA</span>
                        <input type="date" value={fechaPedido} onChange={e => setFechaPedido(e.target.value)} style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px' }} />
                        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <input type="checkbox" checked={previsualizar} onChange={e => setPrevisualizar(e.target.checked)} /> PREVISUALIZAR
                        </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>TRANSPORTE</span>
                        <select value={selectedTransporte} onChange={e => {setSelectedTransporte(e.target.value); setSelectedPipa('');}} style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px' }}>
                            <option value="" style={{ background: '#1e293b', color: 'white' }}>-- Seleccione --</option>
                            {transportistas.map(t => <option key={t.id} value={t.id} style={{ background: '#1e293b', color: 'white' }}>[{t.code}] {t.description}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>PIPA</span>
                        <select value={selectedPipa} onChange={e => setSelectedPipa(e.target.value)} style={{ flex: 1, padding: '0.35rem', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px' }} disabled={!selectedTransporte}>
                            <option value="" style={{ background: '#1e293b', color: 'white' }}>-- Seleccione Pipa --</option>
                            {pipas.filter(p => !selectedTransporte || p.carrier_id === Number(selectedTransporte)).map(p => (
                                <option key={p.id} value={p.id} style={{ background: '#1e293b', color: 'white' }}>{p.code}</option>
                            ))}
                        </select>
                    </div>

                    {renderCompartments()}

                    {/* Inline InputSets to prevent Unmount/Remount Focus Loss */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '100px' }}>DIESEL</span>
                        <input type="number" min="0" step="1" value={comp.D.val || ''} onChange={e => setComp({...comp, D: {val: e.target.value}})}
                            style={{ flex: 1, minWidth: '120px', textAlign: 'right', padding: '0.35rem', fontSize: '0.85rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-color)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '100px' }}>REGULAR</span>
                        <input type="number" min="0" step="1" value={comp.R.val || ''} onChange={e => setComp({...comp, R: {val: e.target.value}})}
                            style={{ flex: 1, minWidth: '120px', textAlign: 'right', padding: '0.35rem', fontSize: '0.85rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-color)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '100px' }}>SUPER</span>
                        <input type="number" min="0" step="1" value={comp.S.val || ''} onChange={e => setComp({...comp, S: {val: e.target.value}})}
                            style={{ flex: 1, minWidth: '120px', textAlign: 'right', padding: '0.35rem', fontSize: '0.85rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-color)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '100px' }}>IONDIESEL</span>
                        <input type="number" min="0" step="1" value={comp.I.val || ''} onChange={e => setComp({...comp, I: {val: e.target.value}})}
                            style={{ flex: 1, minWidth: '120px', textAlign: 'right', padding: '0.35rem', fontSize: '0.85rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-color)' }} />
                    </div>

                    <RenderPipaRecommendation />

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', borderTop: '2px solid var(--border)', paddingTop: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-color)' }}>TOTAL PIPA</span>
                            <input type="text" readOnly value={numFmt(totalPipa)} style={{ flex: 1, maxWidth: '180px', textAlign: 'right', padding: '0.35rem', fontSize: '1rem', fontWeight: 'bold', background: 'var(--bg-active)', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', width: '100%' }}>
                            <button className="btn-primary" onClick={handleGuardarPedido} style={{ fontSize: '0.7rem', padding: '0.4rem 0.5rem' }}>
                                AGREGAR PEDIDO
                            </button>
                            <button className="btn-secondary" onClick={limpiarFormulario} style={{ fontSize: '0.7rem', padding: '0.4rem 0.5rem' }}>
                                CANCELAR
                            </button>
                        </div>
                    </div>
                </div>

                {/* Panel Derecho: Matriz de Resultados */}
                <div className="card glass" style={{ padding: 0, overflowX: 'auto' }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--primary)', textAlign: 'center', background: 'rgba(37,99,235,0.1)', padding: '0.5rem' }}>RESUMEN DE DATOS OPERACIONALES</h3>
                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-color)' }}>
                                <th style={{ padding: '0.5rem', textAlign: 'left' }}>METRICA</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right', borderLeft: '2px solid var(--primary)' }}>DIESEL</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right', borderLeft: '2px solid var(--border)' }}>REGULAR</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right', borderLeft: '2px solid var(--border)' }}>SUPER</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right', borderLeft: '2px solid var(--border)' }}>IONDIESEL</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>CAPACIDAD MAXIMA</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.capacidad)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.capacidad)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.capacidad)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.capacidad)}</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>FUERA DE VENTA</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.reserva)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.reserva)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.reserva)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.reserva)}</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>INVENTARIO ACTUAL</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.inventario)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.inventario)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.inventario)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.inventario)}</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>VENTA PROMEDIO</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.promedio)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.promedio)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.promedio)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.promedio)}</td>
                            </tr>
                            <tr style={{ background: 'rgba(37,99,235,0.05)' }}>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', color: 'var(--primary)' }}>PEDIDOS PROGRAMADOS</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.programado)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.programado)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.programado)}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.programado)}</td>
                            </tr>
                            <tr>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>DURACION EN DIAS</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}><b>{matrix.D.duracionDias.toFixed(1)}</b></td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}><b>{matrix.R.duracionDias.toFixed(1)}</b></td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}><b>{matrix.S.duracionDias.toFixed(1)}</b></td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}><b>{matrix.I.duracionDias.toFixed(1)}</b></td>
                            </tr>
                            <tr>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>DURACION EN FECHA</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)', fontSize: '0.7rem' }}>{fmtDateArray(matrix.D.duracionFecha)}<br/>{matrix.D.duracionDiaNom}</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontSize: '0.7rem' }}>{fmtDateArray(matrix.R.duracionFecha)}<br/>{matrix.R.duracionDiaNom}</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontSize: '0.7rem' }}>{fmtDateArray(matrix.S.duracionFecha)}<br/>{matrix.S.duracionDiaNom}</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontSize: '0.7rem' }}>{fmtDateArray(matrix.I.duracionFecha)}<br/>{matrix.I.duracionDiaNom}</td>
                            </tr>
                            <tr style={{ background: 'rgba(16,185,129,0.1)' }}>
                                <td style={{ padding: '0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', color: '#10b981' }}>NIVEL DE TANQUES</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)', fontWeight: 'bold' }}>{pctFmt(matrix.D.nivelTanque)}</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontWeight: 'bold' }}>{pctFmt(matrix.R.nivelTanque)}</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontWeight: 'bold' }}>{pctFmt(matrix.S.nivelTanque)}</td>
                                <td style={{ textAlign: 'center', padding: '0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontWeight: 'bold' }}>{pctFmt(matrix.I.nivelTanque)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tablas Inferiores */}
            <div className="card glass" style={{ padding: 0, opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
                <h3 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text)', background: 'var(--bg-active)', padding: '0.5rem', borderBottom: '1px solid var(--border)' }}>PEDIDOS PROGRAMADOS POR ESTACION</h3>
                <div style={{ overflowX: 'auto', padding: '0.5rem' }}>
                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-color)' }}>
                                <th style={{ textAlign: 'left', padding: '0.5rem' }}>FECHA</th>
                                <th style={{ textAlign: 'left', padding: '0.5rem' }}>ORDEN_T</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem' }}>DIESEL</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem' }}>REGULAR</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem' }}>SUPER</th>
                                <th style={{ textAlign: 'right', padding: '0.5rem' }}>ION</th>
                                <th style={{ textAlign: 'center', padding: '0.5rem' }}>ACCION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {programados.map(p => (
                                <tr key={p.id_pedido} style={{ borderBottom: '1px solid var(--border)' }} onDoubleClick={() => loadPedidoToForm(p)}>
                                    <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{fmtDateArray(p.fecha)}</td>
                                    <td style={{ padding: '0.5rem', color: 'var(--primary)' }}><b>{p.numero || p.id_pedido}</b></td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{numFmt(p.diesel)}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{numFmt(p.regular)}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{numFmt(p.super)}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>{numFmt(p.iondiesel)}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                        <button onClick={() => triggerConfirm(p)} className="btn-primary" style={{ padding: '3px 10px', fontSize: '0.65rem' }}>CONFIRMAR</button>
                                        <button onClick={() => handleEliminarPedido(p.id_pedido)} className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.65rem', color: '#ef4444', borderColor: '#ef4444' }}>ANULAR</button>
                                    </td>
                                </tr>
                            ))}
                            {programados.length === 0 && (
                                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No hay pedidos programados</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Confirmacion Falsa/MVP */}
            {showConfirmModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div className="card glass" style={{ width: '400px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h3 style={{ margin: 0, borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>Confirmar Transacción</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>NÚMERO DE PEDIDO</label>
                            <input type="text" placeholder="Ingrese número de pedido" value={confirmData.numero_pedido} onChange={e=>setConfirmData({...confirmData, numero_pedido: e.target.value})} style={{ padding: '0.5rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>FORMA DE PAGO</label>
                            <input type="text" placeholder="Ej. CREDITO, EFECTIVO, CHEQUE..." value={confirmData.forma_pago} onChange={e=>setConfirmData({...confirmData, forma_pago: e.target.value})} style={{ padding: '0.5rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.7rem' }}>Costo D</label>
                                <input type="number" step="0.01" value={confirmData.costo_d} onChange={e=>setConfirmData({...confirmData, costo_d: e.target.value})} style={{ padding:'0.35rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px' }}/>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.7rem' }}>Costo R</label>
                                <input type="number" step="0.01" value={confirmData.costo_r} onChange={e=>setConfirmData({...confirmData, costo_r: e.target.value})} style={{ padding:'0.35rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px' }}/>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.7rem' }}>Costo S</label>
                                <input type="number" step="0.01" value={confirmData.costo_s} onChange={e=>setConfirmData({...confirmData, costo_s: e.target.value})} style={{ padding:'0.35rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px' }}/>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontSize: '0.7rem' }}>Costo Ion</label>
                                <input type="number" step="0.01" value={confirmData.costo_i} onChange={e=>setConfirmData({...confirmData, costo_i: e.target.value})} style={{ padding:'0.35rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px' }}/>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                            <button className="btn-secondary" onClick={() => setShowConfirmModal(false)}>Cancelar</button>
                            <button className="btn-primary" onClick={executeConfirmTransaction}>Aplicar Confirmación</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
