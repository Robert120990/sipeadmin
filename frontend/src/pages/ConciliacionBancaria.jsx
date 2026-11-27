import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Scale, Search, CheckSquare, Square, RefreshCw, UploadCloud,
    FileSpreadsheet, Eye, Edit2, CheckCircle2,
    AlertCircle, ArrowRightLeft, Sparkles, Filter, X, ShieldAlert,
    Calendar, Building2, Landmark, Check, Clock, Plus, Link2, Printer,
    Lock, Unlock, History, AlertTriangle, ShieldCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { socket } from '../services/socket';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { getStoredUser } from '../utils/auth';
import { formatLocalYMD, todayStr as getTodayStr } from '../utils/date';

const makeIdempotencyKey = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const parseMoneyInput = (raw) => {
    if (raw === null || raw === undefined || raw === '') return 0;
    const cleaned = String(raw).trim().replace(/[$,\s]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? Math.round((num + Number.EPSILON) * 100) / 100 : 0;
};

const formatMoney = (val) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatSvDateTime = (val) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString('es-SV', {
        timeZone: 'America/El_Salvador',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
};

export default function ConciliacionBancaria() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const user = getStoredUser();
    const isAdmin = Number(user?.role_id) === 1 || /^(admin|administrator|administrador|super\s*admin)/i.test(String(user?.role || user?.role_name || ''));
    const [permFlags, setPermFlags] = useState({
        can_edit_monto: isAdmin || Boolean(user?.permissions?.includes('edit_monto_conciliacion')),
        can_close_periodo: isAdmin || Boolean(user?.permissions?.includes('close_conciliacion_periodo') || user?.permissions?.includes('manage_conciliacion_bancaria') || user?.permissions?.includes('/dashboard/bancos/conciliacion')),
        can_approve_reapertura: isAdmin || Boolean(user?.permissions?.includes('approve_reapertura_conciliacion'))
    });

    // Catálogos y Filtros
    const [empresas, setEmpresas] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [tiposRemesas, setTiposRemesas] = useState([]);
    const [selectedEmpresa, setSelectedEmpresa] = useState('');
    const [selectedCuentaId, setSelectedCuentaId] = useState('');

    // Fechas y Selector de Periodo
    const [periodoPreset, setPeriodoPreset] = useState('este_mes');
    const today = new Date();
    const firstDay = formatLocalYMD(new Date(today.getFullYear(), today.getMonth(), 1));
    const todayStr = getTodayStr();
    const [desde, setDesde] = useState(firstDay);
    const [hasta, setHasta] = useState(todayStr);

    const handlePeriodoPresetChange = (preset) => {
        setPeriodoPreset(preset);
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const d = now.getDate();

        const pad = (n) => String(n).padStart(2, '0');
        const toYMD = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

        if (preset === 'hoy') {
            const t = toYMD(now);
            setDesde(t);
            setHasta(t);
        } else if (preset === 'ayer') {
            const yesterday = new Date(y, m, d - 1);
            const yStr = toYMD(yesterday);
            setDesde(yStr);
            setHasta(yStr);
        } else if (preset === 'este_mes') {
            setDesde(toYMD(new Date(y, m, 1)));
            setHasta(toYMD(now));
        } else if (preset === 'mes_anterior') {
            setDesde(toYMD(new Date(y, m - 1, 1)));
            setHasta(toYMD(new Date(y, m, 0)));
        } else if (preset === 'ultimos_30_dias') {
            setDesde(toYMD(new Date(y, m, d - 30)));
            setHasta(toYMD(now));
        } else if (preset === 'ultimos_3_meses') {
            setDesde(toYMD(new Date(y, m - 3, d)));
            setHasta(toYMD(now));
        } else if (preset === 'anio_actual') {
            setDesde(toYMD(new Date(y, 0, 1)));
            setHasta(toYMD(now));
        }
    };

    // Estado principal
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [cuentaInfo, setCuentaInfo] = useState(null);
    const [movimientosConciliados, setMovimientosConciliados] = useState([]);
    const [pendientes, setPendientes] = useState([]);
    const [sugerenciasControlPagos, setSugerenciasControlPagos] = useState([]);
    const [periodosRecientes, setPeriodosRecientes] = useState([]);
    const [solicitudesPendientes, setSolicitudesPendientes] = useState([]);
    const [resumen, setResumen] = useState({
        saldo_banco: 0,
        saldo_chequera: 0,
        saldo_conciliado_libros: 0,
        abonos_en_transito: 0,
        cargos_en_transito: 0,
        cheques_en_transito: 0,
        cargos_cheques_en_transito: 0,
        saldo_inicial: 0,
        fecha_saldo_inicial: null,
        cheques_reservados_count: 0,
        cheques_reservados_monto: 0,
        diferencia: 0,
        diferencia_vs_chequera: 0,
        periodo_cerrado_hasta: null,
        ultima_validacion: null
    });

    // Saldo en Banco editable con protección contra sobreescritura por Socket.io
    const [saldoBancoManual, setSaldoBancoManual] = useState('');
    const isSaldoManualDirtyRef = useRef(false);
    const requestSeqRef = useRef(0);
    const abortCtrlRef = useRef(null);

    // Tabs: 'MOVIMIENTOS' | 'PENDIENTES' | 'CONTROL_PAGOS'
    const [activeTab, setActiveTab] = useState('MOVIMIENTOS');
    const [searchTerm, setSearchTerm] = useState('');

    // Selección múltiple para aplicar en pendientes
    const [selectedPendingKeys, setSelectedPendingKeys] = useState(new Set());
    const [fechaAplicadoInput, setFechaAplicadoInput] = useState(todayStr);

    // Modales
    const [showImportModal, setShowImportModal] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showPeriodosModal, setShowPeriodosModal] = useState(false);
    const [showReaperturaModal, setShowReaperturaModal] = useState(false);

    // Cierre de período en validación
    const [cerrarPeriodoCheck, setCerrarPeriodoCheck] = useState(false);
    const [confirmarConDiferencia, setConfirmarConDiferencia] = useState(false);
    const [notasValidacion, setNotasValidacion] = useState('');

    // Modal Períodos, Reaperturas y Auditoría
    const [periodosTab, setPeriodosTab] = useState('PERIODOS'); // 'PERIODOS' | 'SOLICITUDES' | 'AUDITORIA'
    const [periodosList, setPeriodosList] = useState([]);
    const [solicitudesList, setSolicitudesList] = useState([]);
    const [auditoriaList, setAuditoriaList] = useState([]);
    const [loadingPeriodos, setLoadingPeriodos] = useState(false);
    const [reaperturaTargetPeriodo, setReaperturaTargetPeriodo] = useState(null);
    const [reaperturaMotivo, setReaperturaMotivo] = useState('');
    const [resolucionComentarios, setResolucionComentarios] = useState({});

    // ReportPreviewModal state
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('Conciliación Bancaria');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewFileName, setPreviewFileName] = useState('Conciliacion.pdf');

    // Item seleccionado para detalle/edición
    const [selectedItem, setSelectedItem] = useState(null);
    const [editFormData, setEditFormData] = useState({
        documento: '',
        concepto: '',
        fecha: '',
        monto: 0,
        version: undefined
    });

    // Estado para Importador de Extractos
    const [importBank, setImportBank] = useState('AUTO');
    const [importRawText, setImportRawText] = useState('');
    const [importFileName, setImportFileName] = useState('');
    const [parsedExtract, setParsedExtract] = useState(null);
    const [isParsing, setIsParsing] = useState(false);
    const [selectedExtractIndices, setSelectedExtractIndices] = useState(new Set());
    const [showDiscardedRows, setShowDiscardedRows] = useState(false);

    // Estado para Asignación / Creación desde Extracto o Manual
    const [assignTargetRow, setAssignTargetRow] = useState(null);
    const [assignTargetIndex, setAssignTargetIndex] = useState(null);
    const [assignTab, setAssignTab] = useState('CREAR'); // 'CREAR' | 'VINCULAR'
    const [assignFormData, setAssignFormData] = useState({
        tipo: 'CARGO',
        tipo_remesa_codigo: 'NC',
        fecha: todayStr,
        fecha_aplicado: todayStr,
        documento: '',
        concepto: '',
        monto: 0,
        aplicar_inmediatamente: true
    });
    const [linkSearchTerm, setLinkSearchTerm] = useState('');

    // Cargar catálogos iniciales
    useEffect(() => {
        const fetchCatalogos = async () => {
            try {
                const res = await api.get('/bancos/conciliacion/catalogos');
                setEmpresas(res.data.empresas || []);
                setCuentas(res.data.cuentas || []);
                setTiposRemesas(res.data.tipos_remesas || []);
                if (res.data.permissions) {
                    setPermFlags(prev => ({ ...prev, ...res.data.permissions }));
                }
                if (res.data.cuentas?.length > 0) {
                    setSelectedCuentaId(String(res.data.cuentas[0].id));
                    setSelectedEmpresa(String(res.data.cuentas[0].empresa_codigo || ''));
                }
            } catch (err) {
                console.error(err);
                addToast('Error al cargar catálogos de bancos', 'error');
            }
        };
        fetchCatalogos();
    }, [addToast]);

    const cuentasFiltradas = useMemo(() => {
        if (!selectedEmpresa) return cuentas;
        return cuentas.filter(c => String(c.empresa_codigo) === String(selectedEmpresa));
    }, [cuentas, selectedEmpresa]);

    const currentCuenta = useMemo(() => {
        return cuentas.find(c => String(c.id) === String(selectedCuentaId));
    }, [cuentas, selectedCuentaId]);

    const tiposRemesasCuenta = useMemo(() => {
        const empresaId = currentCuenta?.empresa_id;
        let pool = tiposRemesas;

        if (empresaId && tiposRemesas.some(tr => String(tr.empresa_id) === String(empresaId))) {
            pool = tiposRemesas.filter(tr => String(tr.empresa_id) === String(empresaId));
        }

        const seen = new Set();
        const deduplicated = [];
        for (const tr of pool) {
            const cod = String(tr.codigo || tr.id || '').trim();
            if (!cod || seen.has(cod.toUpperCase())) continue;
            seen.add(cod.toUpperCase());
            deduplicated.push({ ...tr, codigo: tr.codigo || tr.id });
        }
        return deduplicated;
    }, [tiposRemesas, currentCuenta]);

    const opcionesTipoRemesa = useMemo(() => {
        const isCargo = assignFormData.tipo === 'CARGO';
        const isDebit = (tr) => {
            const cod = String(tr.codigo || tr.id || '').toUpperCase().trim();
            const desc = String(tr.descripcion || '').toUpperCase();
            if (cod === 'NC' || cod === 'CH' || cod === '02') return true;
            if (desc.includes('CARGO') || desc.includes('CHEQUE') || desc.includes('DEBITO') || desc.includes('RETIRO') || desc.includes('SALIDA') || desc.includes('PAGO') || desc.includes('GASTO')) return true;
            if (cod === 'TR' || cod === '04' || desc.includes('TRANSFER') || desc.includes('TRASLADO')) return true;
            return false;
        };
        const isCredit = (tr) => {
            const cod = String(tr.codigo || tr.id || '').toUpperCase().trim();
            const desc = String(tr.descripcion || '').toUpperCase();
            if (cod === 'RM' || cod === 'NA' || cod === '01' || cod === '03') return true;
            if (desc.includes('ABONO') || desc.includes('REMESA') || desc.includes('CREDITO') || desc.includes('DEPOSITO') || desc.includes('ENTRADA') || desc.includes('INGRESO')) return true;
            if (cod === 'TR' || cod === '04' || desc.includes('TRANSFER') || desc.includes('TRASLADO')) return true;
            return false;
        };

        let result = tiposRemesasCuenta.filter(tr => isCargo ? isDebit(tr) : isCredit(tr));
        if (result.length === 0) result = tiposRemesasCuenta;
        if (result.length === 0) {
            return isCargo
                ? [{ codigo: 'NC', descripcion: 'NOTA DE CARGO' }, { codigo: 'CH', descripcion: 'CHEQUE COBRADO' }]
                : [{ codigo: 'RM', descripcion: 'REMESA DIARIA' }, { codigo: 'NA', descripcion: 'NOTA DE ABONO' }];
        }
        return result;
    }, [tiposRemesasCuenta, assignFormData.tipo]);

    useEffect(() => {
        if (showAssignModal && opcionesTipoRemesa.length > 0) {
            const exists = opcionesTipoRemesa.some(o => String(o.codigo || o.id) === String(assignFormData.tipo_remesa_codigo));
            if (!exists) {
                setAssignFormData(prev => ({
                    ...prev,
                    tipo_remesa_codigo: opcionesTipoRemesa[0].codigo || opcionesTipoRemesa[0].id
                }));
            }
        }
    }, [showAssignModal, opcionesTipoRemesa, assignFormData.tipo_remesa_codigo]);

    useEffect(() => {
        if (cuentasFiltradas.length > 0) {
            const exists = cuentasFiltradas.some(c => String(c.id) === String(selectedCuentaId));
            if (!exists) {
                isSaldoManualDirtyRef.current = false;
                setSelectedCuentaId(String(cuentasFiltradas[0].id));
            }
        } else if (cuentas.length > 0 && selectedEmpresa) {
            setSelectedCuentaId('');
            setCuentaInfo(null);
            setMovimientosConciliados([]);
            setPendientes([]);
        }
    }, [cuentasFiltradas, selectedCuentaId, cuentas.length, selectedEmpresa]);

    // Cargar datos de conciliación con AbortController + requestSeq para evitar race conditions
    const fetchData = useCallback(async ({ preserveSelection = false } = {}) => {
        if (!selectedCuentaId) return;
        const reqSeq = ++requestSeqRef.current;
        if (abortCtrlRef.current) {
            abortCtrlRef.current.abort();
        }
        const controller = new AbortController();
        abortCtrlRef.current = controller;

        setLoading(true);
        try {
            const res = await api.get('/bancos/conciliacion/data', {
                params: {
                    cuenta_id: selectedCuentaId,
                    desde: desde || undefined,
                    hasta: hasta || undefined
                },
                signal: controller.signal
            });
            if (reqSeq !== requestSeqRef.current) return;

            setCuentaInfo(res.data.cuenta || null);
            setMovimientosConciliados(res.data.movimientos_conciliados || []);
            const nextPendientes = res.data.pendientes || [];
            setPendientes(nextPendientes);
            setSugerenciasControlPagos(res.data.sugerencias_control_pagos || []);
            setPeriodosRecientes(res.data.periodos_recientes || []);
            setSolicitudesPendientes(res.data.solicitudes_reapertura_pendientes || []);

            const nextResumen = res.data.resumen || {};
            setResumen(nextResumen);
            if (!isSaldoManualDirtyRef.current) {
                setSaldoBancoManual(nextResumen?.saldo_banco !== undefined ? String(nextResumen.saldo_banco) : '0');
            }

            if (preserveSelection) {
                const validKeys = new Set(nextPendientes.map(p => p.key));
                setSelectedPendingKeys(prev => new Set([...prev].filter(k => validKeys.has(k))));
            } else {
                setSelectedPendingKeys(new Set());
            }
        } catch (err) {
            if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
            console.error('Error al consultar conciliación:', err);
            const msg = err.response?.data?.message || 'Error al consultar conciliación bancaria';
            addToast(msg, 'error');
        } finally {
            if (reqSeq === requestSeqRef.current) {
                setLoading(false);
            }
        }
    }, [selectedCuentaId, desde, hasta, addToast]);

    useEffect(() => {
        isSaldoManualDirtyRef.current = false;
        fetchData({ preserveSelection: false });
    }, [selectedCuentaId, desde, hasta, fetchData]);

    // Escuchar eventos en tiempo real de Socket.io filtrados por cuenta y preservando trabajo en curso
    useEffect(() => {
        const handleUpdate = (payload) => {
            if (payload?.cuenta_bancaria_id && String(payload.cuenta_bancaria_id) !== String(selectedCuentaId)) {
                return;
            }
            fetchData({ preserveSelection: true });
        };
        socket.on('conciliacion_updated', handleUpdate);
        return () => {
            socket.off('conciliacion_updated', handleUpdate);
        };
    }, [fetchData, selectedCuentaId]);

    const handleEmpresaChange = (e) => {
        const empCode = e.target.value;
        isSaldoManualDirtyRef.current = false;
        setSelectedEmpresa(empCode);
        const filtered = cuentas.filter(c => !empCode || String(c.empresa_codigo) === String(empCode));
        if (filtered.length > 0) {
            setSelectedCuentaId(String(filtered[0].id));
        } else {
            setSelectedCuentaId('');
        }
    };

    const filteredMovimientos = useMemo(() => {
        if (!searchTerm) return movimientosConciliados;
        const q = searchTerm.toLowerCase();
        return movimientosConciliados.filter(item =>
            String(item.documento || '').toLowerCase().includes(q) ||
            String(item.concepto || '').toLowerCase().includes(q) ||
            String(item.beneficiario || '').toLowerCase().includes(q) ||
            String(item.tipo || '').toLowerCase().includes(q) ||
            String(item.fecha_display || '').includes(q) ||
            String(item.fecha_aplicado_display || '').includes(q) ||
            String(item.monto_display || '').includes(q)
        );
    }, [movimientosConciliados, searchTerm]);

    const filteredPendientes = useMemo(() => {
        if (!searchTerm) return pendientes;
        const q = searchTerm.toLowerCase();
        return pendientes.filter(item =>
            String(item.documento || '').toLowerCase().includes(q) ||
            String(item.concepto || '').toLowerCase().includes(q) ||
            String(item.beneficiario || '').toLowerCase().includes(q) ||
            String(item.tipo || '').toLowerCase().includes(q) ||
            String(item.fecha_display || '').includes(q) ||
            String(item.monto_display || '').includes(q)
        );
    }, [pendientes, searchTerm]);

    const filteredSugerenciasCP = useMemo(() => {
        if (!searchTerm) return sugerenciasControlPagos;
        const q = searchTerm.toLowerCase();
        return sugerenciasControlPagos.filter(item =>
            String(item.descripcion_ref || '').toLowerCase().includes(q) ||
            String(item.ubicacion || '').toLowerCase().includes(q) ||
            String(item.referencia_doc || '').toLowerCase().includes(q) ||
            String(item.metodo_pago || '').toLowerCase().includes(q) ||
            String(item.notas || '').toLowerCase().includes(q) ||
            String(item.monto || '').includes(q)
        );
    }, [sugerenciasControlPagos, searchTerm]);

    // Cargar detalles del modal Períodos & Reaperturas & Auditoría
    const loadPeriodosYAuditoria = useCallback(async () => {
        if (!selectedCuentaId) return;
        setLoadingPeriodos(true);
        try {
            const [perRes, audRes] = await Promise.all([
                api.get('/bancos/conciliacion/periodos', {
                    params: {
                        cuenta_id: selectedCuentaId,
                        all: permFlags.can_approve_reapertura ? '1' : undefined
                    }
                }),
                api.get('/bancos/conciliacion/auditoria', {
                    params: { cuenta_id: selectedCuentaId, limit: 80 }
                })
            ]);
            setPeriodosList(perRes.data?.periodos || []);
            setSolicitudesList(perRes.data?.solicitudes || []);
            setAuditoriaList(audRes.data?.items || []);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar historial de períodos y auditoría', 'error');
        } finally {
            setLoadingPeriodos(false);
        }
    }, [selectedCuentaId, permFlags.can_approve_reapertura, addToast]);

    const handleOpenPeriodosModal = (initialTab = 'PERIODOS') => {
        setPeriodosTab(initialTab);
        setShowPeriodosModal(true);
        loadPeriodosYAuditoria();
    };

    const handleOpenSolicitarReapertura = (periodo = null) => {
        const target = periodo || periodosRecientes.find(p => p.estado === 'CERRADO') || null;
        if (!target) {
            addToast('No hay período cerrado para solicitar reapertura.', 'info');
            return;
        }
        setReaperturaTargetPeriodo(target);
        setReaperturaMotivo('');
        setShowReaperturaModal(true);
    };

    const handleEnviarSolicitudReapertura = async (e) => {
        e.preventDefault();
        if (submitting || !reaperturaTargetPeriodo) return;
        if (reaperturaMotivo.trim().length < 10) {
            addToast('Indique un motivo de al menos 10 caracteres.', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            const res = await api.post(`/bancos/conciliacion/periodos/${reaperturaTargetPeriodo.id}/solicitar-reapertura`, {
                motivo: reaperturaMotivo.trim()
            });
            addToast(res.data?.message || 'Solicitud enviada', 'success');
            setShowReaperturaModal(false);
            fetchData({ preserveSelection: true });
            if (showPeriodosModal) loadPeriodosYAuditoria();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al enviar solicitud de reapertura', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleResolverSolicitud = async (sol, decision) => {
        if (submitting) return;
        const comentario = String(resolucionComentarios[sol.id] || '').trim();
        if (decision === 'RECHAZAR' && comentario.length < 5) {
            addToast('Ingrese un comentario breve explicando el rechazo.', 'warning');
            return;
        }
        const ok = await confirm(
            decision === 'APROBAR'
                ? `¿Autorizar la reapertura del período cerrado al ${sol.fecha_corte_display}?`
                : `¿Rechazar la solicitud de reapertura para el corte ${sol.fecha_corte_display}?`,
            { variant: decision === 'RECHAZAR' ? 'danger' : undefined }
        );
        if (!ok) return;

        setSubmitting(true);
        try {
            const res = await api.post(`/bancos/conciliacion/reaperturas/${sol.id}/resolver`, {
                decision,
                comentario
            });
            addToast(res.data?.message || 'Solicitud procesada', 'success');
            fetchData({ preserveSelection: true });
            loadPeriodosYAuditoria();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al resolver solicitud', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReabrirDirecto = async (periodo) => {
        if (submitting) return;
        const ok = await confirm(`¿Reabrir directamente el período cerrado al ${periodo.fecha_corte_display || periodo.fecha_corte}?`);
        if (!ok) return;

        const motivo = String(resolucionComentarios[`p_${periodo.id}`] || 'Reapertura directa autorizada por administración').trim();
        setSubmitting(true);
        try {
            const res = await api.post(`/bancos/conciliacion/periodos/${periodo.id}/reabrir-directo`, { motivo });
            addToast(res.data?.message || 'Período reabierto', 'success');
            fetchData({ preserveSelection: true });
            loadPeriodosYAuditoria();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al reabrir período', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleVincularControlPago = async (sug, accion) => {
        if (submitting) return;
        if (accion === 'DESCARTAR') {
            const ok = await confirm(`¿Ocultar el pago "${sug.descripcion_ref}" ($${formatMoney(sug.monto)}) de sugerencias de conciliación?`, { variant: 'danger' });
            if (!ok) return;
        } else if (accion === 'CREAR_Y_CONCILIAR') {
            const ok = await confirm(`¿Crear el movimiento bancario por $${formatMoney(sug.monto)} ("${sug.descripcion_ref}") y marcarlo conciliado?`);
            if (!ok) return;
        }
        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/vincular-control-pago', {
                abono_id: sug.id,
                accion,
                movimiento_bancario_id: sug.suggested_match?.id || null,
                origen_tipo: sug.suggested_match?.origen_tipo || 'MOV',
                fecha_aplicado: fechaAplicadoInput || todayStr
            });
            addToast(res.data?.message || 'Actualizado', 'success');
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al procesar sugerencia de Control de Pagos', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleTogglePending = (key) => {
        const next = new Set(selectedPendingKeys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setSelectedPendingKeys(next);
    };

    const handleSelectAllPending = () => {
        if (selectedPendingKeys.size === filteredPendientes.length) {
            setSelectedPendingKeys(new Set());
        } else {
            setSelectedPendingKeys(new Set(filteredPendientes.map(p => p.key)));
        }
    };

    const handleConciliarSeleccionados = async () => {
        if (submitting) return;
        if (selectedPendingKeys.size === 0) {
            addToast('Selecciona al menos un documento pendiente', 'warning');
            return;
        }

        const itemsToApply = pendientes
            .filter(p => selectedPendingKeys.has(p.key))
            .map(p => ({ id: p.id, origen_tipo: p.origen_tipo }));

        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                cuenta_bancaria_id: selectedCuentaId,
                items: itemsToApply,
                fecha_aplicado: fechaAplicadoInput,
                accion: 'CONCILIAR'
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data.message || 'Documentos conciliados con éxito', 'success');
            setSelectedPendingKeys(new Set());
            fetchData({ preserveSelection: false });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al conciliar documentos', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConciliarSingle = async (row) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                cuenta_bancaria_id: selectedCuentaId,
                items: [{ id: row.id, origen_tipo: row.origen_tipo }],
                fecha_aplicado: fechaAplicadoInput || todayStr,
                accion: 'CONCILIAR'
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data?.message || 'Documento conciliado', 'success');
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al conciliar documento', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDesconciliar = async (item) => {
        if (submitting) return;
        const ok = await confirm(
            `¿Estás seguro de desconciliar el documento "${item.documento || item.concepto}"? Volverá a estar pendiente.`,
            { variant: 'danger' }
        );
        if (!ok) return;

        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                cuenta_bancaria_id: selectedCuentaId,
                items: [{ id: item.id, origen_tipo: item.origen_tipo }],
                accion: 'DESCONCILIAR'
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data.message || 'Documento desconciliado', 'success');
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al desconciliar', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleGuardarValidacion = async () => {
        if (submitting) return;
        const montoNum = parseMoneyInput(saldoBancoManual);
        if (cerrarPeriodoCheck && !esDiferenciaCero && !confirmarConDiferencia) {
            addToast('Confirme explícitamente que desea cerrar el período con diferencia.', 'warning');
            return;
        }

        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/validar-saldo', {
                cuenta_bancaria_id: selectedCuentaId,
                monto_banco: montoNum,
                fecha_corte: hasta,
                hasta,
                notas: notasValidacion || `Validación conciliación al ${hasta}`,
                cerrar_periodo: cerrarPeriodoCheck,
                confirmar_con_diferencia: confirmarConDiferencia
            });
            addToast(res.data?.message || 'Validación de saldo registrada correctamente', 'success');
            isSaldoManualDirtyRef.current = false;
            setShowValidationModal(false);
            setCerrarPeriodoCheck(false);
            setConfirmarConDiferencia(false);
            setNotasValidacion('');
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar validación de saldo', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Parsear Extracto Bancario
    const handleParseExtracto = async () => {
        if (!importRawText.trim()) {
            addToast('Ingresa o pega los datos del estado de cuenta', 'warning');
            return;
        }
        setIsParsing(true);
        try {
            const res = await api.post('/bancos/conciliacion/parse-extracto', {
                cuenta_id: selectedCuentaId,
                raw_data: importRawText,
                banco_formato: importBank
            });
            setParsedExtract(res.data);
            setShowDiscardedRows(false);
            // Pre-seleccionar automáticamente solo transacciones válidas que NO son duplicados probables ni tienen alerta de diferencia de monto
            if (res.data.transacciones && res.data.transacciones.length > 0) {
                const autoIdx = res.data.transacciones
                    .map((t, i) => (!t.es_duplicado_probable && t.matchType !== 'ALERTA_DIFERENCIA_MONTO' ? i : -1))
                    .filter(i => i >= 0);
                setSelectedExtractIndices(new Set(autoIdx));
            } else {
                setSelectedExtractIndices(new Set());
            }
            addToast(`Se procesaron ${res.data.total_procesadas} transacciones del extracto`, 'success');
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al procesar extracto bancario', 'error');
        } finally {
            setIsParsing(false);
        }
    };

    const handleToggleSelectExtract = (idx) => {
        const next = new Set(selectedExtractIndices);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        setSelectedExtractIndices(next);
    };

    const handleSelectAllExtract = () => {
        if (!parsedExtract || !parsedExtract.transacciones) return;
        const selectable = parsedExtract.transacciones
            .map((t, i) => (!t.procesado && !t.es_duplicado_probable ? i : -1))
            .filter(i => i >= 0);
        if (selectedExtractIndices.size === selectable.length && selectable.length > 0) {
            setSelectedExtractIndices(new Set());
        } else {
            setSelectedExtractIndices(new Set(selectable));
        }
    };

    // Lectura segura de Excel usando arrayBuffer + cellDates + raw: false
    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setImportFileName(file.name);
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array', cellDates: true });
            const firstSheetName = wb.SheetNames[0];
            const ws = wb.Sheets[firstSheetName];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'dd/mm/yyyy', defval: '' });

            const text = data.map(row => row.map(c => String(c ?? '').replace(/\t/g, ' ')).join('\t')).join('\n');
            setImportRawText(text);
            addToast(`Archivo cargado: ${file.name} (${data.length} filas)`, 'info');
        } catch (err) {
            console.error(err);
            addToast('Error al leer archivo Excel/CSV', 'error');
        }
    };

    const handleRequestCloseImportModal = async () => {
        const hasPendingWork = parsedExtract?.transacciones?.some(t => !t.procesado && !t.es_duplicado_probable);
        if (hasPendingWork) {
            const ok = await confirm('Hay transacciones analizadas del extracto sin procesar. ¿Seguro que desea cerrar y descartar la previsualización?', { variant: 'danger' });
            if (!ok) return;
        }
        setShowImportModal(false);
        setParsedExtract(null);
    };

    // Conciliar automáticamente todas las coincidencias exactas/confirmadas del extracto
    const handleConciliarMatchesExtracto = async () => {
        if (submitting || !parsedExtract || !parsedExtract.transacciones) return;
        const matches = parsedExtract.transacciones
            .filter(t => t.match && t.match.id && !t.procesado && !t.es_duplicado_probable && t.matchType !== 'ALERTA_DIFERENCIA_MONTO')
            .map(t => ({
                id: t.match.id,
                origen_tipo: t.match.origen_tipo,
                fecha_aplicado: t.fecha_ymd || fechaAplicadoInput || todayStr
            }));

        if (matches.length === 0) {
            addToast('No hay coincidencias válidas pendientes para conciliar', 'warning');
            return;
        }

        const ok = await confirm(`¿Deseas conciliar automáticamente las ${matches.length} coincidencias encontradas usando la fecha real de cada transacción del extracto?`);
        if (!ok) return;

        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                cuenta_bancaria_id: selectedCuentaId,
                items: matches,
                fecha_aplicado: fechaAplicadoInput || todayStr,
                accion: 'CONCILIAR'
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data.message || 'Coincidencias conciliadas exitosamente', 'success');
            setShowImportModal(false);
            setParsedExtract(null);
            setImportRawText('');
            setSelectedExtractIndices(new Set());
            fetchData({ preserveSelection: false });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al conciliar coincidencias', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConciliarSingleMatch = async (t, index) => {
        if (submitting || !t.match || t.es_duplicado_probable) return;
        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                cuenta_bancaria_id: selectedCuentaId,
                items: [{
                    id: t.match.id,
                    origen_tipo: t.match.origen_tipo,
                    fecha_aplicado: t.fecha_ymd || fechaAplicadoInput || todayStr
                }],
                fecha_aplicado: t.fecha_ymd || fechaAplicadoInput || todayStr,
                accion: 'CONCILIAR'
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data.message || 'Coincidencia conciliada exitosamente', 'success');
            if (parsedExtract) {
                const updatedTx = [...parsedExtract.transacciones];
                updatedTx[index] = { ...updatedTx[index], procesado: true };
                setParsedExtract({ ...parsedExtract, transacciones: updatedTx });
            }
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al conciliar coincidencia', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenAssignModal = (row, index) => {
        setAssignTargetRow(row);
        setAssignTargetIndex(index !== undefined ? index : null);
        setAssignTab('CREAR');

        let ymdFecha = row?.fecha_ymd || todayStr;
        if (!row?.fecha_ymd && row?.fecha) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)) {
                ymdFecha = row.fecha;
            } else if (row.fecha.includes('/')) {
                const parts = row.fecha.split('/');
                if (parts.length === 3) {
                    const d = parts[0].padStart(2, '0');
                    const m = parts[1].padStart(2, '0');
                    const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                    ymdFecha = `${y}-${m}-${d}`;
                }
            }
        }

        const isCargo = row?.tipo === 'CARGO';
        const matchingOptions = tiposRemesasCuenta.filter(tr => {
            const cod = String(tr.codigo || tr.id || '').toUpperCase().trim();
            const desc = String(tr.descripcion || '').toUpperCase();
            if (isCargo) {
                return cod === 'NC' || cod === 'CH' || cod === '02' || desc.includes('CARGO') || desc.includes('CHEQUE') || desc.includes('DEBITO') || desc.includes('TRANSFER') || desc.includes('TRASLADO') || cod === 'TR' || cod === '04';
            }
            return cod === 'RM' || cod === 'NA' || cod === '01' || cod === '03' || desc.includes('ABONO') || desc.includes('REMESA') || desc.includes('CREDITO') || desc.includes('TRANSFER') || desc.includes('TRASLADO') || cod === 'TR' || cod === '04';
        });
        const fallbackCod = isCargo
            ? (matchingOptions.some(o => (o.codigo || o.id) === 'NC') ? 'NC' : (matchingOptions[0]?.codigo || matchingOptions[0]?.id || 'NC'))
            : (matchingOptions.some(o => (o.codigo || o.id) === 'RM') ? 'RM' : (matchingOptions[0]?.codigo || matchingOptions[0]?.id || 'RM'));

        setAssignFormData({
            tipo: row?.tipo || 'CARGO',
            tipo_remesa_codigo: row?.tipo_remesa_codigo || fallbackCod,
            fecha: ymdFecha,
            fecha_aplicado: ymdFecha || todayStr,
            documento: row?.documento || '',
            concepto: row?.conceptoSugerido || row?.descripcion || '',
            monto: Number(row?.monto || 0),
            aplicar_inmediatamente: true
        });
        setLinkSearchTerm(row?.documento || '');
        setShowAssignModal(true);
    };

    const handleOpenManualCreate = () => {
        setAssignTargetRow(null);
        setAssignTargetIndex(null);
        setAssignTab('CREAR');

        const cargoOptions = tiposRemesasCuenta.filter(tr => {
            const cod = String(tr.codigo || tr.id || '').toUpperCase().trim();
            const desc = String(tr.descripcion || '').toUpperCase();
            return cod === 'NC' || cod === 'CH' || cod === '02' || desc.includes('CARGO') || desc.includes('CHEQUE') || desc.includes('DEBITO') || desc.includes('TRANSFER') || desc.includes('TRASLADO') || cod === 'TR' || cod === '04';
        });
        const initialCod = cargoOptions.some(o => (o.codigo || o.id) === 'NC')
            ? 'NC'
            : (cargoOptions[0]?.codigo || cargoOptions[0]?.id || 'NC');

        setAssignFormData({
            tipo: 'CARGO',
            tipo_remesa_codigo: initialCod,
            fecha: todayStr,
            fecha_aplicado: todayStr,
            documento: '',
            concepto: '',
            monto: '',
            aplicar_inmediatamente: true
        });
        setLinkSearchTerm('');
        setShowAssignModal(true);
    };

    const handleSaveAssignCreate = async (e) => {
        e?.preventDefault();
        if (submitting) return;
        if (!selectedCuentaId) {
            addToast('Selecciona una cuenta bancaria', 'warning');
            return;
        }
        if (Number(assignFormData.monto) <= 0) {
            addToast('El monto debe ser mayor a 0', 'warning');
            return;
        }

        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/crear-y-aplicar', {
                cuenta_bancaria_id: selectedCuentaId,
                ...assignFormData
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data.message || 'Movimiento procesado y guardado', 'success');

            if (parsedExtract && assignTargetIndex !== null) {
                const updatedTx = [...parsedExtract.transacciones];
                updatedTx[assignTargetIndex] = {
                    ...updatedTx[assignTargetIndex],
                    procesado: true,
                    match: {
                        id: res.data.id,
                        origen_tipo: 'MOV',
                        documento: assignFormData.documento,
                        concepto: assignFormData.concepto,
                        monto: assignFormData.monto,
                        fecha: assignFormData.fecha
                    }
                };
                setParsedExtract({ ...parsedExtract, transacciones: updatedTx });
            }

            setShowAssignModal(false);
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al registrar movimiento', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveAssignLink = async (pendingItem) => {
        if (submitting) return;
        if (!pendingItem) {
            addToast('Selecciona un documento pendiente para vincular', 'warning');
            return;
        }
        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/aplicar', {
                cuenta_bancaria_id: selectedCuentaId,
                items: [{
                    id: pendingItem.id,
                    origen_tipo: pendingItem.origen_tipo,
                    fecha_aplicado: assignFormData.fecha_aplicado || assignFormData.fecha || todayStr
                }],
                fecha_aplicado: assignFormData.fecha_aplicado || assignFormData.fecha || todayStr,
                accion: 'CONCILIAR'
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data.message || 'Documento vinculado y conciliado exitosamente', 'success');

            if (parsedExtract && assignTargetIndex !== null) {
                const updatedTx = [...parsedExtract.transacciones];
                updatedTx[assignTargetIndex] = {
                    ...updatedTx[assignTargetIndex],
                    procesado: true,
                    match: {
                        id: pendingItem.id,
                        origen_tipo: pendingItem.origen_tipo,
                        documento: pendingItem.documento,
                        concepto: pendingItem.concepto,
                        beneficiario: pendingItem.beneficiario,
                        monto: pendingItem.monto,
                        fecha: pendingItem.fecha_display
                    }
                };
                setParsedExtract({ ...parsedExtract, transacciones: updatedTx });
            }

            setShowAssignModal(false);
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al vincular documento', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Procesar masivamente en UNA SOLA transacción atómica (coincidencias + nuevos)
    const handleBulkCreateAndApplyExtract = async () => {
        if (submitting || !parsedExtract || !parsedExtract.transacciones) return;
        const selectedItems = parsedExtract.transacciones
            .map((t, idx) => ({ ...t, originalIndex: idx }))
            .filter(t => selectedExtractIndices.has(t.originalIndex) && !t.procesado && !t.es_duplicado_probable);

        if (selectedItems.length === 0) {
            addToast('Selecciona al menos un movimiento válido del extracto para procesar', 'warning');
            return;
        }

        const withMatch = selectedItems.filter(t => t.match && t.matchType !== 'ALERTA_DIFERENCIA_MONTO');
        const withoutMatch = selectedItems.filter(t => !t.match);
        const withDiffAlert = selectedItems.filter(t => t.matchType === 'ALERTA_DIFERENCIA_MONTO');

        if (withDiffAlert.length > 0) {
            addToast(`Hay ${withDiffAlert.length} fila(s) con alerta de diferencia de monto. Revíselas con "Asignar" antes de procesar el lote.`, 'warning');
            return;
        }

        const ok = await confirm(
            `¿Deseas procesar atómicamente ${selectedItems.length} movimientos seleccionados? ` +
            `(${withMatch.length} coincidencias existentes y ${withoutMatch.length} nuevos a crear)`
        );
        if (!ok) return;

        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/crear-masivo-y-aplicar', {
                cuenta_bancaria_id: selectedCuentaId,
                fecha_aplicado_general: fechaAplicadoInput || todayStr,
                aplicar_inmediatamente: true,
                omitir_duplicados: true,
                file_hash: parsedExtract.file_hash,
                archivo_nombre: importFileName || null,
                banco_formato: parsedExtract.banco_formato || importBank,
                saldo_final_extracto: parsedExtract.resumen_extracto?.balance_chain?.saldo_final_extracto ?? null,
                coincidencias_a_aplicar: withMatch.map(t => ({
                    id: t.match.id,
                    origen_tipo: t.match.origen_tipo,
                    fecha_aplicado: t.fecha_ymd || fechaAplicadoInput || todayStr
                })),
                items: withoutMatch.map(t => ({
                    ...t,
                    fecha_aplicado: t.fecha_ymd || fechaAplicadoInput || todayStr
                }))
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });

            addToast(res.data?.message || `Se procesaron ${selectedItems.length} movimientos exitosamente`, 'success');
            setShowImportModal(false);
            setParsedExtract(null);
            setImportRawText('');
            setImportFileName('');
            setSelectedExtractIndices(new Set());
            fetchData({ preserveSelection: false });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al procesar movimientos seleccionados', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredPendientesForLink = useMemo(() => {
        if (!linkSearchTerm) return pendientes;
        const q = linkSearchTerm.toLowerCase();
        return pendientes.filter(p =>
            String(p.documento || '').toLowerCase().includes(q) ||
            String(p.concepto || '').toLowerCase().includes(q) ||
            String(p.beneficiario || '').toLowerCase().includes(q) ||
            String(p.monto_display || '').includes(q)
        );
    }, [pendientes, linkSearchTerm]);

    const handleOpenEdit = (item) => {
        setSelectedItem(item);
        setEditFormData({
            documento: item.documento || '',
            concepto: item.concepto || '',
            fecha: item.fecha_ymd || (item.fecha ? String(item.fecha).split('T')[0] : ''),
            monto: item.monto_display || item.monto || 0,
            version: item.version
        });
        setShowEditModal(true);
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (submitting || !selectedItem) return;
        setSubmitting(true);
        try {
            await api.put(`/bancos/conciliacion/movimiento/${selectedItem.id}`, {
                ...editFormData,
                origen_tipo: selectedItem.origen_tipo
            });
            addToast('Registro actualizado exitosamente', 'success');
            setShowEditModal(false);
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al actualizar', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const exportToExcel = () => {
        const cuentaNom = cuentaInfo ? `${cuentaInfo.banco_nombre}_${cuentaInfo.numero}` : 'Conciliacion';
        if (activeTab === 'CONTROL_PAGOS') {
            if (filteredSugerenciasCP.length === 0) return;
            const formatted = filteredSugerenciasCP.map(s => ({
                'Fecha Pago': s.fecha_pago_display || s.fecha_pago || '',
                'Tipo': s.tipo_operacion || '',
                'Método': s.metodo_pago || '',
                'Descripción': s.descripcion_ref || '',
                'Ubicación': s.ubicacion || '',
                'Beneficiario': s.beneficiario || '',
                'Referencia': s.referencia_doc || '',
                'Monto': Number(s.monto || 0)
            }));
            const ws = XLSX.utils.json_to_sheet(formatted);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'CONTROL_PAGOS');
            XLSX.writeFile(wb, `Conciliacion_ControlPagos_${cuentaNom}_${hasta}.xlsx`);
            addToast('Archivo Excel descargado', 'success');
            return;
        }

        const dataToExport = activeTab === 'MOVIMIENTOS' ? filteredMovimientos : filteredPendientes;
        if (dataToExport.length === 0) return;

        const formatted = dataToExport.map(r => {
            const esCargo = r.origen_tipo === 'CK' || Number(r.cargo || 0) > 0;
            const amt = Number(r.monto_display || 0);
            return {
                'Fecha': r.fecha_display || '',
                'Tipo': r.tipo || '',
                'Documento': r.documento || '',
                'Concepto': r.concepto || '',
                'Beneficiario': r.beneficiario || '',
                'Cargo ($)': esCargo ? amt : 0,
                'Abono ($)': !esCargo ? amt : 0,
                'Fecha Aplicado': r.fecha_aplicado_display || (activeTab === 'MOVIMIENTOS' ? 'Sí' : 'Pendiente')
            };
        });

        const ws = XLSX.utils.json_to_sheet(formatted);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, activeTab);
        XLSX.writeFile(wb, `Conciliacion_${cuentaNom}_${hasta}.xlsx`);
        addToast('Archivo Excel descargado', 'success');
    };

    const exportToPDF = () => {
        const cuentaNom = cuentaInfo ? `${cuentaInfo.banco_nombre}_${cuentaInfo.numero}` : 'Conciliacion';
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });

        if (activeTab === 'CONTROL_PAGOS') {
            if (filteredSugerenciasCP.length === 0) return;
            const title = 'Conciliación Bancaria - Sugerencias de Control de Pagos';
            doc.setFontSize(14);
            doc.text(title, 14, 15);
            doc.setFontSize(9);
            const sub = `Cuenta: ${cuentaInfo?.banco_nombre || ''} - ${cuentaInfo?.numero || ''} | Corte: ${hasta}`;
            doc.text(sub, 14, 22);

            const totalCP = filteredSugerenciasCP.reduce((acc, s) => acc + Number(s.monto || 0), 0);
            autoTable(doc, {
                head: [['FECHA PAGO', 'TIPO / MÉTODO', 'DESCRIPCIÓN', 'BENEFICIARIO', 'REFERENCIA', 'MONTO ($)']],
                body: filteredSugerenciasCP.map(s => [
                    s.fecha_pago_display || s.fecha_pago || '',
                    `${s.tipo_operacion || ''} · ${s.metodo_pago || ''}`,
                    s.descripcion_ref || '',
                    s.beneficiario || '-',
                    s.referencia_doc || '-',
                    `$${formatMoney(s.monto)}`
                ]),
                startY: 28,
                theme: 'striped',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
                foot: [[
                    { content: `TOTAL (${filteredSugerenciasCP.length} registros):`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: `$${formatMoney(totalCP)}`, styles: { halign: 'right', fontStyle: 'bold' } }
                ]],
                didDrawPage: (data) => {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 8, { align: 'right' });
                    doc.text('SIPE Admin - Reporte de Conciliación Bancaria', 14, doc.internal.pageSize.height - 8);
                }
            });
            setPreviewPdfBlob(doc.output('blob'));
            setPreviewTotalPages(doc.internal.getNumberOfPages());
            setPreviewTitle(title);
            setPreviewSubtitle(sub);
            setPreviewFileName(`Conciliacion_ControlPagos_${cuentaNom}_${hasta}.pdf`);
            setShowPdfPreview(true);
            return;
        }

        const dataToExport = activeTab === 'MOVIMIENTOS' ? filteredMovimientos : filteredPendientes;
        if (dataToExport.length === 0) return;

        const title = `Conciliación Bancaria - ${activeTab === 'MOVIMIENTOS' ? 'Movimientos Aplicados' : 'Documentos Pendientes en Tránsito'}`;
        doc.setFontSize(14);
        doc.text(title, 14, 15);

        doc.setFontSize(9);
        const sub = `Cuenta: ${cuentaInfo?.banco_nombre || ''} - ${cuentaInfo?.numero || ''} | Periodo: ${desde} al ${hasta} | Saldo Chequera: $${formatMoney(resumen.saldo_chequera)} | Saldo Conciliado: $${formatMoney(resumen.saldo_conciliado_libros)}`;
        doc.text(sub, 14, 22);

        const tableColumn = ['FECHA', 'TIPO', 'DOCUMENTO', 'CONCEPTO', 'BENEFICIARIO', 'CARGO ($)', 'ABONO ($)', 'APLICADO'];
        let totalCargos = 0;
        let totalAbonos = 0;

        const tableRows = dataToExport.map(r => {
            const esCargo = r.origen_tipo === 'CK' || Number(r.cargo || 0) > 0;
            const amt = Number(r.monto_display || 0);
            if (esCargo) totalCargos += amt;
            else totalAbonos += amt;
            return [
                r.fecha_display || '',
                r.tipo || '',
                r.documento || '',
                r.concepto || '',
                r.beneficiario || '',
                esCargo ? `$${formatMoney(amt)}` : '-',
                !esCargo ? `$${formatMoney(amt)}` : '-',
                r.fecha_aplicado_display || '-'
            ];
        });
        const neto = totalAbonos - totalCargos;

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            theme: 'striped',
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 21 },
                1: { cellWidth: 14, halign: 'center' },
                2: { cellWidth: 26 },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 40 },
                5: { cellWidth: 24, halign: 'right' },
                6: { cellWidth: 24, halign: 'right' },
                7: { cellWidth: 22, halign: 'center' }
            },
            foot: [
                [
                    { content: `TOTALES (${dataToExport.length} registros):`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: `$${formatMoney(totalCargos)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] } },
                    { content: `$${formatMoney(totalAbonos)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] } },
                    { content: `Neto: $${formatMoney(neto)}`, styles: { halign: 'center', fontStyle: 'bold' } }
                ]
            ],
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontSize: 8
            },
            didDrawPage: (data) => {
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.width - 14, doc.internal.pageSize.height - 8, { align: 'right' });
                doc.text('SIPE Admin - Reporte de Conciliación Bancaria', 14, doc.internal.pageSize.height - 8);
            }
        });

        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        const fileName = `Conciliacion_${activeTab}_${cuentaNom}_${hasta}.pdf`;
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewTitle(title);
        setPreviewSubtitle(sub);
        setPreviewFileName(fileName);
        setShowPdfPreview(true);
    };

    const renderTipoBadge = (tipo) => {
        let color = '#3b82f6';
        let bg = 'rgba(59, 130, 246, 0.15)';
        if (tipo === 'CH') { color = '#ef4444'; bg = 'rgba(239, 68, 68, 0.15)'; }
        else if (tipo === 'RM') { color = '#10b981'; bg = 'rgba(16, 185, 129, 0.15)'; }
        else if (tipo === 'NC') { color = '#f59e0b'; bg = 'rgba(245, 158, 11, 0.15)'; }
        else if (tipo === 'NA') { color = '#8b5cf6'; bg = 'rgba(139, 92, 246, 0.15)'; }

        return (
            <span style={{
                color,
                background: bg,
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: '600',
                fontSize: '0.72rem',
                display: 'inline-block'
            }}>
                {tipo || 'MOV'}
            </span>
        );
    };

    // Cálculos dinámicos de conciliación con la ecuación oficial:
    // Saldo Conciliado = Saldo Chequera - Abonos en Tránsito + Cargos/Cheques en Tránsito
    const saldoBancoActual = parseMoneyInput(saldoBancoManual);
    const saldoChequeraActual = Number(resumen.saldo_chequera || 0);
    const saldoConciliadoLibros = Number(resumen.saldo_conciliado_libros ?? saldoChequeraActual);
    const abonosEnTransito = Number(resumen.abonos_en_transito || 0);
    const cargosChequesEnTransito = Number(resumen.cargos_cheques_en_transito || 0);
    const diferenciaActual = Number((saldoBancoActual - saldoConciliadoLibros).toFixed(2));
    const esDiferenciaCero = Math.abs(diferenciaActual) < 0.009;
    const isRangeClosed = Boolean(resumen.periodo_cerrado_hasta && hasta && hasta <= resumen.periodo_cerrado_hasta);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* 1. Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ padding: '0.45rem', background: 'rgba(37, 99, 235, 0.1)', borderRadius: '8px', color: 'var(--primary)' }}>
                        <Scale size={22} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Conciliación Bancaria</h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Conciliación de cuentas, partidas en tránsito, cierres de período y cruce de extractos.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        onClick={handleOpenManualCreate}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.825rem' }}
                    >
                        <Plus size={15} /> Nuevo Movimiento
                    </button>
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', height: '36px', fontSize: '0.825rem' }}
                    >
                        <UploadCloud size={16} /> Importar Extracto
                    </button>
                    <button
                        onClick={() => handleOpenPeriodosModal(solicitudesPendientes.length > 0 ? 'SOLICITUDES' : 'PERIODOS')}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.825rem', position: 'relative' }}
                        title="Cierres de período, solicitudes de reapertura y auditoría bancaria"
                    >
                        <History size={15} /> Períodos y Auditoría
                        {solicitudesPendientes.length > 0 && (
                            <span style={{
                                background: '#f59e0b',
                                color: '#0f172a',
                                borderRadius: '999px',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '0.05rem 0.4rem'
                            }}>
                                {solicitudesPendientes.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={exportToExcel}
                        className="btn-secondary"
                        title="Exportar a Excel"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.825rem' }}
                    >
                        <FileSpreadsheet size={15} /> Excel
                    </button>
                    <button
                        onClick={exportToPDF}
                        className="btn-secondary"
                        title="Vista previa e impresión en tamaño Carta"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.825rem' }}
                    >
                        <Printer size={15} /> Vista Previa / PDF
                    </button>
                    <button
                        onClick={() => fetchData({ preserveSelection: true })}
                        disabled={loading}
                        className="btn-secondary"
                        title="Recargar datos"
                        style={{ height: '36px', padding: '0 0.65rem' }}
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* 2. Barra de Filtros de Cuenta y Periodo */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 190px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Building2 size={14} /> Contribuyente / Empresa:
                        </label>
                        <select
                            value={selectedEmpresa}
                            onChange={handleEmpresaChange}
                            style={{ width: '100%', height: '36px', borderRadius: 'var(--border-radius)', padding: '0 0.5rem', fontSize: '0.825rem' }}
                        >
                            <option value="">-- Todas las Empresas --</option>
                            {empresas.map(e => (
                                <option key={e.codigo || e.id} value={e.codigo}>{e.nombre}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: '2 1 300px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Landmark size={14} /> Cuenta Bancaria:
                        </label>
                        <select
                            value={selectedCuentaId}
                            onChange={(e) => { isSaldoManualDirtyRef.current = false; setSelectedCuentaId(e.target.value); }}
                            style={{ width: '100%', height: '36px', borderRadius: 'var(--border-radius)', padding: '0 0.5rem', fontWeight: '500', fontSize: '0.825rem' }}
                        >
                            {sortCuentas(cuentasFiltradas).map(c => (
                                <option key={c.id} value={c.id}>
                                    {formatCuentaLabel(c)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: '1 1 150px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Clock size={14} /> Periodo:
                        </label>
                        <select
                            value={periodoPreset}
                            onChange={(e) => handlePeriodoPresetChange(e.target.value)}
                            style={{ width: '100%', height: '36px', borderRadius: 'var(--border-radius)', padding: '0 0.5rem', fontWeight: '500', fontSize: '0.825rem' }}
                        >
                            <option value="este_mes">Este Mes (Actual)</option>
                            <option value="ultimos_30_dias">Últimos 30 Días</option>
                            <option value="ultimos_3_meses">Últimos 3 Meses</option>
                            <option value="mes_anterior">Mes Anterior</option>
                            <option value="hoy">Hoy</option>
                            <option value="ayer">Ayer</option>
                            <option value="anio_actual">Año Actual</option>
                            <option value="custom">Personalizado</option>
                        </select>
                    </div>

                    <div style={{ width: '138px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Calendar size={14} /> Desde:
                        </label>
                        <input
                            type="date"
                            value={desde}
                            onChange={e => { setDesde(e.target.value); setPeriodoPreset('custom'); }}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>

                    <div style={{ width: '138px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Calendar size={14} /> Hasta:
                        </label>
                        <input
                            type="date"
                            value={hasta}
                            onChange={e => { setHasta(e.target.value); setPeriodoPreset('custom'); }}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                            onClick={() => fetchData({ preserveSelection: true })}
                            className="btn-primary"
                            style={{ height: '36px', padding: '0 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}
                        >
                            <Filter size={15} /> Filtrar
                        </button>
                    </div>
                </div>
            </div>

            {/* 3. Banner Superior: ÚLTIMA VALIDACIÓN + ESTADO DE PERÍODO CERRADO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{
                    background: esDiferenciaCero && resumen.ultima_validacion
                        ? 'linear-gradient(90deg, #059669 0%, #047857 100%)'
                        : 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)',
                    color: '#ffffff',
                    padding: '0.55rem 1.15rem',
                    borderRadius: 'var(--border-radius)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    fontWeight: '700',
                    letterSpacing: '0.3px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
                        {esDiferenciaCero && resumen.ultima_validacion ? <ShieldCheck size={18} /> : <AlertCircle size={18} />}
                        <span>
                            {resumen.ultima_validacion ? (
                                <>ÚLTIMA VALIDACIÓN: {formatSvDateTime(resumen.ultima_validacion.fecha_validacion)}</>
                            ) : (
                                'ÚLTIMA VALIDACIÓN: SIN REGISTRO PREVIO'
                            )}
                        </span>
                    </div>
                    <div style={{ fontSize: '0.95rem', background: 'rgba(0,0,0,0.25)', padding: '0.18rem 0.75rem', borderRadius: '4px' }}>
                        BANCO VALIDADO: {resumen.ultima_validacion ? `$${formatMoney(resumen.ultima_validacion.monto_banco)}` : '$0.00'}
                    </div>
                </div>

                {resumen.periodo_cerrado_hasta && (
                    <div style={{
                        background: isRangeClosed ? 'rgba(245, 158, 11, 0.14)' : 'rgba(59, 130, 246, 0.1)',
                        border: `1px solid ${isRangeClosed ? 'rgba(245, 158, 11, 0.45)' : 'rgba(59, 130, 246, 0.3)'}`,
                        padding: '0.55rem 1rem',
                        borderRadius: 'var(--border-radius)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        fontSize: '0.82rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isRangeClosed ? '#fbbf24' : '#93c5fd' }}>
                            <Lock size={15} />
                            <span>
                                <strong>Período Cerrado hasta {resumen.periodo_cerrado_hasta}</strong>.
                                {isRangeClosed
                                    ? ' Las modificaciones, conciliaciones o eliminaciones con fecha igual o anterior están bloqueadas.'
                                    : ' Los movimientos posteriores a esa fecha están abiertos para conciliación.'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => handleOpenSolicitarReapertura(null)}
                                className="btn-secondary"
                                style={{ height: '30px', padding: '0 0.75rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Unlock size={13} /> Solicitar Reapertura
                            </button>
                            {permFlags.can_approve_reapertura && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenPeriodosModal('PERIODOS')}
                                    className="btn-primary"
                                    style={{ height: '30px', padding: '0 0.75rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                    <ShieldCheck size={13} /> Gestionar / Reabrir
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 4. Selector de Pestañas & Búsqueda */}
            <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => { setActiveTab('MOVIMIENTOS'); setSelectedPendingKeys(new Set()); }}
                        className={activeTab === 'MOVIMIENTOS' ? 'btn-primary' : 'btn-secondary'}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', height: '36px', padding: '0 1rem', fontWeight: '600', fontSize: '0.82rem' }}
                    >
                        <CheckCircle2 size={15} /> MOVIMIENTOS ({filteredMovimientos.length})
                    </button>

                    <button
                        onClick={() => { setActiveTab('PENDIENTES'); }}
                        className={activeTab === 'PENDIENTES' ? 'btn-primary' : 'btn-secondary'}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', height: '36px', padding: '0 1rem', fontWeight: '600', fontSize: '0.82rem' }}
                    >
                        <ArrowRightLeft size={15} /> PENDIENTES ({filteredPendientes.length})
                    </button>

                    <button
                        onClick={() => { setActiveTab('CONTROL_PAGOS'); setSelectedPendingKeys(new Set()); }}
                        className={activeTab === 'CONTROL_PAGOS' ? 'btn-primary' : 'btn-secondary'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            height: '36px',
                            padding: '0 1rem',
                            fontWeight: '600',
                            fontSize: '0.82rem',
                            borderColor: filteredSugerenciasCP.length > 0 && activeTab !== 'CONTROL_PAGOS' ? 'rgba(56, 189, 248, 0.5)' : undefined
                        }}
                        title="Pagos bancarios registrados en Control de Pagos listos para conciliar"
                    >
                        <Check size={15} /> CONTROL PAGOS ({filteredSugerenciasCP.length})
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', minWidth: '220px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar en la tabla..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ width: '100%', height: '36px', paddingLeft: '30px', fontSize: '0.825rem' }}
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', color: 'var(--text-muted)' }}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {activeTab === 'PENDIENTES' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fecha Aplicado:</span>
                            <input
                                type="date"
                                value={fechaAplicadoInput}
                                onChange={e => setFechaAplicadoInput(e.target.value)}
                                style={{ height: '32px', fontSize: '0.82rem' }}
                            />
                            <button
                                onClick={handleConciliarSeleccionados}
                                disabled={selectedPendingKeys.size === 0 || submitting}
                                className="btn-primary"
                                style={{ height: '32px', padding: '0 0.8rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Check size={14} /> {submitting ? 'Procesando...' : `CONCILIAR (${selectedPendingKeys.size})`}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* 5. Tabla de Datos */}
            {activeTab === 'CONTROL_PAGOS' ? (
                <div className="card glass table-responsive" style={{ padding: 0 }}>
                    <table style={{ minWidth: '960px', width: '100%', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Fecha Pago</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Tipo / Método</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Concepto / Ubicación</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Ref. / Doc</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Monto</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Coincidencia Sugerida</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSugerenciasCP.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        No hay pagos bancarios pendientes de conciliar desde Control de Pagos para esta cuenta.
                                    </td>
                                </tr>
                            ) : filteredSugerenciasCP.map(sug => (
                                <tr key={sug.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{sug.fecha_pago_display || sug.fecha_pago}</td>
                                    <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                        <span style={{
                                            padding: '0.15rem 0.45rem',
                                            borderRadius: '5px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            backgroundColor: sug.tipo_operacion === 'CXC' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(99, 102, 241, 0.18)',
                                            color: sug.tipo_operacion === 'CXC' ? '#34d399' : '#c7d2fe'
                                        }}>
                                            {sug.tipo_operacion} · {sug.metodo_pago}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>
                                        <div style={{ fontWeight: 700 }}>{sug.descripcion_ref || 'Pago'}</div>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            {sug.ubicacion || 'General'}
                                            {sug.beneficiario ? ` · A favor de: ${sug.beneficiario}` : ''}
                                            {sug.notas ? ` · ${sug.notas}` : ''}
                                            {sug.comprobantes_count > 0 && sug.comprobante_url && (
                                                <> · <a href={sug.comprobante_url} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8' }}>Ver comprobante ({sug.comprobantes_count})</a></>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>{sug.referencia_doc || '—'}</td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, color: sug.tipo_operacion === 'CXC' ? '#34d399' : '#f87171', whiteSpace: 'nowrap' }}>
                                        {sug.tipo_operacion === 'CXC' ? '+' : '-'}${formatMoney(sug.monto)}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem' }}>
                                        {sug.suggested_match ? (
                                            <div style={{ color: '#6ee7b7' }}>
                                                <strong>{sug.suggested_match.origen_tipo} #{sug.suggested_match.documento || sug.suggested_match.id}</strong> · {sug.suggested_match.fecha_display}
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{sug.suggested_match.concepto}</div>
                                            </div>
                                        ) : (
                                            <span style={{ color: 'var(--text-muted)' }}>Sin movimiento en chequera aún</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                                            {sug.suggested_match ? (
                                                <button
                                                    type="button"
                                                    disabled={submitting}
                                                    className="btn-primary"
                                                    style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.72rem' }}
                                                    onClick={() => handleVincularControlPago(sug, 'VINCULAR')}
                                                >
                                                    Vincular y Conciliar
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={submitting}
                                                    className="btn-primary"
                                                    style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.72rem' }}
                                                    onClick={() => handleVincularControlPago(sug, 'CREAR_Y_CONCILIAR')}
                                                >
                                                    Crear Mov. y Conciliar
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                disabled={submitting}
                                                className="btn-secondary"
                                                style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.72rem' }}
                                                onClick={() => handleVincularControlPago(sug, 'DESCARTAR')}
                                                title="Descartar sugerencia"
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="card glass table-responsive" style={{ padding: 0 }}>
                    <table style={{ minWidth: '950px', width: '100%', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                {activeTab === 'PENDIENTES' && (
                                    <th style={{ width: '40px', textAlign: 'center', padding: '0.45rem 0.5rem' }}>
                                        <button
                                            onClick={handleSelectAllPending}
                                            style={{ background: 'none', color: 'var(--primary)', padding: 0 }}
                                            title="Seleccionar / Deseleccionar todos"
                                        >
                                            {selectedPendingKeys.size > 0 && selectedPendingKeys.size === filteredPendientes.length ? (
                                                <CheckSquare size={16} />
                                            ) : (
                                                <Square size={16} />
                                            )}
                                        </button>
                                    </th>
                                )}
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>FECHA</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>TIPO</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>DOCUMENTO</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>CONCEPTO</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>BENEFICIARIO</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>MONTO</th>
                                {activeTab === 'MOVIMIENTOS' && (
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>APLICADO</th>
                                )}
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                        <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
                                        Cargando registros de conciliación...
                                    </td>
                                </tr>
                            ) : (activeTab === 'MOVIMIENTOS' ? filteredMovimientos : filteredPendientes).length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                                        No se encontraron {activeTab === 'MOVIMIENTOS' ? 'movimientos conciliados' : 'documentos pendientes'} en el periodo seleccionado.
                                    </td>
                                </tr>
                            ) : (
                                (activeTab === 'MOVIMIENTOS' ? filteredMovimientos : filteredPendientes).map((row, idx) => {
                                    const isSelected = selectedPendingKeys.has(row.key);
                                    const isRowClosed = Boolean(
                                        resumen.periodo_cerrado_hasta &&
                                        ((row.fecha_aplicado_ymd && row.fecha_aplicado_ymd <= resumen.periodo_cerrado_hasta) ||
                                         (row.fecha_ymd && row.fecha_ymd <= resumen.periodo_cerrado_hasta && activeTab === 'MOVIMIENTOS'))
                                    );
                                    return (
                                        <tr
                                            key={row.key || idx}
                                            style={{
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                background: isSelected ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            {activeTab === 'PENDIENTES' && (
                                                <td style={{ textAlign: 'center', padding: '0.45rem 0.5rem' }}>
                                                    <button
                                                        onClick={() => handleTogglePending(row.key)}
                                                        style={{ background: 'none', color: isSelected ? 'var(--primary)' : 'var(--text-muted)', padding: 0 }}
                                                    >
                                                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                                    </button>
                                                </td>
                                            )}
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: '500' }}>
                                                {row.fecha_display || '-'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                {renderTipoBadge(row.tipo)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontFamily: 'monospace', fontWeight: '600' }}>
                                                {row.documento || '-'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.concepto}>
                                                {row.concepto || '-'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-muted)' }} title={row.beneficiario}>
                                                {row.beneficiario || '-'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: '700', color: row.origen_tipo === 'CK' || Number(row.cargo) > 0 ? '#ef4444' : '#10b981' }}>
                                                ${formatMoney(row.monto_display)}
                                            </td>
                                            {activeTab === 'MOVIMIENTOS' && (
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', color: '#10b981', fontWeight: '500' }}>
                                                    {row.fecha_aplicado_display || '-'}
                                                </td>
                                            )}
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', alignItems: 'center' }}>
                                                    <button
                                                        onClick={() => { setSelectedItem(row); setShowDetailModal(true); }}
                                                        className="icon-btn"
                                                        title="Ver detalle del documento"
                                                        style={{ padding: '4px' }}
                                                    >
                                                        <Eye size={15} />
                                                    </button>
                                                    {!row.es_contabilizado && !isRowClosed ? (
                                                        <button
                                                            onClick={() => handleOpenEdit(row)}
                                                            className="icon-btn"
                                                            title="Editar documento / concepto"
                                                            style={{ padding: '4px' }}
                                                        >
                                                            <Edit2 size={15} />
                                                        </button>
                                                    ) : (
                                                        <span title={row.es_contabilizado ? 'Contabilizado' : 'Período cerrado'} style={{ color: 'var(--text-muted)', padding: '4px' }}>
                                                            <Lock size={14} />
                                                        </span>
                                                    )}
                                                    {activeTab === 'MOVIMIENTOS' ? (
                                                        !isRowClosed && (
                                                            <button
                                                                onClick={() => handleDesconciliar(row)}
                                                                disabled={submitting}
                                                                className="icon-btn"
                                                                title="Desconciliar documento"
                                                                style={{ padding: '4px', color: '#ef4444' }}
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        )
                                                    ) : (
                                                        <button
                                                            onClick={() => handleConciliarSingle(row)}
                                                            disabled={submitting}
                                                            className="icon-btn"
                                                            title="Conciliar individualmente"
                                                            style={{ padding: '4px', color: '#10b981' }}
                                                        >
                                                            <Check size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 6. Barra Inferior de Totales y Ecuación de Conciliación Oficial */}
            <div className="card glass" style={{
                padding: '1rem 1.25rem',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1.15rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Saldo en Banco */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.85rem', letterSpacing: '0.3px' }}>*SALDO EN BANCO</span>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: 'var(--text-muted)' }}>$</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={saldoBancoManual}
                                    onChange={e => {
                                        isSaldoManualDirtyRef.current = true;
                                        setSaldoBancoManual(e.target.value);
                                    }}
                                    style={{
                                        width: '145px',
                                        height: '38px',
                                        paddingLeft: '22px',
                                        fontWeight: '700',
                                        fontSize: '0.98rem',
                                        textAlign: 'right',
                                        background: 'rgba(0,0,0,0.25)',
                                        border: '2px solid rgba(59, 130, 246, 0.4)'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Saldo Conciliado en Libros */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.85rem', letterSpacing: '0.3px' }}>SALDO CONCILIADO</span>
                            <div style={{
                                minWidth: '140px',
                                height: '38px',
                                padding: '0 0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                fontWeight: '700',
                                fontSize: '0.98rem',
                                background: 'rgba(0,0,0,0.25)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--border-radius)'
                            }}>
                                ${formatMoney(saldoConciliadoLibros)}
                            </div>
                        </div>

                        {/* Diferencia Real */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.85rem', letterSpacing: '0.3px' }}>DIF REAL</span>
                            <div style={{
                                minWidth: '125px',
                                height: '38px',
                                padding: '0 0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                fontWeight: '800',
                                fontSize: '0.98rem',
                                background: esDiferenciaCero ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                border: `2px solid ${esDiferenciaCero ? '#10b981' : '#ef4444'}`,
                                color: esDiferenciaCero ? '#10b981' : '#ef4444',
                                borderRadius: 'var(--border-radius)'
                            }}>
                                ${formatMoney(diferenciaActual)}
                            </div>
                            {esDiferenciaCero && (
                                <span title="¡Conciliado perfectamente al centavo!" style={{ color: '#10b981' }}>
                                    <CheckCircle2 size={22} />
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => {
                                setCerrarPeriodoCheck(false);
                                setConfirmarConDiferencia(false);
                                setNotasValidacion(`Validación conciliación al ${hasta}`);
                                setShowValidationModal(true);
                            }}
                            className="btn-primary"
                            style={{
                                height: '38px',
                                padding: '0 1.25rem',
                                fontWeight: '700',
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                            }}
                        >
                            <CheckSquare size={17} /> PROCESAR Y GUARDAR
                        </button>
                    </div>
                </div>

                {/* Desglose transparente de partidas en tránsito */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.85rem',
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    paddingTop: '0.6rem',
                    alignItems: 'center'
                }}>
                    <span>
                        Saldo en Chequera (Libros): <strong style={{ color: 'var(--text)' }}>${formatMoney(saldoChequeraActual)}</strong>
                    </span>
                    <span>−</span>
                    <span>
                        Abonos en Tránsito: <strong style={{ color: '#10b981' }}>${formatMoney(abonosEnTransito)}</strong>
                    </span>
                    <span>+</span>
                    <span>
                        Cheques y Cargos en Tránsito: <strong style={{ color: '#f59e0b' }}>${formatMoney(cargosChequesEnTransito)}</strong>
                    </span>
                    <span>=</span>
                    <span>
                        Saldo Conciliado: <strong style={{ color: 'var(--primary)' }}>${formatMoney(saldoConciliadoLibros)}</strong>
                    </span>
                    {Number(resumen.saldo_inicial || 0) !== 0 && (
                        <span style={{ marginLeft: 'auto', color: '#93c5fd' }}>
                            Saldo Inicial: <strong>${formatMoney(resumen.saldo_inicial)}</strong>
                            {resumen.fecha_saldo_inicial ? ` (desde ${resumen.fecha_saldo_inicial})` : ''}
                        </span>
                    )}
                    {Number(resumen.cheques_reservados_count || 0) > 0 && (
                        <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <AlertTriangle size={13} />
                            {resumen.cheques_reservados_count} cheque(s) retenido(s)/reservado(s) excluidos (${formatMoney(resumen.cheques_reservados_monto)})
                        </span>
                    )}
                </div>
            </div>

            {/* ── MODAL 1: IMPORTADOR DE EXTRACTO BANCARIO MULTIBANCO ── */}
            <Modal
                open={showImportModal}
                onClose={handleRequestCloseImportModal}
                title="Importar Extracto Bancario Multibanco"
                size="xl"
                footer={(
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                            {parsedExtract && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Total: <strong>{parsedExtract.total_procesadas}</strong> |{' '}
                                    Coincidencias: <strong style={{ color: '#10b981' }}>{parsedExtract.transacciones.filter(t => t.match && !t.procesado && !t.es_duplicado_probable).length}</strong> |{' '}
                                    Duplicados: <strong style={{ color: '#f59e0b' }}>{parsedExtract.resumen_extracto?.duplicados_probables || 0}</strong> |{' '}
                                    Seleccionados: <strong>{selectedExtractIndices.size}</strong>
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                            <button onClick={handleRequestCloseImportModal} className="btn-secondary" disabled={submitting}>
                                Cerrar
                            </button>
                            {parsedExtract && parsedExtract.transacciones && (
                                <>
                                    {selectedExtractIndices.size > 0 && (
                                        <button
                                            onClick={handleBulkCreateAndApplyExtract}
                                            disabled={submitting}
                                            className="btn-primary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' }}
                                        >
                                            <Plus size={15} /> {submitting ? 'Procesando lote...' : `Procesar Seleccionados (${selectedExtractIndices.size})`}
                                        </button>
                                    )}
                                    {parsedExtract.transacciones.filter(t => t.match && !t.procesado && !t.es_duplicado_probable && t.matchType !== 'ALERTA_DIFERENCIA_MONTO').length > 0 && (
                                        <button
                                            onClick={handleConciliarMatchesExtracto}
                                            disabled={submitting}
                                            className="btn-primary"
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: '#10b981' }}
                                        >
                                            <Sparkles size={15} /> Conciliar Coincidencias ({parsedExtract.transacciones.filter(t => t.match && !t.procesado && !t.es_duplicado_probable && t.matchType !== 'ALERTA_DIFERENCIA_MONTO').length})
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: 'var(--border-radius)' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Formato del Banco:</label>
                            <select
                                value={importBank}
                                onChange={e => setImportBank(e.target.value)}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                            >
                                <option value="AUTO">-- Auto Detección Inteligente --</option>
                                <option value="PROMERICA">Banco Promerica</option>
                                <option value="BAC">BAC Credomatic</option>
                                <option value="DAVIVIENDA">Banco Davivienda</option>
                                <option value="HIPOTECARIO">Banco Hipotecario</option>
                                <option value="CUSCATLAN">Banco Cuscatlán</option>
                                <option value="AGRICOLA">Banco Agrícola</option>
                                <option value="ATLANTIDA">Banco Atlántida</option>
                                <option value="ABANK">Banco Abank / Constelación</option>
                            </select>
                        </div>

                        <div style={{ flex: '1 1 240px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Cargar Archivo Excel / CSV:</label>
                            <input
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleFileUpload}
                                style={{ width: '100%', fontSize: '0.8rem' }}
                            />
                        </div>

                        <div style={{ alignSelf: 'flex-end' }}>
                            <button
                                onClick={handleParseExtracto}
                                disabled={isParsing || !importRawText.trim()}
                                className="btn-primary"
                                style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}
                            >
                                {isParsing ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
                                Analizar Extracto
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                            O pega directamente aquí las filas copiadas de tu Excel o Banca en Línea:
                        </label>
                        <textarea
                            rows={4}
                            placeholder="Pega aquí las filas copiadas (Ctrl+V)... Ejemplo: 28/08/2026   10004567   REMESA CUENTA CORRIENTE SERSAPROSA   $250.00"
                            value={importRawText}
                            onChange={e => setImportRawText(e.target.value)}
                            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem', padding: '0.5rem' }}
                        />
                    </div>

                    {parsedExtract && parsedExtract.transacciones && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {/* Diagnóstico del extracto */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--border-radius)', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)', fontSize: '0.76rem', alignItems: 'center' }}>
                                <span>Cargos Extracto: <strong style={{ color: '#ef4444' }}>${formatMoney(parsedExtract.resumen_extracto?.total_cargos)}</strong></span>
                                <span>·</span>
                                <span>Abonos Extracto: <strong style={{ color: '#10b981' }}>${formatMoney(parsedExtract.resumen_extracto?.total_abonos)}</strong></span>
                                {parsedExtract.resumen_extracto?.balance_chain?.verificada && (
                                    <>
                                        <span>·</span>
                                        <span style={{ color: parsedExtract.resumen_extracto.balance_chain.inconsistencias > 0 ? '#f59e0b' : '#34d399' }}>
                                            Cadena de saldos ({parsedExtract.resumen_extracto.balance_chain.orden}): {parsedExtract.resumen_extracto.balance_chain.inconsistencias === 0 ? 'Verificada ✓' : `${parsedExtract.resumen_extracto.balance_chain.inconsistencias} alerta(s)`}
                                            {parsedExtract.resumen_extracto.balance_chain.saldo_final_extracto !== null && ` · Saldo final: $${formatMoney(parsedExtract.resumen_extracto.balance_chain.saldo_final_extracto)}`}
                                        </span>
                                    </>
                                )}
                                {parsedExtract.extracto_ya_importado && (
                                    <span style={{ color: '#fbbf24', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <AlertTriangle size={14} /> Este archivo ya fue importado anteriormente ({formatSvDateTime(parsedExtract.extracto_ya_importado.created_at)})
                                    </span>
                                )}
                                {parsedExtract.filas_descartadas?.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowDiscardedRows(v => !v)}
                                        className="btn-secondary"
                                        style={{ marginLeft: 'auto', height: '24px', padding: '0 0.5rem', fontSize: '0.72rem' }}
                                    >
                                        {showDiscardedRows ? 'Ocultar' : 'Ver'} {parsedExtract.filas_descartadas.length} fila(s) omitida(s)
                                    </button>
                                )}
                            </div>

                            {showDiscardedRows && parsedExtract.filas_descartadas?.length > 0 && (
                                <div style={{ maxHeight: '110px', overflowY: 'auto', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.72rem' }}>
                                    {parsedExtract.filas_descartadas.map((fd, idx) => (
                                        <div key={idx}>Fila {fd.fila}: <strong>{fd.motivo}</strong> — {fd.contenido}</div>
                                    ))}
                                </div>
                            )}

                            <div className="table-responsive" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                                <table style={{ minWidth: '950px', width: '100%', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                                            <th style={{ width: '36px', textAlign: 'center', padding: '6px 4px' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleSelectAllExtract}
                                                    style={{ background: 'none', color: 'var(--primary)', padding: 0 }}
                                                    title="Seleccionar / Deseleccionar todos"
                                                >
                                                    <CheckSquare size={15} />
                                                </button>
                                            </th>
                                            <th style={{ padding: '6px' }}>FECHA</th>
                                            <th style={{ padding: '6px' }}>DOC</th>
                                            <th style={{ padding: '6px' }}>DESCRIPCIÓN EXTRACTO</th>
                                            <th style={{ padding: '6px', textAlign: 'right' }}>MONTO</th>
                                            <th style={{ padding: '6px', textAlign: 'center' }}>TIPO</th>
                                            <th style={{ padding: '6px' }}>ESTADO DE CRUCE</th>
                                            <th style={{ padding: '6px', textAlign: 'center' }}>ACCIÓN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedExtract.transacciones.map((t, idx) => {
                                            const hasMatch = Boolean(t.match);
                                            const isSelected = selectedExtractIndices.has(idx);
                                            const isDup = Boolean(t.es_duplicado_probable);
                                            const isDiffAlert = t.matchType === 'ALERTA_DIFERENCIA_MONTO';

                                            return (
                                                <tr
                                                    key={idx}
                                                    style={{
                                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                        background: t.procesado
                                                            ? 'rgba(16, 185, 129, 0.12)'
                                                            : isDup
                                                                ? 'rgba(245, 158, 11, 0.08)'
                                                                : isDiffAlert
                                                                    ? 'rgba(239, 68, 68, 0.08)'
                                                                    : hasMatch
                                                                        ? 'rgba(16, 185, 129, 0.06)'
                                                                        : isSelected
                                                                            ? 'rgba(37, 99, 235, 0.05)'
                                                                            : 'transparent'
                                                    }}
                                                >
                                                    <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                                                        <button
                                                            type="button"
                                                            disabled={t.procesado || isDup}
                                                            onClick={() => handleToggleSelectExtract(idx)}
                                                            style={{ background: 'none', color: isSelected ? 'var(--primary)' : 'var(--text-muted)', padding: 0, opacity: (t.procesado || isDup) ? 0.35 : 1 }}
                                                        >
                                                            {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                                                        </button>
                                                    </td>
                                                    <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>{t.fecha}</td>
                                                    <td style={{ padding: '6px', fontFamily: 'monospace', fontWeight: '600' }}>{t.documento || '-'}</td>
                                                    <td style={{ padding: '6px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.descripcion}>
                                                        <div style={{ fontWeight: '500' }}>{t.descripcion}</div>
                                                        {t.conceptoSugerido && t.conceptoSugerido !== t.descripcion && (
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--primary)', opacity: 0.9 }}>
                                                                ↳ {t.conceptoSugerido}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: t.tipo === 'CARGO' ? '#ef4444' : '#10b981', whiteSpace: 'nowrap' }}>
                                                        ${formatMoney(t.monto)}
                                                    </td>
                                                    <td style={{ padding: '6px', textAlign: 'center' }}>
                                                        {renderTipoBadge(t.tipo_remesa_codigo || (t.tipo === 'CARGO' ? 'NC' : 'RM'))}
                                                    </td>
                                                    <td style={{ padding: '6px' }}>
                                                        {t.procesado ? (
                                                            <span style={{ color: '#10b981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                <CheckCircle2 size={14} /> Conciliado en esta sesión
                                                            </span>
                                                        ) : isDup ? (
                                                            <span style={{ color: '#fbbf24', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                <AlertTriangle size={14} /> Ya conciliado previamente ({t.match?.origen_tipo} #{t.match?.documento || t.match?.id})
                                                            </span>
                                                        ) : isDiffAlert ? (
                                                            <span style={{ color: '#ef4444', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                <AlertCircle size={14} /> Doc coincide pero difiere por ${formatMoney(t.diferencia_monto)}
                                                            </span>
                                                        ) : hasMatch ? (
                                                            <span style={{ color: '#10b981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                                <CheckCircle2 size={14} /> Cruce ({t.matchType}) con {t.match.origen_tipo === 'CK' ? 'Cheque' : 'Mov'} #{t.match.documento}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Nuevo (sin coincidencia)</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '6px', textAlign: 'center' }}>
                                                        {t.procesado ? (
                                                            <span style={{ color: '#10b981', fontWeight: '700', fontSize: '0.78rem' }}>✓ Listo</span>
                                                        ) : isDup ? (
                                                            <span style={{ color: '#fbbf24', fontSize: '0.72rem' }}>Omitido</span>
                                                        ) : hasMatch && !isDiffAlert ? (
                                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                                <button
                                                                    type="button"
                                                                    disabled={submitting}
                                                                    onClick={() => handleConciliarSingleMatch(t, idx)}
                                                                    className="btn-primary"
                                                                    style={{ padding: '3px 8px', fontSize: '0.72rem', background: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}
                                                                    title="Conciliar coincidencia encontrada"
                                                                >
                                                                    <Check size={13} /> Conciliar
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenAssignModal(t, idx)}
                                                                    className="btn-secondary"
                                                                    style={{ padding: '3px 6px', fontSize: '0.72rem' }}
                                                                    title="Cambiar asignación o crear nuevo"
                                                                >
                                                                    <Edit2 size={13} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenAssignModal(t, idx)}
                                                                className="btn-primary"
                                                                style={{ padding: '4px 10px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <Plus size={13} /> Asignar
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* ── MODAL 2: VISOR DE DETALLE DE DOCUMENTO ── */}
            <Modal
                open={showDetailModal}
                onClose={() => setShowDetailModal(false)}
                title={`Detalle de ${selectedItem?.origen_tipo === 'CK' ? 'Cheque' : 'Movimiento Bancario'}`}
                size="md"
            >
                {selectedItem && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.88rem' }}>
                        <div className="form-grid form-grid-2">
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Tipo de Documento:</span>
                                <div style={{ fontWeight: 'bold' }}>{renderTipoBadge(selectedItem.tipo)} {selectedItem.origen_tipo === 'CK' ? 'Cheque' : 'Movimiento'}</div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Número Documento / Cheque:</span>
                                <div style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>{selectedItem.documento || 'N/A'}</div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Fecha de Emisión:</span>
                                <div>{selectedItem.fecha_display || '-'}</div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Fecha Aplicado / Conciliado:</span>
                                <div style={{ color: selectedItem.fecha_aplicado ? '#10b981' : '#f59e0b', fontWeight: '600' }}>
                                    {selectedItem.fecha_aplicado_display || 'Pendiente en Tránsito'}
                                </div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Monto:</span>
                                <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--primary)' }}>
                                    ${formatMoney(selectedItem.monto_display || selectedItem.monto)}
                                </div>
                            </div>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Número de Partida:</span>
                                <div>{selectedItem.num_partida || 'Sin partida'}</div>
                            </div>
                        </div>

                        {selectedItem.beneficiario && (
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Beneficiario:</span>
                                <div style={{ fontWeight: '600' }}>{selectedItem.beneficiario}</div>
                            </div>
                        )}

                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Concepto / Descripción:</span>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.6rem', borderRadius: 'var(--border-radius)' }}>
                                {selectedItem.concepto || '-'}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ── MODAL 3: EDICIÓN DE MOVIMIENTO / CHEQUE ── */}
            <Modal
                open={showEditModal}
                onClose={() => setShowEditModal(false)}
                title="Editar Documento en Conciliación"
                size="md"
            >
                <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div>
                        <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Documento / Cheque:</label>
                        <input
                            type="text"
                            value={editFormData.documento}
                            onChange={e => setEditFormData({ ...editFormData, documento: e.target.value.toUpperCase() })}
                            style={{ width: '100%', height: '38px', textTransform: 'uppercase' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Concepto:</label>
                        <input
                            type="text"
                            value={editFormData.concepto}
                            onChange={e => setEditFormData({ ...editFormData, concepto: e.target.value.toUpperCase() })}
                            style={{ width: '100%', height: '38px', textTransform: 'uppercase' }}
                            required
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Fecha:</label>
                        <input
                            type="date"
                            value={editFormData.fecha}
                            onChange={e => setEditFormData({ ...editFormData, fecha: e.target.value })}
                            style={{ width: '100%', height: '38px' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Monto ($):</span>
                            {!permFlags.can_edit_monto && (
                                <span style={{ color: '#ef4444', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <ShieldAlert size={12} /> Requiere autorización
                                </span>
                            )}
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            disabled={!permFlags.can_edit_monto}
                            value={editFormData.monto}
                            onChange={e => setEditFormData({ ...editFormData, monto: e.target.value })}
                            style={{
                                width: '100%',
                                height: '38px',
                                opacity: permFlags.can_edit_monto ? 1 : 0.6
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
                        <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary" style={{ flex: 1 }} disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={submitting}>
                            {submitting ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ── MODAL 4: CONFIRMAR Y GUARDAR VALIDACIÓN / CIERRE DE PERÍODO ── */}
            <Modal
                open={showValidationModal}
                onClose={() => setShowValidationModal(false)}
                title="Procesar y Guardar Validación de Saldo"
                size="md"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                        Se recalculará y registrará en servidor la instantánea oficial para <strong>{cuentaInfo?.banco_nombre} - {cuentaInfo?.numero}</strong> al corte <strong>{hasta}</strong>.
                    </p>

                    <div className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.84rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Saldo en Banco (Extracto):</span>
                            <strong>${formatMoney(saldoBancoActual)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Saldo en Chequera (Libros):</span>
                            <span>${formatMoney(saldoChequeraActual)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            <span>(−) Abonos en Tránsito:</span>
                            <span>${formatMoney(abonosEnTransito)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            <span>(+) Cheques y Cargos en Tránsito:</span>
                            <span>${formatMoney(cargosChequesEnTransito)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.4rem' }}>
                            <span>Saldo Conciliado en Libros:</span>
                            <strong>${formatMoney(saldoConciliadoLibros)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: esDiferenciaCero ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            <span>Diferencia Real:</span>
                            <span>${formatMoney(diferenciaActual)}</span>
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Notas de Validación:</label>
                        <input
                            type="text"
                            value={notasValidacion}
                            onChange={e => setNotasValidacion(e.target.value)}
                            placeholder="Observaciones del cierre..."
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>

                    {permFlags.can_close_periodo && (
                        <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '0.7rem', borderRadius: 'var(--border-radius)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={cerrarPeriodoCheck}
                                    onChange={e => setCerrarPeriodoCheck(e.target.checked)}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                                <span><strong>Cerrar período de conciliación al {hasta}</strong> (bloquea cambios retroactivos sin autorización)</span>
                            </label>
                            {cerrarPeriodoCheck && !esDiferenciaCero && (
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: '#fbbf24', cursor: 'pointer', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={confirmarConDiferencia}
                                        onChange={e => setConfirmarConDiferencia(e.target.checked)}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    <span>Confirmo explícitamente cerrar este corte con una diferencia de ${formatMoney(diferenciaActual)}</span>
                                </label>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                        <button onClick={() => setShowValidationModal(false)} className="btn-secondary" style={{ flex: 1 }} disabled={submitting}>
                            Cancelar
                        </button>
                        <button onClick={handleGuardarValidacion} disabled={submitting} className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <Check size={16} /> {submitting ? 'Guardando...' : (cerrarPeriodoCheck ? 'Validar y Cerrar Período' : 'Confirmar Validación')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── MODAL 5: ASIGNAR / CREAR MOVIMIENTO EN CONCILIACIÓN (+) ── */}
            <Modal
                open={showAssignModal}
                onClose={() => setShowAssignModal(false)}
                title={assignTargetRow ? 'Asignar / Crear Movimiento en Conciliación' : 'Nuevo Movimiento Bancario'}
                size="lg"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {assignTargetRow && (
                        <div style={{
                            background: 'rgba(37, 99, 235, 0.08)',
                            border: '1px solid rgba(37, 99, 235, 0.25)',
                            borderRadius: 'var(--border-radius)',
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.4rem',
                            fontSize: '0.84rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Fecha:</span> <strong>{assignTargetRow.fecha}</strong>
                                    <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>
                                    <span style={{ color: 'var(--text-muted)' }}>Documento:</span> <strong style={{ fontFamily: 'monospace' }}>{assignTargetRow.documento || 'Sin doc'}</strong>
                                </div>
                                <div style={{ fontSize: '1.05rem', fontWeight: '800', color: assignTargetRow.tipo === 'CARGO' ? '#ef4444' : '#10b981' }}>
                                    ${formatMoney(assignTargetRow.monto)}
                                </div>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                Descripción Extracto: <span style={{ color: 'var(--text)', fontWeight: '500' }}>{assignTargetRow.descripcion}</span>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => setAssignTab('CREAR')}
                            className={assignTab === 'CREAR' ? 'btn-primary' : 'btn-secondary'}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: '600' }}
                        >
                            <Plus size={15} /> Crear Nuevo Movimiento
                        </button>
                        {assignTargetRow && (
                            <button
                                type="button"
                                onClick={() => setAssignTab('VINCULAR')}
                                className={assignTab === 'VINCULAR' ? 'btn-primary' : 'btn-secondary'}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 1rem', fontSize: '0.82rem', fontWeight: '600' }}
                            >
                                <Link2 size={15} /> Vincular a Pendiente Existente ({pendientes.length})
                            </button>
                        )}
                    </div>

                    {assignTab === 'CREAR' && (
                        <form onSubmit={handleSaveAssignCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block' }}>Tipo de Operación:</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setAssignFormData(prev => ({ ...prev, tipo: 'CARGO' }))}
                                        className={assignFormData.tipo === 'CARGO' ? 'btn-primary' : 'btn-secondary'}
                                        style={{
                                            flex: 1,
                                            height: '36px',
                                            background: assignFormData.tipo === 'CARGO' ? '#dc2626' : undefined,
                                            color: '#fff',
                                            fontWeight: '700',
                                            fontSize: '0.82rem'
                                        }}
                                    >
                                        CARGO / Salida (Débito)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAssignFormData(prev => ({ ...prev, tipo: 'ABONO' }))}
                                        className={assignFormData.tipo === 'ABONO' ? 'btn-primary' : 'btn-secondary'}
                                        style={{
                                            flex: 1,
                                            height: '36px',
                                            background: assignFormData.tipo === 'ABONO' ? '#10b981' : undefined,
                                            color: '#fff',
                                            fontWeight: '700',
                                            fontSize: '0.82rem'
                                        }}
                                    >
                                        ABONO / Entrada (Crédito)
                                    </button>
                                </div>
                            </div>

                            <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Tipo Documento / Remesa:</label>
                                    <select
                                        value={assignFormData.tipo_remesa_codigo}
                                        onChange={e => setAssignFormData({ ...assignFormData, tipo_remesa_codigo: e.target.value })}
                                        style={{ width: '100%', height: '36px', borderRadius: 'var(--border-radius)', fontSize: '0.825rem' }}
                                    >
                                        {opcionesTipoRemesa.map(tr => (
                                            <option key={tr.codigo || tr.id} value={tr.codigo || tr.id}>
                                                {tr.codigo || tr.id} - {tr.descripcion}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>No. Documento / Cheque:</label>
                                    <input
                                        type="text"
                                        value={assignFormData.documento}
                                        onChange={e => setAssignFormData({ ...assignFormData, documento: e.target.value.toUpperCase() })}
                                        placeholder="Ej: 4165523"
                                        style={{ width: '100%', height: '36px', textTransform: 'uppercase', fontFamily: 'monospace', fontSize: '0.825rem' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Fecha Emisión:</label>
                                    <input
                                        type="date"
                                        value={assignFormData.fecha}
                                        onChange={e => setAssignFormData({ ...assignFormData, fecha: e.target.value })}
                                        style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                        required
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Fecha Aplicado / Conciliación:</label>
                                    <input
                                        type="date"
                                        value={assignFormData.fecha_aplicado}
                                        onChange={e => setAssignFormData({ ...assignFormData, fecha_aplicado: e.target.value })}
                                        disabled={!assignFormData.aplicar_inmediatamente}
                                        style={{ width: '100%', height: '36px', opacity: assignFormData.aplicar_inmediatamente ? 1 : 0.5, fontSize: '0.825rem' }}
                                        required={assignFormData.aplicar_inmediatamente}
                                    />
                                </div>

                                <div className="span-2">
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Monto ($):</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={assignFormData.monto}
                                        onChange={e => setAssignFormData({ ...assignFormData, monto: e.target.value })}
                                        placeholder="0.00"
                                        style={{ width: '100%', height: '38px', fontWeight: 'bold', fontSize: '1rem' }}
                                        required
                                    />
                                </div>

                                <div className="span-2">
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Concepto / Descripción:</label>
                                    <input
                                        type="text"
                                        value={assignFormData.concepto}
                                        onChange={e => setAssignFormData({ ...assignFormData, concepto: e.target.value.toUpperCase() })}
                                        placeholder="Descripción del movimiento..."
                                        style={{ width: '100%', height: '36px', textTransform: 'uppercase', fontSize: '0.825rem' }}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.8rem', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={assignFormData.aplicar_inmediatamente}
                                        onChange={e => setAssignFormData({ ...assignFormData, aplicar_inmediatamente: e.target.checked })}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontWeight: '600' }}>
                                        Marcar como conciliado inmediatamente (asignar fecha aplicado)
                                    </span>
                                </label>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                                <button type="button" onClick={() => setShowAssignModal(false)} className="btn-secondary" style={{ flex: 1 }} disabled={submitting}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={submitting} className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '700' }}>
                                    <Check size={16} /> {submitting ? 'Guardando...' : 'Guardar y Conciliar'}
                                </button>
                            </div>
                        </form>
                    )}

                    {assignTab === 'VINCULAR' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Filtrar pendientes por documento, concepto o monto..."
                                    value={linkSearchTerm}
                                    onChange={e => setLinkSearchTerm(e.target.value)}
                                    style={{ width: '100%', height: '36px', paddingLeft: '30px', fontSize: '0.825rem' }}
                                />
                            </div>

                            <div className="table-responsive" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                                <table style={{ minWidth: '700px', width: '100%', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                                            <th style={{ padding: '6px' }}>FECHA</th>
                                            <th style={{ padding: '6px' }}>TIPO</th>
                                            <th style={{ padding: '6px' }}>DOC</th>
                                            <th style={{ padding: '6px' }}>CONCEPTO</th>
                                            <th style={{ padding: '6px', textAlign: 'right' }}>MONTO</th>
                                            <th style={{ padding: '6px', textAlign: 'center' }}>ACCIÓN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPendientesForLink.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                    No se encontraron documentos pendientes para vincular.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredPendientesForLink.map((p, idx) => {
                                                const matchesMonto = Math.abs(Number(p.monto_display || p.monto) - Number(assignFormData.monto)) < 0.01;
                                                const matchesDoc = assignFormData.documento && String(p.documento || '').trim() === String(assignFormData.documento || '').trim();
                                                const isHighlighted = matchesMonto || matchesDoc;
                                                const esCargo = p.origen_tipo === 'CK' || Number(p.cargo || 0) > 0;

                                                return (
                                                    <tr
                                                        key={p.key || idx}
                                                        style={{
                                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                            background: isHighlighted ? 'rgba(16, 185, 129, 0.1)' : 'transparent'
                                                        }}
                                                    >
                                                        <td style={{ padding: '6px' }}>{p.fecha_display}</td>
                                                        <td style={{ padding: '6px', textAlign: 'center' }}>{renderTipoBadge(p.tipo)}</td>
                                                        <td style={{ padding: '6px', fontFamily: 'monospace', fontWeight: 'bold' }}>{p.documento || '-'}</td>
                                                        <td style={{ padding: '6px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.concepto}>
                                                            {p.concepto}
                                                        </td>
                                                        <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: esCargo ? '#ef4444' : '#10b981' }}>
                                                            ${formatMoney(p.monto_display || p.monto)}
                                                        </td>
                                                        <td style={{ padding: '6px', textAlign: 'center' }}>
                                                            <button
                                                                type="button"
                                                                disabled={submitting}
                                                                onClick={() => handleSaveAssignLink(p)}
                                                                className="btn-primary"
                                                                style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#10b981' }}
                                                            >
                                                                <Check size={13} /> Vincular
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            {/* ── MODAL 6: PERÍODOS CERRADOS, SOLICITUDES DE REAPERTURA Y AUDITORÍA ── */}
            <Modal
                open={showPeriodosModal}
                onClose={() => setShowPeriodosModal(false)}
                title="Períodos Cerrados, Reaperturas y Auditoría Bancaria"
                size="xl"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => setPeriodosTab('PERIODOS')}
                            className={periodosTab === 'PERIODOS' ? 'btn-primary' : 'btn-secondary'}
                            style={{ height: '32px', padding: '0 0.85rem', fontSize: '0.78rem' }}
                        >
                            Períodos ({periodosList.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setPeriodosTab('SOLICITUDES')}
                            className={periodosTab === 'SOLICITUDES' ? 'btn-primary' : 'btn-secondary'}
                            style={{ height: '32px', padding: '0 0.85rem', fontSize: '0.78rem' }}
                        >
                            Solicitudes de Reapertura ({solicitudesList.filter(s => s.estado === 'PENDIENTE').length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setPeriodosTab('AUDITORIA')}
                            className={periodosTab === 'AUDITORIA' ? 'btn-primary' : 'btn-secondary'}
                            style={{ height: '32px', padding: '0 0.85rem', fontSize: '0.78rem' }}
                        >
                            Auditoría Bancaria ({auditoriaList.length})
                        </button>
                    </div>

                    {loadingPeriodos ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando historial...</div>
                    ) : periodosTab === 'PERIODOS' ? (
                        <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                            <table style={{ minWidth: '820px', width: '100%', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: '0.72rem' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Fecha Corte</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Banco</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Conciliado Libros</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Dif.</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Cerrado / Reabierto por</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {periodosList.length === 0 ? (
                                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay períodos cerrados registrados para esta cuenta.</td></tr>
                                    ) : periodosList.map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700 }}>{p.fecha_corte_display || p.fecha_corte}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 700,
                                                    background: p.estado === 'CERRADO' ? 'rgba(245,158,11,0.18)' : 'rgba(16,185,129,0.18)',
                                                    color: p.estado === 'CERRADO' ? '#fbbf24' : '#34d399'
                                                }}>
                                                    {p.estado}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>${formatMoney(p.saldo_banco)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>${formatMoney(p.saldo_conciliado_libros)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: Math.abs(Number(p.diferencia)) < 0.01 ? '#10b981' : '#ef4444' }}>
                                                ${formatMoney(p.diferencia)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                <div>Cierre: {p.cerrado_por_nombre || '-'}</div>
                                                {p.estado === 'REABIERTO' && <div>Reapertura: {p.reabierto_por_nombre || '-'}</div>}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                {p.estado === 'CERRADO' && (
                                                    <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenSolicitarReapertura(p)}
                                                            className="btn-secondary"
                                                            style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.72rem' }}
                                                        >
                                                            Solicitar
                                                        </button>
                                                        {permFlags.can_approve_reapertura && (
                                                            <button
                                                                type="button"
                                                                disabled={submitting}
                                                                onClick={() => handleReabrirDirecto(p)}
                                                                className="btn-primary"
                                                                style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.72rem' }}
                                                            >
                                                                Reabrir Directo
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : periodosTab === 'SOLICITUDES' ? (
                        <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                            <table style={{ minWidth: '850px', width: '100%', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: '0.72rem' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Cuenta / Corte</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Solicitante</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Motivo</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Resolución</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {solicitudesList.length === 0 ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay solicitudes de reapertura registradas.</td></tr>
                                    ) : solicitudesList.map(s => (
                                        <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <div style={{ fontWeight: 700 }}>{s.banco_nombre} · {s.cuenta_numero}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Corte: {s.fecha_corte_display}</div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <div>{s.solicitado_por_nombre}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatSvDateTime(s.solicitado_at)}</div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', maxWidth: '240px' }}>{s.motivo_solicitud}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 700,
                                                    background: s.estado === 'PENDIENTE' ? 'rgba(245,158,11,0.18)' : (s.estado === 'APROBADA' ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'),
                                                    color: s.estado === 'PENDIENTE' ? '#fbbf24' : (s.estado === 'APROBADA' ? '#34d399' : '#f87171')
                                                }}>
                                                    {s.estado}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                {s.estado === 'PENDIENTE' && permFlags.can_approve_reapertura ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                        <input
                                                            type="text"
                                                            placeholder="Comentario de aprobación/rechazo..."
                                                            value={resolucionComentarios[s.id] || ''}
                                                            onChange={e => setResolucionComentarios(prev => ({ ...prev, [s.id]: e.target.value }))}
                                                            style={{ height: '28px', fontSize: '0.74rem' }}
                                                        />
                                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                            <button
                                                                type="button"
                                                                disabled={submitting}
                                                                onClick={() => handleResolverSolicitud(s, 'APROBAR')}
                                                                className="btn-primary"
                                                                style={{ height: '26px', padding: '0 0.6rem', fontSize: '0.72rem', background: '#10b981' }}
                                                            >
                                                                Aprobar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={submitting}
                                                                onClick={() => handleResolverSolicitud(s, 'RECHAZAR')}
                                                                className="btn-secondary"
                                                                style={{ height: '26px', padding: '0 0.6rem', fontSize: '0.72rem', color: '#ef4444' }}
                                                            >
                                                                Rechazar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {s.resuelto_por_nombre ? `${s.resuelto_por_nombre} · ${s.comentario_resolucion || ''}` : 'Pendiente de aprobación'}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                            <table style={{ minWidth: '850px', width: '100%', fontSize: '0.76rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Fecha/Hora</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Usuario</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Acción</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Entidad / ID</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Detalle / Motivo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditoriaList.length === 0 ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay eventos de auditoría registrados para esta cuenta.</td></tr>
                                    ) : auditoriaList.map(a => (
                                        <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.4rem 0.5rem', whiteSpace: 'nowrap' }}>{formatSvDateTime(a.created_at)}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{a.username || 'sistema'}</td>
                                            <td style={{ padding: '0.4rem 0.5rem' }}><code>{a.accion}</code></td>
                                            <td style={{ padding: '0.4rem 0.5rem' }}>{a.entidad} #{a.entidad_id || '-'}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={JSON.stringify({ motivo: a.motivo, before: a.before_json, after: a.after_json })}>
                                                {a.motivo || (a.after_json ? JSON.stringify(a.after_json).slice(0, 95) : JSON.stringify(a.before_json || {}).slice(0, 95))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>

            {/* ── MODAL 7: SOLICITAR REAPERTURA DE PERÍODO CERRADO ── */}
            <Modal
                open={showReaperturaModal && Boolean(reaperturaTargetPeriodo)}
                onClose={() => setShowReaperturaModal(false)}
                title="Solicitar Reapertura de Período Cerrado"
                size="md"
            >
                <form onSubmit={handleEnviarSolicitudReapertura} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Solicita autorización para reabrir el corte cerrado al <strong>{reaperturaTargetPeriodo?.fecha_corte_display || reaperturaTargetPeriodo?.fecha_corte}</strong>. La solicitud será notificada al Administrador y usuarios designados.
                    </p>
                    <div>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Motivo detallado de la reapertura *</label>
                        <textarea
                            rows={3}
                            required
                            minLength={10}
                            placeholder="Explique qué ajuste o documento requiere modificar en este período cerrado (mínimo 10 caracteres)..."
                            value={reaperturaMotivo}
                            onChange={e => setReaperturaMotivo(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', fontSize: '0.84rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button type="button" onClick={() => setShowReaperturaModal(false)} className="btn-secondary" style={{ flex: 1 }} disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={submitting}>
                            {submitting ? 'Enviando...' : 'Enviar Solicitud de Reapertura'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ReportPreviewModal
                isOpen={showPdfPreview}
                onClose={() => setShowPdfPreview(false)}
                pdfSource={previewPdfBlob}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge={activeTab === 'MOVIMIENTOS' ? 'CONCILIADOS' : (activeTab === 'CONTROL_PAGOS' ? 'CONTROL PAGOS' : 'PENDIENTES')}
                totalPages={previewTotalPages}
                fileName={previewFileName}
            />
        </div>
    );
}
