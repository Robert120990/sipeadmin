import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Search, Plus, CheckCircle, Edit, Trash2, X, Save, Download,
    Printer, Sparkles, Send, ArrowUp, ArrowDown, ArrowUpDown,
    Filter, CreditCard, RotateCcw, CalendarClock, Paperclip, Bell, Bot,
    Upload, Camera, Eye, FileText, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';
import ControlPagosModal from '../components/ControlPagosModal';
import ReceiptViewerModal from '../components/ReceiptViewerModal';
import MibotProgramarModal from '../components/MibotProgramarModal';
import { parseDateOnly, todayStr } from '../utils/date';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { sanitizeSpreadsheetRows } from '../utils/exportSanitizer';
import { compressReceiptFile, formatBytes } from '../utils/receiptCompressor';

const BANK_KEYWORD_MAP = [
    { tokens: ['bac', 'america central'], bankMatch: 'AMERICA CENTRAL', shortCode: 'BAC' },
    { tokens: ['davi', 'davivienda'], bankMatch: 'DAVIVIENDA', shortCode: 'DAVI' },
    { tokens: ['prom', 'promerica'], bankMatch: 'PROMERICA', shortCode: 'PROM' },
    { tokens: ['agricola', 'ba'], bankMatch: 'AGRICOLA', shortCode: 'AGRICOLA' },
    { tokens: ['bh', 'hipotecario'], bankMatch: 'HIPOTECARIO', shortCode: 'BH' },
    { tokens: ['cusc', 'cuscatlan'], bankMatch: 'CUSCATLAN', shortCode: 'CUSCATLAN' },
    { tokens: ['azul'], bankMatch: 'BANCO AZUL', shortCode: 'AZUL' },
    { tokens: ['atl', 'atlantida'], bankMatch: 'ATLANTIDA', shortCode: 'ATLANTIDA' },
    { tokens: ['citi', 'citibank', 'city'], bankMatch: 'CITIBANK', shortCode: 'CITI' },
    { tokens: ['scotia', 'scotiabank'], bankMatch: 'SCOTIABANK', shortCode: 'SCOTIABANK' },
    { tokens: ['bfa', 'fomento'], bankMatch: 'BFA', shortCode: 'BFA' },
    { tokens: ['bancovi'], bankMatch: 'BANCOVI', shortCode: 'BANCOVI' },
    { tokens: ['abank'], bankMatch: 'ABANK', shortCode: 'ABANK' }
];

const ENTITY_KEYWORDS = [
    'andelsa', 'miraflores', 'chalchuapa', 'san martin', 'loma',
    'costa', 'cds', 'desvio', 'cdh', 'lil', 'cmr', 'super',
    'pedregal', 'cerro verde', '14 avenida', 'zurita', 'rabida',
    'raul', 'corina'
];

const DEFAULT_FALLBACK_PRESETS = [
    { id: 'fb-andelsa-bac', banco_nombre: 'AMERICA CENTRAL', nombre: 'ANDELSA - BAC CTA CTE', numero: '201002367', empresa_nombre: 'ANDELSA S.A. DE C.V.', ubicacion_tags: ['ANDELSA'], preset_value: '[BAC] ANDELSA - BAC CTA CTE - (201002367)' },
    { id: 'fb-andelsa-davi', banco_nombre: 'DAVIVIENDA', nombre: 'ANDELSA - DAVIVIENDA CTA CTE', numero: '002510128744', empresa_nombre: 'ANDELSA S.A. DE C.V.', ubicacion_tags: ['ANDELSA'], preset_value: '[DAVI] ANDELSA - DAVIVIENDA - (002510128744)' },
    { id: 'fb-andelsa-agr', banco_nombre: 'AGRICOLA', nombre: 'ANDELSA - BANCO AGRICOLA', numero: '005030484213', empresa_nombre: 'ANDELSA S.A. DE C.V.', ubicacion_tags: ['ANDELSA'], preset_value: '[AGRICOLA] ANDELSA - CTA CTE - (005030484213)' },
    { id: 'fb-andelsa-prom', banco_nombre: 'PROMERICA', nombre: 'ANDELSA - BANCO PROMERICA', numero: '50000017000214', empresa_nombre: 'ANDELSA S.A. DE C.V.', ubicacion_tags: ['ANDELSA'], preset_value: '[PROM] ANDELSA - PROMERICA - (50000017000214)' },
    { id: 'fb-andelsa-cusc', banco_nombre: 'CUSCATLAN', nombre: 'ANDELSA - BANCO CUSCATLAN', numero: '018-301-00005461-9', empresa_nombre: 'ANDELSA S.A. DE C.V.', ubicacion_tags: ['ANDELSA'], preset_value: '[CUSCATLAN] ANDELSA - (018-301-00005461-9)' },
    { id: 'fb-andelsa-bfa', banco_nombre: 'BFA', nombre: 'ANDELSA - BFA CTA CTE', numero: '100-090-700370-5', empresa_nombre: 'ANDELSA S.A. DE C.V.', ubicacion_tags: ['ANDELSA'], preset_value: '[BFA] ANDELSA - BFA CTA CTE - (100-090-700370-5)' }
];

