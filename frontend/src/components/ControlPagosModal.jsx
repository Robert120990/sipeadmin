import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import api from '../services/api';
import Modal from './Modal';
import ReceiptViewerModal from './ReceiptViewerModal';
import MibotProgramarModal from './MibotProgramarModal';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { compressReceiptFile, formatBytes } from '../utils/receiptCompressor';
import { todayStr, formatDateDMY } from '../utils/date';
import {
    CreditCard, Building2, Banknote, FileText, Receipt, ArrowLeftRight,
    CheckCircle, Clock, Sparkles, Upload, Paperclip, Trash2, Edit, Save,
    Plus, X, Eye, ShieldCheck, Layers, Camera, User, Loader2, Bell
} from 'lucide-react';

const PAYMENT_METHOD_OPTIONS = [
    { id: 'TRANSFERENCIA', label: 'Transferencia', icon: ArrowLeftRight, category: 'BANCO', color: '#38bdf8' },
    { id: 'CHEQUE', label: 'Cheque', icon: FileText, category: 'BANCO', color: '#a78bfa' },
    { id: 'TARJETA_CREDITO', label: 'Tarjeta Crédito', icon: CreditCard, category: 'TARJETA', color: '#f59e0b' },
    { id: 'TARJETA_DEBITO', label: 'Tarjeta Débito', icon: CreditCard, category: 'TARJETA', color: '#fb923c' },
    { id: 'EFECTIVO', label: 'Efectivo / Caja', icon: Banknote, category: 'EFECTIVO', color: '#22c55e' },
    { id: 'NOTA_CREDITO', label: 'Nota de Crédito', icon: Receipt, category: 'DOCUMENTO', color: '#c084fc' },
    { id: 'REMISION', label: 'Remisión', icon: Layers, category: 'DOCUMENTO', color: '#2dd4bf' },
    { id: 'DEBITO_AUTOMATICO', label: 'Débito Auto.', icon: Building2, category: 'BANCO', color: '#60a5fa' },
    { id: 'DEPOSITO', label: 'Depósito', icon: Building2, category: 'BANCO', color: '#34d399' },
    { id: 'COMPENSACION', label: 'Compensación', icon: ArrowLeftRight, category: 'DOCUMENTO', color: '#94a3b8' }
];

const OPERATION_TYPES = [
    { id: 'CXP', label: 'CXP · Por Pagar', hint: 'Egreso en Flujo de Caja (saldo pendiente)', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)' },
    { id: 'CXC', label: 'CXC · Por Cobrar', hint: 'Ingreso esperado en Flujo de Caja', color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)' },
    { id: 'GASTO', label: 'Gasto Operativo', hint: 'Egreso operativo directo en Flujo de Caja', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.14)' }
];

const getMethodLabel = (id) => PAYMENT_METHOD_OPTIONS.find(m => m.id === id)?.label || id || 'Transferencia';
const getMethodCategory = (id) => PAYMENT_METHOD_OPTIONS.find(m => m.id === id)?.category || 'BANCO';

