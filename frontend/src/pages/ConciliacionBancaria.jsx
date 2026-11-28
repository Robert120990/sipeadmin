import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Scale, Search, CheckSquare, Square, RefreshCw, UploadCloud,
    FileSpreadsheet, Eye, Edit2, CheckCircle2,
    AlertCircle, ArrowRightLeft, Sparkles, Filter, X, ShieldAlert,
    Calendar, Building2, Landmark, Check, Clock, Plus, Link2, Printer,
    Lock, Unlock, History, AlertTriangle, ShieldCheck,
    Paperclip, Sliders, Trash2, FileText, Layers, Unlink, Play
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
import ReceiptViewerModal from '../components/ReceiptViewerModal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import {
    BANCOS_NAV_TARGETS,
    resolveInitialBancosContext,
    subscribeBancosNavTarget,
    navigateToBancosTarget,
    saveBancosSelection,
    findMatchingCuenta
} from '../utils/bancosNavStorage';
import { getStoredUser } from '../utils/auth';
import { formatLocalYMD, todayStr as getTodayStr } from '../utils/date';
import { sanitizeSpreadsheetRows } from '../utils/exportSanitizer';
import { useViewport } from '../hooks/useViewport';

const makeIdempotencyKey = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

const parseMoneyInput = (raw) => {
    if (raw === null || raw === undefined || raw === '') return 0;
    const cleaned = String(raw).trim().replace(/[$,\s]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? round2(num) : 0;
};

const formatMoney = (val) => Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatSignedMoney = (val) => {
    const n = Number(val || 0);
    return n < 0 ? `-$${formatMoney(Math.abs(n))}` : `$${formatMoney(n)}`;
};

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

const getAgingBadgeMeta = (item) => {
    if (item?.caduco || item?.aging_bucket === '>180' || item?.bucket === '>180') {
        return { bg: 'rgba(239, 68, 68, 0.16)', color: '#f87171', border: 'rgba(239, 68, 68, 0.4)', text: '>180d CADUCO' };
    }
    if (item?.por_caducar) {
        return { bg: 'rgba(249, 115, 22, 0.16)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.4)', text: 'POR CADUCAR' };
    }
    const bucket = item?.aging_bucket || item?.bucket || '0-30';
    if (bucket === '91-180') {
        return { bg: 'rgba(245, 158, 11, 0.14)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.35)', text: '91-180d' };
    }
    if (bucket === '31-90') {
        return { bg: 'rgba(59, 130, 246, 0.14)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.35)', text: '31-90d' };
    }
    return { bg: 'rgba(16, 185, 129, 0.14)', color: '#34d399', border: 'rgba(16, 185, 129, 0.35)', text: '0-30d' };
};

const getRowDirection = (row) => (row?.origen_tipo === 'CK' || Number(row?.cargo || 0) > 0 ? 'CARGO' : 'ABONO');

const formatCruceTipoLabel = (tipo) => {
    if (tipo === 'N_A_1') return 'N:1';
    if (tipo === '1_A_N') return '1:N';
    if (tipo === 'N_A_M') return 'N:M';
    return tipo || 'CRUCE';
};

const readFileAsDataUrl = (file, forcePdfMime = false) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
        let dataUrl = String(ev.target?.result || '');
        if (forcePdfMime) {
            if (dataUrl.startsWith('data:application/octet-stream;base64,')) {
                dataUrl = dataUrl.replace(/^data:application\/octet-stream;base64,/, 'data:application/pdf;base64,');
            } else if (dataUrl.startsWith('data:;base64,')) {
                dataUrl = dataUrl.replace(/^data:;base64,/, 'data:application/pdf;base64,');
            }
        }
        resolve(dataUrl);
    };
    reader.onerror = () => reject(new Error(`No se pudo leer el archivo "${file?.name || ''}"`));
    reader.readAsDataURL(file);
});

