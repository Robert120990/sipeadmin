import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart3, FileSpreadsheet, Printer, Landmark, Calendar, Filter,
    RefreshCw, AlertTriangle, Scale, ArrowRightLeft, Clock,
    CheckCircle2, ShieldAlert, Eye, Search, Lock, Unlock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReportPreviewModal from '../components/ReportPreviewModal';
import Modal from '../components/Modal';
import { getStoredUser } from '../utils/auth';
import { hasRoutePermission } from '../config/routeRegistry';
import { navigateToBancosTarget } from '../utils/bancosNavStorage';
import { moneyFmt } from '../utils/format';
import { formatDateDMY } from '../utils/date';
import { sanitizeSpreadsheetRows } from '../utils/exportSanitizer';

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

const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

const getAgingBadgeStyle = (item) => {
    if (item?.caduco || item?.aging_bucket === '>180' || item?.bucket === '>180') {
        return { bg: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.35)', text: '>180d CADUCO' };
    }
    if (item?.por_caducar) {
        return { bg: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.35)', text: '91-180d POR CADUCAR' };
    }
    const bucket = item?.aging_bucket || item?.bucket || '0-30';
    if (bucket === '91-180') {
        return { bg: 'rgba(245, 158, 11, 0.14)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.35)', text: '91-180 días' };
    }
    if (bucket === '31-90') {
        return { bg: 'rgba(59, 130, 246, 0.14)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.35)', text: '31-90 días' };
    }
    return { bg: 'rgba(16, 185, 129, 0.14)', color: '#10b981', border: 'rgba(16, 185, 129, 0.35)', text: '0-30 días' };
};

