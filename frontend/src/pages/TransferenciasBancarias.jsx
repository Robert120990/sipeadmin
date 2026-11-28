import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    ArrowRightLeft, Landmark, Search, Filter, Save, Trash2,
    Download, RefreshCw, AlertCircle, Paperclip,
    Upload, Sparkles, Camera, FileText, X, ChevronLeft, ChevronRight,
    Scale, Building2, Printer
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import ReceiptViewerModal from '../components/ReceiptViewerModal';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { sanitizeSpreadsheetRows } from '../utils/exportSanitizer';
import { compressReceiptFile, formatBytes } from '../utils/receiptCompressor';
import { moneyFmt } from '../utils/format';
import {
    resolveInitialBancosContext,
    saveBancosSelection,
    subscribeBancosNavTarget,
    navigateToBancosTarget,
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

const getMonthStartYMD = (ymd) => {
    const [y, m] = String(ymd || getSvTodayYMD()).split('-');
    return `${y}-${m}-01`;
};

const makeIdempotencyKey = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

const deduplicateReceiptBatch = (existingList, batch) => {
    const existingNames = new Set((existingList || []).map(r => r?.nombre_original).filter(Boolean));
    return batch.map(item => {
        let finalName = item.nombre_original;
        if (finalName && finalName.startsWith('captura_') && existingNames.has(finalName)) {
            const dotIdx = finalName.lastIndexOf('.');
            const base = dotIdx > 0 ? finalName.slice(0, dotIdx) : finalName;
            const ext = dotIdx > 0 ? finalName.slice(dotIdx) : '';
            let counter = 2;
            while (existingNames.has(`${base}_${counter}${ext}`)) counter++;
            finalName = `${base}_${counter}${ext}`;
        }
        existingNames.add(finalName);
        return { ...item, nombre_original: finalName };
    });
};

export default function TransferenciasBancarias() {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { confirm } = useConfirm();

    const todayStr = useMemo(() => getSvTodayYMD(), []);

    // Catálogos
    const [empresas, setEmpresas] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [loadingCatalogs, setLoadingCatalogs] = useState(true);

    // Formulario principal (Registro de Transferencia Interna)
    const [codigoTransferencia, setCodigoTransferencia] = useState('');
    const [loadingCorrelativo, setLoadingCorrelativo] = useState(false);
    const [empresaDebitar, setEmpresaDebitar] = useState('');
    const [empresaAcreditar, setEmpresaAcreditar] = useState('');
    const [cuentaDebitarId, setCuentaDebitarId] = useState('');
    const [cuentaAcreditarId, setCuentaAcreditarId] = useState('');
    const [fecha, setFecha] = useState(todayStr);
    const [aplicarAlGuardar, setAplicarAlGuardar] = useState(false);
    const [fechaAplicado, setFechaAplicado] = useState(todayStr);
    const [conceptoGeneral, setConceptoGeneral] = useState('MOVIMIENTO POR TRANSFERENCIA BANCARIA');
    const [conceptoDetalle, setConceptoDetalle] = useState('');
    const [documento, setDocumento] = useState('');
    const [monto, setMonto] = useState('');
    const [tipoPartida, setTipoPartida] = useState('');
    const [numPartida, setNumPartida] = useState('');
    const [codCta, setCodCta] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    // Saldos en vivo por cuenta
    const [debitResumen, setDebitResumen] = useState(null);
    const [creditResumen, setCreditResumen] = useState(null);
    const [loadingDebitResumen, setLoadingDebitResumen] = useState(false);
    const [loadingCreditResumen, setLoadingCreditResumen] = useState(false);

    // Comprobantes y OCR
    const [pendingReceipts, setPendingReceipts] = useState([]);
    const [compressingFiles, setCompressingFiles] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [autoOcrEnabled, setAutoOcrEnabled] = useState(true);
    const [analyzingOcr, setAnalyzingOcr] = useState(false);
    const [lastOcrResult, setLastOcrResult] = useState(null);

    // Historial
    const [filters, setFilters] = useState(() => ({
        desde: getMonthStartYMD(todayStr),
        hasta: todayStr,
        empresa_id: '',
        cuenta_id: '',
        estado_conciliacion: 'TODOS',
        solo_interempresa: false,
        search: '',
        page: 1,
        limit: 50
    }));
    const filtersRef = useRef(filters);
    filtersRef.current = filters;

    const [transferencias, setTransferencias] = useState([]);
    const [resumenHist, setResumenHist] = useState({
        total_transferencias: 0,
        monto_total: 0,
        interempresa_count: 0,
        ambas_conciliadas: 0,
        parciales_count: 0,
        ambas_pendientes: 0
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, total_pages: 1 });
    const [loadingList, setLoadingList] = useState(false);

    // Visores (Lightbox y ReportPreviewModal)
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerItems, setViewerItems] = useState([]);
    const [viewerIdx, setViewerIdx] = useState(0);
    const [viewerTitle, setViewerTitle] = useState('Comprobante de Transferencia');

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewMeta, setPreviewMeta] = useState({
        title: 'Comprobante de Transferencia Interna',
        subtitle: '',
        badge: 'TRANSFERENCIA',
        fileName: 'transferencia_interna.pdf'
    });

    // Tracking OCR / Guards
    const dirtyFieldsRef = useRef(new Set());
    const confirmOpenRef = useRef(false);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const pendingReceiptsRef = useRef([]);
    pendingReceiptsRef.current = pendingReceipts;

    const markDirty = useCallback((...fields) => {
        fields.forEach(f => dirtyFieldsRef.current.add(f));
    }, []);

    const safeConfirm = useCallback(async (message, options) => {
        confirmOpenRef.current = true;
        try {
            return await confirm(message, options);
        } finally {
            confirmOpenRef.current = false;
        }
    }, [confirm]);

    const fetchNextCorrelativo = useCallback(async () => {
        setLoadingCorrelativo(true);
        try {
            const res = await api.get('/bancos/transferencias/siguiente-correlativo');
            if (res.data?.codigo_transferencia) {
                setCodigoTransferencia(res.data.codigo_transferencia);
            }
        } catch {
            // Ignorar si falla silenciosamente
        } finally {
            setLoadingCorrelativo(false);
        }
    }, []);

    const fetchCuentaResumen = useCallback(async (id, setter, loadingSetter) => {
        if (!id) {
            setter(null);
            return;
        }
        loadingSetter(true);
        try {
            const res = await api.get(`/bancos/cuentas/${id}/resumen`);
            setter(res.data || null);
        } catch {
            setter(null);
        } finally {
            loadingSetter(false);
        }
    }, []);

    const fetchTransferencias = useCallback(async (overrideFilters = null) => {
        const active = overrideFilters || filtersRef.current;
        setLoadingList(true);
        try {
            const params = {
                desde: active.desde || undefined,
                hasta: active.hasta || undefined,
                empresa_id: active.empresa_id || undefined,
                cuenta_id: active.cuenta_id || undefined,
                estado_conciliacion: active.estado_conciliacion || 'TODOS',
                solo_interempresa: active.solo_interempresa ? 'true' : undefined,
                search: active.search?.trim() || undefined,
                page: active.page || 1,
                limit: active.limit || 50
            };
            const res = await api.get('/bancos/transferencias', { params });
            setTransferencias(res.data?.transferencias || []);
            if (res.data?.resumen) setResumenHist(res.data.resumen);
            if (res.data?.pagination) setPagination(res.data.pagination);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar transferencias internas', 'error');
        } finally {
            setLoadingList(false);
        }
    }, [addToast]);

    // Carga inicial y suscripción keep-alive
    useEffect(() => {
        let active = true;
        const init = async () => {
            setLoadingCatalogs(true);
            try {
                const [catRes] = await Promise.all([
                    api.get('/bancos/movimientos/catalogos'),
                    fetchNextCorrelativo()
                ]);
                if (!active) return;
                const loadedEmps = catRes.data?.empresas || [];
                const loadedCuentas = sortCuentas(catRes.data?.cuentas || []);
                setEmpresas(loadedEmps);
                setCuentas(loadedCuentas);

                const initialCtx = resolveInitialBancosContext('/dashboard/bancos/transferencias');
                const matched = findMatchingCuenta(loadedCuentas, initialCtx);
                if (matched) {
                    const matchedId = String(matched.corr || matched.id || '');
                    setCuentaDebitarId(matchedId);
                    setEmpresaDebitar(String(matched.id_empresa || matched.empresa_codigo || ''));
                    setFilters(prev => ({
                        ...prev,
                        empresa_id: String(matched.id_empresa || matched.empresa_codigo || ''),
                        cuenta_id: matchedId
                    }));
                }
            } catch {
                if (active) addToast('Error al cargar catálogos bancarios', 'error');
            } finally {
                if (active) setLoadingCatalogs(false);
            }
        };
        init();

        const unsubscribe = subscribeBancosNavTarget('/dashboard/bancos/transferencias', (detail) => {
            setCuentas(curr => {
                const matched = findMatchingCuenta(curr, detail);
                if (matched) {
                    const matchedId = String(matched.corr || matched.id || '');
                    setCuentaDebitarId(matchedId);
                    setEmpresaDebitar(String(matched.id_empresa || matched.empresa_codigo || ''));
                }
                return curr;
            });
            fetchNextCorrelativo();
            fetchTransferencias();
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, [addToast, fetchNextCorrelativo, fetchTransferencias]);

    useEffect(() => {
        fetchTransferencias(filters);
    }, [filters.page, filters.estado_conciliacion, filters.solo_interempresa, fetchTransferencias]);

    useEffect(() => {
        fetchCuentaResumen(cuentaDebitarId, setDebitResumen, setLoadingDebitResumen);
    }, [cuentaDebitarId, fetchCuentaResumen]);

    useEffect(() => {
        fetchCuentaResumen(cuentaAcreditarId, setCreditResumen, setLoadingCreditResumen);
    }, [cuentaAcreditarId, fetchCuentaResumen]);

    const cuentasDebitarOptions = useMemo(() => {
        const list = empresaDebitar
            ? cuentas.filter(c => String(c.id_empresa || c.empresa_codigo || '') === String(empresaDebitar))
            : cuentas;
        return sortCuentas(list);
    }, [cuentas, empresaDebitar]);

    const cuentasAcreditarOptions = useMemo(() => {
        const list = empresaAcreditar
            ? cuentas.filter(c => String(c.id_empresa || c.empresa_codigo || '') === String(empresaAcreditar))
            : cuentas;
        return sortCuentas(list);
    }, [cuentas, empresaAcreditar]);

    const selectedDebitAcc = useMemo(
        () => cuentas.find(c => String(c.corr || c.id) === String(cuentaDebitarId)) || null,
        [cuentas, cuentaDebitarId]
    );
    const selectedCreditAcc = useMemo(
        () => cuentas.find(c => String(c.corr || c.id) === String(cuentaAcreditarId)) || null,
        [cuentas, cuentaAcreditarId]
    );

    const isInterEmpresa = useMemo(() => {
        if (!selectedDebitAcc || !selectedCreditAcc) return false;
        const empA = String(selectedDebitAcc.id_empresa || selectedDebitAcc.empresa_codigo || '');
        const empB = String(selectedCreditAcc.id_empresa || selectedCreditAcc.empresa_codigo || '');
        return Boolean(empA && empB && empA !== empB);
    }, [selectedDebitAcc, selectedCreditAcc]);

    const montoNum = useMemo(() => {
        const n = Number(monto);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }, [monto]);

    const projectedDebitSaldo = useMemo(() => {
        if (!debitResumen) return null;
        return Number(debitResumen.saldo_chequera || 0) - montoNum;
    }, [debitResumen, montoNum]);

    const projectedCreditSaldo = useMemo(() => {
        if (!creditResumen) return null;
        return Number(creditResumen.saldo_chequera || 0) + montoNum;
    }, [creditResumen, montoNum]);

    // Manejo de comprobantes y OCR
    const runOcrAnalysis = useCallback(async (dataUrl, mimeType = 'image/webp') => {
        if (!dataUrl || analyzingOcr) return;
        setAnalyzingOcr(true);
        try {
            const res = await api.post('/bancos/movimientos/analizar-comprobante', {
                data_url: dataUrl,
                mime_type: mimeType
            });
            const ext = res.data?.extracted;
            if (!ext) return;
            setLastOcrResult(ext);
            const filled = [];
            if (ext.monto && Number(ext.monto) > 0 && !dirtyFieldsRef.current.has('monto')) {
                setMonto(String(Number(ext.monto).toFixed(2)));
                filled.push(`Monto ${moneyFmt(ext.monto)}`);
            }
            if (ext.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ext.fecha) && !dirtyFieldsRef.current.has('fecha')) {
                setFecha(ext.fecha);
                filled.push(`Fecha ${ext.fecha}`);
            }
            if (ext.referencia && !dirtyFieldsRef.current.has('documento')) {
                setDocumento(String(ext.referencia).toUpperCase().slice(0, 100));
                filled.push(`Ref. #${ext.referencia}`);
            }
            if (filled.length > 0) {
                addToast(`OCR detectó: ${filled.join(' · ')}`, 'success');
            } else {
                addToast('Comprobante analizado con OCR', 'info');
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'No se pudo analizar el comprobante con IA', 'warning');
        } finally {
            setAnalyzingOcr(false);
        }
    }, [analyzingOcr, addToast]);

    const processFilesList = useCallback(async (fileList) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (files.length === 0) return;
        if (pendingReceiptsRef.current.length + files.length > 10) {
            addToast('Máximo 10 comprobantes por transferencia.', 'warning');
            return;
        }
        setCompressingFiles(true);
        try {
            const compressedBatch = [];
            for (const f of files) {
                try {
                    const c = await compressReceiptFile(f);
                    compressedBatch.push({ ...c, nota: '' });
                } catch (err) {
                    addToast(err.message || `Error procesando ${f.name}`, 'warning');
                }
            }
            if (compressedBatch.length === 0) return;
            const deduped = deduplicateReceiptBatch(pendingReceiptsRef.current, compressedBatch);
            setPendingReceipts(prev => [...prev, ...deduped]);
            const firstItem = deduped[0];
            if (autoOcrEnabled && firstItem && pendingReceiptsRef.current.length === 0 && !lastOcrResult) {
                runOcrAnalysis(firstItem.data_url, firstItem.mime_type);
            }
        } finally {
            setCompressingFiles(false);
        }
    }, [addToast, autoOcrEnabled, lastOcrResult, runOcrAnalysis]);

    // Listener global Ctrl+V con guard estricto para modales encima
    useEffect(() => {
        const handlePaste = (e) => {
            if (viewerOpen || previewOpen || confirmOpenRef.current) return;
            const items = e.clipboardData?.items;
            if (!items) return;
            const pastedFiles = [];
            for (const item of items) {
                if (item.kind === 'file') {
                    const f = item.getAsFile();
                    if (f && (f.type.startsWith('image/') || f.type === 'application/pdf')) {
                        pastedFiles.push(f);
                    }
                }
            }
            if (pastedFiles.length > 0) {
                e.preventDefault();
                processFilesList(pastedFiles);
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [viewerOpen, previewOpen, processFilesList]);

    const handleSwapAccounts = () => {
        const prevDebId = cuentaDebitarId;
        const prevDebEmp = empresaDebitar;
        setCuentaDebitarId(cuentaAcreditarId);
        setEmpresaDebitar(empresaAcreditar);
        setCuentaAcreditarId(prevDebId);
        setEmpresaAcreditar(prevDebEmp);
    };

    const handleResetForm = useCallback((keepDebitAcc = true) => {
        dirtyFieldsRef.current.clear();
        setFormError('');
        if (!keepDebitAcc) {
            setCuentaDebitarId('');
            setEmpresaDebitar('');
        }
        setCuentaAcreditarId('');
        setEmpresaAcreditar('');
        setFecha(getSvTodayYMD());
        setAplicarAlGuardar(false);
        setFechaAplicado(getSvTodayYMD());
        setConceptoGeneral('MOVIMIENTO POR TRANSFERENCIA BANCARIA');
        setConceptoDetalle('');
        setDocumento('');
        setMonto('');
        setTipoPartida('');
        setNumPartida('');
        setCodCta('');
        setPendingReceipts([]);
        setLastOcrResult(null);
        fetchNextCorrelativo();
    }, [fetchNextCorrelativo]);

    // Generar PDF Carta oficial del comprobante de transferencia interna (ReportPreviewModal)
    const openTransferPdfPreview = useCallback((tr) => {
        if (!tr) return;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
        const pageW = doc.internal.pageSize.getWidth();
        const code = tr.transfer_group_id || tr.codigo_transferencia || 'TFB';

        doc.setFillColor(15, 23, 42);
        doc.rect(14, 14, pageW - 28, 24, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('COMPROBANTE DE TRANSFERENCIA INTERNA BANCARIA', 19, 24);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.text(`Correlativo: ${code}   |   Referencia: ${tr.documento || code}   |   Fecha: ${tr.fecha_display || tr.fecha_ymd || '-'}`, 19, 32);

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Monto Total Transferido: ${moneyFmt(tr.monto)}`, 14, 48);
        doc.setFont('helvetica', 'normal');
        doc.text(`Tipo de Operación: ${tr.intercompany ? 'Transferencia Inter-Empresa' : 'Transferencia Misma Empresa'}`, pageW - 14, 48, { align: 'right' });

        if (tr.num_partida || tr.cod_cta) {
            doc.setFontSize(9);
            doc.text(
                `${tr.num_partida ? `Partida: ${tr.num_partida}` : ''}${tr.num_partida && tr.cod_cta ? '   ·   ' : ''}${tr.cod_cta ? `Cód. Cta: ${tr.cod_cta}` : ''}`,
                14,
                55
            );
        }

        const deb = tr.debito || {};
        const cred = tr.credito || {};
        autoTable(doc, {
            startY: tr.num_partida || tr.cod_cta ? 61 : 55,
            head: [['Rol en Transferencia', 'Empresa', 'Banco / Cuenta Bancaria', 'Estado Conciliación', 'Cargo (Débito)', 'Abono (Crédito)']],
            body: [
                [
                    'CUENTA ORIGEN (DEBITADA)',
                    deb.empresa_nombre || '-',
                    `${deb.banco_nombre || ''} #${deb.numero_cuenta || ''} (${deb.cuenta_nombre || ''})`,
                    deb.conciliado ? `Conciliado (${deb.fecha_aplicado_display || deb.fecha_aplicado_ymd})` : 'Pendiente en Tránsito',
                    moneyFmt(deb.cargo || tr.monto),
                    '$0.00'
                ],
                [
                    'CUENTA DESTINO (ACREDITADA)',
                    cred.empresa_nombre || '-',
                    `${cred.banco_nombre || ''} #${cred.numero_cuenta || ''} (${cred.cuenta_nombre || ''})`,
                    cred.conciliado ? `Conciliado (${cred.fecha_aplicado_display || cred.fecha_aplicado_ymd})` : 'Pendiente en Tránsito',
                    '$0.00',
                    moneyFmt(cred.abono || tr.monto)
                ]
            ],
            theme: 'grid',
            headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8.5 },
            bodyStyles: { fontSize: 8.5, cellPadding: 3 },
            columnStyles: {
                4: { halign: 'right', fontStyle: 'bold' },
                5: { halign: 'right', fontStyle: 'bold' }
            }
        });

        const afterTableY = (doc.lastAutoTable?.finalY || 110) + 10;
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.text('Concepto / Detalle:', 14, afterTableY);
        doc.setFont('helvetica', 'normal');
        const splitConcepto = doc.splitTextToSize(tr.concepto || 'MOVIMIENTO POR TRANSFERENCIA BANCARIA', pageW - 28);
        doc.text(splitConcepto, 14, afterTableY + 6);

        const blob = doc.output('blob');
        setPreviewPdfBlob(blob);
        setPreviewMeta({
            title: `Comprobante de Transferencia ${code}`,
            subtitle: `${deb.banco_nombre || ''} #${deb.numero_cuenta || ''} → ${cred.banco_nombre || ''} #${cred.numero_cuenta || ''} · ${moneyFmt(tr.monto)}`,
            badge: tr.intercompany ? 'INTER-EMPRESA' : 'MISMA EMPRESA',
            fileName: `${code}.pdf`
        });
        setPreviewOpen(true);
    }, []);

    const submitTransfer = async ({ openPdfAfter = false } = {}) => {
        if (submitting) return;
        setFormError('');

        if (!cuentaDebitarId || !cuentaAcreditarId) {
            addToast('Debe seleccionar tanto la Cuenta a Debitar como la Cuenta a Acreditar', 'warning');
            return;
        }
        if (String(cuentaDebitarId) === String(cuentaAcreditarId)) {
            addToast('La Cuenta a Debitar y la Cuenta a Acreditar no pueden ser la misma', 'warning');
            return;
        }
        if (montoNum <= 0) {
            addToast('El monto de la transacción debe ser mayor a $0.00', 'warning');
            return;
        }
        if (projectedDebitSaldo !== null && projectedDebitSaldo < 0) {
            const proceed = await safeConfirm(
                `El saldo proyectado de la cuenta origen quedará negativo (${moneyFmt(projectedDebitSaldo)}). ¿Deseas registrar la transferencia de todos modos?`,
                { variant: 'warning' }
            );
            if (!proceed) return;
        }

        setSubmitting(true);
        try {
            const cleanCode = String(codigoTransferencia || '').trim().toUpperCase();
            const payload = {
                cuenta_debitar_id: Number(cuentaDebitarId),
                cuenta_acreditar_id: Number(cuentaAcreditarId),
                fecha,
                fecha_aplicado: aplicarAlGuardar ? (fechaAplicado || fecha) : null,
                documento: String(documento || '').trim().toUpperCase(),
                concepto: String(conceptoGeneral || '').trim().toUpperCase(),
                concepto_detalle: String(conceptoDetalle || '').trim().toUpperCase(),
                monto: montoNum,
                tipo_partida: String(tipoPartida || '').trim().toUpperCase(),
                num_partida: String(numPartida || '').trim().toUpperCase(),
                cod_cta: String(codCta || '').trim().toUpperCase(),
                ...(cleanCode ? { codigo_transferencia: cleanCode } : {}),
                ...(pendingReceipts.length > 0 ? {
                    comprobantes: pendingReceipts.map(r => ({
                        data_url: r.data_url,
                        nombre_original: r.nombre_original,
                        ancho: r.ancho,
                        alto: r.alto,
                        nota: r.nota || '',
                        ocr_json: lastOcrResult || null
                    }))
                } : {})
            };

            const res = await api.post('/bancos/transferencias', payload, {
                headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
            });
            const assignedCode = res.data?.transfer_group_id || res.data?.codigo_transferencia || cleanCode;
            addToast(
                `${res.data?.message || 'Transferencia registrada'} (${assignedCode})`,
                'success'
            );

            if (selectedDebitAcc) {
                saveBancosSelection({
                    empresaId: selectedDebitAcc.id_empresa || selectedDebitAcc.empresa_codigo,
                    cuentaId: selectedDebitAcc.corr || selectedDebitAcc.id,
                    numeroCuenta: selectedDebitAcc.numero
                });
            }

            if (openPdfAfter) {
                const fullConcept = [conceptoGeneral, conceptoDetalle].map(s => String(s || '').trim().toUpperCase()).filter(Boolean).join(' — ');
                openTransferPdfPreview({
                    transfer_group_id: assignedCode,
                    fecha_ymd: fecha,
                    fecha_display: fecha,
                    documento: String(documento || '').trim().toUpperCase() || assignedCode,
                    concepto: fullConcept || 'MOVIMIENTO POR TRANSFERENCIA BANCARIA',
                    monto: montoNum,
                    num_partida: [tipoPartida, numPartida].map(s => String(s || '').trim().toUpperCase()).filter(Boolean).join(' '),
                    cod_cta: codCta,
                    intercompany: Boolean(res.data?.intercompany ?? isInterEmpresa),
                    debito: {
                        empresa_nombre: selectedDebitAcc?.empresa_nombre,
                        banco_nombre: selectedDebitAcc?.banco_nombre,
                        numero_cuenta: selectedDebitAcc?.numero,
                        cuenta_nombre: selectedDebitAcc?.nombre,
                        conciliado: aplicarAlGuardar,
                        fecha_aplicado_ymd: aplicarAlGuardar ? (fechaAplicado || fecha) : null,
                        cargo: montoNum
                    },
                    credito: {
                        empresa_nombre: selectedCreditAcc?.empresa_nombre,
                        banco_nombre: selectedCreditAcc?.banco_nombre,
                        numero_cuenta: selectedCreditAcc?.numero,
                        cuenta_nombre: selectedCreditAcc?.nombre,
                        conciliado: aplicarAlGuardar,
                        fecha_aplicado_ymd: aplicarAlGuardar ? (fechaAplicado || fecha) : null,
                        abono: montoNum
                    }
                });
            }

            handleResetForm(true);
            fetchCuentaResumen(cuentaDebitarId, setDebitResumen, setLoadingDebitResumen);
            fetchCuentaResumen(cuentaAcreditarId, setCreditResumen, setLoadingCreditResumen);
            fetchTransferencias();
        } catch (err) {
            const msg = err.response?.data?.message || 'Error al registrar transferencia interna';
            setFormError(msg);
            addToast(msg, err.response?.status === 423 ? 'warning' : 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteTransfer = async (tr) => {
        if (!tr?.transfer_group_id) return;
        const ok = await safeConfirm(
            `¿Estás seguro de eliminar la transferencia interna ${tr.transfer_group_id} (${moneyFmt(tr.monto)})? Se anularán ambos movimientos (Origen y Destino).`,
            { variant: 'danger' }
        );
        if (!ok) return;

        try {
            const res = await api.delete(`/bancos/transferencias/${encodeURIComponent(tr.transfer_group_id)}`);
            addToast(res.data?.message || 'Transferencia interna eliminada', 'success');
            fetchTransferencias();
            fetchCuentaResumen(cuentaDebitarId, setDebitResumen, setLoadingDebitResumen);
            fetchCuentaResumen(cuentaAcreditarId, setCreditResumen, setLoadingCreditResumen);
        } catch (err) {
            addToast(err.response?.data?.message || 'No se pudo eliminar la transferencia interna', 'error');
        }
    };

    const handleExportExcel = () => {
        if (transferencias.length === 0) {
            addToast('No hay transferencias para exportar', 'warning');
            return;
        }
        const rows = transferencias.map(t => ({
            Correlativo: t.transfer_group_id,
            Fecha: t.fecha_display || t.fecha_ymd,
            Referencia: t.documento || '',
            'Empresa Origen': t.debito?.empresa_nombre || '',
            'Cuenta Debitar': t.debito ? `${t.debito.banco_nombre} #${t.debito.numero_cuenta} (${t.debito.cuenta_nombre})` : '',
            'Estado Débito': t.debito?.conciliado ? `Conciliado (${t.debito.fecha_aplicado_display || ''})` : 'Pendiente',
            'Empresa Destino': t.credito?.empresa_nombre || '',
            'Cuenta Acreditar': t.credito ? `${t.credito.banco_nombre} #${t.credito.numero_cuenta} (${t.credito.cuenta_nombre})` : '',
            'Estado Crédito': t.credito?.conciliado ? `Conciliado (${t.credito.fecha_aplicado_display || ''})` : 'Pendiente',
            'Tipo': t.intercompany ? 'Inter-Empresa' : 'Misma Empresa',
            Monto: Number(t.monto || 0),
            Concepto: t.concepto || '',
            Partida: t.num_partida || ''
        }));
        const ws = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(rows));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transferencias Internas');
        XLSX.writeFile(wb, `Transferencias_Internas_${filters.desde || todayStr}_${filters.hasta || todayStr}.xlsx`);
        addToast('Archivo Excel exportado con éxito', 'success');
    };

    const renderEstadoBadge = (estado) => {
        if (estado === 'AMBAS_CONCILIADAS') {
            return (
                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.16)', color: '#34d399', fontWeight: 700 }}>
                    Ambas Conciliadas
                </span>
            );
        }
        if (estado === 'SOLO_DEBITO' || estado === 'SOLO_CREDITO') {
            return (
                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.16)', color: '#93c5fd', fontWeight: 700 }}>
                    {estado === 'SOLO_DEBITO' ? 'Solo Débito Conciliado' : 'Solo Crédito Conciliado'}
                </span>
            );
        }
        return (
            <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', fontWeight: 700 }}>
                Pendiente en Ambas
            </span>
        );
    };

    const cuentasFiltroOptions = useMemo(() => {
        const list = filters.empresa_id
            ? cuentas.filter(c => String(c.id_empresa || c.empresa_codigo || '') === String(filters.empresa_id))
            : cuentas;
        return sortCuentas(list);
    }, [cuentas, filters.empresa_id]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: '0.25rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.25rem', margin: 0 }}>
                        <ArrowRightLeft size={22} color="var(--primary)" /> Transferencias Internas entre Cuentas
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                        Registro dual (Débito / Crédito) enlazado por correlativo único para traslados internos e inter-empresa.
                    </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                        type="button"
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        onClick={() => navigateToBancosTarget(navigate, 'movimientos', selectedDebitAcc ? {
                            empresaId: selectedDebitAcc.id_empresa || selectedDebitAcc.empresa_codigo,
                            cuentaId: selectedDebitAcc.corr || selectedDebitAcc.id,
                            numeroCuenta: selectedDebitAcc.numero
                        } : {})}
                    >
                        <Landmark size={15} /> Ir a Movimientos
                    </button>
                    <button
                        type="button"
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        onClick={() => navigateToBancosTarget(navigate, 'conciliacion', selectedDebitAcc ? {
                            empresaId: selectedDebitAcc.id_empresa || selectedDebitAcc.empresa_codigo,
                            cuentaId: selectedDebitAcc.corr || selectedDebitAcc.id,
                            numeroCuenta: selectedDebitAcc.numero
                        } : {})}
                    >
                        <Scale size={15} /> Ir a Conciliación
                    </button>
                </div>
            </div>

            {/* Panel 1: Formulario de Registro de Transferencia */}
            <form
                onSubmit={(e) => { e.preventDefault(); submitTransfer({ openPdfAfter: false }); }}
                className="card glass"
                style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.55rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.92rem' }}>
                        <FileText size={16} color="var(--primary)" />
                        <span>Registro de Transferencia Bancaria</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {selectedDebitAcc && selectedCreditAcc && String(cuentaDebitarId) !== String(cuentaAcreditarId) && (
                            <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 800,
                                padding: '0.2rem 0.55rem',
                                borderRadius: '999px',
                                background: isInterEmpresa ? 'rgba(139, 92, 246, 0.2)' : 'rgba(16, 185, 129, 0.16)',
                                color: isInterEmpresa ? '#c4b5fd' : '#34d399',
                                border: `1px solid ${isInterEmpresa ? 'rgba(139, 92, 246, 0.4)' : 'rgba(16, 185, 129, 0.35)'}`
                            }}>
                                {isInterEmpresa ? '⇄ TRANSFERENCIA INTER-EMPRESA' : '⇄ MISMA EMPRESA'}
                            </span>
                        )}
                        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 800, color: '#93c5fd', background: 'rgba(59, 130, 246, 0.14)', padding: '0.2rem 0.55rem', borderRadius: '4px' }}>
                            {codigoTransferencia || 'TFB000000000001'}
                        </span>
                    </div>
                </div>

                {formError && (
                    <div style={{
                        padding: '0.55rem 0.8rem',
                        borderRadius: 'var(--border-radius)',
                        background: 'rgba(239, 68, 68, 0.14)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: '#fca5a5',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem'
                    }}>
                        <AlertCircle size={15} />
                        <span>{formError}</span>
                    </div>
                )}

                {/* Fila Cabecera Contable (Correlativo TFB, Partida, Tipo de Partida, Cód Cta) */}
                <div className="form-grid form-grid-3" style={{ gap: '0.75rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            Correlativo Transferencia
                        </label>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <input
                                type="text"
                                value={codigoTransferencia}
                                onChange={e => setCodigoTransferencia(e.target.value.toUpperCase())}
                                placeholder="TFB000000000001"
                                style={{ flex: 1, height: '36px', fontSize: '0.825rem', fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }}
                            />
                            <button
                                type="button"
                                onClick={fetchNextCorrelativo}
                                disabled={loadingCorrelativo}
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 0.6rem', fontSize: '0.78rem' }}
                                title="Regenerar siguiente correlativo TFB"
                            >
                                <RefreshCw size={14} className={loadingCorrelativo ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            Correlativo Partida
                        </label>
                        <input
                            type="text"
                            value={numPartida}
                            onChange={e => setNumPartida(e.target.value.toUpperCase())}
                            placeholder="Ej. P-000125"
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', textTransform: 'uppercase' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                Tipo de Partida
                            </label>
                            <input
                                type="text"
                                value={tipoPartida}
                                onChange={e => setTipoPartida(e.target.value.toUpperCase())}
                                placeholder="Ej. DIARIO / EGR"
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', textTransform: 'uppercase' }}
                            />
                        </div>
                        <div style={{ width: '115px' }}>
                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                Cód. Cta
                            </label>
                            <input
                                type="text"
                                value={codCta}
                                onChange={e => setCodCta(e.target.value.toUpperCase())}
                                placeholder="1102-01"
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', textTransform: 'uppercase' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Selección de Cuentas (Debitar y Acreditar) */}
                <div className="form-grid form-grid-2" style={{ gap: '0.85rem' }}>
                    {/* Cuenta a Debitar */}
                    <div style={{
                        padding: '0.75rem 0.9rem',
                        borderRadius: 'var(--border-radius)',
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.28)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                Cuenta a Debitar (Origen / Salida)
                            </span>
                            {selectedDebitAcc && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    <Building2 size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                                    {selectedDebitAcc.empresa_nombre}
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <select
                                value={empresaDebitar}
                                onChange={e => {
                                    setEmpresaDebitar(e.target.value);
                                    setCuentaDebitarId('');
                                }}
                                style={{ flex: '1 1 130px', height: '36px', fontSize: '0.8rem' }}
                                title="Filtrar cuenta origen por empresa"
                            >
                                <option value="">Todas las empresas</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                            <select
                                value={cuentaDebitarId}
                                onChange={e => setCuentaDebitarId(e.target.value)}
                                disabled={loadingCatalogs}
                                required
                                style={{ flex: '2 1 220px', height: '36px', fontSize: '0.82rem', fontWeight: 600 }}
                            >
                                <option value="">-- Seleccionar Cuenta a Debitar --</option>
                                {cuentasDebitarOptions.map(c => (
                                    <option key={c.corr || c.id} value={c.corr || c.id}>
                                        {formatCuentaLabel(c)}{!empresaDebitar && c.empresa_nombre ? ` [${c.empresa_nombre}]` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <span>
                                Saldo Chequera:{' '}
                                <strong style={{ color: 'var(--text)' }}>
                                    {loadingDebitResumen ? 'Cargando...' : debitResumen ? moneyFmt(debitResumen.saldo_chequera) : '--'}
                                </strong>
                            </span>
                            {projectedDebitSaldo !== null && montoNum > 0 && (
                                <span style={{ color: projectedDebitSaldo < 0 ? '#f87171' : '#93c5fd', fontWeight: 700 }}>
                                    Tras débito: {moneyFmt(projectedDebitSaldo)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Cuenta a Acreditar */}
                    <div style={{
                        padding: '0.75rem 0.9rem',
                        borderRadius: 'var(--border-radius)',
                        background: 'rgba(16, 185, 129, 0.05)',
                        border: '1px solid rgba(16, 185, 129, 0.28)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                Cuenta a Acreditar (Destino / Entrada)
                            </span>
                            <button
                                type="button"
                                onClick={handleSwapAccounts}
                                className="btn-secondary"
                                style={{ height: '24px', padding: '0 0.5rem', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                                title="Intercambiar cuenta origen y destino"
                            >
                                <ArrowRightLeft size={12} /> Intercambiar
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <select
                                value={empresaAcreditar}
                                onChange={e => {
                                    setEmpresaAcreditar(e.target.value);
                                    setCuentaAcreditarId('');
                                }}
                                style={{ flex: '1 1 130px', height: '36px', fontSize: '0.8rem' }}
                                title="Filtrar cuenta destino por empresa"
                            >
                                <option value="">Todas las empresas</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                            <select
                                value={cuentaAcreditarId}
                                onChange={e => setCuentaAcreditarId(e.target.value)}
                                disabled={loadingCatalogs}
                                required
                                style={{ flex: '2 1 220px', height: '36px', fontSize: '0.82rem', fontWeight: 600 }}
                            >
                                <option value="">-- Seleccionar Cuenta a Acreditar --</option>
                                {cuentasAcreditarOptions.map(c => (
                                    <option key={c.corr || c.id} value={c.corr || c.id}>
                                        {formatCuentaLabel(c)}{!empresaAcreditar && c.empresa_nombre ? ` [${c.empresa_nombre}]` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <span>
                                Saldo Chequera:{' '}
                                <strong style={{ color: 'var(--text)' }}>
                                    {loadingCreditResumen ? 'Cargando...' : creditResumen ? moneyFmt(creditResumen.saldo_chequera) : '--'}
                                </strong>
                            </span>
                            {projectedCreditSaldo !== null && montoNum > 0 && (
                                <span style={{ color: '#34d399', fontWeight: 700 }}>
                                    Tras crédito: {moneyFmt(projectedCreditSaldo)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tipo Movimiento, Fechas, Concepto, Referencia y Monto */}
                <div className="form-grid form-grid-3" style={{ gap: '0.75rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            Tipo Movimiento
                        </label>
                        <input
                            type="text"
                            value="TRANSFERENCIA (TR)"
                            readOnly
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', fontWeight: 700, opacity: 0.85, cursor: 'not-allowed' }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            Fecha Movimiento
                        </label>
                        <input
                            type="date"
                            value={fecha}
                            onChange={e => { markDirty('fecha'); setFecha(e.target.value); }}
                            required
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>

                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                            <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                Fecha Aplicado
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.74rem', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={aplicarAlGuardar}
                                    onChange={e => {
                                        setAplicarAlGuardar(e.target.checked);
                                        if (e.target.checked && !fechaAplicado) setFechaAplicado(fecha || todayStr);
                                    }}
                                    style={{ width: '15px', height: '15px' }}
                                />
                                Conciliar al guardar
                            </label>
                        </div>
                        <input
                            type="date"
                            value={aplicarAlGuardar ? fechaAplicado : ''}
                            disabled={!aplicarAlGuardar}
                            onChange={e => setFechaAplicado(e.target.value)}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', opacity: aplicarAlGuardar ? 1 : 0.55 }}
                        />
                    </div>

                    <div className="span-2">
                        <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            Concepto General / Detalle
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                value={conceptoGeneral}
                                onChange={e => setConceptoGeneral(e.target.value.toUpperCase())}
                                placeholder="MOVIMIENTO POR TRANSFERENCIA BANCARIA"
                                style={{ flex: '1 1 210px', height: '36px', fontSize: '0.825rem', textTransform: 'uppercase' }}
                            />
                            <input
                                type="text"
                                value={conceptoDetalle}
                                onChange={e => setConceptoDetalle(e.target.value.toUpperCase())}
                                placeholder="Detalle adicional (opcional)..."
                                style={{ flex: '1 1 200px', height: '36px', fontSize: '0.825rem', textTransform: 'uppercase' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                Número Referencia
                            </label>
                            <input
                                type="text"
                                value={documento}
                                onChange={e => { markDirty('documento'); setDocumento(e.target.value.toUpperCase()); }}
                                placeholder="Ref / Transfer365"
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', textTransform: 'uppercase', fontFamily: 'monospace' }}
                            />
                        </div>
                        <div style={{ width: '130px' }}>
                            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                Monto ($)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={monto}
                                onChange={e => { markDirty('monto'); setMonto(e.target.value); }}
                                placeholder="0.00"
                                required
                                style={{ width: '100%', height: '36px', fontSize: '0.9rem', fontWeight: 800, textAlign: 'right' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Zona de Comprobante (Ctrl+V / Drag & Drop / OCR) */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        processFilesList(e.dataTransfer?.files);
                    }}
                    style={{
                        padding: '0.65rem 0.9rem',
                        borderRadius: 'var(--border-radius)',
                        border: `1px dashed ${isDragging ? 'var(--primary)' : 'var(--border)'}`,
                        background: isDragging ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255,255,255,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <Paperclip size={15} color="var(--primary)" />
                            <span>
                                <strong>Comprobante de transferencia</strong> · Pega con <kbd style={{ padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)' }}>Ctrl+V</kbd>, arrastra o selecciona imagen/PDF
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={autoOcrEnabled}
                                    onChange={e => setAutoOcrEnabled(e.target.checked)}
                                    style={{ width: '15px', height: '15px' }}
                                />
                                <Sparkles size={13} color="#fbbf24" /> Auto-OCR IA
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/*,application/pdf"
                                onChange={e => { processFilesList(e.target.files); e.target.value = ''; }}
                                style={{ display: 'none' }}
                            />
                            <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={e => { processFilesList(e.target.files); e.target.value = ''; }}
                                style={{ display: 'none' }}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={compressingFiles}
                                className="btn-secondary"
                                style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Upload size={13} /> {compressingFiles ? 'Procesando...' : 'Archivo'}
                            </button>
                            <button
                                type="button"
                                onClick={() => cameraInputRef.current?.click()}
                                disabled={compressingFiles}
                                className="btn-secondary"
                                style={{ height: '30px', padding: '0 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                                <Camera size={13} /> Cámara
                            </button>
                            {analyzingOcr && (
                                <span style={{ fontSize: '0.74rem', color: '#93c5fd', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <RefreshCw size={13} className="animate-spin" /> Leyendo comprobante...
                                </span>
                            )}
                        </div>
                    </div>

                    {pendingReceipts.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {pendingReceipts.map((r, idx) => (
                                <div
                                    key={`${r.nombre_original}-${idx}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: '0.28rem 0.5rem',
                                        borderRadius: '6px',
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.74rem'
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setViewerItems(pendingReceipts);
                                            setViewerIdx(idx);
                                            setViewerTitle('Comprobante de Transferencia');
                                            setViewerOpen(true);
                                        }}
                                        style={{ background: 'none', border: 'none', padding: 0, color: '#93c5fd', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        {r.nombre_original}
                                    </button>
                                    <span style={{ color: 'var(--text-muted)' }}>({formatBytes(r.tamano_bytes || 0)})</span>
                                    <button
                                        type="button"
                                        onClick={() => runOcrAnalysis(r.data_url, r.mime_type)}
                                        disabled={analyzingOcr}
                                        style={{ background: 'none', border: 'none', padding: 0, color: '#fbbf24', cursor: 'pointer' }}
                                        title="Analizar con OCR IA"
                                    >
                                        <Sparkles size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPendingReceipts(prev => prev.filter((_, i) => i !== idx))}
                                        style={{ background: 'none', border: 'none', padding: 0, color: '#f87171', cursor: 'pointer' }}
                                        title="Quitar comprobante"
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Barra de impacto y botones de acción */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.25rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', fontSize: '0.8rem', alignItems: 'center' }}>
                        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.12)', color: '#fca5a5', fontWeight: 700 }}>
                            Débito: {moneyFmt(montoNum)}
                        </span>
                        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', color: '#6ee7b7', fontWeight: 700 }}>
                            Crédito: {moneyFmt(montoNum)}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => handleResetForm(true)}
                            disabled={submitting}
                            className="btn-secondary"
                            style={{ height: '36px', padding: '0 0.9rem', fontSize: '0.825rem' }}
                        >
                            Limpiar
                        </button>
                        <button
                            type="button"
                            onClick={() => submitTransfer({ openPdfAfter: true })}
                            disabled={submitting}
                            className="btn-secondary"
                            style={{ height: '36px', padding: '0 0.95rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <Printer size={15} /> Guardar y Previsualizar PDF
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="btn-primary"
                            style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.825rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <Save size={15} /> {submitting ? 'Registrando...' : 'Registrar Transferencia'}
                        </button>
                    </div>
                </div>
            </form>

            {/* KPIs Históricos */}
            <div className="form-grid form-grid-3" style={{ gap: '0.75rem' }}>
                <div className="card glass" style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Transferencias en Período</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '0.15rem' }}>
                        {resumenHist.total_transferencias} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#93c5fd' }}>({moneyFmt(resumenHist.monto_total)})</span>
                    </div>
                </div>
                <div className="card glass" style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Traslados Inter-Empresa</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#c4b5fd', marginTop: '0.15rem' }}>
                        {resumenHist.interempresa_count}
                    </div>
                </div>
                <div className="card glass" style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Conciliación (Completa / Parcial / Pend.)</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: '0.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#34d399' }}>✓ {resumenHist.ambas_conciliadas}</span>
                        <span style={{ color: '#93c5fd' }}>◐ {resumenHist.parciales_count}</span>
                        <span style={{ color: '#fbbf24' }}>⏳ {resumenHist.ambas_pendientes}</span>
                    </div>
                </div>
            </div>

            {/* Panel 2: Filtros e Historial */}
            <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
                    <div style={{ width: '132px' }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Desde</label>
                        <input
                            type="date"
                            value={filters.desde}
                            onChange={e => setFilters(prev => ({ ...prev, desde: e.target.value, page: 1 }))}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ width: '132px' }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Hasta</label>
                        <input
                            type="date"
                            value={filters.hasta}
                            onChange={e => setFilters(prev => ({ ...prev, hasta: e.target.value, page: 1 }))}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Empresa</label>
                        <select
                            value={filters.empresa_id}
                            onChange={e => setFilters(prev => ({ ...prev, empresa_id: e.target.value, cuenta_id: '', page: 1 }))}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="">Todas</option>
                            {empresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: '2 1 220px', minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Cuenta Bancaria</label>
                        <select
                            value={filters.cuenta_id}
                            onChange={e => setFilters(prev => ({ ...prev, cuenta_id: e.target.value, page: 1 }))}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="">Todas las cuentas</option>
                            {cuentasFiltroOptions.map(c => (
                                <option key={c.corr || c.id} value={c.corr || c.id}>
                                    {formatCuentaLabel(c)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Conciliación</label>
                        <select
                            value={filters.estado_conciliacion}
                            onChange={e => setFilters(prev => ({ ...prev, estado_conciliacion: e.target.value, page: 1 }))}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="TODOS">Todos los estados</option>
                            <option value="CONCILIADAS">Ambas Conciliadas</option>
                            <option value="PARCIALES">Parcialmente Conciliadas</option>
                            <option value="PENDIENTES">Pendientes en Ambas</option>
                            <option value="SIN_CONCILIAR">Cualquiera Pendiente</option>
                        </select>
                    </div>
                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Buscar</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                value={filters.search}
                                onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') fetchTransferencias({ ...filters, page: 1 }); }}
                                placeholder="TFB, referencia, cuenta..."
                                style={{ width: '100%', height: '36px', paddingLeft: '30px', fontSize: '0.825rem' }}
                            />
                        </div>
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer', height: '36px' }}>
                        <input
                            type="checkbox"
                            checked={filters.solo_interempresa}
                            onChange={e => setFilters(prev => ({ ...prev, solo_interempresa: e.target.checked, page: 1 }))}
                            style={{ width: '16px', height: '16px' }}
                        />
                        Solo Inter-Empresa
                    </label>
                    <button
                        type="button"
                        onClick={() => fetchTransferencias({ ...filters, page: 1 })}
                        className="btn-primary"
                        style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                        <Filter size={14} /> Filtrar
                    </button>
                    <button
                        type="button"
                        onClick={handleExportExcel}
                        className="btn-secondary"
                        style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                        <Download size={14} /> Excel
                    </button>
                </div>

                {/* Tabla */}
                <div className="table-responsive">
                    <table style={{ minWidth: '1050px', width: '100%', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Correlativo</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Fecha</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Cuenta Origen (Débito)</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Cuenta Destino (Crédito)</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Monto</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Estado Conciliación</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Adj.</th>
                                <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingList ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        Cargando historial de transferencias...
                                    </td>
                                </tr>
                            ) : transferencias.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        No se encontraron transferencias internas en el filtro seleccionado.
                                    </td>
                                </tr>
                            ) : transferencias.map(tr => (
                                <tr key={tr.transfer_group_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <td style={{ padding: '0.45rem 0.5rem', fontFamily: 'monospace', fontWeight: 700 }}>
                                        <div>{tr.transfer_group_id}</div>
                                        {tr.documento && tr.documento !== tr.transfer_group_id && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ref: {tr.documento}</div>
                                        )}
                                        {tr.intercompany && (
                                            <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', fontFamily: 'inherit' }}>
                                                Inter-Empresa
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                        <div>{tr.fecha_display || tr.fecha_ymd}</div>
                                        {tr.num_partida && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Partida: {tr.num_partida}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>
                                        {tr.debito ? (
                                            <div>
                                                <div style={{ fontWeight: 600 }}>
                                                    {tr.debito.banco_nombre} #{tr.debito.numero_cuenta}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {tr.debito.empresa_nombre} ·{' '}
                                                    <span style={{ color: tr.debito.conciliado ? '#34d399' : '#fbbf24' }}>
                                                        {tr.debito.conciliado ? `Conc. ${tr.debito.fecha_aplicado_display || ''}` : 'En Tránsito'}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : <span style={{ color: '#f87171' }}>Sin contraparte débito</span>}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem' }}>
                                        {tr.credito ? (
                                            <div>
                                                <div style={{ fontWeight: 600 }}>
                                                    {tr.credito.banco_nombre} #{tr.credito.numero_cuenta}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {tr.credito.empresa_nombre} ·{' '}
                                                    <span style={{ color: tr.credito.conciliado ? '#34d399' : '#fbbf24' }}>
                                                        {tr.credito.conciliado ? `Conc. ${tr.credito.fecha_aplicado_display || ''}` : 'En Tránsito'}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : <span style={{ color: '#f87171' }}>Sin contraparte crédito</span>}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                        {moneyFmt(tr.monto)}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                        {renderEstadoBadge(tr.estado_conciliacion)}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                        {tr.comprobantes_count > 0 || tr.signed_url ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const items = (tr.comprobantes && tr.comprobantes.length > 0)
                                                        ? tr.comprobantes
                                                        : [{ signed_url: tr.signed_url, nombre_original: `${tr.transfer_group_id}.webp` }];
                                                    setViewerItems(items);
                                                    setViewerIdx(0);
                                                    setViewerTitle(`Comprobantes ${tr.transfer_group_id}`);
                                                    setViewerOpen(true);
                                                }}
                                                className="btn-secondary"
                                                style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                title="Ver comprobantes"
                                            >
                                                <Paperclip size={12} /> {tr.comprobantes_count || 1}
                                            </button>
                                        ) : '-'}
                                    </td>
                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                        <div style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => openTransferPdfPreview(tr)}
                                                className="btn-secondary"
                                                style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.72rem' }}
                                                title="Previsualizar comprobante Carta (PDF)"
                                            >
                                                <Printer size={12} />
                                            </button>
                                            {tr.debito && (
                                                <button
                                                    type="button"
                                                    onClick={() => navigateToBancosTarget(navigate, 'conciliacion', {
                                                        empresaId: tr.debito.empresa_codigo || tr.debito.empresa_id,
                                                        cuentaId: tr.debito.cuenta_bancaria_id,
                                                        numeroCuenta: tr.debito.numero_cuenta
                                                    })}
                                                    className="btn-secondary"
                                                    style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.7rem' }}
                                                    title="Ir a Conciliación de Cuenta Origen"
                                                >
                                                    Conc. Orig.
                                                </button>
                                            )}
                                            {tr.credito && (
                                                <button
                                                    type="button"
                                                    onClick={() => navigateToBancosTarget(navigate, 'conciliacion', {
                                                        empresaId: tr.credito.empresa_codigo || tr.credito.empresa_id,
                                                        cuentaId: tr.credito.cuenta_bancaria_id,
                                                        numeroCuenta: tr.credito.numero_cuenta
                                                    })}
                                                    className="btn-secondary"
                                                    style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.7rem' }}
                                                    title="Ir a Conciliación de Cuenta Destino"
                                                >
                                                    Conc. Dest.
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                disabled={!tr.puede_eliminar}
                                                onClick={() => handleDeleteTransfer(tr)}
                                                className="btn-secondary"
                                                style={{
                                                    height: '26px',
                                                    padding: '0 0.45rem',
                                                    fontSize: '0.72rem',
                                                    color: tr.puede_eliminar ? '#f87171' : 'var(--text-muted)',
                                                    opacity: tr.puede_eliminar ? 1 : 0.45
                                                }}
                                                title={tr.puede_eliminar ? 'Eliminar transferencia (ambas patas)' : 'No eliminable: ya conciliada o contabilizada'}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {pagination.total_pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                            Página {pagination.page} de {pagination.total_pages} ({pagination.total} registros)
                        </span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                                type="button"
                                disabled={pagination.page <= 1}
                                onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                className="btn-secondary"
                                style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.78rem' }}
                            >
                                <ChevronLeft size={14} /> Anterior
                            </button>
                            <button
                                type="button"
                                disabled={pagination.page >= pagination.total_pages}
                                onClick={() => setFilters(prev => ({ ...prev, page: Math.min(pagination.total_pages, prev.page + 1) }))}
                                className="btn-secondary"
                                style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.78rem' }}
                            >
                                Siguiente <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <ReceiptViewerModal
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                comprobantes={viewerItems}
                initialIndex={viewerIdx}
                title={viewerTitle}
            />

            <ReportPreviewModal
                isOpen={previewOpen}
                onClose={() => setPreviewOpen(false)}
                title={previewMeta.title}
                subtitle={previewMeta.subtitle}
                badge={previewMeta.badge}
                pdfSource={previewPdfBlob}
                fileName={previewMeta.fileName}
            />
        </div>
    );
}
