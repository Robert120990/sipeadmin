import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../components/Toast';
import { Printer, Search, FileText, CheckSquare, Square, AlertCircle } from 'lucide-react';
import DesignerService from '../modules/check-designer/services/DesignerService';
import PrintEngine from '../modules/check-designer/services/PrintEngine';
import CheckPdfService from '../modules/check-designer/services/CheckPdfService';
import ReportPreviewModal from '../components/ReportPreviewModal';
import { formatCuentaLabel, sortCuentas } from '../utils/cuentaUtils';
import { numeroALetras, formatMonto, formatearFechaEnLetras, formatearFechaEnLetrasCorta } from '../utils/numeroALetras';

export default function ImpresionCheques() {
    const [cuentas, setCuentas] = useState([]);
    const [formatos, setFormatos] = useState([]);
    const [selectedCuentaId, setSelectedCuentaId] = useState('');
    const [selectedFormatoId, setSelectedFormatoId] = useState('');
    const [desdeCheque, setDesdeCheque] = useState('');
    const [hastaCheque, setHastaCheque] = useState('');
    const [excluirAnulados, setExcluirAnulados] = useState(true);
    const [excluirReservados, setExcluirReservados] = useState(true);

    const [cheques, setCheques] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [loadingCatalogos, setLoadingCatalogos] = useState(true);
    const [searching, setSearching] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [searched, setSearched] = useState(false);

    // Estados para la Vista Previa reutilizable
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewPdfBlob, setPreviewPdfBlob] = useState(null);
    const [previewTotalPages, setPreviewTotalPages] = useState(1);
    const [previewTitle, setPreviewTitle] = useState('Impresión de Cheques');
    const [previewSubtitle, setPreviewSubtitle] = useState('');
    const [previewBadge, setPreviewBadge] = useState('');
    const [previewFileName, setPreviewFileName] = useState('cheques.pdf');
    const [previewListaDatos, setPreviewListaDatos] = useState([]);

    const { addToast } = useToast();
    const navigate = useNavigate();

    // Cargar catálogos y formatos al montar
    useEffect(() => {
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadInitialData = async () => {
        setLoadingCatalogos(true);
        try {
            const [catRes, formRes] = await Promise.all([
                api.get('/cheques/catalogos'),
                DesignerService.getFormats()
            ]);

            setCuentas(catRes.data?.cuentas || []);
            setFormatos(Array.isArray(formRes) ? formRes : []);
        } catch (error) {
            addToast('Error al cargar cuentas y formatos', 'error');
        } finally {
            setLoadingCatalogos(false);
        }
    };

    // Auto-seleccionar formato al cambiar de cuenta
    const handleCuentaChange = (e) => {
        const ctaId = e.target.value;
        setSelectedCuentaId(ctaId);
        setCheques([]);
        setSelectedIds([]);
        setSearched(false);

        if (!ctaId) {
            setSelectedFormatoId('');
            return;
        }

        const cuenta = cuentas.find(c => String(c.corr) === String(ctaId));
        if (cuenta) {
            // Buscar formato por banco_id o nombre de banco
            const formatoMatch = formatos.find(f => 
                (cuenta.banco_id && Number(f.banco_id) === Number(cuenta.banco_id)) ||
                (cuenta.banco_nombre && f.banco_nombre?.toLowerCase() === cuenta.banco_nombre?.toLowerCase())
            );

            if (formatoMatch) {
                setSelectedFormatoId(String(formatoMatch.id));
            } else if (formatos.length > 0) {
                // Si no hay formato específico de ese banco, dejar vacío o el primero activo
                const active = formatos.find(f => f.is_active);
                if (active) setSelectedFormatoId(String(active.id));
            }
        }
    };

    // Cuenta y Formato seleccionados actualmente
    const currentCuenta = useMemo(() => {
        return cuentas.find(c => String(c.corr) === String(selectedCuentaId));
    }, [cuentas, selectedCuentaId]);

    const currentFormato = useMemo(() => {
        return formatos.find(f => String(f.id) === String(selectedFormatoId));
    }, [formatos, selectedFormatoId]);

    // Buscar cheques por rango
    const handleSearch = async (e) => {
        if (e) e.preventDefault();

        if (!selectedCuentaId) {
            addToast('Por favor seleccione una cuenta bancaria', 'warning');
            return;
        }
        if (!desdeCheque || !hastaCheque) {
            addToast('Por favor ingrese el rango numérico (desde y hasta)', 'warning');
            return;
        }

        const desdeNum = parseInt(desdeCheque, 10);
        const hastaNum = parseInt(hastaCheque, 10);

        if (isNaN(desdeNum) || isNaN(hastaNum)) {
            addToast('Los números de cheque deben ser valores numéricos válidos', 'warning');
            return;
        }
        if (desdeNum > hastaNum) {
            addToast('El número inicial no puede ser mayor que el final', 'warning');
            return;
        }

        setSearching(true);
        setSearched(true);
        try {
            const { data } = await api.get('/cheques/rango', {
                params: {
                    cuenta_bancaria_id: selectedCuentaId,
                    desde_cheque: desdeNum,
                    hasta_cheque: hastaNum
                }
            });

            const rows = Array.isArray(data) ? data : [];
            setCheques(rows);

            // Seleccionar por defecto los cheques válidos (no anulados / no reservados según filtros)
            const autoSelected = rows
                .filter(c => {
                    if (excluirAnulados && c.cheque_anulado) return false;
                    if (excluirReservados && (c.es_reservado || c.fue_noemitido)) return false;
                    return true;
                })
                .map(c => c.id);

            setSelectedIds(autoSelected);

            if (rows.length === 0) {
                addToast('No se encontraron cheques en el rango indicado', 'info');
            }
        } catch (error) {
            addToast(error.response?.data?.message || 'Error al buscar cheques', 'error');
        } finally {
            setSearching(false);
        }
    };

    // Cheques filtrados para visualización
    const visibleCheques = useMemo(() => {
        return cheques.filter(c => {
            if (excluirAnulados && c.cheque_anulado) return false;
            if (excluirReservados && (c.es_reservado || c.fue_noemitido)) return false;
            return true;
        });
    }, [cheques, excluirAnulados, excluirReservados]);

    // Totales de la selección
    const selectedCheques = useMemo(() => {
        return cheques.filter(c => selectedIds.includes(c.id));
    }, [cheques, selectedIds]);

    const totalMontoSeleccionado = useMemo(() => {
        return selectedCheques.reduce((sum, c) => sum + (parseFloat(c.valor) || 0), 0);
    }, [selectedCheques]);

    // Manejo de checkboxes
    const toggleSelectAll = () => {
        const visibleIds = visibleCheques.map(c => c.id);
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
        if (allSelected) {
            setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)));
        } else {
            setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])));
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // Formatear datos de cheque para el motor de impresión
    const formatChequeData = (cheque) => {
        const user = JSON.parse(localStorage.getItem('user')) || {};
        const partesFecha = (cheque.fecha || '').split('/');
        return {
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
            empresa: cheque.empresa_nombre || currentCuenta?.empresa_nombre || '',
            cuenta_bancaria: cheque.cuenta_nombre ? `${cheque.cuenta_nombre} - ${cheque.numero_cuenta}` : (currentCuenta?.numero || ''),
            usuario_impresion: user.nombre || user.username || '',
            sucursal: '',
            observaciones: '',
        };
    };

    // Imprimir cheques seleccionados (abre vista previa con PDF a página completa Carta)
    const handlePrintSelected = async () => {
        if (!currentFormato) {
            addToast('Debe seleccionar un formato de impresión válido', 'warning');
            return;
        }
        if (selectedCheques.length === 0) {
            addToast('Seleccione al menos un cheque para imprimir', 'warning');
            return;
        }

        setPrinting(true);
        try {
            const campos = currentFormato.design_json?.campos || [];
            const listaDatos = selectedCheques.map(formatChequeData);

            const doc = await CheckPdfService.generatePdf(
                currentFormato,
                campos,
                listaDatos,
                currentFormato.printer_name || null
            );

            const blob = doc.output('blob');
            setPreviewPdfBlob(blob);
            setPreviewTotalPages(listaDatos.length);
            setPreviewTitle('Impresión de Cheques');
            setPreviewBadge(currentFormato.name || 'FORMATO');
            setPreviewSubtitle(`Cuenta: ${currentCuenta?.nombre || ''} (${currentCuenta?.numero || ''}) | ${listaDatos.length} cheque(s)`);
            setPreviewFileName(`Cheques_${currentCuenta?.nombre || 'Banco'}_${desdeCheque}-${hastaCheque}.pdf`);
            setPreviewListaDatos(listaDatos);
            setShowPreviewModal(true);
        } catch (error) {
            addToast('Error al preparar la vista previa de cheques', 'error');
        } finally {
            setPrinting(false);
        }
    };

    // Imprimir un solo cheque (abre vista previa con PDF a página completa Carta)
    const handlePrintSingle = async (cheque) => {
        if (!currentFormato) {
            addToast('Debe seleccionar un formato de impresión válido', 'warning');
            return;
        }

        setPrinting(true);
        try {
            const campos = currentFormato.design_json?.campos || [];
            const datos = formatChequeData(cheque);
            const listaDatos = [datos];

            const doc = await CheckPdfService.generatePdf(
                currentFormato,
                campos,
                listaDatos,
                currentFormato.printer_name || null
            );

            const blob = doc.output('blob');
            setPreviewPdfBlob(blob);
            setPreviewTotalPages(1);
            setPreviewTitle(`Cheque #${cheque.cheque || cheque.llave}`);
            setPreviewBadge(currentFormato.name || 'FORMATO');
            setPreviewSubtitle(`${cheque.a_nombre} | $${formatMonto(cheque.valor)} | Cuenta: ${currentCuenta?.nombre || ''}`);
            setPreviewFileName(`Cheque_${cheque.cheque || cheque.llave}.pdf`);
            setPreviewListaDatos(listaDatos);
            setShowPreviewModal(true);
        } catch (error) {
            addToast('Error al preparar vista previa del cheque', 'error');
        } finally {
            setPrinting(false);
        }
    };

    const isAllSelected = visibleCheques.length > 0 && visibleCheques.every(c => selectedIds.includes(c.id));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', margin: 0 }}>
                        <Printer size={22} color="var(--primary)" />
                        Impresión de Cheques
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0 0' }}>
                        Consulta e impresión en lote de cheques por cuenta bancaria y rango numérico. Cada cheque se imprime en su propia página según el formato configurado.
                    </p>
                </div>
            </div>

            {/* Parámetros de Consulta */}
            <div className="card glass" style={{ padding: '1rem 1.25rem' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {/* Fila 1: Cuenta Bancaria y Formato */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                        {/* Cuenta Bancaria */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                                Cuenta Bancaria *
                            </label>
                            <select
                                className="form-control"
                                value={selectedCuentaId}
                                onChange={handleCuentaChange}
                                disabled={loadingCatalogos}
                                required
                                style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
                            >
                                <option value="">-- Seleccione una cuenta bancaria --</option>
                                {sortCuentas(cuentas).map(c => (
                                    <option key={c.corr} value={c.corr}>
                                        {formatCuentaLabel(c)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Formato de Cheque */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                                Formato Guardado *
                            </label>
                            <select
                                className="form-control"
                                value={selectedFormatoId}
                                onChange={(e) => setSelectedFormatoId(e.target.value)}
                                disabled={loadingCatalogos || formatos.length === 0}
                                required
                                style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
                            >
                                <option value="">-- Seleccionar formato --</option>
                                {formatos.map(f => (
                                    <option key={f.id} value={f.id}>
                                        {f.name} {f.banco_nombre ? `(${f.banco_nombre})` : ''} - {Math.round(f.width)}x{Math.round(f.height)}mm
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Fila 2: Rango, Botón Buscar, Checkboxes y Formato Info */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.25rem' }}>
                        {/* Rango Desde */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '120px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                                Desde # *
                            </label>
                            <input
                                type="number"
                                className="form-control"
                                placeholder="Ej. 1001"
                                value={desdeCheque}
                                onChange={(e) => setDesdeCheque(e.target.value)}
                                required
                                min="1"
                                style={{ height: '36px', fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
                            />
                        </div>

                        {/* Rango Hasta */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '120px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                                Hasta # *
                            </label>
                            <input
                                type="number"
                                className="form-control"
                                placeholder="Ej. 1050"
                                value={hastaCheque}
                                onChange={(e) => setHastaCheque(e.target.value)}
                                required
                                min="1"
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

                        {/* Separador vertical */}
                        <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 0.25rem' }} />

                        {/* Filtros secundarios */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', height: '36px' }}>
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
                                <span>Ocultar Reservados / No Emitidos</span>
                            </label>
                        </div>

                        {/* Formato Activo Info */}
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', height: '36px' }}>
                            {currentFormato ? (
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    background: 'rgba(37, 99, 235, 0.08)',
                                    padding: '0.3rem 0.65rem',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(37, 99, 235, 0.2)'
                                }}>
                                    <FileText size={13} color="var(--primary)" />
                                    <span>Formato: <strong style={{ color: 'var(--text)' }}>{currentFormato.name}</strong> ({currentFormato.width} x {currentFormato.height} mm)</span>
                                </div>
                            ) : selectedCuentaId && (
                                <div style={{ fontSize: '0.75rem', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <AlertCircle size={13} />
                                    <span>Sin formato vinculado.</span>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/dashboard/bancos/check-designer')}
                                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: '0.75rem' }}
                                    >
                                        Crear en Diseñador
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {/* Panel de Resultados y Acciones */}
            {searched && (
                <div className="card glass" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Barra de estado y botón de impresión */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Cheques encontrados: <strong style={{ color: 'var(--text)' }}>{visibleCheques.length}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Seleccionados: <strong style={{ color: 'var(--primary)' }}>{selectedCheques.length}</strong>
                            </span>
                            <span style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Total a imprimir: <strong style={{ color: '#10b981' }}>${formatMonto(totalMontoSeleccionado)}</strong>
                            </span>
                        </div>

                        <div>
                            <button
                                type="button"
                                onClick={handlePrintSelected}
                                disabled={selectedCheques.length === 0 || !currentFormato || printing}
                                className="btn-primary"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    height: '34px',
                                    padding: '0 1rem',
                                    fontSize: '0.825rem'
                                }}
                                title={!currentFormato ? 'Seleccione un formato para imprimir' : ''}
                            >
                                <Printer size={15} />
                                {printing ? 'Preparando...' : `Imprimir Cheques (${selectedCheques.length})`}
                            </button>
                        </div>
                    </div>

                    {/* Tabla de Cheques */}
                    {visibleCheques.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            <FileText size={32} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                            <p style={{ margin: 0, fontSize: '0.825rem' }}>No hay cheques para mostrar con los filtros seleccionados.</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        <th style={{ width: '36px', padding: '0.45rem 0.4rem', textAlign: 'center' }}>
                                            <div onClick={toggleSelectAll} style={{ cursor: 'pointer', display: 'inline-flex' }} title="Marcar/Desmarcar todos">
                                                {isAllSelected ? (
                                                    <CheckSquare size={16} color="var(--primary)" />
                                                ) : (
                                                    <Square size={16} color="var(--text-muted)" />
                                                )}
                                            </div>
                                        </th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}># Cheque</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Fecha</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Beneficiario</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>Monto ($)</th>
                                        <th style={{ padding: '0.45rem 0.5rem' }}>Concepto</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>Estado</th>
                                        <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center', width: '60px' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleCheques.map(c => {
                                        const isSelected = selectedIds.includes(c.id);
                                        const isAnulado = Boolean(c.cheque_anulado);
                                        const isReservado = Boolean(c.es_reservado || c.fue_noemitido);

                                        return (
                                            <tr
                                                key={c.id}
                                                style={{
                                                    borderBottom: '1px solid var(--border)',
                                                    backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
                                                    opacity: isAnulado ? 0.6 : 1
                                                }}
                                            >
                                                <td style={{ padding: '0.45rem 0.4rem', textAlign: 'center' }}>
                                                    <div onClick={() => toggleSelect(c.id)} style={{ cursor: 'pointer', display: 'inline-flex' }}>
                                                        {isSelected ? (
                                                            <CheckSquare size={16} color="var(--primary)" />
                                                        ) : (
                                                            <Square size={16} color="var(--text-muted)" />
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                                    {c.cheque || c.llave}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', whiteSpace: 'nowrap' }}>{c.fecha}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 500 }}>{c.a_nombre}</td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--primary)' }}>
                                                    ${formatMonto(c.valor)}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.concepto}>
                                                    {c.concepto || '-'}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    {isAnulado ? (
                                                        <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                                                            Anulado
                                                        </span>
                                                    ) : isReservado ? (
                                                        <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                                                            Reservado
                                                        </span>
                                                    ) : (
                                                        <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                                                            Normal
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePrintSingle(c)}
                                                        disabled={!currentFormato}
                                                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: currentFormato ? 'pointer' : 'not-allowed', padding: '0.2rem', display: 'inline-flex' }}
                                                        title="Imprimir este cheque individualmente"
                                                    >
                                                        <Printer size={15} />
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
            )}

            {/* Modal Reutilizable de Vista Previa */}
            <ReportPreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                title={previewTitle}
                subtitle={previewSubtitle}
                badge={previewBadge}
                icon={Printer}
                pdfSource={previewPdfBlob}
                fileName={previewFileName}
                totalPages={previewTotalPages}
                footerInfo={`Formato de cheque: ${currentFormato?.name || 'Estándar'} (${Math.round(currentFormato?.width || 152)} x ${Math.round(currentFormato?.height || 70)} mm) - Presentación Carta a página completa`}
                onPrint={() => {
                    const campos = currentFormato?.design_json?.campos || [];
                    PrintEngine.printBatch(currentFormato, campos, previewListaDatos, currentFormato?.printer_name || null);
                }}
            />
        </div>
    );
}
