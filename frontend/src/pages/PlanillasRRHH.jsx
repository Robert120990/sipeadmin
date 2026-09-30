import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
    Users,
    Building2,
    Calendar,
    Search,
    Eye,
    FileText,
    ScrollText,
    Download,
    CheckCircle2,
    Clock,
    AlertCircle,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    FileSpreadsheet,
    DollarSign,
    Info,
    CreditCard,
    Layers,
    Files,
    Check,
    Plus,
    Trash2,
    Receipt
} from 'lucide-react';
import Modal from '../components/Modal';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';

const MONTH_NAMES = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

const formatMoney = (val) => {
    const n = parseFloat(val || 0);
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(n);
};

export default function PlanillasRRHH() {
    const { confirm } = useConfirm();
    const { addToast } = useToast();

    // Estado principal
    const [empresas, setEmpresas] = useState([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState('');
    const [loadingEmpresas, setLoadingEmpresas] = useState(true);

    // Filtros de períodos
    const [filterAnio, setFilterAnio] = useState(currentYear);
    const [filterMes, setFilterMes] = useState('');
    const [filterQuincena, setFilterQuincena] = useState('');

    // Datos de la tabla de períodos
    const [planillasGrupos, setPlanillasGrupos] = useState([]);
    const [loadingGrupos, setLoadingGrupos] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

    // Modales de detalle y exportación
    const [selectedPeriodoDetalle, setSelectedPeriodoDetalle] = useState(null);
    const [detalleData, setDetalleData] = useState(null);
    const [loadingDetalle, setLoadingDetalle] = useState(false);
    const [expandedEmpId, setExpandedEmpId] = useState(null);
    const [searchEmpDetalle, setSearchEmpDetalle] = useState('');
    const [filtroBranchDetalle, setFiltroBranchDetalle] = useState('');
    const [filtroDeptoDetalle, setFiltroDeptoDetalle] = useState('');
    const [branchesAndDeptos, setBranchesAndDeptos] = useState({ branches: [], departamentos: [] });

    // Modal de Exportación Bancaria
    const [exportModalPeriodo, setExportModalPeriodo] = useState(null);
    const [formatoBancario, setFormatoBancario] = useState('ambos'); // 'csv' | 'txt' | 'ambos'
    const [exportBranchId, setExportBranchId] = useState('');
    const [exportDeptoId, setExportDeptoId] = useState('');
    const [exportingBancario, setExportingBancario] = useState(false);

    // ReportPreviewModal (PDFs oficiales y recibos)
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewPdfSource, setPreviewPdfSource] = useState(null);
    const [previewTitle, setPreviewTitle] = useState('');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewFileName, setPreviewFileName] = useState('');
    const [previewBadge, setPreviewBadge] = useState('');
    const [loadingPdf, setLoadingPdf] = useState(false);

    // Modal de Registro de Pago de Planilla (Afecta Bancos y Conciliación)
    const [pagoModalPeriodo, setPagoModalPeriodo] = useState(null);
    const [cuentasBancarias, setCuentasBancarias] = useState([]);
    const [loadingCuentasPago, setLoadingCuentasPago] = useState(false);
    const [pagoRows, setPagoRows] = useState([]);
    const [savingPago, setSavingPago] = useState(false);

    // Modal de Ver Pagos Registrados
    const [verPagosModalPeriodo, setVerPagosModalPeriodo] = useState(null);
    const [pagosRegistrados, setPagosRegistrados] = useState([]);
    const [loadingPagosRegistrados, setLoadingPagosRegistrados] = useState(false);
    const [anulandoPagoId, setAnulandoPagoId] = useState(null);

    // 1. Cargar lista de empresas desde backend
    useEffect(() => {
        const fetchEmpresas = async () => {
            setLoadingEmpresas(true);
            try {
                const res = await api.get('/rrhh/empresas');
                const list = res.data || [];
                setEmpresas(list);
                if (list.length > 0) {
                    // Seleccionar la primera empresa que tenga períodos o la primera de la lista
                    const firstWithData = list.find(e => parseInt(e.total_periodos, 10) > 0) || list[0];
                    setSelectedCompanyId(String(firstWithData.id));
                }
            } catch (err) {
                console.error('Error cargando empresas:', err);
                addToast(err.response?.data?.message || 'Error al cargar catálogo de empresas de Sipe Web', 'error');
            } finally {
                setLoadingEmpresas(false);
            }
        };
        fetchEmpresas();
    }, []);

    // 2. Cargar filtros (sucursales y departamentos) cuando cambia la empresa
    useEffect(() => {
        if (!selectedCompanyId) return;
        const fetchFiltros = async () => {
            try {
                const res = await api.get('/rrhh/filtros', { params: { company_id: selectedCompanyId } });
                setBranchesAndDeptos(res.data || { branches: [], departamentos: [] });
            } catch (err) {
                console.error('Error cargando filtros:', err);
            }
        };
        fetchFiltros();
    }, [selectedCompanyId]);

    // 3. Cargar períodos agrupados cuando cambia la empresa o filtros
    const fetchGrupos = async (page = 1) => {
        if (!selectedCompanyId) return;
        setLoadingGrupos(true);
        try {
            const params = {
                company_id: selectedCompanyId,
                anio: filterAnio || undefined,
                mes: filterMes || undefined,
                quincena: filterQuincena || undefined,
                page,
                limit: 15
            };
            const res = await api.get('/rrhh/planillas/grupos', { params });
            setPlanillasGrupos(res.data.data || []);
            setPagination({
                page: res.data.page || 1,
                total: res.data.total || 0,
                totalPages: res.data.totalPages || 1
            });
        } catch (err) {
            console.error('Error cargando planillas:', err);
            addToast(err.response?.data?.message || 'Error al consultar planillas de la empresa', 'error');
        } finally {
            setLoadingGrupos(false);
        }
    };

    useEffect(() => {
        if (selectedCompanyId) {
            fetchGrupos(1);
        }
    }, [selectedCompanyId, filterAnio, filterMes, filterQuincena]);

    // Empresa actual seleccionada
    const currentEmpresa = useMemo(() => {
        return empresas.find(e => String(e.id) === String(selectedCompanyId)) || null;
    }, [empresas, selectedCompanyId]);

    // 4. Abrir modal de detalles (Icono Ojo)
    const handleVerDetalles = async (periodo) => {
        setSelectedPeriodoDetalle(periodo);
        setDetalleData(null);
        setSearchEmpDetalle('');
        setFiltroBranchDetalle('');
        setFiltroDeptoDetalle('');
        setExpandedEmpId(null);
        setLoadingDetalle(true);

        try {
            const res = await api.get('/rrhh/planillas/detalle', {
                params: {
                    company_id: selectedCompanyId,
                    anio: periodo.periodo_anio,
                    mes: periodo.periodo_mes,
                    quincena: periodo.quincena
                }
            });
            setDetalleData(res.data);
        } catch (err) {
            console.error('Error cargando detalle:', err);
            addToast(err.response?.data?.message || 'Error al cargar detalle de planilla', 'error');
        } finally {
            setLoadingDetalle(false);
        }
    };

    // Filtrar empleados en el modal de detalle
    const filteredEmpleados = useMemo(() => {
        if (!detalleData?.empleados) return [];
        return detalleData.empleados.filter(emp => {
            if (filtroBranchDetalle && String(emp.branch_id) !== String(filtroBranchDetalle)) return false;
            if (filtroDeptoDetalle && String(emp.departamento_personal_id) !== String(filtroDeptoDetalle)) return false;
            if (searchEmpDetalle.trim()) {
                const s = searchEmpDetalle.toLowerCase();
                const nom = `${emp.empleado_nombres} ${emp.empleado_apellidos}`.toLowerCase();
                const cod = (emp.empleado_codigo || '').toLowerCase();
                const dui = (emp.num_dui || '').toLowerCase();
                if (!nom.includes(s) && !cod.includes(s) && !dui.includes(s)) return false;
            }
            return true;
        });
    }, [detalleData, searchEmpDetalle, filtroBranchDetalle, filtroDeptoDetalle]);

    // 5. Generar y previsualizar Planilla Oficial PDF
    const handleVerPdfOficial = async (periodo) => {
        setLoadingPdf(true);
        try {
            const mesNombre = MONTH_NAMES.find(m => m.value === periodo.periodo_mes)?.label || periodo.periodo_mes;
            const qNombre = periodo.quincena === 'primera' ? '1ra Quincena' : '2da Quincena';

            const res = await api.get('/rrhh/export/pdf', {
                params: {
                    company_id: selectedCompanyId,
                    anio: periodo.periodo_anio,
                    mes: periodo.periodo_mes,
                    quincena: periodo.quincena
                },
                responseType: 'blob'
            });

            const blob = new Blob([res.data], { type: 'application/pdf' });
            setPreviewPdfSource(blob);
            setPreviewTitle('Planilla Oficial de Sueldos y Salarios');
            setPreviewSubtitle(`${currentEmpresa?.razon_social || 'Empresa'} — ${mesNombre} ${periodo.periodo_anio} (${qNombre})`);
            setPreviewFileName(`Planilla_${periodo.periodo_anio}_${periodo.periodo_mes}_${periodo.quincena}.pdf`);
            setPreviewBadge(periodo.estado_general === 'pagada' ? 'CERRADA / PAGADA' : 'ABIERTA / EN PROCESO');
            setPreviewModalOpen(true);
        } catch (err) {
            console.error('Error generando PDF oficial:', err);
            addToast(err.response?.data?.message || 'Error al generar vista previa de planilla oficial', 'error');
        } finally {
            setLoadingPdf(false);
        }
    };

    // 6. Generar y previsualizar Recibos Masivos PDF
    const handleVerRecibosMasivos = async (periodo) => {
        setLoadingPdf(true);
        try {
            const mesNombre = MONTH_NAMES.find(m => m.value === periodo.periodo_mes)?.label || periodo.periodo_mes;
            const qNombre = periodo.quincena === 'primera' ? '1ra Quincena' : '2da Quincena';

            const res = await api.get('/rrhh/export/recibos', {
                params: {
                    company_id: selectedCompanyId,
                    anio: periodo.periodo_anio,
                    mes: periodo.periodo_mes,
                    quincena: periodo.quincena
                },
                responseType: 'blob'
            });

            const blob = new Blob([res.data], { type: 'application/pdf' });
            setPreviewPdfSource(blob);
            setPreviewTitle('Recibos Masivos de Pago de Salarios');
            setPreviewSubtitle(`${currentEmpresa?.razon_social || 'Empresa'} — ${mesNombre} ${periodo.periodo_anio} (${qNombre})`);
            setPreviewFileName(`Recibos_Masivos_${periodo.periodo_anio}_${periodo.periodo_mes}_${periodo.quincena}.pdf`);
            setPreviewBadge('2 RECIBOS POR PÁGINA (CARTA)');
            setPreviewModalOpen(true);
        } catch (err) {
            console.error('Error generando recibos masivos:', err);
            addToast(err.response?.data?.message || 'Error al generar vista previa de recibos masivos', 'error');
        } finally {
            setLoadingPdf(false);
        }
    };

    // 7. Generar y previsualizar Recibo Individual
    const handleVerReciboIndividual = async (emp) => {
        setLoadingPdf(true);
        try {
            const res = await api.get(`/rrhh/export/recibo/${emp.id}`, {
                params: { company_id: selectedCompanyId },
                responseType: 'blob'
            });

            const blob = new Blob([res.data], { type: 'application/pdf' });
            setPreviewPdfSource(blob);
            setPreviewTitle('Recibo Individual de Salario');
            setPreviewSubtitle(`Empleado: ${emp.empleado_nombres} ${emp.empleado_apellidos} (Cód: ${emp.empleado_codigo})`);
            setPreviewFileName(`Recibo_${emp.empleado_codigo}_${emp.id}.pdf`);
            setPreviewBadge('COPIA EMPRESA / COPIA EMPLEADO');
            setPreviewModalOpen(true);
        } catch (err) {
            console.error('Error generando recibo individual:', err);
            addToast(err.response?.data?.message || 'Error al generar recibo individual', 'error');
        } finally {
            setLoadingPdf(false);
        }
    };

    // 8. Descarga de Archivo Bancario (CSV / TXT)
    const handleDescargarBancario = async () => {
        if (!exportModalPeriodo) return;
        setExportingBancario(true);
        try {
            const params = {
                company_id: selectedCompanyId,
                anio: exportModalPeriodo.periodo_anio,
                mes: exportModalPeriodo.periodo_mes,
                quincena: exportModalPeriodo.quincena,
                branch_ids: exportBranchId || undefined,
                departamento_ids: exportDeptoId || undefined,
                formato: formatoBancario
            };

            const triggerDownload = (content, filename, mimeType) => {
                const blob = new Blob([content], { type: mimeType });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => window.URL.revokeObjectURL(url), 1000);
            };

            const res = await api.get('/rrhh/export/bancario', { params });
            const data = res.data || {};

            // Compatibilidad robusta: si vino como string directo o como objeto JSON
            const csvContent = typeof data === 'string' ? data : (data.csv || '');
            const txtContent = typeof data === 'string' ? data : (data.txt || '');
            const fileNameBase = data.fileNameBase || `PLANILLAS_${currentEmpresa?.nombre_comercial || 'EMPRESA'}_${exportModalPeriodo.periodo_anio}_${String(exportModalPeriodo.periodo_mes).padStart(2, '0')}_${exportModalPeriodo.quincena}`;

            let downloadedCount = 0;

            if ((formatoBancario === 'csv' || formatoBancario === 'ambos') && csvContent) {
                triggerDownload(csvContent, `${fileNameBase}.csv`, 'text/csv;charset=utf-8');
                downloadedCount++;
            }

            if ((formatoBancario === 'txt' || formatoBancario === 'ambos') && txtContent) {
                if (formatoBancario === 'ambos') {
                    setTimeout(() => {
                        triggerDownload(txtContent, `${fileNameBase}.txt`, 'text/plain;charset=utf-8');
                    }, 250);
                } else {
                    triggerDownload(txtContent, `${fileNameBase}.txt`, 'text/plain;charset=utf-8');
                }
                downloadedCount++;
            }

            if (downloadedCount > 0) {
                addToast('Archivo(s) bancario(s) generado(s) y descargado(s) exitosamente', 'success');
            } else {
                addToast('No se generaron registros para los filtros seleccionados', 'warning');
            }
            setExportModalPeriodo(null);
        } catch (err) {
            console.error('Error exportando bancario:', err);
            addToast(err.response?.data?.message || 'Error al exportar archivo bancario', 'error');
        } finally {
            setExportingBancario(false);
        }
    };

    // ── GESTIÓN DE FORMAS DE PAGO Y AFECTACIÓN BANCARIA ──

    // Abrir modal para registrar pago
    const handleAbrirModalPago = async (periodo) => {
        setPagoModalPeriodo(periodo);
        setLoadingCuentasPago(true);
        try {
            const res = await api.get('/rrhh/cuentas-bancarias', {
                params: { company_id: selectedCompanyId }
            });
            const cuentas = res.data?.cuentas || [];
            setCuentasBancarias(cuentas);

            // Pre-seleccionar cuenta sugerida o primera disponible
            const cuentaSugerida = cuentas.find(c => c.es_sugerida) || cuentas[0];
            const primerCuentaId = cuentaSugerida ? cuentaSugerida.id : '';

            // Inicializar fila con el monto neto total de la planilla
            setPagoRows([
                {
                    tempId: Date.now(),
                    cuenta_bancaria_id: primerCuentaId,
                    forma_pago: 'Transferencia',
                    tipo_remesa_codigo: 'TR',
                    documento: '',
                    monto: Number(periodo.total_neto || 0).toFixed(2),
                    fecha_pago: new Date().toISOString().split('T')[0],
                    concepto: ''
                }
            ]);
        } catch (err) {
            console.error('Error cargando cuentas bancarias:', err);
            addToast('Error al cargar catálogo de cuentas bancarias', 'error');
        } finally {
            setLoadingCuentasPago(false);
        }
    };

    // Agregar nueva fila de forma de pago
    const handleAddPagoRow = () => {
        if (!pagoModalPeriodo) return;
        const totalActual = pagoRows.reduce((acc, r) => acc + (parseFloat(r.monto) || 0), 0);
        const netoTotal = parseFloat(pagoModalPeriodo.total_neto || 0);
        const restante = Math.max(0, netoTotal - totalActual);

        const cuentaSugerida = cuentasBancarias.find(c => c.es_sugerida) || cuentasBancarias[0];
        setPagoRows(prev => [
            ...prev,
            {
                tempId: Date.now() + Math.random(),
                cuenta_bancaria_id: cuentaSugerida ? cuentaSugerida.id : '',
                forma_pago: 'Transferencia',
                tipo_remesa_codigo: 'TR',
                documento: '',
                monto: restante > 0 ? restante.toFixed(2) : '',
                fecha_pago: new Date().toISOString().split('T')[0],
                concepto: ''
            }
        ]);
    };

    // Eliminar fila de forma de pago
    const handleRemovePagoRow = (index) => {
        if (pagoRows.length <= 1) return;
        setPagoRows(prev => prev.filter((_, i) => i !== index));
    };

    // Modificar campo de una fila
    const handlePagoRowChange = (index, field, value) => {
        setPagoRows(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            if (field === 'forma_pago') {
                if (value.toLowerCase().includes('cheque')) next[index].tipo_remesa_codigo = 'CH';
                else if (value.toLowerCase().includes('cargo') || value.toLowerCase().includes('debito')) next[index].tipo_remesa_codigo = 'NC';
                else next[index].tipo_remesa_codigo = 'TR';
            }
            return next;
        });
    };

    // Guardar pago
    const handleSubmitPago = async () => {
        if (!pagoModalPeriodo) return;

        // Validaciones
        for (let i = 0; i < pagoRows.length; i++) {
            const r = pagoRows[i];
            if (!r.cuenta_bancaria_id) {
                addToast(`Fila ${i + 1}: Debe seleccionar una cuenta bancaria`, 'warning');
                return;
            }
            const m = parseFloat(r.monto);
            if (isNaN(m) || m <= 0) {
                addToast(`Fila ${i + 1}: Ingrese un monto mayor a cero`, 'warning');
                return;
            }
            if (!r.fecha_pago) {
                addToast(`Fila ${i + 1}: Ingrese la fecha de pago`, 'warning');
                return;
            }
        }

        const totalPagos = pagoRows.reduce((acc, r) => acc + (parseFloat(r.monto) || 0), 0);
        const netoPlanilla = parseFloat(pagoModalPeriodo.total_neto || 0);

        if (Math.abs(totalPagos - netoPlanilla) > 0.05) {
            const proced = await confirm(
                `Atención: La suma de formas de pago (${formatMoney(totalPagos)}) difiere del neto total de la planilla (${formatMoney(netoPlanilla)}). ¿Deseas continuar con el registro de todas formas?`,
                { variant: 'warning' }
            );
            if (!proced) return;
        }

        const confirmed = await confirm(
            `¿Confirmas registrar el pago de la planilla por un total de ${formatMoney(totalPagos)} afectando ${pagoRows.length} movimiento(s) en Bancos? Estos movimientos quedarán disponibles para conciliación bancaria futura.`,
            { variant: 'primary' }
        );
        if (!confirmed) return;

        setSavingPago(true);
        try {
            const payload = {
                company_id: parseInt(selectedCompanyId, 10),
                anio: pagoModalPeriodo.periodo_anio,
                mes: pagoModalPeriodo.periodo_mes,
                quincena: pagoModalPeriodo.quincena,
                pagos: pagoRows.map(r => ({
                    cuenta_bancaria_id: r.cuenta_bancaria_id,
                    forma_pago: r.forma_pago,
                    tipo_remesa_codigo: r.tipo_remesa_codigo,
                    documento: r.documento,
                    monto: parseFloat(r.monto),
                    fecha_pago: r.fecha_pago,
                    concepto: r.concepto
                }))
            };

            const res = await api.post('/rrhh/planillas/pagar', payload);
            addToast(res.data?.message || 'Pago registrado exitosamente en Bancos', 'success');
            setPagoModalPeriodo(null);
            fetchGrupos(pagination.page);
        } catch (err) {
            console.error('Error registrando pago:', err);
            addToast(err.response?.data?.message || 'Error al registrar el pago de la planilla', 'error');
        } finally {
            setSavingPago(false);
        }
    };

    // Abrir modal para ver pagos
    const handleAbrirVerPagos = async (periodo) => {
        setVerPagosModalPeriodo(periodo);
        setLoadingPagosRegistrados(true);
        try {
            const res = await api.get('/rrhh/planillas/pagos', {
                params: {
                    company_id: selectedCompanyId,
                    anio: periodo.periodo_anio,
                    mes: periodo.periodo_mes,
                    quincena: periodo.quincena
                }
            });
            setPagosRegistrados(res.data || []);
        } catch (err) {
            console.error('Error cargando pagos:', err);
            addToast('Error al consultar los pagos registrados', 'error');
        } finally {
            setLoadingPagosRegistrados(false);
        }
    };

    // Anular un pago registrado
    const handleAnularPago = async (pago) => {
        if (pago.es_conciliado) {
            addToast(`No es posible anular este pago porque el movimiento ya fue conciliado en Bancos (${pago.fecha_aplicado}). Debe desconciliarlo primero en Bancos > Conciliación Bancaria.`, 'warning');
            return;
        }

        const confirmed = await confirm(
            `¿Estás seguro de anular este pago por ${formatMoney(pago.monto)}? Se eliminará el movimiento bancario (#${pago.movimiento_bancario_id || pago.id}) asociado en Bancos.`,
            { variant: 'danger' }
        );
        if (!confirmed) return;

        setAnulandoPagoId(pago.id);
        try {
            const res = await api.delete(`/rrhh/planillas/pagos/${pago.id}`);
            addToast(res.data?.message || 'Pago anulado correctamente', 'success');
            // Refrescar lista de pagos
            const resPagos = await api.get('/rrhh/planillas/pagos', {
                params: {
                    company_id: selectedCompanyId,
                    anio: verPagosModalPeriodo.periodo_anio,
                    mes: verPagosModalPeriodo.periodo_mes,
                    quincena: verPagosModalPeriodo.quincena
                }
            });
            const nuevosPagos = resPagos.data || [];
            setPagosRegistrados(nuevosPagos);
            if (nuevosPagos.length === 0) {
                setVerPagosModalPeriodo(null);
            }
            fetchGrupos(pagination.page);
        } catch (err) {
            console.error('Error anulando pago:', err);
            addToast(err.response?.data?.message || 'Error al anular el pago', 'error');
        } finally {
            setAnulandoPagoId(null);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header de la Pantalla */}
            <div className="page-header" style={{ marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.5rem', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)' }}>
                        <Users size={22} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                            Recursos Humanos — Planillas
                        </h1>
                        <p style={{ fontSize: '0.8rem', margin: 0, color: 'var(--text-muted)' }}>
                            Consulta de planillas por empresa sincronizadas desde Sipe Web SaaS (Modo Sólo Lectura)
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        padding: '0.3rem 0.65rem',
                        borderRadius: '20px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#059669',
                        fontWeight: 600
                    }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                        Sipe Web DB Conectada
                    </span>
                </div>
            </div>

            {/* Selector de Empresa y Filtros de Búsqueda */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
                    {/* Selector de Empresa */}
                    <div style={{ flex: '1 1 280px', minWidth: '240px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                            <Building2 size={14} color="var(--primary)" />
                            Empresa en Sipe Web
                        </label>
                        <select
                            value={selectedCompanyId}
                            onChange={(e) => setSelectedCompanyId(e.target.value)}
                            disabled={loadingEmpresas}
                            style={{
                                width: '100%',
                                height: '38px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                padding: '0 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg, #fff)',
                                color: 'var(--text-main)',
                                outline: 'none'
                            }}
                        >
                            {empresas.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.razon_social} {emp.nombre_comercial ? `(${emp.nombre_comercial})` : ''} — [{emp.total_periodos} planillas]
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Filtro Año */}
                    <div style={{ width: '120px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                            <Calendar size={13} />
                            Año
                        </label>
                        <select
                            value={filterAnio}
                            onChange={(e) => setFilterAnio(parseInt(e.target.value, 10))}
                            style={{
                                width: '100%',
                                height: '38px',
                                fontSize: '0.825rem',
                                padding: '0 0.5rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg, #fff)',
                                color: 'var(--text-main)'
                            }}
                        >
                            {YEARS.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* Filtro Mes */}
                    <div style={{ width: '140px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                            Mes
                        </label>
                        <select
                            value={filterMes}
                            onChange={(e) => setFilterMes(e.target.value ? parseInt(e.target.value, 10) : '')}
                            style={{
                                width: '100%',
                                height: '38px',
                                fontSize: '0.825rem',
                                padding: '0 0.5rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg, #fff)',
                                color: 'var(--text-main)'
                            }}
                        >
                            <option value="">Todos los meses</option>
                            {MONTH_NAMES.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Filtro Quincena */}
                    <div style={{ width: '140px' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                            Quincena
                        </label>
                        <select
                            value={filterQuincena}
                            onChange={(e) => setFilterQuincena(e.target.value)}
                            style={{
                                width: '100%',
                                height: '38px',
                                fontSize: '0.825rem',
                                padding: '0 0.5rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg, #fff)',
                                color: 'var(--text-main)'
                            }}
                        >
                            <option value="">Todas</option>
                            <option value="primera">1ra Quincena</option>
                            <option value="segunda">2da Quincena</option>
                        </select>
                    </div>

                    {/* Botón Refrescar */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => fetchGrupos(1)}
                            disabled={loadingGrupos}
                            className="btn btn-secondary"
                            style={{ height: '38px', padding: '0 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}
                            title="Actualizar listado de planillas"
                        >
                            <RotateCcw size={15} className={loadingGrupos ? 'spin' : ''} />
                            <span>Actualizar</span>
                        </button>
                    </div>
                </div>

                {/* Banner Informativo del Módulo y de la Empresa Actual */}
                {currentEmpresa && (
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        background: 'rgba(99, 102, 241, 0.05)',
                        border: '1px solid rgba(99, 102, 241, 0.15)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        fontSize: '0.8rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <Info size={16} color="var(--primary)" />
                            <span>
                                <strong>{currentEmpresa.razon_social}</strong> (NIT: {currentEmpresa.nit || 'N/A'}, NRC: {currentEmpresa.nrc || 'N/A'}) — {currentEmpresa.total_empleados_activos} empleados activos registrados.
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                                Cerrada = Lista para pagar
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', opacity: 0.7 }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                                Abierta = No lista para pagar (color tenue)
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabla de Planillas Agrupadas */}
            <div className="card glass table-responsive" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Período</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)' }}>Quincena</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'center' }}># Emp</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Sueldo Quinc.</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Ing. Adic.</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Total Dev.</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>ISSS</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>AFP</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Renta</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Total Ded.</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'right' }}>Neto Pagar</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'center' }}>Estado / Condición</th>
                            <th style={{ padding: '0.55rem 0.65rem', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-muted)', textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loadingGrupos ? (
                            <tr>
                                <td colSpan={13} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    Cargando planillas registradas...
                                </td>
                            </tr>
                        ) : planillasGrupos.length === 0 ? (
                            <tr>
                                <td colSpan={13} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertCircle size={28} color="#94a3b8" />
                                        <span>No se encontraron planillas para los filtros seleccionados en esta empresa.</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            planillasGrupos.map((item) => {
                                const mesNom = MONTH_NAMES.find(m => m.value === item.periodo_mes)?.label || item.periodo_mes;
                                const isCerrada = item.estado_general === 'pagada';

                                // REGLA OBLIGATORIA DEL USUARIO:
                                // "la planilla tiene que estar cerrada para poder ser visualizada como lista para pagar,
                                //  de lo contrario mostrar en color mas tenue que aun no esta lista para ser pagada."
                                const rowStyle = isCerrada ? {
                                    borderBottom: '1px solid var(--border-color)',
                                    transition: 'background-color 0.15s ease'
                                } : {
                                    borderBottom: '1px solid var(--border-color)',
                                    opacity: 0.65, // Color más tenue solicitado explícitamente
                                    background: 'rgba(241, 245, 249, 0.4)',
                                    transition: 'background-color 0.15s ease'
                                };

                                return (
                                    <tr key={`${item.periodo_anio}-${item.periodo_mes}-${item.quincena}`} style={rowStyle} className="hover-row">
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                            {mesNom} {item.periodo_anio}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem' }}>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                padding: '0.15rem 0.45rem',
                                                borderRadius: '4px',
                                                background: item.quincena === 'primera' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                                color: item.quincena === 'primera' ? '#2563eb' : '#7c3aed'
                                            }}>
                                                {item.quincena === 'primera' ? '1ra Quincena' : '2da Quincena'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', color: 'var(--text-main)' }}>
                                            {item.total_empleados}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem', textAlign: 'right', color: 'var(--text-main)' }}>
                                            {formatMoney(item.total_sueldos_quincenal)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                            {formatMoney(item.total_ingresos_adic)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem', fontWeight: 700, textAlign: 'right', color: '#0284c7' }}>
                                            {formatMoney(item.total_percepciones)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.78rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                            {formatMoney(item.total_isss)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.78rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                            {formatMoney(item.total_afp)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.78rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                            {formatMoney(item.total_renta)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.8rem', fontWeight: 700, textAlign: 'right', color: '#dc2626' }}>
                                            {formatMoney(item.total_deducciones)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', fontSize: '0.85rem', fontWeight: 800, textAlign: 'right', color: '#059669' }}>
                                            {formatMoney(item.total_neto)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', textAlign: 'center' }}>
                                            {isCerrada ? (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '0.2rem 0.55rem',
                                                    borderRadius: '12px',
                                                    background: 'rgba(16, 185, 129, 0.15)',
                                                    color: '#047857'
                                                }}>
                                                    <CheckCircle2 size={13} />
                                                    Pagada
                                                </span>
                                            ) : (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    padding: '0.2rem 0.55rem',
                                                    borderRadius: '12px',
                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                    color: '#b45309'
                                                }} title="Planilla pendiente de pago. Presiona 'Pagar' para registrar formas de pago y afectar Bancos.">
                                                    <Clock size={13} />
                                                    Pendiente de Pago
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                {/* Botón Pagar Planilla o Ver Pagos según corresponda */}
                                                {isCerrada ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAbrirVerPagos(item)}
                                                        className="btn-secondary"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem',
                                                            padding: '0.28rem 0.55rem',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            borderRadius: '6px',
                                                            background: 'rgba(16, 185, 129, 0.12)',
                                                            color: '#047857',
                                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                                            cursor: 'pointer'
                                                        }}
                                                        title="Ver formas de pago registradas y movimientos en Bancos"
                                                    >
                                                        <Receipt size={14} />
                                                        <span>Ver Pago</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAbrirModalPago(item)}
                                                        className="btn-primary"
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.3rem',
                                                            padding: '0.28rem 0.65rem',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            borderRadius: '6px',
                                                            background: '#2563eb',
                                                            color: '#ffffff',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)'
                                                        }}
                                                        title="Registrar formas de pago y afectar cuentas en Bancos (conciliable)"
                                                    >
                                                        <CreditCard size={14} />
                                                        <span>Pagar</span>
                                                    </button>
                                                )}

                                                {/* Icono Ojo: Ver Detalles de Planilla (Modo Sólo Lectura) */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleVerDetalles(item)}
                                                    className="icon-btn"
                                                    style={{ padding: '0.35rem', borderRadius: '6px', color: 'var(--primary)' }}
                                                    title="Ver planilla tal como fue creada (Icono Ojo - Sólo Lectura)"
                                                >
                                                    <Eye size={17} />
                                                </button>

                                                {/* Icono PDF Oficial */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleVerPdfOficial(item)}
                                                    disabled={loadingPdf}
                                                    className="icon-btn"
                                                    style={{ padding: '0.35rem', borderRadius: '6px', color: '#0284c7' }}
                                                    title="Ver Planilla Oficial (PDF)"
                                                >
                                                    <FileText size={17} />
                                                </button>

                                                {/* Icono Recibos Masivos */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleVerRecibosMasivos(item)}
                                                    disabled={loadingPdf}
                                                    className="icon-btn"
                                                    style={{ padding: '0.35rem', borderRadius: '6px', color: '#7c3aed' }}
                                                    title="Ver Recibos Masivos (PDF)"
                                                >
                                                    <ScrollText size={17} />
                                                </button>

                                                {/* Icono Exportación Bancaria */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setExportModalPeriodo(item);
                                                        setExportBranchId('');
                                                        setExportDeptoId('');
                                                        setFormatoBancario('ambos');
                                                    }}
                                                    className="icon-btn"
                                                    style={{ padding: '0.35rem', borderRadius: '6px', color: '#059669' }}
                                                    title="Exportar archivo bancario (CSV / TXT)"
                                                >
                                                    <Download size={17} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Detalle de Planilla (Icono Ojo) */}
            <Modal
                isOpen={Boolean(selectedPeriodoDetalle)}
                onClose={() => setSelectedPeriodoDetalle(null)}
                title={`Detalle de Planilla — ${MONTH_NAMES.find(m => m.value === selectedPeriodoDetalle?.periodo_mes)?.label || ''} ${selectedPeriodoDetalle?.periodo_anio} (${selectedPeriodoDetalle?.quincena === 'primera' ? '1ra Quincena' : '2da Quincena'})`}
                size="xl"
            >
                <div>
                    {/* Alerta Modo Sólo Lectura */}
                    <div style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        marginBottom: '1rem',
                        fontSize: '0.8rem',
                        color: '#92400e'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertCircle size={17} color="#d97706" />
                            <span>
                                <strong>Modo Sólo Lectura (Sipe Web SaaS):</strong> Los datos se presentan exactamente como fueron calculados. Para registrar novedades, agregar empleados o ajustar valores debe acceder directamente a la plataforma <a href="https://sys.sipesv.com/rh/planillas" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: '#b45309', fontWeight: 600 }}>sys.sipesv.com</a>.
                            </span>
                        </div>
                        {selectedPeriodoDetalle?.estado_general === 'pagada' ? (
                            <button
                                type="button"
                                onClick={() => handleAbrirVerPagos(selectedPeriodoDetalle)}
                                style={{ fontSize: '0.74rem', fontWeight: 700, background: '#10b981', color: '#fff', padding: '0.25rem 0.65rem', borderRadius: '4px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                                title="Ver detalle de formas de pago y movimientos en Bancos"
                            >
                                <Receipt size={13} />
                                Planilla Pagada (Ver Pagos)
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => handleAbrirModalPago(selectedPeriodoDetalle)}
                                style={{ fontSize: '0.74rem', fontWeight: 700, background: '#2563eb', color: '#fff', padding: '0.25rem 0.65rem', borderRadius: '4px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', boxShadow: '0 1px 2px rgba(37, 99, 235, 0.3)' }}
                                title="Registrar formas de pago y afectar cuentas bancarias"
                            >
                                <CreditCard size={13} />
                                Pagar Planilla (Afectar Bancos)
                            </button>
                        )}
                    </div>

                    {/* Resumen KPIs del Período */}
                    {detalleData?.totales && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div className="card glass" style={{ padding: '0.75rem 1rem' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Empleados</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                                    {detalleData.totales.total_empleados}
                                </div>
                            </div>
                            <div className="card glass" style={{ padding: '0.75rem 1rem' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Percepciones</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7', marginTop: '0.2rem' }}>
                                    {formatMoney(detalleData.totales.total_percepciones)}
                                </div>
                            </div>
                            <div className="card glass" style={{ padding: '0.75rem 1rem' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Deducciones</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626', marginTop: '0.2rem' }}>
                                    {formatMoney(detalleData.totales.total_deducciones)}
                                </div>
                            </div>
                            <div className="card glass" style={{ padding: '0.75rem 1rem' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Líquido a Pagar</span>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', marginTop: '0.2rem' }}>
                                    {formatMoney(detalleData.totales.total_neto)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Filtros dentro del Modal de Detalle */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                        <div style={{ flex: '1 1 200px', position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Buscar por código, nombre o DUI..."
                                value={searchEmpDetalle}
                                onChange={(e) => setSearchEmpDetalle(e.target.value)}
                                style={{
                                    width: '100%',
                                    height: '36px',
                                    fontSize: '0.825rem',
                                    paddingLeft: '2.2rem',
                                    paddingRight: '0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--card-bg, #fff)',
                                    color: 'var(--text-main)'
                                }}
                            />
                        </div>

                        {branchesAndDeptos.branches.length > 0 && (
                            <select
                                value={filtroBranchDetalle}
                                onChange={(e) => setFiltroBranchDetalle(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                            >
                                <option value="">Todas las sucursales</option>
                                {branchesAndDeptos.branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.nombre}</option>
                                ))}
                            </select>
                        )}

                        {branchesAndDeptos.departamentos.length > 0 && (
                            <select
                                value={filtroDeptoDetalle}
                                onChange={(e) => setFiltroDeptoDetalle(e.target.value)}
                                style={{ height: '36px', fontSize: '0.825rem', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                            >
                                <option value="">Todos los departamentos</option>
                                {branchesAndDeptos.departamentos.map(d => (
                                    <option key={d.id} value={d.id}>{d.descripcion}</option>
                                ))}
                            </select>
                        )}

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
                            <button
                                type="button"
                                onClick={() => handleVerPdfOficial(selectedPeriodoDetalle)}
                                className="btn btn-secondary"
                                style={{ height: '36px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <FileText size={15} color="#0284c7" />
                                <span>Planilla PDF</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleVerRecibosMasivos(selectedPeriodoDetalle)}
                                className="btn btn-secondary"
                                style={{ height: '36px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                                <ScrollText size={15} color="#7c3aed" />
                                <span>Recibos PDF</span>
                            </button>
                        </div>
                    </div>

                    {/* Tabla de Empleados en el Detalle */}
                    <div className="table-responsive" style={{ maxHeight: '480px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                        <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 1 }}>
                                    <th style={{ padding: '0.45rem 0.5rem', width: '32px' }}></th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>CÓDIGO</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>EMPLEADO</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>CARGO / DEPTO</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>CUENTA BANCARIA</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>DÍAS</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>S. BASE</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>S. QUINC.</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: '#0284c7', textAlign: 'right' }}>DEVENGADO</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: '#dc2626', textAlign: 'right' }}>DEDUCCIONES</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: '#059669', textAlign: 'right' }}>NETO A RECIBIR</th>
                                    <th style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center' }}>RECIBO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loadingDetalle ? (
                                    <tr>
                                        <td colSpan={12} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Cargando detalle de empleados...
                                        </td>
                                    </tr>
                                ) : filteredEmpleados.length === 0 ? (
                                    <tr>
                                        <td colSpan={12} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No se encontraron empleados coincidentes.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEmpleados.map((emp) => {
                                        const isExpanded = expandedEmpId === emp.id;
                                        return (
                                            <React.Fragment key={emp.id}>
                                                <tr
                                                    onClick={() => setExpandedEmpId(isExpanded ? null : emp.id)}
                                                    style={{
                                                        borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)',
                                                        background: isExpanded ? 'rgba(99, 102, 241, 0.04)' : 'transparent',
                                                        cursor: 'pointer'
                                                    }}
                                                    className="hover-row"
                                                >
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                        {isExpanded ? <ChevronUp size={15} color="var(--primary)" /> : <ChevronDown size={15} color="var(--text-muted)" />}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                                        {emp.empleado_codigo}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                                        {emp.empleado_nombres} {emp.empleado_apellidos}
                                                        {emp.num_dui && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>DUI: {emp.num_dui}</div>}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>
                                                        {emp.cargo_nombre || '—'}
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{emp.departamento_nombre || emp.branch_nombre || '—'}</div>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                                                        {emp.cuenta_planillera || '—'}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                        {emp.dias_trabajados || 15}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                        {formatMoney(emp.sueldo_base)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                                                        {formatMoney(emp.sueldo_quincenal)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>
                                                        {formatMoney(emp.total_percepciones)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                                                        {formatMoney(emp.total_deducciones)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                                                        {formatMoney(emp.monto_recibir)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleVerReciboIndividual(emp)}
                                                            className="icon-btn"
                                                            style={{ padding: '0.25rem', borderRadius: '4px', color: '#7c3aed' }}
                                                            title="Ver e Imprimir Recibo Individual de Pago"
                                                        >
                                                            <ScrollText size={16} />
                                                        </button>
                                                    </td>
                                                </tr>

                                                {/* Fila expandida con desglose itemizado de percepciones y deducciones */}
                                                {isExpanded && (
                                                    <tr style={{ background: 'rgba(99, 102, 241, 0.04)', borderBottom: '1px solid var(--border-color)' }}>
                                                        <td colSpan={12} style={{ padding: '0.5rem 1.5rem 0.85rem' }}>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                                                                {/* Percepciones */}
                                                                <div style={{ background: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '0.65rem' }}>
                                                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: '0.35rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>
                                                                        Desglose de Ingresos / Percepciones
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.74rem' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                                                                            <span>Sueldo Quincenal Ordinario</span>
                                                                            <span style={{ fontWeight: 600 }}>{formatMoney(emp.sueldo_quincenal)}</span>
                                                                        </div>
                                                                        {(emp.rubros || []).filter(r => r.operacion === 'sumar' && r.codigo !== '01').map(r => (
                                                                            <div key={r.codigo} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                                                                                <span>{r.descripcion || r.codigo}</span>
                                                                                <span style={{ fontWeight: 600 }}>{formatMoney(r.valor_ingresado)}</span>
                                                                            </div>
                                                                        ))}
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '0.25rem', marginTop: '0.25rem', fontWeight: 700, color: '#0284c7' }}>
                                                                            <span>Total Percepciones</span>
                                                                            <span>{formatMoney(emp.total_percepciones)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Deducciones */}
                                                                <div style={{ background: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)', padding: '0.65rem' }}>
                                                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', marginBottom: '0.35rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>
                                                                        Desglose de Deducciones de Ley y Otras
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.74rem' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                                                                            <span>ISSS (Seguro Social)</span>
                                                                            <span style={{ fontWeight: 600 }}>{formatMoney(emp.descuento_isss)}</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                                                                            <span>AFP (Fondo de Pensiones)</span>
                                                                            <span style={{ fontWeight: 600 }}>{formatMoney(emp.descuento_afp)}</span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                                                                            <span>Impuesto sobre la Renta</span>
                                                                            <span style={{ fontWeight: 600 }}>{formatMoney(emp.descuento_renta)}</span>
                                                                        </div>
                                                                        {(emp.rubros || []).filter(r => r.operacion === 'restar').map(r => (
                                                                            <div key={r.codigo} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                                                                                <span>{r.descripcion || r.codigo}</span>
                                                                                <span style={{ fontWeight: 600 }}>{formatMoney(r.valor_ingresado)}</span>
                                                                            </div>
                                                                        ))}
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '0.25rem', marginTop: '0.25rem', fontWeight: 700, color: '#dc2626' }}>
                                                                            <span>Total Deducciones</span>
                                                                            <span>{formatMoney(emp.total_deducciones)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            {/* Modal de Exportación Bancaria (CSV / TXT) */}
            <Modal
                isOpen={Boolean(exportModalPeriodo)}
                onClose={() => setExportModalPeriodo(null)}
                title="Exportar Archivo para Pago Bancario"
                size="md"
                footer={(
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', alignItems: 'center' }}>
                        <button
                            type="button"
                            onClick={() => setExportModalPeriodo(null)}
                            style={{
                                height: '36px',
                                padding: '0 1rem',
                                fontSize: '0.825rem',
                                fontWeight: 600,
                                borderRadius: '6px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                color: '#f1f5f9',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleDescargarBancario}
                            disabled={exportingBancario}
                            style={{
                                height: '36px',
                                padding: '0 1.25rem',
                                fontSize: '0.825rem',
                                fontWeight: 700,
                                borderRadius: '6px',
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                cursor: exportingBancario ? 'not-allowed' : 'pointer',
                                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)',
                                opacity: exportingBancario ? 0.7 : 1,
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Download size={15} />
                            <span>
                                {exportingBancario 
                                    ? 'Generando...' 
                                    : (formatoBancario === 'ambos' ? 'Descargar CSV + TXT' : (formatoBancario === 'txt' ? 'Descargar TXT' : 'Descargar CSV'))
                                }
                            </span>
                        </button>
                    </div>
                )}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                        Genera los archivos para carga masiva bancaria con las cuentas planilleras y el monto neto a pagar por cada empleado para el período seleccionado.
                    </p>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.45rem', letterSpacing: '0.03em' }}>
                            Formato de Salida
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
                            {/* 1. Solo CSV */}
                            <button
                                type="button"
                                onClick={() => setFormatoBancario('csv')}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    border: formatoBancario === 'csv' ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.15)',
                                    background: formatoBancario === 'csv' ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                                    boxShadow: formatoBancario === 'csv' ? '0 0 10px rgba(59, 130, 246, 0.3)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '0.4rem' }}>
                                    <div style={{
                                        padding: '0.4rem',
                                        borderRadius: '6px',
                                        background: formatoBancario === 'csv' ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
                                        color: formatoBancario === 'csv' ? '#ffffff' : '#94a3b8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <FileSpreadsheet size={16} />
                                    </div>
                                    {formatoBancario === 'csv' && (
                                        <Check size={16} style={{ color: '#60a5fa' }} />
                                    )}
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '0.825rem', color: '#f8fafc' }}>
                                    Solo CSV (.csv)
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem', lineHeight: 1.25 }}>
                                    Para Excel u hojas de cálculo
                                </span>
                            </button>

                            {/* 2. Solo TXT */}
                            <button
                                type="button"
                                onClick={() => setFormatoBancario('txt')}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    border: formatoBancario === 'txt' ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.15)',
                                    background: formatoBancario === 'txt' ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                                    boxShadow: formatoBancario === 'txt' ? '0 0 10px rgba(59, 130, 246, 0.3)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '0.4rem' }}>
                                    <div style={{
                                        padding: '0.4rem',
                                        borderRadius: '6px',
                                        background: formatoBancario === 'txt' ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
                                        color: formatoBancario === 'txt' ? '#ffffff' : '#94a3b8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <FileText size={16} />
                                    </div>
                                    {formatoBancario === 'txt' && (
                                        <Check size={16} style={{ color: '#60a5fa' }} />
                                    )}
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '0.825rem', color: '#f8fafc' }}>
                                    Solo TXT (.txt)
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem', lineHeight: 1.25 }}>
                                    Texto plano banca en línea
                                </span>
                            </button>

                            {/* 3. Ambos */}
                            <button
                                type="button"
                                onClick={() => setFormatoBancario('ambos')}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    border: formatoBancario === 'ambos' ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.15)',
                                    background: formatoBancario === 'ambos' ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                                    boxShadow: formatoBancario === 'ambos' ? '0 0 10px rgba(59, 130, 246, 0.3)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '0.4rem' }}>
                                    <div style={{
                                        padding: '0.4rem',
                                        borderRadius: '6px',
                                        background: formatoBancario === 'ambos' ? '#2563eb' : 'rgba(255, 255, 255, 0.08)',
                                        color: formatoBancario === 'ambos' ? '#ffffff' : '#94a3b8',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <Files size={16} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.25)', color: '#34d399', textTransform: 'uppercase' }}>
                                            Recomendado
                                        </span>
                                        {formatoBancario === 'ambos' && (
                                            <Check size={16} style={{ color: '#60a5fa' }} />
                                        )}
                                    </div>
                                </div>
                                <span style={{ fontWeight: 700, fontSize: '0.825rem', color: '#f8fafc' }}>
                                    Ambos (.csv + .txt)
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.2rem', lineHeight: 1.25 }}>
                                    Descarga simultánea de ambos
                                </span>
                            </button>
                        </div>
                    </div>

                    {branchesAndDeptos.branches.length > 0 && (
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                                Filtrar por Sucursal (Opcional)
                            </label>
                            <select
                                value={exportBranchId}
                                onChange={(e) => setExportBranchId(e.target.value)}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', background: 'var(--card-bg, #1e293b)', color: '#f8fafc' }}
                            >
                                <option value="">Todas las sucursales</option>
                                {branchesAndDeptos.branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.nombre}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {branchesAndDeptos.departamentos.length > 0 && (
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                                Filtrar por Departamento (Opcional)
                            </label>
                            <select
                                value={exportDeptoId}
                                onChange={(e) => setExportDeptoId(e.target.value)}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0 0.5rem', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', background: 'var(--card-bg, #1e293b)', color: '#f8fafc' }}
                            >
                                <option value="">Todos los departamentos</option>
                                {branchesAndDeptos.departamentos.map(d => (
                                    <option key={d.id} value={d.id}>{d.descripcion}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Modal: Registrar Pago de Planilla (Afectación Bancaria y Conciliación) */}
            <Modal
                isOpen={Boolean(pagoModalPeriodo)}
                onClose={() => !savingPago && setPagoModalPeriodo(null)}
                title={`Registrar Pago de Planilla — ${MONTH_NAMES.find(m => m.value === pagoModalPeriodo?.periodo_mes)?.label || ''} ${pagoModalPeriodo?.periodo_anio} (${pagoModalPeriodo?.quincena === 'primera' ? '1ra Quincena' : '2da Quincena'})`}
                size="xl"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.85rem' }}>
                            <span>Total Planilla: <strong>{formatMoney(pagoModalPeriodo?.total_neto)}</strong></span>
                            <span>Total a Dispersar: <strong style={{
                                color: Math.abs(pagoRows.reduce((a, b) => a + (parseFloat(b.monto) || 0), 0) - parseFloat(pagoModalPeriodo?.total_neto || 0)) < 0.05 ? '#059669' : '#dc2626'
                            }}>
                                {formatMoney(pagoRows.reduce((a, b) => a + (parseFloat(b.monto) || 0), 0))}
                            </strong></span>
                            {Math.abs(pagoRows.reduce((a, b) => a + (parseFloat(b.monto) || 0), 0) - parseFloat(pagoModalPeriodo?.total_neto || 0)) >= 0.05 && (
                                <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                                    (Diferencia: {formatMoney(parseFloat(pagoModalPeriodo?.total_neto || 0) - pagoRows.reduce((a, b) => a + (parseFloat(b.monto) || 0), 0))})
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                type="button"
                                disabled={savingPago}
                                onClick={() => setPagoModalPeriodo(null)}
                                className="btn-secondary"
                                style={{ height: '36px', padding: '0 1rem', fontSize: '0.825rem' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={savingPago || loadingCuentasPago || pagoRows.length === 0}
                                onClick={handleSubmitPago}
                                className="btn-primary"
                                style={{
                                    height: '36px',
                                    padding: '0 1.25rem',
                                    fontSize: '0.825rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    background: '#059669',
                                    borderColor: '#059669',
                                    cursor: 'pointer'
                                }}
                            >
                                <CreditCard size={15} />
                                {savingPago ? 'Procesando Pago...' : 'Confirmar y Aplicar en Bancos'}
                            </button>
                        </div>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Tarjeta Informativa Superior */}
                    <div style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <Info size={18} color="#2563eb" />
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
                                <strong>Afectación Bancaria Automática:</strong> Al confirmar, se insertarán cargos en las cuentas seleccionadas con <code>fecha_aplicado = NULL</code> para que sean <strong>conciliables en el módulo de Bancos &gt; Conciliación Bancaria</strong>. La planilla pasará a estado <strong>Pagada</strong>.
                            </div>
                        </div>
                        <div style={{
                            padding: '0.3rem 0.65rem',
                            borderRadius: '6px',
                            background: '#059669',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '0.9rem'
                        }}>
                            Total Neto: {formatMoney(pagoModalPeriodo?.total_neto)}
                        </div>
                    </div>

                    {/* Formas de Pago Dinámicas */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                Formas de Pago y Cuentas de Origen ({pagoRows.length})
                            </label>
                            <button
                                type="button"
                                onClick={handleAddPagoRow}
                                className="btn-secondary"
                                style={{
                                    height: '32px',
                                    padding: '0 0.75rem',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    color: 'var(--primary)',
                                    cursor: 'pointer'
                                }}
                            >
                                <Plus size={14} />
                                Agregar otra forma de pago
                            </button>
                        </div>

                        {loadingCuentasPago ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Cargando catálogo de cuentas bancarias...
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {pagoRows.map((row, idx) => (
                                    <div
                                        key={row.tempId || idx}
                                        className="card glass"
                                        style={{
                                            padding: '0.85rem',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-color)',
                                            background: 'var(--card-bg, #fff)'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
                                                Forma de Pago #{idx + 1}
                                            </span>
                                            {pagoRows.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemovePagoRow(idx)}
                                                    className="icon-btn"
                                                    style={{ padding: '0.25rem', color: '#dc2626' }}
                                                    title="Eliminar esta forma de pago"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            )}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                                            {/* Selector de Cuenta Bancaria con formatCuentaLabel y sortCuentas */}
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                    Cuenta Bancaria (Dispersora) *
                                                </label>
                                                <select
                                                    value={row.cuenta_bancaria_id}
                                                    onChange={(e) => handlePagoRowChange(idx, 'cuenta_bancaria_id', parseInt(e.target.value, 10))}
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        fontSize: '0.825rem',
                                                        padding: '0 0.5rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--card-bg, #fff)',
                                                        color: 'var(--text-main)',
                                                        fontWeight: 500
                                                    }}
                                                >
                                                    <option value="">-- Seleccionar Cuenta Bancaria --</option>
                                                    {sortCuentas(cuentasBancarias).map(c => (
                                                        <option key={c.id} value={c.id}>
                                                            {formatCuentaLabel(c)} {c.es_sugerida ? '⭐ (Empresa Seleccionada)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Método de Pago */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                    Forma de Pago *
                                                </label>
                                                <select
                                                    value={row.forma_pago}
                                                    onChange={(e) => handlePagoRowChange(idx, 'forma_pago', e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        fontSize: '0.825rem',
                                                        padding: '0 0.5rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--card-bg, #fff)',
                                                        color: 'var(--text-main)'
                                                    }}
                                                >
                                                    <option value="Transferencia">Transferencia Bancaria (TR)</option>
                                                    <option value="Cheque">Cheque (CH)</option>
                                                    <option value="Nota de Cargo">Nota de Cargo / Débito (NC)</option>
                                                </select>
                                            </div>

                                            {/* Monto a Pagar */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                    Monto a Desembolsar ($) *
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0.01"
                                                    value={row.monto}
                                                    onChange={(e) => handlePagoRowChange(idx, 'monto', e.target.value)}
                                                    placeholder="0.00"
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        fontSize: '0.85rem',
                                                        fontWeight: 700,
                                                        color: '#059669',
                                                        padding: '0 0.5rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--card-bg, #fff)'
                                                    }}
                                                />
                                            </div>

                                            {/* Referencia o Documento */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                    Referencia / Comprobante / # Cheque
                                                </label>
                                                <input
                                                    type="text"
                                                    value={row.documento}
                                                    onChange={(e) => handlePagoRowChange(idx, 'documento', e.target.value)}
                                                    placeholder="Ej: TR-009124 o Chq #4812"
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        fontSize: '0.825rem',
                                                        padding: '0 0.5rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--card-bg, #fff)',
                                                        color: 'var(--text-main)'
                                                    }}
                                                />
                                            </div>

                                            {/* Fecha de Pago */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                                    Fecha de Pago *
                                                </label>
                                                <input
                                                    type="date"
                                                    value={row.fecha_pago}
                                                    onChange={(e) => handlePagoRowChange(idx, 'fecha_pago', e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        fontSize: '0.825rem',
                                                        padding: '0 0.5rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--card-bg, #fff)',
                                                        color: 'var(--text-main)'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Modal: Ver Formas de Pago Registradas (con estado de Conciliación Bancaria) */}
            <Modal
                isOpen={Boolean(verPagosModalPeriodo)}
                onClose={() => setVerPagosModalPeriodo(null)}
                title={`Formas de Pago Registradas — ${MONTH_NAMES.find(m => m.value === verPagosModalPeriodo?.periodo_mes)?.label || ''} ${verPagosModalPeriodo?.periodo_anio} (${verPagosModalPeriodo?.quincena === 'primera' ? '1ra Quincena' : '2da Quincena'})`}
                size="lg"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                        <button
                            type="button"
                            onClick={() => setVerPagosModalPeriodo(null)}
                            className="btn-secondary"
                            style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.825rem' }}
                        >
                            Cerrar
                        </button>
                    </div>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        fontSize: '0.8rem',
                        color: '#047857',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <CheckCircle2 size={16} />
                            <span>
                                Esta planilla fue marcada como pagada. A continuación se detallan los movimientos bancarios generados.
                            </span>
                        </div>
                        <div style={{ fontWeight: 800 }}>
                            Total Neto: {formatMoney(verPagosModalPeriodo?.total_neto)}
                        </div>
                    </div>

                    {loadingPagosRegistrados ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Cargando pagos registrados...
                        </div>
                    ) : pagosRegistrados.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            No se encontraron registros de pago asociados a este período.
                        </div>
                    ) : (
                        <div className="table-responsive" style={{ border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                            <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ padding: '0.5rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Fecha Pago</th>
                                        <th style={{ padding: '0.5rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Cuenta Bancaria</th>
                                        <th style={{ padding: '0.5rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Forma Pago</th>
                                        <th style={{ padding: '0.5rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Referencia</th>
                                        <th style={{ padding: '0.5rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>Monto</th>
                                        <th style={{ padding: '0.5rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>Conciliación Bancaria</th>
                                        <th style={{ padding: '0.5rem', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagosRegistrados.map((p) => {
                                        const ctaObj = {
                                            banco_nombre: p.banco_nombre,
                                            nombre: p.cuenta_nombre,
                                            numero: p.numero_cuenta
                                        };
                                        return (
                                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                    {p.fecha_pago ? String(p.fecha_pago).slice(0, 10) : ''}
                                                </td>
                                                <td style={{ padding: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
                                                    {formatCuentaLabel(ctaObj)}
                                                </td>
                                                <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                                                    <span style={{
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 600,
                                                        background: 'rgba(59, 130, 246, 0.1)',
                                                        color: '#2563eb'
                                                    }}>
                                                        {p.forma_pago}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {p.documento || 'Sin doc'}
                                                </td>
                                                <td style={{ padding: '0.5rem', fontSize: '0.825rem', fontWeight: 700, textAlign: 'right', color: '#059669' }}>
                                                    {formatMoney(p.monto)}
                                                </td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                    {p.es_conciliado ? (
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            padding: '0.15rem 0.45rem',
                                                            borderRadius: '4px',
                                                            background: 'rgba(16, 185, 129, 0.15)',
                                                            color: '#047857'
                                                        }} title={`Conciliado el ${p.fecha_aplicado}`}>
                                                            Conciliado ({p.fecha_aplicado ? String(p.fecha_aplicado).slice(0, 10) : ''})
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            fontWeight: 600,
                                                            padding: '0.15rem 0.45rem',
                                                            borderRadius: '4px',
                                                            background: 'rgba(245, 158, 11, 0.15)',
                                                            color: '#b45309'
                                                        }} title="Disponible en Conciliación Bancaria para ser conciliado">
                                                            Pendiente de Conciliar
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAnularPago(p)}
                                                        disabled={anulandoPagoId === p.id || p.es_conciliado}
                                                        className="icon-btn"
                                                        style={{
                                                            padding: '0.3rem',
                                                            color: p.es_conciliado ? '#cbd5e1' : '#dc2626',
                                                            cursor: p.es_conciliado ? 'not-allowed' : 'pointer'
                                                        }}
                                                        title={p.es_conciliado ? 'No se puede anular porque ya fue conciliado en Bancos' : 'Anular pago y eliminar movimiento bancario'}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Componente Compartido Obligatorio: ReportPreviewModal */}
            <ReportPreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge={previewBadge}
                pdfSource={previewPdfSource}
                fileName={previewFileName}
                footerInfo="Documento generado a página completa Carta estándar — SIPE Admin & Sipe Web SaaS"
            />
        </div>
    );
}