const mc = (val) => `$${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDateShort = (d) => {
    if (!d) return '—';
    return formatDateDMY(String(d).split('T')[0]);
};

export default function ControlPagosModal({
    open,
    onClose,
    vencimientoRow = null,
    cuentasBancarias = [],
    onSaved = null
}) {
    const { confirm } = useConfirm();
    const { addToast } = useToast();

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingOnly, setUploadingOnly] = useState(false);
    const [detail, setDetail] = useState(null);

    // Estado del formulario de abono / método
    const [editingAbonoId, setEditingAbonoId] = useState(null);
    const [tipoOperacion, setTipoOperacion] = useState('CXP');
    const [metodoPago, setMetodoPago] = useState('TRANSFERENCIA');
    const [cuentaBancariaId, setCuentaBancariaId] = useState('');
    const [cuentaLabel, setCuentaLabel] = useState('');
    const [tarjetaRef, setTarjetaRef] = useState('');
    const [beneficiario, setBeneficiario] = useState('');
    const [referenciaDoc, setReferenciaDoc] = useState('');
    const [fechaPago, setFechaPago] = useState(todayStr());
    const [montoAbono, setMontoAbono] = useState('');
    const [notas, setNotas] = useState('');

    // Comprobantes en cola + OCR inteligente (PDF o captura/foto)
    const [pendingReceipts, setPendingReceipts] = useState([]);
    const [compressingFiles, setCompressingFiles] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [autoOcrEnabled, setAutoOcrEnabled] = useState(true);
    const [analyzingOcr, setAnalyzingOcr] = useState(false);
    const [lastOcrResult, setLastOcrResult] = useState(null);
    const [editingCompId, setEditingCompId] = useState(null);
    const [editingCompNota, setEditingCompNota] = useState('');
    const [savingCompNota, setSavingCompNota] = useState(false);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);
    const extraFileInputRef = useRef(null);

    // Visor Lightbox de comprobantes
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerItems, setViewerItems] = useState([]);
    const [viewerIdx, setViewerIdx] = useState(0);

    // Programar aviso personal MiBot por Telegram
    const [mibotOpen, setMibotOpen] = useState(false);

    // Refs para evitar sobrescribir ediciones manuales o valores ya completados por OCR y para proteger paste en modales hijos
    const dirtyFieldsRef = useRef(new Set());
    const ocrAppliedFieldsRef = useRef(new Set());
    const formValuesRef = useRef({});
    const pendingReceiptsRef = useRef([]);
    const detailRef = useRef(null);
    const confirmOpenRef = useRef(false);
    const compressingCountRef = useRef(0);
    const inFlightUploadNamesRef = useRef(new Set());

    formValuesRef.current = {
        metodoPago,
        cuentaBancariaId,
        cuentaLabel,
        tarjetaRef,
        montoAbono,
        fechaPago,
        beneficiario,
        referenciaDoc,
        notas,
        editingAbonoId
    };
    pendingReceiptsRef.current = pendingReceipts;
    detailRef.current = detail;

    const markDirty = useCallback((...fields) => {
        fields.forEach(f => dirtyFieldsRef.current.add(f));
    }, []);

    const resetFieldTracking = useCallback(() => {
        dirtyFieldsRef.current.clear();
        ocrAppliedFieldsRef.current.clear();
    }, []);

    const resumen = useMemo(() => (detail?.resumen || {
        monto_total: Number(vencimientoRow?.monto || 0),
        monto_pagado: Number(vencimientoRow?.monto_pagado || 0),
        saldo_pendiente: Number(vencimientoRow?.saldo_pendiente ?? vencimientoRow?.monto ?? 0),
        porcentaje_pagado: Number(vencimientoRow?.porcentaje_pagado || 0),
        estado_pago: vencimientoRow?.estado_pago || vencimientoRow?.estado || 'PENDIENTE'
    }), [detail?.resumen, vencimientoRow]);

    const isFullyPaid = resumen.estado_pago === 'CANCELADO' || Number(resumen.saldo_pendiente || 0) <= 0;

    // Cuentas bancarias ordenadas con sortCuentas (incluye oficiales y contables SaaS)
    const sortedBankAccounts = useMemo(() => {
        return sortCuentas(cuentasBancarias || []);
    }, [cuentasBancarias]);

    const resolveNumericCuentaId = useCallback((val) => {
        const n = Number(val);
        return Number.isInteger(n) && n > 0 ? n : null;
    }, []);

    const ubicacionAccounts = useMemo(() => {
        const ubic = String(detail?.vencimiento?.ubicacion || vencimientoRow?.ubicacion || '').toUpperCase().trim();
        if (!ubic) return [];
        return sortedBankAccounts.filter(c => {
            if (Array.isArray(c.ubicacion_tags) && c.ubicacion_tags.some(t => ubic.includes(t) || t.includes(ubic))) {
                return true;
            }
            const blob = `${c.nombre || ''} ${c.empresa_nombre || ''} ${c.banco_nombre || ''}`.toUpperCase();
            return blob.includes(ubic);
        });
    }, [sortedBankAccounts, detail, vencimientoRow]);

    const loadDetail = useCallback(async (venId) => {
        if (!venId) return;
        setLoading(true);
        try {
            const res = await api.get(`/operaciones/recordatorios/vencimiento/${venId}/detalle`);
            const data = res.data;
            setDetail(data);
            setTipoOperacion(data?.meta?.tipo_operacion || data?.vencimiento?.tipo_operacion || 'CXP');

            const topSug = data?.sugerencias?.mas_usadas_similares?.[0] || null;
            const prefMethod = data?.meta?.metodo_pago_preferido || topSug?.metodo_pago || 'TRANSFERENCIA';
            const prefCuentaId = data?.meta?.cuenta_bancaria_id || topSug?.cuenta_bancaria_id || '';
            const prefCuentaLabel = data?.meta?.cuenta_label || topSug?.cuenta_label || '';
            const prefTarjeta = data?.meta?.tarjeta_ref || topSug?.tarjeta_ref || '';

            setMetodoPago(prefMethod);
            setCuentaBancariaId(prefCuentaId ? String(prefCuentaId) : '');
            setCuentaLabel(prefCuentaLabel || '');
            setTarjetaRef(prefTarjeta || '');

            const saldo = Number(data?.resumen?.saldo_pendiente ?? data?.vencimiento?.monto ?? 0);
            setMontoAbono(saldo > 0 ? saldo.toFixed(2) : '');
            setFechaPago(todayStr());
            setBeneficiario('');
            setReferenciaDoc('');
            setNotas('');
            setPendingReceipts([]);
            setLastOcrResult(null);
            setEditingAbonoId(null);
            setEditingCompId(null);
            setEditingCompNota('');
            resetFieldTracking();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar detalle de pagos', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, resetFieldTracking]);

    useEffect(() => {
        if (open && vencimientoRow?.id) {
            loadDetail(vencimientoRow.id);
        } else if (!open) {
            compressingCountRef.current = 0;
            inFlightUploadNamesRef.current.clear();
            setCompressingFiles(false);
            setDetail(null);
            setPendingReceipts([]);
            setLastOcrResult(null);
            setEditingAbonoId(null);
            setEditingCompId(null);
            setEditingCompNota('');
            resetFieldTracking();
        }
    }, [open, vencimientoRow?.id, loadDetail, resetFieldTracking]);

    // Aplica los campos extraídos por IA al formulario de abono sin sobrescribir ediciones manuales ni campos ya llenos por OCR previo
    const applyOcrAnalysisToForm = useCallback((an, { force = false } = {}) => {
        if (!an) return { filledFields: [], skippedFields: [] };
        const cur = formValuesRef.current || {};
        const filledFields = [];
        const skippedFields = [];

        const canApply = (field, isEmpty, allowDefaultOverwrite = false) => {
            if (force) return true;
            if (dirtyFieldsRef.current.has(field)) return false;
            if (ocrAppliedFieldsRef.current.has(field)) return false;
            if (isEmpty) return true;
            return allowDefaultOverwrite && !cur.editingAbonoId;
        };

        const markOcrOwned = (field) => {
            ocrAppliedFieldsRef.current.add(field);
            if (force) dirtyFieldsRef.current.delete(field);
        };

        if (an.metodo_pago) {
            if (canApply('metodoPago', !cur.metodoPago, true)) {
                setMetodoPago(an.metodo_pago);
                markOcrOwned('metodoPago');
                filledFields.push('método');
            } else {
                skippedFields.push('método');
            }
        }

        if (an.cuenta_bancaria_id) {
            if (canApply('cuentaBancariaId', !cur.cuentaBancariaId, true)) {
                setCuentaBancariaId(String(an.cuenta_bancaria_id));
                const found = sortedBankAccounts.find(c => Number(c.raw_id || c.id) === Number(an.cuenta_bancaria_id));
                setCuentaLabel(found ? formatCuentaLabel(found) : (an.cuenta_label || ''));
                markOcrOwned('cuentaBancariaId');
                markOcrOwned('cuentaLabel');
                filledFields.push('cuenta bancaria');
            } else {
                skippedFields.push('cuenta bancaria');
            }
        } else if (an.cuenta_label && an.metodo_pago === 'EFECTIVO') {
            if (canApply('cuentaLabel', !String(cur.cuentaLabel || '').trim(), true)) {
                setCuentaBancariaId('');
                setCuentaLabel(an.cuenta_label);
                markOcrOwned('cuentaLabel');
                filledFields.push('caja efectivo');
            } else {
                skippedFields.push('caja efectivo');
            }
        }

        if (an.tarjeta_ref) {
            if (canApply('tarjetaRef', !String(cur.tarjetaRef || '').trim(), true)) {
                setTarjetaRef(an.tarjeta_ref);
                markOcrOwned('tarjetaRef');
                filledFields.push('tarjeta');
            } else {
                skippedFields.push('tarjeta');
            }
        }

        if (an.monto && Number(an.monto) > 0) {
            if (canApply('montoAbono', !String(cur.montoAbono || '').trim(), true)) {
                setMontoAbono(Number(an.monto).toFixed(2));
                markOcrOwned('montoAbono');
                filledFields.push('monto');
            } else {
                skippedFields.push('monto');
            }
        }

        if (an.fecha_pago) {
            if (canApply('fechaPago', !cur.fechaPago, true)) {
                setFechaPago(an.fecha_pago);
                markOcrOwned('fechaPago');
                filledFields.push('fecha');
            } else {
                skippedFields.push('fecha');
            }
        }

        if (an.beneficiario) {
            if (canApply('beneficiario', !String(cur.beneficiario || '').trim(), false)) {
                setBeneficiario(an.beneficiario);
                markOcrOwned('beneficiario');
                filledFields.push('beneficiario');
            } else {
                skippedFields.push('beneficiario');
            }
        }

        if (an.referencia_doc) {
            if (canApply('referenciaDoc', !String(cur.referenciaDoc || '').trim(), false)) {
                setReferenciaDoc(an.referencia_doc);
                markOcrOwned('referenciaDoc');
                filledFields.push('referencia');
            } else {
                skippedFields.push('referencia');
            }
        }

        const ocrNota = an.notas_sugeridas || an.concepto || '';
        if (ocrNota) {
            if (canApply('notas', !String(cur.notas || '').trim(), false)) {
                setNotas(ocrNota);
                markOcrOwned('notas');
            } else {
                skippedFields.push('nota');
            }
        }

        return { filledFields, skippedFields };
    }, [sortedBankAccounts]);

    // Llama al endpoint seguro de lectura IA (soporta WebP/JPG/PNG y PDF)
    const runReceiptOcr = useCallback(async ({ dataUrl = null, archivoUrl = null, nombreOriginal = '' }) => {
        if (!dataUrl && !archivoUrl) return;
        setAnalyzingOcr(true);
        try {
            const res = await api.post('/operaciones/recordatorios/analizar-comprobante', {
                data_url: dataUrl,
                archivo_url: archivoUrl,
                nombre_original: nombreOriginal,
                contexto: {
                    descripcion: detail?.vencimiento?.descripcion || vencimientoRow?.descripcion || '',
                    ubicacion: detail?.vencimiento?.ubicacion || vencimientoRow?.ubicacion || '',
                    tipo_operacion: tipoOperacion,
                    monto_total: Number(detail?.resumen?.monto_total ?? vencimientoRow?.monto ?? 0),
                    saldo_pendiente: Number(detail?.resumen?.saldo_pendiente ?? vencimientoRow?.monto ?? 0)
                }
            });

            const an = res.data?.analisis;
            if (an) {
                setLastOcrResult(an);
                const { filledFields, skippedFields } = applyOcrAnalysisToForm(an);
                if (filledFields.length > 0) {
                    addToast(`IA completó automáticamente: ${filledFields.join(', ')}`, 'success');
                } else if (skippedFields.length > 0) {
                    addToast('Comprobante leído; se conservaron tus valores actuales. Usa "Aplicar datos OCR" si deseas reemplazarlos.', 'info');
                } else {
                    addToast('Comprobante leído; revisa los campos detectados', 'success');
                }
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'No se pudo leer automáticamente el comprobante', 'warning');
        } finally {
            setAnalyzingOcr(false);
        }
    }, [addToast, applyOcrAnalysisToForm, detail, tipoOperacion, vencimientoRow]);

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

    // Procesar múltiples archivos (drag&drop, file input, cámara móvil o Ctrl+V)
    const handleProcessFiles = useCallback(async (fileList, { immediateUpload = false, targetAbonoId = null } = {}) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (files.length === 0) return;

        compressingCountRef.current += 1;
        setCompressingFiles(true);
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

            const shouldUploadImmediately = immediateUpload || (isFullyPaid && !editingAbonoId);
            if (shouldUploadImmediately && vencimientoRow?.id) {
                const reservedCatalog = [
                    ...(detailRef.current?.comprobantes || []),
                    ...(pendingReceiptsRef.current || []),
                    ...Array.from(inFlightUploadNamesRef.current).map(nombre_original => ({ nombre_original }))
                ];
                const uploadBatch = deduplicateReceiptBatch(reservedCatalog, rawBatch);
                const newlyReserved = uploadBatch.map(c => c.nombre_original).filter(Boolean);
                newlyReserved.forEach(n => inFlightUploadNamesRef.current.add(n));

                setUploadingOnly(true);
                try {
                    const res = await api.post(`/operaciones/recordatorios/vencimiento/${vencimientoRow.id}/comprobantes`, {
                        abono_id: targetAbonoId,
                        comprobantes: uploadBatch.map(c => ({
                            data_url: c.data_url,
                            nombre_original: c.nombre_original,
                            ancho: c.ancho,
                            alto: c.alto,
                            nota: c.nota || null
                        }))
                    });
                    if (res.data?.detail) setDetail(res.data.detail);
                    addToast(
                        immediateUpload
                            ? (res.data?.message || 'Comprobante(s) subido(s) y comprimido(s)')
                            : 'Registro ya cancelado: comprobante(s) guardado(s) directamente en la galería',
                        'success'
                    );
                    if (onSaved) onSaved();
                } catch (err) {
                    // Nunca descartar capturas si falla la subida directa
                    setPendingReceipts(prev => [...prev, ...deduplicateReceiptBatch(prev, uploadBatch)]);
                    addToast(
                        err.response?.data?.message
                            ? `${err.response.data.message} — quedó en cola para reintentar`
                            : 'Error al subir directamente; quedó en cola para reintentar',
                        'warning'
                    );
                } finally {
                    newlyReserved.forEach(n => inFlightUploadNamesRef.current.delete(n));
                    setUploadingOnly(false);
                }
            } else {
                setPendingReceipts(prev => [...prev, ...deduplicateReceiptBatch(prev, rawBatch)]);
                const savedBytes = rawBatch.reduce((acc, c) => acc + Math.max(0, (c.original_size || 0) - (c.compressed_size || 0)), 0);
                addToast(
                    `${rawBatch.length} comprobante(s) listo(s)${savedBytes > 20000 ? ` (ahorro ${formatBytes(savedBytes)})` : ''}`,
                    'success'
                );
                // Auto-lectura IA sobre el primer archivo nuevo cuando está habilitada
                if (autoOcrEnabled && rawBatch[0]?.data_url) {
                    runReceiptOcr({
                        dataUrl: rawBatch[0].data_url,
                        nombreOriginal: rawBatch[0].nombre_original
                    });
                }
            }
        } finally {
            compressingCountRef.current = Math.max(0, compressingCountRef.current - 1);
            setCompressingFiles(compressingCountRef.current > 0);
        }
    }, [addToast, autoOcrEnabled, editingAbonoId, isFullyPaid, onSaved, runReceiptOcr, vencimientoRow?.id]);

    // Permitir pegar capturas directamente con Ctrl+V mientras el popup está abierto (sin interceptar modales hijos)
    useEffect(() => {
        if (!open || viewerOpen || mibotOpen) return undefined;
        const onPaste = (e) => {
            if (confirmOpenRef.current) return;
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
                handleProcessFiles(pastedFiles);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [open, viewerOpen, mibotOpen, handleProcessFiles]);

    const updatePendingReceiptNota = (tempId, val) => {
        setPendingReceipts(prev => prev.map(r => (r.tempId === tempId ? { ...r, nota: val } : r)));
    };

    const uploadPendingReceiptsNow = async () => {
        if (!vencimientoRow?.id || pendingReceipts.length === 0) return;
        setUploadingOnly(true);
        try {
            const res = await api.post(`/operaciones/recordatorios/vencimiento/${vencimientoRow.id}/comprobantes`, {
                abono_id: editingAbonoId || null,
                comprobantes: pendingReceipts.map(c => ({
                    data_url: c.data_url,
                    nombre_original: c.nombre_original,
                    ancho: c.ancho,
                    alto: c.alto,
                    nota: c.nota || null
                }))
            });
            if (res.data?.detail) setDetail(res.data.detail);
            const count = pendingReceipts.length;
            setPendingReceipts([]);
            addToast(res.data?.message || `${count} comprobante(s) subido(s) a la galería`, 'success');
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al subir comprobantes a la galería', 'error');
        } finally {
            setUploadingOnly(false);
        }
    };

    const handleSaveCompNota = async (compId) => {
        if (!compId) return;
        setSavingCompNota(true);
        try {
            const res = await api.patch(`/operaciones/recordatorios/comprobantes/${compId}`, {
                nota: editingCompNota
            });
            if (res.data?.detail) setDetail(res.data.detail);
            setEditingCompId(null);
            setEditingCompNota('');
            addToast('Nota del comprobante actualizada', 'success');
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al actualizar nota', 'error');
        } finally {
            setSavingCompNota(false);
        }
    };

    const applySuggestion = (sug) => {
        if (!sug) return;
        setMetodoPago(sug.metodo_pago || 'TRANSFERENCIA');
        markDirty('metodoPago', 'cuentaBancariaId', 'cuentaLabel', 'tarjetaRef');
        const labelToMatch = String(sug.cuenta_label || sug.label || '').toUpperCase().trim();
        let matchedAccount = sug.cuenta_bancaria_id
            ? sortedBankAccounts.find(c => Number(c.raw_id || c.id) === Number(sug.cuenta_bancaria_id))
            : null;

        if (!matchedAccount && labelToMatch) {
            const numDigits = labelToMatch.replace(/[^0-9]/g, '');
            if (numDigits.length >= 4) {
                matchedAccount = sortedBankAccounts.find(c => {
                    const cDigits = String(c.numero || '').replace(/[^0-9]/g, '');
                    return cDigits && (cDigits === numDigits || cDigits.endsWith(numDigits) || numDigits.endsWith(cDigits));
                }) || null;
            }
            if (!matchedAccount) {
                const bankRules = [
                    { test: /\bBAC\b|AMERICA CENTRAL/, bank: /AMERICA CENTRAL|\bBAC\b/ },
                    { test: /\bDAVI\b|DAVIVIENDA/, bank: /DAVIVIENDA/ },
                    { test: /\bPROM\b|PROMERICA/, bank: /PROMERICA/ },
                    { test: /\bAGRIC|AGRICOLA/, bank: /AGRICOLA/ },
                    { test: /\bBFA\b|FOMENTO/, bank: /BFA|FOMENTO/ },
                    { test: /CUSCAT/, bank: /CUSCATLAN/ },
                    { test: /\bBH\b|HIPOTECARIO/, bank: /HIPOTECARIO/ }
                ];
                const entityTokens = ['ANDELSA', 'MIRAFLORES', 'CHALCHUAPA', 'SAN MARTIN', 'LOMA', 'DESVIO', 'COSTA', 'PEDREGAL', 'LIL', 'RAUL', 'CORINA']
                    .filter(tk => labelToMatch.includes(tk));
                const matchedBankRule = bankRules.find(r => r.test.test(labelToMatch));

                matchedAccount = sortedBankAccounts.find(c => {
                    const cb = String(c.banco_nombre || '').toUpperCase();
                    const blob = `${cb} ${c.nombre || ''} ${c.empresa_nombre || ''}`.toUpperCase();
                    if (matchedBankRule && !matchedBankRule.bank.test(cb) && !matchedBankRule.bank.test(blob)) {
                        return false;
                    }
                    if (entityTokens.length > 0) {
                        return entityTokens.every(tk => blob.includes(tk));
                    }
                    return Boolean(matchedBankRule);
                }) || null;
            }
        }

        if (matchedAccount) {
            setCuentaBancariaId(String(matchedAccount.raw_id || matchedAccount.id));
            setCuentaLabel(formatCuentaLabel(matchedAccount));
        } else if (sug.cuenta_bancaria_id) {
            setCuentaBancariaId(String(sug.cuenta_bancaria_id));
            setCuentaLabel(sug.cuenta_label || sug.label || '');
        } else {
            setCuentaBancariaId('');
            setCuentaLabel(sug.cuenta_label || (sug.metodo_pago === 'EFECTIVO' ? sug.label : ''));
        }
        if (sug.tarjeta_ref) {
            setTarjetaRef(sug.tarjeta_ref);
        } else if (sug.metodo_pago === 'TARJETA_CREDITO' || sug.metodo_pago === 'TARJETA_DEBITO') {
            setTarjetaRef(sug.label || '');
        }
    };

    const handleSelectBankAccount = (val) => {
        markDirty('cuentaBancariaId', 'cuentaLabel');
        setCuentaBancariaId(val);
        if (!val) {
            setCuentaLabel('');
            return;
        }
        const found = sortedBankAccounts.find(c => String(c.raw_id || c.id) === String(val));
        if (found) {
            setCuentaLabel(formatCuentaLabel(found));
        }
    };

    const applyQuickPercentage = (pct) => {
        const total = Number(detail?.resumen?.monto_total ?? vencimientoRow?.monto ?? 0);
        const saldo = Number(detail?.resumen?.saldo_pendiente ?? total);
        markDirty('montoAbono');
        if (pct === 100) {
            setMontoAbono(saldo > 0 ? saldo.toFixed(2) : total.toFixed(2));
            return;
        }
        const computed = Math.round(((total * pct) / 100) * 100) / 100;
        const capped = saldo > 0 ? Math.min(computed, saldo) : computed;
        setMontoAbono(capped.toFixed(2));
        if (!notas) {
            setNotas(`Anticipo / pago parcial ${pct}%`);
            markDirty('notas');
        }
    };

    const startEditAbono = (ab) => {
        resetFieldTracking();
        setEditingAbonoId(ab.id);
        setTipoOperacion(ab.tipo_operacion || 'CXP');
        setMetodoPago(ab.metodo_pago || 'TRANSFERENCIA');
        setCuentaBancariaId(ab.cuenta_bancaria_id ? String(ab.cuenta_bancaria_id) : '');
        setCuentaLabel(ab.cuenta_label || '');
        setTarjetaRef(ab.tarjeta_ref || '');
        setBeneficiario(ab.beneficiario || '');
        setReferenciaDoc(ab.referencia_doc || '');
        setFechaPago(ab.fecha_pago ? String(ab.fecha_pago).split('T')[0] : todayStr());
        setMontoAbono(Number(ab.monto || 0).toFixed(2));
        setNotas(ab.notas || '');
        setPendingReceipts([]);
        setLastOcrResult(null);
        // Proteger valores existentes del abono contra sobreescritura automática por OCR
        if (ab.metodo_pago) dirtyFieldsRef.current.add('metodoPago');
        if (ab.cuenta_bancaria_id) dirtyFieldsRef.current.add('cuentaBancariaId');
        if (ab.cuenta_label) dirtyFieldsRef.current.add('cuentaLabel');
        if (ab.tarjeta_ref) dirtyFieldsRef.current.add('tarjetaRef');
        if (ab.beneficiario) dirtyFieldsRef.current.add('beneficiario');
        if (ab.referencia_doc) dirtyFieldsRef.current.add('referenciaDoc');
        if (ab.fecha_pago) dirtyFieldsRef.current.add('fechaPago');
        if (Number(ab.monto || 0) > 0) dirtyFieldsRef.current.add('montoAbono');
        if (ab.notas) dirtyFieldsRef.current.add('notas');
    };

    const cancelEditAbono = (overrideDetail = null) => {
        resetFieldTracking();
        setEditingAbonoId(null);
        const targetDetail = overrideDetail && typeof overrideDetail === 'object' && overrideDetail.resumen ? overrideDetail : detail;
        const saldo = Number(targetDetail?.resumen?.saldo_pendiente ?? 0);
        setMontoAbono(saldo > 0 ? saldo.toFixed(2) : '');
        setBeneficiario('');
        setReferenciaDoc('');
        setNotas('');
        setLastOcrResult(null);
        setFechaPago(todayStr());
    };

    const handleSaveMetaOnly = async () => {
        if (!vencimientoRow?.id) return;
        setSaving(true);
        try {
            const legacyText = cuentaLabel || tarjetaRef || getMethodLabel(metodoPago);
            const res = await api.patch(`/operaciones/recordatorios/vencimiento/${vencimientoRow.id}/meta`, {
                tipo_operacion: tipoOperacion,
                metodo_pago_preferido: metodoPago,
                cuenta_bancaria_id: resolveNumericCuentaId(cuentaBancariaId),
                cuenta_label: cuentaLabel || null,
                tarjeta_ref: tarjetaRef || null,
                notas_control: notas || null,
                forma_pago_legacy: legacyText
            });
            if (res.data?.detail) setDetail(res.data.detail);

            if (pendingReceipts.length > 0) {
                setUploadingOnly(true);
                try {
                    const count = pendingReceipts.length;
                    const upRes = await api.post(`/operaciones/recordatorios/vencimiento/${vencimientoRow.id}/comprobantes`, {
                        abono_id: null,
                        comprobantes: pendingReceipts.map(c => ({
                            data_url: c.data_url,
                            nombre_original: c.nombre_original,
                            ancho: c.ancho,
                            alto: c.alto,
                            nota: c.nota || null
                        }))
                    });
                    if (upRes.data?.detail) setDetail(upRes.data.detail);
                    setPendingReceipts([]);
                    addToast(`Clasificación preasignada y ${count} comprobante(s) guardado(s)`, 'success');
                } catch (upErr) {
                    if (onSaved) onSaved();
                    addToast(
                        `Preasignación guardada, pero falló la subida de comprobantes: ${upErr.response?.data?.message || upErr.message}`,
                        'warning'
                    );
                    return;
                } finally {
                    setUploadingOnly(false);
                }
            } else {
                addToast('Clasificación y método preasignados correctamente', 'success');
            }
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al guardar preasignación', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitAbono = async (e) => {
        e.preventDefault();
        if (!vencimientoRow?.id) return;

        const numMonto = Math.round((Number(montoAbono) || 0) * 100) / 100;
        if (!Number.isFinite(numMonto) || numMonto <= 0) {
            addToast('Ingresa un monto mayor a $0.00 para aplicar el pago o usa "Solo Preasignar"', 'warning');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                tipo_operacion: tipoOperacion,
                metodo_pago: metodoPago,
                cuenta_bancaria_id: resolveNumericCuentaId(cuentaBancariaId),
                cuenta_label: cuentaLabel || null,
                tarjeta_ref: tarjetaRef || null,
                beneficiario: beneficiario ? beneficiario.trim() : null,
                referencia_doc: referenciaDoc || null,
                fecha_pago: fechaPago || todayStr(),
                monto: numMonto,
                notas: notas || null
            };

            if (editingAbonoId) {
                const res = await api.put(`/operaciones/recordatorios/abonos/${editingAbonoId}`, payload);
                if (pendingReceipts.length > 0) {
                    await api.post(`/operaciones/recordatorios/vencimiento/${vencimientoRow.id}/comprobantes`, {
                        abono_id: editingAbonoId,
                        comprobantes: pendingReceipts.map(c => ({
                            data_url: c.data_url,
                            nombre_original: c.nombre_original,
                            ancho: c.ancho,
                            alto: c.alto,
                            nota: c.nota || null
                        }))
                    });
                    await loadDetail(vencimientoRow.id);
                } else if (res.data?.detail) {
                    setDetail(res.data.detail);
                }
                addToast(res.data?.message || 'Abono actualizado', 'success');
                setEditingAbonoId(null);
            } else {
                const res = await api.post(`/operaciones/recordatorios/vencimiento/${vencimientoRow.id}/abonos`, {
                    ...payload,
                    comprobantes: pendingReceipts.map(c => ({
                        data_url: c.data_url,
                        nombre_original: c.nombre_original,
                        ancho: c.ancho,
                        alto: c.alto,
                        nota: c.nota || null
                    }))
                });
                const updatedDetail = res.data?.detail;
                if (updatedDetail) {
                    setDetail(updatedDetail);
                    const nextSaldo = Number(updatedDetail?.resumen?.saldo_pendiente || 0);
                    setMontoAbono(nextSaldo > 0 ? nextSaldo.toFixed(2) : '');
                }
                addToast(res.data?.message || 'Pago aplicado correctamente', 'success');
            }

            setBeneficiario('');
            setReferenciaDoc('');
            setNotas('');
            setPendingReceipts([]);
            setLastOcrResult(null);
            resetFieldTracking();
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al registrar el pago', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteAbono = async (ab) => {
        let ok = false;
        try {
            confirmOpenRef.current = true;
            ok = await confirm(
                `¿Eliminar el abono de ${mc(ab.monto)} (${getMethodLabel(ab.metodo_pago)}) del ${formatDateShort(ab.fecha_pago)}? El saldo pendiente se recalculará automáticamente.`,
                { variant: 'danger' }
            );
        } finally {
            confirmOpenRef.current = false;
        }
        if (!ok) return;
        try {
            const res = await api.delete(`/operaciones/recordatorios/abonos/${ab.id}`);
            if (res.data?.detail) {
                setDetail(res.data.detail);
                const nextSaldo = Number(res.data.detail?.resumen?.saldo_pendiente || 0);
                setMontoAbono(nextSaldo > 0 ? nextSaldo.toFixed(2) : '');
            }
            if (editingAbonoId === ab.id) {
                cancelEditAbono(res.data?.detail || null);
            }
            addToast(res.data?.message || 'Abono eliminado', 'success');
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar abono', 'error');
        }
    };

    const handleDeleteReceipt = async (comp) => {
        let ok = false;
        try {
            confirmOpenRef.current = true;
            ok = await confirm(`¿Eliminar el comprobante "${comp.nombre_original}"?`, { variant: 'danger' });
        } finally {
            confirmOpenRef.current = false;
        }
        if (!ok) return;
        try {
            const res = await api.delete(`/operaciones/recordatorios/comprobantes/${comp.id}`);
            if (res.data?.detail) {
                setDetail(res.data.detail);
                setViewerItems(res.data.detail.comprobantes || []);
                if ((res.data.detail.comprobantes || []).length === 0) setViewerOpen(false);
            }
            addToast('Comprobante eliminado', 'success');
            if (onSaved) onSaved();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar comprobante', 'error');
        }
    };

    const openLightbox = (items, idx = 0) => {
        setViewerItems(items || []);
        setViewerIdx(idx);
        setViewerOpen(true);
    };

    const abonos = detail?.abonos || [];
    const comprobantes = detail?.comprobantes || [];
    const sugerencias = detail?.sugerencias || { mas_usadas_similares: [], tarjetas_frecuentes: [], efectivo_cajas: [] };
    const methodCategory = getMethodCategory(metodoPago);

    const projectedBalance = useMemo(() => {
        const entered = Number(montoAbono) || 0;
        if (entered <= 0) return null;
        let currentPaid = Number(resumen.monto_pagado || 0);
        if (editingAbonoId) {
            const old = abonos.find(a => a.id === editingAbonoId);
            if (old) currentPaid = Math.max(0, currentPaid - Number(old.monto || 0));
        }
        const afterPaid = Math.round((currentPaid + entered) * 100) / 100;
        const total = Number(resumen.monto_total || 0);
        const afterSaldo = Math.round(Math.max(0, total - afterPaid) * 100) / 100;
        const afterPct = total > 0 ? Math.min(100, Math.round((afterPaid / total) * 1000) / 10) : 100;
        return {
            afterPaid,
            afterSaldo,
            afterPct,
            willBeComplete: total > 0 ? afterPaid >= (total - 0.005) : true
        };
    }, [montoAbono, resumen, editingAbonoId, abonos]);

    const statusBadgeStyle = useMemo(() => {
        if (resumen.estado_pago === 'CANCELADO') {
            return { bg: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.45)', label: 'CANCELADO (100%)' };
        }
        if (resumen.estado_pago === 'PARCIAL') {
            return { bg: 'rgba(14, 165, 233, 0.18)', color: '#38bdf8', border: '1px solid rgba(14, 165, 233, 0.45)', label: `PENDIENTE · PARCIAL (${resumen.porcentaje_pagado}%)` };
        }
        return { bg: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.45)', label: 'PENDIENTE' };
    }, [resumen.estado_pago, resumen.porcentaje_pagado]);

    const mibotVencimientoRow = useMemo(() => {
        if (!vencimientoRow) return null;
        return {
            ...vencimientoRow,
            descripcion: detail?.vencimiento?.descripcion || vencimientoRow.descripcion,
            ubicacion: detail?.vencimiento?.ubicacion || vencimientoRow.ubicacion,
            vence: detail?.vencimiento?.vence || vencimientoRow.vence,
            monto: resumen.monto_total,
            monto_total: resumen.monto_total,
            monto_pagado: resumen.monto_pagado,
            saldo_pendiente: resumen.saldo_pendiente,
            estado_pago: resumen.estado_pago
        };
    }, [
        vencimientoRow,
        detail?.vencimiento?.descripcion,
        detail?.vencimiento?.ubicacion,
        detail?.vencimiento?.vence,
        resumen.monto_total,
        resumen.monto_pagado,
        resumen.saldo_pendiente,
        resumen.estado_pago
    ]);

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title={`Gestión de Pagos y Comprobantes — #${vencimientoRow?.id_recordatorio || ''}`}
                size="xl"
            >
                {loading && !detail ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Cargando historial de pagos, sugerencias inteligentes y comprobantes...
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 0 }}>
                        {/* ENCABEZADO FINANCIERO Y BARRA DE PROGRESO */}
                        <div style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '10px',
                            backgroundColor: 'rgba(15, 23, 42, 0.55)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.55rem',
                            minWidth: 0
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--text)', wordBreak: 'break-word' }}>
                                        {detail?.vencimiento?.descripcion || vencimientoRow?.descripcion || 'Compromiso de Pago'}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem', display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                                        <span>Ubicación: <strong style={{ color: 'var(--text)' }}>{detail?.vencimiento?.ubicacion || vencimientoRow?.ubicacion || 'General'}</strong></span>
                                        <span>Vence: <strong style={{ color: '#fbbf24' }}>{formatDateShort(detail?.vencimiento?.vence || vencimientoRow?.vence)}</strong></span>
                                        {detail?.vencimiento?.observacion && (
                                            <span>Obs.: <strong>{detail.vencimiento.observacion}</strong></span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => setMibotOpen(true)}
                                        title="Programar recordatorio o validación por Telegram (MiBot) a uno o varios usuarios"
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.32rem',
                                            padding: '0.24rem 0.62rem',
                                            borderRadius: '12px',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            border: '1px solid rgba(0, 136, 204, 0.5)',
                                            backgroundColor: 'rgba(0, 136, 204, 0.16)',
                                            color: '#38bdf8'
                                        }}
                                    >
                                        <Bell size={12} />
                                        {resumen.saldo_pendiente > 0 ? 'Avisar MiBot Telegram' : 'Validar por MiBot'}
                                    </button>
                                    <span style={{
                                        padding: '0.22rem 0.65rem',
                                        borderRadius: '12px',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        backgroundColor: statusBadgeStyle.bg,
                                        color: statusBadgeStyle.color,
                                        border: statusBadgeStyle.border,
                                        flexShrink: 0
                                    }}>
                                        {statusBadgeStyle.label}
                                    </span>
                                </div>
                            </div>

                            {/* KPIs de Monto Total / Pagado / Saldo Pendiente */}
                            <div className="form-grid form-grid-3" style={{ gap: '0.5rem' }}>
                                <div style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Monto Total</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>{mc(resumen.monto_total)}</div>
                                </div>
                                <div style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                    <div style={{ fontSize: '0.67rem', color: '#6ee7b7', textTransform: 'uppercase', fontWeight: 700 }}>Total Abonado ({abonos.length})</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#34d399' }}>{mc(resumen.monto_pagado)}</div>
                                </div>
                                <div style={{
                                    padding: '0.45rem 0.65rem',
                                    borderRadius: '8px',
                                    background: resumen.saldo_pendiente > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.06)',
                                    border: resumen.saldo_pendiente > 0 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(16, 185, 129, 0.2)'
                                }}>
                                    <div style={{ fontSize: '0.67rem', color: resumen.saldo_pendiente > 0 ? '#fcd34d' : '#6ee7b7', textTransform: 'uppercase', fontWeight: 700 }}>Saldo Pendiente</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: resumen.saldo_pendiente > 0 ? '#fbbf24' : '#34d399' }}>
                                        {mc(resumen.saldo_pendiente)}
                                    </div>
                                </div>
                            </div>

                            {/* Barra de progreso visual */}
                            <div style={{ height: '7px', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${Math.min(100, Math.max(0, Number(resumen.porcentaje_pagado || 0)))}%`,
                                    background: resumen.estado_pago === 'CANCELADO'
                                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                                        : 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
                                    transition: 'width 0.25s ease'
                                }} />
                            </div>

                            {/* Selector de Clasificación Financiera (CXP / CXC / GASTO) */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>FLUJO DE CAJA:</span>
                                    {OPERATION_TYPES.map(op => {
                                        const active = tipoOperacion === op.id;
                                        return (
                                            <button
                                                key={op.id}
                                                type="button"
                                                onClick={() => setTipoOperacion(op.id)}
                                                title={op.hint}
                                                style={{
                                                    padding: '0.24rem 0.6rem',
                                                    borderRadius: '12px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: active ? `1px solid ${op.color}` : '1px solid rgba(255,255,255,0.12)',
                                                    backgroundColor: active ? op.bg : 'rgba(255,255,255,0.03)',
                                                    color: active ? op.color : 'var(--text-muted)'
                                                }}
                                            >
                                                {op.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <span style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                                    {OPERATION_TYPES.find(o => o.id === tipoOperacion)?.hint}
                                </span>
                            </div>
                        </div>

                        {/* CUERPO PRINCIPAL EN 2 COLUMNAS RESPONSIVAS (.form-grid-2 colapsa a 1 col en móvil) */}
                        <div className="form-grid form-grid-2" style={{ gap: '0.85rem', alignItems: 'start' }}>
                            {/* COLUMNA IZQUIERDA: LECTURA IA + FORMULARIO DE PAGO */}
                            <form
                                onSubmit={handleSubmitAbono}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.7rem',
                                    padding: '0.8rem',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(255,255,255,0.025)',
                                    border: editingAbonoId ? '1px solid rgba(99, 102, 241, 0.55)' : '1px solid var(--border-color)',
                                    minWidth: 0
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text)' }}>
                                        {editingAbonoId ? <Edit size={15} color="#818cf8" /> : <Plus size={15} color="#34d399" />}
                                        <span>{editingAbonoId ? 'Editando Abono' : 'Registrar Pago / Abono Parcial'}</span>
                                    </div>
                                    {editingAbonoId && (
                                        <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }} onClick={cancelEditAbono}>
                                            Cancelar edición
                                        </button>
                                    )}
                                </div>

                                {/* BLOQUE 1: SUBIR PDF / CAPTURA / TOMAR FOTO -> AUTO-COMPLETA TODO CON IA */}
                                <div style={{
                                    padding: '0.65rem',
                                    borderRadius: '9px',
                                    backgroundColor: 'rgba(56, 189, 248, 0.06)',
                                    border: isDragging ? '2px dashed #38bdf8' : '1px dashed rgba(56, 189, 248, 0.45)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem'
                                }}
                                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={e => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        handleProcessFiles(e.dataTransfer?.files);
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                                        <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#7dd3fc', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Sparkles size={13} />
                                            Paso rápido: Sube PDF, captura o foto para auto-llenar
                                        </span>
                                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                                            <input
                                                type="checkbox"
                                                checked={autoOcrEnabled}
                                                onChange={e => setAutoOcrEnabled(e.target.checked)}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            Auto-leer IA
                                        </label>
                                    </div>

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        accept="image/*,.pdf"
                                        style={{ display: 'none' }}
                                        onChange={e => {
                                            handleProcessFiles(e.target.files);
                                            e.target.value = '';
                                        }}
                                    />
                                    <input
                                        ref={cameraInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        style={{ display: 'none' }}
                                        onChange={e => {
                                            handleProcessFiles(e.target.files);
                                            e.target.value = '';
                                        }}
                                    />

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={compressingFiles || analyzingOcr || saving || uploadingOnly}
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{ flex: '1 1 140px', fontSize: '0.76rem', padding: '0.45rem 0.7rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                        >
                                            <Upload size={14} /> Subir Foto / PDF
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={compressingFiles || analyzingOcr || saving || uploadingOnly}
                                            onClick={() => cameraInputRef.current?.click()}
                                            style={{ flex: '1 1 120px', fontSize: '0.76rem', padding: '0.45rem 0.7rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                            title="Usar cámara del teléfono para escanear comprobante"
                                        >
                                            <Camera size={14} /> Tomar Foto
                                        </button>
                                    </div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                        También puedes arrastrar aquí o pegar capturas con <strong>Ctrl + V</strong> · Comprime a WebP legible (~120 KB) y lee cuenta, monto y beneficiario.
                                    </div>
                                    {isFullyPaid && !editingAbonoId && (
                                        <div style={{
                                            padding: '0.35rem 0.55rem',
                                            borderRadius: '6px',
                                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                            border: '1px solid rgba(16, 185, 129, 0.35)',
                                            color: '#6ee7b7',
                                            fontSize: '0.69rem',
                                            textAlign: 'center'
                                        }}>
                                            Registro ya cancelado ($0.00 pendiente): las capturas que pegues o arrastres se guardarán directamente en la galería del vencimiento.
                                        </div>
                                    )}

                                    {/* Estado de lectura IA en curso */}
                                    {analyzingOcr && (
                                        <div style={{
                                            padding: '0.45rem 0.65rem',
                                            borderRadius: '7px',
                                            backgroundColor: 'rgba(99, 102, 241, 0.16)',
                                            border: '1px solid rgba(99, 102, 241, 0.4)',
                                            color: '#c7d2fe',
                                            fontSize: '0.74rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.45rem'
                                        }}>
                                            <Loader2 size={14} className="animate-spin" style={{ flexShrink: 0 }} />
                                            <span>Analizando comprobante con IA (cuenta, monto, beneficiario, referencia)...</span>
                                        </div>
                                    )}

                                    {/* Resultado de la lectura IA */}
                                    {lastOcrResult && !analyzingOcr && (
                                        <div style={{
                                            padding: '0.5rem 0.65rem',
                                            borderRadius: '8px',
                                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                            border: '1px solid rgba(16, 185, 129, 0.35)',
                                            fontSize: '0.72rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.25rem'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
                                                <span style={{ fontWeight: 800, color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                    <Sparkles size={12} /> Leído por IA ({lastOcrResult.confianza || 'alta'})
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const { filledFields } = applyOcrAnalysisToForm(lastOcrResult, { force: true });
                                                        addToast(
                                                            filledFields.length > 0
                                                                ? `Datos OCR aplicados: ${filledFields.join(', ')}`
                                                                : 'No había campos detectados para aplicar',
                                                            filledFields.length > 0 ? 'success' : 'info'
                                                        );
                                                    }}
                                                    style={{
                                                        padding: '0.14rem 0.45rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        border: '1px solid rgba(16, 185, 129, 0.4)',
                                                        backgroundColor: 'rgba(16, 185, 129, 0.16)',
                                                        color: '#a7f3d0',
                                                        cursor: 'pointer'
                                                    }}
                                                    title="Sobrescribe los campos del formulario con los datos detectados por IA"
                                                >
                                                    Aplicar datos OCR
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', color: 'var(--text)' }}>
                                                {lastOcrResult.monto && <span>Monto: <strong style={{ color: '#34d399' }}>{mc(lastOcrResult.monto)}</strong></span>}
                                                {lastOcrResult.beneficiario && <span>A favor de: <strong>{lastOcrResult.beneficiario}</strong></span>}
                                                {lastOcrResult.referencia_doc && <span>Ref: <strong>{lastOcrResult.referencia_doc}</strong></span>}
                                            </div>
                                            {lastOcrResult.cuenta_match_reason ? (
                                                <div style={{ color: '#6ee7b7', fontSize: '0.69rem' }}>
                                                    ✓ Cuenta vinculada automáticamente: <strong>{lastOcrResult.cuenta_label}</strong> ({lastOcrResult.cuenta_match_reason})
                                                </div>
                                            ) : (lastOcrResult.banco_origen || lastOcrResult.cuenta_origen) && (
                                                <div style={{ color: '#fde68a', fontSize: '0.69rem' }}>
                                                    Detectado en documento: {lastOcrResult.banco_origen || ''} {lastOcrResult.cuenta_origen || ''} (verifica cuenta abajo)
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Miniaturas de comprobantes pendientes de guardar */}
                                    {pendingReceipts.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                                                {pendingReceipts.map((r, idx) => (
                                                    <div
                                                        key={r.tempId}
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '0.3rem',
                                                            padding: '0.35rem 0.5rem',
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
                                                                <FileText size={16} color="#f87171" style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => openLightbox(pendingReceipts, idx)} />
                                                            ) : (
                                                                <img
                                                                    src={r.data_url}
                                                                    alt=""
                                                                    onClick={() => openLightbox(pendingReceipts, idx)}
                                                                    style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}
                                                                />
                                                            )}
                                                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 110px' }}>
                                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={r.nombre_original}>
                                                                    {r.nombre_original}
                                                                </span>
                                                                <span style={{ fontSize: '0.63rem', color: '#6ee7b7' }}>
                                                                    {formatBytes(r.compressed_size)}
                                                                    {r.original_size > r.compressed_size ? ` (de ${formatBytes(r.original_size)})` : ''}
                                                                </span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                disabled={analyzingOcr}
                                                                onClick={() => runReceiptOcr({ dataUrl: r.data_url, nombreOriginal: r.nombre_original })}
                                                                style={{ background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.45)', color: '#c7d2fe', borderRadius: '5px', cursor: 'pointer', padding: '0.15rem 0.35rem', fontSize: '0.64rem', display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}
                                                                title="Leer este comprobante con IA"
                                                            >
                                                                <Sparkles size={10} /> IA
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setPendingReceipts(prev => prev.filter(x => x.tempId !== r.tempId))}
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
                                                            placeholder="Nota breve (ej. Transferencia 1, DTE...)"
                                                            value={r.nota || ''}
                                                            onChange={e => updatePendingReceiptNota(r.tempId, e.target.value)}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                            {vencimientoRow?.id && (
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                    <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        disabled={uploadingOnly || compressingFiles || saving}
                                                        onClick={uploadPendingReceiptsNow}
                                                        style={{ fontSize: '0.72rem', padding: '0.28rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderColor: 'rgba(56, 189, 248, 0.45)', color: '#7dd3fc' }}
                                                    >
                                                        <Upload size={12} /> {uploadingOnly ? 'Subiendo...' : `Subir a galería (${pendingReceipts.length})`}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* SUGERENCIAS INTELIGENTES POR HISTORIAL REAL */}
                                {sugerencias.mas_usadas_similares?.length > 0 && (
                                    <div style={{
                                        padding: '0.5rem 0.65rem',
                                        borderRadius: '8px',
                                        backgroundColor: 'rgba(16, 185, 129, 0.07)',
                                        border: '1px solid rgba(16, 185, 129, 0.28)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.32rem'
                                    }}>
                                        <div style={{ fontSize: '0.71rem', fontWeight: 800, color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <Sparkles size={12} />
                                            <span>Más usadas en transacciones similares:</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.32rem' }}>
                                            {sugerencias.mas_usadas_similares.map((sug, idx) => (
                                                <button
                                                    key={sug.key || idx}
                                                    type="button"
                                                    onClick={() => applySuggestion(sug)}
                                                    title={sug.motivo || 'Aplicar sugerencia'}
                                                    style={{
                                                        padding: '0.24rem 0.5rem',
                                                        borderRadius: '12px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 600,
                                                        border: '1px solid rgba(16, 185, 129, 0.42)',
                                                        backgroundColor: 'rgba(16, 185, 129, 0.14)',
                                                        color: '#d1fae5',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.28rem',
                                                        maxWidth: '100%'
                                                    }}
                                                >
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(200px, 60vw)' }}>
                                                        {sug.label}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.63rem',
                                                        padding: '0.05rem 0.3rem',
                                                        borderRadius: '8px',
                                                        backgroundColor: 'rgba(0,0,0,0.28)',
                                                        color: '#6ee7b7',
                                                        flexShrink: 0
                                                    }}>
                                                        {sug.usos}x
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* TODOS LOS TIPOS / MÉTODOS DE PAGO */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.32rem' }}>
                                        TIPO / MÉTODO DE PAGO
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                        {PAYMENT_METHOD_OPTIONS.map(opt => {
                                            const Icon = opt.icon;
                                            const active = metodoPago === opt.id;
                                            return (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setMetodoPago(opt.id);
                                                        markDirty('metodoPago');
                                                    }}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.28rem',
                                                        padding: '0.3rem 0.55rem',
                                                        borderRadius: '7px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: active ? 700 : 500,
                                                        cursor: 'pointer',
                                                        border: active ? `1px solid ${opt.color}` : '1px solid rgba(255,255,255,0.1)',
                                                        backgroundColor: active ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255,255,255,0.03)',
                                                        color: active ? '#fff' : 'var(--text-muted)'
                                                    }}
                                                >
                                                    <Icon size={12} style={{ color: opt.color, flexShrink: 0 }} />
                                                    <span>{opt.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* CUENTA BANCARIA / TARJETA / EFECTIVO SEGÚN MÉTODO */}
                                {(methodCategory === 'BANCO' || metodoPago === 'TARJETA_DEBITO') && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.28rem' }}>
                                            CUENTA BANCARIA (SUGERENCIA EN CONCILIACIÓN BANCARIA)
                                        </label>
                                        <select
                                            className="form-control"
                                            style={{ height: '38px', fontSize: '0.8rem', width: '100%' }}
                                            value={cuentaBancariaId}
                                            onChange={e => handleSelectBankAccount(e.target.value)}
                                        >
                                            <option value="">-- Seleccionar cuenta bancaria --</option>
                                            {ubicacionAccounts.length > 0 && (
                                                <optgroup label={`Sugeridas para ${detail?.vencimiento?.ubicacion || vencimientoRow?.ubicacion}`}>
                                                    {ubicacionAccounts.map(c => (
                                                        <option key={`ub-${c.raw_id || c.id}`} value={String(c.raw_id || c.id)}>
                                                            {formatCuentaLabel(c)}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <optgroup label="Todas las Cuentas Bancarias">
                                                {sortedBankAccounts.map(c => (
                                                    <option key={`all-${c.raw_id || c.id}`} value={String(c.raw_id || c.id)}>
                                                        {formatCuentaLabel(c)}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        </select>
                                        {ubicacionAccounts.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', marginTop: '0.32rem' }}>
                                                {ubicacionAccounts.slice(0, 6).map(c => {
                                                    const idVal = String(c.raw_id || c.id);
                                                    const active = cuentaBancariaId === idVal;
                                                    return (
                                                        <button
                                                            key={`chip-${idVal}`}
                                                            type="button"
                                                            onClick={() => handleSelectBankAccount(idVal)}
                                                            style={{
                                                                padding: '0.18rem 0.45rem',
                                                                borderRadius: '10px',
                                                                fontSize: '0.68rem',
                                                                border: active ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.12)',
                                                                background: active ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255,255,255,0.04)',
                                                                color: active ? '#fff' : 'var(--text-muted)',
                                                                cursor: 'pointer',
                                                                maxWidth: '100%',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            {formatCuentaLabel(c)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(metodoPago === 'TARJETA_CREDITO' || metodoPago === 'TARJETA_DEBITO') && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.28rem' }}>
                                            TARJETA UTILIZADA (BANCO / TERMINACIÓN)
                                        </label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={{ height: '38px', fontSize: '0.8rem', width: '100%' }}
                                            placeholder="Ej. TC DAVI #0038, VISA BAC *4521..."
                                            value={tarjetaRef}
                                            onChange={e => {
                                                setTarjetaRef(e.target.value);
                                                markDirty('tarjetaRef');
                                            }}
                                        />
                                        {sugerencias.tarjetas_frecuentes?.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', marginTop: '0.32rem' }}>
                                                {sugerencias.tarjetas_frecuentes.slice(0, 6).map(t => (
                                                    <button
                                                        key={t}
                                                        type="button"
                                                        onClick={() => {
                                                            setTarjetaRef(t);
                                                            markDirty('tarjetaRef');
                                                        }}
                                                        style={{
                                                            padding: '0.18rem 0.48rem',
                                                            borderRadius: '10px',
                                                            fontSize: '0.69rem',
                                                            border: tarjetaRef === t ? '1px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.3)',
                                                            background: tarjetaRef === t ? 'rgba(245, 158, 11, 0.22)' : 'rgba(245, 158, 11, 0.08)',
                                                            color: '#fde68a',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        💳 {t}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {metodoPago === 'EFECTIVO' && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.28rem' }}>
                                            ORIGEN DEL EFECTIVO / CAJA
                                        </label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={{ height: '38px', fontSize: '0.8rem', width: '100%' }}
                                            placeholder="Ej. Efectivo Caja Chica Oficina, Efectivo Pista..."
                                            value={cuentaLabel}
                                            onChange={e => {
                                                setCuentaLabel(e.target.value);
                                                markDirty('cuentaLabel');
                                            }}
                                        />
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28rem', marginTop: '0.32rem' }}>
                                            {(sugerencias.efectivo_cajas || []).map(caja => (
                                                <button
                                                    key={caja}
                                                    type="button"
                                                    onClick={() => {
                                                        setCuentaLabel(caja);
                                                        markDirty('cuentaLabel');
                                                    }}
                                                    style={{
                                                        padding: '0.18rem 0.48rem',
                                                        borderRadius: '10px',
                                                        fontSize: '0.69rem',
                                                        border: cuentaLabel === caja ? '1px solid #22c55e' : '1px solid rgba(34, 197, 94, 0.3)',
                                                        background: cuentaLabel === caja ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.08)',
                                                        color: '#bbf7d0',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    💵 {caja}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* MONTO DEL ABONO + BOTONES RÁPIDOS DE PORCENTAJE + FECHA */}
                                <div className="form-grid form-grid-2" style={{ gap: '0.55rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            MONTO A APLICAR ($)
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0.01"
                                            inputMode="decimal"
                                            className="form-control"
                                            style={{ height: '38px', fontSize: '0.88rem', fontWeight: 800, color: '#34d399', width: '100%' }}
                                            placeholder="0.00"
                                            value={montoAbono}
                                            onChange={e => {
                                                setMontoAbono(e.target.value);
                                                markDirty('montoAbono');
                                            }}
                                        />
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.3rem' }}>
                                            {[25, 50, 75, 100].map(pct => (
                                                <button
                                                    key={pct}
                                                    type="button"
                                                    onClick={() => applyQuickPercentage(pct)}
                                                    style={{
                                                        padding: '0.16rem 0.45rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.69rem',
                                                        fontWeight: 700,
                                                        border: '1px solid rgba(99, 102, 241, 0.35)',
                                                        backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                                        color: '#c7d2fe',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {pct === 100 ? 'Saldo 100%' : `${pct}%`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            FECHA DEL PAGO
                                        </label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            style={{ height: '38px', fontSize: '0.8rem', width: '100%' }}
                                            value={fechaPago}
                                            onChange={e => {
                                                setFechaPago(e.target.value);
                                                markDirty('fechaPago');
                                            }}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* PREVIEW EN VIVO DE ESTADO PARCIAL VS CANCELADO */}
                                {projectedBalance && (
                                    <div style={{
                                        padding: '0.45rem 0.65rem',
                                        borderRadius: '7px',
                                        fontSize: '0.73rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        backgroundColor: projectedBalance.willBeComplete ? 'rgba(16, 185, 129, 0.12)' : 'rgba(14, 165, 233, 0.12)',
                                        border: projectedBalance.willBeComplete ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(14, 165, 233, 0.35)',
                                        color: projectedBalance.willBeComplete ? '#6ee7b7' : '#7dd3fc'
                                    }}>
                                        {projectedBalance.willBeComplete ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Clock size={14} style={{ flexShrink: 0 }} />}
                                        {projectedBalance.willBeComplete ? (
                                            <span>Con este pago se liquida el <strong>100%</strong> y el registro pasará a <strong>CANCELADO</strong>.</span>
                                        ) : (
                                            <span>
                                                Pago <strong>PARCIAL ({projectedBalance.afterPct}%)</strong>: seguirá en <strong>PENDIENTE</strong> con saldo de <strong>{mc(projectedBalance.afterSaldo)}</strong>.
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* A QUIÉN SE HIZO (BENEFICIARIO) + # REFERENCIA */}
                                <div className="form-grid form-grid-2" style={{ gap: '0.55rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            A QUIÉN SE HIZO / BENEFICIARIO
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={150}
                                            className="form-control"
                                            style={{ height: '38px', fontSize: '0.8rem', width: '100%' }}
                                            placeholder="Proveedor, persona o comercio..."
                                            value={beneficiario}
                                            onChange={e => {
                                                setBeneficiario(e.target.value);
                                                markDirty('beneficiario');
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            # REF. / CHEQUE / NC / REMISIÓN
                                        </label>
                                        <input
                                            type="text"
                                            maxLength={120}
                                            className="form-control"
                                            style={{ height: '38px', fontSize: '0.8rem', width: '100%' }}
                                            placeholder="TRF-99812, CHQ #4401, NC-0021..."
                                            value={referenciaDoc}
                                            onChange={e => {
                                                setReferenciaDoc(e.target.value);
                                                markDirty('referenciaDoc');
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                        NOTA / CONCEPTO DEL ABONO
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={300}
                                        className="form-control"
                                        style={{ height: '38px', fontSize: '0.8rem', width: '100%' }}
                                        placeholder="Ej. Anticipo 50% por trabajo, saldo final..."
                                        value={notas}
                                        onChange={e => {
                                            setNotas(e.target.value);
                                            markDirty('notas');
                                        }}
                                    />
                                </div>

                                {/* AVISO DE CONCILIACIÓN */}
                                {cuentaBancariaId && (
                                    <div style={{ fontSize: '0.7rem', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <ShieldCheck size={13} style={{ flexShrink: 0 }} />
                                        <span>Aparecerá como <strong>sugerencia</strong> en Conciliación Bancaria (sin duplicar Movimientos Bancarios).</span>
                                    </div>
                                )}

                                {/* BOTONES DE ACCIÓN */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.35rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                    {!editingAbonoId && (
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            disabled={saving || compressingFiles || uploadingOnly || analyzingOcr}
                                            onClick={handleSaveMetaOnly}
                                            style={{ flex: '1 1 135px', fontSize: '0.78rem', padding: '0.45rem 0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                                            title="Guarda clasificación CXP/CXC, método preferido y comprobantes pendientes sin aplicar dinero todavía"
                                        >
                                            <Save size={14} /> Solo Preasignar
                                        </button>
                                    )}
                                    <button
                                        type="submit"
                                        className="btn-primary"
                                        disabled={saving || compressingFiles || uploadingOnly || analyzingOcr}
                                        style={{ flex: '1 1 175px', fontSize: '0.8rem', padding: '0.45rem 0.9rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                                    >
                                        <CheckCircle size={15} />
                                        {saving ? 'Guardando...' : (editingAbonoId ? 'Guardar Cambios' : 'Registrar Abono / Pago')}
                                    </button>
                                </div>
                            </form>

                            {/* COLUMNA DERECHA: HISTORIAL DE ABONOS Y GALERÍA DE COMPROBANTES */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', minWidth: 0 }}>
                                {/* HISTORIAL DE PAGOS / ABONOS */}
                                <div style={{
                                    padding: '0.8rem',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(255,255,255,0.025)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                    minWidth: 0
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>
                                            Pagos Aplicados ({abonos.length})
                                        </span>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                            Total: <strong style={{ color: '#34d399' }}>{mc(resumen.monto_pagado)}</strong>
                                        </span>
                                    </div>

                                    {abonos.length === 0 ? (
                                        <div style={{
                                            padding: '0.9rem',
                                            borderRadius: '8px',
                                            backgroundColor: 'rgba(255,255,255,0.02)',
                                            textAlign: 'center',
                                            fontSize: '0.76rem',
                                            color: 'var(--text-muted)'
                                        }}>
                                            {resumen.estado_pago === 'CANCELADO'
                                                ? 'Este registro fue cancelado anteriormente sin desglose de abonos. Puedes adjuntar comprobantes abajo o registrar el detalle.'
                                                : 'Aún no hay abonos registrados. Sube un comprobante PDF/captura o registra un pago parcial (ej. 50%).'}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '300px', overflowY: 'auto' }}>
                                            {abonos.map(ab => {
                                                const abComps = comprobantes.filter(c => Number(c.abono_id) === Number(ab.id));
                                                return (
                                                    <div
                                                        key={ab.id}
                                                        style={{
                                                            padding: '0.55rem 0.65rem',
                                                            borderRadius: '8px',
                                                            backgroundColor: editingAbonoId === ab.id ? 'rgba(99, 102, 241, 0.14)' : 'rgba(15, 23, 42, 0.5)',
                                                            border: editingAbonoId === ab.id ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.08)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '0.28rem'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#34d399' }}>
                                                                    {mc(ab.monto)}
                                                                </span>
                                                                <span style={{
                                                                    padding: '0.1rem 0.42rem',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.67rem',
                                                                    fontWeight: 700,
                                                                    backgroundColor: 'rgba(99, 102, 241, 0.18)',
                                                                    color: '#c7d2fe'
                                                                }}>
                                                                    {getMethodLabel(ab.metodo_pago)}
                                                                </span>
                                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                                    {formatDateShort(ab.fecha_pago)}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startEditAbono(ab)}
                                                                    style={{
                                                                        padding: '0.24rem 0.42rem',
                                                                        borderRadius: '6px',
                                                                        border: '1px solid rgba(255,255,255,0.14)',
                                                                        backgroundColor: 'rgba(255,255,255,0.06)',
                                                                        color: 'var(--text)',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center'
                                                                    }}
                                                                    title="Editar abono"
                                                                >
                                                                    <Edit size={12} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteAbono(ab)}
                                                                    style={{
                                                                        padding: '0.24rem 0.42rem',
                                                                        borderRadius: '6px',
                                                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                                                        backgroundColor: 'rgba(239, 68, 68, 0.16)',
                                                                        color: '#fca5a5',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center'
                                                                    }}
                                                                    title="Eliminar abono"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {ab.beneficiario && (
                                                            <div style={{ fontSize: '0.73rem', color: '#e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                                                                <User size={12} color="#38bdf8" style={{ flexShrink: 0 }} />
                                                                <span>A favor de: <strong>{ab.beneficiario}</strong></span>
                                                            </div>
                                                        )}

                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                                                            {(ab.cuenta_label || ab.tarjeta_ref) && (
                                                                <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{ab.cuenta_label || ab.tarjeta_ref}</span>
                                                            )}
                                                            {ab.referencia_doc && (
                                                                <span>Ref: <strong>{ab.referencia_doc}</strong></span>
                                                            )}
                                                            {ab.estado_conciliacion === 'CONCILIADO' && (
                                                                <span style={{ color: '#34d399', fontWeight: 700 }}>✓ Conciliado</span>
                                                            )}
                                                            {ab.estado_conciliacion === 'PENDIENTE' && (
                                                                <span style={{ color: '#38bdf8', fontWeight: 600 }}>• Sugerido en Conciliación</span>
                                                            )}
                                                        </div>

                                                        {ab.notas && (
                                                            <div style={{ fontSize: '0.71rem', color: '#cbd5e1', fontStyle: 'italic', wordBreak: 'break-word' }}>
                                                                “{ab.notas}”
                                                            </div>
                                                        )}

                                                        {abComps.length > 0 && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.12rem' }}>
                                                                {abComps.map(c => {
                                                                    const globalIdx = comprobantes.findIndex(x => x.id === c.id);
                                                                    return (
                                                                        <button
                                                                            key={c.id}
                                                                            type="button"
                                                                            onClick={() => openLightbox(comprobantes, Math.max(0, globalIdx))}
                                                                            title={c.nota ? `${c.nombre_original} — ${c.nota}` : c.nombre_original}
                                                                            style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '0.25rem',
                                                                                padding: '0.16rem 0.45rem',
                                                                                borderRadius: '6px',
                                                                                fontSize: '0.68rem',
                                                                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                                                                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                                                                                color: '#bae6fd',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            <Paperclip size={10} />
                                                                            <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                {c.nombre_original}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* GALERÍA DE TODOS LOS COMPROBANTES ADJUNTOS */}
                                <div style={{
                                    padding: '0.8rem',
                                    borderRadius: '10px',
                                    backgroundColor: 'rgba(255,255,255,0.025)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                    minWidth: 0
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <Paperclip size={14} color="#38bdf8" />
                                            Comprobantes Adjuntos ({comprobantes.length})
                                        </span>
                                        <div>
                                            <input
                                                ref={extraFileInputRef}
                                                type="file"
                                                multiple
                                                accept="image/*,.pdf"
                                                style={{ display: 'none' }}
                                                onChange={e => {
                                                    handleProcessFiles(e.target.files, { immediateUpload: true });
                                                    e.target.value = '';
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                disabled={uploadingOnly || compressingFiles || saving}
                                                onClick={() => extraFileInputRef.current?.click()}
                                                style={{ padding: '0.3rem 0.65rem', fontSize: '0.73rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                            >
                                                <Upload size={12} /> {uploadingOnly ? 'Subiendo...' : 'Agregar'}
                                            </button>
                                        </div>
                                    </div>

                                    {comprobantes.length === 0 ? (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.75rem' }}>
                                            Sin comprobantes guardados aún. Puedes adjuntar múltiples fotos o PDFs.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {comprobantes.map((c, idx) => {
                                                const isPdf = c.mime_type === 'application/pdf' || /\.pdf$/i.test(c.archivo_url || c.nombre_original || '');
                                                const isEditingThisNota = editingCompId === c.id;
                                                return (
                                                    <div
                                                        key={c.id}
                                                        style={{
                                                            flex: '1 1 135px',
                                                            maxWidth: '100%',
                                                            minWidth: 0,
                                                            borderRadius: '8px',
                                                            border: '1px solid rgba(255,255,255,0.1)',
                                                            backgroundColor: 'rgba(15, 23, 42, 0.65)',
                                                            overflow: 'hidden',
                                                            display: 'flex',
                                                            flexDirection: 'column'
                                                        }}
                                                    >
                                                        <div
                                                            onClick={() => openLightbox(comprobantes, idx)}
                                                            style={{
                                                                height: '86px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                backgroundColor: 'rgba(0,0,0,0.35)',
                                                                cursor: 'pointer',
                                                                position: 'relative'
                                                            }}
                                                            title="Clic para ampliar y revisar"
                                                        >
                                                            {isPdf ? (
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', color: '#f87171' }}>
                                                                    <FileText size={28} />
                                                                    <span style={{ fontSize: '0.66rem', fontWeight: 700 }}>PDF</span>
                                                                </div>
                                                            ) : (
                                                                <img
                                                                    src={c.signed_url || c.archivo_url}
                                                                    alt={c.nombre_original}
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                />
                                                            )}
                                                            <span style={{
                                                                position: 'absolute',
                                                                bottom: '4px',
                                                                right: '4px',
                                                                padding: '2px 5px',
                                                                borderRadius: '4px',
                                                                backgroundColor: 'rgba(0,0,0,0.7)',
                                                                color: '#fff',
                                                                fontSize: '0.62rem',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '2px'
                                                            }}>
                                                                <Eye size={10} /> Ver
                                                            </span>
                                                        </div>
                                                        <div style={{ padding: '0.32rem 0.42rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.2rem' }}>
                                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                                    <div style={{ fontSize: '0.67rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.nombre_original}>
                                                                        {c.nombre_original}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.61rem', color: 'var(--text-muted)' }}>
                                                                        {formatBytes(c.tamano_bytes)}
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingCompId(c.id);
                                                                        setEditingCompNota(c.nota || '');
                                                                    }}
                                                                    style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: '0.15rem', flexShrink: 0, display: 'inline-flex' }}
                                                                    title="Editar nota del comprobante"
                                                                >
                                                                    <Edit size={11} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={analyzingOcr}
                                                                    onClick={() => runReceiptOcr({ archivoUrl: c.archivo_url, nombreOriginal: c.nombre_original })}
                                                                    style={{ background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.4)', color: '#c7d2fe', borderRadius: '4px', cursor: 'pointer', padding: '0.15rem 0.28rem', flexShrink: 0, display: 'inline-flex' }}
                                                                    title="Leer con IA para autocompletar formulario"
                                                                >
                                                                    <Sparkles size={11} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteReceipt(c)}
                                                                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.15rem', flexShrink: 0, display: 'inline-flex' }}
                                                                    title="Eliminar comprobante"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                            {isEditingThisNota ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', minWidth: 0 }}>
                                                                    <input
                                                                        type="text"
                                                                        maxLength={255}
                                                                        autoFocus
                                                                        className="form-control"
                                                                        style={{ height: '24px', fontSize: '0.66rem', padding: '0.1rem 0.3rem', flex: 1, minWidth: 0 }}
                                                                        placeholder="Nota breve..."
                                                                        value={editingCompNota}
                                                                        onChange={e => setEditingCompNota(e.target.value)}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter') {
                                                                                e.preventDefault();
                                                                                handleSaveCompNota(c.id);
                                                                            } else if (e.key === 'Escape') {
                                                                                setEditingCompId(null);
                                                                                setEditingCompNota('');
                                                                            }
                                                                        }}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        disabled={savingCompNota}
                                                                        onClick={() => handleSaveCompNota(c.id)}
                                                                        style={{ background: 'rgba(16, 185, 129, 0.25)', border: '1px solid rgba(16, 185, 129, 0.45)', color: '#6ee7b7', borderRadius: '4px', cursor: 'pointer', padding: '0.12rem 0.28rem', flexShrink: 0, display: 'inline-flex' }}
                                                                        title="Guardar nota"
                                                                    >
                                                                        <Save size={10} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEditingCompId(null);
                                                                            setEditingCompNota('');
                                                                        }}
                                                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.1rem', flexShrink: 0, display: 'inline-flex' }}
                                                                        title="Cancelar"
                                                                    >
                                                                        <X size={10} />
                                                                    </button>
                                                                </div>
                                                            ) : c.nota ? (
                                                                <div
                                                                    onClick={() => {
                                                                        setEditingCompId(c.id);
                                                                        setEditingCompNota(c.nota || '');
                                                                    }}
                                                                    style={{ fontSize: '0.63rem', color: '#93c5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                                                    title={`${c.nota} (clic para editar)`}
                                                                >
                                                                    {c.nota}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            <ReceiptViewerModal
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                comprobantes={viewerItems}
                initialIndex={viewerIdx}
                title={`Comprobantes — ${detail?.vencimiento?.descripcion || vencimientoRow?.descripcion || ''}`}
                onDelete={handleDeleteReceipt}
            />

            <MibotProgramarModal
                open={mibotOpen}
                onClose={() => setMibotOpen(false)}
                vencimientoRow={mibotVencimientoRow}
                defaultTipo={resumen.saldo_pendiente > 0 ? 'RECORDATORIO_PAGO' : 'VALIDACION'}
                onSaved={onSaved}
            />
        </>
    );
}
