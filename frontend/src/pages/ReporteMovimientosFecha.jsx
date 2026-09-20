import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Search, FileSpreadsheet, Printer, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import { useToast } from '../components/Toast';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { todayStr } from '../utils/date';

export default function ReporteMovimientosFecha() {
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
    const [tipo, setTipo] = useState('TODOS'); // 'TODOS' | 'CARGOS' | 'ABONOS'

    // Results state
    const [movimientos, setMovimientos] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);

    // ReportPreviewModal state
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('Reporte de Movimientos');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewBadge, setPreviewBadge] = useState('');
    const [previewFileName, setPreviewFileName] = useState('movimientos.pdf');

    // Load bank accounts catalog
    useEffect(() => {
        const loadCuentas = async () => {
            setLoadingCatalogos(true);
            try {
                const res = await api.get('/bancos/movimientos/catalogos');
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
                tipo
            };

            const res = await api.get('/bancos/movimientos/reporte-fecha', { params });
            setMovimientos(res.data || []);
            setSearched(true);
        } catch (err) {
            addToast('Error al consultar reporte de movimientos', 'error');
        } finally {
            setSearching(false);
        }
    };

    // Calculate totals
    const totalCargos = useMemo(() => {
        return movimientos.reduce((sum, m) => sum + (parseFloat(m.cargo) || 0), 0);
    }, [movimientos]);

    const totalAbonos = useMemo(() => {
        return movimientos.reduce((sum, m) => sum + (parseFloat(m.abono) || 0), 0);
    }, [movimientos]);

    const flujoNeto = useMemo(() => {
        return totalAbonos - totalCargos;
    }, [totalAbonos, totalCargos]);

    const formatMonto = (val) => {
        const num = parseFloat(val);
        if (isNaN(num)) return '0.00';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Export to Excel
    const handleExportExcel = () => {
        if (!movimientos || movimientos.length === 0) {
            addToast('No hay datos para exportar a Excel', 'warning');
            return;
        }

        const excelData = movimientos.map(m => ({
            'Fecha': m.fecha,
            'Documento': m.documento || '',
            'Concepto': m.concepto || '',
            'Tipo de Movimiento': m.remesa_descripcion || m.cod_remesa || '',
            'Cargo ($)': Number(m.cargo || 0),
            'Abono ($)': Number(m.abono || 0),
            'Fecha Aplicado': m.fecha_aplicado || '',
            'No. Partida': m.num_partida || '',
            'Contabilizado': m.es_contabilizado === 'S' ? 'SÍ' : 'NO'
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Movimientos");
        const cuentaName = currentCuenta?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cuenta';
        XLSX.writeFile(workbook, `Reporte_Movimientos_${cuentaName}_${desde}_${hasta}.xlsx`);
        addToast('Archivo Excel descargado con éxito', 'success');
    };

    // Generate PDF Preview with Letter Format
    const handlePreviewPdf = () => {
        if (!movimientos || movimientos.length === 0) {
            addToast('No hay movimientos para imprimir en este reporte', 'warning');
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
        doc.text('ESTADO DE MOVIMIENTOS BANCARIOS', pageWidth / 2, 14, { align: 'center' });

        // Subtitle Details
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const cuentaDesc = currentCuenta ? formatCuentaLabel(currentCuenta) : '';
        doc.text(`Cuenta Bancaria: ${cuentaDesc}`, 14, 21);
        doc.text(`Período: ${desde} al ${hasta}`, 14, 26);
        doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`, pageWidth - 14, 21, { align: 'right' });
        doc.text(`Total Registros: ${movimientos.length}`, pageWidth - 14, 26, { align: 'right' });

        // Table
        const tableHeaders = [['Fecha', 'Documento', 'Concepto', 'Tipo de Movimiento', 'Cargo / Débito ($)', 'Abono / Crédito ($)']];
        const tableRows = movimientos.map(m => [
            m.fecha || '',
            m.documento || '',
            m.concepto || '',
            m.remesa_descripcion || m.cod_remesa || '-',
            parseFloat(m.cargo) > 0 ? `$${formatMonto(m.cargo)}` : '-',
            parseFloat(m.abono) > 0 ? `$${formatMonto(m.abono)}` : '-'
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
                0: { cellWidth: 20 },
                1: { cellWidth: 26, fontStyle: 'bold' },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 24, halign: 'center' },
                4: { cellWidth: 28, halign: 'right' },
                5: { cellWidth: 28, halign: 'right' }
            },
            foot: [
                [
                    { content: `TOTALES DEL PERÍODO (${movimientos.length} movs):`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: `$${formatMonto(totalCargos)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38] } },
                    { content: `$${formatMonto(totalAbonos)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] } }
                ],
                [
                    { content: `FLUJO NETO DEL PERÍODO:`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
                    {
                        content: `$${formatMonto(flujoNeto)}`,
                        colSpan: 2,
                        styles: {
                            halign: 'right',
                            fontStyle: 'bold',
                            textColor: flujoNeto >= 0 ? [16, 185, 129] : [220, 38, 38]
                        }
                    }
                ]
            ],
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
                doc.text('SIPE Admin - Reporte Oficial de Movimientos Bancarios', 14, pageHeight - 8);
            }
        });

        const blob = doc.output('blob');
        const totalPages = doc.internal.getNumberOfPages();
        setPreviewPdfBlob(blob);
        setPreviewTotalPages(totalPages);
        setPreviewTitle('Reporte de Movimientos Bancarios por Fecha');
        setPreviewSubtitle(`${currentCuenta ? formatCuentaLabel(currentCuenta) : ''} | ${desde} al ${hasta}`);
        setPreviewBadge(currentCuenta?.banco_nombre || 'BANCO');
        const cuentaFileName = currentCuenta?.nombre?.replace(/[^a-zA-Z0-9]/g, '_') || 'Cuenta';
        setPreviewFileName(`Reporte_Movimientos_${cuentaFileName}_${desde}_${hasta}.pdf`);
        setShowPreviewModal(true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <FileText size={22} color="var(--primary)" />
                        Movimientos Bancarios por Rango de Fecha
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Consulta detallada de cargos y abonos en cuenta bancaria para un período determinado. Incluye filtros, métricas de flujo neto, Excel y PDF tamaño Carta.
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

                    {/* Tipo de Movimiento */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '175px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Tipo de Operación
                        </label>
                        <select
                            className="form-control"
                            value={tipo}
                            onChange={(e) => setTipo(e.target.value)}
                            style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
                        >
                            <option value="TODOS">Todos los movimientos</option>
                            <option value="CARGOS">Solo Cargos (Débitos)</option>
                            <option value="ABONOS">Solo Abonos (Créditos)</option>
                        </select>
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
                        {searching ? 'Buscando...' : 'Buscar Movimientos'}
                    </button>
                </form>
            </div>

            {/* Panel de Resultados */}
            {searched && (
                <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Barra de métricas y botones de exportación */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem' }}>
                        {/* Resumen KPIs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Registros: <strong style={{ color: 'var(--text)' }}>{movimientos.length}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Total Cargos: <strong style={{ color: '#ef4444' }}>${formatMonto(totalCargos)}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Total Abonos: <strong style={{ color: '#10b981' }}>${formatMonto(totalAbonos)}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Flujo Neto: <strong style={{ color: flujoNeto >= 0 ? '#10b981' : '#ef4444' }}>
                                    {flujoNeto >= 0 ? '+' : ''}${formatMonto(flujoNeto)}
                                </strong>
                            </span>
                        </div>

                        {/* Botones de acción */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={movimientos.length === 0}
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
                                disabled={movimientos.length === 0}
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

                    {/* Tabla de Movimientos */}
                    {movimientos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                            <FileText size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                            <p style={{ margin: 0, fontSize: '0.825rem' }}>No se encontraron movimientos bancarios en el período seleccionado.</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Documento / Ref.</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Concepto</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Tipo de Movimiento</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Cargo / Débito ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Abono / Crédito ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Fecha Aplicado</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Partida</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movimientos.map(m => {
                                        const cargoNum = parseFloat(m.cargo) || 0;
                                        const abonoNum = parseFloat(m.abono) || 0;

                                        return (
                                            <tr
                                                key={m.id}
                                                style={{
                                                    borderBottom: '1px solid var(--border)'
                                                }}
                                            >
                                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{m.fecha}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                                    {m.documento || '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.concepto}>
                                                    {m.concepto || '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    {m.remesa_descripcion ? (
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            padding: '0.15rem 0.45rem',
                                                            borderRadius: '4px',
                                                            fontWeight: 600,
                                                            background: 'rgba(37, 99, 235, 0.08)',
                                                            color: 'var(--text)',
                                                            border: '1px solid rgba(37, 99, 235, 0.2)'
                                                        }}>
                                                            {m.remesa_descripcion}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                            {m.cod_remesa || '-'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: cargoNum > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                                                    {cargoNum > 0 ? `$${formatMonto(cargoNum)}` : '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: abonoNum > 0 ? '#10b981' : 'var(--text-muted)' }}>
                                                    {abonoNum > 0 ? `$${formatMonto(abonoNum)}` : '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    {m.fecha_aplicado || '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.75rem' }}>
                                                    {m.num_partida || '-'}
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
                footerInfo="Estado Oficial de Movimientos Bancarios - Formato Carta SIPE Admin"
            />
        </div>
    );
}