function normalizeText(str) {
    return String(str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function buildPresetValueFromAccount(c) {
    if (!c) return '';
    if (c.preset_value && c.preset_value.length <= 50) return c.preset_value;
    const fullLabel = formatCuentaLabel(c);
    if (fullLabel.length <= 50) return fullLabel;

    const upperBank = String(c.banco_nombre || c.banco || 'BANCO').toUpperCase();
    const matchedBank = BANK_KEYWORD_MAP.find(b => upperBank.includes(b.bankMatch));
    const shortBank = matchedBank ? matchedBank.shortCode : upperBank.slice(0, 10);
    const numero = String(c.numero || c.numero_cuenta || '').trim();
    const nombre = String(c.nombre || c.cuenta_nombre || '').replace(/\s+/g, ' ').trim();
    if (!numero) return `[${shortBank}] ${nombre}`.slice(0, 50).trim();

    const prefix = `[${shortBank}] `;
    const suffix = ` - (${numero})`;
    const maxName = Math.max(6, 50 - prefix.length - suffix.length);
    return `${prefix}${nombre.slice(0, maxName).trim()}${suffix}`.slice(0, 50);
}

function getAccountsForUbicacion(cuentas, ubicacionNombre = '') {
    const normUbic = normalizeText(ubicacionNombre);
    if (!normUbic) return [];

    return cuentas.filter(c => {
        const tags = Array.isArray(c.ubicacion_tags) ? c.ubicacion_tags.map(normalizeText) : [];
        if (tags.some(t => t && (normUbic.includes(t) || t.includes(normUbic)))) return true;

        const blob = normalizeText(`${c.nombre || ''} ${c.empresa_nombre || ''} ${c.banco_nombre || ''}`);
        if (normUbic.includes('andelsa') && blob.includes('andelsa')) return true;
        if (normUbic.includes('miraflores') && blob.includes('miraflores')) return true;
        if (normUbic.includes('chalchuapa') && (blob.includes('chalchuapa') || blob.includes('chalchupa'))) return true;
        if (normUbic.includes('san martin') && (blob.includes('san martin') || blob.includes('lil') || blob.includes('loma'))) return true;
        if (normUbic.includes('desvio') && (blob.includes('desvio') || blob.includes('cdh'))) return true;
        if (normUbic.includes('costa') && (blob.includes('costa') || /\bcds\b/.test(blob))) return true;
        if ((normUbic.includes('super') || normUbic.includes('pedregal')) && (blob.includes('super') || blob.includes('pedregal') || blob.includes('cerro verde'))) return true;
        if (normUbic.includes('14 avenida') && (blob.includes('14 avenida') || blob.includes('zurita'))) return true;
        if ((normUbic.includes('oficina') || normUbic.includes('personal')) && (blob.includes('raul') || blob.includes('corina') || blob.includes('rabida') || blob.includes('cmr'))) return true;
        return false;
    });
}

function findSmartPresetMatches(rawInput, cuentas, contextUbicacion = '') {
    const norm = normalizeText(rawInput).replace(/\bde\b|\bdel\b|\bla\b|\bel\b|\bcuenta\b|\bcta\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!norm || norm.length < 2 || rawInput.startsWith('[')) return [];

    const words = norm.split(' ').filter(Boolean);
    const detectedBank = BANK_KEYWORD_MAP.find(b =>
        b.tokens.some(tk => norm === tk || words.includes(tk) || (tk.length >= 4 && norm.includes(tk)))
    );
    const detectedEntities = ENTITY_KEYWORDS.filter(ek => norm.includes(ek));
    const fallbackEntityNorm = normalizeText(contextUbicacion);

    const candidates = cuentas.filter(c => {
        const bankNorm = normalizeText(c.banco_nombre || c.banco || '');
        const blob = normalizeText(`${c.banco_nombre || ''} ${c.nombre || ''} ${c.empresa_nombre || ''} ${c.numero || ''}`);

        if (detectedBank && !bankNorm.includes(normalizeText(detectedBank.bankMatch))) {
            return false;
        }

        if (detectedEntities.length > 0) {
            return detectedEntities.every(ek => {
                if (ek === 'san martin') return blob.includes('san martin') || blob.includes('lil');
                if (ek === 'costa') return blob.includes('costa') || /\bcds\b/.test(blob);
                if (ek === 'desvio') return blob.includes('desvio') || blob.includes('cdh');
                return blob.includes(ek);
            });
        }

        if (detectedBank && fallbackEntityNorm) {
            const ubicMatches = getAccountsForUbicacion([c], contextUbicacion);
            if (ubicMatches.length > 0) return true;
        }

        return words.every(w => blob.includes(w));
    });

    return candidates.slice(0, 6);
}

const EMPTY_COL_FILTERS = {
    id_recordatorio: '',
    ubicacion: '',
    descripcion: '',
    vence: '',
    observacion: '',
    monto: '',
    forma_pago: '',
    estado: '',
    fecha_cancelacion: ''
};

export default function ControlRecordatorios() {
    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const [recordatorios, setRecordatorios] = useState([]);
    const [ubicaciones, setUbicaciones] = useState([]);
    const [cuentasBancarias, setCuentasBancarias] = useState(DEFAULT_FALLBACK_PRESETS);
    const [metodosBase, setMetodosBase] = useState(['TRANSFERENCIA', 'CHEQUE', 'EFECTIVO', 'TARJETA DE CREDITO']);

    const useDebounce = (value, delay) => {
        const [debouncedValue, setDebouncedValue] = useState(value);
        useEffect(() => {
            const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
            return () => clearTimeout(handler);
        }, [value, delay]);
        return debouncedValue;
    };

    const getFirstDayOfMonth = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    };
    const [fechaDesde, setFechaDesde] = useState(getFirstDayOfMonth());
    const [fechaHasta, setFechaHasta] = useState(todayStr());
    const [estadoFilter, setEstadoFilter] = useState('ALL'); // P, C, ALL

    // Dynamic search, column filters & column sorting (ADM-0012)
    const [quickSearch, setQuickSearch] = useState('');
    const [showColumnFilters, setShowColumnFilters] = useState(true);
    const [columnFilters, setColumnFilters] = useState(EMPTY_COL_FILTERS);
    const [sortConfig, setSortConfig] = useState({ key: 'vence', direction: 'asc' });
    const [parentSortConfig, setParentSortConfig] = useState({ key: 'id', direction: 'desc' });

    // Inline editing state directly inside the table ("en esa misma pantalla")
    const [inlineEditId, setInlineEditId] = useState(null);
    const [inlineFormaValue, setInlineFormaValue] = useState('');
    const [inlineSavingId, setInlineSavingId] = useState(null);
    const [inlineObsEditId, setInlineObsEditId] = useState(null);
    const [inlineObsValue, setInlineObsValue] = useState('');

    // UI State
    const [loading, setLoading] = useState(false);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [parentsList, setParentsList] = useState([]);

    // Nuevo Popup completo de Pagos / Abonos Parciales / Comprobantes
    const [pagosPopupRow, setPagosPopupRow] = useState(null);
    const [quickViewerOpen, setQuickViewerOpen] = useState(false);
    const [quickViewerItems, setQuickViewerItems] = useState([]);
    const [quickViewerIdx, setQuickViewerIdx] = useState(0);
    const [quickViewerTitle, setQuickViewerTitle] = useState('Comprobantes');

    // Popup MiBot Telegram (programar avisos de pago pendiente, tareas, validaciones o reuniones)
    const [mibotModalOpen, setMibotModalOpen] = useState(false);
    const [mibotTargetRow, setMibotTargetRow] = useState(null);

    // Report preview state
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [pdfSource, setPdfSource] = useState(null);
    const [previewPdfDoc, setPreviewPdfDoc] = useState(null);
    const [totalPages, setTotalPages] = useState(1);
    const [previewFileName, setPreviewFileName] = useState('');

    // Search Filters State (Matriz Modal)
    const [searchFilters, setSearchFilters] = useState({
        descripcion: '', fecha_inicio: '', ubicacion: '', monto: '', observacion: '', cuotas: '', activo: '', repetir_desc: ''
    });
    const debouncedFilters = useDebounce(searchFilters, 350);
    const [selectedParent, setSelectedParent] = useState(null);

    // Form State (Parent Recordatorio)
    const [formData, setFormData] = useState({
        id: '', descripcion: '', id_ubicacion: '', iniciar: todayStr(),
        activo: true, monto: 0.0, repetir: 1, repetir_desc: 'VEZ',
        forma_pago: '', pagado: false, fecPago: todayStr(), formaPago2: ''
    });
    const [openMibotAfterCreate, setOpenMibotAfterCreate] = useState(false);

    // Capturas y OCR IA al crear una "Nueva Operación de Pago" (R6.2)
    const [pendingFormReceipts, setPendingFormReceipts] = useState([]);
    const [formCompressing, setFormCompressing] = useState(false);
    const [formDragging, setFormDragging] = useState(false);
    const [formAutoOcr, setFormAutoOcr] = useState(true);
    const [formAnalyzingOcr, setFormAnalyzingOcr] = useState(false);
    const [formLastOcr, setFormLastOcr] = useState(null);
    const [formOcrMeta, setFormOcrMeta] = useState(null);
    const [formSaving, setFormSaving] = useState(false);
    const formDirtyRef = useRef(new Set());
    const formOcrAppliedRef = useRef(new Set());
    const formCompressingCountRef = useRef(0);
    const formDataRef = useRef(formData);
    formDataRef.current = formData;
    const pendingFormReceiptsRef = useRef([]);
    pendingFormReceiptsRef.current = pendingFormReceipts;
    const formFileInputRef = useRef(null);
    const formCameraInputRef = useRef(null);

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState([
        { role: 'ai', text: '¡Hola! Soy tu asistente IA de Pagos. Dime qué necesitas buscar o pagar y yo lo haré por ti.' }
    ]);
    const [chatLoading, setChatLoading] = useState(false);
    const [iaFilterText, setIaFilterText] = useState(null);

    useEffect(() => {
        fetchUbicaciones();
        fetchPaymentPresets();
    }, []);

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedParent, fechaDesde, fechaHasta, estadoFilter]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = { estado: estadoFilter };
            if (selectedParent) {
                params.id_recordatorio = selectedParent.id;
            } else {
                params.desde = fechaDesde;
                params.hasta = fechaHasta;
            }
            const res = await api.get('/operaciones/recordatorios', { params });
            setRecordatorios(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            addToast('Error al cargar datos de control de pago', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchUbicaciones = async () => {
        try {
            const res = await api.get('/operaciones/recordatorios/ubicaciones');
            setUbicaciones(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Error cargando ubicaciones', error);
        }
    };

    const fetchPaymentPresets = async () => {
        try {
            const res = await api.get('/operaciones/recordatorios/presets-pago');
            const remoteCuentas = Array.isArray(res.data?.cuentas) ? res.data.cuentas : [];
            const mergedMap = new Map();
            [...remoteCuentas, ...DEFAULT_FALLBACK_PRESETS].forEach(c => {
                const digits = String(c.numero || '').replace(/[^0-9]/g, '');
                const key = digits || c.id;
                if (!mergedMap.has(key)) {
                    mergedMap.set(key, {
                        ...c,
                        preset_value: buildPresetValueFromAccount(c)
                    });
                }
            });
            setCuentasBancarias(sortCuentas(Array.from(mergedMap.values())));
            if (Array.isArray(res.data?.metodos_base) && res.data.metodos_base.length > 0) {
                setMetodosBase(res.data.metodos_base);
            }
        } catch (error) {
            setCuentasBancarias(sortCuentas(DEFAULT_FALLBACK_PRESETS));
        }
    };

    const formatDate = (date) => {
        if (!date) return '';
        const d = parseDateOnly(date);
        if (!d) return String(date);
        return `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
    };

    const mc = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);

    const hasActiveTableFilters = useMemo(() => {
        return Boolean(
            quickSearch.trim() ||
            iaFilterText ||
            Object.values(columnFilters).some(v => String(v || '').trim() !== '')
        );
    }, [quickSearch, iaFilterText, columnFilters]);

    const clearAllTableFilters = () => {
        setQuickSearch('');
        setIaFilterText(null);
        setColumnFilters(EMPTY_COL_FILTERS);
    };

    const handleSort = (key) => {
        setSortConfig(prev => {
            if (prev.key !== key) return { key, direction: 'asc' };
            return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        });
    };

    const renderSortIcon = (key) => {
        if (sortConfig.key !== key) {
            return <ArrowUpDown size={12} style={{ opacity: 0.45, flexShrink: 0 }} />;
        }
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
            : <ArrowDown size={12} style={{ color: '#818cf8', flexShrink: 0 }} />;
    };

    const handleParentSort = (key) => {
        setParentSortConfig(prev => {
            if (prev.key !== key) return { key, direction: 'asc' };
            return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        });
    };

    const renderParentSortIcon = (key) => {
        if (parentSortConfig.key !== key) {
            return <ArrowUpDown size={11} style={{ opacity: 0.4, flexShrink: 0 }} />;
        }
        return parentSortConfig.direction === 'asc'
            ? <ArrowUp size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />
            : <ArrowDown size={11} style={{ color: 'var(--primary)', flexShrink: 0 }} />;
    };

    const uniqueUbicacionesInTable = useMemo(() => {
        const set = new Set();
        recordatorios.forEach(r => {
            if (r.ubicacion) set.add(r.ubicacion);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
    }, [recordatorios]);

    const displayRecordatorios = useMemo(() => {
        const qNorm = normalizeText(quickSearch);
        const iaNorm = normalizeText(iaFilterText || '');

        const filtered = recordatorios.filter(r => {
            const venceFmt = formatDate(r.vence);
            const fecPagoFmt = formatDate(r.fecha_cancelacion);
            const montoStr = Number(r.monto || 0).toFixed(2);

            if (iaNorm) {
                const iaBlob = normalizeText(`${r.id_recordatorio} ${r.ubicacion} ${r.descripcion} ${r.observacion} ${r.forma_pago} ${venceFmt} ${r.vence}`);
                if (!iaBlob.includes(iaNorm)) return false;
            }

            if (qNorm) {
                const rowBlob = normalizeText(
                    `${r.id_recordatorio} ${r.ubicacion} ${r.descripcion} ${venceFmt} ${r.vence} ${r.observacion} ${montoStr} ${r.forma_pago} ${r.estado} ${r.estado_pago || ''} ${r.tipo_operacion || ''} ${fecPagoFmt}`
                );
                const tokens = qNorm.split(/\s+/).filter(Boolean);
                if (!tokens.every(tk => rowBlob.includes(tk))) return false;
            }

            if (columnFilters.id_recordatorio && !String(r.id_recordatorio || '').includes(columnFilters.id_recordatorio.trim())) return false;
            if (columnFilters.ubicacion && normalizeText(r.ubicacion) !== normalizeText(columnFilters.ubicacion)) return false;
            if (columnFilters.descripcion && !normalizeText(r.descripcion).includes(normalizeText(columnFilters.descripcion))) return false;
            if (columnFilters.vence && !`${venceFmt} ${r.vence || ''}`.toLowerCase().includes(columnFilters.vence.trim().toLowerCase())) return false;
            if (columnFilters.observacion && !normalizeText(r.observacion).includes(normalizeText(columnFilters.observacion))) return false;
            if (columnFilters.monto && !`${montoStr} ${mc(r.monto)} ${Number(r.saldo_pendiente || 0).toFixed(2)}`.toLowerCase().includes(columnFilters.monto.trim().toLowerCase())) return false;
            if (columnFilters.forma_pago && !normalizeText(`${r.forma_pago || ''} ${r.tipo_operacion || ''}`).includes(normalizeText(columnFilters.forma_pago))) return false;
            if (columnFilters.estado) {
                const targetEst = normalizeText(columnFilters.estado);
                const rowEstPago = normalizeText(r.estado_pago || r.estado);
                const rowEstLegacy = normalizeText(r.estado);
                if (targetEst === 'parcial') {
                    if (rowEstPago !== 'parcial') return false;
                } else if (targetEst === 'pendiente') {
                    if (rowEstLegacy !== 'pendiente' && rowEstPago !== 'parcial') return false;
                } else if (rowEstLegacy !== targetEst && rowEstPago !== targetEst) {
                    return false;
                }
            }
            if (columnFilters.fecha_cancelacion && !`${fecPagoFmt} ${r.fecha_cancelacion || ''}`.toLowerCase().includes(columnFilters.fecha_cancelacion.trim().toLowerCase())) return false;

            return true;
        });

        const { key, direction } = sortConfig;
        if (!key) return filtered;
        const dir = direction === 'desc' ? -1 : 1;

        return [...filtered].sort((a, b) => {
            if (key === 'id_recordatorio' || key === 'monto') {
                return (Number(a[key] || 0) - Number(b[key] || 0)) * dir;
            }
            if (key === 'estado') {
                const ea = String(a.estado_pago || a.estado || '');
                const eb = String(b.estado_pago || b.estado || '');
                return ea.localeCompare(eb, 'es') * dir;
            }
            if (key === 'vence' || key === 'fecha_cancelacion') {
                const da = String(a[key] || '').slice(0, 10);
                const db = String(b[key] || '').slice(0, 10);
                return da.localeCompare(db) * dir;
            }
            const va = String(a[key] || '');
            const vb = String(b[key] || '');
            return va.localeCompare(vb, 'es', { numeric: true, sensitivity: 'base' }) * dir;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordatorios, quickSearch, iaFilterText, columnFilters, sortConfig]);

    const totalMonto = useMemo(() => {
        return displayRecordatorios.reduce((sum, item) => {
            if (item.saldo_pendiente !== undefined && item.saldo_pendiente !== null) {
                return sum + Number(item.saldo_pendiente || 0);
            }
            if (item.estado === 'PENDIENTE') return sum + Number(item.monto || 0);
            return sum;
        }, 0);
    }, [displayRecordatorios]);

    const totalPagadoVista = useMemo(() => {
        return displayRecordatorios.reduce((sum, item) => {
            if (item.monto_pagado !== undefined && item.monto_pagado !== null) {
                return sum + Number(item.monto_pagado || 0);
            }
            if (item.estado === 'CANCELADO') return sum + Number(item.monto || 0);
            return sum;
        }, 0);
    }, [displayRecordatorios]);

    const parcialesCount = useMemo(() => {
        return displayRecordatorios.filter(item => item.estado_pago === 'PARCIAL').length;
    }, [displayRecordatorios]);

    const totalCxcPendiente = useMemo(() => {
        return displayRecordatorios.reduce((sum, item) => {
            if (item.tipo_operacion !== 'CXC') return sum;
            const saldo = item.saldo_pendiente !== undefined && item.saldo_pendiente !== null
                ? Number(item.saldo_pendiente || 0)
                : (item.estado === 'PENDIENTE' ? Number(item.monto || 0) : 0);
            return sum + saldo;
        }, 0);
    }, [displayRecordatorios]);

    const openQuickReceiptsViewer = async (rec) => {
        try {
            const res = await api.get(`/operaciones/recordatorios/vencimiento/${rec.id}/detalle`);
            const comps = res.data?.comprobantes || [];
            if (comps.length === 0) {
                setPagosPopupRow(rec);
                return;
            }
            setQuickViewerIdx(0);
            setQuickViewerItems(comps);
            setQuickViewerTitle(`Comprobantes — ${rec.descripcion || ''}`);
            setQuickViewerOpen(true);
        } catch (err) {
            addToast('Error al cargar comprobantes del registro', 'error');
        }
    };

    // Contextual presets for Nuevo/Editar Recordatorio Modal
    const selectedFormUbicacionName = useMemo(() => {
        const found = ubicaciones.find(u => String(u.id) === String(formData.id_ubicacion));
        return found ? found.descripcion : '';
    }, [ubicaciones, formData.id_ubicacion]);

    const formUbicacionAccounts = useMemo(() => {
        return getAccountsForUbicacion(cuentasBancarias, selectedFormUbicacionName);
    }, [cuentasBancarias, selectedFormUbicacionName]);

    const smartTypedMatchesFormObs = useMemo(() => {
        return findSmartPresetMatches(formData.forma_pago, cuentasBancarias, selectedFormUbicacionName);
    }, [formData.forma_pago, cuentasBancarias, selectedFormUbicacionName]);

    const smartTypedMatchesFormPago2 = useMemo(() => {
        return findSmartPresetMatches(formData.formaPago2, cuentasBancarias, selectedFormUbicacionName);
    }, [formData.formaPago2, cuentasBancarias, selectedFormUbicacionName]);

    const resetFormModalReceipts = useCallback(() => {
        formCompressingCountRef.current = 0;
        setPendingFormReceipts([]);
        setFormCompressing(false);
        setFormDragging(false);
        setFormAnalyzingOcr(false);
        setFormLastOcr(null);
        setFormOcrMeta(null);
        formDirtyRef.current.clear();
        formOcrAppliedRef.current.clear();
    }, []);

    useEffect(() => {
        if (!isFormModalOpen) {
            resetFormModalReceipts();
        }
    }, [isFormModalOpen, resetFormModalReceipts]);

    const markFormDirty = useCallback((...fields) => {
        fields.forEach(f => formDirtyRef.current.add(f));
    }, []);

    const applyFormOcrAnalysis = useCallback((an, { force = false } = {}) => {
        if (!an) return { filledFields: [], skippedFields: [] };
        const cur = formDataRef.current || {};
        const filledFields = [];
        const skippedFields = [];
        const patch = {};

        const canFill = (field, isEmpty, allowDefaultOverwrite = false) => {
            if (force) return true;
            if (formDirtyRef.current.has(field)) return false;
            if (formOcrAppliedRef.current.has(field)) return false;
            if (isEmpty) return true;
            return allowDefaultOverwrite;
        };

        const markOcrOwned = (field) => {
            formOcrAppliedRef.current.add(field);
            if (force) formDirtyRef.current.delete(field);
        };

        const candidateDesc = String(an.beneficiario || an.concepto || '').trim().slice(0, 30);
        if (candidateDesc) {
            if (canFill('descripcion', !String(cur.descripcion || '').trim(), false)) {
                patch.descripcion = candidateDesc;
                markOcrOwned('descripcion');
                filledFields.push('descripción');
            } else {
                skippedFields.push('descripción');
            }
        }

        if (an.monto && Number(an.monto) > 0) {
            if (canFill('monto', !Number(cur.monto) || Number(cur.monto) <= 0, true)) {
                patch.monto = Number(an.monto).toFixed(2);
                markOcrOwned('monto');
                filledFields.push('monto');
            } else {
                skippedFields.push('monto');
            }
        }

        if (an.fecha_pago) {
            if (canFill('iniciar', !cur.iniciar, true)) {
                patch.iniciar = an.fecha_pago;
                markOcrOwned('iniciar');
                filledFields.push('fecha inicio');
            } else {
                skippedFields.push('fecha inicio');
            }
        }

        const matchedCuenta = an.cuenta_bancaria_id
            ? cuentasBancarias.find(c => Number(c.raw_id || c.id) === Number(an.cuenta_bancaria_id))
            : null;
        const presetVal = matchedCuenta ? buildPresetValueFromAccount(matchedCuenta) : '';
        const candidateForma = (presetVal || an.tarjeta_ref || an.referencia_doc || an.metodo_pago || '').trim().slice(0, 50);

        if (candidateForma) {
            if (canFill('forma_pago', !String(cur.forma_pago || '').trim(), false)) {
                patch.forma_pago = candidateForma;
                markOcrOwned('forma_pago');
                filledFields.push('observación/cuenta');
            } else {
                skippedFields.push('observación/cuenta');
            }
        }

        if (cur.pagado && cur.repetir_desc === 'VEZ') {
            if (an.fecha_pago) {
                if (canFill('fecPago', !cur.fecPago, true)) {
                    patch.fecPago = an.fecha_pago;
                    markOcrOwned('fecPago');
                    filledFields.push('fecha pago');
                } else {
                    skippedFields.push('fecha pago');
                }
            }
            if (candidateForma) {
                if (canFill('formaPago2', !String(cur.formaPago2 || '').trim(), false)) {
                    patch.formaPago2 = candidateForma;
                    markOcrOwned('formaPago2');
                    filledFields.push('forma de pago');
                } else {
                    skippedFields.push('forma de pago');
                }
            }
        }

        const resolvedCuentaLabel = an.cuenta_label || (matchedCuenta ? formatCuentaLabel(matchedCuenta) : null);
        const resolvedNotas = an.notas_sugeridas || an.concepto || null;
        const filledDesc = Boolean(patch.descripcion);
        const filledForma = Boolean(patch.forma_pago || patch.formaPago2);
        const filledAny = filledFields.length > 0;

        setFormOcrMeta(prev => {
            const curMeta = prev || {};
            const pickMeta = (key, nextVal, fieldWasFilled) => {
                if (force) return nextVal;
                const hasPrior = curMeta[key] !== null && curMeta[key] !== undefined && String(curMeta[key]).trim() !== '';
                if (fieldWasFilled || !hasPrior) return nextVal;
                return curMeta[key];
            };
            return {
                tipo_operacion: curMeta.tipo_operacion && !force ? curMeta.tipo_operacion : 'CXP',
                metodo_pago: pickMeta('metodo_pago', an.metodo_pago || null, filledForma),
                cuenta_bancaria_id: pickMeta('cuenta_bancaria_id', an.cuenta_bancaria_id || null, filledForma),
                cuenta_label: pickMeta('cuenta_label', resolvedCuentaLabel, filledForma),
                tarjeta_ref: pickMeta('tarjeta_ref', an.tarjeta_ref || null, filledForma),
                beneficiario: pickMeta('beneficiario', an.beneficiario || null, filledDesc),
                referencia_doc: pickMeta('referencia_doc', an.referencia_doc || null, filledForma || filledDesc),
                notas: pickMeta('notas', resolvedNotas, filledDesc || filledAny)
            };
        });

        if (Object.keys(patch).length > 0) {
            setFormData(prev => ({ ...prev, ...patch }));
        }
        return { filledFields, skippedFields };
    }, [cuentasBancarias]);

    const runFormReceiptOcr = useCallback(async ({ dataUrl, nombreOriginal = '' }) => {
        if (!dataUrl) return;
        setFormAnalyzingOcr(true);
        try {
            const cur = formDataRef.current || {};
            const res = await api.post('/operaciones/recordatorios/analizar-comprobante', {
                data_url: dataUrl,
                nombre_original: nombreOriginal,
                contexto: {
                    descripcion: cur.descripcion || '',
                    ubicacion: selectedFormUbicacionName || '',
                    monto_total: Number(cur.monto || 0)
                }
            });
            const an = res.data?.analisis;
            if (an) {
                setFormLastOcr(an);
                const { filledFields, skippedFields } = applyFormOcrAnalysis(an);
                if (filledFields.length > 0) {
                    addToast(`IA completó: ${filledFields.join(', ')}`, 'success');
                } else if (skippedFields.length > 0) {
                    addToast('Comprobante leído; se conservaron tus valores actuales. Usa "Re-aplicar datos IA" si deseas reemplazarlos.', 'info');
                } else {
                    addToast('Comprobante leído correctamente', 'success');
                }
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'No se pudo analizar el comprobante con IA', 'warning');
        } finally {
            setFormAnalyzingOcr(false);
        }
    }, [addToast, applyFormOcrAnalysis, selectedFormUbicacionName]);

    const deduplicateFormReceiptBatch = (existingList, batch) => {
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

    const handleFormProcessFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (files.length === 0) return;

        formCompressingCountRef.current += 1;
        setFormCompressing(true);
        const rawBatch = [];
        try {
            for (const file of files.slice(0, 8)) {
                try {
                    const comp = await compressReceiptFile(file);
                    rawBatch.push({
                        ...comp,
                        tempId: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        nota: ''
                    });
                } catch (fileErr) {
                    addToast(fileErr.message || `Error comprimiendo ${file.name}`, 'warning');
                }
            }

            if (rawBatch.length === 0) return;
            setPendingFormReceipts(prev => [...prev, ...deduplicateFormReceiptBatch(prev, rawBatch)]);
            const savedBytes = rawBatch.reduce((acc, c) => acc + Math.max(0, (c.original_size || 0) - (c.compressed_size || 0)), 0);
            addToast(
                `${rawBatch.length} comprobante(s) adjuntado(s)${savedBytes > 20000 ? ` (ahorro ${formatBytes(savedBytes)})` : ''}`,
                'success'
            );
            if (formAutoOcr && rawBatch[0]?.data_url) {
                runFormReceiptOcr({
                    dataUrl: rawBatch[0].data_url,
                    nombreOriginal: rawBatch[0].nombre_original
                });
            }
        } finally {
            formCompressingCountRef.current = Math.max(0, formCompressingCountRef.current - 1);
            setFormCompressing(formCompressingCountRef.current > 0);
        }
    }, [addToast, formAutoOcr, runFormReceiptOcr]);

    // Ctrl+V exclusivamente cuando el modal de creación está abierto y sin otros modales encima
    useEffect(() => {
        if (!isFormModalOpen || formData.id || pagosPopupRow || mibotModalOpen || quickViewerOpen || previewModalOpen || isSearchModalOpen) {
            return undefined;
        }
        const onPaste = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const pastedFiles = [];
            for (const item of items) {
                if (item.kind === 'file') {
                    const f = item.getAsFile();
                    if (f) pastedFiles.push(f);
                }
            }
            if (pastedFiles.length > 0) {
                e.preventDefault();
                handleFormProcessFiles(pastedFiles);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [isFormModalOpen, formData.id, pagosPopupRow, mibotModalOpen, quickViewerOpen, previewModalOpen, isSearchModalOpen, handleFormProcessFiles]);

    const resolveFinalFormaPago = (rawValue, ubicacionCtx) => {
        const trimmed = String(rawValue || '').trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('[')) return trimmed.slice(0, 50);

        // If the user typed shorthand like "bac de andelsa" or "bac andelsa", resolve to the exact preset account automatically
        const norm = normalizeText(trimmed);
        const hasBankToken = BANK_KEYWORD_MAP.some(b => b.tokens.some(tk => norm.split(/\s+/).includes(tk) || (tk.length >= 4 && norm.includes(tk))));
        const hasEntityToken = ENTITY_KEYWORDS.some(ek => norm.includes(ek));
        if (hasBankToken && hasEntityToken) {
            const matches = findSmartPresetMatches(trimmed, cuentasBancarias, ubicacionCtx);
            if (matches.length === 1) {
                return buildPresetValueFromAccount(matches[0]);
            }
        }
        return trimmed.slice(0, 50);
    };

    // AI Handle Submit
    const handleChatSubmit = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        const userPrompt = chatInput.trim();
        setChatInput('');
        setChatHistory(prev => [...prev, { role: 'user', text: userPrompt }]);
        setChatLoading(true);

        try {
            const res = await api.post('/ai/pagos/chat', {
                prompt: userPrompt,
                context: displayRecordatorios
            });

            const iaResponse = res.data;
            if (iaResponse.error) throw new Error(iaResponse.error);

            setChatHistory(prev => [...prev, { role: 'ai', text: iaResponse.reply }]);

            if (iaResponse.action === 'FILTER') {
                const p = iaResponse.action_params || {};
                if (p.estado && ['P', 'C', 'ALL'].includes(p.estado) && p.estado !== estadoFilter) {
                    setEstadoFilter(p.estado);
                }
                const term = p.ubicacion || p.descripcion || '';
                setIaFilterText(term || null);
                if (term || p.estado !== 'ALL') addToast('Orden de IA aplicada: Filtrando vista.', 'success');
            } else if (iaResponse.action === 'PAY') {
                const id = iaResponse.action_params?.id_recordatorio;
                const hasValidId = id !== null && id !== undefined && String(id).trim() !== '';
                const matches = hasValidId
                    ? displayRecordatorios.filter(r => r.id_recordatorio !== null && r.id_recordatorio !== undefined && String(r.id_recordatorio) === String(id).trim())
                    : [];
                const rec = matches.find(r => r.estado !== 'CANCELADO') || matches[0];
                if (rec && rec.id) {
                    setPagosPopupRow(rec);
                } else {
                    setChatHistory(prev => [...prev, { role: 'ai', text: 'No logré localizar ese ID en la tabla mostrada.' }]);
                }
            }
        } catch (err) {
            setChatHistory(prev => [...prev, { role: 'ai', text: 'Ups, ' + (err.response?.data?.error || err.message || 'ocurrió un error de conexión.') }]);
        } finally {
            setChatLoading(false);
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setFormSaving(true);
        try {
            const resolvedFormaPago = resolveFinalFormaPago(formData.forma_pago, selectedFormUbicacionName);
            const resolvedFormaPago2 = resolveFinalFormaPago(formData.formaPago2, selectedFormUbicacionName);
            const isPaidOneTime = !formData.id && formData.repetir_desc === 'VEZ' && Boolean(formData.pagado);

            let pagoDetallePayload = formOcrMeta ? { ...formOcrMeta } : {};
            if (isPaidOneTime || resolvedFormaPago2) {
                const formaPago2Manual = formDirtyRef.current.has('formaPago2');
                const refText = isPaidOneTime
                    ? (formaPago2Manual ? resolvedFormaPago2 : (resolvedFormaPago2 || resolvedFormaPago))
                    : (resolvedFormaPago2 || resolvedFormaPago);
                const matchedAcc = refText
                    ? cuentasBancarias.find(c => buildPresetValueFromAccount(c) === refText || formatCuentaLabel(c) === refText)
                    : null;
                if (matchedAcc) {
                    const numericId = Number(matchedAcc.raw_id || matchedAcc.id);
                    if (Number.isInteger(numericId) && numericId > 0) {
                        pagoDetallePayload.cuenta_bancaria_id = numericId;
                    }
                    pagoDetallePayload.cuenta_label = buildPresetValueFromAccount(matchedAcc);
                    if (!pagoDetallePayload.metodo_pago) pagoDetallePayload.metodo_pago = 'TRANSFERENCIA';
                } else if (isPaidOneTime && formaPago2Manual) {
                    pagoDetallePayload.cuenta_bancaria_id = null;
                    pagoDetallePayload.cuenta_label = resolvedFormaPago2 || null;
                } else if (refText && !pagoDetallePayload.cuenta_label && !pagoDetallePayload.tarjeta_ref) {
                    pagoDetallePayload.cuenta_label = refText;
                }
            }
            const hasPagoDetalle = Object.values(pagoDetallePayload).some(
                v => v !== null && v !== undefined && String(v).trim() !== ''
            );

            const payload = {
                ...formData,
                forma_pago: resolvedFormaPago,
                formaPago2: resolvedFormaPago2,
                ...(!formData.id ? {
                    comprobantes: pendingFormReceipts.map(c => ({
                        data_url: c.data_url,
                        nombre_original: c.nombre_original,
                        ancho: c.ancho,
                        alto: c.alto,
                        nota: c.nota || null
                    })),
                    pago_detalle: hasPagoDetalle ? pagoDetallePayload : null
                } : {})
            };

            const res = await api.post('/operaciones/recordatorios', payload);
            const savedCount = Array.isArray(res.data?.comprobantes) ? res.data.comprobantes.length : 0;
            addToast(
                savedCount > 0
                    ? `Recordatorio guardado con ${savedCount} comprobante(s)`
                    : 'Recordatorio guardado correctamente',
                'success'
            );
            const shouldOpenMibot = !formData.id && openMibotAfterCreate;
            const createdVenId = res.data?.first_vencimiento_id || null;
            const createdRecId = res.data?.recordatorio_id || null;
            setIsFormModalOpen(false);
            setOpenMibotAfterCreate(false);
            resetFormModalReceipts();
            fetchData();

            if (shouldOpenMibot && createdVenId) {
                setMibotTargetRow({
                    id: createdVenId,
                    id_recordatorio: createdRecId,
                    descripcion: formData.descripcion,
                    ubicacion: selectedFormUbicacionName || 'General',
                    vence: formData.iniciar,
                    monto: Number(formData.monto || 0),
                    monto_total: Number(formData.monto || 0),
                    saldo_pendiente: formData.pagado ? 0 : Number(formData.monto || 0),
                    estado: formData.pagado ? 'CANCELADO' : 'PENDIENTE',
                    estado_pago: formData.pagado ? 'CANCELADO' : 'PENDIENTE'
                });
                setMibotModalOpen(true);
            }
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al guardar recordatorio', 'error');
        } finally {
            setFormSaving(false);
        }
    };

    const loadForEdit = async (vencimientoRec) => {
        if (vencimientoRec.estado === 'CANCELADO') {
            setPagosPopupRow(vencimientoRec);
            return;
        }
        try {
            const res = await api.get(`/operaciones/recordatorios/${vencimientoRec.id_recordatorio}`);
            if (res.data.pagados > 0) {
                if (!await confirm('Este Recordatorio ya posee pagos.\nSi edita la matriz general se regenerarán sus cuotas. ¿Desea continuar? (Para editar solo la Forma de Pago haga clic directamente en la columna Forma Pago).', { variant: 'warning', title: 'Advertencia' })) return;
            }

            const p = res.data.recordatorio;
            resetFormModalReceipts();
            setFormData({
                id: p.id,
                descripcion: p.descripcion,
                id_ubicacion: p.id_ubicacion,
                iniciar: String(p.iniciar).substring(0, 10),
                activo: Boolean(p.activo),
                monto: p.monto,
                repetir: p.repetir,
                repetir_desc: p.repetir_desc,
                forma_pago: p.forma_pago || '',
                pagado: false,
                fecPago: todayStr(),
                formaPago2: ''
            });
            setIsFormModalOpen(true);
        } catch (error) {
            addToast('Error al cargar detalle', 'error');
        }
    };

    const handleSelectParent = (parent) => {
        setSelectedParent({ id: parent.id, descripcion: parent.descripcion });
        setIsSearchModalOpen(false);
    };

    const clearParentFilter = () => {
        setSelectedParent(null);
    };

    const openSearchModal = async () => {
        setLoading(true);
        try {
            const res = await api.get('/operaciones/recordatorios/parents/buscar');
            setParentsList(Array.isArray(res.data) ? res.data : []);
            setIsSearchModalOpen(true);
        } catch (error) {
            addToast('Error cargando búsquedas', 'error');
        } finally {
            setLoading(false);
        }
    };

    const filteredParents = useMemo(() => {
        if (!parentsList.length) return [];
        const result = parentsList.filter(p => {
            const descMatch = (p.descripcion || '').toLowerCase().includes(debouncedFilters.descripcion.toLowerCase());
            const dateMatch = (formatDate(p.fecha_inicio) || '').includes(debouncedFilters.fecha_inicio);
            const ubicMatch = (p.ubicacion || '').toLowerCase().includes(debouncedFilters.ubicacion.toLowerCase());
            const montoMatch = String(p.monto || '').includes(debouncedFilters.monto);
            const obsMatch = (p.observacion || '').toLowerCase().includes(debouncedFilters.observacion.toLowerCase());
            const cuotasMatch = String(p.cuotas || '').includes(debouncedFilters.cuotas);
            const repDescMatch = (p.repetir_desc || '').toLowerCase().includes(debouncedFilters.repetir_desc.toLowerCase());
            const activoMatch = (p.activo || '').toLowerCase().includes(debouncedFilters.activo.toLowerCase());

            return descMatch && dateMatch && ubicMatch && montoMatch && obsMatch && cuotasMatch && repDescMatch && activoMatch;
        });

        const { key, direction } = parentSortConfig;
        const dir = direction === 'desc' ? -1 : 1;
        const sorted = [...result].sort((a, b) => {
            if (key === 'id' || key === 'monto' || key === 'cuotas') {
                return (Number(a[key] || 0) - Number(b[key] || 0)) * dir;
            }
            if (key === 'fecha_inicio') {
                const da = String(a.fecha_inicio || '').slice(0, 10);
                const db = String(b.fecha_inicio || '').slice(0, 10);
                return da.localeCompare(db) * dir;
            }
            return String(a[key] || '').localeCompare(String(b[key] || ''), 'es', { numeric: true, sensitivity: 'base' }) * dir;
        });
        return sorted.slice(0, 100);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parentsList, debouncedFilters, parentSortConfig]);

    const startInlineEdit = (rec) => {
        const defaultSuggested = getAccountsForUbicacion(cuentasBancarias, rec.ubicacion);
        const existingForma = String(rec.forma_pago || '').trim();
        const fallbackObs = String(rec.observacion || '').trim();
        const prefilled = existingForma
            || (findSmartPresetMatches(fallbackObs, cuentasBancarias, rec.ubicacion)[0]
                ? buildPresetValueFromAccount(findSmartPresetMatches(fallbackObs, cuentasBancarias, rec.ubicacion)[0])
                : (defaultSuggested.length === 1 ? buildPresetValueFromAccount(defaultSuggested[0]) : ''));
        setInlineEditId(rec.id);
        setInlineFormaValue(prefilled);
    };

    const saveInlineFormaPago = async (rec, customVal = undefined) => {
        if (!rec || !rec.id) return;
        const rawToSave = customVal !== undefined ? customVal : inlineFormaValue;
        const finalForma = resolveFinalFormaPago(rawToSave, rec.ubicacion);
        setInlineSavingId(rec.id);
        try {
            await api.patch(`/operaciones/recordatorios/vencimiento/${rec.id}`, {
                forma_pago: finalForma
            });
            setRecordatorios(prev => prev.map(item =>
                item.id === rec.id ? { ...item, forma_pago: finalForma } : item
            ));
            setInlineEditId(null);
            addToast('Método de pago actualizado en tabla', 'success');
        } catch (error) {
            addToast('Error al actualizar método de pago', 'error');
        } finally {
            setInlineSavingId(null);
        }
    };

    const saveInlineObservacion = async (rec, customVal = undefined) => {
        if (!rec || !rec.id) return;
        const rawToSave = customVal !== undefined ? customVal : inlineObsValue;
        const finalObs = resolveFinalFormaPago(rawToSave, rec.ubicacion);
        setInlineSavingId(`obs-${rec.id}`);
        try {
            await api.patch(`/operaciones/recordatorios/vencimiento/${rec.id}`, {
                observacion: finalObs,
                id_recordatorio: rec.id_recordatorio
            });
            setRecordatorios(prev => prev.map(item =>
                item.id_recordatorio === rec.id_recordatorio ? { ...item, observacion: finalObs } : item
            ));
            setInlineObsEditId(null);
            addToast('Observación / método sugerido actualizado', 'success');
        } catch (error) {
            addToast('Error al actualizar observación', 'error');
        } finally {
            setInlineSavingId(null);
        }
    };

    const handleDelete = async (rec) => {
        if (rec.estado === 'CANCELADO') {
            addToast('Recordatorio Finalizado. No Puede Eliminar.', 'error');
            return;
        }
        if (!await confirm('¿Estás seguro de eliminar este vencimiento de pago?', { variant: 'danger' })) return;
        try {
            await api.delete(`/operaciones/recordatorios/vencimiento/${rec.id}`);
            addToast('Vencimiento eliminado', 'success');
            fetchData();
        } catch (error) {
            addToast('Error eliminando registro', 'error');
        }
    };

    const exportToExcel = () => {
        if (displayRecordatorios.length === 0) {
            addToast('No hay datos en pantalla para exportar', 'warning');
            return;
        }
        const wsData = displayRecordatorios.map(r => ({
            'ID Principal': r.id_recordatorio,
            'Tipo': r.tipo_operacion || 'CXP',
            'Ubicación': r.ubicacion,
            'Descripción': r.descripcion,
            'Vence': formatDate(r.vence),
            'Observación': r.observacion,
            'Monto Total': Number(r.monto || 0),
            'Abonado': Number(r.monto_pagado ?? (r.estado === 'CANCELADO' ? r.monto : 0)),
            'Saldo Pendiente': Number(r.saldo_pendiente ?? (r.estado === 'PENDIENTE' ? r.monto : 0)),
            'Forma Pago': r.forma_pago,
            'Estado': r.estado_pago === 'PARCIAL' ? `PENDIENTE (PARCIAL ${Math.round(Number(r.porcentaje_pagado || 0))}%)` : r.estado,
            'Comprobantes': Number(r.comprobantes_count || 0),
            'Fec Pago': formatDate(r.fecha_cancelacion)
        }));
        const ws = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(wsData));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Recordatorios');
        XLSX.writeFile(wb, `Control_de_Pagos_${todayStr()}.xlsx`);
        addToast('Excel exportado', 'success');
    };

    const handlePreviewPDF = () => {
        if (displayRecordatorios.length === 0) {
            addToast('No hay datos para exportar', 'warning');
            return;
        }

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('CONTROL DE PAGOS Y RECORDATORIOS', 14, 15);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        const estadoLabel = estadoFilter === 'P' ? 'Pendientes' : estadoFilter === 'PARCIAL' ? 'Parciales' : estadoFilter === 'C' ? 'Finalizados' : 'Todos';
        const sub = selectedParent
            ? `Filtrado por: ${selectedParent.descripcion} (ID: ${selectedParent.id})  |  Registros: ${displayRecordatorios.length}  |  Saldo Pendiente: ${mc(totalMonto)}  |  Generado: ${new Date().toLocaleDateString('es-SV')}`
            : `Período: ${fechaDesde} al ${fechaHasta}  |  Estado: ${estadoLabel}  |  Registros: ${displayRecordatorios.length}  |  Saldo Pendiente: ${mc(totalMonto)}  |  Generado: ${new Date().toLocaleDateString('es-SV')}`;
        doc.text(sub, 14, 21);

        const tableColumn = ['Tipo', 'Ubicación', 'Descripción', 'Vence', 'Monto', 'Abonado', 'Saldo', 'Forma de Pago', 'Estado', 'Comp.'];
        const tableRows = displayRecordatorios.map(r => [
            r.tipo_operacion || 'CXP',
            r.ubicacion || '-',
            r.descripcion || '-',
            formatDate(r.vence),
            mc(r.monto),
            mc(r.monto_pagado ?? (r.estado === 'CANCELADO' ? r.monto : 0)),
            mc(r.saldo_pendiente ?? (r.estado === 'PENDIENTE' ? r.monto : 0)),
            r.forma_pago || '-',
            r.estado_pago === 'PARCIAL' ? `PARCIAL ${Math.round(Number(r.porcentaje_pagado || 0))}%` : (r.estado || '-'),
            String(r.comprobantes_count || 0)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 7.5, cellPadding: 1.8 },
            columnStyles: {
                0: { halign: 'center', cellWidth: 13 },
                1: { cellWidth: 32 },
                2: { cellWidth: 46 },
                3: { halign: 'center', cellWidth: 20 },
                4: { halign: 'right', cellWidth: 22 },
                5: { halign: 'right', cellWidth: 22 },
                6: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
                7: { cellWidth: 38 },
                8: { halign: 'center', cellWidth: 24 },
                9: { halign: 'center', cellWidth: 12 }
            },
            headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], halign: 'center' },
            margin: { left: 14, right: 14, bottom: 15 }
        });

        const pagesCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pagesCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${i} de ${pagesCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
            doc.text('SIPEOFI - Sistema de Información de Estaciones', 14, pageHeight - 8);
        }

        const blob = doc.output('blob');
        setPdfSource(blob);
        setPreviewPdfDoc(doc);
        setTotalPages(pagesCount);
        setPreviewFileName(`Control_de_Pagos_${todayStr()}.pdf`);
        setPreviewModalOpen(true);
    };

    const compactFilterInputStyle = {
        height: '28px',
        padding: '0.15rem 0.4rem',
        fontSize: '0.73rem',
        borderRadius: '6px',
        width: '100%'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.22rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                        <CalendarClock size={21} /> Control de Pagos y Recordatorios
                    </h1>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Gestión de vencimientos, buscador dinámico, filtros por columna y presets bancarios automáticos
                    </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                        type="button"
                        className="btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 0.9rem', fontSize: '0.8rem' }}
                        onClick={() => setShowColumnFilters(v => !v)}
                        title="Mostrar u ocultar filtros por título de columna"
                    >
                        <Filter size={15} /> {showColumnFilters ? 'Ocultar Filtros' : 'Filtrar Columnas'}
                    </button>
                    <button
                        type="button"
                        className="btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 0.9rem', fontSize: '0.8rem' }}
                        onClick={openSearchModal}
                    >
                        <Search size={15} /> Matrices
                    </button>
                    <button
                        type="button"
                        className="btn-secondary"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            height: '36px',
                            padding: '0 0.9rem',
                            fontSize: '0.8rem',
                            borderColor: 'rgba(0, 136, 204, 0.45)',
                            color: '#38bdf8'
                        }}
                        onClick={() => {
                            setMibotTargetRow(null);
                            setMibotModalOpen(true);
                        }}
                        title="Programar recordatorio de pago, tarea, validación o reunión por Telegram (MiBot)"
                    >
                        <Bot size={15} /> MiBot Telegram
                    </button>
                    <button
                        type="button"
                        className="btn-success"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 1rem', fontSize: '0.8rem' }}
                        onClick={() => {
                            resetFormModalReceipts();
                            setFormData({ id: '', descripcion: '', id_ubicacion: '', iniciar: todayStr(), activo: true, monto: 0.0, repetir: 1, repetir_desc: 'VEZ', forma_pago: '', pagado: false, fecPago: todayStr(), formaPago2: '' });
                            setOpenMibotAfterCreate(false);
                            setIsFormModalOpen(true);
                        }}
                    >
                        <Plus size={16} /> Nuevo Recordatorio
                    </button>
                </div>
            </div>

            {/* BARRA COMPACTA DE FILTROS Y BUSCADOR DINÁMICO */}
            <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', opacity: selectedParent ? 0.5 : 1, flex: '1 1 125px', maxWidth: '150px' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>VENCEN DESDE</label>
                    <input
                        type="date"
                        className="form-control"
                        style={{ height: '36px', fontSize: '0.825rem', width: '100%' }}
                        value={fechaDesde}
                        onChange={e => setFechaDesde(e.target.value)}
                        disabled={!!selectedParent}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', opacity: selectedParent ? 0.5 : 1, flex: '1 1 125px', maxWidth: '150px' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>VENCEN HASTA</label>
                    <input
                        type="date"
                        className="form-control"
                        style={{ height: '36px', fontSize: '0.825rem', width: '100%' }}
                        value={fechaHasta}
                        onChange={e => setFechaHasta(e.target.value)}
                        disabled={!!selectedParent}
                    />
                </div>

                {/* Buscador dinámico en tiempo real */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: '1 1 220px', minWidth: 'min(200px, 100%)' }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>BUSCADOR DINÁMICO</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search size={15} style={{ position: 'absolute', left: '0.65rem', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            className="form-control"
                            style={{ height: '36px', fontSize: '0.825rem', paddingLeft: '2rem', paddingRight: quickSearch ? '2rem' : '0.75rem', width: '100%' }}
                            placeholder="Buscar ubicación, descripción, forma de pago, monto, ID..."
                            value={quickSearch}
                            onChange={e => setQuickSearch(e.target.value)}
                        />
                        {quickSearch && (
                            <button
                                type="button"
                                onClick={() => setQuickSearch('')}
                                title="Limpiar búsqueda"
                                style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {selectedParent && (
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        backgroundColor: 'rgba(99, 102, 241, 0.12)', border: '1px solid var(--primary)',
                        padding: '0 0.75rem', borderRadius: '8px', height: '36px',
                        maxWidth: '100%', overflow: 'hidden', minWidth: 0
                    }}>
                        <span
                            title={`${selectedParent.descripcion} (#${selectedParent.id})`}
                            style={{
                                fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0
                            }}
                        >
                            MATRIZ: <span style={{ color: 'var(--text)' }}>{selectedParent.descripcion} (#{selectedParent.id})</span>
                        </span>
                        <button type="button" onClick={clearParentFilter} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 0, flexShrink: 0 }}>
                            <X size={15} />
                        </button>
                    </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
                    <button type="button" onClick={fetchData} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 1.1rem', fontSize: '0.8rem' }}>
                        <Search size={15} /> Consultar
                    </button>
                    <button type="button" onClick={exportToExcel} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 0.85rem', fontSize: '0.8rem' }}>
                        <Download size={15} /> Excel
                    </button>
                    <button type="button" onClick={handlePreviewPDF} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 0.85rem', fontSize: '0.8rem' }}>
                        <Printer size={15} /> PDF
                    </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', marginLeft: 'auto' }}>
                    {[
                        { id: 'P', label: 'Pendientes', color: 'var(--primary)', shadow: 'rgba(99, 102, 241, 0.35)' },
                        { id: 'PARCIAL', label: 'Parciales', color: '#0ea5e9', shadow: 'rgba(14, 165, 233, 0.35)' },
                        { id: 'C', label: 'Finalizados', color: '#10b981', shadow: 'rgba(16, 185, 129, 0.35)' },
                        { id: 'ALL', label: 'Todos', color: '#64748b', shadow: 'rgba(100, 116, 139, 0.35)' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setEstadoFilter(tab.id)}
                            style={{
                                height: '34px', padding: '0 0.9rem', borderRadius: '18px', fontSize: '0.78rem', fontWeight: 700,
                                border: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
                                backgroundColor: estadoFilter === tab.id ? tab.color : 'rgba(255,255,255,0.06)',
                                color: estadoFilter === tab.id ? '#fff' : 'var(--text-muted)',
                                boxShadow: estadoFilter === tab.id ? `0 3px 10px ${tab.shadow}` : 'none'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}

                    {hasActiveTableFilters && (
                        <button
                            type="button"
                            onClick={clearAllTableFilters}
                            title="Restablecer búsqueda y filtros de columna"
                            style={{
                                height: '34px', padding: '0 0.75rem', borderRadius: '18px', fontSize: '0.75rem', fontWeight: 700,
                                border: '1px solid rgba(245, 158, 11, 0.4)', backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                color: '#fbbf24', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
                            }}
                        >
                            <RotateCcw size={13} /> Limpiar ({displayRecordatorios.length}/{recordatorios.length})
                        </button>
                    )}
                </div>
            </div>

            {/* TABLA COMPACTA CON ORDENAMIENTO Y FILTRO POR TÍTULOS DE COLUMNA */}
            <div className={`card glass ${loading ? 'fade-loading' : ''}`} style={{
                flex: 1,
                overflowY: 'auto',
                maxHeight: '620px',
                padding: 0,
                backgroundColor: 'rgba(20, 25, 30, 0.4)'
            }}>
                {loading && (
                    <div className="loading-overlay">
                        <div className="spinner"></div>
                        <p style={{ marginTop: '0.75rem', color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>Sincronizando control de pagos...</p>
                    </div>
                )}
                <div className="table-responsive">
                    <table className="data-table" style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#1E232A' }}>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                {[
                                    { key: 'id_recordatorio', label: 'ID', width: '74px' },
                                    { key: 'ubicacion', label: 'UBICACIÓN', width: '150px' },
                                    { key: 'descripcion', label: 'DESCRIPCIÓN' },
                                    { key: 'vence', label: 'VENCE', width: '98px' },
                                    { key: 'observacion', label: 'OBSERVACIÓN' },
                                    { key: 'monto', label: 'MONTO', width: '102px' },
                                    { key: 'forma_pago', label: 'MÉTODO / FORMA PAGO', width: '235px' },
                                    { key: 'estado', label: 'ESTADO', width: '96px' },
                                    { key: 'fecha_cancelacion', label: 'FEC. PAGO', width: '98px' }
                                ].map(col => {
                                    const isSorted = sortConfig.key === col.key;
                                    return (
                                        <th
                                            key={col.key}
                                            onClick={() => handleSort(col.key)}
                                            title={`Clic para ordenar por ${col.label} (${isSorted && sortConfig.direction === 'asc' ? 'Descendente' : 'Ascendente'})`}
                                            style={{
                                                padding: '0.45rem 0.5rem',
                                                fontSize: '0.74rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.03em',
                                                width: col.width,
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                backgroundColor: isSorted ? 'rgba(99, 102, 241, 0.16)' : 'transparent',
                                                color: isSorted ? '#a5b4fc' : undefined,
                                                transition: 'background-color 0.15s ease'
                                            }}
                                        >
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <span>{col.label}</span>
                                                {renderSortIcon(col.key)}
                                            </div>
                                        </th>
                                    );
                                })}
                                <th style={{ textAlign: 'center', padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', width: '132px' }}>
                                    ACCIONES
                                </th>
                            </tr>

                            {showColumnFilters && (
                                <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            placeholder="ID..."
                                            value={columnFilters.id_recordatorio}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, id_recordatorio: e.target.value }))}
                                        />
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <select
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            value={columnFilters.ubicacion}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, ubicacion: e.target.value }))}
                                        >
                                            <option value="">Todas</option>
                                            {uniqueUbicacionesInTable.map(u => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </select>
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            placeholder="Filtrar descripción..."
                                            value={columnFilters.descripcion}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, descripcion: e.target.value }))}
                                        />
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            placeholder="dd/mm/aaaa"
                                            value={columnFilters.vence}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, vence: e.target.value }))}
                                        />
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            placeholder="Observación..."
                                            value={columnFilters.observacion}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, observacion: e.target.value }))}
                                        />
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            placeholder="Monto..."
                                            value={columnFilters.monto}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, monto: e.target.value }))}
                                        />
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            placeholder="BAC, ANDELSA, cta..."
                                            value={columnFilters.forma_pago}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, forma_pago: e.target.value }))}
                                        />
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <select
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            value={columnFilters.estado}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, estado: e.target.value }))}
                                        >
                                            <option value="">Todos</option>
                                            <option value="PENDIENTE">PENDIENTE</option>
                                            <option value="PARCIAL">PARCIAL</option>
                                            <option value="CANCELADO">CANCELADO</option>
                                        </select>
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem' }}>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={compactFilterInputStyle}
                                            placeholder="dd/mm/aaaa"
                                            value={columnFilters.fecha_cancelacion}
                                            onChange={e => setColumnFilters(prev => ({ ...prev, fecha_cancelacion: e.target.value }))}
                                        />
                                    </th>
                                    <th style={{ padding: '0.3rem 0.4rem', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {displayRecordatorios.length} reg.
                                    </th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {displayRecordatorios.length === 0 ? (
                                <tr>
                                    <td colSpan="10" style={{ textAlign: 'center', padding: '1.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        No hay registros coincidentes con los filtros aplicados
                                    </td>
                                </tr>
                            ) : displayRecordatorios.map((r) => (
                                <tr
                                    key={r.id || `${r.id_recordatorio}-${r.vence}`}
                                    style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        backgroundColor: r.estado === 'CANCELADO' ? 'rgba(40, 167, 69, 0.05)' : 'transparent'
                                    }}
                                >
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                                        {r.id_recordatorio}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
                                        {r.ubicacion}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                        {r.descripcion}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 'bold' }}>
                                        {formatDate(r.vence)}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {inlineObsEditId === r.id ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <input
                                                    type="text"
                                                    maxLength={50}
                                                    autoFocus
                                                    className="form-control"
                                                    style={{ height: '27px', fontSize: '0.74rem', padding: '0.15rem 0.4rem', minWidth: '120px' }}
                                                    value={inlineObsValue}
                                                    placeholder="Observación / cuenta..."
                                                    onChange={e => setInlineObsValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            saveInlineObservacion(r);
                                                        } else if (e.key === 'Escape') {
                                                            setInlineObsEditId(null);
                                                        }
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn-primary"
                                                    disabled={inlineSavingId === `obs-${r.id}`}
                                                    onClick={() => saveInlineObservacion(r)}
                                                    style={{ padding: '0.2rem 0.35rem', height: '27px' }}
                                                    title="Guardar observación"
                                                >
                                                    <Save size={12} />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    onClick={() => setInlineObsEditId(null)}
                                                    style={{ padding: '0.2rem 0.35rem', height: '27px' }}
                                                    title="Cancelar"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => {
                                                    setInlineObsEditId(r.id);
                                                    setInlineObsValue(r.observacion || '');
                                                }}
                                                title="Clic para editar observación / método sugerido en esta fila"
                                                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.35rem', borderRadius: '4px', border: '1px dashed transparent' }}
                                            >
                                                <span>{r.observacion || '—'}</span>
                                                <Edit size={11} style={{ opacity: 0.45, flexShrink: 0 }} />
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                                        <div>{mc(r.monto)}</div>
                                        {r.estado_pago === 'PARCIAL' && (
                                            <div style={{ marginTop: '0.18rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                <div style={{ fontSize: '0.67rem', fontWeight: 600, color: '#38bdf8', lineHeight: 1.15 }}>
                                                    Abono {mc(r.monto_pagado)} · Resta <strong style={{ color: '#fbbf24' }}>{mc(r.saldo_pendiente)}</strong>
                                                </div>
                                                <div style={{ height: '4px', width: '100%', maxWidth: '115px', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${Math.min(100, Number(r.porcentaje_pagado || 0))}%`, backgroundColor: '#38bdf8' }} />
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem', position: 'relative' }}>
                                        {inlineEditId === r.id ? (() => {
                                            const rowUbicPresets = getAccountsForUbicacion(cuentasBancarias, r.ubicacion);
                                            const rowSmartMatches = findSmartPresetMatches(inlineFormaValue, cuentasBancarias, r.ubicacion);
                                            const suggestions = rowSmartMatches.length > 0 ? rowSmartMatches : rowUbicPresets.slice(0, 4);
                                            return (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '215px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        <input
                                                            type="text"
                                                            maxLength={50}
                                                            autoFocus
                                                            className="form-control"
                                                            style={{ height: '28px', fontSize: '0.75rem', padding: '0.15rem 0.45rem', flex: 1 }}
                                                            placeholder="Ej. bac andelsa, Cheque..."
                                                            value={inlineFormaValue}
                                                            onChange={e => setInlineFormaValue(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    saveInlineFormaPago(r);
                                                                } else if (e.key === 'Escape') {
                                                                    setInlineEditId(null);
                                                                } else if (e.key === 'Tab' && rowSmartMatches.length === 1) {
                                                                    e.preventDefault();
                                                                    setInlineFormaValue(buildPresetValueFromAccount(rowSmartMatches[0]));
                                                                }
                                                            }}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="btn-primary"
                                                            disabled={inlineSavingId === r.id}
                                                            onClick={() => saveInlineFormaPago(r)}
                                                            style={{ padding: '0.2rem 0.4rem', height: '28px', display: 'inline-flex', alignItems: 'center' }}
                                                            title="Guardar método de pago (Enter)"
                                                        >
                                                            <Save size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn-secondary"
                                                            onClick={() => setInlineEditId(null)}
                                                            style={{ padding: '0.2rem 0.35rem', height: '28px', display: 'inline-flex', alignItems: 'center' }}
                                                            title="Cancelar (Esc)"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                    <select
                                                        className="form-control"
                                                        style={{ height: '26px', fontSize: '0.72rem', padding: '0.1rem 0.35rem' }}
                                                        value=""
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (!val) return;
                                                            setInlineFormaValue(val);
                                                            saveInlineFormaPago(r, val);
                                                        }}
                                                    >
                                                        <option value="">⚡ Seleccionar método o cuenta rápida...</option>
                                                        <optgroup label="Métodos de Pago">
                                                            {metodosBase.map(m => (
                                                                <option key={m} value={m}>{m}</option>
                                                            ))}
                                                        </optgroup>
                                                        {rowUbicPresets.length > 0 && (
                                                            <optgroup label={`Sugeridas para ${r.ubicacion}`}>
                                                                {rowUbicPresets.map(c => {
                                                                    const pv = buildPresetValueFromAccount(c);
                                                                    return <option key={`sug-${c.id}`} value={pv}>{pv}</option>;
                                                                })}
                                                            </optgroup>
                                                        )}
                                                        <optgroup label="Todas las Cuentas Bancarias">
                                                            {cuentasBancarias.map(c => {
                                                                const pv = buildPresetValueFromAccount(c);
                                                                return <option key={`all-${c.id}`} value={pv}>{formatCuentaLabel(c)}</option>;
                                                            })}
                                                        </optgroup>
                                                    </select>
                                                    {suggestions.length > 0 && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                            {suggestions.slice(0, 3).map(c => {
                                                                const pv = buildPresetValueFromAccount(c);
                                                                return (
                                                                    <button
                                                                        key={c.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setInlineFormaValue(pv);
                                                                            saveInlineFormaPago(r, pv);
                                                                        }}
                                                                        style={{
                                                                            padding: '0.12rem 0.45rem',
                                                                            borderRadius: '10px',
                                                                            fontSize: '0.68rem',
                                                                            border: '1px solid rgba(16, 185, 129, 0.45)',
                                                                            backgroundColor: 'rgba(16, 185, 129, 0.16)',
                                                                            color: '#a7f3d0',
                                                                            cursor: 'pointer',
                                                                            textAlign: 'left',
                                                                            maxWidth: '210px',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            whiteSpace: 'nowrap'
                                                                        }}
                                                                        title={`Aplicar ${pv}`}
                                                                    >
                                                                        ⚡ {pv}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })() : (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.28rem', maxWidth: '100%' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setPagosPopupRow(r)}
                                                    title="Abrir popup de Método de Pago, Abonos Parciales, Sugerencias y Comprobantes"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.32rem',
                                                        maxWidth: '100%',
                                                        padding: '0.22rem 0.5rem',
                                                        borderRadius: '6px',
                                                        border: r.forma_pago || r.abonos_count > 0 ? '1px solid rgba(99, 102, 241, 0.42)' : '1px dashed rgba(148, 163, 184, 0.45)',
                                                        backgroundColor: r.forma_pago || r.abonos_count > 0 ? 'rgba(99, 102, 241, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                                                        color: r.forma_pago || r.abonos_count > 0 ? 'var(--text)' : 'var(--text-muted)',
                                                        fontSize: '0.74rem',
                                                        cursor: 'pointer',
                                                        textAlign: 'left'
                                                    }}
                                                >
                                                    <CreditCard size={12} style={{ flexShrink: 0, color: r.forma_pago || r.abonos_count > 0 ? 'var(--primary)' : 'var(--text-muted)' }} />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                                                        {r.forma_pago || 'Gestionar pago...'}
                                                    </span>
                                                </button>
                                                {r.tipo_operacion === 'CXC' && (
                                                    <span
                                                        title="Clasificado como Cuenta por Cobrar (Ingreso en Flujo de Caja)"
                                                        style={{
                                                            padding: '0.1rem 0.35rem',
                                                            borderRadius: '5px',
                                                            fontSize: '0.64rem',
                                                            fontWeight: 800,
                                                            backgroundColor: 'rgba(16, 185, 129, 0.18)',
                                                            color: '#34d399',
                                                            border: '1px solid rgba(16, 185, 129, 0.35)'
                                                        }}
                                                    >
                                                        CXC
                                                    </span>
                                                )}
                                                {r.abonos_count > 1 && (
                                                    <span
                                                        title={`${r.abonos_count} pagos aplicados`}
                                                        style={{
                                                            padding: '0.1rem 0.35rem',
                                                            borderRadius: '5px',
                                                            fontSize: '0.64rem',
                                                            fontWeight: 700,
                                                            backgroundColor: 'rgba(14, 165, 233, 0.18)',
                                                            color: '#7dd3fc'
                                                        }}
                                                    >
                                                        {r.abonos_count} pagos
                                                    </span>
                                                )}
                                                {r.comprobantes_count > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openQuickReceiptsViewer(r)}
                                                        title={`Ver ${r.comprobantes_count} comprobante(s) adjunto(s)`}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.2rem',
                                                            padding: '0.14rem 0.4rem',
                                                            borderRadius: '6px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            border: '1px solid rgba(56, 189, 248, 0.4)',
                                                            backgroundColor: 'rgba(56, 189, 248, 0.14)',
                                                            color: '#7dd3fc',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <Paperclip size={10} /> {r.comprobantes_count}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => startInlineEdit(r)}
                                                    title="Edición rápida de texto en línea"
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--text-muted)',
                                                        cursor: 'pointer',
                                                        padding: '0.15rem',
                                                        opacity: 0.65,
                                                        display: 'inline-flex'
                                                    }}
                                                >
                                                    <Edit size={11} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                        {r.estado_pago === 'PARCIAL' ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem', alignItems: 'flex-start' }}>
                                                <span style={{
                                                    padding: '0.12rem 0.42rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.68rem',
                                                    fontWeight: 'bold',
                                                    backgroundColor: 'rgba(255,193,7,0.2)',
                                                    color: '#ffc107'
                                                }}>
                                                    PENDIENTE
                                                </span>
                                                <span style={{
                                                    padding: '0.1rem 0.4rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.66rem',
                                                    fontWeight: 800,
                                                    backgroundColor: 'rgba(14, 165, 233, 0.2)',
                                                    color: '#38bdf8',
                                                    border: '1px solid rgba(14, 165, 233, 0.4)'
                                                }}>
                                                    PARCIAL {Math.round(Number(r.porcentaje_pagado || 0))}%
                                                </span>
                                            </div>
                                        ) : (
                                            <span style={{
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '4px',
                                                fontSize: '0.72rem',
                                                fontWeight: 'bold',
                                                backgroundColor: r.estado === 'CANCELADO' ? 'rgba(40,167,69,0.2)' : 'rgba(255,193,7,0.2)',
                                                color: r.estado === 'CANCELADO' ? '#28a745' : '#ffc107'
                                            }}>
                                                {r.estado}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                        {formatDate(r.fecha_cancelacion) || '—'}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>
                                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            style={{
                                                padding: '0.3rem',
                                                backgroundColor: r.estado_pago === 'PARCIAL' ? '#0ea5e9' : (r.estado === 'CANCELADO' ? '#10b981' : undefined)
                                            }}
                                            title={r.estado === 'CANCELADO' ? 'Ver pagos y comprobantes' : (r.estado_pago === 'PARCIAL' ? 'Aplicar siguiente abono / completar saldo' : 'Registrar pago o abono parcial')}
                                            onClick={() => setPagosPopupRow(r)}
                                        >
                                            <CheckCircle size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            style={{
                                                padding: '0.3rem',
                                                position: 'relative',
                                                backgroundColor: r.mibot_avisos_count > 0 ? 'rgba(0, 136, 204, 0.28)' : 'rgba(0, 136, 204, 0.14)',
                                                borderColor: 'rgba(0, 136, 204, 0.45)',
                                                color: '#38bdf8'
                                            }}
                                            title={
                                                r.mibot_avisos_count > 0
                                                    ? `MiBot Telegram: ${r.mibot_avisos_count} aviso(s) programado(s) — Clic para ver o programar`
                                                    : 'Programar recordatorio o validación por Telegram (MiBot)'
                                            }
                                            onClick={() => {
                                                setMibotTargetRow(r);
                                                setMibotModalOpen(true);
                                            }}
                                        >
                                            <Bell size={14} />
                                            {r.mibot_avisos_count > 0 && (
                                                <span style={{
                                                    position: 'absolute',
                                                    top: '-5px',
                                                    right: '-5px',
                                                    minWidth: '15px',
                                                    height: '15px',
                                                    padding: '0 3px',
                                                    borderRadius: '999px',
                                                    backgroundColor: '#0088cc',
                                                    color: '#fff',
                                                    fontSize: '0.6rem',
                                                    fontWeight: 800,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    lineHeight: 1
                                                }}>
                                                    {r.mibot_avisos_count}
                                                </span>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-success"
                                            style={{ padding: '0.3rem', backgroundColor: r.estado === 'CANCELADO' ? '#6366f1' : '#17a2b8' }}
                                            title={r.estado === 'CANCELADO' ? 'Gestionar Forma / Comprobantes' : 'Editar Recordatorio'}
                                            onClick={() => r.estado === 'CANCELADO' ? setPagosPopupRow(r) : loadForEdit(r)}
                                        >
                                            <Edit size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-danger"
                                            style={{ padding: '0.3rem' }}
                                            title={r.abonos_count > 0 ? 'Elimine los abonos desde el popup de pagos antes de borrar' : 'Eliminar'}
                                            disabled={r.estado === 'CANCELADO' || r.abonos_count > 0}
                                            onClick={() => handleDelete(r)}
                                        >
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

            {/* BARRA DE TOTALES */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.75rem 1.25rem',
                backgroundColor: 'rgba(25, 30, 36, 0.6)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                flexWrap: 'wrap'
            }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                    <span>Mostrando <strong>{displayRecordatorios.length}</strong> de <strong>{recordatorios.length}</strong> registros</span>
                    {parcialesCount > 0 && (
                        <span>Parciales activos: <strong style={{ color: '#38bdf8' }}>{parcialesCount}</strong></span>
                    )}
                    {totalCxcPendiente > 0 && (
                        <span>CXC por Cobrar: <strong style={{ color: '#34d399' }}>{mc(totalCxcPendiente)}</strong></span>
                    )}
                    {totalPagadoVista > 0 && (
                        <span>Total Pagado / Abonado (vista): <strong style={{ color: '#10b981' }}>{mc(totalPagadoVista)}</strong></span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SALDO PENDIENTE REAL:</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--danger)' }}>{mc(totalMonto)}</span>
                </div>
            </div>

            {/* AGENTE IA FLOATING BUTTON & CHAT */}
            <button
                type="button"
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="ai-fab"
                style={{ minHeight: 0 }}
            >
                {isChatOpen ? <X size={26} /> : <Sparkles size={26} />}
            </button>

            {isChatOpen && (
                <div className="card glass ai-chat" style={{ padding: 0 }}>
                    <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ padding: '0.45rem', background: 'var(--primary)', borderRadius: '50%', display: 'flex' }}>
                            <Sparkles size={16} color="white" />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'white' }}>Agente Inteligente SIPE</h3>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {chatHistory.map((m, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <div style={{
                                    maxWidth: '85%', padding: '0.65rem 0.9rem', borderRadius: '12px',
                                    background: m.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                    color: 'white', fontSize: '0.82rem', lineHeight: '1.4',
                                    borderTopRightRadius: m.role === 'user' ? 0 : '12px',
                                    borderTopLeftRadius: m.role === 'ai' ? 0 : '12px'
                                }}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {chatLoading && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '0.65rem 0.9rem', borderRadius: '12px', borderTopLeftRadius: 0, color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.82rem' }}>
                                    Analizando...
                                </div>
                            </div>
                        )}
                    </div>

                    {iaFilterText && (
                        <div style={{ padding: '0.5rem 1rem', background: 'rgba(234, 179, 8, 0.15)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(234, 179, 8, 0.3)' }}>
                            <span style={{ color: '#facc15' }}>Filtro Dinámico Aplicado: <strong>{iaFilterText}</strong></span>
                            <button type="button" onClick={() => setIaFilterText(null)} style={{ background: 'none', border: 'none', color: '#facc15', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
                        </div>
                    )}

                    <form onSubmit={handleChatSubmit} style={{ padding: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.2)' }}>
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Pagar factura, buscar ANDELSA..."
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            style={{ flex: 1, borderRadius: '20px', padding: '0.5rem 0.9rem', fontSize: '0.82rem' }}
                            disabled={chatLoading}
                        />
                        <button type="submit" disabled={chatLoading} style={{
                            background: 'var(--primary)', border: 'none', color: 'white', width: '36px', height: '36px',
                            borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer'
                        }}>
                            <Send size={15} />
                        </button>
                    </form>
                </div>
            )}

            {/* MODAL 1: NUEVO/EDITAR RECORDATORIO */}
            <Modal open={isFormModalOpen} onClose={() => setIsFormModalOpen(false)} title={formData.id ? 'Editar Recordatorio' : 'Nueva Operación de Pago'} size="md">
                <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', minWidth: 0 }}>
                    {/* Zona de capturas / PDF + OCR IA opcional al crear nueva operación (R6.2) */}
                    {!formData.id && (
                        <div
                            onDragOver={e => { e.preventDefault(); setFormDragging(true); }}
                            onDragLeave={() => setFormDragging(false)}
                            onDrop={e => {
                                e.preventDefault();
                                setFormDragging(false);
                                handleFormProcessFiles(e.dataTransfer?.files);
                            }}
                            style={{
                                padding: '0.65rem 0.75rem',
                                borderRadius: '9px',
                                backgroundColor: 'rgba(56, 189, 248, 0.06)',
                                border: formDragging ? '2px dashed #38bdf8' : '1px dashed rgba(56, 189, 248, 0.45)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.45rem',
                                minWidth: 0
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#7dd3fc', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <Sparkles size={13} />
                                    Adjuntar comprobante / factura (Ctrl + V, arrastrar o foto)
                                </span>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={formAutoOcr}
                                        onChange={e => setFormAutoOcr(e.target.checked)}
                                        style={{ width: '16px', height: '16px' }}
                                    />
                                    Auto-leer IA
                                </label>
                            </div>

                            <input
                                ref={formFileInputRef}
                                type="file"
                                multiple
                                accept="image/*,.pdf"
                                style={{ display: 'none' }}
                                onChange={e => {
                                    handleFormProcessFiles(e.target.files);
                                    e.target.value = '';
                                }}
                            />
                            <input
                                ref={formCameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                style={{ display: 'none' }}
                                onChange={e => {
                                    handleFormProcessFiles(e.target.files);
                                    e.target.value = '';
                                }}
                            />

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    disabled={formCompressing || formAnalyzingOcr || formSaving}
                                    onClick={() => formFileInputRef.current?.click()}
                                    style={{ flex: '1 1 135px', height: '34px', fontSize: '0.75rem', padding: '0 0.65rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                >
                                    <Upload size={13} /> Subir Foto / PDF
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    disabled={formCompressing || formAnalyzingOcr || formSaving}
                                    onClick={() => formCameraInputRef.current?.click()}
                                    style={{ flex: '1 1 120px', height: '34px', fontSize: '0.75rem', padding: '0 0.65rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                >
                                    <Camera size={13} /> Tomar Foto
                                </button>
                            </div>

                            <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                Puedes pegar capturas con <strong>Ctrl + V</strong>. Se guardarán en la primera cuota (o abono si marcas pagado).
                            </div>

                            {formAnalyzingOcr && (
                                <div style={{
                                    padding: '0.4rem 0.6rem',
                                    borderRadius: '7px',
                                    backgroundColor: 'rgba(99, 102, 241, 0.16)',
                                    border: '1px solid rgba(99, 102, 241, 0.4)',
                                    color: '#c7d2fe',
                                    fontSize: '0.72rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}>
                                    <Loader2 size={13} className="animate-spin" style={{ flexShrink: 0 }} />
                                    <span>Analizando comprobante con IA...</span>
                                </div>
                            )}

                            {formLastOcr && !formAnalyzingOcr && (
                                <div style={{
                                    padding: '0.45rem 0.6rem',
                                    borderRadius: '7px',
                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid rgba(16, 185, 129, 0.35)',
                                    fontSize: '0.7rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.22rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
                                        <span style={{ fontWeight: 800, color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}>
                                            <Sparkles size={11} /> Leído por IA ({formLastOcr.confianza || 'alta'})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const { filledFields } = applyFormOcrAnalysis(formLastOcr, { force: true });
                                                addToast(
                                                    filledFields.length > 0
                                                        ? `Datos IA aplicados: ${filledFields.join(', ')}`
                                                        : 'No había campos detectados para aplicar',
                                                    filledFields.length > 0 ? 'success' : 'info'
                                                );
                                            }}
                                            style={{
                                                padding: '0.14rem 0.45rem',
                                                borderRadius: '6px',
                                                fontSize: '0.67rem',
                                                fontWeight: 700,
                                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                                backgroundColor: 'rgba(16, 185, 129, 0.16)',
                                                color: '#a7f3d0',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ✨ Re-aplicar datos IA
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', color: 'var(--text)' }}>
                                        {formLastOcr.monto && <span>Monto: <strong style={{ color: '#34d399' }}>{mc(formLastOcr.monto)}</strong></span>}
                                        {formLastOcr.beneficiario && <span>A favor de: <strong>{formLastOcr.beneficiario}</strong></span>}
                                        {formLastOcr.referencia_doc && <span>Ref: <strong>{formLastOcr.referencia_doc}</strong></span>}
                                    </div>
                                </div>
                            )}

                            {pendingFormReceipts.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                                    {pendingFormReceipts.map((r, idx) => (
                                        <div
                                            key={r.tempId}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.28rem',
                                                padding: '0.32rem 0.48rem',
                                                borderRadius: '7px',
                                                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                                fontSize: '0.69rem',
                                                width: '100%',
                                                maxWidth: '100%',
                                                minWidth: 0
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', minWidth: 0 }}>
                                                {r.mime_type === 'application/pdf' ? (
                                                    <FileText
                                                        size={16}
                                                        color="#f87171"
                                                        style={{ flexShrink: 0, cursor: 'pointer' }}
                                                        onClick={() => {
                                                            setQuickViewerIdx(idx);
                                                            setQuickViewerItems(pendingFormReceipts);
                                                            setQuickViewerTitle('Comprobantes por guardar');
                                                            setQuickViewerOpen(true);
                                                        }}
                                                    />
                                                ) : (
                                                    <img
                                                        src={r.data_url}
                                                        alt=""
                                                        onClick={() => {
                                                            setQuickViewerIdx(idx);
                                                            setQuickViewerItems(pendingFormReceipts);
                                                            setQuickViewerTitle('Comprobantes por guardar');
                                                            setQuickViewerOpen(true);
                                                        }}
                                                        style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}
                                                    />
                                                )}
                                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 110px' }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={r.nombre_original}>
                                                        {r.nombre_original}
                                                    </span>
                                                    <span style={{ fontSize: '0.62rem', color: '#6ee7b7' }}>
                                                        {formatBytes(r.compressed_size)}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setQuickViewerIdx(idx);
                                                        setQuickViewerItems(pendingFormReceipts);
                                                        setQuickViewerTitle('Comprobantes por guardar');
                                                        setQuickViewerOpen(true);
                                                    }}
                                                    style={{ background: 'rgba(56, 189, 248, 0.14)', border: '1px solid rgba(56, 189, 248, 0.35)', color: '#bae6fd', borderRadius: '5px', cursor: 'pointer', padding: '0.15rem 0.32rem', fontSize: '0.63rem', display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
                                                    title="Ampliar vista previa"
                                                >
                                                    <Eye size={10} /> Ver
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={formAnalyzingOcr}
                                                    onClick={() => runFormReceiptOcr({ dataUrl: r.data_url, nombreOriginal: r.nombre_original })}
                                                    style={{ background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.45)', color: '#c7d2fe', borderRadius: '5px', cursor: 'pointer', padding: '0.15rem 0.32rem', fontSize: '0.63rem', display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
                                                    title="Leer este comprobante con IA"
                                                >
                                                    <Sparkles size={10} /> IA
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPendingFormReceipts(prev => prev.filter(x => x.tempId !== r.tempId))}
                                                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.1rem', flexShrink: 0 }}
                                                    title="Quitar"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                maxLength={255}
                                                className="form-control"
                                                style={{ height: '28px', fontSize: '0.7rem', padding: '0.15rem 0.45rem', width: '100%' }}
                                                placeholder="Nota breve (ej. Factura #123, Transferencia...)"
                                                value={r.nota || ''}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setPendingFormReceipts(prev => prev.map(x => (x.tempId === r.tempId ? { ...x, nota: val } : x)));
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>DESCRIPCIÓN DEL PAGO</label>
                        <input
                            type="text"
                            maxLength={30}
                            className="form-control"
                            value={formData.descripcion}
                            onChange={e => {
                                markFormDirty('descripcion');
                                setFormData({ ...formData, descripcion: e.target.value });
                            }}
                            required
                            placeholder="Ej. Pago de Alquiler, Seguro..."
                        />
                    </div>

                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>UBICACIÓN / EMPRESA</label>
                            <select
                                className="form-control"
                                value={formData.id_ubicacion}
                                onChange={e => setFormData({ ...formData, id_ubicacion: e.target.value })}
                                required
                            >
                                <option value="">-- Seleccionar --</option>
                                {ubicaciones.map(u => <option value={u.id} key={u.id}>{u.descripcion}</option>)}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>FECHA DE INICIO</label>
                            <input
                                type="date"
                                className="form-control"
                                value={formData.iniciar}
                                onChange={e => {
                                    markFormDirty('iniciar');
                                    setFormData({ ...formData, iniciar: e.target.value });
                                }}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-grid form-grid-3">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>MONTO ($)</label>
                            <input
                                type="number"
                                step="0.01"
                                className="form-control"
                                value={formData.monto}
                                onChange={e => {
                                    markFormDirty('monto');
                                    setFormData({ ...formData, monto: e.target.value });
                                }}
                                required
                                style={{ fontWeight: 'bold', color: 'var(--primary)' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>CANTIDAD</label>
                            <input type="number" min="1" className="form-control" value={formData.repetir} onChange={e => setFormData({ ...formData, repetir: e.target.value })} required />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>REPETICIÓN</label>
                            <select
                                className="form-control"
                                value={formData.repetir_desc}
                                onChange={e => {
                                    setFormData({
                                        ...formData,
                                        repetir_desc: e.target.value,
                                        pagado: e.target.value === 'VEZ' ? formData.pagado : false
                                    });
                                }}
                            >
                                <option value="VEZ">UNA VEZ</option>
                                <option value="DIAS">DÍAS</option>
                                <option value="MES">MESES</option>
                                <option value="AÑO">AÑOS</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>OBSERVACIÓN / PRESET DE CUENTA SUGERIDA</label>
                        <input
                            type="text"
                            maxLength={50}
                            className="form-control"
                            value={formData.forma_pago}
                            onChange={e => {
                                markFormDirty('forma_pago');
                                setFormData({ ...formData, forma_pago: e.target.value });
                            }}
                            placeholder="Ej. Factura #123, o escriba 'bac andelsa'..."
                        />
                        {smartTypedMatchesFormObs.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                                {smartTypedMatchesFormObs.map(c => {
                                    const preset = buildPresetValueFromAccount(c);
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                markFormDirty('forma_pago');
                                                setFormData({ ...formData, forma_pago: preset });
                                            }}
                                            style={{
                                                padding: '0.2rem 0.55rem', fontSize: '0.72rem', borderRadius: '12px',
                                                border: '1px solid rgba(99, 102, 241, 0.45)', background: 'rgba(99, 102, 241, 0.15)',
                                                color: '#c7d2fe', cursor: 'pointer'
                                            }}
                                        >
                                            ⚡ {preset}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {formUbicacionAccounts.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.45rem' }}>
                                {formUbicacionAccounts.slice(0, 4).map(c => {
                                    const preset = buildPresetValueFromAccount(c);
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                markFormDirty('forma_pago');
                                                setFormData({ ...formData, forma_pago: preset, formaPago2: formData.pagado && !formData.formaPago2 ? preset : formData.formaPago2 });
                                            }}
                                            style={{
                                                padding: '0.18rem 0.5rem', fontSize: '0.7rem', borderRadius: '10px',
                                                border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
                                                color: 'var(--text-muted)', cursor: 'pointer'
                                            }}
                                        >
                                            {preset}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer', fontWeight: 700 }}>
                            <input
                                type="checkbox"
                                checked={formData.activo}
                                onChange={e => setFormData({ ...formData, activo: e.target.checked })}
                                style={{ width: '16px', height: '16px' }}
                            />
                            ESTADO ACTIVO
                        </label>
                        {!formData.id && (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer', fontWeight: 700, color: '#38bdf8' }}>
                                <input
                                    type="checkbox"
                                    checked={openMibotAfterCreate}
                                    onChange={e => setOpenMibotAfterCreate(e.target.checked)}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                🔔 Notificar o programar aviso MiBot (Telegram + SIPE) al guardar
                            </label>
                        )}
                    </div>

                    {formData.repetir_desc === 'VEZ' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '1rem', backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#4ade80' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.pagado}
                                    onChange={e => {
                                        const chk = e.target.checked;
                                        setFormData({ ...formData, pagado: chk, fecPago: chk ? todayStr() : '', formaPago2: chk ? (formData.formaPago2 || formData.forma_pago) : '' });
                                    }}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                MARCAR COMO PAGADO AL REGISTRAR
                            </label>
                            <div className="form-grid form-grid-2" style={{ opacity: formData.pagado ? 1 : 0.4, pointerEvents: formData.pagado ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.74rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>FECHA DE PAGO</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        disabled={!formData.pagado}
                                        value={formData.fecPago}
                                        onChange={e => {
                                            markFormDirty('fecPago');
                                            setFormData({ ...formData, fecPago: e.target.value });
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.74rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>FORMA DE PAGO</label>
                                    <input
                                        type="text"
                                        maxLength={50}
                                        className="form-control"
                                        placeholder="Ej. 'bac andelsa', Cheque..."
                                        disabled={!formData.pagado}
                                        value={formData.formaPago2}
                                        onChange={e => {
                                            markFormDirty('formaPago2');
                                            setFormData({ ...formData, formaPago2: e.target.value });
                                        }}
                                    />
                                </div>
                            </div>
                            {formData.pagado && smartTypedMatchesFormPago2.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                    {smartTypedMatchesFormPago2.map(c => {
                                        const preset = buildPresetValueFromAccount(c);
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => {
                                                    markFormDirty('formaPago2');
                                                    setFormData({ ...formData, formaPago2: preset });
                                                }}
                                                style={{
                                                    padding: '0.2rem 0.55rem', fontSize: '0.72rem', borderRadius: '12px',
                                                    border: '1px solid rgba(16, 185, 129, 0.45)', background: 'rgba(16, 185, 129, 0.15)',
                                                    color: '#a7f3d0', cursor: 'pointer'
                                                }}
                                            >
                                                ⚡ {preset}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn-secondary" onClick={() => setIsFormModalOpen(false)}>Cancelar</button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={formSaving || formCompressing || formAnalyzingOcr}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                        >
                            <Save size={17} /> {formSaving ? 'Guardando...' : (formData.id ? 'Guardar Cambios' : 'Guardar Operación')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL 3: BUSCADOR DE MATRICES */}
            <Modal open={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} title="Buscar Recordatorio (Matriz)" size="lg">
                <div className="table-responsive" style={{ overflowY: 'auto', backgroundColor: 'rgba(20,25,30,0.5)', borderRadius: '8px' }}>
                    <table className="data-table" style={{ fontSize: '0.8rem', minWidth: '820px' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'rgba(30,35,42,1)' }}>
                            <tr>
                                <th style={{ width: '90px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleParentSort('id')}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <span>ID</span>
                                        {renderParentSortIcon('id')}
                                    </div>
                                </th>
                                <th>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleParentSort('descripcion')}>
                                        <span>Descripción</span>
                                        {renderParentSortIcon('descripcion')}
                                    </div>
                                    <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                        value={searchFilters.descripcion} onChange={e => setSearchFilters({ ...searchFilters, descripcion: e.target.value })} placeholder="Buscar..." />
                                </th>
                                <th>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleParentSort('fecha_inicio')}>
                                        <span>Fecha Inicio</span>
                                        {renderParentSortIcon('fecha_inicio')}
                                    </div>
                                    <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                        value={searchFilters.fecha_inicio} onChange={e => setSearchFilters({ ...searchFilters, fecha_inicio: e.target.value })} placeholder="Buscar..." />
                                </th>
                                <th>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleParentSort('ubicacion')}>
                                        <span>Ubicación</span>
                                        {renderParentSortIcon('ubicacion')}
                                    </div>
                                    <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                        value={searchFilters.ubicacion} onChange={e => setSearchFilters({ ...searchFilters, ubicacion: e.target.value })} placeholder="Buscar..." />
                                </th>
                                <th>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleParentSort('monto')}>
                                        <span>Monto</span>
                                        {renderParentSortIcon('monto')}
                                    </div>
                                    <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                        value={searchFilters.monto} onChange={e => setSearchFilters({ ...searchFilters, monto: e.target.value })} placeholder="Buscar..." />
                                </th>
                                <th>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleParentSort('observacion')}>
                                        <span>Observación</span>
                                        {renderParentSortIcon('observacion')}
                                    </div>
                                    <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                        value={searchFilters.observacion} onChange={e => setSearchFilters({ ...searchFilters, observacion: e.target.value })} placeholder="Buscar..." />
                                </th>
                                <th>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleParentSort('cuotas')}>
                                        <span>Cuotas</span>
                                        {renderParentSortIcon('cuotas')}
                                    </div>
                                    <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                        value={searchFilters.cuotas} onChange={e => setSearchFilters({ ...searchFilters, cuotas: e.target.value })} placeholder="Buscar..." />
                                </th>
                                <th>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleParentSort('repetir_desc')}>
                                        <span>Repetición</span>
                                        {renderParentSortIcon('repetir_desc')}
                                    </div>
                                    <input type="text" className="form-control" style={{ padding: '0.2rem', fontSize: '0.75rem', marginTop: '4px' }}
                                        value={searchFilters.repetir_desc} onChange={e => setSearchFilters({ ...searchFilters, repetir_desc: e.target.value })} placeholder="Buscar..." />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredParents.length === 0 ? (
                                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '1rem' }}>No se encontraron matrices</td></tr>
                            ) : filteredParents.map((p) => (
                                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => handleSelectParent(p)}>
                                    <td style={{ fontWeight: 'bold', color: 'var(--text-muted)' }}>{p.id}</td>
                                    <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{p.descripcion}</td>
                                    <td>{formatDate(p.fecha_inicio)}</td>
                                    <td>{p.ubicacion}</td>
                                    <td>{mc(p.monto)}</td>
                                    <td>{p.observacion}</td>
                                    <td>{p.cuotas}</td>
                                    <td>{p.repetir_desc}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Modal>

            {/* Modal de Vista Previa de Reporte */}
            <ReportPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                pdfSource={pdfSource}
                pdfDoc={previewPdfDoc}
                title="Control de Pagos y Recordatorios"
                subtitle={selectedParent ? `Filtrado por: ${selectedParent.descripcion}` : `Vencimiento: ${fechaDesde} al ${fechaHasta}`}
                badge="PAGOS"
                totalPages={totalPages}
                fileName={previewFileName}
            />

            {/* Popup completo de Gestión de Pagos, Abonos Parciales, Sugerencias Inteligentes y Comprobantes */}
            <ControlPagosModal
                open={Boolean(pagosPopupRow)}
                onClose={() => setPagosPopupRow(null)}
                vencimientoRow={pagosPopupRow}
                cuentasBancarias={cuentasBancarias}
                onSaved={fetchData}
            />

            {/* Visor Lightbox rápido de comprobantes desde la tabla principal */}
            <ReceiptViewerModal
                open={quickViewerOpen}
                onClose={() => setQuickViewerOpen(false)}
                comprobantes={quickViewerItems}
                initialIndex={quickViewerIdx}
                title={quickViewerTitle}
            />

            {/* Popup MiBot Personal de Telegram (Recordatorios de pago pendiente, tareas, validaciones y reuniones) */}
            <MibotProgramarModal
                open={mibotModalOpen}
                onClose={() => {
                    setMibotModalOpen(false);
                    setMibotTargetRow(null);
                }}
                vencimientoRow={mibotTargetRow}
                onSaved={fetchData}
            />
        </div>
    );
}