export default function ConciliacionBancaria() {
    const navigate = useNavigate();
    const { isMobile } = useViewport();
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const user = getStoredUser();
    const isAdmin = Number(user?.role_id) === 1 || /^(admin|administrator|administrador|super\s*admin)/i.test(String(user?.role || user?.role_name || ''));
    const [permFlags, setPermFlags] = useState({
        can_edit_monto: isAdmin || Boolean(user?.permissions?.includes('edit_monto_conciliacion')),
        can_close_periodo: isAdmin || Boolean(user?.permissions?.includes('close_conciliacion_periodo') || user?.permissions?.includes('manage_conciliacion_bancaria') || user?.permissions?.includes('/dashboard/bancos/conciliacion')),
        can_approve_reapertura: isAdmin || Boolean(user?.permissions?.includes('approve_reapertura_conciliacion')),
        can_manage_reglas: isAdmin || Boolean(user?.permissions?.includes('manage_conciliacion_reglas') || user?.permissions?.includes('manage_conciliacion_bancaria') || user?.permissions?.includes('/dashboard/bancos/conciliacion'))
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
    const [isSaldoManualDirty, setIsSaldoManualDirty] = useState(false);
    const isSaldoManualDirtyRef = useRef(false);
    const requestSeqRef = useRef(0);
    const abortCtrlRef = useRef(null);
    const cuentasRef = useRef([]);

    // Tabs: 'MOVIMIENTOS' | 'PENDIENTES' | 'CRUCES' | 'TRANSFERENCIAS' | 'CONTROL_PAGOS'
    const [activeTab, setActiveTab] = useState('MOVIMIENTOS');
    const [searchTerm, setSearchTerm] = useState('');
    const [onlyInternalTransfers, setOnlyInternalTransfers] = useState(false);

    // Identificación de Transferencias Internas
    const [transferenciasInternas, setTransferenciasInternas] = useState({
        vinculadas: [],
        sugerencias_espejo: [],
        total_vinculadas: 0,
        total_asimetricas: 0,
        total_sugerencias_espejo: 0
    });

    // R3.3: Antigüedad de cheques en circulación
    const [agingResumen, setAgingResumen] = useState(null);
    const [agingFilter, setAgingFilter] = useState('TODOS');

    // R4.2: Cruces Agrupados (N:1 / 1:N / N:M)
    const [crucesActivos, setCrucesActivos] = useState([]);
    const [loadingCruces, setLoadingCruces] = useState(false);
    const [showCruceModal, setShowCruceModal] = useState(false);
    const [cruceBancoMode, setCruceBancoMode] = useState('EXTRACTO'); // 'EXTRACTO' | 'PENDIENTE'
    const [cruceLibroKeys, setCruceLibroKeys] = useState(new Set());
    const [cruceBancoPendingKeys, setCruceBancoPendingKeys] = useState(new Set());
    const [cruceManualBanco, setCruceManualBanco] = useState({
        referencia_banco: '',
        concepto_banco: '',
        monto_banco: '',
        fecha_aplicado: todayStr,
        notas: ''
    });

    // R5.3 + R6.1: Lightbox de comprobantes
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerItems, setViewerItems] = useState([]);
    const [viewerIdx, setViewerIdx] = useState(0);
    const [viewerTitle, setViewerTitle] = useState('Visualizador de Comprobantes');

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
    const [showReglasModal, setShowReglasModal] = useState(false);

    // R4.2: Reglas de Autoclasificación
    const [reglasList, setReglasList] = useState([]);
    const [loadingReglas, setLoadingReglas] = useState(false);
    const [reglasFilterCuenta, setReglasFilterCuenta] = useState('');
    const [reglasFilterBanco, setReglasFilterBanco] = useState('');
    const [editingReglaId, setEditingReglaId] = useState(null);
    const [reglaForm, setReglaForm] = useState({
        nombre: '',
        banco_codigo: '',
        cuenta_bancaria_id: '',
        patron: '',
        tipo_match: 'CONTAINS',
        tipo_movimiento: 'AMBOS',
        tipo_remesa_id: '',
        concepto_limpio: '',
        cod_cta: '',
        prioridad: 100,
        activo: 1
    });
    const [reglaErrorAlert, setReglaErrorAlert] = useState('');
    const [testReglaDescripcion, setTestReglaDescripcion] = useState('');
    const [testReglaTipo, setTestReglaTipo] = useState('CARGO');
    const [testReglaResult, setTestReglaResult] = useState(null);
    const [testingRegla, setTestingRegla] = useState(false);

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

    // Estado para Importador de Extractos (Texto/Excel/CSV + Gemini PDF/Imagen Multimodal)
    const [importBank, setImportBank] = useState('AUTO');
    const [importMode, setImportMode] = useState('TEXT'); // 'TEXT' | 'AI_MEDIA'
    const [importFiles, setImportFiles] = useState([]); // [{ nombre_original, mime_type, data_url, sizeBytes }]
    const [importRawText, setImportRawText] = useState('');
    const [importFileName, setImportFileName] = useState('');
    const [parsedExtract, setParsedExtract] = useState(null);
    const [isParsing, setIsParsing] = useState(false);
    const [selectedExtractIndices, setSelectedExtractIndices] = useState(new Set());
    const [showDiscardedRows, setShowDiscardedRows] = useState(false);
    const [showImportCruceBuilder, setShowImportCruceBuilder] = useState(false);
    const [importCruceExtractIndices, setImportCruceExtractIndices] = useState(new Set());
    const [importCruceLibroKeys, setImportCruceLibroKeys] = useState(new Set());
    const [appliedSugerenciaIdxs, setAppliedSugerenciaIdxs] = useState(new Set());

    // Estado para Asignación / Creación desde Extracto o Manual
    const [assignTargetRow, setAssignTargetRow] = useState(null);
    const [assignTargetIndex, setAssignTargetIndex] = useState(null);
    const [assignTab, setAssignTab] = useState('CREAR'); // 'CREAR' | 'VINCULAR'
    const [assignFormData, setAssignFormData] = useState({
        tipo: 'CARGO',
        tipo_remesa_id: null,
        tipo_remesa_codigo: 'NC',
        fecha: todayStr,
        fecha_aplicado: todayStr,
        documento: '',
        concepto: '',
        cod_cta: '',
        num_partida: '',
        monto: 0,
        aplicar_inmediatamente: true
    });
    const [linkSearchTerm, setLinkSearchTerm] = useState('');

    // Cargar catálogos iniciales + contexto de navegación (R5.4)
    useEffect(() => {
        const fetchCatalogos = async () => {
            try {
                const res = await api.get('/bancos/conciliacion/catalogos');
                const loadedEmpresas = res.data.empresas || [];
                const loadedCuentas = res.data.cuentas || [];
                cuentasRef.current = loadedCuentas;
                setEmpresas(loadedEmpresas);
                setCuentas(loadedCuentas);
                setTiposRemesas(res.data.tipos_remesas || []);
                if (res.data.permissions) {
                    setPermFlags(prev => ({ ...prev, ...res.data.permissions }));
                }
                if (loadedCuentas.length > 0) {
                    const initialCtx = resolveInitialBancosContext(BANCOS_NAV_TARGETS.conciliacion);
                    const matched = findMatchingCuenta(loadedCuentas, initialCtx);
                    if (matched) {
                        setSelectedEmpresa(String(matched.empresa_codigo || ''));
                        setSelectedCuentaId(String(matched.id));
                    } else if (initialCtx?.empresaId) {
                        const empMatch = loadedEmpresas.find(e =>
                            String(e.codigo) === String(initialCtx.empresaId) ||
                            String(e.id) === String(initialCtx.empresaId)
                        );
                        const empCode = empMatch ? String(empMatch.codigo) : String(initialCtx.empresaId);
                        const firstOfEmp = loadedCuentas.find(c =>
                            String(c.empresa_codigo) === empCode ||
                            String(c.empresa_id) === String(initialCtx.empresaId)
                        );
                        if (firstOfEmp) {
                            setSelectedEmpresa(String(firstOfEmp.empresa_codigo || ''));
                            setSelectedCuentaId(String(firstOfEmp.id));
                        } else {
                            setSelectedCuentaId(String(loadedCuentas[0].id));
                            setSelectedEmpresa(String(loadedCuentas[0].empresa_codigo || ''));
                        }
                    } else {
                        setSelectedCuentaId(String(loadedCuentas[0].id));
                        setSelectedEmpresa(String(loadedCuentas[0].empresa_codigo || ''));
                    }
                }
            } catch (err) {
                console.error(err);
                addToast('Error al cargar catálogos de bancos', 'error');
            }
        };
        fetchCatalogos();

        const unsubscribe = subscribeBancosNavTarget(BANCOS_NAV_TARGETS.conciliacion, (detail) => {
            const list = cuentasRef.current;
            const match = findMatchingCuenta(list, detail);
            isSaldoManualDirtyRef.current = false;
            setAgingFilter('TODOS');
            if (match) {
                setSelectedEmpresa(String(match.empresa_codigo || ''));
                setSelectedCuentaId(String(match.id));
            } else if (detail?.empresaId) {
                const firstOfEmp = list.find(c =>
                    String(c.empresa_codigo) === String(detail.empresaId) ||
                    String(c.empresa_id) === String(detail.empresaId)
                );
                if (firstOfEmp) {
                    setSelectedEmpresa(String(firstOfEmp.empresa_codigo || ''));
                    setSelectedCuentaId(String(firstOfEmp.id));
                }
            }
        });

        return unsubscribe;
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
                    tipo_remesa_codigo: opcionesTipoRemesa[0].codigo || opcionesTipoRemesa[0].id,
                    tipo_remesa_id: opcionesTipoRemesa[0].id || null
                }));
            }
        }
    }, [showAssignModal, opcionesTipoRemesa, assignFormData.tipo_remesa_codigo]);

    useEffect(() => {
        if (cuentasFiltradas.length > 0) {
            const exists = cuentasFiltradas.some(c => String(c.id) === String(selectedCuentaId));
            if (!exists) {
                isSaldoManualDirtyRef.current = false;
                setIsSaldoManualDirty(false);
                setSelectedCuentaId(String(cuentasFiltradas[0].id));
            }
        } else if (cuentas.length > 0 && selectedEmpresa) {
            setSelectedCuentaId('');
            setCuentaInfo(null);
            setMovimientosConciliados([]);
            setPendientes([]);
            setAgingResumen(null);
            setCrucesActivos([]);
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
            setAgingResumen(res.data.aging_resumen || res.data.aging_cheques || res.data.resumen?.aging_resumen || null);
            setCrucesActivos(res.data.cruces_activos || []);
            setTransferenciasInternas(res.data.transferencias_internas || {
                vinculadas: [],
                sugerencias_espejo: [],
                total_vinculadas: 0,
                total_asimetricas: 0,
                total_sugerencias_espejo: 0
            });

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
        setIsSaldoManualDirty(false);
        setAgingFilter('TODOS');
    }, [selectedCuentaId]);

    useEffect(() => {
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
        setIsSaldoManualDirty(false);
        setAgingFilter('TODOS');
        setSelectedEmpresa(empCode);
        const filtered = cuentas.filter(c => !empCode || String(c.empresa_codigo) === String(empCode));
        const nextAcc = filtered.length > 0 ? filtered[0] : null;
        if (nextAcc) {
            setSelectedCuentaId(String(nextAcc.id));
        } else {
            setSelectedCuentaId('');
        }
        saveBancosSelection({
            empresaId: empCode,
            cuentaId: nextAcc?.id || '',
            numeroCuenta: nextAcc?.numero || ''
        });
    };

    const openReceiptLightbox = (rowOrSug, startIdx = 0, labelPrefix = 'Comprobantes') => {
        const list = Array.isArray(rowOrSug?.comprobantes) && rowOrSug.comprobantes.length > 0
            ? rowOrSug.comprobantes
            : (rowOrSug?.signed_url || rowOrSug?.comprobante_url
                ? [{
                    nombre_original: rowOrSug.documento || rowOrSug.referencia_doc || 'Comprobante',
                    archivo_url: rowOrSug.signed_url || rowOrSug.comprobante_url,
                    signed_url: rowOrSug.signed_url || rowOrSug.comprobante_url
                }]
                : []);
        if (list.length === 0) return;
        setViewerItems(list);
        setViewerIdx(startIdx);
        setViewerTitle(`${labelPrefix} · ${rowOrSug.documento || rowOrSug.referencia_doc || rowOrSug.descripcion_ref || ''}`);
        setViewerOpen(true);
    };

    const filteredMovimientos = useMemo(() => {
        let base = movimientosConciliados;
        if (onlyInternalTransfers) {
            base = base.filter(item => Boolean(item.es_transferencia_interna));
        }
        if (!searchTerm) return base;
        const q = searchTerm.toLowerCase();
        return base.filter(item =>
            String(item.documento || '').toLowerCase().includes(q) ||
            String(item.concepto || '').toLowerCase().includes(q) ||
            String(item.beneficiario || '').toLowerCase().includes(q) ||
            String(item.tipo || '').toLowerCase().includes(q) ||
            String(item.transfer_group_id || '').toLowerCase().includes(q) ||
            String(item.transfer_contraparte?.numero_cuenta || '').toLowerCase().includes(q) ||
            String(item.transfer_contraparte?.banco_nombre || '').toLowerCase().includes(q) ||
            String(item.transfer_contraparte?.empresa_nombre || '').toLowerCase().includes(q) ||
            String(item.fecha_display || '').includes(q) ||
            String(item.fecha_aplicado_display || '').includes(q) ||
            String(item.monto_display || '').includes(q)
        );
    }, [movimientosConciliados, onlyInternalTransfers, searchTerm]);

    const filteredPendientes = useMemo(() => {
        let base = pendientes;
        if (onlyInternalTransfers) {
            base = base.filter(item => Boolean(item.es_transferencia_interna));
        }
        if (agingFilter === 'POR_CADUCAR') {
            base = base.filter(item => item.origen_tipo === 'CK' && Boolean(item.por_caducar));
        } else if (agingFilter !== 'TODOS') {
            base = base.filter(item => item.origen_tipo === 'CK' && (item.aging_bucket || item.bucket) === agingFilter);
        }
        if (!searchTerm) return base;
        const q = searchTerm.toLowerCase();
        return base.filter(item =>
            String(item.documento || '').toLowerCase().includes(q) ||
            String(item.concepto || '').toLowerCase().includes(q) ||
            String(item.beneficiario || '').toLowerCase().includes(q) ||
            String(item.tipo || '').toLowerCase().includes(q) ||
            String(item.transfer_group_id || '').toLowerCase().includes(q) ||
            String(item.transfer_contraparte?.numero_cuenta || '').toLowerCase().includes(q) ||
            String(item.transfer_contraparte?.banco_nombre || '').toLowerCase().includes(q) ||
            String(item.transfer_contraparte?.empresa_nombre || '').toLowerCase().includes(q) ||
            String(item.fecha_display || '').includes(q) ||
            String(item.monto_display || '').includes(q)
        );
    }, [pendientes, onlyInternalTransfers, agingFilter, searchTerm]);

    const filteredTransferenciasVinculadas = useMemo(() => {
        const list = transferenciasInternas?.vinculadas || [];
        if (!searchTerm) return list;
        const q = searchTerm.toLowerCase();
        return list.filter(t =>
            String(t.transfer_group_id || '').toLowerCase().includes(q) ||
            String(t.documento || '').toLowerCase().includes(q) ||
            String(t.concepto || '').toLowerCase().includes(q) ||
            String(t.transfer_contraparte?.numero_cuenta || '').toLowerCase().includes(q) ||
            String(t.transfer_contraparte?.banco_nombre || '').toLowerCase().includes(q) ||
            String(t.transfer_contraparte?.empresa_nombre || '').toLowerCase().includes(q) ||
            String(t.monto || '').includes(q)
        );
    }, [transferenciasInternas, searchTerm]);

    const filteredSugerenciasEspejo = useMemo(() => {
        const list = transferenciasInternas?.sugerencias_espejo || [];
        if (!searchTerm) return list;
        const q = searchTerm.toLowerCase();
        return list.filter(s =>
            String(s.movimiento_local_documento || '').toLowerCase().includes(q) ||
            String(s.movimiento_local_concepto || '').toLowerCase().includes(q) ||
            String(s.numero_cuenta || '').toLowerCase().includes(q) ||
            String(s.banco_nombre || '').toLowerCase().includes(q) ||
            String(s.empresa_nombre || '').toLowerCase().includes(q) ||
            String(s.monto || '').includes(q)
        );
    }, [transferenciasInternas, searchTerm]);

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

    const filteredCruces = useMemo(() => {
        if (!searchTerm) return crucesActivos;
        const q = searchTerm.toLowerCase();
        return crucesActivos.filter(c =>
            String(c.id || '').includes(q) ||
            String(c.referencia_banco || '').toLowerCase().includes(q) ||
            String(c.concepto_banco || '').toLowerCase().includes(q) ||
            String(c.notas || '').toLowerCase().includes(q) ||
            String(c.tipo_cruce || '').toLowerCase().includes(q) ||
            (c.items || []).some(it =>
                String(it.documento || '').toLowerCase().includes(q) ||
                String(it.concepto || '').toLowerCase().includes(q)
            )
        );
    }, [crucesActivos, searchTerm]);

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

    const handleDesconciliarCruce = async (cruceId) => {
        if (submitting || !cruceId) return;
        const ok = await confirm(
            `¿Desconciliar el Cruce Agrupado #${cruceId}? Todos los documentos vinculados volverán a quedar pendientes.`,
            { variant: 'danger' }
        );
        if (!ok) return;

        setSubmitting(true);
        try {
            const res = await api.post(`/bancos/conciliacion/cruces/${cruceId}/desconciliar`, {}, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data?.message || `Cruce #${cruceId} desconciliado`, 'success');
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al desconciliar cruce agrupado', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDesconciliar = async (item) => {
        if (submitting) return;
        if (item.cruce_id) {
            await handleDesconciliarCruce(item.cruce_id);
            return;
        }
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

    // R4.2: Cargar y refrescar Cruces Activos
    const refreshCrucesActivos = useCallback(async () => {
        if (!selectedCuentaId) return;
        setLoadingCruces(true);
        try {
            const res = await api.get('/bancos/conciliacion/cruces', {
                params: { cuenta_id: selectedCuentaId, estado: 'ACTIVO' }
            });
            setCrucesActivos(res.data?.cruces || []);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar cruces agrupados', 'error');
        } finally {
            setLoadingCruces(false);
        }
    }, [selectedCuentaId, addToast]);

    // R4.2: Reglas de Autoclasificación
    const fetchReglas = useCallback(async () => {
        setLoadingReglas(true);
        try {
            const res = await api.get('/bancos/conciliacion/reglas');
            setReglasList(res.data?.reglas || []);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar reglas de autoclasificación', 'error');
        } finally {
            setLoadingReglas(false);
        }
    }, [addToast]);

    useEffect(() => {
        const handleReglasUpdate = () => {
            if (showReglasModal) fetchReglas();
        };
        socket.on('conciliacion_reglas_updated', handleReglasUpdate);
        return () => {
            socket.off('conciliacion_reglas_updated', handleReglasUpdate);
        };
    }, [showReglasModal, fetchReglas]);

    const resetReglaForm = () => {
        setEditingReglaId(null);
        setReglaErrorAlert('');
        setReglaForm({
            nombre: '',
            banco_codigo: currentCuenta?.banco_codigo || '',
            cuenta_bancaria_id: selectedCuentaId ? String(selectedCuentaId) : '',
            patron: '',
            tipo_match: 'CONTAINS',
            tipo_movimiento: 'AMBOS',
            tipo_remesa_id: '',
            concepto_limpio: '',
            cod_cta: '',
            prioridad: 100,
            activo: 1
        });
    };

    const handleOpenReglasModal = () => {
        resetReglaForm();
        setTestReglaResult(null);
        setShowReglasModal(true);
        fetchReglas();
    };

    const handleEditRegla = (regla) => {
        setEditingReglaId(regla.id);
        setReglaErrorAlert('');
        setReglaForm({
            nombre: regla.nombre || '',
            banco_codigo: regla.banco_codigo || '',
            cuenta_bancaria_id: regla.cuenta_bancaria_id ? String(regla.cuenta_bancaria_id) : '',
            patron: regla.patron || '',
            tipo_match: regla.tipo_match || 'CONTAINS',
            tipo_movimiento: regla.tipo_movimiento || 'AMBOS',
            tipo_remesa_id: regla.tipo_remesa_id ? String(regla.tipo_remesa_id) : '',
            concepto_limpio: regla.concepto_limpio || '',
            cod_cta: regla.cod_cta || '',
            prioridad: regla.prioridad ?? 100,
            activo: regla.activo ? 1 : 0
        });
    };

    const handleSaveRegla = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setReglaErrorAlert('');
        setSubmitting(true);
        try {
            const payload = {
                nombre: reglaForm.nombre.trim(),
                banco_codigo: reglaForm.banco_codigo ? reglaForm.banco_codigo.trim().toUpperCase() : null,
                cuenta_bancaria_id: reglaForm.cuenta_bancaria_id ? Number(reglaForm.cuenta_bancaria_id) : null,
                patron: reglaForm.patron.trim(),
                tipo_match: reglaForm.tipo_match,
                tipo_movimiento: reglaForm.tipo_movimiento,
                tipo_remesa_id: reglaForm.tipo_remesa_id ? Number(reglaForm.tipo_remesa_id) : null,
                concepto_limpio: reglaForm.concepto_limpio ? reglaForm.concepto_limpio.trim().toUpperCase() : null,
                cod_cta: reglaForm.cod_cta ? reglaForm.cod_cta.trim() : null,
                prioridad: Number(reglaForm.prioridad ?? 100),
                activo: reglaForm.activo ? 1 : 0
            };
            if (editingReglaId) {
                const res = await api.put(`/bancos/conciliacion/reglas/${editingReglaId}`, payload);
                addToast(res.data?.message || 'Regla actualizada', 'success');
            } else {
                const res = await api.post('/bancos/conciliacion/reglas', payload);
                addToast(res.data?.message || 'Regla creada', 'success');
            }
            resetReglaForm();
            fetchReglas();
        } catch (err) {
            const msg = err.response?.data?.message || 'Error al guardar regla de autoclasificación';
            setReglaErrorAlert(msg);
            addToast(msg, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteRegla = async (regla) => {
        if (submitting) return;
        const ok = await confirm(
            `¿Estás seguro de eliminar la regla "${regla.nombre}"?`,
            { variant: 'danger' }
        );
        if (!ok) return;
        setSubmitting(true);
        try {
            const res = await api.delete(`/bancos/conciliacion/reglas/${regla.id}`);
            addToast(res.data?.message || 'Regla eliminada', 'success');
            if (editingReglaId === regla.id) resetReglaForm();
            fetchReglas();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar regla', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleTestRegla = async () => {
        if (!testReglaDescripcion.trim()) {
            addToast('Ingresa una descripción de ejemplo para probar la regla', 'warning');
            return;
        }
        setTestingRegla(true);
        setReglaErrorAlert('');
        try {
            const payload = {
                descripcion: testReglaDescripcion.trim(),
                tipo: testReglaTipo,
                cuenta_bancaria_id: reglaForm.cuenta_bancaria_id ? Number(reglaForm.cuenta_bancaria_id) : (selectedCuentaId ? Number(selectedCuentaId) : null),
                banco_codigo: reglaForm.banco_codigo ? reglaForm.banco_codigo.trim().toUpperCase() : null
            };
            if (reglaForm.patron.trim()) {
                payload.patron = reglaForm.patron.trim();
                payload.tipo_match = reglaForm.tipo_match;
                payload.tipo_movimiento = reglaForm.tipo_movimiento;
                payload.tipo_remesa_id = reglaForm.tipo_remesa_id ? Number(reglaForm.tipo_remesa_id) : null;
                payload.concepto_limpio = reglaForm.concepto_limpio ? reglaForm.concepto_limpio.trim().toUpperCase() : null;
                payload.cod_cta = reglaForm.cod_cta ? reglaForm.cod_cta.trim() : null;
                payload.nombre = reglaForm.nombre || 'Regla en prueba';
            }
            const res = await api.post('/bancos/conciliacion/reglas/probar', payload);
            setTestReglaResult(res.data);
        } catch (err) {
            const msg = err.response?.data?.message || 'Error al probar patrón de regla';
            setReglaErrorAlert(msg);
            setTestReglaResult(null);
            addToast(msg, 'error');
        } finally {
            setTestingRegla(false);
        }
    };

    const filteredReglas = useMemo(() => {
        return reglasList.filter(r => {
            if (reglasFilterCuenta && String(r.cuenta_bancaria_id || '') !== String(reglasFilterCuenta)) return false;
            if (reglasFilterBanco && String(r.banco_codigo || '').toUpperCase() !== String(reglasFilterBanco).toUpperCase()) return false;
            return true;
        });
    }, [reglasList, reglasFilterCuenta, reglasFilterBanco]);

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
            setIsSaldoManualDirty(false);
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

    // Parsear Extracto Bancario (Texto/Excel/CSV o PDF/Imágenes con Gemini Multimodal)
    const handleParseExtracto = async () => {
        if (importMode === 'AI_MEDIA') {
            if (importFiles.length === 0) {
                addToast('Adjunta un PDF o hasta 10 imágenes del estado de cuenta', 'warning');
                return;
            }
            if (!selectedCuentaId) {
                addToast('Selecciona una cuenta bancaria', 'warning');
                return;
            }
            setIsParsing(true);
            try {
                const res = await api.post('/bancos/conciliacion/parse-extracto-pdf', {
                    cuenta_id: selectedCuentaId,
                    banco_formato: importBank,
                    archivo_nombre: importFileName || importFiles[0]?.nombre_original || 'extracto',
                    files: importFiles.map(f => ({
                        data_url: f.data_url,
                        nombre_original: f.nombre_original,
                        mime_type: f.mime_type
                    }))
                });
                const txList = res.data.transacciones || [];
                setParsedExtract(res.data);
                setShowDiscardedRows(false);
                setShowImportCruceBuilder(false);
                setImportCruceExtractIndices(new Set());
                setImportCruceLibroKeys(new Set());
                setAppliedSugerenciaIdxs(new Set());
                if (txList.length > 0) {
                    const autoIdx = txList
                        .map((t, i) => (!t.es_duplicado_probable && t.matchType !== 'ALERTA_DIFERENCIA_MONTO' ? i : -1))
                        .filter(i => i >= 0);
                    setSelectedExtractIndices(new Set(autoIdx));
                } else {
                    setSelectedExtractIndices(new Set());
                }
                addToast(`IA procesó ${res.data.total_procesadas || txList.length} transacciones (${res.data.paginas_procesadas || importFiles.length} pág.)`, 'success');
            } catch (err) {
                addToast(err.response?.data?.message || 'Error al analizar PDF/imágenes con Gemini IA', 'error');
            } finally {
                setIsParsing(false);
            }
            return;
        }

        if (!importRawText.trim()) {
            addToast('Ingresa o pega los datos del estado de cuenta, o carga un Excel/CSV/PDF/imagen', 'warning');
            return;
        }
        setIsParsing(true);
        try {
            const res = await api.post('/bancos/conciliacion/parse-extracto', {
                cuenta_id: selectedCuentaId,
                raw_data: importRawText,
                banco_formato: importBank
            });
            const txList = res.data.transacciones || [];
            setParsedExtract(res.data);
            setShowDiscardedRows(false);
            setShowImportCruceBuilder(false);
            setImportCruceExtractIndices(new Set());
            setImportCruceLibroKeys(new Set());
            setAppliedSugerenciaIdxs(new Set());
            if (txList.length > 0) {
                const autoIdx = txList
                    .map((t, i) => (!t.es_duplicado_probable && t.matchType !== 'ALERTA_DIFERENCIA_MONTO' ? i : -1))
                    .filter(i => i >= 0);
                setSelectedExtractIndices(new Set(autoIdx));
            } else {
                setSelectedExtractIndices(new Set());
            }
            addToast(`Se procesaron ${res.data.total_procesadas || txList.length} transacciones del extracto`, 'success');
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

    const updateExtractRowClassification = (idx, patch) => {
        setParsedExtract(prev => {
            if (!prev?.transacciones) return prev;
            const nextTx = [...prev.transacciones];
            const current = nextTx[idx];
            if (!current) return prev;
            const updated = { ...current, ...patch };
            if (Object.prototype.hasOwnProperty.call(patch, 'concepto_limpio')) {
                updated.conceptoSugerido = patch.concepto_limpio;
            }
            nextTx[idx] = updated;
            return { ...prev, transacciones: nextTx };
        });
    };

    const handleRemoveImportFile = (removeIdx) => {
        setImportFiles(prev => {
            const next = prev.filter((_, i) => i !== removeIdx);
            if (next.length === 0) {
                setImportMode('TEXT');
                setImportFileName('');
            } else {
                setImportFileName(next.map(f => f.nombre_original).join(', '));
            }
            return next;
        });
    };

    // Lectura segura de Excel/CSV + PDF/Imágenes para Gemini Multimodal
    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;

        const isPdfFile = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
        const isImgFile = (f) => ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name || '');
        const isSheetFile = (f) => /\.(xlsx|xls|csv)$/i.test(f.name || '');

        const first = files[0];
        if (isPdfFile(first)) {
            if (files.length > 1) {
                addToast('Solo puede adjuntar 1 archivo PDF por análisis', 'warning');
                return;
            }
            if (first.size > 15 * 1024 * 1024) {
                addToast('El archivo PDF excede el límite máximo de 15 MB', 'error');
                return;
            }
            try {
                const dataUrl = await readFileAsDataUrl(first, true);
                setImportMode('AI_MEDIA');
                setImportFiles([{
                    nombre_original: first.name,
                    mime_type: 'application/pdf',
                    data_url: dataUrl,
                    sizeBytes: first.size
                }]);
                setImportFileName(first.name);
                setImportRawText('');
                addToast(`PDF listo para Gemini IA: ${first.name}`, 'info');
            } catch (err) {
                addToast(err.message || 'Error al leer PDF', 'error');
            }
            return;
        }

        if (files.every(isImgFile)) {
            if (files.length > 10) {
                addToast('Máximo 10 imágenes por análisis multimodal', 'warning');
                return;
            }
            const oversized = files.find(f => f.size > 10 * 1024 * 1024);
            if (oversized) {
                addToast(`La imagen "${oversized.name}" excede el límite de 10 MB`, 'error');
                return;
            }
            try {
                const loaded = await Promise.all(files.map(async (f) => {
                    const mime = f.type === 'image/jpg' ? 'image/jpeg' : (f.type || 'image/png');
                    const dataUrl = await readFileAsDataUrl(f, false);
                    return {
                        nombre_original: f.name,
                        mime_type: mime,
                        data_url: dataUrl,
                        sizeBytes: f.size
                    };
                }));
                setImportMode('AI_MEDIA');
                setImportFiles(loaded);
                setImportFileName(loaded.map(f => f.nombre_original).join(', '));
                setImportRawText('');
                addToast(`${loaded.length} imagen(es) lista(s) para análisis con Gemini IA`, 'info');
            } catch (err) {
                addToast(err.message || 'Error al leer imágenes', 'error');
            }
            return;
        }

        if (files.some(isSheetFile)) {
            if (files.length > 1) {
                addToast('Seleccione un único archivo Excel/CSV, o bien PDF/imágenes por separado.', 'warning');
                return;
            }
            try {
                setImportMode('TEXT');
                setImportFiles([]);
                setImportFileName(first.name);
                const buf = await first.arrayBuffer();
                const wb = XLSX.read(buf, { type: 'array', cellDates: true });
                const firstSheetName = wb.SheetNames[0];
                const ws = wb.Sheets[firstSheetName];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'dd/mm/yyyy', defval: '' });

                const text = data.map(row => row.map(c => String(c ?? '').replace(/\t/g, ' ')).join('\t')).join('\n');
                setImportRawText(text);
                addToast(`Archivo cargado: ${first.name} (${data.length} filas)`, 'info');
            } catch (err) {
                console.error(err);
                addToast('Error al leer archivo Excel/CSV', 'error');
            }
            return;
        }

        addToast('Formato no soportado. Use Excel (.xlsx/.xls/.csv), PDF (<=15MB) o imágenes PNG/JPG/WEBP (máx. 10).', 'warning');
    };

    const handleRequestCloseImportModal = async () => {
        const hasPendingWork = parsedExtract?.transacciones?.some(t => !t.procesado && !t.es_duplicado_probable);
        if (hasPendingWork) {
            const ok = await confirm('Hay transacciones analizadas del extracto sin procesar. ¿Seguro que desea cerrar y descartar la previsualización?', { variant: 'danger' });
            if (!ok) return;
        }
        setShowImportModal(false);
        setParsedExtract(null);
        setImportFiles([]);
        setImportMode('TEXT');
        setImportCruceExtractIndices(new Set());
        setImportCruceLibroKeys(new Set());
        setAppliedSugerenciaIdxs(new Set());
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
            setImportFiles([]);
            setImportMode('TEXT');
            setSelectedExtractIndices(new Set());
            fetchData({ preserveSelection: false });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al conciliar coincidencias', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Vincular espejo existente en Transferencias Internas (tab TRANSFERENCIAS)
    const handleVincularEspejoExistente = async (sug) => {
        if (submitting || !sug) return;
        const ok = await confirm(
            `¿Vincular el movimiento local ($${formatMoney(sug.monto)}) con el movimiento espejo #${sug.movimiento_contraparte_id} en ${sug.banco_nombre} #${sug.numero_cuenta} (${sug.empresa_nombre})?`
        );
        if (!ok) return;

        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/vincular-transferencia-interna', {
                modo: 'VINCULAR_EXISTENTES',
                cuenta_bancaria_id: Number(selectedCuentaId),
                movimiento_id: sug.movimiento_local_id,
                movimiento_contraparte_id: sug.movimiento_contraparte_id
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data?.message || 'Transferencia interna vinculada', 'success');
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al vincular transferencia interna', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Conciliar y vincular desde fila de extracto bancario con espejo detectado en otra cuenta
    const handleConciliarYCrearEspejoDesdeExtracto = async (t, index) => {
        const det = t?.transferencia_interna_detectada;
        if (submitting || !det || !det.movimiento_espejo_id) return;
        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/vincular-transferencia-interna', {
                modo: 'CREAR_Y_VINCULAR_ESPEJO',
                cuenta_bancaria_id: Number(selectedCuentaId),
                movimiento_contraparte_id: det.movimiento_espejo_id,
                fecha: t.fecha_ymd || todayStr,
                fecha_aplicado: t.fecha_ymd || fechaAplicadoInput || todayStr,
                documento: t.documento || '',
                concepto: t.concepto_limpio || t.descripcion || '',
                cod_cta: t.cod_cta || '',
                num_partida: t.num_partida || '',
                aplicar_inmediatamente: true
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data?.message || 'Movimiento conciliado y vinculado con su espejo', 'success');
            if (parsedExtract) {
                const updatedTx = [...parsedExtract.transacciones];
                updatedTx[index] = {
                    ...updatedTx[index],
                    procesado: true,
                    transferencia_interna_detectada: {
                        ...det,
                        tipo: 'VINCULADA',
                        transfer_group_id: res.data?.transfer_group_id || det.transfer_group_id
                    }
                };
                setParsedExtract({ ...parsedExtract, transacciones: updatedTx });
                setSelectedExtractIndices(prev => {
                    const next = new Set(prev);
                    next.delete(index);
                    return next;
                });
            }
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al vincular y conciliar espejo interno', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Crear par de transferencia completo desde extracto bancario cuando detectó cuenta interna
    const handleCrearParTransferenciaDesdeExtracto = async (t, index) => {
        const det = t?.transferencia_interna_detectada;
        if (submitting || !det || !det.cuenta_contraparte_id) return;
        const ok = await confirm(
            `Se registrará una transferencia interna por $${formatMoney(t.monto)} entre esta cuenta (ya aplicada) y ${det.banco_nombre} #${det.numero_cuenta} (${det.empresa_nombre || 'Contraparte'}, quedando en tránsito hasta su conciliación). ¿Deseas continuar?`
        );
        if (!ok) return;

        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/vincular-transferencia-interna', {
                modo: 'CREAR_PAR_COMPLETO',
                cuenta_bancaria_id: Number(selectedCuentaId),
                cuenta_contraparte_id: det.cuenta_contraparte_id,
                direccion_actual: t.tipo,
                fecha: t.fecha_ymd || todayStr,
                fecha_aplicado: t.fecha_ymd || fechaAplicadoInput || todayStr,
                documento: t.documento || '',
                concepto: t.concepto_limpio || t.descripcion || '',
                monto: Number(t.monto || 0),
                cod_cta: t.cod_cta || '',
                num_partida: t.num_partida || '',
                aplicar_inmediatamente: true,
                aplicar_contraparte: false
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data?.message || 'Transferencia interna creada y aplicada', 'success');
            if (parsedExtract) {
                const updatedTx = [...parsedExtract.transacciones];
                updatedTx[index] = {
                    ...updatedTx[index],
                    procesado: true,
                    transferencia_interna_detectada: {
                        ...det,
                        tipo: 'VINCULADA',
                        transfer_group_id: res.data?.transfer_group_id
                    }
                };
                setParsedExtract({ ...parsedExtract, transacciones: updatedTx });
                setSelectedExtractIndices(prev => {
                    const next = new Set(prev);
                    next.delete(index);
                    return next;
                });
            }
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al crear transferencia interna desde extracto', 'error');
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

    // R4.2: Aplicar sugerencia de Cruce Agrupado (N:1 / 1:N) desde Extracto
    const handleApplySugerenciaCruce = async (sug, sugIdx) => {
        if (submitting || !sug) return;
        setSubmitting(true);
        try {
            const rawBancoItems = sug.banco_items || [];
            const bancoItems = rawBancoItems.map(b => ({
                origen_tipo: b.origen_tipo || 'EXTRACTO',
                documento: b.documento || null,
                fecha: b.fecha || null,
                fecha_ymd: b.fecha_ymd || null,
                concepto: b.concepto || b.descripcion || null,
                descripcion: b.descripcion || b.concepto || null,
                monto: Number(b.monto || 0)
            }));
            const res = await api.post('/bancos/conciliacion/cruces', {
                cuenta_bancaria_id: Number(selectedCuentaId),
                tipo_cruce: sug.tipo_cruce,
                direccion: sug.direccion,
                fecha_aplicado: sug.fecha_sugerida || fechaAplicadoInput || todayStr,
                libro_items: sug.libro_items || [],
                banco_items: bancoItems,
                referencia_banco: bancoItems[0]?.documento || null,
                concepto_banco: bancoItems[0]?.concepto || bancoItems[0]?.descripcion || null,
                notas: sug.nota_sugerida || 'Cruce agrupado sugerido desde extracto'
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data?.message || 'Cruce agrupado aplicado exitosamente', 'success');
            setAppliedSugerenciaIdxs(prev => new Set([...prev, sugIdx]));

            // Marcar filas de extracto consumidas 1-a-1 (preservando fila_origen) y quitarlas de selección masiva
            if (parsedExtract?.transacciones) {
                const txList = parsedExtract.transacciones;
                const consumedRows = new Set();
                for (const b of rawBancoItems) {
                    let matchIdx = -1;
                    if (b.fila_origen !== undefined && b.fila_origen !== null) {
                        matchIdx = txList.findIndex((t, idx) =>
                            !consumedRows.has(idx) &&
                            !t.procesado &&
                            t.fila_origen !== undefined &&
                            t.fila_origen !== null &&
                            t.fila_origen === b.fila_origen
                        );
                    }
                    if (matchIdx === -1) {
                        matchIdx = txList.findIndex((t, idx) =>
                            !consumedRows.has(idx) &&
                            !t.procesado &&
                            Math.abs(Number(t.monto || 0) - Number(b.monto || 0)) < 0.01 &&
                            String(t.documento || '') === String(b.documento || '') &&
                            String(t.fecha_ymd || t.fecha || '') === String(b.fecha_ymd || b.fecha || '')
                        );
                    }
                    if (matchIdx !== -1) {
                        consumedRows.add(matchIdx);
                    }
                }
                const updatedTx = txList.map((t, idx) => (
                    consumedRows.has(idx) ? { ...t, procesado: true } : t
                ));
                setParsedExtract({ ...parsedExtract, transacciones: updatedTx });
                setSelectedExtractIndices(prev => new Set([...prev].filter(i => !consumedRows.has(i))));
            }
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al aplicar cruce agrupado sugerido', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // R4.2: Constructor manual de Cruce Agrupado dentro del Import Modal (EXTRACTO <-> PENDIENTES LIBRO)
    const importCruceSummary = useMemo(() => {
        const txList = parsedExtract?.transacciones || [];
        const selectedBank = [...importCruceExtractIndices]
            .map(i => ({ ...txList[i], _idx: i }))
            .filter(t => t && !t.procesado);
        const selectedLibro = pendientes.filter(p => importCruceLibroKeys.has(p.key));
        const sumBanco = round2(selectedBank.reduce((s, t) => s + Number(t.monto || 0), 0));
        const sumLibro = round2(selectedLibro.reduce((s, p) => s + Number(p.monto_display || p.monto || 0), 0));
        const diff = round2(sumBanco - sumLibro);
        const dirs = new Set([
            ...selectedBank.map(t => t.tipo),
            ...selectedLibro.map(p => getRowDirection(p))
        ]);
        let tipoCruce = null;
        if (selectedLibro.length >= 2 && selectedBank.length === 1) tipoCruce = 'N_A_1';
        else if (selectedLibro.length === 1 && selectedBank.length >= 2) tipoCruce = '1_A_N';
        else if (selectedLibro.length >= 2 && selectedBank.length >= 2) tipoCruce = 'N_A_M';
        return {
            selectedBank,
            selectedLibro,
            sumBanco,
            sumLibro,
            diff,
            sameDirection: dirs.size <= 1,
            direccion: [...dirs][0] || 'CARGO',
            tipoCruce,
            isValid: Boolean(tipoCruce) && dirs.size === 1 && Math.abs(diff) <= 0.005
        };
    }, [parsedExtract, importCruceExtractIndices, importCruceLibroKeys, pendientes]);

    const handleCreateManualImportCruce = async () => {
        if (submitting || !importCruceSummary.isValid) return;
        setSubmitting(true);
        try {
            const consumedIdxs = new Set(importCruceSummary.selectedBank.map(b => b._idx));
            const res = await api.post('/bancos/conciliacion/cruces', {
                cuenta_bancaria_id: Number(selectedCuentaId),
                tipo_cruce: importCruceSummary.tipoCruce,
                direccion: importCruceSummary.direccion,
                fecha_aplicado: importCruceSummary.selectedBank[0]?.fecha_ymd || fechaAplicadoInput || todayStr,
                libro_items: importCruceSummary.selectedLibro.map(p => ({ id: p.id, origen_tipo: p.origen_tipo })),
                banco_items: importCruceSummary.selectedBank.map(b => ({
                    origen_tipo: 'EXTRACTO',
                    documento: b.documento || null,
                    fecha: b.fecha || null,
                    fecha_ymd: b.fecha_ymd || null,
                    concepto: b.concepto_limpio || b.conceptoSugerido || b.descripcion || null,
                    descripcion: b.descripcion || null,
                    monto: Number(b.monto || 0)
                })),
                referencia_banco: importCruceSummary.selectedBank[0]?.documento || null,
                concepto_banco: importCruceSummary.selectedBank[0]?.descripcion || null,
                notas: 'Cruce agrupado manual desde importador de extracto'
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data?.message || 'Cruce agrupado creado exitosamente', 'success');
            if (parsedExtract?.transacciones) {
                const updatedTx = parsedExtract.transacciones.map((t, idx) => (
                    consumedIdxs.has(idx) ? { ...t, procesado: true } : t
                ));
                setParsedExtract({ ...parsedExtract, transacciones: updatedTx });
            }
            setSelectedExtractIndices(prev => new Set([...prev].filter(i => !consumedIdxs.has(i))));
            setImportCruceExtractIndices(new Set());
            setImportCruceLibroKeys(new Set());
            fetchData({ preserveSelection: true });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al crear cruce agrupado', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // R4.2: Constructor de Cruce Agrupado desde workspace PENDIENTES
    const handleOpenCruceModal = () => {
        setCruceLibroKeys(new Set(selectedPendingKeys));
        setCruceBancoPendingKeys(new Set());
        setCruceBancoMode('EXTRACTO');
        const selItems = pendientes.filter(p => selectedPendingKeys.has(p.key));
        const totalSel = round2(selItems.reduce((s, p) => s + Number(p.monto_display || p.monto || 0), 0));
        setCruceManualBanco({
            referencia_banco: '',
            concepto_banco: '',
            monto_banco: totalSel > 0 ? String(totalSel) : '',
            fecha_aplicado: fechaAplicadoInput || todayStr,
            notas: ''
        });
        setShowCruceModal(true);
    };

    const cruceModalSummary = useMemo(() => {
        const libroItems = pendientes.filter(p => cruceLibroKeys.has(p.key));
        const sumLibro = round2(libroItems.reduce((s, p) => s + Number(p.monto_display || p.monto || 0), 0));
        const dirsLibro = new Set(libroItems.map(p => getRowDirection(p)));
        let bancoItemsPayload = [];
        let sumBanco = 0;
        let allDirs = new Set(dirsLibro);
        if (cruceBancoMode === 'EXTRACTO') {
            const m = parseMoneyInput(cruceManualBanco.monto_banco);
            sumBanco = m;
            if (m > 0) {
                bancoItemsPayload = [{
                    origen_tipo: 'EXTRACTO',
                    documento: cruceManualBanco.referencia_banco.trim() || null,
                    fecha_ymd: cruceManualBanco.fecha_aplicado || todayStr,
                    concepto: cruceManualBanco.concepto_banco.trim() || 'MOVIMIENTO BANCARIO EXTRACTO',
                    monto: m
                }];
            }
        } else {
            const bancoPend = pendientes.filter(p => cruceBancoPendingKeys.has(p.key) && !cruceLibroKeys.has(p.key));
            sumBanco = round2(bancoPend.reduce((s, p) => s + Number(p.monto_display || p.monto || 0), 0));
            bancoPend.forEach(p => allDirs.add(getRowDirection(p)));
            bancoItemsPayload = bancoPend.map(p => ({ id: p.id, origen_tipo: p.origen_tipo }));
        }
        let tipoCruce = null;
        if (libroItems.length >= 2 && bancoItemsPayload.length === 1) tipoCruce = 'N_A_1';
        else if (libroItems.length === 1 && bancoItemsPayload.length >= 2) tipoCruce = '1_A_N';
        else if (libroItems.length >= 2 && bancoItemsPayload.length >= 2) tipoCruce = 'N_A_M';
        const diff = round2(sumBanco - sumLibro);
        return {
            libroItems,
            bancoItemsPayload,
            sumLibro,
            sumBanco,
            diff,
            sameDirection: allDirs.size === 1,
            direccion: [...allDirs][0] || 'CARGO',
            tipoCruce,
            isValid: Boolean(tipoCruce) && allDirs.size === 1 && Math.abs(diff) <= 0.005
        };
    }, [pendientes, cruceLibroKeys, cruceBancoPendingKeys, cruceBancoMode, cruceManualBanco]);

    const handleSubmitCruceModal = async (e) => {
        e.preventDefault();
        if (submitting || !cruceModalSummary.isValid) return;
        setSubmitting(true);
        try {
            const res = await api.post('/bancos/conciliacion/cruces', {
                cuenta_bancaria_id: Number(selectedCuentaId),
                tipo_cruce: cruceModalSummary.tipoCruce,
                direccion: cruceModalSummary.direccion,
                fecha_aplicado: cruceManualBanco.fecha_aplicado || fechaAplicadoInput || todayStr,
                libro_items: cruceModalSummary.libroItems.map(p => ({ id: p.id, origen_tipo: p.origen_tipo })),
                banco_items: cruceModalSummary.bancoItemsPayload,
                referencia_banco: cruceManualBanco.referencia_banco.trim() || null,
                concepto_banco: cruceManualBanco.concepto_banco.trim() || null,
                notas: cruceManualBanco.notas.trim() || null
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data?.message || 'Cruce agrupado registrado exitosamente', 'success');
            setShowCruceModal(false);
            setSelectedPendingKeys(new Set());
            fetchData({ preserveSelection: false });
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al registrar cruce agrupado', 'error');
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
        const chosenCod = row?.tipo_remesa_codigo || fallbackCod;
        const matchedRemesa = tiposRemesasCuenta.find(tr =>
            (row?.tipo_remesa_id && String(tr.id) === String(row.tipo_remesa_id)) ||
            String(tr.codigo || tr.id || '').toUpperCase() === String(chosenCod).toUpperCase()
        );

        setAssignFormData({
            tipo: row?.tipo || 'CARGO',
            tipo_remesa_id: row?.tipo_remesa_id || matchedRemesa?.id || null,
            tipo_remesa_codigo: chosenCod,
            fecha: ymdFecha,
            fecha_aplicado: ymdFecha || todayStr,
            documento: row?.documento || '',
            concepto: row?.concepto_limpio || row?.conceptoSugerido || row?.descripcion || '',
            cod_cta: row?.cod_cta || '',
            num_partida: row?.num_partida || '',
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
        const initialOption = cargoOptions.find(o => (o.codigo || o.id) === 'NC') || cargoOptions[0];
        const initialCod = initialOption?.codigo || initialOption?.id || 'NC';

        setAssignFormData({
            tipo: 'CARGO',
            tipo_remesa_id: initialOption?.id || null,
            tipo_remesa_codigo: initialCod,
            fecha: todayStr,
            fecha_aplicado: todayStr,
            documento: '',
            concepto: '',
            cod_cta: '',
            num_partida: '',
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
                ...assignFormData,
                concepto_limpio: assignFormData.concepto || null,
                tipo_remesa_id: assignFormData.tipo_remesa_id || null,
                cod_cta: assignFormData.cod_cta || null,
                num_partida: assignFormData.num_partida || null
            }, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            addToast(res.data.message || 'Movimiento procesado y guardado', 'success');

            if (parsedExtract && assignTargetIndex !== null) {
                const updatedTx = [...parsedExtract.transacciones];
                updatedTx[assignTargetIndex] = {
                    ...updatedTx[assignTargetIndex],
                    procesado: true,
                    concepto_limpio: assignFormData.concepto,
                    tipo_remesa_id: assignFormData.tipo_remesa_id || null,
                    tipo_remesa_codigo: assignFormData.tipo_remesa_codigo,
                    cod_cta: assignFormData.cod_cta || null,
                    num_partida: assignFormData.num_partida || null,
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
                    tipo_remesa_id: t.tipo_remesa_id || null,
                    tipo_remesa_codigo: t.tipo_remesa_codigo || (t.tipo === 'CARGO' ? 'NC' : 'RM'),
                    cod_cta: t.cod_cta || null,
                    num_partida: t.num_partida || null,
                    concepto_limpio: t.concepto_limpio || t.conceptoSugerido || t.descripcion || '',
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
            setImportFiles([]);
            setImportMode('TEXT');
            setSelectedExtractIndices(new Set());
            setImportCruceExtractIndices(new Set());
            setImportCruceLibroKeys(new Set());
            setAppliedSugerenciaIdxs(new Set());
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
            const ws = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(formatted));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'CONTROL_PAGOS');
            XLSX.writeFile(wb, `Conciliacion_ControlPagos_${cuentaNom}_${hasta}.xlsx`);
            addToast('Archivo Excel descargado', 'success');
            return;
        }

        if (activeTab === 'TRANSFERENCIAS') {
            if (filteredTransferenciasVinculadas.length === 0) return;
            const formatted = filteredTransferenciasVinculadas.map(t => ({
                'Correlativo': t.transfer_group_id || '',
                'Fecha': t.fecha_display || '',
                'Dirección': t.direccion || '',
                'Documento': t.documento || '',
                'Concepto': t.concepto || '',
                'Cuenta Contraparte': t.transfer_contraparte ? `${t.transfer_contraparte.banco_nombre} #${t.transfer_contraparte.numero_cuenta} (${t.transfer_contraparte.empresa_nombre})` : '',
                'Tipo': t.transfer_contraparte?.intercompany ? 'Inter-Empresa' : 'Misma Empresa',
                'Simetría': t.estado_simetria || '',
                'Monto': Number(t.monto || 0)
            }));
            const ws = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(formatted));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'TRANSFERENCIAS');
            XLSX.writeFile(wb, `Conciliacion_Transferencias_${cuentaNom}_${hasta}.xlsx`);
            addToast('Archivo Excel descargado', 'success');
            return;
        }

        if (activeTab === 'CRUCES') {
            if (filteredCruces.length === 0) return;
            const formatted = filteredCruces.map(c => ({
                'Cruce #': c.id,
                'Tipo': formatCruceTipoLabel(c.tipo_cruce),
                'Dirección': c.direccion || '',
                'Fecha Aplicado': c.fecha_aplicado_display || c.fecha_aplicado_ymd || '',
                'Referencia Banco': c.referencia_banco || '',
                'Concepto Banco': c.concepto_banco || '',
                'Monto Total': Number(c.monto_total || 0),
                'Notas': c.notas || ''
            }));
            const ws = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(formatted));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'CRUCES');
            XLSX.writeFile(wb, `Conciliacion_Cruces_${cuentaNom}_${hasta}.xlsx`);
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

        const ws = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(formatted));
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

        if (activeTab === 'TRANSFERENCIAS') {
            if (filteredTransferenciasVinculadas.length === 0) return;
            const title = 'Conciliación Bancaria - Transferencias Internas';
            doc.setFontSize(14);
            doc.text(title, 14, 15);
            doc.setFontSize(9);
            const sub = `Cuenta: ${cuentaInfo?.banco_nombre || ''} - ${cuentaInfo?.numero || ''} | Corte: ${hasta}`;
            doc.text(sub, 14, 22);

            const totalTransf = filteredTransferenciasVinculadas.reduce((acc, t) => acc + Number(t.monto || 0), 0);
            autoTable(doc, {
                head: [['CORRELATIVO', 'FECHA', 'DIR', 'CONTRAPARTE', 'SIMETRÍA', 'MONTO ($)']],
                body: filteredTransferenciasVinculadas.map(t => [
                    t.transfer_group_id || '',
                    t.fecha_display || '',
                    t.direccion || '',
                    t.transfer_contraparte ? `${t.transfer_contraparte.banco_nombre} #${t.transfer_contraparte.numero_cuenta} (${t.transfer_contraparte.empresa_nombre})` : '-',
                    t.estado_simetria || '',
                    `$${formatMoney(t.monto)}`
                ]),
                startY: 28,
                theme: 'striped',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
                foot: [[
                    { content: `TOTAL (${filteredTransferenciasVinculadas.length} transferencias):`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: `$${formatMoney(totalTransf)}`, styles: { halign: 'right', fontStyle: 'bold' } }
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
            setPreviewFileName(`Conciliacion_Transferencias_${cuentaNom}_${hasta}.pdf`);
            setShowPdfPreview(true);
            return;
        }

        if (activeTab === 'CRUCES') {
            if (filteredCruces.length === 0) return;
            const title = 'Conciliación Bancaria - Cruces Agrupados Activos';
            doc.setFontSize(14);
            doc.text(title, 14, 15);
            doc.setFontSize(9);
            const sub = `Cuenta: ${cuentaInfo?.banco_nombre || ''} - ${cuentaInfo?.numero || ''} | Corte: ${hasta}`;
            doc.text(sub, 14, 22);

            const totalCruces = filteredCruces.reduce((acc, c) => acc + Number(c.monto_total || 0), 0);
            autoTable(doc, {
                head: [['CRUCE #', 'TIPO', 'DIR', 'APLICADO', 'REF. BANCO', 'CONCEPTO / NOTAS', 'MONTO ($)']],
                body: filteredCruces.map(c => [
                    `#${c.id}`,
                    formatCruceTipoLabel(c.tipo_cruce),
                    c.direccion || '',
                    c.fecha_aplicado_display || c.fecha_aplicado_ymd || '',
                    c.referencia_banco || '-',
                    c.concepto_banco || c.notas || '-',
                    `$${formatMoney(c.monto_total)}`
                ]),
                startY: 28,
                theme: 'striped',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
                foot: [[
                    { content: `TOTAL (${filteredCruces.length} cruces):`, colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: `$${formatMoney(totalCruces)}`, styles: { halign: 'right', fontStyle: 'bold' } }
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
            setPreviewFileName(`Conciliacion_Cruces_${cuentaNom}_${hasta}.pdf`);
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

    const seleccionPendientePreview = useMemo(() => {
        if (!selectedPendingKeys.size) {
            return {
                deltaAbonos: 0,
                deltaCargos: 0,
                saldoSistemaProyectado: saldoConciliadoLibros,
                diferenciaProyectada: diferenciaActual,
                esCuadradoProyectado: esDiferenciaCero
            };
        }
        let deltaAbonos = 0;
        let deltaCargos = 0;
        for (const item of pendientes) {
            if (!selectedPendingKeys.has(item.key)) continue;
            if (item.origen_tipo === 'CK') {
                deltaCargos += Number(item.monto_display || item.monto || 0);
            } else if (Number(item.abono || 0) > 0) {
                deltaAbonos += Number(item.abono || 0);
            } else if (Number(item.cargo || 0) > 0) {
                deltaCargos += Number(item.cargo || 0);
            }
        }
        const saldoSistemaProyectado = round2(saldoConciliadoLibros + deltaAbonos - deltaCargos);
        const diferenciaProyectada = round2(saldoBancoActual - saldoSistemaProyectado);
        return {
            deltaAbonos: round2(deltaAbonos),
            deltaCargos: round2(deltaCargos),
            saldoSistemaProyectado,
            diferenciaProyectada,
            esCuadradoProyectado: Math.abs(diferenciaProyectada) < 0.009
        };
    }, [pendientes, selectedPendingKeys, saldoConciliadoLibros, saldoBancoActual, diferenciaActual, esDiferenciaCero]);

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
                        type="button"
                        onClick={() => navigateToBancosTarget(navigate, 'transferencias', currentCuenta ? {
                            empresaId: currentCuenta.empresa_codigo || currentCuenta.empresa_id,
                            cuentaId: currentCuenta.id,
                            numeroCuenta: currentCuenta.numero
                        } : {})}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.825rem' }}
                        title="Abrir pantalla de Transferencias Internas entre cuentas"
                    >
                        <ArrowRightLeft size={15} /> Transferencia Interna
                    </button>
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', height: '36px', fontSize: '0.825rem' }}
                    >
                        <UploadCloud size={16} /> Importar Extracto
                    </button>
                    {permFlags.can_manage_reglas && (
                        <button
                            type="button"
                            onClick={handleOpenReglasModal}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', height: '36px', fontSize: '0.825rem' }}
                            title="Reglas automáticas de clasificación para extractos bancarios"
                        >
                            <Sliders size={15} /> Reglas IA
                        </button>
                    )}
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
                    <div style={{ flex: '1 1 190px', minWidth: 0 }}>
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

                    <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                            <Landmark size={14} /> Cuenta Bancaria:
                        </label>
                        <select
                            value={selectedCuentaId}
                            onChange={(e) => {
                                const val = e.target.value;
                                isSaldoManualDirtyRef.current = false;
                                setIsSaldoManualDirty(false);
                                setAgingFilter('TODOS');
                                setSelectedCuentaId(val);
                                const acc = cuentas.find(c => String(c.id) === String(val));
                                saveBancosSelection({
                                    empresaId: acc?.empresa_codigo || selectedEmpresa,
                                    cuentaId: val,
                                    numeroCuenta: acc?.numero || ''
                                });
                            }}
                            style={{ width: '100%', height: '36px', borderRadius: 'var(--border-radius)', padding: '0 0.5rem', fontWeight: '500', fontSize: '0.825rem' }}
                        >
                            {sortCuentas(cuentasFiltradas).map(c => (
                                <option key={c.id} value={c.id}>
                                    {formatCuentaLabel(c)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: '1 1 150px', minWidth: 0 }}>
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

                    <div style={{ flex: '1 1 130px', maxWidth: '150px' }}>
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

                    <div style={{ flex: '1 1 130px', maxWidth: '150px' }}>
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

            {/* 3.5 Barra Fija (Sticky) y Flujo Guiado en 3 Bloques (R5.6) */}
            <div className="card glass" style={{
                position: isMobile ? 'static' : 'sticky',
                top: isMobile ? undefined : '0px',
                zIndex: 25,
                padding: '0.7rem 1rem',
                background: 'var(--card-bg)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.32)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem'
            }}>
                <div className="form-grid form-grid-3" style={{ gap: '0.65rem', alignItems: 'stretch' }}>
                    {/* Bloque 1: Saldo Banco (Extracto) */}
                    <div style={{
                        minWidth: 0,
                        padding: '0.6rem 0.75rem',
                        borderRadius: 'var(--border-radius)',
                        background: 'rgba(59, 130, 246, 0.06)',
                        border: '1px solid rgba(59, 130, 246, 0.28)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.4rem'
                    }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#93c5fd' }}>
                                1. Saldo Banco (Extracto)
                            </span>
                            {isSaldoManualDirty && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        isSaldoManualDirtyRef.current = false;
                                        setIsSaldoManualDirty(false);
                                        setSaldoBancoManual(resumen?.saldo_banco !== undefined ? String(resumen.saldo_banco) : '0');
                                    }}
                                    title="Restaurar al último saldo validado en servidor"
                                    style={{ background: 'none', border: 'none', padding: 0, color: '#93c5fd', cursor: 'pointer', fontSize: '0.68rem', textDecoration: 'underline', minHeight: 'auto' }}
                                >
                                    Restaurar
                                </button>
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="saldo-banco-real-manual"
                                style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', marginBottom: '0.2rem' }}
                            >
                                *SALDO BANCO REAL (MANUAL)
                            </label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-muted)' }}>$</span>
                                <input
                                    id="saldo-banco-real-manual"
                                    type="text"
                                    inputMode="decimal"
                                    value={saldoBancoManual}
                                    onChange={e => {
                                        isSaldoManualDirtyRef.current = true;
                                        setIsSaldoManualDirty(true);
                                        setSaldoBancoManual(e.target.value);
                                    }}
                                    placeholder="0.00"
                                    title="Digite manualmente el saldo real visible en su banca en línea o estado de cuenta"
                                    style={{
                                        width: '100%',
                                        height: '36px',
                                        paddingLeft: '22px',
                                        paddingRight: '0.65rem',
                                        fontWeight: '700',
                                        fontSize: '0.95rem',
                                        textAlign: 'right',
                                        background: 'rgba(0,0,0,0.3)',
                                        border: '2px solid rgba(59, 130, 246, 0.55)'
                                    }}
                                />
                            </div>
                        </div>

                        <div
                            style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem', fontSize: '0.74rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.35rem' }}
                            title="Saldo en Chequera (Libros): incluye movimientos y cheques emitidos aún en tránsito"
                        >
                            <span style={{ fontWeight: 700 }}>SALDO CHEQUERA (CK)</span>
                            <strong style={{ color: 'var(--text)', fontSize: '0.84rem' }}>{formatSignedMoney(saldoChequeraActual)}</strong>
                        </div>
                        {Number(resumen.saldo_inicial || 0) !== 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#93c5fd' }}>
                                Saldo Inicial: <strong>{formatSignedMoney(resumen.saldo_inicial)}</strong>
                                {resumen.fecha_saldo_inicial ? ` (desde ${resumen.fecha_saldo_inicial})` : ''}
                            </div>
                        )}
                    </div>

                    {/* Bloque 2: Partidas en Tránsito */}
                    <div style={{
                        minWidth: 0,
                        padding: '0.6rem 0.75rem',
                        borderRadius: 'var(--border-radius)',
                        background: 'rgba(245, 158, 11, 0.05)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.4rem'
                    }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#fbbf24' }}>
                                2. Partidas en Tránsito
                            </span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px', background: 'rgba(245, 158, 11, 0.14)', color: '#fbbf24' }}>
                                {pendientes.length} pend.
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.76rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>(−) Abonos en Tránsito</span>
                                <strong style={{ color: '#10b981' }}>{formatSignedMoney(abonosEnTransito)}</strong>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>(+) Cheques/Cargos en Tránsito</span>
                                <strong style={{ color: '#f59e0b' }}>{formatSignedMoney(cargosChequesEnTransito)}</strong>
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.35rem 0.55rem',
                                borderRadius: 'var(--border-radius)',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--border)'
                            }}
                            title="Saldo Banco según Sistema (Aplicado) = Saldo Chequera (CK) − Abonos en Tránsito + Cheques/Cargos en Tránsito"
                        >
                            <span style={{ fontSize: '0.71rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                SALDO BANCO (SISTEMA)
                            </span>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                                {formatSignedMoney(saldoConciliadoLibros)}
                            </strong>
                        </div>

                        {Number(resumen.cheques_reservados_count || 0) > 0 && (
                            <div style={{ fontSize: '0.7rem', color: '#fbbf24', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem' }}>
                                <AlertTriangle size={12} />
                                <span>{resumen.cheques_reservados_count} ch. reservado(s) excluidos ({formatSignedMoney(resumen.cheques_reservados_monto)})</span>
                            </div>
                        )}
                    </div>

                    {/* Bloque 3: Diferencia ($0.00) */}
                    <div style={{
                        minWidth: 0,
                        padding: '0.6rem 0.75rem',
                        borderRadius: 'var(--border-radius)',
                        background: esDiferenciaCero ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                        border: `1px solid ${esDiferenciaCero ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.45rem'
                    }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: esDiferenciaCero ? '#34d399' : '#f87171' }}>
                                3. Diferencia ($0.00)
                            </span>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '0.1rem 0.45rem',
                                borderRadius: '999px',
                                background: esDiferenciaCero ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                                color: esDiferenciaCero ? '#34d399' : '#f87171'
                            }}>
                                {esDiferenciaCero ? 'Cuadrado' : 'Por cuadrar'}
                            </span>
                        </div>

                        <div style={{
                            minHeight: '36px',
                            padding: '0.25rem 0.7rem',
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.4rem',
                            fontWeight: '800',
                            fontSize: '0.98rem',
                            background: esDiferenciaCero ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: `2px solid ${esDiferenciaCero ? '#10b981' : '#ef4444'}`,
                            color: esDiferenciaCero ? '#10b981' : '#ef4444',
                            borderRadius: 'var(--border-radius)'
                        }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontWeight: 800 }}>
                                {esDiferenciaCero ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                                DIF (REAL − SISTEMA)
                            </span>
                            <span>{formatSignedMoney(diferenciaActual)}</span>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setCerrarPeriodoCheck(false);
                                setConfirmarConDiferencia(false);
                                setNotasValidacion(`Validación conciliación al ${hasta}`);
                                setShowValidationModal(true);
                            }}
                            className="btn-primary"
                            style={{
                                width: '100%',
                                height: '36px',
                                padding: '0 1rem',
                                fontWeight: '700',
                                fontSize: '0.82rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.4rem',
                                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                            }}
                        >
                            <CheckSquare size={15} /> PROCESAR Y GUARDAR
                        </button>
                    </div>
                </div>

                {/* Vista previa en tiempo real al seleccionar pendientes */}
                {activeTab === 'PENDIENTES' && selectedPendingKeys.size > 0 && (
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.45rem',
                        padding: '0.32rem 0.65rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        background: seleccionPendientePreview.esCuadradoProyectado ? 'rgba(16, 185, 129, 0.16)' : 'rgba(59, 130, 246, 0.14)',
                        border: `1px solid ${seleccionPendientePreview.esCuadradoProyectado ? 'rgba(16, 185, 129, 0.45)' : 'rgba(59, 130, 246, 0.35)'}`,
                        color: seleccionPendientePreview.esCuadradoProyectado ? '#6ee7b7' : '#bfdbfe',
                        fontWeight: 600
                    }}>
                        <span>
                            Al conciliar {selectedPendingKeys.size} selec.: Sistema <strong>{formatSignedMoney(seleccionPendientePreview.saldoSistemaProyectado)}</strong> · Dif <strong>{formatSignedMoney(seleccionPendientePreview.diferenciaProyectada)}</strong>
                        </span>
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
                        onClick={() => { setActiveTab('CRUCES'); setSelectedPendingKeys(new Set()); refreshCrucesActivos(); }}
                        className={activeTab === 'CRUCES' ? 'btn-primary' : 'btn-secondary'}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', height: '36px', padding: '0 1rem', fontWeight: '600', fontSize: '0.82rem' }}
                        title="Cruces agrupados N:1, 1:N y N:M activos"
                    >
                        <Layers size={15} /> CRUCES ({crucesActivos.length})
                    </button>

                    <button
                        onClick={() => { setActiveTab('TRANSFERENCIAS'); setSelectedPendingKeys(new Set()); }}
                        className={activeTab === 'TRANSFERENCIAS' ? 'btn-primary' : 'btn-secondary'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            height: '36px',
                            padding: '0 1rem',
                            fontWeight: '600',
                            fontSize: '0.82rem',
                            borderColor: (transferenciasInternas.total_sugerencias_espejo > 0 || transferenciasInternas.total_asimetricas > 0) && activeTab !== 'TRANSFERENCIAS'
                                ? 'rgba(139, 92, 246, 0.55)'
                                : undefined
                        }}
                        title="Transferencias internas vinculadas y espejos detectados entre cuentas de las empresas"
                    >
                        <ArrowRightLeft size={15} /> TRANSFERENCIAS ({(transferenciasInternas.vinculadas?.length || 0) + (transferenciasInternas.sugerencias_espejo?.length || 0)})
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

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 240px', minWidth: 0, justifyContent: 'flex-end' }}>
                    {(activeTab === 'MOVIMIENTOS' || activeTab === 'PENDIENTES') && (
                        <button
                            type="button"
                            onClick={() => setOnlyInternalTransfers(prev => !prev)}
                            className={onlyInternalTransfers ? 'btn-primary' : 'btn-secondary'}
                            style={{
                                height: '36px',
                                padding: '0 0.75rem',
                                fontSize: '0.78rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                borderColor: onlyInternalTransfers ? undefined : 'rgba(139, 92, 246, 0.35)'
                            }}
                            title="Filtrar solo movimientos identificados como transferencias internas"
                        >
                            <ArrowRightLeft size={14} /> Solo Transf. Internas
                        </button>
                    )}
                    <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px', maxWidth: '100%' }}>
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
                                style={{ height: '32px', fontSize: '0.82rem', width: '138px' }}
                            />
                            <button
                                onClick={handleConciliarSeleccionados}
                                disabled={selectedPendingKeys.size === 0 || submitting}
                                className="btn-primary"
                                style={{ height: '32px', padding: '0 0.8rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Check size={14} /> {submitting ? 'Procesando...' : `CONCILIAR (${selectedPendingKeys.size})`}
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenCruceModal}
                                disabled={pendientes.length === 0 || submitting}
                                className="btn-secondary"
                                style={{ height: '32px', padding: '0 0.75rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem', borderColor: selectedPendingKeys.size >= 1 ? 'rgba(99, 102, 241, 0.5)' : undefined }}
                                title="Agrupar múltiples pendientes contra 1 movimiento bancario o viceversa (N:1 / 1:N / N:M)"
                            >
                                <Layers size={14} /> Cruce Agrupado
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* R3.3 Barra de Antigüedad de Cheques en Tránsito (solo en PENDIENTES) */}
            {activeTab === 'PENDIENTES' && (agingResumen?.total_cheques || 0) > 0 && (
                <div className="card glass" style={{ padding: '0.65rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                        <Clock size={15} style={{ color: '#f59e0b' }} />
                        <span style={{ fontWeight: 700 }}>Antigüedad Cheques en Tránsito:</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                            <strong>{agingResumen.total_cheques}</strong> ch. · <strong style={{ color: 'var(--text)' }}>${formatMoney(agingResumen.total_monto)}</strong>
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => setAgingFilter('TODOS')}
                            className={agingFilter === 'TODOS' ? 'btn-primary' : 'btn-secondary'}
                            style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.74rem' }}
                        >
                            Todos ({pendientes.length})
                        </button>
                        {(agingResumen.buckets_list || []).map(b => (
                            <button
                                key={b.bucket}
                                type="button"
                                onClick={() => setAgingFilter(prev => (prev === b.bucket ? 'TODOS' : b.bucket))}
                                className={agingFilter === b.bucket ? 'btn-primary' : 'btn-secondary'}
                                style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.74rem' }}
                            >
                                {b.bucket === '>180' ? '>180d Caducos' : `${b.bucket}d`} ({b.count} · ${formatMoney(b.total_monto)})
                            </button>
                        ))}
                        {Number(agingResumen.por_caducar_count || 0) > 0 && (
                            <button
                                type="button"
                                onClick={() => setAgingFilter(prev => (prev === 'POR_CADUCAR' ? 'TODOS' : 'POR_CADUCAR'))}
                                className={agingFilter === 'POR_CADUCAR' ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    height: '28px',
                                    padding: '0 0.65rem',
                                    fontSize: '0.74rem',
                                    borderColor: 'rgba(249, 115, 22, 0.5)',
                                    color: agingFilter === 'POR_CADUCAR' ? '#fff' : '#fb923c'
                                }}
                            >
                                Por caducar 150-180d ({agingResumen.por_caducar_count} · ${formatMoney(agingResumen.por_caducar_monto)})
                            </button>
                        )}
                    </div>
                </div>
            )}

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
                                            {(sug.comprobantes_count > 0 || sug.comprobante_url || sug.signed_url) && (
                                                <> · <button
                                                    type="button"
                                                    onClick={() => openReceiptLightbox(sug, 0, 'Control de Pagos')}
                                                    style={{ background: 'none', border: 'none', padding: 0, color: '#38bdf8', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                >
                                                    <Paperclip size={11} /> Ver comprobante ({sug.comprobantes_count || sug.comprobantes?.length || 1})
                                                </button></>
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
            ) : activeTab === 'TRANSFERENCIAS' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    {filteredSugerenciasEspejo.length > 0 && (
                        <div className="card glass table-responsive" style={{ padding: 0, border: '1px solid rgba(139, 92, 246, 0.4)' }}>
                            <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', background: 'rgba(139, 92, 246, 0.08)' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                    <Sparkles size={15} /> Posibles Transferencias Internas sin Vincular ({filteredSugerenciasEspejo.length})
                                </div>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                    Emparejadas automáticamente por monto exacto, dirección opuesta y ventana de fechas (±5 días)
                                </span>
                            </div>
                            <table style={{ minWidth: '940px', width: '100%', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>Mov. Cuenta Actual</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>Mov. Espejo Detectado (Otra Cuenta)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>Motivo / Confianza</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase' }}>Monto</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSugerenciasEspejo.map((sug, idx) => (
                                        <tr key={`${sug.movimiento_local_id}-${sug.movimiento_contraparte_id}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <div style={{ fontWeight: 700 }}>
                                                    {sug.movimiento_local_direccion} · {sug.movimiento_local_fecha_display} · #{sug.movimiento_local_documento || sug.movimiento_local_id}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sug.movimiento_local_concepto}</div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <div style={{ fontWeight: 700, color: '#93c5fd' }}>
                                                    {sug.contraparte_direccion} · {sug.banco_nombre} #{sug.numero_cuenta}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {sug.empresa_nombre} · {sug.contraparte_fecha_display} · #{sug.contraparte_documento || sug.movimiento_contraparte_id}
                                                    {sug.intercompany && <span style={{ marginLeft: '6px', color: '#c4b5fd', fontWeight: 700 }}>(Inter-Empresa)</span>}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem' }}>
                                                <span style={{
                                                    padding: '0.12rem 0.4rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.68rem',
                                                    fontWeight: 700,
                                                    background: sug.confianza === 'ALTA' ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)',
                                                    color: sug.confianza === 'ALTA' ? '#34d399' : '#fbbf24',
                                                    marginRight: '6px'
                                                }}>
                                                    {sug.confianza}
                                                </span>
                                                <span style={{ color: 'var(--text-muted)' }}>{sug.motivo}</span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800 }}>
                                                ${formatMoney(sug.monto)}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    disabled={submitting}
                                                    onClick={() => handleVincularEspejoExistente(sug)}
                                                    className="btn-primary"
                                                    style={{ height: '28px', padding: '0 0.7rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Link2 size={13} /> Vincular Transferencia
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                <ArrowRightLeft size={15} color="var(--primary)" /> Transferencias Internas Vinculadas ({filteredTransferenciasVinculadas.length})
                            </div>
                            <button
                                type="button"
                                onClick={() => navigateToBancosTarget(navigate, 'transferencias', currentCuenta ? {
                                    empresaId: currentCuenta.empresa_codigo || currentCuenta.empresa_id,
                                    cuentaId: currentCuenta.id,
                                    numeroCuenta: currentCuenta.numero
                                } : {})}
                                className="btn-secondary"
                                style={{ height: '28px', padding: '0 0.7rem', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                                <Plus size={13} /> Nueva Transferencia
                            </button>
                        </div>
                        <table style={{ minWidth: '960px', width: '100%', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>Correlativo / Ref</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>Fecha</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase' }}>Dir.</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase' }}>Cuenta Contraparte</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase' }}>Simetría</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase' }}>Monto</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransferenciasVinculadas.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                            No hay transferencias internas vinculadas en el rango seleccionado.
                                        </td>
                                    </tr>
                                ) : filteredTransferenciasVinculadas.map(t => (
                                    <tr key={`${t.transfer_group_id}-${t.id}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <td style={{ padding: '0.45rem 0.5rem', fontFamily: 'monospace', fontWeight: 700 }}>
                                            <div>{t.transfer_group_id}</div>
                                            {t.documento && t.documento !== t.transfer_group_id && (
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ref: {t.documento}</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                            <div>{t.fecha_display}</div>
                                            {t.fecha_aplicado_display && (
                                                <div style={{ fontSize: '0.7rem', color: '#34d399' }}>Apl: {t.fecha_aplicado_display}</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '0.12rem 0.45rem',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                background: t.direccion === 'CARGO' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(16, 185, 129, 0.16)',
                                                color: t.direccion === 'CARGO' ? '#fca5a5' : '#6ee7b7'
                                            }}>
                                                {t.direccion === 'CARGO' ? 'SALIDA (CARGO)' : 'ENTRADA (ABONO)'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem' }}>
                                            {t.transfer_contraparte ? (
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>
                                                        {t.transfer_contraparte.banco_nombre} #{t.transfer_contraparte.numero_cuenta}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                        {t.transfer_contraparte.empresa_nombre}
                                                        {t.transfer_contraparte.intercompany && <span style={{ marginLeft: '5px', color: '#c4b5fd', fontWeight: 700 }}>(Inter-Empresa)</span>}
                                                    </div>
                                                </div>
                                            ) : <span style={{ color: 'var(--text-muted)' }}>Contraparte no disponible</span>}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                            <span style={{
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                background: t.simetrica ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)',
                                                color: t.simetrica ? '#34d399' : '#fbbf24'
                                            }}>
                                                {t.estado_simetria === 'AMBAS_CONCILIADAS' ? '✓ Ambas Conciliadas'
                                                    : t.estado_simetria === 'FALTA_ACTUAL' ? '⏳ Falta Conciliar Aquí'
                                                        : t.estado_simetria === 'FALTA_CONTRAPARTE' ? '◐ Falta Contraparte'
                                                            : '⏳ Ambas Pendientes'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, color: t.direccion === 'CARGO' ? '#ef4444' : '#10b981' }}>
                                            ${formatMoney(t.monto)}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                {!t.conciliado && (
                                                    <button
                                                        type="button"
                                                        disabled={submitting}
                                                        onClick={() => handleConciliarSingle({ id: t.id, origen_tipo: 'MOV', documento: t.documento })}
                                                        className="btn-primary"
                                                        style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.7rem', background: '#10b981' }}
                                                    >
                                                        Conciliar Aquí
                                                    </button>
                                                )}
                                                {t.transfer_contraparte && (
                                                    <button
                                                        type="button"
                                                        onClick={() => navigateToBancosTarget(navigate, 'conciliacion', {
                                                            empresaId: t.transfer_contraparte.empresa_codigo || t.transfer_contraparte.empresa_id,
                                                            cuentaId: t.transfer_contraparte.cuenta_bancaria_id,
                                                            numeroCuenta: t.transfer_contraparte.numero_cuenta
                                                        })}
                                                        className="btn-secondary"
                                                        style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.7rem' }}
                                                    >
                                                        Ver Contraparte
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : activeTab === 'CRUCES' ? (
                <div className="card glass table-responsive" style={{ padding: 0 }}>
                    <table style={{ minWidth: '920px', width: '100%', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Cruce</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Tipo / Dir</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Aplicado</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Referencia / Concepto Banco</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Partidas Vinculadas</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Monto Total</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingCruces ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        Cargando cruces agrupados...
                                    </td>
                                </tr>
                            ) : filteredCruces.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        No hay cruces agrupados activos para esta cuenta. Usa &ldquo;Cruce Agrupado&rdquo; en Pendientes o en el Importador de Extractos.
                                    </td>
                                </tr>
                            ) : filteredCruces.map(c => {
                                const libroIts = (c.items || []).filter(i => i.lado === 'LIBRO');
                                const bancoIts = (c.items || []).filter(i => i.lado === 'BANCO');
                                const isClosedCruce = Boolean(resumen.periodo_cerrado_hasta && c.fecha_aplicado_ymd && c.fecha_aplicado_ymd <= resumen.periodo_cerrado_hasta);
                                return (
                                    <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700, fontFamily: 'monospace' }}>#{c.id}</td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                            <span style={{
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '4px',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                background: 'rgba(99, 102, 241, 0.18)',
                                                color: '#a5b4fc'
                                            }}>
                                                {formatCruceTipoLabel(c.tipo_cruce)} · {c.direccion}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', color: '#10b981', whiteSpace: 'nowrap' }}>
                                            {c.fecha_aplicado_display || c.fecha_aplicado_ymd}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem' }}>
                                            <div style={{ fontWeight: 600 }}>{c.referencia_banco || 'Sin ref.'}</div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {c.concepto_banco || c.notas || '-'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem' }}>
                                            <div>
                                                <strong style={{ color: '#93c5fd' }}>Libros ({libroIts.length}):</strong>{' '}
                                                {libroIts.map(it => `${it.origen_tipo}#${it.documento || it.entidad_id} ($${formatMoney(it.monto)})`).join(', ') || '-'}
                                            </div>
                                            <div style={{ color: 'var(--text-muted)' }}>
                                                <strong style={{ color: '#6ee7b7' }}>Banco ({bancoIts.length}):</strong>{' '}
                                                {bancoIts.map(it => `${it.origen_tipo}${it.documento ? `#${it.documento}` : ''} ($${formatMoney(it.monto)})`).join(', ') || '-'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', color: c.direccion === 'CARGO' ? '#ef4444' : '#10b981' }}>
                                            ${formatMoney(c.monto_total)}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            {isClosedCruce ? (
                                                <span title="Período cerrado" style={{ color: 'var(--text-muted)' }}><Lock size={14} /></span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={submitting}
                                                    onClick={() => handleDesconciliarCruce(c.id)}
                                                    className="btn-secondary"
                                                    style={{ height: '28px', padding: '0 0.6rem', fontSize: '0.72rem', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Unlink size={13} /> Desconciliar
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
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
                                        (row.cruce_id
                                            ? (row.fecha_aplicado_ymd && row.fecha_aplicado_ymd <= resumen.periodo_cerrado_hasta)
                                            : ((row.fecha_aplicado_ymd && row.fecha_aplicado_ymd <= resumen.periodo_cerrado_hasta) ||
                                               (row.fecha_ymd && row.fecha_ymd <= resumen.periodo_cerrado_hasta && activeTab === 'MOVIMIENTOS')))
                                    );
                                    const agingMeta = activeTab === 'PENDIENTES' && row.origen_tipo === 'CK' && row.dias_circulacion !== undefined && row.dias_circulacion !== null
                                        ? getAgingBadgeMeta(row)
                                        : null;
                                    const hasReceipt = row.origen_tipo === 'MOV' && (row.comprobantes_count > 0 || row.comprobante_url || row.signed_url);

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
                                                <div>{row.documento || '-'}</div>
                                                {row.es_transferencia_interna && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '2px', fontFamily: 'inherit' }}>
                                                        <span style={{
                                                            fontSize: '0.67rem',
                                                            fontWeight: 700,
                                                            padding: '0.1rem 0.35rem',
                                                            borderRadius: '4px',
                                                            background: 'rgba(139, 92, 246, 0.18)',
                                                            color: '#c4b5fd',
                                                            border: '1px solid rgba(139, 92, 246, 0.35)'
                                                        }}>
                                                            ⇄ {row.transfer_contraparte?.intercompany ? 'Inter-Empresa' : 'Transf. Interna'}
                                                        </span>
                                                        {row.transfer_contraparte && (
                                                            <span style={{
                                                                fontSize: '0.66rem',
                                                                fontWeight: 600,
                                                                padding: '0.1rem 0.35rem',
                                                                borderRadius: '4px',
                                                                background: row.transfer_contraparte.conciliado ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                                                                color: row.transfer_contraparte.conciliado ? '#34d399' : '#fbbf24'
                                                            }}>
                                                                {Number(row.cargo) > 0 ? '→' : '←'} {row.transfer_contraparte.banco_nombre} #{row.transfer_contraparte.numero_cuenta} ({row.transfer_contraparte.conciliado ? 'Conc.' : 'Pend.'})
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {agingMeta && (
                                                    <span style={{
                                                        display: 'inline-block',
                                                        marginTop: '2px',
                                                        fontFamily: 'inherit',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        padding: '0.1rem 0.35rem',
                                                        borderRadius: '4px',
                                                        background: agingMeta.bg,
                                                        color: agingMeta.color,
                                                        border: `1px solid ${agingMeta.border}`
                                                    }}>
                                                        {row.dias_circulacion}d · {agingMeta.text}
                                                    </span>
                                                )}
                                                {activeTab === 'MOVIMIENTOS' && row.cruce_id && (
                                                    <span style={{
                                                        display: 'inline-block',
                                                        marginTop: '2px',
                                                        fontFamily: 'inherit',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        padding: '0.1rem 0.35rem',
                                                        borderRadius: '4px',
                                                        background: 'rgba(99, 102, 241, 0.16)',
                                                        color: '#a5b4fc',
                                                        border: '1px solid rgba(99, 102, 241, 0.35)'
                                                    }}>
                                                        Cruce #{row.cruce_id} ({formatCruceTipoLabel(row.cruce_tipo)})
                                                    </span>
                                                )}
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
                                                    {hasReceipt && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openReceiptLightbox(row, 0, 'Movimiento Bancario')}
                                                            className="icon-btn"
                                                            title={`Ver comprobante(s) (${row.comprobantes_count || row.comprobantes?.length || 1})`}
                                                            style={{ padding: '4px', color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.72rem' }}
                                                        >
                                                            <Paperclip size={14} />
                                                            <span>{row.comprobantes_count || row.comprobantes?.length || 1}</span>
                                                        </button>
                                                    )}
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
                                                                title={row.cruce_id ? `Desconciliar Cruce Agrupado #${row.cruce_id}` : 'Desconciliar documento'}
                                                                style={{ padding: '4px', color: '#ef4444' }}
                                                            >
                                                                {row.cruce_id ? <Unlink size={15} /> : <X size={15} />}
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

            {/* ── MODAL 1: IMPORTADOR DE EXTRACTO BANCARIO MULTIBANCO ── */}
            <Modal
                open={showImportModal}
                onClose={handleRequestCloseImportModal}
                title="Importar Extracto Bancario Multibanco (Excel / CSV / PDF / Imágenes IA)"
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
                        <div style={{ flex: '1 1 190px', minWidth: 0 }}>
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

                        <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                                Cargar Excel/CSV o PDF (≤15MB) / Imágenes IA (1-10, ≤10MB c/u):
                            </label>
                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv,.pdf,image/png,image/jpeg,image/webp"
                                multiple
                                onChange={handleFileUpload}
                                style={{ width: '100%', fontSize: '0.8rem' }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignSelf: 'flex-end' }}>
                            {permFlags.can_manage_reglas && (
                                <button
                                    type="button"
                                    onClick={handleOpenReglasModal}
                                    className="btn-secondary"
                                    style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                                >
                                    <Sliders size={14} /> Reglas IA
                                </button>
                            )}
                            <button
                                onClick={handleParseExtracto}
                                disabled={isParsing || (importMode === 'AI_MEDIA' ? importFiles.length === 0 : !importRawText.trim())}
                                className="btn-primary"
                                style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}
                            >
                                {isParsing ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
                                {isParsing
                                    ? (importMode === 'AI_MEDIA' ? 'Analizando con Gemini IA...' : 'Analizando...')
                                    : (importMode === 'AI_MEDIA' ? 'Analizar PDF/Imágenes con IA' : 'Analizar Extracto')}
                            </button>
                        </div>
                    </div>

                    {importMode === 'AI_MEDIA' && importFiles.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--border-radius)', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#c4b5fd', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <FileText size={14} /> Archivos IA ({importFiles.length}):
                            </span>
                            {importFiles.map((f, idx) => (
                                <span key={idx} style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '999px',
                                    fontSize: '0.74rem',
                                    background: 'rgba(0,0,0,0.25)',
                                    border: '1px solid rgba(255,255,255,0.12)'
                                }}>
                                    <span>{f.nombre_original}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                                        ({(Number(f.sizeBytes || 0) / (1024 * 1024)).toFixed(2)} MB)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveImportFile(idx)}
                                        style={{ background: 'none', border: 'none', padding: 0, color: '#f87171', cursor: 'pointer', display: 'inline-flex' }}
                                        title="Quitar archivo"
                                    >
                                        <X size={13} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>
                            O pega directamente aquí las filas copiadas de tu Excel o Banca en Línea:
                        </label>
                        <textarea
                            rows={3}
                            placeholder="Pega aquí las filas copiadas (Ctrl+V)... Ejemplo: 28/08/2026   10004567   REMESA CUENTA CORRIENTE SERSAPROSA   $250.00"
                            value={importRawText}
                            onChange={e => {
                                setImportRawText(e.target.value);
                                if (e.target.value.trim() && importMode === 'AI_MEDIA') {
                                    setImportMode('TEXT');
                                    setImportFiles([]);
                                }
                            }}
                            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem', padding: '0.5rem' }}
                        />
                    </div>

                    {parsedExtract && parsedExtract.transacciones && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {/* Diagnóstico del extracto + metadata IA/Reglas */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', padding: '0.65rem 0.85rem', borderRadius: 'var(--border-radius)', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)', fontSize: '0.76rem', alignItems: 'center' }}>
                                {parsedExtract.origen_parser && (
                                    <span style={{ padding: '0.12rem 0.45rem', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', fontWeight: 700 }}>
                                        {parsedExtract.origen_parser}
                                    </span>
                                )}
                                {parsedExtract.banco_detectado && (
                                    <span>Banco: <strong>{parsedExtract.banco_detectado}</strong></span>
                                )}
                                {parsedExtract.moneda && (
                                    <span>Moneda: <strong>{parsedExtract.moneda}</strong></span>
                                )}
                                {parsedExtract.model_used && (
                                    <span style={{ color: 'var(--text-muted)' }}>Modelo: <strong>{parsedExtract.model_used}</strong></span>
                                )}
                                {parsedExtract.paginas_procesadas !== undefined && parsedExtract.paginas_procesadas !== null && (
                                    <span>Páginas: <strong>{parsedExtract.paginas_procesadas}</strong></span>
                                )}
                                {Number(parsedExtract.reglas_aplicadas_count || 0) > 0 && (
                                    <span style={{ padding: '0.12rem 0.45rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.18)', color: '#34d399', fontWeight: 700 }}>
                                        Reglas IA aplicadas: {parsedExtract.reglas_aplicadas_count}
                                    </span>
                                )}
                                {Number(parsedExtract.resumen_extracto?.transferencias_internas_detectadas || 0) > 0 && (
                                    <span style={{ padding: '0.12rem 0.45rem', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', fontWeight: 700 }}>
                                        ⇄ Transf. Internas: {parsedExtract.resumen_extracto.transferencias_internas_detectadas}
                                    </span>
                                )}
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
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => setShowImportCruceBuilder(v => !v)}
                                        className="btn-secondary"
                                        style={{ height: '24px', padding: '0 0.55rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Layers size={12} /> {showImportCruceBuilder ? 'Ocultar Cruce Manual' : 'Cruce Agrupado Manual (N:1 / 1:N)'}
                                    </button>
                                    {parsedExtract.filas_descartadas?.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowDiscardedRows(v => !v)}
                                            className="btn-secondary"
                                            style={{ height: '24px', padding: '0 0.5rem', fontSize: '0.72rem' }}
                                        >
                                            {showDiscardedRows ? 'Ocultar' : 'Ver'} {parsedExtract.filas_descartadas.length} fila(s) omitida(s)
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Sugerencias automáticas de cruces agrupados (N:1 / 1:N) */}
                            {Array.isArray(parsedExtract.sugerencias_cruces_agrupados) && parsedExtract.sugerencias_cruces_agrupados.length > 0 && (
                                <div style={{ padding: '0.65rem 0.85rem', borderRadius: 'var(--border-radius)', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.35)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <Layers size={14} /> Sugerencias de Cruce Agrupado Detectadas ({parsedExtract.sugerencias_cruces_agrupados.length})
                                    </div>
                                    {parsedExtract.sugerencias_cruces_agrupados.map((sug, sIdx) => {
                                        const applied = appliedSugerenciaIdxs.has(sIdx);
                                        return (
                                            <div key={sIdx} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.6rem', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', fontSize: '0.75rem' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div>
                                                        <strong>{formatCruceTipoLabel(sug.tipo_cruce)} · {sug.direccion}</strong> · Monto: <strong>${formatMoney(sug.monto_total)}</strong>
                                                    </div>
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                                        {sug.nota_sugerida || `${(sug.libro_items || []).length} partida(s) libros ↔ ${(sug.banco_items || []).length} fila(s) banco`}
                                                    </div>
                                                </div>
                                                {applied ? (
                                                    <span style={{ color: '#10b981', fontWeight: 700 }}>✓ Aplicado</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled={submitting}
                                                        onClick={() => handleApplySugerenciaCruce(sug, sIdx)}
                                                        className="btn-primary"
                                                        style={{ height: '28px', padding: '0 0.7rem', fontSize: '0.74rem', background: '#10b981' }}
                                                    >
                                                        Aplicar Sugerencia
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Constructor Manual de Cruce Agrupado dentro del Importador */}
                            {showImportCruceBuilder && (
                                <div style={{ padding: '0.75rem', borderRadius: 'var(--border-radius)', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.76rem' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                        <strong style={{ color: '#6ee7b7' }}>Constructor Manual de Cruce Agrupado (Extracto ↔ Pendientes Libros)</strong>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
                                            <span>Banco ({importCruceSummary.selectedBank.length}): <strong>${formatMoney(importCruceSummary.sumBanco)}</strong></span>
                                            <span>Libros ({importCruceSummary.selectedLibro.length}): <strong>${formatMoney(importCruceSummary.sumLibro)}</strong></span>
                                            <span style={{ color: Math.abs(importCruceSummary.diff) <= 0.005 ? '#10b981' : '#f87171', fontWeight: 700 }}>
                                                Dif: ${formatMoney(importCruceSummary.diff)}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={!importCruceSummary.isValid || submitting}
                                                onClick={handleCreateManualImportCruce}
                                                className="btn-primary"
                                                style={{ height: '28px', padding: '0 0.75rem', fontSize: '0.74rem' }}
                                            >
                                                {importCruceSummary.tipoCruce ? `Crear Cruce ${formatCruceTipoLabel(importCruceSummary.tipoCruce)}` : 'Seleccione N:1 / 1:N / N:M'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="form-grid form-grid-2" style={{ gap: '0.65rem' }}>
                                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem' }}>
                                            <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>1. Filas del Extracto (sin procesar):</div>
                                            {parsedExtract.transacciones.map((t, idx) => {
                                                if (t.procesado || t.es_duplicado_probable) return null;
                                                const checked = importCruceExtractIndices.has(idx);
                                                return (
                                                    <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0', cursor: 'pointer', fontSize: '0.74rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => {
                                                                setImportCruceExtractIndices(prev => {
                                                                    const n = new Set(prev);
                                                                    if (n.has(idx)) n.delete(idx);
                                                                    else n.add(idx);
                                                                    return n;
                                                                });
                                                            }}
                                                            style={{ width: '16px', height: '16px' }}
                                                        />
                                                        <span>{t.fecha} · {t.tipo} · {t.documento || 'S/D'} · <strong>${formatMoney(t.monto)}</strong> — {String(t.descripcion || '').slice(0, 35)}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.4rem' }}>
                                            <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-muted)' }}>2. Partidas Pendientes en Libros:</div>
                                            {pendientes.map(p => {
                                                const checked = importCruceLibroKeys.has(p.key);
                                                return (
                                                    <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0', cursor: 'pointer', fontSize: '0.74rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => {
                                                                setImportCruceLibroKeys(prev => {
                                                                    const n = new Set(prev);
                                                                    if (n.has(p.key)) n.delete(p.key);
                                                                    else n.add(p.key);
                                                                    return n;
                                                                });
                                                            }}
                                                            style={{ width: '16px', height: '16px' }}
                                                        />
                                                        <span>{p.fecha_display} · {getRowDirection(p)} · {p.origen_tipo}#{p.documento || p.id} · <strong>${formatMoney(p.monto_display || p.monto)}</strong></span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {showDiscardedRows && parsedExtract.filas_descartadas?.length > 0 && (
                                <div style={{ maxHeight: '110px', overflowY: 'auto', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.72rem' }}>
                                    {parsedExtract.filas_descartadas.map((fd, idx) => (
                                        <div key={idx}>Fila {fd.fila}: <strong>{fd.motivo}</strong> — {fd.contenido}</div>
                                    ))}
                                </div>
                            )}

                            <div className="table-responsive" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                                <table style={{ minWidth: '1000px', width: '100%', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <th style={{ width: '36px', textAlign: 'center', padding: '0.45rem 0.5rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleSelectAllExtract}
                                                    style={{ background: 'none', color: 'var(--primary)', padding: 0 }}
                                                    title="Seleccionar / Deseleccionar todos"
                                                >
                                                    <CheckSquare size={15} />
                                                </button>
                                            </th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>FECHA</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>DOC</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>DESCRIPCIÓN / AUTOCLASIFICACIÓN</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>MONTO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>TIPO</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>ESTADO DE CRUCE</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>ACCIÓN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedExtract.transacciones.map((t, idx) => {
                                            const hasMatch = Boolean(t.match);
                                            const isSelected = selectedExtractIndices.has(idx);
                                            const isDup = Boolean(t.es_duplicado_probable);
                                            const isDiffAlert = t.matchType === 'ALERTA_DIFERENCIA_MONTO';
                                            const canInlineEdit = !t.procesado && !hasMatch && !isDup;

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
                                                    <td style={{ textAlign: 'center', padding: '0.45rem 0.5rem' }}>
                                                        <button
                                                            type="button"
                                                            disabled={t.procesado || isDup}
                                                            onClick={() => handleToggleSelectExtract(idx)}
                                                            style={{ background: 'none', color: isSelected ? 'var(--primary)' : 'var(--text-muted)', padding: 0, opacity: (t.procesado || isDup) ? 0.35 : 1 }}
                                                        >
                                                            {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                                                        </button>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{t.fecha}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontFamily: 'monospace', fontWeight: '600' }}>{t.documento || '-'}</td>
                                                    <td style={{ padding: '0.45rem 0.5rem', maxWidth: '330px' }} title={t.descripcion}>
                                                        <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.descripcion}</div>
                                                        {t.regla_aplicada && (
                                                            <div style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 700, marginTop: '2px' }}>
                                                                Regla IA: {t.regla_aplicada.nombre}
                                                            </div>
                                                        )}
                                                        {canInlineEdit ? (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '4px' }}>
                                                                <input
                                                                    type="text"
                                                                    value={t.concepto_limpio ?? t.conceptoSugerido ?? ''}
                                                                    placeholder="Concepto limpio..."
                                                                    onChange={e => updateExtractRowClassification(idx, { concepto_limpio: e.target.value.toUpperCase() })}
                                                                    style={{ flex: '2 1 140px', height: '26px', fontSize: '0.72rem', padding: '0 0.4rem', textTransform: 'uppercase' }}
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={t.cod_cta || ''}
                                                                    placeholder="Cód. Cta"
                                                                    onChange={e => updateExtractRowClassification(idx, { cod_cta: e.target.value })}
                                                                    style={{ width: '80px', height: '26px', fontSize: '0.72rem', padding: '0 0.4rem' }}
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={t.num_partida || ''}
                                                                    placeholder="Partida"
                                                                    onChange={e => updateExtractRowClassification(idx, { num_partida: e.target.value })}
                                                                    style={{ width: '75px', height: '26px', fontSize: '0.72rem', padding: '0 0.4rem' }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {(t.concepto_limpio || (t.conceptoSugerido && t.conceptoSugerido !== t.descripcion)) && (
                                                                    <div style={{ fontSize: '0.72rem', color: 'var(--primary)', opacity: 0.9 }}>
                                                                        ↳ {t.concepto_limpio || t.conceptoSugerido}
                                                                    </div>
                                                                )}
                                                                {(t.cod_cta || t.num_partida) && (
                                                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                                        {t.cod_cta ? `Cta: ${t.cod_cta}` : ''}
                                                                        {t.cod_cta && t.num_partida ? ' · ' : ''}
                                                                        {t.num_partida ? `Partida: ${t.num_partida}` : ''}
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: t.tipo === 'CARGO' ? '#ef4444' : '#10b981', whiteSpace: 'nowrap' }}>
                                                        ${formatMoney(t.monto)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                        {canInlineEdit && tiposRemesasCuenta.length > 0 ? (
                                                            <select
                                                                value={t.tipo_remesa_codigo || (t.tipo === 'CARGO' ? 'NC' : 'RM')}
                                                                onChange={e => {
                                                                    const cod = e.target.value;
                                                                    const tr = tiposRemesasCuenta.find(r => String(r.codigo || r.id) === String(cod));
                                                                    updateExtractRowClassification(idx, {
                                                                        tipo_remesa_codigo: cod,
                                                                        tipo_remesa_id: tr?.id || null
                                                                    });
                                                                }}
                                                                style={{ height: '26px', fontSize: '0.72rem', padding: '0 0.35rem', width: '78px' }}
                                                            >
                                                                {tiposRemesasCuenta.map(tr => (
                                                                    <option key={tr.codigo || tr.id} value={tr.codigo || tr.id}>
                                                                        {tr.codigo || tr.id}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            renderTipoBadge(t.tipo_remesa_codigo || (t.tipo === 'CARGO' ? 'NC' : 'RM'))
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem' }}>
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
                                                        {t.transferencia_interna_detectada && (
                                                            <div style={{ marginTop: '3px', fontSize: '0.7rem', color: '#c4b5fd', fontWeight: 600 }}>
                                                                ⇄ {t.transferencia_interna_detectada.tipo === 'VINCULADA'
                                                                    ? 'Transf. Interna Vinculada'
                                                                    : t.transferencia_interna_detectada.tipo === 'ESPEJO_OTRA_CUENTA'
                                                                        ? 'Espejo en otra cuenta interna'
                                                                        : 'Cuenta interna detectada'}:{' '}
                                                                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                                                                    {t.transferencia_interna_detectada.motivo}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
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
                                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                                {t.transferencia_interna_detectada?.tipo === 'ESPEJO_OTRA_CUENTA' && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={submitting}
                                                                        onClick={() => handleConciliarYCrearEspejoDesdeExtracto(t, idx)}
                                                                        className="btn-primary"
                                                                        style={{ padding: '4px 8px', fontSize: '0.71rem', background: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                        title="Crear en esta cuenta, conciliar y vincular con movimiento espejo de la otra cuenta"
                                                                    >
                                                                        <Link2 size={12} /> Vincular y Conciliar
                                                                    </button>
                                                                )}
                                                                {t.transferencia_interna_detectada?.tipo === 'NUMERO_CUENTA_INTERNA' && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={submitting}
                                                                        onClick={() => handleCrearParTransferenciaDesdeExtracto(t, idx)}
                                                                        className="btn-secondary"
                                                                        style={{ padding: '4px 8px', fontSize: '0.71rem', borderColor: 'rgba(139, 92, 246, 0.5)', color: '#c4b5fd', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                        title="Crear transferencia interna en ambas cuentas (aplicada aquí y pendiente en contraparte)"
                                                                    >
                                                                        <ArrowRightLeft size={12} /> Crear Transf.
                                                                    </button>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenAssignModal(t, idx)}
                                                                    className="btn-primary"
                                                                    style={{ padding: '4px 10px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                >
                                                                    <Plus size={13} /> Asignar
                                                                </button>
                                                            </div>
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
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Número de Partida / Cód. Cta:</span>
                                <div>{selectedItem.num_partida || 'Sin partida'}{selectedItem.cod_cta ? ` · Cta: ${selectedItem.cod_cta}` : ''}</div>
                            </div>
                        </div>

                        {selectedItem.origen_tipo === 'CK' && selectedItem.dias_circulacion !== undefined && selectedItem.dias_circulacion !== null && (
                            <div style={{
                                padding: '0.55rem 0.75rem',
                                borderRadius: 'var(--border-radius)',
                                background: getAgingBadgeMeta(selectedItem).bg,
                                border: `1px solid ${getAgingBadgeMeta(selectedItem).border}`,
                                color: getAgingBadgeMeta(selectedItem).color,
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                display: 'flex',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '0.5rem'
                            }}>
                                <span>Antigüedad en Circulación: {selectedItem.dias_circulacion} días</span>
                                <span>{selectedItem.label || getAgingBadgeMeta(selectedItem).text}</span>
                            </div>
                        )}

                        {selectedItem.cruce_id && (
                            <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--border-radius)', background: 'rgba(99, 102, 241, 0.14)', border: '1px solid rgba(99, 102, 241, 0.35)', fontSize: '0.8rem', color: '#a5b4fc' }}>
                                Vinculado al <strong>Cruce Agrupado #{selectedItem.cruce_id}</strong> ({formatCruceTipoLabel(selectedItem.cruce_tipo)})
                            </div>
                        )}

                        {selectedItem.es_transferencia_interna && (
                            <div style={{
                                padding: '0.65rem 0.85rem',
                                borderRadius: 'var(--border-radius)',
                                background: 'rgba(139, 92, 246, 0.12)',
                                border: '1px solid rgba(139, 92, 246, 0.35)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.45rem',
                                fontSize: '0.8rem'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', color: '#c4b5fd', fontWeight: 700 }}>
                                    <span>⇄ Transferencia Interna · {selectedItem.transfer_group_id}</span>
                                    {selectedItem.transfer_contraparte && (
                                        <span style={{ color: selectedItem.transfer_contraparte.conciliado ? '#34d399' : '#fbbf24' }}>
                                            {selectedItem.transfer_contraparte.conciliado
                                                ? `Contraparte Conciliada (${selectedItem.transfer_contraparte.fecha_aplicado_display || ''})`
                                                : 'Contraparte Pendiente en Tránsito'}
                                        </span>
                                    )}
                                </div>
                                {selectedItem.transfer_contraparte ? (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>
                                                {selectedItem.transfer_contraparte.banco_nombre} #{selectedItem.transfer_contraparte.numero_cuenta} ({selectedItem.transfer_contraparte.cuenta_nombre})
                                            </div>
                                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                {selectedItem.transfer_contraparte.empresa_nombre} · {selectedItem.transfer_contraparte.direccion}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowDetailModal(false);
                                                navigateToBancosTarget(navigate, 'conciliacion', {
                                                    empresaId: selectedItem.transfer_contraparte.empresa_codigo || selectedItem.transfer_contraparte.empresa_id,
                                                    cuentaId: selectedItem.transfer_contraparte.cuenta_bancaria_id,
                                                    numeroCuenta: selectedItem.transfer_contraparte.numero_cuenta
                                                });
                                            }}
                                            className="btn-secondary"
                                            style={{ height: '30px', padding: '0 0.7rem', fontSize: '0.75rem' }}
                                        >
                                            Ir a Conciliación Contraparte
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                                        No se encontró la contraparte activa para el grupo {selectedItem.transfer_group_id}.
                                    </div>
                                )}
                            </div>
                        )}

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

                        {selectedItem.origen_tipo === 'MOV' && (selectedItem.comprobantes_count > 0 || selectedItem.comprobante_url || selectedItem.signed_url) && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => openReceiptLightbox(selectedItem, 0, 'Movimiento Bancario')}
                                    className="btn-primary"
                                    style={{ height: '36px', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
                                >
                                    <Paperclip size={15} /> Ver Comprobantes ({selectedItem.comprobantes_count || selectedItem.comprobantes?.length || 1})
                                </button>
                            </div>
                        )}
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

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                        <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary" style={{ flex: '1 1 120px' }} disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" style={{ flex: '2 1 160px' }} disabled={submitting}>
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
                            <span>Saldo Banco Real (Manual):</span>
                            <strong>{formatSignedMoney(saldoBancoActual)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Saldo Chequera (CK):</span>
                            <span>{formatSignedMoney(saldoChequeraActual)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            <span>(−) Abonos en Tránsito:</span>
                            <span>{formatSignedMoney(abonosEnTransito)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                            <span>(+) Cheques y Cargos en Tránsito:</span>
                            <span>{formatSignedMoney(cargosChequesEnTransito)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.4rem' }}>
                            <span>Saldo Banco (Sistema / Conciliado):</span>
                            <strong>{formatSignedMoney(saldoConciliadoLibros)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: esDiferenciaCero ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            <span>Diferencia (Real − Sistema):</span>
                            <span>{formatSignedMoney(diferenciaActual)}</span>
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

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                        <button onClick={() => setShowValidationModal(false)} className="btn-secondary" style={{ flex: '1 1 120px' }} disabled={submitting}>
                            Cancelar
                        </button>
                        <button onClick={handleGuardarValidacion} disabled={submitting} className="btn-primary" style={{ flex: '2 1 160px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
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

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
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
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => setAssignFormData(prev => ({ ...prev, tipo: 'CARGO' }))}
                                        className={assignFormData.tipo === 'CARGO' ? 'btn-primary' : 'btn-secondary'}
                                        style={{
                                            flex: '1 1 140px',
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
                                            flex: '1 1 140px',
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
                                        onChange={e => {
                                            const cod = e.target.value;
                                            const tr = opcionesTipoRemesa.find(o => String(o.codigo || o.id) === String(cod));
                                            setAssignFormData({ ...assignFormData, tipo_remesa_codigo: cod, tipo_remesa_id: tr?.id || null });
                                        }}
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

                                <div>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Código Cuenta Contable (opcional):</label>
                                    <input
                                        type="text"
                                        value={assignFormData.cod_cta || ''}
                                        onChange={e => setAssignFormData({ ...assignFormData, cod_cta: e.target.value })}
                                        placeholder="Ej: 1102-01"
                                        style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>No. Partida (opcional):</label>
                                    <input
                                        type="text"
                                        value={assignFormData.num_partida || ''}
                                        onChange={e => setAssignFormData({ ...assignFormData, num_partida: e.target.value })}
                                        placeholder="Ej: P-2026-01"
                                        style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
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

                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                <button type="button" onClick={() => setShowAssignModal(false)} className="btn-secondary" style={{ flex: '1 1 120px' }} disabled={submitting}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={submitting} className="btn-primary" style={{ flex: '2 1 160px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '700' }}>
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
                                <table style={{ minWidth: '800px', width: '100%', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>FECHA</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>TIPO</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>DOC</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>CONCEPTO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>MONTO</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>ACCIÓN</th>
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
                                                        <td style={{ padding: '0.45rem 0.5rem' }}>{p.fecha_display}</td>
                                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>{renderTipoBadge(p.tipo)}</td>
                                                        <td style={{ padding: '0.45rem 0.5rem', fontFamily: 'monospace', fontWeight: 'bold' }}>{p.documento || '-'}</td>
                                                        <td style={{ padding: '0.45rem 0.5rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.concepto}>
                                                            {p.concepto}
                                                        </td>
                                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: esCargo ? '#ef4444' : '#10b981' }}>
                                                            ${formatMoney(p.monto_display || p.monto)}
                                                        </td>
                                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
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
                            <table style={{ minWidth: '820px', width: '100%', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: '0.74rem' }}>
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
                                                    fontSize: '0.72rem',
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
                            <table style={{ minWidth: '850px', width: '100%', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: '0.74rem' }}>
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
                                                    fontSize: '0.72rem',
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
                                                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
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
                            <table style={{ minWidth: '850px', width: '100%', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: '0.74rem' }}>
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
                                            <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{formatSvDateTime(a.created_at)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>{a.username || 'sistema'}</td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}><code>{a.accion}</code></td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>{a.entidad} #{a.entidad_id || '-'}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={JSON.stringify({ motivo: a.motivo, before: a.before_json, after: a.after_json })}>
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
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setShowReaperturaModal(false)} className="btn-secondary" style={{ flex: '1 1 120px' }} disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" style={{ flex: '2 1 160px' }} disabled={submitting}>
                            {submitting ? 'Enviando...' : 'Enviar Solicitud de Reapertura'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ── MODAL 8: GESTOR DE REGLAS DE AUTOCLASIFICACIÓN IA ── */}
            <Modal
                open={showReglasModal}
                onClose={() => setShowReglasModal(false)}
                title="Reglas de Autoclasificación de Extractos (IA)"
                size="lg"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    {reglaErrorAlert && (
                        <div style={{
                            padding: '0.6rem 0.85rem',
                            borderRadius: 'var(--border-radius)',
                            background: 'rgba(239, 68, 68, 0.14)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            color: '#fca5a5',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                        }}>
                            <AlertCircle size={16} />
                            <span>{reglaErrorAlert}</span>
                        </div>
                    )}

                    {/* Formulario Crear / Editar Regla */}
                    <form onSubmit={handleSaveRegla} className="card glass" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <strong style={{ fontSize: '0.85rem' }}>
                                {editingReglaId ? `Editando Regla #${editingReglaId}` : 'Nueva Regla de Autoclasificación'}
                            </strong>
                            {editingReglaId && (
                                <button type="button" onClick={resetReglaForm} className="btn-secondary" style={{ height: '28px', padding: '0 0.65rem', fontSize: '0.74rem' }}>
                                    + Nueva Regla
                                </button>
                            )}
                        </div>

                        <div className="form-grid form-grid-2" style={{ gap: '0.65rem' }}>
                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Nombre de la Regla *:</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={120}
                                    value={reglaForm.nombre}
                                    onChange={e => setReglaForm(prev => ({ ...prev, nombre: e.target.value }))}
                                    placeholder="Ej: Comisión Bancaria Mensual"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Patrón de Coincidencia *:</label>
                                <input
                                    type="text"
                                    required
                                    maxLength={255}
                                    value={reglaForm.patron}
                                    onChange={e => setReglaForm(prev => ({ ...prev, patron: e.target.value }))}
                                    placeholder="Ej: COMISION POS | ^REMESA\\s+\\d+"
                                    style={{ width: '100%', height: '36px', fontFamily: 'monospace', fontSize: '0.825rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Tipo de Match:</label>
                                <select
                                    value={reglaForm.tipo_match}
                                    onChange={e => setReglaForm(prev => ({ ...prev, tipo_match: e.target.value }))}
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                >
                                    <option value="CONTAINS">CONTAINS (Contiene texto)</option>
                                    <option value="STARTS_WITH">STARTS_WITH (Comienza con)</option>
                                    <option value="EXACT">EXACT (Coincidencia exacta)</option>
                                    <option value="REGEX">REGEX (Expresión regular segura)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Aplica a Tipo Movimiento:</label>
                                <select
                                    value={reglaForm.tipo_movimiento}
                                    onChange={e => setReglaForm(prev => ({ ...prev, tipo_movimiento: e.target.value }))}
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                >
                                    <option value="AMBOS">AMBOS (Cargo y Abono)</option>
                                    <option value="CARGO">CARGO (Solo salidas)</option>
                                    <option value="ABONO">ABONO (Solo entradas)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Alcance Cuenta Bancaria (opcional):</label>
                                <select
                                    value={reglaForm.cuenta_bancaria_id}
                                    onChange={e => setReglaForm(prev => ({ ...prev, cuenta_bancaria_id: e.target.value }))}
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                >
                                    <option value="">-- Global / Por Banco --</option>
                                    {sortCuentas(cuentas).map(c => (
                                        <option key={c.id} value={c.id}>
                                            {formatCuentaLabel(c)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Alcance Banco Código (opcional):</label>
                                <input
                                    type="text"
                                    value={reglaForm.banco_codigo}
                                    onChange={e => setReglaForm(prev => ({ ...prev, banco_codigo: e.target.value.toUpperCase() }))}
                                    placeholder="Ej: PROMERICA, BAC, AGRICOLA"
                                    style={{ width: '100%', height: '36px', textTransform: 'uppercase', fontSize: '0.825rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Tipo Remesa Destino:</label>
                                <select
                                    value={reglaForm.tipo_remesa_id}
                                    onChange={e => setReglaForm(prev => ({ ...prev, tipo_remesa_id: e.target.value }))}
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                >
                                    <option value="">-- Sin asignar --</option>
                                    {tiposRemesas.map(tr => (
                                        <option key={tr.id || tr.codigo} value={tr.id || ''}>
                                            {tr.codigo} - {tr.descripcion}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Código Cuenta Contable (`cod_cta`):</label>
                                <input
                                    type="text"
                                    value={reglaForm.cod_cta}
                                    onChange={e => setReglaForm(prev => ({ ...prev, cod_cta: e.target.value }))}
                                    placeholder="Ej: 5103-02"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Concepto Limpio Asignado:</label>
                                <input
                                    type="text"
                                    value={reglaForm.concepto_limpio}
                                    onChange={e => setReglaForm(prev => ({ ...prev, concepto_limpio: e.target.value.toUpperCase() }))}
                                    placeholder="Ej: COMISION BANCARIA POS"
                                    style={{ width: '100%', height: '36px', textTransform: 'uppercase', fontSize: '0.825rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ width: '115px' }}>
                                    <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Prioridad:</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={99999}
                                        value={reglaForm.prioridad}
                                        onChange={e => setReglaForm(prev => ({ ...prev, prioridad: e.target.value }))}
                                        style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                    />
                                </div>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', cursor: 'pointer', userSelect: 'none', height: '36px' }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(reglaForm.activo)}
                                        onChange={e => setReglaForm(prev => ({ ...prev, activo: e.target.checked ? 1 : 0 }))}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    <span>Activa</span>
                                </label>
                            </div>
                        </div>

                        {/* Probador en Vivo de Reglas */}
                        <div style={{ padding: '0.6rem 0.75rem', borderRadius: '6px', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#93c5fd' }}>Probador en Vivo de Patrón / Regla:</div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={testReglaDescripcion}
                                    onChange={e => setTestReglaDescripcion(e.target.value)}
                                    placeholder="Pega una descripción bancaria de prueba..."
                                    style={{ flex: '2 1 200px', height: '34px', fontSize: '0.8rem' }}
                                />
                                <select
                                    value={testReglaTipo}
                                    onChange={e => setTestReglaTipo(e.target.value)}
                                    style={{ width: '115px', height: '34px', fontSize: '0.8rem' }}
                                >
                                    <option value="CARGO">CARGO</option>
                                    <option value="ABONO">ABONO</option>
                                </select>
                                <button
                                    type="button"
                                    disabled={testingRegla}
                                    onClick={handleTestRegla}
                                    className="btn-secondary"
                                    style={{ height: '34px', padding: '0 0.85rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                >
                                    <Play size={13} /> {testingRegla ? 'Probando...' : 'Probar Regla'}
                                </button>
                            </div>
                            {testReglaResult && (
                                <div style={{ fontSize: '0.75rem', paddingTop: '0.2rem' }}>
                                    {(testReglaResult.resultados || []).map((r, i) => (
                                        <div key={i} style={{ color: r.regla_aplicada ? '#34d399' : '#fbbf24' }}>
                                            {r.regla_aplicada
                                                ? `✓ Coincidió (${r.regla_aplicada.nombre}) → Remesa: ${r.tipo_remesa_codigo || '-'} | Concepto: ${r.concepto_limpio || '-'} | Cta: ${r.cod_cta || '-'}`
                                                : `Sin coincidencia (evaluadas ${testReglaResult.reglas_evaluadas || 0} regla(s))`}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button type="button" onClick={resetReglaForm} className="btn-secondary" style={{ height: '36px', fontSize: '0.8rem' }} disabled={submitting}>
                                Limpiar
                            </button>
                            <button type="submit" className="btn-primary" style={{ height: '36px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} disabled={submitting}>
                                <Check size={15} /> {editingReglaId ? 'Actualizar Regla' : 'Guardar Regla'}
                            </button>
                        </div>
                    </form>

                    {/* Filtros de Lista de Reglas */}
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select
                            value={reglasFilterCuenta}
                            onChange={e => setReglasFilterCuenta(e.target.value)}
                            style={{ flex: '2 1 200px', height: '34px', fontSize: '0.8rem' }}
                        >
                            <option value="">Todas las Cuentas</option>
                            {sortCuentas(cuentas).map(c => (
                                <option key={c.id} value={c.id}>{formatCuentaLabel(c)}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={reglasFilterBanco}
                            onChange={e => setReglasFilterBanco(e.target.value)}
                            placeholder="Filtrar por banco código..."
                            style={{ flex: '1 1 140px', height: '34px', fontSize: '0.8rem' }}
                        />
                        {(reglasFilterCuenta || reglasFilterBanco) && (
                            <button
                                type="button"
                                onClick={() => { setReglasFilterCuenta(''); setReglasFilterBanco(''); }}
                                className="btn-secondary"
                                style={{ height: '34px', padding: '0 0.75rem', fontSize: '0.78rem' }}
                            >
                                Limpiar Filtros
                            </button>
                        )}
                    </div>

                    {/* Tabla de Reglas */}
                    <div className="table-responsive" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                        <table style={{ minWidth: '840px', width: '100%', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', fontSize: '0.74rem' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Regla / Alcance</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Patrón / Match</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Mov.</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Destino (Remesa / Concepto / Cta)</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Prior.</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingReglas ? (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>Cargando reglas...</td></tr>
                                ) : filteredReglas.length === 0 ? (
                                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No hay reglas registradas con este filtro.</td></tr>
                                ) : filteredReglas.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <td style={{ padding: '0.45rem 0.5rem' }}>
                                            <div style={{ fontWeight: 700 }}>{r.nombre}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {r.cuenta_bancaria_id
                                                    ? `Cuenta: ${r.cuenta_numero || r.cuenta_bancaria_id}`
                                                    : (r.banco_codigo ? `Banco: ${r.banco_codigo}` : 'Global')}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem' }}>
                                            <code style={{ fontSize: '0.74rem' }}>{r.patron}</code>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{r.tipo_match}</div>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>{r.tipo_movimiento}</td>
                                        <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.74rem' }}>
                                            <div>{r.tipo_remesa_codigo || '-'} · {r.concepto_limpio || '-'}</div>
                                            {r.cod_cta && <div style={{ color: 'var(--text-muted)' }}>Cta: {r.cod_cta}</div>}
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>{r.prioridad}</td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '4px',
                                                fontWeight: 700,
                                                background: r.activo ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)',
                                                color: r.activo ? '#34d399' : '#f87171'
                                            }}>
                                                {r.activo ? 'ACTIVA' : 'INACTIVA'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                                                <button type="button" onClick={() => handleEditRegla(r)} className="icon-btn" title="Editar regla" style={{ padding: '4px' }}>
                                                    <Edit2 size={14} />
                                                </button>
                                                <button type="button" onClick={() => handleDeleteRegla(r)} className="icon-btn" title="Eliminar regla" style={{ padding: '4px', color: '#ef4444' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* ── MODAL 9: CRUCE AGRUPADO (N:1 / 1:N / N:M) DESDE PENDIENTES ── */}
            <Modal
                open={showCruceModal}
                onClose={() => setShowCruceModal(false)}
                title="Cruce Agrupado (N:1 / 1:N / N:M)"
                size="lg"
            >
                <form onSubmit={handleSubmitCruceModal} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => setCruceBancoMode('EXTRACTO')}
                            className={cruceBancoMode === 'EXTRACTO' ? 'btn-primary' : 'btn-secondary'}
                            style={{ height: '32px', padding: '0 0.85rem', fontSize: '0.78rem' }}
                        >
                            Contra Movimiento del Banco (Extracto)
                        </button>
                        <button
                            type="button"
                            onClick={() => setCruceBancoMode('PENDIENTE')}
                            className={cruceBancoMode === 'PENDIENTE' ? 'btn-primary' : 'btn-secondary'}
                            style={{ height: '32px', padding: '0 0.85rem', fontSize: '0.78rem' }}
                        >
                            Contra Partidas Pendientes (Misma Dirección)
                        </button>
                    </div>

                    <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                            1. Partidas en Libros Seleccionadas ({cruceModalSummary.libroItems.length}):
                        </div>
                        <div style={{ maxHeight: '170px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {pendientes.map(p => {
                                const checked = cruceLibroKeys.has(p.key);
                                return (
                                    <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', cursor: 'pointer', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => {
                                                setCruceLibroKeys(prev => {
                                                    const n = new Set(prev);
                                                    if (n.has(p.key)) n.delete(p.key);
                                                    else n.add(p.key);
                                                    return n;
                                                });
                                            }}
                                            style={{ width: '16px', height: '16px' }}
                                        />
                                        <span>{p.fecha_display} · {getRowDirection(p)} · {p.origen_tipo}#{p.documento || p.id} · <strong>${formatMoney(p.monto_display || p.monto)}</strong> — {p.concepto}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {cruceBancoMode === 'EXTRACTO' ? (
                        <div className="form-grid form-grid-2" style={{ gap: '0.75rem' }}>
                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Monto Banco ($)*:</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={cruceManualBanco.monto_banco}
                                    onChange={e => setCruceManualBanco(prev => ({ ...prev, monto_banco: e.target.value }))}
                                    style={{ width: '100%', height: '36px', fontWeight: 700, fontSize: '0.88rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Fecha Aplicado*:</label>
                                <input
                                    type="date"
                                    required
                                    value={cruceManualBanco.fecha_aplicado}
                                    onChange={e => setCruceManualBanco(prev => ({ ...prev, fecha_aplicado: e.target.value }))}
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Referencia / Doc. Banco:</label>
                                <input
                                    type="text"
                                    value={cruceManualBanco.referencia_banco}
                                    onChange={e => setCruceManualBanco(prev => ({ ...prev, referencia_banco: e.target.value.toUpperCase() }))}
                                    placeholder="Ej: LOTE-9001"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Concepto Banco / Notas:</label>
                                <input
                                    type="text"
                                    value={cruceManualBanco.concepto_banco}
                                    onChange={e => setCruceManualBanco(prev => ({ ...prev, concepto_banco: e.target.value }))}
                                    placeholder="Ej: Liquidación agrupada POS"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.3rem', color: 'var(--text-muted)' }}>
                                2. Partidas Lado Banco ({cruceModalSummary.bancoItemsPayload.length}):
                            </div>
                            <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--border-radius)', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {pendientes.filter(p => !cruceLibroKeys.has(p.key)).map(p => {
                                    const checked = cruceBancoPendingKeys.has(p.key);
                                    return (
                                        <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', cursor: 'pointer', userSelect: 'none' }}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => {
                                                    setCruceBancoPendingKeys(prev => {
                                                        const n = new Set(prev);
                                                        if (n.has(p.key)) n.delete(p.key);
                                                        else n.add(p.key);
                                                        return n;
                                                    });
                                                }}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            <span>{p.fecha_display} · {getRowDirection(p)} · {p.origen_tipo}#{p.documento || p.id} · <strong>${formatMoney(p.monto_display || p.monto)}</strong> — {p.concepto}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="card glass" style={{ padding: '0.7rem 0.9rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', fontSize: '0.8rem' }}>
                        <span>Suma Libros: <strong>${formatMoney(cruceModalSummary.sumLibro)}</strong></span>
                        <span>Suma Banco: <strong>${formatMoney(cruceModalSummary.sumBanco)}</strong></span>
                        <span style={{ color: Math.abs(cruceModalSummary.diff) <= 0.005 ? '#10b981' : '#f87171', fontWeight: 800 }}>
                            Diferencia: ${formatMoney(cruceModalSummary.diff)}
                        </span>
                        <span style={{ color: cruceModalSummary.sameDirection ? '#93c5fd' : '#f87171' }}>
                            {!cruceModalSummary.sameDirection
                                ? 'Las partidas deben ser todas CARGO o todas ABONO'
                                : (cruceModalSummary.tipoCruce ? `Tipo: ${formatCruceTipoLabel(cruceModalSummary.tipoCruce)} (${cruceModalSummary.direccion})` : 'Seleccione N:1, 1:N o N:M')}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setShowCruceModal(false)} className="btn-secondary" style={{ flex: '1 1 120px' }} disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" style={{ flex: '2 1 160px' }} disabled={!cruceModalSummary.isValid || submitting}>
                            {submitting ? 'Registrando Cruce...' : 'Confirmar Cruce Agrupado'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ReceiptViewerModal
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                comprobantes={viewerItems}
                initialIndex={viewerIdx}
                title={viewerTitle}
            />

            <ReportPreviewModal
                isOpen={showPdfPreview}
                onClose={() => setShowPdfPreview(false)}
                pdfSource={previewPdfBlob}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge={activeTab === 'MOVIMIENTOS' ? 'CONCILIADOS' : (activeTab === 'CONTROL_PAGOS' ? 'CONTROL PAGOS' : (activeTab === 'CRUCES' ? 'CRUCES' : 'PENDIENTES'))}
                totalPages={previewTotalPages}
                fileName={previewFileName}
            />
        </div>
    );
}
