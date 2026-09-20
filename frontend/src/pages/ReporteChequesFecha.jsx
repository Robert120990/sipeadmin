import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Search, FileSpreadsheet, Printer, Calendar, AlertCircle, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { todayStr } from '../utils/date';

export default function ReporteChequesFecha() {
    const { addToast } = useToast();

    // Catalog state
    const [cuentas, setCuentas] = useState([]);
    const [loadingCatalogos, setLoadingCatalogos] = useState(true);

    // Filters state
    const [selectedCuentaId, setSelectedCuentaId] = useState('');
    const [desde, setDesde] = useState(() => {
        const d = new Date();
        d.setDate(1); // First day of current month
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [hasta, setHasta] = useState(todayStr());
    const [excluirAnulados, setExcluirAnulados] = useState(false);
    const [excluirReservados, setExcluirReservados] = useState(false);

    // Results state
    const [cheques, setCheques] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);

    // ReportPreviewModal state
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('Reporte de Cheques');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewBadge, setPreviewBadge] = useState('');
    const [previewFileName, setPreviewFileName] = useState('cheques.pdf');

    // Load bank accounts catalog
    useEffect(() => {
        const loadCuentas = async () => {
            setLoadingCatalogos(true);
            try {
                const res = await api.get('/cheques/catalogos');
                const list = res.data.cuentas || [];
                setCuentas(list);
                if (list.length > 0 && !selectedCuentaId) {
                    const sorted = sortCuentas(list);
                    setSelectedCuentaId(String(sorted[0].corr));
                }
            } catch (err) {
                addToast('Error al cargar cuentas bancarias', 'error');
            } finally {
                setLoadingCatalogos(false);
            }
        };
        loadCuentas();
    }, []);

    const currentCuenta = useMemo(() => {
        return cuentas.find(c => String(c.corr) === String(selectedCuentaId)) || null;
    }, [cuentas, selectedCuentaId]);

    // Handle search
    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!selectedCuentaId) {
            addToast('Seleccione una cuenta bancaria', 'warning');
            return;
        }
        if (!desde || !hasta) {
            addToast('Especifique el rango de fechas', 'warning');
            return;
        }

        setSearching(true);
        try {
            const params = {
                cuenta_bancaria_id: selectedCuentaId,
                desde,
                hasta,
                excluir_anulados: excluirAnulados,
                excluir_reservados: excluirReservados
            };

            const res = await api.get('/cheques/reporte-fecha', { params });
            setCheques(res.data || []);
            setSearched(true);
        } catch (err) {
            addToast('Error al consultar reporte de cheques', 'error');
        } finally {
            setSearching(false);
        }
    };

    // Calculate totals
    const totalMontoEmitido = useMemo(() => {
        return cheques
            .filter(c => !c.cheque_anulado)
            .reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);
    }, [cheques]);

    const totalMontoAnulado = useMemo(() => {
        return cheques
            .filter(c => Boolean(c.cheque_anulado))
            .reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);
    }, [cheques]);

    const formatMonto = (val) => {
        const num = parseFloat(val);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Export to Excel
    const handleExportExcel = () => {
        if (!cheques || cheques.length === 0) {
            addToast('No hay datos para exportar a Excel', 'warning');
            return;
        }

        const excelData = cheques.map(c => ({
            'No. Cheque': c.cheque || c.llave,
            'Fecha': c.fecha,
            'A Nombre de': c.a_nombre,
            'Monto ($)': Number(c.valor || 0),
            'Concepto': c.concepto || '',
            'Estado': c.cheque_anulado ? 'ANULADO' : (c.es_reservado || c.fue_noemitido ? 'RESERVADO / NO EMITIDO' : 'EMITIDO'),
            'Fecha Aplicado': c.fecha_aplicado || '',
            'No. Partida': c.num_partida || '',
            'Contabilizado': c.es_contabilizado === 'S' ? 'SÍ' : 'NO'
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Cheques");
        const cuentaName = currentCuenta?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cuenta';
        XLSX.writeFile(workbook, `Reporte_Cheques_${cuentaName}_${desde}_${hasta}.xlsx`);
        addToast('Archivo Excel descargado con éxito', 'success');
    };

    // Generate PDF Preview with Letter Format
    const handlePreviewPdf = () => {
        if (!cheques || cheques.length === 0) {
            addToast('No hay cheques para imprimir en este reporte', 'warning');
            return;
        }

        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter' // Carta: 215.9 x 279.4 mm
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Header Title
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('REPORTE DE CHEQUES POR FECHA', pageWidth / 2, 14, { align: 'center' });

        // Subtitle Details
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const cuentaDesc = currentCuenta ? formatCuentaLabel(currentCuenta) : '';
        doc.text(`Cuenta Bancaria: ${cuentaDesc}`, 14, 21);
        doc.text(`Período: ${desde} al ${hasta}`, 14, 26);
        doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`, pageWidth - 14, 21, { align: 'right' });
        doc.text(`Total Cheques: ${cheques.length}`, pageWidth - 14, 26, { align: 'right' });

        // Table
        const tableHeaders = [['# Cheque', 'Fecha', 'Beneficiario', 'Concepto', 'Estado', 'Monto ($)']];
        const tableRows = cheques.map(c => [
            c.cheque || c.llave,
            c.fecha || '',
            c.a_nombre || '',
            c.concepto || '',
            c.cheque_anulado ? 'ANULADO' : (c.es_reservado ? 'RESERVADO' : 'EMITIDO'),
            `$${formatMonto(c.valor)}`
        ]);

        autoTable(doc, {
            head: tableHeaders,
            body: tableRows,
            startY: 31,
            theme: 'striped',
            styles: {
                fontSize: 7.5,
                cellPadding: 2,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [37, 99, 235],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7.8
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            columnStyles: {
                0: { cellWidth: 20, fontStyle: 'bold' },
                1: { cellWidth: 19 },
                2: { cellWidth: 50 },
                3: { cellWidth: 'auto' },
                4: { cellWidth: 22, halign: 'center' },
                5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' }
            },
            foot: [[
                { content: `TOTAL EMITIDO (${cheques.filter(c => !c.cheque_anulado).length} cheques):`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: `$${formatMonto(totalMontoEmitido)}`, styles: { halign: 'right', fontStyle: 'bold' } }
            ]],
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: [15, 23, 42],
                fontSize: 8
            },
            margin: { top: 31, bottom: 18, left: 14, right: 14 },
            didDrawPage: (data) => {
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(148, 163, 184);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
                doc.text('SIPE Admin - Reporte Oficial de Cheques', 14, pageHeight - 8);
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
                        Consulta detallada de cheques de una cuenta bancaria en un período específico. Incluye filtros, exportación a Excel y vista previa en PDF tamaño Carta.
                    </p>
                </div>
            </div>

            {/* Parámetros de Filtro en una sola línea compacta */}
            <div className="card glass" style={{ padding: '0.85rem 1.15rem' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {/* Selector de Cuenta Bancaria */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '310px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Cuenta Bancaria *
                        </label>
                        <select
                            className="form-control"
                            value={selectedCuentaId}
                            onChange={(e) => setSelectedCuentaId(e.target.value)}
                            disabled={loadingCatalogos}
                            required
                            style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '135px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Desde Fecha *
                        </label>
                        <input
                            type="date"
                            className="form-control"
                            value={desde}
                            onChange={(e) => setDesde(e.target.value)}
                            required
                            style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
                        />
                    </div>

                    {/* Fecha Hasta */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '135px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Hasta Fecha *
                        </label>
                        <input
                            type="date"
                            className="form-control"
                            value={hasta}
                            onChange={(e) => setHasta(e.target.value)}
                            required
                            style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
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

                    {/* Separador */}
                    <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.15rem' }} />

                    {/* Checkboxes de filtro */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', height: '36px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.8rem', userSelect: 'none' }}>
                            <input
                                type="checkbox"
                                checked={excluirAnulados}
                                onChange={(e) => setExcluirAnulados(e.target.checked)}
                            />
                            <span>Ocultar Anulados</span>
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.8rem', userSelect: 'none' }}>
                            <input
                                type="checkbox"
                                checked={excluirReservados}
                                onChange={(e) => setExcluirReservados(e.target.checked)}
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
                        {/* Resumen */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Registros: <strong style={{ color: 'var(--text)' }}>{cheques.length}</strong>
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
                        </div>

                        {/* Botones de acción */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={cheques.length === 0}
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
                                disabled={cheques.length === 0}
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

                    {/* Tabla de Cheques */}
                    {cheques.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                            <FileText size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                            <p style={{ margin: 0, fontSize: '0.825rem' }}>No se encontraron cheques en el período seleccionado.</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        <th style={{ padding: '0.45rem 0.5rem' }}># Cheque</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Beneficiario</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Monto ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Concepto</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Fecha Aplicado</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Partida</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cheques.map(c => {
                                        const isAnulado = Boolean(c.cheque_anulado);
                                        const isReservado = Boolean(c.es_reservado || c.fue_noemitido);

                                        let badgeColor = '#10b981';
                                        let badgeBg = 'rgba(16, 185, 129, 0.1)';
                                        let badgeText = 'EMITIDO';

                                        if (isAnulado) {
                                            badgeColor = '#ef4444';
                                            badgeBg = 'rgba(239, 68, 68, 0.1)';
                                            badgeText = 'ANULADO';
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
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: isAnulado ? 'var(--text-muted)' : 'var(--primary)' }}>
                                                    ${formatMonto(c.valor)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.concepto}>
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
                footerInfo="Reporte Oficial de Cheques - Formato Carta SIPE Admin"
            />
        </div>
    );
}
