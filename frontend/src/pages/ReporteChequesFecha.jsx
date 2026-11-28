import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DollarSign, Search, FileSpreadsheet, Printer, Clock, FileText, ShieldAlert } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { moneyFmt } from '../utils/format';
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

const normalizeToYMD = (fechaRaw, fechaDisplay) => {
    if (fechaRaw && /^\d{4}-\d{2}-\d{2}/.test(String(fechaRaw).trim())) {
        return String(fechaRaw).trim().slice(0, 10);
    }
    if (fechaDisplay && /^\d{2}\/\d{2}\/\d{4}$/.test(String(fechaDisplay).trim())) {
        const [dd, mm, yyyy] = String(fechaDisplay).trim().split('/');
        return `${yyyy}-${mm}-${dd}`;
    }
    return null;
};

const parseYmdUtcMs = (ymd) => {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
};

// Client-side exact parity with backend/services/bancosIntegrityService.js classifyCheckAging
const classifyCheckAgingLocal = (fechaRawYmd, fechaRefYmd = null) => {
    if (!fechaRawYmd) {
        return {
            dias: null,
            bucket: 'SIN_FECHA',
            label: 'Sin fecha',
            por_caducar: false,
            caduco: false
        };
    }
    const refYmd = fechaRefYmd || getSvTodayYMD();
    const emiMs = parseYmdUtcMs(fechaRawYmd);
    const refMs = parseYmdUtcMs(refYmd);
    const rawDias = Math.floor((refMs - emiMs) / 86400000);
    const dias = Math.max(0, rawDias);

    let bucket = '0-30';
    let label = '0-30 días';
    let por_caducar = false;
    let caduco = false;

    if (dias <= 30) {
        bucket = '0-30';
        label = '0-30 días';
    } else if (dias <= 90) {
        bucket = '31-90';
        label = '31-90 días';
    } else if (dias <= 180) {
        bucket = '91-180';
        label = '91-180 días';
        por_caducar = dias >= 150;
    } else {
        bucket = '>180';
        label = '>180 días (Caducos)';
        caduco = true;
    }

    return { dias, bucket, label, por_caducar, caduco };
};

const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;

