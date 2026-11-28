import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import ReceiptViewerModal from '../components/ReceiptViewerModal';
import {
    Landmark, FileText, Search, Plus, Calendar, Filter, Save, Trash2,
    Download, ChevronLeft, ChevronRight, AlertCircle, Edit2, ArrowDownCircle,
    ArrowUpCircle, CheckCircle, Lock, ArrowLeftRight, Copy, Clock,
    Paperclip, Upload, Sparkles, Eye, X, Loader2, Camera
} from 'lucide-react';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { sanitizeSpreadsheetRows } from '../utils/exportSanitizer';
import { compressReceiptFile, formatBytes } from '../utils/receiptCompressor';
import { moneyFmt } from '../utils/format';
import {
    resolveInitialBancosContext,
    saveBancosSelection,
    subscribeBancosNavTarget,
    findMatchingCuenta
} from '../utils/bancosNavStorage';

const SV_TZ = 'America/El_Salvador';

const getSvTodayYMD = () => {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: SV_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
    } catch {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
};

const shiftYMD = (ymd, deltaDays) => {
    const [y, m, d] = String(ymd || getSvTodayYMD()).split('-').map(Number);
    const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + Number(deltaDays || 0)));
    return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
};

const getPeriodoDates = (preset) => {
    const svToday = getSvTodayYMD();
    const [y, m, d] = svToday.split('-').map(Number);
    if (preset === 'hoy') {
        return { desde: svToday, hasta: svToday };
    }
    if (preset === 'esta_semana') {
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        const diffToMonday = dow === 0 ? -6 : 1 - dow;
        return { desde: shiftYMD(svToday, diffToMonday), hasta: svToday };
    }
    if (preset === 'este_mes') {
        return { desde: `${y}-${String(m).padStart(2, '0')}-01`, hasta: svToday };
    }
    if (preset === 'mes_anterior') {
        const lastPrev = new Date(Date.UTC(y, m - 1, 0));
        const py = lastPrev.getUTCFullYear();
        const pm = String(lastPrev.getUTCMonth() + 1).padStart(2, '0');
        const pd = String(lastPrev.getUTCDate()).padStart(2, '0');
        return { desde: `${py}-${pm}-01`, hasta: `${py}-${pm}-${pd}` };
    }
    return { desde: shiftYMD(svToday, -30), hasta: svToday };
};

const PERIOD_PRESETS = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'esta_semana', label: 'Esta semana' },
    { key: 'este_mes', label: 'Este mes' },
    { key: 'mes_anterior', label: 'Mes anterior' },
    { key: 'ultimos_30_dias', label: 'Últimos 30 días' }
];

const makeIdempotencyKey = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const deduplicateReceiptBatch = (existingList, batch) => {
    const existingNames = new Set((existingList || []).map(r => r?.nombre_original).filter(Boolean));
    return batch.map(item => {
        let finalName = item.nombre_original;
        if (finalName && finalName.startsWith('captura_') && existingNames.has(finalName)) {
            const dotIdx = finalName.lastIndexOf('.');
            const stem = dotIdx > 0 ? finalName.slice(0, dotIdx) : finalName;
            const ext = dotIdx > 0 ? finalName.slice(dotIdx) : '';
            let seq = 2;
            while (existingNames.has(`${stem}_${seq}${ext}`)) {
                seq += 1;
            }
            finalName = `${stem}_${seq}${ext}`;
        }
        if (finalName) existingNames.add(finalName);
        return finalName === item.nombre_original ? item : { ...item, nombre_original: finalName };
    });
};

const formatDateForInput = (str) => {
    if (!str) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(str).trim())) return String(str).trim();
    const parts = String(str).split('/');
    if (parts.length !== 3) return '';
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

