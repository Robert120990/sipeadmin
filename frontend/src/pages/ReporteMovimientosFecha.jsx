import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    FileText, Search, FileSpreadsheet, Printer, Clock, Paperclip,
    ChevronLeft, ChevronRight, CheckCircle2, AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReportPreviewModal from '../components/ReportPreviewModal';
import ReceiptViewerModal from '../components/ReceiptViewerModal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { moneyFmt } from '../utils/format';
import { formatDateDMY } from '../utils/date';
import { sanitizeSpreadsheetRows } from '../utils/exportSanitizer';
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

export default function ReporteMovimientosFecha() {
    const { addToast } = useToast();

    // Catalog state
    const [cuentas, setCuentas] = useState([]);
    const [loadingCatalogos, setLoadingCatalogos] = useState(true);
    const cuentasRef = useRef([]);

    // Filters state (R5.5 default 'este_mes')
    const [periodoPreset, setPeriodoPreset] = useState('este_mes');
    const initialRange = useMemo(() => getPeriodoDates('este_mes'), []);
    const [selectedCuentaId, setSelectedCuentaId] = useState('');
    const [desde, setDesde] = useState(initialRange.desde);
    const [hasta, setHasta] = useState(initialRange.hasta);
    const [estado, setEstado] = useState('TODOS'); // 'TODOS' | 'CONCILIADOS' | 'EN_TRANSITO'
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(100);

    const filtersRef = useRef({
        selectedCuentaId: '',
        desde: initialRange.desde,
        hasta: initialRange.hasta,
        estado: 'TODOS',
        search: '',
        page: 1,
        limit: 100
    });
    filtersRef.current = { selectedCuentaId, desde, hasta, estado, search, page, limit };

    // Kardex Results state
    const [kardexData, setKardexData] = useState(null);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [exporting, setExporting] = useState(false);

    // ReceiptViewerModal state
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerReceipts, setViewerReceipts] = useState([]);
    const [viewerTitle, setViewerTitle] = useState('Comprobante del Movimiento');

    // ReportPreviewModal state
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('Libro Auxiliar Bancario (Kardex)');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewBadge, setPreviewBadge] = useState('');
    const [previewFileName, setPreviewFileName] = useState('kardex_bancario.pdf');

    const fetchKardex = useCallback(async (overrides = {}) => {
        const cur = filtersRef.current;
        const targetCuentaId = overrides.cuentaId ?? cur.selectedCuentaId;
        const targetDesde = overrides.desde ?? cur.desde;
        const targetHasta = overrides.hasta ?? cur.hasta;
        const targetEstado = overrides.estado ?? cur.estado;
        const targetSearch = overrides.search ?? cur.search;
        const targetPage = overrides.page ?? cur.page;
        const targetLimit = overrides.limit ?? cur.limit;

        if (!targetCuentaId) {
            addToast('Seleccione una cuenta bancaria', 'warning');
            return;
        }
        if (!targetDesde || !targetHasta) {
            addToast('Especifique el rango de fechas', 'warning');
            return;
        }
        if (targetDesde > targetHasta) {
            addToast('La fecha "Desde" no puede ser mayor que la fecha "Hasta"', 'warning');
            return;
        }

        setSearching(true);
        try {
            const params = {
                cuenta_bancaria_id: targetCuentaId,
                desde: targetDesde,
                hasta: targetHasta,
                estado: targetEstado,
                page: targetPage,
                limit: targetLimit
            };
            if (String(targetSearch || '').trim()) {
                params.search = String(targetSearch).trim();
            }

            const res = await api.get('/bancos/movimientos/kardex', { params });
            setKardexData(res.data || null);
            setPage(res.data?.pagination?.page || targetPage);
            setSearched(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al consultar el Kardex bancario', 'error');
        } finally {
            setSearching(false);
        }
    }, [addToast]);

    // Unified mount + R5.4 keep-alive navigation subscription
    useEffect(() => {
        let active = true;
        const init = async () => {
            setLoadingCatalogos(true);
            let loadedCuentas = [];
            try {
                const res = await api.get('/bancos/movimientos/catalogos');
                if (!active) return;
                loadedCuentas = res.data.cuentas || [];
                cuentasRef.current = loadedCuentas;
                setCuentas(loadedCuentas);
            } catch {
                if (active) addToast('Error al cargar cuentas bancarias', 'error');
            } finally {
                if (active) setLoadingCatalogos(false);
            }

            if (!active || loadedCuentas.length === 0) return;

            const sorted = sortCuentas(loadedCuentas);
            const initialCtx = resolveInitialBancosContext('/dashboard/bancos/reportes/movimientos-fecha');
            const matched = initialCtx ? findMatchingCuenta(loadedCuentas, initialCtx) : null;
            const targetAcc = matched || sorted[0];

            if (targetAcc?.corr) {
                const targetId = String(targetAcc.corr);
                setSelectedCuentaId(targetId);
                filtersRef.current.selectedCuentaId = targetId;
                fetchKardex({ cuentaId: targetId, page: 1 });
            }
        };
        init();

        const unsubscribe = subscribeBancosNavTarget('/dashboard/bancos/reportes/movimientos-fecha', (detail) => {
            const list = cuentasRef.current;
            const match = findMatchingCuenta(list, detail);
            if (match?.corr) {
                const targetId = String(match.corr);
                setSelectedCuentaId(targetId);
                setPage(1);
                filtersRef.current.selectedCuentaId = targetId;
                fetchKardex({ cuentaId: targetId, page: 1 });
            }
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, [addToast, fetchKardex]);

    const currentCuenta = useMemo(() => {
        return cuentas.find(c => String(c.corr) === String(selectedCuentaId)) || null;
    }, [cuentas, selectedCuentaId]);

    const handleCuentaChange = (newId) => {
        setSelectedCuentaId(newId);
        setPage(1);
        const acc = cuentas.find(c => String(c.corr) === String(newId));
        if (acc) {
            saveBancosSelection({
                empresaId: acc.id_empresa || '',
                cuentaId: acc.corr || '',
                numeroCuenta: acc.numero || ''
            });
            fetchKardex({ cuentaId: newId, page: 1 });
        }
    };

    const applyPeriodoPreset = (presetKey) => {
        const range = getPeriodoDates(presetKey);
        setPeriodoPreset(presetKey);
        setDesde(range.desde);
        setHasta(range.hasta);
        setPage(1);
        if (filtersRef.current.selectedCuentaId) {
            fetchKardex({ desde: range.desde, hasta: range.hasta, page: 1 });
        }
    };

    const handleSearch = (e) => {
        if (e) e.preventDefault();
        setPage(1);
        fetchKardex({ page: 1 });
    };

    const handleOpenItemReceipts = async (item) => {
        if (!item || item.origen_tipo !== 'MOV') return;
        const fallbackUrl = item.signed_url || item.comprobante_url;
        if (!fallbackUrl) return;
        setViewerTitle(`Comprobante · ${item.documento || 'Movimiento'}`);
        try {
            const res = await api.get(`/bancos/movimientos/${item.id}/comprobantes`);
            const list = res.data?.comprobantes || [];
            if (list.length > 0) {
                setViewerReceipts(list);
                setViewerOpen(true);
                return;
            }
        } catch {
            // Fallback to inline signed URL below
        }
        setViewerReceipts([{
            id: null,
            nombre_original: item.documento || 'Comprobante',
            archivo_url: item.comprobante_url || fallbackUrl,
            signed_url: fallbackUrl
        }]);
        setViewerOpen(true);
    };

    const fetchFullExportKardex = async () => {
        if (!selectedCuentaId || !desde || !hasta) {
            addToast('Seleccione una cuenta y rango de fechas válidos', 'warning');
            return null;
        }
        if (desde > hasta) {
            addToast('La fecha "Desde" no puede ser mayor que la fecha "Hasta"', 'warning');
            return null;
        }
        setExporting(true);
        try {
            const params = {
                cuenta_bancaria_id: selectedCuentaId,
                desde,
                hasta,
                estado,
                export: 'true'
            };
            if (search.trim()) params.search = search.trim();
            const res = await api.get('/bancos/movimientos/kardex', { params });
            return res.data || null;
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al obtener datos completos para exportar', 'error');
            return null;
        } finally {
            setExporting(false);
        }
    };

    // Export to Excel (full period via export=true)
    const handleExportExcel = async () => {
        const full = await fetchFullExportKardex();
        if (!full) return;

        const items = full.items || [];
        const totales = full.totales || {};

        const excelRows = [
            {
                Fecha: formatDateDMY(desde),
                Origen: 'APERTURA',
                'Documento / # Ck': '-',
                Concepto: `SALDO INICIAL AL ${formatDateDMY(desde)}`,
                'Beneficiario / Tipo': '',
                'Cargo ($)': '',
                'Abono ($)': '',
                'Saldo Corrido ($)': Number(totales.saldo_inicial_periodo || 0),
                Estado: '-',
                'Fecha Aplicado': '',
                'No. Partida': ''
            },
            ...items.map(item => ({
                Fecha: formatDateDMY(item.fecha),
                Origen: item.origen_tipo || 'MOV',
                'Documento / # Ck': item.documento || '',
                Concepto: item.concepto || '',
                'Beneficiario / Tipo': item.beneficiario || item.tipo_remesa_desc || item.cod_remesa || '',
                'Cargo ($)': Number(item.cargo || 0),
                'Abono ($)': Number(item.abono || 0),
                'Saldo Corrido ($)': Number(item.saldo_corrido || 0),
                Estado: item.conciliado ? 'CONCILIADO' : 'EN TRÁNSITO',
                'Fecha Aplicado': item.fecha_aplicado ? formatDateDMY(item.fecha_aplicado) : '',
                'No. Partida': item.num_partida || ''
            })),
            {
                Fecha: formatDateDMY(hasta),
                Origen: 'CIERRE',
                'Documento / # Ck': '-',
                Concepto: `TOTALES Y SALDO FINAL (${items.length} operaciones)`,
                'Beneficiario / Tipo': '',
                'Cargo ($)': Number(totales.total_cargos || 0),
                'Abono ($)': Number(totales.total_abonos || 0),
                'Saldo Corrido ($)': Number(totales.saldo_final_periodo || 0),
                Estado: '-',
                'Fecha Aplicado': '',
                'No. Partida': ''
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(excelRows));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Kardex_Bancario');
        const cuentaName = currentCuenta?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cuenta';
        XLSX.writeFile(workbook, `Kardex_Bancario_${cuentaName}_${desde}_${hasta}.xlsx`);
        addToast('Archivo Excel descargado con éxito', 'success');
    };

    // Generate PDF Preview (Landscape Letter via ReportPreviewModal, full period via export=true)
    const handlePreviewPdf = async () => {
        const full = await fetchFullExportKardex();
        if (!full) return;

        const items = full.items || [];
        const totales = full.totales || {};

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'letter' // Carta: 279.4 x 215.9 mm
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('LIBRO AUXILIAR DE BANCOS (KARDEX BANCARIO)', pageWidth / 2, 13, { align: 'center' });

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const cuentaDesc = currentCuenta ? formatCuentaLabel(currentCuenta) : '';
        doc.text(`Cuenta: ${cuentaDesc}`, 14, 20);
        doc.text(`Período: ${formatDateDMY(desde)} al ${formatDateDMY(hasta)}   |   Filtro: ${estado}`, 14, 25);
        doc.text(`Generado: ${new Date().toLocaleDateString('es-SV')} ${new Date().toLocaleTimeString('es-SV')}`, pageWidth - 14, 20, { align: 'right' });
        doc.text(`Operaciones: ${items.length}   |   Saldo Final: ${moneyFmt(totales.saldo_final_periodo)}`, pageWidth - 14, 25, { align: 'right' });

        const tableHeaders = [[
            'Fecha', 'Orig.', 'Documento', 'Concepto / Beneficiario',
            'Estado', 'Cargo ($)', 'Abono ($)', 'Saldo Corrido ($)'
        ]];

        const openingRow = [
            formatDateDMY(desde),
            'INI',
            '-',
            `SALDO INICIAL AL ${formatDateDMY(desde)}`,
            '-',
            '-',
            '-',
            moneyFmt(totales.saldo_inicial_periodo)
        ];

        const tableRows = [
            openingRow,
            ...items.map(item => [
                formatDateDMY(item.fecha),
                item.origen_tipo || 'MOV',
                item.documento || '-',
                `${item.concepto || '-'}${item.beneficiario ? ` (${item.beneficiario})` : ''}`,
                item.conciliado ? `CONC.${item.fecha_aplicado ? ` ${formatDateDMY(item.fecha_aplicado)}` : ''}` : 'EN TRÁNSITO',
                Number(item.cargo || 0) > 0 ? moneyFmt(item.cargo) : '-',
                Number(item.abono || 0) > 0 ? moneyFmt(item.abono) : '-',
                moneyFmt(item.saldo_corrido)
            ])
        ];

        autoTable(doc, {
            head: tableHeaders,
            body: tableRows,
            startY: 30,
            theme: 'striped',
            styles: { fontSize: 7.3, cellPadding: 1.8, overflow: 'linebreak' },
            headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 12, halign: 'center' },
                2: { cellWidth: 25, fontStyle: 'bold' },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 30, halign: 'center' },
                5: { cellWidth: 26, halign: 'right' },
                6: { cellWidth: 26, halign: 'right' },
                7: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
            },
            foot: [
                [
                    { content: `TOTALES DEL PERÍODO (${items.length} ops) · Neto: ${moneyFmt(totales.neto_periodo)}`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: moneyFmt(totales.total_cargos), styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] } },
                    { content: moneyFmt(totales.total_abonos), styles: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] } },
                    { content: moneyFmt(totales.saldo_final_periodo), styles: { halign: 'right', fontStyle: 'bold', textColor: [37, 99, 235] } }
                ]
            ],
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8 },
            margin: { top: 28, bottom: 16, left: 14, right: 14 },
            didDrawPage: (d) => {
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(`Página ${d.pageNumber} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
                doc.text('SIPE Admin - Libro Auxiliar de Bancos (Kardex)', 14, pageHeight - 8);
            }
        });

        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewTitle('Libro Auxiliar de Bancos (Kardex)');
        setPreviewSubtitle(`${cuentaDesc} | ${formatDateDMY(desde)} al ${formatDateDMY(hasta)}`);
        setPreviewBadge(currentCuenta?.banco_nombre || 'KARDEX');
        const cuentaFileName = currentCuenta?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cuenta';
        setPreviewFileName(`Kardex_Bancario_${cuentaFileName}_${desde}_${hasta}.pdf`);
        setShowPreviewModal(true);
    };

    const items = kardexData?.items || [];
    const totales = kardexData?.totales || {
        saldo_inicial_periodo: 0,
        total_abonos: 0,
        total_cargos: 0,
        neto_periodo: 0,
        saldo_final_periodo: 0
    };
    const pagination = kardexData?.pagination || { page: 1, limit: 100, total: items.length, total_pages: 1 };
    const startIdx = pagination.total === 0 ? 0 : ((pagination.page - 1) * pagination.limit) + 1;
    const endIdx = Math.min(pagination.total, pagination.page * pagination.limit);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <FileText size={22} color="var(--primary)" />
                        Libro Auxiliar de Bancos (Kardex)
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Historial cronológico unificado de movimientos y cheques válidos con saldo inicial, saldo corrido línea por línea y estado de conciliación.
                    </p>
                </div>
            </div>

            {/* Filters Card */}
            <div className="card glass" style={{ padding: '0.85rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* R5.5 Quick Period Presets */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
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

                <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {/* Cuenta Bancaria (responsive width, safe on 320px) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 260px', minWidth: 0, maxWidth: '100%' }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Cuenta Bancaria *
                        </label>
                        <select
                            className="form-control"
                            value={selectedCuentaId}
                            onChange={(e) => handleCuentaChange(e.target.value)}
                            disabled={loadingCatalogos}
                            required
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
                        >
                            <option value="">-- Seleccionar cuenta bancaria --</option>
                            {sortCuentas(cuentas).map(c => (
                                <option key={c.corr} value={c.corr}>
                                    {formatCuentaLabel(c)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '0 1 138px', minWidth: '120px' }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Desde Fecha *
                        </label>
                        <input
                            type="date"
                            className="form-control"
                            value={desde}
                            onChange={(e) => { setPeriodoPreset(''); setDesde(e.target.value); }}
                            required
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.55rem' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '0 1 138px', minWidth: '120px' }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Hasta Fecha *
                        </label>
                        <input
                            type="date"
                            className="form-control"
                            value={hasta}
                            onChange={(e) => { setPeriodoPreset(''); setHasta(e.target.value); }}
                            required
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.55rem' }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 160px', minWidth: 0 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Estado Conciliación
                        </label>
                        <select
                            className="form-control"
                            value={estado}
                            onChange={(e) => setEstado(e.target.value)}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
                        >
                            <option value="TODOS">Todos (Conciliados + Tránsito)</option>
                            <option value="CONCILIADOS">Solo Conciliados</option>
                            <option value="EN_TRANSITO">Solo En Tránsito</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 170px', minWidth: 0 }}>
                        <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Buscar Doc / Concepto
                        </label>
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Documento, beneficiario..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ width: '100%', height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={searching}
                        style={{
                            height: '36px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0 1.25rem',
                            fontSize: '0.825rem'
                        }}
                    >
                        <Search size={15} />
                        {searching ? 'Consultando...' : 'Consultar Kardex'}
                    </button>
                </form>
            </div>

            {/* Resultados Kardex */}
            {searched && (
                <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* KPIs & Export Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Saldo Inicial: <strong style={{ color: 'var(--text)' }}>{moneyFmt(totales.saldo_inicial_periodo)}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Total Cargos: <strong style={{ color: '#ef4444' }}>{moneyFmt(totales.total_cargos)}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Total Abonos: <strong style={{ color: '#10b981' }}>{moneyFmt(totales.total_abonos)}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Neto: <strong style={{ color: Number(totales.neto_periodo) >= 0 ? '#10b981' : '#ef4444' }}>
                                    {Number(totales.neto_periodo) >= 0 ? '+' : ''}{moneyFmt(totales.neto_periodo)}
                                </strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Saldo Final: <strong style={{ color: 'var(--primary)' }}>{moneyFmt(totales.saldo_final_periodo)}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Operaciones: <strong style={{ color: 'var(--text)' }}>{pagination.total}</strong>
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={exporting || (pagination.total === 0 && !kardexData)}
                                className="btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', height: '34px', padding: '0 0.85rem', fontSize: '0.825rem' }}
                                title="Exportar Kardex completo a Excel"
                            >
                                <FileSpreadsheet size={15} />
                                {exporting ? 'Exportando...' : 'Excel'}
                            </button>
                            <button
                                type="button"
                                onClick={handlePreviewPdf}
                                disabled={exporting || (pagination.total === 0 && !kardexData)}
                                className="btn-primary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', height: '34px', padding: '0 1rem', fontSize: '0.825rem' }}
                                title="Abrir vista previa del Kardex en tamaño Carta"
                            >
                                <Printer size={15} />
                                Vista Previa / PDF
                            </button>
                        </div>
                    </div>

                    {/* Kardex Table */}
                    {items.length === 0 && pagination.total === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            <FileText size={28} style={{ opacity: 0.4, marginBottom: '0.4rem' }} />
                            <p style={{ margin: 0, fontSize: '0.825rem' }}>
                                No hay movimientos ni cheques en el período seleccionado. Saldo inicial al {formatDateDMY(desde)}:{' '}
                                <strong style={{ color: 'var(--text)' }}>{moneyFmt(totales.saldo_inicial_periodo)}</strong>.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="table-responsive">
                                <table style={{ width: '100%', minWidth: '1040px', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: 0 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Fecha</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Origen / Tipo</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Documento / # Ck</th>
                                            <th style={{ padding: '0.45rem 0.5rem' }}>Concepto / Beneficiario</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Cargo ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Abono ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Saldo Corrido ($)</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Partida</th>
                                            <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Comp.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagination.page === 1 && (
                                            <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(99, 102, 241, 0.08)', fontWeight: 700 }}>
                                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{formatDateDMY(kardexData?.periodo?.desde || desde)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>
                                                    <span style={{ fontSize: '0.71rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(99,102,241,0.2)', color: 'var(--primary)' }}>
                                                        APERTURA
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)' }}>-</td>
                                                <td style={{ padding: '0.45rem 0.5rem' }}>SALDO INICIAL AL {formatDateDMY(kardexData?.periodo?.desde || desde)}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>-</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>-</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
                                                    {moneyFmt(totales.saldo_inicial_periodo)}
                                                </td>
                                                <td colSpan="3" style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>-</td>
                                            </tr>
                                        )}

                                        {items.map((item, idx) => {
                                            const cargoNum = Number(item.cargo || 0);
                                            const abonoNum = Number(item.abono || 0);
                                            const saldoCorrido = Number(item.saldo_corrido || 0);
                                            const isCheck = item.origen_tipo === 'CK';
                                            const hasReceipt = item.origen_tipo === 'MOV' && Boolean(item.signed_url || item.comprobante_url);

                                            return (
                                                <tr key={`${item.origen_tipo}-${item.id}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                                        {formatDateDMY(item.fecha)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <span style={{
                                                                fontSize: '0.7rem',
                                                                padding: '0.12rem 0.4rem',
                                                                borderRadius: '4px',
                                                                fontWeight: 700,
                                                                background: isCheck ? 'rgba(245, 158, 11, 0.14)' : 'rgba(59, 130, 246, 0.14)',
                                                                color: isCheck ? '#f59e0b' : '#60a5fa'
                                                            }}>
                                                                {item.origen_tipo || 'MOV'}
                                                            </span>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                {item.tipo_remesa_desc || item.cod_remesa || (isCheck ? 'Cheque' : '')}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                        {item.documento || '-'}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', maxWidth: '290px' }} title={`${item.concepto || ''}${item.beneficiario ? ` - ${item.beneficiario}` : ''}`}>
                                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                                                            {item.concepto || '-'}
                                                        </div>
                                                        {item.beneficiario && (
                                                            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                Benef.: {item.beneficiario}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: cargoNum > 0 ? '#ef4444' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        {cargoNum > 0 ? moneyFmt(cargoNum) : '-'}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: abonoNum > 0 ? '#10b981' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        {abonoNum > 0 ? moneyFmt(abonoNum) : '-'}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700, color: saldoCorrido < 0 ? '#ef4444' : 'var(--text)', whiteSpace: 'nowrap' }}>
                                                        {moneyFmt(saldoCorrido)}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        {item.conciliado ? (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.25rem',
                                                                fontSize: '0.72rem',
                                                                padding: '0.15rem 0.45rem',
                                                                borderRadius: '4px',
                                                                fontWeight: 600,
                                                                background: 'rgba(16, 185, 129, 0.14)',
                                                                color: '#10b981'
                                                            }}>
                                                                <CheckCircle2 size={11} />
                                                                {item.fecha_aplicado ? formatDateDMY(item.fecha_aplicado) : 'Conciliado'}
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '0.25rem',
                                                                fontSize: '0.72rem',
                                                                padding: '0.15rem 0.45rem',
                                                                borderRadius: '4px',
                                                                fontWeight: 600,
                                                                background: 'rgba(245, 158, 11, 0.12)',
                                                                color: '#f59e0b'
                                                            }}>
                                                                <AlertCircle size={11} />
                                                                En tránsito
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.75rem' }}>
                                                        {item.num_partida || '-'}
                                                    </td>
                                                    <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                        {hasReceipt ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenItemReceipts(item)}
                                                                title="Ver comprobante en Lightbox"
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.2rem',
                                                                    padding: '0.15rem 0.45rem',
                                                                    borderRadius: '9999px',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 600,
                                                                    border: '1px solid rgba(59,130,246,0.4)',
                                                                    background: 'rgba(59,130,246,0.14)',
                                                                    color: '#60a5fa',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <Paperclip size={11} /> Ver
                                                            </button>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Server-side Pagination Footer */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Mostrando <strong>{startIdx}–{endIdx}</strong> de <strong>{pagination.total}</strong> operaciones
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        <span>Por página:</span>
                                        <select
                                            value={limit}
                                            onChange={e => {
                                                const nextLimit = Number(e.target.value);
                                                setLimit(nextLimit);
                                                setPage(1);
                                                fetchKardex({ page: 1, limit: nextLimit });
                                            }}
                                            style={{ height: '30px', fontSize: '0.78rem', padding: '0 0.45rem' }}
                                        >
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                            <option value={200}>200</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            style={{ padding: '0.35rem', minWidth: 'auto' }}
                                            disabled={searching || pagination.page <= 1}
                                            onClick={() => fetchKardex({ page: pagination.page - 1 })}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span style={{ fontSize: '0.8rem' }}>
                                            Página <strong>{pagination.page}</strong> de {pagination.total_pages || 1}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            style={{ padding: '0.35rem', minWidth: 'auto' }}
                                            disabled={searching || pagination.page >= (pagination.total_pages || 1)}
                                            onClick={() => fetchKardex({ page: pagination.page + 1 })}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Receipt Lightbox */}
            <ReceiptViewerModal
                open={viewerOpen}
                onClose={() => setViewerOpen(false)}
                comprobantes={viewerReceipts}
                initialIndex={0}
                title={viewerTitle}
            />

            {/* Modal de Vista Previa e Impresión Carta */}
            <ReportPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge={previewBadge}
                pdfSource={previewPdfBlob}
                fileName={previewFileName}
                totalPages={previewTotalPages}
                footerInfo="Libro Auxiliar de Bancos (Kardex Bancario) - Formato Carta SIPE Admin"
            />
        </div>
    );
}
