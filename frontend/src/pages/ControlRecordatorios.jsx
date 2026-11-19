import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, Plus, CheckCircle, Edit, Trash2, X, Save, Download,
    Printer, Sparkles, Send, ArrowUp, ArrowDown, ArrowUpDown,
    Filter, CreditCard, RotateCcw, CalendarClock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { parseDateOnly, todayStr } from '../utils/date';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';

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
    const [isPagoModalOpen, setIsPagoModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [parentsList, setParentsList] = useState([]);

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

    // Payment / Edit Forma de Pago Modal State
    const [pagoData, setPagoData] = useState({
        id_vencimiento: '',
        fecPago: todayStr(),
        formaPago: '',
        ubicacion: '',
        descripcion: '',
        monto: 0,
        estadoActual: 'PENDIENTE',
        mode: 'pay' // 'pay' | 'edit_forma'
    });
    const [selectedCuentaId, setSelectedCuentaId] = useState('');

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
                    `${r.id_recordatorio} ${r.ubicacion} ${r.descripcion} ${venceFmt} ${r.vence} ${r.observacion} ${montoStr} ${r.forma_pago} ${r.estado} ${fecPagoFmt}`
                );
                const tokens = qNorm.split(/\s+/).filter(Boolean);
                if (!tokens.every(tk => rowBlob.includes(tk))) return false;
            }

            if (columnFilters.id_recordatorio && !String(r.id_recordatorio || '').includes(columnFilters.id_recordatorio.trim())) return false;
            if (columnFilters.ubicacion && normalizeText(r.ubicacion) !== normalizeText(columnFilters.ubicacion)) return false;
            if (columnFilters.descripcion && !normalizeText(r.descripcion).includes(normalizeText(columnFilters.descripcion))) return false;
            if (columnFilters.vence && !`${venceFmt} ${r.vence || ''}`.toLowerCase().includes(columnFilters.vence.trim().toLowerCase())) return false;
            if (columnFilters.observacion && !normalizeText(r.observacion).includes(normalizeText(columnFilters.observacion))) return false;
            if (columnFilters.monto && !`${montoStr} ${mc(r.monto)}`.toLowerCase().includes(columnFilters.monto.trim().toLowerCase())) return false;
            if (columnFilters.forma_pago && !normalizeText(r.forma_pago).includes(normalizeText(columnFilters.forma_pago))) return false;
            if (columnFilters.estado && normalizeText(r.estado) !== normalizeText(columnFilters.estado)) return false;
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
            if (item.estado === 'PENDIENTE') return sum + Number(item.monto || 0);
            return sum;
        }, 0);
    }, [displayRecordatorios]);

    const totalPagadoVista = useMemo(() => {
        return displayRecordatorios.reduce((sum, item) => {
            if (item.estado === 'CANCELADO') return sum + Number(item.monto || 0);
            return sum;
        }, 0);
    }, [displayRecordatorios]);

    // Contextual presets for Pago / Forma de Pago Modal
    const ubicacionSuggestedAccounts = useMemo(() => {
        return getAccountsForUbicacion(cuentasBancarias, pagoData.ubicacion);
    }, [cuentasBancarias, pagoData.ubicacion]);

    const smartTypedMatchesPago = useMemo(() => {
        return findSmartPresetMatches(pagoData.formaPago, cuentasBancarias, pagoData.ubicacion);
    }, [pagoData.formaPago, cuentasBancarias, pagoData.ubicacion]);

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

    const openPagoOrEditModal = (rec, mode = 'pay') => {
        const defaultSuggested = getAccountsForUbicacion(cuentasBancarias, rec.ubicacion);
        const existingForma = String(rec.forma_pago || '').trim();
        const fallbackObs = String(rec.observacion || '').trim();
        const prefilledForma = existingForma
            || (findSmartPresetMatches(fallbackObs, cuentasBancarias, rec.ubicacion)[0]
                ? buildPresetValueFromAccount(findSmartPresetMatches(fallbackObs, cuentasBancarias, rec.ubicacion)[0])
                : (defaultSuggested.length === 1 ? buildPresetValueFromAccount(defaultSuggested[0]) : ''));

        setSelectedCuentaId('');
        setPagoData({
            id_vencimiento: rec.id,
            fecPago: rec.fecha_cancelacion ? String(rec.fecha_cancelacion).slice(0, 10) : todayStr(),
            formaPago: prefilledForma,
            ubicacion: rec.ubicacion || '',
            descripcion: rec.descripcion || '',
            monto: Number(rec.monto || 0),
            estadoActual: rec.estado || 'PENDIENTE',
            mode: rec.estado === 'CANCELADO' ? 'edit_forma' : mode
        });
        setIsPagoModalOpen(true);
    };

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
                const rec = displayRecordatorios.find(r => String(r.id) === String(id) || String(r.id_recordatorio) === String(id));
                if (rec) {
                    openPagoOrEditModal({ ...rec, forma_pago: rec.forma_pago || 'Aprobado vía IA Asistente' }, 'pay');
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
        try {
            const payload = {
                ...formData,
                forma_pago: resolveFinalFormaPago(formData.forma_pago, selectedFormUbicacionName),
                formaPago2: resolveFinalFormaPago(formData.formaPago2, selectedFormUbicacionName)
            };
            await api.post('/operaciones/recordatorios', payload);
            addToast('Recordatorio guardado correctamente', 'success');
            setIsFormModalOpen(false);
            fetchData();
        } catch (error) {
            addToast('Error al guardar recordatorio', 'error');
        }
    };

    const loadForEdit = async (vencimientoRec) => {
        if (vencimientoRec.estado === 'CANCELADO') {
            openPagoOrEditModal(vencimientoRec, 'edit_forma');
            return;
        }
        try {
            const res = await api.get(`/operaciones/recordatorios/${vencimientoRec.id_recordatorio}`);
            if (res.data.pagados > 0) {
                if (!await confirm('Este Recordatorio ya posee pagos.\nSi edita la matriz general se regenerarán sus cuotas. ¿Desea continuar? (Para editar solo la Forma de Pago haga clic directamente en la columna Forma Pago).', { variant: 'warning', title: 'Advertencia' })) return;
            }

            const p = res.data.recordatorio;
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

    const handlePagoSubmit = async (e) => {
        e.preventDefault();
        const finalFormaPago = resolveFinalFormaPago(pagoData.formaPago, pagoData.ubicacion);
        try {
            if (pagoData.mode === 'edit_forma') {
                await api.patch(`/operaciones/recordatorios/vencimiento/${pagoData.id_vencimiento}`, {
                    forma_pago: finalFormaPago,
                    fecha_cancelacion: pagoData.estadoActual === 'CANCELADO' ? pagoData.fecPago : undefined
                });
                addToast('Forma de pago actualizada', 'success');
            } else {
                if (!finalFormaPago) {
                    addToast('Indique o seleccione la forma de pago', 'warning');
                    return;
                }
                await api.put(`/operaciones/recordatorios/pagar/${pagoData.id_vencimiento}`, {
                    fecha_cancelacion: pagoData.fecPago,
                    forma_pago: finalFormaPago
                });
                addToast('Pago registrado correctamente', 'success');
            }
            setIsPagoModalOpen(false);
            fetchData();
        } catch (error) {
            addToast('Error al procesar la operación de pago', 'error');
        }
    };

    const handleSaveOnlyFormaPago = async () => {
        const finalFormaPago = resolveFinalFormaPago(pagoData.formaPago, pagoData.ubicacion);
        try {
            await api.patch(`/operaciones/recordatorios/vencimiento/${pagoData.id_vencimiento}`, {
                forma_pago: finalFormaPago
            });
            addToast('Forma de pago preasignada correctamente', 'success');
            setIsPagoModalOpen(false);
            fetchData();
        } catch (error) {
            addToast('Error al guardar forma de pago', 'error');
        }
    };

    const exportToExcel = () => {
        if (displayRecordatorios.length === 0) {
            addToast('No hay datos en pantalla para exportar', 'warning');
            return;
        }
        const wsData = displayRecordatorios.map(r => ({
            'ID Principal': r.id_recordatorio,
            'Ubicación': r.ubicacion,
            'Descripción': r.descripcion,
            'Vence': formatDate(r.vence),
            'Observación': r.observacion,
            'Monto': Number(r.monto),
            'Forma Pago': r.forma_pago,
            'Estado': r.estado,
            'Fec Pago': formatDate(r.fecha_cancelacion)
        }));
        const ws = XLSX.utils.json_to_sheet(wsData);
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
        const sub = selectedParent
            ? `Filtrado por: ${selectedParent.descripcion} (ID: ${selectedParent.id})  |  Registros: ${displayRecordatorios.length}  |  Generado: ${new Date().toLocaleDateString('es-SV')} ${new Date().toLocaleTimeString('es-SV')}`
            : `Período: ${fechaDesde} al ${fechaHasta}  |  Estado: ${estadoFilter === 'P' ? 'Pendientes' : estadoFilter === 'C' ? 'Finalizados' : 'Todos'}  |  Registros: ${displayRecordatorios.length}  |  Generado: ${new Date().toLocaleDateString('es-SV')}`;
        doc.text(sub, 14, 21);

        const tableColumn = ['Ubicación', 'Descripción', 'Vence', 'Observación', 'Monto', 'Forma de Pago', 'Estado', 'Fecha Pago'];
        const tableRows = displayRecordatorios.map(r => [
            r.ubicacion || '-',
            r.descripcion || '-',
            formatDate(r.vence),
            r.observacion || '-',
            mc(r.monto),
            r.forma_pago || '-',
            r.estado === 'P' ? 'PENDIENTE' : r.estado === 'C' ? 'PAGADO' : (r.estado || '-'),
            formatDate(r.fecha_cancelacion)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 26,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 34 },
                1: { cellWidth: 48 },
                2: { halign: 'center', cellWidth: 21 },
                3: { cellWidth: 40 },
                4: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
                5: { cellWidth: 40 },
                6: { halign: 'center', cellWidth: 22 },
                7: { halign: 'center', cellWidth: 22 }
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
                        className="btn-success"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', height: '36px', padding: '0 1rem', fontSize: '0.8rem' }}
                        onClick={() => {
                            setFormData({ id: '', descripcion: '', id_ubicacion: '', iniciar: todayStr(), activo: true, monto: 0.0, repetir: 1, repetir_desc: 'VEZ', forma_pago: '', pagado: false, fecPago: todayStr(), formaPago2: '' });
                            setIsFormModalOpen(true);
                        }}
                    >
                        <Plus size={16} /> Nuevo Recordatorio
                    </button>
                </div>
            </div>

            {/* BARRA COMPACTA DE FILTROS Y BUSCADOR DINÁMICO */}
            <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', opacity: selectedParent ? 0.5 : 1 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>VENCEN DESDE</label>
                    <input
                        type="date"
                        className="form-control"
                        style={{ height: '36px', fontSize: '0.825rem', width: '142px' }}
                        value={fechaDesde}
                        onChange={e => setFechaDesde(e.target.value)}
                        disabled={!!selectedParent}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', opacity: selectedParent ? 0.5 : 1 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>VENCEN HASTA</label>
                    <input
                        type="date"
                        className="form-control"
                        style={{ height: '36px', fontSize: '0.825rem', width: '142px' }}
                        value={fechaHasta}
                        onChange={e => setFechaHasta(e.target.value)}
                        disabled={!!selectedParent}
                    />
                </div>

                {/* Buscador dinámico en tiempo real */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: '1 1 230px', minWidth: '200px' }}>
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
                        padding: '0 0.75rem', borderRadius: '8px', height: '36px'
                    }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                            MATRIZ: <span style={{ color: 'var(--text)' }}>{selectedParent.descripcion} (#{selectedParent.id})</span>
                        </span>
                        <button type="button" onClick={clearParentFilter} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 0 }}>
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
                                <th style={{ textAlign: 'center', padding: '0.45rem 0.5rem', fontSize: '0.74rem', letterSpacing: '0.03em', width: '102px' }}>
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
                                        {mc(r.monto)}
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
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', maxWidth: '100%' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => startInlineEdit(r)}
                                                    title="Clic para editar Método / Forma de Pago directamente en esta fila"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.35rem',
                                                        maxWidth: '100%',
                                                        padding: '0.22rem 0.5rem',
                                                        borderRadius: '6px',
                                                        border: r.forma_pago ? '1px solid rgba(99, 102, 241, 0.35)' : '1px dashed rgba(148, 163, 184, 0.4)',
                                                        backgroundColor: r.forma_pago ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                                                        color: r.forma_pago ? 'var(--text)' : 'var(--text-muted)',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer',
                                                        textAlign: 'left'
                                                    }}
                                                >
                                                    <CreditCard size={12} style={{ flexShrink: 0, color: r.forma_pago ? 'var(--primary)' : 'var(--text-muted)' }} />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '165px' }}>
                                                        {r.forma_pago || 'Editar método...'}
                                                    </span>
                                                    <Edit size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
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
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', fontSize: '0.8rem' }}>
                                        {formatDate(r.fecha_cancelacion) || '—'}
                                    </td>
                                    <td style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', padding: '0.45rem 0.5rem' }}>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            style={{ padding: '0.3rem' }}
                                            title={r.estado === 'CANCELADO' ? 'Pago ya aplicado' : 'Marcar como Pagado'}
                                            disabled={r.estado === 'CANCELADO'}
                                            onClick={() => openPagoOrEditModal(r, 'pay')}
                                        >
                                            <CheckCircle size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-success"
                                            style={{ padding: '0.3rem', backgroundColor: r.estado === 'CANCELADO' ? '#6366f1' : '#17a2b8' }}
                                            title={r.estado === 'CANCELADO' ? 'Editar Forma / Fecha de Pago' : 'Editar Recordatorio'}
                                            onClick={() => loadForEdit(r)}
                                        >
                                            <Edit size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-danger"
                                            style={{ padding: '0.3rem' }}
                                            title="Eliminar"
                                            disabled={r.estado === 'CANCELADO'}
                                            onClick={() => handleDelete(r)}
                                        >
                                            <Trash2 size={14} />
                                        </button>
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
                    {totalPagadoVista > 0 && (
                        <span>Total Pagado (vista): <strong style={{ color: '#10b981' }}>{mc(totalPagadoVista)}</strong></span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>MONTO TOTAL (Pendiente):</span>
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
                <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>DESCRIPCIÓN DEL PAGO</label>
                        <input
                            type="text"
                            maxLength={30}
                            className="form-control"
                            value={formData.descripcion}
                            onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
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
                            <input type="date" className="form-control" value={formData.iniciar} onChange={e => setFormData({ ...formData, iniciar: e.target.value })} required />
                        </div>
                    </div>

                    <div className="form-grid form-grid-3">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>MONTO ($)</label>
                            <input type="number" step="0.01" className="form-control" value={formData.monto} onChange={e => setFormData({ ...formData, monto: e.target.value })} required style={{ fontWeight: 'bold', color: 'var(--primary)' }} />
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
                            onChange={e => setFormData({ ...formData, forma_pago: e.target.value })}
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
                                            onClick={() => setFormData({ ...formData, forma_pago: preset })}
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
                                            onClick={() => setFormData({ ...formData, forma_pago: preset, formaPago2: formData.pagado && !formData.formaPago2 ? preset : formData.formaPago2 })}
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

                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer', fontWeight: 700 }}>
                            <input
                                type="checkbox"
                                checked={formData.activo}
                                onChange={e => setFormData({ ...formData, activo: e.target.checked })}
                                style={{ width: '16px', height: '16px' }}
                            />
                            ESTADO ACTIVO
                        </label>
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
                                    <input type="date" className="form-control" disabled={!formData.pagado} value={formData.fecPago} onChange={e => setFormData({ ...formData, fecPago: e.target.value })} />
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
                                        onChange={e => setFormData({ ...formData, formaPago2: e.target.value })}
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
                                                onClick={() => setFormData({ ...formData, formaPago2: preset })}
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
                        <button type="submit" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                            <Save size={17} /> Guardar Cambios
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL 2: PAGAR RECORDATORIO / EDITAR FORMA DE PAGO CON PRESETS AUTOMÁTICOS */}
            <Modal
                open={isPagoModalOpen}
                onClose={() => setIsPagoModalOpen(false)}
                title={pagoData.mode === 'edit_forma' ? 'Editar Forma de Pago' : 'Realizar Pago'}
                size="md"
            >
                <form onSubmit={handlePagoSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
                    {/* Resumen compacto del registro */}
                    <div style={{
                        padding: '0.65rem 0.9rem',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(99, 102, 241, 0.08)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        fontSize: '0.8rem'
                    }}>
                        <div>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{pagoData.descripcion || 'Pago'}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Ubicación: <strong>{pagoData.ubicacion || 'General'}</strong> · Estado: <strong>{pagoData.estadoActual}</strong></div>
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary)' }}>
                            {mc(pagoData.monto)}
                        </div>
                    </div>

                    {(pagoData.mode === 'pay' || pagoData.estadoActual === 'CANCELADO') && (
                        <div>
                            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'block' }}>
                                FECHA DEL PAGO
                            </label>
                            <input
                                type="date"
                                className="form-control"
                                value={pagoData.fecPago}
                                onChange={e => setPagoData({ ...pagoData, fecPago: e.target.value })}
                                required
                            />
                        </div>
                    )}

                    {/* Selector oficial de Cuenta Bancaria (formatCuentaLabel + sortCuentas) */}
                    <div>
                        <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'block' }}>
                            SELECCIONAR CUENTA BANCARIA (PRESET OFICIAL)
                        </label>
                        <select
                            className="form-control"
                            value={selectedCuentaId}
                            onChange={e => {
                                const cid = e.target.value;
                                setSelectedCuentaId(cid);
                                const found = cuentasBancarias.find(c => String(c.id) === String(cid));
                                if (found) {
                                    setPagoData(prev => ({ ...prev, formaPago: buildPresetValueFromAccount(found) }));
                                }
                            }}
                        >
                            <option value="">-- Seleccionar cuenta bancaria o usar presets rápidos --</option>
                            {cuentasBancarias.map(c => (
                                <option key={c.id} value={c.id}>
                                    {formatCuentaLabel(c)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Presets automáticos contextuales según Ubicación / Empresa (ej. ANDELSA) */}
                    {ubicacionSuggestedAccounts.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.35rem' }}>
                                Presets automáticos sugeridos para {pagoData.ubicacion}:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {ubicacionSuggestedAccounts.map(c => {
                                    const presetVal = buildPresetValueFromAccount(c);
                                    const isActive = pagoData.formaPago === presetVal;
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedCuentaId(String(c.id));
                                                setPagoData(prev => ({ ...prev, formaPago: presetVal }));
                                            }}
                                            style={{
                                                padding: '0.28rem 0.65rem',
                                                borderRadius: '14px',
                                                fontSize: '0.73rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                border: isActive ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.14)',
                                                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.05)',
                                                color: isActive ? '#fff' : 'var(--text)'
                                            }}
                                        >
                                            {presetVal}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Campo editable de Forma de Pago con autocompletado inteligente al escribir */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                FORMA DE PAGO (EDITABLE · MÁX. 50 CARACTERES)
                            </label>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {(pagoData.formaPago || '').length}/50
                            </span>
                        </div>
                        <input
                            type="text"
                            maxLength={50}
                            className="form-control"
                            placeholder="Ej. escriba 'bac de andelsa', 'davi andelsa', Cheque #..."
                            value={pagoData.formaPago}
                            onChange={e => setPagoData({ ...pagoData, formaPago: e.target.value })}
                            onKeyDown={e => {
                                if (e.key === 'Tab' && smartTypedMatchesPago.length === 1) {
                                    e.preventDefault();
                                    setPagoData(prev => ({ ...prev, formaPago: buildPresetValueFromAccount(smartTypedMatchesPago[0]) }));
                                }
                            }}
                            required={pagoData.mode === 'pay'}
                        />

                        {/* Sugerencias dinámicas al escribir ej. "bac de andelsa" */}
                        {smartTypedMatchesPago.length > 0 && (
                            <div style={{
                                marginTop: '0.45rem',
                                padding: '0.5rem 0.65rem',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.35rem'
                            }}>
                                <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 700 }}>
                                    Cuenta detectada automáticamente (clic o Tab para autocompletar):
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                    {smartTypedMatchesPago.map(c => {
                                        const presetVal = buildPresetValueFromAccount(c);
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedCuentaId(String(c.id));
                                                    setPagoData(prev => ({ ...prev, formaPago: presetVal }));
                                                }}
                                                style={{
                                                    padding: '0.24rem 0.6rem',
                                                    borderRadius: '12px',
                                                    fontSize: '0.73rem',
                                                    fontWeight: 700,
                                                    border: '1px solid rgba(16, 185, 129, 0.45)',
                                                    backgroundColor: 'rgba(16, 185, 129, 0.18)',
                                                    color: '#d1fae5',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ⚡ {presetVal}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Métodos rápidos genéricos */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                            {metodosBase.map(metodo => (
                                <button
                                    key={metodo}
                                    type="button"
                                    onClick={() => setPagoData(prev => ({
                                        ...prev,
                                        formaPago: prev.formaPago && !metodosBase.includes(prev.formaPago)
                                            ? `${metodo.slice(0, 8)} ${prev.formaPago}`.slice(0, 50)
                                            : metodo
                                    }))}
                                    style={{
                                        padding: '0.18rem 0.5rem',
                                        borderRadius: '10px',
                                        fontSize: '0.7rem',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + {metodo}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <button type="button" className="btn-secondary" onClick={() => setIsPagoModalOpen(false)}>
                            Cancelar
                        </button>
                        {pagoData.mode === 'pay' && pagoData.estadoActual === 'PENDIENTE' && (
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={handleSaveOnlyFormaPago}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                title="Guardar la forma de pago sin marcar aún como cancelado"
                            >
                                <Save size={15} /> Solo Preasignar Forma
                            </button>
                        )}
                        <button type="submit" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                            <CheckCircle size={16} />
                            {pagoData.mode === 'edit_forma'
                                ? 'Guardar Forma de Pago'
                                : 'Procesar Pago'}
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
        </div>
    );
}