export default function MovimientosBancarios() {
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [truncatedInfo, setTruncatedInfo] = useState({ truncated: false, total: 0 });
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Catalogs
    const [cuentas, setCuentas] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [remesas, setRemesas] = useState([]);
    const cuentasRef = useRef([]);
    const remesasRef = useRef([]);

    // Filters & R5.5 Presets
    const [periodoPreset, setPeriodoPreset] = useState('ultimos_30_dias');
    const [filters, setFilters] = useState(() => {
        const range = getPeriodoDates('ultimos_30_dias');
        return {
            id_empresa: '',
            numero_cuenta: '',
            desde: range.desde,
            hasta: range.hasta
        };
    });
    const filtersRef = useRef(filters);
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    // Standard Modal Form State
    const [formData, setFormData] = useState(() => ({
        id_empresa: '',
        numero_cuenta: '',
        cuenta_bancaria_id: '',
        cuenta_debitar_id: '',
        cuenta_acreditar_id: '',
        fecha: getSvTodayYMD(),
        fecha_aplicado: '',
        documento: '',
        concepto: '',
        monto: '',
        tipo: 'ABONO',
        cod_remesa: '',
        cod_cta: '',
        num_partida: ''
    }));
    const [editingMovement, setEditingMovement] = useState(null);

    // R5.1 Dedicated Inter-Company Transfer Modal State
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferData, setTransferData] = useState(() => ({
        empresa_origen_filter: '',
        empresa_destino_filter: '',
        cuenta_debitar_id: '',
        cuenta_acreditar_id: '',
        fecha: getSvTodayYMD(),
        fecha_aplicado: '',
        documento: '',
        monto: '',
        concepto: '',
        cod_cta: '',
        num_partida: ''
    }));
    const [transferReceipts, setTransferReceipts] = useState([]);
    const [transferError, setTransferError] = useState('');

    // R5.2 Live Account Summary State
    const [filterCuentaResumen, setFilterCuentaResumen] = useState(null);
    const [loadingFilterResumen, setLoadingFilterResumen] = useState(false);
    const [modalCuentaResumen, setModalCuentaResumen] = useState(null);
    const [loadingModalResumen, setLoadingModalResumen] = useState(false);
    const [modalDebResumen, setModalDebResumen] = useState(null);
    const [loadingModalDebResumen, setLoadingModalDebResumen] = useState(false);
    const [modalCredResumen, setModalCredResumen] = useState(null);
    const [loadingModalCredResumen, setLoadingModalCredResumen] = useState(false);
    const [transferDebResumen, setTransferDebResumen] = useState(null);
    const [loadingTransferDebResumen, setLoadingTransferDebResumen] = useState(false);
    const [transferCredResumen, setTransferCredResumen] = useState(null);
    const [loadingTransferCredResumen, setLoadingTransferCredResumen] = useState(false);

    // R5.3 Receipts, OCR & Lightbox State
    const [pendingReceipts, setPendingReceipts] = useState([]);
    const [existingReceipts, setExistingReceipts] = useState([]);
    const [loadingExistingReceipts, setLoadingExistingReceipts] = useState(false);
    const [compressingFiles, setCompressingFiles] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [autoOcrEnabled, setAutoOcrEnabled] = useState(true);
    const [analyzingOcr, setAnalyzingOcr] = useState(false);
    const [lastOcrResult, setLastOcrResult] = useState(null);
    const [transferLastOcrResult, setTransferLastOcrResult] = useState(null);

    // Gallery modal state (for viewing/managing receipts from table rows)
    const [galleryMovement, setGalleryMovement] = useState(null);
    const [galleryItems, setGalleryItems] = useState([]);
    const [loadingGallery, setLoadingGallery] = useState(false);
    const [uploadingGallery, setUploadingGallery] = useState(false);
    const [editingCompId, setEditingCompId] = useState(null);
    const [editingCompNota, setEditingCompNota] = useState('');
    const [savingCompNota, setSavingCompNota] = useState(false);

    // Lightbox state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerItems, setViewerItems] = useState([]);
    const [viewerIdx, setViewerIdx] = useState(0);
    const [viewerTitle, setViewerTitle] = useState('Visualizador de Comprobantes');
    const [viewerAllowDelete, setViewerAllowDelete] = useState(false);

    // OCR Non-Overwrite & Guard Refs
    const dirtyFieldsRef = useRef(new Set());
    const ocrAppliedFieldsRef = useRef(new Set());
    const transferDirtyFieldsRef = useRef(new Set());
    const transferOcrAppliedFieldsRef = useRef(new Set());
    const confirmOpenRef = useRef(false);
    const formValuesRef = useRef({});
    const transferValuesRef = useRef({});
    const pendingReceiptsRef = useRef([]);
    const transferReceiptsRef = useRef([]);

    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const transferFileInputRef = useRef(null);
    const transferCameraInputRef = useRef(null);
    const galleryFileInputRef = useRef(null);
    const galleryCameraInputRef = useRef(null);

    formValuesRef.current = formData;
    transferValuesRef.current = transferData;
    pendingReceiptsRef.current = pendingReceipts;
    transferReceiptsRef.current = transferReceipts;

    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const safeConfirm = useCallback(async (message, options) => {
        confirmOpenRef.current = true;
        try {
            return await confirm(message, options);
        } finally {
            confirmOpenRef.current = false;
        }
    }, [confirm]);

    const markDirty = useCallback((...fields) => {
        fields.forEach(f => dirtyFieldsRef.current.add(f));
    }, []);

    const markTransferDirty = useCallback((...fields) => {
        fields.forEach(f => transferDirtyFieldsRef.current.add(f));
    }, []);

    const resetFieldTracking = useCallback(() => {
        dirtyFieldsRef.current.clear();
        ocrAppliedFieldsRef.current.clear();
    }, []);

    const resetTransferFieldTracking = useCallback(() => {
        transferDirtyFieldsRef.current.clear();
        transferOcrAppliedFieldsRef.current.clear();
    }, []);

    const isTransferTipo = (cod) => ['TR', 'TRANSFERENCIA'].includes(String(cod || '').toUpperCase().trim());
    const isDebitTipo = (cod) => ['02', 'NC', 'ND', 'CH'].includes(String(cod || '').toUpperCase().trim());
    const isCreditTipo = (cod) => ['01', '03', 'RM', 'NA'].includes(String(cod || '').toUpperCase().trim());
    const resolveMovementTipo = (codRemesa, currentTipo) => {
        if (isDebitTipo(codRemesa)) return 'CARGO';
        if (isCreditTipo(codRemesa)) return 'ABONO';
        return String(currentTipo || '').toUpperCase().trim() === 'CARGO' ? 'CARGO' : 'ABONO';
    };

    const fetchCuentaResumen = useCallback(async (cuentaId) => {
        if (!cuentaId) return null;
        try {
            const res = await api.get(`/bancos/cuentas/${cuentaId}/resumen`);
            return res.data || null;
        } catch {
            return null;
        }
    }, []);

    const refreshFilterResumen = useCallback(async (acc) => {
        if (!acc?.corr) {
            setFilterCuentaResumen(null);
            return;
        }
        setLoadingFilterResumen(true);
        try {
            const data = await fetchCuentaResumen(acc.corr);
            setFilterCuentaResumen(data);
        } finally {
            setLoadingFilterResumen(false);
        }
    }, [fetchCuentaResumen]);

    const fetchMovements = useCallback(async (overrideFilters = null) => {
        const activeFilters = overrideFilters || filtersRef.current;
        setLoading(true);
        try {
            const res = await api.get('/bancos/movimientos', { params: { ...activeFilters, limit: 1500 } });
            setMovements(res.data || []);
            const isTrunc = String(res.headers?.['x-truncated'] || '').toLowerCase() === 'true';
            const totalCnt = Number(res.headers?.['x-total-count'] || (res.data || []).length);
            setTruncatedInfo({ truncated: isTrunc, total: totalCnt });
            setCurrentPage(1);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar historial', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    // Unified Mount + Keep-Alive Subscription (R5.4)
    useEffect(() => {
        let active = true;
        const init = async () => {
            let loadedCuentas = [];
            try {
                const res = await api.get('/bancos/movimientos/catalogos');
                if (!active) return;
                loadedCuentas = res.data.cuentas || [];
                cuentasRef.current = loadedCuentas;
                setCuentas(loadedCuentas);
                setEmpresas(res.data.empresas || []);
            } catch {
                if (active) addToast('Error al cargar catálogos', 'error');
            }

            if (!active) return;
            const initialCtx = resolveInitialBancosContext('/dashboard/bancos/movimientos');
            let nextFilters = { ...filtersRef.current };
            let matchedAcc = null;
            if (initialCtx) {
                matchedAcc = findMatchingCuenta(loadedCuentas, initialCtx);
                if (matchedAcc) {
                    nextFilters = {
                        ...nextFilters,
                        id_empresa: String(matchedAcc.id_empresa || ''),
                        numero_cuenta: String(matchedAcc.numero || '')
                    };
                } else if (initialCtx.empresaId) {
                    nextFilters = {
                        ...nextFilters,
                        id_empresa: String(initialCtx.empresaId),
                        numero_cuenta: ''
                    };
                }
                setFilters(nextFilters);
                filtersRef.current = nextFilters;
            }
            fetchMovements(nextFilters);
            if (matchedAcc) {
                refreshFilterResumen(matchedAcc);
            }
        };
        init();

        const unsubscribe = subscribeBancosNavTarget('/dashboard/bancos/movimientos', (detail) => {
            const list = cuentasRef.current;
            const match = findMatchingCuenta(list, detail);
            let nextFilters = { ...filtersRef.current };
            if (match) {
                nextFilters = {
                    ...nextFilters,
                    id_empresa: String(match.id_empresa || ''),
                    numero_cuenta: String(match.numero || '')
                };
                refreshFilterResumen(match);
            } else if (detail?.empresaId) {
                nextFilters = {
                    ...nextFilters,
                    id_empresa: String(detail.empresaId),
                    numero_cuenta: ''
                };
                setFilterCuentaResumen(null);
            }
            setFilters(nextFilters);
            filtersRef.current = nextFilters;
            fetchMovements(nextFilters);
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, [addToast, fetchMovements, refreshFilterResumen]);

    const fetchCatalogsForCompany = useCallback(async (id_empresa, preserveRemesa = false) => {
        if (!id_empresa) {
            remesasRef.current = [];
            setRemesas([]);
            return [];
        }
        try {
            const res = await api.get(`/bancos/movimientos/catalogos?id_empresa=${id_empresa}`);
            const sortedRemesas = (res.data.remesas || []).sort((a, b) => a.id.localeCompare(b.id));
            remesasRef.current = sortedRemesas;
            setRemesas(sortedRemesas);

            if (!preserveRemesa && !dirtyFieldsRef.current.has('cod_remesa')) {
                setFormData(prev => ({
                    ...prev,
                    cod_remesa: prev.cod_remesa && sortedRemesas.some(r => r.id === prev.cod_remesa)
                        ? prev.cod_remesa
                        : (sortedRemesas[0]?.id || '')
                }));
            }
            return sortedRemesas;
        } catch {
            addToast('Error al cargar tipos de remesa', 'error');
            return [];
        }
    }, [addToast]);

    const loadModalResumen = useCallback(async (cuentaId) => {
        if (!cuentaId) {
            setModalCuentaResumen(null);
            return;
        }
        setLoadingModalResumen(true);
        try {
            const data = await fetchCuentaResumen(cuentaId);
            setModalCuentaResumen(data);
        } finally {
            setLoadingModalResumen(false);
        }
    }, [fetchCuentaResumen]);

    const loadModalLegResumen = useCallback(async (leg, cuentaId) => {
        if (leg === 'deb') {
            if (!cuentaId) {
                setModalDebResumen(null);
                return;
            }
            setLoadingModalDebResumen(true);
            try {
                const data = await fetchCuentaResumen(cuentaId);
                setModalDebResumen(data);
            } finally {
                setLoadingModalDebResumen(false);
            }
        } else {
            if (!cuentaId) {
                setModalCredResumen(null);
                return;
            }
            setLoadingModalCredResumen(true);
            try {
                const data = await fetchCuentaResumen(cuentaId);
                setModalCredResumen(data);
            } finally {
                setLoadingModalCredResumen(false);
            }
        }
    }, [fetchCuentaResumen]);

    const loadTransferLegResumen = useCallback(async (leg, cuentaId) => {
        if (leg === 'deb') {
            if (!cuentaId) {
                setTransferDebResumen(null);
                return;
            }
            setLoadingTransferDebResumen(true);
            try {
                const data = await fetchCuentaResumen(cuentaId);
                setTransferDebResumen(data);
            } finally {
                setLoadingTransferDebResumen(false);
            }
        } else {
            if (!cuentaId) {
                setTransferCredResumen(null);
                return;
            }
            setLoadingTransferCredResumen(true);
            try {
                const data = await fetchCuentaResumen(cuentaId);
                setTransferCredResumen(data);
            } finally {
                setLoadingTransferCredResumen(false);
            }
        }
    }, [fetchCuentaResumen]);

    // Filter Handlers (R5.4 & R5.5)
    const handleFilterEmpresaChange = (id_empresa) => {
        const nextFilters = { ...filters, id_empresa, numero_cuenta: '' };
        setFilters(nextFilters);
        filtersRef.current = nextFilters;
        setFilterCuentaResumen(null);
        saveBancosSelection({ empresaId: id_empresa, cuentaId: '', numeroCuenta: '' });
    };

    const handleFilterCuentaChange = (numero_cuenta) => {
        const nextFilters = { ...filters, numero_cuenta };
        setFilters(nextFilters);
        filtersRef.current = nextFilters;
        if (!numero_cuenta) {
            setFilterCuentaResumen(null);
            saveBancosSelection({ empresaId: nextFilters.id_empresa, cuentaId: '', numeroCuenta: '' });
            return;
        }
        const acc = findMatchingCuenta(cuentas, { empresaId: nextFilters.id_empresa, numeroCuenta: numero_cuenta });
        saveBancosSelection({
            empresaId: nextFilters.id_empresa || acc?.id_empresa || '',
            cuentaId: acc?.corr || '',
            numeroCuenta: numero_cuenta
        });
        refreshFilterResumen(acc);
    };

    const applyPeriodoPreset = (presetKey) => {
        const range = getPeriodoDates(presetKey);
        setPeriodoPreset(presetKey);
        const nextFilters = { ...filtersRef.current, desde: range.desde, hasta: range.hasta };
        setFilters(nextFilters);
        filtersRef.current = nextFilters;
        fetchMovements(nextFilters);
    };

    const handleCompanyChange = (id_empresa) => {
        markDirty('id_empresa', 'cuenta');
        setModalCuentaResumen(null);
        setModalDebResumen(null);
        setModalCredResumen(null);
        setFormData(prev => ({
            ...prev,
            id_empresa,
            numero_cuenta: '',
            cuenta_bancaria_id: '',
            cod_remesa: ''
        }));
        if (id_empresa) {
            fetchCatalogsForCompany(id_empresa, false);
        } else {
            remesasRef.current = [];
            setRemesas([]);
        }
    };

    const handleStandardAccountChange = (numero_cuenta) => {
        markDirty('cuenta');
        const acc = findMatchingCuenta(cuentas, { empresaId: formData.id_empresa, numeroCuenta: numero_cuenta });
        setFormData(prev => ({
            ...prev,
            numero_cuenta,
            cuenta_bancaria_id: acc?.corr ? String(acc.corr) : ''
        }));
        loadModalResumen(acc?.corr || '');
    };

    const buildTransferConcept = (debAcc, credAcc, currentConcepto, dirtySet) => {
        if (dirtySet.has('concepto') && currentConcepto) return currentConcepto;
        if (!currentConcepto || currentConcepto.startsWith('TRANSFERENCIA DE') || currentConcepto.startsWith('TRANSFERENCIA PARA')) {
            const debName = debAcc ? (debAcc.nombre || debAcc.numero) : '';
            const credName = credAcc ? (credAcc.nombre || credAcc.numero) : '';
            if (debName && credName) return `TRANSFERENCIA DE ${debName} PARA ${credName} / `;
            if (debName) return `TRANSFERENCIA DE ${debName} / `;
            if (credName) return `TRANSFERENCIA PARA ${credName} / `;
        }
        return currentConcepto;
    };

    // Standard Modal Inline TR handlers (supports inter-company by cuentaId)
    const handleModalDebitAccountChange = (cuentaId) => {
        markDirty('cuenta_debitar_id');
        const debitAcc = findMatchingCuenta(cuentas, { cuentaId });
        const creditAcc = findMatchingCuenta(cuentas, { cuentaId: formData.cuenta_acreditar_id });
        const autoConcepto = buildTransferConcept(debitAcc, creditAcc, formData.concepto, dirtyFieldsRef.current);
        setFormData(prev => ({
            ...prev,
            cuenta_debitar_id: cuentaId,
            concepto: autoConcepto
        }));
        loadModalLegResumen('deb', cuentaId);
    };

    const handleModalCreditAccountChange = (cuentaId) => {
        markDirty('cuenta_acreditar_id');
        const creditAcc = findMatchingCuenta(cuentas, { cuentaId });
        const debitAcc = findMatchingCuenta(cuentas, { cuentaId: formData.cuenta_debitar_id });
        const autoConcepto = buildTransferConcept(debitAcc, creditAcc, formData.concepto, dirtyFieldsRef.current);
        setFormData(prev => ({
            ...prev,
            cuenta_acreditar_id: cuentaId,
            concepto: autoConcepto
        }));
        loadModalLegResumen('cred', cuentaId);
    };

    const handleRemesaChange = (newCodRemesa) => {
        markDirty('cod_remesa');
        const isTransfer = isTransferTipo(newCodRemesa);
        let nextDebId = formData.cuenta_debitar_id;
        let nextCredId = formData.cuenta_acreditar_id;
        let autoConcepto = formData.concepto;

        if (isTransfer) {
            if (!nextDebId && formData.cuenta_bancaria_id) {
                nextDebId = formData.cuenta_bancaria_id;
                loadModalLegResumen('deb', nextDebId);
            }
            const debAcc = findMatchingCuenta(cuentas, { cuentaId: nextDebId });
            const credAcc = findMatchingCuenta(cuentas, { cuentaId: nextCredId });
            autoConcepto = buildTransferConcept(debAcc, credAcc, autoConcepto, dirtyFieldsRef.current);
        }

        setFormData(prev => ({
            ...prev,
            cod_remesa: newCodRemesa,
            tipo: resolveMovementTipo(newCodRemesa, prev.tipo),
            cuenta_debitar_id: nextDebId,
            cuenta_acreditar_id: nextCredId,
            concepto: autoConcepto
        }));
    };

    // R5.1 Dedicated Transfer Modal Account Handlers
    const handleTransferDebitChange = (cuentaId) => {
        markTransferDirty('cuenta_debitar_id');
        setTransferError('');
        const debitAcc = findMatchingCuenta(cuentas, { cuentaId });
        const creditAcc = findMatchingCuenta(cuentas, { cuentaId: transferData.cuenta_acreditar_id });
        const autoConcepto = buildTransferConcept(debitAcc, creditAcc, transferData.concepto, transferDirtyFieldsRef.current);
        setTransferData(prev => ({
            ...prev,
            cuenta_debitar_id: cuentaId,
            concepto: autoConcepto
        }));
        loadTransferLegResumen('deb', cuentaId);
    };

    const handleTransferCreditChange = (cuentaId) => {
        markTransferDirty('cuenta_acreditar_id');
        setTransferError('');
        const creditAcc = findMatchingCuenta(cuentas, { cuentaId });
        const debitAcc = findMatchingCuenta(cuentas, { cuentaId: transferData.cuenta_debitar_id });
        const autoConcepto = buildTransferConcept(debitAcc, creditAcc, transferData.concepto, transferDirtyFieldsRef.current);
        setTransferData(prev => ({
            ...prev,
            cuenta_acreditar_id: cuentaId,
            concepto: autoConcepto
        }));
        loadTransferLegResumen('cred', cuentaId);
    };

    // R5.3 OCR Application (Standard Modal)
    const applyOcrAnalysisToForm = useCallback(async (an, { force = false } = {}) => {
        if (!an) return { filledFields: [], skippedFields: [] };
        const cur = formValuesRef.current || {};
        const filledFields = [];
        const skippedFields = [];

        const canApply = (field, isEmpty, allowDefaultOverwrite = false) => {
            if (force) return true;
            if (dirtyFieldsRef.current.has(field)) return false;
            if (ocrAppliedFieldsRef.current.has(field)) return false;
            if (isEmpty) return true;
            return allowDefaultOverwrite && !editingMovement;
        };

        const markOcrOwned = (field) => {
            ocrAppliedFieldsRef.current.add(field);
            if (force) dirtyFieldsRef.current.delete(field);
        };

        let nextRemesas = remesasRef.current || [];
        const patch = {};
        let resolvedMatchedAcc = null;

        if (an.cuenta_bancaria_id) {
            const matchedAcc = findMatchingCuenta(cuentasRef.current, { cuentaId: an.cuenta_bancaria_id });
            if (matchedAcc) {
                resolvedMatchedAcc = matchedAcc;
                if (canApply('cuenta', !cur.numero_cuenta, true)) {
                    patch.id_empresa = String(matchedAcc.id_empresa || '');
                    patch.numero_cuenta = String(matchedAcc.numero || '');
                    patch.cuenta_bancaria_id = String(matchedAcc.corr || '');
                    markOcrOwned('cuenta');
                    markOcrOwned('id_empresa');
                    filledFields.push('cuenta bancaria');
                    nextRemesas = await fetchCatalogsForCompany(matchedAcc.id_empresa, true);
                    loadModalResumen(matchedAcc.corr);
                } else {
                    skippedFields.push('cuenta bancaria');
                }
            }
        }

        if (an.cod_remesa_sugerido && nextRemesas.some(r => r.id === an.cod_remesa_sugerido)) {
            if (canApply('cod_remesa', !cur.cod_remesa, true)) {
                patch.cod_remesa = an.cod_remesa_sugerido;
                if (an.tipo_sugerido || an.direccion) {
                    patch.tipo = String(an.tipo_sugerido || an.direccion).toUpperCase().trim();
                }
                markOcrOwned('cod_remesa');
                filledFields.push('tipo mov.');
            } else {
                skippedFields.push('tipo mov.');
            }
        }

        const effectiveCodRemesa = patch.cod_remesa ?? cur.cod_remesa;
        const effectiveCuentaId = patch.cuenta_bancaria_id || (resolvedMatchedAcc?.corr ? String(resolvedMatchedAcc.corr) : '') || cur.cuenta_bancaria_id;
        if (isTransferTipo(effectiveCodRemesa) && effectiveCuentaId) {
            if (canApply('cuenta_debitar_id', !cur.cuenta_debitar_id, true)) {
                patch.cuenta_debitar_id = String(effectiveCuentaId);
                markOcrOwned('cuenta_debitar_id');
                loadModalLegResumen('deb', effectiveCuentaId);
            }
        }

        const rawMonto = an.monto ?? an.monto_usd;
        if (rawMonto && Number(rawMonto) > 0) {
            if (canApply('monto', !String(cur.monto || '').trim(), false)) {
                patch.monto = Number(rawMonto).toFixed(2);
                markOcrOwned('monto');
                filledFields.push('monto');
            } else {
                skippedFields.push('monto');
            }
        }

        const rawFecha = an.fecha || an.fecha_pago;
        if (rawFecha && /^\d{4}-\d{2}-\d{2}$/.test(String(rawFecha).trim())) {
            if (canApply('fecha', !cur.fecha, true)) {
                patch.fecha = String(rawFecha).trim();
                markOcrOwned('fecha');
                filledFields.push('fecha');
            } else {
                skippedFields.push('fecha');
            }
        }

        const rawDoc = an.documento || an.referencia || an.referencia_doc;
        if (rawDoc && String(rawDoc).trim()) {
            if (canApply('documento', !String(cur.documento || '').trim(), false)) {
                patch.documento = String(rawDoc).trim().toUpperCase();
                markOcrOwned('documento');
                filledFields.push('documento');
            } else {
                skippedFields.push('documento');
            }
        }

        const rawConcepto = an.concepto || an.notas_sugeridas;
        if (rawConcepto && String(rawConcepto).trim()) {
            if (canApply('concepto', !String(cur.concepto || '').trim(), false)) {
                patch.concepto = String(rawConcepto).trim().toUpperCase();
                markOcrOwned('concepto');
                filledFields.push('concepto');
            } else {
                skippedFields.push('concepto');
            }
        }

        if (Object.keys(patch).length > 0) {
            setFormData(prev => ({ ...prev, ...patch }));
        }

        return { filledFields, skippedFields };
    }, [editingMovement, fetchCatalogsForCompany, loadModalLegResumen, loadModalResumen]);

    // R5.3 OCR Application (Transfer Modal)
    const applyOcrAnalysisToTransferForm = useCallback((an, { force = false } = {}) => {
        if (!an) return { filledFields: [], skippedFields: [] };
        const cur = transferValuesRef.current || {};
        const filledFields = [];
        const skippedFields = [];

        const canApply = (field, isEmpty, allowDefaultOverwrite = false) => {
            if (force) return true;
            if (transferDirtyFieldsRef.current.has(field)) return false;
            if (transferOcrAppliedFieldsRef.current.has(field)) return false;
            if (isEmpty) return true;
            return allowDefaultOverwrite;
        };

        const markOcrOwned = (field) => {
            transferOcrAppliedFieldsRef.current.add(field);
            if (force) transferDirtyFieldsRef.current.delete(field);
        };

        const patch = {};

        if (an.cuenta_bancaria_id) {
            const matchedAcc = findMatchingCuenta(cuentasRef.current, { cuentaId: an.cuenta_bancaria_id });
            if (matchedAcc) {
                if (canApply('cuenta_debitar_id', !cur.cuenta_debitar_id, false)) {
                    patch.cuenta_debitar_id = String(matchedAcc.corr);
                    markOcrOwned('cuenta_debitar_id');
                    filledFields.push('cuenta origen');
                    loadTransferLegResumen('deb', matchedAcc.corr);
                } else {
                    skippedFields.push('cuenta origen');
                }
            }
        }

        const rawMonto = an.monto ?? an.monto_usd;
        if (rawMonto && Number(rawMonto) > 0) {
            if (canApply('monto', !String(cur.monto || '').trim(), false)) {
                patch.monto = Number(rawMonto).toFixed(2);
                markOcrOwned('monto');
                filledFields.push('monto');
            } else {
                skippedFields.push('monto');
            }
        }

        const rawFecha = an.fecha || an.fecha_pago;
        if (rawFecha && /^\d{4}-\d{2}-\d{2}$/.test(String(rawFecha).trim())) {
            if (canApply('fecha', !cur.fecha, true)) {
                patch.fecha = String(rawFecha).trim();
                markOcrOwned('fecha');
                filledFields.push('fecha');
            } else {
                skippedFields.push('fecha');
            }
        }

        const rawDoc = an.documento || an.referencia || an.referencia_doc;
        if (rawDoc && String(rawDoc).trim()) {
            if (canApply('documento', !String(cur.documento || '').trim(), false)) {
                patch.documento = String(rawDoc).trim().toUpperCase();
                markOcrOwned('documento');
                filledFields.push('documento');
            } else {
                skippedFields.push('documento');
            }
        }

        const rawConcepto = an.concepto || an.notas_sugeridas;
        if (rawConcepto && String(rawConcepto).trim()) {
            if (canApply('concepto', !String(cur.concepto || '').trim(), false)) {
                patch.concepto = String(rawConcepto).trim().toUpperCase();
                markOcrOwned('concepto');
                filledFields.push('concepto');
            } else {
                skippedFields.push('concepto');
            }
        }

        if (Object.keys(patch).length > 0) {
            setTransferData(prev => ({ ...prev, ...patch }));
        }

        return { filledFields, skippedFields };
    }, [loadTransferLegResumen]);

    const runMovementOcr = useCallback(async ({ dataUrl, nombreOriginal, target = 'modal' }) => {
        if (!dataUrl) return;
        setAnalyzingOcr(true);
        try {
            const ctx = target === 'transfer'
                ? { descripcion: transferValuesRef.current?.concepto || 'Transferencia bancaria', tipo: 'CARGO' }
                : { descripcion: formValuesRef.current?.concepto || '', tipo: formValuesRef.current?.tipo || '' };

            const res = await api.post('/bancos/movimientos/analizar-comprobante', {
                data_url: dataUrl,
                nombre_original: nombreOriginal,
                contexto: ctx
            });
            const an = res.data?.analisis;
            if (an) {
                if (target === 'transfer') {
                    setTransferLastOcrResult(an);
                    const { filledFields, skippedFields } = applyOcrAnalysisToTransferForm(an);
                    if (filledFields.length > 0) {
                        addToast(`IA completó: ${filledFields.join(', ')}`, 'success');
                    } else if (skippedFields.length > 0) {
                        addToast('Comprobante leído; se conservaron tus valores actuales. Usa "Aplicar datos OCR" para sobrescribir.', 'info');
                    } else {
                        addToast('Comprobante analizado con IA', 'success');
                    }
                } else {
                    setLastOcrResult(an);
                    const { filledFields, skippedFields } = await applyOcrAnalysisToForm(an);
                    if (filledFields.length > 0) {
                        addToast(`IA completó: ${filledFields.join(', ')}`, 'success');
                    } else if (skippedFields.length > 0) {
                        addToast('Comprobante leído; se conservaron tus valores actuales. Usa "Aplicar datos OCR" para sobrescribir.', 'info');
                    } else {
                        addToast('Comprobante analizado con IA', 'success');
                    }
                }
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'No se pudo analizar automáticamente el comprobante', 'warning');
        } finally {
            setAnalyzingOcr(false);
        }
    }, [addToast, applyOcrAnalysisToForm, applyOcrAnalysisToTransferForm]);

    const processReceiptFiles = useCallback(async (fileList, target = 'modal') => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (files.length === 0) return;

        setCompressingFiles(true);
        const batch = [];
        try {
            for (const file of files.slice(0, 8)) {
                try {
                    const comp = await compressReceiptFile(file);
                    batch.push({
                        ...comp,
                        tempId: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        nota: ''
                    });
                } catch (fileErr) {
                    addToast(fileErr.message || `Error comprimiendo ${file.name}`, 'warning');
                }
            }
            if (batch.length === 0) return;

            if (target === 'gallery' && galleryMovement?.id) {
                setUploadingGallery(true);
                try {
                    const deduped = deduplicateReceiptBatch(galleryItems, batch);
                    const res = await api.post(`/bancos/movimientos/${galleryMovement.id}/comprobantes`, {
                        comprobantes: deduped.map(r => ({
                            data_url: r.data_url,
                            nombre_original: r.nombre_original,
                            ancho: r.ancho,
                            alto: r.alto,
                            nota: r.nota || ''
                        }))
                    });
                    const updatedList = res.data?.comprobantes || [];
                    setGalleryItems(updatedList);
                    setMovements(prev => prev.map(m => (
                        Number(m.id) === Number(galleryMovement.id)
                            ? {
                                ...m,
                                comprobante_url: res.data?.comprobante_url || m.comprobante_url,
                                signed_url: res.data?.comprobante_url || m.signed_url,
                                comprobantes_count: updatedList.length
                            }
                            : m
                    )));
                    addToast(`${deduped.length} comprobante(s) adjuntado(s)`, 'success');
                } catch (upErr) {
                    const status = upErr.response?.status;
                    addToast(
                        upErr.response?.data?.message || 'Error al subir comprobante',
                        status === 423 ? 'warning' : 'error'
                    );
                } finally {
                    setUploadingGallery(false);
                }
                return;
            }

            if (target === 'transfer') {
                const deduped = deduplicateReceiptBatch(transferReceiptsRef.current, batch);
                setTransferReceipts(prev => [...prev, ...deduped]);
                addToast(`${deduped.length} comprobante(s) listo(s) para adjuntar`, 'success');
                if (autoOcrEnabled && deduped[0]?.data_url) {
                    runMovementOcr({
                        dataUrl: deduped[0].data_url,
                        nombreOriginal: deduped[0].nombre_original,
                        target: 'transfer'
                    });
                }
                return;
            }

            const deduped = deduplicateReceiptBatch([...existingReceipts, ...pendingReceiptsRef.current], batch);
            setPendingReceipts(prev => [...prev, ...deduped]);
            addToast(`${deduped.length} comprobante(s) listo(s) para guardar`, 'success');
            if (autoOcrEnabled && deduped[0]?.data_url) {
                runMovementOcr({
                    dataUrl: deduped[0].data_url,
                    nombreOriginal: deduped[0].nombre_original,
                    target: 'modal'
                });
            }
        } finally {
            setCompressingFiles(false);
        }
    }, [addToast, autoOcrEnabled, existingReceipts, galleryItems, galleryMovement?.id, runMovementOcr]);

    // Global Ctrl+V Paste Listener guarded against Lightbox & Confirm dialogs
    useEffect(() => {
        const activeTarget = galleryMovement
            ? 'gallery'
            : (showTransferModal ? 'transfer' : (showModal ? 'modal' : null));
        if (!activeTarget || viewerOpen) return undefined;

        const handlePaste = (e) => {
            if (confirmOpenRef.current || viewerOpen) return;
            const items = e.clipboardData?.items;
            if (!items) return;
            const files = [];
            for (const item of items) {
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                processReceiptFiles(files, activeTarget);
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [galleryMovement, processReceiptFiles, showModal, showTransferModal, viewerOpen]);

    // Open Standard Modal (Create / Edit)
    const handleOpenModal = async (movement = null) => {
        resetFieldTracking();
        setPendingReceipts([]);
        setExistingReceipts([]);
        setLastOcrResult(null);
        setModalCuentaResumen(null);
        setModalDebResumen(null);
        setModalCredResumen(null);

        if (movement) {
            setEditingMovement(movement);
            const acc = findMatchingCuenta(cuentas, {
                cuentaId: movement.cuenta_bancaria_id,
                empresaId: movement.id_empresa,
                numeroCuenta: movement.numero_cuenta
            });
            const resolvedCuentaId = String(movement.cuenta_bancaria_id || acc?.corr || '');
            setFormData({
                id_empresa: String(movement.id_empresa || ''),
                numero_cuenta: String(movement.numero_cuenta || ''),
                cuenta_bancaria_id: resolvedCuentaId,
                cuenta_debitar_id: resolvedCuentaId,
                cuenta_acreditar_id: '',
                fecha: formatDateForInput(movement.fecha),
                fecha_aplicado: formatDateForInput(movement.fecha_aplicado),
                documento: movement.documento || '',
                concepto: movement.concepto || '',
                monto: movement.monto ?? '',
                tipo: Number(movement.cargo || 0) > 0 ? 'CARGO' : 'ABONO',
                cod_remesa: movement.cod_remesa || '',
                cod_cta: movement.cod_cta || '',
                num_partida: movement.num_partida || ''
            });
            setShowModal(true);
            await fetchCatalogsForCompany(movement.id_empresa, true);
            if (resolvedCuentaId) loadModalResumen(resolvedCuentaId);
            setLoadingExistingReceipts(true);
            try {
                const resComp = await api.get(`/bancos/movimientos/${movement.id}/comprobantes`);
                setExistingReceipts(resComp.data?.comprobantes || []);
            } catch {
                setExistingReceipts([]);
            } finally {
                setLoadingExistingReceipts(false);
            }
        } else {
            setEditingMovement(null);
            const matchedFilterAcc = filters.numero_cuenta
                ? findMatchingCuenta(cuentas, { empresaId: filters.id_empresa, numeroCuenta: filters.numero_cuenta })
                : null;
            const preEmpresa = matchedFilterAcc
                ? String(matchedFilterAcc.id_empresa || '')
                : String(filters.id_empresa || '');
            const preNumero = matchedFilterAcc ? String(matchedFilterAcc.numero || '') : '';
            const preCuentaId = matchedFilterAcc ? String(matchedFilterAcc.corr || '') : '';

            setFormData({
                id_empresa: preEmpresa,
                numero_cuenta: preNumero,
                cuenta_bancaria_id: preCuentaId,
                cuenta_debitar_id: preCuentaId,
                cuenta_acreditar_id: '',
                fecha: getSvTodayYMD(),
                fecha_aplicado: '',
                documento: '',
                concepto: '',
                monto: '',
                tipo: 'ABONO',
                cod_remesa: '',
                cod_cta: '',
                num_partida: ''
            });
            setShowModal(true);
            if (preEmpresa) {
                await fetchCatalogsForCompany(preEmpresa, false);
            } else {
                remesasRef.current = [];
                setRemesas([]);
            }
            if (preCuentaId) {
                loadModalResumen(preCuentaId);
            }
        }
    };

    // R5.6 Duplicar / Repetir
    const handleDuplicate = async (movement) => {
        if (!movement) return;
        resetFieldTracking();
        setEditingMovement(null);
        setPendingReceipts([]);
        setExistingReceipts([]);
        setLastOcrResult(null);
        setModalCuentaResumen(null);
        setModalDebResumen(null);
        setModalCredResumen(null);

        const acc = findMatchingCuenta(cuentas, {
            cuentaId: movement.cuenta_bancaria_id,
            empresaId: movement.id_empresa,
            numeroCuenta: movement.numero_cuenta
        });
        const resolvedCuentaId = String(movement.cuenta_bancaria_id || acc?.corr || '');
        const resolvedEmpresa = String(movement.id_empresa || acc?.id_empresa || '');

        setFormData({
            id_empresa: resolvedEmpresa,
            numero_cuenta: String(movement.numero_cuenta || acc?.numero || ''),
            cuenta_bancaria_id: resolvedCuentaId,
            cuenta_debitar_id: resolvedCuentaId,
            cuenta_acreditar_id: '',
            fecha: getSvTodayYMD(),
            fecha_aplicado: '',
            documento: '',
            concepto: movement.concepto || '',
            monto: movement.monto ?? '',
            tipo: Number(movement.cargo || 0) > 0 ? 'CARGO' : 'ABONO',
            cod_remesa: movement.cod_remesa || '',
            cod_cta: movement.cod_cta || '',
            num_partida: ''
        });
        setShowModal(true);
        if (resolvedEmpresa) {
            await fetchCatalogsForCompany(resolvedEmpresa, true);
        }
        if (resolvedCuentaId) {
            loadModalResumen(resolvedCuentaId);
        }
        addToast('Movimiento copiado. Verifica el nuevo número de documento y fecha.', 'info');
    };

    // R5.1 Open Dedicated Transfer Modal
    const handleOpenTransferModal = () => {
        resetTransferFieldTracking();
        setTransferReceipts([]);
        setTransferLastOcrResult(null);
        setTransferDebResumen(null);
        setTransferCredResumen(null);
        setTransferError('');

        const matchedFilterAcc = filters.numero_cuenta
            ? findMatchingCuenta(cuentas, { empresaId: filters.id_empresa, numeroCuenta: filters.numero_cuenta })
            : null;
        const preDebId = matchedFilterAcc?.corr ? String(matchedFilterAcc.corr) : '';
        const debName = matchedFilterAcc ? (matchedFilterAcc.nombre || matchedFilterAcc.numero) : '';

        setTransferData({
            empresa_origen_filter: filters.id_empresa || '',
            empresa_destino_filter: '',
            cuenta_debitar_id: preDebId,
            cuenta_acreditar_id: '',
            fecha: getSvTodayYMD(),
            fecha_aplicado: '',
            documento: '',
            monto: '',
            concepto: debName ? `TRANSFERENCIA DE ${debName} / ` : '',
            cod_cta: '',
            num_partida: ''
        });
        setShowTransferModal(true);
        if (preDebId) {
            loadTransferLegResumen('deb', preDebId);
        }
    };

    const handleTransferSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setTransferError('');

        if (!transferData.cuenta_debitar_id || !transferData.cuenta_acreditar_id) {
            addToast('Debe seleccionar la Cuenta Origen (Debitar) y la Cuenta Destino (Acreditar)', 'warning');
            return;
        }
        if (String(transferData.cuenta_debitar_id) === String(transferData.cuenta_acreditar_id)) {
            addToast('La Cuenta a Debitar y la Cuenta a Acreditar no pueden ser la misma cuenta', 'warning');
            return;
        }
        const montoNum = Number(transferData.monto);
        if (!Number.isFinite(montoNum) || montoNum <= 0) {
            addToast('El monto debe ser mayor a $0.00', 'warning');
            return;
        }
        if (!String(transferData.documento || '').trim()) {
            addToast('Debe ingresar un número de documento o referencia', 'warning');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                cuenta_debitar_id: Number(transferData.cuenta_debitar_id),
                cuenta_acreditar_id: Number(transferData.cuenta_acreditar_id),
                fecha: transferData.fecha,
                fecha_aplicado: transferData.fecha_aplicado || null,
                documento: transferData.documento.trim().toUpperCase(),
                concepto: (transferData.concepto || '').trim().toUpperCase(),
                monto: montoNum,
                cod_cta: transferData.cod_cta || '',
                num_partida: transferData.num_partida || '',
                comprobantes: transferReceipts.map(r => ({
                    data_url: r.data_url,
                    nombre_original: r.nombre_original,
                    ancho: r.ancho,
                    alto: r.alto,
                    nota: r.nota || '',
                    ocr_json: transferLastOcrResult || null
                }))
            };
            const res = await api.post('/bancos/movimientos/transferencia', payload, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            const isInter = Boolean(res.data?.intercompany);
            addToast(
                isInter
                    ? 'Transferencia inter-empresa registrada con éxito'
                    : 'Transferencia entre cuentas registrada con éxito',
                'success'
            );
            setShowTransferModal(false);
            fetchMovements();
            if (filters.numero_cuenta) {
                const activeAcc = findMatchingCuenta(cuentas, { empresaId: filters.id_empresa, numeroCuenta: filters.numero_cuenta });
                if (activeAcc) refreshFilterResumen(activeAcc);
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Error al registrar transferencia';
            if (err.response?.status === 423) {
                setTransferError(msg);
                addToast(msg, 'warning');
            } else {
                addToast(msg, 'error');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        const isTransfer = !editingMovement && isTransferTipo(formData.cod_remesa);
        if (isTransfer) {
            if (!formData.cuenta_debitar_id || !formData.cuenta_acreditar_id) {
                addToast('Debe seleccionar tanto la Cuenta a Debitar como la Cuenta a Acreditar', 'warning');
                return;
            }
            if (String(formData.cuenta_debitar_id) === String(formData.cuenta_acreditar_id)) {
                addToast('La Cuenta a Debitar y la Cuenta a Acreditar no pueden ser la misma cuenta', 'warning');
                return;
            }
        } else {
            if (!formData.numero_cuenta && !formData.cuenta_bancaria_id) {
                addToast('Debe seleccionar una Cuenta Bancaria', 'warning');
                return;
            }
        }

        const montoNum = Number(formData.monto);
        if (!Number.isFinite(montoNum) || montoNum <= 0) {
            addToast('El monto debe ser mayor a $0.00', 'warning');
            return;
        }

        const calculatedTipo = resolveMovementTipo(formData.cod_remesa, formData.tipo);

        const receiptsPayload = pendingReceipts.map(r => ({
            data_url: r.data_url,
            nombre_original: r.nombre_original,
            ancho: r.ancho,
            alto: r.alto,
            nota: r.nota || '',
            ocr_json: lastOcrResult || null
        }));

        setSubmitting(true);
        try {
            if (editingMovement) {
                const scalarPayload = {
                    ...formData,
                    tipo: calculatedTipo,
                    is_transferencia: false,
                    version: editingMovement.version
                };
                await api.put(`/bancos/movimientos/${editingMovement.id}`, scalarPayload);
                let receiptErrorMsg = '';
                if (receiptsPayload.length > 0) {
                    try {
                        await api.post(`/bancos/movimientos/${editingMovement.id}/comprobantes`, {
                            comprobantes: receiptsPayload
                        });
                    } catch (recErr) {
                        receiptErrorMsg = recErr.response?.data?.message || 'No se pudieron subir los nuevos comprobantes';
                    }
                }
                if (receiptErrorMsg) {
                    addToast(`Movimiento actualizado, pero comprobante no guardado: ${receiptErrorMsg}`, 'warning');
                } else {
                    addToast('Movimiento actualizado con éxito', 'success');
                }
            } else if (isTransfer) {
                const transferPayload = {
                    cuenta_debitar_id: Number(formData.cuenta_debitar_id),
                    cuenta_acreditar_id: Number(formData.cuenta_acreditar_id),
                    fecha: formData.fecha,
                    fecha_aplicado: formData.fecha_aplicado || null,
                    documento: (formData.documento || '').trim().toUpperCase(),
                    concepto: (formData.concepto || '').trim().toUpperCase(),
                    monto: montoNum,
                    cod_cta: formData.cod_cta || '',
                    num_partida: formData.num_partida || '',
                    comprobantes: receiptsPayload
                };
                await api.post('/bancos/movimientos/transferencia', transferPayload, {
                    headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
                });
                addToast('Transferencia entre cuentas registrada con éxito', 'success');
            } else {
                const dataToSubmit = {
                    ...formData,
                    cuenta_bancaria_id: formData.cuenta_bancaria_id ? Number(formData.cuenta_bancaria_id) : undefined,
                    tipo: calculatedTipo,
                    is_transferencia: false,
                    ...(receiptsPayload.length > 0 ? { comprobantes: receiptsPayload } : {})
                };
                await api.post('/bancos/movimientos', dataToSubmit, {
                    headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
                });
                addToast('Movimiento registrado con éxito', 'success');
            }

            setShowModal(false);
            fetchMovements();
            if (filters.numero_cuenta) {
                const activeAcc = findMatchingCuenta(cuentas, { empresaId: filters.id_empresa, numeroCuenta: filters.numero_cuenta });
                if (activeAcc) refreshFilterResumen(activeAcc);
            }
        } catch (err) {
            const status = err.response?.status;
            addToast(
                err.response?.data?.message || `Error al ${editingMovement ? 'actualizar' : 'registrar'} movimiento`,
                status === 423 ? 'warning' : 'error'
            );
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (submitting) return;
        if (!await safeConfirm('¿Está seguro de eliminar este movimiento? Quedará respaldado en auditoría.', { variant: 'danger' })) return;
        setSubmitting(true);
        try {
            await api.delete(`/bancos/movimientos/${id}`);
            addToast('Movimiento eliminado', 'success');
            fetchMovements();
            if (filters.numero_cuenta) {
                const activeAcc = findMatchingCuenta(cuentas, { empresaId: filters.id_empresa, numeroCuenta: filters.numero_cuenta });
                if (activeAcc) refreshFilterResumen(activeAcc);
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar movimiento', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // Gallery & Lightbox Actions (R5.3)
    const openMovementGallery = async (movement) => {
        if (!movement?.id) return;
        setGalleryMovement(movement);
        setGalleryItems([]);
        setEditingCompId(null);
        setEditingCompNota('');
        setLoadingGallery(true);
        try {
            const res = await api.get(`/bancos/movimientos/${movement.id}/comprobantes`);
            setGalleryItems(res.data?.comprobantes || []);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar comprobantes del movimiento', 'error');
        } finally {
            setLoadingGallery(false);
        }
    };

    const openReceiptLightbox = (items, idx = 0, title = 'Comprobantes del Movimiento', allowDelete = false) => {
        setViewerItems(items || []);
        setViewerIdx(idx);
        setViewerTitle(title);
        setViewerAllowDelete(Boolean(allowDelete));
        setViewerOpen(true);
    };

    const handleSaveComprobanteNota = async (compId) => {
        if (!compId || savingCompNota) return;
        setSavingCompNota(true);
        try {
            const res = await api.patch(`/bancos/movimientos/comprobantes/${compId}`, {
                nota: editingCompNota
            });
            const updatedNota = res.data?.comprobante?.nota ?? editingCompNota;
            setGalleryItems(prev => prev.map(item => (
                Number(item.id) === Number(compId) ? { ...item, nota: updatedNota } : item
            )));
            setExistingReceipts(prev => prev.map(item => (
                Number(item.id) === Number(compId) ? { ...item, nota: updatedNota } : item
            )));
            setEditingCompId(null);
            setEditingCompNota('');
            addToast('Nota actualizada', 'success');
        } catch (err) {
            const status = err.response?.status;
            addToast(err.response?.data?.message || 'Error al actualizar nota', status === 423 ? 'warning' : 'error');
        } finally {
            setSavingCompNota(false);
        }
    };

    const handleDeleteComprobante = async (comp) => {
        if (!comp?.id) return;
        const ok = await safeConfirm(`¿Eliminar el comprobante "${comp.nombre_original || 'archivo'}"?`, { variant: 'danger' });
        if (!ok) return;
        try {
            const res = await api.delete(`/bancos/movimientos/comprobantes/${comp.id}`);
            const movId = res.data?.movimiento_id || comp.movimiento_id || galleryMovement?.id || editingMovement?.id;
            const nextUrl = res.data?.comprobante_url || null;

            setGalleryItems(prev => {
                const next = prev.filter(item => Number(item.id) !== Number(comp.id));
                if (movId) {
                    setMovements(mPrev => mPrev.map(m => (
                        Number(m.id) === Number(movId)
                            ? { ...m, comprobante_url: nextUrl, signed_url: nextUrl, comprobantes_count: next.length }
                            : m
                    )));
                }
                return next;
            });
            setExistingReceipts(prev => prev.filter(item => Number(item.id) !== Number(comp.id)));
            setViewerItems(prev => {
                const next = prev.filter(item => Number(item.id) !== Number(comp.id));
                if (next.length === 0) setViewerOpen(false);
                else setViewerIdx(i => Math.min(i, next.length - 1));
                return next;
            });
            addToast('Comprobante eliminado', 'success');
        } catch (err) {
            const status = err.response?.status;
            addToast(err.response?.data?.message || 'Error al eliminar comprobante', status === 423 ? 'warning' : 'error');
        }
    };

    const filteredMovements = useMemo(() => {
        if (!searchTerm) return movements;
        const lowSearch = searchTerm.toLowerCase();
        return movements.filter(m =>
            (m.concepto || '').toLowerCase().includes(lowSearch) ||
            (m.documento || '').toLowerCase().includes(lowSearch) ||
            (m.llave || '').toLowerCase().includes(lowSearch)
        );
    }, [movements, searchTerm]);

    const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
    const paginatedMovements = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredMovements.slice(start, start + itemsPerPage);
    }, [filteredMovements, currentPage]);

    const handleExportExcel = () => {
        if (!filteredMovements.length) {
            addToast('No hay movimientos para exportar', 'warning');
            return;
        }
        try {
            const rows = filteredMovements.map(m => ({
                Fecha: m.fecha || '',
                'Fecha Aplicado': m.fecha_aplicado || '',
                Llave: m.llave || '',
                Documento: m.documento || '',
                Empresa: m.empresa_nombre || m.id_empresa || '',
                Cuenta: m.numero_cuenta || '',
                Tipo: Number(m.cargo || 0) > 0 ? 'CARGO' : 'ABONO',
                Concepto: m.concepto || '',
                'Cargo ($)': Number(m.cargo || 0),
                'Abono ($)': Number(m.abono || 0),
                Monto: Number(m.monto ?? 0),
                Partida: m.num_partida || '',
                Comprobantes: Number(m.comprobantes_count || (m.comprobante_url ? 1 : 0))
            }));
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(rows));
            XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
            XLSX.writeFile(wb, `movimientos_bancarios_${filters.desde || getSvTodayYMD()}_${filters.hasta || getSvTodayYMD()}.xlsx`);
            addToast(`Exportados ${rows.length} movimientos a Excel`, 'success');
        } catch {
            addToast('Error al exportar movimientos a Excel', 'error');
        }
    };

    // R5.2 Live Account Summary Chip Renderer
    const renderCuentaResumenChip = (resumen, isLoading, { showConciliado = true } = {}) => {
        if (!isLoading && !resumen) return null;
        if (isLoading) {
            return (
                <div style={{ marginTop: '0.45rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Consultando saldo de chequera y correlativo...
                </div>
            );
        }
        const saldoChequera = Number(resumen.saldo_chequera || 0);
        const saldoBanco = Number(resumen.saldo_conciliado_libros || 0);
        const tal = resumen.talonario_activo;
        return (
            <div style={{
                marginTop: '0.45rem',
                padding: '0.4rem 0.65rem',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.45rem 0.85rem',
                alignItems: 'center',
                fontSize: '0.76rem'
            }}>
                <span>
                    Saldo Chequera:{' '}
                    <strong style={{ color: saldoChequera < 0 ? '#ef4444' : '#10b981' }}>
                        {moneyFmt(saldoChequera)}
                    </strong>
                </span>
                {showConciliado && (
                    <span style={{ color: 'var(--text-muted)' }}>
                        Saldo Banco (Conciliado):{' '}
                        <strong style={{ color: 'var(--text)' }}>
                            {moneyFmt(saldoBanco)}
                        </strong>
                    </span>
                )}
                <span style={{ color: 'var(--text-muted)' }}>
                    Último Cheque #: <strong style={{ color: 'var(--text)' }}>{resumen.ultimo_numero_cheque || 'N/A'}</strong>
                </span>
                {tal && (
                    <span
                        className="badge"
                        style={{
                            fontSize: '0.72rem',
                            padding: '0.15rem 0.45rem',
                            background: tal.agotado ? 'rgba(239,68,68,0.15)' : (tal.stock_bajo ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'),
                            color: tal.agotado ? '#ef4444' : (tal.stock_bajo ? '#f59e0b' : '#10b981'),
                            border: `1px solid ${tal.agotado ? 'rgba(239,68,68,0.3)' : (tal.stock_bajo ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)')}`
                        }}
                    >
                        Talonario{tal.serie ? ` ${tal.serie}` : ''}: {tal.disponibles} disp.
                    </span>
                )}
            </div>
        );
    };

    // Derived transfer accounts for Transfer Modal & Inline TR
    const transferOriginAccounts = useMemo(() => {
        const list = transferData.empresa_origen_filter
            ? cuentas.filter(c => String(c.id_empresa) === String(transferData.empresa_origen_filter))
            : cuentas;
        return sortCuentas(list);
    }, [cuentas, transferData.empresa_origen_filter]);

    const transferDestAccounts = useMemo(() => {
        const list = transferData.empresa_destino_filter
            ? cuentas.filter(c => String(c.id_empresa) === String(transferData.empresa_destino_filter))
            : cuentas;
        return sortCuentas(list);
    }, [cuentas, transferData.empresa_destino_filter]);

    const transferDebAcc = useMemo(
        () => findMatchingCuenta(cuentas, { cuentaId: transferData.cuenta_debitar_id }),
        [cuentas, transferData.cuenta_debitar_id]
    );
    const transferCredAcc = useMemo(
        () => findMatchingCuenta(cuentas, { cuentaId: transferData.cuenta_acreditar_id }),
        [cuentas, transferData.cuenta_acreditar_id]
    );
    const isInterCompanyTransfer = Boolean(
        transferDebAcc && transferCredAcc && String(transferDebAcc.id_empresa) !== String(transferCredAcc.id_empresa)
    );

    const modalDebAcc = useMemo(
        () => findMatchingCuenta(cuentas, { cuentaId: formData.cuenta_debitar_id }),
        [cuentas, formData.cuenta_debitar_id]
    );
    const modalCredAcc = useMemo(
        () => findMatchingCuenta(cuentas, { cuentaId: formData.cuenta_acreditar_id }),
        [cuentas, formData.cuenta_acreditar_id]
    );
    const isModalInterCompany = Boolean(
        modalDebAcc && modalCredAcc && String(modalDebAcc.id_empresa) !== String(modalCredAcc.id_empresa)
    );

    const renderReceiptDropzoneSection = (target) => {
        const isTransfer = target === 'transfer';
        const list = isTransfer ? transferReceipts : pendingReceipts;
        const ocrObj = isTransfer ? transferLastOcrResult : lastOcrResult;
        const fInputRef = isTransfer ? transferFileInputRef : fileInputRef;
        const cInputRef = isTransfer ? transferCameraInputRef : cameraInputRef;

        return (
            <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--border-radius)',
                border: isDragging ? '1.5px dashed var(--primary)' : '1px dashed var(--border)',
                background: isDragging ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255,255,255,0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem'
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer?.files?.length) {
                    processReceiptFiles(e.dataTransfer.files, target);
                }
            }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', fontWeight: 600 }}>
                        <Paperclip size={15} color="var(--primary)" />
                        <span>Comprobante (Ctrl+V, arrastrar, archivo o PDF)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <input
                                type="checkbox"
                                checked={autoOcrEnabled}
                                onChange={(e) => setAutoOcrEnabled(e.target.checked)}
                                style={{ width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                            />
                            <span>OCR IA automático</span>
                        </label>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => fInputRef.current?.click()}
                            style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <Upload size={13} /> Archivo
                        </button>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => cInputRef.current?.click()}
                            style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <Camera size={13} /> Cámara
                        </button>
                    </div>
                </div>

                <input
                    ref={fInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        if (e.target.files?.length) processReceiptFiles(e.target.files, target);
                        e.target.value = '';
                    }}
                />
                <input
                    ref={cInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        if (e.target.files?.length) processReceiptFiles(e.target.files, target);
                        e.target.value = '';
                    }}
                />

                {(compressingFiles || analyzingOcr) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.76rem', color: 'var(--primary)' }}>
                        <Loader2 size={14} className="spin" />
                        <span>{analyzingOcr ? 'Analizando comprobante con Gemini OCR...' : 'Comprimiendo archivo...'}</span>
                    </div>
                )}

                {ocrObj && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '6px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.28)',
                        fontSize: '0.76rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <Sparkles size={14} color="var(--primary)" />
                            <span>
                                OCR detectó:{' '}
                                <strong>{ocrObj.tipo_documento || ocrObj.metodo_pago || 'Comprobante'}</strong>
                                {(ocrObj.monto ?? ocrObj.monto_usd) ? ` · ${moneyFmt(ocrObj.monto ?? ocrObj.monto_usd)}` : ''}
                                {ocrObj.fecha ? ` · ${ocrObj.fecha}` : ''}
                                {ocrObj.referencia ? ` · Ref: ${ocrObj.referencia}` : ''}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={async () => {
                                const res = isTransfer
                                    ? applyOcrAnalysisToTransferForm(ocrObj, { force: true })
                                    : await applyOcrAnalysisToForm(ocrObj, { force: true });
                                if (res.filledFields.length > 0) {
                                    addToast(`Datos OCR aplicados: ${res.filledFields.join(', ')}`, 'success');
                                }
                            }}
                            style={{ height: '26px', padding: '0 0.6rem', fontSize: '0.73rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            <Sparkles size={12} /> Aplicar datos OCR
                        </button>
                    </div>
                )}

                {list.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {list.map((item, idx) => {
                            const isPdf = item.mime_type === 'application/pdf';
                            return (
                                <div key={item.tempId || idx} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.55rem',
                                    flexWrap: 'wrap',
                                    padding: '0.4rem 0.55rem',
                                    borderRadius: '6px',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border)'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => openReceiptLightbox(list, idx, 'Vista Previa de Adjuntos', false)}
                                        style={{
                                            width: '38px',
                                            height: '38px',
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                            border: '1px solid var(--border)',
                                            background: 'rgba(0,0,0,0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: 0,
                                            cursor: 'pointer'
                                        }}
                                        title="Ampliar vista previa"
                                    >
                                        {isPdf ? (
                                            <FileText size={18} color="#f59e0b" />
                                        ) : (
                                            <img src={item.data_url} alt={item.nombre_original} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        )}
                                    </button>
                                    <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                                        <div style={{ fontSize: '0.76rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {item.nombre_original}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            {formatBytes(item.tamano_bytes)}
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Nota breve (opcional)"
                                        value={item.nota || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const setter = isTransfer ? setTransferReceipts : setPendingReceipts;
                                            setter(prev => prev.map((r, i) => i === idx ? { ...r, nota: val } : r));
                                        }}
                                        style={{ flex: '1 1 140px', height: '30px', fontSize: '0.76rem', padding: '0 0.5rem' }}
                                    />
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => runMovementOcr({ dataUrl: item.data_url, nombreOriginal: item.nombre_original, target })}
                                        disabled={analyzingOcr}
                                        title="Analizar este archivo con IA"
                                        style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                    >
                                        <Sparkles size={12} /> OCR
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const setter = isTransfer ? setTransferReceipts : setPendingReceipts;
                                            setter(prev => prev.filter((_, i) => i !== idx));
                                        }}
                                        style={{ background: 'none', color: '#ef4444', padding: '0.25rem', cursor: 'pointer' }}
                                        title="Quitar adjunto"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="movimientos-bancarios-page" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <Landmark size={22} color="var(--primary)" />
                        Movimientos Bancarios
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Historial e ingreso de transacciones, transferencias inter-empresa y comprobantes digitales.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleOpenTransferModal}
                        style={{
                            display: 'inline-flex',
                            gap: '0.45rem',
                            alignItems: 'center',
                            height: '36px',
                            padding: '0 1rem',
                            fontSize: '0.825rem',
                            borderColor: 'rgba(59, 130, 246, 0.45)',
                            color: '#60a5fa'
                        }}
                    >
                        <ArrowLeftRight size={16} />
                        ⇄ Nueva Transferencia
                    </button>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleOpenModal()}
                        style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center', height: '36px', padding: '0 1rem', fontSize: '0.825rem' }}
                    >
                        <Plus size={16} />
                        Nuevo Movimiento
                    </button>
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleExportExcel}
                        style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center', height: '36px', padding: '0 1rem', fontSize: '0.825rem' }}
                    >
                        <Download size={16} />
                        Exportar
                    </button>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="card glass" style={{ marginBottom: 0, padding: '1rem 1.25rem' }}>
                {/* R5.5 Quick Period Presets */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginRight: '0.25rem' }}>
                        <Clock size={13} /> Periodo:
                    </span>
                    {PERIOD_PRESETS.map(p => {
                        const active = periodoPreset === p.key;
                        return (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => applyPeriodoPreset(p.key)}
                                style={{
                                    height: '28px',
                                    padding: '0 0.65rem',
                                    fontSize: '0.75rem',
                                    borderRadius: '9999px',
                                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                                    background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                                    color: active ? 'var(--primary)' : 'var(--text-muted)',
                                    fontWeight: active ? 600 : 500,
                                    cursor: 'pointer'
                                }}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 180px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Empresa</label>
                        <select
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                            value={filters.id_empresa}
                            onChange={e => handleFilterEmpresaChange(e.target.value)}
                        >
                            <option value="">Todas las empresas</option>
                            {empresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: '2 1 250px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Cuenta</label>
                        <select
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                            value={filters.numero_cuenta}
                            onChange={e => handleFilterCuentaChange(e.target.value)}
                        >
                            <option value="">Todas las cuentas</option>
                            {sortCuentas(cuentas.filter(c => !filters.id_empresa || c.id_empresa === filters.id_empresa)).map(acc => (
                                <option key={acc.corr} value={acc.numero}>{formatCuentaLabel(acc)}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: '0 1 138px', minWidth: '120px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Desde</label>
                        <input
                            type="date"
                            value={filters.desde}
                            onChange={e => {
                                setPeriodoPreset('');
                                setFilters(prev => ({ ...prev, desde: e.target.value }));
                            }}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ flex: '0 1 138px', minWidth: '120px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Hasta</label>
                        <input
                            type="date"
                            value={filters.hasta}
                            onChange={e => {
                                setPeriodoPreset('');
                                setFilters(prev => ({ ...prev, hasta: e.target.value }));
                            }}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', flex: '1 1 200px' }}>
                        <div style={{ position: 'relative', flex: '1 1 140px' }}>
                            <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                style={{ paddingLeft: '2.1rem', width: '100%', height: '36px', fontSize: '0.825rem' }}
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            />
                        </div>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => fetchMovements()}
                            title="Actualizar"
                            style={{ height: '36px', padding: '0 1.1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <Filter size={15} />
                            Filtrar
                        </button>
                    </div>
                </div>

                {/* R5.2 Live Account Summary Chip in Filter Bar */}
                {filters.numero_cuenta && renderCuentaResumenChip(filterCuentaResumen, loadingFilterResumen)}

                {truncatedInfo.truncated && (
                    <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertCircle size={14} />
                        <span>Mostrando los primeros {movements.length} de {truncatedInfo.total} movimientos. Aplique filtros de cuenta o fechas más específicos para ver todo el detalle.</span>
                    </div>
                )}
            </div>

            {/* Main Table */}
            <div className="card glass table-responsive" style={{ padding: 0 }}>
                <table style={{ fontSize: '0.8rem', width: '100%', minWidth: '980px', borderCollapse: 'collapse', marginTop: 0 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Fecha</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Llave / Doc</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Cuenta</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Concepto</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Cargo / Débito (-)</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Abono / Crédito (+)</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Comp.</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>Cargando movimientos...</td></tr>
                        ) : paginatedMovements.length === 0 ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No se encontraron movimientos para los filtros seleccionados.</td></tr>
                        ) : paginatedMovements.map(m => {
                            const compCount = Number(m.comprobantes_count || (m.comprobante_url || m.signed_url ? 1 : 0));
                            return (
                                <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }} className="hover-row">
                                    <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                        <div>{m.fecha}</div>
                                        {m.fecha_aplicado && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Apl: {m.fecha_aplicado}</div>}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 'bold' }}>{m.llave}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{m.documento}</div>
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>
                                        <div style={{ fontWeight: '500' }}>{m.numero_cuenta}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.empresa_nombre}</div>
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', maxWidth: '300px' }} title={m.concepto}>
                                        <div style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.concepto}</div>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.15rem', alignItems: 'center' }}>
                                            {m.banco_nombre && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.banco_nombre}</span>}
                                            {m.num_partida && <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Pda: {m.num_partida}</span>}
                                            {m.transfer_group_id && (
                                                <span style={{ fontSize: '0.68rem', padding: '0.08rem 0.35rem', borderRadius: '4px', background: 'rgba(59,130,246,0.12)', color: '#60a5fa', fontWeight: 600 }}>
                                                    ⇄ Transf.
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: m.cargo > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: m.cargo > 0 ? 'bold' : 'normal', whiteSpace: 'nowrap' }}>
                                        {m.cargo > 0 ? moneyFmt(m.cargo) : '-'}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: m.abono > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: m.abono > 0 ? 'bold' : 'normal', whiteSpace: 'nowrap' }}>
                                        {m.abono > 0 ? moneyFmt(m.abono) : '-'}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={() => openMovementGallery(m)}
                                            title={compCount > 0 ? `Ver / gestionar ${compCount} comprobante(s)` : 'Adjuntar comprobante'}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '9999px',
                                                fontSize: '0.72rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                border: compCount > 0 ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--border)',
                                                background: compCount > 0 ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                                                color: compCount > 0 ? '#60a5fa' : 'var(--text-muted)'
                                            }}
                                        >
                                            <Paperclip size={12} />
                                            {compCount > 0 ? compCount : '+'}
                                        </button>
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleDuplicate(m)}
                                                style={{ background: 'none', color: '#60a5fa', padding: '0.25rem', cursor: 'pointer' }}
                                                title="Duplicar / Repetir movimiento"
                                            >
                                                <Copy size={15} />
                                            </button>
                                            {m.es_contabilizado !== 'S' && !m.fecha_aplicado ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenModal(m)}
                                                        style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem', cursor: 'pointer' }}
                                                        title="Editar"
                                                    >
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDelete(m.id)}
                                                        disabled={submitting}
                                                        style={{ background: 'none', color: '#ef4444', padding: '0.25rem', cursor: 'pointer' }}
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </>
                                            ) : m.fecha_aplicado ? (
                                                <span title={`Conciliado (${m.fecha_aplicado}) - Desconcilie primero para editar o eliminar`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#10b981', fontSize: '0.72rem' }}>
                                                    <Lock size={13} /> Conc.
                                                </span>
                                            ) : (
                                                <span title="Contabilizado - No se puede editar ni eliminar">
                                                    <CheckCircle size={15} color="var(--success)" />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Mostrando {paginatedMovements.length} de {filteredMovements.length} movimientos
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button type="button" className="btn-secondary" style={{ padding: '0.35rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={16} /></button>
                            <span style={{ fontSize: '0.8rem' }}>Página <strong>{currentPage}</strong> de {totalPages}</span>
                            <button type="button" className="btn-secondary" style={{ padding: '0.35rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight size={16} /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* Standard Create / Edit Modal */}
            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                size="lg"
                title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>{editingMovement ? <Edit2 size={18} color="var(--primary)" /> : <Plus size={18} color="var(--primary)" />}{editingMovement ? 'Editar Movimiento' : 'Nuevo Movimiento Bancario'}</span>}
            >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Empresa</label>
                            <select
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                value={formData.id_empresa}
                                onChange={e => handleCompanyChange(e.target.value)}
                                required
                            >
                                <option value="">Seleccione Empresa...</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Partida Contable</label>
                            <div style={{ padding: '0 0.75rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--border-radius)', border: '1px solid var(--border)', fontSize: '0.825rem', height: '36px', display: 'flex', alignItems: 'center' }}>
                                {formData.num_partida || <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Sin partida</span>}
                            </div>
                        </div>
                    </div>

                    {/* Cuenta Bancaria (Simple o Transferencia Debitar/Acreditar inter-empresa) */}
                    {!editingMovement && isTransferTipo(formData.cod_remesa) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {isModalInterCompany && (
                                <div style={{
                                    padding: '0.35rem 0.6rem',
                                    borderRadius: '6px',
                                    background: 'rgba(59, 130, 246, 0.12)',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                    color: '#60a5fa',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}>
                                    <ArrowLeftRight size={14} />
                                    Transferencia Inter-Empresa: {modalDebAcc?.empresa_nombre} → {modalCredAcc?.empresa_nombre}
                                </div>
                            )}
                            <div className="form-grid form-grid-2" style={{ gap: '0.85rem' }}>
                                <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 700, color: '#ef4444' }}>
                                        <ArrowDownCircle size={15} /> CUENTA A DEBITAR (Origen)
                                    </label>
                                    <select
                                        style={{ width: '100%', height: '36px', fontSize: '0.825rem', border: '1px solid rgba(239, 68, 68, 0.4)' }}
                                        value={formData.cuenta_debitar_id}
                                        onChange={e => handleModalDebitAccountChange(e.target.value)}
                                        required
                                    >
                                        <option value="">Seleccione Cuenta a Debitar...</option>
                                        {sortCuentas(cuentas).map(c => (
                                            <option key={c.corr} value={c.corr}>
                                                {formatCuentaLabel(c)}
                                            </option>
                                        ))}
                                    </select>
                                    {modalDebAcc?.empresa_nombre && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            Empresa: <strong>{modalDebAcc.empresa_nombre}</strong>
                                        </div>
                                    )}
                                    {renderCuentaResumenChip(modalDebResumen, loadingModalDebResumen, { showConciliado: false })}
                                </div>

                                <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '0.65rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 700, color: '#10b981' }}>
                                        <ArrowUpCircle size={15} /> CUENTA A ACREDITAR (Destino)
                                    </label>
                                    <select
                                        style={{ width: '100%', height: '36px', fontSize: '0.825rem', border: '1px solid rgba(16, 185, 129, 0.4)' }}
                                        value={formData.cuenta_acreditar_id}
                                        onChange={e => handleModalCreditAccountChange(e.target.value)}
                                        required
                                    >
                                        <option value="">Seleccione Cuenta a Acreditar...</option>
                                        {sortCuentas(cuentas).map(c => (
                                            <option key={c.corr} value={c.corr}>
                                                {formatCuentaLabel(c)}
                                            </option>
                                        ))}
                                    </select>
                                    {modalCredAcc?.empresa_nombre && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            Empresa: <strong>{modalCredAcc.empresa_nombre}</strong>
                                        </div>
                                    )}
                                    {renderCuentaResumenChip(modalCredResumen, loadingModalCredResumen, { showConciliado: false })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Cuenta Bancaria</label>
                            <select
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                value={formData.numero_cuenta}
                                onChange={e => handleStandardAccountChange(e.target.value)}
                                disabled={!formData.id_empresa}
                                required
                            >
                                <option value="">Seleccione Cuenta...</option>
                                {sortCuentas(cuentas.filter(c => c.id_empresa === formData.id_empresa)).map(c => (
                                    <option key={c.corr} value={c.numero}>{formatCuentaLabel(c)}</option>
                                ))}
                            </select>
                            {renderCuentaResumenChip(modalCuentaResumen, loadingModalResumen)}
                        </div>
                    )}

                    {/* Fecha y Documento */}
                    <div className="form-grid form-grid-3">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fecha Mov.</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem', paddingLeft: '2.4rem' }}
                                    value={formData.fecha}
                                    onChange={e => { markDirty('fecha'); setFormData(prev => ({ ...prev, fecha: e.target.value })); }}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fecha Aplicado</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem', paddingLeft: '2.4rem' }}
                                    value={formData.fecha_aplicado}
                                    onChange={e => { markDirty('fecha_aplicado'); setFormData(prev => ({ ...prev, fecha_aplicado: e.target.value })); }}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Documento / Ref</label>
                            <div style={{ position: 'relative' }}>
                                <FileText size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem', paddingLeft: '2.4rem', textTransform: 'uppercase' }}
                                    placeholder="Ej: 12345"
                                    value={formData.documento}
                                    onChange={e => { markDirty('documento'); setFormData(prev => ({ ...prev, documento: e.target.value.toUpperCase() })); }}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Remesa y Monto */}
                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Tipo Movimientos</label>
                            <select
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                                value={formData.cod_remesa}
                                onChange={e => handleRemesaChange(e.target.value)}
                                disabled={!formData.id_empresa}
                                required
                            >
                                <option value="">Seleccione Tipo...</option>
                                {remesas.map(r => (
                                    <option key={r.id} value={r.id}>{r.descripcion}</option>
                                ))}
                            </select>
                            {formData.cod_remesa && (() => {
                                const isInlineTransfer = !editingMovement && isTransferTipo(formData.cod_remesa);
                                const resolvedTipo = resolveMovementTipo(formData.cod_remesa, formData.tipo);
                                const canToggleDirection = !isInlineTransfer && !isDebitTipo(formData.cod_remesa) && !isCreditTipo(formData.cod_remesa);
                                return (
                                    <div style={{
                                        fontSize: '0.74rem',
                                        marginTop: '0.3rem',
                                        fontWeight: '700',
                                        display: 'flex',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: '0.4rem',
                                        color: isInlineTransfer
                                            ? '#3b82f6'
                                            : resolvedTipo === 'CARGO'
                                                ? '#ef4444'
                                                : '#10b981'
                                    }}>
                                        {isInlineTransfer ? (
                                            <>⇄ Tipo: TRANSFERENCIA ENTRE CUENTAS (Débito y Crédito)</>
                                        ) : resolvedTipo === 'CARGO' ? (
                                            <>↓ Tipo: CARGO (-) / Salida de Fondos</>
                                        ) : (
                                            <>↑ Tipo: ABONO (+) / Entrada de Fondos</>
                                        )}
                                        {canToggleDirection && (
                                            <span style={{ display: 'inline-flex', gap: '0.25rem', marginLeft: '0.2rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, tipo: 'ABONO' }))}
                                                    style={{
                                                        height: '20px',
                                                        padding: '0 0.4rem',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        border: resolvedTipo === 'ABONO' ? '1px solid #10b981' : '1px solid var(--border)',
                                                        background: resolvedTipo === 'ABONO' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                                                        color: resolvedTipo === 'ABONO' ? '#10b981' : 'var(--text-muted)'
                                                    }}
                                                >
                                                    ABONO (+)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, tipo: 'CARGO' }))}
                                                    style={{
                                                        height: '20px',
                                                        padding: '0 0.4rem',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        border: resolvedTipo === 'CARGO' ? '1px solid #ef4444' : '1px solid var(--border)',
                                                        background: resolvedTipo === 'CARGO' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                                                        color: resolvedTipo === 'CARGO' ? '#ef4444' : 'var(--text-muted)'
                                                    }}
                                                >
                                                    CARGO (-)
                                                </button>
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Monto ($)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.05rem' }}>$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    style={{ width: '100%', height: '38px', paddingLeft: '2.1rem', fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--primary)' }}
                                    value={formData.monto}
                                    onChange={e => { markDirty('monto'); setFormData(prev => ({ ...prev, monto: e.target.value })); }}
                                    onFocus={(e) => e.target.select()}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Concepto */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Concepto / Descripción</label>
                        <input
                            type="text"
                            placeholder="Descripción del movimiento..."
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', textTransform: 'uppercase' }}
                            value={formData.concepto}
                            onChange={e => { markDirty('concepto'); setFormData(prev => ({ ...prev, concepto: e.target.value.toUpperCase() })); }}
                            required
                        />
                    </div>

                    {/* Existing Receipts when Editing */}
                    {editingMovement && (loadingExistingReceipts || existingReceipts.length > 0) && (
                        <div style={{ padding: '0.6rem', borderRadius: '6px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Comprobantes guardados ({existingReceipts.length})</span>
                                {existingReceipts.length > 0 && (
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => openReceiptLightbox(existingReceipts, 0, `Comprobantes - ${editingMovement.documento || editingMovement.llave}`, !editingMovement.fecha_aplicado)}
                                        style={{ height: '26px', padding: '0 0.55rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                    >
                                        <Eye size={12} /> Ver todos
                                    </button>
                                )}
                            </div>
                            {loadingExistingReceipts ? (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cargando comprobantes...</div>
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                                    {existingReceipts.map((c, idx) => (
                                        <button
                                            key={c.id || `legacy-${idx}`}
                                            type="button"
                                            onClick={() => openReceiptLightbox(existingReceipts, idx, `Comprobantes - ${editingMovement.documento || editingMovement.llave}`, !editingMovement.fecha_aplicado)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.35rem',
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'var(--text)',
                                                fontSize: '0.74rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Paperclip size={12} color="var(--primary)" />
                                            <span>{c.nombre_original || `Comprobante ${idx + 1}`}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* R5.3 Receipt Dropzone & OCR */}
                    {renderReceiptDropzoneSection('modal')}

                    <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: '1 1 120px', height: '38px' }} disabled={submitting}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={submitting || compressingFiles} style={{ flex: '2 1 180px', height: '38px', display: 'flex', gap: '0.45rem', justifyContent: 'center', alignItems: 'center' }}>
                            <Save size={16} />
                            {submitting ? 'Guardando...' : (editingMovement ? 'Actualizar Movimiento' : 'Guardar Movimiento')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* R5.1 Dedicated Inter-Company Transfer Modal */}
            <Modal
                open={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                size="lg"
                title={
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <ArrowLeftRight size={18} color="var(--primary)" />
                        Nueva Transferencia Entre Cuentas
                    </span>
                }
            >
                <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {transferError && (
                        <div style={{
                            padding: '0.55rem 0.75rem',
                            borderRadius: '6px',
                            background: 'rgba(245, 158, 11, 0.14)',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            color: '#fbbf24',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                        }}>
                            <Lock size={15} />
                            <span>{transferError}</span>
                        </div>
                    )}

                    {isInterCompanyTransfer && (
                        <div style={{
                            padding: '0.4rem 0.65rem',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.14)',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                            color: '#60a5fa',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem'
                        }}>
                            <ArrowLeftRight size={15} />
                            Transferencia Inter-Empresa: {transferDebAcc?.empresa_nombre} → {transferCredAcc?.empresa_nombre}
                        </div>
                    )}

                    <div className="form-grid form-grid-2" style={{ gap: '0.85rem' }}>
                        {/* Origin Leg */}
                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(239, 68, 68, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>
                                <ArrowDownCircle size={15} /> CUENTA A DEBITAR (Origen / Salida)
                            </label>
                            <select
                                style={{ width: '100%', height: '34px', fontSize: '0.78rem' }}
                                value={transferData.empresa_origen_filter}
                                onChange={e => setTransferData(prev => ({ ...prev, empresa_origen_filter: e.target.value }))}
                            >
                                <option value="">Filtrar origen por empresa (Todas)</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                            <select
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', border: '1px solid rgba(239, 68, 68, 0.4)' }}
                                value={transferData.cuenta_debitar_id}
                                onChange={e => handleTransferDebitChange(e.target.value)}
                                required
                            >
                                <option value="">Seleccione Cuenta Origen...</option>
                                {transferOriginAccounts.map(c => (
                                    <option key={c.corr} value={c.corr}>
                                        {formatCuentaLabel(c)}
                                    </option>
                                ))}
                            </select>
                            {transferDebAcc?.empresa_nombre && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    Empresa origen: <strong>{transferDebAcc.empresa_nombre}</strong>
                                </div>
                            )}
                            {renderCuentaResumenChip(transferDebResumen, loadingTransferDebResumen, { showConciliado: true })}
                        </div>

                        {/* Destination Leg */}
                        <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>
                                <ArrowUpCircle size={15} /> CUENTA A ACREDITAR (Destino / Entrada)
                            </label>
                            <select
                                style={{ width: '100%', height: '34px', fontSize: '0.78rem' }}
                                value={transferData.empresa_destino_filter}
                                onChange={e => setTransferData(prev => ({ ...prev, empresa_destino_filter: e.target.value }))}
                            >
                                <option value="">Filtrar destino por empresa (Todas)</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                            <select
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', border: '1px solid rgba(16, 185, 129, 0.4)' }}
                                value={transferData.cuenta_acreditar_id}
                                onChange={e => handleTransferCreditChange(e.target.value)}
                                required
                            >
                                <option value="">Seleccione Cuenta Destino...</option>
                                {transferDestAccounts.map(c => (
                                    <option key={c.corr} value={c.corr}>
                                        {formatCuentaLabel(c)}
                                    </option>
                                ))}
                            </select>
                            {transferCredAcc?.empresa_nombre && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    Empresa destino: <strong>{transferCredAcc.empresa_nombre}</strong>
                                </div>
                            )}
                            {renderCuentaResumenChip(transferCredResumen, loadingTransferCredResumen, { showConciliado: true })}
                        </div>
                    </div>

                    <div className="form-grid form-grid-3">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fecha Transferencia</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem', paddingLeft: '2.4rem' }}
                                    value={transferData.fecha}
                                    onChange={e => { markTransferDirty('fecha'); setTransferData(prev => ({ ...prev, fecha: e.target.value })); }}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fecha Aplicado</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem', paddingLeft: '2.4rem' }}
                                    value={transferData.fecha_aplicado}
                                    onChange={e => { markTransferDirty('fecha_aplicado'); setTransferData(prev => ({ ...prev, fecha_aplicado: e.target.value })); }}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Documento / Ref</label>
                            <div style={{ position: 'relative' }}>
                                <FileText size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Ej: TR-001"
                                    style={{ width: '100%', height: '36px', fontSize: '0.825rem', paddingLeft: '2.4rem', textTransform: 'uppercase' }}
                                    value={transferData.documento}
                                    onChange={e => { markTransferDirty('documento'); setTransferData(prev => ({ ...prev, documento: e.target.value.toUpperCase() })); }}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Monto ($)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.05rem' }}>$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    style={{ width: '100%', height: '38px', paddingLeft: '2.1rem', fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--primary)' }}
                                    value={transferData.monto}
                                    onChange={e => { markTransferDirty('monto'); setTransferData(prev => ({ ...prev, monto: e.target.value })); }}
                                    onFocus={(e) => e.target.select()}
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Concepto / Descripción</label>
                            <input
                                type="text"
                                placeholder="Concepto de la transferencia..."
                                style={{ width: '100%', height: '38px', fontSize: '0.825rem', textTransform: 'uppercase' }}
                                value={transferData.concepto}
                                onChange={e => { markTransferDirty('concepto'); setTransferData(prev => ({ ...prev, concepto: e.target.value.toUpperCase() })); }}
                            />
                        </div>
                    </div>

                    {renderReceiptDropzoneSection('transfer')}

                    <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setShowTransferModal(false)} className="btn-secondary" style={{ flex: '1 1 120px', height: '38px' }} disabled={submitting}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={submitting || compressingFiles} style={{ flex: '2 1 180px', height: '38px', display: 'flex', gap: '0.45rem', justifyContent: 'center', alignItems: 'center' }}>
                            <ArrowLeftRight size={16} />
                            {submitting ? 'Registrando...' : 'Registrar Transferencia'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* R5.3 Movement Receipts Gallery Modal */}
            <Modal
                open={Boolean(galleryMovement)}
                onClose={() => { setGalleryMovement(null); setEditingCompId(null); }}
                size="lg"
                title={
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Paperclip size={18} color="var(--primary)" />
                        Comprobantes · {galleryMovement?.documento || galleryMovement?.llave || ''}
                    </span>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {galleryMovement && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                            <span>Cuenta: <strong style={{ color: 'var(--text)' }}>{galleryMovement.numero_cuenta}</strong></span>
                            <span>Fecha: <strong style={{ color: 'var(--text)' }}>{galleryMovement.fecha}</strong></span>
                            <span>Monto: <strong style={{ color: 'var(--primary)' }}>{moneyFmt(galleryMovement.monto)}</strong></span>
                        </div>
                    )}

                    {/* Upload Bar inside Gallery */}
                    <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer?.files?.length) processReceiptFiles(e.dataTransfer.files, 'gallery');
                        }}
                        style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: 'var(--border-radius)',
                            border: '1px dashed var(--border)',
                            background: 'rgba(255,255,255,0.02)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.5rem'
                        }}
                    >
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Pega con <strong>Ctrl+V</strong>, arrastra archivos aquí o selecciona archivo / cámara.
                        </span>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={uploadingGallery || compressingFiles}
                                onClick={() => galleryFileInputRef.current?.click()}
                                style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Upload size={13} /> Adjuntar
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={uploadingGallery || compressingFiles}
                                onClick={() => galleryCameraInputRef.current?.click()}
                                style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Camera size={13} /> Cámara
                            </button>
                        </div>
                        <input
                            ref={galleryFileInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                if (e.target.files?.length) processReceiptFiles(e.target.files, 'gallery');
                                e.target.value = '';
                            }}
                        />
                        <input
                            ref={galleryCameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                if (e.target.files?.length) processReceiptFiles(e.target.files, 'gallery');
                                e.target.value = '';
                            }}
                        />
                    </div>

                    {loadingGallery ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Cargando comprobantes...
                        </div>
                    ) : galleryItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Este movimiento no tiene comprobantes adjuntos todavía.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                            {galleryItems.map((comp, idx) => {
                                const fileUrl = comp.signed_url || comp.archivo_url || '';
                                const isPdf = comp.mime_type === 'application/pdf' || /\.pdf$/i.test(comp.archivo_url || comp.nombre_original || '');
                                const isLegacy = !comp.id;
                                const isEditingNota = editingCompId && Number(editingCompId) === Number(comp.id);

                                return (
                                    <div key={comp.id || `legacy-${idx}`} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.65rem',
                                        flexWrap: 'wrap',
                                        padding: '0.55rem',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        background: 'rgba(255,255,255,0.02)'
                                    }}>
                                        <button
                                            type="button"
                                            onClick={() => openReceiptLightbox(galleryItems, idx, `Comprobantes · ${galleryMovement?.documento || galleryMovement?.llave || ''}`, !isLegacy)}
                                            style={{
                                                width: '52px',
                                                height: '52px',
                                                borderRadius: '6px',
                                                overflow: 'hidden',
                                                border: '1px solid var(--border)',
                                                background: 'rgba(0,0,0,0.2)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: 0,
                                                cursor: 'pointer'
                                            }}
                                            title="Abrir en Lightbox"
                                        >
                                            {isPdf ? (
                                                <FileText size={22} color="#f59e0b" />
                                            ) : (
                                                <img src={fileUrl} alt={comp.nombre_original} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            )}
                                        </button>

                                        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {comp.nombre_original || `Comprobante ${idx + 1}`}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                                                {comp.tamano_bytes ? <span>{formatBytes(comp.tamano_bytes)}</span> : null}
                                                {comp.uploaded_by_name ? <span>Por: {comp.uploaded_by_name}</span> : null}
                                                {isLegacy && (
                                                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>Legado (solo lectura)</span>
                                                )}
                                            </div>
                                            {isEditingNota ? (
                                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                                                    <input
                                                        type="text"
                                                        value={editingCompNota}
                                                        onChange={e => setEditingCompNota(e.target.value)}
                                                        placeholder="Nota del comprobante..."
                                                        style={{ flex: '1 1 140px', height: '28px', fontSize: '0.76rem', padding: '0 0.45rem' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn-primary"
                                                        disabled={savingCompNota}
                                                        onClick={() => handleSaveComprobanteNota(comp.id)}
                                                        style={{ height: '28px', padding: '0 0.55rem', fontSize: '0.74rem' }}
                                                    >
                                                        Guardar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        onClick={() => { setEditingCompId(null); setEditingCompNota(''); }}
                                                        style={{ height: '28px', padding: '0 0.55rem', fontSize: '0.74rem' }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            ) : comp.nota ? (
                                                <div style={{ fontSize: '0.74rem', color: 'var(--text)', marginTop: '0.2rem' }}>
                                                    Nota: {comp.nota}
                                                </div>
                                            ) : null}
                                        </div>

                                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => openReceiptLightbox(galleryItems, idx, `Comprobantes · ${galleryMovement?.documento || galleryMovement?.llave || ''}`, !isLegacy)}
                                                style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                            >
                                                <Eye size={13} /> Ver
                                            </button>
                                            {!isLegacy && !isEditingNota && (
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    onClick={() => { setEditingCompId(comp.id); setEditingCompNota(comp.nota || ''); }}
                                                    style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                                >
                                                    <Edit2 size={13} /> Nota
                                                </button>
                                            )}
                                            {!isLegacy && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteComprobante(comp)}
                                                    style={{ height: '30px', padding: '0 0.55rem', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                                                    title="Eliminar comprobante"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Lightbox Viewer */}
            <ReceiptViewerModal
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                comprobantes={viewerItems}
                initialIndex={viewerIdx}
                title={viewerTitle}
                onDelete={viewerAllowDelete ? handleDeleteComprobante : null}
            />

            <style dangerouslySetInnerHTML={{ __html: `
                .movimientos-bancarios-page .hover-row:hover { background: rgba(255,255,255,0.03); }
                .movimientos-bancarios-page textarea { width: 100%; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--border-radius); color: var(--text); resize: none; }
                .movimientos-bancarios-page textarea:focus { outline: none; border-color: var(--primary); }
                .movimientos-bancarios-page .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}} />
        </div>
    );
}
