import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Truck, CheckCircle, XCircle, RefreshCw, AlertTriangle, ExternalLink,
    CreditCard, DollarSign, FileText, CheckCircle2, Clock, Scale, Eye,
    TrendingUp, TrendingDown, Layers, ChevronRight, Filter, Sliders, CheckSquare, Plus,
    Activity, ShieldCheck, Key, Copy, Lock, EyeOff, Save
} from 'lucide-react';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import api from '../services/api';
import { socket } from '../services/socket';
import { todayStr } from '../utils/date';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';

export default function PedidosCombustible() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const fmtDateArray = (dStr) => {
        if (!dStr) return '';
        if (dStr.includes('T')) dStr = dStr.split('T')[0];
        const parts = dStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dStr;
    };

    const numFmt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);
    const numFmt4 = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(val || 0);
    const pctFmt = (val) => new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2 }).format(val || 0);

    // Active Tab Navigation
    const [activeTab, setActiveTab] = useState('portal'); // Default to portal as requested

    // Master Data
    const [estaciones, setEstaciones] = useState([]);
    const [transportistas, setTransportistas] = useState([]);
    const [pipas, setPipas] = useState([]);
    const [cuentasBancarias, setCuentasBancarias] = useState([]);
    const [fechaServidor, setFechaServidor] = useState(null);

    // Operational Programados Data
    const [selectedEstacion, setSelectedEstacion] = useState('');
    const [fechaConsulta, setFechaConsulta] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [fechaPedido, setFechaPedido] = useState('');
    const [previsualizar, setPrevisualizar] = useState(true);
    const [selectedTransporte, setSelectedTransporte] = useState('');
    const [selectedPipa, setSelectedPipa] = useState('');
    const [pedidoTemp, setPedidoTemp] = useState({ id: null });
    const [comp, setComp] = useState({ D: { val: 0 }, R: { val: 0 }, S: { val: 0 }, I: { val: 0 } });
    const [inventario, setInventario] = useState([]);
    const [promedios, setPromedios] = useState({ D: 0, R: 0, S: 0, I: 0 });
    const [programados, setProgramados] = useState([]);

    // Portal Orders State & Pagination (10 por defecto para no sobrecargar)
    const [portalOrders, setPortalOrders] = useState([]);
    const [portalLimit, setPortalLimit] = useState(10);
    const [portalTotal, setPortalTotal] = useState(0);
    const [hasMorePortal, setHasMorePortal] = useState(false);
    const [isLoadingMorePortal, setIsLoadingMorePortal] = useState(false);
    const portalSentinelRef = useRef(null);
    const [portalResumen, setPortalResumen] = useState({
        saldo_disponible: 633,
        limite_credito: 2000,
        porcentaje_disponible: 32,
        cuenta_nombre: 'corina sosah',
        cuenta_numero: '3409396',
        ultima_sincronizacion: null
    });
    const [preciosCombustible, setPreciosCombustible] = useState([]);
    const [isSyncingPortal, setIsSyncingPortal] = useState(false);
    const [isPortalLoading, setIsPortalLoading] = useState(true);
    const [syncingOrderNum, setSyncingOrderNum] = useState(null);

    // Portal Filters
    const [filterEstacion, setFilterEstacion] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterEstadoPago, setFilterEstadoPago] = useState('');
    const [filterSearch, setFilterSearch] = useState('');

    // Modals
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmData, setConfirmData] = useState({
        numero_pedido: '', forma_pago: '', costo_d: 0, costo_r: 0, costo_s: 0, costo_i: 0
    });

    const [showVincularPagoModal, setShowVincularPagoModal] = useState(false);
    const [pagoForm, setPagoForm] = useState({
        numero_orden: '',
        monto_total: 0,
        estacion_nombre: '',
        cuenta_bancaria_id: '',
        tipo_pago: 'Transferencia',
        referencia_pago: '',
        fecha_pago: todayStr(),
        monto_pagado: 0,
        observaciones: '',
        alistar_conciliacion: true,
        es_conciliado: 0
    });

    const [showAjustarCostosModal, setShowAjustarCostosModal] = useState(false);
    const [costosForm, setCostosForm] = useState({
        numero_orden: '',
        estacion_nombre: '',
        costo_diesel: 0,
        costo_regular: 0,
        costo_super: 0,
        costo_ion: 0,
        galones_diesel: 0,
        galones_regular: 0,
        galones_super: 0,
        galones_ion: 0,
        monto_total: 0
    });

    const [showDetalleModal, setShowDetalleModal] = useState(false);
    const [selectedOrderDetalle, setSelectedOrderDetalle] = useState(null);

    // Diagnóstico Portal Puma
    const [showDiagnosticoModal, setShowDiagnosticoModal] = useState(false);
    const [diagnosticoData, setDiagnosticoData] = useState(null);
    const [isLoadingDiagnostico, setIsLoadingDiagnostico] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState('');
    const [isSubmittingCode, setIsSubmittingCode] = useState(false);

    // Credenciales Portal Puma / Energy Latam
    const [portalCredsData, setPortalCredsData] = useState(null);
    const [inputPortalUser, setInputPortalUser] = useState('');
    const [inputPortalPass, setInputPortalPass] = useState('');
    const [showPortalPass, setShowPortalPass] = useState(false);
    const [isSavingCreds, setIsSavingCreds] = useState(false);

    const [showNuevoPrecioModal, setShowNuevoPrecioModal] = useState(false);
    const [precioForm, setPrecioForm] = useState({
        periodo_inicio: '',
        periodo_fin: '',
        precio_diesel: 3.68,
        precio_regular: 3.85,
        precio_super: 4.18,
        precio_ion: 3.78,
        variacion_diesel: 0,
        variacion_regular: 0,
        variacion_super: 0,
        variacion_ion: 0,
        fuente: 'Portal Energy-Latam / DGEHM',
        aplicar_a_pedidos_pendientes: true
    });

    // 1. Initial Load Master Data, Portal Orders, Accounts & Prices
    const fetchPortalOrders = async (reset = true, customLimit = null) => {
        const activeLimit = customLimit !== null ? customLimit : portalLimit;
        if (reset) {
            setIsPortalLoading(true);
        } else {
            if (isLoadingMorePortal || !hasMorePortal) return;
            setIsLoadingMorePortal(true);
        }

        try {
            const offset = reset ? 0 : portalOrders.length;
            const params = {
                limit: activeLimit,
                offset: offset
            };
            if (filterEstacion) params.estacion = filterEstacion;
            if (filterEstado) params.estado = filterEstado;
            if (filterTipo) params.tipo_producto = filterTipo;
            if (filterEstadoPago) params.estado_pago = filterEstadoPago;
            if (filterSearch) params.search = filterSearch;

            const res = await api.get('/operaciones/portal/pedidos', { params });
            const items = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            const total = res.data?.total !== undefined ? res.data.total : items.length;
            const hasMore = res.data?.hasMore !== undefined ? res.data.hasMore : false;

            if (reset) {
                setPortalOrders(items);
            } else {
                setPortalOrders(prev => {
                    const existingKeys = new Set(prev.map(p => String(p.numero_orden || p.id)));
                    const filtered = items.filter(p => !existingKeys.has(String(p.numero_orden || p.id)));
                    return [...prev, ...filtered];
                });
            }
            setPortalTotal(total);
            setHasMorePortal(hasMore);
        } catch (e) {
            console.error('Error fetching portal orders:', e);
            addToast('Error al consultar pedidos del portal: ' + (e.response?.data?.message || e.message), 'error');
        } finally {
            if (reset) {
                setIsPortalLoading(false);
            } else {
                setIsLoadingMorePortal(false);
            }
        }
    };

    const fetchPortalResumen = async () => {
        try {
            const res = await api.get('/operaciones/portal/resumen-cuenta');
            if (res.data) setPortalResumen(res.data);
        } catch (e) {
            console.error('Error fetching portal resumen:', e);
        }
    };

    const fetchPreciosCombustible = async () => {
        try {
            const res = await api.get('/operaciones/portal/precios-combustible');
            setPreciosCombustible(res.data || []);
        } catch (e) {
            console.error('Error fetching precios combustible:', e);
        }
    };

    const fetchCuentas = async () => {
        try {
            const res = await api.get('/bancos/cuentas');
            const sorted = sortCuentas(res.data || []);
            setCuentasBancarias(sorted);
        } catch (e) {
            console.error('Error fetching bank accounts:', e);
        }
    };

    useEffect(() => {
        const fetchMaster = async () => {
            try {
                const resCon = await api.get('/operaciones/estaciones');
                setEstaciones(resCon.data || []);

                const resT = await api.get('/carriers');
                setTransportistas(resT.data || []);

                const resP = await api.get('/tankers');
                setPipas(resP.data || []);

                let fechaHoy = todayStr();
                const addDay = (str) => {
                    const [y, m, d] = str.split('-').map(Number);
                    const dt = new Date(y, m - 1, d + 1);
                    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                };

                try {
                    const resFecha = await api.get('/operaciones/fecha-servidor-global');
                    const fa = resFecha.data?.fecha_ayer;
                    const fp = resFecha.data?.fecha_actual;
                    if (fa) {
                        setFechaServidor(fa);
                        setFechaConsulta(fa);
                        setFechaPedido(fp || fa);
                    } else {
                        setFechaServidor(fechaHoy);
                        setFechaConsulta(fechaHoy);
                        setFechaPedido(addDay(fechaHoy));
                    }
                } catch (e) {
                    setFechaServidor(fechaHoy);
                    setFechaConsulta(fechaHoy);
                    setFechaPedido(addDay(fechaHoy));
                }
            } catch (e) {
                addToast("Error cargando catálogos maestros", "error");
            }
        };

        fetchMaster();
        fetchPortalOrders();
        fetchPortalResumen();
        fetchPreciosCombustible();
        fetchCuentas();

        // Socket listeners for real-time synchronization
        const handlePortalUpdate = () => {
            fetchPortalOrders();
            fetchPortalResumen();
        };

        const handlePreciosUpdate = () => {
            fetchPreciosCombustible();
            fetchPortalOrders();
        };

        socket.on('portal_pedidos_updated', handlePortalUpdate);
        socket.on('combustible_precios_updated', handlePreciosUpdate);
        socket.on('carriers_updated', fetchMaster);
        socket.on('tankers_updated', fetchMaster);

        return () => {
            socket.off('portal_pedidos_updated', handlePortalUpdate);
            socket.off('combustible_precios_updated', handlePreciosUpdate);
            socket.off('carriers_updated', fetchMaster);
            socket.off('tankers_updated', fetchMaster);
        };
    }, []);

    // Trigger filters change
    useEffect(() => {
        fetchPortalOrders(true);
    }, [filterEstacion, filterEstado, filterTipo, filterEstadoPago, filterSearch]);

    // Scroll progresivo / Infinite Scroll para el portal Puma Energy-Latam
    useEffect(() => {
        if (!portalSentinelRef.current || !hasMorePortal || isLoadingMorePortal || isPortalLoading) return;

        const observer = new IntersectionObserver((entries) => {
            const first = entries[0];
            if (first.isIntersecting && hasMorePortal && !isLoadingMorePortal && !isPortalLoading) {
                fetchPortalOrders(false);
            }
        }, {
            root: null,
            rootMargin: '120px',
            threshold: 0.1
        });

        const currentSentinel = portalSentinelRef.current;
        observer.observe(currentSentinel);
        return () => {
            if (currentSentinel) observer.unobserve(currentSentinel);
            observer.disconnect();
        };
    }, [hasMorePortal, isLoadingMorePortal, isPortalLoading, portalOrders.length, portalLimit]);

    // Live sync from portal button
    const handleSyncPortal = async () => {
        setIsSyncingPortal(true);
        addToast(`Sincronizando hasta ${portalLimit === 'all' ? 50 : portalLimit} transacciones con Portal Puma en segundo plano...`, 'info');
        try {
            const res = await api.post('/operaciones/portal/sincronizar', { limit: portalLimit });
            if (res.data?.success) {
                addToast(res.data.message || 'Sincronización completada con éxito', 'success');
                fetchPortalOrders(true);
                fetchPortalResumen();
            } else {
                addToast(res.data?.message || 'Error en sincronización', 'warning');
            }
        } catch (e) {
            addToast(e.response?.data?.message || 'Error al conectar con el sincronizador del portal', 'error');
        } finally {
            setIsSyncingPortal(false);
        }
    };

    // Sync individual order
    const handleSyncSingleOrder = async (orderNum) => {
        setSyncingOrderNum(orderNum);
        addToast(`Actualizando orden #${orderNum} desde el portal...`, 'info');
        try {
            const res = await api.post(`/operaciones/portal/actualizar-pedido/${orderNum}`);
            if (res.data?.success) {
                addToast(`Orden #${orderNum} actualizada`, 'success');
                fetchPortalOrders();
            } else {
                addToast(res.data?.message || 'Error actualizando orden', 'warning');
            }
        } catch (e) {
            addToast('Error al actualizar la orden', 'error');
        } finally {
            setSyncingOrderNum(null);
        }
    };

    // Diagnóstico y Credenciales Portal Puma
    const fetchPortalCreds = async () => {
        try {
            const res = await api.get('/operaciones/portal/credenciales');
            if (res.data?.success) {
                setPortalCredsData(res.data);
                if (res.data.user && !inputPortalUser) {
                    setInputPortalUser(res.data.user);
                }
            }
        } catch (e) {
            console.warn('Error al obtener credenciales de portal:', e);
        }
    };

    const handleSavePortalCreds = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!inputPortalUser.trim()) {
            return addToast('El usuario o correo electrónico del portal es obligatorio', 'warning');
        }
        if (!inputPortalPass.trim()) {
            return addToast('La contraseña del portal es obligatoria', 'warning');
        }
        setIsSavingCreds(true);
        try {
            const res = await api.post('/operaciones/portal/credenciales', {
                user: inputPortalUser.trim(),
                password: inputPortalPass.trim()
            });
            if (res.data?.success) {
                addToast('Credenciales guardadas exitosamente en el servidor', 'success');
                setInputPortalPass('');
                fetchPortalCreds();
                fetchDiagnostico();
            } else {
                addToast(res.data?.error || 'No se pudieron guardar las credenciales', 'error');
            }
        } catch (e) {
            addToast('Error al guardar credenciales: ' + (e.response?.data?.error || e.message), 'error');
        } finally {
            setIsSavingCreds(false);
        }
    };

    const fetchDiagnostico = async () => {
        setIsLoadingDiagnostico(true);
        try {
            const res = await api.get('/operaciones/portal/diagnostico');
            setDiagnosticoData(res.data);
        } catch (e) {
            addToast('Error al diagnosticar portal: ' + (e.response?.data?.message || e.message), 'error');
        } finally {
            setIsLoadingDiagnostico(false);
        }
    };

    const handleOpenDiagnosticoPortal = () => {
        setShowDiagnosticoModal(true);
        fetchPortalCreds();
        fetchDiagnostico();
    };

    const handleSubmit2FACode = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!twoFactorCode || twoFactorCode.trim().length === 0) {
            return addToast('Ingrese el código de verificación recibido por correo', 'warning');
        }
        setIsSubmittingCode(true);
        try {
            const res = await api.post('/operaciones/portal/verificar-codigo', { code: twoFactorCode.trim() });
            if (res.data?.success) {
                addToast(res.data.message || 'Código verificado con éxito', 'success');
                setTwoFactorCode('');
                fetchDiagnostico();
                fetchPortalOrders(true);
                fetchPortalResumen();
            } else {
                addToast(res.data?.message || 'Error al verificar código', 'error');
            }
        } catch (e) {
            addToast('Error al enviar código: ' + (e.response?.data?.message || e.message), 'error');
        } finally {
            setIsSubmittingCode(false);
        }
    };

    // Modal: Vincular Pago & Conciliación
    const openVincularPago = (order) => {
        const montoRestante = Number(order.factura_saldo_pendiente || order.monto_total || 0);
        setPagoForm({
            numero_orden: order.numero_orden,
            monto_total: Number(order.monto_total || 0),
            estacion_nombre: order.estacion_nombre,
            cuenta_bancaria_id: order.cuenta_bancaria_id || (cuentasBancarias[0]?.corr || ''),
            tipo_pago: order.tipo_pago || 'Transferencia',
            referencia_pago: order.referencia_pago || order.factura_numero || order.numero_orden,
            fecha_pago: order.fecha_pago ? order.fecha_pago.split('T')[0] : todayStr(),
            monto_pagado: order.monto_pagado > 0 ? Number(order.monto_pagado) : montoRestante,
            observaciones: order.observaciones_pago || '',
            alistar_conciliacion: true,
            es_conciliado: order.es_conciliado || 0,
            movimiento_bancario_id: order.movimiento_bancario_id || null
        });
        setShowVincularPagoModal(true);
    };

    const handleGuardarPago = async () => {
        if (!pagoForm.cuenta_bancaria_id) return addToast('Seleccione una cuenta bancaria', 'warning');
        if (!pagoForm.fecha_pago) return addToast('Seleccione la fecha de pago', 'warning');
        if (!pagoForm.monto_pagado || Number(pagoForm.monto_pagado) <= 0) return addToast('Ingrese un monto válido', 'warning');

        try {
            const res = await api.post('/operaciones/portal/vincular-pago', pagoForm);
            if (res.data?.success) {
                addToast('Pago vinculado y alistado para conciliación bancaria exitosamente', 'success');
                setShowVincularPagoModal(false);
                fetchPortalOrders();
            }
        } catch (e) {
            addToast(e.response?.data?.message || 'Error al vincular pago', 'error');
        }
    };

    const handleDesvincularPago = async (orderNum) => {
        if (!await confirm(`¿Está seguro de desvincular el pago de la orden #${orderNum}? Esto eliminará el movimiento bancario pendiente de conciliar.`, { variant: 'danger' })) return;
        try {
            const res = await api.post('/operaciones/portal/desvincular-pago', { numero_orden: orderNum });
            if (res.data?.success) {
                addToast('Pago desvinculado del pedido', 'success');
                setShowVincularPagoModal(false);
                fetchPortalOrders();
            }
        } catch (e) {
            addToast(e.response?.data?.message || 'Error al desvincular pago', 'error');
        }
    };

    // Modal: Ajustar Costos Quincenales
    const openAjustarCostos = (order) => {
        setCostosForm({
            numero_orden: order.numero_orden,
            estacion_nombre: order.estacion_nombre,
            costo_diesel: Number(order.costo_diesel || 0),
            costo_regular: Number(order.costo_regular || 0),
            costo_super: Number(order.costo_super || 0),
            costo_ion: Number(order.costo_ion || 0),
            galones_diesel: Number(order.galones_diesel || 0),
            galones_regular: Number(order.galones_regular || 0),
            galones_super: Number(order.galones_super || 0),
            galones_ion: Number(order.galones_ion || 0),
            monto_total: Number(order.monto_total || 0),
            tipo_producto: order.tipo_producto
        });
        setShowAjustarCostosModal(true);
    };

    const nuevoTotalCalculado = useMemo(() => {
        if (costosForm.tipo_producto !== 'Bulk') return costosForm.monto_total;
        const total = (Number(costosForm.galones_diesel || 0) * Number(costosForm.costo_diesel || 0)) +
                      (Number(costosForm.galones_regular || 0) * Number(costosForm.costo_regular || 0)) +
                      (Number(costosForm.galones_super || 0) * Number(costosForm.costo_super || 0)) +
                      (Number(costosForm.galones_ion || 0) * Number(costosForm.costo_ion || 0));
        return total > 0 ? total : costosForm.monto_total;
    }, [costosForm]);

    const handleGuardarCostos = async () => {
        try {
            const res = await api.post('/operaciones/portal/ajustar-costos-pedido', {
                numero_orden: costosForm.numero_orden,
                costo_diesel: costosForm.costo_diesel,
                costo_regular: costosForm.costo_regular,
                costo_super: costosForm.costo_super,
                costo_ion: costosForm.costo_ion
            });
            if (res.data?.success) {
                addToast('Costos de combustible actualizados para el pedido', 'success');
                setShowAjustarCostosModal(false);
                fetchPortalOrders();
            }
        } catch (e) {
            addToast(e.response?.data?.message || 'Error ajustando costos', 'error');
        }
    };

    // Modal: Ver Detalle de Orden
    const openDetalle = (order) => {
        let items = [];
        try {
            items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : (order.items_json || []);
        } catch (e) {
            items = [];
        }
        setSelectedOrderDetalle({ ...order, parsedItems: items });
        setShowDetalleModal(true);
    };

    // Modal: Guardar Precios Quincenales
    const handleGuardarPreciosQuincena = async () => {
        if (!precioForm.periodo_inicio || !precioForm.periodo_fin) {
            return addToast('Seleccione el rango de fechas de la quincena', 'warning');
        }
        try {
            const res = await api.post('/operaciones/portal/guardar-precios-combustible', precioForm);
            if (res.data?.success) {
                addToast('Precios quincenales guardados exitosamente', 'success');
                setShowNuevoPrecioModal(false);
                fetchPreciosCombustible();
                fetchPortalOrders();
            }
        } catch (e) {
            addToast(e.response?.data?.message || 'Error guardando precios', 'error');
        }
    };

    // Operational Tank Forecast Calculations (Tab 1)
    const pipasWithCap = useMemo(() => pipas.map(p => {
        let comps = [];
        try { comps = typeof p.compartments === 'string' ? JSON.parse(p.compartments) : p.compartments; } catch(e){}
        const totalCap = (comps || []).reduce((acc, curr) => {
            if (curr.separations) {
                return acc + curr.separations.reduce((sSum, s) => sSum + Number(s.capacity || 0), 0);
            }
            return acc + Number(curr.capacity || 0);
        }, 0);
        return { ...p, totalCapacity: totalCap, parsedCompartments: comps };
    }), [pipas]);

    const totalPipa = Number(comp.D.val) + Number(comp.R.val) + Number(comp.S.val) + Number(comp.I.val);

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

    const getSelectedPipaData = () => {
        if (!selectedPipa) return null;
        return pipasWithCap.find(p => String(p.id) === String(selectedPipa)) || null;
    };

    const renderCompartments = () => {
        if (!selectedPipa) return null;
        const pData = getSelectedPipaData();
        if (!pData) return null;
        const comps = pData.parsedCompartments || [];
        if (!comps.length) {
            return (
                <div style={{ padding: '0.4rem 0.6rem', marginBottom: '0.5rem', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '4px', fontSize: '0.72rem', color: '#eab308' }}>
                    ℹ️ Esta pipa no tiene calibraciones/compartimientos configurados en el catálogo.
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.65rem', padding: '0.5rem 0.65rem', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: 'var(--primary)', letterSpacing: '0.02em' }}>
                        CALIBRACIONES PIPA ({comps.length} {comps.length === 1 ? 'compartimiento' : 'compartimientos'}):
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Capacidad Total: <b style={{ color: 'var(--text-color)' }}>{numFmt(pData.totalCapacity)} Gal</b>
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', width: '100%' }}>
                    {comps.map((c, i) => {
                        const cCap = c.separations && Array.isArray(c.separations) && c.separations.length > 0 
                            ? c.separations.reduce((acc, s) => acc + Number(s.capacity || 0), 0) 
                            : Number(c.capacity || 0);
                        const cNum = c.number || c.compartment_number || (i + 1);
                        return (
                            <div 
                                key={i} 
                                style={{ 
                                    border: '1px solid var(--border)', 
                                    background: 'var(--bg-active)', 
                                    padding: '0.3rem 0.55rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.72rem', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '0.15rem',
                                    minWidth: '70px',
                                    flex: '1 0 auto'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.45rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.15rem' }}>
                                    <span style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>C{cNum}</span>
                                    <b style={{ color: 'var(--text-color)' }}>{numFmt(cCap)}</b>
                                </div>
                                {c.separations && Array.isArray(c.separations) && c.separations.length > 1 && (
                                    <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                        {c.separations.map((s, si) => (
                                            <span 
                                                key={si} 
                                                title={`Separación ${si + 1}: ${numFmt(s.capacity)} Gal`} 
                                                style={{ 
                                                    fontSize: '0.62rem', 
                                                    background: 'rgba(255,255,255,0.06)', 
                                                    padding: '1px 3px', 
                                                    borderRadius: '2px', 
                                                    color: 'var(--text-muted)' 
                                                }}
                                            >
                                                {numFmt(s.capacity)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const RenderPipaRecommendation = () => {
        if (totalPipa <= 0 || !recommendedPipa) return null;
        
        const isCurrentOk = selectedPipa && Number(selectedPipa) === recommendedPipa.id;
        return (
            <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem', padding: '0.45rem 0.65rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: isCurrentOk ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: isCurrentOk ? '#10b981' : '#ef4444', border: `1px solid ${isCurrentOk ? '#10b981' : '#ef4444'}`
            }}>
                {isCurrentOk ? (
                    <>✓ La Pipa seleccionada cubre dinámicamente tu solicitud.</>
                ) : (
                    <>⚠️ Sugerencia de Eficiencia: Selecciona la Pipa [{recommendedPipa.code}] (Capacidad Fija: {numFmt(recommendedPipa.totalCapacity)} Gal)</>
                )}
            </div>
        );
    };

    const loadPedidoToForm = (row) => {
        setPedidoTemp({ id: row.id_pedido });
        setFechaPedido(row.fecha ? row.fecha.split('T')[0] : '');
        setSelectedTransporte(row.id_transportista || '');
        setSelectedPipa(row.id_calibracion_diesel || '');
        setComp({
            D: { val: row.diesel || 0 },
            R: { val: row.regular || 0 },
            S: { val: row.super || 0 },
            I: { val: row.iondiesel || 0 }
        });
        setPrevisualizar(false);
    };

    const fetchOperationalData = async (est) => {
        if (!est || !fechaConsulta) return;
        setIsLoading(true);
        try {
            const resT = await api.get(`/operaciones/pedidos/datos-tanque/${est}/${fechaConsulta}`);
            setInventario(resT.data.inventario || []);

            const resP = await api.get(`/operaciones/pedidos/promedios/${est}/${fechaConsulta}`);
            setPromedios(resP.data || { D: 0, R: 0, S: 0, I: 0 });

            const resProg = await api.get(`/operaciones/pedidos/programados/${est}/${fechaConsulta}`);
            setProgramados(resProg.data || []);
        } catch (error) {
            addToast("Error al obtener datos operativos", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedEstacion) fetchOperationalData(selectedEstacion);
    }, [selectedEstacion, fechaConsulta]);

    const matrix = useMemo(() => {
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
            if (previsualizar) prog += Number(comp[tipo].val);

            let durDias = 0;
            if (prom > 0) durDias = Math.max(0, (invActual + prog - res) / prom);

            let fechaDur = "";
            let nomDia = "";
            if (durDias > 0 && fechaConsulta) {
                const cleanDate = fechaConsulta.includes('T') ? fechaConsulta.split('T')[0] : fechaConsulta;
                const parts = cleanDate.split('-').map(Number);
                if (parts.length === 3) {
                    const [y, m, d] = parts;
                    const target = new Date(y, m - 1, d + Math.floor(durDias));
                    fechaDur = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
                    const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
                    nomDia = days[target.getDay()];
                }
            }

            let nivel = 0;
            if (cap > 0) nivel = (invActual + prog) / cap;

            return {
                capacidad: cap, reserva: res, inventario: invActual, promedio: prom, programado: prog,
                duracionDias: durDias, duracionFecha: fechaDur, duracionDiaNom: nomDia, nivelTanque: nivel
            };
        };

        return { D: buildCol('D'), R: buildCol('R'), S: buildCol('S'), I: buildCol('I') };
    }, [inventario, promedios, programados, previsualizar, comp, fechaConsulta]);

    const limpiarFormulario = () => {
        setFechaPedido(fechaServidor || '');
        setSelectedTransporte('');
        setSelectedPipa('');
        setComp({ D: { val: 0 }, R: { val: 0 }, S: { val: 0 }, I: { val: 0 } });
        setPrevisualizar(true);
        setPedidoTemp({ id: null });
    };

    const autoSuggestPedido = () => {
        if (!selectedTransporte) return addToast('Por favor seleccione un Transportista primero', 'warning');
        if (!matrix || !pipasWithCap.length) return addToast('Faltan datos maestros de pipas o matriz', 'error');

        const activeTypes = ['D', 'R', 'S', 'I'].filter(type => matrix[type].capacidad > 0);
        const maxFill = {};
        activeTypes.forEach(type => {
            maxFill[type] = matrix[type].capacidad - matrix[type].inventario - matrix[type].programado;
        });

        const needsRefill = activeTypes.some(type => maxFill[type] > 500);
        if (!needsRefill) {
            return addToast('Los tanques ya están a máxima capacidad proyectada.', 'info');
        }

        const totalMax = activeTypes.reduce((acc, type) => acc + Math.max(0, maxFill[type]), 0);
        let carrierPipas = pipasWithCap.filter(p => p.carrier_id === Number(selectedTransporte));
        if (!carrierPipas.length) return addToast('Este transportista no tiene pipas registradas', 'error');

        let validPipas = carrierPipas.filter(p => p.totalCapacity <= (totalMax + 100)).sort((a,b) => b.totalCapacity - a.totalCapacity);
        let bestPipa = validPipas.length > 0 ? validPipas[0] : [...carrierPipas].sort((a,b) => a.totalCapacity - b.totalCapacity)[0];

        let alloc = { D: 0, R: 0, S: 0, I: 0 };
        const getCompCap = (compObj) => {
            if (compObj.separations && Array.isArray(compObj.separations) && compObj.separations.length > 0) {
                return compObj.separations.reduce((sum, s) => sum + Number(s.capacity || 0), 0);
            }
            return Number(compObj.capacity || 0);
        };
        let compartments = [...bestPipa.parsedCompartments].sort((a,b) => getCompCap(b) - getCompCap(a));

        compartments.forEach(c => {
            const cap = getCompCap(c);
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
        setComp({ D: { val: alloc.D }, R: { val: alloc.R }, S: { val: alloc.S }, I: { val: alloc.I } });
        addToast(`Sugerencia Aplicada: Pipa [${bestPipa.code}] de ${bestPipa.totalCapacity} Galones.`, 'success');
    };

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
                id_transportista: selectedTransporte,
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
        if (!await confirm("¿Anular Pedido?", { variant: 'danger' })) return;
        try {
            await api.delete(`/operaciones/pedidos/anular/${id}`);
            addToast("Pedido Anulado", "success");
            fetchOperationalData(selectedEstacion);
        } catch (e) {
            addToast(e.response?.data?.message || "Error al anular", "error");
        }
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

    const renderEstadoBadge = (estado, razon) => {
        const est = (estado || '').toUpperCase();
        if (est === 'RETENIDO') {
            return (
                <span className="badge" title={razon || 'Retenido'} style={{ background: '#ef4444', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                    <AlertTriangle size={12} /> RETENIDO
                </span>
            );
        }
        if (est === 'LIBERADO') {
            return (
                <span className="badge" title={razon || 'Liberado'} style={{ background: '#10b981', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                    <CheckCircle size={12} /> LIBERADO
                </span>
            );
        }
        if (est === 'FACTURADO') {
            return (
                <span className="badge" title={razon || 'Facturado'} style={{ background: '#2563eb', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                    <FileText size={12} /> FACTURADO
                </span>
            );
        }
        return (
            <span className="badge" title={razon || estado} style={{ background: '#f59e0b', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                {estado || 'EN PROCESO'}
            </span>
        );
    };

    const renderPagoBadge = (estadoPago, esConciliado) => {
        const ep = (estadoPago || '').toUpperCase();
        if (esConciliado) {
            return (
                <span className="badge" style={{ background: '#059669', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                    <CheckCircle2 size={12} /> CONCILIADO
                </span>
            );
        }
        if (ep === 'PAGADO') {
            return (
                <span className="badge" style={{ background: '#0284c7', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                    <CreditCard size={12} /> PAGADO
                </span>
            );
        }
        if (ep === 'PARCIAL') {
            return (
                <span className="badge" style={{ background: '#d97706', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                    PARCIAL
                </span>
            );
        }
        return (
            <span className="badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                PENDIENTE
            </span>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header Principal */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0, fontWeight: 'bold' }}>
                        <Truck size={22} color="var(--primary)" /> Operaciones: Pedidos de Combustible
                    </h1>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Gestión de pedidos programados por estación, integración en vivo con portal de mayorista, costos quincenales y conciliación bancaria
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleSyncPortal}
                        disabled={isSyncingPortal}
                        className="btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.825rem', height: '36px', padding: '0 1rem', fontWeight: 'bold', background: '#2563eb' }}
                        title="Sincronizar pedidos, estados y precios con portal Energy-Latam"
                    >
                        <RefreshCw size={15} className={isSyncingPortal ? 'spin' : ''} />
                        {isSyncingPortal ? 'Sincronizando Portal...' : 'Actualizar Portal'}
                    </button>
                </div>
            </div>

            {/* Account Status / KPI Banner */}
            <div className="card glass pedidos-kpi-grid" style={{ padding: '0.85rem 1rem', borderLeft: '4px solid var(--primary)' }}>
                <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Cuenta Portal Puma</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)' }}>{portalResumen.cuenta_nombre || 'RAUL SOSA CASTELLANOS'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID #{portalResumen.cuenta_numero || '3409396'}</div>
                </div>

                <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Fondos Disponibles</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10b981' }}>${numFmt(portalResumen.saldo_disponible)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{portalResumen.porcentaje_disponible || 32}% línea libre</div>
                </div>

                <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Límite de Crédito</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary)' }}>${numFmt(portalResumen.limite_credito)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Condición: 30 Días Crédito</div>
                </div>

                <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Última Sincronización</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Clock size={14} color="var(--primary)" />
                        {portalResumen.ultima_sincronizacion ? fmtDateArray(portalResumen.ultima_sincronizacion) : 'Hoy (Activo)'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#10b981' }}>Enlace seguro backend activo</div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="pedidos-tabs-bar">
                <button
                    onClick={() => setActiveTab('portal')}
                    className="pedidos-tab-btn"
                    style={{
                        background: activeTab === 'portal' ? 'var(--primary)' : 'transparent',
                        color: activeTab === 'portal' ? '#fff' : 'var(--text-muted)'
                    }}
                >
                    <Layers size={16} /> Portal Puma ({portalOrders.length}{portalTotal > portalOrders.length ? `/${portalTotal}` : ''})
                </button>

                <button
                    onClick={() => setActiveTab('programados')}
                    className="pedidos-tab-btn"
                    style={{
                        background: activeTab === 'programados' ? 'var(--primary)' : 'transparent',
                        color: activeTab === 'programados' ? '#fff' : 'var(--text-muted)'
                    }}
                >
                    <Truck size={16} /> Pedidos Programados & Despacho
                </button>

                <button
                    onClick={() => setActiveTab('precios')}
                    className="pedidos-tab-btn"
                    style={{
                        background: activeTab === 'precios' ? 'var(--primary)' : 'transparent',
                        color: activeTab === 'precios' ? '#fff' : 'var(--text-muted)'
                    }}
                >
                    <Sliders size={16} /> Precios Quincenales
                </button>

                <button
                    onClick={() => setActiveTab('conciliacion')}
                    className="pedidos-tab-btn"
                    style={{
                        background: activeTab === 'conciliacion' ? 'var(--primary)' : 'transparent',
                        color: activeTab === 'conciliacion' ? '#fff' : 'var(--text-muted)'
                    }}
                >
                    <Scale size={16} /> Pagos & Conciliación
                </button>
            </div>

            {/* TAB 1: PORTAL ENERGY-LATAM ORDERS */}
            {activeTab === 'portal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Filters Toolbar */}
                    <div className="card glass pedidos-filter-toolbar" style={{ padding: '0.85rem 1rem', display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '150px', flex: '1 1 200px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Estación:</label>
                            <select
                                value={filterEstacion}
                                onChange={e => setFilterEstacion(e.target.value)}
                                style={{ flex: 1, height: '36px', fontSize: '0.8rem', padding: '0 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                            >
                                <option value="">-- Todas las Estaciones --</option>
                                {estaciones.map(e => (
                                    <option key={e.id_empresa} value={e.id_empresa || e.titulo}>{e.titulo}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '120px', flex: '1 1 120px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Estado:</label>
                            <select
                                value={filterEstado}
                                onChange={e => setFilterEstado(e.target.value)}
                                style={{ flex: 1, height: '36px', fontSize: '0.8rem', padding: '0 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                            >
                                <option value="">Todos</option>
                                <option value="RETENIDO">RETENIDO</option>
                                <option value="LIBERADO">LIBERADO</option>
                                <option value="FACTURADO">FACTURADO</option>
                                <option value="EN_PROCESO">EN PROCESO</option>
                                <option value="CANCELADO">CANCELADO</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '120px', flex: '1 1 120px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Tipo:</label>
                            <select
                                value={filterTipo}
                                onChange={e => setFilterTipo(e.target.value)}
                                style={{ flex: 1, height: '36px', fontSize: '0.8rem', padding: '0 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                            >
                                <option value="">Todos</option>
                                <option value="Bulk">Bulk (Combustible)</option>
                                <option value="Packaged">Packaged (Lubricantes)</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '120px', flex: '1 1 120px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Pago:</label>
                            <select
                                value={filterEstadoPago}
                                onChange={e => setFilterEstadoPago(e.target.value)}
                                style={{ flex: 1, height: '36px', fontSize: '0.8rem', padding: '0 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                            >
                                <option value="">Todos</option>
                                <option value="PENDIENTE">PENDIENTE</option>
                                <option value="PAGADO">PAGADO</option>
                                <option value="CONCILIADO">CONCILIADO</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '180px', flex: '2 1 220px' }}>
                            <input
                                type="text"
                                placeholder="Buscar por # orden, factura, estación..."
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                                style={{ width: '100%', height: '36px', fontSize: '0.8rem', padding: '0 0.75rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '130px', flex: '1 1 130px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Mostrar:</label>
                            <select
                                value={portalLimit}
                                onChange={e => {
                                    const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                                    setPortalLimit(val);
                                    fetchPortalOrders(true, val);
                                }}
                                style={{ flex: 1, height: '36px', fontSize: '0.8rem', padding: '0 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                                title="Límite inicial de pedidos a consultar para evitar sobrecarga del sistema"
                            >
                                <option value={10}>10 pedidos</option>
                                <option value={20}>20 pedidos</option>
                                <option value={50}>50 pedidos</option>
                                <option value="all">Todos</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                            {(filterEstacion || filterEstado || filterTipo || filterEstadoPago || filterSearch) && (
                                <button
                                    onClick={() => {
                                        setFilterEstacion('');
                                        setFilterEstado('');
                                        setFilterTipo('');
                                        setFilterEstadoPago('');
                                        setFilterSearch('');
                                    }}
                                    className="btn-secondary"
                                    style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.75rem', flex: '1 1 auto' }}
                                >
                                    Limpiar
                                </button>
                            )}

                            <button
                                onClick={handleOpenDiagnosticoPortal}
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flex: '1 1 auto', justifyContent: 'center' }}
                                title="Diagnóstico de conexión y estado del Portal Puma Energy-Latam"
                            >
                                <Activity size={13} />
                                Diagnóstico Portal
                            </button>

                            <button
                                onClick={handleSyncPortal}
                                disabled={isSyncingPortal}
                                className="btn-primary"
                                style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flex: '1 1 auto', justifyContent: 'center' }}
                                title="Conectar y sincronizar con el portal Puma Energy-Latam"
                            >
                                <RefreshCw size={13} className={isSyncingPortal ? 'spin' : ''} />
                                {isSyncingPortal ? 'Sincronizando...' : 'Sincronizar Puma'}
                            </button>
                        </div>
                    </div>

                    {/* Orders Table */}
                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '1100px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-color)', borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ORDEN PORTAL</th>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>FECHA SOLICITUD</th>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ESTACIÓN DESTINO</th>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>PRODUCTO / COSTOS</th>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>TOTAL ($)</th>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ESTADO PORTAL</th>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>RAZÓN DEL ESTADO</th>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>PAGO & CONCILIACIÓN</th>
                                    <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ACCIONES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {portalOrders.map(o => (
                                    <tr key={o.id || o.numero_orden} style={{ borderBottom: '1px solid var(--border)' }}>
                                        {/* Orden # */}
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <div style={{ fontWeight: 'bold', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                #{o.numero_orden}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {o.tipo_producto || 'Bulk'} • {o.tipo_entrega || 'Ex-Rack'}
                                            </div>
                                            {o.factura_numero && (
                                                <div style={{ fontSize: '0.68rem', color: '#2563eb', fontWeight: 'bold' }}>
                                                    Fac: {o.factura_numero}
                                                </div>
                                            )}
                                        </td>

                                        {/* Fecha */}
                                        <td style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>
                                            <div style={{ fontWeight: 'bold' }}>{fmtDateArray(o.fecha_pedido)}</div>
                                            {o.fecha_solicitada && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    Entrega: {fmtDateArray(o.fecha_solicitada)}
                                                </div>
                                            )}
                                        </td>

                                        {/* Estacion */}
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <span style={{ fontWeight: 'bold' }}>{o.estacion_nombre}</span>
                                            {o.id_estacion && (
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
                                                    Estación #{o.id_estacion}
                                                </span>
                                            )}
                                        </td>

                                        {/* Producto / Costos */}
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            {o.tipo_producto === 'Bulk' || (o.galones_diesel > 0 || o.galones_regular > 0 || o.galones_super > 0 || o.galones_ion > 0) ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.72rem' }}>
                                                    {o.galones_diesel > 0 && <span><b>Diesel:</b> {numFmt(o.galones_diesel)} gal @ ${numFmt4(o.costo_diesel)}</span>}
                                                    {o.galones_regular > 0 && <span><b>Regular:</b> {numFmt(o.galones_regular)} gal @ ${numFmt4(o.costo_regular)}</span>}
                                                    {o.galones_super > 0 && <span><b>Super:</b> {numFmt(o.galones_super)} gal @ ${numFmt4(o.costo_super)}</span>}
                                                    {o.galones_ion > 0 && <span><b>IonDiesel:</b> {numFmt(o.galones_ion)} gal @ ${numFmt4(o.costo_ion)}</span>}
                                                    {o.costo_diesel > 0 && (!o.galones_diesel && !o.galones_regular) && (
                                                        <span style={{ color: 'var(--text-muted)' }}>Costos: D ${numFmt4(o.costo_diesel)} | R ${numFmt4(o.costo_regular)} | S ${numFmt4(o.costo_super)}</span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.72rem' }}>
                                                    <span style={{ fontWeight: 'bold' }}>Lubricantes / Packaged</span>
                                                    <button onClick={() => openDetalle(o)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, marginLeft: '0.3rem', textDecoration: 'underline' }}>
                                                        ver items
                                                    </button>
                                                </div>
                                            )}
                                        </td>

                                        {/* Total */}
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                            ${numFmt(o.monto_total)}
                                            {o.factura_saldo_pendiente > 0 && (
                                                <div style={{ fontSize: '0.68rem', color: '#ef4444' }}>
                                                    Saldo: ${numFmt(o.factura_saldo_pendiente)}
                                                </div>
                                            )}
                                        </td>

                                        {/* Estado Portal */}
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                                            {renderEstadoBadge(o.estado, o.razon_estado)}
                                        </td>

                                        {/* Razón Estado */}
                                        <td style={{ padding: '0.5rem 0.6rem', maxWidth: '240px' }}>
                                            <div style={{ fontSize: '0.72rem', color: o.estado === 'RETENIDO' ? '#ef4444' : 'var(--text-muted)', fontWeight: o.estado === 'RETENIDO' ? 'bold' : 'normal' }}>
                                                {o.razon_estado || (o.estado === 'RETENIDO' ? 'Retenido por verificación de límite de crédito' : 'Procesado conforme')}
                                            </div>
                                        </td>

                                        {/* Pago & Conciliación */}
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                                            {renderPagoBadge(o.estado_pago, o.es_conciliado)}
                                            {o.cuenta_numero && (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                                    {o.banco_nombre} ({o.cuenta_numero})
                                                </div>
                                            )}
                                        </td>

                                        {/* Acciones */}
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                                                <button
                                                    onClick={() => handleSyncSingleOrder(o.numero_orden)}
                                                    disabled={syncingOrderNum === o.numero_orden}
                                                    className="btn-secondary"
                                                    style={{ padding: '3px 7px', fontSize: '0.7rem' }}
                                                    title="Actualizar estado de esta orden desde el portal"
                                                >
                                                    <RefreshCw size={12} className={syncingOrderNum === o.numero_orden ? 'spin' : ''} />
                                                </button>

                                                <button
                                                    onClick={() => openVincularPago(o)}
                                                    className="btn-primary"
                                                    style={{ padding: '3px 8px', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: o.estado_pago === 'PAGADO' ? '#059669' : '#2563eb' }}
                                                    title="Vincular pago a cuenta bancaria y alistar para conciliación"
                                                >
                                                    <CreditCard size={12} /> {o.estado_pago === 'PAGADO' ? 'Pago' : 'Pagar'}
                                                </button>

                                                <button
                                                    onClick={() => openAjustarCostos(o)}
                                                    className="btn-secondary"
                                                    style={{ padding: '3px 7px', fontSize: '0.7rem' }}
                                                    title="Ajustar costos de combustible de la quincena"
                                                >
                                                    <Sliders size={12} />
                                                </button>

                                                <button
                                                    onClick={() => openDetalle(o)}
                                                    className="btn-secondary"
                                                    style={{ padding: '3px 7px', fontSize: '0.7rem' }}
                                                    title="Ver detalle completo de la orden"
                                                >
                                                    <Eye size={12} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {isPortalLoading ? (
                                    <tr>
                                        <td colSpan="9" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                            <div className="spinner" style={{ width: '24px', height: '24px', border: '3px solid var(--primary)', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 0.75rem auto' }}></div>
                                            Cargando pedidos del portal...
                                        </td>
                                    </tr>
                                ) : portalOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                            No se encontraron pedidos en el portal con los filtros aplicados.
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <button onClick={handleSyncPortal} className="btn-primary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}>
                                                    Sincronizar ahora con el portal
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : null}

                                {/* Sentinel invisible para activación de scroll progresivo */}
                                <tr ref={portalSentinelRef} style={{ height: '1px' }}>
                                    <td colSpan="9" style={{ padding: 0, border: 'none', height: '1px' }} />
                                </tr>
                            </tbody>
                        </table>

                        {/* Barra inferior de estado y control progresivo de transacciones */}
                        {portalOrders.length > 0 && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.65rem 1rem',
                                background: 'var(--card-bg, rgba(255,255,255,0.02))',
                                borderTop: '1px solid var(--border)',
                                fontSize: '0.78rem',
                                color: 'var(--text-muted)',
                                flexWrap: 'wrap',
                                gap: '0.5rem'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <span>Mostrando <strong style={{ color: 'var(--text)' }}>{portalOrders.length}</strong> de <strong style={{ color: 'var(--text)' }}>{portalTotal}</strong> transacciones</span>
                                    {portalLimit !== 'all' && portalOrders.length < portalTotal && (
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                            Consultando de {portalLimit} en {portalLimit} al desplazarse hacia abajo
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    {isLoadingMorePortal && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                            <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid var(--primary)', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                            Consultando más transacciones...
                                        </span>
                                    )}

                                    {hasMorePortal && !isLoadingMorePortal && (
                                        <button
                                            onClick={() => fetchPortalOrders(false)}
                                            className="btn-secondary"
                                            style={{
                                                height: '32px',
                                                fontSize: '0.75rem',
                                                padding: '0 0.85rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.35rem'
                                            }}
                                        >
                                            <RefreshCw size={12} /> Cargar {portalLimit === 'all' ? 'restantes' : `${portalLimit} más`}
                                        </button>
                                    )}

                                    {!hasMorePortal && (
                                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '500' }}>
                                            <CheckCircle size={14} /> Todas las transacciones disponibles han sido consultadas
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: PEDIDOS PROGRAMADOS & DESPACHO (MATRIZ EXISTENTE) */}
            {activeTab === 'programados' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Top Toolbar */}
                    <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>ESTACION</label>
                            <select value={selectedEstacion} onChange={e => setSelectedEstacion(e.target.value)} disabled={isLoading}
                                style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', width: '100%', height: '36px' }}>
                                <option value="" style={{ background: '#1e293b', color: 'white' }}>-- Seleccione Estación --</option>
                                {estaciones.map(e => <option key={e.id_empresa} value={e.id_empresa} style={{ background: '#1e293b', color: 'white' }}>{e.titulo}</option>)}
                            </select>
                        </div>

                        <div style={{ background: 'var(--primary)', color: 'white', padding: '0.4rem 1rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                            DATOS AL DIA: {fmtDateArray(fechaConsulta)}
                        </div>

                        {isLoading && <span style={{ color: 'var(--primary)', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid var(--primary)', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                            Sincronizando Módulos...
                        </span>}
                    </div>

                    <div className="pedidos-grid" style={{ opacity: isLoading ? 0.5 : 1 }}>
                        {/* Formulario */}
                        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--primary)', textAlign: 'center', borderBottom: '1px solid var(--primary)', paddingBottom: '0.5rem' }}>
                                OPERACIONES PARA AGREGAR PEDIDO
                            </h3>

                            <button onClick={autoSuggestPedido} className="btn-success" style={{ width: '100%', margin: '0.5rem 0', padding: '0.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: '#10b981', color: '#fff' }}>
                                <CheckSquare size={18} /> Sugerir Pedido (IA)
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>FECHA</span>
                                <input type="date" value={fechaPedido} onChange={e => setFechaPedido(e.target.value)} style={{ flex: '1 1 140px', minWidth: '130px', padding: '0.35rem', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }} />
                                <label style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    <input type="checkbox" checked={previsualizar} onChange={e => setPrevisualizar(e.target.checked)} style={{ width: '16px', height: '16px' }} /> PREVISUALIZAR
                                </label>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>TRANSPORTE</span>
                                <select value={selectedTransporte} onChange={e => {setSelectedTransporte(e.target.value); setSelectedPipa('');}} style={{ flex: '1 1 180px', minWidth: '160px', padding: '0.35rem', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}>
                                    <option value="" style={{ background: '#1e293b', color: 'white' }}>-- Seleccione --</option>
                                    {transportistas.map(t => <option key={t.id} value={t.id} style={{ background: '#1e293b', color: 'white' }}>[{t.code}] {t.description}</option>)}
                                </select>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>PIPA</span>
                                <select value={selectedPipa} onChange={e => setSelectedPipa(e.target.value)} style={{ flex: '1 1 180px', minWidth: '160px', padding: '0.35rem', fontSize: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }} disabled={!selectedTransporte}>
                                    <option value="" style={{ background: '#1e293b', color: 'white' }}>-- Seleccione Pipa --</option>
                                    {pipas.filter(p => !selectedTransporte || p.carrier_id === Number(selectedTransporte)).map(p => (
                                        <option key={p.id} value={p.id} style={{ background: '#1e293b', color: 'white' }}>{p.code}</option>
                                    ))}
                                </select>
                            </div>

                            {renderCompartments()}

                            {/* Inputs por Combustible */}
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>DIESEL</span>
                                <input type="number" min="0" step="1" value={comp.D.val || ''} onChange={e => setComp({...comp, D: {val: e.target.value}})} onWheel={e => e.target.blur()}
                                    style={{ flex: '1 1 120px', minWidth: '100px', textAlign: 'right', padding: '0.35rem', fontSize: '0.85rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-color)', height: '36px' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>REGULAR</span>
                                <input type="number" min="0" step="1" value={comp.R.val || ''} onChange={e => setComp({...comp, R: {val: e.target.value}})} onWheel={e => e.target.blur()}
                                    style={{ flex: '1 1 120px', minWidth: '100px', textAlign: 'right', padding: '0.35rem', fontSize: '0.85rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-color)', height: '36px' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>SUPER</span>
                                <input type="number" min="0" step="1" value={comp.S.val || ''} onChange={e => setComp({...comp, S: {val: e.target.value}})} onWheel={e => e.target.blur()}
                                    style={{ flex: '1 1 120px', minWidth: '100px', textAlign: 'right', padding: '0.35rem', fontSize: '0.85rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-color)', height: '36px' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '80px' }}>IONDIESEL</span>
                                <input type="number" min="0" step="1" value={comp.I.val || ''} onChange={e => setComp({...comp, I: {val: e.target.value}})} onWheel={e => e.target.blur()}
                                    style={{ flex: '1 1 120px', minWidth: '100px', textAlign: 'right', padding: '0.35rem', fontSize: '0.85rem', background: 'var(--bg-color)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-color)', height: '36px' }} />
                            </div>

                            <RenderPipaRecommendation />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem', borderTop: '2px solid var(--border)', paddingTop: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>TOTAL PIPA</span>
                                    <input type="text" readOnly value={numFmt(totalPipa)} style={{ flex: '1 1 120px', maxWidth: '160px', textAlign: 'right', padding: '0.35rem', fontSize: '1rem', fontWeight: 'bold', background: 'var(--bg-active)', color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: '4px', height: '36px' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', width: '100%', flexWrap: 'wrap' }}>
                                    <button className="btn-primary" onClick={handleGuardarPedido} style={{ fontSize: '0.75rem', padding: '0.45rem 0.85rem', flex: '1 1 auto' }}>
                                        {pedidoTemp.id ? 'ACTUALIZAR PEDIDO' : 'AGREGAR PEDIDO'}
                                    </button>
                                    <button className="btn-secondary" onClick={limpiarFormulario} style={{ fontSize: '0.75rem', padding: '0.45rem 0.85rem', flex: '1 1 auto' }}>
                                        CANCELAR
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Columna Derecha: Resumen Operacional + Pedidos Programados */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
                            {/* Matriz de Resultados Operacionales */}
                            <div className="card glass table-responsive" style={{ padding: 0 }}>
                                <h3 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--primary)', textAlign: 'center', background: 'rgba(37,99,235,0.1)', padding: '0.5rem', fontWeight: 'bold' }}>
                                    RESUMEN DE DATOS OPERACIONALES ({estaciones.find(e => e.id_empresa === selectedEstacion)?.titulo || 'Seleccione Estación'})
                                </h3>
                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', minWidth: '500px' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg-color)', borderBottom: '2px solid var(--border)' }}>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>METRICA</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', borderLeft: '2px solid var(--primary)' }}>DIESEL</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', borderLeft: '2px solid var(--border)' }}>REGULAR</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', borderLeft: '2px solid var(--border)' }}>SUPER</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', borderLeft: '2px solid var(--border)' }}>ION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>CAPACIDAD</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.capacidad)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.capacidad)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.capacidad)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.capacidad)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>INVENTARIO</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.inventario)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.inventario)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.inventario)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.inventario)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>VENTA PROMEDIO</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.promedio)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.promedio)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.promedio)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.promedio)}</td>
                                        </tr>
                                        <tr style={{ background: 'rgba(37,99,235,0.05)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', color: 'var(--primary)' }}>PROGRAMADOS</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)' }}>{numFmt(matrix.D.programado)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.R.programado)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.S.programado)}</td>
                                            <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)' }}>{numFmt(matrix.I.programado)}</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>DURACION EN DIAS</td>
                                            {['D', 'R', 'S', 'I'].map(t => {
                                                const borderLeft = t === 'D' ? '2px solid var(--primary)' : '2px solid var(--border)';
                                                return (
                                                    <td key={t} style={{ textAlign: 'center', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft }}>
                                                        <div style={{
                                                            display: 'inline-flex',
                                                            justifyContent: 'center',
                                                            alignItems: 'center',
                                                            minWidth: '85px',
                                                            padding: '0.2rem 0.4rem',
                                                            background: 'var(--bg-active)',
                                                            borderRadius: '4px',
                                                            border: '1px solid var(--border)',
                                                            fontWeight: 'bold',
                                                            fontSize: '0.85rem',
                                                            color: 'var(--text-color)'
                                                        }}>
                                                            {matrix[t].duracionDias.toFixed(1)}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)' }}>DURACION EN FECHA</td>
                                            {['D', 'R', 'S', 'I'].map(t => {
                                                const m = matrix[t];
                                                const borderLeft = t === 'D' ? '2px solid var(--primary)' : '2px solid var(--border)';
                                                const hasVal = m.duracionDias > 0 && m.duracionFecha;
                                                return (
                                                    <td key={t} style={{ textAlign: 'center', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
                                                            <div style={{
                                                                minWidth: '85px',
                                                                minHeight: '24px',
                                                                padding: '0.2rem 0.35rem',
                                                                background: 'var(--bg-active)',
                                                                borderRadius: '4px',
                                                                border: '1px solid var(--border)',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 'bold',
                                                                color: hasVal ? 'var(--text-color)' : 'transparent',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}>
                                                                {hasVal ? fmtDateArray(m.duracionFecha) : '\u00A0'}
                                                            </div>
                                                            <div style={{
                                                                minWidth: '85px',
                                                                minHeight: '22px',
                                                                padding: '0.15rem 0.35rem',
                                                                background: 'var(--bg-active)',
                                                                borderRadius: '4px',
                                                                border: '1px solid var(--border)',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 'bold',
                                                                color: hasVal ? 'var(--primary)' : 'transparent',
                                                                letterSpacing: '0.03em',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}>
                                                                {hasVal ? m.duracionDiaNom : '\u00A0'}
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        <tr style={{ background: 'rgba(16,185,129,0.08)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', color: '#10b981' }}>NIVEL TANQUE</td>
                                            <td style={{ textAlign: 'center', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--primary)', fontWeight: 'bold' }}>{pctFmt(matrix.D.nivelTanque)}</td>
                                            <td style={{ textAlign: 'center', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontWeight: 'bold' }}>{pctFmt(matrix.R.nivelTanque)}</td>
                                            <td style={{ textAlign: 'center', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontWeight: 'bold' }}>{pctFmt(matrix.S.nivelTanque)}</td>
                                            <td style={{ textAlign: 'center', padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', borderLeft: '2px solid var(--border)', fontWeight: 'bold' }}>{pctFmt(matrix.I.nivelTanque)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Tabla de Programados */}
                            <div className="card glass table-responsive" style={{ padding: 0 }}>
                                <h3 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text)', background: 'var(--bg-active)', padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)' }}>
                                    PEDIDOS PROGRAMADOS POR ESTACION ({programados.length})
                                </h3>
                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', minWidth: '500px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-color)' }}>
                                            <th style={{ textAlign: 'left', padding: '0.45rem 0.5rem' }}>FECHA</th>
                                            <th style={{ textAlign: 'left', padding: '0.45rem 0.5rem' }}>ORDEN_T</th>
                                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem' }}>DIESEL</th>
                                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem' }}>REGULAR</th>
                                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem' }}>SUPER</th>
                                            <th style={{ textAlign: 'right', padding: '0.45rem 0.5rem' }}>ION</th>
                                            <th style={{ textAlign: 'center', padding: '0.45rem 0.5rem' }}>ACCION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {programados.map(p => (
                                            <tr 
                                                key={p.id_pedido} 
                                                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                                                onDoubleClick={() => loadPedidoToForm(p)}
                                                title="Doble clic para editar / cargar en el formulario"
                                            >
                                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{fmtDateArray(p.fecha)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--primary)', fontWeight: 'bold' }}>{p.numero || p.id_pedido}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{numFmt(p.diesel)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{numFmt(p.regular)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{numFmt(p.super)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{numFmt(p.iondiesel)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'center' }}>
                                                        <button onClick={() => { setPedidoTemp({ id: p.id_pedido }); setShowConfirmModal(true); }} className="btn-primary" style={{ padding: '3px 8px', fontSize: '0.68rem' }}>CONFIRMAR</button>
                                                        <button onClick={() => handleEliminarPedido(p.id_pedido)} className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.68rem', color: '#ef4444' }}>ANULAR</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {programados.length === 0 && (
                                            <tr><td colSpan="7" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No hay pedidos programados para la estación y fecha seleccionada.</td></tr>
                                        )}
                                    </tbody>
                                    {programados.length > 0 && (
                                        <tfoot>
                                            <tr style={{ background: 'rgba(37,99,235,0.05)', borderTop: '2px solid var(--border)', fontWeight: 'bold' }}>
                                                <td colSpan="2" style={{ padding: '0.45rem 0.5rem', color: 'var(--primary)' }}>TOTAL PROGRAMADO</td>
                                                <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem' }}>{numFmt(matrix.D.programado)}</td>
                                                <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem' }}>{numFmt(matrix.R.programado)}</td>
                                                <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem' }}>{numFmt(matrix.S.programado)}</td>
                                                <td style={{ textAlign: 'right', padding: '0.45rem 0.5rem' }}>{numFmt(matrix.I.programado)}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: CONTROL QUINCENAL DE PRECIOS DE COMBUSTIBLE */}
            {activeTab === 'precios' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card glass" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <Sliders size={18} color="var(--primary)" /> Precios y Costos Oficiales por Quincena
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Los precios de combustibles cambian usualmente cada 15 días (alzas y bajas de referencia mayorista). Puede registrar la nueva quincena y sincronizar los pedidos pendientes.
                            </span>
                        </div>

                        <button
                            onClick={() => {
                                const today = new Date();
                                const dStr = todayStr();
                                setPrecioForm({
                                    periodo_inicio: dStr,
                                    periodo_fin: dStr,
                                    precio_diesel: preciosCombustible[0]?.precio_diesel || 3.68,
                                    precio_regular: preciosCombustible[0]?.precio_regular || 3.85,
                                    precio_super: preciosCombustible[0]?.precio_super || 4.18,
                                    precio_ion: preciosCombustible[0]?.precio_ion || 3.78,
                                    variacion_diesel: 0,
                                    variacion_regular: 0,
                                    variacion_super: 0,
                                    variacion_ion: 0,
                                    fuente: 'Ajuste Quincenal Mayorista',
                                    aplicar_a_pedidos_pendientes: true
                                });
                                setShowNuevoPrecioModal(true);
                            }}
                            className="btn-primary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', height: '36px', padding: '0 1rem' }}
                        >
                            <Plus size={16} /> Registrar Nueva Quincena
                        </button>
                    </div>

                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '800px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-color)', borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>PERÍODO QUINCENAL</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase' }}>DIESEL ($/GAL)</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase' }}>REGULAR ($/GAL)</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase' }}>SUPER ($/GAL)</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase' }}>ION DIESEL ($/GAL)</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>FUENTE</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase' }}>ESTADO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preciosCombustible.map((p, idx) => (
                                    <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 'bold' }}>
                                            {fmtDateArray(p.periodo_inicio)} al {fmtDateArray(p.periodo_fin)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 'bold' }}>
                                            ${numFmt4(p.precio_diesel)}
                                            {p.variacion_diesel !== 0 && (
                                                <span style={{ fontSize: '0.68rem', display: 'block', color: p.variacion_diesel > 0 ? '#ef4444' : '#10b981' }}>
                                                    {p.variacion_diesel > 0 ? `+${numFmt4(p.variacion_diesel)}` : numFmt4(p.variacion_diesel)}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 'bold' }}>
                                            ${numFmt4(p.precio_regular)}
                                            {p.variacion_regular !== 0 && (
                                                <span style={{ fontSize: '0.68rem', display: 'block', color: p.variacion_regular > 0 ? '#ef4444' : '#10b981' }}>
                                                    {p.variacion_regular > 0 ? `+${numFmt4(p.variacion_regular)}` : numFmt4(p.variacion_regular)}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 'bold' }}>
                                            ${numFmt4(p.precio_super)}
                                            {p.variacion_super !== 0 && (
                                                <span style={{ fontSize: '0.68rem', display: 'block', color: p.variacion_super > 0 ? '#ef4444' : '#10b981' }}>
                                                    {p.variacion_super > 0 ? `+${numFmt4(p.variacion_super)}` : numFmt4(p.variacion_super)}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 'bold' }}>
                                            ${numFmt4(p.precio_ion)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {p.fuente || 'Oficial'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                            {p.activo ? (
                                                <span className="badge" style={{ background: '#10b981', color: '#fff', padding: '0.2rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                                                    VIGENTE
                                                </span>
                                            ) : (
                                                <span className="badge" style={{ background: 'var(--border)', color: 'var(--text-muted)', padding: '0.2rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem' }}>
                                                    HISTÓRICO
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 4: CONTROL DE PAGOS Y CONCILIACION BANCARIA */}
            {activeTab === 'conciliacion' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="card glass" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <Scale size={18} color="var(--primary)" /> Control de Pagos de Combustible y Conciliación Bancaria
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Todos los pedidos pagados que han sido alistados para la Conciliación Bancaria generan automáticamente su débito en la cuenta bancaria seleccionada.
                            </span>
                        </div>
                    </div>

                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse', minWidth: '950px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-color)', borderBottom: '2px solid var(--border)' }}>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>ORDEN PORTAL</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>ESTACIÓN</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>CUENTA BANCARIA</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>DOC / REFERENCIA</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>FECHA PAGO</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase' }}>MONTO PAGADO</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase' }}>ESTADO CONCILIACIÓN</th>
                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase' }}>ACCIONES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {portalOrders.filter(o => o.estado_pago === 'PAGADO' || o.estado_pago === 'PARCIAL' || o.listo_conciliacion).map(o => (
                                    <tr key={o.id || o.numero_orden} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                            #{o.numero_orden}
                                            {o.factura_numero && <div style={{ fontSize: '0.7rem', color: '#2563eb' }}>Fac: {o.factura_numero}</div>}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem' }}>{o.estacion_nombre}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
                                            {o.cuenta_numero ? (
                                                <span><b>{o.banco_nombre}</b> {o.cuenta_nombre} - ({o.cuenta_numero})</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)' }}>Sin cuenta asignada</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', fontWeight: 'bold' }}>{o.referencia_pago || o.mov_documento || '-'}</td>
                                        <td style={{ padding: '0.5rem 0.75rem' }}>{fmtDateArray(o.fecha_pago)}</td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                                            ${numFmt(o.monto_pagado || o.monto_total)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                            {o.es_conciliado ? (
                                                <span className="badge" style={{ background: '#059669', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                                                    <CheckCircle2 size={12} /> CONCILIADO ({fmtDateArray(o.mov_fecha_aplicado)})
                                                </span>
                                            ) : (
                                                <span className="badge" style={{ background: '#f59e0b', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                                                    <Clock size={12} /> LISTO EN BANCO (PENDIENTE MATCH)
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                                <button
                                                    onClick={() => openVincularPago(o)}
                                                    className="btn-secondary"
                                                    style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                                                >
                                                    Editar Pago
                                                </button>
                                                {!o.es_conciliado && (
                                                    <button
                                                        onClick={() => handleDesvincularPago(o.numero_orden)}
                                                        className="btn-secondary"
                                                        style={{ padding: '3px 8px', fontSize: '0.7rem', color: '#ef4444' }}
                                                    >
                                                        Desvincular
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {portalOrders.filter(o => o.estado_pago === 'PAGADO' || o.estado_pago === 'PARCIAL' || o.listo_conciliacion).length === 0 && (
                                    <tr>
                                        <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                            No hay pagos registrados para órdenes de combustible. Puede vincular un pago desde la pestaña de Órdenes del Portal.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MODAL 1: VINCULAR PAGO & CONCILIACIÓN BANCARIA */}
            <Modal open={showVincularPagoModal} onClose={() => setShowVincularPagoModal(false)} title={`Vincular Pago - Orden #${pagoForm.numero_orden}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '0.75rem', background: 'rgba(37,99,235,0.08)', borderRadius: '6px', borderLeft: '4px solid #2563eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estación: <b>{pagoForm.estacion_nombre}</b></div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Monto de la Orden: ${numFmt(pagoForm.monto_total)}</div>
                        </div>
                        {pagoForm.es_conciliado ? (
                            <span className="badge" style={{ background: '#059669', color: '#fff', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                ✓ CONCILIADO EN BANCO
                            </span>
                        ) : null}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Cuenta Bancaria (Obligatorio)</label>
                        <select
                            value={pagoForm.cuenta_bancaria_id}
                            onChange={e => setPagoForm({ ...pagoForm, cuenta_bancaria_id: e.target.value })}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', height: '38px', fontSize: '0.825rem' }}
                        >
                            <option value="">-- Seleccione Cuenta Bancaria --</option>
                            {cuentasBancarias.map(c => (
                                <option key={c.corr || c.id} value={c.corr || c.id}>
                                    {formatCuentaLabel(c)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Tipo de Pago</label>
                            <select
                                value={pagoForm.tipo_pago}
                                onChange={e => setPagoForm({ ...pagoForm, tipo_pago: e.target.value })}
                                style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', height: '38px', fontSize: '0.825rem' }}
                            >
                                <option value="Transferencia">Transferencia Bancaria (TR)</option>
                                <option value="Cheque">Cheque (CH)</option>
                                <option value="Cargo en Cuenta">Cargo en Cuenta / Débito (NC)</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Referencia / # Documento</label>
                            <input
                                type="text"
                                placeholder="Ej: TR-89218 o # Factura"
                                value={pagoForm.referencia_pago}
                                onChange={e => setPagoForm({ ...pagoForm, referencia_pago: e.target.value })}
                                style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', height: '38px', fontSize: '0.825rem' }}
                            />
                        </div>
                    </div>

                    <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Fecha de Pago</label>
                            <input
                                type="date"
                                value={pagoForm.fecha_pago}
                                onChange={e => setPagoForm({ ...pagoForm, fecha_pago: e.target.value })}
                                style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', height: '38px', fontSize: '0.825rem' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Monto a Pagar ($)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={pagoForm.monto_pagado}
                                onChange={e => setPagoForm({ ...pagoForm, monto_pagado: e.target.value })}
                                style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', height: '38px', fontSize: '0.825rem', textAlign: 'right', fontWeight: 'bold' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Observaciones</label>
                        <input
                            type="text"
                            placeholder="Comentario o nota de pago..."
                            value={pagoForm.observaciones}
                            onChange={e => setPagoForm({ ...pagoForm, observaciones: e.target.value })}
                            style={{ padding: '0.45rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', height: '38px', fontSize: '0.825rem' }}
                        />
                    </div>

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', cursor: 'pointer', padding: '0.5rem', background: 'var(--bg-active)', borderRadius: '4px' }}>
                        <input
                            type="checkbox"
                            checked={pagoForm.alistar_conciliacion}
                            onChange={e => setPagoForm({ ...pagoForm, alistar_conciliacion: e.target.checked })}
                            style={{ width: '16px', height: '16px' }}
                        />
                        <span><b>Alistar para Conciliación Bancaria:</b> Genera el movimiento bancario oficial (débito/salida) para conciliar con el extracto bancario.</span>
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" onClick={() => setShowVincularPagoModal(false)} style={{ flex: '1 1 auto' }}>Cancelar</button>
                        <button className="btn-primary" onClick={handleGuardarPago} style={{ flex: '1 1 auto' }}>Guardar y Vincular Pago</button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 2: AJUSTAR COSTOS QUINCENALES DEL PEDIDO */}
            <Modal open={showAjustarCostosModal} onClose={() => setShowAjustarCostosModal(false)} title={`Ajustar Costos de Combustible - Orden #${costosForm.numero_orden}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Si el combustible varió de precio en la quincena respecto al costo predeterminado, ingrese los nuevos costos unitarios para recalcular los importes del pedido:
                    </div>

                    <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Costo Diesel ($/Gal)</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={costosForm.costo_diesel}
                                onChange={e => setCostosForm({ ...costosForm, costo_diesel: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                            {costosForm.galones_diesel > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Volumen: {numFmt(costosForm.galones_diesel)} gal</span>}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Costo Regular ($/Gal)</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={costosForm.costo_regular}
                                onChange={e => setCostosForm({ ...costosForm, costo_regular: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                            {costosForm.galones_regular > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Volumen: {numFmt(costosForm.galones_regular)} gal</span>}
                        </div>
                    </div>

                    <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Costo Super ($/Gal)</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={costosForm.costo_super}
                                onChange={e => setCostosForm({ ...costosForm, costo_super: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                            {costosForm.galones_super > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Volumen: {numFmt(costosForm.galones_super)} gal</span>}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Costo IonDiesel ($/Gal)</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={costosForm.costo_ion}
                                onChange={e => setCostosForm({ ...costosForm, costo_ion: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                            {costosForm.galones_ion > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Volumen: {numFmt(costosForm.galones_ion)} gal</span>}
                        </div>
                    </div>

                    <div style={{ padding: '0.75rem', background: 'rgba(16,185,129,0.08)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(16,185,129,0.3)' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Nuevo Total Recalculado:</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#10b981' }}>${numFmt(nuevoTotalCalculado)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" onClick={() => setShowAjustarCostosModal(false)} style={{ flex: '1 1 auto' }}>Cancelar</button>
                        <button className="btn-primary" onClick={handleGuardarCostos} style={{ flex: '1 1 auto' }}>Aplicar Nuevos Costos</button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 3: REGISTRAR NUEVA QUINCENA DE PRECIOS */}
            <Modal open={showNuevoPrecioModal} onClose={() => setShowNuevoPrecioModal(false)} title="Registrar Ajuste Quincenal de Combustible">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Desde (Inicio Quincena)</label>
                            <input
                                type="date"
                                value={precioForm.periodo_inicio}
                                onChange={e => setPrecioForm({ ...precioForm, periodo_inicio: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Hasta (Fin Quincena)</label>
                            <input
                                type="date"
                                value={precioForm.periodo_fin}
                                onChange={e => setPrecioForm({ ...precioForm, periodo_fin: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                        </div>
                    </div>

                    <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Precio Diesel ($/Gal)</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={precioForm.precio_diesel}
                                onChange={e => setPrecioForm({ ...precioForm, precio_diesel: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Precio Regular ($/Gal)</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={precioForm.precio_regular}
                                onChange={e => setPrecioForm({ ...precioForm, precio_regular: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                        </div>
                    </div>

                    <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Precio Super ($/Gal)</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={precioForm.precio_super}
                                onChange={e => setPrecioForm({ ...precioForm, precio_super: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>Precio IonDiesel ($/Gal)</label>
                            <input
                                type="number"
                                step="0.0001"
                                value={precioForm.precio_ion}
                                onChange={e => setPrecioForm({ ...precioForm, precio_ion: e.target.value })}
                                style={{ padding: '0.4rem', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', borderRadius: '4px', height: '36px' }}
                            />
                        </div>
                    </div>

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', cursor: 'pointer', padding: '0.5rem', background: 'var(--bg-active)', borderRadius: '4px' }}>
                        <input
                            type="checkbox"
                            checked={precioForm.aplicar_a_pedidos_pendientes}
                            onChange={e => setPrecioForm({ ...precioForm, aplicar_a_pedidos_pendientes: e.target.checked })}
                            style={{ width: '16px', height: '16px' }}
                        />
                        <span>Actualizar automáticamente los pedidos pendientes con estos nuevos precios quincenales.</span>
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" onClick={() => setShowNuevoPrecioModal(false)} style={{ flex: '1 1 auto' }}>Cancelar</button>
                        <button className="btn-primary" onClick={handleGuardarPreciosQuincena} style={{ flex: '1 1 auto' }}>Guardar Precios</button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 4: DETALLE COMPLETO DE ORDEN */}
            <Modal open={showDetalleModal} onClose={() => setShowDetalleModal(false)} title={`Detalle de Orden #${selectedOrderDetalle?.numero_orden || ''}`}>
                {selectedOrderDetalle && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '0.75rem', padding: '0.75rem', background: 'var(--bg-active)', borderRadius: '6px' }}>
                            <div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Estación Destino</span>
                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{selectedOrderDetalle.estacion_nombre}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fecha Pedido</span>
                                <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{fmtDateArray(selectedOrderDetalle.fecha_pedido)}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Estado</span>
                                <div>{renderEstadoBadge(selectedOrderDetalle.estado, selectedOrderDetalle.razon_estado)}</div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Monto Total</span>
                                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--primary)' }}>${numFmt(selectedOrderDetalle.monto_total)}</div>
                            </div>
                        </div>

                        {selectedOrderDetalle.razon_estado && (
                            <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(239,68,68,0.08)', borderRadius: '6px', borderLeft: '4px solid #ef4444' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#ef4444' }}>Motivo / Razón del Estado en Portal:</div>
                                <div style={{ fontSize: '0.825rem', color: 'var(--text)' }}>{selectedOrderDetalle.razon_estado}</div>
                            </div>
                        )}

                        <h4 style={{ margin: '0.5rem 0 0.25rem 0', fontSize: '0.85rem' }}>Desglose de Ítems / Productos</h4>
                        <div className="table-responsive" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-color)', borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>PRODUCTO</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'right' }}>CANTIDAD</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'right' }}>PRECIO UNIT.</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'right' }}>IMPUESTO</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'right' }}>TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedOrderDetalle.parsedItems || []).map((it, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.4rem' }}>{it.productName || it.productCode || 'Ítem'}</td>
                                            <td style={{ padding: '0.4rem', textAlign: 'right' }}>{numFmt(it.quantity || it.invoicedQuantity)}</td>
                                            <td style={{ padding: '0.4rem', textAlign: 'right' }}>${numFmt4(it.pricePerUnit)}</td>
                                            <td style={{ padding: '0.4rem', textAlign: 'right' }}>${numFmt(it.totalTaxPerItem || it.totalTax)}</td>
                                            <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 'bold' }}>${numFmt(it.totalPrice || it.totalAmountItem)}</td>
                                        </tr>
                                    ))}
                                    {(!selectedOrderDetalle.parsedItems || selectedOrderDetalle.parsedItems.length === 0) && (
                                        <tr>
                                            <td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                Sin desglose individual de ítems (Orden a granel de combustible).
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                            <button className="btn-secondary" onClick={() => setShowDetalleModal(false)} style={{ flex: '1 1 auto' }}>Cerrar</button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* MODAL 5: CONFIRMAR PEDIDO PROGRAMADO LOCAL */}
            <Modal open={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="Confirmar Transacción">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>NÚMERO DE PEDIDO</label>
                        <input type="text" placeholder="Ingrese número de pedido" value={confirmData.numero_pedido} onChange={e=>setConfirmData({...confirmData, numero_pedido: e.target.value})} style={{ padding: '0.5rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px', height: '36px' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>FORMA DE PAGO</label>
                        <input type="text" placeholder="Ej. CREDITO, EFECTIVO, CHEQUE..." value={confirmData.forma_pago} onChange={e=>setConfirmData({...confirmData, forma_pago: e.target.value})} style={{ padding: '0.5rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px', height: '36px' }} />
                    </div>
                    <div className="form-grid form-grid-2">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.7rem' }}>Costo D</label>
                            <input type="number" step="0.01" value={confirmData.costo_d} onChange={e=>setConfirmData({...confirmData, costo_d: e.target.value})} onWheel={e => e.target.blur()} style={{ padding:'0.35rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px', height: '36px' }}/>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.7rem' }}>Costo R</label>
                            <input type="number" step="0.01" value={confirmData.costo_r} onChange={e=>setConfirmData({...confirmData, costo_r: e.target.value})} onWheel={e => e.target.blur()} style={{ padding:'0.35rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px', height: '36px' }}/>
                        </div>
                    </div>
                    <div className="form-grid form-grid-2">
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.7rem' }}>Costo S</label>
                            <input type="number" step="0.01" value={confirmData.costo_s} onChange={e=>setConfirmData({...confirmData, costo_s: e.target.value})} onWheel={e => e.target.blur()} style={{ padding:'0.35rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px', height: '36px' }}/>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.7rem' }}>Costo Ion</label>
                            <input type="number" step="0.01" value={confirmData.costo_i} onChange={e=>setConfirmData({...confirmData, costo_i: e.target.value})} onWheel={e => e.target.blur()} style={{ padding:'0.35rem', background: 'var(--bg-color)', color: 'var(--text-color)', border: '1px solid var(--border)', borderRadius: '4px', height: '36px' }}/>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                        <button className="btn-secondary" onClick={() => setShowConfirmModal(false)} style={{ flex: '1 1 auto' }}>Cancelar</button>
                        <button className="btn-primary" onClick={executeConfirmTransaction} style={{ flex: '1 1 auto' }}>Aplicar Confirmación</button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 6: DIAGNÓSTICO PORTAL PUMA / SALESFORCE */}
            <Modal
                isOpen={showDiagnosticoModal}
                onClose={() => setShowDiagnosticoModal(false)}
                title="Diagnóstico y Credenciales — Portal Puma Energy-Latam"
                size="lg"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            VPS IP: <code>5.252.55.29</code> • Usuario: <code>{portalCredsData?.user || inputPortalUser || 'corina.sosah@sipesv.com'}</code>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setShowDiagnosticoModal(false)}
                                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem' }}
                            >
                                Cerrar
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={fetchDiagnostico}
                                disabled={isLoadingDiagnostico}
                                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <RefreshCw size={14} className={isLoadingDiagnostico ? 'spin' : ''} />
                                Probar Conexión Ahora
                            </button>
                        </div>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>
                    {/* Tarjeta de Gestión de Credenciales del Portal */}
                    <div className="card glass" style={{
                        padding: '1rem',
                        borderLeft: portalCredsData?.configured ? '4px solid #10b981' : '4px solid #f59e0b',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        background: 'rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <Lock size={16} color={portalCredsData?.configured ? '#10b981' : '#f59e0b'} />
                                <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>
                                    Credenciales de Acceso a Salesforce / Puma Energy
                                </span>
                            </div>
                            <span className={`badge ${portalCredsData?.configured ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}>
                                {portalCredsData?.configured
                                    ? (portalCredsData.source === 'database' ? 'Configurada en BD' : 'Configurada en Servidor')
                                    : 'Pendiente de Configurar'}
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                            Ingrese el usuario y contraseña del portal Puma Energy-Latam para sincronizar pedidos en vivo. Se guardan directamente en el servidor sin necesidad de acceder por consola SSH.
                        </p>
                        <form onSubmit={handleSavePortalCreds} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 210px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Usuario / Correo:</label>
                                <input
                                    type="text"
                                    placeholder="corina.sosah@sipesv.com"
                                    value={inputPortalUser}
                                    onChange={e => setInputPortalUser(e.target.value)}
                                    style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.825rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 210px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Contraseña:</label>
                                <div style={{ display: 'flex', position: 'relative' }}>
                                    <input
                                        type={showPortalPass ? 'text' : 'password'}
                                        placeholder={portalCredsData?.hasPassword ? '•••••••••••• (dejar vacío para mantener)' : 'Ingrese contraseña'}
                                        value={inputPortalPass}
                                        onChange={e => setInputPortalPass(e.target.value)}
                                        style={{ height: '36px', padding: '0 2.2rem 0 0.75rem', fontSize: '0.825rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)', width: '100%' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPortalPass(!showPortalPass)}
                                        style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
                                        title={showPortalPass ? 'Ocultar contraseña' : 'Ver contraseña'}
                                    >
                                        {showPortalPass ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={isSavingCreds || !inputPortalUser.trim() || !inputPortalPass.trim()}
                                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
                            >
                                {isSavingCreds ? <RefreshCw size={13} className="spin" /> : <Save size={14} />}
                                Guardar Credenciales
                            </button>
                        </form>
                    </div>

                    {isLoadingDiagnostico ? (
                        <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                            <RefreshCw size={28} className="spin" color="var(--primary, #3b82f6)" />
                            <span style={{ fontSize: '0.9rem' }}>Verificando conexión en vivo con el portal de Puma...</span>
                        </div>
                    ) : diagnosticoData ? (
                        <>
                            {/* Estado General */}
                            {(() => {
                                const isConnected = diagnosticoData.status === 'CONECTADO' || diagnosticoData.status === 'CONNECTED';
                                const is2FA = diagnosticoData.status === 'REQUIRES_2FA' || diagnosticoData.requires2FA;
                                const isConfig = diagnosticoData.status === 'CONFIG_REQUIRED';
                                const isInvalid = diagnosticoData.status === 'INVALID_CREDENTIALS';
                                const isBlocked = diagnosticoData.status === 'IP_BLOCKED';

                                return (
                                    <div style={{
                                        padding: '1rem',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        background: isConnected
                                            ? 'rgba(34, 197, 94, 0.12)'
                                            : (is2FA || isConfig)
                                            ? 'rgba(245, 158, 11, 0.12)'
                                            : 'rgba(239, 68, 68, 0.12)',
                                        border: `1px solid ${isConnected ? '#22c55e' : (is2FA || isConfig) ? '#f59e0b' : '#ef4444'}`
                                    }}>
                                        {isConnected ? (
                                            <CheckCircle size={24} color="#22c55e" style={{ flexShrink: 0 }} />
                                        ) : is2FA ? (
                                            <Key size={24} color="#f59e0b" style={{ flexShrink: 0 }} />
                                        ) : isConfig ? (
                                            <Lock size={24} color="#f59e0b" style={{ flexShrink: 0 }} />
                                        ) : (
                                            <AlertTriangle size={24} color="#ef4444" style={{ flexShrink: 0 }} />
                                        )}
                                        <div>
                                            <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                                                {isConnected && '¡Conexión Exitosa y Sesión Activa!'}
                                                {is2FA && 'Autenticación en Dos Pasos (2FA) Requerida'}
                                                {isConfig && 'Credenciales de Acceso Requeridas'}
                                                {isInvalid && 'Credenciales de Acceso Incorrectas'}
                                                {isBlocked && 'Acceso Bloqueado por Política de IP en Salesforce'}
                                                {diagnosticoData.status === 'ERROR' && 'No se pudo conectar con el portal'}
                                                {diagnosticoData.status === 'LOGIN_PENDING' && 'Inicio de Sesión en Proceso'}
                                            </div>
                                            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                                {diagnosticoData.message}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Formulario 2FA si se requiere */}
                            {diagnosticoData.requires2FA && (
                                <div className="card glass" style={{ padding: '1rem', borderLeft: '4px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Key size={16} color="#f59e0b" /> Introducir Código de Verificación OTP
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Salesforce envió un código de 5 o 6 dígitos al correo de la cuenta (<b>{portalCredsData?.user || inputPortalUser || 'corina.sosah@sipesv.com'}</b>). Ingréselo aquí para completar el inicio de sesión:
                                    </p>
                                    <form onSubmit={handleSubmit2FACode} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <input
                                            type="text"
                                            placeholder="Código de verificación (ej. 123456)"
                                            value={twoFactorCode}
                                            onChange={e => setTwoFactorCode(e.target.value)}
                                            style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.85rem', width: '240px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
                                            autoFocus
                                        />
                                        <button
                                            type="submit"
                                            className="btn-primary"
                                            disabled={isSubmittingCode || !twoFactorCode.trim()}
                                            style={{ height: '36px', padding: '0 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                        >
                                            {isSubmittingCode ? <RefreshCw size={13} className="spin" /> : null}
                                            Verificar Código
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Dependencias del Servidor Linux VPS si hay error de librerías */}
                            {(diagnosticoData.status === 'ERROR' || String(diagnosticoData.message || '').includes('libatk') || String(diagnosticoData.message || '').includes('librerías')) && (
                                <div className="card glass" style={{ padding: '0.85rem 1rem', borderLeft: '4px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.05)' }}>
                                    <div style={{ fontSize: '0.825rem', fontWeight: 'bold', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <AlertTriangle size={15} /> Librerías del Sistema Linux Requeridas en el VPS
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-color)', lineHeight: '1.4' }}>
                                        En servidores Linux mínimos, el navegador Chrome requiere dependencias del sistema. Para instalarlas de una sola vez, ejecute por terminal SSH en el VPS:
                                        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.25)', padding: '0.5rem 0.75rem', borderRadius: '4px', overflowX: 'auto' }}>
                                            <code style={{ fontSize: '0.75rem', color: '#10b981', whiteSpace: 'nowrap', flex: 1 }}>
                                                sudo apt-get install -y libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2
                                            </code>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => {
                                                    navigator.clipboard.writeText('sudo apt-get install -y libasound2t64 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2');
                                                    addToast('Comando copiado al portapapeles', 'info');
                                                }}
                                                style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                            >
                                                <Copy size={12} /> Copiar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Información para Usuarios del Portal Puma */}
                            <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', background: 'rgba(59, 130, 246, 0.05)', borderLeft: '4px solid #3b82f6' }}>
                                <div style={{ fontSize: '0.825rem', fontWeight: 'bold', color: 'var(--text-color)' }}>
                                    Autenticación Directa como Usuario del Portal (Sin requerir permisos de administrador)
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                    Como usuario del portal de clientes (<b>corina.sosah@sipesv.com</b>), <b>no necesita ningún acceso técnico de administrador en Puma o Salesforce</b>:
                                    <ol style={{ margin: '0.35rem 0 0 1.2rem', padding: 0 }}>
                                        <li>Ingrese la contraseña con la que ingresa Corina en <code>customerportal.energy-latam.com</code> en la sección de arriba y pulse <b>Guardar Credenciales</b>.</li>
                                        <li>Haga clic en <b>Probar Conexión Ahora</b> para que el servidor inicie sesión.</li>
                                        <li>Si Puma solicita verificación por correo, recibirá un código de 6 dígitos en <code>corina.sosah@sipesv.com</code>. Ingréselo en el recuadro superior y pulse <b>Verificar Código</b>.</li>
                                        <li>La sesión quedará guardada de forma persistente en el servidor para sincronizar todos los pedidos y precios automáticamente.</li>
                                    </ol>
                                </div>
                            </div>

                            {/* Mini Captura del Navegador del Servidor */}
                            {(diagnosticoData.screenshot || diagnosticoData.screenshotBase64) && (
                                <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                                        Captura en vivo del navegador en el VPS:
                                    </div>
                                    <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', background: '#000' }}>
                                        <img
                                            src={(diagnosticoData.screenshot || diagnosticoData.screenshotBase64).startsWith('data:')
                                                ? (diagnosticoData.screenshot || diagnosticoData.screenshotBase64)
                                                : `data:image/png;base64,${diagnosticoData.screenshot || diagnosticoData.screenshotBase64}`}
                                            alt="Captura de pantalla de portal Puma"
                                            style={{ width: '100%', height: 'auto', display: 'block' }}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            </Modal>
        </div>
    );
}