export default function Consultas({ type, title, description }) {
    const navigate = useNavigate();
    const { addToast } = useToast();

    const currentUser = useMemo(() => getStoredUser(), []);
    const canGoConciliar = useMemo(
        () => hasRoutePermission(currentUser, '/dashboard/bancos/conciliacion'),
        [currentUser]
    );
    const canGoMovimientos = useMemo(
        () => hasRoutePermission(currentUser, '/dashboard/bancos/movimientos'),
        [currentUser]
    );
    const canGoKardex = useMemo(
        () => hasRoutePermission(currentUser, '/dashboard/bancos/reportes/movimientos-fecha'),
        [currentUser]
    );

    // Filters
    const [fechaCorte, setFechaCorte] = useState(() => getSvTodayYMD());
    const [empresaId, setEmpresaId] = useState('');
    const [bancoId, setBancoId] = useState('');
    const [incluirInactivas, setIncluirInactivas] = useState(false);
    const [comparativo, setComparativo] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Data & Catalog options derived safely from /api/consultas/:type
    const [reportData, setReportData] = useState(null);
    const [catalogCuentas, setCatalogCuentas] = useState([]);
    const [loading, setLoading] = useState(true);

    // View tabs & Aging filters
    const [activeTab, setActiveTab] = useState(() => (type === 'antiguedad-cheques' ? 'AGING' : 'SALDOS'));
    const [agingBucketFilter, setAgingBucketFilter] = useState('TODOS');
    const [selectedCuentaAging, setSelectedCuentaAging] = useState(null);

    // ReportPreviewModal state
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewFileName, setPreviewFileName] = useState('Reporte.pdf');

    useEffect(() => {
        setActiveTab(type === 'antiguedad-cheques' ? 'AGING' : 'SALDOS');
    }, [type]);

    const fetchData = useCallback(async (overrides = {}) => {
        const effFecha = overrides.fechaCorte ?? fechaCorte;
        const effEmpresa = overrides.empresaId ?? empresaId;
        const effBanco = overrides.bancoId ?? bancoId;
        const effInactivas = overrides.incluirInactivas ?? incluirInactivas;
        const effComparativo = overrides.comparativo ?? comparativo;

        setLoading(true);
        try {
            const params = {
                fecha_corte: effFecha || getSvTodayYMD(),
                incluir_inactivas: effInactivas ? 'true' : 'false'
            };
            if (effEmpresa) params.empresa_id = effEmpresa;
            if (effBanco) params.banco_id = effBanco;
            if (effComparativo && type !== 'antiguedad-cheques') params.comparativo = 'true';

            const res = await api.get(`/consultas/${type}`, { params });
            const payload = res.data || null;
            setReportData(payload);

            // Preserve full Empresa/Banco catalog when loaded without narrowing filters (or merge unseen options)
            if (Array.isArray(payload?.cuentas)) {
                if (!effEmpresa && !effBanco) {
                    setCatalogCuentas(payload.cuentas);
                } else {
                    setCatalogCuentas(prev => (prev.length === 0 ? payload.cuentas : prev));
                }
            }
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al cargar la consulta bancaria', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, bancoId, comparativo, empresaId, fechaCorte, incluirInactivas, type]);

    useEffect(() => {
        fetchData();
    }, [type]);

    const empresaOptions = useMemo(() => {
        const source = catalogCuentas.length > 0 ? catalogCuentas : (reportData?.cuentas || []);
        const map = new Map();
        for (const c of source) {
            const val = String(c.empresa_codigo || c.empresa_id || '').trim();
            if (!val) continue;
            if (!map.has(val)) {
                map.set(val, { value: val, label: c.empresa_nombre || val });
            }
        }
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [catalogCuentas, reportData?.cuentas]);

    const bancoOptions = useMemo(() => {
        const source = catalogCuentas.length > 0 ? catalogCuentas : (reportData?.cuentas || []);
        const map = new Map();
        for (const c of source) {
            const val = String(c.banco_codigo || c.banco_id || '').trim();
            if (!val) continue;
            if (!map.has(val)) {
                map.set(val, { value: val, label: c.banco_nombre || val });
            }
        }
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [catalogCuentas, reportData?.cuentas]);

    // Client-side exact refinement protecting against MySQL (b.id = ? OR b.codigo = ?) string coercion + searchTerm
    const displayedCuentas = useMemo(() => {
        const list = Array.isArray(reportData?.cuentas) ? reportData.cuentas : [];
        const q = searchTerm.trim().toLowerCase();
        return list.filter(c => {
            if (empresaId) {
                const matchEmp = String(c.empresa_codigo) === String(empresaId) || String(c.empresa_id) === String(empresaId);
                if (!matchEmp) return false;
            }
            if (bancoId) {
                const matchBanco = String(c.banco_codigo) === String(bancoId) || String(c.banco_id) === String(bancoId);
                if (!matchBanco) return false;
            }
            if (q) {
                const blob = `${c.empresa_nombre || ''} ${c.banco_nombre || ''} ${c.nombre || ''} ${c.numero || ''}`.toLowerCase();
                if (!blob.includes(q)) return false;
            }
            return true;
        });
    }, [bancoId, empresaId, reportData?.cuentas, searchTerm]);

    const displayedTotales = useMemo(() => {
        const isClientNarrowed = Boolean(searchTerm.trim() || empresaId || bancoId);
        if (!isClientNarrowed && reportData?.totales) {
            return reportData.totales;
        }
        return displayedCuentas.reduce((acc, row) => ({
            cuentas_count: acc.cuentas_count + 1,
            saldo_inicial: round2(acc.saldo_inicial + Number(row.saldo_inicial || 0)),
            saldo_chequera: round2(acc.saldo_chequera + Number(row.saldo_chequera || 0)),
            cheques_en_transito: round2(acc.cheques_en_transito + Number(row.cheques_en_transito || 0)),
            cargos_en_transito: round2(acc.cargos_en_transito + Number(row.cargos_en_transito || 0)),
            cargos_cheques_en_transito: round2(acc.cargos_cheques_en_transito + Number(row.cargos_cheques_en_transito || 0)),
            abonos_en_transito: round2(acc.abonos_en_transito + Number(row.abonos_en_transito || 0)),
            depositos_en_transito: round2(acc.depositos_en_transito + Number(row.depositos_en_transito || 0)),
            saldo_conciliado_libros: round2(acc.saldo_conciliado_libros + Number(row.saldo_conciliado_libros || 0)),
            cheques_pendientes_count: acc.cheques_pendientes_count + Number(row.aging?.total_cheques || 0),
            cheques_pendientes_monto: round2(acc.cheques_pendientes_monto + Number(row.aging?.total_monto || 0)),
            por_caducar_count: acc.por_caducar_count + Number(row.aging?.por_caducar_count || 0),
            por_caducar_monto: round2(acc.por_caducar_monto + Number(row.aging?.por_caducar_monto || 0)),
            caducos_count: acc.caducos_count + Number(row.aging?.caducos_count || 0),
            caducos_monto: round2(acc.caducos_monto + Number(row.aging?.caducos_monto || 0))
        }), {
            cuentas_count: 0,
            saldo_inicial: 0,
            saldo_chequera: 0,
            cheques_en_transito: 0,
            cargos_en_transito: 0,
            cargos_cheques_en_transito: 0,
            abonos_en_transito: 0,
            depositos_en_transito: 0,
            saldo_conciliado_libros: 0,
            cheques_pendientes_count: 0,
            cheques_pendientes_monto: 0,
            por_caducar_count: 0,
            por_caducar_monto: 0,
            caducos_count: 0,
            caducos_monto: 0
        });
    }, [bancoId, displayedCuentas, empresaId, reportData?.totales, searchTerm]);

    const visibleAccountIds = useMemo(() => new Set(displayedCuentas.map(c => Number(c.cuenta_bancaria_id || c.id))), [displayedCuentas]);

    const allFilteredPendingChecks = useMemo(() => {
        const list = Array.isArray(reportData?.cheques_pendientes_detalle) ? reportData.cheques_pendientes_detalle : [];
        return list.filter(ck => visibleAccountIds.has(Number(ck.cuenta_bancaria_id)));
    }, [reportData?.cheques_pendientes_detalle, visibleAccountIds]);

    const displayedAgingChecks = useMemo(() => {
        if (agingBucketFilter === 'TODOS') return allFilteredPendingChecks;
        if (agingBucketFilter === 'POR_CADUCAR') return allFilteredPendingChecks.filter(ck => Boolean(ck.por_caducar));
        return allFilteredPendingChecks.filter(ck => (ck.aging_bucket || ck.bucket) === agingBucketFilter);
    }, [agingBucketFilter, allFilteredPendingChecks]);

    const agingBucketsSummary = useMemo(() => {
        const isClientNarrowed = Boolean(searchTerm.trim() || empresaId || bancoId);
        if (!isClientNarrowed && reportData?.aging_resumen?.buckets_list) {
            return {
                bucketsList: reportData.aging_resumen.buckets_list,
                total_cheques: reportData.aging_resumen.total_cheques || 0,
                total_monto: reportData.aging_resumen.total_monto || 0,
                por_caducar_count: reportData.aging_resumen.por_caducar_count || 0,
                por_caducar_monto: reportData.aging_resumen.por_caducar_monto || 0,
                caducos_count: reportData.aging_resumen.caducos_count || 0,
                caducos_monto: reportData.aging_resumen.caducos_monto || 0
            };
        }
        const defs = [
            { bucket: '0-30', label: '0-30 días' },
            { bucket: '31-90', label: '31-90 días' },
            { bucket: '91-180', label: '91-180 días' },
            { bucket: '>180', label: '>180 días (Caducos)' }
        ];
        const map = new Map(defs.map(d => [d.bucket, { ...d, count: 0, total_monto: 0 }]));
        let porCadCount = 0;
        let porCadMonto = 0;
        let cadCount = 0;
        let cadMonto = 0;
        let totalMonto = 0;
        for (const ck of allFilteredPendingChecks) {
            const b = ck.aging_bucket || ck.bucket || '0-30';
            const val = Number(ck.valor || 0);
            totalMonto = round2(totalMonto + val);
            const entry = map.get(b);
            if (entry) {
                entry.count += 1;
                entry.total_monto = round2(entry.total_monto + val);
            }
            if (ck.por_caducar) {
                porCadCount += 1;
                porCadMonto = round2(porCadMonto + val);
            }
            if (ck.caduco) {
                cadCount += 1;
                cadMonto = round2(cadMonto + val);
            }
        }
        return {
            bucketsList: Array.from(map.values()),
            total_cheques: allFilteredPendingChecks.length,
            total_monto: totalMonto,
            por_caducar_count: porCadCount,
            por_caducar_monto: porCadMonto,
            caducos_count: cadCount,
            caducos_monto: cadMonto
        };
    }, [allFilteredPendingChecks, bancoId, empresaId, reportData?.aging_resumen, searchTerm]);

    const comparativoDisponible = Boolean(reportData?.comparativo?.disponible);

    const handleSearchSubmit = (e) => {
        if (e) e.preventDefault();
        fetchData();
    };

    const handleResetFilters = () => {
        const svToday = getSvTodayYMD();
        setFechaCorte(svToday);
        setEmpresaId('');
        setBancoId('');
        setIncluirInactivas(false);
        setComparativo(false);
        setSearchTerm('');
        fetchData({
            fechaCorte: svToday,
            empresaId: '',
            bancoId: '',
            incluirInactivas: false,
            comparativo: false
        });
    };

    const handleNavigateCuenta = (targetKey, row) => {
        navigateToBancosTarget(navigate, targetKey, {
            empresaId: row.empresa_codigo || row.empresa_id || '',
            cuentaId: row.cuenta_bancaria_id || row.id || '',
            numeroCuenta: row.numero || ''
        });
    };

    const exportToExcel = () => {
        if (displayedCuentas.length === 0 && allFilteredPendingChecks.length === 0) {
            addToast('No hay datos para exportar', 'warning');
            return;
        }
        try {
            const saldosRows = displayedCuentas.map(r => {
                const base = {
                    Empresa: r.empresa_nombre || r.empresa_codigo || '',
                    Banco: r.banco_nombre || '',
                    Cuenta: r.nombre || '',
                    'Número Cuenta': r.numero || '',
                    Estado: r.activa ? 'ACTIVA' : 'INACTIVA',
                    'Saldo Inicial ($)': Number(r.saldo_inicial || 0),
                    'Saldo Chequera ($)': Number(r.saldo_chequera || 0),
                    'Cheques/Cargos Tránsito ($)': Number(r.cargos_cheques_en_transito || 0),
                    'Depósitos Tránsito ($)': Number(r.depositos_en_transito || 0),
                    'Saldo Banco Conciliado ($)': Number(r.saldo_conciliado_libros || 0),
                    'Estado Período': r.estado_periodo || 'ABIERTO',
                    'Cerrado Hasta': r.periodo_cerrado_hasta || '',
                    'Última Validación': r.ultima_validacion?.fecha_validacion || 'Sin validar',
                    'Días Sin Validar': r.dias_sin_validar ?? ''
                };
                if (comparativoDisponible) {
                    base['Saldo SP Legado ($)'] = r.comparativo_sp ? Number(r.comparativo_sp.saldo_sp || 0) : '';
                    base['Dif. vs SP ($)'] = r.comparativo_sp ? Number(r.comparativo_sp.diferencia_vs_sp || 0) : '';
                }
                return base;
            });

            if (saldosRows.length > 0) {
                const totalRow = {
                    Empresa: 'TOTALES CONSOLIDADOS',
                    Banco: `${displayedTotales.cuentas_count} cuentas`,
                    Cuenta: '',
                    'Número Cuenta': '',
                    Estado: '',
                    'Saldo Inicial ($)': Number(displayedTotales.saldo_inicial || 0),
                    'Saldo Chequera ($)': Number(displayedTotales.saldo_chequera || 0),
                    'Cheques/Cargos Tránsito ($)': Number(displayedTotales.cargos_cheques_en_transito || 0),
                    'Depósitos Tránsito ($)': Number(displayedTotales.depositos_en_transito || 0),
                    'Saldo Banco Conciliado ($)': Number(displayedTotales.saldo_conciliado_libros || 0),
                    'Estado Período': '',
                    'Cerrado Hasta': '',
                    'Última Validación': '',
                    'Días Sin Validar': ''
                };
                if (comparativoDisponible) {
                    totalRow['Saldo SP Legado ($)'] = Number(reportData?.comparativo?.total_sp || 0);
                    totalRow['Dif. vs SP ($)'] = '';
                }
                saldosRows.push(totalRow);
            }

            const agingRows = allFilteredPendingChecks.map(ck => ({
                '# Cheque': ck.cheque || '',
                'Fecha Emisión': ck.fecha || '',
                Empresa: ck.empresa_nombre || ck.empresa_codigo || '',
                Banco: ck.banco_nombre || '',
                Cuenta: ck.numero_cuenta || '',
                Beneficiario: ck.a_nombre || '',
                Concepto: ck.concepto || '',
                'Monto ($)': Number(ck.valor || 0),
                'Días Circulación': Number(ck.dias_circulacion ?? ck.dias ?? 0),
                Rango: ck.aging_bucket || ck.bucket || '',
                Alerta: ck.caduco ? 'CADUCO (>180d)' : (ck.por_caducar ? 'POR CADUCAR (>=150d)' : 'VIGENTE')
            }));

            const wb = XLSX.utils.book_new();
            const wsSaldos = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(saldosRows.length ? saldosRows : [{ Mensaje: 'Sin cuentas' }]));
            XLSX.utils.book_append_sheet(wb, wsSaldos, 'Saldos');

            const wsAging = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(agingRows.length ? agingRows : [{ Mensaje: 'Sin cheques en circulación' }]));
            XLSX.utils.book_append_sheet(wb, wsAging, 'Antiguedad_Cheques');

            const cutoff = reportData?.fecha_corte || fechaCorte || getSvTodayYMD();
            XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${cutoff}.xlsx`);
            addToast('Archivo Excel descargado', 'success');
        } catch {
            addToast('Error al exportar a Excel', 'error');
        }
    };

    const exportToPDF = () => {
        if (displayedCuentas.length === 0 && allFilteredPendingChecks.length === 0) {
            addToast('No hay datos para generar vista previa', 'warning');
            return;
        }

        // Full Letter Landscape per AGENTS.md
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter'
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const cutoff = reportData?.fecha_corte || fechaCorte || getSvTodayYMD();

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(title.toUpperCase(), 14, 14);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`Fecha de corte: ${formatDateDMY(cutoff)}   |   Fuente: ${reportData?.fuente || 'db_sipe_admin'}`, 14, 20);
        doc.text(`Generado: ${new Date().toLocaleDateString('es-SV')} ${new Date().toLocaleTimeString('es-SV')}`, pageWidth - 14, 20, { align: 'right' });

        let nextStartY = 25;

        if (activeTab === 'SALDOS' || type !== 'antiguedad-cheques') {
            const headRow = [
                'Empresa / Banco / Cuenta',
                'Saldo Inicial',
                'Saldo Chequera',
                'Ck/Cargos Tráns.',
                'Dep. Tránsito',
                'Saldo Banco Conc.',
                ...(comparativoDisponible ? ['Saldo SP', 'Dif. SP'] : []),
                'Período',
                'Últ. Validación'
            ];

            const bodyRows = displayedCuentas.map(r => [
                `${r.empresa_nombre || r.empresa_codigo || ''}\n${r.banco_nombre || ''} · #${r.numero || ''}${!r.activa ? ' [INACTIVA]' : ''}`,
                moneyFmt(r.saldo_inicial),
                moneyFmt(r.saldo_chequera),
                moneyFmt(r.cargos_cheques_en_transito),
                moneyFmt(r.depositos_en_transito),
                moneyFmt(r.saldo_conciliado_libros),
                ...(comparativoDisponible ? [
                    r.comparativo_sp ? moneyFmt(r.comparativo_sp.saldo_sp) : 'N/D',
                    r.comparativo_sp ? moneyFmt(r.comparativo_sp.diferencia_vs_sp) : '-'
                ] : []),
                `${r.estado_periodo || 'ABIERTO'}${r.periodo_cerrado_hasta ? `\n${formatDateDMY(r.periodo_cerrado_hasta)}` : ''}`,
                r.ultima_validacion
                    ? `${formatDateDMY(r.ultima_validacion.fecha_validacion)}\n${moneyFmt(r.ultima_validacion.monto_banco)}`
                    : 'Sin validar'
            ]);

            const footRow = [
                { content: `TOTALES (${displayedTotales.cuentas_count} cuentas):`, styles: { fontStyle: 'bold' } },
                { content: moneyFmt(displayedTotales.saldo_inicial), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: moneyFmt(displayedTotales.saldo_chequera), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: moneyFmt(displayedTotales.cargos_cheques_en_transito), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: moneyFmt(displayedTotales.depositos_en_transito), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: moneyFmt(displayedTotales.saldo_conciliado_libros), styles: { halign: 'right', fontStyle: 'bold' } },
                ...(comparativoDisponible ? [
                    { content: moneyFmt(reportData?.comparativo?.total_sp || 0), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: '', styles: { halign: 'right' } }
                ] : []),
                { content: '', styles: {} },
                { content: '', styles: {} }
            ];

            autoTable(doc, {
                head: [headRow],
                body: bodyRows,
                foot: [footRow],
                startY: nextStartY,
                theme: 'striped',
                styles: { fontSize: 7.2, cellPadding: 1.8, overflow: 'linebreak' },
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.3 },
                footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 7.5 },
                columnStyles: {
                    0: { cellWidth: 58 },
                    1: { halign: 'right' },
                    2: { halign: 'right' },
                    3: { halign: 'right' },
                    4: { halign: 'right' },
                    5: { halign: 'right', fontStyle: 'bold' },
                    ...(comparativoDisponible ? { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'center' }, 9: { halign: 'center' } } : { 6: { halign: 'center' }, 7: { halign: 'center' } })
                },
                margin: { top: 24, bottom: 16, left: 14, right: 14 },
                didDrawPage: (d) => {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Página ${d.pageNumber} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
                    doc.text('SIPE Admin - Tesorería y Saldos Bancarios (db_sipe_admin)', 14, pageHeight - 8);
                }
            });

            nextStartY = (doc.lastAutoTable?.finalY || 25) + 8;
        }

        if ((activeTab === 'AGING' || type === 'antiguedad-cheques') && allFilteredPendingChecks.length > 0) {
            if (nextStartY > pageHeight - 45) {
                doc.addPage();
                nextStartY = 18;
            }
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            const displayedAgingTotal = displayedAgingChecks.reduce((acc, ck) => round2(acc + Number(ck.valor || 0)), 0);
            const agingTruncationNote = displayedAgingChecks.length > 150
                ? ` (Mostrando primeros 150 de ${displayedAgingChecks.length})`
                : '';
            doc.text(
                `ANTIGÜEDAD DE CHEQUES EN CIRCULACIÓN (${displayedAgingChecks.length} cheques · ${moneyFmt(displayedAgingTotal)})${agingTruncationNote}`,
                14,
                nextStartY
            );

            autoTable(doc, {
                head: [['# Cheque', 'Fecha Emisión', 'Empresa / Cuenta', 'Beneficiario', 'Concepto', 'Días', 'Antigüedad', 'Monto ($)']],
                body: displayedAgingChecks.slice(0, 150).map(ck => [
                    ck.cheque || '',
                    ck.fecha || '',
                    `${ck.empresa_nombre || ck.empresa_codigo || ''} · #${ck.numero_cuenta || ''}`,
                    ck.a_nombre || '',
                    ck.concepto || '',
                    String(ck.dias_circulacion ?? ck.dias ?? 0),
                    ck.caduco ? '>180d CADUCO' : (ck.por_caducar ? '91-180d POR CADUCAR' : (ck.aging_bucket || ck.bucket || '')),
                    moneyFmt(ck.valor)
                ]),
                startY: nextStartY + 4,
                theme: 'striped',
                styles: { fontSize: 7.2, cellPadding: 1.8, overflow: 'linebreak' },
                headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 22, fontStyle: 'bold' },
                    1: { cellWidth: 22 },
                    5: { cellWidth: 14, halign: 'right' },
                    6: { cellWidth: 32, halign: 'center' },
                    7: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
                },
                margin: { top: 20, bottom: 16, left: 14, right: 14 },
                didDrawPage: (d) => {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(8);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Página ${d.pageNumber} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
                    doc.text('SIPE Admin - Tesorería y Saldos Bancarios (db_sipe_admin)', 14, pageHeight - 8);
                }
            });
        }

        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewFileName(`${title.replace(/\s+/g, '_')}_${cutoff}.pdf`);
        setShowPreviewModal(true);
    };

    const modalAccountChecks = useMemo(() => {
        if (!selectedCuentaAging) return [];
        const cid = Number(selectedCuentaAging.cuenta_bancaria_id || selectedCuentaAging.id);
        return (reportData?.cheques_pendientes_detalle || []).filter(ck => Number(ck.cuenta_bancaria_id) === cid);
    }, [reportData?.cheques_pendientes_detalle, selectedCuentaAging]);

    const badgeText = type === 'saldos-bancos'
        ? 'BANCOS'
        : (type === 'saldos-chequera' ? 'CHEQUERA' : 'AGING');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <Landmark size={22} color="var(--primary)" />
                        {title}
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        {description}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={exportToExcel}
                        disabled={loading || (displayedCuentas.length === 0 && allFilteredPendingChecks.length === 0)}
                        className="btn-secondary"
                        style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center', height: '36px', padding: '0 0.9rem', fontSize: '0.825rem' }}
                        title="Exportar Saldos y Antigüedad a Excel"
                    >
                        <FileSpreadsheet size={16} /> Excel
                    </button>
                    <button
                        type="button"
                        onClick={exportToPDF}
                        disabled={loading || (displayedCuentas.length === 0 && allFilteredPendingChecks.length === 0)}
                        className="btn-primary"
                        style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center', height: '36px', padding: '0 1rem', fontSize: '0.825rem' }}
                        title="Vista previa en tamaño Carta e impresión"
                    >
                        <Printer size={16} /> Vista Previa / PDF
                    </button>
                    <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', color: 'var(--primary)', background: 'rgba(37, 99, 235, 0.1)', padding: '0 0.75rem', borderRadius: 'var(--border-radius)', height: '36px', fontSize: '0.8rem', fontWeight: 600 }}>
                        <BarChart3 size={16} />
                        <span>Cuentas: {displayedCuentas.length}</span>
                    </div>
                </div>
            </div>

            {/* Compact Filters Card */}
            <div className="card glass" style={{ padding: '0.85rem 1.15rem' }}>
                <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: '0 1 145px', minWidth: '125px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.25rem', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            <Calendar size={12} /> Fecha Corte
                        </label>
                        <input
                            type="date"
                            value={fechaCorte}
                            onChange={e => setFechaCorte(e.target.value)}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.3rem 0.55rem' }}
                            required
                        />
                    </div>

                    <div style={{ flex: '1 1 175px', minWidth: '150px' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            Empresa
                        </label>
                        <select
                            value={empresaId}
                            onChange={e => setEmpresaId(e.target.value)}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="">Todas las empresas</option>
                            {empresaOptions.map(emp => (
                                <option key={emp.value} value={emp.value}>{emp.label}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: '1 1 175px', minWidth: '150px' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            Banco
                        </label>
                        <select
                            value={bancoId}
                            onChange={e => setBancoId(e.target.value)}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem' }}
                        >
                            <option value="">Todos los bancos</option>
                            {bancoOptions.map(b => (
                                <option key={b.value} value={b.value}>{b.label}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: '1 1 180px', minWidth: '140px' }}>
                        <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            Buscar cuenta
                        </label>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Nombre o # cuenta..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{ width: '100%', height: '36px', fontSize: '0.825rem', paddingLeft: '2rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', minHeight: '36px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={incluirInactivas}
                                onChange={e => {
                                    const val = e.target.checked;
                                    setIncluirInactivas(val);
                                    fetchData({ incluirInactivas: val });
                                }}
                                style={{ width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                            />
                            <span>Incluir inactivas</span>
                        </label>

                        {type !== 'antiguedad-cheques' && (
                            <label
                                title="Comparar saldos nativos de db_sipe_admin contra los SPs legados de externalDb"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', userSelect: 'none', cursor: 'pointer' }}
                            >
                                <input
                                    type="checkbox"
                                    checked={comparativo}
                                    onChange={e => {
                                        const val = e.target.checked;
                                        setComparativo(val);
                                        fetchData({ comparativo: val });
                                    }}
                                    style={{ width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                                />
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <Scale size={13} color="var(--primary)" /> Comparativo SP
                                </span>
                            </label>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={loading}
                            style={{ height: '36px', padding: '0 1.1rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <Filter size={15} />
                            {loading ? 'Consultando...' : 'Consultar'}
                        </button>
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={handleResetFilters}
                            disabled={loading}
                            title="Restablecer filtros"
                            style={{ height: '36px', padding: '0 0.75rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </form>
            </div>

            {/* Safe non-blocking Comparativo warning banner */}
            {reportData?.comparativo?.solicitado && (!reportData.comparativo.disponible || reportData.comparativo.error) && (
                <div style={{
                    padding: '0.65rem 0.9rem',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fbbf24',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap'
                }}>
                    <AlertTriangle size={16} />
                    <span>
                        <strong>Modo comparativo no disponible:</strong>{' '}
                        {reportData.comparativo.error || 'Base de datos externa (SP legado) no disponible; mostrando únicamente saldos nativos de db_sipe_admin.'}
                    </span>
                </div>
            )}

            {/* View Switcher Tabs + Quick Summary Badges */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {type !== 'antiguedad-cheques' && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('SALDOS')}
                            style={{
                                height: '34px',
                                padding: '0 0.95rem',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                borderRadius: '9999px',
                                cursor: 'pointer',
                                border: activeTab === 'SALDOS' ? '1px solid var(--primary)' : '1px solid var(--border)',
                                background: activeTab === 'SALDOS' ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.03)',
                                color: activeTab === 'SALDOS' ? 'var(--primary)' : 'var(--text-muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}
                        >
                            <Landmark size={14} />
                            Saldos por Cuenta ({displayedCuentas.length})
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setActiveTab('AGING')}
                        style={{
                            height: '34px',
                            padding: '0 0.95rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            borderRadius: '9999px',
                            cursor: 'pointer',
                            border: activeTab === 'AGING' ? '1px solid var(--primary)' : '1px solid var(--border)',
                            background: activeTab === 'AGING' ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.03)',
                            color: activeTab === 'AGING' ? 'var(--primary)' : 'var(--text-muted)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <Clock size={14} />
                        Antigüedad Cheques en Tránsito ({allFilteredPendingChecks.length})
                    </button>
                </div>

                {reportData && (
                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <span>
                            Chequera Total:{' '}
                            <strong style={{ color: Number(displayedTotales.saldo_chequera) < 0 ? '#ef4444' : '#10b981' }}>
                                {moneyFmt(displayedTotales.saldo_chequera)}
                            </strong>
                        </span>
                        <span>·</span>
                        <span>
                            Banco Conciliado:{' '}
                            <strong style={{ color: 'var(--primary)' }}>
                                {moneyFmt(displayedTotales.saldo_conciliado_libros)}
                            </strong>
                        </span>
                        {agingBucketsSummary.caducos_count > 0 && (
                            <>
                                <span>·</span>
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                    Caducos (&gt;180d): {agingBucketsSummary.caducos_count} ({moneyFmt(agingBucketsSummary.caducos_monto)})
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* SALDOS TAB */}
            {activeTab === 'SALDOS' && type !== 'antiguedad-cheques' && (
                <div className="card glass table-responsive" style={{ padding: 0 }}>
                    {loading && !reportData ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Consultando saldos bancarios...
                        </div>
                    ) : displayedCuentas.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            No se encontraron cuentas bancarias activas en db_sipe_admin para los filtros seleccionados.
                        </div>
                    ) : (
                        <table style={{ width: '100%', minWidth: comparativoDisponible ? '1280px' : '1120px', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: 0 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Empresa / Banco / Cuenta</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Saldo Inicial</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Saldo Chequera</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Cheques / Cargos Tránsito</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Depósitos Tránsito</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Saldo Banco Conciliado</th>
                                    {comparativoDisponible && (
                                        <>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Saldo SP ({reportData?.comparativo?.fuente || 'SP'})</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Dif. vs SP</th>
                                        </>
                                    )}
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado Período</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Última Validación</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayedCuentas.map(row => {
                                    const cheqNeg = Number(row.saldo_chequera || 0) < 0;
                                    const bancoNeg = Number(row.saldo_conciliado_libros || 0) < 0;
                                    const periodoEstado = row.estado_periodo || 'ABIERTO';
                                    const periodoBadge = periodoEstado === 'CERRADO'
                                        ? { bg: 'rgba(16,185,129,0.14)', color: '#10b981', Icon: Lock }
                                        : (periodoEstado === 'REABIERTO'
                                            ? { bg: 'rgba(245,158,11,0.14)', color: '#f59e0b', Icon: Unlock }
                                            : { bg: 'rgba(59,130,246,0.14)', color: '#60a5fa', Icon: CheckCircle2 });
                                    const PeriodoIcon = periodoBadge.Icon;
                                    const hasAging = Number(row.aging?.total_cheques || 0) > 0;

                                    return (
                                        <tr key={row.cuenta_bancaria_id || row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: row.activa ? 1 : 0.68 }}>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>
                                                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                    <span>{row.nombre || row.numero}</span>
                                                    {!row.activa && (
                                                        <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(239,68,68,0.14)', color: '#ef4444' }}>
                                                            Inactiva
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {row.empresa_nombre || row.empresa_codigo} · {row.banco_nombre} · <strong>#{row.numero}</strong>
                                                </div>
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <div>{moneyFmt(row.saldo_inicial)}</div>
                                                {row.fecha_saldo_inicial && (
                                                    <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                                                        {formatDateDMY(row.fecha_saldo_inicial)}
                                                    </div>
                                                )}
                                            </td>

                                            <td style={{
                                                padding: '0.45rem 0.5rem',
                                                textAlign: 'right',
                                                whiteSpace: 'nowrap',
                                                fontWeight: type === 'saldos-chequera' ? 700 : 600,
                                                color: cheqNeg ? '#ef4444' : (type === 'saldos-chequera' ? 'var(--primary)' : 'var(--text)'),
                                                background: type === 'saldos-chequera' ? 'rgba(99,102,241,0.05)' : 'transparent'
                                            }}>
                                                <div>{moneyFmt(row.saldo_chequera)}</div>
                                                {Number(row.cheques_reservados_count || 0) > 0 && (
                                                    <div style={{ fontSize: '0.69rem', color: '#f59e0b' }}>
                                                        Res: {row.cheques_reservados_count} ({moneyFmt(row.cheques_reservados_monto)})
                                                    </div>
                                                )}
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <div style={{ color: Number(row.cargos_cheques_en_transito || 0) > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: 600 }}>
                                                    {moneyFmt(row.cargos_cheques_en_transito)}
                                                </div>
                                                {(Number(row.cheques_en_transito || 0) > 0 || Number(row.cargos_en_transito || 0) > 0) && (
                                                    <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                                                        Ck: {moneyFmt(row.cheques_en_transito)} · Cg: {moneyFmt(row.cargos_en_transito)}
                                                    </div>
                                                )}
                                                {hasAging && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedCuentaAging(row)}
                                                        title="Ver detalle de antigüedad de cheques de esta cuenta"
                                                        style={{
                                                            marginTop: '0.15rem',
                                                            padding: '0.1rem 0.4rem',
                                                            borderRadius: '9999px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            border: row.aging.caducos_count > 0
                                                                ? '1px solid rgba(239,68,68,0.4)'
                                                                : '1px solid rgba(245,158,11,0.35)',
                                                            background: row.aging.caducos_count > 0
                                                                ? 'rgba(239,68,68,0.14)'
                                                                : 'rgba(245,158,11,0.12)',
                                                            color: row.aging.caducos_count > 0 ? '#ef4444' : '#f59e0b'
                                                        }}
                                                    >
                                                        {row.aging.total_cheques} Ck pend.
                                                        {row.aging.caducos_count > 0 ? ` (${row.aging.caducos_count} cad.)` : ''}
                                                    </button>
                                                )}
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', color: Number(row.depositos_en_transito || 0) > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: 600 }}>
                                                {moneyFmt(row.depositos_en_transito)}
                                            </td>

                                            <td style={{
                                                padding: '0.45rem 0.5rem',
                                                textAlign: 'right',
                                                whiteSpace: 'nowrap',
                                                fontWeight: type === 'saldos-bancos' ? 700 : 600,
                                                color: bancoNeg ? '#ef4444' : (type === 'saldos-bancos' ? '#10b981' : 'var(--text)'),
                                                background: type === 'saldos-bancos' ? 'rgba(16,185,129,0.05)' : 'transparent'
                                            }}>
                                                {moneyFmt(row.saldo_conciliado_libros)}
                                            </td>

                                            {comparativoDisponible && (
                                                <>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {row.comparativo_sp ? moneyFmt(row.comparativo_sp.saldo_sp) : <span style={{ color: 'var(--text-muted)' }}>N/D</span>}
                                                    </td>
                                                    <td style={{
                                                        padding: '0.45rem 0.5rem',
                                                        textAlign: 'right',
                                                        whiteSpace: 'nowrap',
                                                        fontWeight: 600,
                                                        color: row.comparativo_sp && Math.abs(Number(row.comparativo_sp.diferencia_vs_sp || 0)) > 0.01 ? '#f59e0b' : '#10b981'
                                                    }}>
                                                        {row.comparativo_sp ? moneyFmt(row.comparativo_sp.diferencia_vs_sp) : '-'}
                                                    </td>
                                                </>
                                            )}

                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '0.25rem',
                                                    fontSize: '0.72rem',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 600,
                                                    background: periodoBadge.bg,
                                                    color: periodoBadge.color
                                                }}>
                                                    <PeriodoIcon size={11} />
                                                    {periodoEstado}
                                                </span>
                                                {row.periodo_cerrado_hasta && (
                                                    <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                                        Hasta: {formatDateDMY(row.periodo_cerrado_hasta)}
                                                    </div>
                                                )}
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                {row.ultima_validacion ? (
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                                            {formatDateDMY(row.ultima_validacion.fecha_validacion)}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                            Bco: {moneyFmt(row.ultima_validacion.monto_banco)}
                                                        </div>
                                                        {row.dias_sin_validar !== null && row.dias_sin_validar !== undefined && (
                                                            <div style={{ fontSize: '0.68rem', color: Number(row.dias_sin_validar) > 7 ? '#f59e0b' : '#10b981' }}>
                                                                Hace {row.dias_sin_validar}d
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        background: 'rgba(245,158,11,0.12)',
                                                        color: '#f59e0b',
                                                        fontWeight: 600
                                                    }}>
                                                        Sin validar
                                                    </span>
                                                )}
                                            </td>

                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    {canGoConciliar && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleNavigateCuenta('conciliacion', row)}
                                                            className="btn-secondary"
                                                            style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.71rem' }}
                                                            title="Ir a Conciliación Bancaria con esta cuenta"
                                                        >
                                                            Conciliar
                                                        </button>
                                                    )}
                                                    {canGoMovimientos && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleNavigateCuenta('movimientos', row)}
                                                            className="btn-secondary"
                                                            style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.71rem' }}
                                                            title="Ir a Movimientos Bancarios con esta cuenta"
                                                        >
                                                            Mov.
                                                        </button>
                                                    )}
                                                    {canGoKardex && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleNavigateCuenta('kardex', row)}
                                                            className="btn-secondary"
                                                            style={{ height: '26px', padding: '0 0.45rem', fontSize: '0.71rem' }}
                                                            title="Ir al Libro Auxiliar (Kardex) con esta cuenta"
                                                        >
                                                            Kardex
                                                        </button>
                                                    )}
                                                    {!canGoConciliar && !canGoMovimientos && !canGoKardex && (
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>-</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid var(--border)', background: 'rgba(255,255,255,0.04)', fontWeight: 700, fontSize: '0.8rem' }}>
                                    <td style={{ padding: '0.55rem 0.5rem' }}>
                                        TOTALES CONSOLIDADOS ({displayedTotales.cuentas_count} cuentas)
                                    </td>
                                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {moneyFmt(displayedTotales.saldo_inicial)}
                                    </td>
                                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', color: Number(displayedTotales.saldo_chequera) < 0 ? '#ef4444' : '#10b981' }}>
                                        {moneyFmt(displayedTotales.saldo_chequera)}
                                    </td>
                                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#f59e0b' }}>
                                        {moneyFmt(displayedTotales.cargos_cheques_en_transito)}
                                    </td>
                                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#10b981' }}>
                                        {moneyFmt(displayedTotales.depositos_en_transito)}
                                    </td>
                                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--primary)' }}>
                                        {moneyFmt(displayedTotales.saldo_conciliado_libros)}
                                    </td>
                                    {comparativoDisponible && (
                                        <>
                                            <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                {moneyFmt(reportData?.comparativo?.total_sp || 0)}
                                            </td>
                                            <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>-</td>
                                        </>
                                    )}
                                    <td colSpan="3" style={{ padding: '0.55rem 0.5rem', textAlign: 'right', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                        Corte: {formatDateDMY(reportData?.fecha_corte || fechaCorte)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            )}

            {/* AGING TAB (R3.3) */}
            {(activeTab === 'AGING' || type === 'antiguedad-cheques') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* 4 Bucket Summary Cards + Por Caducar / Caducos Alert */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                        {agingBucketsSummary.bucketsList.map(b => {
                            const isSelected = agingBucketFilter === b.bucket;
                            const isCaduco = b.bucket === '>180';
                            const isWarn = b.bucket === '91-180';
                            const accent = isCaduco ? '#ef4444' : (isWarn ? '#f59e0b' : (b.bucket === '31-90' ? '#60a5fa' : '#10b981'));
                            return (
                                <button
                                    key={b.bucket}
                                    type="button"
                                    onClick={() => setAgingBucketFilter(prev => (prev === b.bucket ? 'TODOS' : b.bucket))}
                                    className="card glass"
                                    style={{
                                        flex: '1 1 180px',
                                        padding: '0.75rem 0.95rem',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        border: isSelected ? `1.5px solid ${accent}` : '1px solid var(--border)',
                                        background: isSelected ? 'rgba(99,102,241,0.08)' : undefined
                                    }}
                                >
                                    <div style={{ fontSize: '0.73rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                                        {b.label || b.bucket}
                                    </div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: accent, marginTop: '0.2rem' }}>
                                        {moneyFmt(b.total_monto)}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                        {b.count} cheque(s)
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Filter Pills + Alerts */}
                    <div className="card glass" style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {[
                                { key: 'TODOS', label: `Todos (${allFilteredPendingChecks.length})` },
                                { key: '0-30', label: '0-30d' },
                                { key: '31-90', label: '31-90d' },
                                { key: '91-180', label: '91-180d' },
                                { key: 'POR_CADUCAR', label: `Por Caducar 150-180d (${agingBucketsSummary.por_caducar_count})` },
                                { key: '>180', label: `Caducos >180d (${agingBucketsSummary.caducos_count})` }
                            ].map(pill => {
                                const active = agingBucketFilter === pill.key;
                                return (
                                    <button
                                        key={pill.key}
                                        type="button"
                                        onClick={() => setAgingBucketFilter(pill.key)}
                                        style={{
                                            height: '28px',
                                            padding: '0 0.65rem',
                                            fontSize: '0.75rem',
                                            borderRadius: '9999px',
                                            cursor: 'pointer',
                                            border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                                            background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                                            color: active ? 'var(--primary)' : 'var(--text-muted)',
                                            fontWeight: active ? 600 : 500
                                        }}
                                    >
                                        {pill.label}
                                    </button>
                                );
                            })}
                        </div>

                        {(agingBucketsSummary.por_caducar_count > 0 || agingBucketsSummary.caducos_count > 0) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.76rem' }}>
                                <ShieldAlert size={15} color="#f59e0b" />
                                {agingBucketsSummary.por_caducar_count > 0 && (
                                    <span style={{ color: '#fb923c', fontWeight: 600 }}>
                                        Por caducar: {agingBucketsSummary.por_caducar_count} ({moneyFmt(agingBucketsSummary.por_caducar_monto)})
                                    </span>
                                )}
                                {agingBucketsSummary.caducos_count > 0 && (
                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                        Caducos: {agingBucketsSummary.caducos_count} ({moneyFmt(agingBucketsSummary.caducos_monto)})
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Pending Checks Detail Table */}
                    <div className="card glass table-responsive" style={{ padding: 0 }}>
                        {displayedAgingChecks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No hay cheques en circulación para los criterios seleccionados.
                            </div>
                        ) : (
                            <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: 0 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}># Cheque</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Fecha Emisión</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Empresa / Cuenta</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Beneficiario</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Concepto</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Monto ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Días</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Antigüedad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedAgingChecks.map(ck => {
                                        const badge = getAgingBadgeStyle(ck);
                                        return (
                                            <tr key={`${ck.cuenta_bancaria_id}-${ck.id}-${ck.cheque}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700 }}>{ck.cheque}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{formatDateDMY(ck.fecha)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>
                                                    <div style={{ fontWeight: 500 }}>{ck.cuenta_nombre || ck.numero_cuenta}</div>
                                                    <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                                        {ck.empresa_nombre || ck.empresa_codigo} · {ck.banco_nombre} · #{ck.numero_cuenta}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{ck.a_nombre || '-'}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ck.concepto}>
                                                    {ck.concepto || '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                    {moneyFmt(ck.valor)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                                                    {ck.dias_circulacion ?? ck.dias ?? 0}d
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 600,
                                                        background: badge.bg,
                                                        color: badge.color,
                                                        border: `1px solid ${badge.border}`
                                                    }}>
                                                        {badge.text}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Per-Account Aging Detail Modal */}
            <Modal
                open={Boolean(selectedCuentaAging)}
                onClose={() => setSelectedCuentaAging(null)}
                size="lg"
                title={
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Eye size={18} color="var(--primary)" />
                        Cheques en Circulación · {selectedCuentaAging?.nombre || ''} (#{selectedCuentaAging?.numero || ''})
                    </span>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span>Empresa: <strong style={{ color: 'var(--text)' }}>{selectedCuentaAging?.empresa_nombre}</strong></span>
                        <span>Banco: <strong style={{ color: 'var(--text)' }}>{selectedCuentaAging?.banco_nombre}</strong></span>
                        <span>Pendientes: <strong style={{ color: '#f59e0b' }}>{modalAccountChecks.length}</strong></span>
                    </div>
                    <div className="table-responsive">
                        <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: 0 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}># Cheque</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Fecha</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'left' }}>Beneficiario</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Monto ($)</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Días</th>
                                    <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Antigüedad</th>
                                </tr>
                            </thead>
                            <tbody>
                                {modalAccountChecks.map(ck => {
                                    const badge = getAgingBadgeStyle(ck);
                                    return (
                                        <tr key={ck.id || ck.cheque} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700 }}>{ck.cheque}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{formatDateDMY(ck.fecha)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem' }}>{ck.a_nombre || '-'}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{moneyFmt(ck.valor)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>{ck.dias_circulacion ?? ck.dias ?? 0}d</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    padding: '0.15rem 0.45rem',
                                                    borderRadius: '4px',
                                                    fontWeight: 600,
                                                    background: badge.bg,
                                                    color: badge.color
                                                }}>
                                                    {badge.text}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </Modal>

            <ReportPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                pdfSource={previewPdfBlob}
                title={title}
                subtitle={`${description} | Corte: ${formatDateDMY(reportData?.fecha_corte || fechaCorte)}`}
                badge={badgeText}
                totalPages={previewTotalPages}
                fileName={previewFileName}
                footerInfo="Reporte Oficial de Tesorería y Saldos Bancarios (db_sipe_admin) - Formato Carta"
            />
        </div>
    );
}