export default function ReporteChequesFecha() {
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
    const [excluirAnulados, setExcluirAnulados] = useState(false);
    const [excluirReservados, setExcluirReservados] = useState(false);

    const filtersRef = useRef({
        selectedCuentaId: '',
        desde: initialRange.desde,
        hasta: initialRange.hasta,
        excluirAnulados: false,
        excluirReservados: false
    });
    filtersRef.current = { selectedCuentaId, desde, hasta, excluirAnulados, excluirReservados };

    // Results & R3.3 Aging Filter state
    const [cheques, setCheques] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [agingFilter, setAgingFilter] = useState('TODOS'); // 'TODOS' | 'PENDIENTES' | '0-30' | '31-90' | '91-180' | 'POR_CADUCAR' | '>180'

    // ReportPreviewModal state
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('Reporte de Cheques');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewBadge, setPreviewBadge] = useState('');
    const [previewFileName, setPreviewFileName] = useState('cheques.pdf');

    const runSearch = useCallback(async (overrides = {}) => {
        const cur = filtersRef.current;
        const targetCuentaId = overrides.cuentaId ?? cur.selectedCuentaId;
        const targetDesde = overrides.desde ?? cur.desde;
        const targetHasta = overrides.hasta ?? cur.hasta;
        const targetExclAnul = overrides.excluirAnulados ?? cur.excluirAnulados;
        const targetExclRes = overrides.excluirReservados ?? cur.excluirReservados;

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
                excluir_anulados: targetExclAnul,
                excluir_reservados: targetExclRes
            };
            const res = await api.get('/cheques/reporte-fecha', { params });
            setCheques(res.data || []);
            setSearched(true);
        } catch (err) {
            addToast(err.response?.data?.message || 'Error al consultar reporte de cheques', 'error');
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
                const res = await api.get('/cheques/catalogos');
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
            const initialCtx = resolveInitialBancosContext('/dashboard/bancos/reportes/cheques-fecha');
            const matched = initialCtx ? findMatchingCuenta(loadedCuentas, initialCtx) : null;
            const targetAcc = matched || sorted[0];

            if (targetAcc?.corr) {
                const targetId = String(targetAcc.corr);
                setSelectedCuentaId(targetId);
                filtersRef.current.selectedCuentaId = targetId;
                runSearch({ cuentaId: targetId });
            }
        };
        init();

        const unsubscribe = subscribeBancosNavTarget('/dashboard/bancos/reportes/cheques-fecha', (detail) => {
            const list = cuentasRef.current;
            const match = findMatchingCuenta(list, detail);
            if (match?.corr) {
                const targetId = String(match.corr);
                setSelectedCuentaId(targetId);
                filtersRef.current.selectedCuentaId = targetId;
                runSearch({ cuentaId: targetId });
            }
        });

        return () => {
            active = false;
            unsubscribe();
        };
    }, [addToast, runSearch]);

    const currentCuenta = useMemo(() => {
        return cuentas.find(c => String(c.corr) === String(selectedCuentaId)) || null;
    }, [cuentas, selectedCuentaId]);

    const handleCuentaChange = (newId) => {
        setSelectedCuentaId(newId);
        const acc = cuentas.find(c => String(c.corr) === String(newId));
        if (acc) {
            saveBancosSelection({
                empresaId: acc.id_empresa || '',
                cuentaId: acc.corr || '',
                numeroCuenta: acc.numero || ''
            });
            runSearch({ cuentaId: newId });
        }
    };

    const applyPeriodoPreset = (presetKey) => {
        const range = getPeriodoDates(presetKey);
        setPeriodoPreset(presetKey);
        setDesde(range.desde);
        setHasta(range.hasta);
        if (filtersRef.current.selectedCuentaId) {
            runSearch({ desde: range.desde, hasta: range.hasta });
        }
    };

    const handleSearch = (e) => {
        if (e) e.preventDefault();
        runSearch();
    };

    // Enrich checks with R3.3 client-side aging parity
    const svToday = getSvTodayYMD();
    const enrichedCheques = useMemo(() => {
        return cheques.map(c => {
            const isValidPending = !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado && !c.fecha_aplicado;
            const ymd = normalizeToYMD(c.fecha_raw, c.fecha);
            const aging = isValidPending ? classifyCheckAgingLocal(ymd, svToday) : null;
            return {
                ...c,
                isValidPending,
                aging
            };
        });
    }, [cheques, svToday]);

    // Aging stats summary over valid pending checks
    const agingStats = useMemo(() => {
        const buckets = {
            '0-30': { count: 0, monto: 0 },
            '31-90': { count: 0, monto: 0 },
            '91-180': { count: 0, monto: 0 },
            '>180': { count: 0, monto: 0 }
        };
        let porCaducarCount = 0;
        let porCaducarMonto = 0;
        let caducoCount = 0;
        let caducoMonto = 0;
        let totalPendientes = 0;
        let montoPendientes = 0;

        for (const c of enrichedCheques) {
            if (!c.isValidPending || !c.aging) continue;
            const val = round2(c.valor || 0);
            totalPendientes += 1;
            montoPendientes = round2(montoPendientes + val);
            if (buckets[c.aging.bucket]) {
                buckets[c.aging.bucket].count += 1;
                buckets[c.aging.bucket].monto = round2(buckets[c.aging.bucket].monto + val);
            }
            if (c.aging.por_caducar) {
                porCaducarCount += 1;
                porCaducarMonto = round2(porCaducarMonto + val);
            }
            if (c.aging.caduco) {
                caducoCount += 1;
                caducoMonto = round2(caducoMonto + val);
            }
        }

        return {
            buckets,
            porCaducarCount,
            porCaducarMonto,
            caducoCount,
            caducoMonto,
            totalPendientes,
            montoPendientes
        };
    }, [enrichedCheques]);

    const displayedCheques = useMemo(() => {
        if (agingFilter === 'TODOS') return enrichedCheques;
        if (agingFilter === 'PENDIENTES') return enrichedCheques.filter(c => c.isValidPending);
        if (agingFilter === 'POR_CADUCAR') return enrichedCheques.filter(c => c.isValidPending && c.aging?.por_caducar);
        return enrichedCheques.filter(c => c.isValidPending && c.aging?.bucket === agingFilter);
    }, [agingFilter, enrichedCheques]);

    // Calculate totals (excluir anulados, reservados y no emitidos)
    const totalMontoEmitido = useMemo(() => {
        return displayedCheques
            .filter(c => !c.cheque_anulado && !c.es_reservado && !c.fue_noemitido)
            .reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);
    }, [displayedCheques]);

    const totalMontoAnulado = useMemo(() => {
        return displayedCheques
            .filter(c => Boolean(c.cheque_anulado))
            .reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);
    }, [displayedCheques]);

    const formatMonto = (val) => {
        const num = parseFloat(val);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const getAgingTextForExport = (c) => {
        if (c.isValidPending && c.aging) {
            if (c.aging.caduco) return `>180d CADUCO (${c.aging.dias}d)`;
            if (c.aging.por_caducar) return `91-180d POR CADUCAR (${c.aging.dias}d)`;
            return `${c.aging.bucket}d (${c.aging.dias}d)`;
        }
        if (c.fecha_aplicado && !c.cheque_anulado && !c.fue_noemitido && !c.es_reservado) {
            return `Cobrado (${c.fecha_aplicado})`;
        }
        return '-';
    };

    // Export to Excel (with Días Circulación, Antigüedad, and Resumen sheet)
    const handleExportExcel = () => {
        if (!displayedCheques || displayedCheques.length === 0) {
            addToast('No hay datos para exportar a Excel', 'warning');
            return;
        }

        const excelData = displayedCheques.map(c => ({
            'No. Cheque': c.cheque || c.llave,
            'Fecha': c.fecha,
            'A Nombre de': c.a_nombre,
            'Monto ($)': Number(c.valor || 0),
            'Concepto': c.concepto || '',
            'Estado': c.cheque_anulado ? 'ANULADO' : (c.fue_noemitido ? 'NO EMITIDO' : (c.es_reservado ? 'RESERVADO' : 'EMITIDO')),
            'Fecha Aplicado': c.fecha_aplicado || '',
            'Días Circulación': c.isValidPending && c.aging ? c.aging.dias : '',
            'Antigüedad': getAgingTextForExport(c),
            'No. Partida': c.num_partida || '',
            'Contabilizado': c.es_contabilizado === 'S' ? 'SÍ' : 'NO'
        }));

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(excelData));
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Cheques');

        if (agingStats.totalPendientes > 0) {
            const summaryRows = [
                { Rango: '0-30 días', Cantidad: agingStats.buckets['0-30'].count, 'Monto ($)': agingStats.buckets['0-30'].monto },
                { Rango: '31-90 días', Cantidad: agingStats.buckets['31-90'].count, 'Monto ($)': agingStats.buckets['31-90'].monto },
                { Rango: '91-180 días', Cantidad: agingStats.buckets['91-180'].count, 'Monto ($)': agingStats.buckets['91-180'].monto },
                { Rango: 'Por Caducar (150-180d)', Cantidad: agingStats.porCaducarCount, 'Monto ($)': agingStats.porCaducarMonto },
                { Rango: 'Caducos (>180d)', Cantidad: agingStats.caducoCount, 'Monto ($)': agingStats.caducoMonto },
                { Rango: 'TOTAL PENDIENTES', Cantidad: agingStats.totalPendientes, 'Monto ($)': agingStats.montoPendientes }
            ];
            const wsAging = XLSX.utils.json_to_sheet(sanitizeSpreadsheetRows(summaryRows));
            XLSX.utils.book_append_sheet(workbook, wsAging, 'Antiguedad_Resumen');
        }

        const cuentaName = currentCuenta?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cuenta';
        XLSX.writeFile(workbook, `Reporte_Cheques_${cuentaName}_${desde}_${hasta}.xlsx`);
        addToast('Archivo Excel descargado con éxito', 'success');
    };

    // Generate PDF Preview with Letter Landscape Format (R3.3 Aging column + summary)
    const handlePreviewPdf = () => {
        if (!displayedCheques || displayedCheques.length === 0) {
            addToast('No hay cheques para imprimir en este reporte', 'warning');
            return;
        }

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
        doc.text('REPORTE DE CHEQUES POR FECHA Y ANTIGÜEDAD', pageWidth / 2, 13, { align: 'center' });

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const cuentaDesc = currentCuenta ? formatCuentaLabel(currentCuenta) : '';
        doc.text(`Cuenta Bancaria: ${cuentaDesc}`, 14, 20);
        doc.text(`Período: ${desde} al ${hasta}`, 14, 25);
        doc.text(`Generado: ${new Date().toLocaleDateString('es-SV')} ${new Date().toLocaleTimeString('es-SV')}`, pageWidth - 14, 20, { align: 'right' });
        doc.text(`Cheques: ${displayedCheques.length}   |   En circulación: ${agingStats.totalPendientes} (${moneyFmt(agingStats.montoPendientes)})`, pageWidth - 14, 25, { align: 'right' });

        const tableHeaders = [['# Cheque', 'Fecha', 'Beneficiario', 'Concepto', 'Estado', 'Antigüedad', 'Monto ($)']];
        const tableRows = displayedCheques.map(c => [
            c.cheque || c.llave,
            c.fecha || '',
            c.a_nombre || '',
            c.concepto || '',
            c.cheque_anulado ? 'ANULADO' : (c.fue_noemitido ? 'NO EMITIDO' : (c.es_reservado ? 'RESERVADO' : 'EMITIDO')),
            getAgingTextForExport(c),
            `$${formatMonto(c.valor)}`
        ]);

        const agingSummaryLine = `Pendientes: ${agingStats.totalPendientes} (${moneyFmt(agingStats.montoPendientes)}) | 0-30d: ${agingStats.buckets['0-30'].count} | 31-90d: ${agingStats.buckets['31-90'].count} | 91-180d: ${agingStats.buckets['91-180'].count} | Por Caducar: ${agingStats.porCaducarCount} | >180d Caducos: ${agingStats.caducoCount}`;

        autoTable(doc, {
            head: tableHeaders,
            body: tableRows,
            startY: 30,
            theme: 'striped',
            styles: {
                fontSize: 7.4,
                cellPadding: 1.8,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [37, 99, 235],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7.6
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            columnStyles: {
                0: { cellWidth: 20, fontStyle: 'bold' },
                1: { cellWidth: 20 },
                2: { cellWidth: 52 },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 22, halign: 'center' },
                5: { cellWidth: 34, halign: 'center' },
                6: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
            },
            foot: [
                [
                    { content: `TOTAL EMITIDO (${displayedCheques.filter(c => !c.cheque_anulado && !c.es_reservado && !c.fue_noemitido).length} cheques):`, colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: `$${formatMonto(totalMontoEmitido)}`, styles: { halign: 'right', fontStyle: 'bold' } }
                ],
                [
                    { content: agingSummaryLine, colSpan: 7, styles: { halign: 'left', fontSize: 7.2, textColor: [71, 85, 105] } }
                ]
            ],
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontSize: 8
            },
            margin: { top: 28, bottom: 18, left: 14, right: 14 },
            didDrawPage: (data) => {
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
                doc.text('SIPE Admin - Reporte Oficial de Cheques y Antigüedad', 14, pageHeight - 8);
            }
        });

        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewTitle('Reporte de Cheques por Rango de Fecha');
        setPreviewSubtitle(`${currentCuenta ? formatCuentaLabel(currentCuenta) : ''} | ${desde} al ${hasta}`);
        setPreviewBadge(currentCuenta?.banco_nombre || 'BANCO');
        const cuentaFileName = currentCuenta?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cuenta';
        setPreviewFileName(`Reporte_Cheques_${cuentaFileName}_${desde}_${hasta}.pdf`);
        setShowPreviewModal(true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <DollarSign size={22} color="var(--primary)" />
                        Cheques por Rango de Fecha
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Consulta detallada de cheques, antigüedad en circulación (Aging), exportación a Excel y vista previa en PDF tamaño Carta.
                    </p>
                </div>
            </div>

            {/* Parámetros de Filtro */}
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
                    {/* Selector de Cuenta Bancaria (responsive width safe at 320px) */}
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

                    {/* Fecha Desde */}
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

                    {/* Fecha Hasta */}
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

                    {/* Botón Buscar */}
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
                        {searching ? 'Buscando...' : 'Buscar Cheques'}
                    </button>

                    {/* Checkboxes de filtro (flexWrap para móvil) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', minHeight: '36px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.8rem', userSelect: 'none' }}>
                            <input
                                type="checkbox"
                                checked={excluirAnulados}
                                onChange={(e) => setExcluirAnulados(e.target.checked)}
                                style={{ width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                            />
                            <span>Ocultar Anulados</span>
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.8rem', userSelect: 'none' }}>
                            <input
                                type="checkbox"
                                checked={excluirReservados}
                                onChange={(e) => setExcluirReservados(e.target.checked)}
                                style={{ width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                            />
                            <span>Ocultar Reservados</span>
                        </label>
                    </div>
                </form>
            </div>

            {/* Panel de Resultados */}
            {searched && (
                <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Barra de métricas y botones de exportación */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Registros: <strong style={{ color: 'var(--text)' }}>{displayedCheques.length}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Total Emitidos: <strong style={{ color: '#10b981' }}>${formatMonto(totalMontoEmitido)}</strong>
                            </span>
                            {totalMontoAnulado > 0 && (
                                <>
                                    <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Anulados: <strong style={{ color: '#ef4444' }}>${formatMonto(totalMontoAnulado)}</strong>
                                    </span>
                                </>
                            )}
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                En Circulación: <strong style={{ color: '#f59e0b' }}>{agingStats.totalPendientes} ({moneyFmt(agingStats.montoPendientes)})</strong>
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={displayedCheques.length === 0}
                                className="btn-secondary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    height: '34px',
                                    padding: '0 0.85rem',
                                    fontSize: '0.825rem'
                                }}
                                title="Exportar reporte a hoja de cálculo Excel"
                            >
                                <FileSpreadsheet size={15} />
                                Excel
                            </button>
                            <button
                                type="button"
                                onClick={handlePreviewPdf}
                                disabled={displayedCheques.length === 0}
                                className="btn-primary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    height: '34px',
                                    padding: '0 1rem',
                                    fontSize: '0.825rem'
                                }}
                                title="Abrir vista previa del reporte en tamaño Carta"
                            >
                                <Printer size={15} />
                                Vista Previa / Imprimir
                            </button>
                        </div>
                    </div>

                    {/* R3.3 Antigüedad de Cheques en Circulación (Interactive Summary & Filter Pills) */}
                    {cheques.length > 0 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                            padding: '0.55rem 0.75rem',
                            borderRadius: '8px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--border)'
                        }}>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.15rem' }}>
                                    Antigüedad:
                                </span>
                                {[
                                    { key: 'TODOS', label: `Todos (${enrichedCheques.length})` },
                                    { key: 'PENDIENTES', label: `Pendientes (${agingStats.totalPendientes})` },
                                    { key: '0-30', label: `0-30d (${agingStats.buckets['0-30'].count})` },
                                    { key: '31-90', label: `31-90d (${agingStats.buckets['31-90'].count})` },
                                    { key: '91-180', label: `91-180d (${agingStats.buckets['91-180'].count})` },
                                    { key: 'POR_CADUCAR', label: `Por caducar 150-180d (${agingStats.porCaducarCount})` },
                                    { key: '>180', label: `>180d Caducos (${agingStats.caducoCount})` }
                                ].map(pill => {
                                    const active = agingFilter === pill.key;
                                    return (
                                        <button
                                            key={pill.key}
                                            type="button"
                                            onClick={() => setAgingFilter(pill.key)}
                                            style={{
                                                height: '26px',
                                                padding: '0 0.6rem',
                                                fontSize: '0.73rem',
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

                            {(agingStats.porCaducarCount > 0 || agingStats.caducoCount > 0) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                                    <ShieldAlert size={14} color="#f59e0b" />
                                    {agingStats.porCaducarCount > 0 && (
                                        <span style={{ color: '#fb923c', fontWeight: 600 }}>
                                            Por caducar: {agingStats.porCaducarCount} ({moneyFmt(agingStats.porCaducarMonto)})
                                        </span>
                                    )}
                                    {agingStats.caducoCount > 0 && (
                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                            Caducos: {agingStats.caducoCount} ({moneyFmt(agingStats.caducoMonto)})
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tabla de Cheques */}
                    {displayedCheques.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                            <FileText size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                            <p style={{ margin: 0, fontSize: '0.825rem' }}>No se encontraron cheques para el filtro seleccionado.</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table style={{ width: '100%', minWidth: '1040px', borderCollapse: 'collapse', fontSize: '0.8rem', marginTop: 0 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        <th style={{ padding: '0.45rem 0.5rem' }}># Cheque</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Beneficiario</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Monto ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Concepto</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Antigüedad</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Fecha Aplicado</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Partida</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedCheques.map(c => {
                                        const isAnulado = Boolean(c.cheque_anulado);
                                        const isReservado = Boolean(c.es_reservado || c.fue_noemitido);

                                        let badgeColor = '#10b981';
                                        let badgeBg = 'rgba(16, 185, 129, 0.1)';
                                        let badgeText = 'EMITIDO';

                                        if (isAnulado) {
                                            badgeColor = '#ef4444';
                                            badgeBg = 'rgba(239, 68, 68, 0.1)';
                                            badgeText = 'ANULADO';
                                        } else if (c.fue_noemitido) {
                                            badgeColor = '#6b7280';
                                            badgeBg = 'rgba(107, 114, 128, 0.15)';
                                            badgeText = 'NO EMITIDO';
                                        } else if (isReservado) {
                                            badgeColor = '#f59e0b';
                                            badgeBg = 'rgba(245, 158, 11, 0.1)';
                                            badgeText = 'RESERVADO';
                                        }

                                        return (
                                            <tr
                                                key={c.id}
                                                style={{
                                                    borderBottom: '1px solid var(--border)',
                                                    opacity: isAnulado ? 0.6 : 1
                                                }}
                                            >
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                                    {c.cheque || c.llave}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{c.fecha}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{c.a_nombre}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: isAnulado ? 'var(--text-muted)' : 'var(--primary)', whiteSpace: 'nowrap' }}>
                                                    ${formatMonto(c.valor)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.concepto}>
                                                    {c.concepto || '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontSize: '0.72rem',
                                                        padding: '0.15rem 0.45rem',
                                                        borderRadius: '4px',
                                                        fontWeight: 600,
                                                        color: badgeColor,
                                                        background: badgeBg
                                                    }}>
                                                        {badgeText}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    {c.isValidPending && c.aging ? (
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                padding: '0.15rem 0.45rem',
                                                                borderRadius: '4px',
                                                                fontWeight: 600,
                                                                background: c.aging.caduco
                                                                    ? 'rgba(239, 68, 68, 0.14)'
                                                                    : (c.aging.por_caducar
                                                                        ? 'rgba(249, 115, 22, 0.15)'
                                                                        : (c.aging.bucket === '91-180'
                                                                            ? 'rgba(245, 158, 11, 0.14)'
                                                                            : (c.aging.bucket === '31-90'
                                                                                ? 'rgba(59, 130, 246, 0.14)'
                                                                                : 'rgba(16, 185, 129, 0.14)'))),
                                                                color: c.aging.caduco
                                                                    ? '#ef4444'
                                                                    : (c.aging.por_caducar
                                                                        ? '#fb923c'
                                                                        : (c.aging.bucket === '91-180'
                                                                            ? '#f59e0b'
                                                                            : (c.aging.bucket === '31-90'
                                                                                ? '#60a5fa'
                                                                                : '#10b981')))
                                                            }}>
                                                                {c.aging.dias !== null ? `${c.aging.dias}d · ${c.aging.bucket}` : c.aging.label}
                                                            </span>
                                                            {c.aging.caduco && (
                                                                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.35rem', borderRadius: '4px', fontWeight: 700, background: 'rgba(239,68,68,0.18)', color: '#ef4444' }}>
                                                                    CADUCO
                                                                </span>
                                                            )}
                                                            {c.aging.por_caducar && !c.aging.caduco && (
                                                                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.35rem', borderRadius: '4px', fontWeight: 700, background: 'rgba(249,115,22,0.18)', color: '#fb923c' }}>
                                                                    POR CADUCAR
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : c.fecha_aplicado && !isAnulado && !isReservado ? (
                                                        <span style={{ fontSize: '0.73rem', color: '#10b981', fontWeight: 600 }}>
                                                            Cobrado ({c.fecha_aplicado})
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    {c.fecha_aplicado || '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.75rem' }}>
                                                    {c.num_partida || '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

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
                footerInfo="Reporte Oficial de Cheques y Antigüedad - Formato Carta SIPE Admin"
            />
        </div>
    );
}
