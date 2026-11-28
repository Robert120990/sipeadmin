import React, { useEffect, useState, useMemo, useRef } from 'react';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { Hash, FileText, Search, Plus, Calendar, Filter, Save, Trash2, ChevronLeft, ChevronRight, Edit2, CheckCircle, DollarSign, User, Printer, Lock, AlertCircle, Copy, Clock } from 'lucide-react';
import CheckPdfService from '../modules/check-designer/services/CheckPdfService';
import DesignerService from '../modules/check-designer/services/DesignerService';
import { numeroALetras, formatMonto, formatearFechaEnLetras, formatearFechaEnLetrasCorta } from '../utils/numeroALetras';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { moneyFmt } from '../utils/format';
import { resolveInitialBancosContext, saveBancosSelection, subscribeBancosNavTarget, findMatchingCuenta } from '../utils/bancosNavStorage';
import { useNavigate } from 'react-router-dom';
import { getStoredUser } from '../utils/auth';

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

const formatSvDateTime = (val) => {
    if (!val) return '';
    try {
        const dt = new Date(val);
        if (isNaN(dt.getTime())) return String(val);
        return new Intl.DateTimeFormat('es-SV', {
            timeZone: SV_TZ,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(dt);
    } catch {
        return String(val);
    }
};

const getPeriodoDates = (preset) => {
    const svToday = getSvTodayYMD();
    const [y, m, d] = svToday.split('-').map(Number);
    if (preset === 'hoy') {
        return { desde: svToday, hasta: svToday };
    }
    if (preset === 'esta_semana') {
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
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

export default function Cheques() {
    const [cheques, setCheques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [truncatedInfo, setTruncatedInfo] = useState({ truncated: false, total: 0 });
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const [cuentas, setCuentas] = useState([]);
    const [modalCuentas, setModalCuentas] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const cuentasRef = useRef([]);

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

    const [formData, setFormData] = useState(() => ({
        id_empresa: '',
        numero_cuenta: '',
        fecha: getSvTodayYMD(),
        fecha_aplicado: '',
        cheque: '',
        valor: '',
        a_nombre: '',
        concepto: '',
        num_partida: '',
        cheque_anulado: false,
        es_reservado: false,
        es_pago_contado: false,
        fue_noemitido: false,
        chequera_id: null
    }));

    const [editingCheque, setEditingCheque] = useState(null);
    const originalValues = useRef({ valor: '', a_nombre: '', concepto: '' });

    // Live checkbook summary chips (R5.2)
    const [cuentaResumen, setCuentaResumen] = useState(null);
    const [loadingResumen, setLoadingResumen] = useState(false);
    const [filterCuentaResumen, setFilterCuentaResumen] = useState(null);

    // ReportPreviewModal state (R2.1)
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTitle, setPreviewTitle] = useState('Vista Previa de Cheque');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewBadge, setPreviewBadge] = useState('');
    const [previewFileName, setPreviewFileName] = useState('cheque.pdf');
    const [printingId, setPrintingId] = useState(null);

    const { addToast } = useToast();
    const { confirm } = useConfirm();
    const navigate = useNavigate();

    const fetchFilterCuentaResumen = async (acc) => {
        if (!acc) {
            setFilterCuentaResumen(null);
            return;
        }
        try {
            const res = await api.get('/cheques/cuenta-resumen', {
                params: acc.corr
                    ? { cuenta_bancaria_id: acc.corr }
                    : { id_empresa: acc.id_empresa, numero_cuenta: acc.numero }
            });
            setFilterCuentaResumen(res.data || null);
        } catch {
            setFilterCuentaResumen(null);
        }
    };

    const fetchCheques = async (overrideFilters = null) => {
        const activeFilters = overrideFilters || filtersRef.current;
        setLoading(true);
        try {
            const res = await api.get('/cheques', { params: { ...activeFilters, limit: 1500 } });
            setCheques(res.data || []);
            const isTrunc = String(res.headers?.['x-truncated'] || '').toLowerCase() === 'true';
            const totalCnt = Number(res.headers?.['x-total-count'] || (res.data || []).length);
            setTruncatedInfo({ truncated: isTrunc, total: totalCnt });
            setCurrentPage(1);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar historial de cheques', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let active = true;
        const init = async () => {
            let loadedCuentas = [];
            try {
                const res = await api.get('/cheques/catalogos');
                if (!active) return;
                loadedCuentas = res.data.cuentas || [];
                cuentasRef.current = loadedCuentas;
                setCuentas(loadedCuentas);
                setEmpresas(res.data.empresas || []);
            } catch (err) {
                if (active) addToast('Error al cargar catálogos', 'error');
            }

            if (!active) return;
            const initialCtx = resolveInitialBancosContext('/dashboard/bancos/cheques');
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
            fetchCheques(nextFilters);
            if (matchedAcc) {
                fetchFilterCuentaResumen(matchedAcc);
            }
        };
        init();

        const unsubscribe = subscribeBancosNavTarget('/dashboard/bancos/cheques', (detail) => {
            const list = cuentasRef.current;
            const match = findMatchingCuenta(list, detail);
            let nextFilters = { ...filtersRef.current };
            if (match) {
                nextFilters = {
                    ...nextFilters,
                    id_empresa: String(match.id_empresa || ''),
                    numero_cuenta: String(match.numero || '')
                };
                fetchFilterCuentaResumen(match);
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
            fetchCheques(nextFilters);
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const fetchCatalogsForCompany = async (id_empresa) => {
        if (!id_empresa) {
            setModalCuentas([]);
            return [];
        }
        try {
            const res = await api.get(`/cheques/catalogos?id_empresa=${id_empresa}`);
            const list = res.data.cuentas || [];
            setModalCuentas(list);
            return list;
        } catch (err) {
            addToast('Error al cargar cuentas para la empresa', 'error');
            return [];
        }
    };

    const fetchCuentaResumenForAccount = async ({ cuenta_bancaria_id, id_empresa, numero_cuenta }, { autoFillCheque = false } = {}) => {
        if (!cuenta_bancaria_id && (!id_empresa || !numero_cuenta)) {
            setCuentaResumen(null);
            return null;
        }
        setLoadingResumen(true);
        try {
            const params = cuenta_bancaria_id
                ? { cuenta_bancaria_id }
                : { id_empresa, numero_cuenta };
            const res = await api.get('/cheques/cuenta-resumen', { params });
            const summary = res.data || null;
            setCuentaResumen(summary);
            if (summary) {
                setFormData(prev => ({
                    ...prev,
                    chequera_id: summary.talonario_activo?.id || prev.chequera_id || null,
                    cheque: (autoFillCheque && summary.siguiente_correlativo)
                        ? String(summary.siguiente_correlativo)
                        : prev.cheque
                }));
            }
            return summary;
        } catch {
            setCuentaResumen(null);
            return null;
        } finally {
            setLoadingResumen(false);
        }
    };

    const notifyTalonarioAlerta = (alerta) => {
        if (!alerta) return;
        const serieTxt = alerta.serie ? ` (${alerta.serie})` : '';
        if (alerta.agotado) {
            addToast(`Talonario${serieTxt} agotado (hasta #${alerta.hasta}). Registre un nuevo talonario en Cuentas Bancarias.`, 'warning');
        } else {
            addToast(`Talonario${serieTxt} con stock bajo: quedan ${alerta.restantes} cheque(s) (hasta #${alerta.hasta}).`, 'warning');
        }
    };

    const handleCompanyChange = (id_empresa) => {
        setFormData(prev => ({ ...prev, id_empresa, numero_cuenta: '', chequera_id: null }));
        setCuentaResumen(null);
        if (!editingCheque) {
            saveBancosSelection({ empresaId: id_empresa, cuentaId: '', numeroCuenta: '' });
        }
        if (id_empresa) fetchCatalogsForCompany(id_empresa);
        else setModalCuentas([]);
    };

    const handleModalAccountChange = (numero_cuenta) => {
        const pool = modalCuentas.length > 0 ? modalCuentas : cuentas;
        const acc = pool.find(c => String(c.numero) === String(numero_cuenta) && String(c.id_empresa) === String(formData.id_empresa));
        setFormData(prev => ({ ...prev, numero_cuenta, chequera_id: null }));
        if (!editingCheque) {
            saveBancosSelection({
                empresaId: formData.id_empresa,
                cuentaId: acc?.corr || '',
                numeroCuenta: numero_cuenta
            });
        }
        if (numero_cuenta) {
            fetchCuentaResumenForAccount(
                { cuenta_bancaria_id: acc?.corr, id_empresa: formData.id_empresa, numero_cuenta },
                { autoFillCheque: !editingCheque }
            );
        } else {
            setCuentaResumen(null);
        }
    };

    const handleOpenModal = async (cheque = null) => {
        if (cheque) {
            setEditingCheque(cheque);
            const formatDateForInput = (str) => {
                if (!str) return '';
                const parts = str.split('/');
                if (parts.length !== 3) return '';
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            };

            const isVoided = Boolean(cheque.cheque_anulado);
            const restoredValor = isVoided
                ? (cheque.valor_original !== null && cheque.valor_original !== undefined ? String(cheque.valor_original) : String(cheque.valor ?? ''))
                : (cheque.valor !== null && cheque.valor !== undefined ? String(cheque.valor) : '');
            const restoredNombre = isVoided ? (cheque.beneficiario_original || cheque.a_nombre || '') : (cheque.a_nombre || '');
            const restoredConcepto = isVoided ? (cheque.concepto_original || cheque.concepto || '') : (cheque.concepto || '');
            originalValues.current = { valor: restoredValor, a_nombre: restoredNombre, concepto: restoredConcepto };

            setFormData({
                id_empresa: cheque.id_empresa,
                numero_cuenta: cheque.numero_cuenta,
                fecha: formatDateForInput(cheque.fecha),
                fecha_aplicado: formatDateForInput(cheque.fecha_aplicado),
                cheque: cheque.cheque || '',
                valor: restoredValor,
                a_nombre: restoredNombre,
                concepto: restoredConcepto,
                num_partida: cheque.num_partida || '',
                cheque_anulado: isVoided,
                es_reservado: !!cheque.es_reservado,
                es_pago_contado: !!cheque.es_pago_contado,
                fue_noemitido: !!cheque.fue_noemitido,
                chequera_id: cheque.chequera_id || null
            });
            setShowModal(true);
            await fetchCatalogsForCompany(cheque.id_empresa);
            await fetchCuentaResumenForAccount(
                { cuenta_bancaria_id: cheque.cuenta_bancaria_id, id_empresa: cheque.id_empresa, numero_cuenta: cheque.numero_cuenta },
                { autoFillCheque: false }
            );
        } else {
            setEditingCheque(null);
            originalValues.current = { valor: '', a_nombre: '', concepto: '' };
            setCuentaResumen(null);
            let preEmp = filters.id_empresa || '';
            const rawPreCta = filters.numero_cuenta || '';
            let matchedUnique = null;
            if (!preEmp && rawPreCta) {
                matchedUnique = findMatchingCuenta(cuentas, { numeroCuenta: rawPreCta });
                if (matchedUnique?.id_empresa !== undefined && matchedUnique?.id_empresa !== null && matchedUnique.id_empresa !== '') {
                    preEmp = String(matchedUnique.id_empresa);
                }
            }
            const preCta = preEmp ? (matchedUnique ? String(matchedUnique.numero || rawPreCta) : rawPreCta) : '';
            setFormData({
                id_empresa: preEmp,
                numero_cuenta: preCta,
                fecha: getSvTodayYMD(),
                fecha_aplicado: '',
                cheque: '',
                valor: '',
                a_nombre: '',
                concepto: '',
                num_partida: '',
                cheque_anulado: false,
                es_reservado: false,
                es_pago_contado: false,
                fue_noemitido: false,
                chequera_id: null
            });
            setShowModal(true);
            if (preEmp) {
                const list = await fetchCatalogsForCompany(preEmp);
                if (preCta) {
                    const pool = list.length > 0 ? list : cuentas;
                    const acc = findMatchingCuenta(pool, {
                        cuentaId: matchedUnique?.corr,
                        empresaId: preEmp,
                        numeroCuenta: preCta
                    }) || matchedUnique;
                    await fetchCuentaResumenForAccount(
                        { cuenta_bancaria_id: acc?.corr, id_empresa: preEmp, numero_cuenta: preCta },
                        { autoFillCheque: true }
                    );
                }
            } else {
                setModalCuentas([]);
            }
        }
    };

    const handleDuplicate = async (cheque) => {
        setEditingCheque(null);
        const isVoided = Boolean(cheque.cheque_anulado);
        const dupValor = isVoided
            ? (cheque.valor_original !== null && cheque.valor_original !== undefined ? String(cheque.valor_original) : String(cheque.valor ?? ''))
            : (cheque.valor !== null && cheque.valor !== undefined ? String(cheque.valor) : '');
        const dupNombre = isVoided ? (cheque.beneficiario_original || '') : (cheque.a_nombre || '');
        const dupConcepto = isVoided ? (cheque.concepto_original || '') : (cheque.concepto || '');

        originalValues.current = { valor: dupValor, a_nombre: dupNombre, concepto: dupConcepto };
        setCuentaResumen(null);
        setFormData({
            id_empresa: cheque.id_empresa || '',
            numero_cuenta: cheque.numero_cuenta || '',
            fecha: getSvTodayYMD(),
            fecha_aplicado: '',
            cheque: '',
            valor: dupValor,
            a_nombre: dupNombre,
            concepto: dupConcepto,
            num_partida: '',
            cheque_anulado: false,
            es_reservado: Boolean(cheque.es_reservado),
            es_pago_contado: Boolean(cheque.es_pago_contado),
            fue_noemitido: false,
            chequera_id: null
        });
        setShowModal(true);
        if (cheque.id_empresa) {
            await fetchCatalogsForCompany(cheque.id_empresa);
        }
        if (cheque.numero_cuenta) {
            await fetchCuentaResumenForAccount(
                { cuenta_bancaria_id: cheque.cuenta_bancaria_id, id_empresa: cheque.id_empresa, numero_cuenta: cheque.numero_cuenta },
                { autoFillCheque: true }
            );
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        const esActivo = !formData.cheque_anulado && !formData.es_reservado && !formData.fue_noemitido;
        const valorNum = Number(formData.valor || 0);
        if (esActivo && (!Number.isFinite(valorNum) || valorNum <= 0)) {
            addToast('El valor del cheque debe ser mayor a $0.00', 'warning');
            return;
        }
        if (!esActivo && (!Number.isFinite(valorNum) || valorNum < 0)) {
            addToast('El valor del cheque no puede ser negativo', 'warning');
            return;
        }

        setSubmitting(true);
        try {
            if (editingCheque) {
                const payload = editingCheque.cheque_anulado
                    ? {
                        ...formData,
                        valor: 0,
                        a_nombre: editingCheque.a_nombre || '***** CHEQUE ANULADO *****',
                        concepto: editingCheque.concepto || '***** CHEQUE ANULADO *****',
                        version: editingCheque.version
                    }
                    : { ...formData, version: editingCheque.version };
                await api.put(`/cheques/${editingCheque.id}`, payload);
                addToast('Cheque actualizado con éxito', 'success');
            } else {
                const res = await api.post('/cheques', formData, {
                    headers: { 'X-Idempotency-Key': makeIdempotencyKey() }
                });
                addToast('Cheque registrado con éxito', 'success');
                if (res.data?.talonario_alerta) {
                    notifyTalonarioAlerta(res.data.talonario_alerta);
                }
            }
            setShowModal(false);
            fetchCheques();
            if (filters.numero_cuenta) {
                const acc = findMatchingCuenta(cuentas, {
                    empresaId: filters.id_empresa,
                    numeroCuenta: filters.numero_cuenta
                });
                if (acc) fetchFilterCuentaResumen(acc);
                else setFilterCuentaResumen(null);
            }
        } catch (err) {
            addToast(err.response?.data?.message || `Error al ${editingCheque ? 'actualizar' : 'registrar'} cheque`, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id) => {
        if (submitting) return;
        if (!await confirm('¿Está seguro de eliminar este cheque? Quedará respaldado en auditoría.', { variant: 'danger' })) return;
        setSubmitting(true);
        try {
            await api.delete(`/cheques/${id}`);
            addToast('Cheque eliminado', 'success');
            fetchCheques();
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al eliminar cheque', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePrint = async (cheque) => {
        if (printingId) return;
        try {
            if (!cheque.banco_id) {
                addToast('El cheque no tiene banco asociado', 'warning');
                return;
            }

            // Verificar que exista un formato de impresión guardado para el banco
            let formats = await DesignerService.getFormats({ banco_id: cheque.banco_id, is_active: true });
            if (!Array.isArray(formats) || formats.length === 0) {
                formats = await DesignerService.getFormats({ banco_nombre: cheque.banco_nombre, is_active: true });
            }
            const formato = Array.isArray(formats) ? formats.find(f => f.is_active !== false) || formats[0] : null;

            if (!formato) {
                const irAlDisenador = await confirm(
                    `No existe un formato de impresión guardado para el banco "${cheque.banco_nombre || cheque.banco_id}".\n\nDebe crear un formato en el Diseñador de Cheques antes de imprimir.`,
                    { title: 'Formato no encontrado', confirmText: 'Ir al Diseñador', cancelText: 'Cancelar', variant: 'primary' }
                );
                if (irAlDisenador) navigate('/dashboard/bancos/check-designer');
                return;
            }

            if (Number(cheque.veces_impreso || 0) > 0) {
                const ultimaInfo = cheque.impreso_at
                    ? ` (última: ${formatSvDateTime(cheque.impreso_at)}${cheque.impreso_por_nombre ? ` por ${cheque.impreso_por_nombre}` : ''})`
                    : '';
                const confirmarReimpresion = await confirm(
                    `Este cheque (#${cheque.cheque || cheque.llave}) ya fue impreso ${cheque.veces_impreso} ${Number(cheque.veces_impreso) === 1 ? 'vez' : 'veces'}${ultimaInfo}.\n\n¿Desea generar una reimpresión?`,
                    { title: 'Reimpresión de Cheque', confirmText: 'Continuar e Imprimir', cancelText: 'Cancelar', variant: 'primary' }
                );
                if (!confirmarReimpresion) return;
            }

            setPrintingId(cheque.id);
            const user = getStoredUser() || {};

            const auditRes = await api.post(`/cheques/${cheque.id}/registrar-impresion`, {
                formato_id: formato.id,
                printer_name: formato.printer_name || null
            });

            if (auditRes.data?.advertencia_reimpresion) {
                addToast(auditRes.data.advertencia_reimpresion, 'warning');
            }

            setCheques(prev => prev.map(item => (
                item.id === cheque.id
                    ? {
                        ...item,
                        impreso_at: auditRes.data.impreso_at,
                        impreso_por: auditRes.data.impreso_por,
                        impreso_por_nombre: auditRes.data.impreso_por_nombre,
                        veces_impreso: auditRes.data.veces_impreso
                    }
                    : item
            )));

            const partesFecha = (cheque.fecha || '').split('/');
            const datos = {
                fecha: cheque.fecha || '',
                fecha_letras: formatearFechaEnLetras(cheque.fecha),
                fecha_letras_corta: formatearFechaEnLetrasCorta(cheque.fecha),
                dia: partesFecha[0] || '',
                mes: partesFecha[1] || '',
                anio: partesFecha[2] || '',
                anio_corto: (partesFecha[2] || '').slice(-2),
                beneficiario: cheque.a_nombre || '',
                monto_numeros: `*****${formatMonto(cheque.valor)}`,
                monto_letras: `*****${numeroALetras(cheque.valor)}*****`,
                concepto: cheque.concepto || '',
                numero_cheque: cheque.cheque || cheque.llave || '',
                ciudad: '',
                empresa: cheque.empresa_nombre || '',
                cuenta_bancaria: cheque.cuenta_nombre ? `${cheque.cuenta_nombre} - ${cheque.numero_cuenta}` : (cheque.numero_cuenta || ''),
                usuario_impresion: user.nombre || user.username || '',
                sucursal: '',
                observaciones: '',
            };

            const doc = await CheckPdfService.generatePdf(
                formato,
                formato.design_json?.campos || [],
                [datos],
                formato.printer_name || null
            );
            const blob = doc.output('blob');
            setPreviewPdfBlob(blob);
            setPreviewTitle(`Cheque #${cheque.cheque || cheque.llave}`);
            setPreviewBadge(formato.name || cheque.banco_nombre || 'CHEQUE');
            setPreviewSubtitle(`${cheque.a_nombre || ''} | $${formatMonto(cheque.valor)} | Cuenta: ${cheque.cuenta_nombre || cheque.numero_cuenta || ''}`);
            setPreviewFileName(`Cheque_${cheque.cheque || cheque.llave}.pdf`);
            setShowPreviewModal(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al preparar vista previa del cheque', 'error');
        } finally {
            setPrintingId(null);
        }
    };

    const applyPeriodoPreset = (preset) => {
        const range = getPeriodoDates(preset);
        const nextFilters = { ...filters, desde: range.desde, hasta: range.hasta };
        setPeriodoPreset(preset);
        setFilters(nextFilters);
        fetchCheques(nextFilters);
    };

    const handleFilterEmpresaChange = (id_empresa) => {
        const nextFilters = { ...filters, id_empresa, numero_cuenta: '' };
        setFilters(nextFilters);
        setFilterCuentaResumen(null);
        saveBancosSelection({ empresaId: id_empresa, cuentaId: '', numeroCuenta: '' });
    };

    const handleFilterCuentaChange = (numero_cuenta) => {
        const nextFilters = { ...filters, numero_cuenta };
        setFilters(nextFilters);
        const acc = numero_cuenta
            ? findMatchingCuenta(cuentas, { empresaId: filters.id_empresa, numeroCuenta: numero_cuenta })
            : null;
        saveBancosSelection({
            empresaId: filters.id_empresa || acc?.id_empresa || '',
            cuentaId: acc?.corr || '',
            numeroCuenta: numero_cuenta
        });
        if (numero_cuenta && acc) {
            fetchFilterCuentaResumen(acc);
        } else {
            setFilterCuentaResumen(null);
        }
    };

    const filteredCheques = useMemo(() => {
        if (!searchTerm) return cheques;
        const lowSearch = searchTerm.toLowerCase();
        return cheques.filter(c =>
            (c.concepto || '').toLowerCase().includes(lowSearch) ||
            (c.cheque || '').toLowerCase().includes(lowSearch) ||
            (c.a_nombre || '').toLowerCase().includes(lowSearch) ||
            (c.llave || '').toLowerCase().includes(lowSearch)
        );
    }, [cheques, searchTerm]);

    const totalPages = Math.ceil(filteredCheques.length / itemsPerPage);
    const paginatedCheques = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredCheques.slice(start, start + itemsPerPage);
    }, [filteredCheques, currentPage]);

    const getEstadoBadges = (c) => {
        const badges = [];
        if (c.cheque_anulado) badges.push({ label: 'Anulado', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' });
        if (c.es_reservado) badges.push({ label: 'Reservado', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' });
        if (c.fue_noemitido) badges.push({ label: 'No Emitido', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' });
        if (c.es_pago_contado) badges.push({ label: 'Contado', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' });
        return badges;
    };

    const ToggleSwitch = ({ checked, onChange, disabled }) => (
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            style={{
                position: 'relative',
                width: '44px',
                height: '22px',
                minHeight: 0,
                background: checked ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '11px',
                cursor: disabled ? 'default' : 'pointer',
                transition: 'background 0.3s',
                padding: 0,
                opacity: disabled ? 0.5 : 1
            }}
        >
            <div style={{
                position: 'absolute',
                top: '2px',
                left: checked ? '24px' : '2px',
                width: '18px',
                height: '18px',
                background: 'white',
                borderRadius: '50%',
                transition: 'left 0.3s'
            }} />
        </button>
    );

    const renderLiveResumenChip = (resumen, isLoading, onUseSuggested = null) => {
        if (!isLoading && !resumen) return null;
        if (isLoading) {
            return (
                <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Consultando saldo de chequera y correlativo...
                </div>
            );
        }
        const saldo = Number(resumen.saldo_chequera || 0);
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
                    <strong style={{ color: saldo < 0 ? '#ef4444' : '#10b981' }}>
                        {moneyFmt(saldo)}
                    </strong>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                    Último #: <strong style={{ color: 'var(--text)' }}>{resumen.ultimo_numero_cheque || 'N/A'}</strong>
                </span>
                {resumen.siguiente_correlativo && (
                    onUseSuggested ? (
                        <button
                            type="button"
                            onClick={() => onUseSuggested(String(resumen.siguiente_correlativo))}
                            title="Aplicar número de cheque sugerido"
                            style={{
                                padding: '0.15rem 0.5rem',
                                borderRadius: '9999px',
                                border: '1px solid rgba(59,130,246,0.35)',
                                background: 'rgba(59,130,246,0.12)',
                                color: '#60a5fa',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Sugerido: #{resumen.siguiente_correlativo}
                        </button>
                    ) : (
                        <span style={{ color: '#60a5fa', fontSize: '0.74rem', fontWeight: 600 }}>
                            Sugerido: #{resumen.siguiente_correlativo}
                        </span>
                    )
                )}
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

    return (
        <div className="cheques-page" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="page-header" style={{ marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <DollarSign size={22} color="var(--primary)" />
                        Cheques
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Historial e ingreso de cheques emitidos.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button className="btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', height: '36px', padding: '0 1rem', fontSize: '0.825rem' }}>
                        <Plus size={16} />
                        Nuevo Cheque
                    </button>
                </div>
            </div>

            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
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
                            {sortCuentas(cuentas.filter(c => !filters.id_empresa || String(c.id_empresa) === String(filters.id_empresa))).map(acc => (
                                <option key={acc.corr} value={acc.numero}>{formatCuentaLabel(acc)}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ width: '138px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Desde</label>
                        <input
                            type="date"
                            value={filters.desde}
                            onChange={e => {
                                setPeriodoPreset('custom');
                                setFilters({ ...filters, desde: e.target.value });
                            }}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ width: '138px' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Hasta</label>
                        <input
                            type="date"
                            value={filters.hasta}
                            onChange={e => {
                                setPeriodoPreset('custom');
                                setFilters({ ...filters, hasta: e.target.value });
                            }}
                            style={{ height: '36px', fontSize: '0.825rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flex: '1 1 200px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input type="text" placeholder="Buscar..." style={{ paddingLeft: '2.1rem', width: '100%', height: '36px', fontSize: '0.825rem' }} value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                        </div>
                        <button className="btn-secondary" onClick={() => fetchCheques()} title="Buscar / Actualizar" style={{ height: '36px', padding: '0 1.1rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.825rem' }}>
                            <Filter size={15} />
                            <span>Filtrar</span>
                        </button>
                    </div>
                </div>
                {filters.numero_cuenta && filterCuentaResumen && renderLiveResumenChip(filterCuentaResumen, false)}
                {truncatedInfo.truncated && (
                    <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertCircle size={14} />
                        <span>Mostrando los primeros {cheques.length} de {truncatedInfo.total} cheques. Refine los filtros para ver todos.</span>
                    </div>
                )}
            </div>

            <div className="card glass table-responsive" style={{ padding: 0 }}>
                <table style={{ fontSize: '0.8rem', width: '100%', minWidth: '1040px', borderCollapse: 'collapse', marginTop: 0 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Fecha</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Cheque #</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Cuenta</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>A Nombre</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Concepto</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Valor</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Estado</th>
                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>Cargando cheques...</td></tr>
                        ) : paginatedCheques.length === 0 ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>No se encontraron cheques para los filtros seleccionados.</td></tr>
                        ) : paginatedCheques.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }} className="hover-row">
                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                    <div>{c.fecha}</div>
                                    {c.fecha_aplicado && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Apl: {c.fecha_aplicado}</div>}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold' }}>{c.cheque || '-'}</div>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.llave}</div>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem' }}>
                                    <div style={{ fontWeight: '500' }}>{c.numero_cuenta}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.empresa_nombre}</div>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', maxWidth: '180px' }}>
                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.a_nombre}>
                                        {c.a_nombre || '-'}
                                    </div>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', maxWidth: '240px' }} title={c.concepto}>
                                    <div style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.concepto}</div>
                                    {c.banco_nombre && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.banco_nombre}</div>}
                                    {c.num_partida && <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>Pda: {c.num_partida}</span>}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: c.cheque_anulado ? 'rgba(255,255,255,0.3)' : 'var(--text)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                    <span style={{ textDecoration: c.cheque_anulado ? 'line-through' : 'none' }}>
                                        ${parseFloat(c.valor || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        {getEstadoBadges(c).map((b, i) => (
                                            <span key={i} className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', color: b.color, background: b.bg, border: `1px solid ${b.color}40` }}>
                                                {b.label}
                                            </span>
                                        ))}
                                        {getEstadoBadges(c).length === 0 && (
                                            <span className="badge" style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', color: 'var(--success)', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
                                                Emitido
                                            </span>
                                        )}
                                        {Number(c.veces_impreso || 0) > 0 && (
                                            <span
                                                className="badge"
                                                title={`Impreso ${c.veces_impreso} ${Number(c.veces_impreso) === 1 ? 'vez' : 'veces'}${c.impreso_at ? ` · Última: ${formatSvDateTime(c.impreso_at)}` : ''}${c.impreso_por_nombre ? ` · ${c.impreso_por_nombre}` : ''}`}
                                                style={{
                                                    fontSize: '0.72rem',
                                                    padding: '0.15rem 0.45rem',
                                                    color: '#60a5fa',
                                                    background: 'rgba(59,130,246,0.15)',
                                                    border: '1px solid rgba(59,130,246,0.3)'
                                                }}
                                            >
                                                Impreso {c.veces_impreso}x
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                    <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            onClick={() => handlePrint(c)}
                                            disabled={printingId === c.id}
                                            style={{ background: 'none', color: 'var(--primary)', padding: '0.25rem', cursor: 'pointer' }}
                                            title={Number(c.veces_impreso || 0) > 0 ? `Reimprimir cheque (impreso ${c.veces_impreso}x)` : 'Vista previa / Imprimir cheque'}
                                        >
                                            <Printer size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDuplicate(c)}
                                            style={{ background: 'none', color: '#38bdf8', padding: '0.25rem', cursor: 'pointer' }}
                                            title="Duplicar / Repetir cheque"
                                        >
                                            <Copy size={15} />
                                        </button>
                                        {c.es_contabilizado !== 'S' && !c.fecha_aplicado ? (
                                            <>
                                                <button type="button" onClick={() => handleOpenModal(c)} style={{ background: 'none', color: 'var(--text-muted)', padding: '0.25rem', cursor: 'pointer' }} title="Editar">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button type="button" onClick={() => handleDelete(c.id)} disabled={submitting} style={{ background: 'none', color: '#ef4444', padding: '0.25rem', cursor: 'pointer' }} title="Eliminar">
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        ) : c.fecha_aplicado ? (
                                            <span title={`Conciliado (${c.fecha_aplicado}) - Desconcilie primero para editar o eliminar`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#10b981', fontSize: '0.72rem' }}>
                                                <Lock size={14} /> Conciliado
                                            </span>
                                        ) : (
                                            <span title="Contabilizado - No se puede editar ni eliminar">
                                                <CheckCircle size={16} color="var(--success)" />
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {totalPages > 1 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Mostrando {paginatedCheques.length} de {filteredCheques.length} cheques
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button className="btn-secondary" style={{ padding: '0.35rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft size={18} /></button>
                            <span style={{ fontSize: '0.8rem' }}>Página <strong>{currentPage}</strong> de {totalPages}</span>
                            <button className="btn-secondary" style={{ padding: '0.35rem', minWidth: 'auto' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight size={18} /></button>
                        </div>
                    </div>
                )}
            </div>

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={<span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>{editingCheque ? <Edit2 size={18} color="var(--primary)" /> : <Plus size={18} color="var(--primary)" />}{editingCheque ? 'Editar Cheque' : 'Nuevo Cheque'}</span>}
            >
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {editingCheque && Number(editingCheque.veces_impreso || 0) > 0 && (
                        <div style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            background: 'rgba(59,130,246,0.1)',
                            border: '1px solid rgba(59,130,246,0.28)',
                            fontSize: '0.76rem',
                            color: '#93c5fd',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            flexWrap: 'wrap'
                        }}>
                            <Printer size={14} />
                            <span>
                                Impreso <strong>{editingCheque.veces_impreso}x</strong>
                                {editingCheque.impreso_at ? ` · Última: ${formatSvDateTime(editingCheque.impreso_at)}` : ''}
                                {editingCheque.impreso_por_nombre ? ` por ${editingCheque.impreso_por_nombre}` : ''}
                            </span>
                        </div>
                    )}

                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Empresa</label>
                            <select style={{ width: '100%', height: '36px', fontSize: '0.825rem' }} value={formData.id_empresa} onChange={e => handleCompanyChange(e.target.value)} required>
                                <option value="">Seleccione Empresa...</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No. Partida</label>
                            <div style={{ position: 'relative' }}>
                                <FileText size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="text" style={{ paddingLeft: '2.35rem', height: '36px', fontSize: '0.825rem', width: '100%' }} placeholder="Partida" value={formData.num_partida} onChange={e => setFormData({ ...formData, num_partida: e.target.value })} />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Cuenta Bancaria</label>
                        <select style={{ width: '100%', height: '36px', fontSize: '0.825rem' }} value={formData.numero_cuenta} onChange={e => handleModalAccountChange(e.target.value)} disabled={!formData.id_empresa} required>
                            <option value="">Seleccione Cuenta...</option>
                            {sortCuentas((modalCuentas.length > 0 ? modalCuentas : cuentas).filter(c => String(c.id_empresa) === String(formData.id_empresa))).map(c => (
                                <option key={c.corr} value={c.numero}>{formatCuentaLabel(c)}</option>
                            ))}
                        </select>
                        {formData.numero_cuenta && renderLiveResumenChip(
                            cuentaResumen,
                            loadingResumen,
                            (sugerido) => setFormData(prev => ({ ...prev, cheque: sugerido }))
                        )}
                    </div>

                    <div className="form-grid form-grid-3">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fecha</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="date" style={{ paddingLeft: '2.35rem', height: '36px', fontSize: '0.825rem', width: '100%' }} value={formData.fecha} onChange={e => setFormData({ ...formData, fecha: e.target.value })} required />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Fecha Aplicado</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="date" style={{ paddingLeft: '2.35rem', height: '36px', fontSize: '0.825rem', width: '100%' }} value={formData.fecha_aplicado} onChange={e => setFormData({ ...formData, fecha_aplicado: e.target.value })} />
                            </div>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Cheque #</label>
                            <div style={{ position: 'relative' }}>
                                <Hash size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input type="text" style={{ paddingLeft: '2.35rem', height: '36px', fontSize: '0.825rem', width: '100%' }} placeholder="Número de cheque" value={formData.cheque} onChange={e => setFormData({ ...formData, cheque: e.target.value })} required />
                            </div>
                        </div>
                    </div>

                    <div className="form-grid form-grid-2">
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Valor ($)</label>
                            <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.05rem' }}>$</span>
                                <input type="number" step="0.01" placeholder="0.00" style={{ paddingLeft: '2.1rem', height: '38px', fontSize: '1.05rem', fontWeight: 'bold', color: formData.cheque_anulado ? 'rgba(255,255,255,0.45)' : 'var(--primary)', textDecoration: formData.cheque_anulado ? 'line-through' : 'none', width: '100%' }} value={formData.valor} onChange={e => setFormData({ ...formData, valor: e.target.value })} onFocus={(e) => e.target.select()} disabled={formData.cheque_anulado} />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>A Nombre</label>
                        <div style={{ position: 'relative' }}>
                            <User size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input type="text" style={{ paddingLeft: '2.35rem', height: '36px', fontSize: '0.825rem', width: '100%', color: formData.cheque_anulado ? 'var(--danger)' : 'var(--text)' }} placeholder="Beneficiario del cheque" value={formData.a_nombre} onChange={e => setFormData({ ...formData, a_nombre: e.target.value })} disabled={formData.cheque_anulado} />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Concepto</label>
                        <input type="text" placeholder="Descripción del cheque..." style={{ width: '100%', height: '36px', fontSize: '0.825rem', textTransform: 'uppercase', color: formData.cheque_anulado ? 'var(--danger)' : 'var(--text)' }} value={formData.concepto} onChange={e => setFormData({ ...formData, concepto: e.target.value.toUpperCase() })} disabled={formData.cheque_anulado} />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Estado y Clasificación del Cheque</label>
                        <div className="form-grid form-grid-2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ToggleSwitch
                                    checked={formData.cheque_anulado}
                                    disabled={Boolean(editingCheque?.cheque_anulado)}
                                    onChange={v => {
                                        setFormData(prev => {
                                            if (v) {
                                                originalValues.current = { valor: prev.valor, a_nombre: prev.a_nombre, concepto: prev.concepto };
                                                return { ...prev, cheque_anulado: true, valor: '0', a_nombre: '***** CHEQUE ANULADO *****', concepto: '***** CHEQUE ANULADO *****' };
                                            }
                                            return { ...prev, cheque_anulado: false, valor: originalValues.current.valor, a_nombre: originalValues.current.a_nombre, concepto: originalValues.current.concepto };
                                        });
                                    }}
                                />
                                <span style={{ fontSize: '0.8rem', color: formData.cheque_anulado ? '#ef4444' : 'var(--text-muted)' }}>Anulado</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ToggleSwitch checked={formData.fue_noemitido} onChange={v => setFormData({ ...formData, fue_noemitido: v })} />
                                <span style={{ fontSize: '0.8rem', color: formData.fue_noemitido ? '#9ca3af' : 'var(--text-muted)' }}>No Emitido</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ToggleSwitch checked={formData.es_reservado} onChange={v => setFormData({ ...formData, es_reservado: v })} />
                                <span style={{ fontSize: '0.8rem', color: formData.es_reservado ? '#f59e0b' : 'var(--text-muted)' }}>Reservado</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ToggleSwitch checked={formData.es_pago_contado} onChange={v => setFormData({ ...formData, es_pago_contado: v })} />
                                <span style={{ fontSize: '0.8rem', color: formData.es_pago_contado ? '#3b82f6' : 'var(--text-muted)' }}>Pago de Contado</span>
                            </div>
                        </div>
                        {formData.cheque_anulado && (
                            <p style={{ margin: '0.45rem 0 0 0', fontSize: '0.72rem', color: '#f59e0b' }}>
                                {editingCheque?.cheque_anulado
                                    ? 'Cheque anulado (valores originales resguardados en auditoría).'
                                    : 'El valor, beneficiario y concepto original quedarán resguardados en auditoría al anular.'}
                            </p>
                        )}
                    </div>

                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ flex: 1, height: '36px', fontSize: '0.825rem' }} disabled={submitting}>Cancelar</button>
                        <button type="submit" className="btn-primary" disabled={submitting} style={{ flex: 2, height: '36px', fontSize: '0.825rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}>
                            <Save size={16} />
                            {submitting ? 'Guardando...' : (editingCheque ? 'Actualizar Cheque' : 'Guardar Cheque')}
                        </button>
                    </div>
                </form>
            </Modal>

            <ReportPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge={previewBadge}
                icon={Printer}
                pdfSource={previewPdfBlob}
                fileName={previewFileName}
                totalPages={1}
                footerInfo="Impresión oficial de cheque en formato Carta completo"
            />

            <style dangerouslySetInnerHTML={{ __html: `
                .cheques-page .hover-row:hover { background: rgba(255,255,255,0.03); }
            `}} />
        </div>
    );
}
